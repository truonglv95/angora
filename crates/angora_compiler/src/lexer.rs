use crate::token::{ControlFlowKeyword, Token, TokenKind};

#[derive(Debug, PartialEq, Eq)]
enum LexerState {
    Data,
    InTag,
    InTagClose,
}

pub struct Lexer<'a> {
    input: &'a str,
    pos: usize,
    state: LexerState,
}

impl<'a> Lexer<'a> {
    pub fn new(input: &'a str) -> Self {
        Self {
            input,
            pos: 0,
            state: LexerState::Data,
        }
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

    fn peek_char(&self) -> Option<char> {
        self.current_slice().chars().next()
    }

    fn advance(&mut self, n: usize) {
        self.pos = (self.pos + n).min(self.input.len());
    }

    fn advance_char(&mut self) -> Option<char> {
        if let Some(c) = self.peek_char() {
            self.pos += c.len_utf8();
            Some(c)
        } else {
            None
        }
    }

    fn skip_whitespace(&mut self) {
        while let Some(c) = self.peek_char() {
            if c.is_whitespace() {
                self.pos += c.len_utf8();
            } else {
                break;
            }
        }
    }

    pub fn tokenize(&mut self) -> Vec<Token<'a>> {
        let mut tokens = Vec::new();
        loop {
            let tok = self.next_token();
            let is_eof = tok.kind == TokenKind::Eof;
            tokens.push(tok);
            if is_eof {
                break;
            }
        }
        tokens
    }

