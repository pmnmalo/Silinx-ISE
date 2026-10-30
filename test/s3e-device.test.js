// packages/silinx-fpga/research/s3e-device: measuring the device description black-box (no device report, no ISE here):
// the observation of ISE-routed nets, the join rules, the xdl2ncd probes, the DRC join tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { wireFamily, tileXY, observeNet, observeDesign, resolveAmbiguous, intersectAmbiguous, joinRule, blockRamOutputJoins } from '../packages/silinx-fpga/research/s3e-device/observe.mjs';
import { switchGrid, gridRule, applyRules, closeRules, segmentRules, nodesOf } from '../packages/silinx-fpga/research/s3e-device/model.mjs';
import { measuredLines, packMeasured } from '../packages/silinx-fpga/research/s3e-device/build.mjs';
import { pinCensus, renamePads } from '../packages/silinx-fpga/research/s3e-device/pins.mjs';
import { ram, multCascade, dcmPins, iobDdr, iobClk2, devicePads, observedPads, dcmClockPad } from '../packages/silinx-fpga/research/s3e-device/gen-obspins.mjs';
import { clockDesign } from '../packages/silinx-fpga/research/s3e-device/gen-obsclk.mjs';
import { clockNets, clockTestDesigns, clockTile, rowTile } from '../packages/silinx-fpga/research/s3e-device/clocktests.mjs';
import { edgeHypotheses, edgeTile } from '../packages/silinx-fpga/research/s3e-device/edgejoins.mjs';
import { chipMeasurements } from '../packages/silinx-fpga/research/s3e-device/chip.mjs';
import { carryDesign } from '../packages/silinx-fpga/research/s3e-device/gen-obscarry.mjs';
import { sliceDesign } from '../packages/silinx-fpga/research/s3e-device/gen-obsslice.mjs';
import { muxDesign, muxCount } from '../packages/silinx-fpga/research/s3e-device/gen-obsmux.mjs';
import { srlCascade, f8Muxes, ramClkB, bufgs, dcmPads } from '../packages/silinx-fpga/research/s3e-device/gen-obspins2.mjs';
import { observationDesigns, implemented, GENERATORS, tileLists, roundPaths, roundSummary } from '../packages/silinx-fpga/research/s3e-device/measure.mjs';
import { buildMeasured, DATA_DIR, PARTS, dieOf, dataDir, measuredDies } from '../packages/silinx-fpga/research/s3e-device/build-measured.mjs';
import { indexVariants, pipVariants, joinVariants, clockLineVariants, clockRowVariants, longLineVariants, tapVariants, spineVariants, pinVariants, DCM_SWITCH } from '../packages/silinx-fpga/research/s3e-device/varyjoins.mjs';
import { loadDevice, PIP_BIDI } from '../packages/silinx-fpga/src/fpga/device.js';
import { probeXdl, probeFirstLine, parseProbeLog, sortPips, sortSites } from '../packages/silinx-fpga/research/s3e-device/probe.mjs';
import { joinTestDesigns, parseJoinTests, testSources } from '../packages/silinx-fpga/research/s3e-device/hypotheses.mjs';
import { rng, clbSlices, observeXdl } from '../packages/silinx-fpga/research/s3e-device/gen-observe.mjs';
import { tileCandidates, siteCandidates, censusCandidates, ioCandidates, leftCandidates, restCandidates } from '../packages/silinx-fpga/research/s3e-device/candidates.mjs';
import { bram, mult, pads, inputs, padDefaults } from '../packages/silinx-fpga/research/s3e-device/gen-obshdl.mjs';
import { loadDeviceCache } from '../packages/silinx-fpga/src/fpga/device-node.js';
import { deviceSites } from '../packages/silinx-fpga/src/fpga/place.js';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { parseXdl } from '../packages/silinx-fpga/src/xdl.js';

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

