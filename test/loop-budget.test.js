// Loops with no bound (#3525): the interpreter stopped a while or a VHDL loop at 10 million iterations, each loop on its
// own count (nested loops multiplied it; one loop to its bound took about half a minute), and a for over a range and a
// repeat never; a constant function is run while the design is elaborated, before any limit of the simulation, so a
// `for i in 0 to integer'high` froze Check Syntax and kept the MCP server's queue busy. One budget of MAX_ITERATIONS
// loop iterations and calls per evaluation (a constant, a process's run until it waits), counted by every loop and
// call; past it, one error at the loop (in its file). In VHDL and Verilog: at the limit the value, one past it the
// exact error; nested loops, a package's function, recursion; a process's loop in the simulation, a budget per run;
// the MCP's simulate stopped at its timeout_s inside a run that does not wait.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { MAX_ITERATIONS, ITERATIONS_MESSAGE } from '../packages/silinx-hdl/src/util.js';
import { scratchEnv } from './server-helpers.js';

const MSG = `loop iteration limit exceeded: more than ${MAX_ITERATIONS} iterations and calls in one evaluation (a constant, or a process until it waits)`;

function checkSyntax(srcs, top = 't') {
  const lib = compile(srcs);
  const d = elaborate(lib, top);
  const diags = [...lib.errors, ...d.diags];
  const all = diags.some(e => e.severity === 'error') ? diags : [...diags, ...designChecks(lib, d, { lint: true })];
  return all.map(e => `${e.file ? `${e.file}:` : ''}${e.line ? `${e.line}:${e.col} ` : ''}${e.severity}: ${e.message}`);
}
const timed = f => { const t0 = Date.now(); const r = f(); return [r, Date.now() - t0]; };

// a constant C = f(n): the call, then n iterations (n + 1 of the budget); reported by a process
const vhdl = n => ({ path: 't.vhd', text: `entity t is end t;\narchitecture a of t is\n  function f(n : integer) return integer is\n    variable s : integer := 0;\n  begin\n    for i in 1 to n loop\n      s := s + 1;\n    end loop;\n    return s;\n  end function;\n  constant C : integer := f(${n});\nbegin\n  process begin report integer'image(C); wait; end process;\nend a;\n` });
const verilog = n => ({ path: 't.v', text: `module t;\n  function integer f(input integer n);\n    integer i;\n    begin\n      f = 0;\n      for (i = 0; i < n; i = i + 1)\n        f = f + 1;\n    end\n  endfunction\n  localparam C = f(${n});\n  initial $display("%0d", C);\nendmodule\n` });

test('#3525 the budget and its message', () => {
  assert.equal(MAX_ITERATIONS, 2 ** 22);
  assert.equal(ITERATIONS_MESSAGE, MSG);
});

for (const [lang, make, at, big] of [['VHDL', vhdl, 't.vhd:6:5', "integer'high"], ['Verilog', verilog, 't.v:6:7', "32'h7fffffff"]]) {
  test(`#3525 ${lang}: a constant function's loop at the budget computes the constant; one past it and to ${big}, one error at the loop`, () => {
    const r = simulate([make(MAX_ITERATIONS - 1)], 't');
    assert.deepEqual([r.errors, r.sim.log.map(l => l.text)], [[], [String(MAX_ITERATIONS - 1)]]);
    for (const n of [MAX_ITERATIONS, big]) {
      const [diags, ms] = timed(() => checkSyntax([make(n)]));
      // (the constant not declared, where the process reads it)
      const read = lang === 'VHDL' ? "t.vhd:13:17 error: 'c' is not declared" : "t.v:11:11 error: 'C' is not declared";
      assert.deepEqual(diags, [`${at} error: ${MSG}`, read]);
      assert.ok(ms < 20000, `${ms} ms`);
    }
  });
}

test('#3525 nested loops count together; a package\'s function: the error at its loop, in its file', () => {
  // 2100 × 2100: each loop far from the budget, the two together past it
  const nested = { path: 't.vhd', text: `entity t is end t;\narchitecture a of t is\n  function f(n : integer) return integer is variable s : integer := 0; begin\n    for i in 1 to n loop\n      for j in 1 to n loop s := s + 1; end loop;\n    end loop;\n    return s;\n  end function;\n  constant C : integer := f(2100);\nbegin\nend a;\n` };
  assert.deepEqual(checkSyntax([nested]), [`t.vhd:5:7 error: ${MSG}`]);
  assert.deepEqual(checkSyntax([{ ...nested, text: nested.text.replace('f(2100)', 'f(1024)') }]), []);
  const vnested = { path: 't.v', text: `module t;\n  function integer f(input integer n);\n    integer i, j;\n    begin\n      f = 0;\n      for (i = 0; i < n; i = i + 1)\n        for (j = 0; j < n; j = j + 1) f = f + 1;\n    end\n  endfunction\n  localparam C = f(2048);\nendmodule\n` };
  assert.deepEqual(checkSyntax([vnested]), [`t.v:7:9 error: ${MSG}`]);
  const pkg = { path: 'p.vhd', text: `package p is\n  function f(n : integer) return integer;\nend p;\npackage body p is\n  function f(n : integer) return integer is\n    variable s : integer := 0;\n  begin\n    for i in 0 to n loop\n      s := s + 1;\n    end loop;\n    return s;\n  end function;\nend p;\n` };
  const top = { path: 't.vhd', text: `use work.p.all;\nentity t is end t;\narchitecture a of t is\n  constant C : integer := f(integer'high - 1);\nbegin\nend a;\n` };
  assert.deepEqual(checkSyntax([pkg, top]), [`p.vhd:8:5 error: ${MSG}`]);
});

