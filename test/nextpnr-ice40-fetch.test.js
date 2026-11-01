// The iCE40's nextpnr on the local server, downloaded on first use (#2444): on a package of the test's own, no network
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ice40CacheDir, ice40Package, ice40Present, loadIce40 } from '../server/nextpnr-ice40-fetch.js';
import { openStatus } from '../server/open-flow.js';
import { fakeTgz } from './helpers-fake-tgz.mjs';

const NOT_INSTALLED = async () => { throw Object.assign(new Error('no'), { code: 'ERR_MODULE_NOT_FOUND' }); };
const FILES = { 'package.json': '{"type":"module"}', 'gen/bundle.js': 'export const runNextpnrIce40 = "the fake";\n' };
let n = 0;
function setup(files = FILES) {
  const { bytes, integrity } = fakeTgz(files);
  const pkg = { version: `0.0.${++n}`, url: 'https://registry.test/p.tgz', integrity };
  const calls = [];
  const fetchFn = async url => { calls.push(url); return new Response(bytes); };
  return { pkg, calls, fetchFn, bytes };
}
const config = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-config-'));
process.env.SILINX_CONFIG_DIR = config;
test.after(() => fs.rmSync(config, { recursive: true, force: true }));

test('downloaded once, checked, kept in the configuration folder; the log says so; the next load with no download', async () => {
  const { pkg, calls, fetchFn } = setup(), log = [];
  const m = await loadIce40({ pkg, fetchFn, installed: NOT_INSTALLED, log: l => log.push(l) });
  assert.equal(m.runNextpnrIce40, 'the fake');
  assert.deepEqual(calls, [pkg.url]);
  const dir = ice40CacheDir(pkg.version);
  assert.equal(dir, path.join(config, 'nextpnr', `nextpnr-ice40-${pkg.version}`));
  assert.deepEqual(log, [`Place & Route: downloading nextpnr-ice40 and icepack (about 80 MB, from registry.test: once, then kept in ${dir})…`]);
  assert.ok(fs.existsSync(path.join(dir, 'gen/bundle.js')));
  assert.deepEqual(fs.readdirSync(path.dirname(dir)).filter(f => f.endsWith('.tmp')), []);
  log.length = 0;
  assert.equal((await loadIce40({ pkg, fetchFn, installed: NOT_INSTALLED, log: l => log.push(l) })).runNextpnrIce40, 'the fake');
  assert.equal(calls.length, 1);
  assert.deepEqual(log, []);
});

test('the installed package first: no download; another error of its import is not hidden', async () => {
  const { pkg, calls, fetchFn } = setup();
  assert.equal((await loadIce40({ pkg, fetchFn, installed: async () => 'installed' })), 'installed');
  assert.deepEqual(calls, []);
  await assert.rejects(loadIce40({ pkg, fetchFn, installed: async () => { throw new Error('its syntax'); } }), /its syntax/);
});

test('refused, nothing kept: another SHA-512, no module in it; offline and HTTP errors say what to do; no entry in the lock', async () => {
  const bad = setup();
  await assert.rejects(loadIce40({ pkg: { ...bad.pkg, integrity: 'sha512-AAAA' }, fetchFn: bad.fetchFn, installed: NOT_INSTALLED }), /downloaded from https:\/\/registry\.test\/p\.tgz: its SHA-512 is not the one of package-lock\.json: not used/);
  assert.equal(fs.existsSync(ice40CacheDir(bad.pkg.version)), false);
  const empty = setup({ 'package.json': '{}' });
  await assert.rejects(loadIce40({ pkg: empty.pkg, fetchFn: empty.fetchFn, installed: NOT_INSTALLED }), /no gen\/bundle\.js/);
  assert.equal(fs.existsSync(ice40CacheDir(empty.pkg.version)), false);
  const { pkg } = setup();
  await assert.rejects(loadIce40({ pkg, fetchFn: async () => { throw new Error('offline'); }, installed: NOT_INSTALLED }), /could not be downloaded from https:\/\/registry\.test\/p\.tgz \(offline\): connect to the Internet once/);
  await assert.rejects(loadIce40({ pkg, fetchFn: async () => new Response('', { status: 404 }), installed: NOT_INSTALLED }), /\(HTTP 404\)/);
  await assert.rejects(loadIce40({ pkg: null, installed: NOT_INSTALLED }), /not installed: npm install @yowasp\/nextpnr-ice40/);
});

test('ice40Package: the version and SHA-512 of package-lock.json, those of the package installed; a lock without it: null', () => {
  const pkg = ice40Package();
  const installed = JSON.parse(fs.readFileSync(new URL('../node_modules/@yowasp/nextpnr-ice40/package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.version, installed.version);
  assert.equal(pkg.url, `https://registry.npmjs.org/@yowasp/nextpnr-ice40/-/nextpnr-ice40-${installed.version}.tgz`);
  assert.match(pkg.integrity, /^sha512-/);
  const f = path.join(config, 'lock.json');
  fs.writeFileSync(f, '{"packages":{}}');
  assert.equal(ice40Package(f), null);
  assert.equal(ice40Package(path.join(config, 'none.json')), null);
});

test('the status: available, here because the package is installed', () => {
  assert.equal(ice40Present(), true);
  const st = openStatus({ family: 'ice40', part: 'ice40up5k', package: 'sg48' });
  assert.equal(st.available, true);
  assert.equal(st.reason, 'ice40up5ksg48: nextpnr-ice40 and icepack');
});
