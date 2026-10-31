// The templates of the Schematic Wizard of New Source (#2180; their list and parameters: core/chart-templates.js): a
// template and its parameters give the ports (the wizard's table: each one has its role, the name it has in the
// template, so that it can be renamed) and, at the end, the schematic: the editor's symbols placed and wired to the
// I/O markers. The table can rename the template's ports and add others (a marker with no wire yet); their directions
// and widths are the parameters' (a wire of another width would be an error of the schematic). Isomorphic (no DOM).
import { newDoc, normalizeDoc, portBox, symbolDef, symbolPins, joinOnWires, ffVariant, r10, snap } from './schdoc.js';
import { checkPorts } from './modgen.js';
import { CIRCUITS } from './sch-circuits.js';

const IN = 'in', OUT = 'out';
const port = (role, dir, width = 1) => ({ role, name: role, dir, width });
const yes = v => v === 'yes';

// the flip-flops' / the counter's control inputs a template asks for: { role, pin }
const controls = ({ en, reset }, clear = 'CLR') => [
  ...(yes(en) ? [['ce', 'CE']] : []), ['clk', 'C'],
  ...(reset === 'async' ? [['rst', clear]] : reset === 'sync' ? [['rst', 'R']] : []),
];
const ffType = ({ en, reset }) => ffVariant('fd', { ce: yes(en), clr: reset === 'async', r: reset === 'sync' });

// a template of one symbol: { sym: { type, params }, west, east: [[role, pin]], ports }
function oneSymbol(id, p) {
  const n = Number(p.n);
  switch (id) {
    case 'register': {
      const c = controls(p);
      return { sym: { type: ffType(p), params: { width: n } }, west: [['d', 'D'], ...c], east: [['q', 'Q']],
        ports: [port('d', IN, n), ...c.map(([r]) => port(r, IN)), port('q', OUT, n)] };
    }
    case 'counter': {
      const c = controls(p);
      return { sym: { type: 'counter', params: { width: n, en: yes(p.en), reset: p.reset, dir: p.dir, bits: false } }, west: c, east: [['q', 'Q']],
        ports: [...c.map(([r]) => port(r, IN)), port('q', OUT, n)] };
    }
    default: return null;
  }
}

/** The ports of a template, as the wizard's table shows them: [{ role, name, dir, width }] (none: the empty one). */
export function schematicTemplatePorts(id, params = {}) {
  if (id === 'shift') { const c = controls(params); return [port('si', IN), ...c.map(([r]) => port(r, IN)), port('q', OUT, Number(params.n))]; }
  if (CIRCUITS[id]) return CIRCUITS[id].ports(params);
  if (id === 'fulladder') return [port('a', IN), port('b', IN), port('ci', IN), port('s', OUT), port('co', OUT)];
  return oneSymbol(id, params)?.ports || [];
}

/** Why the table `ports` cannot be drawn with the template (one of its ports removed, or another direction or width), or null. */
export function templatePortsError(id, params, ports) {
  for (const t of schematicTemplatePorts(id, params)) {
    const row = ports.find(p => p.role === t.role);
    if (!row) return `The template's port '${t.name}' was removed: put it back, or choose another template or parameters on the Template page.`;
    if (row.dir !== t.dir || +row.width !== t.width) return `The port '${row.name}' is wired by the template, with its direction and width: change them on the Template page, or in the schematic editor after creating it.`;
  }
  return null;
}

const STEP = 40, GAP = 20, MARGIN = 40;

// the drawing being made: its symbols, wires and markers
function sheet(doc, names, ins) {
  const inW = Math.max(60, ...ins.map(p => portBox({ ...p, x: 0, y: 0 }).w));
  return {
    xIn: r10(MARGIN + inW),
    sym(type, params, x, y) {
      const s = { id: `S${doc.symbols.length + 1}`, type, x, y, rot: 0, mirror: false, name: `XLXI_${doc.symbols.length + 1}`, params };
      doc.symbols.push(s);
      const pins = symbolPins(s);
      return { s, def: symbolDef(s), pin: n => { const q = pins.find(x => x.name === n); return { x: q.x, y: q.y }; } };
    },
    wire(...pts) {
      const points = pts.filter((q, i) => !i || q.x !== pts[i - 1].x || q.y !== pts[i - 1].y);
      if (points.length > 1) doc.wires.push({ id: `W${doc.wires.length + 1}`, points });
    },
    marker(role, dir, width, x, y) {
      const row = names(role);
      doc.ports.push({ id: `P${doc.ports.length + 1}`, name: row.name, dir, width, x, y });
    },
  };
}

