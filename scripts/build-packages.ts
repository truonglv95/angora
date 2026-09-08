import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = path.resolve(import.meta.dir, '..');
const PACKAGES_DIR = path.join(ROOT_DIR, 'packages');

const PACKAGES_ORDER = [
  'core',
  'runtime',
  'compiler',
  'router',
  'forms',
  'http',
  'rxjs-interop',
  'animations',
  'server',
  'start',
  'query',
  'primitives',
  'i18n',
  'ui',
  'testing',
  'devtools',
  'cli',
  'vite-plugin',
  'prettier-plugin-angora',
  'eslint-plugin-angora',
  'create-angora',
];

const EXTERNALS = [
  '@angora-js/*',
  'rxjs',
  'rxjs/*',
  'vite',
  'prettier',
  'eslint',
  'happy-dom',
  '@types/*',
  'typescript',
];

interface BuildStats {
  name: string;
  jsSize: string;
  dtsCount: number;
  durationMs: number;
}

async function buildPackage(pkgName: string): Promise<BuildStats | null> {
  const pkgDir = path.join(PACKAGES_DIR, pkgName);
  const pkgJsonPath = path.join(pkgDir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) return null;

  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const srcIndex = path.join(pkgDir, 'src/index.ts');
  const distDir = path.join(pkgDir, 'dist');

  if (!fs.existsSync(srcIndex)) return null;

  const startTime = performance.now();

  // 1. Bundle JavaScript via Bun Build with native Angora OXC compiler transform
  const bin = path.resolve(ROOT_DIR, 'target/release/angora_oxc');
  const debugBin = path.resolve(ROOT_DIR, 'target/debug/angora_oxc');
  const compilerBin = fs.existsSync(bin) ? bin : fs.existsSync(debugBin) ? debugBin : null;

  const angoraOxcPlugin = {
    name: 'angora-oxc-loader',
    setup(build: any) {
      build.onLoad({ filter: /\.(ts|js)$/ }, async (args: any) => {
        if (!compilerBin) return undefined;
        const code = await Bun.file(args.path).text();
        if (
          code.includes('@Component') ||
          code.includes('@Directive') ||
          code.includes('@Pipe') ||
          code.includes('@Injectable')
        ) {
          const res = spawnSync(compilerBin, ['-', '--transform'], {
            input: code,
            encoding: 'utf8',
          });
          if (res.status === 0 && res.stdout) {
            return { contents: res.stdout, loader: 'ts' };
          }
        }
        return undefined;
      });
    },
  };

  const isNodeOnly = [
    'compiler',
    'cli',
    'vite-plugin',
    'create-angora',
    'server',
    'start',
    'prettier-plugin-angora',
    'eslint-plugin-angora',
  ].includes(pkgName);
  const target = isNodeOnly ? 'node' : 'browser';

  const buildRes = await Bun.build({
    entrypoints: [srcIndex],
    outdir: distDir,
    format: 'esm',
    target: target as any,
    external: EXTERNALS,
    plugins: [angoraOxcPlugin],
  });

  if (!buildRes.success) {
    console.error(`❌ Failed to build JS for ${pkgName}:`, buildRes.logs);
    return null;
  }

  // If create-angora or cli, also bundle bin
  if (pkgName === 'create-angora') {
    const binSrc = path.join(pkgDir, 'bin/index.js');
    if (fs.existsSync(binSrc)) {
      fs.mkdirSync(distDir, { recursive: true });
      fs.copyFileSync(binSrc, path.join(distDir, 'cli.js'));
    }
  }

  // 2. Ensure tsconfig.json exists and emit TypeScript Declarations (.d.ts)
  const tsconfigPath = path.join(pkgDir, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) {
    const defaultTsconfig = {
      extends: '../../tsconfig.json',
      compilerOptions: {
        noEmit: false,
        declaration: true,
        emitDeclarationOnly: true,
        rootDir: './src',
        outDir: './dist',
      },
      include: ['src/**/*'],
    };
    fs.writeFileSync(tsconfigPath, JSON.stringify(defaultTsconfig, null, 2));
  }

  let dtsCount = 0;
  const tscRes = spawnSync('bun', ['tsc', '-p', tsconfigPath], {
    cwd: pkgDir,
    stdio: 'pipe',
    encoding: 'utf8',
  });

  if (!fs.existsSync(path.join(distDir, 'index.d.ts'))) {
    // Fallback: generate index.d.ts if declaration had differences
    fs.writeFileSync(path.join(distDir, 'index.d.ts'), `export * from '../src/index.ts';\n`);
  }

  if (fs.existsSync(distDir)) {
    dtsCount = fs.readdirSync(distDir).filter(f => f.endsWith('.d.ts')).length;
  }

  // 3. Copy SCSS assets if @angora-js/ui
  if (pkgName === 'ui') {
    const scssSrc = path.join(pkgDir, 'scss');
    const scssDist = path.join(distDir, 'scss');
    if (fs.existsSync(scssSrc)) {
      fs.cpSync(scssSrc, scssDist, { recursive: true });
    }
  }

  const jsFile = path.join(distDir, 'index.js');
  let jsSize = '0 KB';
  if (fs.existsSync(jsFile)) {
    const bytes = fs.statSync(jsFile).size;
    jsSize = `${(bytes / 1024).toFixed(1)} KB`;
  }

  const durationMs = Math.round(performance.now() - startTime);
  return {
    name: pkgJson.name,
    jsSize,
    dtsCount,
    durationMs,
  };
}

function cleanSrcDts() {
  for (const pkg of PACKAGES_ORDER) {
    const srcDir = path.join(PACKAGES_DIR, pkg, 'src');
    if (fs.existsSync(srcDir)) {
      const files = fs.readdirSync(srcDir, { recursive: true }) as string[];
      for (const file of files) {
        if (typeof file === 'string' && file.endsWith('.d.ts')) {
          try {
            fs.unlinkSync(path.join(srcDir, file));
          } catch {}
        }
      }
    }
  }
}

async function run() {
  console.log('📦 Angora Framework — Multi-Package Distribution Builder');
  console.log('========================================================\n');

  const totalStart = performance.now();
  const results: BuildStats[] = [];

  for (const pkg of PACKAGES_ORDER) {
    process.stdout.write(`Building ${pkg.padEnd(24)} `);
    const stat = await buildPackage(pkg);
    if (stat) {
      results.push(stat);
      console.log(`✅ ${stat.jsSize.padStart(8)} (${stat.dtsCount} .d.ts) in ${stat.durationMs}ms`);
    } else {
      console.log(`⏭️ Skipped`);
    }
  }

  cleanSrcDts();

  const totalTime = Math.round(performance.now() - totalStart);
  console.log('\n========================================================');
  console.log(
    `🎉 All ${results.length} packages built successfully in ${(totalTime / 1000).toFixed(2)}s!`
  );
}

run();
