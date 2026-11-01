// The message centre (#798, #782; in every interface since #925): the bottom panel as the one place of every
// flow's messages (web/js/tasks.js starts it; its look: web/css/messages.css).
// - Each line of the Console says where it comes from (data-src): Check Syntax (Design), Simulation, Emulation,
//   Implementation (synthesis, implementation and programming the board: one filter, #1173), or the application
//   ('app'); sourceOf() reads it from the processes'
//   headers ("Started : …", "=== SILINX STEP …", iMPACT's "Programming FPGA (SRAM)..."): the lines after a
//   header are its process's.
// - Filters by source follow the task in front in the Tasks interface (Implement: Implementation)
//   until the viewer picks one; All shows every line (the Silinx and ISE style interfaces' default: no task). A
//   process started whose source the viewer's filter hides turns that filter to its source (#1852, #1867); a C
//   module's commands, run where it is edited, turn the task's filter too (#2262).
// - Folded (tasks.js), the panel shows its last line of the current filter.
// - SSim's console and the emulator's Messages box are hidden; their lines come here (Simulation, Emulation).
// - One command line: SSim's commands while simulating (SSim> run 1 us; Simulate in front, or an SSim window in the
//   other interfaces; its history on ↑ / ↓), else the command palette.
// The sources and the filters (sourceOf, filterSources) have no DOM and are unit tested (test/messages.test.js).

import { h } from './ui.js';

export const SOURCES = ['check', 'sim', 'emu', 'impl'];
export const SOURCE_LABEL = { all: 'All', check: 'Design',   // (the design's checks: Check Syntax, Check Constraints, Check Schematic, #994)
  sim: 'Simulation', emu: 'Emulation', impl: 'Implementation' };   // (Implementation: synthesis, implementation and the board's, #1173)
// the sources a task shows when the viewer has not picked a filter
const TASK_SOURCES = { edit: ['check'], sim: ['sim'], emu: ['emu'], impl: ['impl'], prog: ['impl'] };

/** The source of a Console line: the process a header starts, else `cur` (the lines after a header are
 *  its process's; before any, the application's). */
export function sourceOf(line, cur = 'app') {
  const s = String(line).trim();
  let m = /^Started : "([^"]+)"/.exec(s);
  if (m) {
    const p = m[1];
    if (/Check Syntax|Check Constraints|Check Schematic/.test(p)) return 'check';
    if (/^Simulate\b|^Save as Test Bench|^C Simulation$|^C\/RTL Co-simulation$/.test(p)) return 'sim';   // (a C module's runs, #1852)
    return 'impl';   // synthesis, Translate, Map, Place & Route and their models, timing, power, back-annotation, the FPGA view
  }
  if (/^=== SILINX STEP \w+/.test(s)) return 'impl';
  if (/^(ERROR: )?Board Emulator:/.test(s)) return 'emu';
  if (/^(Scanning JTAG chain|Programming |Verifying |Erasing |Backing up |Reloading the FPGA from the PROM)\S*.*\.\.\.$/.test(s)) return 'impl';   // (the board's: Implementation's, #1173)
  if (/^Project ".*" (opened|closed)|^Toolchain: |^Programmers found: |^Silinx ISE \S+ (is up to date|Project Navigator)|^Browser edition: /.test(s)) return 'app';
  return cur;
}

/** The sources shown: `filter` picked by the viewer ('all' or a source), else the task's (null: every source). */
export function filterSources(filter, task) {
  if (filter === 'all') return null;
  if (SOURCES.includes(filter)) return [filter];
  return TASK_SOURCES[task] || null;
}

/** The filter once a process of `src` starts (#1852): its source when the filter the viewer picked hides it (a process
 *  the viewer starts never seems to do nothing), else the filter as it is (one following the task stays the task's). */
export function filterForProcess(src, filter, task) {
  if (!SOURCES.includes(filter)) return filter;
  const set = filterSources(filter, task);
  return set.includes(src) ? filter : src;
}

