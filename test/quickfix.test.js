// Quick fixes of the errors of an HDL source (core/quickfix.js, #179): for each kind, the fixes
// offered for the diagnostic of the front end / design checks (title and exact resulting text), and
// the diagnostics of the fixed source (none, or exactly the ones that remain). Where a fix would not
// be right with high confidence, none is offered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { quickFixes, applyFix, nearestNames } from '../core/quickfix.js';
import { parse as parseVhdl } from '../core/vhdl/parser.js';
import { parse as parseVerilog } from '../core/verilog/parser.js';
import { readdirSync, readFileSync } from 'node:fs';

// the diagnostics of one source, as the editor's live check gets them
function diags(text, lang) {
  const path = lang === 'verilog' ? 'f.v' : 'f.vhd';
  const lib = compile([{ path, text }]);
  const out = [...lib.errors];
  for (const u of (lib.parsed.find(p => p.file === path)?.units || []).filter(x => x.kind === 'module')) {
    let design;
    try { design = elaborate(lib, u.name); } catch (e) { out.push({ line: u.loc?.line || 1, col: 1, severity: 'error', message: e.message }); continue; }
    out.push(...design.diags, ...designChecks(lib, design));
  }
  return out;
}
const messages = (text, lang) => diags(text, lang).map(d => `${d.severity}:${d.line}: ${d.message}`);
const MODULES = [{ name: 'counter', ports: ['clk', 'reset', 'count'], params: ['WIDTH'] }];
/** The fixes of the (first) diagnostic whose message matches re: [{ title, text }]. */
function fixes(text, lang, re) {
  const d = diags(text, lang).find(x => re.test(x.message));
  assert.ok(d, `no diagnostic ${re} in ${messages(text, lang).join(' | ')}`);
  return quickFixes(text, lang, d, { modules: MODULES }).map(f => ({ title: f.title, text: applyFix(text, f) }));
}

const HEAD = 'library ieee;\nuse ieee.std_logic_1164.all;\n';

test('nearest names: edit distance (a swap counts 1), the best ones only, nothing for a name of 1 or 2 letters but its case', () => {
  assert.deepEqual(nearestNames('enabel', ['enable', 'clk', 'reset'], 'vhdl'), ['enable']);
  assert.deepEqual(nearestNames('count_enn', ['count_en', 'count', 'cnt'], 'vhdl'), ['count_en']);
  assert.deepEqual(nearestNames('cnt', ['cnt1', 'cnt2', 'clk'], 'vhdl'), ['cnt1', 'cnt2']);
  assert.deepEqual(nearestNames('t', ['a', 'b', 'y'], 'vhdl'), []);
  assert.deepEqual(nearestNames('Clk', ['clk', 'rst'], 'verilog'), ['clk']);
  assert.deepEqual(nearestNames('led', ['blink', 'state'], 'verilog'), []);
});

test('VHDL: a misspelt signal / port / function / type -> the declared name; an undeclared signal that is assigned -> its declaration', () => {
  const src = `${HEAD}entity top is
  port (clk, count_en : in std_logic; q : out std_logic);
end top;
architecture rtl of top is
  signal r : std_logic := '0';
begin
  process (clk)
  begin
    if rising_egde(clk) then
      if count_enn = '1' then r <= not r; end if;
    end if;
  end process;
  q <= r;
end rtl;
`;
  // (the elaboration stops at the first error of a unit)
  const f1 = fixes(src, 'vhdl', /'rising_egde' is not declared/);
  assert.deepEqual(f1, [{ title: "Change 'rising_egde' to 'rising_edge'", text: src.replace('rising_egde', 'rising_edge') }]);
  const f2 = fixes(f1[0].text, 'vhdl', /'count_enn' is not declared/);
  assert.deepEqual(f2, [{ title: "Change 'count_enn' to 'count_en'", text: f1[0].text.replace('count_enn', 'count_en') }]);
  assert.deepEqual(messages(f2[0].text, 'vhdl'), []);

  const ty = `${HEAD}entity top is port (a : in std_logic; y : out std_logic); end top;
architecture rtl of top is
  signal t : std_logc;
begin
  t <= a;
  y <= t;
end rtl;
`;
  const ft = fixes(ty, 'vhdl', /unknown type/);
  assert.deepEqual(ft, [{ title: "Change 'std_logc' to 'std_logic'", text: ty.replace('std_logc', 'std_logic') }]);
  assert.deepEqual(messages(ft[0].text, 'vhdl'), []);

  const und = `${HEAD}entity top is
  port (a, b : in std_logic; s : in std_logic_vector(3 downto 0); y : out std_logic; v : out std_logic_vector(3 downto 0));
end top;
architecture rtl of top is
  signal keep : std_logic;
begin
  t <= a and b;
  y <= t;
  w <= s;
  v <= w;
  keep <= '0';
end rtl;
`;
  // (t: a name of one letter, no misspelling is offered for it)
  const fd = fixes(und, 'vhdl', /'t' is not declared/);
  assert.deepEqual(fd, [{ title: "Declare 'signal t : std_logic'", text: und.replace('  signal keep : std_logic;\n', '  signal keep : std_logic;\n  signal t : std_logic;\n') }]);
  const fw = fixes(fd[0].text, 'vhdl', /'w' is not declared/);
  assert.deepEqual(fw, [{ title: "Declare 'signal w : std_logic_vector(3 downto 0)'", text: fd[0].text.replace('  signal t : std_logic;\n', '  signal t : std_logic;\n  signal w : std_logic_vector(3 downto 0);\n') }]);
  assert.deepEqual(messages(fw[0].text, 'vhdl'), ['warning:7: Signal <keep> is assigned but never used. This unconnected signal will be trimmed during the optimization process.']);
  // a name only read (never assigned): no declaration (a misspelling, or a missing assignment)
  assert.deepEqual(fixes(`${HEAD}entity top is port (y : out std_logic); end top;
architecture rtl of top is begin
  y <= nothing;
end rtl;
`, 'vhdl', /is not declared/), []);
});

