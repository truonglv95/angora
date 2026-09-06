import { describe, test, expect } from 'bun:test';
import {
  generateComponent,
  getProjectTemplate,
  validateTemplate,
  toKebabCase,
  toPascalCase,
} from '../src/index.ts';

describe('@angora-js/cli - Generator & Scaffolding Tooling', () => {
  test('should format kebab-case and PascalCase strings accurately', () => {
    expect(toKebabCase('userProfile')).toBe('user-profile');
    expect(toKebabCase('UserProfile')).toBe('user-profile');
    expect(toKebabCase('card')).toBe('card');

    expect(toPascalCase('user-profile')).toBe('UserProfile');
    expect(toPascalCase('header-nav')).toBe('HeaderNav');
  });

  test('should generate standalone component and test file', () => {
    const res = generateComponent('user-card');

    expect(res.componentFileName).toBe('user-card.component.ts');
    expect(res.componentCode).toContain(`selector: 'app-user-card'`);
    expect(res.componentCode).toContain(`class UserCardComponent`);
    expect(res.componentCode).toContain(`title = signal('UserCard Works!');`);
    expect(res.componentCode).toContain(`.user-card-container`);

    expect(res.testFileName).toBe('user-card.component.test.ts');
    expect(res.testCode).toContain(`renderComponent(UserCardComponent)`);
    expect(res.testCode).toContain(`UserCard Works!`);
  });

  test('should generate complete project scaffold template files', () => {
    const files = getProjectTemplate('my-angora-app');

    expect(files['package.json']).toBeDefined();
    expect(files['package.json']).toContain('my-angora-app');
    expect(files['package.json']).toContain('@angora-js/core');
    expect(files['package.json']).toContain('"typescript": "^7.0.2"');
    expect(files['package.json']).toContain('"vite": "^8.2.2"');

    expect(files['tsconfig.json']).toBeDefined();
    expect(files['vite.config.ts']).toContain('@angora-js/vite-plugin');
    expect(files['src/main.ts']).toContain('bootstrapApplication');
    expect(files['src/app.component.ts']).toContain('@Component');
  });

  test('should validate valid templates and generate TCB for LSP', () => {
    const res = validateTemplate(`
      <div class="card">
        <h1>{{ title() }}</h1>
        <button (click)="submit()">Send</button>
      </div>
    `);

    expect(res.valid).toBe(true);
    expect(res.diagnostics.length).toBe(0);
    expect(res.tcbCode).toBeDefined();
    expect(res.tcbCode).toContain('ctx.title()');
    expect(res.tcbCode).toContain('const __angora_pipe: any = null!;');
    expect(res.mappings).toBeDefined();
    expect(res.mappings!.length).toBeGreaterThan(0);
  });

  test('should validate template imports and diagnose missing components', () => {
    const res = validateTemplate(
      `
      <div>
        <custom-widget></custom-widget>
      </div>
    `,
      { className: 'MyComp', imports: [] }
    );

    expect(res.valid).toBe(false);
    expect(res.diagnostics.length).toBeGreaterThan(0);
    expect(res.diagnostics[0].message).toContain('NG8001');
  });
});
