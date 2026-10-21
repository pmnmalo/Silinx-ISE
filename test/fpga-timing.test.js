// core/fpga/timing.js: the delay model (wire classes, routed connection delays, slice arcs), the
// static timing analysis, and the timing-driven router (core/fpga/route.js, opts.timing).
// Device: test/fixtures/fpga/timing-device.xdlrc (hand-made: three CLBs in a row, a slow way by two
// double lines and a fast one by a long line). Designs: small XDL texts below.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packDevice, loadDevice } from '../core/fpga/device.js';
import { routeDesign, checkRouting, netEndpoints } from '../core/fpga/route.js';
import { parseXdl, writeXdl } from '../core/xdl.js';
import {
  WIRE, SPEED_4, classOfWires, nodeClasses, nodeDelays, netTree, treePath, pathDelay, distanceDelay,
  instArcs, timingGraph, analyzeTiming, timingReport, clockPort, checkPeriods, delayTable, clockArrivals, parseOffsets, checkOffsets, DELAY_KIND, delayKind,
  clockSources, clockRequirement, checkCross,
} from '../core/fpga/timing.js';
import { checkSwitching, switchingLine } from '../core/fpga/timing.js';
import zlib from 'node:zlib';
import { parseDly, twrArcs, memArcs, hardArcs } from '../research/s3e-route/timing-fit.mjs';
import { parseTwrClocks } from '../research/s3e-route/dcm-timing-compare.mjs';
import { silinxPcf } from '../research/s3e-route/dcm-timing.mjs';
import { parseUcf } from '../core/ucf.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fpga');
const device = loadDevice(packDevice(fs.readFileSync(path.join(FIX, 'timing-device.xdlrc'), 'utf8')));
const S = SPEED_4.slice;
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg || ''} ${a} != ${b}`);

const inst = (name, type, tile, site, cfg) => `inst "${name}" "${type}",placed ${tile} ${site}  ,\n  cfg "${cfg}"\n  ;\n`;
const net = (name, outpins, inpins, pips = []) =>
  `net "${name}" , \n${outpins.map(([i, p]) => `  outpin "${i}" ${p} ,\n`).join('')}${inpins.map(([i, p]) => `  inpin "${i}" ${p} ,\n`).join('')}${pips.map(p => `  pip ${p} ,\n`).join('')}  ;\n`;
// a: a flip-flop (SLICE_X0Y0, a SLICEM site: the left column); b: a LUT F into a flip-flop and a LUT G (SLICE_X2Y0, also SLICEM)
const INSTS = inst('a', 'SLICEL', 'CLB_X1Y0', 'SLICE_X0Y0', ' FFX:a:#FF DXMUX::1 FXMUX::F ')
  + inst('b', 'SLICEL', 'CLB_X3Y0', 'SLICE_X2Y0', ' F:b_f:#LUT:D=A1 G:b_g:#LUT:D=A1 FXMUX::F GYMUX::G FFX:b:#FF DXMUX::1 ')
  + inst('ck', 'IOB', 'CLB_X1Y0', 'P1', ' ');
const CLK = net('clk', [['ck', 'I']], [['a', 'CLK'], ['b', 'CLK']]);
const design = nets => parseXdl(`design "t" xc3s50etq144-4 v3.2 ,\n  cfg "";\n${INSTS}${CLK}${nets}`);
// d: a.XQ to b.G1 (not timed: G -> Y goes to no flip-flop) and to b.F1 (timed: F -> X -> the flip-flop)
const D_NET = net('d', [['a', 'XQ']], [['b', 'G1'], ['b', 'F1']]);
const pipsOf = (r, name) => r.design.nets.filter(n => n.name === name).flatMap(n => n.pips.map(p => `${p.tile} ${p.from} -> ${p.to}`)).sort();

test('wire classes: from the names of a node\'s wires (long line, hex, double, OMUX, clock, input multiplexer, I/O) and site pins', () => {
  assert.equal(classOfWires(['LH12']), WIRE.LONG);
  assert.equal(classOfWires(['CLKV_LV3', 'LV3']), WIRE.LONG);
  assert.equal(classOfWires(['LH0_TESTWIRE', 'OMUX3']), WIRE.OMUX, 'test wires are not long lines');
  assert.equal(classOfWires(['E6BEG2', 'E6A2', 'E6MID2', 'E6END2']), WIRE.HEX);
  assert.equal(classOfWires(['N2BEG5', 'N2MID5', 'N2END_N5']), WIRE.DOUBLE);
  assert.equal(classOfWires(['OMUX_NW10', 'N2BEG1']), WIRE.DOUBLE, 'the longest class of the node wins');
  assert.equal(classOfWires(['OMUX_N12']), WIRE.OMUX);
  assert.equal(classOfWires(['GCLKH_GCLK_DN4']), WIRE.GCLK);
  assert.equal(classOfWires(['G3_B2']), WIRE.IMUX);
  assert.equal(classOfWires(['BX1']), WIRE.IMUX);
  assert.equal(classOfWires(['IOIS_Y2']), WIRE.IO);
  assert.equal(classOfWires(['SOMETHING']), WIRE.OTHER);
  // the block-RAM interconnect wires into and out of a block RAM or multiplier (#457)
  for (const w of ['BRAM_DIA_B16', 'BRAM_DIPB_B1', 'BRAM_ADDRA_B3', 'BRAM_MULTINB_B7']) assert.equal(classOfWires([w]), WIRE.HARD_IN, w);
  for (const w of ['BRAM_DOA0', 'BRAM_DOPB1', 'BRAM_MOUT32']) assert.equal(classOfWires([w]), WIRE.HARD_OUT, w);
  assert.equal(classOfWires(['BRAM_CE_B0']), WIRE.IMUX, 'a control pin\'s wire is an input multiplexer, as a slice\'s');
  assert.deepEqual([SPEED_4.wire[WIRE.HARD_IN], SPEED_4.wire[WIRE.HARD_OUT]], [0.24, 0]);
  assert.equal(classOfWires(['F1_B_PINWIRE0'], true), WIRE.PIN);
  assert.equal(classOfWires(['XQ0'], false, true), WIRE.OUT);
  // on the device: every node classified once (cached), site pins by the sites' pin wires
  const cls = nodeClasses(device);
  assert.equal(nodeClasses(device), cls);
  assert.equal(cls[device.node('CLB_X1Y0', 'OMUX0')], WIRE.OMUX);
  assert.equal(cls[device.node('CLB_X2Y0', 'E2END0')], WIRE.DOUBLE);
  assert.equal(cls[device.node('CLB_X3Y0', 'LH0')], WIRE.LONG);
  assert.equal(cls[device.node('CLB_X1Y0', 'XQ0')], WIRE.OUT);
  assert.equal(cls[device.node('CLB_X3Y0', 'F1_B_PINWIRE0')], WIRE.PIN);
  const nd = nodeDelays(device);
  assert.equal(nd[device.node('CLB_X3Y0', 'LH0')], Math.fround(SPEED_4.wire[WIRE.LONG]));
  assert.equal(nodeDelays(device), nd);
});

test('routed connection delays: the path in the net\'s tree, node delays and branch loads; a dedicated connection takes none', () => {
  const src = device.node('CLB_X1Y0', 'XQ0');
  const pips = [{ tile: 'CLB_X1Y0', from: 'XQ0', dir: '->', to: 'OMUX0' }, { tile: 'CLB_X1Y0', from: 'OMUX0', dir: '->', to: 'LH0' },
    { tile: 'CLB_X3Y0', from: 'LH0', dir: '->', to: 'F1_B_PINWIRE0' }, { tile: 'CLB_X1Y0', from: 'OMUX0', dir: '->', to: 'E2BEG0' },
    { tile: 'CLB_X2Y0', from: 'E2END0', dir: '->', to: 'E2BEG1' }, { tile: 'CLB_X3Y0', from: 'E2END1', dir: '->', to: 'G1_B_PINWIRE0' }];
  const tree = netTree(pips, [src], device);
  const f1 = device.node('CLB_X3Y0', 'F1_B_PINWIRE0'), g1 = device.node('CLB_X3Y0', 'G1_B_PINWIRE0');
  assert.deepEqual(treePath(tree, f1), [src, device.node('CLB_X1Y0', 'OMUX0'), device.node('CLB_X1Y0', 'LH0'), f1]);
  assert.equal(treePath(tree, device.node('CLB_X3Y0', 'X0')), null);
  const W = SPEED_4.wire, B = SPEED_4.branch;
  // OMUX0 has two branches (to LH0 and to E2BEG0): one extra branch load
  close(pathDelay(treePath(tree, f1), tree, device), SPEED_4.base + W[WIRE.OMUX] + B[WIRE.OMUX] + W[WIRE.LONG] + W[WIRE.PIN]);
  close(pathDelay(treePath(tree, g1), tree, device), SPEED_4.base + W[WIRE.OMUX] + B[WIRE.OMUX] + 2 * W[WIRE.DOUBLE]);
  // no general routing wire on the path (a carry chain, F5 -> FXINA): no delay
  assert.equal(pathDelay([src, f1], { children: new Map() }, device), 0);
  // a PIP the device does not have: no tree
  assert.equal(netTree([{ tile: 'CLB_X1Y0', from: 'XQ0', dir: '->', to: 'LH0' }], [src], device), null);
  // unrouted: from the distance (tiles), slower per tile up to the knee, then by long lines
  const { base, perTile, knee, far } = SPEED_4.dist;
  close(distanceDelay(src, f1, device), base + 2 * perTile);
  const m = { ...SPEED_4, dist: { base: 1, perTile: 0.5, knee: 1, far: 0.1 } };
  close(distanceDelay(src, f1, device, m), 1 + 0.5 + 0.1);
  assert.ok(knee > 0 && far < perTile);
});

test('slice arcs: LUT, F5 / FX multiplexers, carry chain (its data input), flip-flops by DXMUX / DYMUX; SLICEM or SLICEL by the site', () => {
  const sl = (site, cfg) => instArcs({ type: 'SLICEL', site, cfg: cfg.map(([attr, value]) => ({ attr, name: '', value })) });
  const find = (a, i, o) => a.comb.filter(x => x[0] === i && x[1] === o).map(x => x[2]);
  // FXMUX = F, FFX from X: F1 -> X is a LUT; the setup through it adds Tdxck; XQ is Tcko
  const l = sl('SLICE_X1Y0', [['FXMUX', 'F'], ['GYMUX', 'G'], ['FFX', '#FF'], ['DXMUX', '1']]);
  assert.deepEqual(find(l, 'F3', 'X'), [S.Tilo[0]]);
  assert.deepEqual(l.setup.find(x => x[0] === 'F3'), ['F3', S.Tilo[0] + S.Tdxck[0]]);
  assert.deepEqual(l.clkToOut, [['XQ', S.TckoX[0]]]);
  assert.ok(l.clock);
  assert.ok(l.setup.some(x => x[0] === 'CE') && l.setup.some(x => x[0] === 'SR'));
  // the same on a SLICEM site (even X): SLICEM delays, whatever the type written
  const m = sl('SLICE_X2Y5', [['FXMUX', 'F'], ['FFX', '#FF'], ['DXMUX', '1']]);
  assert.deepEqual(find(m, 'F1', 'X'), [S.Tilo[1]]);
  // DXMUX = 0: the flip-flop from BX (Tdick), the LUT not on its way
  const b = sl('SLICE_X1Y0', [['FXMUX', 'F'], ['FFX', '#FF'], ['DXMUX', '0']]);
  assert.deepEqual(b.setup.filter(x => /^F/.test(x[0])), []);
  assert.deepEqual(b.setup.find(x => x[0] === 'BX'), ['BX', S.Tdick[0]]);
  // DYMUX = 0: BY into the Y flip-flop (Tdyck, slower than BX's; SLICEM slower still)
  const by = sl('SLICE_X1Y0', [['GYMUX', 'G'], ['FFY', '#FF'], ['DYMUX', '0']]);
  assert.deepEqual(by.setup.find(x => x[0] === 'BY'), ['BY', S.Tdyck[0]]);
  assert.deepEqual(sl('SLICE_X2Y0', [['GYMUX', 'G'], ['FFY', '#FF'], ['DYMUX', '0']]).setup.find(x => x[0] === 'BY'), ['BY', S.Tdyck[1]]);
  // F5 into X, FX into Y; F5 / FX outputs
  const w = sl('SLICE_X1Y0', [['FXMUX', 'F5'], ['GYMUX', 'FX']]);
  assert.deepEqual(find(w, 'G2', 'X'), [S.Tif5x[0]]);
  assert.deepEqual(find(w, 'BX', 'X'), [S.Tbxx[0]]);
  assert.deepEqual(find(w, 'FXINB', 'Y'), [S.Tif6y[0]]);
  assert.deepEqual(find(w, 'BY', 'Y'), [S.Tbyy[0]]);
  assert.deepEqual(find(w, 'F1', 'F5'), [S.Tif5[0]]);
  assert.deepEqual(find(w, 'FXINA', 'FX'), [S.Tinafx[0]]);
  assert.ok(!w.clock && !w.clkToOut.length && !w.setup.length);
  // carry: CYINIT = CIN; the G LUT pin that is also CY0G's data input is slower; BX as CY0F
  const c = sl('SLICE_X1Y0', [['FXMUX', 'FXOR'], ['GYMUX', 'GXOR'], ['CYINIT', 'CIN'], ['CY0F', 'BX'], ['CY0G', 'G1']]);
  assert.deepEqual(find(c, 'CIN', 'COUT'), [S.Tbyp[0]]);
  assert.deepEqual(find(c, 'CIN', 'Y'), [S.Tciny[0]]);
  assert.deepEqual(find(c, 'CIN', 'X'), [S.Tcinx[0]]);
  assert.deepEqual(find(c, 'G1', 'COUT'), [S.TopcygDI[0]]);
  assert.deepEqual(find(c, 'G2', 'COUT'), [S.Topcyg[0]]);
  assert.deepEqual(find(c, 'BX', 'COUT'), [S.Tbxcy[0]]);
  assert.deepEqual(find(c, 'F2', 'Y'), [S.Topy[0]]);
  // BX as CY0F reaches Y through the F stage's carry and the G XOR (trce's Tbxy: verilog-uart's
  // critical path went through it, unseen by the analysis before 15.10.3)
  assert.deepEqual(find(c, 'BX', 'Y'), [S.Tbxy[0]]);
  assert.deepEqual(find(c, 'BX', 'X'), []);
  // F1 as CY0F: slower to COUT than another F pin (trce: 1.162 against 0.953)
  const cf = sl('SLICE_X1Y0', [['FXMUX', 'FXOR'], ['GYMUX', 'GXOR'], ['CYINIT', 'CIN'], ['CY0F', 'F1'], ['CY0G', 'G1']]);
  assert.deepEqual(find(cf, 'F1', 'COUT'), [S.TopcyfDI[0]]);
  assert.deepEqual(find(cf, 'F2', 'COUT'), [S.Topcyf[0]]);
  assert.ok(S.TopcyfDI[0] > S.Topcyf[0]);
  assert.deepEqual(find(cf, 'BX', 'Y'), []);
  // CYINIT = BX: the chain starts from BX
  const c0 = sl('SLICE_X1Y0', [['GYMUX', 'GXOR'], ['CYINIT', 'BX']]);
  assert.deepEqual(find(c0, 'BX', 'COUT'), [S.Tbxcy[0]]);
  assert.deepEqual(find(c0, 'CIN', 'COUT'), []);
  // pads start and end paths; other sites have no arcs
  const p = instArcs({ type: 'IOB', site: 'P1', cfg: [] });
  assert.deepEqual([p.input, p.output], [[['I', SPEED_4.pad.Tiopi]], [['O1', SPEED_4.pad.Tioop]]]);
  assert.deepEqual(instArcs({ type: 'BUFGMUX', site: 'B', cfg: [] }).comb, []);
});

test('static timing: the clock period of flip-flop to flip-flop paths, the critical path, slack and criticality of each connection', () => {
  const d = design(D_NET);
  const tg = timingGraph(d);
  // the connections: the data net only (not the clock)
  assert.deepEqual(tg.conns.map(c => `${c.net} ${c.fromPin.inst}.${c.fromPin.pin} -> ${c.toPin.inst}.${c.toPin.pin}`), ['d a.XQ -> b.G1', 'd a.XQ -> b.F1']);
  const r = tg.analyze(Float64Array.from([2, 1]));
  // a.XQ (Tcko, SLICEM) -> 1 ns -> b.F1 -> X (LUT) -> flip-flop setup
  close(r.period, S.TckoX[1] + 1 + S.Tilo[1] + S.Tdxck[1]);
  assert.deepEqual(r.clocks.map(c => c.clock), ['clk']);
  assert.deepEqual(r.clocks[0].path.map(s => `${s.kind} ${s.inst}.${s.pin}`), ['clock-to-out a.XQ', 'net b.F1', 'setup b.F1']);
  close(r.slack[1], 0);
  assert.equal(r.crit[1], 1);
  assert.equal(r.slack[0], Infinity, 'b.G1 leads to no flip-flop');
  assert.equal(r.crit[0], 0);
  // slower connection, longer period; criticality follows
  const r2 = tg.analyze(Float64Array.from([0, 3]));
  close(r2.period - r.period, 2);
  assert.match(timingReport(r2)[0], /^clock clk: minimum period \d+\.\d{3} ns \(\d+\.\d MHz\)$/);
  // flip-flops on different clocks: not a period path
  const d2 = parseXdl(`design "t" xc3s50etq144-4 v3.2 ,\n  cfg "";\n${INSTS}${net('c1', [['ck', 'I']], [['a', 'CLK']])}${net('c2', [['ck', 'I']], [['b', 'CLK']])}${D_NET}`);
  const r3 = timingGraph(d2).analyze(Float64Array.from([1, 1]));
  assert.equal(r3.period, 0);
  assert.deepEqual(r3.clocks, []);
});

test('static timing: a path between the clock\'s two edges limits the period to twice its delay, as trce counts it (#442)', () => {
  // a and b of INSTS, each on the rising (CLKINV::CLK) or falling (CLKINV::CLK_B) edge
  const edges = (ea, eb) => parseXdl(`design "t" xc3s50etq144-4 v3.2 ,\n  cfg "";\n`
    + inst('a', 'SLICEL', 'CLB_X1Y0', 'SLICE_X0Y0', ` FFX:a:#FF DXMUX::1 FXMUX::F CLKINV::${ea} `)
    + inst('b', 'SLICEL', 'CLB_X3Y0', 'SLICE_X2Y0', ` F:b_f:#LUT:D=A1 G:b_g:#LUT:D=A1 FXMUX::F GYMUX::G FFX:b:#FF DXMUX::1 CLKINV::${eb} `)
    + inst('ck', 'IOB', 'CLB_X1Y0', 'P1', ' ') + CLK + D_NET);
  const path = S.TckoX[1] + 1 + S.Tilo[1] + S.Tdxck[1];
  const run = (ea, eb) => timingGraph(edges(ea, eb)).analyze(Float64Array.from([2, 1]));
  // same edge, rising or falling: a whole period
  for (const [ea, eb] of [['CLK', 'CLK'], ['CLK_B', 'CLK_B']]) {
    const r = run(ea, eb);
    close(r.period, path, `${ea} -> ${eb}`);
    assert.equal(r.clocks[0].half, false);
    close(r.slack[1], 0);
  }
  // rising into falling, or falling into rising: half a period, twice the delay; its slack against half the period
  for (const [ea, eb] of [['CLK', 'CLK_B'], ['CLK_B', 'CLK']]) {
    const r = run(ea, eb);
    close(r.period, 2 * path, `${ea} -> ${eb}`);
    assert.equal(r.clocks[0].half, true);
    assert.deepEqual(r.clocks[0].path.map(s => `${s.kind} ${s.inst}.${s.pin}`), ['clock-to-out a.XQ', 'net b.F1', 'setup b.F1']);
    close(r.slack[1], 0);
    assert.equal(r.crit[1], 1);
  }
});

