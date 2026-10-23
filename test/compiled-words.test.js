// A gate-level netlist at word level in the compiled cycle simulator (core/compiled-words.js, #650): netlists of
// Xilinx primitives as a synthesis writes them (MUXCY / XORCY carry chains, FDRE / FDE / FD, LUTs) run cycle by
// cycle as the event-driven simulator runs them (its UNISIM models: the reference), their carry chains additions,
// their registers words; those that are not words stay bits. The examples' simulation models (post-synthesis, and
// blinky's post-translate, post-map and post-place & route ones): the same values as bit by bit, faster.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES, example, exampleUcf } from './examples-lib.mjs';
import { diffCycles, designOf, rng } from './compiled-diff.js';
import { compileDesign, compileNetlist, CompiledSim, netlistOf } from '../core/compiled-sim.js';
import { wordLevel } from '../core/compiled-words.js';
import { gateModel } from '../core/compiled-tables.js';
import { yosysNode } from '../core/synth-open-node.js';

const src = (name, text) => [{ path: name, lang: 'verilog', role: 'design', text }];
const types = json => {
  const out = {};
  for (const c of Object.values(Object.values(json.modules)[0].cells)) {
    const k = `${c.type}${(c.connections.Y || c.connections.Q || []).length > 1 ? ' word' : ''}`;
    out[k] = (out[k] || 0) + 1;
  }
  return out;
};

// a carry chain of n stages: MUXCY (CI, DI, S) and XORCY (CI, LI = S); c: the carry in; s(i), di(i): the stage's S and
// DI; o(i): its XOR's output (null: none, a comparator's chain); the carry out in co
const chain = (p, n, { c, s, di, o, co }) => Array.from({ length: n }, (_, i) => [
  `  MUXCY ${p}m${i} (.CI(${i ? `${p}c[${i}]` : c}), .DI(${di(i)}), .S(${s(i)}), .O(${i === n - 1 && co ? co : `${p}c[${i + 1}]`}));`,
  ...(o(i) ? [`  XORCY ${p}x${i} (.CI(${i ? `${p}c[${i}]` : c}), .LI(${s(i)}), .O(${o(i)}));`] : []),
].join('\n')).join('\n');
const ffs = (p, n, cell, pins, init = () => 0) => Array.from({ length: n }, (_, i) => `  ${cell} #(.INIT(1'b${init(i)})) ${p}f${i} (.C(clk), ${pins(i)}, .Q(${p}[${i}]));`).join('\n');
const luts = (p, n, k, init, ins, out) => Array.from({ length: n }, (_, i) => `  LUT${k} #(.INIT(${init})) ${p}l${i} (${ins(i).map((x, j) => `.I${j}(${x})`).join(', ')}, .O(${out(i)}));`).join('\n');

