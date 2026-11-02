// The uart example (examples/uart, #2537): its testbench catches a wrong design (mutations); the rx / tx ports on every
// board's serial port (a port named so takes it, whatever the board calls it); and on the Board Emulator's compiled
// engine at the design's own rate: a line sent comes back, the LEDs show its last byte, BTN0 sends the message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES, TARGETS, ICE40_TARGETS, example, exampleUcf, runTestbench, targetName } from './examples-lib.mjs';
import { designOf } from './compiled-diff.js';
import { boardAutoAssign, parseUcf } from '../packages/silinx-fpga/src/ucf.js';
import { resolveBoard } from '../server/devices.js';
import { boardWiring, emulatorClocks } from '../core/emulate.js';
import { netlistOf } from '../core/compiled-sim.js';
import { CompiledBoard } from '../core/emulate-compiled.js';
import { textBytes, uartFrames, uartPins } from '../core/uart.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';

const ex = example('uart');
const src = (p) => ex.sources.find((s) => s.path === p).text;
const ok = (bytes) => bytes.map((byte) => ({ byte, error: false }));

test('the examples list it, last', () => {
  assert.equal(EXAMPLES.at(-1), 'uart');
});

// a mutation of the design makes the testbench fail: it does check what it says
for (const [what, file, from, to] of [
  ['the transmitter sends the bits in the wrong order', 'src/uart_tx.vhd', "frame <= '1' & frame(9 downto 1);", "frame <= frame(8 downto 0) & '1';"],
  ['the receiver samples at the start of each bit, not in its middle', 'src/uart_rx.vhd', 'count <= BIT_T / 2;', 'count <= 0;'],
  ['no stop bit: a frame a bit short', 'src/uart_tx.vhd', 'if bitn = 9 then', 'if bitn = 8 then'],
  ['the byte received while busy is lost', 'src/uart.vhd', "pending <= '1';", "pending <= not tx_busy;"],
  ['the LEDs do not show the last byte', 'src/uart.vhd', 'led <= last;', 'led <= not last;'],
  ['the count of bytes on the display stays', 'src/uart.vhd', 'count <= count + 1;', 'count <= count;'],
  ['the message loses its last character', 'src/uart.vhd', 'if msg_i = 19 then', 'if msg_i = 18 then'],
  ['BTN0 does nothing', 'src/uart.vhd', "if press = '1' and sending = '0' then", "if press = '1' and sending = '1' then"],
  ['the display shows a wrong digit', 'src/sevenseg.vhd', '"0010000" when "1001",', '"0000010" when "1001",'],
]) {
  test(`the testbench catches it: ${what}`, { timeout: 120000 }, async () => {
    assert.ok(src(file).includes(from), from);
    const r = await runTestbench('uart', { edit: { [file]: src(file).replace(from, to) } });
    assert.equal(r.passed, false, r.log.slice(-5).join('\n'));
  });
}

test('rx and tx on every board\'s serial port, by name, whatever the board calls it; the Basys2\'s on the Pmod JA, not verified on a board', () => {
  const on = (t) => { const r = resolveBoard(t.board, { variant: t.variant }); return r.resources; };
  const pins = {};
  for (const t of [...TARGETS, ...ICE40_TARGETS]) {
    const { assignments } = boardAutoAssign([{ name: 'rx', dir: 'in', width: 1, msb: null, lsb: null }, { name: 'tx', dir: 'out', width: 1, msb: null, lsb: null }], { resources: on(t) });
    pins[targetName(t)] = [assignments.rx?.loc, assignments.tx?.loc];
  }
  assert.deepEqual(pins, {
    'basys2-100': ['J3', 'A3'], 'basys2-250': ['J3', 'A3'], 'nexys2-500': ['U6', 'P9'], 'nexys2-1200': ['U6', 'P9'],
    nexys3: ['N17', 'N18'], atlys: ['A16', 'B16'], icebreaker: ['6', '9'],
  });
  const b = on({ board: 'basys2' });
  assert.deepEqual(b.filter((r) => r.group === 'UART').map((r) => [r.name, r.dir, r.verified]), [['rx', 'in', false], ['tx', 'out', false]]);
  // a board with no serial port: the ports left unmatched
  assert.deepEqual(boardAutoAssign([{ name: 'rx', dir: 'in', width: 1, msb: null, lsb: null }], { resources: b.filter((r) => r.group !== 'UART') }).unmatched, ['rx']);
  // the shipped constraints have them
  assert.match(exampleUcf('uart', { board: 'basys2', variant: '250' }).text, /NET "rx"\s+LOC = "J3" ;\nNET "tx"\s+LOC = "A3" ;/);
});

const ucfPort = (p) => { const t = p.sig.t, bus = t.w > 1 || (t.kind === 'logic' && !t.scalar); return { name: p.name, dir: p.dir, width: t.w, msb: bus ? t.left : null, lsb: bus ? t.right : null }; };

test('on the Board Emulator\'s compiled engine, on a Basys2: a line comes back at 9600 baud, the LEDs show its last byte, BTN0 sends the message', { timeout: 300000 }, async () => {
  const r = resolveBoard('basys2', { variant: '250' }), board = { id: 'basys2', name: r.board.name, device: r.device, resources: r.resources };
  const design = designOf(ex.design, 'uart', { generics: { STABLE: 100, REFRESH: 100 } });
  const { json, top } = await netlistOf(design, { run: yosysNode });
  const ucf = exampleUcf('uart', { board: 'basys2', variant: '250' }).text;
  const wiring = boardWiring({ ports: design.top.ports, assignments: parseUcf(ucf, { ports: design.top.ports.map(ucfPort) }).assignments, board });
  wiring.clocks = emulatorClocks(wiring, design.top.ports);
  assert.deepEqual([uartPins(wiring).tx.loc, uartPins(wiring).rx.loc], ['A3', 'J3']);
  const cb = new CompiledBoard({ json, top, design, wiring, clock: 'clk', period: wiring.clocks[0].period, board });
  const port = (n) => design.top.ports.find((p) => p.name === n).sig;
  cb.force(port('rx'), { v: 1n, x: 0n });
  const BIT = 1e12 / 9600, bytes = textBytes('abc\n');
  uartFrames(bytes, BIT).forEach(({ dt, level }) => cb.at(1e8 + dt, () => cb.force(port('rx'), { v: BigInt(level), x: 0n })));
  cb.run(1e8 + (bytes.length + 2) * 10 * BIT);
  assert.deepEqual(cb.serial(), ok(bytes));
  assert.equal(cb.cs.get('led'), 13n, 'the LEDs: the last byte, CR');
  // BTN0, held long enough for its debouncer
  cb.force(port('btn'), { v: 1n, x: 0n });
  cb.run(cb.now + 200 * cb.period);
  cb.force(port('btn'), { v: 0n, x: 0n });
  cb.run(cb.now + 200 * cb.period + 21 * 10 * BIT);
  assert.deepEqual(cb.serial(), ok([...Buffer.from('Hello from Silinx!\r\n')]));
});
