// Compiled cycle simulator (core/compiled-sim.js, #384): the design as one JavaScript function per
// clock cycle, checked cycle by cycle against the event-driven simulator (test/compiled-diff.js) on the
// examples and on test designs (Verilog and VHDL) exercising every cell, at the widths where the code
// changes (numbers up to 32 bits, BigInts above; `wide`: every value a BigInt, the same results); the
// cells Yosys makes only from other netlists against a reference computed here; the errors; the speed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EXAMPLES, example, ROOT } from './examples-lib.mjs';
import { diffCycles, designOf, rng } from './compiled-diff.js';
import { compileDesign, compileNetlist, CompiledSim, CompileError, netlistOf } from '../core/compiled-sim.js';
import { yosysNode } from '../core/synth-open-node.js';
import { timingGenerics, autoTimeScale, scaledGenerics } from '../core/emulate.js';

const FIX = path.join(ROOT, 'test/fixtures/compiled-sim');
const fixture = name => [{ path: name, lang: name.endsWith('.vhd') ? 'vhdl' : 'verilog', role: 'design', text: fs.readFileSync(path.join(FIX, name), 'utf8') }];
const src = (name, text) => [{ path: name, lang: name.endsWith('.vhd') ? 'vhdl' : 'verilog', role: 'design', text }];

// random inputs: each input port changes with probability p in a cycle (all of them in cycle 0)
function randomInputs(sources, top, { seed = 1, p = 1, generics } = {}) {
  const ins = designOf(sources, top, { generics }).top.ports.filter(x => x.dir === 'in');
  const r = rng(seed), cur = {};
  const word = w => { let v = 0n; for (let i = 0; i < w; i += 16) v |= BigInt(Math.floor(r() * 65536)) << BigInt(i); return BigInt.asUintN(w, v); };
  return k => { for (const x of ins) if (k === 0 || r() < p) cur[x.name] = word(x.sig.t.w); return cur; };
}
async function same(sources, top, o = {}) {
  for (const wide of [false, true]) {
    const r = await diffCycles(sources, top, { cycles: 400, nets: true, inputs: randomInputs(sources, top, o), wide, ...o });
    assert.deepEqual(r.mismatches, [], `${top}${wide ? ' (wide)' : ''}`);
    assert.ok(r.bits >= (o.minBits ?? 10000), `${top}: ${r.bits} bits compared`);
  }
}

// ------------------------------------------------------------------ the examples
for (const name of EXAMPLES) {
  test(`example ${name}: the compiled simulator computes what the event-driven one does, cycle by cycle`, async () => {
    const ex = example(name);
    // (its timing generics divided further than the emulator does, so that its counters wrap)
    const gens = timingGenerics(designOf(ex.design, ex.project.top).top.params);
    const generics = gens.length ? scaledGenerics(gens, autoTimeScale(gens) * 100) : undefined;
    const sim = await compileDesign(designOf(ex.design, ex.project.top, { generics }), { run: yosysNode });
    assert.deepEqual(sim.warnings, []);
    assert.equal(sim.model.clock?.port, name === 'gates' ? undefined : 'clk');
    for (const wide of [false, true]) {
      const r = await diffCycles(ex.design, ex.project.top, { cycles: 3000, generics, nets: true, wide, inputs: randomInputs(ex.design, ex.project.top, { generics, p: 0.01, seed: 7 }) });
      assert.deepEqual(r.mismatches, [], wide ? 'wide' : '');
      assert.ok(r.bits > 50000, `${r.bits} bits compared`);
    }
  });
}

