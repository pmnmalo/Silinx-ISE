// Tri-state buffers (schematic symbol 'tbuf', Xilinx BUFE / BUFT / BUFE4/8/16 / BUFT4/8/16):
//   netlist(): several tri-state outputs (and inout markers / pins) may drive one net, an ordinary output
//     (or an input marker) together with a tri-state output is still an error;
//   generateHdl(): `O <= I when E = '1' else (others => 'Z')` / `assign O = E ? I : {N{1'bz}}`; a bus of two
//     buffers and an inout marker compiles and simulates in VHDL and Verilog (A drives, B drives, both
//     released -> Z, both enabled -> X);
//   Symbol Info: presets, Xilinx names, datasheet texts, the truth table with Z computed by simulation;
//   live schematic simulation (core/schlive.js): wire values Z / X, the inout marker driven from outside;
//   HDL -> schematic: tri-state assignments become tri-state buffers;
//   ISE .sch import / export: BUFE / BUFT / BUFE4 / BUFE8 / BUFT8 / BUFE16 map to the symbol and back;
//   design checks (core/lint.js): no multiple-driver warning for the generated tri-state bus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SYMBOLS, SYMBOL_CATEGORIES, netlist, generateHdl, normalizeDoc, symbolPins, symbolDef, schematicFromHdl } from '../core/schdoc.js';
import { compile, elaborate, simulate } from '../core/compile.js';
import { buildLiveSim, level } from '../core/schlive.js';
import { designChecks } from '../core/lint.js';
import { symbolDoc, presetOf, xilinxEquivalents, XILINX_SYMBOLS, docKeys, symbolHdl } from '../core/symdocs.js';
import { truthTable } from '../core/symtables.js';
import { importIseSch, exportIseSch, decodeXlSymbol } from '../core/isesch.js';
import * as V from '../core/values.js';

const LANGS = ['vhdl', 'verilog'];
const ext = lang => (lang === 'vhdl' ? 'vhd' : 'v');

// ------------------------------------------------------------------ sheet builders
const pinsOf = (doc, s) => Object.fromEntries(symbolPins(normalizeDoc({ ...doc, symbols: [s] }).symbols[0]).map(p => [p.name, p]));
const off = (p, dx) => ({ x: p.x + dx, y: p.y });

/**
 * A W-bit bus driven by a BUFE (ua: a, enable ea) and a BUFT (ub: b, three-state control tn), to the
 * inout marker 'data' (and read back by a buffer to the output marker 'q' when `reader`).
 */
function busSheet(lang, { W = 4, reader = false, inout = true } = {}) {
  const doc = { name: 'tribus', lang, symbols: [
    { id: 'S1', type: 'tbuf', x: 300, y: 100, rot: 0, mirror: false, name: 'ua', params: { width: W, enable: 'E' } },
    { id: 'S2', type: 'tbuf', x: 300, y: 300, rot: 0, mirror: false, name: 'ub', params: { width: W, enable: 'T' } },
  ], wires: [], labels: [], ports: [] };
  const A = pinsOf(doc, doc.symbols[0]), B = pinsOf(doc, doc.symbols[1]);
  let k = 0;
  const port = (name, dir, width, pt) => doc.ports.push({ id: `P${++k}`, name, dir, width, x: pt.x, y: pt.y });
  const wire = (...pts) => doc.wires.push({ id: `W${++k}`, points: pts });
  for (const [nm, pin, w] of [['a', A.I, W], ['ea', A.E, 1], ['b', B.I, W], ['tn', B.T, 1]]) { port(nm, 'in', w, off(pin, -40)); wire(off(pin, -40), pin); }
  // the bus: A.O -> (500, A.O.y) -> (500, B.O.y) -> B.O, a branch to the marker at x = 600
  wire(A.O, { x: 500, y: A.O.y }, { x: 500, y: B.O.y }, B.O);
  wire({ x: 500, y: A.O.y }, { x: 600, y: A.O.y });
  if (inout) port('data', 'inout', W, { x: 600, y: A.O.y });
  else port('data', 'out', W, { x: 600, y: A.O.y });
  if (reader) {
    const r = { id: 'S3', type: 'buf', x: 650, y: 400, rot: 0, mirror: false, name: 'ur', params: { width: W } };
    doc.symbols.push(r);
    const R = pinsOf(doc, r);
    wire({ x: 500, y: B.O.y }, { x: 500, y: R.I.y }, R.I);
    port('q', 'out', W, off(R.O, 40)); wire(R.O, off(R.O, 40));
  }
  return normalizeDoc(doc);
}
const errorsOf = d => d.diagnostics.filter(x => x.severity === 'error').map(x => x.message);

