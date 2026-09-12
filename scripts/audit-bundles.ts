import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

interface BundleStat {
  name: string;
  category: string;
  rawBytes: number;
  gzipBytes: number;
  brotliBytes: number;
  rawKb: string;
  gzipKb: string;
  brotliKb: string;
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

async function bundleSnippet(
  name: string,
  category: string,
  code: string,
  externals: string[] = []
): Promise<BundleStat> {
  const tmpDir = path.resolve(import.meta.dir, '../.bundle_tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const entryFile = path.join(tmpDir, `${name.replace(/[^a-zA-Z0-9]/g, '_')}.ts`);
  fs.writeFileSync(entryFile, code, 'utf8');

  const buildRes = await Bun.build({
    entrypoints: [entryFile],
    format: 'esm',
    target: 'browser',
    minify: true,
    external: externals,
  });

  if (!buildRes.success) {
    console.error(`❌ Build failed for ${name}:`, buildRes.logs);
    throw new Error(`Build failed for ${name}`);
  }

  const outputCode = await buildRes.outputs[0].text();
  const rawBytes = Buffer.byteLength(outputCode, 'utf8');
  const gzipBytes = zlib.gzipSync(outputCode, { level: 9 }).length;
  const brotliBytes = zlib.brotliCompressSync(outputCode).length;

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });

  return {
    name,
    category,
    rawBytes,
    gzipBytes,
    brotliBytes,
    rawKb: formatBytes(rawBytes),
    gzipKb: formatBytes(gzipBytes),
    brotliKb: formatBytes(brotliBytes),
  };
}

