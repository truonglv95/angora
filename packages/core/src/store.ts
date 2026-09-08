import { signal, untrack, type Signal, type WritableSignal } from './signals.ts';

const PROXY_TARGET = Symbol('__ANGORA_STORE_TARGET__');
const STORE_SIGNALS = Symbol('__ANGORA_STORE_SIGNALS__');

/**
 * Creates a fine-grained, deeply reactive store.
 * Reading nested properties registers fine-grained signal subscriptions on exact paths.
 * Mutating a nested property notifies ONLY listeners observing that specific property.
 *
 * @example
 * const state = signalStore({
 *   user: { name: 'Alice', age: 25 },
 *   todos: [{ id: 1, text: 'Build framework', done: false }]
 * });
 *
 * effect(() => {
 *   console.log('User name:', state.user.name);
 * });
 *
 * state.user.name = 'Bob'; // Triggers effect!
 * state.user.age = 26;     // Does NOT trigger effect!
 */
export function signalStore<T extends object>(initialValue: T): T {
  const signalMap = new Map<string, ReturnType<typeof signal>>();

  function getSignalForPath(path: string, initialVal: any) {
    let sig = signalMap.get(path);
    if (!sig) {
      sig = signal(initialVal);
      signalMap.set(path, sig);
    }
    return sig;
  }

  function wrap<O extends object>(obj: O, currentPath: string): O {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if ((obj as any)[PROXY_TARGET]) {
      return obj; // already proxied
    }

    return new Proxy(obj, {
      get(target: any, prop: string | symbol, receiver: any) {
        if (prop === PROXY_TARGET) return target;
        if (typeof prop === 'symbol') return Reflect.get(target, prop, receiver);

        const fullPath = currentPath ? `${currentPath}.${prop}` : prop;
        const val = target[prop];

        // Track dependency on this specific path
        const sig = getSignalForPath(fullPath, val);
        sig(); // subscribe

        if (val !== null && typeof val === 'object') {
          return wrap(val, fullPath);
        }
        return val;
      },

      set(target: any, prop: string | symbol, value: any, receiver: any) {
        if (typeof prop === 'symbol') return Reflect.set(target, prop, value, receiver);

        const fullPath = currentPath ? `${currentPath}.${prop}` : prop;
        const prev = target[prop];

        if (!Object.is(prev, value)) {
          target[prop] = value;
          const sig = getSignalForPath(fullPath, prev);
          sig.set(value);
        }

        return true;
      },
    });
  }

  return wrap(initialValue, '');
}

export const createStore = signalStore;
export const reactive = signalStore;

/**
 * Converts a single property of a reactive object into a WritableSignal
 * @example
 * const state = reactive({ count: 0 });
 * const countRef = toRef(state, 'count');
 * countRef.inc(); // Updates state.count to 1
 */
export function toRef<T extends object, K extends keyof T>(
  object: T,
  key: K
): WritableSignal<T[K]> {
  const getter = ((...args: [T[K]?]) => {
    if (args.length > 0) {
      object[key] = args[0] as T[K];
      return args[0] as T[K];
    }
    return object[key];
  }) as unknown as WritableSignal<T[K]>;

  getter.set = (val: T[K]) => {
    object[key] = val;
  };
  getter.update = (updater: (prev: T[K]) => T[K]) => {
    object[key] = updater(object[key]);
  };
  (getter as any).inc = (delta = 1) => {
    (object as any)[key] = ((object as any)[key] as number) + delta;
  };
  (getter as any).dec = (delta = 1) => {
    (object as any)[key] = ((object as any)[key] as number) - delta;
  };
  (getter as any).toggle = () => {
    (object as any)[key] = !((object as any)[key] as boolean);
  };
  getter.asReadonly = () => (() => object[key]) as Signal<T[K]>;

  return getter;
}

/**
 * Converts all properties of a reactive object into an object of WritableSignals.
 * Allows safe destructuring of reactive state!
 * @example
 * const state = reactive({ count: 0, title: 'Angora' });
 * const { count, title } = toRefs(state);
 * count.inc(); // Updates state.count to 1!
 */
export function toRefs<T extends object>(object: T): { [K in keyof T]: WritableSignal<T[K]> } {
  const result = {} as { [K in keyof T]: WritableSignal<T[K]> };
  for (const key of Object.keys(object) as (keyof T)[]) {
    result[key] = toRef(object, key);
  }
  return result;
}
