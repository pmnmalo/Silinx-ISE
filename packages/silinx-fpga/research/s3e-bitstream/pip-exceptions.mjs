// The routing switches (PIPs) a tile type's features offer that some or all of its tiles do not have
// (#74). The database's PIP features are per tile type, and some types share another's switch box
// (sameAs: the I/O, corner, block-RAM interconnect and DCM tiles have the CLB's; the break rows' CLB
// type has the CLB's features): not every tile of a type has every one of them. The clock-row CLBs
// (CENTER_SMALL_BRK) have no GCLKk (their clock lines are GCLKk_BRK); the top CLB row has no FX_Sk /
// COUT_Nk (nothing above); the I/O tiles at the edges have only part of the CLB's switch box.
//
// Measured on ISE's device description of each device (packages/silinx-fpga/devices, built from `xdl -report
// -pips -all_conns`: every PIP of every tile, as xdl -xdl2ncd accepts or refuses them; the census of
// research/s3e-device found the two in agreement on 1.74 million PIPs), and checked on ISE itself
// with the arc probe (research/s3e-device/probe-run.mjs: every exception is refused, `--probe`).
// A feature "a->b" (the type's wire names: an I/O tile's own wires renamed as by its type's `rename`)
// is missing in a tile when no wire of the tile has the name a or b (the whole wire is missing: the
// entry is the wire's name), else when the tile has no PIP between them. What every tile of the type
// misses, on every device, goes to the type in packages/silinx-fpga/bitdb/s3e-tiles.json (`absent`); what one device's tiles
// of the type all miss besides, to the type in packages/silinx-fpga/bitdb/<device>-tiles.json (`absent`); what only some tiles
// miss, there too, by tile (`absentIn: [{ tiles, absent }]`). The router honours them
// (packages/silinx-fpga/src/fpga/bitgen.js knownRouting); a device description built from the database needs them too.
// Only the features the router may use are considered (knownRouting before the exceptions); the
// types whose PIPs set no bits (pipsWithoutBits: the terminal tiles) have no list of features.
//
//   node pip-exceptions.mjs [--check] [part …]      (default: the four devices of the database)
//   node pip-exceptions.mjs --probe out [part …]   the arc probe's candidates (research/s3e-device/
//        probe-run.mjs), out-<device>-no.json / -yes.json: what ISE must refuse / accept
//   node pip-exceptions.mjs --graph dir [part …]    dir/devices/<part>.json.gz: the device description
//        with the exceptions between two wires of a tile added as PIPs, as a description built from
//        the database's features per type would have them (SILINX_CONFIG_DIR=dir: the open flow
//        routes on it; the router must not take them)
import fs from 'node:fs';
import { loadDb, DB_DIR, splitPart } from './db.mjs';
import { loadDeviceCache } from '../../src/fpga/device-node.js';
import { tileOf, knownRouting } from '../../src/fpga/bitgen.js';
import { PIP_ROUTETHRU, toBase64, fromBase64 } from '../../src/fpga/device.js';
import zlib from 'node:zlib';
import path from 'node:path';
import { findDeviceGraph } from '../../src/fpga/device-node.js';

export const PARTS = ['xc3s100ecp132-4', 'xc3s250ecp132-4', 'xc3s500efg320-4', 'xc3s1200efg320-4'];

const pipOf = f => /^(\S+)->(\S+)$/.exec(f);

/** The wires of tile k by their names in the features of its type ty (makeDb's): Map(name ->
 *  [the tile's wire names]) (an I/O tile's wire by its own name and renamed: IOIS_X0 and X0). */
export function tileWires(dev, k, ty) {
  const byName = new Map();
  for (const w of dev.templates[dev.tileTemplate[k]].local.keys()) {
    let r = w;
    for (const [re, to] of ty.rename || []) r = r.replace(re, to);
    for (const n of new Set([w, r])) (byName.get(n) || byName.set(n, []).get(n)).push(w);
  }
  return byName;
}

