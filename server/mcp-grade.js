// The MCP server's tool of automatic grading (#3192, server/mcp.js, #2674), as `silinx grade` and the interface's
// Exercise document: an exercise (a *.exercise.json of a project) run on the project itself (a student's run, the
// visible tests) or on submissions of the exchange folder (a teacher's: folders, zips or a folder of them, the
// results as a CSV there), its problems checked, its ports taken from the project's top (as the document's "Ports
// from the Top"), its reference made of the project's design and a vectors test's outputs filled from it (Reference
// from the Project, Expected from the Reference, #3831), the student's copy written (no hidden test, no reference),
// and the GitHub Classroom template written to a new folder of the exchange folder (#3841, as Classroom Template…).
// The grading is server/grade.js's: each submission in a process of its own, within the exercise's limits.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT, projectText, projectPath, elaborateView } from './mcp-util.js';
import { exchangePath } from './mcp-transfer.js';
import { isExerciseFile, exerciseProblems, visibleCopy, localize, newExercise, exerciseFileOf, withFileTexts } from '../core/grade-format.js';
import { projectReference } from '../core/grade-author.js';
import { starterProject, templateFiles, STARTER_LANGUAGES } from '../core/grade-package.js';
import { textReport, csvReport } from '../core/grade-report.js';

const ACTIONS = ['run', 'check', 'ports', 'reference', 'expected', 'student_copy', 'template', 'new'];

// the exercise of the project the tool names: its file (by default the project's only *.exercise.json)
async function exerciseFile(name, given) {
  if (given) {
    if (!isExerciseFile(given)) throw toolError(`exercise: '${given}' is not a .exercise.json`);
    return given;
  }
  const all = (await P.fileTree(name)).filter(isExerciseFile);
  if (all.length !== 1) throw toolError(all.length ? `exercise: the project '${name}' has ${all.length} exercises (${all.join(', ')}): give one` : `the project '${name}' has no exercise (a .exercise.json)`);
  return all[0];
}

// the exercise's JSON as it is written (its files beside it not read)
async function rawExercise(name, rel) {
  try { return JSON.parse(await projectText(name, rel, `the project '${name}' has no file ${rel}`)); } catch (e) { throw e.toolError ? e : toolError(`${rel}: not JSON (${e.message})`); }
}
const dirOf = rel => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '');
const writeJson = (name, rel, ex) => P.writeFile(name, rel, `${JSON.stringify(ex, null, 2)}\n`);

// Expected from the Reference (#3831): the vectors test `id` (by default the exercise's only one) filled from the
// reference in a grading process, written where its text is (its file beside the exercise, or the exercise)
async function fillExpected(name, rel, id) {
  const raw = await rawExercise(name, rel);
  const vectors = (Array.isArray(raw.tests) ? raw.tests : []).filter(t => t?.kind === 'vectors');
  const test = id ? vectors.find(t => t.id === id) : vectors.length === 1 ? vectors[0] : null;
  if (!test) throw toolError(id ? `test: '${id}' is not a vectors test of ${rel} (${vectors.map(t => t.id).join(', ') || 'none'})` : `test: ${rel} has ${vectors.length} vectors tests${vectors.length ? ` (${vectors.map(t => t.id).join(', ')})` : ''}: give one`);
  const dir = dirOf(rel);
  const read = await withFileTexts(raw, p => projectText(name, p, `no file ${p}`), dir);
  if (read.problems.length) throw toolError(read.problems.map(m => `${rel}: ${m}`).join('\n'));
  const { expectedOf } = await import('./grade.js');
  const r = await expectedOf(read.exercise, read.exercise.tests[raw.tests.indexOf(test)]);
  if (r.problems.length) throw toolError(r.problems.map(m => `test ${test.id}: ${m}`).join('\n'));
  let where = rel;
  if (typeof test.vectors !== 'string' && typeof test.file === 'string') { where = dir ? `${dir}/${test.file}` : test.file; await P.writeFile(name, where, r.text); } else { test.vectors = r.text; await writeJson(name, rel, raw); }
  return { text: `${where}: test ${test.id}, the expected outputs of its ${r.rows} row(s) from the reference\n${r.text}`, data: { project: name, exercise: rel, test: test.id, file: where, rows: r.rows, vectors: r.text } };
}

