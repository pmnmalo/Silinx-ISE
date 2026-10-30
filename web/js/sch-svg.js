// The schematic's drawing in SVG (#405: out of sch-editor.js): a symbol in its local coordinates (its body, pins,
// texts), placed and turned (symbolSvg), alone as in its datasheet (symbolDrawingSvg); an I/O marker; a wire's hops
// over the wires it crosses (#692) and its runs in line (#678). Plain functions of the document, no editor state.
import { symbolBox, symbolPins, xform, portBox, portSide, symbolTypeName } from '/core/schdoc.js';
import { esc } from './dom.js';

export const SVGNS = 'http://www.w3.org/2000/svg';
export const r1 = v => Math.round(v * 10) / 10;

// ------------------------------------------------------------------ symbol drawing (local coordinates)
function lead(x1, y1, x2, y2, bus) { return `<line class="pin${bus ? ' bus' : ''}" x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}"/>`; }

// a gate's input lead ends at its body: the AND's straight back (x 20), the OR's / XOR's curved one
function gateInputEnd(def, y) {
  const gh = def.gh || def.h, base = def.gate.replace(/^n(?=and|or)/, '').replace(/^xn/, 'x'), t = (y % gh) / gh;   // (a gate a bit: its own, #2079)
  return base === 'or' ? 20 + 24 * t * (1 - t) : base === 'xor' ? 14 + 24 * t * (1 - t) : 20;
}

// a multiplexer's / demultiplexer's enable with a pin per bit (#2081): its pin on the last row, a line at x = 10 up to
// the first row's, a lead and a dot into each row's body at its E row
function muxEnable(p, bh, n) {
  const ys = [...Array(n).keys()].map(r => p.y - (n - 1 - r) * bh);
  return lead(0, p.y, 10, p.y, false) + `<path class="gate nofill" d="M10,${ys[0]} V${p.y}"/>`
    + ys.map(y => lead(10, y, 20, y, false) + (y !== p.y ? `<circle class="gate pdot" cx="10" cy="${y}" r="2"/>` : '')).join('');
}

