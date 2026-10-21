// The bit databases of the Spartan-3E devices (research/s3e-bitstream/db, stage F): the bitstream
// format of each device, the one loader (research/s3e-bitstream/db.mjs: shared tile types, the
// device's own files, the pads per package), and the committed files checked against the shipped
// device descriptions (core/fpga/devices/), without ISE.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { S3E_DEVICES, XC3S250E, bitFormat, writeBit, readBit, setBit, getBit, diffFrames } from '../core/fpga/bitstream.js';
import { makeDb, layoutFormat, bitgen, frameData, padsFromDevice, knownRouting, featureBits, tileOf, tileBase, pipFeatures, designFeatures } from '../core/fpga/bitgen.js';
import { parseXdl } from '../core/xdl.js';
import { loadDeviceCache } from '../core/fpga/device-node.js';
import { DB_DIR, splitPart, mergeTiles, hasBitDb, readDbFiles, dbPackages, loadDb, edges } from '../research/s3e-bitstream/db.mjs';
import { graphFromDevice } from '../research/s3e-bitstream/xdlrc-graph.mjs';
import { deviceExceptions, exceptionTables } from '../research/s3e-bitstream/pip-exceptions.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-s3e-devices-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// the boards' parts: device, package, slices, bonded pads, block RAMs (DS312)
const PARTS = {
  'xc3s100ecp132-4': { device: 'xc3s100e', pkg: 'cp132', slices: 960, pads: 83, brams: 4, settings: true, outs: 72 },
  'xc3s250ecp132-4': { device: 'xc3s250e', pkg: 'cp132', slices: 2448, pads: 92, brams: 12, settings: true, outs: 85 },
  'xc3s500efg320-4': { device: 'xc3s500e', pkg: 'fg320', slices: 4656, pads: 232, brams: 20, settings: true, outs: 176 },
  'xc3s1200efg320-4': { device: 'xc3s1200e', pkg: 'fg320', slices: 8672, pads: 250, brams: 28, settings: true, outs: 194 },
};
// the pad features of every I/O setting (stage F, per pad)
const PAD_IN = ['I:LVCMOS33', 'I:LVCMOS25', 'I:LVCMOS18', 'I:LVCMOS15', 'I:LVCMOS12', 'I:LVTTL', 'I:PULL:PULLUP', 'I:PULL:PULLDOWN', 'I:PULL:KEEPER'];
const PAD_OUT = ['O:LVCMOS33', 'O:LVTTL', 'O:LVCMOS25', 'O:PULL:PULLUP', 'O:PULL:PULLDOWN', 'O:PULL:KEEPER',
  ...['', 'LVTTL:', 'LVCMOS25:'].flatMap(s => [...['2', '4', '6', '8', ...(s === 'LVCMOS25:' ? [] : ['16'])].map(d => `O:${s}DRIVE:${d}`), `O:${s}SLEW:FAST`])];

test('bitstream formats: IDCODE, frame length and frames of each device (measured on empty designs)', () => {
  assert.deepEqual(Object.keys(S3E_DEVICES), ['xc3s100e', 'xc3s250e', 'xc3s500e', 'xc3s1200e']);
  assert.equal(S3E_DEVICES.xc3s250e, XC3S250E);
  assert.deepEqual([S3E_DEVICES.xc3s100e.idcode, S3E_DEVICES.xc3s100e.frameWords, S3E_DEVICES.xc3s100e.frames], [0x01c10093, 49, 369]);
  assert.deepEqual([S3E_DEVICES.xc3s500e.idcode, S3E_DEVICES.xc3s500e.frameWords, S3E_DEVICES.xc3s500e.frames], [0x01c22093, 97, 730]);
  assert.deepEqual([S3E_DEVICES.xc3s1200e.idcode, S3E_DEVICES.xc3s1200e.frameWords, S3E_DEVICES.xc3s1200e.frames], [0x01c2e093, 125, 959]);
  // a frame is 32 bits per word: two 80-bit I/O rows and 64 bits per CLB row (DS312: 22, 34, 46, 60 rows)
  for (const [d, rows] of [['xc3s100e', 22], ['xc3s250e', 34], ['xc3s500e', 46], ['xc3s1200e', 60]]) assert.equal(S3E_DEVICES[d].frameWords * 32, 160 + 64 * rows, d);
  assert.deepEqual(bitFormat('xc3s500efg320-4'), S3E_DEVICES.xc3s500e);
  assert.equal(bitFormat('xc3s500e', 'ft256').part, '3s500eft256');
  assert.equal(bitFormat('XC3S100E').part, '3s100ecp132');
  assert.equal(bitFormat('xc3s1600efg320-4'), null);
  assert.equal(bitFormat('xc6slx16'), null);
});

test('writeBit / readBit for each device: the header part, IDCODE, FLR and the frames', () => {
  for (const f of Object.values(S3E_DEVICES)) {
    const frames = new Uint32Array(f.frames * f.frameWords);
    setBit(frames, f.frameWords, f.frames - 2, 17);
    const r = readBit(writeBit({ frames, device: f, crc: false }));
    assert.equal(r.header.b, f.part);
    assert.deepEqual(r.packets.find(p => p.reg === 'IDCODE').words, [f.idcode]);
    assert.deepEqual(r.packets.find(p => p.reg === 'FLR').words, [f.frameWords - 1]);
    assert.equal(r.frameWords, f.frameWords);
    assert.equal(r.frames.frameWords, f.frameWords);
    // the frame length of the data itself is used to tell the bits apart
    assert.deepEqual(diffFrames(new Uint32Array(frames.length), r.frames), [{ frame: f.frames - 2, bit: 17, value: 1 }]);
    assert.throws(() => writeBit({ frames: new Uint32Array(10), device: f }), /frame data: 10 words/);
  }
});

