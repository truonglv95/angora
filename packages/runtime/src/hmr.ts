import type { MountedComponentRef } from './mount.ts';
import { injectComponentStyles } from './styles.ts';
import { getJITCompiler } from './bootstrap.ts';
import { IS_VIEW_QUERY } from '@angora-js/core';

export interface SignalSnapshot {
  signals: Record<string, any>;
  forms: Record<string, any>;
}

/**
 * Global HMR registry keeping track of active mounted components
 */
class HMRRegistry {
  private componentsBySource = new Map<string, Set<MountedComponentRef>>();
  private componentsByName = new Map<string, Set<MountedComponentRef>>();

  public register(componentType: any, ref: MountedComponentRef): void {
    const sourceFile = componentType.__sourceFile;
    if (sourceFile) {
      if (!this.componentsBySource.has(sourceFile)) {
        this.componentsBySource.set(sourceFile, new Set());
      }
      this.componentsBySource.get(sourceFile)!.add(ref);
    }

    const name = componentType.name;
    if (name) {
      if (!this.componentsByName.has(name)) {
        this.componentsByName.set(name, new Set());
      }
      this.componentsByName.get(name)!.add(ref);
    }
  }

  public unregister(componentType: any, ref: MountedComponentRef): void {
    const sourceFile = componentType.__sourceFile;
    if (sourceFile && this.componentsBySource.has(sourceFile)) {
      this.componentsBySource.get(sourceFile)!.delete(ref);
    }
    const name = componentType.name;
    if (name && this.componentsByName.has(name)) {
      this.componentsByName.get(name)!.delete(ref);
    }
  }

  public getInstances(identifier: string): Set<MountedComponentRef> {
    const fromSource = this.componentsBySource.get(identifier);
    if (fromSource && fromSource.size > 0) return fromSource;

    const fromName = this.componentsByName.get(identifier);
    if (fromName && fromName.size > 0) return fromName;

    return new Set();
  }

  public clear(): void {
    this.componentsBySource.clear();
    this.componentsByName.clear();
  }
}

export const hmrRegistry = new HMRRegistry();

/**
 * Extracts fine-grained signals and form state from a component instance.
 */
export function extractSignalState(instance: any): SignalSnapshot {
  const snapshot: SignalSnapshot = {
    signals: {},
    forms: {},
  };
  if (!instance || typeof instance !== 'object') return snapshot;

  for (const key of Object.getOwnPropertyNames(instance)) {
    const prop = instance[key];
    if (!prop) continue;

    // Skip view queries (viewChild / viewChildren) as they re-resolve to new DOM elements
    if (prop[IS_VIEW_QUERY]) continue;

    // 1. Reactive forms: FormGroup, FormRecord, FormArray
    if (typeof prop === 'object' && typeof prop.rawValue === 'function') {
      try {
        snapshot.forms[key] = prop.rawValue();
      } catch {
        // Ignore if error reading
      }
    } else if (typeof prop === 'object' && typeof prop.getRawValue === 'function') {
      try {
        snapshot.forms[key] = prop.getRawValue();
      } catch {}
    }
    // 2. Fine-grained signals: signal(), model(), input()
    else if (
      typeof prop === 'function' &&
      (typeof prop.set === 'function' || typeof prop.__set === 'function')
    ) {
      try {
        snapshot.signals[key] = prop();
      } catch {}
    }
  }

  return snapshot;
}

/**
 * Restores extracted signal and form state into a component instance.
 */
export function restoreSignalState(instance: any, snapshot: SignalSnapshot): number {
  let restoredCount = 0;
  if (!instance || !snapshot) return restoredCount;

  // Restore forms
  for (const [key, formVal] of Object.entries(snapshot.forms)) {
    const target = instance[key];
    if (target && typeof target.patchValue === 'function') {
      try {
        target.patchValue(formVal);
        restoredCount++;
      } catch {}
    } else if (target && typeof target.setValue === 'function') {
      try {
        target.setValue(formVal);
        restoredCount++;
      } catch {}
    }
  }

  // Restore signals
  for (const [key, signalVal] of Object.entries(snapshot.signals)) {
    const target = instance[key];
    if (target && typeof target.set === 'function') {
      try {
        target.set(signalVal);
        restoredCount++;
      } catch {}
    } else if (target && typeof target.__set === 'function') {
      try {
        target.__set(signalVal);
        restoredCount++;
      } catch {}
    }
  }

  return restoredCount;
}

/**
 * Applies a Hot Module Replacement update to an Angora component.
 * Preserves all fine-grained signals and form state without page reload!
 */
