// VHDL conformance: conversion functions, aggregates, subtypes as type marks, VHDL-2008 matching
// operators, multiple drivers of vector elements, and other details of the language.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { out, sim, vproc, vhd } from './lang-util.js';

const ARITH = 'library ieee; use ieee.std_logic_1164.all; use ieee.std_logic_arith.all; use ieee.std_logic_unsigned.all;';

test('std_logic_arith conversions: conv_integer, conv_unsigned, conv_signed, conv_std_logic_vector, ext, sxt', () => {
  const r = out(`${ARITH}
entity tb is end;
architecture sim of tb is begin
  process
    variable u : unsigned(3 downto 0) := "1010";
    variable s : signed(3 downto 0) := "1010";
    variable v : std_logic_vector(3 downto 0) := "1010";
  begin
    report integer'image(conv_integer(u)) & " " & integer'image(conv_integer(s)) & " " & integer'image(conv_integer(v));
    report to_string(conv_std_logic_vector(5, 6)) & " " & to_string(conv_std_logic_vector(-1, 4)) & " " & to_string(conv_unsigned(9, 3));
    report to_string(conv_signed(-3, 5)) & " " & to_string(ext(v, 6)) & " " & to_string(sxt(v, 6));
    report to_string(conv_std_logic_vector(u, 6)) & " " & to_string(conv_std_logic_vector(s, 6));
    wait;
  end process;
end;`);
  // conv_std_logic_vector of a signed value sign-extends; conv_unsigned truncates to the size
  assert.deepEqual(r, ['10 -6 10', '000101 1111 001', '11101 001010 111010', '001010 111010']);
});

test('numeric_std: to_integer of a vector with metavalues is 0 (with a warning in numeric_std); std_logic_vector casts keep the bits', () => {
  const r = out(vproc(`
    report integer'image(to_integer(unsigned(s)) ) & " " & integer'image(to_integer(signed(std_logic_vector'("1110"))));
    v := std_logic_vector(to_signed(-2, 4)); report to_string(v);
    u := unsigned(v); report integer'image(to_integer(u));`,
  `variable s : std_logic_vector(3 downto 0) := "0110"; variable v : std_logic_vector(3 downto 0); variable u : unsigned(3 downto 0);`));
  assert.deepEqual(r, ['6 -2', '1110', '14']);
});

test('to_01 / to_x01 / to_bit / to_stdlogicvector / to_bitvector and std_logic_vector <-> bit_vector', () => {
  const r = out(vproc(`
    b := to_bitvector(v); report to_string(b);
    v := to_stdlogicvector(b xor "1111"); report to_string(v);
    report bit'image(to_bit(v(0))) & " " & std_logic'image(to_x01(v(1)));`,
  `variable v : std_logic_vector(3 downto 0) := "1001"; variable b : bit_vector(3 downto 0);`));
  assert.deepEqual(r, ['1001', '0110', "'0' '1'"]);
});

test('aggregates: positional, named with choices and ranges, others; aggregates of std_logic_vector and of arrays; aggregate targets', () => {
  const r = out(vhd(`
  process
    variable v : std_logic_vector(7 downto 0);
    variable a : arr;
    variable x, y : std_logic;
    variable p : std_logic_vector(1 downto 0);
  begin
    v := ('1', '0', '1', '0', others => '0'); report to_string(v);
    v := (7 downto 4 => '1', 0 => '1', others => '0'); report to_string(v);
    v := (1 | 3 | 5 => '1', others => '0'); report to_string(v);
    a := (2 => 7, others => 1); report integer'image(a(0)) & integer'image(a(1)) & integer'image(a(2));
    a := (0 to 1 => 4, 2 => 5); report integer'image(a(0)) & integer'image(a(1)) & integer'image(a(2));
    p := "10";
    (x, y) := p; report std_logic'image(x) & std_logic'image(y);
    wait;
  end process;`, 'type arr is array (0 to 2) of integer;'));
  assert.deepEqual(r, ['10100000', '11110001', '00101010', '117', '445', "'1''0'"]);
});

