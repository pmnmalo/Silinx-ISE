// research/s6 stage S6-E2 (#1951), without ISE: the designs of every CMT site (gen-cmtsites6.mjs), an even DCM's
// (gen-dcm6.mjs --dcm), the settings' key and their prediction at any site (cmt6.mjs) and the database measured
// (db/xc6slx16-cmt-settings.json, xc6slx16-cmt.json's dcmEven).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cmtSiteDesigns, cmtSiteDesign } from '../research/s6/gen-cmtsites6.mjs';
import { cmtKind, predictCmtSettings, CMT_FRAME } from '../research/s6/cmt6.mjs';
import { cmtWindow } from '../research/s6/ana-cmtsites6.mjs';
import { columnOf } from '../research/s6/ana-slice6.mjs';
import { S6_DEVICES } from '../core/fpga/s6/bitstream.js';
import { s6Device } from './s6-lib.mjs';

const db = n => JSON.parse(fs.readFileSync(new URL(`../research/s6/db/${n}.json`, import.meta.url), 'utf8'));

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
  // the three outputs' designs: each kind measured at both its sites, the same bits
  assert.deepEqual(many.map(p => p.sites.join(' ')).sort(), ['DCM_X0Y0 DCM_X0Y2', 'DCM_X0Y1 DCM_X0Y3', 'PLL_ADV_X0Y0 PLL_ADV_X0Y1']);
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
