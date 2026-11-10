// The project's old name (#2624): "Silinx ISE" becomes "Silinx", in four spellings (with a space, a hyphen, lower
// case, an environment variable's prefix). This test counts them, file by file, in every tracked file, as a ratchet
// (as test/code-size.test.js): the files that hold the old name today are listed below with their counts; a file not
// listed fails, a count that grew fails, and a count that shrank must be lowered here (an entry leaves the list at
// 0), so the list only shrinks until it is empty. What keeps the old spelling for good is not counted: the past
// sections of the changelogs and docs/HISTORY.md (history), and the names that are Xilinx ISE's own, not the
// project's: the ISE host's environment variables (SILINX_ISE_HOST, …: its host, image, folder and tests) and the ISE
// host's shared folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = 'test/old-name.test.js';
// built from two parts, so that this file does not count itself; a line break may come between the two words, with
// the next line's comment marks or indentation (a comment, a Markdown quote or list)
const OLD = () => new RegExp('silinx(?:[ _-]|[ \\t]*\\r?\\n[ \\t/#*>-]*)' + 'ise', 'gi');
// Xilinx ISE's own names, kept: the ISE host's environment variables and its shared folder (#482)
const KEEP = [/SILINX_ISE_(?:HOST|TESTS|REMOTE_DIR|IMAGE|KEEP)\b/g, /\/Users\/Shared\/silinx-ise\b/g];
// history, kept as it was written; the rename's own changelog fragments, which name the old names to say what
// became of them (they join CHANGELOG.md's history at the next release)
const HISTORY = new Set(['CHANGELOG.md', 'packages/silinx-fpga/CHANGELOG.md', 'docs/HISTORY.md']);
const isHistory = (f) => HISTORY.has(f) || /^(packages\/silinx-fpga\/)?changes\/2624-[a-z0-9-]+\.md$/.test(f);

// the files named with the old name on 2026-11-08 (renamed by #2624's pull requests, never added to)
const OLD_PATHS = new Set([
  'bin/silinx-ise.js',   // the command's old name, kept for two releases (#2624)
]);
// the old name's count in each file, kept on purpose after the rename: lower an entry when it shrinks, never raise one
// or add one; the list empties when the old command goes (#3133)
const OLD_NAME = new Map([
  // the command's old name, kept for two releases: the shim, its bin entry and its tests
  ["bin/silinx-ise.js", 3],
  ["package-lock.json", 2],
  ["package.json", 2],
  ["test/cli.test.js", 4],
  ["test/mcp.test.js", 5],
  // the ISE runner's launchd labels and folder of before the rename, which install.sh removes
  ["scripts/ise-runner/install.sh", 2],
  // the hook accepts the repository by its ID: a job that names it by its old name is refused
  ["test/ise-runner.test.js", 1],
]);

/** The old name's count in a text, the kept names left out. */
function countOld(text) {
  let t = text;
  for (const k of KEEP) t = t.replace(k, '');
  return (t.match(OLD()) || []).length;
}

function tracked() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }).split('\0').filter(Boolean);
}

test('#2624 old name: how it is counted', () => {
  const n = ['Silinx', 'ISE'];
  assert.equal(countOld(`${n.join(' ')} and ${n.join('-')}, ${n.join('-').toLowerCase()}, ${n.join('_').toUpperCase()}_X`), 4);
  assert.equal(countOld(`${n.join(' ').toLowerCase()} ${n.join('_').toLowerCase()}`), 2);
  // across a line break, in a comment, a Markdown quote or list, or plain text
  assert.equal(countOld(`needs ${n[0]}\n// ${n[1]}. Then ${n[0]}\n> ${n[1]}, ${n[0]}\r\n  - ${n[1]} and ${n[0]}\n${n[1]}`), 4);
  assert.equal(countOld(`${n[0]}\n\n${n[1]}`), 0);   // a paragraph between them: not one name
  // Xilinx ISE's own names are not the project's
  assert.equal(countOld('SILINX_ISE_HOST=user@host SILINX_ISE_IMAGE SILINX_ISE_TESTS=1 SILINX_ISE_REMOTE_DIR SILINX_ISE_KEEP'), 0);
  assert.equal(countOld('RWBASE=/Users/Shared/silinx-ise/build'), 0);
  assert.equal(countOld('Docker Desktop shares only `/Users/Shared/silinx-ise`, so'), 0);   // the folder itself
  assert.equal(countOld('SILINX_ISE_HOSTS'), 1);
  // history: the changelogs, and the rename's own fragments only
  assert.ok(isHistory('CHANGELOG.md') && isHistory('docs/HISTORY.md') && isHistory('changes/2624-package-silinx.md') && isHistory('packages/silinx-fpga/changes/2624-x.md'));
  assert.ok(!isHistory('changes/2625-other.md') && !isHistory('changes/2624-x.md.bak') && !isHistory('docs/changes/2624-x.md'));
  // nor the ISE-style interface, the Xilinx ISE image or Silinx alone
  assert.equal(countOld('SILINX_UI_INTERFACE=ise, silinx/ise:14.7, Silinx, ISE, Xilinx ISE, silinx.ise'), 0);
});

test('#2624 old name: no new file holds it, no count grew, every shrunk count lowered', () => {
  const now = new Map();
  for (const f of tracked()) {
    if (f === SELF || isHistory(f)) continue;
    const full = path.join(ROOT, f);
    if (!fs.existsSync(full)) continue;   // deleted in the working tree, not committed yet
    const buf = fs.readFileSync(full);
    if (buf.includes(0)) continue;   // binary
    const n = countOld(buf.toString('utf8'));
    if (n) now.set(f, n);
  }
  const grew = [...now].filter(([f, n]) => n > (OLD_NAME.get(f) || 0)).map(([f, n]) => `${f}: ${n} (listed ${OLD_NAME.get(f) || 0})`);
  assert.deepEqual(grew, [], 'the old name "Silinx ISE" in a new place: write Silinx (#2624)');
  const shrank = [...OLD_NAME].filter(([f, n]) => (now.get(f) || 0) < n).map(([f, n]) => `${f}: ${now.get(f) || 0} (listed ${n})`);
  assert.deepEqual(shrank, [], 'fewer of the old name now: lower these counts in OLD_NAME (remove an entry at 0)');
});

test('#2624 old name: no new file named with it, no listed one left', () => {
  const named = tracked().filter((f) => countOld(f));
  assert.deepEqual(named.filter((f) => !OLD_PATHS.has(f)), [], 'a file named with the old name: name it Silinx (#2624)');
  assert.deepEqual([...OLD_PATHS].filter((f) => !named.includes(f)), [], 'renamed (or gone): remove them from OLD_PATHS');
});
