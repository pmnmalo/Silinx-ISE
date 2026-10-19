// core/fpga/route.js: the router (PathFinder) and the routing check; core/xdl.js writeXdl.
// Device: test/fixtures/fpga/route-device.xdlrc (hand-made). Designs: small XDL texts below.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packDevice, loadDevice } from '../core/fpga/device.js';
import { routeDesign, checkRouting, netEndpoints, clockReach } from '../core/fpga/route.js';
import { parseXdl, writeXdl } from '../core/xdl.js';
import { makeDb, knownRouting } from '../core/fpga/bitgen.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fpga');
const device = loadDevice(packDevice(fs.readFileSync(path.join(FIX, 'route-device.xdlrc'), 'utf8')));

// a placed design: instances on sites (their configuration does not matter to the router)
const inst = (name, type, tile, site) => `inst "${name}" "${type}",placed ${tile} ${site}  ,\n  cfg " A::B "\n  ;\n`;
const net = (name, type, outpins, inpins, pips = []) =>
  `net "${name}" ${type || ''}, \n${outpins.map(([i, p]) => `  outpin "${i}" ${p} ,\n`).join('')}${inpins.map(([i, p]) => `  inpin "${i}" ${p} ,\n`).join('')}${pips.map(p => `  pip ${p} ,\n`).join('')}  ;\n`;
const INSTS = inst('pad', 'IOB', 'LIOIS_X0Y0', 'P1') + inst('a0', 'SLICEL', 'CLB_X1Y0', 'SLICE_X0Y0') + inst('a1', 'SLICEL', 'CLB_X1Y0', 'SLICE_X0Y1')
  + inst('b0', 'SLICEL', 'CLB_X2Y0', 'SLICE_X1Y0') + inst('b1', 'SLICEL', 'CLB_X2Y0', 'SLICE_X1Y1') + inst('ck', 'BUFGMUX', 'CLKT_X1Y1', 'BUFGMUX_X1Y1');
const design = nets => parseXdl(`design "t" xc3s50etq144-4 v3.2 ,\n  cfg "";\n${INSTS}${nets}`);
const pipsOf = (r, name) => r.design.nets.filter(n => n.name === name).flatMap(n => n.pips.map(p => `${p.tile} ${p.from} ${p.dir} ${p.to}`)).sort();

test('netEndpoints: source and sink nodes of each net from the placed sites; unknown pins reported', () => {
  const d = design(net('n', '', [['a0', 'X']], [['b0', 'F1'], ['b1', 'NOPIN'], ['ghost', 'F1']]));
  const { nets, errors } = netEndpoints(d, device);
  assert.deepEqual(nets[0].sources, [device.sitePinNode('SLICE_X0Y0', 'X')]);
  assert.deepEqual(nets[0].sinks.map(s => s.node), [device.sitePinNode('SLICE_X1Y0', 'F1')]);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /site SLICE_X1Y1 has no pin NOPIN/);
  assert.match(errors[1], /ghost\.F1: instance not placed or unknown/);
  // the made-up source of ISE's power nets: the site is in the name
  const v = netEndpoints(design(net('v', 'vcc', [['XDL_DUMMY_CLB_X2Y0_VCC_X2Y0', 'VCCOUT']], [['b0', 'F2']])), device);
  assert.deepEqual(v.nets[0].sources, [device.sitePinNode('VCC_X2Y0', 'VCCOUT')]);
  assert.deepEqual(v.errors, []);
});

test('routeDesign: a two-sink net is routed as one tree of PIPs and passes the check', () => {
  const r = routeDesign(design(net('n', '', [['a0', 'X']], [['b0', 'F1'], ['b1', 'F1']])), device);
  assert.equal(r.routed, 1);
  assert.deepEqual(r.failed, []);
  assert.equal(r.overused, 0);
  assert.deepEqual(pipsOf(r, 'n'), [
    'CLB_X1Y0 OMUX0 -> E2BEG0', 'CLB_X1Y0 X0 -> OMUX0', 'CLB_X2Y0 E2END0 -> F1_B_PINWIRE0', 'CLB_X2Y0 E2END0 -> F1_B_PINWIRE1',
  ]);
  assert.ok(checkRouting(r.design, device).ok);
});

