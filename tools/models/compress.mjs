#!/usr/bin/env node
/**
 * Meshopt-compress every GLB under public/models.
 *
 * The generators emit raw glTF binaries: 3.6 MB for the starter library and
 * a 2.5 MB dragon, all uncompressed geometry. EXT_meshopt_compression cuts
 * that by well over half and decodes in a few milliseconds with the decoder
 * three.js already bundles, so no external decoder files and nothing the CSP
 * has to allow beyond `wasm-unsafe-eval`. Draco was the alternative; it needs
 * separate decoder assets and a CDN fetch by default, so meshopt it is.
 *
 * Idempotent: a file that already carries the extension is skipped, so this
 * can run after every `generate:starters` and in CI without growing anything.
 *
 *   node tools/models/compress.mjs            # all of public/models
 *   node tools/models/compress.mjs path.glb   # one file
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLI = path.join(ROOT, 'node_modules/.bin/gltf-transform');

function listGlbs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listGlbs(full));
    else if (entry.name.endsWith('.glb')) out.push(full);
  }
  return out;
}

function hasMeshopt(file) {
  // The JSON chunk starts at byte 20; the extension name appears in
  // `extensionsUsed` when the file is already compressed.
  const head = fs.readFileSync(file).subarray(0, 64 * 1024).toString('latin1');
  return head.includes('EXT_meshopt_compression');
}

function isBinaryGlb(file) {
  const magic = Buffer.alloc(4);
  const fd = fs.openSync(file, 'r');
  try { fs.readSync(fd, magic, 0, 4, 0); } finally { fs.closeSync(fd); }
  return magic.toString('latin1') === 'glTF';
}

/**
 * Files whose exact vertex positions are a contract. The red dragon's
 * metadata pins accessor bounds to three decimals
 * (test/editor/model-render-contract.test.js) and even 16-bit quantization
 * moves them by 0.001, so it ships uncompressed at 141 KB.
 */
const EXCLUDE = new Set(['public/models/red-metal-dragon.glb']);

const targets = process.argv.length > 2 ? process.argv.slice(2).map((f) => path.resolve(f)) : listGlbs(path.join(ROOT, 'public/models'));
let before = 0;
let after = 0;
let done = 0;
for (const file of targets) {
  if (EXCLUDE.has(path.relative(ROOT, file))) {
    console.log(`  - ${path.relative(ROOT, file)} (excluded: exact bounds are a contract)`);
    continue;
  }
  const size = fs.statSync(file).size;
  if (hasMeshopt(file)) {
    console.log(`  = ${path.relative(ROOT, file)} (already compressed)`);
    before += size; after += size;
    continue;
  }
  // The output must end in .glb: the CLI picks the container from the
  // extension, and a bare `.tmp` produced JSON glTF plus a sidecar .bin.
  const tmp = file.replace(/\.glb$/, '.tmp.glb');
  // 16-bit positions rather than the 14-bit default: the render contracts pin
  // metadata bounds to three decimals against the file's accessor min/max, and
  // 14 bits over a six-unit model nudged the dragon's by 0.001.
  execFileSync(CLI, ['meshopt', file, tmp, '--level', 'medium', '--quantize-position', '16'], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (!isBinaryGlb(tmp) || fs.existsSync(`${tmp}.bin`)) {
    fs.rmSync(tmp, { force: true }); fs.rmSync(`${tmp}.bin`, { force: true });
    throw new Error(`${path.relative(ROOT, file)}: compressor did not produce a binary GLB`);
  }
  const next = fs.statSync(tmp).size;
  fs.renameSync(tmp, file);
  before += size; after += next; done++;
  console.log(`  ✓ ${path.relative(ROOT, file)} ${(size / 1024).toFixed(0)}K → ${(next / 1024).toFixed(0)}K`);
}
const pct = before ? Math.round((1 - after / before) * 100) : 0;
console.log(`\n${done} file(s) compressed: ${(before / 1024).toFixed(0)}K → ${(after / 1024).toFixed(0)}K (-${pct}%)`);
