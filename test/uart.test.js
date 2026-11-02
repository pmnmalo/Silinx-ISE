// The Board Emulator's serial terminal (core/uart.js, core/compiled-watch.js watch.uart, #2536): the boards' serial
// ports in the wiring; the receiver against frames built here from their definition (8N1, least significant bit
// first), at rates whose bit is no whole number of cycles, in pieces, with glitches and framing errors; the text
// shown; and a UART echo (test/fixtures/compiled-sim/uart_echo.vhd) on the compiled engine, its RX driven by
// uartFrames' frames, its TX decoded.
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
import { BAUDS, UART_GROUPS, UartDecoder, serialText, textBytes, uartFrames, uartPins } from '../core/uart.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';

// a line's changes ([cycle, level…]) for bytes sent one after the other from cycle c0, `gap` bit times between
// them, each bit `bit` cycles (its edges at the cycles rounded up, as a design's counter makes them)
function line(bytes, bit, { c0 = 100, gap = 0, stop = 1 } = {}) {
  const ch = [0, 1];
  let t = c0, level = 1;
  const to = (c, L) => { if (L !== level) { ch.push(Math.ceil(c), L); level = L; } };
  for (const b of bytes) {
    const bits = [0, ...Array.from({ length: 8 }, (_, i) => (b >> i) & 1), stop];
    bits.forEach((L, i) => to(t + i * bit, L));
    to(t + 10 * bit, 1);
    t += (10 + gap) * bit;
  }
  return { ch, end: Math.ceil(t) };
}
const decode = (bit, ch, end) => { const d = new UartDecoder(bit); d.feed(ch); d.flush(end); return d.bytes(); };
const ok = (bytes) => bytes.map((byte) => ({ byte, error: false }));

test('the receiver: every byte at every rate (a bit of no whole number of cycles), back to back or apart', () => {
  const all = Array.from({ length: 256 }, (_, i) => i);
  for (const baud of BAUDS) {
    const bit = 50e6 / baud;
    for (const gap of [0, 3]) {
      const { ch, end } = line(all, bit, { gap });
      assert.deepEqual(decode(bit, ch, end), ok(all), `${baud} baud, ${gap} bits apart`);
    }
  }
});

test('the receiver in pieces: the changes fed and flushed run by run, the same bytes', () => {
  const bit = 50e6 / 115200, bytes = [...textBytes('Hello, UART!\n')];
  const { ch, end } = line(bytes, bit, { gap: 1 });
  const d = new UartDecoder(bit), got = [];
  for (let c = 0, i = 0; c <= end + 1000; c += 97) {
    const piece = [];
    while (i < ch.length && ch[i] < c) piece.push(ch[i++], ch[i++]);
    d.feed(piece);
    d.flush(c - 1);
    got.push(...d.bytes());
  }
  assert.deepEqual(got, ok(bytes));
});

test('the receiver: a glitch is no start bit, a stop bit at 0 is a framing error, an idle line nothing', () => {
  const bit = 100;
  // a glitch of a quarter bit, then a byte
  const g = line([0x41], bit, { c0: 500 });
  assert.deepEqual(decode(bit, [0, 1, 100, 0, 125, 1, ...g.ch.slice(2)], g.end), ok([0x41]));
  // a stop bit at 0: the byte, flagged; then the line idle again, the next byte
  const f = line([0x55], bit, { stop: 0 }), n = line([0x0A], bit, { c0: f.end + 5 * bit });
  assert.deepEqual(decode(bit, [...f.ch, ...n.ch.slice(2)], n.end), [{ byte: 0x55, error: true }, { byte: 0x0A, error: false }]);
  // idle, or a line low from the start (a break): nothing until a falling edge
  assert.deepEqual(decode(bit, [0, 1], 1e6), []);
  assert.deepEqual(decode(bit, [0, 0], 1e6), []);
  // a frame not over yet: nothing; its stop bit sampled later
  const h = line([0x33], bit), d = new UartDecoder(bit);
  d.feed(h.ch);
  d.flush(100 + 9 * bit);
  assert.deepEqual(d.bytes(), []);
  d.flush(100 + 10 * bit);
  assert.deepEqual(d.bytes(), ok([0x33]));
});

test('uartFrames: start bit, 8 bits least significant first, stop bit; the next frame at 10 bits, the line idle after the last', () => {
  assert.deepEqual(uartFrames([0xA5, 0xFF], 1000).map((s) => [s.dt, s.level]),
    [[0, 0], [1000, 1], [2000, 0], [3000, 1], [4000, 0], [5000, 0], [6000, 1], [7000, 0], [8000, 1], [9000, 1],
      [10000, 0], ...Array.from({ length: 9 }, (_, i) => [11000 + i * 1000, 1]), [20000, 1]]);
  // (#2536: each time rounded from the start, so that a frame's end is never after the next one's start)
  const st = uartFrames(Array(50).fill(0x55), 1e12 / 9600);
  assert.ok(st.every((s, i) => !i || s.dt >= st[i - 1].dt));
  assert.deepEqual(st.slice(-2).map((s) => s.dt), [Math.round(499 * 1e12 / 9600), Math.round(500 * 1e12 / 9600)]);
  assert.deepEqual(uartFrames([], 1000), [{ dt: 0, level: 1 }]);
});

test('the text: a line\'s end CR, LF or CR LF; control codes and high bytes as <hh>; framing errors; UTF-8 typed', () => {
  const r = serialText(ok([0x48, 0x69, 13, 10, 0x6F, 10, 0x6B, 13, 0x09, 0x07, 0xC3]).concat([{ byte: 0x41, error: true }]));
  assert.deepEqual(r, { text: 'Hi\no\nk\n\t<07><C3>⟨?⟩', prev: -1 });
  // CR at the end of one batch, LF at the start of the next: one line's end
  assert.equal(serialText(ok([10, 0x41]), 13).text, 'A');
  assert.deepEqual(textBytes('aé\n'), [0x61, 0xC3, 0xA9, 13]);
  assert.deepEqual(textBytes('a\r\nb'), [0x61, 13, 0x62]);
});

