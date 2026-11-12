// Calls nested in calls (#3508): a constant computed by a function that calls the next one, thousands deep, overflowed
// the elaboration's stack (each call's subprogram bound inside its caller's binding: past about 230 functions of one
// statement, past about 100 whose call sits in an if, a for and a case), thrown out of elaborate. The elaboration
// binds calls nested MAX_CALL_NESTING (32, #3612) levels deep; a call past it is one error of its file at that call, never a
// throw. A chain of functions MAX_CALL_NESTING long, each call in an if, a loop and a case and in parentheses, in VHDL
// and Verilog: a constant and a value of the simulation computed through it (Check Syntax with no warnings, simulated,
// the synthesis input with no warnings), its outermost call MAX_NESTING - 6 blocks deep; one function more, and
// 20 000: the error at the call past the limit, and its place in a package of another file; procedures and tasks the
// same; a chain whose calls have constant arguments (a VHDL function is bound again per constant argument when it
// does not bind without them) still one error, in linear time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { synthesisInput } from '../core/synth-front.js';
import { MAX_CALL_NESTING, CALL_NESTING_MESSAGE, MAX_NESTING } from '../packages/silinx-hdl/src/util.js';

const DEEP = 20000;
const PARENS = 30, BLOCKS = MAX_NESTING - 6;

// the functions f0 … f(n-1), f(i) = f(i+1)(x) + 1 and the last one x (so f0(x) = x + n - 1), one per line from line
// `first`; the call to f(i+1) at the column callCol(i) of its line
const open = '('.repeat(PARENS), close = ')'.repeat(PARENS);
const vFn = (i, n) => `  function automatic integer f${i}(input integer x); integer k; begin f${i} = 0; if (x >= 0) begin for (k = 0; k < 1; k = k + 1) begin case (k) 0: f${i} = ${open}${i < n - 1 ? `f${i + 1}(x) + 1` : 'x'}${close}; default: ; endcase end end else f${i} = -1; end endfunction`;
const hFn = (i, n) => `  function f${i}(x : integer) return integer is variable r : integer range -1 to 1000 := 0; begin if x >= 0 then for k in 0 to 0 loop case k is when 0 => r := ${open}${i < n - 1 ? `f${i + 1}(x) + 1` : 'x'}${close}; when others => null; end case; end loop; end if; return r; end function;`;
// (an expression's errors are at its statement: f(i)'s assignment)
const callCol = (line, i) => line.indexOf(line.includes(' := ') ? 'r := (' : `f${i} = (`) + 1;

// Verilog: the module, the functions from line 2, the constant P, an initial (its call BLOCKS blocks deep) writing P and f0(k)
function verilog(n) {
  const fns = Array.from({ length: n }, (_, i) => vFn(i, n));
  const text = `module t;\n${fns.join('\n')}\n  localparam P = f0(1);\n  integer k = 2, r;\n  initial begin\n${'    begin\n'.repeat(BLOCKS)}    r = f0(k);\n${'    end\n'.repeat(BLOCKS)}    $display("%0d %0d", P, r);\n  end\nendmodule\n`;
  return { path: 't.v', text, line: i => i + 2, fns };
}
// VHDL: the functions in reverse order (each declared before its caller), f(i) on line n + 2 - i
function vhdl(n) {
  const fns = Array.from({ length: n }, (_, i) => hFn(n - 1 - i, n));
  const text = `entity t is end t;\narchitecture a of t is\n${fns.join('\n')}\n  constant P : integer := f0(1);\nbegin\n  process\n    variable k : integer range 0 to 7 := 2;\n    variable r : integer range 0 to 1000;\n  begin\n${'    if k > 0 then\n'.repeat(BLOCKS)}    r := f0(k);\n${'    end if;\n'.repeat(BLOCKS)}    report integer'image(P) & " " & integer'image(r);\n    wait;\n  end process;\nend a;\n`;
  return { path: 't.vhd', text, line: i => n + 2 - i, fns: [...fns].reverse() };
}

function checkSyntax(src) {
  const lib = compile([src]);
  const d = elaborate(lib, 't');
  return [...lib.errors, ...d.diags, ...designChecks(lib, d, { lint: true })].map(e => `${e.severity}: ${e.message}`);
}