// ------------------------------------------------------------------ the open synthesis's test designs (test/fixtures/designs)
const DESIGNS = path.join(ROOT, 'test/fixtures/designs');
// (their warnings, or why they are not compiled: the primitives with no model here yet, an inout port)
const FIXTURES = {
  adder: [], blinky: [], bram_dp: [], bram_sp: [], cpu8: [], dram: [], fsm: [], mult: [], srl: [],
  latch: ["latch inferred for 'l3'", "latch inferred for 'l2'", "latch inferred for 'l1'"],
  bram_prim: { error: 'the compiled simulator has no model of RAMB16_S9_S36, RAMB16_S18' },
  bufgmux: { error: 'the compiled simulator has no model of BUFGMUX' },
  dcm: { error: 'the compiled simulator has no model of DCM_SP' },
  tristate: { error: "the inout port 'io' (a tristate) cannot be compiled" },
};
test('the test designs are all listed', () => {
  assert.deepEqual(fs.readdirSync(DESIGNS).sort(), Object.keys(FIXTURES).sort());
});
for (const [name, want] of Object.entries(FIXTURES)) {
  test(`test design ${name}: ${want.error ? 'not compiled, with the reason' : 'the compiled simulator computes what the event-driven one does'}`, async () => {
    const dir = path.join(DESIGNS, name);
    const spec = JSON.parse(fs.readFileSync(path.join(dir, 'design.json'), 'utf8'));
    const sources = spec.files.map(f => ({ path: f, lang: /\.vhd$/.test(f) ? 'vhdl' : 'verilog', role: 'design', text: fs.readFileSync(path.join(dir, f), 'utf8') }));
    if (want.error) {
      await assert.rejects(compileDesign(designOf(sources, spec.top), { run: yosysNode }), { name: 'Error', message: want.error });
      return;
    }
    const sim = await compileDesign(designOf(sources, spec.top), { run: yosysNode, clock: spec.sim.clock });
    assert.deepEqual(sim.warnings, want);
    const ins = designOf(sources, spec.top).top.ports.filter(x => x.dir === 'in');
    const r = rng(9), cur = {}, prob = spec.sim.prob || {};
    const word = w => { let v = 0n; for (let i = 0; i < w; i += 16) v |= BigInt(Math.floor(r() * 65536)) << BigInt(i); return BigInt.asUintN(w, v); };
    const res = await diffCycles(sources, spec.top, { cycles: spec.sim.cycles || 600, nets: true, clock: spec.sim.clock,
      inputs: k => { for (const x of ins) if (k === 0 || r() < (prob[x.name] ?? 0.5)) cur[x.name] = word(x.sig.t.w); return cur; } });
    assert.deepEqual(res.mismatches, []);
    assert.ok(res.bits > 4000, `${res.bits} bits compared`);
  });
}

// ------------------------------------------------------------------ test designs, through Silinx's synthesis Verilog
test('operators: unsigned and signed, 1 to 64 bits, shifts, comparisons, reductions, a case, an array (Verilog)', async () => {
  await same(fixture('ops.v'), 'ops');
});
test('registers: synchronous / asynchronous resets, enables, set / clear, a falling edge, a latch, 40 bits (Verilog)', async () => {
  const sim = await compileDesign(designOf(fixture('regs.v'), 'regs'), { run: yosysNode });
  assert.deepEqual(sim.warnings, ["latch inferred for 'lat'", "Complex async reset for dff 'q_sr'."]);
  assert.equal(sim.model.stats.bothEdges, true);
  await same(fixture('regs.v'), 'regs', { p: 0.3 });
});
test('clocks: a counter bit as a clock, a ripple counter, a clock on an input, a gated and an inverted clock (Verilog)', async () => {
  const sim = await compileDesign(designOf(fixture('clocks.v'), 'clocks'), { run: yosysNode });
  assert.equal(sim.model.clock.port, 'clk');
  assert.equal(sim.model.stats.clocks, 7);
  await same(fixture('clocks.v'), 'clocks', { p: 0.3, clock: 'clk' });
});
test('memories: synchronous and asynchronous reads, a registered address, a ROM, 40-bit words (Verilog)', async () => {
  await same(fixture('mems.v'), 'mems', { p: 0.3 });
});
test('numeric_std arithmetic, shifts, a ROM, a RAM, an asynchronous reset, an enumeration, an integer counter (VHDL)', async () => {
  await same(fixture('ops.vhd'), 'ops_vhd', { p: 0.5 });
});
test('the cells of Verilog read by Yosys itself: $shiftx, $shift, $sshl, $eqx, $dffe, $sdff, $sdffe, $sdffce, $adffe, $aldff, a memory read port with a reset', async () => {
  await same(fixture('cells.v'), 'cells', { p: 0.4, direct: true, extra: 'opt_dff' });
});

