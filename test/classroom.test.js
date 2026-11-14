// GitHub Classroom (#3193, server/classroom.js, server/classroom-cli.js):
// - the template of the shipped exercise (exercises/counter4): its files; nothing of its hidden tests or its reference;
//   its workflow (silinx grade --visible on each push, a release checked against its SHA256SUMS, no secret, read only);
//   the template itself graded as the workflow grades it;
// - the teacher's run over fake student repositories (local git repositories behind a stand-in for the GitHub CLI):
//   the assignment's repositories only, cloned with no hooks and no symbolic links, the CSV, the issues with each
//   student's report (a hidden test's verdict only), the last commit before the deadline;
// - the docs' commands (docs/CLASSROOM.md) as the CLI reads them; its wrong arguments.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { makeTemplate, workflowYaml, gradeClassroom, assignmentRepos, CHECKOUT, SETUP_NODE, WORKFLOW } from '../server/classroom.js';
import { classroomCommand } from '../server/classroom-cli.js';
import { gradeAll } from '../server/grade.js';
import { VERSION } from '../core/version.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EX = path.join(ROOT, 'exercises/counter4');
const EXERCISE = path.join(EX, 'counter4.exercise.json');
const RIGHT = fs.readFileSync(path.join(EX, 'ref/counter4.vhd'), 'utf8');
let tmp;
before(() => { tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-classroom-'))); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('#3193 the template: the starter project, the student\'s copy and the files of its visible tests, README, the workflow; nothing hidden', async () => {
  const dir = path.join(tmp, 'template');
  const { files, exerciseFile } = makeTemplate(EXERCISE, path.join(EX, 'starter'), dir);
  assert.equal(exerciseFile, 'counter4.exercise.json');
  assert.deepEqual(Object.keys(files).sort(), ['.github/workflows/silinx-grade.yml', '.gitignore', 'README.md', 'counter4.exercise.json', 'silinx.json', 'src/counter4.vhd', 'tests/count.vec']);
  const all = execFileSync('find', [dir, '-type', 'f'], { encoding: 'utf8' }).trim().split('\n').map(f => path.relative(dir, f).split(path.sep).join('/')).sort();   // (Windows's backslashes too, #3611)
  assert.deepEqual(all, Object.keys(files).sort());
  // (nothing of the hidden tests: no reference, no test bench, no random test's seed, not in any file)
  const text = Object.values(files).join('\n');
  for (const s of ['tb_counter4', 'TB DONE', '"seed"', 'ref/counter4.vhd', '"random"', '"bench"', 'after 5 counts']) assert.ok(!text.includes(s), s);
  const copy = JSON.parse(files['counter4.exercise.json']);
  assert.deepEqual([copy.tests.map(t => t.id), 'reference' in copy, copy.tests[0].file], [['count', 'impl'], false, 'tests/count.vec']);
  assert.match(files['README.md'], /^# 4-bit counter with enable\n\n## 4-bit counter with enable\n\nMake counter4, a 4-bit binary counter\./);
  assert.match(files['README.md'], /## Contador de 4 bits com enable\n\nFaça o counter4/);
  assert.match(files['README.md'], /The top module is `counter4`, with the ports `clk`, `rst`, `en`, `q`\./);
  // (the template as the workflow grades it: the starter's visible tests)
  const { results } = await gradeAll(path.join(dir, 'counter4.exercise.json'), [dir], { visible: true });
  assert.deepEqual(results.map(r => [r.verdict, r.points, r.max, r.tests.map(t => t.verdict)]), [['WA', 10, 40, ['WA', 'AC']]]);
  assert.throws(() => makeTemplate(EXERCISE, path.join(EX, 'starter'), dir), /is not empty: give a new folder/);
  assert.throws(() => makeTemplate(EXERCISE, EX, path.join(tmp, 't2')), /no Silinx project \(silinx\.json\) to start from/);
});

test('#3193 #3194 the workflow: silinx grade --visible on each push, its verdicts as annotations, a release checked against its SHA256SUMS, the summary, no secret, read only', () => {
  const y = workflowYaml('counter4.exercise.json');
  assert.match(y, /^on:\n {2}push:\n {2}workflow_dispatch:\npermissions:\n {2}contents: read\n/m);
  assert.match(y, new RegExp(`SILINX_VERSION: ${VERSION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\n`));
  assert.ok(y.includes(`uses: ${CHECKOUT}\n        with:\n          persist-credentials: false`));
  assert.ok(y.includes(`uses: ${SETUP_NODE}`));
  assert.match(y, /curl -fsSL -o "silinx-\$SILINX_VERSION\.zip" "https:\/\/github\.com\/pmnmalo\/Silinx\/releases\/download\/v\$SILINX_VERSION\/silinx-\$SILINX_VERSION\.zip"\n/);
  assert.ok(y.includes('grep " silinx-$SILINX_VERSION.zip$" SHA256SUMS | sha256sum -c -\n'));
  assert.match(y, /node "\$RUNNER_TEMP\/silinx\/bin\/silinx\.js" grade counter4\.exercise\.json \. --visible --json "\$RUNNER_TEMP\/grade\.json"/);
  // (each verdict an annotation of the check run, #3194: the file written by --annotations, printed to the job's log)
  assert.ok(y.includes('--annotations "$RUNNER_TEMP/annotations.txt" > "$RUNNER_TEMP/report.txt"\n'));
  assert.ok(y.includes('\n          [ -f "$RUNNER_TEMP/annotations.txt" ] && cat "$RUNNER_TEMP/annotations.txt"\n'));
  assert.match(y, />> "\$GITHUB_STEP_SUMMARY"\n {10}exit \$status\n$/);
  assert.doesNotMatch(y, /secrets\.|GITHUB_TOKEN|pull_request_target|write/);
  // (every action pinned by its commit)
  for (const [, ref] of y.matchAll(/uses: (\S+)/g)) assert.match(ref, /@[0-9a-f]{40}$/, ref);
  assert.equal(workflowYaml('counter4.exercise.json', { version: '15.25.0' }).includes('SILINX_VERSION: 15.25.0'), true);
  assert.throws(() => workflowYaml('a b.exercise.json'), /the exercise's file/);
  assert.throws(() => workflowYaml('x.exercise.json', { version: '1.2; rm -rf /' }), /a release of Silinx: a version x\.y\.z/);
});

// ---------------------------------------------------------------- the teacher's run
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=Student', '-c', 'user.email=student@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: process.env.D, GIT_COMMITTER_DATE: process.env.D } });
// a student's repository: the template's files, then their commits ({ date, files }), as a bare repository
function studentRepo(name, commits) {
  const work = path.join(tmp, 'work', name);
  fs.cpSync(path.join(tmp, 'template'), work, { recursive: true });
  git(work, 'init', '-q', '-b', 'main');
  for (const c of commits) {
    for (const [f, t] of Object.entries(c.files)) { if (t === null) fs.rmSync(path.join(work, f)); else { fs.mkdirSync(path.dirname(path.join(work, f)), { recursive: true }); fs.writeFileSync(path.join(work, f), t); } }
    if (c.link) fs.symlinkSync(c.link[1], path.join(work, c.link[0]));
    process.env.D = c.date;
    git(work, 'add', '-A');
    git(work, 'commit', '-q', '-m', c.date);
  }
  delete process.env.D;
  const bare = path.join(tmp, 'remote', `${name}.git`);
  execFileSync('git', ['clone', '-q', '--bare', work, bare]);
  return bare;
}
// a stand-in for the GitHub CLI: the organization's repositories, cloned from the bare ones; the issues recorded
function fakeGh(repos, issues) {
  const exec = promisify(execFile);
  return async (cmd, args) => {
    if (cmd === 'git') return exec('git', args);
    assert.equal(cmd, 'gh');
    if (args[0] === 'repo' && args[1] === 'list') { assert.deepEqual(args.slice(2), ['org', '--limit', '4000', '--no-archived', '--json', 'name']); return { stdout: JSON.stringify(Object.keys(repos).map(name => ({ name }))) }; }
    if (args[0] === 'repo' && args[1] === 'clone') {
      const [org, name] = args[2].split('/');
      assert.equal(org, 'org');
      assert.deepEqual(args.slice(4, 10), ['--', '--quiet', '--no-tags', '-c', 'core.symlinks=false', '-c']);
      return exec('git', ['clone', ...args.slice(5), `file://${repos[name]}`, args[3]]);
    }
    if (args[0] === 'issue' && args[1] === 'create') { issues.push({ repo: args[args.indexOf('--repo') + 1], title: args[args.indexOf('--title') + 1], body: args[args.indexOf('--body') + 1] }); return { stdout: '' }; }
    throw new Error(`unexpected gh ${args.join(' ')}`);
  };
}

