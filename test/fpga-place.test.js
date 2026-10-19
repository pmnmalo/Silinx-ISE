// The placer (core/fpga/place.js) and the XDL it is written as (core/xdl.js writeXdl), on a small made-up
// device (test/fixtures/fpga/place-device.xdlrc, from research/s3e-place/gen-test-device.mjs):
// legal placements (one instance per site, LOCs kept, carry chains up one column, wide multiplexers
// in their CLB pattern), wirelength going down, the same seed giving the same placement, and the
// placed XDL reading back through core/xdl.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXdlrc, parseXdl } from '../core/xdl.js';
import { packDevice, loadDevice } from '../core/fpga/device.js';
import { readYosysJson } from '../core/fpga/netlist.js';
import { pack } from '../core/fpga/pack.js';
import { deviceSites, place, placedXdl, PlaceError, rng, timingGraph, analyzeTiming, connDelay } from '../core/fpga/place.js';
import { SPEED_4, DELAY_KIND, delayKind } from '../core/fpga/timing.js';
import { writeXdl } from '../core/xdl.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fpga');
const load = n => readYosysJson(fs.readFileSync(path.join(FIX, `${n}.json`), 'utf8'));
const dev = deviceSites(parseXdlrc(fs.readFileSync(path.join(FIX, 'place-device.xdlrc'), 'utf8')));
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const xy = s => { const m = /^SLICE_X(\d+)Y(\d+)$/.exec(s); return m ? [+m[1], +m[2]] : null; };

test('the device from the routing graph (core/fpga/device.js) gives the same sites as from the report', () => {
  // (the router's small device: the placer's has no connections between tiles)
  const text = fs.readFileSync(path.join(FIX, 'route-device.xdlrc'), 'utf8');
  const fromReport = deviceSites(parseXdlrc(text)), fromGraph = deviceSites(loadDevice(packDevice(text)));
  const ser = x => JSON.stringify({ ...x, slices: [...x.slices], pads: [...x.pads] });
  assert.ok(fromReport.slices.size > 0 && fromReport.pads.size > 0 && fromReport.bufgmux.length > 0);
  assert.equal(ser(fromGraph), ser(fromReport));
});

test('the device: slices with positions, bonded pads, clock buffers', () => {
  assert.equal(dev.slices.size, 140);   // 6 x 6 CLBs, one missing
  assert.ok(dev.slices.has('0,0') && !dev.slices.has('4,6'));
  assert.equal(dev.slices.get('3,5').name, 'SLICE_X3Y5');
  assert.ok(!dev.pads.has('NOPAD20'));
  assert.ok([...dev.pads.values()].some(p => p.inputOnly));
  assert.equal(dev.bufgmux.length, 8);
  // positions: slices of one CLB share the tile; y grows upward
  assert.ok(dev.slices.get('0,1').py > dev.slices.get('0,0').py);
  assert.ok(dev.slices.get('1,0').px > dev.slices.get('0,0').px);
});

function checkLegal(p, r) {
  const used = new Set();
  r.sites.forEach((s, i) => {
    assert.ok(!used.has(s.site), `site ${s.site} used twice`);
    used.add(s.site);
    const inst = p.insts[i];
    if (inst.kind === 'slice') assert.match(s.site, /^SLICE_/);
    if (inst.kind === 'iob') { assert.ok(dev.pads.has(s.site), `${inst.name} on ${s.site}`); if (inst.loc) assert.equal(s.site, inst.loc); if (inst.dir === 'out') assert.ok(!dev.pads.get(s.site).inputOnly); }
    if (inst.kind === 'bufg') assert.match(s.site, /^BUFGMUX_/);
  });
  // every group keeps its shape
  for (const m of p.macros) {
    const [x0, y0] = xy(r.sites[m.members[0].inst].site);
    const ax = x0 - m.members[0].dx, ay = y0 - m.members[0].dy;
    for (const x of m.members) assert.deepEqual(xy(r.sites[x.inst].site), [ax + x.dx, ay + x.dy], `${m.kind} shape`);
    if (m.align) { assert.equal(ax % m.align[0], 0, `${m.kind} column`); assert.equal(ay % m.align[1], 0, `${m.kind} row`); }
  }
}

