use crate::parser::parse_template;
use oxc_allocator::Allocator;
use oxc_ast::ast::*;
use oxc_parser::Parser;
use oxc_span::{GetSpan, SourceType};
use std::collections::HashSet;

pub enum TransformedEntity {
    Component(ComponentMetadata),
    Directive(DirectiveMetadata),
    Pipe(PipeMetadata),
    Injectable(InjectableMetadata),
}

pub struct ComponentMetadata {
    pub class_name: String,
    pub selector: String,
    pub imports_str: Option<String>,
    pub styles_raw: Vec<String>,
    pub template: String,
}

pub struct DirectiveMetadata {
    pub class_name: String,
    pub selector: String,
    pub host_str: Option<String>,
}

pub struct PipeMetadata {
    pub class_name: String,
    pub name: String,
    pub pure: bool,
}

pub struct InjectableMetadata {
    pub class_name: String,
    pub options_str: String,
}

fn to_kebab_case(s: &str) -> String {
    let mut result = String::new();
    for (i, c) in s.chars().enumerate() {
        if c.is_uppercase() {
            if i > 0 {
                result.push('-');
            }
            result.push(c.to_ascii_lowercase());
        } else {
            result.push(c);
        }
    }
    result
}

fn is_angora_internal(name: &str) -> bool {
    matches!(
        name,
        "Component"
            | "Directive"
            | "Pipe"
            | "Injectable"
            | "signal"
            | "computed"
            | "effect"
            | "batch"
            | "untrack"
            | "linkedSignal"
            | "resource"
            | "createStore"
            | "Injector"
            | "rootInjector"
            | "ElementRef"
            | "DestroyRef"
            | "ChangeDetectorRef"
            | "DefaultDestroyRef"
            | "runWithDestroyRef"
            | "inject"
            | "OnInit"
            | "OnDestroy"
            | "AfterViewInit"
            | "OnChanges"
            | "DoCheck"
            | "Signal"
            | "WritableSignal"
            | "ReadonlySignal"
            | "PipeTransform"
            | "Provider"
            | "ViewEncapsulation"
            | "ComponentDef"
            | "DirectiveDef"
            | "PipeDef"
            | "TemplateNode"
            | "html"
            | "css"
    )
}

fn extract_pipes_from_expr(expr: &str, pipes: &mut HashSet<String>) {
    if !expr.contains('|') {
        return;
    }
    let parts: Vec<&str> = expr.split('|').collect();
    if parts.len() > 1 {
        for pipe_part in &parts[1..] {
            let trimmed = pipe_part.trim();
            let pipe_ident = trimmed
                .split(|c: char| c == ':' || c.is_whitespace() || c == '(' || c == ')')
                .next()
                .unwrap_or("")
                .trim();
            if !pipe_ident.is_empty() {
                pipes.insert(pipe_ident.to_lowercase());
            }
        }
    }
}

fn collect_template_usages(
    nodes: &[crate::ast::TemplateNode],
    tags: &mut HashSet<String>,
    attrs: &mut HashSet<String>,
    pipes: &mut HashSet<String>,
) {
    for node in nodes {
        match node {
            crate::ast::TemplateNode::Element(el) => {
                tags.insert(el.name.to_lowercase());
                for attr in &el.attributes {
                    attrs.insert(attr.name.to_lowercase());
                }
                for prop in &el.properties {
                    attrs.insert(prop.name.to_lowercase());
                    extract_pipes_from_expr(&prop.expression, pipes);
                }
                for evt in &el.events {
                    extract_pipes_from_expr(&evt.handler, pipes);
                }
                for two in &el.two_ways {
                    attrs.insert(two.name.to_lowercase());
                }
                collect_template_usages(&el.children, tags, attrs, pipes);
            }
            crate::ast::TemplateNode::Interpolation(interp) => {
                extract_pipes_from_expr(&interp.expression, pipes);
            }
            crate::ast::TemplateNode::IfBlock(b) => {
                for branch in &b.branches {
                    if let Some(cond) = &branch.condition {
                        extract_pipes_from_expr(cond, pipes);
                    }
                    collect_template_usages(&branch.children, tags, attrs, pipes);
                }
            }
            crate::ast::TemplateNode::ForBlock(b) => {
                extract_pipes_from_expr(&b.iterable, pipes);
                collect_template_usages(&b.children, tags, attrs, pipes);
                if let Some(empty) = &b.empty_block {
                    collect_template_usages(empty, tags, attrs, pipes);
                }
            }
            crate::ast::TemplateNode::SwitchBlock(b) => {
                extract_pipes_from_expr(&b.expression, pipes);
                for case in &b.cases {
                    if let Some(cv) = &case.case_value {
                        extract_pipes_from_expr(cv, pipes);
                    }
                    collect_template_usages(&case.children, tags, attrs, pipes);
                }
            }
            crate::ast::TemplateNode::DeferBlock(b) => {
                collect_template_usages(&b.main_block, tags, attrs, pipes);
                if let Some(l) = &b.loading_block {
                    collect_template_usages(&l.children, tags, attrs, pipes);
                }
                if let Some(p) = &b.placeholder_block {
                    collect_template_usages(&p.children, tags, attrs, pipes);
                }
                if let Some(e) = &b.error_block {
                    collect_template_usages(&e.children, tags, attrs, pipes);
                }
            }
            _ => {}
        }
    }
}

