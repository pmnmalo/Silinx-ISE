// The project's old name (#2624): "Silinx ISE" becomes "Silinx", in four spellings (with a space, a hyphen, lower
// case, an environment variable's prefix). This test counts them, file by file, in every tracked file, as a ratchet
// (as test/code-size.test.js): the files that hold the old name today are listed below with their counts; a file not
// listed fails, a count that grew fails, and a count that shrank must be lowered here (an entry leaves the list at
// 0), so the list only shrinks until it is empty. What keeps the old spelling for good is not counted: the past
// sections of the changelogs (history), and the names that are Xilinx ISE's own, not the project's: the ISE host's
// environment variables (SILINX_ISE_HOST, …: its host, image, folder and tests) and the ISE host's shared folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = 'test/old-name.test.js';
// built from two parts, so that this file does not count itself
const OLD = () => new RegExp('silinx[ _-]' + 'ise', 'gi');
// Xilinx ISE's own names, kept: the ISE host's environment variables and its shared folder (#482)
const KEEP = [/SILINX_ISE_(?:HOST|TESTS|REMOTE_DIR|IMAGE|KEEP)\b/g, /\/Users\/Shared\/silinx-ise\//g];
// history, kept as it was written; the rename's own changelog fragments, which name the old names to say what
// became of them (they join CHANGELOG.md's history at the next release)
const HISTORY = new Set(['CHANGELOG.md', 'packages/silinx-fpga/CHANGELOG.md']);
const isHistory = (f) => HISTORY.has(f) || /^(packages\/silinx-fpga\/)?changes\/2624-[a-z0-9-]+\.md$/.test(f);

// the files named with the old name on 2026-11-08 (renamed by #2624's pull requests, never added to)
const OLD_PATHS = new Set([
  'bin/silinx-ise.js',   // the command's old name, kept for two releases (#2624)
]);
// the old name's count in each file on 2026-11-08: lower an entry when it shrinks, never raise one or add one
const OLD_NAME = new Map([
  [".github/release-notes.md", 1],
  [".github/workflows/dev-release.yml", 2],
  [".github/workflows/pages.yml", 2],
  [".github/workflows/release.yml", 1],
  ["CONTRIBUTING.md", 1],
  ["NOTICE", 1],
  ["ONBOARDING.md", 3],
  ["README.md", 13],
  ["SECURITY.md", 2],
  ["bin/silinx-ise.js", 3],
  ["core/changelog.js", 2],
  ["core/design-link.js", 1],
  ["core/version.js", 1],
  ["docs/COMECAR.md", 7],
  ["docs/GETTING-STARTED.md", 7],
  ["docs/HISTORY.md", 1],
  ["docs/OPEN-TOOLCHAIN.md", 4],
  ["docs/QUALITY.md", 1],
  ["docs/TOOLCHAIN-SEPARATION.md", 15],
  ["package-lock.json", 2],
  ["package.json", 3],
  ["packages/silinx-fpga/NOTICE", 1],
  ["packages/silinx-fpga/README.md", 1],
  ["packages/silinx-fpga/package.json", 1],
  ["packages/silinx-fpga/research/s3e-device/README.md", 1],
  ["packages/silinx-fpga/research/s6/README.md", 20],
  ["packages/silinx-fpga/test/yosys-integrity.test.js", 2],
  ["research/ink-models/README.md", 1],
  ["scripts/build-standalone.mjs", 1],
  ["scripts/dev-notes.mjs", 2],
  ["scripts/ise-runner/install.sh", 7],
  ["scripts/ise-runner/job-started.sh", 1],
  ["scripts/ise-runner/window.mjs", 3],
  ["test/asset-cache.test.js", 1],
  ["test/build-dev-menu.test.js", 3],
  ["test/build-info.test.js", 2],
  ["test/changelog.test.js", 2],
  ["test/cli.test.js", 4],
  ["test/design-link.test.js", 3],
  ["test/designs-corpus.test.js", 1],
  ["test/designs-corpus/quality-page.mjs", 1],
  ["test/dev-notes.test.js", 1],
  ["test/ise-examples-config.mjs", 3],
  ["test/ise-examples-config.test.js", 8],
  ["test/ise-runner.test.js", 27],
  ["test/ise/ise-flow.test.js", 1],
  ["test/ise/timesim.test.js", 1],
  ["test/mcp-link.test.js", 3],
  ["test/mcp.test.js", 5],
  ["test/pwa.test.js", 2],
  ["test/silinx-fpga-package.test.js", 1],
  ["test/site-analytics.test.js", 2],
  ["test/static-editions.test.js", 12],
  ["test/tasks.test.js", 3],
  ["test/ui/app.test.js", 1],
  ["test/ui/dev-menu.test.js", 2],
  ["test/ui/standalone.test.js", 1],
  ["test/ui/update-links.test.js", 3],
  ["test/web-own-error.test.js", 2],
  ["test/web-prefs.test.js", 2],
  ["test/web-release-url.test.js", 3],
  ["web/js/analytics.js", 1],
  ["web/js/i18n.js", 2],
  ["web/js/open-flow-browser.js", 1],
  ["web/js/project-store.js", 1],
  ["web/js/wizards.js", 1],
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
  // Xilinx ISE's own names are not the project's
  assert.equal(countOld('SILINX_ISE_HOST=user@host SILINX_ISE_IMAGE SILINX_ISE_TESTS=1 SILINX_ISE_REMOTE_DIR SILINX_ISE_KEEP'), 0);
  assert.equal(countOld('RWBASE=/Users/Shared/silinx-ise/build'), 0);
  assert.equal(countOld('SILINX_ISE_HOSTS'), 1);
  // history: the changelogs, and the rename's own fragments only
  assert.ok(isHistory('CHANGELOG.md') && isHistory('changes/2624-package-silinx.md') && isHistory('packages/silinx-fpga/changes/2624-x.md'));
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
