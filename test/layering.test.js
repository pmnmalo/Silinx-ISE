// The application's code (server/, core/, web/, bin/) never imports the research folder's modules
// (#407): research builds the data the application ships (the bit database, the device descriptions)
// and uses the application's code, not the other way round.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = dir => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(e => {
  const rel = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === 'node_modules' || e.name === 'devices' ? [] : files(rel);
  return /\.(m?js)$/.test(e.name) ? [rel] : [];
});

// the toolchain package's research and tests (#1680) are research's and tests' too
const RESEARCH = ['research', 'packages/silinx-fpga/research'].map(d => path.join(ROOT, d) + path.sep);
const notApp = f => /^packages\/silinx-fpga\/(research|test)\//.test(f.split(path.sep).join('/'));

test('the application imports nothing from research/ (#407)', () => {
  const imports = /(?:\bimport\s[^;]*?from\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"`]([^'"`]+)['"`]/g;
  const bad = [];
  for (const f of ['server', 'core', 'packages', 'web', 'bin'].flatMap(files).filter(f => !notApp(f))) {
    for (const m of fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(imports)) {
      if (m[1].startsWith('.') && RESEARCH.some(d => path.resolve(path.dirname(path.join(ROOT, f)), m[1]).startsWith(d))) bad.push(`${f}: ${m[1]}`);
      else if (/^\/?(packages\/silinx-fpga\/)?research\//.test(m[1])) bad.push(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual(bad, []);
  // the Spartan-3E and Spartan-6 research and the nextpnr spike are the package's (#1680)
  for (const d of ['s3e-device', 's3e-bitstream', 's3e-place', 's3e-route', 'nextpnr-s3e', 's6']) {
    assert.ok(!fs.existsSync(path.join(ROOT, 'research', d)) && fs.existsSync(path.join(ROOT, 'packages/silinx-fpga/research', d, 'README.md')), d);
  }
});

test('the bit database loader of core/ reads packages/silinx-fpga/bitdb (#1676), the one packages/silinx-fpga/research/s3e-bitstream/db.mjs re-exports (#407)', async () => {
  const core = await import('../packages/silinx-fpga/src/fpga/bitdb-node.js');
  const research = await import('../packages/silinx-fpga/research/s3e-bitstream/db.mjs');
  assert.equal(core.DB_DIR, path.join(ROOT, 'packages', 'silinx-fpga', 'bitdb'));
  for (const k of ['DB_DIR', 'dbPackages', 'hasBitDb', 'readDbFiles']) assert.equal(research[k], core[k], k);
  assert.deepEqual(core.dbPackages('xc3s250e'), ['cp132']);
  // research's loadDb: the experiments' default part; core's: the part given
  assert.equal(research.loadDb().part, core.loadDb(research.PART).part);
  assert.throws(() => core.loadDb('xc3s1600efg320-4'), /no bit database for xc3s1600e/);
});
