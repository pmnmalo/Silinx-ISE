// An if generate translated (#3501): the translations read an if generate's items and its else as neither parser
// writes them, and Verilog to VHDL lost the body with no error, VHDL to Verilog refused every if generate "with elsif
// branches". Each form, both ways: an if generate alone, with an else (a declaration in each branch), an else if /
// elsif chain (an unnamed branch, an if generate nested in the else), a case generate (a range of choices, a default),
// generates nested in generates (one generate region in Verilog). The translation checked with no warnings, then the
// original and its translation simulated with each value of the generic, against values computed here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { translateSource } from '../core/translate.js';

const VERILOG = `module gen #(parameter N = 0) (input [7:0] a, output [7:0] y1, output [7:0] y2, output [7:0] y3, output [7:0] y4);
  if (N > 1) begin : big
    assign y1 = a + N;
  end
  if (N <= 1) begin
    assign y1 = a;
  end
  if (N % 2 == 1) begin : odd
    wire [7:0] t;
    assign t = a ^ 8'hFF;
    assign y2 = t;
  end else begin : even
    wire [7:0] t;
    assign t = a & 8'h0F;
    assign y2 = t;
  end
  if (N == 0) begin : zero
    assign y3 = 0;
  end else if (N == 1) begin
    assign y3 = a;
  end else if (N < 4) begin : small
    assign y3 = a + 1;
  end else begin : large
    if (N == 5) begin : five
      assign y3 = a - 5;
    end else begin : other
      assign y3 = a - 1;
    end
  end
  case (N)
    0, 1: begin : low
      assign y4 = 8'd10;
    end
    3: begin
      assign y4 = 8'd30;
    end
    default: begin : high
      assign y4 = a;
    end
  endcase
endmodule
`;
const VHDL = `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity gen is
  generic (N : integer := 0);
  port (a : in std_logic_vector(7 downto 0); y1, y2, y3, y4 : out std_logic_vector(7 downto 0));
end gen;

architecture rtl of gen is
begin
  big: if N > 1 generate
    y1 <= std_logic_vector(unsigned(a) + N);
  end generate;
  small: if N <= 1 generate
    y1 <= a;
  end generate;
  parity: if N mod 2 = 1 generate
    signal t : std_logic_vector(7 downto 0);
  begin
    t <= a xor x"FF";
    y2 <= t;
  end;
  else generate
    signal t : std_logic_vector(7 downto 0);
  begin
    t <= a and x"0F";
    y2 <= t;
  end;
  end generate;
  chain: if N = 0 generate
    y3 <= (others => '0');
  elsif N = 1 generate
    y3 <= a;
  elsif N < 4 generate
    y3 <= std_logic_vector(unsigned(a) + 1);
  else generate
    five: if N = 5 generate
      y3 <= std_logic_vector(unsigned(a) - 5);
    end generate;
    other: if N /= 5 generate
      y3 <= std_logic_vector(unsigned(a) - 1);
    end generate;
  end generate;
  sel: case N generate
    when 0 | 1 => y4 <= x"0A";
    when 3 => y4 <= x"1E";
    when 4 to 5 => y4 <= a;
    when others => y4 <= a;
  end generate;
end rtl;
`;

// the outputs at each value of the generic and of a, computed here
const NS = [0, 1, 2, 3, 4, 5];
const AS = [0, 7, 200];
const ref = (n, a) => [n > 1 ? (a + n) % 256 : a, n % 2 ? a ^ 255 : a & 15,
  n === 0 ? 0 : n === 1 ? a : n < 4 ? (a + 1) % 256 : n === 5 ? (a - 5) & 255 : (a - 1) & 255, n <= 1 ? 10 : n === 3 ? 30 : a];
const expected = AS.flatMap(a => NS.map(n => `${n}: ${ref(n, a).join(' ')}`));

