// A module's symbol of its own (core/symbol-layout.js, #3755): its file read and checked, its pins in step with the
// module's ports, its layout (the pins' order and sides, the spacing, the size, the name's place), an instance placed
// with it, out of date when it changes, and Update Symbol keeping every connection and the HDL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attachSymbols, generateHdl, instanceParams, newSymbol, netlist, normalizeDoc, normalizeSymbol, readSymbol, reconcile, symbolDef, symbolDiff,
  symbolFileOf, symbolPins, symbolText, updateModuleSymbols
} from '../core/schdoc.js';
import { layoutChanged, layoutDef, layoutOf, renameSymbolFile } from '../core/symbol-layout.js';
import { simulate } from '../core/compile.js';

const P = (name, dir = 'in', width = 1) => ({ name, dir, width });
const REG = { name: 'reg1', lang: 'vhdl', ports: [P('D'), P('CE'), P('C'), P('CLR'), P('Q', 'out')] };
const mods = (symbol = null) => ({ reg1: { ...REG, ...(symbol ? { symbol } : {}) } });
const inst = (params, x = 200, y = 100) => ({ id: 'U', type: 'module', x, y, rot: 0, mirror: false, name: 'U1', params: { module: 'reg1', generics: {}, ...params } });

test('#3755 the default layout draws the symbol as before (boxDef), for any number of pins and names', () => {
  const sets = [REG.ports, [P('a')], [P('y', 'out')], [], [P('a_long_name'), P('b', 'inout'), P('q', 'out', 8), P('carry_out', 'out')]];
  for (const ports of sets) {
    const m = { name: 'reg1', ports };
    const plain = symbolDef(inst({ ports }), { reg1: m });
    const laid = symbolDef(inst(instanceParams({ ...m, symbol: newSymbol(m) })), { reg1: { ...m, symbol: newSymbol(m) } });
    assert.deepEqual({ w: laid.w, h: laid.h, body: laid.body, pins: laid.pins.map(p => [p.name, p.x, p.y, p.side]) },
      { w: plain.w, h: plain.h, body: plain.body, pins: plain.pins.map(p => [p.name, p.x, p.y, p.side]) }, ports.map(p => p.name).join());
  }
});

test('#3755 pins on the four sides: on the grid, on the body\'s edges, in their order, never two at one place', () => {
  const sym = { ...newSymbol(REG), pins: [{ name: 'Q', side: 'E' }, { name: 'D', side: 'W' }, { name: 'C', side: 'S' }, { name: 'CE', side: 'N' }, { name: 'CLR', side: 'S' }] };
  for (const spacing of [20, 30, 40, 100]) {
    const def = layoutDef(instanceParams({ ...REG, symbol: { ...sym, spacing } }).ports, { ...layoutOf(sym), spacing }, 'reg1');
    const at = Object.fromEntries(def.pins.map(p => [p.name, p]));
    for (const p of def.pins) {
      assert.equal(p.x % 10, 0, `${p.name}.x on the grid`); assert.equal(p.y % 10, 0, `${p.name}.y on the grid`);
      if (p.side === 'W') assert.equal(p.x, 0);
      if (p.side === 'E') assert.equal(p.x, def.w);
      if (p.side === 'N') { assert.equal(p.y, 0); assert.ok(p.x > def.body.x && p.x < def.body.x + def.body.w); }
      if (p.side === 'S') { assert.equal(p.y, def.h); assert.ok(p.x > def.body.x && p.x < def.body.x + def.body.w); }
    }
    assert.equal(new Set(def.pins.map(p => `${p.x},${p.y}`)).size, def.pins.length);
    assert.equal(at.C.x + spacing, at.CLR.x, 'the bottom pins in their order, `spacing` apart');
    assert.equal(def.body.y, 20, 'a lead above the body for the top pins');
    assert.equal(def.h, def.body.y + def.body.h + 20, 'and below it for the bottom pins');
  }
});

test('#3755 the spacing, the width and the height, the module name\'s place', () => {
  const base = newSymbol(REG);
  const d20 = layoutDef(instanceParams({ ...REG, symbol: base }).ports, layoutOf(base), 'reg1');
  const d40 = layoutDef(instanceParams({ ...REG, symbol: base }).ports, { ...layoutOf(base), spacing: 40 }, 'reg1');
  const ys = d => d.pins.filter(p => p.side === 'W').map(p => p.y);
  assert.deepEqual(ys(d20), [20, 40, 60, 80]);
  assert.deepEqual(ys(d40), [40, 80, 120, 160]);
  // a size larger than needed taken (on the grid); smaller: the pins' room
  const big = layoutDef(instanceParams({ ...REG, symbol: base }).ports, { ...layoutOf(base), width: 200, height: 155 }, 'reg1');
  assert.deepEqual([big.body.w, big.body.h], [200, 160]);
  const small = layoutDef(instanceParams({ ...REG, symbol: base }).ports, { ...layoutOf(base), width: 40, height: 40 }, 'reg1');
  assert.equal(small.body.h, d20.body.h, 'never smaller than its pins');
  assert.equal(small.body.w, 40);
  const t = where => layoutDef(instanceParams({ ...REG, symbol: base }).ports, { ...layoutOf(base), title: where }, 'reg1');
  assert.ok(t('top').titleY < t('center').titleY && t('center').titleY < t('bottom').titleY);
  assert.equal(t('center').pins.find(p => p.name === 'D').y, 20, 'the name not on top: the first pin one spacing down');
});

