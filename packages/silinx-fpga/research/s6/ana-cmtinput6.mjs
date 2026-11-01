// Stage S6-E3 (#1951): a CMT's bits outside its settings and its paths' PIPs, from designs ISE implemented with one CMT
// (gen-cmtsites6.mjs's --muxes and --outputs designs): what residual6 leaves over with the settings, the PIPs and the
// REGC bits predicted (not #727's whole paths), by what the CMT uses (cmtUses): its CLKIN's BUFIO2 (the bits left in the
// I/O words: the BUFIO2's route to the CMT), each output that drives a net (the bits left in the CMT's frame, CMT_FRAME
// of its row: kept where every design using the output has them), and its site (the other bits every design of the
// site has: the clock spine's and the CMT column's, set by any CMT of the half). A BUFIO2's own bits (#2025: the I/O
// words' bits of every design with it, whatever its CMT) are its site's, apart from those of its route to each CMT.
//   node research/s6/ana-cmtinput6.mjs <dir> …   (each with top.xdl and top.bit)  -> packages/silinx-fpga/bitdb/s6/<device>-cmt-input.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXdl } from '../../src/xdl.js';
import { readBit6, bitFormat6 } from '../../src/fpga/s6/bitstream.js';
import { s6Device } from '../../../../test/s6-lib.mjs';
import { gridRegion } from './ana-pipdrop6.mjs';
import { residualDb, setBits, predictDesign } from './residual6.mjs';
import { CMT_FRAME, cmtUses } from './cmt6.mjs';

const inter = (a, b) => (a ? a.filter(x => b.includes(x)) : [...b]);

/**
 * The table from designs' leftovers: [{ site, outputs, bufio2, left: ['frame,bit'], cmtFrame, iobFrame }] (cmtFrame: the
 * CMT's frame; iobFrame: the I/O words' first) -> { sites: { site: { common, outputs: { pin: bits }, bufio2: { site: bits } } },
 * bufio2: { site: bits } } (bufio2: a BUFIO2's own bits, those of every design with it; a site's bufio2 the rest).
 */
export function cmtInputTable(samples) {
  const sites = {}, bufio2 = {}, f = b => +b.split(',')[0];
  for (const x of samples) if (x.bufio2) bufio2[x.bufio2] = inter(bufio2[x.bufio2], x.left.filter(b => f(b) >= x.iobFrame));
  for (const x of samples) {
    const s = (sites[x.site] ??= { common: null, outputs: {}, bufio2: {}, samples: [] });
    s.samples.push(x);
    for (const o of x.outputs) s.outputs[o] = inter(s.outputs[o], x.left.filter(b => f(b) === x.cmtFrame));
    s.common = inter(s.common, x.left.filter(b => f(b) < x.iobFrame && f(b) !== x.cmtFrame));
  }
  for (const s of Object.values(sites)) {
    // an output's bits: those of every design using it and of no design not using it
    for (const o of Object.keys(s.outputs)) s.outputs[o] = s.outputs[o].filter(b => !s.samples.some(x => !x.outputs.includes(o) && x.left.includes(b)));
    // the BUFIO2's: its I/O words' bits and the CMT frame's not the outputs' (the CMT's input selection)
    for (const x of s.samples) {
      if (!x.bufio2) continue;
      const outs = new Set(x.outputs.flatMap(o => s.outputs[o]));
      s.bufio2[x.bufio2] = inter(s.bufio2[x.bufio2], x.left.filter(b => (f(b) >= x.iobFrame && !bufio2[x.bufio2].includes(b)) || (f(b) === x.cmtFrame && !outs.has(b))));
    }
    delete s.samples;
  }
  const sort = a => [...a].sort((p, q) => { const [f1, b1] = p.split(',').map(Number), [f2, b2] = q.split(',').map(Number); return f1 - f2 || b1 - b2; });
  for (const s of Object.values(sites)) {
    s.common = sort(s.common);
    s.outputs = Object.fromEntries(Object.entries(s.outputs).filter(([, b]) => b.length).map(([o, b]) => [o, sort(b)]).sort());
    s.bufio2 = Object.fromEntries(Object.entries(s.bufio2).map(([k, b]) => [k, sort(b)]).sort());
  }
  return { sites: Object.fromEntries(Object.entries(sites).sort()), bufio2: Object.fromEntries(Object.entries(bufio2).map(([k, b]) => [k, sort(b)]).sort()) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) { console.error('usage: node research/s6/ana-cmtinput6.mjs <dir> …'); process.exit(1); }
  const samples = [];
  let device0, skipped = 0;
  for (const dir of dirs) {
    const r6 = readBit6(fs.readFileSync(path.join(dir, 'top.bit'))), dev = bitFormat6(r6.device.part), db = residualDb(r6, { cmtInput: false });
    const { device } = s6Device(db.part), design = parseXdl(fs.readFileSync(path.join(dir, 'top.xdl'), 'utf8'));
    const cmts = design.insts.filter(i => /^(DCM|PLL_ADV)$/.test(i.type) && i.placed);
    if (cmts.length !== 1) { skipped++; continue; }
    const inst = cmts[0], { bits } = predictDesign(design, device, dev, db), left = [...setBits(r6, dev, !!db.hard)].filter(b => !bits.has(b));
    const rowFirst = Math.floor(gridRegion(device, dev, inst.tile)[0] / dev.rowFrames) * dev.rowFrames;
    samples.push({ site: inst.site, ...cmtUses(design, inst), left, cmtFrame: rowFirst + CMT_FRAME[r6.device.device], iobFrame: dev.rows * dev.rowFrames + dev.bramFrames });
    device0 = r6.device.device;
  }
  const table = cmtInputTable(samples);
  console.log(`${samples.length} designs (${skipped} without exactly one CMT): ${Object.entries(table.sites).map(([s, x]) => `${s} ${x.common.length} common, outputs ${Object.keys(x.outputs).join('/') || '-'}, BUFIO2 ${Object.keys(x.bufio2).join('/') || '-'}`).join('; ')}; the BUFIO2s' own: ${Object.entries(table.bufio2).map(([s, b]) => `${s} ${b.join(' ')}`).join(', ')}`);
  fs.writeFileSync(new URL(`../../bitdb/s6/${device0}-cmt-input.json`, import.meta.url), `${JSON.stringify({ note: 'A CMT\'s bits outside its settings and its paths\' PIPs, by its site, its outputs used and its CLKIN\'s BUFIO2 (#1951, ana-cmtinput6.mjs); bufio2, a BUFIO2\'s own (#2025); absolute frame,bit.', ...table })}\n`);
}
