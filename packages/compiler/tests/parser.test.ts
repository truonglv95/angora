import { describe, test, expect } from 'bun:test';
import {
  parseTemplate,
  generateTypeCheckBlock,
  generateTypeCheckBlockNative,
  compileTemplate,
  transformComponent,
} from '../src/index.ts';

describe('@angora-js/compiler - Template Parser', () => {
  test('should parse basic HTML elements and text', () => {
    const ast = parseTemplate('<h1>Hello World</h1>');
    expect(ast.length).toBe(1);
    expect(ast[0].type).toBe('element');

    const el = ast[0] as any;
    expect(el.name).toBe('h1');
    expect(el.children.length).toBe(1);
    expect(el.children[0].type).toBe('text');
    expect(el.children[0].value).toBe('Hello World');
  });

  test('should parse interpolations {{ expr }}', () => {
    const ast = parseTemplate('<p>Count: {{ count() }}</p>');
    const p = ast[0] as any;
    expect(p.children.length).toBe(2);
    expect(p.children[0].type).toBe('text');
    expect(p.children[0].value).toBe('Count: ');
    expect(p.children[1].type).toBe('interpolation');
    expect(p.children[1].expression).toBe('count()');
  });

  test('should parse property and event bindings [prop] and (event)', () => {
    const ast = parseTemplate(
      '<button [disabled]="isLoading()" (click)="save($event)">Save</button>'
    );
    const btn = ast[0] as any;
    expect(btn.name).toBe('button');
    expect(btn.properties.length).toBe(1);
    expect(btn.properties[0].name).toBe('disabled');
    expect(btn.properties[0].expression).toBe('isLoading()');

    expect(btn.events.length).toBe(1);
    expect(btn.events[0].name).toBe('click');
    expect(btn.events[0].handler).toBe('save($event)');
  });

  test('should parse @if / @else if / @else control flow', () => {
    const template = `
      @if (score() > 90) {
        <span>Excellent</span>
      } @else if (score() > 50) {
        <span>Pass</span>
      } @else {
        <span>Fail</span>
      }
    `;

    const ast = parseTemplate(template);
    expect(ast.length).toBe(1);
    expect(ast[0].type).toBe('ifBlock');

    const ifBlock = ast[0] as any;
    expect(ifBlock.branches.length).toBe(3);
    expect(ifBlock.branches[0].condition).toBe('score() > 90');
    expect(ifBlock.branches[1].condition).toBe('score() > 50');
    expect(ifBlock.branches[2].condition).toBeUndefined(); // @else
  });

  test('should parse @for (item of items; track item.id) with @empty', () => {
    const template = `
      <ul>
        @for (item of items(); track item.id) {
          <li>{{ item.name }}</li>
        } @empty {
          <li>No items found</li>
        }
      </ul>
    `;

    const ast = parseTemplate(template);
    const ul = ast[0] as any;
    expect(ul.children.length).toBe(1);

    const forBlock = ul.children[0] as any;
    expect(forBlock.type).toBe('forBlock');
    expect(forBlock.itemName).toBe('item');
    expect(forBlock.iterable).toBe('items()');
    expect(forBlock.trackBy).toBe('item.id');
    expect(forBlock.children.length).toBe(1);
    expect(forBlock.emptyBlock).toBeDefined();
    expect(forBlock.emptyBlock.length).toBe(1);
  });

  test('should parse @switch / @case / @default', () => {
    const template = `
      @switch (status()) {
        @case ('loading') {
          <span>Loading...</span>
        }
        @case ('success') {
          <span>Loaded!</span>
        }
        @default {
          <span>Error</span>
        }
      }
    `;

    const ast = parseTemplate(template);
    expect(ast.length).toBe(1);
    expect(ast[0].type).toBe('switchBlock');

    const switchBlock = ast[0] as any;
    expect(switchBlock.expression).toBe('status()');
    expect(switchBlock.cases.length).toBe(3);
    expect(switchBlock.cases[0].caseValue).toBe("'loading'");
    expect(switchBlock.cases[1].caseValue).toBe("'success'");
    expect(switchBlock.cases[2].caseValue).toBeUndefined(); // @default
  });

  test('should parse two-way bindings [(value)]', () => {
    const template =
      '<input [(value)]="name" [class.active]="isActive()" [style.color]="themeColor()" />';
    const ast = parseTemplate(template);
    expect(ast.length).toBe(1);

    const input = ast[0] as any;
    expect(input.type).toBe('element');
    expect(input.twoWayBindings.length).toBe(1);
    expect(input.twoWayBindings[0].name).toBe('value');
    expect(input.twoWayBindings[0].expression).toBe('name');

    expect(input.properties.length).toBe(2);
    expect(input.properties[0].name).toBe('class.active');
    expect(input.properties[1].name).toBe('style.color');
  });

  test('should generate synthetic Type Check Block (TCB) for tsgo', () => {
    const template = `
      @if (count() > 0) {
        <p>{{ title() }}</p>
      }
      @for (item of items(); track item.id) {
        <span>{{ item.name }}</span>
      }
    `;

    const ast = parseTemplate(template);
    const tcb = generateTypeCheckBlock(ast, 'MyComponent');

    expect(tcb).toContain('function __angora_tcb_MyComponent(ctx: MyComponent)');
    expect(tcb).toContain('if (ctx.count() > 0)');
    expect(tcb).toContain('ctx.title()');
    expect(tcb).toContain('for (const [$index, item] of (ctx.items()).entries())');
  });

  test('should generate native Type Check Block (TCB) with exact Source Maps using Rust OXC compiler', () => {
    const template = `
      @if (count() > 0) {
        <p>{{ title() }}</p>
      }
      @for (item of items(); track item.id) {
        <span>{{ item.name }}</span>
      }
    `;

    const res = generateTypeCheckBlockNative(template, 'MyComponent');
    expect(res.code).toContain('function __angora_tcb_MyComponent(ctx: MyComponent)');
    expect(res.code).toContain('if (ctx.count() > 0)');
    expect(res.code).toContain('for (const [$index, item] of (ctx.items()).entries())');
    expect(res.code).toContain('item.id');
    expect(res.code).toContain('item.name');
    expect(res.mappings.length).toBeGreaterThan(0);
    expect(res.mappings.some(m => m.expression === 'item.name')).toBe(true);
  });

  test('should generate typed DOM property assignments, pipes, and exact spans in native TCB', () => {
    const template = `<button [disabled]="toastService.toasts().length > 0"><span>{{ user.birthday | date:'medium' }}</span></button>`;

    const res = generateTypeCheckBlockNative(template, 'ToastComponent');
    expect(res.code).toContain('const __angora_pipe: any = null!;');
    expect(res.code).toContain('HTMLButtonElement = null!;');
    expect(res.code).toContain('.disabled = (ctx.toastService.toasts().length > 0);');
    expect(res.code).toContain("__angora_pipe.transform(ctx.user.birthday, 'medium')");

    const disabledMap = res.mappings.find(m =>
      m.expression.includes('toastService.toasts().length')
    );
    expect(disabledMap).toBeDefined();
    expect(template.slice(disabledMap!.tmplStart, disabledMap!.tmplEnd)).toBe(
      'toastService.toasts().length > 0'
    );

    const pipeMap = res.mappings.find(m => m.expression.includes('birthday'));
    expect(pipeMap).toBeDefined();
    expect(template.slice(pipeMap!.tmplStart, pipeMap!.tmplEnd)).toBe(
      "user.birthday | date:'medium'"
    );
  });

  test('should handle template references (#ref) and DOM typing in native TCB', () => {
    const template = `
      <input #emailInput type="email" />
      <button (click)="submit(emailInput.value)">Submit</button>
    `;
    const res = generateTypeCheckBlockNative(template, 'LoginComponent');
    expect(res.code).toContain('const emailInput: HTMLInputElement = null!;');
    expect(res.code).toContain('ctx.submit(emailInput.value)');
    expect(res.code).not.toContain('ctx.emailInput');
  });

  test('should handle two-way bindings [(ngModel)] and [(value)] in native TCB', () => {
    const template = `
      <input [(ngModel)]="username" />
      <select [(value)]="selectedRole">
        <option value="admin">Admin</option>
      </select>
    `;
    const res = generateTypeCheckBlockNative(template, 'UserFormComponent');
    expect(res.code).toContain(
      ".value = ((typeof ctx.username === 'function' ? ctx.username() : ctx.username) as any);"
    );
    expect(res.code).toContain(
      ".value = ((typeof ctx.selectedRole === 'function' ? ctx.selectedRole() : ctx.selectedRole) as any);"
    );
  });

  test('should handle loop context variables ($index, $first, $last, $count) in native TCB', () => {
    const template = `
      @for (item of products(); track item.id) {
        <span>{{ $index + 1 }} / {{ $count }} - {{ item.title }} (first: {{ $first }}, last: {{ $last }})</span>
      }
    `;
    const res = generateTypeCheckBlockNative(template, 'ProductListComponent');
    expect(res.code).toContain('for (const [$index, item] of (ctx.products()).entries())');
    expect(res.code).toContain('$index + 1');
    expect(res.code).toContain('$count');
    expect(res.code).toContain('$first');
    expect(res.code).toContain('$last');
    expect(res.code).not.toContain('ctx.$index');
    expect(res.code).not.toContain('ctx.$count');
    expect(res.code).not.toContain('ctx.item');
  });

  test('should generate mountComponent for custom elements with inputs and outputs', () => {
    const ast = parseTemplate(
      '<app-user-card [user]="currentUser()" (select)="onSelect($event)" />'
    );
    const code = compileTemplate(ast);

    expect(code).toContain("mountComponent('app-user-card'");
    expect(code).toContain("'user': () => (ctx.currentUser())");
    expect(code).toContain("'select': ($event) => { (ctx.onSelect($event)); }");
  });

  test('should generate slot projection for <ng-content>', () => {
    const ast = parseTemplate('<div class="card"><ng-content></ng-content></div>');
    const code = compileTemplate(ast);

    expect(code).toContain('angora:slot');
    expect(code).toContain('ctx.__projectedNodes');
  });

  test('should transform component with imports array', () => {
    const source = `
      import { Component } from '@angora-js/core';
      import { TodoItemComponent } from './todo-item.component';

      @Component({
        selector: 'app-root',
        imports: [TodoItemComponent],
        template: \`<app-todo-item [item]="todo" />\`
      })
      export class AppComponent {}
    `;

    const transformed = transformComponent(source);
    expect(transformed).toContain('imports: [TodoItemComponent]');
    expect(transformed).toContain('mountComponent');
    expect(transformed).not.toContain('@Component');
  });

  test('should decode HTML entities in text and attribute values', () => {
    const template = '<button title="Close &times;">&times; Delete &lt;Item&gt; &#9662;</button>';
    const ast = parseTemplate(template);
    expect(ast.length).toBe(1);

    const btn = ast[0] as any;
    expect(btn.type).toBe('element');
    expect(btn.attributes[0].name).toBe('title');
    expect(btn.attributes[0].value).toBe('Close ×');

    expect(btn.children[0].type).toBe('text');
    expect(btn.children[0].value).toBe('× Delete <Item> ▾');
  });
});
