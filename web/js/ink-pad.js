// The drawing pad of the handwritten input (#1056): a canvas a pen, a finger or the mouse writes on, one stroke at a
// time (a second pointer is ignored; once a pen has written, a touch is the hand resting on the screen). Two fingers
// pinch and move the writing area, the mouse wheel zooms it, Fit shows the whole drawing (#1088); with Move on, a drag
// moves it, and the mouse's middle button drags it at any time (#2003); with Erase on, a drag rubs out the ink under
// it, in a circle wider than a line, one step of Undo (#2004). The strokes are kept
// in the pad's own coordinates (CSS pixels at zoom 1): what is recognized does not change with the view; the
// characters recognized can be shown under their ink.
//
//   const pad = mountInkPad(host, { onStroke(strokes) });
//   pad.strokes(), pad.devices(), pad.load(strokes), pad.undo(), pad.redo(), pad.canUndo(), pad.canRedo(), pad.clear(),
//   pad.setLabels([{ ch, box }]), pad.view(), pad.fit(), pad.onChange(f), pad.canvas, pad.destroy()
//   padButtons(pad) -> the row of its Undo, Redo and Clear buttons (and their keys: Ctrl/Cmd+Z, Ctrl+Y, Ctrl/Cmd+Shift+Z)
// Undo takes back the last stroke, Clear or drawing loaded (#1749), Redo does it again; a new stroke ends what can be
// redone (#1092). devices(): what drew the strokes (pen, touch, mouse), for a drawing kept (#1749).
// Styles: web/css/ink.css.
import { h, twoFingerView } from './ui.js';

const ZOOM = [0.25, 4];
// the eraser's radius (screen px; a line is 3 px wide)
const ERASE = 12;

