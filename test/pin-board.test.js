// I/O Pin Planning on the board (#2694, #2715, core/pin-board.js): a port, or one bit of a bus, dropped on a part of the Basys2
// or the Nexys2 and the pins it takes; bits taken off their pins; against the boards' own resources (server/boards.js) and the UCF.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARDS } from '../server/boards.js';
import { portNets, portBit, pinLabels, resourceOfPin, digitTarget, boardDrop, boardRemove } from '../core/pin-board.js';
import { generateUcf, parseUcf } from '../packages/silinx-fpga/src/parts.js';

const board = (id) => BOARDS.find((b) => b.id === id);
const B2 = board('basys2'), N2 = board('nexys2');
const res = (b, name) => b.resources.find((r) => r.name === name);
const port = (name, dir, width = 1, downto = true) => (width === 1 && downto !== null
  ? { name, dir, width, msb: null, lsb: null, bus: false }
  : { name, dir, width, msb: downto ? width - 1 : 0, lsb: downto ? 0 : width - 1, bus: true });
const locs = (changes) => Object.fromEntries(Object.entries(changes).map(([n, a]) => [n, a.loc ?? null]));

test('portNets: a bit, a bus downto and to, lowest bit first; a 1-bit vector is x<0>', () => {
  assert.deepEqual(portNets(port('y', 'out')), [{ net: 'y', bit: null }]);
  assert.deepEqual(portNets(port('d', 'in', 3)).map((x) => x.net), ['d<0>', 'd<1>', 'd<2>']);
  assert.deepEqual(portNets(port('d', 'in', 3, false)).map((x) => x.net), ['d<0>', 'd<1>', 'd<2>']);
  assert.deepEqual(portNets(port('v', 'in', 1, null)).map((x) => x.net), ['v<0>']);
  assert.deepEqual(portNets({ name: 'q', width: 2, msb: 5, lsb: 4, bus: true }).map((x) => x.net), ['q<4>', 'q<5>']);
});

test('pinLabels and resourceOfPin: the names the table shows; any case; a pin not on the board', () => {
  assert.deepEqual(pinLabels(res(B2, 'btn')), ['btn<0>', 'btn<1>', 'btn<2>', 'btn<3>']);
  assert.deepEqual(pinLabels(res(B2, 'mclk')), ['mclk']);
  assert.deepEqual(resourceOfPin(B2, 'g12'), { res: res(B2, 'btn'), idx: 0 });
  assert.equal(resourceOfPin(B2, 'Z99'), null);
  assert.equal(resourceOfPin(null, 'G12'), null);
});

test('a bit on an LED, a switch, a button: that pin, no warning', () => {
  const r = boardDrop({ port: port('y', 'out'), res: res(B2, 'led'), index: 3 });
  assert.deepEqual(locs(r.changes), { y: 'P6' });
  assert.deepEqual([r.placed, r.notes, r.warnings, r.clocks], [[['y', 'led<3>']], [], [], []]);
  assert.deepEqual(boardDrop({ port: port('a', 'in'), res: res(N2, 'sw'), index: 7 }).placed, [['a', 'sw<7>']]);
  assert.deepEqual(locs(boardDrop({ port: port('b', 'in'), res: res(N2, 'btn'), index: 1 }).changes), { b: res(N2, 'btn').pins[1] });
});

test('a bus spreads over the row from the part dropped on, moved back to fit it', () => {
  const led = res(B2, 'led');
  let r = boardDrop({ port: port('led', 'out', 8), res: led, index: 0 });
  assert.deepEqual(Object.values(locs(r.changes)), led.pins);
  assert.deepEqual(r.placed.at(-1), ['led<7>', 'led<7>']);
  assert.deepEqual(r.warnings, []);
  r = boardDrop({ port: port('q', 'out', 4), res: led, index: 2 });
  assert.deepEqual(r.placed, [['q<0>', 'led<2>'], ['q<1>', 'led<3>'], ['q<2>', 'led<4>'], ['q<3>', 'led<5>']]);
  r = boardDrop({ port: port('q', 'out', 4), res: led, index: 6 });
  assert.deepEqual(r.placed.map(([, l]) => l), ['led<4>', 'led<5>', 'led<6>', 'led<7>']);
  // an "0 to 3" bus the same: bit 0 first
  r = boardDrop({ port: port('s', 'in', 4, false), res: res(N2, 'sw'), index: 0 });
  assert.deepEqual(r.placed.map(([n]) => n), ['s<0>', 's<1>', 's<2>', 's<3>']);
});