test('counter: a legal placement, LOCs kept, wirelength reduced, same seed same result', () => {
  const ucf = 'NET "clk" LOC = "P3";\nNET "q<0>" LOC = "P10";\nNET "rst" LOC = "P5";';
  const p = pack(load('counter'), { ucf });
  const r = place(p, dev, { seed: 3 });
  checkLegal(p, r);
  assert.ok(r.cost < r.stats.initialCost, `cost ${r.stats.initialCost} -> ${r.cost}`);
  assert.equal(r.sites[p.insts.findIndex(i => i.name === 'clk')].site, 'P3');
  // the clock buffer: on the edge of the pad that drives it (P3 is on the top edge)
  assert.equal(r.sites[p.insts.findIndex(i => i.kind === 'bufg')].site, 'BUFGMUX_X2Y11');
  const again = place(p, dev, { seed: 3 });
  assert.deepEqual(again.sites, r.sites);
  assert.equal(again.cost, r.cost);
  const other = place(p, dev, { seed: 4 });
  checkLegal(p, other);
});

test('a warm start (#87): each instance from the slice or pad given, the groups in shape; a greedy pass keeps the placement, a taken slice gives the nearest free one', () => {
  const p = pack(load('mux64'));
  const r = place(p, dev, { seed: 1, effort: 0.3 });
  const at = r.sites.map(s => (xy(s.site) ? { x: xy(s.site)[0], y: xy(s.site)[1], exact: true } : { site: s.site }));
  // from the placement itself, a move window of one slice, cold (t 0: only moves that lower the cost):
  // legal, on nearly every site it was on (another seed: the start, not the random generator, places it)
  const w = place(p, dev, { seed: 7, start: { at, t: 0, rlim: 1 } });
  checkLegal(p, w);
  const same = w.sites.filter((s, i) => s.site === r.sites[i].site).length;
  assert.ok(same >= 0.95 * r.sites.length, `${same} of ${r.sites.length} on their sites`);
  for (const [i, inst] of p.insts.entries()) if (inst.kind === 'iob' && !inst.loc) assert.equal(w.sites[i].site, r.sites[i].site, `${inst.name}: its pad`);
  // (a design without a clock: the cost is the wirelength alone, which the greedy pass only lowers)
  assert.ok(w.cost <= r.cost + 1e-9, `${w.cost} against ${r.cost}`);
  // two single slices given the same slice: the second (not exact) on a free slice next to it
  const q = pack(load('counter'));
  const rq = place(q, dev, { seed: 3, effort: 0.3 });
  const singles = q.insts.map((x, i) => i).filter(i => q.insts[i].kind === 'slice' && !q.macros.some(m => m.members.some(x => x.inst === i)));
  assert.ok(singles.length >= 2);
  const [a0, b0] = singles;
  const atq = rq.sites.map(s => (xy(s.site) ? { x: xy(s.site)[0], y: xy(s.site)[1], exact: true } : { site: s.site }));
  atq[b0] = { ...atq[a0], exact: false };
  const n = place(q, dev, { seed: 3, start: { at: atq, t: 0, rlim: 1 }, timing: 0 });
  checkLegal(q, n);
  const [ax, ay] = xy(n.sites[a0].site), [bx, by] = xy(n.sites[b0].site);
  assert.ok(Math.max(Math.abs(ax - bx), Math.abs(ay - by)) <= 2, `${n.sites[a0].site} and ${n.sites[b0].site}`);
  // no start: the placement as before (the pinned placements below)
  assert.deepEqual(place(p, dev, { seed: 1, effort: 0.3 }).sites, r.sites);
});

