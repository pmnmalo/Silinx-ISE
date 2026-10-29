// research/s6 stage S6-E (#727), without ISE: the clock path's designs (gen-clock6.mjs), the DCM_SP's and PLL_BASE's
// (gen-dcm6.mjs) and their analysis (ana-dcm6.mjs); the measured DCM and PLL settings checked.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { clockDesign, manyClocks, padsForBufgs, sliceAt } from '../research/s6/gen-clock6.mjs';
import { dcmVariants, fieldVariants, dcmDesign, DCM_BASE } from '../research/s6/gen-dcm6.mjs';
import { variantBits } from '../research/s6/ana-dcm6.mjs';
import { S6_DEVICES } from '../packages/silinx-fpga/src/fpga/s6/bitstream.js';
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
  // the --fields designs: CLKFX_MULTIPLY - 1 in bits 417 (1), 416 (2), 413 (4), 412 (8), 409 (16); CLKFX_DIVIDE - 1 in
  // 432, 431, 429, 428, 425 (M = 32: 31, all five; D = 32: all five)
  assert.deepEqual(v.dcmM32.set, ['357,409', '357,412', '357,413', '357,416', '357,429', '357,431', '357,432']);
  assert.deepEqual(v.dcmD32.set, ['357,425', '357,428', '357,429', '357,431', '357,432']);
  assert.deepEqual(v.dcmD17.set, ['357,425']);
});

test('the clock pads: a BUFG per BUFGMUX from two pads; each pad\'s REGC and I/O bits, predicted on both parts', async () => {
  const { bufgDesign, bufgSelections } = await import('../research/s6/gen-clock6.mjs');
  const { clockPadBits, REGC_FRAME } = await import('../research/s6/ana-clock6.mjs');
  const { predictDesign, padBit } = await import('../research/s6/residual6.mjs');
  const { parseXdl } = await import('../packages/silinx-fpga/src/xdl.js');
  const b = bufgDesign('V10', 'BUFGMUX_X3Y13', 'SLICE_X16Y9');
  assert.match(b.v, /BUFG b\(\.I\(clk\), \.O\(c\)\);/);
  assert.match(b.ucf, /INST "b" LOC = "BUFGMUX_X3Y13" ;\nINST "q" LOC = "SLICE_X16Y9" ;\n$/);
  assert.deepEqual(bufgSelections([{ name: 'P', bufg: ['B1'] }, { name: 'Q', bufg: ['B1', 'B2'] }, { name: 'R', bufg: ['B1'] }]),
    [{ bufg: 'B1', pad: 'P' }, { bufg: 'B1', pad: 'R' }, { bufg: 'B2', pad: 'Q' }]);
  const { sites } = s6Device('xc6slx16csg324-3');
  assert.equal(bufgSelections([...sites.pads.values()].filter(p => p.bufg.length)).length, 32);
  const read = n => JSON.parse(fs.readFileSync(new URL(`../research/s6/db/${n}.json`, import.meta.url), 'utf8'));
  const clocks = read('s6-clocks'), iob = read('xc6slx16-iob');
  // the 32 clock pads, a REGC bit each (976 … 1007, all different) and an I/O offset
  assert.equal(Object.keys(clocks.pads).length, 32);
  assert.equal(new Set(Object.values(clocks.pads).map(p => p.regc)).size, 32);
  assert.ok(Object.values(clocks.pads).every(p => p.regc >= 976 && p.regc <= 1007));
  assert.deepEqual(clocks.pads.V10, { regc: 996, iob: clocks.pads.V10.iob });
  assert.equal(padBit(iob.pads.V10, clocks.pads.V10.iob), '3554,202');
  assert.deepEqual(clockPadBits(['1840,996', '3554,202', '5,5'], iob.pads.V10, REGC_FRAME.xc6slx16, 3552), { regc: [996], iob: [clocks.pads.V10.iob] });
  // the residual: a pad on a BUFG adds its two bits
  const design = parseXdl(`design "t" xc6slx16csg324-3 v3.2 , cfg "";
inst "clk" "IOB",placed BIOB_X12Y0 V10 , cfg " BYPASS_MUX::I IMUX:clk.IMUX:I INBUF:clk_IBUF: PAD:clk: ISTANDARD::LVCMOS25 " ;
inst "g" "BUFG",placed CLKC_X11Y31 BUFGMUX_X3Y13 , cfg " BUFG:g: " ;
net "c" , outpin "clk" I , inpin "g" I0 , ;
`);
  const { bits } = predictDesign(design, s6Device('xc6slx16csg324-3').device, S6_DEVICES.xc6slx16, { part: 'xc6slx16csg324-3', iob, clocks, int: { pips: {}, cover: {} }, other: { pips: {} }, slices: null });
  assert.ok(bits.has('1840,996') && bits.has('3554,202'));
});

test('the CMT sites: a DCM\'s or PLL\'s bits at minor 30 of the CMT column in its row, an even DCM\'s 283 bits on', () => {
  const db = JSON.parse(fs.readFileSync(new URL('../research/s6/db/xc6slx16-cmt.json', import.meta.url), 'utf8'));
  // DCM_X0Y1 (row 0) frame 357 = column 12's first (327) + 30; PLL_ADV_X0Y0 (row 1) 744 + 357
  const dev = S6_DEVICES.xc6slx16;
  let c12 = 0;
  for (let i = 0; i < 12; i++) c12 += dev.columns[i];
  assert.equal(c12 + 30, 357);
  assert.ok(db.dcm.variants.dcmM32.set.every(x => x.startsWith('357,')));
  assert.ok(db.pll.variants.pllO65.set.every(x => x.startsWith(`${dev.rowFrames + 357},`)));
});

