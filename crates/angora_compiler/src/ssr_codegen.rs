use crate::ast::*;
use std::collections::HashSet;

pub struct SsrCodeGenerator {
    scope_id: Option<String>,
    id_counter: usize,
}

impl SsrCodeGenerator {
    pub fn new(scope_id: Option<String>) -> Self {
        Self {
            scope_id,
            id_counter: 0,
        }
    }

    fn next_id(&mut self, prefix: &str) -> String {
        let id = format!("_{}_{}", prefix, self.id_counter);
        self.id_counter += 1;
        id
    }

    pub fn generate(&mut self, ast: &[TemplateNode]) -> String {
        let mut stmts = Vec::new();

        stmts.push("const __out = [];".to_string());
        stmts.push(
            r#"function __escape(v) {
    if (v == null) return '';
    while (typeof v === 'function') v = v();
    if (typeof v === 'string') {
      return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    return String(v);
  }"#
            .to_string(),
        );

        let scope_vars = HashSet::new();
        for node in ast {
            self.generate_node(node, &mut stmts, &scope_vars);
        }

        stmts.push("return __out.join('');".to_string());

        format!(
            "function __angora_ssr_render__(ctx, injector) {{\n  {}\n}}",
            stmts.join("\n  ")
        )
    }

    fn is_custom_component(&self, name: &str) -> bool {
        name.contains('-') || name.chars().next().map_or(false, |c| c.is_uppercase())
    }

    fn generate_node(
        &mut self,
        node: &TemplateNode,
        stmts: &mut Vec<String>,
        scope_vars: &HashSet<String>,
    ) {
        match node {
            TemplateNode::Element(el) => {
                if el.name == "ng-content" {
                    let select = el
                        .attributes
                        .iter()
                        .find(|a| a.name == "select")
                        .map(|a| a.value.as_str());
                    let select_arg = match select {
                        Some(s) => format!("'{}'", s.replace('\'', "\\'")),
                        None => String::new(),
                    };
                    stmts.push(format!(
                        "if (typeof ctx.__projectedHtml === 'function') {{\n    __out.push(ctx.__projectedHtml({}));\n  }}",
                        select_arg
                    ));
                } else if self.is_custom_component(&el.name) {
                    self.generate_custom_component(el, stmts, scope_vars);
                } else {
                    self.generate_element(el, stmts, scope_vars);
                }
            }
            TemplateNode::Text(text) => {
                let escaped =
                    serde_json::to_string(&text.value).unwrap_or_else(|_| "\"\"".to_string());
                stmts.push(format!("__out.push({});", escaped));
            }
            TemplateNode::Interpolation(interp) => {
                let expr = self.prefix_ctx(&interp.expression, scope_vars);
                stmts.push(format!("__out.push('<!--t-->' + __escape({}));", expr));
            }
            TemplateNode::IfBlock(if_b) => {
                self.generate_if_block(if_b, stmts, scope_vars);
            }
            TemplateNode::ForBlock(for_b) => {
                self.generate_for_block(for_b, stmts, scope_vars);
            }
            TemplateNode::SwitchBlock(sw_b) => {
                self.generate_switch_block(sw_b, stmts, scope_vars);
            }
            TemplateNode::DeferBlock(def_b) => {
                self.generate_defer_block(def_b, stmts, scope_vars);
            }
        }
    }

