// The Silinx toolchain's estimated power (packages/silinx-fpga/src/power.js, #123): the switching activity of a LUT against
// a simulation of its inputs; the clocks, rates and power of a routed design; the report as XPower's
// text report (its summary read by server/ise.js parsePwr); and the estimate on the examples against
// XPower 14.7's (test/fixtures/power/xpower-examples.json, scripts/measure-power.mjs), within
// ESTIMATE_ERROR_PERCENT; the model's coefficients are the fit of those reports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lutActivity, designClocks, designActivity, estimatePower, powerReport, COEFFICIENTS, DEVICES, DEFAULT_CLOCK_MHZ, ESTIMATE_ERROR_PERCENT, DYNAMIC_RANGE } from '../packages/silinx-fpga/src/power.js';
import { parseXdl } from '../packages/silinx-fpga/src/xdl.js';
import { parsePwr } from '../server/ise.js';
import { FIXTURE, fit, mergeRuns, silinxEstimate } from '../scripts/measure-power.mjs';
import { EXAMPLE_ORDER } from '../core/examples.js';
import { ISE_RECORDED } from './examples-lib.mjs';

// a seeded random generator (the simulation is the same at every run)
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
// the inputs as independent random telegraph signals of probability p and density d (transitions per
// unit of time), the output's transitions counted: the reference for lutActivity
function simulate(f, inputs, { T = 4000, dt = 0.005, seed = 7 } = {}) {
  const r = rng(seed);
  const v = inputs.map(i => (r() < i.p ? 1 : 0));
  let y = f(v), high = 0, flips = 0;
  for (let t = 0; t < T; t += dt) {
    inputs.forEach((i, k) => {
      const rate = v[k] ? i.d / (2 * i.p) : i.d / (2 * (1 - i.p));   // leaving 1, leaving 0
      if (i.d && r() < rate * dt) v[k] ^= 1;
    });
    const ny = f(v);
    if (ny !== y) flips++;
    y = ny; high += y * dt;
  }
  return { p: high / T, d: flips / T };
}

test('lutActivity: probability and transition density of a LUT\'s output, against a simulation of its inputs', () => {
  const cases = [
    ['D=(A1*A2)', ([a, b]) => a & b, [{ p: 0.5, d: 1 }, { p: 0.5, d: 1 }]],
    ['D=(A1@A2)', ([a, b]) => a ^ b, [{ p: 0.3, d: 0.5 }, { p: 0.6, d: 1.5 }]],
    ['D=((A1*A2)+(~A1*A3))', ([a, b, c]) => (a ? b : c), [{ p: 0.5, d: 0.2 }, { p: 0.2, d: 1 }, { p: 0.7, d: 0.6 }]],
    ['D=((A1+A2)*(A3+~A4))', ([a, b, c, d]) => (a | b) & (c | (1 - d)), [{ p: 0.5, d: 0.8 }, { p: 0.4, d: 0.3 }, { p: 0.5, d: 1.2 }, { p: 0.9, d: 0.1 }]],
  ];
  for (const [eq, f, ins] of cases) {
    const a = lutActivity(eq, Object.fromEntries(ins.map((x, k) => [`A${k + 1}`, x])));
    const s = simulate(f, ins);
    assert.ok(Math.abs(a.p - s.p) < 0.03, `${eq}: p ${a.p} vs ${s.p}`);
    assert.ok(Math.abs(a.d - s.d) / s.d < 0.06, `${eq}: d ${a.d} vs ${s.d}`);
  }
  // exact cases: AND of two halves toggling once (0.25 high, density 1), an inverter, a constant, an unused input
  assert.deepEqual(lutActivity('D=(A1*A2)', { A1: { p: 0.5, d: 1 }, A2: { p: 0.5, d: 1 } }), { p: 0.25, d: 1 });
  assert.deepEqual(lutActivity('D=~A3', { A3: { p: 0.2, d: 4 } }), { p: 0.8, d: 4 });
  assert.deepEqual(lutActivity('D=1', {}), { p: 1, d: 0 });
  assert.deepEqual(lutActivity('D=A1', { A1: { p: 0.5, d: 2 }, A2: { p: 0.5, d: 9 } }), { p: 0.5, d: 2 });
  // a missing input is a constant 0: no activity through it
  assert.deepEqual(lutActivity('D=(A1+A2)', { A1: { p: 0.5, d: 2 } }), { p: 0.5, d: 2 });
});

