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

// Share Project…'s window, Live chosen in its Share: row (the copy its default, #3698): the live window in its place
async function chooseLive(page) {
  if (await page.eval(() => document.querySelector('.dlg-overlay input[data-field=how-live]')?.checked)) return;
  await page.click('.dlg-overlay input[data-field=how-live]');
  await page.waitFor(() => document.querySelector('.dlg-overlay input[data-field=how-live]')?.checked && !!document.querySelector('.dlg-overlay .collab-dlg'), [], { what: 'the live window' });
}
// the owner shares the open project from the File menu: the link (the dialog closed)
async function share(page, name, { pt = false } = {}) {
  await page.menu(pt ? 'Ficheiro' : 'File', pt ? 'Partilhar Projeto…' : 'Share Project…');
  await page.waitDialog(pt ? 'Partilhar Projeto' : 'Share Project');
  await chooseLive(page);
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
  assert.equal(await page.eval(() => document.querySelector('.collab-presence .collab-btn')?.textContent), 'Sharing');
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
    await page.waitFor(() => document.querySelector('.collab-presence .collab-btn')?.textContent === 'Sharing (1)', [], { what: 'Sharing (1)' });
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.collab-presence .collab-badge')].map((b) => [b.title, b.textContent])), [['Ana', 'A'], ['Rui', 'R']]);
    assert.deepEqual(await fp.eval(() => [...document.querySelectorAll('.collab-presence .collab-badge')].map((b) => b.title)), ['Ana', 'Rui']);
    assert.equal(await fp.eval(() => document.querySelector('.collab-presence .collab-btn').textContent), 'Following Ana');
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
    assert.equal(await fp.eval(() => document.querySelector('.collab-presence .collab-btn').textContent), 'Follow Ana');
    await page.eval(() => window.Silinx.active.editor.setCursor({ line: 5, ch: 0 }));
    await new Promise((r) => setTimeout(r, 600));
    assert.equal(await active(fp), 'src/top.vhd', 'not followed while browsing alone');
    // following again from the presence's menu
    await fp.click('.collab-presence .collab-btn');
    await fp.waitForSelector('body > .menu-popup');
    assert.deepEqual(await fp.eval(() => [...document.querySelectorAll('body > .menu-popup .mi')].map((m) => [m.querySelector('.lbl').textContent, m.querySelector('.sc').textContent])),
      [['Ana', 'owner'], ['Rui', 'you'], ['Follow Ana', ''], ['Stop Following', '']]);
    await fp.click('body > .menu-popup .mi', { text: 'Follow Ana' });
    await fp.waitFor(() => window.Silinx.active?.path === 'src/pass1.vhd', [], { what: 'following again' });
    await fp.waitConsole(/^Following Ana's editor\.$/m);
    // Stop Sharing, from the owner's presence menu: the follower told, the project left as it was, read only
    await page.click('.collab-presence .collab-btn');
    await page.waitForSelector('body > .menu-popup');
    await page.click('body > .menu-popup .mi', { text: 'Stop Sharing' });
    await page.waitConsole(/^Stopped sharing "Shared": its followers no longer see it\.$/m);
    assert.equal(await page.eval(() => !!document.querySelector('.collab-presence')), false);
    await fp.waitConsole(/^WARNING: Ana's project "Shared" is no longer followed \(the owner stopped sharing\): what you see is as it was then\.$/m);
    assert.equal(await fp.eval(() => document.querySelector('.collab-presence .collab-btn').textContent), 'Not shared any more');
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
    assert.equal(await fp.eval(() => document.querySelector('.collab-presence .collab-btn').textContent), 'A seguir Ana');
    await page.waitConsole(/^Rui follows your project "TrafficShared"\.$/m);
    // a change refused at the follower's backend (nothing reaches the server)
    const err = await fp.eval(async () => { try { await (await import('/js/api.js')).api.writeFile('TrafficShared', 'src/x.vhd', 'x'); return null; } catch (e) { return e.message; } });
    assert.equal(err, 'read only: you follow Ana\'s project (its owner edits it)');
    assert.deepEqual(await consoleWarnings(fp), []);
    assert.deepEqual(fp.errors, []);
  } finally { await fp.close(); }
});

