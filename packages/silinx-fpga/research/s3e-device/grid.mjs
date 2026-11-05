// #2502, the grid and the sites of a Spartan-3E die measured: what chip.mjs took from the device report (its tile names,
// rows and columns, tile types, the sites' names, types, order and bonding) from the measurements of the die's data
// folder instead (research/s3e-device/README.md, section 16):
//   tiles: every tile a measurement names (the tile probe's switch tiles, ISE's routes: PIPs, sites, pins, joins; the arc
//     probe's PIPs that exist; the joins the tests confirmed); its type the name's prefix, a CLB's CENTER_SMALL, or
//     CENTER_SMALL_BRK in a row of a switch box named *_BRK (BRAM3_SMALL_BRK, LIOIS_BRK…: brkRowsOf);
//   rows and columns: one per tile Y / X, with the lanes the report inserts beside it (gridRowsCols);
//   sites: every site ISE placed or routed to (obs.json's sites, pins and pin joins, the other packages' observations but
//     their pads), named as ISE named them; a pad bonded, the others internal; its type and its slot in the tile by rule
//     (siteSlot), its place among the tile's sites by its slot (SITE_ORDER).
// The rules are checked against the report on the four dies (test/s3e-device.test.js); what they leave out (the sites
// no design can place or route to: RLL, RANDOR, GLOBALSIG, PCILOGIC, PMV, BSCAN, STARTUP, ICAP, CAPTURE, the unbonded
// pads, the corners' VCC sites) is listed by compare (README section 16).
import { tileXY } from './observe.mjs';

// (the lanes beside a tile Y's row: before it the top terminations and the clock rows (GCLKH, the centre row's CLKL /
// CLKC / CLKR…), after it the bottom terminations and CLKB; beside a tile X's column: before it the left terminations
// and CLKL, after it the right ones, CLKR and the clock column (GCLKVC, CLKT / CLKV / CLKC / CLKB). Every other tile is
// in its X's column and its Y's row)
const ROW_BEFORE = /^(TTERM\w*|CNR_TTERM|TGCLKVTERM|GCLKH\w*|BRAM\w*_GCLKH\w*|BRAMSITE2H|BRAM2_FEEDTHRUH|GCLKVC|CLKVC(_LL)?|GCLKVM[LR]|CLK[LRC](_LL)?|CLKH(_LL)?|CLK[LR]H_DCM_LL|CLK[LR]_IOIS(_LL)?)$/;
const ROW_AFTER = /^(BTERM\w*|CNR_BTERM|BGCLKVTERM|CLKB(_LL)?)$/;
const COL_BEFORE = /^(LTERM\w*|CNR_L[TB]TERM|CLKL)$/;
const COL_AFTER = /^(RTERM\w*|CNR_R[TB]TERM|CLKR|GCLKV\w*|[TB]GCLKVTERM|CLKVC(_LL)?|CLK[BCTV](_LL)?)$/;

/**
 * The rows and columns of tiles named TYPE_X<x>Y<y> (null for a name of another form): rows counted from the top (the
 * highest Y first), columns from the left; each Y / X one row / column, and one more for each lane its tiles use
 * (before / after it); a die with long-line splitters at its centre (CLKC_LL, the XC3S1200E) has an empty row before
 * its centre's clock row. Returns { rows, cols, r: [row of each name], c: [column of each name] } (-1: not a tile name).
 */
