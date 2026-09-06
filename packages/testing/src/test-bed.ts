import { bootstrapApplication } from '@angora-js/runtime';
import '@angora-js/compiler';
import { Injector, rootInjector, type Provider } from '@angora-js/core';
import { createFixture } from './fixture.ts';
import type { ComponentFixture, TestModuleConfig } from './types.ts';

let activeConfig: TestModuleConfig = {};

/**
 * TestBed configures and initializes environment for unit testing Angora components and services.
 */
export class TestBed {
  static configureTestingModule(config: TestModuleConfig): typeof TestBed {
    activeConfig = {
      providers: [...(config.providers || [])],
      imports: [...(config.imports || [])],
    };
    return TestBed;
  }

  static createComponent<T>(componentType: new (...args: any[]) => T): ComponentFixture<T> {
    const container = document.createElement('div');
    container.className = 'angora-test-container';
    document.body.appendChild(container);

    const instance = bootstrapApplication(componentType, container, {
      providers: activeConfig.providers,
    });

    return createFixture(instance, container, () => {
      // Cleanup
    });
  }

  static inject<T>(token: any): T {
    const injector = new Injector(activeConfig.providers || [], rootInjector);
    return injector.get<T>(token);
  }

  static resetTestingModule(): void {
    activeConfig = {};
  }
}

/**
 * Zero-ceremony shorthand to quickly mount and test an Angora component
 *
 * @example
 * const { nativeElement, componentInstance } = renderComponent(MyComponent);
 */
export function renderComponent<T>(
  componentType: new (...args: any[]) => T,
  options: TestModuleConfig = {}
): ComponentFixture<T> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule(options);
  return TestBed.createComponent(componentType);
}
