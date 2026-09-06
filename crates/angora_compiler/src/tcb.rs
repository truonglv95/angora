use crate::ast::*;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// A single source mapping entry connecting a span in the synthetic TCB
/// to the exact span in the original component template HTML.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceMapping {
    pub tcb_start: u32,
    pub tcb_end: u32,
    pub tmpl_start: u32,
    pub tmpl_end: u32,
    pub expression: String,
}

/// The result of synthetic TCB generation including code and source mappings.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TcbResult {
    pub code: String,
    pub mappings: Vec<SourceMapping>,
}

/// Generator for synthetic Type Check Blocks (TCB)
pub struct TypeCheckBlockGenerator {
    statements: Vec<String>,
    mappings: Vec<SourceMapping>,
    var_counter: usize,
    base_offset: u32,
    scope_vars: HashSet<String>,
    component_imports: Vec<String>,
    used_pipes: HashSet<String>,
}

impl TypeCheckBlockGenerator {
    pub fn new(base_offset: u32) -> Self {
        Self::with_imports(base_offset, &[])
    }

    pub fn with_imports(base_offset: u32, imports: &[String]) -> Self {
        Self {
            statements: Vec::new(),
            mappings: Vec::new(),
            var_counter: 0,
            base_offset,
            scope_vars: HashSet::new(),
            component_imports: imports.to_vec(),
            used_pipes: HashSet::new(),
        }
    }

    fn next_var(&mut self) -> String {
        let v = format!("_tcb_{}", self.var_counter);
        self.var_counter += 1;
        v
    }

    pub fn generate(mut self, nodes: &[TemplateNode], class_name: &str) -> TcbResult {
        for node in nodes {
            self.generate_node(node);
        }

        let mut code = String::new();
        code.push_str(&format!(
            "// Synthetic Angora Template Type Check Block\nfunction __angora_tcb_{}(ctx: {}) {{\n",
            class_name, class_name
        ));
        code.push_str("  const __angora_pipe: any = null!;\n");
        code.push_str("  function __angora_check_input<T, K extends keyof T>(_target: T, _key: K, _val: T[K] extends { __set(v: infer V): void } ? V : (T[K] extends (...args: any[]) => infer R ? R : T[K])): void {}\n");
        let mut sorted_pipes: Vec<_> = self.used_pipes.iter().cloned().collect();
        sorted_pipes.sort();
        for pipe_name in &sorted_pipes {
            if let Some(pipe_cls) = resolve_pipe_class(pipe_name, &self.component_imports) {
                code.push_str(&format!(
                    "  const _pipe_{}: {} = null!;\n",
                    pipe_name, pipe_cls
                ));
            } else {
                code.push_str(&format!("  const _pipe_{}: any = null!;\n", pipe_name));
            }
        }

        let func_header_len = code.len() as u32;

        for stmt in &self.statements {
            code.push_str("  ");
            code.push_str(stmt);
            code.push('\n');
        }

        code.push_str("}\n");

        // Adjust mapping offsets by function header
        for m in &mut self.mappings {
            m.tcb_start += func_header_len;
            m.tcb_end += func_header_len;
        }

        TcbResult {
            code,
            mappings: self.mappings,
        }
    }

    fn compile_expr(&mut self, expr: &str) -> String {
        let scope = self.scope_vars.clone();
        self.compile_expr_with_scope(expr, &scope)
    }

    fn compile_expr_with_scope(&mut self, expr: &str, scope: &HashSet<String>) -> String {
        if contains_pipe(expr) {
            let (res, pipes) = compile_pipe_tcb_with_imports(expr, scope, &self.component_imports);
            for p in pipes {
                self.used_pipes.insert(p);
            }
            res
        } else {
            prefix_ctx(expr, scope)
        }
    }

    fn generate_node(&mut self, node: &TemplateNode) {
        match node {
            TemplateNode::Element(el) => self.generate_element(el),
            TemplateNode::Interpolation(interp) => self.generate_interpolation(interp),
            TemplateNode::IfBlock(if_block) => self.generate_if_block(if_block),
            TemplateNode::ForBlock(for_block) => self.generate_for_block(for_block),
            TemplateNode::SwitchBlock(switch_block) => self.generate_switch_block(switch_block),
            TemplateNode::DeferBlock(defer) => self.generate_defer_block(defer),
            TemplateNode::Text(_) => {}
        }
    }

