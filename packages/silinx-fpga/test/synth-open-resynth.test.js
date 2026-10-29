// The open synthesis's last depth candidate, the critical LUTs made one level shallower (packages/silinx-fpga/src/synth-open-resynth.js,
// #405: out of packages/silinx-fpga/src/synth-open-depth.js's withDepth): mounted alone on a netlist written by hand (spi-fpga-slave's
// shift register enable, as test/lut-resynth.test.js), through Yosys: kept by DEPTH_RULE, the same functions on every
// input; left out without speed or resynth, or past SPEED_RULE.maxLuts; a run that fails: its warning, the netlist kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resynthStage } from '../src/synth-open-resynth.js';
import { cellCounts, utilization, SPEED_RULE } from '../src/synth-open.js';
import { netlistLevels } from '../src/lut-resynth.js';
import { yosysNode } from '../src/synth-open-node.js';

// en = load | (sp & ~sc & ~cs), load = vld & ((cs & ~busy) | rx), rx = sc & ~sp & last: en on 3 levels, on a CE; the
// signals registered (flip-flops of the ports), so that the enable is on a path between flip-flops
const INPUTS = ['sc', 'sp', 'last', 'busy', 'vld', 'cs'];
function spi() {
  const bit = Object.fromEntries(INPUTS.map((n, i) => [n, i + 2])), pin = Object.fromEntries(INPUTS.map((n, i) => [n, i + 40]));
  const ff = (d, q, ce = '1') => ({ type: 'FDRE', parameters: {}, port_directions: { C: 'input', CE: 'input', D: 'input', R: 'input', Q: 'output' }, connections: { C: [50], CE: [ce], D: [d], R: ['0'], Q: [q] } });
  const lut = (ins, f, out) => ({ type: `LUT${ins.length}`, parameters: { INIT: Array.from({ length: 1 << ins.length }, (_, m) => +!!f(ins.map((_, i) => (m >> i) & 1))).reverse().join('') },
    port_directions: { ...Object.fromEntries(ins.map((_, i) => [`I${i}`, 'input'])), O: 'output' }, connections: { ...Object.fromEntries(ins.map((b, i) => [`I${i}`, [b]])), O: [out] } });
  const cells = {
    lut_rx: lut([bit.sc, bit.sp, bit.last], ([a, b, c]) => a & !b & c, 20),
    lut_load: lut([bit.busy, bit.cs, 20, bit.vld], ([b, c, r, v]) => v & ((c & !b) | r), 21),
    lut_en: lut([21, bit.sp, bit.sc, bit.cs], ([l, p, s, c]) => l | (p & !s & !c), 22),
    ff: ff(bit.last, 30, 22),
    ...Object.fromEntries(INPUTS.map(n => [`r_${n}`, ff(pin[n], bit[n])])),
  };
  const ports = { ...Object.fromEntries(INPUTS.map(n => [n, { direction: 'input', bits: [pin[n]] }])), clk: { direction: 'input', bits: [50] }, q: { direction: 'output', bits: [30] } };
  const netnames = { ...Object.fromEntries(Object.entries(ports).map(([n, p]) => [n, { bits: p.bits }])), rx: { bits: [20] }, load: { bits: [21] }, en: { bits: [22] } };
  return { bit, json: { creator: 'test', modules: { spi: { attributes: { top: '00000000000000000000000000000001' }, ports, cells, netnames } } } };
}
// the enable's value for the inputs given (by name: the bits of the flip-flops r_<name>, numbered again by Yosys), through
// the netlist's LUTs (the test's own evaluator)
function enable(mod, x) {
  const inputs = new Map(INPUTS.map(n => [mod.cells[`r_${n}`].connections.Q[0], x[n]]));
  const drv = new Map();
  for (const c of Object.values(mod.cells)) for (const [p, bits] of Object.entries(c.connections)) if (c.port_directions[p] === 'output') drv.set(bits[0], c);
  const ev = x => {
    if (typeof x !== 'number') return +(x === '1');
    if (inputs.has(x)) return inputs.get(x);
    const c = drv.get(x), k = +c.type[3], init = String(c.parameters.INIT);
    let i = 0;
    for (let j = 0; j < k; j++) i |= ev(c.connections[`I${j}`][0]) << j;
    return +init[init.length - 1 - i];
  };
  return ev(mod.cells.ff.connections.CE[0]);
}
const state = json => {
  const said = [];
  return { said, st: { chosen: { 'spi.json': JSON.stringify(json) }, cells: cellCounts(json, 'spi'), info: {}, slices: () => 1, sayNew: l => said.push(l) } };
};