const tbVhdl = `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity tb is end tb;

architecture sim of tb is
  type outs is array (0 to 3) of std_logic_vector(7 downto 0);
  type all_outs is array (0 to ${NS.length - 1}) of outs;
  signal a : std_logic_vector(7 downto 0);
  signal y : all_outs;
  function img(v : std_logic_vector) return string is begin return integer'image(to_integer(unsigned(v))); end function;
begin
${NS.map((n, i) => `  u${n}: entity work.gen generic map (N => ${n}) port map (a => a, y1 => y(${i})(0), y2 => y(${i})(1), y3 => y(${i})(2), y4 => y(${i})(3));`).join('\n')}
  process begin
${AS.map(x => `    a <= std_logic_vector(to_unsigned(${x}, 8));
    wait for 10 ns;`).join('\n')}
    wait;
  end process;
  process begin
${AS.map(() => `    wait for 5 ns;
    for i in 0 to ${NS.length - 1} loop
      report integer'image(i) & ": " & img(y(i)(0)) & " " & img(y(i)(1)) & " " & img(y(i)(2)) & " " & img(y(i)(3));
    end loop;
    wait for 5 ns;`).join('\n')}
    wait;
  end process;
end sim;
`;
const tbVerilog = `module tb;
  reg [7:0] a;
${NS.map(n => `  wire [7:0] y1_${n}, y2_${n}, y3_${n}, y4_${n};
  gen #(.N(${n})) u${n} (.a(a), .y1(y1_${n}), .y2(y2_${n}), .y3(y3_${n}), .y4(y4_${n}));`).join('\n')}
  initial begin
${AS.map(x => `    a = ${x};
    #5;
${NS.map(n => `    $display("${n}: %0d %0d %0d %0d", y1_${n}, y2_${n}, y3_${n}, y4_${n});`).join('\n')}
    #5;`).join('\n')}
  end
endmodule
`;
const fileOf = lang => (lang === 'vhdl' ? 'gen.vhd' : 'gen.v');
const tbOf = lang => (lang === 'vhdl' ? { path: 'tb.vhd', text: tbVhdl } : { path: 'tb.v', text: tbVerilog });

// Check Syntax of the design: its errors and warnings, the design checks' included
function checkSyntax(path, text) {
  const lib = compile([{ path, text }]);
  const d = elaborate(lib, 'gen');
  return [...lib.errors, ...d.diags, ...designChecks(lib, d, { lint: true })].map(e => `${e.severity}: ${e.message}`);
}
// the test bench's written lines (any warning or error fails)
function run(lang, text) {
  const r = simulate([{ path: fileOf(lang), text }, tbOf(lang)], 'tb');
  assert.deepEqual(r.errors.map(e => e.message), []);
  const log = r.sim.log.map(l => `${l.kind}: ${l.text}`);
  assert.ok(log.every(l => /^(note|print): /.test(l)), log.join('\n'));
  return log.map(l => l.replace(/^\w+: /, ''));
}
// the lines of a translation from its first generate to its end
const generates = (text, from) => text.slice(text.indexOf(from));

for (const [from, text] of [['verilog', VERILOG], ['vhdl', VHDL]]) {
  const to = from === 'vhdl' ? 'verilog' : 'vhdl';
  test(`#3501 ${from}'s if generates (alone, with an else, an else if chain, a case generate) translated to ${to}, checked with no warnings, simulated as the original`, () => {
    assert.deepEqual(checkSyntax(fileOf(from), text), []);
    assert.deepEqual(run(from, text), expected);
    const tr = translateSource(text, { path: fileOf(from), to });
    assert.deepEqual(tr.errors, []);
    assert.deepEqual(checkSyntax(fileOf(to), tr.text), []);
    assert.deepEqual(run(to, tr.text), expected);
  });
}

test('#3501 Verilog to VHDL: each branch an if generate of its own (VHDL-93), on its condition and the earlier ones negated; the branches\' labels, numbered when they have none', () => {
  const tr = translateSource(VERILOG, { path: 'gen.v', to: 'vhdl' });
  assert.equal(generates(tr.text, '    big:'), `    big: if N > 1 generate
        y1 <= std_logic_vector(unsigned(a) + N);
    end generate;

    genblk2: if N <= 1 generate
        y1 <= a;
    end generate;

    odd: if N mod 2 = 1 generate
        signal t : std_logic_vector(7 downto 0);
    begin
        t <= a xor x"FF";
        y2 <= t;
    end generate;
    even: if not (N mod 2 = 1) generate
        signal t : std_logic_vector(7 downto 0);
    begin
        t <= a and x"0F";
        y2 <= t;
    end generate;

    zero: if N = 0 generate
        y3 <= (others => '0');
    end generate;
    genblk4: if not (N = 0) and (N = 1) generate
        y3 <= a;
    end generate;
    small: if not (N = 0) and not (N = 1) and (N < 4) generate
        y3 <= std_logic_vector(unsigned(a) + 1);
    end generate;
    large: if not (N = 0) and not (N = 1) and not (N < 4) generate
        five: if N = 5 generate
            y3 <= std_logic_vector(unsigned(a) - 5);
        end generate;
        other: if not (N = 5) generate
            y3 <= std_logic_vector(unsigned(a) - 1);
        end generate;
    end generate;

    low: if N = 0 or N = 1 generate
        y4 <= x"0A";
    end generate;
    genblk5: if not (N = 0 or N = 1) and (N = 3) generate
        y4 <= x"1E";
    end generate;
    high: if not (N = 0 or N = 1) and not (N = 3) generate
        y4 <= a;
    end generate;
end Behavioral;
`);
});

