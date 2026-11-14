// ISE's schematic and an arrayed instance or a module's symbol of its own (#3828): a 1-bit register's instance reg(3:0)
// on 4-bit buses, drawn with the default symbol and with one of its own (Q on the left, D on the top, the clock at the
// bottom), exported as ISE's schematic writes it (core/isesch-export.js: the block named reg(3:0), its 1-bit pins on
// the buses; the .sym with the pins on their sides, the names of the top and bottom ones inside the body) and imported
// back (core/isesch-nets.js, core/isesch-symbol.js): the instance arrayed again, its pins on their sides; its HDL
// compiled, elaborated and simulated in VHDL and Verilog with no warnings; an ISE project's .sym as the module's
// <module>.sym.json (core/xise.js iseModuleSymbols); the export's warning for a module drawn with two symbols.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachSymbols, generateHdl, netlist, normalizeDoc, symbolPins } from '../core/schdoc.js';
import { exportIseSch, importIseSch, parseIseSym } from '../core/isesch.js';
import { iseSymbolLayout, iseSymbolRect, iseSymFileLayout } from '../core/isesch-symbol.js';
import { instanceParams, newSymbol, symbolText } from '../core/symbol-layout.js';
import { iseModuleSymbols } from '../core/xise.js';
import { simulate } from '../core/compile.js';

const P = (name, dir = 'in', width = 1) => ({ name, dir, width });
const PORTS = [P('d'), P('ce'), P('c'), P('q', 'out')];
const SYM = { version: 1, kind: 'symbol', module: 'reg1', pins: [{ name: 'q', side: 'W' }, { name: 'ce', side: 'W' }, { name: 'd', side: 'N' }, { name: 'c', side: 'S' }], spacing: 20, width: null, height: null, title: 'top' };
const HDL = {
  vhdl: ['reg1.vhd', 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity reg1 is\n  port (d, ce, c : in std_logic; q : out std_logic);\nend entity reg1;\n\narchitecture rtl of reg1 is\nbegin\n  process (c) begin\n    if rising_edge(c) then\n      if ce = \'1\' then q <= d; end if;\n    end if;\n  end process;\nend architecture rtl;\n'],
  verilog: ['reg1.v', 'module reg1 (input d, input ce, input c, output reg q);\n  always @(posedge c) if (ce) q <= d;\nendmodule\n'],
};
const mods = (lang, symbol) => ({ reg1: { name: 'reg1', lang, file: `src/${HDL[lang][0]}`, ports: PORTS, ...(symbol ? { symbol } : {}) } });
const OUT = { W: [-60, 0], E: [60, 0], N: [0, -60], S: [0, 60] };

// top: the instance `name` of reg1 (with the symbol SYM when `own`), each pin wired to a marker of its name (d, q: 4 bits)
function sheet(lang, name, own) {
  const m = mods(lang, own ? SYM : null);
  const s = { id: 'U', type: 'module', x: 300, y: 200, rot: 0, mirror: false, name, params: { module: 'reg1', generics: {}, ...instanceParams(m.reg1) } };
  const wires = [], ports = [];
  for (const p of symbolPins(s, m)) {
    const b = { x: p.x + OUT[p.side][0], y: p.y + OUT[p.side][1] };
    wires.push({ id: `w_${p.name}`, points: [{ x: p.x, y: p.y }, b] });
    ports.push({ id: `m_${p.name}`, name: p.name === 'c' ? 'clk' : p.name, dir: p.dir === 'out' ? 'out' : 'in', width: p.name === 'd' || p.name === 'q' ? 4 : 1, x: b.x, y: b.y });
  }
  return { doc: normalizeDoc({ version: 4, name: 'top', lang, symbols: [s], wires, ports, labels: [] }, { modules: m }), m };
}
const exported = (doc, m) => exportIseSch(doc, { modules: m, timestamp: '2026-11-14T00:00:00' });
const symsOf = r => Object.fromEntries(r.files.filter(f => f.kind === 'sym').map(f => [f.path, f.text]));

