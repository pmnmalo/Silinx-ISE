// The MCP server's best of 3 seeds of the 7-series (#3825, #2674: what the interface's Process Properties does):
// set_process_properties's xc7_seeds (1, the default, or 3), said with the other properties, kept when another changes,
// refused on another family; run_process implement then places and routes blinky on the Basys 3 with seeds 1, 2 and 3, the
// best kept and said, no warnings.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-xc7-seeds-'); });
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

test('set_process_properties: xc7_seeds in its schema, 1 or 3', () => {
  const t = TOOLS.find(x => x.name === 'set_process_properties');
  assert.deepEqual(t.inputSchema.properties.xc7_seeds.enum, [1, 3]);
  assert.match(t.description, /xc7_seeds: 1, the default; 3: nextpnr's router2 with seeds 1, 2 and 3, the best Fmax kept/);
});

test('set_process_properties xc7_seeds: a 7-series project\'s seeds, one by default; said with the other properties; refused on another family', async () => {
  await ok('new_project_from_example', { name: 'a7', example: 'gates', board: 'basys3' });
  const r = await ok('set_process_properties', { project: 'a7', optimization: 'fast' });
  assert.equal(r.text, 'a7: Optimization fast, FPGA start-up clock jtag, Place & Route one seed.');
  assert.deepEqual(r.data, { project: 'a7', optimization: 'fast', startupClock: 'jtag', xc7Seeds: 1 });
  assert.equal((await P.readProject('a7')).impl.xc7Seeds, undefined);
  const s = await ok('set_process_properties', { project: 'a7', xc7_seeds: 3 });
  assert.equal(s.text, 'a7: Optimization fast, FPGA start-up clock jtag, Place & Route the best of 3 seeds.');
  assert.equal((await P.readProject('a7')).impl.xc7Seeds, 3);
  // (kept when another property changes)
  assert.equal((await ok('set_process_properties', { project: 'a7', startup_clock: 'cclk' })).text, 'a7: Optimization fast, FPGA start-up clock cclk, Place & Route the best of 3 seeds.');
  await ok('set_process_properties', { project: 'a7', xc7_seeds: 1, startup_clock: 'jtag' });
  assert.deepEqual((await P.readProject('a7')).impl, { optMode: 'Speed', optLevel: 1, startupClk: 'JtagClk' });
  await fails('set_process_properties', { project: 'a7', xc7_seeds: 2 }, 'xc7_seeds: one of 1, 3');
  await fails('set_process_properties', { project: 'a7', s6_map: 'nextpnr' }, 's6_map: the project\'s device (xc7a35tcpg236-1) is not a Spartan-6');
  await ok('new_project_from_example', { name: 'b2', example: 'gates' });
  await fails('set_process_properties', { project: 'b2', xc7_seeds: 3 }, 'xc7_seeds: the project\'s device (xc3s250ecp132-4) is not a 7-series');
});

test('run_process implement with xc7_seeds 3: blinky on the Basys 3 placed and routed with seeds 1, 2, 3, the best kept, no warnings', { timeout: 600000 }, async () => {
  await ok('new_project_from_example', { name: 'k7', example: 'blinky', board: 'basys3' });
  await ok('set_design_properties', { project: 'k7', synth_tool: 'silinx' });
  await ok('set_process_properties', { project: 'k7', xc7_seeds: 3 });
  const r = await ok('run_process', { project: 'k7', process: 'implement', toolchain: 'silinx', log_lines: 400 });
  assert.equal(r.data.ok, true);
  assert.deepEqual(r.data.errors, []);
  assert.deepEqual(r.data.warnings, []);
  assert.ok(r.data.log.some(l => /^nextpnr-himbaechel \(xilinx\) places and routes <\w+> on the xc7a35tcpg236-1 \(router2; seeds 1, 2, 3, the best kept\)\.$/.test(l)), r.data.log.join('\n'));
  const seeds = r.data.log.filter(l => /^Seed \d: [\d.]+ MHz \(nextpnr's estimate\)(, kept)?\.$/.test(l));
  assert.equal(seeds.length, 3, r.data.log.join('\n'));
  assert.equal(seeds.filter(l => l.endsWith(', kept.')).length, 1);
});