test('#3755 a symbol file read and checked: its errors said, the symbol as it can be read', () => {
  const good = newSymbol(REG);
  assert.deepEqual(readSymbol(symbolText(good)), { symbol: good, errors: [] });
  assert.match(readSymbol('{').errors[0], /^not JSON/);
  assert.deepEqual(normalizeSymbol([]).errors, ['not a symbol (a JSON object)']);
  const r = normalizeSymbol({ module: 'reg1', pins: [{ name: 'D', side: 'X' }, { name: 'D', side: 'W' }, { side: 'E' }, null], spacing: 25, width: 10, title: 'left' });
  assert.deepEqual(r.errors, ["pin D: side 'X' is not one of W, E, N, S", 'pin D twice', 'a pin without a name', 'a pin without a name',
    'spacing 25: a multiple of 10 from 20 to 100', 'width 10: from 40 to 2000', "title 'left' is not one of top, center, bottom"]);
  assert.deepEqual(r.symbol.pins, [{ name: 'D' }]);
  assert.equal(r.symbol.spacing, 30); assert.equal(r.symbol.width, 40); assert.equal(r.symbol.title, 'top');
  assert.deepEqual(normalizeSymbol({ pins: [] }).errors, ['no module']);
});

test('#3755 the symbol in step with the module: new ports on their default side, the ones gone dropped', () => {
  const sym = { ...newSymbol(REG), pins: [{ name: 'Q', side: 'N' }, { name: 'old', side: 'W' }, { name: 'd', side: 'S' }] };
  const r = reconcile(sym, REG.ports);
  assert.deepEqual(r.pins, [{ name: 'Q', side: 'N' }, { name: 'D', side: 'S' }, { name: 'CE', side: 'W' }, { name: 'C', side: 'W' }, { name: 'CLR', side: 'W' }]);
  assert.deepEqual(r.added, ['CE', 'C', 'CLR']); assert.deepEqual(r.removed, ['old']);
});

test('#3755 the project\'s modules get their symbols from the symbol files; the path beside the module\'s source', () => {
  assert.equal(symbolFileOf('src/reg1.vhd', 'reg1'), 'src/reg1.sym.json');
  assert.equal(symbolFileOf('reg1.v', 'reg1'), 'reg1.sym.json');
  const m = { reg1: { ...REG }, other: { name: 'other', ports: [] } };
  const sym = { ...newSymbol(REG), module: 'REG1', pins: [{ name: 'Q', side: 'W' }] };
  attachSymbols(m, { 'src/reg1.sym.json': symbolText(sym), 'src/x.sym.json': '{', 'src/top.vhd': 'entity', 'src/nobody.sym.json': symbolText({ ...sym, module: 'nobody' }) });
  assert.equal(m.reg1.symbolFile, 'src/reg1.sym.json');
  assert.equal(m.reg1.symbol.module, 'reg1');
  assert.deepEqual(m.reg1.symbol.pins.map(q => q.name), ['Q', 'D', 'CE', 'C', 'CLR']);
  assert.equal(m.other.symbol, undefined);
});

// a sheet: the instance, a wire from each pin outward to an I/O marker
const OUT = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] };
function sheet(params, modules) {
  const s = inst(params);
  const wires = [], markers = [];
  for (const p of symbolPins(s, modules)) {
    const [dx, dy] = OUT[p.side], b = { x: p.x + 60 * dx, y: p.y + 60 * dy };
    wires.push({ id: `w_${p.name}`, points: [{ x: p.x, y: p.y }, b] });
    markers.push({ id: `m_${p.name}`, name: `n_${p.name}`, dir: p.dir === 'out' ? 'out' : 'in', width: 1, x: b.x, y: b.y, side: p.side });
  }
  return normalizeDoc({ version: 4, name: 'top', lang: 'vhdl', symbols: [s], wires, ports: markers, labels: [] }, { modules });
}
const pinNets = (doc, modules) => { const nl = netlist(doc, { modules }); return REG.ports.map(q => nl.nets.find(n => n.id === nl.pinNet.get(`U/${q.name}`))?.ports.join()); };

