// The packages a checkout runs on against its package-lock.json (#2949). Node looks for a package in the node_modules of
// the folder and of every folder above it, so a worktree with no node_modules of its own (.claude/worktrees/<name>) runs
// on the main checkout's, which may be months behind: the design corpus then measured nextpnr 0.15.0's place and route
// against expectations recorded with 1.1.0's, and reported a regression no commit made.
import fs from 'node:fs';
import path from 'node:path';

/** The folder whose node_modules/<name> Node resolves from root (root's, else the nearest one above it), or null. */
function resolvedFrom(root, name) {
  for (let dir = path.resolve(root); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'node_modules', name, 'package.json'))) return dir;
    if (path.dirname(dir) === dir) return null;
  }
}

/**
 * The packages of root's package-lock.json (its top-level node_modules entries, workspace links left out) that Node does
 * not find there as locked: [{ name, locked, installed, from }], installed null when it finds none, from the folder of
 * the node_modules it finds (root's own, or one above it). An optional package that is not installed is left out (npm
 * skips one for another platform).
 */
export function installMismatches(root) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const out = [];
  for (const [key, entry] of Object.entries(lock.packages || {})) {
    const m = /^node_modules\/((?:@[^/]+\/)?[^/]+)$/.exec(key);
    if (!m || entry.link) continue;
    const name = m[1];
    const dir = resolvedFrom(root, name);
    const installed = dir && JSON.parse(fs.readFileSync(path.join(dir, 'node_modules', name, 'package.json'), 'utf8')).version;
    if (!dir && (entry.optional || entry.devOptional)) continue;
    if (installed !== entry.version || path.resolve(dir) !== path.resolve(root)) out.push({ name, locked: entry.version, installed: installed || null, from: dir });
  }
  return out;
}

/**
 * The mismatches as lines for a console: how many packages come from a node_modules above root (one line per folder),
 * then each package whose version is not the locked one.
 */
export function mismatchLines(root, list) {
  const outside = new Map();
  for (const x of list) if (x.from && path.resolve(x.from) !== path.resolve(root)) outside.set(x.from, (outside.get(x.from) || 0) + 1);
  return [
    ...[...outside].map(([dir, n]) => `${n} package(s) from ${path.relative(root, path.join(dir, 'node_modules'))}, not from this checkout's node_modules`),
    ...list.filter(x => x.installed !== x.locked).map(x => `${x.name} ${x.installed === null ? 'not installed' : x.installed}, package-lock.json ${x.locked}`),
  ];
}
