#!/usr/bin/env node
// Silinx toolchain - the 7-series' bit database (#3144): the subset of Project X-Ray's database (prjxray-db, CC0 1.0)
// one part needs for its bitstream, in one compact file (bitdb/xc7/<part>.json.gz) that src/fpga/xc7/bitdb.js reads.
//   node research/xc7/build-db.mjs <prjxray-db checkout> [part] [out dir]
// What it keeps, from <db>/artix7 (fasm2frames reads the same files):
// - the part's configuration (part.json: its ID code, the frames of each row and column, its I/O banks' HCLK_IOI3
//   tiles) and its pins' banks (package_pins.csv), for the banks' STEPDOWN;
// - the fabric's tiles (tilegrid.json): each one's type and where its bits are (base frame address, frames, word
//   offset, words; an alias to another type's bits), the IOB33 tiles' sites, the tile of PUDC_B;
// - each tile type's segment bits (segbits_<type>[.block_ram].db) and pseudo-PIPs (ppips_<type>.db, no bits), the
//   type's name taken off each line; the types with a tile_type_<type>.json, as Project X-Ray's Database lists them;
//   an addressed feature of one bit per address, 0 … n - 1 (a block RAM's INIT_00[000] … [255]), on one line:
//   "INIT_00[] <bit of 0> <bit of 1> …"; a type's bits the same as an earlier type's: "=<that type>";
// - the part's required features (<part>/required_features.fasm), when it has them;
// - the pseudo-PIPs Silinx measured that prjxray-db does not have (measured-ppips.mjs: CFG_CENTER_MID's BSCAN pins, #3767).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MEASURED_PPIPS } from './measured-ppips.mjs';

const [dbRoot, part = 'xc7a35tcpg236-1', outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'bitdb', 'xc7')] = process.argv.slice(2);
if (!dbRoot) { console.error('usage: build-db.mjs <prjxray-db> [part] [out dir]'); process.exit(2); }
const fam = path.join(dbRoot, 'artix7');
const read = (...p) => fs.readFileSync(path.join(fam, ...p), 'utf8');
const yamlValue = (text, key) => new RegExp(`^${key}:\\s*\\n((?:\\s+.*\\n)+)`, 'm').exec(text)?.[1];

// the part's device and its fabric (mapping/parts.yaml, devices.yaml: simple enough to read without a YAML parser)
const device = /^\s+device:\s*(\S+)/m.exec(yamlValue(read('mapping', 'parts.yaml'), part) || '')?.[1];
const fabric = /^\s+fabric:\s*"?([^"\s]+)/m.exec(yamlValue(read('mapping', 'devices.yaml'), `"?${device}"?`) || '')?.[1];
if (!device || !fabric) throw new Error(`${part}: not in prjxray-db's mapping`);

const partJson = JSON.parse(read(part, 'part.json'));
const BLOCKS = ['CLB_IO_CLK', 'BLOCK_RAM', 'CFG_CLB'];
const regions = {};
for (const [half, r] of Object.entries(partJson.global_clock_regions)) {
  regions[half] = {};
  for (const [row, { configuration_buses: buses }] of Object.entries(r.rows)) {
    regions[half][row] = {};
    for (const [bus, { configuration_columns: cols }] of Object.entries(buses)) {
      if (!BLOCKS.includes(bus)) throw new Error(`${part}: block type ${bus}`);
      const keys = Object.keys(cols).map(Number).sort((a, b) => a - b);
      if (keys.some((k, i) => k !== i)) throw new Error(`${part}: the columns of ${half} row ${row} ${bus} are not 0 … n`);
      regions[half][row][bus] = keys.map(k => cols[k].frame_count);
    }
  }
}

// the banks: their HCLK_IOI3 tiles and their pins' tiles (fasm2frames' bank_to_tile)
const banks = {};
const addBank = (bank, tile) => { (banks[bank] ??= []).includes(tile) || banks[bank].push(tile); };
for (const [bank, loc] of Object.entries(partJson.iobanks)) addBank(bank, `HCLK_IOI3_${loc}`);
const [head, ...pins] = read(part, 'package_pins.csv').trim().split(/\r?\n/).map(l => l.split(','));
for (const p of pins) addBank(p[head.indexOf('bank')], p[head.indexOf('tile')]);

