// The workflows' hardening (the CI audit of 2026-10-17): what each job may do with its token, and what the
// self-hosted runner (the ISE machine) runs with.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isWorkflowFile, workflowFiles } from './workflows-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, '.github/workflows');
const FILES = workflowFiles(DIR);
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');

test('workflows: the files checked are the .yml and the .yaml ones, as GitHub runs both (#1438)', () => {
  for (const f of ['ci.yml', 'ise.yaml', 'a.b.yml']) assert.ok(isWorkflowFile(f), f);
  for (const f of ['README.md', 'ci.yml.bak', 'ci.json', 'yml', '.yml.txt']) assert.ok(!isWorkflowFile(f), f);
  assert.ok(FILES.includes('ise.yml') && FILES.includes('quality.yml'));
  assert.deepEqual(FILES, fs.readdirSync(DIR).filter(isWorkflowFile).sort());
});

/** The jobs of a workflow: { name: [its lines] } (two-space keys under jobs:). */
export function jobs(yml) {
  const body = yml.slice(yml.indexOf('\njobs:\n') + 7);
  const out = {};
  let name = null;
  for (const line of body.split('\n')) {
    const m = line.match(/^  ([\w-]+):$/);
    if (m) out[name = m[1]] = [];
    else if (name && /^ {4}/.test(line)) out[name].push(line);
  }
  return out;
}

/** A job's permissions block: { scope: level }, null when it has none. */
function permissions(lines) {
  const at = lines.indexOf('    permissions:');
  if (at < 0) return null;
  const out = {};
  for (const l of lines.slice(at + 1)) {
    const m = l.match(/^ {6}([\w-]+): (\w+)/);
    if (!m) break;
    out[m[1]] = m[2];
  }
  return out;
}

test('workflows: the jobs parsed', () => {
  assert.deepEqual(Object.keys(jobs(read('quality.yml'))), ['changes', 'compare', 'publish', 'report']);
  assert.deepEqual(permissions(jobs(read('quality.yml')).report), { actions: 'read', checks: 'read', contents: 'read', issues: 'write' });
});

test('workflows: the self-hosted runner only for main, read-only, without the checkout\'s credentials (#412)', () => {
  const selfHosted = [];
  for (const f of FILES) {
    const yml = read(f);
    for (const [name, lines] of Object.entries(jobs(yml))) {
      if (!lines.some(l => /^ {4}runs-on: .*self-hosted/.test(l))) continue;
      selfHosted.push(`${f}:${name}`);
      // never a pull request's code: scheduled or by hand, main only
      assert.doesNotMatch(yml.slice(0, yml.indexOf('\njobs:\n')), /pull_request|push:|workflow_run/, f);
      assert.ok(lines.some(l => l.includes("github.repository == 'pmnmalo/Silinx-ISE' && github.ref == 'refs/heads/main'")), `${f}:${name} main only`);
      // a read-only token, none kept in the work folder
      for (const [scope, level] of Object.entries(permissions(lines) || {})) assert.equal(level, 'read', `${f}:${name} ${scope}`);
      assert.doesNotMatch(yml.slice(0, yml.indexOf('\njobs:\n')), /^ {2}[\w-]+: write$/m, `${f}: no writing permission for the workflow`);
      const body = lines.join('\n');
      const checkouts = body.match(/uses: actions\/checkout@.+/g) || [];
      assert.ok(checkouts.length, `${f}:${name}`);
      assert.equal((body.match(/uses: actions\/checkout@.+\n\s+with:\n(?:\s+\w[\w-]*: .*\n)*?\s+persist-credentials: false/g) || []).length, checkouts.length, `${f}:${name} persist-credentials: false`);
      assert.doesNotMatch(body, /git push|GITHUB_TOKEN|GH_TOKEN|github\.token/, `${f}:${name} no token used`);
    }
  }
  assert.deepEqual(selfHosted, ['ise.yml:ise', 'quality.yml:compare']);
});

// GitHub's own runners: the only labels a job may run on, but the ISE runner's
const HOSTED = /^(ubuntu|macos|windows)-[\w.]+$/;
const SELF_HOSTED = '[self-hosted, ise]';
// the events that run only code already on the repository's branches (a pull request's own workflow files
// run on pull_request, pull_request_target, and on push / workflow_run / workflow_call from its branch)
const SELF_HOSTED_EVENTS = ['schedule', 'workflow_dispatch'];
const SELF_HOSTED_IF = "(github.event_name == 'schedule' || github.event_name == 'workflow_dispatch') && github.repository == 'pmnmalo/Silinx-ISE' && github.ref == 'refs/heads/main'";

