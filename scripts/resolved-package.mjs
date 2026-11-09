#!/usr/bin/env node
// The version of a package that the toolchain actually loads (#3156): the nextpnr and Yosys update workflows
// (.github/workflows/nextpnr-update.yml, yosys-update.yml) install the base's package over the pull request's, and npm
// may keep the pull request's own nested in packages/silinx-fpga/node_modules, which the toolchain resolves first. This
// script resolves each package as Node does, from the toolchain's folder and from the repository's root (core/ and
// server/ import it from there), prints both versions, and fails when either is not the one expected.
//
//   node scripts/resolved-package.mjs <dir> <name | name@spec> …
//        a name alone expects the version <dir>/package.json asks for; name@spec (the base's, installed over it) that
//        spec's version; a later argument for the same name replaces an earlier one. Exit 1 on a mismatch.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// a release's tarball of the fork (nextpnr-update-report.mjs RELEASE): its version is the file name's
const TARBALL = /^https:\/\/.+-(\d+\.\d+\.\d+)\.tgz$/;

// name@spec: the last @ but a scope's
export function splitSpec(arg) {
  const at = arg.indexOf('@', 1);
  return at < 0 ? { name: arg, spec: null } : { name: arg.slice(0, at), spec: arg.slice(at + 1) };
}

// the exact version a spec installs: a version, or a release's tarball; null for a range, a tag, an alias
export function specVersion(spec) {
  if (typeof spec !== 'string') return null;
  if (/^\d+(\.\d+)*$/.test(spec)) return spec;
  return TARBALL.exec(spec)?.[1] ?? null;
}

// the folder of the package Node resolves `name` to from `dir` (require.resolve, then up to its package.json: a package's
// exports may not include ./package.json); null when it does not resolve
export function resolvedPackage(name, dir) {
  let file;
  try { file = createRequire(path.join(path.resolve(dir), 'package.json')).resolve(name); } catch { return null; }
  for (let d = path.dirname(file); d !== path.dirname(d); d = path.dirname(d)) {
    const f = path.join(d, 'package.json');
    const p = fs.existsSync(f) && JSON.parse(fs.readFileSync(f, 'utf8'));
    if (p && p.name === name) return { dir: d, version: p.version };
  }
  return null;
}

// every package's expected version against the ones resolved from `dir` and from `root`: { lines, ok }
export function checkResolved(dir, args, root = process.cwd()) {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const want = new Map();
  for (const a of args) {
    const { name, spec } = splitSpec(a);
    want.set(name, spec ?? pkg.dependencies?.[name] ?? pkg.optionalDependencies?.[name] ?? null);
  }
  const lines = [];
  let ok = true;
  for (const [name, spec] of want) {
    const expected = specVersion(spec);
    // the folder as a POSIX path on every system (#3186)
    const from = [[path.relative(root, path.resolve(dir)).split(path.sep).join('/') || '.', dir], ['root', root]].map(([label, d]) => [label, resolvedPackage(name, d)?.version ?? 'not found']);
    const bad = !expected || from.some(([, v]) => v !== expected);
    if (bad) ok = false;
    lines.push(`${bad ? 'error: ' : ''}${name} ${from.map(([l, v]) => `${v} (${l})`).join(', ')}, expected ${expected ?? `an exact version, not ${spec}`}`);
  }
  return { lines, ok };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dir, ...args] = process.argv.slice(2);
  if (!dir || !args.length) { console.error('usage: node scripts/resolved-package.mjs <dir> <name | name@spec> …'); process.exit(2); }
  const { lines, ok } = checkResolved(dir, args);
  for (const l of lines) console.log(l.startsWith('error: ') && process.env.GITHUB_ACTIONS ? `::error::${l.slice(7)}` : l);
  process.exit(ok ? 0 : 1);
}
