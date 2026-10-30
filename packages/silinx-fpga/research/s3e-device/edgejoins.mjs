// #3, the irregular tiles: the joins of the edge (terminal) tiles and the corners, as hypotheses for the join tests
// (prototype.mjs tests). The switch-box rules (model.mjs) leave these tiles out; their joins seen in ISE's routes or
// confirmed by the rounds' tests are rules here too (joinRule: the same wires at the same offset), applied to every tile
// of the same prefix whose wires ISE's routes showed in a tile of that type; and the observations' ambiguous joins with
// an end in such a tile (not the clock lines': clocktests.mjs) are taken with each candidate that has one.
//   [WIRES=measured.json.gz] node edgejoins.mjs obs.json out.json [tested-dir…]      out.json: [[a, b]], neither observed nor tested
import fs from 'node:fs';
import path from 'node:path';
import { joinRule, tileXY, wireFamily } from './observe.mjs';
import { fileURLToPath } from 'node:url';

/** An edge tile or a corner. */
export const edgeTile = tile => /^(LTERM|RTERM|TTERM|BTERM|COB_|CNR_|UL_|UR_|LL_|LR_)/.test(tile);

/** The hypotheses: { rules: [[a, b]] (the known joins' rules applied), ambiguous: [[a, b]] }, none known or refused.
 *  tiles: every tile name of the device (the grid); known: [[a, b]] (observed or confirmed); refused: [[a, b]] (the tests'
 *  islands: not asked again); wiresOf(tile): the tile's wires in a measured graph (a Set), else the wires ISE's routes
 *  showed in its prefix. */
export function edgeHypotheses(obs, tiles, known, refused = [], wiresOf = null) {
  const ord = ([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const have = new Set([...known, ...refused].map(ord));
  // the wires seen in each tile prefix (an end must be a wire a route named there)
  const wires = new Map();
  for (const p of obs.pips) {
    const pre = tileXY(p.tile)?.prefix;
    if (!pre) continue;
    if (!wires.has(pre)) wires.set(pre, new Set());
    wires.get(pre).add(p.from); wires.get(pre).add(p.to);
  }
  const at = new Map(), byPrefix = new Map();
  for (const t of tiles) { const x = tileXY(t); if (!x) continue; at.set(`${x.prefix}|${x.x},${x.y}`, t); if (!byPrefix.has(x.prefix)) byPrefix.set(x.prefix, []); byPrefix.get(x.prefix).push(x); }
  const rules = new Set(known.filter(([a, b]) => edgeTile(a) || edgeTile(b)).map(([a, b]) => joinRule(a, b)).filter(Boolean));
  const out = new Map();
  for (const r of rules) {
    const m = /^(\S+?)\/(\S+) (-?\d+),(-?\d+) (\S+?)\/(\S+)$/.exec(r);
    if (!m) continue;
    const [, pa, wa, dx, dy, pb, wb] = m;
    if (!wiresOf && (!wires.get(pa)?.has(wa) || !wires.get(pb)?.has(wb))) continue;
    for (const A of byPrefix.get(pa) || []) {
      const tb = at.get(`${pb}|${A.x + +dx},${A.y + +dy}`), ta = `${pa}_X${A.x}Y${A.y}`;
      if (!tb || (wiresOf && (!wiresOf(ta)?.has(wa) || !wiresOf(tb)?.has(wb)))) continue;
      const j = [`${ta}/${wa}`, `${tb}/${wb}`];
      if (!have.has(ord(j))) out.set(ord(j), j);
    }
  }
  const amb = new Map();
  for (const a of obs.ambiguous) {
    if (a.src || wireFamily(a.from.split('/')[1]) === 'gclk') continue;
    for (const c of a.candidates) {
      if (!edgeTile(a.from) && !edgeTile(c)) continue;
      const j = [c, a.from];
      if (!have.has(ord(j)) && !out.has(ord(j))) amb.set(ord(j), j);
    }
  }
  return { rules: [...out.values()], ambiguous: [...amb.values()] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [obsFile, outFile, ...dirs] = process.argv.slice(2);
  const obs = JSON.parse(fs.readFileSync(obsFile, 'utf8'));
  const { loadDeviceCache } = await import('../../src/fpga/device-node.js');
  const tiles = loadDeviceCache(process.env.PART || 'xc3s250ecp132-4').tileNames;
  const verdicts = dirs.flatMap(d => JSON.parse(fs.readFileSync(path.join(d, 'verdicts.json'), 'utf8')));
  const known = [...obs.joins, ...verdicts.filter(v => v[2] === 'join').map(v => [v[0], v[1]])];
  // (WIRES=measured.json.gz: the tiles' wires a measured graph has, chip.mjs's)
  let wiresOf = null;
  if (process.env.WIRES) {
    const { loadDevice } = await import('../../src/fpga/device.js');
    const zlib = await import('node:zlib');
    const G = loadDevice(JSON.parse(zlib.gunzipSync(fs.readFileSync(process.env.WIRES))));
    const cache = new Map();
    wiresOf = t => { if (!cache.has(t)) { const k = G.tile(t); cache.set(t, k === undefined ? null : new Set(Array.from(G.templates[G.tileTemplate[k]].wires, i => G.names[i]))); } return cache.get(t); };
  }
  const r = edgeHypotheses(obs, tiles, known, verdicts.filter(v => v[2] === 'no-join').map(v => [v[0], v[1]]), wiresOf);
  fs.writeFileSync(outFile, JSON.stringify([...r.rules, ...r.ambiguous]));
  console.log(`${r.rules.length} joins by the rules of the edge tiles' known joins, ${r.ambiguous.length} ambiguous candidates with an end in one`);
}
