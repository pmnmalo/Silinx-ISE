// The Spartan-6 primitives' simulation models (#720: core/unisim-s6.js, the event-driven simulator's; core/compiled-
// prims-s6.js, the compiled engine's). Each primitive reached from RTL: the design synthesized for the Spartan-6 (Yosys
// xc6s maps it onto the primitive), its netlist simulated against the RTL under the same random stimulus, in Verilog
// (Yosys's netlist) and in VHDL (the Post-Synthesis Simulation Model), and the compiled engine running the model as
// the event-driven simulator does. The settings Yosys does not reach (the DSP48A1's pre-adder, X and Z inputs, carry,
// its asynchronous reset; a block RAM's output register and NO_CHANGE) on instances of the primitive, against values
// computed here: the carry chain as an adder, the DSP48A1's arithmetic in BigInt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';
import * as V from '../core/values.js';
import { UNISIM_SOURCE, primitiveSources } from '../core/unisim.js';
import { UNISIM_S6_VHDL } from '../core/unisim-s6.js';
import { synthesizeOpen } from '../core/synth-front.js';
import { QUIET } from '../packages/silinx-fpga/src/synth-open.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { postSynthesisModels, SIM_PRIMITIVES } from '../core/sim-model.js';
import { scalarizeNetlist } from '../core/netlist-hier.js';
import { PRIMITIVE_MODELS } from '../core/compiled-prims.js';
import { frontEnd, compareNetlist, stimulus, runSilinx, compareRuns, rng } from './diff-synth.js';
import { diffCycles, rng as rng2 } from './compiled-diff.js';

const S6 = ['CARRY4', 'SRLC32E', 'RAM128X1S', 'RAM128X1D', 'RAM256X1S', 'RAM32M', 'RAM64M', 'DSP48A1', 'RAMB8BWER', 'RAMB16BWER'];

test('the Spartan-6 primitives: in the UNISIM models and in the compiled engine\'s', () => {
  for (const p of S6) {
    assert.ok(SIM_PRIMITIVES.has(p), p);
    assert.ok(PRIMITIVE_MODELS[p], p);
  }
});

// (VHDL names are case-insensitive: a variable a hid the address port A of SRLC32E, diA the port DIA of RAMB16BWER)
test('the Spartan-6 models: no variable or signal has the name of one of the entity\'s ports', () => {
  for (const e of UNISIM_S6_VHDL.split(/\nentity /).slice(1)) {
    const name = e.split(' ')[0];
    const ports = new Set([...e.slice(e.indexOf('port ('), e.indexOf(`end ${name};`)).matchAll(/(\w+)(?=[\w\s,]*:\s*(?:in|out)\b)/g)].map(m => m[1].toLowerCase()));
    const names = [...e.matchAll(/\b(?:variable|signal)\s+([\w\s,]+?)\s*:/g)].flatMap(m => m[1].split(/\s*,\s*/));
    assert.deepEqual(names.filter(n => ports.has(n.toLowerCase())), [], name);
    assert.ok(ports.size > 3, name);
  }
});

