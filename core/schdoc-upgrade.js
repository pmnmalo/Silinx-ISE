// A schematic of an earlier document version brought to the current one (core/schdoc.js normalizeDoc), where a
// symbol's geometry changed and its connections, geometric, have to follow it.
//
// 4 (#1136): the multiplexers 70 px wide, as the DEMUX (they were 40 px for M2_1 / M4_1, 60 for M8_1; M16_1 kept at 80).
// Each is placed so that its data inputs, its enable and its select bits stay where they were; only its output O moves,
// along its lead, and what was connected there goes with it: a wire's end (its last run lengthened or shortened, or a
// run added when that run is across), an I/O marker, a net name; another symbol's pin there gets a wire to the new O.
// 5 (#1726): the bus tap drawn as ISE's, a diagonal entry from its bus: its input I a grid step from its output's line
// (local (0, 0), it was (0, 10)). The tap stays, its output O where it was; what met its old I follows as above (a wire
// whose last run goes that way has its end moved, else a bus wire joins the old place to the new I).
// 6 (#1910): the bus join 60 px wide, its inputs' leads long enough for their bits' labels (it was 40, its bar at 20).
// Each is placed so that its inputs stay where they were; its output O moves along its lead, what met it following.
// 7 (#1988): INV, BUF and the tri-state buffers (BUFE / BUFT) 80 px wide, as the 2-input gates (they were 60): each
// placed so that its inputs stay where they were, its outputs (one a bit for BUFE4…) moved along their leads, what met
// them following.
// Isomorphic (no DOM).
import { BUF_OLD_W, JOIN_OLD_W, MUX_BODY_W, MUX_INPUTS, MUX_OLD_BODY_W, symbolDef, xform } from './schdoc-symbols.js';

const same = (a, b) => a.x === b.x && a.y === b.y;

// what was connected at `before` taken to `after` (a pin's move, in place): a wire's end whose last run goes along the
// move moved, a marker or a net name moved; otherwise (a run across, another symbol's pin there) a wire from there
function follow(doc, before, after, others, bus) {
  if (same(before, after)) return;
  const across = before.x === after.x ? 'x' : 'y';   // (the axis the pin moved along: x or y stays)
  let joined = false;
  for (const w of doc.wires) {
    for (const last of [false, true]) {
      if (w.points.length < 2) break;
      const end = last ? w.points.length - 1 : 0, p = w.points[end];
      if (!same(p, before)) continue;
      const next = w.points[end === 0 ? 1 : end - 1];
      if (next[across] === p[across]) {
        // its last run along the move: its end moved (a run of no length left: the point dropped)
        w.points[end] = { ...after };
        if (same(w.points[end], next)) w.points.splice(end, 1);
      } else joined = true;
    }
  }
  doc.wires = doc.wires.filter(w => w.points.length >= 2);
  for (const m of [...doc.ports, ...doc.labels]) if (same(m, before)) { m.x = after.x; m.y = after.y; }
  if (joined || others.has(`${before.x},${before.y}`)) {
    const w = { id: `W${doc.wires.length + 1}`, points: [{ ...before }, { ...after }] };
    while (doc.wires.some(x => x.id === w.id)) w.id += '_';
    if (bus) w.bus = true;
    doc.wires.push(w);
  }
}
// the pins of the symbols but `skip`'s kind, as 'x,y'
const pinsOfOthers = (doc, modules, skip) => new Set(doc.symbols.filter(s => !skip(s)).flatMap(s => {
  const def = symbolDef(s, modules);
  return def.pins.map(p => { const q = xform(s, def, p.x, p.y); return `${q.x},${q.y}`; });
}));

/** The bus taps of doc (version 4) drawn as ISE's (#1726), their input moved, doc changed in place. */
export function moveTaps(doc, modules = {}) {
  const taps = doc.symbols.filter(s => s.type === 'slice');
  if (!taps.length) return doc;
  const others = pinsOfOthers(doc, modules, s => s.type === 'slice');
  for (const s of taps) {
    const def = symbolDef(s, {}), i = def.pins.find(p => p.name === 'I');
    follow(doc, xform(s, def, 0, 10), xform(s, def, i.x, i.y), others, true);
  }
  return doc;
}

