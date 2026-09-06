import { signal, computed, effect, type Signal } from './signals.ts';
import { onDestroy } from './lifecycle.ts';

export type ResourceStatus = 'idle' | 'loading' | 'resolved' | 'error';

export interface ResourceLoaderParams<R> {
  request: R;
  abortSignal: AbortSignal;
  previousStatus: ResourceStatus;
}

export interface ResourceOptions<T, R = void> {
  request?: () => R;
  loader: (params: ResourceLoaderParams<R>) => Promise<T>;
  initialValue?: T;
}

export interface ResourceRef<T> {
  value: Signal<T | undefined>;
  hasValue: Signal<boolean>;
  isLoading: Signal<boolean>;
  error: Signal<any | undefined>;
  status: Signal<ResourceStatus>;
  reload(): void;
  set(value: T): void;
  update(updater: (prev: T | undefined) => T): void;
  destroy(): void;
}

/**
 * Creates an asynchronous Resource signal for data fetching with automatic
 * abort handling, loading states, and reactive request re-triggering.
 * Modeled after Angular 19+ resource() primitive.
 *
 * @example
 * const user = resource({
 *   request: () => userId(),
 *   loader: async ({ request: id, abortSignal }) => {
 *     const res = await fetch(`/api/users/${id}`, { signal: abortSignal });
 *     return res.json();
 *   }
 * });
 */
export function resource<T, R = void>(options: ResourceOptions<T, R>): ResourceRef<T> {
  const valueSignal = signal<T | undefined>(options.initialValue);
  const loadingSignal = signal<boolean>(false);
  const errorSignal = signal<any | undefined>(undefined);
  const statusSignal = signal<ResourceStatus>('idle');
  const reloadTrigger = signal<number>(0);

  let currentAbortController: AbortController | null = null;
  let activePromiseId = 0;
  let lastStatus: ResourceStatus = 'idle';

  const stopEffect = effect(onCleanup => {
    // Track reload trigger
    reloadTrigger();

    // Read request signal dependencies
    const requestVal = options.request ? options.request() : (undefined as unknown as R);

    // Cancel any previous pending request
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }

    const abortController = new AbortController();
    currentAbortController = abortController;
    const promiseId = ++activePromiseId;
    const prevStatus = lastStatus;

    lastStatus = 'loading';
    loadingSignal.set(true);
    statusSignal.set('loading');
    errorSignal.set(undefined);

    onCleanup(() => {
      abortController.abort();
    });

    Promise.resolve()
      .then(() =>
        options.loader({
          request: requestVal,
          abortSignal: abortController.signal,
          previousStatus: prevStatus,
        })
      )
      .then(data => {
        if (promiseId === activePromiseId && !abortController.signal.aborted) {
          valueSignal.set(data);
          lastStatus = 'resolved';
          loadingSignal.set(false);
          statusSignal.set('resolved');
        }
      })
      .catch(err => {
        if (promiseId === activePromiseId && !abortController.signal.aborted) {
          errorSignal.set(err);
          lastStatus = 'error';
          loadingSignal.set(false);
          statusSignal.set('error');
        }
      });
  });

  const destroy = () => {
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
    stopEffect();
  };

  try {
    onDestroy(destroy);
  } catch {
    // Outside of lifecycle context
  }

  return {
    value: valueSignal.asReadonly(),
    hasValue: computed(() => valueSignal() !== undefined),
    isLoading: loadingSignal.asReadonly(),
    error: errorSignal.asReadonly(),
    status: statusSignal.asReadonly(),
    reload() {
      reloadTrigger.update(c => c + 1);
    },
    set(val: T) {
      valueSignal.set(val);
      statusSignal.set('resolved');
      loadingSignal.set(false);
      errorSignal.set(undefined);
    },
    update(updater: (prev: T | undefined) => T) {
      valueSignal.update(updater);
      statusSignal.set('resolved');
      loadingSignal.set(false);
      errorSignal.set(undefined);
    },
    destroy,
  };
}