// (#3318) the link pasted into the address bar of a tab where Silinx is open (only its fragment changes): followed, as in
// a new tab; in the owner's own page, not (that would stop the sharing), with a warning
uiTest('#3318 a follow link pasted into an open tab is followed; in the page that shares, a warning', E, async (page) => {
  await makeProject(env, { name: 'Pasted', top: 'top', files: { 'src/top.vhd': TOP } });
  await page.openProject('Pasted');
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  const link = await share(page, 'Ana');
  const hash = new URL(link).hash;
  // the owner pastes it into their own tab: still sharing, the link cleared, told (once the app watches the links, #3331)
  await page.waitFor(() => window.Silinx.linksWatched, [], { what: 'the links watched' });
  await page.eval((h) => { location.hash = h; }, hash);
  await page.waitConsole(/^WARNING: Follow a shared project: this page shares a project, which loading the link here would stop: open the link in another tab or window\.$/m);
  assert.equal(await page.eval(() => location.hash), '');
  assert.equal(await page.eval(() => document.querySelector('.collab-presence .collab-btn')?.textContent), 'Sharing');
  // a follower's tab, Silinx open: the link pasted, the page loaded again, followed
  const fp = await env.newPage(env.server.url);
  try {
    await fp.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
    await fp.eval((h) => { location.hash = h; }, hash);
    await fp.waitDialog('Follow a Shared Project');
    await fp.fill('.dlg-overlay input[data-field=name]', 'Rui');
    await fp.dialogButton('Follow');
    await fp.waitFor(() => window.Silinx?.project?.name === 'Pasted' && window.Silinx.active?.path === 'src/top.vhd', [], { what: 'the project followed', timeout: 20000 });
    await page.waitConsole(/^Rui follows your project "Pasted"\.$/m);
    assert.deepEqual(await consoleWarnings(fp), []);
    assert.deepEqual(fp.errors, []);
  } finally { await fp.close(); }
  await page.eval(async () => (await import('/js/collab-share.js')).stopSharing());
  assert.deepEqual(await consoleWarnings(page), ['WARNING: Follow a shared project: this page shares a project, which loading the link here would stop: open the link in another tab or window.']);
});

