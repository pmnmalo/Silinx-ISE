// Silinx - the Board Emulator on the compiled cycle simulator (#418, part 2 of #102): the design's
// word-level netlist (core/compiled-sim.js netlistOf) compiled with what the board shows counted cycle by
// cycle (core/emulate.js outputWatch), behind the part of the event-driven simulator's interface the
// emulator uses (web/js/emulator.js): now (ps), run(until), force(sig, value), at(t, fn), reset(), log,
// finished; and outputs() / lcd() in place of the recorded waveforms, value(sig) for the Watch box.
//
// Time is the main clock's cycles times its period: run(until) runs the whole cycles up to `until`. A design
// with no main clock (a clock on a button, #347) counts cycles all the same, its flip-flops changing on the
// edges of the forced inputs.
//
// Isomorphic ES module (browser + Node), no DOM.
import * as V from './values.js';
import { compileNetlist, CompiledSim, portBit } from './compiled-sim.js';
import { outputWatch, boardOutputsFromCounts, lcdFeedEdges } from './emulate.js';
import { vgaPins, vgaPalette, vgaStatus } from './vga.js';
import { uartPins, UartDecoder } from './uart.js';

export class CompiledBoard {
  /**
   * json, top: the netlist (netlistOf); design: the elaborated design (its top's ports and signals);
   * wiring: boardWiring's; clock: the main clock's port (null: none); period: its period (ps); board: its
   * resources (the VGA connector's widths, #420); model: compileNetlist's, already compiled (this.model, in
   * the Board Emulator's worker: core/emulate-remote.js), in place of json and top.
   */
  constructor({ json, top, design, wiring, clock = null, period = 20000, board = null, model = null }) {
    this.wiring = wiring;
    this.period = period;
    this.clock = clock;
    this.watch = outputWatch(wiring);
    const bit = (b) => (b ? portBit(json, top, b.port, b.pos) : '0');
    // the VGA monitor, when the UCF wires the board's VGA connector (core/vga.js)
    this.vgaPins = vgaPins(wiring, board);
    this.palette = this.vgaPins ? vgaPalette(this.vgaPins.widths) : null;
    // the serial terminal, when the UCF wires the board's serial port's TX (core/uart.js, #2536)
    this.uartTx = uartPins(wiring)?.tx || null;
    model ??= compileNetlist(json, {
      top, clock: clock || false,
      watch: {
        levels: this.watch.levels.map((l) => ({ bit: bit(l.b), on: l.on })),
        pairs: this.watch.pairs.map(([a, b]) => [{ bit: bit(a.b), on: a.on }, { bit: bit(b.b), on: b.on }]),
        edges: this.watch.edges.map((e) => ({ bit: bit(e.b), capture: e.capture.map(bit) })),
        uart: this.uartTx && { tx: bit(this.uartTx) },
        vga: this.vgaPins && { hs: bit(this.vgaPins.hs), vs: bit(this.vgaPins.vs), rgb: [...this.vgaPins.red, ...this.vgaPins.green, ...this.vgaPins.blue].map(bit) },
      },
    });
    this.model = model;
    this.cs = new CompiledSim(model);
    this.warnings = model.warnings;
    this.portOf = new Map(design.top.ports.filter((p) => p.dir === 'in').map((p) => [p.sig, p.name]));
    const pre = `${design.top.path || design.top.name}.`;
    this.netOf = (s) => (String(s.path || '').startsWith(pre) ? model.nets.get(s.path.slice(pre.length)) : model.nets.get(s.name)) || null;
    this.log = [];
    this.reset();
  }
  /** Back to the start (the inputs kept, as the FPGA after a new configuration). */
  reset() {
    this.cs.reset();
    this.cs.take();
    this.decoder = this.uartTx ? new UartDecoder((this.baudBit ?? 1e12 / 9600) / this.period) : null;
    this.now = 0;
    this.finished = false;
    this.queue = [];
    this.edges = [];
  }
  /** An input port's value (a simulator value: its unknown bits as 0); the main clock is the compiled code's. */
  force(sig, val) {
    const name = this.portOf.get(sig);
    if (!name || name === this.clock) return;
    this.cs.set(name, val.v & ~(val.x || 0n));
  }
  /** fn at time t (ps), between two cycles: the rotary knob's quadrature steps. */
  at(t, fn) {
    this.queue.push({ t, fn });
    this.queue.sort((a, b) => a.t - b.t);
  }
  addClock() { /* the main clock is the compiled code's */ }
  /** Run the whole cycles up to `until` (ps). */
  run(until) {
    if (this.finished) return;
    const step = (t) => {
      const n = Math.floor((t - this.now) / this.period);
      if (n <= 0) return;
      try { this.cs.cycle(n); } catch (e) {
        this.finished = 'error';
        this.log.push({ kind: 'error', time: this.now, text: e.message });
        return;
      }
      this.now += n * this.period;
    };
    while (this.queue.length && this.queue[0].t <= until && !this.finished) {
      const { t, fn } = this.queue.shift();
      step(t);
      fn();
    }
    step(until);
  }
  /** What the board shows after the window [t0, t1] (boardOutputs), from what the cycles in it counted. */
  outputs(t0, t1, prev = null) {
    const { counts, edges } = this.cs.take();
    for (let i = 1; i < edges.length; i += 2) this.edges.push(edges[i]);
    return boardOutputsFromCounts(this.wiring, this.watch, counts, this.period, t0, t1, prev);
  }
  /** The LCD's transfers since the last call (lcdFeed): true when there were some. */
  lcd(st) {
    const fed = lcdFeedEdges(st, this.watch, this.edges);
    this.edges = [];
    return fed;
  }
  /** The VGA monitor: { fb (the rgb bits' value of each pixel), palette, status: vgaStatus's } or null (no VGA connector). */
  vga() {
    const v = this.cs.vga;
    return v ? { fb: v.fb, palette: this.palette, status: vgaStatus(v.state, this.period) } : null;
  }
  /** The serial terminal's baud rate (9600 at first). */
  setBaud(baud) {
    this.baudBit = 1e12 / baud;
    if (this.decoder) this.decoder.bit = this.baudBit / this.period;
  }
  /** The bytes the design sent on the serial port's TX since the last call ([{ byte, error }]: UartDecoder's), [] without one. */
  serial() {
    if (!this.decoder) return [];
    this.decoder.feed(this.cs.uart.take());
    this.decoder.flush(this.cs.cycles);
    return this.decoder.bytes();
  }
  /** A signal's value now (a simulator value), or null when the netlist has no net of its name. */
  value(sig) {
    const bits = this.netOf(sig);
    if (!bits || !sig.t || bits.length !== sig.t.w) return null;
    return V.fromInt(this.cs.bits(bits), sig.t.w, false);
  }
}
