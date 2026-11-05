// Silinx's use of @silinx/nextpnr-himbaechel-spartan3e keeps to the interface its 1.0.0 froze (#2438; the package's
// README, "The interface"): a 1.x, whose minor versions keep it, so a change Silinx needs outside it is a 2.0.0 of the
// package. The exports Silinx imports (nextpnr-io.js, nextpnr-chipdb-node.js), the chip databases' files and the
// release's URL (the release zip's downloads), and every argument open-flow-nextpnr.js passes to nextpnr.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chipdbReleaseUrl } from '../packages/silinx-fpga/src/nextpnr-chipdb-node.js';

// (the package's folder: its bundle's, gen/bundle.js; its exports have no ./package.json)
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.resolve('@silinx/nextpnr-himbaechel-spartan3e'))), '..');
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');

test('#2438 the Spartan-3E nextpnr package is a 1.x, its version the one Silinx pins', () => {
  assert.match(meta.version, /^1\.\d+\.\d+$/);
  for (const p of ['package.json', 'packages/silinx-fpga/package.json']) {
    assert.equal(JSON.parse(fs.readFileSync(p, 'utf8')).dependencies['@silinx/nextpnr-himbaechel-spartan3e'], meta.version, p);
  }
  assert.match(fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8'), new RegExp(`^## ${meta.version.replace(/\./g, '\\.')}$`, 'm'));
});

test('#2438 the exports Silinx uses are the frozen ones, declared in lib/api.d.ts', () => {
  const dts = fs.readFileSync(path.join(dir, 'lib', 'api.d.ts'), 'utf8');
  for (const name of ['runNextpnrHimbaechelSpartan3e', 'Exit', 'chipdb', 'devices', 'deviceOf', 'chipdbUrl', 'version']) {
    assert.match(dts, new RegExp(`^export (const|function|class) ${name}\\b`, 'm'), name);
  }
  assert.deepEqual(meta.exports, { types: './lib/api.d.ts', default: './gen/bundle.js' });
});

test('#2438 the chip databases: one file per device, the release v<version>\'s assets', () => {
  const files = fs.readdirSync(path.join(dir, 'chipdb')).filter(f => f !== 'fetch.json').sort();
  assert.deepEqual(files, ['chipdb-xc3s100e.bin.gz', 'chipdb-xc3s1200e.bin.gz', 'chipdb-xc3s250e.bin.gz', 'chipdb-xc3s500e.bin.gz']);
  assert.equal(chipdbReleaseUrl(meta.name, meta.version), `https://github.com/pmnmalo/nextpnr-spartan/releases/download/v${meta.version}/`);
  assert.match(readme, /`chipdb\/chipdb-<device>\.bin\.gz`/);
  assert.match(readme, /GitHub release `v<version>`/);
});

test('#2438 every argument Silinx passes to nextpnr is one of the interface\'s', () => {
  const src = fs.readFileSync('packages/silinx-fpga/src/open-flow-nextpnr.js', 'utf8');
  const call = src.slice(src.indexOf('const args = [\'--device\''), src.indexOf('\'--timing-allow-fail\'];') + 22);
  const passed = [...new Set(call.match(/'--[a-z-]+'/g).map(a => a.slice(1, -1)))].sort();
  assert.deepEqual(passed, ['--chipdb', '--device', '--freq', '--json', '--sdc', '--seed', '--timing-allow-fail', '--write']);
  const frozen = [...readme.matchAll(/^ *\| `(--[a-z-]+)[ `]/gm)].map(m => m[1]).sort();
  assert.deepEqual(passed.filter(a => !frozen.includes(a)), [], `outside the interface (frozen: ${frozen.join(' ')})`);
});
