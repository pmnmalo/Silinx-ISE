// The bits of the I/O registers and input delays, per pad (#44): designs with IOB registers (gen-iobreg.mjs
// bases implemented by ISE, gen-iobrand.mjs variants at random settings) written by the writer with
// the register settings left out (bitgen.js IOB_REG_ATTRS): every bit where ISE differs is explained by
// settings of the pads near it, as the writer names them (bitgen.js iobRegFeatures: the delay and path
// features, 'R:<setting>:<value>' for the others, with the unused parts of a used register group):
// first the values of one setting that are each there only where the bit is and together exactly
// where it is (a delay line used by DLY1-6…; a setting with a value seen without the bit first, then
// the nearest pad's, then by PRIORITY), else the fewest such settings of any pads. A bit nothing
// explains is reported; the XC3S1200E's long-line splitters' bits are left out.
//   PART=… node ana-iobreg.mjs [--pads out.json] [--delays REGEXP] dir… (each: *.xdl + *.bit)
// --pads: { padFeatures: { PAD: { feature: [bits "frame,bit" / "!frame,bit"] } } } for merge-db.mjs, every
// feature seen on a pad (empty when it has no bits of its own there); --delays: only the delay features
// (IFD:… / IBUF:…) the regexp matches are written (the others are left out of the database: refused); --known: only
// the settings the database lacks on a pad are solved, the writer writing the others (#759: the second flip-flop alone,
// whose settings occur only there), their bits against what it writes (a bit a new setting clears: "!frame,bit")
import fs from 'node:fs';
import { readBit, diffFrames } from '../../src/fpga/bitstream.js';
import { parseXdl } from '../../src/xdl.js';
import { frameData, iobRegFeatures, IOB_REG_ATTRS as REG_ATTRS } from '../../src/fpga/bitgen.js';
import { loadDb } from './db.mjs';

/** The pad features of an I/O site's register settings, as the writer names them. */
export const padRegFeatures = iobRegFeatures;

