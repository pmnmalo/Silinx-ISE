// Stage S6-E (#727): the pads' settings from gen-iob6.mjs's bitstreams. The output base's and the input's bits
// (against the empty design's, over all of FDRI: the rows' frames, the block RAM's and the I/O words) go to their pads
// by the id designs (pad n's bits are in design id<j> / inid<j> when bit j of n is set); a bit only a variant sets or
// clears goes to the pad that has it in either, else whose bits are nearest. Each pad's settings: its base bits and,
// per variant, the bits it sets and clears against the base (an input's variants against the input).
//   node research/s6/ana-iob6.mjs <dir> [part]   -> research/s6/db/<device>-iob.json
// { part, globals: ['frame,bit' any pad in use sets], pads: { pad: { base: ['frame,bit'] (an output's), input: [an
// input's], variants: { name: { set, clear } } } } }
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBit6, bitFormat6, emptyFdri, FRAME_WORDS } from '../../packages/silinx-fpga/src/fpga/s6/bitstream.js';

/** The bits a design's frame data differs from another's in: Set 'frame,bit' (frame: FDRI's 65-word frames). */
export function bitsOf(fdri, base) {
  const out = new Set();
  for (let w = 0; w < fdri.length; w++) {
    const x = fdri[w] ^ base[w];
    if (x) for (let i = 0; i < 16; i++) if ((x >> (15 - i)) & 1) out.add(`${Math.floor(w / FRAME_WORDS)},${(w % FRAME_WORDS) * 16 + i}`);
  }
  return out;
}

/** The pad index of each base bit from the id designs: Map 'frame,bit' -> n. */
export function padOfBits(base, ids) {
  const out = new Map();
  for (const x of base) { let n = 0; ids.forEach((s, j) => { if (s.has(x)) n |= 1 << j; }); out.set(x, n); }
  return out;
}

/** The pad nearest a bit: the one with a base bit in its frame nearest in bits, else the nearest frame. */
export function nearestPad(x, homes) {
  const [f, b] = x.split(',').map(Number);
  let best = null, score = Infinity;
  for (const [pad, bits] of homes) {
    for (const y of bits) {
      const [g, c] = y.split(',').map(Number), s = Math.abs(f - g) * 2000 + Math.abs(b - c);
      if (s < score) { score = s; best = pad; }
    }
  }
  return best;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, part = 'xc6slx16csg324-3'] = process.argv.slice(2);
  if (!dir) { console.error('usage: node research/s6/ana-iob6.mjs <dir> [part]'); process.exit(1); }
  const dev = bitFormat6(part), p = part.replace(/^(xc6slx\d+)(csg)/, '$1-$2'), empty = emptyFdri(dev);
  const pads = JSON.parse(fs.readFileSync(path.join(dir, `${p}.pads.json`), 'utf8')).map(x => x.pad);
  const read = n => bitsOf(readBit6(fs.readFileSync(path.join(dir, `${p}.iob-${n}.bit`))).fdri, empty);
  const names = fs.readdirSync(dir).filter(f => f.startsWith(`${p}.iob-`) && f.endsWith('.bit')).map(f => f.slice(p.length + 5, -4));
  const idsOf = pre => names.filter(n => new RegExp(`^${pre}\\d+$`).test(n)).sort((a, b) => +a.slice(pre.length) - +b.slice(pre.length)).map(read);
  const base = read('base'), input = read('in'), globals = [];
  // a bit every id design has (pad 2^bits - 1, past the last pad) is the I/O's, not a pad's: global
  const of = new Map([...padOfBits(input, idsOf('inid')), ...padOfBits(base, idsOf('id'))]), homes = new Map(pads.map(x => [x, []])), problems = [];
  for (const [x, n] of of) { if (n >= pads.length) globals.push(x); else homes.get(pads[n]).push(x); }
  const out = Object.fromEntries(pads.map(x => [x, { base: [], input: [], variants: {} }]));
  for (const x of base) if (!globals.includes(x)) out[pads[of.get(x)]].base.push(x);
  const padOf = x => (of.has(x) && of.get(x) < pads.length ? pads[of.get(x)] : nearestPad(x, homes));
  for (const x of input) if (!globals.includes(x)) out[padOf(x)].input.push(x);
  for (const name of names.filter(n => n !== 'base' && n !== 'in' && !/^(in)?id\d+$/.test(n))) {
    const v = read(name), ref = /^in/.test(name) && name !== 'inout' ? input : base, rel = { set: [...v].filter(x => !ref.has(x)), clear: [...ref].filter(x => !v.has(x)) };
    for (const k of ['set', 'clear']) for (const x of rel[k]) { if (globals.includes(x)) continue; const pd = padOf(x); ((out[pd].variants[ref === input ? `${name} (from in)` : name] ??= { set: [], clear: [] })[k]).push(x); }
  }
  for (const x of Object.values(out)) { x.base.sort(); x.input.sort(); }
  // how many bits each variant changes per pad (the same for most pads if the attribution holds)
  const counts = {};
  for (const x of Object.values(out)) for (const [n, v] of Object.entries(x.variants)) { const k = `${v.set.length}+${v.clear.length}-`; ((counts[n] ??= {})[k] = (counts[n][k] || 0) + 1); }
  const none = pads.filter(x => !out[x].base.length);
  console.log(`${part}: ${pads.length} pads, base ${base.size} bits; ${none.length} pads with no base bits${none.length ? ` (${none.slice(0, 8).join(' ')}…)` : ''}; global bits ${[...new Set(globals)].join(' ')}${problems.length ? `; ${problems.slice(0, 4).join('; ')}` : ''}`);
  for (const [n, c] of Object.entries(counts)) console.log(`  ${n}: ${Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, m]) => `${k}×${m}`).join(' ')}`);
  fs.writeFileSync(new URL(`./db/${dev.device}-iob.json`, import.meta.url), `${JSON.stringify({ part, globals: [...new Set(globals)], pads: out })}\n`);
}
