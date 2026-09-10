use oxc_allocator::{GetAllocator, Vec as ArenaVec};
use oxc_ast::{ast::*, builder::AstBuilder};
use oxc_span::SPAN;

/// Create an Identifier Reference expression: `name`
pub fn ident_expr<'a>(builder: &AstBuilder<'a>, name: &str) -> Expression<'a> {
    let name_a = builder.allocator().alloc_str(name);
    Expression::Identifier(IdentifierReference::boxed(SPAN, name_a, builder))
}

/// Create a String Literal expression: `"value"`
pub fn string_lit<'a>(builder: &AstBuilder<'a>, value: &str) -> Expression<'a> {
    let val_a = builder.allocator().alloc_str(value);
    Expression::StringLiteral(StringLiteral::boxed(SPAN, val_a, None, builder))
}

/// Create a Call Expression: `callee(...args)`
pub fn call_expr<'a>(
    builder: &AstBuilder<'a>,
    callee: Expression<'a>,
    args: ArenaVec<'a, Argument<'a>>,
) -> Expression<'a> {
    Expression::new_call_expression(SPAN, callee, None, args, false, builder)
}

/// Create a Statement wrapping an expression: `expr;`
pub fn stmt_expr<'a>(builder: &AstBuilder<'a>, expr: Expression<'a>) -> Statement<'a> {
    Statement::ExpressionStatement(ExpressionStatement::boxed(SPAN, expr, builder))
}

/// Create a Return Statement: `return ident;`
pub fn stmt_return_ident<'a>(builder: &AstBuilder<'a>, name: &str) -> Statement<'a> {
    Statement::ReturnStatement(ReturnStatement::boxed(
        SPAN,
        Some(ident_expr(builder, name)),
        builder,
    ))
}

/// Create a Call Expression on an identifier: `func_name(...args)`
pub fn call_ident<'a>(
    builder: &AstBuilder<'a>,
    func_name: &str,
    args: ArenaVec<'a, Argument<'a>>,
) -> Expression<'a> {
    let callee = ident_expr(builder, func_name);
    call_expr(builder, callee, args)
}

/// Create a Method Call Statement: `object.method(...args);`
pub fn stmt_call_method<'a>(
    builder: &AstBuilder<'a>,
    object: &str,
    method: &str,
    args: ArenaVec<'a, Argument<'a>>,
) -> Statement<'a> {
    let obj_expr = ident_expr(builder, object);
    let method_a = builder.allocator().alloc_str(method);
    let member_expr = Expression::new_static_member_expression(
        SPAN,
        obj_expr,
        IdentifierName::new(SPAN, method_a, builder),
        false,
        builder,
    );
    let call = call_expr(builder, member_expr, args);
    stmt_expr(builder, call)
}

/// Create a Statement: `parent.appendChild(child);`
pub fn stmt_append_child<'a>(builder: &AstBuilder<'a>, parent: &str, child: &str) -> Statement<'a> {
    let mut args = ArenaVec::new_in(builder);
    args.push(Argument::from(ident_expr(builder, child)));
    stmt_call_method(builder, parent, "appendChild", args)
}

/// Create a Statement: `array.push(item);`
pub fn stmt_push<'a>(builder: &AstBuilder<'a>, array: &str, item: &str) -> Statement<'a> {
    let mut args = ArenaVec::new_in(builder);
    args.push(Argument::from(ident_expr(builder, item)));
    stmt_call_method(builder, array, "push", args)
}

/// Create a Statement: `const var_name = [];`
pub fn stmt_const_empty_array<'a>(builder: &AstBuilder<'a>, var_name: &str) -> Statement<'a> {
    let elements = ArenaVec::new_in(builder);
    let empty_arr = Expression::new_array_expression(SPAN, elements, builder);
    let var_name_a = builder.allocator().alloc_str(var_name);
    let binding = BindingPattern::new_binding_identifier(SPAN, var_name_a, builder);
    let mut decls = ArenaVec::new_in(builder);
    decls.push(VariableDeclarator::new(
        SPAN,
        binding,
        None,
        Some(empty_arr),
        false,
        builder,
    ));
    Statement::VariableDeclaration(VariableDeclaration::boxed(
        SPAN,
        VariableDeclarationKind::Const,
        decls,
        false,
        builder,
    ))
}

