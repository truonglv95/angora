import { InjectionToken } from './di.ts';

export interface OnInit {
  angoraOnInit(): void;
}

export interface OnDestroy {
  angoraOnDestroy(): void;
}

export type LifecycleHook = () => void;

export interface DestroyRef {
  onDestroy(callback: () => void): () => void;
  destroy(): void;
}

export class DefaultDestroyRef implements DestroyRef {
  private cleanups = new Set<() => void>();
  private isDestroyed = false;

  onDestroy(callback: () => void): () => void {
    if (this.isDestroyed) {
      callback();
      return () => {};
    }
    this.cleanups.add(callback);
    return () => {
      this.cleanups.delete(callback);
    };
  }

  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    for (const cleanup of this.cleanups) {
      try {
        cleanup();
      } catch (err) {
        console.error('[Angora Lifecycle] Error in onDestroy cleanup:', err);
      }
    }
    this.cleanups.clear();
  }
}

export const DESTROY_REF = new InjectionToken<DestroyRef>('DestroyRef', {
  factory: () => new DefaultDestroyRef(),
});

let currentDestroyRef: DestroyRef | null = null;

export function runWithDestroyRef<T>(destroyRef: DestroyRef, fn: () => T): T {
  const prev = currentDestroyRef;
  currentDestroyRef = destroyRef;
  try {
    return fn();
  } finally {
    currentDestroyRef = prev;
  }
}

/**
 * Register a hook to be called when component initializes
 */
export function onInit(fn: LifecycleHook): void {
  fn();
}

/**
 * Register a hook to be called when component or active context is destroyed
 */
export function onDestroy(fn: LifecycleHook): void {
  if (currentDestroyRef) {
    currentDestroyRef.onDestroy(fn);
  }
}
