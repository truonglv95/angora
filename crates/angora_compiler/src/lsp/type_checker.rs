use super::analyzer::{LspComponentAnalysis, LspRange, LspTypeDefInfo, LspTypeMemberInfo};
use super::template_parser::{ParsedTemplate, TemplateToken};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspDiagnostic {
    pub code: String,
    pub message: String,
    pub severity: String,
    pub range: LspRange,
    pub source: String,
}

pub fn get_standard_element_properties(
) -> HashMap<&'static str, HashMap<&'static str, &'static str>> {
    let mut map = HashMap::new();

    let mut input = HashMap::new();
    input.insert("disabled", "boolean");
    input.insert("checked", "boolean");
    input.insert("readonly", "boolean");
    input.insert("required", "boolean");
    input.insert("multiple", "boolean");
    input.insert("autofocus", "boolean");
    input.insert("value", "string | number");
    input.insert("type", "string");
    input.insert("placeholder", "string");
    input.insert("name", "string");
    input.insert("min", "string | number");
    input.insert("max", "string | number");
    input.insert("step", "string | number");
    input.insert("pattern", "string");
    input.insert("autocomplete", "string");
    input.insert("maxlength", "number");
    input.insert("minlength", "number");
    input.insert("size", "number");
    map.insert("input", input);

    let mut button = HashMap::new();
    button.insert("disabled", "boolean");
    button.insert("type", "string");
    button.insert("name", "string");
    button.insert("value", "string");
    button.insert("autofocus", "boolean");
    map.insert("button", button);

    let mut a = HashMap::new();
    a.insert("href", "string");
    a.insert("target", "string");
    a.insert("rel", "string");
    a.insert("download", "string");
    map.insert("a", a);

    let mut img = HashMap::new();
    img.insert("src", "string");
    img.insert("alt", "string");
    img.insert("width", "string | number");
    img.insert("height", "string | number");
    img.insert("loading", "string");
    map.insert("img", img);

    let mut select = HashMap::new();
    select.insert("disabled", "boolean");
    select.insert("required", "boolean");
    select.insert("multiple", "boolean");
    select.insert("name", "string");
    select.insert("value", "string");
    select.insert("size", "number");
    map.insert("select", select);

    let mut textarea = HashMap::new();
    textarea.insert("disabled", "boolean");
    textarea.insert("readonly", "boolean");
    textarea.insert("required", "boolean");
    textarea.insert("placeholder", "string");
    textarea.insert("value", "string");
    textarea.insert("name", "string");
    textarea.insert("rows", "number");
    textarea.insert("cols", "number");
    textarea.insert("maxlength", "number");
    textarea.insert("minlength", "number");
    map.insert("textarea", textarea);

    let mut form = HashMap::new();
    form.insert("action", "string");
    form.insert("method", "string");
    form.insert("target", "string");
    form.insert("novalidate", "boolean");
    map.insert("form", form);

    let mut universal = HashMap::new();
    universal.insert("id", "string");
    universal.insert("title", "string");
    universal.insert("hidden", "boolean");
    universal.insert("tabIndex", "number");
    universal.insert("tabindex", "number");
    universal.insert("className", "string");
    universal.insert("style", "string");
    universal.insert("role", "string");
    universal.insert("draggable", "boolean");
    universal.insert("contenteditable", "boolean");
    map.insert("*", universal);

    map
}

pub fn get_expected_property_type(tag: &str, prop_name: &str) -> Option<String> {
    if prop_name.starts_with("class.") {
        return Some("boolean".to_string());
    }
    if prop_name.starts_with("style.") {
        return Some("string | number".to_string());
    }
    if prop_name.starts_with("attr.") {
        return Some("string | number | boolean".to_string());
    }

    let std_props = get_standard_element_properties();
    let lower_tag = tag.to_lowercase();

    if let Some(tag_map) = std_props.get(lower_tag.as_str()) {
        if let Some(&expected) = tag_map.get(prop_name) {
            return Some(expected.to_string());
        }
    }

    if let Some(universal) = std_props.get("*") {
        if let Some(&expected) = universal.get(prop_name) {
            return Some(expected.to_string());
        }
    }

    None
}

pub fn is_type_assignable(actual: &str, expected: &str) -> bool {
    if expected == "any" || actual == "any" {
        return true;
    }
    if actual == expected {
        return true;
    }

    let expected_union: Vec<&str> = expected.split('|').map(|s| s.trim()).collect();
    if expected_union.contains(&actual) {
        return true;
    }

    false
}

#[derive(Debug, Clone)]
pub struct ScopeVariable {
    pub name: String,
    pub r#type: String,
    pub docstring: Option<String>,
}

