// The npm packages downloaded on their first use, left out of the release zip (#2444, #2570, scripts/downloaded-packages.mjs):
// npm ci --omit=dev installs the iCE40's and the ECP5's nextpnr (#2302) all the same (an optional peer of the workspace silinx-fpga, devOptional in
// package-lock.json), so the packaging removes it after the install, and the notices mark it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DOWNLOADED_PACKAGES, leaveOutDownloaded } from '../scripts/downloaded-packages.mjs';
import { THIRD_PARTY } from '../core/third-party.js';

const ROOT = path.join(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('#2570 leaveOutDownloaded: the downloaded packages removed from node_modules, the others kept', () => {
  const app = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-downloaded-'));
  try {
    for (const p of ['@yowasp/nextpnr-ice40/gen', '@yowasp/yosys/gen', 'elkjs/lib']) {
      fs.mkdirSync(path.join(app, 'node_modules', p), { recursive: true });
      fs.writeFileSync(path.join(app, 'node_modules', p, 'bundle.js'), '//');
    }
    leaveOutDownloaded(app);
    assert.ok(!fs.existsSync(path.join(app, 'node_modules/@yowasp/nextpnr-ice40')));
    assert.ok(fs.existsSync(path.join(app, 'node_modules/@yowasp/yosys/gen/bundle.js')));
    assert.ok(fs.existsSync(path.join(app, 'node_modules/elkjs/lib/bundle.js')));
    leaveOutDownloaded(app);   // (nothing left to remove: no error)
  } finally {
    fs.rmSync(app, { recursive: true, force: true });
  }
});

test('#2570 the release zip removes them after npm ci, before zipping', () => {
  assert.deepEqual(DOWNLOADED_PACKAGES, ['@yowasp/nextpnr-ice40', '@yowasp/nextpnr-ecp5', '@yowasp/nextpnr-himbaechel-gowin']);
  const src = read('scripts/package-release.mjs');
  const at = (re) => { const m = re.exec(src); assert.ok(m, String(re)); return m.index; };
  const install = at(/run\('npm', \['ci', '--omit=dev'/), leave = at(/\n {4}leaveOutDownloaded\(app\);\n/), zip = at(/run\('zip', \['-qr'/);
  assert.ok(install < leave && leave < zip, 'npm ci, leaveOutDownloaded, zip');
});

test('#2570 why: npm ci --omit=dev keeps them (devOptional), the fetch has their version and SHA-512, the server names the same package', () => {
  const lock = JSON.parse(read('package-lock.json'));
  for (const name of DOWNLOADED_PACKAGES) {
    const e = lock.packages[`node_modules/${name}`];
    assert.ok(e, `${name} in package-lock.json`);
    // not a production dependency of the app, and installed with --omit=dev all the same
    assert.equal(JSON.parse(read('package.json')).dependencies[name], undefined, name);
    assert.equal(e.devOptional, true, `${name}: devOptional (npm ci --omit=dev installs it)`);
    assert.match(e.resolved, /^https:\/\/registry\.npmjs\.org\//);
    assert.match(e.integrity, /^sha512-/);
  }
  // (the server's fetch knows each, by the same name, #2302)
  const fetchSrc = read('server/nextpnr-ice40-fetch.js');
  for (const name of DOWNLOADED_PACKAGES) assert.ok(fetchSrc.includes(`  '${name}': { tools: `), name);
});

test('#2570 the notices: the downloaded packages listed and marked, with a note', () => {
  assert.deepEqual(THIRD_PARTY.filter(c => c.downloaded).map(c => c.name).sort(), [...DOWNLOADED_PACKAGES].sort());
  const md = read('THIRD-PARTY-NOTICES.md');
  assert.match(md, /ships all of them but the ones it downloads on their first use;/);
  for (const c of THIRD_PARTY.filter(c => c.downloaded)) {
    const section = md.slice(md.indexOf(`## ${c.name} ${c.version} `));
    assert.match(section.slice(0, section.indexOf('\n## ', 1)), /\nNot in silinx-<version>\.zip: Silinx downloads it from npm's registry on its first use\.\n/, c.name);
  }
});
