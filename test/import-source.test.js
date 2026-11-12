// Unit tests (#3546): Import Source / Add Copy of Source / Import Test Bench's rules (core/import-source.js, the
// interface's dialog's and the MCP's import_source): where a copy goes, the import gate and a drawing's reserved name,
// the project's description after the copies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IMPORT_SOURCE_ACCEPT, IMPORT_SOURCE_ROLES, importSourcePath, importSourceTakes, isConstraintsFile, importSourceFile, assignImported } from '../core/import-source.js';
import { gateFile } from '../core/import-gate.js';

const enc = s => new TextEncoder().encode(s);

test('importSourcePath: constraints to constraints/, a simulation source to sim/, the rest to src/', () => {
  assert.equal(importSourcePath('top.vhd', 'design'), 'src/top.vhd');
  assert.equal(importSourcePath('top.vhd', 'impl'), 'src/top.vhd');
  assert.equal(importSourcePath('tb.v', 'sim'), 'sim/tb.v');
  for (const c of ['a.ucf', 'a.PCF', 'a.lpf', 'a.cst', 'a.xdc']) assert.equal(importSourcePath(c, 'sim'), `constraints/${c}`);
  assert.equal(importSourcePath('rom.mem', 'design'), 'src/rom.mem');
  assert.ok(isConstraintsFile('x.UCF') && !isConstraintsFile('x.vhd'));
});

test('importSourceTakes: the dialog\'s accepted files only', () => {
  assert.equal(IMPORT_SOURCE_ACCEPT, '.v,.vhd,.vhdl,.ucf,.pcf,.lpf,.cst,.mem,.hex,.asm.json,.json');
  for (const f of ['a.v', 'a.VHD', 'a.vhdl', 'a.ucf', 'a.pcf', 'a.lpf', 'a.cst', 'a.mem', 'a.hex', 'a.asm.json', 'a.fsm.json']) assert.ok(importSourceTakes(f), f);
  for (const f of ['a.sv', 'a.exe', 'a.c', 'a', 'a.xdc', 'v']) assert.ok(!importSourceTakes(f), f);
  assert.deepEqual(IMPORT_SOURCE_ROLES.map(r => r[0]), ['design', 'impl', 'sim']);
});

test('importSourceFile: the gate\'s file (as gateFile gives it), its warning; a refusal of the gate; a drawing named with a reserved word', () => {
  const text = 'entity a is end a;\n';
  assert.deepEqual(importSourceFile('a.vhd', enc(text), 'design'), { path: 'src/a.vhd', text, warning: null });
  // invalid UTF-8: replaced, a warning (the gate's own)
  const bytes = new Uint8Array([0x2d, 0x2d, 0xff, 0x0a]);
  const bad = importSourceFile('b.vhd', bytes, 'sim');
  assert.equal(bad.path, 'sim/b.vhd');
  assert.ok(bad.warning);
  assert.equal(bad.warning, gateFile('sim/b.vhd', bytes).warning);
  // a name the gate refuses: not imported, said as the console says it
  const r = importSourceFile('x‮.vhd', enc(text), 'design');
  assert.equal(r.refused, 'gate');
  assert.match(r.message, /^src\/x‮\.vhd: not imported: /);
  // a drawing named 'and': refused; one named well, or a .json that is not a drawing: taken
  assert.deepEqual(importSourceFile('g.fsm.json', enc('{"name":"and"}'), 'design'),
    { path: 'src/g.fsm.json', refused: 'reserved', message: 'g.fsm.json: \'and\' is a reserved word of VHDL and Verilog: rename the module in the file first.' });
  assert.equal(importSourceFile('g.fsm.json', enc('{"name":"gate"}'), 'design').refused, undefined);
  assert.equal(importSourceFile('n.json', enc('not json'), 'design').text, 'not json');
});

test('assignImported: the association of the files written only; a constraints file the project\'s when its own is not among its files', () => {
  const pj = () => ({ files: [{ path: 'src/a.vhd', role: 'design' }, { path: 'src/b.vhd', role: 'design' }], constraints: 'constraints/old.ucf' });
  const a = assignImported(pj(), ['src/b.vhd', 'constraints/new.ucf'], 'impl', ['src/a.vhd', 'constraints/old.ucf']);
  assert.deepEqual(a, { files: [{ path: 'src/a.vhd', role: 'design' }, { path: 'src/b.vhd', role: 'impl' }], constraints: 'constraints/old.ucf' });
  assert.equal(assignImported(pj(), ['constraints/new.ucf'], 'design', ['src/a.vhd']).constraints, 'constraints/new.ucf');
  assert.equal(assignImported({ files: [] }, ['constraints/x.ucf'], 'design', []).constraints, 'constraints/x.ucf');
});
