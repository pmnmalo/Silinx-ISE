// The workflows' least privilege (#479): every workflow says at the top what its token may do (the ones
// that only test the code read the repository; the ones that publish say what they write, for every job
// of theirs), and the self-hosted runner (the maintainer's machine: ise.yml, quality.yml) installs the
// dependencies without their install scripts. Every job does (#1436): a compromised dependency's install
// script would otherwise run with the job's token, which no checkout keeps and only a publishing step gets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workflowFiles, jobsOf, jobPermissions } from './workflows-lib.mjs';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.github', 'workflows');
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');
// the workflows with a read-only token at the top: the ones that only test, and quality.yml, whose one writing
// job (the results' push, on GitHub's runner) says so itself (#486); the others (a release, the development
// site) write, and say so at the top
const READ_ONLY = ['ci.yml', 'nightly.yml', 'ise.yml', 'pins.yml', 'yosys-update.yml', 'quality.yml'];

test('every workflow states its permissions at the top; the testing ones read the repository only', () => {
  const files = workflowFiles(DIR);
  for (const f of READ_ONLY) assert.ok(files.includes(f), f);
  for (const f of files) {
    const yml = read(f);
    const m = /\npermissions:\n((?:  \S.*\n)+)/.exec(yml);
    assert.ok(m, `${f}: top-level permissions`);
    if (READ_ONLY.includes(f)) assert.equal(m[1].replace(/\s+#.*/, ''), '  contents: read\n', `${f}: a read-only token`);
  }
});

test('the self-hosted runner installs the dependencies without their install scripts', () => {
  for (const f of ['ise.yml', 'quality.yml']) {
    const yml = read(f);
    assert.match(yml, /runs-on: \[self-hosted, ise\]/, f);
    // npm ci is the setup action's (.github/actions/setup): the job's environment tells npm to skip the scripts
    const job = /\n    runs-on: \[self-hosted, ise\]\n([\s\S]*?)\n    steps:/.exec(yml);
    assert.ok(job, `${f}: the self-hosted job`);
    assert.match(job[1], /\n    env:\n(?:      .*\n)*      NPM_CONFIG_IGNORE_SCRIPTS: 'true'(\n|$)/, `${f}: NPM_CONFIG_IGNORE_SCRIPTS in the job's env`);
    assert.doesNotMatch(yml, /npm install\b/, f);
  }
});

test('quality.yml: one job writes, contents only, on GitHub\'s runner; the self-hosted job reads (#486)', () => {
  const yml = read('quality.yml');
  const jobs = {};
  for (const part of yml.slice(yml.indexOf('\njobs:\n') + 7).split(/\n(?= {2}[\w-]+:\n)/)) {
    const m = /^ {2}([\w-]+):\n([\s\S]*)$/.exec(part);
    if (m) jobs[m[1]] = m[2].split('\n').filter(l => /^ {4}/.test(l)).join('\n') + '\n';
  }
  assert.deepEqual(Object.keys(jobs), ['changes', 'compare', 'publish', 'report']);
  const writes = {};
  for (const [name, body] of Object.entries(jobs)) {
    const p = /\n    permissions:\n((?: {6}.*\n)+)/.exec('\n' + body);
    assert.ok(p, `${name}: its own permissions`);
    for (const m of p[1].matchAll(/^ {6}([\w-]+): write$/gm)) (writes[name] ??= []).push(m[1]);
  }
  // (the report job writes an issue: the failure report of a scheduled run, #251)
  assert.deepEqual(writes, { publish: ['contents'], report: ['issues'] });
  assert.match(jobs.compare, /\n    runs-on: \[self-hosted, ise\]\n/);
  assert.match(jobs.publish, /\n    runs-on: ubuntu-latest\n/);
  assert.match(jobs.report, /\n    uses: \.\/\.github\/workflows\/failure-report\.yml\n/);
  // the artifact from the self-hosted job checked before it is committed: two regular files, valid JSON
  const check = jobs.publish.indexOf('- name: Check the results'), commit = jobs.publish.indexOf('- name: Commit the results');
  assert.ok(check > 0 && check < commit, 'the check before the commit');
  const script = jobs.publish.slice(check, commit);
  assert.match(script, /\[ -L "\$R\/\$f" \] \|\| \[ ! -f "\$R\/\$f" \]/);
  assert.match(script, /jq -e '\.designs \| type == "array"'/);
});

const ACTION = path.join(DIR, '..', 'actions', 'setup', 'action.yml');
const FILES = workflowFiles(DIR);

test('the dependencies\' install scripts never run (#1436): the setup action says so, and every other npm ci is in a job that does', () => {
  const action = fs.readFileSync(ACTION, 'utf8');
  assert.match(action, /\n    - run: npm ci\n      shell: bash\n      env:\n        NPM_CONFIG_IGNORE_SCRIPTS: 'true'\n/, 'the setup action');
  for (const f of FILES) {
    const yml = read(f);
    for (const part of yml.slice(yml.indexOf('\njobs:\n') + 7).split(/\n(?= {2}[\w-]+:\n)/)) {
      const npm = part.replace(/^\s*#.*$/gm, '').match(/^.*\bnpm (ci|install)\b.*$/gm) || [];
      if (!npm.length) continue;
      const name = /^ {2}([\w-]+):/.exec(part)[1];
      // the job's env, or --ignore-scripts on every npm line of its own (yosys-update's measure)
      if (!npm.every(l => /--ignore-scripts\b/.test(l)))
        assert.match(part, /\n    env:\n(?:      .*\n)*      NPM_CONFIG_IGNORE_SCRIPTS: 'true'(\n|$)/, `${f}:${name}: npm ci in the job, without NPM_CONFIG_IGNORE_SCRIPTS in its env`);
    }
  }
});

test('no checkout keeps its credentials; a git push names the token of its own step (#1436)', () => {
  for (const f of FILES) {
    const yml = read(f);
    const checkouts = yml.match(/uses: actions\/checkout@.+/g) || [];
    const without = yml.match(/uses: actions\/checkout@.+\n\s+with:\n(?:\s+(?:[\w-]+: .*|#.*)\n)*?\s+persist-credentials: false/g) || [];
    assert.equal(without.length, checkouts.length, `${f}: persist-credentials: false on every checkout`);
    // a push: to origin (no credentials in a URL), in a step that holds the token and sets it as git's
    // authorization header for github.com (GIT_CONFIG_*: the configuration of that step's processes only)
    for (const m of yml.matchAll(/^.*\bgit push\b.*$/gm)) {
      assert.match(m[0], /git push( -\w+)* origin /, `${f}: ${m[0].trim()}`);
      const step = yml.slice(yml.lastIndexOf('\n      - ', m.index), m.index);
      assert.match(step, /\n {8}env:\n(?: {10}.*\n)*? {10}GH_TOKEN: \$\{\{ github\.token \}\}\n/, `${f}: the token in the pushing step's env`);
      assert.match(step, /GIT_CONFIG_KEY_0=http\.https:\/\/github\.com\/\.extraheader\n\s+GIT_CONFIG_VALUE_0="AUTHORIZATION: basic \$\(printf 'x-access-token:%s' "\$GH_TOKEN" \| base64 \| tr -d '\\n'\)"/, `${f}: the authorization header before the push`);
    }
  }
});

test('pages.yml: the deployment\'s token on the deploy job only; the build job, which runs the code, has none (#1436)', () => {
  const yml = read('pages.yml');
  const top = /\npermissions:\n((?:  \S.*\n)+)/.exec(yml)[1];
  assert.doesNotMatch(top, /write/, 'no write permission at the top');
  const deploy = yml.slice(yml.indexOf('\n  deploy:\n'));
  assert.match(deploy, /\n    permissions:\n      pages: write\n      id-token: write\n/);
  assert.doesNotMatch(yml.slice(yml.indexOf('\n  build:\n'), yml.indexOf('\n  deploy:\n')), /\n    permissions:/);
});

test('dependabot waits a week before proposing an npm version (#1436)', () => {
  const yml = fs.readFileSync(path.join(DIR, '..', 'dependabot.yml'), 'utf8');
  assert.match(yml, /\n  - package-ecosystem: npm\n(?:    .*\n)*?    cooldown:\n      default-days: 7\n/);
});

test('a job whose token writes installs no dependency (#2644): the build reads, a job of its own publishes its artifact', () => {
  const writing = [];
  for (const f of FILES) {
    const yml = read(f);
    for (const [name, job] of Object.entries(jobsOf(yml))) {
      const perms = jobPermissions(yml, job);
      const writes = Object.keys(perms).filter(p => perms[p] === 'write');
      if (!writes.length || /^ {4}uses: \.\/\.github\/workflows\//m.test(job)) continue;
      writing.push(`${f}:${name}`);
      const code = job.replace(/#.*$/gm, '');
      // the setup action (npm ci), npm installing or running the project's packages, npx
      assert.doesNotMatch(code, /uses: \.\/\.github\/actions\/setup|\bnpm (ci|install(?! --global npm@\d+\.\d+\.\d+ --ignore-scripts)|run|test|exec)\b|\bnpx\b/, `${f}:${name} (${writes}): installs or runs dependencies`);
    }
  }
  // the publishing jobs among them (a sanity check of the parsing)
  for (const j of ['dev-release.yml:publish', 'release.yml:publish', 'silinx-fpga-release.yml:publish', 'pages.yml:deploy', 'quality.yml:publish'])
    assert.ok(writing.includes(j), j);
  for (const j of ['dev-release.yml:build', 'release.yml:build', 'silinx-fpga-release.yml:build', 'pages.yml:build'])
    assert.ok(!writing.includes(j), j);
});

test('every Dockerfile\'s base is pinned by its digest; Dependabot updates the Vitis image\'s (#1435, #2645)', () => {
  const ROOT = path.join(DIR, '..', '..');
  const files = ['docker/ise/Dockerfile', 'scripts/vitis-hls-image/Dockerfile'];
  for (const f of files) {
    const from = fs.readFileSync(path.join(ROOT, f), 'utf8').match(/^FROM .*$/gm);
    assert.ok(from.length, f);
    for (const l of from) if (!/^FROM \w+( AS \w+)?$/.test(l)) assert.match(l, /^FROM (--platform=\S+ )?[\w./-]+:[\w.-]+@sha256:[0-9a-f]{64}( AS \w+)?$/, `${f}: ${l}`);
  }
  const dependabot = fs.readFileSync(path.join(DIR, '..', 'dependabot.yml'), 'utf8');
  assert.match(dependabot, /\n  - package-ecosystem: docker\n    directory: \/scripts\/vitis-hls-image\n/);
});