/** The filter once the viewer runs a command of `src` (#2262): its source when the filter hides it, the task's too (the
 *  C commands run in the Edit task, whose filter shows Design's lines only), else the filter as it is. */
export function filterForCommand(src, filter, task) {
  const set = filterSources(filter, task);
  return !set || set.includes(src) ? filter : src;
}

// ------------------------------------------------------------------ the page
let app = null, picked = null, task = null, built = false, cur = 'app';
const $ = id => document.getElementById(id);
const shownSources = () => filterSources(picked, task);
// (the simulation in front: there may be several, #1161)
const isimInput = () => document.querySelector('#workspace > .doc:not([hidden]) .isim .isim-cmdline input');
// SSim's commands: in the Tasks interface while Simulate is in front, in the others while an SSim window is
const simulating = () => !!isimInput() && (task === 'sim' || (task === null && /^isim(:|$)/.test(app?.S.active?.id || '')));

function tag(ln) {
  if (!ln.dataset.src) {
    ln.dataset.src = cur = sourceOf(ln.textContent, cur);
    // (a process started: shown, the filter turned to its source if it hid it, #1852)
    if (/^Started : "/.test(ln.textContent.trim()) && built) {
      const f = filterForProcess(cur, picked, task);
      if (f !== picked) { picked = f; refilter(); return; }
    }
  } else cur = ln.dataset.src;
  const set = shownSources();
  ln.classList.toggle('mc-off', !!set && !set.includes(ln.dataset.src));
}
function retagAll() {
  cur = 'app';
  for (const ln of $('console-log').children) { delete ln.dataset.src; tag(ln); }
}
function refilter() {
  const set = shownSources();
  for (const ln of $('console-log').children) ln.classList.toggle('mc-off', !!set && !set.includes(ln.dataset.src));
  // (pressed: the sources shown; All when every one is)
  for (const b of document.querySelectorAll('#mc-filters .filt')) b.setAttribute('aria-pressed', String(set ? set.includes(b.dataset.src) : b.dataset.src === 'all'));
  showLast();
  const log = $('console-log');
  log.scrollTop = log.scrollHeight;
}
// the folded panel's line: the last one of the filter
function showLast() {
  const last = $('mc-last');
  if (!last) return;
  const ln = [...$('console-log').children].reverse().find(l => !l.classList.contains('mc-off') && l.textContent.trim());
  last.textContent = ln ? ln.textContent : '';
  last.className = ln ? ln.className.replace(/\bmc-off\b/, '') : '';
}

// a line of SSim's console or of the emulator's Messages box, written here with its source
function mirror(text, cls, src) {
  app.log(text, cls, { diag: false });
  const ln = $('console-log').lastElementChild;
  if (ln) { ln.dataset.src = src; tag(ln); }
}
const ISIM_CLS = { 'k-error': 'err', 'k-failure': 'err', 'k-warning': 'warn', 'k-cmd': 'hdr' };
const isimCls = el => Object.entries(ISIM_CLS).find(([k]) => el.classList.contains(k))?.[1] || '';
// SSim's console and the emulator's log, followed while they are open (their own copies are hidden)
const followed = new WeakSet();
function follow() {
  if (!built) return;
  for (const cons of document.querySelectorAll('#workspace .isim-console')) {
    if (followed.has(cons)) continue;
    followed.add(cons);
    for (const el of cons.children) mirror(el.textContent, isimCls(el), 'sim');
    new MutationObserver(ms => { if (built) for (const m of ms) for (const el of m.addedNodes) if (el.nodeType === 1) mirror(el.textContent, isimCls(el), 'sim'); }).observe(cons, { childList: true });
  }
  for (const logEl of document.querySelectorAll('#workspace .emu-log')) {
    if (followed.has(logEl)) continue;
    followed.add(logEl);
    const cls = el => (el.classList.contains('error') ? 'err' : el.classList.contains('warning') ? 'warn' : '');
    for (const el of logEl.children) mirror(el.textContent, cls(el), 'emu');
    new MutationObserver(ms => { if (built) for (const m of ms) for (const el of m.addedNodes) if (el.nodeType === 1) mirror(el.textContent, cls(el), 'emu'); }).observe(logEl, { childList: true });
  }
}