// a routed design by hand: the clock pad, its global buffer, a counter's flip-flop (D = ~Q through
// the F LUT, a T flip-flop), a LUT of two inputs to an output, an input
const XDL = `design "top" xc3s250ecp132-4 v3.2 ;
inst "clk" "IOB",placed LIOIS_X0Y1 B8 , cfg " IOATTRBOX::LVCMOS25 IBUF::#OFF PAD:clk: " ;
inst "bufg" "BUFGMUX",placed CLKB BUFGMUX_X1Y0 , cfg " GCLKMUX:bufg: DISABLE_ATTR::LOW " ;
inst "s0" "SLICEL",placed CLB_X5Y5 SLICE_X8Y10 , cfg " F:n0:#LUT:D=~A1 FFX:q0:#FF DXMUX::1 FXMUX::F CLKINV::CLK G:n1:#LUT:D=(A1*A2) GYMUX::G " ;
inst "sw" "IBUF",placed LIOIS_X0Y2 P11 , cfg " IOATTRBOX::LVCMOS25 PAD:sw: " ;
inst "led" "IOB",placed RIOIS_X27Y24 M5 , cfg " DRIVEATTRBOX::12 IOATTRBOX::LVCMOS25 OMUX::O1 SLEW::SLOW OUTBUF:led_OBUF: PAD:led: " ;
net "clk_in" , outpin "clk" I , inpin "bufg" I0 , ;
net "clk_g" , outpin "bufg" O , inpin "s0" CLK , ;
net "q0" , outpin "s0" XQ , inpin "s0" F1 , inpin "s0" G1 , ;
net "n0" , outpin "s0" X , inpin "s0" BX , ;
net "sw_i" , outpin "sw" I , inpin "s0" G2 , ;
net "led_o" , outpin "s0" Y , inpin "led" O1 , ;
`;

test('designClocks / designActivity: the clock and its PERIOD, the flip-flops at 12.5 %, the LUTs through their function, the inputs at 12.5 % of the fastest clock', () => {
  const d = parseXdl(XDL);
  const clocks = designClocks(d, [{ net: 'clk', period: 10 }]);
  assert.deepEqual(clocks, [{ net: 'clk_g', port: 'clk', mhz: 100, constrained: true, buffers: ['bufg'], loads: 1, slices: 1 }]);
  // without a PERIOD: the boards' oscillator
  assert.equal(designClocks(d, [])[0].mhz, DEFAULT_CLOCK_MHZ);
  assert.equal(designClocks(d, [])[0].constrained, false);
  const a = designActivity(d, clocks);
  assert.deepEqual(a.get('q0'), { p: 0.5, d: 12.5 });   // 12.5 % of 100 MHz
  assert.deepEqual(a.get('n0'), { p: 0.5, d: 12.5 });   // its inverse
  assert.deepEqual(a.get('sw_i'), { p: 0.5, d: 12.5 });   // an input: 12.5 % of the fastest clock
  assert.deepEqual(a.get('clk_in'), { p: 0.5, d: 200 });   // the clock: two transitions per period
  assert.deepEqual(a.get('led_o'), { p: 0.25, d: 12.5 });   // q0 AND sw: 0.5 × 12.5 + 0.5 × 12.5
});