test('static timing: a combinational loop does not hang the analysis; constants and clocks are not connections', () => {
  const loop = inst('l', 'SLICEL', 'CLB_X3Y0', 'SLICE_X2Y0', ' FXMUX::F GYMUX::G ');
  const d = parseXdl(`design "t" xc3s50etq144-4 v3.2 ,\n  cfg "";\n${loop}${net('x', [['l', 'X']], [['l', 'G1']])}${net('y', [['l', 'Y']], [['l', 'F1']])}`
    + 'net "g" gnd , \n  inpin "l" F2 ,\n  ;\n');
  const tg = timingGraph(d);
  assert.deepEqual(tg.conns.map(c => c.net), ['x', 'y']);
  const r = tg.analyze(Float64Array.from([1, 1]));
  assert.equal(r.period, 0);
});

test('analyzeTiming: connection delays from the design\'s routing, or from the distance when a net has no PIPs', () => {
  const unrouted = analyzeTiming(design(D_NET), device);
  const est = distanceDelay(device.node('CLB_X1Y0', 'XQ0'), device.node('CLB_X3Y0', 'F1_B_PINWIRE0'), device);
  close(unrouted.conns[1].delay, est);
  const fast = design(net('d', [['a', 'XQ']], [['b', 'F1']], ['CLB_X1Y0 XQ0 -> OMUX0', 'CLB_X1Y0 OMUX0 -> LH0', 'CLB_X3Y0 LH0 -> F1_B_PINWIRE0']));
  const slow = design(net('d', [['a', 'XQ']], [['b', 'F1']], ['CLB_X1Y0 XQ0 -> OMUX0', 'CLB_X1Y0 OMUX0 -> E2BEG0', 'CLB_X2Y0 E2END0 -> E2BEG1', 'CLB_X3Y0 E2END1 -> F1_B_PINWIRE0']));
  const W = SPEED_4.wire;
  const rf = analyzeTiming(fast, device), rs = analyzeTiming(slow, device);
  close(rf.conns[0].delay, SPEED_4.base + W[WIRE.OMUX] + W[WIRE.LONG]);
  close(rs.conns[0].delay, SPEED_4.base + W[WIRE.OMUX] + 2 * W[WIRE.DOUBLE]);
  close(rs.period - rf.period, 2 * W[WIRE.DOUBLE] - W[WIRE.LONG]);
  assert.deepEqual(rf.conns.map(c => [c.net, c.from, c.to, c.crit]), [['d', 'a.XQ', 'b.F1', 1]]);
});

test('timing-driven routing: the critical load gets the fast long line, routed first; without timing it branches off the doubles', () => {
  // b.G1 can only be reached by the doubles; b.F1 by the doubles (branching off G1's path: one new
  // node) or by the long line from the source (two new nodes, but faster)
  const plain = routeDesign(design(D_NET), device);
  assert.deepEqual(plain.failed, []);
  assert.ok(!pipsOf(plain, 'd').includes('CLB_X3Y0 LH0 -> F1_B_PINWIRE0'));
  assert.ok(pipsOf(plain, 'd').includes('CLB_X3Y0 E2END1 -> F1_B_PINWIRE0'));
  assert.equal(plain.period, null);
  const timed = routeDesign(design(D_NET), device, { timing: true });
  assert.deepEqual(timed.failed, []);
  assert.deepEqual(pipsOf(timed, 'd'), ['CLB_X1Y0 OMUX0 -> E2BEG0', 'CLB_X1Y0 OMUX0 -> LH0', 'CLB_X1Y0 XQ0 -> OMUX0', 'CLB_X2Y0 E2END0 -> E2BEG1', 'CLB_X3Y0 E2END1 -> G1_B_PINWIRE0', 'CLB_X3Y0 LH0 -> F1_B_PINWIRE0']);
  assert.ok(checkRouting(timed.design, device).ok);
  // the router's period is the analysis of the routing it returns, and shorter than without timing
  const sta = analyzeTiming(parseXdl(writeXdl(timed.design)), device);
  close(timed.period, sta.period);
  assert.ok(sta.period < analyzeTiming(parseXdl(writeXdl(plain.design)), device).period);
  // a net with no timed load is routed as before
  const g = routeDesign(design(net('d', [['a', 'XQ']], [['b', 'G1']])), device, { timing: true });
  assert.deepEqual(pipsOf(g, 'd'), ['CLB_X1Y0 OMUX0 -> E2BEG0', 'CLB_X1Y0 XQ0 -> OMUX0', 'CLB_X2Y0 E2END0 -> E2BEG1', 'CLB_X3Y0 E2END1 -> G1_B_PINWIRE0']);
  // the long line not allowed: the doubles, still legal
  const noLong = routeDesign(design(D_NET), device, { timing: true, allowPip: (t, f, to) => to !== 'LH0' });
  assert.deepEqual(noLong.failed, []);
  assert.ok(pipsOf(noLong, 'd').includes('CLB_X3Y0 E2END1 -> F1_B_PINWIRE0'));
  assert.ok(netEndpoints(noLong.design, device).errors.length === 0);
});

