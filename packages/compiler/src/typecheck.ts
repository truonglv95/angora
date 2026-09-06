import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractTcbsWithRust, type SourceMapping } from './native.ts';
import { verifyTemplateImports, type TemplateDiagnostic } from './validator.ts';
import { parseTemplate } from './native.ts';

const currentDir =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

export interface ComponentTcbInfo {
  shadowFilePath: string;
  origFilePath: string;
  origContent: string;
  className: string;
  mappings: SourceMapping[];
  headerLength: number;
  headerLines: number;
  templateOffset: number;
  tcbCode: string;
}

export interface TcbWorkspaceRegistry {
  rootDir: string;
  shadowFiles: Map<string, ComponentTcbInfo>;
  componentFiles: string[];
  tcbDir: string;
  tsconfigPath: string;
}

export interface AngoraDiagnostic {
  file: string;
  line: number;
  column: number;
  code: string;
  severity: 'error' | 'warning';
  message: string;
  source: 'angora-syntax' | 'tsc-typecheck';
  codeFrame?: string;
}

export interface TypecheckResult {
  success: boolean;
  diagnostics: AngoraDiagnostic[];
  formattedOutput: string;
  durationMs: number;
  componentsChecked: number;
}

export interface TypecheckRunnerOptions {
  rootDir?: string;
  project?: string;
  clean?: boolean;
}

/**
 * Recursively scans a directory for files containing @Component decorators.
 */
export function findComponentFiles(dir: string, baseDir: string = dir): string[] {
  const IGNORED = new Set([
    'node_modules',
    'dist',
    '.git',
    '.angora',
    'target',
    '.turbo',
    'build',
    'coverage',
    '.cache',
    'fixtures',
    'cli',
    'compiler',
    'create-angora',
    'eslint-plugin-angora',
    'prettier-plugin-angora',
    'vscode-extension',
  ]);

  const results: string[] = [];
  const compClassRegex =
    /@Component\s*\(\s*\{[\s\S]*?\}\s*\)\s*(?:export\s+)?class\s+[A-Za-z0-9_$]+/;

  function scan(current: string) {
    if (!fs.existsSync(current)) return;
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!IGNORED.has(entry.name) && entry.name !== 'tests' && entry.name !== '__tests__') {
          scan(path.join(current, entry.name));
        }
      } else if (
        entry.isFile() &&
        /\.(ts|tsx)$/.test(entry.name) &&
        !entry.name.endsWith('.d.ts') &&
        !entry.name.endsWith('.test.ts') &&
        !entry.name.endsWith('.spec.ts')
      ) {
        const fullPath = path.join(current, entry.name);
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (compClassRegex.test(content)) {
            results.push(fullPath);
          }
        } catch {
          // Ignore unreadable files
        }
      }
    }
  }

  scan(dir);
  return results;
}

/**
 * Extracts and rewrites import statements from the host component file so they
 * resolve cleanly from within the synthetic shadow workspace.
 */
export function extractImportStatementsForShadow(
  code: string,
  origFilePath: string,
  shadowDir: string
): string {
  const origDir = path.dirname(origFilePath);
  const importRegex = /(import\s+(?:type\s+)?(?:[\w*\s{},$]+)\s+from\s+['"])([^'"]+)(['"];?)/g;

  const rewritten: string[] = [];
  let m: RegExpExecArray | null;

  while ((m = importRegex.exec(code)) !== null) {
    const fullMatch = m[0];
    const prefix = m[1];
    let specifier = m[2];
    const suffix = m[3];

    // Ignore CSS and stylesheet imports that don't provide TypeScript types
    if (/\.(css|scss|sass|less)$/i.test(specifier)) {
      continue;
    }

    if (specifier.startsWith('.')) {
      const resolvedTarget = path.resolve(origDir, specifier);
      let newSpec = path.relative(shadowDir, resolvedTarget).replace(/\\/g, '/');
      if (!newSpec.startsWith('.')) {
        newSpec = './' + newSpec;
      }
      rewritten.push(`${prefix}${newSpec}${suffix}`);
    } else {
      rewritten.push(fullMatch);
    }
  }

  return rewritten.join('\n');
}

/**
 * Extracts all exported class, interface, type, const, or function names from the host file.
 */
export function extractExportedIdentifiers(code: string): string[] {
  const exportRegex =
    /export\s+(?:default\s+)?(?:class|interface|type|const|function|enum)\s+([A-Za-z0-9_$]+)/g;
  const names = new Set<string>();
  let m: RegExpExecArray | null;

  while ((m = exportRegex.exec(code)) !== null) {
    names.add(m[1]);
  }

  return Array.from(names);
}

/**
 * Builds the ephemeral/shadow TCB workspace inside `.angora/tcb`.
 * Extracts templates using 100% native Rust OXC (`angora_oxc`),
 * generates synthetic TypeScript files, and creates an extended tsconfig.json.
 */
