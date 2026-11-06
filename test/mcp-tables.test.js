// The MCP server's set_output_logic (server/mcp-tables.js, #2950, #2951): an output's HDL logic and the minimal solution
// it uses set as the editor sets them (core/logic-choice.js setOutputLogic), the table written and its HDL file made again
// (traffic's lamps: its VHDL module follows); related_view's results say them; the errors.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { newTable, normalizeTable, setOutputLogic, generateTableHdl } from '../core/logic.js';

let tmp;
const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (args) => { const r = await call('set_output_logic', args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (args, message) => { const r = await call('set_output_logic', args); assert.equal(r.isError, true, r.text); assert.equal(r.text, `set_output_logic: ${message}`); };
const read = (project, f) => fs.readFileSync(path.join(P.projectDir(project), f), 'utf8');

before(async () => { tmp = await scratchEnv('silinx-mcp-tables-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('set_output_logic: traffic\'s lamps, an output in the canonical SOP: the table as setOutputLogic makes it, its VHDL module made again', async () => {
  await call('new_project_from_example', { name: 't', example: 'traffic' });
  const before = JSON.parse(read('t', 'src/lamps.bool.json'));
  const r = await ok({ project: 't', path: 'src/lamps.bool.json', output: 'car_y', form: 'csop' });
  const doc = JSON.parse(read('t', 'src/lamps.bool.json'));
  assert.deepEqual(doc, setOutputLogic(before, 'car_y', { form: 'csop' }));
  assert.equal(read('t', 'src/lamps.bool.json'), JSON.stringify(doc, null, 2));
  assert.deepEqual([doc.form, doc.forms], ['sop', { car_y: 'csop' }]);
  // its module: the one the table generates, car_y's assignment a sum of minterms of the four inputs
  assert.equal(read('t', 'src/lamps.vhd'), generateTableHdl(doc, 'vhdl', { source: 'lamps.bool.json' }).code);
  assert.match(read('t', 'src/lamps.vhd'), /car_y <= \(not phase2 and not phase1 and phase0 and not blink\) or /);
  assert.deepEqual([r.data.output, r.data.form, r.data.solutions, r.data.hdl.file, r.data.hdl.written], ['car_y', 'csop', {}, 'src/lamps.vhd', true]);
  assert.match(r.text, /^src\/lamps\.bool\.json: car_y's HDL logic: Canonical SOP: car_y = \/phase2\.\/phase1\.phase0\.\/blink \+ .* {3}\(canonical SOP, \d+ gate\(s\), delay \d+\)/);
  // related_view's results say it
  const v = (await call('related_view', { project: 't', path: 'src/lamps.bool.json', view: 'results' })).data.outputs;
  assert.deepEqual(v.map(o => [o.output, o.hdlLogic.form, o.hdlLogic.name]), [['car_r', 'sop', 'Minimal SOP'], ['car_y', 'csop', 'Canonical SOP'], ['car_g', 'sop', 'Minimal SOP'], ['walk_r', 'sop', 'Minimal SOP'], ['walk_g', 'sop', 'Minimal SOP']]);
  // back to its minimal SOP: the module committed with the example again
  await ok({ project: 't', path: 'src/lamps.bool.json', output: 'car_y', form: 'sop' });
  assert.equal(read('t', 'src/lamps.vhd'), fs.readFileSync(new URL('../examples/traffic/src/lamps.vhd', import.meta.url), 'utf8'));
});

test('set_output_logic: the minimal solution used (a cyclic chart) and the form at once; related_view marks the solution used', async () => {
  await call('new_project', { name: 'c' });
  const t = normalizeTable({ ...newTable('cyc', ['a', 'b', 'c'], ['f']), table: { f: '11100111' } });
  await call('write_file', { project: 'c', path: 'src/cyc.bool.json', text: JSON.stringify(t, null, 2) });
  const r = await ok({ project: 'c', path: 'src/cyc.bool.json', output: 'f', form: 'sop', solution: { sop: 1 } });
  assert.deepEqual([r.data.form, r.data.solutions, r.data.expr, r.data.what], ['sop', { sop: 1 }, 'f = /a./c + /b.c + a.b', 'minimal SOP (solution 2 of 2), 6 literal(s), 7 gate(s), delay 3']);
  assert.equal(r.data.hdl, undefined, 'no HDL file linked: none written');
  assert.deepEqual(JSON.parse(read('c', 'src/cyc.bool.json')).solutions, { f: { sop: 1 } });
  const v = await call('related_view', { project: 'c', path: 'src/cyc.bool.json', view: 'results' });
  assert.equal(v.data.outputs[0].minimalSop.used, 1);
  assert.equal(v.data.outputs[0].minimalSop.expr, 'f = /a./c + /b.c + a.b');
  assert.ok(v.text.includes(`Minimal SOP: f = /a./c + /b.c + a.b   (3 term(s), 6 literal(s))
  2 minimal solutions exist.
  Solution 1 of 2: f = /a./b + b./c + a.c
  Solution 2 of 2: f = /a./c + /b.c + a.b   (used)
`), v.text);
  assert.ok(v.text.endsWith('HDL logic: Minimal SOP: f = /a./c + /b.c + a.b   (minimal SOP (solution 2 of 2), 6 literal(s), 7 gate(s), delay 3)'), v.text);
  // the solution alone: the form kept
  const s = await ok({ project: 'c', path: 'src/cyc.bool.json', output: 'f', solution: { sop: 0 } });
  assert.deepEqual([s.data.form, s.data.solutions, s.data.expr], ['sop', {}, 'f = /a./b + b./c + a.c']);
});

test('set_output_logic refuses: not a table, nothing to set, an output, a form or a solution that does not exist, a file not there', async () => {
  await call('new_project_from_example', { name: 'b', example: 'traffic' });
  const before = read('b', 'src/lamps.bool.json');
  await fails({ project: 'b', path: 'src/top.vhd', output: 'f', form: 'sop' }, 'src/top.vhd: a truth table (.bool.json, .tt.json) has outputs');
  await fails({ project: 'b', path: 'src/lamps.bool.json', output: 'car_r' }, 'form or solution: what to set');
  await fails({ project: 'b', path: 'src/lamps.bool.json', output: 'f', form: 'sop' }, "src/lamps.bool.json: no output 'f' (outputs: car_r, car_y, car_g, walk_r, walk_g)");
  await fails({ project: 'b', path: 'src/lamps.bool.json', output: 'car_r', form: 'esop' }, 'src/lamps.bool.json: form: sop, pos, xor, nand, nor, gates, delay, csop, cpos');
  await fails({ project: 'b', path: 'src/lamps.bool.json', output: 'car_r', solution: { sop: 3 } }, 'src/lamps.bool.json: solution sop: one minimal solution (0)');
  await fails({ project: 'b', path: 'src/none.bool.json', output: 'f', form: 'sop' }, "no file 'src/none.bool.json' in the project 'b'");
  assert.equal(read('b', 'src/lamps.bool.json'), before, 'nothing written');
});
