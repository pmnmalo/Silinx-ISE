// An arrayed instance (core/sch-array.js, #3755), as ISE's schematic makes one: a 1-bit register's instance named
// reg(3:0), its D and Q on 4-bit buses, its clock and enable shared, is a 4-bit register; its HDL the 4 copies, compiled,
// elaborated and simulated in VHDL and Verilog with no warnings; a 2-bit module arrayed over an 8-bit bus; the errors
// (a net neither as wide as the pin nor N times as wide, a shared output); the name rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateHdl, netlist, normalizeDoc, symbolPins } from '../core/schdoc.js';
import { arrayName, arrayOf, sliceArrayed, sliceOf } from '../core/sch-array.js';
import { renameError } from '../core/schname.js';
import { simulate } from '../core/compile.js';

const P = (name, dir = 'in', width = 1) => ({ name, dir, width });
const REG = { name: 'reg1', lang: 'vhdl', ports: [P('d'), P('ce'), P('c'), P('q', 'out')] };
const REG2 = { name: 'reg2', lang: 'vhdl', ports: [P('d', 'in', 2), P('c'), P('q', 'out', 2)] };
const OUT = { W: -1, E: 1 };

// a sheet: the instance `name` of `m`, each pin wired to an I/O marker n_<pin> of widths[pin] bits (1 by default)
function sheet(m, name, widths, lang = 'vhdl') {
  const s = { id: 'U', type: 'module', x: 300, y: 200, rot: 0, mirror: false, name, params: { module: m.name, generics: {}, ports: m.ports.map(q => ({ ...q })) } };
  const mods = { [m.name]: m };
  const wires = [], ports = [];
  for (const p of symbolPins(s, mods)) {
    const b = { x: p.x + 60 * OUT[p.side], y: p.y };
    wires.push({ id: `w_${p.name}`, points: [{ x: p.x, y: p.y }, b] });
    ports.push({ id: `m_${p.name}`, name: `n_${p.name}`, dir: p.dir === 'out' ? 'out' : 'in', width: widths[p.name] ?? 1, x: b.x, y: b.y });
  }
  return { doc: normalizeDoc({ version: 4, name: 'top', lang, symbols: [s], wires, ports, labels: [] }, { modules: mods }), mods };
}

test('#3755 arrayName: a range in either bracket, msb first or last; anything else not an array', () => {
  assert.deepEqual(arrayName('reg(3:0)'), { base: 'reg', msb: 3, lsb: 0, n: 4, indices: [3, 2, 1, 0] });
  assert.deepEqual(arrayName(' r[1:3] '), { base: 'r', msb: 1, lsb: 3, n: 3, indices: [1, 2, 3] });
  for (const x of ['reg', 'reg(3)', 'reg(3:0', '3r(1:0)', 'reg(a:0)', '', null, 'reg(5000:0)']) assert.equal(arrayName(x), null, String(x));
  assert.equal(arrayOf({ type: 'module', name: 'r(0:0)' }), null, 'one copy: not an array');
  assert.equal(arrayOf({ type: 'and2', name: 'r(1:0)' }), null, 'a module\'s instance only');
  assert.equal(sliceOf('d', 0, 2, 1, true), 'd(2)');
  assert.equal(sliceOf('d', 4, 1, 2, false), 'd[7:6]');
  assert.equal(sliceOf('d', 0, 0, 2, true), 'd(1 downto 0)');
});

test('#3755 sliceArrayed: a pin sliced on a net N times as wide, shared on one as wide; a lone arrayed output sliced', () => {
  const pin = (dir, w = 1) => ({ kind: 'pin', dir, width: w, arr: 4 });
  let e = pin('in');
  assert.deepEqual(sliceArrayed([e], [4]), []); assert.deepEqual([e.width, e.sliced], [4, true]);
  e = pin('in');
  assert.deepEqual(sliceArrayed([e], [1]), []); assert.deepEqual([e.width, e.sliced], [1, undefined]);
  const o = pin('out'), i = pin('in');
  assert.deepEqual(sliceArrayed([o, i], []), []); assert.deepEqual([o.width, i.width], [4, 4], 'Q of one array to D of another: a bus');
  const shared = pin('out');
  assert.deepEqual(sliceArrayed([shared], [1]), [shared], 'an output shared by the copies');
});

