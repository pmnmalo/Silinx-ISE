// The MCP server's tools of a project's settings (#2674, server/mcp-settings.js): list_devices, set_design_properties
// (Design Properties: a board and its variant, a device, the synthesis tool; the new device checked against the
// design, the constraints of its format, Update Constraints from a board's pins) and set_process_properties, on
// the examples; every result's text, its warnings included, and the errors.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-settings-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true); assert.equal(r.text, `${name}: ${message}`); };

test('list_devices: the boards with their variants, the devices by family', async () => {
  const all = await ok('list_devices');
  const basys2 = all.data.boards.find(b => b.id === 'basys2');
  assert.deepEqual(basys2.variants, [
    { id: '100', label: 'Basys2-100 (XC3S100E)', device: 'xc3s100ecp132-4' },
    { id: '250', label: 'Basys2-250 (XC3S250E)', device: 'xc3s250ecp132-4', default: true }]);
  assert.match(all.text, /^Boards:\n {2}s3e-starter: /);
  assert.match(all.text, /\n {2}nexys2: Digilent Nexys2 \(500 xc3s500efg320-4, the default; 1200 xc3s1200efg320-4\)\n/);
  assert.ok(all.data.families.some(f => f.id === 'spartan6') && all.data.families.some(f => f.id === 'ice40'));
  const s3e = await ok('list_devices', { family: 'spartan3e' });
  assert.equal(s3e.data.boards, undefined);
  assert.deepEqual(s3e.data.families.map(f => f.id), ['spartan3e']);
  assert.deepEqual(s3e.data.families[0].parts.find(p => p.part === 'xc3s250e').packages.cp132, ['-4', '-5']);
  assert.match(s3e.text, /^Devices:\n {2}Spartan-3E \(spartan3e\):\n {4}xc3s100e: vq100 -4 -5, cp132 -4 -5, tq144 -4 -5\n/);
  const r = await call('list_devices', { family: 'nosuch' });
  assert.equal(r.isError, true);
  assert.match(r.text, /^list_devices: unknown family 'nosuch' \(spartan3, spartan3e, .*, ice40, ecp5, gowin\)$/);
});

test('set_design_properties: another board and its variant, its pins written into the constraints', async () => {
  await ok('new_project_from_example', { name: 'b1', example: 'blinky' });
  const r = await ok('set_design_properties', { project: 'b1', board: 'nexys2', variant: '1200', update_constraints: true });
  assert.equal(r.text, 'Device set to xc3s1200e-4-fg320 (board nexys2); synthesis tool of Toolchain Settings; constraints/top.ucf written from the nexys2\'s pins.');
  assert.deepEqual(r.data.warnings, []);
  const pj = await P.readProject('b1');
  assert.equal(pj.board, 'nexys2');
  assert.deepEqual(pj.device, { family: 'spartan3e', part: 'xc3s1200e', package: 'fg320', speed: '-4' });
  // the Nexys2's clock pin, B8, in the constraints file
  assert.match(fs.readFileSync(path.join(P.projectDir('b1'), 'constraints/top.ucf'), 'utf8'), /NET "clk"\s+LOC\s*=\s*"?B8"?/i);
  // the board's default variant
  const d = await ok('set_design_properties', { project: 'b1', board: 'basys2' });
  assert.equal(d.text, 'Device set to xc3s250e-4-cp132 (board basys2); synthesis tool of Toolchain Settings.');
});

test('set_design_properties: a device with no board, the pins to check; the synthesis tool', async () => {
  await ok('new_project_from_example', { name: 'b2', example: 'blinky' });
  const r = await ok('set_design_properties', { project: 'b2', board: 'none', part: 'xc3s100e', package: 'vq100', speed: '-4', synth_tool: 'xst' });
  // (the warning after the device, as the interface's console says them)
  assert.equal(r.text, 'Device set to xc3s100e-4-vq100; synthesis tool xst.\nWARNING: check the pin locations in constraints/top.ucf — they must exist on the VQ100 package.');
  assert.deepEqual(r.data.warnings, ['WARNING: check the pin locations in constraints/top.ucf — they must exist on the VQ100 package.']);
  assert.equal((await P.readProject('b2')).board, null);
  // a speed grade without its '-'; the package and speed kept when only one changes
  const s = await ok('set_design_properties', { project: 'b2', speed: '5' });
  assert.equal(s.text, 'Device set to xc3s100e-5-vq100; synthesis tool xst.');
  // the synthesis tool alone: the device as it was, no warning
  const t = await ok('set_design_properties', { project: 'b2', synth_tool: 'silinx' });
  assert.equal(t.text, 'Device set to xc3s100e-5-vq100; synthesis tool silinx.');
});

