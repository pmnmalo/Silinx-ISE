// The Board Emulator's two engines side by side, as web/js/emulator.js drives its engine (test/compiled-emulate.test.js,
// test/emulate-boards.test.js): the event-driven simulator's waveforms through core/emulate.js boardOutputs and lcdFeed, the
// compiled cycle simulator's counts (core/emulate-compiled.js), window by window on the same inputs.
import { designOf } from './compiled-diff.js';
import { Simulator } from '../core/simulator.js';
import * as V from '../core/values.js';
import { resolveBoard } from '../server/devices.js';
import { boardWiring, boardOutputs, emulatorClocks, lcdState, lcdFeed, lcdText } from '../core/emulate.js';
import { netlistOf } from '../core/compiled-sim.js';
import { CompiledBoard } from '../core/emulate-compiled.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';

export const boardOf = (id, variant) => { const r = resolveBoard(id, { variant }); return { name: r.board.name, device: r.device, resources: r.resources }; };
export const ucfPort = (p) => { const t = p.sig.t, bus = t.w > 1 || (t.kind === 'logic' && !t.scalar); return { name: p.name, dir: p.dir, width: t.w, msb: bus ? t.left : null, lsb: bus ? t.right : null }; };
const allX = (v) => v && !Array.isArray(v) && v.w > 0 && v.x === (1n << BigInt(v.w)) - 1n;
export function powerUpZero(design) {
  for (const s of design.signals) {
    if (Array.isArray(s.val)) { if (s.val.some(allX)) s.val = s.val.map((e) => (allX(e) ? V.fromInt(0, e.w, false) : e)); } else if (allX(s.val)) s.val = V.fromInt(0, s.val.w, false);
  }
}

/** The two engines on `board`, wired by `assignments` (a function of the design's ports, or the pins): { design, cdesign, wiring, cw, period, ev, cb, force, window }. */
export async function engines({ sources, top, generics, assignments: pins, board }) {
  const design = designOf(sources, top, { generics });
  const assignments = typeof pins === 'function' ? pins(design.top.ports.map(ucfPort)) : pins;
  const wiring = boardWiring({ ports: design.top.ports, assignments, board });
  wiring.clocks = emulatorClocks(wiring, design.top.ports);
  const period = wiring.clocks[0]?.period || 20000;
  // the event-driven simulator, as the emulator runs it
  const ev = new Simulator(design, { maxWaveEvents: 1e9 });
  powerUpZero(design);
  for (const s of design.signals) s.wave = null;
  for (const c of wiring.clocks) ev.addClock(c.sig, { period: c.period });
  ev.run(0);
  // the compiled one
  const cdesign = designOf(sources, top, { generics });
  const { json, top: ntop } = await netlistOf(cdesign, { run: yosysNode });
  const cw = boardWiring({ ports: cdesign.top.ports, assignments, board });
  cw.clocks = emulatorClocks(cw, cdesign.top.ports);
  const cb = new CompiledBoard({ json, top: ntop, design: cdesign, wiring: cw, clock: cw.clocks[0]?.port || null, period });
  const outs = new Set(wiring.bits.filter((b) => b.dir !== 'in').map((b) => b.sig));
  const state = { ev: { prev: null, lcd: lcdState() }, cb: { prev: null, lcd: lcdState() } };
  return {
    design, cdesign, wiring, cw, period, ev, cb,
    force(name, value) {
      const p = design.top.ports.find((x) => x.name === name), q = cdesign.top.ports.find((x) => x.name === name);
      ev.force(p.sig, V.fromInt(value, p.sig.t.w, false));
      cb.force(q.sig, V.fromInt(value, q.sig.t.w, false));
    },
    window(n) {
      const t0 = ev.now;
      for (const s of outs) s.wave = { t: [ev.now], v: [s.val] };
      ev.run(ev.now + n * period);
      state.ev.prev = boardOutputs(wiring, t0, Math.max(ev.now, t0 + 1), state.ev.prev);
      lcdFeed(state.ev.lcd, wiring, t0, ev.now);
      const c0 = cb.now;
      cb.run(cb.now + n * period);
      state.cb.prev = cb.outputs(c0, Math.max(cb.now, c0 + 1), state.cb.prev);
      cb.lcd(state.cb.lcd);
      return state;
    },
  };
}
// the LCD's two lines (lcdText gives their character codes)
export const lcdLines = (st) => (lcdText(st) || []).map((row) => String.fromCharCode(...row).trimEnd());
export const round = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'number' ? Math.round(v * 1e9) / 1e9 : v)));
export const shown = (st) => round({ leds: st.prev.leds, digits: st.prev.digits, lcd: lcdLines(st.lcd) });
