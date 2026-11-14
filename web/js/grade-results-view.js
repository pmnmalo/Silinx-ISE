// The class's results of an exercise as a document (#3864, core/grade-class.js): a teacher's run's JSON (`silinx grade
// --json`, `silinx classroom grade --json`), opened by the Exercise document's ⋮ menu's Class Results… (a file picked
// from the computer) or from the Files (a grades.json, a <name>.grades.json). As every viewer (docs/UI-GUIDELINES.md):
// its toolbar (Export CSV), the tests (the class's weakest first: how many students each Accepted, its most frequent
// other verdict), the students (each test's verdict and points; a click puts the student's report in the console), its
// status line (the students, the Accepted, the mean). The file is untrusted: checked as results, its texts shown as
// text (data-no-i18n), its CSV's cells escaped.
import { h, dialog, downloadText } from './ui.js';
import { api } from './api.js';
import { S, findDoc, openDoc } from './app.js';
import { log } from './console.js';
import { statusLine } from './status-line.js';
import { parseResults, classSummary, classCsv } from '/core/grade-class.js';
import { textReport } from '/core/grade-report.js';
import { VERDICTS } from '/core/grade-format.js';

const pc = r => `${Math.round(r * 100)}%`;

/** Opens the results `text` (of the file `file`) as a document; `ex`: the exercise, for its tests' order (or null). */
function openResults(file, text, ex = null) {
  const r = parseResults(text, file);
  if (r.problems.length) { for (const m of r.problems) log(`ERROR: ${m}`, 'err'); return null; }
  const id = `results:${file}`;
  if (findDoc(id)) return openDoc({ id });
  return openDoc({ id, title: file.split('/').pop(), tooltip: file, icon: 'file', create: el => mountResults(el, file, r.results, ex) });
}

/** A results file of the project, from the Files. */
export async function openResultsFile(path) {
  let text;
  try { text = await api.readFile(S.project.name, path); } catch (e) { log(`ERROR: ${path} cannot be read: ${e.message}`, 'err'); return null; }
  return openResults(path, text);
}

/** Class Results…: a results file picked from the computer, opened. */
export async function classResultsDialog(ex) {
  const input = h('input', { type: 'file', accept: '.json,application/json', 'data-field': 'file' });
  const body = h('div', { class: 'ex-template' },
    h('p', {}, 'The class\'s results of a teacher\'s run: the JSON that silinx grade --json or silinx classroom grade --json writes.'),
    h('label', { class: 'ex-field' }, h('span', {}, 'Results file'), input));
  const ok = await dialog({ title: 'Class Results', body, width: 480, buttons: [{ label: 'Open', value: true, primary: true }, { label: 'Cancel', value: null }] });
  const f = input.files?.[0];
  if (!ok || !f) return null;
  return openResults(f.name, await f.text(), ex);
}

function mountResults(el, file, results, ex) {
  const s = classSummary(results, ex);
  const root = h('div', { class: 'ex ex-results' });
  const line = statusLine();
  const csvBtn = h('button', { type: 'button', class: 'asm-btn asm-wide', 'data-cmd': 'export-csv', title: 'Save the results as a CSV, one row per student', onclick: () => exportCsv() }, 'Export CSV');
  const verdict = (v, pts) => h('td', { class: `ex-verdict ${v || ''}`, title: v ? VERDICTS[v] : 'not run' }, v ? `${v}${pts === undefined ? '' : ` ${pts}`}` : '–');
  const page = h('div', { class: 'ex-page' },
    h('h3', {}, 'Tests, the weakest first'),
    h('table', { class: 'ex-table ex-class-tests' },
      h('tr', {}, h('th', {}, 'Test'), h('th', {}, 'Shown'), h('th', {}, 'Points'), h('th', {}, 'Accepted'), h('th', {}, 'Most often')),
      ...s.weakest.map(t => h('tr', { 'data-test': t.id },
        h('td', { 'data-no-i18n': '' }, t.title), h('td', { class: t.visible ? '' : 'ex-hidden' }, t.visible ? 'visible' : 'hidden'), h('td', { class: 'num' }, String(t.max)),
        h('td', { class: 'num' }, `${t.accepted} / ${t.graded} (${pc(t.rate)})`),
        t.other ? h('td', { class: `ex-verdict ${t.other}`, title: VERDICTS[t.other] || 'not run' }, `${t.other} (${t.counts[t.other]})`) : h('td', {}, '')))),
    h('h3', {}, 'Students'),
    h('table', { class: 'ex-table ex-class-students' },
      h('tr', {}, h('th', {}, 'Student'), h('th', {}, 'Points'), h('th', {}, 'Verdict'), ...s.tests.map(t => h('th', { 'data-no-i18n': '', title: t.title }, t.id))),
      ...s.students.map(x => h('tr', { class: 'ex-test', 'data-student': x.submission, onclick: () => report(x.submission) },
        h('td', { 'data-no-i18n': '' }, x.submission), h('td', { class: 'num' }, `${x.points} / ${x.max}`), verdict(x.verdict),
        ...s.tests.map(t => (x.tests[t.id] ? verdict(x.tests[t.id].verdict, x.tests[t.id].points) : h('td', {}, '')))))));
  root.append(h('div', { class: 'asm-toolbar ex-bar' }, h('div', { class: 'asm-group' }, csvBtn), h('div', { class: 'asm-spacer' })), h('div', { class: 'ex-main' }, page), line.el);
  el.append(root);
  line.set([`${s.count} student(s)`, `${s.accepted} Accepted`, `mean ${s.mean} / ${s.max} points`]);
  // (a student's report, as silinx grade prints it: the console's)
  function report(name) {
    const r = results.find(x => x.submission === name);
    root.querySelectorAll('.ex-class-students tr.current').forEach(t => t.classList.remove('current'));
    root.querySelector(`.ex-class-students tr[data-student="${CSS.escape(name)}"]`)?.classList.add('current');
    for (const l of textReport(r).trimEnd().split('\n')) log(l, /^\s*(-|WARNING|Compile|Interface)/.test(l) ? 'warn' : '', { diag: false });
  }
  function exportCsv() {
    const name = `${file.split('/').pop().replace(/\.json$/i, '')}.csv`;
    downloadText(name, classCsv(results, s), 'text/csv');
    log(`${name}: the results of ${s.count} student(s), one row per student.`, 'ok', { diag: false });
  }
  root.dataset.ready = '1';
  return { destroy: () => {} };
}