export function bodySvg(sym, def) {
  const pins = def.pins;
  const bus = p => (p.width || 1) > 1;
  let s = '';
  const h = def.h;
  switch (def.shape) {
    case 'gate': {
      const g = def.gate;
      const base = g.replace(/^n(?=and|or)/, '').replace(/^xn/, 'x');
      const isOr = base === 'or' || base === 'xor';
      // (a gate a row with Pins per bit, #2079: each drawn in its own band of gh)
      const gh = def.gh || h;
      for (let r = 0; r < (def.rows || 1); r++) {
        // (each row's top, middle and bottom: numbers, #1443)
        const yt = r1(r * gh), ym = r1(r * gh + gh / 2), yb = r1(r * gh + gh);
        if (!isOr) s += `<path class="gate" d="M20,${+yt} H40 A20,${gh / 2} 0 0 1 40,${+yb} H20 Z"/>`;
        else {
          s += `<path class="gate" d="M20,${+yt} Q48,${+yt} 60,${+ym} Q48,${+yb} 20,${+yb} Q32,${+ym} 20,${+yt} Z"/>`;
          if (base === 'xor') s += `<path class="gate nofill" d="M14,${+yb} Q26,${+ym} 14,${+yt}"/>`;
        }
        if (def.bubble) s += `<circle class="gate" cx="63" cy="${+ym}" r="3"/>`;
      }
      for (const p of pins) {
        if (p.dir === 'out') {
          const x0 = def.bubble ? 66 : 60;
          s += lead(x0, p.y, p.x, p.y, bus(p));
        } else {
          const xe = gateInputEnd(def, p.y);
          if (p.inv) {
            // inverted input (ANDnBk...): bubble between the pin lead and the body, as ISE draws it
            s += lead(0, p.y, xe - 8, p.y, bus(p)) + `<circle class="gate bubble" cx="${r1(xe - 4)}" cy="${p.y}" r="4"/>`;
          } else s += lead(0, p.y, xe, p.y, bus(p));
        }
      }
      break;
    }
    case 'inv': case 'buf': {
      // (the triangle to x = 20 + its body's width (INV's 54, its bubble to 60; BUF's 60, #2068), the output's lead from
      // there to 80: #1988; a row each with Pins per bit, #2067)
      const n = def.rows || 1, tip = 20 + def.body.w;
      for (let k = 0; k < n; k++) {
        const y = 20 * k;
        s += `<path class="gate" d="M20,${y} L${tip},${y + 10} L20,${y + 20} Z"/>`;
        if (def.shape === 'inv') s += `<circle class="gate" cx="${tip + 3}" cy="${y + 10}" r="3"/>`;
        s += lead(0, y + 10, 20, y + 10, bus(pins[k])) + lead(def.shape === 'inv' ? tip + 6 : tip, y + 10, 80, y + 10, bus(pins[n + k]));
      }
      break;
    }
    case 'tbuf': {
      // tri-state buffer: one triangle per row, the enable line from the pin (row 0) down to their top
      // edges (x = 38), a bubble on it for the active-low T of BUFT; the triangles 40 long, to x = 60 (#1988, #2068)
      const n = def.rows, ex = 38, edge = k => 20 + 20 * k + (ex - 20) * 10 / 40;
      s += lead(0, 10, ex, 10, false) + `<path class="gate nofill" d="M${ex},10 V${r1(edge(n - 1))}"/>`;
      for (let k = 0; k < n; k++) {
        const y = 30 + 20 * k, ip = pins[1 + k], op = pins[1 + n + k];
        s += `<path class="gate" d="M20,${y - 10} L60,${y} L20,${y + 10} Z"/>` + lead(0, y, 20, y, bus(ip)) + lead(60, y, 80, y, bus(op));
      }
      if (def.activeLow) s += `<circle class="gate" cx="${ex}" cy="${r1(edge(0) - 3.5)}" r="3"/>`;
      break;
    }
    case 'mux': {
      // (Pins per bit, #2081: a trapezoid a row, rh high; the select lines from their pins up to the first one's bottom
      // edge, through the others, and the enable's on the left joining each row's E, as BUFE4's enable line)
      const n = def.rows || 1, bh = def.rh || def.body.h, bw = def.body.w, x1 = 20 + bw, last = (n - 1) * bh;
      for (let r = 0; r < n; r++) s += `<path class="gate" d="M20,${r * bh} L${x1},${r * bh + 10} L${x1},${r * bh + bh - 10} L20,${r * bh + bh} Z"/>`;
      for (const p of pins) {
        if (p.side === 'W' && p.name === 'E' && n > 1) s += muxEnable(p, bh, n);
        else if (p.side === 'W') s += lead(0, p.y, 20, p.y, bus(p));
        else if (p.side === 'S') s += lead(p.x, r1(last + bh - 10 * (p.x - 20) / bw), p.x, p.y, bus(p)) + (n > 1 ? `<path class="gate nofill" d="M${p.x},${r1(bh - 10 * (p.x - 20) / bw)} V${r1(last + bh - 10 * (p.x - 20) / bw)}"/>` : '');   // (from the slanted bottom edge)
        else s += lead(x1, p.y, p.x, p.y, bus(p));
      }
      break;
    }
    case 'demux': {
      const b = def.body, n = def.rows || 1, bh = def.rh || b.h, x1 = b.x + b.w, last = (n - 1) * bh;
      for (let r = 0; r < n; r++) s += `<path class="gate" d="M${b.x},${r * bh + 20} L${x1},${r * bh} L${x1},${r * bh + bh} L${b.x},${r * bh + bh - 20} Z"/>`;
      for (const p of pins) {
        if (p.side === 'W' && p.name === 'E' && n > 1) s += muxEnable(p, bh, n);
        else if (p.side === 'W') s += lead(0, p.y, b.x, p.y, bus(p));
        else if (p.side === 'S') s += lead(p.x, last + bh - 20 + 20 * (p.x - b.x) / b.w, p.x, p.y, bus(p)) + (n > 1 ? `<path class="gate nofill" d="M${p.x},${r1(bh - 20 + 20 * (p.x - b.x) / b.w)} V${r1(last + bh - 20 + 20 * (p.x - b.x) / b.w)}"/>` : '');
        else s += lead(x1, p.y, p.x, p.y, bus(p));
      }
      break;
    }
    case 'lib': {
      const b = def.body;
      s += `<rect class="gate" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/>`;
      for (const p of pins) {
        s += p.side === 'W' ? lead(0, p.y, b.x, p.y, bus(p)) : lead(b.x + b.w, p.y, p.x, p.y, bus(p));
        // (a device primitive's clock: its triangle, as the flip-flops' and the modules', #1135)
        if (p.clock) s += p.side === 'W' ? `<path class="clk" d="M${b.x},${p.y - 5} L${b.x + 8},${p.y} L${b.x},${p.y + 5}"/>`
          : `<path class="clk" d="M${b.x + b.w},${p.y - 5} L${b.x + b.w - 8},${p.y} L${b.x + b.w},${p.y + 5}"/>`;
      }
      break;
    }
    case 'arith': {
      // ADD and SUB in the adder's usual shape (#1138): narrower on the result's side, notched between the operands
      // A and B (y 10 and 30); COMP a box
      if (sym.type === 'add' || sym.type === 'sub') s += `<path class="gate" d="M20,0 L60,8 L60,${h - 8} L20,${h} L20,25 L27,20 L20,15 Z"/>`;
      else s += `<rect class="gate" x="20" y="0" width="40" height="${h}"/>`;
      for (const p of pins) s += p.side === 'W' ? lead(0, p.y, 20, p.y, bus(p)) : lead(60, p.y, p.x, p.y, bus(p));
      break;
    }
    case 'ff': {
      s += `<rect class="gate" x="20" y="0" width="50" height="${h}"/>`;
      for (const p of pins) {
        if (p.side === 'W') { s += lead(0, p.y, 20, p.y, bus(p)); if (p.clock) s += `<path class="clk" d="M20,${p.y - 5} L28,${p.y} L20,${p.y + 5}"/>`; }
        else s += lead(70, p.y, p.x, p.y, bus(p));
      }
      break;
    }
    case 'slice': {
      // as ISE draws a bus tap (#1726): a diagonal entry from the bus (its input) to the line of the bit(s) taken, their
      // wire (the output) from there
      s += lead(0, 0, 10, 10, true) + lead(10, 10, 40, 10, (pins[1].width || 1) > 1);
      break;
    }
    case 'join': {
      const b = def.body.x;
      s += `<rect class="ripper" x="${b}" y="0" width="4" height="${h}"/>`;
      for (const p of pins) s += p.side === 'W' ? lead(0, p.y, b, p.y, bus(p)) : lead(b + 4, p.y, p.x, p.y, true);
      break;
    }
    case 'const': {
      s += `<rect class="cbox" x="0" y="2" width="${def.w - 20}" height="16" rx="2"/>` + lead(def.w - 20, 10, def.w, 10, bus(pins[0]));
      break;
    }
    // (their stem their pin's lead: a bus when it is wider than 1 bit, as every symbol's pins, #1122)
    case 'vcc': s += `<path class="gate nofill" d="M2,10 H18"/>` + lead(10, 10, 10, 30, bus(pins[0])); break;
    case 'gnd': s += lead(10, 0, 10, 20, bus(pins[0])) + `<path class="gate nofill" d="M1,20 H19 M4,24 H16 M7,28 H13"/>`; break;
    case 'module': case 'hdl': default: {
      const b = def.body;
      s += `<rect class="box${def.shape === 'hdl' ? ' hdl' : ''}${def.missing ? ' missing' : ''}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/>`;
      for (const p of pins) {
        s += p.side === 'W' ? lead(0, p.y, b.x, p.y, bus(p)) : lead(b.x + b.w, p.y, p.x, p.y, bus(p));
        if (p.clock) s += `<path class="clk" d="M${b.x},${p.y - 5} L${b.x + 8},${p.y} L${b.x},${p.y + 5}"/>`;
      }
    }
  }
  return s;
}

