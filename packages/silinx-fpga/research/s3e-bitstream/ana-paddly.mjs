// #751: each bit of the pads' input delays given to the one pad whose kind and delay it follows, from designs where each
// pad is used on its own (gen-paddly.mjs; gen-pairdly.mjs's and gen-padrand.mjs's designs too: same key.json), with
// ISE's .bit next to each .xdl. The bits looked at: those that change between the variants of a design (only the
// delays change there), and those the database gives to a pad's delay (IFD:DLYn, IBUF:DLYn). A bit is a pad's when
// ISE's value of it in every design is a function of that pad's state (n unused, o output, r0-r6 input register and its
// IFD_DELAY_VALUE, i0-i12 direct input and its IBUF_DELAY_VALUE), set only for some r / i states. When several pads fit
// (a kind of one pad's that coincides with a kind of another's in every base design), the one whose features are
// possible (a direct input without delay has no bits, IOB_PLAIN), then the one the database gives the bit to, then
// the one whose I/O tile is nearest; the ambiguous bits are listed. Writes the pads' delay features (every state measured on the pad: a feature
// for each IFD_DELAY_VALUE, each IBUF_DELAY_VALUE but 0) and lists the bits no single pad explains.
//   node ana-paddly.mjs dir… > measured/fix-28-pad-delays.json      (dirs of one device)
import fs from 'node:fs';
import path from 'node:path';
import { readBit, getBit } from '../../src/fpga/bitstream.js';
import { tileOf, tileBase } from '../../src/fpga/bitgen.js';
import { loadDb } from '../../src/fpga/bitdb-node.js';
import { loadDeviceCache } from '../../src/fpga/device-node.js';
import { deviceSites } from '../../src/fpga/place.js';

const dirs = process.argv.slice(2);
const part = JSON.parse(fs.readFileSync(path.join(dirs[0], 'key.json'), 'utf8')).part;
const db = loadDb(part);
const { pads } = deviceSites(loadDeviceCache(part));
// every design: its base (the routed design its variants share), each pad's state, ISE's frames
const rows = [];
for (const dir of dirs) {
  const key = JSON.parse(fs.readFileSync(path.join(dir, 'key.json'), 'utf8'));
  if (key.part !== part) throw new Error(`${dir}: ${key.part}, not ${part}`);
  for (const [d, { kinds, variants }] of Object.entries(key.designs)) for (const [v, vals] of Object.entries(variants)) {
    const bf = path.join(dir, d, `${v}.bit`);
    if (!fs.existsSync(bf)) continue;
    const st = new Map([...pads.keys()].map(p => [p, 'n']));
    for (const [p, k] of Object.entries(kinds)) st.set(p, `${k}${vals[p] ?? ''}`);
    rows.push({ base: `${dir}/${d}`, st, ise: readBit(fs.readFileSync(bf)).frames });
  }
}
const fw = rows[0].ise.frameWords, words = rows[0].ise.length;
// the bits to look at
const look = new Set();
for (const fe of Object.values(db.padFeats)) for (const [k, bits] of Object.entries(fe)) if (/^(IFD|IBUF):/.test(k)) bits.forEach(b => look.add(b.replace(/^!/, '')));
const byBase = Map.groupBy(rows, r => r.base);
for (const rs of byBase.values()) for (let w = 0; w < words; w++) {
  let or = 0, and = ~0;
  for (const r of rs) { or |= r.ise[w]; and &= r.ise[w]; }
  const x = (or ^ and) >>> 0;
  for (let i = 0; i < 32; i++) if ((x >>> (31 - i)) & 1) look.add(`${Math.floor(w / fw)},${(w % fw) * 32 + i}`);
}
// each pad's I/O tile (its first frame and bit), for the nearest of several pads that fit
const at = new Map([...pads.values()].map(p => [p.name, tileBase(tileOf(p.tile, db), db)]));
const dist = (p, f, i) => { const t = at.get(p); return t ? Math.abs(f - t.frame - 9) * 64 + Math.abs(i - t.bit) : Infinity; };
const owners = new Map(), unexplained = [], ambiguous = [];
const inDb = (p, b) => Object.entries(db.padFeats[p] || {}).some(([k, v]) => /^(IFD|IBUF):/.test(k) && v.includes(b));
for (const b of [...look].sort()) {
  const [f, i] = b.split(',').map(Number);
  const vals = rows.map(r => getBit(r.ise, fw, f, i));
  if (vals.every(v => v === vals[0])) continue;
  const fit = [];
  for (const p of pads.keys()) {
    const m = new Map();
    let ok = true;
    rows.forEach((r, k) => { const s = r.st.get(p); if (m.has(s) && m.get(s) !== vals[k]) ok = false; m.set(s, vals[k]); });
    const on = [...m].filter(([, v]) => v).map(([s]) => s);
    if (ok && on.length && on.every(s => /^[ri]\d+$/.test(s))) fit.push({ p, on, seen: [...m.keys()] });
  }
  if (!fit.length) { unexplained.push(b); continue; }
  const rank = x => [x.on.includes('i0') ? 1 : 0, inDb(x.p, b) ? 0 : 1, dist(x.p, f, i)];
  fit.sort((x, y) => { const a = rank(x), c = rank(y); return a[0] - c[0] || a[1] - c[1] || a[2] - c[2]; });
  // (ambiguous: another pad fits whose I/O tile is next to the chosen one's: the others are far from the bit)
  if (fit.slice(1).some(x => dist(x.p, f, i) < 64 * 40)) ambiguous.push(`${b}: ${fit.filter(x => dist(x.p, f, i) < 64 * 40).map(x => `${x.p}{${x.on.sort().join(',')}}`).join(' ')}`);
  owners.set(b, fit[0]);
}
// the features: for each pad, each state measured on it
const feats = {};
for (const [b, { p, on, seen }] of owners) {
  const fe = feats[p] ||= {};
  for (const s of seen.filter(s => /^[ri]\d+$/.test(s))) {
    const name = s[0] === 'r' ? `IFD:DLY${s.slice(1)}` : `IBUF:DLY${s.slice(1)}`;
    if (name === 'IBUF:DLY0') { if (on.includes(s)) unexplained.push(`${b} (${p}: a direct input without delay)`); continue; }
    fe[name] ||= [];
    if (on.includes(s)) fe[name].push(b);
  }
}
for (const fe of Object.values(feats)) for (const k of Object.keys(fe)) fe[k].sort();
console.log(JSON.stringify({
  source: `#751: the pads' input delays, each bit given to the one pad whose kind and delay it follows (ana-paddly.mjs), from ${rows.length} designs implemented by ISE 14.7 (xdl -xdl2ncd, bitgen) in which each pad is used on its own: unused, an output, an input register with each IFD_DELAY_VALUE, a direct input with each IBUF_DELAY_VALUE (gen-paddly.mjs, gen-pairdly.mjs)`,
  part, designs: rows.length, unexplained, ambiguous, pads: feats,
}, null, 1));
