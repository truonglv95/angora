#!/usr/bin/env node

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { generateComponent } from '../src/commands/generate.ts';
import { getProjectTemplate } from '../src/commands/new.ts';

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === '--help' || command === '-h') {
  console.log(`
Angora CLI - Enterprise Fine-Grained Signals Framework

Usage:
  angora new <project-name>           Scaffold a new Angora application
  angora g component <name>           Generate a new standalone component
  angora check                        Run native Go-powered TypeScript 7 typecheck (tsc)
  angora lsp                          Start native Rust LSP server (stdio)
  angora --version                    Show version
`);
  process.exit(0);
}

if (command === '--version' || command === '-v') {
  console.log('angora v0.1.0');
  process.exit(0);
} else if (command === 'check' || command === 'typecheck') {
  const { runTypecheck } = await import('@angora-js/compiler');
  console.log(
    '⚡ Running native Go TypeScript 7 & Angora Template typecheck (tsc + angora_oxc)...'
  );
  try {
    const res = await runTypecheck(process.cwd());
    if (res.success) {
      console.log(
        `\n✨ Successfully typechecked ${res.componentsChecked} components in ${res.durationMs}ms (0 errors)!`
      );
      process.exit(0);
    } else {
      console.error(`\nFound ${res.diagnostics.length} type error(s) in ${res.durationMs}ms:\n`);
      console.error(res.formattedOutput);
      process.exit(1);
    }
  } catch (err) {
    console.error('[Angora CLI] Typecheck failed:', err.message);
    process.exit(1);
  }
} else if (command === 'lsp') {
  const { spawn } = await import('node:child_process');
  const { findRustCompilerBinary } = await import('@angora-js/compiler');
  try {
    const bin = findRustCompilerBinary();
    const child = spawn(bin, ['--lsp-server'], { stdio: 'inherit' });
    child.on('exit', code => process.exit(code ?? 0));
    child.on('error', err => {
      console.error('[Angora CLI] Failed to start native Rust LSP server:', err);
      process.exit(1);
    });
    await new Promise(() => {});
  } catch (err) {
    console.error('[Angora CLI] Error starting LSP server:', err.message);
    process.exit(1);
  }
} else if (command === 'new') {
  const projectName = args[1];
  if (!projectName) {
    console.error('Error: Please specify a project name. Example: angora new my-app');
    process.exit(1);
  }

  const targetDir = resolve(process.cwd(), projectName);
  if (existsSync(targetDir)) {
    console.error(`Error: Directory "${projectName}" already exists.`);
    process.exit(1);
  }

  console.log(`🚀 Creating a new Angora application in ${targetDir}...`);
  const templateFiles = getProjectTemplate(projectName);

  for (const [relPath, content] of Object.entries(templateFiles)) {
    const fullPath = join(targetDir, relPath);
    const dir = resolve(fullPath, '..');
    mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content, 'utf-8');
  }

  console.log(`\n✨ Successfully created ${projectName}!`);
  console.log(`\nNext steps:`);
  console.log(`  cd ${projectName}`);
  console.log(`  bun install (or pnpm install / npm install)`);
  console.log(`  bun run dev\n`);
  process.exit(0);
} else if (command === 'g' || command === 'generate') {
  const type = args[1];
  const name = args[2];

  if (type === 'component' || type === 'c') {
    if (!name) {
      console.error(
        'Error: Please specify a component name. Example: angora g component user-card'
      );
      process.exit(1);
    }

    const { componentFileName, componentCode, testFileName, testCode } = generateComponent(name);
    const srcDir = resolve(process.cwd(), 'src');
    if (!existsSync(srcDir)) {
      mkdirSync(srcDir, { recursive: true });
    }

    writeFileSync(join(srcDir, componentFileName), componentCode, 'utf-8');
    writeFileSync(join(srcDir, testFileName), testCode, 'utf-8');

    console.log(`CREATE src/${componentFileName}`);
    console.log(`CREATE src/${testFileName}`);
    process.exit(0);
  }

  console.error(`Unknown schematic "${type}". Supported: component`);
  process.exit(1);
} else {
  console.error(`Unknown command "${command}". Run "angora --help" for help.`);
  process.exit(1);
}
