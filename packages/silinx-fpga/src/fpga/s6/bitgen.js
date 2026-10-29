// Silinx toolchain - the Spartan-6's configuration bits of a placed and routed design (#732; the databases measured
// in research/s6 against ISE's bitgen, #724 … #1951: bitdb/s6): every bit of the rows' frames, the block RAMs' frames
// and the I/O words the design sets beyond an empty device's, from its instances' settings (the pads, the slices, the
// DCMs and PLLs, the block RAMs and DSP48A1s) and its nets' PIPs, and what the databases do not know; its .bit
// (bitstreamS6), byte for byte as ISE's bitgen writes the same routed design. Browser + Node.
import { s6Sites } from './sites.js';
import { S6_DEVICES, FRAME_WORDS, bitFormat6, emptyFdri, writeBit6 } from './bitstream.js';
import { tileRegion, gridRegion, columnOf } from './bitgen-regions.js';
import { kindModel, predictSlice } from './bitgen-slice.js';
import { pipDirections, pipLookup } from './bitgen-pips.js';
import { cmtCfg, cmtPath, predictCmt, predictCmtSettings, cmtRegcBits, cmtInputBits } from './bitgen-cmt.js';
import { HARD_TYPES, predictHard } from './bitgen-hard.js';

const INT_LIKE = /^(INT|INT_BRK|INT_BRAM|INT_BRAM_BRK|IOI_INT|LIOI_INT|INT_GCLK)_X/;
const sitesCache = new WeakMap();
const sitesOf = device => sitesCache.get(device) ?? sitesCache.set(device, s6Sites(device)).get(device);

/** A bit `off` bits from a pad's first output bit (in FDRI's order: 1040 bits a frame). */
export function padBit(pad, off) {
  const [f0, b0] = pad.base.map(x => x.split(',').map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1])[0];
  const n = f0 * 1040 + b0 + off;
  return `${Math.floor(n / 1040)},${n % 1040}`;
}

/**
 * A pad's bits from its IOB's settings (db/<device>-iob.json's pad): an output's base, an input's, both for a
 * bidirectional one; the variants' changes for its drive, slew, standards and pull; an output on a net also the bit
 * 15 before its first (its path from the OLOGIC: every routed output of the examples, both boards, has it; the pads'
 * designs had no nets); unknown: the settings not measured.
 */
export function predictIob(pad, cfg, { routed = true } = {}) {
  const by = new Map(cfg.filter(c => c.value !== '#OFF').map(c => [c.attr, c.value])), out = by.has('OUSED'), inb = by.has('IMUX') || by.has('BYPASS_MUX');
  const bits = new Set(out ? pad.base : inb ? pad.input : []), unknown = [];
  const apply = (name, v = pad.variants[name]) => { if (!v) { unknown.push(name); return; } for (const x of v.clear) bits.delete(x); for (const x of v.set) bits.add(x); };
  if (out && inb) apply('inout');
  if (out) {
    if (by.get('DRIVEATTRBOX') && by.get('DRIVEATTRBOX') !== '12') apply(`drive${by.get('DRIVEATTRBOX')}`);
    if (by.get('SLEW') && by.get('SLEW') !== 'SLOW') apply(`slew${by.get('SLEW')}`);
    if (by.get('OSTANDARD') && by.get('OSTANDARD') !== 'LVCMOS25') apply(`out${by.get('OSTANDARD')}`);
    if (by.has('TUSED') && !inb) apply('tri');
    if (routed) bits.add(padBit(pad, -15));
  } else if (inb) {
    const s = by.get('ISTANDARD');
    if (s && !['LVCMOS25', 'LVCMOS33', 'LVTTL'].includes(s)) apply(`in${s} (from in)`);
    if (by.get('PULLTYPE')) apply(`in${by.get('PULLTYPE')} (from in)`);
  }
  return { bits, unknown };
}

