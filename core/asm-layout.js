// Silinx - the layout of an ASM chart recovered from HDL (#405: out of asm-from-hdl.js): the boxes placed top-down
// (state by state, a block's decisions and outputs under its state, case exits side by side) and, when a previous
// chart of the same machine is given, its ids, positions and edge points reused wherever the boxes match.
// Isomorphic ES module: no DOM and no Node APIs.
//
//   asmLayout(model)                -> copy of the model with x/y assigned (top-down layout)
//   reusePrevious(model, previous)  -> the model with the previous chart's ids, positions and edge points
import { normalizeModel, parseCondition, parseAction, exprToString, asmJoinPoints } from './asm.js';
import { clone } from './asm-hdl-util.js';
import { condKey, valueLits } from './asm-from-hdl.js';

// ---------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------
// Node sizes follow web/js/asm-editor.js (centre coordinates, 20-unit grid).

const GRID = 20;
const CHW = 7.25;
const ceilTo = (v, g) => Math.ceil(v / g) * g;

export function nodeSize(n) {
  if (n.type === 'state' || n.type === 'always') {
    const lines = n.actions && n.actions.length ? n.actions : [''];
    const tw = Math.max(...lines.map((l) => l.length)) * CHW;
    return { w: Math.max(140, ceilTo(tw + 32, 2 * GRID)), h: Math.max(60, ceilTo(lines.length * 17 + 26, GRID)) };
  }
  if (n.type === 'decision') {
    const tw = Math.max(3, (n.cond || '').length) * CHW;
    const w = Math.max(140, ceilTo(tw * 1.25 + 56, 2 * GRID));
    return { w, h: w > 260 ? 100 : 80 };
  }
  if (n.type === 'case') {
    const tw = Math.max(3, (n.expr || '').length) * CHW;
    return { w: Math.max(160, ceilTo(tw + 80, 2 * GRID)), h: 60 };
  }
  const lines = n.actions && n.actions.length ? n.actions : [''];
  const tw = Math.max(...lines.map((l) => l.length)) * CHW;
  return { w: Math.max(120, ceilTo(tw + 44, 2 * GRID)), h: Math.max(40, ceilTo(lines.length * 17 + 16, GRID)) };
}

const VGAP = 40;       // vertical gap between boxes of a block
const HGAP = 60;       // horizontal gap between the true and false branches
const BLOCK_GAP = 50;  // vertical gap between state blocks
const X0 = 200, Y0 = 80;
const snap = (v) => Math.round(v / 10) * 10;

/** Targets of the exits of a case box, in chart order. */
const caseTargets = (m, id) => m.edges.filter((e) => e.from === id).map((e) => e.to);

/** Exits of every node: id -> { next|true|false: targetId }. */
export function exitsOf(m) {
  const ex = new Map();
  for (const e of m.edges) {
    if (!ex.has(e.from)) ex.set(e.from, {});
    const o = ex.get(e.from);
    if (!o[e.port]) o[e.port] = e.to;
  }
  return ex;
}

/** States in breadth-first order from the initial state (unreachable ones last). */
function stateOrder(m, byId, ex) {
  const states = m.nodes.filter((n) => n.type === 'state');
  const order = [];
  const seen = new Set();
  const q = [];
  const push = (id) => { if (byId.get(id)?.type === 'state' && !seen.has(id)) { seen.add(id); q.push(id); } };
  push(m.initial);
  while (q.length) {
    const s = q.shift();
    order.push(s);
    // (each box of the block once: a box reached again, where branches meet, adds no state that its first visit did not,
    // #3582)
    const visit = (id, seenBox) => {
      const n = byId.get(id);
      if (!n || seenBox.has(id)) return;
      if (n.type === 'state') { push(id); return; }
      seenBox.add(id);
      const e = ex.get(id) || {};
      if (n.type === 'decision') { visit(e.true, seenBox); visit(e.false, seenBox); }
      else if (n.type === 'case') for (const t of caseTargets(m, id)) visit(t, seenBox);
      else visit(e.next, seenBox);
    };
    visit((ex.get(s) || {}).next, new Set());
  }
  for (const s of states) if (!seen.has(s.id)) order.push(s.id);
  return order;
}