test('SLICEM memory arcs, as trce times them (#443): a shift register\'s and a RAM\'s clock to X / Y, data, address and enable setups', () => {
  const M = SPEED_4.mem;
  const sl = cfg => instArcs({ type: 'SLICEM', site: 'SLICE_X2Y0', cfg: cfg.map(([attr, value]) => ({ attr, name: '', value })) });
  const setupOf = (a, p) => a.setup.filter(x => x[0] === p).map(x => x[1]);
  // trce's values (research/s3e-route/timing-fit.mjs --arcs on the srl and dram fixtures, feat_srl, feat_srl_var,
  // hard_prim), on either clock edge
  assert.deepEqual([M.Treg, M.Tshcko, M.Tshckof5, M.TdsX, M.TdsY, M.TdsAlt, M.Tbxs, M.Tas, M.Tws], [3.762, 1.956, 2.349, 0.414, 0.442, 0.461, 0.619, 0.522, 0.392]);
  // two shift registers, data through BX and BY: Treg on X and Y, Tds of each pin, the shift enable on SR
  const srl = sl([['F', '#RAM:D=0x0000'], ['G', '#RAM:D=0x0000'], ['F_ATTR', 'SHIFT_REG'], ['G_ATTR', 'SHIFT_REG'], ['DIF_MUX', 'BX'], ['DIG_MUX', 'BY'], ['FXMUX', 'F'], ['GYMUX', 'G'], ['CLKINV', 'CLK_B']]);
  assert.deepEqual(srl.clkToOut, [['X', M.Treg], ['Y', M.Treg]]);
  assert.deepEqual([setupOf(srl, 'BX'), setupOf(srl, 'BY'), setupOf(srl, 'SR')], [[M.TdsX], [M.TdsY], [M.Tws]]);
  assert.deepEqual(setupOf(srl, 'F1'), [], 'a shift register\'s address is a read address only');
  // a dual-port RAM (BY into F too, ALTDIF): its outputs change after a write (Tshcko, not modelled before: the dram
  // fixture had no timed path), its address pins set up for the write
  const dp = sl([['F', '#RAM:D=0x0000'], ['G', '#RAM:D=0x0000'], ['F_ATTR', 'DUAL_PORT'], ['G_ATTR', 'DUAL_PORT'], ['DIF_MUX', 'ALTDIF'], ['DIG_MUX', 'BY'], ['FXMUX', 'F'], ['GYMUX', 'G']]);
  assert.deepEqual(dp.clkToOut, [['X', M.Tshcko], ['Y', M.Tshcko]]);
  assert.deepEqual([setupOf(dp, 'BY'), setupOf(dp, 'BX'), setupOf(dp, 'G3'), setupOf(dp, 'F1')], [[M.TdsAlt], [], [M.Tas], [M.Tas]]);
  // a RAM32X1S: X through the F5 multiplexer, BX its write address A4 (SLICEWE0)
  const r32 = sl([['F', '#RAM:D=0x0000'], ['G', '#RAM:D=0x0000'], ['DIF_MUX', 'ALTDIF'], ['DIG_MUX', 'BY'], ['FXMUX', 'F5'], ['SLICEWE0USED', '0']]);
  assert.deepEqual(r32.clkToOut.find(x => x[0] === 'X'), ['X', M.Tshckof5]);
  assert.deepEqual(setupOf(r32, 'BX'), [M.Tbxs]);
});

test('block RAM and multiplier arcs, as trce times them (#457): clock to out, setups, A / B -> P by the product bit', () => {
  const B = SPEED_4.bram, M = SPEED_4.mult;
  // trce's values (research/s3e-route/timing-fit.mjs --arcs on hard_prim, feat_bram, feat_const_bram, feat_mult,
  // feat_const_mult, feat_constmult, stopwatch and the multipliers with input registers): the same at every width
  assert.deepEqual([B.Tbcko, B.Tback, B.Tbdck, B.Tbeck, B.Tbwck, B.Tbrck], [2.812, 0.377, 0.227, 0.770, 1.253, 0.705]);
  assert.deepEqual([M.TmsckpP, M.TmsdckP, M.TmsdckA, M.TmsdckB, M.Tmscck, M.Tmsrck], [1.100, 3.980, 0.223, 0.384, 0.735, 0.736]);
  // through the multiplier: P0..P5 the same, then slower up to P17, the same from there
  assert.deepEqual([0, 5, 6, 7, 13, 16, 17, 35].map(j => M.Tmult[j]), [3.657, 3.657, 4.086, 4.344, 4.757, 4.860, 4.873, 4.873]);
  assert.deepEqual([0, 5, 6, 7, 13, 16, 17, 35].map(j => M.Tmsckp[j]), [3.917, 3.917, 4.175, 4.433, 4.846, 4.949, 4.962, 4.962]);
  assert.equal(M.Tmult.length, 36);
  assert.equal(M.Tmsckp.length, 36);
  const cfg = c => Object.entries(c).map(([attr, value]) => ({ attr, name: '', value }));
  const mult = c => instArcs({ type: 'MULT18X18SIO', site: 'MULT18X18_X0Y0', cfg: cfg(c) });
  const setupOf = (a, p) => a.setup.filter(x => x[0] === p).map(x => x[1]);
  // combinational: A / B -> P[j], nothing clocked
  const comb = mult({ AREG: '0', BREG: '0', PREG: '0' });
  assert.equal(comb.clock, false);
  assert.deepEqual(comb.comb.filter(([i, o]) => i === 'A3' && ['P0', 'P13', 'P35'].includes(o)), [['A3', 'P0', 3.657], ['A3', 'P13', 4.757], ['A3', 'P35', 4.873]]);
  assert.deepEqual([comb.setup, comb.clkToOut], [[], []]);
  // input registers, no product register: CLK -> P[j] (trce's Tmsckp_AB / Tmsckp_B), A / B into their registers
  const inReg = mult({ AREG: '1', BREG: '1', PREG: '0' });
  assert.deepEqual([inReg.comb, inReg.clkToOut.find(x => x[0] === 'P7'), setupOf(inReg, 'A0'), setupOf(inReg, 'B17')], [[], ['P7', 4.433], [0.223], [0.384]]);
  assert.deepEqual(['CEA', 'CEB', 'CEP', 'RSTA', 'RSTB', 'RSTP'].map(p => setupOf(inReg, p)[0]), [0.735, 0.735, 0.735, 0.736, 0.736, 0.736]);
  // B registered only: A through the multiplier, B into its register
  const bReg = mult({ AREG: '0', BREG: '1', PREG: '0' });
  assert.deepEqual([bReg.comb.find(([i, o]) => i === 'A0' && o === 'P6'), setupOf(bReg, 'A0'), setupOf(bReg, 'B0'), bReg.clkToOut.find(x => x[0] === 'P0')], [['A0', 'P6', 4.086], [], [0.384], ['P0', 3.917]]);
  // the product register: an input not registered sets up through the multiplier (Tmsdck_P), CLK -> P is Tmsckp_P
  const pReg = mult({ AREG: '1', BREG: '0', PREG: '1' });
  assert.deepEqual([setupOf(pReg, 'A5'), setupOf(pReg, 'B5'), pReg.clkToOut.find(x => x[0] === 'P20'), pReg.comb], [[0.223], [3.980], ['P20', 1.100], []]);
  // a block RAM (port A only): its outputs, address, data, enable, write enable and reset
  const bram = instArcs({ type: 'RAMB16', site: 'RAMB16_X0Y0', cfg: cfg({ PORTA_ATTR: '1024X18' }) });
  assert.deepEqual([bram.clkToOut.find(x => x[0] === 'DOA5'), bram.clkToOut.find(x => x[0] === 'DOPA1'), bram.clkToOut.some(x => x[0] === 'DOB0')], [['DOA5', 2.812], ['DOPA1', 2.812], false]);
  assert.deepEqual(['ADDRA13', 'DIA0', 'DIPA1', 'ENA', 'WEA', 'SSRA'].map(p => setupOf(bram, p)[0]), [0.377, 0.227, 0.227, 0.770, 1.253, 0.705]);
});

// Designs routed by Silinx, timed by ISE's trce -a on the same routing (test/fixtures/fpga/trce/README.md): Silinx's
// analysis within 2 % of trce's minimum period. Before #457 (the block RAM and multiplier arcs estimated, their
// interconnect wires counted as any other): hard_prim 8.390 ns (+17.4 %), mult_reg 9.098 (+4.3 %), stopwatch 12.867.
test('static timing against trce on routed designs with block RAMs and multipliers (#457)', async () => {
  const { loadDeviceCache } = await import('../core/fpga/device-node.js');
  const g = loadDeviceCache('xc3s250ecp132-4');
  for (const [name, trce, period] of [['hard_prim', 7.147, 7.110], ['mult_reg', 8.722, 8.711], ['stopwatch', 12.719, 12.602]]) {
    const d = parseXdl(zlib.gunzipSync(fs.readFileSync(path.join(FIX, 'trce', `${name}.xdl.gz`))).toString('utf8'));
    const sta = analyzeTiming(d, g);
    assert.ok(Math.abs(sta.period - period) < 0.0005, `${name}: ${sta.period}`);
    assert.ok(Math.abs(sta.period - trce) / trce < 0.02, `${name}: ${sta.period} against trce's ${trce}`);
  }
});

test('timing-fit: a block RAM\'s and a multiplier\'s arcs from trce\'s report, with the multiplier\'s registers (#457)', () => {
  const twr = ['    Location             Delay type         Delay(ns)  Physical Resource',
    '    RAMB16_X0Y2.DOB10    Tbcko                 2.812   ram', '    SLICE_X18Y24.F3      net (fanout=1)        0.992   d<11>',
    '    SLICE_X18Y24.X       Tilo                  0.759   lut', '    MULT18X18_X0Y0.A11   net (fanout=3)        1.543   s<11>',
    '    MULT18X18_X0Y0.P19   Tmult                 4.873   mul', '    SLICE_X16Y20.BX      net (fanout=1)        1.375   p<19>',
    '    SLICE_X16Y20.CLK     Tdick                 0.360   ff', '    Total                                     12.714ns', ''].join('\n');
  const xdl = `design "t" xc3s250ecp132-4 v3.2 ,\n  cfg "";\n`
    + inst('ram', 'RAMB16', 'BRAMSITE2_X4Y10', 'RAMB16_X0Y2', ' PORTB_ATTR::1024X18 ') + inst('mul', 'MULT18X18SIO', 'BRAMSITE2_X4Y2', 'MULT18X18_X0Y0', ' AREG::0 BREG::1 PREG::0 ')
    + inst('lut', 'SLICEL', 'CLB_X9Y12', 'SLICE_X18Y24', ' ');
  assert.deepEqual(hardArcs(xdl, twr).map(a => [a.type, a.block, a.regs, a.from, a.pin, a.delay]),
    [['Tbcko', 'bram', undefined, null, 'DOB10', 2.812], ['Tmult', 'mult', 'A0B1P0', 'A11', 'P19', 4.873]]);
});