test('segmentRules pairs: every tap to every later tap of its segment', () => {
  const r = [...segmentRules([3], { pairs: true })];
  // per direction: a double's taps BEG, MID (each to the later taps + END_S / END_N): 2 + 2, 1 + 2; a hex's: 6 + 2 down to 1 + 2
  assert.equal(r.length, 4 * ((4 + 3) + (8 + 7 + 6 + 5 + 4 + 3)));
  for (const x of ['E2MID3 1,0 E2END3', 'E2MID3 1,-1 E2END_S3', 'N6MID3 0,3 N6END3', 'N6A3 0,2 N6MID3', 'W6C3 -2,0 W6END3',
    'S6D3 0,-2 S6END_S3', 'E6BEG3 6,0 E6END3']) assert.ok(r.includes(x), x);
  assert.ok(!r.some(x => /END/.test(x.split(' ')[0])), 'no rule from an END');
  // without pairs: the BEG rules only, the same as before
  assert.deepEqual(new Set(segmentRules([3])), new Set(r.filter(x => /^\w\dBEG/.test(x))));
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

test('leftCandidates: the I/O candidates a round\'s untestable joins need: the PIPs into their I/O ends and one step back (#3, round 7)', () => {
  const pips = [
    { tile: 'BIOIS_X7Y0', from: 'IOIS_I0', to: 'N6BEG1' },     // into an untestable join's I/O end
    { tile: 'BIOIS_X7Y0', from: 'OMUX3', to: 'IOIS_I0' },      // into that PIP's from-wire (one step back)
    { tile: 'BIOIS_X7Y0', from: 'E2BEG0', to: 'OMUX3' },       // two steps back: not asked
    { tile: 'BIOIS_X9Y0', from: 'IOIS_I0', to: 'N6BEG1' },     // the same wires in another tile: not asked
  ];
  // (the CLB end of a join is no I/O wire: nothing into it is asked)
  const untestable = [['BIOIS_X7Y0/N6BEG1', 'CLB_X7Y1/N6MID1']];
  assert.deepEqual(leftCandidates(pips, untestable), pips.slice(0, 2));
  assert.deepEqual(leftCandidates(pips, [['CLB_X1Y1/X0', 'CLB_X2Y1/F1_B0']]), []);
  assert.deepEqual(leftCandidates(pips, []), []);
});

test('restCandidates: a measured description\'s non-CLB PIPs not seen nor probed in their tile, and an I/O tile\'s outputs in its own names (#3, section 10)', () => {
  const pips = [
    { tile: 'CLB_X1Y1', from: 'X0', to: 'E2BEG0' },                     // a CLB: not asked
    { tile: 'BRAM0_SMALL_X3Y1', from: 'OMUX3', to: 'E2BEG0' },          // seen in ISE's routes there: not asked
    { tile: 'BRAM0_SMALL_X3Y1', from: 'OMUX4', to: 'E2BEG1' },          // asked
    { tile: 'LIOIS_X0Y5', from: 'X0', to: 'E2BEG6' },                   // asked, and in the tile's own name
    { tile: 'LIOIS_X0Y5', from: 'F1_B0', to: 'X0' },                    // both ends site wires
    { tile: 'LIOIS_X0Y5', from: 'IOIS_Y1', to: 'OMUX2' },               // already its own name
    { tile: 'LIOIS_X0Y5', from: 'N2END0', to: 'IOIS_F1_B0' },           // refused by a probe: not asked
    { tile: 'CLKV_X7Y4', from: 'A', to: 'B', routethru: 'X' },          // a route-through: not asked
  ];
  const obs = { pips: [{ tile: 'BRAM0_SMALL_X3Y1', from: 'OMUX3', to: 'E2BEG0' }] };
  const probe = { pips: { yes: [], no: [{ tile: 'LIOIS_X0Y5', from: 'N2END0', to: 'IOIS_F1_B0' }] } };
  const c = restCandidates(pips, obs, [probe]).map(p => `${p.tile} ${p.from}->${p.to}`);
  assert.deepEqual(c, [
    'BRAM0_SMALL_X3Y1 OMUX4->E2BEG1',
    'LIOIS_X0Y5 X0->E2BEG6', 'LIOIS_X0Y5 IOIS_X0->E2BEG6',
    'LIOIS_X0Y5 F1_B0->X0', 'LIOIS_X0Y5 IOIS_F1_B0->X0', 'LIOIS_X0Y5 F1_B0->IOIS_X0',
    'LIOIS_X0Y5 IOIS_Y1->OMUX2',
  ]);
  // (nothing left to ask: none)
  assert.deepEqual(restCandidates(pips.slice(0, 2), obs), []);
});

test('spineVariants, pinVariants: the clock spine\'s and the block RAMs\' pin wires\' ambiguous joins with their candidates, less the decided ones (#3, the XC3S100E)', () => {
  const ord = j => [...j].sort().join('|');
  const ambiguous = [
    { from: 'GCLKVML_X2Y11/GCLKVML_GCLKCORE0', candidates: ['CLKB_X8Y0/CLKB_GCLK_MAIN0', 'CLKC_X8Y11/CLKC_GCLK0'] },
    // (a row's DN wire, driven by its own tile's row line: left to the removal tests)
    { from: 'GCLKH_X1Y15/GCLKH_GCLK_DN7', candidates: ['GCLKH_X2Y15/GCLKH_GCLK7'] },
    // (a spine wire already joined: not asked again)
    { from: 'GCLKVC_X2Y7/GCLKC_GCLK5', candidates: ['CLKC_X8Y11/CLKC_GCLK5'] },
    // (not the spine; a CLB's clock line is clocktests.mjs's)
    { from: 'CLB_X2Y10/GCLK5', candidates: ['GCLKH_X2Y7/GCLKH_GCLK_DN5'] },
    { from: 'BRAMSITE2_X4Y16/BRAM_CLK2_INT1', candidates: ['BRAM1_SMALL_X3Y13/BRAM_CLK2', 'BRAM1_SMALL_X3Y17/BRAM_CLK2'] },
  ];
  const done = new Set([ord(['CLKB_X8Y0/CLKB_GCLK_MAIN0', 'GCLKVML_X2Y11/GCLKVML_GCLKCORE0'])]);   // an island already
  const joined = new Set(['GCLKVC_X2Y7/GCLKC_GCLK5']);
  assert.deepEqual(spineVariants(ambiguous, done, joined), [['CLKC_X8Y11/CLKC_GCLK0', 'GCLKVML_X2Y11/GCLKVML_GCLKCORE0']]);
  assert.deepEqual(spineVariants(ambiguous, new Set(), new Set()).map(ord).sort(), [
    ord(['CLKB_X8Y0/CLKB_GCLK_MAIN0', 'GCLKVML_X2Y11/GCLKVML_GCLKCORE0']), ord(['CLKC_X8Y11/CLKC_GCLK0', 'GCLKVML_X2Y11/GCLKVML_GCLKCORE0']),
    ord(['CLKC_X8Y11/CLKC_GCLK5', 'GCLKVC_X2Y7/GCLKC_GCLK5']),
  ].sort());
  assert.deepEqual(pinVariants(ambiguous, new Set([ord(['BRAM1_SMALL_X3Y13/BRAM_CLK2', 'BRAMSITE2_X4Y16/BRAM_CLK2_INT1'])])),
    [['BRAM1_SMALL_X3Y17/BRAM_CLK2', 'BRAMSITE2_X4Y16/BRAM_CLK2_INT1']]);
  assert.deepEqual(spineVariants([], new Set(), new Set()), []);
  // the long lines' switch boxes in the DCM tiles: the XC3S100E's DCMAUX ones too (regression: its 38 long-line nodes
  // a short could come from were the DCMAUX tiles' LH / LV), not the DCM_TERM tiles
  const dcm = loadDeviceCache('xc3s100ecp132-4').tileNames.filter(t => DCM_SWITCH.test(t)).sort();
  assert.deepEqual(dcm, ['DCMAUX_BL_CENTER_X8Y1', 'DCMAUX_TL_CENTER_X8Y22', 'DCM_BR_CENTER_X9Y1', 'DCM_TR_CENTER_X9Y22']);
  assert.ok(DCM_SWITCH.test('DCM_TL_CENTER_X13Y34') && !DCM_SWITCH.test('DCM_TERM_X10Y22'));
  assert.deepEqual(pinVariants(ambiguous.slice(0, 4), new Set()), []);
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

test('gen-obshdl: the pads design sized to each part, its inout pads within the bidirectional ones (#3, the other devices)', () => {
  const want = {
    'xc3s100ecp132-4': { npads: 81, ninputs: 24, bonded: 83, bidir: 72 },
    'xc3s250ecp132-4': { npads: 90, ninputs: 24, bonded: 92, bidir: 85 },
    'xc3s500efg320-4': { npads: 230, ninputs: 53, bonded: 232, bidir: 176 },
    'xc3s1200efg320-4': { npads: 248, ninputs: 53, bonded: 250, bidir: 194 },
  };
  for (const [part, w] of Object.entries(want)) {
    const d = padDefaults(loadDeviceCache(part));
    assert.deepEqual(d, w, part);
    // the clock, the inputs, the inout ones: every pad of the design, and no more inout ones than bidirectional pads
    const nb = d.npads - d.ninputs - 1;
    assert.ok(nb <= d.bidir && d.npads + 2 === d.bonded, part);
    const p = pads(d.npads, d.ninputs, part);
    assert.match(p.v, new RegExp(`module top\\(input clk, input \\[${d.ninputs - 1}:0\\] i, inout \\[${nb - 1}:0\\] p\\);`), part);
    const srcs = [{ path: 'top.v', lang: 'verilog', text: p.v }];
    const lib = compile([...primitiveSources(srcs), ...srcs]);
    assert.deepEqual([lib.errors, elaborate(lib, 'top').diags], [[], []], part);
  }
});

test('gen-obsmux, gen-obspins: the multiplexers and the DCM designs\' clock pad sized to each part (#3, the XC3S100E: 600 SLICEMs of 480, Place:1012)', () => {
  const want = {
    'xc3s100ecp132-4': { muxes: 120, clk: 'B9' },
    'xc3s250ecp132-4': { muxes: 300, clk: 'B8' },
    'xc3s500efg320-4': { muxes: 300, clk: 'B8' },
    'xc3s1200efg320-4': { muxes: 300, clk: 'B8' },
  };
  for (const [part, w] of Object.entries(want)) {
    const dev = loadDeviceCache(part);
    assert.deepEqual({ muxes: muxCount(dev), clk: dcmClockPad(dev) }, w, part);
    // (two SLICEMs a multiplexer: within the part's)
    assert.ok(2 * muxCount(dev) <= dev.sites('SLICEM').length, part);
  }
  // the XC3S100E's top DCM is right of the centre: its pad is in its column, B8 left of the centre is not
  const dev = loadDeviceCache('xc3s100ecp132-4');
  const dcm = dev.sites('DCM').find(s => s.name === 'DCM_X0Y1');
  const padTile = p => dev.tileNames.findIndex((_, t) => (dev.tileSites[t] || []).some(([s]) => s === p));
  assert.equal(dev.tileCol[padTile('B9')], dev.tileCol[dcm.tile]);
  assert.ok(dev.tileCol[padTile('B8')] < dev.tileCol[dcm.tile]);
  const clk2 = iobClk2(dev, 0, dcmClockPad(dev), 'xc3s100ecp132-4');
  assert.match(clk2.ucf, /^NET "clk" LOC = "B9" ;$/m);
  assert.doesNotMatch(clk2.ucf, /LOC = "B9" ;[\s\S]*LOC = "B9" ;/, 'the clock pad not also a data pad');
  assert.match(muxDesign(muxCount(dev), 60, 'xc3s100ecp132-4').v, /^\/\/ xc3s100ecp132-4: 120 16:1 multiplexers/);
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
  // iobddr and iobddr-b: every pad but the clock has its DDR registers in one of them (the XC3S100E's G12 among them,
  // which iobddr leaves out: its IQ2, SR, REV, ICE)
  for (const part of ['xc3s250ecp132-4', 'xc3s100ecp132-4']) {
    const g = loadDeviceCache(part), all = devicePads(g).map(p => p.name).filter(p => p !== 'B8');
    const ddr = u => [...u.matchAll(/^NET "[ab]<\d+>" LOC = "(\S+)" ;$/gm)].map(x => x[1]);
    const a = ddr(iobDdr(g).ucf), b = ddr(iobDdr(g, 'B8', part, devicePads(g), { alt: true }).ucf);
    assert.deepEqual([...new Set([...a, ...b])].sort(), all.sort(), part);
    if (part === 'xc3s100ecp132-4') assert.deepEqual([a.includes('G12'), b.includes('G12')], [false, true]);
  }
  assert.equal(read(iobDdr(dev, 'B8', 'xc3s250ecp132-4', devicePads(dev), { alt: true }).v)[0].length, 0);
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
  // and, the one undriven wire of the source's tile, the source pin's (a side BUFGMUX's O on CLKL_GCLK_PWO1)
  assert.deepEqual(a.pins.filter(p => p.dir === 'o'), [{ site: 'BUFGMUX_X0Y3', pin: 'O', dir: 'o', tile: 'CLKL_X0Y17', wire: 'CLKL_GCLK_PWO1' }]);
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

// #3, the clock network's joins tested by DRC on ISE's clock nets (clocktests.mjs)
test('clockTestDesigns: ISE\'s clock net kept to its spine and rows, without the PIP into the candidate, the tested wire\'s PIP out; a control; one buffer a design (#3, the clock network)', () => {
  const routed = parseXdl(`design "t" xc3s250ecp132-4 v3.2 , cfg "";
inst "u_b" "BUFGMUX",placed CLKT_X13Y35 BUFGMUX_X2Y10 ,
  cfg " DISABLE_ATTR::LOW GCLK_BUFFER:u_b: "
  ;
inst "s" "SLICEL",placed CLB_X3Y4 SLICE_X4Y7 ,
  cfg " "
  ;
net "g" ,
  outpin "u_b" O ,
  inpin "s" CLK ,
  pip CLKT_X13Y35 CLKT_GCLK_PINWIRE1 -> CLKT_GCLK_MAIN1 ,
  pip CLKC_X13Y17 CLKC_GCLK1 -> CLKC_GCLK_OUT_L1 ,
  pip GCLKH_X3Y5 GCLKH_GCLK_B1 -> GCLKH_GCLK_DN1 ,
  pip GCLKH_X3Y5 GCLKH_GCLK_B1 -> GCLKH_GCLK_UP1 ,
  pip CLB_X3Y4 GCLK1 -> CLK_B1 ,
  pip CLB_X3Y4 CLK_B1 -> CLK_B_PINWIRE1 ,
  ;
`);
  const [n] = clockNets(routed);
  assert.deepEqual([...n.dangling.keys()], ['CLKC_X13Y17/CLKC_GCLK1', 'GCLKH_X3Y5/GCLKH_GCLK_B1', 'CLB_X3Y4/GCLK1']);
  assert.deepEqual([clockTile('GCLKH_X3Y5'), clockTile('CLKC_X13Y17'), clockTile('BRAM2_DN_GCLKH_FEEDTHRU_X9Y5'), clockTile('CLB_X3Y4'), rowTile('GCLKH_X3Y5'), rowTile('CLKC_X13Y17')], [true, true, true, false, true, false]);
  const r = clockTestDesigns([['GCLKH_X3Y5/GCLKH_GCLK_DN1', 'CLB_X3Y4/GCLK1'], ['GCLKH_X3Y5/GCLKH_GCLK_UP1', 'CLB_X3Y4/GCLK1']], [routed], { controlEvery: 2 });
  assert.deepEqual(r.untestable, []);
  // the buffer once a design: the test of DN1 and its control, the test of UP1, three designs
  assert.equal(r.designs.length, 3);
  assert.deepEqual(r.designs.map(d => d.tests.map(t => [t.join[0].split('/')[1], t.control])), [[['GCLKH_GCLK_DN1', false]], [['GCLKH_GCLK_DN1', true]], [['GCLKH_GCLK_UP1', false]]]);
  const pipsOf = d => [...d.xdl.matchAll(/^ {2}pip (\S+) (\S+) -> (\S+) ,$/gm)].map(m => `${m[1]} ${m[2]}->${m[3]}`);
  // the spine and the rows (the CLB's clock pin's PIP left out), without the PIP into DN1, with the CLB's GCLK1 out
  assert.deepEqual(pipsOf(r.designs[0]), ['CLKT_X13Y35 CLKT_GCLK_PINWIRE1->CLKT_GCLK_MAIN1', 'CLKC_X13Y17 CLKC_GCLK1->CLKC_GCLK_OUT_L1', 'GCLKH_X3Y5 GCLKH_GCLK_B1->GCLKH_GCLK_UP1', 'CLB_X3Y4 GCLK1->CLK_B1']);
  assert.ok(pipsOf(r.designs[1]).includes('GCLKH_X3Y5 GCLKH_GCLK_B1->GCLKH_GCLK_DN1'), 'the control keeps it');
  assert.match(r.designs[0].xdl, /^inst "b0" "BUFGMUX",placed CLKT_X13Y35 BUFGMUX_X2Y10 ,\n {2}cfg "DISABLE_ATTR::LOW GCLK_BUFFER:u_b:" ;$/m);
  assert.match(r.designs[0].xdl, /^net "t0" ,\n {2}outpin "b0" O ,$/m);
  // a wire no net has with the candidate: untestable
  assert.deepEqual(clockTestDesigns([['GCLKH_X9Y5/GCLKH_GCLK_DN1', 'CLB_X3Y4/GCLK1']], [routed]).untestable, [['GCLKH_X9Y5/GCLKH_GCLK_DN1', 'CLB_X3Y4/GCLK1']]);
});

test('clockTestDesigns: a spine candidate with a baseline, the rows\' PIPs left out, once for each net and candidate (#3, the clock network)', () => {
  const routed = parseXdl(`design "t" xc3s250ecp132-4 v3.2 , cfg "";
inst "u_b" "BUFGMUX",placed CLKT_X13Y35 BUFGMUX_X2Y10 ,
  cfg " GCLK_BUFFER:u_b: "
  ;
net "g" ,
  outpin "u_b" O ,
  pip CLKT_X13Y35 CLKT_GCLK_PINWIRE1 -> CLKT_GCLK_MAIN1 ,
  pip GCLKVC_X6Y5 GCLKC_GCLK_B1 -> GCLKC_GCLK_OUT_L1 ,
  pip GCLKH_X3Y5 GCLKH_GCLK_B1 -> GCLKH_GCLK_DN1 ,
  pip GCLKH_X4Y5 GCLKH_GCLK_B1 -> GCLKH_GCLK_UP1 ,
  ;
`);
  const r = clockTestDesigns([['GCLKVC_X6Y5/GCLKC_GCLK_OUT_L1', 'GCLKH_X3Y5/GCLKH_GCLK_B1'], ['GCLKVC_X6Y5/GCLKC_GCLK_OUT_L1', 'GCLKH_X4Y5/GCLKH_GCLK_B1']], [routed]);
  const tests = r.designs.flatMap(d => d.tests.map(t => ({ ...t, pips: [...d.xdl.matchAll(/^ {2}pip (\S+) (\S+) -> (\S+) ,$/gm)].map(m => `${m[1]} ${m[2]}->${m[3]}`) })));
  // one baseline (the spine without the PIP into the candidate, no row), then each wire's test (the baseline and its PIP)
  assert.deepEqual(tests.map(t => [t.baseline ? 'baseline' : t.join[1].split('/')[0], t.pips]), [
    ['baseline', ['CLKT_X13Y35 CLKT_GCLK_PINWIRE1->CLKT_GCLK_MAIN1']],
    ['GCLKH_X3Y5', ['CLKT_X13Y35 CLKT_GCLK_PINWIRE1->CLKT_GCLK_MAIN1', 'GCLKH_X3Y5 GCLKH_GCLK_B1->GCLKH_GCLK_DN1']],
    ['GCLKH_X4Y5', ['CLKT_X13Y35 CLKT_GCLK_PINWIRE1->CLKT_GCLK_MAIN1', 'GCLKH_X4Y5 GCLKH_GCLK_B1->GCLKH_GCLK_UP1']],
  ]);
  assert.equal(tests[1].base, tests[0].baseline);
  assert.equal(tests[2].base, tests[0].baseline);
});

// #3, the edge tiles and corners: their joins' rules applied to the tiles of the same prefix; their ambiguous candidates
test('edgeHypotheses: an edge tile\'s known join as a rule for the tiles of its prefix, its ambiguous candidates; none known (#3, the edge tiles)', () => {
  const obs = {
    pips: [
      { tile: 'LTERM_X0Y3', from: 'E6END1', to: 'W6BEG1' }, { tile: 'LTERM_X0Y4', from: 'E6END1', to: 'W6BEG1' },
      { tile: 'CLB_X1Y3', from: 'W6END1', to: 'E2BEG1' }, { tile: 'CLB_X1Y4', from: 'W6END1', to: 'E2BEG1' },
      { tile: 'UL_X0Y35', from: 'OMUX_N4', to: 'N2BEG0' }, { tile: 'CLB_X1Y34', from: 'N2MID0', to: 'E2BEG0' },
    ],
    ambiguous: [
      { from: 'CLB_X1Y34/N2MID0', candidates: ['UL_X0Y35/N2BEG0', 'CLB_X2Y33/N2BEG0'] },
      { from: 'CLB_X5Y5/E2MID1', candidates: ['CLB_X4Y5/E2BEG1', 'CLB_X3Y5/E2BEG1'] },
      { from: 'CLB_X1Y5/GCLK1', candidates: ['LTERM_X0Y5/GCLK1', 'CLB_X1Y6/GCLK1'] },
    ],
  };
  const tiles = ['LTERM_X0Y3', 'LTERM_X0Y4', 'LTERM_X0Y5', 'CLB_X1Y3', 'CLB_X1Y4', 'CLB_X1Y5', 'UL_X0Y35', 'CLB_X1Y34'];
  const r = edgeHypotheses(obs, tiles, [['LTERM_X0Y3/W6BEG1', 'CLB_X1Y3/W6END1']]);
  // the rule (W6BEG1 of an LTERM, the CLB east of it) at every LTERM with a CLB there, but the known one
  assert.deepEqual(r.rules, [['LTERM_X0Y4/W6BEG1', 'CLB_X1Y4/W6END1'], ['LTERM_X0Y5/W6BEG1', 'CLB_X1Y5/W6END1']]);
  // a corner's ambiguous join, with its candidate in the edge tile (the CLB's left to the switch-box rounds); none
  // without an edge tile, none of the clock lines
  assert.deepEqual(r.ambiguous, [['UL_X0Y35/N2BEG0', 'CLB_X1Y34/N2MID0']]);
  // the refused ones (the tests' islands) are not asked again, and make no rule
  const q = edgeHypotheses(obs, tiles, [['LTERM_X0Y3/W6BEG1', 'CLB_X1Y3/W6END1']], [['LTERM_X0Y4/W6BEG1', 'CLB_X1Y4/W6END1'], ['UL_X0Y35/N2BEG0', 'CLB_X1Y34/N2MID0']]);
  assert.deepEqual(q, { rules: [['LTERM_X0Y5/W6BEG1', 'CLB_X1Y5/W6END1']], ambiguous: [] });
  // with a measured graph's wires: a rule also where no route showed the wires, only between tiles that have them
  const obs2 = { ...obs, pips: obs.pips.filter(p => p.tile !== 'CLB_X1Y4' && p.tile !== 'CLB_X1Y3') };
  assert.deepEqual(edgeHypotheses(obs2, tiles, [['LTERM_X0Y3/W6BEG1', 'CLB_X1Y3/W6END1']]).rules, []);
  const W = { LTERM_X0Y4: new Set(['W6BEG1']), CLB_X1Y4: new Set(['W6END1']), LTERM_X0Y5: new Set(['W6BEG1']) };
  assert.deepEqual(edgeHypotheses(obs2, tiles, [['LTERM_X0Y3/W6BEG1', 'CLB_X1Y3/W6END1']], [], t => W[t] || null).rules, [['LTERM_X0Y4/W6BEG1', 'CLB_X1Y4/W6END1']]);
  assert.deepEqual(['LTERM4_X0Y9', 'CNR_TTERM_X1Y35', 'COB_TERM_B_X9Y0', 'UL_X0Y35', 'CLB_X1Y1', 'TIOIS_X3Y35'].map(edgeTile), [true, true, true, true, false, false]);
});

// #3, step 5: the measured description of the whole chip, and what the observer reads for it
test('observeNet: a carry chain\'s lower CIN on the tile below\'s COUT_Nk (pinJoins); the last loose ends joined; a block RAM pin\'s family without its interconnect index (#3)', () => {
  const ins = new Map([['a', { name: 'a', tile: 'CLB_X15Y27', site: 'SLICE_X29Y55' }], ['b', { name: 'b', tile: 'CLB_X15Y28', site: 'SLICE_X29Y56' }]]);
  const c = observeNet({ name: 'cy', outpins: [{ inst: 'a', pin: 'COUT' }], inpins: [{ inst: 'b', pin: 'CIN' }], pips: [{ tile: 'CLB_X15Y27', from: 'COUT3', dir: '->', to: 'COUT_N3' }] }, ins);
  assert.deepEqual(c.pins, [{ site: 'SLICE_X29Y55', pin: 'COUT', dir: 'o', tile: 'CLB_X15Y27', wire: 'COUT3' }]);
  assert.deepEqual(c.pinJoins, [{ site: 'SLICE_X29Y56', pin: 'CIN', tile: 'CLB_X15Y28', end: 'CLB_X15Y27/COUT_N3' }]);
  // a clock pad into its buffer: IOIS_IBUF0 and CLKT_CKI4, of no family, the one loose end and the one undriven wire
  const ins2 = new Map([['p', { name: 'p', tile: 'TIBUFS_X13Y35', site: 'B8' }], ['g', { name: 'g', tile: 'CLKT_X13Y35', site: 'BUFGMUX_X1Y10' }]]);
  const k = observeNet({ name: 'ci', outpins: [{ inst: 'p', pin: 'I' }], inpins: [{ inst: 'g', pin: 'I0' }], pips: [
    { tile: 'CLKT_X13Y35', from: 'CLKT_CKI4', dir: '->', to: 'CLKT_GCLK0' }, { tile: 'CLKT_X13Y35', from: 'CLKT_GCLK0', dir: '->', to: 'CLKT_GCLKIN00' },
    { tile: 'TIBUFS_X13Y35', from: 'I0_PINWIRE', dir: '->', to: 'IOIS_IBUF0' },
  ] }, ins2);
  assert.deepEqual(k.joins, [['TIBUFS_X13Y35/IOIS_IBUF0', 'CLKT_X13Y35/CLKT_CKI4']]);
  assert.deepEqual(k.unexplained, []);
  assert.deepEqual([wireFamily('BRAM_CLK2_INT1'), wireFamily('BRAM_CLK2')], ['pin:BRAM_CLK2', 'pin:BRAM_CLK2']);
});

test('chipMeasurements: a tile\'s PIPs from the database\'s features and the routes, less the probe\'s refusals; pins where observed; the lower CIN by its COUT\'s index; the joins kept to measured wires (#3, step 5)', () => {
  const dev = loadDeviceCache('xc3s250ecp132-4');
  const tilesDb = { types: { CENTER_SMALL: { features: { 'E2END1->E2BEG1': [], 'OMUX3->E2BEG1': [], 'X0->OMUX3': [] } } } };
  const obs = {
    pips: [{ tile: 'CLB_X1Y3', from: 'COUT3', dir: '->', to: 'COUT_N3' }, { tile: 'CLB_X1Y4', from: 'E2MID1', dir: '=-', to: 'E2BEG1' }],
    pins: [{ site: 'SLICE_X1Y5', pin: 'COUT', dir: 'o', tile: 'CLB_X1Y3', wire: 'COUT3' }, { site: 'SLICE_X1Y4', pin: 'COUT', dir: 'o', tile: 'CLB_X1Y3', wire: 'COUT1' }],
    pinJoins: [{ site: 'SLICE_X1Y6', pin: 'CIN', tile: 'CLB_X1Y4', end: 'CLB_X1Y3/COUT_N3' }],
    joins: [['CLB_X1Y3/E2BEG1', 'CLB_X1Y4/E2MID1'], ['CLB_X1Y3/E2BEG1', 'CLB_X9Y9/NOWIRE']],
  };
  const m = chipMeasurements({ dev, tilesDb, layout: { brkRows: [] }, obs, probe: { yes: [], no: [{ tile: 'CLB_X1Y4', from: 'X0', to: 'OMUX3' }] } });
  const tile = n => { const t = m.tiles.find(x => x.name === n); return m.types[t.type]; };
  const pips = n => tile(n).pips.map(([a, b, f]) => `${a}->${b}${f ? '*' : ''}`).sort();
  // the database's three, the routes' (a bidirectional one both ways), the refused one left out in its tile only
  assert.deepEqual(pips('CLB_X1Y3'), ['COUT3->COUT_N3', 'E2END1->E2BEG1', 'E2MID1->E2BEG1*', 'E2BEG1->E2MID1*', 'OMUX3->E2BEG1', 'X0->OMUX3'].sort());
  assert.ok(!pips('CLB_X1Y4').includes('X0->OMUX3'));
  // SLICE_X1Y6 (position 2 of CLB_X1Y4): its COUT1 seen in another tile of the type, its CIN named CIN1, on COUT_N3
  const pin = (n, site, p) => { const t = m.tiles.find(x => x.name === n); const i = t.sites.findIndex(([s]) => s === site); return m.types[t.type].sites[i].pins.find(x => x[0] === p); };
  assert.deepEqual(pin('CLB_X1Y4', 'SLICE_X1Y6', 'CIN'), ['CIN', 'i', 'CIN1']);
  assert.ok(m.joins.some(([a, b]) => a === 'CLB_X1Y3/COUT_N3' && b === 'CLB_X1Y4/CIN1'));
  // a join with an end no measured tile has: left out
  assert.ok(!m.joins.some(j => j.includes('CLB_X9Y9/NOWIRE')));
});

test('chipMeasurements: an I/O tile\'s database names as the probe found them (IOIS_X0, no route of ISE\'s took it) (#3, the I/O names)', () => {
  const dev = loadDeviceCache('xc3s250ecp132-4');
  const tilesDb = { types: { TIOIS: { features: { 'X0->OMUX3': [], 'XQ0->OMUX3': [] } } } };
  const obs = { pips: [{ tile: 'TIOIS_X3Y35', from: 'IOIS_XQ0', dir: '->', to: 'OMUX3' }], pins: [], pinJoins: [], joins: [] };
  const pips = m => { const t = m.tiles.find(x => x.name === 'TIOIS_X5Y35'); return m.types[t.type].pips.map(([a, b]) => `${a}->${b}`).sort(); };
  // the routes name IOIS_XQ0 only: X0 stays the database's name
  assert.deepEqual(pips(chipMeasurements({ dev, tilesDb, layout: { brkRows: [] }, obs })), ['IOIS_XQ0->OMUX3', 'X0->OMUX3']);
  // the probe accepted IOIS_X0 in one tile: the name of every tile's
  const probe = { yes: [{ tile: 'TIOIS_X3Y35', from: 'IOIS_X0', to: 'OMUX3' }], no: [] };
  assert.deepEqual(pips(chipMeasurements({ dev, tilesDb, layout: { brkRows: [] }, obs, probe })), ['IOIS_X0->OMUX3', 'IOIS_XQ0->OMUX3']);
});

test('observeNet and chipMeasurements: an F8\'s FXINB from the CLB above (FX -> FX_Sk there, nothing in its own tile), on its FXINA\'s wire with A and B swapped; FX<k> of F5<k> (#3, the wide multiplexers)', () => {
  const ins = new Map([['a', { name: 'a', tile: 'CLB_X1Y2', site: 'SLICE_X0Y3' }], ['b', { name: 'b', tile: 'CLB_X1Y1', site: 'SLICE_X1Y1' }]]);
  const r = observeNet({ name: 'f7', outpins: [{ inst: 'a', pin: 'FX' }], inpins: [{ inst: 'b', pin: 'FXINB' }], pips: [{ tile: 'CLB_X1Y2', from: 'FX2', dir: '->', to: 'FX_S2' }] }, ins);
  assert.deepEqual(r.pinJoins, [{ site: 'SLICE_X1Y1', pin: 'FXINB', tile: 'CLB_X1Y1', end: 'CLB_X1Y2/FX_S2' }]);
  const dev = loadDeviceCache('xc3s250ecp132-4');
  const tilesDb = { types: { CENTER_SMALL: { features: { 'FX2->FX_S2': [] } } } };
  const obs = {
    pips: [{ tile: 'CLB_X1Y2', from: 'FX2', dir: '->', to: 'FX_S2' }], joins: [], pinJoins: r.pinJoins,
    pins: [{ site: 'SLICE_X1Y3', pin: 'FXINA', dir: 'i', tile: 'CLB_X1Y2', wire: 'FXINB3' }, { site: 'SLICE_X1Y3', pin: 'F5', dir: 'o', tile: 'CLB_X1Y2', wire: 'F53' }],
  };
  const pin = (m, n, site, p) => { const t = m.tiles.find(x => x.name === n); const i = t.sites.findIndex(([s]) => s === site); return m.types[t.type].sites[i].pins.find(x => x[0] === p); };
  // without the rules: no FXINB, no join
  const m0 = chipMeasurements({ dev, tilesDb, layout: { brkRows: [] }, obs });
  assert.equal(pin(m0, 'CLB_X1Y1', 'SLICE_X1Y1', 'FXINB'), undefined);
  const m = chipMeasurements({ dev, tilesDb, layout: { brkRows: [] }, obs, rules: true });
  assert.deepEqual(pin(m, 'CLB_X1Y1', 'SLICE_X1Y1', 'FXINB'), ['FXINB', 'i', 'FXINA3']);
  assert.deepEqual(pin(m, 'CLB_X1Y1', 'SLICE_X1Y1', 'FX'), ['FX', 'o', 'FX3']);
  assert.ok(m.joins.some(j => j.includes('CLB_X1Y2/FX_S2') && j.includes('CLB_X1Y1/FXINA3')));
});

test('observeNet: the last loose ends paired with the undriven wires the one way the net is a tree from its source (a DCM\'s CLK0 to a BUFGMUX through DCM_OMUX, CLKV, CLKT_DLL_OUT) (#3)', () => {
  const ins = new Map([['d', { name: 'd', tile: 'DCM_TL_CENTER_X13Y34', site: 'DCM_X0Y1' }], ['b', { name: 'b', tile: 'CLKT_X13Y35', site: 'BUFGMUX_X2Y11' }]]);
  const net = { name: 'clk0', outpins: [{ inst: 'd', pin: 'CLK0' }], inpins: [{ inst: 'b', pin: 'I0' }], pips: [
    { tile: 'CLKT_X13Y35', from: 'CLKT_DLL_OUTL0', dir: '->', to: 'CLKT_GCLK0' }, { tile: 'CLKT_X13Y35', from: 'CLKT_GCLK0', dir: '->', to: 'CLKT_GCLKIN00' },
    { tile: 'CLKV_X13Y34', from: 'CLKV_OMUX10_OUTL0', dir: '->', to: 'CLKV_OUTL0' },
    { tile: 'DCM_TL_CENTER_X13Y34', from: 'DCM_CLK0', dir: '->', to: 'OMUX10' }, { tile: 'DCM_TL_CENTER_X13Y34', from: 'OMUX10', dir: '->', to: 'DCM_OMUX10_CLKOUTL0' },
  ] };
  const r = observeNet(net, ins);
  assert.deepEqual(r.joins.slice().sort(), [['CLKV_X13Y34/CLKV_OUTL0', 'CLKT_X13Y35/CLKT_DLL_OUTL0'], ['DCM_TL_CENTER_X13Y34/DCM_OMUX10_CLKOUTL0', 'CLKV_X13Y34/CLKV_OMUX10_OUTL0']].sort());
  assert.deepEqual(r.unexplained, []);
  // a third undriven wire and no loose end for it: nothing joined, all left unexplained
  const r2 = observeNet({ ...net, pips: [...net.pips, { tile: 'CLKV_X13Y33', from: 'CLKV_X', dir: '->', to: 'CLKV_Y' }] }, ins);
  assert.ok(!r2.joins.some(j => j.some(w => /CLKV_OMUX10_OUTL0|CLKT_DLL_OUTL0/.test(w))));
  assert.equal(r2.unexplained.length, 3);
});

test('chipMeasurements, PINRULES: a pin joined to the next tile\'s wire in one tile joined so in every tile of its type; ICLK1 of ICLK2\'s wire; a DCM\'s pin in the other DCM tiles (#3)', () => {
  const dev = loadDeviceCache('xc3s250ecp132-4');
  const tilesDb = { types: { CENTER_SMALL: { features: { 'COUT1->COUT_N1': [] } } } };
  const obs = {
    pips: [{ tile: 'CLB_X1Y3', from: 'COUT1', dir: '->', to: 'COUT_N1' }], joins: [],
    pins: [{ site: 'SLICE_X0Y4', pin: 'COUT', dir: 'o', tile: 'CLB_X1Y3', wire: 'COUT0' }, { site: 'SLICE_X0Y5', pin: 'COUT', dir: 'o', tile: 'CLB_X1Y3', wire: 'COUT1' },
      { site: 'M4', pin: 'ICLK2', dir: 'i', tile: 'BIOIS_X11Y0', wire: 'ICLK20' }, { site: 'DCM_X0Y1', pin: 'PSCLK', dir: 'i', tile: 'DCM_TL_CENTER_X13Y34', wire: 'DCM_PSCLK_PINWIRE' }],
    pinJoins: [{ site: 'SLICE_X0Y6', pin: 'CIN', tile: 'CLB_X1Y4', end: 'CLB_X1Y3/COUT_N1' }],
  };
  const m0 = chipMeasurements({ dev, tilesDb, layout: { brkRows: [] }, obs });
  const m = chipMeasurements({ dev, tilesDb, layout: { brkRows: [] }, obs, rules: true });
  // the observed one either way; with the rules, the tile above too (CLB_X1Y5's lower SLICEM on CLB_X1Y4's COUT_N1)
  for (const x of [m0, m]) assert.ok(x.joins.some(j => j.includes('CLB_X1Y3/COUT_N1') && j.includes('CLB_X1Y4/CIN0')));
  assert.ok(!m0.joins.some(j => j.includes('CLB_X1Y5/CIN0')));
  assert.ok(m.joins.some(j => j.includes('CLB_X1Y4/COUT_N1') && j.includes('CLB_X1Y5/CIN0')));
  assert.ok(m.joinsByRule > 0);
  const pin = (n, site, p) => { const t = m.tiles.find(x => x.name === n); const i = t.sites.findIndex(([q]) => q === site); return m.types[t.type].sites[i].pins.find(x => x[0] === p); };
  assert.deepEqual(pin('BIOIS_X11Y0', 'M4', 'ICLK1'), ['ICLK1', 'i', 'ICLK10']);
  // an input-only pad's OTCLK1 / OTCLK2 (no design drives them): on <pin><k> of its I pin's Ik_PINWIRE
  const obs3 = { ...obs, pins: [...obs.pins, { site: 'C8', pin: 'I', dir: 'o', tile: 'TIBUFS_X13Y35', wire: 'I1_PINWIRE' }] };
  const m3 = chipMeasurements({ dev, tilesDb, layout: { brkRows: [] }, obs: obs3, rules: true });
  const pin3 = (n, site, p) => { const t = m3.tiles.find(x => x.name === n); const i = t.sites.findIndex(([q]) => q === site); return m3.types[t.type].sites[i].pins.find(x => x[0] === p); };
  assert.deepEqual(['ICLK1', 'OTCLK1', 'OTCLK2'].map(p => pin3('TIBUFS_X13Y35', 'C8', p)), [['ICLK1', 'i', 'ICLK11'], ['OTCLK1', 'i', 'OTCLK11'], ['OTCLK2', 'i', 'OTCLK21']]);
  assert.deepEqual(pin('DCM_BL_CENTER_X13Y1', 'DCM_X0Y0', 'PSCLK'), ['PSCLK', 'i', 'DCM_PSCLK_PINWIRE']);
});

test('gen-obscarry, gen-obsslice, gen-obsmux: the carry chains in every slice column, a flip-flop on every slice, wide multiplexers and comparators, read by Silinx\'s front end (#3, step 5)', () => {
  const dev = loadDeviceCache('xc3s250ecp132-4');
  const read = v => { const srcs = [{ path: 'top.v', lang: 'verilog', text: v }]; const lib = compile([...primitiveSources(srcs), ...srcs]); return [lib.errors, elaborate(lib, 'top').diags]; };
  const m0 = carryDesign(dev, 0, 0), l8 = carryDesign(dev, 1, 8);
  // 16 slices of one column each, the SLICEM's x even, the SLICEL's odd, the bands from the offset
  const ranges = d => [...d.ucf.matchAll(/RANGE = SLICE_X(\d+)Y(\d+):SLICE_X(\d+)Y(\d+) ;/g)].map(r => r.slice(1).map(Number));
  assert.ok(ranges(m0).every(([x0, y0, x1, y1]) => x0 === x1 && x0 % 2 === 0 && y1 - y0 === 15 && y0 % 16 === 0));
  assert.ok(ranges(l8).every(([x0, y0, x1, y1]) => x0 === x1 && x0 % 2 === 1 && y1 - y0 === 15 && y0 % 16 === 8));
  assert.equal(new Set([...m0.v.matchAll(/STEP\((\d+)\)/g)].map(x => x[1])).size, m0.counters, 'a step of its own each');
  const sl = sliceDesign(dev);
  assert.equal(sl.slices, 2448);
  assert.equal([...sl.ucf.matchAll(/LOC = "(SLICE_X\d+Y\d+)"/g)].length, 2448);
  assert.match(sl.v, /FDRE f0 \(\.C\(clk\), \.CE\(ce\[0\]\), \.R\(sr\[0\]\), \.D\(d\[0\] \^ q\[2447\]\), \.Q\(q\[0\]\)\);/);
  const mx = muxDesign(40, 8);
  // (its data and selects permuted: every multiplexer its own pair)
  assert.equal(new Set([...mx.v.matchAll(/md(\d+) = (\{[^}]*\});\n {2}wire \[3:0\] ms\d+ = (\{[^}]*\})/g)].map(x => x[2] + x[3])).size, 40, 'every multiplexer its own permutation');
  for (const v of [m0.v, sl.v, mx.v]) assert.deepEqual(read(v), [[], []]);
});

test('gen-obspins2: a shift register in every CLB, a 32:1 multiplexer in every pair of CLBs, the block RAMs\' second clock, every BUFGMUX of a clock tile; read by Silinx\'s front end (#3, the pins still missing)', () => {
  const dev = loadDeviceCache('xc3s250ecp132-4');
  const read = v => { const srcs = [{ path: 'top.v', lang: 'verilog', text: v }]; const lib = compile([...primitiveSources(srcs), ...srcs]); return [lib.errors, elaborate(lib, 'top').diags]; };
  const ranges = d => [...d.ucf.matchAll(/RANGE = SLICE_X(\d+)Y(\d+):SLICE_X(\d+)Y(\d+) ;/g)].map(r => r.slice(1).map(Number));
  // every CLB's four slices once
  const sr = srlCascade(dev);
  assert.equal(sr.n, 612);
  assert.ok(ranges(sr).every(([x0, y0, x1, y1]) => x0 % 2 === 0 && y0 % 2 === 0 && x1 === x0 + 1 && y1 === y0 + 1));
  assert.equal(new Set(ranges(sr).map(r => r.join(','))).size, 612);
  // the pairs of CLBs one above the other, from CLB row 0 or 1: together every CLB that has one above or below it
  const f8 = [0, 1].flatMap(o => [0, 1].map(c => [f8Muxes(dev, o, c), o, c]));
  for (const [d, off, col] of f8) assert.ok(ranges(d).every(([x0, y0, x1, y1]) => x1 === x0 + 1 && y1 === y0 + 3 && (y0 / 2) % 2 === off && (x0 / 2) % 2 === col));
  assert.deepEqual([f8[0][0].n + f8[1][0].n, f8[2][0].n + f8[3][0].n], [306, 272]);
  const [a, b] = [f8[0][0], f8[3][0]];
  const rb = ramClkB(dev);
  assert.equal(rb.n, 12);
  assert.match(rb.v, /RAMB16_S1_S1 u0 \(\.CLKA\(clk\)[^;]*\.CLKB\(ck2\)/);
  // the BUFGMUXes of each clock tile: 8 on each side, 4 at the top and the bottom
  const bg = ['CLKL', 'CLKR', 'CLKT', 'CLKB'].flatMap(p => [0, 1].map(o => bufgs(dev, p, o)));
  assert.deepEqual(bg.map(d => d.n), [4, 4, 4, 4, 2, 2, 2, 2]);
  assert.match(bg[0].ucf, /^INST "u0" LOC = "BUFGMUX_X0Y2" ;/);
  assert.match(bg[1].ucf, /^INST "u0" LOC = "BUFGMUX_X0Y3" ;/);
  // every multiplexer its own data and selects (XST merges equal instances)
  for (const d of [a, b]) assert.equal(new Set([...d.v.matchAll(/mux32 u\d+ \(\.d\((\{[^}]*\})\), \.s\((\{[^}]*\})\)/g)].map(x => x[1] + x[2])).size, d.n);
  for (const d of [sr, a, rb, ...bg]) assert.deepEqual(read(d.v), [[], []]);
});

test('prototype.mjs predict: the joins rules decided are hypotheses; a test not run or invalid is asked again, a refused one not (#3)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'predict-'));
  const a = ['CLB_X1Y1/E2BEG0', 'CLB_X2Y1/E2MID0'], b = ['CLB_X1Y2/E2BEG0', 'CLB_X2Y2/E2MID0'], c = ['CLB_X1Y3/E2BEG0', 'CLB_X2Y3/E2MID0'], d = ['CLB_X1Y4/E2BEG0', 'CLB_X2Y4/E2MID0'];
  fs.writeFileSync(path.join(dir, 'obs.json'), JSON.stringify({ pips: [], joins: [], decided: [a, b, c, d] }));
  fs.writeFileSync(path.join(dir, 'tiles.txt'), 'CLB_X1Y1\n');
  fs.mkdirSync(path.join(dir, 't'));
  fs.writeFileSync(path.join(dir, 't', 'verdicts.json'), JSON.stringify([[...b, 'no-join'], [...c, 'invalid'], [...d, 'not-run']]));
  execFileSync(process.execPath, ['packages/silinx-fpga/research/s3e-device/prototype.mjs', 'predict', path.join(dir, 'obs.json'), path.join(dir, 'tiles.txt'), path.join(dir, 'pred.json'), path.join(dir, 't')], { stdio: 'pipe' });
  const pred = JSON.parse(fs.readFileSync(path.join(dir, 'pred.json'), 'utf8')).map(j => j.join(' ')).sort();
  assert.deepEqual(pred, [a, c, d].map(j => j.join(' ')).sort());
  fs.rmSync(dir, { recursive: true });
});

test('varyjoins: a pair\'s index varied among the wires that exist; the clock column\'s PIPs and joins; the I/O columns\' clock lines at every index and tile (#3)', () => {
  const ok = s => v => s.has(v);
  // the same index at both ends: varied together; else each end alone
  assert.deepEqual(indexVariants('CLKV_E2BEG1', 'CLKT_SELDUB1', ok(new Set(['CLKV_E2BEG0', 'CLKV_E2BEG1'])), ok(new Set(['CLKT_SELDUB0', 'CLKT_SELDUB1']))), [['CLKV_E2BEG0', 'CLKT_SELDUB0'], ['CLKV_E2BEG1', 'CLKT_SELDUB1']]);
  assert.deepEqual(indexVariants('CLKV_E2BEG5', 'CLKT_SELDUB2', ok(new Set(['CLKV_E2BEG4', 'CLKV_E2BEG5'])), ok(new Set(['CLKT_SELDUB2']))).map(j => j.join(' ')).sort(), ['CLKV_E2BEG4 CLKT_SELDUB2', 'CLKV_E2BEG5 CLKT_SELDUB2']);
  assert.deepEqual(indexVariants('A', 'B', () => true, () => true), []);
  const W = { CLKT_X13Y35: new Set(['CLKV_E2BEG4', 'CLKV_E2BEG5', 'CLKT_SELDUB2']), TIBUFS_X13Y35: new Set(['E2BEG4', 'E2BEG5']), CLB_X1Y1: new Set(['E2BEG0', 'E2BEG1']) };
  const wiresOf = t => W[t] || null;
  // PIPs: the clock column only, none asked already
  const pips = pipVariants([{ tile: 'CLKT_X13Y35', from: 'CLKV_E2BEG5', to: 'CLKT_SELDUB2' }, { tile: 'CLB_X1Y1', from: 'E2BEG0', to: 'E2BEG1' }], wiresOf, new Set(['CLKT_X13Y35 CLKV_E2BEG5 CLKT_SELDUB2']));
  assert.deepEqual(pips, [{ tile: 'CLKT_X13Y35', from: 'CLKV_E2BEG4', to: 'CLKT_SELDUB2' }]);
  assert.deepEqual(joinVariants([['TIBUFS_X13Y35/E2BEG5', 'CLKT_X13Y35/CLKV_E2BEG5']], wiresOf, new Set()), [['TIBUFS_X13Y35/E2BEG4', 'CLKT_X13Y35/CLKV_E2BEG4'], ['TIBUFS_X13Y35/E2BEG5', 'CLKT_X13Y35/CLKV_E2BEG5']]);
  // the edge tiles, the same way: a terminal tile's taps by index; the clock column's left out with that filter
  const E = { CLB_X2Y33: new Set(['N6BEG0', 'N6BEG1']), TTERM_X2Y35: new Set(['TBTERM_N6B0', 'TBTERM_N6B1']) };
  assert.deepEqual(joinVariants([['CLB_X2Y33/N6BEG0', 'TTERM_X2Y35/TBTERM_N6B0'], ['TIBUFS_X13Y35/E2BEG5', 'CLKT_X13Y35/CLKV_E2BEG5']], t => E[t] || W[t] || null, new Set(['CLB_X2Y33/N6BEG0|TTERM_X2Y35/TBTERM_N6B0']), /^TTERM/),
    [['CLB_X2Y33/N6BEG1', 'TTERM_X2Y35/TBTERM_N6B1']]);
  // clock lines: the join at every index the two tiles have, and at the other tile of the prefix at the same offset; the
  // known one left out
  const tiles = ['LIOIS_X0Y2', 'LIOIS_X0Y3', 'LIOIS_X0Y7', 'LIOIS_X0Y8'];
  const C = Object.fromEntries(tiles.map(t => [t, new Set(['GCLK0', 'GCLK1'])]));
  const h = clockLineVariants([['LIOIS_X0Y3/GCLK0', 'LIOIS_X0Y2/GCLK0']], tiles, t => C[t] || null, new Set(['LIOIS_X0Y2/GCLK0|LIOIS_X0Y3/GCLK0']));
  assert.deepEqual(h.map(j => j.join(' ')).sort(), ['LIOIS_X0Y3/GCLK1 LIOIS_X0Y2/GCLK1', 'LIOIS_X0Y8/GCLK0 LIOIS_X0Y7/GCLK0', 'LIOIS_X0Y8/GCLK1 LIOIS_X0Y7/GCLK1'].sort());
});

test('varyjoins rows: a clock row\'s join moved to the other rows where the tiles at the same X have the wires, at every index (#3)', () => {
  const tiles = ['GCLKH_X1Y5', 'GCLKH_X2Y5', 'GCLKH_X1Y13', 'GCLKH_X2Y13', 'CLB_X1Y13', 'CLB_X2Y13', 'GCLKH_X1Y21'];
  const W = { GCLKH_X1Y5: ['GCLKH_GCLK0', 'GCLKH_GCLK1'], GCLKH_X2Y5: ['GCLKH_GCLK0', 'GCLKH_GCLK1'], GCLKH_X1Y13: ['GCLKH_GCLK0'], GCLKH_X2Y13: ['GCLKH_GCLK0'], CLB_X1Y13: ['E2BEG0'], CLB_X2Y13: ['E2BEG0'], GCLKH_X1Y21: ['GCLKH_GCLK0'] };
  const wiresOf = t => (W[t] ? new Set(W[t]) : null);
  const h = clockRowVariants([['GCLKH_X1Y5/GCLKH_GCLK0', 'GCLKH_X2Y5/GCLKH_GCLK0']], tiles, wiresOf, new Set(['GCLKH_X1Y5/GCLKH_GCLK0|GCLKH_X2Y5/GCLKH_GCLK0']));
  // row 13 (the GCLKH tiles, not the CLBs at the same coordinates), index 1 in row 5; not row 21 (no GCLKH_X2Y21)
  assert.deepEqual(h.map(j => j.join(' ')).sort(), ['GCLKH_X1Y13/GCLKH_GCLK0 GCLKH_X2Y13/GCLKH_GCLK0', 'GCLKH_X1Y5/GCLKH_GCLK1 GCLKH_X2Y5/GCLKH_GCLK1']);
});

test('chipMeasurements and packMeasured: the tiles on the device report\'s grid, not on their names\' coordinates (CLB_X13 and CLKT_X13 in columns of their own: the placer\'s halves, its distances) (#3)', () => {
  const dev = loadDeviceCache('xc3s250ecp132-4');
  const tilesDb = { types: { CENTER_SMALL: { features: { 'E2END1->E2BEG1': [] } }, CLKT: { features: { 'CLKV_E2BEG0->CLKT_CLKDUB0': [] } } } };
  const m = chipMeasurements({ dev, tilesDb, layout: { brkRows: [] }, obs: { pips: [], pins: [], pinJoins: [], joins: [] } });
  assert.deepEqual([m.rows, m.cols], [dev.rows, dev.cols]);
  const g = loadDevice(packMeasured(m));
  const rc = (D, t) => { const k = D.tile(t); return [D.tileRow[k], D.tileCol[k]]; };
  for (const t of ['CLB_X13Y15', 'CLB_X14Y15', 'CLKT_X13Y35', 'CLB_X1Y1']) assert.deepEqual(rc(g, t), rc(dev, t), t);
  assert.notEqual(rc(g, 'CLB_X13Y15')[1], rc(g, 'CLKT_X13Y35')[1]);
  // (measurements with no grid: the names' coordinates, as before)
  const old = loadDevice(packMeasured({ ...m, rows: undefined }));
  assert.equal(rc(old, 'CLB_X13Y15')[1], rc(old, 'CLKT_X13Y35')[1]);
});

test('varyjoins long: the long lines six tiles on, the index six on modulo 24 (eastwards LH, southwards LV); none on one node already (#3)', () => {
  const tiles = ['TIOIS_X1Y35', 'TIOIS_X7Y35', 'TIBUFS_X13Y35', 'LIOIS_X0Y29', 'LIOIS_X0Y23'];
  const W = { TIOIS_X1Y35: ['LH12'], TIOIS_X7Y35: ['LH18'], TIBUFS_X13Y35: ['LH0'], LIOIS_X0Y29: ['LV6'], LIOIS_X0Y23: ['LV12'] };
  const wiresOf = t => (W[t] ? new Set(W[t]) : null);
  const same = new Set(['TIOIS_X7Y35/LH18|TIBUFS_X13Y35/LH0']);
  const h = longLineVariants(tiles, wiresOf, (a, b) => same.has(`${a}|${b}`), new Set());
  // X1 -> X7 (12 -> 18), not X7 -> X13 (one node already: 18 -> 0, the index wrapping); Y29 -> Y23 (6 -> 12)
  assert.deepEqual(h.map(j => j.join(' ')).sort(), ['LIOIS_X0Y29/LV6 LIOIS_X0Y23/LV12', 'TIOIS_X1Y35/LH12 TIOIS_X7Y35/LH18']);
  // in switch boxes: the column's (the DCM tile Y34 one, its terminal rows 31-33 none) six on, nine tile rows down
  const col = ['TIBUFS_X13Y35', 'DCM_TL_CENTER_X13Y34', 'CLB_X13Y30', 'CLB_X13Y29', 'CLB_X13Y28', 'CLB_X13Y27', 'CLB_X13Y26'];
  const W2 = { TIBUFS_X13Y35: ['LV18'], CLB_X13Y26: ['LV0'], CLB_X13Y29: ['LV0'] };
  const g = longLineVariants(col, t => (W2[t] ? new Set(W2[t]) : null), () => false, new Set(), switchGrid(col));
  assert.deepEqual(g, [['TIBUFS_X13Y35/LV18', 'CLB_X13Y26/LV0']]);
});

test('varyjoins taps: a hex\'s other taps from any of them, whatever the prefix, in the tiles of their places (a segment from beyond the edge) (#3)', () => {
  const tiles = ['TTERM_X2Y35', 'CLB_X2Y34', 'CLB_X2Y33', 'CLB_X2Y32'];
  const W = { TTERM_X2Y35: ['TBTERM_S6A2'], CLB_X2Y34: ['S6B2'], CLB_X2Y33: ['S6MID2', 'S6MID3'], CLB_X2Y32: ['S6C2'] };
  const h = tapVariants(tiles, t => (W[t] ? new Set(W[t]) : null), (a, b) => a === 'CLB_X2Y34/S6B2' && b === 'CLB_X2Y33/S6MID2', new Set());
  // A (the terminal tile) to B, MID, C; B to C (B ~ MID one node already); MID to C; never index 3 with 2
  assert.deepEqual(h.map(j => j.join(' ')).sort(), ['CLB_X2Y33/S6MID2 CLB_X2Y32/S6C2', 'CLB_X2Y34/S6B2 CLB_X2Y32/S6C2',
    'TTERM_X2Y35/TBTERM_S6A2 CLB_X2Y32/S6C2', 'TTERM_X2Y35/TBTERM_S6A2 CLB_X2Y33/S6MID2', 'TTERM_X2Y35/TBTERM_S6A2 CLB_X2Y34/S6B2']);
  // the same tap in another tile of the same place; an END's END_S one row down
  const t2 = ['TTERM_X2Y35', 'TIBUFS_X2Y35', 'TIOIS_X1Y35', 'CLB_X1Y34'];
  const W2 = { TTERM_X2Y35: ['TBTERM_N6BEG2'], TIBUFS_X2Y35: ['N6BEG2'], TIOIS_X1Y35: ['S6END1'], CLB_X1Y34: ['S6END_S1'] };
  assert.deepEqual(tapVariants(t2, t => (W2[t] ? new Set(W2[t]) : null), () => false, new Set()).map(j => [...j].sort().join(' ')).sort(),
    ['CLB_X1Y34/S6END_S1 TIOIS_X1Y35/S6END1', 'TIBUFS_X2Y35/N6BEG2 TTERM_X2Y35/TBTERM_N6BEG2']);
});

test('prototype.mjs predict, WIRES: a rule applied where a measured graph has the wires, though no route showed them in the tile type (#3, the I/O tiles\' OMUX)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'predictw-'));
  // a rule from one observed join (OMUX_W14 of the tile west of an OMUX14), the tiles' wires only in the measured graph
  const obs = { pips: [{ tile: 'CLB_X5Y5', from: 'X0', dir: '->', to: 'OMUX14' }, { tile: 'CLB_X4Y5', from: 'OMUX_W14', dir: '->', to: 'F1_B0' }], joins: [['CLB_X5Y5/OMUX14', 'CLB_X4Y5/OMUX_W14']] };
  fs.writeFileSync(path.join(dir, 'obs.json'), JSON.stringify(obs));
  fs.writeFileSync(path.join(dir, 'tiles.txt'), ['CLB_X4Y5', 'CLB_X5Y5', 'TIOIS_X4Y35', 'TIOIS_X5Y35'].join('\n') + '\n');
  const dev = loadDeviceCache('xc3s250ecp132-4');
  const tilesDb = { types: { CENTER_SMALL: { features: { 'X0->OMUX14': [], 'OMUX_W14->F1_B0': [] } }, TIOIS: { features: { 'X0->OMUX14': [], 'OMUX_W14->F1_B0': [] } } } };
  const m = chipMeasurements({ dev, tilesDb, layout: { brkRows: [] }, obs: { pips: [], pins: [], pinJoins: [], joins: [] } });
  fs.writeFileSync(path.join(dir, 'g.json.gz'), zlib.gzipSync(JSON.stringify(packMeasured(m))));
  const run = env => { execFileSync(process.execPath, ['packages/silinx-fpga/research/s3e-device/prototype.mjs', 'predict', path.join(dir, 'obs.json'), path.join(dir, 'tiles.txt'), path.join(dir, 'p.json')], { stdio: 'pipe', env: { ...process.env, ...env } }); return JSON.parse(fs.readFileSync(path.join(dir, 'p.json'), 'utf8')).map(j => j.join(' ')); };
  // the I/O tiles' OMUX14 / OMUX_W14: predicted only with the measured graph's wires
  assert.ok(!run({}).includes('TIOIS_X5Y35/OMUX14 TIOIS_X4Y35/OMUX_W14'));
  assert.ok(run({ WIRES: path.join(dir, 'g.json.gz') }).some(j => j.split(' ').sort().join(' ') === 'TIOIS_X4Y35/OMUX_W14 TIOIS_X5Y35/OMUX14'));
  fs.rmSync(dir, { recursive: true });
});

test('gen-obspins2 dcmpads: every DCM on the clock pad ISE gives it (DCM_PAD), read by Silinx\'s front end (#3)', () => {
  const d = dcmPads('xc3s250ecp132-4');
  assert.equal(d.n, 4);
  for (const [dcm, pad] of [['DCM_X0Y1', 'C8'], ['DCM_X1Y1', 'A9'], ['DCM_X0Y0', 'N5'], ['DCM_X1Y0', 'M6']]) {
    const k = [...d.ucf.matchAll(/INST "g\[(\d)\]\.ud" LOC = "(DCM_X\dY\d)"/g)].find(m => m[2] === dcm)[1];
    assert.match(d.ucf, new RegExp(`NET "c<${k}>" LOC = "${pad}" ;`), dcm);
  }
  const srcs = [{ path: 'top.v', lang: 'verilog', text: d.v }];
  const lib = compile([...primitiveSources(srcs), ...srcs]);
  assert.deepEqual([lib.errors, elaborate(lib, 'top').diags], [[], []]);
});

test('build-measured: every measured die rebuilt from its measurements alone is the committed description (#3)', () => {
  assert.deepEqual(measuredDies(), ['xc3s100e', 'xc3s250e', 'xc3s500e']);
  assert.equal(dataDir('xc3s250e'), DATA_DIR);
  // (the tiles with a PIP or a site: the XC3S100E's 479 of the grid's 667, the XC3S250E's 1057 of 1419, the XC3S500E's 1760)
  const tiles = { xc3s100e: 479, xc3s250e: 1057, xc3s500e: 1760 };
  for (const die of measuredDies()) {
    const g = loadDeviceCache(PARTS[die]);
    const packed = buildMeasured(g);
    const committed = zlib.gunzipSync(fs.readFileSync(path.join(dataDir(die), 'measured.json.gz'))).toString();
    assert.equal(JSON.stringify(packed), committed, die);
    // (loads, on the device's grid, named as the part)
    const m = loadDevice(packed);
    assert.equal(m.part, PARTS[die]);
    assert.deepEqual([m.rows, m.cols], [g.rows, g.cols], die);
    assert.equal(m.tileCount, tiles[die], die);
  }
});

test('build-measured: the die of a part; a part with no die or no measurements refused (#3)', () => {
  assert.deepEqual(Object.values(PARTS).map(dieOf), ['xc3s100e', 'xc3s250e', 'xc3s500e', 'xc3s1200e']);
  assert.equal(dieOf('XC3S250EFT256-4'), 'xc3s250e');
  assert.equal(dieOf('xc3s250evq100-4'), 'xc3s250e');
  for (const p of ['xc3s1600efg320-4', 'xc6slx16csg324-3', 'xc3s250e', '', undefined]) assert.equal(dieOf(p), null, String(p));
  assert.throws(() => buildMeasured({ part: 'xc6slx16csg324-3' }), /xc6slx16csg324-3 is not a Spartan-3E part of xc3s100ecp132-4, xc3s250ecp132-4, xc3s500efg320-4, xc3s1200efg320-4/);
  // a die with no data folder yet: its missing file named
  assert.throws(() => buildMeasured({ part: 'xc3s1200efg320-4' }), /build-measured: xc3s1200e has no obs\.json\.gz in .*data[\/\\]xc3s1200e$/);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-measured-'));
  try { assert.deepEqual(measuredDies(empty), []); } finally { fs.rmSync(empty, { recursive: true }); }
});

test('research scripts: the command line recognised on Windows too (#1877: not `file://${process.argv[1]}`, a C:\\ path)', () => {
  // (on Windows process.argv[1] is C:\\…\\gen-obshdl.mjs and import.meta.url file:///C:/…/gen-obshdl.mjs: the old check
  // never matched, so measure.mjs's generators wrote nothing)
  // (the scripts git tracks: not a sync tool's copies)
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const files = execFileSync('git', ['ls-files', 'research'], { cwd: root, encoding: 'utf8' }).split('\n').filter(f => /\.mjs$/.test(f));
  assert.ok(files.length > 50);
  const old = files.filter(f => fs.readFileSync(path.join(root, f), 'utf8').includes('import.meta.url === `file://${process.argv[1]}`'));
  assert.deepEqual(old, []);
});

test('measure designs: every observation design of a part in one folder, sized to it; observe names the ones ISE did not implement (#3)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-measure-test-'));
  try {
    const names = observationDesigns('xc3s100ecp132-4', path.join(dir, 'w'));
    assert.deepEqual(GENERATORS, ['gen-obshdl', 'gen-obscarry', 'gen-obsslice', 'gen-obsmux', 'gen-obspins', 'gen-obspins2', 'gen-obsclk']);
    assert.deepEqual(names, ['bram', 'mult', 'pads', 'carry-l0', 'carry-l8', 'carry-m0', 'carry-m8', 'slices', 'muxes',
      'dcmpins', 'iobclk2-0', 'iobclk2-1', 'iobclk2-2', 'iobddr', 'iobddr-b', 'multcasc', 'ramnarrow', 'ramwide',
      'bufg-b0', 'bufg-b1', 'bufg-l0', 'bufg-l1', 'bufg-r0', 'bufg-r1', 'bufg-t0', 'bufg-t1', 'dcmpads',
      'f8-00', 'f8-01', 'f8-10', 'f8-11', 'ramclkb', 'srlcasc', 'clk0', 'clk1', 'clk2', 'clk3', 'clk4', 'clk5']);
    // the pads design sized to the XC3S100E-CP132 (81 of its 83 pads), not the XC3S250E's 90
    assert.match(fs.readFileSync(path.join(dir, 'w', 'pads', 'top.v'), 'utf8'), /^\/\/ xc3s100ecp132-4: 81 pads/);
    for (const d of names) assert.ok(fs.existsSync(path.join(dir, 'w', d, 'top.v')), d);
    // a second run into the same folder: refused, the design named
    assert.throws(() => observationDesigns('xc3s100ecp132-4', path.join(dir, 'w')), /^Error: measure: design bram of gen-obshdl written twice$/);
    // implemented: a top.xdl each
    for (const d of ['bram', 'slices']) fs.writeFileSync(path.join(dir, 'w', d, 'top.xdl'), '');
    const r = implemented(path.join(dir, 'w'));
    assert.deepEqual(r.done, ['bram', 'slices']);
    assert.equal(r.missing.length, names.length - 2);
    assert.ok(!r.missing.includes('bram') && r.missing.includes('pads'));
  } finally { fs.rmSync(dir, { recursive: true }); }
});

