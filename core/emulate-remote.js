// Silinx - the Board Emulator's compiled engine at the other end of a message port (#427): in a Web Worker of
// its own (web/js/emulator-worker.js), so that the design gets a whole core and the page stays responsive, or
// on the page's thread (a MessageChannel: no worker).
//
// hostBoard(port) runs a CompiledBoard (core/emulate-compiled.js) and what the board shows (its outputs, the
// LCD's controller) on its side of the port; RemoteBoard is the page's side: the part of the Simulator-like
// interface the emulator uses (web/js/emulator.js), with what the last run answered cached (now, finished,
// log, outputs, lcd, vga(), value(sig)) and the runs asynchronous: advance(n) resolves once n cycles ran, or
// as many as fit in the time budget.
//
// The messages, page -> host: init { opts }, force { port, value, mask }, at { t, sets: [force…] },
// sequence { steps: [{ dt, sets }] }, reset, watch { sigs }, baud { baud }, run { id, gen, cycles, budget, vga }; host -> page: ready
// { warnings, palette }, state { id, gen, now, cycles, finished, outputs, lcd, log, values, vga, serial }, error { message }.
//
// Isomorphic ES module (browser + Node), no DOM.
import { CompiledBoard } from './emulate-compiled.js';
import { lcdState } from './emulate.js';

const nowMs = () => globalThis.performance?.now() ?? Date.now();

/**
 * What a CompiledBoard needs, in a form a message carries (structured clone): the compiled model, the
 * wiring's bits without their simulator signals, the top's ports by name.
 */
export function boardInit(compiled, { design, wiring, board, hasLcd = false }) {
  return {
    model: compiled.model, clock: compiled.clock, period: compiled.period, board, hasLcd,
    wiring: { bits: wiring.bits.map(({ sig, ...b }) => b) },
    design: { top: { name: design.top.name, path: design.top.path, ports: design.top.ports.map((p) => ({ name: p.name, dir: p.dir, sig: p.name })) } },
  };
}
const sigStub = (s) => ({ name: s.name, path: s.path, t: { w: s.t?.w } });

/** The host: a CompiledBoard driven by the messages of `port` (a worker's self, a MessagePort). */
export function hostBoard(port) {
  let board = null, lcd = null, prev = null, watched = [], logN = 0, slice = 10000, seqEnd = 0;
  const post = (m, transfer) => port.postMessage(m, transfer || []);
  const inputs = new Map();
  const force = ({ port: name, value, mask }) => {
    const v = ((inputs.get(name) ?? 0n) & ~mask) | (value & mask);
    inputs.set(name, v);
    board.force(name, { v, x: 0n });
  };
  const handle = {
    init({ opts }) {
      board = new CompiledBoard({ ...opts, json: null, top: null });
      lcd = opts.hasLcd ? lcdState() : null;
      post({ type: 'ready', warnings: board.warnings, palette: board.palette });
    },
    force,
    at({ t, sets }) { board.at(t, () => sets.forEach(force)); },
    // (from the board's time, after the sequences queued before: the page's time may be a run behind)
    sequence({ steps }) {
      const t0 = Math.max(board.now, seqEnd);
      for (const { dt, sets } of steps) board.at(t0 + dt, () => sets.forEach(force));
      seqEnd = t0 + Math.max(0, ...steps.map((s) => s.dt));
    },
    reset() { board.reset(); seqEnd = 0; prev = null; lcd = lcd && lcdState(); logN = 0; board.log.length = 0; },
    watch({ sigs }) { watched = sigs; },
    baud({ baud }) { board.setBaud(baud); },
    run({ id, gen, cycles, budget = 16, vga = false }) {
      const start = nowMs(), t0 = board.now, end = t0 + cycles * board.period;
      // (slices of about 2 ms between two looks at the clock)
      while (board.now < end && !board.finished) {
        const k = Math.max(1, Math.min(slice, Math.round((end - board.now) / board.period)));
        const s = nowMs();
        board.run(board.now + k * board.period);
        const ms = nowMs() - s;
        slice = Math.max(100, Math.min(5e6, Math.round(k * 2 / Math.max(0.05, ms))));
        if (nowMs() - start >= budget) break;
      }
      const ran = Math.round((board.now - t0) / board.period);
      // (no cycle run, a look at the values only: what the board shows stays)
      let fed = false;
      if (ran > 0) {
        prev = board.outputs(t0, Math.max(board.now, t0 + 1), prev);
        if (lcd) fed = board.lcd(lcd);
      }
      const v = board.vga();
      const fb = vga && v ? v.fb.slice() : null;
      const log = board.log.slice(logN);
      logN = board.log.length;
      post({
        type: 'state', id, gen, now: board.now, cycles: ran, finished: board.finished, outputs: prev,
        lcd: fed ? lcd : null, log, values: watched.map((s) => board.value(s)),
        vga: v ? { status: v.status, fb } : null, serial: board.serial(),
      }, fb ? [fb.buffer] : []);
    },
  };
  const onMessage = (e) => {
    const m = e.data;
    try { handle[m.type]?.(m); }
    catch (err) { post({ type: 'error', id: m.id, gen: m.gen, message: err.message }); }
  };
  if (port.addEventListener) { port.addEventListener('message', onMessage); port.start?.(); }
  else port.onmessage = onMessage;
}

/**
 * The page's side. port: the worker or a MessagePort (postMessage, message events); compiled: the
 * CompiledBoard the page built (its warnings, palette, the main clock's period); close(): ends the host.
 */