test('layoutFormat: the bitstream format of a database from its layout', () => {
  assert.deepEqual(layoutFormat({ device: 'xc3s500e-4-fg320' }), S3E_DEVICES.xc3s500e);
  assert.equal(layoutFormat({ device: 'xc3s500e-4-ft256' }).part, '3s500eft256');
  assert.deepEqual(layoutFormat({ device: 'xc3s100e-4-cp132', idcode: '0x01c10093', frameWords: 49, frames: 369 }), S3E_DEVICES.xc3s100e);
  assert.deepEqual(layoutFormat(null), XC3S250E);
});

// a synthetic database of a small device: one CLB column, one row
const synth = device => ({
  layout: { device, cols: { 0: 3, 1: 24, 2: 43 }, rows: { 0: 80, 1: 16, 2: 0 }, defaults: [[5, 7]] },
  lut: { colFrame: { 0: 24, 1: 27 }, rowBit: { 0: 40, 1: 8 } },
  tiles: { types: { CENTER_SMALL: { features: { 'SLICE0:USED': ['1,2'], 'SLICE0:F:#LUT': [], 'SLICE0:G:#LUT': [], 'SLICE0:FXMUX:F': [], 'SLICE0:XUSED:0': [], 'SLICE0:GYMUX:G': [], 'SLICE0:YUSED:0': [] } } } },
});

test('bitgen writes the database device\'s format: a design for the XC3S100E', () => {
  const db = makeDb(synth('xc3s100e-4-cp132'));
  assert.equal(db.format.idcode, 0x01c10093);
  const design = `design "t" xc3s100ecp132-4 v3.2 , cfg "";
inst "s" "SLICEL",placed CLB_X1Y1 SLICE_X0Y0 , cfg " F:s_f:#LUT:D=A1 G:s_g:#LUT:D=A1 FXMUX::F XUSED::0 GYMUX::G YUSED::0 " ;
`;
  const { bytes, unknown } = bitgen(design, db, { name: 't.ncd', crc: false });
  assert.deepEqual(unknown, []);
  const r = readBit(bytes);
  assert.equal(r.header.b, '3s100ecp132');
  assert.equal(r.frames.length, 369 * 49);
  const fd = frameData(parseXdl(design), db);
  assert.equal(fd.frames.frameWords, 49);
  assert.deepEqual(diffFrames(fd.frames, r.frames), []);
  // the default bit, the slice's USED bit (frame 24 + 1, bit 16 + 2), LUT F of SLICE_X0Y0 at frame 24, bit 40
  const set = diffFrames(new Uint32Array(r.frames.length), r.frames);
  assert.ok(set.some(x => x.frame === 5 && x.bit === 7));
  assert.ok(set.some(x => x.frame === 25 && x.bit === 18));
  assert.ok(set.some(x => x.frame === 24 && x.bit >= 40 && x.bit < 56));
  // a part given by the caller (another package) is written in the header
  assert.equal(readBit(bitgen(design, db, { part: '3s100evq100' }).bytes).header.b, '3s100evq100');
});

