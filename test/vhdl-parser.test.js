// Tests for the VHDL front-end (core/vhdl/lexer.js + core/vhdl/parser.js).
// Run: node --test test/vhdl-parser.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { lex } from '../core/vhdl/lexer.js';
import { parse } from '../core/vhdl/parser.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, 'fixtures', 'vhdl', name), 'utf8');

// --- helpers -------------------------------------------------------------------

/** Parse and assert there are no diagnostics. */
function ok(src, file = 'test.vhd') {
  const r = parse(src, file);
  assert.deepEqual(r.errors, [], `unexpected diagnostics: ${JSON.stringify(r.errors)}`);
  assert.equal(r.lang, 'vhdl');
  assert.equal(r.file, file);
  return r;
}

/** Wrap declarations + concurrent statements in an entity/architecture pair. */
function arch(body, decls = '', ports = '') {
  const src = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity t is ${ports ? `port (${ports});` : ''} end t;
architecture a of t is
${decls}
begin
${body}
end a;`;
  const r = ok(src);
  assert.equal(r.units.length, 1);
  return r.units[0];
}

/** Wrap sequential statements in a process; returns the process body. */
function seq(stmts, pdecls = '', adecls = '') {
  const m = arch(`p: process\n${pdecls}\nbegin\n${stmts}\nend process p;`, adecls);
  return m.items[0].body;
}

/** Parse an expression in an assignment context and return it. */
function expr(e) {
  const m = arch(`y <= ${e};`);
  return m.items[0].value;
}

/** Remove loc fields recursively (to compare shapes). */
function noloc(x) {
  if (Array.isArray(x)) return x.map(noloc);
  if (x && typeof x === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(x)) if (k !== 'loc') o[k] = noloc(v);
    return o;
  }
  return x;
}

const R = (name) => ({ op: 'ref', name });
const I = (v) => ({ op: 'int', value: String(v) });
const B = (o, a, b) => ({ op: 'binary', o, a, b });
const L1 = (bits) => ({ op: 'lit', bits, signed: false, sized: true, scalar: true });
const LV = (bits) => ({ op: 'lit', bits, signed: false, sized: true });
const LOGIC = { kind: 'logic', range: null, signed: false };

// ================================================================================
describe('lexer', () => {
  const types = (src) => lex(src).tokens.slice(0, -1).map((t) => [t.type, t.value]);

  test('keywords are case-insensitive, identifiers lower-cased with raw kept', () => {
    const { tokens } = lex('ENTITY Foo_Bar IS');
    assert.deepEqual(tokens.slice(0, 3).map((t) => [t.type, t.value]), [['kw', 'entity'], ['id', 'foo_bar'], ['kw', 'is']]);
    assert.equal(tokens[1].raw, 'Foo_Bar');
  });

  test('line and column tracking', () => {
    const { tokens } = lex('a\n  b <= c;');
    assert.deepEqual([tokens[1].line, tokens[1].col], [2, 3]);
    assert.deepEqual([tokens[2].line, tokens[2].col], [2, 5]);
  });

  test('comments: -- and /* */', () => {
    assert.deepEqual(types('a -- comment <= b\n/* multi\nline */ c'), [['id', 'a'], ['id', 'c']]);
  });

  test('character literals vs attribute tick', () => {
    assert.deepEqual(types("x <= '0';"), [['id', 'x'], ['op', '<='], ['char', '0'], ['op', ';']]);
    assert.deepEqual(types("clk'event"), [['id', 'clk'], ['op', "'"], ['id', 'event']]);
    assert.deepEqual(types("x'range"), [['id', 'x'], ['op', "'"], ['kw', 'range']]);
    assert.deepEqual(types("unsigned'(\"01\")"), [['id', 'unsigned'], ['op', "'"], ['op', '('], ['str', '01'], ['op', ')']]);
    assert.deepEqual(types("a(1)'length"), [['id', 'a'], ['op', '('], ['int', '1'], ['op', ')'], ['op', "'"], ['id', 'length']]);
    assert.deepEqual(types("('0','1')"), [['op', '('], ['char', '0'], ['op', ','], ['char', '1'], ['op', ')']]);
    assert.deepEqual(types("character'('a')"), [['id', 'character'], ['op', "'"], ['op', '('], ['char', 'a'], ['op', ')']]);
  });

  test('string literals with "" escape', () => {
    assert.deepEqual(types('"say ""hi"""'), [['str', 'say "hi"']]);
  });

  test('bit-string literals', () => {
    assert.deepEqual(types('x"FF" b"0101" o"17" X"a_5"'), [
      ['bitstr', '11111111'], ['bitstr', '0101'], ['bitstr', '001111'], ['bitstr', '10100101']]);
    assert.deepEqual(types('8x"F" 4b"1" 3x"F" 6sx"F" d"10" 8d"5"'), [
      ['bitstr', '00001111'], ['bitstr', '0001'], ['bitstr', '111'], ['bitstr', '111111'], ['bitstr', '1010'], ['bitstr', '00000101']]);
    assert.deepEqual(types('x"Z-"'), [['bitstr', 'ZZZZ----']]);
  });

  test('numbers: decimal, underscores, based, reals', () => {
    assert.deepEqual(types('123 1_000_000 16#FF# 2#1010# 8#17# 1e3 1.5e3 3.25 16#F#E1 2.5E-3'), [
      ['int', '123'], ['int', '1000000'], ['int', '255'], ['int', '10'], ['int', '15'], ['int', '1000'],
      ['real', 1500], ['real', 3.25], ['int', '240'], ['real', 0.0025]]);
  });

  test('compound delimiters', () => {
    assert.deepEqual(types('<= >= /= := => ** <> ?='), [
      ['op', '<='], ['op', '>='], ['op', '/='], ['op', ':='], ['op', '=>'], ['op', '**'], ['op', '<>'], ['op', '?=']]);
  });

  test('lexical errors are reported, not thrown', () => {
    const r = lex('a $ "unterminated');
    assert.ok(r.errors.length >= 2);
    assert.equal(r.tokens[r.tokens.length - 1].type, 'eof');
  });
});

// ================================================================================
describe('design units', () => {
  test('library/use clauses: ieee silent, work packages listed', () => {
    const r = ok(`library ieee, mylib; use ieee.std_logic_1164.all; use IEEE.Numeric_Std.ALL;
      use work.My_Pkg.all; use work.other.c; use std.textio.all; use mylib.lpkg.all;
      context ieee.ieee_std_context;
      entity e is end; architecture a of e is begin end;`);
    assert.deepEqual(r.units[0].uses, ['my_pkg', 'other', 'lpkg']);
  });

  test('entity with generics and ports (multiple names, all modes)', () => {
    const r = ok(`entity E is
      generic (N : integer := 4; constant W, D : natural := 2; S : string := "hi"; T : time := 10 ns);
      port (a, b : in std_logic; c : out std_logic_vector(3 downto 0);
            d : inout std_logic; e : buffer unsigned(N-1 downto 0); f : in std_logic := '1');
    end entity E;
    architecture rtl of E is begin end architecture rtl;`);
    const m = r.units[0];
    assert.equal(m.kind, 'module');
    assert.equal(m.name, 'e');
    assert.equal(m.lang, 'vhdl');
    assert.equal(m.file, 'test.vhd');
    assert.deepEqual(m.loc, { line: 1, col: 1 });
    assert.deepEqual(m.params.map((p) => p.name), ['n', 'w', 'd', 's', 't']);
    assert.deepEqual(m.params[0], { name: 'n', type: { kind: 'integer', range: null }, default: I(4), local: false });
    assert.deepEqual(m.params[1].type.kind, 'integer');
    assert.deepEqual(m.params[3].type, { kind: 'string' });
    assert.deepEqual(m.params[3].default, { op: 'str', value: 'hi' });
    assert.deepEqual(m.params[4].default, { op: 'phys', value: 10, unit: 'ns' });
    assert.deepEqual(m.ports.map((p) => [p.name, p.dir]),
      [['a', 'in'], ['b', 'in'], ['c', 'out'], ['d', 'inout'], ['e', 'out'], ['f', 'in']]);
    assert.deepEqual(m.ports[0].type, LOGIC);
    assert.deepEqual(m.ports[2].type, { kind: 'logic', range: { left: I(3), right: I(0), dir: 'downto' }, signed: false });
    assert.equal(m.ports[4].type.signed, false);
    assert.deepEqual(m.ports[5].default, L1('1'));
    assert.ok(m.ports[0].loc.line === 3);
    assert.deepEqual(m.decls, []);
    assert.deepEqual(m.items, []);
    assert.deepEqual(m.uses, []);
    assert.equal(m.entityOnly, undefined);
  });

  test('lone entity -> entityOnly; lone architecture -> Architecture unit', () => {
    const r = ok(`entity x is port (a : in bit); end x;
      architecture beh of other_ent is signal s : bit; begin s <= '1'; end beh;`);
    assert.equal(r.units.length, 2);
    assert.equal(r.units[0].entityOnly, true);
    assert.deepEqual(r.units[0].items, []);
    const a = r.units[1];
    assert.equal(a.kind, 'architecture');
    assert.equal(a.name, 'beh');
    assert.equal(a.entity, 'other_ent');
    assert.equal(a.lang, 'vhdl');
    assert.equal(a.decls.length, 1);
    assert.equal(a.items.length, 1);
  });

  test('multiple entities/architectures; last architecture wins', () => {
    const r = ok(`entity a is end a; entity b is end b;
      architecture one of a is begin end one;
      architecture rtl of b is signal s1 : bit; begin end rtl;
      architecture two of a is signal z : bit; begin end two;`);
    assert.deepEqual(r.units.map((u) => [u.kind, u.name]), [['module', 'a'], ['module', 'b']]);
    assert.deepEqual(r.units[0].decls.map((d) => d.name), ['z']);
    assert.deepEqual(r.units[1].decls.map((d) => d.name), ['s1']);
  });

  test('package and package body merged; deferred constant; functions from body', () => {
    const r = ok(fixture('util_pkg.vhd'), 'util_pkg.vhd');
    assert.equal(r.units.length, 1);
    const p = r.units[0];
    assert.equal(p.kind, 'package');
    assert.equal(p.name, 'util_pkg');
    assert.equal(p.lang, 'vhdl');
    assert.deepEqual(p.uses, []);
    assert.deepEqual(p.decls.map((d) => [d.kind, d.name]), [
      ['const', 'data_width'], ['const', 'clk_freq'], ['const', 'all_ones'], ['type', 'byte_t'],
      ['function', 'parity'], ['function', 'max']]);
    assert.deepEqual(p.decls[1].value, I(50000000));
    const parity = p.decls[4];
    assert.deepEqual(parity.params, [{ name: 'v', dir: 'in', default: null,
      type: { kind: 'logic', range: null, signed: false, unconstrained: true } }]);
    assert.deepEqual(parity.returnType, LOGIC);
    assert.equal(parity.decls[0].net, 'variable');
    assert.equal(parity.body[0].kind, 'forrange');
    assert.deepEqual(parity.body[0].range, { of: R('v'), reverse: false });
    assert.deepEqual(noloc(parity.body[1]), { kind: 'return', value: R('p') });
    assert.equal(p.decls[5].params.length, 2);
    assert.equal(p.decls[5].body[0].kind, 'if');

    const r2 = ok(`package k is constant c : integer; end package;
      package body k is constant c : integer := 5; end package body;`);
    assert.deepEqual(r2.units[0].decls.map((d) => [d.name, d.value]), [['c', I(5)]]);
  });

  test('configuration declarations are skipped', () => {
    const r = ok(`entity e is end; architecture a of e is begin end;
      configuration cfg of e is for a for u1 : c use entity work.x; end for; end for; end configuration cfg;
      entity f is end;`);
    assert.deepEqual(r.units.map((u) => u.name), ['e', 'f']);
  });

  test('architecture uses = entity context + architecture context', () => {
    const r = ok(`use work.p1.all; entity e is end; use work.p2.all; architecture a of e is use work.p3.all; begin end;`);
    assert.deepEqual(r.units[0].uses, ['p1', 'p2', 'p3']);
  });
});

// ================================================================================
describe('types and declarations', () => {
  test('type mapping', () => {
    const m = arch('', `
      signal a : std_logic; signal b : std_ulogic; signal c : bit;
      signal d : std_logic_vector(7 downto 0); signal e : bit_vector(0 to 3);
      signal f : unsigned(3 downto 0); signal g : signed(15 downto 0);
      signal h : integer; signal i : natural; signal j : positive; signal k : integer range 0 to 9;
      signal l : boolean; signal m : time; signal n : string(1 to 4); signal o : real;
      signal p : my_type; signal q : ieee.std_logic_1164.std_logic; signal r : std_ulogic_vector(1 downto 0);`);
    const t = Object.fromEntries(m.decls.map((d) => [d.name, d.type]));
    assert.deepEqual(t.a, LOGIC); assert.deepEqual(t.b, LOGIC); assert.deepEqual(t.c, LOGIC);
    assert.deepEqual(t.d, { kind: 'logic', range: { left: I(7), right: I(0), dir: 'downto' }, signed: false });
    assert.deepEqual(t.e, { kind: 'logic', range: { left: I(0), right: I(3), dir: 'to' }, signed: false });
    assert.equal(t.f.signed, false);
    assert.equal(t.g.signed, true);
    assert.deepEqual(t.h, { kind: 'integer', range: null });
    assert.equal(t.i.kind, 'integer'); assert.deepEqual(t.i.range.left, I(0));
    assert.deepEqual(t.j.range.left, I(1));
    assert.deepEqual(t.k, { kind: 'integer', range: { left: I(0), right: I(9), dir: 'to' } });
    assert.deepEqual(t.l, { kind: 'boolean' });
    assert.deepEqual(t.m, { kind: 'time' });
    assert.deepEqual(t.n, { kind: 'string' });
    assert.deepEqual(t.o, { kind: 'real' });
    assert.deepEqual(t.p, { kind: 'named', name: 'my_type' });
    assert.deepEqual(t.q, LOGIC);
    assert.equal(t.r.kind, 'logic');
    assert.equal(m.decls[0].net, 'signal');
  });

  test('type declarations: enum, array, unconstrained array, integer range, subtype', () => {
    const m = arch('', `
      type State_T is (Idle, Run, Done);
      type ram_t is array (0 to 255) of std_logic_vector(7 downto 0);
      type vec_arr is array (natural range <>) of std_logic;
      type small is range 0 to 15;
      subtype byte is std_logic_vector(7 downto 0);
      subtype idx is integer range 0 to 7;
      type mat is array (0 to 1, 0 to 2) of bit;
      type by_enum is array (state_t) of integer;`);
    const d = Object.fromEntries(m.decls.map((x) => [x.name, x]));
    assert.deepEqual(noloc(d.state_t), { kind: 'type', name: 'state_t', type: { kind: 'enum', values: ['idle', 'run', 'done'] } });
    assert.deepEqual(d.ram_t.type, { kind: 'array', range: { left: I(0), right: I(255), dir: 'to' },
      elem: { kind: 'logic', range: { left: I(7), right: I(0), dir: 'downto' }, signed: false } });
    assert.deepEqual(d.vec_arr.type, { kind: 'array', range: null, elem: LOGIC });
    assert.deepEqual(d.small.type, { kind: 'integer', range: { left: I(0), right: I(15), dir: 'to' } });
    assert.equal(d.byte.type.kind, 'logic');
    assert.deepEqual(d.idx.type, { kind: 'integer', range: { left: I(0), right: I(7), dir: 'to' } });
    assert.equal(d.mat.type.kind, 'array');
    assert.equal(d.mat.type.elem.kind, 'array');
    assert.deepEqual(d.mat.type.elem.elem, LOGIC);
    assert.deepEqual(d.by_enum.type.range, { of: R('state_t'), reverse: false });
  });

  test('alias is dropped with a warning', () => {
    const r = parse(`entity e is end; architecture a of e is signal z : bit_vector(7 downto 0);
      alias hi : bit_vector(3 downto 0) is z(7 downto 4); begin end;`);
    assert.equal(r.errors.filter((e) => e.severity === 'error').length, 0);
    assert.equal(r.errors.filter((e) => e.severity === 'warning').length, 1);
    assert.deepEqual(r.units[0].decls.map((d) => d.name), ['z']);
  });

  test('constants / shared variable / components / attributes', () => {
    const m = arch('', `
      constant C1, C2 : integer := 3;
      constant Z : std_logic_vector(3 downto 0) := (others => 'Z');
      shared variable sv : integer := 0;
      component foo is generic (n : integer); port (a : in bit; b : out bit); end component foo;
      component bar port (a : in bit); end component;
      attribute keep : string;
      attribute keep of c1 : constant is "true";`);
    assert.deepEqual(m.decls.map((d) => [d.kind, d.name]), [['const', 'c1'], ['const', 'c2'], ['const', 'z'], ['signal', 'sv']]);
    assert.deepEqual(m.decls[0].value, I(3));
    assert.equal(m.decls[3].net, 'variable');
    assert.deepEqual(m.decls[3].init, I(0));
  });

  test('functions and procedures in an architecture', () => {
    const m = arch('', `
      function inc(x : unsigned) return unsigned is begin return x + 1; end inc;
      pure function f2 return integer is constant k : integer := 2; begin return k; end function;
      procedure p(signal s : out std_logic; constant v : in std_logic := '1') is
      begin s <= v; end procedure p;
      function "and"(a, b : my_t) return my_t is begin return a; end;`);
    const [inc, f2, p, andf] = m.decls;
    assert.equal(inc.kind, 'function');
    assert.equal(inc.name, 'inc');
    assert.equal(inc.params[0].type.kind, 'logic');
    assert.equal(inc.retVar, undefined);
    assert.deepEqual(noloc(inc.body), [{ kind: 'return', value: B('+', R('x'), I(1)) }]);
    assert.deepEqual(f2.params, []);
    assert.equal(f2.decls[0].kind, 'const');
    assert.equal(p.returnType, null);
    assert.deepEqual(p.params.map((x) => [x.name, x.dir, x.class]), [['s', 'out', 'signal'], ['v', 'in', 'constant']]);
    assert.deepEqual(p.params[1].default, L1('1'));
    assert.equal(p.body[0].nonblocking, true);
    assert.equal(andf.name, '"and"');
  });
});

// ================================================================================
describe('concurrent statements', () => {
  test('simple assignment with and without delay', () => {
    const m = arch(`y <= a and b; clk <= not clk after 10 ns;`);
    assert.deepEqual(noloc(m.items[0]), { kind: 'assign', target: R('y'), value: B('&', R('a'), R('b')), delay: null });
    assert.deepEqual(noloc(m.items[1]), { kind: 'assign', target: R('clk'),
      value: { op: 'unary', o: '~', a: R('clk') }, delay: { op: 'phys', value: 10, unit: 'ns' } });
    assert.ok(m.items[0].loc.line > 0);
  });

  test('conditional assignment -> cond chain', () => {
    const m = arch(`y <= a when s = "00" else b when s = "01" else c;`);
    assert.deepEqual(noloc(m.items[0]), { kind: 'assign', target: R('y'), delay: null, value: {
      op: 'cond', cond: B('==', R('s'), LV('00')), then: R('a'),
      else: { op: 'cond', cond: B('==', R('s'), LV('01')), then: R('b'), else: R('c') } } });
  });

  test('selected assignment -> process(all) with case', () => {
    const m = arch(`with sel select y <= a when "00", b when "01" | "10", '0' when others;`);
    const p = m.items[0];
    assert.equal(p.kind, 'process');
    assert.equal(p.sens, 'all');
    assert.equal(p.initial, false);
    assert.equal(p.body.length, 1);
    const c = noloc(p.body[0]);
    assert.equal(c.kind, 'case');
    assert.equal(c.variant, 'case');
    assert.deepEqual(c.expr, R('sel'));
    assert.deepEqual(c.items.map((it) => it.choices), [[LV('00')], [LV('01'), LV('10')]]);
    assert.deepEqual(c.items[0].body.stmts, [{ kind: 'assign', target: R('y'), value: R('a'), nonblocking: true, delay: null }]);
    assert.deepEqual(c.default.stmts[0].value, L1('0'));
  });

  test('process: sensitivity list, all, none, label, decls', () => {
    const m = arch(`
      p1 : process (clk, rst) is variable v : integer := 0; constant k : bit := '1'; begin v := v + 1; end process p1;
      process (all) begin y <= a; end process;
      process begin wait; end process;
      postponed process (a) begin end postponed process;`);
    const [p1, p2, p3] = m.items;
    assert.equal(p1.label, 'p1');
    assert.deepEqual(p1.sens, [{ edge: 'any', expr: R('clk') }, { edge: 'any', expr: R('rst') }]);
    assert.deepEqual(p1.decls.map((d) => [d.kind, d.name, d.net]), [['signal', 'v', 'variable'], ['const', 'k', undefined]]);
    assert.deepEqual(noloc(p1.body[0]), { kind: 'assign', target: R('v'), value: B('+', R('v'), I(1)), nonblocking: false, delay: null });
    assert.equal(p2.sens, 'all');
    assert.equal(p2.label, null);
    assert.equal(p3.sens, null);
    assert.equal(p3.initial, false);
    assert.equal(m.items.length, 4);
  });

  test('component instantiation forms', () => {
    const m = arch(`
      u1 : cnt port map (clk, rst, open, q(3 downto 0));
      u2 : component cnt generic map (8, W => 4) port map (clk => clk, en => '1', q => open, d => a & b);
      u3 : entity work.cnt(rtl) port map (clk => clk);
      u4 : entity cnt port map (x => y);`);
    const [u1, u2, u3, u4] = m.items.map(noloc);
    assert.deepEqual(u1, { kind: 'instance', name: 'u1', module: 'cnt', params: [], conns: [
      { port: null, expr: R('clk') }, { port: null, expr: R('rst') }, { port: null, expr: null },
      { port: null, expr: { op: 'slice', base: R('q'), left: I(3), right: I(0), dir: 'downto' } }] });
    assert.deepEqual(u2.params, [{ name: null, value: I(8) }, { name: 'w', value: I(4) }]);
    assert.deepEqual(u2.conns, [{ port: 'clk', expr: R('clk') }, { port: 'en', expr: L1('1') }, { port: 'q', expr: null },
      { port: 'd', expr: { op: 'concat', parts: [R('a'), R('b')] } }]);
    assert.equal(u3.module, 'cnt');
    assert.equal(u3.arch, 'rtl');
    assert.equal(u4.module, 'cnt');
  });

  test('for-generate (to / downto) and if-generate', () => {
    const m = arch(`
      g1 : for i in 0 to N-1 generate
        signal t : bit;
      begin
        t <= a(i);
        u : entity work.x port map (t);
      end generate g1;
      g2 : for j in 7 downto 0 generate b(j) <= a(7-j); end generate;
      g3 : if N > 4 generate y <= a; end generate g3;
      g4 : if N = 1 generate y <= '1'; elsif N = 2 generate y <= '0'; else generate y <= 'Z'; end generate;
      g5 : for k in a'range generate end generate;`);
    const [g1, g2, g3, g4, g5] = m.items;
    assert.equal(g1.kind, 'generate_for');
    assert.equal(g1.label, 'g1');
    assert.equal(g1.var, 'i');
    assert.deepEqual(g1.init, I(0));
    assert.deepEqual(g1.cond, B('<=', R('i'), B('-', R('n'), I(1))));
    assert.deepEqual(g1.step, B('+', R('i'), I(1)));
    assert.deepEqual(g1.decls.map((d) => d.name), ['t']);
    assert.deepEqual(g1.items.map((x) => x.kind), ['assign', 'instance']);
    assert.deepEqual(g2.init, I(7));
    assert.deepEqual(g2.cond, B('>=', R('j'), I(0)));
    assert.deepEqual(g2.step, B('-', R('j'), I(1)));
    assert.equal(g2.decls.length, 0);
    assert.equal(g3.kind, 'generate_if');
    assert.deepEqual(g3.cond, B('>', R('n'), I(4)));
    assert.equal(g3.then.length, 1);
    assert.deepEqual(g3.else, []);
    assert.equal(g4.else.length, 1);
    assert.equal(g4.else[0].kind, 'generate_if');
    assert.equal(g4.else[0].else.length, 1);
    assert.deepEqual(g5.range, { of: R('a'), reverse: false });
    assert.equal(g5.init.op, 'attr');
  });

  test('concurrent assert -> process; concurrent procedure call -> process', () => {
    const m = arch(`assert a = '1' report "bad" severity warning; my_proc(a, b);`);
    assert.equal(m.items[0].kind, 'process');
    assert.deepEqual(noloc(m.items[0].body[0]), { kind: 'assert', cond: B('==', R('a'), L1('1')),
      message: { op: 'str', value: 'bad' }, severity: 'warning' });
    assert.deepEqual(noloc(m.items[1].body[0]), { kind: 'call', name: 'my_proc', args: [R('a'), R('b')] });
  });

  test('concurrent multi-element waveform -> process with one assign per element', () => {
    const m = arch(`rst <= '1', '0' after 100 ns;`);
    const p = m.items[0];
    assert.equal(p.kind, 'process');
    const blk = noloc(p.body[0]);
    assert.equal(blk.kind, 'block');
    assert.deepEqual(blk.stmts, [
      { kind: 'assign', target: R('rst'), value: L1('1'), nonblocking: true, delay: null },
      { kind: 'assign', target: R('rst'), value: L1('0'), nonblocking: true, delay: { op: 'phys', value: 100, unit: 'ns' }, waveCont: true }]);
  });

  test('delay mechanism: transport / reject ... inertial are kept on the assignment', () => {
    const m = arch(`a <= transport b after 2 ns; c <= reject 1 ns inertial d after 3 ns;`);
    assert.equal(m.items[0].mech, 'transport');
    assert.deepEqual(m.items[1].mech, { reject: { op: 'phys', value: 1, unit: 'ns' } });
  });

  test('block statements are flattened', () => {
    const m = arch(`b1 : block signal t : bit; begin t <= a; end block b1;`);
    assert.deepEqual(m.decls.map((d) => d.name), ['t']);
    assert.equal(m.items[0].kind, 'assign');
  });
});