for (const [lang, make] of [['verilog', verilog], ['vhdl', vhdl]]) {
  test(`#3508 ${lang}: calls nested ${MAX_CALL_NESTING} deep compute a constant and a simulation's value, check with no warnings, make their synthesis input`, () => {
    const src = make(MAX_CALL_NESTING);
    assert.deepEqual(checkSyntax(src), []);
    const r = simulate([src], 't');
    assert.deepEqual(r.errors.map(e => e.message), []);
    assert.deepEqual(r.sim.log.map(l => `${l.kind}: ${l.text}`), [`${lang === 'vhdl' ? 'note' : 'print'}: ${MAX_CALL_NESTING} ${MAX_CALL_NESTING + 1}`]);
    // (the synthesis input of a module whose output is computed through the chain)
    const syn = lang === 'vhdl'
      ? { path: 's.vhd', text: `library ieee;\nuse ieee.std_logic_1164.all;\nuse ieee.numeric_std.all;\nentity t is port (a : in unsigned(7 downto 0); y : out unsigned(7 downto 0)); end t;\narchitecture a of t is\n${src.fns.slice().reverse().join('\n')}\n  constant P : integer := f0(1);\nbegin\n  y <= a + to_unsigned(P, 8);\nend a;\n` }
      : { path: 's.v', text: `module t(input [7:0] a, output [7:0] y);\n${src.fns.join('\n')}\n  localparam P = f0(1);\n  assign y = a + P;\nendmodule\n` };
    const { text, warnings } = synthesisInput(elaborate(compile([syn]), 't'));
    assert.deepEqual(warnings, []);
    assert.match(text, new RegExp(`y <?= .*\\ba\\b.* \\+ (8|32)'h${MAX_CALL_NESTING.toString(16)}\\b`), text);
  });

  test(`#3508 ${lang}: calls nested ${MAX_CALL_NESTING + 1} and ${DEEP} deep, one error at the call past the limit, never thrown`, () => {
    for (const n of [MAX_CALL_NESTING + 1, DEEP]) {
      const src = make(n);
      const at = `${src.path}:${src.line(MAX_CALL_NESTING - 1)}:${callCol(src.fns[MAX_CALL_NESTING - 1], MAX_CALL_NESTING - 1)}`;
      const lib = compile([src]);
      assert.deepEqual(lib.errors, []);
      const d = elaborate(lib, 't');
      // (the error once for each outermost call: the constant's, the process's; then the constant not declared, at the
      // statement that writes it)
      const write = `${src.path}:${n + (lang === 'vhdl' ? 10 : 6) + 2 * BLOCKS}:5 error: '${lang === 'vhdl' ? 'p' : 'P'}' is not declared`;
      assert.deepEqual(d.diags.map(e => `${e.file}:${e.line}:${e.col} ${e.severity}: ${e.message}`),
        [`${at} error: ${CALL_NESTING_MESSAGE}`, `${at} error: ${CALL_NESTING_MESSAGE}`, write]);
      const r = simulate([src], 't');
      assert.equal(r.sim, null);
      assert.equal(r.errors[0].message, CALL_NESTING_MESSAGE);
    }
  });
}

// a function of a package in another file: the error in that file, at its call
test('#3508 VHDL: calls nested too deep in a package\'s functions, the error in the package\'s file', () => {
  const n = MAX_CALL_NESTING + 1;
  const fns = Array.from({ length: n }, (_, i) => hFn(n - 1 - i, n));
  const pkg = `package p is\n${fns.map(f => f.replace(/ is variable.*$/, ';')).join('\n')}\nend p;\npackage body p is\n${fns.join('\n')}\nend p;\n`;
  const top = 'use work.p.all;\nentity t is end t;\narchitecture a of t is\n  constant C : integer := f0(1);\nbegin\nend a;\n';
  const lib = compile([{ path: 'p.vhd', text: pkg }, { path: 't.vhd', text: top }]);
  assert.deepEqual(lib.errors, []);
  const d = elaborate(lib, 't');
  const line = n + 4 + n - MAX_CALL_NESTING;   // (f(MAX - 1) in the body, the functions in reverse order)
  assert.deepEqual(d.diags.map(e => `${e.file}:${e.line}:${e.col} ${e.message}`), [`p.vhd:${line}:${callCol(fns[n - MAX_CALL_NESTING], MAX_CALL_NESTING - 1)} ${CALL_NESTING_MESSAGE}`]);
});

