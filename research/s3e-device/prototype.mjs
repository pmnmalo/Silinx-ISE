// The phase-2 prototype (research/s3e-device/README.md): a measured description of the XC3S250E's
// CLB array, from ISE-routed designs, the probes and the join tests only.
//
//   node prototype.mjs observe obs.json routed.xdl...           what ISE's routed designs show
//   node prototype.mjs predict obs.json switch-tiles.txt pred.json [tested-dir...]
//                                                               rules -> predicted joins not yet observed or tested
//                                                               (CLOSE=1: closeRules too; SEG=1: segmentRules too)
//   node prototype.mjs tests pred.json obs.json dir [tested-dir...]   join test designs (run: ise-remote.sh dir);
//                                                               (SOURCES=1, DBPIPS=1, SOURCEXDL=routed.xdl,…: rounds 4-6;
//                                                               PROBED=probe.json: 7; SOURCEOBS=obs.json, UNBONDED=1: 8)
//                                                               a tile with no slice driven from a CLB across known joins
//   node prototype.mjs verdicts dir...                          -> dir/verdicts.json (ISE's DRC)
//   node prototype.mjs build obs.json clb-tiles.txt out.json.gz dir...   the measured CLB array
//   node prototype.mjs compare measured.json.gz                 against the shipped graph (local scoring only)
//   node prototype.mjs score dir...                             the tests' verdicts against the shipped graph (local scoring only)
//   node prototype.mjs pins obs.json [other.json…]              the observed pin wires against the shipped graph, per site
//                                                               type (local scoring only; pins.mjs); other.json: another
//                                                               package's observation, its pads renamed (renamePads)
//
// switch-tiles.txt: the tiles that hold a switch box (the tile probe, probe-run.mjs, plus the DCM and
// corner tiles seen in ISE's designs); clb-tiles.txt: the CLB tiles (the tile probe).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parseXdl } from '../../core/xdl.js';
import { loadDevice, PIP_BIDI } from '../../core/fpga/device.js';
import { observeDesign, resolveAmbiguous, intersectAmbiguous, tileXY, wireFamily, blockRamOutputJoins } from './observe.mjs';
import { switchGrid, gridRule, applyRules, closeRules, segmentRules, nodesOf } from './model.mjs';
import { joinTestDesigns, parseJoinTests, testSources } from './hypotheses.mjs';
import { clbSlices } from './gen-observe.mjs';
import { packMeasured } from './build.mjs';
import { pinCensus, renamePads } from './pins.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DB = path.join(HERE, '../s3e-bitstream/db');
const PART = process.env.PART || 'xc3s250ecp132-4';
const readJson = f => JSON.parse(/\.gz$/.test(f) ? zlib.gunzipSync(fs.readFileSync(f)).toString() : fs.readFileSync(f, 'utf8'));
const lines = f => fs.readFileSync(f, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
const tiles = readJson(path.join(DB, 's3e-tiles.json'));
const layout = readJson(path.join(DB, `${PART.replace(/(cp|fg|vq|tq|pq|ft)\d+-\d+$/, '')}-layout.json`));

/** The bit database's type of a tile (CLB tiles: CENTER_SMALL, CENTER_SMALL_BRK in the break rows). */
const dbType = name => { const { prefix, y } = tileXY(name); return prefix === 'CLB' ? ((layout.brkRows || []).includes(y) ? 'CENTER_SMALL_BRK' : 'CENTER_SMALL') : prefix; };

/** PIPs per tile type: the CLB's from the bit database, the others' from ISE's routed designs only
 *  (the database shares the I/O tiles' features between types, README.md). With DBPIPS=1 (round 6, #3) the
 *  block-RAM tiles' too: their own features (BRAMSITE2's pins, the interconnect's BRAM_DO… -> OMUXk) and the CLB's
 *  switch box they share, less the PIPs and wires they do not have (`absent`, #74), so that a test can drive every
 *  output line of a block RAM, not only those ISE's routes happened to take. */
function pipTable(obs) {
  const seen = new Map();
  for (const p of obs.pips) { const t = dbType(p.tile); if (!seen.has(t)) seen.set(t, new Map()); seen.get(t).set(`${p.from}->${p.to}`, p.dir); }
  const cache = new Map();
  return type => {
    if (!cache.has(type)) {
      const m = new Map();
      // (the break rows' CLB shares the CLB's features: sameAs; the census probe checks them per tile)
      if (/^CENTER_SMALL/.test(type) || (process.env.DBPIPS === '1' && /^BRAM(\d_SMALL|SITE2)/.test(type))) {
        const absent = new Set(tiles.types[type]?.absent || []);
        for (const ty of new Set([type, tiles.types[type]?.sameAs].filter(Boolean))) for (const f of Object.keys(tiles.types[ty]?.features || {})) {
          if (!/^\S+->\S+$/.test(f) || absent.has(f) || f.split('->').some(w => absent.has(w))) continue;
          m.set(f, '->');
        }
      }
      for (const [f, dir] of seen.get(type) || []) m.set(f, dir);
      // a bidirectional PIP seen as `a =- b`: both orientations exist
      for (const [f, dir] of [...m]) if (dir === '=-') { const [a, b] = f.split('->'); m.set(`${a}->${b}`, '=-'); m.set(`${b}->${a}`, '=-'); }
      cache.set(type, [...m].map(([f, dir]) => { const [a, b] = f.split('->'); return [a, b, dir === '=-' ? PIP_BIDI : 0]; }));
    }
    return cache.get(type);
  };
}

/** The tile wire of each pin of each slice position (0-3), from the observed pins. */
function pinTable(obs) {
  const m = new Map();
  for (const p of obs.pins) { const s = /^SLICE_X(\d+)Y(\d+)$/.exec(p.site); if (s) m.set(`${2 * (s[1] % 2) + (s[2] % 2)}.${p.pin}`, [p.wire, p.dir]); }
  return m;
}

const [cmd, ...args] = process.argv.slice(2);

if (cmd === 'observe') {
  const [out, ...files] = args;
  const all = { pips: [], sites: [], joins: [], pins: [], ambiguous: [], unexplained: [] };
  for (const f of files) { const o = observeDesign(parseXdl(fs.readFileSync(f, 'utf8'))); for (const k in all) all[k].push(...o[k]); }
  const amb = [...new Map(all.ambiguous.map(x => [`${x.from}<${x.candidates.join(',')}${x.src ? '<src' : ''}`, x])).values()];
  // (INTERSECT=1: first the intersection of each wire's candidates over the nets, intersectAmbiguous)
  const ix = process.env.INTERSECT === '1' ? intersectAmbiguous(amb) : { joins: [], ambiguous: amb };
  const r = resolveAmbiguous(ix.ambiguous, [...all.joins, ...ix.joins]);
  const joins = [...new Map([...all.joins, ...ix.joins, ...r.joins].map(j => [j.join('|'), j])).values()];
  const pips = [...new Map(all.pips.map(p => [`${p.tile} ${p.from} ${p.dir} ${p.to}`, p])).values()];
  const pins = [...new Map(all.pins.map(p => [`${p.site}.${p.pin}`, p])).values()];
  const sites = [...new Map(all.sites.map(s => [s.site, s])).values()];
  fs.writeFileSync(out, JSON.stringify({ pips, sites, pins, joins, ambiguous: r.ambiguous, unexplained: [...new Set(all.unexplained)] }));
  const direct = new Set(all.joins.map(j => j.join('|'))).size;
  const byIx = new Set(ix.joins.map(j => j.join('|'))).size;
  console.log(`${files.length} designs: ${all.pips.length} PIPs (${pips.length} distinct), ${sites.length} sites, ${pins.length} pin wires, ${joins.length} joins (${direct} with one candidate, ${byIx ? `${byIx} by the intersection, ` : ''}${joins.length - direct - byIx} decided by rules), ${r.ambiguous.length} ambiguous, ${new Set(all.unexplained).size} unexplained`);
} else if (cmd === 'predict') {
  const [obsFile, sbFile, out, ...tested] = args;
  const obs = readJson(obsFile);
  const grid = switchGrid(lines(sbFile));
  const pipsOf = pipTable(obs);
  const wireCache = new Map();
  const wiresOf = t => { const ty = dbType(t); if (!wireCache.has(ty)) { const s = new Set(); for (const [a, b] of pipsOf(ty)) { s.add(a); s.add(b); } wireCache.set(ty, s); } return wireCache.get(ty); };
  const rules = new Set();
  for (const [a, b] of obs.joins) { const r = gridRule(a, b, grid); if (r) rules.add(r); }
  let closed = process.env.CLOSE === '1' ? closeRules(rules) : rules;
  if (process.env.SEG === '1') closed = new Set([...closed, ...segmentRules()]);
  const pred = applyRules(closed, grid, wiresOf);
  const ord = ([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const uniq = [...new Map(pred.map(j => [ord(j), ord(j).split('|')])).values()];
  // not observed, and not tested yet (the verdicts of earlier test folders)
  const known = new Set([...obs.joins.map(ord), ...tested.flatMap(d => readJson(path.join(d, 'verdicts.json')).map(v => ord(v)))]);
  const fresh = uniq.filter(j => !known.has(ord(j)));
  fs.writeFileSync(out, JSON.stringify(fresh));
  console.log(`${rules.size} rules from ${obs.joins.length} observed joins, ${closed.size} with CLOSE / SEG: ${uniq.length} predicted joins, ${fresh.length} neither observed nor tested`);
} else if (cmd === 'tests') {
  // tested-dir...: the joins earlier tests confirmed are known, as the observed ones: a test of a
  // tile with no slice (I/O, block-RAM switch boxes, the edges) is driven from a CLB across them
  // (MAXJOINS, default 2; MAXJOINS=0: only from the tested wire's own CLB, as the first tests)
  const [predFile, obsFile, dir, ...tested] = args;
  const obs = readJson(obsFile);
  const pins = pinTable(obs);
  const pipsOf = pipTable(obs);
  const maxJoins = +(process.env.MAXJOINS ?? 2);
  const joins = readJson(predFile).filter(([a, b]) => maxJoins > 0 || a.startsWith('CLB_') || b.startsWith('CLB_'));
  // (SOURCEXDL=a.xdl,b.xdl: ISE's routed designs, round 6: where a block RAM's output enters its interconnect tile, the
  // join of the site tile's BRAM_DO…_INTk (RAMB16_DO… -> BRAM_DO…_INTk) and the interconnect's BRAM_DO… (the from-wire of
  // the net's first PIP there), so that a test reaches every OMUX line through the bit database's BRAM_DO… -> OMUXk)
  // (PROBED=probe.json, round 7: the PIPs the arc probe confirmed in each tile, probe-run.mjs on candidates.mjs io: the I/O
  // tiles' switches the database shares between types, each asked of xdl -xdl2ncd in that very tile)
  const probed = new Map();
  if (process.env.PROBED) for (const p of readJson(process.env.PROBED).pips.yes) { if (!probed.has(p.tile)) probed.set(p.tile, []); probed.get(p.tile).push([p.from, p.to, 0]); }
  const pinJoins = (process.env.SOURCEXDL || '').split(',').filter(Boolean).flatMap(f => blockRamOutputJoins(parseXdl(fs.readFileSync(f, 'utf8')), t => /^BRAM\d_SMALL/.test(dbType(t))));
  const known = [...obs.joins, ...pinJoins, ...tested.flatMap(d => readJson(path.join(d, 'verdicts.json')).filter(v => v[2] === 'join').map(v => [v[0], v[1]]))];
  const joinedTo = new Map();
  for (const [a, b] of known) for (const [x, y] of [[a, b], [b, a]]) { if (!joinedTo.has(x)) joinedTo.set(x, []); joinedTo.get(x).push(y); }
  // the known nodes are reserved whole: two tests never share one
  const root = nodesOf(known), members = new Map();
  for (const [k, r] of root) { if (!members.has(r)) members.set(r, []); members.get(r).push(k); }
  const slicesOf = t => (t.startsWith('CLB_') ? clbSlices(t).map((site, pos) => ({ site, pos })) : []);
  // (SOURCES=1: the IOBs' inputs and the block RAMs' outputs observed in ISE's routes as test sources too, #3; SOURCEOBS,
  // UNBONDED: round 8, testSources)
  const extra = process.env.SOURCES === '1' ? testSources(obs, {
    sourceObs: process.env.SOURCEOBS ? readJson(process.env.SOURCEOBS) : null, joins,
    device: process.env.UNBONDED === '1' ? loadDevice(readJson(path.join(HERE, '../../core/fpga/devices', `${PART}.json.gz`))) : null,
  }) : new Map();
  const r = joinTestDesigns({
    part: PART, joins, slicesOf, pinWire: (pos, pin) => pins.get(`${pos}.${pin}`)?.[0],
    pipsOf: t => [...pipsOf(dbType(t)), ...(probed.get(t) || [])].filter(([a, b, f]) => !(f & PIP_BIDI)),
    joined: k => joinedTo.get(k) || [], nodeOf: k => (root.has(k) ? members.get(root.get(k)) : [k]),
    maxJoins, maxDepth: +(process.env.MAXDEPTH ?? 3), sourcesOf: t => extra.get(t) || [],
  });
  fs.mkdirSync(dir, { recursive: true });
  r.designs.forEach((d, i) => fs.writeFileSync(path.join(dir, `j${i}.xdl`), d.xdl));
  fs.writeFileSync(path.join(dir, 'tests.json'), JSON.stringify({ designs: r.designs.map(d => d.tests), untestable: r.untestable }));
  console.log(`${joins.length} joins: ${r.designs.length} designs, ${r.designs.reduce((n, d) => n + d.tests.length, 0)} tests, ${r.untestable.length} not testable from a CLB (${known.length} known joins, crossing up to ${maxJoins})`);
} else if (cmd === 'verdicts') {
  for (const dir of args) {
    const t = readJson(path.join(dir, 'tests.json'));
    const out = [], count = {};
    t.designs.forEach((tests, i) => {
      const f = path.join(dir, `j${i}.drc.log`);
      const log = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
      const ok = /PhysDesignRules results/.test(log);
      const v = ok ? parseJoinTests(log, tests.map(x => x.net)) : null;
      for (const x of tests) { const verdict = v ? v.get(x.net) : 'not-run'; count[verdict] = (count[verdict] || 0) + 1; out.push([...x.join, verdict]); }
    });
    fs.writeFileSync(path.join(dir, 'verdicts.json'), JSON.stringify(out));
    console.log(dir, JSON.stringify(count));
  }
} else if (cmd === 'build') {
  const [obsFile, clbFile, out, ...dirs] = args;
  const obs = readJson(obsFile);
  const clbs = lines(clbFile).filter(t => t.startsWith('CLB_'));
  const clbSet = new Set(clbs);
  const pipsOf = pipTable(obs);
  const pins = pinTable(obs);
  const slicePins = pos => [...pins].filter(([k]) => k.startsWith(`${pos}.`)).map(([k, [w, d]]) => [k.slice(2), d, w]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const types = {};
  for (const ty of ['CENTER_SMALL', 'CENTER_SMALL_BRK']) {
    const p = pipsOf(ty);
    const sites = [0, 1, 2, 3].map(pos => ({ type: pos < 2 ? 'SLICEM' : 'SLICEL', pins: slicePins(pos) }));
    const wires = new Set();
    for (const [a, b] of p) { wires.add(a); wires.add(b); }
    for (const s of sites) for (const [, , w] of s.pins) wires.add(w);
    types[ty] = { wires: [...wires].sort(), pips: p, sites };
  }
  // joins: observed, and predicted ones ISE's DRC confirmed; both ends in the CLB array
  const confirmed = dirs.flatMap(d => readJson(path.join(d, 'verdicts.json')).filter(v => v[2] === 'join').map(v => [v[0], v[1]]));
  const has = k => { const [t, w] = [k.slice(0, k.indexOf('/')), k.slice(k.indexOf('/') + 1)]; return clbSet.has(t) && types[dbType(t)].wires.includes(w); };
  const joins = [...obs.joins, ...confirmed].filter(([a, b]) => has(a) && has(b));
  // CENSUS=result.json (probe-run.mjs of every PIP in every CLB): the PIPs ISE refused in a tile
  // are left out of it (the tiles with the same refusals share a variant of the type)
  const refused = new Map();
  if (process.env.CENSUS) for (const p of readJson(process.env.CENSUS).pips.no) { if (!refused.has(p.tile)) refused.set(p.tile, new Set()); refused.get(p.tile).add(`${p.from}->${p.to}`); }
  const typeOf = name => {
    const base = dbType(name), no = refused.get(name);
    if (!no) return base;
    const key = `${base}#${[...no].sort().join(',')}`;
    if (!types[key]) types[key] = { ...types[base], name: base, pips: types[base].pips.filter(([a, b]) => !no.has(`${a}->${b}`) && !no.has(`${b}->${a}`)) };
    return key;
  };
  const m = {
    part: PART, family: 'spartan3e', types, joins,
    tiles: clbs.map(name => ({ name, type: typeOf(name), sites: clbSlices(name).map(s => [s, 0]) })),
  };
  const packed = packMeasured(m);
  fs.writeFileSync(out, zlib.gzipSync(JSON.stringify(packed), { level: 9 }));
  console.log(`${clbs.length} CLB tiles, ${joins.length} joins (${confirmed.length} confirmed by tests): ${JSON.stringify(packed.counts)}`);
} else if (cmd === 'compare') {
  const [measFile, refFile = path.join(HERE, '../../core/fpga/devices', `${PART}.json.gz`)] = args;
  const M = loadDevice(readJson(measFile)), R = loadDevice(readJson(refFile));
  // BAND=y0,y1: only the tiles of those rows (a prototype tested on part of the chip)
  const [y0, y1] = (process.env.BAND || '0,999').split(',').map(Number);
  const inBand = name => { const p = tileXY(name); return p && p.y >= y0 && p.y <= y1; };
  const s = { tiles: 0, tilesMissing: 0, wires: 0, wiresMissing: 0, refWiresWithPips: 0, refWiresNoPip: 0, pips: 0, pipsMissing: 0, pipsExtra: 0, bidiDiff: 0, sites: 0, siteTypeDiff: 0, pins: 0, pinsMissing: 0, pinsDiff: 0 };
  const ex = { pipsMissing: new Map(), pipsExtra: new Map(), wiresMissing: new Map(), pinsMissing: new Map() };
  const note = (k, x) => ex[k].set(x, (ex[k].get(x) || 0) + 1);
  for (let k = 0; k < M.tileCount; k++) {
    const name = M.tileNames[k], rk = R.tile(name);
    if (!inBand(name)) continue;
    s.tiles++;
    if (rk === undefined) { s.tilesMissing++; continue; }
    const mt = M.templates[M.tileTemplate[k]], rt = R.templates[R.tileTemplate[rk]];
    const mw = new Set([...mt.wires].map(i => M.names[i]));
    const rUsed = new Set();
    for (let i = 0; i < rt.from.length; i++) { rUsed.add(rt.from[i]); rUsed.add(rt.to[i]); }
    rt.sites.forEach(si => si.pins.forEach(p => rUsed.add(p.wire)));
    rt.wires.forEach((n, i) => { const nm = R.names[n]; if (rUsed.has(i)) { s.refWiresWithPips++; if (!mw.has(nm)) { s.wiresMissing++; note('wiresMissing', nm.replace(/\d+$/, '#')); } } else s.refWiresNoPip++; });
    s.wires += mw.size;
    const rp = new Map();
    for (let i = 0; i < rt.from.length; i++) rp.set(`${R.names[rt.wires[rt.from[i]]]}->${R.names[rt.wires[rt.to[i]]]}`, rt.flags[i]);
    const mp = new Map();
    for (let i = 0; i < mt.from.length; i++) mp.set(`${M.names[mt.wires[mt.from[i]]]}->${M.names[mt.wires[mt.to[i]]]}`, mt.flags[i]);
    for (const [p, f] of rp) { s.pips++; if (!mp.has(p)) { s.pipsMissing++; note('pipsMissing', p.replace(/\d+/g, '#')); } else if ((mp.get(p) & PIP_BIDI) !== (f & PIP_BIDI)) s.bidiDiff++; }
    for (const p of mp.keys()) if (!rp.has(p)) { s.pipsExtra++; note('pipsExtra', p); }
    M.tileSites[k].forEach(([sn], i) => {
      s.sites++;
      const rs = R.site(sn), ms = M.site(sn);
      if (!rs || rs.type !== ms.type) { s.siteTypeDiff++; return; }
      for (const [pin, p] of rs.pins) {
        s.pins++;
        const q = ms.pins.get(pin);
        if (!q) { s.pinsMissing++; note('pinsMissing', pin); } else if (M.names[mt.wires[q.wire]] !== R.names[rt.wires[p.wire]]) s.pinsDiff++;
      }
    });
  }
  // nodes over the measured wires: the reference's nodes cut to the measured CLB wires
  const refPiece = new Map(), measPiece = new Map();
  let wires = 0;
  for (let w = 0; w < M.wireCount; w++) {
    const { tile, name } = M.wireInfo(w);
    if (!inBand(tile)) continue;
    const rn = R.node(tile, name);
    if (rn < 0) continue;
    wires++;
    const key = `${tile}/${name}`;
    const a = refPiece.get(rn) || []; a.push(key); refPiece.set(rn, a);
    const mn = M.nodeOf[w];
    const b = measPiece.get(mn) || []; b.push(key); measPiece.set(mn, b);
  }
  const measOf = new Map(); for (const [n, l] of measPiece) for (const k of l) measOf.set(k, n);
  let exact = 0, exactMulti = 0, split = 0, merged = 0, multi = 0;
  const splitEx = [], splitFam = new Map();
  for (const l of refPiece.values()) {
    if (l.length > 1) multi++;
    const ms = new Set(l.map(k => measOf.get(k)));
    if (ms.size > 1) {
      split++;
      if (splitEx.length < 8) splitEx.push(l.join(' '));
      const fam = wireFamily(l[0].slice(l[0].indexOf('/') + 1)) || 'other';
      splitFam.set(fam, (splitFam.get(fam) || 0) + 1);
    } else if (measPiece.get([...ms][0]).length !== l.length) merged++; else { exact++; if (l.length > 1) exactMulti++; }
  }
  const top = m => [...m].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}:${v}`).join(' ');
  console.log(JSON.stringify(s));
  console.log(`nodes over ${wires} measured wires: ${refPiece.size} reference pieces (${multi} with more than one wire): ${exact} exact (${exactMulti} of more than one wire), ${split} split (missing joins), ${merged} merged (extra joins)`);
  console.log('split pieces by family:', top(splitFam));
  console.log('PIPs missing (by pattern):', top(ex.pipsMissing));
  console.log('PIPs extra:', top(ex.pipsExtra));
  console.log('wires missing:', top(ex.wiresMissing));
  console.log('pins missing:', top(ex.pinsMissing));
  console.log('split examples:\n  ' + splitEx.join('\n  '));
} else if (cmd === 'score') {
  // ISE's verdicts against the shipped graph (local scoring only), by the kinds of the two tiles
  const R = loadDevice(readJson(path.join(HERE, '../../core/fpga/devices', `${PART}.json.gz`)));
  const kind = k => { const p = tileXY(k.slice(0, k.indexOf('/')))?.prefix || ''; return /^CLB/.test(p) ? 'CLB' : /IOIS|IBUFS/.test(p) ? 'IO' : /^BRAM/.test(p) ? 'BRAM' : p; };
  const node = k => { const i = k.indexOf('/'); return R.node(k.slice(0, i), k.slice(i + 1)); };
  const count = new Map(), wrong = [];
  for (const dir of args) for (const [a, b, v] of readJson(path.join(dir, 'verdicts.json'))) {
    const c = [kind(a), kind(b)].sort().join('-');
    if (!count.has(c)) count.set(c, { join: 0, 'no-join': 0, agree: 0, other: 0 });
    const s = count.get(c);
    if (v !== 'join' && v !== 'no-join') { s.other++; continue; }
    s[v]++;
    const na = node(a);
    if ((na >= 0 && na === node(b)) === (v === 'join')) s.agree++; else if (wrong.length < 10) wrong.push(`${a} ${b} ${v}`);
  }
  for (const [c, s] of [...count].sort()) console.log(`${c}: ${s.join} joins, ${s['no-join']} islands, ${s.agree} of ${s.join + s['no-join']} agree with the shipped graph${s.other ? `, ${s.other} unclear or not run` : ''}`);
  if (wrong.length) console.log('disagree:\n  ' + wrong.join('\n  '));
} else if (cmd === 'pins') {
  const R = loadDevice(readJson(path.join(HERE, '../../core/fpga/devices', `${PART}.json.gz`)));
  const others = args.slice(1).map(f => renamePads(readJson(f), R));
  for (const [i, o] of others.entries()) if (o.dropped.length) console.log(`${args[i + 1]}: ${o.dropped.length} I/O sites with no I pin fact left out`);
  const c = pinCensus({ pins: [...readJson(args[0]).pins, ...others.flatMap(o => o.pins)] }, R);
  console.log(`${c.right} pin facts agree with the shipped graph, ${c.wrong.length} do not`);
  for (const w of c.wrong.slice(0, 20)) console.log(`  ${w}`);
  for (const [ty, t] of Object.entries(c.types)) {
    if (!t.total) continue;
    console.log(`${ty.padEnd(14)} ${t.seen} of ${t.total} (tile type, site, pin); pin names ${t.names} of ${t.totalNames}${t.missing.length ? `; none: ${t.missing.join(' ')}` : ''}`);
  }
} else {
  console.error('usage: prototype.mjs observe|predict|tests|verdicts|build|compare|score|pins …');
  process.exit(1);
}
