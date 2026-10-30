// The toolchain package's npm publishing (#1681, step 10 of #1651): .github/workflows/silinx-fpga-release.yml, from
// the package's own tag silinx-fpga-v*, once CI (started by the same tag) has passed on the tagged commit of main,
// its version the tag's with its changelog section, with npm's provenance and the permissions that needs, no more.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const yml = read('.github/workflows/silinx-fpga-release.yml');
const steps = yml.slice(yml.indexOf('\n    steps:\n')).split(/\n(?= {6}- )/).slice(1);
const step = (re) => { const i = steps.findIndex(s => re.test(s)); assert.ok(i >= 0, String(re)); return [i, steps[i]]; };

test('#1681 silinx-fpga release: on its own tag only, with the permissions of the provenance and no more', () => {
  assert.match(yml, /\non:\n {2}push:\n {4}tags: \['silinx-fpga-v\*'\]\npermissions:\n/);
  const perms = /\npermissions:\n((?: {2}.*\n)+)/.exec(yml)[1].replace(/ *#.*$/gm, '').trim().split('\n').map(l => l.trim());
  assert.deepEqual(perms, ['actions: read', 'contents: read', 'id-token: write']);
  assert.equal(yml.match(/permissions:/g).length, 1);
  // the IDE's tags are not its, nor its the IDE's (release.yml, pages.yml: v followed by a digit)
  assert.match(read('.github/workflows/release.yml'), /\n {4}tags: \['v\*'\]\n/);
  assert.ok(!/^v/.test('silinx-fpga-v0.1.0'));
  // CI runs on its tag too, and the wait accepts that run (test/wait-for-ci.test.js)
  assert.match(read('.github/workflows/ci.yml'), /\n {4}tags: \['v\*', 'silinx-fpga-v\*'\]\n/);
});

test('#1681 silinx-fpga release: the commit on main, its version and changelog, CI passed, then published', () => {
  const [checkout, checkoutStep] = step(/uses: actions\/checkout@/);
  assert.match(checkoutStep, /fetch-depth: 0\n {10}persist-credentials: false/);
  const [main] = step(/run: git merge-base --is-ancestor "\$GITHUB_SHA" origin\/main/);
  const [setup] = step(/uses: \.\/\.github\/actions\/setup/);
  const [version, versionStep] = step(/name: The tag's version, with its changelog\n/);
  assert.match(versionStep, /V="\$\{GITHUB_REF_NAME#silinx-fpga-v\}"/);
  assert.match(versionStep, /require\('\.\/packages\/silinx-fpga\/package\.json'\)\.version/);
  assert.match(versionStep, /node scripts\/sync-version\.mjs --package silinx-fpga\n/);
  const [ci, ciStep] = step(/name: CI passed\n/);
  assert.match(ciStep, /run: node scripts\/wait-for-ci\.mjs "\$GITHUB_SHA" --timeout (\d+) --appear \d+\n\s+env:\n\s+GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  const wait = +/--timeout (\d+)/.exec(ciStep)[1], job = +/\n {4}timeout-minutes: (\d+)\n/.exec(yml)[1];
  assert.ok(job >= wait + 10, `${job} >= ${wait} + 10`);
  const [publish, publishStep] = step(/name: Publish\n/);
  assert.deepEqual([checkout, main, setup, version, ci, publish], [0, 1, 2, 3, 4, 5]);
  assert.equal(publish, steps.length - 1);
  assert.match(publishStep, /npm publish -w silinx-fpga --provenance --access public --ignore-scripts\n/);
  // the token from the secret, through the environment: the npmrc names the variable, never its value
  assert.match(publishStep, /echo '\/\/registry\.npmjs\.org\/:_authToken=\$\{NODE_AUTH_TOKEN\}' > "\$RUNNER_TEMP\/\.npmrc"/);
  assert.match(publishStep, /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}\n/);
  assert.equal(yml.match(/secrets\./g).length, 1);
  // the tests are CI's, not run again here; no GitHub Release (the Pages site serves the IDE's latest)
  assert.doesNotMatch(yml, /npm test\b|gh release/);
});

test('#1681 silinx-fpga release: the package is publishable, its version with its changelog section', () => {
  const pkg = JSON.parse(read('packages/silinx-fpga/package.json'));
  assert.equal(pkg.private, undefined);
  assert.deepEqual(pkg.publishConfig, { access: 'public', provenance: true });
  // npm publish -w silinx-fpga names it: the workspace's name
  assert.equal(pkg.name, 'silinx-fpga');
  // what the workflow's version step runs, here: the version read as it reads it, and sync-version --package's verdict
  const r = spawnSync(process.execPath, ['-p', "require('./packages/silinx-fpga/package.json').version"], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.stdout.trim(), pkg.version);
  const s = spawnSync(process.execPath, ['scripts/sync-version.mjs', '--package', 'silinx-fpga'], { cwd: ROOT, encoding: 'utf8' });
  const changelog = read('packages/silinx-fpga/CHANGELOG.md');
  if (changelog.includes(`\n## ${pkg.version}\n`)) assert.equal(s.status, fs.readdirSync(path.join(ROOT, 'packages/silinx-fpga/changes')).some(f => f !== 'README.md') ? 1 : 0);
  else assert.match(s.stderr, new RegExp(`packages/silinx-fpga/CHANGELOG\\.md has no "## ${pkg.version.replace(/\./g, '\\.')}" section`));
});
