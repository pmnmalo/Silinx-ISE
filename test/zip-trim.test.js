// What the release zip leaves out of its node_modules (#3232, scripts/zip-trim.mjs): source maps and type declarations
// of every package, the tests, demos and coverage of the shared projects' packages; on a folder of the test's own, and
// on this checkout's packages: never an entry point, a target of the import map, a licence or a package.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leaveOutUnused, unused, filesOf } from '../scripts/zip-trim.mjs';
import { importMap } from '../server/import-map.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('leaveOutUnused: maps, types, the shared packages\' tests, demos and coverage removed; the rest kept', () => {
  const app = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-trim-'));
  try {
    const files = {
      'node_modules/lib0/encoding.js': 'export {}', 'node_modules/lib0/encoding.d.ts': 'x', 'node_modules/lib0/dist/encoding.cjs': 'x', 'node_modules/lib0/dist/encoding.cjs.map': 'x',
      'node_modules/lib0/coverage/tmp/c.json': 'x'.repeat(100), 'node_modules/lib0/array.test.js': 'x', 'node_modules/lib0/dist/test.cjs': 'x', 'node_modules/lib0/testing.js': 'x',
      'node_modules/yjs/dist/yjs.mjs': 'x', 'node_modules/yjs/dist/yjs.mjs.map': 'x', 'node_modules/yjs/tests/a.js': 'x', 'node_modules/yjs/LICENSE': 'x',
      'node_modules/y-codemirror.next/src/index.js': 'x', 'node_modules/y-codemirror.next/dist/demo.js': 'x', 'node_modules/y-codemirror.next/dist/test.cjs': 'x', 'node_modules/y-codemirror.next/dist/y-codemirror.cjs': 'x',
      'node_modules/@scope/pkg/dist/index.js': 'x', 'node_modules/@scope/pkg/dist/index.d.mts': 'x', 'node_modules/@scope/pkg/test/keep.js': 'x', 'node_modules/@scope/pkg/package.json': '{}',
      'node_modules/other/coverage/keep.json': 'x', 'node_modules/other/node_modules/inner/x.js.map': 'x',
      'node_modules/@codemirror/legacy-modes/mode/vhdl.js': 'x', 'node_modules/@codemirror/legacy-modes/mode/cobol.js': 'x', 'node_modules/@codemirror/legacy-modes/package.json': '{}',
    };
    for (const [f, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(app, f)), { recursive: true }); fs.writeFileSync(path.join(app, f), t); }
    const r = leaveOutUnused(app);
    const left = Object.keys(files).filter(f => fs.existsSync(path.join(app, f)));
    assert.deepEqual(left, ['node_modules/lib0/encoding.js', 'node_modules/lib0/dist/encoding.cjs', 'node_modules/lib0/testing.js',
      'node_modules/yjs/dist/yjs.mjs', 'node_modules/yjs/tests/a.js', 'node_modules/yjs/LICENSE', 'node_modules/y-codemirror.next/src/index.js', 'node_modules/y-codemirror.next/dist/y-codemirror.cjs',
      'node_modules/@scope/pkg/dist/index.js', 'node_modules/@scope/pkg/test/keep.js', 'node_modules/@scope/pkg/package.json', 'node_modules/other/coverage/keep.json',
      'node_modules/other/node_modules/inner/x.js.map', 'node_modules/@codemirror/legacy-modes/mode/vhdl.js', 'node_modules/@codemirror/legacy-modes/package.json']);   // (a nested package: its parent's npm ci tree, left as it is)
    assert.equal(r.files, Object.keys(files).length - left.length);
    assert.equal(r.bytes, 109);
    assert.deepEqual(leaveOutUnused(app), { files: 0, bytes: 0 }, 'again: nothing');
  } finally { fs.rmSync(app, { recursive: true, force: true }); }
});

test('on this checkout\'s packages: no entry point, no import map target, no licence nor package.json left out', () => {
  // (the import map's targets: what the pages load)
  for (const [spec, url] of Object.entries(importMap())) {
    const m = /^\/vendor\/npm\/((?:@[^/]+\/)?[^/]+)\/(.*)$/.exec(url);
    if (m) assert.equal(unused(m[1], m[2]), false, `${spec} -> ${url}`);
  }
  // (each package's entry points: main, module, exports' targets; its licence and package.json)
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  const targets = x => (typeof x === 'string' ? [x] : x && typeof x === 'object' ? Object.values(x).flatMap(targets) : []);
  let n = 0;
  for (const [key, e] of Object.entries(lock.packages)) {
    const m = /^node_modules\/((?:@[^/]+\/)?[^/]+)$/.exec(key);
    if (!m || e.dev || e.link || !fs.existsSync(path.join(ROOT, key, 'package.json'))) continue;
    const pj = JSON.parse(fs.readFileSync(path.join(ROOT, key, 'package.json'), 'utf8'));
    const entries = [pj.main, pj.module, pj.browser, ...targets(pj.exports)].filter(t => typeof t === 'string' && !t.includes('*')).map(t => t.replace(/^\.\//, ''));
    for (const t of entries) if (!/\.(d\.ts|d\.mts|d\.cts|map)$/.test(t)) assert.equal(unused(m[1], t), false, `${m[1]}: ${t}`);
    for (const f of filesOf(path.join(ROOT, key)).filter(f => /^(LICEN[CS]E|COPYING|NOTICE)|^package\.json$/i.test(f))) assert.equal(unused(m[1], f), false, `${m[1]}: ${f}`);
    n++;
  }
  assert.ok(n > 40, `${n} packages looked at`);
});
