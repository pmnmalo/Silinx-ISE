// The critical LUTs made one level shallower, their fan-out kept (packages/silinx-fpga/src/lut-resynth.js, #652): the decomposition
// F = h(g(A), S) against functions built so (and one that is not), a netlist written by hand (spi-fpga-slave's shift
// register enable) checked against its expressions on every input, a round undone, and the open synthesis's candidate
// (the same design in VHDL and in Verilog, its netlist simulated against the design, test/diff-synth.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { synthesizeOpen } from '../core/synth-front.js';
import { criticalDelay, logicLevels, pathEnds, cellCounts, utilization } from '../packages/silinx-fpga/src/synth-open.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { decompose, shallower, netlistLevels, resynthCritical, RESYNTH_RULE } from '../packages/silinx-fpga/src/lut-resynth.js';
import { compareNetlist } from './diff-synth.js';

// a table of n variables from a function of the row's bits
const table = (n, f) => Uint8Array.from({ length: 1 << n }, (_, m) => +!!f(Array.from({ length: n }, (_, i) => (m >> i) & 1)));
const column = (n, i) => table(n, x => x[i]);
// a deterministic pseudo-random generator (tests repeat)
const rng = (s => () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x80000000; })(652);

test('#652 decompose: F = h(g(A), S) found for functions built so, its g and h giving F again; none where F is not such a function', () => {
  const n = 7;
  for (let k = 0; k < 40; k++) {
    // A: 2 to 4 of the variables, S: up to 3 of the others; g and h random tables
    const vars = [...Array(n).keys()].sort(() => rng() - 0.5);
    const nA = 2 + Math.floor(rng() * 3), nS = Math.floor(rng() * Math.min(4, n - nA));
    const A = vars.slice(0, nA), S = vars.slice(nA, nA + nS);
    const g = Array.from({ length: 1 << nA }, () => +(rng() < 0.5)), h = Array.from({ length: 2 << nS }, () => +(rng() < 0.5));
    const idx = (x, vs) => vs.reduce((v, i, j) => v | (x[i] << j), 0);
    const F = table(n, x => h[(idx(x, S) << 1) | g[idx(x, A)]]);
    const r = decompose(F, 1 << n, A.map(i => column(n, i)), S.map(i => column(n, i)));
    assert.ok(r, `case ${k}`);
    assert.deepEqual(table(n, x => r.h[(idx(x, S) << 1) | r.g[idx(x, A)]]), F, `case ${k}: h(g(A), S) is F`);
  }
  // with no A: F a function of S alone (h over S), or not
  const F = table(4, x => (x[0] & x[1]) | x[3]);
  const r = decompose(F, 16, [], [0, 1, 3].map(i => column(4, i)));
  assert.deepEqual([...r.h], [0, 0, 0, 1, 1, 1, 1, 1]);
  assert.equal(decompose(F, 16, [], [0, 1].map(i => column(4, i))), null, 'F depends on x3 too');
  // the majority of 5: its two inputs' sum has three values that matter, not a function of one bit of them
  const maj = table(5, x => x.reduce((a, b) => a + b) >= 3);
  assert.equal(decompose(maj, 32, [0, 1].map(i => column(5, i)), [2, 3, 4].map(i => column(5, i))), null);
  // but h(g(x0, x1, x2), x3, x4)? also three values of the sum that matter: none
  assert.equal(decompose(maj, 32, [0, 1, 2].map(i => column(5, i)), [3, 4].map(i => column(5, i))), null);
});

// spi-fpga-slave's shift register (#652), its signals the module's inputs (level 0): rx (a LUT3, level 1), load (a LUT4 of
// rx, level 2, read by the D logic too), en = load | (sp & ~sc & ~cs) (level 3) on a flip-flop's CE
const INPUTS = ['sc', 'sp', 'last', 'busy', 'vld', 'cs', 'd0', 'q1'];
function spiNetlist() {
  const bit = Object.fromEntries(INPUTS.map((n, i) => [n, i + 2]));
  const lut = (ins, f, out) => ({ type: `LUT${ins.length}`, parameters: { INIT: Array.from({ length: 1 << ins.length }, (_, m) => +!!f(ins.map((_, i) => (m >> i) & 1))).reverse().join('') },
    port_directions: { ...Object.fromEntries(ins.map((_, i) => [`I${i}`, 'input'])), O: 'output' }, connections: { ...Object.fromEntries(ins.map((b, i) => [`I${i}`, [b]])), O: [out] } });
  const [rx, load, en, d] = [20, 21, 22, 23];
  const cells = {
    rx: lut([bit.sc, bit.sp, bit.last], ([a, b, c]) => a & !b & c, rx),
    load: lut([bit.busy, bit.cs, rx, bit.vld], ([b, c, r, v]) => v & ((c & !b) | r), load),
    en: lut([load, bit.sp, bit.sc, bit.cs], ([l, p, s, c]) => l | (p & !s & !c), en),
    d: lut([load, bit.d0, bit.q1], ([l, a, b]) => (l ? a : b), d),
    ff: { type: 'FDRE', parameters: {}, port_directions: { C: 'input', CE: 'input', D: 'input', R: 'input', Q: 'output' }, connections: { C: [bit.sc], CE: [en], D: [d], R: ['0'], Q: [30] } },
  };
  const ports = { ...Object.fromEntries(INPUTS.map(n => [n, { direction: 'input', bits: [bit[n]] }])), q: { direction: 'output', bits: [30] } };
  const netnames = { ...Object.fromEntries(Object.entries(ports).map(([n, p]) => [n, { bits: p.bits }])), rx: { bits: [rx] }, load: { bits: [load] }, en: { bits: [en] }, d: { bits: [d] } };
  return { bit, json: { modules: { spi: { attributes: { top: '1' }, ports, cells, netnames } } } };
}
// the value of a bit of the netlist for the inputs given (through its LUTs), an evaluator of the test's own
function value(mod, b, inputs) {
  const drv = new Map();
  for (const c of Object.values(mod.cells)) for (const [p, bits] of Object.entries(c.connections)) if (c.port_directions[p] === 'output') drv.set(bits[0], c);
  const ev = x => {
    if (typeof x !== 'number') return +(x === '1');
    if (inputs.has(x)) return inputs.get(x);
    const c = drv.get(x);
    if (/^MUXF/.test(c.type)) return ev(c.connections.S[0]) ? ev(c.connections.I1[0]) : ev(c.connections.I0[0]);
    const k = +c.type[3], init = c.parameters.INIT;
    let i = 0;
    for (let j = 0; j < k; j++) i |= ev(c.connections[`I${j}`][0]) << j;
    return +init[init.length - 1 - i];
  };
  return ev(b);
}

