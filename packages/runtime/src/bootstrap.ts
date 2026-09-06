import {
  getComponentDef,
  Injector,
  rootInjector,
  DefaultDestroyRef,
  DESTROY_REF,
  IS_VIEW_QUERY,
  type ComponentType,
} from '@angora-js/core';
import * as domExports from './dom.ts';
import * as controlFlowExports from './control-flow.ts';
import * as stylesExports from './styles.ts';
import { injectComponentStyles } from './styles.ts';
import * as deferExports from './defer.ts';
import * as pipesExports from './pipes.ts';
import * as mountExports from './mount.ts';
import { attachComponentDevTools } from './devtools.ts';

export function getRuntimeScope() {
  return {
    ...domExports,
    ...controlFlowExports,
    ...stylesExports,
    ...deferExports,
    ...pipesExports,
    ...mountExports,
  };
}

(globalThis as any).__ANGORA_RUNTIME__ = getRuntimeScope();

export interface BootstrapOptions {
  providers?: any[];
  devtools?: boolean | { mode?: 'full' | 'profiling' | 'disabled' };
}

export type JITCompiler = (
  template: string,
  options?: { selector?: string; runtime?: any }
) => (ctx: any, injector: any) => Node[];

let globalJitCompiler: JITCompiler | null = null;

export function registerJITCompiler(compiler: JITCompiler): void {
  globalJitCompiler = compiler;
}

(globalThis as any).__registerAngoraJit = (compiler: JITCompiler) => {
  registerJITCompiler(compiler);
};

export function getJITCompiler(): JITCompiler | null {
  return globalJitCompiler || (globalThis as any).__ANGORA_JIT_COMPILER__ || null;
}

/**
 * Bootstraps an Angora standalone root component into the DOM container
 * @example
 * bootstrapApplication(AppComponent, '#app');
 */
export function bootstrapApplication<T>(
  componentType: new (...args: any[]) => T,
  container: HTMLElement | string,
  options?: BootstrapOptions
): T {
  const targetElement =
    typeof container === 'string' ? document.querySelector<HTMLElement>(container) : container;

  if (!targetElement) {
    throw new Error(`[Angora] Target DOM element "${container}" not found.`);
  }

  const def = getComponentDef<T>(componentType);
  if (!def) {
    throw new Error(`[Angora] Class "${componentType.name}" is missing @Component decorator.`);
  }

  // Create hierarchical injector for the component
  const destroyRef = new DefaultDestroyRef();
  const providers = [
    componentType,
    { provide: DESTROY_REF, useValue: destroyRef },
    ...(def.metadata.providers || []),
    ...(options?.providers || []),
  ];
  const componentInjector = new Injector(providers, rootInjector);

  // Instantiate component instance
  const instance = componentInjector.get(componentType);

  // Register root component and signals with DevTools before rendering children
  attachComponentDevTools(instance, targetElement, componentType, def, undefined, destroyRef);

  const compType = componentType as ComponentType<T>;

  // Check if component has a compiled render method (AOT)
  let renderFn =
    def?.render ||
    compType.ɵrender ||
    (instance as any).ɵrender ||
    compType.__angora_render__ ||
    (instance as any).__angora_render__;

  // If no AOT render method, compile on the fly with JIT compiler
  const jit = getJITCompiler();
  if (!renderFn && jit && def.metadata.template) {
    try {
      renderFn = jit(def.metadata.template, {
        selector: def.metadata.selector,
        runtime: (globalThis as any).__ANGORA_RUNTIME__ || getRuntimeScope(),
      });
      compType.ɵrender = renderFn;
      compType.__angora_render__ = renderFn;
    } catch (err) {
      console.error(`[Angora JIT] Failed to compile template for <${def.metadata.selector}>:`, err);
    }
  }

  // Inject root component scoped styles if present
  const scopeId =
    def?.scopeId ||
    compType.__angora_scope_id__ ||
    (instance as any).__angora_scope_id__ ||
    (def.metadata.selector
      ? `_angora-${def.metadata.selector.replace(/[^a-zA-Z0-9]/g, '-')}`
      : null);

  if (scopeId) {
    const rawStyles: any =
      def?.styles || (compType as any).__angora_styles__ || def.metadata.styles;
    if (Array.isArray(rawStyles)) {
      for (const s of rawStyles) {
        if (typeof s === 'string' && s.trim()) {
          injectComponentStyles(scopeId, s);
        }
      }
    } else if (typeof rawStyles === 'string' && rawStyles.trim()) {
      injectComponentStyles(scopeId, rawStyles);
    }
  }

  if (typeof renderFn === 'function') {
    const nodes: Node[] = renderFn(instance, componentInjector);
    targetElement.innerHTML = '';
    for (const node of nodes) {
      targetElement.appendChild(node);
    }
  } else {
    // If running in development without AOT or JIT
    targetElement.innerHTML = `<!-- Angora: ${def.metadata.selector} -->`;
  }

  // Resolve viewChild queries
  for (const key of Object.keys(instance as object)) {
    const prop = (instance as any)[key];
    if (prop && prop[IS_VIEW_QUERY]) {
      const selector = prop.__selector;
      const refVal = (instance as any)[selector];
      if (refVal) {
        prop.__set(refVal);
      } else {
        const found =
          targetElement.querySelector(selector) ||
          targetElement.querySelector(`[${selector}]`) ||
          targetElement.querySelector(`#${selector}`);
        if (found) prop.__set(found);
      }
    }
  }

  // Call onInit hook if present
  if (typeof (instance as any).angoraOnInit === 'function') {
    (instance as any).angoraOnInit();
  }

  return instance;
}