// ================================================================================
describe('sequential statements', () => {
  test('signal and variable assignment, after delay', () => {
    const b = seq(`s <= a after 5 ns; v := 3; s(2) <= '1'; s(3 downto 0) <= x"F";`, 'variable v : integer;');
    assert.deepEqual(noloc(b[0]), { kind: 'assign', target: R('s'), value: R('a'), nonblocking: true, delay: { op: 'phys', value: 5, unit: 'ns' } });
    assert.deepEqual(noloc(b[1]), { kind: 'assign', target: R('v'), value: I(3), nonblocking: false, delay: null });
    assert.deepEqual(b[2].target, { op: 'apply', name: 's', args: [I(2)] });
    assert.deepEqual(b[3].target, { op: 'slice', base: R('s'), left: I(3), right: I(0), dir: 'downto' });
    assert.deepEqual(b[3].value, LV('1111'));
  });

  test('sequential waveform -> block of assigns', () => {
    const b = seq(`s <= '1', '0' after 10 ns, '1' after 20 ns;`);
    assert.equal(b[0].kind, 'block');
    assert.deepEqual(b[0].stmts.map((s) => s.delay && s.delay.value), [null, 10, 20]);
  });

  test('if / elsif / else', () => {
    const b = seq(`if a = '1' then x <= '1'; elsif b = '1' then x <= '0'; elsif c then null; else x <= 'Z'; end if;`);
    const s = noloc(b[0]);
    assert.equal(s.kind, 'if');
    assert.equal(s.then.kind, 'block');
    assert.equal(s.else.kind, 'if');
    assert.deepEqual(s.else.cond, B('==', R('b'), L1('1')));
    assert.equal(s.else.else.kind, 'if');
    assert.deepEqual(s.else.else.then.stmts, [{ kind: 'null' }]);
    assert.deepEqual(s.else.else.else.stmts[0].value, L1('z'));
  });

  test('case with |, ranges and others', () => {
    const b = seq(`case n is
      when 0 | 1 => y <= '0';
      when 2 to 5 => y <= '1';
      when others => null;
    end case;`);
    const c = noloc(b[0]);
    assert.equal(c.kind, 'case');
    assert.equal(c.variant, 'case');
    assert.deepEqual(c.items[0].choices, [I(0), I(1)]);
    assert.deepEqual(c.items[1].choices, [{ range: { left: I(2), right: I(5), dir: 'to' } }]);
    assert.deepEqual(c.default, { kind: 'block', label: null, decls: [], stmts: [{ kind: 'null' }] });
  });

  test('loops: for (to, downto, range attr), while, plain loop, exit/next', () => {
    const b = seq(`
      for i in 0 to 7 loop s(i) <= '0'; end loop;
      lbl: for i in 7 downto 0 loop next when i = 3; exit lbl when i = 1; end loop lbl;
      for i in x'reverse_range loop end loop;
      while n < 10 loop n := n + 1; end loop;
      loop exit; end loop;`, 'variable n : integer;');
    assert.deepEqual(noloc(b[0]).range, { left: I(0), right: I(7), dir: 'to' });
    assert.equal(b[0].kind, 'forrange');
    assert.equal(b[0].var, 'i');
    assert.equal(b[0].body.kind, 'block');
    assert.equal(b[1].label, 'lbl');
    assert.deepEqual(b[1].range.dir, 'downto');
    assert.deepEqual(noloc(b[1].body.stmts[0]), { kind: 'next', cond: B('==', R('i'), I(3)) });
    assert.deepEqual(noloc(b[1].body.stmts[1]), { kind: 'exit', cond: B('==', R('i'), I(1)) });
    assert.deepEqual(b[2].range, { of: R('x'), reverse: true });
    assert.equal(b[3].kind, 'while');
    assert.deepEqual(b[3].cond, B('<', R('n'), I(10)));
    assert.equal(b[4].kind, 'forever');
    assert.deepEqual(noloc(b[4].body.stmts[0]), { kind: 'exit', cond: null });
  });

  test('wait forms', () => {
    const b = seq(`wait; wait for 10 ns; wait until rising_edge(clk); wait on a, b;
      wait on a until b = '1' for 1 us;`);
    const w = b.map(noloc);
    assert.deepEqual(w[0], { kind: 'wait', on: null, until: null, for: null, level: false });
    assert.deepEqual(w[1].for, { op: 'phys', value: 10, unit: 'ns' });
    assert.deepEqual(w[2].until, { op: 'apply', name: 'rising_edge', args: [R('clk')] });
    assert.deepEqual(w[3].on, [R('a'), R('b')]);
    assert.deepEqual(w[4], { kind: 'wait', on: [R('a')], until: B('==', R('b'), L1('1')),
      for: { op: 'phys', value: 1, unit: 'us' }, level: false });
  });

  test('report / assert / severity; messages stay strings', () => {
    const b = seq(`report "0101"; report "x=" & integer'image(v) severity warning;
      assert q = "0101" report "mismatch" severity failure; assert ok;`);
    assert.deepEqual(noloc(b[0]), { kind: 'report', message: { op: 'str', value: '0101' }, severity: 'note' });
    assert.deepEqual(noloc(b[1]), { kind: 'report', severity: 'warning', message: { op: 'concat', parts: [
      { op: 'str', value: 'x=' }, { op: 'attr', prefix: R('integer'), attr: 'image', args: [R('v')] }] } });
    assert.deepEqual(noloc(b[2]), { kind: 'assert', cond: B('==', R('q'), LV('0101')),
      message: { op: 'str', value: 'mismatch' }, severity: 'failure' });
    assert.deepEqual(noloc(b[3]), { kind: 'assert', cond: R('ok'), message: null, severity: 'error' });
  });

  test('procedure calls; std.env.finish / finish / stop', () => {
    const b = seq(`std.env.finish; finish; stop; std.env.stop(0); my_proc(a, x => b); write(l, string'("hi"));`);
    assert.deepEqual(b.map((s) => [s.kind, s.name]), [['call', 'finish'], ['call', 'finish'], ['call', 'stop'],
      ['call', 'stop'], ['call', 'my_proc'], ['call', 'write']]);
    assert.deepEqual(b[0].args, []);
    assert.deepEqual(b[3].args, [I(0)]);
    assert.deepEqual(b[4].args, [R('a'), { named: 'x', value: R('b') }]);
  });

  test('return and null', () => {
    const m = arch('', 'function f(a : integer) return integer is begin null; return a * 2; end;');
    assert.deepEqual(noloc(m.decls[0].body), [{ kind: 'null' }, { kind: 'return', value: B('*', R('a'), I(2)) }]);
  });

  test('VHDL-2008 sequential conditional assignments', () => {
    const b = seq(`y <= a when s = '1' else b; v := 1 when c else 2;`, 'variable v : integer;');
    assert.deepEqual(noloc(b[0]), { kind: 'assign', target: R('y'), nonblocking: true, delay: null,
      value: { op: 'cond', cond: B('==', R('s'), L1('1')), then: R('a'), else: R('b') } });
    assert.deepEqual(b[1].value, { op: 'cond', cond: R('c'), then: I(1), else: I(2) });
    assert.equal(b[1].nonblocking, false);
  });

  test('every statement carries a loc', () => {
    const b = seq(`if a then x <= '1'; end if; wait for 1 ns; report "r";`);
    for (const s of b) assert.ok(s.loc && s.loc.line > 0 && s.loc.col > 0);
  });
});

