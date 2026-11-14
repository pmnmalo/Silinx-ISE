// The HDL front end's boundary (#1709, step 1 of silinx-hdl, docs/TOOLCHAIN-SEPARATION.md section 5): the front
// end (what compile.js, synth-verilog.js and unisim.js reach: the VHDL and Verilog parsers, the elaborator, the
// interpreter and simulator, the flat Verilog's synth-*.js), in its package (packages/silinx-hdl/src, #1710), imports
// nothing of the IDE but its own modules, listed below. A new module reached by the front end is added to the list on
// purpose; an import of the rest of the IDE fails (as the toolchain's, test/toolchain-boundary.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// the front end's package (#1710): its modules moved there from core/, whose old paths re-export them
const HDL = 'packages/silinx-hdl/src/';
// the front end's entry points
const ENTRIES = ['compile.js', 'synth-verilog.js', 'unisim.js'].map((f) => HDL + f);
// the front end's modules on 2026-10-27: what the entry points reach; a new one is added on purpose
const FRONT_END = new Set([
  'bound-walk.js', 'compile.js',   // (bound-walk.js: #2577)
  'elab-call.js', 'elab-expr.js', 'elab-instance.js', 'elab-stmt.js', 'elaborate.js',
  'interp-format.js', 'interp-textio.js', 'interp.js', 'simulator.js',
  'native.js', 'util.js', 'values.js',
  'synth-module.js', 'synth-operators.js', 'synth-stmts.js', 'synth-tables.js',
  'synth-values.js', 'synth-verilog.js',
  'unisim-jtag.js', 'unisim-s6.js', 'unisim.js',
  'gowin-bsram.js', 'gowin-dsp.js', 'gowin-prims.js', 'native-gowin.js',   // (the Gowin primitives' models: #2299)
  'verilog/lexer.js', 'verilog/parser-defs.js', 'verilog/parser-exprs.js',
  'verilog/parser-assert.js', 'verilog/parser-items.js', 'verilog/parser-nesting.js', 'verilog/parser-stmts.js', 'verilog/parser.js',   // (parser-nesting.js: #3490)
  'vhdl/actual.js', 'vhdl/interface-refs.js', 'vhdl/labels.js', 'vhdl/lexer.js', 'vhdl/math-real.js', 'vhdl/nodes.js',
  'vhdl/parse-concurrent.js', 'vhdl/parse-decls.js', 'vhdl/parse-defs.js', 'vhdl/parse-expr.js',
  'vhdl/parse-helpers.js', 'vhdl/parse-nesting.js', 'vhdl/parse-seq.js', 'vhdl/parser.js', 'vhdl/purity.js',   // (parse-nesting.js: #3490; interface-refs.js: #3744)
].map((f) => HDL + f));
// the npm packages it imports (its dependencies once it is a package of its own): none
const PACKAGES = new Set();

// a module's imports: the module of the repository (`core/…`) or the npm package's name (node: built-ins are
// not counted)
const IMPORTS = /(?:\bimport\s[^;]*?from\s*|\bexport\s[^;]*?from\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"`]([^'"`]+)['"`]/g;
function imports(file, text) {
  const out = [];
  for (const [, spec] of text.matchAll(IMPORTS)) {
    if (spec.startsWith('node:')) continue;
    if (spec.startsWith('.')) out.push(moved(path.posix.normalize(path.posix.join(path.posix.dirname(file), spec))));
    else if (spec.startsWith('/')) out.push(moved(spec.slice(1))); // the browser's /core/… URLs
    else out.push(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
  }
  return out;
}
// an old path of core/ that only re-exports a module moved into the package (#1710): that module
const REEXPORT = /^(?:\/\/[^\n]*\n)*export \* from '((?:\.\.\/)+packages\/silinx-hdl\/src\/[^']+)';\n$/;
function moved(f) {
  const m = /^core\/.+\.js$/.test(f) && fs.existsSync(path.join(ROOT, f)) && REEXPORT.exec(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  return m ? path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1])) : f;
}
// the imports that leave the front end: `importer -> imported`
const crossings = (file, text) => imports(file, text).filter((t) => !FRONT_END.has(t)).map((t) => `${file} -> ${t}`);

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const found = [...FRONT_END].sort().flatMap((f) => crossings(f, read(f)));
// a module of the repository is a .js path; a package, its name
const isPackage = (c) => !/\.m?js$/.test(c.split(' -> ')[1]);

