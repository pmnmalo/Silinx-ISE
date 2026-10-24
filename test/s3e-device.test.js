// research/s3e-device: measuring the device description black-box (no device report, no ISE here):
// the observation of ISE-routed nets, the join rules, the xdl2ncd probes, the DRC join tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { wireFamily, tileXY, observeNet, observeDesign, resolveAmbiguous, intersectAmbiguous, joinRule, blockRamOutputJoins } from '../research/s3e-device/observe.mjs';
import { switchGrid, gridRule, applyRules, closeRules, segmentRules, nodesOf } from '../research/s3e-device/model.mjs';
import { measuredLines, packMeasured } from '../research/s3e-device/build.mjs';
import { pinCensus, renamePads } from '../research/s3e-device/pins.mjs';
import { ram, multCascade, dcmPins, iobDdr, iobClk2, devicePads, observedPads } from '../research/s3e-device/gen-obspins.mjs';
import { clockDesign } from '../research/s3e-device/gen-obsclk.mjs';
import { loadDevice, PIP_BIDI } from '../core/fpga/device.js';
import { probeXdl, probeFirstLine, parseProbeLog, sortPips, sortSites } from '../research/s3e-device/probe.mjs';
import { joinTestDesigns, parseJoinTests, testSources } from '../research/s3e-device/hypotheses.mjs';
import { rng, clbSlices, observeXdl } from '../research/s3e-device/gen-observe.mjs';
import { tileCandidates, siteCandidates, censusCandidates, ioCandidates } from '../research/s3e-device/candidates.mjs';
import { bram, mult, pads, inputs } from '../research/s3e-device/gen-obshdl.mjs';
import { loadDeviceCache } from '../core/fpga/device-node.js';
import { deviceSites } from '../core/fpga/place.js';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { parseXdl } from '../core/xdl.js';

test('wireFamily: doubles, hexes, long lines, output multiplexers, carry, clock, block-RAM pins', () => {
  assert.equal(wireFamily('E2BEG0'), 'seg:E2');
  assert.equal(wireFamily('E2END_S3'), 'seg:E2');
  assert.equal(wireFamily('N6MID1'), 'seg:N6');
  assert.equal(wireFamily('GCLKH_N6MID1'), 'seg:N6');      // a tile-type prefix
  assert.equal(wireFamily('W6D7'), 'seg:W6');
  assert.equal(wireFamily('LH18'), 'long:H');
  assert.equal(wireFamily('BRAMSITE20_LH20'), 'long:H');
  assert.equal(wireFamily('OMUX_NE12'), 'omux');
  assert.equal(wireFamily('NW_N'), 'omux');
  assert.equal(wireFamily('COUT_N1'), 'carry');
  assert.equal(wireFamily('CIN0'), 'carry');
  assert.equal(wireFamily('GCLKH_GCLK_UP4'), 'gclk');
  assert.equal(wireFamily('BRAM_DIA_B0_INT'), 'pin:BRAM_DIA_B0');
  assert.equal(wireFamily('BRAM_DIA_B0'), 'pin:BRAM_DIA_B0');
  for (const w of ['X0', 'F1_B_PINWIRE0', 'BX0', 'VCC_PINWIRE', 'IOIS_Y2', 'SR3', 'CLKT_GCLK_PINWIRE1']) assert.equal(wireFamily(w), null, w);
  assert.deepEqual(tileXY('CLB_X10Y7'), { prefix: 'CLB', x: 10, y: 7 });
  assert.deepEqual(tileXY('BRAM0_SMALL_BRK_X3Y25'), { prefix: 'BRAM0_SMALL_BRK', x: 3, y: 25 });
  assert.equal(tileXY('nope'), null);
});

// a net as ISE writes it: PIPs sorted by tile and wire, not as a path
const insts = new Map([
  ['a', { name: 'a', tile: 'CLB_X10Y10', site: 'SLICE_X18Y18' }],
  ['b', { name: 'b', tile: 'CLB_X12Y10', site: 'SLICE_X22Y18' }],
  ['c', { name: 'c', tile: 'CLB_X11Y10', site: 'SLICE_X20Y18' }],
]);
const net = {
  name: 'n', outpins: [{ inst: 'a', pin: 'X' }], inpins: [{ inst: 'b', pin: 'F1' }, { inst: 'c', pin: 'G2' }],
  pips: [
    { tile: 'CLB_X10Y10', from: 'OMUX3', dir: '->', to: 'E2BEG1' },
    { tile: 'CLB_X10Y10', from: 'X0', dir: '->', to: 'OMUX3' },
    { tile: 'CLB_X11Y10', from: 'E2MID1', dir: '->', to: 'G2_B0' },
    { tile: 'CLB_X11Y10', from: 'G2_B0', dir: '->', to: 'G2_B_PINWIRE0' },
    { tile: 'CLB_X12Y10', from: 'E2END1', dir: '->', to: 'F1_B0' },
    { tile: 'CLB_X12Y10', from: 'F1_B0', dir: '->', to: 'F1_B_PINWIRE0' },
  ],
};

test('observeNet: joins between tiles, the source and sink pin wires', () => {
  const r = observeNet(net, insts);
  assert.deepEqual(r.joins, [['CLB_X10Y10/E2BEG1', 'CLB_X11Y10/E2MID1'], ['CLB_X10Y10/E2BEG1', 'CLB_X12Y10/E2END1']]);
  assert.deepEqual(r.pins, [
    { site: 'SLICE_X18Y18', pin: 'X', dir: 'o', tile: 'CLB_X10Y10', wire: 'X0' },
    { site: 'SLICE_X22Y18', pin: 'F1', dir: 'i', tile: 'CLB_X12Y10', wire: 'F1_B_PINWIRE0' },
    { site: 'SLICE_X20Y18', pin: 'G2', dir: 'i', tile: 'CLB_X11Y10', wire: 'G2_B_PINWIRE0' },
  ]);
  assert.deepEqual(r.ambiguous, []);
  assert.deepEqual(r.unexplained, []);
});

test('observeNet: two candidates of the same family are ambiguous; a bidirectional PIP is turned round', () => {
  const n2 = {
    name: 'n2', outpins: [{ inst: 'a', pin: 'X' }], inpins: [],
    pips: [
      { tile: 'CLB_X10Y10', from: 'X0', dir: '->', to: 'OMUX3' },
      { tile: 'CLB_X10Y10', from: 'OMUX3', dir: '->', to: 'E2BEG1' },
      { tile: 'CLB_X10Y10', from: 'OMUX3', dir: '->', to: 'E2BEG3' },
      { tile: 'CLB_X11Y10', from: 'E2MID1', dir: '->', to: 'BX0' },
      { tile: 'CLB_X11Y10', from: 'BY1', dir: '=-', to: 'BX0' },   // written BY1 =- BX0, carries BX0 to BY1
    ],
  };
  const r = observeNet(n2, insts);
  assert.deepEqual(r.joins, []);
  assert.deepEqual(r.ambiguous, [{ from: 'CLB_X11Y10/E2MID1', candidates: ['CLB_X10Y10/E2BEG1', 'CLB_X10Y10/E2BEG3'] }]);
  assert.deepEqual(r.unexplained, []);
  // the join seen elsewhere at the same offset decides
  const known = [['CLB_X3Y3/E2BEG1', 'CLB_X4Y3/E2MID1']];
  assert.equal(joinRule(...known[0]), 'CLB/E2BEG1 1,0 CLB/E2MID1');
  assert.deepEqual(resolveAmbiguous(r.ambiguous, known), { joins: [['CLB_X10Y10/E2BEG1', 'CLB_X11Y10/E2MID1']], ambiguous: [] });
});

