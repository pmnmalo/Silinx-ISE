// The MCP server's set_fsm_outputs (server/mcp-fsm.js, #3814): a state's or a transition's outputs set as the state
// diagram editor's Properties set them (core/fsm-outputs.js): the traffic example's NIGHT state given phase 7 (its HDL
// made again), cleared (the default: left out of the file), a value too wide, not a constant or an output the machine
// does not have refused (nothing written), a transition's (the machine Mealy), the same values again (nothing written),
// a state or a transition not there, a file that is not a state diagram. set_fsm_look (#3883): a state's and a
// transition's look set (the HDL unchanged), the same again (nothing written), a value refused (nothing written), back
// to the default (no look in the file), Check's error on a look not valid written by write_file.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-fsm-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const PATH = 'src/traffic.fsm.json';
const read = async (path) => (await ok('read_file', { project: 't', path })).text;
const fsm = async () => JSON.parse(await read(PATH));

test('set_fsm_outputs: a state\'s value set (its HDL made again), cleared (the default), refused; a transition\'s (Mealy)', async () => {
  await ok('new_project_from_example', { name: 't', example: 'traffic' });
  const hdl0 = await read('src/traffic.vhd');
  assert.match(hdl0, /when S_NIGHT =>\n\s+phase <= "110";/);
  const r = await ok('set_fsm_outputs', { project: 't', path: PATH, state: 'NIGHT', values: { phase: '7' } });
  assert.deepEqual(r, { isError: false, text: 'State NIGHT: outputs set: phase = 7\nsrc/traffic.vhd updated from src/traffic.fsm.json',
    data: { project: 't', path: PATH, state: 'NIGHT', outputs: { phase: '7' }, kind: 'moore', hdl: { file: 'src/traffic.vhd', written: true } } });
  assert.match(await read('src/traffic.vhd'), /when S_NIGHT =>\n\s+phase <= "111";/);
  // the same again: nothing written
  assert.deepEqual(await ok('set_fsm_outputs', { project: 't', path: PATH, state: 'NIGHT', values: { phase: '7' } }), { isError: false,
    text: 'State NIGHT: its outputs are already these: phase = 7', data: { project: 't', path: PATH, state: 'NIGHT', outputs: { phase: '7' }, kind: 'moore' } });
  // refused: too wide, not a constant, not an output; the file as it was
  const before = await read(PATH);
  for (const [values, why] of [[{ phase: '8' }, 'the value 8 of phase does not fit in 3 bit(s)'], [{ phase: 'x' }, "the value 'x' of phase must be a constant (e.g. 0, 1, 4'b1010, 5)"],
    [{ lamp: '1' }, "'lamp' is not an output"], [{ phase: '1', lamp: '1' }, "'lamp' is not an output"]]) {
    const r = await call('set_fsm_outputs', { project: 't', path: PATH, state: 'NIGHT', values });
    assert.deepEqual([r.isError, r.text], [true, `set_fsm_outputs: State NIGHT: ${why} (not applied)`]);
  }
  assert.equal(await read(PATH), before);
  // cleared: left out of the file (the default, 0)
  const c = await ok('set_fsm_outputs', { project: 't', path: PATH, state: 'NIGHT', values: { phase: '' } });
  assert.equal(c.text, 'State NIGHT: outputs set: phase = (0: default)\nsrc/traffic.vhd updated from src/traffic.fsm.json');
  assert.deepEqual((await fsm()).states.find(s => s.name === 'NIGHT').outputs, {});
  assert.doesNotMatch(await read('src/traffic.vhd'), /when S_NIGHT =>\n\s+phase/);
  // a transition's: the machine Mealy; cleared: Moore again
  const t = await ok('set_fsm_outputs', { project: 't', path: PATH, transition: 't1', values: { phase: "3'b110" } });
  assert.equal(t.text, "Transition CARS → NIGHT: outputs set: phase = 3'b110\nsrc/traffic.vhd updated from src/traffic.fsm.json");
  assert.deepEqual([t.data.outputs, t.data.kind], [{ phase: "3'b110" }, 'mealy']);
  const u = await ok('set_fsm_outputs', { project: 't', path: PATH, transition: 't1', values: { phase: '' } });
  assert.deepEqual([u.text.split('\n')[0], u.data.kind], ["Transition CARS → NIGHT: outputs set: phase = (the state's)", 'moore']);
  // back to the example's values: its HDL as it was
  await ok('set_fsm_outputs', { project: 't', path: PATH, state: 'NIGHT', values: { phase: '6' } });
  assert.equal(await read('src/traffic.vhd'), hdl0);
});

test('set_fsm_outputs: a state or a transition not there, both or neither given, not a state diagram', async () => {
  const no = async (args, text) => { const r = await call('set_fsm_outputs', { project: 't', path: PATH, values: { phase: '1' }, ...args }); assert.deepEqual([r.isError, r.text], [true, `set_fsm_outputs: ${text}`]); };
  await no({ state: 'DAY' }, `no state 'DAY' in ${PATH}`);
  await no({ transition: 't99' }, `no transition 't99' in ${PATH}`);
  await no({}, 'give either state (its name) or transition (its id)');
  await no({ state: 'NIGHT', transition: 't1' }, 'give either state (its name) or transition (its id)');
  await no({ path: 'src/traffic.vhd', state: 'NIGHT' }, 'src/traffic.vhd: not a state diagram (.fsm.json)');
  await no({ path: 'src/none.fsm.json', state: 'NIGHT' }, "no file 'src/none.fsm.json' in the project 't'");
});

