// Quality of the open synthesis (Silinx's front end + Yosys, core/synth-open.js) and of the packer
// (core/fpga/pack.js): size budgets of the designs in the repository, so that a change that makes
// the netlists larger fails here (the measurements: research/synth-quality/README.md). Their
// equivalence with the RTL is checked by test/synth-diff-fixtures.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { synthesizeOpen } from '../core/synth-open.js';
import { yosysNode } from '../core/synth-open-node.js';
import { readYosysJson } from '../core/fpga/netlist.js';
import { pack } from '../core/fpga/pack.js';
import { expectWarnings } from './diff-synth.js';
import { compareSims } from './fpga-sim.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const langOf = f => (/\.(vhd|vhdl)$/i.test(f) ? 'vhdl' : 'verilog');

function fixture(name) {
  const dir = path.join(ROOT, 'test/fixtures/designs', name);
  const spec = JSON.parse(fs.readFileSync(path.join(dir, 'design.json'), 'utf8'));
  return { key: `designs/${name}`, top: spec.top, sources: spec.files.map(f => ({ path: f, lang: langOf(f), text: fs.readFileSync(path.join(dir, f), 'utf8') })) };
}
function example(name) {
  const dir = path.join(ROOT, 'examples', name);
  const proj = JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8'));
  const files = proj.files.filter(f => (f.role || 'design') === 'design' && (f.lang === 'vhdl' || f.lang === 'verilog'));
  return { key: `examples/${name}`, top: proj.top, sources: files.map(f => ({ path: f.path, lang: f.lang, text: fs.readFileSync(path.join(dir, f.path), 'utf8') })) };
}
// (the warnings, front end and synthesis, as test/diff-synth.js gathers them, checked against
// test/fixtures/synth-warnings.json; the packer's must be none)
async function synth({ key, top, sources }) {
  const lib = compile([...primitiveSources(sources), ...sources]);
  const design = elaborate(lib, top);
  const r = await synthesizeOpen(design, { family: 'spartan3e', run: yosysNode });
  const fe = [...lib.errors, ...design.diags].filter(d => d.severity === 'warning').map(d => `${d.file}:${d.line} ${d.message}`);
  expectWarnings(key, [...fe, ...r.warnings]);
  const nl = readYosysJson(r.files[`${r.top}.json`]);
  const packed = pack(nl, { carryOut: 'xor' });
  assert.deepEqual(packed.warnings, [], `${key}: the packer's warnings`);
  return { ...r, nl, packed };
}
// the longest carry chain of a netlist (MUXCY stages)
function longestChain(nl) {
  const mux = nl.cells.filter(c => c.type === 'MUXCY');
  const next = new Map();
  for (const m of mux) { const d = nl.nets[m.pins.CI].driver; if (d && nl.cells[d.cell].type === 'MUXCY') next.set(nl.cells[d.cell], m); }
  let best = 0;
  for (const m of mux) { let k = 0; for (let c = m; c; c = next.get(c)) k++; best = Math.max(best, k); }
  return best;
}

