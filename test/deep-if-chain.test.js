// A long if … elsif / else if chain (#2577): 20 000 branches in VHDL and in Verilog, which overflowed the stack (the
// parsers, the binder, the simulator, the design checks, the synthesis input, the translation: each recursed once per
// branch, the chain nesting in else). Check Syntax (the design checks too) with no warnings; the simulation the same
// as a short equivalent design's, from its first branches and across its last ones into else; the synthesis input
// (an else if chain, as one); the translation, simulated again; an elaboration that throws a design error, not
// thrown out of simulate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { parse as parseVhdl } from '../core/vhdl/parser.js';
import { parse as parseVerilog } from '../core/verilog/parser.js';
import { synthesisInput } from '../core/synth-front.js';
import { translateSource } from '../core/translate.js';

const N = 20000;
const val = i => (i * 3) % 1000;   // (the value of branch i)

// the design: y <= val(cnt) for cnt < n, all ones otherwise; `short`: the same, written as one if; `comb`: a
// combinational process; `noElse`: without the last else (a latch)
function vhdl(n, { short = false, comb = false, noElse = false } = {}) {
  const asg = v => `y <= to_unsigned(${v}, 10);`;
  let body;
  if (short) body = `if cnt < ${n} then y <= to_unsigned((to_integer(cnt) * 3) mod 1000, 10);\n      else y <= (others => '1');\n      end if;`;
  else {
    const lines = [`if cnt = 0 then ${asg(0)}`];
    for (let i = 1; i < n; i++) lines.push(`elsif cnt = ${i} then ${asg(val(i))}`);
    if (!noElse) lines.push(`else y <= (others => '1');`);
    body = `${lines.join('\n      ')}\n      end if;`;
  }
  return `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity chain is
  port (clk : in std_logic; cnt : in unsigned(15 downto 0); y : out unsigned(9 downto 0));
end chain;

architecture rtl of chain is
begin
  process (${comb ? 'cnt' : 'clk'}) begin
    ${comb ? '' : 'if rising_edge(clk) then\n      '}${body}${comb ? '' : '\n    end if;'}
  end process;
end rtl;
`;
}

function verilog(n, { short = false, comb = false, noElse = false } = {}) {
  const op = comb ? '=' : '<=';
  let body;
  if (short) body = `if (cnt < ${n}) y ${op} (cnt * 3) % 1000;\n    else y ${op} 10'h3ff;`;
  else {
    const lines = [`if (cnt == 0) y ${op} 10'd0;`];
    for (let i = 1; i < n; i++) lines.push(`else if (cnt == ${i}) y ${op} 10'd${val(i)};`);
    if (!noElse) lines.push(`else y ${op} 10'h3ff;`);
    body = lines.join('\n    ');
  }
  return `module chain(input clk, input [15:0] cnt, output reg [9:0] y);
  always @(${comb ? '*' : 'posedge clk'}) begin
    ${body}
  end
endmodule
`;
}

// test benches: cnt from start, 8 clock cycles, cnt and y written at each
const tbVhdl = start => `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity tb is end tb;

architecture sim of tb is
  signal clk : std_logic := '0';
  signal cnt : unsigned(15 downto 0) := to_unsigned(${start}, 16);
  signal y : unsigned(9 downto 0);
begin
  uut: entity work.chain port map (clk => clk, cnt => cnt, y => y);
  process begin
    for k in 1 to 8 loop
      wait for 5 ns; clk <= '1';
      wait for 5 ns; clk <= '0';
      report integer'image(to_integer(cnt)) & " " & integer'image(to_integer(y));
      cnt <= cnt + 1;
    end loop;
    wait;
  end process;
end sim;
`;
const tbVerilog = start => `module tb;
  reg clk = 0;
  reg [15:0] cnt = ${start};
  wire [9:0] y;
  chain uut(.clk(clk), .cnt(cnt), .y(y));
  initial begin
    repeat (8) begin
      #5 clk = 1;
      #5 clk = 0;
      $display("%0d %0d", cnt, y);
      cnt = cnt + 1;
    end
  end
endmodule
`;

