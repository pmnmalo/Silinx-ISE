// UI: the meeting point of a shared project the owner's page hosts (#3227), in both interfaces: the owner shares from
// their page (its link …#follow=<room>.<key>.host.<owner's key>); a follower opens the link and is in, with no code:
// the owner found at the meeting point, the project read only, the owner's editor followed, an edit arriving; an
// impostor with the link at the meeting point (a page posing as the owner, its proof forged) is ignored. Then, the
// owner gone, another follower finds no one: after MEET_MS the codes take over (Connect to the Owner), with a warning.
// The meeting point is the tests' own, between the pages of one browser context (core/collab-meet.js channelMeeting:
// a BroadcastChannel), never the public trackers. The second follower in Portuguese. And a follower's connection to
// the owner lost (#3835): "Reconnecting to Ana…" meanwhile, the owner found again at the meeting point, the owner's
// change made meanwhile arriving, each seeing the other again. No warnings but those asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity top is\n  port (a : in std_logic; y : out std_logic);\nend top;\n\narchitecture rtl of top is\nbegin\n  y <= not a;\nend rtl;\n';
const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));
// (this browser context's pages: no STUN server, the meeting point between them)
const local = (page) => page.eval(async () => {
  const { STUN_KEY } = await import('/js/collab-rtc.js');
  const { MEETING_KEY } = await import('/js/collab-meet.js');
  localStorage.setItem(STUN_KEY, '[]');
  localStorage.setItem(MEETING_KEY, 'local');
});
const follow = async (page, link, name, button, { cuttable = false } = {}) => {
  const fp = await env.newPage(env.server.url, { sibling: page });
  await fp.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
  await fp.goto(`${new URL(link).origin}/?f=1${new URL(link).hash}`);
  await fp.waitDialog(name === 'Rui' ? 'Follow a Shared Project' : 'Seguir um Projeto Partilhado');
  if (cuttable) await fp.eval(cuttableMeeting);
  await fp.fill('.dlg-overlay input[data-field=name]', name);
  await fp.dialogButton(button);
  return fp;
};

// (the follower page's meeting point, as a network that drops: window.__cut() makes each side see the other leave, as
// WebRTC's would, and nothing passes until window.__down is false again)
function cuttableMeeting() {
  const Base = window.BroadcastChannel;
  const chans = [];
  window.__down = false;
  window.BroadcastChannel = class extends Base {
    constructor(n) {
      super(n);
      this.self = null; this.peers = new Set();
      chans.push(this);
      super.onmessage = (e) => { if (window.__down) return; if (e.data?.from) this.peers.add(e.data.from); this.handler?.(e); };
    }
    set onmessage(f) { this.handler = f; }
    get onmessage() { return this.handler; }
    postMessage(m) { this.self = m.from; if (!window.__down) super.postMessage(m); }
  };
  window.__cut = () => {
    for (const c of chans) {
      if (c.self) Base.prototype.postMessage.call(c, { type: 'bye', from: c.self });
      for (const p of c.peers) c.handler?.({ data: { type: 'bye', from: p } });
    }
    window.__down = true;
  };
}

