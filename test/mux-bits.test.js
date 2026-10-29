// The multiplexers and the demultiplexer with a pin per bit (#2081): Width W and Pins per bit draw W of them, one under
// the other, their select bits and enable shared (one pin each, a line joining the rows, as BUFE4's enable); a MUX's
// row r has D<i>_<r> and O<r>, a DEMUX's D<r> and O<i>_<r>. Their HDL is a row's assignments a bit, compiled and
// simulated in VHDL and Verilog, no warnings; an unconnected select said and tied once; exported to ISE as a Silinx
// symbol, imported back with the option.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SYMBOLS, newDoc, normalizeDoc, netlist, generateHdl, symbolDef, symbolPins } from '../core/schdoc.js';
import { simulate } from '../core/compile.js';
import { exportIseSch, importIseSch, decodeXlSymbol, parseIseSch } from '../core/isesch.js';

const ext = (lang) => (lang === 'vhdl' ? 'vhd' : 'v');
const id = (n) => n.toLowerCase();

// U1 with a marker on every pin (but `skip`): an input i_<pin>, an output o_<pin>
function sheet(type, params, lang, skip = []) {
  const doc = newDoc('mx', lang);
  doc.symbols.push({ id: 'S1', type, x: 200, y: 100, rot: 0, mirror: false, name: 'U1', params });
  for (const p of symbolPins(normalizeDoc(doc).symbols[0], {})) {
    if (skip.includes(p.name)) continue;
    const v = p.side === 'S' ? [p.x, p.y + 40] : [p.dir === 'in' ? p.x - 40 : p.x + 40, p.y];
    doc.ports.push({ id: `P${p.name}`, name: `${p.dir === 'in' ? 'i' : 'o'}_${id(p.name)}`, dir: p.dir === 'in' ? 'in' : 'out', width: 1, x: v[0], y: v[1] });
    doc.wires.push({ id: `W${p.name}`, points: [{ x: v[0], y: v[1] }, { x: p.x, y: p.y }] });
  }
  return normalizeDoc(doc);
}

test('#2081 MUX and DEMUX: Pins per bit a parameter; with it a row a bit, the select and the enable once', () => {
  for (const t of ['mux2', 'mux4', 'mux8', 'mux16', 'demux']) assert.ok(SYMBOLS[t].params.some((p) => p.name === 'bits'), t);
  const m = symbolDef({ type: 'mux2', params: { width: 2, bits: true, en: true } });
  assert.deepEqual([m.h, m.rows, m.rh], [170, 2, 80]);
  assert.deepEqual(m.pins.map((p) => `${p.name}@${p.x},${p.y}/${p.width}`), ['D0_0@0,20/1', 'D1_0@0,40/1', 'D0_1@0,100/1', 'D1_1@0,120/1', 'E@0,140/1', 'S0@40,170/1', 'O0@110,40/1', 'O1@110,120/1']);
  const d = symbolDef({ type: 'demux', params: { width: 2, bits: true, sel: 1 } });
  assert.deepEqual(d.pins.map((p) => `${p.name}@${p.x},${p.y}`), ['D0@0,40', 'D1@0,120', 'S0@60,170', 'O0_0@110,20', 'O1_0@110,40', 'O0_1@110,100', 'O1_1@110,120']);
  // without it, or at Width 1: as before (the pins' order kept)
  assert.deepEqual(symbolDef({ type: 'mux2', params: { width: 4, en: true } }).pins.map((p) => `${p.name}/${p.width}`), ['D0/4', 'D1/4', 'E/1', 'S0/1', 'O/4']);
  assert.deepEqual(symbolDef({ type: 'demux', params: { width: 1, bits: true, sel: 2 } }).pins.map((p) => p.name), ['D', 'S1', 'S0', 'O0', 'O1', 'O2', 'O3']);
});

// each case: its params, the inputs set, the outputs expected
const CASES = [
  ['mux2', { width: 2, bits: true, en: true }, { i_d0_0: 0, i_d1_0: 1, i_d0_1: 1, i_d1_1: 0, i_e: 1, i_s0: 1 }, { o_o0: 1, o_o1: 0 }],
  ['mux4', { width: 2, bits: true }, { i_d0_0: 0, i_d1_0: 0, i_d2_0: 1, i_d3_0: 0, i_d0_1: 1, i_d1_1: 1, i_d2_1: 0, i_d3_1: 1, i_s1: 1, i_s0: 0 }, { o_o0: 1, o_o1: 0 }],
  ['demux', { width: 2, bits: true, sel: 2, en: true }, { i_d0: 1, i_d1: 0, i_e: 1, i_s1: 0, i_s0: 1 }, { o_o0_0: 0, o_o1_0: 1, o_o2_0: 0, o_o3_0: 0, o_o0_1: 0, o_o1_1: 0, o_o2_1: 0, o_o3_1: 0 }],
];

