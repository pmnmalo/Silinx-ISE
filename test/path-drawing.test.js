// A timing path in a drawing (#3178, core/path-drawing.js): a Yosys name's signal; the names of a path in the module
// generated into a file (the nets next to its stages, the signals its cells drive); the elements of a state diagram
// (the traffic example's), an ASM chart (blinky's speed_ctrl) and a schematic (gates) on them; and on the open flow's
// paths (packages/silinx-fpga: each stage's signals), the drawing's HDL generated in VHDL and in Verilog marking the same
// elements.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { signalOf, pathNames, drawingPath } from '../core/path-drawing.js';
import { generateFsm } from '../core/fsm-hdl.js';
import { generate as generateAsm } from '../core/asm-gen.js';
import { netlist } from '../core/schdoc.js';
import { flow } from './timesim-lib.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'examples', f), 'utf8'));
const FSM = read('traffic/src/traffic.fsm.json'), ASM = read('blinky/src/speed_ctrl.asm.json'), SCH = read('gates/src/gates.sch.json');
const ids = (items, type) => items.filter(x => x.type === type).map(x => x.id);

test('signalOf: a Yosys name\'s signal, its bit index and hierarchy dropped; none for the names Yosys made', () => {
  assert.equal(signalOf('u_fsm.state_reg[2]'), 'state_reg');
  assert.equal(signalOf('night'), 'night');
  assert.equal(signalOf('u_top.u_speed.level'), 'level');
  assert.equal(signalOf('$abc$4113$blif$4113$10.A[1]'), null);
  assert.equal(signalOf('$techmap4334$abc$x'), null);
  assert.equal(signalOf('u1.\\odd name'), null);
  assert.equal(signalOf(null), null);
});

test('pathNames: the nets next to a stage of the file and the signals its stages drive, lower case, a register\'s parts as one', () => {
  const src = file => [{ file, line: 1, block: 'b' }];
  const p = { stages: [
    { kind: 'clock-to-out', sources: src('src/a.vhd'), signals: ['u_a.State_Reg'] },
    { kind: 'net', net: 'u_a.night_sync' },
    { kind: 'logic', sources: src('src/a.vhd'), signals: ['u_a.cnt_next', '$abc$1$x'] },
    { kind: 'net', net: '$abc$7$y.A[0]' },
    { kind: 'logic', sources: src('src/b.v'), signals: ['u_b.other'] },
    { kind: 'net', net: 'u_b.far[3]' },
    { kind: 'setup', sources: src('src/b.v'), signals: ['u_b.q'] }] };
  assert.deepEqual([...pathNames(p, 'src/a.vhd')], ['state', 'night', 'cnt']);
  assert.deepEqual([...pathNames(p, 'src/b.v')], ['other', 'far', 'q']);
  assert.deepEqual([...pathNames(p, 'src/c.vhd')], []);
  // (a stage with no signals: an older paths.json)
  assert.deepEqual([...pathNames({ stages: [{ kind: 'setup', sources: src('src/a.vhd') }] }, 'src/a.vhd')], []);
});

test('drawingPath: a state diagram\'s states on the state register, the transitions reading the path, the states driving its output', () => {
  const all = FSM.states.map(s => s.id);
  assert.deepEqual(ids(drawingPath('fsm', FSM, new Set(['state'])), 'state'), all);
  assert.deepEqual(ids(drawingPath('fsm', FSM, new Set(['state'])), 'trans'), []);
  const night = drawingPath('fsm', FSM, new Set(['night']));
  assert.deepEqual(night.map(x => `${x.type} ${x.label}`), ['trans CARS -> NIGHT (night)', 'trans CARS -> CARS_YELLOW (!night && req && done)', 'trans NIGHT -> CARS (!night)']);
  // (a Moore output: the states that set it, each of traffic's)
  assert.deepEqual(ids(drawingPath('fsm', FSM, new Set(['phase'])), 'state'), all);
  // a Mealy machine: the transitions that drive the output
  const mealy = { states: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], transitions: [
    { id: 't1', from: 'a', to: 'b', cond: 'go', outputs: { y: '1' } }, { id: 't2', from: 'b', to: 'a', cond: 'stop', outputs: {} }] };
  assert.deepEqual(drawingPath('fsm', mealy, new Set(['y'])), [{ type: 'trans', id: 't1', label: 'A -> B (go)' }]);
  assert.deepEqual(ids(drawingPath('fsm', mealy, new Set(['stop'])), 'trans'), ['t2']);
  assert.deepEqual(drawingPath('fsm', FSM, new Set()), []);
  assert.deepEqual(drawingPath('fsm', FSM, new Set(['unknown'])), []);
});

