// core/lint.js: beginner design checks (latch, sensitivity list, multiple drivers, combinational
// loop, unused / unassigned ports and signals, clocks, Verilog = / <=, case without default,
// integer ranges) and the language rules the elaborator accepts but ISE rejects (mode in / out,
// type errors, missing use clauses, wire / reg). Positive and negative cases in VHDL and Verilog,
// suppression comments, and a regression: the project's examples and generated code are clean.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, elaborate } from '../core/compile.js';
import { designChecks, suppressed, LINT_CHECKS, RULE_CHECKS } from '../core/lint.js';
import { primitiveSources } from '../core/unisim.js';
import * as asm from '../core/asm.js';
import { importIseSch } from '../core/isesch.js';
import { generateHdl } from '../core/schdoc.js';
import { generateTableHdl, newTable } from '../core/logic.js';
import { generateModule } from '../core/modgen.js';
import { generateTestbench, tbPorts, makeVectors } from '../core/testbench.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Design checks of `top` over the sources: ['check@line', …] (sorted). files: { path: text } or [{ path, text, role }] */
function lint(files, top, opts) {
  const srcs = Array.isArray(files) ? files : Object.entries(files).map(([p, text]) => ({ path: p, text }));
  const lib = compile([...primitiveSources(srcs), ...srcs]);
  const d = elaborate(lib, top);
  const errs = [...lib.errors, ...d.diags].filter(x => x.severity === 'error');
  assert.deepEqual(errs.map(e => `${e.file}:${e.line} ${e.message}`), [], 'the design compiles');
  return designChecks(lib, d, opts);
}
const ids = (r) => r.map(d => `${d.check}@${d.line}`).sort();
const only = (r, check) => r.filter(d => d.check === check);

const VH = (decl, body, ports = 'a, b : in std_logic; y : out std_logic', ctx = 'library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;') =>
  `${ctx}\nentity t is port (${ports}); end t;\narchitecture rtl of t is\n${decl}\nbegin\n${body}\nend rtl;\n`;
// line numbers in VH(): line 4 = declarations, the body starts at line 6

// ===================================================================================== latches
test('latch: VHDL if without else in a combinational process (at the if line); else / default / clocked are fine', () => {
  const r = lint({ 't.vhd': VH('', 'process (a, b) begin\n  if a = \'1\' then\n    y <= b;\n  end if;\nend process;') }, 't');
  assert.deepEqual(ids(r), ['latch@7']);
  assert.match(r[0].message, /^Found 1-bit latch for signal <y>\. Latches may be generated from incomplete case or if statements\.$/);
  assert.equal(r[0].severity, 'warning');
  assert.equal(r[0].tool, 'Xst:737');
  assert.equal(r[0].file, 't.vhd');
  // else branch
  assert.deepEqual(ids(lint({ 't.vhd': VH('', 'process (a, b) begin\n  if a = \'1\' then y <= b; else y <= \'0\'; end if;\nend process;') }, 't')), []);
  // default value before the if
  assert.deepEqual(ids(lint({ 't.vhd': VH('', 'process (a, b) begin\n  y <= \'0\';\n  if a = \'1\' then y <= b; end if;\nend process;') }, 't')), []);
  // a clocked process: an if without else is an enable, and no reset is fine (not reported)
  assert.deepEqual(ids(lint({ 't.vhd': VH('', 'process (a) begin\n  if rising_edge(a) then\n    if b = \'1\' then y <= c; end if;\n  end if;\nend process;', 'a, b, c : in std_logic; y : out std_logic') }, 't')), []);
  // conditional assignment without else
  assert.deepEqual(ids(lint({ 't.vhd': VH('', 'y <= b when a = \'1\';') }, 't')), ['latch@6']);
});

test('latch: VHDL case without others in a combinational process; complete enum case is fine', () => {
  const r = lint({ 't.vhd': VH('signal s : std_logic_vector(1 downto 0);', 's <= a & b;\nprocess (s, c) begin\n  case s is\n    when "00" => y <= c;\n    when "01" => y <= \'1\';\n    when others => null;\n  end case;\nend process;', 'a, b, c : in std_logic; y : out std_logic') }, 't');
  assert.deepEqual(ids(r), ['latch@8']);
  const e = lint({ 't.vhd': VH('type st_t is (S0, S1); signal st : st_t;', 'st <= S0 when a = \'1\' else S1;\nprocess (st, c) begin\n  case st is\n    when S0 => y <= c;\n    when S1 => y <= \'1\';\n  end case;\nend process;', 'a, c : in std_logic; y : out std_logic') }, 't');
  assert.deepEqual(ids(e), []);
});

