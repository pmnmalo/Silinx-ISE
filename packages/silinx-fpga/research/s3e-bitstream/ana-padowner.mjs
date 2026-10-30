// The pad that owns each bit of the IOB registers' features (#96): designs where both pads of an I/O tile always had
// a register (rd / rd2, gen-iobddr.mjs's rdi0 / rdi1) cannot tell two neighbours' bits apart, so a bit of one pad's
// IDDR2 could go to its neighbour's (U11's R:IFF2:#FF held 349,3078, T11's, on the XC3S500E), as #751 found for the
// delays. With designs where only one pad of each tile has an IDDR2 (rdi2 / rdi3), every bit the writer gets wrong in
// any design is given to the one register feature, on a pad of the bit's tile or the next, whose presence is exactly
// where ISE sets it; the features that held it lose it. Of several features that fit, the one the single registers do
// not have (DDR first: R:IREV_USED, R:REVINV, then R:IFF2 / ICLK2INV…, the single registers' last), so that a single
// register, whose bits #44 / #97 / #751 checked, keeps them; then the pad nearest the one that held it (its tile's
// other pad first: the designs register a tile's first, or second, pads together); the others that fit are reported. A bit no single feature
// explains is reported and left as it is.
//   PART=… node ana-padowner.mjs --pads out.json dir…   (each: *.xdl + *.bit)
// --pads: { padFeatures: { PAD: { feature: [bits] } } }, the features changed, whole, for merge-db.mjs.
import fs from 'node:fs';
import { readBit, diffFrames } from '../../src/fpga/bitstream.js';
import { parseXdl } from '../../src/xdl.js';
import { frameData, iobRegFeatures } from '../../src/fpga/bitgen.js';
import { loadDb, PART } from './db.mjs';
import { deviceSites } from '../../src/fpga/place.js';
import { loadDeviceCache } from '../../src/fpga/device-node.js';

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const padsFile = opt('--pads');
const db = loadDb();
const pads = [...deviceSites(loadDeviceCache(PART)).pads.values()];
// the pads near each pad: its tile's and the next tiles' (a pad's bits are not always in its own tile's frames)
const near = new Map(pads.map(p => [p.name, pads.filter(q => Math.abs(q.px - p.px) + Math.abs(q.py - p.py) <= 1).map(q => q.name)]));
const splitter = db.types.CLKH_LL ? (([fr, bit]) => fr < 4 || bit <= 3 || bit >= db.format.frameWords * 32 - 4) : () => false;
const designs = [];   // { feats: Map(pad -> Set(features)), ise: Map(bit -> value) for the bits that differ anywhere, frames }
for (const dir of args) for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.xdl')).sort()) {
  const bitFile = `${dir}/${f.slice(0, -4)}.bit`;
  if (!fs.existsSync(bitFile)) continue;
  const d = parseXdl(fs.readFileSync(`${dir}/${f}`, 'utf8'));
  const feats = new Map();
  for (const i of d.insts) if (/^(IOB|IBUF)$/.test(i.type) && i.placed) feats.set(i.site, new Set(iobRegFeatures(i.cfg)));
  designs.push({ name: `${dir}/${f}`, d, feats, ise: readBit(fs.readFileSync(bitFile)).frames });
}
const fw = db.format.frameWords;
const iseBit = (des, fr, bit) => (des.ise[fr * fw + Math.floor(bit / 32)] >>> (31 - (bit % 32))) & 1;
const wrong = () => {
  const out = new Map();   // "frame,bit" -> [design index]
  designs.forEach((des, k) => {
    for (const x of diffFrames(frameData(des.d, db).frames, des.ise, fw)) {
      if (splitter([x.frame, x.bit])) continue;
      const key = `${x.frame},${x.bit}`;
      (out.get(key) || out.set(key, []).get(key)).push(k);
    }
  });
  return out;
};
// the features only the DDR registers have first, the single registers' last
const DDR_FIRST = [/^R:IREV_USED:/, /^R:REVINV:/, /^R:(IFF2|OFF2)(_|:)/, /^R:(ICLK2|OTCLK2)INV:/, /^R:(OFFDDRBLACKBOX|IFFDDRBLACKBOX)/, /^OMUX:OFFDDR/];
const rank = k => { const i = DDR_FIRST.findIndex(re => re.test(k)); return i < 0 ? DDR_FIRST.length : i; };
const changed = new Map();   // pad -> Set(feature)
const report = [];
const before = wrong();
for (const [key] of before) {
  const [fr, bit] = key.split(',').map(Number);
  // the pads whose features hold the bit, and their neighbours
  const holders = [];
  for (const [p, f] of Object.entries(db.padFeats)) for (const [k, v] of Object.entries(f)) if (/^R:|^OMUX:|^TMUX:/.test(k) && (v.includes(key) || v.includes(`!${key}`))) holders.push([p, k]);
  const cands = new Set(holders.flatMap(([p]) => near.get(p) || [p]));
  const want = designs.map(des => iseBit(des, fr, bit));
  // one register feature present exactly where ISE sets the bit (or exactly where it clears it, a clear)
  const fits = [];
  for (const p of cands) for (const k of Object.keys(db.padFeats[p] || {})) {
    if (!/^R:|^OMUX:|^TMUX:/.test(k)) continue;
    const on = designs.map(des => des.feats.get(p)?.has(k) || false);
    if (on.some(Boolean) && on.every((x, i) => x === !!want[i])) fits.push([p, k]);
  }
  const pad = new Map(pads.map(x => [x.name, x]));
  const away = q => Math.min(...holders.map(([h]) => (pad.get(h).tile === pad.get(q).tile ? 0 : 1 + Math.abs(pad.get(h).px - pad.get(q).px) + Math.abs(pad.get(h).py - pad.get(q).py))));
  fits.sort((a, b) => rank(a[1]) - rank(b[1]) || away(a[0]) - away(b[0]) || (a.join(' ') < b.join(' ') ? -1 : 1));
  const best = fits[0];
  if (!best) { report.push(`${key}: no single feature fits (held by ${holders.map(h => h.join(' ')).join(', ')})`); continue; }
  for (const [p, k] of holders) {
    db.padFeats[p][k] = db.padFeats[p][k].filter(b => b !== key && b !== `!${key}`);
    (changed.get(p) || changed.set(p, new Set()).get(p)).add(k);
  }
  const [p, k] = best;
  db.padFeats[p][k] = [...db.padFeats[p][k].filter(b => b !== key && b !== `!${key}`), key].sort();
  (changed.get(p) || changed.set(p, new Set()).get(p)).add(k);
  report.push(`${key}: ${p} ${k} (was ${holders.map(h => h.join(' ')).join(', ') || 'nowhere'})${fits.length > 1 ? `; also fit: ${fits.slice(1).map(x => x.join(' ')).join(', ')}` : ''}`);
}
const after = wrong();
console.log(report.join('\n'));
console.log(`${designs.length} designs: ${before.size} bits wrong before, ${after.size} after${after.size ? `: ${[...after.keys()].slice(0, 10).join(' ')}` : ''}`);
if (padsFile) {
  const padFeatures = {};
  for (const [p, ks] of changed) for (const k of ks) (padFeatures[p] ||= {})[k] = db.padFeats[p][k];
  fs.writeFileSync(padsFile, JSON.stringify({ padFeatures }));
}
