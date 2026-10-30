// packages/silinx-fpga/research/s6 stage S6-D (#726), without ISE: gen-pipprobe6.mjs's designs (one PIP per INT tile, on a net of the
// tile's TIEOFF) and ana-pipprobe6.mjs's analysis (a tile's bits, a PIP's bits the same in every tile).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { intTiles, probePips, probeXdl, probePins } from '../packages/silinx-fpga/research/s6/gen-pipprobe6.mjs';
import { intRegion, regionBits, pipBits } from '../packages/silinx-fpga/research/s6/ana-pipprobe6.mjs';
import { S6_DEVICES, emptyFdri, FRAME_WORDS } from '../packages/silinx-fpga/src/fpga/s6/bitstream.js';
import { s6Device } from './s6-lib.mjs';

const { device, sites } = s6Device('xc6slx16csg324-3');

test('gen-pipprobe6: the INT tiles next to a CLB, a PIP each in turn, the designs\' XDL', () => {
  const tiles = intTiles(device);
  assert.equal(tiles.length, 1083);
  assert.ok(tiles.every(k => device.tileType(k) === 'INT'));
  const pips = probePips(device, tiles.slice(0, 3), 100);
  assert.deepEqual(Object.values(pips).map(p => p.to).length, 3);
  const k = tiles[1], p = device.pip(k, 101);
  assert.deepEqual(pips[device.tileNames[k]], { from: p.from, dir: p.dir, to: p.to });
  const one = { INT_X17Y15: { from: 'EE2E3', dir: '->', to: 'LOGICIN_B31' } };
  assert.equal(probeXdl('p', one), 'design "pips" p v3.2 ,\n  cfg "";\nnet "probe" , \n  pip INT_X17Y15 EE2E3 -> LOGICIN_B31 ,\n  ;\n');
  const pins = probePins(device, [device.tile('INT_X17Y15')]);
  assert.deepEqual(pins, { INT_X17Y15: { tieoff: 'TIEOFF_X31Y30', slice: 'SLICE_X28Y15', type: 'SLICEL', tile: 'CLEXL_X17Y15' } });
  assert.equal(probeXdl('p', one, { pins, inpin: false }), 'design "pips" p v3.2 ,\n  cfg "";\n'
    + 'inst "t_INT_X17Y15" "TIEOFF",placed INT_X17Y15 TIEOFF_X31Y30  ,\n  cfg "" ;\n'
    + 'net "probe0" , \n  outpin "t_INT_X17Y15" HARD1 ,\n  pip INT_X17Y15 EE2E3 -> LOGICIN_B31 ,\n  ;\n');
  assert.match(probeXdl('p', one, { pins, withPips: false }), /inpin "s_INT_X17Y15" A1 ,\n {2};\n$/);
});

test('ana-pipprobe6: an INT tile\'s region, its bits; a PIP\'s bits checked between tiles', () => {
  const dev = S6_DEVICES.xc6slx16, bases = JSON.parse(fs.readFileSync(new URL('../packages/silinx-fpga/bitdb/s6/xc6slx16-lut.json', import.meta.url), 'utf8')).slices;
  assert.deepEqual(intRegion(sites, bases, dev, 'INT_X17Y15'), [511, 0]);
  assert.equal(intRegion(sites, bases, dev, 'INT_X99Y0'), null);
  const empty = emptyFdri(dev), fdri = Uint16Array.from(empty), set = (f, b) => { fdri[f * FRAME_WORDS + (b >> 4)] |= 0x8000 >> (b & 15); };
  set(511 + 6, 61); set(511 + 21, 3); set(511 + 2, 64);
  assert.deepEqual(regionBits(fdri, empty, [511, 0]), [[6, 61]]);
  const r = pipBits([{ pips: { A: 'a -> b', B: 'c -> d' }, bits: { A: [[6, 61]], B: [] } }, { pips: { C: 'a -> b', D: 'c -> d' }, bits: { C: [[6, 61]], D: [[1, 2]] } }]);
  assert.deepEqual(r.pips, { 'a -> b': [[6, 61]], 'c -> d': [] });
  assert.deepEqual(r.tiles, { 'a -> b': 2, 'c -> d': 1 });
  assert.deepEqual(r.problems, ['c -> d: [] and [[1,2]] (D)']);
});

