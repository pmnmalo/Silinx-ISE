// The MCP server's simulate_drawing (server/mcp-simulate-drawing.js, #2880, #2674): an ASM chart and a state diagram
// stepped from their reset as their Try it panels step them (the same core functions: core/asm-sim.js, core/fsm.js),
// its text and its data; a drawing with errors, inputs that are not the drawing's, a file that is not such a drawing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-simdraw-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
const { simulateAsm, asmSimValue } = await import('../core/asm-sim.js');
const { simulateFsm } = await import('../core/fsm.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (args, text) => { const r = await call('simulate_drawing', args); assert.equal(r.isError, true); assert.equal(r.text, `simulate_drawing: ${text}`); };

/** A small chart: a decision with a conditional output on each exit, a register, an active-low asynchronous reset. */
const small = () => ({
  version: 1, name: 'tiny', lang: 'vhdl', clock: 'clk', reset: { name: 'rst_n', active: 'low', sync: false }, encoding: 'binary',
  inputs: [{ name: 'go', width: 1 }, { name: 'd', width: 3 }], outputs: [{ name: 'busy', width: 1, default: '0' }, { name: 'y', width: 2, default: '0' }],
  registers: [{ name: 'n', width: 3, init: '0' }],
  nodes: [
    { id: 's1', type: 'state', name: 'IDLE', actions: [] }, { id: 'd1', type: 'decision', cond: 'go' },
    { id: 'o1', type: 'output', actions: ['y = 1', 'n = d'] }, { id: 'o2', type: 'output', actions: ['y = 2'] },
    { id: 's2', type: 'state', name: 'BUSY', actions: ['busy', 'n = n - 1'] }, { id: 'd2', type: 'decision', cond: 'n == 0' },
  ],
  edges: [{ from: 's1', to: 'd1' }, { from: 'd1', to: 'o1', port: 'true' }, { from: 'd1', to: 'o2', port: 'false' }, { from: 'o1', to: 's2' }, { from: 'o2', to: 's1' },
    { from: 's2', to: 'd2' }, { from: 'd2', to: 's1', port: 'true' }, { from: 'd2', to: 's2', port: 'false' }],
  initial: 's1',
});

test('simulate_drawing: an ASM chart, cycle by cycle (its path, its Mealy outputs, its register, the reset)', async () => {
  await ok('new_project', { name: 'a' });
  await ok('write_file', { project: 'a', path: 'src/tiny.asm.json', text: JSON.stringify(small()) });
  const r = await ok('simulate_drawing', { project: 'a', file: 'src/tiny.asm.json', cycles: [{ go: 1, d: 2 }, {}, { go: 1 }, { d: '101' }, { rst_n: 0 }] });
  assert.equal(r.text, [
    'tiny.asm.json from its reset, 5 clock cycle(s):',
    'cycle 0: state IDLE; inputs go=1 d=010 rst_n=1; outputs busy=0 y=01; registers n=000; path go → 1, [y = 1, n = d]; next state BUSY',
    'cycle 1: state BUSY; inputs go=0 d=000 rst_n=1; outputs busy=1 y=00; registers n=010; path n == 0 → 0; next state BUSY',
    'cycle 2: state BUSY; inputs go=1 d=000 rst_n=1; outputs busy=1 y=00; registers n=001; path n == 0 → 0; next state BUSY',
    'cycle 3: state BUSY; inputs go=0 d=101 rst_n=1; outputs busy=1 y=00; registers n=000; path n == 0 → 1; next state IDLE',
    'cycle 4: state IDLE (reset); inputs go=0 d=000 rst_n=0; outputs busy=0 y=10; registers n=000; path go → 0, [y = 2]; next state IDLE',
  ].join('\n'));
  assert.deepEqual(r.data.cycles[0], { cycle: 0, state: 'IDLE', inputs: { go: 1, d: 2, rst_n: 1 }, outputs: { busy: 0, y: 1 }, registers: { n: 0 }, next: 'BUSY',
    path: { nodes: ['d1', 'o1'], edges: ['e1', 'e2', 'e4'], outputs: ['o1'] }, blocks: [] });
  assert.equal(r.data.kind, 'asm');
});

test('simulate_drawing: the examples\' charts, as core/asm-sim.js and core/fsm.js simulate them', async () => {
  await ok('new_project_from_example', { name: 'b', example: 'blinky' });
  const chart = JSON.parse((await ok('read_file', { project: 'b', path: 'src/speed_ctrl.asm.json' })).text);
  const cycles = Array.from({ length: 40 }, (_, k) => ({ faster: k % 7 < 4 ? 1 : 0, slower: k % 11 < 2 ? 1 : 0, tick: k % 3 === 0 ? 1 : 0 }));
  const r = await ok('simulate_drawing', { project: 'b', file: 'src/speed_ctrl.asm.json', cycles });
  const json = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, asmSimValue(v)]));
  assert.deepEqual(r.data.cycles.map((c) => [c.state, c.outputs, c.registers, c.next]),
    simulateAsm(chart, cycles).map((c) => [c.state, json(c.outputs), json(c.registers), c.next]));
  assert.equal(r.text.split('\n').length, 41);
  await ok('new_project_from_example', { name: 't', example: 'traffic' });
  const f = JSON.parse((await ok('read_file', { project: 't', path: 'src/traffic.fsm.json' })).text);
  const v = [{}, { req: 1, done: 1 }, { done: 1 }, { done: 1 }, { night: 1 }];
  const t = await ok('simulate_drawing', { project: 't', file: 'src/traffic.fsm.json', cycles: v });
  assert.equal(t.data.kind, 'fsm');
  const name = (sid) => f.states.find((s) => s.id === sid).name;
  assert.deepEqual(t.data.cycles.map((c) => [c.state, c.outputs.phase, c.next]), simulateFsm(f, v).map((c) => [name(c.state), Number(c.outputs.phase), name(c.next)]));
  assert.equal(t.text.split('\n')[2], 'cycle 1: state CARS; inputs req=1 done=1 night=0; outputs phase=000; transition t2; next state CARS_YELLOW');
  assert.equal(t.text.split('\n')[1], 'cycle 0: state CARS; inputs req=0 done=0 night=0; outputs phase=000; no transition is true; next state CARS');
});

