// Observation designs for the joins round 4 left untestable (README.md, step 1, round 5): HDL that ISE implements
// (impl-remote.sh), so that its routes drive every block RAM's outputs, every multiplier's outputs and every pad's
// input, the sources the join tests of the I/O and block-RAM switch boxes need (prototype.mjs tests with SOURCES=1).
//   bram: every RAMB16 (LOC'd) with every data and parity output into the logic (a tree of XORs, a register per bit);
//   mult: every MULT18X18SIO (LOC'd), every output bit into the logic;
//   pads: as many pads as the package has, each an input into the logic (the bidirectional ones also driven, their
//         enable from a register), placed by ISE.
//   inputs (round 8, --inputs n): n pads, every one an input into the logic (an XOR of them all into one register), for a
//         package that bonds the pads the others leave unbonded (the XC3S250E's FT256: its I/O tiles with no pad in the
//         CP132), placed by ISE.
//   PART=xc3s250ecp132-4 node gen-obshdl.mjs outdir [pads] [inputs]   (folders bram, mult, pads: top.v, top.ucf; by default
//                                                     padDefaults: the XC3S250E-CP132's 90 and 24)
//   node gen-obshdl.mjs outdir --inputs 171                                 (folder inputs)
import fs from 'node:fs';
import { loadDeviceCache } from '../../src/fpga/device-node.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PART = process.env.PART || 'xc3s250ecp132-4';
const sitesOf = (dev, type) => dev.sites(type).map(s => s.name).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

// a register per output bit, the bits reduced to a few output pads
const reduce = (bits, n) => Array.from({ length: n }, (_, k) => bits.filter((b, i) => i % n === k).join(' ^ ') || "1'b0");

/** Every block RAM (LOC'd) with every output into the logic: { v, ucf }. */
export function bram(dev, part = PART) {
  const rams = sitesOf(dev, 'RAMB16');
  const body = rams.map((s, i) => `  wire [15:0] do${i}; wire [1:0] dp${i};
  RAMB16_S18 #(.INIT_00(256'h${(i + 1).toString(16).padStart(64, '0')})) u${i} (.CLK(clk), .EN(1'b1), .WE(we), .SSR(1'b0),
    .ADDR(a ^ 10'd${(i * 37) % 1024}), .DI(d ^ 16'd${i}), .DIP(d[1:0]), .DO(do${i}), .DOP(dp${i}));`).join('\n');
  const bits = rams.flatMap((s, i) => [...Array.from({ length: 16 }, (_, b) => `r${i}[${b}]`), `r${i}[16]`, `r${i}[17]`]);
  const v = `// ${part}: every block RAM's outputs into the logic (#3, research/s3e-device gen-obshdl.mjs)
module top(input clk, input we, input [9:0] a, input [15:0] d, output reg [7:0] q);
${body}
${rams.map((s, i) => `  reg [17:0] r${i};`).join('\n')}
  always @(posedge clk) begin
${rams.map((s, i) => `    r${i} <= {dp${i}, do${i}};`).join('\n')}
${reduce(bits, 8).map((e, k) => `    q[${k}] <= ${e};`).join('\n')}
  end
endmodule
`;
  return { v, ucf: rams.map((s, i) => `INST "u${i}" LOC = "${s}" ;`).join('\n') + '\n' };
}

/** Every multiplier (LOC'd) with every output into the logic: { v, ucf }. */
export function mult(dev, part = PART) {
  const ms = sitesOf(dev, 'MULT18X18SIO');
  const body = ms.map((s, i) => `  wire [35:0] p${i};
  MULT18X18SIO #(.AREG(0), .BREG(0), .PREG(1), .B_INPUT("DIRECT")) u${i} (.CLK(clk), .CEA(1'b0), .CEB(1'b0), .CEP(1'b1),
    .RSTA(1'b0), .RSTB(1'b0), .RSTP(1'b0), .A(a ^ 18'd${i}), .B(b ^ 18'd${i * 3}), .BCIN(18'd0), .P(p${i}), .BCOUT());`).join('\n');
  const bits = ms.flatMap((s, i) => Array.from({ length: 36 }, (_, b) => `r${i}[${b}]`));
  const v = `// ${part}: every multiplier's outputs into the logic (#3, research/s3e-device gen-obshdl.mjs)
module top(input clk, input [17:0] a, input [17:0] b, output reg [7:0] q);
${body}
${ms.map((s, i) => `  reg [35:0] r${i};`).join('\n')}
  always @(posedge clk) begin
${ms.map((s, i) => `    r${i} <= p${i};`).join('\n')}
${reduce(bits, 8).map((e, k) => `    q[${k}] <= ${e};`).join('\n')}
  end
endmodule
`;
  return { v, ucf: ms.map((s, i) => `INST "u${i}" LOC = "${s}" ;`).join('\n') + '\n' };
}