// designs Yosys maps onto each primitive: { name, v (Verilog of module m), cells: { type: count } of the netlist, warnings:
// the synthesis's (none by default) }. Yosys's mapping onto RAMB8BWER (brams_xc3sda_map.v) connects its ports with the
// widths of RAMB16BWER's and Yosys resizes them: no warning of the design (synth-open.js QUIET, #2045).
const DESIGNS = [
  { name: 'counter', cells: { CARRY4: 6 }, v: 'module m(input clk, input rst, input [15:0] d, output reg [15:0] q, output lt); always @(posedge clk) if (rst) q <= 0; else q <= q + d; assign lt = q < d; endmodule' },
  { name: 'shift register', cells: { SRLC32E: 3, SRL16E: 1 }, v: 'module m(input clk, input ce, input d, output q, output q2); reg [99:0] s; always @(posedge clk) if (ce) s <= {s[98:0], d}; assign q = s[99]; assign q2 = s[20]; endmodule' },
  { name: 'shift register, its tap addressed', cells: { SRLC32E: 1 }, v: 'module m(input clk, input d, input [4:0] a, output q); reg [31:0] s = 0; always @(posedge clk) s <= {s[30:0], d}; assign q = s[a]; endmodule' },
  { name: 'distributed RAM 64 x 8, dual port', cells: { RAM64X1D: 8 }, v: 'module m(input clk, input we, input [5:0] wa, input [5:0] ra, input [7:0] d, output [7:0] q, output [7:0] q2); reg [7:0] mem [0:63]; integer i; initial for (i = 0; i < 64; i = i + 1) mem[i] = 0; always @(posedge clk) if (we) mem[wa] <= d; assign q = mem[ra]; assign q2 = mem[wa]; endmodule' },
  { name: 'distributed RAM 32 x 6', cells: { RAM32M: 1 }, v: 'module m(input clk, input we, input [4:0] wa, input [4:0] ra, input [5:0] d, output [5:0] q); reg [5:0] mem [0:31]; integer i; initial for (i = 0; i < 32; i = i + 1) mem[i] = i; always @(posedge clk) if (we) mem[wa] <= d; assign q = mem[ra]; endmodule' },
  { name: 'distributed RAM 64 x 3, three read ports', cells: { RAM64M: 3 }, v: 'module m(input clk, input we, input [5:0] wa, input [5:0] r1, input [5:0] r2, input [5:0] r3, input [2:0] d, output [2:0] q1, output [2:0] q2, output [2:0] q3); reg [2:0] mem [0:63]; integer i; initial for (i = 0; i < 64; i = i + 1) mem[i] = i; always @(posedge clk) if (we) mem[wa] <= d; assign q1 = mem[r1]; assign q2 = mem[r2]; assign q3 = mem[r3]; endmodule' },
  { name: 'distributed RAM 128 x 1', cells: { RAM128X1S: 1 }, v: 'module m(input clk, input we, input [6:0] a, input d, output q); reg mem [0:127]; integer i; initial for (i = 0; i < 128; i = i + 1) mem[i] = i % 3 == 0; always @(posedge clk) if (we) mem[a] <= d; assign q = mem[a]; endmodule' },
  { name: 'distributed RAM 128 x 1, dual port', cells: { RAM128X1D: 1 }, v: 'module m(input clk, input we, input [6:0] a, input [6:0] b, input d, output q, output q2); reg mem [0:127]; integer i; initial for (i = 0; i < 128; i = i + 1) mem[i] = 0; always @(posedge clk) if (we) mem[a] <= d; assign q = mem[a]; assign q2 = mem[b]; endmodule' },
  { name: 'distributed RAM 256 x 1', cells: { RAM256X1S: 1 }, v: 'module m(input clk, input we, input [7:0] a, input d, output q); reg mem [0:255]; integer i; initial for (i = 0; i < 256; i = i + 1) mem[i] = 0; always @(posedge clk) if (we) mem[a] <= d; assign q = mem[a]; endmodule' },
  { name: 'block RAM 1024 x 18', cells: { RAMB16BWER: 1 }, v: 'module m(input clk, input we, input [9:0] a, input [17:0] d, output reg [17:0] q); reg [17:0] mem [0:1023]; always @(posedge clk) begin if (we) mem[a] <= d; q <= mem[a]; end endmodule' },
  { name: 'block RAM 1024 x 18, write first', cells: { RAMB16BWER: 1 }, v: 'module m(input clk, input we, input [9:0] a, input [17:0] d, output reg [17:0] q); reg [17:0] mem [0:1023]; always @(posedge clk) begin if (we) begin mem[a] <= d; q <= d; end else q <= mem[a]; end endmodule' },
  { name: 'block RAM 4096 x 4', cells: { RAMB16BWER: 1 }, v: 'module m(input clk, input we, input [11:0] a, input [3:0] d, output reg [3:0] q); reg [3:0] mem [0:4095]; always @(posedge clk) begin if (we) mem[a] <= d; q <= mem[a]; end endmodule' },
  { name: 'block RAM 512 x 32, byte write enables', cells: { RAMB16BWER: 1 }, v: 'module m(input clk, input [3:0] we, input [8:0] a, input [31:0] d, output reg [31:0] q); reg [31:0] mem [0:511]; always @(posedge clk) begin if (we[0]) mem[a][7:0] <= d[7:0]; if (we[1]) mem[a][15:8] <= d[15:8]; if (we[2]) mem[a][23:16] <= d[23:16]; if (we[3]) mem[a][31:24] <= d[31:24]; q <= mem[a]; end endmodule' },
  { name: 'block RAM 2048 x 9, two write ports', cells: { RAMB16BWER: 1 }, sim: { distinct: [{ a: 'a', b: 'b', mask: 2047 }] },
    v: 'module m(input clk, input wea, input web, input [10:0] a, input [10:0] b, input [8:0] da, input [8:0] db, output reg [8:0] qa, output reg [8:0] qb); reg [8:0] mem [0:2047]; always @(posedge clk) begin if (wea) mem[a] <= da; qa <= mem[a]; end always @(posedge clk) begin if (web) mem[b] <= db; qb <= mem[b]; end endmodule' },
  { name: 'block RAM 512 x 16, two ports', cells: { RAMB8BWER: 1 }, v: 'module m(input clk, input we, input [8:0] a, input [8:0] b, input [15:0] d, output reg [15:0] q); reg [15:0] mem [0:511]; always @(posedge clk) begin if (we) mem[a] <= d; q <= mem[b]; end endmodule' },
  { name: 'block RAM 256 x 36 (SDP)', cells: { RAMB8BWER: 1 }, v: 'module m(input clk, input we, input [7:0] a, input [7:0] b, input [35:0] d, output reg [35:0] q); reg [35:0] mem [0:255]; always @(posedge clk) begin if (we) mem[a] <= d; q <= mem[b]; end endmodule' },
  { name: 'block RAM 512 x 16, its output reset', cells: { RAMB8BWER: 1 }, v: "module m(input clk, input rst, input we, input [8:0] a, input [15:0] d, output reg [15:0] q); reg [15:0] mem [0:511]; always @(posedge clk) begin if (we) mem[a] <= d; if (rst) q <= 16'h1234; else q <= mem[a]; end endmodule" },
  { name: 'block ROM 1024 x 8', cells: { RAMB8BWER: 1 }, v: 'module m(input clk, input [9:0] a, output reg [7:0] q); reg [7:0] mem [0:1023]; integer i; initial for (i = 0; i < 1024; i = i + 1) mem[i] = i * 7; always @(posedge clk) q <= mem[a]; endmodule' },
  { name: 'multiplier 18 x 18', cells: { DSP48A1: 1 }, v: 'module m(input clk, input signed [17:0] a, input signed [17:0] b, output signed [35:0] p); assign p = a * b; endmodule' },
  { name: 'multiplier, its inputs and product registered', cells: { DSP48A1: 1 }, v: 'module m(input clk, input signed [17:0] a, input signed [17:0] b, output reg signed [35:0] p); reg signed [17:0] ra, rb; always @(posedge clk) begin ra <= a; rb <= b; p <= ra * rb; end endmodule' },
  { name: 'multiply-accumulate', cells: { DSP48A1: 1 }, v: 'module m(input clk, input rst, input signed [17:0] a, input signed [17:0] b, output reg signed [47:0] acc); always @(posedge clk) if (rst) acc <= 0; else acc <= acc + a * b; endmodule' },
  { name: 'multiply and add', cells: { DSP48A1: 1 }, v: 'module m(input clk, input [7:0] a, input [9:0] b, input [15:0] c, output [31:0] p); assign p = a * b + c; endmodule' },
  { name: 'multiplier 25 x 25', cells: { DSP48A1: 4 }, v: 'module m(input clk, input [24:0] a, input [24:0] b, output [49:0] p); assign p = a * b; endmodule' },
];

