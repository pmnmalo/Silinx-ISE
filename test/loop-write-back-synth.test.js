// A write-back in a loop (#3512): x <= c ? v : x (VHDL's when / else, and if / else written back) is written
// if (c) x <= v in the synthesis input only when no earlier write of the process run can have written its bits
// (#523); an earlier turn of the loop is one. The first turn's writes alone were taken: after an earlier turn's
// x <= 1, x <= c ? 2 : x became if (c) x <= 2 and kept the 1 (a wrong netlist). Each case, in VHDL and Verilog:
// how the synthesis input writes it, synthesized with no warnings and its netlist simulated against the design.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { synthesisInput } from '../core/synth-front.js';
import { diffSynth } from './diff-synth.js';

const VHD_HEAD = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
`;
// a clocked process (VHDL) / always block (Verilog) of the body given, and its ports
const vhdl = (ports, decl, body) => `${VHD_HEAD}entity m is port (clk : in std_logic; ${ports}); end;
architecture rtl of m is
${decl}begin
  process (clk) begin
    if rising_edge(clk) then
${body}
    end if;
  end process;
end;
`;
const verilog = (ports, body) => `module m(input clk, ${ports});
  integer i, j;
  always @(posedge clk) begin
${body}
  end
endmodule
`;

// [name, extension, source, the synthesis input's writes: readBack's (if (c) x <= v) or as written, kind]
const CASES = [
  // the issue's: the whole signal written in the first turn, written back in the second
  ['whole signal', 'v', verilog('input c, output reg [1:0] x', `    for (i = 0; i < 2; i = i + 1)
      if (i == 0) x <= 2'd1; else x <= c ? 2'd2 : x;`), /^ {6}end else begin\n {8}x <= \(c \? 2'h2 : 2'\(x\)\);$/m],
  ['whole signal', 'vhd', vhdl('c : in std_logic; x : buffer unsigned(1 downto 0)', '', `      for i in 0 to 1 loop
        if i = 0 then x <= "01"; elsif c = '1' then x <= "10"; else x <= x; end if;
      end loop;`), /^ {8}end else begin\n {10}x <= x;$/m],
  // a constant index: the same bit in every turn, as written; before the loop, another bit than an earlier write's: if (c)
  ['constant index', 'v', verilog('input [1:0] c, input a, d, v, output reg [1:0] x, y', `    y[0] <= a;
    y[1] <= d ? v : y[1];
    for (i = 0; i < 2; i = i + 1) x[0] <= c[i] ? v : x[0];
    x[1] <= a;`), [/^ {4}if \(d\) begin\n {6}y\[1\] <= v;$/m, /^ {6}x\[0\] <= \(1'\(c >> \$signed\(i\)\) \? 1'\(v\) : 1'\(x\[0\]\)\);$/m]],
  ['constant index', 'vhd', vhdl('c : in std_logic_vector(1 downto 0); a, d, v : in std_logic; x, y : buffer std_logic_vector(1 downto 0)', '', `      y(0) <= a;
      y(1) <= v when d = '1' else y(1);
      for i in 0 to 1 loop
        x(0) <= v when c(i) = '1' else x(0);
      end loop;
      x(1) <= a;`), [/^ {4}if \(\(d == 1'h1\)\) begin\n {6}y\[1\] <= v;$/m, /^ {8}x\[0\] <= \(\(1'.* \? 1'\(v\) : 1'\(x\[0\]\)\);$/m]],
  // the element at the loop's variable (#523's, a different one in each turn): if (c); at another variable, or the
  // outer loop's in an inner loop (the same element in each turn of the inner loop): as written
  ['variable index', 'v', verilog('input [3:0] c, input [1:0] k, input v, output reg [3:0] x, y, z', `    for (i = 0; i < 4; i = i + 1) begin
      x[i] <= c[i] ? v : x[i];
      y[k] <= c[i] ? v : y[k];
      for (j = 0; j < 2; j = j + 1) z[i] <= c[i ^ j] ? v : z[i];
    end`), [/^ {6}if \(1'\(c >> \$signed\(i\)\)\) begin\n {8}x\[\$signed\(i\)\] <= v;$/m, /^ {6}y\[k\] <= \(1'\(c >> \$signed\(i\)\) \? 1'\(v\) : 1'\(1'\(y >> k\)\)\);$/m, /^ {8}z\[\$signed\(i\)\] <= \(/m]],
  ['variable index', 'vhd', vhdl('c : in std_logic_vector(3 downto 0); k : in unsigned(1 downto 0); v : in std_logic; x, y, z : buffer std_logic_vector(3 downto 0)', '', `      for i in 0 to 3 loop
        x(i) <= v when c(i) = '1' else x(i);
        y(to_integer(k)) <= v when c(i) = '1' else y(to_integer(k));
        for j in 0 to 1 loop
          if j = 0 or i > 0 then z(i) <= v when c(i - j) = '1' else z(i); end if;
        end loop;
      end loop;`), [/^ {8}if \(\(1'\(1'\(c >> \$signed\(p0_v0\)\)\) == 1'h1\)\) begin\n {10}x\[\$signed\(p0_v0\)\] <= v;$/m, /^ {8}y\[k\] <= \(/m, /^ {14}z\[\$signed\(p0_v0\)\] <= \(/m]],
  // two signals: the element at the loop's variable (if (c)) beside a whole signal written back in every turn (as written)
  ['two signals', 'v', verilog('input [1:0] c, d, input v, output reg [1:0] x, y', `    for (i = 0; i < 2; i = i + 1) begin
      x[i] <= c[i] ? v : x[i];
      y <= d[i] ? i : y;
    end`), [/^ {6}if \(1'\(c >> \$signed\(i\)\)\) begin\n {8}x\[\$signed\(i\)\] <= v;$/m, /^ {6}y <= 2'\(\(1'\(d >> \$signed\(i\)\) \? 32'\(i\) : 32'\(32'\(y\)\)\)\);$/m]],
  ['two signals', 'vhd', vhdl('c, d : in std_logic_vector(1 downto 0); v : in std_logic; x : buffer std_logic_vector(1 downto 0); y : buffer unsigned(1 downto 0)', '', `      for i in 0 to 1 loop
        x(i) <= v when c(i) = '1' else x(i);
        y <= to_unsigned(i, 2) when d(i) = '1' else y;
      end loop;`), [/^ {8}if \(\(1'\(1'\(c >> \$signed\(p0_v0\)\)\) == 1'h1\)\) begin\n {10}x\[\$signed\(p0_v0\)\] <= v;$/m, /^ {8}y <= \(\(1'.*\? .* : 2'\(y\)\);$/m]],
  // combinational, blocking writes (a Verilog always @*'s =, VHDL's variables): x = c ? b : x reads what the earlier
  // turn wrote, so if (c) x = b holds in every turn (the element at the loop's variable too)
  ['blocking writes', 'v', `module m(input [1:0] c, a, b, output reg [1:0] x, y);
  integer i;
  always @* begin
    for (i = 0; i < 2; i = i + 1)
      if (i == 0) x = a; else x = c[0] ? b : x;
    y = 2'd0;
    for (i = 0; i < 2; i = i + 1) y[i] = c[i] ? a[i] : y[i];
  end