test('the comparison finds a wrong compiled model', async () => {
  // the state machine's count down (st - 1) made a count up
  const r = await diffCycles(fixture('ops.v'), 'ops', { cycles: 400, inputs: randomInputs(fixture('ops.v'), 'ops'), mutate: code => code.replace(/\(v(\d+) - 1\)/, '(v$1 + 1)') });
  assert.ok(r.mismatches.length > 0);
  assert.equal(r.mismatches[0].port, 'st');
});

// ------------------------------------------------------------------ cells against a reference computed here
// a module of one cell: its inputs (the widths given) as input ports, Y / Q the output
const bin = (n, w = 32) => BigInt.asUintN(w, BigInt(n)).toString(2).padStart(w, '0');
function oneCell(type, params, widths) {
  let next = 2;
  const ports = {}, conn = {};
  for (const [p, w] of Object.entries(widths)) {
    const bits = Array.from({ length: w }, () => next++);
    conn[p] = bits;
    ports[p] = { direction: p === 'Y' || p === 'Q' ? 'output' : 'input', bits };
  }
  const P = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, typeof v === 'string' ? v : bin(v)]));
  return { modules: { t: { attributes: { top: '00000000000000000000000000000001' }, ports, cells: { c: { type, parameters: P, port_directions: {}, connections: conn } }, netnames: {} } } };
}
const sgn = (v, w) => BigInt.asIntN(w, v);
const floorDiv = (a, b) => { const q = a / b; return (a % b !== 0n) && ((a < 0n) !== (b < 0n)) ? q - 1n : q; };
const floorMod = (a, b) => { const r = a % b; return r !== 0n && (r < 0n) !== (b < 0n) ? r + b : r; };
const CELLS = [
  // [type, params, widths, reference(A, B, S) -> Y]
  ['$divfloor', { A_SIGNED: 1, B_SIGNED: 1, A_WIDTH: 12, B_WIDTH: 6, Y_WIDTH: 12 }, { A: 12, B: 6, Y: 12 }, (a, b) => (b ? floorDiv(sgn(a, 12), sgn(b, 6)) : 0n)],
  ['$modfloor', { A_SIGNED: 1, B_SIGNED: 1, A_WIDTH: 12, B_WIDTH: 6, Y_WIDTH: 6 }, { A: 12, B: 6, Y: 6 }, (a, b) => (b ? floorMod(sgn(a, 12), sgn(b, 6)) : 0n)],
  ['$divfloor', { A_SIGNED: 1, B_SIGNED: 1, A_WIDTH: 40, B_WIDTH: 20, Y_WIDTH: 40 }, { A: 40, B: 20, Y: 40 }, (a, b) => (b ? floorDiv(sgn(a, 40), sgn(b, 20)) : 0n)],
  ['$modfloor', { A_SIGNED: 0, B_SIGNED: 0, A_WIDTH: 40, B_WIDTH: 20, Y_WIDTH: 20 }, { A: 40, B: 20, Y: 20 }, (a, b) => (b ? a % b : 0n)],
  ['$lut', { WIDTH: 4, LUT: '1001011001101001' }, { A: 4, Y: 1 }, a => (0b1001011001101001n >> a) & 1n],
  ['$lut', { WIDTH: 6, LUT: '1'.repeat(20) + '0'.repeat(30) + '10'.repeat(7) }, { A: 6, Y: 1 }, a => (BigInt(`0b${'1'.repeat(20)}${'0'.repeat(30)}${'10'.repeat(7)}`) >> a) & 1n],
  ['$bwmux', { WIDTH: 33 }, { A: 33, B: 33, S: 33, Y: 33 }, (a, b, s) => (a & ~s & ((1n << 33n) - 1n)) | (b & s)],
  ['$bwmux', { WIDTH: 32 }, { A: 32, B: 32, S: 32, Y: 32 }, (a, b, s) => (a & ~s & 0xFFFFFFFFn) | (b & s)],
  ['$bmux', { WIDTH: 5, S_WIDTH: 2 }, { A: 20, S: 2, Y: 5 }, (a, b, s) => (a >> (s * 5n)) & 31n],
  ['$bmux', { WIDTH: 12, S_WIDTH: 3 }, { A: 96, S: 3, Y: 12 }, (a, b, s) => (a >> (s * 12n)) & 4095n],
  ['$demux', { WIDTH: 6, S_WIDTH: 2 }, { A: 6, S: 2, Y: 24 }, (a, b, s) => a << (s * 6n)],
  ['$demux', { WIDTH: 9, S_WIDTH: 3 }, { A: 9, S: 3, Y: 72 }, (a, b, s) => a << (s * 9n)],
  ['$nex', { A_SIGNED: 0, B_SIGNED: 0, A_WIDTH: 33, B_WIDTH: 3, Y_WIDTH: 1 }, { A: 33, B: 3, Y: 1 }, (a, b) => (a !== b ? 1n : 0n)],
  ['$reduce_and', { A_SIGNED: 0, A_WIDTH: 32, Y_WIDTH: 2 }, { A: 32, Y: 2 }, a => (a === 0xFFFFFFFFn ? 1n : 0n)],
  ['$pos', { A_SIGNED: 1, A_WIDTH: 7, Y_WIDTH: 40 }, { A: 7, Y: 40 }, a => BigInt.asUintN(40, sgn(a, 7))],
  ['$shift', { A_SIGNED: 0, B_SIGNED: 1, A_WIDTH: 16, B_WIDTH: 6, Y_WIDTH: 16 }, { A: 16, B: 6, Y: 16 }, (a, b) => { const s = sgn(b, 6); return BigInt.asUintN(16, s < 0n ? a << -s : a >> s); }],
  ['$sshr', { A_SIGNED: 0, B_SIGNED: 0, A_WIDTH: 20, B_WIDTH: 5, Y_WIDTH: 12 }, { A: 20, B: 5, Y: 12 }, (a, b) => BigInt.asUintN(12, a >> b)],
  ['$shr', { A_SIGNED: 1, B_SIGNED: 0, A_WIDTH: 8, B_WIDTH: 4, Y_WIDTH: 16 }, { A: 8, B: 4, Y: 16 }, (a, b) => BigInt.asUintN(16, BigInt.asUintN(16, sgn(a, 8)) >> b)],
];
test('the cells Silinx\'s Verilog does not make ($divfloor, $modfloor, $lut, $bwmux, $bmux, $demux…) against a reference', () => {
  for (const [type, params, widths, ref] of CELLS) {
    for (const wide of [false, true]) {
      const sim = new CompiledSim(compileNetlist(oneCell(type, params, widths), { top: 't', wide }));
      const r = rng(11);
      const word = w => { let v = 0n; for (let i = 0; i < w; i += 16) v |= BigInt(Math.floor(r() * 65536)) << BigInt(i); return BigInt.asUintN(w, v); };
      for (let k = 0; k < 300; k++) {
        const v = { A: word(widths.A), B: widths.B ? word(widths.B) : 0n, S: widths.S ? word(widths.S) : 0n };
        if (k === 0) Object.assign(v, { A: 0n, B: 0n, S: 0n });
        if (k === 1) Object.assign(v, { A: (1n << BigInt(widths.A)) - 1n, B: widths.B ? (1n << BigInt(widths.B)) - 1n : 0n });
        for (const p of ['A', 'B', 'S']) if (widths[p]) sim.set(p, v[p]);
        sim.cycle(0);
        const want = BigInt.asUintN(widths.Y, ref(v.A, v.B, v.S));
        assert.equal(sim.get('Y'), want, `${type} ${JSON.stringify(widths)}${wide ? ' (wide)' : ''}: A=${v.A} B=${v.B} S=${v.S}`);
      }
    }
  }
});

