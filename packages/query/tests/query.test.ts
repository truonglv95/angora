import { describe, test, expect, beforeEach } from 'bun:test';
import { signal } from '@angora-js/core';
import {
  QueryClient,
  createQuery,
  createMutation,
  useQuery,
  useMutation,
  useQueryClient,
  dehydrate,
  hydrate,
  renderDehydratedScript,
} from '../src/index.ts';

describe('@angora-js/query - Enterprise Asynchronous State & Caching Engine', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient();
  });

  test('should fetch data asynchronously and update signals (isLoading, data, status)', async () => {
    let callCount = 0;
    const query = createQuery(
      () => ({
        queryKey: ['user', 1],
        queryFn: async () => {
          callCount++;
          return { id: 1, name: 'Alice' };
        },
      }),
      client
    );

    expect(query.isLoading()).toBe(true);
    expect(query.status()).toBe('pending');
    expect(query.data()).toBeUndefined();

    // Wait for promise resolution
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(query.isLoading()).toBe(false);
    expect(query.status()).toBe('success');
    expect(query.data()).toEqual({ id: 1, name: 'Alice' });
    expect(callCount).toBe(1);
  });

  test('should implement Stale-While-Revalidate (SWR): instantly serve cache while refetching in background', async () => {
    // 1. Prepopulate cache with existing data
    client.setQueryData(['posts'], ['Post 1', 'Post 2']);

    let serverPosts = ['Post 1', 'Post 2', 'Post 3 (New)'];
    let networkCallCount = 0;

    const query = createQuery(
      () => ({
        queryKey: ['posts'],
        queryFn: async () => {
          networkCallCount++;
          await new Promise(r => setTimeout(r, 10));
          return serverPosts;
        },
        staleTime: 0, // Immediately stale -> triggers background revalidate
      }),
      client
    );

    // 2. Data is instantly available (0ms loading flash!)
    expect(query.isLoading()).toBe(false);
    expect(query.data()).toEqual(['Post 1', 'Post 2']);
    expect(query.isFetching()).toBe(true);

    // 3. Wait for background revalidation
    await new Promise(resolve => setTimeout(resolve, 30));

    expect(query.isFetching()).toBe(false);
    expect(query.data()).toEqual(['Post 1', 'Post 2', 'Post 3 (New)']);
    expect(networkCallCount).toBe(1);
  });

  test('should automatically react and refetch when signal parameter inside optionsFn changes', async () => {
    const page = signal(1);

    const query = createQuery(
      () => ({
        queryKey: ['items', page()],
        queryFn: async () => {
          return [`Item page ${page()}`];
        },
      }),
      client
    );

    await new Promise(resolve => setTimeout(resolve, 15));
    expect(query.data()).toEqual(['Item page 1']);

    // Change the reactive signal
    page.set(2);

    await new Promise(resolve => setTimeout(resolve, 20));
    expect(query.data()).toEqual(['Item page 2']);
  });

  test('should support optimistic mutations with automated rollback on error', async () => {
    client.setQueryData(['todos'], [{ id: 1, text: 'Old Task' }]);

    const mutation = createMutation(
      {
        mutationFn: async (newTodo: { id: number; text: string }) => {
          await new Promise(r => setTimeout(r, 10));
          throw new Error('Server 500 Error');
        },
        onMutate: async newTodo => {
          // Optimistically update cache and save previous snapshot
          const prev = client.getQueryData<{ id: number; text: string }[]>(['todos']);
          client.setQueryData(['todos'], [...(prev || []), newTodo]);
          return { previousTodos: prev };
        },
        onError: (err, newTodo, context) => {
          // Rollback to previous state
          if (context?.previousTodos) {
            client.setQueryData(['todos'], context.previousTodos);
          }
        },
      },
      client
    );

    expect(mutation.isLoading()).toBe(false);

    // Trigger mutation
    const promise = mutation.mutateAsync({ id: 2, text: 'Optimistic Task' });

    // Cache updated optimistically immediately!
    expect(client.getQueryData(['todos'])).toHaveLength(2);

    // Catch expected error
    try {
      await promise;
    } catch {
      // Expected error
    }

    expect(mutation.isError()).toBe(true);
    // Rolled back successfully to original 1 task!
    expect(client.getQueryData<any>(['todos'])).toEqual([{ id: 1, text: 'Old Task' }]);
  });

  test('should dehydrate server cache and rehydrate on client with zero network requests', async () => {
    // --- SERVER SIDE ---
    const serverClient = new QueryClient();
    await serverClient.prefetchQuery({
      queryKey: ['ssr-data'],
      queryFn: async () => ({ user: 'admin', role: 'root' }),
    });

    const dehydratedState = dehydrate(serverClient);
    expect(dehydratedState.queries.length).toBe(1);

    const scriptTag = renderDehydratedScript(dehydratedState);
    expect(scriptTag).toContain('__ANGORA_QUERY_DATA__');
    expect(scriptTag).toContain('root');

    // --- CLIENT SIDE ---
    const clientSideClient = new QueryClient();
    let clientNetworkCalls = 0;

    // Hydrate state from SSR
    hydrate(clientSideClient, dehydratedState);

    const query = createQuery(
      () => ({
        queryKey: ['ssr-data'],
        queryFn: async () => {
          clientNetworkCalls++;
          return { user: 'refetched' };
        },
        staleTime: 60000, // 1 minute fresh
      }),
      clientSideClient
    );

    // Immediately available at 0ms from hydrated cache!
    expect(query.isLoading()).toBe(false);
    expect(query.data()).toEqual({ user: 'admin', role: 'root' } as any);
    expect(clientNetworkCalls).toBe(0); // ZERO duplicate network calls!
  });

  test('useQuery supports shorthand signature and options object', async () => {
    // 1. Shorthand signature: useQuery(key, fn, options, client)
    const todosQuery = useQuery(
      ['todos-list'],
      async () => ['Buy milk', 'Code in Angora'],
      { staleTime: 5000 },
      client
    );

    expect(todosQuery.isLoading()).toBe(true);
    await new Promise(r => setTimeout(r, 20));
    expect(todosQuery.isLoading()).toBe(false);
    expect(todosQuery.data()).toEqual(['Buy milk', 'Code in Angora']);

    // 2. Options object signature: useQuery({ queryKey, queryFn })
    const staticQuery = useQuery(
      {
        queryKey: ['settings'],
        queryFn: async () => ({ theme: 'dark' }),
      },
      client
    );

    expect(staticQuery.isLoading()).toBe(true);
    await new Promise(r => setTimeout(r, 20));
    expect(staticQuery.isLoading()).toBe(false);
    expect(staticQuery.data()).toEqual({ theme: 'dark' });
  });

  test('useMutation supports function shorthand and useQueryClient()', async () => {
    const qc = useQueryClient(client);
    expect(qc).toBe(client);

    let savedItem = '';
    const addMutation = useMutation(
      async (text: string) => {
        savedItem = text;
        return { success: true, item: text };
      },
      {
        onSuccess: res => {
          qc.setQueryData(['lastSaved'], res.item);
        },
      },
      client
    );

    expect(addMutation.isLoading()).toBe(false);
    await addMutation.mutateAsync('Angora is fast');

    expect(savedItem).toBe('Angora is fast');
    expect(addMutation.status()).toBe('success');
    expect(qc.getQueryData<string>(['lastSaved'])).toBe('Angora is fast');
  });
});