// which of the settings found together takes a bit: the delay bundles and paths, then the elements,
// then the rest in name order
const PRIORITY = [/^IFD:/, /^IBUF:/, /^OMUX:/, /^TMUX:/, /^R:(IFF|OFF|TFF)[12]:#FF/, /^R:/];
const rank = f => { const i = PRIORITY.findIndex(re => re.test(f)); return i < 0 ? PRIORITY.length : i; };

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ''))) {
  const args = process.argv.slice(2);
  const opt = k => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
  const padsFile = opt('--pads');
  const delayKeep = opt('--delays');
  const known = args.includes('--known');
  if (known) args.splice(args.indexOf('--known'), 1);
  const db = loadDb();
  // a pad's anchor: its own bits (the I/O standards' features)
  const anchor = new Map();
  for (const [pad, f] of Object.entries(db.padFeats)) {
    const pos = ['O:LVCMOS33', 'I:LVCMOS33', 'O:LVCMOS25', 'I:LVCMOS25'].flatMap(k => f[k] || []).map(s => s.replace('!', '').split(',').map(Number));
    if (pos.length) anchor.set(pad, pos);
  }
  const dist = (fr, bit, pad) => Math.min(...anchor.get(pad).map(([f, b]) => Math.abs(fr - f) * 4 + Math.abs(bit - b)));
  const designs = [];   // { name, feats: Map(pad -> Set(features)), bits: Set("±f,b") }
  for (const dir of args) for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.xdl')).sort()) {
    const n = f.slice(0, -4);
    if (!fs.existsSync(`${dir}/${n}.bit`)) continue;
    const design = parseXdl(fs.readFileSync(`${dir}/${f}`, 'utf8'));
    const feats = new Map();
    for (const i of design.insts) {
      if (!/^(IOB|IBUF)$/.test(i.type) || !i.placed || !anchor.has(i.site)) continue;
      const fs1 = padRegFeatures(i.cfg).filter(f => !known || !db.padFeats[i.site]?.[f]);
      if (fs1.length) feats.set(i.site, new Set(fs1));
      if (!known) i.cfg = i.cfg.filter(c => !REG_ATTRS.test(c.attr));
    }
    const { frames } = frameData(design, db);
    const d = diffFrames(frames, readBit(fs.readFileSync(`${dir}/${n}.bit`)).frames, db.format.frameWords);
    designs.push({ name: `${dir}/${n}`, feats, bits: new Set(d.map(x => `${x.value ? '' : '!'}${x.frame},${x.bit}`)) });
  }
  // every bit seen: the setting of a nearby pad that is there exactly when the bit is
  // bits of what a routed design does not tell (the XC3S1200E's long-line splitters, `a =- b`: the top
  // and bottom bits of the I/O rows and the centre clock columns' frames) are left out
  const splitter = db.types.CLKH_LL ? (([fr, bit]) => fr < 4 || bit <= 3 || bit >= db.format.frameWords * 32 - 4) : () => false;
  const allBits = new Set(designs.flatMap(d => [...d.bits]).filter(b => !splitter(b.replace('!', '').split(',').map(Number))));
  const padsWith = [...new Set(designs.flatMap(d => [...d.feats.keys()]))];
  const assign = new Map();   // pad -> feature -> [bits]
  const report = [];
  let solved = 0, shared = 0, none = 0, far = 0;
  for (const b of allBits) {
    const [fr, bit] = b.replace('!', '').split(',').map(Number);
    const near = padsWith.map(p => [p, dist(fr, bit, p)]).filter(([, k]) => k < 160).sort((x, y) => x[1] - y[1]).slice(0, 6).map(([p]) => p);
    if (!near.length) { far++; continue; }
    const present = designs.map(d => d.bits.has(b));
    // the settings that are there only where the bit is (each one could set it): a set of them that is
    // there exactly where the bit is explains it (an OR of settings: a delay line used by DLY1-6…);
    // the fewest such settings, the nearest pad's first, then by PRIORITY
    const cands = [];
    for (const [pi, p] of near.entries()) {
      for (const f of new Set(designs.flatMap(d => [...(d.feats.get(p) || [])]))) {
        const on = designs.map(d => d.feats.get(p)?.has(f) || false);
        if (on.every((x, k) => !x || present[k])) cands.push({ p, f, on, pi });
      }
    }
    const need = new Set(present.flatMap((x, k) => (x ? [k] : [])));
    const chosen = [];
    // first the values of one setting (one pad's), every value that implies the bit, when together they
    // are there exactly where the bit is (a delay line used by DLY1-6: the values seen once included)
    const fam = f => f.replace(/:[^:]*$/, '');
    const families = new Map();
    for (const c of cands) { const k = `${c.pi}\t${fam(c.f)}`; (families.get(k) || families.set(k, []).get(k)).push(c); }
    // (a setting that has a value seen without the bit tells more than one whose every value has it:
    // those first, then the nearest pad's, then by PRIORITY)
    const seenValues = (p, family) => new Set(designs.flatMap(d => [...(d.feats.get(p) || [])].filter(f => fam(f) === family)));
    const tells = cs => seenValues(near[cs[0].pi], fam(cs[0].f)).size > cs.length;
    const fits = [...families.values()].filter(cs => [...need].every(k => cs.some(c => c.on[k])))
      .sort((a, b) => tells(b) - tells(a) || a[0].pi - b[0].pi || rank(a[0].f) - rank(b[0].f) || a.length - b.length || (a[0].f < b[0].f ? -1 : 1));
    if (fits.length) { chosen.push(...fits[0]); need.clear(); }
    while (need.size) {
      let best = null, bn = 0;
      for (const c of cands) {
        const n = c.on.filter((x, k) => x && need.has(k)).length;
        if (n > bn || (n === bn && n > 0 && (c.pi < best.pi || (c.pi === best.pi && (rank(c.f) < rank(best.f) || (rank(c.f) === rank(best.f) && c.f < best.f)))))) { best = c; bn = n; }
      }
      if (!best) break;
      chosen.push(best);
      best.on.forEach((x, k) => { if (x) need.delete(k); });
    }
    if (!need.size && chosen.length) {
      for (const { p, f } of chosen) ((assign.get(p) || assign.set(p, new Map()).get(p)).get(f) || assign.get(p).set(f, []).get(f)).push(b);
      if (chosen.length === 1) solved++; else shared++;
      continue;
    }
    none++;
    if (none <= 60) report.push(`unexplained ${b} (in ${present.filter(Boolean).length} of ${designs.length}; near ${near.slice(0, 3).join(' ')})`);
  }
  // every setting seen on a pad: its bits (or none)
  const padFeatures = {};
  for (const d of designs) for (const [p, fs1] of d.feats) for (const f of fs1) ((padFeatures[p] ||= {})[f] ||= []);
  for (const [p, m] of assign) for (const [f, bits] of m) padFeatures[p][f] = bits.sort();
  if (delayKeep) for (const m of Object.values(padFeatures)) for (const f of Object.keys(m)) if (/^(IFD|IBUF):/.test(f) && !new RegExp(delayKeep).test(f)) delete m[f];
  console.log(report.join('\n'));
  console.log(`${designs.length} designs, ${allBits.size} bits: ${solved} one setting's, ${shared} several settings', ${none} unexplained, ${far} far from every pad`);
  if (padsFile) fs.writeFileSync(padsFile, JSON.stringify({ padFeatures }));
}
