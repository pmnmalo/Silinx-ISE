// A VHDL constant of an unconstrained array type takes the bounds of its value (#2548): a positional aggregate's
// from the index subtype's left bound (`natural range <>`: 0 to n - 1, `positive range <>`: 1 to n), a named one's
// from its choices, a bit-string literal's 0 to n - 1, a string's 1 to n (IEEE 1076-2008 9.3.3.3); its 'range bounds
// a loop and its attributes are those bounds. Simulated, no diagnostic; the generated Verilog simulated the same,
// and the design synthesized by the open toolchain with no warning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';
import { toVerilog } from '../core/synth-verilog.js';
import { synthesizeOpen } from '../core/synth-front.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';

// a test bench's report messages, its diagnostics asserted empty (no error, no warning)
const reports = (files, top = 'tb') => {
  const d = elaborate(compile(files), top);
  assert.deepEqual(d.diags, []);
  const sim = new Simulator(d);
  sim.start();
  sim.run(100000);
  return sim.log.map(e => e.text);
};
const tb = (decls, body) => [{ path: 'tb.vhd', lang: 'vhdl', text: `entity tb is end;
architecture t of tb is
  type t is array (natural range <>) of bit_vector(1 downto 0);
  ${decls}
begin
  process
    variable acc : integer := 0;
  begin
    ${body}
    wait;
  end process;
end;` }];
const img = (...xs) => xs.map(x => `integer'image(${x})`).join(' & " " & ');

test('#2548 the issue\'s example: a loop over the \'range of a constant of an unconstrained array type', () => {
  // C = ("01", "10"): C(0) = "01", C(1) = "10"; the loop runs over both elements
  assert.deepEqual(reports(tb('constant C : t := ("01", "10");', `
    for i in C'range loop acc := acc + 1; if C(i) = "10" then acc := acc + 10 * i; end if; end loop;
    report "acc=" & integer'image(acc);
    for i in C'reverse_range loop acc := acc * 10 + i; end loop;
    report "rev=" & integer'image(acc);`)), ['acc=12', 'rev=1210']);
});

test('#2548 the attributes of constants of unconstrained array types: positional, named, positive index', () => {
  const decls = `constant C : t := ("01", "10", "11");
  constant N : t := (5 => "11", 3 => "00", 4 => "01");
  type tp is array (positive range <>) of integer;
  constant P : tp := (5, 6, 7);`;
  assert.deepEqual(reports(tb(decls, `
    report ${img("C'length", "C'left", "C'right", "C'low", "C'high")} & " " & boolean'image(C'ascending);
    report ${img("N'length", "N'left", "N'right", "N'low", "N'high")};
    for i in N'range loop if N(i) = "01" then acc := i; end if; end loop;
    report "n=" & integer'image(acc);
    report ${img("P'length", "P'left", "P'right", 'P(1)', 'P(3)')};`)),
  ['3 0 2 0 2 true', '3 3 5 3 5', 'n=4', '3 1 3 5 7']);
});

test('#2548 a string constant: its \'range (1 to its length), its \'reverse_range and its bounds', () => {
  assert.deepEqual(reports(tb('constant S : string := "abc";', `
    for i in S'range loop acc := acc * 10 + i; if S(i) = 'b' then acc := acc + 100; end if; end loop;
    report "s=" & integer'image(acc);
    acc := 0;
    for i in S'reverse_range loop acc := acc * 10 + i; end loop;
    report "r=" & integer'image(acc);
    report ${img("S'length", "S'left", "S'right", "S'low", "S'high")};`)), ['s=1123', 'r=321', '3 1 3 1 3']);
});

test('#2548 a bit_vector constant of a bit-string literal: 0 to its length - 1, its first bit at index 0', () => {
  assert.deepEqual(reports(tb('constant B : bit_vector := "1100";', `
    for i in B'range loop if B(i) = '1' then acc := acc * 10 + i + 1; end if; end loop;
    report "b=" & integer'image(acc) & " " & ${img("B'length", "B'left", "B'right")} & " " & bit'image(B(0)) & " " & bit'image(B(3));`)),
  ['b=12 4 0 3 \'1\' \'0\'']);
});

test('#2548 an aggregate of an unconstrained array type with a gap in its choices is an error', () => {
  const d = elaborate(compile(tb('constant N : t := (0 => "11", 2 => "00");', 'null;')), 'tb');
  assert.deepEqual(d.diags.map(x => [x.severity, x.message]), [['error', 'aggregate has no element for index 1']]);
});

// a look-up table of a constant of an unconstrained array type, read in a loop over its 'range
const LUT = `entity lut is port (sel : in integer range 0 to 2; y : out bit_vector(1 downto 0)); end;
architecture r of lut is
  type t is array (natural range <>) of bit_vector(1 downto 0);
  constant C : t := ("01", "10", "11");
begin
  process (sel) begin
    y <= "00";
    for i in C'range loop if sel = i then y <= C(i); end if; end loop;
  end process;
end;`;
const LUT_TB = lang => lang === 'vhdl' ? `entity tb is end;
architecture t of tb is signal sel : integer range 0 to 2 := 0; signal y : bit_vector(1 downto 0); begin
  u : entity work.lut port map (sel => sel, y => y);
  process begin
    for k in 0 to 2 loop sel <= k; wait for 1 ns; report bit'image(y(1)) & bit'image(y(0)); end loop;
    wait;
  end process;
end;` : `module tb; reg [31:0] sel = 0; wire [1:0] y; integer k;
  lut u (.sel(sel), .y(y));
  initial for (k = 0; k < 3; k = k + 1) begin sel = k; #1 $display("'%b''%b'", y[1], y[0]); end
endmodule`;

test('#2548 a look-up table over a constant\'s \'range: simulated, its generated Verilog simulated the same', () => {
  const vhdl = reports([{ path: 'lut.vhd', lang: 'vhdl', text: LUT }, { path: 'tb.vhd', lang: 'vhdl', text: LUT_TB('vhdl') }]);
  assert.deepEqual(vhdl, ["'0''1'", "'1''0'", "'1''1'"]);
  const v = toVerilog(elaborate(compile([{ path: 'lut.vhd', lang: 'vhdl', text: LUT }]), 'lut'));
  assert.deepEqual(v.warnings ?? [], []);
  const verilog = reports([{ path: 'lut.v', lang: 'verilog', text: v.text }, { path: 'tb.v', lang: 'verilog', text: LUT_TB('verilog') }]);
  assert.deepEqual(verilog, vhdl);
});

test('#2548 a look-up table over a constant\'s \'range: synthesized by the open toolchain, no warning', { timeout: 300000 }, async () => {
  const d = elaborate(compile([{ path: 'lut.vhd', lang: 'vhdl', text: LUT }]), 'lut');
  assert.deepEqual(d.diags, []);
  const r = await synthesizeOpen(d, { family: 'spartan3e', run: yosysNode, effort: 'normal' });
  assert.deepEqual(r.warnings, []);
  assert.ok(r.util.luts >= 1, JSON.stringify(r.util));
});
