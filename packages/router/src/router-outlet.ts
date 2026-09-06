import {
  effect,
  inject,
  getComponentDef,
  Injector,
  InjectionToken,
  getCurrentInjector,
  runInInjectionContext,
  COMPONENT_DEF,
  type ComponentDef,
  type ComponentType,
  untrack,
  DefaultDestroyRef,
  DESTROY_REF,
  runWithDestroyRef,
} from '@angora-js/core';
import { getJITCompiler, attachComponentDevTools } from '@angora-js/runtime';
import { Router } from './router.ts';
import type { RouteMatch } from './types.ts';

export const OUTLET_DEPTH = new InjectionToken<number>('OUTLET_DEPTH');

function getMatchForDepth(match: RouteMatch | null, targetDepth: number): RouteMatch | null {
  let current = match;
  let currentDepth = 0;
  while (current) {
    if (current.route.component || current.route.loadComponent) {
      if (currentDepth === targetDepth) {
        return current;
      }
      currentDepth++;
    }
    current = current.childMatch || null;
  }
  return null;
}

/**
 * Creates a reactive RouterOutlet DOM block
 * Dynamically mounts the active route's component (sync or async via loadComponent) at the anchor comment.
 * Automatically supports hierarchical nested routing via OUTLET_DEPTH.
 */
export function createRouterOutlet(anchor: Comment): () => void {
  const router = inject(Router);
  let depth = 0;
  try {
    depth = inject(OUTLET_DEPTH, 0);
  } catch {
    depth = 0;
  }
  const parentInjector = getCurrentInjector();

  let currentNodes: Node[] = [];
  let isDestroyed = false;
  let activeDevToolsCleanup: (() => void) | null = null;
  let activeDestroyRef: DefaultDestroyRef | null = null;

  const cleanupNodes = () => {
    if (activeDevToolsCleanup) {
      try {
        activeDevToolsCleanup();
      } catch {}
      activeDevToolsCleanup = null;
    }
    if (activeDestroyRef) {
      try {
        activeDestroyRef.destroy();
      } catch {}
      activeDestroyRef = null;
    }
    for (const node of currentNodes) {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    }
    currentNodes = [];
  };

  const mountComponentType = (componentType: any) => {
    if (isDestroyed || !anchor.parentNode) return;
    cleanupNodes();

    untrack(() => {
      try {
        const def = getComponentDef(componentType);
        const destroyRef = new DefaultDestroyRef();
        activeDestroyRef = destroyRef;

        const providers = [
          componentType,
          { provide: DESTROY_REF, useValue: destroyRef },
          { provide: OUTLET_DEPTH, useValue: depth + 1 },
          ...(def?.metadata?.providers || []),
        ];
        const componentInjector = new Injector(providers, parentInjector);
        const instance = runWithDestroyRef(destroyRef, () => {
          return runInInjectionContext(componentInjector, () => {
            return componentInjector.get(componentType);
          });
        });

        const compType = componentType as ComponentType;
        let renderFn =
          def?.render ||
          compType.ɵrender ||
          (instance as any).ɵrender ||
          compType.__angora_render__ ||
          (instance as any).__angora_render__;
        if (!renderFn && def?.metadata?.template) {
          const jitCompiler = getJITCompiler();
          if (jitCompiler) {
            try {
              renderFn = jitCompiler(def.metadata.template, {
                selector: def.metadata.selector,
                runtime: (globalThis as any).__ANGORA_RUNTIME__,
              });
              compType.ɵrender = renderFn;
              compType.__angora_render__ = renderFn;
            } catch (err) {
              console.error('[Angora Router] JIT compilation error:', err);
            }
          }
        }
        if (typeof renderFn === 'function') {
          runInInjectionContext(componentInjector, () => {
            currentNodes = renderFn(instance, componentInjector);
          });
        } else {
          const placeholder = document.createElement('div');
          placeholder.textContent = `[Routed Component: ${def?.metadata?.selector || componentType.name}]`;
          currentNodes = [placeholder];
        }

        let refNode: Node = anchor;
        for (const node of currentNodes) {
          if (anchor.parentNode) {
            anchor.parentNode.insertBefore(node, refNode.nextSibling);
            refNode = node;
          }
        }

        if (typeof (instance as any).angoraOnInit === 'function') {
          (instance as any).angoraOnInit();
        }

        // Attach DevTools hook for routed component
        const hookResult = attachComponentDevTools(
          instance,
          currentNodes[0] instanceof HTMLElement ? currentNodes[0] : null,
          componentType,
          def,
          undefined
        );
        activeDevToolsCleanup = hookResult ? hookResult.destroy : null;
      } catch (err) {
        console.error('[Angora RouterOutlet] Error mounting routed component:', err);
      }
    });
  };

  const destroyEffect = effect(() => {
    const rootMatch = router.currentMatch();
    const activeMatch = getMatchForDepth(rootMatch, depth);
    cleanupNodes();

    if (!activeMatch) return;

    const parent = anchor.parentNode;
    if (!parent) {
      queueMicrotask(() => {
        if (isDestroyed || !anchor.parentNode) return;
        const currentMatch = getMatchForDepth(router.currentMatch(), depth);
        if (!currentMatch) return;
        if (currentMatch.route.component) {
          mountComponentType(currentMatch.route.component);
        } else if (currentMatch.route.loadComponent) {
          currentMatch.route.loadComponent().then((mod: any) => {
            const loaded = mod.default || mod;
            mountComponentType(loaded);
          });
        }
      });
      return;
    }

    if (activeMatch.route.component) {
      mountComponentType(activeMatch.route.component);
    } else if (activeMatch.route.loadComponent) {
      activeMatch.route.loadComponent().then((mod: any) => {
        const loaded = mod.default || mod;
        mountComponentType(loaded);
      });
    }
  });

  return () => {
    isDestroyed = true;
    destroyEffect();
    cleanupNodes();
  };
}

/**
 * Standalone RouterOutlet component.
 * Allows using `<router-outlet></router-outlet>` directly in templates when imported via `imports: [RouterOutlet]`.
 */
export class RouterOutlet {
  public destroyFn?: () => void;

  static ɵcmp: ComponentDef<RouterOutlet> = {
    selector: 'router-outlet',
    imports: [],
    styles: [],
    type: RouterOutlet,
    render: (instance: RouterOutlet, injector: Injector) => {
      const comment = document.createComment('angora:router-outlet');
      runInInjectionContext(injector, () => {
        instance.destroyFn = createRouterOutlet(comment);
      });
      return [comment];
    },
    metadata: {
      selector: 'router-outlet',
      template: '',
      imports: [],
      styles: [],
    },
  };

  static ɵrender(instance: RouterOutlet, injector: Injector) {
    return RouterOutlet.ɵcmp.render!(instance, injector);
  }

  static [COMPONENT_DEF] = RouterOutlet.ɵcmp;
  static __angora_render__ = RouterOutlet.ɵrender;

  angoraOnDestroy() {
    if (this.destroyFn) {
      this.destroyFn();
    }
  }
}
