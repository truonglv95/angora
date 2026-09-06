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
      '@angora-js/compiler': path.resolve(
        import.meta.dirname,
        '../../packages/compiler/src/index.ts'
      ),
    },
  },
  plugins: [angora()],
  build: {
    target: 'es2022',
  },
});