test('timing-fit: trce\'s logic delays read from a path\'s table, the data pin of a setup from the net before it (#443)', () => {
  const twr = ['Data Path: a to b', '    Location             Delay type         Delay(ns)  Physical Resource',
    '                                                       Logical Resource(s)',
    '    -------------------------------------------------  -------------------',
    '    SLICE_X2Y0.X         Treg                  3.762   srl_a', '                                                       srl_a',
    '    SLICE_X2Y1.BY        net (fanout=1)        0.441   t', '    SLICE_X2Y1.CLK       Tds                   0.442   srl_b',
    '    -------------------------------------------------  ---------------------------',
    '    Total                                      4.645ns (4.204ns logic, 0.441ns route)', ''].join('\n');
  assert.deepEqual(twrArcs(twr), [{ type: 'Treg', site: 'SLICE_X2Y0', pin: 'X', from: null, delay: 3.762 }, { type: 'Tds', site: 'SLICE_X2Y1', pin: 'CLK', from: 'BY', delay: 0.442 }]);
  // memArcs: only at the SLICEMs with a memory LUT, each with its kind and clock edge
  const xdl = `design "t" xc3s250ecp132-4 v3.2 ,\n  cfg "";\n`
    + inst('a', 'SLICEM', 'CLB_X1Y0', 'SLICE_X2Y0', ' G:a:#RAM:D=0x0000 G_ATTR::SHIFT_REG DIG_MUX::BY GYMUX::G ')
    + inst('b', 'SLICEM', 'CLB_X1Y0', 'SLICE_X2Y1', ' G:b:#RAM:D=0x0000 DIG_MUX::BY GYMUX::G CLKINV::CLK_B ');
  assert.deepEqual(memArcs(xdl, twr).map(a => [a.type, a.mem, a.clkInv]), [['Treg', 'srl', false], ['Tds', 'ram', true]]);
  assert.deepEqual(twrArcs('no path here'), []);
});

test('timing-fit: reportgen -delay\'s report read back (names wrapped at 80 columns, a short load on its delay\'s line)', () => {
  const long = '$abc$1$long.name' + '.genblk1'.repeat(12);
  const wrap = t => t.match(/.{1,80}/g).join('\n');
  const text = ['Release 14.7 - reportgen', '', ' The 20 worst nets by delay are:', '', '-'.repeat(79), '                               Net Delays', '-'.repeat(79), '',
    'u_knight.pattern<1>', '   $ff$2073.YQ', '         0.891  $ff$2073.F1', '         0.597  $ff$2075.F2', '',
    wrap(`${long}.net_FX`), '  ', wrap(`${long}.lut1.FX`), '         0.000 ', wrap(`${long}.lut0.FXINB`), ''].join('\n');
  const d = parseDly(text);
  assert.deepEqual([...d.keys()], ['u_knight.pattern<1>', `${long}.net_FX`]);
  assert.deepEqual(d.get('u_knight.pattern<1>'), { driver: '$ff$2073.YQ', loads: new Map([['$ff$2073.F1', 0.891], ['$ff$2075.F2', 0.597]]) });
  assert.deepEqual(d.get(`${long}.net_FX`), { driver: `${long}.lut1.FX`, loads: new Map([[`${long}.lut0.FXINB`, 0]]) });
});

test('PERIOD constraints: a clock found from its port through the clock buffers; met / not met / missing', () => {
  const d = parseXdl(`design "t" xc3s250ecp132-4 v3.2 , cfg "";
inst "clk" "IBUF",placed BIOIS_X1Y0 P11 , cfg " " ;
inst "bufg" "BUFGMUX",placed CLKB_X13Y0 BUFGMUX0 , cfg " " ;
inst "vcc" "VCC",placed CLKB_X13Y0 VCC_X1Y1 , cfg " " ;
inst "div" "SLICEL",placed CLB_X1Y1 SLICE_X0Y0 , cfg " " ;
net "vcc_s" , outpin "vcc" VCCOUT , inpin "bufg" S , ;
net "clk_in" , outpin "clk" I , inpin "bufg" I0 , ;
net "clk_g" , outpin "bufg" O , inpin "div" CLK , ;
net "slow" , outpin "div" YQ , inpin "div" BY , ;
`);
  assert.equal(clockPort(d, 'clk_g'), 'clk');
  assert.equal(clockPort(d, 'slow'), null);   // a clock made by logic
  const r = { clocks: [{ clock: 'clk_g', period: 17.5 }, { clock: 'slow', period: 3 }] };
  const checks = checkPeriods(r, d, [{ net: 'CLK', period: 20 }, { net: 'other', period: 10 }]);
  assert.deepEqual(checks.map(k => [k.port, k.required, k.met, k.missing ?? false]), [['CLK', 20, true, false], ['other', 10, undefined, true]]);
  assert.equal(checks[0].slack, 2.5);
  assert.equal(checkPeriods(r, d, [{ net: 'clk', period: 15 }])[0].met, false);
  const lines = timingReport({ clocks: [{ clock: 'clk_g', period: 17.5, path: [] }] }, checks);
  assert.equal(lines[0], 'constraint PERIOD 20 ns on CLK: met (period 17.500 ns, slack 2.500 ns)');
  assert.equal(lines[1], 'constraint PERIOD 10 ns on other: no clock of the design comes from this port');
});

// #601: the clocks of a DCM, from the pad clk: CLK0 (the feedback), CLK2X, CLKDV (/ 4), CLKFX (x 3 / 2), CLK90 through a
// second DCM fed by CLKFX; a flip-flop of each, CLK0's into CLKFX's and CLK2X's, a second pad's clock (unrelated)
const DCMS_TEXT = `design "t" xc3s250ecp132-4 v3.2 , cfg "";
inst "clk" "IBUF",placed BIOIS_X1Y0 P11 , cfg " " ;
inst "clk2" "IBUF",placed BIOIS_X2Y0 P12 , cfg " " ;
inst "u_dcm" "DCM",placed DCM_BL_CENTER_X9Y0 DCM_X0Y0 , cfg " CLKDV_DIVIDE::4.0 CLKFX_DIVIDE::2 CLKFX_MULTIPLY::3 CLK_FEEDBACK::1X CLKOUT_PHASE_SHIFT::NONE PHASE_SHIFT::0 " ;
inst "u_dcm2" "DCM",placed DCM_BR_CENTER_X17Y0 DCM_X1Y0 , cfg " CLKFX_DIVIDE::1 CLKFX_MULTIPLY::4 CLKIN_DIVIDE_BY_2::CLKIN_DIVIDE_BY_2 CLKOUT_PHASE_SHIFT::FIXED PHASE_SHIFT::64 " ;
inst "b0" "BUFGMUX",placed CLKB_X13Y0 BUFGMUX0 , cfg " " ;
inst "b2x" "BUFGMUX",placed CLKB_X13Y0 BUFGMUX1 , cfg " " ;
inst "bdv" "BUFGMUX",placed CLKB_X13Y0 BUFGMUX2 , cfg " " ;
inst "bfx" "BUFGMUX",placed CLKB_X13Y0 BUFGMUX3 , cfg " " ;
inst "b90" "BUFGMUX",placed CLKT_X13Y35 BUFGMUX4 , cfg " " ;
inst "bu" "BUFGMUX",placed CLKT_X13Y35 BUFGMUX5 , cfg " " ;
net "clk_in" , outpin "clk" I , inpin "u_dcm" CLKIN , ;
net "clk0_u" , outpin "u_dcm" CLK0 , inpin "b0" I0 , ;
net "clk0" , outpin "b0" O , inpin "u_dcm" CLKFB , inpin "a" CLK , ;
net "clk2x_u" , outpin "u_dcm" CLK2X , inpin "b2x" I0 , ;
net "clk2x" , outpin "b2x" O , inpin "b" CLK , ;
net "clkdv_u" , outpin "u_dcm" CLKDV , inpin "bdv" I0 , ;
net "clkdv" , outpin "bdv" O , inpin "c" CLK , ;
net "clkfx_u" , outpin "u_dcm" CLKFX , inpin "bfx" I0 , ;
net "clkfx" , outpin "bfx" O , inpin "d" CLK , inpin "u_dcm2" CLKIN , ;
net "c90_u" , outpin "u_dcm2" CLKFX180 , inpin "b90" I0 , ;
net "c90" , outpin "b90" O , inpin "e" CLK , ;
net "c2_in" , outpin "clk2" I , inpin "bu" I0 , ;
net "c2" , outpin "bu" O , inpin "f" CLK , ;
`;
const DCMS = parseXdl(DCMS_TEXT);
test('#601 clockSources: a clock through the global buffers and DCMs to its pad, its period and first rising edge in the pad\'s periods', () => {
  const s = clockSources(DCMS);
  const of = n => { const x = s.get(n); return x && [x.port, +x.f.toFixed(6), +x.o.toFixed(6), x.via.map(v => `${v.pin} of ${v.dcm}`).join(', ')]; };
  assert.deepEqual(of('clk0'), ['clk', 1, 0, 'CLK0 of u_dcm']);
  assert.deepEqual(of('clk2x'), ['clk', 0.5, 0, 'CLK2X of u_dcm']);
  assert.deepEqual(of('clkdv'), ['clk', 4, 0, 'CLKDV of u_dcm']);
  assert.deepEqual(of('clkfx'), ['clk', +(2 / 3).toFixed(6), 0, 'CLKFX of u_dcm']);
  // (a cascade: CLKFX into a DCM halving its input, x 4, CLKFX180: half its period later; PHASE_SHIFT 64 / 256 of its
  // input's period more, fixed)
  assert.deepEqual(of('c90'), ['clk', +((2 / 3) * 2 / 4).toFixed(6), +((2 / 3) * (1 / 4 + 64 / 256)).toFixed(6), 'CLKFX of u_dcm, CLKFX180 of u_dcm2']);
  assert.deepEqual(of('c2'), ['clk2', 1, 0, '']);
  assert.equal(s.has('clk_in'), false);   // (no clock pin on it)
});
// #847: a half-integer CLKDV_DIVIDE as XDL writes it (2.5 -> 2_5): CLKDV 2.5 input periods, not 2
test('#847 clockSources: CLKDV of a DCM whose CLKDV_DIVIDE is 2_5 (or 1_5, 7_5), the half-integer divider\'s period', () => {
  for (const [v, f] of [['2_5', 2.5], ['1_5', 1.5], ['7_5', 7.5], ['16', 16]]) {
    const s = clockSources(parseXdl(DCMS_TEXT.replace('CLKDV_DIVIDE::4.0', `CLKDV_DIVIDE::${v}`)));
    assert.equal(s.get('clkdv').f, f, v);
  }
  const pc = checkPeriods({ clocks: [{ clock: 'clkdv', period: 4 }], cross: [] }, parseXdl(DCMS_TEXT.replace('CLKDV_DIVIDE::4.0', 'CLKDV_DIVIDE::2_5')), [{ net: 'clk', period: 20 }]);
  assert.deepEqual(pc.filter(k => k.clock === 'clkdv').map(k => [k.via, k.required]), [['CLKDV of u_dcm', 50]]);
});
test('#601 clockRequirement: from each launching edge to the next capturing one, the shortest over the common period', () => {
  const r = (a, b) => clockRequirement(a, b);
  assert.equal(r({ period: 20, first: 0 }, { period: 10, first: 0 }), 10);
  assert.equal(r({ period: 10, first: 0 }, { period: 20, first: 0 }), 10);
  assert.equal(r({ period: 20, first: 0 }, { period: 20, first: 0 }), 20);
  // CLK0 to CLKFX x 3 / 2: edges 0, 20 / 0, 13.333, 26.667: 20 -> 26.667
  assert.equal(r({ period: 20, first: 0 }, { period: 40 / 3, first: 0 }), 6.666667);
  assert.equal(r({ period: 40 / 3, first: 0 }, { period: 20, first: 0 }), 6.666667);
  // a phase: 5 ns later, or 15 ns to the next; a falling edge into a rising one
  assert.equal(r({ period: 20, first: 0 }, { period: 20, first: 5 }), 5);
  assert.equal(r({ period: 20, first: 5 }, { period: 20, first: 0 }), 15);
  assert.equal(r({ period: 20, first: 10 }, { period: 20, first: 0 }), 10);
  // no common period within 100 000 launches: null (unrelated)
  assert.equal(r({ period: 20, first: 0 }, { period: Math.PI, first: 0 }), null);
  assert.equal(r({ period: 0, first: 0 }, { period: 10, first: 0 }), null);
});
test('#601 PERIOD constraints of a DCM\'s clocks derived from its input\'s; the paths between two clocks timed against their edges', () => {
  const r = { clocks: [{ clock: 'clk0', period: 4 }, { clock: 'clk2x', period: 11 }, { clock: 'clkdv', period: 4 }, { clock: 'clkfx', period: 5 }, { clock: 'c2', period: 3 }],
    cross: [{ from: 'clk0', launch: 0, to: 'clkfx', capture: 0, delay: 7, path: [] }, { from: 'clk0', launch: 0, to: 'clk2x', capture: 0, delay: 3, path: [] },
      { from: 'clk0', launch: 1, to: 'clk2x', capture: 0, delay: 3, path: [] }, { from: 'clk0', launch: 0, to: 'c2', capture: 0, delay: 1, path: [] }] };
  const pc = checkPeriods(r, DCMS, [{ net: 'clk', period: 20 }, { net: 'clk2', period: 10 }]);
  assert.deepEqual(pc.map(k => [k.clock, k.via ?? null, k.required, k.met]), [
    ['clk0', 'CLK0 of u_dcm', 20, true], ['clk2x', 'CLK2X of u_dcm', 10, false], ['clkdv', 'CLKDV of u_dcm', 80, true], ['clkfx', 'CLKFX of u_dcm', 13.333333, true],
    ['c2', null, 10, true]]);
  assert.equal(pc[1].slack, -1);
  const cc = checkCross(r, DCMS, [{ net: 'clk', period: 20 }, { net: 'clk2', period: 10 }]);
  assert.deepEqual(cc.map(k => [k.from, k.to, k.launch, k.related, k.required ?? null, k.met ?? null]), [
    ['clk0', 'clkfx', 0, true, 6.666667, false], ['clk0', 'clk2x', 0, true, 10, true], ['clk0', 'clk2x', 1, true, 10, true], ['clk0', 'c2', 0, false, null, null]]);
  assert.ok(Math.abs(cc[0].slack - (6.666667 - 7)) < 1e-9);
  // no PERIOD on the port: not related either
  assert.deepEqual(checkCross(r, DCMS, []).map(k => k.related), [false, false, false, false]);
  const lines = timingReport({ clocks: [], cross: r.cross }, [...pc, ...cc]);
  assert.deepEqual(lines, [
    'constraint PERIOD 20 ns on clk, CLK0 of u_dcm: 20 ns, met (period 4.000 ns, slack 16.000 ns)',
    'constraint PERIOD 20 ns on clk, CLK2X of u_dcm: 10 ns, NOT MET (period 11.000 ns, slack -1.000 ns)',
    'constraint PERIOD 20 ns on clk, CLKDV of u_dcm: 80 ns, met (period 4.000 ns, slack 76.000 ns)',
    'constraint PERIOD 20 ns on clk, CLKFX of u_dcm: 13.333 ns, met (period 5.000 ns, slack 8.333 ns)',
    'constraint PERIOD 10 ns on clk2: met (period 3.000 ns, slack 7.000 ns)',
    'paths from clock clk0 (rising) to clock clkfx (rising): NOT MET, requirement 6.667 ns between the clocks\' edges (delay 7.000 ns, slack -0.333 ns)',
    'paths from clock clk0 (rising) to clock clk2x (rising): met, requirement 10.000 ns between the clocks\' edges (delay 3.000 ns, slack 7.000 ns)',
    'paths from clock clk0 (falling) to clock clk2x (rising): met, requirement 10.000 ns between the clocks\' edges (delay 3.000 ns, slack 7.000 ns)',
    'paths from clock clk0 (rising) to clock c2 (rising): not timed (unrelated clocks: not from one port with a PERIOD constraint)',
  ]);
});
test('#601 the timing analysis: the slowest path from a clock\'s flip-flops into another clock\'s, by edge; the same clock\'s as before', () => {
  const d = parseXdl(`design "t" xc3s50etq144-4 v3.2 , cfg "";
${inst('ck', 'IOB', 'CLB_X1Y0', 'P1', ' ')}${inst('ck2', 'IOB', 'CLB_X1Y0', 'P2', ' ')}
${inst('a', 'SLICEL', 'CLB_X1Y0', 'SLICE_X1Y0', ' FFX:a:#FF DXMUX::1 FXMUX::F F:a_f:#LUT:D=A1 ')}${inst('b', 'SLICEL', 'CLB_X1Y0', 'SLICE_X1Y1', ' FFY:b:#FF DYMUX::0 ')}
${inst('c', 'SLICEL', 'CLB_X3Y0', 'SLICE_X3Y0', ' FFY:c:#FF DYMUX::0 CLKINV::CLK_B ')}
${net('clk', [['ck', 'I']], [['a', 'CLK']])}${net('clk2', [['ck2', 'I']], [['b', 'CLK'], ['c', 'CLK']])}${net('q', [['a', 'XQ']], [['b', 'BY'], ['c', 'BY'], ['a', 'F1']])}`);
  const tg = timingGraph(d);
  const r = tg.analyze(new Float64Array(tg.conns.length).fill(1));
  assert.deepEqual(r.cross.map(x => [x.from, x.launch, x.to, x.capture]), [['clk', 0, 'clk2', 0], ['clk', 0, 'clk2', 1]]);
  // (a.XQ, the net's 1 ns, b's setup by BY)
  for (const x of r.cross) {
    assert.equal(x.path[0].kind, 'clock-to-out');
    assert.equal(x.path.at(-1).kind, 'setup');
    close(x.delay, x.path.at(-1).arrival, 'arrival');
    assert.ok(x.delay > 1 && x.delay < 5, String(x.delay));
  }
  // the clock's own paths: a's flip-flop through its LUT back to itself
  assert.deepEqual(r.clocks.map(c => c.clock), ['clk']);
});

