import { describe, it, expect } from 'bun:test';
import { parseTemplate, verifyTemplateImports, transformComponent } from '../src/index.ts';

describe('@angora-js/compiler - Template Imports & Standalone Verification', () => {
  it('should pass validation when all components, pipes, and directives are imported', () => {
    const template = `
      <div class="container">
        <h1>{{ title() | uppercase }}</h1>
        <p>{{ createdAt() | customDate:'short' }}</p>
        <button [angoraTooltip]="'Save item'" (click)="save()">Save</button>
        <todo-item [item]="item" (delete)="onDelete($event)"></todo-item>
      </div>
    `;
    const ast = parseTemplate(template);
    const diags = verifyTemplateImports(ast, {
      className: 'AppComponent',
      imports: ['TodoItemComponent', 'CustomDatePipe', 'TooltipDirective', 'UpperCasePipe'],
    });

    expect(diags).toHaveLength(0);
  });

  it('should pass validation when component is imported with forwardRef wrapper', () => {
    const template = `
      <angora-menu>
        <angora-menu-item>Item</angora-menu-item>
      </angora-menu>
    `;
    const ast = parseTemplate(template);
    const diags = verifyTemplateImports(ast, {
      className: 'MenuDemoComponent',
      imports: [
        'forwardRef(() => AngoraMenuComponent)',
        'forwardRef(() => AngoraMenuItemComponent)',
      ],
    });

    expect(diags).toHaveLength(0);
  });

  it('should detect NG8001 when a custom element is used without importing it', () => {
    const template = `
      <div class="wrapper">
        <user-avatar [user]="user()"></user-avatar>
        <unknown-widget></unknown-widget>
      </div>
    `;
    const ast = parseTemplate(template);
    const diags = verifyTemplateImports(ast, {
      className: 'DashboardComponent',
      imports: ['UserAvatarComponent'],
    });

    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe('NG8001');
    expect(diags[0].severity).toBe('error');
    expect(diags[0].message).toContain("'unknown-widget' is not a known element");
    expect(diags[0].message).toContain('DashboardComponent');
  });

  it('should bypass NG8001 when CUSTOM_ELEMENTS schema is active', () => {
    const template = `
      <ion-badge color="primary">New</ion-badge>
    `;
    const ast = parseTemplate(template);
    const diags = verifyTemplateImports(ast, {
      className: 'IonicComponent',
      imports: [],
      schema: 'CUSTOM_ELEMENTS',
    });

    expect(diags).toHaveLength(0);
  });

  it('should detect NG8004 when an unimported pipe is used', () => {
    const template = `
      <p>{{ price() | fancyCurrency:'EUR' }}</p>
      <p>{{ text() | uppercase }}</p>
    `;
    const ast = parseTemplate(template);
    const diags = verifyTemplateImports(ast, {
      className: 'ProductComponent',
      imports: [],
    });

    expect(diags).toHaveLength(2);
    expect(diags[0].code).toBe('NG8004');
    expect(diags[0].severity).toBe('error');
    expect(diags[0].message).toContain("No pipe found with name 'fancyCurrency'");
    expect(diags[1].code).toBe('NG8004');
    expect(diags[1].severity).toBe('error');
    expect(diags[1].message).toContain("No pipe found with name 'uppercase'");
  });

  it('should allow standard pipes when explicitly imported or via CommonModule', () => {
    const template = `
      <p>{{ text() | uppercase }}</p>
    `;
    const ast = parseTemplate(template);

    const diagsExplicit = verifyTemplateImports(ast, {
      className: 'ProductComponent',
      imports: ['UpperCasePipe'],
    });
    expect(diagsExplicit).toHaveLength(0);

    const diagsCommon = verifyTemplateImports(ast, {
      className: 'ProductComponent',
      imports: ['CommonModule'],
    });
    expect(diagsCommon).toHaveLength(0);
  });

  it('should detect NG8002 when an unknown directive binding is used on standard element', () => {
    const template = `
      <button [myUnknownDirective]="'val'">Click</button>
    `;
    const ast = parseTemplate(template);
    const diags = verifyTemplateImports(ast, {
      className: 'ButtonComponent',
      imports: [],
    });

    expect(diags).toHaveLength(1);
    expect(diags[0].code).toBe('NG8002');
    expect(diags[0].severity).toBe('warning');
    expect(diags[0].message).toContain("Can't bind to 'myUnknownDirective'");
  });

  it('should throw compiler error on strictImports: true', () => {
    const code = `
      @Component({
        selector: 'app-strict',
        imports: [],
        template: '<unimported-child></unimported-child>'
      })
      export class StrictComponent {}
    `;

    expect(() => {
      transformComponent(code, { strictImports: true });
    }).toThrow(/NG8001/);
  });
});
