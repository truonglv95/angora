import { describe, it, expect, beforeEach } from 'bun:test';
import { Window } from 'happy-dom';
import '@angora-js/compiler';
import {
  Component,
  signal,
  effect,
  Injector,
  rootInjector,
  runInInjectionContext,
} from '@angora-js/core';
import { createElement, createText } from '@angora-js/runtime';
import {
  Router,
  provideRouter,
  createRouterOutlet,
  RouterOutlet,
  bindRouterLinkActive,
  OUTLET_DEPTH,
  PreloadAllModules,
  withViewTransitions,
  type Routes,
} from '../src/index.ts';

describe('@angora-js/router - Advanced Enterprise Routing 2.0', () => {
  let doc: any;

  beforeEach(() => {
    const window = new Window();
    (globalThis as any).window = window;
    (globalThis as any).document = window.document;
    (globalThis as any).HTMLElement = window.HTMLElement;
    (globalThis as any).Comment = window.Comment;
    doc = window.document;
  });

  it('should support lazy loading via loadComponent', async () => {
    @Component({
      selector: 'app-lazy',
      template: `<h1>{{ title() }}</h1>`,
    })
    class LazyComponent {
      title = signal('Lazy Loaded Module');
    }

    const routes: Routes = [
      {
        path: 'admin',
        loadComponent: () => Promise.resolve({ default: LazyComponent }),
      },
    ];

    const injector = new Injector(provideRouter(routes), rootInjector);
    const router = injector.get(Router);

    const container = doc.createElement('div');
    doc.body.appendChild(container);

    const outletAnchor = doc.createComment('angora:router-outlet');
    container.appendChild(outletAnchor);

    // Run router outlet inside injector context
    const destroyOutlet = runInInjectionContext(injector, () => createRouterOutlet(outletAnchor));

    router.navigate('/admin');

    // Wait for promise resolution
    await new Promise(r => setTimeout(r, 20));

    expect(container.querySelector('h1')).not.toBeNull();
    expect(container.querySelector('h1')?.textContent).toBe('Lazy Loaded Module');

    destroyOutlet();
  });

  it('should support lazy loading routes via loadChildren', async () => {
    @Component({
      selector: 'app-admin-dashboard',
      template: `<h2>Admin Dashboard</h2>`,
    })
    class AdminDashboardComponent {}

    @Component({
      selector: 'app-admin-users',
      template: `<h2>Admin Users List</h2>`,
    })
    class AdminUsersComponent {}

    const routes: Routes = [
      {
        path: 'admin',
        loadChildren: () =>
          Promise.resolve([
            { path: '', component: AdminDashboardComponent },
            { path: 'users', component: AdminUsersComponent },
          ]),
      },
    ];

    const injector = new Injector(provideRouter(routes), rootInjector);
    const router = injector.get(Router);

    const container = doc.createElement('div');
    doc.body.appendChild(container);

    const outletAnchor = doc.createComment('angora:router-outlet');
    container.appendChild(outletAnchor);

    const destroyOutlet = runInInjectionContext(injector, () => createRouterOutlet(outletAnchor));

    const navRes = router.navigate('/admin/users');
    if (navRes instanceof Promise) {
      await navRes;
    }
    await new Promise(r => setTimeout(r, 25));

    expect(container.querySelector('h2')).not.toBeNull();
    expect(container.querySelector('h2')?.textContent).toBe('Admin Users List');

    destroyOutlet();
  });

  it('should support hierarchical nested router-outlets with parent layout and child route', async () => {
    @Component({
      selector: 'app-child-page',
      template: `<h3>Child Content Loaded</h3>`,
    })
    class ChildPageComponent {}

    @Component({
      selector: 'app-parent-layout',
      template: `
        <div class="layout">
          <h1>Parent Layout</h1>
        </div>
      `,
    })
    class ParentLayoutComponent {}

    const routes: Routes = [
      {
        path: 'dashboard',
        component: ParentLayoutComponent,
        children: [{ path: 'analytics', component: ChildPageComponent }],
      },
    ];

    const injector = new Injector(provideRouter(routes), rootInjector);
    const router = injector.get(Router);

    const container = doc.createElement('div');
    doc.body.appendChild(container);

    const rootAnchor = doc.createComment('angora:router-outlet');
    container.appendChild(rootAnchor);

    const destroyRoot = runInInjectionContext(injector, () => createRouterOutlet(rootAnchor));

    router.navigate('/dashboard/analytics');
    await new Promise(r => setTimeout(r, 20));

    expect(container.querySelector('h1')?.textContent).toBe('Parent Layout');

    // Create child outlet inside layout container with OUTLET_DEPTH = 1
    const childAnchor = doc.createComment('angora:router-outlet');
    const layoutEl = container.querySelector('.layout');
    layoutEl.appendChild(childAnchor);

    const childInjector = new Injector([{ provide: OUTLET_DEPTH, useValue: 1 }], injector);

    const destroyChild = runInInjectionContext(childInjector, () =>
      createRouterOutlet(childAnchor)
    );
    await new Promise(r => setTimeout(r, 20));

    expect(container.querySelector('h3')?.textContent).toBe('Child Content Loaded');

    destroyChild();
    destroyRoot();
  });

  it('should dispatch router navigation events and track isNavigating status', async () => {
    const routes: Routes = [
      {
        path: 'delayed',
        loadComponent: () =>
          new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  default: (() => {
                    const cls = class {};
                    (cls as any)[Symbol.for('ANGORA_COMPONENT')] = {
                      metadata: { template: '<p>Delayed</p>' },
                    };
                    return cls;
                  })(),
                }),
              20
            )
          ),
      },
    ];

    const injector = new Injector(provideRouter(routes), rootInjector);
    const router = injector.get(Router);

    const capturedEvents: string[] = [];
    effect(() => {
      const ev = router.events();
      if (ev) capturedEvents.push(ev.type);
    });

    const nav = router.navigate('/delayed');
    expect(capturedEvents).toContain('NavigationStart');

    if (nav instanceof Promise) {
      await nav;
    }
    await new Promise(r => setTimeout(r, 30));

    expect(capturedEvents).toContain('NavigationEnd');
    expect(router.isNavigating()).toBe(false);
  });

  it('should support async canActivate guard with promise resolution or redirection', async () => {
    let authPassed = false;

    @Component({ selector: 'app-login', template: `<h1>Login Page</h1>` })
    class LoginComponent {}

    @Component({ selector: 'app-secure', template: `<h1>Secure Area</h1>` })
    class SecureComponent {}

    const routes: Routes = [
      { path: 'login', component: LoginComponent },
      {
        path: 'secure',
        component: SecureComponent,
        canActivate: [
          () =>
            new Promise<boolean | string>(resolve => {
              setTimeout(() => resolve(authPassed ? true : '/login'), 15);
            }),
        ],
      },
    ];

    const injector = new Injector(provideRouter(routes), rootInjector);
    const router = injector.get(Router);

    // Initial navigation when authPassed is false -> should redirect to /login
    const nav1 = router.navigate('/secure');
    if (nav1 instanceof Promise) await nav1;
    await new Promise(r => setTimeout(r, 30));

    expect(router.url()).toBe('/login');
    expect(router.currentMatch()?.route.path).toBe('login');

    // Enable authPassed -> should allow navigation to /secure
    authPassed = true;
    const nav2 = router.navigate('/secure');
    if (nav2 instanceof Promise) await nav2;
    await new Promise(r => setTimeout(r, 30));

    expect(router.url()).toBe('/secure');
    expect(router.currentMatch()?.route.path).toBe('secure');
  });

  it('should update document title based on matched route title', () => {
    const routes: Routes = [
      { path: 'home', title: 'Home Page - Angora', component: class {} },
      { path: 'about', title: 'About Us - Angora', component: class {} },
    ];

    const injector = new Injector(provideRouter(routes), rootInjector);
    const router = injector.get(Router);

    router.navigate('/home');
    expect(doc.title).toBe('Home Page - Angora');

    router.navigate('/about');
    expect(doc.title).toBe('About Us - Angora');
  });

  it('should intercept navigation with canActivate route guard', () => {
    let isAuthenticated = false;

    @Component({
      selector: 'app-secret',
      template: `<div>Secret</div>`,
    })
    class SecretComponent {}

    const routes: Routes = [
      { path: 'public', component: SecretComponent },
      {
        path: 'dashboard',
        component: SecretComponent,
        canActivate: [() => isAuthenticated],
      },
    ];

    const injector = new Injector(provideRouter(routes), rootInjector);
    const router = injector.get(Router);

    // Attempt to navigate to protected route while unauthenticated
    const success1 = router.navigate('/dashboard');
    expect(success1).toBe(false);
    expect(router.currentMatch()).toBeNull();

    // Authenticate and navigate again
    isAuthenticated = true;
    const success2 = router.navigate('/dashboard');
    expect(success2).toBe(true);
    expect(router.currentMatch()?.route.path).toBe('dashboard');
  });

  it('should extract queryParams and hash fragments into reactive signals', () => {
    const routes: Routes = [{ path: 'products', component: class {} }];

    const injector = new Injector(provideRouter(routes), rootInjector);
    const router = injector.get(Router);

    router.navigate('/products', {
      queryParams: { category: 'electronics', page: '2' },
      fragment: 'reviews',
    });

    expect(router.queryParams()).toEqual({ category: 'electronics', page: '2' });
    expect(router.fragment()).toBe('reviews');
    expect(router.url()).toBe('/products?category=electronics&page=2#reviews');
  });

  it('should dynamically toggle active class with bindRouterLinkActive', () => {
    const routes: Routes = [
      { path: 'home', component: class {} },
      { path: 'users', component: class {} },
    ];

    const injector = new Injector(provideRouter(routes), rootInjector);
    const router = injector.get(Router);

    const link = doc.createElement('a');
    doc.body.appendChild(link);

    const stopActive = runInInjectionContext(injector, () =>
      bindRouterLinkActive(link, '/users', 'nav-active')
    );

    router.navigate('/home');
    expect(link.classList.contains('nav-active')).toBe(false);

    router.navigate('/users');
    expect(link.classList.contains('nav-active')).toBe(true);

    router.navigate('/home');
    expect(link.classList.contains('nav-active')).toBe(false);

    stopActive();
  });

  it('should preload lazy routes using PreloadAllModules strategy', async () => {
    let preloaded = false;
    const routes: Routes = [
      {
        path: 'reports',
        loadComponent: () => {
          preloaded = true;
          return Promise.resolve({ default: class {} });
        },
      },
    ];

    const injector = new Injector(
      provideRouter(routes, { preloadingStrategy: PreloadAllModules }),
      rootInjector
    );
    const router = injector.get(Router);

    await new Promise(r => setTimeout(r, 25));
    expect(preloaded).toBe(true);
  });

  it('should resolve route data asynchronously before finishing navigation', async () => {
    const routes: Routes = [
      {
        path: 'user/:id',
        component: class {},
        resolve: {
          userData: (match: any) =>
            new Promise(resolve => {
              setTimeout(() => {
                resolve({ id: match.params.id, name: 'Alice Smith' });
              }, 15);
            }),
        },
      },
    ];

    const injector = new Injector(provideRouter(routes), rootInjector);
    const router = injector.get(Router);

    const nav = router.navigate('/user/42');
    if (nav instanceof Promise) {
      await nav;
    }
    await new Promise(r => setTimeout(r, 25));

    expect(router.currentMatch()?.resolvedData).toEqual({
      userData: { id: '42', name: 'Alice Smith' },
    });
  });

  it('should support scroll position restoration', () => {
    let scrolledToX = -1;
    let scrolledToY = -1;
    (globalThis as any).window.scrollTo = (x: number, y: number) => {
      scrolledToX = x;
      scrolledToY = y;
    };

    const routes: Routes = [
      { path: 'page1', component: class {} },
      { path: 'page2', component: class {} },
    ];

    const injector = new Injector(
      provideRouter(routes, { scrollPositionRestoration: 'top' }),
      rootInjector
    );
    const router = injector.get(Router);

    router.navigate('/page1');
    expect(scrolledToX).toBe(0);
    expect(scrolledToY).toBe(0);
  });

  it('should trigger document.startViewTransition when withViewTransitions is enabled', () => {
    let transitionCalled = false;
    (globalThis as any).document.startViewTransition = (callback: () => void) => {
      transitionCalled = true;
      callback();
    };

    const routes: Routes = [
      { path: 'home', component: class {} },
      { path: 'details', component: class {} },
    ];

    const injector = new Injector(provideRouter(routes, withViewTransitions()), rootInjector);
    const router = injector.get(Router);

    router.navigate('/home');
    expect(transitionCalled).toBe(true);
    expect(router.url()).toBe('/home');

    transitionCalled = false;
    // Test navigation override with viewTransition: false
    router.navigate('/details', { viewTransition: false });
    expect(transitionCalled).toBe(false);
    expect(router.url()).toBe('/details');
  });
});
