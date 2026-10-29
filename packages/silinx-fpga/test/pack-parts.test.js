// The parts of the packer (#405: out of packWith in packages/silinx-fpga/src/fpga/pack.js): the netlist prepared (pack-prep.js) and the
// slices under construction (pack-slices.js) mounted alone on a counter's netlist: own copies of the cells and nets,
// INST LOC constraints read, the cells the packer cannot pack refused; a slice's LUT slot taken twice refused. The
// other parts (pack-iobregs.js, pack-carry.js, pack-muxes.js, pack-mems.js, pack-luts.js, pack-iobcfg.js,
// pack-bram.js, pack-dcm-mult.js, pack-pads.js, pack-nets.js, pack-cfg.js) through pack: the counter's slices, its
// carry chain, its pads and clock buffer, every cell somewhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readYosysJson } from '../packages/silinx-fpga/src/fpga/netlist.js';
import { pack, PackError } from '../packages/silinx-fpga/src/fpga/pack.js';
import { mountPrep } from '../packages/silinx-fpga/src/fpga/pack-prep.js';
import { mountSlices } from '../packages/silinx-fpga/src/fpga/pack-slices.js';
import { mountIobRegs } from '../packages/silinx-fpga/src/fpga/pack-iobregs.js';
import { mountCarry } from '../packages/silinx-fpga/src/fpga/pack-carry.js';
import { mountMuxes } from '../packages/silinx-fpga/src/fpga/pack-muxes.js';
import { mountMemories } from '../packages/silinx-fpga/src/fpga/pack-mems.js';
import { mountLuts } from '../packages/silinx-fpga/src/fpga/pack-luts.js';
import { mountIobSettings } from '../packages/silinx-fpga/src/fpga/pack-iobcfg.js';
import { mountBram } from '../packages/silinx-fpga/src/fpga/pack-bram.js';
import { mountDcmMult } from '../packages/silinx-fpga/src/fpga/pack-dcm-mult.js';
import { mountPads } from '../packages/silinx-fpga/src/fpga/pack-pads.js';
import { mountNets } from '../packages/silinx-fpga/src/fpga/pack-nets.js';
import { mountConfig } from '../packages/silinx-fpga/src/fpga/pack-cfg.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fpga');
const counter = () => readYosysJson(fs.readFileSync(path.join(FIX, 'counter.json'), 'utf8'));

test('#405 packer parts: the mounts are the modules\'', () => {
  for (const f of [mountPrep, mountSlices, mountIobRegs, mountCarry, mountMuxes, mountMemories, mountLuts, mountIobSettings, mountBram, mountDcmMult, mountPads, mountNets, mountConfig]) assert.equal(typeof f, 'function');
});

test('#405 packer parts, the netlist prepared: own copies, INST LOC read, an unsupported cell refused', () => {
  const nl = counter();
  const p = mountPrep({ nl, ucf: 'INST "dcm0" LOC = "DCM_X0Y0";' });
  assert.equal(p.cells.length, nl.cells.length);
  assert.ok(p.cells.every((c, i) => c !== nl.cells[i] && c.idx === i && c.name === nl.cells[i].name));
  assert.ok(p.nets.every((n, i) => n !== nl.nets[i]));
  assert.deepEqual([...p.instLocs], [['dcm0', 'DCM_X0Y0']]);
  assert.deepEqual(new Set(p.liveCells().map(c => c.type)), new Set(['BUFG', 'FDRE', 'IBUF', 'LUT1', 'LUT4', 'MUXCY', 'OBUF', 'XORCY']));
  assert.equal(p.carryPass, 0);
  const lut = p.cells.find(c => c.type === 'LUT4');
  assert.ok(p.isLut(lut) && p.driverCell(lut.pins.O) === lut);
  const bad = counter();
  bad.cells[0] = { ...bad.cells[0], type: 'FOO' };
  assert.throws(() => mountPrep({ nl: bad, ucf: null }), e => e instanceof PackError && e.message === 'pack: cells not supported yet: FOO');
});

test('#405 packer parts, the slices: a new slice is an instance; a LUT slot taken twice refused', () => {
  const nl = counter();
  const p = mountPrep({ nl, ucf: null });
  const s = mountSlices({ cells: p.cells, ci: p.ci, driverCell: p.driverCell, isLut: p.isLut, loadsOf: p.loadsOf, nets: p.nets });
  const a = s.newSlice(), b = s.newSlice();
  assert.deepEqual([a.idx, b.idx, s.insts.length], [0, 1, 2]);
  assert.equal(a.kind, 'slice');
  const lut = s.lutOf(p.cells.find(c => c.type === 'LUT4'));
  s.placeLut(a, 'F', lut, lut.cell);
  assert.deepEqual(s.where.get(lut.cell), { inst: 0, bel: 'F' });
  assert.throws(() => s.placeLut(a, 'F', lut, -1), e => e instanceof PackError && e.message === 'pack: LUT F of a slice used twice');
});

test('#405 packer parts, through pack: slices, a carry chain, pads, a clock buffer, every cell somewhere', () => {
  const nl = counter();
  const r = pack(nl);
  assert.ok(r.stats.slices > 0 && r.stats.carry > 0);
  assert.equal(r.stats.bufgs, 1);
  assert.equal(r.stats.iobs, nl.ports.reduce((a, p) => a + p.bits.length, 0));
  assert.ok(r.macros.some(m => m.kind === 'carry'));
  assert.ok(r.cellSites.every(s => s !== null));
  assert.ok(r.insts.every(i => typeof i.cfg === 'string' || Array.isArray(i.cfg)));
  assert.deepEqual(r.warnings, []);
});
