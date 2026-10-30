// packages/silinx-fpga/research/s6 stage S6-E (#727), without ISE: gen-iob6.mjs's designs (every bonded pad an IOB of the same settings,
// as Silinx writes them) and ana-iob6.mjs's attribution of the bits to the pads; the measured pads checked.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bondedPads, iobSettings, iobVariants, iobDesign } from '../packages/silinx-fpga/research/s6/gen-iob6.mjs';
import { bitsOf, padOfBits, nearestPad } from '../packages/silinx-fpga/research/s6/ana-iob6.mjs';
import { s6Device } from './s6-lib.mjs';

const { device } = s6Device('xc6slx16csg324-3');

test('gen-iob6: the bonded pads, an IOB\'s settings as Silinx writes them, the designs', () => {
  const pads = bondedPads(device);
  assert.equal(pads.length, 232);
  assert.deepEqual(pads[0], { pad: 'A10', tile: 'TIOB_X12Y63' });
  assert.equal(iobSettings({}, 'p'), 'DRIVEATTRBOX::12 OUSED::0 SLEW::SLOW SUSPEND::3STATE OUTBUF:p_OBUF: PAD:p: OSTANDARD::LVCMOS25');
  assert.equal(iobSettings({ dir: 'in', pull: 'PULLUP' }, 'p'), 'BYPASS_MUX::I IMUX:p.IMUX:I PULLTYPE::PULLUP INBUF:p_IBUF: PAD:p: ISTANDARD::LVCMOS25');
  assert.match(iobSettings({ dir: 'inout' }, 'p'), /OUSED::0 SLEW::SLOW SUSPEND::3STATE TUSED::0 INBUF:p_IBUF: OUTBUF:p_OBUF: .* ISTANDARD::LVCMOS25 OSTANDARD::LVCMOS25$/);
  const v = iobVariants(pads);
  assert.ok(!('drive24' in v) && v.drive2 && v.outLVCMOS12.drive === 6);
  assert.deepEqual(Object.keys(v).filter(n => /^(in)?id\d+$/.test(n)).length, 16);
  const id0 = iobDesign('p', pads.slice(0, 4), v.id0);
  assert.equal((id0.match(/^inst /gm) || []).length, 2);
  assert.match(id0, /inst "p_A11" "IOB",placed TIOB_X15Y63 A11 {2},/);
});

test('ana-iob6: the bits, their pads by the id designs, the nearest pad for the others', () => {
  const a = new Uint16Array(130), b = Uint16Array.from(a);
  a[1] = 0x0001; a[65] = 0x8000;
  assert.deepEqual([...bitsOf(a, b)], ['0,31', '1,0']);
  const base = new Set(['0,1', '0,2', '0,3']), ids = [new Set(['0,2', '0,3']), new Set(['0,3'])];
  assert.deepEqual([...padOfBits(base, ids)], [['0,1', 0], ['0,2', 1], ['0,3', 3]]);
  assert.equal(nearestPad('0,40', new Map([['P', ['0,10']], ['Q', ['0,50']]])), 'Q');
  assert.equal(nearestPad('5,10', new Map([['P', ['0,10']], ['Q', ['4,900']]])), 'Q');
});

test('the XC6SLX16\'s pads, measured: 6 bits an output, 9 an input, each variant the same count on every pad', () => {
  const db = JSON.parse(fs.readFileSync(new URL('../packages/silinx-fpga/bitdb/s6/xc6slx16-iob.json', import.meta.url), 'utf8'));
  const pads = Object.values(db.pads);
  assert.equal(pads.length, 232);
  assert.deepEqual(db.globals, ['734,988']);
  assert.ok(pads.every(p => p.base.length === 6 && p.input.length === 9));
  // all in the I/O words, after the rows' and the block RAM's frames
  assert.ok(pads.every(p => [...p.base, ...p.input].every(x => +x.split(',')[0] >= 4 * 744 + 576)));
  for (const n of ['drive2', 'drive16', 'slewFAST', 'outLVCMOS33', 'inPULLUP (from in)', 'inout']) {
    const counts = new Set(pads.map(p => `${p.variants[n]?.set.length}+${p.variants[n]?.clear.length}`));
    assert.equal(counts.size, 1, n);
  }
});

test('the pads in the residual: a pad\'s bits from its IOB\'s settings, an output\'s path bit; the XC6SLX45\'s pads', async () => {
  const { predictIob, padBit } = await import('../packages/silinx-fpga/research/s6/residual6.mjs');
  const read = d => JSON.parse(fs.readFileSync(new URL(`../packages/silinx-fpga/bitdb/s6/${d}-iob.json`, import.meta.url), 'utf8'));
  const db = read('xc6slx16'), pad = db.pads.U16;
  const cfg = s => s.split(' ').map(x => { const [attr, name, value] = x.split(':'); return { attr, name, value }; });
  // an output: its base and the path bit 15 before its first; drive 4, FAST
  const out = predictIob(pad, cfg('DRIVEATTRBOX::12 OUSED::0 SLEW::SLOW OSTANDARD::LVCMOS25'));
  assert.deepEqual([...out.bits].sort(), [...pad.base, padBit(pad, -15)].sort());
  assert.equal(padBit(pad, -15), '3552,128');
  const fast = predictIob(pad, cfg('DRIVEATTRBOX::4 OUSED::0 SLEW::FAST OSTANDARD::LVCMOS25'), { routed: false });
  const want = new Set(pad.base);
  for (const v of [pad.variants.drive4, pad.variants.slewFAST]) { for (const x of v.clear) want.delete(x); for (const x of v.set) want.add(x); }
  assert.deepEqual([...fast.bits].sort(), [...want].sort());
  // an input with a pull-up; a standard not measured
  const inp = predictIob(pad, cfg('IMUX:p:I PULLTYPE::PULLUP ISTANDARD::LVCMOS33'));
  assert.equal(inp.bits.size, pad.input.length + 1);
  assert.deepEqual(predictIob(pad, cfg('OUSED::0 OSTANDARD::SSTL2_I')).unknown, ['outSSTL2_I']);
  // the XC6SLX45: its 218 pads as the XC6SLX16's, 6 and 9 bits each; its globals the I/O's and the top row's clock word
  const big = read('xc6slx45');
  assert.equal(Object.keys(big.pads).length, 218);
  assert.ok(Object.values(big.pads).every(p => p.base.length === 6 && p.input.length === 9));
  assert.ok(big.globals.includes('8411,527') && big.globals.length === 9);
});
