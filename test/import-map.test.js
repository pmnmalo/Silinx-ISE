// The editor's ES modules (CodeMirror 6, #349): the import map of web/index.html names every package
// the editor's module graph imports, each to a file installed in node_modules; the server serves those
// packages and nothing else of node_modules; server/import-map.js reads a page's map.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importMap, importMapPackages } from '../server/import-map.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fileOf = url => path.join(ROOT, 'node_modules', url.replace(/^\/vendor\/npm\//, ''));
// the bare specifiers a module imports (import … from 'x', export … from 'x', import 'x'), not the relative or absolute ones
// (doc comments, /** … */ at a line's start, left out: their examples import nothing)
const bareImports = text => [...text.replace(/^\s*\/\*\*[\s\S]*?\*\//gm, '').matchAll(/(?:^|[\s;}])(?:import|export)\s*(?:[\w*{}\s,$]+\sfrom\s*)?['"]([@\w][\w@./-]*)['"]/g)].map(m => m[1]);

test('importMap / importMapPackages: a page\'s map, its packages (scoped or not, once each); no map, none', () => {
  const html = `<head><script type="importmap">
{ "imports": { "@scope/a": "/vendor/npm/@scope/a/dist/index.js", "@scope/a/sub": "/vendor/npm/@scope/a/sub.js",
  "b": "/vendor/npm/b/index.js", "local": "/js/local.js" } }
</script></head>`;
  assert.deepEqual(importMap(html), { '@scope/a': '/vendor/npm/@scope/a/dist/index.js', '@scope/a/sub': '/vendor/npm/@scope/a/sub.js', b: '/vendor/npm/b/index.js', local: '/js/local.js' });
  assert.deepEqual(importMapPackages(html), ['@scope/a', 'b']);
  assert.deepEqual(importMap('<head></head>'), {});
  assert.deepEqual(importMapPackages('<head></head>'), []);
  // web/index.html by default
  assert.ok(importMapPackages().includes('@codemirror/view'));
});

test('the import map of web/index.html: every target installed; the editor\'s whole module graph resolved by it', () => {
  const map = importMap();
  assert.ok(Object.keys(map).length >= 10, Object.keys(map).join(', '));
  for (const [spec, url] of Object.entries(map)) {
    assert.match(url, /^\/vendor\/npm\//, spec);
    assert.ok(fs.existsSync(fileOf(url)), `${spec} -> ${url} installed`);
  }
  // from the editor's own imports, and a shared project's (core/collab-*.js, #3181; web/js/collab-bind.js, #3182), through every module they load: no
  // bare specifier the map does not name
  const seen = new Set(), missing = [];
  const todo = bareImports(fs.readFileSync(path.join(ROOT, 'web/js/editor.js'), 'utf8'));
  assert.ok(todo.includes('@codemirror/view') && todo.includes('@codemirror/legacy-modes/mode/vhdl'), todo.join(', '));
  const collab = ['core/collab-client.js', 'core/collab-doc.js', 'web/js/collab-bind.js'].flatMap(f => bareImports(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  // (the text editors bound live, #3182: y-codemirror.next)
  assert.deepEqual([...new Set(collab)].sort(), ['@codemirror/state', '@codemirror/view', 'y-codemirror.next', 'y-protocols/awareness', 'yjs']);
  todo.push(...collab);
  // (a shared project's meeting point, #3227: Trystero, its torrent strategy)
  const dynamic = src => [...src.matchAll(/\bimport\(['"]([@\w][\w@./-]*)['"]\)/g)].map(m => m[1]);
  const meetSrc = ['web/js/collab-meet.js', 'core/collab-meet.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8'));
  const meet = meetSrc.flatMap(src => [...bareImports(src), ...dynamic(src)]);
  assert.deepEqual([...new Set(meet)].sort(), ['@trystero-p2p/torrent']);
  todo.push(...meet);
  const relative = src => [...src.matchAll(/(?:^|[\s;}])(?:import|export)\s*(?:[\w*{}\s,$]+\sfrom\s*)?['"](\.\.?\/[^'"]+)['"]/g)].map(m => m[1]);
  const files = new Set();
  // (a module's relative imports: files of its own package, which the server serves whole; lib0's)
  const load = (file, spec) => {
    if (files.has(file)) return;
    files.add(file);
    assert.ok(fs.existsSync(file), `${spec}: ${file} installed`);
    const src = fs.readFileSync(file, 'utf8');
    todo.push(...bareImports(src));
    for (const r of relative(src)) {
      const to = path.resolve(path.dirname(file), r);
      assert.ok(to.startsWith(path.join(ROOT, 'node_modules', spec.match(/^(@[^/]+\/)?[^/]+/)[0]) + path.sep), `${spec}: ${r} inside its package`);
      load(to, spec);
    }
  };
  while (todo.length) {
    const spec = todo.pop();
    if (seen.has(spec)) continue;
    seen.add(spec);
    if (!map[spec]) { missing.push(spec); continue; }
    // (each target a whole module, the packages' dist/index.js bundles, the legacy modes' files; or lib0's modules,
    // y-codemirror.next's, whose ES modules are its src/ files, and Trystero's core's: each package served whole, bundled in
    // the standalone)
    const src = fs.readFileSync(fileOf(map[spec]), 'utf8');
    if (!spec.startsWith('lib0/') && spec !== 'y-codemirror.next' && spec !== '@trystero-p2p/core') assert.deepEqual(relative(src), [], `${spec}: no relative import`);
    load(fileOf(map[spec]), spec);
  }
  assert.deepEqual(missing, []);
  // every package of the map is used (none left over after an update)
  const used = new Set([...seen].map(s => s.match(/^(@[^/]+\/)?[^/]+/)[0]));
  assert.deepEqual(importMapPackages().filter(p => !used.has(p)), []);
  // one copy of @codemirror/state (CodeMirror 6 needs a single instance): no nested one
  const nested = fs.readdirSync(path.join(ROOT, 'node_modules/@codemirror')).filter(p => fs.existsSync(path.join(ROOT, 'node_modules/@codemirror', p, 'node_modules/@codemirror/state')));
  assert.deepEqual(nested, []);
  // one copy of Yjs too (two would not share their types: Yjs warns of it)
  assert.ok(!fs.existsSync(path.join(ROOT, 'node_modules/y-protocols/node_modules/yjs')));
});

let tmp, srv, base;
before(async () => {
  tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'silinx-import-map-'));
  process.env.SILINX_WORKSPACE = path.join(tmp, 'ws');
  process.env.SILINX_CONFIG_DIR = path.join(tmp, 'cfg');
  const { createApp } = await import('../server/server.js');
  const app = await createApp();
  await new Promise(r => { srv = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(async () => {
  srv.closeAllConnections?.();
  await new Promise(r => srv.close(r));
  await fsp.rm(tmp, { recursive: true, force: true });
});

test('the server serves every target of the import map as JavaScript, and no other package of node_modules', async () => {
  for (const [spec, url] of Object.entries(importMap())) {
    const r = await fetch(base + url);
    assert.equal(r.status, 200, `${spec}: ${url}`);
    assert.match(r.headers.get('content-type'), /javascript/, url);
    assert.equal(await r.text(), fs.readFileSync(fileOf(url), 'utf8'), url);
  }
  for (const url of ['/vendor/npm/express/package.json', '/vendor/npm/@yowasp/yosys/package.json', '/vendor/npm/esbuild/package.json', '/vendor/npm/../package.json', '/vendor/codemirror/lib/codemirror.js']) {
    assert.notEqual((await fetch(base + url)).status, 200, url);
  }
});
