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
    pub input: &'a str,
    stream: TokenStream<'a>,
    pub diagnostics: Vec<TemplateDiagnostic>,
}

impl<'a> TemplateParser<'a> {
    pub fn new(input: &'a str) -> Self {
        Self {
            input,
            stream: TokenStream::from_input(input),
            diagnostics: Vec::new(),
        }
    }

    pub fn emit_error(&mut self, code: &str, message: impl Into<String>, span: SourceSpan) {
        let (line, column) = calculate_line_column(self.input, span.start);
        self.diagnostics
            .push(TemplateDiagnostic::error(code, message, span, line, column));
    }

    pub fn emit_warning(&mut self, code: &str, message: impl Into<String>, span: SourceSpan) {
        let (line, column) = calculate_line_column(self.input, span.start);
        self.diagnostics.push(TemplateDiagnostic::warning(
            code, message, span, line, column,
        ));
    }

    pub fn parse(&mut self) -> Vec<TemplateNode> {
        let mut nodes = Vec::new();
        while !self.stream.is_eof() {
            if matches!(
                self.stream.peek_kind(),
                Some(TokenKind::CloseBrace) | Some(TokenKind::TagCloseStart)
            ) {
                if let Some(TokenKind::TagCloseStart) = self.stream.peek_kind() {
                    // Stray closing tag at root level
                    let start = self.stream.pos();
                    self.stream.bump(); // </
                    let tag_name = if let Some(TokenKind::TagName(n)) = self.stream.peek_kind() {
                        let name = n.to_string();
                        self.stream.bump();
                        name
                    } else {
                        "unknown".to_string()
                    };
                    if let Some(TokenKind::TagOpenEnd) = self.stream.peek_kind() {
                        self.stream.bump();
                    }
                    let span = SourceSpan {
                        start,
                        end: self.stream.pos(),
                    };
                    self.emit_error(
                        "ANG0104",
                        format!(
                            "Unexpected closing tag '</{}>' with no matching open tag.",
                            tag_name
                        ),
                        span,
                    );
                    continue;
                }
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

    pub fn parse_with_diagnostics(&mut self) -> (Vec<TemplateNode>, Vec<TemplateDiagnostic>) {
        let nodes = self.parse();
        (nodes, std::mem::take(&mut self.diagnostics))
    }

    fn parse_node(&mut self) -> Option<TemplateNode> {
        if self.stream.is_eof() {
            return None;
        }

        match self.stream.peek_kind()? {
            TokenKind::CloseBrace => None,
            TokenKind::TagCloseStart => None,
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

    fn parse_block(&mut self, block_name: &str, start_span: SourceSpan) -> Vec<TemplateNode> {
        if let Some(TokenKind::OpenBrace) = self.stream.peek_kind() {
            self.stream.bump(); // skip '{'
        } else {
            let pos = self.stream.pos();
            self.emit_error(
                "ANG0111",
                format!("Expected '{{' to begin block for '{}'.", block_name),
                SourceSpan {
                    start: pos,
                    end: pos,
                },
            );
            return Vec::new();
        }

        let mut nodes = Vec::new();
        let mut closed = false;
        while !self.stream.is_eof() {
            if let Some(TokenKind::CloseBrace) = self.stream.peek_kind() {
                self.stream.bump(); // skip '}'
                closed = true;
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

        if !closed {
            self.emit_error(
                "ANG0112",
                format!(
                    "Unclosed block for '{}'. Expected closing '}}'.",
                    block_name
                ),
                start_span,
            );
        }

        nodes
    }

    fn parse_if_block(&mut self) -> IfBlockNode {
        let tok = self.stream.bump().unwrap(); // skip '@if'
        let if_span = tok.span;

        let (condition, cond_span) = self.consume_expression();
        if condition.trim().is_empty() {
            self.emit_error(
                "ANG0110",
                "Missing condition expression in '@if' block. Expected '@if (condition)'.",
                if_span.clone(),
            );
        }
        let children = self.parse_block("@if", if_span);

        let mut branches = vec![IfBranch {
            condition: Some(condition),
            children,
            span: Some(cond_span),
        }];

        while let Some(TokenKind::ControlFlow(ControlFlowKeyword::ElseIf)) = self.stream.peek_kind()
        {
            let tok = self.stream.bump().unwrap(); // skip '@else if'
            let elseif_span = tok.span;
            let (next_cond, next_span) = self.consume_expression();
            if next_cond.trim().is_empty() {
                self.emit_error(
                    "ANG0110",
                    "Missing condition expression in '@else if' block. Expected '@else if (condition)'.",
                    elseif_span.clone(),
                );
            }
            let next_children = self.parse_block("@else if", elseif_span);
            branches.push(IfBranch {
                condition: Some(next_cond),
                children: next_children,
                span: Some(next_span),
            });
        }

        if let Some(TokenKind::ControlFlow(ControlFlowKeyword::Else)) = self.stream.peek_kind() {
            let tok = self.stream.bump().unwrap(); // skip '@else'
            let else_span = tok.span;
            let else_children = self.parse_block("@else", else_span);
            branches.push(IfBranch {
                condition: None,
                children: else_children,
                span: None,
            });
        }

        IfBlockNode { branches }
    }

    fn parse_for_block(&mut self) -> ForBlockNode {
        let tok = self.stream.bump().unwrap(); // skip '@for'
        let for_span = tok.span;

        let (header, header_span) = self.consume_expression();
        if header.trim().is_empty() {
            self.emit_error(
                "ANG0120",
                "Missing loop expression in '@for' block. Expected '@for (item of items; track trackBy)'.",
                for_span.clone(),
            );
        } else if !header.contains("track ") && !header.contains("; track") {
            self.emit_warning(
                "ANG0121",
                "'@for' loop is missing a mandatory 'track' expression. Example: '@for (item of items; track item.id)'.",
                header_span.clone(),
            );
        }
        let children = self.parse_block("@for", for_span);

        let mut empty_block = None;
        if let Some(TokenKind::ControlFlow(ControlFlowKeyword::Empty)) = self.stream.peek_kind() {
            let empty_tok = self.stream.bump().unwrap(); // skip '@empty'
            empty_block = Some(self.parse_block("@empty", empty_tok.span));
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
        let tok = self.stream.bump().unwrap(); // skip '@switch'
        let switch_span = tok.span;

        let (expression, expr_span) = self.consume_expression();
        if expression.trim().is_empty() {
            self.emit_error(
                "ANG0130",
                "Missing expression in '@switch' block. Expected '@switch (expression)'.",
                switch_span.clone(),
            );
        }

        let mut cases = Vec::new();
        if let Some(TokenKind::OpenBrace) = self.stream.peek_kind() {
            self.stream.bump(); // skip '{'
            let mut closed = false;
            while !self.stream.is_eof() {
                if let Some(TokenKind::CloseBrace) = self.stream.peek_kind() {
                    self.stream.bump(); // skip '}'
                    closed = true;
                    break;
                }

                if let Some(TokenKind::ControlFlow(ControlFlowKeyword::Case)) =
                    self.stream.peek_kind()
                {
                    let mut case_values = Vec::new();
                    let mut first_case_span = None;
                    while let Some(TokenKind::ControlFlow(ControlFlowKeyword::Case)) =
                        self.stream.peek_kind()
                    {
                        let case_tok = self.stream.bump().unwrap(); // skip '@case'
                        if first_case_span.is_none() {
                            first_case_span = Some(case_tok.span.clone());
                        }
                        let (val, case_span) = self.consume_expression();
                        if val.trim().is_empty() {
                            self.emit_error(
                                "ANG0132",
                                "Missing value in '@case' block. Expected '@case (value)'.",
                                case_tok.span,
                            );
                        }
                        for single_val in split_case_values(&val) {
                            case_values.push((single_val, case_span.clone()));
                        }
                    }
                    let span_for_block = first_case_span.unwrap_or_else(|| switch_span.clone());
                    let children = self.parse_block("@case", span_for_block);
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
                    let def_tok = self.stream.bump().unwrap(); // skip '@default'
                    let children = self.parse_block("@default", def_tok.span);
                    cases.push(SwitchCase {
                        case_value: None,
                        children,
                        span: None,
                    });
                } else {
                    self.stream.bump();
                }
            }

            if !closed {
                self.emit_error(
                    "ANG0131",
                    "Unclosed block in '@switch'. Expected closing '}'.",
                    switch_span,
                );
            }
        } else {
            let pos = self.stream.pos();
            self.emit_error(
                "ANG0111",
                "Expected '{' after '@switch (expression)'.",
                SourceSpan {
                    start: pos,
                    end: pos,
                },
            );
        }

        SwitchBlockNode {
            expression,
            cases,
            span: Some(expr_span),
        }
    }

    fn parse_defer_block(&mut self) -> DeferBlockNode {
        let tok = self.stream.bump().unwrap(); // skip '@defer'
        let defer_span = tok.span;

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

        let main_block = self.parse_block("@defer", defer_span);
        let mut placeholder_block = None;
        let mut loading_block = None;
        let mut error_block = None;

        while let Some(TokenKind::ControlFlow(kw)) = self.stream.peek_kind() {
            match kw {
                ControlFlowKeyword::Placeholder => {
                    let p_tok = self.stream.bump().unwrap();
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
                    let children = self.parse_block("@placeholder", p_tok.span);
                    placeholder_block = Some(PlaceholderBlock { children, minimum });
                }
                ControlFlowKeyword::Loading => {
                    let l_tok = self.stream.bump().unwrap();
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
                    let children = self.parse_block("@loading", l_tok.span);
                    loading_block = Some(LoadingBlock {
                        children,
                        after,
                        minimum,
                    });
                }
                ControlFlowKeyword::Error => {
                    let e_tok = self.stream.bump().unwrap();
                    let children = self.parse_block("@error", e_tok.span);
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
                if expr.trim().is_empty() {
                    self.emit_warning(
                        "ANG0150",
                        "Empty interpolation '{{ }}'. Expected an expression.",
                        tok.span.clone(),
                    );
                }
                if tok.span.end == self.input.len() && !self.input.ends_with("}}") {
                    self.emit_error(
                        "ANG0151",
                        "Unterminated interpolation. Expected closing '}}'.",
                        tok.span.clone(),
                    );
                }
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
        let open_tok = self.stream.bump().unwrap(); // consume '<' (TagOpenStart)
        let open_span = open_tok.span;

        let name = match self.stream.bump() {
            Some(Token {
                kind: TokenKind::TagName(n),
                ..
            }) => n.to_string(),
            _ => {
                let pos = self.stream.pos();
                self.emit_error(
                    "ANG0104",
                    "Expected tag name after '<'.",
                    SourceSpan {
                        start: open_span.start,
                        end: pos,
                    },
                );
                return None;
            }
        };

        let mut attributes = Vec::new();
        let mut properties = Vec::new();
        let mut events = Vec::new();
        let mut two_ways = Vec::new();
        let mut references = Vec::new();

        while !self.stream.is_eof() {
            match self.stream.peek_kind() {
                Some(TokenKind::TagOpenEnd) | Some(TokenKind::TagSelfClose) => break,
                Some(TokenKind::PropertyBinding(pname)) => {
                    let prop_name = pname.to_string();
                    let tok = self.stream.bump().unwrap();
                    let (value, span) = self.consume_attr_value();
                    if value.trim().is_empty() {
                        self.emit_warning(
                            "ANG0160",
                            format!(
                                "Property binding '[{}]' has an empty expression.",
                                prop_name
                            ),
                            span.clone().unwrap_or(tok.span),
                        );
                    }
                    properties.push(PropertyBindingNode {
                        node_type: "property".to_string(),
                        name: prop_name,
                        expression: value,
                        span,
                    });
                }
                Some(TokenKind::EventBinding(ename)) => {
                    let ev_name = ename.to_string();
                    let tok = self.stream.bump().unwrap();
                    let (handler, span) = self.consume_attr_value();
                    if handler.trim().is_empty() {
                        self.emit_warning(
                            "ANG0161",
                            format!("Event binding '({})' has an empty handler.", ev_name),
                            span.clone().unwrap_or(tok.span),
                        );
                    }
                    events.push(EventBindingNode {
                        node_type: "event".to_string(),
                        name: ev_name,
                        handler,
                        span,
                    });
                }
                Some(TokenKind::TwoWayBinding(tname)) => {
                    let tw_name = tname.to_string();
                    let tok = self.stream.bump().unwrap();
                    let (expression, span) = self.consume_attr_value();
                    if expression.trim().is_empty() {
                        self.emit_warning(
                            "ANG0162",
                            format!("Two-way binding '[({})]' has an empty expression.", tw_name),
                            span.clone().unwrap_or(tok.span),
                        );
                    }
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

        if self.stream.is_eof() {
            self.emit_error(
                "ANG0101",
                format!("Unclosed opening tag '<{}...'. Expected '>' or '/>'.", name),
                SourceSpan {
                    start: open_span.start,
                    end: self.stream.pos(),
                },
            );
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
            let mut closed = false;
            while !self.stream.is_eof() {
                if self.check_closing_tag(&name) {
                    self.consume_closing_tag(&name);
                    closed = true;
                    break;
                }
                if let Some(TokenKind::TagCloseStart) = self.stream.peek_kind() {
                    // Mismatched closing tag!
                    if let Some(Token {
                        kind: TokenKind::TagName(actual_name),
                        span,
                        ..
                    }) = self.stream.peek_at(1)
                    {
                        self.emit_error(
                            "ANG0103",
                            format!(
                                "Mismatched closing tag '</{}>'. Expected closing tag '</{}>'.",
                                actual_name, name
                            ),
                            span.clone(),
                        );
                    }
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

            if !closed && self.stream.is_eof() {
                self.emit_error(
                    "ANG0102",
                    format!(
                        "Unclosed element '<{}>'. Expected closing tag '</{}>'.",
                        name, name
                    ),
                    open_span.clone(),
                );
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
            span: Some(SourceSpan {
                start: open_span.start,
                end: self.stream.pos(),
            }),
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

pub fn parse_template_with_diagnostics(
    input: &str,
) -> (Vec<TemplateNode>, Vec<TemplateDiagnostic>) {
    TemplateParser::new(input).parse_with_diagnostics()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_diagnostics_unclosed_element() {
        let tmpl = "<div><span>Hello</span>";
        let (nodes, diags) = parse_template_with_diagnostics(tmpl);
        assert_eq!(nodes.len(), 1);
        let unclosed = diags.iter().find(|d| d.code == "ANG0102");
        assert!(unclosed.is_some(), "Expected ANG0102 for unclosed <div>");
        let d = unclosed.unwrap();
        assert!(d.message.contains("Unclosed element '<div>'"));
        let snippet = d.render_snippet(tmpl, Some("test.html"));
        assert!(snippet.contains("error[ANG0102]"));
        assert!(snippet.contains("test.html:1:1"));
    }

    #[test]
    fn test_diagnostics_mismatched_closing_tag() {
        let tmpl = "<div></span>";
        let (_nodes, diags) = parse_template_with_diagnostics(tmpl);
        let mismatched = diags.iter().find(|d| d.code == "ANG0103");
        assert!(mismatched.is_some(), "Expected ANG0103 for </span>");
        let d = mismatched.unwrap();
        assert!(d.message.contains("Mismatched closing tag '</span>'"));
        assert!(d.message.contains("Expected closing tag '</div>'"));
    }

    #[test]
    fn test_diagnostics_unclosed_opening_tag() {
        let tmpl = r#"<div class="card""#;
        let (_nodes, diags) = parse_template_with_diagnostics(tmpl);
        let unclosed_tag = diags.iter().find(|d| d.code == "ANG0101");
        assert!(
            unclosed_tag.is_some(),
            "Expected ANG0101 for <div class=\"card\""
        );
        let d = unclosed_tag.unwrap();
        assert!(d.message.contains("Unclosed opening tag '<div...'"));
    }

    #[test]
    fn test_diagnostics_control_flow_missing_condition_and_unclosed() {
        // Missing condition
        let tmpl = "@if () {\n  <span>Hi</span>\n}";
        let (_nodes, diags) = parse_template_with_diagnostics(tmpl);
        let missing_cond = diags.iter().find(|d| d.code == "ANG0110");
        assert!(
            missing_cond.is_some(),
            "Expected ANG0110 for empty condition"
        );

        // Unclosed block
        let tmpl2 = "@if (isLoggedIn) {\n  <div>Hello</div>";
        let (_nodes2, diags2) = parse_template_with_diagnostics(tmpl2);
        let unclosed_block = diags2.iter().find(|d| d.code == "ANG0112");
        assert!(
            unclosed_block.is_some(),
            "Expected ANG0112 for unclosed @if block"
        );
        let snippet = unclosed_block.unwrap().render_snippet(tmpl2, None);
        assert!(snippet.contains("template:1:1"));
    }

    #[test]
    fn test_diagnostics_for_missing_track() {
        let tmpl = "@for (item of items) {\n  <div>{{ item.name }}</div>\n}";
        let (_nodes, diags) = parse_template_with_diagnostics(tmpl);
        let missing_track = diags.iter().find(|d| d.code == "ANG0121");
        assert!(
            missing_track.is_some(),
            "Expected ANG0121 warning for missing track"
        );
        assert_eq!(missing_track.unwrap().severity, DiagnosticSeverity::Warning);
    }

    #[test]
    fn test_diagnostics_empty_interpolation() {
        let tmpl = "<p>Welcome {{   }}!</p>";
        let (_nodes, diags) = parse_template_with_diagnostics(tmpl);
        let empty_interp = diags.iter().find(|d| d.code == "ANG0150");
        assert!(
            empty_interp.is_some(),
            "Expected ANG0150 warning for empty interpolation"
        );
    }

    #[test]
    fn test_diagnostics_empty_bindings() {
        let tmpl = r#"<input [disabled]="" (click)="" />"#;
        let (_nodes, diags) = parse_template_with_diagnostics(tmpl);
        assert!(diags.iter().any(|d| d.code == "ANG0160"));
        assert!(diags.iter().any(|d| d.code == "ANG0161"));
    }

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
