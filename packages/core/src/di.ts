/**
 * @angora-js/core - Lightweight Dependency Injection System
 * Inspired by Angular's hierarchical DI, but ultra-lightweight (<100 lines).
 */

export type Type<T> = new (...args: any[]) => T;

export class InjectionToken<T> {
  public readonly description: string;
  public readonly options?: { providedIn?: 'root'; factory?: () => T };

  constructor(description: string, options?: { providedIn?: 'root'; factory?: () => T }) {
    this.description = description;
    this.options = options;
  }

  toString(): string {
    return `InjectionToken(${this.description})`;
  }
}

export type ProviderToken<T> = Type<T> | InjectionToken<T>;

export interface ValueProvider<T> {
  provide: ProviderToken<T>;
  useValue: T;
}

export interface ClassProvider<T> {
  provide: ProviderToken<T>;
  useClass: Type<T>;
}

export interface FactoryProvider<T> {
  provide: ProviderToken<T>;
  useFactory: (...args: any[]) => T;
  deps?: ProviderToken<any>[];
}

export type Provider<T = any> = Type<T> | ValueProvider<T> | ClassProvider<T> | FactoryProvider<T>;

import { resolveForwardRef } from './forward-ref.ts';

let currentInjector: Injector | null = null;

export class Injector {
  private records = new Map<ProviderToken<any>, any>();
  private pendingProviders: Provider[] = [];
  public readonly parent: Injector | null;

  constructor(providers: Provider[] = [], parent: Injector | null = null) {
    this.parent = parent;
    this.pendingProviders = [...providers];
  }

  private processPending(): void {
    if (this.pendingProviders.length === 0) return;
    const list = this.pendingProviders;
    this.pendingProviders = [];
    for (const provider of list) {
      this.register(provider);
    }
  }

  private register<T>(provider: Provider<T>): void {
    const p = resolveForwardRef(provider) as any;
    if (typeof p === 'function') {
      // Type<T>
      this.records.set(p, { factory: () => new p(), instance: undefined });
    } else if (p && 'useValue' in p) {
      this.records.set(resolveForwardRef(p.provide), { instance: p.useValue });
    } else if (p && 'useClass' in p) {
      const classRef = p.useClass;
      this.records.set(resolveForwardRef(p.provide), {
        factory: () => {
          const Cls = resolveForwardRef(classRef);
          return new Cls();
        },
        instance: undefined,
      });
    } else if (p && 'useFactory' in p) {
      this.records.set(resolveForwardRef(p.provide), {
        factory: () => {
          const deps = (p.deps || []).map((dep: any) => this.get(resolveForwardRef(dep)));
          return p.useFactory(...deps);
        },
        instance: undefined,
      });
    }
  }

  get<T>(token: ProviderToken<T>, notFoundValue?: T): T {
    this.processPending();
    token = resolveForwardRef(token) as ProviderToken<T>;
    if (token === Injector) {
      return this as any;
    }

    if (this.records.has(token)) {
      const record = this.records.get(token);
      if (record.instance === undefined && record.factory) {
        // Execute factory inside this injector context
        const prev = currentInjector;
        currentInjector = this;
        try {
          record.instance = record.factory();
        } finally {
          currentInjector = prev;
        }
      }
      return record.instance;
    }

    if (this.parent) {
      return this.parent.get(token, notFoundValue);
    }

    if (token instanceof InjectionToken && token.options?.factory) {
      const instance = token.options.factory();
      this.records.set(token, { instance });
      return instance;
    }

    if (typeof token === 'function') {
      const prov = getInjectableDef(token);
      if (prov?.providedIn === 'root') {
        if (this !== rootInjector) {
          return rootInjector.get(token, notFoundValue);
        }
        this.register(token);
        return this.get(token, notFoundValue);
      }
    }

    if (notFoundValue !== undefined) {
      return notFoundValue;
    }

    throw new Error(`[Angora DI] No provider found for token: ${token.toString()}`);
  }
}

import { ɵprov, INJECTABLE_DEF } from './defs.ts';
export { ɵprov, INJECTABLE_DEF };

export interface InjectableOptions {
  providedIn?: 'root' | null;
}

export interface InjectableDef<T = any> {
  providedIn?: 'root' | null;
  factory?: () => T;
}

export interface InjectableType<T = any> {
  new (...args: any[]): T;
  ɵprov?: InjectableDef<T>;
  __injectable__?: InjectableDef<T>;
}

export function getInjectableDef<T>(target: any): InjectableDef<T> | undefined {
  return target?.ɵprov ?? target?.[INJECTABLE_DEF] ?? target?.__injectable__;
}

/**
 * Decorator that marks a class as available to be provided and injected as a dependency.
 * @example
 * @Injectable({ providedIn: 'root' })
 * export class HeroService {}
 */
export function Injectable(options?: InjectableOptions) {
  return function <T extends { new (...args: any[]): any }>(target: T) {
    const def: InjectableDef = options || {};
    const injTarget = target as unknown as InjectableType<InstanceType<T>>;
    injTarget.ɵprov = def;
    injTarget[INJECTABLE_DEF] = def;
    injTarget.__injectable__ = def;
    return target;
  };
}

/** Root injector singleton */
export const rootInjector = new Injector();

/**
 * Injects a dependency in the current injection context
 * @example
 * const userService = inject(UserService);
 */
export function inject<T>(token: ProviderToken<T>, notFoundValue?: T): T {
  const resolvedToken = resolveForwardRef(token) as ProviderToken<T>;
  const injector = currentInjector || rootInjector;
  return injector.get(resolvedToken, notFoundValue);
}

/**
 * Returns the currently active Injector in the execution context, or rootInjector if none.
 */
export function getCurrentInjector(): Injector {
  return currentInjector || rootInjector;
}

/**
 * Runs a function within an injector context
 */
export function runInInjectionContext<T>(injector: Injector, fn: () => T): T {
  const prev = currentInjector;
  currentInjector = injector;
  try {
    return fn();
  } finally {
    currentInjector = prev;
  }
}
