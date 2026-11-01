// #2483: the XC3S1200E's long-line splitters measured by half. A splitter joins a long line's two halves through a
// bidirectional PIP (`CLKH_LLB_LVk =- CLKH_LLT_LVk`), its only PIP, and a join test out of one end cannot be read
// from the DRC: the net holds the PIP whichever end it drives, so there is no island either way (the `invalid` verdicts
// of README part 9). ISE's bitgen can tell: each direction has its own bit, and bitgen sets the one whose input is the
// half the net drives. So each test drives a half (A, a wire of another tile) with the splitter's PIP written `X =- Y`
// out of the tested end X, and its verdict is read from the DRC and from the bit:
//   island                               -> A and X are not one node (nor A and Y);
//   no island, bit X -> Y set            -> A and X are one node (join);
//   no island, bit Y -> X set            -> A and Y are one node (join), A and X not.
//   node splitters.mjs pred out.json [graph.json.gz]   the hypotheses: each end of every splitter PIP with up to two wires
//                                                      of other tiles of its node in the graph (by default the shipped
//                                                      one: hypotheses only, decided by ISE's verdicts)
//   then: SPLITTERS=1 MAXJOINS=0 prototype.mjs tests out.json obs.json dir; ise-remote.sh -f -b dir
//   node splitters.mjs verdicts dir...                 -> dir/verdicts.json, in the rounds' format: [a, b, verdict]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { loadDevice } from '../../src/fpga/device.js';
import { readBit, getBit } from '../../src/fpga/bitstream.js';
import { tileOf, tileBase, featureBits, parseBit } from '../../src/fpga/bitgen.js';
import { loadDb } from '../../src/fpga/bitdb-node.js';
import { parseJoinTests } from './hypotheses.mjs';
import { tileXY } from './observe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PART = process.env.PART || 'xc3s1200efg320-4';
/** The long-line splitter tiles (the XC3S1200E's: CLKH_LL, CLKV_LL, CLKT_LL, CLKB_LL, CLKLH_DCM_LL, …). */
export const SPLITTER = /^CLK[A-Z_]*_LL$/;
/** A splitter's own wire of a long line (CLKH_LLB_LV3, CLKV_LLR_LH12): the ends of its bidirectional PIPs. */
export const SPLIT_WIRE = /_LL[A-Z]?_L[HV]\d+$/;
const readJson = f => JSON.parse(/\.gz$/.test(f) ? zlib.gunzipSync(fs.readFileSync(f)).toString() : fs.readFileSync(f, 'utf8'));

/** The long-line wires a switch box drives (ISE's routes on the XC3S1200E: LH / LV 0, 6, 12 and 18, from OMUX and the
 *  doubles and hexes), where a test's path can begin. */
export const DRIVEN = /^L[HV](0|6|12|18)$/;

/** The hypotheses: [[A, 'TILE/X']] for each end X of every bidirectional PIP of the splitter tiles of a Device, A a
 *  wire of X's node a switch box of another tile drives (DRIVEN; a CLB's or block RAM's first, then an I/O tile's), at
 *  most `per` of them, the nearest. */
export function splitterHypotheses(dev, per = 2) {
  const out = [];
  for (let k = 0; k < dev.tileCount; k++) {
    const name = dev.tileNames[k], p = tileXY(name);
    if (!p || !SPLITTER.test(p.prefix)) continue;
    const tp = dev.templates[dev.tileTemplate[k]], ends = new Set();
    for (let i = 0; i < tp.from.length; i++) for (const w of [tp.from[i], tp.to[i]]) if (SPLIT_WIRE.test(dev.names[tp.wires[w]])) ends.add(dev.names[tp.wires[w]]);
    for (const x of [...ends].sort()) {
      const n = dev.node(name, x);
      if (n < 0) continue;
      const others = [...dev.nodeWireIds(n)].map(w => dev.wireInfo(w)).filter(w => w.tile !== name && DRIVEN.test(w.name) && !SPLITTER.test(tileXY(w.tile)?.prefix || ''));
      const rank = w => (/^(CLB|BRAM\d_SMALL)/.test(w.tile) ? 0 : 1000) + Math.abs(tileXY(w.tile).x - p.x) + Math.abs(tileXY(w.tile).y - p.y);
      others.sort((a, b) => rank(a) - rank(b) || (a.tile < b.tile ? -1 : 1));
      for (const w of others.slice(0, per)) out.push([`${w.tile}/${w.name}`, `${name}/${x}`]);
    }
  }
  return out;
}

/** The direction bit ISE's bitgen set for `from -> to` of a tile: 1, 0, or null (the database has no bits for it). */
export function directionBit(bit, db, tile, from, to) {
  const t = tileOf(tile, db), base = t && tileBase(t, db), bits = t && featureBits(db.types[t.type], `${from}->${to}`);
  if (!base || !bits?.length) return null;
  return bits.every(s => {
    const [df, dbit, v, dx, dy] = parseBit(s);
    const b = dx || dy ? tileBase({ ...t, x: t.x + dx, y: t.y + dy }, db) : base;
    return b && getBit(bit.frames, bit.frameWords, b.frame + df, b.bit + dbit) === v;
  }) ? 1 : 0;
}

/** The verdicts of one test from its DRC verdict ('join' | 'no-join' | …) and the two direction bits: [[a, b, verdict]]. */
export function splitterVerdicts(join, bidi, drc, fwd, back) {
  const [a] = join, [tile, x, y] = bidi;
  if (drc === 'no-join') return [[a, `${tile}/${x}`, 'no-join'], [a, `${tile}/${y}`, 'no-join']];
  if (drc !== 'join') return [[...join, drc]];
  if (fwd === 1 && back === 0) return [[a, `${tile}/${x}`, 'join'], [a, `${tile}/${y}`, 'no-join']];
  if (fwd === 0 && back === 1) return [[a, `${tile}/${x}`, 'no-join'], [a, `${tile}/${y}`, 'join']];
  return [[...join, 'unclear']];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'pred') {
    const [out, graph = path.join(HERE, '../../devices', `${PART}.json.gz`)] = args;
    const h = splitterHypotheses(loadDevice(readJson(graph)));
    fs.writeFileSync(out, JSON.stringify(h));
    console.log(`${h.length} hypotheses`);
  } else if (cmd === 'verdicts') {
    const db = loadDb(PART);
    for (const dir of args) {
      const t = readJson(path.join(dir, 'tests.json')), out = [], count = {};
      t.designs.forEach((tests, i) => {
        const f = path.join(dir, `j${i}.drc.log`), bf = path.join(dir, `j${i}.bit`);
        const log = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
        const v = /PhysDesignRules results/.test(log) ? parseJoinTests(log, tests.map(x => x.net)) : null;
        const bit = fs.existsSync(bf) ? readBit(fs.readFileSync(bf)) : null;
        for (const x of tests) {
          const drc = v ? v.get(x.net) : 'not-run';
          const vs = !x.bidi ? [[...x.join, drc]] : !bit ? [[...x.join, 'not-run']]
            : splitterVerdicts(x.join, x.bidi, drc, directionBit(bit, db, ...x.bidi), directionBit(bit, db, x.bidi[0], x.bidi[2], x.bidi[1]));
          for (const y of vs) { count[y[2]] = (count[y[2]] || 0) + 1; out.push(y); }
        }
      });
      fs.writeFileSync(path.join(dir, 'verdicts.json'), JSON.stringify(out));
      console.log(dir, JSON.stringify(count));
    }
  } else {
    console.error('usage: node splitters.mjs pred out.json [graph.json.gz] | verdicts dir...');
    process.exit(1);
  }
}