test('observeDesign: sites and PIPs of a parsed XDL design', () => {
  const xdl = `design "d" xc3s250ecp132-4 v3.2 ;
inst "a" "SLICEL", placed CLB_X10Y10 SLICE_X18Y18 , cfg " " ;
inst "b" "SLICEL", placed CLB_X12Y10 SLICE_X22Y18 , cfg " " ;
net "n" , outpin "a" X , inpin "b" F1 ,
  pip CLB_X10Y10 X0 -> OMUX3 , pip CLB_X10Y10 OMUX3 -> E2BEG1 ,
  pip CLB_X12Y10 E2END1 -> F1_B0 , pip CLB_X12Y10 F1_B0 -> F1_B_PINWIRE0 , ;
`;
  const o = observeDesign(parseXdl(xdl));
  assert.deepEqual(o.sites, [{ site: 'SLICE_X18Y18', tile: 'CLB_X10Y10', type: 'SLICEL' }, { site: 'SLICE_X22Y18', tile: 'CLB_X12Y10', type: 'SLICEL' }]);
  assert.equal(o.pips.length, 4);
  assert.deepEqual(o.joins, [['CLB_X10Y10/E2BEG1', 'CLB_X12Y10/E2END1']]);
  assert.equal(o.pins.length, 2);
});

test('switch-box grid: offsets counted in switch boxes of the row, then of the column', () => {
  // a row with a block-RAM column (one switch box at X3, none at X4-X6), a row of CLBs above it,
  // and a column interrupted (no switch box at X7Y2)
  const tiles = ['CLB_X1Y1', 'CLB_X2Y1', 'BRAM0_SMALL_X3Y1', 'CLB_X7Y1', 'CLB_X8Y1',
    'CLB_X1Y2', 'CLB_X2Y2', 'CLB_X3Y2', 'CLB_X4Y2', 'CLB_X8Y2', 'CLB_X7Y3'];
  const g = switchGrid(tiles);
  assert.deepEqual(g.rowXs.get(1), [1, 2, 3, 7, 8]);
  assert.deepEqual(g.colYs.get(7), [1, 3]);
  assert.equal(gridRule('CLB_X2Y1/E2BEG0', 'CLB_X7Y1/E2END0', g), 'E2BEG0 2,0 E2END0');
  assert.equal(gridRule('CLB_X7Y1/N2BEG0', 'CLB_X7Y3/N2MID0', g), 'N2BEG0 0,1 N2MID0');
  assert.equal(gridRule('CLB_X2Y1/E2BEG0', 'CLB_X4Y2/E2END0', g), null);   // no switch box at X4 in row 1
  assert.throws(() => switchGrid(['CLB_X1Y1', 'LIOIS_X1Y1']), /two switch boxes at X1Y1/);
  const wires = t => new Set(t.startsWith('BRAM') ? ['E2MID0'] : ['E2BEG0', 'E2MID0', 'E2END0']);
  const got = applyRules(['E2BEG0 1,0 E2MID0', 'E2BEG0 2,0 E2END0'], g, wires).map(j => j.join(' ')).sort();
  // (CLB_X1Y1's E2END0 would be in BRAM0_SMALL_X3Y1, whose wires here have no E2END0)
  assert.deepEqual(got, [
    'CLB_X1Y1/E2BEG0 CLB_X2Y1/E2MID0',
    'CLB_X1Y2/E2BEG0 CLB_X2Y2/E2MID0', 'CLB_X1Y2/E2BEG0 CLB_X3Y2/E2END0',
    'CLB_X2Y1/E2BEG0 BRAM0_SMALL_X3Y1/E2MID0', 'CLB_X2Y1/E2BEG0 CLB_X7Y1/E2END0',
    'CLB_X2Y2/E2BEG0 CLB_X3Y2/E2MID0', 'CLB_X2Y2/E2BEG0 CLB_X4Y2/E2END0',
    'CLB_X3Y2/E2BEG0 CLB_X4Y2/E2MID0', 'CLB_X3Y2/E2BEG0 CLB_X8Y2/E2END0',
    'CLB_X4Y2/E2BEG0 CLB_X8Y2/E2MID0',
    'CLB_X7Y1/E2BEG0 CLB_X8Y1/E2MID0',
  ].sort());
  const nodes = nodesOf([['a/1', 'b/1'], ['b/1', 'c/1'], ['d/1', 'e/1']]);
  assert.equal(nodes.get('c/1'), 'a/1');
  assert.equal(nodes.get('e/1'), 'd/1');
});

test('closeRules: the wires one wire is joined to are joined to each other', () => {
  assert.deepEqual([...closeRules(['E2BEG0 1,0 E2MID0', 'E2BEG0 2,0 E2END0'])].sort(), [
    'E2BEG0 1,0 E2MID0', 'E2BEG0 2,0 E2END0', 'E2END0 -1,0 E2MID0', 'E2END0 -2,0 E2BEG0',
    'E2MID0 -1,0 E2BEG0', 'E2MID0 1,0 E2END0',
  ]);
});

test('segmentRules: the taps of doubles and hexes from their names', () => {
  const r = [...segmentRules([3])];
  assert.equal(r.length, 4 * (4 + 8));   // per direction: a double's 2 taps + END_S / END_N, a hex's 6 + 2
  for (const x of ['E2BEG3 1,0 E2MID3', 'E2BEG3 2,0 E2END3', 'E2BEG3 2,-1 E2END_S3', 'W2BEG3 -2,1 W2END_N3',
    'N6BEG3 0,1 N6A3', 'N6BEG3 0,3 N6MID3', 'N6BEG3 0,6 N6END3', 'N6BEG3 0,7 N6END_N3', 'S6BEG3 0,-5 S6D3']) assert.ok(r.includes(x), x);
});

test('packMeasured: measurements in the packed format of the shipped graphs', () => {
  const type = {
    wires: ['E2BEG0', 'E2END0', 'F1_B0', 'F1_B_PINWIRE0', 'OMUX0', 'X0'],
    pips: [['X0', 'OMUX0'], ['OMUX0', 'E2BEG0'], ['E2END0', 'F1_B0'], ['F1_B0', 'F1_B_PINWIRE0'], ['F1_B0', 'X0', PIP_BIDI]],
    sites: [{ type: 'SLICEL', pins: [['F1', 'i', 'F1_B_PINWIRE0'], ['X', 'o', 'X0']] }],
  };
  const m = {
    part: 'xc3s250ecp132-4', types: { CENTER_SMALL: type },
    tiles: [{ name: 'CLB_X1Y1', type: 'CENTER_SMALL', sites: [['SLICE_X0Y0', 0]] }, { name: 'CLB_X3Y1', type: 'CENTER_SMALL', sites: [['SLICE_X4Y0', 0]] }],
    joins: [['CLB_X1Y1/E2BEG0', 'CLB_X3Y1/E2END0']],
  };
  const lines = [...measuredLines(m)];
  assert.equal(lines[0], '(xdl_resource_report v0.2 xc3s250ecp132-4 spartan3e');
  assert.ok(lines.includes('(conn CLB_X3Y1 E2END0)') && lines.includes('(pip CLB_X1Y1 F1_B0 =- X0)'));
  const p = packMeasured(m);
  assert.deepEqual(p.counts, { tiles: 2, wires: 12, pips: 10, nodes: 11, templates: 1 });
  const d = loadDevice(JSON.parse(JSON.stringify(p)));
  assert.equal(d.node('CLB_X1Y1', 'E2BEG0'), d.node('CLB_X3Y1', 'E2END0'));
  assert.notEqual(d.node('CLB_X1Y1', 'E2END0'), d.node('CLB_X3Y1', 'E2BEG0'));
  assert.deepEqual(d.sitePin('SLICE_X4Y0', 'F1'), { tile: 1, tileName: 'CLB_X3Y1', wire: 'F1_B_PINWIRE0', wireId: d.wireId(1, 'F1_B_PINWIRE0'), dir: 'i' });
  assert.equal(d.site('SLICE_X0Y0').type, 'SLICEL');
  assert.ok(d.pipIsBidi(0, d.findPip(0, 'F1_B0', 'X0')));
  // rows from the top, columns by tile X
  assert.deepEqual([d.tileRow[0], d.tileCol[0], d.tileRow[1], d.tileCol[1]], [0, 1, 0, 3]);
  assert.throws(() => packMeasured({ ...m, tiles: [{ name: 'CLB_X1Y1', type: 'NOPE', sites: [] }] }), /no measured type NOPE for CLB_X1Y1/);
});

