// Stage S6-F (#728): the block RAM's and the DSP48A1's settings and the block RAM's contents. Designs in XDL with no nets,
// every site of a type (RAMB16BWER, RAMB8BWER, DSP48A1) holding an instance:
//   <type>-base     every site the base settings (as ISE and Silinx write them, packages/silinx-fpga/src/fpga/s6/xdl.js bramCfg / dspCfg)
//   <type>-id<j>    the base on the sites whose index has bit j set (which site each bit is)
//   <type>-v<k>     the base, a variant on the first sites (one element's option each, from the primitive definitions);
//                   -s<slot>v<k> for a type of two sites to a tile, a variant on one site of each tile (-a<slot>v<k>
//                   the same with the tile's other site empty)
//   <type>-c<j>     (the block RAM) contents and INIT / SRVAL with bit i set when bit j of i is set; -cones all set;
//                   -w<j> the codes with the sites on widthPairs; -cpar the parity only, -cf0 / -cf1 INIT_B and SRVAL_B / SRVAL_A and SRVAL_B, -cid<j> all set on the id's sites
// ise-xdl-bits.sh turns them into bitstreams; ana-hard6.mjs reads them.
//   node research/s6/gen-hard6.mjs <out dir> [part]   (<part>.<design>.xdl and <part>.<design>.json: { site: variant })
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { s6Device } from '../../test/s6-lib.mjs';

const DEFS = JSON.parse(fs.readFileSync(new URL('./measured/prim-defs.json', import.meta.url), 'utf8'));

/** A type's base settings: [[element, value]] (the inverters as their pins, no register, SYNC, the widths' widest). */
export function hardBase(type) {
  const def = DEFS[type], out = [];
  for (const [e, { cfg }] of Object.entries(def)) {
    if (!cfg.length) continue;
    if (/INV$/.test(e)) out.push([e, cfg.find(v => !/_B$/.test(v)) ?? cfg[0]]);
    else if (/^DATA_WIDTH/.test(e)) out.push([e, type === 'RAMB8BWER' ? '18' : '36']);
    else if (/REG$/.test(e)) out.push([e, '0']);
    else if (e === 'RSTTYPE') out.push([e, 'SYNC']);
    else if (e === 'RAM_MODE') out.push([e, 'TDP']);
    else if (/^WRITE_MODE/.test(e)) out.push([e, 'WRITE_FIRST']);
    else if (/^RST_PRIORITY/.test(e)) out.push([e, 'CE']);
    else if (/^EN_RSTRAM/.test(e)) out.push([e, 'TRUE']);
    else if (e === 'B_INPUT') out.push([e, 'DIRECT']);
    else if (e === 'CARRYINSEL') out.push([e, 'OPMODE5']);
    else out.push([e, cfg[0]]);
  }
  return /^RAMB/.test(type) ? [...out, ...contents(type, 'zero')] : out;
}

/** The settings measured together, not one by one (a RAMB8BWER's 36-bit ports are its SDP mode's): { type: [[[e, v]]] }. */
export const HARD_COMBOS = { RAMB8BWER: [[['RAM_MODE', 'SDP'], ['DATA_WIDTH_A', '36'], ['DATA_WIDTH_B', '36']]] };

/** A type's variants: [{ name, settings }], each the base with one element on another option (then the combinations,
 * named 'E=V+E=V…'). */
export function hardVariants(type) {
  const base = hardBase(type), out = [];
  for (const [e, { cfg }] of Object.entries(DEFS[type])) {
    const b = base.find(x => x[0] === e);
    if (!b) continue;
    for (const v of cfg) if (v !== b[1]) out.push({ name: `${e}=${v}`, settings: base.map(x => (x[0] === e ? [e, v] : x)) });
  }
  for (const c of HARD_COMBOS[type] || []) out.push({ name: c.map(([e, v]) => `${e}=${v}`).join('+'), settings: base.map(x => c.find(q => q[0] === x[0]) ?? x) });
  return out;
}

/** The block RAM's INIT strings for a code: bit i of the memory (and of the parity, INIT_A …) set when bit j of i is
 * ('ones' all, 'zero' none: ISE wants every one written); the fields on() refuses (INIT, INITP, INIT_A …) all zero. */
