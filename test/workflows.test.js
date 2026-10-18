// The workflows' hardening (the CI audit of 2026-10-17): what each job may do with its token, and what the
// self-hosted runner (the ISE machine) runs with.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, '.github/workflows');
const FILES = fs.readdirSync(DIR).filter(f => f.endsWith('.yml')).sort();
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');

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
      const checkouts = body.match(/uses: actions\/checkout@\S+/g) || [];
      assert.ok(checkouts.length, `${f}:${name}`);
      assert.equal((body.match(/uses: actions\/checkout@\S+\n\s+with:\n(?:\s+\w[\w-]*: .*\n)*?\s+persist-credentials: false/g) || []).length, checkouts.length, `${f}:${name} persist-credentials: false`);
      assert.doesNotMatch(body, /git push|GITHUB_TOKEN|GH_TOKEN|github\.token/, `${f}:${name} no token used`);
    }
  }
  assert.deepEqual(selfHosted, ['ise.yml:ise', 'quality.yml:compare']);
});

test('workflows: the weekly comparison\'s results pushed from GitHub\'s runner, after a passing comparison (#412)', () => {
  const j = jobs(read('quality.yml'));
  const publish = j.publish.join('\n');
  assert.match(publish, /^ {4}needs: compare$/m);
  assert.doesNotMatch(publish, /^ {4}if:/m, 'only when compare passed (its --guard)');
  assert.match(publish, /^ {4}runs-on: ubuntu-latest$/m);
  assert.deepEqual(permissions(j.publish), { contents: 'write' });
  assert.match(publish, /uses: actions\/download-artifact@\S+\n\s+with:\n\s+name: quality-results/);
  assert.match(publish, /git push -q -f origin HEAD:refs\/heads\/quality-results/);
  // the artifact the compare job uploads holds the files the publish job commits
  const compare = j.compare.join('\n');
  assert.match(compare, /- if: always\(\)\n\s+uses: actions\/upload-artifact@\S+\n\s+with:\n\s+name: quality-results\n\s+path: \|\n\s+test\/designs-corpus\/ise-comparison\.json\n\s+docs\/QUALITY\.md/);
  for (const f of ['test/designs-corpus/ise-comparison.json', 'docs/QUALITY.md']) assert.match(publish, new RegExp(`git add .*${f.replace(/[./]/g, '\\$&')}`), f);
  assert.match(compare, /compare-ise\.mjs .* --guard/);
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
    assert.match(yml.slice(0, yml.indexOf('\njobs:\n')), /^permissions:\n {2}[\w-]+: (read|write)$/m, `${f}: permissions`);
    // a value goes into a script through env:, never pasted into it (an injection: a pull request's package.json,
    // an input typed by hand)
    for (const { line, script } of runScripts(yml)) assert.doesNotMatch(script, /\$\{\{/, `${f}:${line}`);
  }
  for (const f of ['ci.yml', 'nightly.yml']) assert.match(read(f), /\npermissions:\n {2}contents: read\n/, f);
});
