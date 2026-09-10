use crate::codegen::compile_template_with_scope;
use crate::css::scope_css;
use crate::parser::parse_template;
use crate::ssr_codegen::compile_ssr_template;
use oxc_allocator::Allocator;
use oxc_ast::ast::Statement;
use oxc_parser::Parser;
use oxc_span::{GetSpan, SourceType};

#[derive(Debug, Default, Clone)]
pub struct SfcBlock {
    pub content: String,
    pub lang: Option<String>,
    pub scoped: bool,
}

#[derive(Debug, Default, Clone)]
pub struct SfcDescriptor {
    pub script: Option<SfcBlock>,
    pub template: Option<SfcBlock>,
    pub styles: Vec<SfcBlock>,
}

fn to_kebab_case(s: &str) -> String {
    let mut result = String::new();
    for (i, c) in s.chars().enumerate() {
        if c.is_uppercase() {
            if i > 0 {
                result.push('-');
            }
            result.push(c.to_ascii_lowercase());
        } else {
            result.push(c);
        }
    }
    result
}

/// Parses an Angora SFC (.angora) into script, template, and style blocks.
pub fn parse_sfc(source: &str) -> SfcDescriptor {
    let mut descriptor = SfcDescriptor::default();
    let mut remaining = source;
    let mut template_parts = Vec::new();

    while !remaining.is_empty() {
        let script_pos = remaining.find("<script");
        let style_pos = remaining.find("<style");
        let template_pos = remaining.find("<template");

        let mut next_tag_pos: Option<(usize, &str)> = None;

        for (pos, tag) in [
            (script_pos, "script"),
            (style_pos, "style"),
            (template_pos, "template"),
        ] {
            if let Some(p) = pos {
                if next_tag_pos.is_none() || p < next_tag_pos.unwrap().0 {
                    next_tag_pos = Some((p, tag));
                }
            }
        }

        if let Some((start_idx, tag_name)) = next_tag_pos {
            if start_idx > 0 {
                let leading = &remaining[..start_idx];
                if !leading.trim().is_empty() {
                    template_parts.push(leading);
                }
            }

            let after_open = &remaining[start_idx..];
            let open_end = match after_open.find('>') {
                Some(idx) => idx,
                None => break,
            };

            let tag_attrs = &after_open[..open_end];
            let scoped = tag_attrs.contains("scoped");
            let lang = if let Some(lang_idx) = tag_attrs.find("lang=") {
                let after_lang = &tag_attrs[lang_idx + 5..];
                let quote = after_lang.chars().next().unwrap_or('"');
                let end_quote = after_lang[1..].find(quote).unwrap_or(after_lang.len() - 1);
                Some(after_lang[1..end_quote + 1].to_string())
            } else {
                None
            };

            let content_start = start_idx + open_end + 1;
            let close_tag = format!("</{tag_name}>");
            let close_idx = match remaining[content_start..].find(&close_tag) {
                Some(idx) => content_start + idx,
                None => remaining.len(),
            };

            let block_content = remaining[content_start..close_idx].to_string();

            match tag_name {
                "script" => {
                    descriptor.script = Some(SfcBlock {
                        content: block_content,
                        lang,
                        scoped: false,
                    });
                }
                "style" => {
                    descriptor.styles.push(SfcBlock {
                        content: block_content,
                        lang,
                        scoped,
                    });
                }
                "template" => {
                    descriptor.template = Some(SfcBlock {
                        content: block_content,
                        lang,
                        scoped: false,
                    });
                }
                _ => {}
            }

            let next_start = if close_idx + close_tag.len() <= remaining.len() {
                close_idx + close_tag.len()
            } else {
                remaining.len()
            };
            remaining = &remaining[next_start..];
        } else {
            if !remaining.trim().is_empty() {
                template_parts.push(remaining);
            }
            break;
        }
    }

    if descriptor.template.is_none() && !template_parts.is_empty() {
        descriptor.template = Some(SfcBlock {
            content: template_parts.join(""),
            lang: None,
            scoped: false,
        });
    }

    descriptor
}