    fn generate_element(&mut self, el: &ElementNode) {
        let matched_comp = if el.name.contains('-') {
            resolve_custom_element_class(&el.name, &self.component_imports)
        } else {
            None
        };

        // 1. Template references: #myInput
        for r in &el.references {
            let ref_type = if let Some(ref comp_cls) = matched_comp {
                comp_cls.as_str()
            } else {
                get_element_type(&el.name)
            };
            let stmt = format!("const {}: {} = null!;", r.name, ref_type);
            self.statements.push(stmt);
            self.scope_vars.insert(r.name.clone());
        }

        let el_type = if let Some(ref comp_cls) = matched_comp {
            comp_cls.as_str()
        } else {
            get_element_type(&el.name)
        };
        let el_var = self.next_var();
        let has_bindings = !el.properties.is_empty() || !el.two_ways.is_empty();

        if has_bindings {
            self.statements
                .push(format!("const {}: {} = null!;", el_var, el_type));
        }

        // 2. Property bindings: [prop]="expr"
        for prop in &el.properties {
            let prefixed = self.compile_expr(&prop.expression);

            let (stmt, expr_offset) = if prop.name.starts_with("class.") || prop.name == "class" {
                let v = self.next_var();
                let s = format!("const {} = ({});", v, prefixed);
                let off = format!("const {} = (", v).len() as u32;
                (s, off)
            } else if prop.name.starts_with("style.") || prop.name == "style" {
                let v = self.next_var();
                let s = format!("const {} = ({});", v, prefixed);
                let off = format!("const {} = (", v).len() as u32;
                (s, off)
            } else if prop.name.starts_with("attr.") {
                let v = self.next_var();
                let s = format!("const {} = ({});", v, prefixed);
                let off = format!("const {} = (", v).len() as u32;
                (s, off)
            } else if el_type == "any" {
                let s = format!("{}.{} = ({});", el_var, prop.name, prefixed);
                let off = format!("{}.{} = (", el_var, prop.name).len() as u32;
                (s, off)
            } else if matched_comp.is_some() {
                let s = format!(
                    "__angora_check_input({}, \"{}\", ({}));",
                    el_var, prop.name, prefixed
                );
                let off =
                    format!("__angora_check_input({}, \"{}\", (", el_var, prop.name).len() as u32;
                (s, off)
            } else if matched_comp.is_none()
                && (prop.name.starts_with("app") || prop.name.starts_with("ng"))
            {
                let s = format!("({} as any).{} = ({});", el_var, prop.name, prefixed);
                let off = format!("({} as any).{} = (", el_var, prop.name).len() as u32;
                (s, off)
            } else if prop.name.contains('-') {
                let quoted_name = serde_json::to_string(&prop.name)
                    .unwrap_or_else(|_| format!("\"{}\"", prop.name));
                let s = format!("{}[{}] = ({});", el_var, quoted_name, prefixed);
                let off = format!("{}[{}] = (", el_var, quoted_name).len() as u32;
                (s, off)
            } else {
                let s = format!("{}.{} = ({});", el_var, prop.name, prefixed);
                let off = format!("{}.{} = (", el_var, prop.name).len() as u32;
                (s, off)
            };

            if let Some(ref span) = prop.span {
                let tcb_stmt_start = self.calc_current_body_len();
                let tcb_start = tcb_stmt_start + expr_offset;
                let tcb_end = tcb_start + prefixed.len() as u32;

                self.mappings.push(SourceMapping {
                    tcb_start,
                    tcb_end,
                    tmpl_start: span.start as u32 + self.base_offset,
                    tmpl_end: span.end as u32 + self.base_offset,
                    expression: prop.expression.clone(),
                });
            }
            self.statements.push(stmt);
        }

        // 3. Two-way bindings: [(ngModel)]="expr" or [(value)]="expr"
        for tw in &el.two_ways {
            let prefixed = self.compile_expr(&tw.expression);
            let prop_name = if tw.name == "ngModel" {
                if el.name.eq_ignore_ascii_case("input")
                    || el.name.eq_ignore_ascii_case("textarea")
                    || el.name.eq_ignore_ascii_case("select")
                {
                    "value"
                } else {
                    "ngModel"
                }
            } else {
                &tw.name
            };

            let (stmt, expr_offset) = if el_type == "any" || prop_name == "ngModel" {
                let v = self.next_var();
                let s = format!("const {} = ({});", v, prefixed);
                let off = format!("const {} = (", v).len() as u32;
                (s, off)
            } else {
                // Support both plain properties and WritableSignals: unwrap if callable
                let s = format!(
                    "{}.{} = ((typeof {} === 'function' ? {}() : {}) as any);",
                    el_var, prop_name, prefixed, prefixed, prefixed
                );
                let off = format!(
                    "{}.{} = ((typeof {} === 'function' ? {}() : ",
                    el_var, prop_name, prefixed, prefixed
                )
                .len() as u32;
                (s, off)
            };

            if let Some(ref span) = tw.span {
                let tcb_stmt_start = self.calc_current_body_len();
                let tcb_start = tcb_stmt_start + expr_offset;
                let tcb_end = tcb_start + prefixed.len() as u32;

                self.mappings.push(SourceMapping {
                    tcb_start,
                    tcb_end,
                    tmpl_start: span.start as u32 + self.base_offset,
                    tmpl_end: span.end as u32 + self.base_offset,
                    expression: tw.expression.clone(),
                });
            }
            self.statements.push(stmt);
        }

        // 4. Event bindings: (click)="handler($event)"
        for ev in &el.events {
            let mut event_scope = self.scope_vars.clone();
            event_scope.insert("$event".to_string());
            let prefixed = self.compile_expr_with_scope(&ev.handler, &event_scope);
            let stmt = format!("($event: any) => {{ ({}); }};", prefixed);
            if let Some(ref span) = ev.span {
                let tcb_stmt_start = self.calc_current_body_len();
                let offset_in_stmt = "($event: any) => { (".len() as u32;
                let tcb_start = tcb_stmt_start + offset_in_stmt;
                let tcb_end = tcb_start + prefixed.len() as u32;

                self.mappings.push(SourceMapping {
                    tcb_start,
                    tcb_end,
                    tmpl_start: span.start as u32 + self.base_offset,
                    tmpl_end: span.end as u32 + self.base_offset,
                    expression: ev.handler.clone(),
                });
            }
            self.statements.push(stmt);
        }

        // 5. Children
        for child in &el.children {
            self.generate_node(child);
        }
    }

