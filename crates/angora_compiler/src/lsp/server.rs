use super::analyzer::LspPosition;
use super::features::AngoraLanguageEngine;
use serde_json::json;
use std::collections::HashMap;
use std::io::{self, BufRead, Read, Write};

pub struct AngoraNativeLspServer {
    documents: HashMap<String, String>,
}

impl AngoraNativeLspServer {
    pub fn new() -> Self {
        Self {
            documents: HashMap::new(),
        }
    }

    fn send_response(&self, id: &serde_json::Value, result: serde_json::Value) {
        let msg = json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": result
        });
        self.send_message(&msg);
    }

    fn send_notification(&self, method: &str, params: serde_json::Value) {
        let msg = json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params
        });
        self.send_message(&msg);
    }

    fn send_message(&self, value: &serde_json::Value) {
        if let Ok(s) = serde_json::to_string(value) {
            let len = s.as_bytes().len();
            let mut stdout = io::stdout();
            let _ = write!(stdout, "Content-Length: {}\r\n\r\n{}", len, s);
            let _ = stdout.flush();
        }
    }

    pub fn handle_message(&mut self, msg: serde_json::Value) -> bool {
        let method = msg.get("method").and_then(|m| m.as_str()).unwrap_or("");
        let id = msg.get("id");

        match method {
            "initialize" => {
                if let Some(id) = id {
                    let capabilities = json!({
                        "textDocumentSync": 1, // Full document sync
                        "hoverProvider": true,
                        "definitionProvider": true,
                        "completionProvider": {
                            "triggerCharacters": [".", "@", "(", "[", "#", ":", "|"]
                        }
                    });
                    let result = json!({
                        "capabilities": capabilities,
                        "serverInfo": {
                            "name": "angora-native-lsp",
                            "version": "0.1.0"
                        }
                    });
                    self.send_response(id, result);
                }
            }
            "initialized" => {
                // Client confirmed initialization
            }
            "textDocument/didOpen" => {
                if let Some(doc) = msg.get("params").and_then(|p| p.get("textDocument")) {
                    if let (Some(uri), Some(text)) = (
                        doc.get("uri").and_then(|u| u.as_str()),
                        doc.get("text").and_then(|t| t.as_str()),
                    ) {
                        self.documents.insert(uri.to_string(), text.to_string());
                        let diags = AngoraLanguageEngine::get_diagnostics(uri, text);
                        self.send_notification(
                            "textDocument/publishDiagnostics",
                            json!({
                                "uri": uri,
                                "diagnostics": diags
                            }),
                        );
                    }
                }
            }
            "textDocument/didChange" => {
                if let Some(params) = msg.get("params") {
                    let uri = params
                        .get("textDocument")
                        .and_then(|td| td.get("uri"))
                        .and_then(|u| u.as_str());
                    let changes = params.get("contentChanges").and_then(|c| c.as_array());

                    if let (Some(uri), Some(changes)) = (uri, changes) {
                        if let Some(last_change) = changes.last() {
                            if let Some(new_text) = last_change.get("text").and_then(|t| t.as_str())
                            {
                                self.documents.insert(uri.to_string(), new_text.to_string());
                                let diags = AngoraLanguageEngine::get_diagnostics(uri, new_text);
                                self.send_notification(
                                    "textDocument/publishDiagnostics",
                                    json!({
                                        "uri": uri,
                                        "diagnostics": diags
                                    }),
                                );
                            }
                        }
                    }
                }
            }
            "textDocument/didClose" => {
                if let Some(doc) = msg.get("params").and_then(|p| p.get("textDocument")) {
                    if let Some(uri) = doc.get("uri").and_then(|u| u.as_str()) {
                        self.documents.remove(uri);
                    }
                }
            }
            "textDocument/hover" => {
                if let Some(id) = id {
                    let mut found_hover = None;
                    if let Some(params) = msg.get("params") {
                        let uri = params
                            .get("textDocument")
                            .and_then(|td| td.get("uri"))
                            .and_then(|u| u.as_str());
                        let pos = params.get("position");

                        if let (Some(uri), Some(pos)) = (uri, pos) {
                            let line = pos.get("line").and_then(|l| l.as_u64()).unwrap_or(0) as u32;
                            let char =
                                pos.get("character").and_then(|c| c.as_u64()).unwrap_or(0) as u32;

                            if let Some(content) = self.documents.get(uri) {
                                if let Some(hover) = AngoraLanguageEngine::get_hover(
                                    uri,
                                    content,
                                    &LspPosition {
                                        line,
                                        character: char,
                                    },
                                ) {
                                    found_hover = Some(json!({
                                        "contents": {
                                            "kind": "markdown",
                                            "value": hover.contents
                                        },
                                        "range": hover.range
                                    }));
                                }
                            }
                        }
                    }

                    self.send_response(id, found_hover.unwrap_or(serde_json::Value::Null));
                }
            }
            "textDocument/completion" => {
                if let Some(id) = id {
                    let mut completions_json = json!([]);
                    if let Some(params) = msg.get("params") {
                        let uri = params
                            .get("textDocument")
                            .and_then(|td| td.get("uri"))
                            .and_then(|u| u.as_str());
                        let pos = params.get("position");

                        if let (Some(uri), Some(pos)) = (uri, pos) {
                            let line = pos.get("line").and_then(|l| l.as_u64()).unwrap_or(0) as u32;
                            let char =
                                pos.get("character").and_then(|c| c.as_u64()).unwrap_or(0) as u32;

                            if let Some(content) = self.documents.get(uri) {
                                let completions = AngoraLanguageEngine::get_completions(
                                    uri,
                                    content,
                                    &LspPosition {
                                        line,
                                        character: char,
                                    },
                                );
                                completions_json = json!(completions);
                            }
                        }
                    }

                    self.send_response(id, completions_json);
                }
            }
            "textDocument/definition" => {
                if let Some(id) = id {
                    let mut defs_json = json!([]);
                    if let Some(params) = msg.get("params") {
                        let uri = params
                            .get("textDocument")
                            .and_then(|td| td.get("uri"))
                            .and_then(|u| u.as_str());
                        let pos = params.get("position");

                        if let (Some(uri), Some(pos)) = (uri, pos) {
                            let line = pos.get("line").and_then(|l| l.as_u64()).unwrap_or(0) as u32;
                            let char =
                                pos.get("character").and_then(|c| c.as_u64()).unwrap_or(0) as u32;

                            if let Some(content) = self.documents.get(uri) {
                                let defs = AngoraLanguageEngine::get_definition(
                                    uri,
                                    content,
                                    &LspPosition {
                                        line,
                                        character: char,
                                    },
                                );
                                defs_json = json!(defs);
                            }
                        }
                    }

                    self.send_response(id, defs_json);
                }
            }
            "shutdown" => {
                if let Some(id) = id {
                    self.send_response(id, serde_json::Value::Null);
                }
            }
            "exit" => {
                return false; // Exit server loop
            }
            _ => {
                // Unknown method: ignore or respond if request
                if let Some(id) = id {
                    self.send_response(id, serde_json::Value::Null);
                }
            }
        }

        true
    }

    pub fn run_stdio(&mut self) -> io::Result<()> {
        let stdin = io::stdin();
        let mut reader = io::BufReader::new(stdin.lock());
        let mut buffer = String::new();

        loop {
            buffer.clear();
            let mut content_length: Option<usize> = None;

            // 1. Read headers
            loop {
                let mut line = String::new();
                let bytes_read = reader.read_line(&mut line)?;
                if bytes_read == 0 {
                    return Ok(()); // EOF
                }

                let trimmed = line.trim();
                if trimmed.is_empty() {
                    // Empty line marks end of headers
                    break;
                }

                if let Some(stripped) = trimmed.strip_prefix("Content-Length:") {
                    if let Ok(len) = stripped.trim().parse::<usize>() {
                        content_length = Some(len);
                    }
                }
            }

            // 2. Read body
            if let Some(len) = content_length {
                let mut body_bytes = vec![0u8; len];
                reader.read_exact(&mut body_bytes)?;

                if let Ok(body_str) = String::from_utf8(body_bytes) {
                    if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&body_str) {
                        let should_continue = self.handle_message(msg);
                        if !should_continue {
                            break;
                        }
                    }
                }
            }
        }

        Ok(())
    }
}

pub fn run_lsp_server() -> io::Result<()> {
    let mut server = AngoraNativeLspServer::new();
    server.run_stdio()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_handle_initialize() {
        let mut server = AngoraNativeLspServer::new();
        let init_msg = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {}
        });
        let should_continue = server.handle_message(init_msg);
        assert!(should_continue);
    }
}
