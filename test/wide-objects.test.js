// Objects too large (#3555): only an array type's number of elements was limited (4M), not a vector's width nor an
// array's bits, so a source of a few hundred bytes ended the process: `(others => a)` on a vector of a thousand million
// bits (built one entry per bit), array types nested 40 levels deep, a Verilog replication {4000000000{a}} (thrown out
// of elaborate). An object's bits are limited to MAX_BITS (a vector, an array's elements times their width, a record,
// a string, an expression's result) and an array's elements, those of every level of an array of arrays, to
// MAX_ELEMENTS; past either, one error of the file at the declaration or the expression, before anything is made.
// At the limits, in VHDL and Verilog: Check Syntax's exact warnings, the simulation's values, the synthesis input with
// no warnings; one past them and the issue's cases, the exact errors, at once. A vector aggregate's bits and a
// replication are built by runs, a literal's bits at once: checked against the bit-by-bit forms they replace.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { synthesisInput } from '../core/synth-front.js';
import * as V from '../core/values.js';
import { MAX_BITS, MAX_ELEMENTS } from '../packages/silinx-hdl/src/util.js';

const LIB = 'library ieee;\nuse ieee.std_logic_1164.all;\n';
const wide = (what, n) => `${what} is ${n} bits wide, more than the limit of ${MAX_BITS} bits`;

// Check Syntax: the library's errors, the elaboration's, the design checks (with the lint)
function checkSyntax(path, text, top = 't') {
  const lib = compile([{ path, text }]);
  const d = elaborate(lib, top);
  const diags = [...lib.errors, ...d.diags];
  const all = diags.some(e => e.severity === 'error') ? diags : [...diags, ...designChecks(lib, d, { lint: true })];
  return all.map(e => `${e.line ? `${e.line}:${e.col} ` : ''}${e.severity}: ${e.message}`);
}
const timed = f => { const t0 = Date.now(); const r = f(); return [r, Date.now() - t0]; };

test('#3555 the limits: above the repository\'s largest object (40 960 bits, 4096 elements), below what exhausts memory', () => {
  assert.equal(MAX_BITS, 2 ** 24);
  assert.equal(MAX_ELEMENTS, 2 ** 22);
});

// a vector MAX_BITS wide, all its bits an input's (the issue's (others => a))
const vhdlVec = n => `${LIB}entity t is port (a : in std_logic; y : out std_logic_vector(1 downto 0)); end t;\narchitecture x of t is\n  signal s : std_logic_vector(${n - 1} downto 0);\nbegin\n  s <= (others => a);\n  y <= s(${n - 1}) & s(0);\nend x;\n`;
const vlogVec = n => `module t(input a, output [1:0] y);\n  wire [${n - 1}:0] s = {${n}{a}};\n  assign y = {s[${n - 1}], s[0]};\nendmodule\n`;

for (const [lang, path, make] of [['VHDL', 't.vhd', vhdlVec], ['Verilog', 't.v', vlogVec]]) {
  test(`#3555 ${lang}: a vector ${MAX_BITS} bits wide, every bit an input's: no warnings, its synthesis input, at once`, () => {
    const [diags, ms] = timed(() => checkSyntax(path, make(MAX_BITS)));
    assert.deepEqual(diags, []);
    assert.ok(ms < 10000, `${ms} ms`);
    const { text, warnings } = synthesisInput(elaborate(compile([{ path, text: make(MAX_BITS) }]), 't'));
    assert.deepEqual(warnings, []);
    assert.match(text, new RegExp(`\\{${MAX_BITS}\\{a\\}\\}`));
  });
}