test('uartPins: each board\'s serial port in its resources, from the UCF\'s wiring; none without one', () => {
  const ports = (ids) => {
    const r = resolveBoard(ids);
    return r.resources.filter((x) => UART_GROUPS.includes(x.group)).map((x) => `${x.name}:${x.dir}`);
  };
  assert.deepEqual(ports('nexys2'), ['rs232_rx:in', 'rs232_tx:out']);
  assert.deepEqual(ports('icebreaker'), ['rx:in', 'tx:out']);
  assert.deepEqual(ports('nexys3'), ['uart_rx:in', 'uart_tx:out']);
  assert.deepEqual(ports('basys2'), []);
  const res = (name, group, dir) => ({ name, group, dir });
  const bits = [{ res: res('led', 'LEDs', 'out'), dir: 'out' }, { res: res('rs232_dte_rxd', 'RS-232', 'in'), dir: 'in' },
    { res: res('rs232_dce_rxd', 'RS-232', 'in'), dir: 'in' }, { res: res('rs232_dce_txd', 'RS-232', 'out'), dir: 'out' }];
  const p = uartPins({ bits });
  assert.equal(p.tx.res.name, 'rs232_dce_txd');
  assert.equal(p.rx.res.name, 'rs232_dte_rxd');   // (the first RX of the TX's group)
  assert.equal(uartPins({ bits: bits.slice(0, 1) }), null);
  assert.deepEqual(uartPins({ bits: bits.slice(0, 2) }), { tx: null, rx: bits[1] });
});

// the echo on a Nexys2 (50 MHz, its RS-232 port, the LEDs)
const ECHO = fs.readFileSync(path.join(ROOT, 'test/fixtures/compiled-sim/uart_echo.vhd'), 'utf8');
const UCF = `NET "clk" LOC = "B8"; NET "rx" LOC = "U6"; NET "tx" LOC = "P9";
NET "led<0>" LOC = "J14"; NET "led<1>" LOC = "J15"; NET "led<2>" LOC = "K15"; NET "led<3>" LOC = "K14";
NET "led<4>" LOC = "E17"; NET "led<5>" LOC = "P15"; NET "led<6>" LOC = "F4"; NET "led<7>" LOC = "R4";`;
const ucfPort = (p) => { const t = p.sig.t, bus = t.w > 1 || (t.kind === 'logic' && !t.scalar); return { name: p.name, dir: p.dir, width: t.w, msb: bus ? t.left : null, lsb: bus ? t.right : null }; };
async function echoBoard(generics) {
  const r = resolveBoard('nexys2'), board = { id: 'nexys2', name: r.board.name, device: r.device, resources: r.resources };
  const design = designOf([{ path: 'uart_echo.vhd', lang: 'vhdl', role: 'design', text: ECHO }], 'uart_echo', { generics });
  const { json, top } = await netlistOf(design, { run: yosysNode });
  const wiring = boardWiring({ ports: design.top.ports, assignments: parseUcf(UCF, { ports: design.top.ports.map(ucfPort) }).assignments, board });
  wiring.clocks = emulatorClocks(wiring, design.top.ports);
  const cb = new CompiledBoard({ json, top, design, wiring, clock: 'clk', period: wiring.clocks[0].period, board });
  const rx = design.top.ports.find((p) => p.name === 'rx').sig;
  cb.force(rx, { v: 1n, x: 0n });
  // the bytes as the terminal sends them: frames one after the other from t0 (ps)
  const send = (bytes, baud, t0 = cb.now) => uartFrames(bytes, 1e12 / baud).forEach(({ dt, level }) => cb.at(t0 + dt, () => cb.force(rx, { v: BigInt(level), x: 0n })));
  return { cb, send, uart: uartPins(wiring) };
}

test('a UART echo on the compiled engine: the line typed comes back on TX, decoded; the LEDs show the last byte', async () => {
  const { cb, send, uart } = await echoBoard();
  assert.deepEqual([uart.tx.res.name, uart.rx.res.name], ['rs232_tx', 'rs232_rx']);
  const bytes = textBytes('Silinx 123\n');
  send(bytes, 9600, 1e9);
  cb.run(1e9 + (bytes.length + 2) * 10 * 1e12 / 9600);
  assert.deepEqual(cb.serial(), ok(bytes));
  assert.equal(cb.cs.get('led'), 13n, 'the LEDs: the last byte, CR');
  assert.deepEqual(cb.serial(), [], 'taken');
  // after a reset: the decoder starts again; nothing sent, nothing received
  cb.reset();
  cb.run(1e9);
  assert.deepEqual(cb.serial(), []);
});

test('a UART echo at 115200 baud: the terminal set to the design\'s rate decodes it; at another rate, framing errors or wrong bytes', async () => {
  const { cb, send } = await echoBoard({ BAUD: 115200 });
  cb.setBaud(115200);
  const bytes = textBytes('fast\n');
  send(bytes, 115200, 1e8);
  cb.run(1e8 + (bytes.length + 2) * 10 * 1e12 / 115200);
  assert.deepEqual(cb.serial(), ok(bytes));
  cb.setBaud(9600);
  send([0x55], 115200);
  cb.run(cb.now + 30 * 1e12 / 9600);
  assert.notDeepEqual(cb.serial(), ok([0x55]));
});