// ------------------------------------------------------------------ library
test('tri-state buffer symbol: parameters, presets with the Xilinx names, pins and geometry', () => {
  const S = SYMBOLS.tbuf;
  assert.equal(S.category, 'Tri-State');
  assert.ok(SYMBOL_CATEGORIES.includes('Tri-State'));
  assert.deepEqual(S.params.map(p => p.name), ['width', 'enable', 'bits']);
  assert.deepEqual(S.presets.map(p => p.title), ['BUFE', 'BUFE4', 'BUFE8', 'BUFE16', 'BUFT', 'BUFT4', 'BUFT8', 'BUFT16']);
  const pins = params => symbolDef({ type: 'tbuf', params }).pins.map(p => `${p.name}:${p.dir}:${p.width}${p.tri ? ':tri' : ''}`);
  assert.deepEqual(pins({ width: 1, enable: 'E' }), ['E:in:1', 'I:in:1', 'O:out:1:tri']);
  assert.deepEqual(pins({ width: 8, enable: 'T' }), ['T:in:1', 'I:in:8', 'O:out:8:tri']);
  assert.deepEqual(pins({ width: 4, enable: 'E', bits: true }), ['E:in:1', 'I0:in:1', 'I1:in:1', 'I2:in:1', 'I3:in:1', 'O0:out:1:tri', 'O1:out:1:tri', 'O2:out:1:tri', 'O3:out:1:tri']);
  // enable on the left one row above the data, as the Xilinx symbols; on the 10 px grid
  const d = symbolDef({ type: 'tbuf', params: { width: 4, enable: 'T', bits: true } });
  assert.equal(d.shape, 'tbuf'); assert.equal(d.activeLow, true); assert.equal(d.rows, 4);
  assert.deepEqual([d.w, d.h], [60, 100]);
  for (const p of d.pins) assert.ok(p.x % 10 === 0 && p.y % 10 === 0, `${p.name} on the grid`);
  assert.deepEqual(d.pins.filter(p => p.side === 'W').map(p => p.y), [10, 30, 50, 70, 90]);
  // presets: width only names the preset when the preset sets it
  for (const pr of S.presets) assert.equal(presetOf('tbuf', pr.params), pr.title);
  assert.equal(presetOf('tbuf', { width: 8, enable: 'T' }), 'BUFT8');
  assert.equal(presetOf('tbuf', { width: 2, enable: 'E' }), null);
  assert.equal(presetOf('tbuf', { width: 4, enable: 'E' }), null, 'a 4-bit bus is not BUFE4 (one pin per bit)');
  // older presets keep treating width as cosmetic
  assert.equal(presetOf('demux', { sel: 2, width: 8 }), 'DEMUX1_4');
  for (const n of ['BUFE', 'BUFT', 'BUFE4', 'BUFT4', 'BUFE8', 'BUFT8', 'BUFE16', 'BUFT16']) {
    assert.equal(XILINX_SYMBOLS[n]?.type, 'tbuf', n);
    assert.ok(xilinxEquivalents('tbuf', XILINX_SYMBOLS[n].params).includes(n), n);
  }
});

// ------------------------------------------------------------------ netlist
test('netlist: several tri-state outputs and an inout marker may share a net; an ordinary output with a tri-state output may not', () => {
  for (const lang of LANGS) {
    const doc = busSheet(lang, { reader: true });
    const nl = netlist(doc);
    assert.deepEqual(errorsOf(nl), []);
    assert.deepEqual(nl.diagnostics.map(d => d.message), [], 'no warnings either');
    const net = nl.portNet.get(doc.ports.find(p => p.name === 'data').id);
    assert.equal(net.tristate, true);
    assert.equal(net.width, 4);
    assert.deepEqual(net.drivers.map(e => `${e.sym}/${e.pin}`).sort(), ['S1/O', 'S2/O']);
    // the same bus with an output marker instead of the inout marker
    assert.deepEqual(errorsOf(netlist(busSheet(lang, { inout: false }))), []);
  }
  // an ordinary output (a BUF) on the bus as well: error naming both kinds of driver
  const bad = busSheet('vhdl');
  const A = pinsOf(bad, bad.symbols[0]);
  const g = { id: 'S9', type: 'buf', x: 600, y: 500, rot: 0, mirror: false, name: 'ug', params: { width: 4 } };
  bad.symbols.push(g);
  const G = pinsOf(bad, g);
  bad.wires.push({ id: 'W90', points: [G.O, { x: G.O.x + 30, y: G.O.y }] }, { id: 'W91', points: [G.I, { x: G.I.x - 30, y: G.I.y }] });
  bad.labels.push({ id: 'L90', x: G.O.x + 30, y: G.O.y, net: 'data' }, { id: 'L91', x: G.I.x - 30, y: G.I.y, net: 'a' });
  let errs = errorsOf(netlist(normalizeDoc(bad)));
  assert.equal(errs.length, 1, errs.join('\n'));
  assert.match(errs[0], /^net 'data' is driven by ug\.O and by the tri-state outputs ua\.O, ub\.O: only tri-state outputs and bidirectional pins may share a net$/);
  assert.ok(errorsOf(generateHdl(normalizeDoc(bad))).length >= 1, 'generateHdl reports it too');
  // an input marker on a tri-state net
  const inp = busSheet('verilog');
  inp.ports.find(p => p.name === 'data').dir = 'in';
  errs = errorsOf(netlist(normalizeDoc(inp)));
  assert.equal(errs.length, 1);
  assert.match(errs[0], /net 'data' is driven by port data and by the tri-state outputs ua\.O, ub\.O/);
  // two ordinary outputs: the existing diagnostic, unchanged
  const two = normalizeDoc(bad);
  two.symbols = two.symbols.filter(s => s.type !== 'tbuf');
  two.symbols.push({ id: 'S8', type: 'buf', x: A.O.x - 60, y: A.O.y - 10, rot: 0, mirror: false, name: 'uh', params: { width: 4 } });
  errs = errorsOf(netlist(normalizeDoc(two)));
  assert.ok(errs.some(e => /^net 'data' has 2 drivers \(ug\.O, uh\.O\)$/.test(e)), errs.join('\n'));
});

