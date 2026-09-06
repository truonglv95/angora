import {
  generateTypeCheckBlockNative,
  parseTemplate,
  verifyTemplateImports,
} from '@angora-js/compiler';
import type { LspDiagnostic } from './types.ts';

export interface ValidateTemplateOptions {
  className?: string;
  imports?: string[];
}

export interface ValidateTemplateResult {
  valid: boolean;
  diagnostics: Array<{ message: string; code?: string; severity: string }>;
  tcbCode?: string;
  mappings?: any[];
}

/**
 * Validates an Angora HTML template and generates native Type Check Block (TCB).
 * Powered 100% by Native Rust OXC compiler.
 */
export function validateTemplate(
  template: string,
  options?: ValidateTemplateOptions
): ValidateTemplateResult {
  const ast = parseTemplate(template);
  const className = options?.className ?? 'Component';
  const imports = options?.imports ?? [];

  const diags = verifyTemplateImports(ast, { className, imports });
  const tcb = generateTypeCheckBlockNative(template, className, 0);

  return {
    valid: diags.length === 0,
    diagnostics: diags.map(d => ({
      message: `[${d.code}] ${d.message}`,
      code: d.code,
      severity: 'error',
    })),
    tcbCode: tcb.code,
    mappings: tcb.mappings,
  };
}
