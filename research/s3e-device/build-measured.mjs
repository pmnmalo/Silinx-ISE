// #3, a measured description rebuilt from its measurements alone (research/s3e-device/data/<die>, README sections
// 9-15): the observation of ISE's routed designs (obs.json.gz), the other packages' observations (others.json.gz: the
// FT256's pads, Silinx's XB / YB routes ISE's DRC passed), the arc probes (probes.json.gz), the verdicts of every round
// of join and clock tests (verdicts.json.gz, in the order they were taken), with the bit database, the die's layout and
// the device report's grid and sites (dev). chip.mjs makes the measurements, build.mjs packs them. One folder per die
// (the XC3S250E's so far); the part is the board's package of it (PARTS).
//   node build-measured.mjs out.json.gz [data-dir] [--part xc3s250ecp132-4] [--dev graph.json.gz]
//   (the rules on: PINRULES, sections 9 and 11)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { chipMeasurements } from './chip.mjs';
import { packMeasured } from './build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DB = path.join(HERE, '../../core/fpga/bitdb');
/** The part measured of each Spartan-3E die Silinx supports: the package of its board (Basys2, Nexys2). */
export const PARTS = { xc3s100e: 'xc3s100ecp132-4', xc3s250e: 'xc3s250ecp132-4', xc3s500e: 'xc3s500efg320-4', xc3s1200e: 'xc3s1200efg320-4' };
const DATA = path.join(HERE, 'data');
/** The data folder of a die. */
export const dataDir = die => path.join(DATA, die);
export const DATA_DIR = dataDir('xc3s250e');
const gz = f => JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString());

/** The die of a part: xc3s250ecp132-4 -> xc3s250e; null for a part that is not a Spartan-3E die of PARTS. */
export function dieOf(part) {
  const die = /^(xc3s\d+e)[a-z]+\d+-\d+$/.exec(String(part || '').toLowerCase())?.[1];
  return die && PARTS[die] ? die : null;
}

/** The dies whose measurements are in the repository (a data folder with its measured.json.gz), in PARTS' order. */
export function measuredDies(root = DATA) {
  return Object.keys(PARTS).filter(d => fs.existsSync(path.join(root, d, 'measured.json.gz')));
}

/** The packed measured description (the object loadDevice() takes) from the data in `dir` (by default the die's
 *  folder); dev: a Device of the part, of which only its name, the grid and the sites are taken. */
export function buildMeasured(dev, dir) {
  const die = dieOf(dev.part);
  if (!die) throw new Error(`build-measured: ${dev.part} is not a Spartan-3E part of ${Object.values(PARTS).join(', ')}`);
  dir ??= dataDir(die);
  for (const f of ['obs.json.gz', 'others.json.gz', 'probes.json.gz', 'verdicts.json.gz'])
    if (!fs.existsSync(path.join(dir, f))) throw new Error(`build-measured: ${die} has no ${f} in ${dir}`);
  const probes = Object.values(gz(path.join(dir, 'probes.json.gz')));
  const verdicts = Object.values(gz(path.join(dir, 'verdicts.json.gz')));
  const m = chipMeasurements({
    dev, tilesDb: JSON.parse(fs.readFileSync(path.join(DB, 's3e-tiles.json'), 'utf8')),
    layout: JSON.parse(fs.readFileSync(path.join(DB, `${die}-layout.json`), 'utf8')),
    obs: gz(path.join(dir, 'obs.json.gz')), others: gz(path.join(dir, 'others.json.gz')),
    probe: { yes: probes.flatMap(p => p.yes), no: probes.flatMap(p => p.no) },
    joins: verdicts.flatMap(l => l.filter(v => v[2] === 'join').map(v => [v[0], v[1]])),
    rules: true,
  });
  return packMeasured(m);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = k => { const i = args.indexOf(k); return i < 0 ? null : args.splice(i, 2)[1]; };
  const part = opt('--part') || PARTS.xc3s250e, devFile = opt('--dev') || path.join(HERE, '../../core/fpga/devices', `${part}.json.gz`);
  const [out, dir] = args;
  const { loadDevice } = await import('../../core/fpga/device.js');
  const packed = buildMeasured(loadDevice(gz(devFile)), dir);
  fs.writeFileSync(out, zlib.gzipSync(JSON.stringify(packed), { level: 9 }));
  console.log(`${out}: ${JSON.stringify(packed.counts)}`);
}
