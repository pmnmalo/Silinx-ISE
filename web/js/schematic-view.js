// Silinx RTL schematic viewer (ISE "View RTL Schematic" look).
//
//   const v = mountSchematic(container, { onOpenInstance(path), onOpenSource({file,line}), onSelect(item) });
//   v.show(graph, { title, breadcrumb: [{ label, path }] });   // graph = core/schematic.js buildSchematic()
//   v.fit(); v.zoomIn(); v.zoomOut(); v.exportSvg(); v.destroy();
//
// Layout: ELK layered (RIGHT, orthogonal routing) — run in a Web Worker when available,
// otherwise with the bundled (main-thread) build. Layouts are cached by graph id + structure.

const SVGNS = 'http://www.w3.org/2000/svg';
const FONT = '11px Arial, Helvetica, sans-serif';
const FONT_SMALL = '9px Arial, Helvetica, sans-serif';
const FONT_BOLD = 'bold 11px Arial, Helvetica, sans-serif';
const STUB = 10;          // pin stub length
const PITCH = 20;         // pin pitch on block symbols
const LOGIC = new Set(['and', 'nand', 'or', 'nor', 'xor', 'xnor']);
const ROUND_OPS = new Set(['add', 'sub', 'mul', 'neg']);
const BOXES = new Set(['inst', 'blackbox', 'reg', 'comb', 'tb']);
const MAX_LABEL = 32;

// ------------------------------------------------------------------ helpers
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r1 = v => Math.round(v * 10) / 10;
const trunc = (s, n = MAX_LABEL) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const leaf = p => String(p ?? '').split('.').pop();

let measureCtx = null;
const measureCache = new Map();
function textW(s, font = FONT) {
  s = String(s ?? '');
  if (!s) return 0;
  const k = font + '\u0000' + s;
  let w = measureCache.get(k);
  if (w !== undefined) return w;
  if (!measureCtx) {
    try { measureCtx = document.createElement('canvas').getContext('2d'); } catch { measureCtx = null; }
  }
  if (measureCtx) { measureCtx.font = font; w = measureCtx.measureText(s).width; }
  else w = s.length * (font.includes('9px') ? 5 : 6.2);
  if (measureCache.size > 20000) measureCache.clear();
  measureCache.set(k, w);
  return w;
}

// ------------------------------------------------------------------ ELK loading
let elkPromise = null;
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => resolve(); s.onerror = () => reject(new Error(`cannot load ${src}`));
    document.head.appendChild(s);
  });
}
function getElk(base) {
  if (elkPromise) return elkPromise;
  elkPromise = (async () => {
    // Single-file build: ELK is inlined as a global, use it on the main thread.
    if (globalThis.SILINX_STANDALONE && globalThis.ELK) return { elk: new globalThis.ELK(), worker: false };
    // Prefer a real worker so big layouts don't freeze the UI.
    if (typeof Worker !== 'undefined') {
      try {
        const ok = await fetch(base + 'elk-worker.min.js', { method: 'HEAD' }).then(r => r.ok, () => false);
        if (ok) {
          const prev = globalThis.ELK;
          await loadScript(base + 'elk-api.js');
          const Api = globalThis.ELK;
          if (prev) globalThis.ELK = prev;
          const elk = new Api({ workerUrl: base + 'elk-worker.min.js' });
          return { elk, worker: true };
        }
      } catch { /* fall through */ }
    }
    return { elk: await bundledElk(base), worker: false };
  })();
  return elkPromise;
}
let bundledPromise = null;
function bundledElk(base) {
  if (!bundledPromise) bundledPromise = loadScript(base + 'elk.bundled.js').then(() => new globalThis.ELK());
  return bundledPromise;
}

// ------------------------------------------------------------------ symbol geometry
// Each shape: { w, h, pins: { [portId]: { x, y, side, ...port } }, body: svg-string }
function pinYs(n, h, pitch) {
  const span = (n - 1) * pitch;
  const y0 = (h - span) / 2;
  return Array.from({ length: n }, (_, i) => y0 + i * pitch);
}

function stub(x1, y1, x2, y2, w) {
  return `<line class="pin${w > 1 ? ' bus' : ''}" x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}"/>`;
}

function shapeOf(n) {
  const ports = Array.isArray(n.ports) ? n.ports : [];
  const kind = n.kind;
  if (kind === 'in' || kind === 'inout') return padShape(n, ports, kind);
  if (kind === 'out') return padShape(n, ports, 'out');
  if (kind === 'netlabel') return flagShape(n, ports);
  if (kind === 'const') return constShape(n, ports);
  if (kind === 'gate') return gateShape(n, ports);
  return boxShape(n, ports);
}

function padShape(n, ports, kind) {
  const p = ports[0] || { id: 'p', w: n.w || 1 };
  const bus = (p.w || n.w || 1) > 1;
  const name = trunc(n.label, 40);
  const sub = bus ? (n.sub || `[${p.w}]`) : '';
  const tw = textW(name) + (sub ? textW(sub, FONT_SMALL) + 2 : 0);
  const PW = 26, H = 16, m = H / 2;
  let body = '', w, pin;
  if (kind === 'out') {
    // wire enters left, pad arrow then name
    w = PW + 6 + tw;
    body += `<path class="pad" d="M0,${m} L6,0 H${PW - 8} L${PW},${m} L${PW - 8},${H} H6 Z"/>`;
    body += `<text class="plabel" x="${PW + 5}" y="${m + 4}">${esc(name)}${sub ? `<tspan class="psub" dx="2">${esc(sub)}</tspan>` : ''}</text>`;
    pin = { x: 0, y: m, side: 'W' };
  } else {
    w = tw + 6 + PW;
    const x0 = tw + 6;
    body += kind === 'inout'
      ? `<path class="pad" d="M${x0},${m} L${x0 + 8},0 H${x0 + PW - 8} L${x0 + PW},${m} L${x0 + PW - 8},${H} H${x0 + 8} Z"/>`
      : `<path class="pad" d="M${x0},0 H${x0 + PW - 8} L${x0 + PW},${m} L${x0 + PW - 8},${H} H${x0} Z"/>`;
    body += `<text class="plabel" x="0" y="${m + 4}">${esc(name)}${sub ? `<tspan class="psub" dx="2">${esc(sub)}</tspan>` : ''}</text>`;
    pin = { x: w, y: m, side: 'E' };
  }
  return { w, h: H, pins: { [p.id]: { ...p, ...pin } }, body };
}

function flagShape(n, ports) {
  const p = ports[0] || { id: 'o', w: 1 };
  const name = trunc(n.label, 40);
  const tw = textW(name, FONT_SMALL);
  const H = 14, w = tw + 18;
  const body = `<path class="flag" d="M0,0 H${tw + 6} L${tw + 12},${H / 2} L${tw + 6},${H} H0 Z"/>`
    + stub(tw + 12, H / 2, w, H / 2, p.w)
    + `<text class="flabel" x="3" y="${H / 2 + 3}">${esc(name)}</text>`;
  return { w, h: H, pins: { [p.id]: { ...p, x: w, y: H / 2, side: 'E' } }, body };
}