/** The bits the databases predict for a design: { bits: Set 'frame,bit', unknown: Map 'what' -> count }. */
export function predictDesign(design, device, dev, db) {
  const bits = new Set(), unknown = new Map(), note = w => unknown.set(w, (unknown.get(w) || 0) + 1);
  if (db.iob) {
    let used = false;
    for (const inst of design.insts) {
      if (inst.type !== 'IOB' || !inst.placed) continue;
      const pad = db.iob.pads[inst.site];
      if (!pad) { note(`IOB ${inst.site} not measured`); continue; }
      used = true;
      const p = predictIob(pad, inst.cfg);
      for (const x of p.bits) bits.add(x);
      for (const u of p.unknown) note(`IOB ${u}`);
    }
    if (used) for (const x of db.iob.globals) bits.add(x);
  }
  // a clock pad on a BUFG: its bit of the REGC frame (the BUFGMUX's input selection) and its clock input's I/O bit
  if (db.clocks && db.iob) {
    const inst = new Map(design.insts.map(i => [i.name, i])), regc = db.clocks.regcFrame[db.part.replace(/csg.*/, '')];
    for (const net of design.nets) {
      const src = inst.get(net.outpins[0]?.inst);
      if (src?.type !== 'IOB' || !net.inpins.some(p => /^BUFG/.test(inst.get(p.inst)?.type || ''))) continue;
      const c = db.clocks.pads[src.site];
      if (!c) { note(`clock pad ${src.site} not measured`); continue; }
      bits.add(`${regc},${c.regc}`);
      bits.add(padBit(db.iob.pads[src.site], c.iob));
    }
  }
  const kindOf = new Map([...sitesOf(device).slices.values()].map(s => [s.name, s.kind])), models = {};
  for (const inst of design.insts) {
    if (!/^SLICE/.test(inst.type) || !inst.placed) continue;
    const kind = kindOf.get(inst.site), type = inst.tile.replace(/_.*/, ''), [f0, b0] = db.slices.lut.slices[inst.site];
    const p = predictSlice(models[`${kind} ${type}`] ??= kindModel(db.slices, kind, type), inst.cfg);
    if (p.ram) note(`${inst.site} a RAM's contents`);
    for (const u of p.unknown) note(`SLICE${kind} ${u}`);
    for (const x of p.bits) { const [f, b] = x.split(',').map(Number); bits.add(`${f0 + f},${b0 + b}`); }
    // a SLICEM as a shift register or RAM on a clock: minors 16 to 19 of its column's clock row word (bit 527)
    if (inst.cfg.some(c => /RAMMODE$/.test(c.attr) && c.value !== '#OFF') && inst.cfg.some(c => c.attr === 'CLKINV' && c.value !== '#OFF')) {
      const c0 = columnOf(dev, f0)[0];
      for (let m = 16; m < 20; m++) bits.add(`${c0 + m},527`);
    }
  }
  // a DCM or PLL at the site measured, with the base's settings: the base's bits with its pad's and BUFGs' changes;
  // elsewhere its settings' (db/<device>-cmt-settings.json, #1951), its clock path not yet
  if (db.cmt || db.cmtSettings) {
    for (const inst of design.insts) {
      if (!/^(DCM|PLL_ADV)$/.test(inst.type) || !inst.placed) continue;
      const kind = db.cmt && { DCM: db.cmt.dcm, PLL_ADV: db.cmt.pll }[inst.type];
      const p = kind && kind.site === inst.site && kind.cfg === cmtCfg(inst) ? predictCmt(kind, cmtPath(design, inst)) : null;
      if (p) { for (const x of p) bits.add(x); continue; }
      const s = db.cmtSettings && predictCmtSettings(inst, db.cmtSettings, Math.floor(gridRegion(device, dev, inst.tile)[0] / dev.rowFrames) * dev.rowFrames);
      if (s) for (const x of s) bits.add(x);
      // the BUFGMUXes it drives: their REGC bits (its paths' PIPs are the routing's)
      const r = db.clocks && cmtRegcBits(design, inst, db.part.replace(/csg.*/, ''), db.clocks.regcFrame[db.part.replace(/csg.*/, '')]);
      if (r) for (const x of r) bits.add(x);
      // its site's, its outputs' and its BUFIO2's bits (db/<device>-cmt-input.json)
      const c = db.cmtInput && cmtInputBits(design, inst, db.cmtInput);
      if (c) for (const x of c) bits.add(x);
      if (!s) note(`${inst.type} ${inst.site} (its settings not measured)`);
    }
  }
  // a block RAM's or a DSP48A1's settings and contents
  if (db.hard) {
    const pins = new Map();
    for (const net of design.nets) for (const q of net.inpins) (pins.get(q.inst) ?? pins.set(q.inst, new Set()).get(q.inst)).add(q.pin);
    for (const inst of design.insts) {
      if (!HARD_TYPES.includes(inst.type) || !inst.placed) continue;
      const p = predictHard(inst, device, dev, db.hard, pins.get(inst.name), db.hardBase?.bases);
      for (const x of p.bits) bits.add(x);
      for (const u of p.unknown) note(u);
    }
  }
  for (const net of design.nets) {
    const dirs = (net.pips || []).some(p => p.dir === '=-') ? pipDirections(device, net, design) : null;
    (net.pips || []).forEach((p, i) => {
      if (/^CLEX[LM]_/.test(p.tile)) return;
      let rel, r;
      if (INT_LIKE.test(p.tile)) {
        const [from, to] = dirs?.[i] ?? [p.from, p.to];
        rel = pipLookup(db.int, from, p.dir, to);
        r = tileRegion(dev, p.tile);
      } else {
        const x = db.other.pips[`${p.tile.replace(/_X\d+Y\d+$/, '')} ${p.from} ${p.dir} ${p.to}`];
        rel = x?.map(s => s.split(',').map(Number));
        r = gridRegion(device, dev, p.tile);
      }
      if (!rel) { note(`${p.tile.replace(/_X\d+Y\d+$/, '')} ${p.from} ${p.dir} ${p.to}`); return; }
      for (const [m, b] of rel) bits.add(`${r[0] + m},${r[1] + b}`);
    });
  }
  return { bits, unknown };
}

