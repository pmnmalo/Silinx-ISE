// Stage S6-F (#728): the block RAM's and the DSP48A1's bits from gen-hard6.mjs's designs ISE turned into bitstreams.
// A site's bits are offsets from the region of its tile (gridRegion: its column's first frame, its row's band; a tile
// spans its INT row and the 3 above, the bits below its band), the same at every site of a type and slot (its order by
// Y in its tile: the RAMB8BWERs, two to a tile, share the tile's rows, and some bits either sets): the base's, each
// variant's set and cleared
// against the base's, INIT_A / INIT_B / SRVAL_A / SRVAL_B's bit by bit; the block RAM's contents, in the BRAM frames
// after the rows' frames, each site's 18432 bits (9216 a RAMB8BWER's) at offsets from the site's first, the data bit
// i's and the parity bit i's (a RAMB16BWER's with neither port 36 bits wide in another order: 'narrow').
//   node research/s6/ana-hard6.mjs <dir> [part] [--pins <dir> …]   (<dir>/<part>.<type>-<design>.{bit,json}; --pins: designs
//   ISE implemented, top.xdl and top.bit, block RAMs with their clocks on one pin and on both)   -> db/<device>-hard.json
// { RAMB16BWER: { slots: [{ base: ['df,db'], options: { 'ELEMENT=VALUE': { set, clear } }, alone: { … } (a RAMB8BWER's with the
//   tile's other site empty), pins: { CLKA: ['df,db'] … }, fields: { INIT_A: ['df,db'] … } }],
//   bram: { sites: { site: first bit }, data: [offset of bit i], parity: [offset of bit i], narrow: { data, parity } } }, … }
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBit6, emptyFdri, bitFormat6 } from '../../src/fpga/s6/bitstream.js';
import { bitsOf } from './ana-iob6.mjs';
import { gridRegion } from './ana-pipdrop6.mjs';
import { siteSlots } from './gen-hard6.mjs';
import { fieldIndices } from './hard6.mjs';
import { s6Device } from '../../../../test/s6-lib.mjs';
import { parseXdl } from '../../src/xdl.js';
import { loadDb } from './check-slice6.mjs';
import { predictDesign } from './residual6.mjs';

/** The INT row (Y) a bit of the rows' frames is in: its row of 16 and its band (the inverse of gridRegion's). */
export function bitY(dev, f, b) {
  const m = b >= 528 ? 15 - Math.floor((b - 16) / 64) : 15 - Math.floor(b / 64);
  return Math.floor(f / dev.rowFrames) * 16 + m;
}

/** The tiles' regions: { tile: { f0, b0, y0 } }, the tile's region and its INT row. */
export function tileRegions(device, dev, sites) {
  const out = {};
  for (const s of sites) if (!out[s.tileName]) { const [f0, b0] = gridRegion(device, dev, s.tileName); out[s.tileName] = { tile: s.tileName, f0, b0, y0: bitY(dev, f0, b0) }; }
  return out;
}

/** Which tile a bit of the rows' frames is: the one whose column holds it (its first 64 frames) and whose rows its row. */
export function tileOf(regions, dev, f, b) {
  const y = bitY(dev, f, b), c = f % dev.rowFrames;
  const hit = Object.values(regions).filter(r => c >= r.f0 % dev.rowFrames && c < r.f0 % dev.rowFrames + 64 && y >= r.y0 && y <= r.y0 + 3);
  return hit.length === 1 ? hit[0] : null;
}

/** A design's bits per tile, as offsets from the tile's region: { tile: Set('df,db') }, and the bits no tile holds. */
export function bitsByTile(bits, regions, dev) {
  const out = Object.fromEntries(Object.keys(regions).map(t => [t, new Set()])), lost = [];
  for (const x of bits) {
    const [f, b] = x.split(',').map(Number), r = tileOf(regions, dev, f, b);
    if (r) out[r.tile].add(`${f - r.f0},${b - r.b0}`); else lost.push(x);
  }
  return { out, lost };
}

/** Which site a bit is by the id designs (set on the sites whose index has bit j set). */
export function siteById(x, ids, sites) {
  return sites[ids.reduce((a, q, j) => a | (q.has(x) ? 1 << j : 0), 0)];
}

