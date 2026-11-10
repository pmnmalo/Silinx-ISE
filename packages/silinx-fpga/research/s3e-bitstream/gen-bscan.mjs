// #3176: designs of the JTAG's user access primitive, BSCAN_SPARTAN3 (the BSCAN site of the top-right corner tile, UR),
// to be implemented by ISE from HDL (ise-impl.sh, impl-remote.sh): which switches of the corner tile take its outputs
// into the fabric (CNR_D_O_FAN_B* -> OMUX / the double and hex lines) and its TDO inputs from it (CNR_DATA_IN*), then
// measured by PIP drop (measure-3176.sh). Every output of the BSCAN (CAPTURE, DRCK1, DRCK2, RESET, SEL1, SEL2,
// SHIFT, TDI, UPDATE) is sampled by a flip-flop of the design's clock; DRCK1 and DRCK2 also clock a shift register
// of their own (on a global buffer, as the logic analyzer's core uses DRCK1, #3176) that TDO1 and TDO2 read. The
// flip-flops of each design are kept to a region of the chip (AREA_GROUP), a different one per design, so that ISE
// routes the corner's pins different ways. The design `core`: the logic analyzer's capture core itself (core/ila.js, 16
// probes of a counter, 1024 samples) on BSCAN_SPARTAN3's USER1, as Implement inserts it.
//   node gen-bscan.mjs outdir [part]      (part: xc3s250e (default) or xc3s100e, xc3s500e, xc3s1200e)
import fs from 'node:fs';
import { captureModule } from '../../../../core/ila.js';

const [out, part = 'xc3s250e'] = process.argv.slice(2);
// the slices of each part (SLICE_X0Y0 .. X(W-1)Y(H-1)); the clock pin B8 in both packages (the Basys2's, the Nexys2's)
const GRID = { xc3s100e: [32, 44], xc3s250e: [52, 68], xc3s500e: [68, 92], xc3s1200e: [92, 120] };
const [W, H] = GRID[part];
const clkPin = 'B8';
// the regions: near the corner, the top left, the bottom right, the bottom left, the centre (slice ranges)
const box = (x0, y0, x1, y1) => `SLICE_X${x0}Y${y0}:SLICE_X${x1}Y${y1}`;
const REGIONS = {
  near: box(W - 8, H - 8, W - 1, H - 1),
  topleft: box(0, H - 8, 7, H - 1),
  botright: box(W - 8, 0, W - 1, 7),
  botleft: box(0, 0, 7, 7),
  centre: box(W / 2 - 4, H / 2 - 4, W / 2 + 3, H / 2 + 3),
};
const OUTS = ['CAPTURE', 'DRCK1', 'DRCK2', 'RESET', 'SEL1', 'SEL2', 'SHIFT', 'TDI', 'UPDATE'];

const v = `// #3176 (gen-bscan.mjs): every output of BSCAN_SPARTAN3 sampled on clk; DRCK1 and DRCK2 clock shift registers that
// TDO1 and TDO2 read
module top (input clk, input d, output q);
  wire capture, drck1, drck2, reset, sel1, sel2, shift, tdi, update, tdo1, tdo2;
  BSCAN_SPARTAN3 u_bscan (.CAPTURE(capture), .DRCK1(drck1), .DRCK2(drck2), .RESET(reset), .SEL1(sel1), .SEL2(sel2),
    .SHIFT(shift), .TDI(tdi), .UPDATE(update), .TDO1(tdo1), .TDO2(tdo2));
  (* KEEP = "TRUE" *) reg [${OUTS.length - 1}:0] s0 = 0, s1 = 0;
  always @(posedge clk) begin s0 <= {${OUTS.slice().reverse().map(o => o.toLowerCase()).join(', ')}}; s1 <= s0 ^ {${OUTS.length}{d}}; end
  reg [7:0] r1 = 0, r2 = 0;
  always @(posedge drck1) if (sel1 && shift) r1 <= {tdi, r1[7:1]};
  always @(posedge drck2) if (sel2 && shift) r2 <= {tdi ^ capture, r2[7:1]};
  assign tdo1 = r1[0];
  assign tdo2 = r2[0];
  assign q = ^s1 ^ r1[7] ^ r2[7];
endmodule
`;
const names = [];
for (const [name, region] of Object.entries(REGIONS)) {
  const ucf = [`NET "clk" LOC = "${clkPin}" ;`, 'INST "s0*" AREA_GROUP = "AG" ;', 'INST "s1*" AREA_GROUP = "AG" ;', 'INST "r1*" AREA_GROUP = "AG" ;',
    'INST "r2*" AREA_GROUP = "AG" ;', `AREA_GROUP "AG" RANGE = ${region} ;`].join('\n') + '\n';
  fs.mkdirSync(`${out}/${name}`, { recursive: true });
  fs.writeFileSync(`${out}/${name}/top.v`, v);
  fs.writeFileSync(`${out}/${name}/top.ucf`, ucf);
  names.push(name);
}
// the capture core on USER1 (TDO2 tied low), its probes a counter's low bits
const spec = { wizard: 'capture', version: 1, name: 'silinx_capture', lang: 'verilog', family: 'spartan3e', depth: 1024, pre: 64,
  probes: [{ name: 'count', width: 16 }], trigger: { combine: 'and', conditions: [{ probe: 'count', op: '=', value: 1000 }] } };
fs.mkdirSync(`${out}/core`, { recursive: true });
fs.writeFileSync(`${out}/core/top.v`, `// #3176 (gen-bscan.mjs): the logic analyzer's capture core on BSCAN_SPARTAN3's USER1
module top (input clk, output [7:0] led);
  reg [23:0] n = 0;
  always @(posedge clk) n <= n + 1;
  assign led = n[23:16];
  wire tck, sel, capture, shift, tdi, tdo;
  BSCAN_SPARTAN3 silinx_bscan (.DRCK1(tck), .SEL1(sel), .CAPTURE(capture), .SHIFT(shift), .TDI(tdi), .TDO1(tdo), .TDO2(1'b0));
  silinx_capture silinx_ila (.clk(clk), .probe(n[15:0]), .tck(tck), .sel(sel), .capture(capture), .shift(shift), .tdi(tdi), .tdo(tdo));
endmodule
`);
fs.writeFileSync(`${out}/core/silinx_capture.v`, captureModule(spec).code);
fs.writeFileSync(`${out}/core/top.ucf`, `NET "clk" LOC = "${clkPin}" ;\n`);
names.push('core');
console.log(names.join(' '));
