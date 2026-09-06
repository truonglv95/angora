import { scopeCssNative } from './native.ts';

/**
 * Scopes component CSS selectors to a specific scope attribute (e.g., _angora-c0)
 * Implements Angular ViewEncapsulation.Emulated style isolation using the 100% native Rust CSS engine.
 */
export function scopeCss(css: string, scopeId: string): string {
  return scopeCssNative(css, scopeId);
}
