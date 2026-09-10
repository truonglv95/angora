use crate::ast::*;
use crate::lexer::TokenStream;
use crate::token::{ControlFlowKeyword, Token, TokenKind};

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
    stream: TokenStream<'a>,
}

impl<'a> TemplateParser<'a> {
    pub fn new(input: &'a str) -> Self {
        Self {
            stream: TokenStream::from_input(input),
        }
    }

    pub fn parse(&mut self) -> Vec<TemplateNode> {
        let mut nodes = Vec::new();
        while !self.stream.is_eof() {
            if matches!(
                self.stream.peek_kind(),
                Some(TokenKind::CloseBrace) | Some(TokenKind::TagCloseStart)
            ) {
                break;
            }

            let start_pos = self.stream.pos();
            if let Some(node) = self.parse_node() {
                nodes.push(node);
            }
            if self.stream.pos() == start_pos {
                if !self.stream.is_eof() {
                    self.stream.bump();
                } else {
                    break;
                }
            }
        }
        nodes
    }

    fn parse_node(&mut self) -> Option<TemplateNode> {
        if self.stream.is_eof() {
            return None;
        }

        match self.stream.peek_kind()? {
            TokenKind::CloseBrace | TokenKind::TagCloseStart => None,
            TokenKind::ControlFlow(ControlFlowKeyword::If) => {
                Some(TemplateNode::IfBlock(self.parse_if_block()))
            }
            TokenKind::ControlFlow(ControlFlowKeyword::For) => {
                Some(TemplateNode::ForBlock(self.parse_for_block()))
            }
            TokenKind::ControlFlow(ControlFlowKeyword::Switch) => {
                Some(TemplateNode::SwitchBlock(self.parse_switch_block()))
            }
            TokenKind::ControlFlow(ControlFlowKeyword::Defer) => {
                Some(TemplateNode::DeferBlock(self.parse_defer_block()))
            }
            TokenKind::Interpolation(_) => {
                Some(TemplateNode::Interpolation(self.parse_interpolation()))
            }
            TokenKind::TagOpenStart => self.parse_element().map(TemplateNode::Element),
            TokenKind::Comment(_) => {
                self.stream.bump();
                None
            }
            TokenKind::Text(_) => self.parse_text().map(TemplateNode::Text),
            _ => None,
        }
    }

    fn consume_expression(&mut self) -> (String, SourceSpan) {
        if let Some(tok) = self.stream.peek() {
            if let TokenKind::Expression(expr) = tok.kind {
                let span = tok.span.clone();
                let expr_str = expr.to_string();
                self.stream.bump();
                return (expr_str, span);
            }
        }
        (
            String::new(),
            SourceSpan {
                start: self.stream.peek().map(|t| t.span.start).unwrap_or(0),
                end: self.stream.peek().map(|t| t.span.start).unwrap_or(0),
            },
        )
    }

    fn parse_block(&mut self) -> Vec<TemplateNode> {
        if let Some(TokenKind::OpenBrace) = self.stream.peek_kind() {
            self.stream.bump(); // skip '{'
        } else {
            return Vec::new();
        }

        let mut nodes = Vec::new();
        while !self.stream.is_eof() {
            if let Some(TokenKind::CloseBrace) = self.stream.peek_kind() {
                self.stream.bump(); // skip '}'
                break;
            }
            let start_pos = self.stream.pos();
            if let Some(node) = self.parse_node() {
                nodes.push(node);
            }
            if self.stream.pos() == start_pos {
                if !self.stream.is_eof() {
                    self.stream.bump();
                } else {
                    break;
                }
            }
        }
        nodes
    }

