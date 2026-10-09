// core/hints.js: plain-language explanation + fix (English and Portuguese) of the common compile /
// elaboration errors and of the design checks; the original ISE-style message is kept unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { designChecks, LINT_CHECKS, RULE_CHECKS } from '../core/lint.js';
import { HINTS, hintFor, hintText, HINT_LABELS } from '../core/hints.js';

/** Every diagnostic (parse, elaboration, design checks) of the sources, with its hint id. */
function diags(files, top) {
  const lib = compile(Object.entries(files).map(([path, text]) => ({ path, text })));
  let design = null;
  try { design = elaborate(lib, top); } catch { /* parse errors only */ }
  const all = [...lib.errors, ...(design?.diags || []), ...(design ? designChecks(lib, design) : [])];
  return all.map(d => ({ ...d, hint: hintFor(d)?.id ?? null }));
}
/** Hint id of the first diagnostic (of a severity) of the sources. */
const first = (files, top, sev = 'error') => {
  const ds = diags(files, top).filter(d => d.severity === sev);
  assert.ok(ds.length, `a ${sev} for ${Object.values(files)[0].slice(0, 200)}`);
  return ds[0];
};

const V = (body, decl = '', ports = 'a, b : in std_logic; y : out std_logic', ctx = 'library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;') =>
  ({ 't.vhd': `${ctx}\nentity t is port (${ports}); end t;\narchitecture rtl of t is\n${decl}\nbegin\n${body}\nend rtl;\n` });
const VL = (body, ports = 'input a, b, output y') => ({ 't.v': `module t(${ports});\n${body}\nendmodule\n` });

test('the hint table is well formed: unique ids, English and Portuguese explanation + fix, a pattern or a check', () => {
  const ids = new Set();
  for (const h of HINTS) {
    assert.ok(h.id && !ids.has(h.id), `unique id ${h.id}`);
    ids.add(h.id);
    assert.ok(h.re instanceof RegExp || h.check, h.id);
    for (const l of ['en', 'pt']) for (const k of ['explain', 'fix']) {
      assert.equal(typeof h[l]?.[k], 'string', `${h.id}.${l}.${k}`);
      assert.ok(h[l][k].length > 20, `${h.id}.${l}.${k} is a sentence`);
    }
    assert.notEqual(h.pt.explain, h.en.explain, `${h.id}: Portuguese text`);
    assert.notEqual(h.pt.fix, h.en.fix, `${h.id}: Portuguese text`);
  }
  assert.deepEqual(Object.keys(HINT_LABELS).sort(), ['en', 'pt']);
  assert.equal(HINT_LABELS.pt.fix, 'Como corrigir');
});

test('every design check and rule has a help text in both languages', () => {
  for (const check of [...LINT_CHECKS, ...RULE_CHECKS]) {
    const h = hintFor({ check, message: 'x' });
    assert.ok(h, `hint for ${check}`);
    assert.ok(h.en.explain && h.pt.explain && h.en.fix && h.pt.fix, check);
  }
  assert.equal(hintFor({ message: 'something nobody wrote' }), null);
  assert.equal(hintFor(null), null);
});

test('syntax errors: missing ";" (VHDL / Verilog), missing "end if", missing "end", missing "then", statement in the wrong place', () => {
  const semi = first(V('y <= a and b\n'), 't');
  assert.equal(semi.message, "expected ';' after 'b'");   // the ISE-style message itself is unchanged
  assert.equal(semi.hint, 'missing-semicolon');
  const h = hintFor(semi);
  assert.match(h.en.fix, /Add ';' after b/);
  assert.match(h.pt.fix, /Acrescente ';' depois de b/);
  assert.equal(first(VL('assign y = a & b\n'), 't').hint, 'missing-semicolon');
  assert.equal(first(V("process (a, b) begin\n  if a = '1' then y <= b; else y <= '0';\nend process;"), 't').hint, 'missing-end-if');
  assert.equal(first(VL('reg r;\nalways @(a) begin\n  r = b;\nassign y = r;'), 't').hint, 'missing-end');
  assert.equal(first(V("process (a, b) begin\n  case a is when '0' => y <= b; when others => y <= '0';\nend process;"), 't').hint, 'missing-end');
  assert.equal(first(V("process (a, b) begin\n  if a = '1' y <= b; end if;\nend process;"), 't').hint, 'missing-then');
  assert.equal(first(V("if a = '1' then y <= b; end if;"), 't').hint, 'statement-outside-process');
  assert.equal(first(V("case a is when '0' => y <= b; when others => y <= '0'; end case;"), 't').hint, 'statement-outside-process');
  assert.equal(first(V('signal z : std_logic;\ny <= a;'), 't').hint, 'declaration-place');
  assert.equal(first(V('y = a;'), 't').hint, 'assignment-operator');
  assert.equal(first(V("process (a, b) begin\n  y <= a;\n  wait on a;\n  if a = '1' then\nend process;"), 't').hint, 'missing-end-if');
});

