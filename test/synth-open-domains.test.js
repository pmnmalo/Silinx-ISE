// The clock domains of the open synthesis's estimate (packages/silinx-fpga/src/synth-open-path.js domainDelays, #652): each
// clock's critical path, its ends by their clock (a block RAM's port's own); and the critical LUTs of a clock that is not the
// slowest made shallower too (synth-open-resynth.js), on a design of two clocks whose faster clock's counter enable was 3 levels
// of LUTs under the other clock's deeper logic (vtr-stereovision3's case), in VHDL and in Verilog, at both efforts, its netlist
// simulated against the design (test/diff-synth.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { synthesizeOpen } from '../core/synth-front.js';
import { criticalDelay, domainDelays, pathEnds } from '../packages/silinx-fpga/src/synth-open-path.js';
import * as so from '../packages/silinx-fpga/src/synth-open.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { compareNetlist } from './diff-synth.js';

const cell = (type, ins, outs) => ({
  type, connections: { ...ins, ...outs },
  port_directions: Object.fromEntries([...Object.keys(ins).map(p => [p, 'input']), ...Object.keys(outs).map(p => [p, 'output'])]),
});
const netlistOf = cells => ({ modules: { t: { attributes: { top: 1 }, cells: Object.fromEntries(Object.entries(cells).map(([n, c]) => [n, { ...c, connections: Object.fromEntries(Object.entries(c.connections).map(([p, b]) => [p, [b]])) }])) } } });
const close = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);

test('#652 domainDelays: each clock\'s critical path and its ends, the slowest first; a block RAM\'s ports by their own clocks; one domain for one clock', () => {
  // clock 2: FF -> 2 LUTs -> D; clock 3: FF -> LUT -> D, and a block RAM's port B written from it (port A on clock 2)
  const cells = {
    a1: cell('FDRE', { C: 2, D: 20, CE: '1', R: '0' }, { Q: 10 }), l1: cell('LUT1', { I0: 10 }, { O: 11 }), l2: cell('LUT1', { I0: 11 }, { O: 12 }),
    a2: cell('FDRE', { C: 2, D: 12, CE: '1', R: '0' }, { Q: 13 }),
    b1: cell('FDRE', { C: 3, D: 20, CE: '1', R: '0' }, { Q: 30 }), l3: cell('LUT1', { I0: 30 }, { O: 31 }),
    b2: cell('FDRE', { C: 3, D: 31, CE: '1', R: '0' }, { Q: 32 }),
    ram: cell('RAMB16_S9_S9', { CLKA: 2, CLKB: 3, DIA: 13, DIB: 31 }, { DOA: 40, DOB: 41 }),
  };
  const nl = netlistOf(cells);
  const d = domainDelays(nl, 't');
  assert.deepEqual(d.map(x => x.clock), ['2', '3']);
  close(d[0].ns, 0.59 + 0.45 + 0.70 + 0.45 + 0.70 + 0.13, 'clock 2');
  close(d[1].ns, 0.59 + 0.45 + 0.70 + 0.45 + 0.4, 'clock 3: the block RAM\'s port B');
  assert.deepEqual(d.map(x => x.ends.map(e => `${e.cell}.${e.port}`).sort()), [['a2.D', 'ram.DIA'], ['b2.D', 'ram.DIB']]);
  assert.equal(d[0].ns, criticalDelay(nl, 't'), 'the slowest clock\'s is the estimate');
  assert.equal(pathEnds(nl, 't').ends.length, 4);
  assert.equal(so.domainDelays, domainDelays, 'synth-open.js exports it, as the other path functions');
  // one clock: one domain, the estimate's
  delete cells.b1; delete cells.l3; delete cells.b2; delete cells.ram;
  assert.deepEqual(domainDelays(netlistOf(cells), 't').map(x => [x.clock, x.ns]), [['2', criticalDelay(netlistOf(cells), 't')]]);
  // latches: one group, 'latch', whatever their gates (logic, often: picorv32's 68 gates)
  const lat = { ...cells, g1: cell('LUT1', { I0: 10 }, { O: 50 }), g2: cell('LUT1', { I0: 13 }, { O: 51 }),
    x1: cell('LDCE', { G: 50, GE: '1', CLR: '0', D: 11 }, { Q: 52 }), x2: cell('LDCE', { G: 51, GE: '1', CLR: '0', D: 11 }, { Q: 53 }) };
  // (their gates' 0.91 ns setup: the slowest group here)
  assert.deepEqual(domainDelays(netlistOf(lat), 't').map(x => [x.clock, x.ends.map(e => `${e.cell}.${e.port}`).sort()]), [['latch', ['x1.D', 'x1.G', 'x2.D', 'x2.G']], ['2', ['a2.D']]]);
  // a design without flip-flops: its outputs, one domain 'io'
  const comb = { i: cell('IBUF', { I: 1 }, { O: 2 }), l: cell('LUT1', { I0: 2 }, { O: 3 }), o: cell('OBUF', { I: 3 }, { O: 4 }) };
  assert.deepEqual(domainDelays(netlistOf(comb), 't').map(x => x.clock), ['io']);
});

