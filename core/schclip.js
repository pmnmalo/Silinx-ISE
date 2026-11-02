// Copy and paste of a schematic's selection (#677): Edit ▸ Cut / Copy / Paste of the schematic editor, in the
// same sheet, in another schematic of the project or in another project. Isomorphic (no DOM).
//
//   import { copySchematic, pasteSchematic } from '/core/schclip.js';
//   const clip = copySchematic(doc, { symbols: [ids], wires: [ids], ports: [ids], labels: [ids], graphics: [ids] }, modules);
//   const { ids } = pasteSchematic(doc2, clip, { dx: 40, dy: 40 });   // doc2 changed in place, ids: what was pasted
//
// What is copied: the selected symbols, wires, net names and I/O markers, with the wires that join the copied
// parts although they are not selected (the wires of a net whose every end is on a copied pin, marker or wire)
// and the net names on the wires copied. A wire that leads to a part left behind is not carried along: the
// copy keeps its connections to the copied parts only.
//
// What is pasted: everything offset by (dx, dy), with fresh ids, and names that collide with nothing of the
// sheet: an instance name already used gets the next inst_n; an I/O marker's name already used gets _1, _2…;
// a net name already used in the sheet gets _1, _2… too (the same new name for every label of that net, so
// the copy's own nets stay joined). A net name of an I/O marker of the sheet that is not pasted is kept: the
// copy connects to that port (the clk of the sheet, say), as a label of that name drawn by hand does.
import { DOC_VERSION, GRID, normalizeDoc, portBox, symbolBox, symbolPins, parseNetName } from './schdoc.js';
import { clone } from './util.js';
import { graphicBox, moveGraphic } from './schgraphics.js';

const CLIP_VERSION = 1;
// a clipboard read as a document of doc's language
const clipDoc = (doc, clip) => normalizeDoc({ version: +clip?.docVersion || 3, lang: doc.lang, symbols: clip?.symbols, wires: clip?.wires, ports: clip?.ports, labels: clip?.labels, graphics: clip?.graphics });
const key = (x, y) => `${x},${y}`;
function onSeg(p, a, b) {
  if (a.x === b.x) return p.x === a.x && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
  if (a.y === b.y) return p.y === a.y && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x);
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  return Math.abs(cross) < 1e-6 && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
}
const onWire = (p, w) => w.points.some((q, i) => i + 1 < w.points.length && onSeg(p, q, w.points[i + 1]));
const ends = w => [w.points[0], w.points[w.points.length - 1]];

/** The clipboard contents of a selection of doc: { version, docVersion, lang, from, symbols, wires, ports, labels }. */
export function copySchematic(doc, sel, modules = {}) {
  const pick = (arr, ids) => { const s = new Set(ids || []); return arr.filter(o => s.has(o.id)); };
  const symbols = pick(doc.symbols, sel.symbols), ports = pick(doc.ports, sel.ports);
  const wires = pick(doc.wires, sel.wires);
  // the points of the copied parts: their pins and the markers' connection points
  const anchors = new Set([...symbols.flatMap(s => symbolPins(s, modules).map(p => key(p.x, p.y))), ...ports.map(p => key(p.x, p.y))]);
  // the wires not selected that join them: every end of such a wire is on a copied part or on another such
  // wire (or a selected one); the wires with an end elsewhere are dropped, and so, in turn, the wires that
  // only lean on those, until nothing changes
  const chosen = new Set(wires.map(w => w.id));
  let cand = doc.wires.filter(w => !chosen.has(w.id));
  for (let changed = true; changed;) {
    changed = false;
    const live = [...wires, ...cand];
    cand = cand.filter(w => {
      const ok = ends(w).every(e => anchors.has(key(e.x, e.y)) || live.some(o => o !== w && onWire(e, o)));
      if (!ok) changed = true;
      return ok;
    });
  }
  // … and among them only those reaching a copied part or a selected wire (not a loose group of wires)
  const reach = new Set();
  const touches = (a, b) => ends(a).some(e => onWire(e, b)) || ends(b).some(e => onWire(e, a));
  const queue = cand.filter(w => w.points.some(p => anchors.has(key(p.x, p.y))) || wires.some(o => touches(w, o)));
  for (const w of queue) reach.add(w.id);
  while (queue.length) {
    const w = queue.shift();
    for (const o of cand) if (!reach.has(o.id) && touches(w, o)) { reach.add(o.id); queue.push(o); }
  }
  const allWires = [...wires, ...cand.filter(w => reach.has(w.id))];
  // the net names: those selected, and those on a copied wire
  const lsel = new Set(sel.labels || []);
  const labels = doc.labels.filter(l => lsel.has(l.id) || allWires.some(w => onWire(l, w)));
  // (the drawings selected, #2593)
  const graphics = pick(doc.graphics || [], sel.graphics);
  return clone({ version: CLIP_VERSION, docVersion: DOC_VERSION, lang: doc.lang, from: doc.name, symbols, wires: doc.wires.filter(w => allWires.includes(w)), ports, labels, ...(graphics.length ? { graphics } : {}) });
}

