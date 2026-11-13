// The drawing editors' bottom panel (the Try it of the state diagram, the ASM chart and the Petri net; the FSM's Tables,
// the net's Analysis) resized and moved (#3797): its inner edge dragged (a finger or a pen too; ↑ ↓ / ← → on the focused
// edge) sizes it between MIN and MAX of the drawing area; its title bar dragged, or its dock button, docks it below the
// drawing or on its left, beside the Design pane (#3802), the drawing zoomed to fit the area it is left with. Docked, not
// floating: a window over the canvas would cover the drawing being stepped through (docs/UI-GUIDELINES.md keeps the
// panels beside the canvas). Its place and size are kept per editor kind (`silinx.<kind>.trypanel`; a kept `right`,
// #3797's side, read as `left`); on a narrow screen (narrow.js) it is always below, still resizable, and does not move.
// The look: asm-editor.css (.dockable, .dock-grip, .dock-preview).
import { h } from './dom.js';
import { NARROW_QUERY, isNarrow } from './narrow.js';
import { prefKey } from './prefs.js';

export const MIN = 0.15, MAX = 0.85, STEP = 0.05;
export const DEFAULT = { dock: 'bottom', size: 0.42 };
const DOCKS = ['bottom', 'left'];
const TITLES = {
  bottom: 'Move the panel to the left of the drawing',
  left: 'Move the panel below the drawing',
};
const NOT_A_HANDLE = 'button, select, input, textarea, label, a, [contenteditable]';

/** The panel's kept place and size: { dock, size }, DEFAULT (`size` its size) for what is missing or wrong. */
export function readDock(kind, size = DEFAULT.size) {
  try {
    const v = JSON.parse(localStorage.getItem(prefKey(`silinx.${kind}.trypanel`)) || 'null');
    const dock = v?.dock === 'right' ? 'left' : v?.dock;   // (#3797's side, #3802)
    return { dock: DOCKS.includes(dock) ? dock : DEFAULT.dock, size: Number.isFinite(v?.size) ? clamp(v.size) : size };
  } catch { return { dock: DEFAULT.dock, size }; }
}
function writeDock(kind, v) { try { localStorage.setItem(prefKey(`silinx.${kind}.trypanel`), JSON.stringify(v)); } catch { /* storage unavailable */ } }
export const clamp = (s) => Math.min(MAX, Math.max(MIN, s));

/** Where a panel dragged to (x, y) of the rectangle r docks: on the left if it is further left than down, else below. */
export function dockAt(r, x, y) {
  const lx = (r.left + r.width - x) / (r.width || 1), ry = (y - r.top) / (r.height || 1);
  return lx > 0.5 && lx > ry ? 'left' : 'bottom';
}
/** The size of a panel whose inner edge is at (x, y) of the rectangle r, docked `dock`: the part of r beyond the edge. */
export function sizeAt(r, dock, x, y) {
  return clamp(dock === 'left' ? (x - r.left) / (r.width || 1) : (r.bottom - y) / (r.height || 1));
}

/**
 * The bottom panel `panel` of `main` (the editor's .asm-main: the canvas, then the panel) resizable and movable; `bar`
 * its title bar, `btn` the editor's button maker, `kind` its key ('fsm', 'asm', 'petri'), `size` its first size, `changed()`
 * after its size changed (the drawing kept in view), `fit()` after its place changed, once the layout has the new size
 * (the editor's Zoom to Full View, #3802). { state(), setDock(d), setSize(s), apply(), destroy() }.
 */
