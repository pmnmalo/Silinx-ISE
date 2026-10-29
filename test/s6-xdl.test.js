// The placed Spartan-6 design as XDL (#729, packages/silinx-fpga/src/fpga/s6/xdl.js): the LUT equations against an independent
// evaluation (packages/silinx-fpga/src/xdl.js evalLut) of every LUT of the examples, the sites' configurations (the elements and
// values of ISE's primitive definitions), the XDL read back (parseXdl) as it was written, every pin a pin of its
// site in the device description.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lutEquation, placedXdlS6 } from '../packages/silinx-fpga/src/fpga/s6/xdl.js';
import { placeS6 } from '../packages/silinx-fpga/src/fpga/s6/place.js';
import { parseXdl, writeXdl, evalLut } from '../packages/silinx-fpga/src/xdl.js';
import { paramBits } from '../packages/silinx-fpga/src/fpga/netlist.js';
import { EXAMPLES } from './examples-lib.mjs';
import { S6_BOARDS, s6Device, s6Example, s6Phys, s6Verilog } from './s6-lib.mjs';

test('lutEquation: the sum of the ones or the complement of the zeros, constant inputs folded, any pin order', () => {
  // AND2 of I0, I1 on A1, A2
  assert.equal(lutEquation([0, 0, 0, 1], ['A1', 'A2']), '(A1*A2)');
  // XOR3 on A3, A1, A5 (I0 on A3)
  const xor3 = [0, 1, 1, 0, 1, 0, 0, 1];
  const eq = lutEquation(xor3, ['A3', 'A1', 'A5']);
  for (let v = 0; v < 8; v++) assert.equal(evalLut(eq, { A3: v & 1, A1: (v >> 1) & 1, A5: (v >> 2) & 1 }), xor3[v]);
  // an OR4 whose ones outnumber its zeros: the complement
  assert.equal(lutEquation([0, ...Array(15).fill(1)], ['A1', 'A2', 'A3', 'A4']), '~((~A1*~A2*~A3*~A4))');
  // constants: I1 tied to 1 in an AND2 -> I0; tied to 0 -> 0
  assert.equal(lutEquation([0, 0, 0, 1], ['A1', 1]), '(A1)');
  assert.equal(lutEquation([0, 0, 0, 1], ['A1', 0]), '0');
  assert.equal(lutEquation([1, 1], ['A1']), '1');
});

