// Stage S6-B / S6-C (#725), checked: the LUT and slice databases predict the slices of designs ISE implemented. For
// each slice of an ISE XDL its bits at the positions the databases know (the LUTs' and the settings') are computed
// from its settings and compared with ISE's bitstream: the LUTs from their equations, the settings as the --full
// round's base with each element that differs changed (that round's change, or the --nets or plain round's when it
// measured none; COUTUSED none: off, it cleared the CY0 bits of a chain the harness did not use; the carry from the
// slice below, CARRY4 without PRECYINIT, which the harness had no net for: bit 51 of the CY0s' frame, CIN_BIT). A slice's kind is
// its site's (ISE places a SLICEX on a SLICEL's site), and the two slices of a tile are checked together (a SLICEX's
// settings in frames before its LUTs are its neighbour's frames; its model by its tile's type).
//   node research/s6/check-slice6.mjs <dir> …        (each with top.xdl and top.bit, e.g. night 1's impl-nexys3/*)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXdl, evalLut } from '../../packages/silinx-fpga/src/xdl.js';
import { readBit6, bitFormat6, emptyFdri, FRAME_WORDS } from '../../packages/silinx-fpga/src/fpga/s6/bitstream.js';
import { baseSettings } from './gen-slice6.mjs';
import { s6Device } from '../../test/s6-lib.mjs';
import { LUTS } from './gen-lutmap6.mjs';

const KIND = { SLICEX: 'X', SLICEL: 'L', SLICEM: 'M' };
const key = ([f, b]) => `${f},${b}`;
const ROUNDS = ['full', 'nets', 'slice'];
/** The carry in from CIN (CARRY4 used, PRECYINIT unset): a bit of the frame of a SLICEL's or SLICEM's CY0s. */
export const CIN_BIT = { L: '4,51', M: '5,51' };

/**
 * The databases of a device: { lut, rounds: { full, nets, slice } } (research/s6/db); the slice settings, offsets
 * from a slice's base, measured on the XC6SLX16 only, are its (the XC6SLX45's tiles are the same).
 */
export function loadDb(device) {
  const read = (d, n) => JSON.parse(fs.readFileSync(new URL(`./db/${d}-${n}.json`, import.meta.url), 'utf8'));
  return {
    lut: read(device, 'lut'), rounds: { full: read('xc6slx16', 'slice-full'), nets: read('xc6slx16', 'slice-nets'), slice: read('xc6slx16', 'slice') },
    // a SLICEX's settings in the frames before its tile's (minor 20 of the column) by its tile's type
    sliceX: { CLEXL: read('xc6slx16', 'slice-full-clexl13'), CLEXM: read('xc6slx16', 'slice-full-clexm') },
  };
}

/** A LUT's 64 entries from its O6 and O5 equations (entries with A6 = 0 from O5 when there is one). */
export function lutEntries(o6, o5) {
  const out = [];
  for (let e = 0; e < 64; e++) {
    const v = {};
    for (let k = 0; k < 6; k++) v[`A${k + 1}`] = (e >> k) & 1;
    const eq = o5 != null && !(e & 32) ? o5 : o6;
    out.push(eq == null ? 0 : evalLut(eq, v) ? 1 : 0);
  }
  return out;
}

/**
 * A kind's model: { lut: { A … D: [64 offsets] }, positions: Set of the settings' offsets, base: Set (the full
 * round's base, its LUTs' bits left out), baseCfg: Map element -> value, delta(element, value) -> { set, clear } |
 * null (not measured) }.
 */
