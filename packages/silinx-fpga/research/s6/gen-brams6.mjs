// #2679: the frames bitgen writes again with two or three block RAMs. Designs in XDL with no nets, gen-hard6.mjs's base
// settings, a RAMB16BWER with no RAM_MODE as Silinx's XDL writes it (-tdp: with ISE's RAM_MODE::TDP):
//   r16-*    RAMB16BWERs only     r8-*    RAMB8BWERs only     mix-*    both
//   -tile    both sites of one tile    -col    one column and row    -cols    two columns    -rows    two rows
// ise-xdl-bits.sh turns them into bitstreams; check-bitgen6.mjs compares them with bitstreamS6's.
//   node research/s6/gen-brams6.mjs <out dir> [part …]   (both boards' parts by default)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { s6Device } from '../../../../test/s6-lib.mjs';
import { hardBase, hardInst } from './gen-hard6.mjs';

/** The designs: name -> [[type, site, with RAM_MODE]]; RAMB8_X0Y0 / Y1 share RAMB16_X0Y0's tile, X0Y8 is a row up. */
export const BRAM_DESIGNS = {
  'r16-col': [['RAMB16BWER', 'RAMB16_X0Y0'], ['RAMB16BWER', 'RAMB16_X0Y2']],
  'r16-cols': [['RAMB16BWER', 'RAMB16_X0Y0'], ['RAMB16BWER', 'RAMB16_X1Y0']],
  'r16-3': [['RAMB16BWER', 'RAMB16_X0Y0'], ['RAMB16BWER', 'RAMB16_X0Y2'], ['RAMB16BWER', 'RAMB16_X1Y8']],
  'r8-tile': [['RAMB8BWER', 'RAMB8_X0Y0'], ['RAMB8BWER', 'RAMB8_X0Y1']],
  'r8-col': [['RAMB8BWER', 'RAMB8_X0Y0'], ['RAMB8BWER', 'RAMB8_X0Y2']],
  'r8-cols': [['RAMB8BWER', 'RAMB8_X0Y0'], ['RAMB8BWER', 'RAMB8_X1Y0']],
  'r8-rows': [['RAMB8BWER', 'RAMB8_X0Y0'], ['RAMB8BWER', 'RAMB8_X0Y8']],
  'r8-3': [['RAMB8BWER', 'RAMB8_X0Y0'], ['RAMB8BWER', 'RAMB8_X0Y3'], ['RAMB8BWER', 'RAMB8_X1Y8']],
  'mix-col': [['RAMB8BWER', 'RAMB8_X0Y0'], ['RAMB16BWER', 'RAMB16_X0Y2']],
  'mix-col-tdp': [['RAMB8BWER', 'RAMB8_X0Y0'], ['RAMB16BWER', 'RAMB16_X0Y2', true]],
  'mix-cols': [['RAMB8BWER', 'RAMB8_X0Y0'], ['RAMB16BWER', 'RAMB16_X1Y0']],
  'mix-3': [['RAMB8BWER', 'RAMB8_X0Y0'], ['RAMB8BWER', 'RAMB8_X0Y1'], ['RAMB16BWER', 'RAMB16_X0Y2']],
  'mix-3b': [['RAMB16BWER', 'RAMB16_X0Y0'], ['RAMB8BWER', 'RAMB8_X0Y2'], ['RAMB8BWER', 'RAMB8_X1Y0']],
};

/** A design's XDL on a part: the block RAMs on their sites, the base settings. */
export function bramDesign(part, sites, list) {
  let xdl = `design "brams" ${part} v3.2 ,\n  cfg "";\n`;
  for (const [type, name, mode] of list) {
    const site = sites.find(s => s.name === name);
    if (!site) throw new Error(`${part}: no site ${name}`);
    xdl += hardInst(type, site, hardBase(type).filter(([e]) => mode || type !== 'RAMB16BWER' || e !== 'RAM_MODE'));
  }
  return xdl;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [out, ...parts] = process.argv.slice(2);
  if (!out) { console.error('usage: node research/s6/gen-brams6.mjs <out dir> [part …]'); process.exit(1); }
  fs.mkdirSync(out, { recursive: true });
  for (const part of parts.length ? parts : ['xc6slx16csg324-3', 'xc6slx45csg324-3']) {
    const sites = s6Device(part).device.sites(), p = part.replace(/^(xc6slx\d+)(csg)/, '$1-$2');
    for (const [name, list] of Object.entries(BRAM_DESIGNS)) fs.writeFileSync(path.join(out, `${p}.${name}.xdl`), bramDesign(part, sites, list));
    console.log(`${part}: ${Object.keys(BRAM_DESIGNS).length} designs`);
  }
}