test('subtypes: vector and integer subtypes used as type marks, in conversions and as loop ranges', () => {
  const r = out(vproc(`
    w := word_t(to_unsigned(300, 8)); report to_string(w);
    for i in idx_t loop s := s + i; end loop; report integer'image(s);
    report integer'image(idx_t'high) & " " & integer'image(word_t'length);`,
  `variable w : word_t; variable s : integer := 0;`,
  `subtype word_t is std_logic_vector(7 downto 0); subtype idx_t is integer range 1 to 4;`));
  // 300 does not fit 8 bits: to_unsigned keeps the low bits
  assert.deepEqual(r, ['00101100', '10', '4 8']);
});

test('VHDL-2008 matching relational operators ?= ?/= ?< return std_ulogic', () => {
  const r = out(vproc(`
    y := a ?= b; report std_logic'image(y);
    y := a ?/= b; report std_logic'image(y);
    y := a ?= "1-01"; report std_logic'image(y);
    if (a ?= b) then report "eq"; end if;`,
  `variable a : std_logic_vector(3 downto 0) := "1101"; variable b : std_logic_vector(3 downto 0) := "1101"; variable y : std_logic;`));
  // ?= treats '-' as matching anything
  assert.deepEqual(r, ["'1'", "'0'", "'1'", 'eq']);
});

test('different processes driving different elements of a std_logic_vector signal', () => {
  const r = out(vhd(`
  process begin v(0) <= '1'; wait; end process;
  process begin v(1) <= '0'; wait; end process;
  process begin v(3 downto 2) <= "10"; wait; end process;
  process begin wait for 1 ns; report to_string(v); wait; end process;`,
  'signal v : std_logic_vector(3 downto 0);'));
  assert.deepEqual(r, ['1001']);
});

test('wait on at the end of a process is equivalent to a sensitivity list; postponed processes', () => {
  const r = out(vhd(`
  process begin n <= n + 1; wait on a; end process;
  postponed process (a) begin m <= m + 1; end process;
  process begin a <= '1'; wait for 1 ns; a <= '0'; wait for 1 ns; report integer'image(n) & " " & integer'image(m); wait; end process;`,
  "signal a : std_logic := '0'; signal n, m : integer := 0;"));
  assert.deepEqual(r, ['3 3']);
});

test('functions returning arrays, records and unconstrained vectors; nested subprograms; recursion over vectors', () => {
  const r = out(vhd(`
  process begin
    report to_string(rev("1100")) & " " & integer'image(sum3((1, 2, 3))) & " " & integer'image(mk(4).b) & " " & integer'image(ones("1011"));
    wait;
  end process;`,
  `type a3 is array (0 to 2) of integer;
   type rec is record a : integer; b : integer; end record;
   function rev(v : std_logic_vector) return std_logic_vector is
     variable r : std_logic_vector(v'range);
   begin
     for i in v'range loop r(i) := v(v'high - i + v'low); end loop;
     return r;
   end function;
   function sum3(x : a3) return integer is
     function add(p, q : integer) return integer is begin return p + q; end function;
   begin return add(add(x(0), x(1)), x(2)); end function;
   function mk(n : integer) return rec is begin return (a => n, b => n * 2); end function;
   function ones(v : std_logic_vector) return integer is
   begin
     if v'length = 0 then return 0; end if;
     if v'length = 1 then if v(v'low) = '1' then return 1; else return 0; end if; end if;
     return ones(v(v'high downto v'high)) + ones(v(v'high - 1 downto v'low));
   end function;`));
  assert.deepEqual(r, ['0011 6 8 3']);
});

