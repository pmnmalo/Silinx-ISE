// The room of the documents changed by the user (#1203, #3804): the side panel or the messages shown or hidden, a
// document maximized or restored (web/js/tasks.js), the editor split or unsplit (web/js/split-view.js). A drawing on
// display zooms to Full View then, in the main view and in each view of a split editor: the schematic editor
// (web/js/sch-editor.js), the RTL / Technology viewer (web/js/schematic-view.js), the state diagram, ASM chart, Petri
// net and symbol editors, the waveform (web/js/isim.js).
//   layoutToggled();                              // the toggle's side
//   const off = onLayoutToggled(element, fit);    // a drawing's side; off() when it is destroyed
// The room settles after the toggle (the layout, a transition): the drawing fits at once, again on every size
// change in the next half second, and at its end. A drawing hidden then (a tab behind another) fits when it is shown,
// if its room is not the one it had when last shown. The user's own resizes (a window, a divider) fit nothing.

const LAYOUT_TOGGLED = 'silinx:layout-toggled';
const SETTLE = 500;

/** Says that the user changed the documents' room. */
export function layoutToggled() { dispatchEvent(new Event(LAYOUT_TOGGLED)); }

/** Calls fit() when the user changes the documents' room while `el` is shown (hidden: once shown, its room changed);
 *  returns the function that stops it. */
export function onLayoutToggled(el, fit) {
  let until = 0, timer = 0, stale = false, room = '';
  const shown = () => el.isConnected && el.getClientRects().length > 0;
  const roomOf = () => `${el.clientWidth}x${el.clientHeight}`;
  const go = () => {
    if (!shown()) { stale = true; return; }
    stale = false;
    room = roomOf();
    fit();
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
    if (!shown()) return;
    if (performance.now() < until || (stale && roomOf() !== room)) go();
    else { stale = false; room = roomOf(); }
  }) : null;
  ro?.observe(el);
  const on = () => {
    until = performance.now() + SETTLE;
    clearTimeout(timer);
    requestAnimationFrame(go);
    timer = setTimeout(go, SETTLE);
  };
  addEventListener(LAYOUT_TOGGLED, on);
  return () => { ro?.disconnect(); clearTimeout(timer); removeEventListener(LAYOUT_TOGGLED, on); };
}
