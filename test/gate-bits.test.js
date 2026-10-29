// The logic gates with a pin per bit (#2079): Width W and Pins per bit draw W gates, one under the other, gate k's
// inputs I0_k, I1_k… (inverted as the 1-bit gate's) and output Ok; their HDL is one gate's assignment a bit, compiled
// and simulated in VHDL and Verilog, no warnings; exported to ISE as a Silinx symbol and imported back with the option.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SYMBOLS, newDoc, normalizeDoc, netlist, generateHdl, symbolDef, symbolPins } from '../core/schdoc.js';
import { simulate } from '../core/compile.js';
import { exportIseSch, importIseSch, decodeXlSymbol, parseIseSch } from '../core/isesch.js';

const ext = (lang) => (lang === 'vhdl' ? 'vhd' : 'v');

// U1 (type, 2 bits a pin each) with a marker on every pin: input a<i>_<k>, output y<k>
function sheet(type, lang) {
  const doc = newDoc('gb', lang);
  doc.symbols.push({ id: 'S1', type, x: 200, y: 100, rot: 0, mirror: false, name: 'U1', params: { width: 2, bits: true } });
  for (const p of symbolPins(normalizeDoc(doc).symbols[0], {})) {
    const x = p.dir === 'in' ? p.x - 40 : p.x + 40;
    doc.ports.push({ id: `P${p.name}`, name: p.dir === 'in' ? `a${p.name.slice(1)}` : `y${p.name.slice(1)}`, dir: p.dir === 'in' ? 'in' : 'out', width: 1, x, y: p.y });
    doc.wires.push({ id: `W${p.name}`, points: [{ x, y: p.y }, { x: p.x, y: p.y }] });
  }
  return normalizeDoc(doc);
}

test('#2079 every gate of 2 or more inputs has Pins per bit; with it a gate a row (bit 0 at the top), I<i>_<k> and O<k>', () => {
  const gates = Object.keys(SYMBOLS).filter((t) => SYMBOLS[t].gate && SYMBOLS[t].inputs > 1);
  assert.ok(gates.length > 40);
  for (const t of gates) assert.deepEqual(SYMBOLS[t].params.map((p) => p.name), ['width', 'bits'], t);
  const d = symbolDef({ type: 'and3', params: { width: 2, bits: true } });
  assert.deepEqual([d.w, d.h, d.gh, d.rows], [80, 120, 60, 2]);
  assert.deepEqual(d.pins.map((p) => `${p.name}@${p.y}/${p.width}`), ['I0_0@10/1', 'I1_0@30/1', 'I2_0@50/1', 'O0@30/1', 'I0_1@70/1', 'I1_1@90/1', 'I2_1@110/1', 'O1@90/1']);
  // inverted inputs as the 1-bit gate's (I0 at the bottom, bubbled)
  assert.deepEqual(symbolDef({ type: 'nand2b1', params: { width: 2, bits: true } }).pins.filter((p) => p.inv).map((p) => `${p.name}@${p.y}`), ['I0_0@30', 'I0_1@70']);
  // without it, or at Width 1: the gate as before
  assert.deepEqual(symbolDef({ type: 'and2', params: { width: 4 } }).pins.map((p) => `${p.name}/${p.width}`), ['I0/4', 'I1/4', 'O/4']);
  assert.deepEqual(symbolDef({ type: 'and2', params: { width: 1, bits: true } }).pins.map((p) => p.name), ['I0', 'I1', 'O']);
});

test('#2079 AND2 / NOR3 / XOR2 / NAND2B1 with a pin per bit: an assignment a bit, no warnings, simulated in VHDL and Verilog', () => {
  // each bit's inputs and the expected output, for a = (1, 0, 1) on bit 0 and (0, 0, 0) on bit 1
  const CASES = { and2: ['0', '0'], nor3: ['0', '1'], xor2: ['1', '0'], nand2b1: ['1', '1'] };
  for (const [type, want] of Object.entries(CASES)) {
    for (const lang of ['vhdl', 'verilog']) {
      const doc = sheet(type, lang);
      assert.deepEqual(netlist(doc).diagnostics, [], `${type} ${lang}: no warnings`);
      const g = generateHdl(doc, { lang });
      assert.deepEqual(g.diagnostics, [], `${type} ${lang}`);
      const ins = doc.ports.filter((p) => p.dir === 'in').map((p) => p.name);
      const bit0 = ['1', '0', '1'];
      const set = ins.map((n) => [n, n.endsWith('_0') ? bit0[+n[1]] : '0']);
      const tb = lang === 'vhdl'
        ? `library ieee; use ieee.std_logic_1164.all;\nentity tb is end tb;\narchitecture t of tb is\n  signal ${ins.join(', ')}, y0, y1 : std_logic := '0';\nbegin\n  uut: entity work.gb port map (${[...ins, 'y0', 'y1'].map((n) => `${n} => ${n}`).join(', ')});\n  process begin\n    ${set.map(([n, v]) => `${n} <= '${v}';`).join(' ')} wait for 10 ns;\n    assert y0 = '${want[0]}' and y1 = '${want[1]}' report "y wrong" severity error;\n    report "done"; wait;\n  end process;\nend t;\n`
        : `\`timescale 1ns/1ps\nmodule tb;\n  reg ${ins.map((n) => `${n} = 0`).join(', ')};\n  wire y0, y1;\n  gb uut (${[...ins, 'y0', 'y1'].map((n) => `.${n}(${n})`).join(', ')});\n  initial begin\n    ${set.map(([n, v]) => `${n} = ${v};`).join(' ')} #10;\n    if (!(y0 === 1'b${want[0]} && y1 === 1'b${want[1]})) $error("y wrong");\n    $display("done"); $finish;\n  end\nendmodule\n`;
      const r = simulate([{ path: `gb.${ext(lang)}`, text: g.code }, { path: `tb.${ext(lang)}`, text: tb }], 'tb', { until: 1e6 });
      assert.deepEqual(r.errors.map((e) => e.message), [], `${type} ${lang}: compiles`);
      const log = r.sim.log.map((l) => `${l.kind}:${l.text}`);
      assert.deepEqual(r.sim.log.filter((l) => l.kind === 'error' || l.kind === 'failure'), [], `${type} ${lang}: ${log.join('\n')}\n${g.code}`);
      assert.ok(log.some((l) => /done/.test(l)), `${type} ${lang}: ran to the end`);
    }
  }
});

test('#2079 exported to ISE as xl_<gate>_w<W>_bits, imported back with a pin per bit, its connections kept', () => {
  assert.deepEqual(decodeXlSymbol('xl_and2_w2_bits'), { type: 'and2', params: { width: 2, bits: true } });
  assert.deepEqual(decodeXlSymbol('xl_and2_w4'), { type: 'and2', params: { width: 4 } });
  for (const type of ['and2', 'nand2b1']) {
    const ex = exportIseSch(sheet(type, 'vhdl'), { timestamp: '2024-1-2T3:4:5' });
    assert.equal(parseIseSch(ex.xml).blocks[0].symbol, `xl_${type}_w2_bits`);
    const back = importIseSch(ex.xml, { name: 'gb', symbols: Object.fromEntries(ex.files.filter((f) => f.kind === 'sym').map((f) => [f.path, f.text])) });
    const s = back.doc.symbols[0];
    assert.deepEqual([s.type, s.params.width, s.params.bits], [type, 2, true]);
    assert.deepEqual(back.warnings, [], type);
    assert.deepEqual(netlist(back.doc).diagnostics, [], `${type}: its connections back`);
  }
});
