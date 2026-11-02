// A schematic's graphics (#2593): drawings with no function that annotate the sheet, as ISE's Add ▸ Text, Line,
// Rectangle, Circle and Arc. The netlist, the HDL and the check ignore them. Isomorphic (no DOM).
//
//   doc.graphics: [{ id, kind: 'text', x, y, text, size? }      // (x, y): the first line's baseline, left; size: px
//                  { id, kind: 'line', x1, y1, x2, y2 }
//                  { id, kind: 'rect', x, y, w, h }
//                  { id, kind: 'circle', cx, cy, r }
//                  { id, kind: 'arc', x1, y1, x2, y2, x3, y3 }]  // from (x1, y1) through (x2, y2) to (x3, y3)
import { clone } from './util.js';

export const GRAPHIC_KINDS = ['text', 'line', 'rect', 'circle', 'arc'];
export const TEXT_SIZE = 14;
export const TEXT_SIZES = [8, 72];
const COORDS = { text: ['x', 'y'], line: ['x1', 'y1', 'x2', 'y2'], rect: ['x', 'y', 'w', 'h'], circle: ['cx', 'cy', 'r'], arc: ['x1', 'y1', 'x2', 'y2', 'x3', 'y3'] };
const XS = new Set(['x', 'x1', 'x2', 'x3', 'cx']), YS = new Set(['y', 'y1', 'y2', 'y3', 'cy']);
const num = v => (Number.isFinite(+v) ? Math.round(+v) : 0);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A graphic as a document keeps it, or null when it is none (an unknown kind, an empty text, a shape of no size). */
export function normalizeGraphic(g) {
  if (!g || !GRAPHIC_KINDS.includes(g.kind)) return null;
  const o = { id: g.id, kind: g.kind };
  for (const k of COORDS[g.kind]) o[k] = num(g[k]);
  if (g.kind === 'text') {
    o.text = String(g.text ?? '').replace(/\r\n?/g, '\n').replace(/^\n+|\s+$/g, '');
    if (!o.text) return null;
    const size = num(g.size);
    if (g.size != null && size !== TEXT_SIZE) o.size = Math.min(TEXT_SIZES[1], Math.max(TEXT_SIZES[0], size));
  }
  if (g.kind === 'rect') {
    // (dragged up or to the left: its corner the top left one)
    if (o.w < 0) { o.x += o.w; o.w = -o.w; }
    if (o.h < 0) { o.y += o.h; o.h = -o.h; }
    if (!o.w && !o.h) return null;
  }
  if (g.kind === 'line' && o.x1 === o.x2 && o.y1 === o.y2) return null;
  if (g.kind === 'circle') { o.r = Math.abs(o.r); if (!o.r) return null; }
  if (g.kind === 'arc' && o.x1 === o.x3 && o.y1 === o.y3) return null;
  return o;
}

/** The circle through an arc's three points, { cx, cy, r, sweep } (sweep 1: clockwise on the screen), or null when
 *  they are in line (the arc drawn as a straight line). */
export function arcCircle(g) {
  const { x1, y1, x2, y2, x3, y3 } = g;
  const d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
  if (!d) return null;
  const s1 = x1 * x1 + y1 * y1, s2 = x2 * x2 + y2 * y2, s3 = x3 * x3 + y3 * y3;
  const cx = (s1 * (y2 - y3) + s2 * (y3 - y1) + s3 * (y1 - y2)) / d;
  const cy = (s1 * (x3 - x2) + s2 * (x1 - x3) + s3 * (x2 - x1)) / d;
  return { cx: cx || 0, cy: cy || 0, r: Math.hypot(x1 - cx, y1 - cy), sweep: d > 0 ? 1 : 0 };
}

// an arc's points along its circle: angle of a point, and whether angle a is on the arc (from start to end through mid)
const ang = (c, x, y) => Math.atan2(y - c.cy, x - c.cx);
function onArc(g, c, a) {
  const T = 2 * Math.PI, norm = v => ((v % T) + T) % T;
  const a1 = ang(c, g.x1, g.y1), a3 = ang(c, g.x3, g.y3);
  // (sweep 1, clockwise on the screen: the angles grow, the y axis pointing down)
  return c.sweep ? norm(a - a1) <= norm(a3 - a1) : norm(a1 - a) <= norm(a1 - a3);
}

/** A text's lines and the size of its box (its width estimated from its characters, as the net names'). */
export function textBox(g) {
  const lines = g.text.split('\n'), size = g.size || TEXT_SIZE;
  const w = Math.max(...lines.map(l => l.length)) * size * 0.6, lh = Math.round(size * 1.25);
  return { lines, size, lh, x: g.x, y: g.y - size, w: Math.max(size, w), h: lh * (lines.length - 1) + Math.round(size * 1.2) };
}

