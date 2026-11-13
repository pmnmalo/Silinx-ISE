// The console (Console / Errors / Warnings tabs at the bottom): the log, the warnings and errors it
// collects, and the quick fixes of the messages (#405: out of app.js).
import { icon } from './icons.js';
import { h } from './ui.js';
import { quickFixes } from '/core/quickfix.js';
import { t, onLanguageChange } from './i18n.js';
import { hintRow, sevWord } from './diaghelp.js';
import { S, app } from './app.js';
import { MESSAGE_LINE } from './tool-descriptors.js';

const $ = id => document.getElementById(id);

// action: { label, run }, a button at the end of the (last) line: what the line asks of the user (Trust Project, #2830);
// it is disabled once run
export function log(text, cls = '', { diag = true, action = null } = {}) {
  const el = $('console-log');
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
  for (const line of String(text).split('\n')) {
    el.append(h('div', { class: `ln ${cls}` }, line));
    if (diag) consoleMessage(line, cls);
  }
  if (action) {
    const b = h('button', { type: 'button', class: 'btn ln-action', onclick: async () => { b.disabled = true; try { await action.run(); } catch (e) { b.disabled = false; log(`ERROR: ${e.message}`, 'err'); } } }, t(action.label));
    el.lastElementChild.append(' ', b);
  }
  while (el.childElementCount > 5000) el.firstChild.remove();
  if (atBottom) el.scrollTop = el.scrollHeight;
}

// Every warning/error shown in the console also goes to the Warnings / Errors tabs.
// Recognised forms: "ERROR:Tool:123 - msg", "WARNING:Tool - msg", "ERROR: msg", "WARNING: msg";
// indented lines right after one are its continuation (ISE wraps long messages) — unless the
// message is already complete (ends a sentence) or the line is report output (XST's indented
// "Found finite state machine…", tables, rules), which would otherwise be glued to the warning.
let lastConsoleDiag = null;
const continuesDiag = (d, line) => /^\s{2,}\S/.test(line) && !/[.!?:]\s*$/.test(d.message)
  && !/^\s*([|=+-]{2,}|\||Found\b|Summary:|Unit\b|Synthesizing\b|inferred\b)/.test(line);
function consoleMessage(line, cls) {
  if (lastConsoleDiag && !cls && continuesDiag(lastConsoleDiag, line)) {
    lastConsoleDiag.message += ' ' + line.trim();
    renderDiagnosticsSoon();
    return;
  }
  lastConsoleDiag = null;
  if (cls !== 'err' && cls !== 'warn') return;
  const m = MESSAGE_LINE.exec(line);
  let severity = cls === 'err' ? 'error' : 'warning', tool = 'Silinx', message = line.trim();
  if (m) { severity = /error|fatal/i.test(m[1]) ? 'error' : 'warning'; tool = m[2] || 'Silinx'; message = m[3]; }
  else if (/=== SILINX FAILED/.test(line)) { tool = 'Silinx'; message = line.replace(/=+/g, '').trim(); }
  if (!message) return;
  const d = { severity, tool, message, file: null, line: 0, source: 'console' };
  S.diags.push(d);
  lastConsoleDiag = d;
  renderDiagnosticsSoon();
}

let diagTimer = null;
function renderDiagnosticsSoon() {
  if (diagTimer) return;
  diagTimer = setTimeout(() => { diagTimer = null; renderDiagnostics(); }, 50);
}
export function logLine(line, opts) {
  let cls = '';
  if (/^(ERROR|FATAL)|\bERROR:/i.test(line) || /=== SILINX FAILED/.test(line)) cls = 'err';
  else if (/^WARNING|\bWARNING:/i.test(line)) cls = 'warn';
  else if (/=== SILINX (STEP|DONE)/.test(line) || /completed successfully/i.test(line)) cls = 'ok';
  log(line, cls, opts);
}
/** An error of the app's own (#3540: a file it cannot read; #3591: a refusal, a menu action's error): an ERROR line
 *  of the console, in the interface's language, its Errors tab in front (no toasted message). */
export function logError(text) {
  log(`ERROR: ${t(text)}`, 'err');
  bringForward('errors');
}
/** A warning of the app's own (#3591): a WARNING line of the console, its Warnings tab in front. */
export function logWarning(text) {
  log(`WARNING: ${t(text)}`, 'warn');
  bringForward('warnings');
}
/** A piece of information of the app's own (#3591: why a command does nothing): an INFO line of the console, the
 *  console's page in front. */
