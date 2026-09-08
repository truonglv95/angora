import { describe, test, expect, beforeEach } from 'bun:test';
import { Window } from 'happy-dom';
import '@angora-js/compiler';
import { Component, signal, model, input, viewChild, rootInjector } from '@angora-js/core';
import { FormControl, FormGroup } from '@angora-js/forms';
import {
  mountComponent,
  createElement,
  createText,
  bindText,
  bindEvent,
  applyHMRUpdate,
  hmrRegistry,
  extractSignalState,
  restoreSignalState,
  clearInjectedStyles,
} from '../src/index.ts';

describe('@angora-js/runtime - Fine-Grained HMR Engine', () => {
  let doc: Document;

  beforeEach(() => {
    const window = new Window();
    (global as any).document = window.document;
    (global as any).window = window;
    doc = window.document as any;
    hmrRegistry.clear();
    clearInjectedStyles();
  });

  test('should hot swap template and preserve fine-grained signal state', () => {
    const sourceId = '/src/components/counter.ts';

    // 1. Initial Component Definition
    @Component({
      selector: 'app-counter',
      template: '',
    })
    class CounterV1 {
      static __sourceFile = sourceId;
      count = signal(0);
    }
    // Simulate compiled render function V1: <div>Count: {{ count() }}</div>
    (CounterV1 as any).ɵrender = (ctx: CounterV1) => {
      const div = doc.createElement('div');
      div.className = 'v1-box';
      const label = doc.createTextNode('Count: ');
      const val = doc.createTextNode('');
      bindText(val, () => ctx.count());
      div.appendChild(label);
      div.appendChild(val);
      return [div];
    };

    const host = doc.createElement('div');
    doc.body.appendChild(host);

    const ref = mountComponent(CounterV1, host, null, rootInjector);
    expect(ref).not.toBeNull();
    expect(host.innerHTML).toContain('Count: 0');
    expect(host.querySelector('.v1-box')).not.toBeNull();

    // Mutate state in running app
    ref!.instance.count.set(42);
    expect(host.innerHTML).toContain('Count: 42');

    // 2. Component V2 with edited template: <h1>Active Counter: {{ count() }}</h1>
    @Component({
      selector: 'app-counter',
      template: '',
    })
    class CounterV2 {
      static __sourceFile = sourceId;
      count = signal(0);
    }
    (CounterV2 as any).ɵrender = (ctx: CounterV2) => {
      const h1 = doc.createElement('h1');
      h1.className = 'v2-heading';
      const label = doc.createTextNode('Active Counter: ');
      const val = doc.createTextNode('');
      bindText(val, () => ctx.count());
      h1.appendChild(label);
      h1.appendChild(val);
      return [h1];
    };

    // 3. Trigger Fine-Grained HMR
    const result = applyHMRUpdate(sourceId, CounterV2);
    expect(result.updated).toBe(1);
    expect(result.preservedSignals).toBeGreaterThanOrEqual(1);

    // Verify DOM instantly replaced with V2 template
    expect(host.querySelector('.v1-box')).toBeNull();
    const h1 = host.querySelector('.v2-heading');
    expect(h1).not.toBeNull();
    expect(host.innerHTML).toContain('Active Counter: 42');

    // Verify signal reactivity is retained
    ref!.instance.count.set(43);
    expect(host.innerHTML).toContain('Active Counter: 43');
  });

  test('should hot swap scoped CSS immediately in document head', () => {
    const sourceId = '/src/components/styled-box.ts';
    const scopeId = '_angora-app-box';

    @Component({
      selector: 'app-box',
      template: '',
      styles: [`.box[${scopeId}] { color: red; }`],
    })
    class BoxV1 {
      static __sourceFile = sourceId;
      title = signal('Box Title');
    }
    (BoxV1 as any).ɵrender = (ctx: BoxV1) => {
      const div = doc.createElement('div');
      div.setAttribute(scopeId, '');
      const t = doc.createTextNode('');
      bindText(t, () => ctx.title());
      div.appendChild(t);
      return [div];
    };

    const host = doc.createElement('div');
    doc.body.appendChild(host);

    const ref = mountComponent(BoxV1, host, null, rootInjector);
    expect(ref).not.toBeNull();

    // Verify initial style tag in head
    const styleTag1 = doc.head.querySelector(`style#angora-style-${scopeId}`);
    expect(styleTag1).not.toBeNull();
    expect(styleTag1!.textContent).toContain('color: red;');

    // User updates state
    ref!.instance.title.set('Custom Box Title');

    // Box V2 with updated CSS: color: blue; font-size: 20px;
    @Component({
      selector: 'app-box',
      template: '',
      styles: [`.box[${scopeId}] { color: blue; font-size: 20px; }`],
    })
    class BoxV2 {
      static __sourceFile = sourceId;
      title = signal('Box Title');
    }
    (BoxV2 as any).ɵrender = (BoxV1 as any).ɵrender;

    applyHMRUpdate(sourceId, BoxV2);

    // Verify style tag content was updated immediately in head
    const styleTag2 = doc.head.querySelector(`style#angora-style-${scopeId}`);
    expect(styleTag2).not.toBeNull();
    expect(styleTag2!.textContent).toContain('color: blue;');
    expect(styleTag2!.textContent).toContain('font-size: 20px;');

    // Verify signal state was preserved
    expect(host.innerHTML).toContain('Custom Box Title');
  });

  test('should preserve reactive form state across HMR updates', () => {
    const sourceId = '/src/components/profile-form.ts';

    @Component({
      selector: 'app-profile-form',
      template: '',
    })
    class ProfileFormV1 {
      static __sourceFile = sourceId;
      form = new FormGroup({
        username: new FormControl('alice'),
        email: new FormControl('alice@example.com'),
      });
    }
    (ProfileFormV1 as any).ɵrender = (ctx: ProfileFormV1) => {
      const div = doc.createElement('div');
      div.textContent = `User: ${ctx.form.controls.username.value()}`;
      return [div];
    };

    const host = doc.createElement('div');
    doc.body.appendChild(host);

    const ref = mountComponent(ProfileFormV1, host, null, rootInjector);
    expect(ref).not.toBeNull();

    // User edits form
    ref!.instance.form.controls.username.setValue('bob');
    ref!.instance.form.controls.email.setValue('bob@company.com');

    // Trigger HMR
    @Component({
      selector: 'app-profile-form',
      template: '',
    })
    class ProfileFormV2 {
      static __sourceFile = sourceId;
      form = new FormGroup({
        username: new FormControl('alice'),
        email: new FormControl('alice@example.com'),
      });
    }
    (ProfileFormV2 as any).ɵrender = (ctx: ProfileFormV2) => {
      const div = doc.createElement('div');
      div.className = 'v2';
      div.textContent = `Username: ${ctx.form.controls.username.value()} (${ctx.form.controls.email.value()})`;
      return [div];
    };

    applyHMRUpdate(sourceId, ProfileFormV2);

    expect(ref!.instance.form.controls.username.value()).toBe('bob');
    expect(ref!.instance.form.controls.email.value()).toBe('bob@company.com');
    expect(host.innerHTML).toContain('Username: bob (bob@company.com)');
  });

  test('should update prototype methods and inject newly added signals', () => {
    const sourceId = '/src/components/calc.ts';

    @Component({
      selector: 'app-calc',
      template: '',
    })
    class CalcV1 {
      static __sourceFile = sourceId;
      total = signal(10);

      calculate() {
        this.total.set(this.total() + 1);
      }
    }
    (CalcV1 as any).ɵrender = (ctx: CalcV1) => {
      const div = doc.createElement('div');
      const val = doc.createTextNode('');
      bindText(val, () => ctx.total());
      div.appendChild(val);
      return [div];
    };

    const host = doc.createElement('div');
    doc.body.appendChild(host);

    const ref = mountComponent(CalcV1, host, null, rootInjector);
    ref!.instance.calculate();
    expect(ref!.instance.total()).toBe(11);

    // V2: Developer updates calculate() to add 5, adds multiply(), and adds multiplier signal
    @Component({
      selector: 'app-calc',
      template: '',
    })
    class CalcV2 {
      static __sourceFile = sourceId;
      total = signal(10);
      multiplier = signal(3);

      calculate() {
        this.total.set(this.total() + 5);
      }

      multiply() {
        this.total.set(this.total() * (this as any).multiplier());
      }
    }
    (CalcV2 as any).ɵrender = (CalcV1 as any).ɵrender;

    applyHMRUpdate(sourceId, CalcV2);

    // Total must be preserved at 11
    expect(ref!.instance.total()).toBe(11);

    // Newly added signal must be present
    expect((ref!.instance as any).multiplier).toBeDefined();
    expect((ref!.instance as any).multiplier()).toBe(3);

    // Modified calculate() method runs new code (+5)
    ref!.instance.calculate();
    expect(ref!.instance.total()).toBe(16);

    // Newly added method multiply() works (*3)
    (ref!.instance as any).multiply();
    expect(ref!.instance.total()).toBe(48);
  });

  test('should hot swap multiple mounted instances independently', () => {
    const sourceId = '/src/components/badge.ts';

    @Component({
      selector: 'app-badge',
      template: '',
    })
    class BadgeV1 {
      static __sourceFile = sourceId;
      val = signal(0);
    }
    (BadgeV1 as any).ɵrender = (ctx: BadgeV1) => {
      const span = doc.createElement('span');
      span.className = 'badge-v1';
      const text = doc.createTextNode('');
      bindText(text, () => ctx.val());
      span.appendChild(text);
      return [span];
    };

    const host1 = doc.createElement('div');
    const host2 = doc.createElement('div');
    doc.body.appendChild(host1);
    doc.body.appendChild(host2);

    const ref1 = mountComponent(BadgeV1, host1, null, rootInjector);
    const ref2 = mountComponent(BadgeV1, host2, null, rootInjector);

    ref1!.instance.val.set(100);
    ref2!.instance.val.set(200);

    @Component({
      selector: 'app-badge',
      template: '',
    })
    class BadgeV2 {
      static __sourceFile = sourceId;
      val = signal(0);
    }
    (BadgeV2 as any).ɵrender = (ctx: BadgeV2) => {
      const span = doc.createElement('span');
      span.className = 'badge-v2';
      const text = doc.createTextNode('');
      bindText(text, () => `Badge: ${ctx.val()}`);
      span.appendChild(text);
      return [span];
    };

    const res = applyHMRUpdate(sourceId, BadgeV2);
    expect(res.updated).toBe(2);

    expect(host1.innerHTML).toContain('Badge: 100');
    expect(host2.innerHTML).toContain('Badge: 200');
    expect(host1.querySelector('.badge-v2')).not.toBeNull();
    expect(host2.querySelector('.badge-v2')).not.toBeNull();
  });

  test('should re-resolve viewChild queries on hot template swap', () => {
    const sourceId = '/src/components/search.ts';

    @Component({
      selector: 'app-search',
      template: '',
    })
    class SearchV1 {
      static __sourceFile = sourceId;
      inputEl = viewChild<HTMLInputElement>('searchInput');
    }
    (SearchV1 as any).ɵrender = () => {
      const input = doc.createElement('input');
      input.id = 'searchInput';
      input.placeholder = 'Initial';
      return [input];
    };

    const host = doc.createElement('div');
    doc.body.appendChild(host);

    const ref = mountComponent(SearchV1, host, null, rootInjector);
    expect(ref!.instance.inputEl()).not.toBeNull();
    expect((ref!.instance.inputEl() as any).placeholder).toBe('Initial');

    @Component({
      selector: 'app-search',
      template: '',
    })
    class SearchV2 {
      static __sourceFile = sourceId;
      inputEl = viewChild<HTMLInputElement>('searchInput');
    }
    (SearchV2 as any).ɵrender = () => {
      const input = doc.createElement('input');
      input.id = 'searchInput';
      input.placeholder = 'Hot Reloaded Search';
      return [input];
    };

    applyHMRUpdate(sourceId, SearchV2);

    expect(ref!.instance.inputEl()).not.toBeNull();
    expect((ref!.instance.inputEl() as any).placeholder).toBe('Hot Reloaded Search');
  });

  test('should correctly extract and restore signal and form snapshots', () => {
    const count = signal(99);
    const form = new FormGroup({
      name: new FormControl('Bob'),
    });

    const instance = {
      count,
      form,
      staticField: 'unchanged',
    };

    const snapshot = extractSignalState(instance);
    expect(snapshot.signals.count).toBe(99);
    expect(snapshot.forms.form.name).toBe('Bob');

    // Simulate reset or probe
    count.set(0);
    form.patchValue({ name: 'Default' });
    expect(count()).toBe(0);
    expect(form.value().name).toBe('Default');

    // Restore
    restoreSignalState(instance, snapshot);
    expect(count()).toBe(99);
    expect(form.value().name).toBe('Bob');
  });
});