function constShape(n, ports) {
  const p = ports[0] || { id: 'o', w: 1 };
  const name = trunc(n.label, 24);
  const tw = textW(name, FONT);
  const H = 14, w = tw + 14;
  const body = `<text class="clabel" x="0" y="${H / 2 + 4}">${esc(name)}</text>` + stub(tw + 3, H / 2, w, H / 2, p.w);
  return { w, h: H, pins: { [p.id]: { ...p, x: w, y: H / 2, side: 'E' } }, body };
}

function gateShape(n, ports) {
  const g = n.gate || 'op';
  const ins = ports.filter(p => p.side !== 'E' && !p.sel);
  const sel = ports.filter(p => p.sel);
  const outs = ports.filter(p => p.side === 'E');
  const pins = {};
  let body = '', w, h;

  if (LOGIC.has(g)) {
    const inv = g === 'nand' || g === 'nor' || g === 'xnor';
    const isXor = g === 'xor' || g === 'xnor';
    const k = Math.max(1, ins.length);
    h = Math.max(30, (k + 1) * 10);
    const x0 = STUB + (isXor ? 5 : 0), BW = 30;
    const yi = pinYs(k, h, 10);
    const backX = y => x0 + 2 * (1 - y / h) * (y / h) * 8;   // quadratic back curve (or/xor)
    if (g === 'and' || g === 'nand') {
      body += `<path class="gate" d="M${x0},0 H${x0 + 15} A15,${h / 2} 0 0 1 ${x0 + 15},${h} H${x0} Z"/>`;
    } else {
      body += `<path class="gate" d="M${x0},0 Q${x0 + 20},0 ${x0 + BW},${h / 2} Q${x0 + 20},${h} ${x0},${h} Q${x0 + 8},${h / 2} ${x0},0 Z"/>`;
      if (isXor) body += `<path class="gate nofill" d="M${x0 - 5},${h} Q${x0 + 3},${h / 2} ${x0 - 5},0"/>`;
    }
    ins.forEach((p, i) => {
      const y = yi[i] ?? h / 2;
      const end = (g === 'and' || g === 'nand') ? x0 : (isXor ? backX(y) - 5 : backX(y));
      body += stub(0, y, end, y, p.w);
      pins[p.id] = { ...p, x: 0, y, side: 'W' };
    });
    let xo = x0 + BW;
    if (inv) { body += `<circle class="gate" cx="${xo + 3}" cy="${h / 2}" r="3"/>`; xo += 6; }
    w = xo + STUB;
    if (n.label === 'reduce') body += `<text class="glabel small" x="${x0 + 10}" y="${h / 2 + 3}" text-anchor="middle">r</text>`;
    outs.forEach(p => { body += stub(xo, h / 2, w, h / 2, p.w); pins[p.id] = { ...p, x: w, y: h / 2, side: 'E' }; });
    return { w, h, pins, body };
  }

  if (g === 'not' || g === 'buf') {
    h = 20;
    const x0 = STUB, TW = 18;
    body += `<path class="gate" d="M${x0},0 L${x0 + TW},${h / 2} L${x0},${h} Z"/>`;
    let xo = x0 + TW;
    if (g === 'not') { body += `<circle class="gate" cx="${xo + 3}" cy="${h / 2}" r="3"/>`; xo += 6; }
    w = xo + STUB;
    (ins.length ? ins : []).forEach(p => { body += stub(0, h / 2, x0, h / 2, p.w); pins[p.id] = { ...p, x: 0, y: h / 2, side: 'W' }; });
    outs.forEach(p => { body += stub(xo, h / 2, w, h / 2, p.w); pins[p.id] = { ...p, x: w, y: h / 2, side: 'E' }; });
    return { w, h, pins, body };
  }

  if (g === 'mux') {
    const k = Math.max(2, ins.length);
    const bh = k * PITCH + 24;
    const x0 = STUB, BW = 24, slope = 8;
    h = bh + (sel.length ? STUB : 0);
    body += `<path class="gate" d="M${x0},0 L${x0 + BW},${slope} L${x0 + BW},${bh - slope} L${x0},${bh} Z"/>`;
    const yi = (ins.length ? ins : [0]).map((_, i) => 16 + i * PITCH);
    ins.forEach((p, i) => {
      const y = yi[i];
      body += stub(0, y, x0, y, p.w);
      body += `<text class="pinlabel small" x="${x0 + 3}" y="${y + 3}">${esc(p.label ?? i)}</text>`;
      pins[p.id] = { ...p, x: 0, y, side: 'W' };
    });
    sel.forEach((p, i) => {
      const x = x0 + BW / 2 + i * 6;
      const yb = bh - slope / 2;
      body += stub(x, yb, x, h, p.w);
      body += `<text class="pinlabel small" x="${x}" y="${bh - slope - 2}" text-anchor="middle">S</text>`;
      pins[p.id] = { ...p, x, y: h, side: 'S' };
    });
    w = x0 + BW + STUB;
    outs.forEach(p => { body += stub(x0 + BW, bh / 2, w, bh / 2, p.w); pins[p.id] = { ...p, x: w, y: bh / 2, side: 'E' }; });
    return { w, h, pins, body };
  }

  if (g === 'concat' || g === 'select') {
    // bus ripper / combiner bar
    const k = Math.max(1, ins.length);
    const bh = Math.max(20, k * 10 + 10);
    const lab = trunc(n.label, 12);
    const top = lab ? 12 : 0;
    h = bh + top;
    const x0 = STUB, BW = 5;
    if (lab) body += `<text class="glabel small" x="${x0 + BW / 2}" y="9" text-anchor="middle">${esc(lab)}</text>`;
    body += `<rect class="ripper" x="${x0}" y="${top}" width="${BW}" height="${bh}"/>`;
    const yi = pinYs(k, bh, 10).map(y => y + top);
    ins.forEach((p, i) => { body += stub(0, yi[i], x0, yi[i], p.w); pins[p.id] = { ...p, x: 0, y: yi[i], side: 'W' }; });
    w = x0 + BW + STUB;
    outs.forEach(p => { const y = top + bh / 2; body += stub(x0 + BW, y, w, y, p.w); pins[p.id] = { ...p, x: w, y, side: 'E' }; });
    return { w, h, pins, body };
  }

  // arithmetic / comparison / shift / function: circle (simple ops) or box with operator text
  const lab = trunc(n.label || g, 18);
  const k = Math.max(1, ins.length);
  const round = ROUND_OPS.has(g) && k <= 2;
  if (round) {
    const R = 13; h = 2 * R + 4;
    const cx = STUB + R, cy = h / 2;
    body += `<circle class="gate" cx="${cx}" cy="${cy}" r="${R}"/>`;
    body += `<text class="glabel op" x="${cx}" y="${cy + 5}" text-anchor="middle">${esc(lab)}</text>`;
    const yi = pinYs(k, h, 12);
    ins.forEach((p, i) => {
      const y = yi[i], dy = y - cy;
      const xe = cx - Math.sqrt(Math.max(0, R * R - dy * dy));
      body += stub(0, y, xe, y, p.w);
      pins[p.id] = { ...p, x: 0, y, side: 'W' };
    });
    w = cx + R + STUB;
    outs.forEach(p => { body += stub(cx + R, cy, w, cy, p.w); pins[p.id] = { ...p, x: w, y: cy, side: 'E' }; });
    return { w, h, pins, body };
  }
  const BW = Math.max(28, textW(lab, FONT_BOLD) + 12);
  h = Math.max(28, k * PITCH);
  const x0 = STUB;
  body += `<rect class="gate" x="${x0}" y="0" width="${r1(BW)}" height="${h}"/>`;
  body += `<text class="glabel op" x="${r1(x0 + BW / 2)}" y="${h / 2 + 4}" text-anchor="middle">${esc(lab)}</text>`;
  const yi = pinYs(k, h, PITCH);
  ins.forEach((p, i) => { body += stub(0, yi[i], x0, yi[i], p.w); pins[p.id] = { ...p, x: 0, y: yi[i], side: 'W' }; });
  w = x0 + BW + STUB;
  outs.forEach(p => { body += stub(x0 + BW, h / 2, w, h / 2, p.w); pins[p.id] = { ...p, x: w, y: h / 2, side: 'E' }; });
  // stray S-side ports (not expected for non-mux gates)
  sel.forEach((p, i) => { pins[p.id] = { ...p, x: x0 + 6 + i * 6, y: h, side: 'S' }; body += stub(x0 + 6 + i * 6, h, x0 + 6 + i * 6, h, p.w); });
  return { w: r1(w), h, pins, body };
}