test('probe designs: candidates, their lines, and what xdl -xdl2ncd says', () => {
  const pips = [{ tile: 'CLB_X1Y1', from: 'W2END4', to: 'W2BEG4' }, { tile: 'CLB_X3Y5', from: 'W2END4', to: 'W2BEG4' }, { tile: 'CLB_X1Y2', from: 'W2END4', to: 'W2BEG4' }];
  const sites = [{ site: 'SLICE_X0Y0', type: 'SLICEL' }, { site: 'SLICE_X99Y9', type: 'SLICEL' }];
  const text = probeXdl('xc3s250ecp132-4', { pips, sites });
  const lines = text.split('\n');
  const first = probeFirstLine({ sites });
  assert.equal(lines[first - 1], '  pip CLB_X1Y1 W2END4 -> W2BEG4 ,');
  assert.equal(lines[2 + 2 * 2 - 1], 'inst "p1" "SLICEL", placed TILE SLICE_X99Y9 ,');
  assert.match(lines[0], /^design "probe" xc3s250ecp132-4 v3\.2 ;$/);
  assert.ok(parseXdl(text).nets[0].pips.length === 3);
  const log = `ERROR:XDL:190 - Placement site SLICE_X99Y9 for instance p1 of type SLICEL around line ${2 + 2 * 2} of file p.xdl is invalid for device.
ERROR:XDL:198 - Could not find arc in tile CLB_X3Y5 with connecting wires W2END4 and W2BEG4 around line ${first + 1} of file p.xdl.
INFO:XDL:186 - 2 error(s) were found in XDL file. The NCD file cannot be created.`;
  const p = parseProbeLog(log);
  assert.deepEqual([...p.badArcs], ['CLB_X3Y5 W2END4 W2BEG4']);
  assert.deepEqual([...p.badSites], ['SLICE_X99Y9']);
  assert.equal(p.stoppedAtLine, null);
  assert.deepEqual(sortPips(pips, first, p), { yes: [pips[0], pips[2]], no: [pips[1]], again: [] });
  assert.deepEqual(sortSites(sites, p), { yes: [sites[0]], no: [sites[1]], again: [] });
  // stopped after 20 errors: what comes after the last error is asked again
  const stopped = parseProbeLog(`ERROR:XDL:198 - Could not find arc in tile CLB_X3Y5 with connecting wires W2END4 and W2BEG4 around line ${first + 1} of file p.xdl.
INFO:XDL:185 - XDL file processing stopped after 20 errors were found.  The NCD file cannot be created.`);
  assert.equal(stopped.stoppedAtLine, first + 1);
  assert.deepEqual(sortPips(pips, first, stopped), { yes: [pips[0]], no: [pips[1]], again: [pips[2]] });
  // a sentinel PIP after the candidates; a fatal error of xdl's own: answered up to its last error,
  // or all of them when the sentinel's error is there
  const st = probeXdl('xc3s250ecp132-4', { pips, sites, sentinel: true }).split('\n');
  assert.equal(st[first + pips.length - 1], '  pip CLB_X1Y1 PROBE_END -> PROBE_END ,');
  const fatal = 'FATAL_ERROR:XCad:XCad_RMed.c:399:1.101 - UNEXPECTED RUG CREATION PROBLEM FOR NETWORK:probe';
  const arc = line => `ERROR:XDL:198 - Could not find arc in tile CLB_X3Y5 with connecting wires W2END4 and W2BEG4 around line ${line} of file p.xdl.`;
  const f1 = parseProbeLog(`${arc(first + 1)}\n${fatal}`, { sentinelLine: first + 3 });
  assert.equal(f1.fatal, true);
  assert.deepEqual(sortPips(pips, first, f1), { yes: [pips[0]], no: [pips[1]], again: [pips[2]] });
  assert.deepEqual(sortPips(pips, first, parseProbeLog(fatal, { sentinelLine: first + 3 })), { yes: [], no: [], again: pips });
  const f2 = parseProbeLog(`${arc(first + 1)}\n${arc(first + 3).replace('W2END4 and W2BEG4', 'PROBE_END and PROBE_END')}\n${fatal}`, { sentinelLine: first + 3 });
  assert.deepEqual(sortPips(pips, first, f2), { yes: [pips[0], pips[2]], no: [pips[1]], again: [] });
});

test('join tests: one net per hypothesis, from a slice output through the tile to the tested wire', () => {
  const pipsOf = () => [['X0', 'OMUX3'], ['OMUX3', 'E2BEG1'], ['Y0', 'OMUX5'], ['OMUX5', 'N2BEG1'], ['E2MID1', 'G2_B0'], ['N2MID1', 'F1_B0']];
  const slicesOf = t => t === 'CLB_X10Y10' ? [{ site: 'SLICE_X18Y18', pos: 0 }] : [];
  const pinWire = (pos, pin) => `${pin}${pos}`;
  const joins = [['CLB_X10Y10/E2BEG1', 'CLB_X11Y10/E2MID1'], ['CLB_X11Y10/N2MID1', 'CLB_X10Y10/N2BEG1'], ['CLB_X12Y10/E2MID1', 'CLB_X13Y10/E2BEG1']];
  const r = joinTestDesigns({ part: 'xc3s250ecp132-4', joins, slicesOf, pinWire, pipsOf });
  assert.deepEqual(r.untestable, [joins[2]]);   // no slice in either tile drives it
  assert.equal(r.designs.length, 1);
  assert.deepEqual(r.designs[0].tests, [{ net: 'h0', join: joins[0] }, { net: 'h1', join: joins[1] }]);
  const d = parseXdl(r.designs[0].xdl);
  assert.deepEqual(d.nets[0].pips.map(p => `${p.tile} ${p.from} ${p.to}`), ['CLB_X10Y10 X0 OMUX3', 'CLB_X10Y10 OMUX3 E2BEG1', 'CLB_X11Y10 E2MID1 G2_B0']);
  assert.deepEqual(d.nets[1].outpins, [{ inst: 's_SLICE_X18Y18', pin: 'Y' }]);
  assert.deepEqual(d.nets[1].pips.map(p => `${p.tile} ${p.from} ${p.to}`), ['CLB_X10Y10 Y0 OMUX5', 'CLB_X10Y10 OMUX5 N2BEG1', 'CLB_X11Y10 N2MID1 F1_B0']);
  // a second hypothesis on the same source pin waits for the next design
  const r2 = joinTestDesigns({ part: 'xc3s250ecp132-4', joins: [joins[0], ['CLB_X10Y10/E2BEG1', 'CLB_X12Y10/E2MID1']], slicesOf, pinWire, pipsOf: () => [...pipsOf(), ['E2MID1', 'F2_B0']] });
  assert.equal(r2.designs.length, 2);
});

