// The version of a package the toolchain loads (#3156): scripts/resolved-package.mjs, which the nextpnr and Yosys update
// workflows run after installing the base's package, on a workspace laid out as npm leaves it (the root's copy, a nested
// one in packages/silinx-fpga/node_modules), with no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { splitSpec, specVersion, resolvedPackage, checkResolved } from '../scripts/resolved-package.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'resolved-package.mjs');
const S3E = '@silinx/nextpnr-himbaechel-spartan3e', S6 = '@silinx/nextpnr-himbaechel-spartan6';
const url = v => `https://github.com/pmnmalo/nextpnr-spartan/releases/download/spartan6-v${v}/silinx-nextpnr-himbaechel-spartan6-${v}.tgz`;

// a workspace: the root's packages, the toolchain's declared versions, its nested copies; the packages' exports leave out
// ./package.json, as nextpnr's do
function workspace({ root = {}, nested = {}, declared = {} }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-resolved-'));
  const put = (base, name, version) => {
    const d = path.join(base, 'node_modules', ...name.split('/'));
    fs.mkdirSync(path.join(d, 'gen'), { recursive: true });
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name, version, exports: { types: './lib/api.d.ts', default: './gen/bundle.js' } }));
    fs.writeFileSync(path.join(d, 'gen', 'bundle.js'), '');
  };
  const fpga = path.join(dir, 'packages', 'silinx-fpga');
  fs.mkdirSync(fpga, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'root', workspaces: ['packages/*'] }));
  fs.writeFileSync(path.join(fpga, 'package.json'), JSON.stringify({ name: 'silinx-fpga', dependencies: declared }));
  for (const [n, v] of Object.entries(root)) put(dir, n, v);
  for (const [n, v] of Object.entries(nested)) put(fpga, n, v);
  return { dir, fpga };
}

test('resolved package: a spec split at its version\'s @, a scope\'s kept', () => {
  assert.deepEqual(splitSpec(`${S3E}@1.4.1`), { name: S3E, spec: '1.4.1' });
  assert.deepEqual(splitSpec(S3E), { name: S3E, spec: null });
  assert.deepEqual(splitSpec(`${S6}@${url('0.2.0')}`), { name: S6, spec: url('0.2.0') });
  assert.deepEqual(splitSpec('left-pad@1.3.0'), { name: 'left-pad', spec: '1.3.0' });
  assert.deepEqual(splitSpec('left-pad'), { name: 'left-pad', spec: null });
});

test('resolved package: the exact version a spec installs, none for a range, a tag or an alias', () => {
  assert.equal(specVersion('1.4.2'), '1.4.2');
  assert.equal(specVersion('0.70.1258'), '0.70.1258');
  assert.equal(specVersion(url('0.3.0')), '0.3.0');
  for (const s of ['^1.4.2', '~1.4', 'latest', 'npm:evil@1.0.0', '', null, undefined, 'https://example.org/x.tgz']) assert.equal(specVersion(s), null, String(s));
});

test('resolved package: the nested copy first from the toolchain, the root\'s from the root; a package with no ./package.json export', () => {
  const { dir, fpga } = workspace({ root: { [S3E]: '1.4.1' }, nested: { [S3E]: '1.4.2' } });
  assert.deepEqual(resolvedPackage(S3E, fpga), { dir: path.join(fs.realpathSync(fpga), 'node_modules', '@silinx', 'nextpnr-himbaechel-spartan3e'), version: '1.4.2' });
  assert.equal(resolvedPackage(S3E, dir).version, '1.4.1');
  assert.equal(resolvedPackage(S6, fpga), null);
  // no nested copy: the root's, from both
  const w = workspace({ root: { [S3E]: '1.4.1' } });
  assert.equal(resolvedPackage(S3E, w.fpga).version, '1.4.1');
});

