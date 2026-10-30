// Silinx toolchain - a global clock's loads reached through general routing (#2224): their clock skew in the static
// timing analysis (packages/silinx-fpga/src/fpga/timing.js clockArrivals, clockDetour), against ISE's trce and
// reportgen -delay on the same routing, and no change for a clock wholly on the global lines.
// Copyright 2026 Pedro Maló
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parseXdl } from '../packages/silinx-fpga/src/xdl.js';
import { loadDeviceCache } from '../packages/silinx-fpga/src/fpga/device-node.js';
import { SPEED_4, analyzeTiming, clockArrivals, timingGraph, routedDelays, timingReport } from '../packages/silinx-fpga/src/fpga/timing.js';

const TRCE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'silinx-fpga', 'test', 'fixtures', 'fpga', 'trce');
const xdl = name => parseXdl(zlib.gunzipSync(fs.readFileSync(path.join(TRCE, name))).toString('utf8'));
const device = loadDeviceCache('xc3s250ecp132-4');
// the period without any clock skew: the analysis as it was before #2224
const noSkew = d => { const tg = timingGraph(d); return tg.analyze(routedDelays(d, device, tg)).period; };

// blinky placed and routed by nextpnr-spartan v0.6.0, before its router kept a global buffer's loads on the global lines:
// 28 of its 77 clock pins reached through general routing; trce's minimum period 8.015 ns, its critical path's clock
// skew -1.774 ns (0.088 at the end, 1.862 at the start), and ISE's delay of every connection of the clock net
const ref = JSON.parse(fs.readFileSync(path.join(TRCE, 'blinky-clock-detour-trce.json'), 'utf8'));

test('#2224 a global clock on general routing: the loads ISE delays, each one\'s skew within the model\'s accuracy', () => {
  const d = xdl('blinky-clock-detour.xdl.gz');
  const arr = clockArrivals(d, device);
  // the detours are the loads ISE's delay sets apart: 0.07-0.12 ns on the global lines, 0.86 ns and more off them
  const off = Object.keys(ref.clockDelay).filter(i => ref.clockDelay[i] > 0.5).sort();
  assert.equal(off.length, 28);
  assert.deepEqual([...arr.skew.keys()].sort(), off);
  // each one's skew: ISE's delay less a global line's (the mean of the others)
  const glob = Object.values(ref.clockDelay).filter(x => x <= 0.5), g = glob.reduce((a, b) => a + b, 0) / glob.length;
  const err = off.map(i => arr.skew.get(i) - (ref.clockDelay[i] - g));
  const rms = Math.sqrt(err.reduce((a, e) => a + e * e, 0) / err.length);
  assert.ok(rms < 0.12, `rms ${rms}`);
  assert.ok(Math.max(...err.map(Math.abs)) < 0.25, err.join(' '));
  // a load on the global lines: Tgclk after the pad, as before; a detour later by its skew (the earliest by minScale x it)
  const { Tgclk, minScale } = SPEED_4.clock;
  for (const [i, t] of arr) {
    const s = arr.skew.get(i) ?? 0;
    assert.equal(t, Tgclk + s, i);
    assert.ok(Math.abs(arr.early.get(i) - (minScale * Tgclk + minScale * s)) < 1e-9, i);
  }
  assert.deepEqual(arr.detours.map(x => ({ ...x, skew: +x.skew.toFixed(3) })), [{ clock: '$iopadmap$clk', pins: 28, of: 77, skew: 2.094 }]);
});

test('#2224 a global clock on general routing: the period with the skew, near trce\'s, the critical path\'s skew as trce\'s', () => {
  const d = xdl('blinky-clock-detour.xdl.gz');
  const r = analyzeTiming(d, device);
  // blind to the skew before: 7.647 ns, 4.6 % under trce's; now 1.2 %
  const before = noSkew(d), [c] = r.clocks;
  assert.equal(+before.toFixed(3), 7.647);
  assert.equal(+c.period.toFixed(3), 7.918);
  assert.ok(Math.abs(c.period - ref.period) / ref.period < 0.02, `${c.period} against trce's ${ref.period}`);
  // trce's critical path: from a flip-flop on general routing to one on the global lines (skew -1.774 ns)
  const arr = clockArrivals(d, device), sk = i => arr.skew.get(i) ?? 0;
  const skew = sk(c.path.at(-1).inst) - sk(c.path[0].inst);
  assert.ok(Math.abs(skew - ref.criticalSkew) < 0.1, `skew ${skew}`);
  // the report says it (no flow warning: the analysis counts it), and the hold check takes the skew in
  const lines = timingReport(r);
  assert.deepEqual(lines.filter(l => /general routing/.test(l)),
    ['clock $iopadmap$clk: 28 of its 77 clock pins reached through general routing, not the global lines (clock skew up to 2.094 ns)']);
  assert.deepEqual(lines.filter(l => /^hold/.test(l)),
    ['hold, clock $iopadmap$clk: met, worst slack 0.732 ns (the shortest path at its earliest; with the clock\'s skew)']);
});

test('#2224 a global clock wholly on the global lines: no skew, the period and the report exactly as before (Silinx\'s routing of stopwatch)', () => {
  // (its block RAM's clock through BRAM_CLK: the global lines' own way into the pin, not general routing)
  const d = xdl('stopwatch.xdl.gz');
  assert.ok(d.insts.some(i => i.type === 'RAMB16'));
  const arr = clockArrivals(d, device);
  assert.equal(arr.skew.size, 0);
  assert.deepEqual(arr.detours, []);
  const r = analyzeTiming(d, device);
  assert.equal(r.period, noSkew(d));
  assert.deepEqual(r.detours, []);
  const lines = timingReport(r);
  assert.deepEqual(lines.filter(l => /general routing/.test(l)), []);
  assert.match(lines.find(l => /^hold/.test(l)), /\(the shortest path at its earliest; the global clock reaches both flip-flops at once\)$/);
});