test('routeDesign: two nets wanting the same wire: the one that can, takes the longer way', () => {
  // a0.X -> b0.F1 can only use E2BEG0; a1.X -> b1.F1 prefers E2BEG0 too (3 nodes) but can go by E2BEG1 + HOP1 (4).
  // E2BEG0 is the only way into b0.F1, so it is na's from the start (#82): no conflict to negotiate
  const r = routeDesign(design(net('na', '', [['a0', 'X']], [['b0', 'F1']]) + net('nb', '', [['a1', 'X']], [['b1', 'F1']])), device);
  assert.equal(r.overused, 0);
  assert.equal(r.iterations, 1);
  assert.ok(pipsOf(r, 'na').includes('CLB_X1Y0 OMUX0 -> E2BEG0'));
  assert.deepEqual(pipsOf(r, 'nb'), ['CLB_X1Y0 OMUX1 -> E2BEG1', 'CLB_X1Y0 X1 -> OMUX1', 'CLB_X2Y0 E2END1 -> HOP1', 'CLB_X2Y0 HOP1 -> F1_B_PINWIRE1']);
  assert.ok(checkRouting(r.design, device).ok);
});

test('routeDesign: a global clock takes the GCLK network even when general routing is shorter', () => {
  const r = routeDesign(design(net('clk', '', [['ck', 'O']], [['a0', 'CLK'], ['b1', 'CLK']])), device);
  assert.deepEqual(pipsOf(r, 'clk'), [
    'CLB_X1Y0 GCLK0 -> CLK0', 'CLB_X2Y0 GCLK0 -> CLK1', 'CLKT_X1Y1 CLKT_GCLK_MAIN0 -> CLKT_GCLK_SPINE0', 'CLKT_X1Y1 CLKT_GCLK_PINWIRE0 -> CLKT_GCLK_MAIN0',
  ]);
  // the same source driving a non-clock design pin falls back to general routing (here: none exists)
  assert.ok(checkRouting(r.design, device).ok);
});

test('routeDesign: carry chain, bidirectional PIPs, route-throughs never used, unreachable sinks reported', () => {
  const r = routeDesign(design(
    net('carry', '', [['a0', 'COUT']], [['a1', 'CIN']])
    + net('bx', '', [['pad', 'I']], [['a1', 'BX']])
    + net('lost', '', [['a0', 'X']], [['b0', 'CIN']])), device);
  assert.deepEqual(pipsOf(r, 'carry'), ['CLB_X1Y0 COUT0 -> CIN1']);
  // pad -> E2END0 -> BX0 -> (bidirectional, written BX0 =- BX1) -> BX1 -> BX pin of the upper slice
  assert.deepEqual(pipsOf(r, 'bx'), ['CLB_X1Y0 BX0 =- BX1', 'CLB_X1Y0 BX1 -> BX_PINWIRE1', 'CLB_X1Y0 E2END0 -> BX0', 'LIOIS_X0Y0 IOIS_I0 -> IOIS_E0']);
  assert.ok(!r.design.nets.some(n => n.pips.some(p => p.from === 'F1_B_PINWIRE0' && p.to === 'X0')));
  assert.deepEqual(r.failed, ['lost']);
  const c = checkRouting(r.design, device);
  assert.deepEqual(c.problems, ['net lost: sink b0.CIN not reached']);
});

test('routeDesign: a route-through only out of the net\'s own source site onto a free pin (COUT -> X, like ISE\'s COUT -> YB)', () => {
  // a1 is the top of a carry chain: its COUT leaves the slice through X1 when X1 is free
  const r = routeDesign(design(net('cy', '', [['a1', 'COUT']], [['b1', 'F1']])), device);
  assert.deepEqual(r.failed, []);
  assert.ok(pipsOf(r, 'cy').includes('CLB_X1Y0 COUT1 -> X1'));
  assert.ok(checkRouting(r.design, device).ok);
  // X1 used by another net: no way out
  const r2 = routeDesign(design(net('cy', '', [['a1', 'COUT']], [['b1', 'F1']]) + net('x', '', [['a1', 'X']], [['b0', 'F1']])), device);
  assert.deepEqual(r2.failed, ['cy']);
  assert.equal(r2.routed, 1);
});

test('routeDesign: a net that fails in the first pass stays reported when later passes reroute only some nets', () => {
  // na (a0.X -> b1.F1) and nc (a0.Y -> pad.O1) both need OMUX0: a conflict no pass resolves, so every
  // pass reroutes them, and only them
  const r = routeDesign(design(net('na', '', [['a0', 'X']], [['b1', 'F1']]) + net('nc', '', [['a0', 'Y']], [['pad', 'O1']]) + net('lost', '', [['pad', 'I']], [['b0', 'CIN']])), device, { maxIterations: 3 });
  assert.deepEqual([r.iterations, r.overused], [3, 1]);
  assert.deepEqual(r.failed, ['lost']);
  assert.equal(r.routed, 2);
});

