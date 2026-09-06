/// Scopes component CSS selectors to a specific scope attribute (e.g., _angora-c0)
/// Implements Angular ViewEncapsulation.Emulated style isolation in Rust
pub fn scope_css(css: &str, scope_id: &str) -> String {
    if css.trim().is_empty() {
        return String::new();
    }

    let clean_scope_id = if scope_id.starts_with('_') {
        scope_id.to_string()
    } else {
        format!("_{}", scope_id)
    };
    let scope_attr = format!("[{}]", clean_scope_id);

    let mut result = String::new();
    let mut i = 0;
    let chars: Vec<char> = css.chars().collect();
    let len = chars.len();

    while i < len {
        // Skip comments /* ... */
        if i + 1 < len && chars[i] == '/' && chars[i + 1] == '*' {
            let mut comment_end = None;
            let mut j = i + 2;
            while j + 1 < len {
                if chars[j] == '*' && chars[j + 1] == '/' {
                    comment_end = Some(j + 2);
                    break;
                }
                j += 1;
            }
            if let Some(end) = comment_end {
                for k in i..end {
                    result.push(chars[k]);
                }
                i = end;
                continue;
            } else {
                for k in i..len {
                    result.push(chars[k]);
                }
                break;
            }
        }

        // Find opening '{'
        let mut open_brace = None;
        let mut j = i;
        while j < len {
            if chars[j] == '{' {
                open_brace = Some(j);
                break;
            }
            j += 1;
        }

        let open_idx = match open_brace {
            Some(idx) => idx,
            None => {
                for k in i..len {
                    result.push(chars[k]);
                }
                break;
            }
        };

        let prelude: String = chars[i..open_idx].iter().collect();
        let trimmed_prelude = prelude.trim();

        // Find matching closing '}' with nesting awareness
        let mut depth = 1;
        let mut in_string: Option<char> = None;
        let mut close_brace = None;
        let mut k = open_idx + 1;

        while k < len {
            let ch = chars[k];
            let prev = if k > open_idx + 1 { chars[k - 1] } else { ' ' };

            if let Some(q) = in_string {
                if ch == q && prev != '\\' {
                    in_string = None;
                }
            } else if ch == '"' || ch == '\'' {
                in_string = Some(ch);
            } else if ch == '{' {
                depth += 1;
            } else if ch == '}' {
                depth -= 1;
                if depth == 0 {
                    close_brace = Some(k);
                    break;
                }
            }
            k += 1;
        }

        let close_idx = match close_brace {
            Some(idx) => idx,
            None => {
                for idx in i..len {
                    result.push(chars[idx]);
                }
                break;
            }
        };

        let block_body: String = chars[open_idx + 1..close_idx].iter().collect();

        if trimmed_prelude.starts_with("@keyframes")
            || trimmed_prelude.starts_with("@-webkit-keyframes")
        {
            result.push_str(trimmed_prelude);
            result.push_str(" {");
            result.push_str(&block_body);
            result.push('}');
        } else if trimmed_prelude.starts_with("@media") || trimmed_prelude.starts_with("@supports")
        {
            let scoped_inner = scope_css(&block_body, &clean_scope_id);
            result.push_str(trimmed_prelude);
            result.push_str(" {\n");
            result.push_str(&scoped_inner);
            result.push_str("\n}");
        } else if trimmed_prelude.starts_with("@font-face")
            || trimmed_prelude.starts_with("@import")
        {
            result.push_str(trimmed_prelude);
            result.push_str(" {");
            result.push_str(&block_body);
            result.push('}');
        } else {
            let selector_list = safe_split_selectors(trimmed_prelude);
            let scoped_selectors: Vec<String> = selector_list
                .into_iter()
                .map(|s| scope_single_selector(&s, &scope_attr))
                .filter(|s| !s.is_empty())
                .collect();
            let joined_selectors = scoped_selectors.join(", ");
            result.push_str(&joined_selectors);
            result.push_str(" {");
            result.push_str(&block_body);
            result.push('}');
        }

        i = close_idx + 1;
    }

    result.trim().to_string()
}

fn safe_split_selectors(str_val: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut paren_depth = 0;
    let mut in_quote: Option<char> = None;
    let chars: Vec<char> = str_val.chars().collect();

    for i in 0..chars.len() {
        let ch = chars[i];
        let prev = if i > 0 { chars[i - 1] } else { ' ' };

        if let Some(q) = in_quote {
            current.push(ch);
            if ch == q && prev != '\\' {
                in_quote = None;
            }
        } else if ch == '"' || ch == '\'' {
            in_quote = Some(ch);
            current.push(ch);
        } else if ch == '(' {
            paren_depth += 1;
            current.push(ch);
        } else if ch == ')' {
            if paren_depth > 0 {
                paren_depth -= 1;
            }
            current.push(ch);
        } else if ch == ',' && paren_depth == 0 {
            parts.push(current.trim().to_string());
            current.clear();
        } else {
            current.push(ch);
        }
    }

    if !current.trim().is_empty() {
        parts.push(current.trim().to_string());
    }

    parts
}