// an up counter with a reset and an enable (FDRE; its carry in 1, DI 0: c & S once folded), its carry out
const UP = `module up(input clk, input rst, input en, output [7:0] q, output co);
  wire [8:0] uc; wire [7:0] d;
${chain('u', 8, { c: "1'b1", s: i => `q[${i}]`, di: () => "1'b0", o: i => `d[${i}]`, co: 'co' })}
${ffs('q', 8, 'FDRE', i => `.CE(en), .R(rst), .D(d[${i}])`)}
endmodule`;
// a down counter (FDE): S = ~q (LUT1), DI 1 (c | ~S once folded), carry in 0
const DOWN = `module down(input clk, input en, output [5:0] q);
  wire [6:0] dc; wire [5:0] s, d;
${luts('dn', 6, 1, "2'b01", i => [`q[${i}]`], i => `s[${i}]`)}
${chain('d', 6, { c: "1'b0", s: i => `s[${i}]`, di: () => "1'b1", o: i => `d[${i}]` })}
${ffs('q', 6, 'FDE', i => `.CE(en), .D(d[${i}])`)}
endmodule`;
// an accumulator: acc + b + cin (S = acc ^ b, LUT2; DI = acc), its carry out
const ACC = `module acc(input clk, input [9:0] b, input cin, output [9:0] a, output co);
  wire [10:0] ac; wire [9:0] s, d;
${luts('ax', 10, 2, "4'b0110", i => [`a[${i}]`, `b[${i}]`], i => `s[${i}]`)}
${chain('a', 10, { c: 'cin', s: i => `s[${i}]`, di: i => `a[${i}]`, o: i => `d[${i}]`, co: 'co' })}
${ffs('a', 10, 'FD', i => `.D(d[${i}])`)}
endmodule`;
// a 40-bit counter (FDR): a chain longer than a word, in pieces; from 2^31 - 6 (INIT), its first piece's carry out
// within a few cycles
const WIDE_INIT = 2 ** 31 - 6;
const WIDE = `module wide(input clk, input rst, output [39:0] q);
  wire [40:0] wc; wire [39:0] d;
${chain('w', 40, { c: "1'b1", s: i => `q[${i}]`, di: () => "1'b0", o: i => `d[${i}]` })}
${ffs('q', 40, 'FDR', i => `.R(rst), .D(d[${i}])`, i => Math.floor(WIDE_INIT / 2 ** i) % 2)}
endmodule`;
// a comparator's chain (no XOR): S = (x == y) bit by bit (LUT2), DI = y, of two registers loaded from the inputs
const CMP = `module cmp(input clk, input [7:0] a, input [7:0] b, output lt);
  wire [7:0] x, y, e; wire [8:0] kc;
${ffs('x', 8, 'FD', i => `.D(a[${i}])`)}
${ffs('y', 8, 'FD', i => `.D(b[${i}])`)}
${luts('k', 8, 2, "4'b1001", i => [`x[${i}]`, `y[${i}]`], i => `e[${i}]`)}
${chain('k', 8, { c: "1'b0", s: i => `e[${i}]`, di: i => `y[${i}]`, o: () => null, co: 'lt' })}
endmodule`;
// a counter whose bits have two enables (not one register: bits), and a rotating register (no chain: bits)
const MIXED = `module mixed(input clk, input e1, input e2, input dir, output [5:0] q, output [7:0] p);
  wire [6:0] xc; wire [5:0] d; wire [7:0] n;
${chain('x', 6, { c: "1'b1", s: i => `q[${i}]`, di: () => "1'b0", o: i => `d[${i}]` })}
${ffs('q', 6, 'FDE', i => `.CE(${i % 2 ? 'e2' : 'e1'}), .D(d[${i}])`)}
${luts('r', 8, 3, "8'hAC", i => [`p[${(i + 7) % 8}]`, `p[${(i + 1) % 8}]`, 'dir'], i => `n[${i}]`)}
${ffs('p', 8, 'FDS', i => `.S(${i ? "1'b0" : 'e1'}), .D(n[${i}])`)}
endmodule`;

// (the cells after: the words, and the bits left: a chain's first stages, folded with its constant carry in)
const DESIGNS = [
  ['up', UP, { chains: 1, registers: 1, cells: [40, 9] }, { '$not': 1, '$dff': 1, '$mux': 3, '$dff word': 1, '$add word': 1, '$mux word': 2 }],
  ['down', DOWN, { chains: 1, registers: 1, cells: [28, 14] }, { '$not': 1, '$shiftx': 2, '$xor': 1, '$dff': 2, '$mux': 2, '$dff word': 1, '$not word': 2, '$add word': 2, '$mux word': 1 }],
  ['acc', ACC, { chains: 1, registers: 1, cells: [40, 7] }, { '$dff word': 1, '$xor word': 1, '$or word': 1, '$not word': 1, '$and word': 1, '$add word': 2 }],
  ['wide', WIDE, { chains: 2, registers: 2, cells: [159, 13] }, { '$not': 1, '$dff': 2, '$mux': 3, '$xor': 1, '$dff word': 2, '$add word': 2, '$mux word': 2 }],
  ['cmp', CMP, { chains: 1, registers: 2, cells: [32, 13] }, { '$shiftx': 1, '$mux': 1, '$dff': 2, '$dff word': 2, '$not word': 2, '$xor word': 1, '$or word': 1, '$and word': 1, '$add word': 2 }],
  ['mixed', MIXED, { chains: 0, registers: 0, cells: [39, 39] }, { '$not': 1, '$dff': 14, '$or': 1, '$mux': 6, '$shiftx': 8, '$and': 4, '$xor': 5 }],
];