export class RemoteBoard {
  constructor(port, compiled, { design, wiring, board, hasLcd = false, close = () => {} }) {
    this.port = port;
    this.period = compiled.period;
    this.warnings = compiled.warnings;
    this.palette = compiled.palette;
    this.portOf = new Map(design.top.ports.filter((p) => p.dir === 'in').map((p) => [p.sig, p.name]));
    this.clock = compiled.clock;
    this.closeHost = close;
    this.now = 0;
    this.finished = false;
    this.log = [];
    this.outputs = null;
    this.lcdState = null;
    this.vgaLast = null;
    this.serialIn = [];
    this.values = new Map();
    this.watched = [];
    this.gen = 0;
    this.pending = new Map();
    this.nextId = 1;
    this.error = null;
    this.onMessage = (e) => this.receive(e.data);
    // (a worker that cannot start or load its code: its error event)
    this.onError = (e) => { e.preventDefault?.(); this.receive({ type: 'error', message: `the emulator's worker stopped: ${e.message || 'it could not start'}` }); };
    if (port.addEventListener) { port.addEventListener('message', this.onMessage); port.addEventListener('error', this.onError); port.start?.(); }
    else port.onmessage = this.onMessage;
    this.post({ type: 'init', opts: boardInit(compiled, { design, wiring, board, hasLcd }) });
  }
  post(m) { this.port.postMessage(m); }
  receive(m) {
    if (m.type === 'error') {
      this.error = m.message;
      if (!this.finished) { this.finished = 'error'; this.log.push({ kind: 'error', time: this.now, text: m.message }); }
    }
    if (m.type === 'error' && m.id == null) { for (const r of this.pending.values()) r(null); this.pending.clear(); }
    const done = (m.id != null && this.pending.get(m.id)) || null;
    if (done) this.pending.delete(m.id);
    // (a state from before a reset or a power-off: what the board showed then is no longer)
    if (m.type !== 'state' || m.gen !== this.gen) { done?.(null); return; }
    this.now = m.now;
    if (m.finished) this.finished = m.finished;
    this.outputs = m.outputs;
    if (m.lcd) this.lcdState = m.lcd;
    if (m.log.length) this.log.push(...m.log);
    this.watched.forEach((s, i) => this.values.set(s, m.values[i]));
    if (m.vga) this.vgaLast = { status: m.vga.status, fb: m.vga.fb || this.vgaLast?.fb || null };
    if (m.serial?.length) this.serialIn.push(...m.serial);
    done?.(m);
  }
  /** Runs in flight. */
  get busy() { return this.pending.size > 0; }
  /** An input port's value (a simulator value, its unknown bits 0); mask: the bits it sets (all by default). */
  force(sig, val, mask = -1n) {
    const name = this.portOf.get(sig);
    if (!name || name === this.clock) return;
    this.post({ type: 'force', port: name, value: val.v & ~(val.x || 0n), mask: BigInt.asUintN(sig.t.w, mask) });
  }
  /** At time t (ps), between two cycles, set these input bits: [{ sig, value, mask }] (the rotary knob's steps). */
  at(t, sets) {
    const out = sets.map(({ sig, value, mask }) => ({ port: this.portOf.get(sig), value, mask })).filter((s) => s.port && s.port !== this.clock);
    if (out.length) this.post({ type: 'at', t, sets: out });
  }
  /**
   * The same as a sequence: [{ dt, sets }], dt (ps) from the board's time when the host takes it, or from the end
   * of the sequence before it if that is later (the rotary knob's detents, one after the other).
   */
  sequence(steps) {
    const map = (sets) => sets.map(({ sig, value, mask }) => ({ port: this.portOf.get(sig), value, mask })).filter((s) => s.port && s.port !== this.clock);
    this.post({ type: 'sequence', steps: steps.map(({ dt, sets }) => ({ dt, sets: map(sets) })) });
  }
  addClock() { /* the main clock is the compiled code's */ }
  /** Back to the start (the inputs kept); the runs in flight are forgotten. */
  reset() {
    this.invalidate();
    this.post({ type: 'reset' });
    this.now = 0;
    this.finished = false;
    this.log = [];
    this.outputs = null;
    this.lcdState = null;
    this.vgaLast = null;
    this.serialIn = [];
  }
  /** Forget the runs in flight (the board switched off): their states are not shown. */
  invalidate() { this.gen++; }
  /** The signals of the Watch box: value(sig) after the next run. */
  watch(sigs) {
    this.watched = [...sigs];
    this.post({ type: 'watch', sigs: this.watched.map(sigStub) });
  }
  /**
   * Run n cycles (Infinity: as many as the budget allows), at most `budget` ms; vga: the monitor's picture with
   * the state. Resolves the host's state (null: forgotten, after a reset).
   */
  advance(cycles, { budget = 16, vga = false } = {}) {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.post({ type: 'run', id, gen: this.gen, cycles, budget, vga });
    });
  }
  /** The VGA monitor: { fb, palette, status } (the last picture fetched) or null (no VGA connector, no run yet). */
  vga() { return this.vgaLast ? { fb: this.vgaLast.fb, palette: this.palette, status: this.vgaLast.status } : null; }
  /** The serial terminal's baud rate. */
  baud(baud) { this.post({ type: 'baud', baud }); }
  /** The bytes the design sent on the serial port since the last call ([{ byte, error }]). */
  serial() { return this.serialIn.splice(0); }
  /** A watched signal's value after the last run (a simulator value), or null. */
  value(sig) { return this.values.get(sig) ?? null; }
  /** End the host (the worker terminated); the runs in flight resolve null. */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.port.removeEventListener?.('message', this.onMessage);
    this.port.removeEventListener?.('error', this.onError);
    for (const r of this.pending.values()) r(null);
    this.pending.clear();
    this.closeHost();
  }
}