// readable texts, positioned in sheet coordinates
// the width of a bus pin on its lead, 10 px in from its end, upright, the lead broken under it (its halo): inside the
// symbol's box in every orientation (#1139, #1174)
// (d px in: a gate's inverted input, the middle of its lead, clear of its bubble, #1486)
function pinWidth(p, d = 10) {
  const v = { W: [1, 0], E: [-1, 0], N: [0, 1], S: [0, -1] }[p.side];
  return `<text class="pwidth on" x="${r1(p.x + d * v[0])}" y="${r1(p.y + d * v[1] + 3)}" text-anchor="middle">${esc(p.width)}</text>`;
}
// the symbol's type under it (above it turned 180°, beside it turned 90° / 270°), as ISE draws it (#172)
function typeUnder(sym, def, box, center, name) {
  const t = xform(sym, def, def.body.x + def.body.w / 2, def.h);
  const turned = sym.rot === 90 || sym.rot === 270;
  return `<text class="stype" x="${turned ? box.x + box.w + 3 : t.x}" y="${turned ? center.y + 3 : (sym.rot === 180 ? box.y - 3 : box.y + box.h + 10)}" text-anchor="${turned ? 'start' : 'middle'}">${esc(name)}</text>`;
}
// the symbol's type inside its body (AND2, INV, M2_1…), as ISE's symbols have it (#2041): at the body's centre, upright;
// 8 px bold, about 5.5 px a character, squeezed to the body's width when a little longer. A triangle (INV, BUF, BUFE /
// BUFT's first) has room for it only near its base, its first 55 %, and only upright, 7 px there (4.8 px a character). Null when it does
// not fit (the caller draws it under). With Pins per bit, in each row's shape, as the one-bit symbol's (#2122)
function typeInside(sym, def, name) {
  const turned = sym.rot === 90 || sym.rot === 270, tri = def.shape === 'inv' || def.shape === 'buf' || def.shape === 'tbuf';
  if (tri && turned) return null;
  // (a row's height: a gate's gh, a multiplexer's rh, a triangle's 20)
  const n = def.rows || 1, pitch = def.gh || def.rh || def.body.h / n;
  const room = tri ? def.body.w * 0.55 - 1 : (turned ? pitch : def.body.w) - 6, need = name.length * (tri ? 4.8 : 5.5);
  if (need > room * 1.3) return null;
  let s = '';
  for (let r = 0; r < n; r++) {
    const c = xform(sym, def, def.body.x + (tri ? room / 2 + 1 : def.body.w / 2), def.body.y + r * pitch + pitch / 2);
    s += `<text class="stype inside${tri ? ' tri' : ''}" x="${r1(c.x)}" y="${r1(c.y + 3)}" text-anchor="middle"${need > room ? ` textLength="${r1(room)}" lengthAdjust="spacingAndGlyphs"` : ''}>${esc(name)}</text>`;
  }
  return s;
}
const AUTO_NAME = /^(XLXI_\d+|inst_\d+|U\d+)$/;
// a pin's name inside the body, past its lead and clock triangle (L px from the pin's end); on the top or the bottom
// side, upright, or turned to read upwards (vertical: names that would not fit 20 px apart, as ISE turns them, #1134)
function pinName(p, L, label, vertical) {
  const v = { W: [1, 0], E: [-1, 0], N: [0, 1], S: [0, -1] }[p.side];
  if (v[0]) return `<text class="pname" x="${p.x + v[0] * (L + 3)}" y="${p.y + 3}" text-anchor="${v[0] > 0 ? 'start' : 'end'}">${esc(label)}</text>`;
  if (!vertical) return `<text class="pname" x="${p.x}" y="${p.y + (v[1] > 0 ? L + 10 : -(L + 4))}" text-anchor="middle">${esc(label)}</text>`;
  const x = p.x + 3, y = p.y + v[1] * (L + 3);
  return `<text class="pname" x="${x}" y="${y}" transform="rotate(-90 ${x} ${y})" text-anchor="${v[1] > 0 ? 'end' : 'start'}">${esc(label)}</text>`;
}
// the names on the top and the bottom turned when one of them is longer than 2 letters
const verticalNames = (pins, label = p => p.name) => pins.some(p => (p.side === 'N' || p.side === 'S') && label(p).length > 2);
function textsSvg(sym, def, ctx = {}) {
  let s = '';
  const box = symbolBox(sym, null, def);
  const cx = (lx, ly) => xform(sym, def, lx, ly);
  const center = cx(def.body.x + def.body.w / 2, def.body.y + def.body.h / 2);
  // the instance name: only a name given by the user (not the automatic inst_n / XLXI_n / Un ones, #172);
  // every one with Names (ctx.allNames)
  const showName = !!sym.name && (ctx.allNames ? !['vcc', 'gnd'].includes(sym.type)
    : !['constant', 'vcc', 'gnd', 'slice', 'busjoin'].includes(sym.type) && !AUTO_NAME.test(sym.name || ''));
  const pinLabels = ['module', 'hdl', 'ff', 'arith', 'mux', 'demux', 'lib'].includes(def.shape);
  // (a multiplexer / demultiplexer: its type inside it, upright (#2041); turned, or a DEMUX, above it, the instance
  // name above that, #313)
  const muxType = def.shape === 'mux' || def.shape === 'demux';
  const muxIn = muxType && def.title && def.shape === 'mux' && sym.rot !== 90 && sym.rot !== 270 ? typeInside(sym, def, def.title) : null;
  const muxAbove = muxType && !muxIn;
  if (showName) {
    // above the symbol; when pins stick out of the top (turned symbols), beside the top right corner instead
    const topPins = (def.shape === 'lib' || def.shape === 'demux' || def.shape === 'mux' || def.shape === 'ff') && symbolPins(sym, null, def).some(p => p.side === 'N');
    s += topPins ? `<text class="iname" x="${box.x + box.w + 3}" y="${box.y - 2 - (muxAbove ? 11 : 0)}" text-anchor="start">${esc(sym.name)}</text>`
      : `<text class="iname" x="${box.x + box.w / 2}" y="${box.y - 4 - (muxAbove ? 11 : 0)}" text-anchor="middle">${esc(sym.name)}</text>`;
  }
  if (muxIn) s += muxIn;
  else if (muxType && def.title) {
    const topPins = symbolPins(sym, null, def).some(p => p.side === 'N');
    s += topPins ? `<text class="stype" x="${box.x + box.w + 3}" y="${box.y + 9}" text-anchor="start">${esc(def.title)}</text>`
      : `<text class="stype" x="${box.x + box.w / 2}" y="${box.y - 4}" text-anchor="middle">${esc(def.title)}</text>`;
  }
  if (def.shape === 'module' || def.shape === 'hdl') {
    const tt = def.shape === 'hdl' ? (sym.params.title || 'HDL') : def.title;
    const top = cx(def.body.x + def.body.w / 2, def.body.y + 11);
    const rot = sym.rot === 90 || sym.rot === 270;
    s += `<text class="stitle${def.shape === 'hdl' ? ' hdl' : ''}" x="${rot ? center.x : top.x}" y="${rot ? center.y : top.y + 3}" text-anchor="middle">${esc(tt)}</text>`;
  } else if (def.shape === 'ff') {
    // type name in the bottom corner away from the inputs (turned 90/270: the centre of the body)
    const turned = sym.rot === 90 || sym.rot === 270;
    const t = turned ? center : cx(def.body.x + def.body.w - 3, def.body.h - 4);
    const dx = xform(sym, def, 1, 0).x - xform(sym, def, 0, 0).x;
    s += `<text class="stype" x="${t.x}" y="${t.y + (turned ? 3 : sym.rot === 180 ? 7 : 0)}" text-anchor="${turned ? 'middle' : dx > 0 ? 'end' : 'start'}">${esc(symbolTypeName(sym))}</text>`;
  } else if (def.shape === 'lib') {
    // decoders / encoders: symbol name in the free top row, like the title of module symbols (centre when turned)
    const top = cx(def.body.x + def.body.w / 2, def.body.y + 15);
    const rot = sym.rot === 90 || sym.rot === 270;
    s += `<text class="stitle" x="${rot ? center.x : top.x}" y="${rot ? center.y + 4 : top.y + 4}" text-anchor="middle">${esc(def.title)}</text>`;
  } else if (def.shape === 'arith') {
    s += `<text class="sop" x="${center.x}" y="${center.y + 5}" text-anchor="middle">${esc(def.op)}</text>`;
    // the type with its width under the symbol (ADD8, SUB16, COMP4), as for the gates (#681)
    s += typeUnder(sym, def, box, center, symbolTypeName(sym));
  } else if (def.shape === 'slice') {
    // the bit(s) it takes, with the bus's name: A(0) of A(5:0) (#174), on its wire inside the symbol, where a symbol's
    // bus pin has its width (with the same halo), in every orientation; no width of its own: its indices say it (#1800)
    const m = cx(25, 10);
    s += `<text class="stext on" x="${m.x}" y="${m.y + 3}" text-anchor="middle">${esc(`${ctx.busName || ''}${def.text}`)}</text>`;
  } else if (def.shape === 'join') {
    // each input's bits of the output on its wire, inside the symbol, as the bus tap's (I0 the most significant
    // part): (7:4), (3); no width of its own: its indices say it (#1908); the output's width as every symbol's bus pins (#1488)
    // (centred on its lead; turned 90° / 270°, its inputs 20 px apart: every other one further along, never side by side, #1910)
    const turned = sym.rot === 90 || sym.rot === 270, L = def.body.x;
    let hi = def.pins.reduce((n, p) => n + (p.dir === 'in' ? p.width : 0), 0) - 1;
    for (const [i, p] of def.pins.filter(q => q.dir === 'in').entries()) {
      const lo = hi - p.width + 1, m = cx(turned ? (i % 2 ? L - 10 : 10) : L / 2, p.y);
      s += `<text class="stext on" x="${m.x}" y="${m.y + 3}" text-anchor="middle">${esc(hi === lo ? `(${hi})` : `(${hi}:${lo})`)}</text>`;
      hi = lo - 1;
    }
    const o = symbolPins(sym, null, def).find(p => p.dir === 'out');
    if ((o.width || 1) > 1) s += pinWidth(o);
  } else if (def.shape === 'const') {
    const t = cx((def.w - 20) / 2, 10);
    s += `<text class="cval" x="${t.x}" y="${t.y + 4}" text-anchor="middle">${esc(def.text)}</text>`;
    // a constant wider than a bit: the width by its output, as on the bus pins of the other symbols (#681)
    const o = symbolPins(sym, null, def)[0];
    if ((o.width || 1) > 1) s += pinWidth(o);
  } else if (def.shape === 'vcc' || def.shape === 'gnd') {
    // (past the end away from its pin, the bar of VCC or the last bar of GND, in every orientation: beside it when
    // turned 90° / 270°, not over it, #2042)
    const end = def.shape === 'vcc' ? 10 : 28, tip = cx(10, end), far = cx(10, def.shape === 'vcc' ? end - 10 : end + 10);
    const dx = Math.sign(far.x - tip.x), dy = Math.sign(far.y - tip.y);
    const [x, y] = dx ? [tip.x + 4 * dx, tip.y + 3] : [tip.x, tip.y + (dy < 0 ? -6 : 12)];
    s += `<text class="stype" x="${x}" y="${y}" text-anchor="${!dx ? 'middle' : dx > 0 ? 'start' : 'end'}">${esc(def.shape.toUpperCase())}</text>`;
    // (a VCC / GND wider than a bit: its width by its output, #953)
    const o = symbolPins(sym, null, def)[0];
    if ((o.width || 1) > 1) s += pinWidth(o);
  } else if (def.shape === 'gate' || def.shape === 'inv' || def.shape === 'buf') {
    // the type (AND2, OR3B1, INV…) inside the symbol (#2041), else under it, as ISE draws it (#172)
    s += typeInside(sym, def, symbolTypeName(sym)) ?? typeUnder(sym, def, box, center, symbolTypeName(sym));
  } else if (def.shape === 'tbuf') {
    // (its type, BUFE / BUFT8…, inside its triangle, #2068; BUFE4…'s one-bit BUFE inside each, #2122)
    s += typeInside(sym, def, def.rows > 1 ? def.title.replace(/\d+$/, '') : def.title) ?? typeUnder(sym, def, box, center, def.title);
  }
  if (def.shape === 'gate' || def.shape === 'inv' || def.shape === 'buf' || def.shape === 'tbuf') {
    // a gate wider than a bit: the width on each bus pin's lead, as the other symbols, nothing in its shape (#1486)
    for (const [i, p] of symbolPins(sym, null, def).entries()) {
      const lp = def.pins[i];
      if ((p.width || 1) > 1) s += pinWidth(p, lp.inv ? Math.min(10, (gateInputEnd(def, lp.y) - 8) / 2) : 10);
    }
  }
  if (def.shape === 'lib' || def.shape === 'demux' || def.shape === 'ff') {
    // pin names inside the body, clear of the 20 px leads; bus widths beside the pin end
    const pins = symbolPins(sym, null, def), vertical = verticalNames(pins);
    for (const p of pins) {
      // demux select: the lead ends on the sloped edge; clock pins: room for the clock triangle
      const L = 20 + (def.shape === 'demux' && p.ly === def.h ? 6 : 0) + (p.clock ? 8 : 0);
      // (a demultiplexer a bit, #2081: each row's names as the one-bit one's, D and O0, O1…)
      s += pinName(p, L, def.rows > 1 ? p.name.replace(/_\d+$/, '').replace(/^D\d+$/, 'D') : p.name, vertical);
      if ((p.width || 1) > 1) s += pinWidth(p);
    }
  } else if (pinLabels) {
    // (each pin's own side, not turned, says which one it is; the turned side, where its name goes, #1134)
    const pins = symbolPins(sym, null, def);
    // (a multiplexer a bit, #2081: each row's names as the one-bit one's, its row the bit: D0_1 is 0)
    const label = p => { const n = def.rows > 1 ? p.name.replace(/_\d+$/, '') : p.name; return def.shape === 'mux' && n.startsWith('D') ? n.slice(1) : n; };
    const vertical = verticalNames(pins.filter((p, i) => !(def.shape === 'mux' && def.pins[i].side === 'E')), label);
    for (const [i, p] of pins.entries()) {
      const own = def.pins[i].side;
      // (the multiplexer's output: no name, its width when a bus, #313)
      if (def.shape === 'mux' && own === 'E') {
        if ((p.width || 1) > 1) s += pinWidth(p);
        continue;
      }
      if (def.shape === 'arith' && sym.type !== 'add' && own === 'E') { if ((p.width || 1) > 1) s += pinWidth(p); continue; }
      // past the lead (20 px; a multiplexer's select, 10 to 20, from its slanted edge) and a clock's triangle
      const lp = def.pins[i];
      const L = (def.shape === 'mux' && own === 'S' ? 10 + 10 * (lp.x - def.body.x) / def.body.w : 20) + (p.clock && (def.shape === 'arith' || own === 'W') ? 8 : 0);
      s += pinName(p, L, label(p), vertical);
      // (the width of a bus pin by it: modules, HDL blocks, multiplexers and demultiplexers, #313; adders,
      // subtractors and comparators, #681)
      if ((p.width || 1) > 1 && ['module', 'hdl', 'mux', 'demux', 'arith'].includes(def.shape)) s += pinWidth(p);
    }
  }
  return s;
}

