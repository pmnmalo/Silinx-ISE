// The Spartan-6 slice model and packer (#721, packages/silinx-fpga/src/fpga/s6/pack.js): designs synthesized for the Spartan-6 (Yosys
// xc6s) packed into SLICEX / SLICEL / SLICEM slices, every slice checked against the rules of the model (checkSlice:
// one control set, latches only in the FFs and without a 5FF, O6 / O5 of 5 shared inputs, the carry and the wide
// multiplexers in a SLICEL or SLICEM, the RAMs and shift registers in a SLICEM of one clock, write enable and write
// address); the rules' own errors on slices built here; every example packed, its slices and warnings recorded (the
// comparison with ISE's map comes with the first measurement night, packages/silinx-fpga/research/s6/README.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compile, elaborate } from '../core/compile.js';
import { synthesizeOpen } from '../core/synth-front.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { readYosysJson } from '../packages/silinx-fpga/src/fpga/netlist.js';
import { packS6, checkSlice, ctrlKey, lutInputs, PackError, AND2L } from '../packages/silinx-fpga/src/fpga/s6/pack.js';
import { physS6 } from '../packages/silinx-fpga/src/fpga/s6/phys.js';
import { example, EXAMPLES, ISE_RECORDED } from './examples-lib.mjs';

// a design synthesized for the Spartan-6 and read as the packer reads it
async function netlistOf(sources, top) {
  const d = elaborate(compile(sources), top);
  const r = await synthesizeOpen(d, { family: 'spartan6', run: yosysNode });
  return readYosysJson(r.files[`${r.top}.json`], { top: r.top });
}
const verilog = text => netlistOf([{ path: 'm.v', lang: 'verilog', text }], 'm');
// packed, every slice checked, every cell of the netlist in a slice or counted on a site of its own
function packed(nl, opts) {
  const p = packS6(nl, opts);
  assert.deepEqual(p.slices.flatMap((s, i) => checkSlice(s, nl).map(e => `slice ${i}: ${e}`)), []);
  const inSlices = new Set();
  for (const s of p.slices) {
    for (const q of Object.values(s.pos)) for (const k of ['o6', 'o5', 'ff', 'ff5']) if (typeof q[k] === 'number') inSlices.add(q[k]);
    for (const c of [s.carry, s.f7.A, s.f7.B, s.f8]) if (typeof c === 'number') inSlices.add(c);
  }
  assert.equal(inSlices.size + p.stats.others, nl.cells.length, 'every cell packed once');
  return p;
}
const kinds = p => p.slices.map(s => s.kind).join('');

test('a 16-bit accumulator: its carry chain four SLICELs of one column, the LUTs at S, the flip-flops on the sums, one control set', async () => {
  const nl = await verilog('module m(input clk, input [15:0] d, output reg [15:0] q); always @(posedge clk) q <= q + d; endmodule');
  const p = packed(nl);
  assert.equal(p.stats.carry4, 4);
  assert.deepEqual(p.chains, [[0, 1, 2, 3]]);
  assert.equal(kinds(p), 'LLLL');
  assert.deepEqual(p.slices.map(s => s.chain.index), [0, 1, 2, 3]);
  for (const s of p.slices) {
    for (const q of Object.values(s.pos)) {
      assert.equal(nl.cells[q.o6].type, 'LUT2', 'the LUT at S: d xor q');
      assert.match(nl.cells[q.ff].type, /^FD/, 'the sum registered in the position');
    }
    // (DI, the addend q or d, comes from outside the slice: by the bypass inputs AX … DX)
    assert.deepEqual(['A', 'B', 'C', 'D'].map((q, i) => s.pos[q].x), [0, 1, 2, 3].map(i => nl.cells[s.carry].pins[`DI<${i}>`]));
    assert.equal(new Set(Object.values(s.pos).map(q => ctrlKey(nl.cells[q.ff]))).size, 1);
  }
  assert.deepEqual(p.warnings, []);
  assert.deepEqual([p.stats.slices, p.stats.luts, p.stats.ffs], [4, 16, 16]);
});

