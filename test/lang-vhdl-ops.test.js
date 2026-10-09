// VHDL conformance: operators per type (IEEE 1076-2008 §9.2, IEEE 1164, IEEE 1076.3 numeric_std,
// Synopsys std_logic_arith / std_logic_unsigned / std_logic_signed).
// Each test is a tiny testbench; the expected values are the ones the standard defines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { out, vproc, vhd } from './lang-util.js';

const img = e => `std_logic'image(${e})`;

test('std_logic logical operators (IEEE 1164 tables, known values)', () => {
  const r = out(vproc(`
    report ${img("'1' and '1'")} & ${img("'1' and '0'")} & ${img("'0' and 'X'")} & ${img("'1' and 'X'")};
    report ${img("'0' or '0'")} & ${img("'1' or 'X'")} & ${img("'0' or 'X'")} & ${img("'1' or '0'")};
    report ${img("'1' xor '1'")} & ${img("'1' xor '0'")} & ${img("'0' xor 'X'")};
    report ${img("'1' nand '1'")} & ${img("'0' nand 'X'")} & ${img("'1' nor '0'")} & ${img("'0' nor '0'")};
    report ${img("'1' xnor '1'")} & ${img("'1' xnor '0'")};
    report ${img("not '0'")} & ${img("not '1'")} & ${img("not 'X'")};
    -- weak values behave like their strong counterparts in logic operations
    report ${img("'H' and 'H'")} & ${img("'L' or 'L'")} & ${img("'H' xor 'L'")} & ${img("not 'L'")};
    -- 'Z' and '-' read as unknown
    report ${img("'1' and 'Z'")} & ${img("'0' and 'Z'")} & ${img("'1' or 'Z'")} & ${img("not 'Z'")};`));
  assert.deepEqual(r, [
    "'1''0''0''X'", "'0''1''X''1'", "'0''1''X'", "'0''1''0''1'", "'1''0'", "'1''0''X'",
    "'1''0''1''1'", "'X''0''1''X'",
  ]);
});

test('std_logic_vector logical operators are bitwise; to_string', () => {
  const r = out(vproc(`
    report to_string(a and b); report to_string(a or b); report to_string(a xor b);
    report to_string(a nand b); report to_string(a nor b); report to_string(a xnor b);
    report to_string(not a);
    report to_string(a(3 downto 2) & b(1 downto 0));
    report to_string(a and "1X10");`,
  `variable a : std_logic_vector(3 downto 0) := "1100"; variable b : std_logic_vector(3 downto 0) := "1010";`));
  assert.deepEqual(r, ['1000', '1110', '0110', '0111', '0001', '1001', '0011', '1110', '1X00']);
});

test('VHDL-2008 reduction operators and scalar-vector logical ops', () => {
  const r = out(vproc(`
    report ${img('and a')} & ${img('or a')} & ${img('xor a')} & ${img('nand a')} & ${img('nor a')} & ${img('xnor a')};
    report ${img('and b')} & ${img('or z')} & ${img('xor b')};`,
  `variable a : std_logic_vector(3 downto 0) := "1101"; variable b : std_logic_vector(2 downto 0) := "111";
   variable z : std_logic_vector(2 downto 0) := "000";`));
  assert.deepEqual(r, ["'0''1''1''1''0''0'", "'1''0''1'"]);
});

test('std_logic relational operators: = /= compare exactly; ordering of the enumeration', () => {
  const r = out(vproc(`
    report boolean'image(a = '1') & boolean'image(a /= '0') & boolean'image(x = 'X') & boolean'image(x = '0');
    report boolean'image(v = "1010") & boolean'image(v /= "1011") & boolean'image(v = "101");
    report boolean'image(v < "1011") & boolean'image(v > "0111") & boolean'image(string'("abc") < "abd");`,
  `variable a : std_logic := '1'; variable x : std_logic := 'X'; variable v : std_logic_vector(3 downto 0) := "1010";`));
  // vectors of different lengths are never equal; arrays compare lexicographically (§9.2.3)
  assert.deepEqual(r, ['truetruetruefalse', 'truetruefalse', 'truetruetrue']);
});