test('#3501 VHDL to Verilog: an elsif chain an else if chain, a case generate\'s alternatives too; an else generate\'s declarations in its block; the alternatives\' label numbered; one generate region around generates nested', () => {
  const tr = translateSource(VHDL, { path: 'gen.vhd', to: 'verilog' });
  assert.equal(generates(tr.text, '    generate if (N > 1)'), `    generate if (N > 1) begin : big
        assign y1 = a + N;
    end endgenerate

    generate if (N <= 1) begin : small_
        assign y1 = a;
    end endgenerate

    generate if (N % 2 == 1) begin : parity
        wire [7:0] t;
        assign t = a ^ 8'hFF;
        assign y2 = t;
    end else begin : parity_else
        wire [7:0] t;
        assign t = a & 8'h0F;
        assign y2 = t;
    end endgenerate

    generate if (N == 0) begin : chain
        assign y3 = 8'd0;
    end else if (N == 1) begin : chain_2
        assign y3 = a;
    end else if (N < 4) begin : chain_3
        assign y3 = a + 1;
    end else begin : chain_else
        if (N == 5) begin : five
            assign y3 = a - 5;
        end
        if (N != 5) begin : other
            assign y3 = a - 1;
        end
    end endgenerate

    generate if (N == 0 || N == 1) begin : sel
        assign y4 = 8'h0A;
    end else if (N == 3) begin : sel_2
        assign y4 = 8'h1E;
    end else if (N >= 4 && N <= 5) begin : sel_3
        assign y4 = a;
    end else begin : sel_else
        assign y4 = a;
    end endgenerate
endmodule
`);
});

test('#3501 the bodies kept: an if generate alone at module level (Verilog), an if generate with no elsif (VHDL)', () => {
  const v = translateSource('module m(input [7:0] a, output [7:0] y);\n  if (1) begin\n    assign y = a + 1;\n  end\nendmodule\n', { path: 'm.v', to: 'vhdl' });
  assert.deepEqual(v.errors, []);
  assert.match(v.text, /^ {4}genblk1: if 1 \/= 0 generate\n {8}y <= std_logic_vector\(unsigned\(a\) \+ 1\);\n {4}end generate;$/m);
  const h = translateSource(`library ieee;\nuse ieee.std_logic_1164.all;\nuse ieee.numeric_std.all;\nentity m is port (a : in unsigned(7 downto 0); y : out unsigned(7 downto 0)); end m;
architecture rtl of m is\nbegin\n  g: if true generate\n    y <= a + 1;\n  end generate;\nend rtl;\n`, { path: 'm.vhd', to: 'verilog' });
  assert.deepEqual(h.errors, []);
  assert.match(h.text, /^ {4}generate if \(1'b1\) begin : g\n {8}assign y = a \+ 1;\n {4}end endgenerate$/m);
});

test('#3501 what a branch holds that has no translation: an error at its line, in an else if branch and an elsif one', () => {
  const v = translateSource(`module m #(parameter N = 0) (input [7:0] a, output [3:0] c, output [3:0] d);
  if (N == 0) begin
    assign c = a[3:0];
    assign d = a[7:4];
  end else if (N == 1) begin
    assign {c, d} = a;
  end
endmodule
`, { path: 'm.v', to: 'vhdl' });
  assert.deepEqual(v.errors, [{ line: 6, message: 'an assignment to a concatenation cannot be translated to VHDL' }]);
  const h = translateSource(`library ieee;
use ieee.std_logic_1164.all;
entity m is generic (N : integer := 0); port (a : in std_logic; y : out std_logic); end m;
architecture rtl of m is
begin
  g: if N = 0 generate
    y <= a;
  elsif N = 1 generate
    process begin
      wait until a = '1' for 5 ns;
      y <= a;
    end process;
  end generate;
end rtl;
`, { path: 'm.vhd', to: 'verilog' });
  assert.deepEqual(h.errors, [{ line: 10, message: 'this wait statement cannot be translated to Verilog' }]);
});
