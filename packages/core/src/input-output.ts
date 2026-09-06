import { signal, type Signal } from './signals.ts';

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