test('#2081 MUX / DEMUX a bit: no warnings, compiled and simulated in VHDL and Verilog, each row its own data, the select shared', () => {
  for (const [type, params, ins, outs] of CASES) {
    for (const lang of ['vhdl', 'verilog']) {
      const doc = sheet(type, params, lang);
      assert.deepEqual(netlist(doc).diagnostics, [], `${type} ${lang}: no warnings`);
      const g = generateHdl(doc, { lang });
      assert.deepEqual(g.diagnostics, [], `${type} ${lang}`);
      const io = [...Object.keys(ins), ...Object.keys(outs)];
      const tb = lang === 'vhdl'
        ? `library ieee; use ieee.std_logic_1164.all;\nentity tb is end tb;\narchitecture t of tb is\n  signal ${io.join(', ')} : std_logic := '0';\nbegin\n  uut: entity work.mx port map (${io.map((n) => `${n} => ${n}`).join(', ')});\n  process begin\n    ${Object.entries(ins).map(([n, v]) => `${n} <= '${v}';`).join(' ')} wait for 10 ns;\n    assert ${Object.entries(outs).map(([n, v]) => `${n} = '${v}'`).join(' and ')} report "wrong" severity error;\n    report "done"; wait;\n  end process;\nend t;\n`
        : `\`timescale 1ns/1ps\nmodule tb;\n  reg ${Object.keys(ins).map((n) => `${n} = 0`).join(', ')};\n  wire ${Object.keys(outs).join(', ')};\n  mx uut (${io.map((n) => `.${n}(${n})`).join(', ')});\n  initial begin\n    ${Object.entries(ins).map(([n, v]) => `${n} = ${v};`).join(' ')} #10;\n    if (!(${Object.entries(outs).map(([n, v]) => `${n} === 1'b${v}`).join(' && ')})) $error("wrong");\n    $display("done"); $finish;\n  end\nendmodule\n`;
      const r = simulate([{ path: `mx.${ext(lang)}`, text: g.code }, { path: `tb.${ext(lang)}`, text: tb }], 'tb', { until: 1e6 });
      assert.deepEqual(r.errors.map((e) => e.message), [], `${type} ${lang}: compiles`);
      const log = r.sim.log.map((l) => `${l.kind}:${l.text}`);
      assert.deepEqual(r.sim.log.filter((l) => l.kind === 'error' || l.kind === 'failure'), [], `${type} ${lang}: ${log.join('\n')}`);
      assert.ok(log.some((l) => /done/.test(l)), `${type} ${lang}: ran to the end`);
    }
  }
});

test('#2081 a shared select left unconnected: said and tied to 0 once, as a one-bit multiplexer\'s', () => {
  const one = generateHdl(sheet('mux4', { width: 1 }, 'vhdl', ['S1']), { lang: 'vhdl' }).diagnostics.map((d) => d.message);
  const rows = generateHdl(sheet('mux4', { width: 2, bits: true }, 'vhdl', ['S1']), { lang: 'vhdl' });
  assert.deepEqual(rows.diagnostics.map((d) => d.message), one);
  assert.equal((rows.code.match(/U1_S1_zero <= '0';/g) || []).length, 1);
  const dem = generateHdl(sheet('demux', { width: 2, bits: true, sel: 1 }, 'vhdl', ['S0']), { lang: 'vhdl' }).diagnostics.map((d) => d.message);
  assert.deepEqual(dem, generateHdl(sheet('demux', { width: 1, sel: 1 }, 'vhdl', ['S0']), { lang: 'vhdl' }).diagnostics.map((d) => d.message));
});

test('#2081 exported to ISE as xl_mux…_bits / xl_demux…_bits, imported back with a pin per bit, its connections kept', () => {
  assert.deepEqual(decodeXlSymbol('xl_mux2e_w2_bits'), { type: 'mux2', params: { width: 2, en: true, bits: true } });
  assert.deepEqual(decodeXlSymbol('xl_demux2es_w2_bits'), { type: 'demux', params: { sel: 2, width: 2, en: true, selBus: false, bits: true } });
  for (const [type, params] of CASES) {
    const ex = exportIseSch(sheet(type, params, 'vhdl'), { timestamp: '2024-1-2T3:4:5' });
    assert.match(parseIseSch(ex.xml).blocks[0].symbol, /_bits$/);
    const back = importIseSch(ex.xml, { name: 'mx', symbols: Object.fromEntries(ex.files.filter((f) => f.kind === 'sym').map((f) => [f.path, f.text])) });
    const s = back.doc.symbols[0];
    assert.deepEqual([s.type, s.params.width, s.params.bits], [type, 2, true]);
    assert.deepEqual(back.warnings, [], type);
    assert.deepEqual(netlist(back.doc).diagnostics, [], `${type}: its connections back`);
  }
});
