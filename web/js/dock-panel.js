// The drawing editors' bottom panel (the Try it of the state diagram, the ASM chart and the Petri net; the FSM's Tables,
// the net's Analysis) resized and moved (#3797): its inner edge dragged (a finger or a pen too; ↑ ↓ / ← → on the focused
// edge) sizes it between MIN and MAX of the drawing area; its title bar dragged, or its dock button, docks it below the
// drawing or on its right. Docked, not floating: a window over the canvas would cover the drawing being stepped
// through (docs/UI-GUIDELINES.md keeps the panels beside the canvas). Its place and size are kept per editor kind
// (`silinx.<kind>.trypanel`); on a narrow screen (narrow.js) it is always below, still resizable, and does not move.
// The look: asm-editor.css (.dockable, .dock-grip, .dock-preview).
import { h } from './dom.js';
import { NARROW_QUERY, isNarrow } from './narrow.js';
import { prefKey } from './prefs.js';

export const MIN = 0.15, MAX = 0.85, STEP = 0.05;
export const DEFAULT = { dock: 'bottom', size: 0.42 };
const DOCKS = ['bottom', 'right'];
const TITLES = {
  bottom: 'Move the panel to the right of the drawing',
  right: 'Move the panel below the drawing',
};
const NOT_A_HANDLE = 'button, select, input, textarea, label, a, [contenteditable]';

/** The panel's kept place and size: { dock, size }, DEFAULT (`size` its size) for what is missing or wrong. */
export function readDock(kind, size = DEFAULT.size) {
  try {
    const v = JSON.parse(localStorage.getItem(prefKey(`silinx.${kind}.trypanel`)) || 'null');
    return { dock: DOCKS.includes(v?.dock) ? v.dock : DEFAULT.dock, size: Number.isFinite(v?.size) ? clamp(v.size) : size };
  } catch { return { dock: DEFAULT.dock, size }; }
}
function writeDock(kind, v) { try { localStorage.setItem(prefKey(`silinx.${kind}.trypanel`), JSON.stringify(v)); } catch { /* storage unavailable */ } }
export const clamp = (s) => Math.min(MAX, Math.max(MIN, s));

/** Where a panel dragged to (x, y) of the rectangle r docks: on the right if it is further right than down, else below. */
export function dockAt(r, x, y) {
  const rx = (x - r.left) / (r.width || 1), ry = (y - r.top) / (r.height || 1);
  return rx > 0.5 && rx > ry ? 'right' : 'bottom';
}
/** The size of a panel whose inner edge is at (x, y) of the rectangle r, docked `dock`: the part of r beyond the edge. */
export function sizeAt(r, dock, x, y) {
  return clamp(dock === 'right' ? (r.right - x) / (r.width || 1) : (r.bottom - y) / (r.height || 1));
}

/**
 * The bottom panel `panel` of `main` (the editor's .asm-main: the canvas, then the panel) resizable and movable; `bar`
 * its title bar, `btn` the editor's button maker, `kind` its key ('fsm', 'asm', 'petri'), `size` its first size, `changed()`
 * after its size or place changed (the drawing fitted again). { state(), setDock(d), setSize(s), apply(), destroy() }.
 */
export function mountDockPanel({ main, panel, bar, btn, kind, size = DEFAULT.size, changed = () => {} }) {
  let st = readDock(kind, size);
  const grip = h('div', { class: 'dock-grip', role: 'separator', tabindex: '0', 'aria-valuemin': String(MIN * 100), 'aria-valuemax': String(MAX * 100) });
  const dockBtn = btn('⇆', TITLES.bottom, () => setDock(st.dock === 'right' ? 'bottom' : 'right'), 'asm-small dock-btn');
  const preview = h('div', { class: 'dock-preview', hidden: true });
  panel.classList.add('dockable');
  panel.prepend(grip);
  bar.classList.add('dock-bar');
  bar.insertBefore(dockBtn, bar.lastElementChild);   // before its ✕
  main.classList.add('has-dock');
  main.append(preview);

  let frame = 0;
  const notify = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; changed(); }); };
  const dockNow = () => (isNarrow() ? 'bottom' : st.dock);
  function apply() {
    const d = dockNow();
    main.classList.toggle('dock-right', d === 'right');
    panel.style.setProperty('--dock-size', `${Math.round(st.size * 1000) / 10}%`);
    grip.setAttribute('aria-orientation', d === 'right' ? 'vertical' : 'horizontal');
    grip.setAttribute('aria-valuenow', String(Math.round(st.size * 100)));
    grip.title = d === 'right' ? 'Drag to resize the panel (← → with the keyboard)' : 'Drag to resize the panel (↑ ↓ with the keyboard)';
    dockBtn.title = TITLES[d]; dockBtn.setAttribute('aria-label', TITLES[d]);
    dockBtn.hidden = isNarrow();
    bar.title = isNarrow() ? '' : 'Drag the title bar to move the panel below or to the right of the drawing';
  }
  function setDock(d) { if (!DOCKS.includes(d)) return; st = { ...st, dock: d }; writeDock(kind, st); apply(); notify(); }
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
    const right = dockNow() === 'right';
    const grow = right ? 'ArrowLeft' : 'ArrowUp', shrink = right ? 'ArrowRight' : 'ArrowDown';
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
  const onNarrow = () => { apply(); notify(); };
  mq?.addEventListener?.('change', onNarrow);
  apply();
  return {
    state: () => ({ ...st, shown: dockNow() }), setDock, setSize, apply,
    destroy() { mq?.removeEventListener?.('change', onNarrow); if (frame) cancelAnimationFrame(frame); },
  };
}
