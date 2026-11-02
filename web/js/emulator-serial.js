// The Board Emulator's serial terminal (#2536): what the design sends on the board's serial port (its TX pin, decoded
// by the compiled engine: core/uart.js) shown as text, and the line the user types sent to its RX pin as UART frames
// (8N1), in the board's time. A module outside the board (emulator-modules.js); with the compiled engine only.
import { h } from './dom.js';
import { BAUDS, serialText, textBytes, uartFrames, uartPins } from '/core/uart.js';

const MAX_TEXT = 20000;   // (the characters the terminal keeps)

/** { draw() } of mountEmulator (compiled(): its current value), or null when the UCF wires no serial port. */
export function mountEmuSerial(ctx) {
  const { compiled, main, sim, wiring } = ctx;
  const pins = uartPins(wiring);
  if (!pins) return null;
  let baud = 9600, prev = -1;
  const out = h('pre', { class: 'emu-serial-out' });
  const line = h('input', { type: 'text', class: 'emu-serial-in', placeholder: 'Type a line, Enter sends it with CR', spellcheck: false });
  const sendBtn = h('button', { class: 'btn', onclick: () => send() }, 'Send');
  const baudSel = h('select', { title: 'The baud rate (8 data bits, no parity, 1 stop bit)', onchange: (e) => { baud = Number(e.target.value); if (compiled()) sim.baud(baud); } },
    ...BAUDS.map((b) => h('option', { value: b, selected: b === baud }, `${b} baud`)));
  const clearBtn = h('button', { class: 'btn', onclick: () => { out.textContent = ''; } }, 'Clear');
  const pin = (b) => (b ? `${b.bit} (pin ${b.loc})` : 'not connected in the UCF');
  const note = h('div', { class: 'emu-hint' }, compiled()
    ? `TX: ${pin(pins.tx)} · RX: ${pin(pins.rx)}`
    : 'The serial terminal needs the compiled engine (the event-driven one is too slow for a frame)');
  line.disabled = sendBtn.disabled = !compiled() || !pins.rx;
  line.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
  const box = h('div', { class: 'emu-box emu-serial', 'data-module': 'serial' }, h('h4', {}, 'Serial terminal'),
    h('div', { class: 'emu-serial-bar' }, baudSel, clearBtn), out, h('div', { class: 'emu-serial-bar' }, line, sendBtn), note);
  const side = main.querySelector('.emu-side');
  if (side) side.before(box); else main.append(box);

  // the line typed and a CR, one frame after the other on RX (the board's time: core/emulate-remote.js sequence)
  function send() {
    const b = pins.rx, bytes = textBytes(`${line.value}\n`), bitPs = 1e12 / baud, m = 1n << BigInt(b.pos);
    line.value = '';
    sim.sequence(uartFrames(bytes, bitPs).map(({ dt, level }) => ({ dt, sets: [{ sig: b.sig, value: level ? m : 0n, mask: m }] })));
  }
  return {
    // (what came since the last picture; also while the terminal is hidden, so that nothing is lost)
    draw() {
      if (!compiled()) return;
      const got = sim.serial();
      if (!got.length) return;
      const r = serialText(got, prev);
      prev = r.prev;
      const t = out.textContent + r.text;
      out.textContent = t.length > MAX_TEXT ? t.slice(-MAX_TEXT) : t;
      out.scrollTop = out.scrollHeight;
    },
  };
}
