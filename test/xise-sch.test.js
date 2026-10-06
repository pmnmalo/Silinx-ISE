// ISE schematics in .xise projects: import (.sch -> .sch.json + HDL) and export (.sch.json -> .sch in the .xise).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { importXise, exportXise, importIseSchematics, exportIseSchematics } from '../server/xise.js';
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

  // re-import of an XAIlinx export keeps the exact .sch.json
  const again = importIseSchematics({ 'Mux4to1b4.sch': sch.files.find(f => f.path === 'Mux4to1b4.sch').text },
    { existing: p => ({ 'Mux4to1b4.sch.json': JSON.stringify(docs['Mux4to1b4.sch.json']), 'Mux4to1b4.vhd': sources['Mux4to1b4.vhd'] })[p] });
  assert.deepEqual(JSON.parse(again[0].jsonText), docs['Mux4to1b4.sch.json']);
});