// Classroom Template… (#3841): the template repository, its starter project made from the statement in the project's
// language, board and device, written to a new (or empty) folder of the exchange folder
async function writeTemplate(name, rel, ex, folder, lang) {
  if (!folder) throw toolError('folder: the new folder of the exchange folder for the template');
  const pj = await P.readProject(name);
  const language = lang || (pj.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl');
  if (!STARTER_LANGUAGES.includes(language)) throw toolError(`starter_language: ${STARTER_LANGUAGES.join(' or ')}`);
  const dir = await exchangePath(folder, 'folder');
  if (fs.existsSync(dir) && (!fs.statSync(dir).isDirectory() || fs.readdirSync(dir).length)) throw toolError(`'${folder}' is not a new folder: give another`);
  const raw = await rawExercise(name, rel);
  const at = dirOf(rel);
  const besides = new Map();
  for (const t of raw.tests || []) for (const f of [t?.file, ...(Array.isArray(t?.files) ? t.files.map(x => x?.file) : [])]) if (t?.visible && typeof f === 'string') besides.set(f, await projectText(name, at ? `${at}/${f}` : f, `no file ${f} beside ${rel}`));
  const files = templateFiles(ex, raw, { starter: starterProject(ex, { lang: language, board: pj.board, device: pj.device }), beside: f => besides.get(f) });
  for (const [p, text] of files) { const f = path.join(dir, p); await fsp.mkdir(path.dirname(f), { recursive: true }); await fsp.writeFile(f, text); }
  return { text: `${dir}: the template of ${ex.id}.exercise.json (${files.size} files: the starter project in ${language === 'vhdl' ? 'VHDL' : 'Verilog'}, the visible tests, README.md, the workflow)`,
    data: { project: name, exercise: rel, folder: dir, files: [...files.keys()] } };
}

/** The ports of the project's top as an exercise states them: [{ name, dir, width }] (the reference's top). */
export async function topPorts(name) {
  const v = await elaborateView(name, {});
  const errs = v.diags.filter(d => d.severity === 'error');
  if (errs.length || !v.design?.top) throw toolError(`the top ${v.top} does not compile: ${errs[0] ? `"${errs[0].file}" Line ${errs[0].line}: ${errs[0].message}` : 'no such module'}`);
  return { top: v.top, ports: v.design.top.ports.map(p => ({ name: p.name, dir: p.dir, width: p.sig?.t?.w ?? p.t?.w ?? 1 })) };
}

// a new file of the exchange folder (a CSV, a student's copy): never one that exists
async function writeNew(p, text, what) {
  const file = await exchangePath(p, what);
  try { await fsp.writeFile(file, text, { flag: 'wx' }); } catch (e) { throw toolError(e.code === 'EEXIST' ? `'${p}' exists: give another file` : e.message); }
  return file;
}

export const GRADE_TOOLS = [
  {
    name: 'grade', title: 'Grade an exercise',
    description: 'Automatic grading, as `silinx grade` and the Exercise document (Project ▸ Exercise…): run (the exercise\'s tests on the project itself, or on submissions of the exchange folder: project folders, zips, or a folder of them; each test\'s verdict, Accepted, Wrong Answer, Compile Error, Interface Error, Not Synthesizable, Latch Inferred, Time Limit Exceeded, Memory Limit Exceeded, Runtime Error, Resource / Timing Limit or Grading Error (the grader could not run it), and its points; visible: the visible tests only, as a student runs them; csv: the results written to a new file of the exchange folder), check (the exercise\'s problems), ports (the project\'s top and its ports written into the exercise, as "Ports from the Top"), reference (the exercise\'s reference design made of the project\'s design, as "Reference from the Project"), expected (a vectors test\'s rows filled with the reference\'s outputs, as "Expected from the Reference": the teacher writes the inputs only), student_copy (the exercise without its hidden tests and its reference, written to a new file of the exchange folder), template (the GitHub Classroom assignment\'s template repository, as Classroom Template… and `silinx classroom template`: the starter project made from the statement, the student\'s copy with its visible tests\' files, README.md, the workflow; written to a new folder of the exchange folder), new (a new exercise of the project\'s top, as New Exercise: its ports and a first visible test, <top>.exercise.json).',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, action: { type: 'string', enum: ACTIONS, description: 'run (default), check, ports, reference, expected, student_copy, template or new.' },
      exercise: STR('The exercise: a .exercise.json of the project (default: its only one).'),
      submissions: { type: 'array', items: { type: 'string' }, description: 'run: submissions in the exchange folder (project folders, zips, or folders of them); none: the project itself.' },
      visible: { type: 'boolean', description: 'run: the visible tests only (a student\'s run).' },
      csv: STR('run: a new file of the exchange folder for the results as a CSV.'),
      file: STR('student_copy: the new file of the exchange folder it is written to.'),
      folder: STR('template: the new folder of the exchange folder it is written to.'),
      starter_language: { type: 'string', enum: STARTER_LANGUAGES, description: 'template: the starter project\'s language (default: the project\'s).' },
      test: STR('expected: the vectors test to fill (its id; default: the exercise\'s only vectors test).'),
      language: { type: 'string', enum: ['en', 'pt'], description: 'The texts\' language (default en).' },
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },   // (ports: the exercise's top and ports replaced)
    async run({ project: name, action = 'run', exercise, submissions, visible = false, csv, file, test, folder, starter_language: starterLanguage, language: lang = 'en' }) {
      await readProject(name);
      if (!ACTIONS.includes(action)) throw toolError(`action: one of ${ACTIONS.join(', ')}`);
      if (action === 'new') {
        const tp = await topPorts(name);
        const out = exerciseFileOf(tp.top, await P.fileTree(name));
        await P.writeFile(name, out, `${JSON.stringify(newExercise(tp), null, 2)}\n`);
        return { text: `${out}: a new exercise of ${tp.top}, its ports from the top and a first visible test.`, data: { project: name, exercise: out, top: tp.top, ports: tp.ports } };
      }
      const rel = await exerciseFile(name, exercise);
      const full = await projectPath(name, rel);
      const { loadExercise, gradeAll, gradeSubmission, readSubmission, referenceVectorsOf } = await import('./grade.js');
      if (action === 'ports') {
        const ex = await rawExercise(name, rel);
        const { top, ports } = await topPorts(name);
        await writeJson(name, rel, { ...ex, top, ports });
        return { text: `${rel}: the top ${top}, ${ports.map(p => `${p.name} (${p.dir}, ${p.width})`).join(', ')}`, data: { project: name, exercise: rel, top, ports } };
      }
      if (action === 'reference') {
        const ex = await rawExercise(name, rel);
        const sub = await readSubmission(P.projectDir(name));
        if (sub.error) throw toolError(sub.error);
        const { reference, problems } = projectReference(sub, dirOf(rel));
        if (problems.length) throw toolError(`no reference made: ${problems.join('\n')}`);
        await writeJson(name, rel, { ...ex, reference });
        return { text: `${rel}: the reference, the project's design: ${reference.files.map(f => f.path).join(', ')}`, data: { project: name, exercise: rel, reference: reference.files.map(f => ({ path: f.path, inline: typeof f.text === 'string' })) } };
      }
      if (action === 'expected') return fillExpected(name, rel, test);
      const { exercise: ex, problems } = loadExercise(full);
      if (action === 'check') {
        let raw = null;
        try { raw = JSON.parse(await fsp.readFile(full, 'utf8')); } catch { /* the problems say it */ }
        const all = problems.length ? problems : exerciseProblems(raw, rel);
        return { text: all.length ? all.join('\n') : `${rel}: no problem (${ex.tests.length} test(s), ${ex.tests.filter(t => t.visible).length} visible)`, data: { project: name, exercise: rel, problems: all } };
      }
      if (!ex) throw toolError(problems.join('\n'));
      if (action === 'student_copy') {
        if (!file) throw toolError('file: the new file of the exchange folder for the student\'s copy');
        const copy = visibleCopy(ex);
        const out = await writeNew(file, `${JSON.stringify(copy, null, 2)}\n`, 'file');
        return { text: `${out}: ${ex.id} with its ${copy.tests.length} visible test(s), no hidden test and no reference`, data: { project: name, file: out, tests: copy.tests.map(t => t.id) } };
      }
      if (action === 'template') return writeTemplate(name, rel, ex, folder, starterLanguage);
      let results;
      if (submissions?.length) {
        const paths = await Promise.all(submissions.map(s => exchangePath(s, 'submissions')));
        const r = await gradeAll(full, paths, { visible });
        if (r.problems.length) throw toolError(r.problems.join('\n'));
        results = r.results;
      } else {
        const sub = await readSubmission(P.projectDir(name));
        const run = { ...ex, tests: ex.tests.filter(t => !visible || t.visible) };
        const vectors = await referenceVectorsOf(run);
        const bad = Object.entries(vectors).flatMap(([id, v]) => (v.problems || []).map(m => `test ${id}: ${m}`));
        if (bad.length) throw toolError(bad.join('\n'));
        const { exerciseUnitNames } = await import('../core/grade-design.js');
        results = [await gradeSubmission(ex, { ...sub, name }, { visible, vectors, exerciseUnits: [...exerciseUnitNames(ex)] })];
      }
      const out = csv ? await writeNew(csv, csvReport(results, ex), 'csv') : null;
      const text = [`${localize(ex.title, lang)}${visible ? ' (the visible tests)' : ''}`, ...results.map(textReport), ...(out ? [`CSV: ${out}`] : [])].join('\n');
      return { text, data: { project: name, exercise: rel, visible, results, ...(out && { csv: out }) } };
    },
  },
];
