// The toolchain package's npm publishing (#1681, step 10 of #1651): .github/workflows/silinx-fpga-release.yml, from
// the package's own tag silinx-fpga-v*, once CI (started by the same tag) has passed on the tagged commit of main,
// its version the tag's with its changelog section, with npm's provenance and the permissions that needs, no more.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { jobsOf, stepsOf, jobPermissions } from './workflows-lib.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const yml = read('.github/workflows/silinx-fpga-release.yml');
const jobs = jobsOf(yml);
const stepIn = (job) => {
  const steps = stepsOf(jobs[job]);
  return (re) => { const i = steps.findIndex(s => re.test(s)); assert.ok(i >= 0, `${job}: ${re}`); return [i, steps[i], steps.length]; };
};

test('#1681 silinx-fpga release: on its own tag only, with the permissions of the provenance and no more', () => {
  assert.match(yml, /\non:\n {2}push:\n {4}tags: \['silinx-fpga-v\*'\]\npermissions:\n/);
  const perms = /\npermissions:\n((?: {2}.*\n)+)/.exec(yml)[1].replace(/ *#.*$/gm, '').trim().split('\n').map(l => l.trim());
  assert.deepEqual(perms, ['actions: read', 'contents: read']);
  // two jobs (#2644): the build reads; the OIDC token is the publish job's only
  assert.deepEqual(Object.keys(jobs), ['build', 'publish']);
  assert.deepEqual(jobPermissions(yml, jobs.build), { actions: 'read', contents: 'read' });
  assert.deepEqual(jobPermissions(yml, jobs.publish), { 'id-token': 'write' });
  // the IDE's tags are not its, nor its the IDE's (release.yml, pages.yml: v followed by a digit)
  assert.match(read('.github/workflows/release.yml'), /\n {4}tags: \['v\*'\]\n/);
  assert.ok(!/^v/.test('silinx-fpga-v0.1.0'));
  // CI runs on its tag too, and the wait accepts that run (test/wait-for-ci.test.js)
  assert.match(read('.github/workflows/ci.yml'), /\n {4}tags: \['v\*', 'silinx-fpga-v\*'\]\n/);
});

test('#1681 silinx-fpga release: the commit on main, its version and changelog, CI passed, packed; then published from the tarball', () => {
  const step = stepIn('build');
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
  const wait = +/--timeout (\d+)/.exec(ciStep)[1], job = +/\n {4}timeout-minutes: (\d+)\n/.exec(jobs.build)[1];
  assert.ok(job >= wait + 10, `${job} >= ${wait} + 10`);
  const [pack, packStep] = step(/name: Pack\n/);
  assert.match(packStep, /npm pack -w silinx-fpga --ignore-scripts --pack-destination out/);
  const [upload, uploadStep, n] = step(/uses: actions\/upload-artifact@[0-9a-f]{40} /);
  assert.match(uploadStep, /name: silinx-fpga\n {10}path: out(\n|$)/);
  assert.deepEqual([checkout, main, setup, version, ci, pack, upload], [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(upload, n - 1);
  // the publish job: no checkout, no dependency installed, nothing of the repository run: npm on the tarball
  const pub = stepIn('publish');
  assert.match(jobs.publish, /^ {4}needs: build$/m);
  assert.doesNotMatch(jobs.publish, /actions\/checkout|\.\/\.github\/actions|npm ci|scripts\//);
  const [, download] = pub(/uses: actions\/download-artifact@[0-9a-f]{40} /);
  assert.match(download, /name: silinx-fpga\n {10}path: out(\n|$)/);
  const [publish, publishStep, m] = pub(/name: Publish\n/);
  assert.equal(publish, m - 1);
  // the tarball by its path, ./ first: npm takes out/silinx-fpga-0.3.0.tgz for a GitHub repository (owner/repo) and
  // runs git ls-remote on it (#2915)
  assert.match(publishStep, /npm publish \.\/out\/silinx-fpga-\*\.tgz --provenance --access public --ignore-scripts\n/);
  assert.doesNotMatch(publishStep, /npm publish (?!\.\/|\/)/, 'npm publish of a relative path without ./');
  // npm's trusted publishing (#2428): GitHub's OIDC token, no secret, no npmrc; npm 11.5.1 or later, pinned by its
  // tarball's integrity (#3049): the registry's tarball downloaded, checked, installed from the file checked, then the publish
  assert.doesNotMatch(yml, /secrets\.|NODE_AUTH_TOKEN|_authToken|npmrc/i);
  const npm = new RegExp(String.raw`\n {8}env:\n {10}NPM_TARBALL: https://registry\.npmjs\.org/npm/-/npm-(\d+)\.(\d+)\.(\d+)\.tgz\n {10}NPM_INTEGRITY: (sha512-[A-Za-z0-9+/]{86}==)\n {8}run: \|\n`
    + String.raw` {10}curl -fsSL -o "\$RUNNER_TEMP/npm\.tgz" "\$NPM_TARBALL"\n`
    + String.raw` {10}test "sha512-\$\(openssl dgst -sha512 -binary "\$RUNNER_TEMP/npm\.tgz" \| base64 -w0\)" = "\$NPM_INTEGRITY" \|\| \{ echo "::error::.*"; exit 1; \}\n`
    + String.raw` {10}npm install --global "\$RUNNER_TEMP/npm\.tgz" --ignore-scripts --no-audit --no-fund\n {10}npm publish `).exec(publishStep);
  assert.ok(npm, 'npm downloaded, checked against its integrity, installed from that file, then the publish');
  assert.doesNotMatch(jobs.publish, /npm install --global npm@/, 'not npm from the registry by its version alone');
  const [maj, min, pat] = npm.slice(1, 4).map(Number);
  assert.ok(maj > 11 || (maj === 11 && (min > 5 || (min === 5 && pat >= 1))), npm.slice(1).join('.'));
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
  else assert.ok(s.stderr.includes(`packages/silinx-fpga/CHANGELOG.md has no "## ${pkg.version}" section`));
});