// a register cell clocked by C (the main clock), its other pins inputs
function oneReg(type, params, widths) {
  return oneCell(type, params, { CLK: 1, ...widths });
}
test('$dffsre, $aldffe and $adlatch against a reference', () => {
  const r = rng(13);
  // $dffsre: per bit, CLR over SET over the clocked value (enabled); SET / CLR active low here
  {
    const sim = new CompiledSim(compileNetlist(oneReg('$dffsre', { WIDTH: 6, CLK_POLARITY: '1', EN_POLARITY: '1', SET_POLARITY: '0', CLR_POLARITY: '0' }, { D: 6, EN: 1, SET: 6, CLR: 6, Q: 6 }), { top: 't' }));
    let q = 0n;
    for (let k = 0; k < 300; k++) {
      const d = BigInt(Math.floor(r() * 64)), en = BigInt(r() < 0.5), set = BigInt(Math.floor(r() * 64)) | 0b110000n, clr = BigInt(Math.floor(r() * 64)) | 0b001100n;
      for (const [p, v] of Object.entries({ D: d, EN: en, SET: set, CLR: clr })) sim.set(p, v);
      const sA = ~set & 63n, cA = ~clr & 63n;
      sim.cycle(1);
      q = ((en ? d : q) | sA) & ~cA & 63n;
      assert.equal(sim.get('Q'), q, `cycle ${k}`);
    }
  }
  // $aldffe: an asynchronous load of AD over the enabled clocked value
  {
    const sim = new CompiledSim(compileNetlist(oneReg('$aldffe', { WIDTH: 40, CLK_POLARITY: '1', EN_POLARITY: '0', ALOAD_POLARITY: '1' }, { D: 40, AD: 40, EN: 1, ALOAD: 1, Q: 40 }), { top: 't' }));
    let q = 0n;
    for (let k = 0; k < 300; k++) {
      const d = BigInt(Math.floor(r() * 2 ** 40)), ad = BigInt(Math.floor(r() * 2 ** 40)), en = BigInt(r() < 0.5), al = BigInt(r() < 0.3);
      for (const [p, v] of Object.entries({ D: d, AD: ad, EN: en, ALOAD: al })) sim.set(p, v);
      sim.cycle(0);
      if (al) q = ad;
      assert.equal(sim.get('Q'), q, `cycle ${k}, before the edge`);
      sim.cycle(1);
      q = al ? ad : !en ? d : q;
      assert.equal(sim.get('Q'), q, `cycle ${k}`);
    }
  }
  // $adlatch: transparent while EN, reset while ARST (over EN)
  {
    const sim = new CompiledSim(compileNetlist(oneCell('$adlatch', { WIDTH: 8, EN_POLARITY: '1', ARST_POLARITY: '1', ARST_VALUE: '10100101' }, { D: 8, EN: 1, ARST: 1, Q: 8 }), { top: 't' }));
    let q = 0n;
    for (let k = 0; k < 300; k++) {
      const d = BigInt(Math.floor(r() * 256)), en = BigInt(r() < 0.5), arst = BigInt(r() < 0.2);
      for (const [p, v] of Object.entries({ D: d, EN: en, ARST: arst })) sim.set(p, v);
      sim.cycle(0);
      q = arst ? 0xA5n : en ? d : q;
      assert.equal(sim.get('Q'), q, `step ${k}`);
    }
  }
});

