import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ASTNode } from './ast.ts';

const currentDir =
  typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url));

let cachedBinaryPath: string | null = null;

export function getPlatformPackageName(): string {
  const { platform, arch } = process;
  if (platform === 'darwin') {
    return arch === 'arm64' ? '@angora-js/compiler-darwin-arm64' : '@angora-js/compiler-darwin-x64';
  }
  if (platform === 'linux') {
    const isMusl = existsSync('/etc/alpine-release');
    const libc = isMusl ? 'musl' : 'gnu';
    return arch === 'arm64'
      ? `@angora-js/compiler-linux-arm64-${libc}`
      : `@angora-js/compiler-linux-x64-${libc}`;
  }
  if (platform === 'win32') {
    return arch === 'arm64'
      ? '@angora-js/compiler-win32-arm64-msvc'
      : '@angora-js/compiler-win32-x64-msvc';
  }
  return `@angora-js/compiler-${platform}-${arch}`;
}

export function findRustCompilerBinary(): string {
  if (cachedBinaryPath && existsSync(cachedBinaryPath)) {
    return cachedBinaryPath;
  }

  const exeName = process.platform === 'win32' ? 'angora_oxc.exe' : 'angora_oxc';

  // 1. Environment variable override
  if (process.env.ANGORA_OXC_BIN && existsSync(process.env.ANGORA_OXC_BIN)) {
    cachedBinaryPath = process.env.ANGORA_OXC_BIN;
    return cachedBinaryPath;
  }

  // 2. Try resolving from platform-specific optional dependency (ESM & CommonJS)
  try {
    const pkgName = getPlatformPackageName();
    let pkgDir: string | null = null;

    if (typeof import.meta !== 'undefined' && typeof import.meta.resolve === 'function') {
      try {
        const resolvedPkg = import.meta.resolve(pkgName);
        if (resolvedPkg) {
          pkgDir = dirname(fileURLToPath(resolvedPkg));
        }
      } catch {}
    }

    if (!pkgDir && typeof require !== 'undefined' && typeof require.resolve === 'function') {
      try {
        const resolvedEntry = require.resolve(pkgName);
        if (resolvedEntry) {
          pkgDir = dirname(resolvedEntry);
        }
      } catch {}
    }

    if (pkgDir) {
      const candidates = [resolve(pkgDir, 'bin', exeName), resolve(pkgDir, '../bin', exeName)];
      for (const cand of candidates) {
        if (existsSync(cand)) {
          cachedBinaryPath = cand;
          return cand;
        }
      }
    }
  } catch {}

  // 3. Check node_modules in working directory
  const nodeModulesCandidates = [
    resolve(process.cwd(), 'node_modules', getPlatformPackageName(), 'bin', exeName),
    resolve(process.cwd(), 'node_modules/.bin', exeName),
  ];
  for (const cand of nodeModulesCandidates) {
    if (existsSync(cand)) {
      cachedBinaryPath = cand;
      return cand;
    }
  }

  // 4. Fallback to local build paths (monorepo & development)
  const candidates = [
    resolve(currentDir, `../../target/release/${exeName}`),
    resolve(currentDir, `../../../target/release/${exeName}`),
    resolve(process.cwd(), `target/release/${exeName}`),
    resolve(process.cwd(), `../../target/release/${exeName}`),
    resolve(process.cwd(), `../target/release/${exeName}`),
    resolve(currentDir, `../../target/debug/${exeName}`),
    resolve(currentDir, `../../../target/debug/${exeName}`),
    resolve(process.cwd(), `target/debug/${exeName}`),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (existsSync(p)) {
      cachedBinaryPath = p;
      return p;
    }
  }

  throw new Error(
    `[Angora Compiler] Fatal Error: Native Rust OXC compiler (${exeName}) not found.\n` +
      'Angora uses 100% Rust OXC compiler with zero JS fallback. Please run:\n' +
      '  cargo build --release\n' +
      'inside crates/angora_compiler to generate the binary, or install the platform package:\n' +
      `  npm install ${getPlatformPackageName()}`
  );
}

export function tryFindRustCompilerBinary(): string | null {
  try {
    return findRustCompilerBinary();
  } catch {
    return null;
  }
}

import { verifyTemplateImports, type TemplateDiagnostic } from './validator.ts';

export interface TransformOptions {
  dev?: boolean;
  strictImports?: boolean;
  onDiagnostic?: (diagnostic: TemplateDiagnostic) => void;
}

