import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = path.resolve(import.meta.dir, '..');
const PACKAGES_DIR = path.join(ROOT_DIR, 'packages');

const COMMON_METADATA = {
  author: 'Angora Team <team@angora.dev>',
  license: 'MIT',
  repository: {
    type: 'git',
    url: 'git+https://github.com/angora-js/angora.git',
  },
  bugs: {
    url: 'https://github.com/angora-js/angora/issues',
  },
  homepage: 'https://angora.dev',
  publishConfig: {
    access: 'public',
  },
};

const PKG_DESCRIPTIONS: Record<string, string> = {
  '@angora-js/core':
    'Fine-grained reactive signals, dependency injection, and modern component primitives for Angora',
  '@angora-js/compiler':
    'High-performance template compiler, scoped CSS engine, and synthetic TCB generator for Angora',
  '@angora-js/runtime':
    'Zero-Virtual DOM template cloning runtime, DOM binding, and Click-to-Source inspector for Angora',
  '@angora-js/router':
    'Enterprise reactive SPA router with lazy loading, route guards, resolvers, and HTML5 View Transitions',
  '@angora-js/forms':
    'Signal-powered reactive form controls, groups, dynamic FormArray, and async validation for Angora',
  '@angora-js/http':
    'Enterprise HTTP client with chainable interceptors and reactive resource adapter for Angora',
  '@angora-js/rxjs-interop':
    'Bidirectional reactive adapters between RxJS Observables and Angora Signals',
  '@angora-js/animations':
    'Hardware-accelerated FLIP list animations and micro-transitions for Angora',
  '@angora-js/server':
    'Headless SSR, Web Streams streaming SSR, TransferState, and Event Replay hydration for Angora',
  '@angora-js/start':
    'Full-stack meta-framework for Angora with file-based routing, server$ RPC, and edge adapters',
  '@angora-js/query':
    'Signals-powered enterprise data fetching, SWR, optimistic mutations, and zero-waterfall SSR dehydration',
  '@angora-js/primitives':
    'Accessible WAI-ARIA 1.2 headless UI primitives and O(1) 100k-row virtual scrolling engine',
  '@angora-js/i18n':
    'Signal-driven internationalization, ICU MessageFormat plurals/select, and locale-aware pipes',
  '@angora-js/ui':
    'Accessible dialog, toast, select, tabs, menu, and SCSS design tokens for Angora',
  '@angora-js/testing':
    'Testing harness with TestBed, ComponentFixture, signalSpy, and userEvent for Angora',
  '@angora-js/devtools':
    'Official Chrome DevTools browser extension and state inspector for Angora',
  '@angora-js/cli': 'Official command-line interface for Angora projects and code generators',
  '@angora-js/vite-plugin':
    'Official Vite plugin with in-process native Rust OXC compiler bridge for Angora',
  '@angora-js/prettier-plugin':
    'Official Prettier plugin for inline component templates and modern control flow in Angora',
  '@angora-js/eslint-plugin':
    'Official ESLint plugin with rules for Angora signals, effects, and template imports',
  'create-angora':
    'Official project scaffolding CLI for creating new Angora applications in seconds',
};

function updatePackages() {
  const dirs = fs.readdirSync(PACKAGES_DIR);

  for (const dir of dirs) {
    const pkgJsonPath = path.join(PACKAGES_DIR, dir, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) continue;

    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    const name = pkg.name;

    pkg.description = PKG_DESCRIPTIONS[name] || pkg.description || 'Angora Framework package';
    pkg.author = COMMON_METADATA.author;
    pkg.license = COMMON_METADATA.license;
    pkg.repository = COMMON_METADATA.repository;
    pkg.bugs = COMMON_METADATA.bugs;
    pkg.homepage = COMMON_METADATA.homepage;
    pkg.publishConfig = COMMON_METADATA.publishConfig;

    pkg.main = './dist/index.js';
    pkg.module = './dist/index.js';
    pkg.types = './dist/index.d.ts';

    pkg.exports = {
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
        default: './dist/index.js',
      },
    };

    if (dir === 'ui') {
      pkg.exports['./scss/*'] = './dist/scss/*';
      pkg.exports['./scss'] = './dist/scss/index.scss';
    }

    if (dir === 'create-angora') {
      pkg.bin = {
        'create-angora': './dist/cli.js',
      };
    }

    if (dir === 'cli') {
      pkg.bin = {
        angora: './bin/angora.js',
      };
    }

    fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`Updated package.json for ${name}`);
  }
}

updatePackages();
