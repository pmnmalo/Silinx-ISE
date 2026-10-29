// core/view-hdl.js drawingInLanguage: a drawing in the other language (#220: its editor's HDL language; #1477: the
// project's Preferred Language changed in Design Properties). The examples' drawings (gates' schematic, traffic's
// state diagram and truth table, blinky's ASM chart) and a Petri net: each in Verilog, its HDL file .vhd -> .v, the
// example with that file in place of the VHDL one compiled, elaborated and its test bench passing, with the same
// warnings; back in VHDL, the HDL shipped with the example.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { drawingInLanguage, viewHdl } from '../core/view-hdl.js';
import { compile, elaborate } from '../core/compile.js';
import { newPetri } from '../core/petri.js';
import { example } from './examples-lib.mjs';

// the examples' drawings: [example, drawing, its HDL file]
const DRAWINGS = [
  ['gates', 'src/gates.sch.json', 'src/gates.vhd'],
  ['traffic', 'src/traffic.fsm.json', 'src/traffic.vhd'],
  ['traffic', 'src/lamps.bool.json', 'src/lamps.vhd'],
  ['blinky', 'src/speed_ctrl.asm.json', 'src/speed_ctrl.vhd'],
];
const read = (ex, f) => fs.readFileSync(path.join(example(ex).dir, f), 'utf8');

// the example's test bench with `swap` ({ path: { path, lang, text } }: a source replaced by another):
// { passed, errors, warnings } (the compile's, the elaboration's and the simulation's)
async function testbench(name, swap = {}) {
  const { Simulator } = await import('../core/simulator.js');
  const { primitiveSources } = await import('../core/unisim.js');
  const ex = example(name);
  const all = ex.sources.map(s => swap[s.path] || s);
  const lib = compile([...primitiveSources(all), ...all]);
  const des = elaborate(lib, ex.project.simTop);
  const sim = new Simulator(des, { files: new Map(all.map(s => [s.path, s.text])) });
  for (const s of des.signals) s.wave = null;
  for (let t = 5e7; t <= 5e9; t += 5e7) { if (sim.run(t).finished || sim.log.some(e => /Simulation finished OK|ERROR/.test(e.text))) break; }
  const log = sim.log.map(e => e.text);
  const diags = [...lib.errors, ...des.diags];
  return {
    passed: log.some(l => /Simulation finished OK/.test(l)) && !log.some(l => /ERROR/.test(l)),
    errors: diags.filter(e => e.severity === 'error').map(e => `${e.file}:${e.line} ${e.message}`),
    warnings: [...diags.filter(e => e.severity === 'warning').map(e => e.message), ...sim.log.filter(e => e.kind === 'warning').map(e => e.text)],
  };
}

for (const [ex, f, hdl] of DRAWINGS) {
  test(`${ex}: ${f} in Verilog: its HDL file ${hdl} becomes .v, the example simulates as in VHDL; back in VHDL, the HDL shipped (#1477)`, async () => {
    const text = read(ex, f);
    assert.equal(drawingInLanguage(f, text, 'vhdl'), null, 'in VHDL already: nothing to do');
    const v = drawingInLanguage(f, text, 'verilog');
    const target = hdl.replace(/\.vhd$/, '.v');
    assert.deepEqual([v.from, v.target, v.model.lang, v.model.generatedFile, v.errors], [hdl, target, 'verilog', target, []]);
    assert.deepEqual(JSON.parse(v.text), v.model);
    assert.match(v.hdl, new RegExp(`^\\s*module ${v.module}\\b`, 'm'));
    assert.doesNotMatch(v.hdl, /\bentity\b|\barchitecture\b/);
    // the same HDL the drawing makes once linked elsewhere (as the app writes it)
    assert.equal(v.hdl, viewHdl(f, JSON.stringify({ ...v.model, generatedFile: undefined })).text);
    // the example with the Verilog file in place of the VHDL one: compiled, elaborated, its test bench passing, the
    // same warnings as the example as it is
    const base = await testbench(ex);
    assert.deepEqual(base, { passed: true, errors: [], warnings: [] });
    const r = await testbench(ex, { [hdl]: { path: target, lang: 'verilog', role: 'design', text: v.hdl } });
    assert.deepEqual(r, base);
    // the top elaborated too (implementation)
    const all = example(ex).design.map(s => (s.path === hdl ? { ...s, path: target, lang: 'verilog', text: v.hdl } : s));
    const top = elaborate(compile(all), example(ex).project.top);
    assert.deepEqual(top.diags.map(d => `${d.severity}: ${d.message}`), []);
    // back in VHDL: the drawing and the HDL shipped with the example
    const back = drawingInLanguage(f, v.text, 'vhdl');
    assert.deepEqual([back.from, back.target, back.model.generatedFile, back.errors], [target, hdl, hdl, []]);
    assert.equal(back.hdl, read(ex, hdl));
    assert.equal(drawingInLanguage(f, back.text, 'vhdl'), null);
  });
}