test('control sets: flip-flops of other resets, enables or clock edges in other slices; no set / reset fits a synchronous or an asynchronous one', async () => {
  const nl = await verilog(`module m(input clk, input r, input e, input [3:0] d, output reg [3:0] a, output reg [3:0] b, output reg [3:0] c, output reg [3:0] n, output reg [3:0] f);
  always @(posedge clk) if (r) a <= 0; else a <= d;
  always @(posedge clk or posedge r) if (r) b <= 0; else b <= d;
  always @(posedge clk) if (e) c <= d;
  always @(negedge clk) n <= d;
  always @(posedge clk) f <= d;
endmodule`);
  const p = packed(nl);
  const sets = p.slices.map(s => s.ctrl).filter(Boolean);
  assert.equal(new Set(sets).size, 5, sets.join(' | '));
  assert.equal(p.stats.ffs, 20);
  // (a reset synchronous and one asynchronous differ; without one, the key says neither)
  assert.ok(sets.some(k => /:s:F$/.test(k)) && sets.some(k => /:a:F$/.test(k)) && sets.some(k => /:0:-:F$/.test(k)));
  // eight storage elements a slice at most: 4 by FF, 4 by 5FF, each on its own bypass input
  for (const s of p.slices) assert.ok(Object.values(s.pos).filter(q => q.ff !== null).length + Object.values(s.pos).filter(q => q.ff5 !== null).length <= 8);
});

test('eight flip-flops of one control set fed from outside: one slice, four FFs and four 5FFs on the bypass inputs AX … DX', async () => {
  const nl = await verilog('module m(input clk, input [3:0] d, output reg [3:0] q, output reg [3:0] q2); always @(posedge clk) begin q <= d; q2 <= q; end endmodule');
  const p = packed(nl);
  // (q2 <= q: the second rank's D is the first rank's Q, from outside the position: the 5FF takes AX … DX)
  assert.equal(p.stats.ffs, 8);
  assert.ok(p.slices.length <= 2, kinds(p));
});

test('latches: in the FFs only, never beside a 5FF', async () => {
  const nl = await verilog('module m(input g, input [7:0] d, output reg [7:0] q); always @* if (g) q = d; endmodule');
  const p = packed(nl);
  assert.equal(p.stats.ffs, 8);
  for (const s of p.slices) for (const q of Object.values(s.pos)) assert.equal(q.ff5, null);
  assert.equal(p.slices.length, 2, 'four latches a slice');
});

// (Yosys's xc6s mapping makes no F7 / F8 of a plain multiplexer: the traffic example's case statements have them)
test('the F8MUXes of the traffic example: each with its F7AMUX, F7BMUX and four LUTs in a SLICEL (a constant input: a LUT set to it), its selects on AX / CX and BX', async () => {
  const ex = example('traffic');
  const nl = await netlistOf(ex.design.map(f => ({ path: f.path, lang: f.lang, text: f.text })), ex.project.top);
  const p = packed(nl);
  const f8s = p.slices.filter(x => x.f8 !== null);
  assert.equal(f8s.length, p.stats.f8);
  assert.ok(f8s.length > 0);
  for (const s of f8s) {
    assert.equal(s.kind, 'L');
    const f7a = nl.cells[s.f7.A], f7b = nl.cells[s.f7.B], f8 = nl.cells[s.f8];
    assert.deepEqual([f7a.type, f7b.type, f8.type], ['MUXF7', 'MUXF7', 'MUXF8']);
    assert.deepEqual([f8.pins.I0, f8.pins.I1], [f7a.pins.O, f7b.pins.O]);
    // the F7s' inputs: the O6 of LUTs A, B and C, D (a constant: the LUT of the position set to it, 'const:<net>')
    const o6 = q => (typeof s.pos[q].o6 === 'number' ? nl.cells[s.pos[q].o6].pins.O : +/^const:(\d)$/.exec(s.pos[q].o6)[1]);
    assert.deepEqual([f7a.pins.I0, f7a.pins.I1, f7b.pins.I0, f7b.pins.I1], ['A', 'B', 'C', 'D'].map(o6));
    assert.deepEqual([s.pos.A.x, s.pos.B.x, s.pos.C.x], [f7a.pins.S, f8.pins.S, f7b.pins.S].map(n => (n > 1 ? n : null)));
  }
});

