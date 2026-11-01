// A package's tarball in memory (#2444): core/tgz.js against the system's tar, and what it refuses
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkIntegrity, untar, untgz } from '../core/tgz.js';
import { fakeTgz } from './helpers-fake-tgz.mjs';

const dec = b => new TextDecoder().decode(b);

test('untgz: the files tar wrote, their folder left out: binary, empty, deep, a name over 100 characters', async () => {
  const long = `gen/${'x'.repeat(120)}.txt`, binary = Uint8Array.from({ length: 1500 }, (_, i) => i % 256);
  const { bytes } = fakeTgz({ 'package.json': '{"type":"module"}', 'gen/bundle.js': 'export {};', 'gen/a/b/empty.txt': '', 'gen/core.wasm': binary, [long]: 'long' });
  const files = await untgz(bytes);
  assert.deepEqual(Object.keys(files).sort(), ['gen/a/b/empty.txt', 'gen/bundle.js', 'gen/core.wasm', long, 'package.json'].sort());
  assert.equal(dec(files['gen/bundle.js']), 'export {};');
  assert.equal(files['gen/a/b/empty.txt'].length, 0);
  assert.deepEqual(files['gen/core.wasm'], binary);
  assert.equal(dec(files[long]), 'long');
});

function entry(name, data = '') {
  const b = new TextEncoder().encode(data), h = new Uint8Array(512 + Math.ceil(b.length / 512) * 512);
  h.set(new TextEncoder().encode(name));
  h.set(new TextEncoder().encode(`${b.length.toString(8).padStart(11, '0')}\0`), 124);
  h[156] = 48;
  h.set(b, 512);
  return h;
}

test('untar: a path out of the package refused; no entries, no files', () => {
  assert.throws(() => untar(entry('package/../../evil.js', 'x')), /a path out of the package: package\/\.\.\/\.\.\/evil\.js/);
  assert.throws(() => untar(entry('/etc/evil', 'x')), /a path out of the package: \/etc\/evil/);
  assert.deepEqual(untar(new Uint8Array(1024)), {});
  assert.equal(dec(untar(entry('package/a.txt', 'hi'))['a.txt']), 'hi');
});

test('untgz: bytes that are not gzip are an error', async () => {
  await assert.rejects(untgz(new Uint8Array([1, 2, 3, 4])));
});

test('checkIntegrity: npm\'s SHA-512; other bytes and another algorithm refused', async () => {
  const { bytes, integrity } = fakeTgz({ a: 'a' });
  await checkIntegrity(bytes, integrity);
  await assert.rejects(checkIntegrity(bytes.slice(1), integrity), /its SHA-512 is not the one of package-lock\.json/);
  await assert.rejects(checkIntegrity(bytes, 'sha1-abc'), /not a SHA-512 integrity: sha1-abc/);
  await assert.rejects(checkIntegrity(bytes, undefined), /not a SHA-512 integrity/);
});