test('set_design_properties: an iCE40, its constraints a PCF, the Silinx toolchain only', async () => {
  await ok('new_project_from_example', { name: 'b3', example: 'blinky' });
  const r = await ok('set_design_properties', { project: 'b3', board: 'none', part: 'ice40hx1k', package: 'vq100' });
  assert.equal(r.text, 'WARNING: this device\'s constraints are PCF: constraints/top.pcf is the project\'s now, constraints/top.ucf was not converted.\nDevice set to ice40hx1k-vq100; synthesis tool silinx.');
  const pj = await P.readProject('b3');
  assert.equal(pj.constraints, 'constraints/top.pcf');
  assert.equal(pj.synthTool, 'silinx');
  await fails('set_design_properties', { project: 'b3', synth_tool: 'xst' }, 'the ICE40HX1K is the Silinx toolchain\'s only: no XST');
});

test('set_design_properties: a new device checked against the design (its I/O pads), the warnings of Design Properties', async () => {
  await ok('new_project', { name: 'wide', board: 'basys2' });
  await ok('write_file', { project: 'wide', path: 'src/top.v', text: 'module top(input [79:0] a, output [7:0] y);\n  assign y = a[7:0] ^ a[79:72];\nendmodule\n' });
  await ok('set_top', { project: 'wide', top: 'top' });
  const r = await ok('set_design_properties', { project: 'wide', board: 'none', part: 'ice40hx1k', package: 'vq100' });
  // (an empty project has no constraints file yet: none to convert)
  assert.equal(r.text, 'WARNING: ICE40HX1K: 88 I/O pads needed, the ICE40HX1K has 72.\nDevice set to ice40hx1k-vq100; synthesis tool silinx.');
});

