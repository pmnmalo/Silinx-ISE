// The toolchain's package, silinx-fpga (#1677, step 6 of the toolchain's separation, #1651): an npm workspace of this
// repository, packages/silinx-fpga/, private until it is published (#1681), Apache-2.0 for its code and its data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'packages', 'silinx-fpga');
const read = (f) => fs.readFileSync(f, 'utf8');
const pkg = JSON.parse(read(path.join(DIR, 'package.json')));
const root = JSON.parse(read(path.join(ROOT, 'package.json')));
const lock = JSON.parse(read(path.join(ROOT, 'package-lock.json')));

test('#1677 silinx-fpga: a private workspace package of this repository, Apache-2.0, its own version', () => {
  assert.deepEqual(root.workspaces, ['packages/*']);
  assert.equal(pkg.name, 'silinx-fpga');
  assert.equal(pkg.private, true, 'private until it is published (#1681)');
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.type, 'module');
  assert.match(pkg.version, /^0\.\d+\.\d+$/, 'its own semver, 0.x');
  assert.notEqual(pkg.version, root.version);
  // the lock knows it, as npm writes it
  assert.deepEqual(lock.packages['node_modules/silinx-fpga'], { resolved: 'packages/silinx-fpga', link: true });
  assert.equal(lock.packages['packages/silinx-fpga'].version, pkg.version);
  assert.deepEqual(lock.packages['packages/silinx-fpga'].dependencies, pkg.dependencies);
});

test('#1677 silinx-fpga: its LICENSE is the Apache License 2.0, unchanged', () => {
  const text = read(path.join(DIR, 'LICENSE'));
  assert.ok(text.startsWith('                                 Apache License\n                           Version 2.0, January 2004\n'));
  assert.ok(!text.includes('\r'));
  assert.equal(text.split('\n').length, 202);
  assert.match(text, /\n {3}END OF TERMS AND CONDITIONS\n/);
  assert.match(text, /\n {3}Copyright \[yyyy\] \[name of copyright owner\]\n/);
});

test('#1677 silinx-fpga: its dependencies are the toolchain\'s npm packages, at the versions the IDE pins', () => {
  // (test/toolchain-boundary.test.js: the toolchain imports @yowasp/yosys alone)
  assert.deepEqual(Object.keys(pkg.dependencies), ['@yowasp/yosys']);
  for (const [name, version] of Object.entries(pkg.dependencies)) assert.equal(version, root.dependencies[name], name);
});

// #1677: the toolchain's modules moved from core/ into the package; each old path re-exports its module, so its
// importers (server/, web/js, scripts/, research/, the tests) are unchanged
const shims = [];
(function walk(dir) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel);
    else if (/\.js$/.test(e.name)) {
      const m = read(path.join(ROOT, rel)).match(/^export \* from '([^']+)';$/m);
      if (m) shims.push([rel, path.posix.join(path.posix.dirname(rel), m[1])]);
    }
  }
})('core');
// what core/ adds to two of them: the IDE's synthesis and flow from the toolchain's (#1674, #1675)
const IDE_ADDS = { 'core/synth-open.js': ['synthesisInput', 'synthesizeOpen'], 'core/open-flow-core.js': ['runOpenFlow'] };

test('#1677 the toolchain\'s modules are in the package, core/\'s old paths re-export them', async () => {
  assert.equal(shims.length, 75);
  for (const [old, moved] of shims) {
    assert.match(moved, /^packages\/silinx-fpga\/src\/.+\.js$/, old);
    assert.equal(moved, `packages/silinx-fpga/src/${old.slice('core/'.length)}`, old);
    assert.ok(fs.existsSync(path.join(ROOT, moved)), moved);
  }
  for (const [old, moved] of shims.filter(([f]) => !f.endsWith('-worker.js'))) {
    const a = await import(path.join(ROOT, old)), b = await import(path.join(ROOT, moved));
    assert.deepEqual(Object.keys(a).sort(), [...Object.keys(b), ...(IDE_ADDS[old] || [])].sort(), old);
    for (const k of Object.keys(b)) assert.equal(a[k], b[k], `${old} ${k}`);
  }
  // the technology view stays in the IDE (#1673): its old path in core/fpga re-exports core/techview.js
  assert.ok(fs.existsSync(path.join(ROOT, 'core/fpga/techview.js')) && !fs.existsSync(path.join(ROOT, 'packages/silinx-fpga/src/fpga/techview.js')));
});