test('db.mjs: parts, the shared tile types with a device\'s own over them, the pads per package', () => {
  assert.deepEqual(splitPart('xc3s500efg320-4'), { device: 'xc3s500e', pkg: 'fg320' });
  assert.deepEqual(splitPart('XC3S1200E'), { device: 'xc3s1200e', pkg: null });
  assert.deepEqual(splitPart('xc3s250e-cp132'), { device: 'xc3s250e-cp132', pkg: null });
  const shared = { source: 's', types: { A: { features: { f: ['1,1'], g: [] } }, B: { sameAs: 'A', features: {} } }, padDriveDefault: { LVCMOS15: '8' } };
  const own = { types: { A: { features: { g: ['2,2'] } }, C: { features: { h: [] } } }, padDriveDefault: { LVCMOS12: '6' } };
  const m = mergeTiles(shared, own);
  assert.deepEqual(m.types.A.features, { f: ['1,1'], g: ['2,2'] });
  assert.equal(m.types.B.sameAs, 'A');
  assert.deepEqual(m.types.C.features, { h: [] });
  assert.deepEqual(m.padDriveDefault, { LVCMOS15: '8', LVCMOS12: '6' });
  // the PIPs a type's tiles do not have (#74): the device's add to the shared ones
  const ma = mergeTiles({ types: { A: { features: {}, absent: ['X0', 'a->b'] } } }, { types: { A: { absent: ['c->d'], absentIn: [{ tiles: ['A_X1Y1'], absent: ['e'] }] }, B: { absent: ['f'] } } });
  assert.deepEqual(ma.types.A.absent, ['X0', 'a->b', 'c->d']);
  assert.deepEqual(ma.types.A.absentIn, [{ tiles: ['A_X1Y1'], absent: ['e'] }]);
  assert.deepEqual(ma.types.B.absent, ['f']);
  assert.deepEqual(shared.types.A.features.g, [], 'the shared table is not changed');
  assert.equal(mergeTiles(shared, null), shared);
  // a database folder of its own
  const dir = path.join(tmp, 'db');
  fs.mkdirSync(dir);
  const w = (f, o) => fs.writeFileSync(path.join(dir, f), JSON.stringify(o));
  const s = synth('xc3s500e-4-fg320');
  w('s3e-tiles.json', s.tiles);
  w('xc3s500e-layout.json', s.layout);
  w('xc3s500e-lut.json', { lutF: s.lut });
  assert.equal(hasBitDb('xc3s500e', { dir }), true);
  assert.equal(hasBitDb('xc3s500e', { pkg: 'fg320', dir }), false, 'no pads of the package yet');
  assert.equal(hasBitDb('xc3s100e', { dir }), false);
  assert.deepEqual(dbPackages('xc3s500e', dir), []);
  w('xc3s500e-fg320-pads.json', { padFeatures: { B8: { 'I:LVCMOS33': ['3,9'] } } });
  w('xc3s500e-tiles.json', { types: { CENTER_SMALL: { features: { 'SLICE1:USED': ['1,3'] } } } });
  assert.equal(hasBitDb('xc3s500e', { pkg: 'fg320', dir }), true);
  assert.deepEqual(dbPackages('xc3s500e', dir), ['fg320']);
  const f = readDbFiles('xc3s500e', { pkg: 'fg320', dir });
  assert.deepEqual(f.tiles.types.CENTER_SMALL.features['SLICE1:USED'], ['1,3']);
  assert.deepEqual(f.tiles.types.CENTER_SMALL.features['SLICE0:USED'], ['1,2']);
  assert.deepEqual(f.padFeatures, { B8: { 'I:LVCMOS33': ['3,9'] } });
  assert.equal(f.bram, null);
  // loadDb: without a description (graph: {} has no sites) the pads table is empty; the header's part is the package's
  const db = loadDb('xc3s500eft256-4', { dir, graph: { siteIndex: new Map() } });
  assert.equal(db.format.part, '3s500eft256');
  assert.equal(db.format.idcode, 0x01c22093);
  assert.deepEqual(db.padFeats, {}, 'no pads measured for the FT256');
  assert.throws(() => loadDb('xc3s1600efg320-4', { dir }), /no bit database for xc3s1600e/);
  assert.deepEqual(edges(s.layout), { maxX: 2, maxY: 2 });
});

test('graphFromDevice: the experiments\' graph from a shipped device description', () => {
  const d = loadDeviceCache('xc3s100ecp132-4');
  const g = graphFromDevice(d);
  assert.equal(g.tiles.length, d.tileCount);
  assert.equal(g.pipCount, d.pipCount);
  const t = g.tileByName.get('CLB_X9Y5');
  // a PIP of the tile, its wires and their nodes: a node is numbered by one of its wires' tile
  const i = g.pipsOf(t).find(k => g.names[g.pipB[k]] === 'OMUX0' && !g.rt[k]);
  assert.ok(i !== undefined);
  const n = g.node(t, g.names[g.pipB[i]]);
  assert.ok(g.members(n).some(([tt, w]) => tt === t && w === g.names[g.pipB[i]]));
  for (const [tt] of g.members(n)) assert.equal(g.node(tt, g.members(n).find(m => m[0] === tt)[1]), n);
  // a wire the tile does not have is a node of its own
  assert.notEqual(g.node(t, 'IOIS_X0'), n);
  const slice = g.tiles[t].sites.find(s => s.name === 'SLICE_X16Y8');
  assert.equal(slice.type, 'SLICEM');
  assert.equal(slice.pins.X.dir, 'output');
  assert.ok(g.tiles.some(x => x.sites.some(s => s.bonded === 'bonded')));
});

