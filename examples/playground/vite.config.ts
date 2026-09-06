import { defineConfig } from 'vite';
import { angora } from '@angora-js/vite-plugin';

import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@angora-js/core': path.resolve(import.meta.dirname, '../../packages/core/src/index.ts'),
      '@angora-js/runtime': path.resolve(
        import.meta.dirname,
        '../../packages/runtime/src/index.ts'
      ),
      '@angora-js/router': path.resolve(import.meta.dirname, '../../packages/router/src/index.ts'),
      '@angora-js/forms': path.resolve(import.meta.dirname, '../../packages/forms/src/index.ts'),
      '@angora-js/ui': path.resolve(import.meta.dirname, '../../packages/ui/src/index.ts'),
      '@angora-js/rxjs-interop': path.resolve(
        import.meta.dirname,
        '../../packages/rxjs-interop/src/index.ts'
      ),
      '@angora-js/animations': path.resolve(
        import.meta.dirname,
        '../../packages/animations/src/index.ts'
      ),
      '@angora-js/devtools': path.resolve(
        import.meta.dirname,
        '../../packages/devtools/src/index.ts'
      ),
      '@angora-js/compiler': path.resolve(
        import.meta.dirname,
        '../../packages/compiler/src/index.ts'
      ),
    },
  },
  plugins: [
    angora({
      tsgo: {
        enabled: true,
      },
    }),
  ],
  build: {
    target: 'es2022',
  },
});
