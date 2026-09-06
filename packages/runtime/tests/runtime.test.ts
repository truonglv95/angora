import { describe, test, expect, beforeEach } from 'bun:test';
import { Window } from 'happy-dom';
import '@angora-js/compiler';
import { signal, Component } from '@angora-js/core';
import {
  createElement,
  createText,
  createComment,
  bindText,
  bindProp,
  bindClass,
  bindStyle,
  bindTwoWay,
  bindEvent,
  createIf,
  createFor,
  createSwitch,
  bootstrapApplication,
  template,
} from '../src/index.ts';

describe('@angora-js/runtime - Fine-grained DOM Operations', () => {
  beforeEach(() => {
    const window = new Window();
    (globalThis as any).document = window.document;
    (globalThis as any).HTMLElement = window.HTMLElement;
    (globalThis as any).Text = window.Text;
    (globalThis as any).Comment = window.Comment;
    (globalThis as any).Event = window.Event;
  });

  test('should bind signal directly to text node', () => {
    const count = signal(0);
    const textNode = createText();
    bindText(textNode, () => count());

    expect(textNode.textContent).toBe('0');

    count.set(42);
    expect(textNode.textContent).toBe('42');
  });

  test('should clone static DOM using template and bind to comment anchors', () => {
    const count = signal(10);
    const tmpl = template<HTMLDivElement>(
      '<div class="box"><span class="label">Count: </span><!--t--></div>'
    );

    const root = tmpl();
    expect(root.className).toBe('box');
    expect(root.childNodes.length).toBe(2);

    const label = root.childNodes[0] as HTMLElement;
    expect(label.textContent).toBe('Count: ');

    const comment = root.childNodes[1];
    bindText(comment, () => count());

    expect(root.textContent).toBe('Count: 10');

    count.set(99);
    expect(root.textContent).toBe('Count: 99');
  });

  test('should bind property and event directly to element', () => {
    const btn = createElement('button');
    const disabled = signal(false);
    let clickCount = 0;

    bindProp(btn, 'disabled', () => disabled());
    bindEvent(btn, 'click', () => {
      clickCount++;
    });

    expect(btn.disabled).toBe(false);

    btn.click();
    expect(clickCount).toBe(1);

    disabled.set(true);
    expect(btn.disabled).toBe(true);
  });

  test('should handle @if block dynamically with comment anchor', () => {
    const container = createElement('div');
    const anchor = createComment('angora:if');
    container.appendChild(anchor);

    const isVisible = signal(false);

    createIf(
      anchor,
      () => isVisible(),
      () => {
        const p = createElement('p');
        p.textContent = 'Visible content';
        return [p];
      },
      () => {
        const span = createElement('span');
        span.textContent = 'Fallback content';
        return [span];
      }
    );

    // Initial state: false -> shows fallback
    expect(container.innerHTML).toContain('Fallback content');

    // Toggle to true -> removes fallback, shows visible
    isVisible.set(true);
    expect(container.innerHTML).toContain('Visible content');
    expect(container.innerHTML).not.toContain('Fallback content');

    // Toggle back to false
    isVisible.set(false);
    expect(container.innerHTML).toContain('Fallback content');
  });

  test('should handle @for block with keyed reconciliation', () => {
    const container = createElement('ul');
    const anchor = createComment('angora:for');
    container.appendChild(anchor);

    interface User {
      id: number;
      name: string;
    }

    const users = signal<User[]>([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]);

    createFor(
      anchor,
      () => users(),
      user => user.id,
      userSignal => {
        const li = createElement('li');
        bindText(li as any, () => userSignal().name);
        return [li];
      },
      () => {
        const emptyLi = createElement('li');
        emptyLi.textContent = 'No users';
        return [emptyLi];
      }
    );

    expect(container.children.length).toBe(2);
    expect(container.children[0].textContent).toBe('Alice');
    expect(container.children[1].textContent).toBe('Bob');

    // Add item
    users.set([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
      { id: 3, name: 'Charlie' },
    ]);
    expect(container.children.length).toBe(3);
    expect(container.children[2].textContent).toBe('Charlie');

    // Set empty list -> shows @empty block
    users.set([]);
    expect(container.children.length).toBe(1);
    expect(container.children[0].textContent).toBe('No users');
  });

  test('should bootstrap component with DI into DOM container', () => {
    const appDiv = createElement('div');
    appDiv.id = 'app';
    document.body.appendChild(appDiv);

    @Component({
      selector: 'test-app',
      template: '<h1>Hello {{ name() }}</h1>',
    })
    class TestComponent {
      name = signal('World');
    }

    const instance = bootstrapApplication(TestComponent, '#app');
    expect(instance).toBeInstanceOf(TestComponent);
    expect(appDiv.innerHTML).toBe('<h1>Hello World</h1>');

    instance.name.set('Angora');
    expect(appDiv.innerHTML).toBe('<h1>Hello Angora</h1>');
  });

  test('should bind class dynamically [class.active]', () => {
    const el = createElement('div');
    const isActive = signal(false);

    bindClass(el, 'active', () => isActive());
    expect(el.classList.contains('active')).toBe(false);

    isActive.set(true);
    expect(el.classList.contains('active')).toBe(true);

    isActive.set(false);
    expect(el.classList.contains('active')).toBe(false);
  });

  test('should bind style dynamically [style.color]', () => {
    const el = createElement('div');
    const color = signal('red');

    bindStyle(el, 'color', () => color());
    expect(el.style.color).toBe('red');

    color.set('blue');
    expect(el.style.color).toBe('blue');

    color.set('');
    expect(el.style.color).toBe('');
  });

  test('should handle two-way data binding [(value)]', () => {
    const input = createElement('input') as HTMLInputElement;
    const text = signal('initial');

    bindTwoWay(
      input,
      'value',
      () => text(),
      v => text.set(v)
    );

    expect(input.value).toBe('initial');

    // Signal -> DOM
    text.set('updated from signal');
    expect(input.value).toBe('updated from signal');

    // DOM -> Signal
    input.value = 'user typed this';
    input.dispatchEvent(new Event('input'));
    expect(text()).toBe('user typed this');
  });

  test('should handle @switch control flow dynamically', () => {
    const container = createElement('div');
    const anchor = createComment('angora:switch');
    container.appendChild(anchor);

    const status = signal<'loading' | 'success' | 'error'>('loading');

    createSwitch(anchor, () => status(), [
      {
        caseValue: 'loading',
        render: () => {
          const p = createElement('p');
          p.textContent = 'Loading...';
          return [p];
        },
      },
      {
        caseValue: 'success',
        render: () => {
          const h2 = createElement('h2');
          h2.textContent = 'Success!';
          return [h2];
        },
      },
      {
        // @default
        render: () => {
          const span = createElement('span');
          span.textContent = 'Something went wrong';
          return [span];
        },
      },
    ]);

    expect(container.innerHTML).toContain('Loading...');

    status.set('success');
    expect(container.innerHTML).toContain('Success!');
    expect(container.innerHTML).not.toContain('Loading...');

    status.set('error');
    expect(container.innerHTML).toContain('Something went wrong');
  });
});
