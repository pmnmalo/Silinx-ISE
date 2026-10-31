// packages/silinx-fpga/research/s6 stage S6-E2 (#1951), without ISE: the designs of every CMT site (gen-cmtsites6.mjs, --outputs), an even
// DCM's (gen-dcm6.mjs --dcm), the settings' key and their prediction at any site (cmt6.mjs), the probe of the PIPs the
// drop could not take apart (gen-cmtprobe6.mjs, ana-cmtprobe6.mjs) and the databases measured
// (db/xc6slx16-cmt-settings.json, xc6slx16-cmt.json's dcmEven, s6-pips-probe.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cmtSiteDesigns, cmtSiteDesign, cmtOutputDesigns, DCM_ALL, PLL_ALL } from '../packages/silinx-fpga/research/s6/gen-cmtsites6.mjs';
import { cmtProbes, intTieoffs } from '../packages/silinx-fpga/research/s6/gen-cmtprobe6.mjs';
import { probeBits, CONTEXT } from '../packages/silinx-fpga/research/s6/ana-cmtprobe6.mjs';
import { gridRegion } from '../packages/silinx-fpga/research/s6/ana-pipdrop6.mjs';
import { cmtKind, predictCmtSettings, CMT_FRAME } from '../packages/silinx-fpga/research/s6/cmt6.mjs';
import { cmtWindow, PLL_USE_BITS } from '../packages/silinx-fpga/research/s6/ana-cmtsites6.mjs';
import { columnOf } from '../packages/silinx-fpga/research/s6/ana-slice6.mjs';
import { S6_DEVICES, emptyFdri } from '../packages/silinx-fpga/src/fpga/s6/bitstream.js';
import { s6Device } from './s6-lib.mjs';

const db = n => JSON.parse(fs.readFileSync(new URL(`../packages/silinx-fpga/bitdb/s6/${n}.json`, import.meta.url), 'utf8'));