test('Verilog: a misspelt name; an undeclared target -> wire / reg with the width of its value', () => {
  const src = `module top(input clk, input count_en, input [3:0] a, input [3:0] b, output [3:0] q, output [3:0] y, output z);
  reg [3:0] cnt = 4'd0;
  assign q = cnt;
  always @(posedge clk)
    if (count_enn) cnt <= cnt + 1'b1;
  assign t = a & b;
  assign y = t;
  always @(posedge clk) r <= {a[1:0], 2'b01};
  assign z = r[0] ^ (a == b);
endmodule
`;
  const f = fixes(src, 'verilog', /'count_enn' is not declared/);
  assert.deepEqual(f, [{ title: "Change 'count_enn' to 'count_en'", text: src.replace('count_enn', 'count_en') }]);
  // an implicit net (a warning: Verilog made it one bit): declared with the width of a & b
  const ft = fixes(f[0].text, 'verilog', /implicit net 't'/);
  assert.deepEqual(ft, [{ title: "Declare 'wire [3:0] t'", text: f[0].text.replace("output z);\n", "output z);\n  wire [3:0] t;\n") }]);
  const fr = fixes(ft[0].text, 'verilog', /'r' is not declared/);
  // (a declaration goes right after the module header)
  assert.deepEqual(fr, [{ title: "Declare 'reg [3:0] r'", text: ft[0].text.replace('  wire [3:0] t;\n', '  reg [3:0] r;\n  wire [3:0] t;\n') }]);
  assert.deepEqual(messages(fr[0].text, 'verilog'), []);
  // a width that is not clear from the value (an unsized number): no declaration
  assert.deepEqual(fixes('module top(input clk, output [7:0] q);\n  always @(posedge clk) k <= 5;\n  assign q = k;\nendmodule\n', 'verilog', /'k' is not declared/), []);
});

test('a missing ";" at the end of a line (VHDL, Verilog)', () => {
  const v = `${HEAD}entity top is port (a, b : in std_logic; y : out std_logic); end top;
architecture rtl of top is
begin
  y <= a and b  -- the output
end rtl;
`;
  const f = fixes(v, 'vhdl', /expected ';'/);
  assert.deepEqual(f, [{ title: "Add ';' at the end of the line", text: v.replace('a and b  --', 'a and b;  --') }]);
  assert.deepEqual(messages(f[0].text, 'vhdl'), []);
  const g = 'module top(input a, output y);\n  assign y = ~a\nendmodule\n';
  assert.deepEqual(fixes(g, 'verilog', /expected ';'/), [{ title: "Add ';' at the end of the line", text: g.replace('~a\n', '~a;\n') }]);
});

// (a source with a ';' removed at the end of line n, 1-based)
const cutSemicolon = (text, n) => text.split('\n').map((x, j) => (j === n - 1 ? x.replace(/;\s*$/, '') : x)).join('\n');
const parseErrors = (text, lang) => (lang === 'verilog' ? parseVerilog : parseVhdl)(text, 'f').errors.filter(e => e.severity === 'error').map(e => `${e.line}:${e.col} ${e.message}`);