test('gen-pipcover6: a target PIP either way, a path to it from a driver; ana: its tile\'s bits less the paths\'', async () => {
  const { findTarget, findPath, coverDesign } = await import('../packages/silinx-fpga/research/s6/gen-pipcover6.mjs');
  const { coverBits } = await import('../packages/silinx-fpga/research/s6/ana-pipprobe6.mjs');
  const k = device.tile('INT_X12Y34');
  assert.deepEqual(findTarget(device, k, 'SR1E1', 'SR1B2'), { i: device.findPip(k, 'SR1E1', 'SR1B2'), from: 'SR1E1', to: 'SR1B2', text: 'SR1E1 -> SR1B2' });
  // a bidirectional PIP the other way
  assert.equal(findTarget(device, k, 'LOGICIN_B51', 'GFAN1').text, 'GFAN1 =- LOGICIN_B51');
  assert.equal(findTarget(device, k, 'SR1B2', 'SR1E1'), null);
  // SR1E1 is the single SR1B1 of the tile above: a slice output there drives it
  const n = device.node(k, 'SR1E1'), up = device.tile('INT_X12Y35');
  const src = { inst: 's', pin: 'A', node: device.sitePinNode('SLICE_X18Y35', 'A') };
  const p = findPath(device, [src], n, { near: kk => [k, up, device.tile('CLEXM_X12Y35'), device.tile('CLEXL_X12Y35')].includes(kk), used: new Set() });
  assert.ok(p && p.pips.length >= 2 && device.pipNodes(p.pips.at(-1).k, p.pips.at(-1).i)[1] === n);
  const { key, missed } = coverDesign(device, 'xc6slx16csg324-3', ['SR1E1 -> SR1B2', 'LOGICIN_B51 -> GFAN1']);
  assert.deepEqual(missed, []);
  assert.deepEqual(Object.values(key).map(x => x.pip), ['SR1E1 -> SR1B2', 'GFAN1 =- LOGICIN_B51']);
  // the target tile's bits less every path's PIPs in it (known bits), the unknown ones reported
  const r = coverBits({ T: { pip: 'a -> b', signal: 'a -> b', path: ['T x -> a', 'U y -> z'] }, V: { pip: 'c -> d', signal: 'c -> d', path: ['T q -> r'] } },
    { T: [[1, 1], [2, 2], [3, 3]], V: [[4, 4]] }, { 'x -> a': [[1, 1]] });
  assert.deepEqual(r['a -> b'], { pip: 'a -> b', tile: 'T', bits: [[2, 2], [3, 3]], unknown: ['T q -> r'] });
  assert.deepEqual(r['c -> d'].bits, [[4, 4]]);
});

test('check-pips6: a bidirectional PIP\'s direction from its net; the bits by direction', async () => {
  const { pipDirections, pipLookup } = await import('../packages/silinx-fpga/research/s6/check-pips6.mjs');
  const design = { insts: [{ name: 't', site: 'TIEOFF_X31Y30' }] };
  const net = { outpins: [{ inst: 't', pin: 'HARD1' }], pips: [
    { tile: 'INT_X17Y15', from: 'GFAN1', dir: '=-', to: 'LOGICIN_B51' }, { tile: 'INT_X17Y15', from: 'VCC_WIRE', dir: '->', to: 'LOGICIN_B51' }] };
  assert.deepEqual(pipDirections(device, net, design), [['LOGICIN_B51', 'GFAN1'], ['VCC_WIRE', 'LOGICIN_B51']]);
  const db = { pips: { 'GFAN1 =- LOGICIN_B51': [[18, 25]], 'a -> b': [[1, 1]] }, cover: { 'LOGICIN_B51 -> GFAN1': [[20, 48]] } };
  assert.deepEqual(pipLookup(db, 'GFAN1', '=-', 'LOGICIN_B51'), [[18, 25]]);
  assert.deepEqual(pipLookup(db, 'LOGICIN_B51', '=-', 'GFAN1'), [[20, 48]]);
  assert.deepEqual(pipLookup(db, 'a', '->', 'b'), [[1, 1]]);
  assert.equal(pipLookup(db, 'x', '->', 'y'), undefined);
  // the measured INT switch box: the continuations measured on paths, the bidirectional PIPs both ways
  const read = n => JSON.parse(fs.readFileSync(new URL(`../packages/silinx-fpga/bitdb/s6/xc6slx16-${n}.json`, import.meta.url), 'utf8')).pips;
  const int = read('int'), cover = read('int-cover');
  assert.ok(Object.keys(int).length >= 3449);
  assert.deepEqual(cover['SR1E1 -> SR1B2'], [[8, 32], [8, 33]]);
  assert.deepEqual(cover['LOGICIN_B51 -> GFAN1'], [[20, 48], [20, 55]]);
  assert.deepEqual(cover['GFAN1 -> LOGICIN_B51'], int['GFAN1 =- LOGICIN_B51']);
});