pub fn collect_template_scope(
    template: &ParsedTemplate,
    analysis: &LspComponentAnalysis,
    type_defs: &[LspTypeDefInfo],
) -> HashMap<String, ScopeVariable> {
    let mut scope = HashMap::new();

    // 1. Template references #ref
    for el in &template.elements {
        for r in &el.references {
            let ref_type = match el.tag.to_lowercase().as_str() {
                "input" => "HTMLInputElement".to_string(),
                "button" => "HTMLButtonElement".to_string(),
                "select" => "HTMLSelectElement".to_string(),
                "textarea" => "HTMLTextAreaElement".to_string(),
                "form" => "HTMLFormElement".to_string(),
                _ => {
                    if el.tag.contains('-') {
                        let clean_tag = el.tag.replace('-', "").to_lowercase();
                        let tag_stripped = el
                            .tag
                            .split_once('-')
                            .map(|(_, rest)| rest.replace('-', "").to_lowercase())
                            .unwrap_or_default();

                        let matched_import = analysis.component_imports.as_ref().and_then(|imps| {
                            imps.iter()
                                .find(|imp| {
                                    let imp_norm = imp
                                        .replace("Component", "")
                                        .replace("Directive", "")
                                        .replace('-', "")
                                        .to_lowercase();
                                    clean_tag == imp_norm
                                        || (!tag_stripped.is_empty() && imp_norm == tag_stripped)
                                        || (!imp_norm.is_empty() && clean_tag.contains(&imp_norm))
                                        || (!clean_tag.is_empty() && imp_norm.contains(&clean_tag))
                                        || imp.to_lowercase().contains(&clean_tag)
                                })
                                .cloned()
                        });

                        let matched_def = matched_import.or_else(|| {
                            type_defs
                                .iter()
                                .find(|t| {
                                    let imp_norm = t
                                        .name
                                        .replace("Component", "")
                                        .replace("Directive", "")
                                        .replace('-', "")
                                        .to_lowercase();
                                    clean_tag == imp_norm
                                        || (!tag_stripped.is_empty() && imp_norm == tag_stripped)
                                        || (!imp_norm.is_empty() && clean_tag.contains(&imp_norm))
                                        || (!clean_tag.is_empty() && imp_norm.contains(&clean_tag))
                                        || t.name.to_lowercase().contains(&clean_tag)
                                        || t.raw_type
                                            .as_ref()
                                            .map_or(false, |sel| sel.eq_ignore_ascii_case(&el.tag))
                                })
                                .map(|t| t.name.clone())
                        });

                        matched_def.unwrap_or_else(|| "HTMLElement".to_string())
                    } else {
                        "HTMLElement".to_string()
                    }
                }
            };
            scope.insert(
                r.name.clone(),
                ScopeVariable {
                    name: r.name.clone(),
                    r#type: ref_type,
                    docstring: Some(format!("Template reference for <{}>", el.tag)),
                },
            );
        }
    }

    // 2. Control flow variables (@for item, $index, etc.)
    for cf in &template.control_flows {
        if cf.keyword == "@for" {
            if let Some(item_name) = &cf.item_name {
                let mut item_type = "any".to_string();
                if let Some(iterable_expr) = &cf.iterable {
                    let inferred =
                        infer_expression_type(iterable_expr, analysis, &scope, type_defs);
                    if inferred.r#type != "any" {
                        let base_type = if inferred.r#type.starts_with("Signal<")
                            && inferred.r#type.ends_with('>')
                        {
                            &inferred.r#type[7..inferred.r#type.len() - 1]
                        } else {
                            &inferred.r#type
                        };
                        if base_type.ends_with("[]") {
                            item_type = base_type[..base_type.len() - 2].to_string();
                        } else if base_type.starts_with("Array<") && base_type.ends_with('>') {
                            item_type = base_type[6..base_type.len() - 1].to_string();
                        } else {
                            item_type = base_type.to_string();
                        }
                    } else {
                        // Try to infer item type from iterable
                        let iter_ident = iterable_expr.replace("()", "").trim().to_string();
                        if let Some(p) = analysis.properties.iter().find(|p| p.name == iter_ident) {
                            let inner = if p.unwrapped_type.ends_with("[]") {
                                p.unwrapped_type[..p.unwrapped_type.len() - 2].to_string()
                            } else if p.unwrapped_type.starts_with("Array<")
                                && p.unwrapped_type.ends_with('>')
                            {
                                p.unwrapped_type[6..p.unwrapped_type.len() - 1].to_string()
                            } else if p.raw_type.ends_with("[]") {
                                p.raw_type[..p.raw_type.len() - 2].to_string()
                            } else if p.raw_type.starts_with("FormArray<")
                                && p.raw_type.ends_with('>')
                            {
                                p.raw_type[10..p.raw_type.len() - 1].to_string()
                            } else {
                                "any".to_string()
                            };
                            item_type = inner;
                        }
                    }
                }

                scope.insert(
                    item_name.clone(),
                    ScopeVariable {
                        name: item_name.clone(),
                        r#type: item_type,
                        docstring: Some("Loop item in @for".to_string()),
                    },
                );
            }

            scope.insert(
                "$index".to_string(),
                ScopeVariable {
                    name: "$index".to_string(),
                    r#type: "number".to_string(),
                    docstring: Some("Current index in @for loop".to_string()),
                },
            );
            scope.insert(
                "$first".to_string(),
                ScopeVariable {
                    name: "$first".to_string(),
                    r#type: "boolean".to_string(),
                    docstring: Some("True if first item in @for loop".to_string()),
                },
            );
            scope.insert(
                "$last".to_string(),
                ScopeVariable {
                    name: "$last".to_string(),
                    r#type: "boolean".to_string(),
                    docstring: Some("True if last item in @for loop".to_string()),
                },
            );
            scope.insert(
                "$count".to_string(),
                ScopeVariable {
                    name: "$count".to_string(),
                    r#type: "number".to_string(),
                    docstring: Some("Total count in @for loop".to_string()),
                },
            );
        }
    }

    scope
}

pub fn extract_left_hand_expression(expr: &str) -> String {
    let chars: Vec<char> = expr.chars().collect();
    if chars.is_empty() {
        return String::new();
    }

    let mut i = chars.len() as isize - 1;
    while i >= 0 && chars[i as usize].is_whitespace() {
        i -= 1;
    }
    if i < 0 {
        return String::new();
    }

    let mut paren_depth = 0;
    let mut bracket_depth = 0;
    let mut brace_depth = 0;

    while i >= 0 {
        let ch = chars[i as usize];
        if ch == ')' {
            paren_depth += 1;
        } else if ch == '(' {
            if paren_depth == 0 {
                break;
            }
            paren_depth -= 1;
        } else if ch == ']' {
            bracket_depth += 1;
        } else if ch == '[' {
            if bracket_depth == 0 {
                break;
            }
            bracket_depth -= 1;
        } else if ch == '}' {
            brace_depth += 1;
        } else if ch == '{' {
            if brace_depth == 0 {
                break;
            }
            brace_depth -= 1;
        } else if paren_depth == 0 && bracket_depth == 0 && brace_depth == 0 {
            if ch == '?' && (i as usize) + 1 < chars.len() && chars[(i as usize) + 1] == '.' {
                i -= 1;
                continue;
            }
            if matches!(
                ch,
                '+' | '-'
                    | '*'
                    | '/'
                    | '%'
                    | '&'
                    | '|'
                    | '^'
                    | '='
                    | '<'
                    | '>'
                    | '!'
                    | '~'
                    | '?'
                    | ':'
                    | ','
                    | ';'
                    | '"'
                    | '\''
                    | '`'
            ) {
                break;
            }
        }
        i -= 1;
    }

    let res_chars: Vec<char> = chars[(i + 1) as usize..].to_vec();
    let res: String = res_chars.into_iter().collect();
    res.trim().to_string()
}