test('VHDL: a ";" missing after each kind of declaration is reported at the end of that line, and the fix puts it back (#183)', () => {
  const v = `${HEAD}entity top is
  port (clk : in std_logic; y : out std_logic);
end top;
architecture rtl of top is
  use ieee.numeric_std.all;
  type state_t is (idle, run);
  subtype nibble is integer range 0 to 15;
  constant MASK : std_logic_vector(3 downto 0) := x"F";
  signal state : state_t := idle;
  signal q : std_logic := '0';
  alias q_out : std_logic is q;
  component sub is
    port (a : in std_logic);
  end component;
  function inv(b : std_logic) return std_logic;
  procedure nop(n : in integer);
  function inv(b : std_logic) return std_logic is
  begin
    return not b;
  end function;
  procedure nop(n : in integer) is
  begin
  end procedure;
  attribute fsm_encoding : string;
  attribute fsm_encoding of state : signal is "user";
begin
  process (clk)
    variable count : nibble := 0;
    constant LAST : nibble := 9;
  begin
    if rising_edge(clk) then
      if count = LAST then
        count := 0;
        state <= run;
      else
        count := count + 1;
      end if;
      q <= inv(q) and MASK(0);
    end if;
  end process;
  y <= q_out;
end rtl;
`;
  assert.deepEqual(parseErrors(v, 'vhdl'), []);
  const expected = {
    7: "7:27 expected ';' after 'all'", 8: "8:30 expected ';' after ')'", 9: "9:42 expected ';' after '15'",
    10: `10:55 expected ';' after 'x"F"'`, 11: "11:33 expected ';' after 'idle'", 12: "12:30 expected ';' after '0'",
    13: "13:31 expected ';' after 'q'", 15: "15:28 expected ';' after ')'", 16: "16:16 expected ';' after 'component'",
    17: "17:47 expected ';' after 'std_logic'", 18: "18:32 expected ';' after ')'", 21: "21:17 expected ';' after 'b'",
    22: "22:15 expected ';' after 'function'", 25: "25:16 expected ';' after 'procedure'", 26: "26:34 expected ';' after 'string'",
    // (the FSM generator's attribute specification, the last declaration before begin)
    27: `27:53 expected ';' after "user"`, 30: "30:33 expected ';' after '0'", 31: "31:32 expected ';' after '9'",
  };
  for (const [n, msg] of Object.entries(expected)) {
    const cut = cutSemicolon(v, +n);
    assert.deepEqual(parseErrors(cut, 'vhdl'), [msg], `line ${n}`);
    const e = parseVhdl(cut, 'f').errors[0];
    const fx = quickFixes(cut, 'vhdl', e, {});
    assert.deepEqual(fx.map(f => f.title), ["Add ';' at the end of the line"], `line ${n}`);
    assert.equal(applyFix(cut, fx[0]), v, `line ${n}`);
  }
  // the other declarations: in an architecture (before a signal), a process (before a variable)
  // and a package (before a constant)
  const decl = (where, d) => where === 'architecture'
    ? `${HEAD}entity top is port (y : out std_logic); end top;\narchitecture rtl of top is\n  ${d}\n  signal z : std_logic;\nbegin\nend rtl;\n`
    : where === 'process'
      ? `${HEAD}entity top is port (y : out std_logic); end top;\narchitecture rtl of top is\nbegin\n  process\n  ${d}\n  variable z : integer;\n  begin\n    wait;\n  end process;\nend rtl;\n`
      : `${HEAD}package pk is\n  ${d}\n  constant z : integer := 1;\nend pk;\n`;
  const cases = [
    ['architecture', 'shared variable v : integer', "5:30 expected ';' after 'integer'"],
    ['architecture', 'type cell', "5:12 expected ';' after 'cell'"],
    ['architecture', 'type t is array (0 to 3) of std_logic', "5:40 expected ';' after 'std_logic'"],
    ['architecture', 'alias al is y', "5:16 expected ';' after 'y'"],
    ['architecture', 'file f : text open write_mode is "out.txt"', `5:45 expected ';' after "out.txt"`],
    ['architecture', 'for all : sub use entity work.sub', "5:36 expected ';' after 'sub'"],
    ['architecture', 'group g : gt (z)', "5:19 expected ';' after ')'"],
    ['architecture', 'disconnect z : std_logic after 1 ns', "5:38 expected ';' after 'ns'"],
    ['process', 'constant c : real := 1.5e3', "7:29 expected ';' after '1.5e3'"],
    ['process', 'type t is range 0 to 7', "7:25 expected ';' after '7'"],
    ['process', 'attribute keep : string', "7:26 expected ';' after 'string'"],
    ['process', 'function f(x : integer) return integer', "7:41 expected ';' after 'integer'"],
    ['package', 'signal s : std_logic_vector(7 downto 0) := 8x"FF"', `4:52 expected ';' after '8x"FF"'`],
    ['package', 'constant k : integer := 16#FF#', "4:33 expected ';' after '16#FF#'"],
    ['package', 'constant s : string := "a""b"', `4:32 expected ';' after "a""b"`],
    ['package', 'procedure p(x : in integer)', "4:30 expected ';' after ')'"],
    ['package', 'attribute keep of z : constant is "true"', `4:43 expected ';' after "true"`],
  ];
  for (const [where, d, msg] of cases) {
    assert.deepEqual(parseErrors(decl(where, d), 'vhdl'), [msg], d);
    assert.deepEqual(parseErrors(decl(where, `${d};`), 'vhdl'), [], `${d};`);
  }
  // an attribute specification over two lines is one declaration
  assert.deepEqual(parseErrors(decl('architecture', 'attribute keep of y :\n    signal is "true";'), 'vhdl'), []);
  // a subprogram body whose is is missing (its end is end function): that is what is reported
  assert.deepEqual(parseErrors(decl('architecture', 'function f return integer\n  begin\n    return 1;\n  end function;'), 'vhdl')[0],
    "6:3 expected 'is' but found 'begin'");
});

test('Verilog: a ";" missing after a number, a string or a task call is reported at the end of that line, and the fix puts it back (#183)', () => {
  const g = `module top(input clk, output reg [7:0] q);
  wire [7:0] w = 8'hFF;
  real r = 1.5e3;
  parameter S = "ab";
  task t(input [7:0] x);
    q = x;
  endtask
  task reset;
    q = 0;
  endtask
  always @(posedge clk) begin
    t(w);
    reset;
    q <= 8'd1;
  end
endmodule
`;
  assert.deepEqual(parseErrors(g, 'verilog'), []);
  const expected = {
    2: "2:23 expected ';' after '8'hFF'", 3: "3:17 expected ';' after '1.5e3'", 4: `4:21 expected ';' after "ab"`,
    12: "12:9 expected ';' after ')'", 13: "13:10 expected ';' after 'reset'", 14: "14:14 expected ';' after '8'd1'",
  };
  for (const [n, msg] of Object.entries(expected)) {
    const cut = cutSemicolon(g, +n);
    assert.deepEqual(parseErrors(cut, 'verilog'), [msg], `line ${n}`);
    const fx = quickFixes(cut, 'verilog', parseVerilog(cut, 'f').errors[0], {});
    assert.deepEqual(fx.map(f => f.title), ["Add ';' at the end of the line"], `line ${n}`);
    assert.equal(applyFix(cut, fx[0]), g, `line ${n}`);
  }
});

