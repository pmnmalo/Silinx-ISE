// Carry-select adders (#1361, packages/silinx-fpga/src/synth-open.js CSEL_RULE / CSEL_MAP): a netlist with a carry chain of CSEL_RULE.chain stages
// or more is synthesized once more with its $alu cells that wide as segments of CSEL_RULE.segment bits, each but the first
// computed for a carry in of 0 and of 1 and chosen by the carry out of the segment below; kept when faster by the estimate
// with no more slices in proportion. Wide adders, a subtractor and a comparator (the $alu's BI and carries), in Verilog and
// VHDL, each netlist simulated against the design (test/diff-synth.js); a narrower one left on its chain.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { synthesizeOpen } from '../core/synth-front.js';
import { longestCarryChain, criticalDelay, cellCounts, CSEL_RULE, CSEL_FILE, CSEL_MAP } from '../packages/silinx-fpga/src/synth-open.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { compareNetlist } from './diff-synth.js';

test('#1361 longestCarryChain: the MUXCY cells one after the other, the longest of the netlist', () => {
  const mux = (ci, o) => ({ type: 'MUXCY', port_directions: { CI: 'input', DI: 'input', S: 'input', O: 'output' }, connections: { CI: [ci], DI: ['0'], S: ['1'], O: [o] } });
  const cells = { a: mux('0', 10), b: mux(10, 11), c: mux(11, 12), d: mux('1', 20), e: mux(20, 21), lut: { type: 'LUT2', port_directions: { I0: 'input', I1: 'input', O: 'output' }, connections: { I0: [12], I1: [21], O: [30] } } };
  const json = { modules: { m: { attributes: { top: '1' }, cells, ports: {}, netnames: {} } } };
  assert.equal(longestCarryChain(json, 'm'), 3);
  assert.equal(longestCarryChain(JSON.stringify(json), 'm'), 3);
  assert.equal(longestCarryChain({ modules: { m: { cells: {}, ports: {}, netnames: {} } } }, 'm'), 0);
  // (a loop through the carry ins: no hang, a finite length)
  const loop = { modules: { m: { cells: { a: mux(11, 10), b: mux(10, 11) }, ports: {}, netnames: {} } } };
  assert.ok(Number.isFinite(longestCarryChain(loop, 'm')));
  assert.deepEqual(CSEL_RULE, { chain: 64, segment: 32 });
  assert.equal(CSEL_FILE, 'silinx_csel_map.v');
  assert.match(CSEL_MAP, /techmap_celltype = "\$alu"/);
});

const ADD_V = n => `module add(input clk, input [${n - 1}:0] a, b, output reg [${n - 1}:0] s, output reg co);
  reg [${n - 1}:0] ra, rb; wire [${n}:0] t = ra + rb;
  always @(posedge clk) begin ra <= a; rb <= b; s <= t[${n - 1}:0]; co <= t[${n}]; end
endmodule`;
const SUB_VHDL = n => `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity sub is port (clk : in std_logic; a, b : in std_logic_vector(${n - 1} downto 0); d : out std_logic_vector(${n - 1} downto 0); lt : out std_logic); end;
architecture rtl of sub is
  signal ra, rb : unsigned(${n - 1} downto 0);
begin
  process (clk) begin
    if rising_edge(clk) then
      ra <= unsigned(a); rb <= unsigned(b);
      d <= std_logic_vector(ra - rb);
      if ra < rb then lt <= '1'; else lt <= '0'; end if;
    end if;
  end process;
end;`;

const synth = async (path, lang, text, top, effort) => {
  const design = elaborate(compile([{ path, lang, text }]), top);
  const r = await synthesizeOpen(design, { run: yosysNode, effort });
  return { design, r, json: r.files[`${r.top}.json`] };
};

test('#1361 a 128-bit adder (Verilog) and a 96-bit subtractor and comparator (VHDL): carry-select segments of 32 bits, kept at both efforts; the netlists simulate as the designs; no warning', { timeout: 900000 }, async () => {
  for (const [path, lang, text, top] of [['add.v', 'verilog', ADD_V(128), 'add'], ['sub.vhd', 'vhdl', SUB_VHDL(96), 'sub']]) {
    for (const effort of ['normal', 'high']) {
      const what = `${top} ${effort}`;
      const { design, r, json } = await synth(path, lang, text, top, effort);
      assert.ok(r.depth.csel, what);
      assert.ok(r.depth.csel.chain >= CSEL_RULE.chain, `${what}: the chain found, ${r.depth.csel.chain}`);
      assert.equal(r.depth.csel.kept, true, `${what}: ${JSON.stringify(r.depth.csel)}`);
      // its adder's chains at most a segment (the comparison's own chain, 2 bits a stage, as it was), its estimate the candidate's
      assert.ok(longestCarryChain(json, r.top) <= Math.max(CSEL_RULE.segment + 1, Math.ceil(r.depth.csel.chain / 2) + 1), `${what}: ${longestCarryChain(json, r.top)} of ${r.depth.csel.chain}`);
      assert.ok(Math.abs(criticalDelay(json, r.top) - r.depth.csel.ns) < 1e-6, what);
      assert.ok(cellCounts(json, r.top).MUXCY > 0, `${what}: still on carry chains`);
      assert.deepEqual(r.warnings, [], what);
      const cmp = compareNetlist(design, r, { name: `csel-${top}-${effort}`, seed: top, sim: { cycles: 400 } });
      assert.equal(cmp.status, 'pass', cmp.report || cmp.reason);
    }
  }
});

test('#1361 a 48-bit adder (its chain under CSEL_RULE.chain) left on one chain, no candidate; csel: false leaves a wide one alone', { timeout: 600000 }, async () => {
  const narrow = await synth('add.v', 'verilog', ADD_V(48), 'add', 'normal');
  assert.equal(narrow.r.depth.csel, undefined);
  assert.ok(longestCarryChain(narrow.json, 'add') >= 48);
  const design = elaborate(compile([{ path: 'add.v', lang: 'verilog', text: ADD_V(128) }]), 'add');
  const off = await synthesizeOpen(design, { run: yosysNode, effort: 'normal', csel: false });
  assert.equal(off.depth.csel, undefined);
  assert.ok(longestCarryChain(off.files['add.json'], 'add') >= 128);
});
