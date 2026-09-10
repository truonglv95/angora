use crate::ast::SourceSpan;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ControlFlowKeyword {
    If,
    Else,
    ElseIf,
    For,
    Empty,
    Switch,
    Case,
    Default,
    Defer,
    Placeholder,
    Loading,
    Error,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TokenKind<'a> {
    // HTML Tags
    TagOpenStart,     // "<"
    TagOpenEnd,       // ">"
    TagCloseStart,    // "</"
    TagSelfClose,     // "/>"
    TagName(&'a str), // "div", "app-user-card"

    // Attributes & Bindings
    AttributeName(&'a str),   // "class", "id"
    AttributeValue(&'a str),  // "container" (unquoted)
    PropertyBinding(&'a str), // "disabled", "class.active"
    EventBinding(&'a str),    // "click", "select"
    TwoWayBinding(&'a str),   // "value", "ngModel"
    TemplateRef(&'a str),     // "myInput"
    Equals,                   // "="

    // Interpolation: {{ expr }}
    Interpolation(&'a str),

    // Control flow
    ControlFlow(ControlFlowKeyword),

    // Delimiters
    OpenParen,  // "("
    CloseParen, // ")"
    OpenBrace,  // "{"
    CloseBrace, // "}"
    Comma,      // ","
    Semicolon,  // ";"

    // Raw expression inside parentheses: e.g. condition, iterable
    Expression(&'a str),

    // Content
    Text(&'a str),
    Comment(&'a str),

    // EOF
    Eof,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Token<'a> {
    pub kind: TokenKind<'a>,
    pub span: SourceSpan,
}

impl<'a> Token<'a> {
    pub fn new(kind: TokenKind<'a>, start: usize, end: usize) -> Self {
        Self {
            kind,
            span: SourceSpan { start, end },
        }
    }
}
