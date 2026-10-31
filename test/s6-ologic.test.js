// packages/silinx-fpga/research/s6 stage S6-E7 (#2025), without ISE: an OLOGIC2's output flip-flop. The designs
// (gen-ologic6.mjs), the predictor (src/fpga/s6/bitgen-ologic.js) against the bits ISE set at a few sites, the
// database measured (db/s6-ologic.json) and the top pads' output pin PIP (#2372).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ologicDesigns, ologicDesign } from '../packages/silinx-fpga/research/s6/gen-ologic6.mjs';
import { isOutFF, ologicKey, olHclk, predictOlogic } from '../packages/silinx-fpga/src/fpga/s6/bitgen-ologic.js';
import { predictDesign } from '../packages/silinx-fpga/src/fpga/s6/bitgen.js';
import { loadBitDbS6 } from '../packages/silinx-fpga/src/fpga/s6/bitdb-node.js';
import { gridRegion } from '../packages/silinx-fpga/src/fpga/s6/bitgen-regions.js';
import { parseXdl } from '../packages/silinx-fpga/src/xdl.js';
import { S6_DEVICES } from '../packages/silinx-fpga/src/fpga/s6/bitstream.js';
import { s6Device } from './s6-lib.mjs';

const db = n => JSON.parse(fs.readFileSync(new URL(`../packages/silinx-fpga/bitdb/s6/${n}.json`, import.meta.url), 'utf8'));
const OUTFF = 'CLK0INV::CLK0 D1USED::0 OMUX::OUTFF OUTFFTYPE::FF SRINIT_OQ::0 OCEUSED::#OFF';

/** An XDL design: an OLOGIC2 at site in tile with cfg, its clock net through the pips given, its OQ to the pad by pad. */
function xdl(part, tile, site, { cfg = OUTFF, clock = [], pad = [] } = {}) {
  return `design "d" ${part} v3.2 ,\n  cfg "";\ninst "o" "OLOGIC2",placed ${tile} ${site} ,\n  cfg " ${cfg} " ;\n`
    + `net "clk" ,\n  inpin "o" CLK0 ,\n${clock.map(p => `  pip ${p} ,\n`).join('')}  ;\n`
    + `net "q" ,\n  outpin "o" OQ ,\n${pad.map(p => `  pip ${p} ,\n`).join('')}  ;\n`;
}