test(`#3555 VHDL: (others => a) on a vector ${MAX_BITS} bits wide simulated; one bit more and the issue's 1000M, the error at the declaration`, () => {
  const tb = n => `${LIB}entity t is end t;\narchitecture x of t is\n  signal a : std_logic := '1';\n  signal s : std_logic_vector(${n - 1} downto 0);\nbegin\n  s <= (others => a);\n  process begin\n    wait for 1 ns; report std_logic'image(s(${n - 1})) & std_logic'image(s(0));\n    a <= '0'; wait for 1 ns; report std_logic'image(s(${n - 1})) & std_logic'image(s(0)); wait;\n  end process;\nend x;\n`;
  const [r, ms] = timed(() => simulate([{ path: 't.vhd', text: tb(MAX_BITS) }], 't'));
  assert.deepEqual([r.errors, r.sim.log.map(l => `${l.kind}: ${l.text}`)], [[], ["note: '1''1'", "note: '0''0'"]]);
  assert.ok(ms < 10000, `${ms} ms`);
  for (const n of [MAX_BITS + 1, 1e9]) {
    const [diags, t] = timed(() => checkSyntax('t.vhd', vhdlVec(n)));
    assert.deepEqual(diags, [`5:3 error: ${wide('the type', n)}`, "7:3 error: 's' is not declared", "8:3 error: 's' is not declared"]);
    assert.ok(t < 2000, `${t} ms`);
    assert.equal(simulate([{ path: 't.vhd', text: tb(n) }], 't').errors[0].message, wide('the type', n));
  }
});

test('#3555 Verilog: a replication or a concatenation past the limit, the issue\'s {4000000000{a}}: the error at the expression, never thrown', () => {
  const cases = [
    [`{${MAX_BITS + 1}{a}}`, MAX_BITS + 1], ['{4000000000{a}}', 4e9], ["{4000000000{1'b1}}", 4e9],
    [`{{${MAX_BITS / 2}{a}}, {${MAX_BITS / 2 + 1}{a}}}`, MAX_BITS + 1],
  ];
  for (const [e, n] of cases) {
    const text = `module t(input a, output [3:0] y);\n  assign y = ${e};\nendmodule\n`;
    const [diags, ms] = timed(() => checkSyntax('t.v', text));
    assert.deepEqual(diags, [`2:10 error: ${wide('the expression', n)}`], e);
    assert.ok(ms < 2000, `${ms} ms`);
    assert.equal(simulate([{ path: 't.v', text }], 't').errors[0].message, wide('the expression', n));
  }
  // (at the limit: the replication simulated)
  const tb = `module t;\n  reg a = 1;\n  wire [${MAX_BITS - 1}:0] s = {${MAX_BITS}{a}};\n  initial begin #1 $display("%b%b", s[${MAX_BITS - 1}], s[0]); a = 0; #1 $display("%b%b", s[${MAX_BITS - 1}], s[0]); end\nendmodule\n`;
  const r = simulate([{ path: 't.v', text: tb }], 't');
  assert.deepEqual([r.errors, r.sim.log.map(l => l.text)], [[], ['11', '00']]);
});