// the command line: SSim's commands while simulating, else the command palette
async function runCommand(input) {
  const v = input.value.trim();
  if (!v) return;
  input.value = '';
  const isim = isimInput();
  if (simulating()) {
    isim.value = v;
    isim.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return;
  }
  const { showPalette } = await import('./menus.js');
  showPalette();
  const q = document.querySelector('.pal-input');
  if (q) { q.value = v; q.dispatchEvent(new Event('input', { bubbles: true })); }
}
function prompt() {
  const sim = simulating();
  const p = document.querySelector('#mc-cmd .mc-prompt'), input = document.querySelector('#mc-cmd input');
  if (!p) return;
  p.textContent = sim ? 'SSim>' : '›';
  input.placeholder = sim ? 'Type an SSim command (help)' : 'Type a command or a file name';
}

/** Builds the message centre (the Tasks interface). `a` is the app (web/js/app.js). */
function build() {
  built = true;
  $('console-tabs').append(h('div', { id: 'mc-filters', role: 'group', 'aria-label': 'Messages from' },
    ...['all', ...SOURCES].map(src => h('button', { class: 'filt', type: 'button', 'data-src': src, onclick: () => { picked = src; refilter(); } }, SOURCE_LABEL[src]))),
    h('div', { id: 'mc-last', 'data-no-i18n': true }));
  const input = h('input', { type: 'text', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Command line' });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); runCommand(input); return; }
    // (SSim's history: its own command line's, which keeps it)
    const isim = isimInput();
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && isim && simulating()) {
      e.preventDefault();
      isim.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, bubbles: true }));
      input.value = isim.value;
    }
  });
  // (under the console's lines: Silinx's grid row 3, ISE style's before the tabs under them; web/css/messages.css)
  $('console-body').after(h('div', { id: 'mc-cmd' }, h('span', { class: 'mc-prompt' }), input));
  retagAll();
  refilter();
  prompt();
  follow();
}
/** The task in front (the Tasks interface; null in the others: every source): the filter follows it (what the
 *  viewer picked is forgotten). */
export function messagesTask(t) {
  task = t;
  picked = null;
  if (!built) return;
  refilter();
  prompt();
}

/** A command the viewer ran, of source `src` (#2262): its lines shown, whatever the filter (filterForCommand). */
export function showCommandLines(src) {
  if (!built) return;
  const f = filterForCommand(src, picked, task);
  if (f !== picked) { picked = f; refilter(); }
}

/** Builds the message centre and follows the Console's new lines, the documents opened (SSim, the emulator) and the
 *  one in front (the command line's prompt). `a` is the app (web/js/app.js). */
export function initMessages(a) {
  app = a;
  build();
  new MutationObserver(ms => {
    if (!built) return;
    for (const m of ms) for (const el of m.addedNodes) if (el.nodeType === 1 && !el.dataset.src) tag(el);
    if (ms.some(m => m.removedNodes.length) && !$('console-log').childElementCount) cur = 'app';   // (cleared)
    showLast();
  }).observe($('console-log'), { childList: true });
  // (SSim and the emulator build their windows after their documents open: looked for once a frame at most)
  let soon = false;
  new MutationObserver(() => {
    if (!built || soon) return;
    soon = true;
    requestAnimationFrame(() => { soon = false; follow(); prompt(); });
  }).observe($('workspace'), { childList: true, subtree: true });
  new MutationObserver(() => prompt()).observe($('doc-tabs'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
}
