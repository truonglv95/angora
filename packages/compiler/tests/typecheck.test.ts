import { describe, test, expect } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import {
  buildTcbWorkspace,
  translateDiagnostics,
  runTypecheck,
  type TcbWorkspaceRegistry,
} from '../src/typecheck.ts';

describe('@angora-js/compiler - TypeScript 7 & Native Rust OXC Typecheck Pipeline', () => {
  const rootDir = path.resolve(__dirname, '../../..');

  test('should build shadow TCB workspace with synthetic TCB files and tsconfig', () => {
    const registry = buildTcbWorkspace(rootDir);

    expect(registry.shadowFiles.size).toBeGreaterThan(0);
    expect(fs.existsSync(registry.tcbDir)).toBe(true);
    expect(fs.existsSync(registry.tsconfigPath)).toBe(true);

    // Verify at least one component shadow file exists and is populated
    const firstShadow = Array.from(registry.shadowFiles.values())[0];
    expect(firstShadow).toBeDefined();
    expect(firstShadow.className).toBeTruthy();
    expect(firstShadow.mappings.length).toBeGreaterThan(0);
    expect(fs.existsSync(firstShadow.shadowFilePath)).toBe(true);

    const shadowContent = fs.readFileSync(firstShadow.shadowFilePath, 'utf-8');
    expect(shadowContent).toContain(`__angora_tcb_${firstShadow.className}`);
  });

  test('should reverse-map synthetic TCB diagnostic coordinates back to user template line and column', () => {
    const registry = buildTcbWorkspace(rootDir);
    const formsDemo = Array.from(registry.shadowFiles.values()).find(
      s => s.className === 'FormsDemoComponent'
    );

    expect(formsDemo).toBeDefined();
    if (!formsDemo) return;

    // Simulate a TypeScript 7 Go compiler error line on the shadow file
    const shadowLines = fs.readFileSync(formsDemo.shadowFilePath, 'utf-8').split('\n');
    const customerCtrlLineIndex = shadowLines.findIndex(l => l.includes('customerControl'));
    const mockLine = customerCtrlLineIndex !== -1 ? customerCtrlLineIndex + 1 : 17;
    const mockTscOutput = `${formsDemo.shadowFilePath}(${mockLine},40): error TS2339: Property 'stat' does not exist on type 'FormControl<string>'.`;

    const diags = translateDiagnostics(mockTscOutput, registry);
    expect(diags.length).toBe(1);

    const diag = diags[0];
    expect(diag.file).toBe(formsDemo.origFilePath);
    expect(diag.code).toBe('TS2339');
    expect(diag.severity).toBe('error');
    expect(diag.source).toBe('tsc-typecheck');
    expect(diag.line).toBeGreaterThan(1);
    expect(diag.column).toBeGreaterThan(1);
    expect(diag.codeFrame).toBeDefined();
    expect(diag.codeFrame).toContain('customerControl');
  });

  test('should run full end-to-end typecheck with native Go tsc and return 0 errors on clean workspace', async () => {
    const result = await runTypecheck(rootDir);

    if (!result.success || result.diagnostics.length > 0) {
      console.error(
        'TYPECHECK CLEAN WORKSPACE FAILURE DIAGNOSTICS:\n' +
          (result.formattedOutput || JSON.stringify(result.diagnostics, null, 2))
      );
    }

    expect(result.durationMs).toBeLessThan(5000); // Super fast native speed
    expect(result.componentsChecked).toBeGreaterThan(0);
    expect(result.success).toBe(true);
    expect(result.diagnostics.length).toBe(0);
  });

  test('should detect template type errors on custom components and pipes with native tsc', async () => {
    const testDir = path.resolve(rootDir, 'target/fixtures/typecheck-errors');
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });

    let extendsPath = path
      .relative(testDir, path.resolve(rootDir, 'tsconfig.json'))
      .replace(/\\/g, '/');
    if (!extendsPath.startsWith('.')) extendsPath = './' + extendsPath;
    const tsconfig = {
      extends: extendsPath,
    };
    fs.writeFileSync(path.join(testDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

    const compCode = `import { Component, Pipe, type PipeTransform, input } from '@angora-js/core';

@Pipe({ name: 'uppercase' })
export class UpperCasePipe implements PipeTransform {
  transform(value: string): string {
    return value.toUpperCase();
  }
}

@Component({
  selector: 'app-child',
  template: '<div>{{ count() }}</div>',
})
export class ChildComponent {
  count = input.required<number>();
}

@Component({
  selector: 'app-parent',
  imports: [ChildComponent, UpperCasePipe],
  template: \`
    <div>
      <app-child [count]="'not-a-number'" />
      <app-child [nonExistentProp]="123" />
      <span>{{ count | uppercase }}</span>
    </div>
  \`,
})
export class ParentComponent {
  count = 42;
}
`;
    fs.writeFileSync(path.join(testDir, 'src/parent.component.ts'), compCode);

    try {
      const result = await runTypecheck(testDir);
      expect(result.success).toBe(false);
      expect(result.diagnostics.length).toBeGreaterThanOrEqual(2);

      // Verify input type mismatch error on [count] or pipe arg
      const mismatchError = result.diagnostics.find(
        d => d.message.includes('not assignable') || d.code === 'TS2345' || d.code === 'TS2322'
      );
      expect(mismatchError).toBeDefined();
      expect(mismatchError?.codeFrame).toBeDefined();

      // Verify non-existent property on custom element
      const propError = result.diagnostics.find(
        d => d.message.includes('nonExistentProp') || d.code === 'TS2345' || d.code === 'TS2339'
      );
      expect(propError).toBeDefined();
      expect(propError?.codeFrame).toBeDefined();
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });
});