/** Whether a clipboard has something to paste. */
export const clipEmpty = clip => !clip || !['symbols', 'wires', 'ports', 'labels', 'graphics'].some(k => Array.isArray(clip[k]) && clip[k].length);

/** Paste clip into doc (changed in place), offset by (dx, dy) (snapped to the grid). Returns
 *  { ids: { symbols, wires, ports, labels, graphics }, renamed: { instances, ports, nets }: Maps of old -> new names }. */
export function pasteSchematic(doc, clip, { dx = 0, dy = 0 } = {}) {
  // (a clipboard from the system's, read as text: normalized as a document is, nothing kept that is not one)
  // (its symbols drawn as in the document copied from, docVersion: one copied before #1136 has narrower multiplexers)
  const c = clipDoc(doc, clip);
  dx = Math.round(dx / GRID) * GRID; dy = Math.round(dy / GRID) * GRID;
  const ci = doc.lang === 'vhdl';
  const nk = s => (ci ? String(s).toLowerCase() : String(s));
  const ids = { symbols: [], wires: [], ports: [], labels: [], graphics: [] };
  const renamed = { instances: new Map(), ports: new Map(), nets: new Map() };
  const nextId = (prefix, arr) => { let n = 0; for (const o of arr) { const m = new RegExp(`^${prefix}(\\d+)$`).exec(o.id); if (m) n = Math.max(n, +m[1]); } return `${prefix}${n + 1}`; };

  // instances: a name used in the sheet gets the next inst_n (#311)
  const usedInst = new Set(doc.symbols.map(s => nk(s.name)));
  let n = 0;
  for (const s of doc.symbols) { const m = /^(?:inst|XLXI)_(\d+)$/.exec(s.name); if (m) n = Math.max(n, +m[1]); }
  for (const s0 of c.symbols) {
    const s = { ...s0, id: nextId('S', doc.symbols), x: s0.x + dx, y: s0.y + dy };
    if (!s.name || usedInst.has(nk(s.name))) { let nm; do nm = `inst_${++n}`; while (usedInst.has(nk(nm))); renamed.instances.set(s0.name, nm); s.name = nm; }
    usedInst.add(nk(s.name));
    doc.symbols.push(s); ids.symbols.push(s.id);
  }
  // the names taken in the sheet: its markers and its net names (they join what has the same name)
  const portNames = new Set(doc.ports.map(p => nk(p.name)));
  const taken = new Set([...portNames, ...doc.labels.map(l => nk(parseNetName(l.net).base))]);
  const fresh = base => { let k = 1; while (taken.has(nk(`${base}_${k}`))) k++; const nm = `${base}_${k}`; taken.add(nk(nm)); return nm; };
  // I/O markers: a name used gets _1, _2…
  for (const p0 of c.ports) {
    const p = { ...p0, id: nextId('P', doc.ports), x: p0.x + dx, y: p0.y + dy };
    if (taken.has(nk(p.name))) { p.name = fresh(p0.name); renamed.ports.set(nk(p0.name), p.name); } else taken.add(nk(p.name));
    doc.ports.push(p); ids.ports.push(p.id);
  }
  // net names: the name of a pasted marker follows it; the name of a marker of the sheet is kept (it joins
  // that port); another name used in the sheet gets a fresh one, the same for all the labels of that net
  const copiedPorts = new Set(c.ports.map(p => nk(p.name)));
  for (const l0 of c.labels) {
    const { base } = parseNetName(l0.net);
    const b = nk(base);
    let nb = base;
    if (copiedPorts.has(b)) nb = renamed.ports.get(b) ?? base;
    else if (renamed.nets.has(b)) nb = renamed.nets.get(b);
    else if (portNames.has(b)) nb = base;
    else if (taken.has(b) && !renamed.nets.has(b)) { nb = fresh(base); renamed.nets.set(b, nb); }
    else { renamed.nets.set(b, base); taken.add(b); }
    const l = { ...l0, id: nextId('L', doc.labels), x: l0.x + dx, y: l0.y + dy, net: nb === base ? l0.net : l0.net.replace(/^\s*[A-Za-z_][\w$]*/, nb) };
    doc.labels.push(l); ids.labels.push(l.id);
  }
  for (const [k, v] of [...renamed.nets]) if (nk(v) === k) renamed.nets.delete(k);
  for (const w0 of c.wires) {
    const w = { ...w0, id: nextId('W', doc.wires), points: w0.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
    doc.wires.push(w); ids.wires.push(w.id);
  }
  for (const g0 of c.graphics || []) {
    const g = { ...moveGraphic(g0, dx, dy), id: nextId('G', doc.graphics ||= []) };
    doc.graphics.push(g); ids.graphics.push(g.id);
  }
  return { ids, renamed };
}

// ------------------------------------------------------------------ where a paste goes (#1797)
// the boxes a sheet's things take: a symbol with its name above it, a marker, a net name's text, each wire segment
function boxesOf(d, modules) {
  const out = [];
  for (const sy of d.symbols) { const b = symbolBox(sy, modules); out.push({ x: b.x, y: b.y - 14, w: b.w, h: b.h + 14 }); }
  for (const p of d.ports) out.push(portBox(p));
  for (const l of d.labels) out.push({ x: l.x, y: l.y - 12, w: 8 * String(l.net).length, h: 12 });
  for (const g of d.graphics || []) out.push(graphicBox(g));
  for (const w of d.wires) for (let i = 0; i + 1 < w.points.length; i++) {
    const a = w.points[i], b = w.points[i + 1];
    out.push({ x: Math.min(a.x, b.x) - 2, y: Math.min(a.y, b.y) - 2, w: Math.abs(a.x - b.x) + 4, h: Math.abs(a.y - b.y) + 4 });
  }
  return out;
}
const around = bs => {
  if (!bs.length) return null;
  const x = Math.min(...bs.map(b => b.x)), y = Math.min(...bs.map(b => b.y));
  return { x, y, w: Math.max(...bs.map(b => b.x + b.w)) - x, h: Math.max(...bs.map(b => b.y + b.h)) - y };
};
const meets = (a, b, m) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
const onGrid = v => Math.round(v / GRID) * GRID || 0;   // (no -0)

/** The offset { dx, dy } (on the grid) that pasteSchematic is given for clip pasted into doc: its contents centred
 *  on `at` (the mouse pointer on the sheet), or else in the blank place of `area` (the part of the sheet in view,
 *  { x, y, w, h }) nearest to its centre, clear of what is drawn there by a grid step; no place blank: centred in
 *  `area` (its part on the sheet). With neither, 40 right and down (where it was copied from, beside it). */
export function pasteOffset(doc, clip, { at = null, area = null, modules = {} } = {}) {
  const c = clipDoc(doc, clip);
  const box = around(boxesOf(c, modules));
  if (!box) return { dx: 0, dy: 0 };
  const centredOn = p => ({ dx: onGrid(p.x - (box.x + box.w / 2)), dy: onGrid(p.y - (box.y + box.h / 2)) });
  if (at) return centredOn(at);
  if (!area) return { dx: 40, dy: 40 };
  // (the area within the sheet; zoomed far out, a coarser step: about 100 places a row)
  const sh = doc.sheet || { w: Infinity, h: Infinity };
  const x0 = Math.max(area.x, 0), y0 = Math.max(area.y, 0), x1 = Math.min(area.x + area.w, sh.w), y1 = Math.min(area.y + area.h, sh.h);
  const taken = boxesOf(doc, modules), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const step = Math.max(GRID, onGrid((x1 - x0) / 100));
  let best = null;
  // (the copy's top-left on the grid steps of the area, the copy inside it with a grid step's margin)
  for (let y = onGrid(y0 + GRID); y + box.h <= y1 - GRID; y += step) {
    for (let x = onGrid(x0 + GRID); x + box.w <= x1 - GRID; x += step) {
      const at0 = { x, y, w: box.w, h: box.h };
      const d = (x + box.w / 2 - cx) ** 2 + (y + box.h / 2 - cy) ** 2;
      if ((!best || d < best.d) && !taken.some(b => meets(at0, b, GRID))) best = { x, y, d };
    }
  }
  if (!best) return centredOn({ x: cx, y: cy });
  return { dx: onGrid(best.x - box.x), dy: onGrid(best.y - box.y) };
}