export function contents(type, code, on = () => true) {
  const r8 = type === 'RAMB8BWER', words = r8 ? 32 : 64, pwords = r8 ? 4 : 8, w = r8 ? 18 : 36, bit = i => (code === 'ones' ? 1 : code === 'zero' ? 0 : (i >> code) & 1);
  const hex = (n, base, f) => { let s = ''; for (let d = n / 4 - 1; d >= 0; d--) { let v = 0; for (let b = 0; b < 4; b++) v |= (on(f) ? bit(base + d * 4 + b) : 0) << b; s += v.toString(16).toUpperCase(); } return s; };
  const out = [];
  for (let k = 0; k < words; k++) out.push([`INIT_${k.toString(16).toUpperCase().padStart(2, '0')}`, hex(256, k * 256, 'INIT')]);
  for (let k = 0; k < pwords; k++) out.push([`INITP_${k.toString(16).toUpperCase().padStart(2, '0')}`, hex(256, k * 256, 'INITP')]);
  for (const k of ['INIT_A', 'INIT_B', 'SRVAL_A', 'SRVAL_B']) out.push([k, hex(Math.ceil(w / 4) * 4, 0, k).slice(-Math.ceil(w / 4))]);
  return out;
}

/** The ports' width pairs the contents' layout is measured with: [A, B(, RAM_MODE)] (A alone, B alone, both the same,
 * one at the widest; a RAMB8BWER's 36 is its SDP mode's). */
export function widthPairs(type) {
  const r8 = type === 'RAMB8BWER', ws = r8 ? ['1', '2', '4', '9', '18'] : ['1', '2', '4', '9', '18', '36'], top = r8 ? '18' : '36', out = [];
  for (const w of ws) out.push([w, '0'], ['0', w], [w, w], ...(w === top ? [] : [[w, top], [top, w]]));
  if (r8) out.push(['36', '36', 'SDP']);
  return out;
}

/** A site's slot in its tile (its order by Y among the tile's sites of its type): { count, of(site) }. */
export function siteSlots(sites) {
  const y = s => +s.name.match(/Y(\d+)$/)[1], byTile = new Map();
  for (const s of sites) (byTile.get(s.tileName) ?? byTile.set(s.tileName, []).get(s.tileName)).push(s);
  for (const l of byTile.values()) l.sort((a, b) => y(a) - y(b));
  return { count: Math.max(...[...byTile.values()].map(l => l.length)), of: s => byTile.get(s.tileName).indexOf(s) };
}

/** An instance's XDL. */
export function hardInst(type, site, settings) {
  const cfg = settings.map(([e, v]) => `${e}::${v}`).join(' ');
  return `inst "h_${site.name}" "${type}",placed ${site.tileName} ${site.name}  ,\n  cfg " ${type}:h_${site.name}: ${cfg} " ;\n`;
}