pub fn get_builtin_type_def(name: &str) -> Option<LspTypeDefInfo> {
    let clean = name
        .replace("<string>", "")
        .replace("<number>", "")
        .replace("<boolean>", "");
    let clean = clean.split('<').next().unwrap_or(name).trim();

    match clean {
        "Array" => {
            let mut methods = Vec::new();
            for m in &[
                "push",
                "pop",
                "shift",
                "unshift",
                "slice",
                "splice",
                "map",
                "filter",
                "forEach",
                "find",
                "findIndex",
                "includes",
                "indexOf",
                "join",
                "concat",
                "reduce",
                "some",
                "every",
            ] {
                methods.push(LspTypeMemberInfo {
                    name: m.to_string(),
                    r#type: "any".to_string(),
                    raw_type: "any".to_string(),
                    unwrapped_type: None,
                    is_signal: None,
                    is_method: Some(true),
                    signature: None,
                    docstring: None,
                    range: None,
                    uri: None,
                });
            }
            let mut props = Vec::new();
            props.push(LspTypeMemberInfo {
                name: "length".to_string(),
                r#type: "number".to_string(),
                raw_type: "number".to_string(),
                unwrapped_type: None,
                is_signal: None,
                is_method: Some(false),
                signature: None,
                docstring: None,
                range: None,
                uri: None,
            });
            Some(LspTypeDefInfo {
                name: "Array".to_string(),
                kind: "class".to_string(),
                raw_type: Some("Array<T>".to_string()),
                super_class: None,
                properties: props,
                methods,
                range: None,
                uri: None,
            })
        }
        "String" | "string" => {
            let mut methods = Vec::new();
            for m in &[
                "toUpperCase",
                "toLowerCase",
                "trim",
                "trimStart",
                "trimEnd",
                "split",
                "slice",
                "substring",
                "indexOf",
                "lastIndexOf",
                "includes",
                "startsWith",
                "endsWith",
                "replace",
                "replaceAll",
                "charAt",
                "charCodeAt",
                "match",
                "matchAll",
            ] {
                methods.push(LspTypeMemberInfo {
                    name: m.to_string(),
                    r#type: "any".to_string(),
                    raw_type: "any".to_string(),
                    unwrapped_type: None,
                    is_signal: None,
                    is_method: Some(true),
                    signature: None,
                    docstring: None,
                    range: None,
                    uri: None,
                });
            }
            let mut props = Vec::new();
            props.push(LspTypeMemberInfo {
                name: "length".to_string(),
                r#type: "number".to_string(),
                raw_type: "number".to_string(),
                unwrapped_type: None,
                is_signal: None,
                is_method: Some(false),
                signature: None,
                docstring: None,
                range: None,
                uri: None,
            });
            Some(LspTypeDefInfo {
                name: "String".to_string(),
                kind: "class".to_string(),
                raw_type: Some("String".to_string()),
                super_class: None,
                properties: props,
                methods,
                range: None,
                uri: None,
            })
        }
        "Number" | "number" => {
            let mut methods = Vec::new();
            for m in &[
                "toFixed",
                "toExponential",
                "toPrecision",
                "toString",
                "valueOf",
            ] {
                methods.push(LspTypeMemberInfo {
                    name: m.to_string(),
                    r#type: "any".to_string(),
                    raw_type: "any".to_string(),
                    unwrapped_type: None,
                    is_signal: None,
                    is_method: Some(true),
                    signature: None,
                    docstring: None,
                    range: None,
                    uri: None,
                });
            }
            Some(LspTypeDefInfo {
                name: "Number".to_string(),
                kind: "class".to_string(),
                raw_type: Some("Number".to_string()),
                super_class: None,
                properties: Vec::new(),
                methods,
                range: None,
                uri: None,
            })
        }
        "Boolean" | "boolean" => {
            let mut methods = Vec::new();
            for m in &["toString", "valueOf"] {
                methods.push(LspTypeMemberInfo {
                    name: m.to_string(),
                    r#type: "any".to_string(),
                    raw_type: "any".to_string(),
                    unwrapped_type: None,
                    is_signal: None,
                    is_method: Some(true),
                    signature: None,
                    docstring: None,
                    range: None,
                    uri: None,
                });
            }
            Some(LspTypeDefInfo {
                name: "Boolean".to_string(),
                kind: "class".to_string(),
                raw_type: Some("Boolean".to_string()),
                super_class: None,
                properties: Vec::new(),
                methods,
                range: None,
                uri: None,
            })
        }
        "HTMLInputElement" => {
            let mut props = Vec::new();
            for p in &[
                "value",
                "name",
                "type",
                "placeholder",
                "disabled",
                "checked",
                "readOnly",
                "required",
                "min",
                "max",
                "step",
                "id",
                "className",
                "title",
            ] {
                props.push(LspTypeMemberInfo {
                    name: p.to_string(),
                    r#type: "string".to_string(),
                    raw_type: "string".to_string(),
                    unwrapped_type: None,
                    is_signal: None,
                    is_method: Some(false),
                    signature: None,
                    docstring: None,
                    range: None,
                    uri: None,
                });
            }
            let mut methods = Vec::new();
            for m in &["focus", "blur", "select", "click"] {
                methods.push(LspTypeMemberInfo {
                    name: m.to_string(),
                    r#type: "void".to_string(),
                    raw_type: "void".to_string(),
                    unwrapped_type: None,
                    is_signal: None,
                    is_method: Some(true),
                    signature: None,
                    docstring: None,
                    range: None,
                    uri: None,
                });
            }
            Some(LspTypeDefInfo {
                name: "HTMLInputElement".to_string(),
                kind: "interface".to_string(),
                raw_type: Some("HTMLInputElement".to_string()),
                super_class: None,
                properties: props,
                methods,
                range: None,
                uri: None,
            })
        }
        "FormGroup" => {
            let mut props = Vec::new();
            for p in &[
                "controls",
                "value",
                "valid",
                "invalid",
                "pending",
                "dirty",
                "pristine",
                "touched",
                "untouched",
                "errors",
                "status",
            ] {
                props.push(LspTypeMemberInfo {
                    name: p.to_string(),
                    r#type: "any".to_string(),
                    raw_type: "any".to_string(),
                    unwrapped_type: None,
                    is_signal: None,
                    is_method: Some(false),
                    signature: None,
                    docstring: None,
                    range: None,
                    uri: None,
                });
            }
            let mut methods = Vec::new();
            for m in &[
                "get",
                "reset",
                "setValue",
                "patchValue",
                "markAsDirty",
                "markAsPristine",
                "markAsTouched",
                "markAsUntouched",
                "updateValueAndValidity",
            ] {
                methods.push(LspTypeMemberInfo {
                    name: m.to_string(),
                    r#type: "any".to_string(),
                    raw_type: "any".to_string(),
                    unwrapped_type: None,
                    is_signal: None,
                    is_method: Some(true),
                    signature: None,
                    docstring: None,
                    range: None,
                    uri: None,
                });
            }
            Some(LspTypeDefInfo {
                name: "FormGroup".to_string(),
                kind: "class".to_string(),
                raw_type: Some("FormGroup".to_string()),
                super_class: None,
                properties: props,
                methods,
                range: None,
                uri: None,
            })
        }
        "FormControl" => {
            let mut props = Vec::new();
            for p in &[
                "value",
                "valid",
                "invalid",
                "pending",
                "dirty",
                "pristine",
                "touched",
                "untouched",
                "errors",
                "status",
            ] {
                props.push(LspTypeMemberInfo {
                    name: p.to_string(),
                    r#type: "any".to_string(),
                    raw_type: "any".to_string(),
                    unwrapped_type: None,
                    is_signal: None,
                    is_method: Some(false),
                    signature: None,
                    docstring: None,
                    range: None,
                    uri: None,
                });
            }
            let mut methods = Vec::new();
            for m in &[
                "setValue",
                "patchValue",
                "reset",
                "markAsDirty",
                "markAsPristine",
                "markAsTouched",
                "markAsUntouched",
                "updateValueAndValidity",
            ] {
                methods.push(LspTypeMemberInfo {
                    name: m.to_string(),
                    r#type: "any".to_string(),
                    raw_type: "any".to_string(),
                    unwrapped_type: None,
                    is_signal: None,
                    is_method: Some(true),
                    signature: None,
                    docstring: None,
                    range: None,
                    uri: None,
                });
            }
            Some(LspTypeDefInfo {
                name: "FormControl".to_string(),
                kind: "class".to_string(),
                raw_type: Some("FormControl".to_string()),
                super_class: None,
                properties: props,
                methods,
                range: None,
                uri: None,
            })
        }
        "FormArray" => {
            let mut props = Vec::new();
            for p in &[
                "controls",
                "length",
                "value",
                "valid",
                "invalid",
                "pending",
                "dirty",
                "pristine",
                "touched",
                "untouched",
                "errors",
                "status",
            ] {
                props.push(LspTypeMemberInfo {
                    name: p.to_string(),
                    r#type: if *p == "length" {
                        "number".to_string()
                    } else {
                        "any".to_string()
                    },
                    raw_type: if *p == "length" {
                        "number".to_string()
                    } else {
                        "any".to_string()
                    },
                    unwrapped_type: None,
                    is_signal: None,
                    is_method: Some(false),
                    signature: None,
                    docstring: None,
                    range: None,
                    uri: None,
                });
            }
            let mut methods = Vec::new();
            for m in &[
                "at",
                "push",
                "insert",
                "removeAt",
                "setControl",
                "clear",
                "reset",
                "setValue",
                "patchValue",
                "markAsDirty",
                "markAsPristine",
                "markAsTouched",
                "markAsUntouched",
                "updateValueAndValidity",
            ] {
                methods.push(LspTypeMemberInfo {
                    name: m.to_string(),
                    r#type: "any".to_string(),
                    raw_type: "any".to_string(),
                    unwrapped_type: None,
                    is_signal: None,
                    is_method: Some(true),
                    signature: None,
                    docstring: None,
                    range: None,
                    uri: None,
                });
            }
            Some(LspTypeDefInfo {
                name: "FormArray".to_string(),
                kind: "class".to_string(),
                raw_type: Some("FormArray".to_string()),
                super_class: None,
                properties: props,
                methods,
                range: None,
                uri: None,
            })
        }
        _ => None,
    }
}

