import { describe, test, expect } from 'bun:test';
import { Injector, runInInjectionContext } from '@angora-js/core';
import { Router, provideRouter, type Routes } from '../src/index.ts';

describe('@angora-js/router - SPA Routing Engine', () => {
  const routes: Routes = [
    { path: '', redirectTo: '/home', pathMatch: 'full' },
    { path: 'home' },
    { path: 'users/:id' },
    { path: 'posts/:category/:postId' },
    { path: '**' },
  ];

  test('should match exact route', () => {
    const injector = new Injector(provideRouter(routes));
    const router = injector.get(Router);

    const match = router.matchRoute('/home', routes);
    expect(match).not.toBeNull();
    expect(match?.route.path).toBe('home');
    expect(match?.params).toEqual({});
  });

  test('should match parameterized route and extract params', () => {
    const injector = new Injector(provideRouter(routes));
    const router = injector.get(Router);

    const match = router.matchRoute('/users/42', routes);
    expect(match).not.toBeNull();
    expect(match?.route.path).toBe('users/:id');
    expect(match?.params).toEqual({ id: '42' });
  });

  test('should match multiple params in nested route', () => {
    const injector = new Injector(provideRouter(routes));
    const router = injector.get(Router);

    const match = router.matchRoute('/posts/tech/99', routes);
    expect(match).not.toBeNull();
    expect(match?.route.path).toBe('posts/:category/:postId');
    expect(match?.params).toEqual({ category: 'tech', postId: '99' });
  });

  test('should update url and params signals on navigation', () => {
    const injector = new Injector(provideRouter(routes));
    const router = injector.get(Router);

    router.navigate('/users/100');
    expect(router.url()).toBe('/users/100');
    expect(router.params()).toEqual({ id: '100' });

    router.navigate('/home');
    expect(router.url()).toBe('/home');
    expect(router.params()).toEqual({});
  });

  test('should match wildcard fallback route', () => {
    const injector = new Injector(provideRouter(routes));
    const router = injector.get(Router);

    const match = router.matchRoute('/unknown/random/page', routes);
    expect(match).not.toBeNull();
    expect(match?.route.path).toBe('**');
  });
});
