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
