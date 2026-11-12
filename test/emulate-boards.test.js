// The Board Emulator on the boards of the 7-series (the Basys 3, the Nexys A7), the ECP5 (the ULX3S) and the Gowin (the
// Tang Nano 9K), #3704: the emulator runs the HDL on the board's pins, read from the constraints in the family's format
// (XDC, LPF, CST: web/js/constraints-format.js readPins) as from a UCF; the examples' constraints as the New Project wizard
// writes them, their warnings (the ports with no pin on the board) asserted; what the board shows from both engines, the
// switches and the buttons driving the LEDs and the display.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ui/core-hooks.js';
import { EXAMPLES, XC7_TARGETS, ECP5_TARGETS, GOWIN_TARGETS, example, exampleUcf, exampleBoard } from './examples-lib.mjs';
import { designOf, rng } from './compiled-diff.js';
import { engines, boardOf, shown, ucfPort } from './emulate-lib.js';
import { timingGenerics, autoTimeScale, scaledGenerics } from '../core/emulate.js';
import { constraintsDiagnostics } from '../core/constraints-check.js';
import { constraintsFormatOf } from '../packages/silinx-fpga/src/family.js';

const { readPins } = await import('../web/js/constraints-format.js');

const BOARDS = [...XC7_TARGETS, ...ECP5_TARGETS, ...GOWIN_TARGETS].map((t) => t.board);
// the ports with no pin on the board, as the wizard warns them (exampleUcf's unmatched, the wiring's unmapped): the ULX3S's
// four switches (sw<4..7> of isqrt and micro80); none elsewhere
const UNMAPPED = { 'ulx3s isqrt': ['sw<7>', 'sw<6>', 'sw<5>', 'sw<4>'], 'ulx3s micro80': ['sw<7>', 'sw<6>', 'sw<5>', 'sw<4>'] };
// and the LPF's check says so (core/constraints-check.js): the line of the last LOCATE
const LPF_WARNING = { isqrt: [26, 'isqrt_top'], micro80: [32, 'micro80_top'] };
// what both engines show, alike to 1e-4: the Tang Nano 9K's 27 MHz clock is 37037 ps, its halves 18519 and 18518 ps in the
// event-driven engine (a rising edge 1 ps off the compiled engine's cycle boundary), the brightness of an LED or a segment up to 2e-5 apart
const near = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-4
  : a && b && typeof a === 'object' ? Object.keys({ ...a, ...b }).every((k) => near(a[k], b[k])) : a === b);
function alike(st, msg) {
  const c = shown(st.cb), e = shown(st.ev);
  if (!near(c, e)) assert.deepEqual(c, e, msg);
}

/** An example on a board, as the emulator opens it: its constraints the wizard's, read as web/js/viewers.js openEmulator reads them. */
async function emulated(name, board, generics) {
  const t = exampleBoard(name, { board });
  const ex = example(name);
  const { text, device, unmatched } = exampleUcf(name, t);
  const b = await engines({ sources: ex.design, top: ex.project.top, generics, assignments: readPins(device, text).assignments, board: boardOf(t.board) });
  const ports = b.design.top.ports.map(ucfPort);
  const diags = constraintsDiagnostics(constraintsFormatOf(device), text, { ports, top: ex.project.top, device, board: boardOf(t.board) });
  return { ...b, text, device, unmatched, diags };
}

// the display as it reads, AN3 (the leftmost digit) first: each digit's 7-segment pattern (seg[0] = a … seg[6] = g, lit = 1), its point
const DIGITS = { '0000000': ' ', '1111110': '0', '0110000': '1', '1101101': '2', '1111001': '3', '0110011': '4', '1011011': '5', '1011111': '6', '1110000': '7', '1111111': '8', '1111011': '9' };
const digitsOf = (st) => st.prev.digits.map((d) => (d ? (DIGITS[d.seg.map(Math.round).join('')] ?? '?') + (Math.round(d.dp) ? '.' : '') : ' ')).reverse().join('');

for (const board of BOARDS) {
  test(`#3704 gates on the ${board}: its ${board === 'ulx3s' ? 'LPF' : board === 'tangnano9k' ? 'CST' : 'XDC'}'s pins, no warning; SW3..SW0 light LD0 and LD1 for a prime, on both engines`, async () => {
    const b = await emulated('gates', board);
    assert.deepEqual([b.unmatched, b.wiring.unmapped, b.diags], [[], [], []]);
    assert.deepEqual(b.wiring.bits.map((x) => [x.bit, x.kind]).sort(), [['led<0>', 'led'], ['led<1>', 'led'], ['sw<0>', 'sw'], ['sw<1>', 'sw'], ['sw<2>', 'sw'], ['sw<3>', 'sw']]);
    assert.equal(b.cb.clock, null);
    for (let n = 0; n < 16; n++) {
      b.force('sw', BigInt(n));
      const st = b.window(4);
      const prime = [2, 3, 5, 7, 11, 13].includes(n) ? 1 : 0;
      assert.deepEqual(st.ev.prev.leds.slice(0, 2), [prime, prime], `${n}: the event-driven engine`);
      alike(st, `${n}: the compiled engine`);
    }
    assert.deepEqual(b.cb.log, []);
  });
}