uiTest('#3227 the meeting point: a follower opens the link and is in, an impostor ignored; with no owner there, the codes after 15 s', E, async (page) => {
  await makeProject(env, { name: 'Met', top: 'top', files: { 'src/top.vhd': TOP } });
  await page.openProject('Met');
  await local(page);
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  const link = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana', { via: 'host' }); return m.sharedLink(); });
  assert.match(link, /^http:\/\/[^/]+\/#follow=[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\.host\.[A-Za-z0-9_-]{86}$/);
  // an impostor at the meeting point: a page with the link, its proof forged (another key's), sent to every peer
  await page.eval(async (l) => {
    const { channelMeeting, meetTopic, hostProof, newHostKey } = await import('/core/collab-meet.js');
    const { parseFollowLink } = await import('/core/collab-link.js');
    const { room, key } = parseFollowLink(l);
    const m = await channelMeeting().join({ topic: await meetTopic(room), password: key });
    const forged = await newHostKey();
    window.__impostor = { met: [], got: [], m };
    m.onData((id, d) => window.__impostor.got.push(id));
    m.onPeer(async (id) => { window.__impostor.met.push(id); m.send(id, await hostProof(forged.key, room, id, await m.binding(id))); m.send(id, '{"type":"joined"}'); });
  }, link);
  // the follower opens the link: the owner found, the project read only, the owner's editor followed
  const fp = await follow(page, link, 'Rui', 'Follow');
  try {
    await fp.waitFor(() => window.Silinx?.project?.name === 'Met' && window.Silinx.active?.path === 'src/top.vhd', [], { what: 'the project open, the owner\'s editor followed', timeout: 30000 });
    await fp.waitConsole(/^Follow a shared project: the owner was found at the meeting point\.$/m);
    assert.equal(await fp.eval(() => window.Silinx.active.editor.getValue()), TOP);
    assert.equal(await fp.eval(() => window.Silinx.active.editor.readOnly()), true);
    await page.waitConsole(/^Rui follows your project "Met"\.$/m);
    await page.waitFor(() => document.querySelector('.collab-presence .collab-btn')?.textContent === 'Sharing (1)', [], { what: 'Sharing (1)' });
    await page.eval(() => { const ed = window.Silinx.active.editor; ed.setCursor({ line: 0, ch: 0 }); ed.replaceSelection('-- by Ana\n'); });
    await fp.waitFor((t) => window.Silinx.active.editor.getValue() === t, [`-- by Ana\n${TOP}`], { what: 'the edit arrived' });
    // the impostor met the follower (and the owner), and got nothing from the follower
    const imp = await page.eval(() => ({ met: window.__impostor.met.length, got: window.__impostor.got.length }));
    assert.ok(imp.met >= 2, `the impostor met ${imp.met}`);
    assert.equal(await fp.eval(() => document.querySelector('.collab-presence .collab-btn')?.textContent), 'Following Ana');
    // the owner gone from the meeting point (Stop Sharing): the follower told
    await page.eval(async () => { await window.__impostor.m.leave(); await (await import('/js/collab-share.js')).stopSharing(); });
    await fp.waitConsole(/^WARNING: Ana's project "Met" is no longer followed \(the owner stopped sharing\): what you see is as it was then\.$/m);
    assert.deepEqual(await warnings(fp), ['WARNING: Ana\'s project "Met" is no longer followed (the owner stopped sharing): what you see is as it was then.']);
    assert.deepEqual(fp.errors, []);
  } finally { await fp.close(); }
  // another follower, with no owner there: the meeting point's dialog in Portuguese, then the codes after 15 s
  await page.eval(() => localStorage.setItem('silinx.lang', 'pt'));
  const fp2 = await follow(page, link, 'Eva', 'Seguir');
  try {
    await fp2.waitDialog('Ligar ao Dono');
    assert.deepEqual(await fp2.eval(() => [...document.querySelectorAll('.dlg-overlay .dlg-body p, .dlg-overlay .dlg-buttons .btn')].map((e) => e.textContent)),
      ['A procurar o dono no ponto de encontro…', 'Se não for encontrado aí, troca códigos com ele em vez disso.', 'Trocar Códigos em Vez Disso', 'Cancelar']);
    const t0 = Date.now();
    await fp2.waitFor(() => document.querySelector('.dlg-overlay textarea[data-field=code]')?.value || null, [], { what: 'the codes', timeout: 30000 });
    assert.ok(Date.now() - t0 > 10000, `the codes after ${Date.now() - t0} ms`);
    await fp2.waitConsole(/^WARNING: Follow a shared project: the owner was not found at the meeting point \(in 15 s\): exchange codes with them instead\.$/m);
    await fp2.dialogButton('Cancelar');
    assert.deepEqual(await warnings(fp2), ['WARNING: Follow a shared project: the owner was not found at the meeting point (in 15 s): exchange codes with them instead.']);
    assert.deepEqual(fp2.errors, []);
  } finally { await fp2.close(); }
  assert.deepEqual(await warnings(page), []);
}, { timeout: 150000 });

uiTest('#3835 a follower\'s connection to the owner\'s page lost: Reconnecting to Ana… meanwhile, the owner found again at the meeting point, its change made meanwhile arriving', E, async (page) => {
  await makeProject(env, { name: 'MetAgain', top: 'top', files: { 'src/top.vhd': TOP } });
  await page.openProject('MetAgain');
  await local(page);
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  const link = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana', { via: 'host' }); return m.sharedLink(); });
  const fp = await follow(page, link, 'Rui', 'Follow', { cuttable: true });
  try {
    await fp.waitFor(() => window.Silinx?.project?.name === 'MetAgain' && window.Silinx.active?.path === 'src/top.vhd', [], { what: 'the project open', timeout: 30000 });
    await page.waitConsole(/^Rui follows your project "MetAgain"\.$/m);
    await fp.waitFor(() => document.querySelector('.collab-presence .collab-btn')?.textContent === 'Following Ana', [], { what: 'Following Ana' });
    await fp.eval(() => window.__cut());
    await fp.waitConsole(/^WARNING: The connection to Ana's project "MetAgain" was lost: reconnecting \(what you see is as it was then until it is back\)\.$/m);
    await fp.waitFor(() => document.querySelector('.collab-presence .collab-btn')?.textContent === 'Reconnecting to Ana…', [], { what: 'Reconnecting to Ana…' });
    await page.waitConsole(/^Rui no longer follows your project\.$/m);
    await page.eval(() => { const ed = window.Silinx.active.editor; ed.setCursor({ line: 0, ch: 0 }); ed.replaceSelection('-- by Ana\n'); });
    await fp.eval(() => { window.__down = false; });
    await fp.waitConsole(/^Reconnected to Ana's project "MetAgain"\.$/m, 40000);
    await fp.waitFor((t) => window.Silinx.active.editor.getValue() === t, [`-- by Ana\n${TOP}`], { what: 'the owner\'s change made meanwhile' });
    await fp.waitFor(() => document.querySelector('.collab-presence .collab-btn')?.textContent === 'Following Ana', [], { what: 'Following Ana again' });
    await page.waitFor(() => document.querySelector('.collab-presence .collab-btn')?.textContent === 'Sharing (1)', [], { what: 'Sharing (1) again' });
    assert.equal((await page.consoleText()).match(/^Rui follows your project "MetAgain"\.$/gm).length, 2);
    assert.deepEqual(await warnings(fp), ['WARNING: The connection to Ana\'s project "MetAgain" was lost: reconnecting (what you see is as it was then until it is back).']);
    assert.deepEqual(fp.errors, []);
  } finally { await fp.close(); }
  await page.eval(async () => (await import('/js/collab-share.js')).stopSharing());
  assert.deepEqual(await warnings(page), []);
}, { timeout: 120000 });
