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
// history, kept as it was written
const HISTORY = new Set(['CHANGELOG.md', 'packages/silinx-fpga/CHANGELOG.md']);

// the files named with the old name on 2026-11-08 (renamed by #2624's pull requests, never added to)
const OLD_PATHS = new Set([
  'Start Silinx-ISE.bat',
  'Start Silinx-ISE.command',
  'bin/silinx-ise.js',
  'start-silinx-ise.sh',
]);
// the old name's count in each file on 2026-11-08: lower an entry when it shrinks, never raise one or add one
const OLD_NAME = new Map([
  [".github/release-notes.md", 10],
  [".github/workflows/dev-release.yml", 3],
  [".github/workflows/ise.yml", 1],
  [".github/workflows/pages.yml", 4],
  [".github/workflows/quality.yml", 1],
  [".github/workflows/release.yml", 5],
  ["CLAUDE.md", 3],
  ["CONTRIBUTING.md", 2],
  ["NOTICE", 3],
  ["ONBOARDING.md", 6],
  ["README.md", 43],
  ["SECURITY.md", 5],
  ["Start Silinx-ISE.bat", 1],
  ["Start Silinx-ISE.command", 1],
  ["THIRD-PARTY-NOTICES.md", 5],
  ["bin/silinx-ise.js", 10],
  ["core/changelog.js", 2],
  ["core/design-link.js", 2],
  ["core/modgen.js", 1],
  ["core/third-party.js", 1],
  ["core/version.js", 3],
  ["docker/ise/Dockerfile", 4],
  ["docker/ise/build-ise-image.ps1", 3],
  ["docker/ise/build-ise-image.sh", 3],
  ["docker/ise/entrypoint.sh", 1],
  ["docs/ARCHITECTURE.md", 4],
  ["docs/COMECAR.md", 31],
  ["docs/GETTING-STARTED.md", 31],
  ["docs/HISTORY.md", 3],
  ["docs/OPEN-TOOLCHAIN.md", 4],
  ["docs/QUALITY.md", 1],
  ["docs/TOOLCHAIN-SEPARATION.md", 18],
  ["docs/UI-GUIDELINES.md", 1],
  ["package-lock.json", 4],
  ["package.json", 6],
  ["packages/silinx-fpga/NOTICE", 1],
  ["packages/silinx-fpga/README.md", 5],
  ["packages/silinx-fpga/THIRD-PARTY-NOTICES.md", 1],
  ["packages/silinx-fpga/changes/README.md", 2],
  ["packages/silinx-fpga/package.json", 1],
  ["packages/silinx-fpga/research/s3e-device/README.md", 1],
  ["packages/silinx-fpga/research/s6/README.md", 20],
  ["packages/silinx-fpga/src/cli.js", 2],
  ["packages/silinx-fpga/src/node.js", 1],
  ["packages/silinx-fpga/src/parts.js", 1],
  ["packages/silinx-fpga/test/silinx-fpga-api.test.js", 1],
  ["packages/silinx-fpga/test/yosys-integrity.test.js", 2],
  ["research/ink-models/README.md", 1],
  ["research/ui-782/index.html", 3],
  ["research/ui-782/inventory.md", 1],
  ["research/ui-782/mockups.css", 1],
  ["research/ui-782/mockups.js", 4],
  ["scripts/build-standalone.mjs", 9],
  ["scripts/dev-notes.mjs", 2],
  ["scripts/ise-runner/install.sh", 9],
  ["scripts/ise-runner/job-started.sh", 3],
  ["scripts/ise-runner/window.mjs", 3],
  ["scripts/package-release.mjs", 12],
  ["scripts/pwa.mjs", 3],
  ["scripts/site-analytics.mjs", 2],
  ["scripts/third-party.mjs", 10],
  ["server/ise.js", 1],
  ["server/mcp-transfer.js", 7],
  ["server/mcp.js", 7],
  ["server/project-watch.js", 1],
  ["start-silinx-ise.sh", 2],
  ["test/asset-cache.test.js", 1],
  ["test/build-dev-menu.test.js", 4],
  ["test/build-info.test.js", 6],
  ["test/changelog-fragments.test.js", 1],
  ["test/changelog.test.js", 7],
  ["test/cli.test.js", 11],
  ["test/design-link.test.js", 4],
  ["test/designs-corpus.test.js", 1],
  ["test/designs-corpus/boards/int2float_basys2.v", 1],
  ["test/designs-corpus/boards/prbs_basys2.v", 1],
  ["test/designs-corpus/boards/serv_basys2.v", 1],
  ["test/designs-corpus/boards/serv_basys2_tb.v", 1],
  ["test/designs-corpus/boards/spi_basys2.v", 1],
  ["test/designs-corpus/lib.mjs", 2],
  ["test/designs-corpus/quality-page.mjs", 1],
  ["test/designs-corpus/wrappers/mcu80_hello.vhd", 1],
  ["test/designs-corpus/wrappers/vtr_memories.v", 1],
  ["test/dev-notes.test.js", 1],
  ["test/downloaded-packages.test.js", 1],
  ["test/ise-examples-config.mjs", 3],
  ["test/ise-examples-config.test.js", 9],
  ["test/ise-image-kit.test.js", 3],
  ["test/ise-runner.test.js", 29],
  ["test/ise/examples.test.js", 1],
  ["test/ise/hls-blackbox.test.js", 1],
  ["test/ise/ise-flow.test.js", 2],
  ["test/ise/open-flow.test.js", 6],
  ["test/ise/timesim.test.js", 2],
  ["test/ise/xise-interop.test.js", 1],
  ["test/launch.js", 7],
  ["test/launchers.test.js", 14],
  ["test/mcp-link.test.js", 4],
  ["test/mcp-transfer.test.js", 6],
  ["test/mcp.test.js", 5],
  ["test/messages.test.js", 2],
  ["test/private-data.test.js", 1],
  ["test/pwa.test.js", 7],
  ["test/release-workflow.test.js", 1],
  ["test/release/release.test.js", 10],
  ["test/server-open-code.test.js", 1],
  ["test/silinx-fpga-cli.test.js", 1],
  ["test/silinx-fpga-package.test.js", 1],
  ["test/silinx.test.js", 4],
  ["test/site-analytics.test.js", 8],
  ["test/static-editions.test.js", 13],
  ["test/tasks.test.js", 3],
  ["test/third-party.test.js", 3],
  ["test/ui/app.test.js", 23],
  ["test/ui/dark-contrast.test.js", 1],
  ["test/ui/dev-menu.test.js", 4],
  ["test/ui/framed.test.js", 4],
  ["test/ui/interface-parity.test.js", 1],
  ["test/ui/projects.test.js", 17],
  ["test/ui/silinx.test.js", 11],
  ["test/ui/standalone.test.js", 18],
  ["test/ui/tablet.test.js", 1],
  ["test/ui/update-links.test.js", 12],
  ["test/web-i18n.test.js", 1],
  ["test/web-open-flow-browser.test.js", 2],
  ["test/web-own-error.test.js", 4],
  ["test/web-prefs.test.js", 2],
  ["test/web-release-url.test.js", 4],
  ["test/workflows.test.js", 2],
  ["web/index.html", 6],
  ["web/js/analytics.js", 1],
  ["web/js/api-local.js", 1],
  ["web/js/api.js", 1],
  ["web/js/devmenu-pointer.js", 2],
  ["web/js/i18n-link.js", 2],
  ["web/js/i18n.js", 36],
  ["web/js/menus.js", 5],
  ["web/js/messages.js", 1],
  ["web/js/open-flow-browser.js", 3],
  ["web/js/open-flow-worker.js", 1],
  ["web/js/project-store.js", 1],
  ["web/js/project-watch.js", 1],
  ["web/js/project.js", 2],
  ["web/js/pwa.js", 1],
  ["web/js/sw-policy.js", 1],
  ["web/js/wizards.js", 16],
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
  // nor the ISE-style interface, the Xilinx ISE image or Silinx alone
  assert.equal(countOld('SILINX_UI_INTERFACE=ise, silinx/ise:14.7, Silinx, ISE, Xilinx ISE, silinx.ise'), 0);
});

test('#2624 old name: no new file holds it, no count grew, every shrunk count lowered', () => {
  const now = new Map();
  for (const f of tracked()) {
    if (f === SELF || HISTORY.has(f)) continue;
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
