import { signal, type Signal, InjectionToken, inject, type Provider } from '@angora-js/core';
import type {
  Route,
  Routes,
  NavigationOptions,
  RouteMatch,
  RouterEvent,
  PreloadingStrategy,
  RouterConfigOptions,
  RouterFeature,
} from './types.ts';

export const ROUTER_ROUTES = new InjectionToken<Routes>('ROUTER_ROUTES');
export const ROUTER_OPTIONS = new InjectionToken<RouterConfigOptions>('ROUTER_OPTIONS');

export const PreloadAllModules: PreloadingStrategy = {
  preload(route: Route, fn: () => Promise<any>): Promise<any> {
    return fn();
  },
};

export const NoPreloading: PreloadingStrategy = {
  preload(route: Route, fn: () => Promise<any>): Promise<any> {
    return Promise.resolve();
  },
};

export class Router {
  public url = signal(
    typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/'
  );
  public params = signal<Record<string, string>>({});
  public queryParams = signal<Record<string, string>>({});
  public fragment = signal<string | null>(null);
  public currentMatch = signal<RouteMatch | null>(null);
  public isNavigating = signal<boolean>(false);
  public events = signal<RouterEvent | null>(null);

  private routes: Routes;
  private config: RouterConfigOptions;
  private scrollPositions = new Map<string, { x: number; y: number }>();

