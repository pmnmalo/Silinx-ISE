// packages/silinx-fpga/research/s6 stage S6-E3 (#1951), without ISE: a CMT's clock paths. The BUFGMUX designs (gen-cmtsites6.mjs --muxes),
// the paths' PIPs dropped one at a time (gen-cmtdrop6.mjs, ana-cmtdrop6.mjs), a BUFGMUX's REGC bit, what a CMT uses and
// its bits outside its settings and PIPs (cmt6.mjs, ana-cmtinput6.mjs), the residual's databases and bits (residual6.mjs),
// and the databases measured (db/xc6slx16-pips-cmt.json, db/xc6slx16-cmt-input.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cmtMuxDesigns, cmtSiteDesign } from '../packages/silinx-fpga/research/s6/gen-cmtsites6.mjs';
import { xdlPips, oneDrops } from '../packages/silinx-fpga/research/s6/gen-cmtdrop6.mjs';
import { unknownPips } from '../packages/silinx-fpga/research/s6/gen-flowdrop6.mjs';
import { loadBitDbS6 } from '../packages/silinx-fpga/src/fpga/s6/bitdb-node.js';
import { dropBits } from '../packages/silinx-fpga/research/s6/ana-cmtdrop6.mjs';
import { cmtInputTable } from '../packages/silinx-fpga/research/s6/ana-cmtinput6.mjs';
import { gridRegion } from '../packages/silinx-fpga/research/s6/ana-pipdrop6.mjs';
import { CMT_REGC, CMT_FRAME, cmtRegcBits, cmtUses, cmtInputBits } from '../packages/silinx-fpga/research/s6/cmt6.mjs';
import { setBits } from '../packages/silinx-fpga/research/s6/residual6.mjs';
import { S6_DEVICES, emptyFdri, FRAME_WORDS } from '../packages/silinx-fpga/src/fpga/s6/bitstream.js';
import { s6Device } from './s6-lib.mjs';

const db = n => JSON.parse(fs.readFileSync(new URL(`../packages/silinx-fpga/bitdb/s6/${n}.json`, import.meta.url), 'utf8'));
const flip = (fdri, f, b) => { fdri[f * FRAME_WORDS + Math.floor(b / 16)] ^= 1 << (15 - (b % 16)); };

// a design as parseXdl gives it: its instances and nets (only what cmt6.mjs reads)
const inst = (name, type, site, tile = '') => ({ name, type, site, tile, placed: true, cfg: [] });
const net = (out, ins) => ({ outpins: [{ inst: out[0], pin: out[1] }], inpins: ins.map(([i, pin]) => ({ inst: i, pin })) });

test('gen-cmtsites6 --muxes: per CMT site eight designs, two outputs on BUFGMUXes k and k + 8, the feedback elsewhere', () => {
  const ds = cmtMuxDesigns('xc6slx16csg324-3');
  assert.equal(ds.length, 6 * 8);
  const muxes = [...new Set(ds.flatMap(d => d.bufgs))].sort();
  assert.equal(muxes.length, 16);
  for (const d of ds) {
    assert.ok(!d.bufgs.includes(d.fb) && /^BUFGMUX_X2Y[23]$/.test(d.fb));
    assert.equal(muxes.indexOf(d.bufgs[1]), muxes.indexOf(d.bufgs[0]) + 8);
  }
  // the bottom half's from the board's clock pad, the top's from C10; the DCM's CLKFX and CLK2X, the PLL's CLKOUT0/1
  assert.deepEqual([...new Set(ds.filter(d => /X0Y[01]$/.test(d.site) && d.kind === 'dcm').map(d => d.pad))], ['V10']);
  assert.deepEqual([...new Set(ds.filter(d => /DCM_X0Y[23]$/.test(d.site)).map(d => d.pad))], ['C10']);
  assert.deepEqual(ds.find(d => d.name === 'DCM_X0Y1-m3').outs, ['CLKFX', 'CLK2X']);
  const v = cmtSiteDesign(ds.find(d => d.name === 'DCM_X0Y1-m3')).v;
  assert.match(v, /\.CLKFX\(o\[0\]\)/);
  assert.match(v, /\.CLK2X\(o\[1\]\)/);
});

