/**
 * @angora-js/core - Fine-grained Reactive Signals Engine
 * Glitch-free, lightweight, zero-dependency.
 */

export type CleanupFn = () => void;
export type EffectFn = (onCleanup: (cleanup: CleanupFn) => void) => void;

export interface Signal<T> {
  (): T;
}

export interface WritableSignal<T> extends Signal<T> {
  (): T;
  (value: T): T;
  set(value: T): void;
  update(updater: (prev: T) => T): void;
  inc: T extends number ? (delta?: number) => void : never;
  dec: T extends number ? (delta?: number) => void : never;
  toggle: T extends boolean ? () => void : never;
  asReadonly(): Signal<T>;
}

export type ReadonlySignal<T> = Signal<T>;

export interface Dependency {
  removeSubscriber(subscriber: Subscriber): void;
}

export interface Subscriber {
  markDirty(): void;
  addDependency(dep: Dependency): void;
}

// Current subscriber tracking context
let currentSubscriber: Subscriber | null = null;
let batchDepth = 0;
const pendingEffects = new Set<EffectNode>();

export class SignalNode<T> implements Dependency {
  private subscribers = new Set<Subscriber>();
  private value: T;
  private equal: (a: T, b: T) => boolean;

  constructor(value: T, equal: (a: T, b: T) => boolean = Object.is) {
    this.value = value;
    this.equal = equal;
  }

  get(): T {
    if (currentSubscriber) {
      this.subscribers.add(currentSubscriber);
      currentSubscriber.addDependency(this);
    }
    return this.value;
  }

  set(newValue: T): void {
    if (!this.equal(this.value, newValue)) {
      this.value = newValue;
      this.notify();
    }
  }

  update(updater: (prev: T) => T): void {
    this.set(updater(this.value));
  }

  notify(): void {
    const subs = Array.from(this.subscribers);
    for (const sub of subs) {
      sub.markDirty();
    }
  }

  removeSubscriber(subscriber: Subscriber): void {
    this.subscribers.delete(subscriber);
  }
}

export class ComputedNode<T> implements Subscriber, Dependency {
  private value!: T;
  private isDirty = true;
  private dependencies = new Set<Dependency>();
  private subscribers = new Set<Subscriber>();
  private computeFn: () => T;
  private equal: (a: T, b: T) => boolean;

  constructor(computeFn: () => T, equal: (a: T, b: T) => boolean = Object.is) {
    this.computeFn = computeFn;
    this.equal = equal;
  }

  get(): T {
    if (currentSubscriber) {
      this.subscribers.add(currentSubscriber);
      currentSubscriber.addDependency(this);
    }

    if (this.isDirty) {
      this.recompute();
    }

    return this.value;
  }

  markDirty(): void {
    if (!this.isDirty) {
      this.isDirty = true;
      for (const sub of Array.from(this.subscribers)) {
        sub.markDirty();
      }
    }
  }

  addDependency(dep: Dependency): void {
    this.dependencies.add(dep);
  }

  private recompute(): void {
    // Clear previous dependencies to allow dynamic branch pruning
    for (const dep of this.dependencies) {
      dep.removeSubscriber(this);
    }
    this.dependencies.clear();

    const prevSubscriber = currentSubscriber;
    currentSubscriber = this;
    try {
      const newValue = this.computeFn();
      if (this.isDirty && !this.equal(this.value, newValue)) {
        this.value = newValue;
      }
      this.isDirty = false;
    } finally {
      currentSubscriber = prevSubscriber;
    }
  }

  removeSubscriber(subscriber: Subscriber): void {
    this.subscribers.delete(subscriber);
  }
}

export class EffectNode implements Subscriber {
  private isDirty = false;
  private cleanupFn?: CleanupFn;
  private dependencies = new Set<Dependency>();
  private isDestroyed = false;
  private effectFn: EffectFn;
  private runCount = 0;
  private static readonly MAX_ITERATIONS = 100;

  constructor(effectFn: EffectFn) {
    this.effectFn = effectFn;
    this.run();
  }

  markDirty(): void {
    if (this.isDestroyed) return;

    if (!this.isDirty) {
      this.isDirty = true;
      if (batchDepth > 0) {
        pendingEffects.add(this);
      } else {
        this.run();
      }
    }
  }

  addDependency(dep: Dependency): void {
    this.dependencies.add(dep);
  }