    fn generate_interpolation(&mut self, interp: &InterpolationNode) {
        let var_name = self.next_var();
        let prefixed = self.compile_expr(&interp.expression);
        let stmt = format!("const {} = ({});", var_name, prefixed);

        if let Some(ref span) = interp.span {
            let tcb_stmt_start = self.calc_current_body_len();
            let offset_in_stmt = format!("const {} = (", var_name).len() as u32;
            let tcb_start = tcb_stmt_start + offset_in_stmt;
            let tcb_end = tcb_start + prefixed.len() as u32;

            self.mappings.push(SourceMapping {
                tcb_start,
                tcb_end,
                tmpl_start: span.start as u32 + self.base_offset,
                tmpl_end: span.end as u32 + self.base_offset,
                expression: interp.expression.clone(),
            });
        }

        self.statements.push(stmt);
    }

    fn generate_if_block(&mut self, if_block: &IfBlockNode) {
        for branch in &if_block.branches {
            if let Some(ref cond) = branch.condition {
                let prefixed = self.compile_expr(cond);
                let stmt = format!("if ({}) {{", prefixed);

                if let Some(ref span) = branch.span {
                    let tcb_stmt_start = self.calc_current_body_len();
                    let tcb_start = tcb_stmt_start + "if (".len() as u32;
                    let tcb_end = tcb_start + prefixed.len() as u32;

                    self.mappings.push(SourceMapping {
                        tcb_start,
                        tcb_end,
                        tmpl_start: span.start as u32 + self.base_offset,
                        tmpl_end: span.end as u32 + self.base_offset,
                        expression: cond.clone(),
                    });
                }

                self.statements.push(stmt);
            } else {
                self.statements.push("{".to_string());
            }

            for child in &branch.children {
                self.generate_node(child);
            }

            self.statements.push("}".to_string());
        }
    }

    fn generate_for_block(&mut self, for_block: &ForBlockNode) {
        let prev_scope = self.scope_vars.clone();
        self.scope_vars.insert(for_block.item_name.clone());
        self.scope_vars.insert("$index".to_string());
        self.scope_vars.insert("$first".to_string());
        self.scope_vars.insert("$last".to_string());
        self.scope_vars.insert("$even".to_string());
        self.scope_vars.insert("$odd".to_string());
        self.scope_vars.insert("$count".to_string());

        let prefixed_iter = self.compile_expr_with_scope(&for_block.iterable, &prev_scope);
        let for_stmt = format!(
            "for (const [$index, {}] of ({}).entries()) {{",
            for_block.item_name, prefixed_iter
        );

        if let Some(ref span) = for_block.iterable_span {
            let tcb_stmt_start = self.calc_current_body_len();
            let prefix_len =
                format!("for (const [$index, {}] of (", for_block.item_name).len() as u32;
            let tcb_start = tcb_stmt_start + prefix_len;
            let tcb_end = tcb_start + prefixed_iter.len() as u32;

            self.mappings.push(SourceMapping {
                tcb_start,
                tcb_end,
                tmpl_start: span.start as u32 + self.base_offset,
                tmpl_end: span.end as u32 + self.base_offset,
                expression: for_block.iterable.clone(),
            });
        }

        self.statements.push(for_stmt);

        // Define contextual loop helpers
        self.statements
            .push("const $first = $index === 0;".to_string());
        self.statements.push("const $last = false;".to_string());
        self.statements
            .push("const $even = $index % 2 === 0;".to_string());
        self.statements.push("const $odd = !($even);".to_string());
        self.statements.push("const $count = 0;".to_string());

        // Track By expression
        let var_track = self.next_var();
        let prefixed_track = self.compile_expr(&for_block.track_by);
        let track_stmt = format!("const {} = ({});", var_track, prefixed_track);

        if let Some(ref span) = for_block.track_span {
            let tcb_stmt_start = self.calc_current_body_len();
            let offset_in_stmt = format!("const {} = (", var_track).len() as u32;
            let tcb_start = tcb_stmt_start + offset_in_stmt;
            let tcb_end = tcb_start + prefixed_track.len() as u32;

            self.mappings.push(SourceMapping {
                tcb_start,
                tcb_end,
                tmpl_start: span.start as u32 + self.base_offset,
                tmpl_end: span.end as u32 + self.base_offset,
                expression: for_block.track_by.clone(),
            });
        }

        self.statements.push(track_stmt);

        // Body children
        for child in &for_block.children {
            self.generate_node(child);
        }

        self.statements.push("}".to_string());

        // Restore scope
        self.scope_vars = prev_scope;
    }

