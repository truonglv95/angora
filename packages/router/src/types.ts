import type { Type } from '@angora-js/core';

export type CanActivateFn = (
  route: RouteMatch,
  router: any
) => boolean | Promise<boolean> | string | Promise<string>;

export type CanDeactivateFn<T = any> = (
  component: T,
  currentRoute: RouteMatch
) => boolean | Promise<boolean>;

export type ResolveFn<T = any> = (route: RouteMatch, router: any) => T | Promise<T>;

export interface PreloadingStrategy {
  preload(route: Route, fn: () => Promise<any>): Promise<any>;
}

export interface RouterConfigOptions {
  preloadingStrategy?: PreloadingStrategy;
  scrollPositionRestoration?: 'disabled' | 'top' | 'enabled';
  viewTransitions?: boolean;
}

export type RouterFeature = (config: RouterConfigOptions) => void;

export interface Route {
  path: string;
  component?: Type<any>;
  loadComponent?: () => Promise<Type<any> | { default: Type<any> }>;
  loadChildren?: () => Promise<Routes | { default: Routes }>;
  redirectTo?: string;
  pathMatch?: 'full' | 'prefix';
  canActivate?: Array<CanActivateFn | any>;
  canDeactivate?: Array<CanDeactivateFn | any>;
  resolve?: Record<string, ResolveFn | any>;
  data?: Record<string, any>;
  title?: string;
  children?: Route[];
}

export type Routes = Route[];

export interface NavigationOptions {
  replaceUrl?: boolean;
  queryParams?: Record<string, string>;
  fragment?: string;
  viewTransition?: boolean;
}

export interface RouteMatch {
  route: Route;
  params: Record<string, string>;
  queryParams: Record<string, string>;
  fragment?: string;
  data?: Record<string, any>;
  resolvedData?: Record<string, any>;
  childMatch?: RouteMatch;
}

export type RouterEventType =
  | 'NavigationStart'
  | 'NavigationEnd'
  | 'NavigationCancel'
  | 'NavigationError';

export interface RouterEvent {
  type: RouterEventType;
  url: string;
  error?: any;
}