function boxShape(n, ports) {
  const kind = n.kind;
  const west = ports.filter(p => p.side !== 'E');
  const east = ports.filter(p => p.side === 'E');
  const rows = Math.max(west.length, east.length, 1);
  const pinLbl = p => trunc(p.label ?? '', 20);
  const lw = Math.max(0, ...west.map(p => textW(pinLbl(p), FONT_SMALL) + (p.clock ? 10 : 0) + (p.reset ? 9 : 0)));
  const rw = Math.max(0, ...east.map(p => textW(pinLbl(p), FONT_SMALL)));
  let above, mid, midClass = 'mod';
  if (kind === 'inst' || kind === 'blackbox') { above = n.label; mid = n.sub || ''; }
  else if (kind === 'reg') { above = n.label; mid = 'REG'; midClass = 'mod kindtag'; }
  else if (kind === 'tb') { above = n.label; mid = 'TB'; midClass = 'mod kindtag'; }
  else { above = n.sub && n.sub !== n.label ? n.sub : ''; mid = n.label || 'logic'; }
  above = trunc(above, 48); mid = trunc(mid, 28);
  const midW = textW(mid, FONT_BOLD);
  const TOP = 14;                                  // room for the label above the body
  const bh = rows * PITCH + 10;
  // middle text sits between the pin label columns when there is room, else below them
  let bw = Math.max(70, lw + rw + midW + 28, textW(above, FONT) - 2 * STUB + 4);
  bw = Math.ceil(bw / 10) * 10;
  const w = bw + 2 * STUB, h = TOP + bh;
  const x0 = STUB, y0 = TOP;
  let body = '';
  const cls = kind === 'blackbox' ? 'box blackbox' : kind === 'tb' ? 'box tb' : kind === 'reg' ? 'box reg' : kind === 'comb' ? 'box comb' : 'box inst';
  body += `<rect class="${cls}" x="${x0}" y="${y0}" width="${bw}" height="${bh}"/>`;
  if (kind === 'reg') body += `<line class="regbar" x1="${x0 + 3}" y1="${y0 + 3}" x2="${x0 + bw - 3}" y2="${y0 + 3}"/>`;
  if (above) body += `<text class="ilabel" x="${x0 + bw / 2}" y="${TOP - 4}" text-anchor="middle">${esc(above)}</text>`;
  if (mid) body += `<text class="${midClass}" x="${r1(x0 + lw + 8 + (bw - lw - rw - 16) / 2)}" y="${y0 + bh / 2 + 4}" text-anchor="middle">${esc(mid)}</text>`;
  const pins = {};
  west.forEach((p, i) => {
    const y = y0 + 15 + i * PITCH;
    body += `<g class="pinhit" data-pin="${esc(p.id)}">` + stub(0, y, x0, y, p.w);
    let tx = x0 + 3;
    if (p.clock) { body += `<path class="clk" d="M${x0},${y - 4} L${x0 + 7},${y} L${x0},${y + 4}"/>`; tx = x0 + 10; }
    if (p.reset) { body += `<text class="rmark" x="${tx}" y="${y + 3}">R</text>`; tx += 9; }
    body += `<text class="pinlabel" x="${tx}" y="${y + 3}">${esc(pinLbl(p))}</text>`;
    if (p.w > 1) body += `<text class="wlabel" x="${STUB / 2}" y="${y - 3}" text-anchor="middle">${p.w}</text>`;
    body += `<rect class="hit" x="0" y="${y - 6}" width="${STUB + lw + 4}" height="12"/></g>`;
    pins[p.id] = { ...p, x: 0, y, side: 'W' };
  });
  east.forEach((p, i) => {
    const y = y0 + 15 + i * PITCH;
    body += `<g class="pinhit" data-pin="${esc(p.id)}">` + stub(x0 + bw, y, w, y, p.w);
    body += `<text class="pinlabel" x="${x0 + bw - 3}" y="${y + 3}" text-anchor="end">${esc(pinLbl(p))}</text>`;
    if (p.w > 1) body += `<text class="wlabel" x="${w - STUB / 2}" y="${y - 3}" text-anchor="middle">${p.w}</text>`;
    body += `<rect class="hit" x="${x0 + bw - rw - 4}" y="${y - 6}" width="${rw + 4 + STUB}" height="12"/></g>`;
    pins[p.id] = { ...p, x: w, y, side: 'E' };
  });
  return { w, h, pins, body };
}

// ------------------------------------------------------------------ graph -> ELK
const SIDE = { W: 'WEST', E: 'EAST', S: 'SOUTH', N: 'NORTH' };

