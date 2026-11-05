// #2502, two descriptions of one die compared tile by tile (two Devices, loadDevice): what the grid and the sites
// measured (grid.mjs) change against the description built with the device report's (a: the reference, b: the other):
// the tiles, their rows, columns and types, their PIPs and wires, their nodes, their sites (name, type, bonding, pins).
//   node compare-grid.mjs a.json.gz b.json.gz
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const count = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };

/**
 * The differences of b from a: { tiles: { onlyA, onlyB, place, type }, pips: { onlyA, onlyB }, wires: { onlyA, onlyB },
 * nodes: the wires (in both) whose node does not hold the same wires, sites: { onlyA: { '<type>[ unbonded]': n }, onlyB,
 * changed: [text] }, pins: { onlyA: { '<site type>.<pin>': n }, onlyB, wire: [text] } } (counts, and the first texts).
 */
export function compareDevices(a, b) {
  const d = { tiles: { onlyA: [], onlyB: [], place: [], type: [] }, pips: { onlyA: 0, onlyB: 0 }, wires: { onlyA: 0, onlyB: 0 }, nodes: 0, sites: { onlyA: {}, onlyB: {}, changed: [] }, pins: { onlyA: {}, onlyB: {}, wire: [] } };
  if (a.rows !== b.rows || a.cols !== b.cols) d.grid = `${a.rows} x ${a.cols} / ${b.rows} x ${b.cols}`;
  const tp = (dev, k) => dev.templates[dev.tileTemplate[k]];
  // a node by the sorted names of its wires: computed once per device for the tiles in both
  const nodeNames = dev => {
    const byNode = new Map();
    for (let k = 0; k < dev.tileCount; k++) {
      const t = tp(dev, k);
      for (let i = 0; i < t.wires.length; i++) {
        const n = dev.nodeOf[dev.tileWireBase[k] + i];
        if (!byNode.has(n)) byNode.set(n, []);
        byNode.get(n).push(`${dev.tileNames[k]}/${dev.names[t.wires[i]]}`);
      }
    }
    const of = new Map();
    for (const l of byNode.values()) { const key = l.sort().join(' '); for (const w of l) of.set(w, key); }
    return of;
  };
  for (let k = 0; k < a.tileCount; k++) if (!b.tileIndex.has(a.tileNames[k])) d.tiles.onlyA.push(a.tileNames[k]);
  for (let k = 0; k < b.tileCount; k++) if (!a.tileIndex.has(b.tileNames[k])) d.tiles.onlyB.push(b.tileNames[k]);
  for (let ka = 0; ka < a.tileCount; ka++) {
    const name = a.tileNames[ka], kb = b.tileIndex.get(name);
    if (kb === undefined) continue;
    const ta = tp(a, ka), tb = tp(b, kb);
    if (a.tileRow[ka] !== b.tileRow[kb] || a.tileCol[ka] !== b.tileCol[kb]) d.tiles.place.push(name);
    if (ta.type !== tb.type) d.tiles.type.push(`${name}: ${ta.type} / ${tb.type}`);
    const pipSet = (dev, t) => { const s = new Set(); for (let i = 0; i < t.from.length; i++) s.add(`${dev.names[t.wires[t.from[i]]]}>${dev.names[t.wires[t.to[i]]]}>${t.flags[i]}`); return s; };
    const pa = pipSet(a, ta), pb = pipSet(b, tb);
    for (const p of pa) if (!pb.has(p)) d.pips.onlyA++;
    for (const p of pb) if (!pa.has(p)) d.pips.onlyB++;
    const wa = new Set([...ta.wires].map(w => a.names[w])), wb = new Set([...tb.wires].map(w => b.names[w]));
    for (const w of wa) if (!wb.has(w)) d.wires.onlyA++;
    for (const w of wb) if (!wa.has(w)) d.wires.onlyB++;
    // sites by name
    const sites = (dev, k, t) => new Map(dev.tileSites[k].map(([n, bonded], i) => [n, { type: t.sites[i].type, bonded, pins: t.sites[i].pins, i }]));
    const sa = sites(a, ka, ta), sb = sites(b, kb, tb);
    const label = s => `${s.type}${s.bonded === 2 ? ' unbonded' : ''}`;
    for (const [n, s] of sa) if (!sb.has(n)) count(d.sites.onlyA, label(s));
    for (const [n, s] of sb) if (!sa.has(n)) count(d.sites.onlyB, label(s));
    const order = [...sa.keys()].filter(n => sb.has(n)), orderB = [...sb.keys()].filter(n => sa.has(n));
    if (order.join() !== orderB.join()) d.sites.changed.push(`${name}: order ${order.join(' ')} / ${orderB.join(' ')}`);
    for (const [n, s] of sa) {
      const o = sb.get(n);
      if (!o) continue;
      if (s.type !== o.type || s.bonded !== o.bonded) d.sites.changed.push(`${n}: ${s.type} ${s.bonded} / ${o.type} ${o.bonded}`);
      for (const [pin, p] of s.pins) {
        const q = o.pins.get(pin);
        if (!q) count(d.pins.onlyA, `${s.type}.${pin}`);
        else if (a.names[ta.wires[p.wire]] !== b.names[tb.wires[q.wire]] || p.dir !== q.dir) d.pins.wire.push(`${n}.${pin}`);
      }
      for (const pin of o.pins.keys()) if (!s.pins.has(pin)) count(d.pins.onlyB, `${o.type}.${pin}`);
    }
  }
  const na = nodeNames(a), nb = nodeNames(b);
  const restrict = (key, other) => key.split(' ').filter(w => other.has(w)).join(' ');
  for (const [w, key] of na) if (nb.has(w) && restrict(key, nb) !== restrict(nb.get(w), na)) d.nodes++;
  return d;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { loadDevice } = await import('../../src/fpga/device.js');
  const [a, b] = process.argv.slice(2).map(f => loadDevice(JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString())));
  const d = compareDevices(a, b);
  for (const k of ['onlyA', 'onlyB', 'place', 'type']) d.tiles[k] = { n: d.tiles[k].length, first: d.tiles[k].slice(0, 5) };
  d.sites.changed = { n: d.sites.changed.length, first: d.sites.changed.slice(0, 5) };
  d.pins.wire = { n: d.pins.wire.length, first: d.pins.wire.slice(0, 5) };
  console.log(JSON.stringify(d, null, 1));
}
