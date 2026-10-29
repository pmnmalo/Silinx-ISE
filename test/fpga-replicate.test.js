// packages/silinx-fpga/src/fpga/replicate.js: register replication (#4). The plan (which flip-flops or LUTs, #522, which
// loads each copy takes) from a placement and its timing; the replicated netlist computes exactly what
// the netlist did (simulated, packed); its placement starts from the first one (#87).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { synthesizeOpen } from '../core/synth-front.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { readYosysJson } from '../packages/silinx-fpga/src/fpga/netlist.js';
import { pack } from '../packages/silinx-fpga/src/fpga/pack.js';
import { replicationPlan, replicateCells, warmStart, REPLICATION, REPLICATE_MAX_SLICES, WARM } from '../packages/silinx-fpga/src/fpga/replicate.js';
import { compareSims } from './fpga-sim.js';

// a flip-flop (s[0]) that selects 16 outputs: 16 loads
const FAN = `module fan(input clk, input [1:0] sel, input [15:0] a, output reg [15:0] q);
  reg [1:0] s;
  integer i;
  always @(posedge clk) begin
    s <= sel;
    for (i = 0; i < 16; i = i + 1) q[i] <= s[0] ? a[i] ^ s[1] : a[15 - i];
  end
endmodule
`;
const fanNetlist = async () => {
  const r = await synthesizeOpen(elaborate(compile([{ path: 'fan.v', lang: 'verilog', text: FAN }]), 'fan'), { run: yosysNode });
  assert.deepEqual(r.warnings, []);
  return readYosysJson(r.files['fan.json']);
};

test('replicateCells: each group of loads gets a copy of the flip-flop (same type, parameters and inputs); the circuit is unchanged', { timeout: 120000 }, async () => {
  const nl = await fanNetlist();
  const before = JSON.stringify(nl);
  const ff = nl.cells.findIndex(c => /^FD/.test(c.type) && nl.nets[c.pins.Q].loads.length >= 16);
  assert.ok(ff >= 0, 'the select flip-flop drives 16 loads');
  const q = nl.cells[ff].pins.Q;
  const loads = nl.nets[q].loads;
  const groups = [loads.slice(0, 6), loads.slice(6, 11), loads.slice(11)];
  const nl2 = replicateCells(nl, [{ cell: ff, groups }]);
  assert.equal(JSON.stringify(nl), before, 'the netlist given is not changed');
  assert.equal(nl2.cells.length, nl.cells.length + 2);
  assert.equal(nl2.nets.length, nl.nets.length + 2);
  const copies = nl2.cells.slice(nl.cells.length);
  assert.deepEqual(copies.map(c => c.name), [`${nl.cells[ff].name}_rep1`, `${nl.cells[ff].name}_rep2`]);
  for (const [k, c] of copies.entries()) {
    assert.equal(c.type, nl.cells[ff].type);
    assert.deepEqual(c.params, nl.cells[ff].params);
    const { Q, ...ins } = c.pins;
    const { Q: q0, ...ins0 } = nl.cells[ff].pins;
    assert.deepEqual(ins, ins0, 'the same D, clock, enable and reset');
    assert.equal(nl2.nets[Q].name, `${nl.nets[q0].name}_rep${k + 1}`);
    assert.deepEqual(nl2.nets[Q].driver, { cell: nl.cells.length + k, pin: 'Q' });
    assert.deepEqual(nl2.nets[Q].loads, groups[k + 1]);
    for (const l of groups[k + 1]) assert.equal(nl2.cells[l.cell].pins[l.pin], Q);
    for (const [p, n] of Object.entries(ins)) assert.ok(nl2.nets[n].loads.some(l => l.cell === nl.cells.length + k && l.pin === p), `${p} read by the copy`);
  }
  assert.deepEqual(nl2.nets[q].loads, groups[0]);
  // the replicated netlist, packed, behaves as the netlist
  const packed = pack(nl2);
  assert.deepEqual(packed.warnings, []);
  assert.equal(packed.stats.ffs, pack(nl).stats.ffs + 2);
  const d = compareSims(nl, packed, { cycles: 300, seed: 7 });
  assert.equal(d, null, d && `first difference at cycle ${d.cycle}`);
});