function prepare(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes.filter(n => n && n.id != null) : [];
  const byId = new Map();
  const shapes = new Map();
  for (const n of nodes) {
    if (byId.has(n.id)) continue;
    byId.set(n.id, n);
    let s;
    try { s = shapeOf(n); } catch (e) { s = { w: 40, h: 20, pins: {}, body: `<rect class="box" x="0" y="0" width="40" height="20"/>` }; }
    shapes.set(n.id, s);
  }
  const edges = (Array.isArray(graph?.edges) ? graph.edges : []).filter(e =>
    e && e.from && e.to && shapes.get(e.from.node)?.pins[e.from.port] && shapes.get(e.to.node)?.pins[e.to.port]);
  const seen = new Set();
  edges.forEach((e, i) => { let id = String(e.id ?? `e${i}`); while (seen.has(id)) id += '_'; seen.add(id); e._eid = id; });
  return { nodes: [...byId.values()], byId, shapes, edges };
}

function signature(graph, prep) {
  let h = 0;
  const add = s => { for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; };
  for (const n of prep.nodes) { add(n.id + n.kind + (n.label ?? '') + (n.sub ?? '') + (n.gate ?? '')); for (const p of n.ports || []) add(p.id + p.side + (p.label ?? '') + p.w); }
  for (const e of prep.edges) add(e.from.node + e.from.port + e.to.node + e.to.port + (e.w ?? ''));
  return `${graph.id ?? ''}#${prep.nodes.length}/${prep.edges.length}/${h}`;
}

function toElk(prep) {
  const big = prep.nodes.length + prep.edges.length / 2 > 300;
  const children = prep.nodes.map(n => {
    const s = shapes(prep, n.id);
    const lo = { 'elk.portConstraints': 'FIXED_POS' };
    if (n.kind === 'in' || n.kind === 'inout') lo['elk.layered.layering.layerConstraint'] = 'FIRST';
    else if (n.kind === 'out') lo['elk.layered.layering.layerConstraint'] = 'LAST';
    return {
      id: n.id, width: s.w, height: s.h, layoutOptions: lo,
      ports: Object.entries(s.pins).map(([pid, p]) => ({
        id: `${n.id}\u0001${pid}`, x: p.x, y: p.y, width: 0, height: 0,
        layoutOptions: { 'elk.port.side': SIDE[p.side] || 'WEST' },
      })),
    };
  });
  const edges = prep.edges.map(e => ({
    id: e._eid, sources: [`${e.from.node}\u0001${e.from.port}`], targets: [`${e.to.node}\u0001${e.to.port}`],
  }));
  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.separateConnectedComponents': 'false',
      'elk.spacing.nodeNode': '24',
      'elk.layered.spacing.nodeNodeBetweenLayers': '44',
      'elk.layered.spacing.edgeNodeBetweenLayers': '14',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '8',
      'elk.spacing.edgeEdge': '8',
      'elk.spacing.edgeNode': '12',
      'elk.layered.nodePlacement.strategy': big ? 'BRANDES_KOEPF' : 'NETWORK_SIMPLEX',
      'elk.layered.considerModelOrder.strategy': big ? 'NONE' : 'NODES_AND_EDGES',
      'elk.layered.crossingMinimization.forceNodeModelOrder': 'false',
      'elk.layered.thoroughness': big ? '2' : '10',
      'elk.layered.unnecessaryBendpoints': 'false',
      'elk.padding': '[top=30,left=30,bottom=30,right=30]',
    },
    children, edges,
  };
}
const shapes = (prep, id) => prep.shapes.get(id);

// Fallback "layout" if ELK fails: simple column placement, straight-ish wires.
function naiveLayout(prep) {
  const res = { children: [], edges: [] };
  const col = n => n.kind === 'in' || n.kind === 'inout' ? 0 : n.kind === 'out' ? 2 : 1;
  const ys = [30, 30, 30], xs = [30, 260, 560];
  const pos = new Map();
  for (const n of prep.nodes) {
    const c = col(n), s = prep.shapes.get(n.id);
    pos.set(n.id, { x: xs[c], y: ys[c] });
    res.children.push({ id: n.id, x: xs[c], y: ys[c], width: s.w, height: s.h });
    ys[c] += s.h + 20;
  }
  for (const e of prep.edges) {
    const a = pos.get(e.from.node), b = pos.get(e.to.node);
    const pa = prep.shapes.get(e.from.node).pins[e.from.port], pb = prep.shapes.get(e.to.node).pins[e.to.port];
    const s = { x: a.x + pa.x, y: a.y + pa.y }, t = { x: b.x + pb.x, y: b.y + pb.y }, mx = (s.x + t.x) / 2;
    res.edges.push({ id: e._eid, sections: [{ startPoint: s, endPoint: t, bendPoints: [{ x: mx, y: s.y }, { x: mx, y: t.y }] }] });
  }
  res.width = 800; res.height = Math.max(...ys) + 30;
  return res;
}

// ------------------------------------------------------------------ icons
const ICON = {
  fit: '<svg viewBox="0 0 16 16"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="#24476f" stroke-width="1.5"/><rect x="5" y="5" width="6" height="6" fill="#9cc3ea" stroke="#24476f"/></svg>',
  zin: '<svg viewBox="0 0 16 16"><circle cx="6.5" cy="6.5" r="4.5" fill="#e8f2fc" stroke="#24476f" stroke-width="1.4"/><path d="M10 10l4.5 4.5" stroke="#24476f" stroke-width="2"/><path d="M4 6.5h5M6.5 4v5" stroke="#24476f" stroke-width="1.4"/></svg>',
  zout: '<svg viewBox="0 0 16 16"><circle cx="6.5" cy="6.5" r="4.5" fill="#e8f2fc" stroke="#24476f" stroke-width="1.4"/><path d="M10 10l4.5 4.5" stroke="#24476f" stroke-width="2"/><path d="M4 6.5h5" stroke="#24476f" stroke-width="1.4"/></svg>',
  up: '<svg viewBox="0 0 16 16"><path d="M8 2L3 7h3v6h4V7h3z" fill="#f4c542" stroke="#8a6500"/></svg>',
};

