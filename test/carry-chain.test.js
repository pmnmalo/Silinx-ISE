// Carry chains of logic written as gates (core/carry-chain.js, #77): found in the coarse netlist and made
// $alu cells, which synth_xilinx maps onto the carry chain (MUXCY / XORCY). Ripple adders written as
// gates (Verilog, an AND-inverter graph as the EPFL benchmarks, a VHDL schematic of full adders), a
// comparator; each synthesized and its netlist simulated against the design (test/diff-synth.js); a chain
// too short, and a design with few gates (synthesized as before, in one run of Yosys).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { synthesizeOpen as synthesizeOpenAll, criticalDelay } from '../core/synth-open.js';
import { yosysNode } from '../core/synth-open-node.js';
import { gateAssignments, rewriteCarryChains, GATE_MIN, MIN_CHAIN, ADDER_MIN } from '../core/carry-chain.js';
import { compareNetlist } from './diff-synth.js';
// Normal's own synthesis (its mappings on these small designs), not a small design's as at High (SMALL_RULE, #652: its
// own test in open-flow-core.test.js)
const synthesizeOpen = (d, o = {}) => synthesizeOpenAll(d, { smallRule: { maxLuts: -1 }, ...o });

const syn = async (text, top, lang = 'verilog', opts = {}) => {
  const design = elaborate(compile([{ path: lang === 'vhdl' ? 'd.vhd' : 'd.v', lang, text }]), top);
  const r = await synthesizeOpen(design, { family: 'spartan3e', run: yosysNode, ...opts });
  const d = compareNetlist(design, r, { name: top, sim: { cycles: 300 } });
  assert.equal(d.status, 'pass', d.report || d.reason);
  return { r, design };
};

// a ripple-carry adder of full adders written as gates, n bits
const rippleV = n => `module add(input [${n - 1}:0] a, b, input ci, output [${n - 1}:0] s, output co);
  wire [${n}:0] c;
  assign c[0] = ci;
  genvar i;
  generate for (i = 0; i < ${n}; i = i + 1) begin : fa
    assign s[i] = a[i] ^ b[i] ^ c[i];
    assign c[i + 1] = (a[i] & b[i]) | (c[i] & (a[i] ^ b[i]));
  end endgenerate
  assign co = c[${n}];
endmodule`;

// the same as an AND-inverter graph (as the EPFL benchmarks are written: only & and ~, carries inverted)
function aigAdder(n) {
  const L = [`module aig(${[...Array(n).keys()].map(i => `a${i}, b${i}`).join(', ')}, ${[...Array(n).keys()].map(i => `s${i}`).join(', ')}, co);`,
    `  input ${[...Array(n).keys()].map(i => `a${i}, b${i}`).join(', ')};`, `  output ${[...Array(n).keys()].map(i => `s${i}`).join(', ')}, co;`];
  let k = 0;
  const w = () => `n${k++}`;
  const decl = [];
  const and = (x, y) => { const r = w(); decl.push(r); L.push(`  assign ${r} = ${x} & ${y};`); return r; };
  const xor = (x, y) => { const p = and(x, `~${y}`), q = and(`~${x}`, y), r = and(`~${p}`, `~${q}`); return `~${r}`; };
  let nc = null;   // the inverted carry in (none at bit 0)
  for (let i = 0; i < n; i++) {
    const a = `a${i}`, b = `b${i}`;
    if (nc === null) { L.push(`  assign s${i} = ${xor(a, b)};`); nc = `~${and(a, b)}`; continue; }
    const c = `~${nc.replace(/^~/, '')}`.replace(/^~~/, '');
    const t = xor(a, b);
    L.push(`  assign s${i} = ${xor(t, nc.startsWith('~') ? nc.slice(1) : `~${nc}`)};`);
    // ~carry out = ~(a & b) & ~(c & (a ^ b))
    nc = and(`~${and(a, b)}`, `~${and(nc.startsWith('~') ? nc.slice(1) : `~${nc}`, t)}`);
    void c;
  }
  L.push(`  assign co = ~${nc.replace(/^~/, '')};`.replace('~~', ''));
  L.splice(3, 0, `  wire ${decl.join(', ')};`);
  L.push('endmodule');
  return L.join('\n');
}

test('a ripple adder written as gates, 16 bits: one chain of 16, made the carry chain (MUXCY / XORCY); the netlist simulates like it, no warning', { timeout: 300000 }, async () => {
  const { r, design } = await syn(rippleV(16), 'add');
  assert.ok(gateAssignments(design) >= GATE_MIN);
  assert.deepEqual(r.chains, [16]);
  assert.equal(r.cells.MUXCY, 16);
  assert.ok(r.cells.XORCY >= 15, JSON.stringify(r.cells));
  assert.deepEqual(r.warnings, []);
});