function matrixOf(sym, def) {
  const o = xform(sym, def, 0, 0), a = xform(sym, def, 1, 0), b = xform(sym, def, 0, 1);
  return `matrix(${a.x - o.x},${a.y - o.y},${b.x - o.x},${b.y - o.y},${o.x},${o.y})`;
}

// ctx: { busName } (a bus tap: the name of the bus it taps, #174)
export function symbolSvg(sym, def, cls = '', ctx = {}) {
  const box = symbolBox(sym, null, def);
  return `<g class="sym${cls}" data-kind="sym" data-id="${esc(sym.id)}">`
    + `<rect class="hitbox" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"/>`
    + `<g transform="${matrixOf(sym, def)}">${bodySvg(sym, def)}</g>${textsSvg(sym, def, ctx)}</g>`;
}

/**
 * Standalone SVG drawing of a symbol at its parameters (Symbol Info datasheets): the editor drawing
 * plus the pin names of the symbols that do not show them (gates, inverters, arithmetic outputs).
 */
export function symbolDrawingSvg(symIn, def, { scale = 1.6 } = {}) {
  const sym = { ...symIn, x: 0, y: 0, rot: 0, mirror: false, name: '' };
  const labelled = ['lib', 'demux', 'ff', 'module', 'hdl', 'mux'].includes(def.shape);
  let extra = '';
  for (const p of def.pins) {
    if (labelled && !(def.shape === 'mux' && p.side === 'E')) continue;
    if (def.shape === 'arith' && p.side === 'W') continue;
    const v = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] }[p.side];
    const x = p.x + v[0] * 3, y = p.y + (v[1] ? v[1] * 12 : -3);
    extra += `<text class="pname" x="${x}" y="${y}" text-anchor="${v[0] < 0 ? 'end' : v[0] > 0 ? 'start' : 'middle'}">${esc(p.name)}</text>`;
  }
  const m = 34, w = def.w + 2 * m, hh = def.h + 2 * 22;
  return `<svg class="se-svg sd-svg" xmlns="${SVGNS}" viewBox="${-m} -22 ${w} ${hh}" width="${Math.round(w * scale)}" height="${Math.round(hh * scale)}">`
    + `<g class="sym">${bodySvg(sym, def)}${textsSvg(sym, def)}${extra}</g></svg>`;
}