test('join tests: a wire only an I/O or block-RAM site drives, tested from that site (an IOB\'s input, a block RAM\'s output) (#3)', () => {
  // the I/O tile's OMUX0 and E2BEG0 are driven only from its IOB's I (IOIS_I0); the block-RAM tile's E2BEG1 only
  // from the block RAM's DOA3: no slice reaches them, so the joins out of them were untestable (step 1's 3388)
  const pips = {
    LIOIS_X0Y10: [['IOIS_I0', 'OMUX0'], ['OMUX0', 'E2BEG0']],
    BRAM0_SMALL_X7Y10: [['BRAM_DOA3', 'OMUX1'], ['OMUX1', 'E2BEG1']],
    CLB_X1Y10: [['E2MID0', 'F1_B0']], CLB_X8Y10: [['E2MID1', 'G3_B0']],
  };
  const pipsOf = t => pips[t] || [];
  const slicesOf = () => [];
  const pinWire = (pos, pin) => `${pin}${pos}`;
  const joins = [['LIOIS_X0Y10/E2BEG0', 'CLB_X1Y10/E2MID0'], ['BRAM0_SMALL_X7Y10/E2BEG1', 'CLB_X8Y10/E2MID1']];
  const part = 'xc3s250ecp132-4';
  assert.deepEqual(joinTestDesigns({ part, joins, slicesOf, pinWire, pipsOf }).untestable, joins);
  const src = { LIOIS_X0Y10: [{ site: 'D2', type: 'IOB', o: 'I', wire: 'IOIS_I0' }], BRAM0_SMALL_X7Y10: [{ site: 'RAMB16_X0Y1', type: 'RAMB16', o: 'DOA3', wire: 'BRAM_DOA3' }] };
  const r = joinTestDesigns({ part, joins, slicesOf, pinWire, pipsOf, sourcesOf: t => src[t] || [] });
  assert.deepEqual(r.untestable, []);
  assert.deepEqual(r.designs.map(d => d.tests.map(t => t.join)), [joins]);
  const d = parseXdl(r.designs[0].xdl);
  assert.deepEqual(d.insts.map(i => `${i.name} ${i.type} ${i.site}`), ['s_D2 IOB D2', 's_RAMB16_X0Y1 RAMB16 RAMB16_X0Y1']);
  // the IOB's input from its pad, no register; the net: the site's output, no sink of its own
  assert.ok(d.insts[0].cfg.some(c => c.attr === 'IMUX' && c.value === '1') && d.insts[0].cfg.some(c => c.attr === 'PAD'));
  assert.deepEqual([d.nets[0].outpins, d.nets[0].inpins], [[{ inst: 's_D2', pin: 'I' }], []]);
  assert.deepEqual(d.nets[0].pips.map(p => `${p.tile} ${p.from} ${p.to}`), ['LIOIS_X0Y10 IOIS_I0 OMUX0', 'LIOIS_X0Y10 OMUX0 E2BEG0', 'CLB_X1Y10 E2MID0 F1_B0']);
  assert.deepEqual(d.nets[1].outpins, [{ inst: 's_RAMB16_X0Y1', pin: 'DOA3' }]);
  // an input-only pad: an IBUF site, the instance of its own type in its own tile (xdl -xdl2ncd refuses an IOB there:
  // ERROR:XDL:190, the first ISE run of these tests); likewise the block RAM's tile
  const src2 = { LIOIS_X0Y10: [{ site: 'E2', type: 'IOB', siteType: 'IBUF', tile: 'LIBUFS_X0Y10', o: 'I', wire: 'IOIS_I0' }],
    BRAM0_SMALL_X7Y10: [{ site: 'RAMB16_X0Y1', type: 'RAMB16', siteType: 'RAMB16', tile: 'BRAMSITE_X7Y10', o: 'DOA3', wire: 'BRAM_DOA3' }] };
  const x2 = joinTestDesigns({ part, joins, slicesOf, pinWire, pipsOf, sourcesOf: t => src2[t] || [] }).designs[0].xdl;
  assert.match(x2, /^inst "s_E2" "IBUF", placed LIBUFS_X0Y10 E2 ,$/m);
  assert.match(x2, /^inst "s_RAMB16_X0Y1" "RAMB16", placed BRAMSITE_X7Y10 RAMB16_X0Y1 ,$/m);
});

test('join tests: a tile with no slice is driven from a neighbouring CLB across a known join', () => {
  // the I/O tile LIOIS_X0Y10 has no slice: its W2MID1 is reached from the CLB's W2BEG1 (a known join)
  const pips = {
    CLB_X1Y10: [['X0', 'OMUX3'], ['OMUX3', 'W2BEG1'], ['Y0', 'OMUX5'], ['OMUX5', 'W2BEG1'], ['E2MID2', 'G2_B0'], ['E2MID3', 'F1_B0'], ['OMUX3', 'N2BEG0']],
    LIOIS_X0Y10: [['W2MID1', 'E2BEG2'], ['W2MID1', 'E2BEG3']],
  };
  const pipsOf = t => pips[t] || [];
  const slicesOf = t => t === 'CLB_X1Y10' ? [{ site: 'SLICE_X0Y18', pos: 0 }] : [];
  const pinWire = (pos, pin) => `${pin}${pos}`;
  const known = new Map([['CLB_X1Y10/W2BEG1', ['LIOIS_X0Y10/W2MID1']], ['LIOIS_X0Y10/W2MID1', ['CLB_X1Y10/W2BEG1']]]);
  const joined = k => known.get(k) || [];
  const joins = [['LIOIS_X0Y10/E2BEG2', 'CLB_X1Y10/E2MID2'], ['CLB_X1Y10/E2MID3', 'LIOIS_X0Y10/E2BEG3']];
  const part = 'xc3s250ecp132-4';
  // without crossing joins (the default) the I/O tile cannot be driven
  assert.deepEqual(joinTestDesigns({ part, joins, slicesOf, pinWire, pipsOf, joined }).untestable, joins);
  const r = joinTestDesigns({ part, joins, slicesOf, pinWire, pipsOf, joined, maxJoins: 1 });
  assert.deepEqual(r.untestable, []);
  // both tests need the node CLB_X1Y10/W2BEG1 = LIOIS_X0Y10/W2MID1: one per design
  assert.deepEqual(r.designs.map(d => d.tests), [[{ net: 'h0', join: joins[0] }], [{ net: 'h0', join: joins[1] }]]);
  const d = parseXdl(r.designs[0].xdl);
  assert.deepEqual(d.nets[0].outpins, [{ inst: 's_SLICE_X0Y18', pin: 'X' }]);
  assert.deepEqual(d.nets[0].pips.map(p => `${p.tile} ${p.from} ${p.to}`),
    ['CLB_X1Y10 X0 OMUX3', 'CLB_X1Y10 OMUX3 W2BEG1', 'LIOIS_X0Y10 W2MID1 E2BEG2', 'CLB_X1Y10 E2MID2 G2_B0']);
  // the tested join reversed (the I/O tile's end is the one driven): the same path
  assert.equal(parseXdl(r.designs[1].xdl).nets[0].pips.map(p => `${p.tile} ${p.from} ${p.to}`).join(', '),
    'CLB_X1Y10 X0 OMUX3, CLB_X1Y10 OMUX3 W2BEG1, LIOIS_X0Y10 W2MID1 E2BEG3, CLB_X1Y10 E2MID3 F1_B0');
  // a path never crosses the other end of the tested join (it would join the two ends by itself):
  // the known join tested again cannot be driven from the I/O tile's side, and the CLB's side has
  // no PIP out of the I/O tile's wire
  const self = [['LIOIS_X0Y10/W2MID1', 'CLB_X1Y10/W2BEG1']];
  const pips2 = { ...pips, LIOIS_X0Y10: [], CLB_X1Y10: [...pips.CLB_X1Y10, ['W2BEG1', 'F2_B0']] };
  assert.deepEqual(joinTestDesigns({ part, joins: self, slicesOf, pinWire, pipsOf: t => pips2[t] || [], joined, maxJoins: 1 }).untestable, self);
  // maxDepth limits the PIPs of the path: the I/O tile's E2BEG2 is three PIPs and a join from the slice
  assert.deepEqual(joinTestDesigns({ part, joins: [joins[0]], slicesOf, pinWire, pipsOf, joined, maxJoins: 1, maxDepth: 2 }).untestable, [joins[0]]);
});