    fn generate_switch_block(&mut self, switch_block: &SwitchBlockNode) {
        let prefixed = self.compile_expr(&switch_block.expression);
        let switch_stmt = format!("switch ({}) {{", prefixed);

        if let Some(ref span) = switch_block.span {
            let tcb_stmt_start = self.calc_current_body_len();
            let tcb_start = tcb_stmt_start + "switch (".len() as u32;
            let tcb_end = tcb_start + prefixed.len() as u32;

            self.mappings.push(SourceMapping {
                tcb_start,
                tcb_end,
                tmpl_start: span.start as u32 + self.base_offset,
                tmpl_end: span.end as u32 + self.base_offset,
                expression: switch_block.expression.clone(),
            });
        }

        self.statements.push(switch_stmt);

        for c in &switch_block.cases {
            if let Some(ref val) = c.case_value {
                let case_prefixed = self.compile_expr(val);
                let case_stmt = format!("case ({}): {{", case_prefixed);

                if let Some(ref span) = c.span {
                    let tcb_stmt_start = self.calc_current_body_len();
                    let tcb_start = tcb_stmt_start + "case (".len() as u32;
                    let tcb_end = tcb_start + case_prefixed.len() as u32;

                    self.mappings.push(SourceMapping {
                        tcb_start,
                        tcb_end,
                        tmpl_start: span.start as u32 + self.base_offset,
                        tmpl_end: span.end as u32 + self.base_offset,
                        expression: val.clone(),
                    });
                }

                self.statements.push(case_stmt);
            } else {
                self.statements.push("default: {".to_string());
            }

            for child in &c.children {
                self.generate_node(child);
            }

            self.statements.push("}".to_string());
        }

        self.statements.push("}".to_string());
    }

    fn generate_defer_block(&mut self, defer: &DeferBlockNode) {
        for trigger in &defer.triggers {
            if trigger.trigger_type == "when" {
                if let Some(ref when_expr) = trigger.param {
                    let prefixed = self.compile_expr(when_expr);
                    self.statements.push(format!("if ({}) {{", prefixed));
                }
            }
        }

        self.statements.push("{".to_string());
        for child in &defer.main_block {
            self.generate_node(child);
        }
        self.statements.push("}".to_string());

        if let Some(ref pb) = defer.placeholder_block {
            self.statements.push("{".to_string());
            for child in &pb.children {
                self.generate_node(child);
            }
            self.statements.push("}".to_string());
        }

        if let Some(ref lb) = defer.loading_block {
            self.statements.push("{".to_string());
            for child in &lb.children {
                self.generate_node(child);
            }
            self.statements.push("}".to_string());
        }

        if let Some(ref eb) = defer.error_block {
            self.statements.push("{".to_string());
            for child in &eb.children {
                self.generate_node(child);
            }
            self.statements.push("}".to_string());
        }

        for trigger in &defer.triggers {
            if trigger.trigger_type == "when" && trigger.param.is_some() {
                self.statements.push("}".to_string());
            }
        }
    }

    fn calc_current_body_len(&self) -> u32 {
        let mut len = 0u32;
        for s in &self.statements {
            len += 2; // "  " indent
            len += s.len() as u32;
            len += 1; // "\n"
        }
        len
    }
}

/// Determines the standard HTMLElement type for a given HTML tag
fn get_element_type(tag: &str) -> &'static str {
    match tag.to_ascii_lowercase().as_str() {
        "input" => "HTMLInputElement",
        "button" => "HTMLButtonElement",
        "select" => "HTMLSelectElement",
        "textarea" => "HTMLTextAreaElement",
        "form" => "HTMLFormElement",
        "a" => "HTMLAnchorElement",
        "img" => "HTMLImageElement",
        "canvas" => "HTMLCanvasElement",
        "video" => "HTMLVideoElement",
        "audio" => "HTMLAudioElement",
        "table" => "HTMLTableElement",
        "div" => "HTMLDivElement",
        "span" => "HTMLSpanElement",
        "p" => "HTMLParagraphElement",
        "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => "HTMLHeadingElement",
        "ul" | "ol" => "HTMLUListElement",
        "li" => "HTMLLIElement",
        "label" => "HTMLLabelElement",
        "option" => "HTMLOptionElement",
        "dialog" => "HTMLDialogElement",
        "iframe" => "HTMLIFrameElement",
        _ => {
            if tag.contains('-') {
                "any"
            } else {
                "HTMLElement"
            }
        }
    }
}

