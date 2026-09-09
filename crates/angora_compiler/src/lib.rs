#![allow(clippy::all)]

pub mod ast;
pub mod codegen;
pub mod constants;
pub mod css;
pub mod lsp;
pub mod parser;
pub mod tcb;
pub mod transform;

pub use ast::*;
pub use codegen::{compile_template, compile_template_with_scope};
pub use lsp::{
    analyze_components_lsp, analyze_single_file_lsp, LspAnalysisResult, LspComponentAnalysis,
    LspImportInfo, LspMethodInfo, LspPosition, LspPropertyInfo, LspRange, LspTemplateInfo,
    LspTypeDefInfo, LspTypeMemberInfo,
};
pub use parser::parse_template;
pub use tcb::{
    generate_tcb_from_source, generate_tcb_from_source_with_imports, generate_type_check_block,
    generate_type_check_block_with_imports, SourceMapping, TcbResult,
};
pub use transform::transform_component;

use oxc_allocator::Allocator;
use oxc_parser::Parser;
use oxc_span::SourceType;

/// Compiles an Angora component source using OXC and template transformation
pub struct AngoraCompiler {
    // Shared compiler configuration
}

impl Default for AngoraCompiler {
    fn default() -> Self {
        Self::new()
    }
}

impl AngoraCompiler {
    pub fn new() -> Self {
        Self {}
    }

    /// Parse TypeScript source using OXC's high performance AST parser
    pub fn parse_ts_source<'a>(
        &self,
        allocator: &'a Allocator,
        source: &'a str,
    ) -> oxc_parser::ParserReturn<'a> {
        let source_type = SourceType::ts();
        Parser::new(allocator, source, source_type).parse()
    }

    /// Full component transformation
    pub fn transform(&self, source: &str) -> Result<String, String> {
        transform_component(source)
    }
}

#[cfg(feature = "napi-binding")]
pub mod napi_export {
    use super::*;
    use napi_derive::napi;

    #[napi]
    pub fn transform_sync(source: String) -> Result<String, napi::Error> {
        transform_component(&source).map_err(|e| napi::Error::from_reason(e))
    }

