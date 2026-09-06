import { describe, test, expect } from 'bun:test';
import {
  input,
  output,
  IS_INPUT_SIGNAL,
  IS_OUTPUT_EMITTER,
  DefaultDestroyRef,
  runWithDestroyRef,
  onDestroy,
} from '../src/index.ts';

describe('@angora-js/core - Input & Output Primitives', () => {
  test('should create optional input signal with default or undefined', () => {
    const age = input(20);
    expect(age[IS_INPUT_SIGNAL]).toBe(true);
    expect(age()).toBe(20);

    age.__set(25);
    expect(age()).toBe(25);
  });

  test('should create required input signal', () => {
    const name = input.required<string>();
    expect(name[IS_INPUT_SIGNAL]).toBe(true);
    expect(name.__required).toBe(true);

    name.__set('Angora');
    expect(name()).toBe('Angora');
  });

  test('should emit and subscribe to output events', () => {
    const deleted = output<number>();
    expect(deleted[IS_OUTPUT_EMITTER]).toBe(true);

    const received: number[] = [];
    const unsubscribe = deleted.subscribe(id => {
      received.push(id);
    });

    deleted.emit(101);
    deleted.emit(102);

    expect(received).toEqual([101, 102]);

    unsubscribe();
    deleted.emit(103);
    expect(received).toEqual([101, 102]); // No more notifications after unsubscribe
  });

  test('should handle DestroyRef and run cleanups', () => {
    const destroyRef = new DefaultDestroyRef();
    let cleanedUp = false;

    runWithDestroyRef(destroyRef, () => {
      onDestroy(() => {
        cleanedUp = true;
      });
    });

    expect(cleanedUp).toBe(false);
    destroyRef.destroy();
    expect(cleanedUp).toBe(true);
  });

  test('should support input with options: alias and transform', () => {
    const active = input(false, {
      alias: 'isActive',
      transform: (v: any) => Boolean(v),
    });
    expect(active.__alias).toBe('isActive');
    expect(active()).toBe(false);

    active.__set('truthy_string' as any);
    expect(active()).toBe(true);
  });

  test('should support input.required with options: alias', () => {
    const tooltip = input.required<string>({ alias: 'angoraTooltip' });
    expect(tooltip.__alias).toBe('angoraTooltip');
    expect(tooltip.__required).toBe(true);

    tooltip.__set('Hover help text');
    expect(tooltip()).toBe('Hover help text');
  });
});
