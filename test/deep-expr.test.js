// Long chains of operators (#3375): expressions of 20 000 terms in VHDL and in Verilog, which overflowed the stack
// (the binder, constant folding, Verilog's context sizing, the simulator's evaluator, the design checks, the synthesis
// input, the translation: each recursed once per operator, a chain of a left-associative operator nesting in its left
// operands, a chain of conditional operators (?: / when … else) in its elses). Check Syntax with no warnings; the
// simulation the same as a short equivalent design's; the synthesis input; the translation both ways, checked and
// simulated again; the chains of the parsers as they were.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { parse as parseVhdl } from '../core/vhdl/parser.js';
import { parse as parseVerilog } from '../core/verilog/parser.js';
import { synthesisInput } from '../core/synth-front.js';
import { translateSource } from '../core/translate.js';
import { intOf } from '../core/translate-util.js';

const N = 20000;
const terms = (n, f, sep) => Array.from({ length: n }, (_, i) => f(i)).join(sep);

// the design: s = a + a + … (n terms), o = (b and 1) or (b and 2) or … (b), m = a table of c by a chain of conditions
// ((c * 3) mod 256 for c < n, all ones otherwise), z = c differs from 5, 6, … n + 4 (a chain of and / &&), k = a
// constant of n terms (1 + 2 + 3 + …, the parameter's value mod 256); `short`: the same, written short
function vhdl(n, { short = false } = {}) {
  const bit = i => `X"${(1 << (i % 8)).toString(16).padStart(2, '0')}"`;
  const s = short ? `resize(a * to_unsigned(${n % 256}, 8), 8)` : terms(n, () => 'a', ' + ');
  const o = short ? 'b' : terms(n, i => `(b and ${bit(i)})`, ' or ');
  const m = short ? `resize(c * 3, 8) when c < ${n} else (others => '1')` : `${terms(n, i => `to_unsigned(${(i * 3) % 256}, 8) when c = ${i}`, ' else ')} else (others => '1')`;
  const z = short ? `'1' when c < 5 or c >= ${n + 5} else '0'` : `'1' when ${terms(n, i => `c /= ${i + 5}`, ' and ')} else '0'`;
  const k = short ? String((n * (n + 1) / 2) % 256) : `(${terms(n, i => String(i + 1), ' + ')}) mod 256`;
  return `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity chain is
  port (a : in unsigned(7 downto 0); b : in std_logic_vector(7 downto 0); c : in unsigned(15 downto 0);
        s : out unsigned(7 downto 0); o : out std_logic_vector(7 downto 0); m : out unsigned(7 downto 0); z : out std_logic;
        k : out unsigned(7 downto 0));
end chain;

architecture rtl of chain is
  constant K0 : integer := ${k};
begin
  s <= ${s};
  o <= ${o};
  m <= ${m};
  z <= ${z};
  k <= to_unsigned(K0, 8);
end rtl;
`;
}

