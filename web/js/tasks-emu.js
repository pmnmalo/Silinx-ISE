// The Tasks interface's Emulate task (#801, #782): the board gets the screen.
// - The board fits the window (#1021, #1999): its picture, drawn at a fixed size by web/js/emulator.js, is zoomed (CSS
//   zoom, which keeps the pointer's aim) to the room left of the emulator's side panel, at most MAX_ZOOM; on a small
//   window (a tablet) it is made smaller, down to MIN_ZOOM; measured again when the window, the task's panels, the
//   emulator's side panel (folded, #2666) or the board change (fitBoard).
// - The emulator's side panel (Watch, the timing generics, the hints) is shown at first (#1020): at the right of the
//   board (#2666), over it on a narrow window, behind the bar's ☰ Properties (#2713); the VGA monitor wraps below the board when the width runs short, and the
//   board's area scrolls (web/css/tasks.css); the Design pane is not shown in Emulate.
// - Its Processes (#1204): the top module's User Constraints (I/O Pin Planning, Edit Constraints (Text), Check
//   Constraints) and Emulate on Board with its models, as in Implement: the task's side panel, as Implement's
//   (web/js/tasks.js, #1399).
// - The emulator's own bar stays its controls (Model, Engine, Run, Step, Power cycle, Clock), right under the task's
//   bar; its status (the emulated time and rate) is right below the board, in place of the board's line (#1022); its
//   Messages box is in the message centre (#798).
// boardZoom has no DOM and is unit tested (test/tasks.test.js).

export const MAX_ZOOM = 1.5, MIN_ZOOM = 0.7;   // (smaller on a tablet, but not below 0.7: its labels kept legible, #1999)
const GAP = 12;   // (.emu-main's padding and gap, web/js/emulator.js)
const BAR = 16;   // (a scrollbar's room: the area scrolling down once zoomed, #1399)

/** The zoom of a board of size `board` ({ w, h }) in the room `room` ({ w, h }): as large as fits, at most MAX_ZOOM,
 *  at least MIN_ZOOM (the room smaller still: the task's area scrolls). */
export function boardZoom(room, board) {
  if (!(board?.w > 0) || !(board?.h > 0) || !(room?.w > 0) || !(room?.h > 0)) return 1;
  // (to the hundredth below: a board that fills the room makes it scroll in neither direction)
  return Math.max(MIN_ZOOM, Math.floor(100 * Math.min(MAX_ZOOM, room.w / board.w, room.h / board.h)) / 100);
}

const shown = el => !!el && el.getClientRects().length > 0;
/** The emulator's status (t = … ns · … cycles · … kHz (…% of real time)) right below the board in the Tasks interface,
 *  in place of the board's line (hidden by web/css/tasks.css); in the emulator's status line in the others (#1022, #2763). */
function placeStat(emu, wrap) {
  const stat = emu.querySelector(':scope > .doc-status > .stat, .emu-board-wrap > .stat'), bar = emu.querySelector(':scope > .doc-status');
  if (!stat || !bar) return;
  if (document.documentElement.dataset.layout === 'tasks') { if (stat.parentNode !== wrap) wrap.append(stat); }
  else if (stat.parentNode !== bar) bar.append(stat);
}
/** Zooms each open emulator's board to its room (`on`: the Tasks interface's Emulate; else its own size). */
export function fitBoard(on) {
  for (const emu of document.querySelectorAll('#workspace .doc .emu')) {
    const wrap = emu.querySelector('.emu-board-wrap');
    if (!wrap) continue;
    placeStat(emu, wrap);
    wrap.style.zoom = '';
    if (!on || !shown(emu)) continue;
    const main = emu.querySelector('.emu-main'), bar = emu.querySelector('.emu-bar');
    // (the board's area, the side panel at its right or over it, #2666, #2713: the VGA monitor wraps below the board)
    const h = emu.clientHeight - (bar?.offsetHeight || 0) - 2 * GAP, board = { w: wrap.offsetWidth, h: wrap.offsetHeight };
    wrap.style.zoom = String(boardZoom({ w: main.clientWidth - 2 * GAP - BAR, h }, board));
  }
}

/** Fits the boards whenever the workspace's size changes or an emulator's board appears (in the Tasks interface). */
export function initEmulate(on) {
  const ws = document.getElementById('workspace');
  let soon = false;
  const later = () => { if (soon) return; soon = true; requestAnimationFrame(() => { soon = false; fitBoard(on()); }); };
  new ResizeObserver(later).observe(ws);
  addEventListener('resize', later);   // (also an emulator's side panel folded or expanded: side-fold.js)
  // (an emulator builds its board after its document opens, once its design is compiled: a board appearing is watched
  // in the Tasks interface only, by one observer and no timer, so that no closed document is kept: #879)
  const isBoard = n => n.nodeType === 1 && (n.matches('.emu-board-wrap') || !!n.querySelector('.emu-board-wrap'));
  const boards = new MutationObserver(ms => { if (ms.some(m => [...m.addedNodes].some(isBoard))) later(); });
  const watch = () => { if (document.documentElement.dataset.layout === 'tasks') boards.observe(ws, { childList: true, subtree: true }); else boards.disconnect(); };
  new MutationObserver(watch).observe(document.documentElement, { attributes: true, attributeFilter: ['data-layout'] });
  watch();
  return later;
}