test('estimatePower: the static power of the device, the dynamic power by clocks, logic, signals and I/Os; the supplies; the warnings', () => {
  const d = parseXdl(XDL);
  const e = estimatePower(d, { device: 'xc3s250e', periods: [{ net: 'clk', period: 10 }] });
  const K = COEFFICIENTS;
  const close = (a, b, what, tol = 0.006) => assert.ok(Math.abs(a - b) < tol, `${what}: ${a} vs ${b}`);
  close(e.clocksMw, 100 * (K.bufgPerMhz + DEVICES.xc3s250e.clockNetPerMhz + DEVICES.xc3s250e.clockSlicePerMhz * 1), 'clocks');
  close(e.logicMw, 2 * K.lutPerRate * 12.5 + K.ffPerRate * 12.5, 'logic');
  // signals: q0 (2 loads), n0, sw_i, led_o (1 load each), every one at 12.5
  close(e.signalsMw, 12.5 * (4 * K.netPerRate + 5 * K.netFanoutPerRate), 'signals');
  close(e.iosMw, K.outputPerRate25 * 12.5 + K.inputPerRate * 12.5 + K.inputPerRate * 200, 'ios');
  assert.deepEqual(e.logic, { luts: 2, ffs: 1 });
  assert.equal(e.signals.nets, 4);
  assert.deepEqual(e.ios.map(i => [i.name, i.dir, i.std]), [['clk', 'in', 'LVCMOS25'], ['sw', 'in', 'LVCMOS25'], ['led', 'out', 'LVCMOS25_12_SLOW']]);
  // static: the device's quiescent currents at the junction temperature
  const q = DEVICES.xc3s250e;
  // (the junction temperature as reported: rounded to 0.1 °C)
  close(e.staticMw, (q.vccint + q.vccintPerC * (e.junctionC - 25)) * 1.2 + q.vccaux * 2.5 + q.vcco * 2.5, 'static', 0.02);
  assert.ok(e.junctionC > 25 && e.junctionC < 30, e.junctionC);
  close(e.totalMw, e.staticMw + e.dynamicMw, 'total');
  assert.deepEqual(e.supplies.map(s => [s.name, s.volts]), [['Vccint', 1.2], ['Vccaux', 2.5], ['Vcco25', 2.5]]);
  close(e.supplies.reduce((s, x) => s + x.totalMa * x.volts, 0), e.totalMw, 'the supplies add up to the total');
  assert.deepEqual(e.warnings, []);
  // an output of 3.3 V: (3.3 / 2.5)² the power of one of 2.5 V
  const e33 = estimatePower(parseXdl(XDL.replace('IOATTRBOX::LVCMOS25 OMUX', 'IOATTRBOX::LVCMOS33 OMUX')), { device: 'xc3s250e', periods: [{ net: 'clk', period: 10 }] });
  close(e33.ios.find(i => i.name === 'led').mw, K.outputPerRate25 * 12.5 * (3.3 / 2.5) ** 2, 'LVCMOS33');
  assert.deepEqual(e33.supplies.map(s => s.name), ['Vccint', 'Vccaux', 'Vcco33', 'Vcco25']);
  // no PERIOD, an unknown device: said
  const w = estimatePower(d, { device: 'xc3s1600e' });
  assert.deepEqual(w.warnings, ['no static power model of xc3s1600e: the static power is not included', `no PERIOD constraint on the clock clk: ${DEFAULT_CLOCK_MHZ} MHz assumed`]);
  assert.equal(w.staticMw, 0);
});

test('powerReport: an estimate said as such, laid out as XPower\'s text report (the Design Summary reads its summary)', () => {
  const e = estimatePower(parseXdl(XDL), { device: 'xc3s250e' });
  const text = powerReport(e, { top: 'top', part: 'xc3s250ecp132-4', errorPercent: ESTIMATE_ERROR_PERCENT });
  assert.match(text, /^Silinx toolchain - estimated power \(not Xilinx XPower\)\n/);
  // (as text: in a template literal '\.' is a plain '.', which a RegExp takes for any character)
  assert.ok(text.includes(`On the examples its total is within ${ESTIMATE_ERROR_PERCENT} % of XPower's, its dynamic power alone within\n${DYNAMIC_RANGE[0]} to ${DYNAMIC_RANGE[1]} times XPower's.`), text);
  assert.match(text, /For a figure to rely on, run XPower in an ISE mode \(Toolchain Settings\)\./);
  assert.deepEqual(parsePwr(text), { totalMw: e.totalMw, dynamicMw: e.dynamicMw, staticMw: e.staticMw, junctionC: e.junctionC });
  assert.match(text, /\| Supply Power \(mW\) \|\s+[\d.]+ \|\s+[\d.]+ \|\s+[\d.]+ \|/);
  assert.match(text, /\| clk_g \|\s+clk \|\s+50\.00 \| none \(assumed\) \|/);
  assert.match(text, /4\.  Warnings\nWARNING:Power - no PERIOD constraint on the clock clk: 50 MHz assumed\n$/);
  assert.match(powerReport(estimatePower(parseXdl(XDL), { device: 'xc3s250e', periods: [{ net: 'clk', period: 20 }] }), { top: 'top', part: 'p' }), /4\.  Warnings\n\(none\)\n$/);
});