// clock a: a counter's enable, (href low) and (horiz /= 0), 11 signals (vtr-stereovision3's vert counter); clock b: a parity
// of 256 flip-flops, 4 levels of LUTs, the slowest clock's path
const TWO_VHDL = `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
entity twoclk is
  port (clk_a, clk_b, href, cref, vs : in std_logic; din : in std_logic_vector(7 downto 0);
        vert : out std_logic_vector(7 downto 0); dout : out std_logic);
end twoclk;
architecture rtl of twoclk is
  signal horiz : unsigned(9 downto 0) := (others => '0');
  signal v : unsigned(7 downto 0) := (others => '0');
  signal sh : std_logic_vector(255 downto 0) := (others => '0');
  signal p : std_logic := '0';
begin
  process (clk_a) begin
    if rising_edge(clk_a) then
      if href = '0' then horiz <= (others => '0'); elsif cref = '0' then horiz <= horiz + 1; end if;
      if vs = '1' then v <= (others => '0'); elsif href = '0' and horiz /= 0 then v <= v + 1; end if;
    end if;
  end process;
  vert <= std_logic_vector(v);
  process (clk_b) begin
    if rising_edge(clk_b) then
      sh <= sh(247 downto 0) & din;
      p <= xor sh;
    end if;
  end process;
  dout <= p;
end rtl;
`;
const TWO_VERILOG = `module twoclk (input clk_a, input clk_b, input href, input cref, input vs, input [7:0] din, output [7:0] vert, output dout);
  reg [9:0] horiz = 0;
  reg [7:0] v = 0;
  reg [255:0] sh = 0;
  reg p = 0;
  always @(posedge clk_a) begin
    if (!href) horiz <= 0; else if (!cref) horiz <= horiz + 1;
    if (vs) v <= 0; else if (!href && horiz != 0) v <= v + 1;
  end
  always @(posedge clk_b) begin
    sh <= {sh[247:0], din};
    p <= ^sh;
  end
  assign vert = v;
  assign dout = p;
endmodule
`;

test('#652 the open synthesis of two clocks: the faster clock\'s enable on 2 levels of LUTs (was 3, under the slower clock\'s parity), the slower clock\'s path as it was, no more LUTs, in VHDL and in Verilog, at both efforts; the netlist simulates as the design, no warning', { timeout: 300000 }, async () => {
  for (const [lang, text] of [['vhdl', TWO_VHDL], ['verilog', TWO_VERILOG]]) {
    const des = elaborate(compile([{ path: lang === 'vhdl' ? 'd.vhd' : 'd.v', lang, text }]), 'twoclk');
    for (const effort of ['normal', 'high']) {
      const what = `${lang} ${effort}`;
      const r = await synthesizeOpen(des, { run: yosysNode, effort });
      const json = r.files['twoclk.json'];
      const [b, a] = domainDelays(json, 'twoclk');
      // clock b: the parity's 4 levels into D; clock a: 0.59 + 2 LUTs and their connections + the CE's 0.55 (it was 3
      // LUTs: 5.04 ns)
      close(b.ns, 0.59 + 4 * (0.45 + 0.70) + 0.13, `${what}: clock b`);
      close(a.ns, 0.59 + 2 * (0.45 + 0.70) + 0.45 + 0.55, `${what}: clock a`);
      assert.equal(a.ends.some(e => e.port === 'CE' && e.ns === a.ns), true, `${what}: clock a's path ends on the enable`);
      assert.deepEqual({ ...r.depth.domains, ns: r.depth.domains.ns.map(x => +x.toFixed(2)) },
        { clocks: 2, ns: [5.32, 3.89], rounds: 1, changed: 1, luts: 89, slices: 138, kept: true }, what);
      assert.deepEqual([r.util.luts, r.util.flipFlops], [89, 275], what);
      assert.deepEqual(r.warnings, [], what);
      const cmp = compareNetlist(des, r, { name: `domains-${lang}-${effort}`, seed: 'twoclk', sim: { cycles: 400 } });
      assert.equal(cmp.status, 'pass', cmp.report || cmp.reason);
    }
  }
  // resynth: false, the netlist as before: clock a 3 levels into its enable (5.04 ns), no domains' candidate
  const des = elaborate(compile([{ path: 'd.v', lang: 'verilog', text: TWO_VERILOG }]), 'twoclk');
  const before = await synthesizeOpen(des, { run: yosysNode, effort: 'high', resynth: false });
  close(domainDelays(before.files['twoclk.json'], 'twoclk')[1].ns, 0.59 + 3 * (0.45 + 0.70) + 0.45 + 0.55, 'before');
  assert.equal(before.depth.domains, undefined);
});