test('a ";" missing at the end of a statement, whatever statement starts the next line, is reported at the end of that line, and the fix puts it back (#184)', () => {
  const V = (a, b) => `module top(input clk, input a, output reg [7:0] q);
  integer i;
  event ev;
  task show(input [7:0] v);
    $display("%d", v);
  endtask
  initial begin
    ${a};
    ${b}
  end
endmodule
`;
  const verilog = [
    ['show(q)', '#5 q = 1;', "8:12 expected ';' after ')'"], ['show(q)', '@(posedge clk) q <= 2;', "8:12 expected ';' after ')'"],
    ['show(q)', '-> ev;', "8:12 expected ';' after ')'"], ['show(q)', "{q[0], q[1]} = 2'b00;", "8:12 expected ';' after ')'"],
    ['q = 1', '#5;', "8:10 expected ';' after '1'"], ['q <= 1', '@(posedge clk);', "8:11 expected ';' after '1'"],
    ['$display("a")', 'wait (a) q = 3;', "8:18 expected ';' after ')'"], ['q = 1', 'begin q = 0; end', "8:10 expected ';' after '1'"],
    ['q = 1', 'if (a) q = 0;', "8:10 expected ';' after '1'"], ['q = 1', "case (a) 1'b1: q = 0; endcase", "8:10 expected ';' after '1'"],
    ['q = 1', 'for (i = 0; i < 2; i = i + 1) q = 0;', "8:10 expected ';' after '1'"], ['q = 1', 'repeat (2) q = 0;', "8:10 expected ';' after '1'"],
    ["q = 8'hFF", '$display("b");', "8:14 expected ';' after '8'hFF'"],
  ];
  const H = (a, b) => `${HEAD}entity top is end top;
architecture rtl of top is
  signal s : std_logic;
  procedure p(x : in integer) is begin null; end procedure;
begin
  process
    variable v : integer := 0;
  begin
    loop
      ${a};
      ${b}
    end loop;
  end process;
end rtl;
`;
  const vhdl = [
    ['p(v)', 'wait for 5 ns;', "12:11 expected ';' after ')'"], ['p(v)', "if v = 1 then s <= '0'; end if;", "12:11 expected ';' after ')'"],
    ['p(v)', 'case v is when others => null; end case;', "12:11 expected ';' after ')'"], ['p(v)', 'for i in 0 to 1 loop null; end loop;', "12:11 expected ';' after ')'"],
    ['p(v)', 'report "y";', "12:11 expected ';' after ')'"], ['p(v)', "s <= '0';", "12:11 expected ';' after ')'"], ['p(v)', 'v := 0;', "12:11 expected ';' after ')'"],
    ['next', 'p(v);', "12:11 expected ';' after 'next'"], ['exit', "s <= '0';", "12:11 expected ';' after 'exit'"],
    ["wait until s = '1'", 'for i in 0 to 1 loop null; end loop;', "12:25 expected ';' after '1'"], ["s <= '1'", 'wait;', "12:15 expected ';' after '1'"],
    ['v := 1', 'loop exit; end loop;', "12:13 expected ';' after '1'"], ['report "x"', 'null;', `12:17 expected ';' after "x"`],
    ['assert v = 1', 'while v < 2 loop v := v + 1; end loop;', "12:19 expected ';' after '1'"],
  ];
  for (const [lang, make, cases] of [['verilog', V, verilog], ['vhdl', H, vhdl]]) {
    for (const [a, b, msg] of cases) {
      const ok = make(a, b), cut = ok.replace(`${a};\n`, `${a}\n`);
      assert.deepEqual(parseErrors(ok, lang), [], `${a}; ${b}`);
      assert.deepEqual(parseErrors(cut, lang), [msg], `${a} / ${b}`);
      const fx = quickFixes(cut, lang, (lang === 'verilog' ? parseVerilog : parseVhdl)(cut, 'f').errors[0], {});
      assert.deepEqual(fx.map(f => f.title), ["Add ';' at the end of the line"], `${a} / ${b}`);
      assert.equal(applyFix(cut, fx[0]), ok, `${a} / ${b}`);
    }
  }
  // a concurrent procedure call; a wait's timeout on the next line is still its own
  const conc = `${HEAD}entity top is end top;\narchitecture rtl of top is\n  signal s : std_logic;\n  procedure p(x : in integer) is begin null; end procedure;\nbegin\n  p(1);\n  s <= '0';\nend rtl;\n`;
  assert.deepEqual(parseErrors(conc.replace('p(1);', 'p(1)'), 'vhdl'), ["8:7 expected ';' after ')'"]);
  assert.deepEqual(parseErrors(H("wait until s = '1'\n        for 5 ns", 'null;'), 'vhdl'), []);
});

test('Verilog: an end missing before an instance stops the block there, and the fix inserts it (#184)', () => {
  const g = `module top(input clk, input a, output reg y, output [6:0] seg);
  always @(*) begin
    y = a;
  end

  sevenseg #(.N(1)) display (.clk(clk), .seg(seg));
  sevenseg u2 (.clk(clk), .seg());
endmodule
`;
  assert.deepEqual(parseErrors(g, 'verilog'), []);
  const noEnd = g.replace('    y = a;\n  end\n', '    y = a;\n');
  assert.deepEqual(parseErrors(noEnd, 'verilog'), ["5:3 expected 'end' but found 'sevenseg'"]);
  assert.deepEqual(quickFixes(noEnd, 'verilog', parseVerilog(noEnd, 'f').errors[0], {}).map(f => ({ title: f.title, text: applyFix(noEnd, f) })), [{ title: "Insert 'end'", text: g }]);
  const noEnd2 = g.replace('  sevenseg #(.N(1)) display (.clk(clk), .seg(seg));\n', '').replace('    y = a;\n  end\n', '    y = a;\n');
  assert.deepEqual(parseErrors(noEnd2, 'verilog'), ["5:3 expected 'end' but found 'sevenseg'"]);
});

const PROC = `${HEAD}entity top is
  port (clk, d : in std_logic; q : out std_logic);
end top;
architecture rtl of top is
begin
  process (clk)
  begin
    if rising_edge(clk) then
      q <= d;
    end if;
  end process;
end rtl;
`;

test('VHDL: a missing end if / end process / end of the architecture; end; of a process', () => {
  const noEndIf = PROC.replace('    end if;\n', '');
  assert.deepEqual(messages(noEndIf, 'vhdl'), ["error:12: expected 'if' but found 'process'", "error:13: expected 'process' but found 'rtl'", "error:14: expected 'end' but found end of file"]);
  assert.deepEqual(fixes(noEndIf, 'vhdl', /expected 'if'/), [{ title: "Insert 'end if;'", text: PROC }]);
  // only the first error gets a fix: the next ones follow from it
  assert.deepEqual(fixes(noEndIf, 'vhdl', /expected 'process'/), []);
  assert.deepEqual(fixes(noEndIf, 'vhdl', /end of file/), []);
  const noEndProcess = PROC.replace('  end process;\n', '');
  assert.deepEqual(fixes(noEndProcess, 'vhdl', /expected 'process'/), [{ title: "Insert 'end process;'", text: PROC }]);
  const noEndArch = PROC.replace('end rtl;\n', '');
  assert.deepEqual(fixes(noEndArch, 'vhdl', /end of file/), [{ title: "Add 'end rtl;' at the end", text: PROC }]);
  const noEnds = PROC.replace('  end process;\nend rtl;\n', '');
  assert.deepEqual(fixes(noEnds, 'vhdl', /end of file/), [{ title: "Add 'end process;', 'end rtl;' at the end", text: PROC }]);
  const endOnly = PROC.replace('  end process;', '  end;');
  assert.deepEqual(fixes(endOnly, 'vhdl', /expected 'process'/), [{ title: "Write 'end process'", text: PROC }]);
});

