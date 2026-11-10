// UI: a shared project, phase 1 (#3181), two participants in one test, in both interfaces: the owner shares the open
// project (File ▸ Share Project…, their name, the link), the follower opens the link (their name) and sees the project,
// the owner's open editor and cursor, read only (the notice at the right end of the toolbar, an edit refused: the
// text unchanged, nothing saved); an edit of the owner arrives (live, #3182); the follower browses alone and follows
// again; the presence in both toolbars, the follower's arrival in the owner's console; Stop Sharing from the presence's
// menu tells the follower; a drawing (an FSM) followed read only; in Portuguese (the labels: the console is not
// translated). No warnings but those asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity top is\n  port (a : in std_logic; y : out std_logic);\nend top;\n\narchitecture rtl of top is\nbegin\n  y <= not a;\nend rtl;\n';
const PASS = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity pass1 is\n  port (a : in std_logic; y : out std_logic);\nend pass1;\n\narchitecture rtl of pass1 is\nbegin\n  y <= a;\nend rtl;\n';
const consoleWarnings = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(WARNING|AVISO)/.test(l.trim()));
const active = (page) => page.eval(() => window.Silinx.active?.path || window.Silinx.active?.id || null);

// the owner shares the open project from the File menu: the link (the dialog closed)
async function share(page, name, { pt = false } = {}) {
  await page.menu(pt ? 'Ficheiro' : 'File', pt ? 'Partilhar Projeto…' : 'Share Project…');
  await page.waitDialog(pt ? 'Partilhar Projeto' : 'Share Project');
  await page.fill('.dlg-overlay input[data-field=name]', name);
  await page.dialogButton(pt ? 'Partilhar' : 'Share');
  const link = await page.waitFor(() => document.querySelector('.dlg-overlay input[data-field=link]')?.value || null, [], { what: 'the link' });
  await page.dialogButton(pt ? 'Fechar' : 'Close');
  await page.waitNoDialog();
  return link;
}
// the follower opens the link in a page of their own (pt: in Portuguese), their name given
async function follow(link, name, { pt = false } = {}) {
  const fp = await env.newPage(env.server.url);
  await fp.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
  if (pt) await fp.eval(() => localStorage.setItem('silinx.lang', 'pt'));
  const u = new URL(link);
  await fp.goto(`${u.origin}/?f=1${u.hash}`);
  await fp.waitDialog(pt ? 'Seguir um Projeto Partilhado' : 'Follow a Shared Project');
  await fp.fill('.dlg-overlay input[data-field=name]', name);
  await fp.dialogButton(pt ? 'Seguir' : 'Follow');
  await fp.waitFor(() => window.Silinx?.project && window.Silinx.startupChecked, [], { what: 'the shared project open', timeout: 20000 });
  return fp;
}