function verilog(n, { short = false } = {}) {
  const s = short ? `a * ${n}` : terms(n, () => 'a', ' + ');
  const o = short ? 'b' : terms(n, i => `(b & 8'h${(1 << (i % 8)).toString(16).padStart(2, '0')})`, ' | ');
  const m = short ? `c < ${n} ? c * 3 : 8'hff` : `${terms(n, i => `c == ${i} ? 8'd${(i * 3) % 256}`, ' : ')} : 8'hff`;
  const z = short ? `c < 5 || c >= ${n + 5}` : terms(n, i => `c != ${i + 5}`, ' && ');
  const k = short ? String(n * (n + 1) / 2) : terms(n, i => String(i + 1), ' + ');
  return `module chain(input [7:0] a, input [7:0] b, input [15:0] c, output [7:0] s, output [7:0] o, output [7:0] m, output z,
  output [7:0] k);
  localparam K0 = ${k};
  assign s = ${s};
  assign o = ${o};
  assign m = ${m};
  assign z = ${z};
  assign k = K0;
endmodule
`;
}

// test benches: a, b and c through a few values (c across the end of the chains), the outputs written at each
const STEPS = [[0, 0, 0], [1, 255, 4], [7, 165, 5], [200, 60, 777], [255, 129, N - 1], [3, 1, N], [9, 2, N + 4], [17, 4, N + 5]];
const tbVhdl = () => `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity tb is end tb;

architecture sim of tb is
  signal a, s, m, k : unsigned(7 downto 0);
  signal b, o : std_logic_vector(7 downto 0);
  signal c : unsigned(15 downto 0);
  signal z : std_logic;
begin
  uut: entity work.chain port map (a => a, b => b, c => c, s => s, o => o, m => m, z => z, k => k);
  process begin
${STEPS.map(([x, y, w]) => `    a <= to_unsigned(${x}, 8); b <= std_logic_vector(to_unsigned(${y}, 8)); c <= to_unsigned(${w}, 16);
    wait for 10 ns;
    report integer'image(to_integer(s)) & " " & integer'image(to_integer(unsigned(o))) & " " & integer'image(to_integer(m)) & " " & std_logic'image(z) & " " & integer'image(to_integer(k));`).join('\n')}
    wait;
  end process;
end sim;
`;
const tbVerilog = () => `module tb;
  reg [7:0] a, b;
  reg [15:0] c;
  wire [7:0] s, o, m, k;
  wire z;
  chain uut(.a(a), .b(b), .c(c), .s(s), .o(o), .m(m), .z(z), .k(k));
  initial begin
${STEPS.map(([x, y, w]) => `    a = ${x}; b = ${y}; c = ${w};
    #10 $display("%0d %0d %0d '%b' %0d", s, o, m, z, k);`).join('\n')}
  end
endmodule
`;

const file = lang => (lang === 'vhdl' ? 'chain.vhd' : 'chain.v');
const make = (lang, n, o) => (lang === 'vhdl' ? vhdl(n, o) : verilog(n, o));
const tb = lang => (lang === 'vhdl' ? { path: 'tb.vhd', text: tbVhdl() } : { path: 'tb.v', text: tbVerilog() });
// the values each step writes (the reference: computed here)
const expected = n => STEPS.map(([x, y, w]) => `${(x * n) % 256} ${y} ${w < n ? (w * 3) % 256 : 255} '${w < 5 || w >= n + 5 ? 1 : 0}' ${(n * (n + 1) / 2) % 256}`);

// Check Syntax of the design (chain): its errors and warnings, the design checks' included
function checkSyntax(path, text) {
  const lib = compile([{ path, text }]);
  const design = elaborate(lib, 'chain');
  return [...lib.errors, ...design.diags, ...designChecks(lib, design, { lint: true })].map(d => `${d.severity}: ${d.message}`);
}

// the simulation's messages (every one: the written values, and any warning or error)
function run(srcs) {
  const r = simulate(srcs, 'tb');
  assert.deepEqual(r.errors.map(e => e.message), []);
  return r.sim.log.map(l => `${l.kind}: ${l.text}`);
}

for (const lang of ['vhdl', 'verilog']) {
  test(`#3375 ${lang}: expressions of ${N} terms check with no warnings and simulate as their short equivalents`, () => {
    const long = make(lang, N), short = make(lang, N, { short: true });
    assert.deepEqual(checkSyntax(file(lang), long), []);
    assert.deepEqual(checkSyntax(file(lang), short), []);
    const a = run([{ path: file(lang), text: long }, tb(lang)]);
    assert.deepEqual(a, run([{ path: file(lang), text: short }, tb(lang)]));
    const kind = lang === 'vhdl' ? 'note' : 'print';
    assert.deepEqual(a, expected(N).map(l => `${kind}: ${l}`));
  });

  test(`#3375 ${lang}: the synthesis input of expressions of ${N} terms`, () => {
    const lib = compile([{ path: file(lang), text: make(lang, N) }]);
    const { text, warnings, gates } = synthesisInput(elaborate(lib, 'chain'));
    assert.deepEqual(warnings, []);
    // (the sum and the or written as chains of their operators, the conditions as a chain of ?:)
    assert.ok((text.match(/ \+ /g) || []).length >= N - 1);
    assert.ok((text.match(/ \| /g) || []).length >= N - 1);
    assert.ok((text.match(/ \? /g) || []).length >= N);
    assert.equal(gates, 0);
  });

  test(`#3375 ${lang}: expressions of ${N} terms translated, checked, then simulated as the original`, () => {
    const to = lang === 'vhdl' ? 'verilog' : 'vhdl';
    const tr = translateSource(make(lang, N), { path: file(lang), to });
    assert.deepEqual(tr.errors, []);
    assert.equal(tr.lang, to);
    assert.deepEqual(checkSyntax(file(to), tr.text), []);
    const there = run([{ path: file(to), text: tr.text }, tb(to)]);
    const here = run([{ path: file(lang), text: make(lang, N) }, tb(lang)]);
    const norm = l => l.replace(/^\w+: /, '').replace(/'/g, '');
    assert.deepEqual(there.map(norm), here.map(norm));
  });
}