test('routeDesign: a sink the bounded search does not reach is searched again further (searchCapRetry, #33)', () => {
  const nets = net('n', '', [['a0', 'X']], [['b0', 'F1'], ['b1', 'F1']]);
  // a search may expand 1 node: no sink reached, unless the second search may look further
  const r = routeDesign(design(nets), device, { searchCap: 1, searchCapRetry: 1 });
  assert.deepEqual([r.routed, r.failed], [0, ['n']]);
  const r2 = routeDesign(design(nets), device, { searchCap: 1 });
  assert.deepEqual([r2.routed, r2.failed, r2.overused], [1, [], 0]);
  assert.deepEqual(pipsOf(r2, 'n'), pipsOf(routeDesign(design(nets), device), 'n'));
  assert.ok(checkRouting(parseXdl(writeXdl(r2.design)), device).ok);
});

test('routeDesign: a search stays in the net\'s region first, anywhere when the region has no path (boxMargin, #55)', () => {
  const nets = net('na', '', [['a0', 'X']], [['b0', 'F1']]) + net('nb', '', [['a1', 'X']], [['b1', 'F1']]);
  const free = routeDesign(design(nets), device, { boxMargin: null });
  assert.deepEqual([free.routed, free.failed, free.overused], [2, [], 0]);
  // a region with nothing in it (a negative margin): every sink is found by the search anywhere,
  // as without regions
  const none = routeDesign(design(nets), device, { boxMargin: -100 });
  for (const n of ['na', 'nb']) assert.deepEqual(pipsOf(none, n), pipsOf(free, n), n);
  // the default region (3 tiles around the pins) holds these paths: the same routing
  const boxed = routeDesign(design(nets), device);
  for (const n of ['na', 'nb']) assert.deepEqual(pipsOf(boxed, n), pipsOf(free, n), n);
  assert.ok(checkRouting(parseXdl(writeXdl(boxed.design)), device).ok);
});

test('routeDesign: the search for a sink of a large tree starts near the sink (seedAll, #55)', () => {
  // seedAll 0: every tree counts as large; the second sink's search starts from the source and the
  // tree's nodes within reach of it, and still joins the tree: one legal tree reaching both sinks
  const nets = net('n', '', [['a0', 'X']], [['b0', 'F1'], ['b1', 'F1']]);
  for (const timing of [false, true]) {
    const r = routeDesign(design(nets), device, { seedAll: 0, timing });
    assert.deepEqual([r.routed, r.failed, r.overused], [1, [], 0]);
    assert.deepEqual(pipsOf(r, 'n'), pipsOf(routeDesign(design(nets), device, { timing }), 'n'));
    assert.ok(checkRouting(parseXdl(writeXdl(r.design)), device).ok);
  }
});

test('routeDesign: VCC without a source is tied to the VCC site of each sink tile (ISE-style dummy source); with one, from it', () => {
  const r = routeDesign(design(net('pwr', 'vcc', [], [['a0', 'F2'], ['b1', 'F2']])), device);
  const out = r.design.nets.filter(n => n.type === 'vcc');
  assert.deepEqual(out.map(n => [n.name, n.outpins[0].inst, n.outpins[0].pin]), [
    ['pwr_0', 'XDL_DUMMY_CLB_X1Y0_VCC_X1Y0', 'VCCOUT'], ['pwr_1', 'XDL_DUMMY_CLB_X2Y0_VCC_X2Y0', 'VCCOUT'],
  ]);
  assert.deepEqual(out.map(n => n.pips.map(p => `${p.tile} ${p.from} -> ${p.to}`)), [['CLB_X1Y0 VCC_PINWIRE -> F2_B_PINWIRE0'], ['CLB_X2Y0 VCC_PINWIRE -> F2_B_PINWIRE1']]);
  // the made-up sources are declared as instances, as ISE does (xdl -xdl2ncd needs them)
  const dum = r.design.insts.filter(i => /^XDL_DUMMY/.test(i.name));
  assert.deepEqual(dum.map(i => [i.name, i.type, i.tile, i.site, i.cfgRaw]), [
    ['XDL_DUMMY_CLB_X1Y0_VCC_X1Y0', 'VCC', 'CLB_X1Y0', 'VCC_X1Y0', '_NO_USER_LOGIC:: _VCC_SOURCE::VCCOUT '],
    ['XDL_DUMMY_CLB_X2Y0_VCC_X2Y0', 'VCC', 'CLB_X2Y0', 'VCC_X2Y0', '_NO_USER_LOGIC:: _VCC_SOURCE::VCCOUT '],
  ]);
  assert.match(writeXdl(r.design), /inst "XDL_DUMMY_CLB_X1Y0_VCC_X1Y0" "VCC",placed CLB_X1Y0 VCC_X1Y0 {2},\n {2}cfg "_NO_USER_LOGIC:: _VCC_SOURCE::VCCOUT "/);
  assert.ok(checkRouting(r.design, device).ok);
  const r2 = routeDesign(design(net('v', 'vcc', [['XDL_DUMMY_CLB_X2Y0_VCC_X2Y0', 'VCCOUT']], [['b0', 'F2']])), device);
  assert.deepEqual(pipsOf(r2, 'v'), ['CLB_X2Y0 VCC_PINWIRE -> F2_B_PINWIRE0']);
  // an ordinary net without a source is reported
  const r3 = routeDesign(design(net('w', '', [], [['b0', 'F2']])), device);
  assert.match(r3.errors[0], /net w: no source/);
});

