use oxc_allocator::{Allocator, GetAllocator};
use oxc_ast::ast::*;
use oxc_ast::builder::AstBuilder;
use oxc_ast_visit::{walk_mut, VisitMut};
use oxc_codegen::Codegen;
use oxc_parser::{ParseOptions, Parser};
use oxc_span::{SourceType, SPAN};
use std::collections::HashSet;

/// Keyword and global identifiers that should NEVER be prefixed with `ctx.`.
fn is_global_or_keyword(name: &str) -> bool {
    matches!(
        name,
        "true"
            | "false"
            | "null"
            | "undefined"
            | "NaN"
            | "Infinity"
            | "globalThis"
            | "window"
            | "document"
            | "console"
            | "Math"
            | "Date"
            | "String"
            | "Number"
            | "Boolean"
            | "Array"
            | "Object"
            | "JSON"
            | "RegExp"
            | "Map"
            | "Set"
            | "Promise"
            | "Symbol"
            | "Error"
            | "parseInt"
            | "parseFloat"
            | "isNaN"
            | "isFinite"
            | "encodeURI"
            | "decodeURI"
            | "encodeURIComponent"
            | "decodeURIComponent"
            | "ctx"
            | "injector"
            | "rootNode"
            | "$event"
            | "this"
            | "arguments"
    )
}

pub struct AstExprTransformer<'a> {
    builder: AstBuilder<'a>,
    scopes: Vec<HashSet<String>>,
    in_call_callee: bool,
}

impl<'a> AstExprTransformer<'a> {
    pub fn new(allocator: &'a Allocator, initial_scope: &HashSet<String>) -> Self {
        let builder = AstBuilder::new(allocator);
        Self {
            builder,
            scopes: vec![initial_scope.clone()],
            in_call_callee: false,
        }
    }

    fn is_in_scope(&self, name: &str) -> bool {
        for scope in self.scopes.iter().rev() {
            if scope.contains(name) {
                return true;
            }
        }
        false
    }

    fn push_scope(&mut self) {
        self.scopes.push(HashSet::new());
    }

    fn pop_scope(&mut self) {
        self.scopes.pop();
    }

    fn add_to_current_scope(&mut self, name: String) {
        if let Some(scope) = self.scopes.last_mut() {
            scope.insert(name);
        }
    }

    fn collect_binding_identifiers(&mut self, pattern: &BindingPattern<'a>) {
        match pattern {
            BindingPattern::BindingIdentifier(id) => {
                self.add_to_current_scope(id.name.to_string());
            }
            BindingPattern::ObjectPattern(obj) => {
                for prop in &obj.properties {
                    self.collect_binding_identifiers(&prop.value);
                }
                if let Some(rest) = &obj.rest {
                    self.collect_binding_identifiers(&rest.argument);
                }
            }
            BindingPattern::ArrayPattern(arr) => {
                for elem in &arr.elements {
                    if let Some(p) = elem {
                        self.collect_binding_identifiers(p);
                    }
                }
                if let Some(rest) = &arr.rest {
                    self.collect_binding_identifiers(&rest.argument);
                }
            }
            BindingPattern::AssignmentPattern(assign) => {
                self.collect_binding_identifiers(&assign.left);
            }
        }
    }
}

impl<'a> VisitMut<'a> for AstExprTransformer<'a> {
    fn visit_arrow_function_expression(&mut self, expr: &mut ArrowFunctionExpression<'a>) {
        self.push_scope();
        for param in &expr.params.items {
            self.collect_binding_identifiers(&param.pattern);
        }
        walk_mut::walk_arrow_function_expression(self, expr);
        self.pop_scope();
    }

    fn visit_object_property(&mut self, prop: &mut ObjectProperty<'a>) {
        // If property is shorthand `{ count }`, expanding `count` to `ctx.count` means it is no longer shorthand!
        if prop.shorthand {
            if let Expression::Identifier(ref id) = prop.value {
                let name = id.name.as_str();
                if !self.is_in_scope(name) && !is_global_or_keyword(name) {
                    prop.shorthand = false;
                }
            }
        }
        walk_mut::walk_object_property(self, prop);
    }

    fn visit_call_expression(&mut self, call: &mut CallExpression<'a>) {
        // Visit callee with in_call_callee = true (to prevent turning $index() into $index()())
        let prev_in_callee = self.in_call_callee;
        self.in_call_callee = true;
        self.visit_expression(&mut call.callee);
        self.in_call_callee = prev_in_callee;

        for arg in &mut call.arguments {
            match arg {
                Argument::SpreadElement(spread) => {
                    self.visit_expression(&mut spread.argument);
                }
                _ => {
                    let expr = arg.to_expression_mut();
                    self.visit_expression(expr);
                }
            }
        }
    }

    fn visit_expression(&mut self, expr: &mut Expression<'a>) {
        match expr {
            Expression::Identifier(id) => {
                let name = id.name.as_str();
                // Special handling for Angular loop context variable $index
                if name == "$index" {
                    if self.is_in_scope("$index") {
                        if !self.in_call_callee {
                            // Transform `$index` -> `$index()`
                            let callee =
                                crate::ast_builder_utils::ident_expr(&self.builder, "$index");
                            let args = oxc_allocator::Vec::new_in(&self.builder);
                            let call =
                                crate::ast_builder_utils::call_expr(&self.builder, callee, args);
                            *expr = call;
                            return;
                        }
                        return;
                    }
                }

                // If identifier is local or global/keyword, keep as is
                if self.is_in_scope(name) || is_global_or_keyword(name) {
                    return;
                }

                // Otherwise, prefix with `ctx.`
                let obj = crate::ast_builder_utils::ident_expr(&self.builder, "ctx");
                let prop_a = self.builder.allocator().alloc_str(name);
                let member = Expression::new_static_member_expression(
                    SPAN,
                    obj,
                    IdentifierName::new(SPAN, prop_a, &self.builder),
                    false,
                    &self.builder,
                );
                *expr = member;
            }
            _ => {
                walk_mut::walk_expression(self, expr);
            }
        }
    }
}

