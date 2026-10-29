// The Spartan-6 placer (#729): packages/silinx-fpga/src/fpga/s6/phys.js (the physical design of a packed netlist), sites.js (the
// device's sites), place.js (the annealing), place-check.js (the rules), on small designs and on every example on
// the Nexys3's XC6SLX16 and the Atlys's XC6SLX45: legal, deterministic for a seed, the warnings expected, the
// wirelength per connection near ISE's own placement of the same netlists (research/s6/measured/place-compare.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { placeS6, PlaceError, chainSites } from '../packages/silinx-fpga/src/fpga/s6/place.js';
import { checkPlacementS6 } from '../packages/silinx-fpga/src/fpga/s6/place-check.js';
import { PhysError } from '../packages/silinx-fpga/src/fpga/s6/phys.js';
import { S6_ESTIMATE, timingGraphS6, analyzeS6 } from '../packages/silinx-fpga/src/fpga/s6/place-timing.js';
import { EXAMPLES } from './examples-lib.mjs';
import { S6_BOARDS, s6Device, s6Example, s6Phys, s6Verilog } from './s6-lib.mjs';

const LX16 = 'xc6slx16csg324-3', LX45 = 'xc6slx45csg324-3';
// placed and checked: the placement and its errors
function placed(d, part = LX16, opts = {}) {
  const { sites } = s6Device(part);
  const r = placeS6(d.phys, sites, { nl: d.nl, ...opts });
  return { r, errors: checkPlacementS6(d.phys, sites, r), sites };
}
const ucfOf = lines => lines.map(([net, loc, std]) => `NET "${net}" LOC = "${loc}"${std ? ` | IOSTANDARD = ${std}` : ''} ;`).join('\n');

test('the sites of both parts: slices by kind, the carry chain\'s next stage from the graph, the pads and their clock buffers', () => {
  for (const [part, slices, pads, brams, dsps] of [[LX16, 2278, 232, 32, 32], [LX45, 6822, 218, 116, 58]]) {
    const { sites } = s6Device(part);
    const kinds = { X: 0, L: 0, M: 0 };
    for (const s of sites.slices.values()) kinds[s.kind]++;
    assert.equal(sites.slices.size, slices, part);
    assert.deepEqual([sites.pads.size, sites.bufgs.length, sites.brams.length, sites.dsps.length], [pads, 16, brams, dsps], part);
    // (every SLICEL / SLICEM chains to a slice above it in its column, but the top ones; SLICEX have no carry)
    for (const s of sites.slices.values()) {
      if (s.kind === 'X') { assert.equal(s.above, null, s.name); continue; }
      if (s.above) { const u = sites.slices.get(s.above); assert.equal(u.x, s.x, s.name); assert.ok(u.y > s.y && u.y <= s.y + 3, `${s.name} -> ${s.above}`); }
    }
    // the 32 clock-capable pads (GCLK) of the CSG324, each with its BUFGMUX; the boards' clock pins
    assert.equal([...sites.pads.values()].filter(p => p.bufg.length).length, 32, part);
    assert.deepEqual(sites.pads.get('V10').bufg, ['BUFGMUX_X3Y13'], 'the Nexys3\'s clock: ISE\'s buffer (night 1)');
    assert.deepEqual(sites.pads.get('L15').bufg, ['BUFGMUX_X2Y4'], 'the Atlys\'s clock');
    assert.deepEqual(new Set([...sites.pads.values()].map(p => p.bank)), new Set([0, 1, 2, 3]));
  }
  const s = s6Device(LX16).sites;
  assert.deepEqual([s.slices.get('SLICE_X16Y31').above, s.slices.get('SLICE_X16Y61').above], ['SLICE_X16Y33', null], 'a gap in the column; its top');
  assert.deepEqual(chainSites('SLICE_X16Y60', 3, n => s.slices.get(n).above), null);
  assert.deepEqual(chainSites('SLICE_X16Y58', 3, n => s.slices.get(n).above), ['SLICE_X16Y58', 'SLICE_X16Y59', 'SLICE_X16Y60']);
});