test('measure tiles: the switch-box tiles seen or found by the probe, the CLBs among them, as the XC3S250E\'s list (#3)', () => {
  const k = fs.readFileSync(path.join(DATA_DIR, 'switch-tiles.txt'), 'utf8').trim().split('\n');
  // seen in ISE's routes, or a PIP the probe accepted there (overlapping, out of order): the XC3S250E's list, once each
  const yes = k.slice(400).reverse().map(tile => ({ tile, from: 'W2END4', to: 'W2BEG4' }));
  const r = tileLists(k.slice(0, 500), yes);
  assert.deepEqual(r.switchTiles, k);
  assert.equal(r.clbTiles.length, 612);
  assert.ok(r.clbTiles.every(t => /^CLB_X\d+Y\d+$/.test(t)));
  // in code-unit order (CLB_X10… before CLB_X2…), as the committed file
  assert.deepEqual(tileLists(['CLB_X2Y1', 'BIOIS_X3Y0'], [{ tile: 'CLB_X10Y1' }, { tile: 'CLB_X2Y1' }]),
    { switchTiles: ['BIOIS_X3Y0', 'CLB_X10Y1', 'CLB_X2Y1'], clbTiles: ['CLB_X10Y1', 'CLB_X2Y1'] });
  assert.deepEqual(tileLists([], []), { switchTiles: [], clbTiles: [] });
});