test('Verilog: a missing end / endcase / endmodule', () => {
  const ok = `module top(input clk, input [1:0] s, output reg y, output reg q);
  always @* begin
    case (s)
      2'b00: y = 1'b0;
      default: y = 1'b1;
    endcase
  end
  always @(posedge clk) begin
    q <= y;
  end
endmodule
`;
  assert.deepEqual(messages(ok, 'verilog'), []);
  const noEndcase = ok.replace('    endcase\n', '');
  assert.deepEqual(messages(noEndcase, 'verilog'), ["error:6: unexpected 'end' in expression"]);
  assert.deepEqual(fixes(noEndcase, 'verilog', /unexpected 'end'/), [{ title: "Insert 'endcase'", text: ok }]);
  const noEnd = ok.replace('    q <= y;\n  end\n', '    q <= y;\n');
  assert.deepEqual(fixes(noEnd, 'verilog', /expected 'end'/), [{ title: "Insert 'end'", text: ok }]);
  const noEndmodule = ok.replace('endmodule\n', '');
  assert.deepEqual(fixes(noEndmodule, 'verilog', /'eof'/), [{ title: "Add 'endmodule' at the end", text: ok }]);
});

test('a missing end goes where the indentation shows the construct ends (not just before the end the parser stopped at)', () => {
  const v = `${HEAD}entity top is port (clk, a, b : in std_logic; x, y : out std_logic); end top;
architecture rtl of top is
begin
  process (clk)
  begin
    if rising_edge(clk) then
      if a = '1' then
        x <= b;
      end if;

      -- y follows b
      y <= b;
    end if;
  end process;
end rtl;
`;
  assert.deepEqual(messages(v, 'vhdl'), []);
  const noInner = v.replace("        x <= b;\n      end if;\n", '        x <= b;\n');
  assert.deepEqual(fixes(noInner, 'vhdl', /expected 'if'/), [{ title: "Insert 'end if;'", text: v }]);
  const g = `module top(input clk, input a, input b, output reg x, output reg y);
  always @(posedge clk) begin
    if (a) begin
      x <= b;
    end
    y <= b;
  end
endmodule
`;
  const noEnd = g.replace('      x <= b;\n    end\n', '      x <= b;\n');
  assert.deepEqual(fixes(noEnd, 'verilog', /expected 'end'/), [{ title: "Insert 'end'", text: g }]);
});

test('the examples: every end, endcase, endmodule… and every ";" at the end of a line, removed one at a time: the first fix puts it back', () => {
  const dir = new URL('../examples/', import.meta.url);
  let n = 0;
  const none = [];
  for (const ex of readdirSync(dir)) {
    for (const sub of ['src', 'sim']) {
      let names = [];
      try { names = readdirSync(new URL(`${ex}/${sub}/`, dir)).filter(f => /\.(vhd|v)$/.test(f)); } catch { continue; }
      for (const f of names) {
        const text = readFileSync(new URL(`${ex}/${sub}/${f}`, dir), 'utf8');
        const lang = f.endsWith('.v') ? 'verilog' : 'vhdl';
        const lines = text.split('\n');
        lines.forEach((l, k) => {
          const cut = /^\s*(end if;|end process;|end case;|end loop;|end\s*$|endcase|endmodule|endfunction)/.test(l) ? lines.filter((_, j) => j !== k).join('\n')
            : /;\s*$/.test(l) && !/^\s*(--|\/\/)/.test(l) ? lines.map((x, j) => (j === k ? x.replace(/;\s*$/, '') : x)).join('\n') : null;
          if (cut == null) return;
          const e = (lang === 'vhdl' ? parseVhdl : parseVerilog)(cut, f).errors.find(x => x.severity === 'error');
          if (!e) return;   // (e.g. the ';' of the last declaration of a port list)
          const fx = quickFixes(cut, lang, e, {});
          if (!fx.length) { none.push(`${ex}/${sub}/${f}:${k + 1}: ${e.message}`); return; }
          assert.equal(applyFix(cut, fx[0]), text, `${ex}/${sub}/${f} line ${k + 1}: ${e.message} -> ${fx[0].title}`);
          n++;
        });
      }
    }
  }
  assert.ok(n > 300, `${n} cases`);
  // (where the parser stops far from the cause, no fix: an `end process;` missing before a process)
  assert.deepEqual(none, ["blinky/sim/tb_top.vhd:34: unexpected 'process' in sequential statement",
    "isqrt/src/isqrt_top.vhd:60: unexpected 'entity' in sequential statement",
    "stopwatch/src/stopwatch.vhd:95: unexpected 'entity' in sequential statement",
    "traffic/src/top.vhd:74: unexpected 'entity' in sequential statement",
    "traffic/sim/tb_traffic.vhd:69: unexpected 'process' in sequential statement",
    "vga/sim/tb_vga.vhd:75: unexpected 'process' in sequential statement"]);
});

test('VHDL: a vector of another width -> zeros / resize / the low bits', () => {
  const src = `${HEAD}use ieee.numeric_std.all;
entity top is
  port (a : in std_logic_vector(3 downto 0); n : in unsigned(3 downto 0);
        y : out std_logic_vector(7 downto 0); z : out std_logic_vector(1 downto 0); u : out unsigned(7 downto 0));
end top;
architecture rtl of top is
begin
  y <= a;
  z <= a;
  u <= n;
end rtl;
`;
  assert.deepEqual(messages(src, 'vhdl'), ['warning:10: width mismatch: target is 8 bits, value is 4 bits', 'warning:11: width mismatch: target is 2 bits, value is 4 bits',
    'warning:12: width mismatch: target is 8 bits, value is 4 bits']);
  const fy = fixes(src, 'vhdl', /target is 8 bits/);
  assert.deepEqual(fy, [{ title: 'Extend with zeros: "0000" & a', text: src.replace('y <= a;', 'y <= "0000" & a;') }]);
  const fz = fixes(fy[0].text, 'vhdl', /target is 2 bits/);
  assert.deepEqual(fz, [{ title: 'Keep the low bits: a(1 downto 0)', text: fy[0].text.replace('z <= a;', 'z <= a(1 downto 0);') }]);
  const fu = fixes(fz[0].text, 'vhdl', /target is 8 bits/);
  assert.deepEqual(fu, [{ title: 'Resize: resize(n, 8)', text: fz[0].text.replace('u <= n;', 'u <= resize(n, 8);') }]);
  assert.deepEqual(messages(fu[0].text, 'vhdl'), []);
  // an expression: not clear
  assert.deepEqual(fixes(src.replace('y <= a;', 'y <= a and a;'), 'vhdl', /target is 8 bits/), []);
});