test('mux64: the two-CLB F8 group and the F7 / F6 groups keep their pattern; chains avoid the hole', () => {
  const p = pack(load('mux64'));
  const r = place(p, dev, { seed: 1, effort: 0.3 });
  checkLegal(p, r);
  const q = pack(load('counter'));
  for (let s = 1; s <= 4; s++) checkLegal(q, place(q, dev, { seed: s, effort: 0.2 }));
});

test('clockSites: the flip-flops of a clock stay on the slices its global buffer reaches', () => {
  const ucf = 'NET "clk" LOC = "P3";\nNET "q<0>" LOC = "P10";\nNET "rst" LOC = "P5";';
  const p = pack(load('counter'), { ucf });
  const asked = [];
  // the clock reaches only the slices of the left columns (x < 4)
  const reach = new Set([...dev.slices.values()].filter(s => s.x < 4).map(s => s.name));
  const clocked = new Set(p.nets.filter(n => n.outpins.length && p.insts[n.outpins[0].inst].kind === 'bufg').flatMap(n => n.inpins.filter(q => q.pin === 'CLK').map(q => q.inst)));
  assert.ok(clocked.size > 0);
  for (const seed of [1, 2]) {
    const r = place(p, dev, { seed, effort: 0.3, clockSites: site => { asked.push(site); return reach; } });
    checkLegal(p, r);
    for (const i of clocked) assert.ok(reach.has(r.sites[i].site), `${p.insts[i].name} on ${r.sites[i].site}`);
  }
  assert.deepEqual([...new Set(asked)], ['BUFGMUX_X2Y11']);
  // null: anywhere
  checkLegal(p, place(p, dev, { seed: 1, effort: 0.2, clockSites: () => null }));
});

test('placement timing: delays of core/fpga/timing.js (ns), flip-flop to flip-flop, growing with the distance', () => {
  const p = pack(load('counter'), { ucf: 'NET "clk" LOC = "P3";' });
  const tg = timingGraph(p);
  const r = place(p, dev, { seed: 1, effort: 0.3 });
  const pos = r.sites.map(s => { const x = dev.slices.get([...dev.slices.keys()].find(k => dev.slices.get(k).name === s.site)) || dev.pads.get(s.site) || dev.bufgmux.find(b => b.name === s.site); return [x.px, x.py]; });
  const t = analyzeTiming(tg, pos);
  close(t.dmax, r.delay);
  // at least a flip-flop's clock-to-out, a connection and a setup
  assert.ok(t.dmax > SPEED_4.slice.TckoX[0] + SPEED_4.dist.base + SPEED_4.slice.Tdick[0], `${t.dmax}`);
  assert.ok(t.conns.some(c => c.crit > 0.999));
  // dedicated connections (the carry chain) take no time; others grow with the distance
  for (const c of t.conns) if (c.dedicated) assert.equal(c.delay, 0);
  const near = t.conns.map(c => c.delay);
  const far = analyzeTiming(tg, pos.map(([x, y]) => [x * 3, y * 3]));
  assert.ok(far.dmax >= t.dmax);
  assert.ok(far.conns.every((c, i) => c.delay >= near[i]) && far.conns.some((c, i) => c.delay > near[i]));
});

