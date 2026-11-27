// The demo route's JavaScript must stay small, and Firebase must not be part of it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { root } from './env.mjs';

const LIMIT = 120 * 1024;
const dist = join(root, process.env.OUT_DIR || 'dist');
const manifest = JSON.parse(readFileSync(join(dist, '.vite', 'manifest.json'), 'utf8'));

const entry = Object.keys(manifest).find((name) => manifest[name].isEntry);
const files = new Set();
const follow = (name) => {
  const chunk = manifest[name];
  if (files.has(chunk.file)) return;
  files.add(chunk.file);
  (chunk.imports ?? []).forEach(follow);
};
follow(entry);

let total = 0;
for (const file of files) {
  const source = readFileSync(join(dist, file));
  if (source.includes('identitytoolkit')) {
    console.error(`budget: Firebase is part of the demo route (${file}).`);
    process.exit(1);
  }
  total += gzipSync(source).length;
}

console.log(`budget: demo route JavaScript ${(total / 1024).toFixed(1)} KB gzipped (limit ${LIMIT / 1024} KB)`);
if (total > LIMIT) process.exit(1);