test('an adder as an AND-inverter graph (the EPFL adder\'s style: inverted carries), 32 bits: a chain, the carry chain', { timeout: 300000 }, async () => {
  const { r } = await syn(aigAdder(32), 'aig');
  assert.equal(r.chains.length, 1);
  assert.ok(r.chains[0] >= 30, JSON.stringify(r.chains));
  assert.ok(r.cells.MUXCY >= 30, JSON.stringify(r.cells));
  assert.deepEqual(r.warnings, []);
  // faster than the same adder mapped onto LUTs only (the carry chain: a few ns for 32 bits)
  assert.ok(criticalDelay(r.files[`${r.top}.json`], r.top) < 12, String(criticalDelay(r.files[`${r.top}.json`], r.top)));
});

test('a VHDL schematic of full adders (an entity instantiated per bit, as Silinx writes a schematic): the chain across the instances', { timeout: 300000 }, async () => {
  const text = `library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity fa is port (a, b, ci : in std_logic; s, co : out std_logic); end fa;
architecture g of fa is signal x : std_logic; begin x <= a xor b; s <= x xor ci; co <= (a and b) or (x and ci); end g;
entity add8 is port (a, b : in std_logic_vector(7 downto 0); s : out std_logic_vector(7 downto 0); co : out std_logic); end add8;
architecture s of add8 is signal c : std_logic_vector(8 downto 0); begin
  c(0) <= '0';
  g: for i in 0 to 7 generate u: entity work.fa port map (a => a(i), b => b(i), ci => c(i), s => s(i), co => c(i + 1)); end generate;
  co <= c(8);
end s;`;
  const { r } = await syn(text.replace('entity add8', 'library IEEE; use IEEE.STD_LOGIC_1164.ALL;\nentity add8'), 'add8', 'vhdl');
  assert.equal(r.chains.length, 1);
  assert.ok(r.chains[0] >= 7, JSON.stringify(r.chains));
  assert.ok(r.cells.MUXCY >= 7, JSON.stringify(r.cells));
});

test('a comparator a < b written as gates (a borrow chain: MAJ(~a, b, c)): a chain', { timeout: 300000 }, async () => {
  const n = 16;
  const text = `module lt(input [${n - 1}:0] a, b, output y);
  wire [${n}:0] c;
  assign c[0] = 1'b0;
  genvar i;
  generate for (i = 0; i < ${n}; i = i + 1) begin : g
    assign c[i + 1] = (~a[i] & b[i]) | (~(a[i] ^ b[i]) & c[i]);
  end endgenerate
  assign y = c[${n}];
endmodule`;
  const { r } = await syn(text, 'lt');
  assert.equal(r.chains.length, 1);
  assert.ok(r.chains[0] >= n - 1, JSON.stringify(r.chains));
  assert.ok(r.cells.MUXCY >= n - 1, JSON.stringify(r.cells));
});

test('a chain shorter than MIN_CHAIN is left to the LUTs; a design with few gates is synthesized as before (one run, no chain)', { timeout: 300000 }, async () => {
  // 3 bits of carry, but more than GATE_MIN gates: looked at, nothing rewritten
  const pad = [...Array(GATE_MIN)].map((_, i) => `  assign p[${i}] = a[0] ^ b[${i % 2}];`).join('\n');
  const short = rippleV(MIN_CHAIN - 1).replace('output co);', `output co, output [${GATE_MIN - 1}:0] p);\n${pad}`);
  const { r } = await syn(short, 'add');
  assert.deepEqual(r.chains, []);
  assert.equal(r.cells.MUXCY, undefined);
  // a counter (one gate): not looked at
  const { r: r2, design } = await syn('module cnt(input clk, output reg [7:0] q = 0); always @(posedge clk) q <= q + 1; endmodule', 'cnt');
  assert.ok(gateAssignments(design) < GATE_MIN);
  assert.deepEqual(r2.chains, []);
});