// ------------------------------------------------------------------ the viewer
export function mountSchematic(container, opts = {}) {
  const { onOpenInstance, onOpenSource, onSelect } = opts;
  const elkBase = opts.elkBase || '/vendor/elk/';
  const layoutCache = new Map();     // signature -> elk result
  const viewCache = new Map();       // graph id -> { s, tx, ty }

  container.classList.add('sch-view');
  if (!container.hasAttribute('tabindex')) container.tabIndex = 0;
  container.innerHTML = `
    <svg class="sch-svg" xmlns="${SVGNS}"><g class="sch-vp"></g></svg>
    <div class="sch-toolbar">
      <button type="button" class="sch-btn" data-act="fit" title="Zoom to Full View (F)">${ICON.fit}</button>
      <button type="button" class="sch-btn" data-act="zin" title="Zoom In (+)">${ICON.zin}</button>
      <button type="button" class="sch-btn" data-act="zout" title="Zoom Out (−)">${ICON.zout}</button>
      <span class="sch-sep"></span>
      <button type="button" class="sch-btn" data-act="up" title="Up one level (Backspace)">${ICON.up}</button>
      <span class="sch-crumbs"></span>
    </div>
    <div class="sch-hint" hidden></div>
    <div class="sch-tip" hidden></div>
    <div class="sch-zoomlabel"></div>`;
  const svg = container.querySelector('.sch-svg');
  const vp = svg.querySelector('.sch-vp');
  const hint = container.querySelector('.sch-hint');
  const tip = container.querySelector('.sch-tip');
  const crumbs = container.querySelector('.sch-crumbs');
  const upBtn = container.querySelector('[data-act="up"]');
  const zoomLabel = container.querySelector('.sch-zoomlabel');

  let graph = null, prep = null, layout = null, meta = { breadcrumb: [] };
  let view = { s: 1, tx: 0, ty: 0 };
  let bounds = { x: 0, y: 0, w: 0, h: 0 };
  let token = 0;
  let pendingFit = false;
  let refitTimer = null;
  let autoFit = true; // keep fitting on resize until the user zooms or pans
  let destroyed = false;
  let content = '';                     // last rendered SVG markup (for export)
  // element indices for fast hover/select
  let nodeEls = new Map(), netEls = new Map(), edgeNet = new Map(), netInfo = new Map();
  let hoverKey = null, selKey = null;

  // ---------------- view transform
  function applyView() {
    vp.setAttribute('transform', `translate(${r1(view.tx)},${r1(view.ty)}) scale(${view.s})`);
    const g = 20 * view.s;
    container.style.backgroundSize = `${g}px ${g}px`;
    container.style.backgroundPosition = `${view.tx % g}px ${view.ty % g}px`;
    container.classList.toggle('sch-lod', view.s < 0.35);
    zoomLabel.textContent = `${Math.round(view.s * 100)}%`;
    if (graph?.id != null) viewCache.set(graph.id + '|' + (layout?._sig ?? ''), { ...view, auto: autoFit });
  }
  function size() { const r = container.getBoundingClientRect(); return { w: r.width, h: r.height }; }
  function fit() {
    if (!layout) return;
    const { w, h } = size();
    autoFit = true;
    if (w < 10 || h < 10) { pendingFit = true; return; }
    pendingFit = false;
    const TOPPAD = 34;
    if (!bounds.w || !bounds.h) { view = { s: 1, tx: 0, ty: 0 }; applyView(); return; }
    const s = Math.max(0.02, Math.min((w - 24) / bounds.w, (h - TOPPAD - 16) / bounds.h, 1.6));
    view.s = s;
    view.tx = (w - bounds.w * s) / 2 - bounds.x * s;
    view.ty = TOPPAD + (h - TOPPAD - bounds.h * s) / 2 - bounds.y * s;
    applyView();
  }
  // first view of a graph: full fit, unless that makes it unreadably small (very tall or very
  // wide designs) — then fit the narrow dimension and start at the top-left corner (inputs).
  function initialView() {
    autoFit = true;
    const { w, h } = size();
    if (w < 10 || h < 10 || !bounds.w) { fit(); return; }
    const TOPPAD = 34;
    const full = Math.min((w - 24) / bounds.w, (h - TOPPAD - 16) / bounds.h, 1.6);
    if (full >= 0.3) { fit(); return; }
    const s = Math.max(0.3, Math.min(1, Math.max((w - 24) / bounds.w, (h - TOPPAD - 16) / bounds.h)));
    view.s = s;
    view.tx = bounds.w * s < w ? (w - bounds.w * s) / 2 - bounds.x * s : 12 - bounds.x * s;
    view.ty = bounds.h * s < h - TOPPAD ? TOPPAD + (h - TOPPAD - bounds.h * s) / 2 - bounds.y * s : TOPPAD - bounds.y * s;
    applyView();
  }
  function zoomAt(f, cx, cy) {
    autoFit = false;
    const { w, h } = size();
    if (cx == null) { cx = w / 2; cy = h / 2; }
    const ns = Math.max(0.02, Math.min(8, view.s * f));
    const k = ns / view.s;
    view.tx = cx - (cx - view.tx) * k;
    view.ty = cy - (cy - view.ty) * k;
    view.s = ns;
    applyView();
  }
  const zoomIn = () => zoomAt(1.25);
  const zoomOut = () => zoomAt(0.8);

  // ---------------- toolbar / breadcrumb
  function renderCrumbs() {
    const bc = Array.isArray(meta.breadcrumb) ? meta.breadcrumb : [];
    let html = '';
    if (bc.length) {
      html = bc.map((b, i) => {
        const last = i === bc.length - 1;
        return (i ? '<span class="sch-crumb-sep">›</span>' : '') +
          (last ? `<span class="sch-crumb cur" title="${esc(b.path ?? '')}">${esc(b.label ?? b.path)}</span>`
                : `<a class="sch-crumb" data-i="${i}" title="${esc(b.path ?? '')}">${esc(b.label ?? b.path)}</a>`);
      }).join('');
    }
    if (meta.title) html += `<span class="sch-title">${esc(meta.title)}</span>`;
    crumbs.innerHTML = html;
    upBtn.disabled = bc.length < 2;
  }
  function goUp() {
    const bc = meta.breadcrumb || [];
    if (bc.length >= 2) onOpenInstance?.(bc[bc.length - 2].path);
  }
  container.querySelector('.sch-toolbar').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (b) {
      const a = b.dataset.act;
      if (a === 'fit') fit(); else if (a === 'zin') zoomIn(); else if (a === 'zout') zoomOut(); else if (a === 'up') goUp();
      container.focus({ preventScroll: true });
      return;
    }
    const c = e.target.closest('a.sch-crumb');
    if (c) onOpenInstance?.(meta.breadcrumb[+c.dataset.i].path);
  });
  container.querySelector('.sch-toolbar').addEventListener('pointerdown', e => e.stopPropagation());
  container.querySelector('.sch-toolbar').addEventListener('dblclick', e => e.stopPropagation());

  // ---------------- show / layout
  function setHint(text) {
    if (text) { hint.textContent = text; hint.hidden = false; } else hint.hidden = true;
  }
  async function show(g, m = {}) {
    if (destroyed) return;
    const my = ++token;
    graph = g || { nodes: [], edges: [] };
    meta = { title: m.title ?? '', breadcrumb: m.breadcrumb || [] };
    renderCrumbs();
    hideTip();
    hoverKey = selKey = null;
    prep = prepare(graph);
    if (!prep.nodes.length) {
      layout = null; content = ''; bounds = { x: 0, y: 0, w: 0, h: 0 };
      vp.innerHTML = '';
      setHint(graph.empty || 'Empty schematic — this unit has no ports, logic or instances.');
      hint.classList.add('empty');
      return;
    }
    hint.classList.remove('empty');
    const sig = signature(graph, prep);
    let res = layoutCache.get(sig);
    if (!res) {
      setHint(`Laying out ${prep.nodes.length} symbols…`);
      vp.style.opacity = '0.35';
      try {
        const { elk } = await getElk(elkBase);
        try { res = await elk.layout(toElk(prep)); }
        catch (err) {
          // worker trouble -> retry on the main thread once
          console.warn('[schematic] ELK worker layout failed, retrying in main thread', err);
          const b = await bundledElk(elkBase);
          res = await b.layout(toElk(prep));
        }
      } catch (err) {
        console.error('[schematic] layout failed', err);
        res = naiveLayout(prep);
        res._failed = String(err?.message || err);
      }
      if (layoutCache.size > 64) layoutCache.delete(layoutCache.keys().next().value);
      layoutCache.set(sig, res);
    }
    if (my !== token || destroyed) return;
    vp.style.opacity = '';
    layout = res; layout._sig = sig;
    render();
    setHint(res._failed ? `Layout engine unavailable (${res._failed}); showing a simple placement.` : '');
    const saved = viewCache.get(graph.id + '|' + sig);
    if (saved && !saved.auto) { view = { ...saved }; autoFit = false; applyView(); } else initialView();
  }

  // ---------------- render
  function render() {
    const pos = new Map();
    for (const c of layout.children || []) pos.set(c.id, c);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const grow = (x, y) => { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; };

    // nets
    edgeNet = new Map(); netInfo = new Map();
    for (const e of prep.edges) {
      const key = e.net ? `n:${e.net}` : `d:${e.from.node}\u0001${e.from.port}`;
      edgeNet.set(e._eid, key);
      let ni = netInfo.get(key);
      if (!ni) {
        ni = { key, net: e.net || null, name: e.net ? leaf(e.net) : '', w: e.w || 1, edges: [], from: e.from, sinks: [] };
        netInfo.set(key, ni);
      }
      ni.edges.push(e);
      ni.sinks.push(e.to);
      if ((e.w || 1) > ni.w) ni.w = e.w;
    }

    const routes = new Map();
    for (const le of layout.edges || []) {
      const pts = [];
      for (const s of le.sections || []) {
        if (!pts.length) pts.push(s.startPoint);
        for (const b of s.bendPoints || []) pts.push(b);
        pts.push(s.endPoint);
      }
      routes.set(le.id, { pts, junctions: le.junctionPoints || [] });
    }

    // --- edges
    let eh = '';
    const junctions = new Map();
    const netLabelDone = new Set(), widthDone = new Set(), labelSegs = new Map();
    let labels = '';
    for (const e of prep.edges) {
      const r = routes.get(e._eid);
      if (!r || r.pts.length < 2) continue;
      const key = edgeNet.get(e._eid);
      const dstW = prep.shapes.get(e.to.node)?.pins[e.to.port]?.w;
      const ew = Math.min(e.w || 1, dstW > 0 ? dstW : Infinity);
      const bus = ew > 1;
      const d = 'M' + r.pts.map(p => `${r1(p.x)},${r1(p.y)}`).join('L');
      for (const p of r.pts) grow(p.x, p.y);
      eh += `<g class="edge${bus ? ' bus' : ''}" data-net="${esc(key)}" data-e="${esc(e._eid)}"><path class="hit" d="${d}"/><path class="wire" d="${d}"/></g>`;
      for (const j of r.junctions) junctions.set(`${r1(j.x)},${r1(j.y)}`, { key, bus, x: j.x, y: j.y });

      // bus slash + width near the driver (once per net)
      const srcKind = prep.byId.get(e.from.node)?.kind;
      if (bus && !widthDone.has(key) && !BOXES.has(srcKind)) {
        widthDone.add(key);
        const p0 = r.pts[0], p1 = r.pts[1];
        if (Math.abs(p0.y - p1.y) < 0.5 && Math.abs(p1.x - p0.x) >= 14) {
          const dir = p1.x > p0.x ? 1 : -1, x = p0.x + dir * 7;
          labels += `<g class="wann" data-net="${esc(key)}"><line class="slash" x1="${r1(x - 3)}" y1="${r1(p0.y + 4)}" x2="${r1(x + 3)}" y2="${r1(p0.y - 4)}"/>`
            + `<text class="wtext" x="${r1(x)}" y="${r1(p0.y + 12)}" text-anchor="middle">${e.w}</text></g>`;
        }
      }
      // net name, once per net, on the first long-enough horizontal run near the source
      const ni = netInfo.get(key);
      const srcNode = prep.byId.get(e.from.node), dstNode = prep.byId.get(e.to.node);
      const name = ni.name;
      const lab = e.label && e.label !== name ? e.label : '';
      if (name && !netLabelDone.has(key)) {
        const redundant = srcNode && ['in', 'inout', 'netlabel'].includes(srcNode.kind) && srcNode.label === name;
        const allToOut = ni.sinks.every(s => { const n = prep.byId.get(s.node); return n?.kind === 'out' && n.label === name; });
        if (redundant || allToOut) netLabelDone.add(key);
      }
      if (name && !netLabelDone.has(key)) {
        // collect horizontal runs; the label is placed after all edges are known
        let segs = labelSegs.get(key);
        if (!segs) labelSegs.set(key, segs = []);
        const sinkW = lab ? textW(lab, FONT_SMALL) + 8 : 0;
        for (let i = 0; i < r.pts.length - 1; i++) {
          const a = r.pts[i], b = r.pts[i + 1];
          if (Math.abs(a.y - b.y) > 0.5 || Math.abs(b.x - a.x) < 1) continue;
          let x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x);
          if (i === 0) x1 += bus ? 18 : 3;
          if (i === r.pts.length - 2) x2 -= sinkW;
          segs.push({ x1, x2, y: a.y });
        }
      }
      // per-sink labels for slices (e.g. count[3]) near the sink end
      if (lab && !(dstNode && dstNode.kind === 'out' && dstNode.label === lab)) {
        const tw = textW(lab, FONT_SMALL);
        const n = r.pts.length;
        const a = r.pts[n - 2], b = r.pts[n - 1];
        if (Math.abs(a.y - b.y) < 0.5 && Math.abs(b.x - a.x) >= tw + 8) {
          labels += `<text class="netlabel sink" data-net="${esc(key)}" x="${r1(b.x - 4)}" y="${r1(b.y - 3)}" text-anchor="end">${esc(lab)}</text>`;
        }
      }
    }
    // net names: longest junction-free horizontal run, text left-aligned in it
    const jByY = new Map();
    for (const j of junctions.values()) { const k = Math.round(j.y); let a = jByY.get(k); if (!a) jByY.set(k, a = []); a.push(j.x); }
    for (const [key, segs] of labelSegs) {
      const name = netInfo.get(key).name;
      const tw = textW(name, FONT_SMALL);
      let best = null;
      for (const sg of segs) {
        const cuts = (jByY.get(Math.round(sg.y)) || []).filter(x => x > sg.x1 && x < sg.x2).sort((a, b) => a - b);
        let lo = sg.x1;
        for (const c of [...cuts, sg.x2]) {
          const hi = c === sg.x2 ? c : c - 4;
          if (hi - lo >= tw + 8 && (!best || hi - lo > best.hi - best.lo + 0.5 || (Math.abs(hi - lo - (best.hi - best.lo)) <= 0.5 && sg.y < best.y))) best = { lo, hi, y: sg.y };
          lo = c + 4;
        }
        if (best && best.hi - best.lo > 4 * tw) break;    // good enough, keep it near the source
      }
      if (best) labels += `<text class="netlabel" data-net="${esc(key)}" x="${r1(best.lo + 4)}" y="${r1(best.y - 3)}">${esc(name)}</text>`;
    }
    let jh = '';
    for (const j of junctions.values()) jh += `<circle class="junction${j.bus ? ' bus' : ''}" data-net="${esc(j.key)}" cx="${r1(j.x)}" cy="${r1(j.y)}" r="${j.bus ? 3.2 : 2.4}"/>`;

    // --- nodes
    let nh = '';
    for (const n of prep.nodes) {
      const p = pos.get(n.id); if (!p) continue;
      const s = prep.shapes.get(n.id);
      grow(p.x - 4, p.y - 4); grow(p.x + s.w + 4, p.y + s.h + 4);
      const kcls = `k-${n.kind}${n.gate ? ' g-' + n.gate : ''}`;
      const openable = (n.kind === 'inst' && n.ref?.inst) || (n.ref?.file && ['gate', 'reg', 'comb', 'tb', 'blackbox'].includes(n.kind));
      nh += `<g class="node ${kcls}${openable ? ' openable' : ''}" data-node="${esc(n.id)}" transform="translate(${r1(p.x)},${r1(p.y)})">`
        + `<rect class="nodehit" x="0" y="0" width="${r1(s.w)}" height="${r1(s.h)}"/>${s.body}</g>`;
    }
    if (!isFinite(minX)) { minX = minY = 0; maxX = maxY = 100; }
    bounds = { x: minX - 10, y: minY - 10, w: maxX - minX + 20, h: maxY - minY + 20 };
    content = `<g class="edges">${eh}</g><g class="anns">${labels}</g><g class="juncs">${jh}</g><g class="nodes">${nh}</g>`;
    vp.innerHTML = content;
    // indices
    nodeEls = new Map();
    for (const el of vp.querySelectorAll('.node')) nodeEls.set(el.dataset.node, el);
    netEls = new Map();
    for (const el of vp.querySelectorAll('[data-net]')) {
      const k = el.dataset.net;
      let a = netEls.get(k); if (!a) netEls.set(k, a = []);
      a.push(el);
    }
  }

  // ---------------- hover / selection
  const keyOfTarget = t => {
    if (!(t instanceof Element)) return null;
    const ne = t.closest('[data-node]');
    if (ne && vp.contains(ne)) return 'N:' + ne.dataset.node;
    const ee = t.closest('[data-net]');
    if (ee && vp.contains(ee)) return 'E:' + ee.dataset.net;
    return null;
  };
  function elsOf(key) {
    if (!key) return [];
    if (key.startsWith('N:')) { const el = nodeEls.get(key.slice(2)); return el ? [el] : []; }
    return netEls.get(key.slice(2)) || [];
  }
  function mark(key, cls, on) { for (const el of elsOf(key)) el.classList.toggle(cls, on); }
  function setHover(key) {
    if (key === hoverKey) return;
    mark(hoverKey, 'hover', false);
    hoverKey = key;
    mark(hoverKey, 'hover', true);
    // a hovered node also lights its attached wires faintly
  }
  function select(key) {
    mark(selKey, 'sel', false);
    selKey = key;
    mark(selKey, 'sel', true);
    if (!key) { onSelect?.(null); return; }
    if (key.startsWith('N:')) {
      const n = prep.byId.get(key.slice(2));
      onSelect?.({ kind: 'node', id: n.id, node: n, ref: n.ref || null });
    } else {
      const ni = netInfo.get(key.slice(2));
      if (ni) onSelect?.({ kind: 'net', net: ni.net, name: ni.name, w: ni.w, edges: ni.edges.map(e => e.id ?? e._eid), from: ni.from, to: ni.sinks });
    }
  }

  // ---------------- tooltip
  function hideTip() { tip.hidden = true; }
  function tipHtml(key, target) {
    if (key.startsWith('N:')) {
      const n = prep.byId.get(key.slice(2)); if (!n) return '';
      const pinEl = target.closest?.('[data-pin]');
      const pin = pinEl ? (n.ports || []).find(p => String(p.id) === pinEl.dataset.pin) : null;
      const rows = [];
      const kindName = { in: 'Input port', out: 'Output port', inout: 'Bidirectional port', inst: 'Instance', blackbox: 'Black box (module not found)', reg: 'Clocked process', comb: 'Combinational logic', tb: 'Testbench process', const: 'Constant', netlabel: 'Net (driven elsewhere)' }[n.kind];
      if (n.kind === 'inst' || n.kind === 'blackbox') rows.push(`<b>${esc(n.label)}</b> : ${esc(n.sub)}`);
      else if (n.kind === 'gate') rows.push(`<b>${esc(n.gate)}</b>${n.label && n.label !== n.gate ? ` <span class="m">${esc(n.label)}</span>` : ''}${n.w > 1 ? ` <span class="m">[${n.w}]</span>` : ''}`);
      else rows.push(`<b>${esc(n.label)}</b>${n.sub && n.sub !== n.label ? ` <span class="m">${esc(n.sub)}</span>` : ''}`);
      if (kindName) rows.push(`<span class="m">${kindName}</span>`);
      if (Array.isArray(n.params) && n.params.length) rows.push(`<span class="m">generics:</span> ${n.params.map(esc).join(', ')}`);
      if (pin) rows.push(`<hr>pin <b>${esc(pin.label || pin.id)}</b>${pin.w > 1 ? ` [${pin.w}]` : ''}${pin.clock ? ' (clock)' : ''}${pin.reset ? ' (reset)' : ''}${pin.conn ? ` ⇐ <code>${esc(pin.conn)}</code>` : ''}`);
      else if (BOXES.has(n.kind) && (n.ports || []).some(p => p.conn)) {
        const list = n.ports.slice(0, 16).map(p => `${esc(p.label)} ${p.side === 'E' ? '⇒' : '⇐'} <code>${esc(p.conn ?? '')}</code>`);
        if (n.ports.length > 16) list.push(`… ${n.ports.length - 16} more`);
        rows.push('<hr>' + list.join('<br>'));
      }
      if (n.ref?.sig) rows.push(`<span class="m">net:</span> ${esc(n.ref.sig)}`);
      if (n.ref?.file) rows.push(`<span class="m">${esc(n.ref.file)}${n.ref.line ? ':' + n.ref.line : ''}</span>`);
      if (n.kind === 'inst' && n.ref?.inst) rows.push('<i>Double-click to push into this instance</i>');
      else if (n.ref?.file && n.kind !== 'in' && n.kind !== 'out') rows.push('<i>Double-click to open source</i>');
      return rows.join('<br>').replace(/<br><hr>/g, '<hr>');
    }
    const ni = netInfo.get(key.slice(2)); if (!ni) return '';
    const drv = prep.byId.get(ni.from.node);
    const rows = [`net <b>${esc(ni.name || '(unnamed)')}</b>${ni.w > 1 ? ` [${ni.w - 1}:0]` : ''}`];
    rows.push(`<span class="m">width ${ni.w} bit${ni.w > 1 ? 's' : ''}, ${ni.sinks.length} load${ni.sinks.length > 1 ? 's' : ''}</span>`);
    if (ni.net) rows.push(`<span class="m">${esc(ni.net)}</span>`);
    if (drv) rows.push(`<span class="m">driver:</span> ${esc(drv.kind === 'gate' ? drv.gate : drv.label)}`);
    return rows.join('<br>');
  }
  function showTip(key, target, cx, cy) {
    const html = tipHtml(key, target);
    if (!html) { hideTip(); return; }
    if (tip.innerHTML !== html) tip.innerHTML = html;
    tip.hidden = false;
    const r = container.getBoundingClientRect();
    let x = cx - r.left + 14, y = cy - r.top + 16;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    if (x + tw > r.width - 4) x = Math.max(4, cx - r.left - tw - 10);
    if (y + th > r.height - 4) y = Math.max(4, cy - r.top - th - 10);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }

  // ---------------- pointer interaction
  let drag = null;
  let tipTimer = null;
  svg.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.button !== 1) return;
    container.focus({ preventScroll: true });
    clearTimeout(tipTimer); hideTip();
    const onItem = keyOfTarget(e.target);
    drag = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false, pan: e.button === 1 || !onItem, key: onItem, id: e.pointerId };
    if (drag.pan) { svg.setPointerCapture(e.pointerId); }
    if (e.button === 1) e.preventDefault();
  });
  svg.addEventListener('pointermove', e => {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 3) { drag.moved = true; if (drag.pan) { container.classList.add('panning'); hideTip(); } }
      if (drag.pan && drag.moved) { autoFit = false; view.tx = drag.tx + dx; view.ty = drag.ty + dy; applyView(); return; }
    }
    const key = keyOfTarget(e.target);
    setHover(key);
    clearTimeout(tipTimer);
    if (key) { const t = e.target, cx = e.clientX, cy = e.clientY; tipTimer = setTimeout(() => showTip(key, t, cx, cy), tip.hidden ? 350 : 0); }
    else hideTip();
  });
  const endDrag = e => {
    if (!drag) return;
    const d = drag; drag = null;
    container.classList.remove('panning');
    try { svg.releasePointerCapture(d.id); } catch { /* not captured */ }
    if (!d.moved && e.type === 'pointerup' && e.button === 0) select(d.key);
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
  svg.addEventListener('pointerleave', () => { setHover(null); clearTimeout(tipTimer); hideTip(); });
  svg.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
  svg.addEventListener('dblclick', e => {
    const key = keyOfTarget(e.target);
    if (!key || !key.startsWith('N:')) return;
    const n = prep?.byId.get(key.slice(2)); if (!n) return;
    hideTip();
    if (n.kind === 'inst' && n.ref?.inst) onOpenInstance?.(n.ref.inst);
    else if (n.ref?.file && n.kind !== 'in' && n.kind !== 'out' && n.kind !== 'inout') onOpenSource?.({ file: n.ref.file, line: n.ref.line || 1 });
  });
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    hideTip();
    const r = container.getBoundingClientRect();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomAt(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  container.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input,textarea,select')) return;
    if (e.key === 'f' || e.key === 'F') fit();
    else if (e.key === '+' || e.key === '=') zoomIn();
    else if (e.key === '-' || e.key === '_') zoomOut();
    else if (e.key === 'Backspace') { e.preventDefault(); goUp(); }
    else if (e.key === 'Escape') select(null);
    else return;
    e.preventDefault();
  });
  // Refit whenever the viewer changes size, until the user zooms or pans by hand.
  let lastSize = '';
  function onResize() {
    const { w, h } = size();
    const key = `${Math.round(w)}x${Math.round(h)}`;
    if (key === lastSize) return;
    lastSize = key;
    if (pendingFit) { fit(); return; }
    if (autoFit && layout) { clearTimeout(refitTimer); refitTimer = setTimeout(() => { if (autoFit) initialView(); }, 30); }
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
  ro?.observe(container);
  addEventListener('resize', onResize);

  // ---------------- export
  function exportSvg() {
    const pad = 20;
    const b = bounds.w ? bounds : { x: 0, y: 0, w: 200, h: 100 };
    const cs = getComputedStyle(container);
    const resolve = txt => txt.replace(/var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)/g, (_, v, fb) => (cs.getPropertyValue(v).trim() || fb || 'black'));
    let css = '';
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      for (const r of rules || []) {
        if (r.selectorText && r.selectorText.includes('.sch-svg ') && !/:hover|\.hover|\.sel\b|\.panning|\.sch-lod/.test(r.selectorText)) {
          css += resolve(r.cssText.replace(/\.sch-view\s+/g, '')) + '\n';
        }
      }
    }
    const bg = cs.getPropertyValue('--sch-bg').trim() || '#fff';
    const W = Math.ceil(b.w + 2 * pad), H = Math.ceil(b.h + 2 * pad);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="${SVGNS}" class="sch-svg" width="${W}" height="${H}" viewBox="${r1(b.x - pad)} ${r1(b.y - pad)} ${W} ${H}">`
      + `<title>${esc(meta.title || graph?.title || 'schematic')}</title><style>${css}</style>`
      + `<rect x="${r1(b.x - pad)}" y="${r1(b.y - pad)}" width="${W}" height="${H}" fill="${bg}"/>`
      + `<g class="sch-vp">${content}</g></svg>`;
  }

  function destroy() {
    destroyed = true; token++;
    clearTimeout(tipTimer);
    ro?.disconnect();
    removeEventListener("resize", onResize);
    container.innerHTML = '';
    container.classList.remove('sch-view', 'sch-lod', 'panning');
    container.style.backgroundSize = container.style.backgroundPosition = '';
  }

  renderCrumbs();
  applyView();
  return { show, fit, zoomIn, zoomOut, destroy, exportSvg, get selection() { return selKey; } };
}
