// The MCP server's logic analyzer settings (#2674, #3176, server/mcp-capture.js): capture_settings on blinky (a VHDL
// top with VHDL and Verilog modules) sets the capture in silinx.json, checked on the design (each probe's width: a
// vector, a state, a Verilog module's register; the trigger's state by its name; the block RAMs of the XC3S250E's 12),
// shows it, changes a part of it, clears it; its refusals (a signal not in the design, too many block RAMs on the
// Basys2-100's XC3S100E, a project without a top, clear with settings).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp;
const { handle, TOOLS } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true, r.text); assert.equal(r.text, `capture_settings: ${message}`); };

before(async () => {
  tmp = await scratchEnv('silinx-mcp-capture-');
  await ok('new_project_from_example', { name: 'b', example: 'blinky' });
  await ok('new_project', { name: 'empty', board: 'basys2' });
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('capture_settings: set on blinky (probes in VHDL and Verilog modules, a state by its name), shown, changed, cleared', async () => {
  assert.ok(TOOLS.some(t => t.name === 'capture_settings'));
  assert.equal((await ok('capture_settings', { project: 'b' })).text, 'b: no capture (capture_settings with probes, clock and depth adds one).');
  const r = await ok('capture_settings', { project: 'b', probes: ['u_knight.count', 'u_knight.dir', 'u_pre.cnt', 'led'], clock: 'clk', depth: 1024, pre: 64,
    trigger: { combine: 'and', conditions: [{ probe: 'u_knight.dir', op: '=', value: 'RIGHT' }, { probe: 'u_knight.count', op: 'change' }] } });
  assert.equal(r.text, [
    'Capture: u_knight.count (8 bits), u_knight.dir (1 bit), u_pre.cnt (20 bits), led (8 bits); 37 bits x 1024 samples on clk, 64 before the trigger: u_knight.dir = 1 and u_knight.count changes.',
    "Block RAMs: 3 (RAMB16_S18_S18) of the device's 12 RAMB16.",
  ].join('\n'));
  assert.deepEqual(r.data.probes, [{ path: 'u_knight.count', width: 8, kind: 'a vector' }, { path: 'u_knight.dir', width: 1, kind: 'a state' }, { path: 'u_pre.cnt', width: 20, kind: 'a vector' }, { path: 'led', width: 8, kind: 'a vector' }]);
  assert.deepEqual([r.data.width, r.data.blocks, r.data.deviceBlocks], [37, 3, 12]);
  // kept in silinx.json as given
  const saved = (await P.readProject('b')).capture;
  assert.deepEqual(saved, { probes: ['u_knight.count', 'u_knight.dir', 'u_pre.cnt', 'led'], clock: 'clk', depth: 1024, pre: 64,
    trigger: { combine: 'and', conditions: [{ probe: 'u_knight.dir', op: '=', value: 'RIGHT' }, { probe: 'u_knight.count', op: 'change' }] } });
  // shown; one setting changed, the others kept
  assert.equal((await ok('capture_settings', { project: 'b' })).text, r.text);
  const d = await ok('capture_settings', { project: 'b', depth: 256, trigger: {} });
  assert.equal(d.text.split('\n')[0], 'Capture: u_knight.count (8 bits), u_knight.dir (1 bit), u_pre.cnt (20 bits), led (8 bits); 37 bits x 256 samples on clk, 64 before the trigger: the first sample.');
  assert.equal((await P.readProject('b')).capture.depth, 256);
  // cleared
  assert.equal((await ok('capture_settings', { project: 'b', clear: true })).text, 'b: no capture (Implement adds no logic analyzer).');
  assert.equal((await P.readProject('b')).capture, undefined);
});

test('capture_settings\'s refusals: a signal not in the design, the XC3S100E\'s block RAMs, no top, clear with settings; nothing saved', async () => {
  await fails('capture_settings', { project: 'b', probes: ['u_knight.nope'], clock: 'clk', depth: 16 },
    "The probe 'u_knight.nope' is not a signal of the design (a signal's path below the top: count, u_ctl.state).");
  await fails('capture_settings', { project: 'b', probes: ['led'], clock: 'clk', depth: 16, trigger: { conditions: [{ probe: 'led', op: 'rise' }] } },
    "The trigger's rising edge is of a probe of one bit ('led' has 8).");
  await fails('capture_settings', { project: 'b', probes: ['led'], clock: 'clk', depth: 16, clear: true }, 'clear removes the capture: give no settings with it');
  await fails('capture_settings', { project: 'empty', probes: ['x'], clock: 'clk', depth: 16 }, "the project 'empty' has no top module (set_top): the capture's signals are the top's");
  // the Basys2-100: 4 RAMB16, one kept for the design
  await ok('set_design_properties', { project: 'b', board: 'none', part: 'xc3s100e', package: 'cp132', speed: '-4' });
  await fails('capture_settings', { project: 'b', probes: ['u_pre.cnt', 'u_display.count'], clock: 'clk', depth: 4096 },
    "The capture takes 8 block RAM(s) of the device's 4: at most 3, one block kept for the design (fewer samples or fewer probes).");
  assert.equal((await P.readProject('b')).capture, undefined);
});

test('#3176 Implement inserts the capture (Silinx toolchain): blinky\'s bitstream with the core on BSCAN_SPARTAN3, no warning; the Design Summary\'s capture', { timeout: 600000 }, async () => {
  await ok('new_project_from_example', { name: 'bi', example: 'blinky' });
  await ok('capture_settings', { project: 'bi', probes: ['u_knight.count', 'u_knight.dir'], clock: 'clk', depth: 1024, pre: 64,
    trigger: { combine: 'and', conditions: [{ probe: 'u_knight.dir', op: 'rise' }, { probe: 'u_knight.count', op: '=', value: 20 }] } });
  const run = await ok('run_process', { project: 'bi', process: 'bitstream', toolchain: 'silinx' });
  assert.deepEqual(run.data.warnings, []);
  assert.match(run.text, /^Logic analyzer: u_knight\.count\[8\], u_knight\.dir; 9 bits x 1024 samples on clk, 64 before the trigger \(u_knight\.dir rises and u_knight\.count = 20\); 1 block RAM\(s\), read over JTAG USER1 \(BSCAN_SPARTAN3\)\.$/m);
  const routed = fs.readFileSync(path.join(P.projectDir('bi'), 'build', 'open', 'routed.xdl'), 'utf8');
  assert.match(routed, /^inst "silinx_bscan" "BSCAN",placed UR_X27Y35 BSCAN +,$/m);
  assert.ok(fs.existsSync(path.join(P.projectDir('bi'), 'build', 'top.bit')));
  const summary = (await ok('get_report', { project: 'bi' })).data.summary;
  assert.deepEqual(summary.capture, { probes: [{ path: 'u_knight.count', width: 8 }, { path: 'u_knight.dir', width: 1 }], clock: 'clk', width: 9, depth: 1024, pre: 64,
    trigger: 'u_knight.dir rises and u_knight.count = 20', combine: 'and', conditions: [{ path: 'u_knight.dir', op: 'rise' }, { path: 'u_knight.count', op: '=', value: '20' }],
    blocks: 1, link: 'JTAG USER1 (BSCAN_SPARTAN3)' });
  // (the synthesis counted the core: its block RAM among the design's)
  assert.equal(summary.synthesis.utilization.find(u => u.id === 'ramb16').used, 1);
});

test('#3176 the capture in an ISE or Vivado run: said, the design implemented without it', async () => {
  const { CAPTURE_LEFT_OUT } = await import('../server/impl-routes.js');
  assert.equal(CAPTURE_LEFT_OUT('Xilinx ISE'), 'WARNING:Silinx - the logic analyzer\'s capture is inserted by the Silinx toolchain only: Xilinx ISE implements the design without it.');
});

// #3481: a design with no clock (gates, combinational) captured on the board's own oscillator (Basys2's MCLK, B8)
test('#3481 capture_settings clock board: gates (no clock) on the Basys2\'s MCLK, implemented (the port on B8, its period); blinky\'s clk on B8 refused', { timeout: 600000 }, async () => {
  await ok('new_project_from_example', { name: 'g', example: 'gates' });
  const s = await ok('capture_settings', { project: 'g', probes: ['sw', 'led'], clock: 'board', depth: 16, trigger: { combine: 'and', conditions: [{ probe: 'sw', op: 'change' }] } });
  assert.deepEqual(s.data.capture.boardClock, { name: 'mclk', label: 'MCLK oscillator (25/50/100 MHz via JP4, default 50 MHz)', pin: 'B8', period: 20, iostandard: 'LVCMOS33', dedicated: false });
  assert.equal(s.data.capture.clock, undefined);
  assert.match(s.text, /^Capture: sw \(4 bits\), led \(2 bits\); 6 bits x 16 samples on the board's clock mclk \(B8, 20 ns\), 0 before the trigger: sw changes\.$/m);
  const run = await ok('run_process', { project: 'g', process: 'bitstream', toolchain: 'silinx' });
  assert.deepEqual(run.data.warnings, []);
  assert.match(run.text, /^Logic analyzer: sw\[4\], led\[2\]; 6 bits x 16 samples on the board's clock mclk \(B8, 20 ns\), 0 before the trigger \(sw changes\); 1 block RAM\(s\), read over JTAG USER1 \(BSCAN_SPARTAN3\)\.$/m);
  const routed = fs.readFileSync(path.join(P.projectDir('g'), 'build', 'open', 'routed.xdl'), 'utf8');
  // (the clock port's input buffer on B8; the design's own pins at their places)
  assert.ok(/^inst "silinx_board_clk" "IBUF",placed \S+ B8 /m.test(routed), (/^inst "silinx_board_clk".*$/m.exec(routed) || ['no silinx_board_clk'])[0]);
  assert.ok(/^inst "sw<3>" "IBUF",placed \S+ B4 /m.test(routed));
  assert.ok(fs.existsSync(path.join(P.projectDir('g'), 'build', 'gates.bit')));
  assert.equal((await ok('get_report', { project: 'g' })).data.summary.capture.clock, 'the board\'s clock mclk (B8, 20 ns)');
  // a signal again: the board's clock replaced
  await ok('new_project_from_example', { name: 'bk', example: 'blinky' });
  await ok('capture_settings', { project: 'bk', probes: ['u_knight.dir'], clock: 'board', depth: 16 });
  const r = await call('run_process', { project: 'bk', process: 'synthesize', toolchain: 'silinx' });
  assert.match(r.text, /capture: the board's clock mclk \(B8, 20 ns\) is the design's port clk already: choose clk as the capture's clock \(Logic Analyzer Settings, capture_settings\)/);
  const c = await ok('capture_settings', { project: 'bk', clock: 'clk' });
  assert.deepEqual([c.data.capture.clock, c.data.capture.boardClock], ['clk', undefined]);
  // no board: no oscillator
  await ok('new_project', { name: 'nb' });
  const nb = await call('capture_settings', { project: 'nb', clock: 'board' });
  assert.equal(nb.text, 'capture_settings: clock board: the project \'nb\' has no board (set_design_properties board): the board\'s clock is its oscillator');
});
