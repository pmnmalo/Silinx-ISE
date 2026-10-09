// core/modgen.js: the generators of the Module (Wizard) and Schematic (Wizard) of the New Source
// dialog. Every option combination of the module generator compiles, elaborates and simulates in
// both languages; the port table checks; the schematic generator makes I/O markers that pass
// netlist() / generateHdl() with only "not connected" warnings, and its HDL compiles and simulates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateModule, schematicFromPorts, checkPorts, identError, guessClockReset, QUICK_PORTS } from '../core/modgen.js';
import { netlist, generateHdl, normalizeDoc, portBox } from '../core/schdoc.js';
import { compile, elaborate, simulate } from '../core/compile.js';

const project = { name: 'mg', device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' } };
const ext = (lang) => (lang === 'vhdl' ? 'vhd' : 'v');

function check(text, lang, top) {
  const src = { path: `src/${top}.${ext(lang)}`, lang, text, role: 'design' };
  const lib = compile([src]);
  const design = elaborate(lib, top);
  const errors = [...lib.errors, ...design.diags].filter((d) => d.severity === 'error');
  assert.deepEqual(errors.map((e) => `${e.line}: ${e.message}`), [], `${top} (${lang}) compiles and elaborates:\n${text}`);
  assert.ok(design.top, `${top} elaborates`);
  const r = simulate([src], top, { until: 1e6 });
  assert.deepEqual(r.errors, [], `${top} (${lang}) simulates`);
  assert.deepEqual((r.sim?.log || []).filter((l) => l.kind === 'error' || l.kind === 'failure').map((l) => l.text), []);
  return design;
}

const PORTS = [
  { name: 'clk', dir: 'in', width: 1, desc: 'clock' },
  { name: 'rst_n', dir: 'in', width: 1 },
  { name: 'en', dir: 'in', width: 1, desc: 'count enable' },
  { name: 'a', dir: 'in', width: 8, desc: 'operand; with a semicolon' },
  { name: 'b', dir: 'in', width: 8 },
  { name: 'sum', dir: 'out', width: 8, desc: 'a + b' },
  { name: 'y', dir: 'out', width: 1 },
  { name: 'seg', dir: 'out', width: 7 },
];
const GENERICS = [{ name: 'WIDTH', default: '8', desc: 'data width' }, { name: 'MAX', default: '-3' }];

test('module generator: every option combination compiles, elaborates and simulates (VHDL and Verilog)', () => {
  let n = 0;
  for (const lang of ['vhdl', 'verilog']) {
    for (const generics of [[], GENERICS]) {
      const desc = 'A test module.\nSecond line of the description.';
      // combinational
      for (const combStyle of ['assign', 'process']) {
        for (const ports of [PORTS, PORTS.filter((p) => p.dir === 'out'), PORTS.filter((p) => p.dir === 'in'), []]) {
          const name = `c_${n++}`;
          const text = generateModule({ name, lang, description: desc, project, ports, generics, kind: 'comb', combStyle });
          const d = check(text, lang, name);
          assert.deepEqual(d.top.ports.map((p) => `${p.name}:${p.dir}:${p.sig.t.w}`), ports.map((p) => `${p.name}:${p.dir}:${p.width}`));
          assert.match(text, /Second line of the description/);
        }
      }
      // sequential
      for (const mode of ['none', 'sync', 'async']) {
        for (const active of ['1', '0']) {
          for (const enable of ['', 'en']) {
            for (const ports of [PORTS, PORTS.filter((p) => p.dir === 'in')]) {
              if (mode === 'none' && active === '0') continue;
              const name = `s_${n++}`;
              const text = generateModule({ name, lang, description: desc, project, ports, generics, kind: 'seq', clock: 'clk', reset: { port: 'rst_n', mode, active }, enable });
              check(text, lang, name);
              if (lang === 'verilog' && ports === PORTS) assert.match(text, /output reg\s+\[7:0\] sum/);
              if (mode === 'async') assert.match(text, lang === 'vhdl' ? /process \(clk, rst_n\)/ : new RegExp(`always @\\(posedge clk or ${active === '1' ? 'posedge' : 'negedge'} rst_n\\)`));
            }
          }
        }
      }
    }
  }
  assert.ok(n > 60, `${n} modules`);
});

test('module generator: the sequential templates behave (registers reset to 0, then hold)', () => {
  for (const lang of ['vhdl', 'verilog']) {
    for (const mode of ['sync', 'async']) {
      const ports = [{ name: 'clk', dir: 'in', width: 1 }, { name: 'reset', dir: 'in', width: 1 }, { name: 'q', dir: 'out', width: 4 }];
      let text = generateModule({ name: 'cnt', lang, project, ports, kind: 'seq', clock: 'clk', reset: { port: 'reset', mode, active: '1' } });
      // the student fills the TODO in: a counter
      text = lang === 'vhdl'
        ? text.replace(/--   (q_reg <= std_logic_vector\(unsigned\(q_reg\) \+ 1\);)/, '$1')
        : text.replace(/\/\/   (q <= q \+ 1;)/, '$1');
      assert.notEqual(text.indexOf(lang === 'vhdl' ? '      q_reg <= std_logic_vector' : '      q <= q + 1;'), -1, text);
      const tb = lang === 'vhdl'
        ? `library ieee; use ieee.std_logic_1164.all;
entity tb is end tb;
architecture t of tb is
  signal clk, reset : std_logic := '0'; signal q : std_logic_vector(3 downto 0);
begin
  uut : entity work.cnt port map (clk => clk, reset => reset, q => q);
  process begin
    reset <= '1'; wait for 5 ns; clk <= '1'; wait for 5 ns; clk <= '0'; reset <= '0'; wait for 5 ns;
    assert q = "0000" report "not reset" severity error;
    for i in 1 to 3 loop clk <= '1'; wait for 5 ns; clk <= '0'; wait for 5 ns; end loop;
    assert q = "0011" report "did not count" severity error;
    report "DONE"; wait;
  end process;
end t;`
        : `module tb; reg clk = 0, reset = 0; wire [3:0] q;
  cnt uut(.clk(clk), .reset(reset), .q(q));
  integer i;
  initial begin
    reset = 1; #5 clk = 1; #5 clk = 0; reset = 0; #5;
    if (q !== 4'b0000) $display("ERROR not reset");
    for (i = 0; i < 3; i = i + 1) begin clk = 1; #5 clk = 0; #5; end
    if (q !== 4'b0011) $display("ERROR did not count");
    $display("DONE"); $finish;
  end
endmodule`;
      const r = simulate([{ path: `src/cnt.${ext(lang)}`, lang, text }, { path: `sim/tb.${ext(lang)}`, lang, text: tb }], 'tb', { until: 1e15 });
      assert.deepEqual(r.errors, []);
      const log = r.sim.log.map((l) => l.text).join('\n');
      assert.match(log, /DONE/);
      assert.doesNotMatch(log, /ERROR|not reset|did not count/, log);
    }
  }
});

test('module generator: names that clash with the internal ones get a fresh name', () => {
  const ports = [{ name: 'clk', dir: 'in', width: 1 }, { name: 'q_reg', dir: 'in', width: 1 }, { name: 'registers', dir: 'in', width: 1 }, { name: 'q', dir: 'out', width: 2 }];
  const text = generateModule({ name: 'clash', lang: 'vhdl', project, ports, kind: 'seq', clock: 'clk' });
  assert.match(text, /signal q_reg_1 : std_logic_vector\(1 downto 0\) := \(others => '0'\);/);
  assert.match(text, /registers_1 : process \(clk\)/);
  check(text, 'vhdl', 'clash');
  const comb = generateModule({ name: 'clash2', lang: 'vhdl', project, ports: [{ name: 'comb', dir: 'in', width: 1 }, { name: 'y', dir: 'out', width: 1 }], kind: 'comb', combStyle: 'process' });
  assert.match(comb, /comb_1 : process \(comb\)/);
  check(comb, 'vhdl', 'clash2');
});

test('port table checks: identifiers, reserved words, duplicates, widths, generics', () => {
  const P = (name, dir = 'in', width = 1) => ({ name, dir, width });
  assert.equal(checkPorts([P('a'), P('y', 'out', 8)], { lang: 'vhdl', name: 'm' }), null);
  assert.match(checkPorts([P('1a')], { lang: 'vhdl' }), /must start with a letter/);
  assert.match(checkPorts([P('a-b')], { lang: 'vhdl' }), /letters, digits and _/);
  assert.match(checkPorts([P('a__b')], { lang: 'vhdl' }), /double __/);
  assert.match(checkPorts([P('a_')], { lang: 'verilog' }), /_ at the end/);
  assert.match(checkPorts([P('signal')], { lang: 'vhdl' }), /reserved word of VHDL/);
  assert.match(checkPorts([P('SIGNAL')], { lang: 'vhdl' }), /reserved word of VHDL/);
  assert.equal(checkPorts([P('SIGNAL')], { lang: 'verilog' }), null);
  assert.match(checkPorts([P('reg')], { lang: 'verilog' }), /reserved word of Verilog/);
  assert.match(checkPorts([P('wire')], { lang: 'verilog' }), /reserved word of Verilog/);
  assert.equal(checkPorts([P('reg')], { lang: 'vhdl' }), null);
  assert.match(checkPorts([P('a'), P('A', 'out')], { lang: 'verilog' }), /Two ports are named 'A' \(letter case does not count: 'a'\)/);
  assert.match(checkPorts([P('m')], { lang: 'vhdl', name: 'm' }), /name of the module/);
  assert.match(checkPorts([P('a', 'in', 0)], { lang: 'vhdl' }), /width must be a whole number/);
  assert.match(checkPorts([P('a', 'in', 2.5)], { lang: 'vhdl' }), /width must be a whole number/);
  assert.match(checkPorts([P('a', 'inout')], { lang: 'vhdl' }), /input or output/);
  assert.match(checkPorts([], { lang: 'vhdl', name: 'entity' }), /Module name: 'entity' is a reserved word/);
  assert.match(checkPorts([P('a')], { lang: 'vhdl', generics: [{ name: 'a', default: '1' }] }), /generic 'a' has the name of a port/);
  assert.match(checkPorts([], { lang: 'vhdl', generics: [{ name: 'N', default: 'x' }] }), /whole number/);
  assert.equal(identError('ok_name1', 'vhdl'), null);
  assert.throws(() => generateModule({ name: 'm', lang: 'vhdl', ports: [P('a'), P('a')], kind: 'comb' }), /Two ports/);
  assert.throws(() => generateModule({ name: 'm', lang: 'vhdl', ports: [P('d', 'in', 4)], kind: 'seq', clock: 'd' }), /needs a clock/);
  assert.throws(() => generateModule({ name: 'm', lang: 'vhdl', ports: [P('c'), P('r')], kind: 'seq', clock: 'c', reset: { port: 'c', mode: 'sync' } }), /reset must be/);
  // the quick-add ports are valid in both languages and distinct
  for (const lang of ['vhdl', 'verilog']) assert.equal(checkPorts(QUICK_PORTS, { lang, name: 'top' }), null);
  assert.deepEqual(guessClockReset([P('clk'), P('rst_n'), P('d', 'in', 4)]), { clock: 'clk', reset: 'rst_n', active: '0' });
  assert.deepEqual(guessClockReset([P('clock'), P('reset')]), { clock: 'clock', reset: 'reset', active: '1' });
  assert.deepEqual(guessClockReset([P('d', 'in', 4)]), { clock: '', reset: '', active: '1' });
});

test('schematic generator: markers tidy (inputs left, outputs right, buses with width), netlist / generateHdl / simulation pass', () => {
  for (const lang of ['vhdl', 'verilog']) {
    for (const clock of [null, 'clk']) {
      const ports = [{ name: 'a', dir: 'in', width: 8 }, { name: 'sel', dir: 'in', width: 1 }, { name: 'sum', dir: 'out', width: 8 }, { name: 'led', dir: 'out', width: 1 }, { name: 'an', dir: 'out', width: 4 }];
      const doc = schematicFromPorts({ name: 'sch_top', lang, description: 'Adder on the board.', ports, clock });
      assert.equal(doc.lang, lang);
      assert.equal(doc.description, 'Adder on the board.');
      assert.deepEqual(doc.symbols, []);
      assert.deepEqual(doc.wires, []);
      const ins = doc.ports.filter((p) => p.dir === 'in'), outs = doc.ports.filter((p) => p.dir === 'out');
      assert.deepEqual(ins.map((p) => `${p.name}/${p.width}`), ['a/8', 'sel/1', ...(clock ? ['clk/1'] : [])]);
      assert.deepEqual(outs.map((p) => `${p.name}/${p.width}`), ['sum/8', 'led/1', 'an/4']);
      // inputs share one column on the left, outputs one on the right; nothing overlaps, all on the sheet
      assert.equal(new Set(ins.map((p) => p.x)).size, 1);
      assert.equal(new Set(outs.map((p) => p.x)).size, 1);
      assert.ok(ins[0].x < 300 && outs[0].x > doc.sheet.w - 300);
      for (const g of [ins, outs]) for (let i = 1; i < g.length; i++) assert.ok(g[i].y - g[i - 1].y >= 60);
      for (const p of doc.ports) {
        const b = portBox(p);
        assert.ok(b.x >= 10 && b.x + b.w <= doc.sheet.w - 10 && b.y >= 10 && b.y + b.h <= doc.sheet.h - 10, `${p.name} on the sheet`);
        assert.equal(p.x % 10, 0); assert.equal(p.y % 10, 0);
      }
      assert.deepEqual(normalizeDoc(doc), doc, 'already normalized');
      // only "not connected" warnings
      const nl = netlist(doc);
      assert.ok(nl.diagnostics.every((d) => d.severity === 'warning' && /not connected/.test(d.message)), JSON.stringify(nl.diagnostics));
      const g = generateHdl(doc);
      assert.ok(g.diagnostics.every((d) => d.severity === 'warning'), JSON.stringify(g.diagnostics));
      assert.match(g.code, lang === 'vhdl' ? /-- Adder on the board\./ : /\/\/ Adder on the board\./);
      const design = check(g.code, lang, 'sch_top');
      assert.deepEqual(design.top.ports.map((p) => `${p.name}:${p.dir}:${p.sig.t.w}`).sort(),
        [...ports.map((p) => `${p.name}:${p.dir}:${p.width}`), ...(clock ? ['clk:in:1'] : [])].sort());
    }
  }
  // many ports: the sheet grows; a bad table throws
  const many = Array.from({ length: 30 }, (_, i) => ({ name: `x${i}`, dir: 'in', width: 1 }));
  const big = schematicFromPorts({ name: 'big', lang: 'vhdl', ports: many, clock: 'clk' });
  assert.ok(big.sheet.h > 1100 && big.ports.every((p) => portBox(p).y + 20 <= big.sheet.h - 10));
  assert.throws(() => schematicFromPorts({ name: 'bad', lang: 'vhdl', ports: [{ name: 'clk', dir: 'in', width: 1 }], clock: 'clk' }), /Two ports/);
  assert.throws(() => schematicFromPorts({ name: 'bad', lang: 'verilog', ports: [{ name: 'input', dir: 'in', width: 1 }] }), /reserved word/);
});