// #377: at effort Normal (the projects' default) an adder's chain too, when the design is not deep (#468 gives a
// deep one, the EPFL adder's 98 ns on LUTs, High's mappings): its first run beside the usual one; a comparator's
// chain left to the LUTs
// (the runs of the synthesis's mappings; the critical path's remaps after each, #652 / #653, the wider mapping, #54, and the
// search for state machines, #652, apart)
const counted = () => { const f = (...a) => { if (!/speedup|silinx_fold_ce|abc -luts 1,1,1,1,2,4;|silinx_fsm_(pre|forced)\.il/.test(a[0].join(' '))) f.n++; return yosysNode(...a); }; f.n = 0; return f; };
test('#377 effort Normal: a ripple adder written as gates (16 bits, not deep) on the carry chain, three runs of Yosys; the netlist simulates like it, no warning', { timeout: 300000 }, async () => {
  const run = counted();
  const { r } = await syn(rippleV(16), 'add', 'verilog', { effort: 'normal', run });
  assert.equal(run.n, 3);   // the coarse netlist and the usual run at once, then the netlist with the chain
  assert.equal(r.depth.auto, false);
  assert.deepEqual(r.chains, [16]);
  assert.equal(r.cells.MUXCY, 16);
  assert.equal(r.depth.tried, false);
  assert.deepEqual(r.warnings, []);
  // a deep one (the AND-inverter graph, 32 bits): High's mappings (#468), on the chain too
  const { r: deep } = await syn(aigAdder(32), 'aig', 'verilog', { effort: 'normal' });
  assert.equal(deep.depth.auto, true);
  assert.equal(deep.chains.length, 1);
  assert.deepEqual(deep.warnings, []);
});

test('#377 effort Normal: a comparator\'s chain (no sums), an adder shorter than ADDER_MIN and a design without chains keep the usual run\'s netlist, two runs; few gates, one', { timeout: 300000 }, async () => {
  const n = 16;
  const lt = `module lt(input [${n - 1}:0] a, b, output y);
  wire [${n}:0] c;
  assign c[0] = 1'b0;
  genvar i;
  generate for (i = 0; i < ${n}; i = i + 1) begin : g
    assign c[i + 1] = (~a[i] & b[i]) | (~(a[i] ^ b[i]) & c[i]);
  end endgenerate
  assign y = c[${n}];
endmodule`;
  let run = counted();
  const { r } = await syn(lt, 'lt', 'verilog', { effort: 'normal', run });
  assert.equal(run.n, 2);
  assert.deepEqual(r.chains, []);
  assert.equal(r.cells.MUXCY, undefined);
  assert.deepEqual(r.warnings, []);
  // an adder shorter than ADDER_MIN: on the LUTs (High: its chain)
  run = counted();
  const { r: r6, design: d6 } = await syn(rippleV(ADDER_MIN - 2), 'add', 'verilog', { effort: 'normal', run });
  assert.ok(gateAssignments(d6) >= GATE_MIN);
  assert.equal(run.n, 2);
  assert.deepEqual(r6.chains, []);
  assert.deepEqual((await syn(rippleV(ADDER_MIN - 2), 'add')).r.chains, [ADDER_MIN - 2]);
  run = counted();
  const { r: r2 } = await syn('module cnt(input clk, output reg [7:0] q = 0); always @(posedge clk) q <= q + 1; endmodule', 'cnt', 'verilog', { effort: 'normal', run });
  assert.equal(run.n, 1);
  assert.deepEqual(r2.chains, []);
});

test('#377 rewriteCarryChains: each chain\'s sums; adders: a comparator\'s chain left out, an adder\'s kept', { timeout: 300000 }, async () => {
  const { splitCommands, yosysFiles, SRL_CELLS_FILE, asText } = await import('../core/synth-open.js');
  const { toVerilog } = await import('../core/synth-verilog.js');
  const coarse = async (text, top) => {
    const { text: v } = toVerilog(elaborate(compile([{ path: 'd.v', lang: 'verilog', text }]), top));
    const [first] = splitCommands(top, 'spartan3e');
    const out = await yosysNode(['-q', '-p', `read_verilog -lib ${SRL_CELLS_FILE}; read_verilog -sv ${top}_syn.v; ${first}; select -module ${top}; write_json -selected c.json`], yosysFiles(top, v));
    return asText(out['c.json']);
  };
  const add = await coarse(rippleV(8), 'add');
  const all = rewriteCarryChains(add, { top: 'add' });
  assert.deepEqual(all.chains, [8]);
  assert.ok(all.sums[0] >= 7, JSON.stringify(all.sums));
  assert.deepEqual(rewriteCarryChains(add, { top: 'add', adders: true }).chains, [8]);
  const lt = await coarse(`module lt(input [7:0] a, b, output y); wire [8:0] c; assign c[0] = 1'b0;
  genvar i; generate for (i = 0; i < 8; i = i + 1) begin : g assign c[i + 1] = (~a[i] & b[i]) | (~(a[i] ^ b[i]) & c[i]); end endgenerate
  assign y = c[8]; endmodule`, 'lt');
  const cmp = rewriteCarryChains(lt, { top: 'lt' });
  assert.equal(cmp.chains.length, 1);
  assert.deepEqual(cmp.sums, [0]);
  const none = rewriteCarryChains(lt, { top: 'lt', adders: true });
  assert.deepEqual([none.chains, none.sums], [[], []]);
});

