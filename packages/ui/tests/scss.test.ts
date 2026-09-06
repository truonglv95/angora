import { describe, test, expect } from 'bun:test';
import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

describe('@angora-js/ui - SCSS Architecture & Mixins', () => {
  const scssDir = resolve(__dirname, '../scss');

  test('should provide all SCSS partials, variables, functions, and mixins', () => {
    expect(existsSync(resolve(scssDir, '_variables.scss'))).toBe(true);
    expect(existsSync(resolve(scssDir, '_functions.scss'))).toBe(true);
    expect(existsSync(resolve(scssDir, '_mixins.scss'))).toBe(true);
    expect(existsSync(resolve(scssDir, 'index.scss'))).toBe(true);

    const components = ['dialog', 'select', 'menu', 'toast', 'tabs', 'accordion', 'tooltip'];
    for (const comp of components) {
      expect(existsSync(resolve(scssDir, `components/_${comp}.scss`))).toBe(true);
    }
  });

  test('should compile SCSS master index without syntax errors using sass', () => {
    const res = spawnSync('bun', ['x', 'sass', resolve(scssDir, 'index.scss'), '--no-source-map'], {
      encoding: 'utf-8',
    });

    expect(res.status).toBe(0);
    const output = res.stdout;
    expect(output).toContain('.angora-dialog-backdrop');
    expect(output).toContain('.angora-select');
    expect(output).toContain('.angora-menu');
    expect(output).toContain('.angora-toast-container');
    expect(output).toContain('.angora-tab-group');
    expect(output).toContain('.angora-accordion');
    expect(output).toContain('.angora-tooltip');
    expect(output).toContain('var(--angora-surface');
  });

  test('should allow custom theme overrides via SCSS mixin', () => {
    const testScss = `
      @use '${resolve(scssDir, 'index.scss')}' as angora;
      @include angora.theme((
        'primary': #8b5cf6,
        'radius-md': 10px,
      ));
    `;

    const res = spawnSync('bun', ['x', 'sass', '--stdin', '--no-source-map'], {
      input: testScss,
      encoding: 'utf-8',
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain('--angora-primary: #8b5cf6');
    expect(res.stdout).toContain('--angora-radius-md: 10px');
    expect(res.stdout).toContain('data-theme=dark');
  });
});
