use crate::tcb::{generate_tcb_from_source_with_imports, TcbResult};
use oxc_allocator::Allocator;
use oxc_ast::ast::*;
use oxc_parser::Parser;
use oxc_span::{GetSpan, SourceType};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspPosition {
    pub line: u32,
    pub character: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspRange {
    pub start: LspPosition,
    pub end: LspPosition,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspImportInfo {
    pub name: String,
    pub module_path: String,
    pub range: LspRange,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspPropertyInfo {
    pub name: String,
    pub raw_type: String,
    pub unwrapped_type: String,
    pub is_signal: bool,
    pub is_computed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_input: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_output: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_required: Option<bool>,
    pub is_method: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub docstring: Option<String>,
    pub range: LspRange,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspParamInfo {
    pub name: String,
    pub r#type: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspMethodInfo {
    pub name: String,
    pub signature: String,
    pub params: Vec<LspParamInfo>,
    pub return_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub docstring: Option<String>,
    pub range: LspRange,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspTemplateInfo {
    pub content: String,
    pub offset: u32,
    pub range: LspRange,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tcb: Option<TcbResult>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspComponentAnalysis {
    pub class_name: String,
    pub class_range: LspRange,
    pub class_doc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selector: Option<String>,
    pub imports: Vec<LspImportInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub component_imports: Option<Vec<String>>,
    pub properties: Vec<LspPropertyInfo>,
    pub methods: Vec<LspMethodInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template: Option<LspTemplateInfo>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspTypeMemberInfo {
    pub name: String,
    pub r#type: String,
    pub raw_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unwrapped_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_signal: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_method: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub docstring: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub range: Option<LspRange>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspTypeDefInfo {
    pub name: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub super_class: Option<String>,
    pub properties: Vec<LspTypeMemberInfo>,
    pub methods: Vec<LspTypeMemberInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub range: Option<LspRange>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspAnalysisResult {
    pub components: Vec<LspComponentAnalysis>,
    pub type_defs: Vec<LspTypeDefInfo>,
}

pub struct LineIndex<'a> {
    text: &'a str,
    line_starts: Vec<usize>,
}

impl<'a> LineIndex<'a> {
    pub fn new(text: &'a str) -> Self {
        let mut line_starts = vec![0];
        for (i, byte) in text.bytes().enumerate() {
            if byte == b'\n' {
                line_starts.push(i + 1);
            }
        }
        Self { text, line_starts }
    }

    pub fn position_at(&self, byte_offset: usize) -> LspPosition {
        let offset = byte_offset.min(self.text.len());
        let line = match self.line_starts.binary_search(&offset) {
            Ok(line) => line,
            Err(line) => line.saturating_sub(1),
        };
        let line_start = self.line_starts[line];
        let line_slice = &self.text[line_start..offset];
        let character = line_slice.encode_utf16().count();
        LspPosition {
            line: line as u32,
            character: character as u32,
        }
    }

    pub fn range_at(&self, start: usize, end: usize) -> LspRange {
        LspRange {
            start: self.position_at(start),
            end: self.position_at(end),
        }
    }

    pub fn utf16_offset_at(&self, byte_offset: usize) -> u32 {
        let offset = byte_offset.min(self.text.len());
        self.text[..offset].encode_utf16().count() as u32
    }
}

pub fn extract_jsdoc(source: &str, target_offset: usize) -> Option<String> {
    let slice_before = source.get(..target_offset)?.trim_end();
    let last_comment_end = slice_before.rfind("*/")?;
    let trailing_code = slice_before.get(last_comment_end + 2..)?.trim();
    if !trailing_code.is_empty() {
        return None;
    }
    let comment_start = slice_before.rfind("/**")?;
    let raw = slice_before.get(comment_start + 3..last_comment_end)?;
    let cleaned: Vec<String> = raw
        .lines()
        .map(|line| {
            let t = line.trim();
            if let Some(stripped) = t.strip_prefix('*') {
                stripped.trim().to_string()
            } else {
                t.to_string()
            }
        })
        .filter(|l| !l.is_empty())
        .collect();

    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned.join("\n"))
    }
}

pub fn analyze_components_lsp(source: &str, file_uri: Option<String>) -> LspAnalysisResult {
    analyze_components_lsp_depth(source, file_uri, 0)
}

pub fn analyze_single_file_lsp(source: &str, file_uri: Option<String>) -> LspAnalysisResult {
    analyze_components_lsp_depth(source, file_uri, 3)
}

fn analyze_components_lsp_depth(
    source: &str,
    file_uri: Option<String>,
    depth: usize,
) -> LspAnalysisResult {
    let sanitized_source: std::borrow::Cow<str> = if source.contains("${{") {
        let mut result = String::with_capacity(source.len() + 16);
        let mut chars = source.chars().peekable();
        let mut prev = '\0';
        while let Some(ch) = chars.next() {
            if ch == '$' && prev != '\\' {
                let rest: String = chars.clone().take(2).collect();
                if rest == "{{" {
                    result.push('\\');
                }
            }
            result.push(ch);
            prev = ch;
        }
        std::borrow::Cow::Owned(result)
    } else {
        std::borrow::Cow::Borrowed(source)
    };

    let src = sanitized_source.as_ref();
    let line_index = LineIndex::new(src);
    let allocator = Allocator::default();
    let source_type = SourceType::ts();
    let parser_ret = Parser::new(&allocator, src, source_type).parse();

    // 1. Extract all import declarations
    let mut file_imports = Vec::new();
    for stmt in &parser_ret.program.body {
        match stmt {
            Statement::ImportDeclaration(import_decl) => {
                let module_path = import_decl.source.value.to_string();
                if let Some(specifiers) = &import_decl.specifiers {
                    for spec in specifiers {
                        match spec {
                            ImportDeclarationSpecifier::ImportSpecifier(s) => {
                                let name = s.local.name.to_string();
                                let span = s.span();
                                file_imports.push(LspImportInfo {
                                    name,
                                    module_path: module_path.clone(),
                                    range: line_index
                                        .range_at(span.start as usize, span.end as usize),
                                });
                            }
                            ImportDeclarationSpecifier::ImportDefaultSpecifier(s) => {
                                let name = s.local.name.to_string();
                                let span = s.span();
                                file_imports.push(LspImportInfo {
                                    name,
                                    module_path: module_path.clone(),
                                    range: line_index
                                        .range_at(span.start as usize, span.end as usize),
                                });
                            }
                            ImportDeclarationSpecifier::ImportNamespaceSpecifier(s) => {
                                let name = s.local.name.to_string();
                                let span = s.span();
                                file_imports.push(LspImportInfo {
                                    name,
                                    module_path: module_path.clone(),
                                    range: line_index
                                        .range_at(span.start as usize, span.end as usize),
                                });
                            }
                        }
                    }
                } else {
                    file_imports.push(LspImportInfo {
                        name: "*".to_string(),
                        module_path,
                        range: line_index.range_at(0, 0),
                    });
                }
            }
            Statement::ExportAllDeclaration(export_all) => {
                let module_path = export_all.source.value.to_string();
                file_imports.push(LspImportInfo {
                    name: "*".to_string(),
                    module_path,
                    range: line_index.range_at(0, 0),
                });
            }
            Statement::ExportFromDeclaration(export_from) => {
                let module_path = export_from.source.value.to_string();
                file_imports.push(LspImportInfo {
                    name: "*".to_string(),
                    module_path,
                    range: line_index.range_at(0, 0),
                });
            }
            _ => {}
        }
    }

    // 2. Discover all Classes, Interfaces, Type Aliases, Functions
    let mut components = Vec::new();
    let mut all_classes = Vec::new();
    let mut all_interfaces = Vec::new();
    let mut all_types = Vec::new();
    let mut all_functions = Vec::new();

    for stmt in &parser_ret.program.body {
        match stmt {
            Statement::ClassDeclaration(cls) => {
                all_classes.push(cls.as_ref());
            }
            Statement::TSInterfaceDeclaration(iface) => {
                all_interfaces.push(iface.as_ref());
            }
            Statement::TSTypeAliasDeclaration(alias) => {
                all_types.push(alias.as_ref());
            }
            Statement::FunctionDeclaration(func) => {
                all_functions.push(func.as_ref());
            }
            Statement::ExportDeclaration(exp) => match &exp.declaration {
                Declaration::ClassDeclaration(cls) => {
                    all_classes.push(cls.as_ref());
                }
                Declaration::TSInterfaceDeclaration(iface) => {
                    all_interfaces.push(iface.as_ref());
                }
                Declaration::TSTypeAliasDeclaration(alias) => {
                    all_types.push(alias.as_ref());
                }
                Declaration::FunctionDeclaration(func) => {
                    all_functions.push(func.as_ref());
                }
                _ => {}
            },
            Statement::ExportDefaultDeclaration(exp) => match &exp.declaration {
                ExportDefaultDeclarationKind::ClassDeclaration(cls) => {
                    all_classes.push(cls.as_ref());
                }
                ExportDefaultDeclarationKind::FunctionDeclaration(func) => {
                    all_functions.push(func.as_ref());
                }
                _ => {}
            },
            _ => {}
        }
    }

    let mut type_defs = Vec::new();

    for class in &all_classes {
        let class_name = class
            .id
            .as_ref()
            .map(|id| id.name.to_string())
            .unwrap_or_else(|| "AnonymousClass".to_string());

        let class_span = class.span();
        let class_range = line_index.range_at(class_span.start as usize, class_span.end as usize);
        let class_doc = extract_jsdoc(src, class_span.start as usize).unwrap_or_default();

        let mut selector: Option<String> = None;
        let mut component_imports: Option<Vec<String>> = None;
        let mut template: Option<LspTemplateInfo> = None;
        let mut is_component = false;
        let mut is_pipe = false;
        let mut pipe_name: Option<String> = None;

        for decorator in &class.decorators {
            if let Expression::CallExpression(call) = &decorator.expression {
                let decorator_name = match &call.callee {
                    Expression::Identifier(ident) => ident.name.as_str(),
                    _ => "",
                };

                if decorator_name == "Pipe" {
                    is_pipe = true;
                    if let Some(arg) = call.arguments.first() {
                        if let Some(Expression::ObjectExpression(obj)) = arg.as_expression() {
                            for prop in &obj.properties {
                                if let ObjectPropertyKind::ObjectProperty(p) = prop {
                                    let key_name = match &p.key {
                                        PropertyKey::StaticIdentifier(ident) => {
                                            Some(ident.name.as_str())
                                        }
                                        PropertyKey::Identifier(ident) => Some(ident.name.as_str()),
                                        PropertyKey::StringLiteral(lit) => Some(lit.value.as_str()),
                                        _ => None,
                                    };
                                    if key_name == Some("name") {
                                        if let Expression::StringLiteral(lit) = &p.value {
                                            pipe_name = Some(lit.value.to_string());
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                if decorator_name == "Component" {
                    is_component = true;
                    let mut raw_template_info: Option<(String, u32, LspRange)> = None;
                    if let Some(arg) = call.arguments.first() {
                        if let Some(Expression::ObjectExpression(obj)) = arg.as_expression() {
                            for prop in &obj.properties {
                                if let ObjectPropertyKind::ObjectProperty(p) = prop {
                                    let key_name = match &p.key {
                                        PropertyKey::StaticIdentifier(ident) => {
                                            Some(ident.name.as_str())
                                        }
                                        PropertyKey::Identifier(ident) => Some(ident.name.as_str()),
                                        PropertyKey::StringLiteral(lit) => Some(lit.value.as_str()),
                                        _ => None,
                                    };

                                    match key_name {
                                        Some("selector") => match &p.value {
                                            Expression::StringLiteral(lit) => {
                                                selector = Some(lit.value.to_string());
                                            }
                                            Expression::TemplateLiteral(lit) => {
                                                let s: String = lit
                                                    .quasis
                                                    .iter()
                                                    .map(|q| q.value.raw.as_str())
                                                    .collect();
                                                selector = Some(s);
                                            }
                                            _ => {}
                                        },
                                        Some("imports") => {
                                            if let Expression::ArrayExpression(arr) = &p.value {
                                                let mut imps = Vec::new();
                                                for elem in &arr.elements {
                                                    if let Some(expr) = elem.as_expression() {
                                                        if let Expression::Identifier(ident) = expr
                                                        {
                                                            imps.push(ident.name.to_string());
                                                        }
                                                    }
                                                }
                                                component_imports = Some(imps);
                                            }
                                        }
                                        Some("template") => {
                                            let (content, tmpl_span) = match &p.value {
                                                Expression::StringLiteral(lit) => {
                                                    (lit.value.to_string(), lit.span)
                                                }
                                                Expression::TemplateLiteral(lit) => {
                                                    let s: String = lit
                                                        .quasis
                                                        .iter()
                                                        .map(|q| q.value.raw.as_str())
                                                        .collect();
                                                    (s, lit.span)
                                                }
                                                _ => (String::new(), p.value.span()),
                                            };

                                            let byte_offset = (tmpl_span.start + 1) as usize; // skip quote/backtick
                                            let utf16_offset =
                                                line_index.utf16_offset_at(byte_offset);
                                            let tmpl_range = line_index
                                                .range_at(byte_offset, byte_offset + content.len());

                                            raw_template_info =
                                                Some((content, utf16_offset, tmpl_range));
                                        }
                                        _ => {}
                                    }
                                }
                            }
                        }
                    }

                    if let Some((content, utf16_offset, tmpl_range)) = raw_template_info {
                        let tcb_res = generate_tcb_from_source_with_imports(
                            &content,
                            &class_name,
                            utf16_offset,
                            component_imports.as_deref().unwrap_or(&[]),
                        );

                        template = Some(LspTemplateInfo {
                            content,
                            offset: utf16_offset,
                            range: tmpl_range,
                            tcb: Some(tcb_res),
                        });
                    }
                }
            }
        }

        // Parse class properties and methods using OXC AST
        let mut properties = Vec::new();
        let mut methods = Vec::new();

        for element in &class.body.body {
            match element {
                ClassElement::PropertyDefinition(prop) => {
                    let name = match &prop.key {
                        PropertyKey::StaticIdentifier(ident) => ident.name.to_string(),
                        PropertyKey::Identifier(ident) => ident.name.to_string(),
                        PropertyKey::StringLiteral(lit) => lit.value.to_string(),
                        _ => continue,
                    };

                    let key_span = prop.key.span();
                    let prop_range =
                        line_index.range_at(key_span.start as usize, key_span.end as usize);
                    let docstring = extract_jsdoc(source, prop.span.start as usize);

                    let mut is_signal = false;
                    let mut is_computed = false;
                    let mut is_input = false;
                    let mut is_output = false;
                    let mut is_required = false;

                    // Inspect decorators: @Input(), @Output()
                    for dec in &prop.decorators {
                        if let Expression::CallExpression(c) = &dec.expression {
                            if let Expression::Identifier(ident) = &c.callee {
                                if ident.name == "Input" {
                                    is_input = true;
                                } else if ident.name == "Output" {
                                    is_output = true;
                                }
                            }
                        } else if let Expression::Identifier(ident) = &dec.expression {
                            if ident.name == "Input" {
                                is_input = true;
                            } else if ident.name == "Output" {
                                is_output = true;
                            }
                        }
                    }

                    // Inspect value: signal(), computed(), input(), output(), inject()
                    let mut inferred_type = "any".to_string();
                    if let Some(val) = &prop.value {
                        match val {
                            Expression::CallExpression(call) => {
                                let fn_name = match &call.callee {
                                    Expression::Identifier(ident) => ident.name.as_str(),
                                    Expression::StaticMemberExpression(mem) => {
                                        if mem.property.name == "required" {
                                            is_required = true;
                                            match &mem.object {
                                                Expression::Identifier(id) => id.name.as_str(),
                                                _ => "",
                                            }
                                        } else {
                                            ""
                                        }
                                    }
                                    _ => "",
                                };

                                match fn_name {
                                    "signal" => {
                                        is_signal = true;
                                        if let Some(type_args) = &call.type_arguments {
                                            let span = type_args.span;
                                            let raw =
                                                src[span.start as usize..span.end as usize].trim();
                                            inferred_type = raw
                                                .strip_prefix('<')
                                                .and_then(|s| s.strip_suffix('>'))
                                                .unwrap_or("any")
                                                .trim()
                                                .to_string();
                                        } else if let Some(arg) = call.arguments.first() {
                                            inferred_type =
                                                infer_expression_type_str(arg.as_expression());
                                        }
                                    }
                                    "computed" => {
                                        is_signal = true;
                                        is_computed = true;
                                        if let Some(type_args) = &call.type_arguments {
                                            let span = type_args.span;
                                            let raw =
                                                src[span.start as usize..span.end as usize].trim();
                                            inferred_type = raw
                                                .strip_prefix('<')
                                                .and_then(|s| s.strip_suffix('>'))
                                                .unwrap_or("any")
                                                .trim()
                                                .to_string();
                                        } else if let Some(arg) = call.arguments.first() {
                                            inferred_type =
                                                infer_return_type_from_fn(arg.as_expression(), src);
                                        }
                                    }
                                    "input" => {
                                        is_signal = true;
                                        is_input = true;
                                        if let Some(type_args) = &call.type_arguments {
                                            let span = type_args.span;
                                            let raw =
                                                src[span.start as usize..span.end as usize].trim();
                                            inferred_type = raw
                                                .strip_prefix('<')
                                                .and_then(|s| s.strip_suffix('>'))
                                                .unwrap_or("any")
                                                .trim()
                                                .to_string();
                                        } else if let Some(arg) = call.arguments.first() {
                                            inferred_type =
                                                infer_expression_type_str(arg.as_expression());
                                        }
                                    }
                                    "output" => {
                                        is_output = true;
                                        if let Some(type_args) = &call.type_arguments {
                                            let span = type_args.span;
                                            let raw =
                                                src[span.start as usize..span.end as usize].trim();
                                            inferred_type = raw
                                                .strip_prefix('<')
                                                .and_then(|s| s.strip_suffix('>'))
                                                .unwrap_or("void")
                                                .trim()
                                                .to_string();
                                        } else {
                                            inferred_type = "void".to_string();
                                        }
                                    }
                                    "model" => {
                                        is_signal = true;
                                        is_input = true;
                                        is_output = true;
                                        if let Some(type_args) = &call.type_arguments {
                                            let span = type_args.span;
                                            let raw =
                                                src[span.start as usize..span.end as usize].trim();
                                            inferred_type = raw
                                                .strip_prefix('<')
                                                .and_then(|s| s.strip_suffix('>'))
                                                .unwrap_or("any")
                                                .trim()
                                                .to_string();
                                        } else if let Some(arg) = call.arguments.first() {
                                            inferred_type =
                                                infer_expression_type_str(arg.as_expression());
                                        }
                                    }
                                    "toSignal" => {
                                        is_signal = true;
                                        if let Some(type_args) = &call.type_arguments {
                                            let span = type_args.span;
                                            let raw =
                                                src[span.start as usize..span.end as usize].trim();
                                            inferred_type = raw
                                                .strip_prefix('<')
                                                .and_then(|s| s.strip_suffix('>'))
                                                .unwrap_or("any")
                                                .trim()
                                                .to_string();
                                        } else if let Some(arg) = call.arguments.get(1) {
                                            if let Some(Expression::ObjectExpression(obj)) =
                                                arg.as_expression()
                                            {
                                                for p in &obj.properties {
                                                    if let ObjectPropertyKind::ObjectProperty(
                                                        prop,
                                                    ) = p
                                                    {
                                                        if let PropertyKey::StaticIdentifier(k) =
                                                            &prop.key
                                                        {
                                                            if k.name == "initialValue" {
                                                                inferred_type =
                                                                    infer_expression_type_str(
                                                                        Some(&prop.value),
                                                                    );
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    "linkedSignal" => {
                                        is_signal = true;
                                        if let Some(type_args) = &call.type_arguments {
                                            let span = type_args.span;
                                            let raw =
                                                src[span.start as usize..span.end as usize].trim();
                                            inferred_type = raw
                                                .strip_prefix('<')
                                                .and_then(|s| s.strip_suffix('>'))
                                                .unwrap_or("any")
                                                .trim()
                                                .to_string();
                                        }
                                    }
                                    "toWritableSignal" => {
                                        is_signal = true;
                                        if let Some(type_args) = &call.type_arguments {
                                            let span = type_args.span;
                                            let raw =
                                                src[span.start as usize..span.end as usize].trim();
                                            inferred_type = raw
                                                .strip_prefix('<')
                                                .and_then(|s| s.strip_suffix('>'))
                                                .unwrap_or("any")
                                                .trim()
                                                .to_string();
                                        }
                                    }
                                    "inject" => {
                                        if let Some(type_args) = &call.type_arguments {
                                            let span = type_args.span;
                                            let raw =
                                                src[span.start as usize..span.end as usize].trim();
                                            inferred_type = raw
                                                .strip_prefix('<')
                                                .and_then(|s| s.strip_suffix('>'))
                                                .unwrap_or("any")
                                                .trim()
                                                .to_string();
                                        } else if let Some(arg) = call.arguments.first() {
                                            if let Some(Expression::Identifier(ident)) =
                                                arg.as_expression()
                                            {
                                                inferred_type = ident.name.to_string();
                                            }
                                        }
                                    }
                                    _ => {}
                                }
                            }
                            Expression::NewExpression(new_expr) => {
                                let callee_name = match &new_expr.callee {
                                    Expression::Identifier(ident) => ident.name.as_str(),
                                    Expression::StaticMemberExpression(mem) => {
                                        mem.property.name.as_str()
                                    }
                                    _ => "",
                                };
                                if !callee_name.is_empty() {
                                    if callee_name == "FormGroup" {
                                        let mut controls_props = Vec::new();
                                        if let Some(arg) = new_expr.arguments.first() {
                                            if let Some(Expression::ObjectExpression(obj)) =
                                                arg.as_expression()
                                            {
                                                for p in &obj.properties {
                                                    if let ObjectPropertyKind::ObjectProperty(
                                                        prop_entry,
                                                    ) = p
                                                    {
                                                        let key_name = match &prop_entry.key {
                                                            PropertyKey::StaticIdentifier(id) => {
                                                                Some(id.name.to_string())
                                                            }
                                                            PropertyKey::Identifier(id) => {
                                                                Some(id.name.to_string())
                                                            }
                                                            PropertyKey::StringLiteral(lit) => {
                                                                Some(lit.value.to_string())
                                                            }
                                                            _ => None,
                                                        };
                                                        if let Some(k) = key_name {
                                                            let c_type = infer_expression_type_str(
                                                                Some(&prop_entry.value),
                                                            );
                                                            let k_span = prop_entry.key.span();
                                                            let range = Some(line_index.range_at(
                                                                k_span.start as usize,
                                                                k_span.end as usize,
                                                            ));
                                                            let type_str = if c_type != "any" {
                                                                format!("FormControl<{}>", c_type)
                                                            } else {
                                                                "FormControl".to_string()
                                                            };
                                                            controls_props.push(
                                                                LspTypeMemberInfo {
                                                                    name: k,
                                                                    r#type: type_str.clone(),
                                                                    raw_type: type_str,
                                                                    unwrapped_type: Some(c_type),
                                                                    is_signal: Some(false),
                                                                    is_method: Some(false),
                                                                    signature: None,
                                                                    docstring: None,
                                                                    range,
                                                                    uri: file_uri.clone(),
                                                                },
                                                            );
                                                        }
                                                    }
                                                }
                                            }
                                        }

                                        let controls_type_name = format!("{}.controls", name);
                                        type_defs.push(LspTypeDefInfo {
                                            name: controls_type_name.clone(),
                                            kind: "interface".to_string(),
                                            raw_type: None,
                                            super_class: None,
                                            properties: controls_props,
                                            methods: Vec::new(),
                                            range: Some(prop_range.clone()),
                                            uri: file_uri.clone(),
                                        });

                                        let form_group_type_name = format!("{}_FormGroup", name);
                                        type_defs.push(LspTypeDefInfo {
                                            name: form_group_type_name.clone(),
                                            kind: "class".to_string(),
                                            raw_type: None,
                                            super_class: Some("FormGroup".to_string()),
                                            properties: vec![LspTypeMemberInfo {
                                                name: "controls".to_string(),
                                                r#type: controls_type_name.clone(),
                                                raw_type: controls_type_name.clone(),
                                                unwrapped_type: Some(controls_type_name.clone()),
                                                is_signal: Some(false),
                                                is_method: Some(false),
                                                signature: None,
                                                docstring: None,
                                                range: Some(prop_range.clone()),
                                                uri: file_uri.clone(),
                                            }],
                                            methods: Vec::new(),
                                            range: Some(prop_range.clone()),
                                            uri: file_uri.clone(),
                                        });

                                        inferred_type = "FormGroup".to_string();
                                    } else if let Some(type_args) = &new_expr.type_arguments {
                                        let span = type_args.span;
                                        let raw =
                                            src[span.start as usize..span.end as usize].trim();
                                        let inner_t = raw
                                            .strip_prefix('<')
                                            .and_then(|s| s.strip_suffix('>'))
                                            .unwrap_or("any")
                                            .trim();
                                        inferred_type = format!("{}<{}>", callee_name, inner_t);
                                    } else if let Some(arg) = new_expr.arguments.first() {
                                        let arg_type =
                                            infer_expression_type_str(arg.as_expression());
                                        if arg_type != "any"
                                            && (callee_name.ends_with("Control")
                                                || callee_name.ends_with("Signal")
                                                || callee_name.ends_with("Subject"))
                                        {
                                            inferred_type =
                                                format!("{}<{}>", callee_name, arg_type);
                                        } else {
                                            inferred_type = callee_name.to_string();
                                        }
                                    } else {
                                        inferred_type = callee_name.to_string();
                                    }
                                }
                            }
                            Expression::StringLiteral(_) => inferred_type = "string".to_string(),
                            Expression::BooleanLiteral(_) => inferred_type = "boolean".to_string(),
                            Expression::NumericLiteral(_) => inferred_type = "number".to_string(),
                            Expression::ArrayExpression(_) => inferred_type = "any[]".to_string(),
                            Expression::ObjectExpression(_) => inferred_type = "object".to_string(),
                            _ => {}
                        }
                    }

                    let (raw_type, annot_is_signal) = if let Some(annot) = &prop.type_annotation {
                        let span = annot.type_annotation.span();
                        let t = src[span.start as usize..span.end as usize]
                            .trim()
                            .to_string();
                        let is_sig = t.starts_with("Signal<")
                            || t.starts_with("WritableSignal<")
                            || t.starts_with("InputSignal<")
                            || t.starts_with("ModelSignal<");
                        let final_t = if inferred_type.ends_with("_FormGroup")
                            && (t == "FormGroup" || t == "FormGroup<any>")
                        {
                            inferred_type.clone()
                        } else {
                            t
                        };
                        (final_t, is_sig)
                    } else if is_input && is_output {
                        (format!("ModelSignal<{}>", inferred_type), true)
                    } else if is_input {
                        (format!("InputSignal<{}>", inferred_type), true)
                    } else if is_output {
                        (format!("OutputEmitter<{}>", inferred_type), false)
                    } else if is_signal {
                        if is_computed {
                            (format!("Signal<{}>", inferred_type), true)
                        } else {
                            (format!("WritableSignal<{}>", inferred_type), true)
                        }
                    } else {
                        (inferred_type.clone(), false)
                    };
                    is_signal = is_signal || annot_is_signal;

                    let unwrapped_type = if is_signal {
                        if raw_type.starts_with("Signal<")
                            || raw_type.starts_with("WritableSignal<")
                            || raw_type.starts_with("InputSignal<")
                            || raw_type.starts_with("ModelSignal<")
                        {
                            raw_type
                                .split_once('<')
                                .and_then(|(_, r)| r.strip_suffix('>'))
                                .unwrap_or(&inferred_type)
                                .to_string()
                        } else {
                            inferred_type
                        }
                    } else {
                        raw_type.clone()
                    };

                    properties.push(LspPropertyInfo {
                        name,
                        raw_type,
                        unwrapped_type,
                        is_signal,
                        is_computed,
                        is_input: if is_input { Some(true) } else { None },
                        is_output: if is_output { Some(true) } else { None },
                        is_required: if is_required { Some(true) } else { None },
                        is_method: false,
                        docstring,
                        range: prop_range,
                    });
                }
                ClassElement::MethodDefinition(method) => {
                    let name = match &method.key {
                        PropertyKey::StaticIdentifier(ident) => ident.name.to_string(),
                        PropertyKey::Identifier(ident) => ident.name.to_string(),
                        PropertyKey::StringLiteral(lit) => lit.value.to_string(),
                        _ => continue,
                    };

                    let key_span = method.key.span();
                    let method_range =
                        line_index.range_at(key_span.start as usize, key_span.end as usize);
                    let docstring = extract_jsdoc(src, method.span.start as usize);

                    // If constructor: check for parameter properties
                    if method.kind == MethodDefinitionKind::Constructor {
                        for param in &method.value.params.items {
                            let p_span = param.span();
                            let param_text = &src[p_span.start as usize..p_span.end as usize];

                            // Check if parameter has public/private/protected/readonly
                            if param_text.contains("public")
                                || param_text.contains("private")
                                || param_text.contains("protected")
                                || param_text.contains("readonly")
                            {
                                // Extract parameter name and type from param span
                                let parts: Vec<&str> = param_text.split(':').collect();
                                let name_part = parts[0]
                                    .replace("public", "")
                                    .replace("private", "")
                                    .replace("protected", "")
                                    .replace("readonly", "")
                                    .trim()
                                    .to_string();
                                let type_part = if parts.len() > 1 {
                                    parts[1]
                                        .split('=')
                                        .next()
                                        .unwrap_or("any")
                                        .trim()
                                        .to_string()
                                } else {
                                    "any".to_string()
                                };

                                properties.push(LspPropertyInfo {
                                    name: name_part,
                                    raw_type: type_part.clone(),
                                    unwrapped_type: type_part,
                                    is_signal: false,
                                    is_computed: false,
                                    is_input: None,
                                    is_output: None,
                                    is_required: None,
                                    is_method: false,
                                    docstring: None,
                                    range: line_index
                                        .range_at(p_span.start as usize, p_span.end as usize),
                                });
                            }
                        }
                    } else if method.kind == MethodDefinitionKind::Get {
                        let ret_type = if let Some(annot) = &method.value.return_type {
                            let span = annot.type_annotation.span();
                            src[span.start as usize..span.end as usize]
                                .trim()
                                .to_string()
                        } else {
                            "any".to_string()
                        };
                        properties.push(LspPropertyInfo {
                            name,
                            raw_type: ret_type.clone(),
                            unwrapped_type: ret_type,
                            is_signal: false,
                            is_computed: false,
                            is_input: None,
                            is_output: None,
                            is_required: None,
                            is_method: false,
                            docstring,
                            range: method_range,
                        });
                    } else if method.kind == MethodDefinitionKind::Method {
                        let mut params = Vec::new();
                        for param in &method.value.params.items {
                            let p_span = param.span();
                            let param_text = &src[p_span.start as usize..p_span.end as usize];
                            let parts: Vec<&str> = param_text.split(':').collect();
                            let p_name = parts[0].trim().to_string();
                            let p_type = if parts.len() > 1 {
                                parts[1]
                                    .split('=')
                                    .next()
                                    .unwrap_or("any")
                                    .trim()
                                    .to_string()
                            } else {
                                "any".to_string()
                            };

                            params.push(LspParamInfo {
                                name: p_name,
                                r#type: p_type,
                            });
                        }

                        let return_type = if let Some(annot) = &method.value.return_type {
                            let span = annot.type_annotation.span();
                            src[span.start as usize..span.end as usize]
                                .trim()
                                .to_string()
                        } else {
                            "void".to_string()
                        };

                        let param_str = params
                            .iter()
                            .map(|p| format!("{}: {}", p.name, p.r#type))
                            .collect::<Vec<_>>()
                            .join(", ");
                        let signature = format!("({}): {}", param_str, return_type);

                        methods.push(LspMethodInfo {
                            name,
                            signature,
                            params,
                            return_type,
                            docstring,
                            range: method_range,
                        });
                    }
                }
                _ => {}
            }
        }

        if is_component || all_classes.len() == 1 {
            components.push(LspComponentAnalysis {
                class_name: class_name.clone(),
                class_range: class_range.clone(),
                class_doc,
                file_uri: file_uri.clone(),
                selector: selector.clone(),
                imports: file_imports.clone(),
                component_imports,
                properties: properties.clone(),
                methods: methods.clone(),
                template,
            });
        }

        // Also add every class definition to type_defs
        let mut td_props = Vec::new();
        for p in &properties {
            td_props.push(LspTypeMemberInfo {
                name: p.name.clone(),
                r#type: p.raw_type.clone(),
                raw_type: p.raw_type.clone(),
                unwrapped_type: Some(p.unwrapped_type.clone()),
                is_signal: Some(p.is_signal),
                is_method: Some(false),
                signature: None,
                docstring: p.docstring.clone(),
                range: Some(p.range.clone()),
                uri: file_uri.clone(),
            });
        }
        let mut td_methods = Vec::new();
        for m in &methods {
            td_methods.push(LspTypeMemberInfo {
                name: m.name.clone(),
                r#type: m.return_type.clone(),
                raw_type: m.return_type.clone(),
                unwrapped_type: None,
                is_signal: Some(false),
                is_method: Some(true),
                signature: Some(m.signature.clone()),
                docstring: m.docstring.clone(),
                range: Some(m.range.clone()),
                uri: file_uri.clone(),
            });
        }
        let class_kind = if is_component {
            "component".to_string()
        } else if is_pipe {
            "pipe".to_string()
        } else {
            "class".to_string()
        };
        let super_class = class.heritage.as_ref().map(|h| {
            let s = h.expression.span();
            let mut name = src[s.start as usize..s.end as usize].trim().to_string();
            if let Some(t_args) = &h.type_arguments {
                let ts = t_args.span;
                let raw_args = src[ts.start as usize..ts.end as usize].trim();
                name.push_str(raw_args);
            }
            name
        });
        let class_raw_type = if is_component {
            selector
        } else if is_pipe {
            pipe_name
        } else {
            None
        };
        type_defs.push(LspTypeDefInfo {
            name: class_name.clone(),
            kind: class_kind,
            raw_type: class_raw_type,
            super_class,
            properties: td_props,
            methods: td_methods,
            range: Some(class_range.clone()),
            uri: file_uri.clone(),
        });
    }

    // 3. Extract Interfaces into type_defs
    for iface in &all_interfaces {
        let name = iface.id.name.to_string();
        let span = iface.span();
        let super_class = iface.extends.first().map(|h| {
            let s = h.type_name.span();
            let mut name = src[s.start as usize..s.end as usize].trim().to_string();
            if let Some(t_args) = &h.type_arguments {
                let ts = t_args.span;
                let raw_args = src[ts.start as usize..ts.end as usize].trim();
                name.push_str(raw_args);
            }
            name
        });
        let (props, methods) = extract_ts_signatures(&iface.body.body, src, &line_index, &file_uri);
        type_defs.push(LspTypeDefInfo {
            name,
            kind: "interface".to_string(),
            raw_type: None,
            super_class,
            properties: props,
            methods,
            range: Some(line_index.range_at(span.start as usize, span.end as usize)),
            uri: file_uri.clone(),
        });
    }

    // 4. Extract Type Aliases into type_defs
    for alias in &all_types {
        let name = alias.id.name.to_string();
        let span = alias.span();
        let t_span = alias.type_annotation.span();
        let raw_type = src[t_span.start as usize..t_span.end as usize]
            .trim()
            .to_string();

        let (props, methods) = if let TSType::TSTypeLiteral(lit) = &alias.type_annotation {
            extract_ts_signatures(&lit.members, src, &line_index, &file_uri)
        } else {
            (Vec::new(), Vec::new())
        };

        type_defs.push(LspTypeDefInfo {
            name,
            kind: "type".to_string(),
            raw_type: Some(raw_type),
            super_class: None,
            properties: props,
            methods,
            range: Some(line_index.range_at(span.start as usize, span.end as usize)),
            uri: file_uri.clone(),
        });
    }

    // 5. Extract Functions into type_defs
    for func in &all_functions {
        if let Some(id) = &func.id {
            let name = id.name.to_string();
            let span = func.span();
            let raw_type = func.return_type.as_ref().map(|ret| {
                let s = ret.type_annotation.span();
                src[s.start as usize..s.end as usize].trim().to_string()
            });
            type_defs.push(LspTypeDefInfo {
                name,
                kind: "function".to_string(),
                raw_type,
                super_class: None,
                properties: Vec::new(),
                methods: Vec::new(),
                range: Some(line_index.range_at(span.start as usize, span.end as usize)),
                uri: file_uri.clone(),
            });
        }
    }

    // 5. Enrich type_defs by dynamically resolving imported files from relative path or workspace
    if depth < 3 {
        for imp in &file_imports {
            let paths = resolve_imported_files(file_uri.as_deref(), &imp.module_path);
            for path in paths {
                if let Ok(imported_content) = std::fs::read_to_string(&path) {
                    let target_uri = format!("file://{}", path.display());
                    let imported_res = analyze_components_lsp_depth(
                        &imported_content,
                        Some(target_uri),
                        depth + 1,
                    );
                    for td in imported_res.type_defs {
                        if !type_defs.iter().any(|existing| existing.name == td.name) {
                            type_defs.push(td);
                        }
                    }
                }
            }
        }
    }

    LspAnalysisResult {
        components,
        type_defs,
    }
}

fn strip_json_comments_and_trailing_commas(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    let mut in_string = false;
    let mut is_escaped = false;

    while let Some(ch) = chars.next() {
        if in_string {
            out.push(ch);
            if is_escaped {
                is_escaped = false;
            } else if ch == '\\' {
                is_escaped = true;
            } else if ch == '"' {
                in_string = false;
            }
            continue;
        }

        if ch == '"' {
            in_string = true;
            out.push(ch);
            continue;
        }

        // Single line comment //
        if ch == '/' && chars.peek() == Some(&'/') {
            chars.next();
            for next_ch in chars.by_ref() {
                if next_ch == '\n' {
                    out.push('\n');
                    break;
                }
            }
            continue;
        }

        // Multi line comment /* ... */
        if ch == '/' && chars.peek() == Some(&'*') {
            chars.next();
            while let Some(c) = chars.next() {
                if c == '*' && chars.peek() == Some(&'/') {
                    chars.next();
                    break;
                }
            }
            continue;
        }

        out.push(ch);
    }

    // Remove trailing commas before '}' or ']'
    let mut cleaned = String::with_capacity(out.len());
    let chars_vec: Vec<char> = out.chars().collect();
    let mut i = 0;
    while i < chars_vec.len() {
        let ch = chars_vec[i];
        if ch == ',' {
            let mut j = i + 1;
            while j < chars_vec.len() && chars_vec[j].is_whitespace() {
                j += 1;
            }
            if j < chars_vec.len() && (chars_vec[j] == '}' || chars_vec[j] == ']') {
                i += 1;
                continue;
            }
        }
        cleaned.push(ch);
        i += 1;
    }

    cleaned
}

fn parse_json_value(content: &str) -> Option<serde_json::Value> {
    let stripped = strip_json_comments_and_trailing_commas(content);
    serde_json::from_str(&stripped).ok()
}

#[derive(Debug, Clone, Default)]
struct TsConfigResolution {
    base_dir: std::path::PathBuf,
    base_url: Option<std::path::PathBuf>,
    paths: Vec<(String, Vec<String>)>,
}

impl TsConfigResolution {
    pub fn resolve(&self, module_path: &str) -> Vec<std::path::PathBuf> {
        let mut results = Vec::new();
        let target_base = self.base_url.as_ref().unwrap_or(&self.base_dir);

        for (pattern, targets) in &self.paths {
            let matches = if pattern == module_path {
                Some("")
            } else if pattern.contains('*') {
                let parts: Vec<&str> = pattern.split('*').collect();
                if parts.len() == 2 {
                    let prefix = parts[0];
                    let suffix = parts[1];
                    if module_path.starts_with(prefix)
                        && module_path.ends_with(suffix)
                        && module_path.len() >= prefix.len() + suffix.len()
                    {
                        let inner = &module_path[prefix.len()..module_path.len() - suffix.len()];
                        Some(inner)
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            };

            if let Some(star_val) = matches {
                for target_tpl in targets {
                    let expanded = if target_tpl.contains('*') {
                        target_tpl.replace('*', star_val)
                    } else {
                        target_tpl.clone()
                    };

                    let candidate = target_base.join(&expanded);
                    collect_path_or_dir_files(&candidate, &mut results);
                }
            }
        }

        results
    }
}

fn load_tsconfig_resolution(start_dir: &std::path::Path) -> Option<TsConfigResolution> {
    let mut curr = start_dir;
    let mut tsconfig_path: Option<std::path::PathBuf> = None;
    loop {
        let candidate = curr.join("tsconfig.json");
        if candidate.is_file() {
            tsconfig_path = Some(candidate);
            break;
        }
        let js_candidate = curr.join("jsconfig.json");
        if js_candidate.is_file() {
            tsconfig_path = Some(js_candidate);
            break;
        }
        if let Some(parent) = curr.parent() {
            curr = parent;
        } else {
            break;
        }
    }

    let tsconfig_file = tsconfig_path?;
    load_tsconfig_file_recursive(&tsconfig_file, 0)
}

fn load_tsconfig_file_recursive(
    path: &std::path::Path,
    depth: usize,
) -> Option<TsConfigResolution> {
    if depth > 5 || !path.is_file() {
        return None;
    }
    let content = std::fs::read_to_string(path).ok()?;
    let val = parse_json_value(&content)?;
    let config_dir = path.parent()?.to_path_buf();

    let mut res = TsConfigResolution {
        base_dir: config_dir.clone(),
        base_url: None,
        paths: Vec::new(),
    };

    // Check extends
    if let Some(extends_str) = val.get("extends").and_then(|v| v.as_str()) {
        let mut parent_path = config_dir.join(extends_str);
        if !parent_path.exists() && !extends_str.ends_with(".json") {
            parent_path = config_dir.join(format!("{}.json", extends_str));
        }
        if parent_path.is_file() {
            if let Some(parent_res) = load_tsconfig_file_recursive(&parent_path, depth + 1) {
                res = parent_res;
                res.base_dir = config_dir.clone();
            }
        }
    }

    if let Some(compiler_options) = val.get("compilerOptions") {
        if let Some(base_url_str) = compiler_options.get("baseUrl").and_then(|v| v.as_str()) {
            res.base_url = Some(config_dir.join(base_url_str));
        }
        if let Some(paths_obj) = compiler_options.get("paths").and_then(|v| v.as_object()) {
            for (pattern, targets_val) in paths_obj {
                let mut target_list = Vec::new();
                if let Some(arr) = targets_val.as_array() {
                    for item in arr {
                        if let Some(s) = item.as_str() {
                            target_list.push(s.to_string());
                        }
                    }
                } else if let Some(s) = targets_val.as_str() {
                    target_list.push(s.to_string());
                }
                if !target_list.is_empty() {
                    res.paths.retain(|(p, _)| p != pattern);
                    res.paths.push((pattern.clone(), target_list));
                }
            }
        }
    }

    Some(res)
}

fn collect_path_or_dir_files(candidate: &std::path::Path, results: &mut Vec<std::path::PathBuf>) {
    if candidate.is_file() {
        if !results.contains(&candidate.to_path_buf()) {
            results.push(candidate.to_path_buf());
        }
        if candidate
            .file_name()
            .map_or(false, |n| n.to_str().unwrap_or("").starts_with("index."))
        {
            if let Some(parent) = candidate.parent() {
                if let Ok(entries) = std::fs::read_dir(parent) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.is_file() && p.extension().map_or(false, |e| e == "ts" || e == "tsx") {
                            if !results.contains(&p) {
                                results.push(p);
                            }
                        }
                    }
                }
            }
        }
        return;
    }

    // Try extensions: .ts, .tsx, .d.ts, .js
    for ext in &["ts", "tsx", "d.ts", "js"] {
        let with_ext = candidate.with_extension(ext);
        if with_ext.is_file() && !results.contains(&with_ext) {
            results.push(with_ext);
        }
    }

    // If it is a directory:
    if candidate.is_dir() {
        for idx in &["index.ts", "index.tsx", "index.d.ts", "index.js"] {
            let idx_file = candidate.join(idx);
            if idx_file.is_file() && !results.contains(&idx_file) {
                results.push(idx_file);
            }
        }

        let src_dir = candidate.join("src");
        if src_dir.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&src_dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_file() && p.extension().map_or(false, |e| e == "ts" || e == "tsx") {
                        if !results.contains(&p) {
                            results.push(p);
                        }
                    }
                }
            }
        }

        if let Ok(entries) = std::fs::read_dir(candidate) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() && p.extension().map_or(false, |e| e == "ts" || e == "tsx") {
                    if !results.contains(&p) {
                        results.push(p);
                    }
                }
            }
        }
    }
}

fn resolve_from_package_json(
    start_dir: &std::path::Path,
    module_path: &str,
) -> Vec<std::path::PathBuf> {
    let mut results = Vec::new();
    let mut curr = start_dir;

    loop {
        // 1. Check workspaces in ancestor package.json
        let pkg_file = curr.join("package.json");
        if pkg_file.is_file() {
            if let Ok(content) = std::fs::read_to_string(&pkg_file) {
                if let Some(val) = parse_json_value(&content) {
                    if let Some(workspaces_val) = val.get("workspaces") {
                        let mut patterns = Vec::new();
                        if let Some(arr) = workspaces_val.as_array() {
                            for item in arr {
                                if let Some(s) = item.as_str() {
                                    patterns.push(s.to_string());
                                }
                            }
                        } else if let Some(obj) = workspaces_val.as_object() {
                            if let Some(packages) = obj.get("packages").and_then(|p| p.as_array()) {
                                for item in packages {
                                    if let Some(s) = item.as_str() {
                                        patterns.push(s.to_string());
                                    }
                                }
                            }
                        }

                        for pat in patterns {
                            let clean_pat = pat.trim_end_matches("/*").trim_end_matches("/**");
                            let workspace_dir = curr.join(clean_pat);
                            if workspace_dir.is_dir() {
                                if let Ok(entries) = std::fs::read_dir(&workspace_dir) {
                                    for entry in entries.flatten() {
                                        let child_dir = entry.path();
                                        if child_dir.is_dir() {
                                            let child_pkg = child_dir.join("package.json");
                                            if child_pkg.is_file() {
                                                if let Ok(child_content) =
                                                    std::fs::read_to_string(&child_pkg)
                                                {
                                                    if let Some(child_val) =
                                                        parse_json_value(&child_content)
                                                    {
                                                        if let Some(pkg_name) = child_val
                                                            .get("name")
                                                            .and_then(|n| n.as_str())
                                                        {
                                                            if pkg_name == module_path
                                                                || module_path.starts_with(
                                                                    &format!("{}/", pkg_name),
                                                                )
                                                            {
                                                                resolve_package_dir_files(
                                                                    &child_dir,
                                                                    &child_val,
                                                                    module_path,
                                                                    pkg_name,
                                                                    &mut results,
                                                                );
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        if !results.is_empty() {
                            return results;
                        }
                    }
                }
            }
        }

        // 2. Check node_modules in curr
        let node_modules_candidate = curr.join("node_modules").join(module_path);
        let nm_pkg = node_modules_candidate.join("package.json");
        if nm_pkg.is_file() {
            if let Ok(content) = std::fs::read_to_string(&nm_pkg) {
                if let Some(val) = parse_json_value(&content) {
                    let pkg_name = val
                        .get("name")
                        .and_then(|n| n.as_str())
                        .unwrap_or(module_path);
                    resolve_package_dir_files(
                        &node_modules_candidate,
                        &val,
                        module_path,
                        pkg_name,
                        &mut results,
                    );
                    if !results.is_empty() {
                        return results;
                    }
                }
            }
        }

        if let Some(parent) = curr.parent() {
            curr = parent;
        } else {
            break;
        }
    }

    results
}

fn resolve_package_dir_files(
    pkg_dir: &std::path::Path,
    pkg_json: &serde_json::Value,
    module_path: &str,
    pkg_name: &str,
    results: &mut Vec<std::path::PathBuf>,
) {
    let subpath = if module_path == pkg_name {
        "."
    } else {
        module_path
            .strip_prefix(pkg_name)
            .unwrap_or("")
            .trim_start_matches('/')
    };

    // 1. Check exports
    if let Some(exports) = pkg_json.get("exports") {
        if let Some(s) = exports.as_str() {
            if subpath == "." {
                collect_path_or_dir_files(&pkg_dir.join(s), results);
            }
        } else if let Some(obj) = exports.as_object() {
            let key = if subpath == "." {
                ".".to_string()
            } else {
                format!("./{}", subpath)
            };
            if let Some(target) = obj.get(&key) {
                if let Some(s) = target.as_str() {
                    collect_path_or_dir_files(&pkg_dir.join(s), results);
                } else if let Some(target_obj) = target.as_object() {
                    for field in &["types", "import", "default"] {
                        if let Some(s) = target_obj.get(*field).and_then(|v| v.as_str()) {
                            collect_path_or_dir_files(&pkg_dir.join(s), results);
                            if !results.is_empty() {
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Check types or typings
    if results.is_empty() && subpath == "." {
        for field in &["types", "typings"] {
            if let Some(s) = pkg_json.get(*field).and_then(|v| v.as_str()) {
                collect_path_or_dir_files(&pkg_dir.join(s), results);
                if !results.is_empty() {
                    break;
                }
            }
        }
    }

    // 3. Check module
    if results.is_empty() && subpath == "." {
        if let Some(s) = pkg_json.get("module").and_then(|v| v.as_str()) {
            collect_path_or_dir_files(&pkg_dir.join(s), results);
        }
    }

    // 4. Check main
    if results.is_empty() && subpath == "." {
        if let Some(s) = pkg_json.get("main").and_then(|v| v.as_str()) {
            collect_path_or_dir_files(&pkg_dir.join(s), results);
        }
    }

    // 5. Fallback conventional entry points inside pkg_dir
    if results.is_empty() {
        collect_path_or_dir_files(&pkg_dir.join("src/index.ts"), results);
        collect_path_or_dir_files(&pkg_dir.join("index.ts"), results);
        collect_path_or_dir_files(&pkg_dir.join("src"), results);
    }
}

fn search_package_json_named(
    dir: &std::path::Path,
    target_name: &str,
    max_depth: usize,
) -> Option<std::path::PathBuf> {
    if max_depth == 0 {
        return None;
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let dir_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if dir_name == "node_modules"
                    || dir_name == "target"
                    || dir_name == ".git"
                    || dir_name == "dist"
                {
                    continue;
                }
                let pkg_file = path.join("package.json");
                if pkg_file.is_file() {
                    if let Ok(content) = std::fs::read_to_string(&pkg_file) {
                        if let Some(val) = parse_json_value(&content) {
                            if let Some(name) = val.get("name").and_then(|n| n.as_str()) {
                                if name == target_name {
                                    return Some(path);
                                }
                            }
                        }
                    }
                }
                if let Some(found) = search_package_json_named(&path, target_name, max_depth - 1) {
                    return Some(found);
                }
            }
        }
    }
    None
}

fn search_file_recursive(
    dir: &std::path::Path,
    target_suffix: &str,
    depth: usize,
) -> Option<std::path::PathBuf> {
    if depth == 0 {
        return None;
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(path_str) = path.to_str() {
                    if path_str.ends_with(target_suffix) {
                        return Some(path);
                    }
                }
            } else if path.is_dir() {
                let dir_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if dir_name != "node_modules"
                    && dir_name != "target"
                    && dir_name != ".git"
                    && dir_name != "dist"
                {
                    if let Some(found) = search_file_recursive(&path, target_suffix, depth - 1) {
                        return Some(found);
                    }
                }
            }
        }
    }
    None
}

fn find_project_root(start_dir: &std::path::Path) -> Option<std::path::PathBuf> {
    let mut curr = start_dir;
    loop {
        if curr.join(".git").exists()
            || curr.join("tsconfig.json").exists()
            || curr.join("package.json").exists()
        {
            return Some(curr.to_path_buf());
        }
        if let Some(parent) = curr.parent() {
            curr = parent;
        } else {
            break;
        }
    }
    None
}

pub fn resolve_imported_files(
    current_uri: Option<&str>,
    module_path: &str,
) -> Vec<std::path::PathBuf> {
    let mut results = Vec::new();

    let current_file_path: Option<std::path::PathBuf> = current_uri
        .and_then(|u| {
            let stripped = u.strip_prefix("file://").unwrap_or(u);
            let p = std::path::Path::new(stripped);
            if p.is_absolute() {
                Some(p.to_path_buf())
            } else {
                std::env::current_dir().ok().map(|d| d.join(p))
            }
        })
        .or_else(|| std::env::current_dir().ok());

    let start_dir = current_file_path
        .as_ref()
        .and_then(|p| {
            if p.is_dir() {
                Some(p.clone())
            } else {
                p.parent().map(|d| d.to_path_buf())
            }
        })
        .unwrap_or_else(|| std::path::PathBuf::from("."));

    // 1. Relative imports: starts with '.'
    if module_path.starts_with('.') {
        let candidate = start_dir.join(module_path);
        collect_path_or_dir_files(&candidate, &mut results);
        if !results.is_empty() {
            return results;
        }

        // Fallback for virtual or simulated URIs
        let clean = module_path.trim_start_matches('.').trim_start_matches('/');
        let target_file = if clean.ends_with(".ts") || clean.ends_with(".js") {
            clean.to_string()
        } else {
            format!("{}.ts", clean)
        };
        let file_name = std::path::Path::new(&target_file)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&target_file);

        let root_opt = find_project_root(&start_dir).or_else(|| {
            std::env::current_dir()
                .ok()
                .and_then(|cd| find_project_root(&cd))
        });
        if let Some(root) = root_opt {
            if let Some(found) = search_file_recursive(&root, file_name, 5) {
                collect_path_or_dir_files(&found, &mut results);
                if !results.is_empty() {
                    return results;
                }
            }
        }
    }

    // 2. tsconfig.json compilerOptions.paths resolution
    let tsconfig = load_tsconfig_resolution(&start_dir).or_else(|| {
        std::env::current_dir()
            .ok()
            .and_then(|cd| load_tsconfig_resolution(&cd))
    });
    if let Some(tsconfig) = tsconfig {
        let tsconfig_results = tsconfig.resolve(module_path);
        if !tsconfig_results.is_empty() {
            return tsconfig_results;
        }
    }

    // 3. package.json workspaces & node_modules resolution
    let mut pkg_results = resolve_from_package_json(&start_dir, module_path);
    if pkg_results.is_empty() {
        if let Ok(cd) = std::env::current_dir() {
            pkg_results = resolve_from_package_json(&cd, module_path);
        }
    }
    if !pkg_results.is_empty() {
        return pkg_results;
    }

    // 4. Fallback search: walk up to workspace root (.git or root package.json)
    let root_opt = find_project_root(&start_dir).or_else(|| {
        std::env::current_dir()
            .ok()
            .and_then(|cd| find_project_root(&cd))
    });
    if let Some(root) = root_opt {
        if let Some(found_pkg) = search_package_json_named(&root, module_path, 3) {
            collect_path_or_dir_files(&found_pkg, &mut results);
            if !results.is_empty() {
                return results;
            }
        }
    }

    results
}

#[allow(dead_code)]
fn resolve_module_uri_internal(current_uri: &str, module_path: &str) -> String {
    let resolved = resolve_imported_files(Some(current_uri), module_path);
    if let Some(first) = resolved.first() {
        return format!("file://{}", first.display());
    }

    if !current_uri.contains('/') {
        return module_path.to_string();
    }
    let last_slash = current_uri.rfind('/').unwrap();
    let dir = &current_uri[..last_slash];
    let mut target = module_path.to_string();
    if target.starts_with("./") {
        target = format!("{}/{}", dir, &target[2..]);
    } else if target.starts_with("../") {
        target = format!("{}/{}", dir, target);
    }
    if !target.ends_with(".ts") && !target.ends_with(".js") {
        target.push_str(".ts");
    }
    target
}

fn extract_ts_signatures(
    sigs: &[TSSignature],
    src: &str,
    line_index: &LineIndex,
    file_uri: &Option<String>,
) -> (Vec<LspTypeMemberInfo>, Vec<LspTypeMemberInfo>) {
    let mut properties = Vec::new();
    let mut methods = Vec::new();

    for sig in sigs {
        match sig {
            TSSignature::TSPropertySignature(p) => {
                let name = match &p.key {
                    PropertyKey::StaticIdentifier(id) => id.name.to_string(),
                    PropertyKey::Identifier(id) => id.name.to_string(),
                    PropertyKey::StringLiteral(lit) => lit.value.to_string(),
                    _ => continue,
                };
                let span = p.span();
                let type_str = if let Some(annot) = &p.type_annotation {
                    let t_span = annot.type_annotation.span();
                    src[t_span.start as usize..t_span.end as usize]
                        .trim()
                        .to_string()
                } else {
                    "any".to_string()
                };
                let doc = extract_jsdoc(src, span.start as usize);
                properties.push(LspTypeMemberInfo {
                    name,
                    r#type: type_str.clone(),
                    raw_type: type_str,
                    unwrapped_type: None,
                    is_signal: Some(false),
                    is_method: Some(false),
                    signature: None,
                    docstring: doc,
                    range: Some(line_index.range_at(span.start as usize, span.end as usize)),
                    uri: file_uri.clone(),
                });
            }
            TSSignature::TSMethodSignature(m) => {
                let name = match &m.key {
                    PropertyKey::StaticIdentifier(id) => id.name.to_string(),
                    PropertyKey::Identifier(id) => id.name.to_string(),
                    PropertyKey::StringLiteral(lit) => lit.value.to_string(),
                    _ => continue,
                };
                let span = m.span();
                let ret_type = if let Some(annot) = &m.return_type {
                    let t_span = annot.type_annotation.span();
                    src[t_span.start as usize..t_span.end as usize]
                        .trim()
                        .to_string()
                } else {
                    "void".to_string()
                };
                let sig_str = format!("(...args: any[]): {}", ret_type);
                let doc = extract_jsdoc(src, span.start as usize);
                methods.push(LspTypeMemberInfo {
                    name,
                    r#type: ret_type.clone(),
                    raw_type: ret_type,
                    unwrapped_type: None,
                    is_signal: Some(false),
                    is_method: Some(true),
                    signature: Some(sig_str),
                    docstring: doc,
                    range: Some(line_index.range_at(span.start as usize, span.end as usize)),
                    uri: file_uri.clone(),
                });
            }
            _ => {}
        }
    }

    (properties, methods)
}

fn infer_return_type_from_fn<'a>(expr: Option<&'a Expression<'a>>, src: &str) -> String {
    match expr {
        Some(Expression::ArrowFunctionExpression(arrow)) => {
            if let Some(rt) = &arrow.return_type {
                let span = rt.type_annotation.span();
                return src[span.start as usize..span.end as usize]
                    .trim()
                    .to_string();
            }
            if let Some(fb) = arrow.body.as_function_body() {
                if let Some(ret_expr) = find_return_expression(&fb.statements) {
                    infer_expression_type_str(Some(ret_expr))
                } else {
                    "any".to_string()
                }
            } else if let Some(ret_expr) = arrow.body.as_expression() {
                infer_expression_type_str(Some(ret_expr))
            } else {
                "any".to_string()
            }
        }
        Some(Expression::FunctionExpression(func)) => {
            if let Some(rt) = &func.return_type {
                let span = rt.type_annotation.span();
                return src[span.start as usize..span.end as usize]
                    .trim()
                    .to_string();
            }
            if let Some(fb) = &func.body {
                if let Some(ret_expr) = find_return_expression(&fb.statements) {
                    infer_expression_type_str(Some(ret_expr))
                } else {
                    "any".to_string()
                }
            } else {
                "any".to_string()
            }
        }
        _ => "any".to_string(),
    }
}

fn find_return_expression<'a>(stmts: &'a [Statement<'a>]) -> Option<&'a Expression<'a>> {
    for stmt in stmts.iter().rev() {
        if let Some(expr) = scan_stmt_for_return(stmt) {
            return Some(expr);
        }
    }
    None
}

fn scan_stmt_for_return<'a>(stmt: &'a Statement<'a>) -> Option<&'a Expression<'a>> {
    match stmt {
        Statement::ReturnStatement(ret) => ret.argument.as_ref(),
        Statement::BlockStatement(block) => find_return_expression(&block.body),
        Statement::IfStatement(if_stmt) => {
            if let Some(expr) = scan_stmt_for_return(&if_stmt.consequent) {
                return Some(expr);
            }
            if let Some(alt) = &if_stmt.alternate {
                return scan_stmt_for_return(alt);
            }
            None
        }
        _ => None,
    }
}

fn infer_expression_type_str(expr: Option<&Expression>) -> String {
    let expr = match expr {
        Some(e) => e,
        None => return "any".to_string(),
    };

    match expr {
        Expression::StringLiteral(_) => "string".to_string(),
        Expression::TemplateLiteral(_) => "string".to_string(),
        Expression::NumericLiteral(_) => "number".to_string(),
        Expression::BooleanLiteral(_) => "boolean".to_string(),
        Expression::ArrayExpression(_) => "any[]".to_string(),
        Expression::ObjectExpression(_) => "object".to_string(),
        Expression::UnaryExpression(unary) => match unary.operator {
            UnaryOperator::LogicalNot => "boolean".to_string(),
            UnaryOperator::UnaryPlus | UnaryOperator::UnaryNegation | UnaryOperator::BitwiseNot => {
                "number".to_string()
            }
            UnaryOperator::Typeof => "string".to_string(),
            _ => "any".to_string(),
        },
        Expression::BinaryExpression(bin) => match bin.operator {
            BinaryOperator::Equality
            | BinaryOperator::Inequality
            | BinaryOperator::StrictEquality
            | BinaryOperator::StrictInequality
            | BinaryOperator::LessThan
            | BinaryOperator::LessEqualThan
            | BinaryOperator::GreaterThan
            | BinaryOperator::GreaterEqualThan
            | BinaryOperator::Instanceof
            | BinaryOperator::In => "boolean".to_string(),
            BinaryOperator::Subtraction
            | BinaryOperator::Multiplication
            | BinaryOperator::Division
            | BinaryOperator::Remainder
            | BinaryOperator::Exponential
            | BinaryOperator::BitwiseAnd
            | BinaryOperator::BitwiseOR
            | BinaryOperator::BitwiseXOR
            | BinaryOperator::ShiftLeft
            | BinaryOperator::ShiftRight
            | BinaryOperator::ShiftRightZeroFill => "number".to_string(),
            BinaryOperator::Addition => {
                let left = infer_expression_type_str(Some(&bin.left));
                let right = infer_expression_type_str(Some(&bin.right));
                if left == "string" || right == "string" {
                    "string".to_string()
                } else if left == "number" || right == "number" {
                    "number".to_string()
                } else {
                    "any".to_string()
                }
            }
        },
        Expression::CallExpression(call) => {
            let fn_name = match &call.callee {
                Expression::Identifier(id) => id.name.as_str(),
                Expression::StaticMemberExpression(mem) => {
                    let obj_name = match &mem.object {
                        Expression::Identifier(id) => id.name.as_str(),
                        _ => "",
                    };
                    if obj_name == "Math" {
                        return "number".to_string();
                    }
                    if obj_name == "Date" && mem.property.name == "now" {
                        return "number".to_string();
                    }
                    if mem.property.name == "toFixed" || mem.property.name == "toString" {
                        return "string".to_string();
                    }
                    mem.property.name.as_str()
                }
                _ => "",
            };

            match fn_name {
                "parseFloat" | "parseInt" | "Number" => "number".to_string(),
                "String" => "string".to_string(),
                "Boolean" => "boolean".to_string(),
                _ => "any".to_string(),
            }
        }
        Expression::StaticMemberExpression(mem) => {
            if mem.property.name == "length" {
                "number".to_string()
            } else {
                "any".to_string()
            }
        }
        Expression::ParenthesizedExpression(p) => infer_expression_type_str(Some(&p.expression)),
        _ => "any".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_analyze_component_lsp() {
        let source = r#"
import { Component, signal } from '@angora-js/core';
import { ToastService } from '@angora-js/ui';

@Directive({
    selector: '[appHighlight]'
})
export class AppHighlightDirective {
    bgColor = signal('transparent');
}

/**
 * Main application showcase component
 */
@Component({
    selector: 'app-ui-demo',
    imports: [AppHighlightDirective],
    template: `
        <div>
            <h1>{{ title() }}</h1>
            <button (click)="increment()">+</button>
        </div>
    `
})
export class UiDemoComponent {
    /** The title of showcase */
    title = signal<string>('Angora 2.0');
    count = signal(100);

    constructor(private toastService: ToastService) {}

    increment(): void {
        this.count.set(this.count() + 1);
    }
}
"#;

        let res = analyze_components_lsp(source, Some("file:///test.component.ts".to_string()));
        assert_eq!(res.components.len(), 1);

        let comp = &res.components[0];
        assert_eq!(comp.class_name, "UiDemoComponent");
        assert_eq!(comp.selector.as_deref(), Some("app-ui-demo"));
        assert_eq!(
            comp.component_imports.as_ref().unwrap(),
            &vec!["AppHighlightDirective".to_string()]
        );
        assert!(comp.template.is_some());

        let tmpl = comp.template.as_ref().unwrap();
        assert!(tmpl.content.contains("{{ title() }}"));
        assert!(tmpl.tcb.is_some());
        let tcb = tmpl.tcb.as_ref().unwrap();
        assert!(tcb.code.contains("__angora_tcb_UiDemoComponent"));

        // Check properties
        let title_prop = comp.properties.iter().find(|p| p.name == "title").unwrap();
        assert_eq!(title_prop.unwrapped_type, "string");
        assert!(title_prop.is_signal);
        assert_eq!(
            title_prop.docstring.as_deref(),
            Some("The title of showcase")
        );

        let count_prop = comp.properties.iter().find(|p| p.name == "count").unwrap();
        assert_eq!(count_prop.unwrapped_type, "number");
        assert!(count_prop.is_signal);

        let toast_prop = comp
            .properties
            .iter()
            .find(|p| p.name == "toastService")
            .unwrap();
        assert_eq!(toast_prop.raw_type, "ToastService");

        // Check methods
        let inc_method = comp.methods.iter().find(|m| m.name == "increment").unwrap();
        assert_eq!(inc_method.return_type, "void");
    }

    #[test]
    fn test_scoped_component_lsp() {
        let source = r#"import { Component, signal } from '@angora-js/core';

interface Product {
  id: number;
  name: string;
  price: number;
}

@Component({
  selector: 'app-product-list',
  template: `
    <div>
      <input #filterBox [value]="filterText()" />
      <button [disabled]="filterBox.value.length === 0" (click)="filterBox.focus()">Clear</button>

      @for (item of products(); track item.id; let idx = $index) {
        <div class="item-row">
          <span>#{{ $index }}: {{ item.name }} - \${{ item.price }}</span>
          <span [hidden]="$first">Not first</span>
          <span [hidden]="$last">Not last</span>
        </div>
      }
    </div>
  `
})
export class ProductListComponent {
  filterText = signal<string>('');
  products = signal<Product[]>([
    { id: 1, name: 'Angora Pro', price: 99 },
    { id: 2, name: 'Angora Studio', price: 199 }
  ]);
}
"#;
        let res = analyze_components_lsp(
            source,
            Some("file:///product-list.component.ts".to_string()),
        );
        println!(
            "test_scoped_component_lsp: found {} components",
            res.components.len()
        );
        assert_eq!(res.components.len(), 1);
    }

    #[test]
    fn test_form_controls_lsp() {
        let source = r#"import { Component } from '@angora-js/core';
import { FormControl, FormGroup, FormArray } from '@angora-js/forms';

@Component({
  selector: 'app-form-test',
  template: `<div></div>`
})
export class FormTestComponent {
  name = new FormControl('Alice');
  age = new FormControl(30);
  email = new FormControl<string>('alice@angora.dev');
  form = new FormGroup({});
  items = new FormArray([]);
}
"#;
        let res =
            analyze_components_lsp(source, Some("file:///form-test.component.ts".to_string()));
        assert_eq!(res.components.len(), 1);
        let comp = &res.components[0];

        let name_prop = comp.properties.iter().find(|p| p.name == "name").unwrap();
        assert_eq!(name_prop.raw_type, "FormControl<string>");

        let age_prop = comp.properties.iter().find(|p| p.name == "age").unwrap();
        assert_eq!(age_prop.raw_type, "FormControl<number>");

        let email_prop = comp.properties.iter().find(|p| p.name == "email").unwrap();
        assert_eq!(email_prop.raw_type, "FormControl<string>");

        let form_prop = comp.properties.iter().find(|p| p.name == "form").unwrap();
        assert_eq!(form_prop.raw_type, "FormGroup");

        let items_prop = comp.properties.iter().find(|p| p.name == "items").unwrap();
        assert_eq!(items_prop.raw_type, "FormArray");
    }
}