export function portSvg(p, cls = '') {
  const b = portBox(p);
  const name = p.width > 1 ? `${p.name}(${p.width - 1}:0)` : p.name;
  const M = 7, side = portSide(p);
  // the marker drawn along its body: u from the connection point outwards, v across (#296)
  const at = { W: (u, v) => [p.x - u, p.y + v], E: (u, v) => [p.x + u, p.y + v], N: (u, v) => [p.x + v, p.y - u], S: (u, v) => [p.x + v, p.y + u] }[side];
  const outline = p.dir === 'in' ? [[30, -M], [10, -M], [3, 0], [10, M], [30, M]]
    : p.dir === 'out' ? [[3, -M], [23, -M], [30, 0], [23, M], [3, M]]
      : [[3, 0], [10, -M], [23, -M], [30, 0], [23, M], [10, M]];
  const shape = `M${outline.map(([u, v]) => at(u, v).join(',')).join(' L')} Z`;
  const [px, py] = at(3, 0);
  const [tx, ty] = at(34, 0);
  const text = side === 'W' || side === 'E'
    ? `<text class="ioname" x="${tx}" y="${ty + 4}" text-anchor="${side === 'W' ? 'end' : 'start'}">${esc(name)}</text>`
    : `<text class="ioname" x="${tx + 4}" y="${ty}" text-anchor="${side === 'N' ? 'start' : 'end'}" transform="rotate(-90 ${tx + 4} ${ty})">${esc(name)}</text>`;
  return `<g class="port${cls}" data-kind="port" data-id="${esc(p.id)}"><rect class="hitbox" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/>`
    + `<path class="iomark${p.width > 1 ? ' bus' : ''}" d="${shape}"/>`
    + `<line class="pin${p.width > 1 ? ' bus' : ''}" x1="${p.x}" y1="${p.y}" x2="${px}" y2="${py}"/>`
    + text + '</g>';
}

