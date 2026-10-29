// The Board Emulator's VGA monitor (core/vga.js, core/compiled-sim.js VGA_CODE, #420): the picture a design
// scans out (test/fixtures/compiled-sim/vga_bars.vhd: colour bars, a square the switches move) against the
// one computed here from its definition, whole frames, whatever its sync polarity or pixel clock; the
// measured timing and the exact warnings of wrong timings; "No signal"; the connector's widths and palette.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './examples-lib.mjs';
import { designOf } from './compiled-diff.js';
import { parseUcf } from '../packages/silinx-fpga/src/ucf.js';
import { resolveBoard } from '../server/devices.js';
import { boardWiring, emulatorClocks } from '../core/emulate.js';
import { netlistOf } from '../core/compiled-sim.js';
import { CompiledBoard } from '../core/emulate-compiled.js';
import { vgaPins, vgaPalette, vgaPixels } from '../core/vga.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';

const BARS = fs.readFileSync(path.join(ROOT, 'test/fixtures/compiled-sim/vga_bars.vhd'), 'utf8');
const boardOf = (id) => { const r = resolveBoard(id); return { id, name: r.board.name, device: r.device, resources: r.resources }; };
const ucfPort = (p) => { const t = p.sig.t, bus = t.w > 1 || (t.kind === 'logic' && !t.scalar); return { name: p.name, dir: p.dir, width: t.w, msb: bus ? t.left : null, lsb: bus ? t.right : null }; };
// the Basys2's VGA connector and switches (RED0..2, GRN0..2, BLU1..2)
const UCF = `NET "clk" LOC = "B8"; NET "hsync" LOC = "J14"; NET "vsync" LOC = "K13";
NET "red<0>" LOC = "C14"; NET "red<1>" LOC = "D13"; NET "red<2>" LOC = "F13";
NET "green<0>" LOC = "F14"; NET "green<1>" LOC = "G13"; NET "green<2>" LOC = "G14";
NET "blue<0>" LOC = "H13"; NET "blue<1>" LOC = "J13";
NET "sw<0>" LOC = "P11"; NET "sw<1>" LOC = "L3"; NET "sw<2>" LOC = "K3"; NET "sw<3>" LOC = "B4";
NET "sw<4>" LOC = "G3"; NET "sw<5>" LOC = "F3"; NET "sw<6>" LOC = "E2"; NET "sw<7>" LOC = "N3";`;
const FRAME = 525 * 800 * 2;   // the cycles of a frame at 50 MHz, a pixel every 2 cycles

async function monitor({ text = BARS, top = 'vga_bars', generics, ucf = UCF, board = boardOf('basys2') } = {}) {
  const design = designOf([{ path: `${top}.vhd`, lang: 'vhdl', role: 'design', text }], top, { generics });
  const { json, top: ntop } = await netlistOf(design, { run: yosysNode });
  const wiring = boardWiring({ ports: design.top.ports, assignments: parseUcf(ucf, { ports: design.top.ports.map(ucfPort) }).assignments, board });
  wiring.clocks = emulatorClocks(wiring, design.top.ports);
  const cb = new CompiledBoard({ json, top: ntop, design, wiring, clock: 'clk', period: wiring.clocks[0].period, board });
  return { cb, design, set: (name, v) => cb.force(design.top.ports.find((p) => p.name === name).sig, { v: BigInt(v), x: 0n }) };
}
// the picture vga_bars defines: its rgb bits' value at each pixel (red, then green, then blue)
function bars(sq) {
  const fb = new Uint16Array(640 * 480);
  for (let y = 0; y < 480; y++) for (let x = 0; x < 640; x++) {
    const b = x >= sq && x < sq + 32 && y >= 200 && y < 232 ? 3 : 0;
    fb[y * 640 + x] = Math.floor(x / 80) | Math.floor(y / 60) << 3 | b << 6;
  }
  return fb;
}
const differences = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };

test('the picture: colour bars and the square, whole frames as the design scans them; the switches move the square', async () => {
  const m = await monitor();
  m.cb.run(3 * FRAME * 20000);
  let v = m.cb.vga();
  assert.equal(differences(v.fb, bars(0)), 0);
  assert.deepEqual({ ...v.status, lineUs: Math.round(v.status.lineUs * 1000) / 1000, frameHz: Math.round(v.status.frameHz * 100) / 100, lines: Math.round(v.status.lines * 10) / 10 },
    { signal: true, frames: 2, lineUs: 32, hsyncUs: 3.84, hsyncLow: true, frameHz: 59.52, lines: 525, vsyncLines: 2, vsyncLow: true, warnings: [], summary: '59.52 Hz · line 32.00 µs · 525 lines' });
  m.set('sw', 10);
  m.cb.run(m.cb.now + 2 * FRAME * 20000);
  v = m.cb.vga();
  assert.equal(differences(v.fb, bars(80)), 0, 'the square at column 80');
  // its colours: the Basys2's 3-3-2 bits
  const px = vgaPixels(v.fb, v.palette);
  assert.equal(px[0], 0xFF000000, 'black at (0, 0): red 0, green 0');
  assert.equal(px[479 * 640 + 639], 0xFF00FFFF, 'red 7, green 7 at the bottom right: yellow');
  assert.equal((px[210 * 640 + 90] >>> 16) & 0xFF, 0xFF, 'the square: blue 3 (full blue), over red 1 and green 3');
});