// ================================================================================
describe('expressions', () => {
  test('logical operators map and/or/xor/xnor/nand/nor', () => {
    assert.deepEqual(expr('a and b'), B('&', R('a'), R('b')));
    assert.deepEqual(expr('a or b or c'), B('|', B('|', R('a'), R('b')), R('c')));
    assert.deepEqual(expr('a xor b'), B('^', R('a'), R('b')));
    assert.deepEqual(expr('a xnor b'), B('~^', R('a'), R('b')));
    assert.deepEqual(expr('a nand b'), B('nand', R('a'), R('b')));
    assert.deepEqual(expr('a nor b'), B('nor', R('a'), R('b')));
  });

  test('relational / shift / adding / multiplying operators', () => {
    assert.deepEqual(expr('a = b'), B('==', R('a'), R('b')));
    assert.deepEqual(expr('a /= b'), B('!=', R('a'), R('b')));
    assert.deepEqual(expr('a <= b'), B('<=', R('a'), R('b')));
    assert.deepEqual(expr('a sll 2'), B('<<', R('a'), I(2)));
    assert.deepEqual(expr('a srl 2'), B('>>', R('a'), I(2)));
    assert.deepEqual(expr('a sla 2'), B('<<<', R('a'), I(2)));
    assert.deepEqual(expr('a sra 2'), B('>>>', R('a'), I(2)));
    assert.deepEqual(expr('a rol 1'), B('rol', R('a'), I(1)));
    assert.deepEqual(expr('a mod 4'), B('mod', R('a'), I(4)));
    assert.deepEqual(expr('a rem 4'), B('rem', R('a'), I(4)));
    assert.deepEqual(expr('a / 4'), B('/', R('a'), I(4)));
    assert.deepEqual(expr('2 ** n'), B('**', I(2), R('n')));
    assert.deepEqual(expr('abs x'), { op: 'unary', o: 'abs', a: R('x') });
    assert.deepEqual(expr('-x'), { op: 'unary', o: '-', a: R('x') });
  });

  test('precedence: logical < relational < shift < adding < sign < multiplying < misc', () => {
    // a = b and c < d  ->  (a = b) and (c < d)
    assert.deepEqual(expr('a = b and c < d'), B('&', B('==', R('a'), R('b')), B('<', R('c'), R('d'))));
    // a + b sll 1 -> (a + b) sll 1
    assert.deepEqual(expr('a + b sll 1'), B('<<', B('+', R('a'), R('b')), I(1)));
    // a + b * c -> a + (b * c)
    assert.deepEqual(expr('a + b * c'), B('+', R('a'), B('*', R('b'), R('c'))));
    // -a * b -> -(a * b)  (sign applies to the term)
    assert.deepEqual(expr('-a * b'), { op: 'unary', o: '-', a: B('*', R('a'), R('b')) });
    // not a and b -> (not a) and b
    assert.deepEqual(expr('not a and b'), B('&', { op: 'unary', o: '~', a: R('a') }, R('b')));
    // 2 * n ** 2 -> 2 * (n ** 2)
    assert.deepEqual(expr('2 * n ** 2'), B('*', I(2), B('**', R('n'), I(2))));
    // a - b - c is left associative
    assert.deepEqual(expr('a - b - c'), B('-', B('-', R('a'), R('b')), R('c')));
    // parentheses are not aggregates
    assert.deepEqual(expr('(a + b) * c'), B('*', B('+', R('a'), R('b')), R('c')));
  });

  test('concatenation with & -> concat (flattened)', () => {
    assert.deepEqual(expr('a & b & "01" & \'1\''), { op: 'concat', parts: [R('a'), R('b'), LV('01'), L1('1')] });
    assert.deepEqual(expr('(a & b) + 1'), B('+', { op: 'concat', parts: [R('a'), R('b')] }, I(1)));
  });

  test('literals: char, bit strings, std_logic strings, ints, reals, time, strings', () => {
    assert.deepEqual(expr("'1'"), L1('1'));
    assert.deepEqual(expr("'U'"), L1('x'));
    assert.deepEqual(expr("'-'"), L1('x'));
    assert.deepEqual(expr("'Z'"), L1('z'));
    assert.deepEqual(expr("'L'"), L1('0'));
    assert.deepEqual(expr("'H'"), L1('1'));
    assert.deepEqual(expr('"01ZX-LHUW"'), LV('01zxx01xx'));
    assert.deepEqual(expr('x"A5"'), LV('10100101'));
    assert.deepEqual(expr('x"0Z"'), LV('0000zzzz'));
    assert.deepEqual(expr('b"1010_1010"'), LV('10101010'));
    assert.deepEqual(expr('o"7"'), LV('111'));
    assert.deepEqual(expr('16#FF#'), I(255));
    assert.deepEqual(expr('1_000'), I(1000));
    assert.deepEqual(expr('1.5'), { op: 'real', value: 1.5 });
    assert.deepEqual(expr('1.5e3'), { op: 'real', value: 1500 });
    assert.deepEqual(expr('10 ns'), { op: 'phys', value: 10, unit: 'ns' });
    assert.deepEqual(expr('2.5 us'), { op: 'phys', value: 2.5, unit: 'us' });
    assert.deepEqual(expr('1 sec'), { op: 'phys', value: 1, unit: 'sec' });
    assert.deepEqual(expr('"hello"'), { op: 'str', value: 'hello' });
    assert.deepEqual(expr('""'), { op: 'str', value: '' });
  });

  test('names: index/apply, slice, chained, selected, function calls', () => {
    assert.deepEqual(expr('a(3)'), { op: 'apply', name: 'a', args: [I(3)] });
    assert.deepEqual(expr('a(7 downto 4)'), { op: 'slice', base: R('a'), left: I(7), right: I(4), dir: 'downto' });
    assert.deepEqual(expr('a(0 to 3)'), { op: 'slice', base: R('a'), left: I(0), right: I(3), dir: 'to' });
    assert.deepEqual(expr('f(x, y)'), { op: 'apply', name: 'f', args: [R('x'), R('y')] });
    assert.deepEqual(expr('mem(i)(3)'), { op: 'index', base: { op: 'apply', name: 'mem', args: [R('i')] }, index: I(3) });
    assert.deepEqual(expr('mem(i)(7 downto 4)'), { op: 'slice', base: { op: 'apply', name: 'mem', args: [R('i')] },
      left: I(7), right: I(4), dir: 'downto' });
    assert.deepEqual(expr('work.pkg.c'), R('c'));
    assert.deepEqual(expr('ieee.numeric_std.to_unsigned(x, 8)'), { op: 'apply', name: 'to_unsigned', args: [R('x'), I(8)] });
    assert.deepEqual(expr('to_unsigned(arg => x, size => 8)'), { op: 'apply', name: 'to_unsigned',
      args: [{ named: 'arg', value: R('x') }, { named: 'size', value: I(8) }] });
    assert.deepEqual(expr('std_logic_vector(to_unsigned(c, 8))'), { op: 'apply', name: 'std_logic_vector',
      args: [{ op: 'apply', name: 'to_unsigned', args: [R('c'), I(8)] }] });
    assert.deepEqual(expr('TRUE'), R('true'));
  });

  test('attributes', () => {
    assert.deepEqual(expr("clk'event and clk = '1'"), B('&', { op: 'attr', prefix: R('clk'), attr: 'event', args: [] },
      B('==', R('clk'), L1('1'))));
    assert.deepEqual(expr("x'length"), { op: 'attr', prefix: R('x'), attr: 'length', args: [] });
    assert.deepEqual(expr("x'HIGH"), { op: 'attr', prefix: R('x'), attr: 'high', args: [] });
    assert.deepEqual(expr("integer'image(v)"), { op: 'attr', prefix: R('integer'), attr: 'image', args: [R('v')] });
    assert.deepEqual(expr("a(1)'length"), { op: 'attr', prefix: { op: 'apply', name: 'a', args: [I(1)] }, attr: 'length', args: [] });
  });

  test('qualified expressions', () => {
    assert.deepEqual(expr('unsigned\'("0101")'), { op: 'qualified', type: 'unsigned', expr: LV('0101') });
    assert.deepEqual(expr("std_logic_vector'(x\"00\")"), { op: 'qualified', type: 'std_logic_vector', expr: LV('00000000') });
    assert.deepEqual(expr("t'(others => '0')").op, 'qualified');
  });

  test('aggregates', () => {
    assert.deepEqual(expr("(others => '0')"), { op: 'aggregate', items: [{ choices: ['others'], value: L1('0') }] });
    assert.deepEqual(expr("(0 => '1', others => '0')"), { op: 'aggregate', items: [
      { choices: [I(0)], value: L1('1') }, { choices: ['others'], value: L1('0') }] });
    assert.deepEqual(expr("(7 downto 4 => '1', others => '0')"), { op: 'aggregate', items: [
      { choices: [{ range: { left: I(7), right: I(4), dir: 'downto' } }], value: L1('1') },
      { choices: ['others'], value: L1('0') }] });
    assert.deepEqual(expr("(1 | 3 => '1', others => '0')").items[0].choices, [I(1), I(3)]);
    assert.deepEqual(expr("(a, b, '0')"), { op: 'aggregate', items: [
      { choices: null, value: R('a') }, { choices: null, value: R('b') }, { choices: null, value: L1('0') }] });
    assert.deepEqual(expr('(a)'), R('a'));
  });

  test('VHDL-2008 unary reduction operators', () => {
    assert.deepEqual(expr('and v'), { op: 'unary', o: '&', a: R('v') });
    assert.deepEqual(expr('xor v'), { op: 'unary', o: '^', a: R('v') });
  });
});