// (#3315, #3716, #3719) Share Project in the main toolbar, after Close Project (none on the Start page), both interfaces:
// disabled with no project, its window with one; who is in, at the Silinx interface's top bar before Search commands
// and files, at the ISE style toolbar's right end, which has no Split button any more (View ▸ Split Editor); moved when
// the interface changes; in Portuguese
const presencePlace = (page) => page.eval(() => {
  const box = document.querySelector('.collab-presence');
  const ui = document.documentElement.dataset.ui;
  // (the ISE style: no Split button)
  return box && { ui, parent: box.parentNode.id, next: box.nextElementSibling?.id || null, ...(ui === 'ise' ? { split: !!document.getElementById('split-btn')?.isConnected } : {}) };
});
const PLACE = { silinx: { ui: 'silinx', parent: 'top-actions', next: 'palette-btn' }, ise: { ui: 'ise', parent: 'toolbar', next: null, split: false } };
// the Design tree's menu of a row (on its name), its items (a disabled one marked), the menu closed or the item chosen
async function treeMenu(page, row, item) {
  await page.rightClick('#hier .row .lbl', { index: row });
  await page.waitForSelector('body > .menu-popup');
  const items = await page.eval(() => [...document.querySelectorAll('body > .menu-popup .mi')].map((m) => `${m.querySelector('.lbl')?.textContent.trim() ?? m.textContent.trim()}${m.classList.contains('disabled') ? ' (disabled)' : ''}`));
  if (item) await page.click('body > .menu-popup .mi', { text: item });
  else await page.closeMenus();
  return items;
}
const toolbarShare = (page) => page.eval(() => {
  const cmds = [...document.querySelectorAll('#toolbar .tb-btn')].map((b) => b.dataset.cmd), b = document.querySelector('#toolbar .tb-btn[data-cmd=share]');
  return b && { around: cmds.slice(cmds.indexOf('share') - 1, cmds.indexOf('share') + 2), title: b.title, disabled: b.disabled, shown: b.getClientRects().length > 0 };
});
uiTest('#3716 Share Project in the main toolbar, after Close Project (#3719), none on the Start page; who is in, at the top bar\'s right end (Silinx) or the toolbar\'s (ISE style, no Split button)', E, async (page) => {
  // no project: disabled
  await page.eval(() => window.SilinxApp.closeProject?.());
  await page.waitFor(() => !window.Silinx.project && document.querySelector('#toolbar .tb-btn[data-cmd=share]')?.disabled, [], { what: 'Share Project disabled' });
  assert.deepEqual(await toolbarShare(page), { around: ['closeProject', 'share', 'print'], title: 'Share Project', disabled: true, shown: true });
  await makeProject(env, { name: 'StartShared', top: 'top', files: { 'src/top.vhd': TOP } });
  await page.openProject('StartShared');
  await page.waitFor(() => !document.querySelector('#toolbar .tb-btn[data-cmd=share]').disabled, [], { what: 'Share Project enabled' });
  // (the Start page: none, the toolbar's and the File menu's)
  await page.leftTab('start');
  await page.waitFor(() => document.getElementById('start-page').hasAttribute('data-project'), [], { what: 'the Start page with the project' });
  assert.ok(!(await page.eval(() => [...document.querySelectorAll('#start-page .entry a')].some((a) => /^Share /.test(a.textContent)))));
  await page.click('#toolbar .tb-btn[data-cmd=share]');
  await page.waitDialog('Share Project');
  await chooseLive(page);
  await page.fill('.dlg-overlay input[data-field=name]', 'Ana');
  await page.dialogButton('Share');
  await page.waitFor(() => document.querySelector('.dlg-overlay input[data-field=link]')?.value || null, [], { what: 'the link' });
  await page.dialogButton('Close');
  await page.waitNoDialog();
  await page.waitFor(() => document.querySelector('.collab-presence .collab-btn')?.textContent === 'Sharing', [], { what: 'Sharing' });
  const first = await presencePlace(page);
  assert.deepEqual(first, PLACE[first.ui]);
  // the other interface, and back: moved with it
  for (const ui of first.ui === 'silinx' ? ['ise', 'silinx'] : ['silinx', 'ise']) {
    await page.eval(async (u) => (await import('/js/silinx.js')).setInterface(u), ui);
    await page.waitFor((u) => document.documentElement.dataset.ui === u && document.querySelector('.collab-presence')?.parentNode.id === (u === 'silinx' ? 'top-actions' : 'toolbar'), [ui], { what: `who is in, in the ${ui} interface` });
    assert.deepEqual(await presencePlace(page), PLACE[ui]);
  }
  // (the ISE style: Split Editor in the View menu)
  if (first.ui === 'ise') {
    assert.ok((await page.openMenu('View')).some((i) => i.label === 'Split Editor'));
    await page.closeMenus();
  }
  // in Portuguese: the button's tip
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('#toolbar .tb-btn[data-cmd=share]')?.title === 'Partilhar Projeto', [], { what: 'Partilhar Projeto' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await page.eval(async () => (await import('/js/collab-share.js')).stopSharing());
  await page.waitConsole(/^Stopped sharing "StartShared": its followers no longer see it\.$/m);
  assert.deepEqual(await consoleWarnings(page), []);
});

// (#3479, #3698) Share Project… in the Design tree's project and device menus, once, as the File menu's; Share Module… in
// a module's; its window starts with its Share: row, A copy (the default) or Live, each swapping the window for the
// other's; the way chosen kept (the next window opens on it); Live disabled, its reason its tip, while following
// another's project (the copy still there); in Portuguese. No warnings.
const howState = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay .share-how input')].map((r) => `${r.value}${r.checked ? ' *' : ''}${r.disabled ? ` (disabled: ${r.closest('label').title})` : ''}`));
uiTest('#3698 Share Project…: once in the Design tree\'s project and device menus, Share Module… in a module\'s; a copy or live chosen in its window, kept; Live disabled while following; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'TreeShared', top: 'top', files: { 'src/top.vhd': TOP } });
  await page.openProject('TreeShared');
  await page.leftTab('design');
  await page.waitFor(() => document.querySelectorAll('#hier .row .lbl').length >= 3, [], { what: 'the Design tree' });
  for (const row of [0, 1]) {
    const items = await treeMenu(page, row);
    assert.equal(items.filter((i) => i.startsWith('Share ')).join(' | '), 'Share Project…', `row ${row}: ${items.join(' | ')}`);
  }
  // a module's row (the top's): Share Module…
  const mod = await treeMenu(page, 2);
  assert.equal(mod.filter((i) => i.startsWith('Share ')).join(' | '), 'Share Module…', mod.join(' | '));
  // the window: a copy first, its Share: row; Live swaps it for the live window, A copy back
  await treeMenu(page, 1, 'Share Project…');
  assert.equal(await page.waitDialog('Share Project'), 'Share Project');
  assert.deepEqual(await howState(page), ['copy *', 'live']);
  assert.equal(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .share-how label')].map((l) => l.textContent).join(' | ')), 'Share: | A copy: a link with the project in it | Live: others follow it as you work');
  assert.ok(await page.eval(() => !!document.querySelector('.dlg-overlay .link-out')), 'the copy\'s link');
  await chooseLive(page);
  assert.equal(await page.waitDialog('Share Project'), 'Share Project');
  assert.deepEqual(await howState(page), ['copy', 'live *']);
  assert.ok(await page.eval(() => !!document.querySelector('.dlg-overlay input[data-field=name]') && !document.querySelector('.dlg-overlay .link-out')), 'the live window');
  assert.equal(await page.eval(() => document.querySelectorAll('.dlg-overlay').length), 1, 'one window');
  await page.click('.dlg-overlay input[data-field=how-copy]');
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .link-out'), [], { what: 'the copy\'s window again' });
  assert.deepEqual(await howState(page), ['copy *', 'live']);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // the way last chosen kept: Live, then the window opens on it
  await treeMenu(page, 0, 'Share Project…');
  await page.waitDialog('Share Project');
  await chooseLive(page);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  await treeMenu(page, 0, 'Share Project…');
  await page.waitDialog('Share Project');
  assert.deepEqual(await howState(page), ['copy', 'live *']);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // following another's project: Share Project… there, its copy; Live disabled, its reason its tip
  await page.eval(async () => { (await import('/js/api.js')).api.following = true; });
  await treeMenu(page, 1, 'Share Project…');
  await page.waitDialog('Share Project');
  assert.deepEqual(await howState(page), ['copy *', 'live (disabled: You are following another\'s project: stop following it to share one live.)']);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  await page.eval(async () => { delete (await import('/js/api.js')).api.following; });
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  for (const row of [0, 1]) assert.ok((await treeMenu(page, row)).includes('Partilhar Projeto…'), `row ${row}`);
  assert.ok((await treeMenu(page, 2)).includes('Partilhar Módulo…'));
  await treeMenu(page, 0, 'Partilhar Projeto…');
  await page.waitDialog('Partilhar Projeto');
  assert.equal(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .share-how label')].map((l) => l.textContent).join(' | ')), 'Partilhar: | Uma cópia: uma ligação com o projeto lá dentro | Em direto: os outros seguem-no enquanto trabalha');
  await page.dialogButton('Cancelar');
  await page.waitNoDialog();
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(await consoleWarnings(page), []);
});

