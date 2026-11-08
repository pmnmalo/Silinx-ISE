// The version a build shows (#135): the release's build (the commit tagged v<VERSION>) the version
// alone; any other commit "dev:abc1234 (2026-10-13 11:12)" (the same in
// Portuguese); outside a git checkout the version alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildInfo, devChanges } from '../scripts/build-info.mjs';
import { VERSION, BUILD, VERSION_LABEL, versionLabel } from '../core/version.js';

Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (k === 'silinx.lang' ? 'pt' : null), setItem() {}, removeItem() {} }, configurable: true, writable: true });
const { t } = await import('../web/js/i18n.js');

test('build info: a development commit, the release\'s tag, no git', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-build-'));
  try {
    assert.equal(buildInfo(dir, '1.2.3', {}), null, 'not a git checkout: the version alone');
    const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe', encoding: 'utf8' }).trim();
    git('init', '-q'); git('-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'a');
    const head = git('rev-parse', '--short=7', 'HEAD');
    const day = git('log', '-1', '--date=format:%Y-%m-%d %H:%M', '--format=%cd', 'HEAD');
    assert.deepEqual(buildInfo(dir, '1.2.3', {}), { commit: head, date: day });
    // the release workflow: its tag's push
    assert.equal(buildInfo(dir, '1.2.3', { GITHUB_REF: 'refs/tags/v1.2.3' }), null);
    assert.deepEqual(buildInfo(dir, '1.2.3', { GITHUB_REF: 'refs/heads/main' }), { commit: head, date: day });
    git('tag', 'v1.2.2');
    assert.deepEqual(buildInfo(dir, '1.2.3', {}), { commit: head, date: day }, 'another version\'s tag');
    git('tag', 'v1.2.3');
    assert.equal(buildInfo(dir, '1.2.3', {}), null, 'the release\'s commit');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('version label: the version alone, or the development commit (English and Portuguese)', () => {
  // the server and the tests (no __SILINX_BUILD__ defined): the version alone
  assert.equal(BUILD, null);
  assert.equal(VERSION_LABEL, VERSION);
  assert.equal(versionLabel(null), VERSION);
  assert.equal(versionLabel({ commit: 'abc1234' }), 'dev:abc1234');
  assert.equal(versionLabel({ commit: 'abc1234', date: '2026-10-13 11:12' }), 'dev:abc1234 (2026-10-13 11:12)');
  assert.equal(t('Silinx dev:abc1234 (2026-10-13 11:12)'), 'Silinx dev:abc1234 (2026-10-13 11:12)');
  assert.equal(t(versionLabel({ commit: 'abc1234' })), 'dev:abc1234');
  assert.equal(t('Silinx dev:abc1234 (2026-10-13 11:12) Project Navigator'), 'Silinx dev:abc1234 (2026-10-13 11:12) Project Navigator');
});

// #707: a development build's changes since the last release, typed by their issues' labels (GitHub's API faked here)
test('devChanges: the last release, the changes with their labels; the token only in the requests; offline, every change other (#707)', async () => {
  const files = [{ name: '5-x.md', text: 'In detail:\n\n- **X (#5):** y.\n' }, { name: '6-z.md', text: 'In detail:\n\n- **Z (#6):** w.\n' }];
  const asked = [];
  const fetch = async (url, o) => { asked.push([url, o.headers.authorization]); const n = +url.split('/').pop(); return { ok: n === 5, json: async () => ({ labels: [{ name: 'bug' }, 'interface'] }) }; };
  const r = await devChanges('.', { env: { GITHUB_TOKEN: 'secret-token' }, fetch, files, tags: ['v15.9.0', 'v15.11.3', 'v15.11.2', 'vnope'] });
  assert.equal(r.since, '15.11.3');
  assert.deepEqual(r.changes.map(c => [c.issue, c.type]), [[6, 'other'], [5, 'bugfix']]);
  assert.deepEqual(asked.map(a => a[0]).sort(), ['https://api.github.com/repos/pmnmalo/Silinx/issues/5', 'https://api.github.com/repos/pmnmalo/Silinx/issues/6']);
  assert.ok(asked.every(a => a[1] === 'Bearer secret-token'));
  assert.doesNotMatch(JSON.stringify(r), /secret-token/);
  // a request that fails: its change 'other'
  const failed = await devChanges('.', { env: { GITHUB_TOKEN: 't' }, fetch: async () => { throw new Error('offline'); }, files, tags: [] });
  assert.deepEqual([failed.since, failed.changes.map(c => c.type)], [null, ['other', 'other']]);
  // no token (a developer's build, the tests): nothing asked
  let calls = 0;
  const local = await devChanges('.', { env: {}, fetch: async () => { calls++; throw new Error('no'); }, files, tags: ['v1.2.3'] });
  assert.deepEqual([calls, local.since, local.changes.map(c => c.type)], [0, '1.2.3', ['other', 'other']]);
});

test('a release build has no Development menu: the changes only on a development build, version.json without them (#707)', () => {
  const src = fs.readFileSync('scripts/build-standalone.mjs', 'utf8');
  // buildInfo is null on the release's commit (above): the build then computes no changes
  assert.match(src, /\nif \(BUILD\) Object\.assign\(BUILD, await devChanges\(ROOT\)\);\n/);
  assert.match(src, /build: BUILD && \{ commit: BUILD\.commit, date: BUILD\.date \}/);
  // the menu needs BUILD.changes (web/js/devmenu.js): none on a release, nor on the local server
  assert.match(fs.readFileSync('web/js/devmenu.js', 'utf8'), /if \(!build\?\.changes\) return null;/);
});