/// Determines standard DOM event type for a given event name
#[allow(dead_code)]
fn get_event_type(name: &str) -> &'static str {
    match name {
        "click" | "dblclick" | "mousedown" | "mouseup" | "mousemove" => "MouseEvent",
        "keydown" | "keyup" | "keypress" => "KeyboardEvent",
        "submit" | "reset" => "SubmitEvent",
        "input" | "change" => "Event",
        "focus" | "blur" => "FocusEvent",
        "scroll" => "Event",
        "drag" | "dragstart" | "dragend" | "drop" => "DragEvent",
        _ => "any",
    }
}

/// Check if an expression contains top-level template pipe syntax (e.g. `val | uppercase`)
pub fn contains_pipe(expr: &str) -> bool {
    let mut in_quote: Option<char> = None;
    let mut paren_depth: usize = 0;
    let mut bracket_depth: usize = 0;
    let mut brace_depth: usize = 0;
    let chars: Vec<char> = expr.chars().collect();

    for i in 0..chars.len() {
        let ch = chars[i];
        let prev = if i > 0 { Some(chars[i - 1]) } else { None };
        let next = if i + 1 < chars.len() {
            Some(chars[i + 1])
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
            paren_depth += 1;
        } else if ch == ')' {
            paren_depth = paren_depth.saturating_sub(1);
        } else if ch == '[' {
            bracket_depth += 1;
        } else if ch == ']' {
            bracket_depth = bracket_depth.saturating_sub(1);
        } else if ch == '{' {
            brace_depth += 1;
        } else if ch == '}' {
            brace_depth = brace_depth.saturating_sub(1);
        } else if ch == '|' && paren_depth == 0 && bracket_depth == 0 && brace_depth == 0 {
            if prev != Some('|') && next != Some('|') {
                return true;
            }
        }
    }
    false
}

/// Helper to match pipe name against imported symbols (e.g. "uppercase" -> "UpperCasePipe")
pub fn resolve_pipe_class(pipe_name: &str, component_imports: &[String]) -> Option<String> {
    let lower_pipe = pipe_name.to_lowercase();
    let expected_cls = format!("{}pipe", lower_pipe);
    for imp in component_imports {
        let lower_imp = imp.to_lowercase();
        if lower_imp == expected_cls || lower_imp == lower_pipe || lower_imp.contains(&lower_pipe) {
            return Some(imp.clone());
        }
    }
    None
}

/// Helper to match custom element tag against imported component symbols
pub fn resolve_custom_element_class(tag: &str, component_imports: &[String]) -> Option<String> {
    let clean_tag = tag.replace('-', "").to_lowercase();
    let tag_stripped = tag
        .split_once('-')
        .map(|(_, rest)| rest.replace('-', "").to_lowercase())
        .unwrap_or_default();

    // 1. Exact match pass
    for imp in component_imports {
        let clean_imp = imp.replace('-', "").to_lowercase();
        let imp_norm = imp
            .replace("Component", "")
            .replace("Directive", "")
            .replace('-', "")
            .to_lowercase();

        if clean_imp == clean_tag
            || clean_imp == format!("{}component", clean_tag)
            || imp_norm == clean_tag
            || (!tag_stripped.is_empty()
                && (imp_norm == tag_stripped || clean_imp == format!("{}component", tag_stripped)))
        {
            return Some(imp.clone());
        }
    }

    // 2. Substring match pass (preferring longer/more specific match)
    let mut best_match: Option<(usize, String)> = None;
    for imp in component_imports {
        let clean_imp = imp.replace('-', "").to_lowercase();
        let imp_norm = imp
            .replace("Component", "")
            .replace("Directive", "")
            .replace('-', "")
            .to_lowercase();

        if clean_imp.contains(&clean_tag) {
            let len = clean_tag.len();
            if best_match.as_ref().map_or(true, |(bl, _)| len > *bl) {
                best_match = Some((len, imp.clone()));
            }
        } else if !imp_norm.is_empty() && clean_tag.contains(&imp_norm) {
            let len = imp_norm.len();
            if best_match.as_ref().map_or(true, |(bl, _)| len > *bl) {
                best_match = Some((len, imp.clone()));
            }
        }
    }

    best_match.map(|(_, imp)| imp)
}

