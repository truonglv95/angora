export interface LintDiagnostic {
  rule: string;
  message: string;
  line: number;
  column: number;
  fix?: {
    replaceText: string;
  };
}

/**
 * Rule: no-uncalled-signals
 * Warns when a signal, computed, or input is referenced in a template without calling it ()
 * e.g., {{ count }} -> should be {{ count() }}
 * or [disabled]="isLoading" -> should be [disabled]="isLoading()"
 */
export function checkNoUncalledSignals(sourceCode: string): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];

  // 1. Identify signal property names in component class
  const signalProps = new Set<string>();
  const signalDeclRegex =
    /(?:readonly\s+)?([A-Za-z0-9_$]+)\s*=\s*(?:signal|computed|input|linkedSignal)\s*(?:<[^>]+>)?\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = signalDeclRegex.exec(sourceCode)) !== null) {
    signalProps.add(match[1]);
  }

  if (signalProps.size === 0) {
    return diagnostics;
  }

  // 2. Extract template content
  const tmplMatch = sourceCode.match(/template\s*:\s*`([\s\S]*?)`/);
  if (!tmplMatch) return diagnostics;

  const template = tmplMatch[1];
  const templateStartOffset = tmplMatch.index! + tmplMatch[0].indexOf('`') + 1;
  const lines = sourceCode.slice(0, templateStartOffset).split('\n');
  const baseLine = lines.length;

  // 3. Scan interpolations {{ expr }} for uncalled signals
  const interpRegex = /\{\{([\s\S]*?)\}\}/g;
  let interpMatch: RegExpExecArray | null;

  while ((interpMatch = interpRegex.exec(template)) !== null) {
    const expr = interpMatch[1].trim();
    for (const prop of signalProps) {
      // Regex for variable word boundary not followed by (
      const wordRegex = new RegExp(`\\b${prop}\\b(?!\\s*\\()`, 'g');
      if (wordRegex.test(expr)) {
        const offsetInTmpl = interpMatch.index;
        const lineInTmpl = template.slice(0, offsetInTmpl).split('\n').length;
        diagnostics.push({
          rule: 'angora/no-uncalled-signals',
          message: `Reactive signal '${prop}' in interpolation must be called with '()' to track its reactive value. Did you mean '${prop}()'?`,
          line: baseLine + lineInTmpl - 1,
          column: 1,
          fix: {
            replaceText: `${prop}()`,
          },
        });
      }
    }
  }

  // 4. Scan property bindings [prop]="expr"
  const propBindingRegex = /\[([A-Za-z0-9_.-]+)\]\s*=\s*["']([^"']+)["']/g;
  let propMatch: RegExpExecArray | null;

  while ((propMatch = propBindingRegex.exec(template)) !== null) {
    const expr = propMatch[2].trim();
    for (const prop of signalProps) {
      if (expr === prop) {
        const offsetInTmpl = propMatch.index;
        const lineInTmpl = template.slice(0, offsetInTmpl).split('\n').length;
        diagnostics.push({
          rule: 'angora/no-uncalled-signals',
          message: `Property binding '[${propMatch[1]}]="${expr}"' references signal '${prop}' without calling it. Did you mean '[${propMatch[1]}]="${prop}()"'?`,
          line: baseLine + lineInTmpl - 1,
          column: 1,
          fix: {
            replaceText: `${prop}()`,
          },
        });
      }
    }
  }

  return diagnostics;
}