test('latch: Verilog always @* if without else and case without default; complete case is fine', () => {
  const v = `module t(input a, b, input [1:0] s, output reg y, output reg z);
always @* begin
  if (a) y = b;
end
always @* begin
  case (s)
    2'b00: z = a;
    2'b01: z = b;
  endcase
end
endmodule
`;
  assert.deepEqual(ids(lint({ 't.v': v }, 't')), ['case-default@6', 'latch@3', 'latch@6']);
  const ok = `module t(input a, b, input [1:0] s, output reg z);
always @* begin
  case (s)
    2'b00: z = a;  2'b01: z = b;  2'b10: z = 1'b0;  2'b11: z = 1'b1;
  endcase
end
endmodule
`;
  assert.deepEqual(ids(lint({ 't.v': ok }, 't')), []);
  // assign q = g ? d : q;
  assert.deepEqual(ids(lint({ 't.v': 'module t(input g, d, output q);\nassign q = g ? d : q;\nendmodule\n' }, 't')), ['latch@2']);
});

// ===================================================================================== sensitivity
test('sensitivity list: VHDL signal read but not listed (line of the read); full list / clocked / async reset', () => {
  const r = lint({ 't.vhd': VH('', 'process (a) begin\n  y <= a and b;\nend process;') }, 't');
  assert.deepEqual(ids(r), ['sensitivity@7']);
  assert.equal(r[0].message, 'b should be on the sensitivity list of the process');
  assert.equal(r[0].tool, 'HDLCompiler:92');
  assert.deepEqual(ids(lint({ 't.vhd': VH('', 'process (a, b) begin\n  y <= a and b;\nend process;') }, 't')), []);
  // clocked: only the clock (synchronous reset and data are read at the edge)
  const P3 = 'a, b, c : in std_logic; y : out std_logic';
  assert.deepEqual(ids(lint({ 't.vhd': VH('', 'process (a) begin\n  if rising_edge(a) then\n    if b = \'1\' then y <= \'0\'; else y <= c; end if;\n  end if;\nend process;', P3) }, 't')), []);
  // asynchronous reset not in the list
  assert.deepEqual(ids(lint({ 't.vhd': VH('', 'process (a) begin\n  if b = \'1\' then\n    y <= \'0\';\n  elsif rising_edge(a) then\n    y <= c;\n  end if;\nend process;', P3) }, 't')), ['sensitivity@7']);
  assert.deepEqual(ids(lint({ 't.vhd': VH('', 'process (a, b) begin\n  if b = \'1\' then\n    y <= \'0\';\n  elsif rising_edge(a) then\n    y <= c;\n  end if;\nend process;', P3) }, 't')), []);
});

test('sensitivity list: Verilog @(a) missing b (one warning listing them); @* and posedge are fine', () => {
  const r = lint({ 't.v': 'module t(input a, b, c, output reg y);\nalways @(a) y = a & b & c;\nendmodule\n' }, 't');
  assert.deepEqual(ids(r), ['sensitivity@2']);
  assert.match(r[0].message, /missing in the sensitivity list of always block\. The missing signals are: <b> <c>$/);
  assert.deepEqual(ids(lint({ 't.v': 'module t(input a, b, output reg y);\nalways @* y = a & b;\nendmodule\n' }, 't')), []);
  assert.deepEqual(ids(lint({ 't.v': 'module t(input a, b, output reg y);\nalways @(a or b) y = a & b;\nendmodule\n' }, 't')), []);
  assert.deepEqual(ids(lint({ 't.v': 'module t(input clk, d, output reg y);\nalways @(posedge clk) y <= d;\nendmodule\n' }, 't')), []);
});

