// #3, the measured description: observation designs of the carry chain, implemented by ISE from HDL (impl-remote.sh).
// ISE's routes put the counters it maps in the SLICEL columns, so the SLICEM columns' carry pins were never seen, and the
// open flow places its chains in either. Here 32-bit counters, each confined (AREA_GROUP) to 16 slices of one slice
// column, every CLB column's SLICEM (x even) or SLICEL (x odd) column in bands of 16 slices from offset `off`: each chain
// crosses 7 tile boundaries (COUT -> COUT_Nk -> the next tile's lower CIN), every boundary inside a band once the two
// offsets (0, 8) are run. Each counter has a step of its own (odd: the whole chain used), or XST merges those of one
// enable; the hierarchy kept, for the AREA_GROUP.
//   node gen-obscarry.mjs outdir      (folders carry-m0, carry-m8, carry-l0, carry-l8: top.v, top.ucf)
import fs from 'node:fs';
import { loadDeviceCache } from '../../src/fpga/device-node.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PART = process.env.PART || 'xc3s250ecp132-4';

/** One design: the slice column parity (0: SLICEM, 1: SLICEL), the band offset: { v, ucf, counters }. */
export function carryDesign(dev, parity, off, part = PART) {
  // the slice columns of that parity, each with its rows (a CLB column may lack some, next to the block RAMs)
  const cols = new Map();
  for (const s of [...dev.sites('SLICEL'), ...dev.sites('SLICEM')]) {
    const [x, y] = s.name.match(/X(\d+)Y(\d+)$/).slice(1).map(Number);
    if (x % 2 !== parity) continue;
    if (!cols.has(x)) cols.set(x, new Set());
    cols.get(x).add(y);
  }
  const groups = [];
  for (const [x, ys] of [...cols].sort((a, b) => a[0] - b[0])) {
    // bands of 16 consecutive slices, all present
    for (let y0 = off; y0 + 15 <= Math.max(...ys); y0 += 16) {
      let ok = true;
      for (let y = y0; y < y0 + 16; y++) if (!ys.has(y)) ok = false;
      if (ok) groups.push({ x, y0 });
    }
  }
  const v = `// ${part}: 32-bit counters, each in 16 slices of one ${parity ? 'SLICEL' : 'SLICEM'} column (#3, the carry chain:
// research/s3e-device gen-obscarry.mjs)
(* KEEP_HIERARCHY = "TRUE" *)
module counter #(parameter STEP = 1) (input clk, input en, output [31:0] q);
  reg [31:0] c = 0;
  always @(posedge clk) if (en) c <= c + STEP;
  assign q = c;
endmodule

module top(input clk, input [7:0] en, output reg [7:0] o);
${groups.map((g, i) => `  wire [31:0] q${i};\n  counter #(.STEP(${2 * i + 1})) c${i} (.clk(clk), .en(en[${i % 8}]), .q(q${i}));`).join('\n')}
  always @(posedge clk) begin
${Array.from({ length: 8 }, (_, k) => `    o[${k}] <= ${groups.map((g, i) => i).filter(i => i % 8 === k).map(i => `q${i}[31]`).join(' ^ ') || "1'b0"};`).join('\n')}
  end
endmodule
`;
  const ucf = groups.map((g, i) => `INST "c${i}" AREA_GROUP = "ag${i}" ;\nAREA_GROUP "ag${i}" RANGE = SLICE_X${g.x}Y${g.y0}:SLICE_X${g.x}Y${g.y0 + 15} ;`).join('\n') + '\n';
  return { v, ucf, counters: groups.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [out] = process.argv.slice(2);
  const dev = loadDeviceCache(PART);
  for (const [name, parity, off] of [['carry-m0', 0, 0], ['carry-m8', 0, 8], ['carry-l0', 1, 0], ['carry-l8', 1, 8]]) {
    const { v, ucf, counters } = carryDesign(dev, parity, off);
    fs.mkdirSync(`${out}/${name}`, { recursive: true });
    fs.writeFileSync(`${out}/${name}/top.v`, v);
    fs.writeFileSync(`${out}/${name}/top.ucf`, ucf);
    console.log(`${name}: ${counters} counters`);
  }
}
