// Silinx HLS: the C names Vitis HLS renames <name>_r (#1926), each against Vitis HLS 2025.2's port of it
// (test/hls-corpus/vitis-names.json, recorded by scripts/hls-vitis-names.mjs): every recorded name the same as Vitis's
// port, but for the words Vitis keeps that Silinx's HDL does not compile with (units, uwire…), renamed with a warning
// saying so; a top with names of each kind co-simulated in VHDL and in Verilog, its warnings asserted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cosimulate } from '../core/c-cosim.js';
import { renamed, vitisRenames, portOf, renamedWhy } from '../core/c-names.js';
import { breaksHdl } from '../core/reserved.js';
import { candidates, chunksOf, portsOf, renamedByVitis, topOf } from '../scripts/hls-vitis-names.mjs';

const VITIS = JSON.parse(fs.readFileSync(new URL('./hls-corpus/vitis-names.json', import.meta.url), 'utf8'));
const KEPT_BROKEN = ['incdir', 'include', 'rtranif1', 'units', 'uwire'];

test('#1926 every candidate run through Vitis HLS, none refused; each name\'s port as Vitis names it', () => {
  assert.deepEqual([VITIS.image, VITIS.refused], ['xilinx/vitis-hls:2025.2', []]);
  assert.deepEqual(candidates().filter((n) => !VITIS.ports[n]), []);
  const differ = Object.keys(VITIS.ports).filter((n) => portOf(n) !== VITIS.ports[n]);
  assert.deepEqual(differ, KEPT_BROKEN);
  for (const n of Object.keys(VITIS.ports)) assert.equal(vitisRenames(n), VITIS.ports[n] === `${n}_r`, n);
});

test('#1926 the names: pos and the block protocol\'s renamed, neg and SystemC\'s others kept; words Vitis keeps', () => {
  assert.deepEqual(['pos', 'POS', 'read', 'write', 'value', 'length', 'rst', 'ap_start', 'ap_return', 'ap_continue'].map(renamed), Array(10).fill(true));
  assert.deepEqual(['neg', 'NEG', 'sensitive', 'sc_module', 'clk', 'reset', 'this_', 'ap_ce', 'my_pos'].map(renamed), Array(9).fill(false));
  // (VHDL-2008's PSL and SystemVerilog-2009's: kept, as Vitis; units, uwire… kept by Vitis, but they break the HDL)
  assert.deepEqual(['vunit', 'fairness', 'soft', 'nettype', 'untyped'].map(renamed), [false, false, false, false, false]);
  for (const n of KEPT_BROKEN) {
    assert.deepEqual([vitisRenames(n), renamed(n), breaksHdl(n, 'vhdl') || breaksHdl(n, 'verilog')], [false, true, true], n);
  }
  assert.equal(renamedWhy('read'), "'read' is a name Vitis HLS reserves: it is named read_r in the module");
  assert.equal(renamedWhy('units'), "'units' is a reserved word of VHDL or Verilog: it is named units_r in the module (Vitis HLS names it units)");
  assert.equal(renamedWhy('signal'), "'signal' is a reserved word of VHDL or Verilog: it is named signal_r in the module");
  assert.equal(renamedWhy('neg'), null);
});

test('#1926 the script\'s tops: one argument each name; no two names of a letter case apart in a top; the ports read back', () => {
  assert.match(topOf(['a', 'read']), /^int names_top\(unsigned char a, unsigned char read\) \{\n {2}int names_sum = 0;\n {2}names_sum \+= a;\n {2}names_sum \+= read;\n/);
  assert.deepEqual(chunksOf(['NEG', 'Neg', 'neg', 'x', 'y'], 40), [['NEG', 'x', 'y'], ['Neg'], ['neg']]);
  assert.deepEqual(chunksOf(['a', 'b', 'c'], 2), [['a', 'b'], ['c']]);
  const ports = ['ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'pos_r', 'neg', 'ap_start_r', 'ap_return'].map((name) => ({ name }));
  assert.deepEqual(portsOf(['pos', 'neg', 'ap_start'], ports), { pos: 'pos_r', neg: 'neg', ap_start: 'ap_start_r' });
  assert.deepEqual(portsOf(['gone'], ports), { gone: null });
  assert.deepEqual(renamedByVitis({ pos: 'pos_r', neg: 'neg', in: 'in_r' }), ['in', 'pos']);
});

const SRC = `int names(unsigned char read, unsigned char neg, unsigned char ap_start, unsigned char units, unsigned char soft, int *value) {
  *value = read - neg;
  return ap_start + units + soft;
}
int main() {
  int v, s = 0;
  for (int i = 0; i < 4; i++) s += names(i, 2 * i, 3, i + 1, 5, &v) + v;
  return s == 64 ? 0 : 1;
}
`;

test('#1926 a top with names of each kind: renamed as Vitis HLS (units too, a warning saying Vitis does not); co-simulated in VHDL and Verilog', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(SRC, { file: 'names.c', lang });
    assert.deepEqual([r.errors, r.pass], [[], true], lang);
    assert.deepEqual(r.gen.ports.map((p) => p.name), ['ap_rst', 'ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'read_r', 'neg', 'ap_start_r', 'units_r', 'soft', 'value_r', 'value_r_ap_vld', 'ap_return'], lang);
    assert.deepEqual(r.gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`), [
      "1 warning: 'read' is a name Vitis HLS reserves: it is named read_r in the module",
      "1 warning: 'ap_start' is a name Vitis HLS reserves: it is named ap_start_r in the module",
      "1 warning: 'units' is a reserved word of VHDL or Verilog: it is named units_r in the module (Vitis HLS names it units)",
      "1 warning: 'value' is a name Vitis HLS reserves: it is named value_r in the module"], lang);
  }
});