fn scope_single_selector(sel: &str, scope_attr: &str) -> String {
    let trimmed = sel.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    if trimmed.contains(":host") {
        let mut host_processed = String::new();
        let mut cur = trimmed;
        while let Some(idx) = cur.find(":host(") {
            host_processed.push_str(&cur[..idx]);
            host_processed.push_str(scope_attr);
            let after = &cur[idx + 6..];
            if let Some(close_p) = after.find(')') {
                let inner = &after[..close_p];
                host_processed.push_str(inner);
                cur = &after[close_p + 1..];
            } else {
                cur = "";
                break;
            }
        }
        host_processed.push_str(cur);
        let host_replaced = host_processed.replace(":host", scope_attr);

        let parts = safe_split_combinators(&host_replaced);
        let mut res = String::new();
        for (part, is_combinator) in parts {
            if is_combinator || part.contains(scope_attr) {
                res.push_str(&part);
            } else {
                res.push_str(&scope_compound_part(&part, scope_attr));
            }
        }
        return res;
    }

    let parts = safe_split_combinators(trimmed);
    let mut res = String::new();
    for (part, is_combinator) in parts {
        if is_combinator {
            res.push_str(&part);
        } else {
            res.push_str(&scope_compound_part(&part, scope_attr));
        }
    }
    res
}

fn safe_split_combinators(selector: &str) -> Vec<(String, bool)> {
    let mut tokens = Vec::new();
    let chars: Vec<char> = selector.chars().collect();
    let len = chars.len();
    let mut last = 0;
    let mut i = 0;

    while i < len {
        let ch = chars[i];
        if ch == '>' || ch == '+' || ch == '~' {
            let mut start = i;
            while start > last && chars[start - 1].is_whitespace() {
                start -= 1;
            }
            if start > last {
                let text: String = chars[last..start].iter().collect();
                tokens.push((text, false));
            }
            let mut end = i + 1;
            while end < len && chars[end].is_whitespace() {
                end += 1;
            }
            let comb: String = chars[start..end].iter().collect();
            tokens.push((comb, true));
            last = end;
            i = end;
        } else if ch.is_whitespace() {
            let mut end = i;
            while end < len && chars[end].is_whitespace() {
                end += 1;
            }
            if end < len && (chars[end] == '>' || chars[end] == '+' || chars[end] == '~') {
                i = end;
                continue;
            }
            if i > last {
                let text: String = chars[last..i].iter().collect();
                tokens.push((text, false));
            }
            let space: String = chars[i..end].iter().collect();
            tokens.push((space, true));
            last = end;
            i = end;
        } else {
            i += 1;
        }
    }

    if last < len {
        let text: String = chars[last..len].iter().collect();
        tokens.push((text, false));
    }

    tokens
}

fn scope_compound_part(part: &str, scope_attr: &str) -> String {
    let trimmed = part.trim();
    if trimmed.is_empty() {
        return part.to_string();
    }

    if trimmed == "*" {
        return format!("*{scope_attr}");
    }

    // Pseudo-element ::
    if let Some(idx) = trimmed.find("::") {
        let before_pseudo = &trimmed[..idx];
        let pseudo = &trimmed[idx..];
        return format!(
            "{}{scope_attr}{pseudo}",
            scope_compound_part(before_pseudo, "")
        );
    }

    // Pseudo-class :
    if let Some(idx) = trimmed.find(':') {
        let before_colon = &trimmed[..idx];
        let after_colon = &trimmed[idx..];
        return format!("{before_colon}{scope_attr}{after_colon}");
    }

    format!("{trimmed}{scope_attr}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scope_simple_selectors() {
        let css = "h1 { color: red; } .card { padding: 1rem; }";
        let scoped = scope_css(css, "_angora-c0");
        assert!(scoped.contains("h1[_angora-c0] { color: red; }"));
        assert!(scoped.contains(".card[_angora-c0] { padding: 1rem; }"));
    }

    #[test]
    fn test_scope_pseudo_selectors() {
        let css = "button:hover { background: blue; } p::before { content: 'x'; }";
        let scoped = scope_css(css, "_angora-c1");
        assert!(scoped.contains("button[_angora-c1]:hover { background: blue; }"));
        assert!(scoped.contains("p[_angora-c1]::before { content: 'x'; }"));
    }

    #[test]
    fn test_scope_host_selectors() {
        let css = ":host { display: block; } :host(.active) { color: green; }";
        let scoped = scope_css(css, "_angora-c2");
        assert!(scoped.contains("[_angora-c2] { display: block; }"));
        assert!(scoped.contains("[_angora-c2].active { color: green; }"));
    }
}
