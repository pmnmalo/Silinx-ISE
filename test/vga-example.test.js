// The vga example (examples/vga, #450) on the Board Emulator's VGA monitor (core/vga.js, #420): its whole
// frames, as the compiled engine runs the design with the UCF Silinx's board pin assignment writes, against
// the picture computed here from what the example describes (the colour bars in a white frame, the square in
// their opposite colours); 640x480 at 60 Hz with no warnings; the buttons and SW0 move the square, which stops
// at the picture's edges. On the Basys2 and the Nexys2 (their VGA connectors: 3-3-2 bits); and the same frames from
// the design's Post-Synthesis Simulation Model (its netlist of LUTs and flip-flops, #561).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { example, exampleUcf } from './examples-lib.mjs';
import { designOf } from './compiled-diff.js';
import { parseUcf } from '../packages/silinx-fpga/src/ucf.js';
import { resolveBoard } from '../server/devices.js';
import { boardWiring, emulatorClocks } from '../core/emulate.js';
import { netlistOf } from '../core/compiled-sim.js';
import { CompiledBoard } from '../core/emulate-compiled.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { synthesizeOpen } from '../core/synth-front.js';
import { postSynthesisModels } from '../core/sim-model.js';
import { scalarizeNetlist } from '../core/netlist-hier.js';

const FRAME = 525 * 800 * 2 * 20000;   // a frame in ps: 525 lines of 800 pixels, a pixel every 2 cycles of 20 ns
const ucfPort = (p) => { const t = p.sig.t, bus = t.w > 1 || (t.kind === 'logic' && !t.scalar); return { name: p.name, dir: p.dir, width: t.w, msb: bus ? t.left : null, lsb: bus ? t.right : null }; };

// (model: the Post-Synthesis Simulation Model's netlist of UNISIM primitives instead of the RTL, scalarized as
// the emulator reads it, #561)
async function emulate(target, { model = false } = {}) {
  const ex = example('vga');
  const r = resolveBoard(target.board, { variant: target.variant });
  const board = { id: target.board, name: r.board.name, device: r.device, resources: r.resources };
  let design = designOf(ex.design, ex.project.top);
  if (model) {
    const top = ex.project.top;
    const m = postSynthesisModels(await synthesizeOpen(design, { family: 'spartan3e', run: yosysNode }), { top });
    design = designOf([{ path: `${top}_synthesis.vhd`, lang: 'vhdl', role: 'design', text: scalarizeNetlist(m.vhdl) }], top);
  }
  const { json, top } = await netlistOf(design, { run: yosysNode });
  const ucf = exampleUcf('vga', target).text;
  const wiring = boardWiring({ ports: design.top.ports, assignments: parseUcf(ucf, { ports: design.top.ports.map(ucfPort) }).assignments, board });
  wiring.clocks = emulatorClocks(wiring, design.top.ports);
  const cb = new CompiledBoard({ json, top, design, wiring, clock: 'clk', period: wiring.clocks[0].period, board });
  const set = (name, v) => cb.force(design.top.ports.find((p) => p.name === name).sig, { v: BigInt(v), x: 0n });
  return { cb, set };
}

// the picture: each pixel's rgb bits' value (red, then green, then blue, as the monitor keeps them)
const BARS = [[7, 7, 3], [7, 7, 0], [0, 7, 3], [0, 7, 0], [7, 0, 3], [7, 0, 0], [0, 0, 3], [0, 0, 0]];
function picture(sx, sy) {
  const fb = new Uint16Array(640 * 480);
  for (let y = 0; y < 480; y++) for (let x = 0; x < 640; x++) {
    let [r, g, b] = BARS[Math.floor(x / 80)];
    if (x >= sx && x < sx + 32 && y >= sy && y < sy + 32) [r, g, b] = [7 - r, 7 - g, 3 - b];
    if (x === 0 || x === 639 || y === 0 || y === 479) [r, g, b] = [7, 7, 3];
    fb[y * 640 + x] = r | g << 3 | b << 6;
  }
  return fb;
}
const differences = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };
const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

for (const [target, model] of [[{ board: 'basys2', variant: '250' }, false], [{ board: 'nexys2', variant: '1200' }, false], [{ board: 'basys2', variant: '250' }, true]]) {
  test(`example vga${model ? '\'s Post-Synthesis Model (#561)' : ''} on the ${target.board}-${target.variant}'s emulator: its frames drawn, 640x480 at 60 Hz with no warnings; the buttons move the square`, { timeout: 120000 }, async () => {
    const { cb, set } = await emulate(target, { model });
    cb.run(3 * FRAME);
    let v = cb.vga();
    assert.equal(differences(v.fb, picture(304, 224)), 0, 'the bars, the frame, the square in the middle');
    const s = v.status;
    assert.deepEqual({ ...s, lineUs: round(s.lineUs, 3), hsyncUs: round(s.hsyncUs, 3), frameHz: round(s.frameHz, 2), lines: round(s.lines, 1) },
      { signal: true, frames: 2, lineUs: 32, hsyncUs: 3.84, hsyncLow: true, frameHz: 59.52, lines: 525, vsyncLines: 2, vsyncLow: true, warnings: [], summary: '59.52 Hz · line 32.00 µs · 525 lines' });
    // its colours: white, then yellow, at the top left; the square magenta over the green bar
    assert.equal(v.palette[v.fb[1 * 640 + 1]], 0xFFFFFFFF);
    assert.equal(v.palette[v.fb[100 * 640 + 120]], 0xFF00FFFF);
    assert.equal(v.palette[v.fb[240 * 640 + 310]], 0xFFFF00FF);
    // BTN0 (right) held for two frames: two pixels; then BTN1 (down) with SW0 on: four a frame
    set('btn', 0b0001);
    cb.run(cb.now + 2 * FRAME);
    set('btn', 0);
    cb.run(cb.now + 2 * FRAME);
    assert.equal(differences(cb.vga().fb, picture(306, 224)), 0, 'BTN0: two pixels right');
    set('sw', 1);
    set('btn', 0b0010);
    cb.run(cb.now + 3 * FRAME);
    set('btn', 0);
    cb.run(cb.now + 2 * FRAME);
    assert.equal(differences(cb.vga().fb, picture(306, 236)), 0, 'BTN1 with SW0: twelve pixels down');
    // BTN3 and BTN2 (left, up) held: to the top left corner, where the square stops (under the white frame there)
    set('btn', 0b1100);
    cb.run(cb.now + 80 * FRAME);
    set('btn', 0);
    cb.run(cb.now + 2 * FRAME);
    v = cb.vga();
    assert.equal(differences(v.fb, picture(0, 0)), 0, 'BTN3 and BTN2: at (0, 0)');
    assert.deepEqual(v.status.warnings, []);
  });
}
