// The routing graph of the device, from ISE's full device report:
//   xdl -report -pips -all_conns xc3s250ecp132-4 dev-full.xdlrc      (about 200 MB; never committed)
// Every tile, its sites and their pin wires, every wire with its connections to other tiles, and
// every routing switch (PIP). The parsed graph is cached next to the report (dev-full.cache) so the
// experiments can load it in a second.
//
//   const g = loadGraph('/path/dev-full.xdlrc');
//   g.tiles[t] = { name, type, r, c, sites: [{ name, type, pins: { pin: wire } }] }
//   g.node(t, wire) -> the electrical node of a wire of tile t (wires joined by conns share a node)
//   g.pips[t] = [[from, to, bidir, routeThrough], …] (wire names of tile t)
import fs from 'node:fs';
import v8 from 'node:v8';
import { loadDeviceCache } from '../../packages/silinx-fpga/src/fpga/device-node.js';

const W = 1 << 16;   // wire name ids per tile in a wire key (key = tile * W + name id)

function parse(file) {
  const names = [], nameId = new Map();
  const nid = s => { let i = nameId.get(s); if (i === undefined) { i = names.length; names.push(s); nameId.set(s, i); } return i; };
  const tiles = [], tileByName = new Map();
  const parent = new Map();   // union-find over wire keys
  const find = k => { let r = k; for (let p; (p = parent.get(r)) !== undefined && p !== r;) r = p; let x = k; for (let p; (p = parent.get(x)) !== undefined && p !== r;) { parent.set(x, r); x = p; } return r; };
  const conns = [];   // [keyA, tileNameB, wireB] resolved after all tiles are known
  const pips = [];
  let t = -1, site = null, wireKey = null;
  const text = fs.readFileSync(file, 'utf8');
  let pos = 0;
  while (pos < text.length) {
    let end = text.indexOf('\n', pos); if (end < 0) end = text.length;
    const s = text.slice(pos, end).trim(); pos = end + 1;
    if (s.length < 3 || s[0] !== '(') continue;
    const sp = s.indexOf(' ');
    const kw = s.slice(1, sp);
    if (kw === 'pip') {
      const m = /^\(pip (\S+) (\S+) (->|=-|==|=>) (\S+?)(?:\s+\((\S+) (\S+)\))?\)$/.exec(s);
      if (m) pips.push([t, nid(m[2]), nid(m[4]), m[3] === '=-' || m[3] === '==' ? 1 : 0, m[5] ? `${m[5]} ${m[6]}` : null]);
    } else if (kw === 'conn') {
      const m = /^\(conn (\S+) (\S+)\)$/.exec(s);
      if (m && wireKey !== null) conns.push([wireKey, m[1], nid(m[2])]);
    } else if (kw === 'wire') {
      const m = /^\(wire (\S+) /.exec(s);
      wireKey = t * W + nid(m[1]);
    } else if (kw === 'pinwire') {
      const m = /^\(pinwire (\S+) (\S+) (\S+)\)$/.exec(s);
      if (m && site) site.pins[m[1]] = { dir: m[2], wire: m[3] };
    } else if (kw === 'primitive_site') {
      const m = /^\(primitive_site (\S+) (\S+) (\S+)/.exec(s);
      site = { name: m[1], type: m[2], bonded: m[3], pins: {} };
      tiles[t].sites.push(site);
    } else if (kw === 'tile') {
      const m = /^\(tile (\d+) (\d+) (\S+) (\S+)/.exec(s);
      t = tiles.length;
      tiles.push({ r: +m[1], c: +m[2], name: m[3], type: m[4], sites: [] });
      tileByName.set(m[3], t);
      site = null; wireKey = null;
    } else if (kw === 'primitive_defs') break;
  }
  if (names.length >= W) throw new Error('too many wire names');
  for (const [k, tn, w] of conns) {
    const tb = tileByName.get(tn);
    if (tb === undefined) continue;
    const a = find(k), b = find(tb * W + w);
    if (a !== b) parent.set(Math.max(a, b), Math.min(a, b));
  }
  // flatten: node id of every wire key that has connections; other wires are their own node
  const keys = [], roots = [];
  for (const k of parent.keys()) { keys.push(k); roots.push(find(k)); }
  const pipT = new Int32Array(pips.length), pipA = new Int32Array(pips.length), pipB = new Int32Array(pips.length), pipBi = new Uint8Array(pips.length);
  const rt = {};
  pips.forEach((p, i) => { pipT[i] = p[0]; pipA[i] = p[1]; pipB[i] = p[2]; pipBi[i] = p[3]; if (p[4]) rt[i] = p[4]; });
  return { names, tiles, keys: Float64Array.from(keys), roots: Float64Array.from(roots), pipT, pipA, pipB, pipBi, rt };
}

/** The same graph from Silinx's device description (packages/silinx-fpga/src/fpga/device.js; a part such as
 *  'xc3s500efg320-4', or a .json.gz file): the reports of the larger devices are too large to read
 *  as one string, and the description has everything the experiments use. A node is numbered as
 *  tile * W + name of one of its wires, so Math.floor(node / W) is a tile of the node. */
export function graphFromDevice(d) {
  const names = d.names, nameId = new Map(names.map((s, i) => [s, i]));
  const tiles = [], tileByName = new Map();
  for (let k = 0; k < d.tileCount; k++) {
    const tp = d.templates[d.tileTemplate[k]];
    const sites = d.tileSites[k].map(([name, bonded], i) => ({
      name, type: tp.sites[i].type, bonded: ['internal', 'bonded', 'unbonded'][bonded] || 'internal',
      pins: Object.fromEntries([...tp.sites[i].pins].map(([pin, p]) => [pin, { dir: p.dir === 'o' ? 'output' : 'input', wire: names[tp.wires[p.wire]] }])),
    }));
    tiles.push({ r: d.tileRow[k], c: d.tileCol[k], name: d.tileNames[k], type: tp.type, sites });
    tileByName.set(d.tileNames[k], k);
  }
  // the key of every wire's node: the key (tile * W + name) of the node's first wire
  const keyOfWire = w => { const k = d.wireTile[w]; return k * W + d.templates[d.tileTemplate[k]].wires[w - d.tileWireBase[k]]; };
  const nodeKey = new Float64Array(d.nodeCount);
  for (let n = 0; n < d.nodeCount; n++) nodeKey[n] = keyOfWire(d.nodeWires[d.nodeStart[n]]);
  const node = (t, w) => {
    const id = typeof w === 'number' ? w : nameId.get(w);
    const l = d.templates[d.tileTemplate[t]].local.get(names[id]);
    return l === undefined ? t * W + id : nodeKey[d.nodeOf[d.tileWireBase[t] + l]];
  };
  const P = d.pipCount;
  const pipT = new Int32Array(P), pipA = new Int32Array(P), pipB = new Int32Array(P), pipBi = new Uint8Array(P), rt = {};
  const pipsOf = [];
  let i = 0;
  for (let k = 0; k < d.tileCount; k++) {
    const tp = d.templates[d.tileTemplate[k]];
    const list = pipsOf[k] = [];
    for (let j = 0; j < tp.from.length; j++, i++) {
      pipT[i] = k; pipA[i] = tp.wires[tp.from[j]]; pipB[i] = tp.wires[tp.to[j]]; pipBi[i] = tp.flags[j] & 1;
      if (tp.rt[j] >= 0) rt[i] = d.routethrus[tp.rt[j]];
      list.push(i);
    }
  }
  return {
    names, nameId, tiles, tileByName, node, W,
    pipCount: P,
    pip: q => ({ t: pipT[q], from: names[pipA[q]], to: names[pipB[q]], bidir: !!pipBi[q], rt: rt[q] || null }),
    pipT, pipA, pipB, pipBi, rt, pipsOf: t => pipsOf[t] || [],
    members(n) {
      const t = Math.floor(n / W), l = d.templates[d.tileTemplate[t]].local.get(names[n % W]);
      if (l === undefined) return [[t, names[n % W]]];
      return Array.from(d.nodeWireIds(d.nodeOf[d.tileWireBase[t] + l]), w => { const x = d.wireInfo(w); return [tileByName.get(x.tile), x.name]; });
    },
  };
}

/** The device graph: of a device report (parsed once, then cached as dev-full.cache next to it), or
 *  of a part's device description (graphFromDevice). */
export function loadGraph(file) {
  if (!/\.xdlrc$/.test(file)) return graphFromDevice(loadDeviceCache(file));
  const cache = file.replace(/\.xdlrc$/, '') + '.cache';
  let raw;
  if (fs.existsSync(cache) && fs.statSync(cache).mtimeMs > fs.statSync(file).mtimeMs) raw = v8.deserialize(fs.readFileSync(cache));
  else { raw = parse(file); fs.writeFileSync(cache, v8.serialize(raw)); }
  const { names, tiles, keys, roots, pipT, pipA, pipB, pipBi, rt } = raw;
  const nameId = new Map(names.map((s, i) => [s, i]));
  const rootOf = new Map();
  for (let i = 0; i < keys.length; i++) rootOf.set(keys[i], roots[i]);
  const tileByName = new Map(tiles.map((x, i) => [x.name, i]));
  const key = (t, w) => t * W + (typeof w === 'number' ? w : nameId.get(w));
  /** The node of wire w of tile t: a number shared by every wire joined to it. */
  const node = (t, w) => { const k = key(t, w); const r = rootOf.get(k); return r === undefined ? k : r; };
  const pipsOf = [];
  for (let i = 0; i < pipT.length; i++) (pipsOf[pipT[i]] ||= []).push(i);
  return {
    names, nameId, tiles, tileByName, node, W,
    pipCount: pipT.length,
    /** pip i: { t, from, to, bidir, rt } */
    pip: i => ({ t: pipT[i], from: names[pipA[i]], to: names[pipB[i]], bidir: !!pipBi[i], rt: rt[i] || null }),
    pipT, pipA, pipB, pipBi, rt, pipsOf: t => pipsOf[t] || [],
    /** every (tile, wire) of a node */
    members(n) {
      const out = [];
      for (let i = 0; i < keys.length; i++) if (roots[i] === n) out.push([Math.floor(keys[i] / W), names[keys[i] % W]]);
      if (!out.length) out.push([Math.floor(n / W), names[n % W]]);
      return out;
    },
  };
}

if (process.argv[1] && process.argv[1].endsWith('xdlrc-graph.mjs')) {
  const t0 = Date.now();
  const g = loadGraph(process.argv[2]);
  console.log(`${g.tiles.length} tiles, ${g.names.length} wire names, ${g.pipCount} pips, ${Date.now() - t0} ms`);
}