  constructor() {
    this.routes = inject(ROUTER_ROUTES, []);
    try {
      this.config = inject(ROUTER_OPTIONS, {});
    } catch {
      this.config = {};
    }

    this.updateMatch(this.url());

    if (this.config.preloadingStrategy) {
      this.preloadRoutes(this.routes, this.config.preloadingStrategy);
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', () => {
        const path = window.location.pathname + window.location.search + window.location.hash;
        this.url.set(path);
        this.updateMatch(path);

        if (this.config.scrollPositionRestoration === 'enabled') {
          const pos = this.scrollPositions.get(path);
          if (pos && typeof window.scrollTo === 'function') {
            window.scrollTo(pos.x, pos.y);
          }
        }
      });
    }
  }

  public preloadRoutes(routes: Routes, strategy: PreloadingStrategy): void {
    const schedule = (fn: () => void) => {
      if (typeof (globalThis as any).requestIdleCallback === 'function') {
        (globalThis as any).requestIdleCallback(fn);
      } else {
        setTimeout(fn, 10);
      }
    };

    for (const route of routes) {
      if (route.loadComponent) {
        schedule(() => {
          strategy.preload(route, () => route.loadComponent!());
        });
      }
      if (route.loadChildren) {
        schedule(() => {
          strategy
            .preload(route, () => this.loadRouteChildren(route))
            .then(children => {
              if (Array.isArray(children)) {
                this.preloadRoutes(children, strategy);
              }
            });
        });
      }
      if (route.children && route.children.length > 0) {
        this.preloadRoutes(route.children, strategy);
      }
    }
  }

  public async loadRouteChildren(route: Route): Promise<Routes> {
    if (route.children) return route.children;
    if (route.loadChildren) {
      const mod = await route.loadChildren();
      route.children = (mod as any).default || mod;
      return route.children || [];
    }
    return [];
  }

  public findUnloadedRoute(fullPath: string, routes: Routes): Route | null {
    const cleanPath = fullPath.split('?')[0].split('#')[0];
    const urlSegments = cleanPath.split('/').filter(Boolean);

    for (const route of routes) {
      const routeSegments = route.path.split('/').filter(Boolean);
      if (routeSegments.length > urlSegments.length) continue;

      let matches = true;
      for (let i = 0; i < routeSegments.length; i++) {
        if (routeSegments[i].startsWith(':')) continue;
        if (routeSegments[i] !== urlSegments[i]) {
          matches = false;
          break;
        }
      }

      if (matches) {
        if (route.loadChildren && (!route.children || route.children.length === 0)) {
          return route;
        }
        if (route.children && route.children.length > 0) {
          const remaining = '/' + urlSegments.slice(routeSegments.length).join('/');
          const nested = this.findUnloadedRoute(remaining, route.children);
          if (nested) return nested;
        }
      }
    }
    return null;
  }

  public navigate(path: string, options?: NavigationOptions): boolean | Promise<boolean> {
    let fullPath = path;

    if (options?.queryParams && Object.keys(options.queryParams).length > 0) {
      const searchParams = new URLSearchParams(options.queryParams);
      const delimiter = fullPath.includes('?') ? '&' : '?';
      fullPath += `${delimiter}${searchParams.toString()}`;
    }

    if (options?.fragment) {
      fullPath += `#${options.fragment}`;
    }

    this.isNavigating.set(true);
    this.events.set({ type: 'NavigationStart', url: fullPath });

    const match = this.matchRoute(fullPath, this.routes);
    if (!match) {
      const unloaded = this.findUnloadedRoute(fullPath, this.routes);
      if (unloaded) {
        return this.loadRouteChildren(unloaded).then(() => {
          return this.navigate(fullPath, options);
        });
      }
    }

    if (match) {
      if (match.route.redirectTo) {
        return this.navigate(match.route.redirectTo, { replaceUrl: true });
      }

      // Check canActivate guards (sync or async)
      if (match.route.canActivate && match.route.canActivate.length > 0) {
        for (const guard of match.route.canActivate) {
          const res =
            typeof guard === 'function' ? guard(match, this) : guard.canActivate?.(match, this);
          if (res instanceof Promise) {
            return res.then(asyncRes => {
              if (typeof asyncRes === 'string') {
                return this.navigate(asyncRes, { replaceUrl: true });
              }
              if (asyncRes === false) {
                this.isNavigating.set(false);
                this.events.set({ type: 'NavigationCancel', url: fullPath });
                return false;
              }
              const resolveRes = this.resolveMatchData(match);
              if (resolveRes instanceof Promise) {
                return resolveRes.then(() => this.finishNavigation(fullPath, match, options));
              }
              return this.finishNavigation(fullPath, match, options);
            });
          }
          if (typeof res === 'string') {
            return this.navigate(res, { replaceUrl: true });
          }
          if (res === false) {
            this.isNavigating.set(false);
            this.events.set({ type: 'NavigationCancel', url: fullPath });
            return false;
          }
        }
      }
    }

    const resolveRes = this.resolveMatchData(match);
    if (resolveRes instanceof Promise) {
      return resolveRes.then(() => this.finishNavigation(fullPath, match, options));
    }

    return this.finishNavigation(fullPath, match, options);
  }

  private resolveMatchData(match: RouteMatch | null): Promise<void> | void {
    if (!match) return;
    const targetRoute = match.childMatch?.route.resolve ? match.childMatch.route : match.route;
    if (!targetRoute.resolve) return;

    const keys = Object.keys(targetRoute.resolve);
    let hasPromise = false;
    const results: Record<string, any> = {};

    for (const key of keys) {
      const resolver = targetRoute.resolve[key];
      const val = typeof resolver === 'function' ? resolver(match, this) : resolver;
      if (val instanceof Promise) {
        hasPromise = true;
      }
      results[key] = val;
    }

    if (hasPromise) {
      const promises = keys.map(k =>
        Promise.resolve(results[k]).then(resolved => ({ key: k, val: resolved }))
      );
      return Promise.all(promises).then(entries => {
        const data: Record<string, any> = {};
        for (const e of entries) {
          data[e.key] = e.val;
        }
        match.resolvedData = data;
        if (match.childMatch) match.childMatch.resolvedData = data;
      });
    } else {
      match.resolvedData = results;
      if (match.childMatch) match.childMatch.resolvedData = results;
    }
  }

  private finishNavigation(
    fullPath: string,
    match: RouteMatch | null,
    options?: NavigationOptions
  ): boolean {
    if (typeof window !== 'undefined') {
      this.scrollPositions.set(this.url(), {
        x: window.scrollX || 0,
        y: window.scrollY || 0,
      });

      if (options?.replaceUrl) {
        window.history.replaceState(null, '', fullPath);
      } else {
        window.history.pushState(null, '', fullPath);
      }

      if (
        this.config.scrollPositionRestoration === 'top' ||
        this.config.scrollPositionRestoration === 'enabled'
      ) {
        if (!options?.replaceUrl && typeof window.scrollTo === 'function') {
          window.scrollTo(0, 0);
        }
      }
    }

    const applyState = () => {
      this.url.set(fullPath);
      this.applyMatch(match);
      if (typeof document !== 'undefined') {
        const title = match?.childMatch?.route.title || match?.route.title;
        if (title) {
          document.title = title;
        }
      }
      this.isNavigating.set(false);
      this.events.set({ type: 'NavigationEnd', url: fullPath });

      if (typeof (globalThis as any).__ANGORA_DEVTOOLS_BACKEND__?.setRoute === 'function') {
        (globalThis as any).__ANGORA_DEVTOOLS_BACKEND__.setRoute(fullPath);
      }
    };

    const enableTransitions =
      options?.viewTransition !== undefined ? options.viewTransition : this.config.viewTransitions;

    if (
      enableTransitions &&
      typeof document !== 'undefined' &&
      typeof (document as any).startViewTransition === 'function'
    ) {
      (document as any).startViewTransition(() => {
        applyState();
      });
    } else {
      applyState();
    }
    return true;
  }

  private updateMatch(fullUrl: string): void {
    const match = this.matchRoute(fullUrl, this.routes);
    if (match) {
      if (match.route.redirectTo) {
        this.navigate(match.route.redirectTo, { replaceUrl: true });
        return;
      }

      // Check guards
      if (match.route.canActivate && match.route.canActivate.length > 0) {
        for (const guard of match.route.canActivate) {
          const can =
            typeof guard === 'function' ? guard(match, this) : guard.canActivate?.(match, this);
          if (can === false) {
            return;
          }
        }
      }

      this.applyMatch(match);
    } else {
      const unloaded = this.findUnloadedRoute(fullUrl, this.routes);
      if (unloaded) {
        this.loadRouteChildren(unloaded).then(() => {
          this.updateMatch(fullUrl);
        });
        return;
      }
      this.currentMatch.set(null);
    }
  }

  private applyMatch(match: RouteMatch | null): void {
    if (match) {
      this.params.set(match.params);
      this.queryParams.set(match.queryParams);
      this.fragment.set(match.fragment || null);
      this.currentMatch.set(match);
    } else {
      this.params.set({});
      this.queryParams.set({});
      this.fragment.set(null);
      this.currentMatch.set(null);
    }
  }

  public matchRoute(fullUrl: string, routes: Routes): RouteMatch | null {
    // Separate pathname, query string, and hash fragment
    const hashSplit = fullUrl.split('#');
    const fragment = hashSplit.length > 1 ? hashSplit[1] : undefined;
    const pathAndQuery = hashSplit[0];

    const querySplit = pathAndQuery.split('?');
    const cleanPath = querySplit[0].replace(/\/+$/, '') || '/';
    const queryString = querySplit.length > 1 ? querySplit[1] : '';

    const queryParams: Record<string, string> = {};
    if (queryString) {
      const searchParams = new URLSearchParams(queryString);
      searchParams.forEach((val, key) => {
        queryParams[key] = val;
      });
    }

    for (const route of routes) {
      const routePath = route.path.replace(/\/+$/, '') || '/';

      if (routePath === '**') {
        return { route, params: {}, queryParams, fragment, data: route.data };
      }

      const routeSegments = routePath.split('/').filter(Boolean);
      const urlSegments = cleanPath.split('/').filter(Boolean);

      if (route.pathMatch === 'full' && routeSegments.length !== urlSegments.length) {
        continue;
      }

      if (routeSegments.length > urlSegments.length) {
        continue;
      }

      let matches = true;
      const params: Record<string, string> = {};

      for (let i = 0; i < routeSegments.length; i++) {
        const rSeg = routeSegments[i];
        const uSeg = urlSegments[i];

        if (rSeg.startsWith(':')) {
          params[rSeg.slice(1)] = uSeg;
        } else if (rSeg !== uSeg) {
          matches = false;
          break;
        }
      }

      if (matches) {
        if (route.pathMatch !== 'prefix' && routeSegments.length !== urlSegments.length) {
          // If there are child routes and more url segments remain, try matching children!
          if (route.children && route.children.length > 0) {
            const remainingPath = '/' + urlSegments.slice(routeSegments.length).join('/');
            const childMatch = this.matchRoute(remainingPath, route.children);
            if (childMatch) {
              return {
                route,
                params: { ...params, ...childMatch.params },
                queryParams,
                fragment,
                data: route.data,
                childMatch,
              };
            }
          }
          continue;
        }

        // If path matched exactly, check if there is a default child route (path: '')
        if (route.children && route.children.length > 0) {
          const defaultChild = this.matchRoute('/', route.children);
          if (defaultChild) {
            return {
              route,
              params: { ...params, ...defaultChild.params },
              queryParams,
              fragment,
              data: route.data,
              childMatch: defaultChild,
            };
          }
        }

        return { route, params, queryParams, fragment, data: route.data };
      }
    }

    return null;
  }
}

