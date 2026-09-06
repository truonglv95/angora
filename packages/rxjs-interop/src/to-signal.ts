import { signal, inject, DESTROY_REF, type Signal } from '@angora-js/core';

export interface Subscribable<T> {
  subscribe(observer: {
    next: (value: T) => void;
    error?: (err: any) => void;
    complete?: () => void;
  }): { unsubscribe: () => void } | void;
}

export interface ToSignalOptions<T> {
  initialValue?: T;
  requireSync?: boolean;
  rejectErrors?: boolean;
  manualCleanup?: boolean;
}

/**
 * Transforms an RxJS Observable or Subscribable into a reactive Angora Signal.
 * Automatically cleans up subscription when current injection context or DestroyRef is destroyed.
 */
export function toSignal<T>(
  source: Subscribable<T>,
  options?: ToSignalOptions<T>
): Signal<T | undefined> {
  let hasEmitted = false;
  let syncError: any = undefined;
  let hasSyncError = false;

  const sig = signal<T | undefined>(options?.initialValue);

  const sub = source.subscribe({
    next: (val: T) => {
      hasEmitted = true;
      sig.set(val);
    },
    error: (err: any) => {
      hasSyncError = true;
      syncError = err;
      if (options?.rejectErrors) {
        throw err;
      }
    },
  });

  if (options?.requireSync && !hasEmitted && options.initialValue === undefined) {
    if (hasSyncError) {
      throw syncError;
    }
    throw new Error(
      '[Angora rxjs-interop] toSignal() requireSync is true, but the observable did not emit synchronously.'
    );
  }

  if (!options?.manualCleanup && sub && typeof sub.unsubscribe === 'function') {
    try {
      const destroyRef = inject(DESTROY_REF, null as any);
      if (destroyRef && typeof destroyRef.onDestroy === 'function') {
        destroyRef.onDestroy(() => {
          sub.unsubscribe();
        });
      }
    } catch {
      // Not in injection context
    }
  }

  return sig;
}