// ================================================================================
describe('error handling', () => {
  test('never throws on garbage and reports diagnostics with file/line/col', () => {
    const inputs = ['', ')))', 'entity', 'entity e is port (a : in ; end;', 'architecture a of e is begin x <= ; end;',
      '"unterminated', 'process begin', 'entity e is end; architecture a of e is begin p: process begin if then end process; end;',
      '\u0000\u0001', 'package p is function f return; end;', 'library', 'use work.', 'begin end end end;',
      'entity e is end; architecture a of e is begin with s select y <= ; end;'];
    for (const src of inputs) {
      const r = parse(src, 'bad.vhd');
      assert.equal(r.lang, 'vhdl');
      assert.ok(Array.isArray(r.units));
      for (const e of r.errors) {
        assert.equal(e.file, 'bad.vhd');
        assert.ok(e.line >= 1 && e.col >= 1);
        assert.ok(['error', 'warning'].includes(e.severity));
        assert.equal(typeof e.message, 'string');
      }
      if (src.trim()) assert.ok(r.errors.length > 0, `expected diagnostics for ${JSON.stringify(src)}`);
    }
  });

  test('recovers after an error and keeps parsing following statements and units', () => {
    const r = parse(`entity e is port (a : in std_logic; y : out std_logic); end e;
architecture rtl of e is
  signal s : std_logic;
begin
  s <= a +* ;
  y <= s;
end rtl;
entity f is end f;`);
    assert.equal(r.errors.length, 1);
    assert.equal(r.errors[0].line, 5);
    assert.deepEqual(r.units.map((u) => u.name), ['e', 'f']);
    assert.equal(r.units[0].items.length, 1);
    assert.deepEqual(r.units[0].items[0].target, R('y'));
  });

  test('random token soup terminates without throwing', () => {
    const words = ['entity', 'is', 'end', ';', '(', ')', 'begin', 'process', 'if', 'then', 'a', '<=', "'1'", 'when',
      'else', 'case', '=>', 'architecture', 'of', 'port', 'map', 'generate', 'for', 'in', 'to', 'loop', ',', ':'];
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let k = 0; k < 200; k++) {
      const src = Array.from({ length: 40 }, () => words[Math.floor(rnd() * words.length)]).join(' ');
      const r = parse(src);
      assert.ok(Array.isArray(r.errors));
    }
  });

  test('output is JSON-serialisable', () => {
    const r = ok(fixture('tb_counter.vhd'));
    assert.deepEqual(JSON.parse(JSON.stringify(r)), r);
  });
});

