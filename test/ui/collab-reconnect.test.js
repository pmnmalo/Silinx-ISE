// UI: a shared project's connection lost and made again (#3835, phase 4 of #3180), in both interfaces: the owner
// shares (its editors' link); the editor's page follows it through this Silinx's relay, its WebSocket cut as a network
// would (a new one failing meanwhile); the toolbar says "Reconnecting to Ana…", the console the loss; the editor's
// change made meanwhile and the owner's both on both sides once it is back, on the disk too; the console's return; the
// owner sees the editor again, its project untrusted by the editor's change (#3355). A follower's page in Portuguese: "A religar a Ana…". The exact console lines; no
// warnings but those asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity top is\n  port (a : in std_logic; y : out std_logic);\nend top;\n\narchitecture rtl of top is\nbegin\n  y <= not a;\nend rtl;\n';
const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));
const type = (page, line, ch, s) => page.eval((l, c, t) => { const ed = window.Silinx.active.editor; ed.setCursor({ line: l, ch: c }); ed.replaceSelection(t); }, line, ch, s);
const label = (page) => page.eval(() => document.querySelector('.collab-presence .collab-btn')?.textContent);

// the link opened in a page of its own, its WebSockets watched (window.__down: a new one fails, as a network gone)
async function open(link, name, { pt = false } = {}) {
  const fp = await env.newPage(env.server.url);
  await fp.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
  if (pt) await fp.eval(() => localStorage.setItem('silinx.lang', 'pt'));
  await fp.goto(`${new URL(link).origin}/?f=1${new URL(link).hash}`);
  await fp.waitDialog(pt ? 'Seguir um Projeto Partilhado' : 'Follow a Shared Project');
  await fp.eval(() => {
    const Base = window.WebSocket;
    window.__socks = [];
    window.__down = false;
    window.WebSocket = class extends Base { constructor(...a) { super(...a); if (/\/collab\//.test(String(a[0]))) { window.__socks.push(this); if (window.__down) this.close(); } } };
  });
  await fp.fill('.dlg-overlay input[data-field=name]', name);
  await fp.dialogButton(pt ? 'Seguir' : 'Follow');
  await fp.waitFor(() => window.Silinx?.project && window.Silinx.startupChecked, [], { what: 'the shared project open', timeout: 30000 });
  return fp;
}
const cut = (fp) => fp.eval(() => { window.__down = true; window.__socks.at(-1).close(); });

uiTest('#3835 an editor\'s connection lost is made again: Reconnecting to Ana… meanwhile; its change made offline and the owner\'s on both sides, on the disk', E, async (page) => {
  await makeProject(env, { name: 'Flaky', top: 'top', files: { 'src/top.vhd': TOP } });
  await page.openProject('Flaky');
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  const edit = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.editorsLink(); });
  const ep = await open(edit, 'Rui');
  try {
    await ep.waitFor(() => window.Silinx.active?.path === 'src/top.vhd', [], { what: 'the owner\'s editor followed' });
    await page.waitConsole(/^Rui edits your project "Flaky" with you\.$/m);
    assert.equal(await label(ep), 'Following Ana');
    await new Promise((r) => setTimeout(r, 700));   // (both bound)
    await cut(ep);
    await ep.waitConsole(/^WARNING: The connection to Ana's project "Flaky" was lost: reconnecting \(your changes meanwhile are sent once it is back\)\.$/m);
    await ep.waitFor(() => document.querySelector('.collab-presence .collab-btn')?.textContent === 'Reconnecting to Ana…', [], { what: 'Reconnecting to Ana…' });
    assert.deepEqual(await ep.eval(() => [...document.querySelectorAll('.collab-presence .collab-badge')].map((b) => b.title)), ['Rui']);   // (no one else while lost)
    await page.waitConsole(/^Rui no longer follows your project\.$/m);
    // meanwhile: the editor's change, and the owner's
    await type(ep, 11, 0, '-- by Rui, offline\n');
    await type(page, 0, 0, '-- by Ana\n');
    await ep.eval(() => { window.__down = false; });
    await ep.waitConsole(/^Reconnected to Ana's project "Flaky": your changes made meanwhile are sent\.$/m, 30000);
    const both = `-- by Ana\n${TOP}-- by Rui, offline\n`;
    await page.waitFor((t) => window.Silinx.active.editor.getValue() === t, [both], { what: 'both changes at the owner\'s' });
    await ep.waitFor((t) => window.Silinx.active.editor.getValue() === t, [both], { what: 'both changes at the editor\'s' });
    for (let t = Date.now(); Date.now() - t < 8000 && await readWs(env, 'Flaky', 'src/top.vhd') !== both;) await new Promise((r) => setTimeout(r, 100));
    assert.equal(await readWs(env, 'Flaky', 'src/top.vhd'), both);
    await ep.waitFor(() => document.querySelector('.collab-presence .collab-btn')?.textContent === 'Following Ana', [], { what: 'Following Ana again' });
    await ep.waitFor(() => [...document.querySelectorAll('.collab-presence .collab-badge')].map((b) => b.title).join() === 'Ana,Rui', [], { what: 'who is in, again' });
    // (the owner sees the editor again)
    await page.waitFor(() => (document.querySelector('.collab-presence .collab-btn')?.textContent || '') === 'Sharing (1)', [], { what: 'Sharing (1) again' });
    assert.equal((await page.consoleText()).match(/^Rui edits your project "Flaky" with you\.$/gm).length, 2);
    assert.deepEqual(await warnings(ep), ['WARNING: The connection to Ana\'s project "Flaky" was lost: reconnecting (your changes meanwhile are sent once it is back).']);
    // (the owner's: the project untrusted by the editor's change, #3355)
    assert.deepEqual(await warnings(page), ['WARNING: Project "Flaky" was changed by an editor of its shared link: it is edited, checked, simulated and implemented with the Silinx toolchain; Xilinx ISE and programming a board or a PROM run only once you trust it. Trust Project']);
    assert.deepEqual(ep.errors, []);
  } finally { await ep.close(); }
  await page.eval(async () => (await import('/js/collab-share.js')).stopSharing());
});

uiTest('#3835 a follower\'s page in Portuguese: A religar a Ana… while lost, A seguir Ana again once back', E, async (page) => {
  await makeProject(env, { name: 'FlakyPt', top: 'top', files: { 'src/top.vhd': TOP } });
  await page.openProject('FlakyPt');
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  const link = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.sharedLink(); });
  const fp = await open(link, 'Rui', { pt: true });
  try {
    await fp.waitFor(() => document.querySelector('.collab-presence .collab-btn')?.textContent === 'A seguir Ana', [], { what: 'A seguir Ana' });
    await cut(fp);
    await fp.waitFor(() => document.querySelector('.collab-presence .collab-btn')?.textContent === 'A religar a Ana…', [], { what: 'A religar a Ana…' });
    await fp.waitConsole(/^WARNING: The connection to Ana's project "FlakyPt" was lost: reconnecting \(what you see is as it was then until it is back\)\.$/m);
    await type(page, 0, 0, '-- by Ana\n');
    await fp.eval(() => { window.__down = false; });
    await fp.waitConsole(/^Reconnected to Ana's project "FlakyPt"\.$/m, 30000);
    await fp.waitFor((t) => window.Silinx.active?.editor?.getValue() === t, [`-- by Ana\n${TOP}`], { what: 'the owner\'s change made meanwhile' });
    await fp.waitFor(() => document.querySelector('.collab-presence .collab-btn')?.textContent === 'A seguir Ana', [], { what: 'A seguir Ana again' });
    assert.deepEqual(await warnings(fp), ['WARNING: The connection to Ana\'s project "FlakyPt" was lost: reconnecting (what you see is as it was then until it is back).']);
    assert.deepEqual(await warnings(page), []);
    assert.deepEqual(fp.errors, []);
  } finally { await fp.close(); }
  await page.eval(async () => (await import('/js/collab-share.js')).stopSharing());
});
