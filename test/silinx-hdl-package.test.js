// The HDL front end's package, silinx-hdl (#1710, step 2 of the front end as a package, docs/TOOLCHAIN-SEPARATION.md
// section 5): an npm workspace of this repository, packages/silinx-hdl/, private until it is published (#1711),
// Apache-2.0. The front end's modules move into it as they are; core/'s old paths re-export them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'packages', 'silinx-hdl');
const read = (f) => fs.readFileSync(f, 'utf8');
const pkg = JSON.parse(read(path.join(DIR, 'package.json')));
const root = JSON.parse(read(path.join(ROOT, 'package.json')));
const lock = JSON.parse(read(path.join(ROOT, 'package-lock.json')));

test('#1710 silinx-hdl: a private workspace package of this repository, Apache-2.0, its own version, no dependency', () => {
  assert.deepEqual(root.workspaces, ['packages/*']);
  assert.equal(pkg.name, 'silinx-hdl');
  assert.equal(pkg.private, true, 'private until it is published (#1711)');
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.type, 'module');
  assert.match(pkg.version, /^0\.\d+\.\d+$/, 'its own semver, 0.x');
  assert.notEqual(pkg.version, root.version);
  // (test/hdl-boundary.test.js: the front end imports no npm package)
  assert.equal(pkg.dependencies, undefined);
  // the lock knows it, as npm writes it
  assert.deepEqual(lock.packages['node_modules/silinx-hdl'], { resolved: 'packages/silinx-hdl', link: true });
  assert.deepEqual(lock.packages['packages/silinx-hdl'], { version: pkg.version, license: 'Apache-2.0' });
});

test('#1710 silinx-hdl: its LICENSE is the Apache License 2.0, as silinx-fpga\'s; its README, changelog and fragments', () => {
  assert.equal(read(path.join(DIR, 'LICENSE')), read(path.join(ROOT, 'packages', 'silinx-fpga', 'LICENSE')));
  assert.ok(read(path.join(DIR, 'LICENSE')).startsWith('                                 Apache License\n                           Version 2.0, January 2004\n'));
  assert.match(read(path.join(DIR, 'README.md')), /^# silinx-hdl\n[\s\S]*Licence: Apache-2\.0 \(\[LICENSE\]\(LICENSE\)\)/);
  assert.match(read(path.join(DIR, 'CHANGELOG.md')), /^# Changelog\n\nWhat changed in each version of silinx-hdl/);
  assert.match(read(path.join(DIR, 'changes', 'README.md')), /^# silinx-hdl's changelog fragments\n/);
  // NOTICE names it, as silinx-fpga
  assert.match(read(path.join(ROOT, 'NOTICE')), /silinx-hdl \(packages\/silinx-hdl[^)]*\), is Copyright 2026 Pedro Maló too, under the Apache License 2\.0/);
});

// core/'s old paths: a comment and the re-export of the moved module
const shims = [];
(function walk(dir) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel);
    else if (/\.js$/.test(e.name)) {
      const m = read(path.join(ROOT, rel)).match(/^export \* from '((?:\.\.\/)+packages\/silinx-hdl\/[^']+)';$/m);
      if (m) shims.push([rel, path.posix.join(path.posix.dirname(rel), m[1])]);
    }
  }
})('core');
// the package's modules
const sources = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? sources(`${dir}/${e.name}`) : /\.js$/.test(e.name) ? [`${dir}/${e.name}`] : []));
const moved = sources('packages/silinx-hdl/src').sort();

test('#1710 the front end\'s modules are in the package, core/\'s old paths re-export them', async () => {
  assert.equal(shims.length, 50);
  assert.deepEqual(shims.map(([, m]) => m).sort(), moved, 'every module of the package has its old path');
  for (const [old, mod] of shims) {
    assert.equal(mod, `packages/silinx-hdl/src/${old.slice('core/'.length)}`, old);
    assert.match(read(path.join(ROOT, old)), /^\/\/ Silinx - moved to packages\/silinx-hdl\/src\/[\w/-]+\.js \(#1710[^\n]*\n[^\n]+\n$/, `${old}: a comment and the re-export only`);
    const a = await import(pathToFileURL(path.join(ROOT, old)).href), b = await import(pathToFileURL(path.join(ROOT, mod)).href);   // (a URL: on Windows a path's C: reads as a URL's scheme, #3616)
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), old);
    assert.ok(Object.keys(b).length > 0, mod);
    for (const k of Object.keys(b)) assert.equal(a[k], b[k], `${old} ${k}`);
  }
});