// ===================================================================================== multiple drivers
test('multiple drivers: two processes / assignments of one signal; separate bits and tri-state are fine', () => {
  const r = lint({ 't.vhd': VH('', 'y <= a;\nprocess (b) begin\n  y <= b;\nend process;') }, 't');
  assert.deepEqual(ids(r), ['multi-driver@8']);
  assert.match(r[0].message, /^Signal <y> in unit <t> is connected to multiple drivers \(lines 6 and 8\)\.$/);
  assert.deepEqual(ids(lint({ 't.vhd': VH('', 'y(0) <= a;\ny(1) <= b;', 'a, b : in std_logic; y : out std_logic_vector(1 downto 0)') }, 't')), []);
  assert.deepEqual(ids(lint({ 't.vhd': VH('', "y <= a when c = '1' else 'Z';\ny <= b when c = '0' else 'Z';", 'a, b, c : in std_logic; y : out std_logic') }, 't')), []);
  // Verilog: two assigns; initial + always of a testbench clock is not a design
  assert.deepEqual(ids(lint({ 't.v': 'module t(input a, b, output y);\nassign y = a;\nassign y = b;\nendmodule\n' }, 't')), ['multi-driver@3']);
  const tb = [{ path: 'tb.v', role: 'sim', text: 'module tb;\nreg clk;\ninitial clk = 0;\nalways #5 clk = ~clk;\nendmodule\n' }];
  assert.deepEqual(ids(lint(tb, 'tb')), []);
  // a register with a reset in its own process: one driver
  assert.deepEqual(ids(lint({ 't.v': 'module t(input clk, rst, d, output reg q);\nalways @(posedge clk or posedge rst) if (rst) q <= 0; else q <= d;\nendmodule\n' }, 't')), []);
});

// ===================================================================================== combinational loops
test('combinational loop: a <-> b, count <= count + 1 outside a clock; a ripple carry is not a loop', () => {
  const r = lint({ 't.vhd': VH('signal p, q : std_logic;', 'p <= q and a;\nq <= p or b;\ny <= q;') }, 't');
  assert.deepEqual(ids(r), ['comb-loop@6']);
  assert.match(r[0].message, /^Unit <t> : the following signal\(s\) form a combinatorial loop: <p>, <q>\.$|^Unit <t> : the following signal\(s\) form a combinatorial loop: <q>, <p>\.$/);
  const c = lint({ 't.vhd': VH('signal n : unsigned(3 downto 0);', 'n <= n + 1;', 'y : out std_logic_vector(3 downto 0)') .replace('begin\nn', 'begin\ny <= std_logic_vector(n);\nn') }, 't');
  assert.deepEqual(ids(c).filter(x => x.startsWith('comb-loop')), ['comb-loop@7']);
  const ripple = VH('signal cy : std_logic_vector(4 downto 0);', `cy(0) <= '0';
g: for i in 0 to 3 generate
  s(i) <= x(i) xor z(i) xor cy(i);
  cy(i + 1) <= (x(i) and z(i)) or (cy(i) and (x(i) xor z(i)));
end generate;
co <= cy(4);`, 'x, z : in std_logic_vector(3 downto 0); s : out std_logic_vector(3 downto 0); co : out std_logic');
  assert.deepEqual(ids(lint({ 't.vhd': ripple }, 't')), []);
  // Verilog: a blocking temporary in always @* is not a loop
  assert.deepEqual(ids(lint({ 't.v': 'module t(input [3:0] a, b, output reg [3:0] y);\nreg [3:0] t;\nalways @* begin t = a & b; t = t | a; y = t; end\nendmodule\n' }, 't')), []);
});

// ===================================================================================== unused / unassigned
test('output never assigned, input never used, signal assigned but never read, signal read but never assigned', () => {
  const r = lint({ 't.vhd': VH('signal s1, s2 : std_logic;', 's1 <= a;\ny <= s2 and b;', 'a, b, c : in std_logic; y, z : out std_logic') }, 't');
  assert.deepEqual(ids(r), ['unassigned-output@2', 'unassigned-signal@4', 'unused-input@2', 'unused-signal@4']);
  const msg = Object.fromEntries(r.map(d => [d.check, d.message]));
  assert.equal(msg['unused-input'], 'Input <c> is never used.');
  assert.equal(msg['unassigned-output'], 'Signal <z>, unconnected in block <t>, is tied to its initial value.');
  assert.match(msg['unused-signal'], /^Signal <s1> is assigned but never used\./);
  assert.match(msg['unassigned-signal'], /^Signal <s2> is used but never assigned\./);
  // a signal with an initial value used as a constant; a clock used only as the edge
  assert.deepEqual(ids(lint({ 't.vhd': VH("signal k : std_logic := '1';", 'process (a) begin if rising_edge(a) then y <= b and k; end if; end process;', 'a, b : in std_logic; y : out std_logic') }, 't')), []);
  // an empty architecture (new source) or a skeleton marked TODO: the ports are not reported yet
  assert.deepEqual(ids(lint({ 't.vhd': VH('', '') }, 't')), []);
  assert.deepEqual(ids(lint({ 't.vhd': VH('', "-- TODO: the logic\ny <= '0';") }, 't')), []);
  // Verilog, through an instance: the child's input is used inside it
  const v = `module inv(input x, output q); assign q = ~x; endmodule
module t(input a, b, output y, output z);
wire w;
inv u(.x(a), .q(y));
endmodule
`;
  assert.deepEqual(ids(lint({ 't.v': v }, 't')), ['unassigned-output@2', 'unused-input@2']);
});

