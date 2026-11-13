// Silinx - a module's symbol of its own (#3755), as ISE's .sym is to its schematic symbols: <module>.sym.json beside
// the module's source, saved with the project. It holds the pins' order and side (left W, right E, top N, bottom S),
// the spacing between pins, the body's width and height, and where the module's name is drawn; a module without one
// is drawn as before (core/schdoc-symbols.js boxDef: the inputs on the left, the outputs on the right). An instance
// keeps the layout it was placed with (its params.ports' sides and its params.layout, as #1183 keeps its ports), the
// schematic's Update Symbol taking a new one (core/schdoc-modsym.js). Isomorphic (no DOM).

const SYMBOL_SIDES = ['W', 'E', 'N', 'S'];
const TITLE_PLACES = ['top', 'center', 'bottom'];
export const SPACING = { min: 20, max: 100, default: 20 };
export const SIZE = { min: 40, max: 2000 };
const chW = 6.2;   // (as boxDef's: the approximate width of a pin name's letter)
const r10 = v => Math.ceil(v / 10) * 10;
const lc = s => String(s).toLowerCase();

export const isSymbolFile = path => /\.sym\.json$/i.test(String(path || ''));
/** The symbol file of a module: <module>.sym.json in the folder of its source. */
export const symbolFileOf = (sourceFile, module) => `${String(sourceFile || '').includes('/') ? String(sourceFile).replace(/\/[^/]*$/, '/') : ''}${module}.sym.json`;
/** The side a port is drawn on by default: an output on the right, the others on the left (boxDef's). */
const defaultSide = port => (port.dir === 'out' ? 'E' : 'W');

/** The symbol a module has by default: its ports in its order, on their default sides. */
export function newSymbol(module) {
  return { version: 1, kind: 'symbol', module: module.name, pins: (module.ports || []).map(q => ({ name: q.name, side: defaultSide(q) })), spacing: SPACING.default, width: null, height: null, title: 'top' };
}

const intIn = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };

/** A symbol read from its file's JSON (an object): its fields checked, anything else dropped; errors: what was wrong
 *  (a pin twice, a side that is not one, a spacing out of range), the symbol then as it can be read. */
export function normalizeSymbol(o) {
  const errors = [];
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { symbol: null, errors: ['not a symbol (a JSON object)'] };
  const module = typeof o.module === 'string' ? o.module.trim() : '';
  if (!module) errors.push('no module');
  const pins = [], seen = new Set();
  for (const q of Array.isArray(o.pins) ? o.pins : []) {
    if (!q || typeof q.name !== 'string' || !q.name.trim()) { errors.push('a pin without a name'); continue; }
    if (seen.has(lc(q.name))) { errors.push(`pin ${q.name} twice`); continue; }
    seen.add(lc(q.name));
    const side = SYMBOL_SIDES.includes(q.side) ? q.side : null;
    if (!side) errors.push(`pin ${q.name}: side '${q.side}' is not one of ${SYMBOL_SIDES.join(', ')}`);
    pins.push({ name: q.name, ...(side ? { side } : {}) });
  }
  let spacing = SPACING.default;
  if (o.spacing != null) {
    const n = intIn(o.spacing, SPACING.min, SPACING.max);
    if (n == null || n % 10 || n !== Number(o.spacing)) errors.push(`spacing ${o.spacing}: a multiple of 10 from ${SPACING.min} to ${SPACING.max}`);
    spacing = n == null ? SPACING.default : r10(n);
  }
  const size = k => {
    if (o[k] == null || o[k] === '') return null;
    const n = intIn(o[k], SIZE.min, SIZE.max);
    if (n == null || n !== Number(o[k])) errors.push(`${k} ${o[k]}: from ${SIZE.min} to ${SIZE.max}`);
    return n == null ? null : r10(n);
  };
  const width = size('width'), height = size('height');
  const title = TITLE_PLACES.includes(o.title) ? o.title : 'top';
  if (o.title != null && !TITLE_PLACES.includes(o.title)) errors.push(`title '${o.title}' is not one of ${TITLE_PLACES.join(', ')}`);
  return { symbol: { version: 1, kind: 'symbol', module, pins, spacing, width, height, title }, errors };
}

/** A symbol's file text read: { symbol, errors } (symbol null when it is not JSON). */
export function readSymbol(text) {
  let o;
  try { o = JSON.parse(text); } catch (e) { return { symbol: null, errors: [`not JSON: ${e.message}`] }; }
  return normalizeSymbol(o);
}
export const symbolText = sym => `${JSON.stringify(sym, null, 1)}\n`;

/** The symbol and the module's ports in step: { pins, added, removed } - the symbol's pins that are ports, in its
 *  order, then the ports it does not have yet on their default side (added); its pins no port is any more (removed). */
export function reconcile(sym, ports) {
  const byName = new Map((ports || []).map(q => [lc(q.name), q]));
  const pins = [], removed = [], have = new Set();
  for (const q of sym?.pins || []) {
    const p = byName.get(lc(q.name));
    if (!p) { removed.push(q.name); continue; }
    have.add(lc(q.name));
    pins.push({ name: p.name, side: q.side || defaultSide(p) });
  }
  const added = (ports || []).filter(q => !have.has(lc(q.name)));
  for (const q of added) pins.push({ name: q.name, side: defaultSide(q) });
  return { pins, added: added.map(q => q.name), removed };
}

