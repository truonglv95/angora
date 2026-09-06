#!/usr/bin/env node

import path from 'node:path';
import { scaffoldAngoraProject } from '../src/index.ts';

const args = process.argv.slice(2);
const projectName = args[0] || 'angora-app';
const targetDir = path.resolve(process.cwd(), projectName);

console.log(`\n🐾 Creating a new Angora application in ${targetDir}...\n`);

try {
  const created = scaffoldAngoraProject({
    projectName,
    targetDir,
    template: 'minimal',
  });

  console.log(`✅ Success! Created ${projectName} with ${created.length} files.`);
  console.log('\nNext steps:');
  console.log(`  cd ${projectName}`);
  console.log('  bun install  (or npm install)');
  console.log('  bun run dev  (or npm run dev)\n');
} catch (err) {
  console.error('❌ Failed to scaffold project:', err);
  process.exit(1);
}
