import { describe, test, expect } from 'bun:test';
import '@angora-js/compiler';
import { Component, signal } from '@angora-js/core';
import {
  filePathToRoute,
  createRouteManifest,
  matchRoute,
  createServerFunction,
  server$,
  executeServerFunction,
  createRequestHandler,
  createCloudflareHandler,
  createVercelEdgeHandler,
  generateOptimizedImageMarkup,
  prerenderRoutes,
  rateMetric,
  onWebVitals,
} from '../src/index.ts';

describe('@angora-js/start - File-based Routing Engine', () => {
  test('should parse various file path conventions into routes and params', () => {
    const root = filePathToRoute('src/routes/index.ts');
    expect(root.path).toBe('/');
    expect(root.paramNames).toEqual([]);

    const about = filePathToRoute('routes/about.ts');
    expect(about.path).toBe('/about');

    const user = filePathToRoute('routes/users/[id].ts');
    expect(user.path).toBe('/users/:id');
    expect(user.paramNames).toEqual(['id']);

    const post = filePathToRoute('routes/blog/[category]/[slug].ts');
    expect(post.path).toBe('/blog/:category/:slug');
    expect(post.paramNames).toEqual(['category', 'slug']);

    const wildcard = filePathToRoute('routes/[...all].ts');
    expect(wildcard.path).toBe('/*');
    expect(wildcard.paramNames).toEqual(['all']);
  });

  test('should match incoming URLs and extract dynamic parameters', () => {
    const manifest = createRouteManifest({
      'routes/index.ts': { default: class Home {} },
      'routes/about.ts': { default: class About {} },
      'routes/users/[id].ts': { default: class User {} },
      'routes/users/[id]/settings.ts': { default: class UserSettings {} },
    });

    const matchHome = matchRoute(manifest, '/');
    expect(matchHome?.entry.path).toBe('/');
    expect(matchHome?.params).toEqual({});

    const matchUser = matchRoute(manifest, '/users/42');
    expect(matchUser?.entry.path).toBe('/users/:id');
    expect(matchUser?.params).toEqual({ id: '42' });

    const matchSettings = matchRoute(manifest, '/users/alice/settings');
    expect(matchSettings?.entry.path).toBe('/users/:id/settings');
    expect(matchSettings?.params).toEqual({ id: 'alice' });

    const notFound = matchRoute(manifest, '/unknown/path');
    expect(notFound).toBeNull();
  });
});

describe('@angora-js/start - Server Functions & RPC Dispatcher', () => {
  test('should register and execute server function directly on server', async () => {
    const addNumbers = createServerFunction(
      'addNumbers',
      async (args: { a: number; b: number }) => {
        return args.a + args.b;
      }
    );

    const dummyReq = new Request('http://localhost/_angora/rpc', { method: 'POST' });
    const directResult = await addNumbers({ a: 10, b: 25 });
    expect(directResult).toBe(35);

    const executed = await executeServerFunction('addNumbers', { a: 100, b: 200 }, dummyReq);
    expect(executed).toBe(300);
  });
});

describe('@angora-js/start - Request Handler & Streaming SSR', () => {
  @Component({
    selector: 'app-root',
    template: `<h1>Angora Full-Stack Start</h1>`,
  })
  class AppRoot {}

  const manifest = createRouteManifest({
    'routes/index.ts': {
      default: AppRoot,
      loader: async ({ params }) => ({ message: 'Loaded from Server' }),
    },
  });

  const handler = createRequestHandler({
    manifest,
    rootComponent: AppRoot,
  });

  test('should handle RPC requests via POST /_angora/rpc', async () => {
    createServerFunction('greet', async (name: string) => `Hello, ${name}!`);

    const rpcReq = new Request('http://localhost/_angora/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'greet', args: 'Angora' }),
    });

    const response = await handler(rpcReq);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.result).toBe('Hello, Angora!');
  });

  test('should stream HTML for page request GET /', async () => {
    const pageReq = new Request('http://localhost/', { method: 'GET' });
    const response = await handler(pageReq);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');

    const html = await response.text();
    expect(html).toContain('Angora Full-Stack Start');
  });

  test('should prerender static routes for SSG', async () => {
    const staticPages = await prerenderRoutes(AppRoot, ['/', '/about']);
    expect(staticPages['/']).toBeDefined();
    expect(staticPages['/']).toContain('<!DOCTYPE html>');
    expect(staticPages['/']).toContain('Angora Full-Stack Start');
    expect(staticPages['/about']).toContain('Angora Full-Stack Start');
  });

  test('should support server$ with automatic ID generation', async () => {
    const calculateDouble = server$(async (num: number) => num * 2);
    expect(calculateDouble.id).toContain('fn_');
    const res = await calculateDouble(21);
    expect(res).toBe(42);
  });

  test('should support Cloudflare Workers adapter', async () => {
    const cfHandler = createCloudflareHandler({
      manifest,
      rootComponent: AppRoot,
    });
    const req = new Request('http://localhost/', { method: 'GET' });
    const res = await cfHandler(
      req,
      { KV: {} },
      { waitUntil: () => {}, passThroughOnException: () => {} }
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Angora Full-Stack Start');
  });

  test('should support Vercel Edge adapter', async () => {
    const vercelHandler = createVercelEdgeHandler({
      manifest,
      rootComponent: AppRoot,
    });
    const req = new Request('http://localhost/', { method: 'GET' });
    const res = await vercelHandler(req);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Angora Full-Stack Start');
  });

  test('should generate optimized <picture> markup with AVIF/WebP and zero-CLS dimensions', () => {
    const markup = generateOptimizedImageMarkup({
      src: '/images/hero.png',
      alt: 'Hero banner',
      width: 1200,
      height: 630,
      priority: true,
      quality: 85,
      className: 'hero-img',
    });

    expect(markup).toContain('<picture>');
    expect(markup).toContain('type="image/avif" srcset="/images/hero.avif?q=85"');
    expect(markup).toContain('type="image/webp" srcset="/images/hero.webp?q=85"');
    expect(markup).toContain('loading="eager" decoding="sync"');
    expect(markup).toContain('fetchpriority="high"');
    expect(markup).toContain('aspect-ratio: 1200 / 630');
    expect(markup).toContain('class="hero-img"');
  });

  test('should accurately rate Core Web Vitals (LCP, CLS, INP, TTFB, FCP)', () => {
    // LCP
    expect(rateMetric('LCP', 1800)).toBe('good');
    expect(rateMetric('LCP', 3200)).toBe('needs-improvement');
    expect(rateMetric('LCP', 4500)).toBe('poor');

    // CLS
    expect(rateMetric('CLS', 0.05)).toBe('good');
    expect(rateMetric('CLS', 0.18)).toBe('needs-improvement');
    expect(rateMetric('CLS', 0.35)).toBe('poor');

    // INP
    expect(rateMetric('INP', 120)).toBe('good');
    expect(rateMetric('INP', 350)).toBe('needs-improvement');
    expect(rateMetric('INP', 600)).toBe('poor');

    // TTFB
    expect(rateMetric('TTFB', 400)).toBe('good');
    expect(rateMetric('TTFB', 1200)).toBe('needs-improvement');
    expect(rateMetric('TTFB', 2200)).toBe('poor');
  });

  test('should subscribe to onWebVitals telemetry and return unsubscribe function', () => {
    const metrics: any[] = [];
    const unsubscribe = onWebVitals(m => metrics.push(m));
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });
});
