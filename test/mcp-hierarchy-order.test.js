// The MCP server's project_info (#3819, server/mcp-projects.js): the roots of the project's hierarchy in the
// Implementation and the Simulation view as the Design pane lists them: the top first, then the names in natural order
// (x_2 before x_10), through core/hier-order.js as the interface; none when the project has no module.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';

const tmp = await scratchEnv('silinx-mcp-hier-order-');
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const leaf = n => `module ${n}(input a, output y); assign y = a; endmodule\n`;
const hierLines = text => text.split('\n').filter(l => /hierarchy/.test(l));

test('#3819 project_info: the hierarchy\'s roots, the top first, then x_1, x_2, x_10 (not x_1, x_10, x_2)', async () => {
  await ok('new_project', { name: 'h', board: 'basys2' });
  // (the modules written in the order x_10, x_2, x_1: the order is the names', not the files')
  for (const n of ['x_10', 'x_2', 'x_1']) await ok('write_file', { project: 'h', path: `src/${n}.v`, text: leaf(n) });
  await ok('write_file', { project: 'h', path: 'src/top.v', text: 'module top(input a, output y); wire w; x_1 u_1(.a(a), .y(w)); x_2 u_2(.a(w), .y(y)); endmodule\n' });
  await ok('write_file', { project: 'h', path: 'sim/tb_top.v', text: 'module tb_top; reg a; wire y; top uut(.a(a), .y(y)); endmodule\n' });
  await ok('set_top', { project: 'h', top: 'top' });
  let info = await ok('project_info', { project: 'h' });
  assert.deepEqual(info.data.hierarchy, { implementation: ['top', 'x_10'], simulation: ['tb_top', 'x_10'] });
  // the top instantiating none: the other roots after it, in natural order
  await ok('write_file', { project: 'h', path: 'src/top.v', text: 'module top(input a, output y); assign y = a; endmodule\n' });
  info = await ok('project_info', { project: 'h' });
  assert.deepEqual(info.data.hierarchy, { implementation: ['top', 'x_1', 'x_2', 'x_10'], simulation: ['tb_top', 'x_1', 'x_2', 'x_10'] });
  assert.deepEqual(hierLines(info.text), ['  implementation hierarchy: top, x_1, x_2, x_10', '  simulation hierarchy: tb_top, x_1, x_2, x_10']);
  // another top: first
  await ok('set_top', { project: 'h', top: 'x_10' });
  assert.deepEqual((await ok('project_info', { project: 'h' })).data.hierarchy.implementation, ['x_10', 'top', 'x_1', 'x_2']);
});

test('#3819 project_info: no hierarchy when the project has no module', async () => {
  await ok('new_project', { name: 'e', board: 'basys2' });
  const info = await ok('project_info', { project: 'e' });
  assert.deepEqual(info.data.hierarchy, { implementation: [], simulation: [] });
  assert.deepEqual(hierLines(info.text), []);
});
