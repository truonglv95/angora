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

export { ANGORA_HOVER_DOCS, BUILTIN_COMPLETIONS };
export type { LspPosition, LspRange, LspDiagnostic, LspHover, LspDefinition, LspCompletion };

const defaultService = new AngoraLanguageService();

export interface CompletionItem {
  label: string;
  kind: 'Keyword' | 'Snippet' | 'Function' | 'Property' | 'Method' | 'Class' | 'Variable';
  detail: string;
  insertText: string;
  documentation?: string;
}

export const ANGORA_COMPLETIONS: CompletionItem[] = BUILTIN_COMPLETIONS;

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
  const regex = /#([a-zA-Z0-9_\-]+)/g;
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

    const diagnosticCollection = vscode.languages.createDiagnosticCollection('angora');
    context.subscriptions.push(diagnosticCollection);

    // Document listener for diagnostics
    const updateDiagnostics = (document: any) => {
      if (
        document.languageId !== 'typescript' &&
        document.languageId !== 'angora-template' &&
        document.languageId !== 'html'
      ) {
        return;
      }

      const content = document.getText();
      // Skip typescript files without @Component to save resources
      if (document.languageId === 'typescript' && !content.includes('@Component')) {
        diagnosticCollection.delete(document.uri);
        return;
      }

      const diags = defaultService.getDiagnostics(document.uri.toString(), content);

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

    vscode.workspace.onDidChangeTextDocument(
      (e: any) => updateDiagnostics(e.document),
      null,
      context.subscriptions
    );
    vscode.workspace.onDidOpenTextDocument(updateDiagnostics, null, context.subscriptions);

    // Initial check for all open documents
    if (vscode.workspace.textDocuments) {
      vscode.workspace.textDocuments.forEach(updateDiagnostics);
    }

    // Hover Provider
    const hoverProvider = {
      provideHover(document: any, position: any) {
        const pos: LspPosition = { line: position.line, character: position.character };
        const hover = defaultService.getHover(document.uri.toString(), document.getText(), pos);
        if (hover) {
          const md = new vscode.MarkdownString(hover.contents);
          md.isTrusted = true;
          return new vscode.Hover(md);
        }
        return null;
      },
    };
    context.subscriptions.push(
      vscode.languages.registerHoverProvider(['typescript', 'angora-template'], hoverProvider)
    );

    // Definition Provider (F12)
    const definitionProvider = {
      provideDefinition(document: any, position: any) {
        const pos: LspPosition = { line: position.line, character: position.character };
        const defs = defaultService.getDefinition(document.uri.toString(), document.getText(), pos);
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
      vscode.languages.registerDefinitionProvider(
        ['typescript', 'angora-template'],
        definitionProvider
      )
    );

    // Completion Provider
    const completionProvider = {
      provideCompletionItems(document: any, position: any) {
        const pos: LspPosition = { line: position.line, character: position.character };
        const completions = defaultService.getCompletions(
          document.uri.toString(),
          document.getText(),
          pos
        );
        return completions.map(c => {
          const item = new vscode.CompletionItem(c.label);
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
        ['typescript', 'angora-template'],
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
  } catch (err) {
    // Non-vscode test or headless runner environment
  }
}

export function deactivate(): void {}
