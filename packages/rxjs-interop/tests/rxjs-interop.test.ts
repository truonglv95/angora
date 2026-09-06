import { describe, it, expect } from 'bun:test';
import {
  signal,
  Injector,
  DefaultDestroyRef,
  DESTROY_REF,
  runInInjectionContext,
} from '@angora-js/core';
import { toSignal, toObservable } from '../src/index.ts';

// Simple mock observable helper (compatible with RxJS Subscribable)
function createMockObservable<T>(
  subscribeFn: (observer: {
    next: (v: T) => void;
    error?: (err: any) => void;
    complete?: () => void;
  }) => () => void
) {
  return {
    subscribe(observer: {
      next: (v: T) => void;
      error?: (err: any) => void;
      complete?: () => void;
    }) {
      const cleanup = subscribeFn(observer);
      return {
        unsubscribe() {
          if (cleanup) cleanup();
        },
      };
    },
  };
}

describe('@angora-js/rxjs-interop - Reactive Adapters', () => {
  it('should transform observable emissions to an Angora signal with initialValue', () => {
    let emitFn: (val: number) => void = () => {};
    const obs$ = createMockObservable<number>(observer => {
      emitFn = v => observer.next(v);
      return () => {};
    });

    const sig = toSignal(obs$, { initialValue: 0 });
    expect(sig()).toBe(0);

    emitFn(42);
    expect(sig()).toBe(42);

    emitFn(100);
    expect(sig()).toBe(100);
  });

  it('should support requireSync: true when observable emits synchronously', () => {
    const syncObs$ = createMockObservable<string>(observer => {
      observer.next('sync data');
      return () => {};
    });

    const sig = toSignal(syncObs$, { requireSync: true });
    expect(sig()).toBe('sync data');
  });

  it('should throw error when requireSync is true and observable does not emit synchronously', () => {
    const asyncObs$ = createMockObservable<string>(() => {
      return () => {};
    });

    expect(() => {
      toSignal(asyncObs$, { requireSync: true });
    }).toThrow('requireSync is true');
  });

  it('should automatically unsubscribe when DestroyRef triggers cleanup', () => {
    let isCleanedUp = false;
    const obs$ = createMockObservable<number>(() => {
      return () => {
        isCleanedUp = true;
      };
    });

    const destroyRef = new DefaultDestroyRef();
    const injector = new Injector([{ provide: DESTROY_REF, useValue: destroyRef }]);

    runInInjectionContext(injector, () => {
      toSignal(obs$);
    });

    expect(isCleanedUp).toBe(false);

    // Trigger destroy
    destroyRef.destroy();
    expect(isCleanedUp).toBe(true);
  });

  it('should transform an Angora signal into an RxJS observable stream via toObservable', async () => {
    const count = signal(10);
    const count$ = toObservable(count);

    const values: number[] = [];
    const sub = count$.subscribe(v => {
      values.push(v);
    });

    expect(values).toEqual([10]);

    count.set(20);
    expect(values).toEqual([10, 20]);

    count.update(c => c + 5);
    expect(values).toEqual([10, 20, 25]);

    sub.unsubscribe();
    expect(sub.closed).toBe(true);

    // Further signal changes should not be observed
    count.set(100);
    expect(values).toEqual([10, 20, 25]);
  });
});
