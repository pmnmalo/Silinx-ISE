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