export function kindModel(db, kind, tileType = 'CLEXL') {
  // a SLICEX: the --full round measured in tiles of its type (its base is minor 26 of a CLEXL column, 27 of a CLEXM)
  if (kind === 'X' && db.sliceX) db = { ...db, rounds: { ...db.rounds, full: db.sliceX[tileType] } };
  const lut = db.lut.kinds[kind], lutPos = new Set(Object.values(lut).flat().map(key)), positions = new Set();
  for (const r of ROUNDS) {
    const k = db.rounds[r].kinds[kind];
    for (const p of k.base) if (!lutPos.has(key(p))) positions.add(key(p));
    for (const v of Object.values(k.variants)) for (const p of [...v.set, ...v.clear]) if (!lutPos.has(key(p))) positions.add(key(p));
  }
  const full = db.rounds.full.kinds[kind];
  const base = new Set(full.base.map(key).filter(p => positions.has(p)));
  const baseCfg = new Map(baseSettings({ nets: true, full: true, kind }).filter(([e]) => !/[56]LUT$/.test(e)).map(([e, , v]) => [e, v]));
  const delta = (e, v) => {
    if (e === 'COUTUSED') return { set: [], clear: [] };
    const name = v === '' ? e : `${e}=${v}`;
    let seen = false;
    for (const r of ROUNDS) {
      const x = db.rounds[r].kinds[kind].variants[name];
      if (!x) continue;
      seen = true;
      const set = x.set.map(key).filter(p => positions.has(p)), clear = x.clear.map(key).filter(p => positions.has(p));
      if (set.length || clear.length) return { set, clear };
    }
    return seen ? { set: [], clear: [] } : null;
  };
  if (CIN_BIT[kind]) positions.add(CIN_BIT[kind]);
  return { lut, lutPos, positions, base, baseCfg, delta, kind };
}

/**
 * A slice's cfg with its route-throughs as settings: X:XMUX the output mux on O6, Xk:X the LUT's O6 = Ak (when the
 * slice has no LUT there).
 */
export function routeThroughs(cfg) {
  const out = cfg.filter(c => c.attr !== '_ROUTETHROUGH'), has = new Set(out.filter(c => c.value !== '#OFF').map(c => c.attr));
  for (const c of cfg.filter(x => x.attr === '_ROUTETHROUGH')) {
    let m;
    if ((m = c.name.match(/^([A-D])$/)) && c.value === `${m[1]}MUX` && !has.has(`${m[1]}OUTMUX`)) out.push({ attr: `${m[1]}OUTMUX`, name: '', value: 'O6' });
    else if ((m = c.name.match(/^([A-D])([1-6])$/)) && c.value === m[1] && !has.has(`${m[1]}6LUT`)) out.push({ attr: `${m[1]}6LUT`, name: '', value: `#LUT:O6=A${m[2]}` });
  }
  return out.filter((c, i) => !(c.value === '#OFF' && out.some((d, j) => j !== i && d.attr === c.attr && d.value !== '#OFF')));
}

