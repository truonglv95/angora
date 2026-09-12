use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum TemplateNode {
    #[serde(rename = "element")]
    Element(ElementNode),

    #[serde(rename = "text")]
    Text(TextNode),

    #[serde(rename = "interpolation")]
    Interpolation(InterpolationNode),

    #[serde(rename = "ifBlock")]
    IfBlock(IfBlockNode),

    #[serde(rename = "forBlock")]
    ForBlock(ForBlockNode),

    #[serde(rename = "switchBlock")]
    SwitchBlock(SwitchBlockNode),

    #[serde(rename = "deferBlock")]
    DeferBlock(DeferBlockNode),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SourceSpan {
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReferenceNode {
    #[serde(rename = "type", default = "default_reference_type")]
    pub node_type: String,
    pub name: String,
    #[serde(default)]
    pub value: Option<String>,
}

fn default_reference_type() -> String {
    "reference".to_string()
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementNode {
    pub name: String,
    pub attributes: Vec<AttributeNode>,
    pub properties: Vec<PropertyBindingNode>,
    pub events: Vec<EventBindingNode>,
    #[serde(rename = "twoWayBindings")]
    pub two_ways: Vec<TwoWayBindingNode>,
    #[serde(default)]
    pub references: Vec<ReferenceNode>,
    pub children: Vec<TemplateNode>,
    pub span: Option<SourceSpan>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AttributeNode {
    #[serde(rename = "type", default = "default_attribute_type")]
    pub node_type: String,
    pub name: String,
    pub value: String,
}

fn default_attribute_type() -> String {
    "attribute".to_string()
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PropertyBindingNode {
    #[serde(rename = "type", default = "default_property_type")]
    pub node_type: String,
    pub name: String,
    pub expression: String,
    #[serde(default)]
    pub span: Option<SourceSpan>,
}

fn default_property_type() -> String {
    "property".to_string()
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EventBindingNode {
    #[serde(rename = "type", default = "default_event_type")]
    pub node_type: String,
    pub name: String,
    pub handler: String,
    #[serde(default)]
    pub span: Option<SourceSpan>,
}

fn default_event_type() -> String {
    "event".to_string()
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TwoWayBindingNode {
    #[serde(rename = "type", default = "default_twoway_type")]
    pub node_type: String,
    pub name: String,
    pub expression: String,
    #[serde(default)]
    pub span: Option<SourceSpan>,
}

fn default_twoway_type() -> String {
    "twoWay".to_string()
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TextNode {
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct InterpolationNode {
    pub expression: String,
    #[serde(default)]
    pub span: Option<SourceSpan>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IfBranch {
    pub condition: Option<String>, // None for @else
    pub children: Vec<TemplateNode>,
    #[serde(default)]
    pub span: Option<SourceSpan>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct IfBlockNode {
    pub branches: Vec<IfBranch>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForBlockNode {
    #[serde(rename = "itemName")]
    pub item_name: String,
    pub iterable: String,
    #[serde(rename = "trackBy")]
    pub track_by: String,
    pub children: Vec<TemplateNode>,
    #[serde(rename = "emptyChildren")]
    pub empty_block: Option<Vec<TemplateNode>>,
    #[serde(default)]
    pub span: Option<SourceSpan>,
    #[serde(default)]
    pub iterable_span: Option<SourceSpan>,
    #[serde(default)]
    pub track_span: Option<SourceSpan>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwitchCase {
    #[serde(rename = "caseValue")]
    pub case_value: Option<String>, // None for @default
    pub children: Vec<TemplateNode>,
    #[serde(default)]
    pub span: Option<SourceSpan>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SwitchBlockNode {
    pub expression: String,
    pub cases: Vec<SwitchCase>,
    #[serde(default)]
    pub span: Option<SourceSpan>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeferTrigger {
    pub trigger_type: String,
    pub param: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaceholderBlock {
    pub children: Vec<TemplateNode>,
    pub minimum: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadingBlock {
    pub children: Vec<TemplateNode>,
    pub after: Option<usize>,
    pub minimum: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorBlock {
    pub children: Vec<TemplateNode>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeferBlockNode {
    pub triggers: Vec<DeferTrigger>,
    #[serde(rename = "mainBlock")]
    pub main_block: Vec<TemplateNode>,
    #[serde(rename = "placeholderBlock")]
    pub placeholder_block: Option<PlaceholderBlock>,
    #[serde(rename = "loadingBlock")]
    pub loading_block: Option<LoadingBlock>,
    #[serde(rename = "errorBlock")]
    pub error_block: Option<ErrorBlock>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DiagnosticSeverity {
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateDiagnostic {
    pub code: String,
    pub message: String,
    pub severity: DiagnosticSeverity,
    pub span: SourceSpan,
    pub line: usize,
    pub column: usize,
}

impl TemplateDiagnostic {
    pub fn error(
        code: impl Into<String>,
        message: impl Into<String>,
        span: SourceSpan,
        line: usize,
        column: usize,
    ) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            severity: DiagnosticSeverity::Error,
            span,
            line,
            column,
        }
    }

    pub fn warning(
        code: impl Into<String>,
        message: impl Into<String>,
        span: SourceSpan,
        line: usize,
        column: usize,
    ) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            severity: DiagnosticSeverity::Warning,
            span,
            line,
            column,
        }
    }

    /// Renders a human-friendly visual code snippet with line numbers and caret pointer,
    /// similar to rustc / oxc compiler errors.
    pub fn render_snippet(&self, source: &str, file_name: Option<&str>) -> String {
        let file = file_name.unwrap_or("template");
        let sev_str = match self.severity {
            DiagnosticSeverity::Error => "error",
            DiagnosticSeverity::Warning => "warning",
            DiagnosticSeverity::Info => "info",
        };
        let mut out = format!(
            "{}[{}]: {}\n  --> {}:{}:{}\n",
            sev_str, self.code, self.message, file, self.line, self.column
        );

        let lines: Vec<&str> = source.lines().collect();
        if self.line > 0 && self.line <= lines.len() {
            let line_idx = self.line - 1;
            let line_str = lines[line_idx];
            let line_num_str = self.line.to_string();
            let pad = " ".repeat(line_num_str.len());
            out.push_str(&format!("{} |\n", pad));
            out.push_str(&format!("{} | {}\n", line_num_str, line_str));
            let col_indent = " ".repeat(self.column.saturating_sub(1));
            let span_len = (self.span.end.saturating_sub(self.span.start)).max(1);
            let carets = "^".repeat(
                span_len
                    .min(line_str.len().saturating_sub(self.column.saturating_sub(1)))
                    .max(1),
            );
            out.push_str(&format!("{} | {}{}\n", pad, col_indent, carets));
        }
        out
    }
}

/// Calculate 1-indexed (line, column) from byte offset in source string.
pub fn calculate_line_column(source: &str, offset: usize) -> (usize, usize) {
    let mut line = 1;
    let mut col = 1;
    for (i, ch) in source.char_indices() {
        if i >= offset {
            break;
        }
        if ch == '\n' {
            line += 1;
            col = 1;
        } else {
            col += 1;
        }
    }
    (line, col)
}