test('#652 the enable of spi-fpga-slave\'s shift register: 2 levels instead of 3, the shared load kept and read by D, the same functions on every input', () => {
  const { bit, json } = spiNetlist();
  const mod = json.modules.spi;
  const lv = netlistLevels(mod);
  assert.deepEqual([20, 21, 22, 23].map(lv.level), [1, 2, 3, 3]);
  const r = resynthCritical(json, 'spi', () => [{ cell: 'ff', port: 'CE' }]);
  assert.ok(r);
  assert.deepEqual([r.rounds, r.luts], [1, 1]);
  const m = r.json.modules.spi;
  const after = netlistLevels(m);
  assert.equal(after.level(22), 2, 'the enable one level shallower');
  // its output (and so the flip-flop's CE) kept; load and rx kept, read by D and by the new LUTs; one LUT more
  assert.deepEqual(m.cells.ff.connections.CE, [22]);
  assert.ok(m.cells.load && m.cells.rx);
  assert.equal(m.cells.d.connections.I0[0], 21);
  assert.equal(Object.values(m.cells).filter(c => /^LUT/.test(c.type)).length, 5);
  assert.ok(Object.values(m.cells).every(c => !/^LUT/.test(c.type) || +c.type[3] <= 4));
  // every input: the enable and D as their expressions (the test's reference), and as the netlist before
  for (let v = 0; v < 1 << INPUTS.length; v++) {
    const x = Object.fromEntries(INPUTS.map((n, i) => [n, (v >> i) & 1]));
    const inputs = new Map(INPUTS.map(n => [bit[n], x[n]]));
    const load = x.vld & ((x.cs & !x.busy) | (x.sc & !x.sp & x.last));
    assert.equal(value(m, 22, inputs), +(load | (x.sp & !x.sc & !x.cs)), `en, inputs ${v}`);
    assert.equal(value(m, 23, inputs), load ? x.d0 : x.q1, `d, inputs ${v}`);
    assert.equal(value(m, 22, inputs), value(mod, 22, inputs));
  }
  // the netlist given is not changed
  assert.equal(netlistLevels(mod).level(22), 3);
});

test('#652 a round makes the ends it can shallower and leaves the others; none it can: nothing changed', () => {
  const { bit, json } = spiNetlist();
  // the D logic (a LUT3 of load, level 3) has no shallower form (8 leaves: too many for the wide multiplexers either);
  // the enable has: the round makes the enable 2 levels and leaves D as it was
  const mod = json.modules.spi;
  assert.equal(shallower(mod, 23, netlistLevels(mod)), null);
  const r = resynthCritical(json, 'spi', () => [{ cell: 'ff', port: 'CE' }, { cell: 'ff', port: 'D' }]);
  assert.ok(r);
  assert.deepEqual([r.rounds, r.luts], [1, 1]);
  const m = r.json.modules.spi;
  assert.deepEqual([22, 23].map(netlistLevels(m).level), [2, 3]);
  assert.deepEqual(m.cells.d, mod.cells.d, 'D\'s LUT as it was');
  for (let v = 0; v < 1 << INPUTS.length; v++) {
    const inputs = new Map(INPUTS.map((n, i) => [bit[n], (v >> i) & 1]));
    assert.equal(value(m, 22, inputs), value(mod, 22, inputs), `en, inputs ${v}`);
    assert.equal(value(m, 23, inputs), value(mod, 23, inputs), `d, inputs ${v}`);
  }
  // only ends with no shallower form: nothing (a LUT of level 1; an end that is no LUT's, an input)
  assert.equal(resynthCritical(json, 'spi', () => [{ cell: 'ff', port: 'D' }]), null);
  assert.equal(shallower(mod, 20, netlistLevels(mod)), null);
  assert.equal(resynthCritical(json, 'spi', () => [{ cell: 'ff', port: 'C' }]), null);
  // a round per critical path, RESYNTH_RULE.rounds at most
  assert.deepEqual(RESYNTH_RULE, { rounds: 16, leaves: 8, candidates: 10, treeLeaves: 12, wideLeaves: 7, descend: 40, descendGain: 0.03 });
});

