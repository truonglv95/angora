import { signal, type Signal, type WritableSignal } from './signals.ts';

export const IS_INPUT_SIGNAL = Symbol('__ANGORA_INPUT_SIGNAL__');
export const IS_OUTPUT_EMITTER = Symbol('__ANGORA_OUTPUT_EMITTER__');

export interface InputOptions<T = any, TransformValue = any> {
  alias?: string;
  transform?: (value: TransformValue) => T;
}

export interface InputSignal<T> extends Signal<T> {
  [IS_INPUT_SIGNAL]: true;
  __set(value: T): void;
  __required: boolean;
  __alias?: string;
  __transform?: (value: any) => T;
}

export interface InputFunction {
  <T>(): InputSignal<T | undefined>;
  <T>(initialValue: T, options?: InputOptions<T>): InputSignal<T>;
  required<T, TransformValue = T>(options?: InputOptions<T, TransformValue>): InputSignal<T>;
}

export const input: InputFunction = (<T>(
  initialValue?: T,
  options?: InputOptions<T>
): InputSignal<T | undefined> => {
  const transform = options?.transform;
  const initial = transform ? transform(initialValue) : initialValue;
  const internal = signal<T | undefined>(initial);
  const inputSig = (() => internal()) as InputSignal<T | undefined>;
  inputSig[IS_INPUT_SIGNAL] = true;
  inputSig.__required = false;
  inputSig.__alias = options?.alias;
  inputSig.__transform = transform;
  inputSig.__set = (val: T | undefined) => {
    const transformed = transform ? transform(val) : val;
    internal.set(transformed);
  };
  return inputSig;
}) as InputFunction;

input.required = <T, TransformValue = T>(
  options?: InputOptions<T, TransformValue>
): InputSignal<T> => {
  const transform = options?.transform;
  const internal = signal<T>(undefined as unknown as T);
  const inputSig = (() => {
    return internal();
  }) as InputSignal<T>;
  inputSig[IS_INPUT_SIGNAL] = true;
  inputSig.__required = true;
  inputSig.__alias = options?.alias;
  inputSig.__transform = transform;
  inputSig.__set = (val: any) => {
    const transformed = transform ? transform(val) : val;
    internal.set(transformed);
  };
  return inputSig;
};

export interface OutputOptions {
  alias?: string;
}

export interface OutputEmitter<T = void> {
  [IS_OUTPUT_EMITTER]: true;
  __alias?: string;
  emit(value: T): void;
  subscribe(handler: (value: T) => void): () => void;
}

export function output<T = void>(options?: OutputOptions): OutputEmitter<T> {
  const listeners = new Set<(value: T) => void>();
  return {
    [IS_OUTPUT_EMITTER]: true,
    __alias: options?.alias,
    emit(value: T) {
      for (const listener of listeners) {
        listener(value);
      }
    },
    subscribe(handler: (value: T) => void) {
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    },
  };
}

export const IS_MODEL_SIGNAL = Symbol('__ANGORA_MODEL_SIGNAL__');

export interface ModelOptions<T = any> {
  alias?: string;
}

export interface ModelSignal<T> extends WritableSignal<T> {
  [IS_MODEL_SIGNAL]: true;
  [IS_INPUT_SIGNAL]: true;
  [IS_OUTPUT_EMITTER]: true;
  __required: boolean;
  __alias?: string;
  __set(value: T): void;
  emit(value: T): void;
  subscribe(handler: (value: T) => void): () => void;
}

export interface ModelFunction {
  <T>(): ModelSignal<T | undefined>;
  <T>(initialValue: T, options?: ModelOptions<T>): ModelSignal<T>;
  required<T>(options?: ModelOptions<T>): ModelSignal<T>;
}

/**
 * Creates a two-way bindable model signal for component inputs & companion outputs
 * @example
 * // Child component:
 * count = model(0);
 * // In parent template:
 * <counter [(count)]="myCount" />
 */
export const model: ModelFunction = (<T>(
  initialValue?: T,
  options?: ModelOptions<T>
): ModelSignal<T | undefined> => {
  const internal = signal<T | undefined>(initialValue);
  const listeners = new Set<(value: T | undefined) => void>();
  let isUpdatingFromParent = false;

  const emitToListeners = (val: T | undefined) => {
    for (const listener of listeners) {
      try {
        listener(val);
      } catch (err) {
        console.error('Error in model listener:', err);
      }
    }
  };

  const modelSig = ((...args: [T?]) => {
    if (args.length > 0) {
      const val = args[0] as T;
      internal(val);
      if (!isUpdatingFromParent) {
        emitToListeners(val);
      }
      return val;
    }
    return internal();
  }) as unknown as ModelSignal<T | undefined>;

  (modelSig as any)[IS_MODEL_SIGNAL] = true;
  (modelSig as any)[IS_INPUT_SIGNAL] = true;
  (modelSig as any)[IS_OUTPUT_EMITTER] = true;
  modelSig.__required = false;
  modelSig.__alias = options?.alias;

  modelSig.__set = (val: T | undefined) => {
    isUpdatingFromParent = true;
    try {
      internal(val);
    } finally {
      isUpdatingFromParent = false;
    }
  };

  modelSig.set = (val: T | undefined) => {
    internal.set(val);
    if (!isUpdatingFromParent) {
      emitToListeners(val);
    }
  };

  modelSig.update = (updater: (prev: T | undefined) => T | undefined) => {
    const next = updater(internal());
    internal.set(next);
    if (!isUpdatingFromParent) {
      emitToListeners(next);
    }
  };

  (modelSig as any).inc = (delta = 1) => {
    (modelSig as any).update((prev: any) => prev + delta);
  };
  (modelSig as any).dec = (delta = 1) => {
    (modelSig as any).update((prev: any) => prev - delta);
  };
  (modelSig as any).toggle = () => {
    (modelSig as any).update((prev: any) => !prev);
  };

  modelSig.asReadonly = () => internal.asReadonly();

  modelSig.emit = (value: T | undefined) => {
    modelSig.set(value);
  };

  modelSig.subscribe = (handler: (value: T | undefined) => void) => {
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  };

  return modelSig;
}) as ModelFunction;

model.required = <T>(options?: ModelOptions<T>): ModelSignal<T> => {
  const m = model<T>(undefined as unknown as T, options);
  m.__required = true;
  return m as ModelSignal<T>;
};

/**
 * Coerces a data-bound value (typically a string) to a boolean.
 */
export function booleanAttribute(value: unknown): boolean {
  return typeof value === 'boolean' ? value : value != null && value !== 'false';
}

/**
 * Coerces a data-bound value (typically a string) to a number.
 */
export function numberAttribute(value: unknown, fallback = 0): number {
  const num = parseFloat(String(value));
  return isNaN(num) ? fallback : num;
}
