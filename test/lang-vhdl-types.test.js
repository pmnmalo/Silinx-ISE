// VHDL conformance: types and objects — integer subtypes, enumerations, arrays (1-D, arrays of
// vectors, 2-D), records, constants, aliases and the predefined attributes (IEEE 1076-2008 §5, §16.2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { out, vproc, vhd, sim } from './lang-util.js';

test('integer, natural, positive and ranged subtypes: defaults are the left bound', () => {
  const r = out(vproc(`
    report integer'image(i) & " " & integer'image(n) & " " & integer'image(p) & " " & integer'image(r) & " " & integer'image(d);
    report integer'image(small'low) & " " & integer'image(small'high) & " " & integer'image(small'right);`,
  `variable i : integer; variable n : natural; variable p : positive; variable r : small; variable d : integer range 10 downto -3;`,
  `subtype small is integer range 3 to 9;`));
  // the default value of a scalar object is T'left (§6.4.2.3)
  assert.deepEqual(r, ['-2147483648 0 1 3 10', '3 9 9']);
});

test('enumeration types: default is the first literal; case on an enumeration; enum signal events', () => {
  const r = out(vhd(`
  process begin
    report state_t'image(s);
    s <= b; wait for 1 ns; report state_t'image(s);
    s <= state_t'succ(s); wait for 1 ns; report state_t'image(s);
    wait;
  end process;
  process(s) begin
    case s is
      when a => n <= n + 1;
      when b | c => n <= n + 10;
    end case;
  end process;
  process begin wait for 5 ns; report integer'image(n); wait; end process;`,
  `type state_t is (a, b, c); signal s : state_t; signal n : integer := 0;`));
  // the case process runs at time 0 (s = a) and after each of the two changes
  assert.deepEqual(r, ['a', 'b', 'c', '21']);
});

test('constrained arrays: indexing with to and downto ranges, slices, \'left \'right \'low \'high \'length \'range \'reverse_range', () => {
  const r = out(vproc(`
    report std_logic'image(d(7)) & std_logic'image(d(0)) & std_logic'image(u(0)) & std_logic'image(u(7));
    report to_string(d(7 downto 4)) & " " & to_string(u(0 to 3));
    report integer'image(d'left) & integer'image(d'right) & integer'image(d'low) & integer'image(d'high) & integer'image(d'length);
    report integer'image(u'left) & integer'image(u'right) & integer'image(u'low) & integer'image(u'high) & integer'image(u'length);
    for i in d'range loop s := s & integer'image(i); end loop;
    report s; s := "";
    for i in d'reverse_range loop s := s & integer'image(i); end loop;
    report s;
    report boolean'image(d'ascending) & boolean'image(u'ascending);`,
  `variable d : std_logic_vector(7 downto 0) := "10000001"; variable u : std_logic_vector(0 to 7) := "10000000";
   variable s : string(1 to 0);`));
  assert.deepEqual(r, [
    "'1''1''1''0'", '1000 1000', '70078', '07078', '76543210', '01234567', 'falsetrue',
  ]);
});

test('arrays of vectors (memories): element read/write, element bit and slice, aggregates with others', () => {
  const r = out(vproc(`
    m(2) := x"A5"; m(3)(0) := '1'; m(3)(7 downto 4) := "1100";
    report to_hstring(m(0)) & " " & to_hstring(m(1)) & " " & to_hstring(m(2)) & " " & to_hstring(m(3));
    report std_logic'image(m(2)(7)) & " " & to_string(m(2)(3 downto 0)) & " " & integer'image(m'length) & " " & integer'image(m(0)'length);
    for i in m'range loop m(i) := std_logic_vector(to_unsigned(i * 3, 8)); end loop;
    report to_hstring(m(0)) & to_hstring(m(1)) & to_hstring(m(2)) & to_hstring(m(3));`,
  `variable m : mem_t := (0 => x"11", 1 => x"22", others => x"00");`,
  `type mem_t is array (0 to 3) of std_logic_vector(7 downto 0);`));
  assert.deepEqual(r, ['11 22 A5 C1', "'1' 0101 4 8", '00030609']);
});

test('array signals: element assignments from different processes, signal arrays of integers', () => {
  const r = out(vhd(`
  process begin a(0) <= 5; wait for 1 ns; a(0) <= a(0) + a(1); wait; end process;
  process begin a(1) <= 7; wait; end process;
  process begin wait for 2 ns; report integer'image(a(0)) & " " & integer'image(a(1)) & " " & integer'image(a(2)); wait; end process;`,
  `type int_arr is array (0 to 2) of integer; signal a : int_arr := (others => 0);`));
  assert.deepEqual(r, ['12 7 0']);
});

test('array equality and assignment copy whole arrays', () => {
  const r = out(vproc(`
    b := a; b(1) := 9;
    report boolean'image(a = b) & " " & integer'image(a(1)) & " " & integer'image(b(1));
    b(1) := 2; report boolean'image(a = b) & boolean'image(a /= b);`,
  `variable a : arr := (1, 2, 3); variable b : arr;`, `type arr is array (0 to 2) of integer;`));
  assert.deepEqual(r, ['false 2 9', 'truefalse']);
});

