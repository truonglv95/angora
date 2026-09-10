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
    is_tag_name: bool,
    after_equals: bool,
    expecting_expr: bool,
}

impl<'a> Lexer<'a> {
    pub fn new(input: &'a str) -> Self {
        Self {
            input,
            pos: 0,
            state: LexerState::Data,
            is_tag_name: false,
            after_equals: false,
            expecting_expr: false,
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

    pub fn is_control_flow_keyword(s: &str) -> bool {
        if !s.starts_with('@') {
            return false;
        }
        let rest = &s[1..];
        if rest.starts_with("else if") {
            let after = rest["else if".len()..].trim_start();
            after.starts_with('(')
        } else if rest.starts_with("if") {
            let after = rest[2..].trim_start();
            after.starts_with('(')
        } else if rest.starts_with("else") {
            let after = rest[4..].trim_start();
            after.starts_with('{')
        } else if rest.starts_with("for") {
            let after = rest[3..].trim_start();
            after.starts_with('(')
        } else if rest.starts_with("empty") {
            let after = rest[5..].trim_start();
            after.starts_with('{')
        } else if rest.starts_with("switch") {
            let after = rest[6..].trim_start();
            after.starts_with('(')
        } else if rest.starts_with("case") {
            let after = rest[4..].trim_start();
            after.starts_with('(')
        } else if rest.starts_with("default") {
            let after = rest[7..].trim_start();
            after.starts_with('{')
        } else if rest.starts_with("defer") {
            let after = rest[5..].trim_start();
            after.starts_with('(') || after.starts_with('{')
        } else if rest.starts_with("placeholder") {
            let after = rest[11..].trim_start();
            after.starts_with('(') || after.starts_with('{')
        } else if rest.starts_with("loading") {
            let after = rest[7..].trim_start();
            after.starts_with('(') || after.starts_with('{')
        } else if rest.starts_with("error") {
            let after = rest[5..].trim_start();
            after.starts_with('{')
        } else {
            false
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

        // Parenthesized expression after a control flow keyword
        if self.expecting_expr {
            self.skip_whitespace();
            if self.starts_with("(") {
                self.advance(1); // skip '('
                let mut depth = 1;
                let mut in_quote: Option<char> = None;
                let expr_start = self.pos;

                while !self.is_eof() && depth > 0 {
                    let ch = self.peek_char().unwrap();
                    let prev = if self.pos > expr_start {
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
                            let raw = &self.input[expr_start..self.pos];
                            let expr = raw.trim();
                            let leading = raw.len() - raw.trim_start().len();
                            let span_start = expr_start + leading;
                            let span_end = span_start + expr.len();
                            self.advance(1); // skip ')'
                            self.expecting_expr = false;
                            return Token::new(TokenKind::Expression(expr), span_start, span_end);
                        }
                    }
                    self.advance_char();
                }

                let raw = &self.input[expr_start..self.pos];
                let expr = raw.trim();
                let leading = raw.len() - raw.trim_start().len();
                let span_start = expr_start + leading;
                let span_end = span_start + expr.len();
                if self.starts_with(")") {
                    self.advance(1);
                }
                self.expecting_expr = false;
                return Token::new(TokenKind::Expression(expr), span_start, span_end);
            } else {
                self.expecting_expr = false;
            }
        }

        // Skip pure inter-element / inter-block whitespace
        let mut check_pos = self.pos;
        while check_pos < self.input.len() {
            let ch = self.input[check_pos..].chars().next().unwrap();
            if ch.is_whitespace() {
                check_pos += ch.len_utf8();
            } else {
                break;
            }
        }
        if check_pos > self.pos {
            if check_pos >= self.input.len() {
                self.pos = check_pos;
                return Token::new(TokenKind::Eof, self.pos, self.pos);
            }
            let rem = &self.input[check_pos..];
            if rem.starts_with('<')
                || rem.starts_with('{')
                || rem.starts_with('}')
                || (rem.starts_with('@') && Self::is_control_flow_keyword(rem))
            {
                self.pos = check_pos;
            }
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
                    self.is_tag_name = true;
                    self.after_equals = false;
                    return Token::new(TokenKind::TagOpenStart, start, self.pos);
                }
            }
        }

        // 4. Interpolation: {{ expr }}
        if self.starts_with("{{") {
            self.advance(2);
            let expr_start = self.pos;
            let mut in_quote: Option<char> = None;

            while !self.is_eof() {
                let slice = self.current_slice();
                if in_quote.is_none() && slice.starts_with("}}") {
                    let raw = &self.input[expr_start..self.pos];
                    let expr = raw.trim();
                    let leading = raw.len() - raw.trim_start().len();
                    let span_start = expr_start + leading;
                    let span_end = span_start + expr.len();
                    self.advance(2);
                    return Token::new(TokenKind::Interpolation(expr), span_start, span_end);
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

            let raw = &self.input[expr_start..self.pos];
            let expr = raw.trim();
            let leading = raw.len() - raw.trim_start().len();
            let span_start = expr_start + leading;
            let span_end = span_start + expr.len();
            return Token::new(TokenKind::Interpolation(expr), span_start, span_end);
        }

        // 5. Control Flow: @if, @for, @switch, etc.
        if self.starts_with("@") {
            let start = self.pos;
            if let Some(cf) = self.match_control_flow() {
                if matches!(
                    cf,
                    ControlFlowKeyword::If
                        | ControlFlowKeyword::ElseIf
                        | ControlFlowKeyword::For
                        | ControlFlowKeyword::Switch
                        | ControlFlowKeyword::Case
                        | ControlFlowKeyword::Defer
                        | ControlFlowKeyword::Placeholder
                        | ControlFlowKeyword::Loading
                ) {
                    self.expecting_expr = true;
                }
                return Token::new(TokenKind::ControlFlow(cf), start, self.pos);
            }
        }

        // 6. Open brace '{' (enters control flow body)
        if self.starts_with("{") {
            let start = self.pos;
            self.advance(1);
            return Token::new(TokenKind::OpenBrace, start, self.pos);
        }

        // 7. Close brace '}' (exits control flow body)
        if self.starts_with("}") {
            let start = self.pos;
            self.advance(1);
            return Token::new(TokenKind::CloseBrace, start, self.pos);
        }

        // 8. Text content up to next special symbol: '<', '{{', '@', '{', '}'
        let start = self.pos;
        while !self.is_eof() {
            if self.starts_with("<")
                || self.starts_with("{{")
                || self.starts_with("{")
                || self.starts_with("}")
            {
                break;
            }
            if self.starts_with("@") && Self::is_control_flow_keyword(self.current_slice()) {
                break;
            }
            self.advance_char();
        }

        let text_content = &self.input[start..self.pos];
        if text_content.is_empty() && !self.is_eof() {
            // Guard against zero-length progress (e.g. isolated '<' or symbol not starting a tag)
            self.advance_char();
            while !self.is_eof() {
                if self.starts_with("<")
                    || self.starts_with("{{")
                    || self.starts_with("{")
                    || self.starts_with("}")
                {
                    break;
                }
                if self.starts_with("@") && Self::is_control_flow_keyword(self.current_slice()) {
                    break;
                }
                self.advance_char();
            }
            let text_content = &self.input[start..self.pos];
            Token::new(TokenKind::Text(text_content), start, self.pos)
        } else {
            Token::new(TokenKind::Text(text_content), start, self.pos)
        }
    }

    fn match_control_flow(&mut self) -> Option<ControlFlowKeyword> {
        let slice = self.current_slice();
        if !slice.starts_with('@') || !Self::is_control_flow_keyword(slice) {
            return None;
        }

        let rest = &slice[1..];
        if rest.starts_with("else if") {
            self.advance(1 + "else if".len());
            Some(ControlFlowKeyword::ElseIf)
        } else if rest.starts_with("if") {
            self.advance(1 + 2);
            Some(ControlFlowKeyword::If)
        } else if rest.starts_with("else") {
            self.advance(1 + 4);
            Some(ControlFlowKeyword::Else)
        } else if rest.starts_with("for") {
            self.advance(1 + 3);
            Some(ControlFlowKeyword::For)
        } else if rest.starts_with("empty") {
            self.advance(1 + 5);
            Some(ControlFlowKeyword::Empty)
        } else if rest.starts_with("switch") {
            self.advance(1 + 6);
            Some(ControlFlowKeyword::Switch)
        } else if rest.starts_with("case") {
            self.advance(1 + 4);
            Some(ControlFlowKeyword::Case)
        } else if rest.starts_with("default") {
            self.advance(1 + 7);
            Some(ControlFlowKeyword::Default)
        } else if rest.starts_with("defer") {
            self.advance(1 + 5);
            Some(ControlFlowKeyword::Defer)
        } else if rest.starts_with("placeholder") {
            self.advance(1 + 11);
            Some(ControlFlowKeyword::Placeholder)
        } else if rest.starts_with("loading") {
            self.advance(1 + 7);
            Some(ControlFlowKeyword::Loading)
        } else if rest.starts_with("error") {
            self.advance(1 + 5);
            Some(ControlFlowKeyword::Error)
        } else {
            None
        }
    }

    fn lex_in_tag(&mut self) -> Token<'a> {
        self.skip_whitespace();
        if self.is_eof() {
            self.state = LexerState::Data;
            return Token::new(TokenKind::Eof, self.pos, self.pos);
        }

        // Tag name immediately following '<'
        if self.is_tag_name {
            let start = self.pos;
            while let Some(c) = self.peek_char() {
                if c.is_alphanumeric() || c == '-' || c == '_' || c == ':' || c == '$' {
                    self.advance_char();
                } else {
                    break;
                }
            }
            let name = &self.input[start..self.pos];
            self.is_tag_name = false;
            return Token::new(TokenKind::TagName(name), start, self.pos);
        }

        // Attribute value immediately following '='
        if self.after_equals {
            self.after_equals = false;
            if let Some(quote) = self.peek_char() {
                if quote == '"' || quote == '\'' {
                    self.advance(1); // consume opening quote
                    let val_start = self.pos;
                    while !self.is_eof() {
                        let ch = self.peek_char().unwrap();
                        let prev = if self.pos > val_start {
                            self.input[..self.pos].chars().last()
                        } else {
                            None
                        };
                        if ch == quote && prev != Some('\\') {
                            let raw = &self.input[val_start..self.pos];
                            let val = raw.trim();
                            let leading = raw.len() - raw.trim_start().len();
                            let span_start = val_start + leading;
                            let span_end = span_start + val.len();
                            self.advance(1); // consume closing quote
                            return Token::new(
                                TokenKind::AttributeValue(val),
                                span_start,
                                span_end,
                            );
                        }
                        self.advance_char();
                    }
                    let raw = &self.input[val_start..self.pos];
                    let val = raw.trim();
                    let leading = raw.len() - raw.trim_start().len();
                    let span_start = val_start + leading;
                    let span_end = span_start + val.len();
                    return Token::new(TokenKind::AttributeValue(val), span_start, span_end);
                }
            }

            // Unquoted attribute value
            let val_start = self.pos;
            while let Some(c) = self.peek_char() {
                if c.is_whitespace() || c == '>' || c == '/' {
                    break;
                }
                self.advance_char();
            }
            let raw = &self.input[val_start..self.pos];
            let val = raw.trim();
            let leading = raw.len() - raw.trim_start().len();
            let span_start = val_start + leading;
            let span_end = span_start + val.len();
            return Token::new(TokenKind::AttributeValue(val), span_start, span_end);
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
            self.after_equals = true;
            return Token::new(TokenKind::Equals, start, self.pos);
        }

        // Standard attribute name
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

#[derive(Debug, Clone)]
pub struct TokenStream<'a> {
    tokens: Vec<Token<'a>>,
    pos: usize,
}

impl<'a> TokenStream<'a> {
    pub fn new(tokens: Vec<Token<'a>>) -> Self {
        Self { tokens, pos: 0 }
    }

    pub fn from_input(input: &'a str) -> Self {
        let mut lexer = Lexer::new(input);
        Self::new(lexer.tokenize())
    }

    pub fn pos(&self) -> usize {
        self.pos
    }

    pub fn set_pos(&mut self, pos: usize) {
        self.pos = pos;
    }

    pub fn peek(&self) -> Option<&Token<'a>> {
        self.tokens.get(self.pos)
    }

    pub fn peek_kind(&self) -> Option<&TokenKind<'a>> {
        self.tokens.get(self.pos).map(|t| &t.kind)
    }