// the RTL and a model of the netlist under the same stimulus (as test/diff-synth.js compareNetlist, the clock clk)
function rtlVsModel(design, model, top, { cycles, sim = {}, seed }) {
  const outs = design.top.ports.filter(p => p.dir === 'out').map(p => p.name.toLowerCase()).sort();
  const widths = outs.map(n => [n, design.top.ports.find(p => p.name.toLowerCase() === n).sig.t.w]);
  const inputs = design.top.ports.filter(p => p.dir === 'in' && p.name !== 'clk').map(p => ({ name: p.name, w: p.sig.t.w }));
  const stim = stimulus(rng(seed), { ...sim, cycles }, inputs, cycles);
  const fe = frontEnd([UNISIM_SOURCE, model], top);
  assert.ok(fe.design, fe.reason);
  const clocks = design.top.ports.some(p => p.name === 'clk') ? ['clk'] : [];
  const rtl = runSilinx(design, { clocks, sim, stim, outs });
  const net = runSilinx(fe.design, { clocks, sim, stim, outs, power: false });
  return compareRuns(rtl, net, widths);
}

for (const d of DESIGNS) {
  test(`${d.name}: onto ${Object.keys(d.cells).join(', ')}; the netlist simulates as the RTL in Verilog and in VHDL, the compiled engine as the event-driven simulator`, { timeout: 300000 }, async () => {
    const fe = frontEnd([{ path: 'm.v', lang: 'verilog', text: d.v }], 'm');
    assert.ok(fe.design, fe.reason);
    const lines = [];
    const syn = await synthesizeOpen(fe.design, { family: 'spartan6', run: yosysNode, onLine: l => lines.push(l) });
    for (const [t, n] of Object.entries(d.cells)) assert.equal(syn.cells[t], n, `${t}: ${JSON.stringify(syn.cells)}`);
    assert.deepEqual(lines.filter(l => /^Warning:/.test(l) && !QUIET.some(re => re.test(l))), d.warnings || [], 'the warnings');
    const sim = { cycles: 300, ...d.sim };
    // Verilog: Yosys's netlist with the UNISIM models
    const r = compareNetlist(fe.design, syn, { name: d.name, engine: 'unisim', sim });
    assert.equal(r.status, 'pass', r.report || r.reason);
    // VHDL: the Post-Synthesis Simulation Model
    const m = postSynthesisModels(syn, { top: 'm' });
    assert.deepEqual(m.unknown, []);
    const vhdl = { path: 'm_synthesis.vhd', lang: 'vhdl', text: scalarizeNetlist(m.vhdl) };
    assert.equal(rtlVsModel(fe.design, vhdl, 'm', { cycles: 300, sim: d.sim, seed: d.name }), null, 'the VHDL model differs from the RTL');
    // the compiled engine, on both models
    for (const model of [vhdl, { path: 'm_synthesis.v', lang: 'verilog', text: m.verilog }]) {
      const ins = fe.design.top.ports.filter(p => p.dir === 'in' && p.name !== 'clk'), g = rng2(720), cur = {};
      const res = await diffCycles([{ ...model, role: 'design' }], 'm', { cycles: 300, inputs: k => { for (const x of ins) if (k === 0 || g() < 0.3) cur[x.name] = BigInt(Math.floor(g() * 2 ** Math.min(x.sig.t.w, 30))); return cur; } });
      assert.deepEqual(res.mismatches, [], `${model.lang}: the compiled engine differs`);
    }
  });
}

