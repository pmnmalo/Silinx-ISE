// The SLICEM's distributed RAMs and shift registers in the Spartan-6 placer and XDL writer (#1153,
// packages/silinx-fpga/src/fpga/s6/phys-mem.js, xdl-mem.js): each kind (research/s6/gen-mem6.mjs, one primitive a
// design) implemented by the Silinx toolchain against the same design implemented by ISE (research/s6/measured/mem.json:
// the SLICEM's settings and what its pins carry), the contents against the INIT, the packing rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { placeS6 } from '../packages/silinx-fpga/src/fpga/s6/place.js';
import { placedXdlS6 } from '../packages/silinx-fpga/src/fpga/s6/xdl.js';
import { memContents } from '../packages/silinx-fpga/src/fpga/s6/xdl-mem.js';
import { checkSlice } from '../packages/silinx-fpga/src/fpga/s6/pack.js';
import { writeXdl } from '../packages/silinx-fpga/src/xdl.js';
import { MEM_DESIGNS } from '../packages/silinx-fpga/research/s6/gen-mem6.mjs';
import { memSummary } from '../packages/silinx-fpga/research/s6/ana-mem6.mjs';
import { s6Device, s6Netlist, s6Phys, s6Verilog } from './s6-lib.mjs';

const ISE = JSON.parse(fs.readFileSync(new URL('../packages/silinx-fpga/research/s6/measured/mem.json', import.meta.url), 'utf8'));
const PART = 'xc6slx16csg324-3';

// a design through the Silinx toolchain to its placed XDL: { d (s6Phys's), text }
async function implement(text) {
  const nl = await s6Netlist([{ path: 'top.v', lang: 'verilog', text }], 'top');
  const d = s6Phys(nl);
  const { device, sites } = s6Device(PART);
  const r = placeS6(d.phys, sites, { nl, seed: 1 });
  return { d, text: writeXdl(placedXdlS6(nl, d.packed, d.phys, r, { part: PART, device, name: 'top' })) };
}

// the summary with the LUT positions renamed (map: { D: 'A' } …): the positions a cell takes are the placer's choice
const POS_ATTR = /^[A-D](?=[56]LUT|[56]RAMMODE|DI1MUX|OUTMUX|USED|CY0|FF|5FF)/, POS_VALUE = /^[A-D](?=X$|DI1$)/, POS_PIN = /^[A-D](?=\d$|X$|I$|MUX$|Q$|$)/;
function renamed(sum, map) {
  const r = re => x => x.replace(re, m => map[m]);
  const cfg = sum.cfg.map(e => { const [a, v] = e.split('::'); return `${r(POS_ATTR)(a)}::${r(POS_VALUE)(v)}`; }).sort();
  return { cfg, pins: Object.fromEntries(Object.entries(sum.pins).map(([q, t]) => [r(POS_PIN)(q), t]).sort()) };
}
const PERMS = (function perms(a) { return a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p])); })(['A', 'B', 'C', 'D']);

test('every RAM and shift register as ISE writes it: the SLICEM\'s settings and its pins (the positions as the placer chose them)', { timeout: 600000 }, async () => {
  assert.deepEqual(Object.keys(MEM_DESIGNS).sort(), Object.keys(ISE).sort());
  for (const [name, verilog] of Object.entries(MEM_DESIGNS)) {
    const { d, text } = await implement(verilog);
    assert.deepEqual(d.phys.warnings, [], name);
    assert.deepEqual(d.packed.warnings, [], name);
    const ours = memSummary(text), ise = ISE[name];
    const same = PERMS.map(p => Object.fromEntries(['A', 'B', 'C', 'D'].map((x, i) => [x, p[i]]))).find(map => JSON.stringify(renamed(ours, map)) === JSON.stringify(ise));
    assert.ok(same, `${name}:\nours ${JSON.stringify(ours)}\nISE  ${JSON.stringify(ise)}`);
  }
});