test('VHDL: the missing use clause of numeric_std / std_logic_1164; = for <=; <= to a variable; an output read (VHDL-93)', () => {
  const num = `${HEAD}entity top is port (a : in std_logic_vector(3 downto 0); y : out std_logic_vector(3 downto 0)); end top;
architecture rtl of top is
begin
  y <= std_logic_vector(unsigned(a) + 1);
end rtl;
`;
  const fn = fixes(num, 'vhdl', /<unsigned> is not declared/);
  assert.deepEqual(fn, [{ title: "Add 'use ieee.numeric_std.all;'", text: num.replace('std_logic_1164.all;\n', 'std_logic_1164.all;\nuse ieee.numeric_std.all;\n') }]);
  assert.deepEqual(messages(fn[0].text, 'vhdl'), []);
  const std = 'entity top is port (a : in std_logic; y : out std_logic); end top;\narchitecture rtl of top is begin y <= a; end rtl;\n';
  const fs = fixes(std, 'vhdl', /<std_logic> is not declared/);
  assert.deepEqual(fs, [{ title: "Add 'use ieee.std_logic_1164.all;'", text: `${HEAD}${std}` }]);
  assert.deepEqual(messages(fs[0].text, 'vhdl'), []);

  const eq = `${HEAD}entity top is port (a : in std_logic; y : out std_logic); end top;
architecture rtl of top is
begin
  y = a;
end rtl;
`;
  assert.deepEqual(fixes(eq, 'vhdl', /but found '='/), [{ title: "Use '<=' to assign ('=' compares)", text: eq.replace('y = a', 'y <= a') }]);
  const va = PROC.replace('  process (clk)\n  begin', '  process (clk)\n    variable v : std_logic := \'0\';\n  begin').replace('q <= d;', 'v <= not v;\n      q <= v;');
  assert.deepEqual(messages(va, 'vhdl'), ["warning:12: 'v' is a variable: use ':='", 'warning:4: Input <d> is never used.']);
  const fv = fixes(va, 'vhdl', /is a variable/);
  assert.deepEqual(fv, [{ title: "Use ':=' to assign the variable 'v'", text: va.replace('v <= not v', 'v := not v') }]);
  assert.deepEqual(messages(fv[0].text, 'vhdl'), ['warning:4: Input <d> is never used.']);

  const out = PROC.replace('q <= d;', 'q <= not q;').replace('clk, d : in', 'clk : in');
  assert.deepEqual(messages(out, 'vhdl'), ['error:11: Object <q> of mode OUT can not be read.']);
  const fo = fixes(out, 'vhdl', /mode OUT/);
  assert.deepEqual(fo, [{
    title: "Use an internal signal 'q_int' (and q <= q_int)",
    text: out.replace('architecture rtl of top is\n', 'architecture rtl of top is\n  signal q_int : std_logic;\n').replace('q <= not q;', 'q_int <= not q_int;').replace('  end process;\n', '  end process;\n  q <= q_int;\n'),
  }]);
  assert.deepEqual(messages(fo[0].text, 'vhdl'), []);
});

test('Verilog: reg / wire of a declaration; = / <= in the wrong always block; an incomplete event list', () => {
  const w = 'module top(input clk, input d, output q);\n  always @(posedge clk) q <= d;\nendmodule\n';
  const fw = fixes(w, 'verilog', /Procedural assignment to a non-register/);
  assert.deepEqual(fw, [{ title: "Declare 'q' as reg", text: w.replace('output q', 'output reg q') }]);
  assert.deepEqual(messages(fw[0].text, 'verilog'), []);
  const w2 = 'module top(input clk, input d, output o);\n  wire q;\n  always @(posedge clk) q <= d;\n  assign o = q;\nendmodule\n';
  assert.deepEqual(fixes(w2, 'verilog', /Procedural assignment/), [{ title: "Declare 'q' as reg", text: w2.replace('wire q;', 'reg q;') }]);
  // one declaration of two names: not changed
  assert.deepEqual(fixes(w2.replace('wire q;', 'wire q, p;'), 'verilog', /Procedural assignment/), []);
  const r = 'module top(input d, output reg q);\n  assign q = d;\nendmodule\n';
  const fr = fixes(r, 'verilog', /should be a net type/);
  assert.deepEqual(fr, [{ title: "Declare 'q' as wire", text: r.replace('output reg q', 'output wire q') }]);
  assert.deepEqual(messages(fr[0].text, 'verilog'), []);

  const b = 'module top(input clk, input d, output reg q, output reg p);\n  always @(posedge clk) begin\n    q = d;\n    p = q;\n  end\nendmodule\n';
  assert.deepEqual(messages(b, 'verilog'), ['warning:3: Blocking assignment (=) to <q> in a clocked always block; use a non-blocking assignment (<=).',
    'warning:4: Blocking assignment (=) to <p> in a clocked always block; use a non-blocking assignment (<=).']);
  const fb = fixes(b, 'verilog', /to <q>/);
  assert.deepEqual(fb, [{ title: "Use '<=' for 'q'", text: b.replace('q = d;', 'q <= d;') }]);
  assert.deepEqual(messages(fb[0].text, 'verilog'), ['warning:4: Blocking assignment (=) to <p> in a clocked always block; use a non-blocking assignment (<=).']);
  const nb = 'module top(input a, output reg y);\n  always @* y <= ~a;\nendmodule\n';
  assert.deepEqual(fixes(nb, 'verilog', /Non-blocking/), [{ title: "Use '=' for 'y'", text: nb.replace('y <= ~a', 'y = ~a') }]);

  const s = 'module top(input a, input b, output reg y);\n  always @(a) y = a & b;\nendmodule\n';
  const fs = fixes(s, 'verilog', /sensitivity list/);
  assert.deepEqual(fs, [{ title: "Use 'always @(*)': every signal read is in the list", text: s.replace('@(a)', '@(*)') }]);
  assert.deepEqual(messages(fs[0].text, 'verilog'), []);
});