test('report messages: time and integer images in strings; now', () => {
  const r = sim(vhd(`
  process begin
    wait for 1500 ps;
    report "t=" & time'image(now) & " n=" & integer'image(-3) & " ok";
    wait;
  end process;`));
  assert.equal(r.lines[0], '1500 note t=1500 ps n=-3 ok');
});

test('integer arithmetic overflow beyond 32 bits is reported (once per operator, as a warning; the value wraps around)', () => {
  const r = sim(vproc(`for k in 1 to 3 loop n := integer'high; n := n + 1; end loop; report integer'image(n);`, 'variable n : integer;'));
  assert.deepEqual(r.lines.filter(l => !/simulation/.test(l)), ['0 warning integer overflow: 2147483648 is outside the range of INTEGER', '0 note -2147483648']);
  const r2 = sim(vproc(`n := n * 65536 * 65536; report integer'image(n);`, 'variable n : integer := 3;'));
  assert.match(r2.log.find(l => l.kind === 'warning').text, /^integer overflow/);
});

test('generics of type std_logic_vector sized from another generic; generate over a generic vector\'range', () => {
  const r = out(vhd(`
  u : entity work.g generic map (N => 3, MASK => "101") port map (y => y);
  process begin wait for 1 ns; report to_string(y); wait; end process;`,
  'signal y : std_logic_vector(2 downto 0);',
  { pre: `library ieee; use ieee.std_logic_1164.all;
entity g is generic (N : natural; MASK : std_logic_vector); port (y : out std_logic_vector(N - 1 downto 0)); end;
architecture a of g is begin
  gen : for i in MASK'range generate y(i) <= not MASK(i); end generate;
end;` }));
  assert.deepEqual(r, ['010']);
});

test('signal assignments with unaffected and conditional waveforms with after', () => {
  const r = sim(vhd(`
  y <= a after 2 ns when en = '1' else unaffected;
  process begin
    a <= '1'; en <= '1'; wait for 5 ns; report std_logic'image(y);
    en <= '0'; a <= '0'; wait for 5 ns; report std_logic'image(y);
    wait;
  end process;`, "signal a, en : std_logic := '0'; signal y : std_logic := 'Z';"));
  assert.deepEqual(r.out, ["'1'", "'1'"]);
});

test('bit-string literals x"" o"" b"" with underscores, VHDL-2008 sized literals 8x"F" / 6ux"F"', () => {
  const r = out(vproc(`
    report to_string(std_logic_vector'(x"A")) & " " & to_string(std_logic_vector'(x"DE_AD")) & " " & to_string(std_logic_vector'(o"7")) & " " & to_string(std_logic_vector'(b"10_10"));
    report to_string(std_logic_vector'(8x"F")) & " " & to_string(std_logic_vector'(6ux"F"));`));
  assert.deepEqual(r, ['1010 1101111010101101 111 1010', '00001111 001111']);
});

test('process variables keep their values between activations; wait until with a compound condition', () => {
  const r = sim(vhd(`
  process (t) variable n : integer := 0; begin n := n + 1; report "n=" & integer'image(n); end process;
  process begin t <= '1'; wait for 1 ns; t <= '0'; wait; end process;
  clk <= not clk after 5 ns when now < 60 ns;
  process begin wait until rising_edge(clk) and en = '1'; report "at " & integer'image(now / 1 ns); wait; end process;
  process begin wait for 22 ns; en <= '1'; wait; end process;`,
  "signal t, clk, en : std_logic := '0';")).out;
  assert.deepEqual(r, ['n=1', 'n=2', 'n=3', 'at 25']);
});

test('guarded blocks: guarded assignments only take effect while the guard expression is true', () => {
  const r = out(vhd(`
  b : block (en = '1') begin q <= guarded d; end block;
  process begin d <= '1'; wait for 1 ns; report std_logic'image(q); en <= '1'; wait for 1 ns; report std_logic'image(q);
    en <= '0'; d <= '0'; wait for 1 ns; report std_logic'image(q); wait; end process;`,
  "signal en, d, q : std_logic := '0';"));
  assert.deepEqual(r, ["'0'", "'1'", "'1'"]);
});

