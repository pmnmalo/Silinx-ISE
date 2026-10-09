// Simulator semantics regressions (VHDL / Verilog event scheduling, values, elaboration).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../core/compile.js';

// Simulate one source; returns the log lines (prints and report texts, without severity).
function run(text, top, { until = 1e9, lang } = {}) {
  const path = lang === 'verilog' || /^\s*module\b/m.test(text) ? 't.v' : 't.vhd';
  const r = simulate([{ path, text }], top, { until });
  assert.deepEqual(r.errors.map(e => `${e.line}: ${e.message}`), []);
  const errs = r.sim.log.filter(l => l.kind === 'error' && !/^(BAD|EXP)/.test(l.text));
  assert.deepEqual(errs.map(e => e.text), []);
  return r.sim.log.map(l => l.text);
}
const vhd = (body, decls = '', ctx = '') => `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all; ${ctx}
entity tb is end;
architecture sim of tb is
${decls}
begin
${body}
end;`;

// ------------------------------------------------------------------ scheduling
test('VHDL after: a clock edge and a stimulus change at the same time do not race', () => {
  const out = run(vhd(`
  clk <= not clk after 5 ns;
  process(clk) begin if rising_edge(clk) then q <= din; end if; end process;
  process begin
    wait for 15 ns; din <= '1';
    wait for 1 ns; report "q=" & std_logic'image(q);
    wait for 10 ns; report "q=" & std_logic'image(q);
    wait;
  end process;`, `signal clk, din, q : std_logic := '0';`), 'tb');
  assert.deepEqual(out, ["q='0'", "q='1'"]);
});

test('VHDL wait for 0 ns advances one delta', () => {
  const out = run(vhd(`
  process begin
    s <= '1'; wait for 0 ns; report "s=" & std_logic'image(s);
    n <= n + 1; wait for 0 ns; wait for 0 ns; report "n=" & integer'image(n);
    wait;
  end process;`, `signal s : std_logic := '0'; signal n : integer := 0;`), 'tb');
  assert.deepEqual(out, ["s='1'", 'n=1']);
});

test('VHDL inertial delay rejects short pulses; a new assignment preempts pending ones', () => {
  const out = run(vhd(`
  y <= a after 10 ns;
  yt <= transport a after 10 ns;
  yr <= reject 1 ns inertial a after 10 ns;
  process begin
    s <= '1' after 10 ns; s <= '0';
    w <= '1', '0' after 5 ns, '1' after 7 ns;
    wait for 20 ns;
    a <= '1'; wait for 2 ns; a <= '0';
    wait for 20 ns;
    report "s=" & std_logic'image(s) & " w=" & std_logic'image(w) & " y=" & integer'image(ny) & " yt=" & integer'image(nt) & " yr=" & integer'image(nr);
    wait;
  end process;
  process(y) begin if y = '1' then ny <= ny + 1; end if; end process;
  process(yt) begin if yt = '1' then nt <= nt + 1; end if; end process;
  process(yr) begin if yr = '1' then nr <= nr + 1; end if; end process;
  process begin
    wait for 6 ns; assert w = '0' report "BAD w at 6 ns"; wait;
  end process;`, `signal a, y, yt, yr, s, w : std_logic := '0'; signal ny, nt, nr : integer := 0;`), 'tb');
  assert.deepEqual(out, ["s='0' w='1' y=0 yt=1 yr=1"]);
});

test('VHDL clocked process with after: output follows each edge', () => {
  const out = run(vhd(`
  clk <= not clk after 5 ns;
  process(clk) begin if rising_edge(clk) then q <= std_logic_vector(unsigned(q) + 1) after 1 ns; end if; end process;
  process begin wait for 52 ns; report "q=" & integer'image(to_integer(unsigned(q))); wait; end process;`,
  `signal clk : std_logic := '0'; signal q : std_logic_vector(3 downto 0) := "0000";`), 'tb');
  assert.deepEqual(out, ['q=5']);
});

