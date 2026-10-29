// Stage S6-E2 (#1951): the PIPs the PIP drop could not take apart (db/s6-pips-other.json's unresolved: the CMT tiles'
// input and output chains, always together, and the I/O tiles' clock paths) probed one by one, as #726's INT tiles
// were: each PIP on a net of its own whose only pin is a TIEOFF's HARD1 (ISE programs a PIP on such a net even off
// its path), a TIEOFF of an INT tile each; per design one PIP per region, the types' tiles in turn.
//   node research/s6/gen-cmtprobe6.mjs <out dir> [part]   -> <part>.cp<j>.xdl, <part>.cp<j>.json ({ tile: 'from dir to' })
// ana-pipdrop6.mjs's regions give each tile its bits (ana-cmtprobe6.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeXdl } from './gen-pipprobe6.mjs';
import { gridRegion } from './ana-pipdrop6.mjs';
import { bitFormat6 } from '../../core/fpga/s6/bitstream.js';
import { s6Device } from '../../test/s6-lib.mjs';

/**
 * The probes: [{ tile: { from, dir, to } }], each PIP in the first design that has no PIP in its tile nor in its tile's
 * region (gridRegion: a region's bits are one unit), the tiles of a type in turn.
 */
export function cmtProbes(device, dev, unresolved) {
  const tiles = {}, out = [], used = [];
  const types = new Set(unresolved.map(k => k.split(' ')[0]));
  device.tileNames.forEach((n, k) => { const t = device.tileType(k); if (types.has(t)) (tiles[t] ??= []).push(n); });
  const seen = {};
  for (const k of unresolved) {
    const [type, from, dir, to] = k.split(' '), ts = tiles[type] || [];
    if (!ts.length) continue;
    const i = seen[type] = (seen[type] ?? -1) + 1, tile = ts[i % ts.length], region = gridRegion(device, dev, tile).join(',');
    let j = 0;
    while (used[j]?.has(region)) j++;
    (used[j] ??= new Set()).add(region);
    (out[j] ??= {})[tile] = { from, dir, to };
  }
  return out;
}

/** The TIEOFF sites of the INT tiles: their HARD1 the probes' pins, one net each. */
export function intTieoffs(device) {
  return device.sites().filter(s => s.type === 'TIEOFF' && /^INT_X/.test(s.tileName)).map(s => s.name);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [out, part = 'xc6slx16csg324-3'] = process.argv.slice(2);
  if (!out) { console.error('usage: node research/s6/gen-cmtprobe6.mjs <out dir> [part]'); process.exit(1); }
  const { device } = s6Device(part), p = part.replace(/^(xc6slx\d+)(csg)/, '$1-$2');
  const { unresolved } = JSON.parse(fs.readFileSync(new URL('./db/s6-pips-other.json', import.meta.url), 'utf8'));
  const probes = cmtProbes(device, bitFormat6(part.replace(/^xc/, '').replace(/-\d$/, '')), unresolved), ties = intTieoffs(device), tieTile = new Map(device.sites().map(s => [s.name, s.tileName]));
  fs.mkdirSync(out, { recursive: true });
  probes.forEach((pips, j) => {
    const pins = Object.fromEntries(Object.keys(pips).map((t, i) => [t, { tieoff: ties[i] }]));
    // probeXdl places a pin's TIEOFF in the PIP's tile: here in its own INT tile
    const xdl = probeXdl(part, pips, { pins, inpin: false }).replace(/inst "t_(\S+)" "TIEOFF",placed \S+ (\S+) {2},/g, (m, t, site) => `inst "t_${t}" "TIEOFF",placed ${tieTile.get(site)} ${site}  ,`);
    fs.writeFileSync(path.join(out, `${p}.cp${j}.xdl`), xdl);
    fs.writeFileSync(path.join(out, `${p}.cp${j}.json`), JSON.stringify(Object.fromEntries(Object.entries(pips).map(([t, x]) => [t, `${x.from} ${x.dir} ${x.to}`]))));
  });
  console.log(`${part}: ${unresolved.length} PIPs not taken apart, ${probes.length} designs (${probes.map(x => Object.keys(x).length).join(' ')})`);
}
