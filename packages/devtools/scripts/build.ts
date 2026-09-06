import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const DEVTOOLS_DIR = path.resolve(import.meta.dir, '..');
const SRC_DIR = path.join(DEVTOOLS_DIR, 'src');
const DIST_DIR = path.join(DEVTOOLS_DIR, 'dist');
const ICONS_DIR = path.join(DEVTOOLS_DIR, 'icons');
const DIST_ICONS_DIR = path.join(DIST_DIR, 'icons');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function generatePng(size: number): Buffer {
  function crc32(buf: Buffer): number {
    const table: number[] = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c;
    }
    let crc = 0 ^ -1;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ -1) >>> 0;
  }

  function chunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const typeAndData = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData), 0);
    return Buffer.concat([len, typeAndData, crc]);
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = chunk('IHDR', ihdrData);

  const raw = Buffer.alloc(size * (1 + size * 4));
  let pos = 0;
  const cx = size / 2;
  const cy = size / 2;
  const rBg = size * 0.46;

  const toes = [
    { x: 0.28 * size, y: 0.38 * size, r: 0.08 * size },
    { x: 0.42 * size, y: 0.28 * size, r: 0.085 * size },
    { x: 0.58 * size, y: 0.28 * size, r: 0.085 * size },
    { x: 0.72 * size, y: 0.38 * size, r: 0.08 * size },
  ];
  const padCx = 0.5 * size;
  const padCy = 0.62 * size;
  const padRx = 0.22 * size;
  const padRy = 0.18 * size;

  for (let y = 0; y < size; y++) {
    raw[pos++] = 0; // Filter None
    for (let x = 0; x < size; x++) {
      const distToBg = Math.hypot(x - cx, y - cy);
      if (distToBg <= rBg) {
        let isPaw = false;
        const dx = (x - padCx) / padRx;
        const dy = (y - padCy) / padRy;
        if (dx * dx + dy * dy <= 1) {
          isPaw = true;
        }
        for (const t of toes) {
          if (Math.hypot(x - t.x, y - t.y) <= t.r) {
            isPaw = true;
            break;
          }
        }

        if (isPaw) {
          raw[pos++] = 255;
          raw[pos++] = 255;
          raw[pos++] = 255;
          raw[pos++] = 255;
        } else {
          raw[pos++] = 99; // #6366f1
          raw[pos++] = 102;
          raw[pos++] = 241;
          raw[pos++] = 255;
        }
      } else {
        raw[pos++] = 0;
        raw[pos++] = 0;
        raw[pos++] = 0;
        raw[pos++] = 0;
      }
    }
  }

  const idat = chunk('IDAT', zlib.deflateSync(raw));
  const iend = chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

async function build() {
  console.log('🚀 Building @angora-js/devtools Chrome Extension...');

  ensureDir(DIST_DIR);
  ensureDir(DIST_ICONS_DIR);
  ensureDir(ICONS_DIR);

  // 1. Generate Icons
  console.log('📦 Generating extension icons (16px, 48px, 128px)...');
  const icon16 = generatePng(16);
  const icon48 = generatePng(48);
  const icon128 = generatePng(128);

  fs.writeFileSync(path.join(DIST_ICONS_DIR, 'icon16.png'), icon16);
  fs.writeFileSync(path.join(DIST_ICONS_DIR, 'icon48.png'), icon48);
  fs.writeFileSync(path.join(DIST_ICONS_DIR, 'icon128.png'), icon128);

  fs.writeFileSync(path.join(ICONS_DIR, 'icon16.png'), icon16);
  fs.writeFileSync(path.join(ICONS_DIR, 'icon48.png'), icon48);
  fs.writeFileSync(path.join(ICONS_DIR, 'icon128.png'), icon128);

  // 2. Bundle Extension UI & background scripts as IIFE (compatible with Chrome MV3 & file://)
  console.log('⚡ Compiling Extension scripts (IIFE for browser & extension sandbox)...');
  const browserScripts = [
    { entry: path.join(SRC_DIR, 'devtools.ts'), out: 'devtools.js' },
    { entry: path.join(SRC_DIR, 'panel.ts'), out: 'panel.js' },
    { entry: path.join(SRC_DIR, 'popup.ts'), out: 'popup.js' },
    { entry: path.join(SRC_DIR, 'background.ts'), out: 'background.js' },
    { entry: path.join(SRC_DIR, 'content.ts'), out: 'content.js' },
  ];

  for (const script of browserScripts) {
    const res = await Bun.build({
      entrypoints: [script.entry],
      target: 'browser',
      format: 'iife',
      minify: false,
      sourcemap: 'none',
    });
    if (!res.success) {
      console.error(`❌ Failed to build ${script.out}:`, res.logs);
      process.exit(1);
    }
    const code = await res.outputs[0].text();
    fs.writeFileSync(path.join(DIST_DIR, script.out), code, 'utf-8');
  }

  // Also build ESM backend & index for npm/runtime consumption
  await Bun.build({
    entrypoints: [path.join(SRC_DIR, 'backend.ts'), path.join(SRC_DIR, 'index.ts')],
    outdir: DIST_DIR,
    target: 'browser',
    format: 'esm',
    minify: false,
    sourcemap: 'none',
  });

  // 3. Copy Static Assets (HTML & CSS)
  console.log('📄 Copying HTML and CSS files...');
  fs.copyFileSync(path.join(SRC_DIR, 'devtools.html'), path.join(DIST_DIR, 'devtools.html'));
  fs.copyFileSync(path.join(SRC_DIR, 'panel.html'), path.join(DIST_DIR, 'panel.html'));
  fs.copyFileSync(path.join(SRC_DIR, 'panel.css'), path.join(DIST_DIR, 'panel.css'));
  fs.copyFileSync(path.join(SRC_DIR, 'popup.html'), path.join(DIST_DIR, 'popup.html'));
  fs.copyFileSync(path.join(SRC_DIR, 'popup.css'), path.join(DIST_DIR, 'popup.css'));

  // 4. Generate Manifest V3 for dist
  console.log('📋 Creating manifest.json in dist/ ...');
  const manifest = {
    manifest_version: 3,
    name: 'Angora DevTools',
    version: '2.0.0',
    description:
      'High-performance developer tools for debugging signals, components, and routing in Angora applications',
    icons: {
      '16': 'icons/icon16.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png',
    },
    action: {
      default_popup: 'popup.html',
      default_icon: {
        '16': 'icons/icon16.png',
        '48': 'icons/icon48.png',
        '128': 'icons/icon128.png',
      },
    },
    devtools_page: 'devtools.html',
    background: {
      service_worker: 'background.js',
      type: 'module',
    },
    content_scripts: [
      {
        matches: ['<all_urls>'],
        js: ['content.js'],
        run_at: 'document_start',
      },
    ],
    permissions: ['tabs', 'activeTab', 'scripting'],
    host_permissions: ['<all_urls>'],
  };

  fs.writeFileSync(
    path.join(DIST_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );

  console.log('✅ Angora DevTools successfully built!');
  console.log(`📁 Extension output: ${DIST_DIR}`);
  console.log('\nTo test in Chrome:');
  console.log('1. Open chrome://extensions/');
  console.log('2. Toggle "Developer mode" on (top-right switch).');
  console.log('3. Click "Load unpacked" and select:');
  console.log(`   ${DIST_DIR}`);
}

build().catch(err => {
  console.error('Build error:', err);
  process.exit(1);
});
