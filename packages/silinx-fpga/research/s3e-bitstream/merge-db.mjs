// Merges feature tables ({ types: { TYPE: { features: { feature: [bits] } } } }) into the shared
// packages/silinx-fpga/bitdb/s3e-tiles.json (with --device: into packages/silinx-fpga/bitdb/<device>-tiles.json, the features of one device), and
// the pads' features ({ padFeatures }) into packages/silinx-fpga/bitdb/<device>-<package>-pads.json (PART). Later files win
// for a feature they both have, unless --keep.
//   [PART=xc3s250ecp132-4] node merge-db.mjs [--keep] [--device] a.json b.json …
// --reset-tiles / --reset-pads: the tile types / the pads' features emptied first (a rebuild,
// build-db.sh), the file's description (device, source, note) kept.
import fs from 'node:fs';
import { PART, splitPart } from './db.mjs';

const args = process.argv.slice(2);
const keep = args.includes('--keep');
const { device, pkg } = splitPart(PART);
const file = new URL(args.includes('--device') ? `../../bitdb/${device}-tiles.json` : '../../bitdb/s3e-tiles.json', import.meta.url);
const padFile = new URL(`../../bitdb/${device}-${pkg}-pads.json`, import.meta.url);
const pads = fs.existsSync(padFile) ? JSON.parse(fs.readFileSync(padFile, 'utf8')) : {
  device: PART.replace(/^(xc3s\d+e)([a-z]+\d+)-(\d+)$/, '$1-$3-$2'),
  source: 'research/s3e-bitstream (see README.md): the pads of the package, absolute bits per pad (gen-iob.mjs; ana-pads.mjs, ana-perpad.mjs); ISE 14.7 xdl P.20131013 + bitgen; 2026-10-11',
  note: 'Pad (package pin) -> feature -> bits "frame,bit" of the frame data ("!frame,bit" = cleared). I/O direction and standard (I:LVCMOS33, O:LVCMOS33, IO:…), drive, slew and pull changes (O:DRIVE:8, O:LVTTL:DRIVE:8, O:SLEW:FAST, I:PULL:PULLUP…).',
  padFeatures: {},
};
const db = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {
  device,
  source: 'research/s3e-bitstream (see README.md): slice settings from the harnesses (gen-harness.mjs, gen-hvar.mjs, gen-slicedb.mjs), routing switches from gen-pipdrop.mjs / gen-pipcover.mjs + ana-pipdrop.mjs, other settings from ana-residual.mjs; ISE 14.7 xdl P.20131013 + bitgen; 2026-10-10',
  note: 'Per tile type: features -> bits set, "df,db" = frame offset from the tile column\'s first frame, bit offset from the tile row\'s first bit ("!df,db" = bit cleared). PIP features are "from->to" (wire names of the tile); site settings "<SITE><index>:<ATTR>:<VALUE>".',
  types: {},
};
if (args.includes('--reset-tiles')) { db.types = {}; delete db.padDriveDefault; }
let padsChanged = false;
if (args.includes('--reset-pads')) { pads.padFeatures = {}; padsChanged = true; }
let n = 0;
// a new file of one device: the source of the first file merged into it
if (!fs.existsSync(file) && args.includes('--device')) { const first = args.find(a => !a.startsWith('--')); const src = first && JSON.parse(fs.readFileSync(first, 'utf8')).source; if (src) db.source = src; }
for (const f of args.filter(a => !a.startsWith('--'))) {
  const add = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const [type, t] of Object.entries(add.types || {})) {
    const dst = (db.types[type] ||= { features: {} });
    if (t.sameAs) dst.sameAs = t.sameAs;
    // (a type the router must not use: the XC3S1200E's long-line splitters)
    if (t.noRoute) dst.noRoute = true;
    for (const [k, v] of Object.entries(t.features || {})) {
      if (keep && dst.features[k]) continue;
      dst.features[k] = [...v].sort();
      n++;
    }
  }
  if (add.padDriveDefault) db.padDriveDefault = { ...(db.padDriveDefault || {}), ...add.padDriveDefault };
  if (add.padFeatures) { padsChanged = true; for (const [p, f] of Object.entries(add.padFeatures)) pads.padFeatures[p] = { ...(pads.padFeatures[p] || {}), ...f }; }
}
for (const t of Object.values(db.types)) t.features = Object.fromEntries(Object.entries(t.features).sort(([a], [b]) => a.localeCompare(b)));
const ser = o => JSON.stringify(o, null, 0).replace(/("[^"]+":\[[^\]]*\]),/g, '$1,\n');
fs.writeFileSync(file, ser(db));
if (padsChanged) fs.writeFileSync(padFile, ser(pads));
console.log(`${n} features merged`);
