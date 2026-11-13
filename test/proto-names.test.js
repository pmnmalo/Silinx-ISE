// Names of Object.prototype's (#3560): a design's name looked up in a table of built-ins (the Verilog parser's
// SystemVerilog atom types and wired nets, the C front end's math.h, its headers, its pragmas' values…) was found on
// the table's prototype, so `wire toString;` was a syntax error in Verilog and an undeclared toString(a) passed the C
// check. Signals, modules, functions, tasks and variables named toString, constructor, valueOf, hasOwnProperty and
// __proto__ in Verilog, VHDL and C (checked with no warnings, simulated, their synthesis input with no warnings; the C
// co-simulated in VHDL and Verilog); an undeclared function of such a name an error of the C check; and every table
// of the front ends read with a computed key has no prototype, but those whose keys are Silinx's own (operators,
// numbers, keywords).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { synthesisInput } from '../core/synth-front.js';
import { checkC } from '../core/c-check.js';
import { simulateC } from '../core/c-interp.js';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function checkSyntax(files, top) {
  const lib = compile(files);
  const d = elaborate(lib, top);
  return [...lib.errors, ...d.diags, ...designChecks(lib, d, { lint: true })].map(e => `${e.severity}: ${e.message}`);
}
function runs(files, top, tb) {
  assert.deepEqual(checkSyntax(files, top), []);
  assert.deepEqual(checkSyntax(files, tb), []);
  const r = simulate(files, tb);
  assert.deepEqual(r.errors.map(e => e.message), []);
  const { text, warnings } = synthesisInput(elaborate(compile(files), top));
  assert.deepEqual(warnings, []);
  return { log: r.sim.log.map(l => l.text), text };
}

test('#3560 Verilog: a module, its ports, a wire, an instance, a function and a task named as Object.prototype\'s names', () => {
  const files = [
    { path: 'm.v', text: 'module toString(input constructor, input [3:0] valueOf, output reg [3:0] hasOwnProperty);\n  function [3:0] __proto__(input [3:0] x); __proto__ = x + 4\'d1; endfunction\n  always @* hasOwnProperty = constructor ? __proto__(valueOf) : valueOf;\nendmodule\n' },
    { path: 't.v', text: 'module t(input a, input [3:0] b, output [3:0] y);\n  wire toString;\n  assign toString = a;\n  toString constructor(.constructor(toString), .valueOf(b), .hasOwnProperty(y));\nendmodule\n' },
    { path: 'tb.v', text: 'module tb;\n  reg valueOf;\n  reg [3:0] toString;\n  wire [3:0] y;\n  t dut(.a(valueOf), .b(toString), .y(y));\n  task hasOwnProperty(input [3:0] v); begin toString = v; #1; end endtask\n  initial begin valueOf = 1; hasOwnProperty(4\'d5); $display("%0d %0d", toString, y); valueOf = 0; hasOwnProperty(4\'d5); $display("%0d %0d", toString, y); $finish; end\nendmodule\n' },
  ];
  const { log, text } = runs(files, 't', 'tb');
  assert.deepEqual(log, ['5 6', '5 5', 'simulation finished ($finish) at 2 ns']);
  assert.match(text, /y = \(toString \? 4'\(fn___proto__\(b\)\) : 4'\(b\)\);/);
  // (each name declared as a wire, a reg, a port: the error before #3560, "expected identifier but found ';'")
  for (const n of ['toString', 'constructor', 'valueOf', 'hasOwnProperty', '__proto__']) {
    assert.deepEqual(checkSyntax([{ path: 'n.v', text: `module t(input ${n}, output y);\n  wire w_${n};\n  assign w_${n} = ${n};\n  assign y = w_${n};\nendmodule\nmodule u;\n  reg ${n};\n  wire o;\n  t i(.${n}(${n}), .y(o));\n  initial begin ${n} = 1; #1 $display("%b", o); end\nendmodule\n` }], 'u'),
      [], n);
  }
});

