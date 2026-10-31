// nextpnr's chip databases fetched on first use (#2329): the release's step that leaves them out, then the download, its
// check, its cache and its errors, with a fake fetch (no network).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { chipdbReleaseUrl, chipdbCacheDir, leaveOutChipdbs, fetchChipdb, withChipdbFetch } from '../src/nextpnr-chipdb-node.js';

const NAME = '@silinx/nextpnr-himbaechel-spartan3e', FILE = 'chipdb-xc3s250e.bin.gz', DB = Buffer.from('the database'), BYTES = zlib.gzipSync(DB);
const URL_ = `https://github.com/pmnmalo/nextpnr-spartan/releases/download/v1.2.3/${FILE}`;
const manifest = () => ({ name: NAME, version: '1.2.3', url: chipdbReleaseUrl(NAME, '1.2.3'),
  files: { [FILE]: { size: BYTES.length, sha256: crypto.createHash('sha256').update(BYTES).digest('hex') } } });
const serving = (bytes, calls = []) => async url => { calls.push(url); return new Response(bytes); };

let tmp, savedDir;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-chipdb-'));
  savedDir = process.env.SILINX_CONFIG_DIR;
  process.env.SILINX_CONFIG_DIR = path.join(tmp, 'config');
});
afterEach(() => {
  if (savedDir === undefined) delete process.env.SILINX_CONFIG_DIR; else process.env.SILINX_CONFIG_DIR = savedDir;
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('the release of a package\'s version: the tags of each family', () => {
  assert.equal(chipdbReleaseUrl(NAME, '0.11.2'), 'https://github.com/pmnmalo/nextpnr-spartan/releases/download/v0.11.2/');
  assert.equal(chipdbReleaseUrl('@silinx/nextpnr-himbaechel-spartan6', '0.1.0'), 'https://github.com/pmnmalo/nextpnr-spartan/releases/download/spartan6-v0.1.0/');
  assert.throws(() => chipdbReleaseUrl('elkjs', '1.0.0'), /not a nextpnr package/);
});

test('leaveOutChipdbs: the databases replaced by a manifest of their sizes and hashes, the rest kept', () => {
  const pkg = path.join(tmp, 'pkg');
  fs.mkdirSync(path.join(pkg, 'chipdb'), { recursive: true });
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: NAME, version: '1.2.3' }));
  fs.writeFileSync(path.join(pkg, 'chipdb', FILE), BYTES);
  fs.writeFileSync(path.join(pkg, 'chipdb', 'other.txt'), 'kept');
  assert.equal(leaveOutChipdbs(pkg), BYTES.length);
  assert.deepEqual(fs.readdirSync(path.join(pkg, 'chipdb')).sort(), ['fetch.json', 'other.txt']);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(pkg, 'chipdb', 'fetch.json'), 'utf8')), manifest());
});

test('the first use downloads and says so; the next ones use the cache, silently, with no request', async () => {
  const calls = [], lines = [];
  const first = await fetchChipdb(manifest(), FILE, 'xc3s250ecp132', { log: l => lines.push(l), fetchFn: serving(BYTES, calls) });
  assert.deepEqual(Buffer.from(first), DB);
  assert.deepEqual(calls, [URL_]);
  assert.deepEqual(lines, [`Place & Route: downloading nextpnr's chip database of xc3s250ecp132 (0.0 MB, from github.com: once, then kept in ${chipdbCacheDir(NAME, '1.2.3')})…`]);
  assert.deepEqual(fs.readdirSync(chipdbCacheDir(NAME, '1.2.3')), [FILE], 'no temporary file left');
  lines.length = 0;
  const again = await fetchChipdb(manifest(), FILE, 'xc3s250ecp132', { log: l => lines.push(l), fetchFn: () => assert.fail('no request') });
  assert.deepEqual(Buffer.from(again), DB);
  assert.deepEqual(lines, []);
});

