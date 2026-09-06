import { describe, it, expect, beforeEach } from 'bun:test';
import { Window } from 'happy-dom';
import { Component, signal, viewChild, COMPONENT_DEF } from '@angora-js/core';
import {
  bootstrapApplication,
  createDefer,
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
  mountComponent,
} from '@angora-js/runtime';
import { transformComponent, parseTemplate, compileTemplate } from '@angora-js/compiler';

describe('@angora-js/runtime - Template References (#ref) and viewChild()', () => {
  let container: any;

  beforeEach(() => {
    const window = new Window();
    (globalThis as any).document = window.document;
    (globalThis as any).HTMLElement = window.HTMLElement;
    (globalThis as any).HTMLInputElement = window.HTMLInputElement;
    (globalThis as any).HTMLButtonElement = window.HTMLButtonElement;
    (globalThis as any).Text = window.Text;
    (globalThis as any).Comment = window.Comment;
    (globalThis as any).Event = window.Event;

    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('should bind template reference #myInput and access it in viewChild() signal', () => {
    const template = `
      <div>
        <input #titleInput type="text" value="Angora Rocks" />
        <button #btn>Click Me</button>
      </div>
    `;

    const ast = parseTemplate(template);
    const renderFnCode = compileTemplate(ast);

    expect(renderFnCode).toContain('const titleInput = _el_');
    expect(renderFnCode).toContain('ctx.titleInput = _el_');
    expect(renderFnCode).toContain('const btn = _el_');

    @Component({
      selector: 'app-ref-demo',
      template,
    })
    class RefDemoComponent {
      inputEl = viewChild<HTMLInputElement>('titleInput');
      btnEl = viewChild.required<HTMLButtonElement>('btn');
    }

    const instance = bootstrapApplication(RefDemoComponent, container);
    expect(instance.inputEl).toBeDefined();
    expect(instance.inputEl()?.tagName).toBe('INPUT');
    expect((instance.inputEl() as any)?.value).toBe('Angora Rocks');
    expect(instance.btnEl()?.tagName).toBe('BUTTON');
  });

  it('should allow template event handlers to read #ref directly', () => {
    const template = `
      <div>
        <input #nameInput type="text" value="Initial Text" />
        <button (click)="captured.set(nameInput.value)">Submit</button>
      </div>
    `;

    const ast = parseTemplate(template);
    const renderFnCode = compileTemplate(ast);

    expect(renderFnCode).toContain('const nameInput = _el_');
    expect(renderFnCode).toContain('captured.set(nameInput.value)');

    @Component({
      selector: 'app-ref-event',
      template,
    })
    class RefEventComponent {
      captured = signal('');
    }

    const instance = bootstrapApplication(RefEventComponent, container);
    const button = container.querySelector('button')!;
    const input = container.querySelector('input')!;

    input.value = 'Hello World';
    button.click();

    expect(instance.captured()).toBe('Hello World');
  });
});

describe('@angora-js/runtime - Deferrable Views (@defer)', () => {
  let container: any;

  beforeEach(() => {
    const window = new Window();
    (globalThis as any).document = window.document;
    (globalThis as any).HTMLElement = window.HTMLElement;
    (globalThis as any).HTMLInputElement = window.HTMLInputElement;
    (globalThis as any).HTMLButtonElement = window.HTMLButtonElement;
    (globalThis as any).Text = window.Text;
    (globalThis as any).Comment = window.Comment;
    (globalThis as any).Event = window.Event;

    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('should render placeholder initially and swap to main block on trigger', async () => {
    const anchor = document.createComment('angora:defer');
    container.appendChild(anchor);

    let isTriggered = false;
    const cond = signal(false);

    createDefer(anchor, {
      triggers: [{ type: 'when', condition: () => cond() }],
      placeholder: () => {
        const div = document.createElement('div');
        div.className = 'placeholder';
        div.textContent = 'Skeleton Placeholder';
        return [div];
      },
      main: () => {
        const div = document.createElement('div');
        div.className = 'main-chart';
        div.textContent = 'Heavy Chart Loaded';
        return [div];
      },
    });

    // Check placeholder rendered
    expect(container.querySelector('.placeholder')).not.toBeNull();
    expect(container.querySelector('.placeholder')?.textContent).toBe('Skeleton Placeholder');
    expect(container.querySelector('.main-chart')).toBeNull();

    // Trigger loading
    cond.set(true);

    // Wait microtask
    await new Promise(r => setTimeout(r, 10));

    // Check main block replaced placeholder
    expect(container.querySelector('.placeholder')).toBeNull();
    expect(container.querySelector('.main-chart')).not.toBeNull();
    expect(container.querySelector('.main-chart')?.textContent).toBe('Heavy Chart Loaded');
  });

  it('should trigger on timer(ms)', async () => {
    const anchor = document.createComment('angora:defer');
    container.appendChild(anchor);

    createDefer(anchor, {
      triggers: [{ type: 'timer', param: 20 }],
      placeholder: () => {
        const span = document.createElement('span');
        span.textContent = 'Waiting timer...';
        return [span];
      },
      main: () => {
        const h2 = document.createElement('h2');
        h2.textContent = 'Timer Elapsed!';
        return [h2];
      },
    });

    expect(container.textContent).toContain('Waiting timer...');

    await new Promise(r => setTimeout(r, 40));

    expect(container.textContent).toContain('Timer Elapsed!');
  });

  it('should compile @defer template syntax cleanly', () => {
    const source = `
      import { Component, signal } from '@angora-js/core';

      @Component({
        selector: 'app-defer-demo',
        template: \`
          <div class="wrapper">
            @defer (on timer(100); when isReady()) {
              <div class="deferred-content">Loaded Deferred Content</div>
            } @placeholder {
              <div class="skeleton">Loading Skeleton...</div>
            } @loading {
              <div class="spinner">Spinning...</div>
            } @error {
              <div class="error">Something broke!</div>
            }
          </div>
        \`
      })
      export class DeferDemoComponent {
        isReady = signal(false);
      }
    `;

    const transformed = transformComponent(source);
    expect(transformed).toContain('createDefer(');
    expect(transformed).toMatch(/type:\s*['"]timer['"]/);
    expect(transformed).toMatch(/type:\s*['"]when['"]/);
    expect(transformed).toContain('angora:defer');
  });
});