// #652: an end with no shallower form, the latest LUT below it with one (the T80's ALU result after its adders, the
// decode before its register file: the ends are wide functions, the LUTs on the way to them narrower). spi's enable (level
// 3, h(g(A), S)) under an end LUT `top` of the enable and three LUTs of level 2 (w0-w2: 16 more leaves, no form for top);
// the descent makes the enable level 2, and top with it
function descentNetlist() {
  const lut = (ins, f, out) => ({ type: `LUT${ins.length}`, parameters: { INIT: Array.from({ length: 1 << ins.length }, (_, m) => +!!f(ins.map((_, i) => (m >> i) & 1))).reverse().join('') },
    port_directions: { ...Object.fromEntries(ins.map((_, i) => [`I${i}`, 'input'])), O: 'output' }, connections: { ...Object.fromEntries(ins.map((b, i) => [`I${i}`, [b]])), O: [out] } });
  const IN = Array.from({ length: 32 }, (_, i) => i + 2);
  const [sc, sp, last, busy, vld, cs] = IN;
  const T = [0, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 0, 1].reverse();   // top's table (no decomposition of top found)
  const cells = {
    rx: lut([sc, sp, last], ([a, b, c]) => a & !b & c, 100), load: lut([busy, cs, 100, vld], ([b, c, r, v]) => v & ((c & !b) | r), 101),
    en: lut([101, sp, sc, cs], ([l, p, q, c]) => l | (p & !q & !c), 102),
  };
  let o = 110;
  const w = [];
  for (let k = 0; k < 3; k++) {
    const a = [0, 1].map(j => { cells[`p${k}${j}`] = lut([IN[8 + 8 * k + 4 * j], IN[9 + 8 * k + 4 * j]], ([u, v]) => u ^ v, o); return o++; });
    cells[`w${k}`] = lut([a[0], a[1], IN[10 + 8 * k], IN[11 + 8 * k]], ([u, v, x, y]) => (u & v) | (x ^ y), o);
    w.push(o++);
  }
  cells.top = lut([102, ...w], x => T[x[0] | (x[1] << 1) | (x[2] << 2) | (x[3] << 3)], 120);
  const ff = (d, q) => ({ type: 'FDRE', parameters: {}, port_directions: { C: 'input', CE: 'input', D: 'input', R: 'input', Q: 'output' }, connections: { C: [1], CE: ['1'], D: [d], R: ['0'], Q: [q] } });
  cells.ff = ff(120, 130);
  // (the leaves registers' outputs, as the paths from flip-flop to flip-flop the estimate times)
  for (const b of IN) cells[`r${b}`] = ff('0', b);
  return { inputs: IN, json: { modules: { m: { attributes: { top: '1' }, ports: { clk: { direction: 'input', bits: [1] } }, cells, netnames: {} } } } };
}

test('#652 an end with no shallower form: the latest LUT below it made shallower (RESYNTH_RULE.descend), the end one level shallower with it; the same function on every input tried', () => {
  const { inputs, json } = descentNetlist();
  const mod = json.modules.m;
  const lv = netlistLevels(mod);
  assert.deepEqual([102, 120].map(lv.level), [3, 4]);
  assert.equal(shallower(mod, 120, lv), null, 'no shallower form of the end');
  // (the ends with their delays, as the open synthesis gives them: the descent's rounds kept when the path gets shorter)
  const ends = x => { const { worst, ends: e } = pathEnds(x, 'm'); return e.filter(z => z.ns >= worst - 1e-9); };
  assert.deepEqual(ends(json).map(e => `${e.cell}.${e.port}`), ['ff.D']);
  // without the descent: nothing (as before, #914); nor with ends without their delays
  assert.equal(resynthCritical(json, 'm', () => [{ cell: 'ff', port: 'D' }]), null);
  assert.equal(resynthCritical(json, 'm', ends, { ...RESYNTH_RULE, descend: 0 }), null);
  const r = resynthCritical(json, 'm', ends);
  assert.ok(r);
  assert.deepEqual([r.rounds, r.luts], [1, 1]);
  // kept for a critical path RESYNTH_RULE.descendGain (3 %) shorter at least: not for one 25 % shorter (here about 15 %)
  assert.equal(resynthCritical(json, 'm', ends, { ...RESYNTH_RULE, descendGain: 0.25 }), null);
  const m = r.json.modules.m;
  const after = netlistLevels(m);
  assert.deepEqual([102, 120].map(after.level), [2, 3], 'the enable and the end one level shallower');
  // the end's LUT and the flip-flop as they were, the enable's output (its readers) kept; LUT4s at most
  assert.deepEqual(m.cells.top, mod.cells.top);
  assert.deepEqual(m.cells.ff.connections.D, [120]);
  assert.ok(criticalDelay(r.json, 'm') < criticalDelay(json, 'm') - 0.5, 'the estimate of its critical path a LUT shorter');
  assert.ok(Object.values(m.cells).every(c => !/^LUT/.test(c.type) || +c.type[3] <= 4));
  // the same functions (the end and the enable) on 4096 inputs (random, fixed)
  let s = 652;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x80000000; };
  for (let k = 0; k < 4096; k++) {
    const x = new Map(inputs.map(b => [b, +(rnd() < 0.5)]));
    assert.equal(value(m, 120, x), value(mod, 120, x), `end, input ${k}`);
    assert.equal(value(m, 102, x), value(mod, 102, x), `enable, input ${k}`);
  }
  // the descent stops below level 3 (spi's D: its latest LUT input, load, is level 2)
  assert.equal(resynthCritical(spiNetlist().json, 'spi', () => [{ cell: 'ff', port: 'D' }]), null);
});

