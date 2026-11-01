// Silinx - Board Emulator: the design running on a virtual board. Switches and buttons drive the input
// ports, LEDs and 7-segment displays show the outputs, following the pin assignments of the UCF and the
// resources of the project's board. Two engines (#418): the compiled cycle simulator (core/emulate-compiled.js:
// the design's netlist as JavaScript, at the board's real speed) when the design compiles, else (or when
// chosen, to debug: X values, the design's messages) the event-driven simulator of the behavioural RTL.
// The compiled engine runs in a Web Worker of its own (#427: core/emulate-remote.js), the event-driven one on
// the page's thread, in frame budgets.
import { Simulator } from '/core/simulator.js';
import { CompiledBoard } from '/core/emulate-compiled.js';
import { RemoteBoard, hostBoard } from '/core/emulate-remote.js';
import * as V from '/core/values.js';
import { formatTime } from '/core/interp.js';
import { boardWiring, boardOutputs, lcdState, lcdFeed, emulatorClocks, manualClocks } from '/core/emulate.js';
import { h } from './dom.js';
import { mountBoardParts } from './emulator-board.js';
import { mountEmuSide } from './emulator-side.js';
import { mountEmuPaint } from './emulator-paint.js';
import { mountEmuToolbar } from './emulator-toolbar.js';
import { emuPrintView } from './emulator-print.js';
import { prefKey } from './prefs.js';

export const SPEEDS = [['real', 'Real time'], ['max', 'Max speed'], [1e5, '100 kHz'], [1e4, '10 kHz'], [1e3, '1 kHz'], [100, '100 Hz'], [10, '10 Hz'], [1, '1 Hz']];
const FRAME_BUDGET_MS = 14;
// what the emulator does while it is not seen (another browser tab, a minimised window, another document tab,
// #719): 'pause' (the default: it goes on where it was when shown again) or 'run' (it simulates on, drawing nothing)
export const HIDDEN_KEY = prefKey('silinx.emulator.hidden');
const hiddenPref = () => { try { return localStorage.getItem(HIDDEN_KEY) === 'run' ? 'run' : 'pause'; } catch { return 'pause'; } };

const SVG = (tag, attrs = {}) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

