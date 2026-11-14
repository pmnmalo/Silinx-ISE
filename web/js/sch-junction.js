// The schematic editor's junction dots (#3806): drawn highlighted with the selected wires they are on, and selected by a
// click; a selected dot dragged (the mouse, a finger, a pen) or moved by the arrows, the wires ending on it following,
// orthogonal, on the grid (core/schjunction.js, as the MCP's move_junction); the connections the same, one Undo step.
import { CONNECTIONS_CHANGED, junctionAt, junctionWires, junctionsOnWires, moveJunction } from '/core/schjunction.js';
import { esc } from './dom.js';
import { snap } from './sch-editor.js';

const ptOf = id => { const [x, y] = String(id).split(',').map(Number); return { x, y }; };

/** { svg, begin, move, end, cancel, nudge } (doc(), modules(), sel(): the editor's current ones). */
export function mountSchJunction(ctx) {
  const { doc, setDoc, modules, sel, setSel, snapshot, pushUndo, changed, render, renderProps, flash, shortNote } = ctx;
  let frame = 0;
  /** The junction dots of the netlist nl: highlighted when selected or on a selected wire. */
  function svg(nl) {
    if (!nl) return '';
    const wires = new Set([...sel()].filter(k => k.startsWith('wire:')).map(k => k.slice(5)));
    const on = new Set(junctionsOnWires(doc(), nl.junctions, wires).map(j => `${j.x},${j.y}`));
    return nl.junctions.map(j => {
      const id = `${j.x},${j.y}`, hl = on.has(id) || sel().has(`junction:${id}`);
      return `<g class="jdot${hl ? ' sel' : ''}" data-kind="junction" data-id="${esc(id)}"><circle class="jhit" cx="${j.x}" cy="${j.y}" r="7"/><circle class="junction" cx="${j.x}" cy="${j.y}" r="3.2"/></g>`;
    }).join('');
  }
  /** A drag of the dot `id` ("x,y") from pt (null: no dot there). */
  function begin(id, pt) {
    const at = ptOf(id);
    const j = junctionAt(doc(), at, { modules: modules() });
    if (!j) return null;
    const before = snapshot();
    return { kind: 'junction', at, j, before, orig: JSON.parse(before), start: { x: snap(pt.x), y: snap(pt.y) }, dx: 0, dy: 0 };
  }
  function move(m, pt) {
    const dx = snap(pt.x) - m.start.x, dy = snap(pt.y) - m.start.y;
    if (dx === m.dx && dy === m.dy) return;
    m.dx = dx; m.dy = dy;
    doc().wires = junctionWires(m.orig, m.at, m.j, dx, dy).wires;
    setSel(new Set([`junction:${m.at.x + dx},${m.at.y + dy}`]));
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); });
  }
  function end(m) {
    if (!m.dx && !m.dy) return;
    const to = { x: m.at.x + m.dx, y: m.at.y + m.dy };
    let r;
    try { r = moveJunction(m.orig, m.at, to, { modules: modules() }); } catch (e) { cancel(m); flash(e.message); return; }
    setDoc(r.doc);
    if (r.short) { setSel(new Set([`junction:${m.at.x},${m.at.y}`])); render(); renderProps(); shortNote('The move', r.short); return; }
    if (!r.kept) flash(CONNECTIONS_CHANGED);
    setSel(new Set([`junction:${to.x},${to.y}`]));
    pushUndo(m.before); changed(); render(); renderProps();
  }
  function cancel(m) {
    doc().wires = m.orig.wires;
    setSel(new Set([`junction:${m.at.x},${m.at.y}`]));
    render(); renderProps();
  }
  /** The selected dot `id` moved by (dx, dy) (the arrows). */
  function nudge(id, dx, dy) {
    const m = begin(id, ptOf(id));
    if (!m) return;
    m.dx = dx; m.dy = dy;
    end(m);
  }
  return { svg, begin, move, end, cancel, nudge };
}
