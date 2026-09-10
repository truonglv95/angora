import type { Plugin, ViteDevServer } from 'vite';
import {
  TypecheckDiagnosticsChecker,
  TsgoDiagnosticsChecker,
  type TypecheckOptions,
  type TsgoOptions,
} from './tsgo.ts';
import { OxcValidator, type OxcOptions } from './oxc.ts';
import { compileSfc } from '@angora-js/compiler';

export interface AngoraPluginOptions {
  /**
   * Options for native Go-speed TypeScript 7.0 diagnostics (tsc)
   */
  typecheck?: TypecheckOptions;

  /**
   * @deprecated Alias for typecheck
   */
  tsgo?: TsgoOptions;

  /**
   * Options for native Rust OXC AST validation
   */
  oxc?: OxcOptions;

  /**
   * Enable Hot Module Replacement for template changes
   */
  hmr?: boolean;

  /**
   * Enable Click-to-Source Inspector in dev mode (default: true)
   */
  inspector?: boolean;
}

import { spawn } from 'node:child_process';

/**
 * Launches developer's editor at specified file, line, and column
 */
export function launchEditor(
  filePath: string,
  line: string | number = 1,
  column: string | number = 1
) {
  const target = `${filePath}:${line}:${column}`;
  const customEditor = process.env.EDITOR || process.env.VISUAL;
  if (customEditor) {
    spawn(customEditor, [target], { stdio: 'ignore', detached: true }).unref();
    return;
  }
  const editors = ['code', 'cursor', 'zed'];
  for (const cmd of editors) {
    try {
      const child = spawn(cmd, ['-g', target], { stdio: 'ignore', detached: true });
      child.unref();
      child.on('error', () => {});
      return;
    } catch {
      continue;
    }
  }
}

/**
 * Vite plugin for @angora framework
 * Seamlessly integrates OXC template compiler, fine-grained Signals, and tsgo diagnostics
 */
export function angora(options: AngoraPluginOptions = {}): Plugin {
  let server: ViteDevServer | null = null;
  const checker = new TypecheckDiagnosticsChecker(options.typecheck || options.tsgo);
  const oxcValidator = new OxcValidator(options.oxc);

  let isDev = true;

  return {
    name: 'vite-plugin-angora',
    enforce: 'pre',

    configResolved(config) {
      isDev = config.command !== 'build' && config.mode !== 'production';
      if (oxcValidator.isNative()) {
        console.log('[angora:oxc] In-Process Native N-API Rust OXC compiler active');
      } else if (oxcValidator.isAvailable()) {
        console.log('[angora:oxc] Native Rust OXC compiler bridge active');
      }
      // Run initial type diagnostics with TypeScript 7.0 tsc in background
      checker.check().then(result => {
        if (!result.success && result.output) {
          console.warn('\n[angora:tsc] TypeScript 7.0 Native Go Diagnostics:\n', result.output);
        }
      });
    },

    configureServer(devServer) {
      server = devServer;
      if (options.inspector !== false) {
        devServer.middlewares.use('/__angora_open_editor', (req, res) => {
          const url = new URL(req.url || '', 'http://localhost');
          const file = url.searchParams.get('file');
          const line = url.searchParams.get('line') || '1';
          const col = url.searchParams.get('column') || '1';
          if (file) {
            launchEditor(file, line, col);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, target: `${file}:${line}:${col}` }));
          } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing file query parameter' }));
          }
        });
      }
    },

    async transform(code, id) {
      const cleanId = id.split('?')[0];
      const hasAngoraDecorator =
        code.includes('@Component') ||
        code.includes('@Directive') ||
        code.includes('@Pipe') ||
        code.includes('@Injectable');

      const isSfc = cleanId.endsWith('.angora') || cleanId.endsWith('.ag');
      const isAngoraFile = (cleanId.match(/\.(ts|tsx|js|mjs)$/) && hasAngoraDecorator) || isSfc;
      if (!isAngoraFile) {
        return null;
      }

      let resultCode = '';

      if (isSfc) {
        resultCode = compileSfc(code, { filename: cleanId });
      } else {
        // 1. Try In-Process Native N-API Rust OXC transformer first (microseconds speed)
        if (oxcValidator.isNative()) {
          const nativeRes = oxcValidator.transformSourceSync(code);
          if (nativeRes.success && nativeRes.code) {
            resultCode = nativeRes.code;
          }
        }

        // 2. Try native Rust OXC CLI AST transformer
        if (!resultCode && oxcValidator.isAvailable()) {
          const oxcResult = await oxcValidator.transformFile(cleanId);
          if (oxcResult.success && oxcResult.code) {
            resultCode = oxcResult.code;
          }
        }
      }

      if (resultCode) {
        const classMatches = Array.from(code.matchAll(/class\s+([A-Za-z0-9_$]+)/g));
        for (const match of classMatches) {
          const compClassName = match[1];
          if (isDev && options.inspector !== false) {
            resultCode += `\nif (typeof ${compClassName} !== 'undefined') { (${compClassName} as any).__sourceFile = ${JSON.stringify(cleanId)}; }\n`;
          }
        }

        if (isDev && options.hmr !== false) {
          resultCode += `
if (import.meta.hot) {
  import.meta.hot.accept((newMod) => {
    if (newMod) {
      import('@angora-js/runtime').then(({ applyHMRUpdate }) => {
        for (const exp of Object.values(newMod)) {
          if (typeof exp === 'function' && ((exp as any).ɵcmp || (exp as any).ɵrender || (exp as any).__angora_render__)) {
            applyHMRUpdate(${JSON.stringify(cleanId)}, exp);
          }
        }
      });
    }
  });
}
`;
        }

        return {
          code: resultCode,
          map: null,
        };
      }

      // 100% Rust OXC compiler required - Zero TS fallback
      this.error(
        '[Angora Compiler] Fatal Error: Native Rust OXC compiler (angora_oxc) is required for @angora-js/vite-plugin.\n' +
          'Zero JS fallback is permitted. Please ensure crates/angora_compiler is built via `cargo build --release`.'
      );
      return null;
    },

    async handleHotUpdate(ctx) {
      if (ctx.file.endsWith('.angora') || ctx.file.endsWith('.ag') || ctx.file.endsWith('.ts')) {
        // Run TypeScript 7.0 native diagnostic in background on edit
        checker.check().then(result => {
          if (!result.success && server) {
            server.ws.send({
              type: 'error',
              err: {
                message: result.output,
                stack: '',
                plugin: 'vite-plugin-angora (tsc)',
                id: ctx.file,
              },
            });
          }
        });
      }
    },
  };
}

export default angora;
export {
  TypecheckDiagnosticsChecker,
  TsgoDiagnosticsChecker,
  type TypecheckOptions,
  type TsgoOptions,
};
export { OxcValidator, type OxcOptions };