// ===================================================================================== clocks
test('clock used as data, logic used as a clock (divided clock); enable and clk\'event and clk = \'1\' are fine', () => {
  const r = lint({ 't.vhd': VH('', "process (a) begin\n  if rising_edge(a) then y <= b; end if;\nend process;\nz <= a and b;", 'a, b : in std_logic; y, z : out std_logic') }, 't');
  assert.deepEqual(ids(r), ['clock-as-data@9']);
  assert.match(r[0].message, /^Clock signal <a> is used as data/);
  assert.deepEqual(ids(lint({ 't.vhd': VH('', "process (a) begin\n  if a'event and a = '1' then y <= b; end if;\nend process;", 'a, b : in std_logic; y : out std_logic') }, 't')), []);
  const div = VH("signal slow : std_logic := '0';", `process (clk) begin
  if rising_edge(clk) then slow <= not slow; end if;
end process;
process (slow) begin
  if rising_edge(slow) then q <= d; end if;
end process;`, 'clk, d : in std_logic; q : out std_logic');
  const d = lint({ 't.vhd': div }, 't');
  assert.deepEqual(ids(d), ['data-as-clock@9']);
  assert.match(d[0].message, /^Signal <slow> is used as a clock but it is generated by logic \(line 7\)/);
  const en = VH("signal tick : std_logic := '0';", `process (clk) begin
  if rising_edge(clk) then tick <= not tick; end if;
end process;
process (clk) begin
  if rising_edge(clk) then if tick = '1' then q <= d; end if; end if;
end process;`, 'clk, d : in std_logic; q : out std_logic');
  assert.deepEqual(ids(lint({ 't.vhd': en }, 't')), []);
  // a clock passed down to an instance is a port connection, not data
  const h = `module ff(input c, d, output reg q); always @(posedge c) q <= d; endmodule
module t(input clk, d, output q); ff u(.c(clk), .d(d), .q(q)); endmodule
`;
  assert.deepEqual(ids(lint({ 't.v': h }, 't')), []);
});

// ===================================================================================== Verilog = / <=
test('Verilog: blocking in a clocked always block, non-blocking in a combinational one; integers and loops are fine', () => {
  const v = `module t(input clk, a, b, output reg q, output reg y);
always @(posedge clk) q = a;
always @* y <= a & b;
endmodule
`;
  const r = lint({ 't.v': v }, 't');
  assert.deepEqual(ids(r), ['blocking@2', 'nonblocking@3']);
  assert.match(r.find(d => d.check === 'blocking').message, /^Blocking assignment \(=\) to <q> in a clocked always block/);
  const ok = `module t(input clk, input [3:0] a, output reg [3:0] q, output reg [2:0] n);
integer i;
always @(posedge clk) q <= a;
always @* begin n = 0; for (i = 0; i < 4; i = i + 1) n = n + a[i]; end
endmodule
`;
  assert.deepEqual(ids(lint({ 't.v': ok }, 't')), []);
});

// ===================================================================================== case / integer
test('case without others in VHDL (std_logic_vector selector) / without default in a Verilog combinational block', () => {
  const r = lint({ 't.vhd': VH('', "process (a, b) begin\n  y <= '0';\n  case std_logic_vector'(a & b) is\n    when \"00\" => y <= '1';\n    when \"11\" => y <= '1';\n  end case;\nend process;") }, 't');
  assert.deepEqual(only(r, 'case-default').map(d => d.line), [8]);
  assert.match(only(r, 'case-default')[0].message, /^Case statement without 'when others' choice$/);
  // default assignment first: no latch, only the case warning
  assert.deepEqual(only(r, 'latch'), []);
  const ok = lint({ 't.vhd': VH('', "process (a, b) begin\n  case std_logic_vector'(a & b) is\n    when \"00\" => y <= '1';\n    when others => y <= '0';\n  end case;\nend process;") }, 't');
  assert.deepEqual(ids(ok), []);
});