// the committed databases against the shipped device descriptions
for (const [part, want] of Object.entries(PARTS)) {
  test(`committed database of the ${want.device.toUpperCase()}: layout, LUTs, pads of the ${want.pkg.toUpperCase()}, block RAMs`, () => {
    assert.equal(hasBitDb(want.device, { pkg: want.pkg }), true);
    assert.deepEqual(dbPackages(want.device, DB_DIR), [want.pkg]);
    const dev = loadDeviceCache(part);
    const db = loadDb(part, { graph: dev });
    const f = S3E_DEVICES[want.device];
    assert.deepEqual([db.format.idcode, db.format.frameWords, db.format.frames, db.format.part], [f.idcode, f.frameWords, f.frames, f.part]);
    const L = db.layout;
    const { maxX, maxY } = edges(L);
    // every CLB tile column has a column of frames, every CLB row a row of bits; 19 frames per CLB column
    const clbs = dev.tileNames.filter(n => /^CLB_/.test(n)).map(n => /X(\d+)Y(\d+)/.exec(n).slice(1).map(Number));
    assert.equal(maxX, Math.max(...clbs.map(c => c[0])) + 1);
    assert.equal(maxY, Math.max(...clbs.map(c => c[1])) + 1);
    const starts = Object.values(L.cols).sort((a, b) => a - b);
    assert.equal(new Set(starts).size, starts.length, 'one column per frame');
    for (let i = 1; i < starts.length; i++) assert.ok([19, 21, 76].includes(starts[i] - starts[i - 1]) || starts[i] - starts[i - 1] > 19, `columns ${starts[i - 1]} ${starts[i]}`);
    assert.equal(L.rows[maxY], 0);
    assert.equal(L.rows[0], f.frameWords * 32 - 80);
    for (let y = 1; y < maxY; y++) assert.equal(L.rows[y], 80 + 64 * (maxY - 1 - y), `row ${y}`);
    // the LUTs of every slice
    const slices = dev.sites().filter(s => /^SLICE[LM]$/.test(s.type));
    assert.equal(slices.length, want.slices);
    const frames = new Set();
    for (const s of slices) {
      const [, x, y] = /X(\d+)Y(\d+)/.exec(s.name).map(Number);
      assert.ok(db.lut.colFrame[x] !== undefined && db.lut.rowBit[y] !== undefined, s.name);
      frames.add(`${db.lut.colFrame[x]},${db.lut.rowBit[y]}`);
    }
    assert.equal(frames.size, want.slices, 'every LUT has its own place');
    // the horizontal clock rows: one bit in the I/O rows each
    const gy = [...new Set(dev.tileNames.filter(n => /^GCLKH_X/.test(n)).map(n => +/Y(\d+)$/.exec(n)[1]))];
    assert.deepEqual(Object.keys(L.typeRows.GCLKH).map(Number).sort((a, b) => a - b), gy.sort((a, b) => a - b));
    for (const b of Object.values(L.typeRows.GCLKH)) assert.ok(b < 8 || b >= f.frameWords * 32 - 8);
    // the pads: every bonded pad of the package has its LVCMOS33 input (and output, but for the input-only pads)
    const pads = padsFromDevice(dev);
    assert.equal(Object.keys(pads).length, want.pads);
    for (const p of Object.keys(pads)) {
      assert.ok(db.padFeats[p]?.['I:LVCMOS33']?.length, `${p} I:LVCMOS33`);
      if (dev.site(p).type !== 'IBUF' && !/I$/.test(dev.site(p).type)) assert.ok(db.padFeats[p]?.['O:LVCMOS33']?.length, `${p} O:LVCMOS33`);
    }
    // the other I/O standards, drive, slew and pull of every pad (gen-iob.mjs --perpad / --perstd):
    // every input standard and pull; on the pads that can be outputs, LVCMOS33 / LVTTL / LVCMOS25 with
    // every drive, fast slew and every pull
    if (want.settings) {
      let outs = 0;
      for (const p of Object.keys(pads)) {
        const has = Object.keys(db.padFeats[p] || {});
        for (const f of PAD_IN) assert.ok(has.includes(f), `${p} ${f}`);
        if (!has.includes('O:LVCMOS33')) continue;
        outs++;
        for (const f of PAD_OUT) assert.ok(has.includes(f), `${p} ${f}`);
      }
      assert.equal(outs, want.outs, 'the pads that can be outputs');
    } else assert.ok(Object.values(db.padFeats).every(f => !f['O:LVTTL']), 'no other standards measured');
    // the pads' features hold bits ("frame,bit" or "!frame,bit") inside the frame data
    for (const [p, fs] of Object.entries(db.padFeats)) for (const [k, bits] of Object.entries(fs)) for (const b of bits) {
      const [fr, bit] = b.replace('!', '').split(',').map(Number);
      assert.ok(fr >= 0 && fr < f.frames && bit >= 0 && bit < f.frameWords * 32, `${p} ${k} ${b}`);
    }
    // the block RAMs: every memory bit, every block RAM
    assert.equal(Object.keys(db.bram.colFrame).length * Object.keys(db.bram.rowBit).length >= want.brams, true);
    assert.equal(db.bram.df.length, 18432);
    for (const s of dev.sites('RAMB16')) {
      const [, x, y] = /X(\d+)Y(\d+)/.exec(s.name).map(Number);
      assert.ok(db.bram.colFrame[x] !== undefined && db.bram.rowBit[y] !== undefined, s.name);
    }
  });
}

test('the tile types are shared: the XC3S250E\'s measurements serve the other devices', () => {
  const t = JSON.parse(fs.readFileSync(path.join(DB_DIR, 's3e-tiles.json'), 'utf8')).types;
  // the XC3S1200E's clock tiles are the others' (…_LL), the XC3S100E's DCM-less corners share the CLB switch box
  for (const [a, b] of [['CLKT_LL', 'CLKT'], ['CLKB_LL', 'CLKB'], ['CLKC_LL', 'CLKC'], ['DCMAUX_BL_CENTER', 'CENTER_SMALL'], ['DCMAUX_TL_CENTER', 'CENTER_SMALL']]) assert.equal(t[a].sameAs, b, a);
  // the horizontal clock rows of the I/O and block-RAM columns are GCLKH tiles: one bit by row (layout typeRows)
  for (const a of ['GCLKH_PCI_CE_N', 'GCLKH_PCI_CE_S', 'BRAMSITE2_UP_GCLKH', 'BRAM2_DN_GCLKH_FEEDTHRUA']) assert.equal(t[a].sameAs, 'GCLKH', a);
  for (const d of ['xc3s250e', 'xc3s500e', 'xc3s1200e']) {
    const L = readDbFiles(d).layout;
    for (const [y, b] of Object.entries(L.typeRows.GCLKH)) for (const a of ['GCLKH_PCI_CE_N', 'GCLKH_PCI_CE_S']) if (L.typeRows[a]?.[y] !== undefined) assert.equal(L.typeRows[a][y], b, `${d} ${a} ${y}`);
  }
  // the REV pin of a flip-flop: one bit per slice position (stage F)
  assert.deepEqual(['SLICE0', 'SLICE1', 'SLICE2', 'SLICE3'].map(s => t.CENTER_SMALL.features[`${s}:REVUSED:0`]), [['1,40'], ['1,8'], ['2,40'], ['2,8']]);
});