test('drawingPath: an ASM chart\'s boxes that read or assign the path\'s signals, the arrows between two of them, its state boxes on the register', () => {
  const level = drawingPath('asm', ASM, new Set(['level']));
  const node = id => ASM.nodes.find(n => n.id === id);
  assert.ok(ids(level, 'node').length);
  for (const id of ids(level, 'node')) assert.match(`${node(id).cond ?? ''} ${(node(id).actions || []).join(' ')}`, /\blevel\b/, id);
  // (every box that names level, and no other)
  assert.deepEqual(ids(level, 'node'), ASM.nodes.filter(n => /\blevel\b/.test(`${n.cond ?? ''} ${(n.actions || []).join(' ')}`)).map(n => n.id));
  for (const e of ASM.edges.filter(x => ids(level, 'edge').includes(x.id))) assert.ok(ids(level, 'node').includes(e.from) && ids(level, 'node').includes(e.to));
  assert.equal(level.find(x => x.id === 'd2').label, 'level != 0');
  assert.deepEqual(ids(drawingPath('asm', ASM, new Set(['state'])), 'node'), ASM.nodes.filter(n => n.type === 'state').map(n => n.id));
});

test('drawingPath: a schematic\'s wires of the path\'s nets and the symbols that drive them; an I/O marker\'s net by its name', () => {
  const nl = netlist(SCH);
  const net = name => nl.nets.find(n => n.name === name);
  const p1 = drawingPath('sch', SCH, new Set(['p1']));
  assert.deepEqual(ids(p1, 'sym'), net('p1').endpoints.filter(e => e.dir === 'out').map(e => e.sym));
  assert.deepEqual(ids(p1, 'wire'), net('p1').wires);
  assert.equal(p1.find(x => x.type === 'sym').label, 'and_p1');
  // (the generated HDL's line of that net: the symbol's gate)
  assert.match(fs.readFileSync(path.join(ROOT, 'examples/gates/src/gates.vhd'), 'utf8'), /^ {2}p1 <= a_n and b_n and c;$/m);
  const led = drawingPath('sch', SCH, new Set(['led']));
  assert.deepEqual(led.map(x => `${x.type} ${x.label}`), ['sym join_led', 'wire led']);
  assert.deepEqual(drawingPath('sch', { broken: true }, new Set(['p1'])), []);
  assert.deepEqual(drawingPath('pn', SCH, new Set(['p1'])), []);
});

// the open flow on a drawing's module (its HDL generated in VHDL and in Verilog, as the top): every path marks some of the
// drawing's elements, and the slowest marks the same in both languages
const UCF = 'NET "clk" TNM_NET = clk;\nTIMESPEC TS_clk = PERIOD "clk" 20 ns HIGH 50%;\n';
async function marks(kind, model, lang) {
  const { code } = kind === 'asm' ? generateAsm(model, lang) : generateFsm(model, lang);
  const file = `src/${model.name}.${lang === 'vhdl' ? 'vhd' : 'v'}`;
  const r = await flow({ top: model.name, steps: ['synth', 'translate', 'map', 'par', 'trce'] }, [{ path: file, lang, role: 'design', text: code }], [], UCF);
  return JSON.parse(r.store['open/paths.json']).paths.map(p => ({ names: [...pathNames(p, file)].sort(), items: drawingPath(kind, model, pathNames(p, file)) }));
}

// Which of the slow paths comes first follows the placement: with nextpnr 1.5.2 the VHDL's counter (cnt_f) is a little
// slower than the comparison, the Verilog's is not (#3514); the comparison's path is among the slowest in both.
test('the open flow: the ASM chart\'s paths in VHDL and in Verilog, each on its boxes; level and ticks (its comparison box) among the slowest', { timeout: 300000 }, async () => {
  const [v, w] = [await marks('asm', ASM, 'vhdl'), await marks('asm', ASM, 'verilog')];
  const cmp = m => m.find(p => p.names.join() === 'level,ticks');
  for (const m of [v, w]) {
    assert.equal(m.length, 20);
    assert.ok(m.every(p => p.items.length), JSON.stringify(m.filter(p => !p.items.length).map(p => p.names)));
    // (among the 12 slowest: the debouncers' counters of 21 bits, for 100 MHz boards, #3710, a little slower)
    assert.ok(m.findIndex(p => p.names.join() === 'level,ticks') < 12, JSON.stringify(m.map(p => p.names)));
    assert.ok(cmp(m).items.some(x => x.label === 'ticks >= (1 << level) - 1'));
  }
  assert.deepEqual(cmp(v).items, cmp(w).items);
});

test('the open flow: the state diagram\'s paths in VHDL and in Verilog, from the state register: its states', { timeout: 300000 }, async () => {
  for (const lang of ['vhdl', 'verilog']) {
    const m = await marks('fsm', FSM, lang);
    assert.ok(m.length);
    for (const p of m) assert.deepEqual(ids(p.items, 'state'), FSM.states.map(s => s.id), lang);
  }
});
