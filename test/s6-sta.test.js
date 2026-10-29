// research/s6 stage S6-G (#731), without ISE: the static timing of a routed Spartan-6 design (sta6.mjs). A slice's
// arcs from its settings (the LUTs' equations, the output multiplexers, the carry chain stage by stage, the
// flip-flops and the second ones, a flip-flop set as a gate), a block RAM's and a DSP48A1's, the arcs' delays by site
// class, the PERIOD analysis on a small design against a hand count; reportgen's loads by logical pin
// (timing-fit6.mjs loadDelay) and the wire model by wire type (fitWires).
import test from 'node:test';
import assert from 'node:assert/strict';
import { sliceArcs6, hardArcs6, lutInputs, periodSlack, siteClass, classArcs, ARC_DEFAULTS } from '../research/s6/sta6.mjs';
import { loadDelay, fitWires, wireType } from '../research/s6/timing-fit6.mjs';

const slice = (cfg, site = 'SLICE_X2Y2', type = 'SLICEL') => ({ name: 's', type, site, tile: 'CLEXL_X1Y2', cfg: Object.entries(cfg).map(([attr, value]) => ({ attr, name: '', value })) });
const pins = arcs => arcs.map(a => a.slice(0, -1).join('>')).sort();
const T = { ...ARC_DEFAULTS, types: { Topab: 0.45, Topad: 0.55, Topcya: 0.38, Tbxd: 0.34, Tcind: 0.27 } };

test('sta6: a LUT\'s arcs from the inputs its equation reads, to its output and its output multiplexer', () => {
  assert.deepEqual(lutInputs('#LUT:O6=(A6+~A6)*((A4@~A2))', 'B'), ['B2', 'B4', 'B6']);
  assert.deepEqual(lutInputs(undefined, 'A'), []);
  const a = sliceArcs6(slice({ A6LUT: '#LUT:O6=(A1*A3)', A5LUT: '#LUT:O5=~A2', AOUTMUX: 'O5', BOUTMUX: '#OFF' }), T);
  assert.deepEqual(pins(a.comb), ['A1>A', 'A2>AMUX', 'A3>A']);
  assert.deepEqual([a.setup, a.clkToOut], [[], []]);
});

test('sta6: the carry chain stage by stage (an XOR reads the selects at and below it, the data below it), COUT, CIN', () => {
  const a = sliceArcs6(slice({ A6LUT: '#LUT:O6=A1', ACY0: 'O5', A5LUT: '#LUT:O5=A2', BCY0: 'BX', D6LUT: '#LUT:O6=A3', DOUTMUX: 'XOR', COUTUSED: '0', PRECYINIT: '0' }), T);
  const d = a.comb.filter(x => x[1] === 'DMUX');
  // stage A's select and data, B's bypass (its data), D's select; not D's own data; CIN
  assert.deepEqual(pins(d), ['A1>DMUX', 'A2>DMUX', 'BX>DMUX', 'CIN>DMUX', 'D3>DMUX']);
  assert.equal(d.find(x => x[0] === 'A1')[2], 0.55);      // Topad, by its name
  assert.equal(d.find(x => x[0] === 'BX')[2], 0.34);      // Tbxd
  assert.equal(d.find(x => x[0] === 'CIN')[2], 0.27);     // Tcind
  const c = a.comb.filter(x => x[1] === 'COUT');
  assert.deepEqual(pins(c), ['A1>COUT', 'A2>COUT', 'BX>COUT', 'CIN>COUT', 'D3>COUT']);
  assert.equal(c.find(x => x[0] === 'A1')[2], 0.38);      // Topcya
});

test('sta6: the flip-flops: data by the input mux, the second flip-flop, CE and SR, one set as a gate passing through', () => {
  const a = sliceArcs6(slice({ A6LUT: '#LUT:O6=A1', AFF: '#FF', AFFMUX: 'O6', BFF: '#FF', BFFMUX: 'BX', D5LUT: '#LUT:O5=A2', D5FF: '', DOUTMUX: 'D5Q', CEUSED: '0', SRUSED: '0' }), T);
  assert.deepEqual(a.setup.map(x => x[0]).sort(), ['A1', 'BX', 'CE', 'D2', 'SR']);
  assert.deepEqual(a.clkToOut.map(x => x[0]).sort(), ['AQ', 'BQ', 'DMUX']);
  assert.equal(a.setup.find(x => x[0] === 'BX')[1], T.Tdick);
  const g = sliceArcs6(slice({ DFF: '#AND2L', DFFMUX: 'DX', SRUSED: '0' }), T);
  assert.deepEqual(pins(g.comb), ['DX>DQ', 'SR>DQ']);
  assert.deepEqual([g.setup, g.clkToOut], [[], []]);
  // no clocked element: no CE / SR setup
  assert.deepEqual(sliceArcs6(slice({ A6LUT: '#LUT:O6=A1', CEUSED: '0' }), T).setup, []);
});