test('the XC3S1200E\'s own features: the long-line splitters of the centre row, used by the router (#23)', () => {
  const db = loadDb('xc3s1200efg320-4', { graph: { siteIndex: new Map() } });
  const t = tileOf('CLKH_LL_X7Y30', db);
  assert.equal(t.type, 'CLKH_LL');
  // one bit in the I/O row at the top (bits 1, 2) or at the bottom (bit FB - 3) of the tile's column
  assert.deepEqual(tileBase(t, db), { frame: db.layout.cols[7], bit: 0 });
  assert.deepEqual(featureBits(db.types.CLKH_LL, 'CLKH_LLT_LV6->CLKH_LLB_LV6'), ['15,1']);
  assert.deepEqual(featureBits(db.types.CLKH_LL, 'CLKH_LLB_LV1->CLKH_LLT_LV1'), ['18,1']);
  assert.deepEqual(featureBits(db.types.CLKH_LL, 'CLKH_LLT_LV1->CLKH_LLB_LV1'), [`18,${125 * 32 - 3}`]);
  assert.equal([...db.types.CLKH_LL.feats.keys()].length, 48);
  const k = knownRouting(db);
  assert.equal(k.allowPip('CLKH_LL_X7Y30', 'CLKH_LLT_LV6', 'CLKH_LLB_LV6'), true, 'the direction of "a =- b" from the device description (#23)');
  assert.equal(k.allowPip('CLKH_LL_X7Y30', 'CLKH_LLB_LV6', 'CLKH_LLT_LV6'), true);
  assert.equal(k.allowPip('CLB_X7Y30', 'OMUX0', 'E2BEG0'), k.allowPip('CLB_X7Y31', 'OMUX0', 'E2BEG0'));
  // the other devices have no such tiles: the shared file does not hold them
  assert.equal(JSON.parse(fs.readFileSync(path.join(DB_DIR, 's3e-tiles.json'), 'utf8')).types.CLKH_LL, undefined);
  // the upper horizontal clock rows of the XC3S1200E start one bit further than the others' (bits 1-3 are the splitters')
  assert.deepEqual(db.layout.typeRows.GCLKH, { 6: 125 * 32 - 1, 22: 125 * 32 - 2, 38: 3, 54: 4 });
  assert.deepEqual(readDbFiles('xc3s500e').layout.typeRows.GCLKH, { 7: 97 * 32 - 1, 15: 97 * 32 - 2, 31: 2, 39: 3 });
});

test('a long-line splitter in a routed design (#23): "a =- b" takes the direction away from the half of the line the net drives, from the device description', () => {
  const part = 'xc3s1200efg320-4', dev = loadDeviceCache(part), db = loadDb(part, { graph: dev });
  // the vertical long line LV6 of column 7: its top half driven by OMUX15 in CLB_X7Y54, its bottom
  // half in CLB_X7Y30; the splitter between them in CLKH_LL_X7Y30
  assert.equal(dev.node('CLB_X7Y54', 'LV6'), dev.node('CLKH_LL_X7Y30', 'CLKH_LLT_LV6'));
  assert.equal(dev.node('CLB_X7Y30', 'LV6'), dev.node('CLKH_LL_X7Y30', 'CLKH_LLB_LV6'));
  const xdl = (tile, sliceSite, sinkTile, sinkSite) => `design "t" xc3s1200efg320-4 v3.2 ,\n  cfg "";\n`
    + `inst "a" "SLICEL",placed ${tile} ${sliceSite}  ,\n  cfg " F:a_f:#LUT:D=A1 FXMUX::F XUSED::0 "\n  ;\n`
    + `inst "b" "SLICEL",placed ${sinkTile} ${sinkSite}  ,\n  cfg " F:b_f:#LUT:D=A1 FXMUX::F XUSED::0 "\n  ;\n`
    + `net "n" , \n  outpin "a" X ,\n  inpin "b" F1 ,\n  pip ${tile} X1 -> OMUX15 ,\n  pip ${tile} OMUX15 -> LV6 ,\n  pip CLKH_LL_X7Y30 CLKH_LLT_LV6 =- CLKH_LLB_LV6 ,\n  ;\n`;
  const down = parseXdl(xdl('CLB_X7Y54', 'SLICE_X13Y106', 'CLB_X7Y30', 'SLICE_X13Y58'));
  const up = parseXdl(xdl('CLB_X7Y30', 'SLICE_X13Y58', 'CLB_X7Y54', 'SLICE_X13Y106'));
  const siteOf = d => n => d.insts.find(i => i.name === n).site;
  assert.deepEqual(pipFeatures(down.nets[0], dev, siteOf(down)), ['X1->OMUX15', 'OMUX15->LV6', 'CLKH_LLT_LV6->CLKH_LLB_LV6']);
  assert.deepEqual(pipFeatures(up.nets[0], dev, siteOf(up)), ['X1->OMUX15', 'OMUX15->LV6', 'CLKH_LLB_LV6->CLKH_LLT_LV6']);
  // without the device description the net does not tell
  assert.equal(pipFeatures(down.nets[0])[2], 'CLKH_LLT_LV6=-CLKH_LLB_LV6');
  // bitgen: the splitter's bit of its direction (the top half to the bottom: frame 15 of the column, bit 1)
  const fd = d => designFeatures(d, db).feats.filter(f => f.tile === 'CLKH_LL_X7Y30').map(f => f.feature);
  assert.deepEqual(fd(down), ['CLKH_LLT_LV6->CLKH_LLB_LV6']);
  assert.deepEqual(fd(up), ['CLKH_LLB_LV6->CLKH_LLT_LV6']);
  const t = tileOf('CLKH_LL_X7Y30', db), base = tileBase(t, db);
  const fr = frameData(down, db), fu = frameData(up, db);
  assert.deepEqual(fr.unknown, []);
  assert.deepEqual(fu.unknown, []);
  const fw = fr.frames.frameWords;
  assert.deepEqual([getBit(fr.frames, fw, base.frame + 15, base.bit + 1), getBit(fu.frames, fw, base.frame + 15, base.bit + 1)], [1, 0]);
});

