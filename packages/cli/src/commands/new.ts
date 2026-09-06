export interface ProjectFiles {
  [filePath: string]: string;
}

export function getProjectTemplate(projectName: string): ProjectFiles {
  return {
    'package.json': JSON.stringify(
      {
        name: projectName,
        version: '0.1.0',
        private: true,
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'vite build',
          preview: 'vite preview',
          test: 'bun test',
        },
        dependencies: {
          '@angora-js/core': '^0.1.0',
          '@angora-js/runtime': '^0.1.0',
          '@angora-js/router': '^0.1.0',
        },
        devDependencies: {
          '@angora-js/compiler': '^0.1.0',
          '@angora-js/vite-plugin': '^0.1.0',
          '@angora-js/testing': '^0.1.0',
          typescript: '^7.0.2',
          vite: '^8.2.2',
        },
      },
      null,
      2
    ),
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: {
          target: 'ESNext',
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          jsx: 'preserve',
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          skipLibCheck: true,
        },
        include: ['src/**/*.ts'],
      },
      null,
      2
    ),
    'vite.config.ts': `import { defineConfig } from 'vite';
import { angora } from '@angora-js/vite-plugin';

export default defineConfig({
  plugins: [angora()],
});
`,
    'index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
    'src/main.ts': `import { bootstrapApplication } from '@angora-js/runtime';
import { AppComponent } from './app.component.ts';

bootstrapApplication(AppComponent, '#app');
`,
    'src/app.component.ts': `import { Component, signal } from '@angora-js/core';

@Component({
  selector: 'app-root',
  template: \`
    <div class="app-container">
      <h1>{{ title() }}</h1>
      <p>Fine-grained reactive application powered by Angora.</p>
    </div>
  \`,
  styles: [\`
    .app-container {
      font-family: system-ui, sans-serif;
      max-width: 800px;
      margin: 2rem auto;
      padding: 1.5rem;
    }
  \`],
})
export class AppComponent {
  title = signal('Welcome to ${projectName}!');
}
`,
  };
}