export function logInfo(text) {
  log(`INFO: ${t(text)}`, 'info');
  bringForward('console');
}
export function showConsolePage(page) {
  // (a tab of the console only: the keyboard's focus stays where it is, an editor's typing goes on)
  broughtForward = null;
  document.querySelectorAll('#console-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.page === page));
  document.querySelectorAll('.console-page').forEach(p => { p.hidden = p.dataset.page !== page; });
}

// Diagnostics (Errors / Warnings tabs)
export function setDiagnostics(diags, { keepConsole = true } = {}) {
  // a check replaces its own entries; warnings/errors collected from the console (e.g. a running
  // implementation) are kept unless keepConsole is false, and the open editors' problems (editor-problems.js) always
  S.diags = [...diags, ...S.diags.filter(d => (keepConsole && d.source === 'console') || d.source === 'editor')];
  lastConsoleDiag = null;
  renderDiagnostics();
  // push file-local diagnostics to open editors
  for (const doc of S.docs) if (doc.editor) doc.editor.setDiagnostics(diags.filter(d => d.file === doc.path && d.source !== 'parse'));
}

export function renderDiagnostics() {
  const diags = S.diags;
  const errs = diags.filter(d => d.severity === 'error'), warns = diags.filter(d => d.severity !== 'error');
  const fill = (el, list, ico) => {
    el.innerHTML = '';
    if (!list.length) { el.append(h('div', { class: 'ln info' }, t('No messages.'))); return; }
    for (const d of list) {
      const hint = hintRow(d);   // plain-language explanation + fix, expandable under the message
      const row = h('div', { class: 'diag' }, icon(ico),
        h('span', {}, `${sevWord(d)}:${d.tool || 'HDLCompiler'} - `),
        d.file ? h('span', { class: 'loc' }, d.line ? `"${d.file}" Line ${d.line}` : `"${d.file}"`) : null,
        h('span', { 'data-no-i18n': true }, d.file ? `: ${d.message}` : d.message), hint?.toggle,
        ...diagFixes(d).map(f => h('span', { class: 'diag-fix', role: 'button', 'data-no-i18n': true, onclick: e => { e.stopPropagation(); applyDiagFix(d, f); } }, `${t('Fix:')} ${t(f.title)}`)));
      // (an editor's problem: its item selected, editor-problems.js)
      row.addEventListener('click', () => (d.goto ? d.goto() : d.file && app.openFile(d.file, d.line, d.col)));
      el.append(row);
      if (hint) el.append(hint.box);
    }
  };
  fill($('console-errors'), errs, 'err');
  fill($('console-warnings'), warns, 'warn');
  $('err-count').textContent = errs.length ? `(${errs.length})` : '';
  $('warn-count').textContent = warns.length ? `(${warns.length})` : '';
  focusNewDiagnostics(errs, warns);
}

// A new error brings the Errors tab forward, else a new warning the Warnings one (#2733), whoever wrote it: once per
// drawing (the console's lines are drawn at most every 50 ms: a run's batch, errors winning), a message already listed
// (an editor's problem checked again as it is typed) not again, but one written again (a process run again: listed
// twice) is new, and a warning leaves the Errors tab in front while it lists errors. A tab so brought forward goes back
// to the Console once it lists nothing (cleared, another project opened: the start-up checks' warnings); one the viewer
// picked stays. The Tasks interface opens its folded messages on the event (web/js/tasks.js).
let listedDiags = new Map(), broughtForward = null;
const diagKey = d => `${d.severity}|${d.tool || ''}|${d.file || ''}|${d.line || 0}|${d.message}`;
const pageShown = () => document.querySelector('#console-tabs .tab.active')?.dataset.page;
function focusNewDiagnostics(errs, warns) {
  const before = listedDiags;
  listedDiags = new Map();   // (each message's count: one listed more times than before is new)
  const isNew = d => { const k = diagKey(d), n = (listedDiags.get(k) || 0) + 1; listedDiags.set(k, n); return n > (before.get(k) || 0); };
  const newErr = errs.map(isNew).some(Boolean), newWarn = warns.map(d => isNew(d) && d.severity === 'warning').some(Boolean);
  const page = newErr ? 'errors' : newWarn && !(errs.length && pageShown() === 'errors') ? 'warnings' : null;
  if (!page) {
    if (broughtForward && pageShown() === broughtForward && !(broughtForward === 'errors' ? errs : warns).length) showConsolePage('console');
    return;
  }
  bringForward(page);
}
function bringForward(page) {
  showConsolePage(page);
  broughtForward = page;
  document.dispatchEvent(new CustomEvent('silinx:console-problems', { detail: { page } }));
}

/** The end of a check (#2803: Check Syntax, Check Constraints, a drawing's Check or Validate): its errors bring the
 *  Errors tab forward, else its warnings the Warnings tab, also when they were listed already (the same check run
 *  again). Its page, or null when it found neither (the tabs as they were). */
export function showProblems(diags) {
  const page = diags.some(d => d.severity === 'error') ? 'errors' : diags.some(d => d.severity === 'warning') ? 'warnings' : null;
  if (page) bringForward(page);
  return page;
}
onLanguageChange(() => renderDiagnostics());

// Quick fixes of a message (core/quickfix.js): "Fix: …" in its row of the Errors / Warnings tabs.
// Applied in the file's editor (one Undo there); the file's messages are then checked again.
const fixModules = () => S.modules.map(m => ({ name: m.name, ports: (m.portList || []).map(p => p.name), params: m.paramList || [] }));
function diagFixes(d) {
  const src = d.file && S.sources.find(s => s.path === d.file);
  // (not a drawing's generated HDL, with a file of its own or not: read-only, #1176)
  if (!src || src.view || S.hdlToSch?.[src.path] || (src.lang !== 'vhdl' && src.lang !== 'verilog')) return [];
  const text = S.docs.find(o => o.path === d.file && o.editor)?.editor.getValue() ?? src.text;
  try { return quickFixes(text, src.lang, d, { modules: fixModules() }).slice(0, 3); } catch { return []; }
}
async function applyDiagFix(d, f) {
  const doc = await app.openFile(d.file, d.line, d.col);
  const ed = doc?.editor;
  if (!ed) return;
  // the same fix on the editor's text now (it may have changed since the row was drawn)
  const fix = ed.quickFixes(d).find(x => x.title === f.title);
  if (fix) ed.applyFix(fix); else logInfo('No quick fix here.');
}

// the Clear button: the console's lines and the messages of the tabs
export function clearConsole() {
  $('console-log').innerHTML = '';
  S.diags = [];
  lastConsoleDiag = null;
  renderDiagnostics();
}