test('simulate_drawing: a drawing with errors is not simulated; inputs that are not its own; not such a drawing', async () => {
  await ok('new_project', { name: 'e' });
  const m = small();
  m.edges = m.edges.filter((e) => !(e.from === 'd1' && e.port === 'false'));
  await ok('write_file', { project: 'e', path: 'src/bad.asm.json', text: JSON.stringify(m) });
  await fails({ project: 'e', file: 'src/bad.asm.json', cycles: [{}] }, "The chart cannot be simulated: correct its errors first\nERROR: Decision 'go' has no 0 (false) branch");
  await ok('write_file', { project: 'e', path: 'src/tiny.asm.json', text: JSON.stringify(small()) });
  const f = { project: 'e', file: 'src/tiny.asm.json' };
  await fails({ ...f, cycles: [{ go: 1 }, { stop: 1 }] }, "cycle 1: 'stop' is not an input (the inputs: go, d, rst_n)");
  await fails({ ...f, cycles: [{ d: 8 }] }, 'cycle 0: d = 8 does not fit in 3 bit(s)');
  await fails({ ...f, cycles: [{ d: -1 }] }, 'cycle 0: d = -1: a non-negative integer or binary digits ("0101")');
  await fails({ ...f, cycles: [] }, 'cycles: one object of inputs per clock cycle, e.g. [{ "go": 1 }, { "go": 0 }]');
  await fails({ project: 'e', file: 'src/x.vhd', cycles: [{}] }, "'src/x.vhd' is not an ASM chart, a state diagram or a schematic (.asm.json, .fsm.json, .sch.json)");
  await fails({ project: 'e', file: 'src/none.asm.json', cycles: [{}] }, "no drawing 'src/none.asm.json' in the project 'e'");
  const fsm = { name: 'z', inputs: [], outputs: [], states: [{ id: 's1', name: '', x: 0, y: 0, outputs: {} }], transitions: [], initial: 's1' };
  await ok('write_file', { project: 'e', path: 'src/z.fsm.json', text: JSON.stringify(fsm) });
  await fails({ project: 'e', file: 'src/z.fsm.json', cycles: [{}] }, 'ERROR: State has no name\nCorrect the errors of the diagram to simulate it.');
});