test('a Petri net in both languages: its HDL compiled and elaborated with no errors and no warnings (#1477)', () => {
  const f = 'src/net.pn.json';
  const v = drawingInLanguage(f, JSON.stringify({ ...newPetri('net', 'vhdl'), generatedFile: 'src/net.vhd' }), 'verilog');
  assert.deepEqual([v.target, v.model.generatedFile, v.errors], ['src/net.v', 'src/net.v', []]);
  const back = drawingInLanguage(f, v.text, 'vhdl');
  assert.deepEqual([back.target, back.model.generatedFile, back.errors], ['src/net.vhd', 'src/net.vhd', []]);
  for (const [r, lang, file] of [[v, 'verilog', 'src/net.v'], [back, 'vhdl', 'src/net.vhd']]) {
    const lib = compile([{ path: file, lang, text: r.hdl }]);
    const des = elaborate(lib, 'net');
    assert.deepEqual([...lib.errors, ...des.diags].map(d => `${d.severity}: ${d.message}`), [], lang);
  }
});

test('a drawing with no HDL file, with errors, or whose language the drawing does not say (#1477)', () => {
  // no HDL file (a module by itself): its language only, no file
  const t = drawingInLanguage('src/n.pn.json', JSON.stringify(newPetri('n', 'vhdl')), 'verilog');
  assert.deepEqual([t.from, t.target, t.model.lang, 'generatedFile' in t.model, t.errors], [null, null, 'verilog', false, []]);
  // errors (a state diagram with no states): the language changed, its link kept until it has none
  const bad = drawingInLanguage('src/f.fsm.json', JSON.stringify({ name: 'f', lang: 'vhdl', states: [], transitions: [], generatedFile: 'src/f.vhd' }), 'verilog');
  assert.equal(bad.model.lang, 'verilog');
  assert.equal(bad.model.generatedFile, 'src/f.vhd');
  assert.equal(bad.target, 'src/f.v');
  assert.ok(bad.errors.length > 0);
  // no `lang` in the drawing: its HDL file's
  const gates = JSON.parse(read('gates', 'src/gates.sch.json'));
  delete gates.lang;
  assert.equal(drawingInLanguage('src/gates.sch.json', JSON.stringify(gates), 'vhdl'), null);
  assert.equal(drawingInLanguage('src/gates.sch.json', JSON.stringify(gates), 'verilog').target, 'src/gates.v');
  // a drawing in Verilog whose link is still the VHDL file (switched while it had errors): made again
  const half = drawingInLanguage('src/gates.sch.json', JSON.stringify({ ...gates, lang: 'verilog' }), 'verilog');
  assert.deepEqual([half.from, half.target, half.errors], ['src/gates.vhd', 'src/gates.v', []]);
  assert.throws(() => drawingInLanguage('src/x.sch.json', '{', 'verilog'), SyntaxError);
});
