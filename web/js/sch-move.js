// The schematic editor's drags that change the drawing (#405: out of mountSchEditor): the selection moved, the wires
// it connects stretched (rubber-banding) or, with Keep Connections off, left where they were; one segment of a wire
// dragged (#688), its neighbours stretched, its ends kept on what they connect. mountMove(ctx) is called by
// mountSchEditor where this code was; keptEnds and rubber are the geometry of a wire, plain functions.
import { GRID, normalizeDoc, symbolPins } from '/core/schdoc.js';
import { connectivity, connectionsKept, moveSegment } from '/core/schroute.js';
import { clone, snap, onSeg, segDist, cleanPts } from './sch-editor.js';
import { moveGraphic } from '/core/schgraphics.js';

// a wire moved by (dx, dy), its kept ends where they were: joined by a jog square to its end segment
export function keptEnds(pts0, keep, dx, dy) {
  let pts = pts0.map(p => ({ x: p.x + dx, y: p.y + dy }));
  if (!keep || (!dx && !dy)) return pts;
  const join = (P, Q, T) => {   // P: the kept end, Q: the next point (before the move), T: P moved
    const horiz = P.y === Q.y && P.x !== Q.x;
    return horiz ? [P, { x: P.x, y: T.y }] : [P, { x: T.x, y: P.y }];
  };
  if (keep.a) pts = [...join(pts0[0], pts0[1], pts[0]), ...pts];
  if (keep.b) { const n = pts0.length; pts = [...pts, ...join(pts0[n - 1], pts0[n - 2], pts[pts.length - 1]).reverse()]; }
  pts = cleanPts(pts);
  return pts.length >= 2 ? pts : pts0;
}
// a wire with one end (a) or the other (b) on what moved by (dx, dy), stretched: its first segment along, or a jog added
// (anchors: points on it that must stay, a T-junction or a net name)
export function rubber(pts0, a, b, dx, dy, anchors = []) {
  let pts = pts0.map(p => ({ ...p }));
  if (a && b) return pts.map(p => ({ x: p.x + dx, y: p.y + dy }));
  if (b) pts = pts.reverse();
  const n = pts.length;
  const P0 = pts[0], P1 = pts[1];
  const horiz = P0.y === P1.y;
  const np = { x: P0.x + dx, y: P0.y + dy };
  // something else is attached to the first segment: keep it in place and add a jog near the end
  const pinned = anchors.some(q => onSeg(q, P0, P1) && !(q.x === P0.x && q.y === P0.y) && !(q.x === P1.x && q.y === P1.y));
  const along = horiz ? dy === 0 : dx === 0;
  if (along && (n === 2 || !pinned)) pts[0] = np;
  else if (pinned || n === 2) {
    const sx = Math.sign(P1.x - P0.x) || 1, sy = Math.sign(P1.y - P0.y) || 1;
    if (n === 2 && !pinned) {
      if (horiz) { const mx = snap((np.x + P1.x) / 2); pts = [np, { x: mx, y: np.y }, { x: mx, y: P1.y }, P1]; }
      else { const my = snap((np.y + P1.y) / 2); pts = [np, { x: np.x, y: my }, { x: P1.x, y: my }, P1]; }
    } else if (horiz) {
      const jx = np.x + sx * GRID;
      pts = [np, { x: jx, y: np.y }, { x: jx, y: P0.y }, ...pts.slice(1)];
    } else {
      const jy = np.y + sy * GRID;
      pts = [np, { x: np.x, y: jy }, { x: P0.x, y: jy }, ...pts.slice(1)];
    }
  } else {
    pts[0] = np;
    if (horiz) pts[1] = { x: P1.x, y: P1.y + dy }; else pts[1] = { x: P1.x + dx, y: P1.y };
  }
  pts = cleanPts(pts);
  if (b) pts.reverse();
  return pts.length >= 2 ? pts : pts0;
}

/** { beginMove, applyMove, beginSegMove, applySegMove, finishSegMove } of a schematic editor (doc(), modules(),
 *  keepConn(): its current ones; setDoc(d) replaces its document). */
