// The Development menu's data in a real build of the single file (#707): scripts/build-standalone.mjs run on a
// repository of its own (a temporary folder: two commits, the first tagged as the last release, its own
// changes/ fragments) against GitHub's API served here (GITHUB_API_URL, as a workflow gives it). A development
// build carries its changes typed by their issues' labels, never the token; the same commit tagged v<VERSION>, a
// release, carries none and asks the API nothing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../core/version.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = 'test-token-not-in-the-file';
const LABELS = { 5: ['bug', 'synthesis'], 6: ['enhancement', 'interface'], 7: ['tests & CI'] };
const FRAG = n => `In detail:\n\n- **Change ${n} (#${n}):** its text.\n`;
let root, api, asked = [], skip;

before(async () => {
  const require = createRequire(path.join(ROOT, 'package.json'));
  let modules;
  try {
    const cm = require.resolve('@codemirror/view');
    modules = cm.slice(0, cm.lastIndexOf(`${path.sep}node_modules${path.sep}`) + `${path.sep}node_modules`.length);
    require.resolve('esbuild');
  } catch { skip = 'esbuild / @codemirror not installed (npm ci)'; return; }
  // GitHub's API: an issue's labels, every request recorded (its path and its token)
  api = http.createServer((req, res) => {
    asked.push([req.url, req.headers.authorization]);
    const n = +/\/issues\/(\d+)$/.exec(req.url)?.[1];
    res.writeHead(LABELS[n] ? 200 : 404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ number: n, labels: (LABELS[n] || []).map(name => ({ name })) }));
  });
  await new Promise(ok => api.listen(0, '127.0.0.1', ok));
  // the repository: its scripts and fragments its own, the rest linked
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'silinx-devmenu-'));
  await fs.mkdir(path.join(root, 'scripts'));
  for (const f of ['build-standalone.mjs', 'build-info.mjs', 'changelog-release.mjs', 'pwa.mjs']) await fs.copyFile(path.join(ROOT, 'scripts', f), path.join(root, 'scripts', f));
  for (const d of ['web', 'core', 'packages', 'server', 'examples', 'test-designs', 'research']) await fs.symlink(path.join(ROOT, d), path.join(root, d), 'dir');
  for (const f of ['LICENSE', 'NOTICE', 'THIRD-PARTY-NOTICES.md', 'package-lock.json']) await fs.copyFile(path.join(ROOT, f), path.join(root, f));
  await fs.symlink(modules, path.join(root, 'node_modules'), 'dir');
  await fs.mkdir(path.join(root, 'changes'));
  for (const n of [5, 6, 7]) await fs.writeFile(path.join(root, 'changes', `${n}-change-${n}.md`), FRAG(n));
  const git = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { cwd: root, encoding: 'utf8' });
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'the last release');
  git('tag', 'v15.0.0');
  git('commit', '-q', '--allow-empty', '-m', 'a development commit');
});
after(async () => {
  api?.close();
  if (root) await fs.rm(root, { recursive: true, force: true });
});

// the build, run asynchronously (a synchronous child would block this process's API server); its single file
async function build() {
  const env = { ...process.env, GITHUB_TOKEN: TOKEN, GITHUB_API_URL: `http://127.0.0.1:${api.address().port}` };
  delete env.GITHUB_REF;
  const out = await new Promise((ok, fail) => {
    const p = spawn(process.execPath, [path.join(root, 'scripts/build-standalone.mjs')], { cwd: root, env });
    let log = '';
    p.stdout.on('data', d => { log += d; }); p.stderr.on('data', d => { log += d; });
    p.on('close', code => (code === 0 ? ok(log) : fail(new Error(`build failed (${code}):\n${log}`))));
  });
  return { log: out, html: await fs.readFile(path.join(root, 'dist', 'Silinx-ISE.html'), 'utf8') };
}
// the build's data in the bundle (core/version.js BUILD, minified: unquoted keys)
const changesOf = html => [...html.matchAll(/issue:(\d+),type:"(feature|bugfix|other)"/g)].map(m => [+m[1], m[2]]);

test('a development build: its changes since the last release typed by their labels, the token only in the requests; tagged a release: none, nothing asked (#707)', { timeout: 600000, skip }, async () => {
  const dev = await build();
  assert.match(dev.log, /development build dev:[0-9a-f]{7}, 3 change\(s\) since 15\.0\.0/);
  assert.match(dev.html, /since:"15\.0\.0",changes:\[/);
  assert.deepEqual(changesOf(dev.html), [[7, 'other'], [6, 'feature'], [5, 'bugfix']]);
  assert.deepEqual(asked.map(a => a[0]).sort(), ['/repos/pmnmalo/Silinx-ISE/issues/5', '/repos/pmnmalo/Silinx-ISE/issues/6', '/repos/pmnmalo/Silinx-ISE/issues/7']);
  assert.ok(asked.every(a => a[1] === `Bearer ${TOKEN}`));
  assert.ok(!dev.html.includes(TOKEN), 'the token is not in the file');
  assert.match(dev.html, /Development/);
  // the same commit tagged as this version: a release build, no changes, the API not asked
  spawnSync('git', ['tag', `v${VERSION}`], { cwd: root });
  asked = [];
  const rel = await build();
  assert.match(rel.log, new RegExp(`^Version: ${VERSION.replace(/\./g, '\\.')}$`, 'm'));
  assert.doesNotMatch(rel.html, /since:"[^"]*",changes:\[/);
  assert.deepEqual(changesOf(rel.html), []);
  assert.deepEqual(asked, [], 'a release asks GitHub nothing');
  assert.ok(!rel.html.includes(TOKEN));
});