test('routeDesign: GND without a source comes from the Y output of the nearest unused slice (ISE-style dummy); merged nets split per source', () => {
  // slice SLICE_X0Y1 (a1) is left free: its Y reaches b0.F1 by OMUX1 -> E2BEG0
  const insts = INSTS.replace(/inst "a1"[^;]*;\n/, '');
  const d = parseXdl(`design "t" xc3s50etq144-4 v3.2 ,\n  cfg "";\n${insts}${net('g1', 'gnd', [], [['b0', 'F1']])}${net('g2', 'gnd', [], [['b1', 'F1']])}`);
  const r = routeDesign(d, device);
  assert.deepEqual(r.errors, []);
  const g = r.design.nets.filter(n => n.type === 'gnd');
  assert.deepEqual(g.map(n => [n.name, n.outpins[0].inst, n.outpins[0].pin, n.inpins.map(p => p.inst)]), [['g1_0', 'XDL_DUMMY_CLB_X1Y0_SLICE_X0Y1', 'Y', ['b0', 'b1']]]);
  assert.deepEqual(r.design.insts.filter(i => /^XDL_DUMMY/.test(i.name)).map(i => [i.type, i.site, i.cfgRaw]), [['SLICEL', 'SLICE_X0Y1', '_NO_USER_LOGIC:: _GND_SOURCE::Y ']]);
  assert.equal(r.design.nets.filter(n => n.name === 'g2').length, 0, 'the merged net is not written twice');
  assert.ok(checkRouting(r.design, device).ok);
  // no free slice at all: reported
  const r2 = routeDesign(design(net('g', 'gnd', [], [['b0', 'F2']])), device);
  assert.match(r2.errors[0], /net g: no free site for a gnd source/);
});

test('routeDesign allowPip: only the allowed PIPs (direction of the signal); a sink unreachable on them fails, listed', () => {
  // E2BEG0 forbidden: a1.X -> b1.F1 takes the longer way by E2BEG1 + HOP1
  const seen = [];
  const allowPip = (tile, from, to) => { seen.push(`${tile} ${from}->${to}`); return to !== 'E2BEG0'; };
  const r = routeDesign(design(net('na', '', [['a1', 'X']], [['b1', 'F1']])), device, { allowPip });
  assert.deepEqual(r.failed, []);
  assert.deepEqual(pipsOf(r, 'na'), ['CLB_X1Y0 OMUX1 -> E2BEG1', 'CLB_X1Y0 X1 -> OMUX1', 'CLB_X2Y0 E2END1 -> HOP1', 'CLB_X2Y0 HOP1 -> F1_B_PINWIRE1']);
  assert.ok(checkRouting(r.design, device).ok);
  // a bidirectional PIP is offered in the direction it would be used: BX0 -> BX1 (written BX0 =- BX1)
  routeDesign(design(net('bx', '', [['pad', 'I']], [['a1', 'BX']])), device, { allowPip });
  assert.ok(seen.includes('CLB_X1Y0 BX0->BX1'));
  // nothing allowed out of the source: the net fails, its sinks listed
  const r2 = routeDesign(design(net('nb', '', [['a0', 'X']], [['b0', 'F1'], ['b1', 'F1']])), device, { allowPip: () => false });
  assert.deepEqual(r2.failed, ['nb']);
  assert.deepEqual(r2.unreached, [{ net: 'nb', inst: 'b0', pin: 'F1' }, { net: 'nb', inst: 'b1', pin: 'F1' }]);
  assert.deepEqual(routeDesign(design(net('nc', '', [['a0', 'X']], [['b0', 'F1']])), device).unreached, []);
});