test('gen-cmtsites6: every CMT site from its half\'s pads and the sides\', three outputs on the BUFGMUXes in turn', () => {
  const ds = cmtSiteDesigns('xc6slx16csg324-3');
  assert.equal(ds.length, 48);
  assert.deepEqual([...new Set(ds.map(d => d.site))], ['DCM_X0Y0', 'DCM_X0Y1', 'DCM_X0Y2', 'DCM_X0Y3', 'PLL_ADV_X0Y0', 'PLL_ADV_X0Y1']);
  const { sites } = s6Device('xc6slx16csg324-3'), bank = p => sites.pads.get(p).bank;
  // a top site's even designs from bank 0, a bottom one's from bank 2, the odd ones from the sides (banks 1 and 3)
  const banks = site => ds.filter(d => d.site === site).map(d => bank(d.pad));
  assert.deepEqual(banks('DCM_X0Y2').filter((_, k) => k % 2 === 0), [0, 0, 0, 0]);
  assert.deepEqual(banks('PLL_ADV_X0Y0').filter((_, k) => k % 2 === 0), [2, 2, 2, 2]);
  assert.ok([...banks('DCM_X0Y2'), ...banks('PLL_ADV_X0Y0')].filter((_, k) => k % 2 === 1).every(b => b === 1 || b === 3));
  assert.equal(new Set(ds.filter(d => d.site === 'DCM_X0Y2').map(d => d.pad)).size, 8);
  // every BUFGMUX in turn, 8 to 10 times
  const uses = {};
  ds.forEach(d => d.bufgs.forEach(b => { uses[b] = (uses[b] || 0) + 1; }));
  assert.equal(Object.keys(uses).length, 16);
  assert.ok(Object.values(uses).every(n => n >= 8 && n <= 10));
  assert.equal(new Set(ds.flatMap(d => d.bufgs)).size, 16);
  assert.equal(cmtSiteDesigns('xc6slx45csg324-3', 2).length, 24);

  const dcm = cmtSiteDesign({ kind: 'dcm', site: 'DCM_X0Y2', pad: 'A9', bufgs: ['BUFGMUX_X2Y1', 'BUFGMUX_X2Y10', 'BUFGMUX_X2Y11'] });
  assert.match(dcm.v, /DCM_SP #\(\.CLKFX_MULTIPLY\(2\), .*\) cm\(\.CLKIN\(clk\), \.CLK0\(fb0\), \.CLKFB\(fb\), \.CLKFX\(o\[0\]\), \.CLK2X\(o\[1\]\), \.CLKDV\(o\[2\]\), /);
  assert.match(dcm.v, /BUFG b2\(\.I\(o\[2\]\), \.O\(g\[2\]\)\);\n {2}always @\(posedge g\[2\]\) r\[2\] <= d \^ r\[1\];/);
  assert.equal(dcm.ucf, 'NET "clk" LOC = "A9" ;\nNET "d" LOC = "V3" ;\nNET "q" LOC = "U16" ;\nINST "cm" LOC = "DCM_X0Y2" ;\nINST "b0" LOC = "BUFGMUX_X2Y1" ;\nINST "b1" LOC = "BUFGMUX_X2Y10" ;\nINST "b2" LOC = "BUFGMUX_X2Y11" ;\n');
  const pll = cmtSiteDesign({ kind: 'pll', site: 'PLL_ADV_X0Y1', pad: 'C10', bufgs: ['A', 'B', 'C'] });
  assert.match(pll.v, /PLL_BASE #\(.*\.CLKOUT0_DIVIDE\(4\).*\.CLKOUT1_DIVIDE\(8\), \.CLKOUT2_DIVIDE\(16\)\) cm\(\.CLKIN\(clk\), \.CLKFBIN\(fb\), \.CLKFBOUT\(fb\), \.CLKOUT0\(o\[0\]\), /);
});

test('cmt6: a CMT\'s settings key (a DCM by its Y\'s parity) and its settings in its tile\'s row', () => {
  const cfg = [{ attr: 'CLKFX_MULTIPLY', name: '', value: '2' }, { attr: '_INST_PROP', name: '', value: 'x' }, { attr: 'PSENINV', name: '', value: '#OFF' }];
  assert.equal(cmtKind({ type: 'DCM', site: 'DCM_X0Y3', cfg }), 'DCM1 CLKFX_MULTIPLY::2');
  assert.equal(cmtKind({ type: 'DCM', site: 'DCM_X0Y2', cfg }), 'DCM0 CLKFX_MULTIPLY::2');
  assert.equal(cmtKind({ type: 'PLL_ADV', site: 'PLL_ADV_X0Y1', cfg }), 'PLL_ADV CLKFX_MULTIPLY::2');
  const settings = { patterns: { 'DCM1 CLKFX_MULTIPLY::2': { sites: [], bits: ['357,195', '349,7'] } } };
  assert.deepEqual(predictCmtSettings({ type: 'DCM', site: 'DCM_X0Y3', cfg }, settings, 1488), ['1845,195', '1837,7']);
  assert.equal(predictCmtSettings({ type: 'DCM', site: 'DCM_X0Y2', cfg }, settings, 0), null);
  // the window: the CMT's column (frames 327 to 357 of the XC6SLX16's rows; 535 … 565 of the XC6SLX45's) in its row
  const dev = S6_DEVICES.xc6slx16, { device } = s6Device('xc6slx16csg324-3');
  assert.deepEqual(columnOf(dev, CMT_FRAME.xc6slx16), [327, 31]);
  assert.deepEqual(columnOf(S6_DEVICES.xc6slx45, CMT_FRAME.xc6slx45), [535, 31]);
  assert.deepEqual(cmtWindow(device, dev, { tile: 'CMT_DCM_TOP_X11Y40' }, [327, 31]), [2 * 744 + 327, 31]);
  assert.deepEqual(cmtWindow(device, dev, { tile: 'CMT_PLL_BOT_X11Y24' }, [327, 31]), [744 + 327, 31]);
});

test('db: the settings the same at every site of a kind, the two DCMs of a tile apart; an even DCM\'s variants', () => {
  const s = db('xc6slx16-cmt-settings');
  assert.equal(s.column, 327);
  const many = Object.values(s.patterns).filter(p => p.sites.length > 1);
  // each kind measured at both its sites (a DCM's settings, each PLL's: the three outputs' and the one-output designs')
  assert.deepEqual([...new Set(many.map(p => p.sites.join(' ')))].sort(), ['DCM_X0Y0 DCM_X0Y2', 'DCM_X0Y1 DCM_X0Y3', 'PLL_ADV_X0Y0 PLL_ADV_X0Y1']);
  assert.ok(many.filter(p => p.sites[0] === 'PLL_ADV_X0Y0').length >= 7);
  const odd = many.find(p => p.sites.includes('DCM_X0Y1')).bits, even = many.find(p => p.sites.includes('DCM_X0Y0')).bits;
  assert.equal(odd.length, even.length);
  // a few bits the two DCMs share, most apart (not a shift: measured at each)
  assert.ok(odd.filter(x => even.includes(x)).length < 10);
  assert.ok(odd.every(x => /^3(2[7-9]|[34]\d|5[0-7]),\d+$/.test(x)));
  const cmt = db('xc6slx16-cmt');
  assert.equal(cmt.dcmEven.site, 'DCM_X0Y0');
  assert.deepEqual(Object.keys(cmt.dcmEven.variants).sort(), Object.keys(cmt.dcm.variants).sort());
  // CLKFX_MULTIPLY's counter: other bits at the even DCM
  const mo = cmt.dcm.variants.dcmM3, me = cmt.dcmEven.variants.dcmM3;
  assert.ok(mo.set.length && me.set.length);
  assert.notDeepEqual(mo.set, me.set);
});

// Regression (#2025): the settings' patterns held bits of what the measured designs used: a PLL's CLKOUT0 enable (bit 416
// of its CMT frame) and the CLKIN path's PIPs' bits in the CMT frame (a PLL's 604, an even DCM's 596 and 599), which a
// CMT fed from another BUFIO2 (the top half's from the clock pad C10) does not set
test('db: the settings\' patterns without a PLL\'s CLKOUT0 enable nor the CLKIN paths\' PIP bits (#2025)', () => {
  const s = db('xc6slx16-cmt-settings').patterns, pips = db('xc6slx16-pips-cmt').pips;
  assert.deepEqual(PLL_USE_BITS, [416]);
  const pll = Object.entries(s).filter(([k]) => k.startsWith('PLL_ADV'));
  assert.ok(pll.length >= 20);
  for (const [, p] of pll) for (const b of ['357,416', '357,604']) assert.ok(!p.bits.includes(b), b);
  for (const [k, p] of Object.entries(s).filter(([k]) => k.startsWith('DCM0'))) for (const b of ['357,596', '357,599']) assert.ok(!p.bits.includes(b), `${k.slice(0, 30)} ${b}`);
  // those bits are the paths' PIPs': a CMT tile's PIP sets them (their offsets from its region)
  const cmtTile = Object.entries(pips).filter(([k, b]) => /^CMT_(PLL|DCM)_/.test(k) && b.length);
  assert.ok(cmtTile.length > 50);
});

test('db: the XC6SLX45\'s settings in its CMT column, each kind the same at all its sites, no PLL CLKOUT0 enable (#2025)', () => {
  const s = db('xc6slx45-cmt-settings');
  assert.equal(s.column, 535);
  const many = Object.values(s.patterns).filter(p => p.sites.length > 1);
  assert.deepEqual([...new Set(many.map(p => p.sites.join(' ')))].sort(), ['DCM_X0Y0 DCM_X0Y2 DCM_X0Y4 DCM_X0Y6', 'DCM_X0Y1 DCM_X0Y3 DCM_X0Y5 DCM_X0Y7', 'PLL_ADV_X0Y0 PLL_ADV_X0Y1 PLL_ADV_X0Y2 PLL_ADV_X0Y3']);
  const all = Object.values(s.patterns).flatMap(p => p.bits);
  assert.ok(all.length && all.every(x => /^5(3[5-9]|[45]\d|6[0-5]),\d+$/.test(x)));
  for (const [, p] of Object.entries(s.patterns).filter(([k]) => k.startsWith('PLL_ADV'))) for (const b of [`${CMT_FRAME.xc6slx45},416`, `${CMT_FRAME.xc6slx45},604`]) assert.ok(!p.bits.includes(b), b);
});

test('gen-cmtsites6 --outputs: each output of a CMT alone, the pad and the BUFGMUX fixed per site', () => {
  const ds = cmtOutputDesigns('xc6slx16csg324-3');
  assert.equal(ds.length, 4 * DCM_ALL.length + 2 * PLL_ALL.length);
  const y1 = ds.filter(d => d.site === 'DCM_X0Y1');
  assert.deepEqual(y1.map(d => d.outs[0]), DCM_ALL);
  assert.equal(new Set(y1.map(d => `${d.pad} ${d.bufgs}`)).size, 1);
  assert.deepEqual(PLL_ALL.map(([, n]) => n), [4, 8, 16, 4, 8, 16]);
  const one = cmtSiteDesign(ds.find(d => d.name === 'PLL_ADV_X0Y1-CLKOUT5'));
  assert.match(one.v, /wire \[0:0\] o, g;\n {2}reg \[0:0\] r = 1'b0;/);
  assert.match(one.v, /\.CLKOUT5_DIVIDE\(16\)\) cm\(\.CLKIN\(clk\), \.CLKFBIN\(fb\), \.CLKFBOUT\(fb\), \.CLKOUT5\(o\[0\]\), \.RST\(1'b0\)\);/);
  assert.match(one.v, /always @\(posedge g\[0\]\) r\[0\] <= d \^ r\[0\];/);
});

test('gen-cmtprobe6 / ana-cmtprobe6: the PIPs not taken apart, each on a TIEOFF net, one per region per design', () => {
  const { device } = s6Device('xc6slx16csg324-3'), dev = S6_DEVICES.xc6slx16;
  const list = ['CMT_DCM_BOT A -> B', 'CMT_DCM_BOT C -> D', 'BIOI_INNER E -> F', 'NO_SUCH_TYPE G -> H'];
  const probes = cmtProbes(device, dev, list);
  // the one CMT_DCM_BOT tile: its two PIPs in two designs; a type with no tile on the part left out
  assert.equal(probes.length, 2);
  assert.deepEqual(probes[0].CMT_DCM_BOT_X11Y8, { from: 'A', dir: '->', to: 'B' });
  assert.deepEqual(probes[1].CMT_DCM_BOT_X11Y8, { from: 'C', dir: '->', to: 'D' });
  assert.equal(Object.keys(probes[0]).filter(t => /^BIOI_INNER/.test(t)).length, 1);
  for (const p of probes) assert.equal(new Set(Object.keys(p).map(t => gridRegion(device, dev, t).join())).size, Object.keys(p).length);
  assert.ok(intTieoffs(device).every(s => /^TIEOFF_X\d+Y\d+$/.test(s)));
  // a probe's bits by its tile's region
  const [c0, b0] = gridRegion(device, dev, 'CMT_DCM_BOT_X11Y8'), fdri = emptyFdri(dev).slice(), word = c0 * 65 + Math.floor((b0 + 5) / 16);
  fdri[word] ^= 1 << (15 - ((b0 + 5) % 16));
  const r = probeBits(device, dev, fdri, { CMT_DCM_BOT_X11Y8: 'A -> B' });
  assert.deepEqual(r, { pips: { 'CMT_DCM_BOT A -> B': ['0,5'] }, unplaced: [] });
  assert.ok(CONTEXT.test('REG_V_HCLK I_BUFH_RIGHT_SITE0 -> O_BUFH_RIGHT_SITE0'));
  // the database: no REG_V_HCLK PIP (their probed bits are not theirs in a design)
  const probe = db('s6-pips-probe').pips;
  assert.ok(Object.keys(probe).length > 200);
  assert.ok(!Object.keys(probe).some(k => CONTEXT.test(k)));
});
