import { describe, test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { angora } from '../src/index.ts';

describe('@angora-js/vite-plugin - HMR & Transformer', () => {
  test('should inject import.meta.hot.accept and __sourceFile in dev mode', async () => {
    const plugin = angora({
      hmr: true,
      inspector: true,
    });

    // Simulate configResolved in dev mode
    if (typeof plugin.configResolved === 'function') {
      (plugin.configResolved as any)({
        command: 'serve',
        mode: 'development',
      });
    }

    const dir = mkdtempSync(join(tmpdir(), 'angora-test-'));
    const testFile = join(dir, 'counter.component.ts');
    const sourceCode = `
import { Component, signal } from '@angora-js/core';

@Component({
  selector: 'app-counter',
  template: '<div>{{ count() }}</div>'
})
export class CounterComponent {
  count = signal(0);
}
`;
    writeFileSync(testFile, sourceCode, 'utf-8');

    try {
      if (typeof plugin.transform === 'function') {
        const result: any = await (plugin.transform as any).call(
          {
            error(msg: string) {
              throw new Error(msg);
            },
          },
          sourceCode,
          testFile
        );

        expect(result).not.toBeNull();
        expect(result.code).toContain('import.meta.hot');
        expect(result.code).toContain('import.meta.hot.accept');
        expect(result.code).toContain('applyHMRUpdate');
        expect(result.code).toContain('__sourceFile');
        expect(result.code).toContain(testFile);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('should respect hmr: false option', async () => {
    const plugin = angora({
      hmr: false,
      inspector: false,
    });

    if (typeof plugin.configResolved === 'function') {
      (plugin.configResolved as any)({
        command: 'serve',
        mode: 'development',
      });
    }

    const dir = mkdtempSync(join(tmpdir(), 'angora-test-'));
    const testFile = join(dir, 'counter.component.ts');
    const sourceCode = `
import { Component, signal } from '@angora-js/core';

@Component({
  selector: 'app-counter',
  template: '<div>{{ count() }}</div>'
})
export class CounterComponent {
  count = signal(0);
}
`;
    writeFileSync(testFile, sourceCode, 'utf-8');

    try {
      if (typeof plugin.transform === 'function') {
        const result: any = await (plugin.transform as any).call(
          {
            error(msg: string) {
              throw new Error(msg);
            },
          },
          sourceCode,
          testFile
        );

        expect(result).not.toBeNull();
        expect(result.code).not.toContain('import.meta.hot.accept');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
