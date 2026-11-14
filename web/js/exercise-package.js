// An exercise packaged for its students from its document (#3841, web/js/exercise-view.js's ⋮ menu): Export Student
// Copy (the exercise without its hidden tests and its reference, the visible tests' files written in: the MCP server's
// `grade student_copy`) and Classroom Template… (the GitHub Classroom assignment's template repository as a zip, made in
// the page by core/grade-package.js: its starter project made from the statement in the language chosen, on the
// project's board and device; `grade template`, `silinx classroom template`). Both saved as the browser saves a file;
// their messages in the console.
import { h, dialog, downloadText } from './ui.js';
import { api } from './api.js';
import { log } from './console.js';
import { saveAll } from './processes.js';
import { withFileTexts, exerciseProblems, visibleCopy } from '/core/grade-format.js';
import { starterProject, templateFiles, besideFiles } from '/core/grade-package.js';
import { createZip, browserCodec } from '/core/zip.js';

// the exercise as it is saved, with its files beside it read (or its problems said in the console: null)
async function readExercise(name, path, ex, what) {
  await saveAll();
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const read = await withFileTexts(ex, p => api.readFile(name, p), dir);
  const problems = [...read.problems.map(m => `${path}: ${m}`), ...exerciseProblems(read.exercise, path)];
  if (problems.length) { for (const m of problems) log(`ERROR: ${m}`, 'err'); log(`${what}: the exercise has problems.`, 'err', { diag: false }); return null; }
  return { full: read.exercise, dir };
}

/** Export Student Copy: <id>.exercise.json saved, its visible tests only, their files' texts in it. */
export async function exportStudentCopy({ name, path, exercise }) {
  const r = await readExercise(name, path, exercise(), 'No student\'s copy made');
  if (!r) return;
  const copy = visibleCopy(r.full);
  downloadText(`${r.full.id}.exercise.json`, `${JSON.stringify(copy, null, 2)}\n`, 'application/json');
  log(`${r.full.id}.exercise.json: the student's copy of ${path}, its ${copy.tests.length} visible test(s), no hidden test and no reference.`, 'ok', { diag: false });
}

/** Classroom Template…: the starter's language asked, then <id>-template.zip saved. */
export async function classroomTemplateDialog({ name, path, exercise }) {
  const pj = await api.project(name);
  const select = h('select', { class: 'ex-lang', 'data-prop': 'starter-language' },
    h('option', { value: 'vhdl', selected: pj.preferredLanguage !== 'verilog' }, 'VHDL'), h('option', { value: 'verilog', selected: pj.preferredLanguage === 'verilog' }, 'Verilog'));
  const body = h('div', { class: 'ex-template' },
    h('p', {}, 'The template repository of a GitHub Classroom assignment: the starter project, the student\'s copy of the exercise with its visible tests, a README and the workflow that runs them on each push.'),
    h('label', { class: 'ex-field' }, h('span', {}, 'Starter project\'s language'), select));
  const ok = await dialog({ title: 'Classroom Template', body, width: 480, buttons: [{ label: 'Save Zip', value: true, primary: true }, { label: 'Cancel', value: null }] });
  if (!ok) return;
  const r = await readExercise(name, path, exercise(), 'No template made');
  if (!r) return;
  const raw = exercise();
  const besides = new Map();
  for (const f of besideFiles(visibleCopy(raw))) besides.set(f, await api.readFile(name, r.dir ? `${r.dir}/${f}` : f));
  const files = templateFiles(r.full, raw, { starter: starterProject(r.full, { lang: select.value, board: pj.board, device: pj.device }), beside: f => besides.get(f) });
  const zip = await createZip([...files].map(([p, text]) => ({ path: p, data: text })), browserCodec());
  const file = `${r.full.id}-template.zip`;
  downloadText(file, zip, 'application/zip');
  log(`${file}: the Classroom template of ${path} (${files.size} files: the starter project in ${select.value === 'vhdl' ? 'VHDL' : 'Verilog'}, the visible tests, README.md, the workflow).`, 'ok', { diag: false });
}