test('the model\'s coefficients are the fit of XPower\'s reports of the examples (test/fixtures/power/xpower-examples.json)', () => {
  const { tool, runs } = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  assert.match(tool, /^XPower 14\.7/);
  assert.equal(runs.length, 28);   // the seven examples on the four devices
  assert.deepEqual([...new Set(runs.map(r => r.example))], ISE_RECORDED);
  const f = fit(runs);
  const near = (a, b, what) => assert.ok(Math.abs(a - b) <= 0.002 * Math.abs(b) + 1e-9, `${what}: ${a} vs the fit's ${b}`);
  for (const [k, v] of Object.entries(f.coefficients)) near(COEFFICIENTS[k], v, k);
  for (const [dev, c] of Object.entries(f.devices)) for (const [k, v] of Object.entries(c)) near(DEVICES[dev][k], v, `${dev} ${k}`);
});

// scripts/measure-power.mjs --only: the fresh runs in place of the JSON's, or added, in the examples' and the targets' order
test('measure-power --only: the runs measured merged into the JSON\'s', () => {
  const T = [{ board: 'basys2', variant: '100' }, { board: 'nexys2', variant: '500' }];
  const run = (example, t, mw) => ({ example, board: t.board, variant: t.variant, power: { total: mw } });
  const old = [run('gates', T[0], 1), run('gates', T[1], 2), run('clock', T[0], 3), run('clock', T[1], 4)];
  // a new example, its targets given in another order: after the others, in the targets' order
  assert.deepEqual(mergeRuns(old, [run('vga', T[1], 6), run('vga', T[0], 5)], ['gates', 'clock', 'vga'], T).map(r => `${r.example} ${r.variant} ${r.power.total}`),
    ['gates 100 1', 'gates 500 2', 'clock 100 3', 'clock 500 4', 'vga 100 5', 'vga 500 6']);
  // an example measured again: its runs replaced where they were, the others kept
  assert.deepEqual(mergeRuns(old, [run('gates', T[1], 20)], ['gates', 'clock'], T).map(r => r.power.total), [1, 20, 3, 4]);
  // nothing measured: the JSON's runs as they were
  assert.deepEqual(mergeRuns(old, [], ['gates', 'clock'], T), old);
});

// the estimate of the Silinx toolchain's own routed design (its flow, through xpwr) against XPower's of
// ISE's implementation: four examples on the Basys2-250 here; all of them: scripts/measure-power.mjs --compare
test('the estimate on the examples: the total within ESTIMATE_ERROR_PERCENT of XPower\'s, the dynamic power within DYNAMIC_RANGE; the flow\'s report and log', { timeout: 300000 }, async () => {
  const { runs } = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  for (const example of ['traffic', 'blinky', 'pong', 'vga']) {
    const x = runs.find(r => r.example === example && r.board === 'basys2' && r.variant === '250');
    const { estimate: e, report, log, top, text } = await silinxEstimate(example, { board: 'basys2', variant: '250' });
    const err = (100 * (e.totalMw - x.power.total)) / x.power.total;
    assert.ok(Math.abs(err) <= ESTIMATE_ERROR_PERCENT, `${example}: ${e.totalMw} mW, XPower ${x.power.total} mW (${err.toFixed(1)} %)`);
    const ratio = e.dynamicMw / (x.power.total - x.power.static);
    assert.ok(ratio >= DYNAMIC_RANGE[0] && ratio <= DYNAMIC_RANGE[1], `${example}: dynamic ${e.dynamicMw} mW, ${ratio.toFixed(2)} times XPower's`);
    assert.ok(Math.abs(e.staticMw - x.power.static) < 0.01 * x.power.static, `${example}: static ${e.staticMw} vs ${x.power.static}`);
    // the flow's step: the report (as the Design Summary reads it), the log, no warning (the examples' UCFs give their clocks)
    assert.deepEqual(report.power, { totalMw: e.totalMw, dynamicMw: e.dynamicMw, staticMw: e.staticMw, junctionC: e.junctionC, estimate: true });
    assert.deepEqual(parsePwr(text), { totalMw: e.totalMw, dynamicMw: e.dynamicMw, staticMw: e.staticMw, junctionC: e.junctionC });
    assert.ok(log.includes('=== SILINX STEP xpwr ==='));
    assert.ok(log.includes(`Estimated power: ${e.totalMw.toFixed(2)} mW (dynamic ${e.dynamicMw.toFixed(2)} mW, static ${e.staticMw.toFixed(2)} mW), junction ${e.junctionC.toFixed(1)} C: build/${top}.pwr (an estimate, not Xilinx XPower)`), log.join('\n'));
    assert.deepEqual(log.filter(l => /^WARNING:Power/.test(l)), []);
    assert.equal(log.at(-1), '=== SILINX DONE ===');
  }
});
