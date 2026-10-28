// Silinx ink - a combinational circuit drawn by hand read as a circuit (#1067). The gates are the large shapes (their
// height, Hg, the drawing's scale); the wires the long open strokes (a short straight one inside a gate's box, the
// back of an AND or of an OR, is the gate's); a small ring at a gate's tip inverts it; the rest are the names. A gate
// is recognized by its outline ($P, gates.js): AND, OR, XOR, a triangle (buffer); its inputs are the wires ending on
// its left side (from the top), its output the wire at its tip. Wires ending on another wire join it; a name at a
// wire's free end names its net: an input, or an output when a gate drives the net.
//
//   readSchematic(strokes, { templates }) -> { gates, nets, Hg, warnings, errors }; circuitErrors(circuit): with the names'
//     gates: [{ id, kind (and|or|xor|buf), inv, type (and2, nor3, inv, buf...), box, inputs: [net id], output: net id }]
//     nets: [{ id, name, dir: 'in' | 'out' | null, at: {x, y} (the named end), driver: gate id, sinks: [{ gate, pin }] }]
import { boxOf, InkError } from './segment.js';
import { classify } from './pdollar.js';
import { gateTemplates } from './gates.js';
import { builtinTemplates } from './templates.js';
import { recognizeWords } from './expression.js';
import { findFlipFlops, ffSymbol } from './flipflops.js';

const median = a => [...a].sort((x, y) => x - y)[a.length >> 1];
// the farthest a gate's template may be (held-out gates: 0.84 at most; letters: 1.5 and more, an o 0.9)
export const GATE_DISTANCE = 1.2;
const MAX_IN = { and: 5, or: 5, xor: 4 }, MAX_INV = { and: 4, or: 4, xor: 4 };
const NAME = { and: 'AND', or: 'OR', xor: 'XOR', buf: 'BUF' };
const NAME_INV = { and: 'NAND', or: 'NOR', xor: 'XNOR', buf: 'NOT' };
export const gateName = g => (g.kind === 'ff' ? g.type.toUpperCase() : (g.inv ? NAME_INV : NAME)[g.kind]);

// a stroke's measures: its box, length, how open it is (its ends apart over its length), how square (the part of it
// that runs level or upright, over steps of about a tenth of its box: a hand's wobble does not count)
function info(s, k) {
  let len = 0;
  for (let i = 1; i < s.length; i++) len += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
  const box = boxOf([s]), ends = Math.hypot(s.at(-1).x - s[0].x, s.at(-1).y - s[0].y);
  const step = 0.1 * Math.max(box.w, box.h, 1e-9);
  let sq = 0, all = 0, a = s[0];
  for (const p of s) {
    const dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy);
    if (d < step && p !== s.at(-1)) continue;
    all += d;
    if (Math.min(Math.abs(dx), Math.abs(dy)) <= 0.27 * Math.max(Math.abs(dx), Math.abs(dy))) sq += d;
    a = p;
  }
  return { s, k, box, len, open: len ? ends / len : 1, closed: ends <= 0.25 * Math.max(box.w, box.h, 1e-9), square: all ? sq / all : 1 };
}

const inside = (p, b, m) => p.x >= b.minX - m.l && p.x <= b.maxX + m.r && p.y >= b.minY - m.t && p.y <= b.maxY + m.t;
const near = (a, b, d) => Math.abs(a.x - b.x) <= d && Math.abs(a.y - b.y) <= d;
const touch = (a, b, m) => a.minX <= b.maxX + m && a.maxX >= b.minX - m && a.minY <= b.maxY + m && a.maxY >= b.minY - m;

// the strokes in groups that touch (with a margin)
function groups(items, m) {
  const out = [];
  for (const it of [...items].sort((a, b) => a.box.minX - b.box.minX)) {
    const hit = out.filter(g => touch(it.box, g.box, m));
    const g = hit[0] || { items: [], box: it.box };
    if (!hit.length) out.push(g);
    for (const o of hit.slice(1)) { g.items.push(...o.items); out.splice(out.indexOf(o), 1); }
    g.items.push(it);
    g.box = boxOf(g.items.map(i => i.s));
  }
  return out;
}

