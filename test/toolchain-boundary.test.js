// The Silinx toolchain's boundary (#1672, step 1 of #1651, docs/TOOLCHAIN-SEPARATION.md): the toolchain's modules
// (synthesis, pack, place, route, timing, bitgen, the flow, their formats and parts), in its package since #1677
// (packages/silinx-fpga/src), import nothing of the IDE. ALLOWED lists the imports across that were left, each with
// its importer; it only shrinks (as test/code-size.test.js), and is empty since #1677. The other way (#1678): the IDE
// imports the package through its API only, its entries (src/index.js, src/parts.js, src/node.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// the toolchain's modules: its package's
const TOOLCHAIN = [/^packages\/silinx-fpga\//];
const inToolchain = (f) => TOOLCHAIN.some((r) => r.test(f));

// the IDE's modules the toolchain imports on 2026-10-27, `importer -> imported`; never add to it
const ALLOWED = new Set([
]);
// the npm packages it imports (its dependencies once it is a package of its own)
const PACKAGES = new Set(['@yowasp/yosys']);

function sources(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === 'devices' ? [] : sources(rel);
    return /\.m?js$/.test(e.name) ? [rel] : [];
  });
}

// the imports of a module's text that leave the toolchain: `importer -> imported` for a module of the
// repository, `importer -> package` for an npm package (node: built-ins are not counted)
const IMPORTS = /(?:\bimport\s[^;]*?from\s*|\bexport\s[^;]*?from\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"`]([^'"`]+)['"`]/g;
function crossings(file, text) {
  const out = [];
  for (const [, spec] of text.matchAll(IMPORTS)) {
    if (spec.startsWith('node:')) continue;
    let target;
    if (spec.startsWith('.')) target = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
    else if (spec.startsWith('/')) target = spec.slice(1); // the browser's /core/… URLs
    else target = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
    if (!inToolchain(target)) out.push(`${file} -> ${target}`);
  }
  return out;
}

const toolchain = sources('packages/silinx-fpga/src').filter(inToolchain).sort();
const found = toolchain.flatMap((f) => crossings(f, fs.readFileSync(path.join(ROOT, f), 'utf8')));
// a module of the repository is a .js path; a package, its name
const isPackage = (c) => !/\.m?js$/.test(c.split(' -> ')[1]);

test('#1672 toolchain boundary: how the imports across are found', () => {
  const text = [
    "import { a } from './route.js';", // within
    "import * as c from '../../../../core/compile.js';", // across, relative
    "export { s } from '../../../../core/schdoc.js';", // a re-export
    "const m = await import('/core/sim-model.js');", // dynamic, the browser's URL
    "import fs from 'node:fs';", // a built-in
    "import { runYosys } from '@yowasp/yosys/x.js';", // a package
    "import elk from 'elkjs/lib/elk.bundled.js';",
  ].join('\n');
  assert.deepEqual(crossings('packages/silinx-fpga/src/fpga/x.js', text), [
    'packages/silinx-fpga/src/fpga/x.js -> core/compile.js',
    'packages/silinx-fpga/src/fpga/x.js -> core/schdoc.js',
    'packages/silinx-fpga/src/fpga/x.js -> core/sim-model.js',
    'packages/silinx-fpga/src/fpga/x.js -> @yowasp/yosys',
    'packages/silinx-fpga/src/fpga/x.js -> elkjs',
  ]);
  assert.deepEqual(crossings('packages/silinx-fpga/src/synth-open.js', "import { x } from './synth-open-yosys.js';\nimport { u } from './ucf.js';"), []);
});

test('#1672 toolchain boundary: the toolchain\'s modules are found', () => {
  for (const f of ['fpga/route.js', 'fpga/bitgen.js', 'fpga/s6/bitstream.js', 'synth-open.js', 'open-flow-core.js', 'xdl.js',
    'ucf.js', 'family.js']) assert.ok(toolchain.includes(`packages/silinx-fpga/src/${f}`), f);
  for (const f of ['core/compile.js', 'core/sim-model.js', 'core/schdoc.js', 'core/synth-front.js', 'core/fpga/techview.js']) assert.ok(!toolchain.includes(f), f);
  assert.ok(toolchain.length >= 70, `${toolchain.length} modules`);
});

test('#1672 toolchain boundary: no new import of the IDE, no listed one gone', () => {
  const ide = found.filter((c) => !isPackage(c));
  assert.deepEqual(ide.filter((c) => !ALLOWED.has(c)), [], 'the toolchain imports the IDE: give it through the flow\'s io instead (docs/TOOLCHAIN-SEPARATION.md)');
  assert.deepEqual([...ALLOWED].filter((c) => !ide.includes(c)), [], 'gone: remove them from ALLOWED');
});