// ------------------------------------------------------------------ HDL
const TB = {
  vhdl: `library ieee; use ieee.std_logic_1164.all;
entity tb is end tb;
architecture t of tb is
  signal a : std_logic_vector(3 downto 0) := "0101";
  signal b : std_logic_vector(3 downto 0) := "1010";
  signal ea : std_logic := '0';
  signal tn : std_logic := '1';
  signal data : std_logic_vector(3 downto 0) := (others => 'Z');
begin
  uut : entity work.tribus port map (a => a, ea => ea, b => b, tn => tn, data => data);
  process begin
    wait for 10 ns; report "released " & to_string(data);
    ea <= '1'; wait for 10 ns; report "A " & to_string(data);
    ea <= '0'; tn <= '0'; wait for 10 ns; report "B " & to_string(data);
    ea <= '1'; wait for 10 ns; report "both " & to_string(data);
    ea <= '0'; tn <= '1'; data <= "0011"; wait for 10 ns; report "outside " & to_string(data);
    ea <= '1'; wait for 10 ns; report "outside+A " & to_string(data);
    wait;
  end process;
end t;`,
  verilog: `\`timescale 1ns/1ps
module tb;
  reg [3:0] a = 4'b0101, b = 4'b1010;
  reg ea = 0, tn = 1;
  reg [3:0] drv = 4'bzzzz;
  wire [3:0] data;
  assign data = drv;
  tribus uut (.a(a), .ea(ea), .b(b), .tn(tn), .data(data));
  initial begin
    #10 $display("released %b", data);
    ea = 1; #10 $display("A %b", data);
    ea = 0; tn = 0; #10 $display("B %b", data);
    ea = 1; #10 $display("both %b", data);
    ea = 0; tn = 1; drv = 4'b0011; #10 $display("outside %b", data);
    ea = 1; #10 $display("outside+A %b", data);
  end
endmodule`,
};