// the shapes: the gates (the lines of their outline, their bubble), the wires (square open strokes), the names' strokes;
// Hg: the gates' height (of the tallest groups of strokes that are not wires)
function shapes(items, minHg = 0) {
  // (a wire that goes round, back to the left of where it starts, #1083: its ends close, all of it square)
  const squareOpen = items.filter(i => (i.open >= 0.5 && i.square >= 0.75) || (i.square >= 0.8 && !i.closed));
  const others = items.filter(i => !squareOpen.includes(i));
  const big = Math.max(...others.map(i => Math.max(i.box.w, i.box.h)), 0);
  const blobs = groups(others, 0.1 * big);
  const tallest = Math.max(...blobs.map(b => b.box.h), 0);
  const Hg = Math.max(minHg, blobs.length ? median(blobs.map(b => b.box.h).filter(h => h >= 0.6 * tallest)) : Math.max(0, ...items.map(i => i.box.h)));
  // a gate: tall, with the square lines all in its box (its back, an AND's or a triangle's; an XOR's a little before
  // it), and shaped as one (a name's letter, even the tallest thing drawn, is not)
  const ring = (i, b) => i.closed && Math.hypot(i.box.w, i.box.h) < 0.45 * b.box.h && i.box.cx > b.box.minX + 0.6 * b.box.w;
  // (not a level line that starts well before it: an input's lead, run into the gate, #1750)
  const level = w => w.box.h <= 0.3 * w.box.w;
  const within = (w, b) => w.s.filter(p => inside(p, b, { l: 0.3 * Hg, r: 0.1 * Hg, t: 0.1 * Hg })).length >= 0.85 * w.s.length &&
    !(level(w) && w.box.minX < b.minX - 0.15 * Hg);
  const gates = [];
  for (const b of blobs.filter(x => x.box.h >= 0.6 * Hg)) {
    const lines = squareOpen.filter(w => within(w, b.box));
    const items = [...b.items, ...lines];
    if (classify(items.filter(i => !ring(i, b)).map(i => i.s), gateTemplates())[0].d > GATE_DISTANCE) continue;
    gates.push({ items, box: boxOf(items.map(i => i.s)) });
  }
  // the wires: the other square lines, longer than a name is tall, or a short level lead from a gate's left side or
  // from its tip (#1750: half a gate long)
  const lead = w => w.box.w >= 0.25 * Hg && level(w) && [w.s[0], w.s.at(-1)].some(e => gates.some(({ box: b }) =>
    e.y >= b.minY && e.y <= b.maxY && ((e.x >= b.minX - 0.15 * Hg && e.x <= b.minX + 0.3 * Hg) || (e.x >= b.maxX - 0.1 * Hg && e.x <= b.maxX + 0.35 * Hg && Math.abs(e.y - b.cy) <= 0.25 * Hg))));
  const wires = squareOpen.filter(w => !gates.some(g => g.items.includes(w)) && (Math.max(w.box.w, w.box.h) >= 0.7 * Hg || lead(w)));
  const rest = items.filter(i => !wires.includes(i) && !gates.some(g => g.items.includes(i)));
  // a small ring at a gate's tip (drawn touching it, or apart): an inversion
  for (const g of gates) {
    const ring = [...g.items, ...rest].find(r => r.closed && Math.hypot(r.box.w, r.box.h) < 0.45 * Hg && r.box.cx >= g.box.maxX - 0.3 * Hg &&
      r.box.cx <= g.box.maxX + 0.45 * Hg && Math.abs(r.box.cy - (g.box.minY + g.box.maxY) / 2) <= 0.3 * Hg);
    if (ring) {
      g.inv = ring;
      if (rest.includes(ring)) rest.splice(rest.indexOf(ring), 1); else g.items.splice(g.items.indexOf(ring), 1);
      g.box = boxOf(g.items.map(i => i.s));
    }
    g.body = g.box;
    g.tip = g.inv ? { x: g.inv.box.maxX, y: g.inv.box.cy } : { x: g.box.maxX, y: g.box.cy };
  }
  return { gates, wires, text: rest, Hg };
}