test('a memory\'s synchronous read ports: enable, synchronous and asynchronous resets, transparency, against a reference', () => {
  // 8 words of 6 bits; port 0 read-first, its resets over its enable; port 1 transparent to the write port,
  // its enable over its reset (RD_CE_OVER_SRST)
  let next = 2;
  const ports = {};
  const port = (name, w, dir = 'input') => { ports[name] = { direction: dir, bits: Array.from({ length: w }, () => next++) }; return ports[name].bits; };
  const clk = port('CLK', 1), wa = port('WA', 3), wd = port('WD', 6), we = port('WE', 6), ra0 = port('RA0', 3), ra1 = port('RA1', 3);
  const en0 = port('EN0', 1), en1 = port('EN1', 1), sr0 = port('SR0', 1), sr1 = port('SR1', 1), ar0 = port('AR0', 1);
  const q0 = port('Q0', 6, 'output'), q1 = port('Q1', 6, 'output');
  const P = { WIDTH: bin(6), SIZE: bin(8), ABITS: bin(3), OFFSET: bin(0), INIT: '010101'.repeat(8), MEMID: '\\m', RD_PORTS: bin(2), WR_PORTS: bin(1),
    RD_CLK_ENABLE: '11', RD_CLK_POLARITY: '11', RD_TRANSPARENCY_MASK: '10', RD_COLLISION_X_MASK: '00', RD_CE_OVER_SRST: '10', RD_WIDE_CONTINUATION: '00',
    RD_ARST_VALUE: 'xxxxxx010101', RD_SRST_VALUE: '110011101010', RD_INIT_VALUE: 'xxxxxx000111',
    WR_CLK_ENABLE: '1', WR_CLK_POLARITY: '1', WR_PRIORITY_MASK: '0', WR_WIDE_CONTINUATION: '0' };
  const C = { RD_CLK: [clk[0], clk[0]], RD_EN: [en0[0], en1[0]], RD_ARST: [ar0[0], '0'], RD_SRST: [sr0[0], sr1[0]], RD_ADDR: [...ra0, ...ra1], RD_DATA: [...q0, ...q1],
    WR_CLK: clk, WR_EN: we, WR_ADDR: wa, WR_DATA: wd };
  const json = { modules: { t: { ports, cells: { m: { type: '$mem_v2', parameters: P, connections: C } }, netnames: {} } } };
  for (const wide of [false, true]) {
    const sim = new CompiledSim(compileNetlist(json, { top: 't', wide }));
    const mem = Array(8).fill(0b010101n);
    let o0 = 0b000111n, o1 = 0n;
    assert.deepEqual([sim.get('Q0'), sim.get('Q1')], [o0, o1]);
    const r = rng(17);
    for (let k = 0; k < 500; k++) {
      const v = { WA: BigInt(Math.floor(r() * 8)), WD: BigInt(Math.floor(r() * 64)), WE: r() < 0.5 ? BigInt(Math.floor(r() * 64)) : 0n,
        RA0: BigInt(Math.floor(r() * 8)), RA1: BigInt(Math.floor(r() * 8)), EN0: BigInt(r() < 0.7), EN1: BigInt(r() < 0.7),
        SR0: BigInt(r() < 0.15), SR1: BigInt(r() < 0.15), AR0: BigInt(r() < 0.1) };
      for (const [p, x] of Object.entries(v)) sim.set(p, x);
      sim.cycle(0);
      if (v.AR0) o0 = 0b010101n;
      assert.equal(sim.get('Q0'), o0, `cycle ${k}, before the edge${wide ? ' (wide)' : ''}`);
      // the edge: the reads (port 1 seeing this edge's write), then the write
      const merged = (old, a) => (a === v.WA ? (old & ~v.WE & 63n) | (v.WD & v.WE) : old);
      o0 = v.AR0 ? 0b010101n : v.SR0 ? 0b101010n : v.EN0 ? mem[v.RA0] : o0;
      o1 = v.EN1 ? (v.SR1 ? 0b110011n : merged(mem[v.RA1], v.RA1)) : o1;
      mem[v.WA] = merged(mem[v.WA], v.WA);
      sim.cycle(1);
      assert.deepEqual([sim.get('Q0'), sim.get('Q1')], [o0, o1], `cycle ${k}${wide ? ' (wide)' : ''}`);
    }
  }
});

