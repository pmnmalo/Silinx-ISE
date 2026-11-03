// The MCP server's New Source (#2674, server/mcp-new-source.js): every type of the wizard, in VHDL and in Verilog, from
// its templates: the module (its ports) and its test bench compiled, elaborated and simulated; the drawings' Check
// Syntax with its exact warnings (an empty state diagram or ASM chart has no HDL yet, as in the interface); the
// constraints file the project's when it has none; the wizard's refusals.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp;
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (args, message) => { const r = await call('new_source', { project: 'p', ...args }); assert.equal(r.isError, true, r.text); assert.equal(r.text, `new_source: ${message}`); };
const read = f => fs.readFileSync(path.join(P.projectDir('p'), f), 'utf8');
const checks = async (top, simulation = false) => (await ok('check_syntax', { project: 'p', top, simulation })).text;

before(async () => {
  tmp = await scratchEnv('silinx-mcp-new-source-');
  await ok('new_project', { name: 'p', board: 'basys2' });
});

test('new_source: a module with its ports and its test bench, in VHDL and in Verilog: compiled, elaborated, simulated', async () => {
  const ports = [{ name: 'clk', dir: 'in' }, { name: 'rst', dir: 'in' }, { name: 'q', dir: 'out', msb: 7, lsb: 0 }];
  for (const [lang, L, ext] of [['vhdl', 'VHDL', 'vhd'], ['verilog', 'Verilog', 'v']]) {
    const m = await ok('new_source', { project: 'p', type: 'module', name: `cnt_${ext}`, language: lang, ports });
    assert.equal(m.text, `Created Module (HDL) (${L}) 'src/cnt_${ext}.${ext}'.`);
    assert.deepEqual([m.data.path, m.data.role], [`src/cnt_${ext}.${ext}`, 'design']);
    assert.match(read(`src/cnt_${ext}.${ext}`), lang === 'vhdl' ? /entity cnt_vhd is\n {4}Port \(\n {11}clk {4}: IN {4}STD_LOGIC;\n {11}rst {4}: IN {4}STD_LOGIC;\n {11}q {6}: OUT {3}STD_LOGIC_VECTOR \(7 downto 0\)\);\nend cnt_vhd;/ : /module cnt_v\(\n {4}input clk,\n {4}input rst,\n {4}output \[7:0\] q\n {4}\);/);
    assert.match(read(`src/cnt_${ext}.${ext}`), /Create Date: +\d{4}-\d\d-\d\d \d\d:\d\d/);
    assert.equal(await checks(`cnt_${ext}`), `Process "Check Syntax" of <cnt_${ext}> completed successfully (3 signals, 0 processes).`);
    const t = await ok('new_source', { project: 'p', type: 'test_bench', name: `tb_cnt_${ext}`, language: lang, module: `cnt_${ext}` });
    assert.equal(t.text, `Created Test Bench (${L}) 'sim/tb_cnt_${ext}.${ext}'.`);
    assert.equal(t.data.role, 'sim');
    assert.match(await checks(`tb_cnt_${ext}`, true), new RegExp(`^Process "Check Syntax" of <tb_cnt_${ext}> completed successfully \\(\\d+ signals, \\d+ processes\\)\\.$`));
    const s = await ok('simulate', { project: 'p', top: `tb_cnt_${ext}`, time_ns: 200, signals: ['clk', 'rst'] });
    assert.equal(s.data.failed, false, s.text);
    assert.deepEqual(s.data.warnings, []);
    assert.ok(s.data.signals.clk.totalChanges > 2, s.text);
  }
  // the module named otherwise than its file; a VHDL architecture's name
  const n = await ok('new_source', { project: 'p', type: 'module', name: 'alu_file', module: 'alu', architecture: 'rtl', ports: [] });
  assert.match(read('src/alu_file.vhd'), /entity alu is\nend alu;\n\narchitecture rtl of alu is/);
  assert.equal(n.data.language, 'vhdl');
});

test('new_source: the drawings, empty, in VHDL and in Verilog; their Check Syntax', async () => {
  for (const [lang, ext] of [['vhdl', 'v'], ['verilog', 'g']]) {
    for (const [type, label, fileExt] of [['schematic', 'Schematic', 'sch.json'], ['fsm', 'Finite State Machine (FSM)', 'fsm.json'], ['asm', 'Algorithmic State Machine (ASM)', 'asm.json'], ['petri', 'Petri Net', 'pn.json'], ['boolean', 'Boolean Algebra', 'bool.json']]) {
      const r = await ok('new_source', { project: 'p', type, name: `${type}_${ext}`, language: lang });
      assert.equal(r.text, `Created ${label} 'src/${type}_${ext}.${fileExt}'.`);
      // (its language, written into the drawing: its HDL is made in it)
      assert.equal(JSON.parse(read(`src/${type}_${ext}.${fileExt}`)).lang, lang);
    }
    assert.equal(await checks(`schematic_${ext}`), `Process "Check Syntax" of <schematic_${ext}> completed successfully (0 signals, 0 processes).`);
    assert.equal(await checks(`petri_${ext}`), `Process "Check Syntax" of <petri_${ext}> completed successfully (2 signals, 1 processes).`);
    const line = lang === 'vhdl' ? 13 : 9;
    assert.equal(await checks(`boolean_${ext}`), ['a', 'b', 'c'].map(i => `WARNING:Silinx:647 - "src/boolean_${ext}.bool.json" Line ${line}: Input <${i}> is never used.`).join('\n')
      + `\nProcess "Check Syntax" of <boolean_${ext}> completed successfully with 3 warning(s) (4 signals, 1 processes).`);
    // an empty state diagram or ASM chart: no module until it has a state
    for (const d of [`fsm_${ext}`, `asm_${ext}`]) assert.equal(await checks(d), `ERROR:HDLCompiler - "" Line 1: top module '${d}' not found\nProcess "Check Syntax" of <${d}> failed (1 error(s), 0 warning(s)).`);
  }
});

