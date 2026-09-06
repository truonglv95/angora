import type { ASTNode } from './ast.ts';
import { generateTypeCheckBlockNative, type TcbResult, type SourceMapping } from './native.ts';

export type { TcbResult, SourceMapping };

/**
 * Generates a synthetic Type Check Block (TCB) using the 100% native Rust compiler (`angora_oxc`).
 * Allows `tsgo` or `tsc 7` to diagnose type errors inside templates at native microsecond speed.
 */
export function generateTypeCheckBlock(
  astOrTemplate: ASTNode[] | string,
  className: string = 'Component',
  baseOffset: number = 0
): string {
  const input = typeof astOrTemplate === 'string' ? astOrTemplate : JSON.stringify(astOrTemplate);
  return generateTypeCheckBlockNative(input, className, baseOffset).code;
}

/**
 * Generates a synthetic Type Check Block (TCB) along with exact Source Mappings
 * directly from the 100% native Rust compiler.
 */
export function generateTypeCheckBlockWithSourceMap(
  astOrTemplate: ASTNode[] | string,
  className: string = 'Component',
  baseOffset: number = 0
): TcbResult {
  const input = typeof astOrTemplate === 'string' ? astOrTemplate : JSON.stringify(astOrTemplate);
  return generateTypeCheckBlockNative(input, className, baseOffset);
}
