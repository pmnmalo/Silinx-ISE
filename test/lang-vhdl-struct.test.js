// VHDL conformance: design structure — entities with generics and ports, component and direct
// entity instantiation, default binding, generate statements, packages and package bodies,
// subprograms (functions, procedures, parameter modes, overloading), blocks and use clauses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { out, sim, vhd } from './lang-util.js';

const ADDER = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity adder is
  generic (W : positive := 4; OFFSET : integer := 0);
  port (a, b : in unsigned(W - 1 downto 0); s : out unsigned(W downto 0));
end entity adder;
architecture rtl of adder is
begin
  s <= resize(a, W + 1) + resize(b, W + 1) + OFFSET;
end architecture rtl;
`;

test('component instantiation with generic map and positional / named port maps (default binding)', () => {
  const r = out({ 'adder.vhd': ADDER, 'tb.vhd': `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity tb is end;
architecture sim of tb is
  component adder is
    generic (W : positive := 4; OFFSET : integer := 0);
    port (a, b : in unsigned(W - 1 downto 0); s : out unsigned(W downto 0));
  end component;
  signal a, b : unsigned(7 downto 0); signal s : unsigned(8 downto 0);
  signal c, d : unsigned(3 downto 0); signal t : unsigned(4 downto 0);
begin
  u8 : adder generic map (W => 8, OFFSET => 1) port map (a => a, b => b, s => s);
  u4 : adder port map (c, d, t);
  process begin
    a <= to_unsigned(200, 8); b <= to_unsigned(100, 8); c <= "1111"; d <= "0001";
    wait for 1 ns;
    report integer'image(to_integer(s)) & " " & integer'image(to_integer(t));
    wait;
  end process;
end;` });
  assert.deepEqual(r, ['301 16']);
});

test('direct entity instantiation (entity work.e(arch)) and generic defaults', () => {
  const r = out({ 'adder.vhd': ADDER, 'tb.vhd': vhd(`
  u : entity work.adder(rtl) port map (a => a, b => b, s => s);
  process begin a <= "0111"; b <= "0011"; wait for 1 ns; report to_string(s); wait; end process;`,
  `signal a, b : unsigned(3 downto 0); signal s : unsigned(4 downto 0);`) });
  assert.deepEqual(r, ['01010']);
});

test('port map with constant actuals, open outputs, port defaults for unconnected inputs', () => {
  const SUB = `library ieee; use ieee.std_logic_1164.all;
entity sub is port (x : in std_logic_vector(3 downto 0); k : in std_logic := '1'; y, z : out std_logic_vector(3 downto 0)); end;
architecture a of sub is begin y <= not x; z <= x(2 downto 0) & k; end;`;
  const r = out(vhd(`
  u1 : entity work.sub port map (x => "0011", y => open, z => z1);
  u2 : entity work.sub port map (x => v, k => '0', y => y2, z => z2);
  process begin wait for 1 ns; report to_string(z1) & " " & to_string(z2) & " " & to_string(y2); wait; end process;`,
  `signal v : std_logic_vector(3 downto 0) := "1000"; signal z1, z2, y2 : std_logic_vector(3 downto 0);`, { pre: SUB }));
  assert.deepEqual(r, ['0111 0000 0111']);
});

test('generics: integer, boolean, std_logic_vector, string and time generics; generic used in a port width', () => {
  const r = out(vhd(`
  u : entity work.g generic map (N => 3, EN => true, INIT => "101", NAME => "unit", D => 2 ns) port map (q => q);
  process begin wait for 5 ns; report to_string(q); wait; end process;`,
  `signal q : std_logic_vector(2 downto 0);`,
  { pre: `library ieee; use ieee.std_logic_1164.all;
entity g is
  generic (N : natural := 1; EN : boolean := false; INIT : std_logic_vector; NAME : string := "x"; D : time := 1 ns);
  port (q : out std_logic_vector(N - 1 downto 0));
end;
architecture a of g is begin
  process begin
    report NAME & " " & integer'image(N) & " " & boolean'image(EN) & " " & integer'image(D / 1 ps);
    if EN then q <= INIT after D; end if;
    wait;
  end process;