test('gen-ologic6: each IOB tile\'s k-th pad in design k, the clock and the data on pads of their own; every third tile\'s first', () => {
  const { sites } = s6Device('xc6slx16csg324-3'), ds = ologicDesigns('xc6slx16csg324-3'), tileOf = new Map([...sites.pads.values()].map(p => [p.name, p.tile]));
  assert.deepEqual(ds.map(d => [d.name, d.outs.length]), [['p0', 88], ['p1', 89], ['p2', 25], ['p3', 25], ['sparse', 30]]);
  for (const d of ds) {
    assert.equal(new Set(d.outs.map(p => tileOf.get(p))).size, d.outs.length, `${d.name}: one pad per IOB tile`);
    assert.ok(!d.outs.includes(d.clk) && !d.outs.includes(d.d) && sites.pads.get(d.clk).bufg.length && sites.pads.get(d.clk).bank === 2);
  }
  // p0 … p3 together: every pad but the clock's tile's and the data input
  const all = ds.slice(0, 4).flatMap(d => d.outs);
  assert.equal(new Set(all).size, all.length);
  assert.equal(all.length, [...sites.pads.values()].filter(p => p.tile !== tileOf.get(ds[0].clk)).length - 1);
  const { v, ucf } = ologicDesign({ clk: 'V9', d: 'A2', outs: ['A3', 'B3'] });
  assert.match(v, /\(\* IOB = "TRUE" \*\) reg \[1:0\] o = 2'b0;/);
  assert.match(v, /r <= \{r\[0:0\], d\}; o <= r;/);
  assert.equal(ucf, 'NET "clk" LOC = "V9" ;\nNET "d" LOC = "A2" ;\nNET "q<0>" LOC = "A3" ;\nNET "q<1>" LOC = "B3" ;\n');
  assert.deepEqual(ologicDesigns('xc6slx45csg324-3').map(d => d.outs.length), [85, 86, 21, 21, 29]);
});

test('bitgen-ologic: an output flip-flop, its key, the HCLK tile of its clock in its column and clock region', () => {
  const part = 'xc6slx16csg324-3', design = parseXdl(xdl(part, 'BIOI_INNER_X23Y1', 'OLOGIC_X17Y3', {
    clock: ['HCLK_CLB_XL_INT_X23Y7 HCLK_GCLK2_INT -> HCLK_GCLK2', 'HCLK_CLB_XL_INT_X22Y7 HCLK_GCLK2_INT -> HCLK_GCLK2', 'HCLK_CLB_XL_INT_X23Y23 HCLK_GCLK2_INT -> HCLK_GCLK2', 'IOI_INT_X23Y1 GCLK2 -> INT_IOI_GFAN0'],
  }));
  const [o] = design.insts;
  assert.ok(isOutFF(o));
  assert.ok(!isOutFF({ type: 'OLOGIC2', cfg: [{ attr: '_ROUTETHROUGH', value: 'D1:OQ' }] }));
  assert.ok(!isOutFF({ type: 'ILOGIC2', cfg: [{ attr: 'OMUX', value: 'OUTFF' }] }));
  assert.equal(ologicKey(o), 'BIOI_INNER 1');
  assert.equal(ologicKey({ tile: 'LIOI_X0Y58', site: 'OLOGIC_X0Y54' }), 'LIOI 0');
  // the same X and clock region only (Y 0 to 15: not X22, not Y23)
  assert.deepEqual(olHclk(design, o), ['HCLK_CLB_XL_INT_X23Y7']);
  assert.deepEqual(olHclk(design, { ...o, name: 'none' }), []);
});

test('bitgen-ologic: the bits ISE set at a bottom, a top, a left and a right site (XC6SLX16, XC6SLX45)', () => {
  const ol = db('s6-ologic');
  const bits = (part, tile, site, hclk, cfg) => {
    const { device } = s6Device(part), design = parseXdl(xdl(part, tile, site, { cfg, clock: hclk ? [`${hclk} HCLK_GCLK15_INT -> HCLK_GCLK15`] : [] }));
    const p = predictOlogic(design, device, S6_DEVICES[part.match(/^xc6slx\d+/)[0]], ol);
    return [[...p.bits].sort(), p.unknown];
  };
  // ISE's bitstreams: an older design's register (#727, not one of those measured), then the measured designs'
  assert.deepEqual(bits('xc6slx16csg324-3', 'BIOI_INNER_X23Y1', 'OLOGIC_X17Y3', 'HCLK_CLB_XL_INT_X23Y7'), [['700,526', '708,944', '709,941'], []]);
  assert.deepEqual(bits('xc6slx16csg324-3', 'TIOI_OUTER_X13Y63', 'OLOGIC_X10Y63', 'HCLK_CLB_XL_INT_X13Y55'), [['2639,526', '2647,32', '2648,29'], []]);
  assert.deepEqual(bits('xc6slx16csg324-3', 'LIOI_X0Y56', 'OLOGIC_X0Y53', 'HCLK_IOIL_INT_X0Y55'), [['2254,526', '2263,477', '2265,480'], []]);
  assert.deepEqual(bits('xc6slx45csg324-3', 'RIOI_X37Y125', 'OLOGIC_X27Y115', 'HCLK_IOIR_INT_FOLD_X37Y119'), [['9074,526', '9083,157', '9085,160'], []]);
  // no HCLK tile on its clock: its tile's bits only; a setting not measured, a tile type not measured: unknown
  assert.deepEqual(bits('xc6slx16csg324-3', 'BIOI_INNER_X23Y1', 'OLOGIC_X17Y3', null)[0], ['708,944', '709,941']);
  assert.deepEqual(bits('xc6slx16csg324-3', 'BIOI_INNER_X23Y1', 'OLOGIC_X17Y3', null, OUTFF.replace('SRINIT_OQ::0', 'SRINIT_OQ::1'))[1], ['OLOGIC2 OLOGIC_X17Y3 (an output flip-flop\'s settings not measured)']);
  assert.deepEqual(bits('xc6slx16csg324-3', 'BIOI_INNER_X23Y1', 'OLOGIC_X17Y3', null, `${OUTFF} OSRUSED::0`)[1], ['OLOGIC2 OLOGIC_X17Y3 (an output flip-flop\'s settings not measured)']);
  const { device } = s6Device('xc6slx16csg324-3'), one = parseXdl(xdl('xc6slx16csg324-3', 'BIOI_INNER_X23Y1', 'OLOGIC_X17Y3', { clock: ['HCLK_CLB_XL_INT_X23Y7 HCLK_GCLK2_INT -> HCLK_GCLK2'] }));
  assert.deepEqual(predictOlogic(one, device, S6_DEVICES.xc6slx16, { sites: {}, hclk: {} }).unknown, ['OLOGIC2 OLOGIC_X17Y3 (its tile type not measured)']);
  assert.deepEqual(predictOlogic(one, device, S6_DEVICES.xc6slx16, { ...ol, hclk: {} }).unknown, ['HCLK_CLB_XL_INT (an I/O clock\'s bit not measured)']);
});

test('db: an output flip-flop\'s two bits by the IOI tile\'s layout and site, its clock row\'s bit by HCLK tile type (#2025)', () => {
  const { sites, hclk } = db('s6-ologic');
  // the top and bottom tiles alike, the left and right alike; the master (odd Y) and the slave apart
  for (const t of ['TIOI_OUTER', 'TIOI_INNER', 'BIOI_OUTER', 'BIOI_INNER']) assert.deepEqual([sites[`${t} 1`], sites[`${t} 0`]], [['26,32', '27,29'], ['26,35', '27,48']], t);
  for (const t of ['LIOI', 'RIOI']) assert.deepEqual([sites[`${t} 1`], sites[`${t} 0`]], [['27,29', '29,32'], ['27,48', '29,35']], t);
  // every tile type with an OLOGIC2 on a bonded pad (the XC6SLX45's LIOI_BRK and RIOI_BRK tiles have none in the csg324)
  const types = new Set();
  for (const part of ['xc6slx16csg324-3', 'xc6slx45csg324-3']) {
    const { device, sites: s6 } = s6Device(part), padAt = new Set([...s6.pads.values()].map(p => p.tile.match(/X\d+Y\d+$/)[0]));
    for (const s of device.sites()) {
      if (s.type !== 'OLOGIC2' || /_UNUSED_/.test(s.tileName)) continue;
      if (/_BRK_/.test(s.tileName)) assert.ok(!padAt.has(s.tileName.match(/X\d+Y\d+$/)[0]), s.tileName);
      else types.add(s.tileName.replace(/_X\d+Y\d+$/, ''));
    }
  }
  assert.deepEqual(Object.keys(sites).map(k => k.split(' ')[0]).filter((t, i, a) => a.indexOf(t) === i).sort(), [...types].sort());
  assert.deepEqual(hclk, { HCLK_CLB_XL_INT: ['18,14'], HCLK_CLB_XL_INT_FOLD: ['18,14'], HCLK_CLB_XM_INT: ['17,14'], HCLK_CLB_XM_INT_FOLD: ['17,14'],
    HCLK_IOIL_INT: ['18,14'], HCLK_IOIL_INT_FOLD: ['18,14'], HCLK_IOIR_INT: ['18,14'], HCLK_IOIR_INT_FOLD: ['18,14'] });
  // the clock paths' PIPs to the OLOGIC2 measured first: the left tiles' (s6-pips-flow)
  const flow = db('s6-pips-flow').pips;
  assert.deepEqual(flow['LIOI IOI_CLKDIST_CLK0_OLOGIC_S -> CLK0_OLOGIC_SITE_S'], ['22,11', '24,18', '29,27']);
  assert.deepEqual(flow['HCLK_IOIL_INT HCLK_GCLK15_INT -> HCLK_GCLK15'], ['15,14']);
});

test('predictDesign: an output register in a top pad, no route-through bit from its pad\'s pin PIP (#2372)', () => {
  const part = 'xc6slx16csg324-3', { device } = s6Device(part), dev = S6_DEVICES.xc6slx16, all = loadBitDbS6(part);
  const tile = 'TIOI_OUTER_X13Y63', [c0, b0] = gridRegion(device, dev, tile), at = (m, b) => `${c0 + m},${b0 + b}`;
  const design = parseXdl(xdl(part, tile, 'OLOGIC_X10Y63', { pad: ['TIOB_X13Y63 TIOB_O0 -> TIOB_O0_PINW', `${tile} OQ_OLOGIC_SITE -> TIOI_OUTER_O0`] }));
  const { bits, unknown } = predictDesign(design, device, dev, all);
  assert.deepEqual([...bits].filter(x => { const [f, b] = x.split(',').map(Number); return f >= c0 && f < c0 + 30 && b >= b0 && b < b0 + 64; }).sort(), [at(26, 32), at(27, 29)]);
  assert.deepEqual([...unknown], []);
  assert.deepEqual(all.other.pips['TIOB TIOB_O0 -> TIOB_O0_PINW'], []);
  // the route-through (no register) keeps its three bits
  const rt = parseXdl(xdl(part, tile, 'OLOGIC_X10Y63', { cfg: '_NO_USER_LOGIC:: _ROUTETHROUGH:D1:OQ', pad: [`${tile} D1_OLOGIC_SITE -> OQ_OLOGIC_SITE`, 'TIOB_X13Y63 TIOB_O0 -> TIOB_O0_PINW'] }));
  assert.ok([at(26, 32), at(27, 29), at(28, 49)].every(x => predictDesign(rt, device, dev, all).bits.has(x)));
});