test('#3525 calls count: a recursion of many calls (not deep) past the budget, a Verilog repeat and while', () => {
  // fib(40): about 330 million calls, 40 deep
  const fib = { path: 't.v', text: `module t;\n  function automatic integer fib(input integer n);\n    fib = n < 2 ? n : fib(n - 1) + fib(n - 2);\n  endfunction\n  localparam C = fib(40);\nendmodule\n` };
  assert.deepEqual(checkSyntax([fib]), [`t.v:5:3 error: ${MSG}`]);
  assert.deepEqual(checkSyntax([{ ...fib, text: fib.text.replace('fib(40)', 'fib(20)') }]), []);
  for (const loop of ["repeat (32'h7fffffff) s = s + 1;", 'while (1) s = s + 1;']) {
    const r = simulate([{ path: 't.v', text: `module t;\n  integer s = 0;\n  initial begin\n    ${loop}\n    $display("%0d", s);\n  end\nendmodule\n` }], 't');
    assert.deepEqual(r.sim.log.map(l => `${l.kind}: ${l.text} (line ${l.line})`), [`error: ${MSG} (in t/initial_3) (line 4)`, 'note: simulation finished ($error) at 0 ns (line 3)']);
  }
});

test('#3525 the simulation: a process\'s run past the budget is its error; the budget is each run\'s, a loop that waits runs on', () => {
  const proc = body => ({ path: 't.vhd', text: `entity t is end t;\narchitecture a of t is\nbegin\n  process\n    variable s : integer := 0;\n  begin\n${body}\n    wait;\n  end process;\nend a;\n` });
  const r = simulate([proc(`    for i in 0 to integer'high - 1 loop\n      s := s + 1;\n    end loop;`)], 't');
  assert.deepEqual(r.sim.log.map(l => `${l.kind}: ${l.text} (line ${l.line})`), [`error: ${MSG} (in t/process_4) (line 7)`, 'note: simulation finished ($error) at 0 ns (line 4)']);
  // three runs of 3M iterations each (9M in all, past the budget), a wait between two
  const ok = simulate([proc(`    for k in 1 to 3 loop\n      for i in 1 to 3000000 loop s := s + 1; end loop;\n      wait for 1 ns;\n    end loop;\n    report integer'image(s);`)], 't');
  assert.deepEqual([ok.errors, ok.sim.log.map(l => `${l.kind}: ${l.text}`)], [[], ['note: 9000000']]);
});

// the MCP server: Check Syntax's error, simulate stopped at its timeout_s inside a run that does not wait
let tmp;
const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
before(async () => { tmp = await scratchEnv('silinx-loop-budget-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('#3525 MCP: check_syntax\'s error of a constant function\'s loop; simulate stopped at its timeout_s inside a process\'s run', async () => {
  assert.equal((await call('new_project', { name: 'b' })).isError, false);
  assert.equal((await call('write_file', { project: 'b', path: 'src/t.vhd', text: vhdl("integer'high").text })).isError, false);
  const errors = `ERROR:HDLCompiler - "src/t.vhd" Line 6: ${MSG}; ERROR:HDLCompiler - "src/t.vhd" Line 13: 'c' is not declared`;
  const st = await call('set_top', { project: 'b', top: 't' });
  assert.deepEqual([st.isError, st.text], [true, `set_top: <t> does not elaborate: ${errors}`]);
  const cs = await call('check_syntax', { project: 'b', top: 't' });
  assert.equal(cs.isError, false, cs.text);
  assert.ok(cs.text.includes(`"src/t.vhd" Line 6: ${MSG}`), cs.text);
  // a run of about 4M iterations of a few statements each (several seconds), then a wait, again and again
  const tb = `entity tb is end tb;\narchitecture a of tb is\nbegin\n  process\n    variable s, u, v : integer := 0;\n  begin\n    for i in 1 to 4000000 loop\n      s := s + 1; u := s mod 7; v := u + s; u := v - s; v := u;\n    end loop;\n    wait for 1 ns;\n  end process;\nend a;\n`;
  await call('write_file', { project: 'b', path: 'sim/tb.vhd', text: tb });
  await call('set_top', { project: 'b', sim_top: 'tb' });
  const t0 = Date.now();
  const r = await call('simulate', { project: 'b', time_ns: 100, timeout_s: 1 });
  const ms = Date.now() - t0;
  assert.equal(r.isError, false, r.text);
  assert.deepEqual(r.data.limit, { kind: 'time', seconds: 1 });
  assert.deepEqual(r.data.log.map(l => `${l.kind}: ${l.text}`), ['error: the simulation\'s time limit was reached in a process that does not wait (in tb/process_4)', 'note: simulation finished ($error) at 0 ns']);
  assert.ok(ms < 4000, `${ms} ms`);
});