// #746: an adder whose sums are written as an AND-inverter graph's XOR (an AND of two inverted nets, so each sum
// is also a start, c = a & b), and a second adder whose carry in is one of them (the EPFL multiplier's rows)
const sumIntoAdder = `module two(input [7:0] a, b, e, f, output [7:0] s, t, output co, cot);
  wire [8:0] c, d;
  wire [7:0] h;
  assign c[0] = 1'b0;
  assign d[0] = s[3];
  genvar i;
  generate for (i = 0; i < 8; i = i + 1) begin : g
    assign h[i] = a[i] ^ b[i];
    assign s[i] = ~(~h[i] & ~c[i]) & ~(h[i] & c[i]);
    assign c[i + 1] = (a[i] & b[i]) | (c[i] & h[i]);
    assign t[i] = e[i] ^ f[i] ^ d[i];
    assign d[i + 1] = (e[i] & f[i]) | (d[i] & (e[i] ^ f[i]));
  end endgenerate
  assign co = c[8];
  assign cot = d[8];
endmodule`;
// the bits of a Yosys JSON module driven more than once (by cells' outputs and the input ports)
function multiplyDriven(mod) {
  const n = new Map();
  const see = b => { if (typeof b === 'number') n.set(b, (n.get(b) || 0) + 1); };
  for (const c of Object.values(mod.cells)) for (const [p, bits] of Object.entries(c.connections)) if (c.port_directions[p] === 'output') bits.forEach(see);
  for (const p of Object.values(mod.ports)) if (p.direction === 'input') p.bits.forEach(see);
  return [...n].filter(([, k]) => k > 1).map(([b]) => b);
}

test('#746 rewriteCarryChains: a chain whose first bit is another chain\'s sum starts at its next bit, the sum its carry in; every bit driven once', { timeout: 300000 }, async () => {
  const { splitCommands, yosysFiles, SRL_CELLS_FILE, asText } = await import('../core/synth-open.js');
  const { toVerilog } = await import('../core/synth-verilog.js');
  const { text: v } = toVerilog(elaborate(compile([{ path: 'd.v', lang: 'verilog', text: sumIntoAdder }]), 'two'));
  const [first] = splitCommands('two', 'spartan3e');
  const out = await yosysNode(['-q', '-p', `read_verilog -lib ${SRL_CELLS_FILE}; read_verilog -sv two_syn.v; ${first}; select -module two; write_json -selected c.json`], yosysFiles('two', v));
  const json = asText(out['c.json']);
  assert.deepEqual(multiplyDriven(JSON.parse(json).modules.two), []);
  const r = rewriteCarryChains(json, { top: 'two' });
  // (before: the second chain 9 bits, s[3] its first carry, driven by both chains)
  assert.deepEqual([r.chains, r.sums], [[8, 8], [7, 8]]);
  assert.deepEqual(multiplyDriven(r.json.modules.two), []);
});

test('#746 the two adders synthesized: both chains on the carry chain, no conflicting drivers, the netlist simulates like the design, no warning', { timeout: 300000 }, async () => {
  const { r } = await syn(sumIntoAdder, 'two');
  assert.deepEqual(r.chains, [8, 8]);
  assert.ok(r.cells.MUXCY >= 16, JSON.stringify(r.cells));
  assert.deepEqual(r.warnings, []);
  assert.ok(!r.log.some(l => /conflicting drivers/.test(l)), r.log.filter(l => /conflicting/.test(l)).join('\n'));
});

test('rewriteCarryChains on a netlist with no logic: nothing found, the netlist unchanged', () => {
  const json = { modules: { top: { attributes: { top: 1 }, ports: { a: { direction: 'input', bits: [2] }, y: { direction: 'output', bits: [3] } }, cells: { n: { type: '$not', parameters: {}, port_directions: { A: 'input', Y: 'output' }, connections: { A: [2], Y: [3] } } }, netnames: {} } } };
  const before = JSON.stringify(json);
  const r = rewriteCarryChains(json, { top: 'top' });
  assert.deepEqual([r.chains, r.sums], [[], []]);
  assert.equal(JSON.stringify(r.json), before);
});