test('#650 carry chains as additions, their registers as words, the rest as bits: cycle by cycle as the event-driven simulator, no warnings', async () => {
  for (const [top, text, stats, cells] of DESIGNS) {
    const sources = src(`${top}.v`, text);
    const design = designOf(sources, top);
    const raw = (await netlistOf(design, { run: yosysNode, words: false })).json;
    const w = wordLevel(raw, top);
    assert.deepEqual(w.stats, stats, top);
    assert.deepEqual(types(w.json), cells, top);
    // (the bits keep their numbers: the netlist's nets and ports)
    assert.deepEqual(w.json.modules[top].ports, raw.modules[top].ports);
    assert.deepEqual(w.json.modules[top].netnames, raw.modules[top].netnames);
    const sim = await compileDesign(designOf(sources, top), { run: yosysNode });
    assert.deepEqual(sim.warnings, [], top);
    const r = rng(650);
    const ins = design.top.ports.filter(p => p.dir === 'in' && p.name !== 'clk');
    const res = await diffCycles(sources, top, {
      cycles: 1500,
      // (a reset seldom, the other inputs often)
      inputs: k => Object.fromEntries(ins.map(p => [p.name, p.name === 'rst' ? (r() < 0.02 ? 1 : 0) : Math.floor(r() * 2 ** p.sig.t.w)])),
    });
    assert.deepEqual(res.mismatches, [], top);
    assert.ok(res.bits >= 1500, `${top}: ${res.bits} bits compared`);
  }
});

test('#650 a chain longer than a word: its pieces\' carries (a 40-bit counter past 2^31)', async () => {
  const sim = await compileDesign(designOf(src('wide.v', WIDE), 'wide'), { run: yosysNode });
  assert.match(sim.model.code, /\$add|\+/);
  for (let k = 1; k <= 10; k++) {
    sim.cycle(1);
    assert.equal(sim.get('q'), BigInt(WIDE_INIT + k), `after ${k} cycles`);
  }
});

