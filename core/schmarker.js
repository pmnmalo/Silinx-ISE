// A new I/O marker of a schematic (#2170): its direction (what it is placed on, or the marker added last), and the net
// of the same name it can join (that net's width).
import { parseNetName, netByName } from './schdoc.js';

const DIRS = ['in', 'out', 'inout'];

/** The direction of the I/O marker added last to `doc` (its highest P<n> id, else the last one listed), or 'in'. */
export function lastMarkerDir(doc) {
  let last = null, n = -1;
  for (const p of doc.ports || []) {
    const m = /^P(\d+)$/.exec(p.id);
    const k = m ? +m[1] : -1;
    if (k >= n) { n = k; last = p; }
  }
  return DIRS.includes(last?.dir) ? last.dir : 'in';
}

/** The direction of a new I/O marker of `doc`: on a symbol's pin, the pin's (an input, an output, a bidirectional);
 *  on a net, an output when the net is driven, else an input; placed unconnected, the marker added last's. */
export function newMarkerDir(doc, { pin = null, net = null } = {}) {
  if (pin) return pin.dir === 'out' ? 'out' : pin.dir === 'inout' ? 'inout' : 'in';
  if (net) return net.drivers.length ? 'out' : 'in';
  return lastMarkerDir(doc);
}

/** The net of `doc` (nl: netlist(doc)) named `name` other than `except` (the marker's own net) that a marker of that
 *  name joins: { net, name (as shown: count(7:0) for a bus), width (its whole bus's, from its net names) }, or null. */
export function markerJoin(doc, nl, name, except = null) {
  const net = netByName(doc, nl, name, except);
  if (!net) return null;
  const ci = doc.lang !== 'verilog';
  const nk = v => (ci ? String(v).toLowerCase() : String(v));
  let base = parseNetName(name).base, width = net.width || 1, named = false;
  for (const l of doc.labels || []) {
    const L = parseNetName(l.net);
    if (nk(L.base) !== nk(base)) continue;
    if (!named) { base = L.base; named = true; }   // (as the net is named: Count, typed count)
    if (L.msb != null) width = Math.max(width, Math.max(L.msb, L.lsb) + 1);
  }
  return { net, name: width > 1 ? `${base}(${width - 1}:0)` : base, width };
}

/** An I/O marker's width set (at least 1), its HDL type dropped when that was a single bit's (a bus's then derived). */
export function setMarkerWidth(p, w) {
  p.width = Math.max(1, Math.round(+w || 1));
  if (p.type && !/\(|\[/.test(p.type) && p.width > 1) delete p.type;
}
