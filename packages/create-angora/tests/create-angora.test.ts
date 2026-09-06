import { describe, test, expect, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { getTemplateFiles, scaffoldAngoraProject } from '../src/index.ts';

describe('create-angora - Project Scaffolding CLI Engine', () => {
  const testOutputDir = path.resolve(__dirname, '../.temp-test-project');

  afterEach(() => {
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  test('should generate valid file structure for minimal template', () => {
    const files = getTemplateFiles('my-angora-app', 'minimal');
    const relativePaths = files.map(f => f.relativePath);

    expect(relativePaths).toContain('package.json');
    expect(relativePaths).toContain('tsconfig.json');
    expect(relativePaths).toContain('vite.config.ts');
    expect(relativePaths).toContain('index.html');
    expect(relativePaths).toContain('src/main.ts');
    expect(relativePaths).toContain('src/app.component.ts');

    const pkg = JSON.parse(files.find(f => f.relativePath === 'package.json')!.content);
    expect(pkg.name).toBe('my-angora-app');
    expect(pkg.dependencies['@angora-js/core']).toBeDefined();
    expect(pkg.dependencies['@angora-js/runtime']).toBeDefined();
  });

  test('should generate enterprise template with forms, router, and query packages', () => {
    const files = getTemplateFiles('enterprise-suite', 'enterprise');
    const pkg = JSON.parse(files.find(f => f.relativePath === 'package.json')!.content);

    expect(pkg.dependencies['@angora-js/router']).toBeDefined();
    expect(pkg.dependencies['@angora-js/forms']).toBeDefined();
    expect(pkg.dependencies['@angora-js/ui']).toBeDefined();
    expect(pkg.dependencies['@angora-js/query']).toBeDefined();
  });

  test('should scaffold files to disk and verify readability', () => {
    const created = scaffoldAngoraProject({
      projectName: 'disk-test-app',
      targetDir: testOutputDir,
      template: 'minimal',
    });

    expect(created.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(testOutputDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(testOutputDir, 'src/app.component.ts'))).toBe(true);

    const compContent = fs.readFileSync(path.join(testOutputDir, 'src/app.component.ts'), 'utf-8');
    expect(compContent).toContain('@Component');
    expect(compContent).toContain('AppComponent');
    expect(compContent).toContain('count = signal(0)');
  });
});