test('a 16-bit accumulator: its physical pins (the LUTs on A1 …, DI by AX …, CIN / COUT) and its carry chain up one column', async () => {
  const nl = await s6Verilog('module m(input clk, input [15:0] d, output reg [15:0] q); always @(posedge clk) q <= q + d; endmodule');
  const d = s6Phys(nl);
  const { phys } = d;
  assert.deepEqual(phys.chains.length, 1);
  assert.deepEqual(phys.chains[0].map(i => phys.insts[i].type), ['SLICEL', 'SLICEL', 'SLICEL', 'SLICEL']);
  // the carry between stages: COUT -> CIN, a net of its own
  const cin = phys.nets.filter(n => n.driver?.pin === 'COUT');
  assert.deepEqual(cin.map(n => [n.driver.inst, n.loads]), [0, 1, 2].map(k => [phys.chains[0][k], [{ inst: phys.chains[0][k + 1], pin: 'CIN' }]]));
  // each stage: 4 LUT2 (d xor q) on A1 A2 …, the addend by the bypass inputs, the clock
  for (const i of phys.chains[0]) {
    const pins = new Set(phys.nets.flatMap(n => n.loads.filter(l => l.inst === i).map(l => l.pin)));
    for (const p of ['A', 'B', 'C', 'D']) { assert.ok(pins.has(`${p}1`) && pins.has(`${p}2`) && pins.has(`${p}X`), `${i} ${p}`); assert.ok(!pins.has(`${p}3`)); }
    assert.ok(pins.has('CLK'));
    assert.ok(!pins.has('CE') && !pins.has('SR'), 'no enable, no reset');
  }
  // the clock: from the BUFGMUX, a clock net
  assert.deepEqual(phys.nets.filter(n => n.clock).map(n => [phys.insts[n.driver.inst].type, n.driver.pin, n.loads.length]), [['BUFGMUX', 'O', 4]]);
  const { r, errors, sites } = placed(d);
  assert.deepEqual(errors, []);
  assert.deepEqual(r.warnings, []);
  const ss = phys.chains[0].map(i => sites.slices.get(r.site[i]));
  for (let k = 1; k < 4; k++) assert.equal(ss[k - 1].above, ss[k].name);
  assert.ok(ss.every(s => s.kind === 'L' || s.kind === 'M'));
});

test('I/Os on their LOC pads, the clock on its pad\'s buffer; a clock input with no LOC on a clock-capable pad', async () => {
  const nl = await s6Verilog('module m(input clk, input a, input b, output reg y); always @(posedge clk) y <= a ^ b; endmodule');
  // (no LOC for clk: the placer takes a GCLK pad)
  let d = s6Phys(nl, ucfOf([['a', 'T10'], ['b', 'T9'], ['y', 'U16']]));
  let { r, errors, sites } = placed(d);
  assert.deepEqual(errors, []);
  assert.deepEqual(r.warnings, []);
  const at = name => r.site[d.phys.insts.findIndex(i => i.name === name)];
  assert.deepEqual(['a', 'b', 'y'].map(at), ['T10', 'T9', 'U16']);
  const clkPad = sites.pads.get(at('clk'));
  assert.ok(clkPad.bufg.length, 'a GCLK pin');
  assert.equal(r.site[d.phys.insts.findIndex(i => i.kind === 'bufg')], clkPad.bufg[0]);
  // the Nexys3's clock pin
  d = s6Phys(nl, ucfOf([['clk', 'V10'], ['a', 'T10'], ['b', 'T9'], ['y', 'U16']]));
  ({ r, errors } = placed(d));
  assert.deepEqual(errors, []);
  assert.equal(r.site[d.phys.insts.findIndex(i => i.kind === 'bufg')], 'BUFGMUX_X3Y13');
  // a clock on a pin no dedicated path leaves: general routing to a buffer, a warning
  // (U16, an LED's: no GCLK)
  d = s6Phys(nl, ucfOf([['clk', 'U16'], ['a', 'V10'], ['b', 'T9'], ['y', 'V16']]));
  ({ r, errors } = placed(d));
  assert.deepEqual(errors, []);
  assert.deepEqual(r.warnings, ['clk: the clock enters on pad U16, not a clock-capable pin (GCLK): its global buffer BUFGMUX_X2Y3 is reached through general routing']);
});

test('the placer\'s errors: a LOC that is no pad, two ports on one pad, banks of two VCCO; the cells it cannot place', async () => {
  const nl = await s6Verilog('module m(input a, input b, output y, output z); assign y = a & b; assign z = a | b; endmodule');
  const err = (ucf, re) => assert.throws(() => placed(s6Phys(nl, ucf)), e => e instanceof PlaceError && re.test(e.message), String(re));
  err(ucfOf([['a', 'Z99']]), /^place: a: LOC Z99 is not a bonded pad of xc6slx16csg324-3$/);
  err(ucfOf([['a', 'T10'], ['b', 'T10']]), /^place: two ports on pad T10 \(a, b\)$/);
  // (T10 and U16: bank 2, the bottom)
  err(ucfOf([['a', 'T10', 'LVCMOS33'], ['y', 'U16', 'LVCMOS18']]), /^place: y: pad U16 is in bank 2, whose other I\/Os need VCCO 3.3 V, not 1.8 V \(I\/O standards\)$/);
  // (I/O standards of one VCCO in a bank: legal; the free I/Os keep to the banks of their VCCO)
  const d = s6Phys(nl, ucfOf([['a', 'T10', 'LVCMOS33'], ['b', 'T9', 'LVTTL']]));
  const { errors, r } = placed(d);
  assert.deepEqual(errors, []);
  assert.deepEqual(r.warnings, []);
  // a cell of a site the placer has none for yet (a BUFIO2, as the packer counts it)
  const odd = { ...nl, cells: [...nl.cells, { name: 'u_io', type: 'BUFIO2', params: {}, attrs: {}, pins: {}, dirs: {} }] };
  assert.throws(() => s6Phys(odd), e => e instanceof PhysError && e.message === 'the Spartan-6 design cannot be placed: u_io (BUFIO2): the Spartan-6 placer has no site for it yet (#729)');
});

