// Deeply nested expressions (#3395): nested parentheses, calls, concatenations, unary operators and ?: in then branches
// recursed once per level in the parsers and every pass after them (the binder, the simulator, the design checks, the
// synthesis input, the translations), and overflowed the stack from a few hundred levels (the Verilog parser's
// parentheses from 500). The parsers read an expression nested MAX_NESTING (256) levels deep, every pass after them
// takes it; a deeper one is an error of the file at the level past the limit, one error however deep, the rest of the
// file read. Expressions MAX_NESTING levels deep in VHDL and Verilog: Check Syntax with no warnings, simulated against
// values computed here, the synthesis input with no warnings, translated both ways (a few levels less: a translation's
// conversions nest), checked and simulated again; one level more, and 20 000 levels, the error.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { synthesisInput } from '../core/synth-front.js';
import { translateSource } from '../core/translate.js';
import { MAX_NESTING, NESTING_MESSAGE } from '../packages/silinx-hdl/src/util.js';

const N = MAX_NESTING - 1;   // (levels nested in a statement's expression, itself the first one)
const DEEP = 20000;

// the expressions, n levels nested in the statement's: p = a + (a + (… b)), u = ~~…a / not (not (… a)), f =
// inc(inc(… a)), and in Verilog c = a > 0 ? a > 1 ? … a : 7 : 0 (a ?: in each then branch) and q = {{… {a} …}}
const sum = n => `${'a + ('.repeat(n)}b${')'.repeat(n)}`;
const calls = n => `${'inc('.repeat(n)}a${')'.repeat(n)}`;
const EXPRS = {
  verilog: {
    p: sum,
    u: n => `${'~'.repeat(n)}a`,
    f: calls,
    c: n => `${Array.from({ length: n }, (_, i) => `a > ${i} ? `).join('')}a${Array.from({ length: n }, (_, i) => ` : 8'd${((n - 1 - i) * 7) % 256}`).join('')}`,
    q: n => `${'{'.repeat(n)}a${'}'.repeat(n)}`
  },
  vhdl: {
    p: sum,
    u: n => `${'not ('.repeat(n)}a${')'.repeat(n)}`,
    f: calls
  }
};
const outs = (lang, then = true) => Object.keys(EXPRS[lang]).filter(k => then || k !== 'c');

function verilog(n, { only = outs('verilog') } = {}) {
  return `module nest(input [7:0] a, input [7:0] b, output [7:0] p, output [7:0] u, output [7:0] f, output [7:0] c, output [7:0] q);
  function [7:0] inc(input [7:0] x);
    inc = x + 1;
  endfunction
${outs('verilog').map(k => `  assign ${k} = ${only.includes(k) ? EXPRS.verilog[k](n) : '8\'d0'};`).join('\n')}
endmodule
`;
}

function vhdl(n, { only = outs('vhdl') } = {}) {
  return `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity nest is
  port (a, b : in unsigned(7 downto 0); p, u, f, c, q : out unsigned(7 downto 0));
end nest;

architecture rtl of nest is
  function inc(x : unsigned(7 downto 0)) return unsigned is
  begin
    return x + 1;
  end function;
begin
${outs('vhdl').map(k => `  ${k} <= ${only.includes(k) ? EXPRS.vhdl[k](n) : '(others => \'0\')'};`).join('\n')}
  c <= (others => '0');
  q <= (others => '0');
end rtl;
`;
}

// the values at a, b (the reference, computed here; 0 for what the design does not have)
function expected(lang, n, a, b, then = true) {
  const has = k => outs(lang, then).includes(k);
  const p = (a * n + b) % 256, u = n % 2 ? 255 - a : a, f = (a + n) % 256;
  const c = has('c') ? (a < n ? (a * 7) % 256 : a) : 0, q = has('q') ? a : 0;
  return `${p} ${u} ${f} ${c} ${q}`;
}