test('set_design_properties: the errors', async () => {
  await ok('new_project_from_example', { name: 'b4', example: 'gates' });
  await fails('set_design_properties', { project: 'b4' }, 'give board, part, package, speed, synth_tool or preferred_language');
  await fails('set_design_properties', { project: 'b4', board: 'basys2', part: 'xc3s100e' }, 'give a board or a device (part, package, speed), not both: a board\'s device is its own');
  await fails('set_design_properties', { project: 'b4', part: 'xc3s100e' }, 'the project\'s device is its board\'s (basys2): give board none to choose a device');
  await fails('set_design_properties', { project: 'b4', board: 'nosuch' }, 'unknown board \'nosuch\' (list_devices)');
  await fails('set_design_properties', { project: 'b4', board: 'basys2', variant: '500' }, 'the Digilent Basys2 has no variant \'500\'');
  await fails('set_design_properties', { project: 'b4', board: 'none', part: 'xc3s500e' }, 'package: the XC3S500E has vq100, cp132, pq208, ft256, fg320');
  await fails('set_design_properties', { project: 'b4', board: 'none', part: 'xc3s500e', package: 'cp132' }, 'speed: the XC3S500E has -4, -5');
  await fails('set_design_properties', { project: 'b4', board: 'none', part: 'xc9999' }, 'unknown part \'xc9999\' (list_devices)');
  await fails('set_design_properties', { project: 'b4', board: 'none', part: 'xc3s250e', package: 'fg320', speed: '-4' }, 'xc3s250e is not available in package \'fg320\' (valid: vq100, cp132, tq144, pq208, ft256) (list_devices)');
  await fails('set_design_properties', { project: 'b4', board: 'nexys2', update_constraints: true, synth_tool: 'silinx', variant: '9' }, 'the Digilent Nexys2 has no variant \'9\'');
  await fails('set_design_properties', { project: 'b4', synth_tool: 'silinx', update_constraints: true }, 'update_constraints: the board did not change');
  await fails('set_design_properties', { project: 'nosuch', synth_tool: 'xst' }, 'no project \'nosuch\' in the workspace');
  // nothing changed by a failed call
  assert.deepEqual((await P.readProject('b4')).device, { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' });
});

test('set_process_properties: the Optimization, the start-up clock; no place and route engine (#2137: nextpnr, the one engine)', async () => {
  await ok('new_project_from_example', { name: 'p1', example: 'gates' });
  // (a project saved by an earlier version with an engine, #2136: dropped on the next change)
  await P.updateProject('p1', p => ({ ...p, impl: { ...(p.impl || {}), engine: 'silinx' } }));
  const r = await ok('set_process_properties', { project: 'p1', optimization: 'area', startup_clock: 'cclk' });
  assert.equal(r.text, 'p1: Optimization area, FPGA start-up clock cclk.');
  assert.deepEqual(r.data, { project: 'p1', optimization: 'area', startupClock: 'cclk' });
  assert.deepEqual((await P.readProject('p1')).impl, { optMode: 'Area', optLevel: 2, startupClk: 'CCLK' });
  // one at a time: the others kept
  const s = await ok('set_process_properties', { project: 'p1', optimization: 'speed' });
  assert.equal(s.text, 'p1: Optimization speed, FPGA start-up clock cclk.');
  assert.deepEqual((await P.readProject('p1')).impl, { optMode: 'Speed', optLevel: 2, startupClk: 'CCLK' });
  const f = await ok('set_process_properties', { project: 'p1', optimization: 'fast', startup_clock: 'jtag' });
  assert.equal(f.text, 'p1: Optimization fast, FPGA start-up clock jtag.');
  await fails('set_process_properties', { project: 'p1' }, 'give optimization, startup_clock or s6_map');
  await fails('set_process_properties', { project: 'p1', optimization: 'tiny' }, 'optimization: one of fast, area, speed');
  await fails('set_process_properties', { project: 'p1', startup_clock: 'JtagClk' }, 'startup_clock: one of jtag, cclk, user');
  await fails('set_process_properties', { project: 'p1', pr_engine: 'silinx' }, 'unknown pr_engine');
});

// (#3710) a board change: the top's generics CLK_HZ, BTN_LOW and SW_LOW the new board's (the clock example: on the
// Mimas V2, 100 MHz and its active-low inputs), said in the text and in the data, as the dialog does; back to the
// Basys2, its values again; a board with the same values (Nexys2: 50 MHz, active high), nothing written or said; the
// Mimas V2's display enables active low as the Basys2's: AN_LOW kept (#3884)
test('#3710 set_design_properties: another board, its clock and inputs\' levels as the top\'s generics', async () => {
  await ok('new_project_from_example', { name: 'clk3710', example: 'clock' });
  const file = () => fs.readFileSync(path.join(P.projectDir('clk3710'), 'src/digital_clock.v'), 'utf8');
  const params = () => file().split('\n').filter(l => /parameter (CLK_HZ|BTN_LOW|SW_LOW|AN_LOW) /.test(l)).map(l => l.trim().replace(/\s*\/\/.*$/, ''));
  const r = await ok('set_design_properties', { project: 'clk3710', board: 'mimas-v2', update_constraints: true });
  assert.ok(r.text.split('\n').includes('src/digital_clock.v: CLK_HZ = 100000000, BTN_LOW = 1, SW_LOW = 1, the Numato Mimas V2\'s clock and inputs (the defaults of its generics).'), r.text);
  assert.deepEqual(r.data.generics, { file: 'src/digital_clock.v', CLK_HZ: 100_000_000, BTN_LOW: true, SW_LOW: true });
  assert.deepEqual(params(), ['parameter CLK_HZ  = 100000000,', 'parameter BTN_LOW = 1,', 'parameter SW_LOW  = 1,', 'parameter AN_LOW  = 1']);
  const back = await ok('set_design_properties', { project: 'clk3710', board: 'basys2' });
  assert.deepEqual(back.data.generics, { file: 'src/digital_clock.v', CLK_HZ: 50_000_000, BTN_LOW: false, SW_LOW: false });
  assert.equal(file(), fs.readFileSync(path.join(P.EXAMPLES_DIR, 'clock', 'src/digital_clock.v'), 'utf8'));
  const same = await ok('set_design_properties', { project: 'clk3710', board: 'nexys2' });
  assert.equal(same.data.generics, null);
  assert.ok(!/the defaults of its generics/.test(same.text), same.text);
});
