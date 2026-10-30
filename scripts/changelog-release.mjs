#!/usr/bin/env node
// A release's changelog (#519): assembles the changelog fragments (changes/<issue>-<slug>.md, one per
// change, see changes/README.md) into the "## <version>" section at the top of CHANGELOG.md, newest issue
// first, and deletes them. When the version has a section already (written by hand), the fragments' items
// are added to its lists. The first step of a release, before `npm version` (whose scripts/sync-version.mjs
// needs the section and no fragment left); the releaser may then edit the section (an introduction, a
// shorter "In short:") before the version's commit.
//   node scripts/changelog-release.mjs 15.11.2 [--dry-run] [--package silinx-fpga]
// --dry-run: print the section, change nothing. --package: a workspace's own changelog (#1681), its
// packages/<name>/changes/ into packages/<name>/CHANGELOG.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleRelease, changesOf, checkFragments } from '../core/changelog.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FRAGMENTS_DIR = path.join(ROOT, 'changes');

/** Where a changelog is: the IDE's, or a workspace's (packages/<name>, #1681); paths relative to the repository. */
export function changelogOf(pkg) {
  const base = pkg ? path.join('packages', pkg) : '';
  return { dir: path.join(ROOT, base, 'changes'), file: path.join(ROOT, base, 'CHANGELOG.md'),
    changes: path.posix.join(base.split(path.sep).join('/'), 'changes/'), changelog: path.posix.join(base.split(path.sep).join('/'), 'CHANGELOG.md') };
}

/** The --package option's value (undefined without it, '' without its name). */
export function packageArg(argv) {
  const i = argv.indexOf('--package');
  return i < 0 ? undefined : argv[i + 1] ?? '';
}

/** The fragments of a folder ([{ name, text }], by name): its .md files but its README.md. */
export function readFragments(dir = FRAGMENTS_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'README.md').sort()
    .map(name => ({ name, text: fs.readFileSync(path.join(dir, name), 'utf8') }));
}

function main() {
  const version = String(process.argv[2] || '').replace(/^v/, '');
  const pkg = packageArg(process.argv);
  const usage = 'usage: node scripts/changelog-release.mjs <version> [--dry-run] [--package <name>]';
  if (!/^\d+\.\d+\.\d+$/.test(version) || (pkg !== undefined && !/^[a-z][a-z0-9-]*$/.test(pkg || ''))) { console.error(usage); process.exit(2); }
  const where = changelogOf(pkg);
  if (!fs.existsSync(where.file)) { console.error(`${where.changelog}: no such file`); process.exit(1); }
  const files = readFragments(where.dir);
  const bad = checkFragments(files);
  if (bad.length) { console.error(`${where.changes}: malformed fragments:\n${bad.map(b => `  ${b}`).join('\n')}`); process.exit(1); }
  let md;
  try { md = assembleRelease(fs.readFileSync(where.file, 'utf8'), version, files); }
  catch (e) { console.error(e.message.replace('in CHANGELOG.md', `in ${where.changelog}`)); process.exit(1); }
  if (process.argv.includes('--dry-run')) { process.stdout.write(`## ${version}\n\n${changesOf(md, version).body}\n`); return; }
  fs.writeFileSync(where.file, md);
  for (const { name } of files) fs.rmSync(path.join(where.dir, name));
  console.log(`${where.changelog}: ${files.length} fragment(s) assembled into "## ${version}" and deleted from ${where.changes}.`);
}

// (run, not imported; the real paths: macOS's temporary folder is a symbolic link)
if (process.argv[1] && fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1])) main();