/** A slice's predicted bits: { bits: Set of offsets, unknown: ['element=value' not measured], ram } from its cfg. */
export function predictSlice(model, cfg) {
  cfg = routeThroughs(cfg);
  const by = new Map(cfg.map(c => [c.attr, c])), bits = new Set(model.base), unknown = [];
  let ram = false;
  for (const p of LUTS) {
    const lutOf = e => { const v = by.get(e)?.value; return v && v !== '#OFF' ? v : null; };
    const o6 = lutOf(`${p}6LUT`), o5 = lutOf(`${p}5LUT`);
    // a RAM's or ROM's contents as their INIT (0x…): only all zeros are checked (their layout is not measured)
    const mem = [o6, o5].filter(v => v && !v.startsWith('#LUT:'));
    if (mem.length) { if (mem.some(v => !/^#R[AO]M:O[56]=0x0+$/.test(v))) ram = true; continue; }
    const eq = v => (v && v.startsWith('#LUT:') ? v.replace(/^#LUT:O[56]=/, '') : null);
    lutEntries(eq(o6), eq(o5)).forEach((x, e) => { if (x) bits.add(key(model.lut[p][e])); });
  }
  // the elements the base has and the design changes or leaves out, and the ones it adds
  const value = e => { const c = by.get(e); if (!c || c.value === '#OFF') return '#OFF'; return /^(CARRY4|CYINITGND|CYINITVCC|F7AMUX|F7BMUX|F8MUX|[A-D]5FF)$/.test(e) ? '' : c.value; };
  const elements = new Set([...model.baseCfg.keys(), ...cfg.map(c => c.attr).filter(a => !/LUT$|^_/.test(a))]);
  for (const e of elements) {
    const v = value(e), b = model.baseCfg.has(e) ? model.baseCfg.get(e) : '#OFF';
    if (v === b) continue;
    const d = model.delta(e, v);
    if (!d) { unknown.push(`${e}=${v}`); continue; }
    // a RAM mode's change of the LUT's bits is its harness LUT's (O6 = A1 * A2), not this one's: its settings only
    if (/RAMMODE$/.test(e)) { for (const p of d.clear) if (!model.lutPos.has(p)) bits.delete(p); for (const p of d.set) if (!model.lutPos.has(p)) bits.add(p); continue; }
    for (const p of d.clear) bits.delete(p);
    for (const p of d.set) bits.add(p);
  }
  if (CIN_BIT[model.kind] && value('CARRY4') === '' && value('PRECYINIT') === '#OFF') bits.add(CIN_BIT[model.kind]);
  return { bits, unknown, ram };
}

/**
 * A design checked, tile by tile: { slices, ram, mismatches: [{ tile, sites, missing: ['kind frame,bit' (offsets from
 * the slice whose position it is) ISE sets and the model does not], extra: [the other way] }], unknown: Map 'kind
 * element=value' -> count }.
 */
export function checkDesign(xdlText, bitBytes, db) {
  const design = parseXdl(xdlText), { fdri, device } = readBit6(bitBytes), dev = bitFormat6(device.part);
  const empty = emptyFdri(dev), models = {}, out = { slices: 0, tiles: 0, ram: 0, mismatches: [], unknown: new Map() };
  const sites = s6Device(`${device.device}${device.part.slice(device.device.length - 2)}-3`).sites.slices;
  const kindOf = new Map([...sites.values()].map(s => [s.name, s.kind]));
  const tiles = new Map();
  for (const inst of design.insts) {
    if (!KIND[inst.type] || !inst.placed) continue;
    const kind = kindOf.get(inst.site), type = inst.tile.replace(/_.*/, ''), [f0, b0] = db.lut.slices[inst.site];
    const model = models[`${kind} ${type}`] ??= kindModel(db, kind, type);
    const p = predictSlice(model, inst.cfg), t = tiles.get(inst.tile) ?? { sites: [], known: new Map(), bits: new Set(), ram: false };
    tiles.set(inst.tile, t);
    out.slices++;
    t.sites.push(inst.site);
    if (p.ram) { out.ram++; t.ram = true; }
    for (const u of p.unknown) out.unknown.set(`${kind} ${u}`, (out.unknown.get(`${kind} ${u}`) || 0) + 1);
    const abs = x => { const [f, b] = x.split(',').map(Number); return `${f0 + f},${b0 + b}`; };
    for (const x of [...model.lutPos, ...model.positions]) if (!t.known.has(abs(x))) t.known.set(abs(x), `${kind} ${x}`);
    for (const x of p.bits) t.bits.add(abs(x));
  }
  for (const [tile, t] of tiles) {
    if (t.ram) continue;
    out.tiles++;
    const isSet = x => { const [f, b] = x.split(',').map(Number); return (fdri[f * FRAME_WORDS + (b >> 4)] ^ empty[f * FRAME_WORDS + (b >> 4)]) >> (15 - (b & 15)) & 1; };
    const missing = [], extra = [];
    for (const [x, name] of t.known) { const a = isSet(x), m = t.bits.has(x); if (a && !m) missing.push(name); else if (m && !a) extra.push(name); }
    if (missing.length || extra.length) out.mismatches.push({ tile, sites: t.sites, missing, extra });
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) { console.error('usage: node research/s6/check-slice6.mjs <dir> …'); process.exit(1); }
  const dbs = {}, total = { slices: 0, tiles: 0, ram: 0, bad: 0 }, positions = new Map();
  for (const dir of dirs) {
    const bit = fs.readFileSync(path.join(dir, 'top.bit')), device = readBit6(bit).device.device;
    const r = checkDesign(fs.readFileSync(path.join(dir, 'top.xdl'), 'utf8'), bit, dbs[device] ??= loadDb(device));
    total.slices += r.slices; total.tiles += r.tiles; total.ram += r.ram; total.bad += r.mismatches.length;
    for (const m of r.mismatches) for (const [s, l] of [['+', m.missing], ['-', m.extra]]) for (const x of l) { const k = `${s}${x}`; positions.set(k, (positions.get(k) || 0) + 1); }
    console.log(`${dir}: ${r.slices} slices, ${r.ram} with a RAM's contents (their tiles not checked), ${r.tiles} tiles checked, ${r.mismatches.length} differ${r.unknown.size ? `; not measured: ${[...r.unknown].map(([k, n]) => `${k} ×${n}`).join(', ')}` : ''}`);
  }
  console.log(`total: ${total.slices} slices, ${total.ram} with a RAM's contents, ${total.tiles} tiles checked, ${total.bad} differ`);
  if (positions.size) console.log('positions (+ ISE sets, the model not; - the other way):', [...positions].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, n]) => `${k} ×${n}`).join(', '));
}
