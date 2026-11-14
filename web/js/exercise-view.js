// A graded exercise (#3192, core/grade-format.js) as a document: a project's *.exercise.json opened from the Files or
// by Project ▸ Exercise… (which makes one when the project has none: its top and ports, a first visible test). As every
// viewer (docs/UI-GUIDELINES.md): its toolbar (Add Test, Delete Test, Run Visible Tests, ☰ Properties on a narrow
// screen, the ⋮ menu's Run All Tests, Ports from the Top, Reference from the Project and Expected from the Reference,
// #3831: a teacher's exercise made from the project that holds the right design; Export Student Copy and Classroom
// Template…, #3841: web/js/exercise-package.js), the statement in the interface's language, the ports, the
// tests with their verdicts and points once run, the Properties side panel on the right (the exercise's title,
// statement and top, the selected test's settings: web/js/exercise-props.js), its status line, and every message in the
// console. The tests run on the project as it is saved, in the page (core/grade.js, the grading of `silinx grade` and of
// the MCP server's `grade` tool, its step limit; the synthesis tests in the flow's worker, web/js/grade-synth-browser.js,
// #3216); the student's copy of an exercise has its visible tests only, the teacher's all.
import { h, dialog } from './ui.js';
import { api } from './api.js';
import { S, findDoc, openDoc, setDirty } from './app.js';
import { log } from './console.js';
import { saveAll } from './processes.js';
import { getLanguage, onLanguageChange } from './i18n.js';
import { mountSideFold } from './side-fold.js';
import { panelToggle } from './narrow.js';
import { statusLine } from './status-line.js';
import { toolbarMenu } from './toolbar-menu.js';
import { mountExerciseProps } from './exercise-props.js';
import { exportStudentCopy, classroomTemplateDialog } from './exercise-package.js';
import { browserSynthesize } from './grade-synth-browser.js';
import { isExerciseFile, exerciseProblems, localize, testsOf, pointsOf, withFileTexts, newExercise, exerciseFileOf, VERDICTS } from '/core/grade-format.js';
import { gradeTests, summarize, referenceVectors } from '/core/grade.js';
import { exerciseUnitNames, submissionSources } from '/core/grade-design.js';
import { projectReference, expectedFromReference } from '/core/grade-author.js';
import { textReport } from '/core/grade-report.js';
import { compile, elaborate } from '/core/compile.js';
import { primitiveSources } from '/core/unisim.js';

export const PROPS_KEY = 'silinx.narrow.exprops';   // (the Properties panel shown on a narrow screen)
const lang = () => (getLanguage() === 'pt' ? 'pt' : 'en');
const TEXT = p => !/\.(bit|bin|ncd|ngc|ngd|zip|png|jpe?g|gif|pdf)$/i.test(p) && !/^build\//.test(p) && !isExerciseFile(p);

/** The project `name` as a submission (core/grade-design.js): its silinx.json and its files' texts, as they are saved. */
async function projectSubmission(name) {
  const pj = await api.project(name);
  const files = new Map();
  for (const p of (pj.fileTree || []).filter(TEXT)) { try { files.set(p, await api.readFile(name, p)); } catch { /* not readable */ } }
  return { project: pj, files };
}

/** The project's top and its ports, as an exercise states them ({ top, ports }), or the reason it has none. */
async function topPorts(name) {
  const sub = await projectSubmission(name);
  const top = sub.project.top;
  if (!top) return { error: 'the project has no top module' };
  const { sources } = submissionSources(sub);
  const lib = compile([...primitiveSources(sources), ...sources]);
  const d = elaborate(lib, top);
  const errs = [...lib.errors, ...d.diags].filter(x => x.severity === 'error');
  if (errs.length || !d.top) return { error: `the top ${top} does not compile${errs[0] ? `: "${errs[0].file}" Line ${errs[0].line}: ${errs[0].message}` : ''}` };
  return { top, ports: d.top.ports.map(p => ({ name: p.name, dir: p.dir, width: p.sig?.t?.w ?? p.t?.w ?? 1 })) };
}