// an instance of a primitive in a Verilog module, elaborated with the UNISIM models: { s, port(name), set, get }
function harness(text, top = 't') {
  const srcs = [{ path: 't.v', lang: 'verilog', text }];
  const lib = compile([...primitiveSources(srcs), ...srcs]);
  const d = elaborate(lib, top);
  assert.deepEqual([...lib.errors, ...d.diags].filter(x => x.severity === 'error').map(x => x.message), []);
  const s = new Simulator(d);
  const port = n => d.top.ports.find(p => p.name === n).sig;
  let t = 1000;
  s.run(t);
  return {
    set: (vals) => { for (const [k, v] of Object.entries(vals)) s.force(port(k), V.mk(port(k).t.w, BigInt(v))); t += 1000; s.run(t); },
    get: (n) => { const v = port(n).val; return v.x ? null : v.v; },
    clock: () => { s.force(port('clk'), V.mk(1, 1n)); t += 1000; s.run(t); s.force(port('clk'), V.mk(1, 0n)); t += 1000; s.run(t); },
  };
}

test('CARRY4: the carry chain of an adder, every 4-bit a, b and carry in (CI, or CYINIT), against a + b + c', () => {
  const h = harness('module t(input [3:0] a, input [3:0] b, input ci, input cyinit, output [3:0] co, output [3:0] o); CARRY4 c (.CO(co), .O(o), .CI(ci), .CYINIT(cyinit), .DI(a), .S(a ^ b)); endmodule');
  for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) for (const [ci, cy] of [[0, 0], [1, 0], [0, 1]]) {
    h.set({ a, b, ci, cyinit: cy });
    const c = ci | cy, sum = a + b + c;
    // the carry out of bit i: the carry into bit i + 1 of a + b + c
    const co = [0, 1, 2, 3].reduce((v, i) => v | ((((a & ((2 << i) - 1)) + (b & ((2 << i) - 1)) + c) >> (i + 1)) << i), 0);
    assert.equal(Number(h.get('o')), sum & 15, `${a} + ${b} + ${c}`);
    assert.equal(Number(h.get('co')), co, `${a} + ${b} + ${c} carries`);
  }
});