test('#601 clock arrivals through a DCM: from its CLKIN\'s, deskewed by its taps; a cascade after the first DCM\'s; the phase and a falling edge with the PERIOD', () => {
  const { Tiopi } = SPEED_4.pad, { minScale: sc, Tgclk, dcm: D } = SPEED_4.clock;
  // (the small device has none of these sites: no wire delay, the model's terms alone)
  const withC = { ...DCMS, insts: [...DCMS.insts, { name: 'c', type: 'SLICEL', placed: false, cfg: [{ attr: 'CLKINV', name: '', value: 'CLK_B' }] }] };
  const three = (m, i) => [m.get(i), m.early.get(i), m.hold.get(i)];
  const near = (got, want, msg) => { assert.equal(got.length, want.length); got.forEach((g, k) => close(g, want[k], `${msg} [${k}]`)); };
  const pin = [Tiopi, sc * Tiopi, Tiopi];   // at CLKIN, from the pad
  const dcm0 = pin.map((x, k) => x + D.pad[k]);
  const a = clockArrivals(withC, device);
  // CLK0, CLK2X, CLKDV, CLKFX of u_dcm: deskewed alike (no skew between the outputs, as trce)
  for (const i of ['a', 'b', 'c', 'd']) near(three(a, i), dcm0, i);
  // u_dcm2's CLKIN on CLKFX's global line: after it; the pad's own global clock Tgclk
  near(three(a, 'e'), dcm0.map((x, k) => x + D.global[k]), 'e');
  near(three(a, 'f'), [Tgclk, sc * Tgclk, Tgclk], 'f');
  // a DCM's clocks earlier than the pad's own global clock (deskewed), the earliest before the latest
  assert.ok(a.get('a') < Tgclk && a.early.get('a') < a.get('a'));
  // with the PERIOD: c90's first edge a third of the pad's 20 ns later; c's, a falling-edge flip-flop on CLKDV (80 ns),
  // half of CLKDV's period later
  const b = clockArrivals(withC, device, SPEED_4, [{ net: 'clk', period: 20 }]);
  near(three(b, 'e'), dcm0.map((x, k) => x + D.global[k] + 20 / 3), 'e, phase');
  near(three(b, 'c'), dcm0.map(x => x + 40), 'c, falling edge');
  near(three(b, 'a'), dcm0, 'a');
  near(three(b, 'f'), [Tgclk, sc * Tgclk, Tgclk], 'f');
  // DESKEW_ADJUST 0 (SOURCE_SYNCHRONOUS): 7 taps later
  const src = { ...withC, insts: withC.insts.map(i => i.name === 'u_dcm' ? { ...i, cfg: [...i.cfg, { attr: 'DESKEW_ADJUST', name: '', value: '0' }] } : i) };
  near(three(clockArrivals(src, device), 'a'), dcm0.map((x, k) => x + 7 * D.tap[k]), 'a, source synchronous');
  // a DCM whose CLKIN is not clocked from a pad: none
  const loose = { ...DCMS, nets: DCMS.nets.filter(n => n.name !== 'clk_in') };
  assert.equal(clockArrivals(loose, device).has('a'), false);
});

