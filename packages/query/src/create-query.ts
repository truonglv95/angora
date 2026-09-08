import { signal, effect, inject, type Signal } from '@angora-js/core';
import { QueryClient, QUERY_CLIENT } from './query-client.ts';
import type { QueryOptions, QueryResult, QueryStatus } from './types.ts';

const defaultClient = new QueryClient();

export function getDefaultQueryClient(): QueryClient {
  return defaultClient;
}

/**
 * Hook to inject the active QueryClient or get the global default.
 */
export function useQueryClient(customClient?: QueryClient): QueryClient {
  if (customClient) return customClient;
  try {
    return inject(QUERY_CLIENT, defaultClient) || defaultClient;
  } catch {
    return defaultClient;
  }
}

/**
 * Creates a reactive asynchronous query backed by Angora fine-grained signals.
 * Features:
 * - Automatic signal dependency tracking: when parameters change, query refetches automatically.
 * - Stale-While-Revalidate (SWR): instantly returns cached data while updating in the background.
 * - Zero loading flash if initial or cached data is present.
 */
export function createQuery<T = unknown>(
  optionsOrFn: QueryOptions<T> | (() => QueryOptions<T>),
  customClient?: QueryClient
): QueryResult<T> {
  const optionsFn = typeof optionsOrFn === 'function' ? optionsOrFn : () => optionsOrFn;
  const client = customClient || useQueryClient();

  const data = signal<T | undefined>(undefined);
  const isLoading = signal<boolean>(true);
  const isFetching = signal<boolean>(false);
  const isError = signal<boolean>(false);
  const error = signal<any>(null);
  const status = signal<QueryStatus>('pending');

  let activeCleanup: (() => void) | null = null;
  let currentOptions: QueryOptions<T> | null = null;

  async function executeFetch(opts: QueryOptions<T>) {
    const entry = client.getOrCreateEntry<T>(opts.queryKey);
    const staleTime = opts.staleTime ?? 0;
    const now = Date.now();

    // 1. If entry already has cached data, serve immediately
    if (entry.status === 'success' && entry.data !== undefined) {
      data.set(entry.data);
      status.set('success');
      isLoading.set(false);
      isError.set(false);
      error.set(null);

      // If fresh, no background fetch needed
      const isFresh = staleTime > 0 && now - entry.updatedAt < staleTime;
      if (isFresh) {
        isFetching.set(false);
        return entry.data;
      }
    } else {
      isLoading.set(true);
    }

    // 2. Perform network/async fetch
    isFetching.set(true);
    try {
      const res = await client.fetchQuery(opts);
      data.set(res);
      status.set('success');
      isLoading.set(false);
      isFetching.set(false);
      isError.set(false);
      error.set(null);
      return res;
    } catch (err) {
      error.set(err);
      status.set('error');
      isError.set(true);
      isLoading.set(false);
      isFetching.set(false);
      throw err;
    }
  }

  // Reactive effect to watch optionsFn changes (signals inside optionsFn)
  effect(() => {
    const opts = optionsFn();
    currentOptions = opts;

    if (opts.enabled === false) {
      isLoading.set(false);
      isFetching.set(false);
      return;
    }

    // Attach initial data if provided and no cache exists
    if (opts.initialData !== undefined && client.getQueryData(opts.queryKey) === undefined) {
      const initial =
        typeof opts.initialData === 'function' ? (opts.initialData as () => T)() : opts.initialData;
      client.setQueryData(opts.queryKey, initial);
    }

    // Subscribe to cache updates
    if (activeCleanup) {
      activeCleanup();
      activeCleanup = null;
    }

    const entry = client.getOrCreateEntry<T>(opts.queryKey);
    const listener = () => {
      if (entry.status === 'success') {
        data.set(entry.data);
        status.set('success');
        isLoading.set(false);
        isError.set(false);
        error.set(null);
      } else if (entry.status === 'error') {
        error.set(entry.error);
        status.set('error');
        isError.set(true);
        isLoading.set(false);
      }
    };

    entry.listeners.add(listener);
    activeCleanup = () => {
      entry.listeners.delete(listener);
    };

    executeFetch(opts).catch(() => {});
  });

  const refetch = async () => {
    if (currentOptions) {
      await client.invalidateQueries(currentOptions.queryKey);
      return executeFetch(currentOptions);
    }
    return undefined;
  };

  return {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    status,
    refetch,
  };
}

/**
 * Ultra-lean query hook for Angora applications.
 * Supports:
 * - Shorthand: `useQuery(['todos'], fetchTodos)`
 * - Options object: `useQuery({ queryKey: ['todos'], queryFn: fetchTodos })`
 * - Reactive options: `useQuery(() => ({ queryKey: ['user', id()], queryFn: () => fetchUser(id()) }))`
 */
export function useQuery<T = unknown>(
  queryKey: import('./types.ts').QueryKey,
  queryFn: import('./types.ts').QueryFunction<T>,
  options?: Omit<QueryOptions<T>, 'queryKey' | 'queryFn'>,
  customClient?: QueryClient
): QueryResult<T>;
export function useQuery<T = unknown>(
  options: QueryOptions<T>,
  customClient?: QueryClient
): QueryResult<T>;
export function useQuery<T = unknown>(
  optionsFn: () => QueryOptions<T>,
  customClient?: QueryClient
): QueryResult<T>;
export function useQuery<T = unknown>(
  arg1: import('./types.ts').QueryKey | QueryOptions<T> | (() => QueryOptions<T>),
  arg2?: import('./types.ts').QueryFunction<T> | QueryClient,
  arg3?: Omit<QueryOptions<T>, 'queryKey' | 'queryFn'>,
  arg4?: QueryClient
): QueryResult<T> {
  if (Array.isArray(arg1)) {
    const queryKey = arg1 as import('./types.ts').QueryKey;
    const queryFn = arg2 as import('./types.ts').QueryFunction<T>;
    const extraOpts = arg3 || {};
    const client = arg4;
    return createQuery<T>(() => ({ queryKey, queryFn, ...extraOpts }), client);
  }
  if (typeof arg1 === 'function') {
    return createQuery<T>(arg1 as () => QueryOptions<T>, arg2 as QueryClient | undefined);
  }
  return createQuery<T>(arg1 as QueryOptions<T>, arg2 as QueryClient | undefined);
}

export const query = useQuery;
