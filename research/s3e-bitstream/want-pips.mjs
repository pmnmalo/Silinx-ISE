// The routing switches (PIPs) a reference database knows that the PIP batches of an experiments
// folder have not measured yet: the candidates of the next batch (gen-pipcover.mjs / gen-branch.mjs
// --want), so that measure-db.sh measures again what the database holds (#48).
//   PART=xc3s250ecp132-4 node want-pips.mjs refdb-dir W [--types A,B] > want.json
// refdb-dir: a copy of packages/silinx-fpga/bitdb/ (the database to reproduce); W: the experiments folder, its batches in
// W/pips/*/pips.json (ana-pipdrop.mjs). want.json: { TYPE: ['from->to', …] } in the wire names of the
// tiles (the device description's tile types): the features of each type's own (not those it shares
// with another type, sameAs: measured on that type); a PIP counts as measured when a batch measured it in
// a tile of the type or of a type sharing its switch box (UNIFY: the I/O tiles of one side, the four
// block-RAM interconnect tiles). Report on stderr.
import fs from 'node:fs';
import path from 'node:path';
import { loadGraph } from './xdlrc-graph.mjs';
import { loadDb, PART } from './db.mjs';
import { tileOf, featureBits, pipAbsent } from '../../core/fpga/bitgen.js';

// the tile types whose switches unify-io.mjs shares (one measurement serves the group)
export const UNIFY = [
  ['LIOIS', 'LIOIS_PCI', 'LIOIS_CLK_PCI', 'LIOIS_BRK', 'LIBUFS', 'LIBUFS_PCI', 'LIBUFS_CLK_PCI'],
  ['RIOIS', 'RIOIS_PCI', 'RIOIS_CLK_PCI', 'RIBUFS', 'RIBUFS_PCI', 'RIBUFS_CLK_PCI', 'RIBUFS_BRK'],
  ['TIOIS', 'TIBUFS'], ['BIOIS', 'BIBUFS'],
  ['BRAM0_SMALL', 'BRAM1_SMALL', 'BRAM2_SMALL', 'BRAM3_SMALL', 'BRAM3_SMALL_BRK'],
];
const groupOf = new Map(UNIFY.flatMap(g => g.map(t => [t, g[0]])));
const group = t => groupOf.get(t) || t;

/** The PIPs measured by the batches of W: Set of `${group} ${from}->${to}`. */
export function measuredPips(W) {
  const out = new Set();
  const dir = path.join(W, 'pips');
  if (!fs.existsSync(dir)) return out;
  for (const b of fs.readdirSync(dir).sort()) {
    const f = path.join(dir, b, 'pips.json');
    if (!fs.existsSync(f)) continue;
    for (const p of JSON.parse(fs.readFileSync(f, 'utf8')).pips) out.add(`${group(p.type)} ${p.from}->${p.to}`);
  }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('want-pips.mjs')) {
  const args = process.argv.slice(2);
  const ti = args.indexOf('--types');
  const only = ti >= 0 ? new Set(args.splice(ti, 2)[1].split(',')) : null;
  const [refDir, W] = args;
  const g = loadGraph(PART);
  const db = loadDb(PART, { dir: refDir, graph: PART });
  const done = measuredPips(W);
  const want = {}, known = {};
  for (const [t, tile] of g.tiles.entries()) {
    if (only && !only.has(tile.type)) continue;
    const tt = tileOf(tile.name, db), type = tt && db.types[tt.type];
    // (the terminal tiles' and block-RAM sites' PIPs set no bits: pipsWithoutBits, not measured one by one)
    if (!type || type.pipsWithoutBits) continue;
    for (const i of g.pipsOf(t)) {
      if (g.rt[i]) continue;
      const from = g.names[g.pipA[i]], to = g.names[g.pipB[i]];
      const f = `${from}->${to}`;
      // a type sharing another's switch box (sameAs): only its own features (the shared ones are
      // measured on the other type)
      const own = db.tiles.types[tt.type].features || {};
      if (!(f in own) || featureBits(type, f) === undefined || pipAbsent(type, tile.name, from, to)) continue;
      (known[tile.type] ||= new Set()).add(f);
      if (!done.has(`${group(tile.type)} ${f}`)) (want[tile.type] ||= new Set()).add(f);
    }
  }
  const n = o => Object.values(o).reduce((s, x) => s + x.size, 0);
  console.error(`${n(known)} PIPs (per tile type) known to the reference database, ${done.size} measured, ${n(want)} left`);
  console.log(JSON.stringify(Object.fromEntries(Object.entries(want).map(([k, v]) => [k, [...v].sort()]))));
}