test('the SLICEM: distributed RAMs of one write clock, enable and address in a slice, shift registers in another, their flip-flops clocked alike', async () => {
  const nl = await verilog(`module m(input clk, input we, input [5:0] wa, input [5:0] ra, input [3:0] d, input sd, output [3:0] q, output sq, output reg [3:0] r);
  reg [3:0] mem [0:63]; integer i; initial for (i = 0; i < 64; i = i + 1) mem[i] = 0;
  always @(posedge clk) if (we) mem[wa] <= d;
  assign q = mem[ra];
  reg [63:0] s; always @(posedge clk) s <= {s[62:0], sd}; assign sq = s[63];
  always @(posedge clk) r <= q;
endmodule`);
  const p = packed(nl);
  // (64 x 4 with a read address of its own: two RAM64Ms, three read ports and the write port's each)
  assert.equal(p.stats.lutram, 2);
  assert.equal(p.stats.srl, 2);
  const m = p.slices.filter(s => s.kind === 'M');
  assert.ok(m.length >= 3, kinds(p));
  for (const s of m) assert.equal(new Set(Object.values(s.pos).filter(q => q.o6 !== null).map(q => nl.cells[q.o6].type.startsWith('SRL'))).size, 1, 'RAMs and shift registers apart');
});

test('LUT combining (combine: area): two LUTs of 5 shared inputs at most in a SLICEX position, O6 and O5; off by default, as ISE\'s map', async () => {
  const nl = await verilog('module m(input [4:0] a, output [7:0] y); assign y = { a[0] & a[1], a[0] | a[1], a[2] ^ a[3], a[2] & a[4], ^a, &a, |a[3:0], a[4] ^ a[0] }; endmodule');
  const off = packed(nl), area = packed(nl, { combine: 'area' });
  assert.equal(off.stats.luts, area.stats.luts);
  assert.ok(area.stats.slices < off.stats.slices, `${area.stats.slices} < ${off.stats.slices}`);
  assert.ok(off.slices.every(s => Object.values(s.pos).every(q => q.o5 === null)), 'no O5 with combining off');
  let pairs = 0;
  for (const s of area.slices) for (const q of Object.values(s.pos)) if (q.o5 !== null) { pairs++; assert.ok(new Set([...lutInputs(nl.cells[q.o6]), ...lutInputs(nl.cells[q.o5])]).size <= 5); }
  assert.ok(pairs > 0);
});

test('checkSlice: the errors of slices that break the rules', async () => {
  const nl = await verilog(`module m(input clk, input r, input g, input [5:0] a, input [5:0] b, output y, output z, output reg q1, output reg q2, output reg l);
  assign y = &a; assign z = ^b;
  always @(posedge clk) q1 <= a[0];
  always @(posedge clk) if (r) q2 <= 0; else q2 <= b[0];
  always @* if (g) l = a[1];
endmodule`);
  const p = packS6(nl);
  const find = re => nl.cells.findIndex(c => re.test(c.type));
  const lut6 = nl.cells.map((c, i) => (c.type === 'LUT6' ? i : -1)).filter(i => i >= 0);
  const ffs = nl.cells.map((c, i) => (/^FD/.test(c.type) ? i : -1)).filter(i => i >= 0);
  const s = JSON.parse(JSON.stringify(p.slices[0]));
  for (const q of Object.values(s.pos)) Object.assign(q, { o6: null, o5: null, ff: null, ff5: null });
  // two control sets; a latch beside a 5FF, and in a 5FF
  s.pos.A.ff = ffs[0]; s.pos.B.ff = ffs[1]; s.pos.C.ff5 = find(/^LD/);
  // two 6-input LUTs in one position
  s.pos.D.o6 = lut6[0]; s.pos.D.o5 = lut6[1];
  s.kind = 'X'; s.carry = null; s.f7 = { A: null, B: null }; s.f8 = 99;
  assert.deepEqual(checkSlice(s, nl), ['a carry chain or a wide multiplexer in a SLICEX', 'C5FF: a latch (' + nl.cells[find(/^LD/)].name + ')',
    `C5FF: its D (${nl.cells[find(/^LD/)].name}) is not the position's O5`, 'D: O6 and O5 share more than 5 inputs', 'storage elements of 3 control sets', 'latches with a 5FF used']);
  assert.deepEqual(checkSlice({ ...s, f8: null, pos: { A: { ...s.pos.A, ff: null }, B: s.pos.B, C: { ...s.pos.C, ff5: null }, D: { ...s.pos.D, o5: null } }, mem: 'ram:2:3:', kind: 'L' }, nl),
    ['a RAM or shift register in a slice that is not a SLICEM']);
});

