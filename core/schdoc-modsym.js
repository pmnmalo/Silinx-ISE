// A module's symbol in a schematic (#1183): an instance is drawn from the ports it was placed with (its params.ports),
// not from its module's as they are now, so that a change of the module (a port added, removed, reordered, turned)
// never moves its pins under the wires connected to them (connections are geometric). Such an instance is out of
// date (symbolDiff: a warning in Check Schematic, an error when a port it connects is gone) until Update Symbol
// (updateModuleSymbols): its ports the module's, the pins that stay in their order, the new ones at the end of their
// side, and the wires following their pin by name. A module with a symbol of its own (<module>.sym.json, #3755,
// core/symbol-layout.js): its instance out of date too when the symbol's layout changed (relaid), Update Symbol then
// taking the symbol's pins' order and sides and its layout. Isomorphic (no DOM).
import { SIDE_V, findMod, symbolDef, xform, xformSide } from './schdoc-symbols.js';
import { followPins, otherPins } from './schdoc-repin.js';
import { instanceParams, layoutChanged } from './symbol-layout.js';

const lc = s => String(s).toLowerCase();
const side = q => (q.dir === 'out' ? 'out' : 'in');
const portCopy = q => ({ name: q.name, dir: q.dir || 'in', width: q.width ?? 1 });

/** How an instance's ports differ from its module's: null when it has the same ones on the same sides (their order
 *  apart: its pins keep theirs, Update Symbol does not change it), and the same layout as its module's symbol (#3755),
 *  else { added, removed, turned, relaid? } (port names; relaid: true when the symbol's layout changed). */
export function symbolDiff(sym, modules = {}) {
  if (sym.type !== 'module' || !Array.isArray(sym.params?.ports)) return null;
  const m = findMod(modules, sym.params.module);
  if (!m) return null;
  const mine = sym.params.ports, theirs = m.ports || [];
  const byName = new Map(theirs.map(q => [lc(q.name), q]));
  const have = new Set(mine.map(q => lc(q.name)));
  const added = theirs.filter(q => !have.has(lc(q.name))).map(q => q.name);
  const removed = mine.filter(q => !byName.has(lc(q.name))).map(q => q.name);
  const turned = mine.filter(q => byName.has(lc(q.name)) && side(byName.get(lc(q.name))) !== side(q)).map(q => q.name);
  const relaid = layoutChanged(sym.params, m);
  return added.length || removed.length || turned.length || relaid ? { added, removed, turned, ...(relaid ? { relaid } : {}) } : null;
}

/** The ports an instance takes on Update Symbol: on each side the ones it has, in their order, then the module's new
 *  ones in the module's order (a removed one leaves, the pins after it close up). */
export function updatedPorts(mine, theirs) {
  const byName = new Map(theirs.map(q => [lc(q.name), q]));
  const out = [];
  for (const s of ['in', 'out']) {
    // (a turned one: a new one of its new side)
    const kept = mine.filter(q => byName.has(lc(q.name)) && side(q) === s && side(byName.get(lc(q.name))) === s).map(q => portCopy(byName.get(lc(q.name))));
    const known = new Set(kept.map(q => lc(q.name)));
    out.push(...kept, ...theirs.filter(q => side(q) === s && !known.has(lc(q.name))).map(portCopy));
  }
  return out;
}

const same = (a, b) => a.x === b.x && a.y === b.y;

/** Update Symbol (#1183): the instances `ids` (all the out-of-date ones when omitted) take their module's ports, the
 *  wires, I/O markers and net names on a pin that stays following it; a pin moved where another symbol's pin touched it
 *  gets a wire. doc changed in place. Returns { updated: [instance names], removed: [`inst.pin`], turned: [`inst.pin`] }
 *  (a removed or turned pin's wires stay where they were, unconnected there). */
export function updateModuleSymbols(doc, modules = {}, ids = null) {
  const report = { updated: [], removed: [], turned: [] };
  for (const s of doc.symbols) {
    if (ids ? !ids.includes(s.id) : !symbolDiff(s, modules)) continue;
    const m = findMod(modules, s.params?.module);
    if (s.type !== 'module' || !m) continue;
    const diff = symbolDiff(s, modules) || { removed: [], turned: [] };
    const oldDef = symbolDef(s, modules), oldAt = new Map(oldDef.pins.map(p => [lc(p.name), xform(s, oldDef, p.x, p.y)]));
    // (a symbol of its own: its order, sides and layout, #3755; else the pins in their order, the new ones after them)
    if (m.symbol) Object.assign(s.params, instanceParams(m));
    else { s.params.ports = updatedPorts(s.params.ports || m.ports, m.ports || []); delete s.params.layout; }
    const newDef = symbolDef(s, modules);
    const others = otherPins(doc, s, modules);
    // a removed or turned pin's wire left where it was, unconnected: pulled back from a pin that comes there (first:
    // before the pins that stay bring their wires)
    const newAt = new Set(newDef.pins.map(p => { const q = xform(s, newDef, p.x, p.y); return `${q.x},${q.y}`; }));
    for (const n of [...diff.removed, ...diff.turned]) {
      const from = oldAt.get(lc(n)), op = oldDef.pins.find(p => lc(p.name) === lc(n));
      if (!from || !newAt.has(`${from.x},${from.y}`)) continue;
      const [dx, dy] = SIDE_V[xformSide(s, op.side)];
      for (const w of doc.wires) for (const end of [0, w.points.length - 1]) if (same(w.points[end], from)) w.points[end] = { x: from.x + 10 * dx, y: from.y + 10 * dy };
    }
    // the pins that stay and move: where they were -> where they are (each wire end, marker, net name moved once)
    const moves = new Map();
    for (const p of newDef.pins) {
      const from = oldAt.get(lc(p.name)), to = xform(s, newDef, p.x, p.y);
      if (from && !same(from, to) && !diff.turned.some(n => lc(n) === lc(p.name))) moves.set(`${from.x},${from.y}`, { from, to, p });
    }
    followPins(doc, moves, others);
    report.updated.push(s.name);
    report.removed.push(...diff.removed.map(n => `${s.name}.${n}`));
    report.turned.push(...diff.turned.map(n => `${s.name}.${n}`));
  }
  return report;
}