export function mountMove(ctx) {
  const { doc, setDoc, modules, keepConn, selected, connPoints, snapshot, pushUndo, changed, render, renderProps, flash, nextId,
    refusedShort } = ctx;

  function beginMove(start) {
    const before = snapshot();
    const orig = clone({ symbols: doc().symbols, wires: doc().wires, ports: doc().ports, labels: doc().labels, ...(doc().graphics ? { graphics: doc().graphics } : {}) });
    const symIds = new Set(selected('sym')), portIds = new Set(selected('port')), wireIds = new Set(selected('wire')), labelIds = new Set(selected('label'));
    const graphicIds = new Set(selected('graphic'));   // (drawings, #2593: moved, nothing following them)
    const moved = new Set();
    for (const s of doc().symbols) if (symIds.has(s.id)) for (const p of symbolPins(s, modules())) moved.add(`${p.x},${p.y}`);
    for (const p of doc().ports) if (portIds.has(p.id)) moved.add(`${p.x},${p.y}`);
    // Keep connections: an end of a moved wire on a pin, a marker or a wire that stay stays there too
    // (the wire is joined to it by a jog), so the wire does not come off what it connects
    const keepEnds = {};
    if (keepConn()) {
      const stays = q => !moved.has(`${q.x},${q.y}`) && (
        doc().symbols.some(s => !symIds.has(s.id) && symbolPins(s, modules()).some(p => p.x === q.x && p.y === q.y)) ||
        doc().ports.some(p => !portIds.has(p.id) && p.x === q.x && p.y === q.y) ||
        doc().wires.some(w => !wireIds.has(w.id) && [w.points[0], w.points[w.points.length - 1]].some(p => p.x === q.x && p.y === q.y)));
      for (const w of doc().wires) if (wireIds.has(w.id)) {
        const a = stays(w.points[0]), b = stays(w.points[w.points.length - 1]);
        if (a || b) keepEnds[w.id] = { a, b };
      }
    }
    for (const w of doc().wires) if (wireIds.has(w.id)) w.points.forEach((p, i) => { const k = keepEnds[w.id]; if (!(k?.a && i === 0) && !(k?.b && i === w.points.length - 1)) moved.add(`${p.x},${p.y}`); });
    const attach = [];   // { wire id, ends: [bool start, bool end] }
    for (const w of doc().wires) {
      if (wireIds.has(w.id)) continue;
      const a = moved.has(`${w.points[0].x},${w.points[0].y}`), b = moved.has(`${w.points[w.points.length - 1].x},${w.points[w.points.length - 1].y}`);
      if (a || b) attach.push({ id: w.id, a, b });
    }
    // labels sitting on moved wires move too
    for (const l of doc().labels) {
      if (labelIds.has(l.id)) continue;
      if (doc().wires.some(w => wireIds.has(w.id) && w.points.some((p, i) => i + 1 < w.points.length && onSeg(l, p, w.points[i + 1])))) labelIds.add(l.id);
    }
    // points that must stay on the wires being stretched (T-junctions, net names)
    const anchors = [];
    for (const w of doc().wires) anchors.push(w.points[0], w.points[w.points.length - 1]);
    for (const l of doc().labels) if (!labelIds.has(l.id)) anchors.push({ x: l.x, y: l.y });
    if (!keepConn()) attach.length = 0;      // detach: the wires stay where they are
    // moved pins / markers and what they touch now
    const movedPts = [];
    for (const s of doc().symbols) if (symIds.has(s.id)) for (const p of symbolPins(s, modules())) movedPts.push({ key: `${s.id}/${p.name}`, x: p.x, y: p.y });
    for (const p of doc().ports) if (portIds.has(p.id)) movedPts.push({ key: `port:${p.id}`, x: p.x, y: p.y });
    const fixedPts = [];
    for (const s of doc().symbols) if (!symIds.has(s.id)) for (const p of symbolPins(s, modules())) fixedPts.push(p);
    for (const p of doc().ports) if (!portIds.has(p.id)) fixedPts.push(p);
    const wirePt = new Set();   // (the wires' ends: where they connect, #678)
    for (const w of doc().wires) for (const p of [w.points[0], w.points[w.points.length - 1]]) wirePt.add(`${p.x},${p.y}`);
    // pins/markers connected before the move: guarded against landing on other nets
    const guard = new Set(movedPts.filter(q => wirePt.has(`${q.x},${q.y}`) || fixedPts.some(f => f.x === q.x && f.y === q.y)).map(q => q.key));
    // touching a pin/marker directly (no wire): add a wire so the connection is kept
    const synth = [];
    if (keepConn()) {
      const done = new Set();
      for (const q of movedPts) {
        const k = `${q.x},${q.y}`;
        if (done.has(k) || wirePt.has(k) || !fixedPts.some(f => f.x === q.x && f.y === q.y)) continue;
        done.add(k);
        const w = { id: nextId('W', doc().wires), points: [{ x: q.x, y: q.y }, { x: q.x, y: q.y }] };
        doc().wires.push(w); orig.wires.push(clone(w));
        attach.push({ id: w.id, a: false, b: true });
        synth.push(w.id);
      }
    }
    let conn0 = null;
    try { conn0 = connectivity(doc(), modules()); } catch { /* checked only when available */ }
    return { kind: 'move', start, before, orig, symIds, portIds, wireIds, labelIds, graphicIds, attach, anchors, conn0, guard, synth, keepEnds, dx: 0, dy: 0 };
  }
  function applyMove(m, dx, dy) {
    if (dx === m.dx && dy === m.dy) return;
    m.dx = dx; m.dy = dy;
    const o = m.orig;
    for (const s of doc().symbols) if (m.symIds.has(s.id)) { const s0 = o.symbols.find(x => x.id === s.id); s.x = s0.x + dx; s.y = s0.y + dy; }
    for (const p of doc().ports) if (m.portIds.has(p.id)) { const p0 = o.ports.find(x => x.id === p.id); p.x = p0.x + dx; p.y = p0.y + dy; }
    for (const l of doc().labels) if (m.labelIds.has(l.id)) { const l0 = o.labels.find(x => x.id === l.id); l.x = l0.x + dx; l.y = l0.y + dy; }
    if (doc().graphics) doc().graphics = doc().graphics.map(g => (m.graphicIds?.has(g.id) ? moveGraphic(o.graphics.find(x => x.id === g.id), dx, dy) : g));
    for (const w of doc().wires) if (m.wireIds.has(w.id)) { const w0 = o.wires.find(x => x.id === w.id); w.points = keptEnds(w0.points, m.keepEnds?.[w.id], dx, dy); }
    for (const at of m.attach) {
      const w = doc().wires.find(x => x.id === at.id), w0 = o.wires.find(x => x.id === at.id);
      if (!w || !w0) continue;
      w.points = rubber(w0.points, at.a, at.b, dx, dy, m.anchors);
    }
    if (!moveFrame) moveFrame = requestAnimationFrame(() => { moveFrame = 0; render(); });
  }
  let moveFrame = 0;
  // ---------------- dragging one segment of a wire (#688)
  // its neighbours stretch, its ends stay on what they connect (a short segment added), the net names on
  // the segment go with it; the connections are not changed
  function beginSegMove(id, pt) {
    const w = doc().wires.find(x => x.id === id);
    if (!w) return null;
    let i = -1, best = Infinity;
    for (let k = 0; k + 1 < w.points.length; k++) { const dd = segDist(pt, w.points[k], w.points[k + 1]); if (dd < best) { best = dd; i = k; } }
    const a = w.points[i], b = w.points[i + 1];
    const hz = a.y === b.y && a.x !== b.x, vt = a.x === b.x && a.y !== b.y;
    if (!hz && !vt) return null;
    // an end connected to something (a pin, a marker, another wire's end) stays there
    const held = q => connPoints().some(c => c.x === q.x && c.y === q.y) || doc().wires.some(o => o !== w && [o.points[0], o.points[o.points.length - 1]].some(p => p.x === q.x && p.y === q.y));
    const P = w.points;
    const labels = doc().labels.filter(l => onSeg(l, a, b)).map(l => l.id);
    const others = doc().labels.filter(l => !labels.includes(l.id) && P.some((q, k) => k + 1 < P.length && onSeg(l, q, P[k + 1]))).map(l => l.id);
    let conn0 = null;
    try { conn0 = connectivity(doc(), modules()); } catch { /* checked only when available */ }
    return { kind: 'seg', before: snapshot(), id, i, hz, pts0: clone(P), keepA: held(P[0]), keepB: held(P[P.length - 1]), labels, others, labels0: clone(doc().labels), start: { x: snap(pt.x), y: snap(pt.y) }, conn0, d: 0 };
  }
  function applySegMove(m, d) {
    if (d === m.d) return;
    m.d = d;
    const w = doc().wires.find(x => x.id === m.id);
    if (!w) return;
    w.points = moveSegment(m.pts0, m.i, d, { keepA: m.keepA, keepB: m.keepB });
    for (const l of doc().labels) {
      const l0 = m.labels0.find(x => x.id === l.id);
      if (m.labels.includes(l.id)) { l.x = l0.x + (m.hz ? 0 : d); l.y = l0.y + (m.hz ? d : 0); continue; }
      if (!m.others.includes(l.id)) continue;
      // on a neighbour that shrank past it: put back on the wire, at its nearest point
      l.x = l0.x; l.y = l0.y;
      const P = w.points;
      if (P.some((q, k) => k + 1 < P.length && onSeg(l, q, P[k + 1]))) continue;
      let best = null;
      for (let k = 0; k + 1 < P.length; k++) {
        const q = P[k], r = P[k + 1];
        const c = { x: Math.max(Math.min(q.x, r.x), Math.min(Math.max(q.x, r.x), l0.x)), y: Math.max(Math.min(q.y, r.y), Math.min(Math.max(q.y, r.y), l0.y)) };
        const dd = Math.hypot(c.x - l0.x, c.y - l0.y);
        if (!best || dd < best.dd) best = { ...c, dd };
      }
      if (best) { l.x = best.x; l.y = best.y; }
    }
    if (!moveFrame) moveFrame = requestAnimationFrame(() => { moveFrame = 0; render(); });
  }
  function finishSegMove(m) {
    setDoc(normalizeDoc(doc()));
    if (refusedShort(m.before, 'The move')) return;
    if (m.conn0) {
      let now = null;
      try { now = connectivity(doc(), modules()); } catch { /* ignore */ }
      if (now && !connectionsKept(m.conn0, now)) flash('Connections changed by this move (a pin now touches another net, or a wire could not be routed). Undo with Ctrl+Z if not intended.');
    }
    pushUndo(m.before); changed(); render(); renderProps();
  }

  return { beginMove, applyMove, beginSegMove, applySegMove, finishSegMove };
}