test('measure random, round, verdicts: the random designs of a part\'s CLBs; each round across the earlier rounds\' folders; another round while one finds joins (#3)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-measure-'));
  try {
    // the XC3S100E's 240 CLBs: 4 designs, a quarter of the slices each, every one of them a slice of those CLBs
    const dev = loadDeviceCache('xc3s100ecp132-4');
    const clb100 = dev.tileNames.filter(t => /^CLB_X\d+Y\d+$/.test(t));
    assert.equal(clb100.length, 240);
    fs.writeFileSync(path.join(tmp, 'clb-tiles.txt'), clb100.join('\n') + '\n');
    const out = execFileSync(process.execPath, [path.join('packages/silinx-fpga/research/s3e-device/measure.mjs'), 'random', path.join(tmp, 'clb-tiles.txt'), path.join(tmp, 'rand')],
      { env: { ...process.env, PART: 'xc3s100ecp132-4' }, encoding: 'utf8' });
    assert.equal(out, '4 designs, 240 CLB tiles\n');
    const files = fs.readdirSync(path.join(tmp, 'rand')).sort();
    assert.deepEqual(files, ['o11.xdl', 'o12.xdl', 'o13.xdl', 'o14.xdl']);
    const slices = new Set(clb100.flatMap(t => clbSlices(t)));
    for (const f of files) {
      const x = fs.readFileSync(path.join(tmp, 'rand', f), 'utf8');
      assert.match(x, /^design "observe" xc3s100ecp132-4 v3\.2 ;$/m, f);
      const used = [...x.matchAll(/^inst "(SLICE_X\d+Y\d+)"/gm)].map(m => m[1]);
      assert.ok(used.length > 0.15 * slices.size && used.length < 0.35 * slices.size, `${f}: ${used.length} of ${slices.size} slices`);
      assert.ok(used.every(u => slices.has(u)), f);
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  // round k crosses the joins of rounds 1 to k-1, its own folder t<k>
  assert.deepEqual(roundPaths('w', 1), { pred: path.join('w', 'pred1.json'), dir: path.join('w', 't1'), tested: [] });
  assert.deepEqual(roundPaths('w', 3).tested, [path.join('w', 't1'), path.join('w', 't2')]);
  for (const k of [0, -1, 1.5, NaN]) assert.throws(() => roundPaths('w', k), /^Error: measure: round .* is not a round \(1, 2, …\)$/);
  // a round that found joins: another; none (islands, tests not run): the rounds are done
  assert.deepEqual(roundSummary([['a', 'b', 'join'], ['c', 'd', 'no-join'], ['e', 'f', 'not-run'], ['g', 'h', 'join']]), { join: 2, island: 1, other: 1, again: true });
  assert.deepEqual(roundSummary([['c', 'd', 'no-join'], ['e', 'f', 'not-run']]), { join: 0, island: 1, other: 1, again: false });
  assert.deepEqual(roundSummary([]), { join: 0, island: 0, other: 0, again: false });
});
