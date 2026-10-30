// The schematic editor's tools (#405: out of mountSchEditor): the tool in use and its options (a net name, an I/O
// marker's name and direction), a symbol placed, a wire drawn (routed square, nudged clear of other wires, pins and
// bodies, #948, its ends connecting, a short between two named nets refused, #754; curved, #1144: through the points
// clicked, its rectilinear path routed between its ends), a net name attached to a wire, an I/O marker added (joining a
// net of its name, #2170); the points a wire can connect to.
// mountTools(ctx) is called by mountSchEditor where this code was.
import { SYMBOLS, defaultParams, symbolDef, symbolPins, rotSize, freePortName, normalizeDoc, parseNetName, splitWiresAt, renameNet, netShort,
} from '/core/schdoc.js';
import { h } from './dom.js';
import { reservedError } from '/core/reserved.js';
import { nudgeWire, routePath, wireGrid, cleanPath } from '/core/schpath.js';
import { setCurve } from '/core/schcurve.js';
import { newMarkerDir } from '/core/schmarker.js';
import { clone, snap, onSeg, segDist, cleanPts } from './sch-editor.js';

/** { setTool, renderOpts, startPlace, placeAt, connPoints, pinNear, snapPoint, routeTo, finishWire, wireClick, netClick, ioClick } of a
 *  schematic editor (doc(), nl(), sel(), tool(), placing(), wireDraw(), …: its current ones; set({ tool, placing, wireDraw }) changes them). */
