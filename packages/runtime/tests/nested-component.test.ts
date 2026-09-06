import { describe, test, expect, beforeEach } from 'bun:test';
import { Window } from 'happy-dom';
import '@angora-js/compiler';
import {
  Component,
  signal,
  input,
  output,
  Injector,
  rootInjector,
  onDestroy,
  InjectionToken,
} from '@angora-js/core';
import { mountComponent, createElement, createText, bindText, bindEvent } from '../src/index.ts';

describe('@angora-js/runtime - Nested Components & Inputs/Outputs', () => {
  let doc: Document;

  beforeEach(() => {
    const window = new Window();
    (global as any).document = window.document;
    (global as any).window = window;
    doc = window.document as any;
  });

  test('should mount child component, bind input signal and recompute on change', () => {
    // 1. Child Component
    @Component({
      selector: 'child-badge',
      template: `<span>{{ label() }}: {{ count() }}</span>`,
    })
    class ChildBadgeComponent {
      label = input<string>('Default');
      count = input.required<number>();
    }

    // 2. Parent Component Context
    const parentCount = signal(5);
    @Component({
      selector: 'parent-comp',
      template: '',
      imports: [ChildBadgeComponent],
    })
    class ParentComponent {
      parentCount = parentCount;
    }
    const parentCtx = new ParentComponent();

    const host = doc.createElement('child-badge') as HTMLElement;
    doc.body.appendChild(host);

    const ref = mountComponent('child-badge', host, parentCtx, rootInjector, {
      inputs: {
        label: () => 'Score',
        count: () => parentCount(),
      },
    });

    expect(ref).not.toBeNull();
    expect(host.innerHTML).toContain('Score: 5');

    // Update parent signal
    parentCount.set(42);
    expect(host.innerHTML).toContain('Score: 42');

    // Cleanup
    ref?.destroy();
    expect(host.innerHTML).toBe('');
  });

  test('should emit output events from child component to parent handler', () => {
    @Component({
      selector: 'child-button',
      template: `<button (click)="clicked.emit('payload-123')">Click</button>`,
    })
    class ChildButtonComponent {
      clicked = output<string>();
    }

    @Component({
      selector: 'parent-comp',
      template: '',
      imports: [ChildButtonComponent],
    })
    class ParentComponent {}
    const parentCtx = new ParentComponent();

    const host = doc.createElement('child-button') as HTMLElement;
    doc.body.appendChild(host);

    let receivedPayload = '';
    const ref = mountComponent('child-button', host, parentCtx, rootInjector, {
      outputs: {
        clicked: (val: string) => {
          receivedPayload = val;
        },
      },
    });

    // Simulate clicking child component's internal button
    const btn = host.querySelector('button')!;
    btn.dispatchEvent(new (window as any).Event('click'));

    expect(receivedPayload).toBe('payload-123');
    ref?.destroy();
  });

  test('should support content projection into child slot', () => {
    @Component({
      selector: 'app-card',
      template: `<div class="card-body"><ng-content></ng-content></div>`,
    })
    class CardComponent {}

    @Component({
      selector: 'parent-comp',
      template: '',
      imports: [CardComponent],
    })
    class ParentComponent {}
    const parentCtx = new ParentComponent();

    const host = doc.createElement('app-card') as HTMLElement;
    doc.body.appendChild(host);

    const ref = mountComponent('app-card', host, parentCtx, rootInjector, {
      projectedNodes: () => {
        const p = doc.createElement('p');
        p.textContent = 'Projected Card Content';
        return [p];
      },
    });

    expect(host.innerHTML).toContain('Projected Card Content');
    ref?.destroy();
  });

  test('should trigger onDestroy lifecycle when component is destroyed', () => {
    let destroyed = false;

    @Component({
      selector: 'lifecycle-comp',
      template: ``,
    })
    class LifecycleComponent {
      angoraOnDestroy() {
        destroyed = true;
      }
    }

    const host = doc.createElement('lifecycle-comp') as HTMLElement;
    const ref = mountComponent(LifecycleComponent, host, {}, rootInjector);

    expect(destroyed).toBe(false);
    ref?.destroy();
    expect(destroyed).toBe(true);
  });

  test('should resolve hierarchical DI providers in child component', () => {
    const THEME_TOKEN = new InjectionToken<string>('THEME');

    @Component({
      selector: 'themed-child',
      template: `<div>Theme: {{ theme }}</div>`,
    })
    class ThemedChild {
      theme: string;
      constructor() {
        this.theme = 'default';
      }
    }

    // Parent injector providing THEME_TOKEN = 'dark-mode'
    const parentInjector = new Injector([{ provide: THEME_TOKEN, useValue: 'dark-mode' }]);

    ThemedChild.prototype.constructor = function (this: any) {
      // In Angora, child injectors resolve from parent
    };

    const host = doc.createElement('themed-child') as HTMLElement;
    const ref = mountComponent(ThemedChild, host, {}, parentInjector);

    expect(ref?.injector.get(THEME_TOKEN)).toBe('dark-mode');
    ref?.destroy();
  });

  test('should bind static attributes from host element to child input signals', () => {
    @Component({
      selector: 'static-attr-child',
      template: `<div>Title: {{ title() }}, Count: {{ count() }}, Active: {{ active() }}</div>`,
    })
    class StaticAttrChildComponent {
      title = input<string>('default');
      count = input<number>(0);
      active = input<boolean>(false);
    }

    @Component({
      selector: 'parent-comp',
      template: '',
      imports: [StaticAttrChildComponent],
    })
    class ParentComponent {}
    const parentCtx = new ParentComponent();

    const host = doc.createElement('static-attr-child') as HTMLElement;
    host.setAttribute('title', 'Angora Static Title');
    host.setAttribute('count', '42');
    host.setAttribute('active', 'true');
    doc.body.appendChild(host);

    const ref = mountComponent('static-attr-child', host, parentCtx, rootInjector);
    expect(ref).not.toBeNull();
    expect(ref?.instance.title()).toBe('Angora Static Title');
    expect(ref?.instance.count()).toBe(42);
    expect(ref?.instance.active()).toBe(true);
    expect(host.innerHTML).toContain('Title: Angora Static Title, Count: 42, Active: true');

    ref?.destroy();
  });
});