test('gen-cmtdrop6: a routed XDL\'s PIPs (not the INT and CLB tiles\'), each new one dropped alone from the first design', () => {
  const xdl = (pips) => `design "d" xc6slx16csg324-3 v3.2 ;\nnet "n" ,\n${pips.map(p => `  pip ${p} ,`).join('\n')}\n  ;\n`;
  const a = xdl(['INT_X1Y1 EL1E0 -> LOGICIN_B24', 'CLKC_X11Y31 CLKC_PLL_L0 -> CLKC_GCLK0', 'REG_V_HCLK_X29Y27 I_BUFH_LEFT_SITE0 -> O_BUFH_LEFT_SITE0', 'CLEXL_X2Y2 A -> B']);
  const b = xdl(['CLKC_X11Y31 CLKC_PLL_L0 -> CLKC_GCLK0', 'CMT_DCM_BOT_X11Y8 DCM1_CLKOUT7 -> DCM_HCLK0']);
  assert.deepEqual(xdlPips(a), [{ tile: 'CLKC_X11Y31', pip: 'CLKC_PLL_L0 -> CLKC_GCLK0', line: 3 }, { tile: 'REG_V_HCLK_X29Y27', pip: 'I_BUFH_LEFT_SITE0 -> O_BUFH_LEFT_SITE0', line: 4 }]);
  // a PIP known (its bits in a database) not dropped; one the first design had not dropped again in the second
  const drops = oneDrops([['a', a], ['b', b]], k => k.startsWith('REG_V_HCLK '));
  assert.deepEqual(drops.map(d => [d.design, d.i, d.tile]), [['a', 0, 'CLKC_X11Y31'], ['b', 0, 'CMT_DCM_BOT_X11Y8']]);
  assert.equal(a.split('\n')[drops[0].line].trim(), 'pip CLKC_X11Y31 CLKC_PLL_L0 -> CLKC_GCLK0 ,');
});

test('ana-cmtdrop6: a drop\'s changed bits as offsets from its tile\'s region (far ones too); the database', () => {
  const { device } = s6Device('xc6slx16csg324-3'), dev = S6_DEVICES.xc6slx16, [c0, b0] = gridRegion(device, dev, 'CLKC_X11Y31');
  const base = emptyFdri(dev).slice(), drop = base.slice();
  flip(drop, c0 + 3, b0 + 7);
  flip(drop, c0 - 5, b0 + 2);
  assert.deepEqual(dropBits(device, dev, base, drop, 'CLKC_X11Y31'), ['-5,2', '3,7']);
  assert.deepEqual(dropBits(device, dev, base, base, 'CLKC_X11Y31'), []);
  const pips = db('xc6slx16-pips-cmt').pips;
  assert.ok(Object.keys(pips).length > 300);
  // the CLKC tile's selection of a CMT's line onto a global clock: its own bit
  assert.ok(pips['CLKC CLKC_PLL_L0 -> CLKC_GCLK0'].length > 0);
});

test('cmt6: a CMT-fed BUFGMUX\'s REGC bit, from the bottom or the top by the CMT\'s half', () => {
  const r = CMT_REGC.xc6slx16;
  assert.equal(r.order.length, 16);
  assert.equal(new Set(r.order).size, 16);
  const design = (tile) => ({ insts: [inst('cm', 'DCM', 'DCM_X0Y1', tile), inst('b0', 'BUFG', 'BUFGMUX_X3Y16'), inst('b1', 'BUFG', 'BUFGMUX_X2Y1'), inst('f', 'SLICEL', 'SLICE_X0Y0')],
    nets: [net(['cm', 'CLKFX'], [['b0', 'I0']]), net(['cm', 'CLK2X'], [['b1', 'I0']]), net(['b0', 'O'], [['f', 'CLK']])] });
  const bot = design('CMT_DCM_BOT_X11Y8'), top = design('CMT_DCM_TOP_X11Y40');
  assert.deepEqual(cmtRegcBits(bot, bot.insts[0], 'xc6slx16', 1840), ['1840,1008', '1840,1023']);
  assert.deepEqual(cmtRegcBits(top, top.insts[0], 'xc6slx16', 1840), ['1840,1024', '1840,1039']);
  // the XC6SLX45's the same (#2025: its 184 CMT designs, every one's REGC bits exact), in its REGC frame
  const atlys = design('CMT_DCM_BOT_X18Y8');
  assert.equal(CMT_REGC.xc6slx45, r);
  assert.deepEqual(cmtRegcBits(atlys, atlys.insts[0], 'xc6slx45', 5104), ['5104,1008', '5104,1023']);
  // a BUFG not driven by the CMT, or a part not measured
  assert.deepEqual(cmtRegcBits(bot, bot.insts[3], 'xc6slx16', 1840), []);
  assert.equal(cmtRegcBits(bot, bot.insts[0], 'xc6slx9', 1840), null);
});

