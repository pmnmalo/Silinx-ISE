// The MCP server's choice of the Spartan-6's Map (#3138, #2674: what the interface's Process Properties does): Silinx's, the
// default, or nextpnr's packer (on trial until its parity, #3139), set_process_properties's s6_map; run_process then
// implements with it (the Map's line of the log: "Packed and placed … sites by nextpnr"), with no warnings; its refusals.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-s6-map-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle, TOOLS } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true); assert.equal(r.text, `${name}: ${message}`); };

test('set_process_properties: s6_map in its schema, silinx or nextpnr', () => {
  const t = TOOLS.find(x => x.name === 'set_process_properties');
  assert.deepEqual(Object.keys(t.inputSchema.properties), ['project', 'optimization', 'startup_clock', 's6_map', 'xc7_seeds']);
  assert.deepEqual(t.inputSchema.properties.s6_map.enum, ['silinx', 'nextpnr']);
});

test('set_process_properties s6_map: a Spartan-6 project\'s Map, Silinx\'s by default; said with the other properties; refused on a Spartan-3E', async () => {
  await ok('new_project_from_example', { name: 'n3', example: 'gates', board: 'nexys3' });
  const r = await ok('set_process_properties', { project: 'n3', optimization: 'fast' });
  assert.equal(r.text, 'n3: Optimization fast, FPGA start-up clock jtag, Map Silinx.');
  assert.deepEqual(r.data, { project: 'n3', optimization: 'fast', startupClock: 'jtag', s6Map: 'silinx' });
  assert.equal((await P.readProject('n3')).impl.s6Map, undefined);
  const n = await ok('set_process_properties', { project: 'n3', s6_map: 'nextpnr' });
  assert.equal(n.text, 'n3: Optimization fast, FPGA start-up clock jtag, Map nextpnr (on trial).');
  assert.equal((await P.readProject('n3')).impl.s6Map, 'nextpnr');
  // (the others kept, and the Map kept when another property changes)
  const c = await ok('set_process_properties', { project: 'n3', startup_clock: 'cclk' });
  assert.equal(c.text, 'n3: Optimization fast, FPGA start-up clock cclk, Map nextpnr (on trial).');
  const s = await ok('set_process_properties', { project: 'n3', s6_map: 'silinx', startup_clock: 'jtag' });
  assert.equal(s.text, 'n3: Optimization fast, FPGA start-up clock jtag, Map Silinx.');
  assert.deepEqual((await P.readProject('n3')).impl, { optMode: 'Speed', optLevel: 1, startupClk: 'JtagClk' });
  await fails('set_process_properties', { project: 'n3', s6_map: 'xst' }, 's6_map: one of silinx, nextpnr');
  await fails('set_process_properties', { project: 'n3' }, 'give optimization, startup_clock, s6_map or xc7_seeds');
  await ok('new_project_from_example', { name: 'b2', example: 'gates' });
  await fails('set_process_properties', { project: 'b2', s6_map: 'nextpnr' }, 's6_map: the project\'s device (xc3s250ecp132-4) is not a Spartan-6');
  // (a Spartan-3E's properties say no Map)
  assert.equal((await ok('set_process_properties', { project: 'b2', optimization: 'area' })).text, 'b2: Optimization area, FPGA start-up clock jtag.');
});

test('run_process implement with s6_map nextpnr: nextpnr packs and places blinky on the Nexys3, routed, no warnings; Silinx\'s Map without it', { timeout: 600000 }, async () => {
  await ok('new_project_from_example', { name: 'k3', example: 'blinky', board: 'nexys3' });
  const silinx = await ok('run_process', { project: 'k3', process: 'implement', toolchain: 'silinx', log_lines: 400 });
  assert.deepEqual(silinx.data.warnings, []);
  assert.ok(silinx.data.log.some(l => /^Placed \d+ sites by nextpnr in /.test(l)), silinx.data.log.join('\n'));
  await ok('set_process_properties', { project: 'k3', s6_map: 'nextpnr' });
  const r = await ok('run_process', { project: 'k3', process: 'implement', toolchain: 'silinx', log_lines: 400 });
  assert.equal(r.data.ok, true);
  assert.deepEqual(r.data.errors, []);
  assert.deepEqual(r.data.warnings, []);
  assert.ok(r.data.log.some(l => /^Packed and placed \d+ sites by nextpnr in /.test(l)), r.data.log.join('\n'));
  assert.ok(r.data.log.includes('All signals are completely routed.'));
});
