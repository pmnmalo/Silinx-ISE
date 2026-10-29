// Candidates for the probes (probe-run.mjs): tiles, sites, the census of the CLBs' PIPs
// (research/s3e-device/README.md). From what ISE's routed designs showed (prototype.mjs observe) and
// the bit database; no device report.
//   node candidates.mjs tiles obs.json out.json      switch-box tiles: the observed prefixes at every X / Y of their kind
//   node candidates.mjs sites clb-tiles.txt out.json  a SLICEM on every slice site (the SLICEL sites refuse it), VCC sites
//   node candidates.mjs census clb-tiles.txt out.json every PIP of the database's CLB types in every CLB
//   node candidates.mjs io obs.json out.json [tests.json]   every PIP of the database's I/O types in every observed I/O tile
//                                                     (#3, round 7); with a round's tests.json, only those its untestable
//                                                     joins need (leftCandidates)
//   node candidates.mjs rest measured.json.gz out.json obs.json [probe.json,…]   every PIP of a measured description's
//                                                     non-CLB tiles neither ISE's routes nor a probe showed there, and an
//                                                     I/O tile's outputs in its own names (IOIS_X0): #3, section 10
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tileXY } from './observe.mjs';
import { clbSlices } from './gen-observe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PART = process.env.PART || 'xc3s250ecp132-4';
const DEVICE = PART.replace(/(cp|fg|vq|tq|pq|ft)\d+-\d+$/, '');
const SWITCH = /^(CLB|BRAM\d_SMALL(_BRK)?|[LRTB]IOIS.*|[LRTB]IBUFS.*)$/;

/** Switch-box tile candidates: each observed prefix at every X / Y of its kind (I/O tiles on their
 *  side, block-RAM interconnect in the observed block-RAM columns, CLBs inside), with a PIP every
 *  switch box has; the tiles already seen are not asked. */
export function tileCandidates(obsTiles) {
  const seen = new Set(obsTiles);
  const prefixes = new Set(); let maxX = 0, maxY = 0;
  const bramX = new Set();
  for (const t of seen) {
    const p = tileXY(t);
    if (!p) continue;
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    if (SWITCH.test(p.prefix)) prefixes.add(p.prefix);
    if (/^BRAM\d_SMALL/.test(p.prefix)) bramX.add(p.x);
  }
  const pips = [];
  for (const pre of prefixes) {
    const side = pre[0], io = /IOIS|IBUFS/.test(pre);
    for (let x = 0; x <= maxX; x++) for (let y = 0; y <= maxY; y++) {
      if (io) { if ((side === 'L' && x) || (side === 'R' && x !== maxX) || (side === 'B' && y) || (side === 'T' && y !== maxY)) continue; } else if (!x || !y || x === maxX || y === maxY) continue;
      if (/^BRAM/.test(pre) && !bramX.has(x)) continue;
      const t = `${pre}_X${x}Y${y}`;
      if (!seen.has(t)) pips.push({ tile: t, from: 'W2END4', to: 'W2BEG4' });
    }
  }
  return { pips, known: [...seen].filter(t => SWITCH.test(tileXY(t)?.prefix || '')) };
}

/** Site candidates: a SLICEM instance on every slice of the CLB tiles, VCC sites over the grid
 *  (their names run to max X + 2 / max Y + 2). */
export function siteCandidates(clbs) {
  const sites = clbs.flatMap(t => clbSlices(t).map(site => ({ site, type: 'SLICEM' })));
  const xs = clbs.map(t => tileXY(t).x), ys = clbs.map(t => tileXY(t).y);
  for (let x = 0; x <= Math.max(...xs) + 2; x++) for (let y = 0; y <= Math.max(...ys) + 3; y++) sites.push({ site: `VCC_X${x}Y${y}`, type: 'VCC' });
  return sites;
}

/** Census candidates: every PIP feature of the database's type of each CLB (the break rows' type
 *  with the CLB's it shares); BX / BY pairs written as bidirectional. */
export function censusCandidates(clbs, tilesDb, brkRows) {
  const feats = name => {
    const ty = tilesDb.types[name] || {};
    const all = [...Object.keys(ty.features || {}), ...Object.keys(tilesDb.types[ty.sameAs]?.features || {})];
    return [...new Set(all)].map(f => /^(\S+)->(\S+)$/.exec(f)).filter(Boolean).map(m => [m[1], m[2]]);
  };
  const F = { CENTER_SMALL: feats('CENTER_SMALL'), CENTER_SMALL_BRK: feats('CENTER_SMALL_BRK') };
  const pips = [];
  for (const t of clbs) {
    for (const [a, b] of F[brkRows.includes(tileXY(t).y) ? 'CENTER_SMALL_BRK' : 'CENTER_SMALL']) {
      pips.push({ tile: t, from: a, to: b, dir: /^B[XY]\d$/.test(a) && /^B[XY]\d$/.test(b) ? '=-' : '->' });
    }
  }
  return pips;
}

/** I/O census candidates (#3, round 7): every PIP feature of the database's type of each observed I/O tile (its own and
 *  the CLB switch box it shares), the PIPs ISE's routes showed there left out, and those the database records the type
 *  lacks (`absent`, #74). The database names an I/O tile's own wires as the CLB's (`rename`: IOIS_F1_B0 is F1_B0): a
 *  wire is the tile's IOIS_<name> where ISE's routes showed one in an I/O tile, else <name>. */