test('#3828 the export: reg(3:0) a block named with its range, its 1-bit pins on the buses; the .sym of a symbol of its own', () => {
  const { doc, m } = sheet('vhdl', 'reg(3:0)', true);
  const r = exported(doc, m);
  assert.deepEqual(r.warnings, ["'reg1': project module — ISE uses its HDL source and the reg1.sym symbol (or regenerate it with Create Schematic Symbol)"]);
  assert.match(r.xml, /<block symbolname="reg1" name="reg\(3:0\)">\n {12}<blockpin signalname="q\(3:0\)" name="q" \/>\n {12}<blockpin signalname="ce" name="ce" \/>\n {12}<blockpin signalname="d\(3:0\)" name="d" \/>\n {12}<blockpin signalname="clk" name="c" \/>\n/);
  assert.match(r.xml, /<instance x="\d+" y="\d+" name="reg\(3:0\)" orien="R0" \/>/);
  const sym = symsOf(r)['reg1.sym'];
  assert.deepEqual(parseIseSym(sym).pins, [{ name: 'q', dir: 'out', x: 0, y: -192 }, { name: 'ce', dir: 'in', x: 0, y: -128 }, { name: 'd', dir: 'in', x: 192, y: -320 }, { name: 'c', dir: 'in', x: 192, y: 0 }]);
  assert.deepEqual(iseSymbolRect(sym), { x: 64, y: -256, w: 256, h: 192 });
  // (the names of the top and the bottom pins inside the body, under and over their leads)
  assert.match(sym, /<text style="alignment:BCENTER;fontsize:24;fontname:Arial" x="192" y="-208">d<\/text>/);
  assert.match(sym, /<text style="alignment:BCENTER;fontsize:24;fontname:Arial" x="192" y="-72">c<\/text>/);
  assert.match(sym, /<text style="fontsize:24;fontname:Arial" x="72" y="-192">q<\/text>/);
});