test('integer without a range (info, VHDL); integer range / natural range are fine', () => {
  const r = lint({ 't.vhd': VH('signal n : integer := 0;', "process (a) begin if rising_edge(a) then n <= n + 1; end if; end process;\ny <= '1' when n = 5 else '0';", 'a : in std_logic; y : out std_logic') }, 't');
  assert.deepEqual(ids(r), ['integer-range@4']);
  assert.equal(r[0].severity, 'info');
  const v = lint({ 't.vhd': VH('', "process (a)\n  variable k : integer;\nbegin\n  if rising_edge(a) then k := k + 1; if k = 3 then y <= '1'; end if; end if;\nend process;", 'a : in std_logic; y : out std_logic') }, 't');
  assert.deepEqual(ids(v), ['integer-range@7']);
  assert.deepEqual(ids(lint({ 't.vhd': VH('signal n : integer range 0 to 9 := 0;', "process (a) begin if rising_edge(a) then n <= n + 1; end if; end process;\ny <= '1' when n = 5 else '0';", 'a : in std_logic; y : out std_logic') }, 't')), []);
});

// ===================================================================================== rules (errors)
test('rules: VHDL input assigned, output read (VHDL-93), with an internal signal it is fine', () => {
  const r = lint({ 't.vhd': VH('', "a <= b;\ny <= b;\nz <= not y;", 'a, b : in std_logic; y, z : out std_logic') }, 't');
  assert.deepEqual(ids(r), ['mode-in@6', 'mode-out@8', 'unused-input@2']);
  assert.ok(r.filter(d => d.check.startsWith('mode')).every(d => d.severity === 'error'));
  assert.equal(r.find(d => d.check === 'mode-in').message, 'Object <a> of mode IN can not be updated.');
  assert.equal(r.find(d => d.check === 'mode-out').message, 'Object <y> of mode OUT can not be read.');
  assert.deepEqual(ids(lint({ 't.vhd': VH('signal yi : std_logic;', "yi <= a and b;\ny <= yi;\nz <= not yi;", 'a, b : in std_logic; y, z : out std_logic') }, 't')), []);
  // a counter that reads its output port
  const c = lint({ 't.vhd': VH('', 'process (clk) begin if rising_edge(clk) then q <= std_logic_vector(unsigned(q) + 1); end if; end process;', 'clk : in std_logic; q : out std_logic_vector(3 downto 0)') }, 't');
  assert.deepEqual(ids(c), ['mode-out@6']);
});

test('rules: VHDL type errors std_logic / std_logic_vector / unsigned / integer / boolean', () => {
  const T = (decl, body) => ids(lint({ 't.vhd': VH(decl, body, 'a, b : in std_logic; y : out std_logic') }, 't')).filter(x => x.startsWith('type-'));
  assert.deepEqual(T('signal v : std_logic_vector(3 downto 0);', "v <= (others => a);\ny <= v;"), ['type-mismatch@7']);
  assert.deepEqual(T('signal v : std_logic_vector(3 downto 0);', "v <= a;\ny <= v(0);"), ['type-mismatch@6']);
  assert.deepEqual(T('signal v : std_logic_vector(3 downto 0); signal u : unsigned(3 downto 0);', "u <= (others => a);\nv <= u;\ny <= v(0);"), ['type-mismatch@7']);
  assert.deepEqual(T('signal v : std_logic_vector(3 downto 0);', "v <= 5;\ny <= v(0);"), ['type-mismatch@6']);
  assert.deepEqual(T('', 'y <= (a = b);'), ['type-mismatch@6']);
  assert.deepEqual(T('', 'y <= "1";'), ['type-mismatch@6']);
  // correct conversions
  assert.deepEqual(T('signal v : std_logic_vector(3 downto 0); signal u : unsigned(3 downto 0);', "u <= (others => a);\nv <= std_logic_vector(u + 1);\ny <= v(0) or v(3);"), []);
  const r = lint({ 't.vhd': VH('signal v : std_logic_vector(3 downto 0);', "v <= (others => a);\ny <= v;", 'a, b : in std_logic; y : out std_logic') }, 't');
  assert.equal(r.find(d => d.check === 'type-mismatch').message, 'Type error near v ; current type std_logic_vector; expected type std_logic');
});

