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

// The layers' directions (#3541): server/ and web/ (each edition's own code) both import core/, never each other;
// core/ imports neither; the packages (their research and tests aside) import nothing of the IDE. A page's import
// of /core/… or /packages/… is the repository's folder (server/server.js serves them there).
const LAYER_IMPORTS = /(?:\bimport\s[^;]*?from\s*|\bimport\s*(?=['"`])|\bexport\s[^;]*?from\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"`]([^'"`]+)['"`]/g;
const FORBIDDEN = { server: ['web'], web: ['server'], core: ['web', 'server'], packages: ['core', 'server', 'web'] };
function layerCrossings(f, text) {
  const layer = f.split('/')[0];
  const out = [];
  for (const m of text.matchAll(LAYER_IMPORTS)) {
    const spec = m[1];
    const abs = spec.startsWith('.') ? path.resolve(path.dirname(path.join(ROOT, f)), spec)
      : layer === 'web' && /^\/(core|packages)\//.test(spec) ? path.join(ROOT, spec) : null;
    if (abs && FORBIDDEN[layer].includes(path.relative(ROOT, abs).split(path.sep)[0])) out.push(`${f} -> ${spec}`);
  }
  return out;
}

test('server/ imports nothing of web/, web/ nothing of server/, core/ neither, the packages nothing of the IDE (#3541)', () => {
  const bad = ['server', 'core', 'packages', 'web'].flatMap(files).map(f => f.split(path.sep).join('/')).filter(f => !notApp(f))
    .flatMap(f => layerCrossings(f, fs.readFileSync(path.join(ROOT, f), 'utf8')));
  assert.deepEqual(bad, []);
});

// the modules moved to core/ (#3541): their old places export the same names, the same objects
test('the modules moved to core/ are still exported from their old places (#3541)', async () => {
  const MOVED = { server: ['family:boards-family', 'boards', 'boards-ulx3s', 'boards-tangnano9k', 'devices', 'devices-ice40', 'devices-ecp5', 'devices-gowin', 'xise', 'drawing-sync'],
    'web/js': ['templates', 'c-templates'] };
  for (const [dir, names] of Object.entries(MOVED)) {
    for (const e of names) {
      const [n, to = n] = e.split(':');   // (server/family.js is core/boards-family.js: the package's family.js was core/family.js)
      const old = await import(`../${dir}/${n}.js`), now = await import(`../core/${to}.js`);
      assert.ok(Object.keys(now).length > 0, n);
      assert.deepEqual(Object.keys(old).sort(), Object.keys(now).sort(), n);
      for (const k of Object.keys(now)) assert.equal(old[k], now[k], `${n}.${k}`);
    }
  }
});

test('the layers\' check finds each forbidden direction (#3541)', () => {
  assert.deepEqual(layerCrossings('server/mcp-x.js', "const T = await import('../web/js/templates.js');"), ['server/mcp-x.js -> ../web/js/templates.js']);
  assert.deepEqual(layerCrossings('web/js/a.js', "import { findPart } from '../../server/devices.js';"), ['web/js/a.js -> ../../server/devices.js']);
  assert.deepEqual(layerCrossings('core/a.js', "export * from '../server/x.js';\nimport '../web/js/y.js';"), ['core/a.js -> ../server/x.js', 'core/a.js -> ../web/js/y.js']);
  assert.deepEqual(layerCrossings('packages/silinx-fpga/src/a.js', "import { x } from '../../../core/x.js';"), ['packages/silinx-fpga/src/a.js -> ../../../core/x.js']);
  // the allowed ones: both editions to core/, core/ to the packages, a page's /core/…, a package's own files
  assert.deepEqual(['server/a.js', 'web/js/a.js', 'core/a.js', 'packages/silinx-hdl/src/a.js'].flatMap(f => layerCrossings(f,
    "import '../core/x.js'; import '../../core/x.js'; import '/core/x.js'; import '../packages/silinx-fpga/src/parts.js'; import './y.js';")), []);
});