test('Verilog intra-assignment delay suspends the process', () => {
  const out = run(`module t; reg a, b;
  initial begin a = 0; b = 1; a = #5 b; $display("t=%0t a=%0d", $time, a); end
  endmodule`, 't');
  assert.deepEqual(out, ['t=5 a=1']);
});

test('Verilog $finish: no other process runs after it in the same delta', () => {
  const out = run(`module t; reg c = 0;
  initial begin #3 $finish; end
  initial begin #3 c = 1; end
  always @(c) $display("c=%0d", c);
  endmodule`, 't');
  assert.ok(!out.includes('c=1'), out.join('\n'));
});

// ------------------------------------------------------------------ drivers
test('VHDL: several drivers of a std_logic signal are resolved', () => {
  const out = run(vhd(`
  b <= '1' when en1 = '1' else 'Z';
  b <= '0' when en2 = '1' else 'Z';
  v(0) <= '1';
  v(1) <= '0';
  process begin
    wait for 1 ns; report std_logic'image(b);
    en1 <= '1'; wait for 1 ns; report std_logic'image(b);
    en2 <= '1'; wait for 1 ns; report std_logic'image(b);
    en1 <= '0'; wait for 1 ns; report std_logic'image(b) & " " & to_string(v);
    wait;
  end process;`, `signal b : std_logic; signal en1, en2 : std_logic := '0'; signal v : std_logic_vector(1 downto 0);`), 'tb');
  assert.deepEqual(out, ["'z'", "'1'", "'x'", "'0' 01"]);
});

test('VHDL: a testbench and the design drive an inout bus (tri-state)', () => {
  const dut = `library ieee; use ieee.std_logic_1164.all;
entity dut is port (oe : in std_logic; d : inout std_logic_vector(3 downto 0); q : out std_logic_vector(3 downto 0)); end;
architecture rtl of dut is begin
  d <= "1010" when oe = '1' else (others => 'Z');
  q <= d;
end;`;
  const tb = vhd(`
  u : entity work.dut port map (oe => oe, d => d, q => q);
  process begin
    oe <= '1'; d <= "ZZZZ"; wait for 1 ns; report to_string(q);
    oe <= '0'; d <= "0110"; wait for 1 ns; report to_string(q);
    oe <= '1'; wait for 1 ns; report to_string(q);
    wait;
  end process;`, `signal oe : std_logic; signal d, q : std_logic_vector(3 downto 0);`);
  const r = simulate([{ path: 'dut.vhd', text: dut }, { path: 'tb.vhd', text: tb }], 'tb', { until: 1e9 });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.sim.log.map(l => l.text), ['1010', '0110', 'XX10']);
});

test('Verilog: wires with several continuous drivers resolve z, conflicts give x', () => {
  const out = run(`module t; reg e1 = 0, e2 = 0; wire w;
  assign w = e1 ? 1'b1 : 1'bz;
  assign w = e2 ? 1'b0 : 1'bz;
  reg r; initial r = 0; always @(e1) r = e1;   // procedural writes to one reg are one driver
  initial begin
    #1 $display("%b", w); e1 = 1; #1 $display("%b", w); e2 = 1; #1 $display("%b", w); e1 = 0; #1 $display("%b %b", w, r);
  end
  endmodule`, 't');
  assert.deepEqual(out, ['z', '1', 'x', '0 0']);
});

// ------------------------------------------------------------------ Verilog sizing
test('Verilog: constant expressions are sized by their context before folding', () => {
  const out = run(`module t;
  localparam [7:0] P = 4'hF + 4'h1;
  wire [7:0] w = 4'hF + 4'h1;
  reg [7:0] y, b; reg [63:0] q; reg [3:0] x;
  initial begin
    y = 4'hF + 4'h1; b = 2'd3 * 2'd3; q = 'hFFFFFFFF + 1; x = 4'hF;
    #1 $display("%0d %0d %0d %0d %h", P, w, y, b, q);
    $display("%0d %0d %0d", 4'd15 + 4'd1 == 5'd16, {4'b1010} + 4'b1000, (x + 1'b1 == 5'd16) ? 1 : 0);
    if (4'd15 + 4'd1 == 5'd16) $display("if ok");
    q = 'bz; $display("%h", q); q = 'hx; $display("%h", q); q = 'hx1; $display("%h", q);
  end
  endmodule`, 't');
  assert.deepEqual(out, ['16 16 16 9 0000000100000000', '1 2 1', 'if ok', 'zzzzzzzzzzzzzzzz', 'xxxxxxxxxxxxxxxx', 'xxxxxxxxxxxxxxXX'.replace('XX', 'x1')]);
});