test('the other INT-like tiles: their regions by the columns\' rule, their own PIPs, an I/O tile\'s renamed wires', async () => {
  const { otherIntTiles, tilePips, tieoffs } = await import('../packages/silinx-fpga/research/s6/gen-pipprobe6.mjs');
  const { tileRegion, intRegion: region } = await import('../packages/silinx-fpga/research/s6/ana-pipprobe6.mjs');
  const { pipLookup } = await import('../packages/silinx-fpga/research/s6/check-pips6.mjs');
  const dev = S6_DEVICES.xc6slx16, bases = JSON.parse(fs.readFileSync(new URL('../packages/silinx-fpga/bitdb/s6/xc6slx16-lut.json', import.meta.url), 'utf8')).slices;
  // the rule gives the INT tiles' regions found from their CLBs' slices
  for (const k of intTiles(device).filter((_, i) => i % 50 === 0)) assert.deepEqual(tileRegion(dev, device.tileNames[k]), region(sites, bases, dev, device.tileNames[k]));
  assert.deepEqual(tileRegion(dev, 'INT_BRAM_X3Y20'), [744 + 4 + 30 + 30 + 31, 11 * 64 + 16]);
  const others = otherIntTiles(device);
  assert.equal(others.length, 1271 + 120 + 102 + 69 + 28 + 8 + 2 - 1083);
  assert.ok(others.every(k => /^(INT|INT_BRK|INT_BRAM|INT_BRAM_BRK|IOI_INT|LIOI_INT|INT_GCLK)$/.test(device.tileType(k))));
  const k0 = device.tile('INT_X17Y15'), intSet = new Set();
  for (let i = 0; i < device.templates[device.tileTemplate[k0]].from.length; i++) { const x = device.pip(k0, i); intSet.add(`${x.from} ${x.dir} ${x.to}`); }
  const brk = others.find(k => device.tileType(k) === 'INT_BRK'), { shared, own } = tilePips(device, brk, intSet);
  assert.equal(own.length, 64);
  assert.ok(own.every(p => /_BRK$/.test(p.from)) && shared.length > 3000);
  assert.equal(Object.keys(tieoffs(device, [brk])).length, 1);
  // the measured own PIPs; an I/O tile's INT_IOI_ wires take the INT switch box's bits
  const read = n => JSON.parse(fs.readFileSync(new URL(`../packages/silinx-fpga/bitdb/s6/xc6slx16-${n}.json`, import.meta.url), 'utf8')).pips;
  const db = { pips: read('int'), cover: read('int-cover'), own: read('int-own') };
  assert.deepEqual(pipLookup(db, 'GCLK0', '->', 'INT_IOI_GFAN0'), [[20, 61], [20, 62], [20, 63]]);
  assert.deepEqual(pipLookup(db, 'EE2E1', '->', 'INT_IOI_LOGICIN_B4'), db.pips['EE2E1 -> LOGICIN_B4']);
  assert.ok(Object.keys(db.own).some(p => /GCLK\d+_BRK -> CLK0/.test(p)));
});

