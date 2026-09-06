import { InjectionToken } from '@angora-js/core';
import type {
  QueryKey,
  QueryOptions,
  QueryStatus,
  DehydratedState,
  DehydratedQuery,
} from './types.ts';

export const QUERY_CLIENT = new InjectionToken<QueryClient>('QUERY_CLIENT');

export function hashQueryKey(queryKey: QueryKey): string {
  return JSON.stringify(queryKey, (_, val) =>
    typeof val === 'object' && val !== null && !Array.isArray(val)
      ? Object.keys(val)
          .sort()
          .reduce((result: any, key) => {
            result[key] = val[key];
            return result;
          }, {})
      : val
  );
}

export interface QueryCacheEntry<T = any> {
  queryKey: QueryKey;
  data: T | undefined;
  error: any;
  status: QueryStatus;
  updatedAt: number;
  promise?: Promise<T>;
  listeners: Set<() => void>;
}

export class QueryClient {
  private cache = new Map<string, QueryCacheEntry>();
  private isMounted = false;
  private focusHandler: (() => void) | null = null;

  constructor() {
    this.mount();
  }

  public mount() {
    if (this.isMounted || typeof window === 'undefined') return;
    this.isMounted = true;

    this.focusHandler = () => {
      if (document.visibilityState === 'visible') {
        this.refetchStaleQueries();
      }
    };

    window.addEventListener('visibilitychange', this.focusHandler);
    window.addEventListener('focus', this.focusHandler);
  }

  public unmount() {
    if (!this.isMounted || typeof window === 'undefined') return;
    this.isMounted = false;
    if (this.focusHandler) {
      window.removeEventListener('visibilitychange', this.focusHandler);
      window.removeEventListener('focus', this.focusHandler);
      this.focusHandler = null;
    }
  }

  private refetchStaleQueries() {
    const now = Date.now();
    for (const entry of this.cache.values()) {
      if (entry.listeners.size > 0 && entry.status === 'success') {
        // Stale after 5 seconds by default during focus check
        if (now - entry.updatedAt > 5000) {
          for (const listener of entry.listeners) {
            listener();
          }
        }
      }
    }
  }

  public getOrCreateEntry<T>(queryKey: QueryKey): QueryCacheEntry<T> {
    const hash = hashQueryKey(queryKey);
    let entry = this.cache.get(hash);
    if (!entry) {
      entry = {
        queryKey,
        data: undefined,
        error: null,
        status: 'pending',
        updatedAt: 0,
        listeners: new Set(),
      };
      this.cache.set(hash, entry);
    }
    return entry;
  }

  public getQueryData<T = unknown>(queryKey: QueryKey): T | undefined {
    const hash = hashQueryKey(queryKey);
    return this.cache.get(hash)?.data as T | undefined;
  }

  public setQueryData<T = unknown>(
    queryKey: QueryKey,
    updater: T | ((prev: T | undefined) => T)
  ): T {
    const entry = this.getOrCreateEntry<T>(queryKey);
    const prev = entry.data;
    const next = typeof updater === 'function' ? (updater as any)(prev) : updater;
    entry.data = next;
    entry.status = 'success';
    entry.updatedAt = Date.now();
    entry.error = null;

    for (const listener of entry.listeners) {
      listener();
    }
    return next;
  }

  public async fetchQuery<T>(options: QueryOptions<T>): Promise<T> {
    const entry = this.getOrCreateEntry<T>(options.queryKey);
    const staleTime = options.staleTime ?? 0;
    const now = Date.now();

    // Check if data is already fresh in cache
    if (entry.status === 'success' && staleTime > 0 && now - entry.updatedAt < staleTime) {
      return entry.data as T;
    }

    // Deduplicate in-flight requests
    if (entry.promise) {
      return entry.promise;
    }

    entry.promise = (async () => {
      try {
        const result = await options.queryFn({ queryKey: options.queryKey });
        entry.data = result;
        entry.status = 'success';
        entry.updatedAt = Date.now();
        entry.error = null;
        for (const listener of entry.listeners) {
          listener();
        }
        return result;
      } catch (err) {
        entry.error = err;
        entry.status = 'error';
        for (const listener of entry.listeners) {
          listener();
        }
        throw err;
      } finally {
        entry.promise = undefined;
      }
    })();

    return entry.promise;
  }

  public async prefetchQuery<T>(options: QueryOptions<T>): Promise<T> {
    return this.fetchQuery(options);
  }

  public async invalidateQueries(queryKey?: QueryKey): Promise<void> {
    const targetHash = queryKey ? hashQueryKey(queryKey) : null;
    const promises: Promise<any>[] = [];

    for (const [hash, entry] of this.cache.entries()) {
      if (!targetHash || hash.startsWith(targetHash.slice(0, -1))) {
        entry.updatedAt = 0; // mark immediately as stale
        for (const listener of entry.listeners) {
          listener();
        }
      }
    }

    await Promise.all(promises);
  }

  public dehydrate(): DehydratedState {
    const queries: DehydratedQuery[] = [];
    for (const entry of this.cache.values()) {
      if (entry.status === 'success') {
        queries.push({
          queryKey: entry.queryKey,
          data: entry.data,
          updatedAt: entry.updatedAt,
        });
      }
    }
    return { queries };
  }

  public hydrate(state: DehydratedState) {
    if (!state || !Array.isArray(state.queries)) return;
    for (const q of state.queries) {
      const entry = this.getOrCreateEntry(q.queryKey);
      entry.data = q.data;
      entry.status = 'success';
      entry.updatedAt = q.updatedAt;
      for (const listener of entry.listeners) {
        listener();
      }
    }
  }

  public clear() {
    this.cache.clear();
  }
}