test('rules: numeric_std / std_logic_1164 used without their use clause', () => {
  const noNum = VH('signal u : unsigned(3 downto 0);', "u <= to_unsigned(3, 4);\ny <= u(0);", 'y : out std_logic', 'library ieee; use ieee.std_logic_1164.all;');
  const r = lint({ 't.vhd': noNum }, 't');
  assert.deepEqual(ids(r), ['missing-library@4']);
  assert.equal(r[0].message, '<unsigned> is not declared.');
  assert.equal(r[0].tool, 'HDLCompiler:69');
  assert.equal(r[0].col, 12);
  const noLib = VH('', "y <= '1';", 'y : out std_logic', '');
  assert.deepEqual(lint({ 't.vhd': noLib }, 't').map(d => [d.check, d.line, d.message]), [['missing-library', 2, '<std_logic> is not declared.']]);
  // in a comment it does not count; std_logic_arith counts as a numeric package
  assert.deepEqual(ids(lint({ 't.vhd': VH('', "-- y <= to_unsigned(1, 1)(0);\ny <= '1';", 'y : out std_logic', 'library ieee; use ieee.std_logic_1164.all;') }, 't')), []);
  assert.deepEqual(ids(lint({ 't.vhd': VH('signal u : unsigned(3 downto 0);', "u <= \"0011\";\ny <= u(0);", 'y : out std_logic', 'library ieee; use ieee.std_logic_1164.all; use ieee.std_logic_arith.all;') }, 't')), []);
});

test('rules: Verilog procedural assignment to a wire, continuous assignment to a reg', () => {
  const r = lint({ 't.v': 'module t(input a, b, output y, output z);\nwire w;\nreg r;\nalways @* w = a;\nassign r = b;\nassign y = w;\nassign z = r;\nendmodule\n' }, 't');
  assert.deepEqual(ids(r), ['reg-continuous@5', 'wire-procedural@4']);
  assert.match(r.find(d => d.check === 'wire-procedural').message, /^Procedural assignment to a non-register <w> is not permitted/);
  assert.deepEqual(ids(lint({ 't.v': 'module t(input a, output y);\nalways @* y = a;\nendmodule\n' }, 't')), ['wire-procedural@2']);
  assert.deepEqual(ids(lint({ 't.v': 'module t(input a, output reg y);\nalways @* y = a;\nendmodule\n' }, 't')), []);
  // Verilog-1995 style: output y; reg y;
  assert.deepEqual(ids(lint({ 't.v': 'module t(a, y);\ninput a;\noutput y;\nreg y;\nalways @* y = a;\nendmodule\n' }, 't')), []);
  assert.deepEqual(ids(lint({ 't.v': 'module t(input a, output reg y);\nassign y = a;\nendmodule\n' }, 't')), ['reg-continuous@2']);
});

// ===================================================================================== options and suppression
test('suppression comments (-- / //, on the line or the line above, by id or all) and the lint / rules options', () => {
  const base = 'process (a, b) begin\n  if a = \'1\' then -- silinx: ignore latch\n    y <= b;\n  end if;\nend process;';
  assert.deepEqual(ids(lint({ 't.vhd': VH('', base) }, 't')), []);
  assert.deepEqual(ids(lint({ 't.vhd': VH('', base.replace('ignore latch', 'ignore sensitivity')) }, 't')), ['latch@7']);
  assert.deepEqual(ids(lint({ 't.vhd': VH('', base.replace(' -- silinx: ignore latch', '').replace('begin\n', 'begin\n  -- silinx: ignore\n')) }, 't')), []);
  assert.deepEqual(ids(lint({ 't.v': 'module t(input a, b, output reg y);\n// silinx: ignore latch, sensitivity\nalways @(a) if (a) y = b;\nendmodule\n' }, 't')), []);
  assert.equal(suppressed('x\n// silinx: ignore comb-loop multi-driver\ny', 3, 'multi-driver'), true);
  assert.equal(suppressed('x\n// silinx: ignore comb-loop\ny', 3, 'multi-driver'), false);
  assert.equal(suppressed('a\nb', 2, 'latch'), false);
  // lint: false keeps the rules (errors) only; rules: false keeps the warnings only
  const both = VH('', "a <= b;\nprocess (a, b) begin if a = '1' then y <= b; end if; end process;", 'a, b : in std_logic; y : out std_logic');
  assert.deepEqual(ids(lint({ 't.vhd': both }, 't', { lint: false })), ['mode-in@6']);
  assert.deepEqual(ids(lint({ 't.vhd': both }, 't', { rules: false })), ['latch@7']);
  // nothing while the design has errors (the errors come first)
  const lib = compile([{ path: 't.vhd', text: VH('', 'y <= nope;') }]);
  assert.deepEqual(designChecks(lib, elaborate(lib, 't')), []);
  assert.ok(LINT_CHECKS.includes('latch') && RULE_CHECKS.includes('mode-out'));
});

