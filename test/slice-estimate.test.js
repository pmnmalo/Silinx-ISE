// The slices of a Spartan-3E netlist as nextpnr packs them, estimated (#2529: packages/silinx-fpga/src/slice-estimate.js,
// the open synthesis's measure of its mappings, sliceCount): its rules on small netlists (the LUTs and flip-flops of a
// control set, the carry chains, the wide multiplexers, the memories), and against the independent reference, nextpnr's
// own packing of real designs (the slices of its routed design, the Design Summary's), within its timing-driven fill's
// 2 % (spartan3e.cc CRIT_SLICES).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sliceEstimate, S3E_CELL } from '../packages/silinx-fpga/src/slice-estimate.js';
import { NEXTPNR_CELL } from '../packages/silinx-fpga/src/open-flow-nextpnr.js';
import { sliceCount } from '../packages/silinx-fpga/src/synth-open.js';
import { runOpenFlow } from '../core/flow-ide.js';
import { orderOpenSteps } from '../packages/silinx-fpga/src/open-steps.js';
import { nextpnrNode } from '../packages/silinx-fpga/src/nextpnr-node.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { device } from './timesim-lib.mjs';
import { example, EXAMPLES } from './examples-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUTS = new Set(['O', 'Q', 'Q15', 'SPO', 'DPO', 'LO']);
// a netlist of cells [type, { pin: wire bit (2 and up) | '0' | '1' }, params]: Yosys's JSON, the top's ports none
const netlist = cells => ({ modules: { t: { attributes: { top: 1 }, ports: {}, netnames: {}, cells: Object.fromEntries(cells.map(([type, pins, parameters = {}], k) => [`c${k}`, {
  type, parameters, connections: Object.fromEntries(Object.entries(pins).map(([p, b]) => [p, [b]])),
  port_directions: Object.fromEntries(Object.keys(pins).map(p => [p, OUTS.has(p) ? 'output' : 'input'])) }])) } } });
const lut = (o, ...ins) => [`LUT${ins.length}`, { ...Object.fromEntries(ins.map((b, k) => [`I${k}`, b])), O: o }];
const fdre = (d, q, { c = 2, ce = '1', r = '0' } = {}) => ['FDRE', { C: c, CE: ce, R: r, D: d, Q: q }];

test('a LUT with the flip-flop it feeds: two to a slice of one control set; flip-flops of two control sets, two slices', () => {
  assert.equal(sliceEstimate(netlist([lut(10, 3), fdre(10, 11), lut(12, 4), fdre(12, 13)]), 't'), 1);
  assert.equal(sliceEstimate(netlist([lut(10, 3), fdre(10, 11), lut(12, 4), fdre(12, 13, { ce: 5 })]), 't'), 2);
  // (a set and a reset on one net: one control set, whether it sets or resets each flip-flop's own; a synchronous and an
  // asynchronous one, two: nextpnr 1.5.1, #3389)
  assert.equal(sliceEstimate(netlist([fdre(3, 11, { r: 5 }), ['FDSE', { C: 2, CE: '1', S: 5, D: 4, Q: 12 }]]), 't'), 1);
  assert.equal(sliceEstimate(netlist([['FDCE', { C: 2, CE: '1', CLR: 5, D: 3, Q: 11 }], ['FDPE', { C: 2, CE: '1', PRE: 5, D: 4, Q: 12 }]]), 't'), 1);
  assert.equal(sliceEstimate(netlist([fdre(3, 11, { r: 5 }), ['FDCE', { C: 2, CE: '1', CLR: 5, D: 4, Q: 12 }]]), 't'), 2);
  // (an inverter on a set / reset or an enable: the slice's SRINV / CEINV, the flip-flops on its input, the inverter gone;
  // one that a LUT reads too stays, a LUT; a flip-flop on the net and one on its inverse, two slices: one CEINV, SRINV,
  // CLKINV a slice, same_mode, #3389)
  const inv = (o, i) => ['INV', { I: i, O: o }];
  assert.equal(sliceEstimate(netlist([inv(20, 5), inv(21, 5), fdre(3, 11, { r: 20 }), fdre(4, 12, { r: 21 })]), 't'), 1);
  assert.equal(sliceEstimate(netlist([inv(20, 5), fdre(3, 11, { ce: 20 }), fdre(4, 12, { ce: 5 })]), 't'), 2);
  assert.equal(sliceEstimate(netlist([inv(20, 5), fdre(3, 11, { r: 20 }), fdre(4, 12, { r: 5 })]), 't'), 2);
  assert.equal(sliceEstimate(netlist([inv(20, 2), fdre(3, 11, { c: 20 }), fdre(4, 12)]), 't'), 2);
  assert.equal(sliceEstimate(netlist([fdre(3, 11, { ce: 5 }), ['FDRE', { C: 2, CE: 5, R: '0', D: 4, Q: 12 }, { IS_CE_INVERTED: '1' }]]), 't'), 2);
  assert.equal(sliceEstimate(netlist([fdre(3, 11), ['FDRE_1', { C: 2, CE: '1', R: '0', D: 4, Q: 12 }]]), 't'), 2);
  assert.equal(sliceEstimate(netlist([inv(20, 5), fdre(3, 11, { r: 20 }), lut(30, 20), lut(31, 6), lut(32, 7)]), 't'), 2);
  // three LUTs alone: two slices; as text, and as bytes
  const three = netlist([lut(10, 3), lut(11, 4), lut(12, 5)]);
  assert.equal(sliceEstimate(JSON.stringify(three), 't'), 2);
  assert.equal(sliceEstimate(new TextEncoder().encode(JSON.stringify(three)), 't'), 2);
  // the open synthesis's measure is the estimate
  assert.equal(sliceCount(JSON.stringify(three), 't'), 2);
});