/// Compiles an Angora SFC (.angora) file into a high-performance JavaScript module.
pub fn compile_sfc(source: &str, file_name: Option<&str>) -> Result<String, String> {
    let descriptor = parse_sfc(source);

    let base_name = file_name
        .and_then(|f| std::path::Path::new(f).file_stem().and_then(|s| s.to_str()))
        .unwrap_or("App");

    let clean_stem = base_name.strip_suffix(".component").unwrap_or(base_name);
    let selector = to_kebab_case(clean_stem);
    let scope_id = format!(
        "_angora-{}",
        selector.replace(|c: char| !c.is_alphanumeric(), "-")
    );

    // Compile styles
    let mut compiled_styles = Vec::new();
    let has_scoped_styles = descriptor.styles.iter().any(|s| s.scoped);
    for style in &descriptor.styles {
        let css = if style.scoped {
            scope_css(&style.content, &scope_id)
        } else {
            style.content.clone()
        };
        compiled_styles.push(css);
    }

    // Compile template
    let template_content = descriptor.template.map(|t| t.content).unwrap_or_default();
    let scope_to_use = if has_scoped_styles {
        Some(scope_id.as_str())
    } else {
        None
    };

    let ast = parse_template(&template_content);
    let dom_render = compile_template_with_scope(&ast, scope_to_use);
    let ssr_render = compile_ssr_template(&ast, scope_to_use);

    // Handle script
    let mut imports_code = String::new();
    let mut setup_body = String::new();
    let mut returned_identifiers = Vec::new();

    if let Some(script_block) = descriptor.script {
        let script_src = script_block.content;
        let allocator = Allocator::default();
        let parser_ret = Parser::new(&allocator, &script_src, SourceType::ts()).parse();

        if parser_ret.panicked {
            return Err("Failed to parse <script> in SFC".to_string());
        }

        for stmt in &parser_ret.program.body {
            match stmt {
                Statement::ImportDeclaration(imp) => {
                    let span = imp.span();
                    imports_code.push_str(&script_src[span.start as usize..span.end as usize]);
                    imports_code.push('\n');
                }
                Statement::VariableDeclaration(var_decl) => {
                    let span = var_decl.span();
                    setup_body.push_str(&script_src[span.start as usize..span.end as usize]);
                    setup_body.push('\n');

                    for decl in &var_decl.declarations {
                        if let Some(name) = decl.id.get_identifier_name() {
                            returned_identifiers.push(name.to_string());
                        }
                    }
                }
                Statement::FunctionDeclaration(func) => {
                    let span = func.span();
                    setup_body.push_str(&script_src[span.start as usize..span.end as usize]);
                    setup_body.push('\n');

                    if let Some(id) = &func.id {
                        returned_identifiers.push(id.name.to_string());
                    }
                }
                other => {
                    let span = other.span();
                    setup_body.push_str(&script_src[span.start as usize..span.end as usize]);
                    setup_body.push('\n');
                }
            }
        }
    }

    let tmpl_escaped =
        serde_json::to_string(&template_content).unwrap_or_else(|_| "\"\"".to_string());
    let styles_escaped =
        serde_json::to_string(&compiled_styles).unwrap_or_else(|_| "[]".to_string());
    let return_obj = if returned_identifiers.is_empty() {
        "{}".to_string()
    } else {
        format!("{{ {} }}", returned_identifiers.join(", "))
    };

    let mut out = String::new();
    out.push_str("import { component } from '@angora-js/core';\n");
    if !imports_code.is_empty() {
        out.push_str(&imports_code);
        out.push('\n');
    }

    out.push_str(&format!(
        r#"const __angora_sfc__ = component({{
  selector: {:?},
  scopeId: {:?},
  template: {},
  styles: {},
  setup() {{
{}
    return {};
  }},
  render: {},
  ssrRender: {}
}});

export default __angora_sfc__;
"#,
        selector,
        scope_id,
        tmpl_escaped,
        styles_escaped,
        setup_body,
        return_obj,
        dom_render,
        ssr_render
    ));

    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_sfc_blocks() {
        let source = r#"
<script lang="ts">
import { signal } from '@angora-js/core';
const count = signal(0);
</script>

<button (click)="count.inc()">Count: {{ count }}</button>

<style scoped>
button { color: red; }
</style>
"#;
        let descriptor = parse_sfc(source);
        assert!(descriptor.script.is_some());
        assert!(descriptor
            .script
            .unwrap()
            .content
            .contains("const count = signal(0);"));
        assert!(descriptor.template.is_some());
        assert!(descriptor
            .template
            .unwrap()
            .content
            .contains("<button (click)=\"count.inc()\">"));
        assert_eq!(descriptor.styles.len(), 1);
        assert!(descriptor.styles[0].scoped);
        assert!(descriptor.styles[0].content.contains("color: red;"));
    }

    #[test]
    fn test_compile_sfc_output() {
        let source = r#"
<script>
import { signal } from '@angora-js/core';

const count = signal(0);
function increment() {
    count.inc();
}
</script>

<div class="counter">
  <h2>Count: {{ count }}</h2>
  <button (click)="increment()">+</button>
</div>

<style scoped>
.counter {
  padding: 1rem;
}
</style>
"#;
        let compiled = compile_sfc(source, Some("Counter.angora")).expect("SFC compile failed");
        assert!(compiled.contains("import { component } from '@angora-js/core';"));
        assert!(compiled.contains("selector: \"counter\""));
        assert!(compiled.contains("scopeId: \"_angora-counter\""));
        assert!(compiled.contains("return { count, increment };"));
        assert!(compiled.contains("__angora_render__"));
        assert!(compiled.contains("ssrRender: function __angora_ssr_render__"));
        assert!(compiled.contains("export default __angora_sfc__;"));
    }
}
