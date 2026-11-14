// SSim's view of time (#405: out of mountISim in isim.js): time to x and back, the fit to the simulated time, the
// zoom about a point, the view kept in the simulated span, a time brought into view, and the scrollbars of the rows
// and of the time (#915: the view's own scroll told from the user's). The fit again when the documents' room changed
// (web/js/layout-fit.js, #3804).
import { ROW_H, RULER_H, clamp } from './isim.js';
import { onLayoutToggled } from './layout-fit.js';

/** { applyFit, clampView, ensureVisible, tOf, updateHScroll, updateVScroll, xOf, zoomAt, zoomFit } of mountISim (WH(), WW(): its current values). */
export function mountView(ctx) {
  const {
    WH, WW, cleanups, flat, hsc, invalidate, measure, on, sim, st, vsc, waveArea
  } = ctx;

  // ---------------------------------------------------------------- view math
  const xOf = (t) => (t - st.t0) / st.scale;
  const tOf = (x) => st.t0 + x * st.scale;
  function endTime() { return Math.max(sim.now, 1); }
  function applyFit() {
    if (WW() <= 1) measure();
    const span = sim.now > 0 ? Math.max(sim.now, 1000) : 1e6;
    st.t0 = 0; st.scale = span / Math.max(50, WW() - 10);
  }
  function zoomFit() { st.fit = true; applyFit(); invalidate(); }
  cleanups.push(onLayoutToggled(waveArea, () => zoomFit()));   // (the documents' room changed: Full View, #3804)
  function zoomAt(f, x = null) {
    const px = x ?? (st.cursor >= st.t0 && st.cursor <= tOf(WW()) ? xOf(st.cursor) : WW() / 2);
    const tc = tOf(px);
    const maxScale = Math.max(endTime(), 1000) * 4 / Math.max(WW(), 1);
    st.scale = clamp(st.scale * f, 0.002, maxScale);
    st.t0 = tc - px * st.scale;
    st.fit = false;
    clampView(); invalidate();
  }
  function clampView() {
    const span = WW() * st.scale;
    const maxT0 = Math.max(0, Math.max(endTime(), span) - span * 0.5);
    st.t0 = clamp(st.t0, 0, Math.max(maxT0, 0));
  }
  function ensureVisible(t) {
    const span = WW() * st.scale;
    if (t < st.t0 || t > st.t0 + span) { st.t0 = Math.max(0, t - span / 2); st.fit = false; clampView(); }
    invalidate();
  }

  // ---------------------------------------------------------------- scrollbars
  // where the view last put the time's scrollbar: a scroll event that finds it there is the view's own, not the
  // user's (#915: the view's scrolls were counted, a count that drifted when the browser fired an event the view
  // had not caused, and the view's own scroll of a frame before, arriving late, took the time back from a
  // two-finger scroll). The rows' scrollbar is the rows' scroll itself (st.scrollY follows it).
  let setLeft = null;
  function totalRowsH() { return flat().length * ROW_H + RULER_H + ROW_H; }
  function updateVScroll() {
    const inner = vsc.firstElementChild;
    inner.style.height = totalRowsH() + 'px';
    st.scrollY = clamp(st.scrollY, 0, Math.max(0, totalRowsH() - WH()));
    if (Math.abs(vsc.scrollTop - st.scrollY) > 0.5) { vsc.scrollTop = st.scrollY; }
  }
  let hTotal = 1, hSpacer = 1;
  function updateHScroll() {
    const span = WW() * st.scale;
    hTotal = Math.max(endTime(), st.t0 + span);
    const cw2 = hsc.clientWidth || WW();
    hSpacer = Math.min(4e6, Math.max(cw2, cw2 * hTotal / span));
    hsc.firstElementChild.style.width = hSpacer + 'px';
    const sl = (st.t0 / hTotal) * hSpacer;
    if (Math.abs(hsc.scrollLeft - sl) > 1) hsc.scrollLeft = sl;
    // (also when the scrollbar shortened put it there itself, #1616: Zoom to Full View, its scroll event taken for
    // the user's, undid the full view)
    setLeft = hsc.scrollLeft;
  }
  on(vsc, 'scroll', () => {
    st.scrollY = vsc.scrollTop; invalidate(false);
  });
  on(hsc, 'scroll', () => {
    if (setLeft !== null && Math.abs(hsc.scrollLeft - setLeft) <= 1) return;
    st.t0 = (hsc.scrollLeft / hSpacer) * hTotal; st.fit = false; invalidate(false);
  });

  return { applyFit, clampView, ensureVisible, tOf, updateHScroll, updateVScroll, xOf, zoomAt, zoomFit };
}