/** The block RAMs' clock pins' bits from designs ISE implemented (with nets: a clock pin's bits are set only when it has
 * one): each RAM's tile's bits the databases leave over, the pins' (by its slot) from the designs with one clock on it,
 * checked on the others. designs: [{ xdl, bits: Set('frame,bit') }]; db: residual6's (with hard). Adds slots[j].pins
 * ({ pin: ['df,db'] }) to db.hard; returns the problems. */
export function clockPins(designs, device, dev, db) {
  const problems = [], seen = [];
  for (const [k, { xdl, bits }] of designs.entries()) {
    const { bits: pred } = predictDesign(xdl, device, dev, db), left = [...bits].filter(x => !pred.has(x));
    for (const inst of xdl.insts.filter(i => /^RAMB/.test(i.type) && i.placed)) {
      const t = db.hard[inst.type], slot = inst.type === 'RAMB8BWER' ? +inst.site.match(/Y(\d+)$/)[1] % 2 : 0, [f0, b0] = gridRegion(device, dev, inst.tile);
      const pins = xdl.nets.flatMap(n => n.inpins.filter(q => q.inst === inst.name && /^CLK/.test(q.pin)).map(q => q.pin));
      const mine = left.map(x => x.split(',').map(Number)).filter(([f, b]) => f >= f0 + 22 && f <= f0 + 24 && b >= b0 - 192 && b < b0 + 64).map(([f, b]) => `${f - f0},${b - b0}`);
      seen.push({ t, slot, pins, mine, name: inst.site, k });
    }
  }
  // the RAMs alone in their tiles (a RAMB8BWER's tile's other one would add its bits); a pin's bits those of a RAM on
  // it alone
  const pair = q => `${q.k} ${q.name.replace(/Y\d+$/, '')} ${Math.floor(+q.name.match(/Y(\d+)$/)[1] / (/^RAMB8/.test(q.name) ? 2 : 1))}`;
  const alone = seen.filter(q => seen.filter(o => o.t === q.t && pair(o) === pair(q)).length === 1);
  for (const s of alone.filter(q => q.pins.length === 1)) (s.t.slots[s.slot].pins ??= {})[s.pins[0]] = s.mine.sort();
  // a pin not seen alone: the RAM's bits with both, less the other pin's
  for (const s of alone.filter(q => q.pins.length === 2)) {
    const p = (s.t.slots[s.slot].pins ??= {}), [a, b] = s.pins;
    if (!p[a] && p[b]) p[a] = s.mine.filter(x => !p[b].includes(x)).sort();
    if (!p[b] && p[a]) p[b] = s.mine.filter(x => !p[a].includes(x)).sort();
  }
  // the check: each RAM alone in its tile has its pins' bits, no more
  for (const s of alone) {
    const p = s.t.slots[s.slot].pins || {}, want = s.pins.flatMap(q => p[q] || ['?']).sort().join(' ');
    if (want !== s.mine.sort().join(' ')) problems.push(`${s.name} (${s.pins.join(' ')}): ${s.mine.join(' ')}, its pins' ${want}`);
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), at = args.indexOf('--pins'), pinDirs = at < 0 ? [] : args.splice(at).slice(1);
  const [dir, part = 'xc6slx16csg324-3'] = args;
  if (!dir) { console.error('usage: node research/s6/ana-hard6.mjs <dir> [part]'); process.exit(1); }
  const { device } = s6Device(part), p = part.replace(/^(xc6slx\d+)(csg)/, '$1-$2'), dv = part.replace(/csg.*/, '');
  const file = n => path.join(dir, `${p}.${n}`), has = n => fs.existsSync(file(`${n}.bit`)), db = {}, problems = [];
  const read = n => { const r = readBit6(fs.readFileSync(file(`${n}.bit`))), dev = bitFormat6(r.device.part); return { bits: bitsOf(r.fdri, emptyFdri(dev)), dev }; };
  const series = prefix => { const out = []; for (let j = 0; has(`${prefix}${j}`); j++) out.push(read(`${prefix}${j}`).bits); return out; };
  for (const type of ['RAMB16BWER', 'RAMB8BWER', 'DSP48A1']) {
    if (!has(`${type}-base`)) continue;
    const sites = device.sites().filter(s => s.type === type).sort((a, b) => (a.name < b.name ? -1 : 1)), slots = siteSlots(sites);
    const { bits, dev } = read(`${type}-base`), main = dev.rows * dev.rowFrames, regions = tileRegions(device, dev, sites);
    const rows = set => new Set([...set].filter(x => +x.split(',')[0] < main)), offset = (x, s) => { const [f, b] = x.split(',').map(Number), r = regions[s.tileName]; return `${f - r.f0},${b - r.b0}`; };
    // the base: each bit's sites by the ids (a bit both sites of a tile set has the OR of their indices), an offset's
    // slot the one every tile agrees on ('both' a bit of the tile any of its sites sets)
    // bits of no tile in the base, the same in every design (the XC6SLX45's RAMB8BWER and DSP48A1 designs: minors 16 to 19 of
    // two SLICEM columns' clock row word in the top row, #727's shift register rule; in no design ISE implemented)
    const outside = [];
    const ids = series(`${type}-id`), labels = new Map(), seen = Object.fromEntries(Object.keys(regions).map(k => [k, new Set()]));
    for (const x of rows(bits)) {
      const [f, b] = x.split(',').map(Number), r = tileOf(regions, dev, f, b);
      if (!r) { outside.push(x); continue; }
      const c = ids.reduce((a, q, j) => a | (q.has(x) ? 1 << j : 0), 0), ix = sites.filter(s => s.tileName === r.tile).map(s => [slots.of(s), sites.indexOf(s)]);
      const can = new Set(ix.filter(([, i]) => i === c).map(([sl]) => sl));
      if (ix.length > 1 && ix.reduce((a, [, i]) => a | i, 0) === c) can.add('both');
      const o = `${f - r.f0},${b - r.b0}`, l = labels.get(o);
      labels.set(o, l ? new Set([...l].filter(q => can.has(q))) : can);
      seen[r.tile].add(o);
    }
    const pats = new Set(Object.values(seen).map(q => [...q].sort().join(' ')));
    if (pats.size !== 1) problems.push(`${type} base: ${pats.size} tile patterns`);
    for (const [o, l] of labels) if (l.size !== 1) problems.push(`${type} base: offset ${o} of slots ${[...l].join(' ') || 'none'}`);
    const slotOfOffset = o => [...labels.get(o)][0];
    const t = db[type] = { ...(outside.length ? { outside: outside.sort() } : {}), slots: Array.from({ length: slots.count }, (_, j) => ({ base: [...labels.keys()].filter(o => slotOfOffset(o) === j || slotOfOffset(o) === 'both').sort(), options: {} })) };
    // the variants: each tile's bits against its base, the varied site's
    const tileBase = Object.fromEntries(Object.keys(regions).map(k => [k, new Set(sites.filter(s => s.tileName === k).flatMap(s => t.slots[slots.of(s)].base))]));
    const designs = fs.readdirSync(dir).map(n => n.match(new RegExp(`^${p}\\.${type}-((?:[sa]\\d+)?v\\d+)\\.bit$`))?.[1]).filter(Boolean);
    for (const d of designs) {
      const map = JSON.parse(fs.readFileSync(file(`${type}-${d}.json`), 'utf8')), v = bitsByTile(rows(read(`${type}-${d}`).bits), regions, dev);
      const lost = v.lost.filter(x => !outside.includes(x));
      if (lost.length) problems.push(`${type}-${d}: ${lost.length} bits of no tile`);
      // (a<slot>v<k>: the site alone in its tile, its slot's alone options; its base checked)
      const lone = d.startsWith('a');
      for (const s of sites) {
        const name = map[s.name];
        if (name === undefined) continue;
        const got = v.out[s.tileName], slot = t.slots[slots.of(s)], tb = lone ? new Set(slot.base) : tileBase[s.tileName];
        const o = { set: [...got].filter(q => !tb.has(q)).sort(), clear: slot.base.filter(q => !got.has(q)) };
        if (name === 'BASE') { if (lone && (o.set.length || o.clear.length)) problems.push(`${type}-${d} ${s.name}: alone, not its slot's base`); continue; }
        (lone ? (slot.alone ??= {}) : slot.options)[name] = o;
      }
    }
    if (/^RAMB/.test(type) && has(`${type}-cpar`)) {
      const w = type === 'RAMB8BWER' ? 18 : 36, codes = series(`${type}-c`), cids = series(`${type}-cid`);
      const ones = read(`${type}-cones`).bits, par = read(`${type}-cpar`).bits, f0 = read(`${type}-cf0`).bits, f1 = read(`${type}-cf1`).bits;
      const code = x => codes.reduce((a, s, j) => a | (s.has(x) ? 1 << j : 0), 0);
      // INIT_A … in the rows' frames: the site's (by the content ids) offsets of field k's bit i
      const fieldNames = ['INIT_A', 'INIT_B', 'SRVAL_A', 'SRVAL_B'], fields = t.slots.map(() => Object.fromEntries(fieldNames.map(n => [n, new Map()])));
      for (const x of [...rows(ones)].filter(q => !bits.has(q))) {
        const s = siteById(x, cids, sites), i = code(x), k = (f0.has(x) ? 1 : 0) | (f1.has(x) ? 2 : 0);
        if (!s || i >= w) { problems.push(`${type} field bit ${x}: site ${s?.name} index ${i}`); continue; }
        const o = offset(x, s), m = fields[slots.of(s)][fieldNames[k]];
        if (m.has(i) && m.get(i) !== o) problems.push(`${type} ${fieldNames[k]}[${i}]: ${m.get(i)} and ${o}`);
        m.set(i, o);
      }
      t.slots.forEach((slot, j) => { slot.fields = Object.fromEntries(fieldNames.map(n => [n, Array.from({ length: w }, (_, i) => fields[j][n].get(i) ?? null)])); });
      // the contents: each site's bits in the BRAM frames, from its first (in the frames' order)
      const pos = x => { const [f, b] = x.split(',').map(Number); return (f - main) * 1040 + b; }, bySite = new Map();
      for (const x of [...ones].filter(q => +q.split(',')[0] >= main)) { const s = siteById(x, cids, sites); (bySite.get(s) ?? bySite.set(s, []).get(s)).push(x); }
      const bram = t.bram = { sites: {}, data: [], parity: [] };
      for (const [s, list] of bySite) {
        const first = Math.min(...list.map(pos));
        bram.sites[s.name] = first;
        for (const x of list) {
          const i = code(x), kind = par.has(x) ? 'parity' : 'data', o = pos(x) - first;
          if (bram[kind][i] !== undefined && bram[kind][i] !== o) { problems.push(`${type} ${kind}[${i}] at ${s.name}: ${o}, elsewhere ${bram[kind][i]}`); continue; }
          bram[kind][i] = o;
        }
      }
      // the layout by the ports' widths (the w designs, a site per pair): a RAMB16BWER has a second one when neither
      // port is 36 bits wide ('narrow'), its parity at the same positions (checked: the codes there each once)
      if (has(`${type}-wones`)) {
        const wmap = JSON.parse(fs.readFileSync(file(`${type}-wones.json`), 'utf8')), wcodes = series(`${type}-w`), wones = read(`${type}-wones`).bits;
        const wcode = x => wcodes.reduce((a, q, j) => a | (q.has(x) ? 1 << j : 0), 0), firsts = Object.entries(bram.sites).sort((a, b) => a[1] - b[1]);
        const parityAt = new Set(bram.parity), layouts = new Map();
        const siteAt = q => { let s = null; for (const e of firsts) if (e[1] <= q) s = e; return s; };
        const layoutOf = new Map();
        for (const x of [...wones].filter(q => +q.split(',')[0] >= main)) { const q = pos(x), [n, first] = siteAt(q); (layoutOf.get(n) ?? layoutOf.set(n, { data: [], parity: [] }).get(n))[parityAt.has(q - first) ? 'parity' : 'data'][wcode(x)] = q - first; }
        for (const [n, pair] of Object.entries(wmap)) {
          if (pair === 'BASE') continue;
          const l = layoutOf.get(n), key = type === 'RAMB16BWER' && !pair.split('/').includes('36') ? 'narrow' : 'wide', want = type === 'RAMB16BWER' ? 2048 : 1024;
          if (l.parity.filter(x => x !== undefined).length !== want || l.data.filter(x => x !== undefined).length !== want * 8) problems.push(`${type} ${pair}: ${l.data.length} data, ${l.parity.length} parity`);
          const k = JSON.stringify(l);
          if (key === 'wide' && k !== JSON.stringify({ data: bram.data, parity: bram.parity })) problems.push(`${type} ${pair}: not the 36's layout`);
          if (key === 'narrow') { if (layouts.has(key) && layouts.get(key) !== k) problems.push(`${type} ${pair}: another narrow layout`); layouts.set(key, k); }
        }
        if (layouts.has('narrow')) bram.narrow = JSON.parse(layouts.get('narrow'));
        // INIT_x / SRVAL_x as wide as their ports (fieldIndices): the field offsets each site sets, the code there its bit
        for (const [n, pair] of Object.entries(wmap)) {
          if (pair === 'BASE') continue;
          const s = sites.find(q => q.name === n), sl = t.slots[slots.of(s)], r = regions[s.tileName], [wa, wb] = pair.split('/').map(Number);
          for (const [field, w] of [['INIT_A', wa], ['SRVAL_A', wa], ['INIT_B', wb], ['SRVAL_B', wb]]) {
            const want = new Map(fieldIndices(type, w).map(([k, i]) => [i, k])), got = new Map();
            sl.fields[field].forEach((o, i) => { if (!o) return; const [df, db] = o.split(',').map(Number), x = `${r.f0 + df},${r.b0 + db}`; if (wones.has(x)) got.set(i, wcode(x)); });
            const w1 = [...want].map(([i, k]) => `${i}<${k}`).sort().join(' '), g1 = [...got].map(([i, k]) => `${i}<${k}`).sort().join(' ');
            if (w1 !== g1) problems.push(`${type} ${pair} ${field}: ${g1}, the rule's ${w1}`);
          }
        }
      }
      const dn = bram.data.filter(x => x !== undefined).length, pn = bram.parity.filter(x => x !== undefined).length;
      console.log(`${type} contents: ${Object.keys(bram.sites).length} sites, ${dn} data bits, ${pn} parity bits; fields ${t.slots.map(sl => fieldNames.map(n => sl.fields[n].filter(x => x !== null).length).join('/')).join(', ')}`);
    }
    if (outside.length) console.log(`${type}: ${outside.length} bits of no tile in every design (outside): ${outside.join(' ')}`);
    console.log(`${type}: ${sites.length} sites, ${t.slots.length} slots, base ${t.slots.map(s => s.base.length).join('/')} bits, options ${t.slots.map(s => `${Object.keys(s.options).length} (${Object.values(s.options).filter(o => !o.set.length && !o.clear.length).length} with no bit)`).join(' / ')}`);
  }
  if (pinDirs.length) {
    const read6 = n => JSON.parse(fs.readFileSync(new URL(`../../bitdb/s6/${n}.json`, import.meta.url), 'utf8')), dev = bitFormat6(part.replace(/^xc/, '').replace(/-\d$/, ''));
    const rdb = { part, slices: loadDb(dv), int: { pips: read6('xc6slx16-int').pips, cover: read6('xc6slx16-int-cover').pips, own: read6('xc6slx16-int-own').pips },
      other: { pips: { ...read6('s6-pips-other').pips, ...read6('s6-pips-io').pips, ...read6('s6-pips-clock').pips } }, iob: read6(`${dv}-iob`), clocks: read6('s6-clocks'), hard: db };
    const designs = pinDirs.map(d => { const r = readBit6(fs.readFileSync(path.join(d, 'top.bit'))); return { xdl: parseXdl(fs.readFileSync(path.join(d, 'top.xdl'), 'utf8')), bits: bitsOf(r.fdri, emptyFdri(bitFormat6(r.device.part))) }; });
    problems.push(...clockPins(designs, device, dev, rdb));
    for (const type of ['RAMB16BWER', 'RAMB8BWER']) console.log(`${type} clock pins: ${db[type].slots.map((sl, j) => `slot ${j} ${Object.entries(sl.pins || {}).map(([k, v]) => `${k} ${v.join(' ')}`).join(', ')}`).join('; ')}`);
  }
  console.log(`${problems.length} problems${problems.length ? `:\n  ${problems.slice(0, 20).join('\n  ')}` : ''}`);
  fs.writeFileSync(new URL(`../../bitdb/s6/${dv}-hard.json`, import.meta.url), `${JSON.stringify(db)}\n`);
}