test('sta6: a block RAM\'s and a DSP48A1\'s arcs on the pins in use; the site class', () => {
  const ram = hardArcs6({ type: 'RAMB8BWER', cfg: [] }, ['ADDRAWRADDR4', 'DIADI0', 'CLKAWRCLK'], ['DOBDO3'], { ...T, types: { Trcko_DOB: 1.85 } });
  assert.deepEqual(ram.clkToOut, [['DOBDO3', 1.85]]);
  assert.deepEqual(ram.setup.map(x => x[0]), ['ADDRAWRADDR4', 'DIADI0']);
  const dsp = (mreg) => hardArcs6({ type: 'DSP48A1', cfg: [{ attr: 'MREG', value: mreg }, { attr: 'PREG', value: '0' }] }, ['A3', 'B1'], ['P5'], T);
  assert.deepEqual(dsp('1').setup.map(x => x[0]), ['A3', 'B1']);
  assert.deepEqual(dsp('1').clkToOut.map(x => x[0]), ['P5']);
  assert.deepEqual(pins(dsp('0').comb), ['A3>P5', 'B1>P5']);
  assert.equal(siteClass({ tile: 'CLEXM_X3Y4', site: 'SLICE_X5Y8' }), 'CLEXM x');
  assert.equal(siteClass({ tile: 'CLEXL_X3Y4', site: 'SLICE_X4Y8' }), 'CLEXL lm');
  // the classes' medians from trce's paths: a Tilo on a MUX output apart
  const xdl = { insts: [{ site: 'SLICE_X5Y8', tile: 'CLEXM_X3Y4', type: 'SLICEX', cfg: [] }] };
  const e = (pin, type, delay) => ({ loc: `SLICE_X5Y8.${pin}`, type, delay });
  assert.deepEqual(classArcs([{ xdl, paths: [{ elements: [e('A', 'Tilo', 0.259), e('BMUX', 'Tilo', 0.313), e('AQ', 'Tcko', 0.391)] }, { elements: [e('C', 'Tilo', 0.259)] }] }]),
    { 'CLEXM x': { Tilo: 0.259, TiloMux: 0.313, Tcko: 0.391 } });
});

test('sta6: the PERIOD analysis of a small design: the worst path, its slack with the clock skew, a loop left out', () => {
  // f1.AQ -> l.A1 -> l.A -> f2.D (setup through the LUT) and f1.AQ -> f2.DX direct; f2's clock 0.1 later
  const xdl = {
    insts: [slice({ AFF: '#FF', AFFMUX: 'AX' }), slice({ A6LUT: '#LUT:O6=A1' }), slice({ D6LUT: '#LUT:O6=A1', DFF: '#FF', DFFMUX: 'O6', BFF: '#FF', BFFMUX: 'BX' })].map((s, i) => ({ ...s, name: ['f1', 'l', 'f2'][i] })),
    nets: [
      { name: 'clk', outpins: [{ inst: 'g', pin: 'O' }], inpins: [{ inst: 'f1', pin: 'CLK' }, { inst: 'f2', pin: 'CLK' }] },
      { name: 'q', outpins: [{ inst: 'f1', pin: 'AQ' }], inpins: [{ inst: 'l', pin: 'A1' }, { inst: 'f2', pin: 'BX' }] },
      { name: 'n', outpins: [{ inst: 'l', pin: 'A' }], inpins: [{ inst: 'f2', pin: 'D1' }] },
    ],
  };
  const netDelay = (n, src, p) => ({ q: { A1: 1.0, BX: 0.5 }, n: { D1: 2.0 } })[n.name]?.[p.pin] ?? null;
  const Tp = { ...ARC_DEFAULTS, Tcko: 0.4, Tilo: 0.2, Tas: 0.3, Tdick: 0.1 };
  const r = periodSlack(xdl, 'clk', { period: 10, uncertainty: 0.035, netDelay, clockAt: i => (i === 'f2' ? 0.1 : 0), T: Tp });
  // 0.4 + 1.0 + 0.2 + 2.0 + 0.3 = 3.9; slack 10 + 0.1 - 3.9 - 0.035
  assert.equal(+r.arrival.toFixed(6), 3.9);
  assert.equal(+r.slack.toFixed(6), 6.165);
  assert.deepEqual(r.path, ['f1.AQ', 'l.A1', 'l.A', 'f2.D1']);
  // another clock: no path
  assert.equal(periodSlack(xdl, 'other', { period: 10, netDelay, clockAt: () => 0, T: Tp }), null);
});

test('timing-fit6: reportgen\'s load by its logical pin (the letter the same), the largest of an ambiguous one with worst', () => {
  const e = { loads: new Map([['a.D5', 0.5], ['b.A3', 0.2], ['b.C6', 0.3], ['c.B1', 0.4], ['c.B2', 0.6]]) };
  assert.equal(loadDelay(e, 'a', 'D5'), 0.5);
  assert.equal(loadDelay(e, 'a', 'D6'), 0.5);              // the instance's one load
  assert.equal(loadDelay(e, 'b', 'C4'), 0.3);              // by the letter
  assert.equal(loadDelay(e, 'c', 'B3'), undefined);        // two of the letter
  assert.equal(loadDelay(e, 'c', 'B3', { worst: true }), 0.6);
  assert.equal(loadDelay(e, 'z', 'A1'), undefined);
});

test('timing-fit6: the wire model by wire type, found back from its delays', () => {
  assert.equal(wireType('CLEXM_LOGICIN_B27'), 'LOGICIN_B#');
  assert.equal(wireType('EE4B3'), 'EE#B#');
  // delay = 0.1 a wire EE#B# + 0.3 a NN#B#, the base, classes and pin kind all zero
  const c = (ee, nn) => ({ counts: new Array(9).fill(0), fanout: 1, pin: 5, wires: [...Array(ee).fill('EE#B#'), ...Array(nn).fill('NN#B#')], delay: 0.1 * ee + 0.3 * nn });
  const conns = [];
  for (let i = 0; i < 30; i++) conns.push(c(i % 4, Math.floor(i / 4) % 3));
  const m = fitWires(conns, { min: 5 });
  assert.deepEqual(m.vocab, ['EE#B#', 'NN#B#']);
  assert.equal(+m.predict(c(2, 1)).toFixed(6), 0.5);
  assert.equal(+m.predict(c(0, 0)).toFixed(6), 0);
});
