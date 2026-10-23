// CI at a release only (#607): .github/workflows/ci.yml on a version tag and by hand, never on a pull
// request or a push to main; everything it runs, and ci-ok, the verdict the Release workflow waits for.
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

test('CI: at a release only (a tag v*) and by hand; every job, none gated; ci-ok needs them all', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.equal(on(ci).replace(/^#.*\n/gm, ''), "on:\n  push:\n    tags: ['v*']\n  workflow_dispatch:\n");
  assert.doesNotMatch(ci, /pull_request|branches:|paths(-ignore)?:/, 'not on pull requests nor on pushes to main');
  assert.ok(!fs.existsSync(path.join(ROOT, 'scripts/ci-changes.mjs')), 'no change detection: everything runs');
  assert.match(ci, /^concurrency:\n  group: ci-\$\{\{ github\.ref \}\}-\$\{\{ github\.sha \}\}\n  cancel-in-progress: false\n/m);
  const j = jobs(ci);
  assert.deepEqual(Object.keys(j), ['unit', 'ui', 'webkit-standalone', 'release-zip', 'browsers', 'os', 'private-data-history', 'ci-ok']);
  for (const [name, lines] of Object.entries(j)) {
    if (name === 'ci-ok') continue;
    assert.ok(!lines.some(l => /^    (needs|if):/.test(l)), `${name}: not gated`);
  }
  // the unit tests on every system, in three parts of about the same time (#573), each Linux part's file times uploaded
  const unit = j.unit.join('\n');
  assert.match(unit, /^        os: \[ubuntu-latest, macos-latest, windows-latest\]\n        shard: \[1, 2, 3\]$/m);
  assert.match(unit, /node scripts\/test-shard\.mjs "\$SHARD\/3"\n\s+--test-reporter=tap --test-reporter-destination=stdout\n\s+--test-reporter=\.\/scripts\/test-file-times\.mjs --test-reporter-destination=stdout\n\s+--test-reporter=\.\/scripts\/test-times-reporter\.mjs --test-reporter-destination=test-times\.json\n\s+shell: bash/);
  assert.match(unit, /- if: always\(\) && matrix\.os == 'ubuntu-latest'\n\s+uses: actions\/upload-artifact@.+\n\s+with:\n\s+name: unit-times-\$\{\{ matrix\.shard \}\}\n\s+path: test-times\.json\n/);
  assert.doesNotMatch(unit, /--test-shard=/, "node's own shards split by order, not time");
  for (const t of ['docs', 'changelog', 'quality-page']) assert.ok(fs.existsSync(path.join(ROOT, `test/${t}.test.js`)), t);
  // the UI tests in both interfaces, each in three parts of about the same time, one file at a time (#912;
  // --test-concurrency=1 before the files: after them node --test took it for nothing), each part's file times uploaded
  const ui = j.ui.join('\n');
  assert.match(ui, /^        interface: \[modern, classic\]\n        part: \[1, 2, 3\]$/m);
  assert.match(ui, /^    name: ui \(\$\{\{ matrix\.interface \}\}, \$\{\{ matrix\.part \}\}\/3\)$/m);
  assert.match(ui, /node scripts\/test-shard\.mjs "\$PART\/3" --ui --test-concurrency=1\n\s+--test-reporter=tap --test-reporter-destination=stdout\n\s+--test-reporter=\.\/scripts\/test-file-times\.mjs --test-reporter-destination=stdout\n\s+--test-reporter=\.\/scripts\/test-times-reporter\.mjs --test-reporter-destination=test-times\.json\n/);
  assert.match(ui, /^ {10}PART: \$\{\{ matrix\.part \}\}\n {10}CHROME_PATH: \/usr\/bin\/google-chrome\n {10}SILINX_UI_INTERFACE: \$\{\{ matrix\.interface == 'classic' && 'classic' \|\| '' \}\}$/m);
  assert.match(ui, /- if: always\(\)\n\s+uses: actions\/upload-artifact@.+\n\s+with:\n\s+name: ui-times-\$\{\{ matrix\.interface \}\}-\$\{\{ matrix\.part \}\}\n\s+path: test-times\.json\n/);
  assert.doesNotMatch(ui, /npm run test:ui/, 'the parts, not every file');
  assert.match(ui, /^ {8}timeout-minutes: 25$/m);
  // Firefox and WebKit, one after the other (#1126)
  const br = j.browsers.join('\n');
  assert.match(br, /^ {4}timeout-minutes: 60$/m);
  assert.match(br, /- run: npm run test:browsers\n {8}timeout-minutes: 40$/m);
  // the macOS and Windows smoke tests
  assert.ok(j.os.includes('        os: [macos-latest, windows-latest]'));
  // the history's private-data scan (#498, #555): the tagged commit's history, node's built-ins only
  const hist = j['private-data-history'].join('\n');
  assert.match(hist, /fetch-depth: 0[\s\S]*node scripts\/check-private-data\.mjs --history/);
  assert.doesNotMatch(hist, /npm ci/, 'only node built-ins');
  // ci-ok: every other job, run always, red only on a failure or a cancellation
  const ok = j['ci-ok'].join('\n');
  assert.match(ok, /^    if: always\(\)$/m);
  assert.equal(ok.match(/^    needs: \[(.*)\]$/m)[1], Object.keys(j).filter(n => n !== 'ci-ok').join(', '));
  assert.match(ok, /- if: contains\(needs\.\*\.result, 'failure'\) \|\| contains\(needs\.\*\.result, 'cancelled'\)\n\s+run: exit 1/);
  // the rules say so: no CI before the merge, the related tests locally (CLAUDE.md, ONBOARDING.md)
  for (const f of ['CLAUDE.md', 'ONBOARDING.md']) assert.match(read(f), /CI runs at a release only/, f);
});

test('CI at a release only: the development build and the site\'s dev/ after every push to main, not after CI (#607)', () => {
  const dev = read('.github/workflows/dev-release.yml');
  assert.equal(on(dev).replace(/^#.*\n/gm, ''), 'on:\n  push:\n    branches: [main]\n  workflow_dispatch:\n');
  assert.ok(jobs(dev).dev.includes("    if: github.ref == 'refs/heads/main'"));
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
  assert.deepEqual(Object.keys(j), ['changes', 'analyze']);
  // the nightly run skipped when none of the JavaScript changed since the last successful one
  const ch = j.changes.join('\n');
  assert.match(ch, /uses: \.\/\.github\/workflows\/scheduled-changes\.yml\n[\s\S]*workflow: codeql\.yml\n\s+only: core\/,server\/,web\/,scripts\/,bin\/,test\/,\.github\/workflows\/codeql\.yml$/m);
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
