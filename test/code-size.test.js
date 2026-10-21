// Small modules and functions (#405, CLAUDE.md ▸ Programming): a source file of core/, web/js/, server/ and scripts/
// under 1000 lines, a function under 300. The files and functions over the limit when the rule was written are
// listed below: a new one fails, and an entry must leave its list once it is under the limit (the lists only shrink).
// A function is measured from its declaration at the start of a line to its closing brace at the start of a line
// (classes are not: their methods are small); a file by its lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// (fileURLToPath: on Windows a URL's pathname keeps a slash before the drive letter, #886)
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['core', 'web/js', 'server', 'scripts'];
const MAX_FILE = 1000, MAX_FUNCTION = 300;

// over the limit on 2026-10-22; split them, never add to these lists
const BIG_FILES = new Set([
  'core/asm-from-hdl.js', 'core/asm.js', 'core/compiled-sim.js', 'core/elab-expr.js', 'core/elaborate.js', 'core/fpga/pack.js',
  'core/fpga/place.js', 'core/fpga/timing.js', 'core/fsm.js', 'core/interp.js', 'core/isesch.js', 'core/logic.js', 'core/schdoc.js',
  'core/synth-open.js', 'core/verilog/parser.js', 'core/vhdl/parser.js', 'server/devices.js',
  'web/js/drawings.js', 'web/js/wizards.js',
]);
const BIG_FUNCTIONS = new Set([
  'core/asm-from-hdl.js asmFromHdl', 'core/asm-hdl-analysis.js analyzeModule', 'core/asm.js analyze', 'core/compiled-sim.js compileNetlist',
  'core/compiled-words.js wordLevel', 'core/fpga/pack.js packWith', 'core/fpga/place.js place', 'core/fpga/route.js routeDesign',
  'core/lint.js designChecks', 'core/open-flow-core.js runOpenFlow',
  'core/schdoc.js schematicFromHdl', 'core/scopes.js analyzeVhdl', 'core/synth-open.js synthesizeOpen',
  'server/impl-routes.js registerImplRoutes', 'web/js/asm-editor.js mountAsmEditor', 'web/js/editor.js createEditor',
  'web/js/emulator.js mountEmulator', 'web/js/fpgaview.js mountFpgaView', 'web/js/fsm-editor.js mountFsmEditor', 'web/js/isim-draw.js mountDraw',
  'web/js/isim.js mountISim', 'web/js/petri-editor.js mountPetriEditor', 'web/js/sch-editor.js mountSchEditor', 'web/js/sch-live.js liveController',
  'web/js/schematic-view.js mountSchematic', 'web/js/tbwizard.js testBenchWizard',
]);

function sources() {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) walk(p); else if (/\.m?js$/.test(e.name)) out.push(p);
    }
  };
  for (const d of DIRS) walk(d);
  return out.sort();
}
// { lines, functions: [[name, lines]] } of a source's text
function measure(text) {
  const L = text.split('\n');
  const lines = L.length - (L.at(-1) === '' ? 1 : 0);
  const functions = [];
  for (let i = 0; i < L.length; i++) {
    const m = /^(?:export )?(?:default )?(?:async )?function\*? ?([A-Za-z_$][\w$]*)/.exec(L[i]);
    if (!m) continue;
    let j = i + 1;
    while (j < L.length && L[j] !== '}') j++;
    functions.push([m[1], j - i + 1]);
  }
  return { lines, functions };
}

test('#405 code size: how a file and its functions are measured', () => {
  const body = (n) => Array.from({ length: n }, (_, i) => `  x${i}();`).join('\n');
  const m = measure(`// a module\nimport x from './x.js';\nexport function a() {\n${body(3)}\n}\nasync function b(p) {\n  if (p) {\n  }\n}\nconst c = () => 1;\n`);
  assert.deepEqual(m, { lines: 12, functions: [['a', 5], ['b', 4]] });
  assert.equal(measure('a\nb').lines, 2);
});

test('#405 code size: no new file over 1000 lines, no listed one under it', () => {
  const files = sources();
  const over = files.filter((f) => measure(fs.readFileSync(path.join(ROOT, f), 'utf8')).lines > MAX_FILE);
  assert.deepEqual(over.filter((f) => !BIG_FILES.has(f)), [], `over ${MAX_FILE} lines: split them (CLAUDE.md ▸ Programming)`);
  assert.deepEqual([...BIG_FILES].filter((f) => !over.includes(f)), [], `under ${MAX_FILE} lines now (or gone): remove them from BIG_FILES`);
});

test('#405 code size: no new function over 300 lines, no listed one under it', () => {
  const over = [];
  for (const f of sources()) {
    for (const [name, n] of measure(fs.readFileSync(path.join(ROOT, f), 'utf8')).functions) if (n > MAX_FUNCTION) over.push(`${f} ${name}`);
  }
  assert.deepEqual(over.filter((k) => !BIG_FUNCTIONS.has(k)), [], `over ${MAX_FUNCTION} lines: split them (CLAUDE.md ▸ Programming)`);
  assert.deepEqual([...BIG_FUNCTIONS].filter((k) => !over.includes(k)), [], `under ${MAX_FUNCTION} lines now (or gone): remove them from BIG_FUNCTIONS`);
});
