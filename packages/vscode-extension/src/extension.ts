import {
  AngoraLanguageService,
  ANGORA_HOVER_DOCS,
  BUILTIN_COMPLETIONS,
  type LspPosition,
  type LspRange,
  type LspDiagnostic,
  type LspHover,
  type LspDefinition,
  type LspCompletion,
} from '@angora-js/cli';
import { tryFindRustCompilerBinary } from '@angora-js/compiler';
import { spawn } from 'node:child_process';

export { ANGORA_HOVER_DOCS, BUILTIN_COMPLETIONS };
export type { LspPosition, LspRange, LspDiagnostic, LspHover, LspDefinition, LspCompletion };

const defaultService = new AngoraLanguageService();
const ANGORA_DOCUMENT_SELECTORS = ['typescript', 'angora-template', 'html'];

interface JsonRpcPending {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface DiagnosticsWaiter {
  resolve: (value: LspDiagnostic[]) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface CompletionItem {
  label: string;
  kind: 'Keyword' | 'Snippet' | 'Function' | 'Property' | 'Method' | 'Class' | 'Variable';
  detail: string;
  insertText: string;
  documentation?: string;
}

export const ANGORA_COMPLETIONS: CompletionItem[] = BUILTIN_COMPLETIONS;

export class AngoraNativeLspClient {
  private child: any = null;
  private buffer = '';
  private nextId = 1;
  private pending = new Map<number, JsonRpcPending>();
  private documents = new Map<string, string>();
  private diagnosticsWaiters = new Map<string, DiagnosticsWaiter[]>();
  private startPromise: Promise<void> | null = null;
  private disabled = false;
  private requestTimeoutMs: number;

  constructor(
    private binaryPath: string,
    options: { requestTimeoutMs?: number } = {}
  ) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 2500;
  }

  public async start(): Promise<void> {
    if (this.disabled) {
      throw new Error('Native Angora LSP client is disabled.');
    }
    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = new Promise((resolve, reject) => {
      try {
        this.child = spawn(this.binaryPath, ['--lsp-server'], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (err) {
        this.disabled = true;
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      this.child.stdout?.on('data', (chunk: Buffer) => {
        this.buffer += chunk.toString('utf-8');
        this.drainMessages();
      });

      this.child.stderr?.on('data', () => {});

      this.child.on('error', (err: Error) => {
        this.disabled = true;
        this.rejectAll(err);
        reject(err);
      });

      this.child.on('exit', () => {
        this.disabled = true;
        this.rejectAll(new Error('Native Angora LSP server exited.'));
      });

      this.sendRequest('initialize', {}).then(
        () => {
          this.sendNotification('initialized', {});
          resolve();
        },
        err => {
          this.disabled = true;
          reject(err);
        }
      );
    });

    return this.startPromise;
  }

  public async getDiagnostics(uri: string, content: string): Promise<LspDiagnostic[]> {
    await this.start();

    const diagnosticsPromise = new Promise<LspDiagnostic[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.removeDiagnosticsWaiter(uri, waiter);
        reject(new Error('Timed out waiting for Angora diagnostics.'));
      }, this.requestTimeoutMs);

      const waiter: DiagnosticsWaiter = { resolve, reject, timer };
      const waiters = this.diagnosticsWaiters.get(uri) || [];
      waiters.push(waiter);
      this.diagnosticsWaiters.set(uri, waiters);
    });

    this.syncDocument(uri, content);
    return diagnosticsPromise;
  }

  public async getHover(
    uri: string,
    content: string,
    position: LspPosition
  ): Promise<LspHover | null> {
    await this.start();
    this.syncDocument(uri, content);
    const result = await this.sendRequest('textDocument/hover', {
      textDocument: { uri },
      position,
    });
    if (!result) return null;
    const contents =
      typeof result.contents === 'string' ? result.contents : result.contents?.value || '';
    return {
      contents,
      range: result.range,
    };
  }

  public async getCompletions(
    uri: string,
    content: string,
    position: LspPosition
  ): Promise<LspCompletion[]> {
    await this.start();
    this.syncDocument(uri, content);
    const result = await this.sendRequest('textDocument/completion', {
      textDocument: { uri },
      position,
    });
    const items = Array.isArray(result) ? result : result?.items || [];
    return items.map((item: any) => ({
      label: item.label,
      kind: item.kind,
      detail: item.detail,
      insertText: item.insertText || item.insert_text || item.label,
      documentation: item.documentation,
      sortText: item.sortText,
    }));
  }

