// The MCP server's set_fsm_outputs (server/mcp-fsm.js, #3814): a state's or a transition's outputs set as the state
// diagram editor's Properties set them (core/fsm-outputs.js): the traffic example's NIGHT state given phase 7 (its HDL
// made again), cleared (the default: left out of the file), a value too wide, not a constant or an output the machine
// does not have refused (nothing written), a transition's (the machine Mealy), the same values again (nothing written),
// a state or a transition not there, a file that is not a state diagram.
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
