// Automatic grading with GitHub Classroom (#3193, #3191): an assignment's template repository, and the teacher's run of
// every test over the students' repositories.
//   makeTemplate     the template (its workflow's and README's text: core/classroom-template.js): the exercise's starter project, its student's copy (core/grade-format.js visibleCopy:
//                    no hidden test, no reference) with the files its visible tests read, a README for the students and
//                    a workflow (.github/workflows/silinx-grade.yml) that installs a release of Silinx and runs
//                    `silinx grade --visible` on each push: the verdicts in the job's summary, the job the check.
//   gradeClassroom   the teacher's run, with the GitHub CLI (`gh`, the teacher's sign-in): the assignment's repositories
//                    of the organization (<assignment>-<student>), each cloned (its last commit, or its last before the
//                    deadline), graded on the whole exercise (server/grade.js: each in a process of its own) into a CSV,
//                    and optionally an issue in each with that student's report (a hidden test's verdict only).
// The hidden tests never go in a student's repository: they stay in the teacher's exercise, which the teacher's run reads
// on the teacher's machine. A student's repository is only read: cloned with no hooks and no symbolic links, none of its
// workflows run, nothing pushed.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadExercise, gradeAll } from './grade.js';
import { visibleCopy, localize } from '../core/grade-format.js';
import { textReport, csvReport } from '../core/grade-report.js';
import { VERSION } from '../core/version.js';
import { workflowYaml, readmeText, WORKFLOW } from '../core/classroom-template.js';

export { CHECKOUT, SETUP_NODE, WORKFLOW, workflowYaml } from '../core/classroom-template.js';
const NAME_RE = /^[A-Za-z0-9._-]+$/;