const SLICE_ATTR = /^([A-D](6LUT|5LUT|FF|FFMUX|FFSRINIT|5FF|5FFSRINIT|OUTMUX|USED|CY0)|CLKINV|CEUSED|SRUSED|SYNC_ATTR|CARRY4|PRECYINIT|COUTUSED|F7AMUX|F7BMUX|F8MUX|_GND_SOURCE|_VCC_SOURCE)$/;
// the values of the slices' elements in ISE's primitive definitions (night 1's device reports)
const VALUES = {
  FF: /^(#OFF|#FF|#LATCH|#AND2L)$/, FFMUX: /^(#OFF|O6|O5|[A-D]X|F7|F8|CY|XOR)$/, FFSRINIT: /^(#OFF|SRINIT[01])$/, '5FFSRINIT': /^(#OFF|SRINIT[01])$/,
  OUTMUX: /^(#OFF|[A-D]5Q|O5|O6|XOR|CY|F7|F8)$/, USED: /^(#OFF|0)$/, CY0: /^(O5|[A-D]X)$/, '5FF': /^$/,
};

test('every example as placed XDL on both parts: every LUT\'s equation its INIT, the configurations ISE\'s, the XDL read back, the pins the sites\'', { timeout: 600000 }, async () => {
  for (const { board, part } of S6_BOARDS) {
    const { device, sites } = s6Device(part);
    for (const name of EXAMPLES) {
      const d = await s6Example(name, board);
      const r = placeS6(d.phys, sites, { nl: d.nl, seed: 1 });
      const x = placedXdlS6(d.nl, d.packed, d.phys, r, { part, device, name });
      const text = writeXdl(x);
      const back = parseXdl(text);
      // (and the TIEOFFs of the power nets, a net each, as ISE writes them)
      const own = back.insts.filter(i => !i.name.startsWith('XDL_DUMMY_'));
      assert.equal(own.length, d.phys.insts.length, `${board} ${name}`);
      assert.deepEqual(back.insts.map(i => [i.name, i.site]), x.insts.map(i => [i.name, i.site]));
      assert.ok(back.insts.filter(i => i.name.startsWith('XDL_DUMMY_')).every(i => i.type === 'TIEOFF' && i.name === `XDL_DUMMY_${i.tile}_${i.site}`));
      for (const n of back.nets.filter(m => m.type === 'vcc' || m.type === 'gnd')) {
        assert.match(n.name, n.type === 'vcc' ? /^GLOBAL_LOGIC1_\d+$/ : /^GLOBAL_LOGIC0_\d+$/);
        // (from a TIEOFF; a pin no TIEOFF's constant reaches, an output pad's 0, from a slice's free LUT, as ISE)
        const src = back.insts.find(i => i.name === n.outpins[0].inst);
        if (src.type === 'TIEOFF') assert.equal(n.outpins[0].pin, n.type === 'vcc' ? 'HARD1' : 'HARD0');
        else {
          assert.match(src.type, /^SLICE[XLM]$/, `${name} ${n.name}`);
          assert.ok(src.cfg.some(c => c.attr === (n.type === 'vcc' ? '_VCC_SOURCE' : '_GND_SOURCE') && c.value === n.outpins[0].pin), `${name} ${n.name}`);
          assert.ok(n.inpins.every(p => back.insts.find(i => i.name === p.inst).type === 'IOB'), `${name} ${n.name}`);
        }
      }
      assert.deepEqual(back.nets.map(n => [n.name, n.outpins.length, n.inpins.length]), x.nets.map(n => [n.name, n.outpins.length, n.inpins.length]));
      // every pin a pin of its site (the device description), outputs out and inputs in
      for (const n of back.nets) {
        for (const [p, dir] of [...n.outpins.map(p => [p, 'o']), ...n.inpins.map(p => [p, 'i'])]) {
          const inst = back.insts.find(i => i.name === p.inst);
          assert.equal(device.sitePin(inst.site, p.pin)?.dir, dir, `${board} ${name}: ${p.inst} (${inst.site}) ${p.pin}`);
        }
      }
      // the LUTs: each equation, on the pins of its inputs, is its INIT (constants folded)
      const byInst = new Map(back.insts.map(i => [i.name, i]));
      for (const [i, inst] of d.phys.insts.entries()) {
        if (inst.kind !== 'slice') continue;
        const cfg = byInst.get(inst.name).cfg, s = d.packed.slices[inst.slice];
        for (const c of cfg) {
          assert.match(c.attr, SLICE_ATTR, `${name} ${inst.name}: ${c.attr}`);
          const v = VALUES[c.attr.replace(/^[A-D]/, '')];
          if (v) assert.match(c.value, v, `${name} ${inst.name}: ${c.attr}`);
        }
        for (const p of ['A', 'B', 'C', 'D']) {
          for (const k of ['o6', 'o5']) {
            const cell = s.pos[p][k];
            if (typeof cell !== 'number' || !/^LUT\d$/.test(d.nl.cells[cell].type)) continue;
            const c = d.nl.cells[cell];
            const eq = cfg.find(e => e.attr === `${p}${k === 'o6' ? 6 : 5}LUT`).value.replace(/^#LUT:/, '');
            const init = paramBits(c.params.INIT);
            // (the equation's A1 … A6: the position's pins, B1 … for B)
            const pins = d.phys.lutPins[i][p][k].map(q => q && `A${q.slice(1)}`);
            const nets = Object.entries(c.pins).filter(([q]) => /^I\d$/.test(q)).sort().map(([, n]) => n);
            for (let v = 0; v < 1 << nets.length; v++) {
              const env = {};
              let ok = true;
              nets.forEach((n, b) => { const bit = (v >> b) & 1; if (n <= 1) { if (bit !== n) ok = false; } else if (env[pins[b]] !== undefined && env[pins[b]] !== bit) ok = false; else env[pins[b]] = bit; });
              if (ok) assert.equal(evalLut(eq, env), init[v] || 0, `${name} ${c.name}: ${eq} at ${v}`);
            }
          }
        }
      }
    }
  }
});

test('a slice\'s configuration: a carry stage (CY0 O5 for a constant DI, PRECYINIT), the flip-flops\' sources and initial values, the clock\'s edge', async () => {
  const nl = await s6Verilog(`module m(input clk, input r, input [3:0] d, output reg [3:0] q, output reg [3:0] n);
  initial n = 4'b1111;
  always @(posedge clk) if (r) q <= 0; else q <= q + 4'd1;
  always @(negedge clk) n <= d;
endmodule`);
  const d = s6Phys(nl);
  const { sites } = s6Device('xc6slx16csg324-3');
  const r = placeS6(d.phys, sites, { nl, seed: 1 });
  const x = placedXdlS6(nl, d.packed, d.phys, r, { part: 'xc6slx16csg324-3' });
  const cfgOf = i => Object.fromEntries(x.insts[i].cfg.map(c => [c.attr, c.value]));
  const carry = d.phys.insts.findIndex(i => i.type === 'SLICEL');
  const c = cfgOf(carry);
  assert.equal(c.PRECYINIT, '0');
  assert.equal(c.SYNC_ATTR, 'SYNC');
  assert.equal(c.CLKINV, 'CLK');
  assert.equal(c.SRUSED, '0');
  // (a flip-flop on the carry's sum: XOR; bit 0, q's inversion, by its LUT: O6)
  const s = d.packed.slices[d.phys.insts[carry].slice];
  ['A', 'B', 'C', 'D'].forEach((p, k) => {
    const dnet = nl.cells[s.pos[p].ff].pins.D;
    assert.equal(c[`${p}FFMUX`], nl.cells[s.carry].pins[`O<${k}>`] === dnet ? 'XOR' : 'O6', p);
  });
  assert.ok(['A', 'B', 'C', 'D'].filter(p => c[`${p}FFMUX`] === 'XOR').length >= 3);
  // the other register: on the falling edge, its D by the bypass inputs, initialised to 1 (no set / reset)
  const neg = d.phys.insts.findIndex((inst, i) => inst.kind === 'slice' && cfgOf(i).CLKINV === 'CLK_B');
  assert.ok(neg >= 0);
  const g = cfgOf(neg);
  assert.deepEqual(['A', 'B', 'C', 'D'].map(p => [g[`${p}FFMUX`], g[`${p}FFSRINIT`]]), ['A', 'B', 'C', 'D'].map(p => [`${p}X`, 'SRINIT1']));
  assert.equal(g.SRUSED, '#OFF');
});