test('testbenches (role sim) get the rules but no lint warnings; the design under test is checked', () => {
  const dut = { path: 'and2.vhd', text: VH('', 'process (a) begin y <= a and b; end process;', 'a, b : in std_logic; y : out std_logic') };
  const tb = { path: 'tb.vhd', role: 'sim', text: `library ieee; use ieee.std_logic_1164.all;
entity tb is end tb;
architecture sim of tb is
  signal a, b, y, unused : std_logic := '0';
begin
  uut: entity work.t port map (a => a, b => b, y => y);
  process begin a <= '1'; wait for 10 ns; b <= '1'; wait; end process;
end sim;
` };
  assert.deepEqual(lint([dut, tb], 'tb').map(d => `${d.file}:${d.check}`), ['and2.vhd:sensitivity']);
});

// ===================================================================================== regression
const ALL = [...LINT_CHECKS, ...RULE_CHECKS];
function lintProject(files, tops) {
  const out = [];
  const lib = compile([...primitiveSources(files), ...files]);
  for (const top of tops) {
    const d = elaborate(lib, top);
    const errs = [...lib.errors, ...d.diags].filter(x => x.severity === 'error');
    assert.deepEqual(errs.map(e => e.message), [], top);
    for (const x of designChecks(lib, d)) { assert.ok(ALL.includes(x.check)); out.push(`${top}: ${x.file}:${x.line} ${x.check}`); }
  }
  return out;
}

test('regression: the blinky example (design and testbench) has no design-check messages', () => {
  const dir = path.join(ROOT, 'examples/blinky');
  const pj = JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8'));
  const files = pj.files.filter(f => /\.(vhdl?|v)$/.test(f.path)).map(f => ({ path: f.path, role: f.role, text: fs.readFileSync(path.join(dir, f.path), 'utf8') }));
  assert.deepEqual(lintProject(files, [pj.top, pj.simTop]), []);
});

test('regression: the test fixture designs are clean, except the deliberate latches of the latch design', () => {
  const base = path.join(ROOT, 'test/fixtures/designs');
  const out = [];
  for (const name of fs.readdirSync(base)) {
    const dj = JSON.parse(fs.readFileSync(path.join(base, name, 'design.json'), 'utf8'));
    const files = dj.files.map(f => ({ path: `${name}/${f}`, text: fs.readFileSync(path.join(base, name, f), 'utf8') }));
    out.push(...lintProject(files, [dj.top]));
  }
  assert.deepEqual(out, ['top: latch/top.vhd:33 latch', 'top: latch/top.vhd:42 latch', 'top: latch/top.vhd:49 latch']);
  for (const lang of ['vhdl', 'verilog']) {
    const dir = path.join(ROOT, 'test/fixtures', lang);
    const files = fs.readdirSync(dir).map(f => ({ path: f, role: /^tb_/.test(f) ? 'sim' : 'design', text: fs.readFileSync(path.join(dir, f), 'utf8') }));
    const lib = compile(files);
    const tops = lib.parsed.flatMap(p => p.units.filter(u => u.kind === 'module').map(u => u.name)).filter(n => !lib.parsed.some(p => p.units.some(u => (u.items || []).some(it => it.kind === 'instance' && it.module === n))));
    assert.deepEqual(lintProject(files, [...new Set(tops)]), [], lang);
  }
});

