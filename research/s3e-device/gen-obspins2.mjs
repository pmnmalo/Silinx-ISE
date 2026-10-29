// #3, the measured description: observation designs for the pins the measured graph still lacks, implemented by ISE from
// HDL (impl-remote.sh). Each is a pin on a dedicated connection the earlier designs never took, or took with another sink
// of its net in the same tile (observe.mjs reads a sink pin only when it is its net's one sink there):
//   srlcasc:  a 64-bit shift register in every CLB (AREA_GROUP: its four slices): map cascades the SLICEMs' SRL16s
//             through SHIFTOUT -> SHIFTIN
//   f8-RC:    a 32:1 multiplexer in every pair of CLBs one above the other (MUXF8: FXINA / FXINB from the two F7s), the
//             pairs from row R (0, 1), in the CLB columns of parity C
//   ramclkb:  every block RAM (LOC'd) a RAMB16_S1_S1 with port B on a clock of its own (CLKB its net's one sink there)
//   bufg-l0/l1/r0/…: the BUFGMUXes of one clock tile at even or odd places (LOC'd), I0, I1 and S on signals of their
//             own, O a clock
//   dcmpads:  every DCM (LOC'd) fed from the clock pad ISE gives it (packages/silinx-fpga/src/fpga/place.js DCM_PAD) through an IBUFG, its
//             CLK0 on a global buffer clocking a counter: the pads' dedicated paths to the DCMs
//   node gen-obspins2.mjs outdir      (folders srlcasc, f8-00 … f8-11, ramclkb, bufg-l0 … bufg-b1, dcmpads)
import fs from 'node:fs';
import { loadDeviceCache } from '../../packages/silinx-fpga/src/fpga/device-node.js';
import { wrap } from './gen-obspins.mjs';
import { DCM_PAD } from '../../packages/silinx-fpga/src/fpga/place.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PART = process.env.PART || 'xc3s250ecp132-4';
const xy = s => s.match(/X(\d+)Y(\d+)$/).slice(1).map(Number);
const sitesOf = (dev, type) => dev.sites(type).map(s => s.name).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

