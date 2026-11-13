// packages/silinx-fpga/src/fpga/s6/bitgen*.js and bitdb-node.js (#732): the Spartan-6's configuration bits of a design
// from the bit databases measured in research/s6 (bitdb/s6), moved into the toolchain as they were. The databases
// read for both parts, the regions of the frame data, a slice's and a pad's bits as their databases give them, a
// design's bits the union of its instances' and its PIPs', and what the databases do not know named; its .bit
// (bitstreamS6) with them and the block RAM's frame bitgen writes again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBitDbS6 } from '../src/fpga/s6/bitdb-node.js';
import { predictDesign, predictIob, padBit, bramRewrites, bitstreamS6, NO_BITS, knownPipS6 } from '../src/fpga/s6/bitgen.js';
import { kindModel, predictSlice, lutEntries, baseSettings } from '../src/fpga/s6/bitgen-slice.js';
import { tileRegion, gridRegion, columnOf } from '../src/fpga/s6/bitgen-regions.js';
import { pipLookup } from '../src/fpga/s6/bitgen-pips.js';
import { bitFormat6, emptyFdri, readBit6, FRAME_WORDS } from '../src/fpga/s6/bitstream.js';
import { s6Sites } from '../src/fpga/s6/sites.js';
import { loadDeviceCache } from '../src/fpga/device-node.js';

const PART = 'xc6slx16csg324-3', device = loadDeviceCache(PART), dev = bitFormat6('6slx16csg324');
const db = loadBitDbS6(PART);
const cfg = o => Object.entries(o).map(([attr, value]) => ({ attr, name: '', value }));

test('bitdb-node: both parts\' databases read, both parts\' CMT settings and inputs (#727\'s whole paths retired, #2025)', () => {
  for (const part of [PART, 'xc6slx45csg324-3']) {
    const d = loadBitDbS6(part);
    assert.deepEqual(Object.keys(d.slices.lut.kinds).sort(), ['L', 'M', 'X'], part);
    assert.ok(Object.keys(d.int.pips).length > 1000 && Object.keys(d.other.pips).length > 1000, part);
    assert.ok(Object.keys(d.iob.pads).length > 200, part);
    assert.deepEqual(Object.keys(d.hardBase.bases), ['RAMB16BWER', 'RAMB8BWER', 'DSP48A1'], part);
    assert.ok(d.hard.RAMB8BWER && d.clocks.regcFrame, part);
  }
  for (const part of [PART, 'xc6slx45csg324-3']) { const d = loadBitDbS6(part); assert.ok(d.cmtSettings && d.cmtInput && !('cmt' in d), part); }
  assert.equal(loadBitDbS6(PART, { cmtInput: false }).cmtInput, null);
});

test('bitgen-regions: a switch box\'s region by its name, any tile\'s by the grid (the same for a switch box), a frame\'s column', () => {
  const [c0, b0] = tileRegion(dev, 'INT_X4Y5');
  // the band of row 5 (rows 0 … 7 from 16 bits up the frame), its FAR column the fifth (an INT tile X is column X + 1)
  assert.equal(b0, (15 - 5) * 64 + 16);
  assert.equal(c0, dev.columns.slice(0, 5).reduce((a, n) => a + n, 0));
  assert.deepEqual(gridRegion(device, dev, 'INT_X4Y5').slice(0, 2), [c0, b0]);
  const [f, n] = columnOf(dev, c0 + 2);
  assert.deepEqual([f, n], [c0, dev.columns[5]]);
  // a row's last frames, past its columns (744 frames, 742 in columns on the XC6SLX16): in none
  assert.throws(() => columnOf(dev, dev.rowFrames - 1), /in no column/);
});