// (#3631) Share Module… in a module's menu, Live chosen (#3698): the project shared live (the name asked first), the
// module's source opened in the owner's page, the links opening on it (…&top=<module>); a follower who opens it opens
// the module and browses alone on it (the owner on another document), until they follow the owner; asked again while
// shared, the links of that module at once (Live kept); in Portuguese. No warnings.
const rowOf = (page, m) => page.waitFor((x) => { const i = [...document.querySelectorAll('#hier .row')].findIndex((r) => r.dataset.module === x); return i >= 0 ? i : null; }, [m], { what: `${m}'s row` });
uiTest('#3631 Share Module…: the links open on the module, the owner\'s page on it; a follower opens it, browsing alone; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'ModShared', top: 'top', files: { 'src/top.vhd': TOP, 'src/pass1.vhd': PASS } });
  await page.openProject('ModShared');
  await page.leftTab('design');
  await page.eval(async () => { await window.SilinxApp.openFile('src/top.vhd'); });
  await treeMenu(page, await rowOf(page, 'pass1'), 'Share Module…');
  assert.equal(await page.waitDialog('Share Module'), 'Share Module');
  await chooseLive(page);
  await page.fill('.dlg-overlay input[data-field=name]', 'Ana');
  await page.dialogButton('Share');
  const link = await page.waitFor(() => document.querySelector('.dlg-overlay input[data-field=link]')?.value || null, [], { what: 'the link' });
  assert.match(link, /^http:\/\/[^/]+\/#follow=[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}&top=pass1$/);
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay input[data-field=edit-link]').value), /#edit=[^&]+&top=pass1$/);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .collab-dlg p').textContent), 'Anyone with this link follows "ModShared" live, read only, opening it on pass1, as long as you share it.');
  await page.dialogButton('Close');
  await page.waitNoDialog();
  assert.equal(await active(page), 'src/pass1.vhd');
  await page.waitConsole(/Sharing project "ModShared": anyone with its link follows it live, read only/);
  // the owner on another document: the follower opens the module and browses alone on it; Follow Ana follows them
  await page.eval(async () => { await window.SilinxApp.openFile('src/top.vhd'); });
  const fp = await follow(link, 'Rui');
  try {
    await fp.waitFor(() => window.Silinx.active?.path === 'src/pass1.vhd', [], { what: 'the link\'s module' });
    await fp.waitConsole(/^Browsing alone on pass1, the link's module \(Follow Ana, in the toolbar, follows Ana's editor\)\.$/m);
    assert.equal(await fp.eval(() => document.querySelector('.collab-presence .collab-btn').textContent), 'Follow Ana');
    await new Promise((r) => setTimeout(r, 1500));   // (a few of the follower's rounds: not brought to the owner's)
    assert.equal(await active(fp), 'src/pass1.vhd');
    await fp.click('.collab-presence .collab-btn');
    await fp.waitForSelector('body > .menu-popup');
    await fp.click('body > .menu-popup .mi', { text: 'Follow Ana' });
    await fp.waitFor(() => window.Silinx.active?.path === 'src/top.vhd', [], { what: 'the owner\'s editor followed' });
    await fp.waitConsole(/^Following Ana's editor\.$/m);
  } finally { await fp.close(); }
  // asked again while shared: that module's links at once
  await treeMenu(page, await rowOf(page, 'top'), 'Share Module…');
  await page.waitDialog('Share Module');
  assert.match(await page.waitFor(() => document.querySelector('.dlg-overlay input[data-field=link]')?.value || null, [], { what: 'the link' }), /&top=top$/);
  await page.dialogButton('Close');
  await page.waitNoDialog();
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await treeMenu(page, await rowOf(page, 'pass1'), 'Partilhar Módulo…');
  await page.waitDialog('Partilhar Módulo');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .collab-dlg p').textContent), 'Quem tiver esta ligação segue "ModShared" em direto, só de leitura, aberto em pass1, enquanto o partilhar.');
  await page.dialogButton('Fechar');
  await page.waitNoDialog();
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await page.eval(async () => (await import('/js/collab-share.js')).stopSharing());
  await page.waitConsole(/^Stopped sharing "ModShared": its followers no longer see it\.$/m);
  assert.deepEqual(await consoleWarnings(page), []);
});