// ------------------------------------------------------------------ what it does not compile
const failure = async (name, text) => {
  try { await compileDesign(designOf(src(name, text), name.replace(/\.\w+$/, '')), { run: yosysNode }); } catch (e) { assert.ok(e instanceof CompileError, e.message); return e.message; }
  return null;
};
test('a combinational loop, an inout port, a tristate buffer, a primitive with no model: not compiled, with the reason', async () => {
  assert.equal(await failure('loop.v', 'module loop(input x, y, output a); wire b; assign a = b ^ x; assign b = a & y; endmodule'), "combinational loop through 'b': not compiled");
  assert.equal(await failure('io.v', "module io(input en, d, inout p, output q); assign p = en ? d : 1'bz; assign q = p; endmodule"), "the inout port 'p' (a tristate) cannot be compiled");
  const tb = oneCell('$tribuf', { WIDTH: 1 }, { A: 1, EN: 1, Y: 1 });
  assert.throws(() => compileNetlist(tb, { top: 't' }), { message: "the tristate buffer 'c' cannot be compiled" });
  assert.equal(await failure('dcm.v', 'module dcm(input clk, output o); wire c0; DCM_SP u (.CLKIN(clk), .CLK0(c0), .CLKFB(c0)); assign o = c0; endmodule'), 'the compiled simulator has no model of DCM_SP');
  // a latch in a loop with itself never settles: an error when it runs
  const s = await compileDesign(designOf(src('osc.v', 'module osc(input en, output reg q); always @* if (en) q = ~q; endmodule'), 'osc'), { run: yosysNode });
  s.set('en', 1);
  assert.throws(() => s.cycle(0), { name: 'Error', message: 'the design does not settle (a loop through a latch or a clock?)' });
});
test('an output at high impedance (Z) is 0, with a warning', async () => {
  const s = await compileDesign(designOf(src('tbuf.v', "module tbuf(input en, d, output p); assign p = en ? d : 1'bz; endmodule"), 'tbuf'), { run: yosysNode });
  assert.deepEqual(s.warnings, ["a high-impedance value ('Z') is 0 in the compiled simulator"]);
  s.set('d', 1);
  s.set('en', 1);
  s.cycle(0);
  assert.equal(s.get('p'), 1n);
  s.set('en', 0);
  s.cycle(0);
  assert.equal(s.get('p'), 0n);
});
test('the buffers (BUFG, IBUFG…) are wires; the clock through a BUFG is the main clock', async () => {
  const s = await compileDesign(designOf(src('withbuf.v', 'module withbuf(input clk, input [3:0] d, output reg [3:0] q); wire c; BUFG b (.I(clk), .O(c)); always @(posedge c) q <= q + d; endmodule'), 'withbuf'), { run: yosysNode });
  assert.deepEqual(s.warnings, []);
  assert.equal(s.model.clock.port, 'clk');
  s.set('d', 3);
  s.cycle(5);
  assert.equal(s.get('q'), 15n);
});