test('boolean operators, short-circuit and/or', () => {
  const r = out(vproc(`
    report boolean'image(t and f) & boolean'image(t or f) & boolean'image(t xor t) & boolean'image(not f);
    report boolean'image(t nand t) & boolean'image(f nor f) & boolean'image(t xnor f);
    -- short-circuit: the right operand is not evaluated (it would divide by zero)
    report boolean'image(f and (10 / z = 1)) & boolean'image(t or (10 / z = 1));
    report boolean'image(f < t) & boolean'image(boolean'high) & boolean'image(boolean'left);`,
  `variable t : boolean := true; variable f : boolean := false; variable z : integer := 0;`));
  assert.deepEqual(r, ['falsetruefalsetrue', 'falsetruefalse', 'falsetrue', 'truetruefalse']);
});

test('bit and bit_vector operators, shifts sll srl sla sra rol ror (§9.2.4)', () => {
  const r = out(vproc(`
    report to_string(v sll 1) & " " & to_string(v srl 1) & " " & to_string(v sla 1) & " " & to_string(v sra 1);
    report to_string(v rol 1) & " " & to_string(v ror 1) & " " & to_string(v rol 5) & " " & to_string(v sll 0);
    report to_string(v sll -1) & " " & to_string(v ror -1) & " " & to_string(v srl 7);
    report to_string(v and "0110") & " " & bit'image(b xor '1') & " " & to_string(not v);`,
  `variable v : bit_vector(3 downto 0) := "1001"; variable b : bit := '0';`));
  // sla/sra replicate the rightmost/leftmost bit; a negative count shifts the other way
  assert.deepEqual(r, ['0010 0100 0011 1100', '0011 1100 0011 1001', '0100 0011 0000', "0000 '1' 0110"]);
});

test('integer arithmetic: + - * / mod rem abs ** and division rounding toward zero', () => {
  const r = out(vproc(`
    report integer'image(7 + 3) & " " & integer'image(7 - 10) & " " & integer'image(-7 * 3);
    report integer'image(7 / 2) & " " & integer'image((-7) / 2) & " " & integer'image(7 / (-2));
    report integer'image(7 mod 3) & " " & integer'image((-7) mod 3) & " " & integer'image(7 mod (-3)) & " " & integer'image((-7) mod (-3));
    report integer'image(7 rem 3) & " " & integer'image((-7) rem 3) & " " & integer'image(7 rem (-3)) & " " & integer'image((-7) rem (-3));
    report integer'image(abs (-5)) & " " & integer'image(2 ** 10) & " " & integer'image(-2 ** 3) & " " & integer'image(+4);
    report integer'image(integer'high) & " " & integer'image(integer'low) & " " & integer'image(natural'low) & " " & integer'image(positive'low);
    report integer'image(16#FF#) & " " & integer'image(2#1010_1010#) & " " & integer'image(8#17#) & " " & integer'image(1E3);`));
  assert.deepEqual(r, [
    '10 -3 -21', '3 -3 -3', '1 2 -2 -1', '1 -1 1 -1', '5 1024 -8 4',
    '2147483647 -2147483648 0 1', '255 170 15 1000',
  ]);
});

test('integer relational operators and precedence (** > abs/not > * / > unary +- > + - & > shifts > relational > logical)', () => {
  const r = out(vproc(`
    report boolean'image(3 < 4) & boolean'image(3 <= 3) & boolean'image(4 > 4) & boolean'image(4 >= 4) & boolean'image(3 = 3) & boolean'image(3 /= 3);
    report integer'image(2 + 3 * 4) & " " & integer'image((2 + 3) * 4) & " " & integer'image(2 * 3 ** 2) & " " & integer'image(10 - 4 - 3);
    report integer'image(-3 mod 5) & " " & integer'image(100 / 10 / 5);`));
  // unary minus binds looser than mod: -3 mod 5 = -(3 mod 5) = -3
  assert.deepEqual(r, ['truetruefalsetruetruefalse', '14 20 18 3', '-3 2']);
});