// the examples' models, from the Silinx toolchain's flow on the Basys2-250
async function models(name, steps) {
  const { runOpenFlow } = await import('../core/open-flow-core.js');
  const ex = example(name), top = ex.project.top, written = {};
  const io = { log: () => {}, sources: () => ex.design, simSources: () => ex.sim, yosys: yosysNode, write: (n, d) => { written[n] = d; return `build/${n}`; }, read: () => null, save: () => {} };
  if (steps.includes('par')) {
    const fs = await import('node:fs'), zlib = await import('node:zlib');
    const { loadDevice } = await import('../core/fpga/device.js');
    const { shippedDevicePath } = await import('../core/fpga/device-node.js');
    const { dbFileNames, dbFilesFrom, makeBitDb } = await import('../core/fpga/bitdb.js');
    const device = loadDevice(JSON.parse(zlib.gunzipSync(fs.readFileSync(shippedDevicePath('xc3s250ecp132-4'))).toString('utf8')));
    const db = {};
    for (const [k, f] of Object.entries(dbFileNames('xc3s250e', 'cp132'))) {
      const p = new URL(`../research/s3e-bitstream/db/${f}`, import.meta.url);
      db[k] = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
    }
    const bitDb = makeBitDb(dbFilesFrom(db, 'cp132'), device, 'xc3s250ecp132-4');
    Object.assign(io, { ucf: exampleUcf(name, { board: 'basys2', variant: '250' }).text, device: () => device, bitDb: () => bitDb });
  }
  const r = await runOpenFlow({ top, part: 'xc3s250ecp132-4', device: 'xc3s250e', pkg: 'cp132', family: 'spartan3e', steps, seed: 1, effort: 1, simTop: ex.project.simTop }, io);
  assert.equal(r.ok, true, r.error);
  const FILES = { postsynth: /^netgen\/synthesis\/[^/]*_synthesis\.v$/, posttrans: /^netgen\/translate\/[^/]*_translate\.v$/, postmap: /^netgen\/map\/[^/]*_map\.v$/, postpar: /^netgen\/par\/[^/]*_timesim\.v$/ };
  return Object.fromEntries(steps.filter(s => FILES[s]).map(s => {
    const file = Object.keys(written).find(f => FILES[s].test(f));
    return [s, designOf(src(file, written[file]), top)];
  }));
}
// the same outputs at word level as bit by bit, and with its irregular logic as tables too (#659: gateModel, as
// netlistOf makes it), cycle by cycle then in long runs, inputs at random; the speed-up
async function same(design, label) {
  const raw = await netlistOf(design, { run: yosysNode, words: false });
  const w = wordLevel(raw.json, raw.top), g = gateModel(raw.json, raw.top);
  const [a, b, c] = [raw, w, g].map(x => new CompiledSim(compileNetlist(x.json, { top: raw.top })));
  const clk = a.model.clock?.port, r = rng(650);
  const ins = design.top.ports.filter(p => p.dir === 'in' && p.name !== clk), outs = design.top.ports.filter(p => p.dir === 'out');
  for (let k = 0; k < 2500; k++) {
    if (k % 50 === 0) for (const p of ins) { const v = Math.floor(r() * 2 ** Math.min(p.sig.t.w, 30)); a.set(p.name, v); b.set(p.name, v); c.set(p.name, v); }
    const n = k < 2000 ? 1 : 10007;
    a.cycle(n); b.cycle(n); c.cycle(n);
    for (const p of outs) {
      assert.equal(b.get(p.name), a.get(p.name), `${label}: '${p.name}' after ${a.cycles} cycles`);
      assert.equal(c.get(p.name), a.get(p.name), `${label}: '${p.name}' after ${a.cycles} cycles, with tables`);
    }
  }
  return { stats: w.stats, tables: g.stats, chars: [a.model.code.length, b.model.code.length], work: c.model.stats.work };
}