// ------------------------------------------------------------------ geometry helpers
// a wire's path with a small arc over each crossing of its horizontal segments (#692; segs: segment
// index -> the x of its crossings); a crossing too close to a bend or to another one is drawn flat
const HOP_R = 5;
export function hopPath(w, segs) {
  const P = w.points;
  let d = `M${P[0].x},${P[0].y}`;
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1], dir = Math.sign(b.x - a.x);
    let last = a.x;
    for (const x of (segs.get(i) || []).slice().sort((u, v) => dir * (u - v))) {
      // (the arc from x - r to x + r, after the previous one and within the segment)
      if (dir * (x - dir * HOP_R - last) < 0 || dir * (b.x - x - dir * HOP_R) < 0) continue;
      d += ` L${x - dir * HOP_R},${a.y} A${HOP_R},${HOP_R} 0 0 ${dir > 0 ? 1 : 0} ${x + dir * HOP_R},${a.y}`;
      last = x + dir * HOP_R;
    }
    d += ` L${b.x},${b.y}`;
  }
  return d;
}
// the runs of wires of one net meeting end to end in line (a wire split at a tap or a branch, #678):
// wire id -> the id of its run's first wire
export function inLineRuns(wires, netOf) {
  const up = new Map(wires.map(w => [w.id, w.id]));
  const find = id => { while (up.get(id) !== id) id = up.get(id); return id; };
  const at = new Map();   // 'x,y,h|v,net' -> wire ids ending there with an end segment that way
  for (const w of wires) {
    const P = w.points;
    for (const [p, q] of [[P[0], P[1]], [P[P.length - 1], P[P.length - 2]]]) {
      const k = `${p.x},${p.y},${p.y === q.y ? 'h' : p.x === q.x ? 'v' : 'o'},${netOf(w)}`;
      const o = at.get(k);
      if (o != null) up.set(find(w.id), find(o)); else at.set(k, w.id);
    }
  }
  return new Map(wires.map(w => [w.id, find(w.id)]));
}
// a wire's longest run (horizontal runs first): where a net's name is written
export function wireRun(w) {
  let best = 0;
  for (let i = 0; i + 1 < w.points.length; i++) { const p = w.points[i], q = w.points[i + 1]; best = Math.max(best, p.y === q.y ? Math.abs(q.x - p.x) : Math.abs(q.y - p.y) * 0.5); }
  return best;
}
