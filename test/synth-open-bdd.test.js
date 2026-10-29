// The critical path's wide decodes collapsed and mapped again (packages/silinx-fpga/src/synth-open-bdd.js, #1360): on netlists written by
// hand (registered inputs, a chain of LUTs as deep as the HDL may leave a decode, on a flip-flop's D), through Yosys and
// ABC: the candidate found on the critical path, the chain made shallower with the same function on every input, its
// fan-out kept; the limits (leaves, LUTs) and a cone with no shallower form left as it is; a decode behind a carry
// chain and a distributed RAM's address reached through them (the T80's path).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bddRemap, collapseCandidates, BDD_RULE } from '../packages/silinx-fpga/src/synth-open-bdd.js';
import { pathEnds } from '../packages/silinx-fpga/src/synth-open-path.js';
import { netlistLevels } from '../packages/silinx-fpga/src/lut-resynth.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';

// a netlist of n registered inputs x0 … (flip-flops r<i> of ports p<i>), a chain of LUT2s y1 = f(x0, x1), y2 = f(y1, x2) …
// (n - 1 levels) on the D of flip-flop `out`, read by a second LUT (`also`) too; f: (a, b) => bit
function chain(n, f) {
  const x = i => 10 + i, p = i => 100 + i, y = i => 200 + i, CLK = 2;
  const ff = (d, q) => ({ type: 'FDRE', parameters: {}, port_directions: { C: 'input', CE: 'input', D: 'input', R: 'input', Q: 'output' }, connections: { C: [CLK], CE: ['1'], D: [d], R: ['0'], Q: [q] } });
  const lut2 = (a, b, o, g) => ({ type: 'LUT2', parameters: { INIT: [3, 2, 1, 0].map(m => +!!g((m >> 0) & 1, (m >> 1) & 1)).join('') },
    port_directions: { I0: 'input', I1: 'input', O: 'output' }, connections: { I0: [a], I1: [b], O: [o] } });
  const cells = {};
  for (let i = 0; i < n; i++) cells[`r${i}`] = ff(p(i), x(i));
  let last = x(0);
  for (let i = 1; i < n; i++) { cells[`c${i}`] = lut2(last, x(i), y(i), f); last = y(i); }
  cells.out = ff(last, 300);
  cells.also = lut2(last, x(0), 301, (a, b) => a & b);
  cells.out2 = ff(301, 302);
  const ports = { clk: { direction: 'input', bits: [CLK] }, ...Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i}`, { direction: 'input', bits: [p(i)] }])),
    q: { direction: 'output', bits: [300] }, q2: { direction: 'output', bits: [302] } };
  const netnames = Object.fromEntries(Object.entries(ports).map(([k, v]) => [k, { bits: v.bits }]));
  return { modules: { top: { attributes: { top: '00000000000000000000000000000001' }, ports, cells, netnames } } };
}
// a bit's value through the netlist's LUTs, the registered inputs given by flip-flop (the test's own evaluator)
function value(mod, b, x) {
  const drv = new Map();
  for (const c of Object.values(mod.cells)) for (const [p, bits] of Object.entries(c.connections)) if (c.port_directions[p] === 'output') drv.set(bits[0], c);
  const ins = new Map(Object.entries(mod.cells).filter(([n]) => /^r\d+$/.test(n)).map(([n, c]) => [c.connections.Q[0], x[+n.slice(1)]]));
  const ev = q => {
    if (typeof q !== 'number') return +(q === '1');
    if (ins.has(q)) return ins.get(q);
    const c = drv.get(q), k = +c.type[3], init = String(c.parameters.INIT);
    let i = 0;
    for (let j = 0; j < k; j++) i |= ev(c.connections[`I${j}`][0]) << j;
    return +init[init.length - 1 - i];
  };
  return ev(b);
}
const xor = (a, b) => a ^ b, andNot = (a, b) => a & !b;

test('#1360 collapseCandidates: the chain on the critical path, its 8 leaves (the flip-flops) and 7 LUT levels; with fewer leaves allowed, the first signal down the path that has as few', () => {
  const nl = chain(8, xor), mod = nl.modules.top;
  const c = collapseCandidates(mod, pathEnds(nl, 'top'));
  // the critical end: out2, through the chain and `also` (8 levels); the chain alone (out, 7) is not within the margin
  assert.equal(c.length, 1);
  assert.equal(c[0].root, 301);
  assert.deepEqual([c[0].leaves.length, c[0].level, c[0].order.length], [8, 8, 8]);
  const c7 = collapseCandidates(mod, pathEnds(nl, 'top'), { ...BDD_RULE, leaves: 7 });
  assert.deepEqual(c7.map(x => [x.root, x.leaves.length, x.level]), [[mod.cells.c6.connections.O[0], 7, 6]]);
  assert.deepEqual(collapseCandidates(mod, pathEnds(nl, 'top'), { ...BDD_RULE, leaves: 4 }), [], 'c3, 4 leaves, has 3 levels: below minLevel');
});

test('#1360 bddRemap: the 8-input chain on 2 levels of LUT4s, the same function on every input, the flip-flop\'s D and the other reader kept, the estimate shorter', { timeout: 120000 }, async () => {
  for (const f of [xor, andNot]) {
    const nl = chain(8, f), mod = nl.modules.top;
    const r = await bddRemap(nl, 'top', yosysNode);
    assert.ok(r, f.name);
    assert.ok(r.ns[1] < r.ns[0], `${r.ns}`);
    // round 1 the end through `also` (8 levels), round 2 the chain on out's D, the critical one then
    assert.deepEqual([r.rounds, r.cones], [2, 2]);
    const m = r.json.modules.top;
    const d = m.cells.out.connections.D[0];
    assert.equal(d, mod.cells.out.connections.D[0], 'the same signal on the flip-flop\'s D');
    assert.ok(netlistLevels(m).level(d) <= 3, `levels ${netlistLevels(m).level(d)}`);
    assert.ok(Object.values(m.cells).every(c => !/^LUT/.test(c.type) || +c.type[3] <= 4));
    for (let v = 0; v < 256; v++) {
      const x = Array.from({ length: 8 }, (_, i) => (v >> i) & 1);
      assert.equal(value(m, d, x), value(mod, d, x), `${f.name}, inputs ${v}`);
      assert.equal(value(m, 301, x), value(mod, 301, x), `${f.name}, the other reader, inputs ${v}`);
    }
    // the netlist given is not changed
    assert.equal(netlistLevels(mod).level(mod.cells.out.connections.D[0]), 7);
  }
});

test('#1360 bddRemap: nothing when the LUTs would grow past BDD_RULE.growth, or when the cone has no shallower form (a chain of 4 inputs, 3 levels: below minLevel)', { timeout: 120000 }, async () => {
  assert.equal(await bddRemap(chain(8, xor), 'top', yosysNode, { ...BDD_RULE, growth: -1, extraLuts: 0 }), null);
  assert.equal(await bddRemap(chain(4, xor), 'top', yosysNode), null);
  // a run that fails: thrown (the caller's warning)
  await assert.rejects(bddRemap(chain(8, xor), 'top', async () => { throw new Error('Yosys crashed'); }), /Yosys crashed/);
});
