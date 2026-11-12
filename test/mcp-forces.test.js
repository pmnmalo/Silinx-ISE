// The MCP server's forces (#2674, server/mcp-hdl.js through core/ssim-forces.js), as SSim's Force Constant and Force
// Clock: a module's inputs forced in turn (a later force of a signal cutting the earlier one), in VHDL (gates) and in
// Verilog (blinky's prescaler, its clock and reset); a signal the design drives forced, then released to what the
// design gives it; the forces' errors.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';

let tmp;
const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (args, message) => { const r = await call('simulate', { project: 'g', top: 'gates', ...args }); assert.equal(r.isError, true, r.text); assert.equal(r.text, `simulate: ${message}`); };

before(async () => {
  tmp = await scratchEnv('silinx-mcp-forces-');
  await ok('new_project_from_example', { name: 'g', example: 'gates' });
  await ok('new_project_from_example', { name: 'b', example: 'blinky' });
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('forces: gates\' switches forced to a value, then another from 50 ns; its LEDs follow', async () => {
  const r = await ok('simulate', { project: 'g', top: 'gates', time_ns: 100, signals: ['sw', 'led'], forces: [{ signal: 'sw', value: '0011' }, { signal: 'sw', value: '0xF', start: '50 ns' }] });
  assert.deepEqual(r.data.notes, ['Force: gates.sw = 0011 from 0 ns', 'Force: gates.sw = 0xF from 50 ns']);
  assert.deepEqual(r.data.signals.sw.changes, [[0, '"0011"'], [50, '"1111"']]);
  assert.deepEqual(r.data.signals.led.changes, [[0, '"11"'], [50, '"00"']]);
  assert.deepEqual(r.data.warnings, []);
  assert.match(r.text, /^Force: gates\.sw = 0011 from 0 ns\nForce: gates\.sw = 0xF from 50 ns\nSimulation of <gates> stopped at 100 ns\./);
});

test('forces: blinky\'s prescaler (Verilog), a clock of 20 ns and a reset until 50 ns', async () => {
  const r = await ok('simulate', { project: 'b', top: 'prescaler', time_ns: 200, signals: ['clk', 'rst'], forces: [
    { signal: 'clk', clock: true, period: '20 ns' }, { signal: 'rst', value: '1', cancel: 50 }, { signal: 'rst', value: '0', start: 50 }] });
  assert.deepEqual(r.data.notes, ['Force: prescaler.clk = clock 0/1 period 20 ns duty 50% from 0 ns', 'Force: prescaler.rst = 1 from 0 ns until 50 ns', 'Force: prescaler.rst = 0 from 50 ns']);
  assert.deepEqual(r.data.signals.clk.changes.slice(0, 4), [[10, '1'], [20, '0'], [30, '1'], [40, '0']]);
  assert.equal(r.data.signals.clk.totalChanges, 21);
  assert.deepEqual(r.data.signals.rst.changes, [[0, '1'], [50, '0']]);
  // a duty cycle of 25 %: high a quarter of the period
  const d = await ok('simulate', { project: 'b', top: 'prescaler', time_ns: 45, signals: ['clk'], forces: [{ signal: 'clk', clock: true, period: '20 ns', duty: 25, lead: '1', trail: '0' }] });
  assert.deepEqual(d.data.signals.clk.changes, [[0, '1'], [5, '0'], [20, '1'], [25, '0'], [40, '1'], [45, '0']]);
});

test('forces: a signal the design drives, forced until 30 ns, then what the design gives it', async () => {
  const r = await ok('simulate', { project: 'g', top: 'gates', time_ns: 60, signals: ['sw', 'led'], forces: [{ signal: 'sw', value: '0011' }, { signal: 'led', value: '01', cancel: '30 ns' }] });
  assert.deepEqual(r.data.signals.led.changes, [[0, '"01"'], [30, '"11"']]);
});

test('forces: the errors', async () => {
  await fails({ forces: [{ signal: 'nosuch', value: '1' }] }, 'forces[0]: signal \'nosuch\' not found');
  await fails({ forces: [{ signal: 'sw', value: '12' }] }, 'forces[0]: invalid bin digit \'2\'');
  await fails({ forces: [{ signal: 'sw' }] }, 'forces[0]: value, or clock');
  await fails({ forces: [{ signal: 'sw', clock: true, value: '1' }] }, 'forces[0]: a clock has lead and trail, not value');
  await fails({ forces: [{ signal: 'sw', clock: true, duty: 100 }] }, 'forces[0]: duty cycle must be between 0 and 100');
  await fails({ forces: [{ signal: 'sw', clock: true, period: '1 ps' }] }, 'forces[0]: period must be at least 2 ps');
  await fails({ forces: [{ signal: 'sw', value: '1', start: 'soon' }] }, 'forces[0]: invalid time \'soon\'');
  await fails({ forces: 'sw=1' }, 'forces: an array');
});
