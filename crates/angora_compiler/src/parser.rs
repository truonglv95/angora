use crate::ast::*;

pub fn is_void_element(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "area"
            | "base"
            | "br"
            | "col"
            | "embed"
            | "hr"
            | "img"
            | "input"
            | "link"
            | "meta"
            | "param"
            | "source"
            | "track"
            | "wbr"
    )
}

pub struct TemplateParser<'a> {
    input: &'a str,
    pos: usize,
}

impl<'a> TemplateParser<'a> {
    pub fn new(input: &'a str) -> Self {
        Self { input, pos: 0 }
    }

    fn is_eof(&self) -> bool {
        self.pos >= self.input.len()
    }

    fn current_slice(&self) -> &'a str {
        if self.is_eof() {
            ""
        } else {
            &self.input[self.pos..]
        }
    }

    fn starts_with(&self, s: &str) -> bool {
        self.current_slice().starts_with(s)
    }

    fn skip_whitespace(&mut self) {
        while !self.is_eof() {
            let ch = self.input[self.pos..].chars().next().unwrap();
            if ch.is_whitespace() {
                self.pos += ch.len_utf8();
            } else {
                break;
            }
        }
    }

    pub fn parse(&mut self) -> Vec<TemplateNode> {
        let mut nodes = Vec::new();
        while !self.is_eof() {
            self.skip_whitespace();
            if self.is_eof() {
                break;
            }

            if self.starts_with("}") || self.starts_with("</") {
                break;
            }

            if let Some(node) = self.parse_node() {
                nodes.push(node);
            }
        }
        nodes
    }

    fn is_control_flow(&self, keyword: &str) -> bool {
        if self.starts_with(keyword) {
            let after = &self.input[self.pos + keyword.len()..];
            let trimmed = after.trim_start();
            trimmed.starts_with('(') || (keyword == "@defer" && trimmed.starts_with('{'))
        } else {
            false
        }
    }

    fn parse_node(&mut self) -> Option<TemplateNode> {
        self.skip_whitespace();
        if self.is_eof() || self.starts_with("}") || self.starts_with("</") {
            return None;
        }

        if self.is_control_flow("@if") {
            return Some(TemplateNode::IfBlock(self.parse_if_block()));
        }
        if self.is_control_flow("@for") {
            return Some(TemplateNode::ForBlock(self.parse_for_block()));
        }
        if self.is_control_flow("@switch") {
            return Some(TemplateNode::SwitchBlock(self.parse_switch_block()));
        }
        if self.is_control_flow("@defer") {
            return Some(TemplateNode::DeferBlock(self.parse_defer_block()));
        }
        if self.starts_with("{{") {
            return Some(TemplateNode::Interpolation(self.parse_interpolation()));
        }
        if self.starts_with("<") {
            return self.parse_element().map(TemplateNode::Element);
        }

        self.parse_text().map(TemplateNode::Text)
    }

    fn parse_parenthesized_expr_with_span(&mut self) -> (String, SourceSpan) {
        self.skip_whitespace();
        if !self.starts_with("(") {
            return (
                String::new(),
                SourceSpan {
                    start: self.pos,
                    end: self.pos,
                },
            );
        }
        self.pos += 1; // skip '('

        let mut depth = 1;
        let mut in_quote: Option<char> = None;
        let start = self.pos;

        while !self.is_eof() && depth > 0 {
            let ch = self.input[self.pos..].chars().next().unwrap();
            let prev = if self.pos > start {
                self.input[..self.pos].chars().last()
            } else {
                None
            };

            if let Some(q) = in_quote {
                if ch == q && prev != Some('\\') {
                    in_quote = None;
                }
            } else if ch == '\'' || ch == '"' || ch == '`' {
                in_quote = Some(ch);
            } else if ch == '(' {
                depth += 1;
            } else if ch == ')' {
                depth -= 1;
                if depth == 0 {
                    let raw = &self.input[start..self.pos];
                    let expr = raw.trim().to_string();
                    let leading = raw.len() - raw.trim_start().len();
                    let span = SourceSpan {
                        start: start + leading,
                        end: start + leading + expr.len(),
                    };
                    self.pos += 1;
                    return (expr, span);
                }
            }
            self.pos += ch.len_utf8();
        }

        let raw = &self.input[start..self.pos];
        let expr = raw.trim().to_string();
        let leading = raw.len() - raw.trim_start().len();
        let span = SourceSpan {
            start: start + leading,
            end: start + leading + expr.len(),
        };
        if self.starts_with(")") {
            self.pos += 1;
        }
        (expr, span)
    }

    fn parse_parenthesized_expr(&mut self) -> String {
        self.parse_parenthesized_expr_with_span().0
    }

    fn parse_block(&mut self) -> Vec<TemplateNode> {
        self.skip_whitespace();
        if !self.starts_with("{") {
            return Vec::new();
        }
        self.pos += 1; // skip '{'

        let mut nodes = Vec::new();
        while !self.is_eof() {
            self.skip_whitespace();
            if self.starts_with("}") {
                self.pos += 1;
                break;
            }
            let start_pos = self.pos;
            if let Some(node) = self.parse_node() {
                nodes.push(node);
            }
            if self.pos == start_pos {
                if !self.is_eof() {
                    let ch = self.input[self.pos..].chars().next().unwrap();
                    self.pos += ch.len_utf8();
                }
            }
        }
        nodes
    }

    fn parse_if_block(&mut self) -> IfBlockNode {
        self.pos += 3; // skip '@if'
        self.skip_whitespace();

        let (condition, cond_span) = self.parse_parenthesized_expr_with_span();
        let children = self.parse_block();

        let mut branches = vec![IfBranch {
            condition: Some(condition),
            children,
            span: Some(cond_span),
        }];

        self.skip_whitespace();
        while self.starts_with("@else if") {
            self.pos += 8; // skip '@else if'
            self.skip_whitespace();
            let (next_cond, next_span) = self.parse_parenthesized_expr_with_span();
            let next_children = self.parse_block();
            branches.push(IfBranch {
                condition: Some(next_cond),
                children: next_children,
                span: Some(next_span),
            });
            self.skip_whitespace();
        }

        if self.starts_with("@else") {
            self.pos += 5; // skip '@else'
            self.skip_whitespace();
            let else_children = self.parse_block();
            branches.push(IfBranch {
                condition: None,
                children: else_children,
                span: None,
            });
        }

        IfBlockNode { branches }
    }

    fn parse_for_block(&mut self) -> ForBlockNode {
        self.pos += 4; // skip '@for'
        self.skip_whitespace();

        let (header, header_span) = self.parse_parenthesized_expr_with_span(); // e.g. "item of items(); track item.id"
        let children = self.parse_block();

        self.skip_whitespace();
        let mut empty_block = None;
        if self.starts_with("@empty") {
            self.pos += 6; // skip '@empty'
            self.skip_whitespace();
            empty_block = Some(self.parse_block());
        }

        let parts: Vec<&str> = header.split(';').collect();
        let loop_part = parts[0].trim();
        let track_part = parts.get(1).unwrap_or(&"").trim();

        let (item_name, iterable) = if let Some((item, iter)) = loop_part.split_once(" of ") {
            (item.trim().to_string(), iter.trim().to_string())
        } else {
            ("item".to_string(), loop_part.to_string())
        };

        let track_by = if let Some(stripped) = track_part.strip_prefix("track ") {
            stripped.trim().to_string()
        } else if !track_part.is_empty() {
            track_part.to_string()
        } else {
            item_name.clone()
        };

        let iter_offset = header.find(&iterable).unwrap_or(0);
        let iterable_span = Some(SourceSpan {
            start: header_span.start + iter_offset,
            end: header_span.start + iter_offset + iterable.len(),
        });

        let track_span = if !track_by.is_empty() {
            header[iter_offset + iterable.len()..]
                .find(&track_by)
                .map(|off| SourceSpan {
                    start: header_span.start + iter_offset + iterable.len() + off,
                    end: header_span.start + iter_offset + iterable.len() + off + track_by.len(),
                })
        } else {
            None
        };

        ForBlockNode {
            item_name,
            iterable,
            track_by,
            children,
            empty_block,
            span: Some(header_span),
            iterable_span,
            track_span,
        }
    }

    fn parse_switch_block(&mut self) -> SwitchBlockNode {
        self.pos += 7; // skip '@switch'
        self.skip_whitespace();

        let (expression, expr_span) = self.parse_parenthesized_expr_with_span();
        self.skip_whitespace();

        let mut cases = Vec::new();
        if self.starts_with("{") {
            self.pos += 1;
            while !self.is_eof() {
                self.skip_whitespace();
                if self.starts_with("}") {
                    self.pos += 1;
                    break;
                }

                if self.starts_with("@case") {
                    let mut case_values = Vec::new();
                    while self.starts_with("@case") {
                        self.pos += 5; // skip '@case'
                        self.skip_whitespace();
                        let (val, case_span) = self.parse_parenthesized_expr_with_span();
                        self.skip_whitespace();
                        for single_val in split_case_values(&val) {
                            case_values.push((single_val, case_span.clone()));
                        }
                    }
                    let children = self.parse_block();
                    for (val, span) in case_values {
                        cases.push(SwitchCase {
                            case_value: Some(val),
                            children: children.clone(),
                            span: Some(span),
                        });
                    }
                } else if self.starts_with("@default") {
                    self.pos += 8; // skip '@default'
                    let children = self.parse_block();
                    cases.push(SwitchCase {
                        case_value: None,
                        children,
                        span: None,
                    });
                } else {
                    let ch = self.input[self.pos..].chars().next().unwrap();
                    self.pos += ch.len_utf8();
                }
            }
        }

        SwitchBlockNode {
            expression,
            cases,
            span: Some(expr_span),
        }
    }

    fn parse_defer_block(&mut self) -> DeferBlockNode {
        self.pos += 6; // skip '@defer'
        self.skip_whitespace();

        let mut triggers = Vec::new();
        if self.starts_with("(") {
            let trigger_expr = self.parse_parenthesized_expr();
            for part in trigger_expr.split(';') {
                let part = part.trim();
                if let Some(when_cond) = part.strip_prefix("when ") {
                    triggers.push(DeferTrigger {
                        trigger_type: "when".to_string(),
                        param: Some(when_cond.trim().to_string()),
                    });
                } else if let Some(on_cond) = part.strip_prefix("on ") {
                    let on_cond = on_cond.trim();
                    if on_cond.starts_with("timer(") && on_cond.ends_with(")") {
                        let timer_val = on_cond[6..on_cond.len() - 1].trim();
                        triggers.push(DeferTrigger {
                            trigger_type: "timer".to_string(),
                            param: Some(timer_val.to_string()),
                        });
                    } else if matches!(on_cond, "viewport" | "idle" | "interaction" | "hover") {
                        triggers.push(DeferTrigger {
                            trigger_type: on_cond.to_string(),
                            param: None,
                        });
                    }
                }
            }
        }

        if triggers.is_empty() {
            triggers.push(DeferTrigger {
                trigger_type: "idle".to_string(),
                param: None,
            });
        }

        let main_block = self.parse_block();
        let mut placeholder_block = None;
        let mut loading_block = None;
        let mut error_block = None;

        self.skip_whitespace();
        while self.starts_with("@placeholder")
            || self.starts_with("@loading")
            || self.starts_with("@error")
        {
            if self.starts_with("@placeholder") {
                self.pos += 12; // skip '@placeholder'
                self.skip_whitespace();
                let mut minimum = None;
                if self.starts_with("(") {
                    let expr = self.parse_parenthesized_expr();
                    if let Some(idx) = expr.find("minimum") {
                        let after = expr[idx + 7..].trim();
                        let num_str: String =
                            after.chars().take_while(|c| c.is_ascii_digit()).collect();
                        if let Ok(n) = num_str.parse() {
                            minimum = Some(n);
                        }
                    }
                }
                let children = self.parse_block();
                placeholder_block = Some(PlaceholderBlock { children, minimum });
            } else if self.starts_with("@loading") {
                self.pos += 8; // skip '@loading'
                self.skip_whitespace();
                let mut after = None;
                let mut minimum = None;
                if self.starts_with("(") {
                    let expr = self.parse_parenthesized_expr();
                    if let Some(idx) = expr.find("after") {
                        let aft = expr[idx + 5..].trim();
                        let num_str: String =
                            aft.chars().take_while(|c| c.is_ascii_digit()).collect();
                        if let Ok(n) = num_str.parse() {
                            after = Some(n);
                        }
                    }
                    if let Some(idx) = expr.find("minimum") {
                        let min_part = expr[idx + 7..].trim();
                        let num_str: String = min_part
                            .chars()
                            .take_while(|c| c.is_ascii_digit())
                            .collect();
                        if let Ok(n) = num_str.parse() {
                            minimum = Some(n);
                        }
                    }
                }
                let children = self.parse_block();
                loading_block = Some(LoadingBlock {
                    children,
                    after,
                    minimum,
                });
            } else if self.starts_with("@error") {
                self.pos += 6; // skip '@error'
                self.skip_whitespace();
                let children = self.parse_block();
                error_block = Some(ErrorBlock { children });
            }
            self.skip_whitespace();
        }

        DeferBlockNode {
            triggers,
            main_block,
            placeholder_block,
            loading_block,
            error_block,
        }
    }

    fn parse_interpolation(&mut self) -> InterpolationNode {
        self.pos += 2; // skip '{{'
        let end = match self.input[self.pos..].find("}}") {
            Some(idx) => self.pos + idx,
            None => self.input.len(),
        };

        let raw = &self.input[self.pos..end];
        let expression = raw.trim().to_string();
        let leading = raw.len() - raw.trim_start().len();
        let span = Some(SourceSpan {
            start: self.pos + leading,
            end: self.pos + leading + expression.len(),
        });
        self.pos = if end < self.input.len() { end + 2 } else { end };
        InterpolationNode { expression, span }
    }

    fn parse_element(&mut self) -> Option<ElementNode> {
        if self.starts_with("</") {
            return None;
        }

        if self.starts_with("<!--") {
            if let Some(idx) = self.input[self.pos..].find("-->") {
                self.pos += idx + 3;
            } else {
                self.pos = self.input.len();
            }
            return None;
        }

        self.pos += 1; // skip '<'

        let mut tag_name_len = 0;
        for ch in self.input[self.pos..].chars() {
            if ch.is_alphanumeric() || ch == '-' || ch == '_' {
                tag_name_len += ch.len_utf8();
            } else {
                break;
            }
        }

        if tag_name_len == 0 {
            return None;
        }

        let name = self.input[self.pos..self.pos + tag_name_len].to_string();
        self.pos += tag_name_len;

        let mut attributes = Vec::new();
        let mut properties = Vec::new();
        let mut events = Vec::new();
        let mut two_ways = Vec::new();
        let mut references = Vec::new();

        self.skip_whitespace();

        while !self.is_eof() && !self.starts_with(">") && !self.starts_with("/>") {
            let mut attr_len = 0;
            for ch in self.input[self.pos..].chars() {
                if !ch.is_whitespace() && ch != '=' && ch != '>' && ch != '/' {
                    attr_len += ch.len_utf8();
                } else {
                    break;
                }
            }

            if attr_len == 0 {
                break;
            }

            let raw_name = self.input[self.pos..self.pos + attr_len].to_string();
            self.pos += attr_len;
            self.skip_whitespace();

            let mut value = String::new();
            let mut val_span: Option<SourceSpan> = None;
            if self.starts_with("=") {
                self.pos += 1;
                self.skip_whitespace();
                if self.starts_with("\"") || self.starts_with("'") {
                    let quote = self.input[self.pos..].chars().next().unwrap();
                    self.pos += quote.len_utf8();
                    let start_val = self.pos;
                    while !self.is_eof() {
                        let ch = self.input[self.pos..].chars().next().unwrap();
                        let prev = if self.pos > start_val {
                            self.input[..self.pos].chars().last()
                        } else {
                            None
                        };
                        if ch == quote && prev != Some('\\') {
                            let raw = &self.input[start_val..self.pos];
                            value = raw.trim().to_string();
                            let leading = raw.len() - raw.trim_start().len();
                            val_span = Some(SourceSpan {
                                start: start_val + leading,
                                end: start_val + leading + value.len(),
                            });
                            self.pos += quote.len_utf8();
                            break;
                        }
                        self.pos += ch.len_utf8();
                    }
                } else {
                    let start_val = self.pos;
                    while !self.is_eof() {
                        let ch = self.input[self.pos..].chars().next().unwrap();
                        if ch.is_whitespace() || ch == '>' || ch == '/' {
                            break;
                        }
                        self.pos += ch.len_utf8();
                    }
                    let raw = &self.input[start_val..self.pos];
                    value = raw.trim().to_string();
                    let leading = raw.len() - raw.trim_start().len();
                    val_span = Some(SourceSpan {
                        start: start_val + leading,
                        end: start_val + leading + value.len(),
                    });
                }
            }

            // Categorize attribute binding
            if raw_name.starts_with('#') {
                let ref_name = raw_name[1..].to_string();
                references.push(ReferenceNode {
                    node_type: "reference".to_string(),
                    name: ref_name,
                    value: if value.is_empty() { None } else { Some(value) },
                });
            } else if raw_name.starts_with("[(") && raw_name.ends_with(")]") {
                let prop_name = raw_name[2..raw_name.len() - 2].to_string();
                two_ways.push(TwoWayBindingNode {
                    node_type: "twoWay".to_string(),
                    name: prop_name,
                    expression: value,
                    span: val_span,
                });
            } else if raw_name.starts_with('[') && raw_name.ends_with(']') {
                let prop_name = raw_name[1..raw_name.len() - 1].to_string();
                properties.push(PropertyBindingNode {
                    node_type: "property".to_string(),
                    name: prop_name,
                    expression: value,
                    span: val_span,
                });
            } else if raw_name.starts_with('(') && raw_name.ends_with(')') {
                let ev_name = raw_name[1..raw_name.len() - 1].to_string();
                events.push(EventBindingNode {
                    node_type: "event".to_string(),
                    name: ev_name,
                    handler: value,
                    span: val_span,
                });
            } else {
                attributes.push(AttributeNode {
                    node_type: "attribute".to_string(),
                    name: raw_name,
                    value: decode_html_entities(&value),
                });
            }

            self.skip_whitespace();
        }

        let is_self_closing = if is_void_element(&name) {
            if self.starts_with("/>") {
                self.pos += 2;
            } else if self.starts_with(">") {
                self.pos += 1;
            }
            true
        } else if self.starts_with("/>") {
            self.pos += 2;
            true
        } else if self.starts_with(">") {
            self.pos += 1;
            false
        } else {
            true
        };

        let mut children = Vec::new();
        if !is_self_closing {
            while !self.is_eof() {
                if self.check_closing_tag(&name) {
                    self.consume_closing_tag(&name);
                    break;
                }
                if self.starts_with("</") {
                    // Mismatched or outer closing tag, break to allow parent to close!
                    break;
                }
                let start_pos = self.pos;
                if let Some(node) = self.parse_node() {
                    children.push(node);
                }
                if self.pos == start_pos {
                    break;
                }
            }
        }

        Some(ElementNode {
            name,
            attributes,
            properties,
            events,
            two_ways,
            references,
            children,
            span: None,
        })
    }

    fn check_closing_tag(&self, tag_name: &str) -> bool {
        if !self.starts_with("</") {
            return false;
        }
        let rest = &self.input[self.pos + 2..];
        if !rest.starts_with(tag_name) {
            return false;
        }
        let after_tag = &rest[tag_name.len()..];
        let trimmed = after_tag.trim_start();
        trimmed.starts_with('>')
    }

    fn consume_closing_tag(&mut self, tag_name: &str) -> bool {
        if !self.starts_with("</") {
            return false;
        }
        let rest = &self.input[self.pos + 2..];
        if !rest.starts_with(tag_name) {
            return false;
        }
        let after_tag = &rest[tag_name.len()..];
        let trimmed = after_tag.trim_start();
        if trimmed.starts_with('>') {
            let whitespace_len = after_tag.len() - trimmed.len();
            self.pos += 2 + tag_name.len() + whitespace_len + 1;
            true
        } else {
            false
        }
    }

    fn parse_text(&mut self) -> Option<TextNode> {
        let start = self.pos;
        while !self.is_eof() {
            if self.starts_with("<")
                || self.starts_with("{{")
                || self.is_control_flow("@if")
                || self.is_control_flow("@for")
                || self.is_control_flow("@switch")
                || self.is_control_flow("@defer")
                || self.starts_with("}")
                || self.starts_with("</")
            {
                break;
            }
            let ch = self.input[self.pos..].chars().next().unwrap();
            self.pos += ch.len_utf8();
        }

        let text = self.input[start..self.pos].to_string();
        if text.is_empty() {
            None
        } else {
            Some(TextNode {
                value: decode_html_entities(&text),
            })
        }
    }
}