// a function of 7 inputs with no disjoint decomposition (vtr-stereovision3's I2C clock line: a 128-entry case of its 7-bit
// state, #652), as a deep netlist: its 8 cofactors on a4..a6 (level 1), then LUT3 multiplexers on a4, a5, a6 (levels
// 2, 3, 4); n of the inputs (5 to 7) used, the others left out
function wideNetlist(F, n) {
  const lut = (ins, f, out) => ({ type: `LUT${ins.length}`, parameters: { INIT: Array.from({ length: 1 << ins.length }, (_, m) => +!!f(ins.map((_, i) => (m >> i) & 1))).reverse().join('') },
    port_directions: { ...Object.fromEntries(ins.map((_, i) => [`I${i}`, 'input'])), O: 'output' }, connections: { ...Object.fromEntries(ins.map((b, i) => [`I${i}`, [b]])), O: [out] } });
  const a = Array.from({ length: n }, (_, i) => i + 2);
  const cells = {}, k = n - 4;
  let next = 40, level = [];
  for (let v = 0; v < 1 << k; v++) {
    const o = next++;
    cells[`c${v}`] = lut(a.slice(0, 4), x => F[x.reduce((m, b, i) => m | (b << i), 0) | (v << 4)], o);
    level.push(o);
  }
  for (let j = 0; j < k; j++) {
    level = Array.from({ length: level.length / 2 }, (_, i) => {
      const o = next++;
      cells[`m${j}_${i}`] = lut([level[2 * i], level[2 * i + 1], a[4 + j]], ([x0, x1, s]) => (s ? x1 : x0), o);
      return o;
    });
  }
  const root = level[0];
  cells.ff = { type: 'FDRE', parameters: {}, port_directions: { C: 'input', CE: 'input', D: 'input', R: 'input', Q: 'output' }, connections: { C: [30], CE: ['1'], D: [root], R: ['0'], Q: [31] } };
  const ports = { ...Object.fromEntries(a.map((b, i) => [`a${i}`, { direction: 'input', bits: [b] }])), clk: { direction: 'input', bits: [30] }, q: { direction: 'output', bits: [31] } };
  return { a, root, json: { modules: { w: { attributes: { top: '1' }, ports, cells, netnames: Object.fromEntries(Object.entries(ports).map(([nm, p]) => [nm, { bits: p.bits }])) } } } };
}

// a LUT's inputs its table does not depend on (ISE refuses a pin the LUT's equation leaves out, its net still reaching it:
// "PhysDesignRules:1709 Incomplete connectivity")
function unusedPins(mod) {
  const out = [];
  for (const [nm, c] of Object.entries(mod.cells)) {
    if (!/^LUT[1-4]$/.test(c.type)) continue;
    const k = +c.type[3], init = c.parameters.INIT, t = Array.from({ length: 1 << k }, (_, i) => +init[init.length - 1 - i]);
    for (let j = 0; j < k; j++) if (!t.some((x, i) => !((i >> j) & 1) && x !== t[i | (1 << j)])) out.push(`${nm}.I${j}`);
  }
  return out;
}

test('#652 a function of 6 or 7 inputs with no decomposition: LUT4s into MUXF5, MUXF6 and MUXF7 (one LUT level and the slice\'s multiplexers, as XST), its own cells, the same function on every input', () => {
  for (const n of [7, 6]) {
    let F;
    // a function of all n inputs with no form of one or two LUTs nor a tree (a random one: retried until so)
    for (let tries = 0; ; tries++) {
      F = Uint8Array.from({ length: 1 << n }, () => +(rng() < 0.5));
      const { json, root } = wideNetlist(F, n);
      const mod = json.modules.w;
      if (!shallower(mod, root, netlistLevels(mod), { ...RESYNTH_RULE, wideLeaves: 0 })) break;
      assert.ok(tries < 50);
    }
    const { a, root, json } = wideNetlist(F, n);
    const mod = json.modules.w;
    const lv = netlistLevels(mod);
    assert.equal(lv.level(root), n - 3, `n ${n}`);
    const ch = shallower(mod, root, lv);
    assert.ok(ch?.wide, `n ${n}: ${JSON.stringify(ch)}`);
    const r = resynthCritical(json, 'w', () => [{ cell: 'ff', port: 'D' }]);
    assert.ok(r, `n ${n}`);
    const m = r.json.modules.w;
    const k = n - 4, count = t => Object.values(m.cells).filter(c => c.type === t).length;
    // 2^k LUT4s, 2^(k-1) MUXF5, … one multiplexer last, driving the root (the flip-flop's D kept)
    assert.deepEqual([count('LUT4'), count('MUXF5'), count('MUXF6'), count('MUXF7')], [1 << k, 1 << (k - 1), k >= 2 ? 1 << (k - 2) : 0, k >= 3 ? 1 : 0], `n ${n}`);
    assert.equal(Object.values(m.cells).filter(c => /^LUT/.test(c.type)).length, 1 << k, `n ${n}: the old LUTs removed`);
    assert.deepEqual(m.cells.ff.connections.D, [root]);
    assert.equal(m.cells[Object.keys(m.cells).find(c => m.cells[c].connections.O?.[0] === root)].type, `MUXF${4 + k}`, `n ${n}`);
    assert.equal(netlistLevels(m).level(root), 2, `n ${n}: a LUT and a MUXF5 (MUXF6 and MUXF7 not a level)`);
    // a MUXF5's inputs are LUTs only it reads (its slice's F and G); a MUXF6's and a MUXF7's the multiplexers below
    const readers = b => Object.values(m.cells).filter(c => Object.entries(c.connections).some(([p, bits]) => c.port_directions[p] === 'input' && bits.includes(b))).length;
    for (const c of Object.values(m.cells).filter(x => /^MUXF/.test(x.type))) {
      for (const p of ['I0', 'I1']) {
        const d = Object.values(m.cells).find(x => x.connections.O?.[0] === c.connections[p][0]);
        assert.equal(d.type, c.type === 'MUXF5' ? 'LUT4' : `MUXF${+c.type[4] - 1}`);
        assert.equal(readers(c.connections[p][0]), 1);
      }
    }
    for (let v = 0; v < 1 << n; v++) {
      const inputs = new Map(a.map((b, i) => [b, (v >> i) & 1]));
      assert.equal(value(m, root, inputs), F[v], `n ${n}, inputs ${v}`);
    }
    assert.deepEqual(unusedPins(m), [], `n ${n}`);
    // without it (wideLeaves 0): nothing changed
    assert.equal(resynthCritical(json, 'w', () => [{ cell: 'ff', port: 'D' }], { ...RESYNTH_RULE, wideLeaves: 0 }), null);
  }
  // 5 inputs: its 2 levels are the wide form's (a LUT and a MUXF5): nothing to gain
  {
    const F = Uint8Array.from({ length: 32 }, () => +(rng() < 0.5));
    const { root, json } = wideNetlist(F, 5);
    const mod = json.modules.w;
    assert.equal(netlistLevels(mod).level(root), 2);
    assert.equal(shallower(mod, root, netlistLevels(mod)), null);
  }
});

