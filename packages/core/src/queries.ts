import { signal, type Signal } from './signals.ts';

export const IS_VIEW_QUERY = Symbol('__ANGORA_VIEW_QUERY__');

export interface ViewQuerySignal<T> extends Signal<T> {
  [IS_VIEW_QUERY]: true;
  __selector: string;
  __set(value: T): void;
}

export interface ViewChildFunction {
  <T = Element>(selector: string): ViewQuerySignal<T | undefined>;
  required<T = Element>(selector: string): ViewQuerySignal<T>;
}

/**
 * Signal-based query primitive to access a template element or component reference (#ref)
 * @example
 * export class MyComponent {
 *   inputEl = viewChild<HTMLInputElement>('myInput');
 *   focus() { this.inputEl()?.focus(); }
 * }
 */
export const viewChild: ViewChildFunction = (<T = Element>(
  selector: string
): ViewQuerySignal<T | undefined> => {
  const internal = signal<T | undefined>(undefined);
  const qSig = (() => internal()) as ViewQuerySignal<T | undefined>;
  qSig[IS_VIEW_QUERY] = true;
  qSig.__selector = selector;
  qSig.__set = (val: T | undefined) => internal.set(val);
  return qSig;
}) as ViewChildFunction;

viewChild.required = <T = Element>(selector: string): ViewQuerySignal<T> => {
  const internal = signal<T>(undefined as unknown as T);
  const qSig = (() => internal()) as ViewQuerySignal<T>;
  qSig[IS_VIEW_QUERY] = true;
  qSig.__selector = selector;
  qSig.__set = (val: T) => internal.set(val);
  return qSig;
};
