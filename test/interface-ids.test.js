// The interfaces' ids (#2451): silinx and ise, never the ids of before (modern, classic), anywhere in the code, the
// tests, the scripts and the workflows: data-ui and its CSS selectors, the saved preference, SILINX_UI_INTERFACE, the
// CI matrix. Only the migration of a preference saved with an old id, and its tests, name them (ALLOW).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = 'test/interface-ids.test.js';

// an old id as an id: quoted, as data-ui's value, as SILINX_UI_INTERFACE's, in a workflow's matrix
export const OLD_IDS = [
  /(['"`])(modern|classic)\1/g,
  /data-ui=["']?(modern|classic)\b/g,
  /SILINX_UI_INTERFACE=["']?(modern|classic)\b/g,
  /interface: \[[^\]\n]*?\b(modern|classic)\b/g,
];

// the lines allowed to name an old id, by file: how many matches each has, and why
const ALLOW = {
  'web/index.html': [2, 'the early script migrates a saved old id (#2451)'],
  'test/modern.test.js': [2, 'the migration, of the development edition\'s preference and on load'],
  'test/tasks.test.js': [2, 'the early script\'s migration'],
  'test/ui/tasks.test.js': [2, 'the migration in the browser'],
  'test/ui-interface.test.js': [5, 'SILINX_UI_INTERFACE=modern|classic mapped, with a warning'],
  'scripts/test-browsers.mjs': [1, 'the file test/ui/modern.test.js, not an interface'],
};

/** The matches of the old ids in a text: [{ line, text }]. */
export function oldIds(text) {
  const found = [];
  text.split('\n').forEach((l, i) => {
    for (const re of OLD_IDS) for (const m of l.matchAll(re)) found.push({ line: i + 1, text: m[0] });
  });
  return found;
}

test('#2451 oldIds finds the ids of before as ids, not the words', () => {
  assert.deepEqual(oldIds("x = 'modern'\nhtml[data-ui=\"classic\"] a {}\nSILINX_UI_INTERFACE=classic node --test"),
    [{ line: 1, text: "'modern'" }, { line: 2, text: '"classic"' }, { line: 2, text: 'data-ui="classic' }, { line: 3, text: 'SILINX_UI_INTERFACE=classic' }]);
  assert.deepEqual(oldIds('        interface: [modern, classic]').map((m) => m.text), ['interface: [modern']);
  assert.deepEqual(oldIds("a modern look, the classic one; 'silinx', data-ui=\"ise\", { modern: 'silinx' }; a classic worker"), []);
});

test('#2451 no old interface id (modern, classic) in web/, test/, scripts/, .github/ but the migration\'s', () => {
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', 'web', 'test', 'scripts', '.github'], { cwd: ROOT, encoding: 'utf8' })
    // (a new file not yet added counts; a sync's copy, "name 2.js", does not)
    .split('\0').filter((f) => f && f !== SELF && !/ \d+\.\w+$/.test(f) && /\.(m?js|html|css|ya?ml|json)$/.test(f) && fs.existsSync(path.join(ROOT, f)));
  assert.ok(files.length > 100, 'the files found');
  const counts = {};
  for (const f of files) {
    const n = oldIds(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    if (n.length) counts[f] = n.length;
  }
  assert.deepEqual(counts, Object.fromEntries(Object.entries(ALLOW).map(([f, [n]]) => [f, n])));
});