test('#3193 the teacher\'s run: the assignment\'s repositories graded on every test, the CSV, an issue each (a hidden test\'s verdict only), the deadline', { timeout: 300000, skip: process.platform === 'win32' && 'symbolic links need a privilege on Windows' }, async () => {
  if (!fs.existsSync(path.join(tmp, 'template'))) makeTemplate(EXERCISE, path.join(EX, 'starter'), path.join(tmp, 'template'));
  const repos = {
    'counter4-ana': studentRepo('ana', [{ date: '2026-11-20T10:00:00Z', files: { 'src/counter4.vhd': RIGHT } }]),
    // rui: right before the deadline, then broken after it (the enable not read: the test bench's counting passes still)
    'counter4-rui': studentRepo('rui', [{ date: '2026-11-20T10:00:00Z', files: { 'src/counter4.vhd': RIGHT } }, { date: '2026-12-02T10:00:00Z', files: { 'src/counter4.vhd': RIGHT.replace("elsif en = '1' then", 'else') } }]),
    // eva: a symbolic link to a file outside her repository (cloned as a plain file: no link), her counter wrong
    'counter4-eva': studentRepo('eva', [{ date: '2026-11-20T10:00:00Z', files: { 'src/counter4.vhd': RIGHT.replace('count + 1', 'count + 2') }, link: ['src/secret.vhd', '/etc/hosts'] }]),
    'other-assignment-ana': studentRepo('other', [{ date: '2026-11-20T10:00:00Z', files: {} }]),
  };
  assert.deepEqual(await assignmentRepos('org', 'counter4', { runner: fakeGh(repos, []) }), ['counter4-ana', 'counter4-eva', 'counter4-rui']);
  const issues = [];
  const csv = path.join(tmp, 'grades.csv');
  const r = await gradeClassroom(EXERCISE, { org: 'org', assignment: 'counter4', outDir: path.join(tmp, 'run1'), csv, issues: true, runner: fakeGh(repos, issues) });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.results.map(x => [x.submission, x.verdict, x.points]), [['ana', 'AC', 100], ['eva', 'WA', 10], ['rui', 'WA', 30]], JSON.stringify(r.results.map(x => x.tests.map(t => [t.verdict, t.messages]))));
  assert.equal(fs.readFileSync(csv, 'utf8'), [
    'submission,points,max,verdict,count,count points,random,random points,bench,bench points,impl,impl points',
    'ana,100,100,AC,AC,30,AC,40,AC,20,AC,10', 'eva,10,100,WA,WA,0,WA,0,WA,0,AC,10', 'rui,30,100,WA,WA,0,WA,0,AC,20,AC,10', ''].join('\n'));
  // (eva's link: a plain file of the clone, its text the link's target, not the file it pointed to)
  assert.equal(fs.lstatSync(path.join(tmp, 'run1/eva/src/secret.vhd')).isSymbolicLink(), false);
  assert.equal(fs.readFileSync(path.join(tmp, 'run1/eva/src/secret.vhd'), 'utf8'), '/etc/hosts');
  // the issues: each student's report; a hidden test's verdict and points, never its expected values
  assert.deepEqual(issues.map(i => [i.repo, i.title]), [['org/counter4-ana', '4-bit counter with enable: 100 / 100 points'], ['org/counter4-eva', '4-bit counter with enable: 10 / 100 points'], ['org/counter4-rui', '4-bit counter with enable: 30 / 100 points']]);
  const eva = issues[1].body;
  assert.match(eva, /^Silinx's grading of 4-bit counter with enable:\n\n```\neva: 10 \/ 100 points \(Wrong Answer\)\n/);
  assert.match(eva, / {2}- random \(Random inputs against the reference\): WA Wrong Answer, 0 \/ 40 \[hidden\]\n {2}- bench \(The wrap and the reset while counting\): WA Wrong Answer, 0 \/ 20 \[hidden\]\n/);
  assert.doesNotMatch(eva, /after 5 counts|vectors line 2\)|tb_counter4/);
  assert.match(eva, /cycle 1 \(vectors line 4\): q is 0010, expected 0001/);   // (the visible test's difference: hers to see)
  // the deadline: rui's last commit before it (Accepted), ana's too; one with none before it
  const late = await gradeClassroom(EXERCISE, { org: 'org', assignment: 'counter4', outDir: path.join(tmp, 'run2'), before: '2026-12-01T23:59:00Z', runner: fakeGh(repos, []) });
  assert.deepEqual(late.results.map(x => [x.submission, x.verdict, x.points]), [['ana', 'AC', 100], ['eva', 'WA', 10], ['rui', 'AC', 100]]);
  const early = await gradeClassroom(EXERCISE, { org: 'org', assignment: 'counter4', outDir: path.join(tmp, 'run3'), before: '2026-11-01', runner: fakeGh(repos, []) });
  assert.deepEqual(early.problems, []);
  assert.deepEqual(early.results.map(x => [x.submission, x.verdict, x.design.messages]), [['ana', 'CE', ['no commit before the deadline']], ['eva', 'CE', ['no commit before the deadline']], ['rui', 'CE', ['no commit before the deadline']]]);
  // wrong arguments
  assert.deepEqual((await gradeClassroom(EXERCISE, { org: 'org', assignment: 'counter4', outDir: path.join(tmp, 'run1'), runner: fakeGh(repos, []) })).problems, [`${path.join(tmp, 'run1')} is not empty: give a new folder`]);
  assert.deepEqual((await gradeClassroom(EXERCISE, { org: 'org', assignment: 'counter4', outDir: path.join(tmp, 'run4'), before: 'tomorrow; rm', runner: fakeGh(repos, []) })).problems, ['--before: a date, or a date and time (2026-12-01T23:59), not \'tomorrow; rm\'']);
  assert.deepEqual((await gradeClassroom(EXERCISE, { org: 'org', assignment: 'nothing', outDir: path.join(tmp, 'run5'), runner: fakeGh(repos, []) })).problems, ['the organization org has no repository of the assignment nothing (nothing-<student>)']);
  await assert.rejects(assignmentRepos('org; x', 'a', { runner: fakeGh(repos, []) }), /names of letters, digits, \. _ -/);
});