uiTest('#3181 share and follow: the follower sees the project, the owner\'s editor and cursor, read only; an edit arrives; browsing alone; the presence; Stop Sharing', E, async (page) => {
  await makeProject(env, { name: 'Shared', top: 'top', files: { 'src/top.vhd': TOP, 'src/pass1.vhd': PASS } });
  await page.openProject('Shared');
  await page.eval(async () => { await window.SilinxApp.openFile('src/top.vhd'); window.Silinx.active.editor.setCursor({ line: 9, ch: 2 }); });
  const link = await share(page, 'Ana');
  assert.match(link, /^http:\/\/[^/]+\/#follow=[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);
  await page.waitConsole(/Sharing project "Shared": anyone with its link follows it live, read only/);
  assert.equal(await page.eval(() => document.querySelector('#toolbar .collab-btn')?.textContent), 'Sharing');
  const fp = await follow(link, 'Rui');
  try {
    // the project, the owner's open editor and cursor
    await fp.waitFor(() => window.Silinx.active?.path === 'src/top.vhd', [], { what: 'the owner\'s editor followed' });
    assert.equal(await fp.eval(() => window.Silinx.project.name), 'Shared');
    await fp.waitFor(() => window.Silinx.active.editor.getCursor().line === 9, [], { what: 'the owner\'s cursor' });
    assert.deepEqual(await fp.eval(() => window.Silinx.active.editor.getCursor()), { line: 9, ch: 2 });
    assert.equal(await fp.eval(() => window.Silinx.active.editor.getValue()), TOP);
    await fp.waitConsole(/^Following Ana's project "Shared", read only: their changes appear as they make them, and their open editor while you follow them \(Following Ana, in the toolbar\)\.$/m);
    // read only: the notice at the right end of the toolbar, an edit refused
    assert.equal(await fp.eval(() => window.Silinx.active.el.querySelector('.editor-bar > .gen-banner.read-only:last-child')?.textContent), 'Read-only, following Ana\'s project');
    assert.equal(await fp.eval(() => window.Silinx.active.editor.readOnly()), true);
    await fp.click('.doc:not([hidden]) .cm-content');
    await fp.type('-- mine');
    assert.equal(await fp.eval(() => window.Silinx.active.editor.getValue()), TOP);
    assert.equal(await fp.eval(() => !!window.Silinx.active.dirty), false);
    // the presence: both participants, in both toolbars; the follower in the owner's console
    await page.waitConsole(/^Rui follows your project "Shared"\.$/m);
    await page.waitFor(() => document.querySelector('#toolbar .collab-btn')?.textContent === 'Sharing (1)', [], { what: 'Sharing (1)' });
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#toolbar .collab-badge')].map((b) => [b.title, b.textContent])), [['Ana', 'A'], ['Rui', 'R']]);
    assert.deepEqual(await fp.eval(() => [...document.querySelectorAll('#toolbar .collab-badge')].map((b) => b.title)), ['Ana', 'Rui']);
    assert.equal(await fp.eval(() => document.querySelector('#toolbar .collab-btn').textContent), 'Following Ana');
    // the follower's cursor in the owner's editor
    await page.waitFor(() => document.querySelector('.doc:not([hidden]) .cm-peer-name')?.textContent === 'Rui', [], { what: 'Rui\'s cursor at the owner\'s' });
    // an edit of the owner arrives
    await page.eval(() => { const ed = window.Silinx.active.editor; ed.setCursor({ line: 0, ch: 0 }); ed.replaceSelection('-- by Ana\n'); });
    await fp.waitFor((t) => window.Silinx.active.editor.getValue() === t, [`-- by Ana\n${TOP}`], { what: 'the edit arrived' });
    // (live, #3182: its open editor bound to the shared text, not reloaded, nothing said)
    assert.doesNotMatch(await fp.consoleText(), /src\/top\.vhd reloaded|Changed by Ana/);
    // the owner opens another file: followed; the follower opens one of their own: browsing alone
    await page.eval(() => window.SilinxApp.openFile('src/pass1.vhd'));
    await fp.waitFor(() => window.Silinx.active?.path === 'src/pass1.vhd', [], { what: 'the owner\'s new editor followed' });
    await fp.eval(() => window.SilinxApp.openFile('src/top.vhd'));
    await fp.waitConsole(/^Browsing alone: Ana's editor is no longer followed \(Follow Ana, in the toolbar, follows it again\)\.$/m);
    assert.equal(await fp.eval(() => document.querySelector('#toolbar .collab-btn').textContent), 'Follow Ana');
    await page.eval(() => window.Silinx.active.editor.setCursor({ line: 5, ch: 0 }));
    await new Promise((r) => setTimeout(r, 600));
    assert.equal(await active(fp), 'src/top.vhd', 'not followed while browsing alone');
    // following again from the presence's menu
    await fp.click('#toolbar .collab-btn');
    await fp.waitForSelector('body > .menu-popup');
    assert.deepEqual(await fp.eval(() => [...document.querySelectorAll('body > .menu-popup .mi')].map((m) => [m.querySelector('.lbl').textContent, m.querySelector('.sc').textContent])),
      [['Ana', 'owner'], ['Rui', 'you'], ['Follow Ana', ''], ['Stop Following', '']]);
    await fp.click('body > .menu-popup .mi', { text: 'Follow Ana' });
    await fp.waitFor(() => window.Silinx.active?.path === 'src/pass1.vhd', [], { what: 'following again' });
    await fp.waitConsole(/^Following Ana's editor\.$/m);
    // Stop Sharing, from the owner's presence menu: the follower told, the project left as it was, read only
    await page.click('#toolbar .collab-btn');
    await page.waitForSelector('body > .menu-popup');
    await page.click('body > .menu-popup .mi', { text: 'Stop Sharing' });
    await page.waitConsole(/^Stopped sharing "Shared": its followers no longer see it\.$/m);
    assert.equal(await page.eval(() => !!document.querySelector('#toolbar .collab-presence')), false);
    await fp.waitConsole(/^WARNING: Ana's project "Shared" is no longer followed \(the owner stopped sharing\): what you see is as it was then\.$/m);
    assert.equal(await fp.eval(() => document.querySelector('#toolbar .collab-btn').textContent), 'Not shared any more');
    assert.equal(await fp.eval(() => window.Silinx.active.editor.readOnly()), true);
    // the warnings: the end of sharing only, at the follower's; none at the owner's
    assert.deepEqual(await consoleWarnings(fp), ['WARNING: Ana\'s project "Shared" is no longer followed (the owner stopped sharing): what you see is as it was then.']);
    assert.deepEqual(await consoleWarnings(page), []);
    assert.deepEqual(fp.errors, []);
  } finally { await fp.close(); }
});

uiTest('#3181 a drawing followed read only (traffic\'s FSM): its read-only mode, the notice; the follower writes nothing; in Portuguese', E, async (page) => {
  await page.eval(() => localStorage.setItem('silinx.lang', 'pt'));
  await page.reload();
  await page.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
  await makeProject(env, { name: 'TrafficShared', template: 'traffic' });
  await page.openProject('TrafficShared');
  await page.eval(() => window.SilinxApp.openFsm('src/traffic.fsm.json'));
  const link = await share(page, 'Ana', { pt: true });
  await page.waitConsole(/^Sharing project "TrafficShared": anyone with its link follows it live, read only/m);   // (the console: not translated)
  const fp = await follow(link, 'Rui', { pt: true });
  try {
    await fp.waitFor(() => window.Silinx.active?.id === 'fsm:src/traffic.fsm.json', [], { what: 'the FSM followed' });
    const notice = await fp.waitFor(() => window.Silinx.active.el.querySelector('[data-follow-notice]')?.textContent, [], { what: 'the notice' });
    assert.equal(notice, 'Só de leitura, a seguir o projeto de Ana');
    assert.equal(await fp.eval(() => !!window.Silinx.active.el.querySelector('.asm-readonly')), true, 'the FSM editor in its read-only mode');
    assert.equal(await fp.eval(() => document.querySelector('#toolbar .collab-btn').textContent), 'A seguir Ana');
    await page.waitConsole(/^Rui follows your project "TrafficShared"\.$/m);
    // a change refused at the follower's backend (nothing reaches the server)
    const err = await fp.eval(async () => { try { await (await import('/js/api.js')).api.writeFile('TrafficShared', 'src/x.vhd', 'x'); return null; } catch (e) { return e.message; } });
    assert.equal(err, 'read only: you follow Ana\'s project (its owner edits it)');
    assert.deepEqual(await consoleWarnings(fp), []);
    assert.deepEqual(fp.errors, []);
  } finally { await fp.close(); }
});
