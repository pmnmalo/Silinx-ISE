// A tool call's arguments checked against the tool's inputSchema (server/mcp-args.js, #3535) before the tool runs: each
// kind of wrong value (a type, an enum, an integer, a minimum, an array's items and size, an object's properties,
// anyOf) said in one message naming the argument, and nothing written; every tool's schema of the kinds checked.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { schemaErrors, checkArgs } from '../server/mcp-args.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-args-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle, TOOLS } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const refused = async (name, args, text) => { const r = await call(name, args); assert.deepEqual([r.isError, r.text], [true, text]); };

test('schemaErrors: each keyword the tools use, the place of the wrong value named', () => {
  const S = {
    type: 'object', properties: {
      s: { type: 'string' }, n: { type: 'number' }, i: { type: 'integer', minimum: 0 }, b: { type: 'boolean' },
      e: { type: 'string', enum: ['vhdl', 'verilog'] }, si: { type: ['string', 'integer'] },
      list: { type: 'array', maxItems: 2, items: { type: 'object', properties: { name: { type: 'string' }, dir: { type: 'string', enum: ['in', 'out'] } }, required: ['name'] } },
      map: { type: 'object', additionalProperties: { type: 'string' } },
      shut: { type: 'object', properties: { a: { type: 'integer' } }, additionalProperties: false },
      rows: { type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'object', properties: { radix: { type: 'string', enum: ['hex', 'bin'] } } }] } },
    }, required: ['s'], additionalProperties: false,
  };
  const errs = v => schemaErrors(v, S, '');
  assert.deepEqual(errs({ s: 'x', n: 1.5, i: 0, b: false, e: 'vhdl', si: 3, list: [{ name: 'a', dir: 'in' }], map: { 'led<0>': 'M5' }, shut: { a: 1 }, rows: ['clk', { radix: 'hex' }] }), []);
  assert.deepEqual(errs({ s: 'x', si: 'a' }), []);
  for (const [v, want] of [
    [{}, ['missing s']],
    [{ s: 'x', z: 1 }, ['unknown z']],
    [{ s: 7 }, ['s: a string']],
    [{ s: null }, ['s: a string']],
    [{ s: 'x', n: '3' }, ['n: a number']],
    [{ s: 'x', n: Infinity }, ['n: a number']],
    [{ s: 'x', i: 1.5 }, ['i: an integer']],
    [{ s: 'x', i: -1 }, ['i: at least 0']],
    [{ s: 'x', b: 'true' }, ['b: true or false']],
    [{ s: 'x', e: 'c' }, ['e: one of vhdl, verilog']],
    [{ s: 'x', si: true }, ['si: a string or an integer']],
    [{ s: 'x', list: {} }, ['list: an array']],
    [{ s: 'x', list: [1, 2, 3] }, ['list: at most 2 item(s)']],
    [{ s: 'x', list: [{ name: 'a' }, { dir: 'in' }] }, ['list[1]: missing name']],
    [{ s: 'x', list: [{ name: 'a', dir: 'up' }] }, ['list[0].dir: one of in, out']],
    [{ s: 'x', map: { 'led<0>': 5 } }, ['map["led<0>"]: a string']],
    [{ s: 'x', shut: { b: 1 } }, ['shut: unknown b']],
    [{ s: 'x', rows: ['clk', 3] }, ['rows[1]: a string or an object']],
    [{ s: 'x', rows: [{ radix: 'oct' }] }, ['rows[0].radix: one of hex, bin']],
    [{ s: 1, e: 'c' }, ['s: a string', 'e: one of vhdl, verilog']],
  ]) assert.deepEqual(errs(v), want, JSON.stringify(v));
  assert.equal(checkArgs({ name: 't', inputSchema: S }, 'x'), 't: the arguments: an object');
  assert.equal(checkArgs({ name: 't', inputSchema: S }, { s: 1, i: 'x' }), 't: s: a string; i: an integer');
});