export function mountDockPanel({ main, panel, bar, btn, kind, size = DEFAULT.size, changed = () => {}, fit = changed }) {
  let st = readDock(kind, size);
  const grip = h('div', { class: 'dock-grip', role: 'separator', tabindex: '0', 'aria-valuemin': String(MIN * 100), 'aria-valuemax': String(MAX * 100) });
  const dockBtn = btn('⇆', TITLES.bottom, () => setDock(st.dock === 'left' ? 'bottom' : 'left'), 'asm-small dock-btn');
  const preview = h('div', { class: 'dock-preview', hidden: true });
  panel.classList.add('dockable');
  panel.prepend(grip);
  bar.classList.add('dock-bar');
  bar.insertBefore(dockBtn, bar.lastElementChild);   // before its ✕
  main.classList.add('has-dock');
  main.append(preview);

  let frame = 0, moved = false;
  const notify = (m = false) => {
    moved ||= m;
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; const f = moved ? fit : changed; moved = false; f(); });
  };
  const dockNow = () => (isNarrow() ? 'bottom' : st.dock);
  function apply() {
    const d = dockNow();
    main.classList.toggle('dock-left', d === 'left');
    panel.style.setProperty('--dock-size', `${Math.round(st.size * 1000) / 10}%`);
    grip.setAttribute('aria-orientation', d === 'left' ? 'vertical' : 'horizontal');
    grip.setAttribute('aria-valuenow', String(Math.round(st.size * 100)));
    grip.title = d === 'left' ? 'Drag to resize the panel (← → with the keyboard)' : 'Drag to resize the panel (↑ ↓ with the keyboard)';
    dockBtn.title = TITLES[d]; dockBtn.setAttribute('aria-label', TITLES[d]);
    dockBtn.hidden = isNarrow();
    bar.title = isNarrow() ? '' : 'Drag the title bar to move the panel below or to the left of the drawing';
  }
  function setDock(d) { if (!DOCKS.includes(d)) return; st = { ...st, dock: d }; writeDock(kind, st); apply(); notify(true); }
  function setSize(s) { st = { ...st, size: clamp(s) }; writeDock(kind, st); apply(); notify(); }

  // ---------------------------------------------------------------- resized by its edge
  grip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    grip.setPointerCapture?.(e.pointerId);
    panel.classList.add('dock-resizing');
    const move = (ev) => { st = { ...st, size: sizeAt(main.getBoundingClientRect(), dockNow(), ev.clientX, ev.clientY) }; apply(); notify(); };
    const up = () => {
      grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up);
      panel.classList.remove('dock-resizing');
      writeDock(kind, st);
    };
    grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
  });
  grip.addEventListener('keydown', (e) => {
    const left = dockNow() === 'left';
    const grow = left ? 'ArrowRight' : 'ArrowUp', shrink = left ? 'ArrowLeft' : 'ArrowDown';
    if (e.key !== grow && e.key !== shrink) return;
    e.preventDefault(); e.stopPropagation();
    setSize(st.size + (e.key === grow ? STEP : -STEP));
  });

  // ---------------------------------------------------------------- moved by its title bar
  bar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || isNarrow() || e.target.closest(NOT_A_HANDLE)) return;
    const x0 = e.clientX, y0 = e.clientY;
    let moving = false, to = null;
    bar.setPointerCapture?.(e.pointerId);
    const move = (ev) => {
      if (!moving && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      moving = true;
      to = dockAt(main.getBoundingClientRect(), ev.clientX, ev.clientY);
      preview.hidden = false;
      preview.className = `dock-preview to-${to}`;
      preview.style.setProperty('--dock-size', `${Math.round(st.size * 1000) / 10}%`);
    };
    const up = () => {
      bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up);
      preview.hidden = true;
      if (moving && to && to !== st.dock) setDock(to);
    };
    bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
  });

  const mq = globalThis.matchMedia?.(NARROW_QUERY);
  const onNarrow = () => { apply(); notify(st.dock === 'left'); };   // (moved, when it was on the left)
  mq?.addEventListener?.('change', onNarrow);
  apply();
  return {
    state: () => ({ ...st, shown: dockNow() }), setDock, setSize, apply,
    destroy() { mq?.removeEventListener?.('change', onNarrow); if (frame) cancelAnimationFrame(frame); },
  };
}