const STEPS = [[0, 0], [1, 2], [7, 200], [100, 33], [254, 1], [255, 255]];
const tbVhdl = () => `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity tb is end tb;

architecture sim of tb is
  signal a, b, p, u, f, c, q : unsigned(7 downto 0);
begin
  uut: entity work.nest port map (a => a, b => b, p => p, u => u, f => f, c => c, q => q);
  process begin
${STEPS.map(([x, y]) => `    a <= to_unsigned(${x}, 8); b <= to_unsigned(${y}, 8);
    wait for 10 ns;
    report integer'image(to_integer(p)) & " " & integer'image(to_integer(u)) & " " & integer'image(to_integer(f)) & " " & integer'image(to_integer(c)) & " " & integer'image(to_integer(q));`).join('\n')}
    wait;
  end process;
end sim;
`;
const tbVerilog = () => `module tb;
  reg [7:0] a, b;
  wire [7:0] p, u, f, c, q;
  nest uut(.a(a), .b(b), .p(p), .u(u), .f(f), .c(c), .q(q));
  initial begin
${STEPS.map(([x, y]) => `    a = ${x}; b = ${y};
    #10 $display("%0d %0d %0d %0d %0d", p, u, f, c, q);`).join('\n')}
  end
endmodule
`;

const file = lang => (lang === 'vhdl' ? 'nest.vhd' : 'nest.v');
const make = (lang, n, o) => (lang === 'vhdl' ? vhdl(n, o) : verilog(n, o));
const tb = lang => (lang === 'vhdl' ? { path: 'tb.vhd', text: tbVhdl() } : { path: 'tb.v', text: tbVerilog() });

// Check Syntax of the design (nest): its errors and warnings, the design checks' included
function checkSyntax(path, text) {
  const lib = compile([{ path, text }]);
  const design = elaborate(lib, 'nest');
  return [...lib.errors, ...design.diags, ...designChecks(lib, design, { lint: true })].map(d => `${d.severity}: ${d.message}`);
}

// the simulation's written values (any warning or error fails)
function run(srcs) {
  const r = simulate(srcs, 'tb');
  assert.deepEqual(r.errors.map(e => e.message), []);
  const log = r.sim.log.map(l => `${l.kind}: ${l.text}`);
  assert.ok(log.every(l => /^(note|print): /.test(l)), log.join('\n'));
  return log.map(l => l.replace(/^\w+: /, ''));
}

for (const lang of ['vhdl', 'verilog']) {
  test(`#3395 ${lang}: expressions nested ${MAX_NESTING} levels deep check with no warnings and simulate to their values`, () => {
    const text = make(lang, N);
    assert.deepEqual(checkSyntax(file(lang), text), []);
    assert.deepEqual(run([{ path: file(lang), text }, tb(lang)]), STEPS.map(([a, b]) => expected(lang, N, a, b)));
  });

  test(`#3395 ${lang}: the synthesis input of expressions nested ${MAX_NESTING} levels deep`, () => {
    const lib = compile([{ path: file(lang), text: make(lang, N) }]);
    const { text, warnings } = synthesisInput(elaborate(lib, 'nest'));
    assert.deepEqual(warnings, []);
    assert.match(text, /^module nest \(/m);
  });

  test(`#3395 ${lang}: expressions nested ${MAX_NESTING - 8} levels deep translated, checked, then simulated as the original`, () => {
    const n = MAX_NESTING - 8, to = lang === 'vhdl' ? 'verilog' : 'vhdl';
    // (Verilog's ?: in a then branch has no translation to VHDL)
    const text = make(lang, n, { only: outs(lang, false) });
    const tr = translateSource(text, { path: file(lang), to });
    assert.deepEqual(tr.errors, []);
    assert.deepEqual(checkSyntax(file(to), tr.text), []);
    const here = run([{ path: file(lang), text }, tb(lang)]);
    assert.deepEqual(here, STEPS.map(([a, b]) => expected(lang, n, a, b, false)));
    assert.deepEqual(run([{ path: file(to), text: tr.text }, tb(to)]), here);
  });

  for (const k of outs(lang)) {
    test(`#3395 ${lang} ${k}: one level more than ${MAX_NESTING}, and ${DEEP} levels, one error at the level past the limit, the rest read`, () => {
      for (const n of [N + 1, DEEP]) {
        const text = make(lang, n, { only: [k] });
        const lib = compile([{ path: file(lang), text }]);
        const line = text.split('\n').findIndex(l => l.trimStart().startsWith(`${k} <=`) || l.includes(`assign ${k} =`)) + 1;
        const stmt = text.split('\n')[line - 1];
        assert.deepEqual(lib.errors.map(e => `${e.file}:${e.line} ${e.severity}: ${e.message}`), [`${file(lang)}:${line} error: ${NESTING_MESSAGE}`]);
        // (at the level past the limit: in the statement, after its first MAX_NESTING levels)
        const col = lib.errors[0].col;
        assert.ok(col > stmt.indexOf(k) + 1 && col <= stmt.length, `${col}`);
        // (the rest of the file read: the design elaborates, every output but this one's statement)
        const design = elaborate(lib, 'nest');
        assert.ok(design.top, JSON.stringify(design.diags));
      }
    });
  }
}

