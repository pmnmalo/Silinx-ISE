// Silinx ink - the flip-flops of a schematic drawn by hand (#1083). A flip-flop is a box (a closed square stroke, or
// square lines meeting at their ends) with labels written inside it: on its left the inputs (D, T, J, K, the clock as
// C, CLK or a wedge, CE, CLR, PRE, R, S), on its right the outputs (Q, and Q with a bar or a prime: Q̄). Its kind
// follows its data inputs, its symbol the controls drawn (fd, ft, fjk and their variants, ffVariant).
//
//   findFlipFlops(items, { templates }) -> [{ box, items, left: [{ label, y }], right: [{ label, y }], unknown: [{ text, y, side }] }]
//     items: schematic.js's strokes ({ s, box, closed, square }); the boxes' strokes and their labels' are `items`
//   ffSymbol(labels) -> { kind, type, error }  the library's flip-flop with these inputs
import { boxOf, segment } from './segment.js';
import { recognizeWords, recognizeExpression } from './expression.js';
import { ffVariant } from '../schdoc.js';

export const FF_INPUTS = { D: 'D', T: 'T', J: 'J', K: 'K', C: 'C', CLK: 'C', CK: 'C', CE: 'CE', EN: 'CE', CLR: 'CLR', PRE: 'PRE', R: 'R', S: 'S' };

// how much of a stroke runs along the border of a box
function onBorder(points, b) {
  const tol = 0.1 * Math.min(b.w, b.h);
  return points.filter(p => Math.min(Math.abs(p.x - b.minX), Math.abs(p.x - b.maxX)) <= tol || Math.min(Math.abs(p.y - b.minY), Math.abs(p.y - b.maxY)) <= tol).length / points.length;
}
const within = (b, box, tol) => b.minX >= box.minX - tol && b.maxX <= box.maxX + tol && b.minY >= box.minY - tol && b.maxY <= box.maxY + tol;

// the boxes: a closed square stroke all on its border, or 2 to 4 square lines whose ends meet, all on theirs
function boxes(items) {
  const square = items.filter(i => i.square >= 0.7 && i.s.length > 2);
  const out = [];
  for (const i of square) if (i.closed && Math.min(i.box.w, i.box.h) > 0 && onBorder(i.s, i.box) >= 0.9) out.push({ items: [i], box: i.box });
  // (lines: joined end to end)
  const lines = square.filter(i => !i.closed);
  const meet = (a, b) => { const d = 0.15 * Math.min(a.len, b.len); return [a.s[0], a.s.at(-1)].some(p => [b.s[0], b.s.at(-1)].some(q => Math.hypot(p.x - q.x, p.y - q.y) <= d)); };
  const seen = new Set();
  for (const l of lines) {
    if (seen.has(l)) continue;
    const comp = [l];
    for (let k = 0; k < comp.length; k++) for (const o of lines) if (!comp.includes(o) && meet(comp[k], o)) comp.push(o);
    comp.forEach(c => seen.add(c));
    if (comp.length < 2 || comp.length > 4) continue;
    const b = boxOf(comp.map(c => c.s));
    const ends = comp.flatMap(c => [c.s[0], c.s.at(-1)]), d = 0.15 * Math.min(...comp.map(c => c.len));
    const closed = ends.every((p, k) => ends.some((q, j) => j !== k && (j >> 1) !== (k >> 1) && Math.hypot(p.x - q.x, p.y - q.y) <= d));
    if (closed && Math.min(b.w, b.h) > 0 && comp.every(c => onBorder(c.s, b) >= 0.9)) out.push({ items: comp, box: b });
  }
  return out;
}

// a clock's wedge: a stroke from the box's left side, pointing in, back to it
function wedge(group, box) {
  if (group.length !== 1) return false;
  const s = group[0].s, tol = 0.15 * box.w, tip = s.reduce((a, p) => (p.x > a.x ? p : a));
  const ends = [s[0], s.at(-1)];
  return ends.every(p => Math.abs(p.x - box.minX) <= tol && tip.x - p.x >= 0.04 * box.w) && Math.abs(ends[0].y - ends[1].y) >= 0.5 * (tip.x - Math.min(ends[0].x, ends[1].x));
}