test('Verilog: @(v[0]) waits for bit 0 only, @(v) for any bit', () => {
  const out = run(`module t;
  reg [1:0] v = 0; integer n = 0, m = 0, k = 0;
  initial begin #1 v = 2'b10; #1 v = 2'b00; #1 v = 2'b01; #1 $display("%0d %0d %0d", n, m, k); end
  initial forever begin @(v[0]) n = n + 1; end
  initial forever begin @(v[1]) m = m + 1; end
  initial forever begin @(v) k = k + 1; end
  endmodule`, 't');
  assert.deepEqual(out, ['1 2 3']);
});

// ------------------------------------------------------------------ subprograms, attributes, types
test('VHDL functions: unconstrained return width, widths from integer parameters', () => {
  const out = run(vhd(`
  y <= dbl(x); z <= zext(x, 8); w <= to_slv(5, 6);
  process begin
    wait for 1 ns; report to_string(y) & " " & to_string(z) & " " & to_string(w) & " " & to_string(zext("1", 3)); wait;
  end process;`, `
  function dbl(v : std_logic_vector) return std_logic_vector is begin return v & v; end function;
  function zext(v : std_logic_vector; n : natural) return std_logic_vector is
    variable r : std_logic_vector(n-1 downto 0) := (others => '0');
  begin r(v'length-1 downto 0) := v; return r; end function;
  function to_slv(i : integer; n : natural) return std_logic_vector is
  begin return std_logic_vector(to_unsigned(i, n)); end function;
  signal x : std_logic_vector(1 downto 0) := "10";
  signal y : std_logic_vector(3 downto 0); signal z : std_logic_vector(7 downto 0); signal w : std_logic_vector(5 downto 0);`), 'tb');
  assert.deepEqual(out, ['1010 00000010 000101 001']);
});

test("VHDL 'high / 'low / 'left / 'right of integer and enumeration types", () => {
  const out = run(vhd(`
  process begin
    report integer'image(integer'high) & " " & integer'image(integer'low) & " " & integer'image(natural'low) & " "
      & integer'image(natural'high) & " " & integer'image(positive'low) & " " & integer'image(idx'high) & " "
      & integer'image(idx'low) & " " & integer'image(c'high) & " " & st'image(st'high) & " " & st'image(st'low);
    wait;
  end process;`, `subtype idx is integer range 2 to 15; type st is (A, B, C); signal c : integer range 0 to 99;`), 'tb');
  assert.deepEqual(out, ['2147483647 -2147483648 0 2147483647 1 15 2 99 c a']);
});

test('VHDL strings made of std_logic characters stay strings; generics; aliases', () => {
  const sub = `entity sub is generic (NAME : string := "x"); end;
architecture a of sub is begin
  process begin report "name=" & NAME; wait; end process;
end;`;
  const tb = vhd(`
  u : entity work.sub generic map (NAME => "u1");
  hi <= "1010";
  process begin
    report S; wait for 1 ns; report to_string(v) & " " & to_string(lo); wait;
  end process;`, `constant S : string := "hw"; signal v : std_logic_vector(7 downto 0) := x"0F";
  alias hi : std_logic_vector(3 downto 0) is v(7 downto 4); alias lo is v(3 downto 0);`);
  const r = simulate([{ path: 'sub.vhd', text: sub }, { path: 'tb.vhd', text: tb }], 'tb', { until: 1e9 });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.sim.log.map(l => l.text).sort(), ['10101111 1111', 'hw', 'name=u1']);
});

