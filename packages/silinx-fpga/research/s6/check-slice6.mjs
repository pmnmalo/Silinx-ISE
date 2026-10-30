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
import { parseXdl, evalLut } from '../../src/xdl.js';
import { readBit6, bitFormat6, emptyFdri, FRAME_WORDS } from '../../src/fpga/s6/bitstream.js';
import { baseSettings } from './gen-slice6.mjs';
import { s6Device } from '../../../../test/s6-lib.mjs';
import { LUTS } from './gen-lutmap6.mjs';
export { CIN_BIT, lutEntries, kindModel, routeThroughs, predictSlice } from '../../src/fpga/s6/bitgen-slice.js';
import { CIN_BIT, lutEntries, kindModel, routeThroughs, predictSlice } from '../../src/fpga/s6/bitgen-slice.js';

const KIND = { SLICEX: 'X', SLICEL: 'L', SLICEM: 'M' };
const key = ([f, b]) => `${f},${b}`;
const ROUNDS = ['full', 'nets', 'slice'];

/**
 * The databases of a device: { lut, rounds: { full, nets, slice } } (packages/silinx-fpga/bitdb/s6); the slice settings, offsets
 * from a slice's base, measured on the XC6SLX16 only, are its (the XC6SLX45's tiles are the same).
 */
export function loadDb(device) {
  const read = (d, n) => JSON.parse(fs.readFileSync(new URL(`../../bitdb/s6/${d}-${n}.json`, import.meta.url), 'utf8'));
  return {
    lut: read(device, 'lut'), rounds: { full: read('xc6slx16', 'slice-full'), nets: read('xc6slx16', 'slice-nets'), slice: read('xc6slx16', 'slice') },
    // a SLICEX's settings in the frames before its tile's (minor 20 of the column) by its tile's type
    sliceX: { CLEXL: read('xc6slx16', 'slice-full-clexl13'), CLEXM: read('xc6slx16', 'slice-full-clexm') },
  };
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