test(`#3395 the error's place: the token past ${MAX_NESTING} levels`, () => {
  const v = compile([{ path: 'm.v', text: `module m(input [7:0] a, output [7:0] y);\n  assign y = ${'('.repeat(MAX_NESTING)}a${')'.repeat(MAX_NESTING)};\nendmodule\n` }]);
  // (the statement's expression is the first level, each ( opens one more: at the start of level MAX_NESTING + 1)
  assert.deepEqual(v.errors.map(e => `${e.line}:${e.col} ${e.message}`), [`2:${14 + MAX_NESTING} ${NESTING_MESSAGE}`]);
  const u = compile([{ path: 'm.v', text: `module m(input [7:0] a, output [7:0] y);\n  assign y = ${'~'.repeat(MAX_NESTING)}a;\nendmodule\n` }]);
  assert.deepEqual(u.errors.map(e => `${e.line}:${e.col} ${e.message}`), [`2:${14 + MAX_NESTING} ${NESTING_MESSAGE}`]);
  const h = compile([{ path: 'm.vhd', text: `entity m is port (a : in bit; y : out bit); end m;\narchitecture r of m is\nbegin\n  y <= ${'('.repeat(MAX_NESTING)}a${')'.repeat(MAX_NESTING)};\nend r;\n` }]);
  assert.deepEqual(h.errors.map(e => `${e.line}:${e.col} ${e.message}`), [`4:${8 + MAX_NESTING} ${NESTING_MESSAGE}`]);
  // (MAX_NESTING levels: no error)
  const ok = compile([{ path: 'm.v', text: `module m(input [7:0] a, output [7:0] y);\n  assign y = ${'('.repeat(MAX_NESTING - 1)}a${')'.repeat(MAX_NESTING - 1)};\nendmodule\n` }]);
  assert.deepEqual(ok.errors, []);
});

test(`#3395 simulate: ${DEEP} nested unary operators, the file's error (not thrown)`, () => {
  const text = `module t; integer a = 1, y; initial begin y = ${'~'.repeat(DEEP)}a; $display("%0d", y); end endmodule`;
  const r = simulate([{ path: 't.v', text }], 't');
  assert.equal(r.sim, null);
  assert.deepEqual(r.errors.map(e => `${e.file}:${e.line} ${e.severity}: ${e.message}`), [`t.v:1 error: ${NESTING_MESSAGE}`]);
});

test('#3395 the translation to VHDL: not of a not in parentheses (VHDL\'s not takes a primary)', () => {
  const tr = translateSource('module m(input [7:0] a, input c, output [7:0] y, output z);\n  assign y = ~~~a;\n  assign z = !!c;\nendmodule\n', { path: 'm.v', to: 'vhdl' });
  assert.deepEqual(tr.errors, []);
  assert.match(tr.text, /y <= not \(not \(not a\)\);/);
  assert.deepEqual(compile([{ path: 'm.vhd', text: tr.text }]).errors, []);
});
