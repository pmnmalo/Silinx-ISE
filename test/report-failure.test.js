// A scheduled workflow's failure as an issue (scripts/report-failure.mjs, #251): the lines of a job's log
// that say what failed (as the nightly of 15 October's designs job wrote them), cleaned of what must
// not be public; the issue's title and body; a job cancelled at its time limit reported, one cancelled by a
// newer run not (#343); the workflows' last job.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clean, failureLines, issueText, jobsToReport, TIMED_OUT } from '../scripts/report-failure.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const LOG = `2026-10-15T08:13:55.1002295Z   fail-on-cache-miss: false
2026-10-15T08:31:21.2439754Z  21/38 secworks-sha256          frontend pass, tb pass, synth pass, diff pass, flow fail
2026-10-15T08:31:22.0000000Z  22/38 secworks-sha1            frontend pass, tb pass, synth pass, diff pass, flow complete
2026-10-15T08:49:15.9403547Z   flow: fail: routing check: node CLB_X10Y14/W2END5 used by dut.c_reg<21> and dut.a<0>
2026-10-15T08:49:15.9403547Z   flow: fail: routing check: node CLB_X10Y14/W2END5 used by dut.c_reg<21> and dut.a<0>
2026-10-15T08:49:15.9410327Z VANISHED WARNINGS (1):
2026-10-15T08:49:15.9500000Z not ok 12 - ISE: blinky's bitstream is byte-identical
2026-10-15T08:49:15.9500001Z   AssertionError [ERR_ASSERTION]: ssh dev@192.0.2.3 failed in /Users/you/work/x.bit
2026-10-15T08:49:15.9721719Z ##[error]Process completed with exit code 1.
`;

test('report-failure: the lines that say what failed, each once, their timestamps off, cleaned', () => {
  assert.deepEqual(failureLines(LOG), [
    ' 21/38 secworks-sha256          frontend pass, tb pass, synth pass, diff pass, flow fail',
    '  flow: fail: routing check: node CLB_X10Y14/W2END5 used by dut.c_reg<21> and dut.a<0>',
    'VANISHED WARNINGS (1):',
    'not ok 12 - ISE: blinky\'s bitstream is byte-identical',
    '  AssertionError [ERR_ASSERTION]: ssh <user>@<host> failed in /Users/<user>/work/x.bit',
    '##[error]Process completed with exit code 1.',
  ]);
  assert.equal(failureLines(LOG, 2).length, 2);
  assert.deepEqual(failureLines('all fine\n ok 1 - x\n'), []);
});

test('report-failure: clean takes off home folders, logins, addresses and e-mails, not loopback', () => {
  assert.equal(clean('/home/you/x and C:\\Users\\you\\y'), '/home/<user>/x and C:\\Users/<user>\\y');
  assert.equal(clean('mail someone@uni.example, ssh me@203.0.113.9 or me@mini.test'), 'mail <e-mail>, ssh <user>@<host> or <e-mail>');
  assert.equal(clean('listening on 127.0.0.1:8080, peer 198.51.100.7'), 'listening on 127.0.0.1:8080, peer <address>');
  assert.equal(clean('module foo(input a); // v1.2'), 'module foo(input a); // v1.2');
});

// (the samples are built at run time, so that this file does not hold what the private-data scan looks for)
const j = (sep, ...p) => p.join(sep);

test('report-failure: clean takes off computer names, volumes, the runner\'s folders and name, IPv6, MAC, ids (#1437)', () => {
  assert.equal(clean(`on ${j('.', 'lab-pc', 'local')} and ${j('.', 'router', 'home')}, ${j('.', 'nas', 'lan')}:8080 ${j('.', 'build', 'corp', 'internal')}`), 'on <host> and <host>, <host>:8080 <host>');
  assert.equal(clean(`ENOENT ${j('/', '', 'Volumes', 'Build', 'runner', '_work', 'x.bit')}`), 'ENOENT /Volumes/<volume>/runner/_work/x.bit');
  // the runner's own name and folders, from its environment (a short or numeric value is not replaced)
  const env = { RUNNER_NAME: 'mini-runner', RUNNER_DIR: `${j('/', '', 'srv', 'runner')}/`, RUNNER_TEMP: `${j('/', '', 'srv', 'runner', '_work', '_temp')}`, HOSTNAME: 'ab', GITHUB_WORKSPACE: '12' };
  assert.equal(clean(`Mini-Runner: ${j('/', '', 'srv', 'runner', '_work', '_temp', 'a')} in ${j('/', '', 'srv', 'runner', 'bin')} ab 12`, env), '<runner>: <runner dir>/_work/_temp/a in <runner dir>/bin ab 12');
  assert.equal(clean('plain line', {}), 'plain line');
  // IPv6 (but ::1), with its zone; a time or a C++ scope is not an address
  assert.equal(clean(`${j(':', '2001', 'db8', '', '7')} ${j(':', 'fe80', '', '1')}%en0 [${j(':', '2001', '0db8', '0000', '0000', '0000', 'ff00', '0042', '8329')}]:80 ::1 at 08:13:55 std::string`), '<address> <address> [<address>]:80 ::1 at 08:13:55 std::string');
  // a tailnet's name (MagicDNS), a bare .local name and a login on a computer with no domain (#3520): ssh's message
  const host = j('.', 'mini', 'tail0000', 'ts', 'net');
  assert.equal(clean(`ssh: connect to host ${host} port 22: Operation timed out`), 'ssh: connect to host <host> port 22: Operation timed out');
  assert.equal(clean(`ssh ${j('@', 'ana', 'labbox')} and ${j('.', 'labbox', 'local')}: refused`), 'ssh <user>@<host> and <host>: refused');
  assert.deepEqual(failureLines(`2026-01-01T00:00:00Z ##[error]ssh: connect to host ${host} port 22: failed`), ['##[error]ssh: connect to host <host> port 22: failed']);
  // MAC addresses, container ids (12 or 64 hex digits with a letter and a digit); a short hash and a number stay
  assert.equal(clean(`${j(':', 'a4', '83', 'e7', '01', '23', '45')} ${j('-', '00', '1a', '2b', '3c', '4d', '5e')} 3f9c2a1b7d0e ${'a'.repeat(63)}1 359c48a 123456789012 deadbeefcafe deadbeefcaf3`), '<mac> <mac> <id> <id> 359c48a 123456789012 deadbeefcafe <id>');
});

