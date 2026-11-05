// #3, step 5 of the recommendation: the measured description of the whole chip, in Silinx's packed format (build.mjs),
// from what the steps measured (research/s3e-device/README.md), to compare whole with the shipped graph (prototype.mjs
// compare) and to route the examples on it.
//   PIPs of a tile: the bit database's features of its type (each accepted by xdl -xdl2ncd and its bits measured; an I/O
//     tile's in its own wire names, IOIS_<name>, as candidates.mjs io), less what the type lacks (`absent`, #74) and
//     what the arc probe refused in that tile, and every PIP ISE's routes took in a tile of the type (a bidirectional
//     one, `a =- b`, both ways);
//   wires: the PIPs' ends and the pins' wires;
//   tiles, rows and columns, sites (names, types, order, bonding): measured, grid.mjs (#2502; the device report's
//     until then); their pins where observed (every fact of step 3: ISE's routes, another package's by their slot);
//   joins: observed in ISE's routes, and confirmed by the tests (rounds 1-8, the edge tiles, the clock network); a carry
//     chain's lower CIN on the tile below's COUT_Nk (observe.mjs pinJoins), its wire CIN<k> of its slice's COUT<k>.
// The tiles of one type with different PIP sets are variants of it (the type's name kept).
//   PART=<part> node chip.mjs out.json.gz obs.json --tiles switch-tiles.txt [--ft obs.json,…] [--probe probe.json,…]
//     [--tests dir,…] [--clock dir,…]
//   (--ft: observations whose pins only are taken: another package's, its pads renamed; designs whose pins ISE's DRC
//   confirmed, such as Silinx's routes of the XB / YB outputs, which ISE's own designs never use)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { PIP_BIDI } from '../../src/fpga/device.js';
import { tileXY } from './observe.mjs';
import { packMeasured } from './build.mjs';
import { measuredGrid, measuredTiles, brkRowsOf, tileTypeOf, padSlots } from './grid.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PART = process.env.PART || 'xc3s250ecp132-4';
const readJson = f => JSON.parse(/\.gz$/.test(f) ? zlib.gunzipSync(fs.readFileSync(f)).toString() : fs.readFileSync(f, 'utf8'));

/**
 * The measurements (build.mjs's format) of the whole chip, from measurements alone (#2502: no device report): part;
 * tilesDb: the bit database's s3e-tiles.json; obs: an observation (prototype.mjs observe); others: other packages'
 * observations (their pads by their slot, grid.mjs padSlots); probe: { yes, no } of the arc probe; joins: [[a, b]]
 * confirmed by tests; switchTiles: the tile probe's tiles. The grid and the sites are measured (grid.mjs measuredGrid),
 * the pins keyed by the site's slot in its tile type. Returns the measurements, with the grid.
 */