export function mountInkPad(host, { onStroke } = {}) {
  const canvas = h('canvas', { class: 'ink-canvas' });
  host.append(canvas);
  const fitBtn = h('button', { type: 'button', class: 'btn ink-fit', title: 'Show the whole drawing', onclick: () => fit() }, 'Fit');
  // Move (#2003): while it is on, a drag with a pen, a finger or the mouse moves the drawing in the pad (the view) instead
  // of writing; the mouse's middle button drags it too
  // Erase (#2004): while it is on, a drag rubs out the ink under it, in a circle wider than a line; Move and Erase are
  // one at a time
  const tool = (cls, label, title) => h('button', { type: 'button', class: `btn ${cls}`, title, 'aria-pressed': 'false', onclick: e => toggle(e.currentTarget) }, label);
  const moveBtn = tool('ink-move', 'Move', 'Drag the drawing to move it in the pad (on: a drag moves, not writes)');
  const eraseBtn = tool('ink-erase', 'Erase', 'Rub out the ink under a drag (on: a drag erases, not writes)');
  const on = b => b.getAttribute('aria-pressed') === 'true';
  const toggle = b => { const was = on(b); for (const x of [moveBtn, eraseBtn]) x.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-pressed', String(!was)); };
  host.append(h('div', { class: 'ink-tools' }, eraseBtn, moveBtn, fitBtn));
  let strokes = [], cur = null, penSeen = false, labels = [], panning = null, erasing = null;
  // what was done ({ add: stroke } | { was: the strokes before, now: after }, a Clear or a drawing loaded) and what was
  // undone, to redo
  const done = [], undone = [], listeners = new Set();
  // (the strokes changed: the dialog's recognizer, the buttons' states)
  const changed = () => { onStroke?.(strokes); listeners.forEach(f => f()); };
  // the view: a point (x, y) of the pad is at (x·s + ox, y·s + oy) on the canvas
  const v = { s: 1, ox: 0, oy: 0 };
  const ctx = canvas.getContext('2d');
  const point = e => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left - v.ox) / v.s, y: (e.clientY - r.top - v.oy) / v.s }; };
  // zoom by f about the canvas point (cx, cy) (client px)
  const zoomAt = (f, cx, cy) => {
    const r = canvas.getBoundingClientRect(), x = cx - r.left, y = cy - r.top;
    const s = Math.min(ZOOM[1], Math.max(ZOOM[0], v.s * f));
    v.ox = x - (x - v.ox) * s / v.s; v.oy = y - (y - v.oy) * s / v.s; v.s = s;
    draw();
  };
  // the whole drawing in view (none: the view at rest)
  function fit() {
    const all = strokes.flat();
    if (!all.length) { Object.assign(v, { s: 1, ox: 0, oy: 0 }); draw(); return; }
    const w = canvas.clientWidth, ht = canvas.clientHeight, m = 24;
    const x0 = Math.min(...all.map(p => p.x)), x1 = Math.max(...all.map(p => p.x)), y0 = Math.min(...all.map(p => p.y)), y1 = Math.max(...all.map(p => p.y));
    v.s = Math.min(ZOOM[1], Math.max(ZOOM[0], Math.min((w - 2 * m) / Math.max(x1 - x0, 1), (ht - 2 * m) / Math.max(y1 - y0, 1))));
    v.ox = (w - (x1 - x0) * v.s) / 2 - x0 * v.s; v.oy = (ht - (y1 - y0) * v.s) / 2 - y0 * v.s;
    draw();
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, ht = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(ht * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(ht * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, ht);
    const css = getComputedStyle(canvas);
    canvas.dataset.view = `${+v.s.toFixed(3)} ${+v.ox.toFixed(1)} ${+v.oy.toFixed(1)}`;   // (the view, for the tests)
    // a guide line to write on
    ctx.strokeStyle = css.getPropertyValue('--ink-guide').trim() || css.color;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(8, ht * 0.72); ctx.lineTo(w - 8, ht * 0.72); ctx.stroke();
    ctx.setLineDash([]);
    // the ink and its labels in the view (as thick on the screen at any zoom)
    ctx.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.ox, dpr * v.oy);
    ctx.strokeStyle = css.color;
    ctx.lineWidth = 3 / v.s; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const s of strokes) {
      ctx.beginPath();
      ctx.moveTo(s[0].x, s[0].y);
      for (const p of s.slice(1)) ctx.lineTo(p.x, p.y);
      if (s.length === 1) ctx.lineTo(s[0].x + 0.1, s[0].y);
      ctx.stroke();
    }
    ctx.fillStyle = css.getPropertyValue('--ink-label').trim() || css.color;
    ctx.font = `${13 / v.s}px sans-serif`; ctx.textAlign = 'center';
    for (const l of labels) ctx.fillText(l.ch, (l.box.minX + l.box.maxX) / 2, Math.min((ht - 4 - v.oy) / v.s, l.box.maxY + 16 / v.s));
    // the eraser, where it rubs
    if (erasing?.at) { ctx.lineWidth = 1 / v.s; ctx.beginPath(); ctx.arc(erasing.at.x, erasing.at.y, ERASE / v.s, 0, 2 * Math.PI); ctx.stroke(); }
  }

  // the ink within ERASE screen px of p (pad coordinates) rubbed out: a stroke through it cut in two, a piece of one
  // point (none left of a line) dropped; a dot drawn alone (one point) rubbed out whole
  const rubOut = p => {
    const r = ERASE / v.s, near = q => Math.hypot(q.x - p.x, q.y - p.y) <= r;
    erasing.at = p;
    let hit = false;
    const next = strokes.flatMap(st => {
      if (!st.some(near)) return [st];
      hit = true;
      const parts = [];
      let part = [];
      for (const q of st) {
        if (near(q)) { if (part.length) parts.push(part); part = []; } else part.push(q);
      }
      if (part.length) parts.push(part);
      return parts.filter(x => x.length > 1).map(x => Object.assign(x, { device: st.device }));
    });
    if (hit) strokes = next;
    draw();
  };
  const down = e => {
    if (cur || panning || erasing) return;
    if (e.isPrimary && on(eraseBtn) && !(e.pointerType === 'mouse' && e.button !== 0)) {
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch { /* not an active pointer */ }
      erasing = { id: e.pointerId, was: strokes, at: null };
      rubOut(point(e));
      return;
    }
    if (e.isPrimary && (on(moveBtn) || (e.pointerType === 'mouse' && e.button === 1))) {
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch { /* not an active pointer */ }
      panning = { id: e.pointerId, x: e.clientX, y: e.clientY };
      return;
    }
    if ((e.pointerType === 'touch' && penSeen) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.pointerType === 'pen') penSeen = true;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* not an active pointer */ }
    cur = { id: e.pointerId, pts: Object.assign([point(e)], { device: e.pointerType }) };
    strokes.push(cur.pts);
    labels = [];
    draw();
  };
  const move = e => {
    if (erasing && e.pointerId === erasing.id) {
      e.preventDefault();
      const all = e.getCoalescedEvents?.();
      for (const ev of all?.length ? all : [e]) rubOut(point(ev));
      return;
    }
    if (panning && e.pointerId === panning.id) {
      e.preventDefault();
      v.ox += e.clientX - panning.x; v.oy += e.clientY - panning.y;
      panning.x = e.clientX; panning.y = e.clientY;
      draw();
      return;
    }
    if (!cur || e.pointerId !== cur.id) return;
    e.preventDefault();
    // the points the browser merged into this event too (a pen moves faster than the frames); none in an event made by a script
    const all = e.getCoalescedEvents?.();
    for (const ev of all?.length ? all : [e]) cur.pts.push(point(ev));
    draw();
  };
  const up = e => {
    if (panning && e.pointerId === panning.id) { panning = null; return; }
    if (erasing && e.pointerId === erasing.id) {
      const { was } = erasing;
      erasing = null;
      if (strokes !== was) { done.push({ was, now: strokes }); undone.length = 0; labels = []; changed(); }
      draw();
      return;
    }
    if (!cur || e.pointerId !== cur.id) return;
    done.push({ add: cur.pts });
    undone.length = 0;
    cur = null;
    draw();
    changed();
  };
  // two fingers: the view's (wired first: the first finger's stroke dropped when the second comes)
  twoFingerView(canvas, {
    cancel: () => { if (cur) { strokes.splice(strokes.indexOf(cur.pts), 1); cur = null; draw(); } },
    pan: (dx, dy) => { v.ox += dx; v.oy += dy; draw(); },
    zoom: (f, cx, cy) => zoomAt(f, cx, cy),
  });
  canvas.addEventListener('wheel', e => { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  // (an iPad's pen, #1086: its touches' own actions, selecting the text around, Scribble's handwriting into text,
  // cancelled; the pointer events still come)
  const still = e => { if (e.cancelable) e.preventDefault(); };
  canvas.addEventListener('touchstart', still, { passive: false });
  canvas.addEventListener('touchmove', still, { passive: false });
  // the strokes replaced (a Clear: by none), one step of Undo
  const replace = next => {
    if (cur) { strokes.splice(strokes.indexOf(cur.pts), 1); cur = null; }
    if (strokes.length || next.length) { done.push({ was: strokes, now: next }); undone.length = 0; }
    strokes = next; labels = []; draw(); changed();
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => draw()) : null;
  ro?.observe(canvas);
  requestAnimationFrame(draw);

  return {
    canvas,
    strokes: () => strokes.map(s => s.map(p => ({ ...p }))),
    undo() {
      const a = !cur && !erasing && done.pop();
      if (!a) return;
      if (a.add) strokes.splice(strokes.lastIndexOf(a.add), 1); else strokes = a.was;
      undone.push(a);
      labels = []; draw(); changed();
    },
    redo() {
      const a = !cur && !erasing && undone.pop();
      if (!a) return;
      if (a.add) strokes.push(a.add); else strokes = a.now;
      done.push(a);
      labels = []; draw(); changed();
    },
    onChange: f => listeners.add(f),
    canUndo: () => done.length > 0,
    canRedo: () => undone.length > 0,
    clear() { replace([]); },
    // a drawing kept (#1749): its strokes instead of the pad's, the whole of it in view
    load(list) { replace(list.map(s => Object.assign(s.map(p => ({ x: p.x, y: p.y })), { device: s.device }))); fit(); },
    devices: () => [...new Set(strokes.map(s => s.device).filter(Boolean))],
    setLabels(list) { labels = list || []; draw(); },
    view: () => ({ ...v }),
    fit,
    destroy() { ro?.disconnect(); canvas.remove(); },
  };
}

/** The pad's Undo, Redo and Clear (#1092): disabled when there is nothing to do; Ctrl/Cmd+Z and Ctrl+Y (or
 *  Ctrl/Cmd+Shift+Z) while its dialog is open, outside the text fields. */
export function padButtons(pad) {
  const b = (cls, label, title, fn) => h('button', { type: 'button', class: `btn ${cls}`, title, onclick: fn }, label);
  const undo = b('ink-undo', 'Undo', 'Take back the last stroke, or the last Clear (Ctrl+Z)', () => pad.undo());
  const redo = b('ink-redo', 'Redo', 'Do again what was taken back (Ctrl+Y)', () => pad.redo());
  const clear = b('ink-clear', 'Clear', 'Clear the pad (Undo brings the drawing back)', () => pad.clear());
  const row = h('div', { class: 'ink-row' }, undo, redo, clear);
  const sync = () => { undo.disabled = !pad.canUndo(); redo.disabled = !pad.canRedo(); clear.disabled = !pad.strokes().length; };
  pad.onChange(sync);
  sync();
  const key = e => {
    if (!row.isConnected) { removeEventListener('keydown', key, true); return; }
    if (!(e.ctrlKey || e.metaKey) || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    const act = k === 'z' && !e.shiftKey ? () => pad.undo() : k === 'y' || (k === 'z' && e.shiftKey) ? () => pad.redo() : null;
    if (act) { e.preventDefault(); e.stopPropagation(); act(); }
  };
  addEventListener('keydown', key, true);
  return row;
}
