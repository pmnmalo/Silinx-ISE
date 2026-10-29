// Stages S6-B … S6-D (#725, #726), the residual: every bit of a design ISE implemented, predicted from the databases
// (the slices: check-slice6.mjs; the INT-like tiles' PIPs: check-pips6.mjs; the other tiles' PIPs: db/s6-pips-other.json
// placed by gridRegion; the pads: db/<device>-iob.json, from each IOB's settings; a clock pad's selection and input
// bits: db/s6-clocks.json) and compared with ISE's bitstream,
// over the rows' frames and the I/O words, and the block RAM's frames with db/<device>-hard.json (#728: the block RAMs'
// and DSP48A1s' settings and contents, hard6.mjs). A bit left over goes to the tiles whose
// region holds it, by type (the I/O words: 'IOB words').
//   node research/s6/residual6.mjs <dir> …        (each with top.xdl and top.bit, e.g. night 1's impl-nexys3/*)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXdl } from '../../packages/silinx-fpga/src/xdl.js';
import { readBit6, bitFormat6, emptyFdri, FRAME_WORDS } from '../../packages/silinx-fpga/src/fpga/s6/bitstream.js';
import { s6Device } from '../../test/s6-lib.mjs';
import { loadDb, kindModel, predictSlice } from './check-slice6.mjs';
import { pipDirections, pipLookup } from './check-pips6.mjs';
import { tileRegion } from './ana-pipprobe6.mjs';
import { gridRegion } from './ana-pipdrop6.mjs';
import { columnOf } from './ana-slice6.mjs';
import { cmtCfg, cmtPath, predictCmt, predictCmtSettings } from './cmt6.mjs';
import { HARD_TYPES, predictHard } from './hard6.mjs';