test('parseJoinTests: an island means no join; antennas and unrouted sinks are expected', () => {
  const log = `ERROR:PhysDesignRules:798 - The network <h0> has an antenna. Routing is
   incomplete.
ERROR:PhysDesignRules:798 - The network <h1> has an antenna. Routing is
   incomplete.
ERROR:PhysDesignRules:799 - The network <h1> has island(s). Routing is
   incomplete.
ERROR:PhysDesignRules:9 - The network <h2> is only partially routed.
ERROR:PhysDesignRules:1712 - The network <h3> has a routing conflict with
   resouce DOUBLE(-12096,-31261).
ERROR:PhysDesignRules:1713 - The network <h4> has a routing conflict with
   resource DOUBLE(-8640,-31261) driven by routing switch
   OUTPUT(-10928,-32728)--->DOUBLE(-8640,-31261).
ERROR:PhysDesignRules:799 - The network <h4> has island(s). Routing is
   incomplete.
ERROR:PhysDesignRules:1234 - The network <h6> has something else.`;
  assert.deepEqual([...parseJoinTests(log, ['h0', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])],
    [['h0', 'join'], ['h1', 'no-join'], ['h2', 'join'], ['h3', 'join'], ['h4', 'no-join'], ['h5', 'join'], ['h6', 'unclear']]);
});

test('candidates: tiles of the observed prefixes, slice and VCC sites, the census of the CLBs', () => {
  const t = tileCandidates(['CLB_X1Y1', 'CLB_X2Y2', 'LIOIS_X0Y1', 'BRAM0_SMALL_X2Y1', 'GCLKH_X1Y1', 'TIOIS_X1Y3', 'CLB_X3Y1']);
  // CLBs inside (1..2 x 1..2), I/O tiles on their side, block-RAM interconnect in its column only
  assert.deepEqual(t.pips.map(p => p.tile).sort(), ['BRAM0_SMALL_X2Y2', 'CLB_X1Y2', 'CLB_X2Y1', 'LIOIS_X0Y0', 'LIOIS_X0Y2', 'LIOIS_X0Y3', 'TIOIS_X0Y3', 'TIOIS_X2Y3', 'TIOIS_X3Y3']);
  assert.deepEqual(t.pips[0], { tile: t.pips[0].tile, from: 'W2END4', to: 'W2BEG4' });
  assert.deepEqual(t.known.sort(), ['BRAM0_SMALL_X2Y1', 'CLB_X1Y1', 'CLB_X2Y2', 'CLB_X3Y1', 'LIOIS_X0Y1', 'TIOIS_X1Y3']);
  const s = siteCandidates(['CLB_X1Y1']);
  assert.deepEqual(s.slice(0, 4).map(x => `${x.site}:${x.type}`), ['SLICE_X0Y0:SLICEM', 'SLICE_X0Y1:SLICEM', 'SLICE_X1Y0:SLICEM', 'SLICE_X1Y1:SLICEM']);
  assert.equal(s.length, 4 + 4 * 5);   // VCC_X0..3 Y0..4
  const db = { types: { CENTER_SMALL: { features: { 'X0->OMUX0': ['1,1'], 'BX0->BY1': [], 'CLKINV:CLK': [] } }, CENTER_SMALL_BRK: { sameAs: 'CENTER_SMALL', features: { 'GCLK0_BRK->CLK0': [] } } } };
  assert.deepEqual(censusCandidates(['CLB_X1Y1', 'CLB_X1Y9'], db, [9]).map(p => `${p.tile} ${p.from} ${p.dir} ${p.to}`), [
    'CLB_X1Y1 X0 -> OMUX0', 'CLB_X1Y1 BX0 =- BY1', 'CLB_X1Y9 GCLK0_BRK -> CLK0', 'CLB_X1Y9 X0 -> OMUX0', 'CLB_X1Y9 BX0 =- BY1',
  ]);
});

test('gen-observe: seeded random designs over the CLB slices', () => {
  const a = rng(7), b = rng(7);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.deepEqual(clbSlices('CLB_X10Y10'), ['SLICE_X18Y18', 'SLICE_X18Y19', 'SLICE_X19Y18', 'SLICE_X19Y19']);
  const text = observeXdl('xc3s250ecp132-4', ['CLB_X1Y1', 'CLB_X2Y1', 'CLB_X9Y9'], 3);
  assert.equal(text, observeXdl('xc3s250ecp132-4', ['CLB_X1Y1', 'CLB_X2Y1', 'CLB_X9Y9'], 3));
  const d = parseXdl(text);
  assert.equal(d.insts.length, 12);
  const sinks = d.nets.flatMap(n => n.inpins);
  assert.equal(sinks.length, 12 * 8);   // every LUT input driven once
  assert.equal(new Set(sinks.map(p => `${p.inst}.${p.pin}`)).size, 96);
  assert.ok(d.nets.every(n => n.outpins.length === 1 && n.pips.length === 0));
});

test('gen-obshdl: observation designs with every block RAM, every multiplier, the pads, each LOC\'d where it must be, read by Silinx\'s front end (#3, round 5)', () => {
  const dev = loadDeviceCache('xc3s250ecp132-4');
  // (no error and no warning, from compile or elaboration)
  const read = v => { const srcs = [{ path: 'top.v', lang: 'verilog', text: v }]; const lib = compile([...primitiveSources(srcs), ...srcs]); return [lib.errors, elaborate(lib, 'top').diags]; };
  const b = bram(dev, 'xc3s250ecp132-4'), m = mult(dev, 'xc3s250ecp132-4'), p = pads(90, 24, 'xc3s250ecp132-4');
  // every site of the device, once
  const locs = ucf => [...ucf.matchAll(/^INST "u(\d+)" LOC = "(\S+)" ;$/gm)].map(x => x[2]);
  assert.deepEqual(locs(b.ucf).sort(), dev.sites('RAMB16').map(s => s.name).sort());
  assert.deepEqual(locs(m.ucf).sort(), dev.sites('MULT18X18SIO').map(s => s.name).sort());
  assert.equal(locs(b.ucf).length, 12);
  assert.equal(p.ucf, '', 'the pads placed by ISE');
  // each output of each block RAM / multiplier into a register (18 per RAM, 36 per multiplier)
  assert.equal((b.v.match(/r\d+\[\d+\]/g) || []).length, 12 * 18);
  assert.equal((m.v.match(/r\d+\[\d+\]/g) || []).length, 12 * 36);
  // 90 pads: the clock, 24 inputs, 65 bidirectional
  assert.match(p.v, /module top\(input clk, input \[23:0\] i, inout \[64:0\] p\);/);
  for (const v of [b.v, m.v, p.v]) assert.deepEqual(read(v), [[], []]);
});

test('blockRamOutputJoins: where a block RAM\'s output enters its interconnect tile, from ISE\'s routed net (#3, round 6)', () => {
  const d = parseXdl(`design "t" xc3s250ecp132-4 v3.2 ;
net "do0" ,
  outpin "u0" DOA0 ,
  inpin "r0" BY ,
  pip BRAM0_SMALL_X3Y6 BRAM_DOA0 -> E6BEG6 ,
  pip BRAMSITE2_BRK_X4Y6 RAMB16_DOA0 -> BRAM_DOA0_INT0 ,
  pip CLB_X9Y6 E6MID6 -> N2BEG6 ,
  ;
net "x" ,
  outpin "s" X ,
  pip CLB_X1Y1 X0 -> OMUX0 ,
  ;
`);
  const isInterconnect = t => /^BRAM\d_SMALL/.test(t);
  assert.deepEqual(blockRamOutputJoins(d, isInterconnect), [['BRAMSITE2_BRK_X4Y6/BRAM_DOA0_INT0', 'BRAM0_SMALL_X3Y6/BRAM_DOA0']]);
  // (no interconnect tile among the PIPs: no join)
  assert.deepEqual(blockRamOutputJoins(d, () => false), []);
});

