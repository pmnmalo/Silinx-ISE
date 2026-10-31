// A file URL's pathname is not a file path: on Windows it is /D:/… (#2335). The tests and the research scripts take
// their files' paths with fileURLToPath.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const FILE_URL_PATHNAME = /(?:import\.meta\.url\s*\)|fixture\([^)]*\))\.pathname/;
// (these two have the pattern in their text: this test, and related-tests' examples of the sources it reads)
const QUOTING = new Set(['test/url-pathname.test.js', 'test/related-tests.test.js']);

test('the pattern finds a file URL\'s pathname, and not a page\'s', () => {
  for (const s of ["new URL('./a', import.meta.url).pathname", 'new URL(import.meta.url).pathname', "fixture('gates.json').pathname"]) assert.match(s, FILE_URL_PATHNAME);
  for (const s of ['location.pathname', "new URL(req.url, 'http://x').pathname", "fileURLToPath(fixture('gates.json'))"]) assert.doesNotMatch(s, FILE_URL_PATHNAME);
});

test('no test or research script uses a file URL\'s pathname as a path', () => {
  const files = execFileSync('git', ['ls-files', '-z', 'test', 'packages/silinx-fpga/test', 'packages/silinx-fpga/research'], { encoding: 'utf8', maxBuffer: 64 << 20 }).split('\0');
  const found = files.filter(f => /\.m?js$/.test(f) && !QUOTING.has(f) && fs.existsSync(f) && FILE_URL_PATHNAME.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(found, []);
});
