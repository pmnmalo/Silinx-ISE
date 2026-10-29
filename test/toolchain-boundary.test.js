// The Silinx toolchain's boundary (#1672, step 1 of #1651, docs/TOOLCHAIN-SEPARATION.md): the toolchain's modules
// (synthesis, pack, place, route, timing, bitgen, the flow, their formats and parts), in its package since #1677
// (packages/silinx-fpga/src; core/'s old paths re-export them), import nothing of the IDE. ALLOWED lists the imports
// across that were left, each with its importer; it only shrinks (as test/code-size.test.js), and is empty since #1677.
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
  for (const f of ['core/compile.js', 'core/sim-model.js', 'core/schdoc.js', 'core/synth-open.js', 'core/fpga/techview.js']) assert.ok(!toolchain.includes(f), f);
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