    fn parse_if_block(&mut self) -> IfBlockNode {
        self.stream.bump(); // skip '@if'

        let (condition, cond_span) = self.consume_expression();
        let children = self.parse_block();

        let mut branches = vec![IfBranch {
            condition: Some(condition),
            children,
            span: Some(cond_span),
        }];

        while let Some(TokenKind::ControlFlow(ControlFlowKeyword::ElseIf)) = self.stream.peek_kind()
        {
            self.stream.bump(); // skip '@else if'
            let (next_cond, next_span) = self.consume_expression();
            let next_children = self.parse_block();
            branches.push(IfBranch {
                condition: Some(next_cond),
                children: next_children,
                span: Some(next_span),
            });
        }

        if let Some(TokenKind::ControlFlow(ControlFlowKeyword::Else)) = self.stream.peek_kind() {
            self.stream.bump(); // skip '@else'
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
        self.stream.bump(); // skip '@for'

        let (header, header_span) = self.consume_expression();
        let children = self.parse_block();

        let mut empty_block = None;
        if let Some(TokenKind::ControlFlow(ControlFlowKeyword::Empty)) = self.stream.peek_kind() {
            self.stream.bump(); // skip '@empty'
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
        self.stream.bump(); // skip '@switch'

        let (expression, expr_span) = self.consume_expression();

        let mut cases = Vec::new();
        if let Some(TokenKind::OpenBrace) = self.stream.peek_kind() {
            self.stream.bump(); // skip '{'
            while !self.stream.is_eof() {
                if let Some(TokenKind::CloseBrace) = self.stream.peek_kind() {
                    self.stream.bump(); // skip '}'
                    break;
                }

                if let Some(TokenKind::ControlFlow(ControlFlowKeyword::Case)) =
                    self.stream.peek_kind()
                {
                    let mut case_values = Vec::new();
                    while let Some(TokenKind::ControlFlow(ControlFlowKeyword::Case)) =
                        self.stream.peek_kind()
                    {
                        self.stream.bump(); // skip '@case'
                        let (val, case_span) = self.consume_expression();
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
                } else if let Some(TokenKind::ControlFlow(ControlFlowKeyword::Default)) =
                    self.stream.peek_kind()
                {
                    self.stream.bump(); // skip '@default'
                    let children = self.parse_block();
                    cases.push(SwitchCase {
                        case_value: None,
                        children,
                        span: None,
                    });
                } else {
                    self.stream.bump();
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
        self.stream.bump(); // skip '@defer'

        let mut triggers = Vec::new();
        if let Some(TokenKind::Expression(_)) = self.stream.peek_kind() {
            let (trigger_expr, _) = self.consume_expression();
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

        while let Some(TokenKind::ControlFlow(kw)) = self.stream.peek_kind() {
            match kw {
                ControlFlowKeyword::Placeholder => {
                    self.stream.bump();
                    let mut minimum = None;
                    if let Some(TokenKind::Expression(_)) = self.stream.peek_kind() {
                        let (expr, _) = self.consume_expression();
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
                }
                ControlFlowKeyword::Loading => {
                    self.stream.bump();
                    let mut after = None;
                    let mut minimum = None;
                    if let Some(TokenKind::Expression(_)) = self.stream.peek_kind() {
                        let (expr, _) = self.consume_expression();
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
                }
                ControlFlowKeyword::Error => {
                    self.stream.bump();
                    let children = self.parse_block();
                    error_block = Some(ErrorBlock { children });
                }
                _ => break,
            }
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
        if let Some(tok) = self.stream.bump() {
            if let TokenKind::Interpolation(expr) = tok.kind {
                return InterpolationNode {
                    expression: expr.to_string(),
                    span: Some(tok.span),
                };
            }
        }
        InterpolationNode {
            expression: String::new(),
            span: None,
        }
    }

    fn parse_text(&mut self) -> Option<TextNode> {
        if let Some(tok) = self.stream.bump() {
            if let TokenKind::Text(txt) = tok.kind {
                let decoded = decode_html_entities(txt);
                if decoded.is_empty() {
                    None
                } else {
                    Some(TextNode { value: decoded })
                }
            } else {
                None
            }
        } else {
            None
        }
    }

    fn consume_attr_value(&mut self) -> (String, Option<SourceSpan>) {
        if let Some(TokenKind::Equals) = self.stream.peek_kind() {
            self.stream.bump(); // skip '='
            if let Some(tok) = self.stream.peek() {
                if let TokenKind::AttributeValue(val) = tok.kind {
                    let span = tok.span.clone();
                    let val_str = val.to_string();
                    self.stream.bump();
                    return (val_str, Some(span));
                }
            }
        }
        (String::new(), None)
    }

    fn check_closing_tag(&self, tag_name: &str) -> bool {
        if let Some(TokenKind::TagCloseStart) = self.stream.peek_kind() {
            if let Some(Token {
                kind: TokenKind::TagName(n),
                ..
            }) = self.stream.peek_at(1)
            {
                return *n == tag_name;
            }
        }
        false
    }

    fn consume_closing_tag(&mut self, tag_name: &str) -> bool {
        if self.check_closing_tag(tag_name) {
            self.stream.bump(); // TagCloseStart
            self.stream.bump(); // TagName
            if let Some(TokenKind::TagOpenEnd) = self.stream.peek_kind() {
                self.stream.bump(); // TagOpenEnd
            }
            true
        } else {
            false
        }
    }

    fn parse_element(&mut self) -> Option<ElementNode> {
        self.stream.bump(); // consume '<' (TagOpenStart)

        let name = match self.stream.bump() {
            Some(Token {
                kind: TokenKind::TagName(n),
                ..
            }) => n.to_string(),
            _ => return None,
        };

        let mut attributes = Vec::new();
        let mut properties = Vec::new();
        let mut events = Vec::new();
        let mut two_ways = Vec::new();
        let mut references = Vec::new();

        while !self.stream.is_eof() {
            match self.stream.peek_kind() {
                Some(TokenKind::TagOpenEnd) | Some(TokenKind::TagSelfClose) => break,
                Some(TokenKind::PropertyBinding(name)) => {
                    let prop_name = name.to_string();
                    self.stream.bump();
                    let (value, span) = self.consume_attr_value();
                    properties.push(PropertyBindingNode {
                        node_type: "property".to_string(),
                        name: prop_name,
                        expression: value,
                        span,
                    });
                }
                Some(TokenKind::EventBinding(name)) => {
                    let ev_name = name.to_string();
                    self.stream.bump();
                    let (handler, span) = self.consume_attr_value();
                    events.push(EventBindingNode {
                        node_type: "event".to_string(),
                        name: ev_name,
                        handler,
                        span,
                    });
                }
                Some(TokenKind::TwoWayBinding(name)) => {
                    let tw_name = name.to_string();
                    self.stream.bump();
                    let (expression, span) = self.consume_attr_value();
                    two_ways.push(TwoWayBindingNode {
                        node_type: "twoWay".to_string(),
                        name: tw_name,
                        expression,
                        span,
                    });
                }
                Some(TokenKind::TemplateRef(name)) => {
                    let ref_name = name.to_string();
                    self.stream.bump();
                    let value = if let Some(TokenKind::Equals) = self.stream.peek_kind() {
                        self.stream.bump();
                        if let Some(Token {
                            kind: TokenKind::AttributeValue(v),
                            ..
                        }) = self.stream.bump()
                        {
                            Some(v.to_string())
                        } else {
                            None
                        }
                    } else {
                        None
                    };
                    references.push(ReferenceNode {
                        node_type: "reference".to_string(),
                        name: ref_name,
                        value,
                    });
                }
                Some(TokenKind::AttributeName(name)) => {
                    let attr_name = name.to_string();
                    self.stream.bump();
                    let value = if let Some(TokenKind::Equals) = self.stream.peek_kind() {
                        self.stream.bump();
                        if let Some(Token {
                            kind: TokenKind::AttributeValue(v),
                            ..
                        }) = self.stream.bump()
                        {
                            decode_html_entities(v)
                        } else {
                            String::new()
                        }
                    } else {
                        String::new()
                    };
                    attributes.push(AttributeNode {
                        node_type: "attribute".to_string(),
                        name: attr_name,
                        value,
                    });
                }
                _ => {
                    self.stream.bump();
                }
            }
        }

        let is_self_closing = if is_void_element(&name) {
            if let Some(TokenKind::TagSelfClose) = self.stream.peek_kind() {
                self.stream.bump();
            } else if let Some(TokenKind::TagOpenEnd) = self.stream.peek_kind() {
                self.stream.bump();
            }
            true
        } else if let Some(TokenKind::TagSelfClose) = self.stream.peek_kind() {
            self.stream.bump();
            true
        } else if let Some(TokenKind::TagOpenEnd) = self.stream.peek_kind() {
            self.stream.bump();
            false
        } else {
            true
        };

        let mut children = Vec::new();
        if !is_self_closing {
            while !self.stream.is_eof() {
                if self.check_closing_tag(&name) {
                    self.consume_closing_tag(&name);
                    break;
                }
                if let Some(TokenKind::TagCloseStart) = self.stream.peek_kind() {
                    // Mismatched or outer closing tag, break to allow parent to close!
                    break;
                }
                let start_pos = self.stream.pos();
                if let Some(node) = self.parse_node() {
                    children.push(node);
                }
                if self.stream.pos() == start_pos {
                    if !self.stream.is_eof() {
                        self.stream.bump();
                    } else {
                        break;
                    }
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

    #[test]
    fn test_parse_dashboard_template() {
        let source =
            std::fs::read_to_string("../../examples/playground/src/views/dashboard.component.ts")
                .or_else(|_| {
                    std::fs::read_to_string("examples/playground/src/views/dashboard.component.ts")
                })
                .expect("Failed to read dashboard.component.ts");
        let start = source.find("template: `").unwrap() + 11;
        let end = source[start..].find("`").unwrap() + start;
        let tmpl = &source[start..end];
        let nodes = parse_template(tmpl);
        assert!(!nodes.is_empty());
    }
}
