import type { Provider, Signal } from '@angora-js/core';

export interface TestModuleConfig {
  providers?: Provider[];
  imports?: any[];
}

export interface DebugElement {
  nativeElement: HTMLElement;
  query(selector: string): HTMLElement | null;
  queryAll(selector: string): HTMLElement[];
  triggerEventHandler(eventName: string, eventObj?: any): void;
}

export interface ComponentFixture<T> {
  componentInstance: T;
  nativeElement: HTMLElement;
  debugElement: DebugElement;
  detectChanges(): void;
  destroy(): void;
}

export interface SignalSpy<T> {
  readonly values: T[];
  readonly count: number;
  readonly lastValue: T;
  reset(): void;
  destroy(): void;
}