test('the XC3S1200E\'s other long-line splitters (#709): the centre column\'s and the I/O columns\', one bit each, not used by the router', () => {
  const db = loadDb('xc3s1200efg320-4', { graph: { siteIndex: new Map() } });
  const abs = (tile, f) => { const t = tileOf(tile, db), b = tileBase(t, db); return featureBits(db.types[t.type], f).map(s => s.split(',').map(Number)).map(([fr, bit]) => [b.frame + fr, b.bit + bit]); };
  // the centre column (CLKV_LL): the horizontal long lines joined across it, the bit in the clock column's frame 3, the
  // tile's own row; the I/O columns (CLKL_IOIS_LL / CLKR_IOIS_LL): the vertical ones across the centre row, the bit in
  // the I/O row at the top (bits 1-3) or at the bottom (FB - 4 …) of the frame, as CLKH_LL's
  assert.deepEqual(abs('CLKV_LL_X23Y20', 'CLKV_LLL_LH0->CLKV_LLR_LH0'), [[3, 2640 + 62]]);
  assert.deepEqual(abs('CLKV_LL_X23Y59', 'CLKV_LLL_LH0->CLKV_LLR_LH0'), [[3, 144 + 62]]);
  assert.deepEqual(abs('CLKL_IOIS_LL_X0Y30', 'CLKLH_LLB_LV0->CLKLH_LLT_LV0'), [[9, 2]]);
  assert.deepEqual(abs('CLKR_IOIS_LL_X47Y30', 'CLKRH_LLB_LV11->CLKRH_LLT_LV11'), [[758, 125 * 32 - 3]]);
  // (the splitters: the long lines' halves, LLL / LLR, LLB / LLT)
  const n = type => [...db.types[type].feats].filter(([f]) => /_LL[LRBT]_L[HV]\d+->/.test(f)).map(([, b]) => b);
  for (const [type, count] of [['CLKV_LL', 36], ['CLKL_IOIS_LL', 28], ['CLKR_IOIS_LL', 28]]) {
    assert.equal(n(type).length, count, type);
    assert.ok(n(type).every(b => b.length === 1), `${type}: one bit each`);
    assert.equal(new Set(n(type).map(b => b[0])).size, count, `${type}: no two of a bit`);
    assert.equal(db.types[type].noRoute, true, type);
  }
  const k = knownRouting(db);
  assert.equal(k.allowPip('CLKV_LL_X23Y20', 'CLKV_LLL_LH0', 'CLKV_LLR_LH0'), false, 'noRoute');
  // (only the type's own features: the centre column's clock switches, CLKV's that CLKV_LL shares, stay routable)
  assert.equal(k.allowPip('CLKV_LL_X23Y1', 'CLKV_OMUX15_OUTL3', 'CLKV_OUTL3'), true);
  // a bit stage F gave the side DCM's CLKFB switch was a splitter's (its codeword's, far away): none, as the other side DCMs'
  for (const type of ['DCM_H_TL_CENTER', 'DCM_H_TR_CENTER', 'DCM_H_BL_CENTER', 'DCM_H_BR_CENTER']) assert.deepEqual(featureBits(db.types[type], 'DCM_CLKFB->DCM_CLKFB_PINWIRE'), [], type);
});