/// Create a Statement: `const var_name = func_name();`
pub fn stmt_const_call0<'a>(
    builder: &AstBuilder<'a>,
    var_name: &str,
    func_name: &str,
) -> Statement<'a> {
    let call = call_ident(builder, func_name, ArenaVec::new_in(builder));
    let var_name_a = builder.allocator().alloc_str(var_name);
    let binding = BindingPattern::new_binding_identifier(SPAN, var_name_a, builder);
    let mut decls = ArenaVec::new_in(builder);
    decls.push(VariableDeclarator::new(
        SPAN,
        binding,
        None,
        Some(call),
        false,
        builder,
    ));
    Statement::VariableDeclaration(VariableDeclaration::boxed(
        SPAN,
        VariableDeclarationKind::Const,
        decls,
        false,
        builder,
    ))
}

/// Create a Statement: `const var_name = expr;`
pub fn stmt_const_expr<'a>(
    builder: &AstBuilder<'a>,
    var_name: &str,
    expr: Expression<'a>,
) -> Statement<'a> {
    let var_name_a = builder.allocator().alloc_str(var_name);
    let binding = BindingPattern::new_binding_identifier(SPAN, var_name_a, builder);
    let mut decls = ArenaVec::new_in(builder);
    decls.push(VariableDeclarator::new(
        SPAN,
        binding,
        None,
        Some(expr),
        false,
        builder,
    ));
    Statement::VariableDeclaration(VariableDeclaration::boxed(
        SPAN,
        VariableDeclarationKind::Const,
        decls,
        false,
        builder,
    ))
}

/// Create a Statement: `const var_name = createComment("comment");`
pub fn stmt_create_comment<'a>(
    builder: &AstBuilder<'a>,
    var_name: &str,
    comment: &str,
) -> Statement<'a> {
    let mut args = ArenaVec::new_in(builder);
    args.push(Argument::from(string_lit(builder, comment)));
    let call = call_ident(builder, "createComment", args);
    stmt_const_expr(builder, var_name, call)
}

/// Create an Arrow Function Expression: `() => expr`
pub fn arrow_fn0<'a>(builder: &AstBuilder<'a>, expr: Expression<'a>) -> Expression<'a> {
    let params = FormalParameters::boxed(
        SPAN,
        FormalParameterKind::FormalParameter,
        ArenaVec::new_in(builder),
        None,
        builder,
    );
    let mut stmts = ArenaVec::new_in(builder);
    stmts.push(Statement::ReturnStatement(ReturnStatement::boxed(
        SPAN,
        Some(expr),
        builder,
    )));
    let body = FunctionBody::boxed(SPAN, ArenaVec::new_in(builder), stmts, builder);
    Expression::new_arrow_function_expression(
        SPAN,
        false,
        None,
        params,
        None,
        ArrowFunctionBody::FunctionBody(body),
        builder,
    )
}

/// Create a Statement calling a function: `func_name(...args);`
pub fn stmt_call<'a>(
    builder: &AstBuilder<'a>,
    func_name: &str,
    args: ArenaVec<'a, Argument<'a>>,
) -> Statement<'a> {
    let call = call_ident(builder, func_name, args);
    stmt_expr(builder, call)
}

/// Create a Statement: `bindText(target_var, () => (expr));`
pub fn stmt_bind_text<'a>(
    builder: &AstBuilder<'a>,
    target_var: &str,
    expr: Expression<'a>,
) -> Statement<'a> {
    let fn_expr = arrow_fn0(builder, expr);
    let mut args = ArenaVec::new_in(builder);
    args.push(Argument::from(ident_expr(builder, target_var)));
    args.push(Argument::from(fn_expr));
    stmt_call(builder, "bindText", args)
}