/// Compiles a pipe expression into a synthetic method call for type checking,
/// tracking used pipes and resolving typed calls when imports are present.
pub fn compile_pipe_tcb_with_imports(
    expr: &str,
    scope_vars: &HashSet<String>,
    component_imports: &[String],
) -> (String, Vec<String>) {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut in_quote: Option<char> = None;
    let mut paren_depth: usize = 0;
    let mut bracket_depth: usize = 0;
    let mut brace_depth: usize = 0;
    let chars: Vec<char> = expr.chars().collect();
    let mut used_pipes = Vec::new();

    for i in 0..chars.len() {
        let ch = chars[i];
        let prev = if i > 0 { Some(chars[i - 1]) } else { None };
        let next = if i + 1 < chars.len() {
            Some(chars[i + 1])
        } else {
            None
        };

        if let Some(q) = in_quote {
            current.push(ch);
            if ch == q && prev != Some('\\') {
                in_quote = None;
            }
        } else if ch == '\'' || ch == '"' || ch == '`' {
            in_quote = Some(ch);
            current.push(ch);
        } else if ch == '(' {
            paren_depth += 1;
            current.push(ch);
        } else if ch == ')' {
            paren_depth = paren_depth.saturating_sub(1);
            current.push(ch);
        } else if ch == '[' {
            bracket_depth += 1;
            current.push(ch);
        } else if ch == ']' {
            bracket_depth = bracket_depth.saturating_sub(1);
            current.push(ch);
        } else if ch == '{' {
            brace_depth += 1;
            current.push(ch);
        } else if ch == '}' {
            brace_depth = brace_depth.saturating_sub(1);
            current.push(ch);
        } else if ch == '|'
            && paren_depth == 0
            && bracket_depth == 0
            && brace_depth == 0
            && prev != Some('|')
            && next != Some('|')
        {
            parts.push(current.trim().to_string());
            current.clear();
        } else {
            current.push(ch);
        }
    }

    if !current.trim().is_empty() {
        parts.push(current.trim().to_string());
    }

    if parts.len() <= 1 {
        return (prefix_ctx(expr, scope_vars), used_pipes);
    }

    let mut result = prefix_ctx(&parts[0], scope_vars);

    for pipe_part in &parts[1..] {
        let mut segments = Vec::new();
        let mut seg_current = String::new();
        let mut seg_quote: Option<char> = None;
        let mut seg_paren: usize = 0;
        let mut seg_bracket: usize = 0;
        let mut seg_brace: usize = 0;
        let pchars: Vec<char> = pipe_part.chars().collect();

        for j in 0..pchars.len() {
            let c = pchars[j];
            let prev_c = if j > 0 { Some(pchars[j - 1]) } else { None };

            if let Some(sq) = seg_quote {
                seg_current.push(c);
                if c == sq && prev_c != Some('\\') {
                    seg_quote = None;
                }
            } else if c == '\'' || c == '"' || c == '`' {
                seg_quote = Some(c);
                seg_current.push(c);
            } else if c == '(' {
                seg_paren += 1;
                seg_current.push(c);
            } else if c == ')' {
                seg_paren = seg_paren.saturating_sub(1);
                seg_current.push(c);
            } else if c == '[' {
                seg_bracket += 1;
                seg_current.push(c);
            } else if c == ']' {
                seg_bracket = seg_bracket.saturating_sub(1);
                seg_current.push(c);
            } else if c == '{' {
                seg_brace += 1;
                seg_current.push(c);
            } else if c == '}' {
                seg_brace = seg_brace.saturating_sub(1);
                seg_current.push(c);
            } else if c == ':' && seg_paren == 0 && seg_bracket == 0 && seg_brace == 0 {
                segments.push(seg_current.trim().to_string());
                seg_current.clear();
            } else {
                seg_current.push(c);
            }
        }

        if !seg_current.trim().is_empty() {
            segments.push(seg_current.trim().to_string());
        }

        if segments.is_empty() {
            continue;
        }

        let pipe_name = segments[0].trim();
        used_pipes.push(pipe_name.to_string());

        let pipe_args: Vec<String> = segments[1..]
            .iter()
            .map(|arg| prefix_ctx(arg, scope_vars))
            .collect();

        let pipe_target = if component_imports.is_empty() {
            "__angora_pipe".to_string()
        } else {
            format!("_pipe_{}", pipe_name)
        };

        if pipe_args.is_empty() {
            result = format!("{}.transform({})", pipe_target, result);
        } else {
            result = format!(
                "{}.transform({}, {})",
                pipe_target,
                result,
                pipe_args.join(", ")
            );
        }
    }

    (result, used_pipes)
}

/// Compiles a pipe expression into a synthetic method call for type checking:
/// `__angora_pipe.transform(val, arg1, arg2)`
pub fn compile_pipe_tcb(expr: &str, scope_vars: &HashSet<String>) -> String {
    compile_pipe_tcb_with_imports(expr, scope_vars, &[]).0
}

