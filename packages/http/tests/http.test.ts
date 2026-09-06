import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { signal } from '@angora-js/core';
import { HttpClient, httpResource, provideHttpClient, type HttpInterceptor } from '../src/index.ts';

describe('@angora-js/http - HTTP Client & Resource Pipeline', () => {
  let originalFetch: any;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  test('should execute GET request with params and parse JSON', async () => {
    (globalThis as any).fetch = mock(async (url: string) => {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => ({ id: 1, name: 'Angora Framework' }),
      };
    });

    const client = new HttpClient();
    const data = await client.get('/api/project', { params: { tag: 'fast' } });

    expect(data).toEqual({ id: 1, name: 'Angora Framework' });
    (globalThis as any).fetch = originalFetch;
  });

  test('should execute request through interceptor chain', async () => {
    let capturedAuthHeader = '';

    (globalThis as any).fetch = mock(async (url: string, init: any) => {
      capturedAuthHeader = init.headers.get('Authorization');
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => ({ authenticated: true }),
      };
    });

    const authInterceptor: HttpInterceptor = {
      async intercept(req, next) {
        req.headers['Authorization'] = 'Bearer secret-token-123';
        return next.handle(req);
      },
    };

    const client = new HttpClient([authInterceptor]);
    const res = await client.get('/api/protected');

    expect(capturedAuthHeader).toBe('Bearer secret-token-123');
    expect(res).toEqual({ authenticated: true });
    (globalThis as any).fetch = originalFetch;
  });

  test('should integrate httpResource with reactive signals', async () => {
    (globalThis as any).fetch = mock(async (url: string) => {
      const id = url.split('/').pop();
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => ({ id, title: `Post ${id}` }),
      };
    });

    const postId = signal(10);
    const post = httpResource<any>(() => `/api/posts/${postId()}`);

    await new Promise(r => setTimeout(r, 20));

    expect(post.isLoading()).toBe(false);
    expect(post.value()).toEqual({ id: '10', title: 'Post 10' });

    postId.set(20);
    await new Promise(r => setTimeout(r, 20));
    expect(post.value()).toEqual({ id: '20', title: 'Post 20' });

    (globalThis as any).fetch = originalFetch;
  });

  test('should throw error on non-ok HTTP responses', async () => {
    (globalThis as any).fetch = mock(async () => {
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
        text: async () => 'Resource not found',
      };
    });

    const client = new HttpClient();
    expect(client.get('/api/missing')).rejects.toThrow('HTTP Error 404: Not Found');
    (globalThis as any).fetch = originalFetch;
  });
});
