// The logic analyzer on the 7-series through the MCP server (#3767): capture_settings on the Basys 3 (the block RAMs as
// synthesis infers them, RAMB18E1, no device total), Implement inserting the core with a BSCANE2 (Silinx toolchain:
// nextpnr places it as a BSCAN, the FASM gets its chain's bits) to a bitstream with no warning; the board's clock as XDC
// (its pin, its create_clock), a design's port on that pin refused; the capture read on the board said to wait (#3773).
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

before(async () => { tmp = await scratchEnv('silinx-mcp-capture-xc7-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('#3767 Implement inserts the capture on the Basys 3: blinky\'s bitstream with the core on a BSCANE2, no warning; its chain\'s bits; the Design Summary\'s capture', { timeout: 900000 }, async () => {
  await ok('new_project_from_example', { name: 'b', example: 'blinky', board: 'basys3' });
  const s = await ok('capture_settings', { project: 'b', probes: ['u_knight.count', 'u_knight.dir'], clock: 'clk', depth: 1024, pre: 64,
    trigger: { combine: 'and', conditions: [{ probe: 'u_knight.dir', op: 'rise' }, { probe: 'u_knight.count', op: '=', value: 20 }] } });
  assert.equal(s.text.split('\n')[1], 'Block RAMs: 1 (RAMB18E1).');
  assert.deepEqual([s.data.blocks, s.data.deviceBlocks], [1, null]);
  const run = await ok('run_process', { project: 'b', process: 'bitstream', toolchain: 'silinx' });
  assert.deepEqual(run.data.warnings, []);
  assert.match(run.text, /^Logic analyzer: u_knight\.count\[8\], u_knight\.dir; 9 bits x 1024 samples on clk, 64 before the trigger \(u_knight\.dir rises and u_knight\.count = 20\); 1 block RAM\(s\), read over JTAG USER1 \(BSCANE2\)\.$/m);
  assert.match(run.text, /^ {2}BSCANE2: 1 out of 4 25%$/m);
  // (nextpnr's routes through the corner's BSCAN pins, and the chain's feature Silinx adds)
  const fasm = fs.readFileSync(path.join(P.projectDir('b'), 'build', 'open', 'routed.fasm'), 'utf8');
  assert.match(fasm, /^CFG_CENTER_MID_X46Y32\.BSCAN\.JTAG_CHAIN_1$/m);
  assert.match(fasm, /^CFG_CENTER_MID_X46Y32\.CFG_CENTER_LOGIC_OUTS_B\d+_\d+\.CFG_CENTER_BSCAN[1-4]_DRCK$/m);
  assert.match(fasm, /^CFG_CENTER_MID_X46Y32\.CFG_CENTER_BSCAN[1-4]_TDO\.CFG_CENTER_IMUX\d+_\d+$/m);
  assert.ok(fs.existsSync(path.join(P.projectDir('b'), 'build', 'top.bit')));
  const summary = (await ok('get_report', { project: 'b' })).data.summary;
  assert.deepEqual(summary.capture, { probes: [{ path: 'u_knight.count', width: 8 }, { path: 'u_knight.dir', width: 1 }], clock: 'clk', width: 9, depth: 1024, pre: 64,
    trigger: 'u_knight.dir rises and u_knight.count = 20', combine: 'and', conditions: [{ path: 'u_knight.dir', op: 'rise' }, { path: 'u_knight.count', op: '=', value: '20' }],
    blocks: 1, link: 'JTAG USER1 (BSCANE2)' });
  // (reading it on the board: the Basys 3's JTAG link is to come, #3773)
  const c = await call('capture', { project: 'b' });
  assert.deepEqual([c.isError, c.text], [true, 'capture: reading a capture on the board: the Spartan-3E\'s boards only yet (Basys2, Nexys2: their Digilent Adept USB); the others\' JTAG links are to come (#3773)']);
});

test('#3767 the board\'s clock on the Basys 3: gates (no clock) captured on its 100 MHz oscillator, the port\'s XDC (W5, 10 ns); blinky\'s clk on W5 refused', { timeout: 900000 }, async () => {
  await ok('new_project_from_example', { name: 'g', example: 'gates', board: 'basys3' });
  const s = await ok('capture_settings', { project: 'g', probes: ['sw', 'led'], clock: 'board', depth: 16, trigger: { combine: 'and', conditions: [{ probe: 'sw', op: 'change' }] } });
  assert.deepEqual(s.data.capture.boardClock, { name: 'clk', label: '100 MHz oscillator (CLK)', pin: 'W5', period: 10, iostandard: 'LVCMOS33', dedicated: true });
  assert.equal(s.text, 'Capture: sw (4 bits), led (2 bits); 6 bits x 16 samples on the board\'s clock clk (W5, 10 ns), 0 before the trigger: sw changes.\nBlock RAMs: 0 (distributed RAM).');
  const run = await ok('run_process', { project: 'g', process: 'implement', toolchain: 'silinx' });
  assert.deepEqual(run.data.warnings, []);
  assert.match(run.text, /^Logic analyzer: sw\[4\], led\[2\]; 6 bits x 16 samples on the board's clock clk \(W5, 10 ns\), 0 before the trigger \(sw changes\); 0 block RAM\(s\), read over JTAG USER1 \(BSCANE2\)\.$/m);
  // (the clock port's constraint: its period asked of nextpnr)
  assert.match(run.text, /^Clock silinx_board_clk: [\d.]+ MHz \(met, 100 MHz asked; nextpnr's estimate\)$/m);
  assert.match(fs.readFileSync(path.join(P.projectDir('g'), 'build', 'open', 'routed.fasm'), 'utf8'), /^CFG_CENTER_MID_X46Y32\.BSCAN\.JTAG_CHAIN_1$/m);
  await ok('new_project_from_example', { name: 'k', example: 'blinky', board: 'basys3' });
  await ok('capture_settings', { project: 'k', probes: ['u_knight.count'], clock: 'board', depth: 16, trigger: {} });
  const r = await call('run_process', { project: 'k', process: 'synthesize', toolchain: 'silinx' });
  assert.match(r.text, /capture: the board's clock clk \(W5, 10 ns\) is the design's port clk already: choose clk as the capture's clock \(Logic Analyzer Settings, capture_settings\)/);
});