// budgets: about 10 % above what this version makes (in brackets: Yosys's own synth_xilinx LUT
// mapping before 15.10.2, and XST where known)
const BUDGETS = {
  // 42-state control unit + 8-bit data path (stock mapping: 389 LUTs, 369 MUXF, 281 slices)
  cpu8: { design: () => fixture('cpu8'), luts: 275, muxes: 70, slices: 165 },
  // blinky (stock: 376 cells, 89 slices; XST: 145 LUTs)
  blinky: { design: () => fixture('blinky'), luts: 70, muxes: 16, slices: 78 },
  // the example project (stock: 104 slices; XST: 104 LUTs, 99 slices)
  'examples/blinky': { design: () => example('blinky'), luts: 78, muxes: 19, slices: 95 },
  // the other examples (the game: state machine, display; the stopwatch: block RAM, multipliers)
  // (pong, 15.10.16, balanced with the LUT delays (#78): 311 LUTs instead of 275, 11.2 ns estimated instead of 12.4)
  'examples/pong': { design: () => example('pong'), luts: 340, muxes: 68, slices: 300 },
  'examples/stopwatch': { design: () => example('stopwatch'), luts: 255, muxes: 62, slices: 243 },
  'examples/clock': { design: () => example('clock'), luts: 230, muxes: 87, slices: 256 },
  // the VGA picture: counters and comparisons (15.10.23: 163 LUTs, 0 MUXF, 219 carry, 53 FFs, 157 slices; with the
  // visible area in flip-flops (#461): 166 LUTs, 0 MUXF, 213 carry, 56 FFs, 154 slices)
  'examples/vga': { design: () => example('vga'), luts: 180, muxes: 4, slices: 173 },
  // the pedestrian crossing (state diagram, truth table, timer, display; 15.10.12: 114 LUTs, 22 MUXF, 73
  // slices; 15.10.16, balanced once more for depth (#52): 94 LUTs, 32 MUXF, 68 slices, 7.1 ns estimated
  // instead of 7.9; raised by Yosys 0.70 (#368): 94 LUTs, 32 MUXF, 68 slices with 0.68, 108 LUTs, 13 MUXF,
  // 67 slices with 0.70)
  'examples/traffic': { design: () => example('traffic'), luts: 110, muxes: 35, slices: 75 },
  fsm: { design: () => fixture('fsm'), luts: 14, muxes: 4, slices: 10 },
  adder: { design: () => fixture('adder'), luts: 72, muxes: 2, slices: 63 },
  // shift registers: the fixed chains in SRL16E (15.10.2: 63 slices; in flip-flops 79; XST about 9
  // slices, with the variable-tap register in SRL16 too)
  srl: { design: () => fixture('srl'), luts: 120, muxes: 60, slices: 70 },
};

for (const [name, b] of Object.entries(BUDGETS)) {
  test(`size budget: ${name} (at most ${b.luts} LUTs, ${b.muxes} MUXF, ${b.slices} slices)`, { timeout: 120000 }, async () => {
    const r = await synth(b.design());
    const s = `${r.util.luts} LUTs, ${r.util.muxes} MUXF, ${r.util.carry} carry, ${r.util.flipFlops} FFs, ${r.packed.stats.slices} slices`;
    assert.ok(r.util.luts <= b.luts, s);
    assert.ok(r.util.muxes <= b.muxes, s);
    assert.ok(r.packed.stats.slices <= b.slices, s);
  });
}

test('stopwatch: its lap memory is a block RAM, its divisions by 10, 100 and 1000 three multipliers', { timeout: 120000 }, async () => {
  const r = await synth(example('stopwatch'));
  assert.deepEqual([r.util.blockRam, r.util.multipliers, r.util.distributedRam], [1, 3, 0]);
});

test('blinky: (1 << level) - 1 of a 3-bit level is a table, not a 32-bit subtracter (the longest carry chain is a 20-bit counter)', { timeout: 120000 }, async () => {
  const r = await synth(example('blinky'));
  assert.match(r.files['top_syn.v'], /function automatic \[31:0\] tab\d+\(input \[2:0\] i\)/);
  assert.equal(longestChain(r.nl), 19);   // 20-bit counters: 19 MUXCY and their carry in
});