test('cmt6 / ana-cmtinput6: what a CMT uses; its site\'s, outputs\' and BUFIO2\'s bits; the table from leftovers', () => {
  const design = { insts: [inst('cm', 'DCM', 'DCM_X0Y1'), inst('io', 'BUFIO2', 'BUFIO2_X3Y7'), inst('b0', 'BUFG', 'BUFGMUX_X2Y1'), inst('b1', 'BUFG', 'BUFGMUX_X2Y2')],
    nets: [net(['io', 'DIVCLK'], [['cm', 'CLKIN']]), net(['cm', 'CLKFX180'], [['b0', 'I0']]), net(['cm', 'CLK2X'], [['b1', 'I0']]), { outpins: [{ inst: 'cm', pin: 'LOCKED' }], inpins: [] }] };
  // an output with no load is not used; CLKFX180 in CLKFX's group
  assert.deepEqual(cmtUses(design, design.insts[0]), { outputs: ['CLK2X', 'CLKFX'], bufio2: 'BUFIO2_X3Y7' });
  assert.deepEqual(cmtUses({ insts: [design.insts[0]], nets: [] }, design.insts[0]), { outputs: [], bufio2: null });
  const input = { sites: { DCM_X0Y1: { common: ['3,64'], outputs: { CLK2X: ['357,347'], CLKFX: ['357,383'], CLK90: ['357,351'] }, bufio2: { BUFIO2_X3Y7: ['3554,201'], BUFIO2_X1Y6: ['3554,441'] } } } };
  assert.deepEqual([...cmtInputBits(design, design.insts[0], input)].sort(), ['3,64', '3554,201', '357,347', '357,383']);
  assert.equal(cmtInputBits(design, inst('p', 'PLL_ADV', 'PLL_ADV_X0Y0'), input), null);
  // the table: the site's bits every design has; an output's those of every design using it and of none not using it;
  // the BUFIO2's its I/O words' and the CMT frame's not an output's
  const s = (outputs, bufio2, left) => ({ site: 'DCM_X0Y1', outputs, bufio2, left, cmtFrame: 357, iobFrame: 3552 });
  const t = cmtInputTable([
    s(['CLK2X'], 'BUFIO2_X1Y6', ['3,64', '3,99', '357,347', '357,271', '3554,441']),
    s(['CLK90'], 'BUFIO2_X1Y6', ['3,64', '357,351', '357,271', '3554,441']),
    s(['CLK2X', 'CLKFX'], 'BUFIO2_X3Y7', ['3,64', '357,347', '357,383', '3554,201']),
    s(['CLKFX'], 'BUFIO2_X3Y7', ['3,64', '357,383', '3554,201', '3554,999']),
  ]);
  assert.deepEqual(t, { sites: { DCM_X0Y1: { common: ['3,64'], outputs: { CLK2X: ['357,347'], CLK90: ['357,351'], CLKFX: ['357,383'] },
    bufio2: { BUFIO2_X1Y6: ['357,271', '3554,441'], BUFIO2_X3Y7: ['3554,201'] } } } });
});

