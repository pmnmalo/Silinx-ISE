// UI: a shared project through a relay on another Silinx (#3227, the browser edition's relay of its settings), in both
// interfaces: a second server, opted in for this site's pages (config.json's relay: their origin, a key), is the relay,
// one of this site's own relays (its config.json's relay.relays: its pages' Content-Security-Policy lets them connect to
// it, and to no other);
// the owner's page shares through it (its address and key), the link the site's own with the relay's address in it
// (…&relay=…); the follower opens the link, the follow dialog naming the relay's host, and follows the project through
// it; a link through a relay that is not one of the site's refused, saying why; the console's lines; the follower's page
// in Portuguese. No warnings but those asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env, relay, relayBase;
const KEY = 'a-relay-key-of-the-university-0123456789';
before(async () => {
  env = await setupUi();
  if (env.skip) return;
  const { createApp } = await import('../../server/server.js');
  const app = await createApp({ host: '127.0.0.1', token: 'relay-token', relay: { origins: [new URL(env.server.url).origin], key: KEY } });
  relay = app.listen(0, '127.0.0.1');
  await new Promise((r) => relay.once('listening', r));
  relayBase = `http://127.0.0.1:${relay.address().port}`;
  // (the site's own relays: this one; its config.json's, kept as the harness wrote it)
  const fs = await import('node:fs');
  const file = `${env.server.configDir}/config.json`;
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* none yet */ }
  fs.mkdirSync(env.server.configDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ...cfg, relay: { relays: [relayBase] } }, null, 2));
});
after(async () => { relay?.closeAllConnections?.(); if (relay) await new Promise((r) => relay.close(r)); await env?.teardown?.(); });
const E = () => env;

const TOP = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity top is\n  port (a : in std_logic; y : out std_logic);\nend top;\n\narchitecture rtl of top is\nbegin\n  y <= not a;\nend rtl;\n';
const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));

uiTest('#3227 through a relay on another Silinx: the owner shares through it, the link names it, the follower follows through it; Portuguese', E, async (page) => {
  // (the page's Content-Security-Policy, as the server sends it now: this relay among its connect-src, no scheme alone)
  await page.reload();
  await page.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
  const csp = (await fetch(env.server.url)).headers.get('content-security-policy');
  const connect = /connect-src ([^;]*)/.exec(csp)[1].split(' ');
  assert.ok(connect.includes(relayBase) && connect.includes(relayBase.replace(/^http/, 'ws')) && !connect.some((c) => /^wss?:$/.test(c)), connect.join(' '));
  await makeProject(env, { name: 'Relayed', top: 'top', files: { 'src/top.vhd': TOP } });
  await page.openProject('Relayed');
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  const link = await page.eval(async (address, key) => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana', { via: 'relay', relay: { address, key } }); return m.sharedLink(); }, relayBase, KEY);
  const host = new URL(relayBase).host;
  assert.equal(link.split('#')[0], `${new URL(env.server.url).origin}/`);
  assert.match(link, new RegExp(`^[^#]+#follow=[A-Za-z0-9_-]{22}\\.[A-Za-z0-9_-]{43}&relay=${encodeURIComponent(relayBase).replace(/\./g, '\\.')}$`));
  await page.waitConsole(new RegExp(`^Shared through the relay at ${host.replace(/\./g, '\\.')}: it sees no file, only who is in\\.$`, 'm'));
  // the follower: the site's link, the relay named, the project through it
  const fp = await env.newPage(env.server.url);
  try {
    await fp.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
    await fp.eval(() => localStorage.setItem('silinx.lang', 'pt'));
    await fp.goto(`${new URL(link).origin}/?f=1${new URL(link).hash}`);
    await fp.waitDialog('Seguir um Projeto Partilhado');
    assert.ok((await fp.eval(() => [...document.querySelectorAll('.dlg-overlay .collab-dlg p')].map((p) => p.textContent))).includes(`Através do retransmissor em ${host}.`));
    await fp.fill('.dlg-overlay input[data-field=name]', 'Rui');
    await fp.dialogButton('Seguir');
    await fp.waitFor(() => window.Silinx?.project?.name === 'Relayed' && window.Silinx.startupChecked, [], { what: 'the project through the relay', timeout: 30000 });
    await fp.waitFor(() => window.Silinx.active?.path === 'src/top.vhd', [], { what: 'the owner\'s editor followed' });
    assert.equal(await fp.eval(() => window.Silinx.active.editor.getValue()), TOP);
    await page.waitConsole(/^Rui follows your project "Relayed"\.$/m);
    // (the room: on the relay, not on this site's server)
    assert.equal(await page.eval(async () => (await import('/js/collab-share.js')).sharedLink() !== null), true);
    await page.eval(async () => (await import('/js/collab-share.js')).stopSharing());
    await fp.waitConsole(/^WARNING: Ana's project "Relayed" is no longer followed \(the owner stopped sharing\): what you see is as it was then\.$/m);
    // a link through a relay that is not one of the site's: refused, why said (its Content-Security-Policy would not let it connect)
    const other = link.replace(encodeURIComponent(relayBase), encodeURIComponent('https://relay.example.org'));
    await fp.goto(`${new URL(other).origin}/?f=2${new URL(other).hash}`);
    await fp.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
    await fp.waitConsole(/^ERROR: Follow a shared project: the relay at relay\.example\.org is not among this Silinx's relays \(config\.json's relay\.relays\): not followed\.$/m);
    assert.deepEqual(await warnings(fp), ['ERROR: Follow a shared project: the relay at relay.example.org is not among this Silinx\'s relays (config.json\'s relay.relays): not followed.']);
    assert.deepEqual(await warnings(page), []);
    assert.deepEqual(fp.errors, []);
  } finally { await fp.close(); }
});
