// research/s6 stage S6-F (#728), without ISE: the block RAM's and the DSP48A1's designs (gen-hard6.mjs), their
// analysis's helpers (ana-hard6.mjs), the database measured (db/xc6slx16-hard.json) and the prediction (hard6.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hardBase, hardVariants, contents, hardDesigns, siteSlots, widthPairs, HARD_COMBOS } from '../research/s6/gen-hard6.mjs';
import { bitY, tileRegions, tileOf, bitsByTile, siteById } from '../research/s6/ana-hard6.mjs';
import { hexBits, fieldIndices, predictHard } from '../research/s6/hard6.mjs';
import { gridRegion } from '../research/s6/ana-pipdrop6.mjs';
import { S6_DEVICES } from '../packages/silinx-fpga/src/fpga/s6/bitstream.js';
import { s6Device } from './s6-lib.mjs';

const hard = JSON.parse(fs.readFileSync(new URL('../research/s6/db/xc6slx16-hard.json', import.meta.url), 'utf8'));
const { device } = s6Device('xc6slx16csg324-3'), dev = S6_DEVICES.xc6slx16;
const sitesOf = type => device.sites().filter(s => s.type === type).sort((a, b) => (a.name < b.name ? -1 : 1));

test('gen-hard6: the base settings as Silinx writes them, the variants one element each, the combinations', () => {
  const r8 = new Map(hardBase('RAMB8BWER')), r16 = new Map(hardBase('RAMB16BWER')), dsp = new Map(hardBase('DSP48A1'));
  // the inverters as their pins, the widths the widest of TDP, no register, SYNC (packages/silinx-fpga/src/fpga/s6/xdl.js bramCfg / dspCfg)
  assert.equal(r8.get('CLKAWRCLKINV'), 'CLKAWRCLK');
  assert.equal(r8.get('DATA_WIDTH_A'), '18');
  assert.equal(r8.get('RAM_MODE'), 'TDP');
  assert.equal(r16.get('DATA_WIDTH_B'), '36');
  assert.equal(r16.get('WRITE_MODE_A'), 'WRITE_FIRST');
  assert.equal(dsp.get('MREG'), '0');
  assert.equal(dsp.get('CARRYINSEL'), 'OPMODE5');
  // the block RAMs' contents all written, zero (ISE refuses an instance without them)
  assert.equal(r16.get('INIT_3F'), '0'.repeat(64));
  assert.equal(r16.get('INITP_07'), '0'.repeat(64));
  assert.equal(r16.get('SRVAL_A'), '000000000');
  assert.equal(r8.get('INIT_B'), '00000');
  assert.equal(r8.has('INIT_20'), false);
  assert.equal(dsp.has('INIT_A'), false);
  // one element's other options each, then the combinations measured as one
  const v8 = hardVariants('RAMB8BWER');
  assert.deepEqual([hardVariants('RAMB16BWER').length, v8.length, hardVariants('DSP48A1').length], [41, 38, 31]);
  assert.equal(v8.at(-1).name, 'RAM_MODE=SDP+DATA_WIDTH_A=36+DATA_WIDTH_B=36');
  assert.equal(HARD_COMBOS.RAMB8BWER.length, 1);
  const mreg = hardVariants('DSP48A1').find(v => v.name === 'MREG=1');
  assert.equal(mreg.settings.filter((x, i) => x[1] !== hardBase('DSP48A1')[i][1]).length, 1);
});

