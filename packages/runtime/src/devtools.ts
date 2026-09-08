import { isDevMode, effect, COMPONENT_DEF, isSignal, type DestroyRef } from '@angora-js/core';

let componentIdCounter = 0;

export interface ComponentDevToolsHookResult {
  compId: string;
  destroy: () => void;
}

/**
 * Attaches development-mode DevTools hooks to a component instance and host element.
 * Zero-overhead in production mode.
 */
export function attachComponentDevTools(
  instance: any,
  hostElement: HTMLElement | null,
  componentType: any,
  def: any,
  parentInstance?: any,
  destroyRef?: DestroyRef
): ComponentDevToolsHookResult | null {
  // Only execute when in dev mode or devtools backend is active
  if (!isDevMode() && !(globalThis as any).__ANGORA_DEVTOOLS_BACKEND__) {
    return null;
  }

  const backend = (globalThis as any).__ANGORA_DEVTOOLS_BACKEND__;
  if (!backend || backend.mode === 'disabled') {
    return null;
  }

  const debug = def?.debug;
  const className = debug?.name || componentType?.name || 'Component';
  const selector =
    debug?.selector ||
    def?.metadata?.selector ||
    componentType?.[COMPONENT_DEF]?.metadata?.selector ||
    className.toLowerCase();
  const compId = `comp_${++componentIdCounter}_${selector.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  // Attach metadata to instance and hostElement
  if (instance) {
    (instance as any).__angoraId__ = compId;
    (instance as any).__angoraHostElement__ = hostElement;
  }
  if (hostElement) {
    (hostElement as any).__angoraComponent__ = instance;
    (hostElement as any).__angoraId__ = compId;
    try {
      hostElement.setAttribute('data-angora-component', selector);
      hostElement.setAttribute('data-angora-id', compId);
    } catch {
      // Host element may be DocumentFragment or non-standard element
    }
  }

  const parentId = parentInstance?.__angoraId__;
  const cleanups: (() => void)[] = [];
  const signals: Record<string, any> = {};
  const inputs: Record<string, any> = {};
  const outputs: string[] = [];

  // Inspect instance properties for Signals, Computeds, Inputs, and Outputs
  if (instance) {
    for (const key of Object.keys(instance)) {
      if (key.startsWith('__')) continue;
      const prop = (instance as any)[key];

      if (typeof prop === 'function') {
        if (key.endsWith('Fn') || key.startsWith('destroy') || !isSignal(prop)) {
          continue;
        }

        try {
          // Check if calling prop() behaves as a signal getter
          const currentVal = prop();
          const isWritable =
            typeof prop.set === 'function' || typeof (prop as any).__set === 'function';
          const isComputed = !isWritable;

          signals[key] = currentVal;
          const sigId = `sig_${compId}_${key}`;
          const displayName = (prop as any).debugName || key;
          backend.registerSignal(
            sigId,
            displayName,
            currentVal,
            isComputed,
            compId,
            isWritable ? prop : undefined
          );

          // Store reference to signal for live DevTools editing
          if (isWritable && backend.signals.has(sigId)) {
            (backend.signals.get(sigId) as any).signalRef = prop;
          }

          // Live track reactive signal changes in DevTools
          const stopEffect = effect(() => {
            try {
              const updated = prop();
              backend.updateSignal(sigId, updated);
            } catch {
              // Ignore if signal was disposed
            }
          });
          cleanups.push(stopEffect);
        } catch {
          // Not a parameterless signal getter
        }
      } else if (
        prop &&
        typeof prop === 'object' &&
        typeof prop.rawValue === 'function' &&
        isSignal(prop.value)
      ) {
        // Reactive Forms: FormGroup, FormRecord, FormControl
        try {
          const formVal = prop.rawValue();
          signals[`${key}.value`] = formVal;
          const sigIdVal = `sig_${compId}_${key}_value`;
          backend.registerSignal(sigIdVal, `${key}.value`, formVal, false, compId);

          if (backend.signals.has(sigIdVal)) {
            (backend.signals.get(sigIdVal) as any).signalRef = {
              set: (v: any) =>
                typeof prop.patchValue === 'function' ? prop.patchValue(v) : prop.setValue(v),
            };
          }

          const stopValEffect = effect(() => {
            try {
              backend.updateSignal(sigIdVal, prop.rawValue());
            } catch {}
          });
          cleanups.push(stopValEffect);

          if (isSignal(prop.status)) {
            const sigIdStatus = `sig_${compId}_${key}_status`;
            backend.registerSignal(sigIdStatus, `${key}.status`, prop.status(), true, compId);
            const stopStatusEffect = effect(() => {
              try {
                backend.updateSignal(sigIdStatus, prop.status());
              } catch {}
            });
            cleanups.push(stopStatusEffect);
          }
        } catch {}
      } else if (prop && typeof prop.subscribe === 'function') {
        outputs.push(key);
      } else {
        inputs[key] = prop;
      }
    }
  }

  // Register component in DevTools backend
  backend.registerComponent({
    id: compId,
    name: className,
    selector,
    scopeId: debug?.scopeId || def?.scopeId || (instance as any)?.__angora_scope_id__,
    parentId,
    children: [],
    signals,
    inputs,
    outputs,
    template: debug?.template,
  });

  // Attach refresh handler for HMR updates
  const refresh = () => {
    if (!instance || backend.mode === 'disabled') return;
    for (const key of Object.getOwnPropertyNames(instance)) {
      if (key.startsWith('__')) continue;
      const prop = (instance as any)[key];
      const sigId = `sig_${compId}_${key}`;
      if (isSignal(prop) && !backend.signals.has(sigId)) {
        try {
          const currentVal = prop();
          const isWritable =
            typeof prop.set === 'function' || typeof (prop as any).__set === 'function';
          backend.registerSignal(sigId, key, currentVal, !isWritable, compId);
          if (isWritable && backend.signals.has(sigId)) {
            (backend.signals.get(sigId) as any).signalRef = prop;
          }
          const stopEffect = effect(() => {
            try {
              backend.updateSignal(sigId, prop());
            } catch {}
          });
          cleanups.push(stopEffect);
        } catch {}
      }
    }
  };
  (instance as any).__angoraDevToolsRefresh__ = refresh;

  // Link child ID to parent component
  if (parentId && backend.components.has(parentId)) {
    const parentNode = backend.components.get(parentId);
    if (parentNode && !parentNode.children.includes(compId)) {
      parentNode.children.push(compId);
    }
  }

  const destroy = () => {
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch {
        // Ignore
      }
    }
    cleanups.length = 0;
    if (backend && typeof backend.unregisterComponent === 'function') {
      backend.unregisterComponent(compId);
    }
  };

  if (destroyRef && typeof destroyRef.onDestroy === 'function') {
    destroyRef.onDestroy(destroy);
  }

  return { compId, destroy };
}

/**
 * Refreshes DevTools inspection for a component instance after an HMR update.
 */
export function refreshComponentDevTools(instance: any): void {
  if (instance && typeof instance.__angoraDevToolsRefresh__ === 'function') {
    instance.__angoraDevToolsRefresh__();
  }
}
