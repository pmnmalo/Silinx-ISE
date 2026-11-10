// The Release workflow's checksums and build provenance (#485): SHA256SUMS written with the packages and
// published among them and in the notes, the files attested by GitHub (actions/attest-build-provenance)
// before they are published, with the permissions that needs and no more, in a job that runs no code of the
// repository or of its dependencies (#2644).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { jobsOf, stepsOf, jobPermissions } from './workflows-lib.mjs';

const ROOT = path.join(import.meta.dirname, '..');
const yml = fs.readFileSync(path.join(ROOT, '.github/workflows/release.yml'), 'utf8');
const jobs = jobsOf(yml);
const stepIn = (job) => {
  const steps = stepsOf(jobs[job]);
  return (re) => { const i = steps.findIndex(s => re.test(s)); assert.ok(i >= 0, `${job}: ${re}`); return [i, steps[i], steps.length]; };
};

test('release workflow: on a tag push only; the build reads, the attestation\'s and the release\'s permissions are the publish job\'s (#2644)', () => {
  assert.match(yml, /\non:\n {2}push:\n {4}tags: \['v\*'\]\npermissions:\n/);
  const perms = /\npermissions:\n((?: {2}.*\n)+)/.exec(yml)[1].replace(/ *#.*$/gm, '').trim().split('\n').map(l => l.trim());
  assert.deepEqual(perms, ['actions: read', 'contents: read']);
  assert.deepEqual(Object.keys(jobs), ['build', 'publish']);
  assert.deepEqual(jobPermissions(yml, jobs.build), { actions: 'read', contents: 'read' });
  assert.deepEqual(jobPermissions(yml, jobs.publish), { attestations: 'write', contents: 'write', 'id-token': 'write' });
});

test('release workflow: packaged (with SHA256SUMS), checked, the notes written; then attested and published with the checksums in the notes', () => {
  const step = stepIn('build');
  const [pkg, pkgStep] = step(/name: Package\n/);
  assert.match(pkgStep, /run: node scripts\/package-release\.mjs "\$\{GITHUB_REF_NAME#v\}" --out out/);
  assert.match(fs.readFileSync(path.join(ROOT, 'scripts/package-release.mjs'), 'utf8'), /\nfs\.writeFileSync\(path\.join\(out, SUMS_FILE\), sha256sums\(made\)\);\n/);
  const [check] = step(/run: npm run test:release\n/);
  const [notes, notesStep] = step(/name: Notes\n/);
  assert.match(notesStep, /node scripts\/release-notes\.mjs "\$\{GITHUB_REF_NAME#v\}" --require --sums out\/SHA256SUMS > notes\.md(\n|$)/);
  const [upload, uploadStep, n] = step(/uses: actions\/upload-artifact@[0-9a-f]{40} /);
  assert.match(uploadStep, /name: release\n {10}path: \|\n {12}out\n {12}notes\.md\n/);
  assert.ok(pkg < check && check < notes && notes < upload && upload === n - 1, 'package, check, notes, upload');
  // the publish job runs nothing of the repository nor of its dependencies: no checkout, no npm, no script
  assert.match(jobs.publish, /^ {4}needs: build$/m);
  assert.doesNotMatch(jobs.publish, /actions\/checkout|\.\/\.github\/actions|\bnpm\b|\bnode\b|scripts\//);
  const pub = stepIn('publish');
  const [download, downloadStep] = pub(/uses: actions\/download-artifact@[0-9a-f]{40} /);
  assert.match(downloadStep, /name: release(\n|$)/);
  const [attest, attestStep] = pub(/name: Build provenance\n/);
  assert.match(attestStep, /uses: actions\/attest-build-provenance@[0-9a-f]{40} # v\d+\.\d+\.\d+\n {8}with:\n {10}subject-checksums: out\/SHA256SUMS\n?$/);
  const [publish, publishStep, m] = pub(/name: Publish\n/);
  assert.ok(download < attest && attest < publish && publish === m - 1, 'download, attest, publish');
  // out/* holds SHA256SUMS: it is a file of the release
  assert.match(publishStep, /GH_REPO: \$\{\{ github\.repository \}\}/);
  assert.match(publishStep, /gh release create "\$GITHUB_REF_NAME" out\/\* --title "Silinx \$V" --notes-file notes\.md/);
});

test('docs: how to check a download (README, docs/)', () => {
  for (const f of ['README.md', 'docs/GETTING-STARTED.md', 'docs/COMECAR.md']) {
    const md = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const s of ['SHA256SUMS', 'sha256sum -c SHA256SUMS --ignore-missing', 'gh attestation verify']) assert.ok(md.includes(s), `${f}: ${s}`);
  }
});