// ================================================================================
describe('realistic designs (fixtures)', () => {
  test('counter with async reset and enable', () => {
    const r = ok(fixture('counter.vhd'), 'counter.vhd');
    const m = r.units[0];
    assert.equal(m.name, 'counter');
    assert.deepEqual(m.params.map((p) => p.name), ['width']);
    assert.deepEqual(m.ports.map((p) => [p.name, p.dir]), [['clk', 'in'], ['rst', 'in'], ['en', 'in'], ['q', 'out']]);
    assert.deepEqual(m.decls[0].init, { op: 'aggregate', items: [{ choices: ['others'], value: L1('0') }] });
    const [proc, asg] = m.items;
    assert.equal(proc.kind, 'process');
    assert.deepEqual(proc.sens.map((s) => s.expr.name), ['clk', 'rst']);
    const ifs = proc.body[0];
    assert.deepEqual(ifs.cond, B('==', R('rst'), L1('1')));
    assert.deepEqual(ifs.else.cond, { op: 'apply', name: 'rising_edge', args: [R('clk')] });
    assert.deepEqual(ifs.else.then.stmts[0].then.stmts[0].value, B('+', R('cnt'), I(1)));
    assert.deepEqual(asg.value, { op: 'apply', name: 'std_logic_vector', args: [R('cnt')] });
  });

  test('7-segment decoder with with-select', () => {
    const r = ok(fixture('seg7.vhd'), 'seg7.vhd');
    const m = r.units[0];
    const p = m.items[0];
    assert.equal(p.kind, 'process');
    assert.equal(p.sens, 'all');
    const c = p.body[0];
    assert.equal(c.items.length, 15);
    assert.deepEqual(c.items[0].choices, [LV('0000')]);
    assert.deepEqual(c.items[0].body.stmts[0].value, LV('1000000'));
    assert.deepEqual(c.default.stmts[0].value, LV('0001110'));
  });

  test('FSM with enum type and two processes', () => {
    const r = ok(fixture('fsm.vhd'), 'fsm.vhd');
    const m = r.units[0];
    assert.equal(m.name, 'seq_detect');
    assert.deepEqual(m.decls[0].type, { kind: 'enum', values: ['idle', 'got1', 'got10', 'detected'] });
    assert.deepEqual(m.decls.slice(1).map((d) => [d.name, d.type]), [
      ['state', { kind: 'named', name: 'state_t' }], ['next_state', { kind: 'named', name: 'state_t' }]]);
    assert.deepEqual(m.items.map((p) => p.label), ['sync_proc', 'comb_proc']);
    const cs = m.items[1].body[2];
    assert.equal(cs.kind, 'case');
    assert.deepEqual(cs.items.map((i) => i.choices[0]), [R('idle'), R('got1'), R('got10'), R('detected')]);
    assert.equal(cs.default, null);
  });

  test('generic N-bit register', () => {
    const r = ok(fixture('reg_n.vhd'), 'reg_n.vhd');
    const m = r.units[0];
    assert.deepEqual(m.params[0].type.kind, 'integer');
    assert.deepEqual(m.params[0].default, I(8));
    assert.deepEqual(m.params[1].type.unconstrained, true);
    assert.deepEqual(m.params[1].default, LV('00000000'));
    assert.deepEqual(m.ports[3].type.range, { left: B('-', R('n'), I(1)), right: I(0), dir: 'downto' });
    const els = m.items[0].body[0].else;
    assert.deepEqual(els.cond, B('&', { op: 'attr', prefix: R('clk'), attr: 'event', args: [] }, B('==', R('clk'), L1('1'))));
  });

  test('top-level with component + entity instantiation and for-generate', () => {
    const r = ok(fixture('top.vhd'), 'top.vhd');
    const m = r.units[0];
    assert.deepEqual(m.uses, ['util_pkg']);
    assert.deepEqual(m.decls.map((d) => d.name), ['count', 'bank_t', 'bank', 'rst']); // component dropped
    const [rstAsg, ucnt, gen, led] = m.items;
    assert.deepEqual(rstAsg.value, { op: 'apply', name: 'btn', args: [I(0)] });
    assert.equal(ucnt.kind, 'instance');
    assert.equal(ucnt.module, 'counter');
    assert.deepEqual(ucnt.params, [{ name: 'width', value: I(8) }]);
    assert.deepEqual(ucnt.conns.map((c) => c.port), ['clk', 'rst', 'en', 'q']);
    assert.equal(gen.kind, 'generate_for');
    assert.equal(gen.label, 'gen_regs');
    const inst = gen.items[0];
    assert.equal(inst.module, 'reg_n');
    assert.equal(inst.name, 'u_reg');
    assert.equal(inst.conns.length, 5);
    assert.ok(inst.conns.every((c) => c.port === null));
    assert.deepEqual(inst.conns[2].expr, { op: 'apply', name: 'sw', args: [R('i')] });
    assert.equal(led.value.op, 'cond');
  });

  test('package with constants and functions', () => {
    const r = ok(fixture('util_pkg.vhd'));
    assert.equal(r.units[0].kind, 'package');
    assert.ok(r.units[0].decls.find((d) => d.name === 'parity').body.length > 0);
  });

  test('testbench with clock, wait, assert, report, finish', () => {
    const r = ok(fixture('tb_counter.vhd'), 'tb_counter.vhd');
    const m = r.units[0];
    assert.equal(m.name, 'tb_counter');
    assert.deepEqual(m.ports, []);
    assert.deepEqual(m.uses, []);
    assert.deepEqual(m.decls[0], { kind: 'const', name: 'clk_period', type: { kind: 'time' },
      value: { op: 'phys', value: 20, unit: 'ns' }, loc: m.decls[0].loc });
    const [clk, dut, stim] = m.items;
    assert.deepEqual(clk.delay, { op: 'phys', value: 10, unit: 'ns' });
    assert.equal(dut.module, 'counter');
    assert.equal(stim.sens, null);
    const kinds = stim.body.map((s) => s.kind);
    assert.deepEqual(kinds, ['wait', 'assign', 'assign', 'forrange', 'wait', 'assert', 'assign', 'wait', 'assert', 'report', 'call']);
    assert.deepEqual(stim.body[0].for, B('*', I(2), R('clk_period')));
    assert.equal(stim.body[5].message.op, 'concat');
    assert.equal(stim.body[5].message.parts.length, 3);
    assert.deepEqual(stim.body[8].cond, B('==', R('q'), LV('00001010')));
    assert.equal(stim.body[8].severity, 'failure');
    assert.deepEqual(noloc(stim.body[10]), { kind: 'call', name: 'finish', args: [] });
  });
});