    pub fn peek_at(&self, offset: usize) -> Option<&Token<'a>> {
        self.tokens.get(self.pos + offset)
    }

    pub fn bump(&mut self) -> Option<Token<'a>> {
        if self.pos < self.tokens.len() {
            let tok = self.tokens[self.pos].clone();
            self.pos += 1;
            Some(tok)
        } else {
            None
        }
    }

    pub fn is_eof(&self) -> bool {
        match self.peek_kind() {
            None | Some(TokenKind::Eof) => true,
            _ => false,
        }
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
        assert_eq!(tokens[1].kind, TokenKind::TagName("button"));
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
        assert_eq!(tokens[1].kind, TokenKind::TagName("app-user"));
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
        assert_eq!(tokens[13].kind, TokenKind::Interpolation("user.name"));
        assert_eq!(tokens[14].kind, TokenKind::TagCloseStart);
        assert_eq!(tokens[15].kind, TokenKind::TagName("app-user"));
        assert_eq!(tokens[16].kind, TokenKind::TagOpenEnd);
        assert_eq!(tokens[17].kind, TokenKind::Eof);
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
        assert_eq!(tokens[1].kind, TokenKind::Expression("isLoggedIn"));
        assert_eq!(tokens[2].kind, TokenKind::OpenBrace);
        assert_eq!(tokens[3].kind, TokenKind::TagOpenStart);
        assert_eq!(tokens[4].kind, TokenKind::TagName("span"));
        assert_eq!(tokens[5].kind, TokenKind::TagOpenEnd);
        assert_eq!(tokens[6].kind, TokenKind::Text("Welcome"));
        assert_eq!(tokens[7].kind, TokenKind::TagCloseStart);
        assert_eq!(tokens[8].kind, TokenKind::TagName("span"));
        assert_eq!(tokens[9].kind, TokenKind::TagOpenEnd);
        assert_eq!(tokens[10].kind, TokenKind::CloseBrace);
        assert_eq!(
            tokens[11].kind,
            TokenKind::ControlFlow(ControlFlowKeyword::Else)
        );
        assert_eq!(tokens[12].kind, TokenKind::OpenBrace);
        assert_eq!(tokens[13].kind, TokenKind::TagOpenStart);
        assert_eq!(tokens[14].kind, TokenKind::TagName("button"));
        assert_eq!(tokens[15].kind, TokenKind::TagOpenEnd);
        assert_eq!(tokens[16].kind, TokenKind::Text("Login"));
        assert_eq!(tokens[17].kind, TokenKind::TagCloseStart);
        assert_eq!(tokens[18].kind, TokenKind::TagName("button"));
        assert_eq!(tokens[19].kind, TokenKind::TagOpenEnd);
        assert_eq!(tokens[20].kind, TokenKind::CloseBrace);
        assert_eq!(tokens[21].kind, TokenKind::Eof);
    }
}