test('offline, or a server\'s error: a clear error, nothing cached', async () => {
  const offline = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(fetchChipdb(manifest(), FILE, 'xc3s250e', { fetchFn: offline }),
    e => e.message === `nextpnr's chip database of xc3s250e is not in this installation (the release zip leaves it out, #2329) and could not be downloaded from ${URL_} (fetch failed): connect to the Internet once, or choose the Silinx engine (Process Properties ▸ Place & Route Engine)`);
  await assert.rejects(fetchChipdb(manifest(), FILE, 'xc3s250e', { fetchFn: async () => new Response('', { status: 404 }) }), /\(HTTP 404\): connect to the Internet/);
  assert.equal(fs.existsSync(chipdbCacheDir(NAME, '1.2.3')), false);
});

test('a download that is not the recorded one is refused, and not cached', async () => {
  for (const bad of [zlib.gzipSync('another'), Buffer.from('short')]) {
    await assert.rejects(fetchChipdb(manifest(), FILE, 'xc3s250e', { fetchFn: serving(bad) }), /size or SHA-256 differs\): not used/);
  }
  assert.equal(fs.existsSync(chipdbCacheDir(NAME, '1.2.3')), false);
});

test('a damaged cache is downloaded again; a device the manifest does not list is an error', async () => {
  const dir = chipdbCacheDir(NAME, '1.2.3'), calls = [];
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, FILE), 'damaged');
  assert.deepEqual(Buffer.from(await fetchChipdb(manifest(), FILE, 'xc3s250e', { fetchFn: serving(BYTES, calls) })), DB);
  assert.equal(calls.length, 1);
  assert.deepEqual(fs.readFileSync(path.join(dir, FILE)), BYTES);
  await assert.rejects(fetchChipdb(manifest(), 'chipdb-xc3s999e.bin.gz', 'xc3s999e', { fetchFn: serving(BYTES) }), /no chip database chipdb-xc3s999e\.bin\.gz/);
});

test('withChipdbFetch: the package\'s own database when it has it; its manifest when not; other errors as they were', async () => {
  const chipdbDir = path.join(tmp, 'chipdb'), missing = path.join(chipdbDir, FILE);
  const enoent = () => Object.assign(new Error('ENOENT'), { code: 'ENOENT', path: missing });
  const own = new Uint8Array([1]);
  assert.equal(await withChipdbFetch({ chipdb: async () => own }, { fetchFn: () => assert.fail('no request') }).chipdb('xc3s250e'), own);
  const io = withChipdbFetch({ chipdb: async () => { throw enoent(); } }, { fetchFn: serving(BYTES) });
  await assert.rejects(io.chipdb('xc3s250e'), /ENOENT/, 'no manifest: a checkout with a broken install, the error as it was');
  fs.mkdirSync(chipdbDir);
  fs.writeFileSync(path.join(chipdbDir, 'fetch.json'), JSON.stringify(manifest()));
  const lines = [];
  assert.deepEqual(Buffer.from(await io.chipdb('xc3s250e', l => lines.push(l))), DB);
  assert.equal(lines.length, 1);
  const other = new Error('no chip database for this part');
  await assert.rejects(withChipdbFetch({ chipdb: async () => { throw other; } }).chipdb('xc9'), e => e === other);
});

test('the real package: nextpnrNode reads its own database; a download of its file gives the same bytes', async () => {
  const { nextpnrNode } = await import('../src/nextpnr-node.js');
  const own = await nextpnrNode().chipdb('xc3s100ecp132', () => assert.fail('nothing to download'));
  assert.ok(own.length > 1e6);
  const pkg = path.dirname(path.dirname(fileURLToPath(import.meta.resolve('@silinx/nextpnr-himbaechel-spartan3e'))));
  const file = 'chipdb-xc3s100e.bin.gz', gz = fs.readFileSync(path.join(pkg, 'chipdb', file));
  const m = { name: NAME, version: '1.2.3', url: chipdbReleaseUrl(NAME, '1.2.3'), files: { [file]: { size: gz.length, sha256: crypto.createHash('sha256').update(gz).digest('hex') } } };
  const fetched = await fetchChipdb(m, file, 'xc3s100ecp132', { fetchFn: serving(gz) });
  assert.ok(Buffer.from(fetched).equals(Buffer.from(own)), 'the same database nextpnr reads');
});