test('#652 the same LUT made for several ends is one LUT: two inverters of one LUT (as Yosys\'s extractinv makes them) on two critical ends', () => {
  // x, y, z inputs; a = x & y (level 1), b = a | z (level 2), n1 = ~b and n2 = ~b (level 3) into two flip-flops' D
  const lut = (ins, f, out) => ({ type: `LUT${ins.length}`, parameters: { INIT: Array.from({ length: 1 << ins.length }, (_, m) => +!!f(ins.map((_, i) => (m >> i) & 1))).reverse().join('') },
    port_directions: { ...Object.fromEntries(ins.map((_, i) => [`I${i}`, 'input'])), O: 'output' }, connections: { ...Object.fromEntries(ins.map((b, i) => [`I${i}`, [b]])), O: [out] } });
  const inv = (i, out) => ({ type: 'INV', parameters: {}, port_directions: { I: 'input', O: 'output' }, connections: { I: [i], O: [out] } });
  const ff = (d, q) => ({ type: 'FDRE', parameters: {}, port_directions: { C: 'input', CE: 'input', D: 'input', R: 'input', Q: 'output' }, connections: { C: [5], CE: ['1'], D: [d], R: ['0'], Q: [q] } });
  const json = { modules: { m: { attributes: { top: '1' },
    ports: { x: { direction: 'input', bits: [2] }, y: { direction: 'input', bits: [3] }, z: { direction: 'input', bits: [4] }, clk: { direction: 'input', bits: [5] }, q: { direction: 'output', bits: [30, 31] } },
    cells: { a: lut([2, 3], ([x, y]) => x & y, 10), b: lut([10, 4], ([a, z]) => a | z, 11), n1: inv(11, 12), n2: inv(11, 13), f1: ff(12, 30), f2: ff(13, 31) },
    netnames: { x: { bits: [2] }, y: { bits: [3] }, z: { bits: [4] }, clk: { bits: [5] }, q: { bits: [30, 31] }, a: { bits: [10] }, b: { bits: [11] }, n1: { bits: [12] }, n2: { bits: [13] } } } } };
  const r = resynthCritical(json, 'm', () => [{ cell: 'f1', port: 'D' }, { cell: 'f2', port: 'D' }]);
  // round 1: one LUT of a and z for both ends (the second end's inverter moved to the first's, b no longer read); round 2:
  // that LUT, now the one end, one LUT3 of x, y and z (a no longer read either)
  assert.deepEqual([r.rounds, r.luts], [2, 3]);
  const m = r.json.modules.m;
  assert.deepEqual(m.cells.f1.connections.D, m.cells.f2.connections.D);
  assert.deepEqual(Object.keys(m.cells).filter(n => /^(LUT|INV)/.test(m.cells[n].type)), ['n1']);
  assert.deepEqual([m.cells.n1.type, netlistLevels(m).level(m.cells.f1.connections.D[0])], ['LUT3', 1]);
  for (let v = 0; v < 8; v++) {
    const inputs = new Map([[2, v & 1], [3, (v >> 1) & 1], [4, (v >> 2) & 1]]);
    assert.equal(value(m, m.cells.f2.connections.D[0], inputs), +!((v & 1 & (v >> 1)) | (v >> 2)), `inputs ${v}`);
  }
  // the netlist names: n2's net now the same bit as n1's
  assert.deepEqual(m.netnames.n2.bits, m.netnames.n1.bits);
});

// iwls05-sasc's receive FIFO (#652): its write enable we (level 2) of the pointers' equality (level 1), and the pointers
// again through a LUT of level 2, into the full flag's D (level 3); the LUTs as Yosys and ABC map them (their INITs)
const FIFO = ['gb', 'din', 'rp0', 'rp1', 'wp0', 'wp1', 'vr', 'v'];
function fifoNetlist() {
  const bit = Object.fromEntries(FIFO.map((n, i) => [n, i + 2]));
  const lut = (ins, init, out) => ({ type: `LUT${ins.length}`, parameters: { INIT: init }, port_directions: { ...Object.fromEntries(ins.map((_, i) => [`I${i}`, 'input'])), O: 'output' },
    connections: { ...Object.fromEntries(ins.map((b, i) => [`I${i}`, [b]])), O: [out] } });
  const [eq, we, inc, nx, d] = [20, 21, 22, 23, 24];
  const cells = {
    eq: lut([bit.rp1, bit.wp1, bit.rp0, bit.wp0], '1001000000001001', eq),
    we: lut([bit.gb, eq, bit.vr, bit.v], '0000011100000000', we),
    inc: lut([bit.wp1, bit.wp0], '0110', inc),
    nx: lut([inc, bit.rp1, bit.rp0, bit.wp0], '0000100110010000', nx),
    d: lut([bit.gb, bit.din, we, nx], '1111001000100010', d),
    ff: { type: 'FDRE', parameters: {}, port_directions: { C: 'input', CE: 'input', D: 'input', R: 'input', Q: 'output' }, connections: { C: [bit.din], CE: ['1'], D: [d], R: ['0'], Q: [30] } },
  };
  const ports = { ...Object.fromEntries(FIFO.map(n => [n, { direction: 'input', bits: [bit[n]] }])), q: { direction: 'output', bits: [30, we] } };
  const netnames = { ...Object.fromEntries(Object.entries(ports).map(([n, p]) => [n, { bits: p.bits }])), eq: { bits: [eq] }, we: { bits: [we] }, inc: { bits: [inc] }, nx: { bits: [nx] }, d: { bits: [d] } };
  return { bit, json: { modules: { fifo: { attributes: { top: '1' }, ports, cells, netnames } } } };
}

