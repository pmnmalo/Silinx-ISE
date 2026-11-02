// Silinx - the Board Emulator's serial terminal (#2536): the board's serial port in the UCF wiring (its UART,
// RS-232 or USB-UART resources), what the design sends on its TX pin decoded as UART frames (8N1: a start bit,
// 8 data bits least significant first, a stop bit) from the pin's changes the compiled engine records
// (core/compiled-watch.js, watch.uart), and the frames of what the user types, for its RX pin.
//
// Isomorphic ES module (browser + Node), no DOM.

/** The boards' serial ports: their resources' groups. */
export const UART_GROUPS = ['UART', 'RS-232', 'USB-UART'];
/** The baud rates the terminal offers (9600 by default). */
export const BAUDS = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];

/**
 * The serial port's port bits (boardWiring's): { tx (the design's output), rx (its input) }, either null when the
 * UCF does not wire it; null when it wires neither (a board with two ports, the first wired: the Starter Kit's DCE).
 */
export function uartPins(wiring) {
  const on = (b) => UART_GROUPS.includes(b.res.group);
  const tx = wiring.bits.find((b) => on(b) && b.dir !== 'in') || null;
  const rx = wiring.bits.find((b) => on(b) && b.dir === 'in' && (!tx || b.res.group === tx.res.group)) || null;
  return tx || rx ? { tx, rx } : null;
}

/**
 * A UART receiver on the TX pin's changes: feed([cycle, level, cycle, level…]) in time order, then flush(now) to
 * sample up to the cycle `now`; bytes(): the bytes received since the last call ({ byte, error }: error, a stop bit
 * at 0). bit: the bit's time in cycles (not a whole number at most rates). It samples each bit in its middle, from
 * the falling edge of the start bit; a start bit at 1 in its middle is a glitch, not a frame. The first change is the
 * line's level at the start, no edge (a line low from the start, a break: nothing until it rises and falls).
 */
export class UartDecoder {
  constructor(bit) {
    this.bit = bit;
    this.level = null;
    this.start = null;
    this.k = 0;
    this.v = 0;
    this.out = [];
  }
  /** The next sample's cycle (null: none, the line idle). */
  next() { return this.start == null ? null : this.start + (this.k + 0.5) * this.bit; }
  /** The samples up to the cycle `c` (excluded), with the level before c. */
  sampleTo(c) {
    for (let s = this.next(); s != null && s < c; s = this.next()) {
      const L = this.level;
      if (this.k === 0) {
        if (L) { this.start = null; break; }
      } else if (this.k <= 8) this.v |= L << (this.k - 1);
      else { this.out.push({ byte: this.v, error: !L }); this.start = null; break; }
      this.k++;
    }
  }
  feed(changes) {
    for (let i = 0; i + 1 < changes.length; i += 2) {
      const c = changes[i], L = changes[i + 1] ? 1 : 0;
      if (this.level == null) { this.level = L; continue; }
      this.sampleTo(c);
      if (this.start == null && this.level === 1 && L === 0) { this.start = c; this.k = 0; this.v = 0; }
      this.level = L;
    }
  }
  flush(now) { this.sampleTo(now + 1); }
  bytes() { return this.out.splice(0); }
}

/**
 * The frames of bytes on the RX pin, one after the other: [{ dt (ps from the first one's start), level }], a step for
 * each bit (the times rounded from the start, so that no frame's end falls after the next one's start), the line
 * idle (1) after the last stop bit.
 */
export function uartFrames(bytes, bitPs) {
  const steps = [];
  bytes.forEach((byte, k) => [0, ...Array.from({ length: 8 }, (_, i) => (byte >> i) & 1), 1]
    .forEach((level, i) => steps.push({ dt: Math.round((k * 10 + i) * bitPs), level })));
  steps.push({ dt: Math.round(bytes.length * 10 * bitPs), level: 1 });
  return steps;
}

/** The bytes of a text typed: UTF-8; a line's end a CR (as a terminal sends Enter). */
export function textBytes(text) {
  return [...new TextEncoder().encode(text.replace(/\r?\n/g, '\r'))];
}

/**
 * The text the terminal shows for bytes received, after `prev` (the last byte shown, for CR LF): CR, LF and CR LF
 * a line's end, a tab as it is, other control codes and bytes over 0x7E as <hh>; error: a frame with no stop bit, ⟨?⟩.
 */
export function serialText(received, prev = -1) {
  let s = '';
  for (const { byte, error } of received) {
    if (error) s += '⟨?⟩';
    else if (byte === 10) s += prev === 13 ? '' : '\n';
    else if (byte === 13) s += '\n';
    else if (byte === 9 || (byte >= 32 && byte < 127)) s += String.fromCharCode(byte);
    else s += `<${byte.toString(16).toUpperCase().padStart(2, '0')}>`;
    prev = error ? -1 : byte;
  }
  return { text: s, prev };
}
