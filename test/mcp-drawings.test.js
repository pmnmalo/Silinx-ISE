// The MCP server and the drawings (#2674): write_file of a drawing makes its HDL file again (server/drawing-sync.js), a
// drawing with errors leaves it stale and Check Syntax and the simulation stop on it with the interface's error;
// set_source_properties and set_design_properties' preferred_language put the drawings and their HDL in a language.
// The examples' test benches simulated after it, in VHDL and in Verilog, with no warning.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-drawings-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const read = (name, f) => fs.readFileSync(path.join(P.projectDir(name), f), 'utf8');
// the test bench run: it passes ("Simulation finished OK", or no message), no warning
async function passes(name, messages) {
  const s = await ok('simulate', { project: name, time_ns: 100000, signals: [] });
  assert.equal(s.data.failed, false, s.text);
  assert.deepEqual(s.data.warnings, []);
  assert.deepEqual(s.data.log.map(l => l.text), messages);
}

test('write_file of a drawing: its HDL file made again; with errors, stale, and Check Syntax and Simulate stop on it', async () => {
  await ok('new_project_from_example', { name: 't', example: 'traffic' });
  // the same text: nothing to make again
  assert.equal((await ok('write_file', { project: 't', path: 'src/traffic.fsm.json', text: read('t', 'src/traffic.fsm.json') })).text, 'Wrote src/traffic.fsm.json (3173 characters).');
  const tt = JSON.parse(read('t', 'src/lamps.bool.json'));
  tt.table.car_g = `10${tt.table.car_g.slice(2)}`;
  const w = await ok('write_file', { project: 't', path: 'src/lamps.bool.json', text: JSON.stringify(tt, null, 2) });
  assert.equal(w.text, `Wrote src/lamps.bool.json (${JSON.stringify(tt, null, 2).length} characters).\nsrc/lamps.vhd updated from src/lamps.bool.json`);
  assert.deepEqual(w.data.hdl, { file: 'src/lamps.vhd', written: true, removed: null, stale: null });
  assert.equal((await ok('check_syntax', { project: 't' })).text, 'Process "Check Syntax" of <top> completed successfully (41 signals, 30 processes).');
  // a state diagram with errors
  const good = read('t', 'src/traffic.fsm.json');
  const fsm = JSON.parse(good);
  fsm.transitions[0].to = 's99';
  const why = 'A transition starts or ends at a state that does not exist';
  const e = await ok('write_file', { project: 't', path: 'src/traffic.fsm.json', text: JSON.stringify(fsm, null, 2) });
  assert.equal(e.text, `Wrote src/traffic.fsm.json (${JSON.stringify(fsm, null, 2).length} characters).\nWARNING: src/traffic.vhd not updated: src/traffic.fsm.json has errors: ${why}`);
  const stale = `ERROR:Silinx - "src/traffic.vhd" Line 1: src/traffic.vhd is not up to date: src/traffic.fsm.json cannot generate it, it has errors: ${why}. Fix src/traffic.fsm.json (its HDL is then generated again).`;
  assert.equal((await ok('check_syntax', { project: 't' })).text, `${stale}\nProcess "Check Syntax" of <top> failed (1 error(s), 0 warning(s)).`);
  const s = await call('simulate', { project: 't', time_ns: 10 });
  assert.equal(s.isError, true);
  assert.equal(s.text, `${stale}\nThe simulation of <tb_traffic> did not start: 1 error(s) (check_syntax with simulation).`);
  // fixed: Check Syntax as before
  await ok('write_file', { project: 't', path: 'src/traffic.fsm.json', text: good });
  assert.equal((await ok('check_syntax', { project: 't' })).text, 'Process "Check Syntax" of <top> completed successfully (41 signals, 30 processes).');
});