test('#3755 reg(3:0) of a 1-bit register on 4-bit buses: no warnings; the copies in the HDL; Rename takes the range', () => {
  const { doc, mods } = sheet(REG, 'reg(3:0)', { d: 4, q: 4 });
  const nl = netlist(doc, { modules: mods });
  assert.deepEqual(nl.diagnostics.map(d => d.message), []);
  assert.deepEqual(['d', 'ce', 'c', 'q'].map(n => nl.pinNet.get(`U/${n}`).width), [4, 1, 1, 4]);
  const v = generateHdl(doc, { lang: 'vhdl', modules: mods });
  assert.deepEqual(v.diagnostics, []);
  assert.match(v.code, /\n {2}reg_3 : entity work\.reg1\n {4}port map \(\n {6}d => n_d\(3\),\n {6}ce => n_ce,\n {6}c => n_c,\n {6}q => n_q\(3\)\n {4}\);\n/);
  assert.equal((v.code.match(/: entity work\.reg1/g) || []).length, 4);
  const g = generateHdl(doc, { lang: 'verilog', modules: mods });
  assert.deepEqual(g.diagnostics, []);
  assert.match(g.code, /\n {2}reg1 reg_0 \(\n {4}\.d\(n_d\[0\]\),\n {4}\.ce\(n_ce\),\n {4}\.c\(n_c\),\n {4}\.q\(n_q\[0\]\)\n {2}\);\n/);
  assert.equal(renameError(doc, 'sym', 'U', 'r(7:0)'), null);
  assert.match(renameError(doc, 'sym', 'U', 'r(7:0'), /is not a valid name/);
  assert.equal(renameError(doc, 'sym', 'U', 'reg(1:0)'), null, 'a reserved base: its copies reg_1, reg_0 are not');
  assert.match(renameError(doc, 'sym', 'U', 'reg'), /reserved word of Verilog/);
});

test('#3755 the errors: a bus neither N nor 1 times the pin\'s width; an output shared by the copies', () => {
  let { doc, mods } = sheet(REG, 'reg(3:0)', { d: 3, q: 4 });
  assert.deepEqual(netlist(doc, { modules: mods }).diagnostics.map(d => d.message), ["width mismatch on net 'n_d': 3 vs 1 bits"]);
  ({ doc, mods } = sheet(REG, 'reg(3:0)', { d: 4, q: 1 }));
  assert.deepEqual(netlist(doc, { modules: mods }).diagnostics.map(d => d.message), ["reg(3:0): output q of its 4 copies drives the 1-bit net 'n_q': connect it to a 4-bit bus"]);
  // (not an array: the width mismatch as before)
  ({ doc, mods } = sheet(REG, 'r', { d: 4, q: 1 }));
  assert.deepEqual(netlist(doc, { modules: mods }).diagnostics.map(d => d.message), ["width mismatch on net 'n_d': 4 vs 1 bits"]);
});

