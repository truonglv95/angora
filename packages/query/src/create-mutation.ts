import { signal, type Signal } from '@angora-js/core';
import type { MutationOptions, MutationResult } from './types.ts';
import { QueryClient } from './query-client.ts';
import { getDefaultQueryClient } from './create-query.ts';

/**
 * Creates a reactive mutation for creating, updating, or deleting server data.
 * Supports optimistic updates via onMutate and automated rollback on error.
 */
export function createMutation<TData = unknown, TVariables = void, TContext = unknown>(
  options: MutationOptions<TData, TVariables, TContext>,
  customClient?: QueryClient
): MutationResult<TData, TVariables> {
  const client = customClient || getDefaultQueryClient();

  const data = signal<TData | undefined>(undefined);
  const isLoading = signal<boolean>(false);
  const isError = signal<boolean>(false);
  const error = signal<any>(null);
  const status = signal<'idle' | 'pending' | 'success' | 'error'>('idle');

  const mutateAsync = async (variables: TVariables): Promise<TData> => {
    isLoading.set(true);
    isError.set(false);
    error.set(null);
    status.set('pending');

    let context: TContext | undefined = undefined;

    try {
      // 1. Optimistic updates step
      if (options.onMutate) {
        const ctx = await options.onMutate(variables);
        if (ctx !== undefined) {
          context = ctx as TContext;
        }
      }

      // 2. Perform actual network mutation
      const res = await options.mutationFn(variables);
      data.set(res);
      status.set('success');
      isLoading.set(false);

      if (options.onSuccess) {
        await options.onSuccess(res, variables, context);
      }
      if (options.onSettled) {
        await options.onSettled(res, null, variables, context);
      }
      return res;
    } catch (err) {
      error.set(err);
      isError.set(true);
      status.set('error');
      isLoading.set(false);

      // 3. Rollback on error
      if (options.onError) {
        await options.onError(err, variables, context);
      }
      if (options.onSettled) {
        await options.onSettled(undefined, err, variables, context);
      }
      throw err;
    }
  };

  const mutate = (variables: TVariables) => {
    mutateAsync(variables).catch(() => {});
  };

  const reset = () => {
    data.set(undefined);
    isLoading.set(false);
    isError.set(false);
    error.set(null);
    status.set('idle');
  };

  return {
    mutate,
    mutateAsync,
    data,
    isLoading,
    isError,
    error,
    status,
    reset,
  };
}