/** The CLBs as their lower-left slice's x, y (the SLICEM's: x even, y even), with all four slices present. */
function clbs(dev) {
  const have = new Set([...dev.sites('SLICEL'), ...dev.sites('SLICEM')].map(s => s.name));
  const out = [];
  for (const s of have) {
    const [x, y] = xy(s);
    if (x % 2 || y % 2) continue;
    if ([[1, 0], [0, 1], [1, 1]].every(([a, b]) => have.has(`SLICE_X${x + a}Y${y + b}`))) out.push([x, y]);
  }
  return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** A 64-bit shift register in every CLB, each its own input and output: { v, ucf, n }. */
export function srlCascade(dev, part = PART) {
  const cs = clbs(dev);
  const body = cs.map((c, i) => `  wire r${i};\n  srl64 u${i} (.clk(clk), .d(s[${i}]), .q(r${i}));`).join('\n');
  const v = `(* KEEP_HIERARCHY = "TRUE" *)
module srl64(input clk, input d, output q);
  reg [63:0] r = 0;
  always @(posedge clk) r <= {r[62:0], d};
  assign q = r[63];
endmodule

` + wrap(part, 'a 64-bit shift register in every CLB (SHIFTOUT -> SHIFTIN)', cs.length + 8, '', body, cs.map((c, i) => `r${i}`));
  const ucf = cs.map(([x, y], i) => `INST "u${i}" AREA_GROUP = "ag${i}" ;\nAREA_GROUP "ag${i}" RANGE = SLICE_X${x}Y${y}:SLICE_X${x + 1}Y${y + 1} ;`).join('\n') + '\n';
  return { v, ucf, n: cs.length };
}

/** A 32:1 multiplexer in every pair of CLBs one above the other from row `off` (0 or 1), in the CLB columns of parity
 *  `col` (all of them overfill the SLICELs), each with its data and selects permuted (or XST merges them): { v, ucf, n }. */
export function f8Muxes(dev, off, col, part = PART) {
  const have = new Set(clbs(dev).map(c => c.join(',')));
  const pairs = clbs(dev).filter(([x, y]) => (y / 2) % 2 === off && (x / 2) % 2 === col && have.has(`${x},${y + 2}`));
  // (data d[0..31] and selects d[32..36] of s: the data rotated by i, the selects the (i / 32)-th permutation of five: every
  // multiplexer its own pair, or XST merges the equal ones)
  const perms = [];
  const perm = (a, l = []) => { if (!a.length) perms.push(l); a.forEach((x, j) => perm([...a.slice(0, j), ...a.slice(j + 1)], [...l, x])); };
  perm([0, 1, 2, 3, 4]);
  const body = pairs.map((p, i) => {
    const data = Array.from({ length: 32 }, (_, k) => `s[${(k + i) % 32}]`).reverse().join(', ');
    const sel = perms[(i >> 5) % perms.length].map(k => `s[${32 + k}]`).reverse().join(', ');
    return `  wire m${i};\n  mux32 u${i} (.d({${data}}), .s({${sel}}), .o(m${i}));`;
  }).join('\n');
  const v = `(* KEEP_HIERARCHY = "TRUE" *)
module mux32(input [31:0] d, input [4:0] s, output o);
  assign o = d[s];
endmodule

` + wrap(part, `a 32:1 multiplexer (MUXF8) in every pair of CLBs from row ${off}, CLB columns of parity ${col}`, 40, '', body, pairs.map((p, i) => `m${i}`));
  const ucf = pairs.map(([x, y], i) => `INST "u${i}" AREA_GROUP = "ag${i}" ;\nAREA_GROUP "ag${i}" RANGE = SLICE_X${x}Y${y}:SLICE_X${x + 1}Y${y + 3} ;`).join('\n') + '\n';
  return { v, ucf, n: pairs.length };
}

/** Every block RAM a RAMB16_S1_S1, port A on clk, port B on clk2 (a second global clock): { v, ucf, n }. */
export function ramClkB(dev, part = PART) {
  const rams = sitesOf(dev, 'RAMB16');
  let k = 0;
  const sig = w => { const a = k; k += w; return w === 1 ? `s[${a}]` : `s[${a + w - 1}:${a}]`; };
  const body = rams.map((s, i) => {
    const port = (p, c) => `.CLK${p}(${c}), .ADDR${p}(${sig(14)}), .DI${p}(${sig(1)}), .WE${p}(${sig(1)}), .EN${p}(${sig(1)}), .SSR${p}(${sig(1)}), .DO${p}(o${i}${p})`;
    return `  wire o${i}A, o${i}B;\n  RAMB16_S1_S1 u${i} (${port('A', 'clk')},\n    ${port('B', 'ck2')});`;
  }).join('\n');
  const v = wrap(part, 'every block RAM a RAMB16_S1_S1, port B on a clock of its own', rams.length * 36 + 8, ', input clk2', body,
    rams.flatMap((s, i) => [`o${i}A`, `o${i}B`]), '  wire ck2;\n  BUFG u_c2 (.I(clk2), .O(ck2));\n');
  return { v, ucf: rams.map((s, i) => `INST "u${i}" LOC = "${s}" ;`).join('\n') + '\n', n: rams.length };
}

/** The BUFGMUXes of the clock tile with prefix `prefix` (CLKL, CLKR, CLKT, CLKB) at even or odd places (`odd`: two
 *  neighbours share their inputs, a selectable mux in both is unroutable), LOC'd, their inputs and select on signals of
 *  their own, each output the clock of a register: { v, ucf, n }. */
export function bufgs(dev, prefix, odd, part = PART) {
  const sites = sitesOf(dev, 'BUFGMUX').filter(s => dev.tileNames[dev.site(s).tile].startsWith(`${prefix}_`)).filter((s, i) => i % 2 === odd);
  const body = sites.map((s, i) => `  wire g${i}; reg r${i} = 0;
  BUFGMUX u${i} (.I0(s[${3 * i}]), .I1(s[${3 * i + 1}]), .S(s[${3 * i + 2}]), .O(g${i}));
  always @(posedge g${i}) r${i} <= s[${3 * i + 3}];`).join('\n');
  const v = wrap(part, `every BUFGMUX of the ${prefix} tile, every pin used`, 3 * sites.length + 9, '', body, sites.map((s, i) => `r${i}`));
  return { v, ucf: sites.map((s, i) => `INST "u${i}" LOC = "${s}" ;`).join('\n') + '\n', n: sites.length };
}

/** Every DCM of the part fed from the clock pad ISE gives it (DCM_PAD) through an IBUFG, its CLK0 on a BUFG clocking a
 *  counter: { v, ucf, n }. */
export function dcmPads(part = PART) {
  const pads = Object.entries(DCM_PAD[part.replace(/(cp|fg|vq|tq|pq|ft)\d+-\d+$/, '')] || {});
  const v = `// ${part}: every DCM fed from its clock pad through an IBUFG, its CLK0 on a global buffer clocking a counter (#3,
// the pads' dedicated paths to the DCMs: research/s3e-device gen-obspins2.mjs)
module top(input [${pads.length - 1}:0] c, output [${pads.length - 1}:0] q);
  genvar k;
  generate for (k = 0; k < ${pads.length}; k = k + 1) begin : g
    wire i, d, fb;
    reg [7:0] n = 0;
    IBUFG ub (.I(c[k]), .O(i));
    DCM_SP #(.CLKIN_PERIOD(20.0), .CLK_FEEDBACK("1X")) ud (.CLKIN(i), .CLKFB(fb), .RST(1'b0), .PSEN(1'b0), .PSINCDEC(1'b0), .PSCLK(1'b0), .DSSEN(1'b0), .CLK0(d));
    BUFG ug (.I(d), .O(fb));
    always @(posedge fb) n <= n + 1;
    assign q[k] = n[7];
  end endgenerate
endmodule
`;
  const ucf = pads.map(([dcm, pad], k) => `NET "c<${k}>" LOC = "${pad}" ;\nINST "g[${k}].ud" LOC = "${dcm}" ;`).join('\n') + '\n';
  return { v, ucf, n: pads.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [out] = process.argv.slice(2);
  const dev = loadDeviceCache(PART);
  const designs = [['srlcasc', () => srlCascade(dev)], ...[0, 1].flatMap(o => [0, 1].map(c => [`f8-${o}${c}`, () => f8Muxes(dev, o, c)])), ['ramclkb', () => ramClkB(dev)],
    ...['CLKL', 'CLKR', 'CLKT', 'CLKB'].flatMap(p => [0, 1].map(o => [`bufg-${p.slice(3).toLowerCase()}${o}`, () => bufgs(dev, p, o)])), ['dcmpads', () => dcmPads()]];
  for (const [name, f] of designs) {
    const { v, ucf, n } = f();
    fs.mkdirSync(`${out}/${name}`, { recursive: true });
    fs.writeFileSync(`${out}/${name}/top.v`, v);
    fs.writeFileSync(`${out}/${name}/top.ucf`, ucf);
    console.log(`${name}: ${n}`);
  }
}