test('#3555 declarations past the limits: a vector, an array\'s bits, its elements, nested arrays (the issue\'s 40 levels), a string', () => {
  // VHDL: array types nested, each of two elements of the one before: 21 levels are 2**22 - 2 elements in all
  const nested = (levels, signal) => `entity t is end t;\narchitecture x of t is\n  type t0 is array (0 to 1) of bit;\n${Array.from({ length: levels - 1 }, (_, i) => `  type t${i + 1} is array (0 to 1) of t${i};\n`).join('')}${signal ? `  signal s : t${levels - 1};\n` : ''}begin\nend x;\n`;
  assert.deepEqual(checkSyntax('t.vhd', nested(21)), []);
  const [diags, ms] = timed(() => checkSyntax('t.vhd', nested(40, true)));
  assert.equal(diags[0], `24:3 error: array too large (${2 ** 23 - 2} elements)`);
  // (each later type, and the signal, of an unknown type)
  assert.deepEqual(diags.slice(1), [...Array.from({ length: 18 }, (_, i) => `${25 + i}:3 error: unknown type 't${21 + i}'`), "43:3 error: unknown type 't39'"]);
  assert.ok(ms < 2000, `${ms} ms`);
  // Verilog: a vector, a memory's bits, its elements, a memory of two dimensions (each of its rows an element too)
  const v = d => checkSyntax('t.v', `module t;\n  ${d};\nendmodule\n`);
  assert.deepEqual(v(`reg [${MAX_BITS - 1}:0] r`), []);
  assert.deepEqual(v(`reg [${MAX_BITS}:0] r`), [`2:20 error: ${wide('the type', MAX_BITS + 1)}`]);
  assert.deepEqual(v(`reg [7:0] m [0:${MAX_BITS / 8}]`), [`2:13 error: ${wide('the type', MAX_BITS + 8)}`]);
  assert.deepEqual(v(`reg m [0:${MAX_ELEMENTS}]`), [`2:7 error: array too large (${MAX_ELEMENTS + 1} elements)`]);
  assert.deepEqual(v('reg m [0:2047][0:2048]'), [`2:7 error: array too large (${2048 * 2050} elements)`]);
  // VHDL: a record of arrays, a string, a string aggregate
  const h = d => checkSyntax('t.vhd', `entity t is end t;\narchitecture x of t is\n  ${d}\nbegin\nend x;\n`);
  assert.deepEqual(h(`type r_t is record a, b : bit_vector(0 to ${MAX_BITS / 2}); end record;`), [`3:3 error: ${wide('the type', MAX_BITS + 2)}`]);
  assert.deepEqual(h('signal s : string(1 to 2**30);'), [`3:3 error: ${wide('the type', 2 ** 33)}`]);
  assert.deepEqual(h(`constant s : string := (1 to 2**30 => 'a');`), [`3:3 error: ${wide('the expression', 2 ** 33)}`]);
  assert.deepEqual(h(`type a_t is array (natural range <>) of bit_vector(7 downto 0);\n  constant c : a_t := (0 to 2**30 => x"00");`), [`4:3 error: array too large (${2 ** 30 + 1} elements)`]);
  assert.deepEqual(h(`type a_t is array (natural range <>) of bit_vector(7 downto 0);\n  constant c : a_t := (0 => x"00", 2**30 => x"01");`), [`4:3 error: array too large (${2 ** 30 + 1} elements)`]);
});

test('#3555 VHDL: a function\'s result and a slice past the limits: the error at the expression, or the simulation\'s at run time', () => {
  const fn = `${LIB}use ieee.numeric_std.all;\nentity t is port (a : in std_logic; y : out std_logic); end t;\narchitecture x of t is\n  function f(n : integer) return unsigned is variable r : unsigned(n - 1 downto 0) := (others => '1'); begin return r; end function;\n  constant C : unsigned := f(2**30);\nbegin\n  y <= C(0) and a;\nend x;\n`;
  assert.deepEqual(checkSyntax('t.vhd', fn), [`7:3 error: ${wide('the type', 2 ** 30)}`, "9:3 error: 'c' is not declared"]);
  const conv = `${LIB}use ieee.numeric_std.all;\nentity t is port (a : in unsigned(1 downto 0); y : out std_logic); end t;\narchitecture x of t is\nbegin\n  y <= to_unsigned(1, 2**30)(0) and a(0);\nend x;\n`;
  assert.deepEqual(checkSyntax('t.vhd', conv), [`7:3 error: ${wide('the expression', 2 ** 30)}`]);
  // a slice of constant bounds, and one of run-time bounds in a function (each element a write of its own)
  const arr = body => `${LIB}entity t is end t;\narchitecture x of t is\n  type m_t is array (natural range <>) of std_logic_vector(7 downto 0);\n${body}\nend x;\n`;
  assert.deepEqual(checkSyntax('t.vhd', arr(`  signal m : m_t(0 to 3);\nbegin\n  process begin report integer'image(m(0 to 2**30)'length); wait; end process;`)), [`8:17 error: array too large (${2 ** 30 + 1} elements)`]);
  const run = n => arr(`  function f(n : integer) return integer is variable br : m_t(0 to 3); begin br(0 to n) := (others => x"00"); return 1; end function;\n  signal k : integer := ${n};\nbegin\n  process begin wait for 1 ns; report integer'image(f(k)); wait; end process;`);
  const r = simulate([{ path: 't.vhd', text: run(2 ** 30) }], 't');
  assert.deepEqual(r.sim.log.map(l => `${l.kind}: ${l.text}`).slice(0, 1), [`error: array too large (${2 ** 30 + 1} elements) (in t/process_9)`]);
  assert.equal(r.status.finished, 'error');
  assert.deepEqual(simulate([{ path: 't.vhd', text: run(3) }], 't').sim.log.map(l => l.text), ['1']);
});