test('numeric_std unsigned arithmetic: widths, wrap-around, mixed with natural', () => {
  const r = out(vproc(`
    s := a + b; report to_string(s) & " " & integer'image(to_integer(s));
    s := a - b; report to_string(s);
    s := b - a; report to_string(s);
    s := a + 1; report to_string(s);
    s := 3 + a; report to_string(s);
    p := a * b; report to_string(p) & " " & integer'image(to_integer(p));
    s := a / b; report to_string(s);
    s := a mod b; report to_string(s);
    s := a rem b; report to_string(s);
    w := resize(a, 8) + resize(b, 8); report to_string(w);
    report boolean'image(a > b) & boolean'image(a = 12) & boolean'image(b < 11) & boolean'image(a >= "01100");`,
  `variable a : unsigned(3 downto 0) := "1100"; variable b : unsigned(3 downto 0) := "1010";
   variable s : unsigned(3 downto 0); variable p : unsigned(7 downto 0); variable w : unsigned(7 downto 0);`));
  assert.deepEqual(r, [
    '0110 6', '0010', '1110', '1101', '1111', '01111000 120', '0001', '0010', '0010', '00010110',
    'truetruetruetrue',
  ]);
});

test('numeric_std signed arithmetic, abs, unary minus, division and mod signs', () => {
  const r = out(vproc(`
    report integer'image(to_integer(a + b)) & " " & integer'image(to_integer(a - b)) & " " & integer'image(to_integer(a * b));
    report integer'image(to_integer(a / b)) & " " & integer'image(to_integer(a rem b)) & " " & integer'image(to_integer(a mod b));
    report integer'image(to_integer(-a)) & " " & integer'image(to_integer(abs a)) & " " & to_string(-a);
    report boolean'image(a < b) & boolean'image(a < 0) & boolean'image(b > -1) & boolean'image(a = -6);
    report to_string(to_signed(-1, 5)) & " " & to_string(to_signed(5, 4)) & " " & integer'image(to_integer(signed'("1000")));`,
  `variable a : signed(3 downto 0) := to_signed(-6, 4); variable b : signed(3 downto 0) := to_signed(4, 4);`));
  // -6 + 4 = -2; -6 - 4 = -10 wraps to 6 in 4 bits; -6 * 4 = -24 (8-bit product)
  // -6 / 4 = -1 (truncation); -6 rem 4 = -2; -6 mod 4 = 2
  assert.deepEqual(r, ['-2 6 -24', '-1 -2 2', '6 6 0110', 'truetruetruetrue', '11111 0101 -8']);
});

test('numeric_std shifts and rotates: shift_left/right (signed shift_right is arithmetic), sll/srl/rol/ror', () => {
  const r = out(vproc(`
    report to_string(shift_left(u, 1)) & " " & to_string(shift_right(u, 1)) & " " & to_string(rotate_left(u, 1)) & " " & to_string(rotate_right(u, 1));
    report to_string(shift_left(s, 1)) & " " & to_string(shift_right(s, 2)) & " " & to_string(rotate_right(s, 1));
    report to_string(u sll 2) & " " & to_string(u srl 2) & " " & to_string(u rol 2) & " " & to_string(u ror 3);
    report to_string(s srl 1) & " " & to_string(shift_right(u, 9));`,
  `variable u : unsigned(3 downto 0) := "1011"; variable s : signed(3 downto 0) := "1001";`));
  assert.deepEqual(r, ['0110 0101 0111 1101', '0010 1110 1100', '1100 0010 1110 0111', '0100 0000']);
});