    fn generate_element(
        &mut self,
        el: &ElementNode,
        stmts: &mut Vec<String>,
        scope_vars: &HashSet<String>,
    ) {
        let is_void = crate::parser::is_void_element(&el.name);

        // Open tag
        stmts.push(format!("__out.push('<{}');", el.name));

        // Scope attribute
        if let Some(scope) = &self.scope_id {
            stmts.push(format!("__out.push(' {}=\"\"');", scope));
        }

        // Static attributes (except class and style which are merged with dynamic)
        for attr in &el.attributes {
            if attr.name != "class" && attr.name != "style" {
                stmts.push(format!(
                    "__out.push(' {}=\"' + __escape({}) + '\"');",
                    attr.name,
                    serde_json::to_string(&attr.value).unwrap_or_else(|_| "\"\"".to_string())
                ));
            }
        }

        // Classes (merge static class + [class] + [class.xxx])
        let static_class = el
            .attributes
            .iter()
            .find(|a| a.name == "class")
            .map(|a| a.value.as_str());
        let dynamic_class_prop = el.properties.iter().find(|p| p.name == "class");
        let class_name_props: Vec<_> = el
            .properties
            .iter()
            .filter(|p| p.name.starts_with("class."))
            .collect();

        if static_class.is_some() || dynamic_class_prop.is_some() || !class_name_props.is_empty() {
            let class_arr_var = self.next_id("cls");
            stmts.push(format!("const {} = [];", class_arr_var));

            if let Some(sc) = static_class {
                if !sc.is_empty() {
                    stmts.push(format!(
                        "{}.push({});",
                        class_arr_var,
                        serde_json::to_string(sc).unwrap()
                    ));
                }
            }

            if let Some(dcp) = dynamic_class_prop {
                let expr = self.prefix_ctx(&dcp.expression, scope_vars);
                stmts.push(format!(
                    "const _dyn_cls = {}; if (_dyn_cls) {{ if (typeof _dyn_cls === 'string') {}.push(_dyn_cls); else if (Array.isArray(_dyn_cls)) {}.push(..._dyn_cls); else for (const [k, v] of Object.entries(_dyn_cls)) if (v) {}.push(k); }}",
                    expr, class_arr_var, class_arr_var, class_arr_var
                ));
            }

            for cp in class_name_props {
                let class_name = &cp.name["class.".len()..];
                let expr = self.prefix_ctx(&cp.expression, scope_vars);
                stmts.push(format!(
                    "if ({}) {}.push('{}');",
                    expr, class_arr_var, class_name
                ));
            }

            stmts.push(format!(
                "if ({}.length > 0) __out.push(' class=\"' + __escape({}.join(' ')) + '\"');",
                class_arr_var, class_arr_var
            ));
        }

        // Styles (merge static style + [style] + [style.xxx])
        let static_style = el
            .attributes
            .iter()
            .find(|a| a.name == "style")
            .map(|a| a.value.as_str());
        let dynamic_style_prop = el.properties.iter().find(|p| p.name == "style");
        let style_name_props: Vec<_> = el
            .properties
            .iter()
            .filter(|p| p.name.starts_with("style."))
            .collect();

        if static_style.is_some() || dynamic_style_prop.is_some() || !style_name_props.is_empty() {
            let style_arr_var = self.next_id("sty");
            stmts.push(format!("const {} = [];", style_arr_var));

            if let Some(ss) = static_style {
                if !ss.is_empty() {
                    stmts.push(format!(
                        "{}.push({});",
                        style_arr_var,
                        serde_json::to_string(ss).unwrap()
                    ));
                }
            }

            if let Some(dsp) = dynamic_style_prop {
                let expr = self.prefix_ctx(&dsp.expression, scope_vars);
                stmts.push(format!(
                    "const _dyn_sty = {}; if (_dyn_sty) {{ if (typeof _dyn_sty === 'string') {}.push(_dyn_sty); else for (const [k, v] of Object.entries(_dyn_sty)) if (v != null) {}.push(k + ': ' + v); }}",
                    expr, style_arr_var, style_arr_var
                ));
            }

            for sp in style_name_props {
                let style_name = &sp.name["style.".len()..];
                let expr = self.prefix_ctx(&sp.expression, scope_vars);
                stmts.push(format!(
                    "const _sval = {}; if (_sval != null) {}.push('{}: ' + _sval);",
                    expr, style_arr_var, style_name
                ));
            }

            stmts.push(format!(
                "if ({}.length > 0) __out.push(' style=\"' + __escape({}.join('; ')) + '\"');",
                style_arr_var, style_arr_var
            ));
        }

        // Other dynamic properties & attributes
        for prop in &el.properties {
            if prop.name == "class"
                || prop.name.starts_with("class.")
                || prop.name == "style"
                || prop.name.starts_with("style.")
            {
                continue;
            }

            let attr_name = if let Some(stripped) = prop.name.strip_prefix("attr.") {
                stripped
            } else {
                &prop.name
            };

            let expr = self.prefix_ctx(&prop.expression, scope_vars);
            if attr_name == "disabled"
                || attr_name == "checked"
                || attr_name == "readonly"
                || attr_name == "required"
            {
                stmts.push(format!("if ({}) __out.push(' {}');", expr, attr_name));
            } else {
                stmts.push(format!(
                    "const _pval = {}; if (_pval != null && _pval !== false) __out.push(' {}=\"' + __escape(_pval) + '\"');",
                    expr, attr_name
                ));
            }
        }

        // Two-way bindings (e.g. [(ngModel)] or [(value)])
        for two_way in &el.two_ways {
            let expr = self.prefix_ctx(&two_way.expression, scope_vars);
            stmts.push(format!(
                "const _twval = {}; if (_twval != null) __out.push(' value=\"' + __escape(_twval) + '\"');",
                expr
            ));
        }

        if is_void {
            stmts.push("__out.push(' />');".to_string());
            return;
        }

        stmts.push("__out.push('>');".to_string());

        // Children
        for child in &el.children {
            self.generate_node(child, stmts, scope_vars);
        }

        // Close tag
        stmts.push(format!("__out.push('</{}>');", el.name));
    }

