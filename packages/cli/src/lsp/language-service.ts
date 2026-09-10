import {
  getDiagnosticsWithRust,
  getHoverWithRust,
  getCompletionsWithRust,
  getDefinitionWithRust,
} from '@angora-js/compiler';
import type {
  LspCompletion,
  LspDefinition,
  LspDiagnostic,
  LspHover,
  LspPosition,
} from './types.ts';

export const ANGORA_HOVER_DOCS: Record<string, string> = {
  '@if':
    '### Angora `@if` Control Flow Block\nRenders nested DOM nodes conditionally based on a reactive signal or boolean expression.\n```html\n@if (isLoggedIn()) {\n  <p>Welcome back!</p>\n} @else {\n  <button>Login</button>\n}\n```',
  '@for':
    '### Angora `@for` Keyed List Block\nRenders lists with fine-grained DOM reconciliation and hardware-accelerated tracking.\n```html\n@for (user of users(); track user.id) {\n  <li>{{ user.name }}</li>\n} @empty {\n  <p>No users found</p>\n}\n```',
  '@switch':
    "### Angora `@switch` Selection Block\nConditionally matches cases against a reactive expression.\n```html\n@switch (status()) {\n  @case ('admin') { <admin-panel /> }\n  @default { <user-panel /> }\n}\n```",
  '@defer':
    '### Angora `@defer` Deferrable Views\nLazily loads and renders non-critical template views based on idle, viewport, timer, or user interaction.\n```html\n@defer (on viewport; prefetch on idle) {\n  <large-chart />\n} @placeholder {\n  <skeleton />\n}\n```',
  uppercase: '### `uppercase` Pipe\nTransforms input string to uppercase: `{{ text | uppercase }}`',
  lowercase: '### `lowercase` Pipe\nTransforms input string to lowercase: `{{ text | lowercase }}`',
  currency:
    "### `currency` Pipe\nFormats numerical signals to localized currency: `{{ price() | currency:'USD' }}`",
  date: "### `date` Pipe\nFormats Date or timestamp value into localized date string: `{{ dateVal | date:'medium' }}`",
  json: '### `json` Pipe\nSerializes objects into formatted JSON string for debugging: `<pre>{{ data | json }}</pre>`',
  slice:
    '### `slice` Pipe\nSlices array or string by start and end index: `{{ list | slice:0:5 }}`',
  async: '### `async` Pipe\nUnwraps Promise or Observable values automatically.',
};

export const BUILTIN_COMPLETIONS: LspCompletion[] = [
  {
    label: '@if',
    kind: 'Snippet',
    detail: 'Angora Control Flow @if block',
    insertText: '@if (${1:condition}) {\n  $0\n}',
  },
  {
    label: '@for',
    kind: 'Snippet',
    detail: 'Angora Control Flow @for block with tracking',
    insertText:
      '@for (${1:item} of ${2:items}(); track ${3:item.id}) {\n  $0\n} @empty {\n  <p>No items</p>\n}',
  },
  {
    label: '@switch',
    kind: 'Snippet',
    detail: 'Angora Control Flow @switch block',
    insertText:
      "@switch (${1:expr}()) {\n  @case (${2:'value'}) {\n    $0\n  }\n  @default {\n  }\n}",
  },
  {
    label: '@defer',
    kind: 'Snippet',
    detail: 'Angora Deferrable View block',
    insertText: '@defer (on ${1:viewport}) {\n  $0\n} @placeholder {\n  <p>Loading...</p>\n}',
  },
  {
    label: '@else',
    kind: 'Snippet',
    detail: 'Angora Control Flow @else block',
    insertText: '@else {\n  $0\n}',
  },
  {
    label: 'uppercase',
    kind: 'Function',
    detail: 'Pipes string to uppercase',
    insertText: 'uppercase',
  },
  {
    label: 'lowercase',
    kind: 'Function',
    detail: 'Pipes string to lowercase',
    insertText: 'lowercase',
  },
  {
    label: 'json',
    kind: 'Function',
    detail: 'Formats value as JSON string',
    insertText: 'json',
  },
  {
    label: 'currency',
    kind: 'Function',
    detail: 'Formats number to localized currency',
    insertText: 'currency',
  },
  {
    label: 'date',
    kind: 'Function',
    detail: 'Formats date to localized string',
    insertText: 'date',
  },
  {
    label: 'slice',
    kind: 'Function',
    detail: 'Slices array or string',
    insertText: 'slice',
  },
  {
    label: 'async',
    kind: 'Function',
    detail: 'Unwraps async observable/promise',
    insertText: 'async',
  },
];

