// The browser edition's site for a UI test (#2103), as test/ui/standalone.test.js builds it: scripts/build-standalone.mjs
// --site in a root of its own under the test's temp folder (links to web, core, packages, examples and the installed
// packages; a git checkout of its own, its commit untagged: a development build), served over HTTP as GitHub Pages
// serves it (no Content-Encoding, readable from any page).
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { ROOT } from './harness.js';

// (a pushed tag's CI: its GITHUB_REF would make the build the release's, #1354)
const devEnv = () => { const e = { ...process.env }; delete e.GITHUB_REF; return e; };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.gz': 'application/gzip',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

/** The site built into tmp and served: { url, served (the paths asked), close() }, or { skip } without the build's packages. */
export async function buildSite(tmp) {
  const require = createRequire(path.join(ROOT, 'package.json'));
  let modules;
  try {
    const cm = require.resolve('@codemirror/view');
    modules = cm.slice(0, cm.lastIndexOf(`${path.sep}node_modules${path.sep}`) + `${path.sep}node_modules`.length);
    require.resolve('esbuild');
    require.resolve('elkjs/package.json');
  } catch { return { skip: 'esbuild / @codemirror / elkjs not installed (npm install): standalone build test skipped' }; }
  const root = path.join(tmp, 'site-build');
  await fs.mkdir(path.join(root, 'scripts'), { recursive: true });
  for (const f of ['build-standalone.mjs', 'build-info.mjs', 'changelog-release.mjs', 'pwa.mjs']) await fs.copyFile(path.join(ROOT, 'scripts', f), path.join(root, 'scripts', f));
  const git = (...a) => spawnSync('git', a, { cwd: root, encoding: 'utf8' });
  git('init', '-q'); git('-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'build');
  for (const d of ['web', 'core', 'packages', 'server', 'examples', 'test-designs', 'research', 'changes']) await fs.symlink(path.join(ROOT, d), path.join(root, d), 'dir');
  for (const f of ['LICENSE', 'NOTICE', 'THIRD-PARTY-NOTICES.md']) await fs.copyFile(path.join(ROOT, f), path.join(root, f));
  await fs.symlink(modules, path.join(root, 'node_modules'), 'dir');
  const site = path.join(root, 'site'), served = [];
  const server = http.createServer(async (req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    served.push(rel);
    const f = path.join(site, rel);
    if (!f.startsWith(site + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const data = await fs.readFile(f);
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' }).end(data);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/build-standalone.mjs'), '--site', site, '--assets-url', url], { cwd: root, encoding: 'utf8', timeout: 180000, env: devEnv() });
  if (r.status !== 0) { server.close(); throw new Error(`standalone build failed: ${r.stderr || r.stdout}`); }
  return { url, site, served, close: () => server.close() };
}
