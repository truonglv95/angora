use super::analyzer::{LineIndex, LspRange};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateToken {
    pub text: String,
    pub kind: String,
    pub start_offset: usize,
    pub end_offset: usize,
    pub template_range: LspRange,
    pub file_range: LspRange,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_property: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_element: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedPropertyBinding {
    pub name: String,
    pub expression: String,
    pub name_token: TemplateToken,
    pub expr_token: TemplateToken,
    pub identifier_tokens: Vec<TemplateToken>,
    pub full_range: LspRange,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedEventBinding {
    pub name: String,
    pub handler: String,
    pub name_token: TemplateToken,
    pub handler_token: TemplateToken,
    pub identifier_tokens: Vec<TemplateToken>,
    pub full_range: LspRange,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedTwoWayBinding {
    pub name: String,
    pub expression: String,
    pub name_token: TemplateToken,
    pub expr_token: TemplateToken,
    pub identifier_tokens: Vec<TemplateToken>,
    pub full_range: LspRange,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedReference {
    pub name: String,
    pub token: TemplateToken,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedPipe {
    pub name: String,
    pub token: TemplateToken,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedInterpolation {
    pub raw: String,
    pub expression: String,
    pub expr_token: TemplateToken,
    pub identifier_tokens: Vec<TemplateToken>,
    pub pipes: Vec<ParsedPipe>,
    pub full_range: LspRange,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedControlFlow {
    pub keyword: String,
    pub keyword_token: TemplateToken,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expression: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expr_token: Option<TemplateToken>,
    pub identifier_tokens: Vec<TemplateToken>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item_name_token: Option<TemplateToken>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub iterable: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub iterable_token: Option<TemplateToken>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub track_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub track_by_token: Option<TemplateToken>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedElement {
    pub tag: String,
    pub tag_token: TemplateToken,
    pub properties: Vec<ParsedPropertyBinding>,
    pub events: Vec<ParsedEventBinding>,
    pub two_way_bindings: Vec<ParsedTwoWayBinding>,
    pub references: Vec<ParsedReference>,
    pub start_range: LspRange,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyntaxError {
    pub message: String,
    pub range: LspRange,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedTemplate {
    pub tokens: Vec<TemplateToken>,
    pub elements: Vec<ParsedElement>,
    pub interpolations: Vec<ParsedInterpolation>,
    pub control_flows: Vec<ParsedControlFlow>,
    pub syntax_errors: Vec<SyntaxError>,
}

pub fn mask_comments(template: &str) -> String {
    let mut bytes = template.as_bytes().to_vec();
    let len = bytes.len();
    let mut i = 0;

    while i < len {
        // 1. HTML Comment <!-- ... -->
        if i + 3 < len
            && bytes[i] == b'<'
            && bytes[i + 1] == b'!'
            && bytes[i + 2] == b'-'
            && bytes[i + 3] == b'-'
        {
            let start = i;
            i += 4;
            while i < len {
                if i + 2 < len && bytes[i] == b'-' && bytes[i + 1] == b'-' && bytes[i + 2] == b'>' {
                    i += 3;
                    break;
                }
                i += 1;
            }
            for k in start..i {
                if bytes[k] != b'\n' && bytes[k] != b'\r' {
                    bytes[k] = b' ';
                }
            }
            continue;
        }

        // 2. Block Comment /* ... */
        if i + 1 < len && bytes[i] == b'/' && bytes[i + 1] == b'*' {
            let start = i;
            i += 2;
            while i < len {
                if i + 1 < len && bytes[i] == b'*' && bytes[i + 1] == b'/' {
                    i += 2;
                    break;
                }
                i += 1;
            }
            for k in start..i {
                if bytes[k] != b'\n' && bytes[k] != b'\r' {
                    bytes[k] = b' ';
                }
            }
            continue;
        }

        // 3. Line Comment // ...
        if i + 1 < len && bytes[i] == b'/' && bytes[i + 1] == b'/' {
            let mut line_start = i;
            while line_start > 0 && bytes[line_start - 1] != b'\n' && bytes[line_start - 1] != b'\r'
            {
                line_start -= 1;
            }
            let is_comment_line = bytes[line_start..i]
                .iter()
                .all(|&b| b == b' ' || b == b'\t');
            if is_comment_line {
                let start = i;
                while i < len && bytes[i] != b'\n' && bytes[i] != b'\r' {
                    i += 1;
                }
                for k in start..i {
                    bytes[k] = b' ';
                }
                continue;
            }
        }

        i += 1;
    }

    String::from_utf8(bytes).unwrap_or_else(|_| template.to_string())
}

pub fn find_matching_paren(text: &str, open_paren_idx: usize) -> Option<usize> {
    if open_paren_idx >= text.len() {
        return None;
    }
    let mut depth = 0;
    let mut in_quote: Option<char> = None;
    let mut prev = '\0';

    for (rel_byte, ch) in text[open_paren_idx..].char_indices() {
        if let Some(q) = in_quote {
            if ch == q && prev != '\\' {
                in_quote = None;
            }
        } else {
            if ch == '"' || ch == '\'' || ch == '`' {
                in_quote = Some(ch);
            } else if ch == '(' {
                depth += 1;
            } else if ch == ')' {
                depth -= 1;
                if depth == 0 {
                    return Some(open_paren_idx + rel_byte);
                }
            }
        }
        prev = ch;
    }
    None
}

// Standard JS keywords that shouldn't be diagnosed as missing properties

fn is_js_keyword(s: &str) -> bool {
    matches!(
        s,
        "true"
            | "false"
            | "null"
            | "undefined"
            | "Math"
            | "Date"
            | "String"
            | "Number"
            | "Boolean"
            | "Array"
            | "Object"
            | "JSON"
            | "typeof"
            | "instanceof"
            | "in"
            | "of"
            | "track"
            | "let"
            | "const"
            | "var"
            | "new"
            | "void"
    )
}

struct ParserContext<'a> {
    template_index: &'a LineIndex<'a>,
    file_index: &'a LineIndex<'a>,
    base_file_offset: usize,
    tokens: Vec<TemplateToken>,
}

impl<'a> ParserContext<'a> {
    fn create_token(
        &mut self,
        text: String,
        kind: &str,
        tmpl_start: usize,
        tmpl_end: usize,
        parent_element: Option<String>,
        parent_property: Option<String>,
    ) -> TemplateToken {
        let file_start = self.base_file_offset + tmpl_start;
        let file_end = self.base_file_offset + tmpl_end;
        let tok = TemplateToken {
            text,
            kind: kind.to_string(),
            start_offset: tmpl_start,
            end_offset: tmpl_end,
            template_range: self.template_index.range_at(tmpl_start, tmpl_end),
            file_range: self.file_index.range_at(file_start, file_end),
            parent_property,
            parent_element,
        };
        self.tokens.push(tok.clone());
        tok
    }

    fn extract_identifiers_from_expr(
        &mut self,
        expr: &str,
        expr_start_in_tmpl: usize,
        parent_element: Option<String>,
        parent_property: Option<String>,
        scope_vars: &HashSet<String>,
    ) -> Vec<TemplateToken> {
        let mut id_tokens = Vec::new();
        let mut in_quote: Option<char> = None;
        let mut current_ident = String::new();
        let mut ident_start_byte: Option<usize> = None;
        let mut after_dot = false;
        let mut prev = '\0';

        for (byte_idx, ch) in expr.char_indices() {
            if let Some(q) = in_quote {
                if ch == q && prev != '\\' {
                    in_quote = None;
                }
            } else {
                if ch == '"' || ch == '\'' || ch == '`' {
                    in_quote = Some(ch);
                } else if ch == '.' {
                    if let Some(start) = ident_start_byte {
                        if !is_js_keyword(&current_ident) && !scope_vars.contains(&current_ident) {
                            let id_start = expr_start_in_tmpl + start;
                            let id_end = expr_start_in_tmpl + byte_idx;
                            let kind = if after_dot { "member" } else { "identifier" };
                            let tok = self.create_token(
                                current_ident.clone(),
                                kind,
                                id_start,
                                id_end,
                                parent_element.clone(),
                                parent_property.clone(),
                            );
                            id_tokens.push(tok);
                        }
                        ident_start_byte = None;
                        current_ident.clear();
                    }
                    after_dot = true;
                } else if ch.is_alphanumeric() || ch == '_' || ch == '$' {
                    if ident_start_byte.is_none() {
                        if !ch.is_ascii_digit() {
                            ident_start_byte = Some(byte_idx);
                            current_ident.push(ch);
                        }
                    } else {
                        current_ident.push(ch);
                    }
                } else {
                    if let Some(start) = ident_start_byte {
                        if !is_js_keyword(&current_ident) && !scope_vars.contains(&current_ident) {
                            let id_start = expr_start_in_tmpl + start;
                            let id_end = expr_start_in_tmpl + byte_idx;
                            let kind = if after_dot { "member" } else { "identifier" };
                            let tok = self.create_token(
                                current_ident.clone(),
                                kind,
                                id_start,
                                id_end,
                                parent_element.clone(),
                                parent_property.clone(),
                            );
                            id_tokens.push(tok);
                        }
                        ident_start_byte = None;
                        current_ident.clear();
                    }
                    if !ch.is_whitespace() && ch != '?' {
                        after_dot = false;
                    }
                }
            }
            prev = ch;
        }

        if let Some(start) = ident_start_byte {
            if !is_js_keyword(&current_ident) && !scope_vars.contains(&current_ident) {
                let id_start = expr_start_in_tmpl + start;
                let id_end = expr_start_in_tmpl + expr.len();
                let kind = if after_dot { "member" } else { "identifier" };
                let tok = self.create_token(
                    current_ident,
                    kind,
                    id_start,
                    id_end,
                    parent_element,
                    parent_property,
                );
                id_tokens.push(tok);
            }
        }

        id_tokens
    }
}

pub fn parse_template_document(
    template_html: &str,
    base_file_offset: usize,
    entire_file_content: &str,
) -> ParsedTemplate {
    let template_index = LineIndex::new(template_html);
    let file_index = LineIndex::new(entire_file_content);

    let mut ctx = ParserContext {
        template_index: &template_index,
        file_index: &file_index,
        base_file_offset,
        tokens: Vec::new(),
    };

    let active_tmpl = mask_comments(template_html);
    let mut interpolations = Vec::new();
    let mut control_flows = Vec::new();
    let mut elements = Vec::new();
    let syntax_errors = Vec::new();

    // 1. Parse Interpolations {{ expr }}
    let mut search_pos = 0;
    while let Some(start_idx) = active_tmpl[search_pos..].find("{{") {
        let tmpl_start = search_pos + start_idx;
        if let Some(end_idx) = active_tmpl[tmpl_start + 2..].find("}}") {
            let tmpl_end = tmpl_start + 2 + end_idx + 2;
            let raw_content = &active_tmpl[tmpl_start + 2..tmpl_start + 2 + end_idx];
            let raw_trimmed = raw_content.trim();

            let leading_ws = raw_content.len() - raw_content.trim_start().len();
            let expr_start = tmpl_start + 2 + leading_ws;

            let full_range = ctx
                .file_index
                .range_at(base_file_offset + tmpl_start, base_file_offset + tmpl_end);

            // Check for pipes: expr | pipeName:arg
            let mut pipe_tokens = Vec::new();
            let mut main_expr = raw_trimmed;
            let pipe_splits: Vec<&str> = raw_trimmed.split('|').collect();

            if pipe_splits.len() > 1 {
                main_expr = pipe_splits[0].trim();
                let mut current_offset = expr_start + pipe_splits[0].len();

                for pipe_part in &pipe_splits[1..] {
                    let pipe_trimmed = pipe_part.trim();
                    let p_leading = pipe_part.len() - pipe_part.trim_start().len();
                    let pipe_name = pipe_trimmed.split(':').next().unwrap_or("").trim();
                    let p_start = current_offset + 1 + p_leading;
                    let p_end = p_start + pipe_name.len();

                    let p_tok =
                        ctx.create_token(pipe_name.to_string(), "pipe", p_start, p_end, None, None);
                    pipe_tokens.push(ParsedPipe {
                        name: pipe_name.to_string(),
                        token: p_tok,
                    });

                    current_offset += 1 + pipe_part.len();
                }
            }

            let expr_tok = ctx.create_token(
                main_expr.to_string(),
                "expression",
                expr_start,
                expr_start + main_expr.len(),
                None,
                None,
            );

            let empty_scope = HashSet::new();
            let id_tokens =
                ctx.extract_identifiers_from_expr(main_expr, expr_start, None, None, &empty_scope);

            interpolations.push(ParsedInterpolation {
                raw: active_tmpl[tmpl_start..tmpl_end].to_string(),
                expression: main_expr.to_string(),
                expr_token: expr_tok,
                identifier_tokens: id_tokens,
                pipes: pipe_tokens,
                full_range,
            });

            search_pos = tmpl_end;
        } else {
            break;
        }
    }

    // 2. Parse Control Flow: @if, @else if, @else, @for, @switch, @case, @default, @defer
    let cf_keywords = [
        "@if",
        "@else if",
        "@else",
        "@for",
        "@empty",
        "@switch",
        "@case",
        "@default",
        "@defer",
        "@placeholder",
        "@loading",
        "@error",
    ];

    let mut cf_pos = 0;
    while cf_pos < active_tmpl.len() {
        if let Some(at_idx) = active_tmpl[cf_pos..].find('@') {
            let start = cf_pos + at_idx;
            let mut matched_kw: Option<&str> = None;
            for &kw in &cf_keywords {
                if active_tmpl[start..].starts_with(kw) {
                    // Ensure boundary: next char is space or '('
                    let next_ch = active_tmpl[start + kw.len()..].chars().next();
                    if next_ch.map_or(true, |c| c.is_whitespace() || c == '(' || c == '{') {
                        matched_kw = Some(kw);
                        break;
                    }
                }
            }

            if let Some(kw) = matched_kw {
                let kw_tok = ctx.create_token(
                    kw.to_string(),
                    "keyword",
                    start,
                    start + kw.len(),
                    None,
                    None,
                );

                let after_kw = start + kw.len();
                let slice = &active_tmpl[after_kw..];
                let mut expr_str: Option<String> = None;
                let mut expr_tok: Option<TemplateToken> = None;
                let mut id_tokens = Vec::new();
                let mut item_name: Option<String> = None;
                let mut item_name_token: Option<TemplateToken> = None;
                let mut iterable: Option<String> = None;
                let mut iterable_token: Option<TemplateToken> = None;
                let mut track_by: Option<String> = None;
                let mut track_by_token: Option<TemplateToken> = None;

                if let Some(open_p) = slice.find('(') {
                    // Check if only whitespace between keyword and '('
                    if slice[..open_p].trim().is_empty() {
                        let global_open = after_kw + open_p;
                        if let Some(global_close) = find_matching_paren(&active_tmpl, global_open) {
                            let inner_expr = &active_tmpl[global_open + 1..global_close];
                            let trimmed_inner = inner_expr.trim();
                            let leading_ws = inner_expr.len() - inner_expr.trim_start().len();
                            let e_start = global_open + 1 + leading_ws;
                            let e_end = e_start + trimmed_inner.len();

                            let et = ctx.create_token(
                                trimmed_inner.to_string(),
                                "expression",
                                e_start,
                                e_end,
                                None,
                                None,
                            );

                            if kw == "@for" {
                                // Parse: item of items; track item.id; let i = $index
                                if let Some(of_idx) = trimmed_inner.find(" of ") {
                                    let item_str = trimmed_inner[..of_idx].trim();
                                    let item_start = e_start
                                        + (trimmed_inner[..of_idx].len()
                                            - trimmed_inner[..of_idx].trim_start().len());
                                    let it_tok = ctx.create_token(
                                        item_str.to_string(),
                                        "identifier",
                                        item_start,
                                        item_start + item_str.len(),
                                        None,
                                        None,
                                    );
                                    item_name = Some(item_str.to_string());
                                    item_name_token = Some(it_tok);

                                    let rest = &trimmed_inner[of_idx + 4..];
                                    let rest_start = e_start + of_idx + 4;
                                    let semi_idx = rest.find(';').unwrap_or(rest.len());
                                    let iter_str = rest[..semi_idx].trim();
                                    let iter_start = rest_start
                                        + (rest[..semi_idx].len()
                                            - rest[..semi_idx].trim_start().len());
                                    let iter_tok = ctx.create_token(
                                        iter_str.to_string(),
                                        "expression",
                                        iter_start,
                                        iter_start + iter_str.len(),
                                        None,
                                        None,
                                    );
                                    iterable = Some(iter_str.to_string());
                                    iterable_token = Some(iter_tok);

                                    let empty_scope = HashSet::new();
                                    id_tokens.extend(ctx.extract_identifiers_from_expr(
                                        iter_str,
                                        iter_start,
                                        None,
                                        None,
                                        &empty_scope,
                                    ));

                                    if let Some(track_idx) = rest.find("track ") {
                                        let track_rest = &rest[track_idx + 6..];
                                        let tr_start = rest_start + track_idx + 6;
                                        let tr_semi =
                                            track_rest.find(';').unwrap_or(track_rest.len());
                                        let tr_str = track_rest[..tr_semi].trim();
                                        let tr_start_actual = tr_start
                                            + (track_rest[..tr_semi].len()
                                                - track_rest[..tr_semi].trim_start().len());
                                        let tr_tok = ctx.create_token(
                                            tr_str.to_string(),
                                            "expression",
                                            tr_start_actual,
                                            tr_start_actual + tr_str.len(),
                                            None,
                                            None,
                                        );
                                        track_by = Some(tr_str.to_string());
                                        track_by_token = Some(tr_tok);

                                        let mut for_scope = HashSet::new();
                                        for_scope.insert(item_str.to_string());
                                        id_tokens.extend(ctx.extract_identifiers_from_expr(
                                            tr_str,
                                            tr_start_actual,
                                            None,
                                            None,
                                            &for_scope,
                                        ));
                                    }
                                }
                            } else if kw != "@defer" {
                                let empty_scope = HashSet::new();
                                id_tokens = ctx.extract_identifiers_from_expr(
                                    trimmed_inner,
                                    e_start,
                                    None,
                                    None,
                                    &empty_scope,
                                );
                            }

                            expr_str = Some(trimmed_inner.to_string());
                            expr_tok = Some(et);
                            cf_pos = global_close + 1;
                        } else {
                            cf_pos = start + kw.len();
                        }
                    } else {
                        cf_pos = start + kw.len();
                    }
                } else {
                    cf_pos = start + kw.len();
                }

                control_flows.push(ParsedControlFlow {
                    keyword: kw.to_string(),
                    keyword_token: kw_tok,
                    expression: expr_str,
                    expr_token: expr_tok,
                    identifier_tokens: id_tokens,
                    item_name,
                    item_name_token,
                    iterable,
                    iterable_token,
                    track_by,
                    track_by_token,
                });
                continue;
            }
            cf_pos = start + 1;
        } else {
            break;
        }
    }

    // 3. Parse Elements: <tag [prop]="..." (event)="..." [(val)]="..." #ref>
    let mut el_pos = 0;
    while el_pos < active_tmpl.len() {
        if let Some(lt_idx) = active_tmpl[el_pos..].find('<') {
            let start = el_pos + lt_idx;
            // Check not closing tag </...
            if active_tmpl[start..].starts_with("</") {
                el_pos = start + 2;
                continue;
            }

            // Find end of opening tag '>'
            let mut in_q: Option<char> = None;
            let mut tag_end: Option<usize> = None;

            for (rel_byte, ch) in active_tmpl[start..].char_indices() {
                if let Some(q) = in_q {
                    if ch == q {
                        in_q = None;
                    }
                } else {
                    if ch == '"' || ch == '\'' {
                        in_q = Some(ch);
                    } else if ch == '>' {
                        tag_end = Some(start + rel_byte);
                        break;
                    }
                }
            }

            if let Some(gt_idx) = tag_end {
                let tag_content = &active_tmpl[start + 1..gt_idx];
                let tag_name = tag_content
                    .split_whitespace()
                    .next()
                    .unwrap_or("")
                    .trim_end_matches('/');

                if !tag_name.is_empty()
                    && (tag_name.chars().next().unwrap().is_alphabetic()
                        || tag_name.starts_with('_'))
                {
                    let tag_start = start + 1;
                    let tag_end_offset = tag_start + tag_name.len();
                    let tag_tok = ctx.create_token(
                        tag_name.to_string(),
                        "tag",
                        tag_start,
                        tag_end_offset,
                        Some(tag_name.to_string()),
                        None,
                    );

                    let mut props = Vec::new();
                    let mut events = Vec::new();
                    let mut two_ways = Vec::new();
                    let mut refs = Vec::new();

                    let attrs_str = &tag_content[tag_name.len()..];
                    let attrs_offset = tag_start + tag_name.len();

                    // Parse attributes in opening tag
                    let bytes = attrs_str.as_bytes();
                    let mut i = 0;
                    while i < bytes.len() {
                        if bytes[i] == b'#' {
                            // Template Reference #ref
                            let ref_start = attrs_offset + i + 1;
                            let mut k = i + 1;
                            while k < bytes.len()
                                && (bytes[k].is_ascii_alphanumeric()
                                    || bytes[k] == b'_'
                                    || bytes[k] == b'-')
                            {
                                k += 1;
                            }
                            let ref_name = &attrs_str[i + 1..k];
                            let ref_tok = ctx.create_token(
                                ref_name.to_string(),
                                "reference",
                                ref_start,
                                ref_start + ref_name.len(),
                                Some(tag_name.to_string()),
                                None,
                            );
                            refs.push(ParsedReference {
                                name: ref_name.to_string(),
                                token: ref_tok,
                            });
                            i = k;
                            continue;
                        }

                        // Property [prop]="val" or Two-Way [(prop)]="val"
                        if bytes[i] == b'[' {
                            let is_two_way = i + 1 < bytes.len() && bytes[i + 1] == b'(';
                            let close_marker = if is_two_way { ")]" } else { "]" };
                            if let Some(close_idx) = attrs_str[i..].find(close_marker) {
                                let name_start = if is_two_way { i + 2 } else { i + 1 };
                                let name_end = i + close_idx;
                                let prop_name = &attrs_str[name_start..name_end];
                                let prop_name_start = attrs_offset + name_start;
                                let prop_name_end = attrs_offset + name_end;

                                let name_tok = ctx.create_token(
                                    prop_name.to_string(),
                                    if is_two_way { "twoWay" } else { "property" },
                                    prop_name_start,
                                    prop_name_end,
                                    Some(tag_name.to_string()),
                                    Some(prop_name.to_string()),
                                );

                                // Find ="..."
                                let after_close = i + close_idx + close_marker.len();
                                if let Some(eq_idx) = attrs_str[after_close..].find('=') {
                                    let rest_after_eq = &attrs_str[after_close + eq_idx + 1..];
                                    let val_part = rest_after_eq.trim_start();
                                    let val_lead = rest_after_eq.len() - val_part.len();
                                    if !val_part.is_empty() {
                                        let q = val_part.chars().next().unwrap();
                                        if q == '"' || q == '\'' {
                                            if let Some(end_q) = val_part[1..].find(q) {
                                                let expr_val = &val_part[1..1 + end_q];
                                                let expr_start_in_attr =
                                                    after_close + eq_idx + 1 + val_lead + 1;
                                                let e_start = attrs_offset + expr_start_in_attr;
                                                let e_end = e_start + expr_val.len();

                                                let e_tok = ctx.create_token(
                                                    expr_val.to_string(),
                                                    "expression",
                                                    e_start,
                                                    e_end,
                                                    Some(tag_name.to_string()),
                                                    Some(prop_name.to_string()),
                                                );

                                                let empty_scope = HashSet::new();
                                                let id_tokens = ctx.extract_identifiers_from_expr(
                                                    expr_val,
                                                    e_start,
                                                    Some(tag_name.to_string()),
                                                    Some(prop_name.to_string()),
                                                    &empty_scope,
                                                );

                                                let full_range = ctx.file_index.range_at(
                                                    base_file_offset + prop_name_start
                                                        - (if is_two_way { 2 } else { 1 }),
                                                    base_file_offset + e_end + 1,
                                                );

                                                if is_two_way {
                                                    two_ways.push(ParsedTwoWayBinding {
                                                        name: prop_name.to_string(),
                                                        expression: expr_val.to_string(),
                                                        name_token: name_tok,
                                                        expr_token: e_tok,
                                                        identifier_tokens: id_tokens,
                                                        full_range,
                                                    });
                                                } else {
                                                    props.push(ParsedPropertyBinding {
                                                        name: prop_name.to_string(),
                                                        expression: expr_val.to_string(),
                                                        name_token: name_tok,
                                                        expr_token: e_tok,
                                                        identifier_tokens: id_tokens,
                                                        full_range,
                                                    });
                                                }
                                                i = after_close
                                                    + eq_idx
                                                    + 1
                                                    + val_lead
                                                    + 1
                                                    + end_q
                                                    + 1;
                                                continue;
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // Event (event)="handler"
                        if bytes[i] == b'(' {
                            if let Some(close_idx) = attrs_str[i..].find(')') {
                                let ev_name = &attrs_str[i + 1..i + close_idx];
                                let ev_start = attrs_offset + i + 1;
                                let ev_end = attrs_offset + i + close_idx;

                                let name_tok = ctx.create_token(
                                    ev_name.to_string(),
                                    "event",
                                    ev_start,
                                    ev_end,
                                    Some(tag_name.to_string()),
                                    Some(ev_name.to_string()),
                                );

                                let after_close = i + close_idx + 1;
                                if let Some(eq_idx) = attrs_str[after_close..].find('=') {
                                    let rest_after_eq = &attrs_str[after_close + eq_idx + 1..];
                                    let val_part = rest_after_eq.trim_start();
                                    let val_lead = rest_after_eq.len() - val_part.len();
                                    if !val_part.is_empty() {
                                        let q = val_part.chars().next().unwrap();
                                        if q == '"' || q == '\'' {
                                            if let Some(end_q) = val_part[1..].find(q) {
                                                let handler_val = &val_part[1..1 + end_q];
                                                let h_start_in_attr =
                                                    after_close + eq_idx + 1 + val_lead + 1;
                                                let h_start = attrs_offset + h_start_in_attr;
                                                let h_end = h_start + handler_val.len();

                                                let h_tok = ctx.create_token(
                                                    handler_val.to_string(),
                                                    "expression",
                                                    h_start,
                                                    h_end,
                                                    Some(tag_name.to_string()),
                                                    Some(ev_name.to_string()),
                                                );

                                                let empty_scope = HashSet::new();
                                                let id_tokens = ctx.extract_identifiers_from_expr(
                                                    handler_val,
                                                    h_start,
                                                    Some(tag_name.to_string()),
                                                    Some(ev_name.to_string()),
                                                    &empty_scope,
                                                );

                                                let full_range = ctx.file_index.range_at(
                                                    base_file_offset + ev_start - 1,
                                                    base_file_offset + h_end + 1,
                                                );

                                                events.push(ParsedEventBinding {
                                                    name: ev_name.to_string(),
                                                    handler: handler_val.to_string(),
                                                    name_token: name_tok,
                                                    handler_token: h_tok,
                                                    identifier_tokens: id_tokens,
                                                    full_range,
                                                });
                                                i = after_close
                                                    + eq_idx
                                                    + 1
                                                    + val_lead
                                                    + 1
                                                    + end_q
                                                    + 1;
                                                continue;
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        i += 1;
                    }

                    let start_range = ctx
                        .file_index
                        .range_at(base_file_offset + start, base_file_offset + gt_idx + 1);

                    elements.push(ParsedElement {
                        tag: tag_name.to_string(),
                        tag_token: tag_tok,
                        properties: props,
                        events,
                        two_way_bindings: two_ways,
                        references: refs,
                        start_range,
                    });

                    el_pos = gt_idx + 1;
                    continue;
                }
            }
            el_pos = start + 1;
        } else {
            break;
        }
    }

    ParsedTemplate {
        tokens: ctx.tokens,
        elements,
        interpolations,
        control_flows,
        syntax_errors,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mask_comments() {
        let tmpl = "<div><!-- comment --><span>/* multi */hello\n // single\nworld</span></div>";
        let masked = mask_comments(tmpl);
        assert!(!masked.contains("comment"));
        assert!(!masked.contains("multi"));
        assert!(!masked.contains("single"));
        assert!(masked.contains("hello"));
        assert!(masked.contains("world"));
    }

    #[test]
    fn test_parse_template_document() {
        let tmpl = r#"
        <div>
          <input #myInput [value]="customerControl.value()" (input)="save($event)" [(ngModel)]="name" />
          @if (customerControl.valid()) {
            <span>{{ title | uppercase }}</span>
          }
          @for (item of items; track item.id; let idx = $index) {
            <p>{{ item.name }}</p>
          }
        </div>
        "#;
        let parsed = parse_template_document(tmpl, 0, tmpl);
        assert!(!parsed.interpolations.is_empty());
        assert!(!parsed.elements.is_empty());
        assert!(!parsed.control_flows.is_empty());

        let div_el = &parsed.elements[0];
        assert_eq!(div_el.tag, "div");

        let input_el = &parsed.elements[1];
        assert_eq!(input_el.tag, "input");
        assert_eq!(input_el.references.len(), 1);
        assert_eq!(input_el.references[0].name, "myInput");
        assert_eq!(input_el.properties.len(), 1);
        assert_eq!(input_el.properties[0].name, "value");
        assert_eq!(input_el.events.len(), 1);
        assert_eq!(input_el.events[0].name, "input");
        assert_eq!(input_el.two_way_bindings.len(), 1);
        assert_eq!(input_el.two_way_bindings[0].name, "ngModel");
    }

    #[test]
    fn test_parse_template_with_multibyte_utf8_emojis() {
        let tmpl = r#"
        <div>
          <!-- Header with multi-byte emojis 📋 🚀 💡 -->
          <h1>📋 Enterprise Forms</h1>
          @if (orderForm.status() === 'VALID') {
            <span>✅ Order is valid</span>
          } @else if (orderForm.status() === 'PENDING') {
            <span>⏳ Validating...</span>
          }
        </div>
        "#;
        let parsed = parse_template_document(tmpl, 0, tmpl);
        assert_eq!(parsed.control_flows.len(), 2);
        let first_cf = &parsed.control_flows[0];
        assert_eq!(first_cf.keyword, "@if");
        assert_eq!(
            first_cf.expression.as_deref(),
            Some("orderForm.status() === 'VALID'")
        );
        assert!(first_cf
            .identifier_tokens
            .iter()
            .any(|t| t.text == "status"));
    }
}
