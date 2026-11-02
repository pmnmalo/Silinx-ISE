// The actual of a VHDL port (#2565, core/vhdl/actual.js): an operator on a signal, or a signal's element indexed by a
// signal, is an error, as in XST; a name, a static slice, a conversion, `not s` and a constant expression are not.
// Each case's verdict is XST's (ISE 14.7, xc3s100e, run on these sources): HDLParsers:864 "Actual, result of operator,
// … is not a Signal", HDLParsers:852 "Value i is not static", HDLParsers:800 for uns_plus (a type error as well).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { actualProblem } from '../core/vhdl/actual.js';
import { hintFor, hintText } from '../core/hints.js';

const design = (conns, decls = '') => `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
entity sub is
  port (a : in std_logic_vector(3 downto 0); b : in std_logic; n : in integer range -1 to 15;
        y : out std_logic_vector(3 downto 0));
end sub;
architecture rtl of sub is
begin
  y <= a when b = '1' and n > 2 else not a;
end rtl;
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
entity top is
  port (s : in std_logic_vector(3 downto 0); t, t2 : in std_logic; i : in integer range 0 to 3;
        y : out std_logic_vector(3 downto 0));
end top;
architecture rtl of top is
  constant C : integer := 3;
  signal u : unsigned(3 downto 0);${decls}
begin
  u <= unsigned(s);
  ${conns}
end rtl;
`;
// the instance with one port's actual replaced
const inst = (port, actual) => {
  const conns = { a: 's', b: 't', n: 'i', y: 'y' };
  conns[port] = actual;
  return `inst : entity work.sub port map (${Object.entries(conns).map(([p, x]) => `${p} => ${x}`).join(', ')});`;
};
const diags = (text, top = 'top', path = 't.vhd') => {
  const lib = compile([{ path, text }]);
  return [...lib.errors, ...elaborate(lib, top).diags].map(d => `${d.severity} ${d.line}: ${d.message}`);
};
const OPERATOR = (p) => [`error 24: port '${p}' of 'inst': the actual is the result of an operator on a signal, not a static signal name`];
const INDEX = (p) => [`error 24: port '${p}' of 'inst': the actual is indexed by a signal, not a static signal name`];

// [port, actual, XST's verdict]
const CASES = [
  ['a', "s(1 downto 0) & s(3 downto 2)", OPERATOR('a')],
  ['a', "s(2 downto 0) & '0'", OPERATOR('a')],
  ['b', 't and t2', OPERATOR('b')],
  ['a', 'std_logic_vector(u + 1)', OPERATOR('a')],
  ['a', 'u + 1', OPERATOR('a')],
  ['n', 'i + 1', OPERATOR('n')],
  ['y', "s(1 downto 0) & s(3 downto 2)", OPERATOR('y')],
  ['b', 's(i)', INDEX('b')],
  ['a', '"00" & "11"', []],
  ['b', 'not t', []],
  ['n', 'C + 1', []],
  ['n', '-1', []],
  ['n', 'C', []],
  ['a', 'std_logic_vector(u)', []],
  ['a', 'std_logic_vector(to_unsigned(5, 4))', []],
  ['b', "'0'", []],
  ['a', "(others => '0')", []],
  ['a', 's(3 downto 0)', []],
  ['b', 's(2)', []],
];

test("#2565 a port's actual: an operator on a signal and a signal's index are errors, as in XST; names, conversions, `not` and constants are not (and nothing else is reported)", () => {
  for (const [port, actual, want] of CASES) assert.deepEqual(diags(design(inst(port, actual))), want, `${port} => ${actual}`);
});

test('#2565 static indices: a generate parameter, a generic or a constant indexes a signal in an actual; an operator on them stays constant', () => {
  const gen = design(`g : for k in 0 to 3 generate
    gi : entity work.sub port map (a => s, b => s(k), n => k + C, y => open);
  end generate;
  y <= s;`);
  assert.deepEqual(diags(gen), []);
  assert.deepEqual(diags(design(`${inst('b', 's(C)')}`)), []);
  assert.deepEqual(diags(design(`${inst('a', 's(C downto 0) & s(3 downto C + 1)')}`)), OPERATOR('a'));
});

test('#2565 the uart example\'s first port map (regression): the counter and the last byte concatenated into the display\'s digits', () => {
  const text = `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
entity disp is port (digits : in std_logic_vector(15 downto 0); seg : out std_logic_vector(6 downto 0)); end disp;
architecture rtl of disp is begin seg <= digits(6 downto 0) xor digits(15 downto 9); end rtl;
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
entity echo is port (last : in std_logic_vector(7 downto 0); seg : out std_logic_vector(6 downto 0)); end echo;
architecture rtl of echo is
  signal count : unsigned(7 downto 0) := (others => '0');
begin
  display : entity work.disp port map (digits => std_logic_vector(count) & last, seg => seg);
end rtl;
`;
  const ds = diags(text, 'echo');
  assert.deepEqual(ds, ["error 13: port 'digits' of 'display': the actual is the result of an operator on a signal, not a static signal name"]);
  const fixed = text.replace('begin\n  display', "  signal digits : std_logic_vector(15 downto 0);\nbegin\n  digits <= std_logic_vector(count) & last;\n  display")
    .replace('digits => std_logic_vector(count) & last', 'digits => digits');
  assert.deepEqual(diags(fixed, 'echo'), []);
});