const grid = JSON.parse(read(fabric, 'tilegrid.json'));
const tiles = {}, iobSites = {}, types = new Set();
let pudcB = null;
for (const [name, t] of Object.entries(grid)) {
  types.add(t.type);
  const blocks = Object.entries(t.bits || {}).map(([bt, b]) => {
    if (!BLOCKS.includes(bt)) throw new Error(`${name}: block type ${bt}`);
    const x = [BLOCKS.indexOf(bt), parseInt(b.baseaddr, 16), b.frames, b.offset, b.words];
    if (b.alias) { x.push([b.alias.type, b.alias.start_offset, b.alias.sites]); types.add(b.alias.type); }
    return x;
  });
  tiles[name] = [t.type, blocks];
  if (name.includes('IOB33')) iobSites[name] = Object.keys(t.sites).map(s => `IOB_Y${Number(s.at(-1)) % 2}`);
  for (const [site, fn] of Object.entries(t.pin_functions || {})) {
    if (!fn.includes('PUDC_B')) continue;
    if (pudcB) throw new Error(`PUDC_B twice: ${pudcB} and ${name}`);
    pudcB = [name, `IOB_Y${Number(site.at(-1)) % 2}`];
  }
}

// the tile types Project X-Ray's Database knows (a tile_type_<type>.json), with their segment bits and pseudo-PIPs
const files = new Set(fs.readdirSync(fam));
const known = [...files].filter(f => /^tile_type_.*\.json$/.test(f)).map(f => f.slice(10, -5).toUpperCase());
const lines = (f, type) => files.has(f) ? read(f).split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
  if (!l.startsWith(`${type}.`)) throw new Error(`${f}: ${l}`);
  return l.slice(type.length + 1);
}) : [];
// the runs of one bit per address on one line (bitdb.js segbitsOf reads them back)
function packRuns(ls) {
  const out = [], addr = l => /^(.*)\[(\d+)\] (\S+)$/.exec(l);
  for (let i = 0; i < ls.length;) {
    const m = addr(ls[i]), bits = [];
    if (m && Number(m[2]) === 0) {
      for (let n; i + bits.length < ls.length && (n = addr(ls[i + bits.length])) && n[1] === m[1] && Number(n[2]) === bits.length;) bits.push(n[3]);
    }
    if (bits.length > 1) { out.push(`${m[1]}[] ${bits.join(' ')}`); i += bits.length; } else out.push(ls[i++]);
  }
  return out.join('\n');
}
const seen = new Map();
const same = (type, text) => { const k = seen.get(text); if (k) return `=${k}`; seen.set(text, type); return text; };
const typeDb = {};
for (const type of [...types].sort()) {
  if (!known.includes(type)) continue;
  const l = type.toLowerCase();
  const e = {};
  const ppips = [...lines(`ppips_${l}.db`, type).map(x => x.split(' ')[0]), ...(MEASURED_PPIPS[type] || [])];
  if (files.has(`segbits_${l}.db`)) e.segbits = same(type, packRuns(lines(`segbits_${l}.db`, type)));
  if (files.has(`segbits_${l}.block_ram.db`)) e.ramSegbits = same(type, packRuns(lines(`segbits_${l}.block_ram.db`, type)));
  if (ppips.length) e.ppips = ppips.join('\n');
  typeDb[type] = e;
}
const req = path.join(fam, part, 'required_features.fasm');
const requiredFeatures = fs.existsSync(req) ? fs.readFileSync(req, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean) : [];

let ref = null;
try { ref = execFileSync('git', ['-C', dbRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* not a checkout */ }
const db = { format: 1, part, device, fabric, prjxrayDb: ref, idcode: Number(partJson.idcode), regions, banks, pudcB,
  requiredFeatures, iobSites, tiles, types: typeDb };
const text = JSON.stringify(db);
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `${part}.json.gz`);
fs.writeFileSync(out, zlib.gzipSync(text, { level: 9 }));
console.log(`${path.basename(out)}: ${Object.keys(tiles).length} tiles, ${Object.keys(typeDb).length} tile types, ${text.length} B, ${fs.statSync(out).size} B gzipped`);