/** npads pads (ninputs inputs, the clock, the rest bidirectional), each an input into the logic: { v, ucf }. */
export function pads(npads = 90, ninputs = 24, part = PART) {
  const nb = npads - ninputs - 1, ni = ninputs;
  const v = `// ${part}: ${npads} pads, each an input into the logic (#3, research/s3e-device gen-obshdl.mjs)
module top(input clk, input [${ni - 1}:0] i, inout [${nb - 1}:0] p);
  reg [${nb - 1}:0] o = 0, oe = 0;
  wire [${nb - 1}:0] pin = p;
  always @(posedge clk) begin
    o <= {o[${nb - 2}:0], ^i} ^ pin;
    oe <= {oe[${nb - 2}:0], i[0]} ^ {pin[${nb - 2}:0], pin[${nb - 1}]};
  end
  genvar k;
  generate for (k = 0; k < ${nb}; k = k + 1) begin : g
    assign p[k] = oe[k] ? o[k] : 1'bz;
  end endgenerate
endmodule
`;
  return { v, ucf: '' };
}

/** The pads design's size on a device (pads()): every bonded pad but two, and enough plain inputs that the inout ones
 *  fit the bidirectional pads (an input-only pad, IBUF / DIFFMI / DIFFSI, takes no output): { npads, ninputs, bonded,
 *  bidir }. */
export function padDefaults(dev) {
  let bonded = 0, bidir = 0;
  for (let k = 0; k < dev.tileCount; k++) dev.tileSites[k].forEach(([, b], i) => {
    const ty = dev.templates[dev.tileTemplate[k]].sites[i].type;
    if (b !== 1 || !/^(IOB|IBUF|DIFF[MS]I?)$/.test(ty)) return;
    bonded++;
    if (!/^(IBUF|DIFF[MS]I)$/.test(ty)) bidir++;
  });
  const npads = bonded - 2;
  return { npads, ninputs: Math.max(24, npads - 1 - bidir), bonded, bidir };
}

/** n pads, every one an input (no register in its IOB: the XOR of them all into one register): { v, ucf }. */
export function inputs(n, part = PART) {
  const v = `// ${part}: ${n} pads, each an input into the logic (#3 round 8, research/s3e-device gen-obshdl.mjs)
module top(input clk, input [${n - 1}:0] i, output reg q);
  always @(posedge clk) q <= ^i;
endmodule
`;
  return { v, ucf: '' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2), ii = argv.indexOf('--inputs');
  if (ii >= 0) {
    const { v, ucf } = inputs(+argv[ii + 1]);
    fs.mkdirSync(`${argv[0]}/inputs`, { recursive: true });
    fs.writeFileSync(`${argv[0]}/inputs/top.v`, v);
    fs.writeFileSync(`${argv[0]}/inputs/top.ucf`, ucf);
    console.log(`${PART}: ${argv[ii + 1]} inputs`);
    process.exit(0);
  }
  const dev = loadDeviceCache(PART), def = padDefaults(dev);
  const [out, npads = def.npads, ninputs = def.ninputs] = argv;
  for (const [name, f] of [['bram', () => bram(dev)], ['mult', () => mult(dev)], ['pads', () => pads(+npads, +ninputs)]]) {
    const { v, ucf } = f();
    fs.mkdirSync(`${out}/${name}`, { recursive: true });
    fs.writeFileSync(`${out}/${name}/top.v`, v);
    fs.writeFileSync(`${out}/${name}/top.ucf`, ucf);
  }
  console.log(`${PART}: ${sitesOf(dev, 'RAMB16').length} block RAMs, ${sitesOf(dev, 'MULT18X18SIO').length} multipliers, ${npads} pads (${ninputs} inputs)`);
}