/** Assign x/y to every node: state blocks top-down in BFS order, true branches below, false to the right. */
export function asmLayout(model) {
  const m = clone(model);
  m.nodes = m.nodes || [];
  m.edges = m.edges || [];
  const norm = normalizeModel(m);
  const byId = new Map(norm.nodes.map((n) => [n.id, n]));
  const ex = exitsOf(norm);
  const pos = new Map();
  const placed = new Set();
  let y = Y0 - 30;
  const place = (id, x, top) => { // returns { bottom, right }
    const n = byId.get(id);
    const { w, h } = nodeSize(n);
    const cy = snap(top + h / 2);
    pos.set(id, { x: snap(x), y: cy });
    placed.add(id);
    let bottom = cy + h / 2, right = x + w / 2;
    const e = ex.get(id) || {};
    const child = (cid) => cid != null && byId.has(cid) && byId.get(cid).type !== 'state' && !placed.has(cid);
    const below = cy + h / 2 + VGAP;
    if (n.type === 'case') { // exits side by side below the box, from left to right
      let cx = x, first = true;
      for (const t of caseTargets(norm, id)) {
        if (!child(t)) continue;
        const tw = nodeSize(byId.get(t)).w;
        if (!first) cx = right + HGAP + tw / 2;
        const r = place(t, cx, below + 26);
        bottom = Math.max(bottom, r.bottom); right = Math.max(right, r.right);
        first = false;
      }
    } else if (n.type === 'decision') {
      let tRight = x + w / 2;
      if (child(e.true)) {
        const r = place(e.true, x, below);
        bottom = Math.max(bottom, r.bottom); tRight = Math.max(tRight, r.right);
      }
      if (child(e.false)) {
        const fn = byId.get(e.false);
        const fw = nodeSize(fn).w;
        const r = place(e.false, tRight + HGAP + fw / 2, below);
        bottom = Math.max(bottom, r.bottom); right = Math.max(right, r.right);
      }
      right = Math.max(right, tRight);
    } else if (child(e.next)) {
      const r = place(e.next, x, below);
      bottom = Math.max(bottom, r.bottom); right = Math.max(right, r.right);
    }
    return { bottom, right };
  };
  for (const sid of stateOrder(norm, byId, ex)) {
    const r = place(sid, X0, y);
    y = ceilTo(r.bottom + BLOCK_GAP, 10);
  }
  // every-cycle blocks: one column each, to the right of the state blocks; a decision's 1
  // branch goes below it, its 0 branch to the right, and the box where both branches join
  // again below both
  const join = asmJoinPoints(norm);
  const inBlock = (id) => id != null && byId.has(id) && !['state', 'always'].includes(byId.get(id).type) && !placed.has(id);
  const placeSeq = (id, x, top, stop) => { // returns { bottom, right, left, ids }
    const ids = [];
    let bottom = top - VGAP, right = x, left = x;
    const at = (nid, cx, t) => {
      const { w, h } = nodeSize(byId.get(nid));
      const cy = snap(t + h / 2);
      pos.set(nid, { x: cx, y: cy }); placed.add(nid); ids.push(nid);
      right = Math.max(right, cx + w / 2); left = Math.min(left, cx - w / 2);
      return cy + h / 2;
    };
    for (let guard = 0; inBlock(id) && id !== stop && guard < 10000; guard++) {
      const n = byId.get(id);
      bottom = at(id, x, top);
      const e = ex.get(id) || {};
      if (n.type === 'decision') {
        const j = join(id);
        const below = bottom + VGAP;
        let tRight = right, tBottom = bottom;
        if (e.true !== j && inBlock(e.true)) {
          const r = placeSeq(e.true, x, below, j);
          ids.push(...r.ids); tRight = Math.max(tRight, r.right); tBottom = Math.max(tBottom, r.bottom); left = Math.min(left, r.left);
        }
        let fBottom = bottom, fRight = tRight;
        if (e.false !== j && inBlock(e.false)) {
          const r = placeSeq(e.false, 0, below, j);
          const dx = snap(tRight + HGAP - r.left);
          for (const fid of r.ids) pos.get(fid).x += dx;
          ids.push(...r.ids); fRight = r.right + dx; fBottom = r.bottom;
        }
        right = Math.max(right, tRight, fRight);
        bottom = Math.max(tBottom, fBottom);
        id = j;
      } else id = e.next;
      top = bottom + VGAP;
    }
    return { bottom, right, left, ids };
  };
  let colLeft = X0;
  for (const [id, p] of pos) colLeft = Math.max(colLeft, p.x + nodeSize(byId.get(id)).w / 2);
  colLeft += 2 * HGAP;
  let aTop = Y0 - 30;
  const aBlocks = [];
  for (const a of norm.nodes.filter((n) => n.type === 'always')) {
    const { w, h } = nodeSize(a);
    const ids = [a.id];
    const cy = snap(aTop + h / 2);
    pos.set(a.id, { x: 0, y: cy }); placed.add(a.id);
    let left = -w / 2, right = w / 2;
    const first = (ex.get(a.id) || {}).next;
    if (inBlock(first)) {
      const r = placeSeq(first, 0, cy + h / 2 + VGAP, null);
      ids.push(...r.ids); left = Math.min(left, r.left); right = Math.max(right, r.right);
      aTop = r.bottom;
    } else aTop = cy + h / 2;
    aTop = ceilTo(aTop + BLOCK_GAP, 10);
    aBlocks.push({ ids, left });
  }
  // all headers on one vertical line, no box left of the column
  const cx = snap(colLeft - Math.min(0, ...aBlocks.map((b) => b.left)));
  for (const b of aBlocks) for (const id of b.ids) pos.get(id).x += cx;

  // boxes not reachable from any state: in a column on the right
  let maxRight = X0;
  for (const [id, p] of pos) maxRight = Math.max(maxRight, p.x + nodeSize(byId.get(id)).w / 2);
  let y2 = Y0 - 30;
  for (const n of norm.nodes) {
    if (placed.has(n.id)) continue;
    const r = place(n.id, maxRight + HGAP + nodeSize(n).w / 2, y2);
    y2 = r.bottom + VGAP;
  }
  for (const n of m.nodes) {
    const p = pos.get(String(n.id));
    if (p) { n.x = p.x; n.y = p.y; }
  }
  for (const e of m.edges) delete e.points;
  return m;
}

