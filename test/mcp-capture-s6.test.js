// The logic analyzer on the Spartan-6 through the MCP server (#3766): Implement inserts the core with a BSCAN_SPARTAN6
// (Silinx toolchain: Silinx's Map and nextpnr-spartan6's BSCAN sites, 0.5.0), blinky to its bitstream on the Nexys3 and the
// Atlys with no warning: the BSCAN placed in the routed XDL (its chain), the JTAG clock on the general routing (no BUFG on
// DRCK), the Design Summary's capture; with nextpnr's Map too (Process Properties' Map (Spartan-6), #3138).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp;
const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };

before(async () => { tmp = await scratchEnv('silinx-mcp-capture-s6-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const SETTINGS = { probes: ['u_knight.count', 'u_knight.dir'], clock: 'clk', depth: 1024, pre: 64,
  trigger: { combine: 'and', conditions: [{ probe: 'u_knight.dir', op: 'rise' }, { probe: 'u_knight.count', op: '=', value: 20 }] } };

for (const [board, map] of [['nexys3', 'silinx'], ['atlys', 'silinx'], ['nexys3', 'nextpnr']]) {
  test(`#3766 Implement inserts the capture on the ${board} (Map ${map}): blinky's bitstream with the core on a BSCAN_SPARTAN6, no warning; the Design Summary's capture`, { timeout: 900000 }, async () => {
    const name = `b-${board}-${map}`;
    await ok('new_project_from_example', { name, example: 'blinky', board });
    await ok('set_process_properties', { project: name, s6_map: map });
    const s = await ok('capture_settings', { project: name, ...SETTINGS });
    assert.equal(s.text.split('\n')[1], `Block RAMs: 1 (RAMB8BWER) of the device's ${board === 'atlys' ? 116 : 32} RAMB16BWER.`);
    const run = await ok('run_process', { project: name, process: 'bitstream', toolchain: 'silinx' });
    assert.deepEqual(run.data.warnings, []);
    assert.match(run.text, /^Logic analyzer: u_knight\.count\[8\], u_knight\.dir; 9 bits x 1024 samples on clk, 64 before the trigger \(u_knight\.dir rises and u_knight\.count = 20\); 1 block RAM\(s\), read over JTAG USER1 \(BSCAN_SPARTAN6\)\.$/m);
    assert.match(run.text, /^Bitstream: build\/top\.bit \(\d+ bytes, every feature in the bit database\)$/m);
    const routed = fs.readFileSync(path.join(P.projectDir(name), 'build', 'open', 'routed.xdl'), 'utf8');
    // (on the site of its JTAG chain, 1: BSCAN_X0Y0, #3766)
    assert.match(routed, /^inst "silinx_bscan" "BSCAN",placed UR_UPPER_X\d+Y\d+ BSCAN_X0Y0 {2},\n {2}cfg " BSCAN:silinx_bscan: JTAG_CHAIN::1 JTAG_TEST::0 "$/m);
    // (one global buffer: the design's clock's; DRCK on the general routing)
    assert.equal((routed.match(/^inst "\S+" "BUFG",/gm) || []).length, 1);
    const summary = (await ok('get_report', { project: name })).data.summary;
    assert.deepEqual([summary.capture.link, summary.capture.blocks], ['JTAG USER1 (BSCAN_SPARTAN6)', 1]);
  });
}