test('VHDL: a signal missing from the sensitivity list of a process', () => {
  const s = `${HEAD}entity top is port (a, b : in std_logic; y : out std_logic); end top;
architecture rtl of top is
begin
  comb : process (a)
  begin
    y <= a and b;
  end process;
end rtl;
`;
  assert.deepEqual(messages(s, 'vhdl'), ['warning:8: b should be on the sensitivity list of the process']);
  const f = fixes(s, 'vhdl', /sensitivity/);
  assert.deepEqual(f, [{ title: "Add 'b' to the sensitivity list", text: s.replace('process (a)', 'process (a, b)') }]);
  assert.deepEqual(messages(f[0].text, 'vhdl'), []);
});

test('VHDL: a function that is not pure (a warning; an error when written pure) -> declared impure (also in its package declaration), only when no other pure function calls it (#185)', () => {
  const W = ' VHDL 87 allowed this; VHDL 93 requires the keyword IMPURE.';
  const s = `${HEAD}entity top is port (a : in std_logic; y : out std_logic); end top;
architecture rtl of top is
  signal s : std_logic;
  function f(x : std_logic) return std_logic is
  begin
    return x and s;
  end function;
begin
  s <= not a;
  y <= f(a);
end rtl;
`;
  assert.deepEqual(messages(s, 'vhdl'), [`warning:9: Function f is not pure: it uses signal 's' at line 8.${W}`]);
  let f = fixes(s, 'vhdl', /is not pure/);
  assert.deepEqual(f, [{ title: "Declare the function 'f' impure", text: s.replace('  function f', '  impure function f') }]);
  assert.deepEqual(messages(f[0].text, 'vhdl'), []);
  // `pure` -> `impure`; a process's variable; a call of an impure function
  const p = `${HEAD}entity top is port (a : in std_logic; y : out std_logic); end top;
architecture rtl of top is
  impure function g return std_logic is
  begin
    return a;
  end function;
begin
  process (a)
    variable n : std_logic := '0';
    pure function f(x : std_logic) return std_logic is
    begin
      n := not n;
      return x xor g;
    end function;
  begin
    y <= f(a);
  end process;
end rtl;
`;
  const p2 = p.replace('      n := not n;\n', '');
  assert.deepEqual(messages(p, 'vhdl'), ["error:16: Function f is not pure: it uses variable 'n' at line 14."]);
  assert.deepEqual(messages(p2, 'vhdl'), ["error:15: Function f is not pure: it calls impure function 'g' at line 14."]);
  for (const src of [p, p2]) {
    f = fixes(src, 'vhdl', /is not pure/);
    assert.deepEqual(f, [{ title: "Declare the function 'f' impure", text: src.replace('pure function f', 'impure function f') }]);
    assert.deepEqual(messages(f[0].text, 'vhdl'), []);
  }
  // a package: its declaration and its body; the overloaded function of other parameters is left as it is
  const k = `${HEAD}package pk is
  signal ps : std_logic;
  function f(x : std_logic) return std_logic;
  function f(x, z : std_logic) return std_logic;
end pk;
package body pk is
  function f(x : std_logic) return std_logic is
  begin
    return x and ps;
  end function;
  function f(x, z : std_logic) return std_logic is
  begin
    return x and z;
  end function;
end pk;
`;
  assert.deepEqual(messages(k, 'vhdl'), [`warning:12: Function f is not pure: it uses signal 'ps' at line 11.${W}`]);
  f = fixes(k, 'vhdl', /is not pure/);
  assert.deepEqual(f, [{ title: "Declare the function 'f' impure", text: k.replace('  function f(x : std_logic) return std_logic;', '  impure function f(x : std_logic) return std_logic;').replace('  function f(x : std_logic) return std_logic is', '  impure function f(x : std_logic) return std_logic is') }]);
  assert.deepEqual(messages(f[0].text, 'vhdl'), []);
  // a pure function calls it: impure, it would make that one wrong -> no fix
  const c = s.replace('end function;\nbegin', 'end function;\n  function h(x : std_logic) return std_logic is\n  begin\n    return f(x);\n  end function;\nbegin').replace('y <= f(a)', 'y <= h(a)');
  assert.deepEqual(messages(c, 'vhdl'), [`warning:9: Function f is not pure: it uses signal 's' at line 8.${W}`]);
  assert.deepEqual(fixes(c, 'vhdl', /is not pure/), []);
});