for (const lang of ['vhdl', 'verilog']) {
  for (const own of [false, true]) {
    test(`#3828 ${lang}: reg(3:0)${own ? ' with a symbol of its own' : ''} exported to ISE and imported back: arrayed, its pins on their sides; simulated, no warnings`, () => {
      const { doc, m } = sheet(lang, 'reg(3:0)', own);
      const r = exported(doc, m);
      const im = importIseSch(r.xml, { modules: m, symbols: symsOf(r), name: 'top', lang });
      assert.deepEqual(im.warnings, []);
      const s = im.doc.symbols.find(x => x.type === 'module');
      assert.equal(s.name, 'reg(3:0)');
      assert.deepEqual(symbolPins(s, m).map(q => `${q.name}:${q.side}`), own ? ['q:W', 'ce:W', 'd:N', 'c:S'] : ['d:W', 'ce:W', 'c:W', 'q:E']);
      assert.deepEqual(s.params.layout ?? null, own ? { spacing: 20, width: null, height: null, title: 'top' } : null);
      // (the project's module with its symbol: the instance up to date)
      const nl = netlist(im.doc, { modules: m });
      assert.deepEqual(nl.diagnostics.map(d => d.message), []);
      const g = generateHdl(im.doc, { lang, modules: m });
      assert.deepEqual(g.diagnostics, []);
      assert.equal((g.code.match(lang === 'vhdl' ? /reg_\d : entity work\.reg1/g : /reg1 reg_\d \(/g) || []).length, 4);
      const ext = lang === 'vhdl' ? 'vhd' : 'v';
      const tb = lang === 'vhdl'
        ? 'library ieee; use ieee.std_logic_1164.all;\nentity tb is end tb;\narchitecture t of tb is\n  signal d, q : std_logic_vector(3 downto 0) := "0000"; signal c, ce : std_logic := \'0\';\nbegin\n  uut: entity work.top port map (d => d, ce => ce, clk => c, q => q);\n  process begin\n    d <= "1010"; ce <= \'1\'; wait for 5 ns; c <= \'1\'; wait for 5 ns; c <= \'0\';\n    report "q=" & std_logic\'image(q(3)) & std_logic\'image(q(2)) & std_logic\'image(q(1)) & std_logic\'image(q(0));\n    d <= "0110"; ce <= \'0\'; wait for 5 ns; c <= \'1\'; wait for 5 ns; c <= \'0\';\n    report "q=" & std_logic\'image(q(3)) & std_logic\'image(q(2)) & std_logic\'image(q(1)) & std_logic\'image(q(0));\n    wait;\n  end process;\nend t;\n'
        : '`timescale 1ns/1ps\nmodule tb;\n  reg [3:0] d = 0; reg c = 0, ce = 0; wire [3:0] q;\n  top uut (.d(d), .ce(ce), .clk(c), .q(q));\n  initial begin\n    d = 4\'b1010; ce = 1; #5; c = 1; #5; c = 0; $display("q=%b", q);\n    d = 4\'b0110; ce = 0; #5; c = 1; #5; c = 0; $display("q=%b", q);\n  end\nendmodule\n';
      const sim = simulate([{ path: HDL[lang][0], text: HDL[lang][1] }, { path: `top.${ext}`, text: g.code }, { path: `tb.${ext}`, text: tb }], 'tb', { until: 1e6 });
      assert.deepEqual(sim.errors.map(e => e.message), []);
      assert.deepEqual([...sim.lib.errors, ...sim.design.diags].map(e => e.message), [], 'no warnings');
      assert.deepEqual(sim.sim.log.map(l => l.text.replace(/'/g, '').replace(/^.*q=/, '')), ['1010', '1010']);
    });
  }
}

test('#3828 the import: an arrayed instance\'s copies\' names claimed (a signal of one\'s name: another base)', () => {
  const { doc, m } = sheet('vhdl', 'r(0:3)', false);
  const r = exported(doc, m);
  // (a signal of the copy's name already: the copies keep theirs, the base claimed otherwise)
  const im = importIseSch(r.xml.replace(/"ce"/g, '"r_2"').replace('<blockpin signalname="r_2" name="r_2" />', '<blockpin signalname="r_2" name="ce" />'), { modules: m, name: 'top' });
  const s = im.doc.symbols.find(x => x.type === 'module');
  assert.equal(s.name, 'r_1(0:3)');
  assert.deepEqual(netlist(im.doc, { modules: m }).diagnostics.map(d => d.message), []);
});

test('#3828 iseSymbolLayout: the sides from the body, the order along them, the spacing; the default symbol, or a pin missing, none', () => {
  const mod = { name: 'reg1', ports: PORTS };
  const rect = { x: 64, y: -256, w: 256, h: 192 };
  assert.deepEqual(iseSymbolLayout([{ name: 'D', x: 192, y: -320 }, { name: 'ce', x: 0, y: -128 }, { name: 'q', x: 0, y: -192 }, { name: 'c', x: 192, y: 0 }], rect, mod).pins,
    [{ name: 'q', side: 'W' }, { name: 'ce', side: 'W' }, { name: 'd', side: 'N' }, { name: 'c', side: 'S' }]);
  // the default one (Silinx's own export of it, or ISE's Create Schematic Symbol of the module): none
  const dflt = [{ name: 'd', x: 0, y: -192 }, { name: 'ce', x: 0, y: -128 }, { name: 'c', x: 0, y: -64 }, { name: 'q', x: 384, y: -192 }];
  assert.equal(iseSymbolLayout(dflt, { x: 64, y: -256, w: 256, h: 256 }, mod), null);
  // the spacing of the pins 30 apart (96 ISE units); without a rectangle, the pins' extremes
  const wide = [{ name: 'd', x: 0, y: -288 }, { name: 'ce', x: 0, y: -192 }, { name: 'c', x: 0, y: -96 }, { name: 'q', x: 384, y: -288 }];
  assert.deepEqual([iseSymbolLayout(wide, null, mod).spacing, iseSymbolLayout(wide, null, mod).pins.map(q => q.side).join('')], [30, 'WWWE']);
  assert.equal(iseSymbolLayout(dflt.slice(1), null, mod), null, 'a port with no pin');
  assert.equal(iseSymbolLayout([...dflt.slice(1), { name: 'x', x: 0, y: 0 }], null, mod), null, 'a pin not a port');
  assert.equal(iseSymbolRect('not xml <'), null);
});

test('#3828 iseModuleSymbols: an ISE project\'s .sym drawn otherwise than by default as its module\'s .sym.json; kept when there', () => {
  const { doc, m } = sheet('vhdl', 'reg(3:0)', true);
  const syms = symsOf(exported(doc, m));
  const sources = { 'src/reg1.vhd': HDL.vhdl[1] };
  const out = iseModuleSymbols(syms, sources);
  assert.deepEqual(out.map(f => [f.path, f.module]), [['src/reg1.sym.json', 'reg1']]);
  assert.equal(out[0].text, symbolText({ ...newSymbol(m.reg1), pins: SYM.pins }));
  // the module then with that symbol: the imported instance up to date
  const im = importIseSch(exported(doc, m).xml, { modules: mods('vhdl', null), symbols: syms, name: 'top' });
  const withSym = attachSymbols(mods('vhdl', null), { [out[0].path]: out[0].text });
  assert.deepEqual(netlist(im.doc, { modules: withSym }).diagnostics.map(d => d.message), []);
  assert.deepEqual(iseModuleSymbols(syms, sources, p => (p === 'src/reg1.sym.json' ? '{}' : undefined)), [], 'a file the import carries kept');
  // the default symbol's .sym: none; a .sym of no module: none
  const d0 = symsOf(exported(sheet('vhdl', 'r', false).doc, mods('vhdl', null)));
  assert.deepEqual(iseModuleSymbols(d0, sources), []);
  assert.deepEqual(iseModuleSymbols({ 'x.sym': syms['reg1.sym'].replace('name="reg1"', 'name="x"') }, sources), []);
  assert.equal(iseSymFileLayout(syms['reg1.sym'], parseIseSym(syms['reg1.sym']), m.reg1).pins.length, 4);
});

test('#3828 the export: a module\'s instances drawn with two symbols said (ISE draws them with the first one\'s)', () => {
  const { doc, m } = sheet('vhdl', 'U1', true);
  const old = { ...doc.symbols[0], id: 'V', name: 'U2', x: 700, params: { module: 'reg1', generics: {}, ports: PORTS.map(q => ({ ...q })) } };
  doc.symbols.push(old);
  const r = exported(doc, m);
  assert.ok(r.warnings.includes("U2: its symbol of 'reg1' is not that of U1 (out of date): ISE draws both with U1's (Update Symbol first)"), r.warnings.join('\n'));
});
