use crate::ast::*;
use std::collections::HashSet;

fn escape_html_attr(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn escape_html_text(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

enum BindingKind {
    SelfElement(ElementNode),
    Interpolation(String),
    IfBlock(IfBlockNode),
    ForBlock(ForBlockNode),
    SwitchBlock(SwitchBlockNode),
    DeferBlock(DeferBlockNode),
    Slot(Option<String>),
    CustomComponent(ElementNode),
}

struct NodeBinding {
    path: Vec<usize>,
    kind: BindingKind,
}

pub struct CodeGenerator {
    id_counter: usize,
    tmpl_counter: usize,
    pub templates: Vec<(String, String)>,
    statements: Vec<String>,
    pub scope_id: Option<String>,
    has_bound_root_element: bool,
}

impl CodeGenerator {
    pub fn new() -> Self {
        Self {
            id_counter: 0,
            tmpl_counter: 0,
            templates: Vec::new(),
            statements: Vec::new(),
            scope_id: None,
            has_bound_root_element: false,
        }
    }

    pub fn with_scope(scope_id: Option<String>) -> Self {
        Self {
            id_counter: 0,
            tmpl_counter: 0,
            templates: Vec::new(),
            statements: Vec::new(),
            scope_id,
            has_bound_root_element: false,
        }
    }

    fn next_id(&mut self, prefix: &str) -> String {
        let id = format!("_{}_{}", prefix, self.id_counter);
        self.id_counter += 1;
        id
    }

    pub fn generate(&mut self, ast: &[TemplateNode]) -> String {
        self.statements.clear();
        self.templates.clear();
        self.id_counter = 0;
        self.tmpl_counter = 0;
        self.has_bound_root_element = false;

        let root_nodes_var = self.next_id("roots");
        self.statements
            .push(format!("const {} = [];", root_nodes_var));

        for node in ast {
            if let Some(node_var) = self.generate_node(node, None, &HashSet::new()) {
                self.statements
                    .push(format!("{}.push({});", root_nodes_var, node_var));
            }
        }

        self.statements.push(format!("return {};", root_nodes_var));

        let body = self.statements.join("\n  ");
        if self.templates.is_empty() {
            format!(
                "function __angora_render__(ctx, injector, rootNode) {{\n  {}\n}}",
                body
            )
        } else {
            let mut tmpl_defs = Vec::new();
            for (tmpl_name, tmpl_html) in &self.templates {
                tmpl_defs.push(format!(
                    "const {} = /*@__PURE__*/ template({});",
                    tmpl_name,
                    serde_json::to_string(tmpl_html).unwrap_or_else(|_| "\"\"".to_string())
                ));
            }
            format!(
                "(() => {{\n  {}\n  return function __angora_render__(ctx, injector, rootNode) {{\n    {}\n  }};\n}})()",
                tmpl_defs.join("\n  "),
                body.replace('\n', "\n  ")
            )
        }
    }

    fn is_custom_component(&self, name: &str) -> bool {
        name.contains('-') || name.chars().next().map_or(false, |c| c.is_uppercase())
    }

    fn generate_node(
        &mut self,
        node: &TemplateNode,
        parent_var: Option<&str>,
        scope_vars: &HashSet<String>,
    ) -> Option<String> {
        match node {
            TemplateNode::Element(el) => {
                if el.name == "ng-content" {
                    let select = el
                        .attributes
                        .iter()
                        .find(|a| a.name == "select")
                        .map(|a| a.value.as_str());
                    Some(self.generate_slot(parent_var, select))
                } else if self.is_custom_component(&el.name) {
                    Some(self.generate_custom_component(el, parent_var, scope_vars))
                } else {
                    Some(self.generate_cloned_element(el, parent_var, scope_vars))
                }
            }
            TemplateNode::Text(text) => Some(self.generate_text(text, parent_var)),
            TemplateNode::Interpolation(interp) => {
                Some(self.generate_interpolation(interp, parent_var, scope_vars))
            }
            TemplateNode::IfBlock(if_b) => {
                Some(self.generate_if_block(if_b, parent_var, scope_vars))
            }
            TemplateNode::ForBlock(for_b) => {
                Some(self.generate_for_block(for_b, parent_var, scope_vars))
            }
            TemplateNode::SwitchBlock(sw_b) => {
                Some(self.generate_switch_block(sw_b, parent_var, scope_vars))
            }
            TemplateNode::DeferBlock(def_b) => {
                Some(self.generate_defer_block(def_b, parent_var, scope_vars))
            }
        }
    }

    fn serialize_element_tree(
        &self,
        el: &ElementNode,
        path: Vec<usize>,
        bindings: &mut Vec<NodeBinding>,
    ) -> String {
        let mut html = String::new();
        html.push('<');
        html.push_str(&el.name);

        if let Some(scope) = &self.scope_id {
            html.push(' ');
            html.push_str(scope);
            html.push_str("=\"\"");
        }

        for attr in &el.attributes {
            html.push(' ');
            html.push_str(&attr.name);
            html.push_str("=\"");
            html.push_str(&escape_html_attr(&attr.value));
            html.push('"');
        }
        html.push('>');

        let has_directive_attr = el.attributes.iter().any(|a| {
            !matches!(
                a.name.as_str(),
                "class"
                    | "id"
                    | "style"
                    | "src"
                    | "href"
                    | "type"
                    | "name"
                    | "placeholder"
                    | "role"
                    | "alt"
                    | "title"
                    | "rows"
                    | "cols"
                    | "rel"
                    | "target"
            ) && !a.name.starts_with("aria-")
                && !a.name.starts_with("data-")
        });

        let has_element_bindings = !el.properties.is_empty()
            || !el.two_ways.is_empty()
            || !el.events.is_empty()
            || !el.references.is_empty()
            || has_directive_attr;

        if has_element_bindings {
            bindings.push(NodeBinding {
                path: path.clone(),
                kind: BindingKind::SelfElement(el.clone()),
            });
        }

        if crate::parser::is_void_element(&el.name) {
            return html;
        }

        for (idx, child) in el.children.iter().enumerate() {
            let mut child_path = path.clone();
            child_path.push(idx);

            match child {
                TemplateNode::Element(child_el) => {
                    if child_el.name == "ng-content" {
                        let select = child_el
                            .attributes
                            .iter()
                            .find(|a| a.name == "select")
                            .map(|a| a.value.clone());
                        html.push_str("<!--angora:slot-->");
                        bindings.push(NodeBinding {
                            path: child_path,
                            kind: BindingKind::Slot(select),
                        });
                    } else if self.is_custom_component(&child_el.name) {
                        html.push('<');
                        html.push_str(&child_el.name);
                        if let Some(scope) = &self.scope_id {
                            html.push(' ');
                            html.push_str(scope);
                            html.push_str("=\"\"");
                        }
                        for attr in &child_el.attributes {
                            html.push(' ');
                            html.push_str(&attr.name);
                            html.push_str("=\"");
                            html.push_str(&escape_html_attr(&attr.value));
                            html.push('"');
                        }
                        html.push_str("></");
                        html.push_str(&child_el.name);
                        html.push('>');

                        bindings.push(NodeBinding {
                            path: child_path,
                            kind: BindingKind::CustomComponent(child_el.clone()),
                        });
                    } else {
                        let child_html =
                            self.serialize_element_tree(child_el, child_path, bindings);
                        html.push_str(&child_html);
                    }
                }
                TemplateNode::Text(txt) => {
                    html.push_str(&escape_html_text(&txt.value));
                }
                TemplateNode::Interpolation(interp) => {
                    html.push_str("<!--t-->");
                    bindings.push(NodeBinding {
                        path: child_path,
                        kind: BindingKind::Interpolation(interp.expression.clone()),
                    });
                }
                TemplateNode::IfBlock(if_b) => {
                    html.push_str("<!--angora:if-->");
                    bindings.push(NodeBinding {
                        path: child_path,
                        kind: BindingKind::IfBlock(if_b.clone()),
                    });
                }
                TemplateNode::ForBlock(for_b) => {
                    html.push_str("<!--angora:for-->");
                    bindings.push(NodeBinding {
                        path: child_path,
                        kind: BindingKind::ForBlock(for_b.clone()),
                    });
                }
                TemplateNode::SwitchBlock(sw_b) => {
                    html.push_str("<!--angora:switch-->");
                    bindings.push(NodeBinding {
                        path: child_path,
                        kind: BindingKind::SwitchBlock(sw_b.clone()),
                    });
                }
                TemplateNode::DeferBlock(def_b) => {
                    html.push_str("<!--angora:defer-->");
                    bindings.push(NodeBinding {
                        path: child_path,
                        kind: BindingKind::DeferBlock(def_b.clone()),
                    });
                }
            }
        }

        html.push_str("</");
        html.push_str(&el.name);
        html.push('>');

        html
    }

    fn generate_cloned_element(
        &mut self,
        el: &ElementNode,
        parent_var: Option<&str>,
        scope_vars: &HashSet<String>,
    ) -> String {
        let mut bindings = Vec::new();
        let html = self.serialize_element_tree(el, vec![], &mut bindings);

        let tmpl_var = format!("_tmpl_{}", self.tmpl_counter);
        self.tmpl_counter += 1;
        self.templates.push((tmpl_var.clone(), html));

        let root_var = self.next_id("el");
        if parent_var.is_none() && !self.has_bound_root_element {
            self.has_bound_root_element = true;
            self.statements.push(format!(
                "const {} = (rootNode && rootNode.nodeType === 1) ? rootNode : {}();",
                root_var, tmpl_var
            ));
        } else {
            self.statements
                .push(format!("const {} = {}();", root_var, tmpl_var));
        }

        if let Some(pv) = parent_var {
            self.statements
                .push(format!("{}.appendChild({});", pv, root_var));
        }

        // Step 1: Pre-resolve all DOM references upfront BEFORE executing bindings/control flow.
        // This ensures node indices in childNodes remain pristine and unaffected by DOM insertions.
        let mut path_to_var = std::collections::HashMap::new();
        path_to_var.insert(vec![], root_var.clone());

        let mut binding_targets = Vec::new();
        for binding in &bindings {
            let target_var = if let Some(var) = path_to_var.get(&binding.path) {
                var.clone()
            } else {
                let var = self.next_id("el");
                let mut path_expr = root_var.clone();
                for idx in &binding.path {
                    path_expr = format!("{}.childNodes[{}]", path_expr, idx);
                }
                self.statements
                    .push(format!("const {} = {};", var, path_expr));
                path_to_var.insert(binding.path.clone(), var.clone());
                var
            };
            binding_targets.push(target_var);
        }

        let mut local_scope_vars = scope_vars.clone();
        for (i, binding) in bindings.iter().enumerate() {
            let target_var = &binding_targets[i];
            if let BindingKind::SelfElement(ref elem) = binding.kind {
                for ref_node in &elem.references {
                    self.statements
                        .push(format!("const {} = {};", ref_node.name, target_var));
                    self.statements
                        .push(format!("ctx.{} = {};", ref_node.name, target_var));
                    local_scope_vars.insert(ref_node.name.clone());
                }
            }
        }

        // Step 2: Now safely execute bindings and control-flow hooks using pre-resolved targets
        for (i, binding) in bindings.into_iter().enumerate() {
            let target_var = &binding_targets[i];

            match binding.kind {
                BindingKind::SelfElement(elem) => {
                    if !elem.attributes.is_empty() {
                        self.statements.push(format!(
                            "applyMatchingDirectives({}, ctx, injector);",
                            target_var
                        ));
                    }
                    for prop in elem.properties {
                        let expr = self.prefix_ctx(&prop.expression, &local_scope_vars);
                        if let Some(class_name) = prop.name.strip_prefix("class.") {
                            self.statements.push(format!(
                                "bindClass({}, '{}', () => Boolean({}));",
                                target_var, class_name, expr
                            ));
                        } else if let Some(style_prop) = prop.name.strip_prefix("style.") {
                            self.statements.push(format!(
                                "bindStyle({}, '{}', () => ({}));",
                                target_var, style_prop, expr
                            ));
                        } else if let Some(attr_name) = prop.name.strip_prefix("attr.") {
                            self.statements.push(format!(
                                "bindProp({}, '{}', () => ({}));",
                                target_var, attr_name, expr
                            ));
                        } else {
                            self.statements.push(format!(
                                "bindProp({}, '{}', () => ({}));",
                                target_var, prop.name, expr
                            ));
                        }
                    }

                    for two_way in elem.two_ways {
                        let expr = self.prefix_ctx(&two_way.expression, &local_scope_vars);
                        self.statements.push(format!(
                            "bindTwoWay({}, '{}', () => ({}), ($val) => {{ if (({})?.set) {{ ({}).set($val); }} else {{ ctx.{} = $val; }} }});",
                            target_var, two_way.name, expr, expr, expr, two_way.expression
                        ));
                    }

                    for ev in elem.events {
                        let mut local_scope = local_scope_vars.clone();
                        local_scope.insert("$event".to_string());
                        let handler_expr = self.prefix_ctx(&ev.handler, &local_scope);
                        self.statements.push(format!(
                            "bindEvent({}, '{}', ($event) => {{ ({}); }});",
                            target_var, ev.name, handler_expr
                        ));
                    }
                }
                BindingKind::Interpolation(expr) => {
                    let expr_str = self.prefix_ctx(&expr, scope_vars);
                    self.statements
                        .push(format!("bindText({}, () => ({}));", target_var, expr_str));
                }
                BindingKind::IfBlock(if_b) => {
                    let mut branches_str = Vec::new();
                    for branch in &if_b.branches {
                        let render_fn = self.generate_sub_block(&branch.children, scope_vars);
                        let cond_str = match &branch.condition {
                            Some(c) => format!("() => ({})", self.prefix_ctx(c, scope_vars)),
                            None => "undefined".to_string(),
                        };
                        branches_str.push(format!(
                            "{{ condition: {}, render: {} }}",
                            cond_str, render_fn
                        ));
                    }
                    self.statements.push(format!(
                        "createIf({}, [{}]);",
                        target_var,
                        branches_str.join(", ")
                    ));
                }
                BindingKind::ForBlock(for_b) => {
                    let iterable_expr = self.prefix_ctx(&for_b.iterable, scope_vars);
                    let mut loop_scope = scope_vars.clone();
                    loop_scope.insert(for_b.item_name.clone());
                    loop_scope.insert("$index".to_string());

                    let clean_track = if for_b.track_by == "$index" {
                        "$index".to_string()
                    } else if for_b.track_by == "$identity" || for_b.track_by == for_b.item_name {
                        for_b.item_name.clone()
                    } else if for_b.track_by.contains('.') {
                        for_b.track_by.clone()
                    } else {
                        format!("{}.{}", for_b.item_name, for_b.track_by)
                    };
                    let track_fn = format!("({}, $index) => ({})", for_b.item_name, clean_track);

                    let mut sub_gen = CodeGenerator::with_scope(self.scope_id.clone());
                    sub_gen.id_counter = self.id_counter;
                    sub_gen.tmpl_counter = self.tmpl_counter;
                    let item_nodes_var = sub_gen.next_id("item_roots");
                    sub_gen
                        .statements
                        .push(format!("const {} = [];", item_nodes_var));

                    for child in &for_b.children {
                        if let Some(node_var) = sub_gen.generate_node(child, None, &loop_scope) {
                            sub_gen
                                .statements
                                .push(format!("{}.push({});", item_nodes_var, node_var));
                        }
                    }
                    sub_gen
                        .statements
                        .push(format!("return {};", item_nodes_var));

                    self.id_counter = sub_gen.id_counter;
                    self.tmpl_counter = sub_gen.tmpl_counter;
                    self.templates.extend(sub_gen.templates);

                    let render_item_fn = format!(
                        "({}, $index) => {{\n    {}\n  }}",
                        for_b.item_name,
                        sub_gen.statements.join("\n    ")
                    );

                    let empty_fn = if let Some(ref empty_block) = for_b.empty_block {
                        if !empty_block.is_empty() {
                            self.generate_sub_block(empty_block, scope_vars)
                        } else {
                            "undefined".to_string()
                        }
                    } else {
                        "undefined".to_string()
                    };

                    self.statements.push(format!(
                        "createFor({}, () => ({}), {}, {}, {});",
                        target_var, iterable_expr, track_fn, render_item_fn, empty_fn
                    ));
                }
                BindingKind::SwitchBlock(sw_b) => {
                    let expr = self.prefix_ctx(&sw_b.expression, scope_vars);
                    let mut cases_str = Vec::new();

                    for case in &sw_b.cases {
                        let render_fn = self.generate_sub_block(&case.children, scope_vars);
                        let val_str = match &case.case_value {
                            Some(v) => self.prefix_ctx(v, scope_vars),
                            None => "undefined".to_string(),
                        };
                        cases_str.push(format!(
                            "{{ caseValue: {}, render: {} }}",
                            val_str, render_fn
                        ));
                    }

                    self.statements.push(format!(
                        "createSwitch({}, () => ({}), [{}]);",
                        target_var,
                        expr,
                        cases_str.join(", ")
                    ));
                }
                BindingKind::DeferBlock(def_b) => {
                    let triggers_json: Vec<String> = def_b
                        .triggers
                        .iter()
                        .map(|t| {
                            if t.trigger_type == "when" {
                                let cond_expr = self
                                    .prefix_ctx(t.param.as_deref().unwrap_or("false"), scope_vars);
                                format!(
                                    "{{ type: 'when', condition: () => Boolean({}) }}",
                                    cond_expr
                                )
                            } else if let Some(ref param) = t.param {
                                format!(
                                    "{{ type: '{}', param: {} }}",
                                    t.trigger_type,
                                    serde_json::to_string(param).unwrap_or_default()
                                )
                            } else {
                                format!("{{ type: '{}' }}", t.trigger_type)
                            }
                        })
                        .collect();

                    let main_fn = self.generate_sub_block(&def_b.main_block, scope_vars);
                    let placeholder_fn = if let Some(ref pb) = def_b.placeholder_block {
                        self.generate_sub_block(&pb.children, scope_vars)
                    } else {
                        "undefined".to_string()
                    };
                    let loading_fn = if let Some(ref lb) = def_b.loading_block {
                        self.generate_sub_block(&lb.children, scope_vars)
                    } else {
                        "undefined".to_string()
                    };
                    let error_fn = if let Some(ref eb) = def_b.error_block {
                        self.generate_sub_block(&eb.children, scope_vars)
                    } else {
                        "undefined".to_string()
                    };

                    let loading_after = def_b
                        .loading_block
                        .as_ref()
                        .and_then(|l| l.after)
                        .unwrap_or(0);
                    let loading_minimum = def_b
                        .loading_block
                        .as_ref()
                        .and_then(|l| l.minimum)
                        .unwrap_or(0);
                    let placeholder_minimum = def_b
                        .placeholder_block
                        .as_ref()
                        .and_then(|p| p.minimum)
                        .unwrap_or(0);

                    self.statements.push(format!(
                        "createDefer({}, {{\n    triggers: [{}],\n    main: {},\n    placeholder: {},\n    loading: {},\n    error: {},\n    loadingAfter: {},\n    loadingMinimum: {},\n    placeholderMinimum: {},\n  }});",
                        target_var,
                        triggers_json.join(", "),
                        main_fn,
                        placeholder_fn,
                        loading_fn,
                        error_fn,
                        loading_after,
                        loading_minimum,
                        placeholder_minimum
                    ));
                }
                BindingKind::Slot(select) => {
                    let select_arg = match select {
                        Some(ref s) => format!("'{}'", s.replace('\'', "\\'")),
                        None => String::new(),
                    };
                    self.statements.push(format!(
                        "if (typeof ctx.__projectedNodes === 'function') {{\n    const _projNodes = ctx.__projectedNodes({});\n    for (const _n of _projNodes) {{\n      {}.parentNode.insertBefore(_n, {});\n    }}\n  }}",
                        select_arg, target_var, target_var
                    ));
                }
                BindingKind::CustomComponent(child_el) => {
                    let mut inputs_arr = Vec::new();
                    for prop in &child_el.properties {
                        let expr = self.prefix_ctx(&prop.expression, scope_vars);
                        inputs_arr.push(format!("'{}': () => ({})", prop.name, expr));
                    }

                    let mut outputs_arr = Vec::new();
                    for ev in &child_el.events {
                        let mut local_scope = scope_vars.clone();
                        local_scope.insert("$event".to_string());
                        let handler_expr = self.prefix_ctx(&ev.handler, &local_scope);
                        outputs_arr.push(format!(
                            "'{}': ($event) => {{ ({}); }}",
                            ev.name, handler_expr
                        ));
                    }

                    for two_way in &child_el.two_ways {
                        let expr = self.prefix_ctx(&two_way.expression, scope_vars);
                        inputs_arr.push(format!("'{}': () => ({})", two_way.name, expr));
                        outputs_arr.push(format!(
                            "'{}Change': ($event) => {{ if (({})?.set) {{ ({}).set($event); }} else {{ ctx.{} = $event; }} }}",
                            two_way.name, expr, expr, two_way.expression
                        ));
                    }

                    let projected_fn = if !child_el.children.is_empty() {
                        self.generate_sub_block(&child_el.children, scope_vars)
                    } else {
                        "undefined".to_string()
                    };

                    self.statements.push(format!(
                        "mountComponent('{}', {}, ctx, injector, {{\n    inputs: {{ {} }},\n    outputs: {{ {} }},\n    projectedNodes: {}\n  }});",
                        child_el.name,
                        target_var,
                        inputs_arr.join(", "),
                        outputs_arr.join(", "),
                        projected_fn
                    ));
                }
            }
        }

        root_var
    }

    fn generate_slot(&mut self, parent_var: Option<&str>, select: Option<&str>) -> String {
        let anchor_var = self.next_id("slot");
        self.statements.push(format!(
            "const {} = createComment('angora:slot');",
            anchor_var
        ));
        let parent_append = match parent_var {
            Some(pv) => format!("{}.appendChild(_n);", pv),
            None => String::new(),
        };
        let select_arg = match select {
            Some(s) => format!("'{}'", s.replace('\'', "\\'")),
            None => String::new(),
        };
        self.statements.push(format!(
            "if (typeof ctx.__projectedNodes === 'function') {{\n    const _projNodes = ctx.__projectedNodes({});\n    for (const _n of _projNodes) {{\n      {}\n    }}\n  }}",
            select_arg, parent_append
        ));
        if let Some(pv) = parent_var {
            self.statements
                .push(format!("{}.appendChild({});", pv, anchor_var));
        }
        anchor_var
    }

    fn generate_custom_component(
        &mut self,
        el: &ElementNode,
        parent_var: Option<&str>,
        scope_vars: &HashSet<String>,
    ) -> String {
        let host_var = self.next_id("comp_host");
        self.statements.push(format!(
            "const {} = createElement('{}');",
            host_var, el.name
        ));
        if let Some(scope) = &self.scope_id {
            self.statements
                .push(format!("{}.setAttribute('{}', '');", host_var, scope));
        }

        for ref_node in &el.references {
            self.statements
                .push(format!("const {} = {};", ref_node.name, host_var));
            self.statements
                .push(format!("ctx.{} = {};", ref_node.name, host_var));
        }

        for attr in &el.attributes {
            self.statements.push(format!(
                "{}.setAttribute('{}', {});",
                host_var,
                attr.name,
                serde_json::to_string(&attr.value).unwrap_or_default()
            ));
        }

        let mut inputs_arr = Vec::new();
        for prop in &el.properties {
            let expr = self.prefix_ctx(&prop.expression, scope_vars);
            inputs_arr.push(format!("'{}': () => ({})", prop.name, expr));
        }

        let mut outputs_arr = Vec::new();
        for ev in &el.events {
            let mut local_scope = scope_vars.clone();
            local_scope.insert("$event".to_string());
            let handler_expr = self.prefix_ctx(&ev.handler, &local_scope);
            outputs_arr.push(format!(
                "'{}': ($event) => {{ ({}); }}",
                ev.name, handler_expr
            ));
        }

        for two_way in &el.two_ways {
            let expr = self.prefix_ctx(&two_way.expression, scope_vars);
            inputs_arr.push(format!("'{}': () => ({})", two_way.name, expr));
            outputs_arr.push(format!(
                "'{}Change': ($event) => {{ if (({})?.set) {{ ({}).set($event); }} else {{ ctx.{} = $event; }} }}",
                two_way.name, expr, expr, two_way.expression
            ));
        }

        let projected_fn = if !el.children.is_empty() {
            self.generate_sub_block(&el.children, scope_vars)
        } else {
            "undefined".to_string()
        };

        self.statements.push(format!(
            "mountComponent('{}', {}, ctx, injector, {{\n    inputs: {{ {} }},\n    outputs: {{ {} }},\n    projectedNodes: {}\n  }});",
            el.name,
            host_var,
            inputs_arr.join(", "),
            outputs_arr.join(", "),
            projected_fn
        ));

        if let Some(pv) = parent_var {
            self.statements
                .push(format!("{}.appendChild({});", pv, host_var));
        }

        host_var
    }

    fn generate_text(&mut self, text: &TextNode, parent_var: Option<&str>) -> String {
        let text_var = self.next_id("txt");
        self.statements.push(format!(
            "const {} = createText({});",
            text_var,
            serde_json::to_string(&text.value).unwrap_or_default()
        ));

        if let Some(pv) = parent_var {
            self.statements
                .push(format!("{}.appendChild({});", pv, text_var));
        }

        text_var
    }

    fn generate_interpolation(
        &mut self,
        interp: &InterpolationNode,
        parent_var: Option<&str>,
        scope_vars: &HashSet<String>,
    ) -> String {
        let text_var = self.next_id("t");
        let expr = self.prefix_ctx(&interp.expression, scope_vars);
        self.statements
            .push(format!("const {} = createText();", text_var));
        self.statements
            .push(format!("bindText({}, () => ({}));", text_var, expr));

        if let Some(pv) = parent_var {
            self.statements
                .push(format!("{}.appendChild({});", pv, text_var));
        }

        text_var
    }

    fn generate_if_block(
        &mut self,
        if_block: &IfBlockNode,
        parent_var: Option<&str>,
        scope_vars: &HashSet<String>,
    ) -> String {
        let anchor_var = self.next_id("if_anchor");
        self.statements.push(format!(
            "const {} = createComment('angora:if');",
            anchor_var
        ));

        if let Some(pv) = parent_var {
            self.statements
                .push(format!("{}.appendChild({});", pv, anchor_var));
        }

        let mut branches_str = Vec::new();
        for branch in &if_block.branches {
            let render_fn = self.generate_sub_block(&branch.children, scope_vars);
            let cond_str = match &branch.condition {
                Some(c) => format!("() => ({})", self.prefix_ctx(c, scope_vars)),
                None => "undefined".to_string(),
            };
            branches_str.push(format!(
                "{{ condition: {}, render: {} }}",
                cond_str, render_fn
            ));
        }

        self.statements.push(format!(
            "createIf({}, [{}]);",
            anchor_var,
            branches_str.join(", ")
        ));

        anchor_var
    }

    fn generate_for_block(
        &mut self,
        for_block: &ForBlockNode,
        parent_var: Option<&str>,
        scope_vars: &HashSet<String>,
    ) -> String {
        let anchor_var = self.next_id("for_anchor");
        self.statements.push(format!(
            "const {} = createComment('angora:for');",
            anchor_var
        ));

        if let Some(pv) = parent_var {
            self.statements
                .push(format!("{}.appendChild({});", pv, anchor_var));
        }

        let iterable_expr = self.prefix_ctx(&for_block.iterable, scope_vars);

        let mut item_scope = scope_vars.clone();
        item_scope.insert(for_block.item_name.clone());
        item_scope.insert("$index".to_string());

        let clean_track = if for_block.track_by == "$index" {
            "$index".to_string()
        } else if for_block.track_by == "$identity" || for_block.track_by == for_block.item_name {
            for_block.item_name.clone()
        } else if for_block.track_by.contains('.') {
            for_block.track_by.clone()
        } else {
            format!("{}.{}", for_block.item_name, for_block.track_by)
        };
        let track_fn = format!("({}, $index) => ({})", for_block.item_name, clean_track);

        let mut sub_gen = CodeGenerator::with_scope(self.scope_id.clone());
        sub_gen.id_counter = self.id_counter;
        sub_gen.tmpl_counter = self.tmpl_counter;
        let item_nodes_var = sub_gen.next_id("item_roots");
        sub_gen
            .statements
            .push(format!("const {} = [];", item_nodes_var));

        for child in &for_block.children {
            if let Some(node_var) = sub_gen.generate_node(child, None, &item_scope) {
                sub_gen
                    .statements
                    .push(format!("{}.push({});", item_nodes_var, node_var));
            }
        }
        sub_gen
            .statements
            .push(format!("return {};", item_nodes_var));

        self.id_counter = sub_gen.id_counter;
        self.tmpl_counter = sub_gen.tmpl_counter;
        self.templates.extend(sub_gen.templates);

        let render_item_fn = format!(
            "({}, $index) => {{\n    {}\n  }}",
            for_block.item_name,
            sub_gen.statements.join("\n    ")
        );

        let empty_fn = if let Some(empty_block) = &for_block.empty_block {
            if !empty_block.is_empty() {
                self.generate_sub_block(empty_block, scope_vars)
            } else {
                "undefined".to_string()
            }
        } else {
            "undefined".to_string()
        };

        self.statements.push(format!(
            "createFor({}, () => ({}), {}, {}, {});",
            anchor_var, iterable_expr, track_fn, render_item_fn, empty_fn
        ));

        anchor_var
    }

    fn generate_switch_block(
        &mut self,
        sw_block: &SwitchBlockNode,
        parent_var: Option<&str>,
        scope_vars: &HashSet<String>,
    ) -> String {
        let anchor_var = self.next_id("sw_anchor");
        self.statements.push(format!(
            "const {} = createComment('angora:switch');",
            anchor_var
        ));

        if let Some(pv) = parent_var {
            self.statements
                .push(format!("{}.appendChild({});", pv, anchor_var));
        }

        let expr = self.prefix_ctx(&sw_block.expression, scope_vars);
        let mut cases_str = Vec::new();

        for case in &sw_block.cases {
            let render_fn = self.generate_sub_block(&case.children, scope_vars);
            let val_str = match &case.case_value {
                Some(v) => self.prefix_ctx(v, scope_vars),
                None => "undefined".to_string(),
            };
            cases_str.push(format!(
                "{{ caseValue: {}, render: {} }}",
                val_str, render_fn
            ));
        }

        self.statements.push(format!(
            "createSwitch({}, () => ({}), [{}]);",
            anchor_var,
            expr,
            cases_str.join(", ")
        ));

        anchor_var
    }

    fn generate_defer_block(
        &mut self,
        defer_block: &DeferBlockNode,
        parent_var: Option<&str>,
        scope_vars: &HashSet<String>,
    ) -> String {
        let anchor_var = self.next_id("anchor_defer");
        self.statements.push(format!(
            "const {} = createComment('angora:defer');",
            anchor_var
        ));

        if let Some(pv) = parent_var {
            self.statements
                .push(format!("{}.appendChild({});", pv, anchor_var));
        }

        let triggers_json: Vec<String> = defer_block
            .triggers
            .iter()
            .map(|t| {
                if t.trigger_type == "when" {
                    let cond_expr =
                        self.prefix_ctx(t.param.as_deref().unwrap_or("false"), scope_vars);
                    format!(
                        "{{ type: 'when', condition: () => Boolean({}) }}",
                        cond_expr
                    )
                } else if let Some(ref param) = t.param {
                    format!(
                        "{{ type: '{}', param: {} }}",
                        t.trigger_type,
                        serde_json::to_string(param).unwrap_or_default()
                    )
                } else {
                    format!("{{ type: '{}' }}", t.trigger_type)
                }
            })
            .collect();

        let main_fn = self.generate_sub_block(&defer_block.main_block, scope_vars);
        let placeholder_fn = if let Some(ref pb) = defer_block.placeholder_block {
            self.generate_sub_block(&pb.children, scope_vars)
        } else {
            "undefined".to_string()
        };
        let loading_fn = if let Some(ref lb) = defer_block.loading_block {
            self.generate_sub_block(&lb.children, scope_vars)
        } else {
            "undefined".to_string()
        };
        let error_fn = if let Some(ref eb) = defer_block.error_block {
            self.generate_sub_block(&eb.children, scope_vars)
        } else {
            "undefined".to_string()
        };

        let loading_after = defer_block
            .loading_block
            .as_ref()
            .and_then(|l| l.after)
            .unwrap_or(0);
        let loading_minimum = defer_block
            .loading_block
            .as_ref()
            .and_then(|l| l.minimum)
            .unwrap_or(0);
        let placeholder_minimum = defer_block
            .placeholder_block
            .as_ref()
            .and_then(|p| p.minimum)
            .unwrap_or(0);

        self.statements.push(format!(
            "createDefer({}, {{\n    triggers: [{}],\n    main: {},\n    placeholder: {},\n    loading: {},\n    error: {},\n    loadingAfter: {},\n    loadingMinimum: {},\n    placeholderMinimum: {},\n  }});",
            anchor_var,
            triggers_json.join(", "),
            main_fn,
            placeholder_fn,
            loading_fn,
            error_fn,
            loading_after,
            loading_minimum,
            placeholder_minimum
        ));

        anchor_var
    }

    fn generate_sub_block(
        &mut self,
        children: &[TemplateNode],
        scope_vars: &HashSet<String>,
    ) -> String {
        let mut sub_gen = CodeGenerator::with_scope(self.scope_id.clone());
        sub_gen.id_counter = self.id_counter;
        sub_gen.tmpl_counter = self.tmpl_counter;
        let sub_roots_var = sub_gen.next_id("sub_roots");
        sub_gen
            .statements
            .push(format!("const {} = [];", sub_roots_var));

        for child in children {
            if let Some(node_var) = sub_gen.generate_node(child, None, scope_vars) {
                sub_gen
                    .statements
                    .push(format!("{}.push({});", sub_roots_var, node_var));
            }
        }
        sub_gen
            .statements
            .push(format!("return {};", sub_roots_var));

        self.id_counter = sub_gen.id_counter;
        self.tmpl_counter = sub_gen.tmpl_counter;
        self.templates.extend(sub_gen.templates);

        format!("() => {{\n    {}\n  }}", sub_gen.statements.join("\n    "))
    }

    fn contains_pipe(&self, expr: &str) -> bool {
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

    fn compile_pipe(&self, expr: &str, scope_vars: &HashSet<String>) -> String {
        let mut parts = Vec::new();
        let mut current = String::new();
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
            return self.standard_prefix_ctx(expr, scope_vars);
        }

        let mut result = self.prefix_ctx(&parts[0], scope_vars);

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

            let pipe_name = &segments[0];
            let pipe_args: Vec<String> = segments[1..]
                .iter()
                .map(|arg| self.prefix_ctx(arg, scope_vars))
                .collect();

            result = format!(
                "applyPipe('{}', {}, [{}], ctx, injector)",
                pipe_name,
                result,
                pipe_args.join(", ")
            );
        }

        result
    }

    fn prefix_ctx(&self, expr: &str, scope_vars: &HashSet<String>) -> String {
        if self.contains_pipe(expr) {
            return self.compile_pipe(expr, scope_vars);
        }
        self.standard_prefix_ctx(expr, scope_vars)
    }

    fn standard_prefix_ctx(&self, expr: &str, scope_vars: &HashSet<String>) -> String {
        let keywords: HashSet<&str> = [
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
        ]
        .into_iter()
        .collect();

        let mut result = String::with_capacity(expr.len() + 16);
        let chars: Vec<char> = expr.chars().collect();
        let mut i = 0;

        while i < chars.len() {
            let ch = chars[i];

            // String literals: keep intact
            if ch == '\'' || ch == '"' || ch == '`' {
                let quote = ch;
                result.push(quote);
                i += 1;
                while i < chars.len() {
                    let c = chars[i];
                    result.push(c);
                    if c == quote && chars.get(i.wrapping_sub(1)) != Some(&'\\') {
                        i += 1;
                        break;
                    }
                    i += 1;
                }
                continue;
            }

            // Identifiers
            if ch.is_alphabetic() || ch == '_' || ch == '$' {
                let start = i;
                while i < chars.len()
                    && (chars[i].is_alphanumeric() || chars[i] == '_' || chars[i] == '$')
                {
                    i += 1;
                }
                let ident: String = chars[start..i].iter().collect();

                // Check if preceded by dot
                let prev_char = if start > 0 {
                    let mut p = start - 1;
                    while p > 0 && chars[p].is_whitespace() {
                        p -= 1;
                    }
                    Some(chars[p])
                } else {
                    None
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

                if prev_char == Some('.') || is_object_key {
                    result.push_str(&ident);
                } else if ident == "$index" && scope_vars.contains(&ident) {
                    let mut p = i;
                    while p < chars.len() && chars[p].is_whitespace() {
                        p += 1;
                    }
                    if p < chars.len() && chars[p] == '(' {
                        result.push_str(&ident);
                    } else {
                        result.push_str("$index()");
                    }
                } else if keywords.contains(ident.as_str()) || scope_vars.contains(&ident) {
                    result.push_str(&ident);
                } else {
                    result.push_str("ctx.");
                    result.push_str(&ident);
                }
                continue;
            }

            result.push(ch);
            i += 1;
        }

        result
    }
}

pub fn compile_template(ast: &[TemplateNode]) -> String {
    CodeGenerator::new().generate(ast)
}

pub fn compile_template_with_scope(ast: &[TemplateNode], scope_id: Option<&str>) -> String {
    let mut gen = CodeGenerator::with_scope(scope_id.map(|s| s.to_string()));
    gen.generate(ast)
}