// the forms the new ones replace: a literal's bits one at a time, a replication's copies joined one at a time
function fromBitsRef(bits, s = false) {
  let v = 0n, x = 0n;
  for (const c of bits) {
    v <<= 1n; x <<= 1n;
    if (c === '1') v |= 1n;
    else if (c === 'x' || c === 'X') x |= 1n;
    else if (c === 'z' || c === 'Z' || c === '?') { x |= 1n; v |= 1n; }
  }
  return V.mk(Math.max(bits.length, 1), v, x, s);
}
const replRef = (n, a) => (n > 0 ? V.concat(Array(n).fill(a)) : V.mk(0));

test('#3555 a literal\'s bits read at once, a replication by doubling: the same values as bit by bit, in linear time', () => {
  const chars = '01xXzZ?uUwWlLh-_ ', same = (a, b) => assert.deepEqual([a.w, a.v, a.x, a.s], [b.w, b.v, b.x, b.s]);
  let seed = 1;
  const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let k = 0; k < 3000; k++) {
    let s = '';
    for (let i = rnd(200); i > 0; i--) s += [...chars, '\u{1F600}', '\uD800', '\uDC00'][rnd(chars.length + 3)];
    same(V.fromBits(s, k % 2 === 0), fromBitsRef(s, k % 2 === 0));
    const a = V.fromBits(s.slice(0, rnd(9)));
    const n = rnd(70);
    same(V.repl(n, a), replRef(n, a));
  }
  const [lit, ms] = timed(() => V.fromBits('01xz'.repeat(MAX_BITS / 4)));
  assert.deepEqual([lit.w, lit.v & 0xFn, lit.x & 0xFn], [MAX_BITS, 0b0101n, 0b0011n]);
  const [rep, ms2] = timed(() => V.repl(MAX_BITS / 2, V.fromBits('10')));
  assert.deepEqual([rep.w, rep.v & 0xFn], [MAX_BITS, 0b1010n]);
  assert.ok(ms + ms2 < 5000, `${ms} + ${ms2} ms`);
});

test('#3555 a vector aggregate by runs: its bits as before (positions, ranges, others, a null array, outside its range)', () => {
  // each aggregate's value against its bits written one by one
  const cases = [
    ['(others => \'1\')', '11111111'], ['(0 => \'1\', others => \'0\')', '00000001'], ["('1', '0', '1', '1', others => 'Z')", '1011ZZZZ'],
    ["(7 downto 4 => '1', 2 => 'X', others => '0')", '11110X00'], ["(1 to 2 => '1', 6 => 'H', others => 'L')", '01000110'],
    ["(3 downto 0 => '1', 2 => '0', others => '0')", '00001011'], ["(9 downto 6 => '1', others => '0')", '11000000'],
    ["(0 => '1', 1 => '0', 2 => '1', 3 => '0', 4 => '1', 5 => '0', 6 => '1', 7 => '0')", '01010101'],
  ];
  const text = `${LIB}entity t is end t;\narchitecture x of t is\n${cases.map(([e], k) => `  constant C${k} : std_logic_vector(7 downto 0) := ${e};\n`).join('')}  constant N : std_logic_vector(0 downto 1) := (others => '1');\nbegin\n  process begin\n${cases.map((_, k) => `    report to_string(C${k});\n`).join('')}    report integer'image(N'length); wait;\n  end process;\nend x;\n`;
  const r = simulate([{ path: 't.vhd', text }], 't');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.sim.log.map(l => l.text), [...cases.map(c => c[1]), '0']);
  // (a long run of a signal's bit replicated; one of up to 64 bits written bit by bit, as before)
  const syn = n => synthesisInput(elaborate(compile([{ path: 't.vhd', text: `${LIB}entity t is port (a, b : in std_logic; y : out std_logic_vector(${n - 1} downto 0)); end t;\narchitecture x of t is\nbegin\n  y <= (0 => b, others => a);\nend x;\n` }]), 't'));
  assert.match(syn(66).text, /y <= \{65'\(\{65\{a\}\}\), b\};/);
  assert.match(syn(4).text, /y <= \{a, a, a, b\};/);
});
