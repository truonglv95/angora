import fs from 'node:fs';
import path from 'node:path';

export type TemplateType = 'minimal' | 'fullstack' | 'enterprise' | 'tailwind';

export interface ScaffoldOptions {
  projectName: string;
  targetDir: string;
  template?: TemplateType;
}

export interface GeneratedProjectFile {
  relativePath: string;
  content: string;
}

/**
 * Generates project files for the specified Angora template
 */
export function getTemplateFiles(
  projectName: string,
  template: TemplateType = 'minimal'
): GeneratedProjectFile[] {
  const files: GeneratedProjectFile[] = [];

  const packageJson = {
    name: projectName,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview',
    },
    dependencies: {
      '@angora-js/core': '^0.1.0',
      '@angora-js/runtime': '^0.1.0',
      ...(template === 'fullstack'
        ? { '@angora-js/start': '^0.1.0', '@angora-js/server': '^0.1.0' }
        : {}),
      ...(template === 'enterprise'
        ? {
            '@angora-js/router': '^0.1.0',
            '@angora-js/forms': '^0.1.0',
            '@angora-js/ui': '^0.1.0',
            '@angora-js/query': '^0.1.0',
          }
        : {}),
      ...(template === 'tailwind' ? { '@angora-js/primitives': '^0.1.0' } : {}),
    },
    devDependencies: {
      '@angora-js/compiler': '^0.1.0',
      '@angora-js/vite-plugin': '^0.1.0',
      typescript: '^7.0.0',
      vite: '^8.0.0',
    },
  };

  files.push({
    relativePath: 'package.json',
    content: JSON.stringify(packageJson, null, 2) + '\n',
  });

  const tsconfig = {
    compilerOptions: {
      target: 'ESNext',
      module: 'ESNext',
      moduleResolution: 'bundler',
      experimentalDecorators: true,
      useDefineForClassFields: false,
      strict: true,
      skipLibCheck: true,
    },
    include: ['src/**/*'],
  };

  files.push({
    relativePath: 'tsconfig.json',
    content: JSON.stringify(tsconfig, null, 2) + '\n',
  });

  files.push({
    relativePath: 'vite.config.ts',
    content: `import { defineConfig } from 'vite';
import { angora } from '@angora-js/vite-plugin';

export default defineConfig({
  plugins: [angora()],
});
`,
  });

  files.push({
    relativePath: 'index.html',
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${projectName}</title>
</head>
<body>
  <app-root></app-root>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
`,
  });

  files.push({
    relativePath: 'src/main.ts',
    content: `import { bootstrapApplication } from '@angora-js/runtime';
import { AppComponent } from './app.component.ts';

bootstrapApplication(AppComponent);
`,
  });

  files.push({
    relativePath: 'src/app.component.ts',
    content: `import { Component, signal, computed } from '@angora-js/core';

@Component({
  selector: 'app-root',
  template: \`
    <main style="font-family: system-ui, sans-serif; padding: 2rem; max-width: 600px; margin: 0 auto; text-align: center;">
      <h1>🐾 Welcome to \${'${projectName}'}</h1>
      <p style="color: #64748b;">Powered by @angora Zero-VDOM and Native Rust Compiler</p>
      
      <div style="margin: 2rem 0; padding: 1.5rem; border: 1px solid #e2e8f0; border-radius: 8px;">
        <p>Reactive Signal Count: <strong>{{ count() }}</strong> (Double: {{ double() }})</p>
        <button style="padding: 0.5rem 1rem; border-radius: 4px; background: #6366f1; color: white; border: none; cursor: pointer;" (click)="increment()">
          Increment Signal
        </button>
      </div>
    </main>
  \`,
})
export class AppComponent {
  count = signal(0);
  double = computed(() => this.count() * 2);

  increment() {
    this.count.update(n => n + 1);
  }
}
`,
  });

  return files;
}

/**
 * Scaffolds an Angora application directory
 */
export function scaffoldAngoraProject(options: ScaffoldOptions): string[] {
  const { projectName, targetDir, template = 'minimal' } = options;
  const files = getTemplateFiles(projectName, template);
  const createdPaths: string[] = [];

  for (const f of files) {
    const fullPath = path.join(targetDir, f.relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, f.content, 'utf-8');
    createdPaths.push(fullPath);
  }

  return createdPaths;
}