// Silinx's routing of six DCM designs (test/fixtures/open-flow, the OFFSET ones' UCF in dcm-trce.json), timed by trce with the same
// constraints (research/s3e-route/dcm-timing.mjs): its paths between two clocks and its data sheet (setup, hold, clock to pad)
test('#601 static timing of a DCM\'s clocks against trce on routed designs: the paths between two clocks, the pads\' setup, hold and clock to pad', async () => {
  const { loadDeviceCache } = await import('../core/fpga/device-node.js');
  const ref = JSON.parse(fs.readFileSync(path.join(FIX, 'trce', 'dcm-trce.json'), 'utf8'));
  const err = { setup: [], hold: [], toPad: [], cross: [] };
  for (const [name, t] of Object.entries(ref)) {
    const text = zlib.gunzipSync(fs.readFileSync(path.join(FIX, 'trce', `${name}.xdl.gz`))).toString('utf8');
    const d = parseXdl(text);
    const sta = analyzeTiming(d, loadDeviceCache(/^design "[^"]*" ([\w-]+)/m.exec(text)[1]), { clocks: t.clocks });
    for (const [pad, clock, setup, hold] of t.setup) {
      const x = sta.pads.inputs.find(i => i.pad === pad && i.clock === clock);
      assert.ok(x, `${name}: ${pad} on ${clock}`);
      err.setup.push(x.setup - setup); err.hold.push(x.hold - hold);
    }
    for (const [pad, clock, delay] of t.toPad) {
      const x = sta.pads.outputs.find(o => o.pad === pad && o.clock === clock);
      assert.ok(x, `${name}: ${pad} from ${clock}`);
      err.toPad.push(x.delay - delay);
    }
    // the same requirement as trce's (to its rounding), the data path within 0.3 ns (no skew, no uncertainty), met or not alike
    const cc = checkCross(sta, d, t.clocks);
    for (const [from, launch, to, capture, required, delay, slack] of t.cross) {
      const x = cc.find(c => c.from === from && c.launch === launch && c.to === to && c.capture === capture);
      assert.ok(x?.related, `${name}: ${from} -> ${to}`);
      assert.ok(Math.abs(x.required - required) < 0.0015, `${name}: ${from} -> ${to}: ${x.required} against ${required}`);
      err.cross.push(x.delay - delay);
      assert.equal(x.met, slack >= 0, `${name}: ${from} -> ${to}`);
    }
    // the OFFSET constraints: every pad of trce's data sheet bounded, none left out
    const offs = checkOffsets(sta, d, parseOffsets(t.offsets), t.clocks);
    assert.deepEqual(offs.filter(o => o.missing || o.unsupported), [], name);
    assert.equal(offs.filter(o => o.dir === 'in').length, t.setup.length, name);
  }
  const rms = a => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
  // (fitted: rms 0.131 / 0.094 / 0.116 ns, the paths between two clocks 0.179, the model's data paths' error)
  for (const [k, max, r] of [['setup', 0.35, 0.14], ['hold', 0.25, 0.1], ['toPad', 0.4, 0.125], ['cross', 0.3, 0.19]]) {
    assert.ok(err[k].length >= 9, k);
    assert.ok(Math.max(...err[k].map(Math.abs)) < max, `${k}: ${err[k].map(x => x.toFixed(3))}`);
    assert.ok(rms(err[k]) < r, `${k}: rms ${rms(err[k])}`);
  }
  assert.equal(err.setup.length + err.hold.length + err.toPad.length, 81);
});

test('#601 OFFSET constraints on a DCM\'s clocks: the pad found through it; a pad bounded on two clocks named with each', () => {
  const r = { clocks: [], pads: { inputs: [{ pad: 'sw', clock: 'clk0', setup: 3, hold: -1 }, { pad: 'sw', clock: 'clkfx', setup: 4, hold: -1 }, { pad: 'k', clock: 'c2', setup: 1, hold: 0 }],
    outputs: [{ pad: 'led', clock: 'clk2x', delay: 6 }], padToPad: [], hold: [] } };
  const ck = checkOffsets(r, DCMS, parseOffsets(['OFFSET = IN 3.5 ns BEFORE "clk"', 'OFFSET = OUT 5 ns AFTER "clk"']), [{ net: 'clk', period: 20 }]);
  assert.deepEqual(ck.map(k => [k.port, k.clock, k.met]), [['sw', 'clk0', true], ['sw', 'clkfx', false], ['led', 'clk2x', false]]);
  const lines = timingReport(r, ck);
  assert.deepEqual(lines.slice(0, 3), [
    'constraint OFFSET = IN 3.5 ns BEFORE "clk": met on sw, clock clk0 (pad to setup 3.000 ns, slack 0.500 ns)',
    'constraint OFFSET = IN 3.5 ns BEFORE "clk": NOT MET on sw, clock clkfx (pad to setup 4.000 ns, slack -0.500 ns)',
    'constraint OFFSET = OUT 5 ns AFTER "clk": NOT MET on led (clock to pad 6.000 ns, slack -1.000 ns)',
  ]);
});

test('#601 dcm-timing: trce\'s report read (the paths between two clocks, its data sheet); a PCF for Silinx\'s routing as ISE\'s map writes one', () => {
  const twr = `Timing constraint: TS_clk2x_b = PERIOD TIMEGRP "clk2x_b" TS_clk / 2 HIGH 50%;
Slack (setup path):     -0.412ns (requirement - (data path - clock path skew + uncertainty))
  Source:               a (FF)
  Destination:          b (FF)
  Requirement:          3.334ns
  Data Path Delay:      3.726ns (Levels of Logic = 1)
  Clock Path Skew:      -0.020ns
  Source Clock:         clkfx_b rising at 26.666ns
  Destination Clock:    clk2x_b rising at 30.000ns
Slack (setup path):     -0.100ns (requirement - (data path - clock path skew + uncertainty))
  Requirement:          3.334ns
  Data Path Delay:      3.414ns (Levels of Logic = 1)
  Source Clock:         clkfx_b rising at 26.666ns
  Destination Clock:    clk2x_b rising at 30.000ns
Slack (hold path):      0.800ns (requirement - (clock path skew + uncertainty - data path))
  Requirement:          0.000ns
  Source Clock:         clk0_b falling at 10.000ns
  Destination Clock:    clk2x_b rising at 10.000ns
Slack (setup path):     2.000ns (requirement - (data path - clock path skew + uncertainty))
  Requirement:          10.000ns
  Data Path Delay:      8.000ns (Levels of Logic = 1)
  Source Clock:         clk2x_b rising at 0.000ns
  Destination Clock:    clk2x_b rising at 10.000ns

Data Sheet report:
Setup/Hold to clock clk
------------+------------+------------+------------------+--------+
sw<0>       |    4.259(R)|   -2.316(R)|clk0_b            |   0.000|
            |    3.747(R)|   -1.908(R)|clkfx_b           |   0.000|
------------+------------+------------+------------------+--------+

Clock clk to Pad
------------+------------+------------------+--------+
led<0>      |   15.021(F)|clk0_b            |   0.000|
------------+------------+------------------+--------+
`;
  // (the worst setup path of each pair of clocks; a hold path, the same clock's, left out)
  assert.deepEqual(parseTwrClocks(twr), {
    cross: [{ slack: -0.412, hold: false, required: 3.334, delay: 3.726, from: 'clkfx_b', launch: 0, to: 'clk2x_b', capture: 0 }],
    setup: [{ pad: 'sw<0>', clock: 'clk0_b', setup: 4.259, hold: -2.316 }, { pad: 'sw<0>', clock: 'clkfx_b', setup: 3.747, hold: -1.908 }],
    toPad: [{ pad: 'led<0>', clock: 'clk0_b', edge: 1, delay: 15.021 }],
  });
  const xdl = `design "t" xc3s250ecp132-4 v3.2 , cfg "";
inst "clk" "IBUF",placed BIOIS_X1Y0 P11 , cfg " " ;
inst "u_dcm" "DCM",placed DCM_BL_CENTER_X9Y0 DCM_X0Y0 , cfg " CLKFX_DIVIDE::2 CLKFX_MULTIPLY::3 CLKOUT_PHASE_SHIFT::FIXED PHASE_SHIFT::32 " ;
inst "b0" "BUFGMUX",placed CLKB_X13Y0 BUFGMUX0 , cfg " " ;
inst "bfx" "BUFGMUX",placed CLKB_X13Y0 BUFGMUX3 , cfg " " ;
inst "s0" "SLICEL",placed CLB_X1Y1 SLICE_X0Y0 , cfg " FFX:$auto$ff.cc_1:#FF FFY:q_1:#FF " ;
inst "s1" "SLICEL",placed CLB_X1Y1 SLICE_X0Y1 , cfg " FFY:r:#FF " ;
net "clk_in" , outpin "clk" I , inpin "u_dcm" CLKIN , ;
net "clk0_u" , outpin "u_dcm" CLK0 , inpin "b0" I0 , ;
net "clk0" , outpin "b0" O , inpin "u_dcm" CLKFB , inpin "s0" CLK , ;
net "clkfx_u" , outpin "u_dcm" CLKFX , inpin "bfx" I0 , ;
net "clkfx<0>" , outpin "bfx" O , inpin "s1" CLK , ;
`;
  assert.equal(silinxPcf(xdl, 'NET "clk" TNM_NET = "clk" ;\nTIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50% ;\nOFFSET = IN 10 ns BEFORE "clk" ;\nNET "clk" LOC = "P11" ;\n'), `SCHEMATIC START;
PIN clk_clkin = BEL "u_dcm" PINNAME CLKIN;
TIMEGRP clk = PIN "clk_clkin";
TS_clk = PERIOD TIMEGRP "clk" 20 ns HIGH 50%;
TIMEGRP clk0 = BEL "$auto$ff.cc_1" BEL "q_1";
TS_clk0 = PERIOD TIMEGRP "clk0" TS_clk PHASE 2.5 ns HIGH 50%;
TIMEGRP clkfx_0_ = BEL "r";
TS_clkfx_0_ = PERIOD TIMEGRP "clkfx_0_" TS_clk / 1.5 PHASE 2.5 ns HIGH 50%;
OFFSET = IN 10 ns BEFORE COMP "clk";
SCHEMATIC END;
`);
});

// The pads' paths and the hold check (#26): an input pad i into a's flip-flop (through its LUT F) and through c's LUT G to
// the output pad p; a's flip-flop to the output pad o and to b's flip-flop (BY); a and b clocked from the pad ck
const PADS = parseXdl(`design "t" xc3s50etq144-4 v3.2 , cfg "";
${inst('ck', 'IOB', 'CLB_X1Y0', 'P1', ' ')}${inst('i', 'IBUF', 'CLB_X1Y0', 'P2', ' ')}${inst('o', 'IOB', 'CLB_X1Y0', 'P3', ' ')}${inst('p', 'IOB', 'CLB_X1Y0', 'P4', ' ')}
${inst('a', 'SLICEL', 'CLB_X1Y0', 'SLICE_X1Y0', ' F:a_f:#LUT:D=A1 FXMUX::F FFX:a:#FF DXMUX::1 ')}${inst('b', 'SLICEL', 'CLB_X1Y0', 'SLICE_X1Y1', ' FFY:b:#FF DYMUX::0 ')}
${inst('c', 'SLICEL', 'CLB_X3Y0', 'SLICE_X3Y0', ' G:c_g:#LUT:D=~A1 GYMUX::G ')}
${net('clk', [['ck', 'I']], [['a', 'CLK'], ['b', 'CLK']])}${net('din', [['i', 'I']], [['a', 'F1'], ['c', 'G1']])}${net('q', [['a', 'XQ']], [['o', 'O1'], ['b', 'BY']])}${net('y', [['c', 'Y']], [['p', 'O1']])}`);

test('pads and hold (#26): pad to setup, clock to pad, pad to pad, the shortest flip-flop to flip-flop path', () => {
  const tg = timingGraph(PADS);
  assert.deepEqual(tg.conns.map(c => `${c.fromPin.inst}.${c.fromPin.pin} -> ${c.toPin.inst}.${c.toPin.pin}`), ['i.I -> a.F1', 'i.I -> c.G1', 'a.XQ -> o.O1', 'a.XQ -> b.BY', 'c.Y -> p.O1']);
  const { Tiopi, Tioop } = SPEED_4.pad, { minScale: sc, hold: Th } = SPEED_4.clock;
  const r = tg.pads(Float64Array.from([1, 2, 3, 0.5, 4]), new Map([['a', 2], ['b', 2.25]]));
  // pad to setup: the data at a's flip-flop (pad, net, LUT, setup) less the clock's earliest arrival at a
  // (minScale x it); hold: the clock's arrival less the data's earliest (minScale x the pad and the net), plus
  // the hold time
  assert.deepEqual(r.inputs.map(x => [x.pad, x.clock]), [['i', 'clk']]);
  close(r.inputs[0].setup, Tiopi + 1 + S.Tilo[0] + S.Tdxck[0] - sc * 2);
  close(r.inputs[0].hold, 2 - sc * (Tiopi + 1) + Th);
  assert.deepEqual(r.inputs[0].path.map(s => `${s.kind} ${s.inst}.${s.pin}`), ['pad i.I', 'net a.F1', 'setup a.F1']);
  // clock to pad: the clock's arrival at a, its clock to out, the net, the output pad
  assert.deepEqual(r.outputs.map(x => [x.pad, x.clock]), [['o', 'clk']]);
  close(r.outputs[0].delay, 2 + S.TckoX[0] + 3 + Tioop);
  assert.deepEqual(r.outputs[0].path.map(s => s.kind), ['clock-to-out', 'net', 'pad']);
  // pad to pad: through c's LUT only
  assert.deepEqual(r.padToPad.map(x => [x.from, x.to]), [['i', 'p']]);
  close(r.padToPad[0].delay, Tiopi + 2 + S.Tilo[0] + 4 + Tioop);
  // hold: a's clock to out and the 0.5 ns net into b's BY at their earliest, less the hold time; one clock time
  assert.deepEqual(r.hold.map(h => h.clock), ['clk']);
  close(r.hold[0].slack, sc * (S.TckoX[0] + 0.5) - Th);
  assert.deepEqual(r.hold[0].path.map(s => `${s.kind} ${s.inst}.${s.pin}`), ['clock-to-out a.XQ', 'net b.BY', 'hold b.BY']);
  // a flip-flop with no clock arrival (a clock through a DCM, or made by logic) is left out of the pads' paths
  const none = tg.pads(Float64Array.from([1, 2, 3, 0.5, 4]), new Map());
  assert.deepEqual([none.inputs, none.outputs, none.padToPad.length, none.hold.length], [[], [], 1, 1]);
  // an asynchronous reset is not a data input: a pad that reaches only one is not in the data sheet (as trce)
  const text = writeXdl(PADS).replace(/(inst "b"[\s\S]*?cfg ")/, '$1 SYNC_ATTR::ASYNC');
  const asy = parseXdl(text.replace(/(\nnet "clk")/, `\n${inst('r', 'IBUF', 'CLB_X1Y0', 'P5', ' ')}${net('rst', [['r', 'I']], [['b', 'SR']])}$1`));
  const ra = timingGraph(asy).pads(new Float64Array(6).fill(0.5), new Map([['a', 2], ['b', 2]]));
  assert.deepEqual(ra.inputs.map(x => x.pad), ['i']);
});

test('OFFSET constraints (#26): read from the UCF\'s statements; met / not met per pad, on all pads or one NET; missing; a TIMEGRP\'s not analyzed', () => {
  const offs = parseOffsets(['OFFSET = IN 5 ns BEFORE "clk"', 'NET "o" OFFSET = OUT 9000 ps AFTER "ck" ;', 'NET "sw<0>" OFFSET = IN 3 ns VALID 4 ns BEFORE "clk" RISING',
    'TIMEGRP "outs" OFFSET = OUT 8 ns AFTER "clk"', 'NET "x" LOC = "P1"']);
  assert.deepEqual(offs.map(o => [o.dir, o.port, o.required, o.clock, o.unsupported ?? false]),
    [['in', null, 5, 'clk', false], ['out', 'o', 9, 'ck', false], ['in', 'sw<0>', 3, 'clk', false], [undefined, undefined, undefined, undefined, true]]);
  const r = analyzeTiming(PADS, device);
  // the clock's arrival: its pad's delay and the clock net's (unrouted here: from the distance)
  assert.ok(r.pads.inputs.length === 1 && r.pads.outputs.length === 1);
  const inSetup = r.pads.inputs[0].setup, out = r.pads.outputs[0].delay;
  // the clock net 'clk' comes from the pad ck (its port): "ck"; a TNM_NET 'clk' on it (parseUcf().clocks) names it too
  const ck = checkOffsets(r, PADS, parseOffsets([`OFFSET = IN ${(inSetup + 1).toFixed(3)} ns BEFORE "clk"`, `NET "o" OFFSET = OUT ${(out - 1).toFixed(3)} ns AFTER "ck"`,
    'NET "sw<0>" OFFSET = IN 3 ns BEFORE "ck"', 'OFFSET = IN 5 ns BEFORE "other"', 'TIMEGRP "outs" OFFSET = OUT 8 ns AFTER "clk"']), [{ net: 'ck', tnm: 'clk', period: 20 }]);
  assert.deepEqual(ck.map(k => [k.port ?? null, k.met ?? null, k.missing ?? false, k.unsupported ?? false]),
    [['i', true, false, false], ['o', false, false, false], [null, null, true, false], [null, null, true, false], [null, null, false, true]]);
  close(ck[0].slack, +(inSetup + 1).toFixed(3) - inSetup);
  const lines = timingReport(r, ck);
  assert.match(lines[0], /^constraint OFFSET = IN [\d.]+ ns BEFORE "clk": met on i \(pad to setup -?[\d.]+ ns, slack 1\.\d+ ns\)$/);
  assert.match(lines[1], /^constraint NET "o" OFFSET = OUT [\d.]+ ns AFTER "ck": NOT MET on o \(clock to pad [\d.]+ ns, slack -\d\.\d+ ns\)$/);
  assert.equal(lines[2], 'constraint NET "sw<0>" OFFSET = IN 3 ns BEFORE "ck": no pad of the design is bounded by it');
  assert.equal(lines[4], 'constraint TIMEGRP "outs" OFFSET = OUT 8 ns AFTER "clk": not analyzed (only OFFSET on a NET or on all pads)');
  // the report's sections after the clocks' critical paths
  const text = lines.join('\n');
  assert.match(text, /\nOFFSET IN \(pad to setup; hold\), clock clk:\n {2}i +-?\d+\.\d{3} ns; hold +-?\d+\.\d{3} ns\n/);
  assert.match(text, /\nOFFSET OUT \(clock to pad\), clock clk:\n {2}o +\d+\.\d{3} ns\n/);
  assert.match(text, /\npad to pad:\n {2}i +-> p +\d+\.\d{3} ns\n/);
  assert.match(text, /\nhold, clock clk: met, worst slack \d+\.\d{3} ns \(the shortest path at its earliest; the global clock reaches both flip-flops at once\)\n {2}clock-to-out/);
});

test('clock arrivals (#26): from the clock\'s pad through the global buffer to every clock pin, on a routed design (stopwatch)', async () => {
  const { loadDeviceCache } = await import('../core/fpga/device-node.js');
  const d = parseXdl(zlib.gunzipSync(fs.readFileSync(path.join(FIX, 'trce', 'stopwatch.xdl.gz'))).toString('utf8'));
  const dev = loadDeviceCache('xc3s250ecp132-4');
  const arr = clockArrivals(d, dev);
  // (the instances clocked from a global buffer: the multipliers' CLK pins are tied to a constant)
  const typeOf = new Map(d.insts.map(i => [i.name, i.type]));
  const clocked = new Set(d.nets.filter(n => /^BUFG/.test(typeOf.get(n.outpins[0]?.inst) || '')).flatMap(n => n.inpins.filter(p => /^CLK[AB]?$/.test(p.pin)).map(p => p.inst)));
  assert.ok(clocked.size > 100, clocked.size);
  assert.deepEqual([...clocked].filter(i => !arr.has(i)), []);
  // through the global buffer, every clock pin at once, Tgclk after the pad (trce: no clock skew on the global lines)
  assert.deepEqual([...new Set(arr.values())], [SPEED_4.clock.Tgclk]);
});

test('delayTable: the fastest routes from a CLB\'s outputs to the inputs at each offset, on the allowed PIPs only; cached', () => {
  // route-device: two CLBs joined by doubles; east, a slice output reaches F1 of both slices of the
  // next CLB by OMUX + a double, BX0 by one more input multiplexer and BX1 by two (BX0 =- BX1);
  // F2 only from the west; west, only F2 of the lower slice. Its slices have no flip-flop outputs
  // (XQ, YQ): their table is the X / Y outputs' (#104)
  const rdev = loadDevice(packDevice(fs.readFileSync(path.join(FIX, 'route-device.xdlrc'), 'utf8')));
  const W = SPEED_4.wire, hop = W[WIRE.OMUX] + W[WIRE.DOUBLE];
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);   // (a Float32Array)
  const t = delayTable(rdev);
  assert.deepEqual([t.w, t.h, t.d.length], [3, 1, 2 * 3]);
  near(t.at(1, 0), SPEED_4.base + (hop + hop + (hop + W[WIRE.IMUX]) + (hop + 2 * W[WIRE.IMUX])) / 4);
  near(t.at(-1, 0), SPEED_4.base + hop);
  for (const dc of [-1, 0, 1]) assert.equal(t.at(dc, 0, DELAY_KIND.REG), t.at(dc, 0, DELAY_KIND.COMB));
  // beyond the table: its edge
  assert.equal(t.at(5, 3), t.at(1, 0));
  assert.equal(delayTable(rdev), t, 'cached on the device');
  // F1_B_PINWIRE0 not allowed: the lower slice's F1 is no longer counted east
  const allow = (tile, from, to) => to !== 'F1_B_PINWIRE0';
  const r = delayTable(rdev, { allowPip: allow });
  assert.notEqual(r, t);
  near(r.at(1, 0), SPEED_4.base + (hop + (hop + W[WIRE.IMUX]) + (hop + 2 * W[WIRE.IMUX])) / 3);
  assert.equal(delayTable(rdev, { allowPip: allow }), r);
});

test('delayTable (XC3S250E graph, #104): a flip-flop\'s output reaches its own CLB through an output multiplexer, the X / Y outputs by the fast connects; never faster', async () => {
  const { loadDeviceCache } = await import('../core/fpga/device-node.js');
  const { loadDb } = await import('../core/fpga/bitdb-node.js');
  const { knownRouting } = await import('../core/fpga/bitgen.js');
  const dev = loadDeviceCache('xc3s250ecp132-4');
  const t = delayTable(dev, { allowPip: knownRouting(loadDb('xc3s250ecp132-4', { graph: dev })).allowPip });
  const W = SPEED_4.wire, near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
  // own CLB: X / Y -> a LUT input by an input multiplexer only (8 of the 10 inputs), BX / BY by a
  // double (2); XQ / YQ through OMUX first, to any input
  near(t.at(0, 0, DELAY_KIND.COMB), SPEED_4.base + (8 * W[WIRE.IMUX] + 2 * (W[WIRE.DOUBLE] + W[WIRE.IMUX])) / 10);
  near(t.at(0, 0, DELAY_KIND.REG), SPEED_4.base + W[WIRE.OMUX] + W[WIRE.IMUX]);
  // the next CLB up: X / Y straight onto a double, XQ / YQ to the neighbour's inputs through OMUX
  near(t.at(0, -1, DELAY_KIND.COMB), SPEED_4.base + W[WIRE.DOUBLE] + W[WIRE.IMUX]);
  near(t.at(0, -1, DELAY_KIND.REG), SPEED_4.base + W[WIRE.OMUX] + W[WIRE.IMUX]);
  assert.equal(t.at(0, -1), t.at(0, -1, DELAY_KIND.COMB), 'the default kind');
  for (let dr = -4; dr <= 4; dr++) for (let dc = -4; dc <= 4; dc++) assert.ok(t.at(dc, dr, DELAY_KIND.REG) >= t.at(dc, dr, DELAY_KIND.COMB) - 1e-6, `${dc},${dr}`);
  assert.deepEqual(['XQ', 'YQ', 'X', 'Y', 'I', 'DOA0', 'P0'].map(delayKind), [1, 1, 0, 0, 0, 0, 0]);
});

test('timing-driven routing: branch loads (XC3S250E graph): a net of 17 timed loads branches less at its driver and gets faster', async () => {
  const { loadDeviceCache } = await import('../core/fpga/device-node.js');
  const dev = loadDeviceCache('xc3s250ecp132-4');
  const at = (name, site, cfg) => inst(name, 'SLICEL', dev.site(site).tileName, site, cfg);
  const loads = Array.from({ length: 16 }, (_, k) => [`c${k}`, 'G1']);
  const text = `design "t" xc3s250ecp132-4 v3.2 ,\n  cfg "";\n${at('a', 'SLICE_X20Y20', ' FFX:a:#FF DXMUX::0 ')}${at('b', 'SLICE_X22Y21', ' F:b_f:#LUT:D=A1 FXMUX::F FFX:b:#FF DXMUX::1 ')}`
    + loads.map(([n], k) => at(n, `SLICE_X${17 + (k % 4) * 2}Y${16 + Math.floor(k / 4) * 2}`, ` G:${n}_g:#LUT:D=A1 GYMUX::G FFY:${n}:#FF DYMUX::1 `)).join('')
    + net('clk', [], [['a', 'CLK'], ['b', 'CLK'], ...loads.map(([n]) => [n, 'CLK'])]) + net('d', [['a', 'XQ']], [['b', 'F1'], ...loads]);
  const src = dev.sitePinNode('SLICE_X20Y20', 'XQ');
  // (the router's passes alone: the polish routes the net again, with the loads, either way, #651)
  const run = branchLoad => {
    const r = routeDesign(parseXdl(text), dev, { timing: true, branchLoad, polish: 0 });
    assert.deepEqual(r.failed, []);
    assert.deepEqual(checkRouting(parseXdl(writeXdl(r.design)), dev).problems.filter(p => !/^net clk: sink/.test(p)), []);   // (the clock has no source here)
    return { period: analyzeTiming(parseXdl(writeXdl(r.design)), dev).period, branches: netTree(r.design.nets.find(n => n.name === 'd').pips, [src], dev).children.get(src) };
  };
  const without = run(0), withLoads = run(1);
  assert.ok(withLoads.branches < without.branches, `${withLoads.branches} < ${without.branches} branches at the driver`);
  assert.ok(withLoads.period < without.period, `${withLoads.period} < ${without.period} ns`);
});

// #661: trce's Component Switching Limit checks on a DCM. One DCM_SP on the pad clk (PERIOD 20 ns unless said), its
// outputs on global buffers; the expected periods, limits and slacks are trce 14.7's (Basys2-250, -4) on the same
// settings, built by ISE's own flow (research/s3e-route/README.md)
const oneDcm = (cfg, outs) => parseXdl(`design "t" xc3s250ecp132-4 v3.2 , cfg "";
inst "clk" "IOB",placed BIOIS_X1Y0 P11 , cfg " " ;
inst "u_dcm" "DCM",placed DCM_BL_CENTER_X9Y0 DCM_X0Y0 , cfg " ${cfg} " ;
${outs.map((o, k) => `inst "b${k}" "BUFGMUX",placed CLKB_X13Y0 BUFGMUX${k} , cfg " " ;`).join('\n')}
net "clk_in" , outpin "clk" I , inpin "u_dcm" CLKIN , ;
${outs.map((o, k) => `net "${o}_u" , outpin "u_dcm" ${o} , inpin "b${k}" I0 , ;
net "${o}" , outpin "b${k}" O , inpin "f${k}" CLK ,${o === 'CLK0' ? ' inpin "u_dcm" CLKFB ,' : ''} ;`).join('\n')}
`);
const sw = (cfg, outs, period = 20) => Object.fromEntries(checkSwitching(oneDcm(cfg, outs), [{ net: 'clk', period }])
  .map(k => [k.resource.replace(/^u_dcm\//, ''), [k.limit, k.period, k.bound, k.bound === 'max' ? k.max : k.min, k.slack]]));
test('#661 checkSwitching: a DCM\'s pins against trce\'s switching limits (DLL, DFS, the outputs), as trce on the same settings', () => {
  // the DLL's CLKIN and CLK0, CLKFX 3 / 30: 200 ns, its maximum (trce: slack 0, met)
  assert.deepEqual(sw('CLKFX_DIVIDE::30 CLKFX_MULTIPLY::3 CLK_FEEDBACK::1X', ['CLK0', 'CLKFX']), {
    CLKIN: ['Tdcmpc', 20, 'min', 4.166, 15.834], CLK0: ['Tdcmpco', 20, 'min', 4.166, 15.834], CLKFX: ['Tdcmpfx', 200, 'max', 200, 0] });
  // CLK2X, CLK90, CLKFX180 (x 3 / 2: 13.333 ns)
  assert.deepEqual(sw('CLKFX_DIVIDE::2 CLKFX_MULTIPLY::3 CLK_FEEDBACK::1X', ['CLK0', 'CLK2X', 'CLK90', 'CLKFX180']), {
    CLKIN: ['Tdcmpc', 20, 'min', 4.166, 15.834], CLK0: ['Tdcmpco', 20, 'min', 4.166, 15.834], CLK2X: ['Tdcmpco', 10, 'min', 3.214, 6.786],
    CLK90: ['Tdcmpco', 20, 'min', 4.166, 15.834], CLKFX180: ['Tdcmpfx', 13.333333, 'min', 3.067, 10.266333] });
  // CLKDV / 16: 320 ns
  assert.deepEqual(sw('CLKDV_DIVIDE::16.0 CLK_FEEDBACK::1X', ['CLK0', 'CLKDV']).CLKDV, ['Tdcmpdv', 320, 'min', 6.249, 313.751]);
  // CLKDV / 1.5 at 5 ns (7.5 ns); the feedback from CLK2X (CLK_FEEDBACK 2X): the DLL's CLKIN
  assert.deepEqual(sw('CLKDV_DIVIDE::1.5 CLK_FEEDBACK::1X', ['CLK0', 'CLKDV'], 5), {
    CLKIN: ['Tdcmpc', 5, 'min', 4.166, 0.834], CLK0: ['Tdcmpco', 5, 'min', 4.166, 0.834], CLKDV: ['Tdcmpdv', 7.5, 'min', 6.249, 1.251] });
  assert.deepEqual(sw('CLK_FEEDBACK::2X', ['CLK2X']), { CLKIN: ['Tdcmpc', 20, 'min', 4.166, 15.834], CLK2X: ['Tdcmpco', 10, 'min', 3.214, 6.786] });
  // no feedback: the DFS's CLKIN (3.002 to 5000 ns), at 250 ns too; CLKFX x 8: 31.25 ns
  assert.deepEqual(sw('CLKFX_DIVIDE::30 CLKFX_MULTIPLY::3 CLK_FEEDBACK::NONE', ['CLKFX']), { CLKIN: ['Tdcmpc', 20, 'min', 3.002, 16.998], CLKFX: ['Tdcmpfx', 200, 'max', 200, 0] });
  assert.deepEqual(sw('CLKFX_DIVIDE::1 CLKFX_MULTIPLY::8 CLK_FEEDBACK::NONE', ['CLKFX'], 250), { CLKIN: ['Tdcmpc', 250, 'min', 3.002, 246.998], CLKFX: ['Tdcmpfx', 31.25, 'min', 3.067, 28.183] });
  // not met: the DLL's CLKIN and CLK0 at 250 ns (over 200) and at 4 ns (under 4.166); CLKFX x 7 (2.857 ns, under 3.067)
  assert.deepEqual(sw('CLK_FEEDBACK::1X', ['CLK0'], 250), { CLKIN: ['Tdcmpc', 250, 'max', 200, -50], CLK0: ['Tdcmpco', 250, 'max', 200, -50] });
  assert.deepEqual(sw('CLK_FEEDBACK::1X', ['CLK0'], 4), { CLKIN: ['Tdcmpc', 4, 'min', 4.166, -0.166], CLK0: ['Tdcmpco', 4, 'min', 4.166, -0.166] });
  assert.deepEqual(sw('CLKFX_DIVIDE::1 CLKFX_MULTIPLY::7 CLK_FEEDBACK::1X', ['CLK0', 'CLKFX']).CLKFX, ['Tdcmpfx', 2.857143, 'min', 3.067, -0.209857]);
  // no PERIOD on the DCM's pad: nothing checked (as trce)
  assert.deepEqual(checkSwitching(oneDcm('CLK_FEEDBACK::1X', ['CLK0']), [{ net: 'other', period: 20 }]), []);
});
test('#661 checkSwitching: CLKIN_DIVIDE_BY_2 halves every limit of the DCM in trce, its outputs\' too', () => {
  // feat_dcm_div2 as it was: CLKFX 3 / 15 of the halved input, 200 ns, over trce's 100 ns (trce: slack -100, Tdcmpfx)
  const div2 = sw('CLKFX_DIVIDE::15 CLKFX_MULTIPLY::3 CLKIN_DIVIDE_BY_2::CLKIN_DIVIDE_BY_2 CLK_FEEDBACK::1X DESKEW_ADJUST::0', ['CLK0', 'CLKFX']);
  assert.deepEqual(div2, { CLKIN: ['Tdcmpc', 20, 'min', 2.082, 17.918], CLK0: ['Tdcmpco', 40, 'min', 2.083, 37.917], CLKFX: ['Tdcmpfx', 200, 'max', 100, -100] });
  const k = checkSwitching(oneDcm('CLKFX_DIVIDE::15 CLKFX_MULTIPLY::3 CLKIN_DIVIDE_BY_2::CLKIN_DIVIDE_BY_2 CLK_FEEDBACK::1X', ['CLK0', 'CLKFX']), [{ net: 'clk', period: 20 }]);
  assert.deepEqual(k.map(x => x.met), [true, true, false]);
  assert.equal(switchingLine(k[2]), 'switching limit of u_dcm/CLKFX (Tdcmpfx): NOT MET, period 200.000 ns, max period limit 100.000 ns (10.000 MHz), slack -100.000 ns');
  assert.equal(switchingLine(k[0]), 'switching limit of u_dcm/CLKIN (Tdcmpc): met, period 20.000 ns, min period limit 2.082 ns (480.307 MHz), slack 17.918 ns');
  // CLKDV / 16 (640 ns) and CLKFX x 2 (20 ns) of the halved input; at 4 ns, CLKIN within its halved limit
  assert.deepEqual(sw('CLKDV_DIVIDE::16.0 CLKFX_DIVIDE::1 CLKFX_MULTIPLY::2 CLKIN_DIVIDE_BY_2::CLKIN_DIVIDE_BY_2 CLK_FEEDBACK::1X', ['CLK0', 'CLKDV', 'CLKFX']), {
    CLKIN: ['Tdcmpc', 20, 'min', 2.082, 17.918], CLK0: ['Tdcmpco', 40, 'min', 2.083, 37.917], CLKDV: ['Tdcmpdv', 640, 'min', 3.125, 636.875], CLKFX: ['Tdcmpfx', 20, 'min', 1.533, 18.467] });
  assert.deepEqual(sw('CLKIN_DIVIDE_BY_2::CLKIN_DIVIDE_BY_2 CLK_FEEDBACK::1X', ['CLK0'], 4), { CLKIN: ['Tdcmpc', 4, 'min', 2.082, 1.918], CLK0: ['Tdcmpco', 8, 'min', 2.083, 5.917] });
  // CLK2X (1.607 to 50 ns) and CLKFX180 of the halved input; no feedback: the DFS's CLKIN halved (1.501 to 2500 ns),
  // CLKFX 3 / 15 over its 100 ns there too, x 8 at 250 ns within it
  assert.deepEqual(sw('CLKFX_DIVIDE::1 CLKFX_MULTIPLY::2 CLKIN_DIVIDE_BY_2::CLKIN_DIVIDE_BY_2 CLK_FEEDBACK::1X', ['CLK0', 'CLK2X', 'CLKFX180']), {
    CLKIN: ['Tdcmpc', 20, 'min', 2.082, 17.918], CLK0: ['Tdcmpco', 40, 'min', 2.083, 37.917], CLK2X: ['Tdcmpco', 20, 'min', 1.607, 18.393], CLKFX180: ['Tdcmpfx', 20, 'min', 1.533, 18.467] });
  assert.deepEqual(sw('CLKFX_DIVIDE::15 CLKFX_MULTIPLY::3 CLKIN_DIVIDE_BY_2::CLKIN_DIVIDE_BY_2 CLK_FEEDBACK::NONE', ['CLKFX']), {
    CLKIN: ['Tdcmpc', 20, 'min', 1.501, 18.499], CLKFX: ['Tdcmpfx', 200, 'max', 100, -100] });
  assert.deepEqual(sw('CLKFX_DIVIDE::1 CLKFX_MULTIPLY::8 CLKIN_DIVIDE_BY_2::CLKIN_DIVIDE_BY_2 CLK_FEEDBACK::NONE', ['CLKFX'], 250), {
    CLKIN: ['Tdcmpc', 250, 'min', 1.501, 248.499], CLKFX: ['Tdcmpfx', 62.5, 'max', 100, 37.5] });
  // feat_dcm_div2 now: CLKFX x 2 / 5, 100 ns, at its limit (trce: slack 0.000)
  assert.deepEqual(sw('CLKFX_DIVIDE::5 CLKFX_MULTIPLY::2 CLKIN_DIVIDE_BY_2::CLKIN_DIVIDE_BY_2 CLK_FEEDBACK::1X DESKEW_ADJUST::0', ['CLK0', 'CLKFX']).CLKFX, ['Tdcmpfx', 100, 'max', 100, 0]);
  // (ISE's XDL writes #OFF for a setting off)
  assert.deepEqual(sw('CLKIN_DIVIDE_BY_2::#OFF CLK_FEEDBACK::1X', ['CLK0']).CLKIN, ['Tdcmpc', 20, 'min', 4.166, 15.834]);
});
