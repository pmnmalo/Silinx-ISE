// The bidirectional pads' features (#96): gen-iobidir.mjs's designs implemented by ISE (top.xdl, top.bit), written by
// the writer with each pad's IO:<standard> taken as its output's bits (O:<standard>) and its input's (I:<standard>) but
// those the output's drive sets (an input pad's driver off: the bits of the standard's DRIVE changes, O:DRIVE:<n> for
// LVCMOS33, O:<standard>:DRIVE:<n> for the others, LVCMOS25's for a standard with none measured), and compared with
// ISE's bitstream. Every bit that differs is given to the nearest pad's
// IO:<standard> (set, or "!frame,bit" cleared) and reported; the XC3S1200E's long-line splitters' bits are left out.
//   PART=… node ana-iobidir.mjs [--pads out.json] dir…      (each dir: top.xdl + top.bit)
// --pads: { padFeatures: { PAD: { 'IO:<standard>': [bits] } } } for merge-db.mjs.
import fs from 'node:fs';
import { readBit, diffFrames } from '../../src/fpga/bitstream.js';
import { parseXdl } from '../../src/xdl.js';
import { frameData } from '../../src/fpga/bitgen.js';
import { loadDb } from './db.mjs';

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const padsFile = opt('--pads');
const db = loadDb();
const anchor = new Map();
for (const [pad, f] of Object.entries(db.padFeats)) {
  const pos = ['O:LVCMOS33', 'I:LVCMOS33'].flatMap(k => f[k] || []).map(s => s.replace('!', '').split(',').map(Number));
  if (pos.length) anchor.set(pad, pos);
}
const dist = (fr, bit, pad) => Math.min(...anchor.get(pad).map(([f, b]) => Math.abs(fr - f) * 4 + Math.abs(bit - b)));
const splitter = db.types.CLKH_LL ? (([fr, bit]) => fr < 4 || bit <= 3 || bit >= db.format.frameWords * 32 - 4) : () => false;
const padFeatures = {};
const report = [];
for (const dir of args) {
  const design = parseXdl(fs.readFileSync(`${dir}/top.xdl`, 'utf8'));
  const iop = new Map();   // pad -> its IO:<standard>
  for (const i of design.insts) {
    if (!/^(IOB|IBUF)$/.test(i.type) || !i.placed) continue;
    const has = a => i.cfg.some(c => c.attr === a && c.value !== '#OFF');
    if (!has('OUTBUF') || !has('INBUF')) continue;
    const std = i.cfg.find(c => c.attr === 'IOATTRBOX')?.value;
    const f = db.padFeats[i.site] || {};
    if (f[`IO:${std}`]) continue;
    if (!f[`I:${std}`] || !f[`O:${std}`]) { report.push(`${dir}: ${i.site} has no I:${std} / O:${std}`); continue; }
    const drives = s => Object.keys(f).filter(k => k.startsWith(s === 'LVCMOS33' ? 'O:DRIVE:' : `O:${s}:DRIVE:`));
    const drv = new Set((drives(std).length ? drives(std) : drives('LVCMOS25')).flatMap(k => f[k].map(b => b.replace('!', ''))));
    const bits = [...new Set([...f[`I:${std}`].filter(b => !drv.has(b.replace('!', ''))), ...f[`O:${std}`]])];
    const clash = bits.filter(b => !b.startsWith('!') && bits.includes(`!${b}`));
    if (clash.length) report.push(`${dir}: ${i.site} I:${std} and O:${std} disagree on ${clash.join(' ')}`);
    db.padFeats[i.site] = { ...f, [`IO:${std}`]: bits.filter(b => !clash.includes(b) && !clash.includes(b.slice(1))) };
    iop.set(i.site, `IO:${std}`);
  }
  const { frames, unknown } = frameData(design, db);
  const d = diffFrames(frames, readBit(fs.readFileSync(`${dir}/top.bit`)).frames, db.format.frameWords).filter(x => !splitter([x.frame, x.bit]));
  const pads = [...iop.keys()];
  const fixed = new Map();
  let far = 0;
  for (const x of d) {
    const near = pads.map(p => [p, dist(x.frame, x.bit, p)]).sort((a, b) => a[1] - b[1])[0];
    if (!near || near[1] >= 160) { far++; continue; }
    const p = near[0], f = iop.get(p), bits = db.padFeats[p][f], k = `${x.frame},${x.bit}`;
    // ISE's value: x.value; the union's bit removed, or ISE's added
    const nb = bits.filter(b => b !== k && b !== `!${k}`);
    if (!(bits.includes(x.value ? `!${k}` : k))) nb.push(x.value ? k : `!${k}`);
    db.padFeats[p][f] = nb;
    fixed.set(p, (fixed.get(p) || 0) + 1);
  }
  for (const [p, f] of iop) (padFeatures[p] ||= {})[f] = db.padFeats[p][f].sort();
  report.push(`${dir}: ${iop.size} bidirectional pads, ${d.length} bits differ from O and I but the drive's (${fixed.size} pads${far ? `, ${far} far from every pad` : ''})${unknown.length ? `; unknown: ${[...new Set(unknown.map(u => u.feature))].join(' ')}` : ''}`);
  for (const [p, k] of fixed) report.push(`  ${p} ${iop.get(p)}: ${k} bits`);
}
console.log(report.join('\n'));
if (padsFile) fs.writeFileSync(padsFile, JSON.stringify({ padFeatures }));