test('#652 a cone that converges again (iwls05-sasc\'s FIFO): no LUT h or h(g(A), S) of level 2, a tree of LUT4s is; the same function on every input, the readers of the old LUTs kept', () => {
  const { bit, json } = fifoNetlist();
  const mod = json.modules.fifo;
  const lv = netlistLevels(mod);
  assert.deepEqual([20, 21, 22, 23, 24].map(lv.level), [1, 2, 1, 2, 3]);
  // the forms of one or two LUTs: none (without the tree)
  assert.equal(shallower(mod, 24, lv, { ...RESYNTH_RULE, treeLeaves: 0 }), null);
  assert.equal(resynthCritical(json, 'fifo', () => [{ cell: 'ff', port: 'D' }], { ...RESYNTH_RULE, treeLeaves: 0 }), null);
  // the tree: its LUTs of 4 inputs at most, its last the root's, level 2
  const ch = shallower(mod, 24, lv);
  assert.ok(ch?.tree, JSON.stringify(ch));
  assert.ok(ch.tree.every(l => l.inputs.length >= 2 && l.inputs.length <= 4 && l.table.length === 1 << l.inputs.length));
  const r = resynthCritical(json, 'fifo', () => [{ cell: 'ff', port: 'D' }]);
  assert.ok(r);
  const m = r.json.modules.fifo;
  assert.equal(r.rounds, 1);
  assert.equal(netlistLevels(m).level(24), 2, 'the full flag\'s D one level shallower');
  assert.deepEqual(m.cells.ff.connections.D, [24]);
  // we is a port's bit, so its LUT (and the equality it reads) stays; the tree's g of wp1 ^ wp0 is inc, read instead of
  // made again; nx, read by the old root only, is removed: 5 LUTs -> 6
  assert.ok(m.cells.we && m.cells.eq && !m.cells.nx);
  assert.ok(Object.values(m.cells.d.connections).some(b => b[0] === 22), 'inc read by the new root');
  assert.equal(Object.values(m.cells).filter(c => /^LUT/.test(c.type)).length, 6);
  assert.ok(Object.values(m.cells).every(c => !/^LUT/.test(c.type) || +c.type[3] <= 4));
  for (let v = 0; v < 1 << FIFO.length; v++) {
    const inputs = new Map(FIFO.map((n, i) => [bit[n], (v >> i) & 1]));
    assert.equal(value(m, 24, inputs), value(mod, 24, inputs), `d, inputs ${v}`);
    assert.equal(value(m, 21, inputs), value(mod, 21, inputs), `we, inputs ${v}`);
  }
  // a cone of more leaves than RESYNTH_RULE.treeLeaves: no tree
  assert.equal(shallower(mod, 24, lv, { ...RESYNTH_RULE, treeLeaves: 7 }), null);
});

// the same shift register as a design: its registered inputs, the enable and the load as spi-fpga-slave writes them
const SHIFT_VHDL = `library ieee; use ieee.std_logic_1164.all;
entity shift is port (clk, cs, sclk, last, busy, vld, mosi : in std_logic; din : in std_logic_vector(7 downto 0); q : out std_logic_vector(7 downto 0)); end shift;
architecture rtl of shift is
  signal rcs, rsclk, rspi, rlast, rbusy, rvld, rmosi : std_logic := '0';
  signal rdin, sh : std_logic_vector(7 downto 0) := (others => '0');
  signal rx, load, en : std_logic;
begin
  rx <= rsclk and not rspi and rlast;
  load <= rvld and ((rcs and not rbusy) or rx);
  en <= load or (rspi and not rsclk and not rcs);
  process (clk) begin
    if rising_edge(clk) then
      rcs <= cs; rsclk <= sclk; rspi <= rsclk; rlast <= last; rbusy <= busy; rvld <= vld; rmosi <= mosi; rdin <= din;
      if en = '1' then
        if load = '1' then sh <= rdin; else sh <= sh(6 downto 0) & rmosi; end if;
      end if;
    end if;
  end process;
  q <= sh;
end rtl;
`;
const SHIFT_VERILOG = `module shift(input clk, cs, sclk, last, busy, vld, mosi, input [7:0] din, output [7:0] q);
  reg rcs = 0, rsclk = 0, rspi = 0, rlast = 0, rbusy = 0, rvld = 0, rmosi = 0;
  reg [7:0] rdin = 0, sh = 0;
  wire rx = rsclk & ~rspi & rlast;
  wire load = rvld & ((rcs & ~rbusy) | rx);
  wire en = load | (rspi & ~rsclk & ~rcs);
  always @(posedge clk) begin
    rcs <= cs; rsclk <= sclk; rspi <= rsclk; rlast <= last; rbusy <= busy; rvld <= vld; rmosi <= mosi; rdin <= din;
    if (en) sh <= load ? rdin : {sh[6:0], rmosi};
  end
  assign q = sh;
endmodule
`;