const file = lang => (lang === 'vhdl' ? 'chain.vhd' : 'chain.v');
const make = (lang, n, o) => (lang === 'vhdl' ? vhdl(n, o) : verilog(n, o));
const tb = (lang, start) => (lang === 'vhdl' ? { path: 'tb.vhd', text: tbVhdl(start) } : { path: 'tb.v', text: tbVerilog(start) });

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
  for (const comb of [false, true]) {
    const name = `${lang} ${comb ? 'combinational' : 'clocked'}`;
    test(`#2577 ${name}: a chain of ${N} branches checks with no warnings and simulates as its short equivalent`, () => {
      const long = make(lang, N, { comb }), short = make(lang, N, { comb, short: true });
      const warnings = comb ? ['warning: Input <clk> is never used.'] : [];
      assert.deepEqual(checkSyntax(file(lang), long), warnings);
      assert.deepEqual(checkSyntax(file(lang), short), warnings);
      for (const start of [0, N - 4]) {
        const a = run([{ path: file(lang), text: long }, tb(lang, start)]);
        const b = run([{ path: file(lang), text: short }, tb(lang, start)]);
        assert.equal(a.length, 8);
        assert.deepEqual(a, b);
        assert.ok(a.every(l => !/^(warning|error|failure)/.test(l)), a.join('\n'));
        // (the values: from the first branches, across the last ones into else)
        const vals = a.map(l => l.replace(/^\w+: /, '').split(' ').map(Number));
        assert.deepEqual(vals.map(([c]) => c), Array.from({ length: 8 }, (_, k) => start + k));
        assert.deepEqual(vals.map(([, y]) => y), vals.map(([c]) => (c < N ? val(c) : 1023)));
      }
    });
  }

  test(`#2577 ${lang}: a combinational chain of ${N} branches without else is one latch, as a chain of 3`, () => {
    const latch = ['warning: Found 10-bit latch for signal <y>. Latches may be generated from incomplete case or if statements.', 'warning: Input <clk> is never used.'];
    assert.deepEqual(checkSyntax(file(lang), make(lang, 3, { comb: true, noElse: true })), latch);
    assert.deepEqual(checkSyntax(file(lang), make(lang, N, { comb: true, noElse: true })), latch);
  });

  test(`#2577 ${lang}: the synthesis input of a chain of ${N} branches is one else if chain`, () => {
    const lib = compile([{ path: file(lang), text: make(lang, N) }]);
    const { text, warnings } = synthesisInput(elaborate(lib, 'chain'));
    assert.deepEqual(warnings, []);
    assert.equal(text.match(/^ *end else if \(/gm).length, N - 1);
    assert.equal(text.match(/^ *end else begin$/gm).length, 1);
  });

  test(`#2577 ${lang}: a chain of ${N} branches translated, then simulated as the original`, () => {
    const to = lang === 'vhdl' ? 'verilog' : 'vhdl';
    const tr = translateSource(make(lang, N), { path: file(lang), to });
    assert.deepEqual(tr.errors, []);
    assert.equal(tr.lang, to);
    assert.deepEqual(checkSyntax(file(to), tr.text), []);
    const start = N - 4;
    assert.deepEqual(run([{ path: file(to), text: tr.text }, tb(to, start)]), run([{ path: file(lang), text: make(lang, N) }, tb(lang, start)])
      .map(l => (lang === 'vhdl' ? l.replace(/^note: /, 'print: ') : l.replace(/^print: /, 'note: '))));
  });
}

// the first if of a parsed tree with an else if: the lines of its branches, and what ends the chain
function chainOf(n) {
  const stack = [n];
  while (stack.length) {
    let x = stack.pop();
    if (!x || typeof x !== 'object') continue;
    if (x.kind === 'if' && x.else?.kind === 'if') {
      const lines = [];
      for (; x?.kind === 'if'; x = x.else) lines.push(x.loc.line);
      return { lines, last: x };
    }
    stack.push(...Object.values(x));
  }
  return null;
}

test('#2577 the parsers: an elsif / else if chain nests in else, each branch at its own line', () => {
  const v = chainOf(parseVhdl(vhdl(4), 'chain.vhd').units);
  assert.deepEqual(v.lines, [13, 14, 15, 16]);
  assert.equal(v.last.kind, 'block');
  const m = chainOf(parseVerilog(verilog(4), 'chain.v').units);
  assert.deepEqual(m.lines, [3, 4, 5, 6]);
  assert.deepEqual([m.last.kind, m.last.loc.line], ['assign', 7]);
});

test('#2577 Verilog: an error in an else if\'s condition makes that else if a null statement', () => {
  const r = parseVerilog('module m(input a, output reg y);\n  always @* if (a) y = 0;\n  else if (a +) y = 1;\n  else y = 0;\nendmodule\n', 'm.v');
  assert.deepEqual(r.errors.map(e => `${e.line}:${e.col} ${e.severity}: ${e.message}`), ['3:15 error: unexpected \')\' in expression', '4:3 error: unexpected \'else\' in module body']);
  const s = r.units[0].items[0].body[0];
  assert.deepEqual([s.kind, s.else.kind], ['if', 'null']);
});

test('#2577 an elaboration that throws (an expression of 20 000 terms) is a design error of simulate, not thrown', () => {
  const text = `module t; integer a = 1, y; initial begin y = ${Array(N).fill('a').join(' + ')}; $display("%0d", y); end endmodule`;
  const r = simulate([{ path: 't.v', text }], 't');
  assert.equal(r.sim, null);
  assert.deepEqual(r.errors.map(e => `${e.file}:${e.line} ${e.severity}: ${e.message}`), ["t.v:1 error: internal error elaborating 't': Maximum call stack size exceeded"]);
});