/**
 * Transforms an Angora component, directive, pipe, or injectable
 * into browser-compatible JavaScript using 100% Native Rust OXC AST.
 */
export function transformComponent(sourceCode: string, options?: TransformOptions): string {
  if (options?.strictImports) {
    const tmplMatch = sourceCode.match(/template\s*:\s*[`'"]([\s\S]*?)[`'"]/);
    const impMatch = sourceCode.match(/imports\s*:\s*(?:\(\)\s*=>\s*)?\[([\s\S]*?)\]/);
    const clsMatch = sourceCode.match(/class\s+([a-zA-Z0-9_$]+)/);
    if (tmplMatch) {
      const ast = parseTemplate(tmplMatch[1]);
      const imports = impMatch
        ? impMatch[1]
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
        : [];
      const diags = verifyTemplateImports(ast, {
        className: clsMatch ? clsMatch[1] : 'Component',
        imports,
      });
      const err = diags.find(d => d.severity === 'error');
      if (err) {
        throw new Error(
          `[Angora Template Check ${err.code}] in ${clsMatch?.[1] || 'Component'}: ${err.message}`
        );
      }
    }
  }

  const bin = findRustCompilerBinary();
  const res = spawnSync(bin, ['-', '--transform'], {
    input: sourceCode,
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
  });

  if (res.status !== 0) {
    throw new Error(
      `[Angora Rust OXC Transform Error]: ${res.stderr || res.stdout || 'Unknown failure'}`
    );
  }

  return res.stdout;
}

/**
 * Parses an Angora HTML template into AST JSON using 100% Native Rust parser.
 */
export function parseTemplate(templateHtml: string): ASTNode[] {
  const bin = findRustCompilerBinary();
  const res = spawnSync(bin, ['-', '--parse-template'], {
    input: templateHtml,
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (res.status !== 0) {
    throw new Error(`[Angora Rust OXC Parser Error]: ${res.stderr || res.stdout}`);
  }

  const rawJson = JSON.parse(res.stdout);

  // Normalize field names if needed (two_ways -> twoWayBindings)
  return normalizeAst(rawJson);
}

/**
 * Compiles an Angora template AST into fine-grained reactive DOM render function
 * using 100% Native Rust codegen.
 */
export function compileTemplate(
  astOrHtml: ASTNode[] | string,
  options?: { scopeId?: string }
): string {
  const bin = findRustCompilerBinary();

  const input = typeof astOrHtml === 'string' ? astOrHtml : JSON.stringify(astOrHtml);

  const args = ['-', '--compile-template'];
  if (options?.scopeId) {
    args.push('--scope-id', options.scopeId);
  }

  const res = spawnSync(bin, args, {
    input,
    encoding: 'utf-8',
    maxBuffer: 20 * 1024 * 1024,
  });

  if (res.status !== 0) {
    throw new Error(`[Angora Rust OXC Codegen Error]: ${res.stderr || res.stdout}`);
  }

  return res.stdout;
}

function normalizeAst(nodes: any[]): ASTNode[] {
  return nodes.map(n => {
    if (n.type === 'element') {
      return {
        ...n,
        twoWayBindings: n.twoWayBindings || n.two_ways || [],
        references: n.references || [],
        children: normalizeAst(n.children || []),
      };
    }
    if (n.type === 'ifBlock') {
      return {
        ...n,
        branches: (n.branches || []).map((b: any) => ({
          ...b,
          condition: b.condition === null ? undefined : b.condition,
          children: normalizeAst(b.children || []),
        })),
      };
    }
    if (n.type === 'forBlock') {
      const empty = n.emptyChildren
        ? normalizeAst(n.emptyChildren)
        : n.empty_block
          ? normalizeAst(n.empty_block)
          : n.emptyBlock
            ? normalizeAst(n.emptyBlock)
            : undefined;
      return {
        ...n,
        itemName: n.itemName || n.item_name,
        trackBy: n.trackBy || n.track_by,
        children: normalizeAst(n.children || []),
        emptyChildren: empty,
        emptyBlock: empty,
      };
    }
    if (n.type === 'switchBlock') {
      return {
        ...n,
        cases: (n.cases || []).map((c: any) => ({
          ...c,
          caseValue: c.caseValue === null ? undefined : (c.caseValue ?? c.case_value),
          children: normalizeAst(c.children || []),
        })),
      };
    }
    if (n.type === 'deferBlock') {
      const pb = n.placeholderBlock || n.placeholder_block;
      const lb = n.loadingBlock || n.loading_block;
      const eb = n.errorBlock || n.error_block;
      return {
        ...n,
        mainBlock: normalizeAst(n.mainBlock || n.main_block || []),
        placeholderBlock: pb ? { ...pb, children: normalizeAst(pb.children || []) } : undefined,
        loadingBlock: lb ? { ...lb, children: normalizeAst(lb.children || []) } : undefined,
        errorBlock: eb ? { ...eb, children: normalizeAst(eb.children || []) } : undefined,
      };
    }
    return n;
  });
}

export interface SourceMapping {
  tcbStart: number;
  tcbEnd: number;
  tmplStart: number;
  tmplEnd: number;
  expression: string;
}

export interface TcbResult {
  code: string;
  mappings: SourceMapping[];
}

/**
 * Generates a Synthetic Type Check Block (TCB) with exact Source Maps
 * using the 100% native Rust OXC compiler binary.
 */
export function generateTypeCheckBlockNative(
  templateSource: string,
  className: string = 'Component',
  baseOffset: number = 0
): TcbResult {
  const binary = findRustCompilerBinary();
  const args = ['-', '--generate-tcb', '--class', className];
  if (baseOffset > 0) {
    args.push('--offset', String(baseOffset));
  }
  const proc = spawnSync(binary, args, {
    input: templateSource,
    encoding: 'utf-8',
    maxBuffer: 16 * 1024 * 1024,
  });

  if (proc.error) {
    throw proc.error;
  }
  if (proc.status !== 0) {
    throw new Error(`[Angora Rust Compiler] TCB generation failed:\n${proc.stderr}`);
  }

  try {
    return JSON.parse(proc.stdout) as TcbResult;
  } catch (err: any) {
    throw new Error(`[Angora Rust Compiler] Failed to parse TCB output JSON: ${err.message}`);
  }
}

/**
 * Scopes component CSS selectors to a specific scope attribute (e.g. _angora-c0)
 * using the 100% native Rust CSS engine.
 */
export function scopeCssNative(css: string, scopeId: string): string {
  if (!css || !css.trim()) return '';
  const binary = findRustCompilerBinary();
  const proc = spawnSync(binary, ['-', '--scope-css', '--scope-id', scopeId], {
    input: css,
    encoding: 'utf-8',
    maxBuffer: 16 * 1024 * 1024,
  });

  if (proc.error) {
    throw proc.error;
  }
  if (proc.status !== 0) {
    throw new Error(`[Angora Rust Compiler] CSS scoping failed:\n${proc.stderr}`);
  }

  return proc.stdout;
}

export interface LspPosition {
  line: number;
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface LspImportInfo {
  name: string;
  modulePath: string;
  range: LspRange;
}

export interface LspPropertyInfo {
  name: string;
  rawType: string;
  unwrappedType: string;
  isSignal: boolean;
  isComputed: boolean;
  isInput?: boolean;
  isOutput?: boolean;
  isRequired?: boolean;
  isMethod: boolean;
  docstring?: string;
  range: LspRange;
}

export interface LspParamInfo {
  name: string;
  type: string;
}

export interface LspMethodInfo {
  name: string;
  signature: string;
  params: LspParamInfo[];
  returnType: string;
  docstring?: string;
  range: LspRange;
}

export interface LspTemplateInfo {
  content: string;
  offset: number;
  range: LspRange;
  tcb?: TcbResult;
}

export interface LspComponentAnalysis {
  className: string;
  classRange: LspRange;
  classDoc: string;
  fileUri?: string;
  selector?: string;
  imports: LspImportInfo[];
  componentImports?: string[];
  properties: LspPropertyInfo[];
  methods: LspMethodInfo[];
  template?: LspTemplateInfo;
}

export interface LspTypeMemberInfo {
  name: string;
  type: string;
  rawType: string;
  unwrappedType?: string;
  isSignal?: boolean;
  isMethod?: boolean;
  signature?: string;
  docstring?: string;
  range?: LspRange;
  uri?: string;
}

export interface LspTypeDefInfo {
  name: string;
  kind: string;
  rawType?: string;
  properties: LspTypeMemberInfo[];
  methods: LspTypeMemberInfo[];
  range?: LspRange;
  uri?: string;
}

export interface LspAnalysisResult {
  components: LspComponentAnalysis[];
  typeDefs: LspTypeDefInfo[];
}

/**
 * High-performance 100% Native Rust OXC AST analysis of Angora components,
 * extracting metadata, imports, properties, signals, methods, docstrings,
 * and generating Synthetic TCB + exact Source Maps.
 */
export function analyzeComponentsWithRust(sourceCode: string, fileUri?: string): LspAnalysisResult {
  const bin = findRustCompilerBinary();
  const args = ['-', '--lsp-analyze'];
  if (fileUri) {
    args.push('--uri', fileUri);
  }
  const res = spawnSync(bin, args, {
    input: sourceCode,
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
  });

  if (res.status !== 0) {
    throw new Error(
      `[Angora Rust OXC LSP Analysis Error]: ${res.stderr || res.stdout || 'Unknown failure'}`
    );
  }

  return JSON.parse(res.stdout);
}

export interface LspNativeDiagnostic {
  code: string;
  message: string;
  severity: string;
  range: LspRange;
  source: string;
}

export interface LspNativeHover {
  contents: string;
  range?: LspRange;
}

export interface LspNativeCompletion {
  label: string;
  kind: string;
  detail: string;
  insertText: string;
  documentation?: string;
  sortText?: string;
}

export interface LspNativeDefinition {
  uri: string;
  range: LspRange;
  symbol?: string;
}

/**
 * 100% Native Rust LSP Diagnostics Engine
 */
export function getDiagnosticsWithRust(
  sourceCode: string,
  fileUri?: string
): LspNativeDiagnostic[] {
  const bin = findRustCompilerBinary();
  const args = ['-', '--lsp-diagnostics'];
  if (fileUri) {
    args.push('--uri', fileUri);
  }
  const res = spawnSync(bin, args, {
    input: sourceCode,
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.status !== 0 || !res.stdout) {
    return [];
  }
  return JSON.parse(res.stdout);
}

/**
 * 100% Native Rust LSP Hover Engine
 */
export function getHoverWithRust(
  sourceCode: string,
  line: number,
  character: number,
  fileUri?: string
): LspNativeHover | null {
  const bin = findRustCompilerBinary();
  const args = ['-', '--lsp-hover', '--line', String(line), '--char', String(character)];
  if (fileUri) {
    args.push('--uri', fileUri);
  }
  const res = spawnSync(bin, args, {
    input: sourceCode,
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.status !== 0 || !res.stdout || res.stdout.trim() === 'null') {
    return null;
  }
  return JSON.parse(res.stdout);
}

/**
 * 100% Native Rust LSP Completions Engine
 */
export function getCompletionsWithRust(
  sourceCode: string,
  line: number,
  character: number,
  fileUri?: string
): LspNativeCompletion[] {
  const bin = findRustCompilerBinary();
  const args = ['-', '--lsp-completions', '--line', String(line), '--char', String(character)];
  if (fileUri) {
    args.push('--uri', fileUri);
  }
  const res = spawnSync(bin, args, {
    input: sourceCode,
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.status !== 0 || !res.stdout) {
    return [];
  }
  return JSON.parse(res.stdout);
}

/**
 * 100% Native Rust LSP Definition Engine
 */
export function getDefinitionWithRust(
  sourceCode: string,
  line: number,
  character: number,
  fileUri?: string
): LspNativeDefinition[] {
  const bin = findRustCompilerBinary();
  const args = ['-', '--lsp-definition', '--line', String(line), '--char', String(character)];
  if (fileUri) {
    args.push('--uri', fileUri);
  }
  const res = spawnSync(bin, args, {
    input: sourceCode,
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.status !== 0 || !res.stdout) {
    return [];
  }
  return JSON.parse(res.stdout);
}

export interface ExtractedComponentTcb {
  className: string;
  templateOffset: number;
  tcb: TcbResult;
}

/**
 * Fast single-file component TCB extractor using 100% native Rust OXC (microseconds, zero disk recursion).
 */
export function extractTcbsWithRust(sourceCode: string, fileUri?: string): ExtractedComponentTcb[] {
  const bin = findRustCompilerBinary();
  const args = ['-', '--extract-tcbs'];
  if (fileUri) {
    args.push('--uri', fileUri);
  }
  const res = spawnSync(bin, args, {
    input: sourceCode,
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.status !== 0 || !res.stdout) {
    return [];
  }
  try {
    return JSON.parse(res.stdout);
  } catch {
    return [];
  }
}