test('2-D arrays: element access and loops over both dimensions', () => {
  const r = out(vproc(`
    for i in 0 to 1 loop for j in 0 to 2 loop m(i, j) := i * 10 + j; end loop; end loop;
    report integer'image(m(1, 2)) & " " & integer'image(m(0, 1)) & " " & integer'image(m'length(2));`,
  `variable m : mat;`, `type mat is array (0 to 1, 0 to 2) of integer;`));
  assert.deepEqual(r, ['12 1 3']);
});

test('arrays of arrays (array of an array type): element-of-element access', () => {
  const r = out(vproc(`
    g(1)(2) := 7; g(0) := (4, 5, 6);
    report integer'image(g(1)(2)) & " " & integer'image(g(0)(0)) & " " & integer'image(g(1)(0));`,
  `variable g : grid := (others => (others => 0));`,
  `type row is array (0 to 2) of integer; type grid is array (0 to 1) of row;`));
  assert.deepEqual(r, ['7 4 0']);
});

test('records: field read/write, aggregate (positional and named), record signals and equality', () => {
  const r = out(vhd(`
  process
    variable v : pkt_t := (x"01", 3, '1');
  begin
    report to_hstring(v.data) & " " & integer'image(v.len) & " " & std_logic'image(v.valid);
    v.len := v.len + 1; v.data(7) := '1';
    report to_hstring(v.data) & " " & integer'image(v.len);
    s <= v; wait for 1 ns;
    report to_hstring(s.data) & " " & boolean'image(s = v);
    s.valid <= '0'; wait for 1 ns;
    report std_logic'image(s.valid) & " " & boolean'image(s = v);
    v := (data => x"FF", len => 0, valid => '0');
    report to_hstring(v.data) & integer'image(v.len);
    wait;
  end process;`,
  `type pkt_t is record data : std_logic_vector(7 downto 0); len : integer; valid : std_logic; end record;
   signal s : pkt_t;`));
  assert.deepEqual(r, ["01 3 '1'", '81 4', '81 true', "'0' false", 'FF0']);
});

test('arrays of records', () => {
  const r = out(vproc(`
    t(1).a := 5; t(1).b := "11";
    report integer'image(t(0).a) & " " & integer'image(t(1).a) & " " & to_string(t(1).b);`,
  `variable t : tab_t;`,
  `type rec is record a : integer; b : std_logic_vector(1 downto 0); end record;
   type tab_t is array (0 to 1) of rec;`));
  assert.deepEqual(r, ['-2147483648 5 11']);
});

test('constants: scalar, vector, array, computed from other constants and functions', () => {
  const r = out(vproc(`
    report integer'image(W) & " " & integer'image(D) & " " & to_string(ONES) & " " & integer'image(TAB(2)) & " " & integer'image(SQ);`,
  '',
  `constant W : integer := 4; constant D : natural := 2 ** W - 1;
   constant ONES : std_logic_vector(W - 1 downto 0) := (others => '1');
   type tab is array (0 to 3) of integer; constant TAB : tab := (10, 20, 30, 40);
   function sq(x : integer) return integer is begin return x * x; end function;
   constant SQ : integer := sq(W + 1);`));
  assert.deepEqual(r, ['4 15 1111 30 25']);
});

test('aliases of signals, slices and variables', () => {
  const r = out(vhd(`
  process
    variable v : std_logic_vector(7 downto 0) := x"3C";
    alias vh : std_logic_vector(3 downto 0) is v(7 downto 4);
  begin
    vh := "1010"; report to_hstring(v);
    hi <= "0110"; wait for 1 ns; report to_hstring(w);
    wait;
  end process;`,
  `signal w : std_logic_vector(7 downto 0) := x"00"; alias hi : std_logic_vector(3 downto 0) is w(7 downto 4);`));
  assert.deepEqual(r, ['AC', '60']);
});

test("signal attributes: 'event 'last_value 'stable 'last_event 'stable(T)", () => {
  const r = out(vhd(`
  process begin
    s <= '1'; wait for 0 ns;
    report boolean'image(s'event) & " " & std_logic'image(s'last_value) & " " & boolean'image(s'stable);
    wait for 1 ns;
    report boolean'image(s'event) & " " & boolean'image(s'stable);
    wait for 2 ns;
    report integer'image(s'last_event / 1 ps) & " " & boolean'image(s'stable(2 ns)) & " " & boolean'image(s'stable(5 ns));
    wait;
  end process;`, `signal s : std_logic := '0';`));
  assert.deepEqual(r, ["true '0' false", 'false true', '3000 true false']);
});

test("signal attributes 'delayed(T), 'transaction, 'quiet(T), 'active", { todo: "implicit signals 'delayed, 'transaction, 'quiet and 'active are not implemented" }, () => {
  const r = out(vhd(`
  d <= s'delayed(2 ns);
  process begin
    s <= '1'; wait for 0 ns;
    report boolean'image(s'active) & " " & boolean'image(s'quiet(1 ns)) & " " & std_logic'image(d);
    wait for 3 ns; report std_logic'image(d) & " " & bit'image(s'transaction);
    wait;
  end process;`, `signal s, d : std_logic := '0';`));
  assert.deepEqual(r, ["true false '0'", "'1' '1'"]);
});

test("'image of integers, booleans, enumerations and std_logic", () => {
  const r = out(vproc(`
    report integer'image(-42) & "|" & boolean'image(false) & "|" & e_t'image(two) & "|" & std_logic'image('Z');`,
  '', `type e_t is (one, two);`));
  assert.deepEqual(r, ["-42|false|two|'Z'"]);
});
