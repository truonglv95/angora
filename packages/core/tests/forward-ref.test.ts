import { describe, test, expect } from 'bun:test';
import {
  Component,
  forwardRef,
  resolveForwardRef,
  isForwardRef,
  resolveImports,
  getComponentImports,
  getComponentDef,
  Injector,
  inject,
  runInInjectionContext,
} from '../src/index.ts';

describe('@angora-js/core - forwardRef & Lazy Imports Resolution', () => {
  test('should create forwardRef wrapper and identify it with isForwardRef', () => {
    class DummyClass {}
    const ref = forwardRef(() => DummyClass);

    expect(isForwardRef(ref)).toBe(true);
    expect(isForwardRef(DummyClass)).toBe(false);
    expect(isForwardRef({})).toBe(false);
    expect(isForwardRef(null)).toBe(false);

    expect(resolveForwardRef(ref)).toBe(DummyClass);
    expect(resolveForwardRef(DummyClass)).toBe(DummyClass);
  });

  test('should resolveImports recursively for arrays, thunks, and forwardRefs', () => {
    class CompA {}
    class CompB {}
    class CompC {}

    // Array with forwardRef
    const res1 = resolveImports([CompA, forwardRef(() => CompB)]);
    expect(res1).toEqual([CompA, CompB]);

    // Thunk function returning array with forwardRef
    const res2 = resolveImports(() => [CompA, [forwardRef(() => CompB), CompC]]);
    expect(res2).toEqual([CompA, CompB, CompC]);

    // Empty or null
    expect(resolveImports(null)).toEqual([]);
    expect(resolveImports(undefined)).toEqual([]);
    expect(resolveImports([])).toEqual([]);
  });

  test('should resolve TDZ circular and forward-referenced classes in DI', () => {
    // Consumer registered before Service definition
    const injector = new Injector([
      {
        provide: forwardRef(() => LateService),
        useClass: forwardRef(() => LateService),
      },
    ]);

    class LateService {
      name = 'late-service';
    }

    runInInjectionContext(injector, () => {
      const instance = inject<LateService>(forwardRef(() => LateService));
      expect(instance).toBeInstanceOf(LateService);
      expect(instance.name).toBe('late-service');
    });
  });

  test('should resolve TDZ between two components in the same file using forwardRef', () => {
    // ParentComponent declared BEFORE ChildComponent
    @Component({
      selector: 'parent-comp',
      imports: [forwardRef(() => ChildComponent)],
      template: '<div><child-comp></child-comp></div>',
    })
    class ParentComponent {}

    @Component({
      selector: 'child-comp',
      template: '<span>child</span>',
    })
    class ChildComponent {}

    // Verify metadata and resolved imports
    const def = getComponentDef(ParentComponent);
    expect(def).toBeDefined();

    const resolved = getComponentImports(ParentComponent);
    expect(resolved).toEqual([ChildComponent]);
  });

  test('should support thunk imports: () => [...] to avoid static TDZ evaluation', () => {
    @Component({
      selector: 'thunk-parent',
      imports: () => [LateChildComponent],
      template: '<div><late-child></late-child></div>',
    })
    class ThunkParentComponent {}

    @Component({
      selector: 'late-child',
      template: '<span>late</span>',
    })
    class LateChildComponent {}

    const resolved = getComponentImports(ThunkParentComponent);
    expect(resolved).toEqual([LateChildComponent]);
  });
});