/// Prefixes root identifiers in expressions with `ctx.`, preserving string literals,
/// language keywords, and template scope variables (#ref, item, $index).
pub fn prefix_ctx(expr: &str, scope_vars: &HashSet<String>) -> String {
    let mut out = String::with_capacity(expr.len() + 16);
    let chars: Vec<char> = expr.chars().collect();
    let mut i = 0;

    let keywords: HashSet<&'static str> = [
        "true",
        "false",
        "null",
        "undefined",
        "Math",
        "Date",
        "String",
        "Number",
        "Boolean",
        "Array",
        "Object",
        "JSON",
        "ctx",
        "$event",
        "$index",
        "typeof",
        "instanceof",
        "void",
        "in",
        "of",
        "new",
        "this",
        "let",
        "const",
        "var",
    ]
    .into_iter()
    .collect();

    while i < chars.len() {
        let ch = chars[i];

        // 1. String literals: '...', "...", `...`
        if ch == '\'' || ch == '"' || ch == '`' {
            let quote = ch;
            out.push(quote);
            i += 1;
            while i < chars.len() {
                let c = chars[i];
                out.push(c);
                if c == '\\' && i + 1 < chars.len() {
                    i += 1;
                    out.push(chars[i]);
                } else if c == quote {
                    i += 1;
                    break;
                }
                i += 1;
            }
            continue;
        }

        // 2. Member access after dot (e.g. .toasts, .length) -> do not prefix
        if ch == '.' {
            out.push('.');
            i += 1;
            // consume following identifier without prefix
            while i < chars.len()
                && (chars[i].is_alphanumeric() || chars[i] == '_' || chars[i] == '$')
            {
                out.push(chars[i]);
                i += 1;
            }
            continue;
        }

        // 3. Identifiers: start with a-z, A-Z, _, $
        if ch.is_alphabetic() || ch == '_' || ch == '$' {
            let start = i;
            while i < chars.len()
                && (chars[i].is_alphanumeric() || chars[i] == '_' || chars[i] == '$')
            {
                i += 1;
            }
            let ident: String = chars[start..i].iter().collect();

            // Check if preceded by { or , (object literal key candidate)
            let prev_char = {
                let mut p = start;
                let mut found = None;
                while p > 0 {
                    p -= 1;
                    if !chars[p].is_whitespace() {
                        found = Some(chars[p]);
                        break;
                    }
                }
                found
            };

            // Check if followed by : (object literal key candidate)
            let next_char = {
                let mut p = i;
                let mut found = None;
                while p < chars.len() {
                    if !chars[p].is_whitespace() {
                        found = Some(chars[p]);
                        break;
                    }
                    p += 1;
                }
                found
            };

            let is_object_key =
                (prev_char == Some('{') || prev_char == Some(',')) && next_char == Some(':');

            // Check if identifier should be prefixed with ctx.
            if is_object_key || keywords.contains(ident.as_str()) || scope_vars.contains(&ident) {
                out.push_str(&ident);
            } else {
                out.push_str("ctx.");
                out.push_str(&ident);
            }
            continue;
        }

        out.push(ch);
        i += 1;
    }

    out
}

/// Generates a Synthetic Type Check Block for given AST nodes
pub fn generate_type_check_block(
    nodes: &[TemplateNode],
    class_name: &str,
    base_offset: u32,
) -> TcbResult {
    generate_type_check_block_with_imports(nodes, class_name, base_offset, &[])
}

/// Generates a Synthetic Type Check Block for given AST nodes with component imports
pub fn generate_type_check_block_with_imports(
    nodes: &[TemplateNode],
    class_name: &str,
    base_offset: u32,
    imports: &[String],
) -> TcbResult {
    TypeCheckBlockGenerator::with_imports(base_offset, imports).generate(nodes, class_name)
}

/// Convenience helper to parse template string and generate TCB directly
pub fn generate_tcb_from_source(template: &str, class_name: &str, base_offset: u32) -> TcbResult {
    generate_tcb_from_source_with_imports(template, class_name, base_offset, &[])
}