  public async getDefinition(
    uri: string,
    content: string,
    position: LspPosition
  ): Promise<LspDefinition[]> {
    await this.start();
    this.syncDocument(uri, content);
    const result = await this.sendRequest('textDocument/definition', {
      textDocument: { uri },
      position,
    });
    return Array.isArray(result) ? result : [];
  }

  public dispose(): void {
    for (const waiters of this.diagnosticsWaiters.values()) {
      for (const waiter of waiters) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error('Native Angora LSP client disposed.'));
      }
    }
    this.diagnosticsWaiters.clear();
    this.rejectAll(new Error('Native Angora LSP client disposed.'));

    if (this.child) {
      try {
        this.sendNotification('exit', {});
      } catch {}
      this.child.kill();
      this.child = null;
    }
    this.startPromise = null;
    this.disabled = true;
  }

  private syncDocument(uri: string, content: string): void {
    if (!this.documents.has(uri)) {
      this.documents.set(uri, content);
      this.sendNotification('textDocument/didOpen', {
        textDocument: {
          uri,
          languageId: 'typescript',
          version: 1,
          text: content,
        },
      });
      return;
    }

    if (this.documents.get(uri) === content) {
      return;
    }

    this.documents.set(uri, content);
    this.sendNotification('textDocument/didChange', {
      textDocument: {
        uri,
        version: Date.now(),
      },
      contentChanges: [{ text: content }],
    });
  }

  private sendRequest(method: string, params: any): Promise<any> {
    const id = this.nextId++;
    const payload = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for Angora LSP response: ${method}`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });

    this.writeMessage(payload);
    return promise;
  }

  private sendNotification(method: string, params: any): void {
    this.writeMessage({
      jsonrpc: '2.0',
      method,
      params,
    });
  }

  private writeMessage(payload: Record<string, any>): void {
    if (!this.child?.stdin?.writable) {
      throw new Error('Native Angora LSP server is not writable.');
    }
    const json = JSON.stringify(payload);
    const byteLength = Buffer.byteLength(json, 'utf-8');
    this.child.stdin.write(`Content-Length: ${byteLength}\r\n\r\n${json}`);
  }

  private drainMessages(): void {
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;

      const headers = this.buffer.slice(0, headerEnd);
      const match = headers.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }

      const contentLength = Number(match[1]);
      const bodyStart = headerEnd + 4;
      const messageEnd = bodyStart + contentLength;
      if (this.buffer.length < messageEnd) return;

      const body = this.buffer.slice(bodyStart, messageEnd);
      this.buffer = this.buffer.slice(messageEnd);

      try {
        this.handleMessage(JSON.parse(body));
      } catch {}
    }
  }

  private handleMessage(message: any): void {
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message || 'Angora LSP request failed.'));
        } else {
          pending.resolve(message.result);
        }
      }
      return;
    }

    if (message.method === 'textDocument/publishDiagnostics') {
      const uri = message.params?.uri;
      const diagnostics = message.params?.diagnostics || [];
      if (!uri) return;
      const waiters = this.diagnosticsWaiters.get(uri) || [];
      this.diagnosticsWaiters.delete(uri);
      for (const waiter of waiters) {
        clearTimeout(waiter.timer);
        waiter.resolve(diagnostics);
      }
    }
  }

  private rejectAll(err: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pending.clear();
  }

  private removeDiagnosticsWaiter(uri: string, waiter: DiagnosticsWaiter): void {
    const waiters = this.diagnosticsWaiters.get(uri);
    if (!waiters) return;
    const next = waiters.filter(item => item !== waiter);
    if (next.length > 0) {
      this.diagnosticsWaiters.set(uri, next);
    } else {
      this.diagnosticsWaiters.delete(uri);
    }
  }
}

export interface TextEditSuggestion {
  range: LspRange;
  newText: string;
}

export interface SuggestedCodeAction {
  title: string;
  kind: 'quickfix';
  edit?: TextEditSuggestion;
}

function toPascalCaseName(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function offsetAt(content: string, pos: LspPosition): number {
  const lines = content.split('\n');
  let offset = 0;
  for (let i = 0; i < pos.line && i < lines.length; i++) {
    offset += lines[i].length + 1;
  }
  return offset + pos.character;
}

function positionAt(content: string, offset: number): LspPosition {
  const safeOffset = Math.max(0, Math.min(offset, content.length));
  const before = content.slice(0, safeOffset);
  const lines = before.split('\n');
  return {
    line: lines.length - 1,
    character: lines[lines.length - 1].length,
  };
}

function rangeFromOffsets(content: string, start: number, end: number): LspRange {
  return {
    start: positionAt(content, start),
    end: positionAt(content, end),
  };
}

function inferTemplateSymbolName(diagnostic: LspDiagnostic): string | null {
  const quoted = diagnostic.message.match(/'([^']+)'/);
  return quoted?.[1] || null;
}

function createClassInsertion(
  content: string,
  diagnostic: LspDiagnostic
): TextEditSuggestion | null {
  const className = diagnostic.message.match(/type '([^']+)'/)?.[1];
  if (!className) return null;

  const classRegex = new RegExp(`class\\s+${className}\\b[\\s\\S]*?\\n}`, 'm');
  const match = classRegex.exec(content);
  if (!match || match.index === undefined) return null;

  const insertOffset = match.index + match[0].lastIndexOf('\n}');
  const range = rangeFromOffsets(content, insertOffset, insertOffset);
  const prop = inferTemplateSymbolName(diagnostic);
  if (!prop) return null;

  const diagStart = offsetAt(content, diagnostic.range.start);
  const afterToken = content.slice(diagStart + prop.length, diagStart + prop.length + 2);
  const isCall = afterToken === '()';
  const newText = isCall
    ? `\n  ${prop}(): any {\n    return undefined;\n  }\n`
    : `\n  ${prop}: any = undefined;\n`;

  return { range, newText };
}

function createImportsEdit(content: string, symbolName: string): TextEditSuggestion | null {
  const importsMatch = /imports\s*:\s*\[([\s\S]*?)\]/m.exec(content);
  if (importsMatch && importsMatch.index !== undefined) {
    const full = importsMatch[0];
    const inner = importsMatch[1].trim();
    if (
      inner
        .split(',')
        .map(s => s.trim())
        .includes(symbolName)
    )
      return null;

    const closingBracketOffset = importsMatch.index + full.lastIndexOf(']');
    const newText = inner ? `, ${symbolName}` : symbolName;
    return {
      range: rangeFromOffsets(content, closingBracketOffset, closingBracketOffset),
      newText,
    };
  }

  const componentObjectMatch = /@Component\s*\(\s*\{/m.exec(content);
  if (!componentObjectMatch || componentObjectMatch.index === undefined) return null;

  const insertOffset = componentObjectMatch.index + componentObjectMatch[0].length;
  return {
    range: rangeFromOffsets(content, insertOffset, insertOffset),
    newText: `\n  imports: [${symbolName}],`,
  };
}

export function getSuggestedCodeActions(
  content: string,
  diagnostic: LspDiagnostic
): SuggestedCodeAction[] {
  const actions: SuggestedCodeAction[] = [];

  if (diagnostic.code === 'TS2322') {
    const signalName = diagnostic.message.match(/Did you mean to call '([^']+\(\))'/)?.[1];
    if (signalName) {
      const start = offsetAt(content, diagnostic.range.start);
      const end = offsetAt(content, diagnostic.range.end);
      actions.push({
        title: `Call signal as ${signalName}`,
        kind: 'quickfix',
        edit: {
          range: diagnostic.range,
          newText: signalName,
        },
      });

      if (content.slice(start, end) !== signalName.replace(/\(\)$/, '')) {
        actions.pop();
      }
    }
  }

  if (diagnostic.code === 'TS2339') {
    const prop = inferTemplateSymbolName(diagnostic);
    const edit = createClassInsertion(content, diagnostic);
    if (prop && edit) {
      const title = edit.newText.includes(`${prop}()`)
        ? `Create method ${prop}()`
        : `Create property ${prop}`;
      actions.push({ title, kind: 'quickfix', edit });
    }
  }

  if (diagnostic.code === 'NG8001') {
    const tagName = inferTemplateSymbolName(diagnostic);
    if (tagName) {
      const symbolName = `${toPascalCaseName(tagName)}Component`;
      const edit = createImportsEdit(content, symbolName);
      if (edit) {
        actions.push({
          title: `Add ${symbolName} to @Component.imports`,
          kind: 'quickfix',
          edit,
        });
      }
    }
  }

  if (diagnostic.code === 'NG8004') {
    const pipeName = diagnostic.message.match(/name '([^']+)'/)?.[1];
    if (pipeName) {
      const symbolName = `${toPascalCaseName(pipeName)}Pipe`;
      const edit = createImportsEdit(content, symbolName);
      if (edit) {
        actions.push({
          title: `Add ${symbolName} to @Component.imports`,
          kind: 'quickfix',
          edit,
        });
      }
    }
  }

  return actions;
}

export function toVsCompletionKind(vscode: any, kind: LspCompletion['kind']): any {
  const map: Record<LspCompletion['kind'], any> = {
    Keyword: vscode.CompletionItemKind.Keyword,
    Snippet: vscode.CompletionItemKind.Snippet,
    Function: vscode.CompletionItemKind.Function,
    Property: vscode.CompletionItemKind.Property,
    Method: vscode.CompletionItemKind.Method,
    Class: vscode.CompletionItemKind.Class,
    Variable: vscode.CompletionItemKind.Variable,
  };
  return map[kind] || vscode.CompletionItemKind.Text;
}

export function getHoverInfo(
  target: string,
  position?: LspPosition,
  uri: string = 'file:///workspace/src/app.component.ts'
): string | null {
  if (position) {
    const hover = defaultService.getHover(uri, target, position);
    return hover ? hover.contents : null;
  }

  const clean = target.trim();
  return ANGORA_HOVER_DOCS[clean] || null;
}

export function getCompletions(
  prefixOrContent: string,
  position?: LspPosition,
  uri: string = 'file:///workspace/src/app.component.ts'
): CompletionItem[] {
  if (position) {
    return defaultService.getCompletions(uri, prefixOrContent, position);
  }

  if (!prefixOrContent) return ANGORA_COMPLETIONS;
  const lower = prefixOrContent.toLowerCase();
  return ANGORA_COMPLETIONS.filter(item => item.label.toLowerCase().includes(lower));
}

export function getDefinition(
  content: string,
  position: LspPosition,
  uri: string = 'file:///workspace/src/app.component.ts'
): LspDefinition[] {
  return defaultService.getDefinition(uri, content, position);
}

export function diagnoseDocument(
  content: string,
  uri: string = 'file:///workspace/src/app.component.ts'
): Array<{
  message: string;
  severity: string;
  code?: string;
  line?: number;
  column?: number;
  range?: LspRange;
}> {
  const diags = defaultService.getDiagnostics(uri, content);
  return diags.map(d => ({
    message: d.message,
    severity: d.severity,
    code: d.code,
    line: d.range.start.line + 1,
    column: d.range.start.character + 1,
    range: d.range,
  }));
}

export function findTemplateReferences(content: string): Array<{ name: string; position: number }> {
  const regex = /#([a-zA-Z0-9_-]+)/g;
  const matches: Array<{ name: string; position: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    matches.push({ name: m[1], position: m.index });
  }
  return matches;
}

/**
 * VS Code Extension Activation Lifecycle
 */
export function activate(context: any): void {
  // If running inside VS Code extension host
  try {
    let vscode: any;
    try {
      vscode = require('vscode');
    } catch {
      vscode = (globalThis as any).vscode;
    }
    if (!vscode) return;
    let warnedAboutCompiler = false;

    // Auto-detect native compiler binary in open workspace folders
    try {
      const fs = require('node:fs');
      const path = require('node:path');
      const exeName = process.platform === 'win32' ? 'angora_oxc.exe' : 'angora_oxc';
      if (!process.env.ANGORA_OXC_BIN && vscode.workspace && vscode.workspace.workspaceFolders) {
        for (const folder of vscode.workspace.workspaceFolders) {
          const root = folder.uri.fsPath;
          const candidates = [
            path.join(root, 'target', 'release', exeName),
            path.join(root, 'target', 'debug', exeName),
            path.join(root, 'node_modules', '.bin', exeName),
            path.join(
              root,
              'node_modules',
              '@angora-js',
              'compiler-' + process.platform + '-' + process.arch,
              'bin',
              exeName
            ),
          ];
          for (const cand of candidates) {
            if (fs.existsSync(cand)) {
              process.env.ANGORA_OXC_BIN = cand;
              break;
            }
          }
          if (process.env.ANGORA_OXC_BIN) break;
        }
      }
    } catch {}

    const compilerBinary = tryFindRustCompilerBinary();
    const nativeClient = compilerBinary ? new AngoraNativeLspClient(compilerBinary) : null;
    if (nativeClient) {
      context.subscriptions.push({ dispose: () => nativeClient.dispose() });
    }

    if (!compilerBinary && !warnedAboutCompiler) {
      warnedAboutCompiler = true;
      vscode.window?.showWarningMessage?.(
        'Angora Language Tools could not find the native angora_oxc compiler. Template diagnostics, hover, definitions, and semantic completions may be unavailable.'
      );
    }

    const diagnosticCollection = vscode.languages.createDiagnosticCollection('angora');
    context.subscriptions.push(diagnosticCollection);
    const diagnosticTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const latestDiagnostics = new Map<string, LspDiagnostic[]>();

    const warnAnalysisUnavailable = (err: unknown) => {
      if (warnedAboutCompiler) return;
      warnedAboutCompiler = true;
      const message = err instanceof Error ? err.message : String(err);
      vscode.window?.showWarningMessage?.(
        `Angora Language Tools native LSP unavailable: ${message}`
      );
    };

    // Document listener for diagnostics
    const updateDiagnosticsNow = async (document: any) => {
      if (!ANGORA_DOCUMENT_SELECTORS.includes(document.languageId)) {
        return;
      }

      const content = document.getText();
      // Skip typescript files without @Component to save resources
      if (document.languageId === 'typescript' && !content.includes('@Component')) {
        diagnosticCollection.delete(document.uri);
        return;
      }

      let diags: any[] = [];
      try {
        if (nativeClient) {
          diags = await nativeClient.getDiagnostics(document.uri.toString(), content);
        } else {
          diags = defaultService.getDiagnostics(document.uri.toString(), content);
        }
      } catch (err) {
        warnAnalysisUnavailable(err);
        try {
          diags = defaultService.getDiagnostics(document.uri.toString(), content);
        } catch {
          diags = [];
        }
      }
      const lastError = defaultService.getLastError();
      if (lastError && !warnedAboutCompiler) {
        warnedAboutCompiler = true;
        vscode.window?.showWarningMessage?.(
          `Angora Language Tools analysis is unavailable: ${lastError.message}`
        );
      }
      latestDiagnostics.set(document.uri.toString(), diags);

      const vsDiagnostics = diags.map(d => {
        const start = new vscode.Position(d.range.start.line, d.range.start.character);
        const end = new vscode.Position(d.range.end.line, d.range.end.character);
        const range = new vscode.Range(start, end);
        const severity =
          d.severity === 'error'
            ? vscode.DiagnosticSeverity.Error
            : d.severity === 'warning'
              ? vscode.DiagnosticSeverity.Warning
              : vscode.DiagnosticSeverity.Information;

        const diag = new vscode.Diagnostic(range, d.message, severity);
        diag.source = d.source || 'angora';
        diag.code = d.code;
        return diag;
      });

      diagnosticCollection.set(document.uri, vsDiagnostics);
    };

    const updateDiagnostics = (document: any) => {
      const key = document.uri.toString();
      const existing = diagnosticTimers.get(key);
      if (existing) {
        clearTimeout(existing);
      }
      diagnosticTimers.set(
        key,
        setTimeout(() => {
          diagnosticTimers.delete(key);
          updateDiagnosticsNow(document).catch(warnAnalysisUnavailable);
        }, 250)
      );
    };

    vscode.workspace.onDidChangeTextDocument(
      (e: any) => updateDiagnostics(e.document),
      null,
      context.subscriptions
    );
    vscode.workspace.onDidOpenTextDocument(updateDiagnostics, null, context.subscriptions);

    // Initial check for all open documents
    if (vscode.workspace.textDocuments) {
      vscode.workspace.textDocuments.forEach((document: any) => {
        updateDiagnosticsNow(document).catch(warnAnalysisUnavailable);
      });
    }

    // Hover Provider
    const hoverProvider = {
      async provideHover(document: any, position: any) {
        const pos: LspPosition = { line: position.line, character: position.character };
        let hover: LspHover | null = null;
        try {
          hover = nativeClient
            ? await nativeClient.getHover(document.uri.toString(), document.getText(), pos)
            : defaultService.getHover(document.uri.toString(), document.getText(), pos);
        } catch (err) {
          warnAnalysisUnavailable(err);
          hover = defaultService.getHover(document.uri.toString(), document.getText(), pos);
        }
        if (hover) {
          const md = new vscode.MarkdownString(hover.contents);
          md.isTrusted = true;
          return new vscode.Hover(md);
        }
        return null;
      },
    };
    context.subscriptions.push(
      vscode.languages.registerHoverProvider(ANGORA_DOCUMENT_SELECTORS, hoverProvider)
    );

    // Definition Provider (F12)
    const definitionProvider = {
      async provideDefinition(document: any, position: any) {
        const pos: LspPosition = { line: position.line, character: position.character };
        let defs: LspDefinition[] = [];
        try {
          defs = nativeClient
            ? await nativeClient.getDefinition(document.uri.toString(), document.getText(), pos)
            : defaultService.getDefinition(document.uri.toString(), document.getText(), pos);
        } catch (err) {
          warnAnalysisUnavailable(err);
          defs = defaultService.getDefinition(document.uri.toString(), document.getText(), pos);
        }
        if (defs.length > 0) {
          return defs.map(d => {
            const targetUri = vscode.Uri.parse(d.uri);
            const start = new vscode.Position(d.range.start.line, d.range.start.character);
            const end = new vscode.Position(d.range.end.line, d.range.end.character);
            return new vscode.Location(targetUri, new vscode.Range(start, end));
          });
        }
        return null;
      },
    };
    context.subscriptions.push(
      vscode.languages.registerDefinitionProvider(ANGORA_DOCUMENT_SELECTORS, definitionProvider)
    );

    // Completion Provider
    const completionProvider = {
      async provideCompletionItems(document: any, position: any) {
        const pos: LspPosition = { line: position.line, character: position.character };
        let completions: LspCompletion[] = [];
        try {
          completions = nativeClient
            ? await nativeClient.getCompletions(document.uri.toString(), document.getText(), pos)
            : defaultService.getCompletions(document.uri.toString(), document.getText(), pos);
        } catch (err) {
          warnAnalysisUnavailable(err);
          completions = defaultService.getCompletions(
            document.uri.toString(),
            document.getText(),
            pos
          );
        }
        return completions.map(c => {
          const item = new vscode.CompletionItem(c.label, toVsCompletionKind(vscode, c.kind));
          item.detail = c.detail;
          item.insertText = new vscode.SnippetString(c.insertText);
          if (c.documentation) {
            item.documentation = new vscode.MarkdownString(c.documentation);
          }
          if (c.sortText) {
            item.sortText = c.sortText;
          }
          return item;
        });
      },
    };
    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        ANGORA_DOCUMENT_SELECTORS,
        completionProvider,
        '.',
        '@',
        '(',
        '[',
        '#',
        ':',
        '|'
      )
    );

    const codeActionProvider = {
      provideCodeActions(document: any, _range: any, contextArg: any) {
        const content = document.getText();
        const uri = document.uri.toString();
        const serviceDiagnostics = latestDiagnostics.get(uri) || [];
        const diagnostics = contextArg?.diagnostics?.length
          ? contextArg.diagnostics
          : serviceDiagnostics;

        const actions: any[] = [];
        for (const diagnostic of diagnostics) {
          const lspDiagnostic: LspDiagnostic = {
            code: String(diagnostic.code || ''),
            message: diagnostic.message,
            severity:
              diagnostic.severity === vscode.DiagnosticSeverity.Warning ? 'warning' : 'error',
            range: {
              start: {
                line: diagnostic.range.start.line,
                character: diagnostic.range.start.character,
              },
              end: {
                line: diagnostic.range.end.line,
                character: diagnostic.range.end.character,
              },
            },
            source: diagnostic.source,
          };

          for (const suggested of getSuggestedCodeActions(content, lspDiagnostic)) {
            if (!suggested.edit) continue;
            const action = new vscode.CodeAction(suggested.title, vscode.CodeActionKind.QuickFix);
            action.diagnostics = [diagnostic];
            action.isPreferred = true;
            action.edit = new vscode.WorkspaceEdit();
            const start = new vscode.Position(
              suggested.edit.range.start.line,
              suggested.edit.range.start.character
            );
            const end = new vscode.Position(
              suggested.edit.range.end.line,
              suggested.edit.range.end.character
            );
            action.edit.replace(document.uri, new vscode.Range(start, end), suggested.edit.newText);
            actions.push(action);
          }
        }

        return actions;
      },
    };
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(ANGORA_DOCUMENT_SELECTORS, codeActionProvider, {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
      })
    );
  } catch {
    // Non-vscode test or headless runner environment
  }
}

export function deactivate(): void {}
