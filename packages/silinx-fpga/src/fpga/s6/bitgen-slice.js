// Silinx toolchain - a Spartan-6 slice's bits from its settings (#732; the databases measured in research/s6, #725):
// its LUTs from their equations, its settings as the measured base slice's with each element that differs changed.
// Browser + Node.
import { evalLut } from '../../xdl.js';

export const LUTS = ['A', 'B', 'C', 'D'];
const EQN = '(A1*A2)';
const key = ([f, b]) => `${f},${b}`;
const ROUNDS = ['full', 'nets', 'slice'];

/**
 * The base slice's settings: [[element, BEL name, value]] (nets: the outputs AMUX … DMUX on O6; full: on the 5-input
 * flip-flops, with the 5-input LUTs, and a SLICEL's or SLICEM's carry chain and F7 / F8).
 */
export function baseSettings({ nets = false, full = false, kind = 'L' } = {}) {
  const out = [];
  for (const p of LUTS) {
    out.push([`${p}6LUT`, `s.${p}6`, `#LUT:O6=${EQN}`], [`${p}FF`, `s.${p}FF`, '#FF'], [`${p}FFMUX`, '', 'O6'],
      [`${p}FFSRINIT`, '', 'SRINIT0'], [`${p}USED`, '', '0']);
    if (full) {
      out.push([`${p}5LUT`, `s.${p}5`, `#LUT:O5=${EQN}`], [`${p}5FF`, `s.${p}5FF`, ''], [`${p}5FFSRINIT`, '', 'SRINIT0'], [`${p}OUTMUX`, '', `${p}5Q`]);
      if (kind !== 'X') out.push([`${p}CY0`, '', 'O5']);
    } else if (nets) out.push([`${p}OUTMUX`, '', 'O6']);
  }
  out.push(['CLKINV', '', 'CLK'], ['SYNC_ATTR', '', 'SYNC'], ['CEUSED', '', '0'], ['SRUSED', '', '0']);
  if (full && kind !== 'X') {
    out.push(['CARRY4', 's.CARRY4', ''], ['CYINITGND', 's.CYINITGND', ''], ['PRECYINIT', '', '0'], ['COUTUSED', '', '0'],
      ['F7AMUX', 's.F7AMUX', ''], ['F7BMUX', 's.F7BMUX', ''], ['F8MUX', 's.F8MUX', '']);
  }
  return out;
}

/** The carry in from CIN (CARRY4 used, PRECYINIT unset): a bit of the frame of a SLICEL's or SLICEM's CY0s. */
export const CIN_BIT = { L: '4,51', M: '5,51' };

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