pub fn find_type_member<'a>(
    type_name: &str,
    member_name: &str,
    type_defs: &'a [LspTypeDefInfo],
    depth: usize,
) -> Option<(&'a LspTypeDefInfo, &'a LspTypeMemberInfo, bool)> {
    if depth > 10 {
        return None;
    }
    let clean = type_name.split('<').next().unwrap_or(type_name).trim();
    if let Some(td) = type_defs.iter().find(|t| t.name == clean) {
        if let Some(prop) = td.properties.iter().find(|p| p.name == member_name) {
            return Some((td, prop, false));
        }
        if let Some(m) = td.methods.iter().find(|m| m.name == member_name) {
            return Some((td, m, true));
        }
        if let Some(super_name) = &td.super_class {
            return find_type_member(super_name, member_name, type_defs, depth + 1);
        }
    }
    None
}

pub struct InferredType {
    pub r#type: String,
    pub uncalled_signal: Option<String>,
    pub non_callable_call: Option<String>,
}

pub fn infer_expression_type(
    expr: &str,
    analysis: &LspComponentAnalysis,
    scope: &HashMap<String, ScopeVariable>,
    type_defs: &[LspTypeDefInfo],
) -> InferredType {
    let clean = expr.trim();
    if clean.is_empty() {
        return InferredType {
            r#type: "any".to_string(),
            uncalled_signal: None,
            non_callable_call: None,
        };
    }

    if clean.starts_with('\'') && clean.ends_with('\'')
        || clean.starts_with('"') && clean.ends_with('"')
    {
        return InferredType {
            r#type: "string".to_string(),
            uncalled_signal: None,
            non_callable_call: None,
        };
    }
    if clean.parse::<f64>().is_ok() {
        return InferredType {
            r#type: "number".to_string(),
            uncalled_signal: None,
            non_callable_call: None,
        };
    }
    if clean == "true" || clean == "false" {
        return InferredType {
            r#type: "boolean".to_string(),
            uncalled_signal: None,
            non_callable_call: None,
        };
    }

    // Unary logical NOT
    if clean.starts_with('!') {
        return InferredType {
            r#type: "boolean".to_string(),
            uncalled_signal: None,
            non_callable_call: None,
        };
    }

    // Binary logical / comparison
    if clean.contains("===")
        || clean.contains("!==")
        || clean.contains("==")
        || clean.contains("!=")
        || clean.contains("&&")
        || clean.contains("||")
        || clean.contains('>')
        || clean.contains('<')
    {
        return InferredType {
            r#type: "boolean".to_string(),
            uncalled_signal: None,
            non_callable_call: None,
        };
    }

    // Direct identifier in scope
    if let Some(sv) = scope.get(clean) {
        return InferredType {
            r#type: sv.r#type.clone(),
            uncalled_signal: None,
            non_callable_call: None,
        };
    }

    // Direct property on component: title or title()
    if let Some(p) = analysis.properties.iter().find(|p| p.name == clean) {
        return InferredType {
            r#type: p.raw_type.clone(),
            uncalled_signal: if p.is_signal {
                Some(p.name.clone())
            } else {
                None
            },
            non_callable_call: None,
        };
    }

    // Call expression: title()
    if clean.ends_with("()") {
        let fn_name = &clean[..clean.len() - 2];
        if let Some(p) = analysis.properties.iter().find(|p| p.name == fn_name) {
            if p.is_signal {
                return InferredType {
                    r#type: p.unwrapped_type.clone(),
                    uncalled_signal: None,
                    non_callable_call: None,
                };
            } else if p.raw_type == "number" || p.raw_type == "string" || p.raw_type == "boolean" {
                return InferredType {
                    r#type: "any".to_string(),
                    uncalled_signal: None,
                    non_callable_call: Some(p.name.clone()),
                };
            }
        }
    }

    // Member chain: customerControl.value(), orderForm.dirty(), userControl.value().id
    let parts: Vec<&str> = clean.split('.').collect();
    if parts.len() > 1 {
        let root = parts[0];
        let mut curr_type = "any".to_string();

        if let Some(sv) = scope.get(root) {
            curr_type = sv.r#type.clone();
        } else if let Some(p) = analysis.properties.iter().find(|p| p.name == root) {
            curr_type = p.raw_type.clone();
        }

        for (i, part) in parts.iter().enumerate().skip(1) {
            let part_clean = part.replace("()", "").replace('?', "");
            let part_name = part_clean.trim();

            if (curr_type == "FormGroup"
                || curr_type.ends_with("_FormGroup")
                || curr_type == "UntypedFormGroup")
                && part_name == "controls"
            {
                let prev_name = parts[i - 1].replace("()", "").replace('?', "");
                let specific_controls = format!("{}.controls", prev_name.trim());
                if type_defs.iter().any(|t| t.name == specific_controls) {
                    curr_type = specific_controls;
                    continue;
                }
            }

            if curr_type.ends_with("[]") || curr_type.starts_with("Array<") {
                if part_name == "length" {
                    curr_type = "number".to_string();
                    continue;
                } else if part_name == "slice" || part_name == "filter" || part_name == "map" {
                    continue;
                }
            } else if curr_type == "String" || curr_type == "string" {
                if part_name == "toUpperCase" || part_name == "toLowerCase" || part_name == "trim" {
                    curr_type = "string".to_string();
                    continue;
                } else if part_name == "length" {
                    curr_type = "number".to_string();
                    continue;
                }
            }

            if part_name == "length" {
                curr_type = "number".to_string();
                continue;
            }

            // Check dynamically scanned type definition from workspace/packages or builtin
            let clean_lookup = curr_type.split('<').next().unwrap_or(&curr_type).trim();
            let td_opt = type_defs
                .iter()
                .find(|t| t.name == clean_lookup)
                .cloned()
                .or_else(|| get_builtin_type_def(clean_lookup));
            if let Some(td) = td_opt {
                if let Some(prop) = td.properties.iter().find(|p| p.name == part_name) {
                    if prop.name == "value" && curr_type.contains('<') {
                        let inner = curr_type
                            .split_once('<')
                            .and_then(|(_, r)| r.strip_suffix('>'))
                            .unwrap_or("any")
                            .trim();
                        curr_type = inner.to_string();
                    } else {
                        curr_type = prop
                            .unwrapped_type
                            .as_deref()
                            .unwrap_or(&prop.r#type)
                            .to_string();
                    }
                    continue;
                }
                if let Some(m) = td.methods.iter().find(|m| m.name == part_name) {
                    curr_type = m.r#type.clone();
                    continue;
                }
            }

            curr_type = "any".to_string();
        }

        return InferredType {
            r#type: curr_type,
            uncalled_signal: None,
            non_callable_call: None,
        };
    }

    InferredType {
        r#type: "any".to_string(),
        uncalled_signal: None,
        non_callable_call: None,
    }
}

pub fn check_member_token(
    token: &TemplateToken,
    enclosing_expr: &str,
    expr_start_offset: usize,
    analysis: &LspComponentAnalysis,
    scope: &HashMap<String, ScopeVariable>,
    type_defs: &[LspTypeDefInfo],
    _current_file_content: Option<&str>,
) -> Option<LspDiagnostic> {
    if token.end_offset <= expr_start_offset {
        return None;
    }
    let offset_in_expr = token.end_offset - expr_start_offset;
    if offset_in_expr > enclosing_expr.len() {
        return None;
    }
    let member_expr = enclosing_expr[..offset_in_expr].trim();

    let last_dot = member_expr.rfind('.')?;
    let raw_parent = member_expr[..last_dot].trim_end_matches('?').trim();
    let parent_expr = extract_left_hand_expression(raw_parent);
    if parent_expr.is_empty() {
        return None;
    }

    // 1. If parent_expr is "this"
    if parent_expr == "this" {
        let has_prop = analysis.properties.iter().any(|p| p.name == token.text);
        let has_method = analysis.methods.iter().any(|m| m.name == token.text);
        if !has_prop && !has_method {
            return Some(LspDiagnostic {
                code: "TS2339".to_string(),
                message: format!(
                    "Property '{}' does not exist on type '{}'.",
                    token.text, analysis.class_name
                ),
                severity: "error".to_string(),
                range: token.file_range.clone(),
                source: "angora-typecheck".to_string(),
            });
        }
        return None;
    }

    // 2. Ignore flexible DOM event object accesses: $event.target.value
    if parent_expr.starts_with("$event") {
        return None;
    }

    // 3. Infer the type of the parent expression
    let parent_inferred = infer_expression_type(&parent_expr, analysis, scope, type_defs);
    let mut parent_type = parent_inferred.r#type.clone();

    if parent_type.is_empty() || parent_type == "any" {
        return None;
    }

    parent_type = parent_type
        .replace("| null", "")
        .replace("| undefined", "")
        .trim()
        .to_string();

    if parent_type == "ValidationErrors"
        || parent_type.starts_with("Record<string,")
        || parent_type.starts_with("Record<any,")
        || parent_type == "any[]"
    {
        return None;
    }

    // Check dynamically discovered type_defs (including inheritance chain)
    if find_type_member(&parent_type, &token.text, type_defs, 0).is_some() {
        return None;
    }

    // Check custom type definition first, then fallback to builtin standard library (Array, String, DOM)
    let clean = parent_type.split('<').next().unwrap_or(&parent_type).trim();
    let type_def = type_defs
        .iter()
        .find(|td| td.name == clean)
        .cloned()
        .or_else(|| get_builtin_type_def(&parent_type));

    if let Some(td) = type_def {
        let has_prop = td.properties.iter().any(|p| p.name == token.text);
        let has_method = td.methods.iter().any(|m| m.name == token.text);
        if !has_prop && !has_method {
            let display_type = if parent_type.contains('<') {
                &parent_type
            } else {
                &td.name
            };
            return Some(LspDiagnostic {
                code: "TS2339".to_string(),
                message: format!(
                    "Property '{}' does not exist on type '{}'.",
                    token.text, display_type
                ),
                severity: "error".to_string(),
                range: token.file_range.clone(),
                source: "angora-typecheck".to_string(),
            });
        }
    }

    None
}

pub fn check_template_types(
    template: &ParsedTemplate,
    analysis: &LspComponentAnalysis,
    type_defs: &[LspTypeDefInfo],
    current_file_content: Option<&str>,
) -> Vec<LspDiagnostic> {
    let mut diagnostics = Vec::new();
    let scope = collect_template_scope(template, analysis, type_defs);

    // 1. Check Interpolations {{ expr }}
    for interp in &template.interpolations {
        for id_tok in &interp.identifier_tokens {
            if id_tok.kind == "identifier" {
                let name = &id_tok.text;
                if name == "this" || name == "$event" {
                    continue;
                }
                if !scope.contains_key(name)
                    && !analysis.properties.iter().any(|p| p.name == *name)
                    && !analysis.methods.iter().any(|m| m.name == *name)
                {
                    diagnostics.push(LspDiagnostic {
                        code: "TS2339".to_string(),
                        message: format!(
                            "Property '{}' does not exist on type '{}'.",
                            name, analysis.class_name
                        ),
                        severity: "error".to_string(),
                        range: id_tok.file_range.clone(),
                        source: "angora-typecheck".to_string(),
                    });
                }
            } else if id_tok.kind == "member" {
                if let Some(diag) = check_member_token(
                    id_tok,
                    &interp.expression,
                    interp.expr_token.start_offset,
                    analysis,
                    &scope,
                    type_defs,
                    current_file_content,
                ) {
                    diagnostics.push(diag);
                }
            }
        }

        // Pipe checks (NG8004)
        for pipe in &interp.pipes {
            let lower_pipe = pipe.name.to_lowercase();
            let expected_cls = format!("{}pipe", lower_pipe);

            let is_standard_pipe = matches!(
                lower_pipe.as_str(),
                "uppercase"
                    | "lowercase"
                    | "json"
                    | "date"
                    | "currency"
                    | "slice"
                    | "async"
                    | "percent"
                    | "decimal"
            );

            // 1. Check if defined in type_defs (workspace, imports, or local)
            let pipe_def = type_defs.iter().find(|t| {
                if t.kind == "pipe" {
                    if let Some(ref raw) = t.raw_type {
                        if raw.eq_ignore_ascii_case(&pipe.name) {
                            return true;
                        }
                    }
                }
                t.name.to_lowercase() == expected_cls
                    || (t.kind == "pipe" && t.name.to_lowercase() == lower_pipe)
            });

            // 2. Check if explicitly imported in @Component.imports or file imports
            let is_imported = if let Some(ref imps) = analysis.component_imports {
                imps.iter().any(|imp| {
                    let imp_low = imp.to_lowercase();
                    imp_low == expected_cls
                        || imp_low == lower_pipe
                        || imp_low
                            .strip_suffix("pipe")
                            .map_or(false, |s| s == lower_pipe)
                        || (is_standard_pipe && imp_low == "commonmodule")
                        || pipe_def.map_or(false, |pd| {
                            imp_low == pd.name.to_lowercase()
                                || imp_low == format!("{}pipe", pd.name.to_lowercase())
                        })
                })
            } else {
                pipe_def.is_some()
                    || analysis.imports.iter().any(|imp| {
                        let imp_low = imp.name.to_lowercase();
                        imp_low == expected_cls
                            || imp_low == lower_pipe
                            || imp_low
                                .strip_suffix("pipe")
                                .map_or(false, |s| s == lower_pipe)
                            || (is_standard_pipe && imp_low == "commonmodule")
                    })
            };

            if !is_imported {
                diagnostics.push(LspDiagnostic {
                    code: "NG8004".to_string(),
                    message: format!(
                        "No pipe found with name '{}'. Verify that it is included in the '@Component.imports' of '{}'.",
                        pipe.name, analysis.class_name
                    ),
                    severity: "error".to_string(),
                    range: pipe.token.file_range.clone(),
                    source: "angora-compiler".to_string(),
                });
            }
        }

        let inferred = infer_expression_type(&interp.expression, analysis, &scope, type_defs);
        if let Some(non_callable) = inferred.non_callable_call {
            let prop_type = analysis
                .properties
                .iter()
                .find(|p| p.name == non_callable)
                .map(|p| p.raw_type.as_str())
                .unwrap_or("number");
            diagnostics.push(LspDiagnostic {
                code: "TS2349".to_string(),
                message: format!(
                    "This expression is not callable. Type '{}' has no call signatures.",
                    prop_type
                ),
                severity: "error".to_string(),
                range: interp.expr_token.file_range.clone(),
                source: "angora-typecheck".to_string(),
            });
        }
    }

    // 2. Check Control Flow Blocks (@if, @for)
    for cf in &template.control_flows {
        for id_tok in &cf.identifier_tokens {
            if id_tok.kind == "identifier" {
                let name = &id_tok.text;
                if name == "this" || name == "$event" {
                    continue;
                }
                if !scope.contains_key(name)
                    && !analysis.properties.iter().any(|p| p.name == *name)
                    && !analysis.methods.iter().any(|m| m.name == *name)
                {
                    diagnostics.push(LspDiagnostic {
                        code: "TS2339".to_string(),
                        message: format!(
                            "Property '{}' does not exist on type '{}'.",
                            name, analysis.class_name
                        ),
                        severity: "error".to_string(),
                        range: id_tok.file_range.clone(),
                        source: "angora-typecheck".to_string(),
                    });
                }
            } else if id_tok.kind == "member" {
                let cf_expr = cf.expression.as_deref().unwrap_or("");
                let offset = cf.expr_token.as_ref().map(|t| t.start_offset).unwrap_or(0);
                if let Some(diag) = check_member_token(
                    id_tok,
                    cf_expr,
                    offset,
                    analysis,
                    &scope,
                    type_defs,
                    current_file_content,
                ) {
                    diagnostics.push(diag);
                }
            }
        }
    }

    // 3. Check Elements and Property Bindings
    let standard_tags = [
        "a",
        "abbr",
        "address",
        "area",
        "article",
        "aside",
        "audio",
        "b",
        "base",
        "bdi",
        "bdo",
        "blockquote",
        "body",
        "br",
        "button",
        "canvas",
        "caption",
        "cite",
        "code",
        "col",
        "colgroup",
        "data",
        "datalist",
        "dd",
        "del",
        "details",
        "dfn",
        "dialog",
        "div",
        "dl",
        "dt",
        "em",
        "embed",
        "fieldset",
        "figcaption",
        "figure",
        "footer",
        "form",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "head",
        "header",
        "hgroup",
        "hr",
        "html",
        "i",
        "iframe",
        "img",
        "input",
        "ins",
        "kbd",
        "label",
        "legend",
        "li",
        "link",
        "main",
        "map",
        "mark",
        "menu",
        "meta",
        "meter",
        "nav",
        "noscript",
        "object",
        "ol",
        "optgroup",
        "option",
        "output",
        "p",
        "picture",
        "portal",
        "pre",
        "progress",
        "q",
        "rp",
        "rt",
        "ruby",
        "s",
        "samp",
        "script",
        "search",
        "section",
        "select",
        "slot",
        "small",
        "source",
        "span",
        "strong",
        "style",
        "sub",
        "summary",
        "sup",
        "table",
        "tbody",
        "td",
        "template",
        "textarea",
        "tfoot",
        "th",
        "thead",
        "time",
        "title",
        "tr",
        "track",
        "u",
        "ul",
        "var",
        "video",
        "wbr",
        "svg",
        "path",
        "circle",
        "rect",
        "line",
        "polygon",
        "polyline",
        "g",
        "defs",
        "use",
        "text",
        "ng-content",
        "ng-container",
        "ng-template",
        "router-outlet",
    ];

    for el in &template.elements {
        let tag_low = el.tag.to_lowercase();
        let is_std = standard_tags.contains(&tag_low.as_str());
        if !is_std {
            let imported = analysis
                .component_imports
                .as_ref()
                .map(|imps| {
                    let tag_norm = el.tag.replace('-', "").to_lowercase();
                    let tag_stripped = el
                        .tag
                        .split_once('-')
                        .map(|(_, rest)| rest.replace('-', "").to_lowercase())
                        .unwrap_or_default();

                    imps.iter().any(|i| {
                        let i_low = i.to_lowercase();
                        let imp_norm = i
                            .replace("Component", "")
                            .replace("Directive", "")
                            .replace('-', "")
                            .to_lowercase();

                        // 1. Direct match on normalized name or stripped prefix
                        imp_norm == tag_norm
                            || (!tag_stripped.is_empty() && imp_norm == tag_stripped)
                            // 2. Substring matching (e.g. "apptodoitem".contains("todoitem"))
                            || (!imp_norm.is_empty() && tag_norm.contains(&imp_norm))
                            || (!tag_norm.is_empty() && imp_norm.contains(&tag_norm))
                            || i_low.contains(&tag_norm)
                            // 3. Check if any type_def for this import matches the tag selector
                            || type_defs.iter().any(|t| {
                                t.name.eq_ignore_ascii_case(i)
                                    && t.raw_type.as_ref().map_or(false, |sel| sel.eq_ignore_ascii_case(&el.tag))
                            })
                    })
                })
                .unwrap_or(false);

            if !imported {
                diagnostics.push(LspDiagnostic {
                    code: "NG8001".to_string(),
                    message: format!("'{}' is not a known element: 1. If '{}' is an Angora component, verify that it is included in the '@Component.imports' of '{}'...", el.tag, el.tag, analysis.class_name),
                    severity: "error".to_string(),
                    range: el.tag_token.file_range.clone(),
                    source: "angora-compiler".to_string(),
                });
            }
        }
        for prop in &el.properties {
            for id_tok in &prop.identifier_tokens {
                if id_tok.kind == "identifier" {
                    let name = &id_tok.text;
                    if name == "this" || name == "$event" {
                        continue;
                    }
                    if !scope.contains_key(name)
                        && !analysis.properties.iter().any(|p| p.name == *name)
                        && !analysis.methods.iter().any(|m| m.name == *name)
                    {
                        diagnostics.push(LspDiagnostic {
                            code: "TS2339".to_string(),
                            message: format!(
                                "Property '{}' does not exist on type '{}'.",
                                name, analysis.class_name
                            ),
                            severity: "error".to_string(),
                            range: id_tok.file_range.clone(),
                            source: "angora-typecheck".to_string(),
                        });
                    }
                } else if id_tok.kind == "member" {
                    if let Some(diag) = check_member_token(
                        id_tok,
                        &prop.expression,
                        prop.expr_token.start_offset,
                        analysis,
                        &scope,
                        type_defs,
                        current_file_content,
                    ) {
                        diagnostics.push(diag);
                    }
                }
            }

            // Check property type compatibility
            if let Some(expected_type) = get_expected_property_type(&el.tag, &prop.name) {
                let inferred = infer_expression_type(&prop.expression, analysis, &scope, type_defs);

                if let Some(uncalled) = inferred.uncalled_signal {
                    let unwrapped = analysis
                        .properties
                        .iter()
                        .find(|p| p.name == uncalled)
                        .map(|p| p.unwrapped_type.as_str())
                        .unwrap_or("boolean");
                    diagnostics.push(LspDiagnostic {
                        code: "TS2322".to_string(),
                        message: format!("Type 'Signal<{}>' is not assignable to type '{}'. Did you mean to call '{}()'?", unwrapped, expected_type, uncalled),
                        severity: "error".to_string(),
                        range: prop.expr_token.file_range.clone(),
                        source: "angora-typecheck".to_string(),
                    });
                } else if !is_type_assignable(&inferred.r#type, &expected_type) {
                    diagnostics.push(LspDiagnostic {
                        code: "TS2322".to_string(),
                        message: format!(
                            "Type '{}' is not assignable to type '{}'.",
                            inferred.r#type, expected_type
                        ),
                        severity: "error".to_string(),
                        range: prop.full_range.clone(),
                        source: "angora-typecheck".to_string(),
                    });
                }
            }
        }

        // Event bindings
        for ev in &el.events {
            for id_tok in &ev.identifier_tokens {
                if id_tok.kind == "identifier" {
                    let name = &id_tok.text;
                    if name == "this" || name == "$event" {
                        continue;
                    }
                    if !scope.contains_key(name)
                        && !analysis.properties.iter().any(|p| p.name == *name)
                        && !analysis.methods.iter().any(|m| m.name == *name)
                    {
                        diagnostics.push(LspDiagnostic {
                            code: "TS2339".to_string(),
                            message: format!(
                                "Property '{}' does not exist on type '{}'.",
                                name, analysis.class_name
                            ),
                            severity: "error".to_string(),
                            range: id_tok.file_range.clone(),
                            source: "angora-typecheck".to_string(),
                        });
                    }
                } else if id_tok.kind == "member" {
                    if let Some(diag) = check_member_token(
                        id_tok,
                        &ev.handler,
                        ev.handler_token.start_offset,
                        analysis,
                        &scope,
                        type_defs,
                        current_file_content,
                    ) {
                        diagnostics.push(diag);
                    }
                }
            }
        }

        // Two-way bindings
        for tw in &el.two_way_bindings {
            for id_tok in &tw.identifier_tokens {
                if id_tok.kind == "identifier" {
                    let name = &id_tok.text;
                    if name == "this" || name == "$event" {
                        continue;
                    }
                    if !scope.contains_key(name)
                        && !analysis.properties.iter().any(|p| p.name == *name)
                        && !analysis.methods.iter().any(|m| m.name == *name)
                    {
                        diagnostics.push(LspDiagnostic {
                            code: "TS2339".to_string(),
                            message: format!(
                                "Property '{}' does not exist on type '{}'.",
                                name, analysis.class_name
                            ),
                            severity: "error".to_string(),
                            range: id_tok.file_range.clone(),
                            source: "angora-typecheck".to_string(),
                        });
                    }
                } else if id_tok.kind == "member" {
                    if let Some(diag) = check_member_token(
                        id_tok,
                        &tw.expression,
                        tw.expr_token.start_offset,
                        analysis,
                        &scope,
                        type_defs,
                        current_file_content,
                    ) {
                        diagnostics.push(diag);
                    }
                }
            }
        }
    }

    diagnostics
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lsp::analyzer::analyze_components_lsp;
    use crate::lsp::template_parser::parse_template_document;

    #[test]
    fn test_extract_left_hand_expression() {
        assert_eq!(
            extract_left_hand_expression("customerControl"),
            "customerControl"
        );
        assert_eq!(extract_left_hand_expression("a && orderForm"), "orderForm");
        assert_eq!(extract_left_hand_expression("!user"), "user");
        assert_eq!(extract_left_hand_expression("foo.bar"), "foo.bar");
        assert_eq!(extract_left_hand_expression("foo().bar"), "foo().bar");
    }

    #[test]
    fn test_type_checker_diagnostics() {
        let source = r#"import { Component, signal } from '@angora-js/core';
import { FormControl, FormGroup } from '@angora-js/forms';

@Component({
  selector: 'app-test',
  template: `
    <div>
      <input [disabled]="isLocked" [value]="title()" />
      <input [disabled]="title()" />
      <span>{{ nonExistentProp }}</span>
      <span>{{ customerControl.invalidMethod() }}</span>
      <span>{{ this.nonExistentMethod() }}</span>
      <span>{{ orderForm.controls.userName.value }}</span>
      <span>{{ orderForm.controls.nonExistentControl }}</span>
    </div>
  `
})
export class TestComponent {
  title = signal<string>('Hello');
  isLocked = signal<boolean>(false);
  customerControl = new FormControl('Alice');
  orderForm = new FormGroup({
    userName: new FormControl('Alice'),
  });
}
"#;
        let analysis_res =
            analyze_components_lsp(source, Some("file:///test.component.ts".to_string()));
        assert_eq!(analysis_res.components.len(), 1);
        let comp = &analysis_res.components[0];
        let tmpl_info = comp.template.as_ref().unwrap();

        let parsed = parse_template_document(&tmpl_info.content, tmpl_info.offset as usize, source);
        let diags = check_template_types(&parsed, comp, &analysis_res.type_defs, Some(source));

        // 1. [disabled]="isLocked" (Signal uncalled TS2322)
        assert!(
            diags
                .iter()
                .any(|d| d.code == "TS2322"
                    && d.message.contains("Did you mean to call 'isLocked()'"))
        );
        // 2. [disabled]="title()" (string vs boolean TS2322)
        assert!(diags.iter().any(|d| d.code == "TS2322"
            && d.message
                .contains("Type 'string' is not assignable to type 'boolean'")));
        // 3. nonExistentProp (TS2339)
        assert!(diags.iter().any(|d| d.code == "TS2339"
            && d.message
                .contains("Property 'nonExistentProp' does not exist on type 'TestComponent'")));
        // 4. customerControl.invalidMethod() (TS2339)
        assert!(diags.iter().any(|d| d.code == "TS2339"
            && d.message.contains(
                "Property 'invalidMethod' does not exist on type 'FormControl<string>'"
            )));
        // 5. this.nonExistentMethod() (TS2339)
        assert!(diags.iter().any(|d| d.code == "TS2339"
            && d.message
                .contains("Property 'nonExistentMethod' does not exist on type 'TestComponent'")));
        // 6. orderForm.controls.nonExistentControl (TS2339 on dynamically inferred controls type)
        assert!(diags.iter().any(|d| d.code == "TS2339"
            && d.message.contains(
                "Property 'nonExistentControl' does not exist on type 'orderForm.controls'"
            )));
        assert!(!diags.iter().any(|d| d.message.contains("userName")));
    }

    #[test]
    fn test_signal_set_and_update_diagnostics() {
        let source = r#"import { Component, signal, computed } from '@angora-js/core';

@Component({
  selector: 'app-signal-test',
  template: `
    <div>
      <button (click)="isOpen.set(!isOpen())">Toggle</button>
      <button (click)="count.update(n => n + 1)">Increment</button>
      <button (click)="readOnlyCount.set(10)">Invalid Set</button>
    </div>
  `
})
export class SignalTestComponent {
  isOpen = signal(false);
  count = signal(0);
  readOnlyCount = computed(() => this.count() * 2);
}
"#;
        let analysis_res =
            analyze_components_lsp(source, Some("file:///signal-test.component.ts".to_string()));
        assert_eq!(analysis_res.components.len(), 1);
        let comp = &analysis_res.components[0];
        let tmpl_info = comp.template.as_ref().unwrap();

        let parsed = parse_template_document(&tmpl_info.content, tmpl_info.offset as usize, source);
        let diags = check_template_types(&parsed, comp, &analysis_res.type_defs, Some(source));

        assert!(analysis_res
            .type_defs
            .iter()
            .any(|td| td.name == "WritableSignal"));
        let ws_td = analysis_res
            .type_defs
            .iter()
            .find(|td| td.name == "WritableSignal")
            .unwrap();
        assert!(ws_td.methods.iter().any(|m| m.name == "set"));
        assert!(ws_td.methods.iter().any(|m| m.name == "update"));

        // isOpen.set(!isOpen()) and count.update(...) MUST NOT produce TS2339
        assert!(!diags.iter().any(
            |d| d.message.contains("Property 'set' does not exist on type")
                && d.message.contains("isOpen")
        ));
        assert!(!diags.iter().any(|d| d
            .message
            .contains("Property 'update' does not exist on type")
            && d.message.contains("count")));

        // readOnlyCount is a computed signal: calling .set(10) MUST produce TS2339
        assert!(diags.iter().any(|d| d.code == "TS2339"
            && d.message
                .contains("Property 'set' does not exist on type 'Signal<number>'")));
    }

    #[test]
    fn test_pipe_strict_import_diagnostics() {
        // 1. Unimported built-in pipe 'uppercase' MUST trigger NG8004
        let unimported_source = r#"import { Component, signal } from '@angora-js/core';

@Component({
  selector: 'app-pipe-test',
  imports: [],
  template: `
    <div>
      <span>{{ name() | uppercase }}</span>
    </div>
  `
})
export class PipeTestComponent {
  name = signal('alice');
}
"#;
        let res1 = analyze_components_lsp(
            unimported_source,
            Some("file:///pipe-test.component.ts".to_string()),
        );
        let comp1 = &res1.components[0];
        let tmpl1 = comp1.template.as_ref().unwrap();
        let parsed1 =
            parse_template_document(&tmpl1.content, tmpl1.offset as usize, unimported_source);
        let diags1 =
            check_template_types(&parsed1, comp1, &res1.type_defs, Some(unimported_source));

        let ng8004 = diags1.iter().find(|d| d.code == "NG8004");
        assert!(
            ng8004.is_some(),
            "Expected NG8004 for unimported 'uppercase' pipe"
        );
        assert!(ng8004
            .unwrap()
            .message
            .contains("No pipe found with name 'uppercase'"));
        assert!(ng8004.unwrap().message.contains("PipeTestComponent"));

        // 2. Explicitly imported UpperCasePipe MUST NOT trigger NG8004
        let imported_source = r#"import { Component, signal, UpperCasePipe } from '@angora-js/core';

@Component({
  selector: 'app-pipe-test',
  imports: [UpperCasePipe],
  template: `
    <div>
      <span>{{ name() | uppercase }}</span>
    </div>
  `
})
export class PipeTestComponent {
  name = signal('alice');
}
"#;
        let res2 = analyze_components_lsp(
            imported_source,
            Some("file:///pipe-test.component.ts".to_string()),
        );
        let comp2 = &res2.components[0];
        let tmpl2 = comp2.template.as_ref().unwrap();
        let parsed2 =
            parse_template_document(&tmpl2.content, tmpl2.offset as usize, imported_source);
        let diags2 = check_template_types(&parsed2, comp2, &res2.type_defs, Some(imported_source));

        assert!(
            !diags2.iter().any(|d| d.code == "NG8004"),
            "UpperCasePipe was imported, expected no NG8004"
        );

        // 3. CommonModule import MUST satisfy standard pipes
        let common_source = r#"import { Component, signal, CommonModule } from '@angora-js/core';

@Component({
  selector: 'app-pipe-test',
  imports: [CommonModule],
  template: `
    <div>
      <span>{{ name() | uppercase }}</span>
    </div>
  `
})
export class PipeTestComponent {
  name = signal('alice');
}
"#;
        let res3 = analyze_components_lsp(
            common_source,
            Some("file:///pipe-test.component.ts".to_string()),
        );
        let comp3 = &res3.components[0];
        let tmpl3 = comp3.template.as_ref().unwrap();
        let parsed3 = parse_template_document(&tmpl3.content, tmpl3.offset as usize, common_source);
        let diags3 = check_template_types(&parsed3, comp3, &res3.type_defs, Some(common_source));

        assert!(
            !diags3.iter().any(|d| d.code == "NG8004"),
            "CommonModule was imported, expected no NG8004"
        );
    }
}