test('bitgen-slice: a slice\'s LUT entries from its equations, its bits as the base\'s with its LUT\'s; a setting not measured named', () => {
  // A6LUT = A1: entries with A1 set
  assert.deepEqual(lutEntries('A1', null).map((x, e) => x && e).filter(Boolean).slice(0, 3), [1, 3, 5]);
  // O5 = A2 below A6, O6 above
  const e = lutEntries('A1', 'A2');
  assert.deepEqual([e[2], e[1], e[33]], [1, 0, 1]);
  assert.ok(baseSettings({ full: true, kind: 'L' }).some(([el]) => el === 'CARRY4'));
  const m = kindModel(db.slices, 'L', 'CLEXL'), p = predictSlice(m, cfg({ A6LUT: '#LUT:O6=A1' }));
  assert.equal(p.ram, false);
  for (const x of m.lut.A.filter((_, k) => k & 1).map(([f, b]) => `${f},${b}`)) assert.ok(p.bits.has(x));
  assert.deepEqual(predictSlice(m, cfg({ AFFMUX: 'NOSUCH' })).unknown, ['AFFMUX=NOSUCH']);
});

test('bitgen: a pad\'s bits by its settings, a design\'s the union of its instances\' and PIPs\', the unknown named', () => {
  const site = Object.keys(db.iob.pads).sort()[0], pad = db.iob.pads[site];
  const out = predictIob(pad, cfg({ OUSED: '0', DRIVEATTRBOX: '12', SLEW: 'SLOW', OSTANDARD: 'LVCMOS25' }));
  assert.deepEqual(out.unknown, []);
  for (const x of pad.base) assert.ok(out.bits.has(x));
  assert.ok(out.bits.has(padBit(pad, -15)));
  assert.deepEqual(predictIob(pad, cfg({ OUSED: '0', OSTANDARD: 'NOSUCH' })).unknown, ['outNOSUCH']);
  // a slice and the pad, and a PIP of a switch box: the design's bits are the three's, with the I/O's globals
  const slice = [...s6Sites(device).slices.values()].find(s => s.kind === 'L');
  const pip = { tile: 'INT_X4Y5', from: 'LOGICOUT0', dir: '->', to: 'EE2B0' };
  const design = {
    insts: [{ name: 'p', type: 'IOB', site, placed: true, cfg: cfg({ OUSED: '0', DRIVEATTRBOX: '12', SLEW: 'SLOW', OSTANDARD: 'LVCMOS25' }) },
      { name: 's', type: 'SLICEL', site: slice.name, tile: slice.tile, placed: true, cfg: cfg({ A6LUT: '#LUT:O6=A1' }) }],
    nets: [{ name: 'n', outpins: [], inpins: [], pips: [pip] }],
  };
  const r = predictDesign(design, device, dev, db);
  for (const x of out.bits) assert.ok(r.bits.has(x));
  for (const x of db.iob.globals) assert.ok(r.bits.has(x));
  const [c0, b0] = tileRegion(dev, 'INT_X4Y5');
  for (const [m, b] of pipLookup(db.int, 'LOGICOUT0', '->', 'EE2B0')) assert.ok(r.bits.has(`${c0 + m},${b0 + b}`));
  assert.deepEqual([...r.unknown], []);
  // a PIP the databases do not have: named, no bits
  const u = predictDesign({ insts: [], nets: [{ name: 'n', outpins: [], inpins: [], pips: [{ tile: 'NOSUCH_X1Y1', from: 'A', dir: '->', to: 'B' }] }] }, device, dev, db);
  assert.deepEqual([u.bits.size, [...u.unknown]], [0, [['NOSUCH A -> B', 1]]]);
});

