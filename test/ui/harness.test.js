// UI: the harness itself. One UI test runs alone (node --test --test-name-pattern), here a test that
// is not the first of its file, in a node of its own (#64).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { ROOT, BROWSER, findChrome, missingDependencies, dependenciesMessage, setupUi, uiTest } from './harness.js';

const skip = BROWSER === 'chrome' && !findChrome() ? 'Google Chrome / Chromium not found (set CHROME_PATH): UI tests skipped' : undefined;

test('one UI test alone with --test-name-pattern (the second of hints.test.js)', { timeout: 180000, skip }, () => {
  const missing = missingDependencies();
  assert.deepEqual(missing, [], dependenciesMessage(missing));
  const name = 'Verilog: unused bits of an input bus';
  // (NODE_TEST_CONTEXT: this test's runner, not one of the child's own)
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', `--test-name-pattern=^${name}`, path.join(ROOT, 'test/ui/hints.test.js')], { cwd: ROOT, env, encoding: 'utf8', timeout: 170000 });
  const out = `${r.stdout}\n${r.stderr}`;
  assert.equal(r.status, 0, out);
  assert.match(out, new RegExp(`^ok 1 - ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm'), out);
  assert.match(out, /^# tests 1$/m, out);
  assert.match(out, /^# pass 1$/m, out);
  assert.match(out, /^# fail 0$/m, out);
  assert.doesNotMatch(out, /reading 'fold'|page errors/, out);
});

// (#2497) a page whose load event does not come: the error names the requests it still waits for, with no rejection left
// behind; a page that loads, as before
let env, server;
before(async () => {
  if (BROWSER !== 'chrome') return;
  env = await setupUi();
  // a page whose image never comes, and one with none
  server = http.createServer((req, res) => {
    if (req.url === '/stalled.png') return;   // (never answered)
    res.writeHead(200, { 'content-type': 'text/html' }).end(req.url === '/stalls' ? '<p>x</p><img src="/stalled.png">' : '<p>ok</p>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
});
after(async () => { server?.closeAllConnections(); server?.close(); await env?.teardown?.(); });

uiTest('#2497 a load that does not come names the requests still pending; a page that loads, as before', () => env || { skip: 'the CDP backend\'s (Chrome)' }, async (page) => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const unhandled = [];
  const onUnhandled = (e) => unhandled.push(String(e?.message || e));
  process.on('unhandledRejection', onUnhandled);
  try {
    await assert.rejects(page.navigated(() => page.send('Page.navigate', { url: `${base}/stalls` }), 3000),
      (e) => /^timed out waiting for Page\.loadEventFired after 3 s; requests still pending: http:\/\/127\.0\.0\.1:\d+\/stalled\.png \(Image, \d+\.\d s\)$/.test(e.message) || assert.fail(e.message));
    await page.goto(`${base}/loads`);
    assert.equal(await page.eval(() => document.body.textContent), 'ok');
    // a navigation that fails at once: its own error, and no wait left to reject later
    await assert.rejects(page.navigated(() => Promise.reject(new Error('no navigation')), 1000), /no navigation/);
    await new Promise((r) => setTimeout(r, 1500));
    assert.deepEqual(unhandled, []);
  } finally { process.off('unhandledRejection', onUnhandled); }
});
