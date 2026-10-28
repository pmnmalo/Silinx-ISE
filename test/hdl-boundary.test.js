// The HDL front end's boundary (#1709, step 1 of silinx-hdl, docs/TOOLCHAIN-SEPARATION.md section 5): the front
// end (what core/compile.js, core/synth-verilog.js and core/unisim.js reach: the VHDL and Verilog parsers, the
// elaborator, the interpreter and simulator, the flat Verilog's synth-*.js) imports nothing of the IDE but its own
// modules, listed below. A new module reached by the front end is added to the list on purpose; an import of the
// rest of the IDE fails (as the toolchain's, test/toolchain-boundary.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// the front end's entry points
const ENTRIES = ['core/compile.js', 'core/synth-verilog.js', 'core/unisim.js'];
// the front end's modules on 2026-10-27: what the entry points reach; a new one is added on purpose
const FRONT_END = new Set([
  'core/compile.js',
  'core/elab-call.js', 'core/elab-expr.js', 'core/elab-instance.js', 'core/elab-stmt.js', 'core/elaborate.js',
  'core/interp-format.js', 'core/interp-textio.js', 'core/interp.js', 'core/simulator.js',
  'core/native.js', 'core/util.js', 'core/values.js',
  'core/synth-module.js', 'core/synth-operators.js', 'core/synth-stmts.js', 'core/synth-tables.js',
  'core/synth-values.js', 'core/synth-verilog.js',
  'core/unisim-s6.js', 'core/unisim.js',
  'core/verilog/lexer.js', 'core/verilog/parser-defs.js', 'core/verilog/parser-exprs.js',
  'core/verilog/parser-items.js', 'core/verilog/parser-stmts.js', 'core/verilog/parser.js',
  'core/vhdl/labels.js', 'core/vhdl/lexer.js', 'core/vhdl/math-real.js', 'core/vhdl/nodes.js',
  'core/vhdl/parse-concurrent.js', 'core/vhdl/parse-decls.js', 'core/vhdl/parse-defs.js', 'core/vhdl/parse-expr.js',
  'core/vhdl/parse-helpers.js', 'core/vhdl/parse-seq.js', 'core/vhdl/parser.js', 'core/vhdl/purity.js',
]);
// the npm packages it imports (its dependencies once it is a package of its own): none
const PACKAGES = new Set();

// a module's imports: the module of the repository (`core/…`) or the npm package's name (node: built-ins are
// not counted)
const IMPORTS = /(?:\bimport\s[^;]*?from\s*|\bexport\s[^;]*?from\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"`]([^'"`]+)['"`]/g;
function imports(file, text) {
  const out = [];
  for (const [, spec] of text.matchAll(IMPORTS)) {
    if (spec.startsWith('node:')) continue;
    if (spec.startsWith('.')) out.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)));
    else if (spec.startsWith('/')) out.push(spec.slice(1)); // the browser's /core/… URLs
    else out.push(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
  }
  return out;
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
    "import { v } from '../values.js';", // within, relative
    "import * as c from '../schdoc.js';", // across, relative
    "export { s } from '../sim-model.js';", // a re-export
    "const m = await import('/core/fpga/route.js');", // dynamic, the browser's URL
    "import fs from 'node:fs';", // a built-in
    "import { runYosys } from '@yowasp/yosys/x.js';", // a package
    "import elk from 'elkjs/lib/elk.bundled.js';",
  ].join('\n');
  assert.deepEqual(crossings('core/vhdl/x.js', text), [
    'core/vhdl/x.js -> core/schdoc.js',
    'core/vhdl/x.js -> core/sim-model.js',
    'core/vhdl/x.js -> core/fpga/route.js',
    'core/vhdl/x.js -> @yowasp/yosys',
    'core/vhdl/x.js -> elkjs',
  ]);
  assert.deepEqual(crossings('core/compile.js', "import { x } from './vhdl/parser.js';\nimport { u } from './util.js';"), []);
});

test('#1709 HDL boundary: the front end\'s modules exist, and are what the entry points reach', () => {
  assert.equal(FRONT_END.size, 39);
  for (const f of FRONT_END) assert.ok(fs.existsSync(path.join(ROOT, f)), `${f}: gone, remove it from FRONT_END`);
  for (const f of ENTRIES) assert.ok(FRONT_END.has(f), f);
  // not the front end: the toolchain's synth-*.js, the drawings, the IDE's simulation model
  for (const f of ['core/synth-open.js', 'core/synth-fsm.js', 'core/synth-front.js', 'core/schdoc.js', 'core/sim-model.js']) {
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