let styled = false;
function injectStyle() {
  if (styled) return;
  styled = true;
  document.head.append(h('style', {}, `
.emu { display: flex; flex-direction: column; height: 100%; background: var(--bg, #f0f0f0); font: 12px var(--font, system-ui); overflow: auto; }
.emu-bar { flex: none; display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 1px solid var(--border, #aaa); background: var(--panel-alt, #f7f7f7); flex-wrap: wrap; }
.emu-bar .sep { width: 1px; height: 20px; background: var(--frame); margin: 0 4px; }
.emu-bar .stat { margin-left: auto; color: var(--grey-3); font-family: var(--mono, monospace); font-variant-numeric: tabular-nums;
  flex: 1 1 0; min-width: min(100%, 84ch); text-align: right; }   /* (the whole line, t = … ns · … cycles · … kHz (…% of real time): a row of its own when the controls leave it no room, two lines on a window too narrow for one, never cut, #918) */
.emu-main { display: flex; gap: 12px; padding: 12px; flex-wrap: wrap; align-items: flex-start; }
.emu-board { background: linear-gradient(#25603d, #1d4f32); border-radius: 10px; padding: 14px 18px 12px; color: #e9f3ea; box-shadow: 0 2px 8px #0005; min-width: 520px; }
.emu-board h3 { margin: 0 0 10px; font-size: 13px; letter-spacing: .04em; color: #fff; font-weight: 600; }
.emu-row { display: flex; gap: 10px; align-items: flex-end; margin: 10px 0; flex-wrap: wrap; }
.emu-cell { display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 46px; }
.emu-cell .res { font: bold 10px var(--mono, monospace); color: #fff; }
.emu-cell .port { font: 10px var(--mono, monospace); color: #bfe3c6; max-width: 70px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.emu-cell.nc .port { color: #8fb39a; font-style: italic; }
.emu-led { width: 16px; height: 16px; border-radius: 50%; border: 1px solid #0b2; background: #1b3a23; }
.emu-sw { width: 20px; height: 38px; border-radius: 4px; background: #222; position: relative; cursor: pointer; border: 1px solid #000; }
.emu-sw::after { content: ''; position: absolute; left: 2px; right: 2px; height: 16px; bottom: 2px; background: #ddd; border-radius: 3px; transition: bottom .08s; }
.emu-sw.on::after { bottom: 18px; background: #fff; }
.emu-btn { width: 30px; height: 30px; border-radius: 50%; background: radial-gradient(#555, #111); border: 2px solid #999; cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: none; }
.emu-btn.on { background: radial-gradient(#d33, #600); border-color: #fcc; }
.emu-cell.nc .emu-sw, .emu-cell.nc .emu-btn { opacity: .45; }
.emu-disp { background: #111; border-radius: 6px; padding: 8px 10px; display: flex; gap: 6px; }
.emu-side { flex: 1; min-width: 260px; display: flex; flex-direction: column; gap: 10px; }
.emu-box { background: var(--panel, #fff); border: 1px solid var(--border, #aaa); border-radius: 4px; padding: 8px; }
.emu-box h4 { margin: 0 0 6px; font-size: 12px; }
.emu-box table { border-collapse: collapse; width: 100%; font-family: var(--mono, monospace); table-layout: fixed; font-variant-numeric: tabular-nums; }
.emu-box td { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.emu-box td { padding: 2px 4px; border-bottom: 1px solid var(--frame-lighter); }
.emu-log { font-family: var(--mono, monospace); max-height: 140px; overflow: auto; white-space: pre-wrap; color: var(--grey-1); }
.emu-log .error { color: var(--log-error); } .emu-log .warning { color: var(--log-warning); }
.emu-hint { color: var(--grey-4); }
.emu-board-wrap { display: flex; flex-direction: column; gap: 6px; -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
.emu-board-note { color: var(--grey-3); font-size: 11px; }
.emu-pcb { position: relative; flex: none; }
.emu-pcb-art { position: absolute; left: 0; top: 0; }
.emu-at { position: absolute; transform: translateX(-50%); display: flex; justify-content: center; }
.emu-silk { color: #e8edf7; font: bold 10px Arial, sans-serif; white-space: nowrap; }
/* the power switch (a slide switch, ON to the right) and its LED */
.emu-power { display: flex; align-items: center; gap: 5px; cursor: pointer; user-select: none; }
.emu-power-sw { width: 34px; height: 14px; border-radius: 2px; background: #111; border: 1px solid #000; position: relative; }
.emu-power-sw::after { content: ''; position: absolute; top: 1px; bottom: 1px; left: 2px; width: 14px; background: #ddd; border-radius: 1px; transition: left .08s; }
.emu-power.on .emu-power-sw::after { left: 16px; background: #fff; }
.emu-power-led { width: 7px; height: 7px; border-radius: 50%; background: #4a1414; border: 1px solid #200; }
.emu-power.on .emu-power-led { background: #ff3b30; box-shadow: 0 0 5px #ff3b30; }
.emu-power:focus-visible { outline: 2px solid #9cf; outline-offset: 2px; }
.emu.off .emu-pcb { filter: saturate(.85) brightness(.92); }
.emu-port { color: #ffcf66; font: 9px var(--mono, monospace); white-space: nowrap; max-width: 50px; overflow: hidden; text-overflow: ellipsis; }
.emu-port.nc { color: #8090bb; }
.b2-led { width: 16px; height: 10px; border-radius: 2px; border: 1px solid #0a0a0a; background: #1b3a23; }
.b2-sw { width: 22px; height: 44px; border-radius: 3px; background: #111; border: 1px solid #000; position: relative; cursor: pointer; }
.b2-sw::after { content: ''; position: absolute; left: 3px; right: 3px; height: 17px; bottom: 3px; background: #e6e6e6; border-radius: 2px; transition: bottom .08s; }
.b2-sw.on::after { bottom: 22px; background: #fff; }
.b2-btn { width: 32px; height: 32px; border-radius: 4px; background: #1a1a1a; border: 1px solid #000; position: relative; cursor: pointer; user-select: none; box-shadow: 0 2px 0 #000; }
.b2-btn::after { content: ''; position: absolute; left: 6px; top: 6px; width: 20px; height: 20px; border-radius: 50%; background: radial-gradient(#5a5a5a, #222); }
.b2-btn.on { box-shadow: none; transform: translateY(1px); }
.b2-btn.on::after { background: radial-gradient(#d33, #700); }
.nx2-btn { width: 30px; height: 30px; border-radius: 50%; background: radial-gradient(#555, #151515); border: 2px solid #8a8a8a; cursor: pointer; user-select: none; }
.nx2-btn.on { background: radial-gradient(#d33, #700); border-color: #fcc; }
.s3e-knob { width: 34px; height: 34px; border-radius: 50%; background: radial-gradient(#666, #1c1c1c); border: 2px solid #777; cursor: pointer; user-select: none; }
.s3e-knob.on { background: radial-gradient(#d33, #700); }
.emu-lcd { position: relative; width: 248px; height: 44px; }
.emu-lcd-cell { position: absolute; color: #1c2a08; font: bold 15px/19px var(--mono, monospace); text-align: center; overflow: hidden; }
.emu-rot { display: flex; gap: 46px; }
.emu-rot-btn { width: 24px; height: 24px; border-radius: 50%; border: 1px solid #000; background: #2a2a2a; color: #eee; cursor: pointer; font-size: 14px; line-height: 20px; padding: 0; }
.emu-rot-btn:active { background: #c22; }
/* the VGA monitor (#420) */
.emu-vga { flex: none; }
.emu-vga-frame { position: relative; width: 480px; max-width: 100%; aspect-ratio: 4 / 3; background: #000; border: 6px solid #2b2b2b; border-radius: 6px; }
.emu-vga-frame canvas { display: block; width: 100%; height: 100%; }
.emu-vga-nosig { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center; padding: 12px; color: #c8c8c8; font-size: 14px; }
.emu-vga-nosig[hidden] { display: none; }   /* (its display: flex would show it hidden too, #453) */
.emu-vga-stat { margin-top: 4px; font-family: var(--mono, monospace); color: var(--grey-3); }
.emu-vga-warn { color: var(--log-warning); }
`));
}

