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
} from '../core/fpga/timing.js';
import zlib from 'node:zlib';
import { parseDly, twrArcs, memArcs, hardArcs } from '../research/s3e-route/timing-fit.mjs';

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
  const { Tiopi, Tioop } = SPEED_4.pad;
  const r = tg.pads(Float64Array.from([1, 2, 3, 0.5, 4]), new Map([['a', 2], ['b', 2.25]]));
  // pad to setup: the data at a's flip-flop (pad, net, LUT, setup) less the clock's arrival at a
  assert.deepEqual(r.inputs.map(x => [x.pad, x.clock]), [['i', 'clk']]);
  close(r.inputs[0].setup, Tiopi + 1 + S.Tilo[0] + S.Tdxck[0] - 2);
  assert.deepEqual(r.inputs[0].path.map(s => `${s.kind} ${s.inst}.${s.pin}`), ['pad i.I', 'net a.F1', 'setup a.F1']);
  // clock to pad: the clock's arrival at a, its clock to out, the net, the output pad
  assert.deepEqual(r.outputs.map(x => [x.pad, x.clock]), [['o', 'clk']]);
  close(r.outputs[0].delay, 2 + S.TckoX[0] + 3 + Tioop);
  assert.deepEqual(r.outputs[0].path.map(s => s.kind), ['clock-to-out', 'net', 'pad']);
  // pad to pad: through c's LUT only
  assert.deepEqual(r.padToPad.map(x => [x.from, x.to]), [['i', 'p']]);
  close(r.padToPad[0].delay, Tiopi + 2 + S.Tilo[0] + 4 + Tioop);
  // hold: a's clock to out and the 0.5 ns net into b's BY, less the hold time (0); no skew counted
  assert.deepEqual(r.hold.map(h => h.clock), ['clk']);
  close(r.hold[0].slack, S.TckoX[0] + 0.5 - SPEED_4.clock.hold);
  assert.deepEqual(r.hold[0].path.map(s => `${s.kind} ${s.inst}.${s.pin}`), ['clock-to-out a.XQ', 'net b.BY', 'hold b.BY']);
  // a flip-flop with no clock arrival (a clock through a DCM, or made by logic) is left out of the pads' paths
  const none = tg.pads(Float64Array.from([1, 2, 3, 0.5, 4]), new Map());
  assert.deepEqual([none.inputs, none.outputs, none.padToPad.length, none.hold.length], [[], [], 1, 1]);
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
  assert.match(text, /\nOFFSET IN \(pad to setup\), clock clk \(its path from its pad estimated\):\n {2}i +-?\d+\.\d{3} ns\n/);
  assert.match(text, /\nOFFSET OUT \(clock to pad\), clock clk \(its path from its pad estimated\):\n {2}o +\d+\.\d{3} ns\n/);
  assert.match(text, /\npad to pad:\n {2}i +-> p +\d+\.\d{3} ns\n/);
  assert.match(text, /\nhold, clock clk: met, worst slack \d+\.\d{3} ns \(the shortest path; no clock skew counted, hold times estimated\)\n {2}clock-to-out/);
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
  // the pad's delay, the pad to the buffer, the buffer, the clock net: more than the pad and the buffer, a spread of the net
  const v = [...arr.values()];
  assert.ok(Math.min(...v) > SPEED_4.pad.Tiopi + SPEED_4.clock.Tgio, Math.min(...v));
  assert.ok(Math.max(...v) - Math.min(...v) < 1.5, `${Math.min(...v)} .. ${Math.max(...v)}`);
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
  const run = branchLoad => {
    const r = routeDesign(parseXdl(text), dev, { timing: true, branchLoad });
    assert.deepEqual(r.failed, []);
    assert.deepEqual(checkRouting(parseXdl(writeXdl(r.design)), dev).problems.filter(p => !/^net clk: sink/.test(p)), []);   // (the clock has no source here)
    return { period: analyzeTiming(parseXdl(writeXdl(r.design)), dev).period, branches: netTree(r.design.nets.find(n => n.name === 'd').pips, [src], dev).children.get(src) };
  };
  const without = run(0), withLoads = run(1);
  assert.ok(withLoads.branches < without.branches, `${withLoads.branches} < ${without.branches} branches at the driver`);
  assert.ok(withLoads.period < without.period, `${withLoads.period} < ${without.period} ns`);
});