/**
 * 100% Native Rust Angora Language Service
 * Delegates all analysis, semantic checking, hover, definition, and completions
 * directly to the native angora_oxc binary. Zero TypeScript AST simulation.
 */
export class AngoraLanguageService {
  private lastError: Error | null = null;
  private resultCache = new Map<string, unknown>();

  public getLastError(): Error | null {
    return this.lastError;
  }

  public clearCache(): void {
    this.resultCache.clear();
  }

  private getCached<T>(key: string, compute: () => T): T {
    if (this.resultCache.has(key)) {
      return this.resultCache.get(key) as T;
    }

    const value = compute();
    this.resultCache.set(key, value);

    if (this.resultCache.size > 80) {
      const firstKey = this.resultCache.keys().next().value;
      if (firstKey) {
        this.resultCache.delete(firstKey);
      }
    }

    return value;
  }

  private recordError(err: unknown): void {
    this.lastError = err instanceof Error ? err : new Error(String(err));
  }

  /**
   * Retrieves all diagnostics (template syntax, standalone imports, type checks)
   * for a TypeScript or template document using 100% Native Rust OXC.
   */
  public getDiagnostics(uri: string, content: string): LspDiagnostic[] {
    try {
      const cacheKey = `diagnostics:${uri}:${content}`;
      const rustDiags = this.getCached(cacheKey, () => getDiagnosticsWithRust(content, uri));
      this.lastError = null;
      return rustDiags.map(d => ({
        code: d.code,
        message: d.message,
        severity: d.severity as 'error' | 'warning' | 'info',
        range: d.range,
        source: d.source,
      }));
    } catch (err) {
      this.recordError(err);
      return [];
    }
  }

  /**
   * Provides rich hover information at cursor position using 100% Native Rust OXC.
   */
  public getHover(uri: string, content: string, position: LspPosition): LspHover | null {
    try {
      const cacheKey = `hover:${uri}:${position.line}:${position.character}:${content}`;
      const rustHover = this.getCached(cacheKey, () =>
        getHoverWithRust(content, position.line, position.character, uri)
      );
      this.lastError = null;
      if (!rustHover) return null;
      return {
        contents: rustHover.contents,
        range: rustHover.range,
      };
    } catch (err) {
      this.recordError(err);
      return null;
    }
  }

  /**
   * Provides intelligent completions at cursor position using 100% Native Rust OXC.
   */
  public getCompletions(uri: string, content: string, position: LspPosition): LspCompletion[] {
    try {
      const cacheKey = `completions:${uri}:${position.line}:${position.character}:${content}`;
      const rustCompletions = this.getCached(cacheKey, () =>
        getCompletionsWithRust(content, position.line, position.character, uri)
      );
      this.lastError = null;
      return rustCompletions.map(c => ({
        label: c.label,
        kind: c.kind as any,
        detail: c.detail,
        insertText: c.insertText,
        documentation: c.documentation,
        sortText: c.sortText,
      }));
    } catch (err) {
      this.recordError(err);
      return BUILTIN_COMPLETIONS;
    }
  }

  /**
   * Provides Go-to-Definition (F12) locations using 100% Native Rust OXC.
   */
  public getDefinition(uri: string, content: string, position: LspPosition): LspDefinition[] {
    try {
      const cacheKey = `definition:${uri}:${position.line}:${position.character}:${content}`;
      const rustDefs = this.getCached(cacheKey, () =>
        getDefinitionWithRust(content, position.line, position.character, uri)
      );
      this.lastError = null;
      return rustDefs.map(d => ({
        uri: d.uri,
        range: d.range,
        symbol: d.symbol,
      }));
    } catch (err) {
      this.recordError(err);
      return [];
    }
  }
}