test('#405 resynthStage alone: the enable one level shallower, kept by DEPTH_RULE, the same function on every input; no warning', { timeout: 120000 }, async () => {
  const { json } = spi();
  const { said, st } = state(json);
  const r = await resynthStage({ run: yosysNode, speed: true, top: 'spi', withResynth: true }, st);
  assert.deepEqual(said, []);
  assert.equal(st.info.resynth.kept, true);
  assert.equal(st.info.resynth.rounds, 1);
  assert.notEqual(r.chosen, st.chosen);
  assert.deepEqual(r.cells, cellCounts(r.chosen['spi.json'], 'spi'));
  const mod = JSON.parse(r.chosen['spi.json']).modules.spi;
  const ce = mod.cells.ff.connections.CE[0];
  assert.equal(netlistLevels(mod).level(ce), 2, 'the enable on 2 levels of LUTs');
  const before = json.modules.spi;
  for (let v = 0; v < 1 << INPUTS.length; v++) {
    const x = Object.fromEntries(INPUTS.map((n, i) => [n, (v >> i) & 1]));
    const load = x.vld & ((x.cs & !x.busy) | (x.sc & !x.sp & x.last));
    const want = +(load | (x.sp & !x.sc & !x.cs));
    assert.equal(enable(mod, x), want, `inputs ${v}`);
    assert.equal(enable(before, x), want, `inputs ${v}: the netlist given`);
  }
});

test('#405 resynthStage left out: no speed, no resynth, more LUTs than SPEED_RULE.maxLuts, a candidate that failed before; nothing run, the netlist as given', async () => {
  const { json } = spi();
  const never = () => { throw new Error('no run expected'); };
  for (const [ctx, info, cells] of [
    [{ speed: false, withResynth: true }, {}, null],
    [{ speed: true, withResynth: false }, {}, null],
    [{ speed: true, withResynth: true }, { wide: { failed: 'x' } }, null],
    [{ speed: true, withResynth: true }, {}, { ...cellCounts(json, 'spi'), LUT4: SPEED_RULE.maxLuts + 1 }]]) {
    const { said, st } = state(json);
    st.info = info;
    if (cells) st.cells = cells;
    assert.ok(utilization(st.cells).luts > 0);
    const r = await resynthStage({ run: never, top: 'spi', ...ctx }, st);
    assert.equal(r.chosen, st.chosen);
    assert.equal(r.cells, st.cells);
    assert.equal(st.info.resynth, undefined);
    assert.deepEqual(said, []);
  }
});

test('#405 resynthStage: a run that fails, its warning (once), info.resynth.failed, the netlist as given', async () => {
  const { json } = spi();
  const { said, st } = state(json);
  const r = await resynthStage({ run: async () => { throw new Error('Yosys crashed'); }, speed: true, top: 'spi', withResynth: true }, st);
  assert.equal(r.chosen, st.chosen);
  assert.equal(r.cells, st.cells);
  assert.deepEqual(st.info.resynth, { kept: false, failed: 'Yosys crashed' });
  assert.deepEqual(said, ['Warning: the critical path\'s LUTs could not be made shallower (Yosys crashed): the netlist chosen before is kept']);
});