fn matches_candidate(
    name: &str,
    tags: &HashSet<String>,
    attrs: &HashSet<String>,
    pipes: &HashSet<String>,
) -> bool {
    if is_angora_internal(name) {
        return false;
    }

    // 1. Explicit convention naming
    if name.ends_with("Component") || name.ends_with("Directive") || name.ends_with("Pipe") {
        return true;
    }

    let lower = name.to_lowercase();
    let kebab = to_kebab_case(name);

    // 2. Tag matching (e.g. `<Button>`, `<app-button>`, `<user-avatar>`)
    if tags.contains(&lower) || tags.contains(&kebab) {
        return true;
    }

    // 3. Pipe matching (e.g. `{{ text | reverse }}`)
    if pipes.contains(&lower) {
        return true;
    }

    // 4. Directive attribute matching (e.g. `<div highlight>`)
    if attrs.contains(&lower) || attrs.contains(&kebab) {
        return true;
    }

    false
}

fn resolve_file_content(path_str: &str, file_path: Option<&str>) -> Option<String> {
    let resolved = if let Some(base) = file_path {
        let p = std::path::Path::new(base);
        if let Some(parent) = p.parent() {
            parent.join(path_str)
        } else {
            std::path::PathBuf::from(path_str)
        }
    } else {
        std::path::PathBuf::from(path_str)
    };
    std::fs::read_to_string(&resolved).ok()
}

fn resolve_convention_template_and_styles(
    class_name: &str,
    file_path: Option<&str>,
    template: &mut Option<String>,
    styles_raw: &mut Vec<String>,
) {
    if let Some(fp) = file_path {
        let p = std::path::Path::new(fp);
        if let Some(parent) = p.parent() {
            let file_stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
            let kebab = to_kebab_case(class_name);

            // e.g. "counter.component" -> base is "counter"
            let base_stem = if let Some(idx) = file_stem.find(".component") {
                &file_stem[..idx]
            } else {
                file_stem
            };

            let tmpl_candidates = [
                parent.join(format!("{file_stem}.html")),
                parent.join(format!("{base_stem}.component.html")),
                parent.join(format!("{base_stem}.html")),
                parent.join(format!("{kebab}.component.html")),
                parent.join(format!("{kebab}.html")),
            ];
            for cand in &tmpl_candidates {
                if cand.is_file() {
                    if let Ok(c) = std::fs::read_to_string(cand) {
                        *template = Some(c);
                        break;
                    }
                }
            }

            let style_candidates = [
                parent.join(format!("{file_stem}.css")),
                parent.join(format!("{base_stem}.component.css")),
                parent.join(format!("{base_stem}.css")),
                parent.join(format!("{kebab}.component.css")),
                parent.join(format!("{kebab}.css")),
            ];
            for cand in &style_candidates {
                if cand.is_file() {
                    if let Ok(c) = std::fs::read_to_string(cand) {
                        styles_raw.push(c);
                        break;
                    }
                }
            }
        }
    }
}