// ---------------------------------------------------------------------------------------
// Reuse of a previous chart (ids, positions, edge points)
// ---------------------------------------------------------------------------------------

/** Signature of each non-state node: state name + path from the state + node content. */
function nodeSignatures(m) {
  const byId = new Map(m.nodes.map((n) => [n.id, n]));
  const ex = exitsOf(m);
  const W = new Map([...m.inputs, ...m.outputs, ...(m.registers || [])].map((p) => [p.name, p.width]));
  const wOf = (n) => W.get(n) ?? 1;
  const keyOf = (n) => {
    if (n.type === 'decision') { const p = parseCondition(n.cond); return 'D:' + (p.error ? n.cond : condKey(p.ast, wOf)); }
    if (n.type === 'case') return `C:${n.expr}`;
    return 'O:' + n.actions.map((a) => { const p = parseAction(a); return p.error ? a : `${p.target}=${exprToString(valueLits(p.ast))}`; }).join(';');
  };
  const sigs = new Map(); // id -> { full, loose }
  for (const s of m.nodes.filter((n) => n.type === 'state' || n.type === 'always')) {
    const root = s.type === 'always' ? `@${s.name}` : s.name;
    const visit = (id, path, seen) => {
      const n = byId.get(id);
      if (!n || n.type === 'state' || n.type === 'always' || seen.has(id)) return;
      seen.add(id);
      const k = keyOf(n);
      if (!sigs.has(id)) sigs.set(id, { full: `${root}|${path}|${k}`, loose: `${root}|${k}`, state: s.id });
      const e = ex.get(id) || {};
      if (n.type === 'decision') { visit(e.true, `${path}/${k}=1`, seen); visit(e.false, `${path}/${k}=0`, seen); }
      else if (n.type === 'case') for (const ed of m.edges.filter((x) => x.from === id)) visit(ed.to, `${path}/${k}=${ed.port}`, seen);
      else visit(e.next, `${path}/${k}`, seen);
      seen.delete(id);
    };
    visit((ex.get(s.id) || {}).next, '', new Set());
  }
  return sigs;
}

function boxesOverlap(a, b, margin = 20) {
  const A = nodeSize(a), B = nodeSize(b);
  return Math.abs(a.x - b.x) * 2 < A.w + B.w + 2 * margin && Math.abs(a.y - b.y) * 2 < A.h + B.h + 2 * margin;
}