test('#2565 Verilog keeps its expressions in connections; a VHDL instance of a Verilog module is held to VHDL', () => {
  const v = `module sub(input [3:0] a, output [3:0] y); assign y = ~a; endmodule
module top(input [3:0] s, output [3:0] y); sub u(.a({s[1:0], s[3:2]} + 4'd1), .y(y)); endmodule
`;
  assert.deepEqual(diags(v, 'top', 't.v'), []);
  const lib = compile([{ path: 'sub.v', text: 'module sub(input [3:0] a, output [3:0] y); assign y = ~a; endmodule\n' },
    { path: 'top.vhd', text: `library ieee; use ieee.std_logic_1164.all;
entity top is port (s : in std_logic_vector(3 downto 0); y : out std_logic_vector(3 downto 0)); end top;
architecture rtl of top is begin
  u : entity work.sub port map (a => s(1 downto 0) & s(3 downto 2), y => y);
end rtl;
` }]);
  assert.deepEqual([...lib.errors, ...elaborate(lib, 'top').diags].map(d => `${d.severity} ${d.line}: ${d.message}`),
    ["error 4: port 'a' of 'u': the actual is the result of an operator on a signal, not a static signal name"]);
});

test('#2565 actualProblem: what it finds in each kind of expression, given which ones read a signal', () => {
  const sig = new Set(['s', 'i']);
  // reads: a name of `sig` anywhere in the expression
  const reads = (e) => JSON.stringify(e).match(/"name":"(\w+)"/g)?.some(m => sig.has(m.slice(8, -1))) ?? false;
  const ref = (name) => ({ op: 'ref', name });
  const cat = { op: 'concat', parts: [ref('s'), ref('s')] };
  assert.deepEqual(actualProblem(cat, reads), { kind: 'operator', node: cat });
  assert.equal(actualProblem({ op: 'concat', parts: [ref('C'), ref('C')] }, reads), null);
  const sum = { op: 'binary', o: '+', a: ref('i'), b: { op: 'int', value: '1' } };
  // inside a conversion (named or positional), a qualified expression, a unary operator
  assert.deepEqual(actualProblem({ op: 'apply', name: 'std_logic_vector', args: [sum] }, reads), { kind: 'operator', node: sum });
  assert.deepEqual(actualProblem({ op: 'apply', name: 'resize', args: [{ named: 'arg', value: sum }, { op: 'int', value: '8' }] }, reads), { kind: 'operator', node: sum });
  assert.deepEqual(actualProblem({ op: 'qualified', type: 'unsigned', expr: sum }, reads), { kind: 'operator', node: sum });
  assert.deepEqual(actualProblem({ op: 'unary', o: '~', a: sum }, reads), { kind: 'operator', node: sum });
  assert.equal(actualProblem({ op: 'unary', o: '~', a: ref('s') }, reads), null);
  // a signal's element or slice: its indices
  const el = { op: 'apply', name: 's', args: [ref('i')] };
  assert.deepEqual(actualProblem(el, reads), { kind: 'index', node: el });
  assert.equal(actualProblem({ op: 'apply', name: 's', args: [ref('C')] }, reads), null);
  const sl = { op: 'slice', base: ref('s'), left: ref('i'), right: { op: 'int', value: '0' }, dir: 'downto' };
  assert.deepEqual(actualProblem(sl, reads), { kind: 'index', node: sl });
  const ix = { op: 'index', base: { op: 'field', base: ref('r'), name: 'v' }, index: ref('i') };
  assert.deepEqual(actualProblem(ix, reads), { kind: 'index', node: ix });
  // names, literals, aggregates, attributes, open
  for (const e of [ref('s'), { op: 'field', base: ref('r'), name: 'v' }, { op: 'lit', bits: '01' }, { op: 'str', value: '0101' },
    { op: 'int', value: '3' }, { op: 'aggregate', items: [] }, { op: 'attr', prefix: ref('s'), attr: 'length', args: [] }, null, undefined])
    assert.equal(actualProblem(e, reads), null, JSON.stringify(e));
});

test('#2565 the error has its hint, in English and in Portuguese', () => {
  for (const kind of ['the result of an operator on a signal', 'indexed by a signal']) {
    const d = { severity: 'error', message: `port 'digits' of 'display': the actual is ${kind}, not a static signal name` };
    const h = hintFor(d);
    assert.equal(h?.id, 'port-actual', kind);
    assert.match(hintText(d, 'en').fix, /Assign the expression to a signal of its own \('x <= a & b;'\) and connect that signal \('digits => x'\)/);
    assert.match(hintText(d, 'pt').fix, /Atribua a expressão a um sinal próprio \('x <= a & b;'\) e ligue esse sinal \('digits => x'\)/);
  }
});
