import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getCompletions,
  diagnoseDocument,
  getHoverInfo,
  getDefinition,
  findTemplateReferences,
} from '../src/extension.ts';

describe('Angora Language Tools - VS Code Extension & LSP', () => {
  test('should parse TextMate grammar syntax JSON without errors', () => {
    const grammarPath = resolve(import.meta.dir, '../syntaxes/angora-template.tmLanguage.json');
    const content = readFileSync(grammarPath, 'utf-8');
    const grammar = JSON.parse(content);

    expect(grammar.name).toBe('Angora Template');
    expect(grammar.scopeName).toBe('text.html.angora');
    expect(grammar.repository['control-flow']).toBeDefined();
    expect(grammar.repository['interpolations']).toBeDefined();
    expect(grammar.repository['bindings']).toBeDefined();
  });

  test('should return intelligent completions for control flow, pipes, and component properties', () => {
    const all = getCompletions('');
    expect(all.length).toBeGreaterThanOrEqual(12);

    const ifCompletions = getCompletions('@if');
    expect(ifCompletions.some(c => c.label === '@if')).toBe(true);

    const pipeCompletions = getCompletions('currency');
    expect(pipeCompletions.some(c => c.label === 'currency')).toBe(true);
  });

  test('should provide rich hover documentation for keywords and pipes', () => {
    const ifHover = getHoverInfo('@if');
    expect(ifHover).toContain('Angora `@if` Control Flow Block');

    const deferHover = getHoverInfo('@defer');
    expect(deferHover).toContain('Deferrable Views');
  });

  test('should find template references (#ref) within document', () => {
    const template = `<div><input #myInput /><button #submitBtn>Go</button></div>`;
    const refs = findTemplateReferences(template);
    expect(refs.length).toBe(2);
    expect(refs[0].name).toBe('myInput');
    expect(refs[1].name).toBe('submitBtn');
  });

  describe('Feature 1: Báo lỗi đỏ trực tiếp trên template (Template Diagnostics)', () => {
    test('should pass valid component template with 0 diagnostics', () => {
      const validComponent = `
        import { Component, signal } from '@angora-js/core';

        @Component({
          selector: 'my-comp',
          template: \`
            <div>
              <h1>{{ title() }}</h1>
              <input [disabled]="isPending()" />
            </div>
          \`
        })
        export class MyComp {
          title = signal<string>('Hello World');
          isPending = signal<boolean>(false);
        }
      `;

      const diags = diagnoseDocument(validComponent);
      expect(diags.length).toBe(0);
    });

    test('should support input(), input.required(), output(), and model() without false errors', () => {
      const inputOutputComponent = `
        import { Component, input, output, model } from '@angora-js/core';

        @Component({
          selector: 'user-profile',
          template: \`
            <div>
              <h1>{{ username() }}</h1>
              <p>{{ age() }}</p>
              <input [value]="username()" />
              <button (click)="saved.emit(username())">Save</button>
            </div>
          \`
        })
        export class UserProfileComponent {
          /** The username signal input */
          username = input.required<string>();

          /** The age signal input with default */
          age = input<number>(20);

          /** Output event emitter */
          saved = output<string>();

          /** Two-way model signal */
          status = model<string>('active');
        }
      `;

      const diags = diagnoseDocument(inputOutputComponent);
      expect(diags.length).toBe(0);

      // Verify hover on input
      const lines = inputOutputComponent.split('\n');
      const userLine = lines.findIndex(l => l.includes('username()'));
      const userChar = lines[userLine].indexOf('username');
      const userHover = getHoverInfo(inputOutputComponent, { line: userLine, character: userChar });
      expect(userHover).toContain('(property) UserProfileComponent.username: InputSignal<string>');
      expect(userHover).toContain('The username signal input');

      // Verify hover on output
      const saveLine = lines.findIndex(l => l.includes('saved.emit'));
      const saveChar = lines[saveLine].indexOf('saved');
      const saveHover = getHoverInfo(inputOutputComponent, { line: saveLine, character: saveChar });
      expect(saveHover).toContain('(property) UserProfileComponent.saved: OutputEmitter<string>');

      // Verify definition on input
      const defs = getDefinition(inputOutputComponent, { line: userLine, character: userChar });
      expect(defs.length).toBe(1);
      expect(defs[0].symbol).toBe('username');
      expect(defs[0].range.start.line).toBe(
        lines.findIndex(l => l.includes('username = input.required'))
      );
    });

    test('should recognize inject() services and constructor parameters without TS2339 errors', () => {
      const diComponent = `
        import { Component, inject } from '@angora-js/core';
        import { ToastService } from './toast.service';
        import { Router } from './router';

        @Component({
          selector: 'app-cart',
          template: \`
            <div>
              <button (click)="toastService.show('Item added!')">Add</button>
              <button (click)="router.navigate('/checkout')">Checkout</button>
              <span [hidden]="toastService.isEmpty">{{ totalCount }}</span>
            </div>
          \`
        })
        export class CartComponent {
          /** Toast notification service */
          toastService = inject(ToastService);

          /** Navigation router */
          readonly router = inject<Router>(Router);

          /** Items count getter */
          get totalCount(): number {
            return 5;
          }
        }
      `;

      const diags = diagnoseDocument(diComponent);
      const ts2339Diags = diags.filter(d => d.code === 'TS2339');
      expect(ts2339Diags.length).toBe(0);

      const lines = diComponent.split('\n');

      // Verify hover on toastService
      const toastLine = lines.findIndex(l => l.includes('toastService.show'));
      const toastChar = lines[toastLine].indexOf('toastService');
      const toastHover = getHoverInfo(diComponent, { line: toastLine, character: toastChar });
      expect(toastHover).toContain('(property) CartComponent.toastService: ToastService');
      expect(toastHover).toContain('Toast notification service');

      // Verify definition on toastService
      const toastDefs = getDefinition(diComponent, { line: toastLine, character: toastChar });
      expect(toastDefs.length).toBe(1);
      expect(toastDefs[0].symbol).toBe('toastService');
      expect(toastDefs[0].range.start.line).toBe(
        lines.findIndex(l => l.includes('toastService = inject'))
      );

      // Verify hover on router
      const routerLine = lines.findIndex(l => l.includes('router.navigate'));
      const routerChar = lines[routerLine].indexOf('router');
      const routerHover = getHoverInfo(diComponent, { line: routerLine, character: routerChar });
      expect(routerHover).toContain('(property) CartComponent.router: Router');

      // Verify hover on getter totalCount
      const totalLine = lines.findIndex(l => l.includes('totalCount'));
      const totalChar = lines[totalLine].indexOf('totalCount');
      const totalHover = getHoverInfo(diComponent, { line: totalLine, character: totalChar });
      expect(totalHover).toContain('(property) CartComponent.totalCount: number');
    });

    test('should completely ignore commented-out code and not show false errors in comments', () => {
      const componentWithComments = `
        import { Component, signal } from '@angora-js/core';

        @Component({
          selector: 'test-comment-comp',
          template: \`
            <div>
              <!-- Single line comment with non-existent prop: {{ nonExistent1 }} -->
              <!--
                <unknown-component [input]="nonExistent2" (click)="nonExistent3()" />
                @if (nonExistent4) {
                  <p>{{ nonExistent5 | fakePipe }}</p>
                }
              -->
              // <commented-line [prop]="badProp" />
              // {{ commentedOutExpr }}
              /*
                <block-commented [foo]="bar" />
              */
              <h1>{{ message() }}</h1>
            </div>
          \`
        })
        export class TestCommentComp {
          message = signal<string>('Hello');
        }
      `;

      const diags = diagnoseDocument(componentWithComments);
      // There should be 0 errors reported because all problematic code is in comments!
      expect(diags.length).toBe(0);
    });

    test('should report TS2339 when template references non-existent component property', () => {
      const invalidComponent = `
        import { Component, signal } from '@angora-js/core';

        @Component({
          selector: 'my-comp',
          template: \`
            <div>
              <h1>{{ nonExistent() }}</h1>
            </div>
          \`
        })
        export class MyComp {
          title = signal('Hello World');
        }
      `;

      const diags = diagnoseDocument(invalidComponent);
      expect(diags.length).toBeGreaterThan(0);
      const ts2339 = diags.find(d => d.code === 'TS2339');
      expect(ts2339).toBeDefined();
      expect(ts2339?.message).toContain("Property 'nonExistent' does not exist on type 'MyComp'");
      expect(ts2339?.line).toBe(8);
    });

    test('should report TS2322 when type mismatch between component property and HTML element input', () => {
      const typeMismatchComponent = `
        import { Component, signal } from '@angora-js/core';

        @Component({
          selector: 'my-comp',
          template: \`
            <div>
              <input [disabled]="title()" />
            </div>
          \`
        })
        export class MyComp {
          title = signal<string>('Hello World');
        }
      `;

      const diags = diagnoseDocument(typeMismatchComponent);
      const ts2322 = diags.find(d => d.code === 'TS2322');
      expect(ts2322).toBeDefined();
      expect(ts2322?.message).toContain("Type 'string' is not assignable to type 'boolean'");
      expect(ts2322?.line).toBe(8);
    });

    test('should suggest calling signal when signal is passed directly to boolean property', () => {
      const uncalledSignalComponent = `
        import { Component, signal } from '@angora-js/core';

        @Component({
          selector: 'my-comp',
          template: \`
            <div>
              <input [disabled]="isPending" />
            </div>
          \`
        })
        export class MyComp {
          isPending = signal<boolean>(false);
        }
      `;

      const diags = diagnoseDocument(uncalledSignalComponent);
      const ts2322 = diags.find(d => d.code === 'TS2322');
      expect(ts2322).toBeDefined();
      expect(ts2322?.message).toContain("Did you mean to call 'isPending()'");
    });

    test('should report NG8001 for unimported custom elements and NG8004 for unimported pipes', () => {
      const missingImportsComponent = `
        import { Component } from '@angora-js/core';

        @Component({
          selector: 'my-comp',
          imports: [],
          template: \`
            <div>
              <unknown-card />
              <p>{{ 'hello' | customFormat }}</p>
            </div>
          \`
        })
        export class MyComp {}
      `;

      const diags = diagnoseDocument(missingImportsComponent);
      const ng8001 = diags.find(d => d.code === 'NG8001');
      const ng8004 = diags.find(d => d.code === 'NG8004');

      expect(ng8001).toBeDefined();
      expect(ng8001?.message).toContain("'unknown-card' is not a known element");

      expect(ng8004).toBeDefined();
      expect(ng8004?.message).toContain("No pipe found with name 'customFormat'");
    });
  });

  describe('Feature 2: Hover chuột vào biến trong HTML (Hover Information)', () => {
    const hoverComponent = `import { Component, signal } from '@angora-js/core';

@Component({
  selector: 'my-comp',
  template: \`
    <div>
      <h1>{{ title() }}</h1>
      <input [disabled]="isPending()" />
    </div>
  \`
})
export class MyComp {
  /** The application headline */
  title = signal<string>('Hello World');

  /** Flag for pending state */
  isPending = signal<boolean>(false);
}
`;

    test('should display type and docstring when hovering over component property in template', () => {
      // Hover at line 6, col 13: "title" inside "{{ title() }}"
      const hover = getHoverInfo(hoverComponent, { line: 6, character: 14 });
      expect(hover).not.toBeNull();
      expect(hover).toContain('(property) MyComp.title: Signal<string>');
      expect(hover).toContain('The application headline');
    });

    test('should display property type when hovering over standard HTML element property [disabled]', () => {
      // Hover at line 7, col 14: "[disabled]"
      const hover = getHoverInfo(hoverComponent, { line: 7, character: 15 });
      expect(hover).not.toBeNull();
      expect(hover).toContain('(property) HTMLInputElement.disabled: boolean');
    });
  });

  describe('Feature 3: F12 (Go to Definition) từ template (Definition Provider)', () => {
    const defComponent = `import { Component, signal } from '@angora-js/core';
import { UserCardComponent } from './user-card.component';

@Component({
  selector: 'my-comp',
  imports: [UserCardComponent],
  template: \`
    <div>
      <h1>{{ title() }}</h1>
      <user-card />
    </div>
  \`
})
export class MyComp {
  /** The application headline */
  title = signal<string>('Hello World');
}
`;

    test('should jump directly to property declaration in TypeScript file when pressing F12 on template variable', () => {
      // F12 on "title" at line 8, col 14
      const defs = getDefinition(defComponent, { line: 8, character: 14 });
      expect(defs.length).toBe(1);
      expect(defs[0].symbol).toBe('title');
      expect(defs[0].range.start.line).toBe(15); // line of "title = signal..."
    });

    test('should jump to component import when pressing F12 on custom element tag in template', () => {
      // F12 on "<user-card />" at line 9, col 8
      const defs = getDefinition(defComponent, { line: 9, character: 8 });
      expect(defs.length).toBe(1);
      expect(defs[0].symbol).toBe('UserCardComponent');
      expect(defs[0].uri).toContain('user-card.component.ts');
    });

    test('should jump to template reference declaration and @for loop declaration', () => {
      const templateVarsComp = `import { Component, signal } from '@angora-js/core';
@Component({
  selector: 'my-comp',
  template: \`
    <div>
      <input #mySearch [value]="query()" />
      <button (click)="mySearch.focus()">Focus</button>

      @for (item of items(); track item.id) {
        <span>{{ item.name }}</span>
      }
    </div>
  \`
})
export class MyComp {
  query = signal('');
  items = signal<{ id: number; name: string }[]>([]);
}
`;
      const lines = templateVarsComp.split('\n');
      const clickLine = lines.findIndex(l => l.includes('mySearch.focus()'));
      const searchChar = lines[clickLine].indexOf('mySearch');
      const defSearch = getDefinition(templateVarsComp, { line: clickLine, character: searchChar });
      expect(defSearch.length).toBe(1);
      expect(defSearch[0].symbol).toBe('mySearch');
      expect(defSearch[0].range.start.line).toBe(
        lines.findIndex(l => l.includes('<input #mySearch'))
      );

      const itemLine = lines.findIndex(l => l.includes('item.name'));
      const itemChar = lines[itemLine].indexOf('item');
      const defItem = getDefinition(templateVarsComp, { line: itemLine, character: itemChar });
      expect(defItem.length).toBe(1);
      expect(defItem[0].symbol).toBe('item');
      expect(defItem[0].range.start.line).toBe(
        lines.findIndex(l => l.includes('@for (item of items()'))
      );
    });
  });

  describe('Feature 4: Chained property navigation and Template-scoped variables', () => {
    test('should support multi-level chained navigation: toastService.toasts().length with accurate type checking and hover', () => {
      const chainedComp = `import { Component, inject } from '@angora-js/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'toast-comp',
  template: \`
    <div>
      <span>{{ toastService.toasts().length }}</span>
      <button [disabled]="toastService.toasts().length">Disabled</button>
      <button [disabled]="toastService.toasts().length > 0">Active</button>
    </div>
  \`
})
export class ToastComp {
  toastService = inject(ToastService);
}
`;
      const diags = diagnoseDocument(chainedComp);
      // TS2322 on [disabled]="toastService.toasts().length" because number cannot be assigned to boolean
      const typeMismatch = diags.find(
        d =>
          d.code === 'TS2322' &&
          d.message.includes("Type 'number' is not assignable to type 'boolean'")
      );
      expect(typeMismatch).toBeDefined();

      // No TS2339 errors
      expect(diags.filter(d => d.code === 'TS2339').length).toBe(0);

      const lines = chainedComp.split('\n');
      const spanLine = lines.findIndex(l => l.includes('toastService.toasts().length'));
      const lengthChar = lines[spanLine].indexOf('length');
      const hoverLength = getHoverInfo(chainedComp, { line: spanLine, character: lengthChar });
      expect(hoverLength).toContain('length: number');

      const toastsChar = lines[spanLine].indexOf('toasts()');
      const hoverToasts = getHoverInfo(chainedComp, { line: spanLine, character: toastsChar });
      expect(hoverToasts).toMatch(/toasts: Toast(Item)?\[\]/);
    });

    test('should support template scoped variables in @for and template references (#ref) without TS2339 errors', () => {
      const scopedComp = `import { Component, signal } from '@angora-js/core';

interface Product {
  id: number;
  name: string;
}

@Component({
  selector: 'product-list',
  template: \`
    <div>
      <input #nameInput />
      <span>{{ nameInput.value }}</span>

      @for (item of products(); track item.id; let idx = $index) {
        <div>
          <span>{{ item.name }}</span>
          <span>Index: {{ $index }}</span>
          <span>First: {{ $first }}</span>
        </div>
      }
    </div>
  \`
})
export class ProductList {
  products = signal<Product[]>([]);
}
`;
      const diags = diagnoseDocument(scopedComp);
      // Zero TS2339 errors for nameInput, item, $index, $first
      expect(diags.filter(d => d.code === 'TS2339').length).toBe(0);

      const lines = scopedComp.split('\n');
      const itemLine = lines.findIndex(l => l.includes('item.name'));
      const itemChar = lines[itemLine].indexOf('item');
      const hoverItem = getHoverInfo(scopedComp, { line: itemLine, character: itemChar });
      expect(hoverItem).toContain('(parameter) item: Product');

      const indexLine = lines.findIndex(l => l.includes('Index: {{ $index }}'));
      const indexChar = lines[indexLine].indexOf('$index');
      const hoverIndex = getHoverInfo(scopedComp, { line: indexLine, character: indexChar });
      expect(hoverIndex).toContain('(context variable) $index: number');

      const valLine = lines.findIndex(l => l.includes('nameInput.value'));
      const valChar = lines[valLine].indexOf('value');
      const hoverVal = getHoverInfo(scopedComp, { line: valLine, character: valChar });
      expect(hoverVal).toContain('value: string');
    });

    test('should resolve real imported types from external service (ToastService -> ToastItem[] -> item.type: ToastType)', () => {
      const toastContainerPath = resolve(
        import.meta.dir,
        '../../ui/src/toast-container.component.ts'
      );
      const toastUri = `file://${toastContainerPath}`;
      const content = readFileSync(toastContainerPath, 'utf-8');

      const diags = diagnoseDocument(content, toastUri);
      expect(diags.filter(d => d.code === 'TS2339').length).toBe(0);

      const lines = content.split('\n');

      // 1. Hover on toastService.toasts() -> ToastItem[] (NOT Toast[])
      const ifLine = lines.findIndex(l => l.includes('toastService.toasts().length'));
      const toastsChar = lines[ifLine].indexOf('toasts');
      const hoverToasts = getHoverInfo(content, { line: ifLine, character: toastsChar }, toastUri);
      expect(hoverToasts).toContain('ToastService.toasts: ToastItem[]');

      // 2. Hover on item -> ToastItem
      const forLine = lines.findIndex(l => l.includes('@for (item of toastService.toasts()'));
      const itemChar = lines[forLine].indexOf('item');
      const hoverItem = getHoverInfo(content, { line: forLine, character: itemChar }, toastUri);
      expect(hoverItem).toContain('(parameter) item: ToastItem');

      // 3. Hover on item.type -> ToastType with alias
      const typeLine = lines.findIndex(l => l.includes("item.type === 'info'"));
      const typeChar = lines[typeLine].indexOf('type');
      const hoverType = getHoverInfo(content, { line: typeLine, character: typeChar }, toastUri);
      expect(hoverType).toContain('ToastItem.type: ToastType');
      expect(hoverType).toContain("type ToastType = 'info' | 'success' | 'warning' | 'error'");

      // 4. F12 on item.type jumps to toast.service.ts
      const defType = getDefinition(content, { line: typeLine, character: typeChar }, toastUri);
      expect(defType.length).toBe(1);
      expect(defType[0].symbol).toBe('type');
      expect(defType[0].uri).toContain('toast.service.ts');

      // 5. Hover on toastService.toasts() INSIDE @for loop (Line 9) -> ToastItem[]
      const forToastsChar = lines[forLine].indexOf('toasts');
      const hoverForToasts = getHoverInfo(
        content,
        { line: forLine, character: forToastsChar },
        toastUri
      );
      expect(hoverForToasts).toContain('ToastService.toasts: ToastItem[]');

      // 6. F12 on toasts in @for loop jumps to toast.service.ts
      const defForToasts = getDefinition(
        content,
        { line: forLine, character: forToastsChar },
        toastUri
      );
      expect(defForToasts.length).toBe(1);
      expect(defForToasts[0].symbol).toBe('toasts');
      expect(defForToasts[0].uri).toContain('toast.service.ts');
    });
  });
});