// the modules the entry points reach, through modules of the repository
function reached() {
  const seen = new Set();
  const todo = [...ENTRIES];
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    todo.push(...imports(f, read(f)).filter((t) => /\.m?js$/.test(t)));
  }
  return [...seen].sort();
}

test('#1709 HDL boundary: how the imports across are found', () => {
  const text = [
    "import { a } from './lexer.js';", // within
    "import { u } from '../util.js';", // within, relative
    "import { v } from '../values.js';",
    "import { p } from '/core/vhdl/parser.js';", // within: the browser's URL of an old path, which re-exports it (#1710)
    "import * as c from '../../../../core/schdoc.js';", // across, relative
    "export { s } from '../../../../core/sim-model.js';", // a re-export
    "const m = await import('/core/fpga/route.js');", // dynamic, the browser's URL
    "import fs from 'node:fs';", // a built-in
    "import { runYosys } from '@yowasp/yosys/x.js';", // a package
    "import elk from 'elkjs/lib/elk.bundled.js';",
  ].join('\n');
  assert.deepEqual(crossings(`${HDL}vhdl/x.js`, text), [
    `${HDL}vhdl/x.js -> core/schdoc.js`,
    `${HDL}vhdl/x.js -> core/sim-model.js`,
    `${HDL}vhdl/x.js -> core/fpga/route.js`,
    `${HDL}vhdl/x.js -> @yowasp/yosys`,
    `${HDL}vhdl/x.js -> elkjs`,
  ]);
  // core/'s old paths of the moved modules (#1710): the modules in the package
  assert.deepEqual(crossings('core/compile.js', "import { x } from './vhdl/parser.js';\nimport { u } from './util.js';"), []);
  assert.equal(moved('core/vhdl/parser.js'), `${HDL}vhdl/parser.js`);
  assert.equal(moved('core/unisim.js'), `${HDL}unisim.js`);
  assert.equal(moved('core/compile.js'), `${HDL}compile.js`);
  assert.equal(moved('core/lint.js'), 'core/lint.js');
  assert.equal(moved('core/no-such.js'), 'core/no-such.js');
});

test('#1709 HDL boundary: the front end\'s modules exist, and are what the entry points reach', () => {
  assert.equal(FRONT_END.size, 50);
  for (const f of FRONT_END) assert.ok(fs.existsSync(path.join(ROOT, f)), `${f}: gone, remove it from FRONT_END`);
  // the package's modules (#1710), each one's old path in core/ re-exporting it
  for (const f of FRONT_END) assert.equal(moved(`core/${f.slice(HDL.length)}`), f);
  for (const f of ENTRIES) assert.ok(FRONT_END.has(f), f);
  // not the front end: the toolchain's synth-*.js, the drawings, the IDE's simulation model
  for (const f of ['packages/silinx-fpga/src/synth-open.js', 'packages/silinx-fpga/src/synth-fsm.js', 'core/synth-front.js', 'core/schdoc.js', 'core/sim-model.js']) {
    assert.ok(!FRONT_END.has(f), f);
  }
  assert.deepEqual([...FRONT_END].filter((f) => !reached().includes(f)), [], 'no longer reached: remove them from FRONT_END');
});

test('#1709 HDL boundary: no import of the rest of the IDE', () => {
  assert.deepEqual(found.filter((c) => !isPackage(c)), [],
    'the front end imports a module outside FRONT_END: add it on purpose if it belongs to the front end (docs/TOOLCHAIN-SEPARATION.md section 5), else give it through an argument');
});

test('#1709 HDL boundary: no npm package but its dependencies', () => {
  const pkgs = new Set(found.filter(isPackage).map((c) => c.split(' -> ')[1]));
  assert.deepEqual([...pkgs].filter((p) => !PACKAGES.has(p)), []);
  assert.deepEqual([...PACKAGES].filter((p) => !pkgs.has(p)), [], 'no longer imported: remove it from PACKAGES');
});