test('#3755 an instance placed with its module\'s symbol; out of date when the symbol changes; Update Symbol keeps its connections and its HDL', () => {
  const first = { ...newSymbol(REG), pins: [{ name: 'D', side: 'W' }, { name: 'CE', side: 'W' }, { name: 'Q', side: 'E' }, { name: 'C', side: 'S' }, { name: 'CLR', side: 'N' }] };
  const m1 = mods(first);
  const params = instanceParams(m1.reg1);
  assert.deepEqual(params.ports.map(q => `${q.name}:${q.side}`), ['D:W', 'CE:W', 'Q:E', 'C:S', 'CLR:N']);
  assert.deepEqual(params.layout, { spacing: 20, width: null, height: null, title: 'top' });
  const doc = sheet(params, m1);
  assert.equal(symbolDiff(doc.symbols[0], m1), null, 'up to date');
  const nets = pinNets(doc, m1), hdl = generateHdl(doc, { lang: 'vhdl', modules: m1 }).code;
  assert.deepEqual(netlist(doc, { modules: m1 }).diagnostics, [], 'no warnings');
  assert.deepEqual(generateHdl(doc, { lang: 'verilog', modules: m1 }).diagnostics, [], 'no warnings (Verilog)');
  // the symbol edited: the pins reordered, moved to other sides, the spacing and the size changed
  const second = { ...first, spacing: 40, width: 160, pins: [{ name: 'Q', side: 'W' }, { name: 'CLR', side: 'S' }, { name: 'C', side: 'N' }, { name: 'D', side: 'E' }, { name: 'CE', side: 'E' }] };
  const m2 = mods(second);
  assert.deepEqual(symbolDiff(doc.symbols[0], m2), { added: [], removed: [], turned: [], relaid: true });
  assert.deepEqual(netlist(doc, { modules: m2 }).diagnostics.map(d => d.message),
    ["U1: the symbol of module 'reg1' is out of date (its symbol changed): Update Symbol"]);
  assert.deepEqual(pinNets(doc, m2), nets, 'drawn as placed until Update Symbol');
  const r = updateModuleSymbols(doc, m2);
  assert.deepEqual(r, { updated: ['U1'], removed: [], turned: [] });
  assert.equal(symbolDiff(doc.symbols[0], m2), null);
  assert.deepEqual(doc.symbols[0].params.ports.map(q => `${q.name}:${q.side}`), ['Q:W', 'CLR:S', 'C:N', 'D:E', 'CE:E']);
  assert.deepEqual(pinNets(doc, m2), nets, 'every pin on the same net');
  assert.equal(generateHdl(doc, { lang: 'vhdl', modules: m2 }).code, hdl, 'the same HDL');
  // the symbol file removed: back to the default symbol
  const plain = mods();
  assert.ok(symbolDiff(doc.symbols[0], plain).relaid);
  updateModuleSymbols(doc, plain);
  assert.equal(doc.symbols[0].params.layout, undefined);
  assert.equal(symbolDiff(doc.symbols[0], plain), null);
  assert.deepEqual(pinNets(doc, plain), nets);
});

test('#3755 layoutChanged: no symbol and no layout up to date; a layout without a symbol, a symbol without a layout out of date', () => {
  assert.equal(layoutChanged({ ports: REG.ports }, REG), false);
  assert.equal(layoutChanged({ ports: REG.ports, layout: layoutOf(newSymbol(REG)) }, REG), true);
  assert.equal(layoutChanged({ ports: REG.ports }, mods(newSymbol(REG)).reg1), true);
  assert.equal(layoutChanged(instanceParams(mods(newSymbol(REG)).reg1), mods(newSymbol(REG)).reg1), false);
});

