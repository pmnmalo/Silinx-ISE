// Stage S6-E (#727): the I/O logic's route-throughs Silinx's router uses (packages/silinx-fpga/src/fpga/s6/route-nets.js FREE_ROUTETHRU):
// OLOGIC2 D1 -> OQ and T1 -> TQ, ILOGIC2 D -> FABRICOUT, written as ISE writes them (an instance with no user logic
// and the _ROUTETHROUGH setting). One design per route-through on every site of the kind, and the same on the sites of
// even Y only (the two sites of an IOI tile apart); ana-iologic6.mjs places the bits by tile (gridRegion).
//   node research/s6/gen-iologic6.mjs <out dir> [part]   (<part>.iol-<name>.xdl)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { s6Device } from '../../test/s6-lib.mjs';

/** The designs: { name: { type, rts: [[from, to]], even } }. */
export const IOLOGIC_DESIGNS = {
  oq: { type: 'OLOGIC2', rts: [['D1', 'OQ']] }, oqEven: { type: 'OLOGIC2', rts: [['D1', 'OQ']], even: true },
  tq: { type: 'OLOGIC2', rts: [['T1', 'TQ']] }, tqEven: { type: 'OLOGIC2', rts: [['T1', 'TQ']], even: true },
  oqtq: { type: 'OLOGIC2', rts: [['D1', 'OQ'], ['T1', 'TQ']] },
  fab: { type: 'ILOGIC2', rts: [['D', 'FABRICOUT']] }, fabEven: { type: 'ILOGIC2', rts: [['D', 'FABRICOUT']], even: true },
};

/** A design's XDL: every site of the type (of even Y with even) with the route-throughs. */
export function iologicDesign(part, sites, { type, rts, even = false }) {
  const out = [`design "iol" ${part} v3.2 ,\n  cfg "";\n`];
  for (const s of sites.filter(x => x.type === type && (!even || +x.name.match(/Y(\d+)$/)[1] % 2 === 0))) {
    out.push(`inst "r_${s.name}" "${type}",placed ${s.tileName} ${s.name}  ,\n  cfg "_NO_USER_LOGIC:: ${rts.map(([a, b]) => `_ROUTETHROUGH:${a}:${b}`).join(' ')} " ;\n`);
  }
  return out.join('');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [out, part = 'xc6slx16csg324-3'] = process.argv.slice(2);
  if (!out) { console.error('usage: node research/s6/gen-iologic6.mjs <out dir> [part]'); process.exit(1); }
  const { device } = s6Device(part), p = part.replace(/^(xc6slx\d+)(csg)/, '$1-$2'), sites = device.sites();
  fs.mkdirSync(out, { recursive: true });
  for (const [name, d] of Object.entries(IOLOGIC_DESIGNS)) fs.writeFileSync(path.join(out, `${p}.iol-${name}.xdl`), iologicDesign(part, sites, d));
  console.log(`${part}: ${Object.keys(IOLOGIC_DESIGNS).length} designs`);
}
