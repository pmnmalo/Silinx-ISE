// INV and BUF with a pin per bit (#2067), as the Xilinx INV4 / BUF4: Width 4 and Pins per bit give I0..I3 and O0..O3,
// a row each (one triangle a bit); their HDL is one assignment a bit, compiled and simulated in VHDL and Verilog, with
// the warnings of a 1-bit one for each bit; exported to ISE as a Silinx symbol and imported back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SYMBOLS, newDoc, normalizeDoc, netlist, generateHdl, symbolDef, symbolPins } from '../core/schdoc.js';
import { compile, simulate } from '../core/compile.js';
import { exportIseSch, importIseSch, decodeXlSymbol, parseIseSch } from '../core/isesch.js';

const ext = (lang) => (lang === 'vhdl' ? 'vhd' : 'v');

// a sheet: U1 (type, 4 bits a pin each), input markers a0..a3 and output markers y0..y3 on its pins (`outs`: the outputs
// wired)
function sheet(type, lang, outs = [0, 1, 2, 3]) {
  const doc = newDoc('pb', lang);
  doc.symbols.push({ id: 'S1', type, x: 200, y: 100, rot: 0, mirror: false, name: 'U1', params: { width: 4, bits: true } });
  for (const p of symbolPins(doc.symbols[0], {})) {
    const k = +p.name.slice(1);
    if (p.dir === 'out' && !outs.includes(k)) continue;
    const x = p.dir === 'in' ? p.x - 40 : p.x + 40;
    doc.ports.push({ id: `P${p.name}`, name: `${p.dir === 'in' ? 'a' : 'y'}${k}`, dir: p.dir === 'in' ? 'in' : 'out', width: 1, x, y: p.y });
    doc.wires.push({ id: `W${p.name}`, points: [{ x, y: p.y }, { x: p.x, y: p.y }] });
  }
  return normalizeDoc(doc);
}

test('#2067 INV / BUF: Pins per bit a parameter; Width 4 with it: I0..I3, O0..O3 a row each, 80 x 80; without it, or 1 bit: I, O', () => {
  for (const type of ['inv', 'buf']) {
    assert.deepEqual(SYMBOLS[type].params.map((p) => p.name), ['width', 'bits'], type);
    const d = symbolDef({ type, params: { width: 4, bits: true } });
    // (BUF's triangle 40 long, INV's 34 and its bubble, #2068)
    assert.deepEqual([d.w, d.h, d.rows, d.body], [80, 80, 4, { x: 20, y: 0, w: type === 'buf' ? 40 : 34, h: 80 }], type);
    assert.deepEqual(d.pins.map((p) => `${p.name}:${p.dir}@${p.x},${p.y}/${p.width}`),
      ['I0:in@0,10/1', 'I1:in@0,30/1', 'I2:in@0,50/1', 'I3:in@0,70/1', 'O0:out@80,10/1', 'O1:out@80,30/1', 'O2:out@80,50/1', 'O3:out@80,70/1'], type);
    for (const params of [{ width: 4 }, { width: 1, bits: true }]) {
      assert.deepEqual(symbolDef({ type, params }).pins.map((p) => `${p.name}/${p.width}`), [`I/${params.width}`, `O/${params.width}`], `${type} ${JSON.stringify(params)}`);
    }
  }
});