export function mountTools(ctx) {
  const { doc, nl, sel, modules, view, hoverPin, destroyed, tool, placing, wireDraw, curve, set, readOnly, canvas, optBox, container, edit, flash, shortNote,
    nextId, nextInstName, promptBox, renderPalette, render, renderOverlay, renderProps, updateToolbar, updateStatus, joinByName, joinMarker, renamed } = ctx;

  function setTool(t) {
    if (readOnly && t !== 'select') return;
    if (wireDraw()) finishWire();
    set({ tool: t });
    if (t !== 'place') set({ placing: null });
    canvas.dataset.tool = t;
    renderOpts();
    renderOverlay(); updateToolbar(); updateStatus();
    if (t !== 'place') renderPalette();
  }
  const netNameInput = h('input', { type: 'text', class: 'se-optin', placeholder: 'net name' });
  function renderOpts() {
    optBox.innerHTML = '';
    if (tool() === 'net') optBox.append(h('label', { text: 'Name:' }), netNameInput);
    // (Add I/O Marker: no options, its name asked, its direction its pins', #1109, #1180)
    else if (tool() === 'place' && placing()) optBox.append(h('span', { class: 'se-placing', text: `Placing ${placing().type === 'module' ? placing().params.module : (placing().preset || SYMBOLS[placing().type]?.title || placing().type)}` }));
  }
  function startPlace(it) {
    if (wireDraw()) finishWire();
    set({ placing: { type: it.type, params: { ...defaultParams(it.type), ...clone(it.params || {}) }, rot: 0, mirror: false, preset: it.preset || null } });
    if (it.type === 'module') {
      const m = modules()[it.params.module];
      if (m) placing().params.ports = m.ports.map(p => ({ name: p.name, dir: p.dir, width: p.width }));
    }
    set({ tool: 'place' });
    canvas.dataset.tool = 'place';
    sel().clear();
    renderOpts(); renderPalette(); render(); renderProps();
    container.focus({ preventScroll: true });
  }
  function placeAt(pt, src = placing()) {
    if (!src) return;
    edit(() => {
      const s = { id: nextId('S', doc().symbols), type: src.type, x: 0, y: 0, rot: src.rot || 0, mirror: !!src.mirror, name: nextInstName(), params: clone(src.params) };
      const def = symbolDef(s, modules());
      const sz = rotSize(s, def);
      s.x = snap(pt.x - sz.w / 2); s.y = snap(pt.y - sz.h / 2);
      doc().symbols.push(s);
      // its pins dropped onto a wire connect there (#170): the wire split at them (#678)
      splitWiresAt(doc(), symbolPins(s, modules(), def));
      if (tool() !== 'place') { sel().clear(); sel().add(`sym:${s.id}`); }
    });
    // keep the keyboard on the editor (Esc, Ctrl+R / Ctrl+M while placing())
    setTimeout(() => { if (!destroyed() && container.isConnected) container.focus({ preventScroll: true }); }, 0);
  }

  // all connectable points (pins, I/O markers, wire vertices)
  function connPoints() {
    const pts = [];
    for (const s of doc().symbols) for (const p of symbolPins(s, modules())) pts.push({ x: p.x, y: p.y, pin: p, sym: s });
    for (const p of doc().ports) pts.push({ x: p.x, y: p.y, port: p });
    return pts;
  }
  function pinNear(pt, tol = 7 / Math.max(0.3, view().s)) {
    let best = null, bd = tol;
    for (const c of connPoints()) { const d = Math.hypot(c.x - pt.x, c.y - pt.y); if (d <= bd) { bd = d; best = c; } }
    return best;
  }
  // the wire under pt: { w, i (its segment) } or, curved (#1144), { w, at (the point of its path answering pt) }
  function wireNear(pt, tol = 5 / Math.max(0.3, view().s)) {
    if (curve.curved()) return curve.wireAt(pt, tol);
    for (const w of doc().wires) for (let i = 0; i + 1 < w.points.length; i++) if (segDist(pt, w.points[i], w.points[i + 1]) <= tol) return { w, i };
    return null;
  }
  function snapPoint(pt) { const p = hoverPin() || null; return p ? { x: p.x, y: p.y } : { x: snap(pt.x), y: snap(pt.y) }; }
  // orthogonal route from a to b
  function routeTo(a, b, wd) {
    if (a.x === b.x || a.y === b.y || curve.curved()) return [b];   // (curved, #1144: the point itself)
    let first = 'h';
    const pts = wd.pts;
    if (pts.length >= 2) { const p = pts[pts.length - 2]; first = p.y === a.y ? 'v' : 'h'; }
    else if (wd.startSide) first = wd.startSide === 'N' || wd.startSide === 'S' ? 'v' : 'h';
    else first = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'h' : 'v';
    return first === 'h' ? [{ x: b.x, y: a.y }, b] : [{ x: a.x, y: b.y }, b];
  }
  // curved (#1144): the wire's rectilinear path routed between the ends of the points drawn (clicked, or a stroke's)
  function curvedPath(knots) {
    const a = knots[0], b = knots[knots.length - 1];
    if (a.x === b.x && a.y === b.y) return [a];
    let pts = null;
    try { pts = routePath(wireGrid(doc(), { modules: modules() }), a, b); } catch (err) { console.error(err); }
    return pts || cleanPath([a, { x: b.x, y: a.y }, b]);
  }
  function finishWire() {
    if (!wireDraw()) return;
    // (curved, #1144: the points drawn through kept as the wire's own curve)
    let knots = wireDraw().knots || (curve.curved() ? wireDraw().pts.filter((p, i, a) => !i || p.x !== a[i - 1].x || p.y !== a[i - 1].y) : null);
    // (nudged onto a clear path where it would run along another wire, over a pin or through a body, #948)
    const pts = knots ? curvedPath(knots) : nudgeWire(doc(), cleanPts(wireDraw().pts), { modules: modules() });
    if (knots && knots.length < 2) knots = null;
    set({ wireDraw: null });
    const wire = id => (knots ? setCurve({ id, points: pts }, knots.slice(1, -1)) : { id, points: pts });
    // the wire connects at its ends only (#678): an end on another wire's segment or bend splits that
    // wire there (a T-junction), unless it is on a pin or a marker (connected to that one); what the
    // wire passes over stays apart
    const ends = [pts[0], pts[pts.length - 1]].filter(q => !connPoints().some(c => c.x === q.x && c.y === q.y));
    if (pts.length < 2) { renderOverlay(); return; }
    // a wire between two named nets is refused, as in ISE (#754): rename one of them, or give both the same name
    const trial = clone(doc());
    splitWiresAt(trial, ends); trial.wires.push(wire(nextId('W', trial.wires)));
    const short = netShort(doc(), normalizeDoc(trial), { modules: modules() });
    if (short) { shortNote('The wire', short); renderOverlay(); return; }
    edit(() => { splitWiresAt(doc(), ends); doc().wires.push(wire(nextId('W', doc().wires))); }, { keepProps: true });
  }
  function wireClick(pt, dbl) {
    // (curved, #1144: on a wire's curve, the point of its path answering it)
    const cw = curve.curved() && !hoverPin() ? curve.wireAt(pt) : null;
    const p = cw ? cw.at : snapPoint(pt);
    if (!wireDraw()) {
      const near = pinNear(pt);
      set({ wireDraw: { pts: [p], startSide: near?.pin?.side || (near?.port ? (near.port.dir === 'in' ? 'E' : 'W') : null) } });
      renderOverlay();
      return;
    }
    const last = wireDraw().pts[wireDraw().pts.length - 1];
    if (dbl) { finishWire(); return; }
    if (last.x === p.x && last.y === p.y) return;
    wireDraw().pts.push(...routeTo(last, p, wireDraw()));
    // end on a pin / marker / another wire
    const onPin = pinNear(pt);
    const onWire = !!cw || doc().wires.some(w => w.points.some((q, i) => i + 1 < w.points.length && onSeg(p, q, w.points[i + 1])));
    if (onPin || onWire) finishWire(); else renderOverlay();
  }
  async function netClick(pt) {
    const hit = wireNear(pt);
    if (!hit) { flash('Click on a wire to attach the net name'); return; }
    const a = hit.w.points[hit.i], b = hit.w.points[hit.i + 1];
    const at = hit.at || (a.x === b.x ? { x: a.x, y: Math.max(Math.min(a.y, b.y), Math.min(Math.max(a.y, b.y), snap(pt.y))) } : { x: Math.max(Math.min(a.x, b.x), Math.min(Math.max(a.x, b.x), snap(pt.x))), y: a.y });
    let name = netNameInput.value.trim();
    if (!name) name = await promptBox(pt, 'Net name', nl()?.wireNet.get(hit.w.id)?.auto ? '' : (nl()?.wireNet.get(hit.w.id)?.name || ''));
    if (!name) return;
    const pn = parseNetName(name);
    if (pn.bad) { flash(`Invalid net name '${name}'`); return; }
    if (reservedError(pn.base)) { flash(`${reservedError(pn.base)}: choose another name.`); return; }   // (#679)
    if (!await joinByName(name, nl()?.wireNet.get(hit.w.id))) return;
    edit(() => {
      const n = nl()?.wireNet.get(hit.w.id);
      const ex = n && doc().labels.find(l => nl().labelNet.get(l.id) === n && Math.hypot(l.x - at.x, l.y - at.y) < 1);
      if (ex) renamed(renameNet(doc(), nl(), n, name, ex.id), name);   // (#734) the whole net connected by name
      else doc().labels.push({ id: nextId('L', doc().labels), x: at.x, y: at.y, net: name });
    }, { keepProps: true });
    // auto increment trailing numbers (d0 -> d1)
    if (netNameInput.value.trim()) { const m = /^(.*?)(\d+)(\)?)$/.exec(name); if (m) netNameInput.value = `${m[1]}${+m[2] + 1}${m[3]}`; }
  }
  async function ioClick(pt) {
    const near = pinNear(pt);
    // (curved, #1144: on a wire's curve, at the point of its path answering it)
    const cw = !near && curve.curved() ? curve.wireAt(pt) : null;
    const p = near ? { x: near.x, y: near.y } : cw ? cw.at : { x: snap(pt.x), y: snap(pt.y) };
    if (near?.port) { flash('There is already an I/O marker here'); return; }
    let width = 1, suggest = '';
    const net = near?.pin ? nl()?.pinNet.get(`${near.sym.id}/${near.pin.name}`) : nl()?.wireNet.get(cw ? cw.w.id : wireNear(p, 0.5)?.w.id);
    if (near?.pin) width = near.pin.width || net?.width || 1;
    else if (net) width = net.width;
    // its direction what it is on (a pin's, a net's: #1109); on empty space that of the marker added last (#2170); a
    // marker of 1 bit there, with the next free name, wired later (#680)
    let dir = newMarkerDir(doc(), { pin: near?.pin, net });
    const taken = new Set(doc().ports.map(q => q.name.toLowerCase()));
    if (net && !net.auto && !net.ports.length && !taken.has(net.name.toLowerCase())) suggest = net.name;
    if (!near?.pin && !net) suggest = freePortName(doc(), dir);
    for (;;) {
      const name = await promptBox(pt, `${dir === 'in' ? 'Input' : dir === 'out' ? 'Output' : 'Bidirectional'} port name`, suggest);
      if (!name) return;
      if (taken.has(name.toLowerCase())) { flash(`An I/O marker named '${name}' already exists`); return; }
      if (reservedError(name)) { flash(`${reservedError(name)}: choose another name.`); return; }   // (#679)
      // the name of another net (#2170): joined (its width; unconnected, its direction too), or another name asked
      const j = await joinMarker(name, net);
      if (j === false) continue;
      if (j) { width = j.width; if (!near?.pin && !net) dir = newMarkerDir(doc(), { net: j.net }); }
      edit(() => { if (!near) splitWiresAt(doc(), [p]); doc().ports.push({ id: nextId('P', doc().ports), name, dir, width, x: p.x, y: p.y }); }, { keepProps: true });
      return;
    }
  }

  return { setTool, renderOpts, startPlace, placeAt, connPoints, pinNear, snapPoint, routeTo, finishWire, wireClick, netClick, ioClick };
}