test('a SLICEM as a shift register on a clock: minors 16 to 19 of its column\'s clock row word', async () => {
  const { predictDesign } = await import('../research/s6/residual6.mjs');
  const { loadDb } = await import('../research/s6/check-slice6.mjs');
  const { parseXdl } = await import('../packages/silinx-fpga/src/xdl.js');
  const { columnOf } = await import('../research/s6/ana-slice6.mjs');
  const dev = S6_DEVICES.xc6slx16, { device } = s6Device('xc6slx16csg324-3');
  const db = { part: 'xc6slx16csg324-3', slices: loadDb('xc6slx16'), int: { pips: {}, cover: {} }, other: { pips: {} } };
  const srl = cfg => parseXdl(`design "t" xc6slx16csg324-3 v3.2 , cfg "";\ninst "s" "SLICEM",placed CLEXM_X12Y42 SLICE_X18Y42 , cfg " ${cfg} " ;\n`);
  const bases = JSON.parse(fs.readFileSync(new URL('../research/s6/db/xc6slx16-lut.json', import.meta.url), 'utf8')).slices;
  const c0 = columnOf(dev, bases.SLICE_X18Y42[0])[0], want = [16, 17, 18, 19].map(m => `${c0 + m},527`);
  // measured: SLICE_X18Y42's column at frame 1846 (row 2), the bits 1862 … 1865, 527
  assert.deepEqual(want, ['1862,527', '1863,527', '1864,527', '1865,527']);
  const on = predictDesign(srl('A6LUT:s.A:#RAM:O6=0x0000000000000000 A6RAMMODE::SRL16 CLKINV::CLK WEMUX::CE'), device, dev, db).bits;
  assert.ok(want.every(x => on.has(x)));
  // not without a clock, not as a LUT
  assert.ok(!predictDesign(srl('A6LUT:s.A:#RAM:O6=0x0000000000000000 A6RAMMODE::SRL16'), device, dev, db).bits.has(want[0]));
  assert.ok(!predictDesign(srl('A6LUT:s.A:#LUT:O6=A1 AFF:s.f:#FF CLKINV::CLK'), device, dev, db).bits.has(want[0]));
});

test('cmt6: a DCM\'s clock pad and BUFGs from its nets; its bits, the base\'s with the pad\'s and the BUFG\'s changes', async () => {
  const { cmtPath, cmtCfg, predictCmt } = await import('../research/s6/cmt6.mjs');
  const { parseXdl } = await import('../packages/silinx-fpga/src/xdl.js');
  const design = parseXdl(`design "t" xc6slx16csg324-3 v3.2 , cfg "";
inst "clk" "IOB",placed BIOB_X12Y0 U10 , cfg " PAD:clk: " ;
inst "io" "BUFIO2",placed REG_B_X1Y0 BUFIO2_X1Y1 , cfg " " ;
inst "cm" "DCM",placed CMT_DCM_BOT_X11Y8 DCM_X0Y1 , cfg " CLKFX_MULTIPLY::2 CLKDV_DIVIDE::2.0 _NO_X:: " ;
inst "bo" "BUFG",placed CLKC_X11Y31 BUFGMUX_X2Y1 , cfg " BUFG:bo: " ;
net "a" , outpin "clk" I , inpin "io" I , ;
net "b" , outpin "io" DIVCLK , inpin "cm" CLKIN , ;
net "c" , outpin "cm" CLKFX , inpin "bo" I0 , ;
`);
  const cm = design.insts.find(i => i.name === 'cm');
  assert.deepEqual(cmtPath(design, cm), { pad: 'U10', bufgs: ['BUFGMUX_X2Y1'] });
  assert.equal(cmtCfg(cm), 'CLKDV_DIVIDE::2.0 CLKFX_MULTIPLY::2');
  const kind = { basePad: 'V10', baseBufgs: ['BUFGMUX_X3Y13'], base: ['1,1', '2,2', '3,3'], pads: { U10: { set: ['4,4'], clear: ['1,1'] } }, bufgs: { BUFGMUX_X2Y1: { set: ['5,5'], clear: ['3,3'] } } };
  assert.deepEqual([...predictCmt(kind, { pad: 'U10', bufgs: ['BUFGMUX_X2Y1'] })].sort(), ['2,2', '4,4', '5,5']);
  assert.deepEqual([...predictCmt(kind, { pad: 'V10', bufgs: ['BUFGMUX_X3Y13'] })].sort(), ['1,1', '2,2', '3,3']);
  assert.equal(predictCmt(kind, { pad: 'K3', bufgs: [] }), null);
  assert.equal(predictCmt(kind, { pad: 'V10', bufgs: ['BUFGMUX_X3Y16'] }), null);
  // the measured database: three other pads and three other BUFGMUXes for each
  const db = JSON.parse(fs.readFileSync(new URL('../research/s6/db/xc6slx16-cmt-paths.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(db.dcm.pads).sort(), ['R8', 'T9', 'U10']);
  assert.equal(db.dcm.site, 'DCM_X0Y1');
  assert.equal(db.pll.site, 'PLL_ADV_X0Y0');
  assert.equal(Object.keys(db.pll.bufgs).length, 3);
});
