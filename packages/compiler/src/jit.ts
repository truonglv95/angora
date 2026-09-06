import { parseTemplate, compileTemplate } from './native.ts';

export interface JitCompileOptions {
  selector?: string;
  runtime?: any;
}

/**
 * Compiles an HTML template string directly into an executable render function
 * at runtime (Just-In-Time / JIT compiler), exactly like Angular's JIT compiler.
 */
export function compileTemplateJit(
  template: string,
  options?: JitCompileOptions
): (ctx: any, injector: any) => Node[] {
  const code = compileTemplate(template);

  const rt = options?.runtime || (globalThis as any).__ANGORA_RUNTIME__;

  // Evaluate the compiled render function with runtime bindings in scope
  const factory = new Function(
    'runtime',
    `with (runtime || {}) {
      return (${code});
    }`
  );

  return factory(rt);
}

// Auto-register JIT compiler globally
(globalThis as any).__ANGORA_JIT_COMPILER__ = compileTemplateJit;
if (typeof (globalThis as any).__registerAngoraJit === 'function') {
  (globalThis as any).__registerAngoraJit(compileTemplateJit);
}
