import { describe, test, expect } from 'bun:test';
import { resource, signal } from '../src/index.ts';

describe('@angora-js/core - resource() Async Primitive', () => {
  test('should load async data successfully with loading states', async () => {
    const res = resource({
      loader: async () => {
        await new Promise(r => setTimeout(r, 10));
        return { message: 'Loaded successfully' };
      },
    });

    expect(res.isLoading()).toBe(true);
    expect(res.status()).toBe('loading');
    expect(res.hasValue()).toBe(false);

    // Wait for resolution
    await new Promise(r => setTimeout(r, 25));

    expect(res.isLoading()).toBe(false);
    expect(res.status()).toBe('resolved');
    expect(res.hasValue()).toBe(true);
    expect(res.value()).toEqual({ message: 'Loaded successfully' });
    expect(res.error()).toBeUndefined();
  });

  test('should re-trigger loader when request signal changes', async () => {
    const userId = signal(1);

    const userResource = resource({
      request: () => userId(),
      loader: async ({ request: id }) => {
        await new Promise(r => setTimeout(r, 10));
        return { id, name: `User ${id}` };
      },
    });

    await new Promise(r => setTimeout(r, 25));
    expect(userResource.value()?.name).toBe('User 1');

    // Change request param
    userId.set(2);
    expect(userResource.isLoading()).toBe(true);

    await new Promise(r => setTimeout(r, 25));
    expect(userResource.value()?.name).toBe('User 2');
  });

  test('should capture errors and update error state', async () => {
    const errResource = resource({
      loader: async () => {
        await new Promise(r => setTimeout(r, 5));
        throw new Error('Network timeout');
      },
    });

    await new Promise(r => setTimeout(r, 20));

    expect(errResource.isLoading()).toBe(false);
    expect(errResource.status()).toBe('error');
    expect(errResource.error()?.message).toBe('Network timeout');
    expect(errResource.hasValue()).toBe(false);
  });

  test('should cancel prior in-flight request when request param updates quickly', async () => {
    const query = signal('a');
    const abortedQueries: string[] = [];

    const searchResource = resource({
      request: () => query(),
      loader: async ({ request: q, abortSignal }) => {
        return new Promise(resolve => {
          const timer = setTimeout(() => {
            resolve(`Result for ${q}`);
          }, 30);

          abortSignal.addEventListener('abort', () => {
            clearTimeout(timer);
            abortedQueries.push(q);
          });
        });
      },
    });

    // Quickly change query before 30ms timer finishes
    await new Promise(r => setTimeout(r, 10));
    query.set('b');

    await new Promise(r => setTimeout(r, 50));

    expect(abortedQueries).toContain('a');
    expect(searchResource.value()).toBe('Result for b');
  });

  test('should support manual reload()', async () => {
    let callCount = 0;

    const res = resource({
      loader: async () => {
        callCount++;
        return callCount;
      },
    });

    await new Promise(r => setTimeout(r, 15));
    expect(res.value()).toBe(1);

    res.reload();
    await new Promise(r => setTimeout(r, 15));
    expect(res.value()).toBe(2);
  });
});