// the pins of one side, each to its marker in a column: the markers STEP apart around the pins' middle; each wire goes
// along its marker's row and its pin's, joined in a channel of its own (the outermost next to the symbol: no crossings)
function fan(d, items, dir, xEdge, xMarker, sign, widths) {
  const mid = items.reduce((a, q) => a + q.pin.y, 0) / items.length, n = items.length;
  items.forEach((q, i) => {
    const y = snap(mid + (i - (n - 1) / 2) * STEP), rank = Math.min(i, n - 1 - i);
    const xc = xEdge + sign * GAP * (rank + 1);
    d.marker(q.role, dir, widths[q.role], xMarker, y);
    d.wire({ x: xMarker, y }, { x: xc, y }, { x: xc, y: q.pin.y }, q.pin);
  });
  return snap(mid + ((n - 1) / 2) * STEP);
}

function drawOne(d, spec, top) {
  const widths = Object.fromEntries(spec.ports.map(p => [p.role, p.width]));
  const channels = n => GAP * (Math.ceil(n / 2) + 1);
  const west = spec.west, east = spec.east;
  const x = d.xIn + channels(west.length) + MARGIN;
  const def = symbolDef({ ...spec.sym, x: 0, y: 0, rot: 0, mirror: false });
  // (down far enough for the markers above the pins' middle)
  const ys = side => side.map(([, pn]) => def.pins.find(q => q.name === pn).y);
  const above = side => { const v = ys(side); return v.reduce((a, b) => a + b, 0) / v.length - ((side.length - 1) / 2) * STEP; };
  const y = r10(top - Math.min(0, above(west), above(east)));
  const S = d.sym(spec.sym.type, spec.sym.params, x, y);
  const items = side => side.map(([role, pn]) => ({ role, pin: S.pin(pn) }));
  let low = fan(d, items(west), IN, x, d.xIn, -1, widths);
  const xEnd = x + def.w;
  const xOut = xEnd + channels(east.length) + MARGIN;
  low = Math.max(low, fan(d, items(east), OUT, xEnd, xOut, 1, widths));
  return low;
}

// the shift register: a register of N bits, its D the bus join of its own Q(N-2:0) and the serial input
function drawShift(d, p, top) {
  const n = Number(p.n), c = controls(p), rows = c.length;
  const jx = d.xIn + 180, jy = top + 40, fx = jx + 60 + GAP * (rows + 2), fy = jy + 10;
  const J = d.sym('busjoin', { widths: `${n - 1},1` }, jx, jy);
  const T = d.sym('slice', { msb: n - 2, lsb: 0 }, jx - 80, jy);
  const F = d.sym(ffType(p), { width: n }, fx, fy);
  const q = F.pin('Q'), xt = q.x + 40, xOut = xt + 100;
  d.marker('si', IN, 1, d.xIn, J.pin('I1').y);
  d.wire({ x: d.xIn, y: J.pin('I1').y }, J.pin('I1'));
  d.wire(T.pin('O'), J.pin('I0'));
  d.wire(J.pin('O'), F.pin('D'));
  d.marker('q', OUT, n, xOut, q.y);
  d.wire(q, { x: xt, y: q.y }, { x: xOut, y: q.y });
  d.wire({ x: xt, y: q.y }, { x: xt, y: top }, { x: T.pin('I').x, y: top }, T.pin('I'));
  let low = J.pin('I1').y;
  c.forEach(([role, pn], i) => {
    const pin = F.pin(pn), y = r10(fy + F.def.h + GAP + STEP * i), xc = fx - GAP * (rows - i);
    d.marker(role, IN, 1, d.xIn, y);
    d.wire({ x: d.xIn, y }, { x: xc, y }, { x: xc, y: pin.y }, pin);
    low = y;
  });
  return low;
}