test('new_source: a package, a constraints file (the project\'s, having none), a .mem, a C and a C++ function', async () => {
  assert.equal((await ok('new_source', { project: 'p', type: 'package', name: 'defs' })).text, 'Created VHDL Package \'src/defs.vhd\'.');
  assert.match(read('src/defs.vhd'), /package defs is[\s\S]*package body defs is/);
  const c = await ok('new_source', { project: 'p', type: 'constraints', name: 'pins' });
  assert.equal(c.text, 'Created Implementation Constraints File \'constraints/pins.ucf\'.');
  assert.equal((await P.readProject('p')).constraints, 'constraints/pins.ucf');
  // a second one: the project keeps its own
  await ok('new_source', { project: 'p', type: 'constraints', name: 'more' });
  assert.equal((await P.readProject('p')).constraints, 'constraints/pins.ucf');
  assert.equal((await ok('new_source', { project: 'p', type: 'mem', name: 'rom' })).text, 'Created Memory Initialization File (.mem) \'src/rom.mem\'.');
  assert.equal(read('src/rom.mem'), '// memory initialization file ($readmemh format)\n00\n01\n02\n03\n');
  for (const [type, label, ext] of [['c', 'C Function (HLS)', 'c'], ['cpp', 'C++ Function (HLS)', 'cpp']]) {
    assert.equal((await ok('new_source', { project: 'p', type, name: `f_${type}` })).text, `Created ${label} 'src/f_${type}.${ext}'.`);
    assert.equal(await checks(`f_${type}`), `Process "Check Syntax" of <f_${type}> completed successfully (18 signals, 14 processes).`);
  }
  // an iCE40's constraints: a PCF
  await ok('new_project', { name: 'ice' });
  await ok('set_design_properties', { project: 'ice', board: 'none', part: 'ice40hx1k', package: 'vq100' });
  assert.equal((await ok('new_source', { project: 'ice', type: 'constraints', name: 'pins' })).text, 'Created Implementation Constraints File \'constraints/pins.pcf\'.');
});

test('new_source: the wizard\'s refusals; an existing file not replaced', async () => {
  await fails({ type: 'module', name: '9bad' }, 'Enter a valid file name (letters, digits, _ and -).');
  await fails({ type: 'module', name: 'ok', location: '../out' }, 'Invalid location.');
  await fails({ type: 'module', name: 'ok', location: 'build' }, 'build/ is written by Silinx itself');
  await fails({ type: 'module', name: 'cnt_vhd' }, 'src/cnt_vhd.vhd already exists: choose another name.');
  await fails({ type: 'module', name: 'other', module: 'cnt_v' }, 'A module named \'cnt_v\' already exists.');
  await fails({ type: 'module', name: 'm1', module: 'signal' }, '\'signal\' is a reserved word of VHDL: choose another name.');
  await fails({ type: 'module', name: 'm1', ports: [{ name: 'a' }, { name: 'A' }] }, 'Duplicate port names.');
  await fails({ type: 'module', name: 'm1', ports: [{ name: 'a b' }] }, 'Invalid port name \'a b\'.');
  await fails({ type: 'module', name: 'm1', ports: [{ name: 'a', dir: 'up' }] }, 'port \'a\': dir in, out or inout');
  await fails({ type: 'fsm', name: 'reg' }, '\'reg\' is a reserved word of Verilog: choose another name.');
  await fails({ type: 'fsm', name: 'cnt_v' }, 'A module named \'cnt_v\' already exists.');
  await fails({ type: 'fsm', name: 'other', ports: [] }, 'ports and architecture: a module\'s');
  await fails({ type: 'test_bench', name: 'tb_x', module: 'nosuch' }, 'no module \'nosuch\' in the project\'s HDL files');
  await fails({ type: 'test_bench', name: 'tb_y' }, 'module: the module the test bench tests (the project has no top)');
  await fails({ type: 'package', name: 'pk', language: 'verilog' }, 'a package is VHDL\'s');
  await fails({ type: 'netlist', name: 'n' }, 'type: one of module, test_bench, package, constraints, mem, c, cpp, schematic, fsm, asm, petri, boolean');
  // a drawing's HDL file taken
  await ok('write_file', { project: 'p', path: 'src/spare.vhd', text: '-- a file\n' });
  await fails({ type: 'asm', name: 'spare' }, 'src/spare.vhd already exists: the HDL generated from the new source would be written there. Choose another name.');
});