test('ioCandidates: an I/O tile\'s PIPs from the database\'s features, in the tile\'s own wire names, less the observed and the absent ones (#3, round 7)', () => {
  const tilesDb = { types: {
    CENTER_SMALL: { features: { 'F1_B0->X0': [], 'E2BEG0->F1_B0': [], 'W2END4->W2BEG4': [] } },
    LIOIS: { sameAs: 'CENTER_SMALL', features: { 'IOIS_I0->OMUX3': [] }, absent: ['W2BEG4'] },
  } };
  // ISE's routes showed IOIS_F1_B0 in an I/O tile (the database's F1_B0 there), and E2BEG0 -> IOIS_F1_B0 in LIOIS_X0Y5
  const obs = { pips: [{ tile: 'LIOIS_X0Y5', from: 'E2BEG0', to: 'IOIS_F1_B0' }, { tile: 'CLB_X1Y5', from: 'F1_B0', to: 'X0' }] };
  const c = ioCandidates(obs, tilesDb, t => tileXY(t).prefix).map(p => `${p.tile} ${p.from}->${p.to}`).sort();
  assert.deepEqual(c, ['LIOIS_X0Y5 IOIS_F1_B0->X0', 'LIOIS_X0Y5 IOIS_I0->OMUX3']);
});

test('testSources: the observed IOB inputs and block-RAM outputs; another package\'s inputs; the unbonded IOB sites of a tile with none (#3, round 8)', () => {
  const dev = loadDeviceCache('xc3s250ecp132-4');
  // ISE's routes in the CP132: an input on LIOIS_X0Y13's PAD146 (its first IOB: I0_PINWIRE), its output pin (no source),
  // a block RAM's DOA0
  const obs = {
    sites: [{ site: 'PAD146', type: 'IBUF' }, { site: 'RAMB16_X0Y0', type: 'RAMB16' }],
    pins: [
      { site: 'PAD146', tile: 'LIOIS_X0Y13', pin: 'I', dir: 'o', wire: 'I0_PINWIRE' },
      { site: 'PAD146', tile: 'LIOIS_X0Y13', pin: 'O', dir: 'i', wire: 'O0_PINWIRE' },
      { site: 'RAMB16_X0Y0', tile: 'BRAMSITE2_X3Y0', pin: 'DOA0', dir: 'o', wire: 'RAMB16_DOA0' },
    ],
  };
  const list = m => [...m].flatMap(([t, xs]) => xs.map(x => `${t} ${x.site}.${x.o} ${x.siteType} ${x.wire}`)).sort();
  assert.deepEqual(list(testSources(obs)), ['BRAMSITE2_X3Y0 RAMB16_X0Y0.DOA0 RAMB16 RAMB16_DOA0', 'LIOIS_X0Y13 PAD146.I IBUF I0_PINWIRE']);
  // the inputs of another package's design (FT256: its pins' names) instead of the CP132's; the block RAM kept
  const ft = { sites: [{ site: 'C1', type: 'IBUF' }], pins: [{ site: 'C1', tile: 'LIOIS_X0Y12', pin: 'I', dir: 'o', wire: 'I0_PINWIRE' }] };
  assert.deepEqual(list(testSources(obs, { sourceObs: ft })), ['BRAMSITE2_X3Y0 RAMB16_X0Y0.DOA0 RAMB16 RAMB16_DOA0', 'LIOIS_X0Y12 C1.I IBUF I0_PINWIRE']);
  // with the device: LIOIS_X0Y12 (no pad in any package, NOPAD149-147) takes its three IOB sites, an IBUF on each; the
  // tile with an input observed and one that is not in the joins take none
  const joins = [['CLB_X1Y13/OMUX_NE12', 'LIOIS_X0Y12/OMUX12'], ['LIOIS_X0Y13/OMUX12', 'CLB_X1Y14/OMUX_NE12']];
  assert.deepEqual(list(testSources(obs, { device: dev, joins })), ['BRAMSITE2_X3Y0 RAMB16_X0Y0.DOA0 RAMB16 RAMB16_DOA0',
    'LIOIS_X0Y12 NOPAD147.I IBUF I2_PINWIRE', 'LIOIS_X0Y12 NOPAD148.I IBUF I1_PINWIRE', 'LIOIS_X0Y12 NOPAD149.I IBUF I0_PINWIRE', 'LIOIS_X0Y13 PAD146.I IBUF I0_PINWIRE']);
  // an observed input off the Ik_PINWIRE rule
  const off = { ...obs, pins: [{ ...obs.pins[0], wire: 'I2_PINWIRE' }] };
  assert.throws(() => testSources(off, { device: dev, joins }), /LIOIS_X0Y13 PAD146\.I on I2_PINWIRE, not I0_PINWIRE/);
});

test('gen-obshdl: every pad an input (round 8: the FT256), read by Silinx\'s front end (#3)', () => {
  const v = inputs(170, 'xc3s250eft256-4');
  assert.equal(v.ucf, '', 'the pads placed by ISE');
  assert.match(v.v, /^module top\(input clk, input \[169:0\] i, output reg q\);\n {2}always @\(posedge clk\) q <= \^i;\nendmodule\n$/m);
  const srcs = [{ path: 'top.v', lang: 'verilog', text: v.v }];
  const lib = compile([...primitiveSources(srcs), ...srcs]);
  assert.deepEqual([lib.errors, elaborate(lib, 'top').diags], [[], []]);
});

// #3, the sites' pins: a clock tile's pins are wires of the clock family (ISE's routes of a BUFGMUX, gen-obspins.mjs dcmpins)
test('observeNet: a BUFGMUX\'s O from its pin wire, its I0 from a clock wire no other tile continues (#3, the sites\' pins)', () => {
  const ins = new Map([
    ['ib', { name: 'ib', tile: 'TIBUFS_X13Y35', site: 'P10' }],
    ['bg', { name: 'bg', tile: 'CLKT_X13Y35', site: 'BUFGMUX_X2Y10' }],
    ['s', { name: 's', tile: 'CLB_X12Y34', site: 'SLICE_X22Y67' }],
  ]);
  // the pad into the buffer's I0: CLKT_GCLKIN00 (clock family), no PIP of another tile continues it
  const a = observeNet({ name: 'ci', outpins: [{ inst: 'ib', pin: 'I' }], inpins: [{ inst: 'bg', pin: 'I0' }], pips: [
    { tile: 'CLKT_X13Y35', from: 'CLKT_CKI4', dir: '->', to: 'CLKT_GCLK0' },
    { tile: 'CLKT_X13Y35', from: 'CLKT_GCLK0', dir: '->', to: 'CLKT_GCLKIN00' },
    { tile: 'TIBUFS_X13Y35', from: 'I0_PINWIRE', dir: '->', to: 'IOIS_IBUF0' },
  ] }, ins);
  assert.deepEqual(a.pins, [{ site: 'P10', pin: 'I', dir: 'o', tile: 'TIBUFS_X13Y35', wire: 'I0_PINWIRE' }, { site: 'BUFGMUX_X2Y10', pin: 'I0', dir: 'i', tile: 'CLKT_X13Y35', wire: 'CLKT_GCLKIN00' }]);
  // the buffer's O: CLKT_GCLK_PINWIRE1, a pin wire (no family), out to a slice's clock through the spine
  const b = observeNet({ name: 'ck', outpins: [{ inst: 'bg', pin: 'O' }], inpins: [{ inst: 's', pin: 'CLK' }], pips: [
    { tile: 'CLKT_X13Y35', from: 'CLKT_GCLK_PINWIRE1', dir: '->', to: 'CLKT_GCLK_MAIN1' },
    { tile: 'CLB_X12Y34', from: 'GCLK1', dir: '->', to: 'CLK_B0' },
    { tile: 'CLB_X12Y34', from: 'CLK_B0', dir: '->', to: 'CLK_B_PINWIRE0' },
  ] }, ins);
  assert.deepEqual(b.pins, [{ site: 'BUFGMUX_X2Y10', pin: 'O', dir: 'o', tile: 'CLKT_X13Y35', wire: 'CLKT_GCLK_PINWIRE1' }, { site: 'SLICE_X22Y67', pin: 'CLK', dir: 'i', tile: 'CLB_X12Y34', wire: 'CLK_B_PINWIRE0' }]);
  assert.deepEqual(b.joins, [['CLKT_X13Y35/CLKT_GCLK_MAIN1', 'CLB_X12Y34/GCLK1']]);
  // a clock wire that another tile's wire continues is a join's candidate, not a pin: no pin for the second buffer's I1
  const c = observeNet({ name: 'c2', outpins: [{ inst: 'bg', pin: 'O' }], inpins: [{ inst: 'bg2', pin: 'I1' }], pips: [
    { tile: 'CLKT_X13Y35', from: 'CLKT_GCLK_PINWIRE1', dir: '->', to: 'CLKT_GCLK_MAIN1' },
    { tile: 'CLB_X12Y34', from: 'GCLK1', dir: '->', to: 'CLK_B0' },
  ] }, new Map([...ins, ['bg2', { name: 'bg2', tile: 'CLKT_X13Y35', site: 'BUFGMUX_X2Y11' }]]));
  assert.deepEqual(c.pins, [{ site: 'BUFGMUX_X2Y10', pin: 'O', dir: 'o', tile: 'CLKT_X13Y35', wire: 'CLKT_GCLK_PINWIRE1' }]);
  assert.deepEqual(c.joins, [['CLKT_X13Y35/CLKT_GCLK_MAIN1', 'CLB_X12Y34/GCLK1']]);
});