// the names: the strokes close together, each group read as one word; a stroke joins the word on its line (the
// centre of one in the other's height: not a name written under another, #1750: an AND2's A and B, a third of a gate
// apart), a flat one (a bar, a dot) also one just above or below it; the word it overlaps most
function names(text, Hg, templates) {
  const groups = [];
  const overlap = (t, x) => Math.min(t.box.maxY, x.box.maxY) - Math.max(t.box.minY, x.box.minY);
  const within = (y, b) => y >= b.minY && y <= b.maxY;
  const line = (t, x) => (Math.min(t.box.h, x.box.h) <= 0.15 * Hg ? overlap(t, x) >= -0.1 * Hg : within(t.box.cy, x.box) || within(x.box.cy, t.box));
  for (const t of [...text].sort((a, b) => a.box.minX - b.box.minX)) {
    const g = groups.filter(x => t.box.minX <= x.box.maxX + 0.35 * Hg && line(t, x)).sort((a, b) => overlap(t, b) - overlap(t, a))[0];
    if (g) { g.items.push(t); g.box = boxOf(g.items.map(i => i.s)); } else groups.push({ items: [t], box: t.box });
  }
  return groups.map(g => ({ text: recognizeWords(g.items.map(i => i.s), { templates, gap: 2 }).map(w => w.text).join(''), box: g.box }));
}

/** The errors of a circuit read (or as the user corrected its names): readSchematic's, then the names'. */
export function circuitErrors(circuit) {
  const errors = [...circuit.errors], seen = new Set();
  for (const n of circuit.nets) {
    if (!n.name) continue;
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(n.name)) errors.push(`'${n.name}' is not a name: correct it.`);
    else if (seen.has(n.name.toLowerCase())) errors.push(`The name ${n.name} is on two nets.`);
    seen.add(n.name.toLowerCase());
  }
  return errors;
}