test('replicationPlan: the flip-flops of many loads on the critical path with a slow connection; their loads grouped by place', () => {
  // a flip-flop (cell 0) and 20 LUTs reading it: 10 near it (X1-5), 10 far (X40-44)
  const N = 20;
  const nl = { cells: [{ name: 'ff', type: 'FDRE', pins: { Q: 2, D: 3, C: 4 } }], nets: [{ loads: [] }, { loads: [] }, { name: 'q', loads: [] }, { loads: [] }, { loads: [] }] };
  for (let i = 0; i < N; i++) { nl.cells.push({ name: `l${i}`, type: 'LUT1', pins: { I0: 2 } }); nl.nets[2].loads.push({ cell: i + 1, pin: 'I0' }); }
  const packed = { insts: nl.cells.map((c, i) => ({ name: `s${i}`, kind: 'slice' })), cellSites: nl.cells.map((c, i) => ({ inst: i, bel: i ? 'F' : 'FFX' })) };
  const placement = { sites: nl.cells.map((c, i) => ({ tile: i === 0 ? 'CLB_X1Y1' : i <= 10 ? `CLB_X${1 + (i % 5)}Y2` : `CLB_X${40 + (i % 5)}Y30` })) };
  const sta = (crit, delay) => ({ conns: [{ from: 's0.XQ', to: 's15.F1', crit, delay }, { from: 's0.XQ', to: 's2.F1', crit: 0.5, delay: 0.4 }] });
  const plan = replicationPlan(nl, packed, placement, sta(1, 1.6));
  assert.equal(plan.length, 1);
  assert.equal(plan[0].cell, 0);
  // 20 loads, 16 per copy: two groups, the near one first (it stays on the flip-flop)
  assert.deepEqual(plan[0].groups.map(g => g.map(l => l.cell).sort((a, b) => a - b)), [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]]);
  // not critical enough, its critical connection fast, too few loads: nothing
  assert.deepEqual(replicationPlan(nl, packed, placement, sta(0.9, 1.6)), []);
  assert.deepEqual(replicationPlan(nl, packed, placement, sta(1, 0.6)), []);
  assert.deepEqual(replicationPlan(nl, packed, placement, sta(1, 1.6), { minFanout: 21 }), []);
  // more copies for more loads (perCopy), at most maxCopies
  assert.equal(replicationPlan(nl, packed, placement, sta(1, 1.6), { perCopy: 5 })[0].groups.length, 4);
  assert.ok(replicationPlan(nl, packed, placement, sta(1, 1.6), { perCopy: 1, maxCopies: 2 })[0].groups.length <= 3);
  assert.deepEqual([REPLICATION.minFanout, REPLICATION.minCrit, REPLICATION.minDelay, REPLICATION.perCopy, REPLICATION.maxCells, REPLICATION.luts], [8, 0.98, 1.0, 16, 8, true]);
  assert.deepEqual(WARM, { on: true, rlim: 3, t: 0 });
  assert.equal(REPLICATE_MAX_SLICES, 3000);
});

// a reset computed by logic (r = a & ~b) on 16 flip-flops: a LUT of 16 loads
const SRST = `module srst(input clk, input a, input b, input [15:0] d, output reg [15:0] q);
  wire r = a & ~b;
  always @(posedge clk) if (r) q <= 16'd0; else q <= d;
endmodule
`;
test('replicateCells: a LUT (a reset computed by logic) copied with its inputs; the circuit is unchanged (#522)', { timeout: 120000 }, async () => {
  const r = await synthesizeOpen(elaborate(compile([{ path: 'srst.v', lang: 'verilog', text: SRST }]), 'srst'), { run: yosysNode });
  assert.deepEqual(r.warnings, []);
  const nl = readYosysJson(r.files['srst.json']);
  const lut = nl.cells.findIndex(c => /^LUT[1-4]$/.test(c.type) && nl.nets[c.pins.O].loads.length >= 16);
  assert.ok(lut >= 0, 'the reset LUT drives the 16 flip-flops');
  const o = nl.cells[lut].pins.O, loads = nl.nets[o].loads;
  assert.ok(loads.every(l => /^FD/.test(nl.cells[l.cell].type) && l.pin === 'R'), 'on their R pins');
  const nl2 = replicateCells(nl, [{ cell: lut, groups: [loads.slice(0, 8), loads.slice(8)] }]);
  const copy = nl2.cells[nl.cells.length];
  assert.equal(copy.name, `${nl.cells[lut].name}_rep1`);
  assert.equal(copy.type, nl.cells[lut].type);
  assert.deepEqual(copy.params, nl.cells[lut].params);
  const { O, ...ins } = copy.pins;
  const { O: o0, ...ins0 } = nl.cells[lut].pins;
  assert.deepEqual(ins, ins0, 'the same inputs');
  assert.deepEqual(nl2.nets[O].driver, { cell: nl.cells.length, pin: 'O' });
  assert.deepEqual(nl2.nets[O].loads, loads.slice(8));
  assert.deepEqual(nl2.nets[o0].loads, loads.slice(0, 8));
  const packed = pack(nl2);
  assert.deepEqual(packed.warnings, []);
  assert.equal(packed.stats.luts, pack(nl).stats.luts + 1);
  const d = compareSims(nl, packed, { cycles: 300, seed: 3 });
  assert.equal(d, null, d && `first difference at cycle ${d.cycle}`);
});