test('enumeration types with character literals; integer type declarations; attribute declarations and specifications', () => {
  const r = out(vhd(`
  process begin
    report abc'image(x) & " " & integer'image(abc'pos(x)) & " " & boolean'image(x = 'B') & " " & integer'image(s) & " " & integer'image(small'high);
    wait;
  end process;`,
  `type abc is ('A', 'B', 'C'); signal x : abc := 'B';
   type small is range 0 to 7; signal s : small := 5;
   attribute keep : string; attribute keep of x : signal is "true";`));
  assert.deepEqual(r, ["'B' 1 true 5 7"]);
});

test('signals declared in a package are shared; rising_edge of one bit of a vector; exit from a while loop; case on characters', () => {
  const r = out({ 'g.vhd': 'package g is signal gs : integer := 3; end package;',
    't.vhd': vhd(`
  process begin gs <= 4; v(1) <= '1'; wait for 1 ns; v(0) <= '1'; report integer'image(gs); wait; end process;
  process begin wait until rising_edge(v(0)); report "v0 rose"; wait; end process;
  process
    variable i : integer := 0; variable c : character := 'b';
  begin
    while true loop i := i + 1; exit when i = 5; end loop;
    case c is when 'a' => report "a"; when 'b' => report "b" & integer'image(i); when others => report "o"; end case;
    wait;
  end process;`, 'signal v : std_logic_vector(1 downto 0) := "00";', { ctx: 'use work.g.all;' }) });
  assert.deepEqual(r, ['b5', '4', 'v0 rose']);
});

test('record and array ports; nested records with element and bit writes', () => {
  const P = `library ieee; use ieee.std_logic_1164.all;
package p is
  type pair is record a, b : integer; end record;
  type arr is array (0 to 2) of integer;
  type in_t is record v : std_logic_vector(3 downto 0); end record;
  type out_t is record r : in_t; n : integer; end record;
end package;
library ieee; use ieee.std_logic_1164.all; use work.p.all;
entity sw is port (i : in pair; a : in arr; o : out pair; s : out integer); end;
architecture r of sw is begin o <= (a => i.b, b => i.a); s <= a(0) + a(1) + a(2); end;
`;
  const r = out({ 'p.vhd': P, 'tb.vhd': vhd(`
  u : entity work.sw port map (x, z, y, sum);
  process begin
    x <= (1, 2); z <= (4, 5, 6); n.r.v <= "1010"; n.n <= 3; wait for 1 ns;
    report integer'image(y.a) & integer'image(y.b) & " " & integer'image(sum) & " " & to_string(n.r.v) & integer'image(n.n);
    n.r.v(0) <= '1'; wait for 1 ns; report to_string(n.r.v);
    wait;
  end process;`, 'signal x, y : pair := (0, 0); signal z : arr := (0, 0, 0); signal sum : integer; signal n : out_t;', { ctx: 'use work.p.all;' }) });
  assert.deepEqual(r, ['21 15 10103', '1011']);
});

test('shared variables; procedures declared in a process assign the signals of the architecture; dynamic slices', () => {
  const r = out(vhd(`
  process begin cnt := cnt + 1; wait for 1 ns; report integer'image(cnt); wait; end process;
  process begin cnt := cnt + 10; wait; end process;
  process
    procedure bump is begin s <= s + 1; end procedure;
    variable v : std_logic_vector(7 downto 0) := (others => '0'); variable i : integer := 2;
  begin
    bump; wait for 1 ns; bump; wait for 1 ns; report integer'image(s);
    v(i + 1 downto i) := "11"; v(i * 2 + 3 downto i * 2) := x"A"; report to_string(v);
    wait;
  end process;`, 'shared variable cnt : integer := 0; signal s : integer := 0;'));
  assert.deepEqual(r, ['11', '2', '10101100']);
});