/** The designs of a type: { name: { xdl, map: { site: variant } } }. */
export function hardDesigns(part, sites, type) {
  const base = hardBase(type), vs = hardVariants(type), out = {}, design = list => `design "hard" ${part} v3.2 ,\n  cfg "";\n${list.join('')}`;
  out.base = { xdl: design(sites.map(s => hardInst(type, s, base))), map: Object.fromEntries(sites.map(s => [s.name, 'BASE'])) };
  for (let j = 0; j < Math.ceil(Math.log2(sites.length)); j++) {
    const on = sites.filter((_, i) => (i >> j) & 1);
    out[`id${j}`] = { xdl: design(on.map(s => hardInst(type, s, base))), map: Object.fromEntries(on.map(s => [s.name, 'BASE'])) };
  }
  // the variants on one site of each tile at a time (the RAMB8BWERs, two to a tile, share their rows): slot s's designs
  // s<s>v<k>, a type of one site to a tile v<k>
  const slots = siteSlots(sites);
  for (let slot = 0; slot < slots.count; slot++) {
    const mine = sites.filter(s => slots.of(s) === slot);
    for (let k = 0; k * mine.length < vs.length; k++) {
      const map = {}, list = sites.map(s => { const i = mine.indexOf(s), v = i < 0 ? null : vs[k * mine.length + i]; map[s.name] = v ? v.name : 'BASE'; return hardInst(type, s, v ? v.settings : base); });
      out[`${slots.count > 1 ? `s${slot}` : ''}v${k}`] = { xdl: design(list), map };
      // and with the tiles' other sites empty (a RAMB8BWER alone in its tile): a<slot>v<k>
      if (slots.count > 1) out[`a${slot}v${k}`] = { xdl: design(list.filter((_, i) => slots.of(sites[i]) === slot)), map: Object.fromEntries(Object.entries(map).filter(([n]) => mine.some(s => s.name === n))) };
    }
  }
  if (/^RAMB/.test(type)) {
    const bits = type === 'RAMB8BWER' ? 13 : 14;
    const settings = (code, on) => [...hardBase(type).filter(([e]) => !/^(INIT|SRVAL)/.test(e)), ...contents(type, code, on)];
    for (const code of ['ones', ...Array.from({ length: bits }, (_, j) => j)]) {
      out[`c${code}`] = { xdl: design(sites.map(s => hardInst(type, s, settings(code)))), map: Object.fromEntries(sites.map(s => [s.name, `c${code}`])) };
    }
    // which field a bit is (the parity; INIT_A, INIT_B, SRVAL_A, SRVAL_B by a 2-bit code) and which site (all ones on the
    // sites whose index has bit j set)
    for (const [name, on] of [['cpar', f => f === 'INITP'], ['cf0', f => f === 'INIT_B' || f === 'SRVAL_B'], ['cf1', f => /^SRVAL/.test(f)]]) {
      out[name] = { xdl: design(sites.map(s => hardInst(type, s, settings('ones', on)))), map: Object.fromEntries(sites.map(s => [s.name, name])) };
    }
    // the contents' layout by the ports' widths: each site a pair (A, B) of widthPairs, the codes again (w<code>)
    const pairs = widthPairs(type), wsettings = (pair, code) => settings(code).map(([e, v]) => (e === 'DATA_WIDTH_A' ? [e, pair[0]] : e === 'DATA_WIDTH_B' ? [e, pair[1]] : e === 'RAM_MODE' && pair[2] ? [e, pair[2]] : [e, v]));
    for (const code of ['ones', ...Array.from({ length: bits }, (_, j) => j)]) {
      out[`w${code}`] = { xdl: design(sites.map((s, i) => hardInst(type, s, i < pairs.length ? wsettings(pairs[i], code) : settings(code)))), map: Object.fromEntries(sites.map((s, i) => [s.name, (pairs[i] ?? []).join('/') || 'BASE'])) };
    }
    for (let j = 0; j < Math.ceil(Math.log2(sites.length)); j++) {
      out[`cid${j}`] = { xdl: design(sites.map((s, i) => hardInst(type, s, (i >> j) & 1 ? settings('ones') : base))), map: Object.fromEntries(sites.map((s, i) => [s.name, (i >> j) & 1 ? 'cones' : 'BASE'])) };
    }
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [out, part = 'xc6slx16csg324-3'] = process.argv.slice(2);
  if (!out) { console.error('usage: node research/s6/gen-hard6.mjs <out dir> [part]'); process.exit(1); }
  const { device } = s6Device(part), p = part.replace(/^(xc6slx\d+)(csg)/, '$1-$2'), all = device.sites();
  fs.mkdirSync(out, { recursive: true });
  for (const type of ['RAMB16BWER', 'RAMB8BWER', 'DSP48A1']) {
    const sites = all.filter(s => s.type === type).sort((a, b) => (a.name < b.name ? -1 : 1)), ds = hardDesigns(part, sites, type);
    for (const [name, d] of Object.entries(ds)) {
      fs.writeFileSync(path.join(out, `${p}.${type}-${name}.xdl`), d.xdl);
      fs.writeFileSync(path.join(out, `${p}.${type}-${name}.json`), JSON.stringify(d.map));
    }
    console.log(`${type}: ${sites.length} sites, ${hardVariants(type).length} variants, ${Object.keys(ds).length} designs`);
  }
}