end;` }));
  assert.deepEqual(r, ['unit 3 true 2000', '101']);
});

test('for-generate and if-generate (with elsif / else, VHDL-2008), generate with local declarations', () => {
  const r = out(vhd(`
  g : for i in 0 to 3 generate
    signal t : std_logic;
  begin
    t <= a(i) xor b(i);
    y(i) <= t;
  end generate g;
  gi : if N = 1 generate
    z <= "01";
  elsif N = 2 generate
    z <= "10";
  else generate
    z <= "11";
  end generate;
  gd : for i in 3 downto 2 generate
    w(i - 2) <= a(i);
  end generate;
  process begin wait for 1 ns; report to_string(y) & " " & to_string(z) & " " & to_string(w); wait; end process;`,
  `constant N : integer := 2; signal a : std_logic_vector(3 downto 0) := "1100"; signal b : std_logic_vector(3 downto 0) := "1010";
   signal y : std_logic_vector(3 downto 0); signal z, w : std_logic_vector(1 downto 0);`));
  assert.deepEqual(r, ['0110 10 11']);
});

test('generate of component instances (ripple chain)', () => {
  const r = out(vhd(`
  c(0) <= '1';
  g : for i in 0 to 3 generate
    u : entity work.fa port map (a => a(i), b => b(i), ci => c(i), s => s(i), co => c(i + 1));
  end generate;
  process begin wait for 1 ns; report to_string(c(4) & s); wait; end process;`,
  `signal a : std_logic_vector(3 downto 0) := "0111"; signal b : std_logic_vector(3 downto 0) := "0101";
   signal s : std_logic_vector(3 downto 0); signal c : std_logic_vector(4 downto 0);`,
  { pre: `library ieee; use ieee.std_logic_1164.all;
entity fa is port (a, b, ci : in std_logic; s, co : out std_logic); end;
architecture a of fa is begin s <= a xor b xor ci; co <= (a and b) or (ci and (a xor b)); end;` }));
  // 7 + 5 + 1 = 13
  assert.deepEqual(r, ['01101']);
});

test('case-generate (VHDL-2008), with choice lists and ranges', () => {
  const r = out(vhd(`
  g : case N generate
    when 1 => z <= "01";
    when others => z <= "11";
  end generate;
  g2 : case M generate
    when 0 | 2 => y <= 10;
    when a1 : 3 to 5 =>
      signal t : integer := 20;
    begin
      y <= t;
    end a1;
    when others => y <= 30;
  end generate;
  g3 : case M + 3 generate
    when 0 | 2 => w <= 1;
    when 3 to 5 => w <= 2;
    when others => w <= 3;
  end generate;
  process begin wait for 1 ns; report to_string(z) & " " & integer'image(y) & " " & integer'image(w); wait; end process;`,
  `constant N : integer := 1; constant M : integer := 4; signal z : std_logic_vector(1 downto 0); signal w, y : integer;`));
  assert.deepEqual(r, ['01 20 3']);
});

test('packages: constants, types, subtypes, functions declared in the package and defined in the body; deferred constants', () => {
  const pkg = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
package util is
  constant WIDTH : natural := 8;
  constant MAGIC : integer;                 -- deferred
  subtype word_t is std_logic_vector(WIDTH - 1 downto 0);
  type color_t is (red, green, blue);
  function parity(v : std_logic_vector) return std_logic;
  function next_color(c : color_t) return color_t;
  procedure bump(variable x : inout integer; constant by : in integer := 1);
end package util;
package body util is
  constant MAGIC : integer := 42;
  function parity(v : std_logic_vector) return std_logic is
    variable p : std_logic := '0';
  begin
    for i in v'range loop p := p xor v(i); end loop;
    return p;
  end function;
  function next_color(c : color_t) return color_t is
  begin
    if c = color_t'high then return color_t'low; end if;
    return color_t'succ(c);
  end function;
  procedure bump(variable x : inout integer; constant by : in integer := 1) is
  begin x := x + by; end procedure;
end package body util;
`;
  const r = out({ 'util.vhd': pkg, 'tb.vhd': `library ieee; use ieee.std_logic_1164.all; use work.util.all;
entity tb is end;
architecture sim of tb is
begin
  process
    variable w : word_t := x"07";
    variable n : integer := 1;
  begin
    report integer'image(WIDTH) & " " & integer'image(MAGIC) & " " & std_logic'image(parity(w)) & " " & integer'image(w'length);
    report color_t'image(next_color(green)) & " " & color_t'image(next_color(blue));
    bump(n); bump(n, 10); report integer'image(n);
    report std_logic'image(work.util.parity("11"));
    wait;
  end process;
end;` });
  assert.deepEqual(r, ["8 42 '1' 8", 'blue red', '12', "'0'"]);
});

test('use clause selecting a single item (use work.pkg.item) and package-qualified names', () => {
  const r = out({ 'p.vhd': `package p is constant A : integer := 5; constant B : integer := 6; end package;`,
    'tb.vhd': `use work.p.A;
entity tb is end;
architecture sim of tb is begin
  process begin report integer'image(A) & " " & integer'image(work.p.B); wait; end process;
end;` });
  assert.deepEqual(r, ['5 6']);
});

