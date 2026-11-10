// Silinx toolchain - what Silinx gives nextpnr's Spartan-6 chip database (#2138; the generator: the fork's s6_gen.py):
// the PIPs to leave out and the delay model.
import { knownPipS6 } from './bitgen.js';
import { PIP_ROUTETHRU } from '../device.js';
import { CLASSES6, PIN_KINDS, nodeWire, pinKind, wireClass6, wireType } from './timing.js';
import { S6_SPEED_3 } from './timing-model.js';

/**
 * The PIPs nextpnr must not use: those whose bits the bit database does not know, as Silinx's own router is first kept
 * off them. Per tile name: the indices of its template's PIPs (the device graph's order). Returns { pips, total, unknown }.
 */
export function unknownPipsS6(device, db) {
  const allow = knownPipS6(device, db);
  const pips = {};
  let total = 0, unknown = 0;
  for (let k = 0; k < device.tileCount; k++) {
    const tp = device.templates[device.tileTemplate[k]], bad = [];
    for (let i = 0; i < tp.from.length; i++) {
      total++;
      if (!allow(k, i)) bad.push(i);
    }
    if (bad.length) pips[device.tileName(k)] = bad;
    unknown += bad.length;
  }
  return { pips, total, unknown };
}

/**
 * The delay model for the chip database, as Silinx's timing analysis counts a routed connection (fpga/s6/timing.js
 * wireDelay): each node after the driver's its class's and its wire type's delay, the load's node (a site's input pin
 * that no switch leaves but a slice's route-through: a path's last) also the model's base and its pin kind's (not below
 * 0; the fanout's term, 2 ps a load, left out). nextpnr adds a node's delay to the PIP that drives it (the generator's
 * node classes, #3137), so a path's delay is the sum of its nodes', as Silinx's.
 * Returns { wire: [ns by class], pipClass: { template: [class by PIP] } (each PIP the class of the wire it drives: the
 * database before #3137), nodeClass: [ps by node class], node: [node class by node of several wires, the device graph's
 * order], tileWire: { template: [node class by wire, of the single-wire nodes] } }.
 */
export function timingExportS6(device, model = S6_SPEED_3) {
  const w = model.wires;
  const wire = CLASSES6.map(c => w.classes[c] ?? 0);
  const pipClass = {};
  device.templates.forEach((tp, t) => { pipClass[t] = Array.from(tp.to, x => wireClass6(device.names[tp.wires[x]])); });
  // the loads' nodes: those of a site's input pin that no switch leaves but a route-through of a slice (its LUT's: a
  // clock's BUFH input, an I/O logic's, go on)
  const load = new Uint8Array(device.nodeCount);
  for (let k = 0; k < device.tileCount; k++) {
    const tp = device.templates[device.tileTemplate[k]];
    for (const s of tp.sites) for (const p of s.pins.values()) if (p.dir === 'i') load[device.nodeOf[device.tileWireBase[k] + p.wire]] = 1;
  }
  for (let n = 0; n < device.nodeCount; n++) if (load[n]) device.forEachPip(n, (to, k, i, flags) => { if (!(flags & PIP_ROUTETHRU) || !/ SLICE[LMX]$/.test(device.pip(k, i).routethru)) load[n] = 0; });
  const nodeClass = [], classOf = new Map();
  const classOfPs = ps => { let c = classOf.get(ps); if (c === undefined) { c = nodeClass.length; nodeClass.push(ps); classOf.set(ps, c); } return c; };
  const delayOf = (name, isLoad) => {
    let d = (w.classes[CLASSES6[wireClass6(name)]] ?? 0) + (w.types[wireType(name)] ?? w.other);
    if (isLoad) d += w.base + (w.pins[PIN_KINDS[pinKind(name)]] ?? 0);
    return classOfPs(Math.max(0, Math.round(1000 * d)));
  };
  const node = [], tileWire = {};
  for (let n = 0; n < device.nodeCount && device.nodeStart[n + 1] - device.nodeStart[n] > 1; n++) node.push(delayOf(nodeWire(device, n)[1], load[n]));
  // (a single-wire node's delay is its template's: the same wire, a load in every tile of it or in none)
  for (let k = 0; k < device.tileCount; k++) {
    const t = device.tileTemplate[k];
    if (tileWire[t]) continue;
    const tp = device.templates[t], b = device.tileWireBase[k];
    tileWire[t] = Array.from(tp.wires, (x, l) => delayOf(device.names[x], load[device.nodeOf[b + l]]));
  }
  return { wire, pipClass, nodeClass, node, tileWire };
}
