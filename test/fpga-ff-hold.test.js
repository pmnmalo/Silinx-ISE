// Silinx toolchain - the hold check of two flip-flops (#2226: packages/silinx-fpga/src/fpga/timing.js pads().hold),
// against ISE's trce on the same routings: its worst hold path, the pair of flip-flops and the slack.
// Copyright 2026 Pedro Maló
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parseXdl } from '../packages/silinx-fpga/src/xdl.js';
import { loadDeviceCache } from '../packages/silinx-fpga/src/fpga/device-node.js';
import { SPEED_4, analyzeTiming, timingReport } from '../packages/silinx-fpga/src/fpga/timing.js';

const TRCE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'silinx-fpga', 'test', 'fixtures', 'fpga', 'trce');
const device = loadDeviceCache('xc3s250ecp132-4');
const load = name => ({
  design: parseXdl(zlib.gunzipSync(fs.readFileSync(path.join(TRCE, `${name}.xdl.gz`))).toString('utf8')),
  ref: JSON.parse(fs.readFileSync(path.join(TRCE, `${name}-trce.json`), 'utf8')),
});

// two routings of blinky with clock pins on general routing: Silinx's with 12 of them moved off the global lines (trce:
// a hold violation, -0.659 ns), nextpnr-spartan v0.6.0's (trce: met by 0.032 ns)
for (const name of ['blinky-hold-violation', 'blinky-clock-detour']) {
  test(`#2226 the hold check of two flip-flops as trce's: its worst pair and slack (${name})`, () => {
    const { design, ref } = load(name);
    const [h] = analyzeTiming(design, device).pads.hold;
    // the same pair of flip-flops as trce's worst hold path, its slack within the model's accuracy (it was 0.7 ns over)
    assert.deepEqual([h.path[0].inst, h.path.at(-1).inst], [ref.hold.from, ref.hold.to]);
    assert.ok(Math.abs(h.slack - ref.hold.slack) < 0.15, `${h.slack} against trce's ${ref.hold.slack}`);
    // the path's last step: the end's hold margin (here a LUT at its earliest less the flip-flop's hold time, or BX's)
    assert.equal(h.path.at(-1).kind, 'hold');
  });
}

test('#2226 a hold violation reported: NOT MET, the path from the clock-to-out at its earliest', () => {
  const { design } = load('blinky-hold-violation');
  const r = analyzeTiming(design, device);
  const lines = timingReport(r);
  const at = lines.findIndex(l => /^hold/.test(l));
  assert.equal(lines[at], 'hold, clock $iopadmap$clk: NOT MET, worst slack -0.547 ns (the shortest path at its earliest; with the clock\'s skew)');
  // the launch: minLogic x the clock-to-out, plus the source's clock skew (on the global lines: none)
  const [h] = r.pads.hold, first = h.path[0];
  assert.equal(first.kind, 'clock-to-out');
  assert.ok([SPEED_4.slice.TckoX, SPEED_4.slice.TckoY].flat().some(t => Math.abs(first.delay - SPEED_4.clock.minLogic * t) < 1e-9), String(first.delay));
});