test('shift registers: chains of 3 or more flip-flops without reset become SRL16E (falling edge: SRL16E_1), chains longer than 16 several', { timeout: 120000 }, async () => {
  const r = await synth(fixture('srl'));
  // fix: 20 stages (SRL16E of 16 + SRL16E of 4); f0 / f1: 8 stages on the falling edge; dyn, the 16 x 4
  // register read at a variable tap: an SRL16E per bit (#5; before: 64 flip-flops and multiplexers);
  // the 2 flip-flops: dr
  assert.deepEqual([r.cells.SRL16E, r.cells.SRL16E_1, r.cells.FDRE], [6, 2, 2]);
  // the fixed ones always enabled, their address constant; the variable-tap ones (dyn) enabled by ce,
  // addressed by tap: the same net on all four
  const srls = r.nl.cells.filter(c => /^SRL16E/.test(c.type));
  const konst = n => n === 0 || n === 1;   // (nets 0 and 1: the constants)
  const fixed = srls.filter(c => konst(c.pins.A0)), dyn = srls.filter(c => !konst(c.pins.A0));
  assert.deepEqual([fixed.length, dyn.length], [4, 4]);
  assert.ok(fixed.every(c => c.pins.CE === 1), 'always enabled');
  assert.equal(new Set(dyn.map(c => c.pins.CE)).size, 1, 'one enable');
  assert.ok(dyn.every(c => !konst(c.pins.CE)), 'enabled by ce');
  assert.equal(new Set(dyn.map(c => c.pins.A0)).size, 1, 'one tap');
  assert.equal(r.packed.stats.slicem, 4, 'two shift registers per SLICEM');
  // the 20 stages in one SLICEM, cascaded (#24): F's data G's last stage through SHIFTIN, not BX (no net on BX)
  const cfg = i => Object.fromEntries(i.cfg.map(c => [c.attr, c.value]));
  const casc = r.packed.insts.filter(i => i.kind === 'slice' && cfg(i).DIF_MUX === 'SHIFTIN');
  assert.equal(casc.length, 1);
  assert.deepEqual([cfg(casc[0]).F_ATTR, cfg(casc[0]).G_ATTR, cfg(casc[0]).DIG_MUX], ['SHIFT_REG', 'SHIFT_REG', 'BY']);
  const k = r.packed.insts.indexOf(casc[0]);
  assert.ok(!r.packed.nets.some(n => n.inpins.some(p => p.inst === k && p.pin === 'BX')), 'BX unused');
  // the other SLICEMs as before: data through BX / BY
  assert.equal(r.packed.insts.filter(i => i.kind === 'slice' && cfg(i).DIF_MUX === 'BX').length, 3);
});

// the open synthesis's netlists of the fixtures with memories and multipliers, packed: the packed
// design (simulated from its XDL settings) behaves like the netlist (whose equivalence with the RTL
// test/synth-diff-fixtures.test.js checks)
for (const name of ['srl', 'dram', 'bram_sp', 'bram_dp', 'bram_prim', 'mult']) {
  test(`packed ${name} behaves like its netlist (block RAM, distributed RAM, shift registers, multipliers)`, { timeout: 120000 }, async () => {
    const r = await synth(fixture(name));
    const d = compareSims(r.nl, r.packed, { cycles: 200, seed: 11 });
    assert.equal(d, null, d && `first difference at cycle ${d.cycle} (clk ${d.clk}): netlist ${JSON.stringify(d.netlist)} packed ${JSON.stringify(d.packed)}`);
  });
}

// #51: chains of 2 stages stay flip-flops (XST makes them SRL16: on the stopwatch, larger in slices;
// research/synth-quality/README.md); a button's synchroniser among them (it should be flip-flops)
test('a 2-stage chain (the stopwatch\'s button synchroniser) stays in flip-flops, a 3-stage one is an SRL16E (#51)', { timeout: 120000 }, async () => {
  const fs = await import('node:fs');
  const text = fs.readFileSync(new URL('../examples/stopwatch/src/debounce.vhd', import.meta.url), 'utf8').replace('1_000_000', '20');
  const { compile, elaborate } = await import('../core/compile.js');
  const { synthesizeOpen } = await import('../core/synth-open.js');
  const { yosysNode } = await import('../core/synth-open-node.js');
  const syn = async (src, top) => (await synthesizeOpen(elaborate(compile(src), top), { family: 'spartan3e', run: yosysNode })).cells;
  const db = await syn([{ path: 'debounce.vhd', lang: 'vhdl', text }], 'debounce');
  assert.equal(db.SRL16E, undefined, JSON.stringify(db));
  assert.equal(db.FDRE, 2 + 1 + 1 + 5, 'sync (2), level, press, count (0 to 20: 5 bits)');
  const three = await syn([{ path: 't.v', lang: 'verilog', text: 'module t(input clk, input d, output q); reg [2:0] r = 0; always @(posedge clk) r <= {r[1:0], d}; assign q = r[2]; endmodule' }], 't');
  assert.deepEqual([three.SRL16E, three.FDRE], [1, undefined]);
});