test('a carry chain: two stages to a slice, its LUTs and its sums\' flip-flops with it; a stage before it for a carry in on BX', () => {
  // four stages from a constant carry in, each sum into a flip-flop: two slices
  const stages = [];
  for (let k = 0; k < 4; k++) {
    const ci = k === 0 ? '0' : 30 + k - 1, s = 20 + k;
    stages.push(lut(s, 3 + k), ['MUXCY', { CI: ci, DI: '0', S: s, O: 30 + k }], ['XORCY', { CI: ci, LI: s, O: 40 + k }], fdre(40 + k, 50 + k));
  }
  assert.equal(sliceEstimate(netlist(stages), 't'), 2);
  // flip-flops alone (their D no LUT's) into the free sides of a chain's slices of their control set: none of the first
  // slice's F side, whose BX brings the constant carry in (ffs_into_chains); three of them, a slice more
  const sums = stages.filter(c => c[0] !== 'FDRE');
  assert.equal(sliceEstimate(netlist([...sums, fdre(60, 61), fdre(62, 63)]), 't'), 2);
  assert.equal(sliceEstimate(netlist([...sums, fdre(60, 61), fdre(62, 63), fdre(64, 65)]), 't'), 2);
  assert.equal(sliceEstimate(netlist([...sums, fdre(60, 61), fdre(62, 63), fdre(64, 65), fdre(66, 67)]), 't'), 3);
  assert.equal(sliceEstimate(netlist([...sums, fdre(60, 61, { ce: 9 }), fdre(62, 63)]), 't'), 2);
  // five: three; the carry out read by an XORCY: a stage more at the end
  const five = [...stages, lut(24, 7), ['MUXCY', { CI: 33, DI: '0', S: 24, O: 34 }], ['XORCY', { CI: 33, LI: 24, O: 44 }]];
  assert.equal(sliceEstimate(netlist(five), 't'), 3);
  assert.equal(sliceEstimate(netlist([...stages, ['XORCY', { CI: 33, LI: '1', O: 45 }]]), 't'), 3);
  // (a sum whose LI is 0 and a stage whose select is 0 pass their carry in, their DI: wires, left out, 1.5.1, #3389; a
  // flip-flop on such a sum alone, into the chain's slice)
  assert.equal(sliceEstimate(netlist([...sums.slice(0, 6), ['XORCY', { CI: 31, LI: '0', O: 45 }], fdre(45, 46)]), 't'), 1);
  const wire = [...sums.slice(0, 6), ['MUXCY', { CI: 31, DI: 8, S: '0', O: 32 }],
    lut(23, 9), ['MUXCY', { CI: 32, DI: '0', S: 23, O: 33 }], lut(24, 10), ['MUXCY', { CI: 33, DI: '0', S: 24, O: 34 }]];
  assert.equal(sliceEstimate(netlist(wire), 't'), 2);
  // the first stage's DI a net its LUT (of four other inputs) does not read: a stage before it brings the carry in
  const di = [['LUT4', { I0: 3, I1: 4, I2: 5, I3: 6, O: 20 }], ['MUXCY', { CI: 9, DI: 8, S: 20, O: 30 }]];
  assert.equal(sliceEstimate(netlist(di), 't'), 1);
  assert.equal(sliceEstimate(netlist([...di, lut(21, 7), ['MUXCY', { CI: 30, DI: '0', S: 21, O: 31 }]]), 't'), 2);
  // a LUT on the selects of two chains' stages whose sums are used: one stage takes a copy of it, no longer reading it,
  // and the other the LUT itself (stage_lut; before #3389 both copies, the LUT a slice of its own)
  const shared = [lut(20, 3, 4), ['MUXCY', { CI: 9, DI: '0', S: 20, O: 30 }], ['XORCY', { CI: 9, LI: 20, O: 40 }], fdre(40, 60),
    ['MUXCY', { CI: 10, DI: '0', S: 20, O: 31 }], ['XORCY', { CI: 10, LI: 20, O: 41 }], fdre(41, 61)];
  assert.equal(sliceEstimate(netlist(shared), 't'), 2);
  assert.equal(sliceEstimate(netlist([...shared, lut(70, 20)]), 't'), 3);
  // a stage whose select is 1 and whose carry in no sum reads: left out
  assert.equal(sliceEstimate(netlist([['MUXCY', { CI: 9, DI: '0', S: '1', O: 30 }], lut(21, 7), ['MUXCY', { CI: 30, DI: '0', S: 21, O: 31 }]]), 't'), 1);
});