test('names and types: undeclared signal, numeric_std / std_logic_1164 missing, std_logic vs std_logic_vector, width, mode in / out', () => {
  const und = first(V('y <= a and c;'), 't');
  assert.equal(und.message, "'c' is not declared");
  assert.equal(und.hint, 'not-declared');
  assert.match(hintFor(und).en.fix, /signal c : std_logic;/);
  assert.match(hintFor(und).pt.explain, /não está declarado/);
  const num = first(V('y <= std_logic(to_unsigned(1, 1)(0));', '', 'a, b : in std_logic; y : out std_logic', 'library ieee; use ieee.std_logic_1164.all;'), 't');
  assert.equal(num.hint, 'numeric-std-not-declared');
  assert.match(hintFor(num).en.fix, /use ieee\.numeric_std\.all;/);
  assert.equal(first(V("y <= '1';", '', 'y : out std_logic', ''), 't').hint, 'std-logic-not-declared');
  const tm = first(V('y <= v;', 'signal v : std_logic_vector(3 downto 0) := "0000";'), 't');
  assert.equal(tm.hint, 'type-mismatch');
  assert.match(hintText(tm, 'en').explain, /the value \(v\) is std_logic_vector but the target needs std_logic/);
  assert.match(hintText(tm, 'pt').explain, /o valor \(v\) é std_logic_vector mas o destino precisa de std_logic/);
  const w = first(V('v <= w; y <= v(0) or w(0);', 'signal v : std_logic_vector(3 downto 0); signal w : std_logic_vector(2 downto 0) := "000";'), 't', 'warning');
  assert.equal(w.hint, 'width-mismatch');
  assert.match(hintText(w).fix, /resize\(unsigned\(x\), 4\)/);
  assert.equal(first(V('a <= b; y <= b;'), 't').hint, 'mode-in');
  const mo = first(V('y <= a; y2 <= not y;', '', 'a : in std_logic; y, y2 : out std_logic'), 't');
  assert.equal(mo.hint, 'mode-out');
  assert.match(hintText(mo).fix, /signal y_reg/);
  assert.equal(first(V('y <= a;', 'signal y : std_logic;'), 't', 'warning').hint, 'redeclared');
  assert.equal(first(V('y <= a;', 'signal s : std_logc;'), 't').hint, 'unknown-type');
  assert.equal(first(V("process (a)\n  variable k : std_logic;\nbegin\n  k <= a; y <= k;\nend process;"), 't', 'warning').hint, 'variable-assign');
});

test('hierarchy: unknown module / entity, unknown port, too many ports, Verilog implicit net, wire / reg', () => {
  const C = 'library ieee; use ieee.std_logic_1164.all;\nentity c is port (x : in std_logic; q : out std_logic); end c;\narchitecture r of c is begin q <= x; end r;\n';
  const unk = first(V('u: entity work.foo port map (a => a, y => y);'), 't');
  assert.equal(unk.message, "module/entity 'foo' not found (instance 'u')");
  assert.equal(unk.hint, 'unknown-module');
  assert.match(hintText(unk, 'pt').explain, /A instância 'u' usa o módulo \/ entidade 'foo'/);
  assert.equal(first({ 'c.vhd': C, ...V('u: entity work.c port map (x => a, z => y);') }, 't').hint, 'unknown-port');
  assert.equal(first({ 'c.vhd': C, ...V('u: entity work.c port map (a, b, y);') }, 't').hint, 'too-many-ports');
  assert.equal(first(VL('assign w = a;\nassign y = w & b;'), 't', 'warning').hint, 'implicit-net');
  assert.equal(first(VL('wire w;\nalways @* w = a & b;\nassign y = w;'), 't').hint, 'wire-procedural');
  assert.equal(first(VL('reg r;\nassign r = a & b;\nassign y = r;'), 't').hint, 'reg-continuous');
  assert.equal(first(VL('foo u(.a(a));\nassign y = b;'), 't').hint, 'unknown-module');
});

test('design-check warnings carry their hint: latch, sensitivity (VHDL / Verilog), case without others, blocking', () => {
  const latch = first(V("process (a, b) begin\n  if a = '1' then y <= b; end if;\nend process;"), 't', 'warning');
  assert.equal(latch.check, 'latch');
  assert.equal(latch.hint, 'latch');
  assert.match(hintText(latch, 'en').explain, /A latch is inferred for 'y'/);
  assert.match(hintText(latch, 'pt').explain, /É inferido um latch \(trinco\) para 'y'/);
  assert.match(hintText(latch, 'en').fix, /add an 'else' branch/);
  assert.equal(first(V('process (a) begin\n  y <= a and b;\nend process;'), 't', 'warning').hint, 'sensitivity-vhdl');
  const vs = first(VL('always @(a) y = a & b;', 'input a, b, output reg y'), 't', 'warning');
  assert.equal(vs.hint, 'sensitivity-verilog');
  assert.match(hintText(vs).fix, /always @\*/);
  assert.equal(first(VL('always @(posedge a) y = b;', 'input a, b, output reg y'), 't', 'warning').hint, 'blocking');
  const cs = diags(V("process (a, b) begin\n  y <= '0';\n  case std_logic_vector'(a & b) is when \"11\" => y <= '1'; end case;\nend process;"), 't').find(d => d.check === 'case-default');
  assert.equal(cs.hint, 'case-default');
  assert.match(hintText(cs).fix, /when others =>/);
  // no placeholder is left in any text
  for (const d of [latch, vs, cs]) for (const l of ['en', 'pt']) assert.doesNotMatch(JSON.stringify(hintText(d, l)), /\$\d/);
});

test('hintText: the language falls back to English; messages from the console (implementation tools) without a hint', () => {
  const d = { message: "expected ';' after 'x'" };
  assert.deepEqual(hintText(d, 'xx'), hintText(d, 'en'));
  assert.equal(hintText({ message: 'Xst:2677 - Node <x> of sequential type is unconnected', tool: 'Xst' }, 'en'), null);
});

test('Verilog: a missing end / endfunction is reported (the parser used to loop forever on it)', () => {
  const ds = diags(VL('reg r;\nalways @(a) begin\n  r = b;\n'), 't');
  assert.ok(ds.some(d => d.message === "expected 'end' but found 'endmodule'" && d.hint === 'missing-end'));
  const f = diags(VL('function f; input x; begin f = x;\nassign y = a;'), 't');
  assert.ok(f.some(d => /expected 'end(function)?' but found/.test(d.message)));
});