    fn generate_custom_component(
        &mut self,
        el: &ElementNode,
        stmts: &mut Vec<String>,
        scope_vars: &HashSet<String>,
    ) {
        let comp_var = self.next_id("comp");
        let inj_var = self.next_id("inj");
        let inst_var = self.next_id("inst");

        stmts.push(format!(
            "const {} = (typeof findImportedComponent === 'function') ? findImportedComponent(ctx, '{}') : undefined;",
            comp_var, el.name
        ));

        stmts.push(format!("__out.push('<{}');", el.name));
        if let Some(scope) = &self.scope_id {
            stmts.push(format!("__out.push(' {}=\"\"');", scope));
        }

        for attr in &el.attributes {
            stmts.push(format!(
                "__out.push(' {}=\"' + __escape({}) + '\"');",
                attr.name,
                serde_json::to_string(&attr.value).unwrap_or_else(|_| "\"\"".to_string())
            ));
        }
        stmts.push("__out.push('>');".to_string());

        // Instantiate child component in SSR if present and render its ssrRender
        stmts.push(format!(
            "if ({} && {}[COMPONENT_DEF] && typeof {}[COMPONENT_DEF].ssrRender === 'function') {{\n    const {} = new Injector([{{ provide: {}, useClass: {} }}], injector);\n    const {} = {}.get({});",
            comp_var, comp_var, comp_var, inj_var, comp_var, comp_var, inst_var, inj_var, comp_var
        ));

        // Pass inputs to child component instance
        for prop in &el.properties {
            let expr = self.prefix_ctx(&prop.expression, scope_vars);
            stmts.push(format!(
                "    if ({}.{} && typeof {}.{}.__set === 'function') {}.{}.__set({}); else {}.{} = {};",
                inst_var, prop.name, inst_var, prop.name, inst_var, prop.name, expr, inst_var, prop.name, expr
            ));
        }

        // Projected content for child component
        if !el.children.is_empty() {
            let mut child_stmts = Vec::new();
            child_stmts.push("const __out = [];".to_string());
            for child in &el.children {
                self.generate_node(child, &mut child_stmts, scope_vars);
            }
            child_stmts.push("return __out.join('');".to_string());
            stmts.push(format!(
                "    {}.__projectedHtml = () => {{\n      {}\n    }};",
                inst_var,
                child_stmts.join("\n      ")
            ));
        }

        stmts.push(format!(
            "    __out.push({}[COMPONENT_DEF].ssrRender({}, {}));\n  }}",
            comp_var, inst_var, inj_var
        ));

        // Fallback: if not an Angora component with ssrRender, render children directly
        if !el.children.is_empty() {
            stmts.push("else {".to_string());
            for child in &el.children {
                self.generate_node(child, stmts, scope_vars);
            }
            stmts.push("}".to_string());
        }

        stmts.push(format!("__out.push('</{}>');", el.name));
    }

    fn generate_if_block(
        &mut self,
        if_b: &IfBlockNode,
        stmts: &mut Vec<String>,
        scope_vars: &HashSet<String>,
    ) {
        stmts.push("__out.push('<!--angora:if-->');".to_string());

        for (idx, branch) in if_b.branches.iter().enumerate() {
            if let Some(cond) = &branch.condition {
                let expr = self.prefix_ctx(cond, scope_vars);
                if idx == 0 {
                    stmts.push(format!("if ({}) {{", expr));
                } else {
                    stmts.push(format!("else if ({}) {{", expr));
                }
            } else {
                stmts.push("else {".to_string());
            }

            for child in &branch.children {
                self.generate_node(child, stmts, scope_vars);
            }

            stmts.push("}".to_string());
        }

        stmts.push("__out.push('<!--/angora:if-->');".to_string());
    }