pub fn decode_html_entities(s: &str) -> String {
    if !s.contains('&') {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;

    while i < bytes.len() {
        if bytes[i] == b'&' {
            if let Some(semi_rel) = s[i..].find(';') {
                let entity = &s[i + 1..i + semi_rel];
                let decoded = match entity {
                    "times" => Some('×'),
                    "lt" => Some('<'),
                    "gt" => Some('>'),
                    "amp" => Some('&'),
                    "quot" => Some('"'),
                    "apos" => Some('\''),
                    "nbsp" => Some('\u{00A0}'),
                    "mdash" => Some('—'),
                    "ndash" => Some('–'),
                    "hellip" => Some('…'),
                    "copy" => Some('©'),
                    "reg" => Some('®'),
                    "trade" => Some('™'),
                    "bull" => Some('•'),
                    "check" => Some('✓'),
                    "cross" => Some('✗'),
                    "laquo" => Some('«'),
                    "raquo" => Some('»'),
                    "larr" => Some('←'),
                    "rarr" => Some('→'),
                    "uarr" => Some('↑'),
                    "darr" => Some('↓'),
                    _ if entity.starts_with("#x") || entity.starts_with("#X") => {
                        u32::from_str_radix(&entity[2..], 16)
                            .ok()
                            .and_then(char::from_u32)
                    }
                    _ if entity.starts_with('#') => {
                        entity[1..].parse::<u32>().ok().and_then(char::from_u32)
                    }
                    _ => None,
                };

                if let Some(ch) = decoded {
                    out.push(ch);
                    i += semi_rel + 1;
                    continue;
                }
            }
        }

        let ch = s[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }

    out
}

pub fn split_case_values(expr: &str) -> Vec<String> {
    let mut results = Vec::new();
    let mut current = String::new();
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut paren_depth = 0;

    for ch in expr.chars() {
        match ch {
            '\'' if !in_double_quote => {
                in_single_quote = !in_single_quote;
                current.push(ch);
            }
            '"' if !in_single_quote => {
                in_double_quote = !in_double_quote;
                current.push(ch);
            }
            '(' | '[' | '{' if !in_single_quote && !in_double_quote => {
                paren_depth += 1;
                current.push(ch);
            }
            ')' | ']' | '}' if !in_single_quote && !in_double_quote => {
                if paren_depth > 0 {
                    paren_depth -= 1;
                }
                current.push(ch);
            }
            ',' if !in_single_quote && !in_double_quote && paren_depth == 0 => {
                let trimmed = current.trim();
                if !trimmed.is_empty() {
                    results.push(trimmed.to_string());
                }
                current.clear();
            }
            _ => current.push(ch),
        }
    }
    let trimmed = current.trim();
    if !trimmed.is_empty() {
        results.push(trimmed.to_string());
    }

    if results.is_empty() {
        vec![expr.trim().to_string()]
    } else {
        results
    }
}

pub fn parse_template(input: &str) -> Vec<TemplateNode> {
    TemplateParser::new(input).parse()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decode_html_entities() {
        assert_eq!(decode_html_entities("&times; Delete"), "× Delete");
        assert_eq!(decode_html_entities("&lt;div&gt;"), "<div>");
        assert_eq!(decode_html_entities("Save &amp; Close"), "Save & Close");
        assert_eq!(
            decode_html_entities("Price &quot;Special&quot;"),
            "Price \"Special\""
        );
        assert_eq!(
            decode_html_entities("Space&nbsp;Between"),
            "Space\u{00A0}Between"
        );
        assert_eq!(decode_html_entities("Arrow &#9662;"), "Arrow ▾");
        assert_eq!(decode_html_entities("Hex &#x2014;"), "Hex —");
        assert_eq!(
            decode_html_entities("Normal & unaffected"),
            "Normal & unaffected"
        );
    }

    #[test]
    fn test_parse_template_with_entities() {
        let nodes = parse_template("<button>&times; Delete</button>");
        assert_eq!(nodes.len(), 1);
        if let TemplateNode::Element(el) = &nodes[0] {
            assert_eq!(el.name, "button");
            assert_eq!(el.children.len(), 1);
            if let TemplateNode::Text(txt) = &el.children[0] {
                assert_eq!(txt.value, "× Delete");
            } else {
                panic!("Expected TextNode");
            }
        } else {
            panic!("Expected ElementNode");
        }
    }

    #[test]
    fn test_parse_spans() {
        let input = r#"@if (user.isLoggedIn) {
            <input [value]="user.name" (input)="onNameChange($event)" [(ngModel)]="user.email" />
            <span>{{ user.message }}</span>
            @for (item of user.items; track item.id) {
                <div>{{ item.name }}</div>
            }
        }"#;
        let nodes = parse_template(input);
        assert_eq!(nodes.len(), 1);
        if let TemplateNode::IfBlock(ib) = &nodes[0] {
            let branch = &ib.branches[0];
            let if_span = branch.span.as_ref().unwrap();
            assert_eq!(&input[if_span.start..if_span.end], "user.isLoggedIn");

            if let TemplateNode::Element(el) = &branch.children[0] {
                assert_eq!(el.name, "input");
                let prop_span = el.properties[0].span.as_ref().unwrap();
                assert_eq!(&input[prop_span.start..prop_span.end], "user.name");

                let ev_span = el.events[0].span.as_ref().unwrap();
                assert_eq!(&input[ev_span.start..ev_span.end], "onNameChange($event)");

                let tw_span = el.two_ways[0].span.as_ref().unwrap();
                assert_eq!(&input[tw_span.start..tw_span.end], "user.email");
            } else {
                panic!("Expected input element");
            }

            if let TemplateNode::Element(el) = &branch.children[1] {
                assert_eq!(el.name, "span");
                if let TemplateNode::Interpolation(interp) = &el.children[0] {
                    let interp_span = interp.span.as_ref().unwrap();
                    assert_eq!(&input[interp_span.start..interp_span.end], "user.message");
                }
            }

            if let TemplateNode::ForBlock(fb) = &branch.children[2] {
                let iter_span = fb.iterable_span.as_ref().unwrap();
                assert_eq!(&input[iter_span.start..iter_span.end], "user.items");
                let track_span = fb.track_span.as_ref().unwrap();
                assert_eq!(&input[track_span.start..track_span.end], "item.id");
            }
        }
    }

    #[test]
    fn test_parse_switch_multi_case_and_fallthrough() {
        let input = r#"@switch (user.role) {
            @case ('admin', 'superadmin', 'owner') {
                <span class="privileged">Admin Panel</span>
            }
            @case ('editor')
            @case ('author') {
                <span class="writer">Content Studio</span>
            }
            @default {
                <span class="standard">Standard User</span>
            }
        }"#;

        let nodes = parse_template(input);
        assert_eq!(nodes.len(), 1);
        if let TemplateNode::SwitchBlock(sw) = &nodes[0] {
            assert_eq!(sw.expression, "user.role");
            // 3 from first block ('admin', 'superadmin', 'owner')
            // 2 from second fallthrough block ('editor', 'author')
            // 1 from @default
            assert_eq!(sw.cases.len(), 6);
            assert_eq!(sw.cases[0].case_value.as_deref(), Some("'admin'"));
            assert_eq!(sw.cases[1].case_value.as_deref(), Some("'superadmin'"));
            assert_eq!(sw.cases[2].case_value.as_deref(), Some("'owner'"));
            assert_eq!(sw.cases[3].case_value.as_deref(), Some("'editor'"));
            assert_eq!(sw.cases[4].case_value.as_deref(), Some("'author'"));
            assert_eq!(sw.cases[5].case_value.as_deref(), None); // @default
        } else {
            panic!("Expected SwitchBlock");
        }
    }
}