const isHidden = rel => rel.split('/').some(s => s.startsWith('.')) || /^build(\/|$)/.test(rel);
function filesOf(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (isHidden(p)) continue;
    if (e.isSymbolicLink()) throw new Error(`${p}: a symbolic link in the starter project`);
    if (e.isDirectory()) out.push(...filesOf(dir, p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

/** The template repository of an exercise in `outDir` (new or empty): the starter project's files, the student's copy
 *  of the exercise (<id>.exercise.json) with the files beside it its visible tests read, README.md, .gitignore and the
 *  workflow. Returns { files, exerciseFile } (the files written, by path). */
export function makeTemplate(exerciseFile, starterDir, outDir, { version = VERSION } = {}) {
  const { exercise: ex, problems } = loadExercise(exerciseFile);
  if (!ex) throw new Error(problems.join('\n'));
  if (!fs.existsSync(path.join(starterDir, 'silinx.json'))) throw new Error(`${starterDir}: no Silinx project (silinx.json) to start from`);
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length) throw new Error(`${outDir} is not empty: give a new folder`);
  const workflow = workflowYaml(`${ex.id}.exercise.json`, { version });
  // (the student's copy as the exercise writes it, its visible tests' files beside it copied, no other)
  const raw = JSON.parse(fs.readFileSync(exerciseFile, 'utf8'));
  const copy = visibleCopy(raw);
  const beside = copy.tests.flatMap(t => [...(typeof t.file === 'string' ? [t.file] : []), ...(t.files || []).filter(f => typeof f?.file === 'string').map(f => f.file)]);
  const name = `${ex.id}.exercise.json`;
  const written = {};
  const put = (rel, text) => { const f = path.join(outDir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); written[rel] = text; };
  for (const rel of filesOf(starterDir)) if (!/\.exercise\.json$/i.test(rel)) put(rel, fs.readFileSync(path.join(starterDir, rel), 'utf8'));
  const exDir = path.dirname(path.resolve(exerciseFile));
  for (const rel of beside) put(rel, fs.readFileSync(path.join(exDir, rel), 'utf8'));
  put(name, `${JSON.stringify(copy, null, 2)}\n`);
  put('README.md', readmeText(ex, name));
  put('.gitignore', 'build/\n');
  put(WORKFLOW, workflow);
  return { files: written, exerciseFile: name };
}

// ---------------------------------------------------------------- the teacher's run
const exec = promisify(execFile);
/** The commands' runner (the GitHub CLI and git): { stdout }; a test gives its own. */
const RUNNER = (cmd, args, opts = {}) => exec(cmd, args, { maxBuffer: 64 << 20, ...opts });

/** The repositories of an assignment: the organization's whose name is <assignment>-<student>, not archived, by name. */
export async function assignmentRepos(org, assignment, { runner = RUNNER } = {}) {
  if (!NAME_RE.test(org) || !NAME_RE.test(assignment)) throw new Error('the organization and the assignment: names of letters, digits, . _ -');
  const { stdout } = await runner('gh', ['repo', 'list', org, '--limit', '4000', '--no-archived', '--json', 'name']);
  return JSON.parse(stdout).map(r => r.name).filter(n => n.startsWith(`${assignment}-`) && n.length > assignment.length + 1 && NAME_RE.test(n)).sort();
}

// a student's repository cloned into dir: no hooks, no symbolic links, no tags; its last commit, or its last before the
// deadline (null: none before it)
async function cloneRepo(org, repo, dir, { before, runner }) {
  const git = ['--quiet', '--no-tags', '-c', 'core.symlinks=false', '-c', 'core.hooksPath=/dev/null', ...(before ? [] : ['--depth', '1'])];
  await runner('gh', ['repo', 'clone', `${org}/${repo}`, dir, '--', ...git]);
  if (!before) return 'HEAD';
  const { stdout } = await runner('git', ['-C', dir, 'rev-list', '-1', `--before=${before}`, 'HEAD']);
  const commit = stdout.trim();
  if (!commit) return null;
  await runner('git', ['-C', dir, '-c', 'core.hooksPath=/dev/null', 'checkout', '--quiet', '--detach', commit]);
  return commit;
}

/**
 * The teacher's run: every repository of the assignment cloned into outDir/<student> and graded on the exercise (all its
 * tests): { results, csv, problems, repos } (a result per student, its submission the student's name). csv: the CSV's
 * file; json: the results'; issues: an issue in each repository with its student's report; before: the deadline (a date
 * git reads: the last commit before it). onResult(result) after each.
 */
export async function gradeClassroom(exerciseFile, { org, assignment, outDir, before = null, csv = null, json = null, issues = false, runner = RUNNER, onResult = () => {} }) {
  const { exercise: ex, problems } = loadExercise(exerciseFile);
  if (!ex) return { results: [], problems };
  if (before && !/^\d{4}-\d\d-\d\d([T ]\d\d:\d\d(:\d\d)?)?(Z|[+-]\d\d:?\d\d)?$/.test(before)) return { results: [], problems: [`--before: a date, or a date and time (2026-12-01T23:59), not '${before}'`] };
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length) return { results: [], problems: [`${outDir} is not empty: give a new folder`] };
  fs.mkdirSync(outDir, { recursive: true });
  const repos = await assignmentRepos(org, assignment, { runner });
  if (!repos.length) return { results: [], problems: [`the organization ${org} has no repository of the assignment ${assignment} (${assignment}-<student>)`] };
  const student = repo => repo.slice(assignment.length + 1);
  const note = {};
  for (const repo of repos) {
    const dir = path.join(outDir, student(repo));
    try {
      if (await cloneRepo(org, repo, dir, { before, runner }) === null) { note[student(repo)] = 'no commit before the deadline'; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir); }
    } catch (e) { note[student(repo)] = `the repository could not be cloned: ${String(e.stderr || e.message).trim().split('\n')[0]}`; fs.mkdirSync(dir, { recursive: true }); }
  }
  const { results, problems: bad } = await gradeAll(exerciseFile, repos.map(r => path.join(outDir, student(r))), { onResult, expand: false });
  if (bad.length) return { results: [], problems: bad };
  for (const r of results) if (note[r.submission]) r.design.messages = [note[r.submission]];
  const text = csvReport(results, ex);
  if (csv) fs.writeFileSync(csv, text);
  if (json) fs.writeFileSync(json, `${JSON.stringify(results, null, 2)}\n`);
  if (issues) {
    for (const r of results) {
      const body = `Silinx's grading of ${localize(ex.title, 'en')}${before ? ` (the last commit before ${before})` : ''}:\n\n\`\`\`\n${textReport(r)}\`\`\`\n`;
      await runner('gh', ['issue', 'create', '--repo', `${org}/${assignment}-${r.submission}`, '--title', `${localize(ex.title, 'en')}: ${r.points} / ${r.max} points`, '--body', body]);
    }
  }
  return { results, csv: text, problems: [], repos };
}