// 7-segment digit (a..g + dp), brightness per segment
const SEG_PATHS = [
  'M8,4 L32,4 L28,9 L12,9 Z',        // a
  'M33,6 L33,30 L28,26 L28,10 Z',     // b
  'M33,34 L33,58 L28,54 L28,38 Z',    // c
  'M8,60 L32,60 L28,55 L12,55 Z',     // d
  'M7,34 L7,58 L12,54 L12,38 Z',      // e
  'M7,6 L7,30 L12,26 L12,10 Z',       // f
  'M9,32 L13,28 L27,28 L31,32 L27,36 L13,36 Z', // g
];
export function makeDigit() {
  const s = SVG('svg', { viewBox: '0 0 44 64', width: 36, height: 54 });
  const segs = SEG_PATHS.map((d) => { const p = SVG('path', { d, fill: '#ff2a1a', opacity: 0.08 }); s.append(p); return p; });
  const dp = SVG('circle', { cx: 39, cy: 58, r: 3.2, fill: '#ff2a1a', opacity: 0.08 });
  s.append(dp);
  // (its segments written only when what it shows changed, #719)
  let shown = '';
  return { el: s, set(d) {
    const key = d ? `${d.seg.map((x) => Math.round(100 * x)).join()},${Math.round(100 * d.dp)}` : '';
    if (key === shown) return;
    shown = key;
    segs.forEach((p, j) => p.setAttribute('opacity', d ? 0.08 + 0.92 * d.seg[j] : 0.08)); dp.setAttribute('opacity', d ? 0.08 + 0.92 * d.dp : 0.08);
  } };
}

