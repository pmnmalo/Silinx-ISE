// Beginner help of the diagnostics in the web UI: the design checks (core/lint.js) with their
// on/off setting (Edit ▸ Design Checks), and the plain-language explanation + fix of a message
// (core/hints.js) shown under it in the Errors / Warnings tabs (expandable) and in the editor tooltip.
import { designChecks } from '/core/lint.js';
import { hintFor, HINT_LABELS } from '/core/hints.js';
import { getLanguage } from './i18n.js';
import { h } from './ui.js';

const KEY = 'silinx.lint';
/** Lint warnings on (default) or off; the language rules (errors) always run. */
export function lintEnabled() {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function setLintEnabled(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* storage unavailable */ }
}

/** Design-check diagnostics of an elaborated design (nothing when it has errors). */
export function designDiags(lib, design) {
  try { return designChecks(lib, design, { lint: lintEnabled() }); } catch { return []; }
}

const lang = () => (getLanguage() === 'pt' ? 'pt' : 'en');
const SEV = { error: 'ERROR', warning: 'WARNING', info: 'INFO' };
/** ISE-style severity word of a diagnostic. */
export const sevWord = d => SEV[d.severity] || 'WARNING';

/** Help text appended to the editor tooltip ('' when there is none). */
export function hintTooltip(d) {
  const hn = hintFor(d);
  if (!hn) return '';
  const L = HINT_LABELS[lang()], t = hn[lang()];
  return `\n\n${L.explain}: ${t.explain}\n${L.fix}: ${t.fix}`;
}

const open = new Set();   // messages whose help is expanded (kept when the list is redrawn)
/** { toggle, box } for a row of the Errors / Warnings tabs, or null when the message has no help. */
export function hintRow(d) {
  const hn = hintFor(d);
  if (!hn) return null;
  const L = HINT_LABELS[lang()], t = hn[lang()];
  const key = `${d.file}:${d.line}:${d.message}`;
  const box = h('div', { class: 'diag-hint', 'data-no-i18n': true, 'data-hint': hn.id },
    h('div', {}, h('b', {}, `${L.explain}: `), t.explain),
    h('div', {}, h('b', {}, `${L.fix}: `), t.fix));
  const toggle = h('span', { class: 'diag-more', 'data-no-i18n': true, role: 'button', title: L.more });
  const show = (on) => { box.hidden = !on; toggle.textContent = `${on ? '▾' : '▸'} ${L.more}`; if (on) open.add(key); else open.delete(key); };
  show(open.has(key));
  toggle.addEventListener('click', (e) => { e.stopPropagation(); show(box.hidden); });
  return { toggle, box };
}