/** What could send a pull request's code to the self-hosted ISE runner in a workflow: [problem] (#482). */
export function selfHostedProblems(f, yml) {
  const problems = [];
  const head = yml.slice(0, yml.indexOf('\njobs:\n'));
  const events = [...(/\non:\n((?: {2}.*\n|\s*\n)*)/.exec(head + '\n')?.[1] ?? '').matchAll(/^ {2}([\w-]+):/gm)].map(m => m[1]);
  for (const [name, lines] of Object.entries(jobs(yml))) {
    const body = lines.join('\n');
    const runsOn = lines.map(l => /^ {4}runs-on: (.*)$/.exec(l)?.[1]).filter(Boolean);
    // a job calling a reusable workflow: one of the repository's (checked on its own: those have no self-hosted job)
    const uses = lines.map(l => /^ {4}uses: (.*)$/.exec(l)?.[1]).find(Boolean);
    if (uses && !/^\.\/\.github\/workflows\/[\w-]+\.yml$/.test(uses)) problems.push(`${f}:${name}: a reusable workflow from elsewhere (${uses})`);
    if (!runsOn.length) continue;
    const on = runsOn[0].trim();
    let labels;
    if (on === '${{ matrix.os }}') {
      // the matrix's operating systems: GitHub's runners only, whatever the event
      const os = lines.map(l => /^ {8}os: (.*)$/.exec(l)?.[1]).find(Boolean) ?? '';
      labels = [...os.matchAll(/[\w.-]+-[\w.]+|self-hosted|\bise\b/g)].map(m => m[0]);
      if (!labels.length) problems.push(`${f}:${name}: runs-on ${on} without a matrix of runners`);
    } else if (on.includes('${{')) {
      problems.push(`${f}:${name}: runs-on from an expression (${on})`);
      continue;
    } else labels = on.replace(/^\[|\]$/g, '').split(',').map(s => s.trim());
    if (labels.every(l => HOSTED.test(l))) continue;
    if (on !== SELF_HOSTED) { problems.push(`${f}:${name}: runs-on ${on} (GitHub's runners, or ${SELF_HOSTED})`); continue; }
    // the ISE runner: scheduled or by hand only, on main, from this repository (not a fork)
    const other = events.filter(e => !SELF_HOSTED_EVENTS.includes(e));
    if (other.length) problems.push(`${f}:${name}: on the self-hosted runner, the workflow also runs on ${other.join(', ')}`);
    if (!lines.some(l => l === `    if: needs.changes.outputs.run == 'true' && ${SELF_HOSTED_IF}` || l === `    if: ${SELF_HOSTED_IF}`))
      problems.push(`${f}:${name}: on the self-hosted runner without the guard of its event and ref (${SELF_HOSTED_IF})`);
    if (/pull_request|github\.head_ref|\bref: /.test(body)) problems.push(`${f}:${name}: on the self-hosted runner, a pull request's ref`);
  }
  return problems;
}