test('resolved package: the base\'s version installed at the root only, the pull request\'s nested, is an error (#3156)', () => {
  const { dir, fpga } = workspace({ root: { [S3E]: '1.4.1', [S6]: '0.2.0' }, nested: { [S3E]: '1.4.2', [S6]: '0.3.0' }, declared: { [S3E]: '1.4.2', [S6]: url('0.3.0') } });
  const r = checkResolved(fpga, [S3E, S6, `${S3E}@1.4.1`, `${S6}@${url('0.2.0')}`], dir);
  assert.equal(r.ok, false);
  assert.deepEqual(r.lines, [
    `error: ${S3E} 1.4.2 (packages/silinx-fpga), 1.4.1 (root), expected 1.4.1`,
    `error: ${S6} 0.3.0 (packages/silinx-fpga), 0.2.0 (root), expected 0.2.0`,
  ]);
});

test('resolved package: the base\'s version from both, and the head\'s as the toolchain declares it, are no error', () => {
  const base = workspace({ root: { [S3E]: '1.4.1', [S6]: '0.3.0' }, declared: { [S3E]: '1.4.2', [S6]: url('0.3.0') } });
  const r = checkResolved(base.fpga, [S3E, S6, `${S3E}@1.4.1`], base.dir);
  assert.deepEqual(r, { ok: true, lines: [`${S3E} 1.4.1 (packages/silinx-fpga), 1.4.1 (root), expected 1.4.1`, `${S6} 0.3.0 (packages/silinx-fpga), 0.3.0 (root), expected 0.3.0`] });
  // the head's side: what packages/silinx-fpga/package.json asks for
  const head = workspace({ root: { [S3E]: '1.4.2', [S6]: '0.3.0' }, declared: { [S3E]: '1.4.2', [S6]: url('0.3.0') } });
  assert.equal(checkResolved(head.fpga, [S3E, S6], head.dir).ok, true);
  assert.equal(checkResolved(base.fpga, [S3E], base.dir).ok, false, 'the head\'s expected, the base\'s resolved');
});

test('resolved package: a package not installed, not declared, or declared by a range is an error', () => {
  const { dir, fpga } = workspace({ root: { [S3E]: '1.4.2' }, declared: { [S3E]: '^1.4.2' } });
  assert.deepEqual(checkResolved(fpga, [S6, `${S6}@0.3.0`], dir).lines, [`error: ${S6} not found (packages/silinx-fpga), not found (root), expected 0.3.0`]);
  assert.deepEqual(checkResolved(fpga, [S3E], dir).lines, [`error: ${S3E} 1.4.2 (packages/silinx-fpga), 1.4.2 (root), expected an exact version, not ^1.4.2`]);
  assert.equal(checkResolved(fpga, ['left-pad'], dir).ok, false);
});

test('resolved package: the command line prints every package and exits 1 on a mismatch, 2 without arguments', () => {
  const { dir } = workspace({ root: { [S3E]: '1.4.1' }, nested: { [S3E]: '1.4.2' }, declared: { [S3E]: '1.4.2' } });
  const run = (...a) => spawnSync(process.execPath, [SCRIPT, ...a], { cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: '' } });
  let r = run('packages/silinx-fpga', S3E);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, `error: ${S3E} 1.4.2 (packages/silinx-fpga), 1.4.1 (root), expected 1.4.2\n`);
  r = spawnSync(process.execPath, [SCRIPT, 'packages/silinx-fpga', `${S3E}@1.4.1`], { cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: 'true' } });
  assert.equal(r.stdout, `::error::${S3E} 1.4.2 (packages/silinx-fpga), 1.4.1 (root), expected 1.4.1\n`, 'an annotation on GitHub');
  fs.rmSync(path.join(dir, 'packages', 'silinx-fpga', 'node_modules'), { recursive: true });
  r = run('packages/silinx-fpga', S3E, `${S3E}@1.4.1`);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, `${S3E} 1.4.1 (packages/silinx-fpga), 1.4.1 (root), expected 1.4.1\n`);
  assert.equal(run().status, 2);
});
