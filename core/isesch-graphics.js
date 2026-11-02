// An ISE schematic's sheet graphics (#2593): the texts, lines, rectangles, circles and arcs ISE's Add menu draws on the
// sheet, read from a .sch, placed in the imported schematic (core/schgraphics.js's graphics) and written to an
// exported .sch. Isomorphic (no DOM).
//
// An ISE arc goes from (sx, sy) to (ex, ey) around (cx, cy), its angle decreasing (the y axis pointing down): the
// AND gate's right side, from its bottom (144,-48) through (192,-96) to its top (144,-144) around (144,-96).
import { arcCircle, normalizeGraphic, textBox } from './schgraphics.js';

export const ISE_GRAPHIC_TAGS = new Set(['text', 'line', 'rect', 'circle', 'arc']);
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

/** An ISE sheet's graphic element (its tag, attributes and text) in the model parseIseSch makes. */
export function iseGraphic(tag, A, text = '') {
  if (tag === 'text') {
    const size = /fontsize\s*:\s*(\d+)/i.exec(A.style || '');
    return { kind: 'text', x: num(A.x), y: num(A.y), text: String(text || '').trim(), ...(size ? { size: +size[1] } : {}) };
  }
  if (tag === 'line') return { kind: 'line', x1: num(A.x1), y1: num(A.y1), x2: num(A.x2), y2: num(A.y2) };
  if (tag === 'rect') return { kind: 'rect', x: num(A.x), y: num(A.y), w: num(A.width), h: num(A.height) };
  if (tag === 'circle') return { kind: 'circle', cx: num(A.cx), cy: num(A.cy), r: num(A.r) };
  return { kind: 'arc', cx: num(A.cx), cy: num(A.cy), r: num(A.r), sx: num(A.sx), sy: num(A.sy), ex: num(A.ex), ey: num(A.ey) };
}

/** The imported schematic's graphics of the ISE sheets' (model.sheets[].graphics), their points placed by the import's
 *  coordinate maps (MX(sheet, x), MY(sheet, y)) and their sizes scaled by s (ISE units -> Silinx px). */
export function graphicsFromIse(model, MX, MY, s) {
  const out = [];
  let k = 0;
  model.sheets.forEach((sh, si) => {
    const X = v => MX(si, v), Y = v => MY(si, v);
    for (const g of sh.graphics || []) {
      let o;
      if (g.kind === 'text') o = { kind: 'text', x: X(g.x), y: Y(g.y), text: g.text, ...(g.size ? { size: Math.round(g.size * s) } : {}) };
      else if (g.kind === 'line') o = { kind: 'line', x1: X(g.x1), y1: Y(g.y1), x2: X(g.x2), y2: Y(g.y2) };
      else if (g.kind === 'rect') o = { kind: 'rect', x: X(g.x), y: Y(g.y), w: X(g.x + g.w) - X(g.x), h: Y(g.y + g.h) - Y(g.y) };
      else if (g.kind === 'circle') o = { kind: 'circle', cx: X(g.cx), cy: Y(g.cy), r: (X(g.cx + g.r) - X(g.cx - g.r)) / 2 };
      else {
        // (its middle point: half way round from its start, the angle decreasing)
        const T = 2 * Math.PI, a1 = Math.atan2(g.sy - g.cy, g.sx - g.cx), a3 = Math.atan2(g.ey - g.cy, g.ex - g.cx);
        const am = a1 - (((a1 - a3) % T) + T) % T / 2;
        const r = g.r || Math.hypot(g.sx - g.cx, g.sy - g.cy);
        o = { kind: 'arc', x1: X(g.sx), y1: Y(g.sy), x2: X(g.cx + r * Math.cos(am)), y2: Y(g.cy + r * Math.sin(am)), x3: X(g.ex), y3: Y(g.ey) };
      }
      o = normalizeGraphic({ id: `G${++k}`, ...o });
      if (o) out.push(o);
    }
  });
  return out;
}

/** The XML elements of a schematic's graphics on an ISE sheet (ind: their indent), X scaling a coordinate
 *  (Silinx px -> ISE units). A text of several lines is a text per line. */
export function graphicsToIse(graphics, X, ind = '        ') {
  const L = [];
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  for (const g of graphics || []) {
    if (g.kind === 'text') {
      const b = textBox(g);
      b.lines.forEach((l, i) => { if (l.trim()) L.push(`${ind}<text style="fontsize:${X(b.size)};fontname:Arial" x="${X(g.x)}" y="${X(g.y + i * b.lh)}">${esc(l)}</text>`); });
    } else if (g.kind === 'line') L.push(`${ind}<line x2="${X(g.x2)}" y1="${X(g.y1)}" y2="${X(g.y2)}" x1="${X(g.x1)}" />`);
    else if (g.kind === 'rect') L.push(`${ind}<rect width="${X(g.w)}" x="${X(g.x)}" y="${X(g.y)}" height="${X(g.h)}" />`);
    else if (g.kind === 'circle') L.push(`${ind}<circle r="${X(g.r)}" cx="${X(g.cx)}" cy="${X(g.cy)}" />`);
    else if (g.kind === 'arc') {
      const c = arcCircle(g);
      if (!c) { L.push(`${ind}<line x2="${X(g.x3)}" y1="${X(g.y1)}" y2="${X(g.y3)}" x1="${X(g.x1)}" />`); continue; }
      // (ISE's arcs go with the angle decreasing: an arc of Silinx's going the other way written from its end)
      const [s, e] = c.sweep ? [[g.x3, g.y3], [g.x1, g.y1]] : [[g.x1, g.y1], [g.x3, g.y3]];
      L.push(`${ind}<arc ex="${X(e[0])}" ey="${X(e[1])}" sx="${X(s[0])}" sy="${X(s[1])}" r="${X(c.r)}" cx="${X(c.cx)}" cy="${X(c.cy)}" />`);
    }
  }
  return L;
}