fn extract_entity_metadata<'a>(
    class: &mut oxc_ast::ast::Class<'a>,
    source: &str,
    file_path: Option<&str>,
) -> Option<TransformedEntity> {
    let class_name = class
        .id
        .as_ref()
        .map(|id| id.name.to_string())
        .unwrap_or_else(|| "AnonymousClass".to_string());

    let mut entity: Option<TransformedEntity> = None;

    // Inspect decorators on the class AST node
    for decorator in &class.decorators {
        match &decorator.expression {
            oxc_ast::ast::Expression::CallExpression(call) => {
                let decorator_name = match &call.callee {
                    oxc_ast::ast::Expression::Identifier(ident) => ident.name.as_str(),
                    _ => "",
                };

                match decorator_name {
                    "Component" => {
                        let mut selector: Option<String> = None;
                        let mut template: Option<String> = None;
                        let mut imports_str: Option<String> = None;
                        let mut styles_raw = Vec::new();

                        if let Some(arg) = call.arguments.first() {
                            match arg.as_expression() {
                                Some(oxc_ast::ast::Expression::ObjectExpression(obj)) => {
                                    for prop in &obj.properties {
                                        if let oxc_ast::ast::ObjectPropertyKind::ObjectProperty(p) =
                                            prop
                                        {
                                            let key_name = match &p.key {
                                                oxc_ast::ast::PropertyKey::StaticIdentifier(
                                                    ident,
                                                ) => Some(ident.name.as_str()),
                                                oxc_ast::ast::PropertyKey::Identifier(ident) => {
                                                    Some(ident.name.as_str())
                                                }
                                                oxc_ast::ast::PropertyKey::StringLiteral(lit) => {
                                                    Some(lit.value.as_str())
                                                }
                                                _ => None,
                                            };

                                            match key_name {
                                                Some("selector") => match &p.value {
                                                    oxc_ast::ast::Expression::StringLiteral(
                                                        lit,
                                                    ) => {
                                                        selector = Some(lit.value.to_string());
                                                    }
                                                    oxc_ast::ast::Expression::TemplateLiteral(
                                                        lit,
                                                    ) => {
                                                        let s: String = lit
                                                            .quasis
                                                            .iter()
                                                            .map(|q| q.value.raw.as_str())
                                                            .collect();
                                                        selector = Some(s);
                                                    }
                                                    _ => {}
                                                },
                                                Some("template") => match &p.value {
                                                    oxc_ast::ast::Expression::StringLiteral(
                                                        lit,
                                                    ) => {
                                                        template = Some(lit.value.to_string());
                                                    }
                                                    oxc_ast::ast::Expression::TemplateLiteral(
                                                        lit,
                                                    ) => {
                                                        let s: String = lit
                                                            .quasis
                                                            .iter()
                                                            .map(|q| q.value.raw.as_str())
                                                            .collect();
                                                        template = Some(s);
                                                    }
                                                    _ => {}
                                                },
                                                Some("templateUrl") => {
                                                    let url_opt = match &p.value {
                                                        oxc_ast::ast::Expression::StringLiteral(
                                                            lit,
                                                        ) => Some(lit.value.to_string()),
                                                        oxc_ast::ast::Expression::TemplateLiteral(
                                                            lit,
                                                        ) => Some(
                                                            lit.quasis
                                                                .iter()
                                                                .map(|q| q.value.raw.as_str())
                                                                .collect::<String>(),
                                                        ),
                                                        _ => None,
                                                    };
                                                    if let Some(url) = url_opt {
                                                        if let Some(content) =
                                                            resolve_file_content(&url, file_path)
                                                        {
                                                            template = Some(content);
                                                        }
                                                    }
                                                }
                                                Some("imports") => {
                                                    let span = p.value.span();
                                                    imports_str = Some(
                                                        source[span.start as usize..span.end as usize]
                                                            .to_string(),
                                                    );
                                                }
                                                Some("styleUrl") => {
                                                    let url_opt = match &p.value {
                                                        oxc_ast::ast::Expression::StringLiteral(
                                                            lit,
                                                        ) => Some(lit.value.to_string()),
                                                        oxc_ast::ast::Expression::TemplateLiteral(
                                                            lit,
                                                        ) => Some(
                                                            lit.quasis
                                                                .iter()
                                                                .map(|q| q.value.raw.as_str())
                                                                .collect::<String>(),
                                                        ),
                                                        _ => None,
                                                    };
                                                    if let Some(url) = url_opt {
                                                        if let Some(content) =
                                                            resolve_file_content(&url, file_path)
                                                        {
                                                            styles_raw.push(content);
                                                        }
                                                    }
                                                }
                                                Some("styleUrls") => {
                                                    if let oxc_ast::ast::Expression::ArrayExpression(
                                                        arr,
                                                    ) = &p.value
                                                    {
                                                        for elem in &arr.elements {
                                                            if let Some(expr) = elem.as_expression() {
                                                                let url_opt = match expr {
                                                                    oxc_ast::ast::Expression::StringLiteral(lit) => Some(lit.value.to_string()),
                                                                    oxc_ast::ast::Expression::TemplateLiteral(lit) => Some(lit.quasis.iter().map(|q| q.value.raw.as_str()).collect::<String>()),
                                                                    _ => None,
                                                                };
                                                                if let Some(url) = url_opt {
                                                                    if let Some(content) =
                                                                        resolve_file_content(
                                                                            &url, file_path,
                                                                        )
                                                                    {
                                                                        styles_raw.push(content);
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                                Some("styles") => {
                                                    if let oxc_ast::ast::Expression::ArrayExpression(
                                                        arr,
                                                    ) = &p.value
                                                    {
                                                        for elem in &arr.elements {
                                                            if let Some(expr) = elem.as_expression() {
                                                                match expr {
                                                                    oxc_ast::ast::Expression::StringLiteral(lit) => {
                                                                        styles_raw.push(lit.value.to_string());
                                                                    }
                                                                    oxc_ast::ast::Expression::TemplateLiteral(lit) => {
                                                                        let s: String = lit
                                                                            .quasis
                                                                            .iter()
                                                                            .map(|q| q.value.raw.as_str())
                                                                            .collect();
                                                                        styles_raw.push(s);
                                                                    }
                                                                    _ => {}
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                                _ => {}
                                            }
                                        }
                                    }
                                }
                                Some(oxc_ast::ast::Expression::StringLiteral(lit)) => {
                                    let val = lit.value.as_str();
                                    if (val.ends_with(".html") || val.ends_with(".htm"))
                                        && !val.contains('<')
                                        && !val.contains('\n')
                                    {
                                        if let Some(content) = resolve_file_content(val, file_path)
                                        {
                                            template = Some(content);
                                        } else {
                                            template = Some(val.to_string());
                                        }
                                    } else {
                                        template = Some(val.to_string());
                                    }
                                }
                                Some(oxc_ast::ast::Expression::TemplateLiteral(lit)) => {
                                    let s: String =
                                        lit.quasis.iter().map(|q| q.value.raw.as_str()).collect();
                                    let val = s.as_str();
                                    if (val.ends_with(".html") || val.ends_with(".htm"))
                                        && !val.contains('<')
                                        && !val.contains('\n')
                                    {
                                        if let Some(content) = resolve_file_content(val, file_path)
                                        {
                                            template = Some(content);
                                        } else {
                                            template = Some(s);
                                        }
                                    } else {
                                        template = Some(s);
                                    }
                                }
                                Some(oxc_ast::ast::Expression::TaggedTemplateExpression(
                                    tagged,
                                )) => {
                                    let s: String = tagged
                                        .quasi
                                        .quasis
                                        .iter()
                                        .map(|q| q.value.raw.as_str())
                                        .collect();
                                    template = Some(s);
                                }
                                _ => {}
                            }
                        } else {
                            // Shorthand @Component() with convention
                            resolve_convention_template_and_styles(
                                &class_name,
                                file_path,
                                &mut template,
                                &mut styles_raw,
                            );
                        }

                        let final_selector = selector.unwrap_or_else(|| to_kebab_case(&class_name));
                        if let Some(tmpl) = template {
                            entity = Some(TransformedEntity::Component(ComponentMetadata {
                                class_name: class_name.clone(),
                                selector: final_selector,
                                imports_str,
                                styles_raw,
                                template: tmpl,
                            }));
                            break;
                        }
                    }
                    "Directive" => {
                        let mut selector: Option<String> = None;
                        let mut host_str: Option<String> = None;

                        if let Some(arg) = call.arguments.first() {
                            if let Some(oxc_ast::ast::Expression::ObjectExpression(obj)) =
                                arg.as_expression()
                            {
                                for prop in &obj.properties {
                                    if let oxc_ast::ast::ObjectPropertyKind::ObjectProperty(p) =
                                        prop
                                    {
                                        let key_name = match &p.key {
                                            oxc_ast::ast::PropertyKey::StaticIdentifier(ident) => {
                                                Some(ident.name.as_str())
                                            }
                                            oxc_ast::ast::PropertyKey::Identifier(ident) => {
                                                Some(ident.name.as_str())
                                            }
                                            oxc_ast::ast::PropertyKey::StringLiteral(lit) => {
                                                Some(lit.value.as_str())
                                            }
                                            _ => None,
                                        };

                                        match key_name {
                                            Some("selector") => {
                                                if let oxc_ast::ast::Expression::StringLiteral(
                                                    lit,
                                                ) = &p.value
                                                {
                                                    selector = Some(lit.value.to_string());
                                                }
                                            }
                                            Some("host") => {
                                                let span = p.value.span();
                                                host_str = Some(
                                                    source[span.start as usize..span.end as usize]
                                                        .to_string(),
                                                );
                                            }
                                            _ => {}
                                        }
                                    }
                                }
                            }
                        }

                        let final_selector =
                            selector.unwrap_or_else(|| format!("[{}]", to_kebab_case(&class_name)));
                        entity = Some(TransformedEntity::Directive(DirectiveMetadata {
                            class_name: class_name.clone(),
                            selector: final_selector,
                            host_str,
                        }));
                        break;
                    }
                    "Pipe" => {
                        let mut pipe_name: Option<String> = None;
                        let mut pure = true;

                        if let Some(arg) = call.arguments.first() {
                            if let Some(oxc_ast::ast::Expression::ObjectExpression(obj)) =
                                arg.as_expression()
                            {
                                for prop in &obj.properties {
                                    if let oxc_ast::ast::ObjectPropertyKind::ObjectProperty(p) =
                                        prop
                                    {
                                        let key_name = match &p.key {
                                            oxc_ast::ast::PropertyKey::StaticIdentifier(ident) => {
                                                Some(ident.name.as_str())
                                            }
                                            oxc_ast::ast::PropertyKey::Identifier(ident) => {
                                                Some(ident.name.as_str())
                                            }
                                            oxc_ast::ast::PropertyKey::StringLiteral(lit) => {
                                                Some(lit.value.as_str())
                                            }
                                            _ => None,
                                        };

                                        match key_name {
                                            Some("name") => {
                                                if let oxc_ast::ast::Expression::StringLiteral(
                                                    lit,
                                                ) = &p.value
                                                {
                                                    pipe_name = Some(lit.value.to_string());
                                                }
                                            }
                                            Some("pure") => {
                                                if let oxc_ast::ast::Expression::BooleanLiteral(
                                                    lit,
                                                ) = &p.value
                                                {
                                                    pure = lit.value;
                                                }
                                            }
                                            _ => {}
                                        }
                                    }
                                }
                            }
                        }

                        let final_name = pipe_name.unwrap_or_else(|| to_kebab_case(&class_name));
                        entity = Some(TransformedEntity::Pipe(PipeMetadata {
                            class_name: class_name.clone(),
                            name: final_name,
                            pure,
                        }));
                        break;
                    }
                    "Injectable" => {
                        let mut options_str = "{}".to_string();
                        if let Some(arg) = call.arguments.first() {
                            let span = arg.span();
                            options_str =
                                source[span.start as usize..span.end as usize].to_string();
                        }
                        entity = Some(TransformedEntity::Injectable(InjectableMetadata {
                            class_name: class_name.clone(),
                            options_str,
                        }));
                        break;
                    }
                    _ => {}
                }
            }
            oxc_ast::ast::Expression::Identifier(ident) => {
                if ident.name == "Injectable" {
                    entity = Some(TransformedEntity::Injectable(InjectableMetadata {
                        class_name: class_name.clone(),
                        options_str: "{}".to_string(),
                    }));
                    break;
                } else if ident.name == "Component" {
                    let mut template: Option<String> = None;
                    let mut styles_raw = Vec::new();
                    resolve_convention_template_and_styles(
                        &class_name,
                        file_path,
                        &mut template,
                        &mut styles_raw,
                    );
                    if let Some(tmpl) = template {
                        let final_selector = to_kebab_case(&class_name);
                        entity = Some(TransformedEntity::Component(ComponentMetadata {
                            class_name: class_name.clone(),
                            selector: final_selector,
                            imports_str: None,
                            styles_raw,
                            template: tmpl,
                        }));
                        break;
                    }
                }
            }
            oxc_ast::ast::Expression::TaggedTemplateExpression(tagged) => {
                let tag_name = match &tagged.tag {
                    oxc_ast::ast::Expression::Identifier(ident) => ident.name.as_str(),
                    _ => "",
                };
                if tag_name == "Component" {
                    let s: String = tagged
                        .quasi
                        .quasis
                        .iter()
                        .map(|q| q.value.raw.as_str())
                        .collect();
                    let final_selector = to_kebab_case(&class_name);
                    entity = Some(TransformedEntity::Component(ComponentMetadata {
                        class_name: class_name.clone(),
                        selector: final_selector,
                        imports_str: None,
                        styles_raw: Vec::new(),
                        template: s,
                    }));
                    break;
                }
            }
            _ => {}
        }
    }

    if entity.is_some() {
        // Strip Angora decorators from the AST class
        class.decorators.retain(|d| match &d.expression {
            oxc_ast::ast::Expression::CallExpression(call) => {
                if let oxc_ast::ast::Expression::Identifier(id) = &call.callee {
                    let n = id.name.as_str();
                    return n != "Component"
                        && n != "Directive"
                        && n != "Pipe"
                        && n != "Injectable";
                }
                true
            }
            oxc_ast::ast::Expression::Identifier(id) => {
                let n = id.name.as_str();
                n != "Injectable" && n != "Component"
            }
            oxc_ast::ast::Expression::TaggedTemplateExpression(tagged) => {
                if let oxc_ast::ast::Expression::Identifier(id) = &tagged.tag {
                    let n = id.name.as_str();
                    return n != "Component";
                }
                true
            }
            _ => true,
        });
    }

    entity
}

/// Transforms an Angora source file by compiling components, directives, pipes, and injectables
/// into pure zero-decorator TypeScript/JavaScript code using pure OXC AST.
pub fn transform_component(source: &str) -> Result<String, String> {
    transform_component_with_path(source, None)
}

/// Transforms an Angora source file with a specified base file path to resolve external templateUrl and styleUrls.
pub fn transform_component_with_path(
    source: &str,
    file_path: Option<&str>,
) -> Result<String, String> {
    // Fast path: if no Angora decorator token at all, skip parsing
    let has_angora_decorator = source.contains("@Component")
        || source.contains("@Directive")
        || source.contains("@Pipe")
        || source.contains("@Injectable");

    if !has_angora_decorator {
        return Ok(source.to_string());
    }

    let allocator = Allocator::default();
    let source_type = SourceType::ts();
    let mut parser_ret = Parser::new(&allocator, source, source_type).parse();

    if parser_ret.panicked {
        let err_msg = parser_ret
            .diagnostics
            .iter()
            .map(|e| format!("{:?}", e))
            .collect::<Vec<_>>()
            .join("; ");
        return Err(format!("OXC Parser panicked: {}", err_msg));
    }

    let mut entities = Vec::new();
    let mut needs_runtime = false;

    // Collect all candidate imported value symbols
    let mut imported_symbols = Vec::new();
    for stmt in &parser_ret.program.body {
        if let Statement::ImportDeclaration(import_decl) = stmt {
            if import_decl.import_kind.is_type() {
                continue;
            }
            if let Some(specifiers) = &import_decl.specifiers {
                for spec in specifiers {
                    match spec {
                        ImportDeclarationSpecifier::ImportSpecifier(s) => {
                            if !s.import_kind.is_type() {
                                imported_symbols.push(s.local.name.to_string());
                            }
                        }
                        ImportDeclarationSpecifier::ImportDefaultSpecifier(s) => {
                            imported_symbols.push(s.local.name.to_string());
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    // Also collect local classes decorated with @Component, @Directive, or @Pipe
    let mut local_entity_names = Vec::new();
    for stmt in &parser_ret.program.body {
        let cls_opt = match stmt {
            Statement::ExportDeclaration(decl) => {
                if let Declaration::ClassDeclaration(c) = &decl.declaration {
                    Some(c.as_ref())
                } else {
                    None
                }
            }
            Statement::ClassDeclaration(c) => Some(c.as_ref()),
            Statement::ExportDefaultDeclaration(decl) => {
                if let ExportDefaultDeclarationKind::ClassDeclaration(c) = &decl.declaration {
                    Some(c.as_ref())
                } else {
                    None
                }
            }
            _ => None,
        };
        if let Some(cls) = cls_opt {
            for dec in &cls.decorators {
                if let Expression::CallExpression(call) = &dec.expression {
                    if let Expression::Identifier(id) = &call.callee {
                        if matches!(id.name.as_str(), "Component" | "Directive" | "Pipe") {
                            if let Some(cls_id) = &cls.id {
                                local_entity_names.push(cls_id.name.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    // Traverse AST statements to discover classes with decorators and strip them
    for stmt in parser_ret.program.body.iter_mut() {
        let class_opt = match stmt {
            oxc_ast::ast::Statement::ExportDeclaration(decl) => {
                if let oxc_ast::ast::Declaration::ClassDeclaration(class) = &mut decl.declaration {
                    Some(class.as_mut())
                } else {
                    None
                }
            }
            oxc_ast::ast::Statement::ClassDeclaration(class) => Some(class.as_mut()),
            oxc_ast::ast::Statement::ExportDefaultDeclaration(decl) => {
                if let oxc_ast::ast::ExportDefaultDeclarationKind::ClassDeclaration(class) =
                    &mut decl.declaration
                {
                    Some(class.as_mut())
                } else {
                    None
                }
            }
            _ => None,
        };

        if let Some(class) = class_opt {
            if let Some(entity) = extract_entity_metadata(class, source, file_path) {
                let static_snippet = match &entity {
                    TransformedEntity::Component(comp) => {
                        needs_runtime = true;

                        let (styles_str, scope_id, scoped_css_literal) =
                            if !comp.styles_raw.is_empty() {
                                let clean_sel =
                                    comp.selector.replace(|c: char| !c.is_alphanumeric(), "-");
                                let s_id = format!("_angora-{}", clean_sel);
                                let combined = comp.styles_raw.join("\n");
                                let scoped = crate::css::scope_css(&combined, &s_id);
                                let scoped_json = serde_json::to_string(&scoped)
                                    .unwrap_or_else(|_| "\"\"".to_string());
                                (format!("[{}]", scoped_json), Some(s_id), Some(scoped_json))
                            } else {
                                ("[]".to_string(), None, None)
                            };

                        let template_ast = parse_template(&comp.template);
                        let render_fn_body = crate::codegen::compile_template_with_scope(
                            &template_ast,
                            scope_id.as_deref(),
                        );
                        let ssr_render_fn_body = crate::ssr_codegen::compile_ssr_template(
                            &template_ast,
                            scope_id.as_deref(),
                        );

                        let final_imports = match &comp.imports_str {
                            Some(s) if s.trim() != "[]" => s.clone(),
                            _ => {
                                let mut tags = HashSet::new();
                                let mut attrs = HashSet::new();
                                let mut pipes = HashSet::new();
                                collect_template_usages(
                                    &template_ast,
                                    &mut tags,
                                    &mut attrs,
                                    &mut pipes,
                                );

                                let mut auto_imports = Vec::new();
                                let mut seen = HashSet::new();

                                for sym in imported_symbols.iter().chain(local_entity_names.iter())
                                {
                                    if sym == &comp.class_name || seen.contains(sym) {
                                        continue;
                                    }
                                    if matches_candidate(sym, &tags, &attrs, &pipes) {
                                        seen.insert(sym.clone());
                                        auto_imports.push(sym.clone());
                                    }
                                }

                                if auto_imports.is_empty() {
                                    "[]".to_string()
                                } else {
                                    format!("[{}]", auto_imports.join(", "))
                                }
                            }
                        };

                        let sid_val = scope_id
                            .as_ref()
                            .map(|s| format!("'{}'", s))
                            .unwrap_or_else(|| "undefined".to_string());

                        let scope_props = if let (Some(ref sid), Some(ref scoped_json)) =
                            (scope_id.as_ref(), scoped_css_literal.as_ref())
                        {
                            format!(
                                "static __angora_scope_id__ = '{}';\nstatic __angora_styles__ = {};\n",
                                sid, scoped_json
                            )
                        } else if let Some(ref sid) = scope_id {
                            format!("static __angora_scope_id__ = '{}';\n", sid)
                        } else {
                            String::new()
                        };

                        format!(
                            r#"class _AngoraHelper {{
  static ɵcmp = {{
    selector: '{sel}',
    imports: {imp},
    styles: {styles},
    scopeId: {sid_val},
    render: {render},
    ssrRender: {ssr_render},
    type: {cn},
    metadata: {{
      selector: '{sel}',
      imports: {imp},
      styles: {styles},
    }},
  }};
  {scope_props}
}}"#,
                            cn = comp.class_name,
                            sel = comp.selector,
                            imp = final_imports,
                            styles = styles_str,
                            sid_val = sid_val,
                            render = render_fn_body,
                            ssr_render = ssr_render_fn_body,
                            scope_props = scope_props
                        )
                    }
                    TransformedEntity::Directive(dir) => {
                        let host_val = dir.host_str.as_deref().unwrap_or("{}");
                        format!(
                            r#"class _AngoraHelper {{
  static ɵdir = {{
    selector: '{sel}',
    host: {host},
    metadata: {{
      selector: '{sel}',
      host: {host},
    }},
  }};
}}"#,
                            sel = dir.selector,
                            host = host_val
                        )
                    }
                    TransformedEntity::Pipe(pipe) => {
                        format!(
                            r#"class _AngoraHelper {{
  static ɵpipe = {{
    name: '{name}',
    pure: {pure},
    metadata: {{
      name: '{name}',
      pure: {pure},
    }},
  }};
}}"#,
                            name = pipe.name,
                            pure = pipe.pure
                        )
                    }
                    TransformedEntity::Injectable(inj) => {
                        format!(
                            r#"class _AngoraHelper {{
  static ɵprov = {opts};
}}"#,
                            opts = inj.options_str
                        )
                    }
                };

                let allocated_snippet = allocator.alloc_str(&static_snippet);
                let mut helper_parsed =
                    Parser::new(&allocator, allocated_snippet, SourceType::ts()).parse();
                if let Some(oxc_ast::ast::Statement::ClassDeclaration(helper_cls)) =
                    helper_parsed.program.body.first_mut()
                {
                    class.body.body.append(&mut helper_cls.body.body);
                }

                entities.push(entity);
            }
        }
    }

    // If no Angora decorator was matched on any class, return source untouched
    if entities.is_empty() {
        return Ok(source.to_string());
    }

    // Generate clean code from AST with Angora decorators removed and static members injected
    let codegen_out = oxc_codegen::Codegen::new().build(&parser_ret.program);
    let transformed_code = codegen_out.code;

    // Generate style injection attachments if scoped styles are present
    let mut attachments = String::new();
    for entity in &entities {
        if let TransformedEntity::Component(comp) = entity {
            if !comp.styles_raw.is_empty() {
                let clean_sel = comp.selector.replace(|c: char| !c.is_alphanumeric(), "-");
                let s_id = format!("_angora-{}", clean_sel);
                let combined = comp.styles_raw.join("\n");
                let scoped = crate::css::scope_css(&combined, &s_id);
                let scoped_json =
                    serde_json::to_string(&scoped).unwrap_or_else(|_| "\"\"".to_string());
                attachments.push_str(&format!(
                    "\ninjectComponentStyles('{}', {});\n",
                    s_id, scoped_json
                ));
            }

            // Tree-shakable pure IIFE for DevTools debug inspection
            let tmpl_escaped =
                serde_json::to_string(&comp.template).unwrap_or_else(|_| "\"\"".to_string());
            let sid_snippet = if !comp.styles_raw.is_empty() {
                let clean_sel = comp.selector.replace(|c: char| !c.is_alphanumeric(), "-");
                format!("'_angora-{}'", clean_sel)
            } else {
                "undefined".to_string()
            };
            attachments.push_str(&format!(
                r#"
/*@__PURE__*/ (() => {{
  if (typeof ngDevMode === 'undefined' || ngDevMode) {{
    ({cn} as any).ɵcmp.debug = {{
      name: '{cn}',
      selector: '{sel}',
      scopeId: {sid},
      template: {tmpl},
    }};
  }}
}})();
"#,
                cn = comp.class_name,
                sel = comp.selector,
                sid = sid_snippet,
                tmpl = tmpl_escaped
            ));
        }
    }

    let mut prefix_imports = String::new();
    if needs_runtime {
        prefix_imports.push_str("import { createElement, createText, createComment, bindText, bindProp, bindClass, bindStyle, bindTwoWay, bindEvent, createIf, createFor, createSwitch, createDefer, applyPipe, mountComponent, injectComponentStyles, template, applyMatchingDirectives, findImportedComponent, COMPONENT_DEF } from '@angora-js/runtime';\n");
    }

    Ok(format!(
        "{}{}\n{}",
        prefix_imports, transformed_code, attachments
    ))
}