test('a bus wider than the row: the bits left unplaced (warned, their pins cleared)', () => {
  const r = boardDrop({ port: port('d', 'in', 6), res: res(B2, 'btn'), index: 2, assignments: { 'd<5>': { loc: 'P11' } } });
  assert.deepEqual(locs(r.changes), { 'd<0>': 'G12', 'd<1>': 'C11', 'd<2>': 'M4', 'd<3>': 'A7', 'd<4>': null, 'd<5>': null });
  assert.deepEqual(r.warnings, ['d has 6 bits, btn 4: d<4>, d<5> not placed']);
});

test('direction: an output on a switch, an input on an LED warned; inout on either and a Pmod not', () => {
  assert.deepEqual(boardDrop({ port: port('y', 'out'), res: res(B2, 'sw'), index: 0 }).warnings, ['y is an output: sw is an input of the board']);
  assert.deepEqual(boardDrop({ port: port('a', 'in'), res: res(N2, 'led'), index: 0 }).warnings, ['a is an input: led is an output of the board']);
  assert.deepEqual(boardDrop({ port: port('io', 'inout'), res: res(B2, 'led'), index: 0 }).warnings, []);
  assert.deepEqual(boardDrop({ port: port('y', 'out', 4), res: res(B2, 'jb'), index: 0 }).warnings, []);
});

test('a pin another port has is taken from it; a port dropped again moves, its other bits keep theirs', () => {
  const asg = { a: { loc: 'P11' }, 'q<0>': { loc: 'M5' }, 'q<1>': { loc: 'M11' }, y: { loc: 'p7', iostandard: 'LVCMOS33' } };
  const r = boardDrop({ port: port('b', 'in'), res: res(B2, 'sw'), index: 0, assignments: asg });
  assert.deepEqual(locs(r.changes), { b: 'P11', a: null });
  assert.deepEqual(r.notes, ['sw<0> taken from a']);
  // q moved to LD2..LD3: it leaves LD0, LD1; y (on LD2, written in lower case) loses its pin
  const m = boardDrop({ port: port('q', 'out', 2), res: res(B2, 'led'), index: 2, assignments: asg });
  assert.deepEqual(locs(m.changes), { 'q<0>': 'P7', 'q<1>': 'P6', y: null });
  assert.deepEqual(m.notes, ['led<2> taken from y']);
  // dropped where it is: nothing taken
  assert.deepEqual(boardDrop({ port: port('a', 'in'), res: res(B2, 'sw'), index: 0, assignments: asg }).notes, []);
});

test('the resource\'s pull, drive and slew; a clock\'s period; a bus on a clock warned', () => {
  const r = boardDrop({ port: port('ps2c', 'inout'), res: res(B2, 'ps2_clk'), index: 0 });
  assert.deepEqual(r.changes.ps2c, { loc: 'B1', pull: 'up', drive: 2, slew: undefined });
  const c = boardDrop({ port: port('clk', 'in'), res: res(B2, 'mclk'), index: 0 });
  assert.deepEqual(c.clocks, [{ net: 'clk', period: 20, duty: 50 }]);
  const b = boardDrop({ port: port('ck', 'in', 2), res: res(N2, 'clk'), index: 0 });
  assert.deepEqual([b.clocks, b.warnings], [[], ['ck has 2 bits, clk 1: ck<1> not placed']]);
});

test('a digit of the 7-segment display: the anode, dp, the segments, with DP, the anodes', () => {
  for (const b of [B2, N2]) {
    assert.deepEqual(digitTarget(b, port('an0', 'out'), 2), { res: res(b, 'an'), index: 2 });
    assert.deepEqual(digitTarget(b, port('dp', 'out'), 2), { res: res(b, 'dp'), index: 0 });
    assert.deepEqual(digitTarget(b, port('seg', 'out', 7), 3), { res: res(b, 'seg'), index: 0 });
    assert.deepEqual(digitTarget(b, port('an', 'out', 4), 3), { res: res(b, 'an'), index: 0 });
    assert.deepEqual(digitTarget(b, port('an', 'out', 2), 3), { res: res(b, 'an'), index: 3 });
    assert.deepEqual(digitTarget(b, port('x', 'out', 12), 0).res.name, 'seg');
    const s8 = digitTarget(b, port('sseg', 'out', 8), 1);
    const r = boardDrop({ port: port('sseg', 'out', 8), ...s8 });
    assert.deepEqual(Object.values(locs(r.changes)), [...res(b, 'seg').pins, ...res(b, 'dp').pins]);
    assert.deepEqual(r.placed.map(([, l]) => l), ['seg<0>', 'seg<1>', 'seg<2>', 'seg<3>', 'seg<4>', 'seg<5>', 'seg<6>', 'dp']);
    assert.deepEqual(r.warnings, []);
  }
  assert.equal(digitTarget({ resources: [res(B2, 'led')] }, port('a', 'out'), 0), null);
});

