// A project's kind (#3780, core/project-kind.js): an FPGA project, or a design and simulation project (no board, no
// constraints, no HDL shown); the files of the HDL side, the refusals and their messages, and the changes of kind both ways.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESIGN_KIND, DESIGN_ONLY_LABEL, DESIGN_ONLY_MESSAGES as M, addRefusal, asDesignProject, asFpgaProject, hdlFile, hdlSideFile, isDesignOnly, ownSources, toDesignProject } from '../core/project-kind.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const design = { name: 'd', kind: 'design', board: null, constraints: null, device: { part: 'xc3s250e' }, files: [] };

test('isDesignOnly: the kind design only; an FPGA project has none (every project before)', () => {
  assert.equal(DESIGN_KIND, 'design');
  assert.equal(DESIGN_ONLY_LABEL, 'Design and simulation only (no FPGA)');
  assert.deepEqual([design, { kind: 'fpga' }, {}, null, undefined].map(isDesignOnly), [true, false, false, false, false]);
  // (every example an FPGA project)
  for (const ex of fs.readdirSync(path.join(ROOT, 'examples')).filter(e => fs.existsSync(path.join(ROOT, 'examples', e, 'silinx.json')))) {
    assert.equal(isDesignOnly(JSON.parse(fs.readFileSync(path.join(ROOT, 'examples', ex, 'silinx.json'), 'utf8'))), false, ex);
  }
});

test('hdlSideFile / hdlFile: HDL, C, constraints and memory files; the drawings, labs and documents not', () => {
  for (const f of ['src/a.vhd', 'src/a.VHDL', 'src/a.v', 'src/a.sv', 'inc/a.vh', 'src/f.c', 'src/f.cpp', 'src/f.h', 'constraints/top.ucf', 'c/t.pcf', 'c/t.xdc', 'c/t.lpf', 'c/t.cst', 'src/rom.mem', 'src/rom.hex', 'src/rom.coe']) assert.equal(hdlSideFile(f), true, f);
  for (const f of ['src/a.sch.json', 'src/a.fsm.json', 'src/a.asm.json', 'src/a.bool.json', 'src/a.tt.json', 'src/a.pn.json', 'src/a.sym.json', 'labs/l.lab.json', 'sim/w.wcfg', 'README.md', 'src/vhd', '', null]) assert.equal(hdlSideFile(f), false, String(f));
  assert.deepEqual(['src/a.vhd', 'src/a.v', 'src/a.sv', 'src/f.c', 'top.ucf'].map(hdlFile), [true, true, true, false, false]);
});

test('addRefusal: an HDL-side file in a design project, with its message; nothing in an FPGA project', () => {
  assert.equal(addRefusal(design, 'src/x.vhd'), 'src/x.vhd: a design and simulation project has drawings only: choose a board in Design Properties to add HDL sources');
  assert.equal(addRefusal(design, 'src/x.sch.json'), null);
  assert.equal(addRefusal({ ...design, kind: undefined }, 'src/x.vhd'), null);
  assert.equal(M.hidden('src/x.vhd'), 'src/x.vhd: a design and simulation project does not show its HDL (its drawings are its sources)');
  assert.equal(M.flow('d'), 'the project \'d\' is a design and simulation project (no FPGA): choose a board in Design Properties to implement, emulate or program it');
});

test('asDesignProject / asFpgaProject: the kind, the board and the constraints; the rest kept', () => {
  const fpga = { name: 'p', board: 'basys2', device: { part: 'xc3s250e' }, constraints: 'constraints/top.ucf', top: 't', files: [{ path: 'sim/tb.vhd', role: 'sim' }] };
  const d = asDesignProject(fpga);
  assert.deepEqual(d, { ...fpga, kind: 'design', board: null, constraints: null });
  assert.equal(fpga.kind, undefined, 'not changed in place');
  const f = asFpgaProject(d, { board: 'nexys2', device: { part: 'xc3s500e' }, ext: '.ucf' });
  assert.deepEqual(f, { ...fpga, board: 'nexys2', device: { part: 'xc3s500e' } });
  assert.equal('kind' in f, false);
  assert.equal(asFpgaProject(d, { board: null, device: { part: 'ice40up5k' }, ext: '.pcf' }).constraints, 'constraints/top.pcf');
  assert.deepEqual(asFpgaProject(d, { board: 'basys2' }).device, fpga.device, 'the device kept when none is given');
});

test('ownSources / toDesignProject: refused with HDL or C sources no drawing makes; test benches and constraints are no sources', () => {
  const pj = { name: 'p', board: 'basys2', constraints: 'constraints/top.ucf', files: [
    { path: 'src/traffic.vhd', role: 'design' }, { path: 'src/timer.vhd', role: 'design' }, { path: 'src/f.c', role: 'design' },
    { path: 'sim/tb.vhd', role: 'sim' }, { path: 'constraints/top.ucf', role: 'design' }] };
  assert.deepEqual(ownSources(pj, ['src/traffic.vhd']), ['src/timer.vhd', 'src/f.c']);
  assert.deepEqual(toDesignProject(pj, ['src/traffic.vhd']), { error: 'the project \'p\' cannot become a design and simulation project: its HDL and C sources are not drawings (src/timer.vhd, src/f.c)' });
  const drawn = { ...pj, files: pj.files.filter(f => !/timer|f\.c/.test(f.path)) };
  assert.deepEqual(ownSources(drawn, ['src/traffic.vhd']), []);
  assert.deepEqual(toDesignProject(drawn, ['src/traffic.vhd']), { project: { ...drawn, kind: 'design', board: null, constraints: null } });
  assert.deepEqual(toDesignProject({ name: 'e', files: [] }).project.kind, 'design', 'an empty project');
});