test('placement timing with the device\'s delay table: connections by their offset, SLICEL / SLICEM arcs by the site, the timing cost follows the table', () => {
  const p = pack(load('counter'), { ucf: 'NET "clk" LOC = "P3";' });
  const tg = timingGraph(p);
  // a made-up table: rows cost much more than columns (dr: tile rows, down; the placer's y is up)
  const table = (col, row) => ({ at: (dc, dr) => 0.2 + col * Math.abs(dc) + row * Math.abs(dr) });
  const rows = table(0.05, 0.5), cols = table(0.5, 0.05);
  close(connDelay([1.5, 4], [3, 2.5], SPEED_4, rows), 0.2 + 0.05 * 2 + 0.5 * 2);
  close(connDelay([1, 4], [3, 2], SPEED_4), SPEED_4.dist.base + 4 * SPEED_4.dist.perTile);
  const posOf = r => r.sites.map(s => { const x = [...dev.slices.values()].find(v => v.name === s.site) || dev.pads.get(s.site) || dev.bufgmux.find(b => b.name === s.site); return [x.px, x.py]; });
  const r = place(p, dev, { seed: 1, effort: 0.3, delays: rows });
  checkLegal(p, r);
  const pos = posOf(r);
  const t = analyzeTiming(tg, pos, rows);
  close(t.dmax, r.delay);
  for (const c of t.conns) close(c.delay, c.dedicated ? 0 : connDelay(pos[c.src], pos[c.dst], SPEED_4, rows));
  assert.deepEqual(place(p, dev, { seed: 1, effort: 0.3, delays: rows }).sites, r.sites, 'deterministic');
  // the critical connections span fewer rows when rows are slow, fewer columns when columns are
  // (srmux: registers and multiplexers spread over several CLBs)
  const q = pack(load('srmux')), tq = timingGraph(q);
  const spread = (x, k) => { const ps = posOf(x), a = analyzeTiming(tq, ps, rows).conns.filter(c => !c.dedicated); return a.reduce((s, c) => s + c.crit * Math.abs(Math.floor(ps[c.src][k]) - Math.floor(ps[c.dst][k])), 0) / a.reduce((s, c) => s + c.crit, 0); };
  const qr = place(q, dev, { seed: 1, effort: 0.3, delays: rows }), qc = place(q, dev, { seed: 1, effort: 0.3, delays: cols });
  checkLegal(q, qr);
  assert.ok(spread(qr, 1) < spread(qc, 1), `rows: ${spread(qr, 1)} vs ${spread(qc, 1)}`);
  assert.ok(spread(qc, 0) < spread(qr, 0), `columns: ${spread(qc, 0)} vs ${spread(qr, 0)}`);
  // the arcs of a slice on a SLICEM (an even column of slices, a whole x) are slower: the same
  // placement moved to the SLICEM of each CLB is no faster
  const f1x = (i, k) => tg.arcs[i][k].deps.X?.find(([q]) => q === 'F1')?.[1];
  const xor = tg.arcs.findIndex((a, i) => p.insts[i].cfg.some(c => c.attr === 'FXMUX' && c.value === 'FXOR'));
  assert.ok(xor >= 0);
  assert.deepEqual([f1x(xor, 0), f1x(xor, 1)], [SPEED_4.slice.Topx[0], SPEED_4.slice.Topx[1]]);
  assert.ok(f1x(xor, 1) > f1x(xor, 0));
  const asL = pos.map(([x, y], i) => (p.insts[i].kind === 'slice' ? [Math.floor(x) + 0.5, y] : [x, y]));
  const asM = pos.map(([x, y], i) => (p.insts[i].kind === 'slice' ? [Math.floor(x), y] : [x, y]));
  assert.ok(analyzeTiming(tg, asM, rows).dmax > analyzeTiming(tg, asL, rows).dmax);
});

test('placement timing by kind of driver (#104): a connection from a flip-flop\'s output (XQ, YQ) reads the delay table\'s flip-flop table', () => {
  const p = pack(load('counter'), { ucf: 'NET "clk" LOC = "P3";' });
  const tg = timingGraph(p);
  for (const c of tg.conns) assert.equal(c.kind, delayKind(c.srcPin));
  assert.ok(tg.conns.some(c => c.kind === DELAY_KIND.REG) && tg.conns.some(c => c.kind === DELAY_KIND.COMB));
  // a made-up table: 0.25 ns more from a flip-flop
  const table = { at: (dc, dr, kind = 0) => 0.2 + 0.1 * (Math.abs(dc) + Math.abs(dr)) + 0.25 * kind };
  close(connDelay([1.5, 4], [3, 2.5], SPEED_4, table, DELAY_KIND.REG), 0.2 + 0.1 * 4 + 0.25);
  const r = place(p, dev, { seed: 1, effort: 0.3, delays: table });
  const pos = r.sites.map(s => { const x = [...dev.slices.values()].find(v => v.name === s.site) || dev.pads.get(s.site) || dev.bufgmux.find(b => b.name === s.site); return [x.px, x.py]; });
  const t = analyzeTiming(tg, pos, table);
  close(t.dmax, r.delay);
  for (const c of t.conns) close(c.delay, c.dedicated ? 0 : 0.2 + 0.1 * (Math.abs(Math.floor(pos[c.dst][0]) - Math.floor(pos[c.src][0])) + Math.abs(Math.floor(pos[c.src][1]) - Math.floor(pos[c.dst][1]))) + 0.25 * c.kind);
});