test('bitgen: the block RAM\'s frame written again (minor 23 of its column, two bits cleared, a pad frame), a RAMB16BWER\'s bits cleared in the frame data when it has no RAM_MODE, the unmeasured named', () => {
  const site = s6Sites(device).brams[0], ramb8 = { name: 'r', type: 'RAMB8BWER', site: site.r8[0], tile: site.tile, placed: true, cfg: [] };
  const fdri = emptyFdri(dev).slice().fill(0xffff), [f0, b0] = gridRegion(device, dev, site.tile), w = (b0 >> 4) - 12;
  const r = bramRewrites({ insts: [ramb8], nets: [] }, device, dev, fdri);
  assert.deepEqual(r.unknown, []);
  assert.equal(r.rewrites.length, 1);
  const x = r.rewrites[0], row = Math.floor(f0 / dev.rowFrames);
  assert.equal(x.far[1], 23);
  assert.equal(x.far[0] >> 8, row);
  assert.equal(x.words.length, 2 * FRAME_WORDS);
  assert.deepEqual([x.words[w], x.words[w + 15]], [0xfffd, 0xbfff]);
  assert.equal(x.words.filter(v => v === 0xffff).length, 2 * FRAME_WORDS - 2);
  assert.deepEqual(r.clears, []);
  // a RAMB16BWER with no RAM_MODE (Silinx's XDL, #2130): no frame written again, bit 0 of word w and bit 15 of word
  // w + 15 cleared in the frame data
  const ramb16 = { ...ramb8, type: 'RAMB16BWER', site: site.r16 };
  const r16 = bramRewrites({ insts: [ramb16], nets: [] }, device, dev, fdri);
  const [c0] = columnOf(dev, f0), main = (c0 + 23) * FRAME_WORDS;
  assert.deepEqual(r16, { rewrites: [], clears: [[main + w, 0x0001], [main + w + 15, 0x8000]], unknown: [] });
  // one with RAM_MODE::TDP (ISE's map's XDL, #2586: #728's r16a, r16b, r16clka on the XC6SLX16, r16ab, r16clka on the
  // XC6SLX45) keeps them: ISE's bitgen leaves both set; SP and SDP clear them through their settings' bits
  const tdp = { ...ramb16, cfg: cfg({ RAM_MODE: 'TDP' }) };
  assert.deepEqual(bramRewrites({ insts: [tdp], nets: [] }, device, dev, fdri), { rewrites: [], clears: [], unknown: [] });
  // every RAMB16BWER with no RAM_MODE has its own cleared, not only the first's
  const other = s6Sites(device).brams.find(b => gridRegion(device, dev, b.tile)[0] !== f0), [g0, d0] = gridRegion(device, dev, other.tile);
  const two = bramRewrites({ insts: [tdp, { ...ramb16, name: 's', site: other.r16, tile: other.tile }], nets: [] }, device, dev, fdri);
  const main2 = (columnOf(dev, g0)[0] + 23) * FRAME_WORDS, w2 = (d0 >> 4) - 12;
  assert.deepEqual(two.clears, [[main2 + w2, 0x0001], [main2 + w2 + 15, 0x8000]]);
  assert.deepEqual(bramRewrites({ insts: [], nets: [] }, device, dev, fdri), { rewrites: [], clears: [], unknown: [] });
});

