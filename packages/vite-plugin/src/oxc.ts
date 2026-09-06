import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

export interface OxcOptions {
  enabled?: boolean;
  binaryPath?: string;
  nativeModulePath?: string;
}

export class OxcValidator {
  private nativeModule: {
    transformSync: (source: string) => string;
    parseTemplateSync: (tpl: string) => string;
  } | null = null;
  private binaryPath: string | null = null;
  private enabled: boolean;

  constructor(options: OxcOptions = {}) {
    this.enabled = options.enabled ?? true;

    // 1. Try to load in-memory N-API native module first
    const nativeCandidates = [
      options.nativeModulePath,
      resolve(process.cwd(), '../../target/release/angora_compiler.node'),
      resolve(process.cwd(), '../target/release/angora_compiler.node'),
      resolve(process.cwd(), 'target/release/angora_compiler.node'),
    ].filter(Boolean) as string[];

    for (const p of nativeCandidates) {
      if (existsSync(p)) {
        try {
          const req = typeof require !== 'undefined' ? require : createRequire(import.meta.url);
          this.nativeModule = req(p);
          break;
        } catch {
          // Fall through to binary
        }
      }
    }

    if (!this.nativeModule) {
      if (options.binaryPath && existsSync(options.binaryPath)) {
        this.binaryPath = options.binaryPath;
      } else {
        // Auto-detect local cargo debug/release build
        const candidates = [
          resolve(process.cwd(), '../../target/release/angora_oxc'),
          resolve(process.cwd(), '../../target/debug/angora_oxc'),
          resolve(process.cwd(), '../target/release/angora_oxc'),
          resolve(process.cwd(), 'target/release/angora_oxc'),
        ];
        for (const p of candidates) {
          if (existsSync(p)) {
            this.binaryPath = p;
            break;
          }
        }
      }
    }
  }

  public isAvailable(): boolean {
    return this.enabled && (this.nativeModule !== null || this.binaryPath !== null);
  }

  public isNative(): boolean {
    return this.enabled && this.nativeModule !== null;
  }

  public transformSourceSync(sourceCode: string): {
    success: boolean;
    code?: string;
    error?: string;
  } {
    if (this.nativeModule) {
      try {
        const transformed = this.nativeModule.transformSync(sourceCode);
        return { success: true, code: transformed };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
    return { success: false, error: 'Native module not loaded' };
  }

  public async validateFile(filePath: string): Promise<{ success: boolean; output: string }> {
    if (!this.binaryPath) {
      return { success: true, output: '' };
    }

    return new Promise(resolveResult => {
      const child = spawn(this.binaryPath!, [filePath, '--check']);
      let output = '';

      child.stdout?.on('data', data => {
        output += data.toString();
      });

      child.stderr?.on('data', data => {
        output += data.toString();
      });

      child.on('close', code => {
        resolveResult({
          success: code === 0,
          output: output.trim(),
        });
      });

      child.on('error', () => {
        resolveResult({
          success: false,
          output: 'Failed to spawn native OXC binary',
        });
      });
    });
  }

  public async transformFile(
    filePath: string
  ): Promise<{ success: boolean; code?: string; error?: string }> {
    if (!this.binaryPath) {
      return { success: false, error: 'OXC binary not available' };
    }

    return new Promise(resolveResult => {
      const child = spawn(this.binaryPath!, [filePath, '--transform']);
      let output = '';
      let error = '';

      child.stdout?.on('data', data => {
        output += data.toString();
      });

      child.stderr?.on('data', data => {
        error += data.toString();
      });

      child.on('close', code => {
        if (code === 0) {
          resolveResult({ success: true, code: output });
        } else {
          resolveResult({ success: false, error: error.trim() || 'Transform failed' });
        }
      });

      child.on('error', err => {
        resolveResult({ success: false, error: err.message });
      });
    });
  }
}