/**
 * The exceptions of one device: { types: { TYPE: { tiles: [names], absent: Map(tile -> Set(entries)) } } }
 * (db: loadDb's database without the exceptions; dev: the device description).
 */
export function deviceExceptions(db, dev) {
  const known = knownRouting(db, { exceptions: false });
  const types = {};
  const offered = new Map();   // type -> { feats: [[f, a, b]], wires: Set }
  for (let k = 0; k < dev.tileCount; k++) {
    const name = dev.tileNames[k];
    const t = tileOf(name, db);
    const ty = t && db.types[t.type];
    if (!ty || ty.pipsWithoutBits) continue;
    let o = offered.get(t.type);
    if (!o) {
      o = { feats: [], wires: new Set() };
      for (const f of ty.feats.keys()) {
        const m = pipOf(f);
        if (!m || !known.allowPip(name, m[1], m[2])) continue;
        o.feats.push([f, m[1], m[2]]); o.wires.add(m[1]); o.wires.add(m[2]);
      }
      offered.set(t.type, o);
    }
    if (!o.feats.length) continue;
    const byName = tileWires(dev, k, ty);
    const absent = new Set([...o.wires].filter(w => !byName.has(w)));
    for (const [f, a, b] of o.feats) {
      if (absent.has(a) || absent.has(b)) continue;
      if (!byName.get(a).some(x => byName.get(b).some(y => dev.findPip(k, x, y) >= 0))) absent.add(f);
    }
    const e = (types[t.type] ||= { tiles: [], absent: new Map() });
    e.tiles.push(name);
    e.absent.set(name, absent);
  }
  return { types };
}

const inter = sets => { const [s0, ...rest] = sets; return new Set([...(s0 || [])].filter(x => rest.every(s => s.has(x)))); };
const sortEntries = s => [...s].sort((a, b) => (a.includes('->') - b.includes('->')) || a.localeCompare(b));

/**
 * The exceptions of several devices ({ part: deviceExceptions }) as the database keeps them:
 * { shared: { TYPE: [entries] }, own: { device: { TYPE: { absent?, absentIn? } } } }.
 */
export function exceptionTables(byPart) {
  const typeLevel = {};   // type -> { device -> Set }
  for (const [part, ex] of Object.entries(byPart)) {
    const { device } = splitPart(part);
    for (const [type, e] of Object.entries(ex.types)) (typeLevel[type] ||= {})[device] = inter([...e.absent.values()]);
  }
  const shared = {}, own = {};
  for (const [type, perDev] of Object.entries(typeLevel)) {
    const all = inter(Object.values(perDev));
    if (all.size) shared[type] = sortEntries(all);
    for (const [part, ex] of Object.entries(byPart)) {
      const { device } = splitPart(part);
      const e = ex.types[type];
      if (!e) continue;
      const devAll = perDev[device];
      const out = {};
      const extra = [...devAll].filter(x => !all.has(x));
      if (extra.length) out.absent = sortEntries(extra);
      // the tiles that miss more than the type: grouped by what they miss
      const groups = new Map();
      for (const tile of e.tiles) {
        const rest = sortEntries([...e.absent.get(tile)].filter(x => !devAll.has(x)));
        if (!rest.length) continue;
        const key = rest.join(' ');
        (groups.get(key) || groups.set(key, { tiles: [], absent: rest }).get(key)).tiles.push(tile);
      }
      if (groups.size) out.absentIn = [...groups.values()].sort((a, b) => a.tiles[0].localeCompare(b.tiles[0]));
      if (Object.keys(out).length) ((own[device] ||= {})[type] = out);
    }
  }
  return { shared, own };
}

/** The packed description `packed` (device.js) with the PIPs a tile lacks between two of its wires
 *  (the exceptions that are not whole wires) added to its template: { packed, added }. */