/**
 * The frames bitgen writes again after the frame data (#724, #728, measured on a design with one RAMB8BWER, stopwatch
 * on both boards): minor 23 of the block RAM's column in its row, as in the frame data but for two bits it clears
 * (bit 1 of word w, bit 14 of word w + 15, counting from the word's lowest; w the first word of the four switch boxes' rows the block RAM's tile
 * spans), then a frame of pad (all ones). { rewrites: [{ far, words }], unknown: [what was not measured] }.
 */
export function bramRewrites(design, device, dev, fdri) {
  const brams = design.insts.filter(i => /^RAMB(8|16)BWER$/.test(i.type) && i.placed), unknown = [];
  if (!brams.length) return { rewrites: [], unknown };
  if (brams.length > 1) unknown.push(`${brams.length} block RAMs: the frame bitgen writes again measured with one`);
  if (brams[0].type !== 'RAMB8BWER') unknown.push(`a ${brams[0].type}: the frame bitgen writes again measured with a RAMB8BWER`);
  const [f0, b0] = gridRegion(device, dev, brams[0].tile), row = Math.floor(f0 / dev.rowFrames), [c0] = columnOf(dev, f0);
  let column = 0;
  for (let f = row * dev.rowFrames; f < c0; f += dev.columns[column]) column++;
  const main = (c0 + 23) * FRAME_WORDS, words = new Uint16Array(2 * FRAME_WORDS).fill(0xffff), w = (b0 >> 4) - 12;
  words.set(fdri.subarray(main, main + FRAME_WORDS), 0);
  words[w] &= ~0x0002;
  words[w + 15] &= ~0x4000;
  return { rewrites: [{ far: [(row << 8) | column, 23], words }], unknown };
}

/**
 * The .bit of a placed and routed Spartan-6 design (parseXdl's) from the bit databases (bitdb-node.js
 * loadBitDbS6, or the same object in the browser): the empty device's frame data with every bit predictDesign gives,
 * the block RAM's frame written again, bitstream.js's writer. opts: { name, date, time, crc, startupClk } (the
 * header's and the configuration's). { bytes (Uint8Array), unknown: Map what -> count (the bitstream may not be
 * the design's when not empty: a feature the databases do not have, a DCM or PLL) }.
 */
export function bitstreamS6(design, device, db, { name = 'top.ncd;UserID=0xFFFFFFFF', date, time, crc = true, startupClk = 'Cclk' } = {}) {
  const part = db.part.replace(/-\d$/, ''), type = part.match(/^xc6slx\d+/)[0], dev = bitFormat6(part.replace(/^xc/, ''));
  const { bits, unknown } = predictDesign(design, device, dev, db);
  // a DCM's or PLL's bits are measured for some sites, pads and outputs only, and some of those not exactly (#2025):
  // never a bitstream that might not be the design's without saying so
  for (const i of design.insts) if (/^(DCM|PLL_ADV)$/.test(i.type) && i.placed) unknown.set(`${i.type} ${i.site}: a clock manager's bits not measured for every configuration (#2025)`, 1);
  const fdri = emptyFdri(dev).slice();
  for (const x of bits) { const [f, b] = x.split(',').map(Number); fdri[f * FRAME_WORDS + (b >> 4)] ^= 1 << (15 - (b & 15)); }
  const again = bramRewrites(design, device, dev, fdri);
  for (const u of again.unknown) unknown.set(u, (unknown.get(u) || 0) + 1);
  const bytes = writeBit6({ fdri, rewrites: again.rewrites, name, part: part.replace(/^xc/, ''), ...(date && { date }), ...(time && { time }), crc, startupClk, device: S6_DEVICES[type] });
  return { bytes, unknown };
}