export function ioCandidates(obs, tilesDb, dbType) {
  const io = t => /IOIS|IBUFS/.test(tileXY(t)?.prefix || '');
  const seenWires = new Set(obs.pips.filter(p => io(p.tile)).flatMap(p => [p.from, p.to]));
  const name = w => (seenWires.has(`IOIS_${w}`) ? `IOIS_${w}` : w);
  const seenPips = new Set(obs.pips.map(p => `${p.tile} ${p.from} ${p.to}`));
  const pips = [];
  for (const t of new Set(obs.pips.map(p => p.tile).filter(io))) {
    const ty = tilesDb.types[dbType(t)];
    if (!ty) continue;
    const absent = new Set(ty.absent || []);
    const all = new Set([...Object.keys(ty.features || {}), ...Object.keys(tilesDb.types[ty.sameAs]?.features || {})]);
    for (const f of all) {
      const m = /^(\S+)->(\S+)$/.exec(f);
      if (!m || absent.has(f) || absent.has(m[1]) || absent.has(m[2])) continue;
      const [a, b] = [name(m[1]), name(m[2])];
      if (!seenPips.has(`${t} ${a} ${b}`)) pips.push({ tile: t, from: a, to: b, dir: '->' });
    }
  }
  return pips;
}

/** The I/O candidates a round's untestable joins need (#3, round 7): the PIPs into their ends in an I/O tile, and the
 *  PIPs into those PIPs' from-wires (a test's path one step further back), in the tile of each. */
export function leftCandidates(pips, untestable) {
  const io = n => /IOIS|IBUFS/.test(n.split('/')[0]);
  const want = new Set(untestable.flat().filter(io));
  const from = new Set(pips.filter(p => want.has(`${p.tile}/${p.to}`)).map(p => `${p.tile}/${p.from}`));
  return pips.filter(p => want.has(`${p.tile}/${p.to}`) || from.has(`${p.tile}/${p.to}`));
}

/** The PIPs of a measured description to ask in their own tile (#3, section 10): every PIP (no route-through) of a
 *  non-CLB tile that neither ISE's routes (obs) nor a probe (yes or no) showed in that tile, and, in an I/O tile, a PIP
 *  out of or into a site output written as the CLB's (X0, YQ1, F1_B0: the database's `rename`) in the tile's own name
 *  (IOIS_X0), the name ISE's routes use there. pips: [{ tile, from, to, routethru }]. */
export function restCandidates(pips, obs, probes = []) {
  const key = (t, a, b) => `${t} ${a} ${b}`;
  const seen = new Set(obs.pips.map(p => key(p.tile, p.from, p.to)));
  for (const r of probes) for (const p of [...r.pips.yes, ...r.pips.no]) seen.add(key(p.tile, p.from, p.to));
  const out = new Map();
  const add = (tile, from, to) => { const k = key(tile, from, to); if (!seen.has(k) && !out.has(k)) out.set(k, { tile, from, to, dir: '->' }); };
  const io = t => /IOIS|IBUFS/.test(t), site = w => /^((X|XQ|Y|YQ|XB|YB)\d|[FG]\d_B\d)$/.test(w);
  for (const p of pips) {
    if (p.routethru || p.tile.startsWith('CLB_')) continue;
    add(p.tile, p.from, p.to);
    if (!io(p.tile)) continue;
    if (site(p.from)) add(p.tile, `IOIS_${p.from}`, p.to);
    if (site(p.to)) add(p.tile, p.from, `IOIS_${p.to}`);
  }
  return [...out.values()];
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const [cmd, input, out, tests, probes] = process.argv.slice(2);
  const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
  const lines = f => fs.readFileSync(f, 'utf8').split('\n').map(s => s.trim()).filter(t => t.startsWith('CLB_'));
  let res;
  if (cmd === 'tiles') { const o = read(input); res = { part: PART, ...tileCandidates([...o.pips.map(p => p.tile), ...o.sites.map(s => s.tile)]) }; }
  else if (cmd === 'sites') res = { part: PART, sites: siteCandidates(lines(input)) };
  else if (cmd === 'census') {
    const db = path.join(HERE, '../../packages/silinx-fpga/bitdb');
    res = { part: PART, pips: censusCandidates(lines(input), read(path.join(db, 's3e-tiles.json')), read(path.join(db, `${DEVICE}-layout.json`)).brkRows || []) };
  } else if (cmd === 'io') {
    const db = read(path.join(HERE, '../../packages/silinx-fpga/bitdb/s3e-tiles.json'));
    const pips = ioCandidates(read(input), db, t => tileXY(t).prefix);
    res = { part: PART, pips: tests ? leftCandidates(pips, read(tests).untestable) : pips };
  } else if (cmd === 'rest') {
    const [{ default: zlib }, { loadDevice }] = await Promise.all([import('node:zlib'), import('../../packages/silinx-fpga/src/fpga/device.js')]);
    const M = loadDevice(JSON.parse(zlib.gunzipSync(fs.readFileSync(input))));
    const pips = [];
    for (let k = 0; k < M.tileCount; k++) for (let i = 0; i < M.templates[M.tileTemplate[k]].from.length; i++) pips.push(M.pip(k, i));
    res = { part: PART, pips: restCandidates(pips, read(tests), (probes || '').split(',').filter(Boolean).map(read)) };
  } else { console.error('usage: candidates.mjs tiles|sites|census|io|rest input out.json'); process.exit(1); }
  fs.writeFileSync(out, JSON.stringify(res));
  console.log(`${(res.pips || res.sites).length} candidates`);
}