// the full adder: two half adders (XOR, AND) and an OR
function drawFullAdder(d, top) {
  const gx = d.xIn + 100, hx = gx + 180, ox = hx + 160, xOut = ox + 200, y0 = top;
  const G = (type, x, y) => d.sym(type, { width: 1, bits: false }, x, y);
  const x1 = G('xor2', gx, y0), a1 = G('and2', gx, y0 + 200), x2 = G('xor2', hx, y0 + 10), a2 = G('and2', hx, y0 + 120), o1 = G('or2', ox, y0 + 130);
  const pa = x1.pin('I0'), pb = x1.pin('I1');
  // a and b: to the XOR, and down to the AND
  d.marker('a', IN, 1, d.xIn, pa.y);
  d.wire({ x: d.xIn, y: pa.y }, { x: gx - 40, y: pa.y }, pa);
  d.wire({ x: gx - 40, y: pa.y }, { x: gx - 40, y: a1.pin('I0').y }, a1.pin('I0'));
  d.marker('b', IN, 1, d.xIn, pb.y);
  d.wire({ x: d.xIn, y: pb.y }, { x: gx - 60, y: pb.y }, pb);
  d.wire({ x: gx - 60, y: pb.y }, { x: gx - 60, y: a1.pin('I1').y }, a1.pin('I1'));
  // a xor b: to the second XOR, and down to the second AND
  const xo = x1.pin('O'), tx = hx - 80;
  d.wire(xo, { x: tx, y: xo.y }, x2.pin('I0'));
  d.wire({ x: tx, y: xo.y }, { x: tx, y: a2.pin('I0').y }, a2.pin('I0'));
  // the carry in: from below, up to the second XOR and the second AND
  const tc = hx - 40, yc = y0 + 300;
  d.marker('ci', IN, 1, d.xIn, yc);
  d.wire({ x: d.xIn, y: yc }, { x: tc, y: yc }, { x: tc, y: a2.pin('I1').y }, a2.pin('I1'));
  d.wire({ x: tc, y: a2.pin('I1').y }, { x: tc, y: x2.pin('I1').y }, x2.pin('I1'));
  // the sum and the carry out
  d.marker('s', OUT, 1, xOut, x2.pin('O').y);
  d.wire(x2.pin('O'), { x: xOut, y: x2.pin('O').y });
  d.wire(a2.pin('O'), o1.pin('I0'));
  d.wire(a1.pin('O'), { x: hx + 120, y: a1.pin('O').y }, { x: hx + 120, y: o1.pin('I1').y }, o1.pin('I1'));
  d.marker('co', OUT, 1, xOut, o1.pin('O').y);
  d.wire(o1.pin('O'), { x: xOut, y: o1.pin('O').y });
  return yc;
}

/**
 * The schematic of a template: { name, lang, description, id, params, ports } (ports: the wizard's table, by default
 * the template's; a row with no role is a port added to it: its marker is placed, not wired).
 */
export function schematicFromTemplate({ name, lang = 'vhdl', description = '', id, params = {}, ports = null }) {
  const rows = ports || schematicTemplatePorts(id, params);
  const err = checkPorts(rows.map(p => ({ ...p, width: +p.width })), { lang, name }) || templatePortsError(id, params, rows);
  if (err) throw new Error(err);
  const doc = newDoc(String(name).trim(), lang);
  const desc = String(description ?? '').trim();
  if (desc) doc.description = desc;
  const d = sheet(doc, role => rows.find(p => p.role === role), rows.filter(p => p.dir === IN));
  const top = desc ? 160 : 120;
  const one = oneSymbol(id, params);
  let low = one ? drawOne(d, one, top) : CIRCUITS[id] ? CIRCUITS[id].draw(d, params, top) : id === 'shift' ? drawShift(d, params, top) : drawFullAdder(d, top);
  // the ports added to the table: under the others, their markers only
  const xIn = d.xIn, xOut = Math.max(...doc.ports.filter(p => p.dir !== IN).map(p => p.x));
  const extraIn = rows.filter(p => !p.role && p.dir === IN), extraOut = rows.filter(p => !p.role && p.dir !== IN);
  [[extraIn, xIn], [extraOut, xOut]].forEach(([list, x]) => list.forEach((p, i) => {
    doc.ports.push({ id: `P${doc.ports.length + 1}`, name: p.name, dir: p.dir, width: +p.width, x, y: r10(low + STEP * (i + 1)) });
  }));
  low += STEP * Math.max(extraIn.length, extraOut.length);
  doc.sheet.h = Math.max(doc.sheet.h, r10(low + 140));
  joinOnWires(doc);
  return normalizeDoc(doc);
}