test('memContents: a RAM\'s INIT in its positions, against the contents ISE wrote', () => {
  const cell = (type, params) => ({ type, params });
  const bits = (hex, n) => BigInt(`0x${hex}`).toString(2).padStart(n, '0');
  // a 32-bit RAM in the 64-bit mode: address k at bit 2k (0xF1 -> 0x5501)
  assert.equal(memContents(cell('RAM32X1S', { INIT: bits('F1', 32) }), ['D'], 'D').o6, '0x0000000000005501');
  // RAM128X1D: the low 64 addresses in D and B, the high in C and A
  const r128 = cell('RAM128X1D', { INIT: bits('0000000000000003' + '0000000000000001', 128) });
  assert.deepEqual(['D', 'C', 'B', 'A'].map(p => memContents(r128, ['D', 'C', 'B', 'A'], p).o6.slice(-1)), ['1', '3', '1', '3']);
  // RAM256X1S: the quarters in D, C, B, A
  const r256 = cell('RAM256X1S', { INIT: bits('000000000000000F' + '0000000000000007' + '0000000000000003' + '0000000000000001', 256) });
  assert.deepEqual(['D', 'C', 'B', 'A'].map(p => memContents(r256, ['D', 'C', 'B', 'A'], p).o6.slice(-1)), ['1', '3', '7', 'F']);
  // RAM32M: DO<0> (INIT's even bits) in O5, DO<1> (the odd bits) in both halves of O6
  assert.deepEqual(memContents(cell('RAM32M', { INIT_D: bits('8000000000000000', 64) }), ['D', 'C', 'B', 'A'], 'D'), { o6: '0x8000000080000000', o5: '0x00000000' });
  assert.deepEqual(memContents(cell('RAM32M', { INIT_C: bits('4', 64) }), ['D', 'C', 'B', 'A'], 'C'), { o6: '0x0000000000000000', o5: '0x00000002' });
  // a shift register: its INIT as it is
  assert.equal(memContents(cell('SRLC32E', { INIT: bits('89ABCDEF', 32) }), ['A'], 'A').o6, '0x0000000089ABCDEF');
  assert.equal(memContents(cell('SRL16E', { INIT: bits('ABCD', 16) }), ['D'], 'D').o6, '0x000000000000ABCD');
});

test('packing: a shift register\'s cascade out in position A, a two-LUT RAM in a pair, no storage element beside RAMs', async () => {
  const { d } = await implement(MEM_DESIGNS.srlc32e);
  const m = d.packed.slices.find(s => s.mem);
  assert.equal(typeof m.pos.A.o6, 'number');
  assert.equal(m.pos.D.mux, 'mc31');
  // two 64 x 1 dual-port RAMs (one write address): D and C, B and A
  const nl = await s6Verilog(`module m(input clk, input we, input [5:0] wa, input [5:0] ra, input [1:0] d, output [1:0] q, output [1:0] q2, output reg r);
 reg [1:0] mem[0:63]; always @(posedge clk) if (we) mem[wa] <= d; assign q = mem[wa]; assign q2 = mem[ra];
 always @(posedge clk) r <= q2[0] ^ q2[1];
endmodule`);
  const p = s6Phys(nl);
  const ms = p.packed.slices.filter(s => s.mem);
  assert.equal(ms.length, 1);
  const cellAt = q => ms[0].pos[q].o6;
  assert.equal(cellAt('D'), cellAt('C'));
  assert.equal(cellAt('B'), cellAt('A'));
  assert.notEqual(cellAt('D'), cellAt('B'));
  assert.ok(['A', 'B', 'C', 'D'].every(q => ms[0].pos[q].ff === null && ms[0].pos[q].ff5 === null), 'the flip-flop elsewhere');
  for (const s of p.packed.slices) assert.deepEqual(checkSlice(s, nl), []);
  assert.deepEqual(p.phys.warnings, []);
});
