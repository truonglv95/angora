import path from 'node:path';
import { runTypecheck } from '@angora-js/compiler';

export interface TypecheckOptions {
  enabled?: boolean;
  projectPath?: string;
  onDiagnostic?: (diagnostics: string) => void;
}

export type TsgoOptions = TypecheckOptions;

/**
 * Native Go-based TypeScript 7.0 & Angora Template checker runner (tsc + angora_oxc)
 */
export class TypecheckDiagnosticsChecker {
  private isRunning = false;
  private options: TypecheckOptions;

  constructor(options: TypecheckOptions = {}) {
    this.options = options;
  }

  public async check(): Promise<{ success: boolean; output: string }> {
    if (this.options.enabled === false) {
      return { success: true, output: '' };
    }

    this.isRunning = true;
    const rootDir = this.options.projectPath
      ? path.dirname(this.options.projectPath)
      : process.cwd();

    try {
      const res = await runTypecheck(rootDir);
      this.isRunning = false;
      if (this.options.onDiagnostic && res.formattedOutput) {
        this.options.onDiagnostic(res.formattedOutput);
      }
      return {
        success: res.success,
        output: res.formattedOutput,
      };
    } catch (err: any) {
      this.isRunning = false;
      return {
        success: false,
        output: `Typecheck runner error: ${err.message}`,
      };
    }
  }
}

export const TsgoDiagnosticsChecker = TypecheckDiagnosticsChecker;
