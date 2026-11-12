// UI: following a room whose owner is hostile (#3361), in both interfaces: the room's files pass the import gate before
// the page shows one (a web page under a source's name: not shown, its reason in the console), and a room past what a
// follower takes (its files) is left, with an error in the console; the follow dialog of a room the owner's page hosts
// names the public servers the page reaches (the meeting point's trackers, the STUN server), in Portuguese too. The
// owner is a participant of the test's own (core/collab-client.js), on the relay of the test's server.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { setupUi, uiTest } from './harness.js';
import { shareRoom } from '../../core/collab-client.js';
import { projectDoc, publishProject } from '../../core/collab-doc.js';
import { followLink, relayUrl } from '../../core/collab-link.js';
import { newHostKey } from '../../core/collab-meet.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = 'entity top is\nend top;\n';
const plant = (doc, path, text) => { const yt = new Y.Text(); yt.insert(0, text); doc.getMap('files').set(path, yt); };
const notes = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|ERROR)/.test(l));

uiTest('#3361 a hostile owner\'s room: a file the import gate refuses not shown, said; past a follower\'s caps, left with an error', E, async (page) => {
  const doc = projectDoc();
  publishProject(doc, { project: { name: 'Hostile', top: 'top', device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, files: [{ path: 'src/top.vhd', lang: 'vhdl' }, { path: 'src/page.vhd', lang: 'vhdl' }], fileTree: ['src/top.vhd'] }, files: { 'src/top.vhd': TOP }, owner: 'Eve' });
  plant(doc, 'src/page.vhd', '<!doctype html><html><body><script>alert(1)</script></body></html>');
  const owner = await shareRoom({ url: relayUrl(env.server.url, 'share'), doc, user: { name: 'Eve' } });
  try {
    const link = followLink(`${new URL(env.server.url).origin}/`, owner.room, owner.key);
    await page.goto(`${new URL(link).origin}/?f=1${new URL(link).hash}`);
    await page.waitDialog('Follow a Shared Project');
    await page.fill('.dlg-overlay input[data-field=name]', 'Rui');
    await page.dialogButton('Follow');
    await page.waitFor(() => window.Silinx?.project?.name === 'Hostile' && window.Silinx.startupChecked, [], { what: 'the shared project open', timeout: 20000 });
    // the file the gate refuses: not shown, its reason said once
    const refused = 'WARNING: Follow a shared project: src/page.vhd: not shown: a web page (HTML), not the file its name says.';
    await page.waitConsole(/src\/page\.vhd: not shown/);
    const opened = await page.eval(async () => { try { await window.SilinxApp.openFile('src/page.vhd'); } catch { /* refused */ } return window.Silinx.docs.some((d) => d.path === 'src/page.vhd' && d.editor?.getValue?.().includes('<script>')); });
    assert.equal(opened, false);
    assert.equal(await page.eval(async () => { await window.SilinxApp.openFile('src/top.vhd'); return window.Silinx.active?.editor?.getValue(); }), TOP);
    // (opening it: refused, the error in the console, #3540)
    const cannot = 'ERROR: cannot open src/page.vhd: file \'src/page.vhd\' not shown: a web page (HTML), not the file its name says';
    assert.deepEqual(await notes(page), [refused, cannot]);
    // past the files a follower takes: left, with an error
    doc.transact(() => { for (let i = 0; i < 5000; i++) plant(doc, `src/f${i}.v`, ''); });
    const why = 'the shared project has more files than a follower takes (5002, at most 5000)';
    await page.waitConsole(/no longer followed/);
    assert.deepEqual(await notes(page), [
      refused,
      cannot,
      `ERROR: Follow a shared project: ${why}.`,
      `WARNING: Eve's project "Hostile" is no longer followed (${why}): what you see is as it was then.`,
    ]);
  } finally { await owner.close(); }
});

uiTest('#3361 the follow dialog of a room the owner\'s page hosts names the public servers it reaches (trackers, STUN), in Portuguese too', E, async (page) => {
  const { pub } = await newHostKey();
  const link = `${new URL(env.server.url).origin}/#follow=${'R'.repeat(22)}.${'K'.repeat(43)}.host.${pub}`;
  const servers = () => page.eval(() => document.querySelector('.dlg-overlay .collab-servers')?.textContent ?? null);
  for (const pt of [false, true]) {
    await page.eval(async (lang) => { localStorage.setItem('silinx.lang', lang); localStorage.removeItem((await import('/js/collab-meet.js')).MEETING_KEY); }, pt ? 'pt' : 'en');
    await page.goto(`${new URL(link).origin}/?f=${pt ? 2 : 1}${new URL(link).hash}`);
    await page.waitDialog(pt ? 'Seguir um Projeto Partilhado' : 'Follow a Shared Project');
    const trackers = 'open.ftorrent.com, tracker.webtorrent.dev, tracker.openwebtorrent.com, tracker.btorrent.xyz, tracker.files.fm:7073';
    assert.equal(await servers(), pt
      ? `Esta página liga-se a servidores públicos, que veem o seu endereço IP: os rastreadores WebTorrent ${trackers} (para encontrar o dono) e o servidor STUN stun.l.google.com:19302.`
      : `This page connects to public servers, which see your IP address: the WebTorrent trackers ${trackers} (to find its owner) and the STUN server stun.l.google.com:19302.`);
    await page.dialogButton(pt ? 'Cancelar' : 'Cancel');
    await page.waitNoDialog();
  }
  // (a link with no owner's key: the codes only, the STUN server named)
  await page.eval(() => localStorage.setItem('silinx.lang', 'en'));
  await page.goto(`${new URL(link).origin}/?f=3#follow=${'R'.repeat(22)}.${'K'.repeat(43)}.host`);
  await page.waitDialog('Follow a Shared Project');
  assert.equal(await servers(), 'This page connects to public servers, which see your IP address: the STUN server stun.l.google.com:19302.');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // (a room on a relay: none named)
  await page.goto(`${new URL(link).origin}/?f=4#follow=${'R'.repeat(22)}.${'K'.repeat(43)}`);
  await page.waitDialog('Follow a Shared Project');
  assert.equal(await servers(), null);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.deepEqual(await notes(page), []);
});