const INT_LIKE = /^(INT|INT_BRK|INT_BRAM|INT_BRAM_BRK|IOI_INT|LIOI_INT|INT_GCLK)_X/;
const read = n => JSON.parse(fs.readFileSync(new URL(`./db/${n}.json`, import.meta.url), 'utf8'));

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
  const kindOf = new Map([...s6Device(db.part).sites.slices.values()].map(s => [s.name, s.kind])), models = {};
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
      note(`${inst.type} ${inst.site} (its ${s ? 'clock path' : 'settings or clock path'} not measured)`);
    }
  }
  // a block RAM's or a DSP48A1's settings and contents
  if (db.hard) {
    const pins = new Map();
    for (const net of design.nets) for (const q of net.inpins) (pins.get(q.inst) ?? pins.set(q.inst, new Set()).get(q.inst)).add(q.pin);
    for (const inst of design.insts) {
      if (!HARD_TYPES.includes(inst.type) || !inst.placed) continue;
      const p = predictHard(inst, device, dev, db.hard, pins.get(inst.name));
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

/** The tile types whose regions hold a bit (gridRegion of every tile, indexed once per device). */
export function typesAt(device, dev, cache = typesAt.cache ??= new WeakMap()) {
  let index = cache.get(device);
  if (!index) {
    index = [];
    for (let k = 0; k < device.tileNames.length; k++) {
      const t = device.tileNames[k];
      if (/^NULL/.test(t)) continue;
      const [c0, b0, n, nb] = gridRegion(device, dev, t);
      index.push([c0, b0, n, nb, device.tileType(k)]);
    }
    cache.set(device, index);
  }
  return (f, b) => [...new Set(index.filter(([c0, b0, n, nb]) => f >= c0 && f < c0 + n && b >= b0 && b < b0 + nb).map(x => x[4]))].sort().join('+') || '?';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) { console.error('usage: node research/s6/residual6.mjs <dir> …'); process.exit(1); }
  const int = { pips: read('xc6slx16-int').pips, cover: read('xc6slx16-int-cover').pips, own: read('xc6slx16-int-own').pips };
  // the other tiles' PIPs (the PIP drop) and the I/O path's pairs it could not take apart (the examples' residual)
  const clockPips = fs.existsSync(new URL('./db/s6-pips-clock.json', import.meta.url)) ? read('s6-pips-clock').pips : {};
  const other = { pips: { ...read('s6-pips-other').pips, ...read('s6-pips-io').pips, ...clockPips } };
  const left = new Map(), extra = new Map(), unknown = new Map();
  for (const dir of dirs) {
    const bit = fs.readFileSync(path.join(dir, 'top.bit')), r6 = readBit6(bit), dev = bitFormat6(r6.device.part);
    const part = `${r6.device.device}${r6.device.part.slice(r6.device.device.length - 2)}-3`, { device } = s6Device(part);
    const design = parseXdl(fs.readFileSync(path.join(dir, 'top.xdl'), 'utf8'));
    const iobFile = new URL(`./db/${r6.device.device}-iob.json`, import.meta.url), iob = fs.existsSync(iobFile) ? JSON.parse(fs.readFileSync(iobFile, 'utf8')) : null;
    const cmtFile = new URL(`./db/${r6.device.device}-cmt-paths.json`, import.meta.url), cmt = fs.existsSync(cmtFile) ? JSON.parse(fs.readFileSync(cmtFile, 'utf8')) : null;
    const hardFile = new URL(`./db/${r6.device.device}-hard.json`, import.meta.url), hard = fs.existsSync(hardFile) ? JSON.parse(fs.readFileSync(hardFile, 'utf8')) : null;
    const setFile = new URL(`./db/${r6.device.device}-cmt-settings.json`, import.meta.url), cmtSettings = fs.existsSync(setFile) ? JSON.parse(fs.readFileSync(setFile, 'utf8')) : null;
    const { bits, unknown: u } = predictDesign(design, device, dev, { part, slices: loadDb(r6.device.device), int, other, iob, clocks: read('s6-clocks'), cmt, hard, cmtSettings });
    for (const [w, n] of u) unknown.set(w, (unknown.get(w) || 0) + n);
    const empty = emptyFdri(dev), rows = dev.rows * dev.rowFrames * FRAME_WORDS, iobStart = (dev.rows * dev.rowFrames + dev.bramFrames) * FRAME_WORDS, have = new Set(), w0 = typesAt(device, dev);
    const where = (f, b) => (f >= dev.rows * dev.rowFrames + dev.bramFrames ? 'IOB words' : f >= dev.rows * dev.rowFrames ? 'BRAM frames' : w0(f, b));
    for (let w = 0; w < r6.fdri.length; w++) {
      if (!hard && w >= rows && w < iobStart) continue;
      const x = r6.fdri[w] ^ empty[w];
      if (x) for (let i = 0; i < 16; i++) if ((x >> (15 - i)) & 1) have.add(`${Math.floor(w / FRAME_WORDS)},${(w % FRAME_WORDS) * 16 + i}`);
    }
    let nl = 0, ne = 0;
    for (const x of have) if (!bits.has(x)) { const [f, b] = x.split(',').map(Number), t = where(f, b); left.set(t, [...(left.get(t) || []), `${path.basename(dir)} ${x}`]); nl++; }
    for (const x of bits) if (!have.has(x)) { const [f, b] = x.split(',').map(Number), t = where(f, b); extra.set(t, [...(extra.get(t) || []), `${path.basename(dir)} ${x}`]); ne++; }
    console.log(`${dir}: ${have.size} bits set, ${bits.size} predicted; ${nl} left over, ${ne} predicted and not set`);
  }
  const show = m => [...m].sort((a, b) => b[1].length - a[1].length).map(([t, l]) => `${t} ×${l.length} (${l.slice(0, 2).join('; ')})`).join('\n  ');
  console.log(`left over, by the tiles there:\n  ${show(left) || 'none'}`);
  console.log(`predicted and not set:\n  ${show(extra) || 'none'}`);
  if (unknown.size) console.log(`not in the databases: ${[...unknown].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([w, n]) => `${w} ×${n}`).join(', ')}`);
}