// #3286: a state diagram's transitions as its editor draws a stroke: a transition's bend, a self-loop's angle, written
// with write_file, kept, its HDL the same as without them
test('#3286 write_file of a state diagram with a transition\'s bend and a self-loop\'s angle: kept, its HDL the same', async () => {
  await ok('new_project_from_example', { name: 'f', example: 'traffic' });
  const fsm = JSON.parse(read('f', 'src/traffic.fsm.json'));
  fsm.transitions.push({ id: 't9', from: 's2', to: 's2', cond: '!done', outputs: {} });   // (waiting in CARS_YELLOW)
  await ok('write_file', { project: 'f', path: 'src/traffic.fsm.json', text: JSON.stringify(fsm, null, 2) });
  const hdl = read('f', 'src/traffic.vhd');
  fsm.transitions.find(t => t.id === 't2').bend = -45;
  fsm.transitions.find(t => t.id === 't9').angle = 90;
  const text = JSON.stringify(fsm, null, 2);
  const w = await ok('write_file', { project: 'f', path: 'src/traffic.fsm.json', text });
  assert.equal(w.text, `Wrote src/traffic.fsm.json (${text.length} characters).`);
  const back = JSON.parse((await ok('read_file', { project: 'f', path: 'src/traffic.fsm.json' })).text);
  assert.deepEqual(back.transitions.filter(t => ['t2', 't9'].includes(t.id)).map(t => [t.id, t.bend, t.angle]), [['t2', -45, undefined], ['t9', undefined, 90]]);
  assert.equal(read('f', 'src/traffic.vhd'), hdl);
  const c = await ok('check_drawing', { project: 'f', file: 'src/traffic.fsm.json' });
  assert.deepEqual([c.text, c.data.errors, c.data.warnings], ['Process "Check State Diagram" of traffic.fsm.json completed successfully.', [], []]);
});

// #3763: a transition added with its condition (the editor lost it when given in the Properties panel as it was drawn):
// kept, its HDL made with it (compiled and elaborated, no warning), simulate_drawing takes it
test('#3763 write_file of a state diagram with a new transition and its condition: kept, in its HDL, simulated', async () => {
  const { compile, elaborate } = await import('../core/compile.js');
  await ok('new_project_from_example', { name: 'nt', example: 'traffic' });
  const fsm = JSON.parse(read('nt', 'src/traffic.fsm.json'));
  fsm.transitions.push({ id: 't9', from: 's2', to: 's1', cond: 'night && !done', outputs: {} });   // (CARS_YELLOW back to CARS at night)
  const text = JSON.stringify(fsm, null, 2);
  assert.equal((await ok('write_file', { project: 'nt', path: 'src/traffic.fsm.json', text })).text, `Wrote src/traffic.fsm.json (${text.length} characters).\nsrc/traffic.vhd updated from src/traffic.fsm.json`);
  assert.deepEqual(JSON.parse(read('nt', 'src/traffic.fsm.json')).transitions.at(-1), { id: 't9', from: 's2', to: 's1', cond: 'night && !done', outputs: {} });
  const vhd = read('nt', 'src/traffic.vhd');
  assert.match(vhd, /elsif \(night = '1'\) and \(done = '0'\) then\n +state_next <= S_CARS;/);
  const lib = compile([{ path: 'traffic.vhd', lang: 'vhdl', text: vhd }]);
  assert.deepEqual(lib.errors.map(e => `${e.severity}: ${e.message}`), []);
  assert.deepEqual(elaborate(lib, 'traffic').diags.map(e => `${e.severity}: ${e.message}`), []);
  const c = await ok('check_drawing', { project: 'nt', file: 'src/traffic.fsm.json' });
  assert.deepEqual([c.data.errors, c.data.warnings], [[], []]);
  const r = await ok('simulate_drawing', { project: 'nt', file: 'src/traffic.fsm.json', cycles: [{ req: 1, done: 1 }, { night: 1 }, {}] });
  assert.deepEqual(r.data.cycles.map(x => [x.state, x.next]), [['CARS', 'CARS_YELLOW'], ['CARS_YELLOW', 'CARS'], ['CARS', 'CARS']]);
});

