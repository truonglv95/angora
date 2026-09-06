import { describe, test, expect } from 'bun:test';
import { Injector, InjectionToken, inject, runInInjectionContext } from '../src/di';

describe('@angora-js/core - Dependency Injection', () => {
  test('should inject class provider', () => {
    class LoggerService {
      log(msg: string) {
        return `[LOG]: ${msg}`;
      }
    }

    const injector = new Injector([LoggerService]);
    const logger = injector.get(LoggerService);
    expect(logger).toBeInstanceOf(LoggerService);
    expect(logger.log('hello')).toBe('[LOG]: hello');

    // Should return singleton instance within same injector
    expect(injector.get(LoggerService)).toBe(logger);
  });

  test('should inject value provider', () => {
    const API_URL = new InjectionToken<string>('API_URL');
    const injector = new Injector([{ provide: API_URL, useValue: 'https://api.angora.dev' }]);

    expect(injector.get(API_URL)).toBe('https://api.angora.dev');
  });

  test('should resolve hierarchical injectors', () => {
    const PARENT_CONFIG = new InjectionToken<string>('PARENT_CONFIG');
    const CHILD_CONFIG = new InjectionToken<string>('CHILD_CONFIG');

    const parent = new Injector([{ provide: PARENT_CONFIG, useValue: 'parent-val' }]);
    const child = new Injector([{ provide: CHILD_CONFIG, useValue: 'child-val' }], parent);

    expect(child.get(CHILD_CONFIG)).toBe('child-val');
    expect(child.get(PARENT_CONFIG)).toBe('parent-val');
  });

  test('should support inject() in context', () => {
    class ConfigService {
      env = 'production';
    }

    const injector = new Injector([ConfigService]);

    const result = runInInjectionContext(injector, () => {
      const config = inject(ConfigService);
      return config.env;
    });

    expect(result).toBe('production');
  });
});