test('workflows: no pull request\'s code can reach the self-hosted ISE runner (#482)', () => {
  // the repository's workflows: only ise.yml and quality.yml use it, scheduled or by hand, on main
  for (const f of FILES) assert.deepEqual(selfHostedProblems(f, read(f)), [], f);
  const users = FILES.filter(f => /^\s*(runs-on|os):.*(self-hosted|\bise\b)/m.test(read(f)));
  assert.deepEqual(users, ['ise.yml', 'quality.yml']);

  // the checker itself, on workflows that would send a pull request's code there
  const job = (runsOn, extra = '') => `    runs-on: ${runsOn}\n    timeout-minutes: 5\n${extra}    steps:\n      - run: make\n`;
  const wf = (on, ...js) => `name: X\non:\n${on}permissions:\n  contents: read\njobs:\n${js.map((j, i) => `  j${i}:\n${j}`).join('')}`;
  const SCHED = '  schedule:\n    - cron: \'0 0 * * *\'\n  workflow_dispatch:\n';
  const GUARD = `    if: ${SELF_HOSTED_IF}\n`;
  assert.deepEqual(selfHostedProblems('ok.yml', wf(SCHED, job(SELF_HOSTED, GUARD), job('ubuntu-latest'))), []);
  assert.deepEqual(selfHostedProblems('pr.yml', wf('  pull_request:\n' + SCHED, job(SELF_HOSTED, GUARD))),
    ['pr.yml:j0: on the self-hosted runner, the workflow also runs on pull_request']);
  assert.deepEqual(selfHostedProblems('prt.yml', wf('  pull_request_target:\n    branches: [main]\n', job(SELF_HOSTED, GUARD))),
    ['prt.yml:j0: on the self-hosted runner, the workflow also runs on pull_request_target']);
  for (const on of ['  push:\n', '  workflow_call:\n', '  workflow_run:\n    workflows: [CI]\n', '  issue_comment:\n'])
    assert.equal(selfHostedProblems('e.yml', wf(on + SCHED, job(SELF_HOSTED, GUARD))).length, 1, on);
  assert.deepEqual(selfHostedProblems('noif.yml', wf(SCHED, job(SELF_HOSTED))), [`noif.yml:j0: on the self-hosted runner without the guard of its event and ref (${SELF_HOSTED_IF})`]);
  assert.deepEqual(selfHostedProblems('ref.yml', wf(SCHED, job(SELF_HOSTED, GUARD + '    env:\n      R: ${{ github.head_ref }}\n'))), ['ref.yml:j0: on the self-hosted runner, a pull request\'s ref']);
  // other ways to name the runner: its labels in another order or alone, a matrix, an expression
  for (const runsOn of ['self-hosted', '[ise]', '[ise, self-hosted]', '[self-hosted, linux]'])
    assert.match(selfHostedProblems('l.yml', wf('  pull_request:\n', job(runsOn)))[0], /runs-on .* \(GitHub's runners, or \[self-hosted, ise\]\)/, runsOn);
  assert.equal(selfHostedProblems('m.yml', wf('  pull_request:\n', `    strategy:\n      matrix:\n        os: [ubuntu-latest, self-hosted]\n${job('${{ matrix.os }}')}`)).length, 1);
  assert.deepEqual(selfHostedProblems('m.yml', wf('  pull_request:\n', `    strategy:\n      matrix:\n        os: [ubuntu-latest, windows-latest]\n${job('${{ matrix.os }}')}`)), []);
  assert.deepEqual(selfHostedProblems('x.yml', wf('  pull_request:\n', job('${{ inputs.runner }}'))), ['x.yml:j0: runs-on from an expression (${{ inputs.runner }})']);
  assert.deepEqual(selfHostedProblems('u.yml', wf('  pull_request:\n', '    uses: someone/else/.github/workflows/x.yml@main\n')), ['u.yml:j0: a reusable workflow from elsewhere (someone/else/.github/workflows/x.yml@main)']);
});

test('workflows: the weekly comparison\'s results pushed from GitHub\'s runner, after a passing comparison (#412)', () => {
  const j = jobs(read('quality.yml'));
  const publish = j.publish.join('\n');
  assert.match(publish, /^ {4}needs: compare$/m);
  assert.doesNotMatch(publish, /^ {4}if:/m, 'only when compare passed (its --guard)');
  assert.match(publish, /^ {4}runs-on: ubuntu-latest$/m);
  assert.deepEqual(permissions(j.publish), { contents: 'write' });
  assert.match(publish, /uses: actions\/download-artifact@.+\n\s+with:\n\s+name: quality-results/);
  assert.match(publish, /git push -q -f origin HEAD:refs\/heads\/quality-results/);
  // the artifact the compare job uploads holds the files the publish job commits
  const compare = j.compare.join('\n');
  assert.match(compare, /- if: always\(\)\n\s+uses: actions\/upload-artifact@.+\n\s+with:\n\s+name: quality-results\n\s+path: \|\n\s+test\/designs-corpus\/ise-comparison\.json\n\s+docs\/QUALITY\.md/);
  for (const f of ['test/designs-corpus/ise-comparison.json', 'docs/QUALITY.md']) assert.match(publish, new RegExp(`git add .*${f.replace(/[./]/g, '\\$&')}`), f);
  assert.match(compare, /compare-ise\.mjs .* --guard/);
  // #2498: the comparison passed 15 hours (14h13m on 2026-10-25)
  assert.match(compare, /^ {4}timeout-minutes: 1200$/m);
});

/** The run: scripts of a workflow: [{ line, script }] (one line, or a block | / >). */
export function runScripts(yml) {
  const lines = yml.split('\n'), out = [];
  lines.forEach((l, i) => {
    const m = l.match(/^(\s*)(?:- )?run: (.*)$/);
    if (!m) return;
    const indent = m[1].length + (l.trimStart().startsWith('- ') ? 2 : 0);
    // (not a job's output named run: its parent key is outputs:)
    let p = i - 1;
    while (p >= 0 && (!lines[p].trim() || lines[p].search(/\S/) >= m[1].length)) p--;
    if (p >= 0 && /^\s*outputs:$/.test(lines[p])) return;
    if (!/^[|>][-+]?$/.test(m[2])) return out.push({ line: i + 1, script: m[2] });
    const body = [];
    for (let k = i + 1; k < lines.length && (!lines[k].trim() || lines[k].search(/\S/) > indent); k++) body.push(lines[k]);
    out.push({ line: i + 1, script: body.join('\n') });
  });
  return out;
}

test('workflows: the run: scripts parsed', () => {
  const yml = 'jobs:\n  a:\n    outputs:\n      run: ${{ steps.c.outputs.run }}\n    steps:\n      - run: echo "$A"\n        env:\n          A: ${{ x }}\n      - name: b\n        run: |\n          one\n\n          two ${{ y }}\n      - run: three\n';
  assert.deepEqual(runScripts(yml), [{ line: 6, script: 'echo "$A"' }, { line: 10, script: '          one\n\n          two ${{ y }}' }, { line: 14, script: 'three' }]);
});

test('workflows: explicit permissions, and no ${{ }} expression inside a run: script (#413)', () => {
  for (const f of FILES) {
    const yml = read(f);
    // the token's permissions said by every workflow, not the repository's default
    assert.match(yml.slice(0, yml.indexOf('\njobs:\n')), /^permissions:\n {2}[\w-]+: (read|write)\b/m, `${f}: permissions`);
    // a value goes into a script through env:, never pasted into it (an injection: a pull request's package.json,
    // an input typed by hand)
    for (const { line, script } of runScripts(yml)) assert.doesNotMatch(script, /\$\{\{/, `${f}:${line}`);
  }
  for (const f of ['ci.yml', 'nightly.yml']) assert.match(read(f), /\npermissions:\n {2}contents: read\n/, f);
});

test('workflows: every job has a time limit; the Playwright browsers cached by its version (#415)', () => {
  for (const f of FILES)
    for (const [name, lines] of Object.entries(jobs(read(f))))
      // (a job that calls a reusable workflow has none: its jobs have theirs)
      assert.ok(lines.some(l => /^ {4}timeout-minutes: \d+$/.test(l) || /^ {4}uses: \.\/\.github\/workflows\//.test(l)), `${f}:${name}: timeout-minutes (else 360 minutes)`);
  // every job that installs Playwright's browsers restores them first, keyed on the version that picks them
  const j = jobs(read('ci.yml'));
  const installs = Object.entries(j).filter(([, lines]) => lines.some(l => /npx playwright install/.test(l)));
  assert.deepEqual(installs.map(([n]) => n).sort(), ['browsers', 'webkit-standalone']);
  for (const [name, lines] of installs) {
    const body = lines.join('\n');
    const browsers = /npx playwright install --with-deps ([\w ]+?)(?: &&|\n|$)/.exec(body)[1].split(' ');
    const cache = /uses: actions\/cache@.+\n\s+with:\n\s+path: ~\/\.cache\/ms-playwright\n\s+key: (.+)/.exec(body);
    assert.ok(cache, name);
    assert.equal(cache[1], `playwright-\${{ runner.os }}-${browsers.join('-')}-\${{ hashFiles('node_modules/playwright-core/package.json') }}`, name);
    assert.ok(body.indexOf('ms-playwright') > body.indexOf('npm ci') && body.indexOf('ms-playwright') < body.indexOf('npx playwright install'), `${name}: after npm ci (the key's file), before the install`);
  }
});

test('workflows: one setup for the jobs that run the repository\'s code, the action of the repository (#417)', () => {
  const action = fs.readFileSync(path.join(ROOT, '.github/actions/setup/action.yml'), 'utf8');
  assert.match(action, /\nruns:\n  using: composite\n  steps:\n    - uses: actions\/setup-node@.+\n      with:\n        node-version: 22\n        cache: \$\{\{ inputs\.npm-cache == 'true' && 'npm' \|\| '' \}\}\n    - run: npm ci\n      shell: bash\n/);
  let n = 0;
  for (const f of FILES) {
    for (const [name, lines] of Object.entries(jobs(read(f)))) {
      const body = lines.join('\n');
      // npm ci is the action's, after the job's checkout; setup-node alone only where no npm ci follows
      assert.doesNotMatch(body, /setup-node@.+\n(?:\s+with:\n(?:\s+[\w-]+: .*\n)*)?\s+- run: npm ci/, `${f}:${name}`);
      if (!body.includes('uses: ./.github/actions/setup')) continue;
      n++;
      assert.ok(body.indexOf('actions/checkout@') >= 0 && body.indexOf('actions/checkout@') < body.indexOf('uses: ./.github/actions/setup'), `${f}:${name}: the checkout first`);
      // no npm cache on the self-hosted runner (a machine of our own)
      const selfHosted = lines.some(l => /^ {4}runs-on: .*self-hosted/.test(l));
      assert.equal(/uses: \.\/\.github\/actions\/setup\n\s+with:\n\s+npm-cache: false/.test(body), selfHosted, `${f}:${name}`);
    }
  }
  assert.ok(n >= 15, `${n} jobs`);
});

test('workflows: every action pinned by its commit, its version in a comment, all of one version (#414)', () => {
  const action = '.github/actions/setup/action.yml';
  const uses = [];
  for (const [f, yml] of [...FILES.map(f => [f, read(f)]), [action, fs.readFileSync(path.join(ROOT, action), 'utf8')]])
    for (const m of yml.matchAll(/^\s*(?:- )?uses: (.+)$/gm)) uses.push([f, m[1]]);
  const version = {};
  for (const [f, u] of uses) {
    if (u.startsWith('./')) { assert.ok(fs.existsSync(path.join(ROOT, u.split('@')[0])), `${f}: ${u}`); continue; }
    // (github/codeql-action/init and /analyze: two actions of one repository, pinned together)
    const m = u.match(/^([\w.-]+\/[\w.-]+)(?:\/[\w.-]+)?@([0-9a-f]{40}) # (v\d+\.\d+\.\d+)$/);
    assert.ok(m, `${f}: ${u} (owner/repo@<40-hex sha> # vX.Y.Z)`);
    const [, name, sha, v] = m;
    // the same action at the same commit everywhere (one Dependabot pull request moves them all)
    assert.deepEqual(version[name] ??= [sha, v], [sha, v], `${f}: ${name}`);
  }
  assert.ok(Object.keys(version).length >= 7, Object.keys(version).join(', '));
  // first-party actions only: GitHub's (actions/*, and github/codeql-action for CodeQL, #498)
  for (const name of Object.keys(version)) assert.match(name, /^(actions\/|github\/codeql-action$)/, name);
  // Dependabot looks at the setup action too
  assert.match(fs.readFileSync(path.join(ROOT, '.github/dependabot.yml'), 'utf8'), /github-actions\n\s+directories: \[\/, \/\.github\/actions\/setup\]/);
});

test('workflows: a run: script that reads an env variable says shell: bash in a job that runs on Windows (#505)', () => {
  // (Windows runners' default shell is PowerShell: "$SHARD" is not expanded there, the unit tests got '/3')
  for (const f of FILES) {
    for (const [name, lines] of Object.entries(jobs(read(f)))) {
      if (!lines.some(l => /windows/.test(l))) continue;
      const steps = lines.join('\n').split(/\n(?= {6}- )/).filter(s => /^ {6}- /.test(s) && /\brun:/.test(s));
      for (const step of steps) {
        const script = step.slice(step.indexOf('run:') + 4).split(/\n {8}(?:env|shell|with|if|name|timeout-minutes|id):/)[0];
        if (/\$[A-Z_]{2,}\b/.test(script)) assert.match(step, /\n {8}shell: bash\b/, `${f} ${name}: ${script.trim().split('\n')[0]}`);
      }
    }
  }
});
