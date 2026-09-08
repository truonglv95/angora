import { describe, test, expect } from 'bun:test';
import { signal, computed, effect, batch, untrack, resetDevMode } from '../src/index';

describe('@angora-js/core - Signals Engine', () => {
  test('should create signal and read/update value', () => {
    const count = signal(0);
    expect(count()).toBe(0);

    count.set(5);
    expect(count()).toBe(5);

    count.update(n => n + 10);
    expect(count()).toBe(15);
  });

  test('should support asReadonly', () => {
    const count = signal(42);
    const ro = count.asReadonly();
    expect(ro()).toBe(42);

    count.set(100);
    expect(ro()).toBe(100);
  });

  test('should compute derived values lazily', () => {
    const price = signal(100);
    const multiplier = signal(2);
    let computeCount = 0;

    const total = computed(() => {
      computeCount++;
      return price() * multiplier();
    });

    expect(computeCount).toBe(0); // Lazy: hasn't computed yet
    expect(total()).toBe(200);
    expect(computeCount).toBe(1);

    // Reading again without changes should return cached value
    expect(total()).toBe(200);
    expect(computeCount).toBe(1);

    price.set(150);
    // Still dirty until read
    expect(computeCount).toBe(1);
    expect(total()).toBe(300);
    expect(computeCount).toBe(2);
  });

  test('should handle dynamic conditional dependencies', () => {
    const cond = signal(true);
    const a = signal('A');
    const b = signal('B');

    let evalCount = 0;
    const result = computed(() => {
      evalCount++;
      return cond() ? a() : b();
    });

    expect(result()).toBe('A');
    expect(evalCount).toBe(1);

    // Changing b() should NOT invalidate result while cond is true
    b.set('B-updated');
    expect(result()).toBe('A');
    expect(evalCount).toBe(1);

    // Switch condition to false
    cond.set(false);
    expect(result()).toBe('B-updated');
    expect(evalCount).toBe(2);

    // Now changing a() should NOT invalidate result
    a.set('A-updated');
    expect(result()).toBe('B-updated');
    expect(evalCount).toBe(2);
  });

  test('should run effect and track signal dependencies', () => {
    const count = signal(1);
    const log: number[] = [];

    const destroy = effect(() => {
      log.push(count());
    });

    expect(log).toEqual([1]);

    count.set(2);
    expect(log).toEqual([1, 2]);

    count.set(3);
    expect(log).toEqual([1, 2, 3]);

    destroy();
    count.set(4);
    expect(log).toEqual([1, 2, 3]); // Should not run after destroyed
  });

  test('should call onCleanup before next effect run and on destroy', () => {
    const count = signal(1);
    const cleanups: number[] = [];
    const runs: number[] = [];

    const destroy = effect(onCleanup => {
      const val = count();
      runs.push(val);
      onCleanup(() => {
        cleanups.push(val);
      });
    });

    expect(runs).toEqual([1]);
    expect(cleanups).toEqual([]);

    count.set(2);
    expect(runs).toEqual([1, 2]);
    expect(cleanups).toEqual([1]);

    destroy();
    expect(cleanups).toEqual([1, 2]);
  });

  test('should batch multiple signal changes to run effect once', () => {
    const first = signal('John');
    const last = signal('Doe');
    const fullNameLog: string[] = [];

    effect(() => {
      fullNameLog.push(`${first()} ${last()}`);
    });

    expect(fullNameLog).toEqual(['John Doe']);

    batch(() => {
      first.set('Jane');
      last.set('Smith');
    });

    // Should only trigger once with the final batched values
    expect(fullNameLog).toEqual(['John Doe', 'Jane Smith']);
  });

  test('should not track dependencies inside untrack()', () => {
    const tracked = signal(10);
    const untracked = signal(20);
    const runs: number[] = [];

    effect(() => {
      const t = tracked();
      const u = untrack(() => untracked());
      runs.push(t + u);
    });

    expect(runs).toEqual([30]);

    // Updating untracked should NOT trigger effect
    untracked.set(100);
    expect(runs).toEqual([30]);

    // Updating tracked should trigger effect and read latest untracked
    tracked.set(20);
    expect(runs).toEqual([30, 120]);
  });

  test('should support concise setter shorthand: count(newVal)', () => {
    const count = signal(0);
    expect(count()).toBe(0);

    const ret = count(42);
    expect(ret).toBe(42);
    expect(count()).toBe(42);

    const name = signal<string | undefined>(undefined);
    expect(name()).toBeUndefined();
    name('angora');
    expect(name()).toBe('angora');
    name(undefined);
    expect(name()).toBeUndefined();
  });

  test('should support concise inc and dec helpers', () => {
    const count = signal(10);

    count.inc();
    expect(count()).toBe(11);

    count.inc(5);
    expect(count()).toBe(16);

    count.dec();
    expect(count()).toBe(15);

    count.dec(10);
    expect(count()).toBe(5);
  });

  test('should support concise toggle helper for booleans', () => {
    const isOpen = signal(false);
    expect(isOpen()).toBe(false);

    isOpen.toggle();
    expect(isOpen()).toBe(true);

    isOpen.toggle();
    expect(isOpen()).toBe(false);
  });

  test('should support component() and defineComponent() functional factories', () => {
    const { component, defineComponent, getComponentDef } = require('../src/index.ts');

    const Counter = component({
      selector: 'func-counter',
      template: '<button>{{ count() }}</button>',
      setup() {
        const count = signal(42);
        return { count };
      },
    });

    const def = getComponentDef(Counter);
    expect(def?.selector).toBe('func-counter');
    expect(def?.metadata?.template).toBe('<button>{{ count() }}</button>');

    const instance = new (Counter as any)();
    expect(instance.count()).toBe(42);
    instance.count.inc();
    expect(instance.count()).toBe(43);

    expect(defineComponent).toBe(component);
  });

  test('should detect infinite effect loop and throw NG0103 error', () => {
    const count = signal(0);
    expect(() => {
      effect(() => {
        // Accidental recursive mutation without untrack()
        count.set(count() + 1);
      });
    }).toThrow(/NG0103: Infinite effect loop detected/);
  });

  test('should support debug name option in signal and computed for devtools', () => {
    const cartCount = signal(5, { name: 'cartCount' });
    const doubleCart = computed(() => cartCount() * 2, { name: 'doubleCart' });

    expect((cartCount as any).debugName).toBe('cartCount');
    expect((cartCount.asReadonly() as any).debugName).toBe('cartCount');
    expect((doubleCart as any).debugName).toBe('doubleCart');
  });

  test('should automatically generate debug names for signals and computeds in dev mode', () => {
    resetDevMode();
    const sig1 = signal('first');
    const sig2 = signal('second');
    const comp1 = computed(() => sig1() + sig2());

    expect((sig1 as any).debugName).toMatch(/^signal#\d+$/);
    expect((sig2 as any).debugName).toMatch(/^signal#\d+$/);
    expect((comp1 as any).debugName).toMatch(/^computed#\d+$/);
  });
});
