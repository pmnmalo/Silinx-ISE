// Silinx toolchain - a slice's delays through the carry chain's XORs and onto XB (#2286): the timing's arcs
// (packages/silinx-fpga/src/fpga/timing-arcs.js instArcs) against trce's delays of the same ways through a slice, and
// the minimum period of a design whose critical path goes through them against trce's.
// Copyright 2026 Pedro Maló
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parseXdl } from '../packages/silinx-fpga/src/xdl.js';
import { loadDeviceCache } from '../packages/silinx-fpga/src/fpga/device-node.js';
import { analyzeTiming, instArcs } from '../packages/silinx-fpga/src/fpga/timing.js';

const TRCE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'silinx-fpga', 'test', 'fixtures', 'fpga', 'trce');

// trce's delays (ISE 14.7, XC3S250E -4) read from the setup paths of nine routings of blinky and stopwatch
// (research/s3e-route/ff-hold.mjs's reports): [SLICEL, SLICEM]; null where trce's reports had none
const TRCE_DELAYS = {
  Topx: [1.060, 1.118], Topgy: [1.231, 1.288], Topy: [1.641, 1.732], Topcyf: [1.162, 1.162], Topcyg: [1.001, 1.131],
  Tdick: [0.308, 0.360], Tbxy: [null, 1.676], Tcinxb: [null, 0.495], Topxb: [null, 1.344], TopxbDI: [null, 1.135], Tbxxb: [null, 1.288],
};

const slice = (k, cfg) => ({
  type: k ? 'SLICEM' : 'SLICEL', site: k ? 'SLICE_X0Y0' : 'SLICE_X1Y0',
  cfg: Object.entries(cfg).map(([attr, value]) => ({ attr, name: '', value })),
});
const arc = (a, i, o) => a.comb.filter(x => x[0] === i && x[1] === o).map(x => x[2]);

test('#2286 a slice\'s ways through the carry\'s XORs, its carry out and XB: trce\'s delays', () => {
  for (const k of [0, 1]) {
    const want = name => TRCE_DELAYS[name][k];
    // an adder's stages: F XOR CIN on X, G XOR (the F stage's carry) on Y, the carry on COUT and XB
    const add = instArcs(slice(k, { F: '#LUT:D=A1', G: '#LUT:D=A1', FXMUX: 'FXOR', GYMUX: 'GXOR', CYINIT: 'CIN', CY0F: '#OFF', CY0G: '#OFF' }));
    assert.deepEqual(arc(add, 'F1', 'X'), [want('Topx')]);
    assert.deepEqual(arc(add, 'G1', 'Y'), [want('Topgy')]);
    assert.deepEqual(arc(add, 'F1', 'Y'), [want('Topy')]);
    assert.deepEqual(arc(add, 'F1', 'COUT'), [want('Topcyf')]);
    assert.deepEqual(arc(add, 'G1', 'COUT'), [want('Topcyg')]);
    // (on the SLICEM only in trce's reports: the SLICEL's taken the same)
    assert.deepEqual(arc(add, 'CIN', 'XB'), [TRCE_DELAYS.Tcinxb[1]]);
    assert.deepEqual(arc(add, 'F1', 'XB'), [TRCE_DELAYS.Topxb[1]]);
    // the carry's data input on a LUT pin (CY0F = F2) and on BX
    const di = instArcs(slice(k, { F: '#LUT:D=A1', FXMUX: 'FXOR', CYINIT: 'CIN', CY0F: 'F2' }));
    assert.deepEqual(arc(di, 'F2', 'XB'), [TRCE_DELAYS.TopxbDI[1]]);
    const bx = instArcs(slice(k, { F: '#LUT:D=A1', G: '#LUT:D=A1', GYMUX: 'GXOR', CYINIT: 'CIN', CY0F: 'BX' }));
    assert.deepEqual(arc(bx, 'BX', 'XB'), [TRCE_DELAYS.Tbxxb[1]]);
    if (k) assert.deepEqual(arc(bx, 'BX', 'Y'), [want('Tbxy')]);
    // BX straight into the flip-flop
    const ff = instArcs(slice(k, { FFX: '#FF', DXMUX: '0' }));
    assert.equal(ff.setup.find(x => x[0] === 'BX')[1], want('Tdick'));
  }
});

test('#2286 the period of blinky routed by Silinx, its critical path through CIN -> XB: trce\'s within 1 %', () => {
  const d = parseXdl(zlib.gunzipSync(fs.readFileSync(path.join(TRCE, 'blinky-carry.xdl.gz'))).toString('utf8'));
  const ref = JSON.parse(fs.readFileSync(path.join(TRCE, 'blinky-carry-trce.json'), 'utf8'));
  const [c] = analyzeTiming(d, loadDeviceCache('xc3s250ecp132-4')).clocks;
  // 6.607 ns before (CIN -> XB 0.065 ns against trce's 0.495), 6.6 % under trce's 7.075
  assert.equal(+c.period.toFixed(3), 7.037);
  assert.ok(Math.abs(c.period - ref.period) / ref.period < 0.01, `${c.period} against trce's ${ref.period}`);
  assert.ok(c.path.some((s, j) => s.pin === 'XB' && c.path[j - 1]?.pin === 'CIN'), c.path.map(s => s.pin).join(' '));
});
