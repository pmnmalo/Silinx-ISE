// A schematic's junction dots (#3806): the dots on some wires (drawn highlighted with them when they are selected), and a
// dot moved. The wires ending on the dot follow it: their end segment moved across as a dragged segment is (moveSegment,
// #688) and stretched along, a jog added instead where something else sits on that segment (another wire's end, a net
// name); a pin or an I/O marker under the dot stays where it is, joined to the dot by a wire of its own. The editor's drag
// and arrows (web/js/sch-junction.js) and the MCP's move_junction (server/mcp-schematic.js) do it through these functions.
//
// Isomorphic module (browser + Node).
import { GRID, netlist, netShort, normalizeDoc, onSeg, symbolPins } from './schdoc.js';
import { connectionsKept, connectivity, moveSegment } from './schroute.js';
import { cleanPath } from './schpath.js';
import { clone } from './util.js';

/** What the editor and the MCP say of a move that changed the connections, or that would short two named nets. */
export const CONNECTIONS_CHANGED = 'Connections changed by this move (a pin now touches another net, or a wire could not be routed). Undo with Ctrl+Z if not intended.';
export const shortText = (what, [a, b]) => `${what} would short net '${a}' and net '${b}': two named nets cannot be joined. Rename one of them first (the same name connects them).`;

const same = (p, q) => p.x === q.x && p.y === q.y;
const ends = w => [w.points[0], w.points[w.points.length - 1]];

/** The junction dots (junctions: a netlist's, [{ x, y }]) on the wires of `ids` (a Set): at an end of one or on it. */
export function junctionsOnWires(doc, junctions, ids) {
  const ws = doc.wires.filter(w => ids.has(w.id));
  return junctions.filter(j => ws.some(w => w.points.some((p, i) => same(p, j) || (i + 1 < w.points.length && onSeg(j, p, w.points[i + 1])))));
}

/** What meets at the junction dot at `at`: { wires: [{ id, a, b }] (the wires with their start a / end b there), pins:
 *  [{ x, y }] (the pins and I/O markers there) }, or null when there is no dot at `at`. */
export function junctionAt(doc, at, { modules = {} } = {}) {
  if (!netlist(doc, { modules }).junctions.some(j => same(j, at))) return null;
  const wires = [];
  for (const w of doc.wires) { const [p, q] = ends(w), a = same(p, at), b = same(q, at); if (a || b) wires.push({ id: w.id, a, b }); }
  const pins = [];
  for (const s of doc.symbols) for (const p of symbolPins(s, modules)) if (same(p, at)) pins.push({ x: p.x, y: p.y });
  for (const p of doc.ports) if (same(p, at)) pins.push({ x: p.x, y: p.y });
  return { wires, pins };
}

// a wire's points with its start, P[0], moved by (dx, dy); anchors: points that must stay on it
function follow(P, dx, dy, anchors) {
  if (!dx && !dy) return P.map(p => ({ ...p }));
  const a = P[0], b = P[1], T = { x: a.x + dx, y: a.y + dy };
  const hz = a.y === b.y && a.x !== b.x, vt = a.x === b.x && a.y !== b.y;
  // (a wire of no length, or slanted: an L from the dot to it)
  if (!hz && !vt) return cleanPath([T, { x: a.x, y: T.y }, ...P]);
  const across = hz ? dy : dx;
  if (!across) return cleanPath([T, ...P.slice(1)]);
  // something else on the end segment: it stays, a jog from the dot to the segment's end
  const pinned = anchors.some(q => onSeg(q, a, b) && !same(q, a) && !same(q, b));
  if (pinned) return cleanPath([T, hz ? { x: T.x, y: a.y } : { x: a.x, y: T.y }, ...P]);
  const Q = moveSegment(P, 0, across, { keepA: false, keepB: true });
  Q[0] = T;
  return cleanPath(Q);
}

/** The wires (doc0's, not changed) with the dot `j` (junctionAt's, at `at`) moved by (dx, dy): { wires, added } (the
 *  document's wires as they would be; added: the id of the wire joining a pin or a marker under the dot, or null). */
export function junctionWires(doc0, at, j, dx, dy) {
  const anchors = [];
  for (const w of doc0.wires) anchors.push(...ends(w));
  for (const l of doc0.labels) anchors.push({ x: l.x, y: l.y });
  const by = new Map(j.wires.map(e => [e.id, e]));
  const wires = doc0.wires.map(w => {
    const e = by.get(w.id);
    if (!e) return w;
    if (e.a && e.b) return { ...w, points: w.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };   // (a loop on the dot)
    const P = e.a ? w.points : [...w.points].reverse();
    const out = follow(P, dx, dy, anchors.filter(q => !same(q, at)));
    return { ...w, points: e.a ? out : out.reverse() };
  });
  let added = null;
  if (j.pins.length && (dx || dy)) {
    const used = new Set(wires.map(w => w.id));
    let k = wires.length + 1;
    while (used.has(`W${k}`)) k++;
    added = `W${k}`;
    const T = { x: at.x + dx, y: at.y + dy };
    wires.push({ id: added, points: cleanPath([{ ...at }, { x: T.x, y: at.y }, T]) });
  }
  return { wires, added };
}

/**
 * Moves the junction dot at `at` to `to` (on the grid); doc is not changed. Throws an Error when there is no dot at `at`
 * or `to` is off the grid. Returns { doc (the document after the move, normalized), short ([x, y]: the two nets the move
 * would join, the move not done: doc as it was) or null, kept (false: the connections changed by the move) }.
 */
export function moveJunction(doc, at, to, { modules = {} } = {}) {
  const pt = q => `(${q.x}, ${q.y})`;
  if (![to.x, to.y].every(v => Number.isFinite(v) && v % GRID === 0)) throw new Error(`${pt(to)} is not on the grid (every ${GRID})`);
  const j = junctionAt(doc, at, { modules });
  if (!j) throw new Error(`no junction dot at ${pt(at)}`);
  const before = clone(doc);
  let conn0 = null;
  try { conn0 = connectivity(doc, modules); } catch { /* checked only when available */ }
  const after = normalizeDoc({ ...before, wires: junctionWires(before, at, j, to.x - at.x, to.y - at.y).wires }, { modules });
  const short = netShort(before, after, { modules });
  if (short) return { doc: normalizeDoc(before, { modules }), short, kept: true };
  let kept = true;
  if (conn0) { try { kept = connectionsKept(conn0, connectivity(after, modules)); } catch { /* ignore */ } }
  return { doc: after, short: null, kept };
}
