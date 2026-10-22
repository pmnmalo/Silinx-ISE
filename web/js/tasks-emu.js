// The Tasks interface's Emulate task (#801, #782): the board gets the screen.
// - The board fits the task's area, its LEDs, display, switches and buttons always on screen: its picture, drawn at
//   a fixed size by web/js/emulator.js, is zoomed (CSS zoom, which keeps the pointer's aim) to the room it has,
//   measured again when the window, the task's panels or the board change (fitBoard).
// - The emulator's side column (Watch, the timing generics, the hints) is the task's side panel, shown at first (#1020):
//   beside the board, below it on a narrow screen; the Design pane is not shown in Emulate (web/css/tasks.css).
// - The emulator's own bar stays its controls (Model, Engine, Run, Step, Power cycle, Clock), right under the task's
//   bar; its Messages box is in the message centre (#798).
// boardZoom has no DOM and is unit tested (test/tasks.test.js).

export const MAX_ZOOM = 1.5, MIN_ZOOM = 0.3;
const GAP = 12;   // (.emu-main's padding and gap, web/js/emulator.js)

/** The zoom of a board of size `board` ({ w, h }) in the room `room` ({ w, h }): as large as fits, at most MAX_ZOOM. */
export function boardZoom(room, board) {
  if (!(board?.w > 0) || !(board?.h > 0) || !(room?.w > 0) || !(room?.h > 0)) return 1;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, room.w / board.w, room.h / board.h));
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
    const below = shown(side) && getComputedStyle(main).flexDirection === 'column';
    const beside = shown(side) && !below;
    const others = [...main.children].filter(c => c !== wrap && c !== side && shown(c));   // (the VGA monitor)
    const room = {
      w: main.clientWidth - 2 * GAP - (beside ? side.offsetWidth + GAP : 0) - others.reduce((s, c) => s + c.offsetWidth + GAP, 0),
      h: emu.clientHeight - (bar?.offsetHeight || 0) - 2 * GAP - (below ? Math.min(side.scrollHeight, emu.clientHeight * 0.35) + GAP : 0),
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
