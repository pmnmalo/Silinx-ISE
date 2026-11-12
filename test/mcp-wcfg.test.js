// The MCP server's wave configurations (#2839, #2674, server/mcp-wcfg.js), as the simulator's ⋮ ▸ Save and Load Wave
// Configuration: blinky's test bench (VHDL) saved by default (its signals, next to its source), and with dividers, a
// group, a radix and markers; read back as the wave window reads it (core/wcfg.js's placeWcfg), its signals given to
// simulate; a Verilog top (the prescaler); a signal the design has not, said and left out; the errors.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { readWcfg, writeWcfg } from '../core/wcfg.js';

let tmp;
const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true, r.text); assert.equal(r.text, `${name}: ${message}`); };
const file = (rel) => fs.readFileSync(path.join(P.projectDir('b'), rel), 'utf8');

before(async () => {
  tmp = await scratchEnv('silinx-mcp-wcfg-');
  await ok('new_project_from_example', { name: 'b', example: 'blinky' });
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('wcfg: none yet: said, as the interface says it', async () => {
  await fails('load_wave_config', { project: 'b' }, 'The project has no wave configuration (.wcfg) yet: save one first.');
});

test('wcfg: saved by default: the test bench\'s signals, next to its source; loaded back the same', async () => {
  const s = await ok('save_wave_config', { project: 'b' });
  assert.equal(s.text, 'Wave configuration saved to sim/tb_top.wcfg (7 signals, 0 markers).');
  const cfg = readWcfg(file('sim/tb_top.wcfg'));
  assert.deepEqual(cfg.tops, ['tb_top']);
  assert.deepEqual(cfg.rows.map((r) => [r.path, r.type, r.radix]), [['/tb_top/clk', 'logic', 'default'], ['/tb_top/sw', 'array', 'default'],
    ['/tb_top/btn', 'array', 'default'], ['/tb_top/led', 'array', 'default'], ['/tb_top/seg', 'array', 'default'], ['/tb_top/dp', 'logic', 'default'], ['/tb_top/an', 'array', 'default']]);
  const l = await ok('load_wave_config', { project: 'b' });
  assert.equal(l.text, 'Wave configuration sim/tb_top.wcfg loaded: 7 signals, 0 markers');
  assert.deepEqual(l.data.signals, ['clk', 'sw', 'btn', 'led', 'seg', 'dp', 'an']);
  assert.deepEqual(l.data.warnings, []);
  // its signals given to simulate
  const sim = await ok('simulate', { project: 'b', time_ns: 100, signals: l.data.signals });
  assert.deepEqual(Object.keys(sim.data.signals), l.data.signals);
});

test('wcfg: dividers, a group, a radix, a bus expanded and markers; the existing file replaced only when asked', async () => {
  const rows = [{ divider: 'Board' }, 'clk', { signal: 'led', radix: 'hex', expanded: true },
    { group: 'Inside', expanded: false, rows: [{ signal: 'uut/u_pre/tick', radix: 'bin' }, { divider: 'Display' }, { signal: 'uut/an', radix: 'udec' }] }];
  await fails('save_wave_config', { project: 'b', rows }, 'sim/tb_top.wcfg already exists: overwrite: true to replace it');
  const s = await ok('save_wave_config', { project: 'b', rows, markers_ns: [100, 400.5], overwrite: true });
  assert.equal(s.text, 'Wave configuration saved to sim/tb_top.wcfg (4 signals, 2 markers).');
  const text = file('sim/tb_top.wcfg');
  assert.match(text, /<obj_property name="label">Board<\/obj_property>/);
  assert.match(text, /<obj_property name="Radix">HEXRADIX<\/obj_property>/);
  assert.match(text, /<marker time="100000" label="" \/>\n {6}<marker time="400500" label="" \/>/);
  const l = await ok('load_wave_config', { project: 'b', file: 'sim/tb_top' });
  assert.equal(l.text, 'Wave configuration sim/tb_top.wcfg loaded: 4 signals, 2 markers');
  assert.deepEqual(l.data.rows, [{ divider: 'Board' },
    { signal: 'clk', path: '/tb_top/clk', radix: 'default', expanded: false },
    { signal: 'led', path: '/tb_top/led', radix: 'hex', expanded: true },
    // (an instance's port: the signal it is connected to, as in the wave window)
    { group: 'Inside', expanded: false, rows: [{ signal: 'uut/tick', path: '/tb_top/uut/tick', radix: 'bin', expanded: false }, { divider: 'Display' },
      { signal: 'an', path: '/tb_top/an', radix: 'udec', expanded: false }] }]);
  assert.deepEqual(l.data.markers_ns, [100, 400.5]);
});

test('wcfg: another name, a Verilog top (blinky\'s prescaler); the module\'s own file offered first', async () => {
  const s = await ok('save_wave_config', { project: 'b', top: 'prescaler', file: 'waves/pre' });
  assert.equal(s.text, 'Wave configuration saved to waves/pre.wcfg (7 signals, 0 markers).');
  const own = await ok('save_wave_config', { project: 'b', top: 'prescaler', rows: ['tick'] });
  assert.equal(own.data.file, 'src/prescaler.wcfg');
  assert.equal((await ok('load_wave_config', { project: 'b', top: 'prescaler' })).text, 'Wave configuration src/prescaler.wcfg loaded: 1 signal, 0 markers');
});

test('wcfg: a signal the design has not: said, left out (as the wave window)', async () => {
  fs.writeFileSync(path.join(P.projectDir('b'), 'sim/other.wcfg'), writeWcfg({ tops: ['tb_top'], rows: [{ kind: 'sig', path: '/tb_top/clk' }, { kind: 'sig', path: '/tb_top/gone' }], markers: [] }));
  const l = await ok('load_wave_config', { project: 'b', file: 'sim/other.wcfg' });
  assert.equal(l.text, 'WARNING: /tb_top/gone is not a signal of this design: not shown\nWave configuration sim/other.wcfg loaded: 1 signal, 0 markers');
  assert.deepEqual([l.data.signals, l.data.missing], [['clk'], ['/tb_top/gone']]);
});

test('wcfg: the errors', async () => {
  await fails('save_wave_config', { project: 'b', file: '../x' }, '\'../x\' is not a valid file name (letters, digits, _ . - and folders; .wcfg).');
  await fails('save_wave_config', { project: 'b', file: 'n.wcfg', rows: ['nosuch'] }, 'rows[0]: signal \'nosuch\' not found');
  await fails('save_wave_config', { project: 'b', file: 'n.wcfg', rows: [{ signal: 'clk', radix: 'c1dec' }] }, 'rows[0].radix: one of default, bin, hex, oct, udec, sdec, ascii');
  await fails('save_wave_config', { project: 'b', file: 'n.wcfg', rows: [{ group: 'a', rows: [{ group: 'b' }] }] }, 'rows[0].rows[0]: a group in a group (the wave window has one level)');
  await fails('save_wave_config', { project: 'b', file: 'n.wcfg', markers_ns: [-1] }, 'markers_ns: times in ns, from 0');
  await fails('load_wave_config', { project: 'b', file: 'nosuch' }, 'no wave configuration \'nosuch\' in the project (sim/tb_top.wcfg, sim/other.wcfg, src/prescaler.wcfg, waves/pre.wcfg)');
  fs.writeFileSync(path.join(P.projectDir('b'), 'sim/bad.wcfg'), '{}');
  await fails('load_wave_config', { project: 'b', file: 'sim/bad.wcfg' }, 'the wave configuration was not loaded: not a wave configuration (no <wave_config>)');
  assert.equal(fs.existsSync(path.join(P.projectDir('b'), 'n.wcfg')), false);
});