/**
 * Enables HTML5 native View Transitions API for seamless cross-route page animations.
 * When enabled, router navigations wrap state updates in `document.startViewTransition()`.
 */
export function withViewTransitions(): RouterFeature {
  return (config: RouterConfigOptions) => {
    config.viewTransitions = true;
  };
}

/**
 * Configure routes provider for the application
 * @example
 * bootstrapApplication(AppComponent, '#app', {
 *   providers: [provideRouter(routes, withViewTransitions())]
 * });
 */
export function provideRouter(
  routes: Routes,
  configOrFeature?: RouterConfigOptions | RouterFeature,
  ...features: RouterFeature[]
): Provider[] {
  let resolvedConfig: RouterConfigOptions = {};
  if (typeof configOrFeature === 'function') {
    configOrFeature(resolvedConfig);
  } else if (configOrFeature) {
    resolvedConfig = { ...configOrFeature };
  }
  for (const feature of features) {
    if (typeof feature === 'function') {
      feature(resolvedConfig);
    }
  }

  return [
    { provide: ROUTER_ROUTES, useValue: routes },
    { provide: ROUTER_OPTIONS, useValue: resolvedConfig },
    Router,
  ];
}

/**
 * Concise composable hook to inject the active Router instance
 * @example
 * const router = useRouter();
 * router.navigate('/dashboard');
 */
export function useRouter(): Router {
  return inject(Router);
}

/**
 * Concise composable hook returning the reactive params signal
 * @example
 * const params = useParams();
 * console.log(params().id);
 */
export function useParams(): Signal<Record<string, string>> {
  return useRouter().params;
}

/**
 * Concise composable hook returning the reactive queryParams signal
 * @example
 * const query = useQueryParams();
 * console.log(query().search);
 */
export function useQueryParams(): Signal<Record<string, string>> {
  return useRouter().queryParams;
}

/**
 * Concise composable hook returning the active route url signal
 * @example
 * const url = useRoute();
 * console.log(url());
 */
export function useRoute(): Signal<string> {
  return useRouter().url;
}