// the labels inside a box: groups of strokes close together, read as names (on the right, Q or Q̄)
function labels(inner, box, templates) {
  const groups = [];
  const h = Math.max(...inner.map(i => i.box.h), 1);
  for (const t of [...inner].sort((a, b) => a.box.minX - b.box.minX)) {
    const g = groups.find(x => t.box.minX <= x.box.maxX + 0.5 * h && t.box.minY <= x.box.maxY + 0.15 * h && t.box.maxY >= x.box.minY - 0.15 * h);
    if (g) { g.items.push(t); g.box = boxOf(g.items.map(i => i.s)); } else groups.push({ items: [t], box: t.box });
  }
  // (a bar over a label is the label's: Q̄)
  for (const g of [...groups]) {
    if (g.items.length !== 1 || g.box.h > 0.25 * g.box.w) continue;
    const under = groups.find(o => o !== g && o.box.minY > g.box.maxY && o.box.minY - g.box.maxY <= 0.6 * h && o.box.cx >= g.box.minX && o.box.cx <= g.box.maxX);
    if (under) { under.items.push(...g.items); under.box = boxOf(under.items.map(i => i.s)); groups.splice(groups.indexOf(g), 1); }
  }
  const left = [], right = [], unknown = [];
  for (const g of groups) {
    const y = g.box.cy, strokes = g.items.map(i => i.s);
    if (wedge(g.items, box)) { left.push({ label: 'C', y }); continue; }
    if (g.box.cx < box.cx) {
      const text = recognizeWords(strokes, { templates, gap: 2 }).map(w => w.text).join('').toUpperCase();
      if (FF_INPUTS[text]) left.push({ label: FF_INPUTS[text], y }); else unknown.push({ text, y, side: 'left' });
    } else {
      // (Q with a bar over it, or a prime after it: Q̄; a ring read as O or 0 is a Q)
      const text = recognizeExpression(strokes, { templates }).written.replace(/\s+/g, '').toUpperCase().replace(/^[O0]/, 'Q');
      const bar = segment(strokes).bars.length > 0;
      if (text === 'Q' && !bar) right.push({ label: 'Q', y });
      else if (text === "Q'" || (bar && /^Q'?$/.test(text))) right.push({ label: 'QN', y });
      else unknown.push({ text, y, side: 'right' });
    }
  }
  return { left, right, unknown };
}

export function findFlipFlops(items, { templates } = {}) {
  const found = [];
  for (const b of boxes(items)) {
    const tol = 0.05 * Math.min(b.box.w, b.box.h);
    const inner = items.filter(i => !b.items.includes(i) && within(i.box, b.box, tol) && Math.max(i.box.w, i.box.h) < 0.6 * Math.min(b.box.w, b.box.h));
    if (!inner.length) continue;   // (an empty box is not a flip-flop)
    found.push({ box: b.box, items: [...b.items, ...inner], ...labels(inner, b.box, templates) });
  }
  return found;
}

/** The library's flip-flop with these input labels: its kind (d, t, jk), its symbol type; or the error. */
export function ffSymbol(ins) {
  const has = l => ins.includes(l);
  const kind = has('D') ? 'd' : has('T') ? 't' : has('J') && has('K') ? 'jk' : null;
  if (!kind) return { error: 'no data input: write D, T, or J and K' };
  if (!has('C')) return { kind, error: 'no clock: write C or CLK, or draw a wedge' };
  const base = { d: 'fd', t: 'ft', jk: 'fjk' }[kind];
  const type = ffVariant(base, { ce: has('CE'), clr: has('CLR'), pre: has('PRE'), r: has('R'), s: has('S') });
  return type ? { kind, type } : { kind, error: `no flip-flop of the library has the inputs ${ins.join(', ')}` };
}