test('a clock with no LOC goes on a GCLK pin: the free pad whose known dedicated path reaches the best global buffer, kept there (#49)', () => {
  // made-up GCLK pins: P73 (bottom, input-only) reaches BUFGMUX_X2Y1, P70 reaches BUFGMUX_X1Y0,
  // P30 (left) reaches BUFGMUX_X1Y10; no other pad has a dedicated path
  const gclk = { P73: ['BUFGMUX_X2Y1'], P70: ['BUFGMUX_X1Y0'], P30: ['BUFGMUX_X1Y10'] };
  const asked = [];
  const bufgSites = (site, pin) => { asked.push(`${site}.${pin}`); return pin === 'I' ? gclk[site] || [] : []; };
  const p = pack(load('counter'));
  const clk = p.insts.findIndex(i => i.name === 'clk'), buf = p.insts.findIndex(i => i.kind === 'bufg');
  for (const seed of [1, 2, 3]) {
    const r = place(p, dev, { seed, effort: 0.3, bufgSites });
    checkLegal(p, r);
    // BUFGMUX_X1Y10 comes before the bottom buffers in BUFG_ORDER (ISE's B8 -> BUFGMUX_X2Y11 first)
    assert.equal(r.sites[clk].site, 'P30', `seed ${seed}`);
    assert.equal(r.sites[buf].site, 'BUFGMUX_X1Y10', `seed ${seed}`);
  }
  // only the pads' pin I is asked (no DCM in the design)
  assert.ok(asked.length > 0 && asked.every(a => /^P\d+\.I$/.test(a)), asked.join());
  // that pin taken by another port's LOC: the next GCLK pin
  const taken = place(pack(load('counter'), { ucf: 'NET "en" LOC = "P30";' }), dev, { seed: 1, effort: 0.2, bufgSites });
  assert.equal(taken.sites[clk].site, 'P73');
  assert.equal(taken.sites[buf].site, 'BUFGMUX_X2Y1');
  // a clock with a LOC stays on it (a pin with no dedicated path: the buffer by the pad's edge, as before)
  const fixed = place(pack(load('counter'), { ucf: 'NET "clk" LOC = "P3";' }), dev, { seed: 1, effort: 0.2, bufgSites });
  assert.equal(fixed.sites[clk].site, 'P3');
  assert.equal(fixed.sites[buf].site, 'BUFGMUX_X2Y11');
  // no GCLK pin known: any free pad, as before
  const none = place(p, dev, { seed: 1, effort: 0.2, bufgSites: () => [] });
  checkLegal(p, none);
  assert.deepEqual(none.sites, place(p, dev, { seed: 1, effort: 0.2 }).sites);
});

test('placement errors: unknown LOC, input-only pad for an output, too many slices', () => {
  assert.throws(() => place(pack(load('sw'), { ucf: 'NET "sw" LOC = "Z99";' }), dev), e => e instanceof PlaceError && /Z99/.test(e.message));
  const inOnly = [...dev.pads.values()].find(p => p.inputOnly).name;
  assert.throws(() => place(pack(load('sw'), { ucf: `NET "led" LOC = "${inOnly}";` }), dev), /input-only/);
  const big = pack(load('mux64'));
  const small = deviceSites(parseXdlrc(fs.readFileSync(path.join(FIX, 'place-device.xdlrc'), 'utf8')));
  for (const k of [...small.slices.keys()].slice(0, 100)) small.slices.delete(k);
  assert.throws(() => place(big, small), /slices needed|no room/);
});

