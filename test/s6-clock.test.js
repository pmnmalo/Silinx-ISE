// research/s6 stage S6-E (#727), without ISE: the clock path's designs (gen-clock6.mjs), the DCM_SP's and PLL_BASE's
// (gen-dcm6.mjs) and their analysis (ana-dcm6.mjs); the measured DCM and PLL settings checked.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { clockDesign, manyClocks, padsForBufgs, sliceAt } from '../research/s6/gen-clock6.mjs';
import { dcmVariants, fieldVariants, dcmDesign, DCM_BASE } from '../research/s6/gen-dcm6.mjs';
import { variantBits } from '../research/s6/ana-dcm6.mjs';
import { S6_DEVICES } from '../core/fpga/s6/bitstream.js';
import { s6Device } from './s6-lib.mjs';

test('gen-clock6: flip-flops at fixed slices on one or two clocks; a clock on every BUFGMUX', () => {
  const { v, ucf } = clockDesign(['SLICE_X8Y8', { site: 'SLICE_X24Y40', clock: 2 }], { clk2: 'T8' });
  assert.match(v, /^module top\(input clk, input clk2, input d, output q\);/);
  assert.match(v, /always @\(posedge clk2\) r1 <= d \^ r0;/);
  assert.match(ucf, /NET "clk2" LOC = "T8" ;\nNET "d" LOC = "T10" ;\nNET "q" LOC = "U16" ;\nINST "r0" LOC = "SLICE_X8Y8" ;\nINST "r1" LOC = "SLICE_X24Y40" ;\n$/);
  const many = manyClocks(['A', 'B'], ['S0', 'S1'], { d: 'D', q: 'Q' });
  assert.match(many.v, /input \[1:0\] clk/);
  assert.match(many.ucf, /NET "clk<1>" LOC = "B" ;/);
  // every BUFGMUX reached once: a pad per BUFGMUX
  const pads = [{ name: 'P', bufg: ['B1', 'B2'] }, { name: 'Q', bufg: ['B1'] }, { name: 'R', bufg: ['B2', 'B3'] }];
  assert.deepEqual(padsForBufgs(pads), ['P', 'R']);
  const { sites } = s6Device('xc6slx16csg324-3');
  assert.equal(padsForBufgs([...sites.pads.values()].filter(p => p.bufg.length)).length, 16);
  const bases = JSON.parse(fs.readFileSync(new URL('../research/s6/db/xc6slx16-lut.json', import.meta.url), 'utf8')).slices;
  assert.equal(sliceAt(bases, S6_DEVICES.xc6slx16, 327, 0), 'SLICE_X16Y9');
  assert.equal(sliceAt(bases, S6_DEVICES.xc6slx16, 1, 0), null);
});

test('gen-dcm6: a DCM or PLL at a site, its output through a BUFG; the variants; ana: a variant against its base', () => {
  const dcm = dcmDesign({ kind: 'dcm', params: { CLKFX_MULTIPLY: 3 }, out: 'CLKFX' }, { site: 'DCM_X0Y1' });
  assert.match(dcm.v, /DCM_SP #\(\.CLKFX_MULTIPLY\(3\), \.CLKFX_DIVIDE\(1\)/);
  assert.match(dcm.v, /\.CLK0\(fb0\), \.CLKFB\(fb\), \.CLKFX\(o\), /);
  assert.match(dcm.ucf, /INST "cm" LOC = "DCM_X0Y1" ;/);
  // CLK0 as the output: not connected twice
  assert.equal((dcmDesign({ kind: 'dcm', params: {}, out: 'CLK0' }, { site: 's' }).v.match(/\.CLK0\(/g) || []).length, 1);
  const pll = dcmDesign({ kind: 'pll', params: { CLKOUT0_DIVIDE: 8 }, out: 'CLKOUT0' }, { site: 'PLL_ADV_X0Y0' });
  assert.match(pll.v, /PLL_BASE #\(\.CLKFBOUT_MULT\(4\), \.DIVCLK_DIVIDE\(1\), \.CLKOUT0_DIVIDE\(8\)/);
  assert.equal(DCM_BASE.CLKFX_MULTIPLY, 2);
  assert.equal(Object.keys(dcmVariants()).length, 17);
  // the PLL's field values keep its VCO between 400 and 1080 MHz
  for (const v of Object.values(fieldVariants()).filter(x => x.kind === 'pll' && x.params.CLKFBOUT_MULT)) {
    const vco = 100 * v.params.CLKFBOUT_MULT / (v.params.DIVCLK_DIVIDE ?? 1);
    assert.ok(vco >= 400 && vco <= 1080, `${vco}`);
  }
  assert.deepEqual(variantBits(new Set(['1,1', '2,2']), new Set(['2,2', '3,3'])), { set: ['3,3'], clear: ['1,1'] });
});

test('the XC6SLX16\'s DCM and PLL settings, measured: the counters\' bits, one or a few per value', () => {
  const db = JSON.parse(fs.readFileSync(new URL('../research/s6/db/xc6slx16-cmt.json', import.meta.url), 'utf8'));
  const v = db.dcm.variants;
  // CLKFX_MULTIPLY - 1 in binary: 2 (the base: 1), 3 (2), 4 (3), 5 (4), 8 (7)
  assert.deepEqual(v.dcmM3.set, ['357,416']);
  assert.deepEqual(v.dcmM4, { ...v.dcmM4, set: ['357,416'], clear: [] });
  assert.deepEqual(v.dcmM8.set, ['357,413', '357,416']);
  assert.deepEqual(v.dcmD2.set, ['357,432']);
  assert.deepEqual(v.dcmD3.set, ['357,431']);
  assert.ok(Object.values(db.pll.variants).every(x => x.set.every(b => b.startsWith('1101,'))));
});