test('the wide multiplexers: a slice per MUXF5, a MUXF6 over two; the memories: two of one clock and enable to a slice', () => {
  const f5 = (o, a, b, s) => [lut(a, 3), lut(b, 4), ['MUXF5', { I0: a, I1: b, S: s, O: o }]];
  assert.equal(sliceEstimate(netlist([...f5(20, 10, 11, 5), fdre(20, 21)]), 't'), 1);
  assert.equal(sliceEstimate(netlist([...f5(20, 10, 11, 5), ...f5(22, 12, 13, 5), ['MUXF6', { I0: 20, I1: 22, S: 6, O: 23 }]]), 't'), 2);
  // flip-flops alone into the free sides of the multiplexers' slices (BX the MUXF5's select, BY the MUXF6's), of their
  // control set (1.5.1, #3389)
  assert.equal(sliceEstimate(netlist([...f5(20, 10, 11, 5), fdre(5, 30), fdre(6, 31)]), 't'), 1);
  assert.equal(sliceEstimate(netlist([...f5(20, 10, 11, 5), fdre(5, 30), fdre(6, 31), fdre(7, 32)]), 't'), 2);
  assert.equal(sliceEstimate(netlist([...f5(20, 10, 11, 5), fdre(20, 21), fdre(6, 31)]), 't'), 1);
  assert.equal(sliceEstimate(netlist([...f5(20, 10, 11, 5), fdre(20, 21), fdre(6, 31, { ce: 9 })]), 't'), 2);
  const f6 = [...f5(20, 10, 11, 5), ...f5(22, 12, 13, 7), ['MUXF6', { I0: 20, I1: 22, S: 6, O: 23 }], fdre(23, 24)];
  assert.equal(sliceEstimate(netlist([...f6, fdre(7, 30), fdre(5, 31), fdre(8, 32)]), 't'), 2);
  assert.equal(sliceEstimate(netlist([...f6, fdre(7, 30), fdre(8, 31), fdre(9, 32)]), 't'), 3);
  // a MUXF6 over anything but MUXF5s: a LUT
  assert.equal(sliceEstimate(netlist([lut(10, 3), lut(11, 4), ['MUXF6', { I0: 10, I1: 11, S: 6, O: 23 }]]), 't'), 2);
  const srl = (q, ce) => ['SRL16E', { CLK: 2, CE: ce, D: 3, A0: '1', A1: '1', A2: '1', A3: '0', Q: q }];
  assert.equal(sliceEstimate(netlist([srl(10, 5), srl(11, 5)]), 't'), 1);
  assert.equal(sliceEstimate(netlist([srl(10, 5), srl(11, 6)]), 't'), 2);
  assert.equal(sliceEstimate(netlist([['RAM16X1D', { WCLK: 2, WE: 5, D: 3, A0: 6, A1: 7, A2: 8, A3: 9, DPRA0: 6, DPRA1: 7, DPRA2: 8, DPRA3: 9, SPO: 10, DPO: 11 }]]), 't'), 1);
});