export function withExceptionPips(packed, db, dev, ex) {
  const tables = exceptionTables({ [packed.part]: ex });
  const own = tables.own[splitPart(packed.part).device] || {};
  const templates = packed.templates.map(tp => ({ ...tp }));
  const done = new Set();
  let added = 0;
  for (let k = 0; k < dev.tileCount; k++) {
    const t = dev.tileTemplate[k];
    if (done.has(t)) continue;
    done.add(t);
    const tt = tileOf(dev.tileNames[k], db), ty = tt && db.types[tt.type];
    if (!ty) continue;
    const entries = [...(tables.shared[tt.type] || []), ...(own[tt.type]?.absent || []), ...(own[tt.type]?.absentIn || []).filter(g => g.tiles.includes(dev.tileNames[k])).flatMap(g => g.absent)];
    const byName = tileWires(dev, k, ty), local = dev.templates[t].local;
    const raw = fromBase64(templates[t].pips);
    const quads = [...new Uint16Array(raw.buffer, raw.byteOffset, raw.length >> 1)];
    for (const x of entries) {
      const m = pipOf(x);
      const a = m && byName.get(m[1])?.[0], b = m && byName.get(m[2])?.[0];
      if (!a || !b) continue;
      quads.push(local.get(a), local.get(b), 0, 0);
      added++;
    }
    templates[t].pips = toBase64(new Uint8Array(Uint16Array.from(quads).buffer));
  }
  return { packed: { ...packed, templates }, added };
}

