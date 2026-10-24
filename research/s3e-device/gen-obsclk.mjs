// #3, the irregular tiles: observation designs for the global clock network (BUFGMUX -> spines -> GCLKH -> the tiles'
// GCLK lines). A clock net's undriven clock wires have as candidates every clock wire of the net in other tiles, and a
// net that reaches the whole chip has them all; nets that each reach a random part of it leave, in the intersection over
// the designs (prototype.mjs observe, INTERSECT=1), the one wire that drives each. Each design: 8 global clocks (the top
// and bottom BUFGMUX, LOC'd: one line each), each clocking flip-flops (FD, LOC'd) in every CLB tile of a random half of
// the clock cells (a CLB column by a band of rows between the GCLKH rows), one slice per clock, at most 4 clocks a tile;
// each clock's flip-flops a chain from a data input, their ends into the output.
//   node gen-obsclk.mjs outdir [designs=6] [seed=1]      (folders clk0, clk1…: top.v, top.ucf)
import fs from 'node:fs';
import { loadDeviceCache } from '../../core/fpga/device-node.js';
import { clbSlices } from './gen-observe.mjs';

const PART = process.env.PART || 'xc3s250ecp132-4';
const xy = n => n.match(/X(\d+)Y(\d+)$/).slice(1).map(Number);

/** One design: { v, ucf, cells: { [line]: ['x,band'] } }. rnd: a function of [0, 1). */
export function clockDesign(dev, rnd, part = PART) {
  const clbs = dev.tileNames.filter(n => /^CLB_X\d+Y\d+$/.test(n));
  const rows = [...new Set(dev.tileNames.filter(n => /^GCLKH_X/.test(n)).map(n => xy(n)[1]))].sort((a, b) => a - b);
  // (a band: the rows nearer one GCLKH row than the others)
  const band = y => rows.reduce((b, r, i) => (Math.abs(y - r) < Math.abs(y - rows[b]) ? i : b), 0);
  const bufs = dev.sites('BUFGMUX').map(s => s.name).filter(s => /^BUFGMUX_X[12]Y(0|1|10|11)$/.test(s)).sort();
  const used = new Map(), cells = {}, ffs = bufs.map(() => []);
  bufs.forEach((b, k) => {
    const pick = new Set();
    for (const x of new Set(clbs.map(t => xy(t)[0]))) for (let i = 0; i < rows.length; i++) if (rnd() < 0.5) pick.add(`${x},${i}`);
    cells[k] = [...pick].sort();
    for (const t of clbs) {
      const [x, y] = xy(t);
      if (!pick.has(`${x},${band(y)}`)) continue;
      const n = used.get(t) || 0;
      if (n >= 4) continue;
      used.set(t, n + 1);
      ffs[k].push(clbSlices(t)[n]);
    }
  });
  const body = ffs.map((list, k) => list.map((s, i) => `  FD r${k}_${i} (.C(g[${k}]), .D(${i ? `q${k}[${i - 1}]` : 'd'}), .Q(q${k}[${i}]));`).join('\n')).join('\n');
  const v = `// ${part}: 8 global clocks, each on the flip-flops of a random half of the clock cells (#3, the clock network:
// research/s3e-device gen-obsclk.mjs)
module top(input [7:0] c, input d, output o);
  wire [7:0] g;
${bufs.map((b, k) => `  BUFG u_b${k} (.I(c[${k}]), .O(g[${k}]));`).join('\n')}
${ffs.map((l, k) => `  wire [${Math.max(l.length, 1) - 1}:0] q${k};`).join('\n')}
${body}
  assign o = ${ffs.map((l, k) => (l.length ? `q${k}[${l.length - 1}]` : "1'b0")).join(' ^ ')};
endmodule
`;
  const ucf = [...bufs.map((b, k) => `INST "u_b${k}" LOC = "${b}" ;\nNET "c<${k}>" CLOCK_DEDICATED_ROUTE = FALSE ;`),
    ...ffs.flatMap((l, k) => l.map((s, i) => `INST "r${k}_${i}" LOC = "${s}" ;`))].join('\n') + '\n';
  return { v, ucf, cells, ffs: ffs.map(l => l.length) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [out, n = '6', seed0 = '1'] = process.argv.slice(2);
  let seed = +seed0;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
  const dev = loadDeviceCache(PART);
  for (let i = 0; i < +n; i++) {
    const { v, ucf, ffs } = clockDesign(dev, rnd);
    fs.mkdirSync(`${out}/clk${i}`, { recursive: true });
    fs.writeFileSync(`${out}/clk${i}/top.v`, v);
    fs.writeFileSync(`${out}/clk${i}/top.ucf`, ucf);
    console.log(`clk${i}: ${ffs.join(' ')} flip-flops on the 8 clocks`);
  }
}
