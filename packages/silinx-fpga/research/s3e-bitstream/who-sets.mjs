// Which features of a design set (or clear) a given bit of the frame data: for a bit where the writer
// and ISE differ (explain-diff.mjs), the feature of the database that put it there.
//   PART=… node who-sets.mjs design.xdl frame bit [frame bit …]
import fs from 'node:fs';
import { parseXdl } from '../../src/xdl.js';
import { designFeatures, tileOf, tileBase, featureBits, parseBit } from '../../src/fpga/bitgen.js';
import { loadDb } from './db.mjs';

const [xdl, ...pos] = process.argv.slice(2);
const want = new Set();
for (let i = 0; i + 1 < pos.length; i += 2) want.add(`${pos[i]},${pos[i + 1]}`);
const db = loadDb();
const design = parseXdl(fs.readFileSync(xdl, 'utf8'));
const { feats } = designFeatures(design, db);
for (const { tile, feature } of feats) {
  let hits = [];
  if (tile[0] === '@') {
    for (const s of db.padFeats[tile.slice(1)]?.[feature] || []) { const [f, b, v] = parseBit(s); if (want.has(`${f},${b}`)) hits.push(`${f},${b}=${v}`); }
  } else {
    const t = tileOf(tile, db), base = t && tileBase(t, db);
    const bits = base && featureBits(db.types[t.type], feature);
    for (const s of bits || []) {
      const [df, dbit, v, dx, dy] = parseBit(s);
      const b = dx || dy ? tileBase({ ...t, x: t.x + dx, y: t.y + dy }, db) : base;
      if (b && want.has(`${b.frame + df},${b.bit + dbit}`)) hits.push(`${b.frame + df},${b.bit + dbit}=${v} (${s})`);
    }
  }
  if (hits.length) console.log(`${tile} ${feature}: ${hits.join(' ')}`);
}