test('#3193 the docs\' commands: silinx classroom template and grade as docs/CLASSROOM.md writes them; the wrong arguments', { timeout: 300000 }, async () => {
  const doc = fs.readFileSync(path.join(ROOT, 'docs/CLASSROOM.md'), 'utf8');
  const commands = [...doc.matchAll(/^silinx classroom (.+)$/gm)].map(m => m[1]);
  assert.deepEqual(commands.map(c => c.split(' ')[0]), ['template', 'grade', 'grade']);
  let out = '', err = '';
  const io = { out: t => { out += t; }, err: t => { err += t; } };
  // the template command, in a folder of the test's: as the docs write it
  const cwd = path.join(tmp, 'docs');
  fs.mkdirSync(cwd);
  fs.cpSync(EX, path.join(cwd, 'exercises/counter4'), { recursive: true });
  const args = commands[0].split(' ').map(a => (a.startsWith('exercises/') || a === 'counter4-template' ? path.join(cwd, a) : a));
  assert.equal(await classroomCommand(args, io), 0, err);
  assert.equal(out, `${path.join(cwd, 'counter4-template')}: the template of counter4.exercise.json (7 files: the starter project, the visible tests, README.md, ${WORKFLOW})\n`);
  // the grade commands' options: the CLI's
  for (const c of commands.slice(1)) {
    const opts = c.split(' ').filter(a => a.startsWith('--')).map(a => a.slice(2));
    for (const o of opts) assert.ok(['org', 'assignment', 'out', 'before', 'csv', 'json', 'issues', 'quiet'].includes(o), o);
  }
  const run = async a => { out = ''; err = ''; const code = await classroomCommand(a, io); return { code, out, err }; };
  assert.deepEqual(await run([]), { code: 1, out: '', err: 'silinx classroom: template or grade (silinx help)\n' });
  assert.deepEqual(await run(['template', EXERCISE]), { code: 1, out: '', err: 'silinx classroom template: give the exercise, the starter project and a new folder for the template\n' });
  assert.deepEqual(await run(['grade', EXERCISE, '--org', 'o']), { code: 1, out: '', err: 'silinx classroom grade: give the exercise and --assignment, --out\n' });
  assert.deepEqual(await run(['grade', EXERCISE, '--org']), { code: 1, out: '', err: 'silinx classroom: --org needs a value\n' });
  assert.deepEqual(await run(['grade', EXERCISE, '--push']), { code: 1, out: '', err: 'silinx classroom: unknown option --push\n' });
  // (bin/silinx.js runs it)
  const r = execFileSync(process.execPath, [path.join(ROOT, 'bin/silinx.js'), 'classroom', 'template', EXERCISE, path.join(EX, 'starter'), path.join(tmp, 'bin-template')], { encoding: 'utf8' });
  assert.match(r, /: the template of counter4\.exercise\.json \(7 files/);
});