test('pinCensus: the observed pin wires against a reference, per site type, and the pins no design used (#3, the sites\' pins)', () => {
  const dev = loadDeviceCache('xc3s250ecp132-4');
  const ramPin = dev.sitePin('RAMB16_X0Y0', 'CLKA'), bg = dev.sitePin('BUFGMUX_X2Y10', 'I0');
  const c = pinCensus({ pins: [
    { site: 'RAMB16_X0Y0', pin: 'CLKA', dir: 'i', tile: ramPin.tileName, wire: ramPin.wire },
    { site: 'BUFGMUX_X2Y10', pin: 'I0', dir: 'i', tile: bg.tileName, wire: bg.wire },
    { site: 'BUFGMUX_X2Y10', pin: 'S', dir: 'i', tile: bg.tileName, wire: 'NOT_ITS_WIRE' },
    { site: 'BUFGMUX_X2Y10', pin: 'NOPE', dir: 'i', tile: bg.tileName, wire: 'X' },
  ] }, dev);
  assert.equal(c.right, 2);
  assert.deepEqual(c.wrong, [`BUFGMUX_X2Y10.S: ${bg.tileName}/NOT_ITS_WIRE, the reference ${bg.tileName}/${dev.sitePin('BUFGMUX_X2Y10', 'S').wire}`, `BUFGMUX_X2Y10.NOPE: ${bg.tileName}/X, the reference has no such pin`]);
  assert.deepEqual([c.types.BUFGMUX.seen, c.types.BUFGMUX.total, c.types.BUFGMUX.names, c.types.BUFGMUX.missing], [1, 96, 1, ['I1', 'O', 'S']]);
  assert.deepEqual([c.types.RAMB16.seen, c.types.RAMB16.names, c.types.RAMB16.totalNames], [1, 1, 180]);
});

