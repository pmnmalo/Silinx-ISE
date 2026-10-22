// The Tasks interface's Emulate task (#801, #782): the board gets the screen.
// - The board keeps its proper size (#1021): its picture, drawn at a fixed size by web/js/emulator.js, is never made
//   smaller; on a large window it is zoomed (CSS zoom, which keeps the pointer's aim) to the room beside the Watch, at
//   most MAX_ZOOM, measured again when the window, the task's panels or the board change (fitBoard).
// - The emulator's side column (Watch, the timing generics, the hints) is the task's side panel, shown at first (#1020):
//   beside the board; when the width runs short, it and the VGA monitor wrap to the next row, below the board, and the
//   task's area scrolls (web/css/tasks.css); the Design pane is not shown in Emulate.
// - The emulator's own bar stays its controls (Model, Engine, Run, Step, Power cycle, Clock), right under the task's
//   bar; its Messages box is in the message centre (#798).
// boardZoom has no DOM and is unit tested (test/tasks.test.js).

export const MAX_ZOOM = 1.5, MIN_ZOOM = 1;   // (never smaller than its proper size: the panels wrap instead, #1021)
const GAP = 12;   // (.emu-main's padding and gap, web/js/emulator.js)

/** The zoom of a board of size `board` ({ w, h }) in the room `room` ({ w, h }): as large as fits, at most MAX_ZOOM,
 *  at least MIN_ZOOM (its proper size, the room too small: the task's area scrolls). */
export function boardZoom(room, board) {
  if (!(board?.w > 0) || !(board?.h > 0) || !(room?.w > 0) || !(room?.h > 0)) return 1;
  // (to the hundredth below: a board that fills the room leaves the Watch beside it)
  return Math.max(MIN_ZOOM, Math.floor(100 * Math.min(MAX_ZOOM, room.w / board.w, room.h / board.h)) / 100);
}

const shown = el => !!el && el.getClientRects().length > 0;
/** Zooms each open emulator's board to its room (`on`: the Tasks interface's Emulate; else its own size). */
export function fitBoard(on) {
  for (const emu of document.querySelectorAll('#workspace .doc .emu')) {
    const wrap = emu.querySelector('.emu-board-wrap');
    if (!wrap) continue;
    wrap.style.zoom = '';
    if (!on || !shown(emu)) continue;
    const main = emu.querySelector('.emu-main'), side = emu.querySelector('.emu-side'), bar = emu.querySelector('.emu-bar');
    // (the room beside the Watch: the VGA monitor wraps below the board; the Watch too when the board leaves it no room)
    const room = {
      w: main.clientWidth - 2 * GAP - (shown(side) ? side.offsetWidth + GAP : 0),
      h: emu.clientHeight - (bar?.offsetHeight || 0) - 2 * GAP,
    };
    wrap.style.zoom = String(boardZoom(room, { w: wrap.offsetWidth, h: wrap.offsetHeight }));
  }
}

/** Fits the boards whenever the workspace's size changes or an emulator's board appears (in the Tasks interface). */
export function initEmulate(on) {
  const ws = document.getElementById('workspace');
  let soon = false;
  const later = () => { if (soon) return; soon = true; requestAnimationFrame(() => { soon = false; fitBoard(on()); }); };
  new ResizeObserver(later).observe(ws);
  // (an emulator builds its board after its document opens, once its design is compiled: a board appearing is watched
  // in the Tasks interface only, by one observer and no timer, so that no closed document is kept: #879)
  const isBoard = n => n.nodeType === 1 && (n.matches('.emu-board-wrap') || !!n.querySelector('.emu-board-wrap'));
  const boards = new MutationObserver(ms => { if (ms.some(m => [...m.addedNodes].some(isBoard))) later(); });
  const watch = () => { if (document.documentElement.dataset.layout === 'tasks') boards.observe(ws, { childList: true, subtree: true }); else boards.disconnect(); };
  new MutationObserver(watch).observe(document.documentElement, { attributes: true, attributeFilter: ['data-layout'] });
  watch();
  return later;
}
