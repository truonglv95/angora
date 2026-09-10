import { effect, untrack, type Injector, rootInjector } from '@angora-js/core';
import { mountComponent, type MountedComponentRef } from './mount.ts';

export interface DynamicComponentOptions {
  inputs?: () => Record<string, any>;
  outputs?: Record<string, (val: any) => void>;
  injector?: Injector;
  loadingRenderer?: () => Node[];
  errorRenderer?: (error: any) => Node[];
}

/**
 * Modern Angora Dynamic Component Engine
 * Dynamically mounts, updates, and unmounts components based on fine-grained reactive signals.
 * Supports both synchronous Component classes and asynchronous Lazy Loading (Promise / dynamic import()).
 *
 * Usage:
 * createDynamicComponent(anchor, () => currentTab(), () => ({ id: selectedId() }), injector);
 */
export function createDynamicComponent(
  anchor: Comment,
  componentGetter: () => any,
  optionsOrInputs?: DynamicComponentOptions | (() => Record<string, any>),
  customInjector?: Injector
): () => void {
  const options: DynamicComponentOptions =
    typeof optionsOrInputs === 'function'
      ? { inputs: optionsOrInputs, injector: customInjector }
      : optionsOrInputs || { injector: customInjector };

  const parentInjector = options.injector || customInjector || rootInjector;

  let activeComponentRef: MountedComponentRef<any> | null = null;
  let activeHostElement: HTMLElement | null = null;
  let activeComponentType: any = null;
  let fallbackNodes: Node[] = [];
  let isDestroyed = false;
  let asyncLoadToken = 0;
  let inputsCleanup: (() => void) | null = null;

  const cleanupFallbacks = () => {
    for (const node of fallbackNodes) {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    }
    fallbackNodes = [];
  };

  const cleanupActiveComponent = () => {
    if (inputsCleanup) {
      inputsCleanup();
      inputsCleanup = null;
    }
    if (activeComponentRef) {
      activeComponentRef.destroy();
      activeComponentRef = null;
    }
    if (activeHostElement && activeHostElement.parentNode) {
      activeHostElement.parentNode.removeChild(activeHostElement);
      activeHostElement = null;
    }
    activeComponentType = null;
    cleanupFallbacks();
  };

  const mountResolvedComponent = (compType: any) => {
    if (isDestroyed || !compType) {
      cleanupActiveComponent();
      return;
    }

    const parent = anchor.parentNode;
    if (!parent) return;

    // If it's already the active component, no need to remount DOM
    if (compType === activeComponentType && activeComponentRef) {
      return;
    }

    cleanupActiveComponent();

    // Determine host element tag name
    const def = compType.__angora_def__ || compType.ɵcmp;
    const rawSelector = def?.selector || def?.metadata?.selector;
    const tagName =
      rawSelector && !rawSelector.includes('[') && !rawSelector.includes('.')
        ? rawSelector
        : 'angora-dynamic';

    const host = document.createElement(tagName);
    activeHostElement = host;
    activeComponentType = compType;

    // Insert host immediately after anchor
    parent.insertBefore(host, anchor.nextSibling);

    // Prepare reactive input getters for mountComponent so they are set before initial render
    const mountInputs: Record<string, () => any> = {};
    if (options.inputs) {
      const getInputs = options.inputs;
      const initial = untrack(() => getInputs()) || {};
      for (const key of Object.keys(initial)) {
        mountInputs[key] = () => {
          const curr = getInputs();
          return curr ? curr[key] : undefined;
        };
      }
    }

    // Mount component
    const ref = mountComponent(compType, host, null, parentInjector, {
      inputs: mountInputs,
      outputs: options.outputs,
    });
    activeComponentRef = ref;

    // Wire reactive inputs dynamically for any newly added keys or dynamic mutations
    if (options.inputs && ref?.instance) {
      const inputsGetter = options.inputs;
      inputsCleanup = effect(() => {
        const currentInputs = inputsGetter();
        if (currentInputs && ref.instance) {
          for (const [key, val] of Object.entries(currentInputs)) {
            const prop = (ref.instance as any)[key];
            if (prop && typeof prop.__set === 'function') {
              prop.__set(val);
            } else {
              (ref.instance as any)[key] = val;
            }
          }
        }
      });
    }
  };

  const destroyMainEffect = effect(() => {
    const rawComp = componentGetter();

    if (!rawComp) {
      cleanupActiveComponent();
      return;
    }

    // Check if component is a Promise (lazy loading via dynamic import() or Promise.resolve())
    if (
      rawComp instanceof Promise ||
      (typeof rawComp === 'object' && typeof rawComp.then === 'function')
    ) {
      const currentToken = ++asyncLoadToken;

      // Render optional loading fallback
      if (options.loadingRenderer && anchor.parentNode) {
        cleanupFallbacks();
        fallbackNodes = untrack(() => options.loadingRenderer!());
        let refNode: Node = anchor;
        for (const node of fallbackNodes) {
          anchor.parentNode.insertBefore(node, refNode.nextSibling);
          refNode = node;
        }
      }

      rawComp
        .then((moduleOrComp: any) => {
          if (isDestroyed || currentToken !== asyncLoadToken) return;
          const resolved = moduleOrComp?.default || moduleOrComp;
          cleanupFallbacks();
          mountResolvedComponent(resolved);
        })
        .catch((err: any) => {
          if (isDestroyed || currentToken !== asyncLoadToken) return;
          cleanupFallbacks();
          if (options.errorRenderer && anchor.parentNode) {
            fallbackNodes = untrack(() => options.errorRenderer!(err));
            let refNode: Node = anchor;
            for (const node of fallbackNodes) {
              anchor.parentNode.insertBefore(node, refNode.nextSibling);
              refNode = node;
            }
          } else {
            console.error('[Angora Dynamic Component] Failed to load lazy component:', err);
          }
        });
      return;
    }

    // Synchronous component class
    mountResolvedComponent(rawComp);
  });

  return () => {
    isDestroyed = true;
    destroyMainEffect();
    cleanupActiveComponent();
  };
}