test('#3560 VHDL: an entity, its ports, a function and a signal named as Object.prototype\'s names', () => {
  const lib = 'library ieee;\nuse ieee.std_logic_1164.all;\nuse ieee.numeric_std.all;\n';
  const files = [
    { path: 'm.vhd', text: `${lib}entity constructor is port (toString : in std_logic; valueOf : in unsigned(3 downto 0); hasOwnProperty : out unsigned(3 downto 0)); end entity;\narchitecture rtl of constructor is\n  function \\__proto__\\(x : unsigned(3 downto 0)) return unsigned is begin return x + 1; end function;\nbegin\n  hasOwnProperty <= \\__proto__\\(valueOf) when toString = '1' else valueOf;\nend architecture;\n` },
    { path: 't.vhd', text: `${lib}entity t is port (a : in std_logic; b : in unsigned(3 downto 0); y : out unsigned(3 downto 0)); end entity;\narchitecture rtl of t is\n  signal toString : std_logic;\nbegin\n  toString <= a;\n  valueOf: entity work.constructor port map (toString => toString, valueOf => b, hasOwnProperty => y);\nend architecture;\n` },
    { path: 'tb.vhd', text: `${lib}entity tb is end entity;\narchitecture sim of tb is\n  signal constructor : std_logic;\n  signal toString, y : unsigned(3 downto 0);\nbegin\n  dut: entity work.t port map (a => constructor, b => toString, y => y);\n  process begin\n    constructor <= '1'; toString <= to_unsigned(5, 4); wait for 1 ns; report integer'image(to_integer(y));\n    constructor <= '0'; wait for 1 ns; report integer'image(to_integer(y));\n    wait;\n  end process;\nend architecture;\n` },
  ];
  const { log } = runs(files, 't', 'tb');
  assert.deepEqual(log, ['6', '5']);
});

const C_SRC = `#include <stdio.h>
#include <stdint.h>
static int toString(int x) { return x + 1; }
typedef int valueOf;
struct hasOwnProperty { int constructor; int __proto__; };
int top(int a) {
  struct hasOwnProperty s;
  valueOf constructor = a;
  s.constructor = toString(constructor);
  s.__proto__ = s.constructor * 2;
  return s.__proto__;
}
int main(void) { for (int k = 0; k < 3; k++) printf("%d\\n", top(k)); return 0; }
`;

for (const file of ['t.c', 't.cpp']) {
  test(`#3560 ${file}: a function, a type, a struct, its fields and variables named as Object.prototype's names`, () => {
    assert.deepEqual(checkC(C_SRC, file).diagnostics, []);
    const sim = simulateC(C_SRC, { file });
    assert.deepEqual([sim.error, sim.exitCode, sim.output], [null, 0, '2\n4\n6\n']);
    assert.deepEqual(cToHdl(C_SRC, { file, top: 'top' }).diagnostics, []);
    for (const lang of ['vhdl', 'verilog']) {
      const r = cosimulate(C_SRC, { file, top: 'top', lang });
      assert.deepEqual([r.errors, r.pass, r.calls, r.gen.diagnostics], [[], true, 3, []], lang);
    }
  });

  test(`#3560 ${file}: a function of such a name not declared is an error of the C check, as any other`, () => {
    for (const n of ['toString', 'constructor', 'valueOf', 'hasOwnProperty', '__proto__', 'sqrt_x']) {
      assert.deepEqual(checkC(`int top(int a) { return ${n}(a); }\n`, file).diagnostics.map(d => `${d.line}:${d.col} ${d.severity}: ${d.message}`),
        [`1:25 error: the function '${n}' is not declared`], n);
    }
  });
}