test('#2067 INV4 / BUF4 with a pin per bit: one assignment a bit, no warnings, compiled and simulated in VHDL and Verilog', () => {
  for (const type of ['inv', 'buf']) {
    for (const lang of ['vhdl', 'verilog']) {
      const doc = sheet(type, lang);
      assert.deepEqual(netlist(doc).diagnostics, [], `${type} ${lang}: no warnings`);
      const g = generateHdl(doc, { lang });
      assert.deepEqual(g.diagnostics, [], `${type} ${lang}`);
      for (let k = 0; k < 4; k++) {
        const rhs = type === 'buf' ? `a${k}` : lang === 'vhdl' ? `not a${k}` : `~a${k}`;
        assert.match(g.code, new RegExp(lang === 'vhdl' ? `y${k} <= ${rhs};` : `assign y${k} = ${rhs};`), `${type} ${lang} bit ${k}`);
      }
      // simulated: a = 0101 -> y its bits (BUF) or their complements (INV), each its own; the test bench says
      const w = type === 'buf' ? ['1', '0', '1', '0'] : ['0', '1', '0', '1'];
      const tb = lang === 'vhdl'
        ? `library ieee; use ieee.std_logic_1164.all;\nentity tb is end tb;\narchitecture t of tb is\n  signal a0, a1, a2, a3, y0, y1, y2, y3 : std_logic := '0';\nbegin\n  uut: entity work.pb port map (a0 => a0, a1 => a1, a2 => a2, a3 => a3, y0 => y0, y1 => y1, y2 => y2, y3 => y3);\n  process begin\n    a0 <= '1'; a1 <= '0'; a2 <= '1'; a3 <= '0'; wait for 10 ns;\n    assert y0 = '${w[0]}' and y1 = '${w[1]}' and y2 = '${w[2]}' and y3 = '${w[3]}' report "y wrong" severity error;\n    report "done"; wait;\n  end process;\nend t;\n`
        : `\`timescale 1ns/1ps\nmodule tb;\n  reg a0 = 0, a1 = 0, a2 = 0, a3 = 0;\n  wire y0, y1, y2, y3;\n  pb uut (.a0(a0), .a1(a1), .a2(a2), .a3(a3), .y0(y0), .y1(y1), .y2(y2), .y3(y3));\n  initial begin\n    a0 = 1; a1 = 0; a2 = 1; a3 = 0; #10;\n    if (!(y0 === 1'b${w[0]} && y1 === 1'b${w[1]} && y2 === 1'b${w[2]} && y3 === 1'b${w[3]})) $error("y wrong");\n    $display("done"); $finish;\n  end\nendmodule\n`;
      const r = simulate([{ path: `pb.${ext(lang)}`, text: g.code }, { path: `tb.${ext(lang)}`, text: tb }], 'tb', { until: 1e6 });
      assert.deepEqual(r.errors.map((e) => e.message), [], `${type} ${lang}: compiles`);
      const log = r.sim.log.map((l) => `${l.kind}:${l.text}`);
      assert.deepEqual(r.sim.log.filter((l) => l.kind === 'error' || l.kind === 'failure'), [], `${type} ${lang}: ${log.join('\n')}`);
      assert.ok(log.some((l) => /done/.test(l)), `${type} ${lang}: ran to the end`);
    }
  }
});

test('#2067 an output of INV4 left unconnected: its bit to a signal of its own, no warning; its inputs unconnected: each one\'s warnings', () => {
  const g = generateHdl(sheet('inv', 'vhdl', [0, 2]), { lang: 'vhdl' });
  assert.deepEqual(g.diagnostics, []);
  assert.match(g.code, /y0 <= not a0;\n {2}net_1 <= not a1;\n {2}y2 <= not a2;\n {2}net_2 <= not a3;/);
  const doc = newDoc('pb', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'inv', x: 200, y: 100, rot: 0, mirror: false, name: 'U1', params: { width: 4, bits: true } });
  assert.deepEqual(generateHdl(normalizeDoc(doc), { lang: 'vhdl' }).diagnostics.map((d) => d.message), [
    ...[0, 1, 2, 3].map((k) => `input pin I${k} of U1 (inv) is not connected`), ...[0, 1, 2, 3].map((k) => `U1: input I${k} unconnected, tied to 0`)]);
});

test('#2067 exported to ISE as xl_inv_w4_bits / xl_buf_w4_bits (a Silinx symbol), imported back with a pin per bit', () => {
  assert.deepEqual(decodeXlSymbol('xl_inv_w4_bits'), { type: 'inv', params: { width: 4, bits: true } });
  assert.deepEqual(decodeXlSymbol('xl_buf_w8'), { type: 'buf', params: { width: 8 } });
  for (const type of ['inv', 'buf']) {
    const ex = exportIseSch(sheet(type, 'vhdl'), { timestamp: '2024-1-2T3:4:5' });
    assert.equal(parseIseSch(ex.xml).blocks[0].symbol, `xl_${type}_w4_bits`);
    const back = importIseSch(ex.xml, { name: 'pb', symbols: Object.fromEntries(ex.files.filter((f) => f.kind === 'sym').map((f) => [f.path, f.text])) });
    const s = back.doc.symbols[0];
    assert.deepEqual([s.type, s.params.width, s.params.bits], [type, 4, true]);
    assert.deepEqual(back.warnings, [], type);
    assert.deepEqual(netlist(back.doc).diagnostics, [], `${type}: its connections back`);
  }
});