test('db: the XC6SLX16\'s CMTs\' input table (the bits outside their settings and PIPs), the top half\'s too (#2025)', () => {
  const t = db('xc6slx16-cmt-input');
  assert.deepEqual(Object.keys(t.sites), ['DCM_X0Y0', 'DCM_X0Y1', 'DCM_X0Y2', 'DCM_X0Y3', 'PLL_ADV_X0Y0', 'PLL_ADV_X0Y1']);
  const frame = `${CMT_FRAME.xc6slx16},`;
  for (const site of ['DCM_X0Y0', 'DCM_X0Y1']) {
    const s = t.sites[site];
    // a DCM's six outputs one bit each in its frame, its frequency synthesizer's three; the clock pad's BUFIO2 one I/O word bit
    assert.deepEqual(Object.keys(s.outputs), ['CLK180', 'CLK270', 'CLK2X', 'CLK2X180', 'CLK90', 'CLKDV', 'CLKFX']);
    for (const [o, b] of Object.entries(s.outputs)) { assert.equal(b.length, o === 'CLKFX' ? 3 : 1); assert.ok(b.every(x => x.startsWith(frame))); }
    assert.deepEqual(s.bufio2.BUFIO2_X3Y7, ['3554,201']);
    assert.deepEqual(s.common, ['3,64', '3,66', '3,69', '3,74', '1491,74']);
  }
  // the two DCMs of a tile apart
  assert.notDeepEqual(t.sites.DCM_X0Y0.outputs.CLK2X, t.sites.DCM_X0Y1.outputs.CLK2X);
  // the top half's DCMs (row 2): the bottom's outputs bits in their own row's CMT frame; the board's clock pad C10's
  // BUFIO2_X4Y26 one I/O word bit; the clock spine's bits of the top half
  const row2 = `${CMT_FRAME.xc6slx16 + 2 * S6_DEVICES.xc6slx16.rowFrames},`;
  for (const [top, bot] of [['DCM_X0Y2', 'DCM_X0Y0'], ['DCM_X0Y3', 'DCM_X0Y1']]) {
    const s = t.sites[top];
    assert.deepEqual(s.outputs, Object.fromEntries(Object.entries(t.sites[bot].outputs).map(([o, b]) => [o, b.map(x => x.replace(frame, row2))])));
    assert.deepEqual(s.bufio2.BUFIO2_X4Y26, ['3562,569']);
    assert.deepEqual(s.common, ['3,74', '1491,64', '1491,66', '1491,69', '1491,74']);
  }
  // a PLL's CLKOUT0 enable: bit 416 of its row's CMT frame (rows 1 and 3), not one of its settings
  for (const [site, row] of [['PLL_ADV_X0Y0', 1], ['PLL_ADV_X0Y1', 3]]) assert.deepEqual(t.sites[site].outputs, { CLKOUT0: [`${CMT_FRAME.xc6slx16 + row * S6_DEVICES.xc6slx16.rowFrames},416`] });
});

// Regression (#2025): the CMT paths' PIPs were one database for every device, the XC6SLX16's; a PIP's bits far from its
// tile (in the CMT's column, the REGC frame, the I/O words) are offsets from gridRegion's column 0, so on the XC6SLX45
// they landed in other tiles (an INT_BRAM's, a CLEXL's) and its own were left over
test('db: the CMT paths\' PIPs per device, the XC6SLX45\'s far bits in its own CMT column and I/O words (#2025)', () => {
  const p16 = db('xc6slx16-pips-cmt').pips, p45 = db('xc6slx45-pips-cmt').pips;
  assert.ok(Object.values(p45).filter(b => b.length).length > 500);
  // the CMT column's frame (CMT_FRAME) and its REGC frame (5 minors before) moved with the column; the near bits the same
  const col = { [CMT_FRAME.xc6slx16]: CMT_FRAME.xc6slx45, [CMT_FRAME.xc6slx16 - 5]: CMT_FRAME.xc6slx45 - 5 };
  let moved = 0;
  for (const [k, b] of Object.entries(p45)) {
    if (!p16[k]?.length || !b.length || /^REG_[BT] /.test(k)) continue;
    assert.deepEqual([...b].sort(), p16[k].map(x => { const [f, i] = x.split(','); return `${col[f] ?? f},${i}`; }).sort(), k);
    if (p16[k].some(x => col[x.split(',')[0]])) moved++;
  }
  assert.ok(moved > 30);
  // the REG_B / REG_T tiles' BUFIO2 inputs: bits in the I/O words, at the device's own offsets
  assert.deepEqual(p16['REG_T REGT_CLKPIN6 -> I_BUFIO2_TOP_SITE6'], ['1330,588']);
  assert.deepEqual(p45['REG_T REGT_CLKPIN6 -> I_BUFIO2_TOP_SITE6'], ['3455,636']);
  // the loader reads the part's own: the XC6SLX45's CLKC selection in its REGC frame's column, not the XC6SLX16's
  const clkc = 'CLKC CLKC_PLL_L0 -> CLKC_GCLK0';
  assert.deepEqual(loadBitDbS6('xc6slx45csg324-3').other.pips[clkc], p45[clkc]);
  assert.deepEqual(loadBitDbS6('xc6slx16csg324-3').other.pips[clkc], p16[clkc]);
  assert.notDeepEqual(p45[clkc], p16[clkc]);
});

