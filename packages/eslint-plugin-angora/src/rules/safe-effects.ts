import type { LintDiagnostic } from './no-uncalled-signals.ts';

/**
 * Rule: safe-effects
 * Detects effect() calls that are made outside of an injection context (e.g. inside methods or event handlers)
 * without explicitly passing an Injector option.
 */
export function checkSafeEffects(sourceCode: string): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];

  // Match methods inside classes: methodName(...) { ... }
  // Look for effect(...) calls inside methods rather than field initializers (foo = effect(...))
  const lines = sourceCode.split('\n');

  let insideClass = false;
  let insideMethod = false;
  let methodBraceDepth = 0;
  let currentMethod = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes('class ') && line.includes('{')) {
      insideClass = true;
    }

    if (insideClass) {
      // Check for method declaration e.g. "handleClick() {" or "ngOnInit() {"
      const methodDecl = line.match(
        /^\s*(?:async\s+)?([A-Za-z0-9_$]+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/
      );
      if (methodDecl && methodDecl[1] !== 'constructor') {
        insideMethod = true;
        currentMethod = methodDecl[1];
        methodBraceDepth = 0;
      }

      if (insideMethod) {
        if (line.includes('{')) methodBraceDepth++;
        if (line.includes('}')) methodBraceDepth--;

        // Check if effect() is called without { injector: ... }
        if (line.includes('effect(')) {
          const hasInjectorOption = line.includes('injector:');
          if (!hasInjectorOption) {
            diagnostics.push({
              rule: 'angora/safe-effects',
              message: `Calling effect() inside method '${currentMethod}' requires an explicit Injector via { injector: this.injector } to prevent memory leaks.`,
              line: i + 1,
              column: line.indexOf('effect(') + 1,
            });
          }
        }

        if (methodBraceDepth <= 0 && line.includes('}')) {
          insideMethod = false;
        }
      }
    }
  }

  return diagnostics;
}