const BUFS = new Set(['inv', 'buf', 'tbuf']);
/** The inverters and buffers of doc (version 6) widened (#1988), their outputs moved, doc changed in place. */
// (split: a document of version 2, whose wires connected where they passed over a pin, #678: its wires split at the
// old outputs first, so that what passed over one follows it)
export function widenBuffers(doc, modules = {}, split = null) {
  const bufs = doc.symbols.filter(s => BUFS.has(s.type));
  if (!bufs.length) return doc;
  const others = pinsOfOthers(doc, modules, s => BUFS.has(s.type));
  // (and the buffers' own inputs, which stay: an inverter's output on another buffer's input gets a wire)
  for (const s of bufs) {
    const old = { ...symbolDef(s, {}), w: BUF_OLD_W };
    for (const p of old.pins.filter(q => q.dir === 'in')) { const q = xform(s, old, p.x, p.y); others.add(`${q.x},${q.y}`); }
  }
  for (const s of bufs) {
    const def = symbolDef(s, {}), old = { ...def, w: BUF_OLD_W };
    // placed so that its inputs stay where they were (local x = 0; turned or mirrored, its box grows on their other side)
    const a = xform(s, old, 0, 0), b = xform(s, def, 0, 0);
    const outs = def.pins.filter(p => p.dir === 'out').map(o => ({ o, before: xform(s, old, BUF_OLD_W, o.y) }));
    if (split) split(outs.map(o => o.before));
    s.x += a.x - b.x; s.y += a.y - b.y;
    for (const { o, before } of outs) {
      const after = xform(s, def, o.x, o.y);
      // (a net name on the output's lead the symbol now covers, between the old and the new end: moved as far, still on
      // its wire)
      const dx = after.x - before.x, dy = after.y - before.y;
      for (const l of doc.labels) {
        const on = dy === 0 ? l.y === before.y && (l.x - before.x) * Math.sign(dx) > 0 && (l.x - before.x) * Math.sign(dx) < Math.abs(dx)
          : l.x === before.x && (l.y - before.y) * Math.sign(dy) > 0 && (l.y - before.y) * Math.sign(dy) < Math.abs(dy);
        if (on) { l.x += dx; l.y += dy; }
      }
      follow(doc, before, after, others, (o.width || 1) > 1);
    }
  }
  return doc;
}

/** The bus joins of doc (version 5) widened (#1910), their output moved, doc changed in place. */
export function widenJoins(doc, modules = {}) {
  const joins = doc.symbols.filter(s => s.type === 'busjoin');
  if (!joins.length) return doc;
  const others = pinsOfOthers(doc, modules, s => s.type === 'busjoin');
  for (const s of joins) {
    const def = symbolDef(s, {}), old = { ...def, w: JOIN_OLD_W }, o = def.pins.find(p => p.name === 'O');
    // placed so that its inputs stay where they were (its box grows on their other side, turned or mirrored)
    const a = xform(s, old, 0, 0), b = xform(s, def, 0, 0), before = xform(s, old, JOIN_OLD_W, o.y);
    s.x += a.x - b.x; s.y += a.y - b.y;
    follow(doc, before, xform(s, def, o.x, o.y), others, true);
  }
  return doc;
}

/** The multiplexers of doc (version 3) widened (#1136), doc changed in place (modules: the project's, normalized). */
export function widenMuxes(doc, modules = {}) {
  const muxes = doc.symbols.filter(s => MUX_INPUTS[s.type]);
  // (the pins of the other symbols, where a multiplexer's output met them directly)
  const others = muxes.length ? pinsOfOthers(doc, modules, s => MUX_INPUTS[s.type]) : new Set();
  for (const s of muxes) {
    const def = symbolDef(s, {}), k = Math.log2(MUX_INPUTS[s.type]), oldW = MUX_OLD_BODY_W(k);
    if (oldW === MUX_BODY_W(k)) continue;
    // the drawing of before: the same, its body narrower and its output nearer (its box narrower)
    const old = { ...def, w: oldW + 40 };
    const o = def.pins.find(p => p.name === 'O');
    // placed so that D0 stays where it was: every pin of the same local place stays (the same turn and mirror)
    const d0 = def.pins[0], a = xform(s, old, d0.x, d0.y), b = xform(s, def, d0.x, d0.y);
    const before = xform(s, old, oldW + 40, o.y);
    s.x += a.x - b.x; s.y += a.y - b.y;
    follow(doc, before, xform(s, def, o.x, o.y), others, (o.width || 1) > 1);
  }
  return doc;
}