test('regression: generated HDL (ASM charts, ISE schematics, truth tables, Module Wizard, Test Bench Wizard) is clean', () => {
  const out = [];
  for (const lang of ['vhdl', 'verilog']) {
    const ext = lang === 'vhdl' ? 'vhd' : 'v';
    const speed = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/blinky/src/speed_ctrl.asm.json'), 'utf8'));
    for (const m of [speed, asm.newModel('fsm', lang)]) {
      const g = asm.generate(asm.normalizeModel(m), lang);
      const code = typeof g === 'string' ? g : g.code;
      const lib = compile([{ path: `asm.${ext}`, text: code }]);
      const top = lib.parsed[0].units.find(u => u.kind === 'module').name;
      out.push(...lintProject([{ path: `asm.${ext}`, text: code }], [top]));
    }
    for (const f of ['MyAND2b4.sch', 'Mux4to1b4.sch', 'list1.sch', 'Counter_2b.sch']) {
      const { doc } = importIseSch(fs.readFileSync(path.join(ROOT, 'test/fixtures/ise-sch', f), 'utf8'), { name: f.replace(/\.sch$/, ''), lang });
      const g = generateHdl(doc, { lang });
      out.push(...lintProject([{ path: g.filename, text: g.code }], [doc.name]));
    }
    const t = newTable('maj', ['a', 'b', 'c'], ['f']);
    t.table.f = '00010111';
    const tt = generateTableHdl(t, lang);
    out.push(...lintProject([{ path: tt.filename, text: tt.code }], ['maj']));
    const ports = [{ name: 'clk', dir: 'in' }, { name: 'rst', dir: 'in' }, { name: 'd', dir: 'in', width: 4 }, { name: 'q', dir: 'out', width: 4 }];
    for (const kind of ['comb', 'seq']) for (const mode of ['none', 'sync', 'async']) {
      const g = generateModule({ lang, name: 'm1', kind, ports, clock: 'clk', reset: { port: 'rst', mode, active: '1' } });
      out.push(...lintProject([{ path: `m1.${ext}`, text: typeof g === 'string' ? g : g.code }], ['m1']));
    }
    // a test bench of the truth-table module
    const ports2 = tbPorts(elaborate(compile([{ path: tt.filename, text: tt.code }]), 'maj'));
    const tb = generateTestbench({ name: 'tb_maj', lang, uut: { name: 'maj', params: [] }, ports: ports2, vectors: makeVectors(ports2.filter(x => x.dir === 'in'), { mode: 'exhaustive' }) });
    out.push(...lintProject([{ path: tt.filename, text: tt.code }, { path: `tb_maj.${ext}`, role: 'sim', text: typeof tb === 'string' ? tb : tb.code }], ['tb_maj']));
  }
  assert.deepEqual(out, []);
});

test('regression: typical first-semester designs (2-process FSM, selected assignment, counter, decoder, Verilog FSM) are clean', () => {
  const fsm = `library ieee; use ieee.std_logic_1164.all;
entity fsm is port (clk, rst, x : in std_logic; z : out std_logic); end fsm;
architecture rtl of fsm is
  type state_t is (A, B, C);
  signal state, next_state : state_t;
begin
  process (clk, rst) begin
    if rst = '1' then state <= A;
    elsif rising_edge(clk) then state <= next_state;
    end if;
  end process;
  process (state, x) begin
    next_state <= state;
    z <= '0';
    case state is
      when A => if x = '1' then next_state <= B; end if;
      when B => if x = '0' then next_state <= C; end if;
      when C => z <= '1'; next_state <= A;
    end case;
  end process;
end rtl;
`;
  const dec = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity dec is port (clk, en, up : in std_logic; sel : in std_logic_vector(1 downto 0); a, b : in std_logic_vector(3 downto 0);
  y : out std_logic_vector(3 downto 0); seg : out std_logic_vector(6 downto 0); q : out std_logic_vector(3 downto 0)); end dec;
architecture rtl of dec is
  signal cnt : unsigned(3 downto 0) := (others => '0');
  signal n : natural range 0 to 9 := 0;
begin
  with sel select y <= a when "00", b when "01", a and b when "10", (others => '0') when others;
  process (clk) begin
    if rising_edge(clk) then
      if en = '1' then
        if up = '1' then cnt <= cnt + 1; else cnt <= cnt - 1; end if;
        if n = 9 then n <= 0; else n <= n + 1; end if;
      end if;
    end if;
  end process;
  q <= std_logic_vector(cnt) when n < 5 else not std_logic_vector(cnt);
  process (cnt)
    variable v : integer range 0 to 15;
  begin
    v := to_integer(cnt);
    case v is
      when 0 => seg <= "1000000";
      when 1 => seg <= "1111001";
      when 2 => seg <= "0100100";
      when others => seg <= "1111111";
    end case;
  end process;
end rtl;
`;
  const vfsm = `module vfsm(input clk, rst, x, output reg z, output [1:0] st);
  localparam A = 2'd0, B = 2'd1, C = 2'd2;
  reg [1:0] state, next;
  always @(posedge clk or posedge rst)
    if (rst) state <= A; else state <= next;
  always @* begin
    next = state; z = 1'b0;
    case (state)
      A: if (x) next = B;
      B: if (!x) next = C;
      C: begin z = 1'b1; next = A; end
      default: next = A;
    endcase
  end
  assign st = state;
endmodule
`;
  assert.deepEqual(lintProject([{ path: 'fsm.vhd', text: fsm }], ['fsm']), []);
  assert.deepEqual(lintProject([{ path: 'dec.vhd', text: dec }], ['dec']), []);
  assert.deepEqual(lintProject([{ path: 'vfsm.v', text: vfsm }], ['vfsm']), []);
});