test('#1710 the package\'s modules import one another only, each relative import a module of the package', () => {
  const missing = [];
  for (const f of moved) {
    // (an import or export statement at the start of a line, or a dynamic import: not a message's "from '…'")
    for (const [, a, b] of read(path.join(ROOT, f)).matchAll(/^\s*(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/gm)) {
      const spec = a || b;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(f), spec));
      if (!spec.startsWith('./') && !spec.startsWith('../')) missing.push(`${f}: ${spec}`);
      else if (!target.startsWith('packages/silinx-hdl/src/') || !fs.existsSync(path.join(ROOT, target))) missing.push(`${f}: ${spec}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('#1710 the moved front end reads VHDL and Verilog through core/\'s old paths and the package alike', async () => {
  const vhdl = await import('../core/vhdl/parser.js');
  const verilog = await import('../core/verilog/parser.js');
  const { parse: parseVhdl } = await import('../packages/silinx-hdl/src/vhdl/parser.js');
  const { parse: parseVerilog } = await import('../packages/silinx-hdl/src/verilog/parser.js');
  assert.equal(vhdl.parse, parseVhdl);
  assert.equal(verilog.parse, parseVerilog);
  const v = parseVhdl('entity e is port (a : in bit; y : out bit); end e;\narchitecture r of e is begin y <= not a; end r;\n', 'e.vhd');
  assert.deepEqual(v.errors, []);
  assert.deepEqual(v.units.map((u) => [u.kind, u.name, u.arch]), [['module', 'e', 'r']]);
  const g = parseVerilog('module m(input a, output y);\n  assign y = ~a;\nendmodule\n', 'm.v');
  assert.deepEqual(g.errors, []);
  assert.deepEqual(g.units.map((u) => [u.kind, u.name]), [['module', 'm']]);
  // the UNISIM models: a primitive's VHDL source, given to a design that uses the library
  const { primitiveSources, UNISIM_SOURCE } = await import('../core/unisim.js');
  assert.deepEqual(primitiveSources([{ path: 't.vhd', text: 'library unisim;\nuse unisim.vcomponents.all;\n' }]).map((s) => s.path), [UNISIM_SOURCE.path]);
});

test('#1710 the moved front end compiles, elaborates, simulates and writes the flat Verilog, through core/\'s old paths and the package alike', async () => {
  const old = await import('../core/compile.js'), pkgCompile = await import('../packages/silinx-hdl/src/compile.js');
  const { toVerilog } = await import('../packages/silinx-hdl/src/synth-verilog.js');
  assert.equal(old.compile, pkgCompile.compile);
  assert.equal((await import('../core/synth-verilog.js')).toVerilog, toVerilog);
  const src = [{ path: 'c.v', text: 'module c(input clk, output reg [1:0] q = 0);\n  always @(posedge clk) q <= q + 1;\nendmodule\n' },
    { path: 'tb.v', text: 'module tb;\n  reg clk = 0; wire [1:0] q;\n  c u(.clk(clk), .q(q));\n  always #5 clk = ~clk;\n  initial begin #42 $display("q=%0d", q); $finish; end\nendmodule\n' }];
  const lib = pkgCompile.compile(src);
  assert.deepEqual(lib.errors, []);
  assert.deepEqual(pkgCompile.topCandidates(lib), ['tb']);
  const design = pkgCompile.elaborate(lib, 'c');
  assert.deepEqual(design.diags, []);
  assert.match(toVerilog(design, { name: 'c' }).text, /^module c\b/m);
  const { sim, errors } = old.simulate(src, 'tb');
  assert.deepEqual(errors, []);
  assert.deepEqual(sim.log.filter((l) => l.kind === 'print').map((l) => [l.time, l.text]), [[42000, 'q=0']]);   // (in ps: four rising edges, 4 mod 4)
});