test('numeric_std conversions: to_unsigned / to_signed / to_integer / resize / std_logic_vector casts', () => {
  const r = out(vproc(`
    report to_string(to_unsigned(13, 4)) & " " & to_string(to_unsigned(13, 6)) & " " & to_string(to_signed(-3, 4));
    report integer'image(to_integer(unsigned'("1111"))) & " " & integer'image(to_integer(signed'("1111")));
    report to_string(resize(unsigned'("1011"), 6)) & " " & to_string(resize(signed'("1011"), 6)) & " " & to_string(resize(unsigned'("101101"), 3));
    report to_string(resize(signed'("011011"), 4)) & " " & to_string(resize(signed'("100111"), 3));
    slv := std_logic_vector(to_unsigned(9, 4)); report to_string(slv);
    report integer'image(to_integer(unsigned(slv))) & " " & integer'image(to_integer(signed(slv)));
    report to_string(unsigned(slv) + 1) & " " & to_string(std_logic_vector(signed(slv) - 1));`,
  `variable slv : std_logic_vector(3 downto 0);`));
  // resize of signed keeps the sign bit and the low bits (numeric_std RESIZE)
  assert.deepEqual(r, ['1101 001101 1101', '15 -1', '001011 111011 101', '0011 111', '1001', '9 -7', '1010 1000']);
});

test('numeric_std std_match and comparisons of different widths', () => {
  const r = out(vproc(`
    report boolean'image(std_match(a, "1-0-")) & boolean'image(std_match(a, "0---")) & boolean'image(std_match('1', '-'));
    report boolean'image(unsigned'("0011") = unsigned'("11")) & boolean'image(unsigned'("100") > unsigned'("0011"));
    report boolean'image(signed'("1111") < signed'("01")) & boolean'image(signed'("1111") = to_signed(-1, 8));`,
  `variable a : std_logic_vector(3 downto 0) := "1100";`));
  // numeric_std compares numerically, regardless of widths
  assert.deepEqual(r, ['truefalsetrue', 'truetrue', 'truetrue']);
});

test('std_logic_arith + std_logic_unsigned: arithmetic on std_logic_vector, conv_integer / conv_std_logic_vector', () => {
  const src = `library ieee; use ieee.std_logic_1164.all; use ieee.std_logic_arith.all; use ieee.std_logic_unsigned.all;
entity tb is end;
architecture sim of tb is begin
  process
    variable a : std_logic_vector(3 downto 0) := "1100";
    variable b : std_logic_vector(3 downto 0) := "0101";
    variable s : std_logic_vector(3 downto 0);
    variable u : unsigned(3 downto 0);
  begin
    s := a + b; report integer'image(conv_integer(s));
    s := a - b; report integer'image(conv_integer(s));
    s := a + 1; report integer'image(conv_integer(s));
    s := conv_std_logic_vector(10, 4); report integer'image(conv_integer(s));
    report boolean'image(a > b) & boolean'image(a = 12) & boolean'image(b < 6);
    u := conv_unsigned(7, 4); report integer'image(conv_integer(u));
    s := a(2 downto 0) & '1'; report integer'image(conv_integer(s));
    wait;
  end process;
end;`;
  assert.deepEqual(out(src), ['1', '7', '13', '10', 'truetruetrue', '7', '9']);
});

test('std_logic_signed: std_logic_vector arithmetic and conv_integer are signed', () => {
  const src = `library ieee; use ieee.std_logic_1164.all; use ieee.std_logic_arith.all; use ieee.std_logic_signed.all;
entity tb is end;
architecture sim of tb is begin
  process
    variable a : std_logic_vector(3 downto 0) := "1100";
    variable b : std_logic_vector(3 downto 0) := "0101";
  begin
    report integer'image(conv_integer(a)) & " " & integer'image(conv_integer(a + b)) & " " & boolean'image(a < b);
    wait;
  end process;
end;`;
  assert.deepEqual(out(src), ['-4 1 true']);
});