test('generateHdl: a bus of two tri-state buffers and an inout marker compiles and simulates (VHDL and Verilog)', () => {
  for (const lang of LANGS) {
    const g = generateHdl(busSheet(lang));
    assert.deepEqual(errorsOf(g), [], g.code);
    if (lang === 'vhdl') {
      assert.match(g.code, /^ {2}data <= a when ea = '1' else \(others => 'Z'\);$/m);
      assert.match(g.code, /^ {2}data <= b when tn = '0' else \(others => 'Z'\);$/m);
      assert.match(g.code, /data : inout std_logic_vector\(3 downto 0\)/);
    } else {
      assert.match(g.code, /^ {2}assign data = ea \? a : \{4\{1'bz\}\};$/m);
      assert.match(g.code, /^ {2}assign data = tn \? \{4\{1'bz\}\} : b;$/m);
      assert.match(g.code, /inout wire \[3:0\] data/);
    }
    const r = simulate([{ path: `tribus.${ext(lang)}`, text: g.code }, { path: `tb.${ext(lang)}`, text: TB[lang] }], 'tb', { until: 1e12 });
    assert.deepEqual(r.errors.map(e => `${e.file}:${e.line} ${e.message}`), [], g.code);
    const log = r.sim.log.filter(l => /^(released|A|B|both|outside)/.test(l.text)).map(l => l.text.toLowerCase());
    assert.deepEqual(log, ['released zzzz', 'a 0101', 'b 1010', 'both xxxx', 'outside 0011', 'outside+a 0xx1'], `${lang}\n${g.code}`);
  }
});

test('generateHdl: an internal tri-state net (resolved signal), 1-bit buffers, one-pin-per-bit BUFE4 / BUFT4, unconnected enable', () => {
  for (const lang of LANGS) {
    // internal bus read by a buffer: declared std_logic_vector / wire, two continuous drivers
    const doc = busSheet(lang, { reader: true });
    const bus = doc.wires.find(w => w.points.length === 4);
    doc.labels.push({ id: 'L1', x: bus.points[1].x, y: bus.points[1].y + 20, net: 'ibus' });
    doc.ports = doc.ports.filter(p => p.name !== 'data');
    const g = generateHdl(normalizeDoc(doc));
    assert.deepEqual(errorsOf(g), [], g.code);
    assert.match(g.code, lang === 'vhdl' ? /signal ibus : std_logic_vector\(3 downto 0\);/ : /wire \[3:0\] ibus;/);
    const lib = compile([{ path: `tribus.${ext(lang)}`, text: g.code }]);
    const d = elaborate(lib, 'tribus');
    assert.deepEqual([...lib.errors, ...d.diags].filter(x => x.severity === 'error').map(x => x.message), []);
    // the symbols alone (datasheet HDL): every preset compiles in both languages
    for (const pr of SYMBOLS.tbuf.presets) {
      const h = symbolHdl('tbuf', pr.params)[lang];
      const l2 = compile([{ path: `x.${ext(lang)}`, text: h }]);
      const d2 = elaborate(l2, pr.title);
      assert.deepEqual([...l2.errors, ...d2.diags].filter(x => x.severity === 'error').map(x => x.message), [], `${pr.title} ${lang}:\n${h}`);
    }
  }
  const b1 = symbolHdl('tbuf', { width: 1, enable: 'T' });
  assert.match(b1.vhdl, /O <= I when T = '0' else 'Z';/);
  assert.match(b1.verilog, /assign O = T \? 1'bz : I;/);
  const b4 = symbolHdl('tbuf', { width: 4, enable: 'E', bits: true });
  for (let k = 0; k < 4; k++) assert.match(b4.vhdl, new RegExp(`O${k} <= I${k} when E = '1' else 'Z';`));
  assert.match(b4.verilog, /assign O3 = E \? I3 : 1'bz;/);
  const b16 = symbolHdl('tbuf', { width: 16, enable: 'E' });
  assert.match(b16.vhdl, /O <= I when E = '1' else \(others => 'Z'\);/);
  assert.match(b16.verilog, /assign O = E \? I : \{16\{1'bz\}\};/);
  // an unconnected enable is tied to 0 with a warning (BUFE: always released)
  const doc = busSheet('vhdl');
  doc.wires = doc.wires.filter(w => !(w.points[1].x === pinsOf(doc, doc.symbols[0]).E.x && w.points[1].y === pinsOf(doc, doc.symbols[0]).E.y));
  doc.ports = doc.ports.filter(p => p.name !== 'ea');
  const g = generateHdl(normalizeDoc(doc));
  assert.ok(g.diagnostics.some(d => /ua: input E unconnected, tied to 0/.test(d.message)), JSON.stringify(g.diagnostics));
  assert.match(g.code, /ua_E_zero <= '0';[\s\S]*data <= a when ua_E_zero = '1' else \(others => 'Z'\);/);
  const lib = compile([{ path: 'tribus.vhd', text: g.code }]);
  assert.deepEqual([...lib.errors, ...elaborate(lib, 'tribus').diags].filter(x => x.severity === 'error').map(x => x.message), []);
});

// ------------------------------------------------------------------ design checks
test('design checks: the generated tri-state bus has no multiple-driver warning (VHDL and Verilog)', () => {
  for (const lang of LANGS) {
    for (const opt of [{}, { reader: true }]) {
      const doc = busSheet(lang, opt);
      const g = generateHdl(doc);
      const lib = compile([{ path: `src/tribus.${ext(lang)}`, text: g.code }]);
      const d = elaborate(lib, 'tribus');
      const checks = designChecks(lib, d);
      assert.deepEqual(checks.filter(c => c.check === 'multi-driver'), [], `${lang}: ${JSON.stringify(checks)}`);
      assert.deepEqual(checks.filter(c => c.severity === 'error'), []);
    }
    // two ordinary assignments to one signal are still reported
    const text = lang === 'vhdl'
      ? 'library ieee; use ieee.std_logic_1164.all;\nentity m is port (a, b : in std_logic; y : out std_logic); end m;\narchitecture r of m is\nbegin\n  y <= a;\n  y <= b;\nend r;\n'
      : 'module m(input a, b, output y);\n  assign y = a;\n  assign y = b;\nendmodule\n';
    const lib = compile([{ path: `src/m.${ext(lang)}`, text }]);
    assert.ok(designChecks(lib, elaborate(lib, 'm')).some(c => c.check === 'multi-driver'), lang);
  }
});

// ------------------------------------------------------------------ Symbol Info
test('Symbol Info: truth tables with Z (BUFE, BUFT, BUFT4, BUFE8 per bit) and datasheet texts in English and Portuguese', () => {
  const rows = t => t.rows.map(r => `${r.in}:${r.out}`);
  const e = truthTable('tbuf', { width: 1, enable: 'E' });
  assert.equal(e.kind, 'exhaustive');
  assert.deepEqual(e.inCols.map(c => c.label), ['E', 'I']);
  assert.deepEqual(rows(e), ['00:Z', '01:Z', '10:0', '11:1']);
  assert.deepEqual(e.compact.map(r => `${r.in}:${r.out}`), ['0X:Z', '10:0', '11:1']);
  const t = truthTable('tbuf', { width: 1, enable: 'T' });
  assert.deepEqual(rows(t), ['00:0', '01:1', '10:Z', '11:Z']);
  assert.deepEqual(t.compact.map(r => `${r.in}:${r.out}`), ['00:0', '01:1', '1X:Z']);
  const t4 = truthTable('tbuf', { width: 4, enable: 'T', bits: true });
  assert.deepEqual(t4.inCols.map(c => c.label), ['T', 'I0', 'I1', 'I2', 'I3']);
  assert.equal(t4.rows.length, 32);
  for (const r of t4.rows) assert.equal(r.out, r.in[0] === '1' ? 'ZZZZ' : r.in.slice(1), r.in);
  assert.ok(t4.compact.some(r => r.in === '1XXXX' && r.out === 'ZZZZ'));
  const e8 = truthTable('tbuf', { width: 8, enable: 'E' });
  assert.equal(e8.perBit, true);
  assert.deepEqual(rows(e8), ['00:Z', '01:Z', '10:0', '11:1']);

  for (const lang of ['en', 'pt']) {
    const d = symbolDoc('tbuf', { width: 1, enable: 'T' }, { lang });
    assert.equal(d.title, 'BUFT');
    assert.equal(d.formula, 'O = T ? Z : I');
    assert.deepEqual(d.xilinx, ['BUFT']);
    assert.match(d.text.join(' '), lang === 'pt' ? /três estados.*alta impedância/ : /tri-state.*high impedance/);
    assert.match(d.pins[0].func, lang === 'pt' ? /ativo a 0/ : /active low/);
    assert.deepEqual(d.params.map(p => p.label), lang === 'pt' ? ['Largura', 'Entrada de habilitação', 'Um pino por bit (I0.., O0..)'] : ['Width', 'Enable input', 'One pin per bit (I0.., O0..)']);
    assert.match(d.hdl.vhdl, /O <= I when T = '0' else 'Z';/);
  }
  assert.equal(symbolDoc('tbuf', { width: 8, enable: 'E', bits: false }).title, 'BUFE8');
  assert.equal(symbolDoc('tbuf', { width: 1, enable: 'E' }).formula, 'O = E ? I : Z');
  assert.match(symbolDoc('tbuf', { width: 4, enable: 'E', bits: true }, { lang: 'pt' }).text.join(' '), /I0\.\.I3, O0\.\.O3/);
  for (const pr of SYMBOLS.tbuf.presets) assert.ok(docKeys().some(k => k.type === 'tbuf' && k.preset === pr.title), pr.title);
});

// ------------------------------------------------------------------ live simulation
test('live schematic simulation: two tri-state buffers on a bus with an inout marker — Z when released, X on a conflict', () => {
  for (const lang of LANGS) {
    const doc = busSheet(lang, { reader: true });
    const r = buildLiveSim(doc, {});
    assert.deepEqual(r.errors, [], r.code);
    const live = r.live;
    const id = n => doc.ports.find(p => p.name === n).id;
    const bits = n => V.toBin(live.portValue(id(n)));
    const busNet = live.nl.portNet.get(id('data'));
    const wireLevel = () => level(live.netValue(live.nl.wireNet.get(doc.wires.find(w => w.points.length === 4).id)));
    assert.deepEqual(live.bidirs.map(b => b.name), ['data']);
    live.set(id('a'), 0b0101n); live.set(id('b'), 0b1010n); live.set(id('tn'), 1n);
    assert.equal(bits('data'), 'zzzz', 'both released');
    assert.equal(level(live.netValue(busNet)), 'z');
    assert.equal(wireLevel(), 'z', 'the bus wire is drawn as Z (blue)');
    assert.equal(bits('q'), 'zzzz', 'the BUF reading the floating bus copies it (it is a wire)');
    live.set(id('ea'), 1n);
    assert.equal(bits('data'), '0101'); assert.equal(bits('q'), '0101'); assert.equal(wireLevel(), '1');
    live.set(id('ea'), 0n); live.set(id('tn'), 0n);
    assert.equal(bits('data'), '1010'); assert.equal(bits('q'), '1010');
    live.set(id('ea'), 1n);
    assert.equal(bits('data'), 'xxxx', 'both enabled: conflict');
    assert.equal(wireLevel(), 'x', 'the bus wire is drawn as X (red)');
    live.set(id('b'), 0b0101n);
    assert.equal(bits('data'), '0101', 'both enabled with the same value: no conflict');
    // released by the buffers, driven from outside through the inout marker
    live.set(id('ea'), 0n); live.set(id('tn'), 1n);
    live.drive(id('data'), 0b0011n);
    assert.equal(bits('data'), '0011'); assert.equal(bits('q'), '0011');
    live.set(id('ea'), 1n);
    assert.equal(bits('data'), '0xx1', 'outside and A drive different values on bits 1 and 2');
    live.drive(id('data'), null);
    assert.equal(bits('data'), '0101');
    live.reset();
    assert.equal(bits('data'), '0101', 'a power cycle keeps the inputs (ea = 1)');
    // 1-bit wires: the enable / data wires are 0 / 1, the output wire Z
    const one = busSheet(lang, { W: 1 });
    const r1 = buildLiveSim(one, {});
    assert.deepEqual(r1.errors, [], r1.code);
    const dnet = r1.live.nl.portNet.get(one.ports.find(p => p.name === 'data').id);
    assert.equal(level(r1.live.netValue(dnet)), '0', 'inputs start at 0: T = 0 enables the BUFT (b = 0)');
    r1.live.set(one.ports.find(p => p.name === 'tn').id, 1n);
    assert.equal(level(r1.live.netValue(dnet)), 'z');
    r1.live.set(one.ports.find(p => p.name === 'tn').id, 0n);
    r1.live.set(one.ports.find(p => p.name === 'b').id, 1n);
    assert.equal(level(r1.live.netValue(dnet)), '1');
  }
});

// ------------------------------------------------------------------ HDL -> schematic
test('HDL -> schematic: tri-state assignments become BUFE / BUFT symbols, the bus net has no driver error, the HDL comes back the same', async () => {
  const SRC = {
    vhdl: `library ieee; use ieee.std_logic_1164.all;
entity t is port (a, b : in std_logic_vector(3 downto 0); e, f, x : in std_logic; d : inout std_logic_vector(3 downto 0); s : out std_logic); end t;
architecture r of t is begin
  d <= a when e = '1' else (others => 'Z');
  d <= (others => 'Z') when f = '1' else b;
  s <= x when e = '0' else 'Z';
end r;`,
    verilog: `module t(input [3:0] a, b, input e, f, x, inout [3:0] d, output s);
  assign d = e ? a : {4{1'bz}};
  assign d = f ? 4'bzzzz : b;
  assign s = e ? 1'bz : x;
endmodule`,
  };
  for (const lang of LANGS) {
    const path = `t.${ext(lang)}`;
    const lib = compile([{ path, text: SRC[lang] }]);
    const doc = normalizeDoc(await schematicFromHdl(elaborate(lib, 't').top, { sources: { [path]: SRC[lang] } }));
    assert.deepEqual(doc.symbols.map(s => `${s.type}:${s.params.width}:${s.params.enable}`), ['tbuf:4:E', 'tbuf:4:T', 'tbuf:1:T']);
    assert.deepEqual(errorsOf(netlist(doc)), []);
    const g = generateHdl(doc);
    assert.deepEqual(errorsOf(g), []);
    if (lang === 'vhdl') {
      assert.match(g.code, /d <= a when e = '1' else \(others => 'Z'\);/);
      assert.match(g.code, /d <= b when f = '0' else \(others => 'Z'\);/);
      assert.match(g.code, /s <= x when e = '0' else 'Z';/);
    } else {
      assert.match(g.code, /assign d = e \? a : \{4\{1'bz\}\};/);
      assert.match(g.code, /assign d = f \? \{4\{1'bz\}\} : b;/);
      assert.match(g.code, /assign s = e \? 1'bz : x;/);
    }
  }
});

// ------------------------------------------------------------------ ISE .sch
// a one-block ISE schematic (as test/isesch-library.test.js): ports named after the pins
function iseSch(sym, pins, polar) {
  const L = ['<?xml version="1.0" encoding="UTF-8"?>', '<drawing version="7">', '  <netlist>'];
  for (const s of new Set(Object.values(pins))) L.push(`    <signal name="${s}" />`);
  for (const [s, pol] of Object.entries(polar)) L.push(`    <port polarity="${pol}" name="${s}" />`);
  L.push(`    <block symbolname="${sym}" name="XLXI_1">`);
  for (const [pin, s] of Object.entries(pins)) L.push(`      <blockpin signalname="${s}" name="${pin}" />`);
  L.push('    </block>', '  </netlist>', '  <sheet sheetnum="1" width="3520" height="2720">', '    <instance x="1200" y="1600" name="XLXI_1" orien="R0" />', '  </sheet>', '</drawing>');
  return L.join('\n');
}

test('ISE .sch import: BUFE, BUFT, BUFE4 (one pin per bit), BUFE8, BUFT16 become tri-state buffers that simulate as the Xilinx symbols', () => {
  const cases = [
    ['BUFE', { E: 'E', I: 'I', O: 'O' }, { width: 1, enable: 'E', bits: false }],
    ['BUFT', { T: 'T', I: 'I', O: 'O' }, { width: 1, enable: 'T', bits: false }],
    ['BUFE4', { E: 'E', I0: 'I(0)', I1: 'I(1)', I2: 'I(2)', I3: 'I(3)', O0: 'O(0)', O1: 'O(1)', O2: 'O(2)', O3: 'O(3)' }, { width: 4, enable: 'E', bits: true }],
    ['BUFE8', { E: 'E', 'I(7:0)': 'I(7:0)', 'O(7:0)': 'O(7:0)' }, { width: 8, enable: 'E', bits: false }],
    ['BUFT16', { T: 'T', 'I(15:0)': 'I(15:0)', 'O(15:0)': 'O(15:0)' }, { width: 16, enable: 'T', bits: false }],
  ];
  for (const [sym, pins, params] of cases) {
    const w = params.width, en = params.enable;
    const bus = n => (w > 1 ? `${n}(${w - 1}:0)` : n);
    const xml = iseSch(sym, pins, { [en]: 'Input', [bus('I')]: 'Input', [bus('O')]: 'Output' });
    for (const lang of LANGS) {
      const { doc, warnings } = importIseSch(xml, { name: 'top', lang });
      assert.deepEqual(warnings.filter(x => /connectivity|no Silinx equivalent|schematic check/.test(x)), [], `${sym}: ${warnings.join('\n')}`);
      const s = doc.symbols.find(x => x.type === 'tbuf');
      assert.ok(s, `${sym} -> tbuf (${doc.symbols.map(x => x.type)})`);
      assert.deepEqual({ width: s.params.width, enable: s.params.enable, bits: s.params.bits }, params, sym);
      assert.equal(presetOf('tbuf', s.params), sym);
      const g = generateHdl(doc, { lang });
      assert.deepEqual(errorsOf(g), [], g.code);
      // drive I with a pattern, toggle the enable: O = I or all Z
      const pat = (0xA5A5 & ((1 << w) - 1)).toString(2).padStart(w, '0');
      const on = en === 'E' ? '1' : '0', offv = en === 'E' ? '0' : '1';
      const tb = lang === 'vhdl'
        ? `library ieee; use ieee.std_logic_1164.all;
entity tb is end;
architecture s of tb is
  signal ${en} : std_logic := '${offv}';
  signal I, O : ${w > 1 ? `std_logic_vector(${w - 1} downto 0)` : 'std_logic'};
begin
  dut : entity work.top port map (${en} => ${en}, I => I, O => O);
  process begin
    I <= ${w > 1 ? `"${pat}"` : `'${pat}'`}; wait for 1 ns; report to_string(O);
    ${en} <= '${on}'; wait for 1 ns; report to_string(O);
    wait;
  end process;
end;`
        : `\`timescale 1ns/1ps
module tb;
  reg ${en} = 1'b${offv};
  reg ${w > 1 ? `[${w - 1}:0] ` : ''}I;
  wire ${w > 1 ? `[${w - 1}:0] ` : ''}O;
  top dut (.${en}(${en}), .I(I), .O(O));
  initial begin
    I = ${w}'b${pat}; #1 $display("%b", O);
    ${en} = 1'b${on}; #1 $display("%b", O);
  end
endmodule`;
      const r = simulate([{ path: g.filename, text: g.code }, { path: `tb.${ext(lang)}`, text: tb }], 'tb', { until: 1e12 });
      assert.deepEqual(r.errors.map(x => `${x.file}:${x.line} ${x.message}`), [], g.code);
      const out = r.sim.log.filter(l => l.kind === 'print' || l.kind === 'note').map(l => l.text.toLowerCase()).filter(x => /^[01xz]+$/.test(x));
      assert.deepEqual(out, ['z'.repeat(w), pat], `${sym} ${lang}`);
    }
  }
});

test('ISE .sch export / import round trip: BUFE8 and BUFT on a bus to an inout marker; other widths as Silinx symbols', () => {
  for (const lang of LANGS) {
    // two BUFE8 / BUFT8 on an 8-bit bus, plus a 1-bit BUFT and a 4-bit one-pin-per-bit buffer
    const doc = busSheet(lang, { W: 8 });
    doc.symbols[0].params = { width: 8, enable: 'E', bits: false };
    doc.symbols[1].params = { width: 8, enable: 'E', bits: false };
    const extra = [
      { id: 'S5', type: 'tbuf', x: 300, y: 600, rot: 0, mirror: false, name: 'uc', params: { width: 1, enable: 'T' } },
      { id: 'S6', type: 'tbuf', x: 300, y: 800, rot: 0, mirror: false, name: 'ud', params: { width: 4, enable: 'E', bits: true } },
      { id: 'S7', type: 'tbuf', x: 300, y: 1000, rot: 0, mirror: false, name: 'ue', params: { width: 3, enable: 'T' } },
    ];
    let k = 100;
    for (const s of extra) {
      doc.symbols.push(s);
      for (const p of Object.values(pinsOf(doc, s))) {
        const dx = p.dir === 'out' ? 40 : -40;
        doc.wires.push({ id: `W${++k}`, points: [{ x: p.x, y: p.y }, { x: p.x + dx, y: p.y }] });
        doc.ports.push({ id: `P${k}`, name: `${s.name}_${p.name}`, dir: p.dir === 'out' ? 'out' : 'in', width: p.width, x: p.x + dx, y: p.y });
      }
    }
    // ub is a BUFE8 now: E sits where T was, its control marker keeps the name tn
    const ndoc = normalizeDoc(doc);
    assert.deepEqual(errorsOf(netlist(ndoc)), []);
    const x = exportIseSch(ndoc, { timestamp: '2020-1-1T10:10:10', lang });
    assert.deepEqual(x.warnings.filter(w => /schematic check/.test(w)), []);
    assert.match(x.xml, /<block symbolname="bufe8" name="ua">/);
    assert.match(x.xml, /<block symbolname="bufe8" name="ub">/);
    assert.match(x.xml, /<blockpin signalname="data\(7:0\)" name="O\(7:0\)" \/>/);
    assert.match(x.xml, /<block symbolname="buft" name="uc">/);
    assert.match(x.xml, /<block symbolname="xl_tbufe_w4_bits" name="ud">/);
    assert.match(x.xml, /<block symbolname="xl_tbuft_w3" name="ue">/);
    assert.match(x.xml, /<port polarity="BiDirectional" name="data\(7:0\)" \/>/);
    assert.match(x.xml, /<blockdef name="bufe8">/);
    assert.deepEqual(x.files.map(f => f.path).sort(), [`xl_tbufe_w4_bits.${ext(lang)}`, 'xl_tbufe_w4_bits.sym', `xl_tbuft_w3.${ext(lang)}`, 'xl_tbuft_w3.sym'].sort());
    assert.deepEqual(decodeXlSymbol('xl_tbuft_w3'), { type: 'tbuf', params: { width: 3, enable: 'T', bits: false } });
    const im = importIseSch(x.xml, { name: 'tribus', lang });
    assert.deepEqual(im.warnings.filter(w => /connectivity|no Silinx equivalent|schematic check/.test(w)), [], im.warnings.join('\n'));
    const t = s => `${s.name}:${s.type}:${s.params.width}:${s.params.enable}:${!!s.params.bits}`;
    assert.deepEqual(im.doc.symbols.filter(s => s.type === 'tbuf').map(t).sort(), ['ua:tbuf:8:E:false', 'ub:tbuf:8:E:false', 'uc:tbuf:1:T:false', 'ud:tbuf:4:E:true', 'ue:tbuf:3:T:false']);
    const nl2 = netlist(im.doc);
    assert.deepEqual(errorsOf(nl2), []);
    const bus = nl2.portNet.get(im.doc.ports.find(p => p.name === 'data').id);
    assert.equal(bus.tristate, true);
    assert.equal(bus.drivers.length, 2);
    // the imported schematic generates the same tri-state HDL
    const g = generateHdl(im.doc, { lang });
    assert.deepEqual(errorsOf(g), []);
    assert.match(g.code, lang === 'vhdl' ? /data <= a when ea = '1' else \(others => 'Z'\);/ : /assign data = ea \? a : \{8\{1'bz\}\};/);
    assert.match(g.code, lang === 'vhdl' ? /data <= b when tn = '1' else \(others => 'Z'\);/ : /assign data = tn \? b : \{8\{1'bz\}\};/);
  }
});