  run(): void {
    if (this.isDestroyed) return;

    if (++this.runCount > EffectNode.MAX_ITERATIONS) {
      this.isDirty = false;
      this.runCount = 0;
      throw new Error(
        `[Angora] NG0103: Infinite effect loop detected (exceeded ${EffectNode.MAX_ITERATIONS} iterations).\n` +
          `An effect wrote to a signal it also subscribes to without untrack().`
      );
    }
    if (this.runCount === 1) {
      queueMicrotask(() => {
        this.runCount = 0;
      });
    }

    this.isDirty = false;

    // Run cleanup from previous execution
    if (this.cleanupFn) {
      try {
        this.cleanupFn();
      } catch (err) {
        console.error('Error during effect cleanup:', err);
      }
      this.cleanupFn = undefined;
    }

    // Clear old dependencies
    for (const dep of this.dependencies) {
      dep.removeSubscriber(this);
    }
    this.dependencies.clear();

    const prevSubscriber = currentSubscriber;
    currentSubscriber = this;

    const onCleanup = (fn: CleanupFn) => {
      this.cleanupFn = fn;
    };

    try {
      this.effectFn(onCleanup);
    } finally {
      currentSubscriber = prevSubscriber;
    }
  }

  destroy(): void {
    this.isDestroyed = true;
    if (this.cleanupFn) {
      this.cleanupFn();
      this.cleanupFn = undefined;
    }
    for (const dep of this.dependencies) {
      dep.removeSubscriber(this);
    }
    this.dependencies.clear();
    pendingEffects.delete(this);
  }
}

export const IS_SIGNAL = Symbol('IS_SIGNAL');

/**
 * Checks if a value is an Angora signal or computed
 */
export function isSignal(val: any): boolean {
  return (
    typeof val === 'function' &&
    Boolean(val[IS_SIGNAL] || typeof val.set === 'function' || typeof val.__set === 'function')
  );
}

/**
 * Creates a reactive writable signal
 * @example
 * const count = signal(0);
 * console.log(count()); // 0
 * count.set(1);
 * count.update(c => c + 1);
 */
export function signal<T>(
  initialValue: T,
  options?: { equal?: (a: T, b: T) => boolean; name?: string }
): WritableSignal<T> {
  const node = new SignalNode(initialValue, options?.equal);

  const getter = ((...args: [T?]) => {
    if (args.length > 0) {
      node.set(args[0] as T);
      return args[0] as T;
    }
    return node.get();
  }) as unknown as WritableSignal<T>;

  (getter as any)[IS_SIGNAL] = true;
  if (options?.name) {
    (getter as any).debugName = options.name;
  }
  getter.set = (val: T) => node.set(val);
  getter.update = (updater: (prev: T) => T) => node.update(updater);
  (getter as any).inc = (delta = 1) => {
    (node as any).update((prev: any) => prev + delta);
  };
  (getter as any).dec = (delta = 1) => {
    (node as any).update((prev: any) => prev - delta);
  };
  (getter as any).toggle = () => {
    (node as any).update((prev: any) => !prev);
  };
  getter.asReadonly = () => {
    const ro = (() => node.get()) as Signal<T>;
    (ro as any)[IS_SIGNAL] = true;
    if (options?.name) {
      (ro as any).debugName = options.name;
    }
    return ro;
  };

  return getter;
}

/**
 * Creates a memoized, derived reactive computation
 * @example
 * const count = signal(10);
 * const double = computed(() => count() * 2);
 * console.log(double()); // 20
 */
export function computed<T>(
  fn: () => T,
  options?: { equal?: (a: T, b: T) => boolean; name?: string }
): Signal<T> {
  const node = new ComputedNode(fn, options?.equal);
  const getter = (() => node.get()) as Signal<T>;
  (getter as any)[IS_SIGNAL] = true;
  if (options?.name) {
    (getter as any).debugName = options.name;
  }
  return getter;
}

/**
 * Creates a reactive side-effect that automatically tracks signals
 * @example
 * const count = signal(0);
 * const destroy = effect((onCleanup) => {
 *   console.log('Count is:', count());
 *   onCleanup(() => console.log('Cleanup before next run'));
 * });
 */
export function effect(fn: EffectFn): () => void {
  const node = new EffectNode(fn);
  return () => node.destroy();
}

/**
 * Executes a function without tracking any signals read inside it
 */
export function untrack<T>(fn: () => T): T {
  const prevSubscriber = currentSubscriber;
  currentSubscriber = null;
  try {
    return fn();
  } finally {
    currentSubscriber = prevSubscriber;
  }
}

/**
 * Batches multiple signal updates to prevent intermediate effect executions
 */
export function batch<T>(fn: () => T): T {
  batchDepth++;
  try {
    return fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) {
      const effectsToRun = Array.from(pendingEffects);
      pendingEffects.clear();
      for (const eff of effectsToRun) {
        eff.run();
      }
    }
  }
}