// the 1-bit register, its HDL in either language: D latched on C's rising edge when CE, CLR clearing it at once
const REG_HDL = {
  vhdl: `library ieee; use ieee.std_logic_1164.all;
entity reg1 is port (D, CE, C, CLR : in std_logic; Q : out std_logic); end reg1;
architecture rtl of reg1 is begin
  process (C, CLR) begin if CLR = '1' then Q <= '0'; elsif rising_edge(C) then if CE = '1' then Q <= D; end if; end if; end process;
end rtl;
`,
  verilog: `module reg1 (input D, input CE, input C, input CLR, output reg Q);
  always @(posedge C or posedge CLR) if (CLR) Q <= 1'b0; else if (CE) Q <= D;
endmodule
`,
};
// a test bench of the sheet top (n_D, n_CE, n_C, n_CLR in, n_Q out): Q printed after each step
const STEPS = [[1, 1, 0], [0, 1, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1], [0, 1, 0]];   // D, CE, CLR
const TB = {
  vhdl: `library ieee; use ieee.std_logic_1164.all;
entity tb is end tb;
architecture t of tb is
  signal d, ce, c, clr : std_logic := '0'; signal q : std_logic;
begin
  uut: entity work.top port map (n_D => d, n_CE => ce, n_C => c, n_CLR => clr, n_Q => q);
  process begin
${STEPS.map(([d, ce, clr]) => `    d <= '${d}'; ce <= '${ce}'; clr <= '${clr}'; wait for 5 ns; c <= '1'; wait for 5 ns; c <= '0'; report "q=" & std_logic'image(q);`).join('\n')}
    wait;
  end process;
end t;
`,
  verilog: `\`timescale 1ns/1ps
module tb;
  reg d = 0, ce = 0, c = 0, clr = 0; wire q;
  top uut (.n_D(d), .n_CE(ce), .n_C(c), .n_CLR(clr), .n_Q(q));
  initial begin
${STEPS.map(([d, ce, clr]) => `    d = ${d}; ce = ${ce}; clr = ${clr}; #5; c = 1; #5; c = 0; $display("q=%b", q);`).join('\n')}
  end
endmodule
`,
};

test('#3755 a schematic of an instance with a symbol of its own: its HDL compiled, elaborated and simulated in VHDL and Verilog, no warnings', () => {
  const sym = { ...newSymbol(REG), spacing: 30, pins: [{ name: 'Q', side: 'W' }, { name: 'C', side: 'S' }, { name: 'CLR', side: 'N' }, { name: 'D', side: 'E' }, { name: 'CE', side: 'E' }] };
  const m = mods(sym);
  for (const lang of ['vhdl', 'verilog']) {
    const doc = sheet(instanceParams(m.reg1), m);
    doc.lang = lang;
    const g = generateHdl(doc, { lang, modules: m });
    assert.deepEqual(g.diagnostics, [], `${lang}: no warnings`);
    const ext = lang === 'vhdl' ? 'vhd' : 'v';
    const r = simulate([{ path: `reg1.${ext}`, text: REG_HDL[lang] }, { path: `top.${ext}`, text: g.code }, { path: `tb.${ext}`, text: TB[lang] }], 'tb', { until: 1e6 });
    assert.deepEqual(r.errors.map(e => e.message), [], `${lang}: compiles and elaborates`);
    assert.deepEqual([...r.lib.errors, ...r.design.diags].map(e => e.message), [], `${lang}: no warnings`);
    assert.deepEqual(r.sim.log.map(l => l.text.replace(/'/g, '').replace(/^.*q=/, '')), ['1', '0', '0', '1', '0', '0'], lang);
  }
});

test('#3829 renameSymbolFile: the module\'s symbol file found as attachSymbols finds it, its module renamed, a file named after it following it', () => {
  const sym = (module, extra = {}) => symbolText({ ...newSymbol({ name: module, ports: [{ name: 'd', dir: 'in' }, { name: 'q', dir: 'out' }] }), ...extra });
  const files = { 'src/reg1.sym.json': sym('reg1', { spacing: 30 }), 'src/other.sym.json': sym('other'), 'src/top.vhd': 'x' };
  const r = renameSymbolFile(files, 'src/bit_reg.vhd', 'REG1', 'bit_reg');
  assert.deepEqual([r.from, r.to], ['src/reg1.sym.json', 'src/bit_reg.sym.json']);
  assert.deepEqual(JSON.parse(r.text), { ...JSON.parse(files['src/reg1.sym.json']), module: 'bit_reg' });
  // beside its source: the source moved to another folder, the symbol with it
  assert.equal(renameSymbolFile(files, 'lib/bit_reg.vhd', 'reg1', 'bit_reg').to, 'lib/bit_reg.sym.json');
  // a symbol file not named after the module (its module field says whose): kept where it is, its module renamed
  const odd = { 'src/shape.sym.json': sym('reg1') };
  assert.deepEqual([renameSymbolFile(odd, 'src/r.vhd', 'reg1', 'r').to, JSON.parse(renameSymbolFile(odd, 'src/r.vhd', 'reg1', 'r').text).module], ['src/shape.sym.json', 'r']);
  // a file with no module field: its name says whose
  const bare = { 'src/reg1.sym.json': '{"pins":[]}\n' };
  assert.equal(renameSymbolFile(bare, 'src/r.vhd', 'reg1', 'r').to, 'src/r.sym.json');
  // none: no symbol file of the module, or one that is not JSON
  assert.equal(renameSymbolFile(files, 'src/x.vhd', 'nobody', 'x'), null);
  assert.equal(renameSymbolFile({ 'src/reg1.sym.json': 'not json' }, 'src/r.vhd', 'reg1', 'r'), null);
  assert.equal(renameSymbolFile(null, 'src/r.vhd', 'reg1', 'r'), null);
});
