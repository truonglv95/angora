use crate::parser::parse_template;
use oxc_allocator::Allocator;
use oxc_parser::Parser;
use oxc_span::{GetSpan, SourceType};

pub enum TransformedEntity {
    Component(ComponentMetadata),
    Directive(DirectiveMetadata),
    Pipe(PipeMetadata),
    Injectable(InjectableMetadata),
}

pub struct ComponentMetadata {
    pub class_name: String,
    pub selector: String,
    pub imports_str: String,
    pub styles_raw: Vec<String>,
    pub template: String,
}

pub struct DirectiveMetadata {
    pub class_name: String,
    pub selector: String,
    pub host_str: Option<String>,
}

pub struct PipeMetadata {
    pub class_name: String,
    pub name: String,
    pub pure: bool,
}

pub struct InjectableMetadata {
    pub class_name: String,
    pub options_str: String,
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

fn extract_entity_metadata<'a>(
    class: &mut oxc_ast::ast::Class<'a>,
    source: &str,
) -> Option<TransformedEntity> {
    let class_name = class
        .id
        .as_ref()
        .map(|id| id.name.to_string())
        .unwrap_or_else(|| "AnonymousClass".to_string());

    let mut entity: Option<TransformedEntity> = None;

    // Inspect decorators on the class AST node
    for decorator in &class.decorators {
        match &decorator.expression {
            oxc_ast::ast::Expression::CallExpression(call) => {
                let decorator_name = match &call.callee {
                    oxc_ast::ast::Expression::Identifier(ident) => ident.name.as_str(),
                    _ => "",
                };

                match decorator_name {
                    "Component" => {
                        if let Some(arg) = call.arguments.first() {
                            if let Some(oxc_ast::ast::Expression::ObjectExpression(obj)) =
                                arg.as_expression()
                            {
                                let mut selector: Option<String> = None;
                                let mut template: Option<String> = None;
                                let mut imports_str = "[]".to_string();
                                let mut styles_raw = Vec::new();

                                for prop in &obj.properties {
                                    if let oxc_ast::ast::ObjectPropertyKind::ObjectProperty(p) =
                                        prop
                                    {
                                        let key_name = match &p.key {
                                            oxc_ast::ast::PropertyKey::StaticIdentifier(ident) => {
                                                Some(ident.name.as_str())
                                            }
                                            oxc_ast::ast::PropertyKey::Identifier(ident) => {
                                                Some(ident.name.as_str())
                                            }
                                            oxc_ast::ast::PropertyKey::StringLiteral(lit) => {
                                                Some(lit.value.as_str())
                                            }
                                            _ => None,
                                        };

                                        match key_name {
                                            Some("selector") => match &p.value {
                                                oxc_ast::ast::Expression::StringLiteral(lit) => {
                                                    selector = Some(lit.value.to_string());
                                                }
                                                oxc_ast::ast::Expression::TemplateLiteral(lit) => {
                                                    let s: String = lit
                                                        .quasis
                                                        .iter()
                                                        .map(|q| q.value.raw.as_str())
                                                        .collect();
                                                    selector = Some(s);
                                                }
                                                _ => {}
                                            },
                                            Some("template") => match &p.value {
                                                oxc_ast::ast::Expression::StringLiteral(lit) => {
                                                    template = Some(lit.value.to_string());
                                                }
                                                oxc_ast::ast::Expression::TemplateLiteral(lit) => {
                                                    let s: String = lit
                                                        .quasis
                                                        .iter()
                                                        .map(|q| q.value.raw.as_str())
                                                        .collect();
                                                    template = Some(s);
                                                }
                                                _ => {}
                                            },
                                            Some("imports") => {
                                                let span = p.value.span();
                                                imports_str = source
                                                    [span.start as usize..span.end as usize]
                                                    .to_string();
                                            }
                                            Some("styles") => {
                                                if let oxc_ast::ast::Expression::ArrayExpression(
                                                    arr,
                                                ) = &p.value
                                                {
                                                    for elem in &arr.elements {
                                                        if let Some(expr) = elem.as_expression() {
                                                            match expr {
                                                                oxc_ast::ast::Expression::StringLiteral(lit) => {
                                                                    styles_raw.push(lit.value.to_string());
                                                                }
                                                                oxc_ast::ast::Expression::TemplateLiteral(lit) => {
                                                                    let s: String = lit
                                                                        .quasis
                                                                        .iter()
                                                                        .map(|q| q.value.raw.as_str())
                                                                        .collect();
                                                                    styles_raw.push(s);
                                                                }
                                                                _ => {}
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                            _ => {}
                                        }
                                    }
                                }

                                let final_selector =
                                    selector.unwrap_or_else(|| to_kebab_case(&class_name));
                                if let Some(tmpl) = template {
                                    entity =
                                        Some(TransformedEntity::Component(ComponentMetadata {
                                            class_name: class_name.clone(),
                                            selector: final_selector,
                                            imports_str,
                                            styles_raw,
                                            template: tmpl,
                                        }));
                                    break;
                                }
                            }
                        }
                    }
                    "Directive" => {
                        let mut selector: Option<String> = None;
                        let mut host_str: Option<String> = None;

                        if let Some(arg) = call.arguments.first() {
                            if let Some(oxc_ast::ast::Expression::ObjectExpression(obj)) =
                                arg.as_expression()
                            {
                                for prop in &obj.properties {
                                    if let oxc_ast::ast::ObjectPropertyKind::ObjectProperty(p) =
                                        prop
                                    {
                                        let key_name = match &p.key {
                                            oxc_ast::ast::PropertyKey::StaticIdentifier(ident) => {
                                                Some(ident.name.as_str())
                                            }
                                            oxc_ast::ast::PropertyKey::Identifier(ident) => {
                                                Some(ident.name.as_str())
                                            }
                                            oxc_ast::ast::PropertyKey::StringLiteral(lit) => {
                                                Some(lit.value.as_str())
                                            }
                                            _ => None,
                                        };

                                        match key_name {
                                            Some("selector") => {
                                                if let oxc_ast::ast::Expression::StringLiteral(
                                                    lit,
                                                ) = &p.value
                                                {
                                                    selector = Some(lit.value.to_string());
                                                }
                                            }
                                            Some("host") => {
                                                let span = p.value.span();
                                                host_str = Some(
                                                    source[span.start as usize..span.end as usize]
                                                        .to_string(),
                                                );
                                            }
                                            _ => {}
                                        }
                                    }
                                }
                            }
                        }

                        let final_selector =
                            selector.unwrap_or_else(|| format!("[{}]", to_kebab_case(&class_name)));
                        entity = Some(TransformedEntity::Directive(DirectiveMetadata {
                            class_name: class_name.clone(),
                            selector: final_selector,
                            host_str,
                        }));
                        break;
                    }
                    "Pipe" => {
                        let mut pipe_name: Option<String> = None;
                        let mut pure = true;

                        if let Some(arg) = call.arguments.first() {
                            if let Some(oxc_ast::ast::Expression::ObjectExpression(obj)) =
                                arg.as_expression()
                            {
                                for prop in &obj.properties {
                                    if let oxc_ast::ast::ObjectPropertyKind::ObjectProperty(p) =
                                        prop
                                    {
                                        let key_name = match &p.key {
                                            oxc_ast::ast::PropertyKey::StaticIdentifier(ident) => {
                                                Some(ident.name.as_str())
                                            }
                                            oxc_ast::ast::PropertyKey::Identifier(ident) => {
                                                Some(ident.name.as_str())
                                            }
                                            oxc_ast::ast::PropertyKey::StringLiteral(lit) => {
                                                Some(lit.value.as_str())
                                            }
                                            _ => None,
                                        };

                                        match key_name {
                                            Some("name") => {
                                                if let oxc_ast::ast::Expression::StringLiteral(
                                                    lit,
                                                ) = &p.value
                                                {
                                                    pipe_name = Some(lit.value.to_string());
                                                }
                                            }
                                            Some("pure") => {
                                                if let oxc_ast::ast::Expression::BooleanLiteral(
                                                    lit,
                                                ) = &p.value
                                                {
                                                    pure = lit.value;
                                                }
                                            }
                                            _ => {}
                                        }
                                    }
                                }
                            }
                        }

                        let final_name = pipe_name.unwrap_or_else(|| to_kebab_case(&class_name));
                        entity = Some(TransformedEntity::Pipe(PipeMetadata {
                            class_name: class_name.clone(),
                            name: final_name,
                            pure,
                        }));
                        break;
                    }
                    "Injectable" => {
                        let mut options_str = "{}".to_string();
                        if let Some(arg) = call.arguments.first() {
                            let span = arg.span();
                            options_str =
                                source[span.start as usize..span.end as usize].to_string();
                        }
                        entity = Some(TransformedEntity::Injectable(InjectableMetadata {
                            class_name: class_name.clone(),
                            options_str,
                        }));
                        break;
                    }
                    _ => {}
                }
            }
            oxc_ast::ast::Expression::Identifier(ident) => {
                if ident.name == "Injectable" {
                    entity = Some(TransformedEntity::Injectable(InjectableMetadata {
                        class_name: class_name.clone(),
                        options_str: "{}".to_string(),
                    }));
                    break;
                }
            }
            _ => {}
        }
    }

    if entity.is_some() {
        // Strip Angora decorators from the AST class
        class.decorators.retain(|d| match &d.expression {
            oxc_ast::ast::Expression::CallExpression(call) => {
                if let oxc_ast::ast::Expression::Identifier(id) = &call.callee {
                    let n = id.name.as_str();
                    return n != "Component"
                        && n != "Directive"
                        && n != "Pipe"
                        && n != "Injectable";
                }
                true
            }
            oxc_ast::ast::Expression::Identifier(id) => {
                let n = id.name.as_str();
                n != "Injectable"
            }
            _ => true,
        });
    }

    entity
}

/// Transforms an Angora source file by compiling components, directives, pipes, and injectables
/// into pure zero-decorator TypeScript/JavaScript code using pure OXC AST.
pub fn transform_component(source: &str) -> Result<String, String> {
    // Fast path: if no Angora decorator token at all, skip parsing
    let has_angora_decorator = source.contains("@Component")
        || source.contains("@Directive")
        || source.contains("@Pipe")
        || source.contains("@Injectable");

    if !has_angora_decorator {
        return Ok(source.to_string());
    }

    let allocator = Allocator::default();
    let source_type = SourceType::ts();
    let mut parser_ret = Parser::new(&allocator, source, source_type).parse();

    if parser_ret.panicked {
        let err_msg = parser_ret
            .diagnostics
            .iter()
            .map(|e| format!("{:?}", e))
            .collect::<Vec<_>>()
            .join("; ");
        return Err(format!("OXC Parser panicked: {}", err_msg));
    }

    let mut entities = Vec::new();
    let mut needs_runtime = false;

    // Traverse AST statements to discover classes with decorators and strip them
    for stmt in parser_ret.program.body.iter_mut() {
        let class_opt = match stmt {
            oxc_ast::ast::Statement::ExportDeclaration(decl) => {
                if let oxc_ast::ast::Declaration::ClassDeclaration(class) = &mut decl.declaration {
                    Some(class.as_mut())
                } else {
                    None
                }
            }
            oxc_ast::ast::Statement::ClassDeclaration(class) => Some(class.as_mut()),
            oxc_ast::ast::Statement::ExportDefaultDeclaration(decl) => {
                if let oxc_ast::ast::ExportDefaultDeclarationKind::ClassDeclaration(class) =
                    &mut decl.declaration
                {
                    Some(class.as_mut())
                } else {
                    None
                }
            }
            _ => None,
        };

        if let Some(class) = class_opt {
            if let Some(entity) = extract_entity_metadata(class, source) {
                let static_snippet = match &entity {
                    TransformedEntity::Component(comp) => {
                        needs_runtime = true;

                        let (styles_str, scope_id, scoped_css_literal) =
                            if !comp.styles_raw.is_empty() {
                                let clean_sel =
                                    comp.selector.replace(|c: char| !c.is_alphanumeric(), "-");
                                let s_id = format!("_angora-{}", clean_sel);
                                let combined = comp.styles_raw.join("\n");
                                let scoped = crate::css::scope_css(&combined, &s_id);
                                let scoped_json = serde_json::to_string(&scoped)
                                    .unwrap_or_else(|_| "\"\"".to_string());
                                (format!("[{}]", scoped_json), Some(s_id), Some(scoped_json))
                            } else {
                                ("[]".to_string(), None, None)
                            };

                        let template_ast = parse_template(&comp.template);
                        let render_fn_body = crate::codegen::compile_template_with_scope(
                            &template_ast,
                            scope_id.as_deref(),
                        );

                        let sid_val = scope_id
                            .as_ref()
                            .map(|s| format!("'{}'", s))
                            .unwrap_or_else(|| "undefined".to_string());

                        let scope_props = if let (Some(ref sid), Some(ref scoped_json)) =
                            (scope_id.as_ref(), scoped_css_literal.as_ref())
                        {
                            format!(
                                "static __angora_scope_id__ = '{}';\nstatic __angora_styles__ = {};\n",
                                sid, scoped_json
                            )
                        } else if let Some(ref sid) = scope_id {
                            format!("static __angora_scope_id__ = '{}';\n", sid)
                        } else {
                            String::new()
                        };

                        format!(
                            r#"class _AngoraHelper {{
  static ɵcmp = {{
    selector: '{sel}',
    imports: {imp},
    styles: {styles},
    scopeId: {sid_val},
    render: {render},
    type: {cn},
    metadata: {{
      selector: '{sel}',
      imports: {imp},
      styles: {styles},
    }},
  }};
  {scope_props}
}}"#,
                            cn = comp.class_name,
                            sel = comp.selector,
                            imp = comp.imports_str,
                            styles = styles_str,
                            sid_val = sid_val,
                            render = render_fn_body,
                            scope_props = scope_props
                        )
                    }
                    TransformedEntity::Directive(dir) => {
                        let host_val = dir.host_str.as_deref().unwrap_or("{}");
                        format!(
                            r#"class _AngoraHelper {{
  static ɵdir = {{
    selector: '{sel}',
    host: {host},
    type: {cn},
    metadata: {{
      selector: '{sel}',
      host: {host},
    }},
  }};
}}"#,
                            cn = dir.class_name,
                            sel = dir.selector,
                            host = host_val
                        )
                    }
                    TransformedEntity::Pipe(pipe) => {
                        format!(
                            r#"class _AngoraHelper {{
  static ɵpipe = {{
    name: '{name}',
    pure: {pure},
    type: {cn},
    metadata: {{
      name: '{name}',
      pure: {pure},
    }},
  }};
}}"#,
                            cn = pipe.class_name,
                            name = pipe.name,
                            pure = pipe.pure
                        )
                    }
                    TransformedEntity::Injectable(inj) => {
                        format!(
                            r#"class _AngoraHelper {{
  static ɵprov = {opts};
}}"#,
                            opts = inj.options_str
                        )
                    }
                };

                let allocated_snippet = allocator.alloc_str(&static_snippet);
                let mut helper_parsed =
                    Parser::new(&allocator, allocated_snippet, SourceType::ts()).parse();
                if let Some(oxc_ast::ast::Statement::ClassDeclaration(helper_cls)) =
                    helper_parsed.program.body.first_mut()
                {
                    class.body.body.append(&mut helper_cls.body.body);
                }

                entities.push(entity);
            }
        }
    }

    // If no Angora decorator was matched on any class, return source untouched
    if entities.is_empty() {
        return Ok(source.to_string());
    }

    // Generate clean code from AST with Angora decorators removed and static members injected
    let codegen_out = oxc_codegen::Codegen::new().build(&parser_ret.program);
    let transformed_code = codegen_out.code;

    // Generate style injection attachments if scoped styles are present
    let mut attachments = String::new();
    for entity in &entities {
        if let TransformedEntity::Component(comp) = entity {
            if !comp.styles_raw.is_empty() {
                let clean_sel = comp.selector.replace(|c: char| !c.is_alphanumeric(), "-");
                let s_id = format!("_angora-{}", clean_sel);
                let combined = comp.styles_raw.join("\n");
                let scoped = crate::css::scope_css(&combined, &s_id);
                let scoped_json =
                    serde_json::to_string(&scoped).unwrap_or_else(|_| "\"\"".to_string());
                attachments.push_str(&format!(
                    "\ninjectComponentStyles('{}', {});\n",
                    s_id, scoped_json
                ));
            }

            // Tree-shakable pure IIFE for DevTools debug inspection
            let tmpl_escaped =
                serde_json::to_string(&comp.template).unwrap_or_else(|_| "\"\"".to_string());
            let sid_snippet = if !comp.styles_raw.is_empty() {
                let clean_sel = comp.selector.replace(|c: char| !c.is_alphanumeric(), "-");
                format!("'_angora-{}'", clean_sel)
            } else {
                "undefined".to_string()
            };
            attachments.push_str(&format!(
                r#"
/*@__PURE__*/ (() => {{
  if (typeof ngDevMode === 'undefined' || ngDevMode) {{
    ({cn} as any).ɵcmp.debug = {{
      name: '{cn}',
      selector: '{sel}',
      scopeId: {sid},
      template: {tmpl},
    }};
  }}
}})();
"#,
                cn = comp.class_name,
                sel = comp.selector,
                sid = sid_snippet,
                tmpl = tmpl_escaped
            ));
        }
    }

    let mut prefix_imports = String::new();
    if needs_runtime {
        prefix_imports.push_str("import { createElement, createText, createComment, bindText, bindProp, bindClass, bindStyle, bindTwoWay, bindEvent, createIf, createFor, createSwitch, createDefer, applyPipe, mountComponent, injectComponentStyles, template, applyMatchingDirectives } from '@angora-js/runtime';\n");
    }

    Ok(format!(
        "{}{}\n{}",
        prefix_imports, transformed_code, attachments
    ))
}