    fn generate_for_block(
        &mut self,
        for_b: &ForBlockNode,
        stmts: &mut Vec<String>,
        scope_vars: &HashSet<String>,
    ) {
        stmts.push("__out.push('<!--angora:for-->');".to_string());

        let items_var = self.next_id("items");
        let arr_var = self.next_id("arr");
        let expr = self.prefix_ctx(&for_b.iterable, scope_vars);

        stmts.push(format!("const {} = {};", items_var, expr));
        stmts.push(format!(
            "const {} = Array.isArray({}) ? {} : Array.from({} || []);",
            arr_var, items_var, items_var, items_var
        ));

        if let Some(empty) = &for_b.empty_block {
            stmts.push(format!("if ({}.length === 0) {{", arr_var));
            for child in empty {
                self.generate_node(child, stmts, scope_vars);
            }
            stmts.push("} else {".to_string());
        }

        let mut loop_scope = scope_vars.clone();
        loop_scope.insert(for_b.item_name.clone());
        loop_scope.insert("$index".to_string());
        stmts.push(format!(
            "let $index = 0;\n    for (let {} of {}) {{\n      $index++;",
            for_b.item_name, arr_var
        ));

        for child in &for_b.children {
            self.generate_node(child, stmts, &loop_scope);
        }

        stmts.push("}".to_string());

        if for_b.empty_block.is_some() {
            stmts.push("}".to_string());
        }

        stmts.push("__out.push('<!--/angora:for-->');".to_string());
    }

    fn generate_switch_block(
        &mut self,
        sw_b: &SwitchBlockNode,
        stmts: &mut Vec<String>,
        scope_vars: &HashSet<String>,
    ) {
        stmts.push("__out.push('<!--angora:switch-->');".to_string());

        let expr = self.prefix_ctx(&sw_b.expression, scope_vars);
        stmts.push(format!("switch ({}) {{", expr));

        for case in &sw_b.cases {
            if let Some(cv) = &case.case_value {
                let c_expr = self.prefix_ctx(cv, scope_vars);
                stmts.push(format!("case {}: {{", c_expr));
            } else {
                stmts.push("default: {".to_string());
            }

            for child in &case.children {
                self.generate_node(child, stmts, scope_vars);
            }

            stmts.push("break;\n}".to_string());
        }

        stmts.push("}".to_string());
        stmts.push("__out.push('<!--/angora:switch-->');".to_string());
    }

    fn generate_defer_block(
        &mut self,
        def_b: &DeferBlockNode,
        stmts: &mut Vec<String>,
        scope_vars: &HashSet<String>,
    ) {
        stmts.push("__out.push('<!--angora:defer-->');".to_string());
        if let Some(placeholder) = &def_b.placeholder_block {
            for child in &placeholder.children {
                self.generate_node(child, stmts, scope_vars);
            }
        } else if let Some(loading) = &def_b.loading_block {
            for child in &loading.children {
                self.generate_node(child, stmts, scope_vars);
            }
        }
        stmts.push("__out.push('<!--/angora:defer-->');".to_string());
    }

    fn prefix_ctx(&self, expr: &str, scope_vars: &HashSet<String>) -> String {
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

            if ch.is_alphabetic() || ch == '_' || ch == '$' {
                let start = i;
                while i < chars.len()
                    && (chars[i].is_alphanumeric() || chars[i] == '_' || chars[i] == '$')
                {
                    i += 1;
                }
                let ident: String = chars[start..i].iter().collect();

                let prev_char = if start > 0 {
                    let mut p = start - 1;
                    while p > 0 && chars[p].is_whitespace() {
                        p -= 1;
                    }
                    Some(chars[p])
                } else {
                    None
                };

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

pub fn compile_ssr_template(ast: &[TemplateNode], scope_id: Option<&str>) -> String {
    let mut gen = SsrCodeGenerator::new(scope_id.map(|s| s.to_string()));
    gen.generate(ast)
}