/** Project ▸ Exercise…: the project's exercise opened (one of them, picked from a list), or a new one made. */
export async function exerciseDialog() {
  if (!S.project) return;
  const name = S.project.name;
  const all = ((await api.project(name)).fileTree || []).filter(isExerciseFile).sort();
  if (all.length === 1) { await openExercise(all[0]); return; }
  let close;
  const rows = all.map(p => h('button', { type: 'button', class: 'ex-pick', 'data-file': p, 'data-no-i18n': '', onclick: () => close(p) }, p));
  const body = h('div', { class: 'ex-list' }, ...(rows.length ? rows : [h('p', {}, 'This project has no exercise. A new one is made from its top module.')]));
  const picked = await dialog({ title: 'Exercise', body, width: 460, onOpen: d => { close = d.close; },
    buttons: [{ label: 'New Exercise', value: 'new', primary: !rows.length }, { label: 'Cancel', value: null }] });
  if (picked === 'new') await createExercise(name);
  else if (picked) await openExercise(picked);
}

async function createExercise(name) {
  const tp = await topPorts(name);
  if (tp.error) { log(`ERROR: no exercise made: ${tp.error}.`, 'err'); return; }
  const file = exerciseFileOf(tp.top, (await api.project(name)).fileTree || []);
  await api.writeFile(name, file, `${JSON.stringify(newExercise(tp), null, 2)}\n`);
  log(`${file}: a new exercise of ${tp.top}, its ports from the top and a first visible test.`, 'ok', { diag: false });
  await openExercise(file);
}

/** Opens the exercise `path` of the project in front. */
export async function openExercise(path) {
  const id = `exercise:${path}`;
  if (findDoc(id)) return openDoc({ id });
  let text;
  try { text = await api.readFile(S.project.name, path); } catch (e) { log(`ERROR: ${path} cannot be read: ${e.message}`, 'err'); return null; }
  let ex;
  try { ex = JSON.parse(text); } catch (e) { log(`ERROR: ${path} is not JSON (${e.message}): open it as a text file.`, 'err'); return null; }
  return openDoc({ id, path, title: path.split('/').pop(), tooltip: path, icon: 'file', create: (el, doc) => mountExercise(el, doc, path, ex) });
}

const num = n => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''));

