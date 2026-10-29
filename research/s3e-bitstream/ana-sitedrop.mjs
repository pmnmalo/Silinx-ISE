// Analysis of gen-sitedrop.mjs: the bits each removed setting held, per tile type, site kind and value,
// relative to the instance's tile ("df,db"; "df,db@dx,dy" when the bit is in the frames or rows of the
// tile dx, dy away: an I/O tile also configures its sites in the neighbouring column). A bit that
// changed is given to the nearest instance that had the setting; the pattern found in most instances
// of a tile type is kept, the others are reported.
//   PART=… node ana-sitedrop.mjs dir > features.json
import fs from 'node:fs';
import { readBit, diffFrames } from '../../packages/silinx-fpga/src/fpga/bitstream.js';
import { parseXdl } from '../../packages/silinx-fpga/src/xdl.js';
import { tileOf, tileBase, siteKind } from '../../packages/silinx-fpga/src/fpga/bitgen.js';
import { loadDb, edges } from './db.mjs';

const dir = process.argv[2];
const db = loadDb();
const { maxX: MX, maxY: MY } = edges(db.layout);
const L = db.layout;
const key = JSON.parse(fs.readFileSync(`${dir}/key.json`, 'utf8'));
const base = readBit(fs.readFileSync(`${dir}/BASE.bit`));
const design = parseXdl(fs.readFileSync(`${dir}/BASE.xdl`, 'utf8'));
const size = t => [L.typeFrames?.[t.type] ?? (t.x === 0 || t.x === MX ? 21 : 19), L.typeBits?.[t.type] ?? (t.y === 0 || t.y === MY ? 80 : 64)];
// the window of the tile dx, dy away from t (null when the layout does not know it)
const win = (t, dx, dy) => {
  const u = { ...t, x: t.x + dx, y: t.y + dy };
  const b = tileBase(u, db);
  if (!b) return null;
  const [nf, nb] = dx || dy ? size({ ...u, type: /IOIS|IBUFS/.test(t.type) && (u.x === 0 || u.x === MX || u.y === 0 || u.y === MY) ? t.type : 'CENTER_SMALL' }) : size(t);
  return { ...b, nf, nb };
};
const out = { types: {} };
const report = [];
for (const v of key.variants) {
  const f = `${dir}/${v.name}.bit`;
  if (!fs.existsSync(f)) { report.push(`${v.name}: missing`); continue; }
  const d = diffFrames(base.frames, readBit(fs.readFileSync(f)).frames);
  // the instances that had the setting, with its value
  const insts = [];
  for (const i of design.insts) {
    if (!i.placed) continue;
    const kind = siteKind(i, db) || i.type;
    if (v.kind === 'BUFGMUX' ? !/^BUFGMUX_/.test(kind) : kind !== v.kind) continue;
    const c = i.cfg.find(x => x.attr === v.attr && x.value !== '#OFF');
    if (!c) continue;
    const t = tileOf(i.tile, db), w = t && win(t, 0, 0);
    if (!w) continue;
    insts.push({ i, t, kind, value: c.name && !c.value ? '' : c.value, w, bits: [] });
  }
  let far = 0;
  for (const x of d) {
    // the instance whose tile (or a neighbour of it) holds the bit, the nearest first
    let best = null, bd = Infinity;
    for (const c of insts) for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const w = dx || dy ? win(c.t, dx, dy) : c.w;
      if (!w) continue;
      const df = x.frame - w.frame, dbit = x.bit - w.bit;
      if (df < 0 || df >= w.nf || dbit < 0 || dbit >= w.nb) continue;
      const k = (Math.abs(dx) + Math.abs(dy)) * 1000 + Math.abs(x.frame - c.w.frame);
      if (k < bd) { bd = k; best = { c, s: `${x.value ? '!' : ''}${df},${dbit}${dx || dy ? `@${dx},${dy}` : ''}` }; }
    }
    if (!best) { far++; continue; }
    best.c.bits.push(best.s);
  }
  // per tile type and value: the patterns of the instances
  const groups = new Map();
  for (const c of insts) {
    const fk = `${c.t.type}\t${c.kind}:${v.attr}:${c.value}`;
    const p = c.bits.sort().join(' ');
    const g = groups.get(fk) || groups.set(fk, new Map()).get(fk);
    g.set(p, (g.get(p) || 0) + 1);
  }
  for (const [fk, g] of groups) {
    const [type, feature] = fk.split('\t');
    const best = [...g].sort((a, b) => b[1] - a[1]);
    report.push(`${feature.padEnd(36)} ${type.padEnd(16)} ${best.map(([p, n]) => `[${p}]x${n}`).join(' | ')}${far ? ` (${far} bits far)` : ''}`);
    if (best.length > 1 && best[0][1] === best[1][1]) continue;
    ((out.types[type] ||= { features: {} }).features[feature] = best[0][0] ? best[0][0].split(' ') : []);
  }
}
console.error(report.join('\n'));
console.log(JSON.stringify(out));