// (#2679) two or more block RAMs, measured with ISE (research/s6/gen-brams6.mjs; gen-hard6.mjs's designs with every
// site of a type, up to 232 RAMB8BWERs on the XC6SLX45): one frame written again per column and row with a RAMB8BWER,
// in the frames' order, every RAMB8BWER's two bits cleared in it; none for the RAMB16BWERs, each one's bits cleared
// in the frame data
test('bitgen: several block RAMs, one frame written again per column and row with a RAMB8BWER, their bits cleared in it, none named as not measured (#2679)', () => {
  const brams = s6Sites(device).brams, fdri = emptyFdri(dev).slice().fill(0xffff);
  const at = b => { const [f0, b0] = gridRegion(device, dev, b.tile); return { main: (columnOf(dev, f0)[0] + 23) * FRAME_WORDS, w: (b0 >> 4) - 12 }; };
  const r8 = (b, k = 0) => ({ name: `r8_${b.r8[k]}`, type: 'RAMB8BWER', site: b.r8[k], tile: b.tile, placed: true, cfg: cfg({ RAM_MODE: 'TDP' }) });
  const r16 = b => ({ name: `r16_${b.r16}`, type: 'RAMB16BWER', site: b.r16, tile: b.tile, placed: true, cfg: [] });
  const cleared = x => [...x.words].flatMap((v, i) => (v !== 0xffff ? [[i, v]] : []));
  const [a, b] = brams, other = brams.find(x => at(x).main !== at(a).main);
  // both sites of a tile: one frame, its two bits cleared once
  const tile = bramRewrites({ insts: [r8(a, 0), r8(a, 1)], nets: [] }, device, dev, fdri);
  assert.deepEqual([tile.rewrites.length, tile.unknown, tile.clears], [1, [], []]);
  assert.deepEqual(cleared(tile.rewrites[0]), [[at(a).w, 0xfffd], [at(a).w + 15, 0xbfff]]);
  // two tiles of one column and row: one frame, both tiles' bits cleared
  assert.equal(at(b).main, at(a).main);
  const col = bramRewrites({ insts: [r8(b), r8(a)], nets: [] }, device, dev, fdri);
  assert.deepEqual([col.rewrites.length, col.unknown], [1, []]);
  assert.deepEqual(cleared(col.rewrites[0]), [a, b].flatMap(x => [[at(x).w, 0xfffd], [at(x).w + 15, 0xbfff]]).sort((x, y) => x[0] - y[0]));
  // two columns or rows: a frame each, in the frames' order whatever the instances' order
  const two = bramRewrites({ insts: [r8(other), r8(a)], nets: [] }, device, dev, fdri);
  assert.deepEqual(two.rewrites.map(x => x.far[1]), [23, 23]);
  assert.ok(two.rewrites[0].far[0] < two.rewrites[1].far[0]);
  assert.deepEqual(two.rewrites.map(x => cleared(x)[0][0]), [at(a), at(other)].sort((x, y) => x.main - y.main).map(x => x.w));
  // a RAMB16BWER beside a RAMB8BWER in its column and row: the RAMB8BWER's frame alone, the RAMB16BWER's bits cleared in
  // the frame data and in that frame too (ISE's mix-col, mix-3); one in another column: in the frame data only
  const mix = bramRewrites({ insts: [r8(a), r16(b), r16(other)], nets: [] }, device, dev, fdri);
  assert.deepEqual([mix.rewrites.length, mix.unknown], [1, []]);
  assert.deepEqual(cleared(mix.rewrites[0]), [[at(b).w, 0xfffe], [at(a).w, 0xfffd], [at(b).w + 15, 0x7fff], [at(a).w + 15, 0xbfff]].sort((x, y) => x[0] - y[0]));
  assert.deepEqual(mix.clears, [b, other].map(at).flatMap(({ main, w }) => [[main + w, 0x0001], [main + w + 15, 0x8000]]));
  // a RAMB8BWER on every site (gen-hard6.mjs's RAMB8BWER-base on the XC6SLX16): ISE's bitgen writes 8 frames again, at
  // these addresses (FAR_MAJ, minor 23)
  const all = bramRewrites({ insts: brams.flatMap(x => [r8(x, 0), r8(x, 1)]), nets: [] }, device, dev, fdri);
  assert.deepEqual(all.rewrites.map(x => x.far[0].toString(16)), ['4', '16', '104', '116', '204', '216', '304', '316']);
  assert.deepEqual(all.unknown, []);
});

