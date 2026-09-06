import { effect, type Signal } from '@angora-js/core';
import type { SignalSpy } from './types.ts';

/**
 * Creates a reactive spy on an Angora signal to track emissions over time
 *
 * @example
 * const count = signal(0);
 * const spy = signalSpy(count);
 * count.set(1);
 * count.set(2);
 * expect(spy.values).toEqual([0, 1, 2]);
 */
export function signalSpy<T>(sig: Signal<T>): SignalSpy<T> {
  const history: T[] = [];
  let cleanupEffect: (() => void) | null = null;

  cleanupEffect = effect(() => {
    history.push(sig());
  });

  return {
    get values() {
      return [...history];
    },
    get count() {
      return history.length;
    },
    get lastValue() {
      return history[history.length - 1];
    },
    reset() {
      history.length = 0;
    },
    destroy() {
      if (cleanupEffect) {
        cleanupEffect();
        cleanupEffect = null;
      }
    },
  };
}
