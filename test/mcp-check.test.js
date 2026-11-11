// The MCP server's check_drawing (server/mcp-check.js, #2803): an ASM chart's Validate, a state diagram's and a Petri
// net's Check, as their editors' toolbars check them (the Petri net's token game too); the exact errors and warnings,
// each with its item; a file that is not one of those drawings, or not there.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-check-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
const { newPetri } = await import('../core/petri.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const check = file => ok('check_drawing', { project: 't', file });

test('check_drawing: the examples\' charts clean; a Petri net with an error, one with warnings only', async () => {
  await ok('new_project_from_example', { name: 't', example: 'traffic' });
  assert.deepEqual(await check('src/traffic.fsm.json'), { isError: false,
    text: 'Process "Check State Diagram" of traffic.fsm.json completed successfully.',
    data: { project: 't', file: 'src/traffic.fsm.json', ok: true, errors: [], warnings: [] } }, 'its notes (info) are not warnings');
  // a state diagram's error: a state with no name
  const fsm = JSON.parse((await ok('read_file', { project: 't', path: 'src/traffic.fsm.json' })).text);
  fsm.states[0].name = '';
  await ok('write_file', { project: 't', path: 'src/bad.fsm.json', text: JSON.stringify(fsm) });
  const f = await check('src/bad.fsm.json');
  assert.equal(f.data.ok, false);
  assert.deepEqual(f.data.errors[0], { message: 'State has no name', item: fsm.states[0].id });
  assert.match(f.text, /^ERROR: State has no name\n[^]*Process "Check State Diagram" of bad\.fsm\.json failed \(\d+ error\(s\), 0 warning\(s\)\)\.$/);
  // a Petri net: the default one clean; a guard that does not parse; a sequence that ends (the token game's deadlock)
  const pn = newPetri('ctl');
  await ok('write_file', { project: 't', path: 'src/ctl.pn.json', text: JSON.stringify(pn) });
  assert.equal((await check('src/ctl.pn.json')).text, 'Process "Check Petri Net" of ctl.pn.json completed successfully.');
  pn.transitions[0].guard = 'go &';
  await ok('write_file', { project: 't', path: 'src/ctl.pn.json', text: JSON.stringify(pn) });
  const e = await check('src/ctl.pn.json');
  assert.equal(e.text, 'ERROR: transition start: guard \'go &\': unexpected end of expression\nProcess "Check Petri Net" of ctl.pn.json failed (1 error(s), 0 warning(s)).');
  assert.deepEqual(e.data.errors, [{ message: 'transition start: guard \'go &\': unexpected end of expression', item: 't1' }]);
  pn.transitions[0].guard = 'go';
  pn.arcs = pn.arcs.filter(a => a.id !== 'a4');   // (done no longer puts the token back)
  await ok('write_file', { project: 't', path: 'src/ctl.pn.json', text: JSON.stringify(pn) });
  const w = await check('src/ctl.pn.json');
  assert.equal(w.text, 'WARNING: the net can reach a deadlock, no transition able to fire: after start, done\nProcess "Check Petri Net" of ctl.pn.json completed successfully with 1 warning(s).');
  assert.deepEqual(w.data, { project: 't', file: 'src/ctl.pn.json', ok: true, errors: [], warnings: [{ message: 'the net can reach a deadlock, no transition able to fire: after start, done', item: null }] });
});

test('#3288 a state diagram\'s output assignments (write_file, check_drawing): the editor\'s fields\' errors, the state\'s name before them', async () => {
  await ok('new_project_from_example', { name: 'o', example: 'traffic' });
  const { parseOutputs } = await import('../core/fsm.js');
  const fsm = JSON.parse((await ok('read_file', { project: 'o', path: 'src/traffic.fsm.json' })).text);
  const [s] = fsm.states, z = fsm.outputs[0].name;
  // (a comma missing, as the field reads it, and an output the machine does not have)
  s.outputs = { ...s.outputs, ...parseOutputs(`${z}=1z=1, q=1`).outputs };
  const w = await ok('write_file', { project: 'o', path: 'src/traffic.fsm.json', text: JSON.stringify(fsm) });
  const field = [parseOutputs(`${z}=1z=1`, fsm.outputs).error, parseOutputs('q=1', fsm.outputs).error];
  assert.deepEqual(field, [`the value '1z=1' of ${z} must be a constant (e.g. 0, 1, 4'b1010, 5)`, "'q' is not an output"]);
  const want = field.map(m => `State ${s.name}: ${m}`);
  assert.equal(w.text, `Wrote src/traffic.fsm.json (${JSON.stringify(fsm).length} characters).\nWARNING: src/traffic.vhd not updated: src/traffic.fsm.json has errors: ${want.join('; ')}`);
  const f = await ok('check_drawing', { project: 'o', file: 'src/traffic.fsm.json' });
  assert.deepEqual(f.data.errors, want.map(message => ({ message, item: s.id })));
  assert.deepEqual(f.data.warnings, []);
  assert.equal(f.text, `${want.map(m => `ERROR: ${m}`).join('\n')}\nProcess "Check State Diagram" of traffic.fsm.json failed (2 error(s), 0 warning(s)).`);
});

test('check_drawing: an ASM chart (the blinky example\'s, clean), a file that is no such drawing or is not there', async () => {
  await ok('new_project_from_example', { name: 'b', example: 'blinky' });
  assert.equal((await ok('check_drawing', { project: 'b', file: 'src/speed_ctrl.asm.json' })).text, 'Process "Validate" of speed_ctrl.asm.json completed successfully.');
  const notOne = await call('check_drawing', { project: 'b', file: 'src/blinky.vhd' });
  assert.equal(notOne.isError, true);
  assert.equal(notOne.text, 'check_drawing: \'src/blinky.vhd\' is not an ASM chart, a state diagram or a Petri net (.asm.json, .fsm.json, .pn.json)');
  const missing = await call('check_drawing', { project: 'b', file: 'src/none.pn.json' });
  assert.equal(missing.isError, true);
  assert.equal(missing.text, 'check_drawing: no drawing \'src/none.pn.json\' in the project \'b\'');
});