test('every tool\'s schema is of the kinds checked (an object, its keywords known), its required arguments among its properties', () => {
  const KNOWN = new Set(['type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'minimum', 'maxItems', 'anyOf', 'description']);
  const walk = (s, where) => {
    for (const k of Object.keys(s)) assert.ok(KNOWN.has(k), `${where}: ${k}`);
    for (const [k, v] of Object.entries(s.properties || {})) walk(v, `${where}.${k}`);
    if (s.items) walk(s.items, `${where}[]`);
    if (typeof s.additionalProperties === 'object') walk(s.additionalProperties, `${where}{}`);
    for (const a of s.anyOf || []) walk(a, `${where}|`);
    for (const r of s.required || []) assert.ok(r in (s.properties || {}), `${where}: ${r}`);
  };
  for (const t of TOOLS) {
    assert.equal(t.inputSchema.type, 'object', t.name);
    assert.equal(t.inputSchema.additionalProperties, false, t.name);
    walk(t.inputSchema, t.name);
  }
});

test('#3535 a wrong value refused before the tool runs, nothing written: an enum, a type, a number for a name, an integer, an array\'s items', async () => {
  await call('new_project_from_example', { name: 'g', example: 'gates' });
  const dir = P.projectDir('g');
  const before = fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8');
  const files = () => fs.readdirSync(path.join(dir, 'src')).sort();
  const src = files();
  // (a language neither VHDL nor Verilog: no Verilog template in a .vhd file)
  await refused('new_source', { project: 'g', type: 'module', name: 'm1', language: 'c' }, 'new_source: language: one of vhdl, verilog');
  await refused('new_source', { project: 'g', type: 'module', name: 'm1', ports: [{ name: 'a', dir: 'up' }] }, 'new_source: ports[0].dir: one of in, out, inout');
  await refused('new_source', { project: 'g', type: 'module', name: 'm1', ports: [{ name: 'a', msb: '7' }] }, 'new_source: ports[0].msb: an integer');
  // (any synthesis tool: not written to silinx.json)
  await refused('set_design_properties', { project: 'g', synth_tool: 'foo' }, 'set_design_properties: synth_tool: one of silinx, xst, vivado');
  await refused('set_design_properties', { project: 'g', update_constraints: 'yes', board: 'nexys2' }, 'set_design_properties: update_constraints: true or false');
  // (a number where a name is expected: no JavaScript error)
  await refused('read_file', { project: 'g', path: 5 }, 'read_file: path: a string');
  await refused('new_project', { name: 12 }, 'new_project: name: a string');
  await refused('simulate', { project: 'g', time_ns: '100' }, 'simulate: time_ns: a number');
  await refused('simulate', { project: 'g', signals: ['led', 2] }, 'simulate: signals[1]: a string');
  await refused('lab', { project: 'g', action: 'show', step: 1.5 }, 'lab: step: a string or an integer');
  await refused('write_file', { project: 'g', path: 'src/x.vhd', text: { a: 1 } }, 'write_file: text: a string');
  // (several wrong values: all said)
  await refused('new_source', { project: 7, type: 'module', name: 'm1', language: 'c' }, 'new_source: project: a string; language: one of vhdl, verilog');
  // (the arguments not an object)
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name: 'list_projects', arguments: ['x'] } })).result;
  assert.deepEqual([r.isError, r.content[0].text], [true, 'list_projects: the arguments: an object']);
  assert.equal(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8'), before);
  assert.deepEqual(files(), src);
  assert.ok(!fs.existsSync(path.join(P.workspaceDir(), '12')));
});

test('#3535 new_project with a variant and no board: said as set_design_properties says it; an unknown board points at list_devices', async () => {
  await refused('new_project', { name: 'v1', variant: '250' }, 'new_project: variant: the project has no board (give board)');
  await refused('new_project', { name: 'v1', board: 'zedboard' }, 'new_project: unknown board \'zedboard\' (list_devices)');
  assert.ok(!fs.existsSync(P.projectDir('v1')));
  // (right ones still made)
  const r = await call('new_project', { name: 'v1', board: 'basys2', variant: '250' });
  assert.equal(r.isError, false, r.text);
  assert.equal(r.data.board, 'basys2');
});