test('#3375 the parsers: a chain nests in its left operands, a chain of ?: in its elses', () => {
  const v = parseVerilog('module m(input [3:0] a, output [3:0] y);\n  assign y = a + 1 - a + 2;\n  assign y = a == 0 ? 1 : a == 1 ? 2 : a == 2 ? (a ? 3 : 4) : 5;\nendmodule\n', 'm.v');
  assert.deepEqual(v.errors, []);
  const [s1, s2] = v.units[0].items.filter(i => i.kind === 'assign');
  const ops = []; for (let x = s1.value; x.op === 'binary'; x = x.a) ops.push(x.o);
  assert.deepEqual(ops, ['+', '-', '+']);
  const thens = []; let x = s2.value;
  for (; x.op === 'cond'; x = x.else) thens.push(x.then.op === 'cond' ? 'cond' : x.then.value);
  assert.deepEqual([thens, x.value], [['1', '2', 'cond'], '5']);
  assert.equal(intOf({ op: 'binary', o: '-', a: { op: 'binary', o: '*', a: { op: 'int', value: '6' }, b: { op: 'int', value: '7' } }, b: { op: 'int', value: '2' } }), 40);
  assert.equal(intOf({ op: 'binary', o: '+', a: { op: 'ref', name: 'x' }, b: { op: 'int', value: '2' } }), null);
  const h = parseVhdl('entity e is end e;\narchitecture r of e is\n  signal a, y : integer;\nbegin\n  y <= a + 1 - a + 2;\nend r;\n', 'e.vhd');
  assert.deepEqual(h.errors, []);
});

test(`#3375 a VHDL boolean chain of ${N} and: each operand once (its left one evaluated once, not again)`, () => {
  // (an impure function counting its calls: the chain of `and` short-circuits, each operand evaluated at most once)
  const text = `entity t is end t;
architecture sim of t is
  shared variable calls : integer := 0;
  impure function yes return boolean is begin calls := calls + 1; return true; end function;
begin
  process
    variable r : boolean;
  begin
    r := ${terms(24, () => 'yes', ' and ')};
    report boolean'image(r) & " " & integer'image(calls);
    r := ${terms(N, () => 'yes', ' and ')};
    report boolean'image(r) & " " & integer'image(calls);
    wait;
  end process;
end sim;
`;
  const r = simulate([{ path: 't.vhd', text }], 't');
  assert.deepEqual(r.errors.map(e => e.message), []);
  assert.deepEqual(r.sim.log.map(l => `${l.kind}: ${l.text}`), ['note: true 24', `note: true ${24 + N}`]);
});