test('a netlist that cannot be read, or of another family (a Spartan-6\'s LUT6, CARRY4): null; the cells, nextpnr\'s', () => {
  assert.equal(sliceEstimate('{"modules":{}}', 't'), null);
  assert.equal(sliceEstimate('not json', 't'), null);
  assert.equal(sliceEstimate(netlist([['LUT6', { I0: 3, I1: 4, I2: 5, I3: 6, I4: 7, I5: 8, O: 10 }], fdre(10, 11)]), 't'), null);
  assert.equal(sliceEstimate(netlist([lut(10, 3), ['CARRY4', { CI: '0', CYINIT: '0', DI: 3, S: 10, O: 11, CO: 12 }]]), 't'), null);
  assert.equal(S3E_CELL.source, NEXTPNR_CELL.source);
});

// nextpnr's packing of a design's netlist: the slices of its routed design (Translate, Map, Place & Route on the XC3S250E)
async function nextpnrSlices(json, top) {
  const lines = [];
  const r = await runOpenFlow({ top, part: 'xc3s250ecp132-4', device: 'xc3s250e', pkg: 'cp132', family: 'spartan3e', seed: 1, placements: 1, steps: orderOpenSteps(['par'], { synthUpToDate: true }) },
    { log: l => lines.push(l), sources: () => [], read: n => (n === `open/${top}.json` ? json : null), write: n => `build/${n}`, save: () => {}, device, nextpnr: { spartan3e: nextpnrNode() } });
  assert.equal(r.ok, true, lines.join('\n'));
  assert.deepEqual(lines.filter(l => /warning/i.test(l)), [], 'the flow\'s warnings: none');
  return r.report.map.summary.slices.used;
}
const within = (est, real) => Math.abs(est - real) <= Math.max(1, Math.ceil(0.02 * real));

test('against nextpnr: the packer\'s fixtures (wide multiplexers, flip-flops of many control sets, latches)', { timeout: 600000 }, async () => {
  const FPGA = path.join(HERE, '..', 'packages', 'silinx-fpga', 'test', 'fixtures', 'fpga');
  for (const name of ['counter', 'ffs', 'widemux', 'mux64', 'srmux']) {
    const text = fs.readFileSync(path.join(FPGA, `${name}.json`), 'utf8');
    const top = Object.entries(JSON.parse(text).modules).find(([, m]) => m.attributes?.top)?.[0] || Object.keys(JSON.parse(text).modules)[0];
    const real = await nextpnrSlices(text, top), est = sliceEstimate(text, top);
    assert.ok(within(est, real), `${name}: estimated ${est}, nextpnr ${real}`);
  }
});

// the ten examples, each as the open synthesis maps it for the Spartan-3E: the estimate is nextpnr 1.5.2's count, exactly
// (#3389; before it, pong, stopwatch, clock and vga one slice more: a LUT on two chains' selects, copied for one stage,
// taken by the other). The packing is the device's family's, before placement: one device stands for the Spartan-3E's
// four (the Spartan-6's netlists, of LUT6s, have no estimate)
// (#3710, the examples' clock as CLK_HZ: blinky 116, clock 195, vga 121, micro80 148 before)
const EXAMPLE_SLICES = { gates: 1, traffic: 66, blinky: 118, pong: 224, stopwatch: 192, clock: 214, vga: 123, isqrt: 63, uart: 112, micro80: 146 };
for (const names of [EXAMPLES.slice(0, 5), EXAMPLES.slice(5)]) {
  test(`against nextpnr: the examples ${names.join(', ')}`, { timeout: 900000 }, async () => {
    const { synthesizeOpen } = await import('../core/synth-front.js');
    const { compile, elaborate } = await import('../core/compile.js');
    const { primitiveSources } = await import('../core/unisim.js');
    for (const name of names) {
      const ex = example(name);
      const r = await synthesizeOpen(elaborate(compile([...primitiveSources(ex.design), ...ex.design]), ex.project.top), { family: 'spartan3e', run: yosysNode });
      assert.deepEqual(r.warnings, [], `${name}: the synthesis's warnings`);
      const text = r.files[`${r.top}.json`];
      const real = await nextpnrSlices(text, r.top), est = sliceEstimate(text, r.top);
      assert.deepEqual([name, est, real], [name, EXAMPLE_SLICES[name], EXAMPLE_SLICES[name]]);
    }
  });
}