endmodule
`, [/^ {6}end else begin\n {8}if \(c\[0\]\) begin\n {10}x = b;$/m, /^ {6}if \(1'\(c >> \$signed\(i\)\)\) begin\n {8}y\[\$signed\(i\)\] = 1'\(a >> \$signed\(i\)\);$/m], 'combinational'],
  ['blocking writes', 'vhd', `${VHD_HEAD}entity m is port (c, a, b : in std_logic_vector(1 downto 0); x, y : out std_logic_vector(1 downto 0)); end;
architecture rtl of m is
begin
  process (all)
    variable v, w : std_logic_vector(1 downto 0);
  begin
    for i in 0 to 1 loop
      if i = 0 then v := a; elsif c(0) = '1' then v := b; else v := v; end if;
    end loop;
    w := "00";
    for i in 0 to 1 loop
      if c(i) = '1' then w(i) := a(i); else w(i) := w(i); end if;
    end loop;
    x <= v; y <= w;
  end process;
end;
`, [/^ {8}end else if \(\(c\[0\] == 1'h1\)\) begin\n {10}p0_v0 = b;\n {8}end\n {4}end$/m, /^ {10}p0_v1\[\$signed\(p0_v3\)\] = 1'\(a >> \$signed\(p0_v3\)\);\n {8}end\n {4}end$/m], 'combinational'],
];

const synthText = (path, text) => synthesisInput(elaborate(compile([{ path, text }]), 'm')).text;

for (const [name, ext, text, want, kind = 'clocked'] of CASES) {
  test(`#3512 ${name} (${ext === 'v' ? 'Verilog' : 'VHDL'}, ${kind}): the synthesis input's write-back; the netlist simulates like the design, no warnings`, { timeout: 300000 }, async () => {
    const s = synthText(`m.${ext}`, text);
    for (const re of [want].flat()) assert.match(s, re);
    const r = await diffSynth({ name: `wb-${name}-${ext}`, sources: [{ path: `m.${ext}`, text }], top: 'm', sim: { cycles: 300 } });
    assert.equal(r.status, 'pass', r.report || r.reason);
    assert.deepEqual(r.warnings, []);
  });
}

// combinational, nonblocking: the same rule (as written after an earlier turn's write); the design holds x when c is
// 0, a latch (Yosys: "Latch inferred"), whose feedback the simulation of the design does not settle: the text alone
test('#3512 a nonblocking write-back in a combinational loop (Verilog, VHDL): as written after an earlier turn\'s write', () => {
  const v = synthText('m.v', `module m(input c, input [1:0] a, b, output reg [1:0] x);
  integer i;
  always @* for (i = 0; i < 2; i = i + 1) if (i == 0) x <= a; else x <= c ? b : x;
endmodule
`);
  assert.match(v, /^ {6}end else begin\n {8}x <= \(c \? 2'\(b\) : 2'\(x\)\);$/m);
  const h = synthText('m.vhd', `${VHD_HEAD}entity m is port (c : in std_logic; a, b : in std_logic_vector(1 downto 0); x : buffer std_logic_vector(1 downto 0)); end;
architecture rtl of m is
begin
  process (all) begin
    for i in 0 to 1 loop
      if i = 0 then x <= a; else x <= b when c = '1' else x; end if;
    end loop;
  end process;
end;
`);
  assert.match(h, /^ {8}end else begin\n {10}x <= \(\(c == 1'h1\) \? 2'\(b\) : 2'\(x\)\);$/m);
});