    #[napi]
    pub fn parse_template_sync(template: String) -> Result<String, napi::Error> {
        let ast = parse_template(&template);
        serde_json::to_string(&ast).map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    #[napi]
    pub fn compile_template_sync(
        template: String,
        scope_id: Option<String>,
    ) -> Result<String, napi::Error> {
        let ast = parse_template(&template);
        Ok(codegen::compile_template_with_scope(
            &ast,
            scope_id.as_deref(),
        ))
    }

    #[napi]
    pub fn scope_css_sync(css: String, scope_id: String) -> String {
        css::scope_css(&css, &scope_id)
    }

    #[napi]
    pub fn generate_tcb_sync(
        template: String,
        class_name: String,
        base_offset: Option<u32>,
    ) -> Result<String, napi::Error> {
        let res = tcb::generate_tcb_from_source(&template, &class_name, base_offset.unwrap_or(0));
        serde_json::to_string(&res).map_err(|e| napi::Error::from_reason(e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_oxc_parser_integration() {
        let allocator = Allocator::default();
        let compiler = AngoraCompiler::new();
        let source = r#"
            const count = signal(10);
            export class MyComponent {}
        "#;

        let mut ret = compiler.parse_ts_source(&allocator, source);
        assert!(!ret.panicked);
        assert!(ret.diagnostics.is_empty());
        assert_eq!(ret.program.body.len(), 2);

        let dummy_source = "class _Dummy { static ɵpipe = { name: 'test', pure: true }; }";
        let mut dummy_ret = compiler.parse_ts_source(&allocator, dummy_source);
        if let oxc_ast::ast::Statement::ClassDeclaration(dummy_class) =
            &mut dummy_ret.program.body[0]
        {
            if let oxc_ast::ast::Statement::ExportDeclaration(export_decl) =
                &mut ret.program.body[1]
            {
                if let oxc_ast::ast::Declaration::ClassDeclaration(my_class) =
                    &mut export_decl.declaration
                {
                    my_class.body.body.append(&mut dummy_class.body.body);
                }
            }
        }

        let codegen = oxc_codegen::Codegen::new().build(&ret.program);
        println!("Codegen with injected static element:\n{}", codegen.code);
        assert!(codegen.code.contains("static ɵpipe ="));
    }

    #[test]
    fn test_rust_component_transform_with_comments_and_styles() {
        let source = r#"
            import { Component, signal } from '@angora-js/core';
            import { CommonModule } from '@angora-js/common';

            // Pre-class comment
            @Component({
                selector: 'app-styled',
                template: `<div class="styled"><p>{{ message() }}</p></div>`,
                styles: [
                    `.styled { color: red; }`,
                    `p { font-size: 16px; }`
                ],
                imports: [CommonModule]
            })
            export class StyledComponent {
                message = signal('Hello AST');
            }
        "#;

        let result = transform_component(source).expect("Transform failed");
        assert!(result.contains("static ɵcmp"));
        assert!(result.contains("createElement"));
        assert!(result.contains("injectComponentStyles"));
        assert!(result.contains("_angora-app-styled"));
        assert!(result.contains("[CommonModule]"));
        assert!(!result.contains("@Component"));
        assert!(result.contains("export class StyledComponent"));
    }

    #[test]
    fn test_rust_template_parser_and_codegen() {
        let template = r#"
            <div class="card">
                <h1>{{ title() }}</h1>
                @if (count() > 0) {
                    <p>Active</p>
                }
                @for (item of items(); track item.id) {
                    <span>{{ item.name }}</span>
                }
            </div>
        "#;

        let ast = parse_template(template);
        assert_eq!(ast.len(), 1);

        let code = compile_template(&ast);
        assert!(code.contains("template("));
        assert!(code.contains("createIf("));
        assert!(code.contains("createFor("));
        assert!(code.contains("bindText("));
    }

    #[test]
    fn test_rust_component_transform() {
        let source = r#"
            import { Component, signal } from '@angora-js/core';

            @Component({
                selector: 'app-counter',
                template: `<button (click)="increment()">{{ count() }}</button>`
            })
            export class CounterComponent {
                count = signal(0);
                increment() { this.count.update(c => c + 1); }
            }
        "#;

        let result = transform_component(source).expect("Transform failed");
        assert!(result.contains("static ɵcmp"));
        assert!(result.contains("template"));
        assert!(!result.contains("@Component"));
    }

    #[test]
    fn test_rust_directive_transform() {
        let source = r#"
            import { Directive, signal } from '@angora-js/core';

            @Directive({
                selector: '[appTooltip]',
                host: {
                    '(mouseenter)': 'onMouseEnter()',
                    '(mouseleave)': 'onMouseLeave()'
                }
            })
            export class TooltipDirective {
                visible = signal(false);
                onMouseEnter() { this.visible.set(true); }
                onMouseLeave() { this.visible.set(false); }
            }
        "#;

        let result = transform_component(source).expect("Directive transform failed");
        assert!(result.contains("static ɵdir"));
        assert!(result.contains("appTooltip"));
        assert!(result.contains("onMouseEnter"));
        assert!(result.contains("export class TooltipDirective"));
        assert!(!result.contains("@Directive"));
        assert!(!result.contains("as any"));
    }

    #[test]
    fn test_rust_pipe_transform() {
        let source = r#"
            import { Pipe, PipeTransform } from '@angora-js/core';

            @Pipe({
                name: 'truncate',
                pure: true
            })
            export class TruncatePipe implements PipeTransform {
                transform(value: string, limit: number = 20): string {
                    return value.length > limit ? value.slice(0, limit) + '...' : value;
                }
            }
        "#;

        let result = transform_component(source).expect("Pipe transform failed");
        assert!(result.contains("static ɵpipe"));
        assert!(result.contains("truncate"));
        assert!(result.contains("pure: true"));
        assert!(result.contains("export class TruncatePipe"));
        assert!(!result.contains("@Pipe"));
        assert!(!result.contains("as any"));
    }

    #[test]
    fn test_rust_injectable_transform() {
        let source = r#"
            import { Injectable, signal } from '@angora-js/core';

            @Injectable({ providedIn: 'root' })
            export class AuthService {
                currentUser = signal(null);
            }
        "#;

        let result = transform_component(source).expect("Injectable transform failed");
        assert!(result.contains("static ɵprov"));
        assert!(result.contains("root"));
        assert!(result.contains("export class AuthService"));
        assert!(!result.contains("@Injectable"));
        assert!(!result.contains("as any"));
    }

    #[test]
    fn test_rust_auto_imports_and_auto_selector() {
        let source = r#"
            import { Component, signal } from '@angora-js/core';
            import { UpperCasePipe, DatePipe } from '@angora-js/core';
            import { UserAvatarComponent } from './avatar';
            import { HighlightDirective } from './highlight';
            import type { UserProfile } from './models';

            @Component({
                template: `
                    <user-avatar-component></user-avatar-component>
                    <div highlight-directive>{{ name() | uppercase }} - {{ today() | date }}</div>
                `
            })
            export class DashboardPage {
                name = signal('angora');
                today = signal(new Date());
            }
        "#;

        let result = transform_component(source).expect("Transform failed");
        // Selector should be auto-derived to kebab-case
        assert!(result.contains("selector: 'dashboard-page'"));
        // Imports should be auto-populated with UpperCasePipe, DatePipe, UserAvatarComponent, HighlightDirective
        assert!(result.contains("UpperCasePipe"));
        assert!(result.contains("DatePipe"));
        assert!(result.contains("UserAvatarComponent"));
        assert!(result.contains("HighlightDirective"));

        // Extract the imports: [...] snippet
        let imports_line = result
            .lines()
            .find(|l| l.contains("imports: ["))
            .unwrap_or("");
        assert!(!imports_line.contains("UserProfile"));
        assert!(!imports_line.contains("Component"));
        assert!(!imports_line.contains("signal"));
        assert!(!result.contains("@Component"));
    }
}
