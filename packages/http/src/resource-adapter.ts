import { resource, type ResourceRef } from '@angora-js/core';
import { HttpClient } from './http-client.ts';
import type { HttpRequestInit } from './types.ts';

export interface HttpResourceOptions<T> extends HttpRequestInit {
  initialValue?: T;
  client?: HttpClient;
}

const defaultClient = new HttpClient();

/**
 * Creates a Signal-based Resource that fetches HTTP data using HttpClient and resource()
 *
 * @example
 * const user = httpResource<User>(() => `/api/users/${userId()}`);
 */
export function httpResource<T>(
  urlOrFn: string | (() => string),
  options: HttpResourceOptions<T> = {}
): ResourceRef<T> {
  const client = options.client || defaultClient;

  if (typeof urlOrFn === 'function') {
    return resource<T, string>({
      request: urlOrFn,
      initialValue: options.initialValue,
      loader: async ({ request: url, abortSignal }) => {
        return client.get<T>(url, {
          ...options,
          signal: abortSignal,
        });
      },
    });
  }

  return resource<T, void>({
    initialValue: options.initialValue,
    loader: async ({ abortSignal }) => {
      return client.get<T>(urlOrFn, {
        ...options,
        signal: abortSignal,
      });
    },
  });
}
