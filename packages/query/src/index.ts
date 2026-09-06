export * from './types.ts';
export * from './query-client.ts';
export * from './create-query.ts';
export * from './create-mutation.ts';
export * from './dehydration.ts';

import { QueryClient, QUERY_CLIENT } from './query-client.ts';

/**
 * Provider helper for Dependency Injection of QueryClient
 */
export function provideQueryClient(client: QueryClient = new QueryClient()) {
  return {
    provide: QUERY_CLIENT,
    useValue: client,
  };
}