// #1143: a 5FF's D is the position's O5 only (UG384; the slices' primitive definitions): one fed from outside the
// slice takes it through O5, the LUT passing its input (map's PK_PACKTHRU), A6 high
test('a 5FF fed from outside its slice: its D through the position\'s O5 as a route-through of the LUT, never by the bypass input (#1143)', async () => {
  // (two registers of the same inputs, of other initial values: not merged, one control set, eight in one slice)
  const nl = await verilog(`module m(input clk, input [3:0] d, output [3:0] q, output [3:0] r);
  reg [3:0] a = 4'b0000; reg [3:0] b = 4'b1111;
  always @(posedge clk) begin a <= d; b <= d; end
  assign q = a; assign r = b;
endmodule`);
  const p = packed(nl);
  assert.equal(kinds(p), 'X');
  for (const q of Object.values(p.slices[0].pos)) {
    const d = nl.cells[q.ff].pins.D;
    assert.equal(nl.cells[q.ff5].pins.D, d, 'the FF and the 5FF of a position: one D');
    assert.equal(q.x, d, 'the FF by the bypass input');
    assert.equal(q.o5, `thru:${d}`, 'the 5FF through O5');
    assert.equal(q.mux, 'ff5');
  }
  // checkSlice: a 5FF on the bypass input is refused
  const s = JSON.parse(JSON.stringify(p.slices[0]));
  s.pos.A.o5 = null;
  assert.deepEqual(checkSlice(s, nl), [`A5FF: its D (${nl.cells[s.pos.A.ff5].name}) is not the position's O5`]);
  assert.deepEqual(p.warnings, []);
  assert.deepEqual([p.stats.slices, p.stats.ffs, p.stats.luts], [1, 8, 0]);
});

// night 1: map's packing of the clock example (BOUTMUX CY, BFF #AND2L with BFFMUX XOR) in a slice of no other storage element
test('a carry\'s sum and carry out both out of one position: the carry out by its MUX, the sum through the storage element as a gate (AND2L), alone in the slice', async () => {
  // (the clock example's 2-bit adder: a plain one takes its carry out by the next stage's sum, without the conflict)
  const ex = example('clock');
  const nl = await netlistOf(ex.design.map(f => ({ path: f.path, lang: f.lang, text: f.text })), ex.project.top);
  const p = packed(nl);
  const g = p.slices.flatMap(sl => Object.entries(sl.pos).filter(([, q]) => q.ff === AND2L).map(([k, q]) => ({ sl, k, q })));
  assert.equal(g.length, 1);
  assert.equal(g[0].k, 'B', 'BFF, as map');
  assert.equal(g[0].q.mux, 'cy');
  assert.equal(g[0].sl.ctrl, AND2L);
  assert.deepEqual(p.warnings, []);
  assert.equal(p.stats.and2l, 1);
  assert.ok(Object.values(g[0].sl.pos).every(q => q.ff5 === null && (q.ff === null || q.ff === AND2L)), 'no flip-flop beside the gate');
  // the rule's own error: a gate anywhere else
  const bad = JSON.parse(JSON.stringify(g[0].sl));
  bad.pos[g[0].k].mux = 'xor';
  assert.deepEqual(checkSlice(bad, nl), [`${g[0].k}FF: a gate (AND2L) but not the carry's sum beside its carry out`]);
});

test('a carry\'s DI the same net as its S, a LUT\'s output: by the bypass input, which no flip-flop then takes (#2291)', async () => {
  // (isqrt's decimal written as a loop that takes 10 away while it fits: before, a flip-flop's D took AX too, and the
  // physical design stopped at "its pin AX carries … and …")
  const nl = await verilog(`module m(input clk, input [5:0] v, input [3:0] e, output [7:0] q, output [3:0] r);
  reg [5:0] ones; reg [3:0] tens; integer k;
  always @* begin ones = v; tens = 0; for (k = 0; k < 3; k = k + 1) if (ones >= 10) begin ones = ones - 10; tens = tens + 1; end end
  reg [7:0] o = 0; reg [3:0] f = 0;
  always @(posedge clk) begin o <= {tens, ones[3:0]}; f <= e; end
  assign q = o; assign r = f;
endmodule`);
  const p = packed(nl);
  assert.deepEqual(p.warnings, []);
  let same = 0;
  for (const s of p.slices.filter(x => x.carry !== null)) {
    const c = nl.cells[s.carry];
    ['A', 'B', 'C', 'D'].forEach((k, i) => {
      const di = c.pins[`DI<${i}>`], q = s.pos[k];
      if (di > 1 && di === c.pins[`S<${i}>`] && typeof q.o6 === 'number') { same++; assert.equal(q.x, di, `${k}X: the DI`); }
      if (typeof q.ff === 'number') assert.ok(q.x === null || q.x === nl.cells[q.ff].pins.D, `${k}FF: its D on ${k}X`);
    });
  }
  assert.ok(same > 0, 'a carry\'s DI the same net as its S');
  const phys = physS6(nl, p);
  assert.deepEqual(phys.warnings, []);
});

