// The parts of the placer (#405: out of place in packages/silinx-fpga/src/fpga/place.js): the pads (place-pads.js) and the slices
// (place-slices.js) mounted alone on a packed counter and the test device: the LOC'd I/Os on their pads, the free
// pads the others may take, two ports on one pad refused; every slice on a slice site of its own, the occupancy
// kept, too many slices refused. The DCMs, I/O pads, clock buffers, block RAMs and multipliers and the moves
// (place-dcms.js, place-iobs.js, place-bufgs.js, place-hard.js, place-moves.js) through place: a legal placement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXdlrc } from '../src/xdl.js';
import { readYosysJson } from '../src/fpga/netlist.js';
import { pack } from '../src/fpga/pack.js';
import { deviceSites, place, rng, PlaceError } from '../src/fpga/place.js';
import { mountPads } from '../src/fpga/place-pads.js';
import { mountSlices } from '../src/fpga/place-slices.js';
import { mountDcms } from '../src/fpga/place-dcms.js';
import { mountIobs } from '../src/fpga/place-iobs.js';
import { mountBufgs } from '../src/fpga/place-bufgs.js';
import { mountHard } from '../src/fpga/place-hard.js';
import { mountMoves } from '../src/fpga/place-moves.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fpga');
const dev = deviceSites(parseXdlrc(fs.readFileSync(path.join(FIX, 'place-device.xdlrc'), 'utf8')));
const UCF = 'NET "clk" LOC = "P3";\nNET "q<0>" LOC = "P10";\nNET "rst" LOC = "P5";';
const counter = (ucf = UCF) => pack(readYosysJson(fs.readFileSync(path.join(FIX, 'counter.json'), 'utf8')), { ucf });
// the I/O objects as place makes them
const iobObjs = packed => packed.insts.flatMap((inst, i) => (inst.kind === 'iob' ? [{ kind: 'iob', inst: i, fixed: !!inst.loc, dir: inst.dir }] : []));
const pads = (packed, objs = iobObjs(packed)) => {
  const sites = new Array(packed.insts.length).fill(null);
  return { sites, objs, ...mountPads({ bufgSites: null, clockSites: null, dev, packed, N: packed.insts.length, objs, sites }) };
};

test('#405 placer parts: the mounts are the modules\'', () => {
  for (const f of [mountPads, mountSlices, mountDcms, mountIobs, mountBufgs, mountHard, mountMoves]) assert.equal(typeof f, 'function');
});

test('#405 placer parts, the pads: the LOC\'d I/Os on their pads, the others\' free pads; two ports on one pad refused', () => {
  const packed = counter();
  const p = pads(packed);
  const at = name => p.sites[packed.insts.findIndex(i => i.name === name)]?.name;
  assert.deepEqual([at('clk'), at('q<0>'), at('rst')], ['P3', 'P10', 'P5']);
  assert.deepEqual([...p.padUsed.keys()].sort(), ['P10', 'P3', 'P5']);
  // the free pads: every bonded pad but those, the input-only ones for inputs only
  const ins = p.freePads('in', null), outs = p.freePads('out', null);
  assert.equal(ins.length, dev.pads.size - 3);
  assert.ok(ins.every(q => !['P3', 'P10', 'P5'].includes(q.name)));
  assert.ok(outs.length < ins.length && outs.every(q => !q.inputOnly));
  // no global buffer reach without the device's dedicated paths: every buffer serves
  assert.equal(p.clockReachOf('BUFGMUX_X2Y11'), null);
  assert.throws(() => pads(counter('NET "clk" LOC = "P3";\nNET "rst" LOC = "P3";')), e => e instanceof PlaceError && e.message === 'place: two ports on pad P3');
});

test('#405 placer parts, the slices: each on a slice site of its own, the occupancy kept; too many refused', () => {
  const packed = counter(), N = packed.insts.length;
  // (the other instances on sites of their own kind already, as the parts before put them)
  const sites = packed.insts.map((inst, i) => (inst.kind === 'slice' ? null : inst.kind === 'bufg' ? dev.bufgmux[0] : [...dev.pads.values()][i]));
  const objs = [];
  for (const m of packed.macros) objs.push({ id: objs.length, kind: 'macro', members: m.members.map(x => ({ inst: x.inst, dx: x.dx, dy: x.dy })), align: m.align || [1, 1] });
  const inMacro = new Set(packed.macros.flatMap(m => m.members.map(x => x.inst)));
  packed.insts.forEach((inst, i) => { if (inst.kind === 'slice' && !inMacro.has(i)) objs.push({ id: objs.length, kind: 'macro', members: [{ inst: i, dx: 0, dy: 0 }], align: [1, 1] }); });
  const s = mountSlices({ dev, packed, start: null, N, allowedOf: new Array(N).fill(null), objs, random: rng(1), sites });
  const slices = packed.insts.flatMap((inst, i) => (inst.kind === 'slice' ? [i] : []));
  assert.ok(slices.length > 1);
  assert.equal(new Set(slices.map(i => sites[i].name)).size, slices.length);
  for (const i of slices) {
    assert.match(sites[i].name, /^SLICE_X\d+Y\d+$/);
    assert.equal(s.occ[s.gidx(sites[i].x, sites[i].y)], i);
    assert.deepEqual([s.posX[i], s.posY[i]], [sites[i].px, sites[i].py]);
  }
  assert.deepEqual(s.posPairs().length, N);
  const many = [...objs, { id: objs.length, kind: 'macro', members: Array.from({ length: dev.slices.size }, (_, k) => ({ inst: 0, dx: 0, dy: k })), align: [1, 1] }];
  assert.throws(() => mountSlices({ dev, packed, start: null, N, allowedOf: new Array(N).fill(null), objs: many, random: rng(1), sites: [...sites] }), e => e instanceof PlaceError && /^place: \d+ slices needed, the device has 140$/.test(e.message));
});

test('#405 placer parts, through place: every instance placed, the LOCs kept, the moves lowering the cost', () => {
  const packed = counter();
  const r = place(packed, dev, { seed: 3 });
  assert.equal(r.sites.length, packed.insts.length);
  assert.equal(new Set(r.sites.map(s => s.site)).size, r.sites.length);
  assert.equal(r.sites[packed.insts.findIndex(i => i.name === 'clk')].site, 'P3');
  assert.ok(r.stats.moves > 0 && r.cost < r.stats.initialCost);
  assert.deepEqual(r.warnings, []);
});
