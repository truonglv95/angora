use angora_compiler::{compile_template, parse_template, AngoraCompiler};
use oxc_allocator::Allocator;
use std::env;
use std::fs;
use std::io::Read;
use std::process;

fn print_usage() {
    println!(
        r#"Angora Native Rust Compiler & Tooling Engine (angora_oxc)

USAGE:
    angora_oxc <file.ts | -> [OPTIONS]

MODES:
    --transform             Transform Angora TypeScript source (@Component, @Directive, etc.)
    --generate-tcb          Generate Synthetic Type Check Block (TCB) & Source Map Table
    --lsp-analyze           Full AST analysis of components, imports, properties, TCB for LSP
    --scope-css             Scope CSS stylesheet with unique host attribute (_ngcontent-xxx)
    --compile-template      Compile HTML template into zero-VDOM JS render function
    --parse-template        Parse HTML template into AST JSON structure
    --check                 Run fast syntax and AST validation

OPTIONS:
    --class <name>          Component class name for TCB (default: "Component")
    --offset <number>       Base character offset of the template in source file (default: 0)
    --uri <file_uri>        File URI for LSP source mapping
    --scope-id <id>         Scope ID for CSS scoping (e.g. "_ngcontent-c123")
    -h, --help              Print this help information
"#
    );
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.iter().any(|a| a == "--lsp-server" || a == "lsp") {
        if let Err(err) = angora_compiler::lsp::run_lsp_server() {
            eprintln!("LSP server error: {}", err);
            process::exit(1);
        }
        process::exit(0);
    }

    if args.len() < 2 || args.iter().any(|a| a == "--help" || a == "-h") {
        print_usage();
        process::exit(if args.len() < 2 { 1 } else { 0 });
    }

    let file_path = &args[1];
    let check_only = args.iter().any(|a| a == "--check");
    let transform_mode = args.iter().any(|a| a == "--transform");
    let parse_template_mode = args.iter().any(|a| a == "--parse-template");
    let compile_template_mode = args.iter().any(|a| a == "--compile-template");
    let generate_tcb_mode = args.iter().any(|a| a == "--generate-tcb");
    let extract_tcbs_mode = args.iter().any(|a| a == "--extract-tcbs");
    let scope_css_mode = args.iter().any(|a| a == "--scope-css");
    let lsp_analyze_mode = args.iter().any(|a| a == "--lsp-analyze");
    let file_uri = args
        .windows(2)
        .find(|w| w[0] == "--uri")
        .map(|w| w[1].clone());
    let class_name = args
        .windows(2)
        .find(|w| w[0] == "--class")
        .map(|w| w[1].clone())
        .unwrap_or_else(|| "Component".to_string());

    let source = if file_path == "-" {
        let mut buf = String::new();
        if let Err(err) = std::io::stdin().read_to_string(&mut buf) {
            eprintln!("Failed to read from stdin: {}", err);
            process::exit(1);
        }
        buf
    } else {
        match fs::read_to_string(file_path) {
            Ok(s) => s,
            Err(err) => {
                eprintln!("Failed to read file '{}': {}", file_path, err);
                process::exit(1);
            }
        }
    };

    if generate_tcb_mode {
        let base_offset: u32 = args
            .windows(2)
            .find(|w| w[0] == "--offset")
            .and_then(|w| w[1].parse().ok())
            .unwrap_or(0);
        let res = if source.trim().starts_with('[') {
            if let Ok(nodes) = serde_json::from_str::<Vec<angora_compiler::TemplateNode>>(&source) {
                angora_compiler::generate_type_check_block(&nodes, &class_name, base_offset)
            } else {
                angora_compiler::generate_tcb_from_source(&source, &class_name, base_offset)
            }
        } else {
            angora_compiler::generate_tcb_from_source(&source, &class_name, base_offset)
        };
        match serde_json::to_string(&res) {
            Ok(json) => {
                print!("{}", json);
                process::exit(0);
            }
            Err(err) => {
                eprintln!("Failed to serialize TCB to JSON: {}", err);
                process::exit(1);
            }
        }
    }

    if extract_tcbs_mode {
        let uri = file_uri
            .clone()
            .unwrap_or_else(|| "file:///document.ts".to_string());
        let res = angora_compiler::analyze_single_file_lsp(&source, Some(uri));
        let mut list = Vec::new();
        for comp in res.components {
            if let Some(tmpl) = comp.template {
                if let Some(tcb) = tmpl.tcb {
                    list.push(serde_json::json!({
                        "className": comp.class_name,
                        "templateOffset": tmpl.offset,
                        "tcb": tcb,
                    }));
                }
            }
        }
        match serde_json::to_string(&list) {
            Ok(json) => {
                print!("{}", json);
                process::exit(0);
            }
            Err(err) => {
                eprintln!("Failed to serialize TCB list to JSON: {}", err);
                process::exit(1);
            }
        }
    }

    let lsp_diagnostics_mode = args.iter().any(|a| a == "--lsp-diagnostics");
    let lsp_hover_mode = args.iter().any(|a| a == "--lsp-hover");
    let lsp_completions_mode = args.iter().any(|a| a == "--lsp-completions");
    let lsp_definition_mode = args.iter().any(|a| a == "--lsp-definition");

    let line_num: u32 = args
        .windows(2)
        .find(|w| w[0] == "--line")
        .and_then(|w| w[1].parse().ok())
        .unwrap_or(0);
    let char_num: u32 = args
        .windows(2)
        .find(|w| w[0] == "--char")
        .and_then(|w| w[1].parse().ok())
        .unwrap_or(0);

    if lsp_diagnostics_mode {
        let uri = file_uri.as_deref().unwrap_or("file:///document.ts");
        let diags = angora_compiler::lsp::AngoraLanguageEngine::get_diagnostics(uri, &source);
        match serde_json::to_string(&diags) {
            Ok(json) => {
                print!("{}", json);
                process::exit(0);
            }
            Err(err) => {
                eprintln!("Failed to serialize diagnostics to JSON: {}", err);
                process::exit(1);
            }
        }
    }

    if lsp_hover_mode {
        let uri = file_uri.as_deref().unwrap_or("file:///document.ts");
        let pos = angora_compiler::lsp::LspPosition {
            line: line_num,
            character: char_num,
        };
        let hover = angora_compiler::lsp::AngoraLanguageEngine::get_hover(uri, &source, &pos);
        match serde_json::to_string(&hover) {
            Ok(json) => {
                print!("{}", json);
                process::exit(0);
            }
            Err(err) => {
                eprintln!("Failed to serialize hover to JSON: {}", err);
                process::exit(1);
            }
        }
    }

    if lsp_completions_mode {
        let uri = file_uri.as_deref().unwrap_or("file:///document.ts");
        let pos = angora_compiler::lsp::LspPosition {
            line: line_num,
            character: char_num,
        };
        let completions =
            angora_compiler::lsp::AngoraLanguageEngine::get_completions(uri, &source, &pos);
        match serde_json::to_string(&completions) {
            Ok(json) => {
                print!("{}", json);
                process::exit(0);
            }
            Err(err) => {
                eprintln!("Failed to serialize completions to JSON: {}", err);
                process::exit(1);
            }
        }
    }

    if lsp_definition_mode {
        let uri = file_uri.as_deref().unwrap_or("file:///document.ts");
        let pos = angora_compiler::lsp::LspPosition {
            line: line_num,
            character: char_num,
        };
        let defs = angora_compiler::lsp::AngoraLanguageEngine::get_definition(uri, &source, &pos);
        match serde_json::to_string(&defs) {
            Ok(json) => {
                print!("{}", json);
                process::exit(0);
            }
            Err(err) => {
                eprintln!("Failed to serialize definition to JSON: {}", err);
                process::exit(1);
            }
        }
    }

    if lsp_analyze_mode {
        let res = angora_compiler::analyze_components_lsp(&source, file_uri);
        match serde_json::to_string(&res) {
            Ok(json) => {
                print!("{}", json);
                process::exit(0);
            }
            Err(err) => {
                eprintln!("Failed to serialize LSP analysis to JSON: {}", err);
                process::exit(1);
            }
        }
    }

    if scope_css_mode {
        let scope_id = args
            .windows(2)
            .find(|w| w[0] == "--scope-id")
            .map(|w| w[1].as_str())
            .unwrap_or("_angora-c0");
        let scoped = angora_compiler::css::scope_css(&source, scope_id);
        print!("{}", scoped);
        process::exit(0);
    }

    if parse_template_mode {
        let ast = parse_template(&source);
        match serde_json::to_string(&ast) {
            Ok(json) => {
                print!("{}", json);
                process::exit(0);
            }
            Err(err) => {
                eprintln!("Failed to serialize AST to JSON: {}", err);
                process::exit(1);
            }
        }
    }

    if compile_template_mode {
        let ast = if source.trim().starts_with('[') {
            serde_json::from_str::<Vec<angora_compiler::TemplateNode>>(&source)
                .unwrap_or_else(|_| parse_template(&source))
        } else {
            parse_template(&source)
        };

        let scope_id = args
            .windows(2)
            .find(|w| w[0] == "--scope-id")
            .map(|w| w[1].as_str());

        let render_fn = if let Some(sid) = scope_id {
            angora_compiler::compile_template_with_scope(&ast, Some(sid))
        } else {
            compile_template(&ast)
        };

        print!("{}", render_fn);
        process::exit(0);
    }

    let compile_ssr_mode = args.iter().any(|a| a == "--compile-ssr");
    if compile_ssr_mode {
        let ast = if source.trim().starts_with('[') {
            serde_json::from_str::<Vec<angora_compiler::TemplateNode>>(&source)
                .unwrap_or_else(|_| parse_template(&source))
        } else {
            parse_template(&source)
        };

        let scope_id = args
            .windows(2)
            .find(|w| w[0] == "--scope-id")
            .map(|w| w[1].as_str());

        let ssr_fn = angora_compiler::compile_ssr_template(&ast, scope_id);
        print!("{}", ssr_fn);
        process::exit(0);
    }

    if transform_mode {
        let fpath = if file_path == "-" {
            None
        } else {
            Some(file_path.as_str())
        };
        match angora_compiler::transform_component_with_path(&source, fpath) {
            Ok(transformed) => {
                print!("{}", transformed);
                process::exit(0);
            }
            Err(err) => {
                eprintln!("OXC Transform failed: {}", err);
                process::exit(1);
            }
        }
    }

    let allocator = Allocator::default();
    let compiler = AngoraCompiler::new();
    let ret = compiler.parse_ts_source(&allocator, &source);

    if ret.panicked {
        eprintln!("OXC Parser panicked on file '{}'", file_path);
        process::exit(1);
    }

    if !ret.diagnostics.is_empty() {
        eprintln!(
            "Found {} syntax diagnostic(s) in '{}':",
            ret.diagnostics.len(),
            file_path
        );
        for diag in &ret.diagnostics {
            eprintln!("  - {}", diag);
        }
        process::exit(1);
    }

    if check_only {
        println!(
            "✓ OXC validated '{}' in < 1ms (Statements: {})",
            file_path,
            ret.program.body.len()
        );
    } else {
        println!(
            "{{\"success\": true, \"statements\": {}}}",
            ret.program.body.len()
        );
    }
}