test('an adder\'s carry in: CYINIT on AX, DI<0> (which needed AX too) through A\'s O5 as a route-through of its net, as map packs it (#2638)', async () => {
  // (micro80's ALU, the light8080's: before, "CYINIT and DI<0> both need the bypass input AX" warned, and the physical
  // design stopped at "its pin AX carries … and …")
  const nl = await verilog('module m(input clk, input c, input [3:0] a, input [3:0] b, output reg [3:0] q); always @(posedge clk) q <= a + b + c; endmodule');
  const p = packed(nl);
  assert.deepEqual(p.warnings, []);
  const [s] = p.slices.filter(x => x.carry !== null), c = nl.cells[s.carry];
  assert.ok(c.pins.CYINIT > 1 && c.pins['DI<0>'] > 1 && c.pins.CYINIT !== c.pins['DI<0>']);
  assert.equal(s.pos.A.x, c.pins.CYINIT);
  assert.equal(s.pos.A.o5, `thru:${c.pins['DI<0>']}`);
  assert.ok(lutInputs(nl.cells[s.pos.A.o6]).includes(c.pins['DI<0>']), 'DI<0> one of the S LUT\'s inputs');
  assert.deepEqual(['B', 'C', 'D'].map((k, i) => s.pos[k].x), [1, 2, 3].map(i => c.pins[`DI<${i}>`]));
  assert.deepEqual([p.stats.slices, p.stats.luts, p.stats.ffs], [1, 4, 4]);
  // the physical design: DI<0> by the LUT input its route-through takes, AX CYINIT's alone
  const phys = physS6(nl, p);
  assert.deepEqual(phys.errors ?? [], []);
  assert.deepEqual(phys.warnings, []);
});

test('LUT combining (combine: area) never takes more slices: isqrt\'s first top, whose 5FFs need the O5s a combining that empties no slice took (#2279)', async () => {
  // (the top of isqrt's first version, #1966: its digits by / 10, its reset a 2-bit shift register; 29 slices with
  // combining against 28 without, before)
  const ex = example('isqrt'), top = fs.readFileSync(new URL('./fixtures/s6-pack/isqrt_top_2279.vhd', import.meta.url), 'utf8');
  const nl = await netlistOf(ex.design.map(f => ({ path: f.path, lang: f.lang, text: f.path.endsWith('isqrt_top.vhd') ? top : f.text })), ex.project.top);
  const off = packed(nl), area = packed(nl, { combine: 'area' });
  assert.deepEqual([off.warnings, area.warnings], [[], []]);
  assert.equal(area.stats.luts, off.stats.luts);
  assert.ok(area.stats.slices <= off.stats.slices, `${area.stats.slices} <= ${off.stats.slices}`);
});

test('a cell the packer has no place for: a PackError naming it', () => {
  const nl = { cells: [{ name: 'u0', type: 'ICAP_SPARTAN6', params: {}, pins: {}, dirs: {} }], nets: [{ id: 0, loads: [] }, { id: 1, loads: [] }], ports: [] };
  assert.throws(() => packS6(nl), e => e instanceof PackError && e.message === 'the Spartan-6 packer has no place for the cell u0 (ICAP_SPARTAN6)');
});