test('the PIPs a tile type\'s features offer that its tiles do not have (#74): measured on ISE\'s device descriptions, refused to the router', () => {
  const t = JSON.parse(fs.readFileSync(path.join(DB_DIR, 's3e-tiles.json'), 'utf8')).types;
  // every tile of the type, on every device: [wires (every PIP into or out of it), PIPs]; the left and
  // right I/O tiles also lack GCLK0-7_BRK (their features have the clock-row tiles' GCLKk_BRK -> IOIS_CLKj: line 4's, #48,
  // the others', #671); the
  // tiles with the CLB's switch box but no SLICEM lack SHIFTOUT2 and SHIFTIN0 (the CLB's SHIFTOUT2 -> SHIFTIN0, #2)
  const counts = Object.fromEntries(Object.entries(t).filter(([, v]) => v.absent).map(([k, v]) => [k, [v.absent.filter(x => !x.includes('->')).length, v.absent.filter(x => x.includes('->')).length]]));
  const io = [102, 433], io4 = [110, 433], sb = [142, 218], cnr = [142, 250], bram = [142, 0], gclkh = [8, 0];
  assert.deepEqual(counts, {
    CENTER_SMALL_BRK: [8, 0], BIOIS: io, BIBUFS: io, LIOIS_PCI: io4, LIBUFS_PCI: io4, RIOIS: io4, RIBUFS_PCI: io4, RIOIS_PCI: [110, 436],
    RIBUFS_CLK_PCI: [106, 446], RIOIS_CLK_PCI: [106, 452], LIOIS_CLK_PCI: [106, 449], LIBUFS_CLK_PCI: [106, 449], RIBUFS: [110, 425], RIBUFS_BRK: [110, 425],
    TIBUFS: [102, 429], TIOIS: [102, 429], LIOIS: [110, 430], LIOIS_BRK: [110, 430], LIBUFS: [110, 422],
    BRAM0_SMALL: bram, BRAM1_SMALL: bram, BRAM2_SMALL: bram, BRAM3_SMALL: bram, BRAM3_SMALL_BRK: [150, 0],
    LL: cnr, LR: cnr, UL: cnr, UR: cnr,
    DCM_BL_CENTER: sb, DCM_BR_CENTER: sb, DCM_TL_CENTER: sb, DCM_TR_CENTER: sb, DCMAUX_BL_CENTER: [142, 219], DCMAUX_TL_CENTER: [142, 219],
    DCM_H_BL_CENTER: sb, DCM_H_BR_CENTER: sb, DCM_H_TL_CENTER: sb, DCM_H_TR_CENTER: sb,
    BRAMSITE2_UP_GCLKH: gclkh, BRAM2_UP_GCLKH_FEEDTHRU: gclkh, BRAM2_UP_GCLKH_FEEDTHRUA: gclkh, BRAMSITE2_DN_GCLKH: gclkh, BRAM2_DN_GCLKH_FEEDTHRU: gclkh, BRAM2_DN_GCLKH_FEEDTHRUA: gclkh,
  });
  // the clock-row CLBs share the CLB's features, but their clock lines are GCLKk_BRK
  assert.deepEqual(t.CENTER_SMALL_BRK.absent, ['GCLK0', 'GCLK1', 'GCLK2', 'GCLK3', 'GCLK4', 'GCLK5', 'GCLK6', 'GCLK7']);
  assert.equal(t.CENTER_SMALL.absent, undefined);
  // only some tiles of a type, per device: the CLBs with no FX_S2 / COUT_N (nothing above or below them),
  // the clock column's tiles without the clock row's OMUX outputs, the I/O tiles without IBUF0
  const rows = tiles => [...new Set(tiles.map(n => +/Y(\d+)$/.exec(n)[1]))].sort((a, b) => a - b);
  const own = Object.fromEntries(Object.keys(PARTS).map(p => [p, Object.fromEntries(Object.entries(readDbFiles(splitPart(p).device).tiles.types)
    .filter(([, v]) => v.absentIn).map(([k, v]) => [k, v.absentIn.map(g => [g.tiles.length, rows(g.tiles), g.absent.join(' ')])]))]));
  const outs = 'CLKV_OMUX10_OUTL0 CLKV_OMUX10_OUTR0 CLKV_OMUX11_OUTL1 CLKV_OMUX11_OUTR1 CLKV_OMUX12_OUTL2 CLKV_OMUX12_OUTR2 CLKV_OMUX15_OUTL3 CLKV_OMUX15_OUTR3 CLKV_OUTL0 CLKV_OUTL1 CLKV_OUTL2 CLKV_OUTL3 CLKV_OUTR0 CLKV_OUTR1 CLKV_OUTR2 CLKV_OUTR3';
  const span = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  // (and IBUF1: its pin wire's switch, I1_PINWIRE -> IOIS_IBUF1, measured at the top in the rebuild, #48, at the
  // bottom with the pads' paths to the DCMs, #92)
  const ibuf = (n, y) => [[n, [y], 'IOIS_IBUF0 IOIS_IBUF1']];
  // the side I/O tiles' pin wires to the clock pads' paths (#92): two PCI tiles of each side without them
  const side = (r, l) => ({ RIOIS_PCI: [[2, r, 'RIOIS_IBUF0 RIOIS_IBUF1']], LIOIS_PCI: [[2, l, 'LIOIS_IBUF0 LIOIS_IBUF1']] });
  assert.deepEqual(own['xc3s100ecp132-4'], {
    CENTER_SMALL: [[20, [1, 5, 21], 'FX_S2'], [9, [2, 18], 'COUT_N1 COUT_N3']], CLKV: [[20, span(2, 21), outs.split(' ').filter(w => /OUTR|OMUX\d+_OUTR/.test(w)).join(' ')]],
    TIOIS: ibuf(7, 23), TIBUFS: ibuf(5, 23), BIOIS: ibuf(7, 0), BIBUFS: ibuf(5, 0), ...side([9, 13], [10, 14]),
  });
  assert.deepEqual(own['xc3s250ecp132-4'], {
    CENTER_SMALL: [[16, [4, 30], 'COUT_N1 COUT_N3'], [34, [1, 5, 31], 'FX_S2']], CLKV: [[32, span(2, 33), outs]],
    TIOIS: ibuf(15, 35), TIBUFS: ibuf(7, 35), BIOIS: ibuf(15, 0), BIBUFS: ibuf(7, 0), ...side([15, 19], [16, 20]),
  });
  assert.deepEqual(own['xc3s500efg320-4'], {
    CENTER_SMALL: [[16, [2, 42], 'COUT_N1 COUT_N3'], [42, [1, 5, 45], 'FX_S2']], CLKV: [[44, span(2, 45), outs]],
    TIOIS: ibuf(21, 47), TIBUFS: ibuf(9, 47), BIOIS: ibuf(21, 0), BIBUFS: ibuf(9, 0), ...side([21, 25], [22, 26]),
  });
  assert.deepEqual(own['xc3s1200efg320-4'], {
    CENTER_SMALL: [[16, [26, 56], 'COUT_N1 COUT_N3'], [8, [1], 'COUT_N1 COUT_N3 FX_S2'], [54, [1, 5, 35, 60], 'FX_S2']], CLKV_LL: [[58, span(2, 59), outs]],
    TIOIS: ibuf(31, 61), TIBUFS: ibuf(11, 61), BIOIS: ibuf(31, 0), BIBUFS: ibuf(11, 0), ...side([28, 32], [29, 33]),
  });
  // (the XC3S100E's top clock tile: four pads' paths to its DCM, not eight)
  assert.deepEqual(readDbFiles('xc3s100e').tiles.types.CLKT.absent, ['CLKT_DLL_CLKPAD4', 'CLKT_DLL_CLKPAD5', 'CLKT_DLL_CLKPAD6', 'CLKT_DLL_CLKPAD7']);
  for (const [part, spec] of Object.entries(PARTS)) {
    const dev = loadDeviceCache(part);
    const db = loadDb(part, { graph: dev });
    // the database's lists are what pip-exceptions.mjs measures on the device description
    const ex = deviceExceptions(db, dev);
    const tables = exceptionTables({ [part]: ex });
    const files = readDbFiles(spec.device).tiles.types;
    const ownFile = JSON.parse(fs.readFileSync(path.join(DB_DIR, `${spec.device}-tiles.json`), 'utf8')).types;
    for (const [type, v] of Object.entries(files)) {
      if (!v.absent && !v.absentIn || !ex.types[type]) continue;   // (a type the device has no tile of)
      assert.deepEqual([...(tables.shared[type] || []), ...(tables.own[spec.device]?.[type]?.absent || [])].sort(), [...(v.absent || [])].sort(), `${part} ${type}`);
      assert.deepEqual(tables.own[spec.device]?.[type]?.absentIn, ownFile[type]?.absentIn, `${part} ${type}`);
    }
    // the router is refused none of the PIPs the device has (ISE's description), and the ones it lacks
    const k = knownRouting(db), all = knownRouting(db, { exceptions: false });
    let refused = 0;
    for (let tk = 0; tk < dev.tileCount; tk++) {
      const n = dev.templates[dev.tileTemplate[tk]].from.length;
      for (let i = 0; i < n; i++) { const [a, b] = dev.pipWires(tk, i); if (all.allowPip(dev.tileNames[tk], a, b) && !k.allowPip(dev.tileNames[tk], a, b)) refused++; }
    }
    assert.equal(refused, 0, part);
  }
  const k = knownRouting(loadDb('xc3s250ecp132-4'));
  for (const [tile, from, to, ok] of [
    ['CLB_X1Y25', 'GCLK0', 'CLK0', false], ['CLB_X1Y24', 'GCLK0', 'CLK0', true],   // the clock row (CENTER_SMALL_BRK)
    ['CLB_X3Y31', 'FX2', 'FX_S2', false], ['CLB_X3Y30', 'FX2', 'FX_S2', true], ['CLB_X10Y30', 'COUT2', 'COUT_N1', false], ['CLB_X10Y29', 'COUT2', 'COUT_N1', true],
    // refused by ISE in the first join tests (research/s3e-device)
    ['LIOIS_PCI_X0Y16', 'OMUX_W14', 'IOIS_STUB_F1_B3', false], ['LIOIS_PCI_X0Y19', 'OMUX_NW10', 'IOIS_STUB_F4_B0', false], ['RIOIS_X27Y12', 'OMUX_NE12', 'IOIS_STUB_F2_B3', false],
    // an I/O tile's own wire names (IOIS_F1_B0: the CLB's F1_B0)
    ['LIOIS_PCI_X0Y16', 'OMUX_W14', 'IOIS_F4_B1', true], ['LIOIS_PCI_X0Y16', 'OMUX_W14', 'IOIS_F1_B0', false],
  ]) assert.equal(k.allowPip(tile, from, to), ok, `${tile} ${from} -> ${to}`);
});
