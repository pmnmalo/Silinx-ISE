// The MCP server's simulation of the flow's models (#2674, server/mcp-hdl.js): the test bench against the post-synthesis,
// post-translate, post-map and post-place & route models (the last with its SDF timing), each made by its run_process
// or by generate, as Simulate Post-… Model does; a Verilog test bench against them; a model older than the sources
// said; the waves as a VCD file in the exchange folder; the project's data files given to the simulation ($readmemh,
// which the MCP's simulation did not read before); the errors. The Silinx toolchain (no ISE).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, writeConfig } from './server-helpers.js';

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

before(async () => {
  tmp = await scratchEnv('silinx-mcp-sim-models-');
  await writeConfig({ mode: 'silinx' });
  fs.mkdirSync(path.join(tmp, 'exchange'));
  process.env.SILINX_MCP_FOLDER = path.join(tmp, 'exchange');
  await ok('new_project_from_example', { name: 'g', example: 'gates' });
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('simulate model: gates\' test bench against each model of the flow, made by run_process or by generate; the post-P&R one with its timing', async () => {
  await fails('simulate', { project: 'g', model: 'postsynth', time_ns: 1000 }, 'There is no post-synthesis simulation model of \'gates\' yet: run_process post_synthesis_model (or generate: true).');
  const p = await ok('run_process', { project: 'g', process: 'post_synthesis_model' });
  assert.match(p.text, /\nProcess "post_synthesis_model" of <gates> completed successfully \(Silinx toolchain\)\.$/);
  const s = await ok('simulate', { project: 'g', model: 'postsynth', time_ns: 1000, signals: [] });
  assert.deepEqual([s.data.model, s.data.notes, s.data.log.map(l => l.text), s.data.failed, s.data.warnings], ['postsynth', [], ['Simulation finished OK'], false, []]);
  for (const [model, name] of [['posttrans', 'Post-Translate'], ['postmap', 'Post-Map'], ['postpar', 'Post-Place & Route']]) {
    const r = await ok('simulate', { project: 'g', model, generate: true, time_ns: 1000, signals: [] });
    const notes = [`${name} simulation model generated (${{ posttrans: 'post_translate_model', postmap: 'post_map_model', postpar: 'post_par_model' }[model]}).`];
    if (model === 'postpar') notes.push(...r.data.notes.slice(1));
    assert.deepEqual(r.data.notes, notes, model);
    assert.deepEqual([r.data.log.map(l => l.text), r.data.failed], [['Simulation finished OK'], false], model);
  }
  // (the post-map model: nextpnr's packing, as the interface's, #2530: its run's log says the placement, its header the design)
  const m = await ok('run_process', { project: 'g', process: 'post_map_model' });
  assert.equal(m.text.split('\n').filter(l => /^Placing and routing/.test(l)).join('\n'), 'Placing and routing the design (nextpnr packs at Place & Route), for its Post-Map model.', m.text);
  assert.match(fs.readFileSync(path.join(P.projectDir('g'), 'build/netgen/map/gates_map.vhd'), 'utf8'), /^-- Post-Map Simulation Model of 'gates' \([^)]+\): the design nextpnr packed \(its routed design, without the routing\)/);
  // (the post-place & route model with its SDF's delays)
  const t = await ok('simulate', { project: 'g', model: 'postpar', time_ns: 1000, signals: [] });
  assert.match(t.data.notes[0], /^Timing: build\/netgen\/par\/gates_timesim\.sdf \(\d+ instances with their delays\)\.$/);
});

test('simulate model: a model older than the sources is said; the VCD of the waves in the exchange folder', async () => {
  const src = path.join(P.projectDir('g'), 'src/gates.vhd');
  const later = new Date(Date.now() + 60000);
  fs.utimesSync(src, later, later);
  const s = await ok('simulate', { project: 'g', model: 'postsynth', time_ns: 1000, signals: [], vcd: 'gates.vcd' });
  assert.deepEqual(s.data.notes, ['WARNING: the post-synthesis model is older than the sources (run "post_synthesis_model" again to update it).']);
  // (the exchange folder named as such, never its absolute path, #3418)
  assert.equal(s.data.vcd, '<exchange folder>/gates.vcd');
  const vcd = fs.readFileSync(path.join(tmp, 'exchange', 'gates.vcd'), 'utf8');
  assert.match(vcd, /^\$date .*\$end\n\$version Silinx \$end\n\$timescale 1ps \$end\n\$scope module tb_gates \$end\n/);
  assert.match(vcd, /\$var wire 4 \S+ sw \$end/);
  await fails('simulate', { project: 'g', time_ns: 100, vcd: 'gates.vcd' }, `'<exchange folder>/gates.vcd' exists: a VCD does not replace a file (give another name)`);
  await fails('simulate', { project: 'g', time_ns: 100, vcd: 'gates.txt' }, 'vcd: \'gates.txt\' is not a .vcd');
  await fails('simulate', { project: 'g', time_ns: 100, vcd: '../out.vcd' }, `vcd: '../out.vcd' is outside the exchange folder (SILINX_MCP_FOLDER sets another)`);
  await fails('simulate', { project: 'g', model: 'netlist', time_ns: 100 }, 'model: behavioral or one of postsynth, posttrans, postmap, postpar');
});

test('simulate model: a Verilog test bench (the clock example) against the post-synthesis model', async () => {
  await ok('new_project_from_example', { name: 'c', example: 'clock' });
  const b = await ok('simulate', { project: 'c', time_ns: 5000000, signals: [] });
  const s = await ok('simulate', { project: 'c', model: 'postsynth', generate: true, time_ns: 5000000, signals: [] });
  assert.deepEqual(s.data.log.map(l => l.text), b.data.log.map(l => l.text));
  assert.deepEqual(s.data.log.map(l => l.text), ['Simulation finished OK', 'simulation finished ($finish) at 184011 ns']);
});

test('simulate: the project\'s data files given to the simulation ($readmemh of a .mem file)', async () => {
  await ok('new_project', { name: 'm' });
  await ok('write_file', { project: 'm', path: 'src/rom.mem', text: '0A\n0B\n0C\n0D\n' });
  await ok('write_file', { project: 'm', path: 'sim/tb_rom.v', text: 'module tb_rom;\n  reg [7:0] mem [0:3];\n  initial begin\n    $readmemh("src/rom.mem", mem);\n    $display("mem[2] = %h", mem[2]);\n  end\nendmodule\n' });
  const s = await ok('simulate', { project: 'm', top: 'tb_rom', time_ns: 10, signals: [] });
  assert.deepEqual(s.data.log.map(l => l.text), ['mem[2] = 0c']);
});