export function chipMeasurements({ part = PART, tilesDb, obs, others = [], probe = { yes: [], no: [] }, joins = [], switchTiles = [], rules = false }) {
  const io = t => /IOIS|IBUFS/.test(tileXY(t)?.prefix || '');
  // the tile types of ISE's routes, by the measured break rows (a CLB's CENTER_SMALL / CENTER_SMALL_BRK)
  const brkRows = brkRowsOf(measuredTiles({ obs, probes: probe, joins, switchTiles }));
  const dbType = name => tileTypeOf(name, brkRows);
  // ISE's routes: the PIPs of each type, and the wires named IOIS_<name> in the I/O tiles
  const seen = new Map(), ioWires = new Set();
  for (const p of obs.pips) {
    const ty = dbType(p.tile);
    if (!seen.has(ty)) seen.set(ty, new Map());
    const m = seen.get(ty);
    m.set(`${p.from}->${p.to}`, (m.get(`${p.from}->${p.to}`) || 0) | (p.dir === '=-' ? PIP_BIDI : 0));
    if (p.dir === '=-') m.set(`${p.to}->${p.from}`, PIP_BIDI);
    if (io(p.tile)) { ioWires.add(p.from); ioWires.add(p.to); }
  }
  // and the ones the arc probe found there (IOIS_X0: no route of ISE's took an I/O tile's X output)
  for (const p of probe.yes || []) if (io(p.tile)) { ioWires.add(p.from); ioWires.add(p.to); }
  // (the database's names of an I/O tile's wires: its rename table, IOIS_VCC_WIRE as VCC_PINWIRE, IOIS_<name> as <name>)
  const ioName = w => (w === 'VCC_PINWIRE' ? 'IOIS_VCC_WIRE' : ioWires.has(`IOIS_${w}`) ? `IOIS_${w}` : w);
  const featCache = new Map();
  const features = ty => {
    if (!featCache.has(ty)) {
      const t = tilesDb.types[ty], out = new Map();
      if (t) {
        const absent = new Set(t.absent || []);
        for (const f of new Set([...Object.keys(t.features || {}), ...Object.keys(tilesDb.types[t.sameAs]?.features || {})])) {
          const m = /^(\S+)->(\S+)$/.exec(f);
          if (!m || absent.has(f) || absent.has(m[1]) || absent.has(m[2])) continue;
          out.set(io(`${ty}_X0Y0`) ? `${ioName(m[1])}->${ioName(m[2])}` : f, 0);
        }
      }
      featCache.set(ty, out);
    }
    return featCache.get(ty);
  };
  const refused = new Map();
  for (const p of probe.no || []) { if (!refused.has(p.tile)) refused.set(p.tile, new Set()); refused.get(p.tile).add(`${p.from}->${p.to}`); }
  const probedYes = new Map();
  for (const p of probe.yes || []) { if (!probedYes.has(p.tile)) probedYes.set(p.tile, new Set()); probedYes.get(p.tile).add(`${p.from}->${p.to}`); }
  // each tile's PIPs: its type's features, ISE's routes in the type, the probe's answers in the tile
  const tilePips = name => {
    const ty = dbType(name), pips = new Map(features(ty));
    for (const [f, fl] of seen.get(ty) || []) pips.set(f, (pips.get(f) || 0) | fl);
    for (const f of probedYes.get(name) || []) if (!pips.has(f)) pips.set(f, 0);
    for (const f of refused.get(name) || []) pips.delete(f);
    return pips;
  };
  // the type's VCC wire: the one wire named *VCC* its PIPs leave (null: none or several)
  const vccWire = pips => { const v = [...new Set([...pips.keys()].map(f => f.split('->')[0]).filter(w => /VCC/.test(w)))]; return v.length === 1 ? v[0] : null; };
  const grid = measuredGrid({ part, obs, others, probes: probe, joins, switchTiles, vccTypes: rules ? ty => vccWire(features(ty)) !== null : null });
  const typeOfTile = name => dbType(name);
  // pins: (tile type, site slot, pin) -> [dir, wire]
  const pinAt = new Map();
  const otherPins = others.flatMap(o => {
    const pads = padSlots(o), padSites = new Set((o.sites || []).filter(x => /^(IOB|IBUF|DIFF)/.test(x.type)).map(x => x.site));
    return o.pins.map(p => (padSites.has(p.site) ? (pads.has(p.site) ? { ...p, slot: pads.get(p.site) } : null) : p)).filter(Boolean);
  });
  for (const p of [...obs.pins, ...otherPins]) {
    const s = p.slot ? { tile: p.tile, slot: p.slot } : grid.site.get(p.site);
    if (!s) continue;
    pinAt.set(`${typeOfTile(s.tile)}|${s.slot}|${p.pin}`, [p.dir, p.wire]);
  }
  // a carry chain's lower CIN (pinJoins: on the node of the tile below's COUT_Nk, its own wire not named by the route): the
  // wire CIN<k> of the slice's own COUT<k>, the index every observed carry pin follows (COUT3 / CIN3, COUT1 / CIN1)
  const pinJoins = [];
  let byRule = 0;
  // (PINRULES=1, the wide multiplexers: a slice's FXINB on its FXINA's wire with A and B swapped, FX<k> of its F5<k>: what
  // the three positions ISE's routes showed follow (FXINA0 / FXINB0; FXINB2 / FXINA2, the upper-left slice's pins
  // crossed), for the fourth's, whose F8 takes FXINB from the CLB above (FX -> FX_Sk there, nothing in its own tile))
  if (rules) for (const [k, v] of [...pinAt]) {
    const [tt, i, pin] = k.split('|');
    if (pin === 'FXINA' && !pinAt.has(`${tt}|${i}|FXINB`)) { pinAt.set(`${tt}|${i}|FXINB`, ['i', v[1].replace(/FXIN([AB])/, (m, x) => `FXIN${x === 'A' ? 'B' : 'A'}`)]); byRule++; }
    if (pin === 'F5' && !pinAt.has(`${tt}|${i}|FX`)) { pinAt.set(`${tt}|${i}|FX`, ['o', v[1].replace(/^F5/, 'FX')]); byRule++; }
  }
  // (the pin's tile type and site slot, and its wire: CIN<k> of the slice's own COUT<k>; FXINB by the rule above; a
  // multiplier's BCINk, which no route names (its cascade ends in the tile below, MULT_CARRYB_BCOUTk), on a wire named
  // as the pin under PINRULES; patterns: each kind's offset and wire at the other end, for the rule below)
  const pjPatterns = new Map();
  for (const pj of obs.pinJoins || []) {
    const s = grid.site.get(pj.site);
    if (!s) continue;
    const i = s.slot, tt = typeOfTile(s.tile);
    if (pj.pin === 'CIN' && !pinAt.has(`${tt}|${i}|CIN`)) {
      const cout = pinAt.get(`${tt}|${i}|COUT`);
      if (cout) pinAt.set(`${tt}|${i}|CIN`, ['i', `CIN${cout[1].replace(/^COUT/, '')}`]);
    }
    if (/^BCIN\d+$/.test(pj.pin) && rules && !pinAt.has(`${tt}|${i}|${pj.pin}`)) { pinAt.set(`${tt}|${i}|${pj.pin}`, ['i', pj.pin]); byRule++; }
    const w = pinAt.get(`${tt}|${i}|${pj.pin}`);
    if (!w) continue;
    pinJoins.push([pj.end, `${pj.tile}/${w[1]}`]);
    const a = tileXY(pj.tile), [et, ew] = [pj.end.slice(0, pj.end.indexOf('/')), pj.end.slice(pj.end.indexOf('/') + 1)], b = tileXY(et);
    if (a && b) pjPatterns.set(`${tt}|${i}|${pj.pin}`, { dx: b.x - a.x, dy: b.y - a.y, prefix: b.prefix, wire: ew });
  }
  // (PINRULES=1: a slice pin no design showed in a tile type taken from the other CLB type's same slot, CENTER_SMALL /
  // CENTER_SMALL_BRK being the same slices; an XB / YB not seen at a slot, XB<k> / YB<k> of the slot's COUT<k>.
  // Rules, not measurements: what a route uses of them ISE checks, scripts/check-open-flow.mjs)
  const twin = { CENTER_SMALL: 'CENTER_SMALL_BRK', CENTER_SMALL_BRK: 'CENTER_SMALL' };
  if (rules) {
    for (const [k, v] of [...pinAt]) {
      const [tt, i, pin] = k.split('|');
      if (twin[tt] && !pinAt.has(`${twin[tt]}|${i}|${pin}`)) { pinAt.set(`${twin[tt]}|${i}|${pin}`, v); byRule++; }
    }
    for (const tt of Object.keys(twin)) for (let i = 0; i < 4; i++) {
      const cout = pinAt.get(`${tt}|S${i}|COUT`);
      if (!cout) continue;
      const n = cout[1].replace(/^COUT/, '');
      for (const pin of ['XB', 'YB']) if (!pinAt.has(`${tt}|S${i}|${pin}`)) { pinAt.set(`${tt}|S${i}|${pin}`, ['o', `${pin}${n}`]); byRule++; }
    }
  }
  // (PINRULES=1: a pin joined to another tile's wire in some tiles (a carry chain's lower CIN, an F8's FXINB, a
  // multiplier's BCIN) is joined the same way in every tile of its type, and of its CLB twin, where that tile is: the
  // chains ISE's designs placed do not cross every boundary; an I/O block's ICLK1 / OTCLK1 on the wire of its ICLK2 /
  // OTCLK2 with the 2 for a 1 (and back), else on <pin><k> of its Ik_PINWIRE; a DCM's pin seen in one of the four DCM
  // tiles on the same wire in the others)
  let joinsByRule = 0;
  if (rules) {
    for (const [k, v] of [...pjPatterns]) { const [tt, i, pin] = k.split('|'); if (twin[tt] && !pjPatterns.has(`${twin[tt]}|${i}|${pin}`)) pjPatterns.set(`${twin[tt]}|${i}|${pin}`, v); }
    const have = new Set(pinJoins.map(([, b]) => b)), tileNames = new Set(grid.tiles.map(t => t.name));
    for (const t of grid.tiles) {
      const a = tileXY(t.name);
      for (const st of t.sites) {
        for (const [pk, p] of pjPatterns) {
          const [ptt, pi, pin] = pk.split('|');
          if (ptt !== t.type || pi !== st.slot) continue;
          const w = pinAt.get(`${t.type}|${st.slot}|${pin}`), other = `${p.prefix}_X${a.x + p.dx}Y${a.y + p.dy}`;
          if (!w || !tileNames.has(other) || have.has(`${t.name}/${w[1]}`)) continue;
          pinJoins.push([`${other}/${p.wire}`, `${t.name}/${w[1]}`]); joinsByRule++;
        }
      }
    }
    for (const [k, v] of [...pinAt]) {
      const [tt, i, pin] = k.split('|'), m = /^(ICLK|OTCLK)([12])$/.exec(pin);
      if (!m || !/IOIS|IBUFS/.test(tt)) continue;
      const to = `${m[1]}${m[2] === '1' ? 2 : 1}`;
      if (!pinAt.has(`${tt}|${i}|${to}`) && new RegExp(`^${pin}\\d$`).test(v[1])) { pinAt.set(`${tt}|${i}|${to}`, [v[0], `${to}${v[1].slice(-1)}`]); byRule++; }
    }
    // (and an I/O site's clock pins still not seen, on <pin><k> of its I pin's Ik_PINWIRE, the rule every observed one
    // follows: an input-only pad's OTCLK1 / OTCLK2, which no design can drive)
    for (const [k, v] of [...pinAt]) {
      const [tt, i, pin] = k.split('|'), m = pin === 'I' && /^I(\d)_PINWIRE$/.exec(v[1]);
      if (!m || !/IOIS|IBUFS/.test(tt)) continue;
      for (const c of ['ICLK1', 'ICLK2', 'OTCLK1', 'OTCLK2']) if (!pinAt.has(`${tt}|${i}|${c}`)) { pinAt.set(`${tt}|${i}|${c}`, ['i', `${c}${m[1]}`]); byRule++; }
    }
    const dcm = [...new Set(grid.tiles.map(t => t.type).filter(t => /^DCM_[TB][LR]_CENTER$/.test(t)))];
    for (const [k, v] of [...pinAt]) {
      const [tt, i, pin] = k.split('|');
      if (dcm.includes(tt)) for (const t of dcm) if (!pinAt.has(`${t}|${i}|${pin}`)) { pinAt.set(`${t}|${i}|${pin}`, v); byRule++; }
    }
  }
  const bySlot = new Map();
  const index = (k, v) => { const j = k.lastIndexOf('|'), s = k.slice(0, j); if (!bySlot.has(s)) bySlot.set(s, []); bySlot.get(s).push([k.slice(j + 1), ...v]); };
  for (const [k, v] of pinAt) index(k, v);
  const types = {}, variant = new Map(), tiles = [];
  for (const t of grid.tiles) {
    const pips = tilePips(t.name);
    // (PINRULES: a VCC site's VCCOUT no design showed in the type, on the type's VCC wire)
    if (rules) for (const st of t.sites) {
      if (st.type !== 'VCC' || pinAt.has(`${t.type}|VCC|VCCOUT`)) continue;
      const vcc = vccWire(pips);
      if (vcc) { pinAt.set(`${t.type}|VCC|VCCOUT`, ['o', vcc]); index(`${t.type}|VCC|VCCOUT`, ['o', vcc]); byRule++; }
    }
    const sites = t.sites.map(st => ({ type: st.type, pins: [...(bySlot.get(`${t.type}|${st.slot}`) || [])].sort() }));
    if (!pips.size && !sites.some(s => s.pins.length)) continue;
    const list = [...pips].map(([f, fl]) => { const [a, b] = f.split('->'); return [a, b, fl]; }).sort((a, b) => (`${a[0]}>${a[1]}` < `${b[0]}>${b[1]}` ? -1 : 1));
    const sig = `${t.type}|${JSON.stringify(list)}|${JSON.stringify(sites)}`;
    if (!variant.has(sig)) {
      const key = `${t.type}#${variant.size}`;
      const wires = new Set();
      for (const [a, b] of list) { wires.add(a); wires.add(b); }
      for (const s of sites) for (const [, , w] of s.pins) wires.add(w);
      types[key] = { name: t.type, wires: [...wires].sort(), pips: list, sites };
      variant.set(sig, key);
    }
    tiles.push({ name: t.name, type: variant.get(sig), sites: t.sites.map(s => [s.name, s.bonded]), r: t.r, c: t.c });
  }
  // joins whose two ends are wires of the measured tiles
  const wiresOf = new Map(tiles.map(t => [t.name, new Set(types[t.type].wires)]));
  const has = k => { const i = k.indexOf('/'); return wiresOf.get(k.slice(0, i))?.has(k.slice(i + 1)); };
  const ord = ([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const all = [...new Map([...obs.joins, ...pinJoins, ...joins].filter(([a, b]) => has(a) && has(b)).map(j => [ord(j), j])).values()];
  return { part, family: 'spartan3e', rows: grid.rows, cols: grid.cols, types, tiles, joins: all, dropped: obs.joins.length + joins.length - all.length, byRule, joinsByRule, grid };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = k => { const i = args.indexOf(k); return i < 0 ? null : args.splice(i, 2)[1]; };
  const ft = opt('--ft'), probeFile = opt('--probe'), tests = opt('--tests'), clock = opt('--clock'), tilesFile = opt('--tiles');
  const [out, obsFile] = args;
  const DB = path.join(HERE, '../../bitdb');
  const joins = [
    ...(tests ? tests.split(',') : []).flatMap(d => readJson(path.join(d, 'verdicts.json')).filter(v => v[2] === 'join').map(v => [v[0], v[1]])),
    ...(clock ? clock.split(',') : []).flatMap(d => readJson(path.join(d, 'verdicts.json')).filter(v => v[2] === 'join').map(v => [v[0], v[1]])),
  ];
  const m = chipMeasurements({
    part: PART, tilesDb: readJson(path.join(DB, 's3e-tiles.json')),
    obs: readJson(obsFile), others: ft ? ft.split(',').map(readJson) : [], joins,
    probe: probeFile ? probeFile.split(',').map(f => readJson(f).pips).reduce((a, b) => ({ yes: [...a.yes, ...b.yes], no: [...a.no, ...b.no] })) : undefined,
    switchTiles: tilesFile ? fs.readFileSync(tilesFile, 'utf8').split(/\s+/).filter(Boolean) : [],
    rules: process.env.PINRULES === '1',
  });
  const packed = packMeasured(m);
  fs.writeFileSync(out, zlib.gzipSync(JSON.stringify(packed), { level: 9 }));
  console.log(`${m.tiles.length} tiles of ${Object.keys(m.types).length} type variants, ${m.joins.length} joins (${m.dropped} with an end not among the measured wires)${m.byRule ? `, ${m.byRule} pins by rule` : ''}${m.joinsByRule ? `, ${m.joinsByRule} pin joins by rule` : ''}: ${JSON.stringify(packed.counts)}`);
}