test('a shift register takes a SLICEM, its pins the SLICEM\'s (the data on DI, the clock enable on WE)', async () => {
  const nl = await s6Verilog('module m(input clk, input e, input d, output q); reg [19:0] s; always @(posedge clk) if (e) s <= {s[18:0], d}; assign q = s[19]; endmodule');
  const d = s6Phys(nl);
  const m = d.phys.insts.filter(i => i.type === 'SLICEM');
  assert.equal(m.length, 1);
  const pins = new Set(d.phys.nets.flatMap(n => n.loads.filter(l => d.phys.insts[l.inst].type === 'SLICEM').map(l => l.pin)));
  assert.ok(pins.has('CLK') && pins.has('WE'), [...pins].join(' '));
  assert.ok([...pins].some(p => /^[A-D]I$/.test(p)), 'the data input');
  const { r, errors, sites } = placed(d);
  assert.deepEqual(errors, []);
  assert.equal(sites.slices.get(r.site[d.phys.insts.findIndex(i => i.type === 'SLICEM')]).kind, 'M');
});

test('checkPlacementS6: the errors of placements that break the rules', async () => {
  const nl = await s6Verilog('module m(input clk, input [15:0] d, output reg [15:0] q); always @(posedge clk) q <= q + d; endmodule');
  const d = s6Phys(nl, ucfOf([['clk', 'V10']]));
  const { r, sites } = placed(d);
  const ch = d.phys.chains[0], name = i => d.phys.insts[i].name;
  const bad = { ...r, site: r.site.slice() };
  // a stage off its column, a SLICEL instance on a SLICEX, two on a site, an I/O off its LOC, the clock's buffer
  const x = [...sites.slices.values()].find(s => s.kind === 'X' && !r.site.includes(s.name));
  bad.site[ch[2]] = x.name;
  bad.site[ch[3]] = bad.site[ch[1]];
  const clk = d.phys.insts.findIndex(i => i.name === 'clk'), buf = d.phys.insts.findIndex(i => i.kind === 'bufg');
  // (a free pad of no GCLK)
  const pad = [...sites.pads.values()].find(p => !p.bufg.length && !r.site.includes(p.name)).name;
  bad.site[clk] = pad;
  bad.site[buf] = 'BUFGMUX_X2Y1';
  assert.deepEqual(checkPlacementS6(d.phys, sites, bad), [
    `${name(ch[2])} (SLICEL) on ${x.name}, a SLICEX`,
    `${name(ch[3])}: on ${r.site[ch[1]]}, which ${name(ch[1])} takes`,
    `clk: on ${pad}, its LOC is V10`,
    `the carry chain of ${name(ch[0])}: stage 2 on ${x.name}, not above ${r.site[ch[1]]} (${sites.slices.get(r.site[ch[1]]).above})`,
    `the carry chain of ${name(ch[0])}: stage 3 on ${r.site[ch[1]]}, not above ${x.name} (the column ends)`,
    `${name(buf)}: on BUFGMUX_X2Y1, which the clock pad ${pad}'s dedicated path does not reach (none)`,
  ]);
});

test('the timing estimate: a path of LUTs between flip-flops, its delay from the model and the distances, the criticalities', async () => {
  const nl = await s6Verilog(`module m(input clk, input [5:0] a, output reg y);
  reg [5:0] r; always @(posedge clk) begin r <= a; y <= ^r; end endmodule`);
  const d = s6Phys(nl);
  const tg = timingGraphS6(nl, d.phys);
  // every instance at one place: the critical path is clock to out, a LUT, setup, and the connections' base delays
  const pos = d.phys.insts.map(() => [5, 5]);
  const t = analyzeS6(tg, d.phys, pos);
  const M = S6_ESTIMATE;
  const luts = nl.cells.filter(c => /^LUT/.test(c.type)).length;
  assert.ok(luts >= 1);
  // (the registers r and the LUT tree of the xor are in slices of their own or shared: a connection between
  // sites costs the base, inside a slice nothing)
  assert.ok(t.dmax >= M.clkToQ + M.lut + M.setup - 1e-9 && t.dmax <= M.clkToQ + luts * M.lut + (luts + 1) * M.base + M.setup + 1e-9, String(t.dmax));
  // far apart: longer, by perTile per tile
  const far = analyzeS6(tg, d.phys, d.phys.insts.map((_, i) => [i * 3, 0]));
  assert.ok(far.dmax > t.dmax);
  assert.ok(Math.max(...far.crit) === 1, 'the critical connections: criticality 1');
});