test('gen-obspins: designs that use every pin of the block RAMs, multipliers, DCMs and I/O blocks, read by Silinx\'s front end (#3, the sites\' pins)', () => {
  const dev = loadDeviceCache('xc3s250ecp132-4');
  const read = v => { const srcs = [{ path: 'top.v', lang: 'verilog', text: v }]; const lib = compile([...primitiveSources(srcs), ...srcs]); return [lib.errors, elaborate(lib, 'top').diags]; };
  const locs = ucf => [...ucf.matchAll(/^INST "u(\d+)" LOC = "(\S+)" ;$/gm)].map(x => x[2]);
  const designs = { wide: ram(dev, true), narrow: ram(dev, false), mult: multCascade(dev), dcm: dcmPins(dev), iob: iobDdr(dev), clk2: [0, 1, 2].map(k => iobClk2(dev, k)) };
  for (const d of [designs.wide, designs.narrow]) assert.deepEqual(locs(d.ucf).sort(), dev.sites('RAMB16').map(s => s.name).sort());
  // every pin on a signal of its own: no bit of s twice (the I/O blocks' set and reset once per IOB, shared by its registers)
  const used = v => [...v.matchAll(/s\[(\d+)(?::(\d+))?\]/g)].flatMap(([, a, b]) => b === undefined ? [+a] : Array.from({ length: +a - +b + 1 }, (_, i) => +b + i));
  for (const [n, d] of Object.entries({ wide: designs.wide, narrow: designs.narrow, mult: designs.mult })) {
    const u = used(d.v.replace(/always @\(posedge \w+\) s <= [^;]*;/, ''));
    assert.equal(new Set(u).size, u.length, `${n}: a signal used twice`);
  }
  const iobSigs = used(designs.iob.v.replace(/always @\(posedge \w+\) s <= [^;]*;/, ''));
  assert.ok([...iobSigs.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map()).values()].every(n => n === 1 || n === 2 || n === 3), 'iob: R and S of a pad on its 1-3 registers, the others once');
  assert.match(designs.wide.v, /RAMB16_S36_S36 u11 \(\.CLKA\(clk\), \.ADDRA\(s\[\d+:\d+\]\), \.DIA\(s\[\d+:\d+\]\), \.DIPA\(/);
  assert.match(designs.narrow.v, /RAMB16_S1_S1 u0 \(\.CLKA\(clk\), \.ADDRA\(s\[13:0\]\)/);
  // a chain up each column of six: the lowest DIRECT, the five above CASCADE from the one below
  assert.equal((designs.mult.v.match(/B_INPUT\("CASCADE"\)/g) || []).length, 10);
  assert.match(designs.mult.v, /\.BCIN\(bc0\)/);
  assert.deepEqual(locs(designs.dcm.ucf), ['DCM_X0Y0', 'DCM_X0Y1', 'DCM_X1Y0', 'DCM_X1Y1']);
  assert.doesNotMatch(designs.dcm.v, /st\d\[[3-7]\]/, 'STATUS 3-7 lead nowhere');
  // every pad of the package LOC'd once (the clock, 8 inputs, 8 outputs, the rest registered)
  const pads = ucf => [...ucf.matchAll(/LOC = "(\S+)"/g)].map(x => x[1]);
  assert.deepEqual(pads(designs.iob.ucf).sort(), [...deviceSites(dev).pads.keys()].sort());
  // the pads at each position of their I/O tile in one design: together every pad but the clock, the inputs and outputs
  const regs = designs.clk2.flatMap(d => pads(d.ucf).filter((p, i, a) => i > 16));
  assert.equal(new Set(regs).size, regs.length);
  assert.equal(regs.length, 92 - 17);
  for (const d of [designs.wide, designs.narrow, designs.mult, designs.dcm, designs.iob, ...designs.clk2]) assert.deepEqual(read(d.v), [[], []]);
});

// #3, the pins of the I/O tiles with no pad in the CP132: the FT256 bonds them (another package of the same die)
test('observedPads, renamePads: another package\'s pads, each the k-th I/O site of its tile by its I pin\'s wire (#3, the I/O tiles\' pins)', () => {
  const dev = loadDeviceCache('xc3s250ecp132-4');
  // ISE's FT256 routes: a pad of TIOIS_X22Y35 on I2_PINWIRE (its third I/O site, PAD37 in the CP132's report), one of
  // LIOIS_X0Y12 on I0_PINWIRE (NOPAD149), its register's clock; the output pad A12 with no I pin; a VCC site
  const ft = {
    sites: [{ site: 'A13', tile: 'TIOIS_X22Y35', type: 'IBUF' }, { site: 'C1', tile: 'LIOIS_X0Y12', type: 'IOB' }, { site: 'A12', tile: 'TIOIS_X22Y35', type: 'IOB' }, { site: 'VCC_X24Y37', tile: 'TIOIS_X22Y35', type: 'VCC' }],
    pins: [
      { site: 'A13', pin: 'I', dir: 'o', tile: 'TIOIS_X22Y35', wire: 'I2_PINWIRE' },
      { site: 'C1', pin: 'I', dir: 'o', tile: 'LIOIS_X0Y12', wire: 'I0_PINWIRE' },
      { site: 'C1', pin: 'ICLK1', dir: 'i', tile: 'LIOIS_X0Y12', wire: 'ICLK10' },
      { site: 'A12', pin: 'O1', dir: 'i', tile: 'TIOIS_X22Y35', wire: 'IOIS_G3_B2' },
      { site: 'VCC_X24Y37', pin: 'VCCOUT', dir: 'o', tile: 'TIOIS_X22Y35', wire: 'IOIS_VCC_WIRE' },
    ],
  };
  assert.deepEqual(observedPads(ft), [{ name: 'A13', tile: 'TIOIS_X22Y35', inputOnly: false, pos: 2 }, { name: 'C1', tile: 'LIOIS_X0Y12', inputOnly: false, pos: 0 }]);
  const r = renamePads(ft, dev);
  assert.deepEqual(r.dropped, ['A12']);
  assert.deepEqual(r.pins.map(p => `${p.site}.${p.pin}`), ['PAD37.I', 'NOPAD149.I', 'NOPAD149.ICLK1', 'VCC_X24Y37.VCCOUT']);
  // the renamed facts as the CP132's description has them
  for (const p of r.pins) assert.equal(dev.sitePin(p.site, p.pin)?.wire, p.wire, `${p.site}.${p.pin}`);
  // the device's own pads: the same place rule (B8, the clock pad: the first site of the input-only tile TIBUFS_X13Y35)
  const pads = devicePads(dev);
  assert.equal(pads.length, 92);
  assert.deepEqual(pads.find(p => p.name === 'B8'), { name: 'B8', tile: 'TIBUFS_X13Y35', inputOnly: true, pos: pads.find(p => p.name === 'B8').pos });
  for (const p of pads) assert.equal(dev.sitePin(p.name, 'I').wire, `I${p.pos}_PINWIRE`, p.name);
  // the I/O designs on another package's pads: the pads given, no device needed
  const d = iobDdr(null, 'B8', 'xc3s250eft256-4', [{ name: 'B8', tile: 'TIBUFS_X13Y35', inputOnly: true, pos: 2 }, ...observedPads(ft), ...Array.from({ length: 16 }, (_, i) => ({ name: `X${i}`, tile: 'T', inputOnly: false, pos: 0 }))]);
  assert.match(d.ucf, /^NET "clk" LOC = "B8" ;$/m);
  assert.match(d.v, /^\/\/ xc3s250eft256-4: /);
});

// #3, the irregular tiles: the clock network's joins, ambiguous in each net (every clock wire of the net a candidate)
test('intersectAmbiguous: a wire\'s driver in every net\'s candidates; the nets\' source tiles left out (#3, the clock network)', () => {
  const r = intersectAmbiguous([
    { from: 'CLB_X5Y10/GCLK3', candidates: ['GCLKH_X5Y13/GCLKH_GCLK_DN3', 'GCLKH_X7Y13/GCLKH_GCLK_DN3', 'GCLKH_X5Y5/GCLKH_GCLK_UP3'] },
    { from: 'CLB_X5Y10/GCLK3', candidates: ['GCLKH_X5Y13/GCLKH_GCLK_DN3', 'GCLKH_X9Y13/GCLKH_GCLK_DN3', 'GCLKH_X5Y5/GCLKH_GCLK_UP3'] },
    { from: 'CLB_X5Y10/GCLK3', candidates: ['GCLKH_X5Y13/GCLKH_GCLK_DN3', 'GCLKH_X7Y13/GCLKH_GCLK_DN3'] },
    // two left: still ambiguous, with the intersection
    { from: 'CLB_X6Y10/GCLK1', candidates: ['A/x', 'B/y', 'C/z'] }, { from: 'CLB_X6Y10/GCLK1', candidates: ['A/x', 'B/y'] },
    // in the source's tile the wire may be the source pin's: kept as it is, and out of the intersection
    { from: 'CLKL_X0Y17/CLKL_GCLK_PWO1', candidates: ['GCLKVML_X6Y17/GCLKVMLR_GCLK_UP1', 'X/w'], src: true },
    { from: 'CLKL_X0Y17/CLKL_GCLK_PWO1', candidates: ['GCLKVML_X6Y17/GCLKVMLR_GCLK_UP1'] },
  ]);
  assert.deepEqual(r.joins, [['GCLKH_X5Y13/GCLKH_GCLK_DN3', 'CLB_X5Y10/GCLK3'], ['GCLKVML_X6Y17/GCLKVMLR_GCLK_UP1', 'CLKL_X0Y17/CLKL_GCLK_PWO1']]);
  assert.deepEqual(r.ambiguous, [{ from: 'CLB_X6Y10/GCLK1', candidates: ['A/x', 'B/y'] }, { from: 'CLKL_X0Y17/CLKL_GCLK_PWO1', candidates: ['GCLKVML_X6Y17/GCLKVMLR_GCLK_UP1', 'X/w'], src: true }]);
  // observeNet marks an ambiguous wire of the source's tile
  const ins = new Map([['bg', { name: 'bg', tile: 'CLKL_X0Y17', site: 'BUFGMUX_X0Y3' }], ['s', { name: 's', tile: 'CLB_X3Y17', site: 'SLICE_X4Y34' }]]);
  const a = observeNet({ name: 'g', outpins: [{ inst: 'bg', pin: 'O' }], inpins: [{ inst: 's', pin: 'CLK' }], pips: [
    { tile: 'CLKL_X0Y17', from: 'CLKL_GCLK_PWO1', dir: '->', to: 'CLKL_GCLKH_MAIN1' },
    { tile: 'GCLKVML_X6Y17', from: 'GCLKVML_GCLK1', dir: '->', to: 'GCLKVMLR_GCLK_UP1' },
    { tile: 'GCLKVML_X6Y17', from: 'GCLKVML_GCLK1', dir: '->', to: 'GCLKVMLR_GCLK_DN1' },
  ] }, ins);
  assert.deepEqual(a.ambiguous.find(x => x.from === 'CLKL_X0Y17/CLKL_GCLK_PWO1')?.src, true);
});

test('gen-obsclk: 8 global clocks, each on a random half of the clock cells, one slice a clock, at most 4 a tile, read by Silinx\'s front end (#3, the clock network)', () => {
  const dev = loadDeviceCache('xc3s250ecp132-4');
  let seed = 1;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
  const d = clockDesign(dev, rnd);
  // the top and bottom buffers, one line each
  assert.deepEqual([...d.ucf.matchAll(/^INST "u_b\d" LOC = "(\S+)" ;$/gm)].map(m => m[1]), ['BUFGMUX_X1Y0', 'BUFGMUX_X1Y1', 'BUFGMUX_X1Y10', 'BUFGMUX_X1Y11', 'BUFGMUX_X2Y0', 'BUFGMUX_X2Y1', 'BUFGMUX_X2Y10', 'BUFGMUX_X2Y11']);
  // every slice once; 26 columns by 4 bands, about half of them each clock
  const slices = [...d.ucf.matchAll(/^INST "r\d_\d+" LOC = "(SLICE_X\d+Y\d+)" ;$/gm)].map(m => m[1]);
  assert.equal(new Set(slices).size, slices.length);
  assert.equal(slices.length, d.ffs.reduce((a, b) => a + b, 0));
  for (const k in d.cells) assert.ok(d.cells[k].length > 30 && d.cells[k].length < 74, `${k}: ${d.cells[k].length} of 104 cells`);
  const srcs = [{ path: 'top.v', lang: 'verilog', text: d.v }];
  const lib = compile([...primitiveSources(srcs), ...srcs]);
  assert.deepEqual([lib.errors, elaborate(lib, 'top').diags], [[], []]);
});