test('#652 the open synthesis: the enable on 2 levels of LUTs (the speedup\'s 2 levels refused, 20 LUTs), kept by DEPTH_RULE at both efforts, in VHDL and in Verilog; the netlist simulates as the design, no warning', { timeout: 300000 }, async () => {
  const close = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);
  for (const [lang, text] of [['vhdl', SHIFT_VHDL], ['verilog', SHIFT_VERILOG]]) {
    const des = elaborate(compile([{ path: lang === 'vhdl' ? 'd.vhd' : 'd.v', lang, text }]), 'shift');
    for (const effort of lang === 'vhdl' ? ['normal', 'high'] : ['normal']) {
      const what = `${lang} ${effort}`;
      const r = await synthesizeOpen(des, { run: yosysNode, effort });
      const json = r.files['shift.json'];
      // (it was 0.59 + 3 LUTs and their connections + the CE's 0.55: 5.04 ns; now the D logic's 3 levels, into D: 4.17)
      close(criticalDelay(json, 'shift'), 0.59 + 0.45 + 0.70 + 0.45 + 0.70 + 0.45 + 0.70 + 0.13, what);
      assert.equal(pathEnds(json, 'shift').ends.filter(e => e.port === 'CE').every(e => e.ns < 4), true, `${what}: the enable's paths 2 levels`);
      assert.deepEqual({ ...r.depth.resynth, ns: +r.depth.resynth.ns.toFixed(2) }, { rounds: 1, changed: 1, ns: 4.17, luts: 12, slices: 12, kept: true }, what);
      assert.deepEqual([r.depth.speed.kept, r.depth.speed.luts], [false, 20], what);
      assert.deepEqual([r.util.luts, r.util.flipFlops, logicLevels(json, 'shift')], [12, 23, 3], what);
      // the Verilog netlist and the statistics are the new netlist's
      assert.equal(r.files['shift_yosys.v'].match(/^ {2}LUT[1-4] #/gm).length, 12, what);
      assert.deepEqual(['LUT2', 'LUT3', 'LUT4'].map(t => +(new RegExp(`(\\d+) +${t}\\b`).exec(r.files['shift_stat.txt'])?.[1] ?? 0)), [0, 9, 3], what);
      assert.deepEqual(r.warnings, [], what);
      const cmp = compareNetlist(des, r, { name: `resynth-${lang}-${effort}`, seed: 'shift', sim: { cycles: 600 } });
      assert.equal(cmp.status, 'pass', cmp.report || cmp.reason);
    }
  }
  // resynth: false, the netlist as before (the usual one: 5.04 ns, 11 LUTs)
  const des = elaborate(compile([{ path: 'd.vhd', lang: 'vhdl', text: SHIFT_VHDL }]), 'shift');
  const before = await synthesizeOpen(des, { run: yosysNode, effort: 'normal', resynth: false });
  close(criticalDelay(before.files['shift.json'], 'shift'), 0.59 + 0.45 + 0.70 + 0.45 + 0.70 + 0.45 + 0.70 + 0.45 + 0.55, 'before');
  assert.deepEqual([before.util.luts, before.depth.resynth], [11, undefined]);
});

// an I2C sequencer as vtr-stereovision3 writes it (#652): a 7-bit state counted while not stopped, restarted by start;
// the clock line, the stop and the data line a 128-entry case of it (the data line some states' address bit)
const iicRng = (s => () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x80000000; })(7);
const scl = Array.from({ length: 128 }, () => +(iicRng() < 0.5));
const stop = Array.from({ length: 128 }, (_, i) => +(i === 127 || iicRng() < 0.08));
const sda = Array.from({ length: 128 }, () => Math.floor(iicRng() * 10));
const sdaV = i => (sda[i] < 8 ? `addr[${sda[i]}]` : `1'b${sda[i] - 8}`), sdaH = i => (sda[i] < 8 ? `addr(${sda[i]})` : `'${sda[i] - 8}'`);
const IIC_VERILOG = `module iic(input clk, input start, input [7:0] a, output reg scl = 1'b0, output reg sda = 1'b0);
  reg [6:0] st = 7'd0;
  reg stop = 1'b0;
  reg [7:0] addr = 8'd0;
  always @(posedge clk) begin
    addr <= a;
    if (!stop) st <= st + 7'd1; else if (start) st <= 7'd1;
    case (st)
${scl.map((b, i) => `      7'd${i}: begin scl <= 1'b${b}; stop <= 1'b${stop[i]}; sda <= ${sdaV(i)}; end`).join('\n')}
    endcase
  end
endmodule
`;
const IIC_VHDL = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity iic is port (clk, start : in std_logic; a : in std_logic_vector(7 downto 0); scl, sda : out std_logic); end iic;
architecture rtl of iic is
  signal st : unsigned(6 downto 0) := (others => '0');
  signal stop, rscl, rsda : std_logic := '0';
  signal addr : std_logic_vector(7 downto 0) := (others => '0');
begin
  process (clk) begin
    if rising_edge(clk) then
      addr <= a;
      if stop = '0' then st <= st + 1; elsif start = '1' then st <= to_unsigned(1, 7); end if;
      case to_integer(st) is
${scl.map((b, i) => `        when ${i} => rscl <= '${b}'; stop <= '${stop[i]}'; rsda <= ${sdaH(i)};`).join('\n')}
        when others => null;
      end case;
    end if;
  end process;
  scl <= rscl; sda <= rsda;
end rtl;
`;

