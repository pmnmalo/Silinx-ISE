// The MCP server's tool of automatic grading (#3192, server/mcp.js, #2674), as `silinx grade` and the interface's
// Exercise document: an exercise (a *.exercise.json of a project) run on the project itself (a student's run, the
// visible tests) or on submissions of the exchange folder (a teacher's: folders, zips or a folder of them, the
// results as a CSV there), its problems checked, its ports taken from the project's top (as the document's "Ports
// from the Top"), and the student's copy written (no hidden test, no reference). The grading is server/grade.js's: each
// submission in a process of its own, within the exercise's limits.
import fsp from 'node:fs/promises';
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT, projectText, projectPath, elaborateView } from './mcp-util.js';
import { exchangePath } from './mcp-transfer.js';
import { isExerciseFile, exerciseProblems, visibleCopy, localize } from '../core/grade-format.js';
import { textReport, csvReport } from '../core/grade-report.js';

const ACTIONS = ['run', 'check', 'ports', 'student_copy'];

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
    description: 'Automatic grading, as `silinx grade` and the Exercise document (Project ▸ Exercise…): run (the exercise\'s tests on the project itself, or on submissions of the exchange folder: project folders, zips, or a folder of them; each test\'s verdict, Accepted, Wrong Answer, Compile Error, Interface Error, Not Synthesizable, Latch Inferred, Time Limit Exceeded, Memory Limit Exceeded, Runtime Error, Resource / Timing Limit or Grading Error (the grader could not run it), and its points; visible: the visible tests only, as a student runs them; csv: the results written to a new file of the exchange folder), check (the exercise\'s problems), ports (the project\'s top and its ports written into the exercise, as "Ports from the Top"), student_copy (the exercise without its hidden tests and its reference, written to a new file of the exchange folder).',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, action: { type: 'string', enum: ACTIONS, description: 'run (default), check, ports or student_copy.' },
      exercise: STR('The exercise: a .exercise.json of the project (default: its only one).'),
      submissions: { type: 'array', items: { type: 'string' }, description: 'run: submissions in the exchange folder (project folders, zips, or folders of them); none: the project itself.' },
      visible: { type: 'boolean', description: 'run: the visible tests only (a student\'s run).' },
      csv: STR('run: a new file of the exchange folder for the results as a CSV.'),
      file: STR('student_copy: the new file of the exchange folder it is written to.'),
      language: { type: 'string', enum: ['en', 'pt'], description: 'The texts\' language (default en).' },
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },   // (ports: the exercise's top and ports replaced)
    async run({ project: name, action = 'run', exercise, submissions, visible = false, csv, file, language: lang = 'en' }) {
      await readProject(name);
      if (!ACTIONS.includes(action)) throw toolError(`action: one of ${ACTIONS.join(', ')}`);
      const rel = await exerciseFile(name, exercise);
      const full = await projectPath(name, rel);
      const { loadExercise, gradeAll, gradeSubmission, readSubmission, referenceVectorsOf } = await import('./grade.js');
      if (action === 'ports') {
        let ex;
        try { ex = JSON.parse(await projectText(name, rel, `the project '${name}' has no file ${rel}`)); } catch (e) { throw e.toolError ? e : toolError(`${rel}: not JSON (${e.message})`); }
        const { top, ports } = await topPorts(name);
        await P.writeFile(name, rel, `${JSON.stringify({ ...ex, top, ports }, null, 2)}\n`);
        return { text: `${rel}: the top ${top}, ${ports.map(p => `${p.name} (${p.dir}, ${p.width})`).join(', ')}`, data: { project: name, exercise: rel, top, ports } };
      }
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
