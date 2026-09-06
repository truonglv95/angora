import { describe, test, expect, beforeEach } from 'bun:test';
import { Window } from 'happy-dom';
import { Component, signal, computed } from '@angora-js/core';
import { TestBed, renderComponent, signalSpy, userEvent, getDevTools } from '../src/index.ts';

describe('@angora-js/testing - Signal Spies & Harness', () => {
  test('should track signal updates with signalSpy', () => {
    const count = signal(0);
    const spy = signalSpy(count);

    expect(spy.count).toBe(1);
    expect(spy.values).toEqual([0]);
    expect(spy.lastValue).toBe(0);

    count.set(5);
    count.set(10);

    expect(spy.count).toBe(3);
    expect(spy.values).toEqual([0, 5, 10]);
    expect(spy.lastValue).toBe(10);

    spy.reset();
    expect(spy.count).toBe(0);

    count.set(20);
    expect(spy.values).toEqual([20]);

    spy.destroy();
    count.set(30);
    expect(spy.values).toEqual([20]); // stopped tracking
  });
});

describe('@angora-js/testing - TestBed & Component Fixtures', () => {
  let window: Window;
  let document: Document;

  beforeEach(() => {
    window = new Window();
    document = window.document as unknown as Document;
    (globalThis as any).document = document;
    (globalThis as any).window = window;
    (globalThis as any).Event = window.Event;
  });

  test('should mount component using renderComponent and interact via userEvent', () => {
    @Component({
      selector: 'counter-component',
      template: `
        <div>
          <span id="counter-val">{{ count() }}</span>
          <button id="inc-btn" (click)="increment()">Increment</button>
        </div>
      `,
    })
    class CounterComponent {
      count = signal(0);
      increment() {
        this.count.update(c => c + 1);
      }
    }

    const fixture = renderComponent(CounterComponent);

    expect(fixture.componentInstance).toBeInstanceOf(CounterComponent);
    expect(fixture.nativeElement).toBeDefined();

    const span = fixture.debugElement.query('#counter-val');
    expect(span?.textContent).toBe('0');

    const button = fixture.debugElement.query('#inc-btn');
    expect(button).not.toBeNull();

    // Trigger click via userEvent
    userEvent.click(button!);
    expect(fixture.componentInstance.count()).toBe(1);
    expect(span?.textContent).toBe('1');

    userEvent.click(button!);
    expect(fixture.componentInstance.count()).toBe(2);
    expect(span?.textContent).toBe('2');

    fixture.destroy();
  });

  test('should simulate input typing via userEvent.type', () => {
    const input = document.createElement('input') as HTMLInputElement;
    document.body.appendChild(input);

    let typed = '';
    input.addEventListener('input', () => {
      typed = input.value;
    });

    userEvent.type(input, 'Angora Framework');
    expect(input.value).toBe('Angora Framework');
    expect(typed).toBe('Angora Framework');

    userEvent.clear(input);
    expect(input.value).toBe('');
    expect(typed).toBe('');
  });

  test('should record events on DevTools hook', () => {
    const devtools = getDevTools();
    expect(devtools).not.toBeNull();
    expect(devtools?.version).toBe('0.1.0');

    devtools?.emit('test:event', { foo: 'bar' });
    const last = devtools?.events[devtools.events.length - 1];
    expect(last?.type).toBe('test:event');
    expect(last?.data.foo).toBe('bar');
  });
});
