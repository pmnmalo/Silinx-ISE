// The UI harness's check of the npm dependencies (test/ui/harness.js missingDependencies): without
// node_modules (a fresh clone or worktree) the UI tests fail with "run npm ci", not with the page's
// errors (no CodeMirror: "Cannot read properties of undefined (reading 'fold')" with CodeMirror 5, #64).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { missingDependencies, dependenciesMessage, setupUi, ROOT } from './ui/harness.js';

test('missingDependencies: the package.json dependencies not in node_modules', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-deps-'));
  try {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { codemirror: '^5', elkjs: '^0.9', '@yowasp/yosys': '1' }, devDependencies: { playwright: '1' } }));
    assert.deepEqual(missingDependencies(root), ['codemirror', 'elkjs', '@yowasp/yosys']);
    // a package is there when its package.json is (an empty folder is not an installed package)
    fs.mkdirSync(path.join(root, 'node_modules', 'codemirror'), { recursive: true });
    fs.writeFileSync(path.join(root, 'node_modules', 'codemirror', 'package.json'), '{}');
    fs.mkdirSync(path.join(root, 'node_modules', '@yowasp', 'yosys'), { recursive: true });
    assert.deepEqual(missingDependencies(root), ['elkjs', '@yowasp/yosys']);
    fs.writeFileSync(path.join(root, 'node_modules', '@yowasp', 'yosys', 'package.json'), '{}');
    fs.mkdirSync(path.join(root, 'node_modules', 'elkjs'));
    fs.writeFileSync(path.join(root, 'node_modules', 'elkjs', 'package.json'), '{}');
    assert.deepEqual(missingDependencies(root), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  assert.equal(dependenciesMessage(['codemirror', 'elkjs']), 'UI tests: npm dependencies missing from node_modules or out of date (codemirror, elkjs): run npm ci');
});

// (#2649: a worktree's node_modules from an older main, nextpnr 0.13.0 where the lockfile has 0.15.0, made the browser
// edition's Back-annotate Pin Locations test time out after 120 s instead of saying "run npm ci")
test('missingDependencies: a dependency installed at another version than package-lock.json\'s (#2649)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-deps-'));
  const install = (d, version) => {
    fs.mkdirSync(path.join(root, 'node_modules', d), { recursive: true });
    fs.writeFileSync(path.join(root, 'node_modules', d, 'package.json'), JSON.stringify({ name: d, version }));
  };
  try {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { '@silinx/nextpnr-himbaechel-spartan3e': '^0.15.0', elkjs: '^0.12.0', express: '^5' } }));
    install('@silinx/nextpnr-himbaechel-spartan3e', '0.13.0');
    install('elkjs', '0.12.0');
    install('express', '5.3.0');
    // no lockfile: present is enough
    assert.deepEqual(missingDependencies(root), []);
    // the lockfile's versions (express not in it: present is enough)
    fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ packages: { '': {}, 'node_modules/@silinx/nextpnr-himbaechel-spartan3e': { version: '0.15.0' }, 'node_modules/elkjs': { version: '0.12.0' } } }));
    assert.deepEqual(missingDependencies(root), ['@silinx/nextpnr-himbaechel-spartan3e 0.13.0, not 0.15.0']);
    assert.equal(dependenciesMessage(missingDependencies(root)),
      'UI tests: npm dependencies missing from node_modules or out of date (@silinx/nextpnr-himbaechel-spartan3e 0.13.0, not 0.15.0): run npm ci');
    install('@silinx/nextpnr-himbaechel-spartan3e', '0.15.0');
    assert.deepEqual(missingDependencies(root), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  // the repository's own node_modules (npm ci) are the lockfile's
  assert.deepEqual(missingDependencies(), []);
});

test('setupUi fails with "run npm ci" when the dependencies are missing (before any browser or server)', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-deps-'));
  try {
    fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(root, 'package.json'));
    // (all of them: the editor's CodeMirror packages, @yowasp/yosys, elkjs, express)
    const deps = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).dependencies);
    assert.ok(['@codemirror/view', '@yowasp/yosys', 'elkjs', 'express'].every(d => deps.includes(d)), deps.join(', '));
    await assert.rejects(setupUi({ root }), { message: dependenciesMessage(deps) });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
