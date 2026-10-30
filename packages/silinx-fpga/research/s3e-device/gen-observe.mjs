// Designs for ISE to route (par -p keeps the placement): random nets between the slices of the
// CLB tiles, to observe which PIPs and joins ISE's router uses (observe.mjs).
//   node research/s3e-device/gen-observe.mjs clb-tiles.txt out-dir [designs=4] [seed=1] [fraction=1] [part]
// clb-tiles.txt: the CLB tiles (one name per line, e.g. from the tile probe). Every slice of the
// CLBs used (a random `fraction` of them) has LUTs F and G with all four inputs, outputs X and Y
// (a full chip keeps ISE's router busy for a long time: 0.25 routes in minutes). Each input is driven by the
// output of a slice nearby (1-2 tiles), at a medium distance (up to 8) or anywhere, a third each.
import fs from 'node:fs';
import path from 'node:path';
import { tileXY } from './observe.mjs';

/** A small seeded generator (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** The slice sites of a CLB tile (CLB_X<x>Y<y> holds SLICE_X<2x-2..2x-1>Y<2y-2..2y-1>). */
export function clbSlices(tile) {
  const { x, y } = tileXY(tile);
  return [0, 1, 2, 3].map(i => `SLICE_X${2 * (x - 1) + (i >> 1)}Y${2 * (y - 1) + (i & 1)}`);
}

/** The XDL text of one random design (see the header); `fraction` of the CLB tiles is used. */
export function observeXdl(part, tiles, seed, fraction = 1) {
  const rnd = rng(seed);
  const slices = [];
  for (const t of tiles) {
    if (fraction < 1 && rnd() >= fraction) continue;
    const { x, y } = tileXY(t);
    for (const s of clbSlices(t)) slices.push({ s, x, y });
  }
  const pick = a => a[Math.floor(rnd() * a.length)];
  const drivers = new Map();   // 'slice.X' -> [ 'slice.F1', ... ]
  for (const sink of slices) {
    for (const pin of ['F1', 'F2', 'F3', 'F4', 'G1', 'G2', 'G3', 'G4']) {
      const r = rnd(), lim = r < 1 / 3 ? 2 : r < 2 / 3 ? 8 : 1e9;
      const near = lim > 1e8 ? slices : slices.filter(o => Math.abs(o.x - sink.x) <= lim && Math.abs(o.y - sink.y) <= lim && o !== sink);
      const src = pick(near.length ? near : slices);
      const k = `${src.s}.${rnd() < 0.5 ? 'X' : 'Y'}`;
      if (!drivers.has(k)) drivers.set(k, []);
      drivers.get(k).push(`${sink.s}.${pin}`);
    }
  }
  const lines = [`design "observe" ${part} v3.2 ;`];
  for (const { s } of slices) {
    const used = ['X', 'Y'].filter(o => drivers.has(`${s}.${o}`));
    lines.push(`inst "${s}" "SLICEL", placed TILE ${s} ,`,
      `  cfg " F:${s}_f:#LUT:D=A1*A2*A3*A4 G:${s}_g:#LUT:D=A1*A2*A3*A4 FXMUX::F GYMUX::G${used.includes('X') ? ' XUSED::0' : ''}${used.includes('Y') ? ' YUSED::0' : ''} " ;`);
  }
  let n = 0;
  for (const [src, sinks] of drivers) {
    const [s, o] = src.split('.');
    lines.push(`net "n${n++}" ,`, `  outpin "${s}" ${o} ,`, ...sinks.map(k => { const [t, p] = k.split('.'); return `  inpin "${t}" ${p} ,`; }), '  ;');
  }
  return lines.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const [tilesFile, out, designs = 4, seed = 1, fraction = 1, part = 'xc3s250ecp132-4'] = process.argv.slice(2);
  const tiles = fs.readFileSync(tilesFile, 'utf8').split('\n').filter(t => /^CLB_X\d+Y\d+$/.test(t));
  fs.mkdirSync(out, { recursive: true });
  for (let i = 0; i < +designs; i++) fs.writeFileSync(path.join(out, `o${+seed + i}.xdl`), observeXdl(part, tiles, +seed + i, +fraction));
  console.log(`${designs} designs, ${tiles.length} CLB tiles`);
}