test('gen-pipdrop6 / ana-pipdrop6: the other tiles\' PIPs dropped (all or a quarter), the changed bits by tile, peeled', async () => {
  const { dropPips, KEPT } = await import('../packages/silinx-fpga/research/s6/gen-pipdrop6.mjs');
  const { diffBits, bitsByTile, peel, gridRegion } = await import('../packages/silinx-fpga/research/s6/ana-pipdrop6.mjs');
  const xdl = 'net "n" , \n  outpin "a" A ,\n  pip INT_X1Y2 A -> B ,\n  pip RIOI_X24Y3 C -> D ,\n  pip RIOI_X24Y3 E -> F ,\n  pip CLKC_X15Y31 G =- H ,\n  ;\n';
  assert.ok(KEPT.test('CLEXM_X2Y3') && !KEPT.test('RIOI_X24Y3'));
  const all = dropPips(xdl);
  assert.deepEqual(all.dropped, [{ tile: 'RIOI_X24Y3', pip: 'C -> D' }, { tile: 'RIOI_X24Y3', pip: 'E -> F' }, { tile: 'CLKC_X15Y31', pip: 'G =- H' }]);
  assert.equal(all.xdl, 'net "n" , \n  outpin "a" A ,\n  pip INT_X1Y2 A -> B ,\n  ;\n');
  // a quarter: the second PIP of each tile's list (place 1 of 4)
  assert.deepEqual(dropPips(xdl, [1, 4]).dropped, [{ tile: 'RIOI_X24Y3', pip: 'E -> F' }]);
  // the bits two designs differ in
  const a = new Uint16Array(130), b = Uint16Array.from(a);
  a[0] = 0x8001; a[66] = 0x4000;
  assert.deepEqual(diffBits(a, b), [[0, 0], [0, 15], [1, 17]]);
  // a bit to the tile whose region holds it, else the nearest, else none
  const r = bitsByTile([[10, 100], [12, 70], [40, 0], [5000, 5]], { T: [8, 64, 4, 64], U: [30, 0, 20, 64] });
  assert.deepEqual(Object.fromEntries(Object.entries(r.out).map(([k, v]) => [k, [...v]])), { T: ['2,36', '4,6'], U: ['10,0'] });
  assert.deepEqual(r.unplaced, [[5000, 5]]);
  // peeling: an empty unit gives its PIPs none, a unit with one open PIP gives it its bits less the known
  const p = peel([{ tile: 'a', keys: ['T x', 'T y'], bits: new Set() }, { tile: 'b', keys: ['T x', 'T z'], bits: new Set(['1,1']) },
    { tile: 'c', keys: ['T z', 'T w'], bits: new Set(['1,1', '2,2']) }, { tile: 'd', keys: ['T w'], bits: new Set(['3,3']) }]);
  assert.deepEqual(p.pips, { 'T x': [], 'T y': [], 'T z': ['1,1'], 'T w': ['2,2'] });
  assert.deepEqual(p.problems, ['d: 3,3 vs its PIPs\' 2,2']);
  // the device's grid: an INT tile as tileRegion, the centre's clock column FAR column 0, a clock row's 16 bits
  const dev = S6_DEVICES.xc6slx16;
  assert.deepEqual(gridRegion(device, dev, 'INT_X17Y15').slice(0, 2), [511, 0]);
  assert.deepEqual(gridRegion(device, dev, 'REG_V_HCLK_X29Y45'), [1488, 512, 4, 16]);
  assert.deepEqual(gridRegion(device, dev, 'HCLK_CLB_XL_INT_X1Y55'), [2266, 512, 30, 16]);
});

test('residual6: a design\'s bits predicted from every database (slices, INT-like PIPs, the other tiles\' PIPs)', async () => {
  const { predictDesign, typesAt } = await import('../packages/silinx-fpga/research/s6/residual6.mjs');
  const { loadDb } = await import('../packages/silinx-fpga/research/s6/check-slice6.mjs');
  const { parseXdl } = await import('../packages/silinx-fpga/src/xdl.js');
  const read = n => JSON.parse(fs.readFileSync(new URL(`../packages/silinx-fpga/bitdb/s6/${n}.json`, import.meta.url), 'utf8'));
  const db = { part: 'xc6slx16csg324-3', slices: loadDb('xc6slx16'), int: { pips: read('xc6slx16-int').pips, cover: read('xc6slx16-int-cover').pips, own: read('xc6slx16-int-own').pips }, other: read('s6-pips-other') };
  const design = parseXdl(`design "t" xc6slx16csg324-3 v3.2 , cfg "";
inst "t" "TIEOFF",placed INT_X17Y15 TIEOFF_X31Y30 , cfg "" ;
inst "s" "SLICEL",placed CLEXL_X17Y15 SLICE_X28Y15 , cfg " A6LUT:s.A:#LUT:O6=A1 " ;
net "n" , outpin "t" HARD1 , pip INT_X17Y15 VCC_WIRE -> GFAN1 , pip INT_X17Y15 GFAN1 =- LOGICIN_B51 , ;
net "m" , pip RIOI_X24Y3 NOT_A -> PIP , ;
`);
  const dev = S6_DEVICES.xc6slx16, { bits, unknown } = predictDesign(design, device, dev, db);
  // the LUT's 32 ones, the two PIPs (the bidirectional one from GFAN1, its direction from the net)
  const [c0, b0] = [511, 0], rel = p => p.map(([m, b]) => `${c0 + m},${b0 + b}`);
  for (const x of [...rel(db.int.pips['VCC_WIRE -> GFAN1']), ...rel(db.int.pips['GFAN1 =- LOGICIN_B51'])]) assert.ok(bits.has(x), x);
  assert.equal(bits.size, 32 + new Set([...rel(db.int.pips['VCC_WIRE -> GFAN1']), ...rel(db.int.pips['GFAN1 =- LOGICIN_B51'])]).size);
  assert.deepEqual([...unknown], [['RIOI NOT_A -> PIP', 1]]);
  // the tile types whose regions hold a bit
  const where = typesAt(device, dev);
  assert.equal(where(511 + 3, 5), 'CLEXL+INT');
});
