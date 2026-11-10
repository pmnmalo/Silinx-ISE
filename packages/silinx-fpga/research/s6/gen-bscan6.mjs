// #3176: designs of the JTAG's user access primitive of the Spartan-6, BSCAN_SPARTAN6 (four sites in the top-right
// corner's tiles UR_UPPER and UR_LOWER, one per JTAG_CHAIN 1-4), to be implemented by ISE from HDL (ise-s6.sh impl):
// the PIPs of the corner tiles that take its outputs into the fabric and its TDO from it, then measured by PIP drop
// (gen-pipdrop6.mjs, ise-xdl-bits.sh, ana-pipdrop6.mjs; measure-3176-s6.sh). In each design one BSCAN, of the chain
// given, its outputs (CAPTURE, DRCK, RESET, RUNTEST, SEL, SHIFT, TCK, TDI, TMS, UPDATE) sampled by flip-flops of the
// design's clock, DRCK clocking a shift register (on a global buffer, as the logic analyzer's core uses it) that TDO
// reads. Designs c1-c4: the four chains, the logic placed by ISE; f1: chain 1 with the logic far from the corner
// (AREA_GROUP at the bottom left, from SLICE_X0Y2: the first row whose corner slice both parts have), so that ISE
// routes its pins another way.
//   node research/s6/gen-bscan6.mjs <out dir> [part]     (part: xc6slx16-csg324-3 (default) or xc6slx45-csg324-3)
import fs from 'node:fs';

const [out, part = 'xc6slx16-csg324-3'] = process.argv.slice(2);
const OUTS = ['CAPTURE', 'DRCK', 'RESET', 'RUNTEST', 'SEL', 'SHIFT', 'TCK', 'TDI', 'TMS', 'UPDATE'];
const v = chain => `// #3176 (gen-bscan6.mjs): BSCAN_SPARTAN6, JTAG_CHAIN ${chain}: every output sampled on clk; DRCK clocks a shift
// register that TDO reads
module top (input clk, input d, output q);
  wire ${OUTS.map(o => o.toLowerCase()).join(', ')}, tdo;
  BSCAN_SPARTAN6 #(.JTAG_CHAIN(${chain})) u_bscan (${OUTS.map(o => `.${o}(${o.toLowerCase()})`).join(', ')}, .TDO(tdo));
  (* KEEP = "TRUE" *) reg [${OUTS.length - 1}:0] s0 = 0, s1 = 0;
  always @(posedge clk) begin s0 <= {${OUTS.slice().reverse().map(o => o.toLowerCase()).join(', ')}}; s1 <= s0 ^ {${OUTS.length}{d}}; end
  reg [7:0] r = 0;
  always @(posedge drck) if (sel && shift) r <= {tdi ^ capture, r[7:1]};
  assign tdo = r[0];
  assign q = ^s1 ^ r[7];
endmodule
`;
// the clock pin: the Nexys3's and the Atlys's 100 MHz oscillator (V10 on the XC6SLX16 CSG324, L15 on the XC6SLX45's)
const clkPin = /lx45/.test(part) ? 'L15' : 'V10';
const designs = { c1: [1, null], c2: [2, null], c3: [3, null], c4: [4, null], f1: [1, 'SLICE_X0Y2:SLICE_X7Y9'] };
for (const [name, [chain, region]] of Object.entries(designs)) {
  const ucf = [`NET "clk" LOC = "${clkPin}" ;`, ...(region ? ['INST "s0*" AREA_GROUP = "AG" ;', 'INST "s1*" AREA_GROUP = "AG" ;', 'INST "r*" AREA_GROUP = "AG" ;', `AREA_GROUP "AG" RANGE = ${region} ;`] : [])].join('\n') + '\n';
  fs.mkdirSync(`${out}/${name}`, { recursive: true });
  fs.writeFileSync(`${out}/${name}/top.v`, v(chain));
  fs.writeFileSync(`${out}/${name}/top.ucf`, ucf);
  fs.writeFileSync(`${out}/${name}/top.txt`, 'top\n');
}
console.log(Object.keys(designs).join(' '));