test('numeric_std resize of signed keeps the sign; std_logic_arith unsigned + signed is signed', () => {
  const out = run(vhd(`
  process begin
    report integer'image(to_integer(resize(s8, 4))) & " " & integer'image(to_integer(resize(n8, 4))) & " "
      & integer'image(to_integer(resize(s8, 12)));
    wait;
  end process;`, `signal s8 : signed(7 downto 0) := "01111111"; signal n8 : signed(7 downto 0) := "10000011";`), 'tb');
  assert.deepEqual(out, ['7 -5 127']);
  const out2 = run(`library ieee; use ieee.std_logic_1164.all; use ieee.std_logic_arith.all;
entity tb is end;
architecture sim of tb is
  signal u : unsigned(3 downto 0) := "0010"; signal s : signed(3 downto 0) := "1101";
begin
  process begin report integer'image(conv_integer(u + s)) & " " & boolean'image(s < u); wait; end process;
end;`, 'tb');
  assert.deepEqual(out2, ['-1 true']);
});

test('VHDL REAL arithmetic, time * real, conversions', () => {
  const out = run(vhd(`
  process
    variable r : real := 1.5; variable i : integer;
  begin
    wait for T * 2.5; report time'image(now);
    r := r * 2.0; report real'image(r);
    r := 1.0 / 4.0; report real'image(r) & " " & boolean'image(r < 0.3) & " " & boolean'image(r > 0.3);
    i := integer(-r * 10.0); report integer'image(i) & " " & real'image(real(i) + 0.5) & " " & real'image(abs (-r));
    wait for T / 4; report time'image(now);
    rs <= 0.25; wait for 1 ns; rs <= 0.5; wait for 1 ns; report integer'image(n);
    wait;
  end process;
  process(rs) begin n <= n + 1; end process;`, `constant T : time := 10 ns; signal rs : real := 0.0; signal n : integer := 0;`), 'tb');
  assert.deepEqual(out, ['25 ns', '3.0', '0.25 true false', '-3 -2.5 0.25', '27500 ps', '3']);
});

test('Verilog recursive automatic function', () => {
  const out = run(`module t;
  function automatic integer fact(input integer n);
    if (n <= 1) fact = 1; else fact = n * fact(n - 1);
  endfunction
  initial $display("%0d", fact(5));
  endmodule`, 't');
  assert.deepEqual(out, ['120']);
});

test('VHDL port map with sub-element formals connects each bit / slice', () => {
  const sub = `library ieee; use ieee.std_logic_1164.all;
entity sub is port (a : in std_logic_vector(7 downto 0); y : out std_logic_vector(7 downto 0)); end;
architecture rtl of sub is begin y <= not a; end;`;
  const tb = vhd(`
  u : entity work.sub port map (a(7) => b7, a(6) => b6, a(5 downto 2) => mid, a(1 downto 0) => "01",
                                y(7) => o7, y(6 downto 0) => lo);
  process begin
    wait for 1 ns; report std_logic'image(o7) & " " & to_string(lo);
    b7 <= '0'; mid <= "0000"; wait for 1 ns; report std_logic'image(o7) & " " & to_string(lo);
    wait;
  end process;`, `signal b7 : std_logic := '1'; signal b6 : std_logic := '0'; signal mid : std_logic_vector(3 downto 0) := "1010";
  signal o7 : std_logic; signal lo : std_logic_vector(6 downto 0);`);
  const r = simulate([{ path: 'sub.vhd', text: sub }, { path: 'tb.vhd', text: tb }], 'tb', { until: 1e9 });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.sim.log.map(l => l.text), ["'0' 1010110", "'1' 1111110"]);
});

test('Verilog: unary ~ and - operands are widened to the context, also in conditions', () => {
  const out = run(`module t;
  reg [2:0] b, a; reg c; reg [3:0] y; wire w1 = b < ~c; wire w2 = (~(a[2:1]) + (3'b101 >> 3)) <= ~(c);
  initial begin
    b = 3'd5; c = 0; a = 3'b111;
    #1 $display("%b %b %b", w1, w2, b < -c);
    if (b < ~c) $display("if"); y = (b < ~c) ? 1 : 2; $display("%0d", y);
    c = 1; #1 $display("%b %b %b", w1, w2, b < -c);
    if (c && b < ~c) $display("if2"); while (b < ~c) b = b + 1; $display("%0d", b);
  end
  endmodule`, 't');
  assert.deepEqual(out, ['1 1 0', 'if', '1', '1 1 1', 'if2', '6']);
});