/// Transform a JavaScript/TypeScript expression string by prefixing free identifiers with `ctx.`.
///
/// Uses OXC AST parser, visitor, and codegen for 100% semantic accuracy.
/// Falls back to character-based scanning if the expression cannot be parsed.
pub fn transform_expr_ast(expr: &str, scope_vars: &HashSet<String>) -> Option<String> {
    let trimmed = expr.trim();
    if trimmed.is_empty() {
        return Some(String::new());
    }

    let allocator = Allocator::default();
    let is_object_literal = trimmed.starts_with('{') && trimmed.ends_with('}');
    let source = if is_object_literal {
        format!("({})", trimmed)
    } else {
        trimmed.to_string()
    };

    let source_a = allocator.alloc_str(&source);
    let options = ParseOptions {
        allow_return_outside_function: true,
        ..ParseOptions::default()
    };

    let mut parsed = Parser::new(&allocator, source_a, SourceType::ts())
        .with_options(options)
        .parse();

    if !parsed.diagnostics.is_empty() {
        return None;
    }

    let mut transformer = AstExprTransformer::new(&allocator, scope_vars);
    transformer.visit_program(&mut parsed.program);

    let codegen = Codegen::new();
    let result_program = codegen.build(&parsed.program).code;
    let mut out = result_program.trim();

    // Strip trailing semicolon added by Program statement codegen if original didn't have it
    if out.ends_with(';') && !trimmed.ends_with(';') {
        out = &out[..out.len() - 1];
    }

    // If we wrapped in parentheses, strip the outer parens if appropriate
    let final_str = if is_object_literal && out.starts_with('(') && out.ends_with(')') {
        out[1..out.len() - 1].trim().to_string()
    } else {
        out.trim().to_string()
    };

    Some(final_str)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ast_expr_basic_identifiers() {
        let scope = HashSet::new();
        assert_eq!(
            transform_expr_ast("user.name", &scope).unwrap(),
            "ctx.user.name"
        );
        assert_eq!(
            transform_expr_ast("count() + 1", &scope).unwrap(),
            "ctx.count() + 1"
        );
        assert_eq!(
            transform_expr_ast("a > 10 ? b : c", &scope).unwrap(),
            "ctx.a > 10 ? ctx.b : ctx.c"
        );
    }

    #[test]
    fn test_ast_expr_arrow_function_and_nested_scope() {
        let scope = HashSet::new();
        // `x` is an arrow parameter, so `x.id` must NOT be prefixed with `ctx.`,
        // while `items` must be prefixed with `ctx.items`!
        let res = transform_expr_ast("items.map(x => x.id)", &scope).unwrap();
        assert_eq!(res, "ctx.items.map((x) => x.id)");

        // Destructuring parameter in arrow function
        let res2 = transform_expr_ast("items.filter(({ id, active }) => id > 0 && active)", &scope)
            .unwrap();
        assert_eq!(
            res2,
            "ctx.items.filter(({ id, active }) => id > 0 && active)"
        );
    }

    #[test]
    fn test_ast_expr_object_literals() {
        let scope = HashSet::new();
        let res = transform_expr_ast("{ active: isActive, count: 5 }", &scope).unwrap();
        assert!(res.contains("active: ctx.isActive"));
        assert!(res.contains("count: 5"));
        assert!(res.starts_with('{') && res.ends_with('}'));

        // Object with shorthand property { count }
        let res2 = transform_expr_ast("{ count }", &scope).unwrap();
        assert!(res2.contains("count: ctx.count"));
        assert!(res2.starts_with('{') && res2.ends_with('}'));
    }

    #[test]
    fn test_ast_expr_scope_vars_and_loop_context() {
        let mut scope = HashSet::new();
        scope.insert("item".to_string());
        scope.insert("$index".to_string());

        assert_eq!(
            transform_expr_ast("item.name", &scope).unwrap(),
            "item.name"
        );

        // $index referenced as variable -> transformed to $index()
        assert_eq!(
            transform_expr_ast("$index + 1", &scope).unwrap(),
            "$index() + 1"
        );

        // $index already called as function -> kept as $index()
        assert_eq!(
            transform_expr_ast("$index() + 1", &scope).unwrap(),
            "$index() + 1"
        );
    }

    #[test]
    fn test_ast_expr_globals_and_keywords() {
        let scope = HashSet::new();
        assert_eq!(
            transform_expr_ast("Math.max(a, b)", &scope).unwrap(),
            "Math.max(ctx.a, ctx.b)"
        );
        assert_eq!(
            transform_expr_ast("true && !disabled", &scope).unwrap(),
            "true && !ctx.disabled"
        );
        assert_eq!(
            transform_expr_ast("onSave($event)", &scope).unwrap(),
            "ctx.onSave($event)"
        );
    }

    #[test]
    fn test_ast_expr_optional_chaining() {
        let scope = HashSet::new();
        assert_eq!(
            transform_expr_ast("user?.profile?.getName()", &scope).unwrap(),
            "ctx.user?.profile?.getName()"
        );
    }
}