export { BOARD_LAYOUTS } from './emulator-layouts.js';

// Yosys for the compiled engine (core/compiled-sim.js netlistOf): the page's workers (the local server), or,
// in the browser edition, a worker of its own started from the site's assets (as the flow worker starts its)
let siteYosys = null;
/** run(args, files, onLine) -> Yosys's output files, for netlistOf. standalone: the browser edition. */
export async function emulatorYosys(standalone) {
  if (!standalone) return (await import('./yosys-client.js')).yosysBrowser;
  if (!siteYosys) {
    const [{ yosysPool }, { yosysBundleUrl }, { yosysWorkerSource }, { assetFetchSource }] = await Promise.all([import('./yosys-client.js'), import('./open-flow-browser.js'), import('/packages/silinx-fpga/src/index.js'), import('./asset-cache.js')]);
    const bundle = yosysBundleUrl();
    // (Yosys from the browser's Cache Storage, #967)
    const url = URL.createObjectURL(new Blob([assetFetchSource() + yosysWorkerSource(bundle)], { type: 'text/javascript' }));
    siteYosys = yosysPool({ spawn: () => new Worker(url), workers: 1 });   // (a classic worker: from file:// too, #512)
  }
  return siteYosys;
}

// the compiled engine's worker (#427): started from its file (the local server) or, in the single-file
// edition, from its embedded text (a Blob, a classic worker: a file:// page cannot start a module one, #512);
// on the page's thread (a MessageChannel) when no worker starts, or with SILINX_EMU_IN_PAGE (to compare the two)
let emuWorkerUrl = null;
const liveWorkers = new Set();
/** The emulator's workers running (a closed emulator terminates its own). */
export const emulatorWorkers = () => liveWorkers.size;
function compiledHost() {
  if (!globalThis.SILINX_EMU_IN_PAGE && typeof Worker === 'function') {
    try {
      const src = globalThis.SILINX_EMU_WORKER_SRC;
      if (src) emuWorkerUrl ??= URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const w = src ? new Worker(emuWorkerUrl) : new Worker('/js/emulator-worker.js', { type: 'module' });
      liveWorkers.add(w);
      return { port: w, worker: true, close: () => { w.terminate(); liveWorkers.delete(w); } };
    } catch { /* (no worker: on the page's thread) */ }
  }
  const { port1, port2 } = new MessageChannel();
  hostBoard(port2);
  return { port: port1, worker: false, close: () => { port1.close(); port2.close(); } };
}

/**
 * Mount the emulator.
 * @param {HTMLElement} container
 * @param {{ design, board, assignments, title?, files?, onOpenSource? }} opts
 *   engine: { netlist: { json, top } (netlistOf: the compiled engine) | null, reason: why not, auto: why the event-driven
 *     engine by default (a slow device, #952), onChange(engine) }
 */