/// Convenience helper to parse template string and generate TCB directly with component imports
pub fn generate_tcb_from_source_with_imports(
    template: &str,
    class_name: &str,
    base_offset: u32,
    imports: &[String],
) -> TcbResult {
    let mut parser = crate::parser::TemplateParser::new(template);
    let ast = parser.parse();
    generate_type_check_block_with_imports(&ast, class_name, base_offset, imports)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_prefix_ctx() {
        let mut scope = HashSet::new();
        scope.insert("item".to_string());
        scope.insert("$index".to_string());

        assert_eq!(
            prefix_ctx("toastService.toasts().length > 0", &scope),
            "ctx.toastService.toasts().length > 0"
        );
        assert_eq!(
            prefix_ctx("item.type === 'info'", &scope),
            "item.type === 'info'"
        );
        assert_eq!(
            prefix_ctx("toastService.dismiss(item.id)", &scope),
            "ctx.toastService.dismiss(item.id)"
        );
        assert_eq!(
            prefix_ctx("isLocked() ? 'locked' : 'open'", &scope),
            "ctx.isLocked() ? 'locked' : 'open'"
        );
    }

    #[test]
    fn test_generate_tcb_from_template() {
        let template = r#"
            @if (toastService.toasts().length > 0) {
                <div class="toast-container">
                    @for (item of toastService.toasts(); track item.id) {
                        <span>{{ item.message }}</span>
                        <button (click)="toastService.dismiss(item.id)">Close</button>
                    }
                </div>
            }
        "#;

        let res = generate_tcb_from_source(template, "ToastContainerComponent", 0);
        println!("Generated TCB:\n{}", res.code);

        assert!(res.code.contains(
            "function __angora_tcb_ToastContainerComponent(ctx: ToastContainerComponent)"
        ));
        assert!(res.code.contains("const __angora_pipe: any = null!;"));
        assert!(res
            .code
            .contains("if (ctx.toastService.toasts().length > 0)"));
        assert!(res
            .code
            .contains("for (const [$index, item] of (ctx.toastService.toasts()).entries())"));
        assert!(res.code.contains("ctx.toastService.dismiss(item.id)"));
        assert!(!res.code.contains("ctx.item")); // item must NOT be prefixed with ctx.
        assert!(!res.mappings.is_empty());
    }

    #[test]
    fn test_tcb_typed_element_assignment() {
        let template = r#"<button [disabled]="toastService.toasts().length > 0" [title]="title">Click</button>"#;
        let res = generate_tcb_from_source(template, "MyComponent", 0);
        println!("Typed Button TCB:\n{}", res.code);

        assert!(res.code.contains("HTMLButtonElement = null!;"));
        assert!(res
            .code
            .contains(".disabled = (ctx.toastService.toasts().length > 0);"));
        assert!(res.code.contains(".title = (ctx.title);"));

        // Check source mappings exist
        let disabled_map = res
            .mappings
            .iter()
            .find(|m| m.expression == "toastService.toasts().length > 0");
        assert!(disabled_map.is_some());
        let m = disabled_map.unwrap();
        assert_eq!(
            &template[m.tmpl_start as usize..m.tmpl_end as usize],
            "toastService.toasts().length > 0"
        );
    }

    #[test]
    fn test_tcb_pipe_transformation() {
        let template = r#"
            <span>{{ user.birthday | date:'medium' }}</span>
            <p>{{ item.price | currency:'USD':true | uppercase }}</p>
        "#;
        let res = generate_tcb_from_source(template, "MyPipeComponent", 0);
        println!("Pipe TCB:\n{}", res.code);

        assert!(res
            .code
            .contains("__angora_pipe.transform(ctx.user.birthday, 'medium')"));
        assert!(res.code.contains(
            "__angora_pipe.transform(__angora_pipe.transform(ctx.item.price, 'USD', true))"
        ));
    }

    #[test]
    fn test_tcb_switch_block() {
        let template = r#"
            @switch (status()) {
                @case ('active') {
                    <span>Active</span>
                }
                @default {
                    <span>Inactive</span>
                }
            }
        "#;
        let res = generate_tcb_from_source(template, "SwitchComponent", 0);
        println!("Switch TCB:\n{}", res.code);

        assert!(res.code.contains("switch (ctx.status())"));
        assert!(res.code.contains("case ('active'):"));
        assert!(res.code.contains("default:"));
    }

    #[test]
    fn test_tcb_template_reference_typing() {
        let template = r#"
            <input #searchInput type="text" />
            <button (click)="onSearch(searchInput.value)">Search</button>
        "#;
        let res = generate_tcb_from_source(template, "SearchComponent", 0);
        println!("Template Reference TCB:\n{}", res.code);

        assert!(res
            .code
            .contains("const searchInput: HTMLInputElement = null!;"));
        assert!(res.code.contains("ctx.onSearch(searchInput.value)"));
        assert!(!res.code.contains("ctx.searchInput"));
    }

    #[test]
    fn test_tcb_two_way_binding() {
        let template = r#"
            <input [(ngModel)]="username" />
            <select [(value)]="selectedOption">
                <option value="1">Option 1</option>
            </select>
        "#;
        let res = generate_tcb_from_source(template, "FormComponent", 0);
        println!("Two-Way Binding TCB:\n{}", res.code);

        assert!(res.code.contains(".value = ((typeof ctx.username === 'function' ? ctx.username() : ctx.username) as any);"));
        assert!(res.code.contains(".value = ((typeof ctx.selectedOption === 'function' ? ctx.selectedOption() : ctx.selectedOption) as any);"));
    }

    #[test]
    fn test_tcb_for_loop_context_variables() {
        let template = r#"
            @for (item of products(); track item.id) {
                <span>Item {{ $index + 1 }} of {{ $count }}: {{ item.title }} (First: {{ $first }}, Last: {{ $last }})</span>
            }
        "#;
        let res = generate_tcb_from_source(template, "LoopComponent", 0);
        println!("Loop Context Variables TCB:\n{}", res.code);

        assert!(res.code.contains("$index + 1"));
        assert!(res.code.contains("$count"));
        assert!(res.code.contains("$first"));
        assert!(res.code.contains("$last"));
        assert!(!res.code.contains("ctx.$index"));
        assert!(!res.code.contains("ctx.$count"));
        assert!(!res.code.contains("ctx.$first"));
        assert!(!res.code.contains("ctx.$last"));
        assert!(!res.code.contains("ctx.item"));
        assert!(res.code.contains("item.title"));
    }
}
