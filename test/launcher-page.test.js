// The one-time code off the opener's command line (#3409): the address a launcher opens is written into a page of the
// configuration folder, readable by its owner only, which the opener is given instead; and the configuration folder
// kept its owner's (#3410): one made 0755 with a 0644 config.json is 0700 / 0600 once the server starts or the
// configuration is saved (not on Windows).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = fs.realpathSync(await scratchEnv('silinx-launcher-page-test-')); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { openerCommand, startServer } = await import('../server/server.js');
const { launchTarget, redirectPage, sweepPages, PAGE_TTL } = await import('../server/open-page.js');
const { tightenConfigFolder, tightenedMessage } = await import('../server/config-folder.js');
const { saveConfig } = await import('../server/toolchain.js');
const POSIX = process.platform !== 'win32';
const CODE = 'Zq3-one_time_code_abcdefghij';
const URL_ = `http://127.0.0.1:8642/#code=${CODE}`;
const mode = f => fs.statSync(f).mode & 0o777;

test('#3409 the opener\'s arguments hold no code and no token: the path of a page that leads to the address', () => {
  const dir = path.join(tmp, 'pages');
  for (const [platform, cmd] of [['darwin', 'open'], ['linux', 'xdg-open'], ['win32', 'cmd']]) {
    for (const url of [URL_, 'http://127.0.0.1:8642/#token=abcdefghijklmnopqrstuvwx']) {
      const [c, args] = openerCommand(url, { platform, target: u => launchTarget(u, { dir }) });
      assert.equal(c, cmd);
      const all = args.join(' ');
      assert.doesNotMatch(all, /code=|token=|Zq3|abcdefghijklmnop/, `${platform}: ${all}`);
      const page = args[args.length - 1];
      assert.equal(path.dirname(page), dir);
      assert.match(path.basename(page), /^open-[A-Za-z0-9_-]+\.html$/);
      assert.equal(fs.readFileSync(page, 'utf8'), redirectPage(url));
      if (POSIX) assert.equal(mode(page), 0o600);
    }
  }
  // (an address with neither: as it is)
  assert.deepEqual(openerCommand('http://127.0.0.1:8642/', { platform: 'darwin', target: u => launchTarget(u, { dir }) }), ['open', ['http://127.0.0.1:8642/']]);
});

test('#3409 the page: the browser sent on to the address at once, the address escaped as an attribute and as a script string', () => {
  const t = redirectPage(URL_);
  assert.ok(t.includes(`<meta http-equiv="refresh" content="0;url=${URL_}">`));
  assert.ok(t.includes(`<script>location.replace("${URL_}");</script>`));
  assert.ok(t.includes('<meta name="referrer" content="no-referrer">'));
  const odd = redirectPage('http://127.0.0.1:1/#code=a"><script>x</script>&b');
  assert.ok(odd.includes('content="0;url=http://127.0.0.1:1/#code=a&quot;>&lt;script>x&lt;/script>&amp;b"'));
  assert.ok(odd.includes('location.replace("http://127.0.0.1:1/#code=a\\">\\u003cscript>x\\u003c/script>&b")'));
});

test('#3409 the pages past the code\'s minute are deleted by the next launch; the others and other files kept', () => {
  const dir = path.join(tmp, 'sweep');
  fs.mkdirSync(dir);
  const old = path.join(dir, 'open-old.html'), fresh = path.join(dir, 'open-fresh.html'), other = path.join(dir, 'config.json');
  for (const f of [old, fresh, other]) fs.writeFileSync(f, 'x');
  const past = new Date(Date.now() - 2 * PAGE_TTL);
  fs.utimesSync(old, past, past);
  fs.utimesSync(other, past, past);
  sweepPages(dir, Date.now() - PAGE_TTL);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['config.json', 'open-fresh.html']);
  // (and by launchTarget itself, before it writes its page)
  fs.utimesSync(fresh, past, past);
  const page = launchTarget(URL_, { dir });
  assert.deepEqual(fs.readdirSync(dir).sort(), ['config.json', path.basename(page)].sort());
});

test('#3410 tightenConfigFolder: a folder 0755 and its config.json 0644 made 0700 and 0600, said once', { skip: !POSIX }, () => {
  const dir = path.join(tmp, 'loose'), file = path.join(dir, 'config.json');
  fs.mkdirSync(dir, { mode: 0o755 });
  fs.chmodSync(dir, 0o755);
  fs.writeFileSync(file, '{}', { mode: 0o644 });
  fs.chmodSync(file, 0o644);
  const changed = tightenConfigFolder({ dir, file });
  assert.deepEqual(changed, [{ path: dir, was: '755' }, { path: file, was: '644' }]);
  assert.equal(tightenedMessage(changed), "Silinx: the configuration folder made its owner's only: loose (was 755), config.json (was 644)");
  assert.deepEqual([mode(dir), mode(file)], [0o700, 0o600]);
  assert.deepEqual(tightenConfigFolder({ dir, file }), []);
  assert.equal(tightenedMessage([]), null);
  // (not on Windows, whose modes are not these)
  fs.chmodSync(dir, 0o755);
  assert.deepEqual(tightenConfigFolder({ dir, file, platform: 'win32' }), []);
  assert.equal(mode(dir), 0o755);
});

test('#3410 serve: the configuration folder 0755 with a 0644 config.json is 0700 / 0600 once the server starts; saveConfig too', { skip: !POSIX }, async () => {
  const dir = process.env.SILINX_CONFIG_DIR, file = path.join(dir, 'config.json');
  fs.writeFileSync(file, '{"mode":"local"}');
  fs.chmodSync(file, 0o644);
  fs.chmodSync(dir, 0o755);
  const log = console.log, lines = [];
  console.log = l => lines.push(String(l));
  let srv;
  try { srv = await startServer({ port: 0 }); } finally { console.log = log; }
  try {
    assert.deepEqual([mode(dir), mode(file)], [0o700, 0o600]);
    assert.ok(lines.includes(`Silinx: the configuration folder made its owner's only: ${path.basename(dir)} (was 755), config.json (was 644)`), lines.join('\n'));
  } finally { await new Promise(r => srv.close(r)); }
  fs.chmodSync(dir, 0o755);
  await saveConfig({ mode: 'local' });
  assert.deepEqual([mode(dir), mode(file)], [0o700, 0o600]);
});