export function readSchematic(strokes, { templates = builtinTemplates() } = {}) {
  const items = (strokes || []).filter(s => Array.isArray(s) && s.length).map(info);
  if (!items.length) throw new InkError('Nothing drawn: draw the circuit on the pad.');
  // the flip-flops first (#1083): their boxes and labels are not gates, wires or names
  const ffs = findFlipFlops(items, { templates }).map(f => ({ ...f, kind: 'ff', ins: [], drivers: new Map() }));
  const taken = new Set(ffs.flatMap(f => f.items));
  const { gates, wires, text, Hg } = shapes(items.filter(i => !taken.has(i)), ffs.length ? 0.75 * Math.min(...ffs.map(f => f.box.h)) : 0);
  if (!gates.length && !ffs.length) throw new InkError('No gate found: draw the gates larger than the names, their inputs on the left.');
  const words = names(text, Hg, templates);
  const warnings = [], errors = [];
  // (numbered by columns, half a gate wide, then from the top)
  const col = g => Math.round(g.box.minX / (0.5 * Hg));
  const parts = [...gates, ...ffs].sort((a, b) => col(a) - col(b) || a.box.minY - b.box.minY);
  parts.forEach((g, i) => { g.id = `U${i + 1}`; });
  gates.forEach(g => {
    g.kind = classify(g.items.filter(x => x !== g.inv).map(x => x.s), gateTemplates())[0].ch;
    g.inv = !!g.inv;
    g.ins = [];
  });
  // a flip-flop's output: Q or Q̄, by the label beside the wire's end
  const ffOut = (f, y) => {
    const label = f.right.length ? f.right.reduce((a, b) => (Math.abs(b.y - y) < Math.abs(a.y - y) ? b : a)).label : 'Q';
    if (!f.drivers.has(label)) f.drivers.set(label, { id: f.id, pin: label, ff: f, tip: { x: f.box.maxX, y } });
    return f.drivers.get(label);
  };
  // what each end of a wire touches: a gate's tip or its left side, a name, another wire
  const parent = wires.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const ends = [];
  let loose = 0;
  const dBox = (e, b) => Math.hypot(Math.max(b.minX - e.x, 0, e.x - b.maxX), Math.max(b.minY - e.y, 0, e.y - b.maxY));
  wires.forEach((w, wi) => {
    for (const [e, o] of [[w.s[0], w.s.at(-1)], [w.s.at(-1), w.s[0]]]) {
      // (a gate's input: the end nearer its left side, a short lead's other end being near it too)
      const onLeft = (g, p) => p.x >= g.body.minX - 0.4 * Hg && p.x <= g.body.minX + 0.3 * Hg && p.y >= g.body.minY - 0.05 * Hg && p.y <= g.body.maxY + 0.05 * Hg;
      const options = [
        ...gates.filter(g => near(e, g.tip, 0.35 * Hg)).map(g => ({ d: Math.hypot(e.x - g.tip.x, e.y - g.tip.y), f: () => ends.push({ wi, out: g }) })),
        ...gates.filter(g => onLeft(g, e) && !(onLeft(g, o) && Math.abs(o.x - g.body.minX) < Math.abs(e.x - g.body.minX)))
          .map(g => ({ d: Math.abs(e.x - g.body.minX), f: () => g.ins.push({ wi, y: e.y }) })),
        ...ffs.filter(f => e.y >= f.box.minY && e.y <= f.box.maxY && e.x >= f.box.minX - 0.4 * Hg && e.x <= f.box.minX + 0.15 * Hg)
          .map(f => ({ d: Math.abs(e.x - f.box.minX), f: () => f.ins.push({ wi, y: e.y }) })),
        ...ffs.filter(f => e.y >= f.box.minY && e.y <= f.box.maxY && e.x >= f.box.maxX - 0.15 * Hg && e.x <= f.box.maxX + 0.4 * Hg)
          .map(f => ({ d: Math.abs(e.x - f.box.maxX), f: () => ends.push({ wi, out: ffOut(f, e.y) }) })),
        ...words.filter(t => dBox(e, t.box) <= 0.5 * Hg).map(t => ({ d: dBox(e, t.box), word: true, f: () => { ends.push({ wi, word: t, at: e }); t.used = true; } })),
      ].sort((a, b) => a.d - b.d);
      // (a pin first; then a wire it ends on, a T junction even beside a name; then a name)
      const pin = options.find(o => !o.word);
      if (pin) { pin.f(); continue; }
      const other = wires.findIndex((o, oi) => oi !== wi && o.s.some(p => near(p, e, 0.12 * Hg)));
      if (other >= 0) { parent[find(wi)] = find(other); continue; }
      if (options.length) { options[0].f(); continue; }
      loose++;
    }
  });
  // (two wires from one output: one net)
  const fromOut = new Map();
  for (const e of ends) if (e.out) { if (fromOut.has(e.out)) parent[find(e.wi)] = find(fromOut.get(e.out)); else fromOut.set(e.out, e.wi); }
  // the nets
  const byRoot = new Map();
  const netOf = wi => { const r = find(wi); if (!byRoot.has(r)) byRoot.set(r, { id: `n${byRoot.size + 1}`, name: null, dir: null, driver: null, drivers: new Set(), sinks: [], names: [] }); return byRoot.get(r); };
  for (const e of ends) {
    const n = netOf(e.wi);
    if (e.out) { if (n.driver && n.driver !== e.out) errors.push(`Two gate outputs are joined (${n.driver.id}, ${e.out.id}).`); else n.driver = e.out; n.drivers.add(e.out); }
    if (e.word) n.names.push(e);
  }
  for (const g of gates) {
    g.ins.sort((a, b) => a.y - b.y);
    g.inputs = g.ins.map(x => netOf(x.wi));
    g.inputs.forEach((n, k) => n.sinks.push({ gate: g, pin: k }));
    const outs = [...byRoot.values()].filter(n => n.drivers.has(g));
    g.output = outs[0] || null;
    const n = g.inputs.length, label = `${g.id} (${gateName(g)})`;
    if (!g.output) errors.push(`${label}: no wire from its output.`);
    if (g.kind === 'buf') {
      if (n !== 1) errors.push(`${label}: ${n} inputs, 1 expected.`);
      g.type = g.inv ? 'inv' : 'buf';
    } else {
      const max = (g.inv ? MAX_INV : MAX_IN)[g.kind];
      if (n < 2 || n > max) errors.push(`${label}: ${n} input${n === 1 ? '' : 's'}, 2 to ${max} expected.`);
      g.type = `${g.inv ? { and: 'nand', or: 'nor', xor: 'xnor' }[g.kind] : g.kind}${n}`;
    }
  }
  // the flip-flops' pins: each wire on the left to the label beside it
  for (const f of ffs) {
    const pins = {}, label = `${f.id} (flip-flop)`;
    for (const u of f.unknown) errors.push(`${label}: '${u.text}' is not one of its pins (D, T, J, K, C, CE, CLR, PRE, R, S; Q, Q̄).`);
    // (a label not known keeps its wire: its error is said)
    const beside = [...f.left, ...f.unknown.filter(u => u.side === 'left')];
    for (const x of f.ins) {
      if (!beside.length) break;
      const l = beside.reduce((a, b) => (Math.abs(b.y - x.y) < Math.abs(a.y - x.y) ? b : a)).label;
      if (!l) continue;
      if (pins[l]) errors.push(`${label}: two wires to ${l}.`); else pins[l] = netOf(x.wi);
    }
    for (const l of f.left) if (!pins[l.label]) errors.push(`${label}: no wire to ${l.label}.`);
    const sym = ffSymbol(f.left.map(l => l.label));
    if (sym.error) errors.push(`${label}: ${sym.error}.`);
    f.type = sym.type || 'fd';
    f.ffKind = sym.kind;
    f.pins = pins;
    Object.entries(pins).forEach(([pin, n]) => n.sinks.push({ gate: f, pin }));
    f.outputs = Object.fromEntries([...f.drivers.keys()].map(k => [k, [...byRoot.values()].find(n => n.drivers.has(f.drivers.get(k)))]).filter(([, n]) => n));
    if (!Object.keys(f.outputs).length) errors.push(`${label}: no wire from its outputs.`);
  }
  // the names: an input's (no gate drives it), an output's
  let outs = 0;
  for (const n of byRoot.values()) {
    const [first, ...more] = n.names;
    if (more.length) errors.push(`Two names on one net: ${n.names.map(x => x.word.text).join(', ')}.`);
    if (first) { n.name = first.word.text; n.at = first.at; }
    if (n.driver) {
      if (n.name) n.dir = 'out';
      else if (!n.sinks.length) { n.name = `out${++outs}`; n.dir = 'out'; n.at = n.driver.tip; warnings.push(`The output of ${n.driver.id} has no name: ${n.name}.`); }
    } else if (n.name) n.dir = 'in';
    else errors.push(`A wire to ${n.sinks.map(s => s.gate.id).join(', ') || 'nothing'} starts at no output and no name: write the input's name at its end.`);
  }
  for (const w of words) if (!w.used) warnings.push(`The name ${w.text} is at no wire's end.`);
  if (loose) warnings.push(`${loose === 1 ? 'A wire end touches' : `${loose} wire ends touch`} nothing.`);
  const nets = [...byRoot.values()].map(n => ({ id: n.id, name: n.name, dir: n.dir, at: n.at ? { x: n.at.x, y: n.at.y } : null,
    driver: n.driver?.id ?? null, ...(n.driver?.pin ? { driverPin: n.driver.pin } : {}), sinks: n.sinks.map(k => ({ gate: k.gate.id, pin: k.pin })) }));
  const out = g => (g.kind === 'ff'
    ? { id: g.id, kind: 'ff', ffKind: g.ffKind, type: g.type, box: g.box, pins: Object.fromEntries(Object.entries(g.pins).map(([k, n]) => [k, n.id])),
      outputs: Object.fromEntries(Object.entries(g.outputs).map(([k, n]) => [k, n.id])), inputs: Object.values(g.pins).map(n => n.id), output: g.outputs.Q?.id ?? g.outputs.QN?.id ?? null }
    : { id: g.id, kind: g.kind, inv: g.inv, type: g.type, box: g.body, inputs: g.inputs.map(n => n.id), output: g.output?.id ?? null });
  return { gates: parts.map(out), nets, Hg, warnings, errors };
}