// the front ends' tables: a top-level `const NAME = { … }` (or one made with Object.fromEntries) read with a key that
// is not a literal (NAME[x], x in NAME) in any of their files has no prototype (`{ __proto__: null, …}`, nullProto),
// but those whose keys are Silinx's own: operators, numbers, keywords, internal kinds
const OWN_KEYS = new Set([
  'core/c-dataflow-expr.js OPS', 'core/c-dataflow-expr.js CMP', 'core/c-dataflow-fixed.js OPS', 'core/c-dataflow-float.js TYPE',
  'core/c-float-units.js OPS', 'core/c-float-units.js DECL', 'core/c-float-units.js BODY', 'core/c-interp-expr.js CMP',
  'core/c-lex.js ESC', 'core/c-mathlib.js FMT', 'core/c-mathlib.js K', 'core/c-print.js PREC', 'core/c-softfloat.js FMT',
  'core/c-timing.js FAMILIES', 'core/c-union.js WORD', 'core/cpp-task-array.js CMP', 'core/cpp-template.js PREC',
  'core/cpp-template.js BIN', 'core/cpp-vector.js COMPOUND',
  'packages/silinx-hdl/src/gowin-bsram.js KINDS', 'packages/silinx-hdl/src/interp-textio.js VLOG_MATH',
  'packages/silinx-hdl/src/interp.js OPPOSITE', 'packages/silinx-hdl/src/unisim-s6.js BWER', 'packages/silinx-hdl/src/unisim.js BRAM_W',
  'packages/silinx-hdl/src/verilog/lexer.js UNIT', 'packages/silinx-hdl/src/vhdl/parse-expr.js LOGICAL',
  'packages/silinx-hdl/src/vhdl/parse-expr.js UNARY_REDUCE', 'packages/silinx-hdl/src/vhdl/parse-expr.js RELATIONAL',
  'packages/silinx-hdl/src/vhdl/parse-expr.js SHIFT', 'packages/silinx-hdl/src/vhdl/parse-expr.js MULOP',
]);
test('#3560 the front ends\' tables read with a computed key have no prototype', () => {
  const dirs = ['core', 'packages/silinx-hdl/src', 'packages/silinx-hdl/src/verilog', 'packages/silinx-hdl/src/vhdl'];
  const files = dirs.flatMap(d => fs.readdirSync(path.join(ROOT, d)).filter(f => f.endsWith('.js')).map(f => `${d}/${f}`))
    .filter(f => !f.startsWith('core/') || /^core\/(c|cpp|hls)-/.test(f));
  const text = new Map(files.map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]));
  const found = [], bad = [];
  for (const [f, s] of text) {
    for (const m of s.matchAll(/^(?:export )?const ([A-Z][A-Z0-9_]*) = (\{[^\n]{0,20}|Object\.fromEntries\(|nullProto\(|[a-zA-Z]+\()/gm)) {
      const n = m[1];
      if (m[2].endsWith('(') && !/^(Object\.fromEntries|nullProto|fieldsOf)\($/.test(m[2])) continue;
      // (read with a key that is not a string or a number written out: in this file, or in one that imports it)
      const base = path.basename(f), importers = [...text].filter(([, t]) => new RegExp(`import \\{[^}]*\\b${n}\\b[^}]*\\} from '\\./${base}'`).test(t));
      const src = [s, ...importers.map(([, t]) => t)].join('\n');
      const keys = [...src.matchAll(new RegExp(`(?<![\\w.])${n}\\[([^\\]]+)\\]|\\bin ${n}\\b`, 'g'))].map(x => x[1] ?? 'in')
        .filter(k => !/^(['"`])[^$]*\1$/.test(k) && !/^\d+$/.test(k));
      if (!keys.length) continue;
      found.push(`${f} ${n}`);
      if (!OWN_KEYS.has(`${f} ${n}`) && !/__proto__: null|nullProto\(|fieldsOf\(/.test(m[2] + s.slice(m.index + m[0].length, m.index + m[0].length + 40))) bad.push(`${f} ${n}`);
    }
  }
  assert.deepEqual(bad, []);
  // (the allowed ones still there: the list kept up to date)
  assert.deepEqual([...OWN_KEYS].filter(k => !found.includes(k)), []);
  assert.ok(found.includes('packages/silinx-hdl/src/verilog/parser-defs.js ATOMS') && found.includes('core/c-float.js MATH'), found.join('\n'));
});