// the DSP48A1's arithmetic (UG389), the reference: P = Z ± (X + CIN), X by OPMODE[1:0] (0, M, P, D:A:B), Z by OPMODE[3:2]
// (0, PCIN, P, C), B1 the pre-adder's D ± B when OPMODE[4] (OPMODE[6] subtracts), CIN OPMODE[5]
const sx = (v, w) => BigInt.asIntN(w, BigInt(v));
function dspRef({ a, b, c, d, pcin, op, p = 0n }) {
  const b1 = op & 16 ? BigInt.asUintN(18, op & 64 ? BigInt(d) - BigInt(b) : BigInt(d) + BigInt(b)) : BigInt(b);
  const m = BigInt.asUintN(36, sx(a, 18) * sx(b1, 18));
  const x = [0n, BigInt.asUintN(48, sx(m, 36)), p, (BigInt(d & 0xfff) << 36n) | (BigInt(a) << 18n) | b1][op & 3];
  const z = [0n, BigInt(pcin), p, BigInt(c)][(op >> 2) & 3];
  const cin = BigInt((op >> 5) & 1);
  return { p: BigInt.asUintN(48, op & 128 ? z - (x + cin) : z + x + cin), m, b1 };
}

test('DSP48A1 without registers: the pre-adder, the multiplier, every X and Z input, the carry in, subtraction, against the arithmetic of UG389', () => {
  const h = harness(`module t(input [17:0] a, b, d, input [47:0] c, pcin, input [7:0] op, output [47:0] p, output [35:0] m, output [17:0] bc);
  DSP48A1 #(.A0REG(0), .A1REG(0), .B0REG(0), .B1REG(0), .CARRYINREG(0), .CARRYOUTREG(0), .CREG(0), .DREG(0), .MREG(0), .OPMODEREG(0), .PREG(0))
    u (.A(a), .B(b), .C(c), .D(d), .PCIN(pcin), .OPMODE(op), .P(p), .M(m), .BCOUT(bc), .CLK(1'b0));
endmodule`);
  const r = rng2(1);
  const big = w => BigInt.asUintN(w, BigInt(Math.floor(r() * 2 ** 30)) * BigInt(Math.floor(r() * 2 ** 30)));
  // (X = P and Z = P read the P register, here 0)
  for (let k = 0; k < 400; k++) {
    const v = { a: big(18), b: big(18), c: big(48), d: big(18), pcin: big(48), op: Math.floor(r() * 256) };
    h.set(v);
    const e = dspRef({ ...v, a: Number(v.a), b: Number(v.b), d: Number(v.d) });
    assert.equal(h.get('p'), e.p, `OPMODE ${v.op.toString(2).padStart(8, '0')}`);
    assert.equal(h.get('m'), e.m);
    assert.equal(h.get('bc'), e.b1);
  }
});

