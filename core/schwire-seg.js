// A straight segment of a schematic wire (#2211): Delete with Select whole branch off removes that segment alone, what
// is left on each side staying as a wire. The whole network of wires of a signal (#2228): what Select whole branch selects.

/** The ids of the wires on the net of wire `id`, across junctions and net names, `id` first; nl: its netlist (null: `id` alone). */
export function netWireIds(nl, id) {
  const net = nl?.wireNet.get(id);
  return [id, ...(net ? [...nl.wireNet].filter(([w, n]) => n === net && w !== id).map(([w]) => w) : [])];
}

/** The wire `id` without its segment a-b ({x,y} points): the two sides kept, each with a segment at least; false when there is no such segment. */
export function deleteWireSegment(doc, id, a, b) {
  const at = doc.wires.findIndex(w => w.id === id);
  if (at < 0) return false;
  const w = doc.wires[at], P = w.points, same = (p, q) => p.x === q.x && p.y === q.y;
  const i = P.findIndex((p, k) => k + 1 < P.length && same(p, a) && same(P[k + 1], b));
  if (i < 0) return false;
  const used = new Set(doc.wires.map(x => x.id));
  const nid = () => { let k = doc.wires.length + 1; while (used.has(`W${k}`)) k++; used.add(`W${k}`); return `W${k}`; };
  const { curve: _curve, ...plain } = w;
  const sides = [P.slice(0, i + 1), P.slice(i + 1)].filter(s => s.length >= 2);
  doc.wires.splice(at, 1, ...sides.map((points, k) => ({ ...plain, id: k ? nid() : id, points })));
  return true;
}
