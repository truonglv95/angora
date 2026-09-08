import type { LintDiagnostic } from './no-uncalled-signals.ts';

/**
 * Rule: unused-imports
 * Detects component, directive, or pipe symbols in @Component({ imports: [...] })
 * that are never referenced inside the component's template.
 */
export function checkUnusedImports(sourceCode: string): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];

  const compMatch = sourceCode.match(/@Component\s*\(\s*\{([\s\S]*?)\}\s*\)/);
  if (!compMatch) return diagnostics;

  const compBody = compMatch[1];
  const importsMatch = compBody.match(/imports\s*:\s*(?:\(\)\s*=>\s*)?\[([\s\S]*?)\]/);
  if (!importsMatch) return diagnostics;

  const rawImports = importsMatch[1];
  const imports = rawImports
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (imports.length === 0) return diagnostics;

  const tmplMatch = compBody.match(/template\s*:\s*`([\s\S]*?)`/);
  if (!tmplMatch) return diagnostics;

  const template = tmplMatch[1];
  const linesBefore = sourceCode.slice(0, importsMatch.index).split('\n').length;

  for (const rawImp of imports) {
    const imp = rawImp
      .replace(/forwardRef\s*\(\s*(?:\(\)\s*=>\s*)?([A-Za-z0-9_$]+)\s*\)/, '$1')
      .trim();
    // Skip modules like CommonModule
    if (imp.endsWith('Module')) continue;

    // Expected tag or pipe/directive names:
    // e.g. UserCardComponent -> user-card, app-user-card
    // CustomPipe -> custom
    // TooltipDirective -> [tooltip], [angoraTooltip]
    const baseName = imp
      .replace(/Component$/, '')
      .replace(/Directive$/, '')
      .replace(/Pipe$/, '')
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase();

    const isUsedInTemplate =
      template.includes(baseName) ||
      template.toLowerCase().includes(baseName.replace(/-/g, '')) ||
      template.includes(imp);

    if (!isUsedInTemplate) {
      diagnostics.push({
        rule: 'angora/unused-imports',
        message: `'${rawImp}' is included in @Component.imports but is never used in the template. Consider removing it to reduce bundle size.`,
        line: linesBefore,
        column: 1,
      });
    }
  }

  return diagnostics;
}