export function buildTcbWorkspace(
  rootDir: string = process.cwd(),
  options: { outputDir?: string } = {}
): TcbWorkspaceRegistry {
  const tcbDir = options.outputDir || path.resolve(rootDir, '.angora/tcb');
  const angoraDir = path.dirname(tcbDir);

  if (fs.existsSync(tcbDir)) {
    fs.rmSync(tcbDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tcbDir, { recursive: true });

  const componentFiles = findComponentFiles(rootDir);
  const shadowFiles = new Map<string, ComponentTcbInfo>();

  for (const filePath of componentFiles) {
    const relPath = path.relative(rootDir, filePath);
    const code = fs.readFileSync(filePath, 'utf-8');
    const fileUri = 'file://' + filePath;

    let extractedList;
    try {
      extractedList = extractTcbsWithRust(code, fileUri);
    } catch {
      continue;
    }

    if (!extractedList || extractedList.length === 0) {
      continue;
    }

    for (const comp of extractedList) {
      if (!comp.tcb || !comp.tcb.code) {
        continue;
      }

      // Compute shadow file path: .angora/tcb/<relative-path-without-ts>.<ClassName>.tcb.ts
      const relDir = path.dirname(relPath);
      const baseName = path.basename(filePath, path.extname(filePath));
      const shadowFileName = `${baseName}.${comp.className}.tcb.ts`;
      const shadowDir = path.join(tcbDir, relDir);
      const shadowFilePath = path.join(shadowDir, shadowFileName);

      fs.mkdirSync(shadowDir, { recursive: true });

      // Compute relative import from shadow file to the original component
      let relImport = path.relative(shadowDir, filePath).replace(/\\/g, '/');
      if (relImport.endsWith('.ts')) {
        relImport = relImport.slice(0, -3);
      }
      if (!relImport.startsWith('.')) {
        relImport = './' + relImport;
      }

      const rewrittenImports = extractImportStatementsForShadow(code, filePath, shadowDir);
      const exportedNames = extractExportedIdentifiers(code);
      const hostSymbols = Array.from(new Set([comp.className, ...exportedNames]));
      const hostImport = `import type { ${hostSymbols.join(', ')} } from '${relImport}';\n`;

      const header = (rewrittenImports ? rewrittenImports + '\n\n' : '') + hostImport + '\n';
      const headerLines = header.split('\n').length - 1;
      const tcbCode = comp.tcb.code;
      const shadowContent = header + tcbCode;

      fs.writeFileSync(shadowFilePath, shadowContent, 'utf-8');

      shadowFiles.set(path.resolve(shadowFilePath), {
        shadowFilePath: path.resolve(shadowFilePath),
        origFilePath: path.resolve(filePath),
        origContent: code,
        className: comp.className,
        mappings: comp.tcb.mappings,
        headerLength: header.length,
        headerLines,
        templateOffset: comp.templateOffset,
        tcbCode,
      });
    }
  }

  // Create .angora/tsconfig.tcb.json
  const rootTsconfig = path.resolve(rootDir, 'tsconfig.json');
  const tcbTsconfigPath = path.resolve(angoraDir, 'tsconfig.tcb.json');

  let extendsPath = '../tsconfig.json';
  if (fs.existsSync(rootTsconfig)) {
    extendsPath = path.relative(angoraDir, rootTsconfig).replace(/\\/g, '/');
    if (!extendsPath.startsWith('.')) extendsPath = './' + extendsPath;
  }

  const tcbTsconfigContent = {
    extends: extendsPath,
    include: ['../**/*', './tcb/**/*'],
    exclude: [
      '../node_modules',
      '../**/node_modules',
      '../dist',
      '../**/dist',
      '../target',
      '../**/target',
      '../.turbo',
    ],
  };

  fs.writeFileSync(tcbTsconfigPath, JSON.stringify(tcbTsconfigContent, null, 2), 'utf-8');

  return {
    rootDir: path.resolve(rootDir),
    shadowFiles,
    componentFiles,
    tcbDir,
    tsconfigPath: tcbTsconfigPath,
  };
}

/**
 * Formats a clean 3-line code frame around a target line and column.
 */
function createCodeFrame(source: string, line: number, column: number): string {
  const lines = source.split('\n');
  const startLine = Math.max(1, line - 1);
  const endLine = Math.min(lines.length, line + 1);

  const frame: string[] = [];
  const maxLineNumWidth = String(endLine).length;

  for (let i = startLine; i <= endLine; i++) {
    const lineContent = lines[i - 1] || '';
    const lineNumStr = String(i).padStart(maxLineNumWidth, ' ');
    if (i === line) {
      frame.push(`  \x1b[31m>\x1b[0m ${lineNumStr} | ${lineContent}`);
      const pointer = ' '.repeat(Math.max(0, column - 1)) + '\x1b[31m^\x1b[0m';
      frame.push(`    ${' '.repeat(maxLineNumWidth)} | ${pointer}`);
    } else {
      frame.push(`    ${lineNumStr} | ${lineContent}`);
    }
  }

  return frame.join('\n');
}

/**
 * Translates tsc stdout/stderr diagnostics back to original user component templates.
 */
export function translateDiagnostics(
  tscOutput: string,
  registry: TcbWorkspaceRegistry
): AngoraDiagnostic[] {
  const diagnostics: AngoraDiagnostic[] = [];
  const lines = tscOutput.split('\n');

  const diagRegex1 = /^([^(]+)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/;
  const diagRegex2 = /^([^:]+):(\d+):(\d+)\s+-\s+(error|warning)\s+(TS\d+):\s+(.+)$/;

  for (const line of lines) {
    const match = line.match(diagRegex1) || line.match(diagRegex2);
    if (!match) continue;

    const [, filePathRaw, lineStr, colStr, severityRaw, code, message] = match;
    const rawPath = filePathRaw.trim();
    const resolvedPath = path.isAbsolute(rawPath)
      ? rawPath
      : path.resolve(registry.rootDir || process.cwd(), rawPath);
    const lineNum = parseInt(lineStr, 10);
    const colNum = parseInt(colStr, 10);
    const severity = severityRaw.toLowerCase() === 'error' ? 'error' : 'warning';

    let tcbInfo = registry.shadowFiles.get(resolvedPath);
    if (!tcbInfo) {
      for (const [k, v] of registry.shadowFiles.entries()) {
        if (resolvedPath.endsWith(path.basename(k)) || k.endsWith(filePathRaw.trim())) {
          tcbInfo = v;
          break;
        }
      }
    }

    if (tcbInfo) {
      // Map error in synthetic TCB back to the original component template
      const fullTcb = fs.readFileSync(tcbInfo.shadowFilePath, 'utf-8');
      const tcbLines = fullTcb.split('\n');

      let charOffset = 0;
      for (let i = 0; i < lineNum - 1 && i < tcbLines.length; i++) {
        charOffset += tcbLines[i].length + 1;
      }
      charOffset += colNum - 1;
      const tcbBodyOffset = Math.max(0, charOffset - tcbInfo.headerLength);

      // Find best matching SourceMapping
      let matchedMapping = tcbInfo.mappings.find(
        m => tcbBodyOffset >= m.tcbStart && tcbBodyOffset <= m.tcbEnd
      );

      if (!matchedMapping) {
        // Nearest mapping
        let minDiff = Infinity;
        for (const m of tcbInfo.mappings) {
          const diff = Math.abs(tcbBodyOffset - m.tcbStart);
          if (diff < minDiff && diff < 200) {
            minDiff = diff;
            matchedMapping = m;
          }
        }
      }

      if (matchedMapping) {
        const expr = matchedMapping.expression;
        let origOffset = tcbInfo.origContent.indexOf(expr);
        if (origOffset === -1) {
          origOffset = matchedMapping.tmplStart;
        }

        const linesBefore = tcbInfo.origContent.slice(0, origOffset).split('\n');
        const origLine = linesBefore.length;
        const origCol = linesBefore[linesBefore.length - 1].length + 1;

        const frame = createCodeFrame(tcbInfo.origContent, origLine, origCol);

        diagnostics.push({
          file: tcbInfo.origFilePath,
          line: origLine,
          column: origCol,
          code,
          severity,
          message,
          source: 'tsc-typecheck',
          codeFrame: frame,
        });
      } else {
        // Fallback to class range or template offset
        const linesBefore = tcbInfo.origContent.slice(0, tcbInfo.templateOffset).split('\n');
        const origLine = linesBefore.length;
        const origCol = linesBefore[linesBefore.length - 1].length + 1;

        diagnostics.push({
          file: tcbInfo.origFilePath,
          line: origLine,
          column: origCol,
          code,
          severity,
          message,
          source: 'tsc-typecheck',
          codeFrame: createCodeFrame(tcbInfo.origContent, origLine, origCol),
        });
      }
    } else {
      if (filePathRaw.includes('.tcb.ts') || filePathRaw.includes('.angora/tcb')) {
        // Skip unmapped synthetic file errors
        continue;
      }
      // Normal .ts file outside of TCB shadow files
      let codeFrame: string | undefined;
      if (fs.existsSync(resolvedPath)) {
        try {
          const src = fs.readFileSync(resolvedPath, 'utf-8');
          codeFrame = createCodeFrame(src, lineNum, colNum);
        } catch {
          // Ignore
        }
      }

      diagnostics.push({
        file: resolvedPath,
        line: lineNum,
        column: colNum,
        code,
        severity,
        message,
        source: 'tsc-typecheck',
        codeFrame,
      });
    }
  }

  return diagnostics;
}

/**
 * Validates template framework syntax (NG8001, NG8002, NG8004) across all components.
 */
export function validateFrameworkSyntax(componentFiles: string[]): AngoraDiagnostic[] {
  const diags: AngoraDiagnostic[] = [];

  for (const file of componentFiles) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf-8');

    const tmplMatch = content.match(/template\s*:\s*[`'"]([\s\S]*?)[`'"]/);
    const impMatch = content.match(/imports\s*:\s*\[([\s\S]*?)\]/);
    const clsMatch = content.match(/class\s+([a-zA-Z0-9_$]+)/);

    if (tmplMatch) {
      let ast;
      try {
        ast = parseTemplate(tmplMatch[1]);
      } catch (err: any) {
        diags.push({
          file,
          line: 1,
          column: 1,
          code: 'ANGORA_PARSE_ERROR',
          severity: 'error',
          message: err.message || 'Template parse error',
          source: 'angora-syntax',
        });
        continue;
      }

      const imports = impMatch
        ? impMatch[1]
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
        : [];

      const rawDiags = verifyTemplateImports(ast, {
        className: clsMatch ? clsMatch[1] : 'Component',
        imports,
      });

      for (const d of rawDiags) {
        const offset = tmplMatch.index || 0;
        const linesBefore = content.slice(0, offset).split('\n');
        const line = linesBefore.length;
        const col = linesBefore[linesBefore.length - 1].length + 1;

        diags.push({
          file,
          line,
          column: col,
          code: d.code,
          severity: d.severity,
          message: d.message,
          source: 'angora-syntax',
          codeFrame: createCodeFrame(content, line, col),
        });
      }
    }
  }

  return diags;
}

function resolveTscBinary(rootDir: string): string {
  const candidates = [
    path.resolve(rootDir, 'node_modules/.bin/tsc'),
    path.resolve(rootDir, '../../node_modules/.bin/tsc'),
    path.resolve(process.cwd(), 'node_modules/.bin/tsc'),
    path.resolve(currentDir, '../../../../node_modules/.bin/tsc'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'tsc';
}

/**
 * End-to-end typecheck:
 * 1. Generates TCB shadow workspace via 100% native Rust OXC (`angora_oxc`).
 * 2. Checks framework syntax (NG8001, NG8004).
 * 3. Runs native Go TypeScript 7 (`tsc`) on the shadow workspace.
 * 4. Reverse-maps diagnostics to exact lines/columns in original component templates.
 */
export async function runTypecheck(
  rootDir: string = process.cwd(),
  options: TypecheckRunnerOptions = {}
): Promise<TypecheckResult> {
  const startTime = performance.now();

  // 1. Build Shadow TCB Workspace
  const registry = buildTcbWorkspace(rootDir);

  // 2. Validate Framework Syntax (NG8001, NG8002, NG8004)
  const syntaxDiags = validateFrameworkSyntax(registry.componentFiles);

  // 3. Execute Native Go TypeScript 7 (tsc)
  const tscBin = resolveTscBinary(rootDir);
  const tscArgs = ['--noEmit', '-p', registry.tsconfigPath];

  const tscOutput = await new Promise<string>((resolve, reject) => {
    const child = spawn(tscBin, tscArgs, {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', d => {
      stdout += d.toString();
    });
    child.stderr.on('data', d => {
      stderr += d.toString();
    });

    child.on('close', () => {
      resolve(stdout + stderr);
    });

    child.on('error', err => {
      reject(new Error(`Failed to spawn tsc at ${tscBin}: ${err.message}`));
    });
  });

  // 4. Translate Diagnostics
  const typeDiags = translateDiagnostics(tscOutput, registry);
  const allDiags = [...syntaxDiags, ...typeDiags];

  const durationMs = Math.round(performance.now() - startTime);

  // 5. Clean up shadow files if requested
  if (options.clean) {
    try {
      fs.rmSync(registry.tcbDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  }

  // 6. Format output
  const formattedLines: string[] = [];
  for (const d of allDiags) {
    const color = d.severity === 'error' ? '\x1b[31m' : '\x1b[33m';
    const tag = d.severity.toUpperCase();
    formattedLines.push(
      `${d.file}:${d.line}:${d.column} - ${color}${tag} ${d.code}\x1b[0m: ${d.message}`
    );
    if (d.codeFrame) {
      formattedLines.push(d.codeFrame);
    }
    formattedLines.push('');
  }

  return {
    success: allDiags.length === 0,
    diagnostics: allDiags,
    formattedOutput: formattedLines.join('\n'),
    durationMs,
    componentsChecked: registry.shadowFiles.size,
  };
}