for (const board of XC7_TARGETS.map((t) => t.board)) {
  test(`#3704 stopwatch on the ${board}: its 100 MHz clock; BTN0 starts and stops it on the display, SW0 resets it`, async () => {
    const b = await emulated('stopwatch', board, { CS: 20, STABLE: 4, REFRESH: 4 });
    assert.deepEqual([b.unmatched, b.wiring.unmapped, b.diags], [[], [], []]);
    assert.deepEqual([b.cb.clock, b.period], ['clk', 10000]);
    const show = (n) => { const st = b.window(n); alike(st); return digitsOf(st.ev); };
    b.force('sw', 0n);
    b.force('btn', 0n);
    assert.equal(show(400), ' 0.00', 'at rest: 0.00');
    assert.equal(show(400), ' 0.00', 'not started: still 0.00');
    const press = (bit) => { b.force('btn', 1n << BigInt(bit)); b.window(40); b.force('btn', 0n); b.window(40); };
    press(0);   // (BTN0, the centre button BTNC: btn[0] on the 7-series' boards)
    const a = show(400), c = show(400);
    assert.match(a, /^[ \d]\d\.\d\d$/);
    assert.ok(Number(c) > Number(a), `running: ${a} then ${c}`);
    press(0);
    const s = show(400);
    assert.equal(show(400), s, 'stopped: the time stays');
    b.force('sw', 1n);
    b.window(40);
    b.force('sw', 0n);
    assert.equal(show(400), ' 0.00', 'SW0: reset');
    assert.deepEqual(b.cb.log, []);
  });
}

for (const board of BOARDS) {
  for (const name of EXAMPLES) {
    test(`#3704 example ${name} on the ${board}: the compiled engine shows what the event-driven one shows, its warnings the wizard's`, async () => {
      const ex = example(name);
      const gens = timingGenerics(designOf(ex.design, ex.project.top).top.params);
      const generics = gens.length ? scaledGenerics(gens, autoTimeScale(gens) * 50) : undefined;
      const b = await emulated(name, board, generics);
      assert.deepEqual(b.wiring.unmapped.map((u) => u.bit), UNMAPPED[`${board} ${name}`] || []);
      assert.deepEqual(b.unmatched, UNMAPPED[`${board} ${name}`] ? ['sw[4..]'] : []);
      const w = board === 'ulx3s' && LPF_WARNING[name];
      assert.deepEqual(b.diags, w ? [{ severity: 'warning', line: w[0], message: `4 port bit(s) of '${w[1]}' have no pin (LOCATE COMP): sw[4], sw[5], sw[6], sw[7]` }] : []);
      assert.equal(b.cb.clock, name === 'gates' ? null : 'clk');
      const ins = b.design.top.ports.filter((p) => p.dir === 'in' && p.name !== 'clk');
      const r = rng(5);
      const vgaPorts = name === 'vga' ? b.design.top.ports.filter((p) => p.name.startsWith('vga_')) : [];
      const pins = (get) => vgaPorts.map((p) => { const v = get(p); return `${p.name}=${v.v}/${v.x}`; });
      let lit = 0, changes = 0, last = null;
      for (let k = 0; k < 60; k++) {
        if (k % 7 === 0) for (const p of ins) b.force(p.name, BigInt(Math.floor(r() * 2 ** p.sig.t.w)));
        const st = b.window(1 + Math.floor(r() * 400));
        alike(st, `window ${k}`);
        lit += st.ev.prev.leds.filter((x) => x > 0).length + st.ev.prev.digits.filter(Boolean).length;
        const ev = pins((p) => p.sig.val), cb = pins((p) => b.cb.value(b.cdesign.top.ports.find((q) => q.name === p.name).sig));
        assert.deepEqual(cb, ev, `window ${k}: the VGA pins`);
        if (last && ev.join() !== last) changes++;
        last = ev.join();
      }
      if (name === 'vga') assert.ok(changes > 25, `the VGA pins changed after ${changes} windows`);
      else assert.ok(lit > 25, `${lit} LEDs / digits lit`);
      assert.deepEqual(b.cb.log, []);
    });
  }
}