/** A graphic's bounding box { x, y, w, h }. */
export function graphicBox(g) {
  switch (g.kind) {
    case 'text': { const b = textBox(g); return { x: b.x, y: b.y, w: b.w, h: b.h }; }
    case 'line': return { x: Math.min(g.x1, g.x2), y: Math.min(g.y1, g.y2), w: Math.abs(g.x2 - g.x1), h: Math.abs(g.y2 - g.y1) };
    case 'rect': return { x: g.x, y: g.y, w: g.w, h: g.h };
    case 'circle': return { x: g.cx - g.r, y: g.cy - g.r, w: 2 * g.r, h: 2 * g.r };
    case 'arc': {
      const xs = [g.x1, g.x3], ys = [g.y1, g.y3];
      const c = arcCircle(g);
      if (c) for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2;
        if (onArc(g, c, a > Math.PI ? a - 2 * Math.PI : a)) { xs.push(c.cx + c.r * Math.cos(a)); ys.push(c.cy + c.r * Math.sin(a)); }
      }
      const r2 = v => Math.round(v * 100) / 100, x = r2(Math.min(...xs)), y = r2(Math.min(...ys));
      return { x, y, w: r2(Math.max(...xs) - x), h: r2(Math.max(...ys) - y) };
    }
  }
  return { x: 0, y: 0, w: 0, h: 0 };
}

/** The graphic moved by (dx, dy), a new object. */
export function moveGraphic(g, dx, dy) {
  const o = clone(g);
  for (const k of COORDS[g.kind]) if (XS.has(k)) o[k] += dx; else if (YS.has(k)) o[k] += dy;
  return o;
}

/** The distance from (x, y) to the graphic's line (a text: 0 inside its box). */
export function graphicDistance(g, x, y) {
  const seg = (ax, ay, bx, by) => {
    const L = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / L)) : 0;
    return Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay));
  };
  switch (g.kind) {
    case 'text': { const b = textBox(g); return Math.hypot(Math.max(b.x - x, 0, x - b.x - b.w), Math.max(b.y - y, 0, y - b.y - b.h)); }
    case 'line': return seg(g.x1, g.y1, g.x2, g.y2);
    case 'rect': return Math.min(seg(g.x, g.y, g.x + g.w, g.y), seg(g.x + g.w, g.y, g.x + g.w, g.y + g.h), seg(g.x, g.y + g.h, g.x + g.w, g.y + g.h), seg(g.x, g.y, g.x, g.y + g.h));
    case 'circle': return Math.abs(Math.hypot(x - g.cx, y - g.cy) - g.r);
    case 'arc': {
      const c = arcCircle(g);
      if (!c) return seg(g.x1, g.y1, g.x3, g.y3);
      if (onArc(g, c, ang(c, x, y))) return Math.abs(Math.hypot(x - c.cx, y - c.cy) - c.r);
      return Math.min(Math.hypot(x - g.x1, y - g.y1), Math.hypot(x - g.x3, y - g.y3));
    }
  }
  return Infinity;
}

/** A graphic's SVG path data (not a text's). */
export function graphicPath(g) {
  switch (g.kind) {
    case 'line': return `M${g.x1},${g.y1} L${g.x2},${g.y2}`;
    case 'rect': return `M${g.x},${g.y} h${g.w} v${g.h} h${-g.w} Z`;
    case 'circle': return `M${g.cx - g.r},${g.cy} a${g.r},${g.r} 0 1,0 ${2 * g.r},0 a${g.r},${g.r} 0 1,0 ${-2 * g.r},0 Z`;
    case 'arc': {
      const c = arcCircle(g);
      if (!c) return `M${g.x1},${g.y1} L${g.x3},${g.y3}`;
      const r = Math.round(c.r * 100) / 100;
      // (more than half the circle: the large arc, the centre on the middle point's side of the chord)
      const side = (x, y) => (g.x3 - g.x1) * (y - g.y1) - (g.y3 - g.y1) * (x - g.x1);
      const large = side(g.x2, g.y2) * side(c.cx, c.cy) > 0 ? 1 : 0;
      return `M${g.x1},${g.y1} A${r},${r} 0 ${large},${c.sweep} ${g.x3},${g.y3}`;
    }
  }
  return '';
}

/** A graphic drawn in SVG: a group of class "graphic" (cls added), its data-kind "graphic" and data-id its id, with
 *  a wide transparent line (or a text's box) to pick it by. */
export function graphicSvg(g, cls = '') {
  const head = `<g class="graphic g-${g.kind}${cls}" data-kind="graphic" data-id="${esc(g.id)}">`;
  if (g.kind === 'text') {
    const b = textBox(g);
    const tspans = b.lines.map((l, i) => `<tspan x="${g.x}" dy="${i ? b.lh : 0}">${esc(l) || ' '}</tspan>`).join('');
    return `${head}<rect class="hitbox" x="${b.x}" y="${b.y}" width="${Math.round(b.w)}" height="${b.h}"/><text class="gtext" x="${g.x}" y="${g.y}" style="font-size:${b.size}px">${tspans}</text></g>`;
  }
  const d = graphicPath(g);
  return `${head}<path class="ghit" d="${d}"/><path class="gline" d="${d}"/></g>`;
}