test('replicationPlan: a LUT of many critical loads too (#522; luts: false leaves it out); its loads in its own slice stay on it', () => {
  // a LUT (cell 0, bel G of slice s0) and 20 flip-flops reading it on SR: one in its own slice, 9 near, 10 far
  const N = 20;
  const nl = { cells: [{ name: 'rst', type: 'LUT2', pins: { O: 2, I0: 3, I1: 4 } }], nets: [{ loads: [] }, { loads: [] }, { name: 'r', loads: [] }, { loads: [] }, { loads: [] }] };
  for (let i = 0; i < N; i++) { nl.cells.push({ name: `f${i}`, type: 'FDRE', pins: { R: 2 } }); nl.nets[2].loads.push({ cell: i + 1, pin: 'R' }); }
  const packed = { insts: nl.cells.map((c, i) => ({ name: `s${i}`, kind: 'slice' })), cellSites: nl.cells.map((c, i) => ({ inst: i === 1 ? 0 : i, bel: i === 0 ? 'G' : 'FFY' })) };
  const placement = { sites: nl.cells.map((c, i) => ({ tile: i <= 10 ? `CLB_X${1 + (i % 5)}Y2` : `CLB_X${40 + (i % 5)}Y30` })) };
  const sta = { conns: [{ from: 's0.Y', to: 's15.SR', crit: 1, delay: 1.6 }] };
  assert.deepEqual(replicationPlan(nl, packed, placement, sta, { luts: false }), []);
  const plan = replicationPlan(nl, packed, placement, sta);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].cell, 0);
  // two groups: its own flip-flop (cell 1) and the near ones on it, the far ones on the copy
  assert.deepEqual(plan[0].groups.map(g => g.map(l => l.cell).sort((a, b) => a - b)), [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]]);
  // its output read through the slice's X / Y pin (not XQ / YQ): not a flip-flop's
  assert.deepEqual(replicationPlan(nl, packed, placement, { conns: [{ from: 's0.YQ', to: 's15.SR', crit: 1, delay: 1.6 }] }), []);
});

test('warmStart (#87): each slice of the replicated design from the slice of its cells; a copy at the centre of its loads; pads on their sites', { timeout: 120000 }, async () => {
  const nl = await fanNetlist();
  const packed = pack(nl);
  // a made-up placement: instance k on slice (k, 2k), a pad on a pad of its own
  const placement = { sites: packed.insts.map((inst, k) => ({ site: inst.kind === 'slice' ? `SLICE_X${k}Y${2 * k}` : `PAD${k}` })) };
  const ff = nl.cells.findIndex(c => /^FD/.test(c.type) && nl.nets[c.pins.Q].loads.length >= 16);
  const loads = nl.nets[nl.cells[ff].pins.Q].loads;
  const nl2 = replicateCells(nl, [{ cell: ff, groups: [loads.slice(0, 8), loads.slice(8)] }]);
  const packed2 = pack(nl2);
  const at = warmStart(nl, packed, placement, nl2, packed2);
  assert.equal(at.length, packed2.insts.length);
  const oldOf = i => packed.cellSites[i]?.inst;
  packed2.insts.forEach((inst, j) => {
    const cells = nl2.cells.map((c, i) => i).filter(i => packed2.cellSites[i]?.inst === j);
    const olds = cells.filter(i => i < nl.cells.length).map(oldOf).filter(k => k >= 0);
    if (inst.kind !== 'slice') { if (olds.length) assert.deepEqual(at[j], { site: `PAD${olds[0]}` }, inst.name); return; }
    if (olds.length) {
      // the old slice of most of its cells; exact when all and no copy
      const count = new Map(); for (const k of olds) count.set(k, (count.get(k) || 0) + 1);
      const k = [...count].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
      assert.deepEqual([at[j].x, at[j].y], [k, 2 * k], inst.name);
      assert.equal(at[j].exact, count.size === 1 && cells.every(i => i < nl.cells.length), inst.name);
    } else {
      // the copy's slice: the centre of the slices of its loads
      const ls = cells.flatMap(i => loads.slice(8).filter(() => i >= nl.cells.length)).map(l => oldOf(l.cell));
      assert.ok(ls.length, `${inst.name}: a copy's slice`);
      assert.deepEqual(at[j], { x: ls.reduce((a, k) => a + k, 0) / ls.length, y: ls.reduce((a, k) => a + 2 * k, 0) / ls.length, exact: false }, inst.name);
    }
  });
  assert.ok(at.some(a => a && a.exact === false), 'the copy has a start');
});
