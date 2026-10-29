// Stage S6-F (#728): a block RAM's or a DSP48A1's bits from its settings, by db/<device>-hard.json (ana-hard6.mjs):
// its slot's base with each setting's option set and cleared (a combination measured as one first), INIT_A / INIT_B / SRVAL_A / SRVAL_B's bits, and the
// contents (INIT_xx, INITP_xx) in the BRAM frames from the site's first bit (a RAMB16BWER with neither port 36 bits wide
// in its narrow order). Shared by residual6.mjs and the tests.
import { gridRegion } from './ana-pipdrop6.mjs';
import { hardBase } from './gen-hard6.mjs';

export const HARD_TYPES = ['RAMB16BWER', 'RAMB8BWER', 'DSP48A1'];

/** A hex value's set bits (bit 0 the last digit's lowest). */
export function hexBits(hex) {
  const out = [];
  for (let d = 0; d < hex.length; d++) { const v = parseInt(hex[hex.length - 1 - d], 16); for (let b = 0; b < 4; b++) if ((v >> b) & 1) out.push(d * 4 + b); }
  return out;
}

/** The field indices (of the bits measured at full width) INIT_x / SRVAL_x's value bit k sets on a port of `width` bits:
 * [[k, index]]: k below the width at k, a 9- or 18-bit port's parity bits (k from 8 or 16) at the parity's too (from
 * 32, a RAMB8BWER's 16); a RAMB8BWER's 36 (SDP) its 18. */
export function fieldIndices(type, width) {
  const r8 = type === 'RAMB8BWER', w = r8 && width === 36 ? 18 : width, out = [];
  for (let k = 0; k < w; k++) {
    out.push([k, k]);
    const d = w === 9 ? 8 : w === 18 ? 16 : null, p = r8 ? 16 : 32;
    if (d !== null && k >= d && p + k - d !== k) out.push([k, p + k - d]);
  }
  return out;
}

/** An instance's bits: { bits: ['frame,bit'], unknown: [what the database has not] }; pins: its pins with a net (a block
 * RAM's clock pin sets its bits only then). */
export function predictHard(inst, device, dev, hard, pins = new Set()) {
  const t = hard[inst.type], bits = new Set(), unknown = [];
  if (!t) return { bits: [], unknown: [`${inst.type} not measured`] };
  const slot = t.slots[inst.type === 'RAMB8BWER' ? +inst.site.match(/Y(\d+)$/)[1] % 2 : 0], [f0, b0] = gridRegion(device, dev, inst.tile);
  const base = new Map(hardBase(inst.type)), on = new Set(slot.base), main = dev.rows * dev.rowFrames;
  // a combination measured as one (HARD_COMBOS) first, its elements then skipped
  const value = new Map(inst.cfg.map(c => [c.attr, String(c.value)])), done = new Set(), options = slot.alone ?? slot.options;
  for (const [name, o] of Object.entries(options)) {
    const parts = name.split('+').map(q => q.split('='));
    if (parts.length < 2 || !parts.every(([e, v]) => value.get(e) === v)) continue;
    for (const x of o.clear) on.delete(x);
    for (const x of o.set) on.add(x);
    for (const [e] of parts) done.add(e);
  }
  for (const c of inst.cfg) {
    if (!base.has(c.attr) || done.has(c.attr) || /^(INIT|SRVAL)/.test(c.attr) || String(c.value) === base.get(c.attr)) continue;
    const o = options[`${c.attr}=${c.value}`];
    if (!o) { unknown.push(`${inst.type} ${c.attr}=${c.value}`); continue; }
    for (const x of o.clear) on.delete(x);
    for (const x of o.set) on.add(x);
  }
  for (const p of pins) if (slot.pins?.[p]) for (const x of slot.pins[p]) on.add(x);
  for (const x of on) { const [f, b] = x.split(',').map(Number); bits.add(`${f0 + f},${b0 + b}`); }
  if (!t.bram) return { bits: [...bits], unknown };
  const first = t.bram.sites[inst.site], put = o => { const q = first + o; bits.add(`${main + Math.floor(q / 1040)},${q % 1040}`); };
  for (const c of inst.cfg) {
    let m;
    if (slot.fields[c.attr]) {
      const set = new Set(hexBits(String(c.value))), width = +(value.get(`DATA_WIDTH_${c.attr.slice(-1)}`) ?? base.get(`DATA_WIDTH_${c.attr.slice(-1)}`));
      for (const [k, i] of fieldIndices(inst.type, width)) {
        const x = set.has(k) && slot.fields[c.attr][i];
        if (x) { const [f, b] = x.split(',').map(Number); bits.add(`${f0 + f},${b0 + b}`); }
      }
    }
    else if ((m = c.attr.match(/^INIT(P?)_([0-9A-F]{2})$/))) {
      const layout = t.bram.narrow && !inst.cfg.some(q => /^DATA_WIDTH_[AB]$/.test(q.attr) && String(q.value) === '36') ? t.bram.narrow : t.bram;
      const table = m[1] ? layout.parity : layout.data, k = parseInt(m[2], 16);
      for (const i of hexBits(String(c.value))) put(table[k * 256 + i]);
    }
  }
  return { bits: [...bits], unknown };
}
