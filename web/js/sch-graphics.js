// The schematic editor's graphics (#2593, core/schgraphics.js): drawings with no function that annotate the sheet, as
// ISE's Add ▸ Text, Line, Rectangle, Circle and Arc. A text asked for where the sheet is clicked; a line, a rectangle
// or a circle dragged (the circle from its centre); an arc dragged from its start to its end, then its bulge set by a
// click. The drawing under way drawn in the overlay; a drawing's properties (a text's lines and size, the points).
import { GRAPHIC_KINDS, TEXT_SIZE, TEXT_SIZES, graphicBox, graphicSvg, normalizeGraphic } from '/core/schgraphics.js';
import { h } from './dom.js';
import { snap } from './sch-editor.js';

export const GRAPHIC_TOOLS = GRAPHIC_KINDS;
export const GRAPHIC_TITLES = { text: 'Add Text (T)', line: 'Add Line', rect: 'Add Rectangle', circle: 'Add Circle', arc: 'Add Arc' };
export const GRAPHIC_LABELS = { text: 'Text', line: 'Line', rect: 'Rectangle', circle: 'Circle', arc: 'Arc' };

/** { down, move, up, band } of a schematic editor's graphic tools (doc(), drag(), tool(): its current ones). */
export function mountSchGraphics(ctx) {
  const { doc, drag, setDrag, tool, edit, nextId, promptBox, renderOverlay } = ctx;
  const at = p => ({ x: snap(p.x), y: snap(p.y) });
  function add(g) {
    const o = normalizeGraphic(g);
    if (!o) return;
    edit(() => { doc().graphics ||= []; doc().graphics.push({ ...o, id: nextId('G', doc().graphics) }); }, { keepProps: true });
  }
  /** A press on the sheet with a graphic tool: a text asked for, a drag started, or the arc under way finished. */
  async function down(pt) {
    const d = drag();
    if (d?.kind === 'graphic' && d.end) { d.cur = at(pt); setDrag(null); add(shapeOf(d)); renderOverlay(); return; }
    const p = at(pt);
    if (tool() === 'text') {
      const text = await promptBox(pt, 'Text', '');
      if (text) add({ kind: 'text', x: p.x, y: p.y, text });
      return;
    }
    setDrag({ kind: 'graphic', shape: tool(), start: p, cur: p });
  }
  function move(d, pt) { d.cur = at(pt); renderOverlay(); }
  /** The release: the drawing added, or (an arc's first step) the drag going on to its bulge, returned. */
  function up(d, pt) {
    d.cur = at(pt);
    if (d.end) return d;
    if (d.cur.x === d.start.x && d.cur.y === d.start.y) { renderOverlay(); return null; }
    if (d.shape === 'arc') return { ...d, end: d.cur };
    add(shapeOf(d));
    return null;
  }
  /** The band selecting (r, its rectangle): the drawings all in it added to sel. */
  function band(r, sel) {
    const inside = (x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    for (const g of doc().graphics || []) { const b = graphicBox(g); if (inside(b.x, b.y) && inside(b.x + b.w, b.y + b.h)) sel.add(`graphic:${g.id}`); }
  }
  return { down, move, up, band };
}

// the drawing a drag makes (an arc's second step: through the pointer)
function shapeOf(d) {
  const a = d.start, b = d.cur;
  if (d.shape === 'line') return { kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  if (d.shape === 'rect') return { kind: 'rect', x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  if (d.shape === 'circle') return { kind: 'circle', cx: a.x, cy: a.y, r: snap(Math.hypot(b.x - a.x, b.y - a.y)) };
  if (d.end) return { kind: 'arc', x1: a.x, y1: a.y, x2: b.x, y2: b.y, x3: d.end.x, y3: d.end.y };
  return { kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

/** The drawing under way (drag d, the tool in use), drawn in the overlay. */
export function graphicGhost(d, tool) {
  if (d?.kind !== 'graphic' || !GRAPHIC_TOOLS.includes(tool)) return '';
  const g = normalizeGraphic({ id: 'ghost', ...shapeOf(d) });
  return g ? '<g class="ghost">' + graphicSvg(g) + '</g>' : '';
}

/** The Properties panel of a drawing g: a text's lines and size, a shape's points (helpers: the panel's). */
export function graphicProps(g, { propBody, field, inp, ta }) {
  propBody.append(h('div', { class: 'se-ptitle', text: GRAPHIC_LABELS[g.kind] }));
  const num = (key, attrs = {}) => inp(g[key], v => { g[key] = Math.round(+v || 0); }, { type: 'number', step: 10, ...attrs });
  const pair = (a, b) => h('div', { class: 'se-row' }, num(a), num(b));
  if (g.kind === 'text') {
    propBody.append(field('Text', ta(g.text, v => { if (String(v).trim()) g.text = v; }, 3)));
    propBody.append(field('Text size', inp(g.size ?? TEXT_SIZE, v => { g.size = Math.round(+v || TEXT_SIZE); }, { type: 'number', min: TEXT_SIZES[0], max: TEXT_SIZES[1] })));
    propBody.append(field('Position', pair('x', 'y')));
  } else if (g.kind === 'line') {
    propBody.append(field('Start', pair('x1', 'y1')), field('End', pair('x2', 'y2')));
  } else if (g.kind === 'rect') {
    propBody.append(field('Position', pair('x', 'y')), field('Size', pair('w', 'h')));
  } else if (g.kind === 'circle') {
    propBody.append(field('Centre', pair('cx', 'cy')), field('Radius', num('r', { min: 1 })));
  } else if (g.kind === 'arc') {
    propBody.append(field('Start', pair('x1', 'y1')), field('Through', pair('x2', 'y2')), field('End', pair('x3', 'y3')));
  }
  propBody.append(h('div', { class: 'se-note', text: 'A drawing to annotate the sheet: it does not change the circuit.' }));
}
