import { AngoraLanguageService } from './language-service.ts';
import type { LspDiagnostic, LspPosition } from './types.ts';

export class AngoraLspServer {
  private service = new AngoraLanguageService();
  private documents = new Map<string, string>();

  /**
   * Starts reading LSP JSON-RPC messages from stdin and writes responses to stdout
   */
  public start(): void {
    let buffer = '';

    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk: string) => {
      buffer += chunk;

      while (true) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) break;

        const headers = buffer.slice(0, headerEnd);
        const match = headers.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          buffer = buffer.slice(headerEnd + 4);
          continue;
        }

        const contentLength = parseInt(match[1], 10);
        const bodyStart = headerEnd + 4;
        const totalMessageLength = bodyStart + contentLength;

        if (buffer.length < totalMessageLength) {
          // Incomplete body, wait for next chunk
          break;
        }

        const bodyStr = buffer.slice(bodyStart, totalMessageLength);
        buffer = buffer.slice(totalMessageLength);

        try {
          const message = JSON.parse(bodyStr);
          this.handleMessage(message);
        } catch (err) {
          console.error('[Angora LSP] Error parsing message JSON:', err);
        }
      }
    });

    process.stdin.resume();
  }

  private sendMessage(msg: Record<string, any>): void {
    const json = JSON.stringify(msg);
    const byteLength = Buffer.byteLength(json, 'utf-8');
    const response = `Content-Length: ${byteLength}\r\n\r\n${json}`;
    process.stdout.write(response);
  }

  private sendResponse(id: number | string | null, result: any): void {
    this.sendMessage({
      jsonrpc: '2.0',
      id,
      result,
    });
  }

  private sendNotification(method: string, params: any): void {
    this.sendMessage({
      jsonrpc: '2.0',
      method,
      params,
    });
  }

  public handleMessage(message: any): any {
    const { id, method, params } = message;

    switch (method) {
      case 'initialize': {
        return this.sendResponse(id, {
          capabilities: {
            textDocumentSync: 1, // Full sync
            hoverProvider: true,
            definitionProvider: true,
            completionProvider: {
              triggerCharacters: ['.', '@', '(', '[', '#', ':', '|'],
            },
          },
          serverInfo: {
            name: 'angora-language-server',
            version: '0.1.0',
          },
        });
      }

      case 'initialized': {
        // Client confirmed initialization
        return;
      }

      case 'textDocument/didOpen': {
        const doc = params.textDocument;
        this.documents.set(doc.uri, doc.text);
        this.publishDiagnostics(doc.uri, doc.text);
        return;
      }

      case 'textDocument/didChange': {
        const uri = params.textDocument.uri;
        const changes = params.contentChanges;
        if (changes && changes.length > 0) {
          const newText = changes[changes.length - 1].text;
          this.documents.set(uri, newText);
          this.publishDiagnostics(uri, newText);
        }
        return;
      }

      case 'textDocument/didClose': {
        this.documents.delete(params.textDocument.uri);
        return;
      }

      case 'textDocument/hover': {
        const uri = params.textDocument.uri;
        const pos: LspPosition = params.position;
        const content = this.documents.get(uri);
        if (!content) {
          return this.sendResponse(id, null);
        }

        const hover = this.service.getHover(uri, content, pos);
        if (!hover) {
          return this.sendResponse(id, null);
        }

        return this.sendResponse(id, {
          contents: {
            kind: 'markdown',
            value: hover.contents,
          },
          range: hover.range,
        });
      }

      case 'textDocument/definition': {
        const uri = params.textDocument.uri;
        const pos: LspPosition = params.position;
        const content = this.documents.get(uri);
        if (!content) {
          return this.sendResponse(id, []);
        }

        const defs = this.service.getDefinition(uri, content, pos);
        const locations = defs.map(d => ({
          uri: d.uri,
          range: d.range,
        }));
        return this.sendResponse(id, locations);
      }

      case 'textDocument/completion': {
        const uri = params.textDocument.uri;
        const pos: LspPosition = params.position;
        const content = this.documents.get(uri) || '';
        const completions = this.service.getCompletions(uri, content, pos);
        return this.sendResponse(id, {
          isIncomplete: false,
          items: completions,
        });
      }

      case 'shutdown': {
        return this.sendResponse(id, null);
      }

      case 'exit': {
        process.exit(0);
        return;
      }

      default: {
        if (id !== undefined) {
          this.sendResponse(id, null);
        }
        return;
      }
    }
  }

  private publishDiagnostics(uri: string, content: string): void {
    const diags = this.service.getDiagnostics(uri, content);
    const lspDiags = diags.map((d: LspDiagnostic) => ({
      range: d.range,
      severity: d.severity === 'error' ? 1 : d.severity === 'warning' ? 2 : 3,
      message: d.message,
      code: d.code,
      source: d.source || 'angora',
    }));

    this.sendNotification('textDocument/publishDiagnostics', {
      uri,
      diagnostics: lspDiags,
    });
  }
}

if (import.meta.main) {
  const server = new AngoraLspServer();
  server.start();
}
