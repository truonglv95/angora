import { signal, effect, untrack, type WritableSignal, type Signal } from './signals.ts';

export interface LinkedSignalOptions<S, D> {
  source: () => S;
  computation: (source: S, previous?: { source: S; value: D }) => D;
  equal?: (a: D, b: D) => boolean;
}

/**
 * Creates a writable signal linked to a source signal computation
 * Whenever the source changes, the linked signal re-computes its value,
 * while still allowing explicit overrides via .set() or .update()
 *
 * @example
 * const user = signal({ id: 1, name: 'Alice' });
 * const emailDraft = linkedSignal({
 *   source: () => user().id,
 *   computation: (id) => `user_${id}@example.com`
 * });
 *
 * emailDraft.set('custom@email.com'); // overridden
 * user.set({ id: 2, name: 'Bob' });   // automatically resets to user_2@example.com!
 */
export function linkedSignal<S, D>(options: LinkedSignalOptions<S, D>): WritableSignal<D>;
export function linkedSignal<D>(computation: () => D): WritableSignal<D>;
export function linkedSignal<S, D>(
  optionsOrComputation: LinkedSignalOptions<S, D> | (() => D)
): WritableSignal<D> {
  const isShorthand = typeof optionsOrComputation === 'function';
  const sourceFn: () => any = isShorthand ? optionsOrComputation : optionsOrComputation.source;
  const computationFn: (source: any, prev?: any) => D = isShorthand
    ? (s: any) => s
    : optionsOrComputation.computation;

  let hasInitialized = false;
  let lastSource: any = undefined;

  // Compute initial value
  lastSource = sourceFn();
  const initialValue = computationFn(lastSource);
  const internal = signal<D>(initialValue);
  hasInitialized = true;

  // React to source signal changes
  effect(() => {
    const currentSource = sourceFn();
    if (!hasInitialized) return;

    if (!Object.is(currentSource, lastSource)) {
      const prevSource = lastSource;
      lastSource = currentSource;

      // Untrack signal read so setting internal signal doesn't cause recursive loops
      const currentValue = untrack(() => internal());
      const nextVal = computationFn(currentSource, { source: prevSource, value: currentValue });
      internal.set(nextVal);
    }
  });

  return internal;
}
