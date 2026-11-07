// The MCP server's rearrange_wires and rearrange_schematic (server/mcp-schematic.js, #2674, #1994): a schematic's
// Rearrange Wires and Rearrange Schematic, as its editor's menu does them, with the same messages: the gates example's
// schematic (its HDL file the same: the connections did not change), a channel of two wires crossing twice (no crossing,
// spread evenly), a selection (the wires of a marker), a selection with no wire, a second time (nothing to do), a file
// that is not a schematic or not there.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-schematic-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const P = (x, y) => ({ x, y });
const port = (id, name, dir, x, y) => ({ id, name, dir, width: 1, x, y });

test('rearrange_wires / rearrange_schematic: the gates example\'s schematic, its HDL the same; a second time, nothing to do', async () => {
  await ok('new_project_from_example', { name: 'g', example: 'gates' });
  const hdl0 = (await ok('read_file', { project: 'g', path: 'src/gates.vhd' })).text;
  const r = await ok('rearrange_wires', { project: 'g', path: 'src/gates.sch.json' });
  // (two pairs of wires into a gate, their runs spread between the gates: 770 and 780 -> 760 and 780)
  assert.deepEqual(r, { isError: false, text: 'Rearrange Wires: 4 wires drawn again',
    data: { project: 'g', path: 'src/gates.sch.json', changed: ['W29', 'W30', 'W59', 'W60'], stats: { bends: 35, crossings: 54, diagonals: 0, clashes: {} }, hdl: { file: 'src/gates.vhd', written: false } } });
  const sch = JSON.parse((await ok('read_file', { project: 'g', path: 'src/gates.sch.json' })).text);
  assert.deepEqual(sch.wires.find(w => w.id === 'W29').points, [P(740, 710), P(760, 710), P(760, 740), P(800, 740)]);
  assert.equal((await ok('read_file', { project: 'g', path: 'src/gates.vhd' })).text, hdl0);
  assert.equal((await ok('rearrange_wires', { project: 'g', path: 'src/gates.sch.json' })).text, 'Rearrange Wires: the wires are already as clear as they can be');
  const s = await ok('rearrange_schematic', { project: 'g', path: 'src/gates.sch.json' });
  assert.equal(s.text, 'Rearrange Schematic: the schematic laid out again');
  assert.equal(s.data.laidOut, true);
  assert.equal((await ok('read_file', { project: 'g', path: 'src/gates.vhd' })).text, hdl0);
  assert.deepEqual(await ok('rearrange_schematic', { project: 'g', path: 'src/gates.sch.json' }), { isError: false,
    text: 'Rearrange Schematic: the schematic is already laid out this way', data: { project: 'g', path: 'src/gates.sch.json', laidOut: false, changed: [] } });
});

test('rearrange_wires: a channel spread evenly with no crossing; a marker\'s wires only; no wire in the selection; not a schematic', async () => {
  await ok('new_source', { project: 'g', type: 'schematic', name: 'chan' });
  const doc = JSON.parse((await ok('read_file', { project: 'g', path: 'src/chan.sch.json' })).text);
  doc.ports = [port('P1', 'a', 'in', 100, 100), port('P2', 'y', 'out', 500, 250), port('P3', 'b', 'in', 100, 200), port('P4', 'z', 'out', 500, 350)];
  doc.wires = [{ id: 'W1', points: [P(100, 100), P(200, 100), P(200, 250), P(500, 250)] }, { id: 'W2', points: [P(100, 200), P(210, 200), P(210, 350), P(500, 350)] }];
  const text = JSON.stringify(doc, null, 1);
  await ok('write_file', { project: 'g', path: 'src/chan.sch.json', text });
  const wires = async () => JSON.parse((await ok('read_file', { project: 'g', path: 'src/chan.sch.json' })).text).wires.map(w => w.points);
  // the whole sheet: the two runs ordered with no crossing, spread between the markers (230 and 370)
  const r = await ok('rearrange_wires', { project: 'g', path: 'src/chan.sch.json' });
  assert.equal(r.text, 'Rearrange Wires: 2 wires drawn again');
  assert.deepEqual(r.data.stats, { bends: 4, crossings: 0, diagonals: 0, clashes: {} });
  assert.deepEqual(await wires(), [[P(100, 100), P(370, 100), P(370, 250), P(500, 250)], [P(100, 200), P(230, 200), P(230, 350), P(500, 350)]]);
  assert.equal((await ok('rearrange_wires', { project: 'g', path: 'src/chan.sch.json' })).text, 'Rearrange Wires: the wires are already as clear as they can be');
  // the marker a's wire only (routed again: off b's wire), b's as it was
  await ok('write_file', { project: 'g', path: 'src/chan.sch.json', text });
  const m = await ok('rearrange_wires', { project: 'g', path: 'src/chan.sch.json', markers: ['P1'] });
  assert.deepEqual([m.text, m.data.changed, m.data.stats.crossings], ['Rearrange Wires: 1 wire drawn again', ['W1'], 0]);
  assert.deepEqual((await wires())[1], doc.wires[1].points);
  for (const [args, message] of [
    [{ path: 'src/chan.sch.json', wires: ['W9'] }, 'Rearrange Wires: no wire in the selection'],
    [{ path: 'src/gates.vhd' }, 'src/gates.vhd: not a schematic (.sch.json)'],
    [{ path: 'src/none.sch.json' }, 'no file \'src/none.sch.json\' in the project \'g\''],
  ]) {
    const e = await call('rearrange_wires', { project: 'g', ...args });
    assert.deepEqual([e.isError, e.text], [true, `rearrange_wires: ${message}`]);
  }
  const e = await call('rearrange_schematic', { project: 'g', path: 'src/gates.vhd' });
  assert.deepEqual([e.isError, e.text], [true, 'rearrange_schematic: src/gates.vhd: not a schematic (.sch.json)']);
});