// every example for the XC6SLX16: its slices by kind and the packer's warnings (none: clock's 2-bit adder, whose sum
// and carry out both leave the slice, has its sum through a storage element as a gate, as map packs it on night 1)
const EXAMPLE_PACK = {
  gates: { slices: 1, X: 1, L: 0, M: 0, luts: 1, ffs: 0, warnings: 0 },
  traffic: { slices: 34, X: 14, L: 20, M: 0, luts: 96, ffs: 58, warnings: 0 },
  blinky: { slices: 55, X: 24, L: 31, M: 0, luts: 102, ffs: 132, warnings: 0 },   // (#3710: 53, 29, 130 with 20-bit debouncers)
  pong: { slices: 111, X: 58, L: 53, M: 0, luts: 270, ffs: 207, warnings: 0 },
  stopwatch: { slices: 85, X: 43, L: 42, M: 0, luts: 181, ffs: 201, warnings: 0 },
  clock: { slices: 81, X: 35, L: 46, M: 0, luts: 152, ffs: 158, warnings: 0 },
  vga: { slices: 52, X: 22, L: 30, M: 0, luts: 129, ffs: 56, warnings: 0 },
  isqrt: { slices: 30, X: 17, L: 13, M: 0, luts: 74, ffs: 86, warnings: 0 },
  uart: { slices: 52, X: 33, L: 19, M: 0, luts: 140, ffs: 138, warnings: 0 },
  micro80: { slices: 65, X: 45, L: 18, M: 2, luts: 180, ffs: 185, warnings: 0 },   // (#3710: 63, 43, 172 before its CLK_HZ)
};
// with LUT combining (combine: 'area'): the slices, never more than without, and the same warnings (isqrt: 29 when
// the combining came before the storage elements, which then filled the slices it emptied again, #2636)
const EXAMPLE_AREA = { gates: 1, traffic: 31, blinky: 54, pong: 102, stopwatch: 80, clock: 76, vga: 49, isqrt: 28, uart: 49, micro80: 63 };
// the SLICELs of night 1's netlists where an example changed since (blinky's 21-bit debouncers, #3710: 31 now)
const NIGHT1_L = { blinky: 29 };
// map's packing of the same netlists on ISE (packages/silinx-fpga/research/s6/measured/night1.json, night 1): its SLICELs are the packer's
// (the carry chains and the wide multiplexers); its SLICEX are a placement's, more (packages/silinx-fpga/research/s6/README.md)
test('the packer\'s SLICELs are those of ISE\'s map on the same netlists, every example on the Nexys3 and the Atlys (night 1)', () => {
  const night1 = JSON.parse(fs.readFileSync(new URL('../packages/silinx-fpga/research/s6/measured/night1.json', import.meta.url), 'utf8'));
  for (const board of ['nexys3', 'atlys']) {
    for (const name of ISE_RECORDED) {
      const open = night1.boards[board].examples[name].open;
      assert.equal(open.routed, true, `${board} ${name}`);
      assert.equal(open.sites.SLICEL || 0, NIGHT1_L[name] ?? EXAMPLE_PACK[name].L, `${board} ${name}`);
      assert.equal(open.sites.SLICEM || 0, EXAMPLE_PACK[name].M, `${board} ${name}`);
      assert.ok(open.sites.SLICEX >= EXAMPLE_PACK[name].X, `${board} ${name}: map's SLICEX ${open.sites.SLICEX}, the packer's ${EXAMPLE_PACK[name].X}`);
    }
  }
});

test('every example packs into legal slices for the XC6SLX16 (the slices by kind, the warnings)', { timeout: 300000 }, async () => {
  assert.deepEqual(Object.keys(EXAMPLE_PACK), EXAMPLES);
  assert.deepEqual(Object.keys(EXAMPLE_AREA), EXAMPLES);
  for (const name of EXAMPLES) {
    const ex = example(name);
    const nl = await netlistOf(ex.design.map(f => ({ path: f.path, lang: f.lang, text: f.text })), ex.project.top);
    const p = packed(nl);
    const { slices, X, L, M, luts, ffs } = p.stats;
    assert.deepEqual({ slices, X, L, M, luts, ffs, warnings: p.warnings.length }, EXAMPLE_PACK[name], name);
    assert.equal(p.stats.and2l, name === 'clock' || name === 'uart' ? 1 : 0, name);
    // (LUT combining: never more slices)
    const area = packed(nl, { combine: 'area' });
    assert.deepEqual([area.stats.slices, area.stats.luts, area.warnings], [EXAMPLE_AREA[name], luts, p.warnings], name);
    assert.ok(area.stats.slices <= slices, name);
  }
});