// (chains, registers made words, cells before and after)
const EXPECTED = {
  gates: { chains: 0, registers: 0, cells: [1, 1] },
  traffic: { chains: 1, registers: 1, cells: [194, 141] },
  blinky: { chains: 5, registers: 5, cells: [549, 301] },
  pong: { chains: 9, registers: 8, cells: [1203, 439] },
  stopwatch: { chains: 3, registers: 3, cells: [391, 254] },
  clock: { chains: 6, registers: 6, cells: [920, 434] },
  vga: { chains: 2, registers: 2, cells: [498, 426] },
};
// (#659, #670: the equalities with a constant; the tables (their inputs at most, their words, their outputs), the
// cells before and after; the registers wordLevel made again of the flip-flops the tables feed)
const TABLES = {
  gates: [0, { tables: 0, inputs: 12, words: 0, outputs: 0, cells: [1, 1] }, 0],
  traffic: [1, { tables: 8, inputs: 12, words: 7632, outputs: 42, cells: [137, 39] }, 4],
  blinky: [2, { tables: 29, inputs: 12, words: 20368, outputs: 58, cells: [297, 146] }, 7],
  pong: [9, { tables: 39, inputs: 12, words: 40084, outputs: 99, cells: [379, 203] }, 6],
  stopwatch: [1, { tables: 31, inputs: 12, words: 12112, outputs: 62, cells: [250, 166] }, 9],
  clock: [9, { tables: 32, inputs: 12, words: 49880, outputs: 76, cells: [422, 149] }, 4],
  vga: [2, { tables: 19, inputs: 12, words: 48864, outputs: 55, cells: [425, 110] }, 2],
};
// (#670: the part of its operations a step evaluates at most, as the profile estimates it: clock's and vga's models,
// their display's and their pixel clock's logic changing at every other step, unguarded; blinky's display refresh
// counter at every step, #983)
const WORK = { gates: 1, traffic: 0.6, blinky: 0.45, pong: 0.5, stopwatch: 0.2, clock: 1, vga: 1 };
test('#650 #659 every example\'s Post-Synthesis Simulation Model at word level, its irregular logic as tables: the same outputs as bit by bit', { timeout: 600000 }, async () => {
  for (const name of EXAMPLES) {
    const { postsynth } = await models(name, ['postsynth']);
    const { stats, tables, chars, work } = await same(postsynth, name);
    assert.deepEqual(stats, EXPECTED[name], name);
    assert.deepEqual([tables.equalities.equalities, tables.tables, tables.registers], TABLES[name], name);
    if (stats.chains) assert.ok(chars[1] < chars[0], `${name}: ${chars}`);
    assert.ok(work.step <= WORK[name] * work.all, `${name}: ${JSON.stringify(work)}`);
  }
});
// (on a shared CI runner the two measurements vary with its load, #909: 6 against 5, 4 against 4 million cycles a
// second: there the ratio is reported, not checked; the work the activity saves is checked above, deterministically)
test('#670 speed: pong\'s Post-Synthesis Simulation Model, at least 1.4 times as fast with the activity as without it', { timeout: 300000 }, async (t) => {
  const { postsynth } = await models('pong', ['postsynth']);
  const { json, top, warnings } = await netlistOf(postsynth, { run: yosysNode });
  assert.deepEqual(warnings, []);
  const sims = [true, false].map(activity => new CompiledSim(compileNetlist(json, { top, activity })));
  const best = [0, 0];
  for (const s of sims) s.cycle(300000);   // (compiled by the JIT)
  for (let k = 0; k < 5; k++) sims.forEach((s, i) => { const t0 = performance.now(); s.cycle(500000); best[i] = Math.max(best[i], 500000 / ((performance.now() - t0) / 1000)); });
  // (about 1.65 times on a laptop: 30 against 18 million cycles a second; 1.29 times before #670)
  const said = `${best.map(x => Math.round(x / 1e6)).join(' against ')} million cycles a second`;
  if (process.env.CI) t.diagnostic(`#670 speed: ${said} (${(best[0] / best[1]).toFixed(2)} times; not checked on CI, #909)`);
  else assert.ok(best[0] > 1.4 * best[1], said);
  for (const p of postsynth.top.ports.filter(x => x.dir === 'out')) assert.equal(sims[0].get(p.name), sims[1].get(p.name), p.name);
});
test('#650 #659 blinky\'s post-translate, post-map and post-place & route models at word level, with tables (SIMPRIM; the router\'s LUT pins in any order)', { timeout: 600000 }, async () => {
  const m = await models('blinky', ['synth', 'translate', 'posttrans', 'map', 'postmap', 'par', 'trce', 'postpar']);
  // (postpar: Normal's two placements of a small design (#651), the faster kept, with no flip-flop replicated)
  const want = { posttrans: [549, 301], postmap: [639, 339], postpar: [639, 339] };
  const wantTables = {
    posttrans: [2, { tables: 20, inputs: 12, words: 11400, outputs: 112, cells: [301, 181] }, 6],
    postmap: [2, { tables: 26, inputs: 12, words: 11600, outputs: 133, cells: [339, 204] }, 6],
    postpar: [2, { tables: 26, inputs: 12, words: 11600, outputs: 133, cells: [339, 204] }, 6],
  };
  for (const [step, design] of Object.entries(m)) {
    const { stats, tables } = await same(design, step);
    assert.deepEqual(stats, { chains: 5, registers: 5, cells: want[step] }, step);
    assert.deepEqual([tables.equalities.equalities, tables.tables, tables.registers], wantTables[step], step);
  }
});