test('every example placed legally on the XC6SLX16 and the XC6SLX45: the rules, no warnings, the same placement for a seed', { timeout: 600000 }, async () => {
  for (const { board, part } of S6_BOARDS) {
    for (const name of EXAMPLES) {
      const d = await s6Example(name, board);
      const { r, errors } = placed(d, part, { seed: 1 });
      assert.deepEqual(errors, [], `${board} ${name}`);
      assert.deepEqual(r.warnings, [], `${board} ${name}`);
      assert.ok(r.wirelength < r.stats.initialWirelength, `${board} ${name}: the annealing shortens the wires`);
      // the I/Os on the UCF's pins, the clock on its pin's buffer
      d.phys.insts.forEach((inst, i) => { if (inst.loc) assert.equal(r.site[i], inst.loc, `${board} ${name} ${inst.name}`); });
      if (name !== 'gates') assert.equal(r.site[d.phys.insts.findIndex(i => i.kind === 'bufg')], board === 'nexys3' ? 'BUFGMUX_X3Y13' : 'BUFGMUX_X2Y4', `${board} ${name}`);
      const again = placed(d, part, { seed: 1 }).r;
      assert.deepEqual(again.site, r.site, `${board} ${name}: deterministic`);
      if (name === 'pong') assert.notDeepEqual(placed(d, part, { seed: 2 }).r.site, r.site, 'another seed, another placement');
    }
  }
});

// ISE's placement of the same netlists (night 1, research/s6/compare-place.mjs): the wirelength per connection of
// the placer's cost, the Silinx placer's no more than 25 % above ISE's (night 1: 0.63 … 1.15 of it)
test('the wirelength per connection against ISE\'s placement of the same netlists (night 1)', { timeout: 600000 }, async () => {
  const cmp = JSON.parse(fs.readFileSync(new URL('../research/s6/measured/place-compare.json', import.meta.url), 'utf8'));
  for (const { board, part } of S6_BOARDS) {
    for (const name of EXAMPLES) {
      const ise = cmp.boards[board][name].ise;
      const d = await s6Example(name, board);
      const { r } = placed(d, part, { seed: 1 });
      const conns = d.phys.nets.filter(n => !n.clock && !n.power && n.driver).map(n => new Set([n.driver.inst, ...n.loads.map(l => l.inst)]).size).filter(k => k > 1).reduce((a, k) => a + k - 1, 0);
      assert.equal(conns, cmp.boards[board][name].silinx.connections, `${board} ${name}`);
      const per = r.wirelength / conns;
      assert.ok(per <= 1.25 * ise.perConnection, `${board} ${name}: ${per.toFixed(2)} tiles a connection, ISE ${ise.perConnection}`);
    }
  }
});

// ISE's check of the placements (2026-10-24, research/s6/ise-place-check.sh, measured/ise-check.json): ISE reads every
// example's placed XDL on both boards, par -k routes it completely keeping the placement, and its DRC finds no error;
// the warnings: xdl2ncd's of the nets not routed yet (PhysDesignRules:10), the DRC's only stopwatch's 9K block RAM
// note (PhysDesignRules:2410, ISE's own implementation of stopwatch has it too)
test('ISE accepts every example\'s placement on both boards: xdl -xdl2ncd, par -k complete, the DRC\'s warnings', () => {
  const rec = JSON.parse(fs.readFileSync(new URL('../research/s6/measured/ise-check.json', import.meta.url), 'utf8'));
  const names = S6_BOARDS.flatMap(({ board }) => EXAMPLES.map(n => `${n}-${board}`)).sort();
  assert.deepEqual(Object.keys(rec.designs), names);
  for (const [d, { placed }] of Object.entries(rec.designs)) {
    assert.equal(placed.xdl2ncd, 'ok', d);
    assert.deepEqual(Object.keys(placed.messages).filter(m => m !== 'WARNING:PhysDesignRules:10' && m !== 'WARNING:PhysDesignRules'), d.startsWith('stopwatch-') ? ['WARNING:PhysDesignRules:2410'] : [], d);
    assert.equal(placed.par, 'complete', d);
    assert.deepEqual(placed.drc, d.startsWith('stopwatch-')
      ? { errors: 0, warnings: 1, messages: { 'WARNING:PhysDesignRules:2410': 1 } }
      : { errors: 0, warnings: 0, messages: {} }, d);
  }
});
