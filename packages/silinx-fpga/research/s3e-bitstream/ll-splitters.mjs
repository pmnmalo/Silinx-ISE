// #709: the XC3S1200E's long-line splitters other than CLKH_LL's (CLKV_LL, CLKT_LL, CLKB_LL: the horizontal long lines
// joined across the centre column, in its rows, its top and its bottom tile; CLKL_IOIS_LL / CLKR_IOIS_LL, CLKLH_DCM_LL
// / CLKRH_DCM_LL: the vertical long lines of the I/O columns and of the side DCMs' columns joined across the centre
// row), measured with gen-pipcover.mjs --types … --long 1 (--radius 9, --nosink 1 for the switches no sink is reached
// from). A splitter's bit lies far from its tile (the centre column's in the clock column's frame 3), and the
// codewords of gen-pipcover.mjs repeat in tiles far apart, so ana-pipdrop.mjs's rule (a bit to the nearest tile of
// its codeword) does not hold here. Instead, each time a switch is in a round (a tile, a codeword), the bits that
// change with its codeword are its candidates, relative to its tile (tileBase); its bit is the one candidate every
// observation shares (in other tiles of the type, in other rounds with other codewords). The features: each switch's
// bits relative to its tile, for packages/silinx-fpga/bitdb/xc3s1200e-tiles.json (merge-db.mjs --device).
//   PART=xc3s1200efg320-4 node ll-splitters.mjs round-dir… > ll-splitters.json      (each dir: key.json, BASE.bit, V*.bit)
import fs from 'node:fs';
import { readBit, diffFrames } from '../../src/fpga/bitstream.js';
import { loadDb } from './db.mjs';
import { tileOf, tileBase } from '../../src/fpga/bitgen.js';

const TYPES = /^(CLKV_LL|CLKT_LL|CLKB_LL|CLKL_IOIS_LL|CLKR_IOIS_LL|CLKLH_DCM_LL|CLKRH_DCM_LL)$/;
const db = loadDb();
const obs = new Map();   // type \t feature -> [Set of candidate bits "df,db" ("!df,db": cleared) relative to the tile]
let rounds = 0;
for (const dir of process.argv.slice(2)) {
  const key = JSON.parse(fs.readFileSync(`${dir}/key.json`, 'utf8'));
  const base = readBit(fs.readFileSync(`${dir}/BASE.bit`));
  // every changed bit by its codeword (the variants it changes in)
  const byCode = new Map();
  const vs = new Map();
  for (let v = 0; v < key.L; v++) {
    for (const x of diffFrames(base.frames, readBit(fs.readFileSync(`${dir}/V${String(v).padStart(2, '0')}.bit`)).frames)) {
      const k = `${x.frame},${x.bit},${1 - x.value}`;
      vs.set(k, [...(vs.get(k) || []), v]);
    }
  }
  for (const [k, list] of vs) { const c = list.join(','); byCode.set(c, [...(byCode.get(c) || []), k.split(',').map(Number)]); }
  rounds++;
  for (const [tile, ps] of Object.entries(key.tiles)) {
    const t = tileOf(tile, db);
    if (!t || !TYPES.test(t.type)) continue;
    const b = tileBase(t, db);
    for (const p of ps) {
      if (!/L[HV]\d/.test(`${p.from}${p.to}`)) continue;
      const cand = new Set((byCode.get(p.code.join(',')) || []).map(([fr, bit, v]) => `${v ? '' : '!'}${fr - b.frame},${bit - b.bit}`));
      const k = `${t.type}\t${p.from}->${p.to}`;
      obs.set(k, [...(obs.get(k) || []), cand]);
    }
  }
}
const types = {};
let bad = 0;
for (const [k, list] of [...obs].sort()) {
  const [type, feat] = k.split('\t');
  const common = [...list[0]].filter(x => list.every(s => s.has(x)));
  if (common.length !== 1) { bad++; console.error(`${type} ${feat}: ${common.length} common bits in ${list.length} observations${common.length ? `: ${common.join(' ')}` : ''}`); continue; }
  ((types[type] ||= { features: {} }).features)[feat] = common;
}
for (const [t, v] of Object.entries(types)) console.error(`${t}: ${Object.keys(v.features).length} switches`);
console.error(`${rounds} rounds; ${bad} switches without one common bit`);
console.log(JSON.stringify({ source: `research/s3e-bitstream #709: gen-pipcover.mjs --types CLKV_LL,CLKT_LL,CLKB_LL,CLKL_IOIS_LL,CLKR_IOIS_LL,CLKLH_DCM_LL,CLKRH_DCM_LL --long 1 (--radius 9; --nosink 1) on the XC3S1200E, ${rounds} rounds, ll-splitters.mjs; ISE 14.7 xdl P.20131013 + bitgen`, types }));
