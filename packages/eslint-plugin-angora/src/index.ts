import { checkNoUncalledSignals, type LintDiagnostic } from './rules/no-uncalled-signals.ts';
import { checkUnusedImports } from './rules/unused-imports.ts';
import { checkSafeEffects } from './rules/safe-effects.ts';

export { checkNoUncalledSignals, checkUnusedImports, checkSafeEffects, type LintDiagnostic };

/**
 * Runs all Angora linter rules on TypeScript / Component source code
 */
export function lintAngoraSource(sourceCode: string): LintDiagnostic[] {
  return [
    ...checkNoUncalledSignals(sourceCode),
    ...checkUnusedImports(sourceCode),
    ...checkSafeEffects(sourceCode),
  ];
}

/**
 * ESLint Plugin definition
 */
export const rules = {
  'no-uncalled-signals': {
    create: () => ({}),
  },
  'unused-imports': {
    create: () => ({}),
  },
  'safe-effects': {
    create: () => ({}),
  },
};

export default {
  rules,
  lintAngoraSource,
};