// tasks and procedures calling the next one
test('#3508 Verilog tasks and VHDL procedures nested too deep: the error at the call past the limit', () => {
  const n = DEEP;
  const tasks = Array.from({ length: n }, (_, i) => `  task t${i}(inout integer x); begin x = x + 1; ${i < n - 1 ? `t${i + 1}(x);` : ''} end endtask`);
  const v = `module t;\n${tasks.join('\n')}\n  integer k = 0;\n  initial begin t0(k); $display("%0d", k); end\nendmodule\n`;
  const dv = elaborate(compile([{ path: 't.v', text: v }]), 't');
  const lv = MAX_CALL_NESTING + 1;   // (t(MAX - 1)'s line)
  assert.deepEqual(dv.diags.map(e => `${e.line}:${e.col} ${e.message}`), [`${lv}:${tasks[MAX_CALL_NESTING - 1].indexOf(`t${MAX_CALL_NESTING}(x)`) + 1} ${CALL_NESTING_MESSAGE}`]);
  const procs = Array.from({ length: n }, (_, i) => `  procedure q${n - 1 - i}(x : inout integer) is begin x := x + 1; ${n - 1 - i < n - 1 ? `q${n - i}(x);` : ''} end procedure;`);
  const h = `entity t is end t;\narchitecture a of t is\nbegin\n  process\n${procs.map(p => `  ${p}`).join('\n')}\n    variable k : integer := 0;\n  begin\n    q0(k); report integer'image(k); wait;\n  end process;\nend a;\n`;
  const dh = elaborate(compile([{ path: 't.vhd', text: h }]), 't');
  const lh = 4 + n - MAX_CALL_NESTING + 1;
  assert.deepEqual(dh.diags.map(e => `${e.line}:${e.col} ${e.message}`), [`${lh}:${procs[n - MAX_CALL_NESTING].indexOf(`q${MAX_CALL_NESTING}(x)`) + 3} ${CALL_NESTING_MESSAGE}`]);
  // (a chain at the limit runs)
  const ok = Array.from({ length: MAX_CALL_NESTING }, (_, i) => `  task t${i}(inout integer x); begin x = x + 1; ${i < MAX_CALL_NESTING - 1 ? `t${i + 1}(x);` : ''} end endtask`);
  const r = simulate([{ path: 't.v', text: `module t;\n${ok.join('\n')}\n  integer k = 0;\n  initial begin t0(k); $display("%0d", k); end\nendmodule\n` }], 't');
  assert.deepEqual([r.errors, r.sim.log.map(l => l.text)], [[], [String(MAX_CALL_NESTING)]]);
});

// each call with a constant argument and a width depending on it (VHDL binds such a function again for each constant
// argument when it does not bind without them): the error kept, once, and in linear time
test('#3508 VHDL: a chain of calls with constant arguments, bound per constant, past the limit: one error, at once', () => {
  const n = DEEP;
  const fns = Array.from({ length: n }, (_, k) => {
    const i = n - 1 - k;
    return `  function f${i}(w : integer) return integer is variable v : bit_vector(w - 1 downto 0); begin return ${i < n - 1 ? `f${i + 1}(3)` : `v'length`}; end function;`;
  });
  const text = `entity t is end t;\narchitecture a of t is\n${fns.join('\n')}\n  constant C : integer := f0(4);\nbegin\nend a;\n`;
  const t0 = Date.now();
  const d = elaborate(compile([{ path: 't.vhd', text }]), 't');
  const line = 2 + n - MAX_CALL_NESTING + 1;
  assert.deepEqual(d.diags.map(e => `${e.line}:${e.col} ${e.message}`), [`${line}:${fns[n - MAX_CALL_NESTING].lastIndexOf('return') + 1} ${CALL_NESTING_MESSAGE}`]);
  assert.ok(Date.now() - t0 < 20000, `${Date.now() - t0} ms`);
  // (at the limit: the constant's value)
  const okFns = Array.from({ length: MAX_CALL_NESTING }, (_, k) => {
    const i = MAX_CALL_NESTING - 1 - k;
    return `  function f${i}(w : integer) return integer is variable v : bit_vector(w - 1 downto 0); begin return ${i < MAX_CALL_NESTING - 1 ? `f${i + 1}(3)` : `v'length`}; end function;`;
  });
  const r = simulate([{ path: 't.vhd', text: `entity t is end t;\narchitecture a of t is\n${okFns.join('\n')}\n  constant C : integer := f0(4);\nbegin\n  process begin report integer'image(C); wait; end process;\nend a;\n` }], 't');
  assert.deepEqual([r.errors, r.sim.log.map(l => l.text)], [[], ['3']]);
});
