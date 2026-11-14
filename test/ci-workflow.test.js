// CI at a release (#607): .github/workflows/ci.yml on a version tag, nightly on main when it changed (#3423) and by
// hand, never on a pull request or a push to main; everything it runs, and ci-ok, the verdict the Release workflow waits for.
// The development build and the site's dev/ on every push to main; CodeQL nightly and at a release.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// the jobs of a workflow and the lines of each (two-space keys under jobs:)
function jobs(yml) {
  const body = yml.slice(yml.indexOf('\njobs:\n') + 7);
  const out = {};
  let name = null;
  for (const line of body.split('\n')) {
    const m = line.match(/^  ([\w-]+):$/);
    if (m) out[name = m[1]] = [];
    else if (name && /^    /.test(line)) out[name].push(line);
  }
  return out;
}
const on = yml => yml.slice(yml.indexOf('\non:\n') + 1, yml.search(/\n(?:permissions|concurrency|jobs):\n/) + 1);

test('CI: at a release (a tag v*, or the toolchain package\'s silinx-fpga-v*, #1681), nightly (#3423) and by hand; every job, gated only by the nightly\'s change check; ci-ok needs them all', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.equal(on(ci).replace(/^#.*\n/gm, '').replace(/ +#.*$/gm, ''), "on:\n  push:\n    tags: ['v*', 'silinx-fpga-v*']\n  schedule:\n    - cron: '17 23 * * *'\n  workflow_dispatch:\n");
  assert.doesNotMatch(ci, /pull_request|branches:|paths(-ignore)?:/, 'not on pull requests nor on pushes to main');
  assert.ok(!fs.existsSync(path.join(ROOT, 'scripts/ci-changes.mjs')), 'no change detection: everything runs');
  // the tags' runs one at a time (#3124: two tags' runs together queued their jobs up to 50 minutes); a run by hand on its ref
  // (a third tag cancels the waiting run: the comment says so, and what to do)
  assert.match(ci, /a third tag pushed while one runs and one waits cancels the waiting one[\s\S]*?Re-run all jobs/);
  assert.match(ci, /^concurrency:\n  group: \$\{\{ github\.event_name == 'push' && 'ci-tags' \|\| github\.event_name == 'schedule' && 'ci-schedule' \|\| format\('ci-\{0\}-\{1\}', github\.ref, github\.sha\) \}\}\n  cancel-in-progress: false\n/m);
  const j = jobs(ci);
  assert.deepEqual(Object.keys(j), ['changes', 'unit', 'ui', 'webkit-standalone', 'release-zip', 'browsers', 'os', 'private-data-history', 'ci-ok', 'report']);
  const TESTS = Object.keys(j).filter(n => !['changes', 'ci-ok', 'report'].includes(n));
  // gated only by the change check (#3423), which never skips a tag's run or one by hand (scripts/changed-since-last-run.mjs)
  for (const name of TESTS)
    assert.deepEqual(j[name].filter(l => /^    (needs|if):/.test(l)), ['    needs: changes', "    if: needs.changes.outputs.run == 'true'"], `${name}: gated by the change check only`);
  // the unit tests on every system in parts of about the same time (#573), each Linux part's file times uploaded: on
  // Linux all of them in five parts, on macOS and Windows in three but the toolchain's heaviest (--light, #3124)
  const unit = j.unit.join('\n');
  assert.match(unit, /^        os: \[ubuntu-latest, macos-latest, windows-latest\]\n        shard: \[1, 2, 3, 4, 5\]\n        exclude:\n(?: {10}- \{ os: (?:macos|windows)-latest, shard: [45] \}\n){4}/m);
  for (const os of ['macos', 'windows']) for (const k of [4, 5]) assert.ok(unit.includes(`- { os: ${os}-latest, shard: ${k} }`), `${os} ${k}`);
  assert.match(unit, /^    name: unit \(\$\{\{ matrix\.os \}\}, \$\{\{ matrix\.shard \}\}\/\$\{\{ matrix\.os == 'ubuntu-latest' && 5 \|\| 3 \}\}\)$/m);
  assert.match(unit, /^ {10}SHARD: \$\{\{ matrix\.shard \}\}\n {10}PARTS: \$\{\{ matrix\.os == 'ubuntu-latest' && 5 \|\| 3 \}\}\n {10}LIGHT: \$\{\{ matrix\.os != 'ubuntu-latest' && '--light' \|\| '' \}\}$/m);
  assert.match(unit, /node scripts\/test-shard\.mjs "\$SHARD\/\$PARTS" \$LIGHT\n\s+--test-reporter=tap --test-reporter-destination=stdout\n\s+--test-reporter=\.\/scripts\/test-file-times\.mjs --test-reporter-destination=stdout\n\s+--test-reporter=\.\/scripts\/test-times-reporter\.mjs --test-reporter-destination=test-times\.json\n\s+shell: bash/);
  assert.match(unit, /- if: always\(\) && matrix\.os == 'ubuntu-latest'\n\s+uses: actions\/upload-artifact@.+\n\s+with:\n\s+name: unit-times-\$\{\{ matrix\.shard \}\}\n\s+path: test-times\.json\n/);
  assert.match(unit, /^    timeout-minutes: 90$/m, 'a part about 40 minutes since #3124 (before, up to 80 on macOS and Windows, #2665)');
  assert.doesNotMatch(unit, /--test-shard=/, "node's own shards split by order, not time");
  for (const t of ['docs', 'changelog', 'quality-page']) assert.ok(fs.existsSync(path.join(ROOT, `test/${t}.test.js`)), t);
  // the UI tests in both interfaces, each in three parts of about the same time, one file at a time (#912;
  // --test-concurrency=1 before the files: after them node --test took it for nothing), each part's file times uploaded
  const ui = j.ui.join('\n');
  assert.match(ui, /^        interface: \[silinx, ise\]\n        part: \[1, 2, 3\]$/m);
  assert.match(ui, /^    name: ui \(\$\{\{ matrix\.interface \}\}, \$\{\{ matrix\.part \}\}\/3\)$/m);
  assert.match(ui, /node scripts\/test-shard\.mjs "\$PART\/3" --ui --test-concurrency=1\n\s+--test-reporter=tap --test-reporter-destination=stdout\n\s+--test-reporter=\.\/scripts\/test-file-times\.mjs --test-reporter-destination=stdout\n\s+--test-reporter=\.\/scripts\/test-times-reporter\.mjs --test-reporter-destination=test-times\.json\n/);
  assert.match(ui, /^ {10}PART: \$\{\{ matrix\.part \}\}\n {10}CHROME_PATH: \/usr\/bin\/google-chrome\n {10}SILINX_UI_INTERFACE: \$\{\{ matrix\.interface == 'ise' && 'ise' \|\| '' \}\}$/m);
  assert.match(ui, /- if: always\(\)\n\s+uses: actions\/upload-artifact@.+\n\s+with:\n\s+name: ui-times-\$\{\{ matrix\.interface \}\}-\$\{\{ matrix\.part \}\}\n\s+path: test-times\.json\n/);
  assert.doesNotMatch(ui, /npm run test:ui/, 'the parts, not every file');
  assert.match(ui, /^ {8}timeout-minutes: 40$/m, 'a part takes up to 25 minutes on a slow runner (#2462)');
  assert.match(ui, /^    timeout-minutes: 45$/m, 'the job holds the step and its setup');
  // Firefox and WebKit, one after the other (#1126)
  const br = j.browsers.join('\n');
  // (past its steps' own: the install's 25 minutes, the tests' 40, #2939)
  assert.match(br, /^ {4}timeout-minutes: 70$/m);
  assert.match(br, /- run: npm run test:browsers\n {8}timeout-minutes: 40$/m);
  // WebKit's jobs on Ubuntu 24.04: Playwright's WebKit needs its libicu 74, ubuntu-latest (26.04) has 78 (#3854)
  for (const k of ['browsers', 'webkit-standalone']) assert.match(j[k].join('\n'), /^    runs-on: ubuntu-24\.04$/m, k);
  // the macOS and Windows smoke tests
  assert.ok(j.os.includes('        os: [macos-latest, windows-latest]'));
  // the history's private-data scan (#498, #555): the tagged commit's history, node's built-ins only
  const hist = j['private-data-history'].join('\n');
  assert.match(hist, /fetch-depth: 0[\s\S]*node scripts\/check-private-data\.mjs --history/);
  assert.doesNotMatch(hist, /npm ci/, 'only node built-ins');
  // ci-ok: every other job, run always, red only on a failure or a cancellation
  // (and the change check: a failed one never lets a tag's run through with its tests skipped, #3423)
  const ok = j['ci-ok'].join('\n');
  assert.match(ok, /^    if: always\(\) && github\.event_name != 'schedule'$/m);
  assert.equal(ok.match(/^    needs: \[(.*)\]$/m)[1], ['changes', ...TESTS].join(', '));
  assert.match(ok, /- if: contains\(needs\.\*\.result, 'failure'\) \|\| contains\(needs\.\*\.result, 'cancelled'\) \|\| contains\(needs\.\*\.result, 'skipped'\)\n\s+run: exit 1/);
  // the rules say so: no CI before the merge, the related tests locally (CLAUDE.md, ONBOARDING.md)
  for (const f of ['CLAUDE.md', 'ONBOARDING.md']) {
    assert.match(read(f), /CI runs at a release, and nightly on `?main`? when it changed\*\* \(#607, #3423\)/, f);
    assert.doesNotMatch(read(f), /CI runs at a release only/, f);
  }
});

test('CI nightly on main (#3423): after the Nightly, only when main changed, in a group of its own, its failures issues, nothing published', () => {
  const ci = read('.github/workflows/ci.yml');
  const j = jobs(ci);
  // at night, after the Nightly's 21:17 UTC
  const [, min, hour] = on(ci).match(/^    - cron: '(\d+) (\d+) \* \* \*'/m).map(Number);
  const [, nMin, nHour] = read('.github/workflows/nightly.yml').match(/^    - cron: '(\d+) (\d+) \* \* \*'/m).map(Number);
  assert.ok(hour * 60 + min > nHour * 60 + nMin, 'after the Nightly');
  // the change check of the other scheduled workflows, given this one's file
  assert.deepEqual(j.changes, ['    uses: ./.github/workflows/scheduled-changes.yml', '    permissions:', '      actions: read', '      contents: read', '    with:', '      workflow: ci.yml']);
  // its own concurrency group, neither the tags' nor a run by hand's (the group of each event, the expression's branches)
  const group = ci.match(/^concurrency:\n  group: \$\{\{ (.*) \}\}$/m)[1];
  const groupOf = event => [...group.matchAll(/github\.event_name == '(\w+)' && '([\w-]+)'/g)].find(m => m[1] === event)?.[2] ?? 'by hand';
  assert.equal(groupOf('push'), 'ci-tags');
  assert.equal(groupOf('schedule'), 'ci-schedule');
  assert.equal(groupOf('workflow_dispatch'), 'by hand');
  assert.match(ci, /^  cancel-in-progress: false$/m, 'a tag\'s run never cancelled');
  // a failed job an issue, as the Nightly's (#251): failure-report.yml, after every test job, on a schedule only;
  // ci-ok not run then (its failure would be one more issue)
  const report = j.report.join('\n');
  const tests = Object.keys(j).filter(n => !['ci-ok', 'report'].includes(n));
  assert.equal(report.match(/^    needs: \[(.*)\]$/m)[1], tests.join(', '));
  assert.match(report, /^    if: always\(\) && github\.event_name == 'schedule' && \(contains\(needs\.\*\.result, 'failure'\) \|\| contains\(needs\.\*\.result, 'cancelled'\)\)$/m);
  assert.match(report, /^    uses: \.\/\.github\/workflows\/failure-report\.yml$/m);
  assert.ok(j['ci-ok'].includes("    if: always() && github.event_name != 'schedule'"));
  // nothing published: a read-only token but the report's issues, no release, package, push or page
  assert.match(ci, /\npermissions:\n  contents: read\n(?! )/);
  for (const [name, lines] of Object.entries(j)) {
    const writes = lines.filter(l => /^ {6}[\w-]+: write$/.test(l)).map(l => l.trim());
    assert.deepEqual(writes, name === 'report' ? ['issues: write'] : [], name);
  }
  assert.doesNotMatch(ci.replace(/^\s*#.*$/gm, ''), /\bnpm publish\b|\bgh release\b|\bgit push\b|deploy-pages|upload-pages-artifact|GH_TOKEN|NODE_AUTH_TOKEN/);
  // and no workflow follows CI's runs: the Release and the toolchain's npm publishing wait for a tag's or a run by hand's
  // (scripts/wait-for-ci.mjs, test/wait-for-ci.test.js), never started by a run of CI
  for (const f of fs.readdirSync(path.join(ROOT, '.github/workflows')).filter(f => /\.ya?ml$/.test(f)))
    assert.doesNotMatch(read(`.github/workflows/${f}`), /workflow_run:\n\s+workflows: \[[^\]]*\bCI\b/, f);
});

test('CI at a release only: the development build and the site\'s dev/ after every push to main, not after CI (#607)', () => {
  const dev = read('.github/workflows/dev-release.yml');
  assert.equal(on(dev).replace(/^#.*\n/gm, ''), 'on:\n  push:\n    branches: [main]\n  workflow_dispatch:\n');
  assert.ok(jobs(dev).build.includes("    if: github.ref == 'refs/heads/main'"));
  assert.match(dev, /ref: \$\{\{ github\.sha \}\}/);
  assert.doesNotMatch(dev, /workflow_run/);
  const pages = read('.github/workflows/pages.yml');
  assert.equal(on(pages).replace(/^#.*\n/gm, ''), 'on:\n  push:\n    branches: [main]\n  workflow_run:\n    workflows: [Release]\n    types: [completed]\n  workflow_dispatch:\n');
  assert.match(pages, /ref: \$\{\{ github\.event_name == 'push' && github\.sha \|\| 'main' \}\}/);
  assert.match(pages, /github\.event_name != 'workflow_run' \|\| github\.event\.workflow_run\.conclusion == 'success'/);
});

test('the development builds read their changes\' issue labels (#707): issues: read, the token in the build step\'s env only', () => {
  for (const [f, step] of [['.github/workflows/pages.yml', 'Build the development edition (dev/)'], ['.github/workflows/dev-release.yml', 'Build the single-file edition']]) {
    const yml = read(f);
    assert.match(/\npermissions:\n((?: {2}.*\n)+)/.exec(yml)[1], /^ {2}issues: read$/m, f);
    const at = yml.indexOf(`- name: ${step}`), next = yml.indexOf('\n      - ', at + 1);
    assert.ok(at > 0, `${f}: ${step}`);
    assert.match(yml.slice(at, next), /\n {8}env:\n {10}GITHUB_TOKEN: \$\{\{ github\.token \}\}\n/, `${f}: the token in the step's env`);
    // the build's own variable in that step only (the other steps' GH_TOKEN is gh's)
    assert.equal(yml.match(/GITHUB_TOKEN:/g).length, 1, f);
  }
});

test('CodeQL (#498): a workflow of its own, nightly on main when its code changed, and at a release (#607); its token writes the findings only; its actions pinned', () => {
  const yml = read('.github/workflows/codeql.yml');
  assert.match(yml, /^on:\n  push:\n    tags: \['v\*'\]\n  schedule:\n    - cron: '\d+ \d+ \* \* \*' +# nightly.*\n  workflow_dispatch:\nconcurrency:\n  group: codeql-\$\{\{ github\.ref \}\}\n  cancel-in-progress: true\n/m);
  assert.doesNotMatch(yml, /pull_request|branches:/);
  assert.match(yml, /^permissions:\n  contents: read\n/m, 'a read-only token at the top');
  const j = jobs(yml);
  assert.deepEqual(Object.keys(j), ['changes', 'analyze', 'issues']);
  // each alert an issue after the analysis (#2021): its token reads the alerts and writes issues, nothing else
  const iss = j.issues.join('\n');
  assert.ok(j.issues.includes('    needs: analyze'));
  assert.match(iss, /^    permissions:\n      issues: write\n      security-events: read\s*(#.*)?\n    steps:/m);
  assert.match(iss, /persist-credentials: false\n\s+- run: node scripts\/codeql-issues\.mjs\n\s+env:\n\s+GITHUB_TOKEN: \$\{\{ github\.token \}\}$/);
  assert.doesNotMatch(iss, /npm ci|self-hosted/);
  // the nightly run skipped when none of the JavaScript changed since the last successful one
  const ch = j.changes.join('\n');
  assert.match(ch, /uses: \.\/\.github\/workflows\/scheduled-changes\.yml\n[\s\S]*workflow: codeql\.yml\n\s+only: core\/,packages\/,server\/,web\/,scripts\/,bin\/,test\/,\.github\/workflows\/codeql\.yml$/m);
  assert.ok(j.analyze.includes('    needs: changes') && j.analyze.includes("    if: needs.changes.outputs.run == 'true'"));
  const a = j.analyze.join('\n');
  assert.match(a, /^    permissions:\n      contents: read\n      security-events: write\s*(#.*)?\n      actions: read\s*(#.*)?\n/m);
  assert.match(a, /uses: github\/codeql-action\/init@[0-9a-f]{40} # v\d+\.\d+\.\d+\n[\s\S]*languages: javascript-typescript\n\s+build-mode: none\n/);
  const init = a.match(/codeql-action\/init@(.+)/)[1], analyze = a.match(/codeql-action\/analyze@(.+)/)[1];
  assert.match(init, /^[0-9a-f]{40} # v\d+\.\d+\.\d+$/, 'pinned by commit, its version in a comment (#414)');
  assert.equal(init, analyze, 'init and analyze at the same commit');
  assert.match(a, /paths-ignore:\n\s+- node_modules\n\s+- research\n/, 'the vendored data left out, nothing else');
  assert.doesNotMatch(a, /npm ci|runs-on: \[self-hosted/, "GitHub's runner, no install");
  // not a job of ci.yml, and the documentation says so
  assert.doesNotMatch(read('.github/workflows/ci.yml'), /codeql/i);
  for (const f of ['CLAUDE.md', 'ONBOARDING.md', 'SECURITY.md']) assert.match(read(f), /CodeQL/, f);
});

test('CI: WebKit and its system packages installed in a step of their own, its time apart from the tests\' (#1559)', () => {
  const w = jobs(read('.github/workflows/ci.yml'))['webkit-standalone'].join('\n');
  // (an install that stalls stopped at 10 minutes and run once more, within the step's 25, #2921)
  assert.match(w, /- name: WebKit and its system packages\n\s+run: \|\n(?:.*\n)*?\s+if timeout 10m npx playwright install --with-deps webkit; then .*\n(?:.*\n){3}\s+exit 1\n\s+timeout-minutes: 25\n/);
  assert.match(w, /- name: Memory in WebKit \(Safari's engine\)\n\s+run: npm run test:webkit\n\s+timeout-minutes: 15\n/);
  const job = +w.match(/^    timeout-minutes: (\d+)$/m)[1];
  assert.ok(job >= 25 + 15, `the job's ${job} minutes hold both steps`);
});

test('contributors from outside (#1872): the maintainer owns every file, merges and releases; a pull request template', () => {
  assert.match(read('.github/CODEOWNERS'), /^\* @pmnmalo$/m);
  const c = read('CONTRIBUTING.md');
  assert.match(c, /^## Contributing from outside$/m);
  assert.match(c, /\*\*Fork the repository\*\*/);
  assert.match(c, /\*\*The maintainer reviews, merges and releases\*\*/);
  assert.match(c, /\*\*A pull request that changes `\.github\/`\*\*[^]*reviewed before any of its runs/);
  // the rules the agents read say whose the merge is
  assert.match(read('CLAUDE.md'), /\*\*Merging is the maintainer's\*\*/);
  assert.doesNotMatch(read('CLAUDE.md'), /- \*\*Merging\*\*: when `related-tests` is green, merge it/);
  assert.match(read('ONBOARDING.md'), /\*\*Contributing from outside\*\*[^]*leave the merge, the labels and the releases/);
  // a code owner's review on main, the admin's bypass (#1888): the check green first, then --admin
  for (const f of ['CLAUDE.md', 'ONBOARDING.md']) {
    assert.match(read(f), /`gh pr checks <N> --required`[^]*`gh pr merge <N> --rebase --admin`/, f);
    assert.doesNotMatch(read(f), /`gh pr merge --rebase`/, f);
  }
  assert.match(read('CLAUDE.md'), /a code owner's approving review\n\s+\(`\.github\/CODEOWNERS`, #1888\) required to merge, which the admin bypasses/);
  // the template asks for what CLAUDE.md asks of every change
  const t = read('.github/pull_request_template.md');
  assert.match(t, /^Fixes #$/m);
  for (const s of ['regression test', 'both interfaces', 'warnings', 'changes/<issue>-<slug>.md', 'node scripts/related-tests.mjs origin/main HEAD'])
    assert.ok(t.includes(s), s);
});
