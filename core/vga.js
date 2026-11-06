// Silinx - the Board Emulator's VGA monitor (#420, part 3 of #102): the board's VGA connector in the UCF
// wiring, the palette of its resistor ladders, and what the monitor measured (core/compiled-sim.js
// VGA_CODE, run by the compiled engine) against the 640x480 at 60 Hz mode: the line and frame periods,
// the lines a frame, the sync pulses' widths and polarities.
//
// Isomorphic ES module (browser + Node), no DOM.
import { VGA_STATE } from './compiled-sim.js';

/** The 640x480 at 60 Hz mode (VESA / the IBM VGA): its pixel clock 25.175 MHz (25 MHz on the boards). */
const VGA_MODE = { width: 640, height: 480, lineUs: 31.778, frameHz: 59.94, lines: 525, hsyncUs: 3.813, vsyncLines: 2 };

/**
 * The VGA connector's port bits (boardWiring's): { hs, vs, red: [b], green: [b], blue: [b], widths: [r, g, b] }, the
 * colours least significant bit first (a pin not in the UCF: null, as 0), their widths those of the board's
 * resources (3, 3, 2 on the Basys2 and the Nexys2, 1, 1, 1 on the Starter Kit); null without HSYNC and VSYNC.
 */
export function vgaPins(wiring, board) {
  const out = (name, idx = 0) => wiring.bits.find((b) => b.res.name === name && b.idx === idx && b.dir !== 'in') || null;
  const hs = out('vga_hsync'), vs = out('vga_vsync');
  if (!hs || !vs) return null;
  const width = (name) => (board?.resources || []).find((r) => r.name === name)?.pins.length
    ?? Math.max(1, ...wiring.bits.filter((b) => b.res.name === name).map((b) => b.idx + 1));
  const colour = (name) => Array.from({ length: width(name) }, (_, i) => out(name, i));
  const red = colour('vga_red'), green = colour('vga_green'), blue = colour('vga_blue');
  return { hs, vs, red, green, blue, widths: [red.length, green.length, blue.length] };
}

/** The colours of the rgb bits' values (red, then green, then blue, least significant first): RGBA, as ImageData's 32-bit words. */
export function vgaPalette([wr, wg, wb]) {
  const n = 1 << (wr + wg + wb);
  const pal = new Uint32Array(n);
  const level = (v, w) => (w ? Math.round((v * 255) / ((1 << w) - 1)) : 0);
  for (let i = 0; i < n; i++) {
    const r = level(i & ((1 << wr) - 1), wr), g = level((i >> wr) & ((1 << wg) - 1), wg), b = level((i >> (wr + wg)) & ((1 << wb) - 1), wb);
    pal[i] = (0xFF << 24 | b << 16 | g << 8 | r) >>> 0;   // (little-endian bytes: R, G, B, A)
  }
  return pal;
}

const fmt = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toFixed(d);

/**
 * What the monitor shows of the signal it measured (state: VGA_CODE's VG, period: the cycle in ps):
 * { signal: false } (no sync pulses, or they stopped: "No signal"), or { signal: true, frames, lineUs,
 * frameHz, lines, hsyncUs, vsyncLines, hsyncLow, vsyncLow, summary, warnings: [what is not 640x480 at 60 Hz] }.
 */
export function vgaStatus(state, period) {
  const g = Object.fromEntries(VGA_STATE.map((k, i) => [k, state[i]]));
  const us = (cycles) => (cycles * period) / 1e6;
  // (no line, or none for 100 µs: the design stopped its HSYNC)
  if (!(g.L > 0) || us(g.ct - g.lead) > 100) return { signal: false };
  const lineUs = us(g.L);
  const r = { signal: true, frames: g.frames, lineUs, hsyncUs: g.hsw > 0 ? us(g.hsw) : null, hsyncLow: !(g.hhi > 0 && g.hlo > 0 && g.hhi < g.hlo) };
  const vOn = g.fp > 0 && us(g.ct - g.vlead) <= 100000;   // (VSYNC: a frame measured, the last one within 100 ms)
  if (vOn) Object.assign(r, { frameHz: 1e6 / us(g.fp), lines: g.fp / g.L, vsyncLines: g.vsw > 0 ? g.vsw : null, vsyncLow: !(g.vhi > 0 && g.vlo > 0 && g.vhi < g.vlo) });
  const w = [];
  const off = (x, want, tol) => Math.abs(x - want) > want * tol;
  if (off(lineUs, VGA_MODE.lineUs, 0.02)) w.push(`HSYNC every ${fmt(lineUs, 2)} µs (${fmt(1000 / lineUs, 2)} kHz): ${VGA_MODE.lineUs.toFixed(1)} µs (31.5 kHz) expected for 640×480 at 60 Hz`);
  if (r.hsyncUs != null && off(r.hsyncUs, VGA_MODE.hsyncUs, 0.25)) w.push(`HSYNC pulse of ${fmt(r.hsyncUs, 2)} µs: 3.8 µs (96 pixels) expected`);
  if (!r.hsyncLow) w.push('HSYNC active high: 640×480 at 60 Hz has it active low');
  // (no VSYNC once 100 ms of the design ran with no frame: not while the first frames are still on their way, #2898)
  if (!vOn) { if (g.fp > 0 || us(g.ct) > 100000) w.push('No VSYNC: the monitor finds no frames'); }
  else {
    if (Math.abs(r.lines - VGA_MODE.lines) > 0.5) w.push(`${fmt(r.lines, 1)} lines a frame: ${VGA_MODE.lines} expected`);
    else if (off(r.frameHz, VGA_MODE.frameHz, 0.02)) w.push(`${fmt(r.frameHz, 2)} Hz: 60 Hz expected`);
    if (r.vsyncLines != null && (r.vsyncLines < 1.5 || r.vsyncLines > 2.5)) w.push(`VSYNC pulse of ${fmt(r.vsyncLines, 1)} lines: 2 expected`);
    if (!r.vsyncLow) w.push('VSYNC active high: 640×480 at 60 Hz has it active low');
  }
  r.warnings = w;
  r.summary = vOn ? `${fmt(r.frameHz, 2)} Hz · line ${fmt(lineUs, 2)} µs · ${Math.round(r.lines)} lines` : `line ${fmt(lineUs, 2)} µs · no VSYNC`;
  return r;
}

/** The picture (FB: the rgb bits' value of each pixel) as RGBA words, in `out` (a Uint32Array of 640 x 480). */
export function vgaPixels(fb, palette, out = new Uint32Array(fb.length)) {
  const mask = palette.length - 1;
  for (let i = 0; i < fb.length; i++) out[i] = palette[fb[i] & mask];
  return out;
}