test('placed XDL: written, read back by core/xdl.js with the same instances, sites, settings and nets', () => {
  const p = pack(load('counter'), { ucf: 'NET "clk" LOC = "P3";' });
  const r = place(p, dev, { seed: 2, effort: 0.2 });
  const d = placedXdl(p, r);
  const text = writeXdl(d);
  assert.match(text, /^design "counter" xc3s250ecp132-4 v3\.2 ,$/m);
  const back = parseXdl(text);
  assert.equal(back.name, 'counter');
  assert.equal(back.part, 'xc3s250ecp132-4');
  assert.deepEqual(back.insts.map(i => [i.name, i.type, i.placed, i.tile, i.site]), d.insts.map(i => [i.name, i.type, true, i.tile, i.site]));
  assert.deepEqual(back.insts.map(i => i.cfg), d.insts.map(i => i.cfg.map(c => ({ attr: c.attr, name: c.name, value: c.value }))));
  assert.deepEqual(back.nets.map(n => [n.name, n.type, n.outpins, n.inpins]), d.nets.map(n => [n.name, n.type, n.outpins, n.inpins]));
  // the ports' bus information in the design's cfg (raw XDL text: the parser reads it unescaped)
  assert.match(text, /_DESIGN_PROP::PIN_INFO:q<0>:\/counter\/PACKED\/counter\/q<0>\/q<0>\/PAD:OUTPUT:7:q<7\\:0>/);
  assert.equal(back.cfg, d.cfg.replace(/\\:/g, ':'));
  // and written again: the same text
  assert.equal(writeXdl({ ...back, cfg: d.cfg }), text);
});

test('the random generator is deterministic and uniform enough', () => {
  const a = rng(5), b = rng(5);
  const xs = Array.from({ length: 1000 }, () => a());
  assert.deepEqual(xs.slice(0, 5), Array.from({ length: 5 }, () => b()));
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  assert.ok(Math.abs(mean - 0.5) < 0.05);
  assert.ok(xs.every(x => x >= 0 && x < 1));
});

// #55: the annealing's bookkeeping (flat arrays, nets' bounding boxes kept up to date, the timing
// graph compiled once) is made faster without changing what it computes: the placements of these
// fixtures are those of the straightforward version it replaced (fingerprints of sites, cost, delay)
test('the placer\'s results are pinned: the same placements as before its speed-up (#55)', async () => {
  const crypto = await import('node:crypto');
  const table = { at: (dc, dr) => 0.2 + 0.3 * Math.abs(dc) + 0.4 * Math.abs(dr) };
  const pinned = [
    ['counter', 'timing', '378845fe4f6266db'], ['counter', 'table', '453f1001a64db383'], ['counter', 'wirelength', '378845fe4f6266db'],
    ['srmux', 'timing', '589ba1b25aae701d'], ['srmux', 'table', '6715a464492ffd22'], ['srmux', 'wirelength', '1e4c8bf9e4448ee0'],
    ['mux64', 'timing', '44dc651659491f3c'], ['widemux', 'timing', 'b68a6883bd9ee4f0'], ['sw', 'timing', 'da05e2411ddab670'],
  ];
  const opts = { timing: {}, table: { delays: table }, wirelength: { timing: 0 } };
  // (the packing by nets only: the placer's results, whatever the packer's timing, #528)
  for (const [n, what, h] of pinned) {
    const r = place(pack(load(n), { timing: false }), dev, { seed: 2, effort: 0.5, ...opts[what] });
    assert.equal(crypto.createHash('sha1').update(JSON.stringify([r.sites, r.cost, r.delay])).digest('hex').slice(0, 16), h, `${n} (${what})`);
  }
});