// ------------------------------------------------------------------ the API
test('set, cycle, get, reset; a 64-bit counter against its arithmetic', async () => {
  const s = await compileDesign(designOf(src('cnt.v', `module cnt(input clk, input [63:0] step, input hold, output reg [63:0] n);
    initial n = 64'hFFFF_FFFF_FFFF_FF00;
    always @(posedge clk) if (!hold) n <= n + step; endmodule`), 'cnt'), { run: yosysNode });
  const step = 0x1_0000_0001n;
  s.set('step', step);
  s.cycle(1000);
  assert.equal(s.cycles, 1000);
  assert.equal(s.get('n'), BigInt.asUintN(64, 0xFFFF_FFFF_FFFF_FF00n + 1000n * step));
  s.set('hold', 1);
  s.cycle(10);
  assert.equal(s.get('n'), BigInt.asUintN(64, 0xFFFF_FFFF_FFFF_FF00n + 1000n * step));
  s.set('step', -1n);   // (taken modulo 2^64)
  assert.equal(s.get('step'), 0xFFFF_FFFF_FFFF_FFFFn);
  s.reset();            // the registers at their initial values, the inputs kept
  assert.equal(s.cycles, 0);
  assert.equal(s.get('n'), 0xFFFF_FFFF_FFFF_FF00n);
  assert.equal(s.get('hold'), 1n);
  assert.throws(() => s.set('n', 1), { message: "'n' is not an input port" });
  assert.throws(() => s.get('nope'), { message: "no port or net 'nope'" });
});
test('the main clock: the input clocking the most register bits, of two the one named clk…; or the one given', async () => {
  const text = `module two(input clk, input b, output reg [3:0] p, q);
    always @(posedge clk) p <= p + 1; always @(posedge b) q <= q + 1; endmodule`;
  const json = (await netlistOf(designOf(src('two.v', text), 'two'), { run: yosysNode })).json;
  assert.equal(compileNetlist(json, { top: 'two' }).clock.port, 'clk');
  const s = new CompiledSim(compileNetlist(json, { top: 'two', clock: 'b' }));
  s.cycle(3);
  assert.deepEqual([s.get('p'), s.get('q')], [0n, 3n]);
  assert.throws(() => compileNetlist(json, { top: 'two', clock: 'p' }), { message: "the clock 'p' is not an input port" });
});

// ------------------------------------------------------------------ speed
test('speed: the compiled simulator runs millions of cycles per second (pong at its real generics)', async () => {
  const ex = example('pong');
  const s = await compileDesign(designOf(ex.design, ex.project.top), { run: yosysNode });
  s.cycle(100000);   // (compiled by the JIT)
  const t0 = performance.now();
  s.cycle(2_000_000);
  const rate = 2_000_000 / ((performance.now() - t0) / 1000);
  // (about 36 million per second on a laptop; the floor is for slow CI machines)
  assert.ok(rate > 2e6, `${Math.round(rate).toLocaleString()} cycles per second`);
});