export function gridRowsCols(names) {
  const pos = names.map(tileXY);
  const rk = p => [-p.y, ROW_BEFORE.test(p.prefix) ? 0 : ROW_AFTER.test(p.prefix) ? 2 : 1];
  const ck = p => [p.x, COL_BEFORE.test(p.prefix) ? 0 : COL_AFTER.test(p.prefix) ? 2 : 1];
  const rkeys = pos.filter(Boolean).map(rk), ll = pos.find(p => p?.prefix === 'CLKC_LL');
  if (ll) rkeys.push([-ll.y, -1]);
  const dense = keys => {
    const u = [...new Map(keys.map(k => [k.join(), k])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return new Map(u.map((k, i) => [k.join(), i]));
  };
  const R = dense(rkeys), C = dense(pos.filter(Boolean).map(ck));
  return { rows: R.size, cols: C.size, r: pos.map(p => (p ? R.get(rk(p).join()) : -1)), c: pos.map(p => (p ? C.get(ck(p).join()) : -1)) };
}

/** The CLB rows (Y) of type CENTER_SMALL_BRK: the rows of the switch-box tiles named *_BRK (BRAM3_SMALL_BRK, LIOIS_BRK,
 *  RIBUFS_BRK…; a BRAMSITE2_BRK is the block RAM's site tile, in the lowest of its four rows). */
export function brkRowsOf(names) {
  return [...new Set(names.map(tileXY).filter(p => p && /^(BRAM\d_SMALL|[LRTB]IOIS|[LRTB]IBUFS)_BRK$/.test(p.prefix)).map(p => p.y))].sort((a, b) => a - b);
}

/** The tile type of a tile name: its prefix; a CLB's CENTER_SMALL, CENTER_SMALL_BRK in brkRows. */
export function tileTypeOf(name, brkRows = []) {
  const p = tileXY(name);
  if (!p) return null;
  return p.prefix === 'CLB' ? (brkRows.includes(p.y) ? 'CENTER_SMALL_BRK' : 'CENTER_SMALL') : p.prefix;
}

const IO = /IOIS|IBUFS/;
// (a pad's site type by its slot: the k of its I pin's Ik_PINWIRE; an input-only tile's (IBUFS) its own)
const PAD_TYPES = { IOIS: ['DIFFM', 'DIFFS', 'IOB'], IBUFS: ['DIFFMI', 'DIFFSI', 'IBUF'] };
/** The rank of a site's slot among its tile's sites (the order of the report: VCC first but in the clock-buffer tiles
 *  CLKB, CLKT, CLKL, where it is last; a pad's by its k; a slice's by its X then Y; a block RAM before its multiplier). */
export function siteOrder(slot, tileType) {
  if (slot === 'VCC') return /^CLK[BTL](_LL)?$/.test(tileType) ? 1000 : 0;
  const m = /^(P|S|B)(\d+)$/.exec(slot);
  if (m) return { P: 10, S: 20, B: 30 }[m[1]] + +m[2];
  return { RAMB16: 1, MULT18X18SIO: 2, DCM: 3 }[slot] ?? 500;
}

/**
 * A site's type and slot (the key of its place in a tile type, the same in every tile of the type) by rule, from its
 * name, its tile and (a pad) its k: SLICE_X<x>Y<y> a SLICEM where x is even, a SLICEL where odd, slot S<2(x%2)+y%2>;
 * VCC_*, RAMB16_*, MULT18X18_*, DCM_* their own; a BUFGMUX B<rank> (bufgRank: its rank in its tile by X, Y); a pad
 * P<k>. Null for a site no rule names.
 */
export function siteSlot(site, tile, { k = null, bufgRank = null } = {}) {
  let m = /^SLICE_X(\d+)Y(\d+)$/.exec(site);
  if (m) return { type: +m[1] % 2 ? 'SLICEL' : 'SLICEM', slot: `S${2 * (+m[1] % 2) + (+m[2] % 2)}` };
  if (/^VCC_X\d+Y\d+$/.test(site)) return { type: 'VCC', slot: 'VCC' };
  if (/^RAMB16_X\d+Y\d+$/.test(site)) return { type: 'RAMB16', slot: 'RAMB16' };
  if (/^MULT18X18_X\d+Y\d+$/.test(site)) return { type: 'MULT18X18SIO', slot: 'MULT18X18SIO' };
  if (/^DCM_X\d+Y\d+$/.test(site)) return { type: 'DCM', slot: 'DCM' };
  if (/^BUFGMUX_X\d+Y\d+$/.test(site) && bufgRank !== null) return { type: 'BUFGMUX', slot: `B${bufgRank}` };
  m = IO.exec(tileXY(tile)?.prefix || '');
  if (m && k !== null) return { type: PAD_TYPES[m[0]][k], slot: `P${k}` };
  return null;
}

/** A pad's k from its pins' wires: its I pin's Ik_PINWIRE, else an ICLK / OTCLK pin's wire <pin><k>. */
export function padK(pins) {
  for (const p of pins) { const m = p.pin === 'I' && /^I(\d)_PINWIRE$/.exec(p.wire); if (m) return +m[1]; }
  for (const p of pins) { const m = /^(ICLK|OTCLK)[12]$/.test(p.pin) && /^(?:ICLK|OTCLK)[12](\d)$/.exec(p.wire); if (m) return +m[1]; }
  return null;
}

/**
 * The tiles measured: every tile a measurement names. obs: the observation (obs.json); probes: { yes } of the arc probes;
 * joins: [[a, b]] the tests confirmed; switchTiles: the tile probe's tiles.
 */
export function measuredTiles({ obs, probes = { yes: [] }, joins = [], switchTiles = [] }) {
  const out = new Set(switchTiles);
  const end = k => out.add(k.slice(0, k.indexOf('/')));
  for (const p of obs.pips) out.add(p.tile);
  for (const s of [...(obs.sites || []), ...obs.pins]) out.add(s.tile);
  for (const [a, b] of [...obs.joins, ...(obs.decided || []), ...joins]) { end(a); end(b); }
  for (const pj of obs.pinJoins || []) { out.add(pj.tile); end(pj.end); }
  for (const p of probes.yes || []) out.add(p.tile);
  return [...out].filter(t => tileXY(t));
}

/**
 * The measured grid of a die: { part, rows, cols, brkRows, tiles: [{ name, type, r, c, sites: [{ name, type, slot,
 * bonded }] }] (by row, then column; the sites by siteOrder), site: name -> { tile, slot, type }, unknown: [sites no rule
 * names], vccByRule: the VCC sites named by rule }.
 * obs, others (the other packages' observations: their slices', block RAMs'… sites; their pads are named as that
 * package's, so only their slot is taken, padSlots), probes, joins, switchTiles as measuredTiles; vccTypes: (tile type)
 * -> whether its tiles have a VCC site no design showed.
 */
export function measuredGrid({ part, obs, others = [], probes, joins, switchTiles, vccTypes = null }) {
  const names = measuredTiles({ obs, probes, joins, switchTiles }).sort();
  const brkRows = brkRowsOf(names), { rows, cols, r, c } = gridRowsCols(names);
  const tiles = names.map((name, i) => ({ name, type: tileTypeOf(name, brkRows), r: r[i], c: c[i], sites: [] }));
  const byName = new Map(tiles.map(t => [t.name, t]));
  // the sites: ISE's placements and routes; another package's but its pads
  const pinsOf = new Map(), tileOf = new Map();
  for (const p of obs.pins) { if (!pinsOf.has(p.site)) pinsOf.set(p.site, []); pinsOf.get(p.site).push(p); tileOf.set(p.site, p.tile); }
  for (const s of [...(obs.sites || []), ...(obs.pinJoins || [])]) tileOf.set(s.site, s.tile);
  for (const o of others) {
    for (const s of [...(o.sites || []), ...o.pins]) if ((/^VCC_/.test(s.site) || !IO.test(tileXY(s.tile)?.prefix || '')) && !tileOf.has(s.site)) tileOf.set(s.site, s.tile);
  }
  const bufg = new Map();
  for (const [site, tile] of tileOf) if (/^BUFGMUX_/.test(site)) { if (!bufg.has(tile)) bufg.set(tile, []); bufg.get(tile).push(site); }
  const xy = s => /_X(\d+)Y(\d+)$/.exec(s).slice(1).map(Number);
  for (const l of bufg.values()) l.sort((a, b) => xy(a)[0] - xy(b)[0] || xy(a)[1] - xy(b)[1]);
  const site = new Map(), unknown = [];
  for (const [name, tile] of tileOf) {
    const t = byName.get(tile);
    const io = IO.test(tileXY(tile)?.prefix || '') && !/^VCC_/.test(name);
    const s = t && siteSlot(name, tile, { k: io ? padK(pinsOf.get(name) || []) : null, bufgRank: bufg.get(tile)?.indexOf(name) ?? null });
    if (!s) { unknown.push(name); continue; }
    if (t.sites.some(x => x.slot === s.slot)) throw new Error(`grid: ${name} and ${t.sites.find(x => x.slot === s.slot).name} both in slot ${s.slot} of ${tile}`);
    t.sites.push({ name, type: s.type, slot: s.slot, bonded: io ? 1 : 0 });
    site.set(name, { tile, slot: s.slot, type: s.type });
  }
  // (a VCC site in every tile of a type ISE showed one in, or of a type vccTypes(type) says has one (chip.mjs: a type whose
  // PIPs leave one VCC wire), named by rule: VCC_X<i>Y<j>, i the rank of its tile's column among those of these tiles, j
  // of its row from the bottom; every VCC site ISE named follows it)
  const seenVcc = new Set(tiles.filter(t => t.sites.some(s => s.slot === 'VCC')).map(t => t.type));
  const vccTiles = tiles.filter(t => seenVcc.has(t.type) || vccTypes?.(t.type));
  const vc = [...new Set(vccTiles.map(t => t.c))].sort((a, b) => a - b), vr = [...new Set(vccTiles.map(t => t.r))].sort((a, b) => b - a);
  let vccByRule = 0;
  for (const t of vccTiles) {
    const name = `VCC_X${vc.indexOf(t.c)}Y${vr.indexOf(t.r)}`, s = t.sites.find(x => x.slot === 'VCC');
    if (s && s.name !== name) throw new Error(`grid: ${t.name}'s VCC site is ${s.name}, the rule names it ${name}`);
    if (s) continue;
    t.sites.push({ name, type: 'VCC', slot: 'VCC', bonded: 0 });
    site.set(name, { tile: t.name, slot: 'VCC', type: 'VCC' });
    vccByRule++;
  }
  for (const t of tiles) t.sites.sort((a, b) => siteOrder(a.slot, t.type) - siteOrder(b.slot, t.type));
  tiles.sort((a, b) => a.r - b.r || a.c - b.c);
  return { part, rows, cols, brkRows, tiles, site, unknown, vccByRule };
}

/** The slot of each of another package's pads (renamed: its tile's slot P<k>, k from its pins), keyed by its site name. */
export function padSlots(o) {
  const pinsOf = new Map();
  for (const p of o.pins) if (IO.test(tileXY(p.tile)?.prefix || '')) { if (!pinsOf.has(p.site)) pinsOf.set(p.site, []); pinsOf.get(p.site).push(p); }
  const out = new Map();
  for (const [s, pins] of pinsOf) {
    if (/^VCC_/.test(s)) continue;
    const k = padK(pins);
    if (k !== null) out.set(s, `P${k}`);
  }
  return out;
}
