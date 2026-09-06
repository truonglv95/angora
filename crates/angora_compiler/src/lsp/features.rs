use super::analyzer::{analyze_components_lsp, LspPosition, LspRange};
use super::template_parser::parse_template_document;
use super::type_checker::{
    check_template_types, collect_template_scope, extract_left_hand_expression,
    get_builtin_type_def, get_expected_property_type, infer_expression_type, LspDiagnostic,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspHover {
    pub contents: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub range: Option<LspRange>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspCompletion {
    pub label: String,
    pub kind: String,
    pub detail: String,
    pub insert_text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub documentation: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspDefinition {
    pub uri: String,
    pub range: LspRange,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub symbol: Option<String>,
}

pub fn get_hover_docs() -> HashMap<&'static str, &'static str> {
    let mut map = HashMap::new();
    map.insert("@if", "### Angora `@if` Control Flow Block\nRenders nested DOM nodes conditionally based on a reactive signal or boolean expression.\n```html\n@if (isLoggedIn()) {\n  <p>Welcome back!</p>\n} @else {\n  <button>Login</button>\n}\n```");
    map.insert("@for", "### Angora `@for` Keyed List Block\nRenders lists with fine-grained DOM reconciliation and hardware-accelerated tracking.\n```html\n@for (user of users(); track user.id) {\n  <li>{{ user.name }}</li>\n} @empty {\n  <p>No users found</p>\n}\n```");
    map.insert("@switch", "### Angora `@switch` Selection Block\nConditionally matches cases against a reactive expression.\n```html\n@switch (status()) {\n  @case ('admin') { <admin-panel /> }\n  @default { <user-panel /> }\n}\n```");
    map.insert("@defer", "### Angora `@defer` Deferrable Views\nLazily loads and renders non-critical template views based on idle, viewport, timer, or user interaction.\n```html\n@defer (on viewport; prefetch on idle) {\n  <large-chart />\n} @placeholder {\n  <skeleton />\n}\n```");
    map.insert(
        "uppercase",
        "### `uppercase` Pipe\nTransforms input string to uppercase: `{{ text | uppercase }}`",
    );
    map.insert(
        "lowercase",
        "### `lowercase` Pipe\nTransforms input string to lowercase: `{{ text | lowercase }}`",
    );
    map.insert("currency", "### `currency` Pipe\nFormats numerical signals to localized currency: `{{ price() | currency:'USD' }}`");
    map.insert("date", "### `date` Pipe\nFormats Date or timestamp value into localized date string: `{{ dateVal | date:'medium' }}`");
    map.insert("json", "### `json` Pipe\nSerializes objects into formatted JSON string for debugging: `<pre>{{ data | json }}</pre>`");
    map.insert(
        "slice",
        "### `slice` Pipe\nSlices array or string by start and end index: `{{ list | slice:0:5 }}`",
    );
    map.insert(
        "async",
        "### `async` Pipe\nUnwraps Promise or Observable values automatically.",
    );
    map
}

pub fn get_builtin_completions() -> Vec<LspCompletion> {
    vec![
        LspCompletion {
            label: "@if".to_string(),
            kind: "Snippet".to_string(),
            detail: "Angora Control Flow @if block".to_string(),
            insert_text: "@if (${1:condition}) {\n  $0\n}".to_string(),
            documentation: Some("Conditionally renders DOM based on a reactive signal or expression.".to_string()),
        },
        LspCompletion {
            label: "@for".to_string(),
            kind: "Snippet".to_string(),
            detail: "Angora Control Flow @for loop".to_string(),
            insert_text: "@for (${1:item} of ${2:items}(); track ${1:item}.${3:id}) {\n  $0\n}".to_string(),
            documentation: Some("Keyed list iteration block with fine-grained reactivity.".to_string()),
        },
        LspCompletion {
            label: "@switch".to_string(),
            kind: "Snippet".to_string(),
            detail: "Angora Control Flow @switch block".to_string(),
            insert_text: "@switch (${1:expression}()) {\n  @case (${2:value}) {\n    $0\n  }\n  @default {\n  }\n}".to_string(),
            documentation: Some("Structural switch-case block.".to_string()),
        },
        LspCompletion {
            label: "@defer".to_string(),
            kind: "Snippet".to_string(),
            detail: "Angora Deferrable View".to_string(),
            insert_text: "@defer (on ${1|viewport,idle,interaction,timer(2s)|}) {\n  $0\n} @placeholder {\n}".to_string(),
            documentation: Some("Defers loading and rendering of non-critical UI chunks.".to_string()),
        },
        LspCompletion {
            label: "uppercase".to_string(),
            kind: "Function".to_string(),
            detail: "Pipe: uppercase".to_string(),
            insert_text: "uppercase".to_string(),
            documentation: Some("Transforms string to uppercase.".to_string()),
        },
        LspCompletion {
            label: "lowercase".to_string(),
            kind: "Function".to_string(),
            detail: "Pipe: lowercase".to_string(),
            insert_text: "lowercase".to_string(),
            documentation: Some("Transforms string to lowercase.".to_string()),
        },
        LspCompletion {
            label: "currency".to_string(),
            kind: "Function".to_string(),
            detail: "Pipe: currency".to_string(),
            insert_text: "currency:'USD'".to_string(),
            documentation: Some("Formats number to localized currency string.".to_string()),
        },
        LspCompletion {
            label: "date".to_string(),
            kind: "Function".to_string(),
            detail: "Pipe: date".to_string(),
            insert_text: "date:'medium'".to_string(),
            documentation: Some("Formats Date or timestamp into localized string.".to_string()),
        },
        LspCompletion {
            label: "json".to_string(),
            kind: "Function".to_string(),
            detail: "Pipe: json".to_string(),
            insert_text: "json".to_string(),
            documentation: Some("Converts value into formatted JSON string.".to_string()),
        },
    ]
}

fn is_position_in_range(pos: &LspPosition, range: &LspRange) -> bool {
    if pos.line < range.start.line || pos.line > range.end.line {
        return false;
    }
    if pos.line == range.start.line && pos.character < range.start.character {
        return false;
    }
    if pos.line == range.end.line && pos.character > range.end.character {
        return false;
    }
    true
}

fn resolve_module_uri(current_uri: &str, module_path: &str) -> String {
    let resolved = crate::lsp::analyzer::resolve_imported_files(Some(current_uri), module_path);
    if let Some(first) = resolved.first() {
        return format!("file://{}", first.display());
    }

    if !current_uri.contains('/') {
        return module_path.to_string();
    }
    let last_slash = current_uri.rfind('/').unwrap();
    let dir = &current_uri[..last_slash];
    let mut target = module_path.to_string();
    if target.starts_with("./") {
        target = format!("{}/{}", dir, &target[2..]);
    } else if target.starts_with("../") {
        target = format!("{}/{}", dir, target);
    }
    if !target.ends_with(".ts") && !target.ends_with(".js") {
        target.push_str(".ts");
    }
    target
}

pub struct AngoraLanguageEngine;

impl AngoraLanguageEngine {
    pub fn get_diagnostics(uri: &str, content: &str) -> Vec<LspDiagnostic> {
        let analysis = analyze_components_lsp(content, Some(uri.to_string()));
        let mut all_diags = Vec::new();

        for comp in &analysis.components {
            if let Some(tmpl) = &comp.template {
                let parsed = parse_template_document(&tmpl.content, tmpl.offset as usize, content);
                let diags = check_template_types(&parsed, comp, &analysis.type_defs, Some(content));
                all_diags.extend(diags);
            }
        }

        all_diags
    }

    pub fn get_hover(uri: &str, content: &str, pos: &LspPosition) -> Option<LspHover> {
        let hover_docs = get_hover_docs();
        let analysis = analyze_components_lsp(content, Some(uri.to_string()));

        for comp in &analysis.components {
            if let Some(tmpl) = &comp.template {
                let parsed = parse_template_document(&tmpl.content, tmpl.offset as usize, content);
                let scope = collect_template_scope(&parsed, comp, &analysis.type_defs);

                // Find token at pos
                for tok in &parsed.tokens {
                    if is_position_in_range(pos, &tok.file_range) {
                        let text = tok.text.trim();

                        // 1. Keyword / pipe docs
                        if let Some(&doc) = hover_docs.get(text) {
                            return Some(LspHover {
                                contents: doc.to_string(),
                                range: Some(tok.file_range.clone()),
                            });
                        }

                        // 2. Scope variable
                        if let Some(sv) = scope.get(text) {
                            let doc = sv.docstring.as_deref().unwrap_or("");
                            let prefix = if text.starts_with('$') {
                                format!("(context variable) {}", sv.name)
                            } else if sv.docstring.as_deref().unwrap_or("").contains("reference") {
                                format!("(reference) #{}", sv.name)
                            } else {
                                format!("(parameter) {}", sv.name)
                            };
                            let header = format!("{}: {}", prefix, sv.r#type);
                            let full = if doc.is_empty() {
                                format!("```typescript\n{}\n```", header)
                            } else {
                                format!("```typescript\n{}\n```\n\n{}", header, doc)
                            };
                            return Some(LspHover {
                                contents: full,
                                range: Some(tok.file_range.clone()),
                            });
                        }

                        // 3. Component property
                        if let Some(prop) = comp.properties.iter().find(|p| p.name == text) {
                            let type_display = if prop.is_signal {
                                if prop.is_input.unwrap_or(false) {
                                    format!("InputSignal<{}>", prop.unwrapped_type)
                                } else {
                                    format!("Signal<{}>", prop.unwrapped_type)
                                }
                            } else if prop.is_output.unwrap_or(false) {
                                if prop.unwrapped_type.starts_with("OutputEmitter<") {
                                    prop.unwrapped_type.clone()
                                } else {
                                    format!("OutputEmitter<{}>", prop.unwrapped_type)
                                }
                            } else {
                                prop.raw_type.clone()
                            };

                            let doc = prop.docstring.as_deref().unwrap_or("");
                            return Some(LspHover {
                                contents: format!(
                                    "(property) {}.{}: {}\n\n{}",
                                    comp.class_name, prop.name, type_display, doc
                                )
                                .trim()
                                .to_string(),
                                range: Some(tok.file_range.clone()),
                            });
                        }

                        // 4. Component method
                        if let Some(m) = comp.methods.iter().find(|m| m.name == text) {
                            let doc = m.docstring.as_deref().unwrap_or("");
                            return Some(LspHover {
                                contents: format!(
                                    "(method) {}.{}{}\n\n{}",
                                    comp.class_name, m.name, m.signature, doc
                                )
                                .trim()
                                .to_string(),
                                range: Some(tok.file_range.clone()),
                            });
                        }

                        // 5. Element attribute [disabled]
                        if tok.kind == "property" {
                            if let Some(parent_el) = &tok.parent_element {
                                if let Some(exp) = get_expected_property_type(parent_el, text) {
                                    let tag_cap = {
                                        let mut c = parent_el.chars();
                                        match c.next() {
                                            None => String::new(),
                                            Some(f) => {
                                                f.to_uppercase().collect::<String>() + c.as_str()
                                            }
                                        }
                                    };
                                    let tag_class = format!("HTML{}Element", tag_cap);
                                    return Some(LspHover {
                                        contents: format!(
                                            "```typescript\n(property) {}.{}: {}\n```",
                                            tag_class, text, exp
                                        ),
                                        range: Some(tok.file_range.clone()),
                                    });
                                }
                            }
                        }

                        // 5b. Custom Element Tag hover (e.g. <app-todo-item>, <user-profile>)
                        if tok.kind == "tag" {
                            let clean_tag = text.replace('-', "").to_lowercase();
                            let tag_stripped = text
                                .split_once('-')
                                .map(|(_, rest)| rest.replace('-', "").to_lowercase())
                                .unwrap_or_default();

                            let mut candidate_symbols = Vec::new();
                            if let Some(ref c_imps) = comp.component_imports {
                                for ci in c_imps {
                                    candidate_symbols.push(ci.clone());
                                }
                            }
                            for td in &analysis.type_defs {
                                if td.kind == "component" && !candidate_symbols.contains(&td.name) {
                                    candidate_symbols.push(td.name.clone());
                                }
                            }

                            let mut matched_symbol: Option<String> = None;
                            for sym in &candidate_symbols {
                                let sym_clean = sym
                                    .replace("Component", "")
                                    .replace("Directive", "")
                                    .replace('-', "")
                                    .to_lowercase();
                                if sym_clean == clean_tag
                                    || (!tag_stripped.is_empty() && sym_clean == tag_stripped)
                                    || analysis.type_defs.iter().any(|t| {
                                        t.name == *sym && t.raw_type.as_deref() == Some(text)
                                    })
                                {
                                    matched_symbol = Some(sym.clone());
                                    break;
                                }
                            }

                            if matched_symbol.is_none() {
                                let mut best_match: Option<(usize, String)> = None;
                                for sym in &candidate_symbols {
                                    let sym_clean = sym
                                        .replace("Component", "")
                                        .replace("Directive", "")
                                        .replace('-', "")
                                        .to_lowercase();
                                    if !sym_clean.is_empty() && clean_tag.contains(&sym_clean) {
                                        let len = sym_clean.len();
                                        if best_match.as_ref().map_or(true, |(bl, _)| len > *bl) {
                                            best_match = Some((len, sym.clone()));
                                        }
                                    }
                                }
                                matched_symbol = best_match.map(|(_, s)| s);
                            }

                            if let Some(comp_name) = matched_symbol {
                                let comp_td =
                                    analysis.type_defs.iter().find(|t| t.name == comp_name);
                                let mut hover_text = format!("```typescript\n@Component({{\n  selector: '{}'\n}})\nexport class {}\n```", text, comp_name);

                                if let Some(td) = comp_td {
                                    let inputs: Vec<_> = td
                                        .properties
                                        .iter()
                                        .filter(|p| {
                                            p.is_signal.unwrap_or(false)
                                                && p.r#type.contains("InputSignal")
                                        })
                                        .collect();
                                    let outputs: Vec<_> = td
                                        .properties
                                        .iter()
                                        .filter(|p| p.r#type.contains("OutputEmitter"))
                                        .collect();

                                    if !inputs.is_empty() || !outputs.is_empty() {
                                        hover_text.push_str("\n\n**Bindings:**\n");
                                        for inp in inputs {
                                            let unwrapped = inp
                                                .unwrapped_type
                                                .as_deref()
                                                .unwrap_or(&inp.r#type);
                                            hover_text.push_str(&format!(
                                                "- `@Input() [{}]`: `{}`\n",
                                                inp.name, unwrapped
                                            ));
                                        }
                                        for out in outputs {
                                            let unwrapped = out
                                                .unwrapped_type
                                                .as_deref()
                                                .unwrap_or(&out.r#type);
                                            hover_text.push_str(&format!(
                                                "- `@Output() ({})`: `{}`\n",
                                                out.name, unwrapped
                                            ));
                                        }
                                    }
                                }

                                return Some(LspHover {
                                    contents: hover_text,
                                    range: Some(tok.file_range.clone()),
                                });
                            }
                        }

                        // 6. Member token on object (e.g. userControl.value().id or toastService.toasts)
                        if tok.kind == "member" {
                            let type_defs = &analysis.type_defs;

                            // Infer parent type from left hand expression before the member
                            let char_idx = tok.file_range.start.character as usize;
                            let lines: Vec<&str> = content.lines().collect();
                            let mut parent_type_opt: Option<String> = None;
                            if (tok.file_range.start.line as usize) < lines.len() {
                                let line = lines[tok.file_range.start.line as usize];
                                let prefix =
                                    &line[..char_idx.min(line.len())].trim_end_matches('.');
                                let left_expr = extract_left_hand_expression(prefix);
                                let inferred =
                                    infer_expression_type(&left_expr, comp, &scope, type_defs);
                                if inferred.r#type != "any" {
                                    let mut t = inferred.r#type;
                                    if t.starts_with("Signal<") && t.ends_with('>') {
                                        t = t[7..t.len() - 1].to_string();
                                    }
                                    parent_type_opt = Some(t);
                                }
                            }

                            // Special handling for .length
                            if text == "length" {
                                let parent_type_display =
                                    parent_type_opt.unwrap_or_else(|| "Array".to_string());
                                return Some(LspHover {
                                    contents: format!(
                                        "```typescript\n(property) {}.length: number\n```",
                                        parent_type_display
                                    ),
                                    range: Some(tok.file_range.clone()),
                                });
                            }

                            // 1. If parent_type is known, look up specifically in that type definition first!
                            if let Some(ref pt) = parent_type_opt {
                                let builtin_td = get_builtin_type_def(pt);
                                let matched_td = type_defs
                                    .iter()
                                    .find(|t| &t.name == pt || pt.starts_with(&t.name))
                                    .or(builtin_td.as_ref());
                                if let Some(td) = matched_td {
                                    if let Some(p) = td.properties.iter().find(|p| p.name == text) {
                                        let doc = p.docstring.as_deref().unwrap_or("");
                                        let mut sig = if p.is_signal.unwrap_or(false) {
                                            let unwrapped =
                                                p.unwrapped_type.as_deref().unwrap_or(&p.r#type);
                                            unwrapped.to_string()
                                        } else {
                                            p.r#type.clone()
                                        };
                                        if p.name == "value"
                                            && (td.name == "FormControl"
                                                || td.name.starts_with("FormControl<"))
                                        {
                                            if let Some(open) = pt.find('<') {
                                                if let Some(close) = pt.rfind('>') {
                                                    if close > open + 1 {
                                                        sig = pt[open + 1..close].to_string();
                                                    }
                                                }
                                            }
                                        }
                                        let display_type_name = if td.name == "FormControl"
                                            && pt.starts_with("FormControl<")
                                        {
                                            pt.as_str()
                                        } else {
                                            &td.name
                                        };
                                        let header = format!(
                                            "(property) {}.{}: {}",
                                            display_type_name, p.name, sig
                                        );
                                        let mut full = format!("```typescript\n{}\n```", header);
                                        if !doc.is_empty() {
                                            full.push_str("\n\n");
                                            full.push_str(doc);
                                        }
                                        if let Some(alias) = type_defs
                                            .iter()
                                            .find(|t| t.name == sig && t.kind == "type")
                                        {
                                            if let Some(raw) = &alias.raw_type {
                                                full.push_str(&format!(
                                                    "\n\n`type {} = {}`",
                                                    alias.name, raw
                                                ));
                                            }
                                        }
                                        return Some(LspHover {
                                            contents: full,
                                            range: Some(tok.file_range.clone()),
                                        });
                                    }
                                    if let Some(m) = td.methods.iter().find(|m| m.name == text) {
                                        let doc = m.docstring.as_deref().unwrap_or("");
                                        let mut sig = m
                                            .signature
                                            .as_deref()
                                            .unwrap_or("(): void")
                                            .to_string();
                                        if m.name == "setValue"
                                            && (td.name == "FormControl"
                                                || td.name.starts_with("FormControl<"))
                                        {
                                            if let Some(open) = pt.find('<') {
                                                if let Some(close) = pt.rfind('>') {
                                                    if close > open + 1 {
                                                        let inner = &pt[open + 1..close];
                                                        sig =
                                                            format!("(newValue: {}): void", inner);
                                                    }
                                                }
                                            }
                                        }
                                        let display_type_name = if td.name == "FormControl"
                                            && pt.starts_with("FormControl<")
                                        {
                                            pt.as_str()
                                        } else {
                                            &td.name
                                        };
                                        let header = format!(
                                            "(method) {}.{}{}",
                                            display_type_name, m.name, sig
                                        );
                                        let full = if doc.is_empty() {
                                            format!("```typescript\n{}\n```", header)
                                        } else {
                                            format!("```typescript\n{}\n```\n\n{}", header, doc)
                                        };
                                        return Some(LspHover {
                                            contents: full,
                                            range: Some(tok.file_range.clone()),
                                        });
                                    }
                                }
                            }

                            // 2. Fallback: Search all type definitions for matching property or method
                            for td in type_defs {
                                if let Some(p) = td.properties.iter().find(|p| p.name == text) {
                                    let doc = p.docstring.as_deref().unwrap_or("");
                                    let sig = if p.is_signal.unwrap_or(false) {
                                        let unwrapped =
                                            p.unwrapped_type.as_deref().unwrap_or(&p.r#type);
                                        unwrapped.to_string()
                                    } else {
                                        p.r#type.clone()
                                    };
                                    let header =
                                        format!("(property) {}.{}: {}", td.name, p.name, sig);
                                    let mut full = format!("```typescript\n{}\n```", header);
                                    if !doc.is_empty() {
                                        full.push_str("\n\n");
                                        full.push_str(doc);
                                    }
                                    // If property type is a type alias (e.g. ToastType), append its definition
                                    if let Some(alias) =
                                        type_defs.iter().find(|t| t.name == sig && t.kind == "type")
                                    {
                                        if let Some(raw) = &alias.raw_type {
                                            full.push_str(&format!(
                                                "\n\n`type {} = {}`",
                                                alias.name, raw
                                            ));
                                        }
                                    }
                                    return Some(LspHover {
                                        contents: full,
                                        range: Some(tok.file_range.clone()),
                                    });
                                }
                                if let Some(m) = td.methods.iter().find(|m| m.name == text) {
                                    let doc = m.docstring.as_deref().unwrap_or("");
                                    let sig = m.signature.as_deref().unwrap_or("(): void");
                                    let header = format!("(method) {}.{}{}", td.name, m.name, sig);
                                    let full = if doc.is_empty() {
                                        format!("```typescript\n{}\n```", header)
                                    } else {
                                        format!("```typescript\n{}\n```\n\n{}", header, doc)
                                    };
                                    return Some(LspHover {
                                        contents: full,
                                        range: Some(tok.file_range.clone()),
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        None
    }

    pub fn get_completions(uri: &str, content: &str, pos: &LspPosition) -> Vec<LspCompletion> {
        let mut completions = get_builtin_completions();
        let analysis = analyze_components_lsp(content, Some(uri.to_string()));

        let lines: Vec<&str> = content.lines().collect();
        if (pos.line as usize) < lines.len() {
            let line = lines[pos.line as usize];
            let char_idx = (pos.character as usize).min(line.len());
            let line_prefix = &line[..char_idx];

            if let Some(dot_idx) = line_prefix.rfind('.') {
                let left = extract_left_hand_expression(&line_prefix[..dot_idx]);
                let prefix = &line_prefix[dot_idx + 1..].trim();

                // 1. Completion on this.
                if left == "this" {
                    if let Some(comp) = analysis.components.first() {
                        for p in &comp.properties {
                            completions.push(LspCompletion {
                                label: p.name.clone(),
                                kind: "Property".to_string(),
                                detail: format!("{}.{}: {}", comp.class_name, p.name, p.raw_type),
                                insert_text: p.name.clone(),
                                documentation: p.docstring.clone(),
                            });
                        }
                        for m in &comp.methods {
                            completions.push(LspCompletion {
                                label: format!("{}()", m.name),
                                kind: "Method".to_string(),
                                detail: format!("{}.{}{}", comp.class_name, m.name, m.signature),
                                insert_text: format!("{}($0)", m.name),
                                documentation: m.docstring.clone(),
                            });
                        }
                    }
                }

                // 2. Completion on members (FormControl, FormGroup, properties, scope variables)
                if let Some(comp) = analysis.components.first() {
                    let scope = if let Some(tmpl) = &comp.template {
                        let parsed =
                            parse_template_document(&tmpl.content, tmpl.offset as usize, content);
                        collect_template_scope(&parsed, comp, &analysis.type_defs)
                    } else {
                        HashMap::new()
                    };
                    let mut parent_type: Option<String> = None;
                    if let Some(p) = comp.properties.iter().find(|p| p.name == left) {
                        parent_type = Some(p.raw_type.clone());
                    } else if left.ends_with(".value()") {
                        let inner_prop = left[..left.len() - 8].trim();
                        if let Some(p) = comp.properties.iter().find(|p| p.name == inner_prop) {
                            if p.raw_type.starts_with("FormControl<") {
                                parent_type =
                                    Some(p.raw_type[12..p.raw_type.len() - 1].to_string());
                            } else {
                                parent_type = Some("string".to_string());
                            }
                        }
                    } else {
                        let inferred =
                            infer_expression_type(&left, comp, &scope, &analysis.type_defs);
                        if inferred.r#type != "any" && !inferred.r#type.is_empty() {
                            parent_type = Some(inferred.r#type);
                        }
                    }

                    if let Some(pt) = parent_type {
                        let clean = pt.split('<').next().unwrap_or(&pt).trim();
                        let type_def = analysis
                            .type_defs
                            .iter()
                            .find(|td| td.name == clean || td.name == pt)
                            .cloned()
                            .or_else(|| get_builtin_type_def(&pt));

                        if let Some(td) = type_def {
                            for p in &td.properties {
                                let label = if p.is_signal.unwrap_or(false) {
                                    format!("{}()", p.name)
                                } else {
                                    p.name.clone()
                                };
                                completions.push(LspCompletion {
                                    label: label.clone(),
                                    kind: "Property".to_string(),
                                    detail: format!("{}.{}: {}", td.name, p.name, p.r#type),
                                    insert_text: label,
                                    documentation: None,
                                });
                            }
                            for m in &td.methods {
                                completions.push(LspCompletion {
                                    label: format!("{}()", m.name),
                                    kind: "Method".to_string(),
                                    detail: format!("{}.{}()", td.name, m.name),
                                    insert_text: format!("{}($0)", m.name),
                                    documentation: None,
                                });
                            }
                        }
                    }
                }

                if !prefix.is_empty() {
                    let low_prefix = prefix.to_lowercase();
                    completions.retain(|c| c.label.to_lowercase().contains(&low_prefix));
                }
                return completions;
            }
        }

        // Add component properties and methods
        if let Some(comp) = analysis.components.first() {
            for p in &comp.properties {
                completions.push(LspCompletion {
                    label: p.name.clone(),
                    kind: "Property".to_string(),
                    detail: format!("{}.{}: {}", comp.class_name, p.name, p.raw_type),
                    insert_text: p.name.clone(),
                    documentation: p.docstring.clone(),
                });
            }
            for m in &comp.methods {
                completions.push(LspCompletion {
                    label: format!("{}()", m.name),
                    kind: "Method".to_string(),
                    detail: format!("{}.{}{}", comp.class_name, m.name, m.signature),
                    insert_text: format!("{}($0)", m.name),
                    documentation: m.docstring.clone(),
                });
            }
            if let Some(tmpl) = &comp.template {
                let parsed = parse_template_document(&tmpl.content, tmpl.offset as usize, content);
                let scope = collect_template_scope(&parsed, comp, &analysis.type_defs);
                for (name, sv) in scope {
                    completions.push(LspCompletion {
                        label: name.clone(),
                        kind: "Variable".to_string(),
                        detail: format!("{}: {}", name, sv.r#type),
                        insert_text: name,
                        documentation: sv.docstring,
                    });
                }
            }
        }

        completions
    }

    pub fn get_definition(uri: &str, content: &str, pos: &LspPosition) -> Vec<LspDefinition> {
        let analysis = analyze_components_lsp(content, Some(uri.to_string()));
        let mut defs = Vec::new();

        for comp in &analysis.components {
            if let Some(tmpl) = &comp.template {
                let parsed = parse_template_document(&tmpl.content, tmpl.offset as usize, content);

                for tok in &parsed.tokens {
                    if is_position_in_range(pos, &tok.file_range) {
                        let text = tok.text.trim();

                        // 1. Component property
                        if let Some(p) = comp.properties.iter().find(|p| p.name == text) {
                            defs.push(LspDefinition {
                                uri: uri.to_string(),
                                range: p.range.clone(),
                                symbol: Some(p.name.clone()),
                            });
                            return defs;
                        }

                        // 2. Component method
                        if let Some(m) = comp.methods.iter().find(|m| m.name == text) {
                            defs.push(LspDefinition {
                                uri: uri.to_string(),
                                range: m.range.clone(),
                                symbol: Some(m.name.clone()),
                            });
                            return defs;
                        }

                        // 3. Pipe (custom or built-in)
                        if tok.kind == "pipe" {
                            let pipe_name = text.to_lowercase();
                            let pipe_class = format!("{}Pipe", {
                                let mut c = text.chars();
                                match c.next() {
                                    None => String::new(),
                                    Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                                }
                            });
                            // Check local class or imported class
                            if let Some(cls) = analysis.type_defs.iter().find(|t| {
                                t.name.to_lowercase() == pipe_class.to_lowercase()
                                    || t.name.to_lowercase().contains(&pipe_name)
                            }) {
                                defs.push(LspDefinition {
                                    uri: cls.uri.clone().unwrap_or_else(|| uri.to_string()),
                                    range: cls
                                        .range
                                        .clone()
                                        .unwrap_or_else(|| tok.file_range.clone()),
                                    symbol: Some(cls.name.clone()),
                                });
                                return defs;
                            }
                            // Check imported pipe classes
                            for imp in &comp.imports {
                                if imp.name.to_lowercase().contains(&pipe_name) {
                                    let target_uri = resolve_module_uri(uri, &imp.module_path);
                                    defs.push(LspDefinition {
                                        uri: target_uri,
                                        range: imp.range.clone(),
                                        symbol: Some(imp.name.clone()),
                                    });
                                    return defs;
                                }
                            }
                            // Search dynamic type_defs from imports or local file
                            if let Some(td) = analysis.type_defs.iter().find(|t| {
                                t.kind == "pipe"
                                    && (t
                                        .raw_type
                                        .as_deref()
                                        .map_or(false, |r| r.eq_ignore_ascii_case(&pipe_name))
                                        || t.name.to_lowercase() == pipe_class.to_lowercase()
                                        || t.name.to_lowercase() == pipe_name)
                            }) {
                                defs.push(LspDefinition {
                                    uri: td.uri.clone().unwrap_or_else(|| uri.to_string()),
                                    range: td
                                        .range
                                        .clone()
                                        .unwrap_or_else(|| tok.file_range.clone()),
                                    symbol: Some(td.name.clone()),
                                });
                                return defs;
                            }

                            // Dynamic module resolution for @angora-js/core
                            let resolved = crate::lsp::analyzer::resolve_imported_files(
                                Some(uri),
                                "@angora-js/core",
                            );
                            for p in &resolved {
                                if let Ok(imported_text) = std::fs::read_to_string(p) {
                                    let target_uri = format!("file://{}", p.display());
                                    let parsed_core = crate::lsp::analyzer::analyze_single_file_lsp(
                                        &imported_text,
                                        Some(target_uri.clone()),
                                    );
                                    if let Some(td) = parsed_core.type_defs.iter().find(|t| {
                                        t.kind == "pipe"
                                            && (t.raw_type.as_deref().map_or(false, |r| {
                                                r.eq_ignore_ascii_case(&pipe_name)
                                            }) || t.name.to_lowercase()
                                                == pipe_class.to_lowercase())
                                    }) {
                                        defs.push(LspDefinition {
                                            uri: target_uri,
                                            range: td
                                                .range
                                                .clone()
                                                .unwrap_or_else(|| tok.file_range.clone()),
                                            symbol: Some(td.name.clone()),
                                        });
                                        return defs;
                                    }
                                }
                            }
                        }

                        // 4. Template reference
                        for el in &parsed.elements {
                            for r in &el.references {
                                if r.name == text {
                                    defs.push(LspDefinition {
                                        uri: uri.to_string(),
                                        range: r.token.file_range.clone(),
                                        symbol: Some(r.name.clone()),
                                    });
                                    return defs;
                                }
                            }
                        }

                        // 5. @for loop item
                        for cf in &parsed.control_flows {
                            if cf.keyword == "@for" {
                                if let Some(item_tok) = &cf.item_name_token {
                                    if item_tok.text == text {
                                        defs.push(LspDefinition {
                                            uri: uri.to_string(),
                                            range: item_tok.file_range.clone(),
                                            symbol: Some(item_tok.text.clone()),
                                        });
                                        return defs;
                                    }
                                }
                            }
                        }

                        // 6. Custom Element Tag (e.g. <user-profile />, <app-todo-item />)
                        if tok.kind == "tag" {
                            let clean_tag = text.replace('-', "").to_lowercase();
                            let tag_stripped = text
                                .split_once('-')
                                .map(|(_, rest)| rest.replace('-', "").to_lowercase())
                                .unwrap_or_default();

                            let mut candidate_symbols = Vec::new();
                            if let Some(ref c_imps) = comp.component_imports {
                                for ci in c_imps {
                                    candidate_symbols.push(ci.clone());
                                }
                            }
                            for td in &analysis.type_defs {
                                if td.kind == "component" && !candidate_symbols.contains(&td.name) {
                                    candidate_symbols.push(td.name.clone());
                                }
                            }

                            let mut matched_symbol: Option<String> = None;
                            for sym in &candidate_symbols {
                                let sym_clean = sym
                                    .replace("Component", "")
                                    .replace("Directive", "")
                                    .replace('-', "")
                                    .to_lowercase();
                                if sym_clean == clean_tag
                                    || (!tag_stripped.is_empty() && sym_clean == tag_stripped)
                                    || analysis.type_defs.iter().any(|t| {
                                        t.name == *sym && t.raw_type.as_deref() == Some(text)
                                    })
                                {
                                    matched_symbol = Some(sym.clone());
                                    break;
                                }
                            }

                            if matched_symbol.is_none() {
                                let mut best_match: Option<(usize, String)> = None;
                                for sym in &candidate_symbols {
                                    let sym_clean = sym
                                        .replace("Component", "")
                                        .replace("Directive", "")
                                        .replace('-', "")
                                        .to_lowercase();
                                    if !sym_clean.is_empty() && clean_tag.contains(&sym_clean) {
                                        let len = sym_clean.len();
                                        if best_match.as_ref().map_or(true, |(bl, _)| len > *bl) {
                                            best_match = Some((len, sym.clone()));
                                        }
                                    }
                                }
                                matched_symbol = best_match.map(|(_, s)| s);
                            }

                            // Fallback if component_imports was empty: check comp.imports but exclude interfaces/types
                            if matched_symbol.is_none() {
                                for imp in &comp.imports {
                                    let is_not_type = !analysis.type_defs.iter().any(|t| {
                                        t.name == imp.name
                                            && (t.kind == "interface" || t.kind == "type")
                                    });
                                    let is_component_name = imp.name.ends_with("Component")
                                        || imp.name.ends_with("Directive");
                                    if is_not_type && is_component_name {
                                        let imp_clean = imp
                                            .name
                                            .replace("Component", "")
                                            .replace("Directive", "")
                                            .replace('-', "")
                                            .to_lowercase();
                                        if imp_clean == clean_tag
                                            || (!tag_stripped.is_empty()
                                                && imp_clean == tag_stripped)
                                            || clean_tag.contains(&imp_clean)
                                        {
                                            matched_symbol = Some(imp.name.clone());
                                            break;
                                        }
                                    }
                                }
                            }

                            if let Some(target_name) = matched_symbol {
                                if let Some(imp) =
                                    comp.imports.iter().find(|i| i.name == target_name)
                                {
                                    let target_uri = resolve_module_uri(uri, &imp.module_path);
                                    defs.push(LspDefinition {
                                        uri: target_uri,
                                        range: imp.range.clone(),
                                        symbol: Some(target_name),
                                    });
                                    return defs;
                                } else if let Some(td) =
                                    analysis.type_defs.iter().find(|t| t.name == target_name)
                                {
                                    if let Some(ref range) = td.range {
                                        defs.push(LspDefinition {
                                            uri: td.uri.clone().unwrap_or_else(|| uri.to_string()),
                                            range: range.clone(),
                                            symbol: Some(target_name),
                                        });
                                        return defs;
                                    }
                                }
                            }
                        }

                        // 7. Member access (e.g. toastService.toasts, item.type, customerControl.value)
                        if tok.kind == "member" {
                            let char_idx = tok.file_range.start.character as usize;
                            let lines: Vec<&str> = content.lines().collect();
                            let mut parent_type_opt: Option<String> = None;
                            if (tok.file_range.start.line as usize) < lines.len() {
                                let line = lines[tok.file_range.start.line as usize];
                                let prefix =
                                    &line[..char_idx.min(line.len())].trim_end_matches('.');
                                let left_expr = extract_left_hand_expression(prefix);
                                let scope =
                                    collect_template_scope(&parsed, comp, &analysis.type_defs);
                                let inferred = infer_expression_type(
                                    &left_expr,
                                    comp,
                                    &scope,
                                    &analysis.type_defs,
                                );
                                if inferred.r#type != "any" {
                                    let mut t = inferred.r#type;
                                    if t.starts_with("Signal<") && t.ends_with('>') {
                                        t = t[7..t.len() - 1].to_string();
                                    }
                                    parent_type_opt = Some(t);
                                }
                            }

                            if let Some(ref pt) = parent_type_opt {
                                if let Some(td) = analysis.type_defs.iter().find(|t| &t.name == pt)
                                {
                                    if let Some(p) = td.properties.iter().find(|p| p.name == text) {
                                        defs.push(LspDefinition {
                                            uri: td.uri.clone().unwrap_or_else(|| uri.to_string()),
                                            range: p
                                                .range
                                                .clone()
                                                .unwrap_or_else(|| tok.file_range.clone()),
                                            symbol: Some(p.name.clone()),
                                        });
                                        return defs;
                                    }
                                    if let Some(m) = td.methods.iter().find(|m| m.name == text) {
                                        defs.push(LspDefinition {
                                            uri: td.uri.clone().unwrap_or_else(|| uri.to_string()),
                                            range: m
                                                .range
                                                .clone()
                                                .unwrap_or_else(|| tok.file_range.clone()),
                                            symbol: Some(m.name.clone()),
                                        });
                                        return defs;
                                    }
                                }
                            }

                            for td in &analysis.type_defs {
                                if let Some(p) = td.properties.iter().find(|p| p.name == text) {
                                    defs.push(LspDefinition {
                                        uri: td.uri.clone().unwrap_or_else(|| uri.to_string()),
                                        range: p
                                            .range
                                            .clone()
                                            .unwrap_or_else(|| tok.file_range.clone()),
                                        symbol: Some(p.name.clone()),
                                    });
                                    return defs;
                                }
                                if let Some(m) = td.methods.iter().find(|m| m.name == text) {
                                    defs.push(LspDefinition {
                                        uri: td.uri.clone().unwrap_or_else(|| uri.to_string()),
                                        range: m
                                            .range
                                            .clone()
                                            .unwrap_or_else(|| tok.file_range.clone()),
                                        symbol: Some(m.name.clone()),
                                    });
                                    return defs;
                                }
                            }
                        }
                    }
                }
            }
        }

        defs
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hover_features() {
        let source = r#"import { Component, signal } from '@angora-js/core';

@Component({
  selector: 'app-hover',
  template: `
    <div>
      <p>{{ title() }}</p>
      <input [disabled]="isLocked" />
    </div>
  `
})
export class HoverComponent {
  /** The app title */
  title = signal('Hello');
  isLocked = signal(false);
}
"#;
        let lines: Vec<&str> = source.lines().collect();
        let title_line = lines.iter().position(|l| l.contains("title()")).unwrap() as u32;
        let title_char = lines[title_line as usize].find("title").unwrap() as u32;

        let hover = AngoraLanguageEngine::get_hover(
            "file:///hover.component.ts",
            source,
            &LspPosition {
                line: title_line,
                character: title_char,
            },
        );

        assert!(hover.is_some());
        let h = hover.unwrap();
        assert!(h.contents.contains("HoverComponent.title: Signal<string>"));
        assert!(h.contents.contains("The app title"));
    }

    #[test]
    fn test_completions_features() {
        let source = r#"import { Component } from '@angora-js/core';
import { FormControl } from '@angora-js/forms';

@Component({
  selector: 'app-complete',
  template: `<div>{{ customerControl. }}</div>`
})
export class CompleteComponent {
  customerControl = new FormControl('Alice');
}
"#;
        let lines: Vec<&str> = source.lines().collect();
        let line_idx = lines
            .iter()
            .position(|l| l.contains("customerControl."))
            .unwrap() as u32;
        let char_idx = (lines[line_idx as usize].find("customerControl.").unwrap()
            + "customerControl.".len()) as u32;

        let completions = AngoraLanguageEngine::get_completions(
            "file:///complete.component.ts",
            source,
            &LspPosition {
                line: line_idx,
                character: char_idx,
            },
        );

        assert!(completions.iter().any(|c| c.label == "value()"));
        assert!(completions.iter().any(|c| c.label == "setValue()"));
        assert!(completions.iter().any(|c| c.label == "dirty()"));
    }
}