// ------------------------------------------------------------------ memories
test('memory element writes are cheap (64K-entry memory initialised in a loop)', () => {
  const t0 = Date.now();
  const out = run(`module t; reg [7:0] mem [0:65535]; integer i;
  initial begin for (i = 0; i < 65536; i = i + 1) mem[i] = i; #1 $display("%0d %0d", mem[300], mem[65535]); end
  endmodule`, 't');
  assert.deepEqual(out, ['44 255']);
  assert.ok(Date.now() - t0 < 4000, `took ${Date.now() - t0} ms`);
});

test('VHDL arrays: copies are independent of later element updates', () => {
  const out = run(vhd(`
  process
    variable v : mem_t := (others => x"00");
  begin
    m <= (others => x"11"); wait for 1 ns;
    v := m; v(0) := x"AA";                 -- the variable is a copy of the signal
    m2 <= v; v(1) := x"BB";                -- the queued value is v at the assignment
    m(2) <= x"CC";
    wait for 1 ns;
    report to_hstring(m(0)) & to_hstring(m(2)) & " " & to_hstring(m2(0)) & to_hstring(m2(1)) & " " & to_hstring(v(1));
    wait;
  end process;`, `type mem_t is array (0 to 3) of std_logic_vector(7 downto 0); signal m, m2 : mem_t;`), 'tb');
  assert.deepEqual(out, ['11CC AA11 BB']);
});

// ------------------------------------------------------------------ VHDL values
test('VHDL = and /= compare std_logic values exactly (X, U, Z included)', () => {
  const out = run(vhd(`
  process begin
    report boolean'image(q /= 'X') & boolean'image(u /= '1') & boolean'image(z = 'Z') & boolean'image(v = "X1")
      & boolean'image(not (u = '1')) & boolean'image(u = '0') & boolean'image(v /= "X1");
    wait;
  end process;`, `signal q : std_logic := '1'; signal u : std_logic; signal z : std_logic := 'Z'; signal v : std_logic_vector(1 downto 0) := "X1";`), 'tb');
  assert.deepEqual(out, ['truetruetruetruetruefalsefalse']);
});

test('VHDL conditional assignment with an unknown condition takes the else branch; std_match', () => {
  const out = run(vhd(`
  y <= '1' when s = '1' else '0';
  process begin
    wait for 1 ns;
    report std_logic'image(y) & boolean'image(std_match(v, "1-0")) & boolean'image(std_match(v, "100"))
      & boolean'image(std_match(w, "1-0")) & boolean'image(std_match(w, "110"));
    wait;
  end process;`, `signal s, y : std_logic := 'X'; signal v : std_logic_vector(2 downto 0) := "110"; signal w : std_logic_vector(2 downto 0) := "1X0";`), 'tb');
  assert.deepEqual(out, ["'0'truefalsetruefalse"]);
});

test('VHDL rising_edge / falling_edge need a 0 -> 1 / 1 -> 0 transition', () => {
  const out = run(vhd(`
  process begin
    wait for 1 ns; u <= '1'; wait for 1 ns; u <= '0'; wait for 1 ns; u <= 'X'; wait for 1 ns; u <= '1';
    wait for 1 ns; u <= 'X'; wait for 1 ns; u <= '0'; wait for 1 ns; u <= '1'; wait for 1 ns; u <= '0';
    wait for 1 ns; report integer'image(r) & " " & integer'image(f); wait;
  end process;
  process(u) begin
    if rising_edge(u) then r <= r + 1; end if;
    if falling_edge(u) then f <= f + 1; end if;
  end process;`, `signal u : std_logic; signal r, f : integer := 0;`), 'tb');
  assert.deepEqual(out, ['1 2']);
});