const ser = o => JSON.stringify(o, null, 0).replace(/("[^"]+":\[[^\]]*\]),/g, '$1,\n');

if (process.argv[1] && process.argv[1].endsWith('pip-exceptions.mjs')) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const probeAt = args.indexOf('--probe');
  const probeOut = probeAt >= 0 ? args[probeAt + 1] : null;
  const parts = args.filter((a, i) => !a.startsWith('--') && !['--probe', '--graph'].includes(args[i - 1]));
  const byPart = {};
  for (const part of parts.length ? parts : PARTS) {
    const dev = loadDeviceCache(part);
    const ex = deviceExceptions(loadDb(part, { graph: dev }), dev);
    byPart[part] = ex;
    let n = 0;
    for (const e of Object.values(ex.types)) for (const s of e.absent.values()) n += s.size;
    console.log(`${part}: ${Object.keys(ex.types).length} tile types, ${n} exceptions (tile x feature or wire)`);
  }
  const graphAt = args.indexOf('--graph');
  if (graphAt >= 0) {
    for (const [part, ex] of Object.entries(byPart)) {
      const f = findDeviceGraph(part);
      const packed = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'));
      const dev = loadDeviceCache(part);
      const r = withExceptionPips(packed, loadDb(part, { graph: dev }), dev, ex);
      const out = path.join(args[graphAt + 1], 'devices', `${part}.json.gz`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, zlib.gzipSync(JSON.stringify(r.packed)));
      console.log(`${part}: ${r.added} PIPs added to the templates: ${out}`);
    }
  } else if (probeOut) {
    // the arc probe's candidates, per device, in the tiles' own wire names: <out>-<device>-no.json
    // (the exceptions, which ISE must refuse: every per-tile one; a type's in one tile of the type, on
    // the first device that has it; a PIP between two wires of the tile, or a wire the tile does not
    // have, asked with a feature of the type into or out of it) and <out>-<device>-yes.json (every
    // PIP of the description the router may use, in that tile of each type: ISE must accept them)
    const asked = new Set();
    for (const [part, ex] of Object.entries(byPart)) {
      const { device } = splitPart(part);
      const dev = loadDeviceCache(part);
      const db = loadDb(part, { graph: dev });
      const known = knownRouting(db, { exceptions: false });
      const tables = exceptionTables({ [part]: ex });
      const no = [], yes = [];
      for (const [type, e] of Object.entries(ex.types)) {
        const ty = db.types[type];
        const feats = [...ty.feats.keys()].map(pipOf).filter(Boolean);
        const ask = (tile, x) => {
          const k = dev.tile(tile), byName = tileWires(dev, k, ty);
          const m = pipOf(x) || feats.find(f => f[1] === x || f[2] === x);
          if (!m) return;
          // a wire the tile has: by its own name
          no.push({ tile, from: byName.get(m[1])?.[0] || m[1], to: byName.get(m[2])?.[0] || m[2] });
        };
        if (!asked.has(type)) for (const x of tables.shared[type] || []) ask(e.tiles[0], x);
        asked.add(type);
        for (const g of tables.own[device]?.[type]?.absentIn || []) for (const t of g.tiles) for (const x of g.absent) ask(t, x);
        const k = dev.tile(e.tiles[0]), tp = dev.templates[dev.tileTemplate[k]];
        for (let i = 0; i < tp.from.length; i++) {
          if (tp.flags[i] & PIP_ROUTETHRU) continue;
          const [a, b] = dev.pipWires(k, i);
          if (known.allowPip(e.tiles[0], a, b)) yes.push({ tile: e.tiles[0], from: a, to: b });
        }
      }
      for (const [k, pips] of [['no', no], ['yes', yes]]) fs.writeFileSync(`${probeOut}-${device}-${k}.json`, JSON.stringify({ part, pips }));
      console.log(`${part}: ${no.length} exceptions and ${yes.length} PIPs the router may use to ask: ${probeOut}-${device}-{no,yes}.json`);
    }
  } else {
    const { shared, own } = exceptionTables(byPart);
    const sharedFile = `${DB_DIR}/s3e-tiles.json`;
    const tiles = JSON.parse(fs.readFileSync(sharedFile, 'utf8'));
    let changed = 0;
    for (const [type, t] of Object.entries(tiles.types)) {
      const want = shared[type];
      if (JSON.stringify(t.absent) !== JSON.stringify(want)) changed++;
      if (want) t.absent = want; else delete t.absent;
    }
    for (const type of Object.keys(shared)) if (!tiles.types[type]) throw new Error(`${type}: not a type of s3e-tiles.json`);
    const outs = [[sharedFile, tiles]];
    for (const part of Object.keys(byPart)) {
      const { device } = splitPart(part);
      const f = `${DB_DIR}/${device}-tiles.json`;
      const cur = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {
        device,
        source: 'research/s3e-bitstream/pip-exceptions.mjs (#74): the PIPs of the shared tile types that this device\'s tiles do not have, from ISE\'s device description (xdl -report -pips -all_conns, ISE 14.7 xdl P.20131013), checked with the arc probe (xdl -xdl2ncd); 2026-10-13',
        note: 'Added to the shared tile types of db/s3e-tiles.json (db.mjs mergeTiles). absent: the PIP features ("from->to") and the wires (every PIP into or out of it) that none of the type\'s tiles have, besides the shared absent; absentIn: [{ tiles, absent }] what only these tiles of the type do not have (core/fpga/bitgen.js knownRouting).',
        types: {},
      };
      for (const [type, t] of Object.entries(cur.types)) {
        const want = own[device]?.[type] || {};
        for (const k of ['absent', 'absentIn']) {
          if (JSON.stringify(t[k]) !== JSON.stringify(want[k])) changed++;
          if (want[k]) t[k] = want[k]; else delete t[k];
        }
        if (!Object.keys(t).length) delete cur.types[type];
      }
      for (const [type, want] of Object.entries(own[device] || {})) if (!cur.types[type]) { cur.types[type] = { features: {}, ...want }; changed++; }
      if (Object.keys(cur.types).length) outs.push([f, cur]);
      else if (fs.existsSync(f)) { changed++; if (!check) fs.rmSync(f); }
    }
    console.log(`${changed} lists ${check ? 'differ from the database' : 'changed'}`);
    if (!check) for (const [f, o] of outs) fs.writeFileSync(f, ser(o));
    if (check && changed) process.exitCode = 1;
  }
}
