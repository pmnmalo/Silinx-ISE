// The console (Console / Errors / Warnings tabs at the bottom): the log, the warnings and errors it
// collects, and the quick fixes of the messages (#405: out of app.js).
import { icon } from './icons.js';
import { h, toast } from './ui.js';
import { quickFixes } from '/core/quickfix.js';
import { t, onLanguageChange } from './i18n.js';
import { hintRow, sevWord } from './diaghelp.js';
import { S, app, activateDoc } from './app.js';
import { MESSAGE_LINE } from './tool-descriptors.js';
import { checkLines } from './tasks-check.js';

const $ = id => document.getElementById(id);

export function log(text, cls = '', { diag = true } = {}) {
  const el = $('console-log');
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
  for (const line of String(text).split('\n')) {
    el.append(h('div', { class: `ln ${cls}` }, line));
    if (diag) consoleMessage(line, cls);
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
export function showConsolePage(page) {
  document.querySelectorAll('#console-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.page === page));
  document.querySelectorAll('.console-page').forEach(p => { p.hidden = p.dataset.page !== page; });
}

// Diagnostics (Errors / Warnings tabs)
export function setDiagnostics(diags, { keepConsole = true } = {}) {
  // a check replaces its own entries; warnings/errors collected from the console (e.g. a running
  // implementation) are kept unless keepConsole is false, the open drawings' problems always (#2718)
  S.diags = [...diags, ...S.diags.filter(d => d.source === 'drawing' || (keepConsole && d.source === 'console'))];
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
    if (!list.length) { el.append(h('div', { class: 'ln info' }, 'No messages.')); return; }
    for (const d of list) {
      const hint = hintRow(d);   // plain-language explanation + fix, expandable under the message
      const row = h('div', { class: 'diag' }, icon(ico),
        h('span', {}, `${sevWord(d)}:${d.tool || 'HDLCompiler'} - `),
        d.file ? h('span', { class: 'loc' }, d.line ? `"${d.file}" Line ${d.line}` : `"${d.file}"`) : null,
        h('span', { 'data-no-i18n': true }, `${d.file ? ': ' : ''}${d.source === 'drawing' ? t(d.message) : d.message}`), hint?.toggle,   // (a drawing's problems in the language, #2718)
        ...diagFixes(d).map(f => h('span', { class: 'diag-fix', role: 'button', 'data-no-i18n': true, onclick: e => { e.stopPropagation(); applyDiagFix(d, f); } }, `${t('Fix:')} ${t(f.title)}`)));
      row.addEventListener('click', () => (d.focus ? d.focus() : d.file && app.openFile(d.file, d.line, d.col)));
      el.append(row);
      if (hint) el.append(hint.box);
    }
  };
  fill($('console-errors'), errs, 'err');
  fill($('console-warnings'), warns, 'warn');
  $('err-count').textContent = errs.length ? `(${errs.length})` : '';
  $('warn-count').textContent = warns.length ? `(${warns.length})` : '';
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
  if (fix) ed.applyFix(fix); else toast('No quick fix here.', 'info');
}

// A drawing's problems (#2718, web/js/problems.js): its errors and warnings, its file's entries of the Errors and
// Warnings tabs, replacing its last ones; its notes (info), lines of the console's log as ISE's INFO lines, each written
// once (again once it went and came back); a click on one brings the drawing in front with the item selected. A check
// asked for (ASM's Validate) writes its lines in the log too (web/js/tasks-check.js checkLines).
const notesSaid = new Map();   // file -> the notes in the log
document.addEventListener('silinx-problems', e => {
  const doc = S.docs.find(d => d.el.contains(e.target));
  if (!doc?.path) return;   // (a view made from another file, the Petri net's state machine: not checked)
  const { tool, diags, focus, check, name } = e.detail;
  const show = d => () => { if (!doc.closed) { activateDoc(doc); focus?.(d); } };
  const listed = diags.filter(d => d.severity !== 'info'), notes = diags.filter(d => d.severity === 'info');
  const mine = d => d.source === 'drawing' && d.file === doc.path, key = list => list.map(d => `${d.severity}:${d.message}`).join('\n');
  const same = key(S.diags.filter(mine)) === key(listed);   // (said again as it is drawn: the tabs as they are)
  S.diags = [...S.diags.filter(d => !mine(d)), ...listed.map(d => ({
    severity: d.severity, tool, message: d.message, file: doc.path, line: 0, source: 'drawing', focus: show(d),
  }))];
  if (!same) renderDiagnosticsSoon();
  const said = notesSaid.get(doc.path) || new Set();
  if (!check) for (const d of notes.filter(n => !said.has(n.message))) logLink(`INFO:${tool} - "${doc.path}": ${d.message}`, '', show(d));
  notesSaid.set(doc.path, new Set(notes.map(n => n.message)));
  if (!check) return;
  for (const l of checkLines(check, name, diags)) if (l.diag) logLink(l.text, l.cls, show(l.diag)); else log(l.text, l.cls, { diag: false });
  showConsolePage('console');
});
// a line of the log that takes the editor to its item
function logLink(text, cls, onclick) {
  log(text, cls, { diag: false });
  const ln = $('console-log').lastElementChild;
  ln.classList.add('mc-link');
  ln.addEventListener('click', onclick);
}

// the Clear button: the console's lines and the messages of the tabs
export function clearConsole() {
  $('console-log').innerHTML = '';
  S.diags = [];
  lastConsoleDiag = null;
  renderDiagnostics();
}