/** The exercise document in `el`: its toolbar, its page, its Properties panel, its status line. */
function mountExercise(el, doc, path, ex) {
  const name = S.project.name;
  let sel = 0, results = null, busy = false;
  const root = h('div', { class: 'ex' });
  const btn = (label, title, cmd, onclick) => h('button', { type: 'button', class: 'asm-btn asm-wide', 'data-cmd': cmd, title, onclick }, label);
  const addBtn = btn('Add Test', 'Add a visible vectors test', 'add-test', () => addTest());
  const delBtn = btn('Delete Test', 'Delete the selected test', 'delete-test', () => deleteTest());
  const runBtn = btn('Run Visible Tests', 'Run the visible tests on the project', 'run-visible', () => run(true));
  const line = statusLine();
  root.append(h('div', { class: 'asm-toolbar ex-bar' },
    h('div', { class: 'asm-group' }, addBtn, delBtn),
    h('div', { class: 'asm-group' }, runBtn),
    h('div', { class: 'asm-spacer' }),
    h('div', { class: 'asm-group' }, panelToggle(root, h('button', { type: 'button', class: 'asm-btn asm-wide', 'data-panel': 'props', title: 'Show / hide the Properties panel' }, '☰ Properties'), { key: PROPS_KEY })),
    toolbarMenu([btn('Run All Tests', 'Run every test of the exercise, the hidden ones too', 'run-all', () => run(false)),
      btn('Ports from the Top', 'The exercise\'s top and ports: the project\'s top module\'s', 'ports-from-top', () => portsFromTop()),
      btn('Reference from the Project', 'The exercise\'s reference design: the project\'s design', 'reference-from-project', () => referenceFromProject()),
      btn('Expected from the Reference', 'The selected vectors test\'s outputs: the reference design\'s, on its rows\' inputs', 'expected-from-reference', () => expectedOutputs()),
      btn('Export Student Copy', 'Save the exercise without its hidden tests and its reference, for the students', 'student-copy', () => exportStudentCopy(pack)),
      btn('Classroom Template…', 'Save a GitHub Classroom assignment\'s template repository as a zip', 'classroom-template', () => classroomTemplateDialog(pack))], { title: 'The exercise', btnClass: 'asm-btn' }).el));
  const pack = { name, path, exercise: () => ex };
  const page = h('div', { class: 'ex-page' });
  const side = h('aside', { class: 'ex-side' }, h('div', { class: 'asm-cap' }, 'Properties'));
  root.append(h('div', { class: 'ex-main' }, page, side), line.el);
  el.append(root);
  mountSideFold({ root, side, key: 'silinx.exercise.props.folded' });
  const props = mountExerciseProps(side, { exercise: () => ex, selected: () => ex.tests?.[sel] || null, changed: () => edited() });

  function edited() { results = null; setDirty(doc, true, { user: true }); render(); }
  function render() {
    const L = lang(), tests = Array.isArray(ex.tests) ? ex.tests : [];
    const res = id => results?.tests.find(r => r.id === id);
    const ports = Array.isArray(ex.ports) ? ex.ports : [];
    page.replaceChildren(
      h('h2', { class: 'ex-title', 'data-no-i18n': '' }, localize(ex.title, L) || ex.id || ''),
      h('p', { class: 'ex-statement', 'data-no-i18n': '' }, localize(ex.statement, L)),
      h('h3', {}, 'Ports'),
      h('table', { class: 'ex-table ex-ports' }, h('tr', {}, h('th', {}, 'Port'), h('th', {}, 'Direction'), h('th', {}, 'Width')),
        ...ports.map(p => h('tr', {}, h('td', { 'data-no-i18n': '' }, p.name), h('td', {}, p.dir), h('td', { class: 'num' }, String(p.width))))),
      h('h3', {}, 'Tests'),
      h('table', { class: 'ex-table ex-tests' },
        h('tr', {}, h('th', {}, 'Test'), h('th', {}, 'Kind'), h('th', {}, 'Shown'), h('th', {}, 'Points'), h('th', {}, 'Verdict')),
        ...tests.map((x, k) => {
          const r = res(x.id);
          return h('tr', { class: `ex-test${k === sel ? ' current' : ''}`, 'data-test': x.id, onclick: () => { sel = k; render(); props.render(); } },
            h('td', { 'data-no-i18n': '' }, localize(x.title, L) || x.id), h('td', {}, x.kind || ''), h('td', { class: x.visible ? '' : 'ex-hidden' }, x.visible ? 'visible' : 'hidden'),
            h('td', { class: 'num' }, r ? `${num(r.points)} / ${num(r.max)}` : num(pointsOf(x))),
            h('td', { class: `ex-verdict ${r?.verdict || ''}`, title: r?.verdict ? VERDICTS[r.verdict] : '' }, r ? r.verdict || '–' : ''));
        })));
    delBtn.disabled = !tests.length; runBtn.disabled = busy; addBtn.disabled = busy;
    const visible = tests.filter(x => x.visible).length, points = tests.reduce((s, x) => s + pointsOf(x), 0);
    line.set([`${tests.length} test(s), ${visible} visible`, results ? `${num(results.points)} / ${num(results.max)} points` : `${num(points)} points`]);
  }
  function addTest() {
    ex.tests = Array.isArray(ex.tests) ? ex.tests : [];
    const ids = new Set(ex.tests.map(x => String(x.id).toLowerCase()));
    let k = ex.tests.length + 1;
    while (ids.has(`test${k}`)) k++;
    const ports = Array.isArray(ex.ports) ? ex.ports : [];
    const clock = ex.tests.find(x => x.clock)?.clock;
    ex.tests.push({ id: `test${k}`, visible: true, points: 10, kind: 'vectors', ...(clock && { clock }),
      vectors: `${ports.filter(p => p.dir === 'in' && p.name !== clock).map(p => p.name).join(' ')} | ${ports.filter(p => p.dir !== 'in').map(p => p.name).join(' ')}\n` });
    sel = ex.tests.length - 1;
    props.render();
    edited();
  }
  function deleteTest() {
    if (!ex.tests?.length) return;
    ex.tests.splice(sel, 1);
    sel = Math.max(0, Math.min(sel, ex.tests.length - 1));
    props.render();
    edited();
  }
  async function portsFromTop() {
    const tp = await topPorts(name);
    if (tp.error) { log(`ERROR: the ports are not taken from the top: ${tp.error}.`, 'err'); return; }
    Object.assign(ex, { top: tp.top, ports: tp.ports });
    log(`${path}: the top ${tp.top}, ${tp.ports.map(p => `${p.name} (${p.dir}, ${p.width})`).join(', ')}`, 'ok', { diag: false });
    props.render();
    edited();
  }
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  // Reference from the Project (#3831): the exercise's reference, the project's design as it is saved (its files by their
  // paths, read when the tests run; a drawing's HDL written in)
  async function referenceFromProject() {
    await saveAll();
    const { reference, problems } = projectReference(await projectSubmission(name), dir);
    if (problems.length) { for (const m of problems) log(`ERROR: no reference made: ${m}`, 'err'); return; }
    ex.reference = reference;
    log(`${path}: the reference, the project's design: ${reference.files.map(f => f.path).join(', ')}`, 'ok', { diag: false });
    edited();
  }
  // Expected from the Reference (#3831): the selected vectors test's rows filled with the reference's outputs, where its
  // text is (the exercise, or its file beside it)
  async function expectedOutputs() {
    const x = ex.tests?.[sel];
    if (x?.kind !== 'vectors') { log('ERROR: Expected from the Reference fills a vectors test: select one.', 'err'); return; }
    await saveAll();
    const read = await withFileTexts(ex, p => api.readFile(name, p), dir);
    const r = read.problems.length ? { problems: read.problems.map(m => `${path}: ${m}`) } : expectedFromReference(read.exercise, read.exercise.tests[sel]);
    if (r.problems.length) { for (const m of r.problems) log(`ERROR: test ${x.id}: ${m}`, 'err'); return; }
    const file = typeof x.vectors !== 'string' && typeof x.file === 'string' ? (dir ? `${dir}/${x.file}` : x.file) : null;
    if (file) await api.writeFile(name, file, r.text);
    else x.vectors = r.text;
    log(`${file || path}: test ${x.id}, the expected outputs of its ${r.rows} row(s) from the reference.`, 'ok', { diag: false });
    if (!file) { props.render(); edited(); } else { results = null; render(); }
  }
  // (the equivalence tests' Yosys, as Verify Equivalence's: the page's worker, #3217)
  const yosys = async (...a) => (await (await import('./emulator.js')).emulatorYosys(api.standalone))(...a);
  async function run(visible) {
    if (busy) return;
    busy = true; render();
    try {
      await saveAll();   // (as Check Syntax: the documents saved first, the exercise too)
      log(`\nStarted : "${visible ? 'Run Visible Tests' : 'Run All Tests'}" (${path}).\n`, 'hdr');
      // (its files beside it, as silinx grade reads them: from the project, the exercise's folder)
      const read = await withFileTexts(ex, p => api.readFile(name, p), dir);
      const problems = [...read.problems.map(m => `${path}: ${m}`), ...exerciseProblems(read.exercise, path)];
      if (problems.length) { for (const m of problems) log(`ERROR: ${m}`, 'err'); log('Process "Run Tests" failed: the exercise has problems.', 'err', { diag: false }); return; }
      const full = read.exercise;
      const run = testsOf(full, { visible });
      const vectors = {};
      for (const x of run.filter(y => y.kind === 'reference')) {
        const v = referenceVectors(full, x);
        if (v.problems.length) { for (const m of v.problems) log(`ERROR: test ${x.id}: ${m}`, 'err'); log('Process "Run Tests" failed: the exercise has problems.', 'err', { diag: false }); return; }
        vectors[x.id] = v;
      }
      const sub = await projectSubmission(name);
      const r = summarize(full, name, await gradeTests(full, sub, { visible, vectors, exerciseUnits: exerciseUnitNames(full), synthesize: browserSynthesize(full, { name, file: path }), yosys }), { visible });
      results = r;
      for (const l of textReport(r).trimEnd().split('\n')) log(l, /^\s*(-|WARNING|Compile|Interface)/.test(l) ? 'warn' : '', { diag: /WARNING/.test(l) });
      log(`Process "${visible ? 'Run Visible Tests' : 'Run All Tests'}" completed: ${num(r.points)} / ${num(r.max)} points.`, r.verdict === 'AC' ? 'ok' : 'warn', { diag: false });
    } catch (e) { log(`ERROR: ${e.message}`, 'err'); }
    finally { busy = false; render(); }
  }
  const off = onLanguageChange(() => { render(); props.render(); });
  render();
  props.render();
  for (const m of exerciseProblems(ex, path)) log(`WARNING: ${m}`, 'warn');
  root.dataset.ready = '1';
  return {
    exercise: () => ex, run,
    save: async () => { await api.writeFile(name, path, `${JSON.stringify(ex, null, 2)}\n`); setDirty(doc, false); },
    destroy: () => off(),
  };
}
