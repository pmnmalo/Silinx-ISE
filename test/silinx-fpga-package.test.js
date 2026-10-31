// The toolchain's package, silinx-fpga (#1677, step 6 of the toolchain's separation, #1651): an npm workspace of this
// repository, packages/silinx-fpga/, published on npm from its own tag (#1681), Apache-2.0 for its code and its data.
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

test('#1677 silinx-fpga: a workspace package of this repository, public on npm, Apache-2.0, its own version', () => {
  assert.deepEqual(root.workspaces, ['packages/*']);
  assert.equal(pkg.name, 'silinx-fpga');
  // published by .github/workflows/silinx-fpga-release.yml (#1681): public, with npm's provenance
  assert.equal(pkg.private, undefined);
  assert.deepEqual(pkg.publishConfig, { access: 'public', provenance: true });
  // npm checks the provenance against the package's repository (#2382: E422 with none)
  assert.deepEqual(pkg.repository, { type: 'git', url: 'git+https://github.com/pmnmalo/Silinx-ISE.git', directory: 'packages/silinx-fpga' });
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
  // (test/toolchain-boundary.test.js: the toolchain imports @yowasp/yosys and nextpnr's packages, #2136, #2138)
  assert.deepEqual(Object.keys(pkg.dependencies), ['@silinx/nextpnr-himbaechel-spartan3e', '@silinx/nextpnr-himbaechel-spartan6', '@yowasp/yosys']);
  for (const [name, version] of Object.entries(pkg.dependencies)) assert.equal(version, root.dependencies[name], name);
});

// #1677: the toolchain's modules moved from core/ into the package; #1678: core/'s old paths, which re-exported them,
// are gone (the IDE imports the package's API, test/toolchain-boundary.test.js)
const MOVED = ['fpga/place.js', 'fpga/route.js', 'fpga/bitgen.js', 'fpga/s6/pack.js', 'synth-open.js', 'open-flow-core.js', 'xdl.js', 'ucf.js', 'family.js', 'power.js'];

test('#1677 #1678 the toolchain\'s modules are in the package, core/ has their old paths no more', () => {
  for (const f of MOVED) {
    assert.ok(fs.existsSync(path.join(DIR, 'src', f)), f);
    assert.ok(!fs.existsSync(path.join(ROOT, 'core', f)), `core/${f}`);
  }
  // the IDE's own: its synthesis and flow around the package's (#1674, #1675), the technology view (#1673, its old
  // path in core/fpga re-exports core/techview.js)
  for (const f of ['core/synth-front.js', 'core/flow-ide.js', 'core/flow-models.js', 'core/techview.js', 'core/fpga/techview.js']) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  assert.ok(!fs.existsSync(path.join(DIR, 'src/fpga/techview.js')));
});