test('#3883 set_fsm_look: a state\'s and a transition\'s look set (the HDL unchanged), the same again, refused, back to the default', async () => {
  const hdl0 = await read('src/traffic.vhd');
  const r = await ok('set_fsm_look', { project: 't', path: PATH, state: 'NIGHT', look: { fill: '#FC0', fontSize: 16, textStyle: 'bold-italic', strokeWidth: '1.6' } });
  assert.deepEqual(r, { isError: false, text: 'State NIGHT: look set: fill colour #ffcc00, text size 16, text style bold-italic',
    data: { project: 't', path: PATH, state: 'NIGHT', look: { fill: '#ffcc00', fontSize: 16, textStyle: 'bold-italic' }, hdl: { file: 'src/traffic.vhd', written: false } } });
  assert.deepEqual((await fsm()).states.find(s => s.name === 'NIGHT').look, { fill: '#ffcc00', fontSize: 16, textStyle: 'bold-italic' });
  assert.equal(await read('src/traffic.vhd'), hdl0);
  const t = await ok('set_fsm_look', { project: 't', path: PATH, transition: 't1', look: { stroke: '#c00', dash: 'dashed', strokeWidth: 3, color: '#008000', font: 'serif' } });
  assert.equal(t.text, 'Transition CARS → NIGHT: look set: line colour #cc0000, line width 3, line style dashed, text colour #008000, font serif');
  assert.deepEqual((await fsm()).transitions.find(x => x.id === 't1').look, { stroke: '#cc0000', strokeWidth: 3, dash: 'dashed', color: '#008000', font: 'serif' });
  // the same again: nothing written
  const before = await read(PATH);
  assert.deepEqual(await ok('set_fsm_look', { project: 't', path: PATH, transition: 't1', look: { stroke: '#CC0000' } }), { isError: false,
    text: 'Transition CARS → NIGHT: its look is already this: line colour #cc0000, line width 3, line style dashed, text colour #008000, font serif',
    data: { project: 't', path: PATH, transition: 't1', look: { stroke: '#cc0000', strokeWidth: 3, dash: 'dashed', color: '#008000', font: 'serif' } } });
  // refused: nothing written
  for (const [args, why] of [[{ state: 'NIGHT', look: { fill: 'yellow' } }, "State NIGHT: the fill colour 'yellow' is not a colour: #rrggbb (e.g. #ffcc00)"],
    [{ state: 'NIGHT', look: { fontSize: 60 } }, 'State NIGHT: the text size 60 must be a whole number from 6 to 48'],
    [{ state: 'NIGHT', look: { dash: 'dotted' } }, "State NIGHT: 'dash' is not a property of a state's look (fill, stroke, strokeWidth, color, fontSize, textStyle, font)"],
    [{ transition: 't1', look: { strokeWidth: 0.1 } }, 'Transition CARS → NIGHT: the line width 0.1 must be a number from 0.5 to 10'],
    [{ transition: 't1', look: { color: '#fff', font: 'Arial' } }, "Transition CARS → NIGHT: the font 'Arial' must be one of sans-serif, serif, monospace"]]) {
    const x = await call('set_fsm_look', { project: 't', path: PATH, ...args });
    assert.deepEqual([x.isError, x.text], [true, `set_fsm_look: ${why} (not applied)`]);
  }
  assert.equal(await read(PATH), before);
  const no = await call('set_fsm_look', { project: 't', path: PATH, state: 'DAY', look: {} });
  assert.deepEqual([no.isError, no.text], [true, `set_fsm_look: no state 'DAY' in ${PATH}`]);
  const both = await call('set_fsm_look', { project: 't', path: PATH, look: {} });
  assert.deepEqual([both.isError, both.text], [true, 'set_fsm_look: give either state (its name) or transition (its id)']);
  // back to the default look: no look in the file
  const d = await ok('set_fsm_look', { project: 't', path: PATH, state: 'NIGHT', look: { fill: null, fontSize: '', textStyle: null } });
  assert.equal(d.text, 'State NIGHT: look set: the default look');
  await ok('set_fsm_look', { project: 't', path: PATH, transition: 't1', look: { stroke: null, strokeWidth: null, dash: null, color: null, font: null } });
  const m = await fsm();
  assert.ok([...m.states, ...m.transitions].every(x => !('look' in x)));
  assert.equal(await read('src/traffic.vhd'), hdl0);
});

test('#3883 a look not valid written by write_file: Check\'s error (check_drawing), on its state', async () => {
  const m = await fsm();
  m.states.find(s => s.name === 'WALK').look = { fill: 'green' };
  await ok('write_file', { project: 't', path: PATH, text: JSON.stringify(m, null, 2) });
  const c = await call('check_drawing', { project: 't', file: PATH });
  assert.equal(c.text, "ERROR: State WALK: the fill colour 'green' is not a colour: #rrggbb (e.g. #ffcc00)\nProcess \"Check State Diagram\" of traffic.fsm.json failed (1 error(s), 0 warning(s)).");
  m.states.find(s => s.name === 'WALK').look = { fill: '#00aa00' };
  await ok('write_file', { project: 't', path: PATH, text: JSON.stringify(m, null, 2) });
  assert.doesNotMatch((await call('check_drawing', { project: 't', file: PATH })).text, /look|colour|ERROR|WARNING/);
});