test('functions: overloading by parameter type, recursion, named association, default parameters, early return', () => {
  const r = out(vhd(`
  process begin
    report integer'image(f(3)) & " " & integer'image(f(true)) & " " & integer'image(f("101"));
    report integer'image(fact(6)) & " " & integer'image(add(b => 2, a => 10)) & " " & integer'image(add(7));
    report integer'image(first_one("00100"));
    wait;
  end process;`,
  `function f(x : integer) return integer is begin return x * 2; end function;
   function f(x : boolean) return integer is begin if x then return 1; else return 0; end if; end function;
   function f(x : std_logic_vector) return integer is begin return x'length; end function;
   function fact(n : natural) return natural is begin if n <= 1 then return 1; end if; return n * fact(n - 1); end function;
   function add(a : integer; b : integer := 100) return integer is begin return a + b; end function;
   function first_one(v : std_logic_vector) return integer is
   begin
     for i in v'range loop if v(i) = '1' then return i; end if; end loop;
     return -1;
   end function;`));
  assert.deepEqual(r, ['6 1 3', '720 12 107', '2']);
});

test('procedures: in / out / inout variable parameters, signal parameters, procedures with waits', () => {
  const r = out(vhd(`
  process
    variable q, rr : integer;
    variable acc : integer := 1;
  begin
    divmod(17, 5, q, rr); report integer'image(q) & " " & integer'image(rr);
    twice(acc); twice(acc); report integer'image(acc);
    pulse(s, 3 ns); report std_logic'image(s) & " " & integer'image(now / 1 ns);
    wait;
  end process;`,
  `signal s : std_logic := '0';
   procedure divmod(a, b : in integer; q, r : out integer) is begin q := a / b; r := a mod b; end procedure;
   procedure twice(x : inout integer) is begin x := 2 * x; end procedure;
   procedure pulse(signal o : out std_logic; d : in time) is
   begin o <= '1'; wait for d; o <= '0'; wait for 0 ns; end procedure;`));
  assert.deepEqual(r, ['3 2', '4', "'0' 3"]);
});

test('impure function reading a signal; pure function in a concurrent assignment', () => {
  const r = out(vhd(`
  y <= inv(a);
  process begin
    a <= "0011"; wait for 1 ns;
    report to_string(y) & " " & integer'image(count_a);
    wait;
  end process;`,
  `signal a : std_logic_vector(3 downto 0) := "0000"; signal y : std_logic_vector(3 downto 0);
   function inv(v : std_logic_vector) return std_logic_vector is begin return not v; end function;
   impure function count_a return integer is
     variable n : integer := 0;
   begin for i in a'range loop if a(i) = '1' then n := n + 1; end if; end loop; return n; end function;`));
  assert.deepEqual(r, ['1100 2']);
});

test('block statements with local signals and guarded blocks', () => {
  const r = out(vhd(`
  b1 : block
    signal t : std_logic_vector(3 downto 0);
  begin
    t <= x"5";
    y <= t;
  end block;
  process begin wait for 1 ns; report to_string(y); wait; end process;`,
  `signal y : std_logic_vector(3 downto 0);`));
  assert.deepEqual(r, ['0101']);
});

test('several architectures: the last one is bound by default; configuration-free component binding to an entity', () => {
  const r = out(vhd(`
  u : comp port map (o => o);
  process begin wait for 1 ns; report std_logic'image(o); wait; end process;`,
  `signal o : std_logic; component comp is port (o : out std_logic); end component;`,
  { pre: `library ieee; use ieee.std_logic_1164.all;
entity comp is port (o : out std_logic); end;
architecture one of comp is begin o <= '0'; end;
architecture two of comp is begin o <= '1'; end;` }));
  // without a configuration, the most recently analysed architecture is used (§7.3.3)
  assert.deepEqual(r, ["'1'"]);
});

test('mixed language: a VHDL testbench instantiating a Verilog module with parameters', () => {
  const r = out({ 'm.v': `module scale #(parameter K = 2) (input [7:0] a, output [7:0] y); assign y = a * K; endmodule`,
    'tb.vhd': vhd(`
  u : entity work.scale generic map (K => 3) port map (a => a, y => y);
  process begin a <= x"05"; wait for 1 ns; report integer'image(to_integer(unsigned(y))); wait; end process;`,
    `signal a, y : std_logic_vector(7 downto 0);`) });
  assert.deepEqual(r, ['15']);
});