test('the drops written to a UCF and read back: the pins of the board (Basys2)', () => {
  const asg = {};
  const drop = (p, r, i) => { for (const [n, a] of Object.entries(boardDrop({ port: p, res: r, index: i, assignments: asg }).changes)) asg[n] = { ...asg[n], ...a }; };
  const ports = [port('sw', 'in', 4), port('led', 'out', 4), port('go', 'in')];
  drop(ports[0], res(B2, 'sw'), 0); drop(ports[1], res(B2, 'led'), 4); drop(ports[2], res(B2, 'btn'), 3);
  const text = generateUcf({ ports: ports.map(({ name, dir, msb, lsb, width }) => ({ name, dir, msb, lsb, width })), assignments: asg, clocks: [] });
  const back = parseUcf(text).assignments;
  assert.deepEqual(Object.fromEntries(Object.entries(back).map(([n, a]) => [n, a.loc])),
    { 'sw<0>': 'P11', 'sw<1>': 'L3', 'sw<2>': 'K3', 'sw<3>': 'B4', 'led<0>': 'N5', 'led<1>': 'N4', 'led<2>': 'P4', 'led<3>': 'G1', go: 'A7' });
});

test('#2715 one bit of a bus dropped alone: that pin only, the other bits kept; dropped again, moved; no clock; a digit its anode', () => {
  const led = port('led', 'out', 4), bit = portBit(led, 2);
  assert.deepEqual(bit, { name: 'led<2>', dir: 'out', width: 1, bus: false, net: 'led<2>', bit: 2, of: 'led' });
  assert.deepEqual(portNets(bit), [{ net: 'led<2>', bit: 2 }]);
  const asg = { 'led<0>': { loc: 'M5' }, 'led<2>': { loc: 'P4' } };
  const r = boardDrop({ port: bit, res: res(B2, 'led'), index: 6, assignments: asg });
  assert.deepEqual(locs(r.changes), { 'led<2>': res(B2, 'led').pins[6] });
  assert.deepEqual([r.placed, r.notes, r.warnings], [[['led<2>', 'led<6>']], [], []]);
  // (on the last LED: kept there, not moved back)
  assert.deepEqual(boardDrop({ port: bit, res: res(B2, 'led'), index: 7 }).placed, [['led<2>', 'led<7>']]);
  // a pin another bit of the same bus had: taken from it
  const t = boardDrop({ port: bit, res: res(B2, 'led'), index: 0, assignments: { 'led<0>': { loc: res(B2, 'led').pins[0] } } });
  assert.deepEqual([locs(t.changes), t.notes], [{ 'led<2>': res(B2, 'led').pins[0], 'led<0>': null }, ['led<0> taken from led<0>']]);
  // an input bit on the oscillator: no clock period (a bus's bit has none in the table)
  assert.deepEqual(boardDrop({ port: portBit(port('c', 'in', 2), 0), res: res(B2, 'mclk') }).clocks, []);
  assert.deepEqual(digitTarget(B2, portBit(port('an', 'out', 4), 1), 2), { res: res(B2, 'an'), index: 2 });
  // a bit on the board's input: warned with its name
  assert.deepEqual(boardDrop({ port: bit, res: res(B2, 'sw') }).warnings, ['led<2> is an output: sw is an input of the board']);
});

test('#2715 boardRemove: the bits taken off their pins, named by the board; a pin off the board; a bit with no pin left out', () => {
  const asg = { 'led<0>': { loc: 'm5', pull: 'up' }, 'led<1>': { loc: 'Z9' }, 'led<2>': {}, y: { loc: res(B2, 'mclk').pins[0] } };
  const r = boardRemove({ nets: ['led<0>', 'led<1>', 'led<2>', 'led<3>', 'y'], assignments: asg, board: B2 });
  assert.deepEqual(r.changes, { 'led<0>': { loc: undefined }, 'led<1>': { loc: undefined }, y: { loc: undefined } });
  assert.deepEqual(r.removed, [['led<0>', `led<${res(B2, 'led').pins.indexOf('M5')}>`, 'm5'], ['led<1>', 'Z9', 'Z9'], ['y', 'mclk', res(B2, 'mclk').pins[0]]]);
  assert.deepEqual(boardRemove({ nets: ['y'], assignments: {}, board: B2 }), { changes: {}, removed: [] });
  assert.deepEqual(boardRemove({ nets: ['y'], assignments: { y: { loc: 'B8' } }, board: null }).removed, [['y', 'B8', 'B8']]);
});