    pub fn next_token(&mut self) -> Token<'a> {
        match self.state {
            LexerState::Data => self.lex_data(),
            LexerState::InTag => self.lex_in_tag(),
            LexerState::InTagClose => self.lex_in_tag_close(),
        }
    }

    fn lex_data(&mut self) -> Token<'a> {
        if self.is_eof() {
            return Token::new(TokenKind::Eof, self.pos, self.pos);
        }

        // 1. HTML comment <!-- ... -->
        if self.starts_with("<!--") {
            let start = self.pos;
            self.advance(4);
            let end_idx = match self.current_slice().find("-->") {
                Some(idx) => {
                    let content = &self.input[start + 4..self.pos + idx];
                    self.advance(idx + 3);
                    content
                }
                None => {
                    let content = &self.input[start + 4..];
                    self.pos = self.input.len();
                    content
                }
            };
            return Token::new(TokenKind::Comment(end_idx), start, self.pos);
        }

        // 2. Closing tag: </tag>
        if self.starts_with("</") {
            let start = self.pos;
            self.advance(2);
            self.state = LexerState::InTagClose;
            return Token::new(TokenKind::TagCloseStart, start, self.pos);
        }

        // 3. Opening tag: <tag
        if self.starts_with("<") {
            let after_bracket = &self.current_slice()[1..];
            if let Some(first_char) = after_bracket.chars().next() {
                if first_char.is_alphabetic() || first_char == '_' || first_char == '$' {
                    let start = self.pos;
                    self.advance(1);
                    self.state = LexerState::InTag;
                    return Token::new(TokenKind::TagOpenStart, start, self.pos);
                }
            }
        }

        // 4. Interpolation: {{ expr }}
        if self.starts_with("{{") {
            let start = self.pos;
            self.advance(2);
            let expr_start = self.pos;
            let mut in_quote: Option<char> = None;

            while !self.is_eof() {
                let slice = self.current_slice();
                if in_quote.is_none() && slice.starts_with("}}") {
                    let expr = &self.input[expr_start..self.pos];
                    self.advance(2);
                    return Token::new(TokenKind::Interpolation(expr), start, self.pos);
                }

                let c = self.advance_char().unwrap();
                if let Some(q) = in_quote {
                    if c == q && !slice.starts_with(r#"\""#) {
                        in_quote = None;
                    }
                } else if c == '\'' || c == '"' || c == '`' {
                    in_quote = Some(c);
                }
            }

            let expr = &self.input[expr_start..self.pos];
            return Token::new(TokenKind::Interpolation(expr), start, self.pos);
        }

        // 5. Control Flow: @if, @for, @switch, etc.
        if self.starts_with("@") {
            let start = self.pos;
            if let Some(cf) = self.match_control_flow() {
                return Token::new(TokenKind::ControlFlow(cf), start, self.pos);
            }
        }

        // 6. Close brace '}' (exits control flow body)
        if self.starts_with("}") {
            let start = self.pos;
            self.advance(1);
            return Token::new(TokenKind::CloseBrace, start, self.pos);
        }

        // 7. Text content up to next special symbol: '<', '{{', '@', '}'
        let start = self.pos;
        while !self.is_eof() {
            if self.starts_with("<")
                || self.starts_with("{{")
                || self.starts_with("@")
                || self.starts_with("}")
            {
                // Check if @ is actually a control flow keyword
                if self.starts_with("@") {
                    let rem = &self.current_slice()[1..];
                    let is_cf = [
                        "if",
                        "else",
                        "for",
                        "empty",
                        "switch",
                        "case",
                        "default",
                        "defer",
                        "placeholder",
                        "loading",
                        "error",
                    ]
                    .iter()
                    .any(|kw| rem.starts_with(kw));
                    if is_cf {
                        break;
                    }
                } else {
                    break;
                }
            }
            self.advance_char();
        }

        let text_content = &self.input[start..self.pos];
        Token::new(TokenKind::Text(text_content), start, self.pos)
    }

    fn match_control_flow(&mut self) -> Option<ControlFlowKeyword> {
        let slice = self.current_slice();
        if !slice.starts_with('@') {
            return None;
        }

        let rest = &slice[1..];
        if rest.starts_with("else if") {
            self.advance(1 + "else if".len());
            Some(ControlFlowKeyword::ElseIf)
        } else if rest.starts_with("if") && self.is_boundary(rest, 2) {
            self.advance(1 + 2);
            Some(ControlFlowKeyword::If)
        } else if rest.starts_with("else") && self.is_boundary(rest, 4) {
            self.advance(1 + 4);
            Some(ControlFlowKeyword::Else)
        } else if rest.starts_with("for") && self.is_boundary(rest, 3) {
            self.advance(1 + 3);
            Some(ControlFlowKeyword::For)
        } else if rest.starts_with("empty") && self.is_boundary(rest, 5) {
            self.advance(1 + 5);
            Some(ControlFlowKeyword::Empty)
        } else if rest.starts_with("switch") && self.is_boundary(rest, 6) {
            self.advance(1 + 6);
            Some(ControlFlowKeyword::Switch)
        } else if rest.starts_with("case") && self.is_boundary(rest, 4) {
            self.advance(1 + 4);
            Some(ControlFlowKeyword::Case)
        } else if rest.starts_with("default") && self.is_boundary(rest, 7) {
            self.advance(1 + 7);
            Some(ControlFlowKeyword::Default)
        } else if rest.starts_with("defer") && self.is_boundary(rest, 5) {
            self.advance(1 + 5);
            Some(ControlFlowKeyword::Defer)
        } else if rest.starts_with("placeholder") && self.is_boundary(rest, 11) {
            self.advance(1 + 11);
            Some(ControlFlowKeyword::Placeholder)
        } else if rest.starts_with("loading") && self.is_boundary(rest, 7) {
            self.advance(1 + 7);
            Some(ControlFlowKeyword::Loading)
        } else if rest.starts_with("error") && self.is_boundary(rest, 5) {
            self.advance(1 + 5);
            Some(ControlFlowKeyword::Error)
        } else {
            None
        }
    }

    fn is_boundary(&self, s: &str, len: usize) -> bool {
        if s.len() == len {
            true
        } else {
            let next_c = s[len..].chars().next().unwrap();
            next_c.is_whitespace() || next_c == '(' || next_c == '{'
        }
    }

    fn lex_in_tag(&mut self) -> Token<'a> {
        self.skip_whitespace();
        if self.is_eof() {
            self.state = LexerState::Data;
            return Token::new(TokenKind::Eof, self.pos, self.pos);
        }

        // Tag close "/>"
        if self.starts_with("/>") {
            let start = self.pos;
            self.advance(2);
            self.state = LexerState::Data;
            return Token::new(TokenKind::TagSelfClose, start, self.pos);
        }

        // Tag end ">"
        if self.starts_with(">") {
            let start = self.pos;
            self.advance(1);
            self.state = LexerState::Data;
            return Token::new(TokenKind::TagOpenEnd, start, self.pos);
        }

        // Two-way binding: [(name)]
        if self.starts_with("[(") {
            let start = self.pos;
            self.advance(2);
            let name_start = self.pos;
            if let Some(idx) = self.current_slice().find(")]") {
                let name = &self.input[name_start..self.pos + idx];
                self.advance(idx + 2);
                return Token::new(TokenKind::TwoWayBinding(name), start, self.pos);
            }
        }

        // Property binding: [name]
        if self.starts_with("[") {
            let start = self.pos;
            self.advance(1);
            let name_start = self.pos;
            if let Some(idx) = self.current_slice().find(']') {
                let name = &self.input[name_start..self.pos + idx];
                self.advance(idx + 1);
                return Token::new(TokenKind::PropertyBinding(name), start, self.pos);
            }
        }

        // Event binding: (name)
        if self.starts_with("(") {
            let start = self.pos;
            self.advance(1);
            let name_start = self.pos;
            if let Some(idx) = self.current_slice().find(')') {
                let name = &self.input[name_start..self.pos + idx];
                self.advance(idx + 1);
                return Token::new(TokenKind::EventBinding(name), start, self.pos);
            }
        }

        // Template ref: #name
        if self.starts_with("#") {
            let start = self.pos;
            self.advance(1);
            let name_start = self.pos;
            while let Some(c) = self.peek_char() {
                if c.is_alphanumeric() || c == '_' || c == '-' || c == '$' {
                    self.advance_char();
                } else {
                    break;
                }
            }
            let name = &self.input[name_start..self.pos];
            return Token::new(TokenKind::TemplateRef(name), start, self.pos);
        }

        // Equals: =
        if self.starts_with("=") {
            let start = self.pos;
            self.advance(1);
            return Token::new(TokenKind::Equals, start, self.pos);
        }

        // Quoted attribute value: "value" or 'value'
        if let Some(quote) = self.peek_char() {
            if quote == '"' || quote == '\'' {
                let start = self.pos;
                self.advance(1);
                let val_start = self.pos;
                while let Some(c) = self.peek_char() {
                    if c == quote {
                        let val = &self.input[val_start..self.pos];
                        self.advance(1);
                        return Token::new(TokenKind::AttributeValue(val), start, self.pos);
                    }
                    self.advance_char();
                }
                let val = &self.input[val_start..self.pos];
                return Token::new(TokenKind::AttributeValue(val), start, self.pos);
            }
        }

        // Tag name or standard attribute name
        let start = self.pos;
        while let Some(c) = self.peek_char() {
            if c.is_alphanumeric()
                || c == '-'
                || c == '_'
                || c == ':'
                || c == '.'
                || c == '@'
                || c == '$'
            {
                self.advance_char();
            } else {
                break;
            }
        }

        let name = &self.input[start..self.pos];
        Token::new(TokenKind::AttributeName(name), start, self.pos)
    }

    fn lex_in_tag_close(&mut self) -> Token<'a> {
        self.skip_whitespace();
        if self.is_eof() {
            self.state = LexerState::Data;
            return Token::new(TokenKind::Eof, self.pos, self.pos);
        }

        if self.starts_with(">") {
            let start = self.pos;
            self.advance(1);
            self.state = LexerState::Data;
            return Token::new(TokenKind::TagOpenEnd, start, self.pos);
        }

        let start = self.pos;
        while let Some(c) = self.peek_char() {
            if c.is_alphanumeric() || c == '-' || c == '_' || c == ':' || c == '$' {
                self.advance_char();
            } else {
                break;
            }
        }
        let name = &self.input[start..self.pos];
        Token::new(TokenKind::TagName(name), start, self.pos)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lex_basic_html() {
        let input = "<button class=\"btn\" disabled>Click me</button>";
        let mut lexer = Lexer::new(input);
        let tokens = lexer.tokenize();

        assert_eq!(tokens[0].kind, TokenKind::TagOpenStart);
        assert_eq!(tokens[1].kind, TokenKind::AttributeName("button")); // TagName in InTag
        assert_eq!(tokens[2].kind, TokenKind::AttributeName("class"));
        assert_eq!(tokens[3].kind, TokenKind::Equals);
        assert_eq!(tokens[4].kind, TokenKind::AttributeValue("btn"));
        assert_eq!(tokens[5].kind, TokenKind::AttributeName("disabled"));
        assert_eq!(tokens[6].kind, TokenKind::TagOpenEnd);
        assert_eq!(tokens[7].kind, TokenKind::Text("Click me"));
        assert_eq!(tokens[8].kind, TokenKind::TagCloseStart);
        assert_eq!(tokens[9].kind, TokenKind::TagName("button"));
        assert_eq!(tokens[10].kind, TokenKind::TagOpenEnd);
        assert_eq!(tokens[11].kind, TokenKind::Eof);
    }

    #[test]
    fn test_lex_bindings_and_interpolation() {
        let input = "<app-user [user]=\"currentUser()\" (select)=\"onSelect($event)\" [(ngModel)]=\"email\" #userCard>{{ user.name }}</app-user>";
        let mut lexer = Lexer::new(input);
        let tokens = lexer.tokenize();

        assert_eq!(tokens[0].kind, TokenKind::TagOpenStart);
        assert_eq!(tokens[1].kind, TokenKind::AttributeName("app-user"));
        assert_eq!(tokens[2].kind, TokenKind::PropertyBinding("user"));
        assert_eq!(tokens[3].kind, TokenKind::Equals);
        assert_eq!(tokens[4].kind, TokenKind::AttributeValue("currentUser()"));
        assert_eq!(tokens[5].kind, TokenKind::EventBinding("select"));
        assert_eq!(tokens[6].kind, TokenKind::Equals);
        assert_eq!(
            tokens[7].kind,
            TokenKind::AttributeValue("onSelect($event)")
        );
        assert_eq!(tokens[8].kind, TokenKind::TwoWayBinding("ngModel"));
        assert_eq!(tokens[9].kind, TokenKind::Equals);
        assert_eq!(tokens[10].kind, TokenKind::AttributeValue("email"));
        assert_eq!(tokens[11].kind, TokenKind::TemplateRef("userCard"));
        assert_eq!(tokens[12].kind, TokenKind::TagOpenEnd);
        assert_eq!(tokens[13].kind, TokenKind::Interpolation(" user.name "));
    }

    #[test]
    fn test_lex_control_flow() {
        let input = "@if (isLoggedIn) { <span>Welcome</span> } @else { <button>Login</button> }";
        let mut lexer = Lexer::new(input);
        let tokens = lexer.tokenize();

        assert_eq!(
            tokens[0].kind,
            TokenKind::ControlFlow(ControlFlowKeyword::If)
        );
        assert!(tokens
            .iter()
            .any(|t| t.kind == TokenKind::ControlFlow(ControlFlowKeyword::Else)));
    }
}