test('enumeration types: relational operators, \'pos \'val \'succ \'pred \'leftof \'rightof \'image \'value', () => {
  const r = out(vproc(`
    report boolean'image(s < c) & boolean'image(c > b) & boolean'image(s = idle) & boolean'image(c /= done);
    report integer'image(state_t'pos(c)) & " " & state_t'image(state_t'val(2)) & " " & state_t'image(state_t'succ(s)) & " " & state_t'image(state_t'pred(c));
    report state_t'image(state_t'left) & " " & state_t'image(state_t'right) & " " & state_t'image(state_t'high) & " " & state_t'image(state_t'low);
    report state_t'image(state_t'leftof(c)) & " " & state_t'image(state_t'rightof(c)) & " " & state_t'image(state_t'value("done"));
    report integer'image(integer'value("42")) & " " & boolean'image(boolean'value("true")) & " " & integer'image(natural'succ(4)) & " " & integer'image(integer'pred(0));`,
  `variable s : state_t := idle; variable c : state_t := run; variable b : state_t := busy;`,
  `type state_t is (idle, busy, run, done);`));
  assert.deepEqual(r, [
    'truetruetruetrue', '2 run busy busy', 'idle done done idle', 'busy done done', '42 true 5 -1',
  ]);
});

test('predefined type CHARACTER: \'pos \'val \'image, string indexing', { todo: 'type CHARACTER and string indexing are not implemented (strings are opaque values)' }, () => {
  const r = out(vproc(`
    report integer'image(character'pos('A')) & " " & character'image(character'val(66)) & " " & character'image(s(2));`,
  `variable s : string(1 to 3) := "xyz";`));
  assert.deepEqual(r, ["65 'B' 'y'"]);
});

test('concatenation: element & element, array & element, of strings and vectors', () => {
  const r = out(vproc(`
    v := '1' & '0' & "01"; report to_string(v);
    v := "11" & "00"; report to_string(v);
    s := "ab" & 'c' & "de"; report s;
    w := a & b; report to_string(w) & " " & integer'image(w'length);`,
  `variable v : std_logic_vector(3 downto 0); variable s : string(1 to 5);
   variable a : unsigned(2 downto 0) := "101"; variable b : unsigned(1 downto 0) := "10"; variable w : unsigned(4 downto 0);`));
  assert.deepEqual(r, ['1001', '1100', 'abcde', '10110 5']);
});

test('physical type time: arithmetic, comparisons, division, conversion to integer', () => {
  const r = out(vproc(`
    t := 5 ns + 300 ps; report integer'image(t / 1 ps);
    t := 3 * 2 ns; report integer'image(t / 1 ps);
    t := 10 ns / 4; report integer'image(t / 1 ps);
    report integer'image(20 ns / 1 ns) & " " & integer'image(1 us / 1 ns) & " " & boolean'image(1 ns > 999 ps);
    report integer'image(abs (-2 ns) / 1 ps) & " " & integer'image((2 ns - 3 ns) / 1 ps) & " " & integer'image(2 ms / 1 us);`,
  `variable t : time;`));
  assert.deepEqual(r, ['5300', '6000', '2500', '20 1000 true', '2000 -1000 2000']);
});

test('VHDL and Verilog agree on unsigned/signed arithmetic of equal-width operands', () => {
  const vh = out(vproc(`
    report integer'image(to_integer(a + b)) & " " & integer'image(to_integer(a - b)) & " " & integer'image(to_integer(sa * sb)) & " " & integer'image(to_integer(sa / sb));`,
  `variable a : unsigned(7 downto 0) := to_unsigned(200, 8); variable b : unsigned(7 downto 0) := to_unsigned(100, 8);
   variable sa : signed(7 downto 0) := to_signed(-100, 8); variable sb : signed(7 downto 0) := to_signed(7, 8);`));
  const vl = out(`module tb; reg [7:0] a = 200, b = 100, s, d; reg signed [7:0] sa = -100, sb = 7, q; reg signed [15:0] p;
initial begin s = a + b; d = a - b; p = sa * sb; q = sa / sb; $display("%0d %0d %0d %0d", s, d, p, q); end
endmodule`);
  assert.deepEqual(vh, ['44 100 -700 -14']);
  assert.deepEqual(vl, vh);
});