test('DSP48A1 registered: an accumulator (X = M, Z = P) through A1REG, B1REG, MREG, PREG, its synchronous reset, then RSTTYPE ASYNC', () => {
  for (const rsttype of ['SYNC', 'ASYNC']) {
    const h = harness(`module t(input clk, input rst, input [17:0] a, b, output [47:0] p);
  DSP48A1 #(.A0REG(0), .A1REG(1), .B0REG(0), .B1REG(1), .CARRYINREG(0), .CARRYOUTREG(0), .CREG(0), .DREG(0), .MREG(1), .OPMODEREG(0), .PREG(1), .RSTTYPE("${rsttype}"))
    u (.A(a), .B(b), .OPMODE(8'b00001001), .P(p), .CLK(clk), .RSTA(rst), .RSTB(rst), .RSTM(rst), .RSTP(rst));
endmodule`);
    h.set({ clk: 0, rst: 1, a: 0, b: 0 });
    h.clock();
    h.set({ rst: 0 });
    const r = rng2(2), as = [], bs = [];
    let acc = 0n;
    for (let k = 0; k < 40; k++) {
      const a = Math.floor(r() * 2 ** 18), b = Math.floor(r() * 2 ** 18);
      as.push(a); bs.push(b);
      h.set({ a, b });
      h.clock();
      // (the product of the inputs of two clocks before: A1 / B1, then M, then P)
      if (k >= 2) acc = BigInt.asUintN(48, acc + sx(sx(as[k - 2], 18) * sx(bs[k - 2], 18), 48));
      assert.equal(h.get('p'), acc, `${rsttype} clock ${k}`);
    }
    // the reset: synchronous waits for the clock, asynchronous does not
    h.set({ rst: 1 });
    assert.equal(h.get('p'), rsttype === 'ASYNC' ? 0n : acc, rsttype);
    h.clock();
    assert.equal(h.get('p'), 0n, rsttype);
  }
});

test('RAMB16BWER: the output register (DOA_REG) one clock after the latch, NO_CHANGE keeping the output on a write, INIT_A and SRVAL_A', () => {
  const h = harness(`module t(input clk, input en, input rst, input [3:0] we, input [13:0] addr, input [31:0] di, output [31:0] do, output [3:0] dop, output [31:0] dob);
  RAMB16BWER #(.DATA_WIDTH_A(18), .DATA_WIDTH_B(18), .DOA_REG(1), .DOB_REG(0), .WRITE_MODE_A("NO_CHANGE"), .WRITE_MODE_B("READ_FIRST"),
    .INIT_A(36'h0_0000_ABCD), .SRVAL_A(36'h0_0003_5A5A), .INIT_00(256'h00000000_00000000_00000000_00000000_00000000_00000000_00000000_9876_0000))
    u (.CLKA(clk), .ENA(en), .REGCEA(1'b1), .RSTA(rst), .WEA(we), .ADDRA(addr), .DIA(di), .DIPA(4'd0), .DOA(do), .DOPA(dop),
       .CLKB(clk), .ENB(1'b1), .REGCEB(1'b0), .RSTB(1'b0), .WEB(4'd0), .ADDRB(addr), .DIB(32'd0), .DIPB(4'd0), .DOB(dob));
endmodule`);
  // (18 bits: ADDR(13 downto 4) the word; word 1 of INIT_00 is 9876)
  assert.equal(h.get('do'), 0xabcdn, 'INIT_A at start');
  h.set({ clk: 0, en: 1, rst: 0, we: 0, addr: 1 << 4, di: 0 });
  h.clock();
  assert.equal(h.get('do'), 0xabcdn, 'the register holds the latch of before');
  assert.equal(h.get('dob'), 0x9876n, 'port B: the word read');
  h.clock();
  assert.equal(h.get('do'), 0x9876n, 'one clock later');
  h.set({ we: 3, di: 0x1111 });
  h.clock(); h.clock();
  assert.equal(h.get('do'), 0x9876n, 'NO_CHANGE: a write leaves the output');
  assert.equal(h.get('dob'), 0x1111n, 'the word written');
  h.set({ we: 1, di: 0x2222 });   // the low byte only
  h.clock();
  h.set({ we: 0 });
  h.clock(); h.clock();
  assert.equal(h.get('do'), 0x1122n, 'byte write enables');
  h.set({ rst: 1 });
  h.clock();
  assert.equal(h.get('do'), 0x5a5an, 'SRVAL_A into the register');
  assert.equal(h.get('dop'), 3n);
});