// the timing analysis as it was written first (pins by name, maps; #55 numbers them once): the
// same critical path and criticalities on any placement
function analyzeTimingReference(tg, pos, delays = null) {
  const { conns, model } = tg;
  const arcs = tg.arcs.map((a, i) => a[pos[i] && pos[i][0] % 1 === 0 ? 1 : 0]);
  const into = new Map(), outOf = new Map(), key = (i, p) => `${i}:${p}`;
  for (const c of conns) {
    c.delay = c.dedicated ? 0 : connDelay(pos[c.src], pos[c.dst], model, delays);
    const a = key(c.dst, c.dstPin), b = key(c.src, c.srcPin);
    if (!into.has(a)) into.set(a, []);
    into.get(a).push(c);
    if (!outOf.has(b)) outOf.set(b, []);
    outOf.get(b).push(c);
  }
  const arr = new Map(), busy = new Set();
  const arrIn = (i, p) => { let t = -Infinity; for (const c of into.get(key(i, p)) || []) t = Math.max(t, arrOut(c.src, c.srcPin) + c.delay); return t; };
  const arrOut = (i, p) => {
    const k = key(i, p);
    if (arr.has(k)) return arr.get(k);
    if (arcs[i].start[p] !== undefined) { arr.set(k, arcs[i].start[p]); return arcs[i].start[p]; }
    if (busy.has(k)) return -Infinity;
    busy.add(k);
    let t = -Infinity;
    for (const [q, d] of arcs[i].deps[p] || []) t = Math.max(t, arrIn(i, q) + d);
    busy.delete(k);
    arr.set(k, t);
    return t;
  };
  let dmax = 0;
  for (const c of conns) { c.arr = arrOut(c.src, c.srcPin) + c.delay; const s = arcs[c.dst].setup[c.dstPin]; if (s !== undefined && c.arr + s > dmax) dmax = c.arr + s; }
  const req = new Map();
  const reqIn = (i, p) => {
    let r = arcs[i].setup[p] !== undefined ? dmax - arcs[i].setup[p] : Infinity;
    for (const [o, ds] of Object.entries(arcs[i].deps)) for (const [q, d] of ds) if (q === p && outOf.has(key(i, o))) r = Math.min(r, reqOut(i, o) - d);
    return r;
  };
  const reqOut = (i, p) => {
    const k = key(i, p);
    if (req.has(k)) return req.get(k);
    req.set(k, Infinity);
    let r = Infinity;
    for (const c of outOf.get(k) || []) r = Math.min(r, reqIn(c.dst, c.dstPin) - c.delay);
    req.set(k, r);
    return r;
  };
  return { dmax, crit: conns.map(c => { const slack = reqIn(c.dst, c.dstPin) - c.arr; return dmax > 0 && Number.isFinite(slack) ? Math.max(0, Math.min(1, 1 - slack / dmax)) : 0; }) };
}

test('placement timing: the compiled analysis gives the reference\'s critical path and criticalities on random placements (#55)', () => {
  const random = rng(7);
  for (const n of ['counter', 'srmux', 'latches', 'ffs']) {
    const p = pack(load(n));
    const tg = timingGraph(p);
    for (let k = 0; k < 5; k++) {
      // random positions, half of them on a whole x (the SLICEM arcs)
      const pos = p.insts.map(() => [Math.floor(random() * 12) + (random() < 0.5 ? 0 : 0.5), random() * 12]);
      const ref = analyzeTimingReference(timingGraph(p), pos);
      const t = analyzeTiming(tg, pos);
      if (n === 'counter' || n === 'srmux') assert.ok(ref.dmax > 0, n);
      assert.equal(t.dmax, ref.dmax, n);
      assert.deepEqual(t.conns.map(c => c.crit), ref.crit, n);
    }
  }
});