test('routeDesign allowPip / allowConstSource: a VCC sink reached through an allowed PIP, GND only from allowed slices', () => {
  // VCC_PINWIRE -> F2_B_PINWIRE1 of CLB_X2Y0 forbidden: never used; this small device has no other
  // way to b1.F2, so the net fails and says which sink
  const allowPip = (tile, from, to) => !(tile === 'CLB_X2Y0' && from === 'VCC_PINWIRE' && to === 'F2_B_PINWIRE1');
  const r = routeDesign(design(net('pwr', 'vcc', [], [['b1', 'F2']])), device, { allowPip });
  assert.ok(!r.design.nets.some(n => n.pips.some(p => p.tile === 'CLB_X2Y0' && p.from === 'VCC_PINWIRE' && p.to === 'F2_B_PINWIRE1')));
  assert.deepEqual(r.unreached, [{ net: 'pwr_0', inst: 'b1', pin: 'F2' }]);
  // allowed: the PIP of the sink's own tile, as without the option
  const r1 = routeDesign(design(net('pwr', 'vcc', [], [['b1', 'F2']])), device, { allowPip: () => true });
  assert.deepEqual(r1.design.nets.filter(n => n.type === 'vcc').map(n => n.pips.map(p => `${p.tile} ${p.from} -> ${p.to}`)), [['CLB_X2Y0 VCC_PINWIRE -> F2_B_PINWIRE1']]);
  // the only free slice not allowed as a GND source: reported like no free slice
  const insts = INSTS.replace(/inst "a1"[^;]*;\n/, '');
  const d = parseXdl(`design "t" xc3s50etq144-4 v3.2 ,\n  cfg "";\n${insts}${net('g', 'gnd', [], [['b0', 'F1']])}`);
  const asked = [];
  const r2 = routeDesign(d, device, { allowConstSource: (kind, site) => { asked.push([kind, site.name, site.tileName, site.type]); return false; } });
  assert.deepEqual(asked, [['gnd', 'SLICE_X0Y1', 'CLB_X1Y0', 'SLICEL']]);
  assert.match(r2.errors[0], /net g: no free site for a gnd source/);
  assert.deepEqual(routeDesign(d, device, { allowConstSource: () => true }).errors, []);
});

test('routeDesign: existing PIPs are replaced; nets without sinks get none; the input design is not changed', () => {
  const d = design(net('n', '', [['a0', 'X']], [['b0', 'F1']], ['CLB_X1Y0 X1 -> OMUX1']) + net('empty', '', [['a1', 'X']], []));
  const r = routeDesign(d, device);
  assert.equal(pipsOf(r, 'n').length, 3);
  assert.deepEqual(pipsOf(r, 'empty'), []);
  assert.deepEqual(d.nets[0].pips, [{ tile: 'CLB_X1Y0', from: 'X1', dir: '->', to: 'OMUX1' }]);
});