test('#652 the open synthesis of an I2C sequencer (vtr-stereovision3\'s): its clock line and stop as LUT4s into the wide multiplexers, the data line\'s end left; fewer LUTs, kept by DEPTH_RULE at both efforts, in VHDL and in Verilog; the netlist simulates as the design, no warning', { timeout: 600000 }, async () => {
  for (const [lang, text] of [['vhdl', IIC_VHDL], ['verilog', IIC_VERILOG]]) {
    const des = elaborate(compile([{ path: lang === 'vhdl' ? 'd.vhd' : 'd.v', lang, text }]), 'iic');
    for (const effort of ['normal', 'high']) {
      const what = `${lang} ${effort}`;
      const r = await synthesizeOpen(des, { run: yosysNode, effort });
      const json = r.files['iic.json'];
      // (main: the round undone, its data line's end having no shallower form: 161 LUTs, no multiplexer)
      assert.deepEqual({ ...r.depth.resynth, ns: +r.depth.resynth.ns.toFixed(2) }, { rounds: 1, changed: 2, ns: 7.62, luts: 126, slices: 67, kept: true }, what);
      assert.deepEqual([r.util.luts, r.util.muxes, r.util.flipFlops, logicLevels(json, 'iic')], [126, 14, 18, 6], what);
      assert.equal(+criticalDelay(json, 'iic').toFixed(2), 7.62, what);
      // the multiplexers: MUXF5 … MUXF7 of the clock line's and the stop's trees (two LUT4s for each MUXF5)
      const cells = Object.values((typeof json === 'string' ? JSON.parse(json) : json).modules.iic.cells);
      const n = t => cells.filter(c => c.type === t).length;
      assert.deepEqual([n('MUXF5'), n('MUXF6'), n('MUXF7')], [8, 4, 2], what);
      assert.deepEqual(r.warnings, [], what);
      const cmp = compareNetlist(des, r, { name: `resynth-wide-${lang}-${effort}`, seed: 'iic', sim: { cycles: 600 } });
      assert.equal(cmp.status, 'pass', cmp.report || cmp.reason);
    }
  }
});

test('#652 the wide form\'s cofactors: a LUT of the inputs each depends on only (ISE\'s incomplete connectivity otherwise), never a LUT without inputs', () => {
  // F over a0..a5: for a0 = a1 = 1 the parity of a2..a4 (not a5); else a random function of all six. The selects of the
  // inputs of one level are a0 and a1: that cofactor's LUT has 3 inputs, not 4 (the 4th left out of its equation)
  const g = Uint8Array.from({ length: 64 }, () => +(rng() < 0.5));
  const F = Uint8Array.from({ length: 64 }, (_, m) => ((m & 3) === 3 ? ((m >> 2) ^ (m >> 3) ^ (m >> 4)) & 1 : g[m]));
  const { a, root, json } = wideNetlist(F, 6);
  const r = resynthCritical(json, 'w', () => [{ cell: 'ff', port: 'D' }]);
  assert.ok(r);
  const m = r.json.modules.w;
  assert.deepEqual(unusedPins(m), []);
  assert.ok(Object.values(m.cells).some(c => /^MUXF/.test(c.type)));
  assert.ok(Object.values(m.cells).some(c => c.type === 'LUT3'), 'the cofactor of 3 inputs a LUT3');
  for (let v = 0; v < 64; v++) assert.equal(value(m, root, new Map(a.map((b, i) => [b, (v >> i) & 1]))), F[v], `inputs ${v}`);
  // a cofactor constant whatever the selects: F = a5 ? 0 : (a 5-input function): no wide form (a MUXF5 reads two LUTs)
  const Z = Uint8Array.from({ length: 64 }, (_, m) => ((m >> 5) & 1 ? 0 : g[m]));
  const z = wideNetlist(Z, 6);
  const ch = shallower(z.json.modules.w, z.root, netlistLevels(z.json.modules.w));
  assert.ok(!ch?.wide || ch.wide.luts.every(l => l.inputs.length > 0), JSON.stringify(ch?.wide));
});

test('#652 the wide form on a cone of many leaves (the traffic example\'s): declined at once, no truth table of 2^leaves rows', () => {
  // a root of level 3 over 24 inputs (the old limit was 28 leaves: a table of 2^24 rows, minutes): LUT4s of 4 inputs
  // (6), LUT3s of 3 of those (2), a LUT2 of those (the root)
  const lut = (ins, out) => ({ type: `LUT${ins.length}`, parameters: { INIT: '0110100110010110'.slice(-(1 << ins.length)) }, port_directions: { ...Object.fromEntries(ins.map((_, i) => [`I${i}`, 'input'])), O: 'output' },
    connections: { ...Object.fromEntries(ins.map((b, i) => [`I${i}`, [b]])), O: [out] } });
  const ins = Array.from({ length: 24 }, (_, i) => i + 2), cells = {};
  const l1 = Array.from({ length: 6 }, (_, k) => { cells[`a${k}`] = lut(ins.slice(4 * k, 4 * k + 4), 100 + k); return 100 + k; });
  const l2 = Array.from({ length: 2 }, (_, k) => { cells[`b${k}`] = lut(l1.slice(3 * k, 3 * k + 3), 200 + k); return 200 + k; });
  cells.root = lut(l2, 300);
  const mod = { cells, ports: { q: { direction: 'output', bits: [300] } }, netnames: {} };
  const t0 = Date.now();
  assert.equal(shallower(mod, 300, netlistLevels(mod)), null);
  assert.ok(Date.now() - t0 < 2000, `${Date.now() - t0} ms`);
});