export function reusePrevious(model, prev) {
  const auto = asmLayout(model);
  const autoPos = new Map(auto.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  const idMap = new Map(); // new id -> previous node
  // states by name
  const headKey = (n) => `${n.type}:${n.name.toLowerCase()}`;
  const prevStates = new Map(prev.nodes.filter((n) => n.type === 'state' || n.type === 'always').map((n) => [headKey(n), n]));
  for (const n of model.nodes) if ((n.type === 'state' || n.type === 'always') && prevStates.has(headKey(n))) idMap.set(n.id, prevStates.get(headKey(n)));
  // decisions / output boxes by path signature, then loosely by state + content
  const sNew = nodeSignatures(normalizeModel(model)), sOld = nodeSignatures(prev);
  const prevById = new Map(prev.nodes.map((n) => [n.id, n]));
  const used = new Set([...idMap.values()].map((n) => n.id));
  for (const pass of ['full', 'loose']) {
    for (const [id, sig] of sNew) {
      if (idMap.has(id)) continue;
      for (const [oid, osig] of sOld) {
        if (used.has(oid) || osig[pass] !== sig[pass]) continue;
        idMap.set(id, prevById.get(oid)); used.add(oid); break;
      }
    }
  }
  // final ids: previous ids for matched nodes, fresh ids (not clashing) for new ones
  const taken = new Set(prev.nodes.map((n) => n.id));
  const fresh = (prefix) => { let i = 1; while (taken.has(`${prefix}${i}`)) i++; taken.add(`${prefix}${i}`); return `${prefix}${i}`; };
  const finalId = new Map();
  for (const n of model.nodes) {
    const p = idMap.get(n.id);
    finalId.set(n.id, p ? p.id : fresh({ state: 's', decision: 'd', always: 'a' }[n.type] || 'o'));
  }
  // positions
  const out = clone(model);
  const parent = new Map();
  for (const e of model.edges) if (!parent.has(e.to) && model.nodes.find((n) => n.id === e.to)?.type !== 'state') parent.set(e.to, e.from);
  const placedNodes = [];
  for (const n of out.nodes) {
    const p = idMap.get(n.id);
    if (p) { n.x = p.x; n.y = p.y; if (p.flip && n.type === 'decision') n.flip = true; if (p.comment) n.comment = p.comment; placedNodes.push(n); }
  }
  let prevRight = 0, prevTop = Infinity;
  for (const n of prev.nodes) { prevRight = Math.max(prevRight, n.x + nodeSize(n).w / 2); prevTop = Math.min(prevTop, n.y); }
  if (!Number.isFinite(prevTop)) prevTop = Y0;
  const outById = new Map(out.nodes.map((n) => [n.id, n]));
  const pending = out.nodes.filter((n) => !idMap.has(n.id));
  // place new nodes relative to an already placed parent when possible (repeat until stable)
  for (let guard = 0; pending.length && guard < 1000; guard++) {
    const i = pending.findIndex((n) => { const pid = parent.get(n.id); return pid && placedNodes.includes(outById.get(pid)); });
    let n, x, y;
    if (i >= 0) {
      n = pending.splice(i, 1)[0];
      const pr = outById.get(parent.get(n.id));
      const a = autoPos.get(n.id), ap = autoPos.get(pr.id);
      x = pr.x + (a.x - ap.x); y = pr.y + (a.y - ap.y);
    } else {
      n = pending.shift();
      const a = autoPos.get(n.id);
      x = a.x + (prev.nodes.length ? prevRight + HGAP + 100 - X0 : 0); y = a.y - Y0 + prevTop;
    }
    n.x = x; n.y = y;
    for (let k = 0; k < 200 && placedNodes.some((o) => boxesOverlap(n, o)); k++) n.x += 2 * GRID;
    placedNodes.push(n);
  }
  // ids and edges
  for (const n of out.nodes) n.id = finalId.get(n.id);
  out.initial = finalId.get(model.initial);
  const prevEdges = prev.edges;
  const takenE = new Set(prevEdges.map((e) => e.id));
  const usedE = new Set();
  out.edges = model.edges.map((e) => {
    const from = finalId.get(e.from), to = finalId.get(e.to);
    const pe = prevEdges.find((x) => !usedE.has(x.id) && x.from === from && x.port === e.port);
    const o = { id: '', from, to, port: e.port };
    if (pe) {
      usedE.add(pe.id); o.id = pe.id;
      if (pe.to === to && pe.points && idMap.has(e.from) && idMap.has(e.to)) o.points = clone(pe.points);
    } else {
      let i = 1; while (takenE.has(`e${i}`)) i++; takenE.add(`e${i}`); o.id = `e${i}`;
    }
    return o;
  });
  return out;
}