test('routeDesign: LUT inputs are swapped when the pin a net reaches is not the one it was given; the equation follows', () => {
  // b0.F2 is reached only from W2END0 (nothing east of CLB_X2Y0) or VCC: a0.X -> b0.F2 cannot be
  // routed as given, but the LUT's F1 is free and reached by E2END0
  const lut = (cfg, nets) => parseXdl(`design "t" xc3s50etq144-4 v3.2 ,\n  cfg "";\n${INSTS.replace(/(inst "b0"[^\n]*\n {2}cfg ")[^"]*"/, `$1${cfg}"`)}${nets}`);
  const d = lut(' F:b0_f:#LUT:D=(~A2*A3) CY0F::0 ', net('n', '', [['a0', 'X']], [['b0', 'F2']]));
  const r = routeDesign(d, device);
  assert.deepEqual(r.failed, []);
  assert.deepEqual(r.errors, []);
  const n = r.design.nets.find(x => x.name === 'n');
  assert.deepEqual(n.inpins, [{ inst: 'b0', pin: 'F1' }]);
  assert.deepEqual(pipsOf(r, 'n'), ['CLB_X1Y0 OMUX0 -> E2BEG0', 'CLB_X1Y0 X0 -> OMUX0', 'CLB_X2Y0 E2END0 -> F1_B_PINWIRE0']);
  // the variable of F2 is now A1 (A3: a pin this site does not have, kept)
  const b0 = r.design.insts.find(i => i.name === 'b0');
  assert.equal(b0.cfg.find(c => c.attr === 'F').value, '#LUT:D=(~A1*A3)');
  assert.equal(b0.cfgRaw, undefined, 'written from the items');
  assert.match(writeXdl(r.design), /cfg " F:b0_f:#LUT:D=\(~A1\*A3\) CY0F::0 "/);
  assert.ok(checkRouting(parseXdl(writeXdl(r.design)), device).ok);
  // the input design is not changed
  assert.deepEqual(d.nets[0].inpins, [{ inst: 'b0', pin: 'F2' }]);
  assert.equal(d.insts.find(i => i.name === 'b0').cfg[0].value, '#LUT:D=(~A2*A3)');
  // the carry's data input on F2 (#25): its net may take F1, the setting follows it
  const c = routeDesign(lut(' F:b0_f:#LUT:D=(~A2*A3) CY0F::F2 ', net('n', '', [['a0', 'X']], [['b0', 'F2']])), device);
  assert.deepEqual(c.failed, []);
  assert.deepEqual(c.design.nets.find(x => x.name === 'n').inpins, [{ inst: 'b0', pin: 'F1' }]);
  assert.match(writeXdl(c.design), /cfg " F:b0_f:#LUT:D=\(~A1\*A3\) CY0F::F1 "/);
  assert.ok(checkRouting(parseXdl(writeXdl(c.design)), device).ok);
  // not swapped: the option off, a LUT that is not an equation; the carry's data input when the
  // other of pins 1 and 2 is taken by a net the router does not route
  for (const [cfg, opts, more] of [[' F:b0_f:#LUT:D=~A2 ', { swapLutPins: false }, ''], [' F:b0_f:#RAM:D=~A2 ', {}, ''], [' A::B ', {}, ''],
    [' F:b0_f:#LUT:D=(A1*~A2) CY0F::F2 ', {}, net('z', '', [], [['b0', 'F1']])]]) {
    const x = routeDesign(lut(cfg, net('n', '', [['a0', 'X']], [['b0', 'F2']]) + more), device, opts);
    assert.deepEqual(x.failed, ['n'], cfg);
    assert.deepEqual(x.unreached, [{ net: 'n', inst: 'b0', pin: 'F2' }]);
  }
  // a pin of a net the router does not route (no source) stays: F1 is not free, F2 cannot be reached
  const y = routeDesign(lut(' F:b0_f:#LUT:D=(A1*~A2) ', net('n', '', [['a0', 'X']], [['b0', 'F2']]) + net('z', '', [], [['b0', 'F1']])), device);
  assert.deepEqual(y.failed, ['n']);
  assert.equal(y.design.insts.find(i => i.name === 'b0').cfg[0].value, '#LUT:D=(A1*~A2)');
  // nor does a made-up power net's (VCC reaches F2 only: n keeps F1, nothing moves)
  const v = routeDesign(lut(' F:b0_f:#LUT:D=(A1*~A2) ', net('n', '', [['a0', 'X']], [['b0', 'F1']]) + net('v', 'vcc', [], [['b0', 'F2']])), device);
  assert.deepEqual(v.failed, []);
  assert.deepEqual(v.design.nets.find(x => x.name === 'n').inpins, [{ inst: 'b0', pin: 'F1' }]);
  assert.equal(v.design.insts.find(i => i.name === 'b0').cfg[0].value, '#LUT:D=(A1*~A2)');
});

test('clockReach: the slices whose clock pin a global buffer reaches on the clock network, through allowed PIPs only', () => {
  assert.deepEqual([...clockReach(device, 'BUFGMUX_X1Y1')].sort(), ['SLICE_X0Y0', 'SLICE_X0Y1', 'SLICE_X1Y0', 'SLICE_X1Y1']);
  // GCLK0 -> CLK1 of CLB_X2Y0 not allowed: its upper slice is not reached (S2END0 -> CLK is general routing, not followed)
  const allow = (tile, from, to) => !(tile === 'CLB_X2Y0' && from === 'GCLK0' && to === 'CLK1');
  assert.deepEqual([...clockReach(device, 'BUFGMUX_X1Y1', allow)].sort(), ['SLICE_X0Y0', 'SLICE_X0Y1', 'SLICE_X1Y0']);
  assert.deepEqual([...clockReach(device, 'NO_SUCH_SITE')], []);
});

test('routeDesign with knownRouting: a PIP the tile lacks though its type\'s features offer it is never taken (#74)', () => {
  // a database whose CLB type has every PIP of the fixture's CLBs (one bit each), as a device
  // description built from the database's features per type would offer them
  const k = device.tile('CLB_X1Y0');
  const features = {};
  for (let i = 0; i < device.templates[device.tileTemplate[k]].from.length; i++) { const [a, b] = device.pipWires(k, i); features[`${a}->${b}`] = ['0,0']; }
  const db = absent => knownRouting(makeDb({ layout: { cols: { 1: 0, 2: 19 }, rows: { 0: 0 } }, lut: null, tiles: { types: { CENTER_SMALL: { features, ...absent } } } }));
  const route = (absent, nets) => routeDesign(design(nets), device, db(absent));
  const nb = net('nb', '', [['a1', 'X']], [['b1', 'F1']]);
  // the shortest way: OMUX1 -> E2BEG0; without it in CLB_X1Y0 (a feature, or the whole wire), E2BEG1 + HOP1
  assert.deepEqual(pipsOf(route({}, nb), 'nb'), ['CLB_X1Y0 OMUX1 -> E2BEG0', 'CLB_X1Y0 X1 -> OMUX1', 'CLB_X2Y0 E2END0 -> F1_B_PINWIRE1']);
  const longer = ['CLB_X1Y0 OMUX1 -> E2BEG1', 'CLB_X1Y0 X1 -> OMUX1', 'CLB_X2Y0 E2END1 -> HOP1', 'CLB_X2Y0 HOP1 -> F1_B_PINWIRE1'];
  for (const absent of [{ absentIn: [{ tiles: ['CLB_X1Y0'], absent: ['OMUX1->E2BEG0'] }] }, { absentIn: [{ tiles: ['CLB_X1Y0'], absent: ['E2BEG0'] }] }, { absent: ['OMUX1->E2BEG0'] }]) {
    const r = route(absent, nb);
    assert.deepEqual(pipsOf(r, 'nb'), longer, JSON.stringify(absent));
    assert.deepEqual(r.failed, []);
  }
  // in another tile of the type the PIP is still taken
  assert.deepEqual(pipsOf(route({ absentIn: [{ tiles: ['CLB_X2Y0'], absent: ['OMUX1->E2BEG0'] }] }, nb), 'nb'), ['CLB_X1Y0 OMUX1 -> E2BEG0', 'CLB_X1Y0 X1 -> OMUX1', 'CLB_X2Y0 E2END0 -> F1_B_PINWIRE1']);
  // a sink only the missing PIP reaches: the net fails, never routed through it
  const r = route({ absentIn: [{ tiles: ['CLB_X1Y0'], absent: ['OMUX0->E2BEG0'] }] }, net('na', '', [['a0', 'X']], [['b0', 'F1']]));
  assert.deepEqual(r.failed, ['na']);
  assert.ok(!r.design.nets.some(n => n.pips.some(p => p.tile === 'CLB_X1Y0' && p.from === 'OMUX0' && p.to === 'E2BEG0')));
});

// #82: a slice's BX / BY pin is reached through its BX / BY wire only, which also feeds LUT inputs of
// the CLB (BY1 -> F1_B3). On the shipped XC3S250E graph, on switches of known bits: net b's best way
// to SLICE_X19Y23.F1 is through BY1 of CLB_X10Y12, the only way into SLICE_X19Y22.BY (net a). The
// pin's wire belongs to its net: b goes round it from the first pass, and no node is left shared (on
// the XC3S1200E a Y -> BY net between neighbouring slices failed this way at some seeds).
test('routeDesign: a pin\'s only entry wire (a slice\'s BY wire) is its net\'s; no other net passes through it (#82)', async () => {
  const { loadDeviceCache } = await import('../core/fpga/device-node.js');
  const { loadDb } = await import('../core/fpga/bitdb-node.js');
  const part = 'xc3s250ecp132-4';
  const g = loadDeviceCache(part);
  const known = knownRouting(loadDb(part, { graph: g }));
  const slice = (name, s) => `inst "${name}" "SLICEL",placed ${g.tileNames[g.site(s).tile]} ${s} ,\n  cfg " A::B "\n  ;\n`;
  const pair = parseXdl(`design "t" ${part} v3.2 ,\n  cfg "";\n${slice('s', 'SLICE_X16Y24')}${slice('d', 'SLICE_X19Y23')}${slice('u', 'SLICE_X17Y22')}${slice('t', 'SLICE_X19Y22')}`
    + `${net('b', '', [['s', 'X']], [['d', 'F1']])}${net('a', '', [['u', 'Y']], [['t', 'BY']])}`);
  const only = parseXdl(writeXdl({ ...pair, nets: pair.nets.filter(n => n.name === 'b') }));
  assert.equal(g.nodeName(g.sitePinNode('SLICE_X19Y22', 'BY')), 'CLB_X10Y12/BY_PINWIRE1');
  const by1 = p => p.tile === 'CLB_X10Y12' && (p.from === 'BY1' || p.to === 'BY1');
  // alone, b takes BY1 (its pin is not used)
  assert.ok(routeDesign(only, g, { ...known, timing: true }).design.nets[0].pips.some(by1));
  for (const timing of [false, true]) {
    // one pass: legal at once, b around BY1, a through it
    const r = routeDesign(pair, g, { ...known, timing, maxIterations: 1 });
    assert.deepEqual([r.routed, r.failed, r.overused, r.iterations], [2, [], 0, 1], `timing ${timing}`);
    const pips = name => r.design.nets.find(n => n.name === name).pips;
    assert.ok(!pips('b').some(by1), `timing ${timing}: b keeps off BY1`);
    assert.deepEqual(pips('a').filter(p => p.tile === 'CLB_X10Y12').map(p => `${p.from} -> ${p.to}`).sort(), ['BY1 -> BY_PINWIRE1', 'E2MID4 -> BY1'], `timing ${timing}`);
    assert.ok(checkRouting(r.design, g).ok);
  }
});

test('checkRouting: unknown PIPs, unreached sinks, antennas and nodes shared by two nets', () => {
  const bad = design(
    net('n1', '', [['a0', 'X']], [['b0', 'F1']], ['CLB_X1Y0 X0 -> OMUX0', 'CLB_X1Y0 OMUX0 -> E2BEG0', 'CLB_X2Y0 E2END0 -> F1_B_PINWIRE0', 'CLB_X1Y0 OMUX0 -> W2BEG0', 'CLB_X1Y0 X0 -> NOWIRE'])
    + net('n2', '', [['a1', 'X']], [['b1', 'F1']], ['CLB_X1Y0 X1 -> OMUX1', 'CLB_X1Y0 OMUX1 -> E2BEG0']));
  const c = checkRouting(bad, device);
  assert.equal(c.ok, false);
  assert.deepEqual(c.problems.sort(), [
    'net n1: LIOIS_X0Y0/IOIS_W2END0 leads nowhere (antenna)',
    'net n1: no PIP CLB_X1Y0 X0 -> NOWIRE',
    'net n2: CLB_X1Y0/E2BEG0 leads nowhere (antenna)',
    'net n2: sink b1.F1 not reached',
    'node CLB_X1Y0/E2BEG0 used by n1 and n2',
  ]);
});

test('writeXdl: parse -> write -> parse keeps instances, configurations (as written), nets, pins and PIPs', () => {
  const text = fs.readFileSync(path.join(FIX, 'top.xdl'), 'utf8');
  const a = parseXdl(text);
  const out = writeXdl(a);
  const b = parseXdl(out);
  const strip = d => ({ ...d, cfgRaw: undefined, insts: d.insts.map(i => ({ ...i, cfgRaw: undefined })), nets: d.nets.map(n => ({ ...n, cfgRaw: undefined })) });
  assert.deepEqual(strip(b), strip(a));
  assert.match(out, /name\\:with\\:colons:x/, 'escapes inside configurations are kept as written');
  assert.match(out, /^net "GLOBAL_LOGIC1" vcc, $/m);
  assert.match(out, /^ {2}pip TIOIS_X1Y3 IOIS_IQ1 => OMUX0 ,$/m);
  // a design built in memory (no raw configuration text): the items are written with escapes
  const c = parseXdl(writeXdl({ name: 'x', part: 'p', insts: [{ name: 'i', type: 'SLICEL', placed: true, tile: 'T', site: 'S', cfg: [{ attr: 'F', name: 'a:b c', value: '#LUT:D=A1' }] }], nets: [] }));
  assert.equal(c.insts[0].cfgRaw, ' F:a\\:b\\ c:#LUT:D=A1 ');
});
