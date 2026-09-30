import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const dist = new URL('../dist/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('.vite/manifest.json', dist), 'utf8'));
const maxChunkBytes = 500_000; // Same uncompressed threshold as Vite's default warning.

function staticDependencies(roots) {
  const visited = new Set();
  const active = new Set();
  function visit(key) {
    assert.ok(!active.has(key), `Circular static chunk dependency: ${key}`);
    if (visited.has(key)) return;
    assert.ok(manifest[key], `Missing imported chunk: ${key}`);
    active.add(key);
    for (const dependency of manifest[key].imports ?? []) visit(dependency);
    active.delete(key);
    visited.add(key);
  }
  roots.forEach(visit);
  return visited;
}

async function measure(keys) {
  const files = new Set([...keys].map(key => manifest[key].file).filter(file => file.endsWith('.js')));
  let raw = 0;
  let gzip = 0;
  for (const file of files) {
    const data = await readFile(new URL(file, dist));
    raw += data.length;
    gzip += gzipSync(data).length;
  }
  return { files: files.size, raw, gzip };
}

const chunks = await Promise.all([...new Set(Object.values(manifest).map(chunk => chunk.file))]
  .filter(file => file.endsWith('.js'))
  .map(async file => ({ file, size: (await stat(new URL(file, dist))).size })));
chunks.sort((a, b) => b.size - a.size);
assert.ok(chunks.length > 0, 'No production JavaScript found. Run npm run build first.');
for (const chunk of chunks) assert.ok(chunk.size <= maxChunkBytes, `${chunk.file} is ${chunk.size} bytes; budget is ${maxChunkBytes}.`);

const initialKeys = Object.keys(manifest).filter(key => manifest[key].isEntry);
assert.ok(initialKeys.length > 0, 'No application entry found.');
const initial = staticDependencies(initialKeys);
const routes = Object.keys(manifest).filter(key => key.startsWith('src/pages/') && manifest[key].isDynamicEntry);
assert.ok(routes.length > 0, 'Page routes must remain lazy-loaded.');
for (const key of routes) assert.ok(!initial.has(key), `${key} unexpectedly moved into the initial download.`);
// Also examine lazy chunks for missing dependencies and manual-splitting cycles.
staticDependencies(Object.keys(manifest));

const entry = await measure(initial);
const landing = await measure(staticDependencies([...initialKeys, 'src/pages/HomePage.tsx']));
assert.ok(entry.raw <= 700_000, `Initial JavaScript grew to ${entry.raw} bytes; budget is 700000.`);
assert.ok(landing.raw <= 900_000, `Landing-page JavaScript grew to ${landing.raw} bytes; budget is 900000.`);

const kb = bytes => `${(bytes / 1000).toFixed(2)} kB`;
console.log(`Largest chunks: ${chunks.slice(0, 4).map(chunk => `${chunk.file}: ${kb(chunk.size)}`).join('\n')}`);
console.log(`Initial graph: ${kb(entry.raw)} raw / ${kb(entry.gzip)} gzip (${entry.files} files)`);
console.log(`Landing graph: ${kb(landing.raw)} raw / ${kb(landing.gzip)} gzip (${landing.files} files)`);
console.log(`Bundle checks passed: ${chunks.length} chunks, ${routes.length} lazy pages, no static chunk cycles.`);