export function applyHMRUpdate(
  identifier: string,
  newComponentType: any
): { updated: number; preservedSignals: number } {
  let instances = hmrRegistry.getInstances(identifier);
  if (!instances || instances.size === 0) {
    // Also try matching by newComponentType.name
    instances = hmrRegistry.getInstances(newComponentType.name);
    if (!instances || instances.size === 0) {
      return { updated: 0, preservedSignals: 0 };
    }
  }

  const startTime = performance.now();
  let totalPreserved = 0;
  let updatedCount = 0;

  // 1. Update component styles if present
  const newStyles =
    newComponentType.ɵcmp?.styles ||
    newComponentType.__angora_styles__ ||
    newComponentType.ɵcmp?.metadata?.styles;
  const scopeId =
    newComponentType.ɵcmp?.scopeId ||
    newComponentType.__angora_scope_id__ ||
    (newComponentType.ɵcmp?.selector
      ? `_angora-${newComponentType.ɵcmp.selector.replace(/[^a-zA-Z0-9]/g, '-')}`
      : null);

  if (scopeId && newStyles) {
    if (Array.isArray(newStyles)) {
      for (const s of newStyles) {
        if (typeof s === 'string' && s.trim()) {
          injectComponentStyles(scopeId, s, true);
        }
      }
    } else if (typeof newStyles === 'string') {
      injectComponentStyles(scopeId, newStyles, true);
    }
  }

  // 2. Resolve render function on prototype and definitions
  let newRenderFn =
    newComponentType.ɵrender || newComponentType.__angora_render__ || newComponentType.ɵcmp?.render;

  if (!newRenderFn && getJITCompiler()) {
    const tmpl = newComponentType.ɵcmp?.metadata?.template || newComponentType.ɵcmp?.template;
    if (tmpl) {
      try {
        const selector =
          newComponentType.ɵcmp?.metadata?.selector ||
          newComponentType.ɵcmp?.selector ||
          'component';
        newRenderFn = getJITCompiler()!(tmpl, { selector });
        newComponentType.ɵrender = newRenderFn;
        newComponentType.__angora_render__ = newRenderFn;
      } catch (err) {
        console.error('[Angora HMR] JIT compilation failed:', err);
      }
    }
  }

  for (const ref of Array.from(instances)) {
    try {
      const oldComponentType = (ref as any).componentType;
      const oldName = oldComponentType?.name || ref.instance?.constructor?.name;
      const newName = newComponentType.name;
      const oldSelector =
        oldComponentType?.ɵcmp?.selector || oldComponentType?.ɵcmp?.metadata?.selector;
      const newSelector =
        newComponentType.ɵcmp?.selector || newComponentType.ɵcmp?.metadata?.selector;

      const isSameComponent =
        (oldSelector && newSelector && oldSelector === newSelector) ||
        (oldName &&
          newName &&
          (oldName === newName || oldName.replace(/V\d+$/, '') === newName.replace(/V\d+$/, ''))) ||
        (!oldSelector && !newSelector && instances.size === 1);

      if (!isSameComponent) {
        continue;
      }

      // Update static props on old component type so subsequent mounts use new render
      if (oldComponentType) {
        oldComponentType.ɵrender = newRenderFn;
        oldComponentType.__angora_render__ = newRenderFn;
        if (newComponentType.ɵcmp) {
          oldComponentType.ɵcmp = newComponentType.ɵcmp;
        }
      }

      const oldInstance = ref.instance;
      const snapshot = extractSignalState(oldInstance);
      const signalCount = Object.keys(snapshot.signals).length + Object.keys(snapshot.forms).length;
      totalPreserved += signalCount;

      // Instantiate a probe to discover any newly added fields/signals
      try {
        const probe = new newComponentType();
        for (const key of Object.getOwnPropertyNames(probe)) {
          if (!(key in oldInstance)) {
            oldInstance[key] = probe[key];
          }
        }
      } catch {
        // Ignore probe instantiation failure if constructor requires DI
      }

      // Update prototype methods from new class onto existing instance so new/modified methods work
      if (newComponentType.prototype && oldInstance) {
        const proto = newComponentType.prototype;
        for (const name of Object.getOwnPropertyNames(proto)) {
          if (name !== 'constructor') {
            const desc = Object.getOwnPropertyDescriptor(proto, name);
            if (desc) {
              Object.defineProperty(oldInstance, name, desc);
            }
          }
        }
      }

      // Hot swap template render function
      if (typeof ref.rerender === 'function') {
        ref.rerender(newRenderFn);
      }

      // Re-apply snapshot if any initial value reset occurred
      restoreSignalState(oldInstance, snapshot);

      // Update ref.componentType
      (ref as any).componentType = newComponentType;

      updatedCount++;
    } catch (err) {
      console.error(`[Angora HMR] Error updating component ${newComponentType.name}:`, err);
    }
  }

  const duration = (performance.now() - startTime).toFixed(1);
  const name = newComponentType.name || newComponentType.ɵcmp?.selector || 'Component';
  console.log(
    `[Angora HMR] ⚡ Replaced <${name}> (${updatedCount} instance${updatedCount > 1 ? 's' : ''}, preserved ${totalPreserved} signal${totalPreserved !== 1 ? 's' : ''}) in ${duration}ms`
  );

  return { updated: updatedCount, preservedSignals: totalPreserved };
}
