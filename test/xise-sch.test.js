// ISE schematics in .xise projects: import (.sch -> .sch.json + HDL) and export (.sch.json -> .sch in the .xise).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { importXise, exportXise, importIseSchematics, exportIseSchematics, exportCSources } from '../server/xise.js';
import { compile, elaborate } from '../core/compile.js';

const F = new URL('./fixtures/ise-sch/', import.meta.url);
const read = n => fs.readFileSync(new URL(n, F), 'utf8');
const XISE = `<project xmlns:xil_pn="x"><files>
<file xil_pn:name="MyAND2b4.sch" xil_pn:type="FILE_SCHEMATIC"><association xil_pn:name="Implementation" xil_pn:seqID="1"/></file>
<file xil_pn:name="Mux4to1b4.sch" xil_pn:type="FILE_SCHEMATIC"><association xil_pn:name="Implementation" xil_pn:seqID="2"/></file>
</files><properties><property xil_pn:name="Device" xil_pn:value="xc3s250e"/><property xil_pn:name="Implementation Top" xil_pn:value="Module|Mux4to1b4"/></properties></project>`;

test('xise schematics are imported as synchronized schematics and exported back as .sch', () => {
  const parsed = importXise(XISE);
  assert.deepEqual(parsed.schematics.map(x => x.path), ['MyAND2b4.sch', 'Mux4to1b4.sch']);
  assert.equal(parsed.warnings.length, 0);
  const schFiles = Object.fromEntries(parsed.schematics.map(x => [x.path, read(x.path)]));
  const res = importIseSchematics(schFiles, { lang: parsed.lang });
  assert.equal(res.length, 2);
  const sources = {}, docs = {};
  for (const r of res) { assert.ok(r.json && r.hdl, r.warnings.join('; ')); sources[r.hdl] = r.code; docs[r.json] = JSON.parse(r.jsonText); }
  const lib = compile(Object.entries(sources).map(([path, text]) => ({ path, text })));
  assert.ok(elaborate(lib, 'Mux4to1b4').top, 'generated HDL elaborates');

  const project = { name: 'p', device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, top: 'Mux4to1b4',
    files: Object.keys(sources).map(path => ({ path, lang: 'vhdl', role: 'design' })) };
  const sch = exportIseSchematics(project, docs, sources);
  assert.equal(sch.schematics.length, 2);
  const xml = exportXise(project, { sources, schematics: sch.schematics, extraFiles: sch.extraFiles });
  assert.match(xml, /Mux4to1b4\.sch" xil_pn:type="FILE_SCHEMATIC"/);
  assert.doesNotMatch(xml, /Mux4to1b4\.vhd"/, 'the generated HDL is replaced by its schematic');
  assert.match(xml, /Implementation Top File" xil_pn:value="Mux4to1b4\.sch"/);

  // re-import of a Silinx export keeps the exact .sch.json
  const again = importIseSchematics({ 'Mux4to1b4.sch': sch.files.find(f => f.path === 'Mux4to1b4.sch').text },
    { existing: p => ({ 'Mux4to1b4.sch.json': JSON.stringify(docs['Mux4to1b4.sch.json']), 'Mux4to1b4.vhd': sources['Mux4to1b4.vhd'] })[p] });
  assert.deepEqual(JSON.parse(again[0].jsonText), docs['Mux4to1b4.sch.json']);
});

// a C source goes out as its HDL (#2320)
const C_SRC = 'int twice(int a) {\n  return a + a;\n}\n';
test('C sources: exported as their HDL in the project\'s language, listed in the .xise', () => {
  const vhdl = exportCSources({ preferredLanguage: 'vhdl' }, { 'src/twice.c': C_SRC, 'src/x.vhd': 'not C' });
  assert.deepEqual(vhdl.extraFiles, [{ path: 'src/twice.c.vhd', lang: 'vhdl', role: 'design' }]);
  assert.deepEqual(vhdl.warnings, []);
  assert.deepEqual(vhdl.files.map(f => f.path), ['src/twice.c.vhd']);
  const lib = compile([{ path: 'src/twice.c.vhd', lang: 'vhdl', text: vhdl.files[0].text }]);
  assert.deepEqual(lib.errors.filter(e => e.severity === 'error'), []);
  assert.deepEqual(elaborate(lib, 'twice').diags, []);
  const verilog = exportCSources({ preferredLanguage: 'verilog' }, { 'src/twice.c': C_SRC });
  assert.deepEqual(verilog.extraFiles, [{ path: 'src/twice.c.v', lang: 'verilog', role: 'design' }]);
  const vlib = compile([{ path: 'src/twice.c.v', lang: 'verilog', text: verilog.files[0].text }]);
  assert.deepEqual(vlib.errors.filter(e => e.severity === 'error'), []);
  assert.deepEqual(elaborate(vlib, 'twice').diags, []);
  const parsed = importXise(exportXise({ name: 'c', top: 'twice', files: [], device: {} }, { extraFiles: vhdl.extraFiles, sources: { 'src/twice.c.vhd': vhdl.files[0].text } }));
  assert.deepEqual(parsed.files, [{ path: 'src/twice.c.vhd', lang: 'vhdl', role: 'design' }]);
});

test('C sources: none, a module an HDL file defines (that file), a C source with errors (a warning)', () => {
  assert.deepEqual(exportCSources({}, {}), { extraFiles: [], files: [], warnings: [] });
  const hdl = 'entity twice is end;\narchitecture a of twice is begin end;\n';
  assert.deepEqual(exportCSources({}, { 'src/twice.c': C_SRC }, { 'src/twice.vhd': hdl }), { extraFiles: [], files: [], warnings: [] });
  const bad = exportCSources({}, { 'src/bad.c': 'int f( {' });
  assert.deepEqual([bad.extraFiles, bad.files], [[], []]);
  assert.equal(bad.warnings.length, 1);
  assert.match(bad.warnings[0], /^src\/bad\.c: not exported, its HDL could not be made \(src\/bad\.c: line 1: /);
});
