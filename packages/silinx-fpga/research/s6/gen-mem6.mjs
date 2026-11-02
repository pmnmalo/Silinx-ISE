// The designs that show how ISE writes a SLICEM's distributed RAMs and shift registers (#1153): one primitive of each
// kind, every pin on a pad, INIT not zero, for ise-s6.sh impl (its top.xdl and top_map.xdl the reference of xdl.js).
//   node gen-mem6.mjs <out dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const pins = (name, n) => Array.from({ length: n }, (_, i) => `.${name}${i}(${name.toLowerCase()}[${i}])`).join(', ');
const bus = (name, n) => `.${name}(${name.toLowerCase()})`;
const ports = (inputs, outputs) => [...inputs.map(([p, n]) => `input ${n > 1 ? `[${n - 1}:0] ` : ''}${p}`), ...outputs.map(([p, n]) => `output ${n > 1 ? `[${n - 1}:0] ` : ''}${p}`)].join(', ');
const design = (prim, init, inputs, outputs, conns) => `module top(${ports(inputs, outputs)});\n  ${prim} ${init ? `#(${init}) ` : ''}u (${conns});\nendmodule\n`;
const hex = (bits, digit = 'A') => `${bits}'h${digit.repeat(bits / 4)}`;
const ram1 = (prim, n, dual, indexed, init = hex(1 << n)) => {
  const a = indexed ? bus('A', n) : pins('A', n), dp = indexed ? bus('DPRA', n) : pins('DPRA', n);
  return design(prim, `.INIT(${init})`, [['wclk', 1], ['we', 1], ['d', 1], ['a', n], ...(dual ? [['dpra', n]] : [])], dual ? [['spo', 1], ['dpo', 1]] : [['o', 1]],
    `.WCLK(wclk), .WE(we), .D(d), ${a}${dual ? `, ${dp}, .SPO(spo), .DPO(dpo)` : ', .O(o)'}`);
};
const ramM = (prim, n, w, inits = [0, 1, 2, 3].map(i => hex(64, '9ABC'[i]))) => {
  const P = ['A', 'B', 'C', 'D'];
  return design(prim, P.map((p, i) => `.INIT_${p}(${inits[i]})`).join(', '), [['wclk', 1], ['we', 1], ...P.flatMap(p => [[`addr${p.toLowerCase()}`, n], [`di${p.toLowerCase()}`, w]])], P.map(p => [`do${p.toLowerCase()}`, w]),
    `.WCLK(wclk), .WE(we), ${P.map(p => `.ADDR${p}(addr${p.toLowerCase()}), .DI${p}(di${p.toLowerCase()}), .DO${p}(do${p.toLowerCase()})`).join(', ')}`);
};
const addr = n => [...Array(n).keys()].map(i => `.A${i}(a[${i}])`).join(', ');
export const MEM_DESIGNS = {
  ram32x1s: ram1('RAM32X1S', 5, false), ram32x1d: ram1('RAM32X1D', 5, true),
  ram64x1s: ram1('RAM64X1S', 6, false), ram64x1d: ram1('RAM64X1D', 6, true),
  ram128x1s: ram1('RAM128X1S', 7, false), ram128x1d: ram1('RAM128X1D', 7, true, true), ram256x1s: ram1('RAM256X1S', 8, false, true),
  ram32m: ramM('RAM32M', 5, 2), ram64m: ramM('RAM64M', 6, 1),
  // (the contents told apart: which LUT holds which addresses, which bit a LUT's which input)
  ram32x1s_i: ram1('RAM32X1S', 5, false, false, "32'h000000F1"), ram32x1d_i: ram1('RAM32X1D', 5, true, false, "32'h000000F1"),
  ram64x1d_i: ram1('RAM64X1D', 6, true, false, "64'h00000000000000F1"),
  ram128x1s_i: ram1('RAM128X1S', 7, false, false, "128'h0000000000000003_0000000000000001"),
  ram128x1d_i: ram1('RAM128X1D', 7, true, true, "128'h0000000000000003_0000000000000001"),
  ram256x1s_i: ram1('RAM256X1S', 8, false, true, "256'h000000000000000F_0000000000000007_0000000000000003_0000000000000001"),
  ram32m_i: ramM('RAM32M', 5, 2, ["64'h0000000000000001", "64'h0000000000000002", "64'h0000000000000004", "64'h8000000000000000"]),
  ram64m_i: ramM('RAM64M', 6, 1, ["64'h0000000000000001", "64'h0000000000000003", "64'h0000000000000007", "64'h800000000000000F"]),
  srl16: design('SRL16', '.INIT(16\'hABCD)', [['clk', 1], ['d', 1], ['a', 4]], [['q', 1]], `.CLK(clk), .D(d), ${addr(4)}, .Q(q)`),
  srl16e: design('SRL16E', '.INIT(16\'hABCD)', [['clk', 1], ['ce', 1], ['d', 1], ['a', 4]], [['q', 1]], `.CLK(clk), .CE(ce), .D(d), ${addr(4)}, .Q(q)`),
  srlc16e: design('SRLC16E', '.INIT(16\'hABCD)', [['clk', 1], ['ce', 1], ['d', 1], ['a', 4]], [['q', 1], ['q15', 1]], `.CLK(clk), .CE(ce), .D(d), ${addr(4)}, .Q(q), .Q15(q15)`),
  srlc32e: design('SRLC32E', '.INIT(32\'h89ABCDEF)', [['clk', 1], ['ce', 1], ['d', 1], ['a', 5]], [['q', 1], ['q31', 1]], `.CLK(clk), .CE(ce), .D(d), .A(a), .Q(q), .Q31(q31)`),
};

if (process.argv[2]) {
  for (const [name, text] of Object.entries(MEM_DESIGNS)) {
    const d = join(process.argv[2], name);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'top.v'), text);
    writeFileSync(join(d, 'top.ucf'), '');
    writeFileSync(join(d, 'top.txt'), 'top\n');
  }
}