test('active-high sync pulses: the same picture, a warning for each', async () => {
  const m = await monitor({ generics: { ACTIVE_HIGH: 1 } });
  m.cb.run(3 * FRAME * 20000);
  const v = m.cb.vga();
  assert.equal(differences(v.fb, bars(0)), 0);
  assert.deepEqual(v.status.warnings, ['HSYNC active high: 640×480 at 60 Hz has it active low', 'VSYNC active high: 640×480 at 60 Hz has it active low']);
});

test('a pixel every cycle (50 MHz): the picture still drawn, the line period, the pulse and the frame rate wrong', async () => {
  const m = await monitor({ generics: { DIV: 1 } });
  m.cb.run(3 * FRAME * 10000);
  const v = m.cb.vga();
  assert.equal(differences(v.fb, bars(0)), 0);
  assert.deepEqual(v.status.warnings, [
    'HSYNC every 16.00 µs (62.50 kHz): 31.8 µs (31.5 kHz) expected for 640×480 at 60 Hz',
    'HSYNC pulse of 1.92 µs: 3.8 µs (96 pixels) expected',
    '119.05 Hz: 60 Hz expected',
  ]);
});

test('the wrong lines a frame, a short HSYNC pulse: their warnings', async () => {
  let m = await monitor({ generics: { V_BACK: 23 } });
  m.cb.run(3 * FRAME * 20000);
  assert.deepEqual(m.cb.vga().status.warnings, ['515.0 lines a frame: 525 expected']);
  m = await monitor({ generics: { H_SYNC: 64, H_BACK: 80 } });
  m.cb.run(3 * FRAME * 20000);
  assert.deepEqual(m.cb.vga().status.warnings, ['HSYNC pulse of 2.56 µs: 3.8 µs (96 pixels) expected']);
  assert.equal(differences(m.cb.vga().fb, bars(0)), 0, 'the picture where it was: 144 pixels after the pulse');
});

test('no sync pulses: "No signal"; HSYNC alone: no VSYNC', async () => {
  const flat = `library ieee; use ieee.std_logic_1164.all;
entity flat is port (clk : in std_logic; sw : in std_logic_vector(7 downto 0); hsync, vsync : out std_logic;
  red, green : out std_logic_vector(2 downto 0); blue : out std_logic_vector(1 downto 0)); end flat;
architecture r of flat is begin hsync <= '1'; vsync <= '1'; red <= sw(2 downto 0); green <= "000"; blue <= "00"; end r;`;
  let m = await monitor({ text: flat, top: 'flat' });
  m.cb.run(FRAME * 20000);
  assert.deepEqual(m.cb.vga().status, { signal: false });
  // vga_bars with its VSYNC never active (V_SYNC = 0)
  m = await monitor({ generics: { V_SYNC: 0, V_BACK: 35 } });
  m.cb.run(2 * FRAME * 20000);
  const s = m.cb.vga().status;
  assert.equal(s.signal, true);
  assert.deepEqual(s.warnings, ['No VSYNC: the monitor finds no frames']);
  assert.equal(s.summary, 'line 32.00 µs · no VSYNC');
  // after a power cycle, before a line is measured: no signal
  m.cb.reset();
  assert.deepEqual(m.cb.vga().status, { signal: false });
});

test('the VGA connector of each board: its colour widths; the palette of its resistor ladders', () => {
  for (const [id, widths] of [['basys2', [3, 3, 2]], ['nexys2', [3, 3, 2]], ['s3e-starter', [1, 1, 1]]]) {
    const board = boardOf(id);
    const res = (name) => board.resources.find((r) => r.name === name);
    // every pin of the connector wired (as a UCF would)
    const bits = ['vga_hsync', 'vga_vsync', 'vga_red', 'vga_green', 'vga_blue'].flatMap((name) => res(name).pins.map((pin, idx) => ({ res: res(name), idx, dir: 'out', port: name, pos: idx })));
    const p = vgaPins({ bits }, board);
    assert.deepEqual(p.widths, widths, id);
  }
  const pal = vgaPalette([3, 3, 2]);
  assert.equal(pal.length, 256);
  assert.deepEqual([pal[0], pal[7], pal[7 << 3], pal[3 << 6], pal[255]], [0xFF000000, 0xFF0000FF, 0xFF00FF00, 0xFFFF0000, 0xFFFFFFFF]);
  assert.equal(pal[3], 0xFF00006D, 'red 3 of 7: 109');
  assert.deepEqual([...vgaPalette([1, 1, 1])], [0xFF000000, 0xFF0000FF, 0xFF00FF00, 0xFF00FFFF, 0xFFFF0000, 0xFFFF00FF, 0xFFFFFF00, 0xFFFFFFFF]);
  // a board without the connector wired: no monitor
  assert.equal(vgaPins({ bits: [] }, boardOf('basys2')), null);
});