test('gen-hard6: the contents by code (bit i set when bit j of i is), the width pairs, the slots, the designs', () => {
  const c0 = new Map(contents('RAMB16BWER', 0)), c7 = new Map(contents('RAMB16BWER', 7)), c8 = new Map(contents('RAMB16BWER', 8)), ones = new Map(contents('RAMB8BWER', 'ones'));
  assert.equal(c0.get('INIT_00'), 'A'.repeat(64));
  assert.equal(c7.get('INIT_00'), 'F'.repeat(32) + '0'.repeat(32));
  assert.equal(c8.get('INIT_00'), '0'.repeat(64));
  assert.equal(c8.get('INIT_01'), 'F'.repeat(64));
  assert.equal(c0.get('INIT_A'), 'AAAAAAAAA');
  assert.equal(ones.get('SRVAL_B'), 'FFFFF'); // whole digits: ISE takes the field's 18 bits
  assert.equal(new Map(contents('RAMB8BWER', 'ones', f => f === 'INITP')).get('INIT_00'), '0'.repeat(64));
  assert.equal(new Map(contents('RAMB8BWER', 'ones', f => f === 'INITP')).get('INITP_03'), 'F'.repeat(64));
  // A alone, B alone, both, one at the widest; a RAMB8BWER's 36 its SDP mode
  assert.equal(widthPairs('RAMB16BWER').length, 28);
  assert.deepEqual(widthPairs('RAMB8BWER').at(-1), ['36', '36', 'SDP']);
  // two RAMB8BWERs to a tile, by Y
  const r8 = sitesOf('RAMB8BWER'), slots = siteSlots(r8);
  assert.equal(slots.count, 2);
  assert.equal(slots.of(r8.find(s => s.name === 'RAMB8_X0Y12')), 0);
  assert.equal(slots.of(r8.find(s => s.name === 'RAMB8_X0Y13')), 1);
  assert.equal(siteSlots(sitesOf('RAMB16BWER')).count, 1);
  const ds = hardDesigns('xc6slx16csg324-3', r8, 'RAMB8BWER');
  assert.deepEqual(Object.keys(ds).filter(n => /v/.test(n)), ['s0v0', 'a0v0', 's0v1', 'a0v1', 's1v0', 'a1v0', 's1v1', 'a1v1']);
  // a<slot>: the slot's sites alone in their tiles
  assert.equal(Object.keys(ds.a1v0.map).length, 32);
  assert.match(ds.a1v0.xdl, /inst "h_RAMB8_X0Y13" "RAMB8BWER",placed BRAMSITE2_X3Y24 RAMB8_X0Y13 {2},\n {2}cfg " RAMB8BWER:h_RAMB8_X0Y13: /);
  assert.doesNotMatch(ds.a1v0.xdl, /RAMB8_X0Y12"/);
  assert.equal(Object.keys(ds).filter(n => /^id/.test(n)).length, 6);
  assert.equal(Object.keys(ds).filter(n => /^w/.test(n)).length, 14);
});

test('ana-hard6: a bit\'s INT row (the band\'s inverse), its tile, its site by the ids', () => {
  // every row of a clock region: gridRegion's band read back
  for (const y of [0, 7, 8, 15, 16, 23, 24, 63]) {
    const [f0, b0] = gridRegion(device, dev, device.tileNames.find(n => new RegExp(`^INT_X\\d+Y${y}$`).test(n)));
    assert.equal(bitY(dev, f0, b0), y);
    assert.equal(bitY(dev, f0, b0 + 63), y);
  }
  const r16 = sitesOf('RAMB16BWER'), regions = tileRegions(device, dev, r16), r = regions.BRAMSITE2_X3Y12;
  assert.equal(r.y0, 12);
  // a tile spans its row and the 3 above (the bits below its band)
  assert.equal(tileOf(regions, dev, r.f0 + 23, r.b0 + 62).tile, 'BRAMSITE2_X3Y12');
  assert.equal(tileOf(regions, dev, r.f0 + 24, r.b0 - 191).tile, 'BRAMSITE2_X3Y12');
  assert.equal(tileOf(regions, dev, r.f0 + 24, r.b0 - 193)?.tile, 'BRAMSITE2_X3Y16');
  const { out, lost } = bitsByTile(new Set([`${r.f0 + 23},${r.b0 + 48}`, '1,0']), regions, dev);
  assert.deepEqual([...out.BRAMSITE2_X3Y12], ['23,48']);
  assert.deepEqual(lost, ['1,0']);
  assert.equal(siteById('x', [new Set(['x']), new Set(), new Set(['x'])], r16), r16[5]);
});

test('db/xc6slx16-hard.json: one pattern per slot, the contents a site\'s 18432 bits once, the clock pins', () => {
  const r16 = hard.RAMB16BWER, r8 = hard.RAMB8BWER, dsp = hard.DSP48A1;
  assert.deepEqual([r16.slots.length, r8.slots.length, dsp.slots.length], [1, 2, 1]);
  assert.deepEqual([r16.slots[0].base.length, r8.slots[0].base.length, r8.slots[1].base.length, dsp.slots[0].base.length], [50, 24, 24, 1]);
  // a RAMB16BWER's settings in two copies (its two halves): DOA_REG
  assert.deepEqual(r16.slots[0].options['DOA_REG=1'], { set: ['24,-174', '24,45'], clear: [] });
  assert.deepEqual(r8.slots[0].alone['DOA_REG=1'], { set: ['24,45'], clear: [] });
  assert.deepEqual(r8.slots[1].alone['DOA_REG=1'], { set: ['24,-174'], clear: [] });
  assert.deepEqual(dsp.slots[0].options['MREG=1'], { set: ['23,-127'], clear: [] });
  // the inverters set no bit on a pin with no net (Silinx writes them uninverted)
  assert.deepEqual(r16.slots[0].options['CLKAINV=CLKA_B'], { set: [], clear: [] });
  // every content bit at its own offset, the narrow order the same positions
  for (const [t, n] of [[r16.bram, 16384], [r8.bram, 8192]]) {
    assert.equal(t.data.length, n);
    assert.equal(new Set([...t.data, ...t.parity]).size, n * 9 / 8);
  }
  assert.equal(Object.keys(r16.bram.sites).length, 32);
  assert.deepEqual(new Set([...r16.bram.narrow.data, ...r16.bram.narrow.parity]), new Set([...r16.bram.data, ...r16.bram.parity]));
  assert.notDeepEqual(r16.bram.narrow.data, r16.bram.data);
  assert.equal(r8.bram.narrow, undefined);
  // INIT_A … 36 bits (18), each at its offset
  assert.equal(r16.slots[0].fields.INIT_A.filter(Boolean).length, 36);
  assert.equal(r8.slots[1].fields.SRVAL_B.filter(Boolean).length, 18);
  // a clock pin's two bits (the RAMB16BWER's halves), a RAMB8BWER's its slot's
  assert.deepEqual(r16.slots[0].pins, { CLKA: ['23,-187', '23,58'], CLKB: ['23,-185', '23,56'] });
  assert.deepEqual(r8.slots[0].pins, { CLKAWRCLK: ['23,58'], CLKBRDCLK: ['23,56'] });
  assert.deepEqual(r8.slots[1].pins, { CLKBRDCLK: ['23,-185'], CLKAWRCLK: ['23,-187'] });
});

test('hard6: a hex value\'s bits; INIT and SRVAL as wide as their ports; an instance\'s bits', () => {
  assert.deepEqual(hexBits('0A1'), [0, 5, 7]);
  assert.deepEqual(hexBits('000'), []);
  assert.deepEqual(fieldIndices('RAMB16BWER', 0), []);
  assert.deepEqual(fieldIndices('RAMB16BWER', 4), [[0, 0], [1, 1], [2, 2], [3, 3]]);
  // a 9-bit port's parity bit (bit 8) at its index and at the parity's
  assert.deepEqual(fieldIndices('RAMB16BWER', 9).slice(-2), [[8, 8], [8, 32]]);
  assert.deepEqual(fieldIndices('RAMB8BWER', 9).slice(-2), [[8, 8], [8, 16]]);
  assert.equal(fieldIndices('RAMB16BWER', 18).length, 20);
  assert.equal(fieldIndices('RAMB8BWER', 18).length, 18);
  assert.equal(fieldIndices('RAMB8BWER', 36).length, 18);
  assert.equal(fieldIndices('RAMB16BWER', 36).length, 36);

  const r8 = (site, tile, cfg) => ({ type: 'RAMB8BWER', site, tile, placed: true, cfg: [...hardBase('RAMB8BWER'), ...cfg].map(([attr, value]) => ({ attr, name: '', value })) });
  const at = (tile, offs) => { const [f0, b0] = gridRegion(device, dev, tile); return offs.map(o => { const [f, b] = o.split(',').map(Number); return `${f0 + f},${b0 + b}`; }).sort(); };
  // the base alone: its slot's base bits, no contents
  const base = predictHard(r8('RAMB8_X1Y13', 'BRAMSITE2_X21Y24', []), device, dev, hard);
  assert.deepEqual({ ...base, bits: base.bits.sort() }, { bits: at('BRAMSITE2_X21Y24', hard.RAMB8BWER.slots[1].base), unknown: [] });
  // a setting, the clock pins with nets, INIT_B on a 4-bit port (its bits 0 … 3), the contents' bit 0
  const p = predictHard(r8('RAMB8_X1Y13', 'BRAMSITE2_X21Y24', [['DOA_REG', '1'], ['DATA_WIDTH_B', '4'], ['INIT_B', '00155'], ['INIT_00', `${'0'.repeat(63)}1`]]), device, dev, hard, new Set(['CLKAWRCLK', 'DIADI0']));
  const sl = hard.RAMB8BWER.slots[1], want = new Set(sl.base);
  for (const o of ['DOA_REG=1', 'DATA_WIDTH_B=4']) { sl.alone[o].clear.forEach(x => want.delete(x)); sl.alone[o].set.forEach(x => want.add(x)); }
  [...sl.pins.CLKAWRCLK, sl.fields.INIT_B[0], sl.fields.INIT_B[2]].forEach(x => want.add(x));
  const q = hard.RAMB8BWER.bram.sites.RAMB8_X1Y13 + hard.RAMB8BWER.bram.data[0], main = dev.rows * dev.rowFrames;
  assert.deepEqual(p.bits.sort(), [...at('BRAMSITE2_X21Y24', [...want]), `${main + Math.floor(q / 1040)},${q % 1040}`].sort());
  // the SDP mode's combination, measured as one
  const sdp = predictHard(r8('RAMB8_X1Y12', 'BRAMSITE2_X21Y24', [['RAM_MODE', 'SDP'], ['DATA_WIDTH_A', '36'], ['DATA_WIDTH_B', '36']]), device, dev, hard);
  assert.deepEqual(sdp.unknown, []);
  // what the database has not
  assert.deepEqual(predictHard(r8('RAMB8_X1Y12', 'BRAMSITE2_X21Y24', [['WRITE_MODE_A', 'SOMETIMES']]), device, dev, hard).unknown, ['RAMB8BWER WRITE_MODE_A=SOMETIMES']);
  assert.deepEqual(predictHard({ type: 'RAMB8BWER', site: 's', tile: 'BRAMSITE2_X21Y24', cfg: [] }, device, dev, {}).unknown, ['RAMB8BWER not measured']);
  // a DSP48A1 with MREG
  const dsp = predictHard({ type: 'DSP48A1', site: 'DSP48_X1Y7', tile: 'MACCSITE2_X18Y28', cfg: [{ attr: 'MREG', name: '', value: '1' }] }, device, dev, hard);
  assert.deepEqual(dsp.bits.sort(), at('MACCSITE2_X18Y28', ['22,-133', '23,-127']));
});

test('db/xc6slx45-hard.json: the XC6SLX16\'s offsets, contents\' orders, fields and clock pins; its own sites', () => {
  const h45 = JSON.parse(fs.readFileSync(new URL('../research/s6/db/xc6slx45-hard.json', import.meta.url), 'utf8'));
  for (const t of ['RAMB16BWER', 'RAMB8BWER', 'DSP48A1']) {
    h45[t].slots.forEach((s, j) => {
      const o = hard[t].slots[j];
      // the options alone in their tiles (a RAMB8BWER's) or the only ones: the same; the paired ones carry the other site's
      assert.deepEqual(s.base, o.base);
      assert.deepEqual(s.alone ?? s.options, o.alone ?? o.options);
      assert.deepEqual(s.fields, o.fields);
      assert.deepEqual(s.pins, o.pins);
    });
    if (hard[t].bram) for (const k of ['data', 'parity', 'narrow']) assert.deepEqual(h45[t].bram[k], hard[t].bram[k]);
  }
  assert.deepEqual([Object.keys(h45.RAMB16BWER.bram.sites).length, Object.keys(h45.RAMB8BWER.bram.sites).length], [116, 232]);
  // the bits ISE sets outside the tiles in every RAMB8BWER and DSP48A1 design of the XC6SLX45: two SLICEM columns'
  // clock row words, minors 16 to 19 of the top row
  assert.deepEqual(h45.RAMB8BWER.outside, ['8411,527', '8412,527', '8413,527', '8414,527', '8894,527', '8895,527', '8896,527', '8897,527']);
  assert.equal(hard.RAMB8BWER.outside, undefined);
});