test('#1672 toolchain boundary: no npm package but its dependencies', () => {
  const pkgs = new Set(found.filter(isPackage).map((c) => c.split(' -> ')[1]));
  assert.deepEqual([...pkgs].filter((p) => !PACKAGES.has(p)), []);
  assert.deepEqual([...PACKAGES].filter((p) => !pkgs.has(p)), [], 'no longer imported: remove it from PACKAGES');
});

// #1678: the IDE (server/, web/, core/, scripts/, bin/) imports the package's entries only: parts.js and index.js (Node
// and the browser), node.js (Node: server/, scripts/, bin/); the tests and the research may read its modules
const ENTRIES = ['packages/silinx-fpga/src/index.js', 'packages/silinx-fpga/src/parts.js', 'packages/silinx-fpga/src/node.js'];
function ideImports(dir) {
  if (!fs.existsSync(path.join(ROOT, dir))) return [];
  return sources(dir).flatMap((f) => [...fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(IMPORTS)].map(([, spec]) => {
    const target = spec.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(f), spec)) : spec.startsWith('/') ? spec.slice(1) : null;
    return target && inToolchain(target) ? [f, target] : null;
  }).filter(Boolean));
}

test('#1678 the IDE imports the toolchain through its API only, each import its lightest entry', async () => {
  const all = ['server', 'web', 'core', 'scripts', 'bin'].flatMap(ideImports);
  assert.deepEqual(all.filter(([, t]) => !ENTRIES.includes(t)).map((x) => x.join(' -> ')), [], 'import the package\'s API (src/index.js, parts.js, node.js), or add the name to it');
  const browser = all.filter(([f]) => /^(web|core)\//.test(f) && !/-node(-worker)?\.js$/.test(f));
  assert.deepEqual(browser.filter(([, t]) => t.endsWith('/node.js')).map((x) => x.join(' -> ')), []);
  // each entry used (the pages the light one)
  for (const e of ENTRIES) assert.ok(all.some(([, t]) => t === e), e);
  assert.ok(all.some(([f, t]) => f.startsWith('web/') && t.endsWith('/parts.js')));
  // each import the lightest entry with its names: parts.js, then index.js, then node.js (server/'s modules go into the
  // browser's bundle too, the standalone edition's: none of them may take node.js for a name the others have)
  const parts = Object.keys(await import('../packages/silinx-fpga/src/parts.js'));
  const index = Object.keys(await import('../packages/silinx-fpga/src/index.js'));
  const heavier = [];
  for (const dir of ['server', 'web', 'core', 'scripts', 'bin']) {
    if (!fs.existsSync(path.join(ROOT, dir))) continue;
    for (const f of sources(dir)) {
      const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
      for (const [, a, b, entry] of text.matchAll(/(?:import \{([^}]*)\} from |const \{([^}]*)\} = await import\()'[^']*silinx-fpga\/src\/(index|node)\.js'/g)) {
        const names = (a || b).split(',').map((n) => n.trim().split(/\s+as\s+|\s*:\s*/)[0]).filter(Boolean);
        const lightest = names.every((n) => parts.includes(n)) ? 'parts' : names.every((n) => index.includes(n)) ? 'index' : 'node';
        if (lightest !== entry) heavier.push(`${f}: ${entry}.js for ${names.join(', ')} (${lightest}.js has them)`);
      }
    }
  }
  assert.deepEqual(heavier, []);
  // no old path left: core/ re-exports none of the package's modules
  assert.deepEqual(sources('core').filter((f) => /^export \* from '(\.\.\/)+packages\//m.test(fs.readFileSync(path.join(ROOT, f), 'utf8'))), []);
});

// #1680: the package's own tests (packages/silinx-fpga/test, their helper and fixtures) import nothing of the IDE either,
// nor the research: the package is tested from itself
test('#1680 the package\'s tests import the package alone', () => {
  const tests = sources('packages/silinx-fpga/test').filter((f) => !f.includes('/fixtures/'));
  assert.ok(tests.length >= 16 && tests.includes('packages/silinx-fpga/test/fpga-sim.js'), String(tests.length));
  const out = tests.flatMap((f) => crossings(f, fs.readFileSync(path.join(ROOT, f), 'utf8'))).filter((c) => !isPackage(c));
  assert.deepEqual(out, []);
  // the IDE's tests that use its simulators of a packed design import them from the package
  assert.ok(!fs.existsSync(path.join(ROOT, 'test/fpga-sim.js')) && !fs.existsSync(path.join(ROOT, 'test/fixtures/fpga')));
});