// the 1-bit and 2-bit registers, their HDL in either language
const HDL = {
  vhdl: {
    reg1: `library ieee; use ieee.std_logic_1164.all;
entity reg1 is port (d, ce, c : in std_logic; q : out std_logic); end reg1;
architecture rtl of reg1 is begin
  process (c) begin if rising_edge(c) then if ce = '1' then q <= d; end if; end if; end process;
end rtl;
`,
    reg2: `library ieee; use ieee.std_logic_1164.all;
entity reg2 is port (d : in std_logic_vector(1 downto 0); c : in std_logic; q : out std_logic_vector(1 downto 0)); end reg2;
architecture rtl of reg2 is begin
  process (c) begin if rising_edge(c) then q <= d; end if; end process;
end rtl;
`,
  },
  verilog: {
    reg1: 'module reg1 (input d, input ce, input c, output reg q);\n  always @(posedge c) if (ce) q <= d;\nendmodule\n',
    reg2: 'module reg2 (input [1:0] d, input c, output reg [1:0] q);\n  always @(posedge c) q <= d;\nendmodule\n',
  },
};
// a test bench of top: values on n_d (W bits), n_ce 1 but on the third step; n_q printed after each clock
function bench(lang, W, values, ce) {
  if (lang === 'vhdl') {
    return `library ieee; use ieee.std_logic_1164.all;
entity tb is end tb;
architecture t of tb is
  signal d : std_logic_vector(${W - 1} downto 0) := (others => '0'); signal q : std_logic_vector(${W - 1} downto 0); signal c, ce : std_logic := '0';
begin
  uut: entity work.top port map (n_d => d, n_c => c, ${ce ? 'n_ce => ce, ' : ''}n_q => q);
  process begin
${values.map((v, i) => `    d <= "${v}"; ce <= '${i === 2 ? 0 : 1}'; wait for 5 ns; c <= '1'; wait for 5 ns; c <= '0'; report "q=" & ${Array.from({ length: W }, (_, k) => `std_logic'image(q(${W - 1 - k}))`).join(' & ')};`).join('\n')}
    wait;
  end process;
end t;
`;
  }
  return `\`timescale 1ns/1ps
module tb;
  reg [${W - 1}:0] d = 0; reg c = 0, ce = 0; wire [${W - 1}:0] q;
  top uut (.n_d(d), .n_c(c), ${ce ? '.n_ce(ce), ' : ''}.n_q(q));
  initial begin
${values.map((v, i) => `    d = ${W}'b${v}; ce = ${i === 2 ? 0 : 1}; #5; c = 1; #5; c = 0; $display("q=%b", q);`).join('\n')}
  end
endmodule
`;
}
function run(lang, m, name, W, values, ce) {
  const { doc, mods } = sheet(m, name, { d: W, q: W }, lang);
  const g = generateHdl(doc, { lang, modules: mods });
  assert.deepEqual(g.diagnostics, [], `${lang}: no warnings`);
  const ext = lang === 'vhdl' ? 'vhd' : 'v';
  const r = simulate([{ path: `${m.name}.${ext}`, text: HDL[lang][m.name] }, { path: `top.${ext}`, text: g.code }, { path: `tb.${ext}`, text: bench(lang, W, values, ce) }], 'tb', { until: 1e6 });
  assert.deepEqual(r.errors.map(e => e.message), [], `${lang}: compiles and elaborates`);
  assert.deepEqual([...r.lib.errors, ...r.design.diags].map(e => e.message), [], `${lang}: no warnings`);
  return r.sim.log.map(l => l.text.replace(/'/g, '').replace(/^.*q=/, ''));
}

test('#3755 a 4-bit register from a 1-bit one, and an 8-bit one from a 2-bit one: simulated in VHDL and Verilog', () => {
  for (const lang of ['vhdl', 'verilog']) {
    assert.deepEqual(run(lang, REG, 'reg(3:0)', 4, ['1010', '0110', '1111', '0001'], true), ['1010', '0110', '0110', '0001'], `${lang}: reg(3:0)`);
    assert.deepEqual(run(lang, REG, 'reg(0:3)', 4, ['1010', '0011'], true), ['1010', '0011'], `${lang}: reg(0:3), the same bits`);
    assert.deepEqual(run(lang, REG2, 'r(3:0)', 8, ['10110100', '01001110'], false), ['10110100', '01001110'], `${lang}: r(3:0) of reg2`);
  }
});
