import type { Signal, WritableSignal } from '@angora-js/core';

export type QueryKey = readonly unknown[];

export type QueryFunction<T = unknown> = (context: {
  queryKey: QueryKey;
  signal?: AbortSignal;
}) => Promise<T>;

export interface QueryOptions<T = unknown> {
  queryKey: QueryKey;
  queryFn: QueryFunction<T>;
  staleTime?: number;
  gcTime?: number;
  refetchOnWindowFocus?: boolean;
  enabled?: boolean;
  initialData?: T | (() => T);
}

export type QueryStatus = 'pending' | 'success' | 'error';

export interface QueryResult<T = unknown> {
  data: WritableSignal<T | undefined>;
  isLoading: WritableSignal<boolean>;
  isFetching: WritableSignal<boolean>;
  isError: WritableSignal<boolean>;
  error: WritableSignal<any>;
  status: WritableSignal<QueryStatus>;
  refetch: () => Promise<T | undefined>;
}

export interface MutationOptions<TData = unknown, TVariables = void, TContext = unknown> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  onMutate?: (variables: TVariables) => Promise<TContext | void> | TContext | void;
  onSuccess?: (
    data: TData,
    variables: TVariables,
    context: TContext | undefined
  ) => void | Promise<void>;
  onError?: (
    error: any,
    variables: TVariables,
    context: TContext | undefined
  ) => void | Promise<void>;
  onSettled?: (
    data: TData | undefined,
    error: any,
    variables: TVariables,
    context: TContext | undefined
  ) => void | Promise<void>;
}

export interface MutationResult<TData = unknown, TVariables = void> {
  mutate: (variables: TVariables) => void;
  mutateAsync: (variables: TVariables) => Promise<TData>;
  data: WritableSignal<TData | undefined>;
  isLoading: WritableSignal<boolean>;
  isError: WritableSignal<boolean>;
  error: WritableSignal<any>;
  status: WritableSignal<'idle' | 'pending' | 'success' | 'error'>;
  reset: () => void;
}

export interface DehydratedQuery {
  queryKey: QueryKey;
  data: any;
  updatedAt: number;
}

export interface DehydratedState {
  queries: DehydratedQuery[];
}
