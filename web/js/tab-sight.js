// The tab of the document in use in sight (#3304): in a strip with more tabs than fit, the active document's tab is
// scrolled into its row's visible part (the one row, or its side's in a split) when the document is brought to the front
// (app.js activateDoc), when the user clicks or focuses in it (a click in the other side of a split, or in the document
// already in front after the strip was scrolled away), when the view changes (the Tasks interface's task, the ISE style's Implementation / Simulation, the interface),
// and when the strip's room changes (the window, a panel, the split's divider resized). Only the strip scrolls, never the
// page. View-only: no MCP tool (#2674).
import { S, activateDoc } from './app.js';

const $ = id => document.getElementById(id);
let mounted = false, pending = false;

// the row that scrolls: a split side's tab group, or the strip
const rowOf = tab => (tab.parentElement?.classList.contains('tab-group') && getComputedStyle(tab.parentElement).display !== 'contents' ? tab.parentElement : $('doc-tabs'));

/** Scrolls `tab` (a shown one) into its row's visible part, the least needed. */
function scrollTabIntoRow(tab) {
  if (!tab?.isConnected) return;
  const row = rowOf(tab), r = tab.getBoundingClientRect();
  if (!row || !r.width) return;   // (not shown: another view's)
  const q = row.getBoundingClientRect();
  if (r.left < q.left) row.scrollLeft -= q.left - r.left;
  else if (r.right > q.right) row.scrollLeft += Math.min(r.right - q.right, r.left - q.left);
}

/** The active document's tab in sight once the layout has settled (the Tasks layout and the split placed it). */
export function tabInSight() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; scrollTabIntoRow(S.active?.tab); });
}

// the document an event's target is in
const docAt = t => (t instanceof Node ? S.docs.find(d => d.el.contains(t)) : null);

/** On the page from the start (split-view.js mountSplit). */
export function mountTabSight() {
  const ws = $('workspace'), bar = $('doc-tabs');
  if (mounted || !ws || !bar) return;
  mounted = true;
  // a click or the focus in a document: its tab the active one, in sight
  const used = e => { const d = docAt(e.target); if (!d || d.closed) return; if (d !== S.active) activateDoc(d); else tabInSight(); };
  ws.addEventListener('pointerdown', used, true);
  ws.addEventListener('focusin', used);
  // the strip's room changed, or the view
  let w = null;
  new ResizeObserver(() => { if (bar.clientWidth !== w) { w = bar.clientWidth; tabInSight(); } }).observe(bar);
  new MutationObserver(tabInSight).observe(document.documentElement, { attributes: true, attributeFilter: ['data-task', 'data-layout', 'data-ui'] });
  document.addEventListener('change', e => { if (e.target?.name === 'view') tabInSight(); });   // (the ISE style's Implementation / Simulation)
}