test('bitgen: a design\'s .bit, its frame data the empty device\'s with the design\'s bits; a DCM named as not measured', () => {
  const slice = [...s6Sites(device).slices.values()].find(s => s.kind === 'L');
  const design = { insts: [{ name: 's', type: 'SLICEL', site: slice.name, tile: slice.tile, placed: true, cfg: cfg({ A6LUT: '#LUT:O6=A1' }) }], nets: [] };
  const { bytes, unknown } = bitstreamS6(design, device, db, { name: 'm.ncd;UserID=0xFFFFFFFF', date: '2026/10/29', time: '12:00:00', crc: true, startupClk: 'JtagClk' });
  assert.deepEqual([...unknown], []);
  const r = readBit6(bytes), empty = emptyFdri(dev), set = [];
  assert.deepEqual([r.header.a, r.header.b, r.header.c, r.crc, r.startupClk], ['m.ncd;UserID=0xFFFFFFFF', '6slx16csg324', '2026/10/29', true, 'JtagClk']);
  for (let w = 0; w < r.fdri.length; w++) { const x = r.fdri[w] ^ empty[w]; for (let i = 0; i < 16; i++) if ((x >> (15 - i)) & 1) set.push(`${Math.floor(w / FRAME_WORDS)},${(w % FRAME_WORDS) * 16 + i}`); }
  assert.deepEqual(set.sort(), [...predictDesign(design, device, dev, db).bits].sort());
  const dcm = bitstreamS6({ insts: [{ name: 'd', type: 'DCM', site: 'DCM_X0Y0', tile: 'CMT_DCM_BOT_X11Y8', placed: true, cfg: [] }], nets: [] }, device, db);
  assert.ok([...dcm.unknown.keys()].some(k => /^DCM DCM_X0Y0: a clock manager's bits not measured/.test(k)));
});

test('bitgen: the PIP families with no bits (a hard block\'s pins, an interface tile\'s LOGICOUT), the switches the router may take', () => {
  for (const k of ['MACCSITE2 P15_DSP48A1_SITE -> MACC_LOGICOUT10_INT1', 'MACCSITE2 MACC_LOGICINB14_INT0 -> C11_DSP48A1_SITE', 'BRAMSITE2 RAMB8BWER_1_DOPB0 -> BRAM_LOGICOUT3_INT2',
    'BRAMSITE2 BRAM_LOGICINB31_INT0 -> RAMB8BWER_1_ADDRA0', 'INT_INTERFACE INT_INTERFACE_LOGICOUT_8 -> INT_INTERFACE_LOGICOUT8']) assert.ok(NO_BITS.test(k), k);
  for (const k of ['INT_INTERFACE INT_INTERFACE_LOGICOUT_8 -> INT_INTERFACE_LOGICOUT9', 'INT EE2B0 -> NN2B1', 'CLKC CLKC_PLL_L0 -> CLKC_GCLK0']) assert.ok(!NO_BITS.test(k), k);
  // every measured one of those families has no bits indeed
  for (const [k, b] of Object.entries(db.other.pips)) if (NO_BITS.test(k)) assert.deepEqual(b, [], k);
  // a PIP of such a family the databases do not have: no bits, not unknown
  const r = predictDesign({ insts: [], nets: [{ name: 'n', outpins: [], inpins: [], pips: [{ tile: 'MACCSITE2_X18Y28', from: 'P47_DSP48A1_SITE', dir: '->', to: 'MACC_LOGICOUT99_INT1' }] }] }, device, dev, db);
  assert.deepEqual([r.bits.size, r.unknown.size], [0, 0]);
  // the router's switches: the measured ones and those families; not an unmeasured one of another tile
  const allow = knownPipS6(device, db), find = (tile, test) => { const k = device.tile(tile), tp = device.templates[device.tileTemplate[k]]; for (let i = 0; i < tp.from.length; i++) if (test(device.pip(k, i))) return [k, i]; return null; };
  const clexl = device.tileNames.find(n => /^CLEXL_/.test(n));
  assert.equal(allow(...find(clexl, () => true)), true);
  const intTile = device.tileNames.find(n => /^INT_X\d+Y\d+$/.test(n)), known = find(intTile, p => !!pipLookup(db.int, p.from, p.dir, p.to));
  assert.equal(allow(...known), true);
  const maccTile = device.tileNames.find(n => /^MACCSITE2_/.test(n)), out = find(maccTile, p => /_DSP48A1_SITE$/.test(p.from) && /^MACC_LOGICOUT/.test(p.to));
  assert.equal(allow(...out), true);
});

test('bitgen-slice: a flip-flop set as a gate, #AND2L / #OR2L in the XDL, by the variant measured as AND2L / OR2L (#2061)', () => {
  for (const kind of ['X', 'L', 'M']) {
    const m = kindModel(db.slices, kind, 'CLEXL');
    for (const v of ['AND2L', 'OR2L']) {
      const a = predictSlice(m, cfg({ BFF: `#${v}` })), b = predictSlice(m, cfg({ BFF: v }));
      assert.deepEqual(a.unknown, [], `${kind} ${v}`);
      assert.deepEqual([...a.bits].sort(), [...b.bits].sort(), `${kind} ${v}`);
    }
    // the gate's bits differ from the flip-flop's (the base's #FF)
    assert.notDeepEqual([...predictSlice(m, cfg({ BFF: '#AND2L' })).bits].sort(), [...predictSlice(m, cfg({ BFF: '#FF' })).bits].sort(), kind);
  }
});

test('bitdb-node: the open flow\'s PIPs measured one at a time (#732: a right I/O tile\'s input, a left one\'s output, the BIOB_SINGLE pads)', () => {
  const p = db.other.pips;
  assert.deepEqual(p['RIOI D_ILOGIC_SITE -> FABRICOUT_ILOGIC_SITE'], ['23,57', '29,28']);
  assert.deepEqual(p['RIOI RIOI_IOB_IBUF1 -> D_ILOGIC_IDATAIN_IODELAY_S'], []);
  assert.deepEqual(p['LIOI D1_OLOGIC_SITE -> OQ_OLOGIC_SITE'], ['27,29', '28,49', '29,32']);
  assert.deepEqual(p['BIOB_SINGLE BIOB_O0 -> BIOB_O0_PINW'], []);
  // the router may take them now
  const allow = knownPipS6(device, db), k = device.tileNames.findIndex(n => /^RIOI_X/.test(n)), tp = device.templates[device.tileTemplate[k]];
  let i = 0;
  for (; i < tp.from.length; i++) { const q = device.pip(k, i); if (q.from === 'D_ILOGIC_SITE' && q.to === 'FABRICOUT_ILOGIC_SITE') break; }
  assert.ok(i < tp.from.length && allow(k, i));
});

test('bitgen: a BSCAN_SPARTAN6, one bit per site in the corner\'s region (the site decides its JTAG chain, #3766); its pins\' switches into the fabric and TDO\'s from it known, on both parts (#3176)', () => {
  const sites = device.sites('BSCAN').sort((a, b) => a.name.localeCompare(b.name));
  assert.equal(sites.length, 4);
  const lone = (site, chain) => ({ insts: [{ name: 'b', type: 'BSCAN', site: site.name, tile: site.tileName, placed: true, cfg: cfg({ JTAG_CHAIN: String(chain), JTAG_TEST: '0' }) }], nets: [] });
  // (the XC6SLX16's: frame 2966, bits 31 … 28 for the chains 1 … 4, ISE's bitgen on gen-bscan6.mjs's designs)
  for (const [k, site] of sites.entries()) {
    const p = predictDesign(lone(site, k + 1), device, dev, db);
    assert.deepEqual([[...p.bits], [...p.unknown.keys()]], [[`2966,${31 - k}`], []], site.name);
  }
  // #3766: the bit is the site's, whatever the JTAG_CHAIN (ISE's bitgen: the chain 1 on BSCAN_X0Y3 sets bit 28, the site's)
  const p13 = predictDesign(lone(sites[3], 1), device, dev, db);
  assert.deepEqual([[...p13.bits], [...p13.unknown.keys()]], [['2966,28'], []]);
  const OUTS = ['CAPTURE', 'DRCK', 'RESET', 'RUNTEST', 'SEL', 'SHIFT', 'TCK', 'TDI', 'TMS', 'UPDATE'];
  for (const part of [PART, 'xc6slx45csg324-3']) {
    const d = loadDeviceCache(part), known = knownPipS6(d, loadBitDbS6(part));
    // each pin's wire one known switch from (an output) or into (TDO) the corner tile's interface wires, on every site
    for (const site of d.sites('BSCAN')) {
      const k = site.tile, tp = d.templates[d.tileTemplate[k]];
      const pips = Array.from({ length: tp.from.length }, (_, i) => [i, ...d.pipWires(k, i)]).filter(([i]) => known(k, i));
      for (const pin of OUTS) {
        const w = d.sitePin(site.name, pin).wire;
        assert.ok(pips.some(([, a, b]) => a === w && /^INT_INTERFACE_LOCAL_LOGICOUT_\d+$/.test(b)), `${part} ${site.name} ${pin}`);
      }
      const tdo = d.sitePin(site.name, 'TDO').wire;
      assert.ok(pips.some(([, , b]) => b === tdo), `${part} ${site.name} TDO`);
    }
  }
});

// #3169 / #3350: the designs that measured the pads' PIPs held out until nextpnr's chip database had them
// (research/s6/gen-padsingle6.mjs, gen-padout6.mjs, measure-3169-s6.sh; the PIPs and their bits in
// bitdb/s6/s6-pips-io.json since #3349, nextpnr-s6.test.js): each design's pad is one whose path takes such a PIP,
// known to the flow.
test('gen-padsingle6.mjs: one design per pad of the *IOB_SINGLE tiles, each pad\'s I pin a pad wire -> IBUF PIP the flow knows, all four taken, on both parts (#3169)', async () => {
  const { SINGLE_PADS, padSingleDesigns } = await import('../research/s6/gen-padsingle6.mjs');
  for (const part of [PART, 'xc6slx45csg324-3']) {
    const d = loadDeviceCache(part), sites = s6Sites(d), known = knownPipS6(d, loadBitDbS6(part));
    const pads = SINGLE_PADS[part.slice(0, 8)];
    assert.deepEqual([...sites.pads.values()].filter(p => /^[TB]IOB_SINGLE_/.test(p.tile)).map(p => p.name).sort(), [...pads].sort(), part);
    assert.deepEqual(Object.values(padSingleDesigns(part)).map(x => x.ucf.match(/NET "d" LOC = "(\w+)"/)[1]), pads);
    const keys = pads.map(pad => {
      // the pad's I pin: its one PIP onward, in the *IOB_SINGLE tile
      const pips = [];
      d.forEachPip(d.sitePinNode(pad, 'I'), (t, k, i) => pips.push([k, i]));
      assert.equal(pips.length, 1, `${part} ${pad}`);
      const [k, i] = pips[0], q = d.pip(k, i);
      assert.ok(known(k, i), `${part} ${pad}`);
      return `${d.tileNames[k].replace(/_X\d+Y\d+$/, '')} ${q.from} ${q.dir} ${q.to}`;
    });
    assert.deepEqual(keys.sort(), ['BIOB_SINGLE BIOB_IBUF0_PINW -> BIOB_IBUF0', 'BIOB_SINGLE BIOB_IBUF1_PINW -> BIOB_IBUF1',
      'TIOB_SINGLE TIOB_IBUF0_PINW -> TIOB_IBUF0', 'TIOB_SINGLE TIOB_IBUF1_PINW -> TIOB_IBUF1'], part);
  }
});

test('gen-padout6.mjs: its designs\' outputs on pads a TIOI_OUTER slave OLOGIC2\'s D1 -> OQ drives, known to the flow, on both parts (#3350)', async () => {
  const { OUTER_SLAVE_PADS, padOutDesigns } = await import('../research/s6/gen-padout6.mjs');
  for (const part of [PART, 'xc6slx45csg324-3']) {
    const d = loadDeviceCache(part), sites = s6Sites(d), known = knownPipS6(d, loadBitDbS6(part));
    const oNode = new Map([...sites.pads.values()].map(p => [d.sitePinNode(p.name, 'O'), p.name]));
    // each TIOI_OUTER tile's slave D1 -> OQ, followed to the pad's O pin it drives: known
    const driven = new Map();
    d.tileNames.forEach((name, k) => {
      if (!/^TIOI_OUTER_X/.test(name)) return;
      const tp = d.templates[d.tileTemplate[k]];
      for (let i = 0; i < tp.from.length; i++) {
        const q = d.pip(k, i);
        if (q.from !== 'D1_OLOGIC_SITE_S' || q.to !== 'OQ_OLOGIC_SITE_S') continue;
        let front = [d.pipNodes(k, i)[1]];
        for (let n = 0; n < 4 && front.length; n++) {
          const next = [];
          for (const x of front) { if (oNode.has(x)) driven.set(oNode.get(x), known(k, i)); d.forEachPip(x, t => next.push(t)); }
          front = next;
        }
      }
    });
    const pads = OUTER_SLAVE_PADS[part.slice(0, 8)];
    assert.deepEqual(pads.map(p => driven.get(p)), pads.map(() => true), part);
    assert.deepEqual(Object.values(padOutDesigns(part)).map(x => x.ucf.match(/NET "q" LOC = "(\w+)"/)[1]), pads);
  }
});
