// The MCP server's conversions (#2674, server/mcp-convert.js): an HDL module to a schematic (stopwatch, blinky's top,
// a ripple-carry adder whose instances drive bits of vectors, #2901; vectors and ports not from 0, #2903, #2961), an ASM chart or a state diagram (traffic's state
// machine, from its HDL), each then the module's base, the test bench passing after it; a state diagram to an ASM chart
// and back, and to its Boolean algebra; a Verilog module; the converters' refusals.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { CASES } from './fixtures/hdl-to-sch-cases.js';

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
const read = (project, f) => fs.readFileSync(path.join(P.projectDir(project), f), 'utf8');
// the project's test bench: its messages, no warning, not failed
async function passes(project, time_ns, log) {
  const s = await ok('simulate', { project, time_ns, signals: [] });
  assert.deepEqual([s.data.log.map(l => l.text), s.data.warnings, s.data.failed], [log, [], false]);
}

before(async () => { tmp = await scratchEnv('silinx-mcp-convert-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('convert_module to a schematic: stopwatch\'s and blinky\'s top, the schematic their base, the test bench as before', async () => {
  await ok('new_project_from_example', { name: 's', example: 'stopwatch' });
  await passes('s', 2000000, ['Simulation finished OK']);
  const r = await ok('convert_module', { project: 's', module: 'stopwatch', to: 'schematic' });
  assert.equal(r.text, '\'stopwatch\' converted to the schematic src/stopwatch.sch.json (11 symbols drawn, 7 HDL blocks keeping the HDL that is not drawn): it is now the module\'s base, src/stopwatch.vhd generated from it.');
  assert.equal(JSON.parse(read('s', 'src/stopwatch.sch.json')).generatedFile, 'src/stopwatch.vhd');
  assert.match((await ok('check_syntax', { project: 's', simulation: true })).text, /^Process "Check Syntax" of <tb_stopwatch> completed successfully \(\d+ signals, \d+ processes\)\.$/);
  await passes('s', 2000000, ['Simulation finished OK']);
  await fails('convert_module', { project: 's', module: 'stopwatch', to: 'asm' }, '\'stopwatch\' is made from src/stopwatch.sch.json already: its file src/stopwatch.vhd is generated from that drawing');
  await ok('new_project_from_example', { name: 'b', example: 'blinky' });
  assert.equal((await ok('convert_module', { project: 'b', module: 'top', to: 'schematic' })).text,
    '\'top\' converted to the schematic src/top.sch.json (15 symbols drawn, 4 HDL blocks keeping the HDL that is not drawn): it is now the module\'s base, src/top.vhd generated from it.');
  assert.match((await ok('check_syntax', { project: 'b', simulation: true })).text, /^Process "Check Syntax" of <tb_top> completed successfully \(\d+ signals, \d+ processes\)\.$/);
});

test('convert_module to a schematic (#2901): a ripple-carry adder whose instances drive bits of vectors, every instance drawn', async () => {
  const c = CASES.find(x => x.name === 'vhdl-inst-bits');
  await ok('new_project', { name: 'r' });
  for (const [f, text] of Object.entries(c.files)) await ok('write_file', { project: 'r', path: f, text });
  await ok('set_top', { project: 'r', top: 'add4', sim_top: 'tb_add4' });
  await passes('r', 6000, []);
  assert.equal((await ok('convert_module', { project: 'r', module: 'add4', to: 'schematic' })).text,
    '\'add4\' converted to the schematic src/add4.sch.json (13 symbols drawn, 0 HDL blocks keeping the HDL that is not drawn): it is now the module\'s base, src/add4.vhd generated from it.');
  const doc = JSON.parse(read('r', 'src/add4.sch.json'));
  assert.deepEqual(doc.symbols.filter(s => s.type === 'module').map(s => s.name).sort(), ['U0', 'U1', 'U2', 'U3']);
  assert.match((await ok('check_syntax', { project: 'r' })).text, /^Process "Check Syntax" of <add4> completed successfully \(\d+ signals, \d+ processes\)\.$/);
  await passes('r', 6000, []);
});

test('convert_module to a schematic (#2903): internal vectors not from 0, c(3 downto 1) and d(1 to 3), read by bus taps, in VHDL and Verilog', async () => {
  for (const [name, n, log] of [['vhdl-vec-not-0', 'z', []], ['verilog-vec-not-0', 'zv', ['simulation finished ($finish) at 160 ns']]]) {
    const c = CASES.find(x => x.name === name);
    await ok('new_project', { name: n });
    for (const [f, text] of Object.entries(c.files)) await ok('write_file', { project: n, path: f, text });
    await ok('set_top', { project: n, top: c.module, sim_top: c.tb });
    await passes(n, 200, log);
    const hdl = c.file, sch = hdl.replace(/\.(vhd|v)$/, '.sch.json');
    assert.equal((await ok('convert_module', { project: n, module: c.module, to: 'schematic' })).text,
      `'${c.module}' converted to the schematic ${sch} (9 symbols drawn, 1 HDL block keeping the HDL that is not drawn): it is now the module's base, ${hdl} generated from it.`);
    const doc = JSON.parse(read(n, sch));
    assert.deepEqual(doc.labels.map(l => l.net).sort(), name.startsWith('vhdl') ? ['c(3:1)', 'd(1:3)'] : ['c[3:1]', 'd[1:3]']);
    assert.match((await ok('check_syntax', { project: n })).text, new RegExp(`^Process "Check Syntax" of <${c.module}> completed successfully \\(\\d+ signals, \\d+ processes\\)\\.$`));
    await passes(n, 200, log);
  }
});

test('convert_module to a schematic (#2961): ports not from 0, a(4 downto 1) and b(1 to 4), read by bus taps, in VHDL and Verilog', async () => {
  for (const [name, n, log, decl] of [
    ['vhdl-port-not-0', 'pz', [], /^ {4}a : in std_logic_vector\(4 downto 1\);$/m],
    ['verilog-port-not-0', 'pzv', ['simulation finished ($finish) at 160 ns'], /^ {2}input wire \[4:1\] a,$/m]]) {
    const c = CASES.find(x => x.name === name);
    await ok('new_project', { name: n });
    for (const [f, text] of Object.entries(c.files)) await ok('write_file', { project: n, path: f, text });
    await ok('set_top', { project: n, top: c.module, sim_top: c.tb });
    await passes(n, 200, log);
    const hdl = c.file, sch = hdl.replace(/\.(vhd|v)$/, '.sch.json');
    assert.equal((await ok('convert_module', { project: n, module: c.module, to: 'schematic' })).text,
      `'${c.module}' converted to the schematic ${sch} (9 symbols drawn, 1 HDL block keeping the HDL that is not drawn): it is now the module's base, ${hdl} generated from it.`);
    assert.match(read(n, hdl), decl);
    assert.match((await ok('check_syntax', { project: n })).text, new RegExp(`^Process "Check Syntax" of <${c.module}> completed successfully \\(\\d+ signals, \\d+ processes\\)\\.$`));
    await passes(n, 200, log);
  }
});

test('convert_module to a state diagram and to an ASM chart: traffic\'s state machine from its HDL, the test bench as before', async () => {
  for (const [to, word] of [['fsm', 'state diagram'], ['asm', 'ASM chart']]) {
    const n = `t_${to}`;
    await ok('new_project_from_example', { name: n, example: 'traffic' });
    await ok('delete_file', { project: n, path: 'src/traffic.fsm.json' });
    const hdl = read(n, 'src/traffic.vhd');
    const r = await ok('convert_module', { project: n, module: 'traffic', to });
    assert.equal(r.text, `'traffic' converted to the ${word} src/traffic.${to}.json; it stays in sync with src/traffic.vhd.`);
    // its HDL file as it was, until the drawing is edited; then made from it
    assert.equal(read(n, 'src/traffic.vhd'), hdl);
    const w = await ok('write_file', { project: n, path: `src/traffic.${to}.json`, text: read(n, `src/traffic.${to}.json`) });
    assert.match(w.text, new RegExp(`\\nsrc/traffic\\.vhd updated from src/traffic\\.${to}\\.json$`));
    assert.equal((await ok('check_syntax', { project: n, simulation: true })).text, 'Process "Check Syntax" of <tb_traffic> completed successfully (45 signals, 35 processes).');
    await passes(n, 100000, ['Simulation finished OK']);
  }
});

test('convert_drawing: a state diagram to an ASM chart and back, and to its Boolean algebra', async () => {
  await ok('new_project_from_example', { name: 'd', example: 'traffic' });
  assert.equal((await ok('convert_drawing', { project: 'd', path: 'src/traffic.fsm.json', to: 'asm' })).text,
    'State diagram \'src/traffic.fsm.json\' -> ASM chart src/traffic_asm.asm.json (module \'traffic_asm\'; not linked to the diagram).');
  assert.equal((await ok('convert_drawing', { project: 'd', path: 'src/traffic_asm.asm.json', to: 'fsm' })).text,
    'ASM chart \'src/traffic_asm.asm.json\' -> state diagram src/traffic_asm_fsm.fsm.json (module \'traffic_asm_fsm\'; not linked to the chart).');
  // (a second one: a free name)
  assert.equal((await ok('convert_drawing', { project: 'd', path: 'src/traffic.fsm.json', to: 'asm' })).data.made[0], 'src/traffic_asm2.asm.json');
  for (const m of ['traffic_asm', 'traffic_asm_fsm']) assert.equal((await ok('check_syntax', { project: 'd', top: m })).text, `Process "Check Syntax" of <${m}> completed successfully (8 signals, 3 processes).`);
  assert.equal((await ok('convert_drawing', { project: 'd', path: 'src/traffic.fsm.json', to: 'boolean' })).text,
    'State diagram \'src/traffic.fsm.json\' -> Boolean algebra src/traffic_next.bool.json, src/traffic_out.bool.json (next-state and output logic of the binary encoding; unused codes are don\'t cares).');
  assert.match((await ok('check_syntax', { project: 'd', top: 'traffic_next' })).text, /^Process "Check Syntax" of <traffic_next> completed successfully/);
});

test('convert_module: a Verilog state machine to a state diagram and a schematic', async () => {
  await ok('new_project', { name: 'v' });
  await ok('write_file', { project: 'v', path: 'src/seq.v', text: 'module seq(input clk, input rst, input x, output y);\n  localparam A = 2\'d0, B = 2\'d1, C = 2\'d2;\n  reg [1:0] s;\n  always @(posedge clk)\n    if (rst) s <= A;\n    else case (s)\n      A: if (x) s <= B;\n      B: if (x) s <= C; else s <= A;\n      C: if (!x) s <= A;\n      default: s <= A;\n    endcase\n  assign y = (s == C);\nendmodule\n' });
  const f = await ok('convert_module', { project: 'v', module: 'seq', to: 'fsm' });
  assert.match(f.text, /^'seq' converted to the state diagram src\/seq\.fsm\.json; it stays in sync with src\/seq\.v\./);
  const d = JSON.parse(read('v', 'src/seq.fsm.json'));
  assert.deepEqual(d.states.map(s => s.name).sort(), ['A', 'B', 'C']);
  await ok('write_file', { project: 'v', path: 'src/seq.fsm.json', text: read('v', 'src/seq.fsm.json') });
  assert.match((await ok('check_syntax', { project: 'v', top: 'seq' })).text, /^Process "Check Syntax" of <seq> completed successfully/);
  await ok('write_file', { project: 'v', path: 'src/and2.v', text: 'module and2(input a, input b, output y);\n  assign y = a & b;\nendmodule\n' });
  const s = await ok('convert_module', { project: 'v', module: 'and2', to: 'schematic' });
  assert.match(s.text, /^'and2' converted to the schematic src\/and2\.sch\.json \(\d+ symbols? drawn, \d+ HDL blocks? keeping the HDL that is not drawn\): it is now the module's base, src\/and2\.v generated from it\.$/);
  assert.match((await ok('check_syntax', { project: 'v', top: 'and2' })).text, /^Process "Check Syntax" of <and2> completed successfully/);
});

test('the converters\' refusals', async () => {
  await fails('convert_module', { project: 's', module: 'debounce', to: 'fsm' }, '\'debounce\' cannot be shown as a state diagram: clocked process at line 22 has no reset: the state register must be reset to the initial state');
  await fails('convert_module', { project: 'b', module: 'knight', to: 'fsm' }, '\'knight\' cannot be shown as a state diagram: expression at line 34 uses concatenation, which a chart cannot express');
  await fails('convert_module', { project: 'b', module: 'nosuch', to: 'fsm' }, 'no module \'nosuch\' in the project\'s HDL files');
  await fails('convert_module', { project: 'b', module: 'knight', to: 'petri' }, 'to: one of schematic, asm, fsm');
  await fails('convert_drawing', { project: 'd', path: 'src/traffic.fsm.json', to: 'fsm' }, 'src/traffic.fsm.json: an ASM chart (.asm.json) becomes a state diagram');
  await fails('convert_drawing', { project: 'd', path: 'src/traffic_asm.asm.json', to: 'boolean' }, 'src/traffic_asm.asm.json: a state diagram (.fsm.json) becomes an ASM chart or Boolean algebra');
  await fails('convert_drawing', { project: 'd', path: 'src/none.fsm.json', to: 'asm' }, 'no drawing \'src/none.fsm.json\' in the project \'d\'');
});
