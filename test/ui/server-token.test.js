// UI (#2564): the server a launcher starts makes a token at every start, on loopback too. The page opened at
// the address with it (…/#token=…) reaches the API, drops the token from its address, and keeps it for the
// browser (the plain address works afterwards); a browser without it is refused. No warnings.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { setupUi } from './harness.js';
import { launchersOf, startLauncher } from '../launch.js';

let env, srv;
before(async () => {
  env = await setupUi({ server: false });
  if (env.skip) return;
  srv = await startLauncher(path.join(import.meta.dirname, '..', '..'), launchersOf()[0], await fsp.mkdtemp(path.join(env.tmp, 'token-')));
});
after(async () => { srv?.stop(); await env?.teardown?.(); });

test('#2564 the page opened with the server\'s token reaches the API and keeps the token; without it, refused', { timeout: 90000 }, async (t) => {
  if (env.skip) { t.skip(env.skip); return; }
  const r = await fetch(`${srv.url}/api/projects`, { method: 'POST', headers: srv.headers({ 'content-type': 'application/json' }), body: JSON.stringify({ name: 'TokenPj', template: 'blinky' }) });
  assert.ok(r.ok, `${r.status} ${await r.text()}`);
  // the page's own client (web/js/api.js, the module the app loaded)
  const projects = (page) => page.eval(() => import('/js/api.js').then(({ api }) => api.projects()).then((l) => l.map((p) => p.name), (e) => e.message));
  const listed = async (page) => assert.deepEqual(await projects(page), ['TokenPj']);
  const page = await env.newPage(srv.open);
  try {
    await listed(page);
    assert.equal(await page.eval(() => location.hash), '', 'the token is not left in the address');
    // the plain address (a bookmark, another tab of this browser): the token kept
    await page.goto(srv.url);
    await listed(page);
    assert.equal(await page.eval(() => fetch('/api/projects').then((x) => x.status)), 403, 'a request without the header');
  } finally { await page.close(); }
  // another browser (another user of this computer): no token, refused
  const other = await env.newPage(srv.url);
  try {
    assert.equal(await projects(other), 'this Silinx server needs its token: open the URL it printed at start-up');
  } finally { await other.close(); }
  // no warning from the server
  assert.doesNotMatch(srv.output(), /warn|error/i);
});