async function runAudit() {
  console.log('\n===============================================================');
  console.log('📦 Angora Framework — Production Bundle & Tree-Shaking Audit');
  console.log('===============================================================\n');

  const stats: BundleStat[] = [];

  const root = path.resolve(import.meta.dir, '..');

  // 1. Core Signals Standalone
  stats.push(
    await bundleSnippet(
      'Core: Signals Primitives (signal, computed, effect)',
      'Reactivity Core',
      `
      import { signal, computed, effect, batch, untracked } from '${root}/packages/core/src/signals.ts';
      const count = signal(0);
      const double = computed(() => count() * 2);
      effect(() => {
        console.log(double());
      });
      batch(() => count.inc(1));
    `
    )
  );

  // 2. Core Dependency Injection Standalone
  stats.push(
    await bundleSnippet(
      'Core: Dependency Injection (Injector, Tokens, inject)',
      'DI Engine',
      `
      import { Injector, InjectionToken, inject, Injectable } from '${root}/packages/core/src/di.ts';
      const TOKEN = new InjectionToken<string>('test');
      class MyService {}
      const injector = Injector.create({
        providers: [{ provide: TOKEN, useValue: 'hello' }, MyService]
      });
      console.log(injector.get(TOKEN));
    `
    )
  );

  // 3. Runtime DOM Cloning Engine Standalone
  stats.push(
    await bundleSnippet(
      'Runtime: DOM Cloning & Micro-reconciler Engine',
      'Runtime Engine',
      `
      import { template, bindText, bindProp } from '${root}/packages/runtime/src/dom.ts';
      import { signal } from '${root}/packages/core/src/signals.ts';
      const count = signal(0);
      const tpl = template('<div><span></span></div>');
      const rootEl = tpl();
      bindText(rootEl.firstChild as HTMLElement, () => String(count()));
    `
    )
  );

  // 4. Router Standalone
  stats.push(
    await bundleSnippet(
      'Router: SPA Navigation, Guards & Params',
      'Routing',
      `
      import { provideRouter, Router, useRouter, useParams } from '${root}/packages/router/src/index.ts';
      const providers = provideRouter([
        { path: '/', component: () => {} },
        { path: '/user/:id', component: () => {} }
      ]);
      console.log(providers);
    `
    )
  );

  // 5. Reactive Forms Standalone
  stats.push(
    await bundleSnippet(
      'Forms: Reactive Forms (FormControl, FormGroup, Validators)',
      'Forms Engine',
      `
      import { form, required, email, min } from '${root}/packages/forms/src/index.ts';
      const userForm = form({
        name: ['', required],
        email: ['', [required, email]],
        age: [18, min(18)]
      });
      userForm.name.set('John');
      console.log(userForm.valid(), userForm.value());
    `
    )
  );

  // 6. Query / SWR Standalone
  stats.push(
    await bundleSnippet(
      'Query: Signals-based SWR Caching & Optimistic Mutations',
      'Data Fetching',
      `
      import { useQuery, useMutation, QueryClient } from '${root}/packages/query/src/index.ts';
      const client = new QueryClient();
      console.log(client);
    `
    )
  );

  // 7. Complete Hello World Component (Core + Runtime)
  stats.push(
    await bundleSnippet(
      'Application: "Hello World" Minimal SPA',
      'Full App Scenario',
      `
      import { Component, signal } from '${root}/packages/core/src/index.ts';
      import { bootstrapApplication } from '${root}/packages/runtime/src/index.ts';

      @Component({
        template: '<button (click)="count.inc()">Count: {{ count() }}</button>'
      })
      export class App {
        count = signal(0);
      }
      bootstrapApplication(App);
    `
    )
  );

  // 8. Complete Enterprise App (Core + Runtime + Router + Forms + Query)
  stats.push(
    await bundleSnippet(
      'Application: Full Enterprise Suite (Core+Router+Forms+Query)',
      'Full App Scenario',
      `
      import { Component, signal } from '${root}/packages/core/src/index.ts';
      import { bootstrapApplication } from '${root}/packages/runtime/src/index.ts';
      import { provideRouter, useRouter } from '${root}/packages/router/src/index.ts';
      import { form, required } from '${root}/packages/forms/src/index.ts';
      import { useQuery } from '${root}/packages/query/src/index.ts';

      @Component({
        template: '<div class="app"><h1>Enterprise</h1></div>'
      })
      export class App {
        search = signal('');
        loginForm = form({
          user: ['', required],
          pass: ['', required]
        });
      }
      bootstrapApplication(App, '#app', {
        providers: [provideRouter([{ path: '/', component: App }])]
      });
    `
    )
  );

  // 9. Krausest Benchmark Production Build Size (reading dist)
  const krausestDistJs = path.resolve(import.meta.dir, '../benchmarks/krausest/dist/assets');
  if (fs.existsSync(krausestDistJs)) {
    const files = fs.readdirSync(krausestDistJs).filter(f => f.endsWith('.js'));
    if (files.length > 0) {
      const code = fs.readFileSync(path.join(krausestDistJs, files[0]), 'utf8');
      const rawBytes = Buffer.byteLength(code, 'utf8');
      const gzipBytes = zlib.gzipSync(code, { level: 9 }).length;
      const brotliBytes = zlib.brotliCompressSync(code).length;
      stats.push({
        name: 'Benchmark: Krausest Real Production Bundle (Vite Dist)',
        category: 'Production Dist',
        rawBytes,
        gzipBytes,
        brotliBytes,
        rawKb: formatBytes(rawBytes),
        gzipKb: formatBytes(gzipBytes),
        brotliKb: formatBytes(brotliBytes),
      });
    }
  }

  // Print results table
  console.log('| Package / Scenario | Category | Raw Size | Gzip Size | Brotli Size | Status |');
  console.log('| :--- | :--- | :---: | :---: | :---: | :---: |');
  for (const s of stats) {
    const status = s.gzipBytes < 15 * 1024 ? '🟢 <15KB' : '🟡 >15KB';
    console.log(
      `| **${s.name}** | ${s.category} | ${s.rawKb} | **${s.gzipKb}** | ${s.brotliKb} | ${status} |`
    );
  }

  console.log('\n===============================================================\n');

  return stats;
}

if (import.meta.main) {
  runAudit().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
