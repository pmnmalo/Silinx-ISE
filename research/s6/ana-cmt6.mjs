// Stage S6-E (#727): a DCM's and a PLL's clock path, from gen-dcm6.mjs --paths's designs ISE implemented against the
// base's (gen-dcm6.mjs's dcm and pll). What residual6.mjs leaves of the base (the CMT's settings, its input from the
// clock pad V10, its outputs' BUFGs at BUFGMUX_X3Y13 / X3Y14) and, per other clock pad and per other BUFGMUX, the bits
// that design sets and clears against the base's: a design's are the base's with its pad's and its BUFGs' changes.
//   node research/s6/ana-cmt6.mjs <base dir> <paths dir>   -> packages/silinx-fpga/bitdb/s6/xc6slx16-cmt-paths.json
// { dcm: { site, base: ['frame,bit'], pads: { pad: { set, clear } }, bufgs: { BUFGMUX: { set, clear } } }, pll: … }
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXdl } from '../../packages/silinx-fpga/src/xdl.js';
import { readBit6, emptyFdri, bitFormat6 } from '../../packages/silinx-fpga/src/fpga/s6/bitstream.js';
import { bitsOf } from './ana-iob6.mjs';
import { variantBits } from './ana-dcm6.mjs';
import { loadDb } from './check-slice6.mjs';
import { s6Device } from '../../test/s6-lib.mjs';
import { predictDesign } from './residual6.mjs';
import { cmtCfg, cmtPath } from './cmt6.mjs';

export { cmtCfg, cmtPath, predictCmt } from './cmt6.mjs';


if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [baseDir, pathsDir] = process.argv.slice(2);
  if (!pathsDir) { console.error('usage: node research/s6/ana-cmt6.mjs <base dir> <paths dir>'); process.exit(1); }
  const read = n => JSON.parse(fs.readFileSync(new URL(`../../packages/silinx-fpga/bitdb/s6/${n}.json`, import.meta.url), 'utf8')), part = 'xc6slx16csg324-3', { device } = s6Device(part);
  const db = { part, slices: loadDb('xc6slx16'), int: { pips: read('xc6slx16-int').pips, cover: read('xc6slx16-int-cover').pips, own: read('xc6slx16-int-own').pips },
    other: { pips: { ...read('s6-pips-other').pips, ...read('s6-pips-io').pips, ...read('s6-pips-clock').pips } }, iob: read('xc6slx16-iob'), clocks: read('s6-clocks') };
  const load = d => { const x = parseXdl(fs.readFileSync(path.join(d, 'top.xdl'), 'utf8')), r = readBit6(fs.readFileSync(path.join(d, 'top.bit'))), dev = bitFormat6(r.device.part); const { bits } = predictDesign(x, device, dev, db); return { x, left: new Set([...bitsOf(r.fdri, emptyFdri(dev))].filter(q => !bits.has(q))) }; };
  const out = {};
  for (const [kind, type] of [['dcm', 'DCM'], ['pll', 'PLL_ADV']]) {
    const base = load(path.join(baseDir, kind)), inst = base.x.insts.find(i => i.type === type), bp = cmtPath(base.x, inst);
    const k = out[kind] = { site: inst.site, cfg: cmtCfg(inst), basePad: bp.pad, baseBufgs: bp.bufgs, base: [...base.left].sort(), pads: {}, bufgs: {} };
    for (const n of fs.readdirSync(pathsDir).filter(x => x.startsWith(`${kind}-`))) {
      const v = load(path.join(pathsDir, n)), p = cmtPath(v.x, v.x.insts.find(i => i.type === type)), d = variantBits(base.left, v.left);
      if (p.pad !== bp.pad) k.pads[p.pad] = d;
      else { const b = p.bufgs.filter(s => !bp.bufgs.includes(s)); if (b.length) k.bufgs[b[0]] = d; }
    }
    console.log(`${kind} at ${inst.site} from ${bp.pad} to ${bp.bufgs.join(' ')}: base ${k.base.length} bits; pads ${Object.keys(k.pads).join(' ')}; BUFGMUXes ${Object.keys(k.bufgs).join(' ')}`);
  }
  fs.writeFileSync(new URL('../../packages/silinx-fpga/bitdb/s6/xc6slx16-cmt-paths.json', import.meta.url), `${JSON.stringify(out)}\n`);
}