test('VHDL: a statement label with the name of another declaration of its region -> the label renamed to a free name (_proc, _inst, _gen, _blk, _label), also after its end; not when a specification names it (#192)', () => {
  const s = `${HEAD}entity sub is port (a : in std_logic; y : out std_logic); end sub;
architecture r of sub is begin y <= a; end r;
${HEAD}entity top is port (clk : in std_logic; d : in std_logic_vector(1 downto 0); q : out std_logic_vector(1 downto 0)); end top;
architecture rtl of top is
  signal P, b1, g, s, bk : std_logic;
  component sub is port (a : in std_logic; y : out std_logic); end component;
begin
  P : process (clk)
  begin
    if rising_edge(clk) then P <= d(0); end if;
  end process p;
  B1 : sub port map (a => P, y => b1);
  g : for i in 0 to 1 generate
    q(i) <= d(i) xor b1;
  end generate g;
  s : s <= d(1);
  bk : block
  begin
    bk <= s;
  end block;
end rtl;
`;
  const R = (label, what, line, at) => `error:${at}: Redeclaration of symbol ${label}: the label of the ${what} (line ${line}) is also the name of signal '${label.toLowerCase()}' (line 9).`;
  assert.deepEqual(messages(s, 'vhdl'), [R('P', 'process', 12, 15), R('B1', 'instance', 16, 16), R('g', 'generate', 17, 19), R('s', 'assignment', 20, 20), R('bk', 'block', 21, 21)]);
  const fix = (re, title, from, to) => {
    const f = fixes(s, 'vhdl', re);
    assert.deepEqual(f, [{ title, text: to.reduce((t, [a, b]) => t.replace(a, b), s) }]);
    assert.ok(!messages(f[0].text, 'vhdl').some(m => m.includes(`symbol ${from}:`)), messages(f[0].text, 'vhdl').join('\n'));
  };
  // the label at its statement and after `end process` (written in another case)
  fix(/symbol P:/, "Rename the label 'P' to 'P_proc'", 'P', [['  P : process', '  P_proc : process'], ['end process p;', 'end process P_proc;']]);
  fix(/symbol B1:/, "Rename the label 'B1' to 'B1_inst'", 'B1', [['  B1 : sub', '  B1_inst : sub']]);
  fix(/symbol g:/, "Rename the label 'g' to 'g_gen'", 'g', [['  g : for', '  g_gen : for'], ['end generate g;', 'end generate g_gen;']]);
  fix(/symbol s:/, "Rename the label 's' to 's_label'", 's', [['  s : s <=', '  s_label : s <=']]);
  fix(/symbol bk:/, "Rename the label 'bk' to 'bk_blk'", 'bk', [['  bk : block', '  bk_blk : block']]);
  // a free name: p_proc is taken
  const t = s.replace('signal P, b1', 'signal P_proc, P, b1');
  assert.deepEqual(fixes(t, 'vhdl', /symbol P:/).map(f => f.title), ["Rename the label 'P' to 'P_proc2'"]);
  // named by a configuration specification: not renamed here
  const u = s.replace('begin\n  P : process', '  for B1 : sub use entity work.sub;\nbegin\n  P : process');
  assert.deepEqual(fixes(u, 'vhdl', /symbol B1:/), []);
  assert.deepEqual(fixes(u, 'vhdl', /symbol P:/).map(f => f.title), ["Rename the label 'P' to 'P_proc'"]);
});

test('an unknown module or port of an instance -> the nearest of the project (VHDL, Verilog)', () => {
  const v = 'module top(input c, input r, output [3:0] q);\n  countr #(.WIDTH(4)) u1 (.clk(c), .reset(r), .count(q));\nendmodule\n';
  assert.deepEqual(fixes(v, 'verilog', /not found/), [{ title: "Change 'countr' to 'counter'", text: v.replace('countr #', 'counter #') }]);
  const p = v.replace('countr #', 'counter #').replace('.count(q)', '.cuont(q)');
  const extra = [{ path: 'c.v', text: 'module counter #(parameter WIDTH = 4) (input clk, input reset, output [WIDTH-1:0] count);\n  assign count = 0;\nendmodule\n' }];
  const lib = compile([...extra, { path: 'f.v', text: p }]);
  const d = elaborate(lib, 'top').diags.find(x => /has no port/.test(x.message));
  assert.equal(d.message, "module 'counter' has no port 'cuont'");
  assert.deepEqual(quickFixes(p, 'verilog', d, { modules: MODULES }).map(f => [f.title, applyFix(p, f)]), [["Change 'cuont' to 'count'", p.replace('.cuont(q)', '.count(q)')]]);
  const h = `${HEAD}entity top is port (c, r : in std_logic); end top;
architecture s of top is
begin
  u1 : entity work.countr port map (clk => c, reset => r, count => open);
end s;
`;
  assert.deepEqual(fixes(h, 'vhdl', /not found/), [{ title: "Change 'countr' to 'counter'", text: h.replace('work.countr', 'work.counter') }]);
});

test('no fix where it would not be right with high confidence', () => {
  // std_logic_vector assigned to a std_logic: which bit?
  assert.deepEqual(fixes(`${HEAD}entity top is port (a : in std_logic_vector(3 downto 0); y : out std_logic); end top;
architecture rtl of top is begin y <= a; end rtl;
`, 'vhdl', /Type error/), []);
  // a case without others: the value of the missing branch is the designer's
  assert.deepEqual(fixes(`${HEAD}entity top is port (s : in std_logic_vector(1 downto 0); y : out std_logic); end top;
architecture rtl of top is begin
  process (s) begin
    case s is
      when "00" => y <= '0';
      when "01" => y <= '1';
    end case;
  end process;
end rtl;
`, 'vhdl', /Case statement without/), []);
});

test('an error of the HDL made from a drawing without an HDL file (#177) points at the drawing: the core would change that text, so the editor offers no fix for it', async () => {
  const { viewHdl } = await import('../core/view-hdl.js');
  const { COUNTER, COUNTER_PORTS, schematicOf } = await import('./drawn-lib.mjs');
  const v = viewHdl('src/bad.sch.json', JSON.stringify(schematicOf('bad', 'countr')), { modules: { counter: { name: 'counter', ports: COUNTER_PORTS } } });
  const lib = compile([{ path: 'src/counter.vhd', text: COUNTER }, { path: v.path, lang: v.lang, text: v.text }]);
  const d = elaborate(lib, 'bad').diags;
  assert.deepEqual(d.map(x => `${x.file}:${x.line}: ${x.message}`), ["src/bad.sch.json:15: module/entity 'countr' not found (instance 'u1')"]);
  // (web/js/app.js diagFixes skips the sources { view: true }: the edit would be lost, the drawing makes the text)
  assert.deepEqual(quickFixes(v.text, 'vhdl', d[0], { modules: [{ name: 'counter', ports: ['clk', 'q'] }] }).map(f => f.title), ["Change 'countr' to 'counter'"]);
});