test('db: the XC6SLX45\'s CMTs\' input table, its eight DCMs and four PLLs (#2025)', () => {
  const t = db('xc6slx45-cmt-input'), dev = S6_DEVICES.xc6slx45, frame = row => `${CMT_FRAME.xc6slx45 + row * dev.rowFrames},`;
  assert.deepEqual(Object.keys(t.sites), [...[0, 1, 2, 3, 4, 5, 6, 7].map(y => `DCM_X0Y${y}`), ...[0, 1, 2, 3].map(y => `PLL_ADV_X0Y${y}`)]);
  for (const [site, row] of [['DCM_X0Y0', 0], ['DCM_X0Y5', 4]]) {
    const s = t.sites[site];
    // a DCM's outputs in its row's CMT frame, CLKFX three bits; no CLK0 (a path's PIP): the paths' bits are the PIPs'
    assert.deepEqual(Object.keys(s.outputs), ['CLK180', 'CLK270', 'CLK2X', 'CLK2X180', 'CLK90', 'CLKDV', 'CLKFX']);
    for (const [o, b] of Object.entries(s.outputs)) { assert.equal(b.length, o === 'CLKFX' ? 3 : 1); assert.ok(b.every(x => x.startsWith(frame(row))), `${site} ${o}`); }
    // each BUFIO2 one I/O word bit
    for (const b of Object.values(s.bufio2)) assert.equal(b.length, 1);
  }
  assert.deepEqual(t.sites.DCM_X0Y0.bufio2, { BUFIO2_X1Y7: ['11395,377'], BUFIO2_X3Y7: ['11395,185'] });
  // a PLL's CLKOUT0 enable: bit 416 of its row's CMT frame
  for (const [site, row] of [['PLL_ADV_X0Y0', 1], ['PLL_ADV_X0Y3', 7]]) assert.deepEqual(t.sites[site].outputs.CLKOUT0, [`${frame(row)}416`]);
});

test('residual6: a bitstream\'s bits set against the empty one, the block RAM\'s frames only when asked', () => {
  const dev = S6_DEVICES.xc6slx16, fdri = emptyFdri(dev).slice(), bram = dev.rows * dev.rowFrames;
  flip(fdri, 3, 64);
  flip(fdri, bram + 1, 5);
  assert.deepEqual([...setBits({ fdri }, dev, false)], ['3,64']);
  assert.deepEqual([...setBits({ fdri }, dev, true)].sort(), ['3,64', `${bram + 1},5`].sort());
});

test('gen-flowdrop6: the PIPs of the open flow\'s designs the databases do not have (not the settings, not the known PIPs)', () => {
  const { device } = s6Device('xc6slx16csg324-3'), dev = S6_DEVICES.xc6slx16, db = loadBitDbS6('xc6slx16csg324-3');
  const xdl = pips => `design "d" xc6slx16csg324-3 v3.2 ,\n  cfg "";\nnet "n" ,\n${pips.map(p => `  pip ${p} ,`).join('\n')}\n  ;\n`;
  const known = 'RIOI D_ILOGIC_SITE -> FABRICOUT_ILOGIC_SITE', unknown = 'RIOI NOSUCH_A -> NOSUCH_B';
  const u = unknownPips([['a', xdl([`RIOI_X28Y5 ${known.split(' ').slice(1).join(' ')}`, `RIOI_X28Y5 ${unknown.split(' ').slice(1).join(' ')}`])]], device, dev, db);
  assert.deepEqual([...u], [unknown]);
});