test('report-failure: a line that still holds private data after cleaning is withheld, and said to be (#1437)', () => {
  const log = `Error: ${j('/', '', 'Volumes', 'Build', 'runner')} ${j('.', 'lab-pc', 'local')} ${j(':', '2001', 'db8', '', '7')} ${j(':', 'a4', '83', 'e7', '01', '23', '45')}
Error: pass${'word'} = "${'hunter'}2x"
Error: a key AK${'IA'}ABCDEFGHIJKLMNOP
not ok 1 - plain
`;
  const lines = failureLines(log, 40, {});
  assert.deepEqual(lines, ['Error: /Volumes/<volume>/runner <host> <address> <mac>', 'not ok 1 - plain', '(2 lines withheld: private data; see the run)']);
  for (const word of ['Build', 'lab-pc', '2001', 'a4', 'hunter', 'ABCDEFGHIJKLMNOP']) assert.ok(!lines.join('\n').includes(word), word);
  assert.deepEqual(failureLines('Error: x\nnot ok 2 - y\n', 40, {}), ['Error: x', 'not ok 2 - y']);   // nothing withheld: no note
});

test('report-failure: the issue of a failed job, its title one per workflow and job', () => {
  const t = issueText({ workflow: 'Nightly', job: 'designs', runUrl: 'https://github.com/o/r/actions/runs/1', sha: '359c48a0123456', lines: ['flow: fail: x'] });
  assert.equal(t.title, 'Nightly failed: designs');
  assert.equal(t.body, ['The scheduled run https://github.com/o/r/actions/runs/1 failed in the job **designs**, on 359c48a.', '',
    'What its log says:', '', '```', 'flow: fail: x', '```', '',
    '(Opened by the workflow, scripts/report-failure.mjs: a later failure of this job is added here while the issue is open.)'].join('\n'));
  assert.match(issueText({ workflow: 'ISE', job: 'ise', runUrl: 'u', sha: 'abcdef0', lines: [] }).body, /Its log says nothing more \(see the run\)\./);
});

// the annotations of the nightly of 16 October's corpus job (its timeout) and of a CI job a newer run cancelled
const TIMEOUT_NOTES = [{ annotation_level: 'failure', message: 'The job has exceeded the maximum execution time of 1h0m0s' },
  { annotation_level: 'failure', message: 'The operation was canceled.' }];
const SUPERSEDED_NOTES = [{ annotation_level: 'failure', message: 'Canceling since a higher priority waiting request for ci-refs/pull/340/merge-pr exists' },
  { annotation_level: 'failure', message: 'The operation was canceled.' }];

