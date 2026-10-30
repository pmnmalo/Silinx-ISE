// The schematic editor's selected wire segment (#2211, Select whole branch off): the wire stays the selection (its
// properties, its copy), the segment clicked is what is highlighted and what Delete removes. It holds while that
// selection does and the segment is still on the wire; otherwise the selection is the whole wire again.
import { segDist } from './sch-editor.js';

/** { pick, clear, current } (doc(), sel(): the editor's current ones). */
export function mountSchSegSel(ctx) {
  const { doc, sel } = ctx;
  let picked = null;   // { set (the selection it belongs to), id, a, b }
  const same = (p, q) => p.x === q.x && p.y === q.y;
  /** The segment of wire `id` nearest pt becomes the selected one; true when that changes it. */
  function pick(id, pt) {
    const w = doc().wires.find(x => x.id === id);
    if (!w) return clear();
    let i = 0, best = Infinity;
    for (let k = 0; k + 1 < w.points.length; k++) { const dd = segDist(pt, w.points[k], w.points[k + 1]); if (dd < best) { best = dd; i = k; } }
    const was = current();
    picked = { set: sel(), id, a: { ...w.points[i] }, b: { ...w.points[i + 1] } };
    return !was || was.id !== id || !same(was.a, picked.a) || !same(was.b, picked.b);
  }
  function clear() { const had = !!picked; picked = null; return had; }
  /** { id, a, b } of the selected segment, or null. */
  function current() {
    if (!picked || picked.set !== sel() || sel().size !== 1 || !sel().has(`wire:${picked.id}`)) return null;
    const P = doc().wires.find(x => x.id === picked.id)?.points;
    return P?.some((p, k) => k + 1 < P.length && same(p, picked.a) && same(P[k + 1], picked.b)) ? picked : null;
  }
  return { pick, clear, current };
}