// #2924: the Karnaugh maps' order of a truth table, the interface's selector, is the document's kmapOrder: written with
// write_file, kept, its HDL unchanged
test('#2924 write_file of a truth table with its Karnaugh maps\' order: kept, its HDL the same', async () => {
  await ok('new_project_from_example', { name: 'k', example: 'traffic' });
  const hdl = read('k', 'src/lamps.vhd');
  const tt = JSON.parse(read('k', 'src/lamps.bool.json'));
  assert.equal('kmapOrder' in tt, false, 'by columns, then rows: the default, not written');
  const text = JSON.stringify({ ...tt, kmapOrder: 'rows' }, null, 2);
  const w = await ok('write_file', { project: 'k', path: 'src/lamps.bool.json', text });
  assert.equal(w.text, `Wrote src/lamps.bool.json (${text.length} characters).`);
  assert.deepEqual([JSON.parse(read('k', 'src/lamps.bool.json')).kmapOrder, read('k', 'src/lamps.vhd')], ['rows', hdl]);
  assert.match((await ok('check_syntax', { project: 'k' })).text, /completed successfully/);
  const { tools } = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/list', params: {} })).result;
  assert.match(tools.find(t => t.name === 'write_file').description, /"kmapOrder": "rows" lays its Karnaugh maps' variables out MSB → LSB by rows, then columns/);
});

test('set_source_properties: a drawing in Verilog (its HDL file with it), back to the project\'s; HDL written by hand has none', async () => {
  await ok('new_project_from_example', { name: 's', example: 'traffic' });
  const v = await ok('set_source_properties', { project: 's', path: 'src/traffic.vhd', language: 'verilog' });
  assert.equal(v.text, 'src/traffic.fsm.json: its HDL is now in Verilog, src/traffic.v (src/traffic.vhd removed)\nsrc/traffic.fsm.json: Verilog.');
  assert.deepEqual((await P.readProject('s')).sourceLanguage, { 'src/traffic.fsm.json': 'verilog' });
  assert.ok((await P.readProject('s')).files.some(f => f.path === 'src/traffic.v' && f.lang === 'verilog'));
  assert.equal((await ok('check_syntax', { project: 's', simulation: true })).text, 'Process "Check Syntax" of <tb_traffic> completed successfully (42 signals, 32 processes).');
  await passes('s', ['Simulation finished OK']);
  assert.equal((await ok('set_source_properties', { project: 's', path: 'src/traffic.fsm.json', language: 'verilog' })).text, 'src/traffic.fsm.json: Verilog, as it was.');
  // its own kept when the Preferred Language changes
  await ok('set_design_properties', { project: 's', preferred_language: 'verilog' });
  const p = await ok('set_design_properties', { project: 's', preferred_language: 'vhdl' });
  assert.equal(p.text, 'Preferred Language: VHDL (1 drawing(s) now in it, their HDL made again in it).\nsrc/lamps.bool.json: its HDL is now in VHDL, src/lamps.vhd (src/lamps.v removed)\nDevice set to xc3s250e-4-cp132 (board basys2); synthesis tool of Toolchain Settings.');
  assert.ok(fs.existsSync(path.join(P.projectDir('s'), 'src/traffic.v')));
  const back = await ok('set_source_properties', { project: 's', path: 'src/traffic.fsm.json', language: 'project' });
  assert.equal(back.text, 'src/traffic.fsm.json: its HDL is now in VHDL, src/traffic.vhd (src/traffic.v removed)\nsrc/traffic.fsm.json: VHDL (the project\'s Preferred Language).');
  for (const [args, message] of [
    [{ path: 'src/top.vhd', language: 'verilog' }, '\'src/top.vhd\' has no language to choose: HDL written by hand, or a drawing made from its HDL'],
    [{ path: 'src/none.fsm.json', language: 'verilog' }, 'no file \'src/none.fsm.json\' in the project \'s\''],
    [{ path: 'src/traffic.fsm.json', language: 'c' }, 'language: one of vhdl, verilog, project']]) {
    const r = await call('set_source_properties', { project: 's', ...args });
    assert.equal(r.isError, true);
    assert.equal(r.text, `set_source_properties: ${message}`);
  }
});

test('set_design_properties preferred_language: the drawings\' HDL in Verilog, the test benches pass in both languages', async () => {
  for (const [ex, drawing, hdl, messages] of [['gates', 'src/gates.sch.json', 'src/gates', ['Simulation finished OK']], ['blinky', 'src/speed_ctrl.asm.json', 'src/speed_ctrl', []], ['traffic', 'src/traffic.fsm.json', 'src/traffic', ['Simulation finished OK']]]) {
    const name = `l_${ex}`;
    await ok('new_project_from_example', { name, example: ex });
    await passes(name, messages);
    const r = await ok('set_design_properties', { project: name, preferred_language: 'verilog' });
    assert.ok(r.text.startsWith('Preferred Language: Verilog ('), r.text);
    assert.ok(r.text.includes(`${drawing}: its HDL is now in Verilog, ${hdl}.v (${hdl}.vhd removed)`), r.text);
    assert.deepEqual(r.data.warnings, []);
    assert.equal(r.data.preferredLanguage, 'verilog');
    assert.ok(!fs.existsSync(path.join(P.projectDir(name), `${hdl}.vhd`)));
    assert.match((await ok('check_syntax', { project: name, simulation: true })).text, /^Process "Check Syntax" of <tb_\w+> completed successfully \(\d+ signals, \d+ processes\)\.$/);
    await passes(name, messages);
  }
  const r = await call('set_design_properties', { project: 'l_gates', preferred_language: 'c' });
  assert.equal(r.text, 'set_design_properties: preferred_language: one of vhdl, verilog');
});