test('report-failure: a job cancelled at its time limit is reported, one cancelled by a newer run or by hand is not (#343)', async () => {
  const jobs = [
    { id: 1, name: 'changes', conclusion: 'success' },
    { id: 2, name: 'designs', conclusion: 'failure' },
    { id: 3, name: 'corpus (1/2)', conclusion: 'cancelled', check_run_url: 'https://api.github.com/repos/o/r/check-runs/3' },
    { id: 4, name: 'vloghammer', conclusion: 'cancelled' },
    { id: 5, name: 'corpus (2/2)', conclusion: 'cancelled' },
    { id: 6, name: 'report', conclusion: 'skipped' },
  ];
  const asked = [];
  const notes = { 3: TIMEOUT_NOTES, 4: SUPERSEDED_NOTES, 5: [] };
  const r = await jobsToReport(jobs, async j => { asked.push(j.id); return notes[j.id]; });
  assert.deepEqual(r.map(x => [x.job.name, x.timedOut]), [['designs', null], ['corpus (1/2)', 'The job has exceeded the maximum execution time of 1h0m0s']]);
  // only the cancelled jobs' annotations are read
  assert.deepEqual(asked, [3, 4, 5]);
  // annotations that cannot be read: the job is not reported (nothing says it timed out), the others are
  const err = console.error;
  console.error = () => {};
  try {
    const r2 = await jobsToReport([{ id: 7, name: 'ise', conclusion: 'cancelled' }, { id: 8, name: 'x', conclusion: 'failure' }], async () => { throw new Error('403'); });
    assert.deepEqual(r2.map(x => x.job.name), ['x']);
  } finally { console.error = err; }
  assert.ok(TIMED_OUT.test('The job running on runner GitHub Actions 12 has exceeded the maximum execution time of 60 minutes.'));
  assert.ok(!TIMED_OUT.test('The operation was canceled.'));
  // its issue says it timed out, in the same issue as its failures (the title)
  const t = issueText({ workflow: 'Nightly', job: 'corpus (1/2)', runUrl: 'https://github.com/o/r/actions/runs/2', sha: '9056ed4d1b32', lines: ['##[error]The operation was canceled.'], timedOut: 'The job has exceeded the maximum execution time of 1h0m0s' });
  assert.equal(t.title, 'Nightly failed: corpus (1/2)');
  assert.equal(t.body.split('\n')[0], 'The scheduled run https://github.com/o/r/actions/runs/2 timed out in the job **corpus (1/2)** (The job has exceeded the maximum execution time of 1h0m0s), on 9056ed4.');
});

test('report-failure: the scheduled workflows end with the job that reports a failure (#251)', () => {
  for (const [file, jobs] of [['nightly.yml', ['changes', 'corpus', 'vloghammer', 'designs']], ['ise.yml', ['changes', 'ise']], ['quality.yml', ['changes', 'compare', 'publish']],
    ['ci.yml', ['changes', 'unit', 'ui', 'webkit-standalone', 'release-zip', 'browsers', 'os', 'private-data-history']]]) {
    const yml = fs.readFileSync(path.join(ROOT, '.github/workflows', file), 'utf8');
    const job = yml.slice(yml.indexOf('\n  report:\n'));
    assert.ok(yml.includes('\n  report:\n'), file);
    assert.match(job, new RegExp(`needs: \\[${jobs.join(', ')}\\]`), file);
    // after a failure, or a job cancelled (at its time limit: the script tells which, #343), even in a run cancelled
    assert.match(job, /if: always\(\) && github\.event_name == 'schedule' && \(contains\(needs\.\*\.result, 'failure'\) \|\| contains\(needs\.\*\.result, 'cancelled'\)\)\n/, file);
    // the reusable job (#417), given the permissions it needs
    assert.match(job, /\n    uses: \.\/\.github\/workflows\/failure-report\.yml\n    permissions:\n      actions: read\n      checks: read\n      contents: read\n      issues: write\n/, file);
  }
  const yml = fs.readFileSync(path.join(ROOT, '.github/workflows/failure-report.yml'), 'utf8');
  assert.match(yml, /\non:\n  workflow_call:\n/);
  assert.match(yml, /\npermissions:\n  actions: read\n  checks: read\n  contents: read\n  issues: write\n/);
  assert.match(yml, /\n  report:\n    runs-on: ubuntu-latest\n(?:.*\n)*?      - run: node scripts\/report-failure\.mjs\n        env:\n          GITHUB_TOKEN: \$\{\{ github\.token \}\}\n/);
});