export function mountEmulator(container, { design, board, assignments, title = '', files, timing = null, model = null, engine = null }) {
  injectStyle();
  const wiring = boardWiring({ ports: design.top.ports, assignments, board });
  const inputPorts = design.top.ports.filter((p) => p.dir === 'in');
  const outputSigs = new Set(wiring.bits.filter((b) => b.dir !== 'in').map((b) => b.sig));
  const clockSigs = new Set(wiring.clocks.map((c) => c.sig));
  // a clock port that is not on a board clock pin: named clk*, driven at 50 MHz, unless it is on a button or a
  // switch (a manual clock, #347)
  wiring.clocks = emulatorClocks(wiring, design.top.ports);
  const manual = manualClocks(wiring);
  const period = wiring.clocks[0]?.period || 20000;
  // the engine: the compiled cycle simulator when the design was compiled (engine.netlist: core/compiled-sim.js
  // netlistOf's), else the event-driven one; engineNote: why not compiled
  // (compiled on the page, which reports what cannot be; run by the worker: the RemoteBoard)
  const hasLcd = wiring.bits.some((b) => b.res.name === 'lcd_e');
  let compiled = null, host = null, engineNote = engine?.reason || null;
  if (engine?.netlist && wiring.clocks.length > 1) engineNote = `more than one clock on the board (${wiring.clocks.map((c) => c.port).join(', ')})`;
  else if (engine?.netlist) {
    try {
      const local = new CompiledBoard({ json: engine.netlist.json, top: engine.netlist.top, design, wiring, clock: wiring.clocks[0]?.port || null, period, board });
      host = compiledHost();
      compiled = new RemoteBoard(host.port, local, { design, wiring, board, hasLcd, close: host.close });
    } catch (e) { engineNote = e.message; host?.close(); host = null; }
  }
  const sim = compiled || new Simulator(design, { files, maxWaveEvents: 1e9 });
  const inVal = new Map(inputPorts.map((p) => [p.sig, 0n]));   // value of each input port (unmapped bits 0)
  // inputs with a pull-up on the board (e.g. the rotary encoder's A / B) rest at '1'
  for (const b of wiring.bits) if (b.dir === 'in' && b.res.pull === 'up' && b.kind !== 'sw' && b.kind !== 'btn') inVal.set(b.sig, (inVal.get(b.sig) ?? 0n) | (1n << BigInt(b.pos)));
  let lcd = lcdState(), lcdView = null;

  let running = false, speed = compiled ? 'real' : 'max', prev = null, destroyed = false, knobEnd = 0;
  // the next frame: an animation frame while the page is visible, a timer while it is hidden (when it keeps
  // running hidden); none while paused, powered off or held (#719)
  let raf = 0, timer = 0, paintRaf = 0, dirty = true, lastFrame = 0, paints = 0;
  // not seen: the page hidden or the emulator's document tab not the active one (inView: its element shown);
  // held: paused while not seen (the default setting)
  let whenHidden = hiddenPref(), inView = true, held = false;
  const shown = () => !document.hidden && inView;
  let powered = true;   // the board's power switch: off = nothing runs, outputs dark
  // (cycles per run of the event-driven engine: the compiled one slices its runs itself)
  const maxSlice = 200000;
  let slice = 2000, cyclesAcc = 0, lastT = 0, rateWin = { t: performance.now(), cyc: 0, rate: 0 }, vgaFetched = 0;
  let logN = 0;
  let lcdDirty = true;

  // ------------------------------------------------------------------------------- DOM (emulator-toolbar.js)
  const { main, resetBtn, root, runBtn, stat, stepBtn } = mountEmuToolbar({
    container, engine, model, timing, title, compiled: () => compiled, engineNote: () => engineNote,
    powerCycle: (...a) => powerCycle(...a), running: () => running, setRunning: (...a) => setRunning(...a),
    speed: () => speed, step: (...a) => step(...a), visibility: (...a) => visibility(...a),
    whenHidden: () => whenHidden, setSpeed: (v) => { speed = v; }, setWhenHidden: (v) => { whenHidden = v; }
  });

  // the port bit on resource `res` (its pin `idx`); widgets are addressed by board resource name
  const bitFor = (res, idx = 0) => wiring.bits.find((b) => b.res.name === res && b.idx === idx);
  const resOf = (name) => board.resources.find((r) => r.name === name);
  const resLabel = { led: 'LD', sw: 'SW', btn: 'BTN', an: 'AN' };
  const resName = (res, idx) => (resLabel[res] ? `${resLabel[res]}${idx}` : res.toUpperCase());
  const tip = (res, idx = 0) => { const b = bitFor(res, idx); return b ? `${resName(res, idx)} = ${b.bit} (pin ${b.loc})` : `${resName(res, idx)}: not connected in the UCF`; };
  const setInputBit = (b, v) => {
    if (!b || b.dir !== 'in') return;
    const cur = inVal.get(b.sig) ?? 0n;
    const m = 1n << BigInt(b.pos);
    const nv = v ? cur | m : cur & ~m;
    if (nv === cur) return;
    inVal.set(b.sig, nv);
    applyInput(b.sig, m);
  };

  // ---- interactive parts (placed by the board layout below) (emulator-board.js)
  const { digits, leds, powerSwitches, vgaWired } = mountBoardParts({
    board, title, after: (...a) => after(...a), bitFor, compiled: () => compiled, hasLcd, inVal, knobEnd: () => knobEnd,
    lcdView: () => lcdView, main, manual, period, powered: () => powered, refresh: (...a) => refresh(...a), resLabel,
    resOf, runCycles: (...a) => runCycles(...a), running: () => running, setInputBit,
    setPower: (...a) => setPower(...a), sim, tip, wiring, setKnobEnd: (v) => { knobEnd = v; },
    setLcdView: (v) => { lcdView = v; }
  });

  // the VGA monitor (#420): the picture the design scans out on the board's VGA connector, as a monitor
  // finds it in the sync pulses (core/vga.js), in the board's time; with the compiled engine only
  let vgaView = null;
  // (the VGA monitor, the side panel: emulator-side.js)
  const { logEl, watched } = mountEmuSide({
    board, design, engine, timing, title, after: (...a) => after(...a), clockSigs, compiled: () => compiled,
    engineNote: () => engineNote, main, powered: () => powered, refresh: (...a) => refresh(...a),
    running: () => running, sim, vgaView: () => vgaView, vgaWired, wiring, setVgaView: (v) => { vgaView = v; }
  });

  // ------------------------------------------------------------------------------- simulation
  // (mask: the bits that changed, to the compiled engine: the rotary knob's may be the worker's to set)
  function applyInput(sig, mask = -1n) {
    if (clockSigs.has(sig) || wiring.clocks.some((c) => c.sig === sig)) return;
    if (compiled) sim.force(sig, V.fromInt(inVal.get(sig) ?? 0n, sig.t.w), mask);
    else sim.force(sig, V.fromInt(inVal.get(sig) ?? 0n, sig.t.w));
  }
  // Like the FPGA after configuration: every register / memory without an explicit initial value
  // starts at 0 (in simulation it would stay 'U'/X, e.g. a free-running counter never starts).
  const allX = (v) => v && !Array.isArray(v) && v.w > 0 && v.x === (1n << BigInt(v.w)) - 1n;
  const zeroOf = (v) => V.withSign(V.fromInt(0, v.w, false), v.s);
  function powerUpZero() {
    for (const s of design.signals) {
      if (Array.isArray(s.val)) { if (s.val.some(allX)) s.val = s.val.map((e) => (allX(e) ? zeroOf(e) : e)); }
      else if (allX(s.val)) s.val = zeroOf(s.val);
    }
  }
  function setupSim() {
    if (!compiled) powerUpZero();   // (the compiled engine's registers start at their initial value or 0)
    for (const s of design.signals) s.wave = null;
    for (const p of inputPorts) applyInput(p.sig);
    for (const c of wiring.clocks) sim.addClock(c.sig, { period: c.period });
    prev = null; knobEnd = 0;
    lcd = lcdState(); lcdDirty = true;
    logN = 0;
    logEl.textContent = '';
  }
  function powerCycle() {
    sim.reset();
    setupSim();
    refresh();
  }
  function setPower(on) {
    if (on === powered) return;
    powered = on;
    for (const el of powerSwitches) { el.classList.toggle('on', on); el.setAttribute('aria-checked', String(on)); }
    root.classList.toggle('off', !on);
    if (on) { powerCycle(); setRunning(true); }
    else { setRunning(false); compiled?.invalidate(); prev = null; lcd = lcdState(); lcdDirty = true; refresh(); }
  }
  // n cycles; the compiled engine: a promise (the worker's state once they ran), else at once
  function runCycles(n) {
    if (!powered) return null;
    if (compiled) return advance(n);
    const t0 = sim.now;
    for (const s of outputSigs) s.wave = { t: [sim.now], v: [s.val] };
    sim.waveEvents = 0; sim.waveTruncated = false;
    sim.run(sim.now + n * period);
    prev = boardOutputs(wiring, t0, Math.max(sim.now, t0 + 1), prev);
    if (hasLcd && lcdFeed(lcd, wiring, t0, sim.now)) lcdDirty = true;
    rateWin.cyc += n;
  }
  // (what the board shows from what the compiled code counted in the run; the VGA picture 30 times a second)
  async function advance(n) {
    const vga = !!vgaView && (!running || performance.now() - vgaFetched >= 30);
    const st = await sim.advance(n, { budget: FRAME_BUDGET_MS, vga });
    if (!st || destroyed) return null;
    if (vga) vgaFetched = performance.now();
    prev = sim.outputs;
    if (st.lcd) { lcd = st.lcd; lcdDirty = true; }
    rateWin.cyc += st.cycles;
    return st;
  }
  /** refresh() once what `p` ran is in (runCycles' promise), at once without one. */
  function after(p) { if (p) p.then((st) => { if (st) refresh(); }); else refresh(); }
  function step() { setRunning(false); after(runCycles(1)); }
  function setRunning(on) {
    running = on && powered && !sim.finished;
    runBtn.textContent = running ? '⏸ Pause' : '▶ Run';
    stepBtn.disabled = running || !powered;
    runBtn.disabled = !powered;
    resetBtn.disabled = !powered;
    lastT = performance.now();
    cyclesAcc = 0;
    unschedule();
    schedule();
    refresh();
  }

  // one frame per displayed frame while it is seen (it simulates and draws); a timer while the page is hidden and
  // it keeps running (simulated, not drawn; slower: the browser slows a hidden page's timers)
  function schedule() {
    if (destroyed || raf || timer || !running || held) return;
    if (document.hidden) timer = setTimeout(() => { timer = 0; frame(performance.now()); }, 4);
    else raf = requestAnimationFrame(() => { raf = 0; frame(performance.now()); });
  }
  function unschedule() { cancelAnimationFrame(raf); clearTimeout(timer); raf = timer = 0; }
  // seen or not (the page's visibility, the document tab's): held while not seen with the default setting, and
  // on from where it was when seen again (real time: no backlog)
  function visibility() {
    if (destroyed) return;
    const hold = whenHidden === 'pause' && !shown();
    if (hold !== held) {
      held = hold;
      if (!held) { lastT = performance.now(); cyclesAcc = 0; rateWin = { t: lastT, cyc: 0, rate: rateWin.rate }; }
    }
    unschedule();
    schedule();
    if (held && powered) setStat(`t = ${formatTime(sim.now)} · ${Math.round(sim.now / period).toLocaleString()} cycles · paused while hidden`);
    else refresh();
  }
  document.addEventListener('visibilitychange', visibility);
  // (the document tab: its element is hidden when another tab is active)
  const seen = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { inView = es[es.length - 1].isIntersecting; visibility(); }) : null;
  seen?.observe(root);

  function frame(now) {
    if (destroyed || !running || held) return;
    schedule();
    // (at most 60 a second: every other frame of a 120 Hz display)
    if (!document.hidden && now - lastFrame < 15) return;
    lastFrame = now;
    if (compiled) { pump(now); paint(); return; }
    const start = performance.now();
    if (speed === 'max') {
      // as many cycles as fit in the frame budget
      let done = 0;
      do {
        runCycles(slice);
        done += slice;
        if (sim.finished) break;
      } while (performance.now() - start < FRAME_BUDGET_MS * 0.85);
      const perCycle = (performance.now() - start) / Math.max(1, done);   // ms per clock cycle
      slice = Math.max(50, Math.min(maxSlice, Math.round((FRAME_BUDGET_MS * 0.2) / Math.max(1e-6, perCycle))));
    } else {
      // (real time: the board's clock rate)
      cyclesAcc += (speed === 'real' ? 1e12 / period : speed) * Math.min(0.25, (now - lastT) / 1000);
      lastT = now;
      let n = Math.floor(cyclesAcc);
      cyclesAcc -= n;
      while (n > 0 && performance.now() - start < FRAME_BUDGET_MS) {
        const k = Math.min(n, slice);
        runCycles(k);
        n -= k;
        if (sim.finished) break;
      }
      if (n > 0) cyclesAcc = 0;   // could not keep up: drop the backlog
    }
    if (sim.finished) setRunning(false);
    refresh();
    paint();
  }

  // the compiled engine: one run in the worker at a time, the cycles owed in real time (or, Max speed, as many
  // as its budget allows); the next one asked for as soon as a run took its whole budget, so that the
  // worker does not wait
  function pump(now = performance.now()) {
    if (speed !== 'max') {
      cyclesAcc += (speed === 'real' ? 1e12 / period : speed) * Math.min(0.25, (now - lastT) / 1000);
      lastT = now;
    }
    if (sim.busy || !running || held) return;
    if (sim.finished) { setRunning(false); refresh(); return; }   // (the worker stopped by an error)
    const n = speed === 'max' ? Infinity : Math.floor(cyclesAcc);
    if (n <= 0) return;
    if (speed !== 'max') cyclesAcc -= n;
    runCycles(n).then((st) => {
      if (!st) return;
      const behind = st.cycles < n;
      if (behind && speed !== 'max') cyclesAcc = 0;   // could not keep up: drop the backlog
      if (sim.finished) setRunning(false);
      // (the worker's next run asked for before the page draws this one)
      if (behind && host.worker) pump();
      refresh();
    });
  }

  // what the board shows is to be drawn: at once when paused (a step, a power cycle), else by the next frame,
  // at most once per displayed frame; nothing while it is not seen (drawn when it is again, #719)
  function refresh() {
    dirty = true;
    if (!running) paint();
    else if (!raf && !paintRaf && shown()) paintRaf = requestAnimationFrame(() => { paintRaf = 0; paint(); });
  }
  const { paint, setStat } = mountEmuPaint({
    compiled: () => compiled, digits, dirty: () => dirty, lcd: () => lcd, lcdDirty: () => lcdDirty,
    lcdView: () => lcdView, leds, logEl, logN: () => logN, paints: () => paints, period, powered: () => powered,
    prev: () => prev, rateWin: () => rateWin, running: () => running, shown, sim, stat, vgaView: () => vgaView, watched,
    setDirty: (v) => { dirty = v; }, setPaints: (v) => { paints = v; }, setLcdDirty: (v) => { lcdDirty = v; },
    setRateWin: (v) => { rateWin = v; }, setLogN: (v) => { logN = v; }
  });

  setupSim();
  if (!compiled) sim.run(0);
  refresh();
  setRunning(true);

  return {
    destroy() { destroyed = true; unschedule(); cancelAnimationFrame(paintRaf); seen?.disconnect(); document.removeEventListener('visibilitychange', visibility); compiled?.destroy(); root.remove(); },
    pause: () => setRunning(false),
    power: (on) => setPower(!!on),
    get powered() { return powered; },
    wiring,
    sim,
    engine: compiled ? 'compiled' : 'event',
    worker: !!host?.worker,
    get outputs() { return prev; },
    get paints() { return paints; },
    get held() { return held; },
    printView: () => emuPrintView({ main, stat }),   // (#1512)
  };
}