/** The ports of an instance placed from module `m` (its symbol's order and sides when it has one), and its layout:
 *  { ports: [{ name, dir, width, side? }], layout? } - what an instance keeps (#1183). */
export function instanceParams(m) {
  const port = q => ({ name: q.name, dir: q.dir || 'in', width: q.width ?? 1 });
  if (!m?.symbol) return { ports: (m?.ports || []).map(port) };
  const byName = new Map((m.ports || []).map(q => [lc(q.name), q]));
  return { ports: reconcile(m.symbol, m.ports).pins.map(q => ({ ...port(byName.get(lc(q.name))), side: q.side })), layout: layoutOf(m.symbol) };
}
/** What of a symbol an instance keeps besides its pins' sides. */
export const layoutOf = sym => ({ spacing: sym.spacing || SPACING.default, width: sym.width ?? null, height: sym.height ?? null, title: sym.title || 'top' });

/** Whether an instance's layout (its ports' order and sides, its params.layout) is not its module's symbol's: m.symbol,
 *  or the default one when it has none (then only an instance with a layout of its own differs). */
export function layoutChanged(params, m) {
  if (!m?.symbol) return !!params.layout;
  if (!params.layout) return true;
  const want = instanceParams(m), mine = params.ports || [];
  if (JSON.stringify(layoutOf(params.layout)) !== JSON.stringify(want.layout)) return true;
  const key = list => list.map(q => `${lc(q.name)}:${q.side || defaultSide(q)}`).join(',');
  return key(mine) !== key(want.ports);
}

/** The project's modules with their symbols: each module of `modules` (by name) whose symbol file is among `files`
 *  ({ path: text }) gets symbol (its pins in step with its ports, reconcile) and symbolFile; a file that is not a
 *  symbol, or the symbol of no module, is left out. modules changed in place, and returned. */
export function attachSymbols(modules, files) {
  const byName = new Map(Object.values(modules || {}).map(m => [lc(m.name), m]));
  for (const [path, text] of Object.entries(files || {})) {
    if (!isSymbolFile(path)) continue;
    const { symbol } = readSymbol(text);
    const m = symbol && byName.get(lc(symbol.module || path.replace(/^.*\//, '').replace(/\.sym\.json$/i, '')));
    if (!m) continue;
    m.symbol = { ...symbol, module: m.name, pins: reconcile(symbol, m.ports).pins };
    m.symbolFile = path;
  }
  return modules;
}

/** The local geometry of a module's symbol laid out by `layout` (its ports with their sides, in their order along
 *  each side): { w, h, body, pins, titleY }. With the default layout (every port on its default side, spacing 20, no
 *  size, the name on top) the same as boxDef. */
export function layoutDef(ports, layout, title) {
  const sp = layout.spacing || SPACING.default;
  const on = s => ports.filter(q => (q.side || defaultSide(q)) === s);
  const W = on('W'), E = on('E'), N = on('N'), S = on('S');
  const rows = Math.max(W.length, E.length, 1), cols = Math.max(N.length, S.length);
  const where = layout.title || 'top';
  const start = Math.max(sp, where === 'top' ? 20 : 0), end = Math.max(sp, where === 'bottom' ? 20 : 0);
  // (the names on the top and the bottom read upwards, as ISE turns them: room for the longest of each)
  const tall = list => (list.length ? Math.max(...list.map(q => String(q.name).length)) * chW + 8 : 0);
  const needH = Math.max(start + (rows - 1) * sp + end, r10(tall(N) + tall(S) + 20));
  const lw = Math.max(0, ...W.map(p => String(p.name).length * chW));
  const rw = Math.max(0, ...E.map(p => String(p.name).length * chW));
  const needW = cols ? (cols + 1) * sp : 0;
  const bw = layout.width ? Math.max(r10(layout.width), needW, SIZE.min) : r10(Math.max(80, lw + rw + 24, String(title || '').length * 7 + 16, needW));
  const bh = layout.height ? Math.max(r10(layout.height), needH) : needH;
  const oy = N.length ? 20 : 0, w = bw + 40, h = oy + bh + (S.length ? 20 : 0);
  const pins = [];
  const across = list => Math.floor((bw - (list.length - 1) * sp) / 20) * 10;
  W.forEach((p, i) => pins.push({ ...p, x: 0, y: oy + start + i * sp, side: 'W' }));
  E.forEach((p, i) => pins.push({ ...p, x: w, y: oy + start + i * sp, side: 'E' }));
  N.forEach((p, i) => pins.push({ ...p, x: 20 + across(N) + i * sp, y: 0, side: 'N' }));
  S.forEach((p, i) => pins.push({ ...p, x: 20 + across(S) + i * sp, y: h, side: 'S' }));
  const titleY = where === 'center' ? oy + bh / 2 + 1 : where === 'bottom' ? oy + bh - 9 : oy + 11;
  return { w, h, body: { x: 20, y: oy, w: bw, h: bh }, pins, titleY };
}
