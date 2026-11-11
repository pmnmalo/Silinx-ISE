// UI: a shared project's text files edited live (#3182, phase 2), the owner and an editor in one test, in both
// interfaces: the owner shares (its editors' link, Copy Editor Link); the editor opens that link and edits a text file
// with the owner at once (their text editors bound to the shared text: the same text on both sides, each one's change
// in it); each one's Undo undoes their own change only; the owner's page writes the merged text to the disk; a large
// paste reaches the owner in pieces (no connection lost); the owner renames a file the editor has open; the owner's
// presence in Portuguese; the project untrusted by the editor's first change, and a change the import gate refuses not
// written (#3355). The exact console lines; no warnings but those asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity top is\n  port (a : in std_logic; y : out std_logic);\nend top;\n\narchitecture rtl of top is\nbegin\n  y <= not a;\nend rtl;\n';
const PASS = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity pass1 is\n  port (a : in std_logic; y : out std_logic);\nend pass1;\n\narchitecture rtl of pass1 is\nbegin\n  y <= a;\nend rtl;\n';
const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));
const text = (page) => page.eval(() => window.Silinx.active.editor.getValue());
// typing at a place of the editor in front, as the user would (one transaction)
const type = (page, line, ch, s) => page.eval((l, c, t) => { const ed = window.Silinx.active.editor; ed.setCursor({ line: l, ch: c }); ed.replaceSelection(t); }, line, ch, s);

uiTest('#3182 an editor edits a text file live with the owner: the same text on both, each one\'s Undo their own, written to the disk; a large paste; a rename during an edit; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'Live', top: 'top', files: { 'src/top.vhd': TOP, 'src/pass1.vhd': PASS } });
  await page.openProject('Live');
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  const edit = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.editorsLink(); });
  assert.match(edit, /^http:\/\/[^/]+\/#edit=[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{129}$/);
  // the editor opens the editors' link
  const ep = await env.newPage(env.server.url);
  try {
    await ep.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
    await ep.goto(`${new URL(edit).origin}/?f=1${new URL(edit).hash}`);
    await ep.waitDialog('Follow a Shared Project');
    await ep.fill('.dlg-overlay input[data-field=name]', 'Rui');
    await ep.dialogButton('Follow');
    await ep.waitFor(() => window.Silinx?.project?.name === 'Live' && window.Silinx.startupChecked, [], { what: 'the project open', timeout: 30000 });
    await ep.waitConsole(/^Editing Ana's project "Live" with them: its text files, state diagrams, truth tables, ASM charts and Petri nets change as you all edit them, its other drawings stay theirs, read only \(Following Ana, in the toolbar\)\.$/m);
    await page.waitConsole(/^Rui edits your project "Live" with you\.$/m);
    // the owner's editor followed, editable here, no read-only notice
    await ep.waitFor(() => window.Silinx.active?.path === 'src/top.vhd', [], { what: 'the owner\'s editor followed' });
    assert.equal(await ep.eval(() => window.Silinx.active.editor.readOnly()), false);
    assert.equal(await ep.eval(() => !!window.Silinx.active.el.querySelector('[data-follow-notice]')), false);
    // both bound (their track): both type at once, the same text on both sides with both changes
    await new Promise((r) => setTimeout(r, 700));
    await Promise.all([type(page, 0, 0, '-- by Ana\n'), type(ep, 11, 0, '-- by Rui\n')]);
    const both = `-- by Ana\n${TOP}-- by Rui\n`;
    await page.waitFor((t) => window.Silinx.active.editor.getValue() === t, [both], { what: 'both changes at the owner\'s' });
    await ep.waitFor((t) => window.Silinx.active.editor.getValue() === t, [both], { what: 'both changes at the editor\'s' });
    // the owner's page writes it to the disk
    for (let t = Date.now(); Date.now() - t < 8000 && await readWs(env, 'Live', 'src/top.vhd') !== both;) await new Promise((r) => setTimeout(r, 100));
    assert.equal(await readWs(env, 'Live', 'src/top.vhd'), both);
    // each one's Undo: their own change only
    await ep.eval(() => window.Silinx.active.editor.exec('undo'));
    const anas = `-- by Ana\n${TOP}`;
    await page.waitFor((t) => window.Silinx.active.editor.getValue() === t, [anas], { what: 'Rui\'s change undone at the owner\'s' });
    assert.equal(await text(ep), anas);
    await page.eval(() => window.Silinx.active.editor.exec('undo'));
    await ep.waitFor((t) => window.Silinx.active.editor.getValue() === t, [TOP], { what: 'Ana\'s change undone at the editor\'s' });
    // a large paste: in pieces, every one through (the editor still connected), on the owner's disk
    const big = `${'-- a line of a large paste\n'.repeat(4000)}`;
    await ep.eval((t) => { const ed = window.Silinx.active.editor; ed.setCursor({ line: 0, ch: 0 }); ed.replaceSelection(t); }, big);
    await page.waitFor((t) => window.Silinx.active.editor.getValue() === t, [big + TOP], { what: 'the paste at the owner\'s', timeout: 15000 });
    assert.equal(await ep.eval(() => window.SilinxApp.S && !document.querySelector('.collab-presence .collab-btn')?.textContent.startsWith('Not shared')), true);
    for (let t = Date.now(); Date.now() - t < 8000 && await readWs(env, 'Live', 'src/top.vhd') !== big + TOP;) await new Promise((r) => setTimeout(r, 100));
    assert.equal(await readWs(env, 'Live', 'src/top.vhd'), big + TOP);
    // the owner renames a file the editor has open: told in the editor's console
    await ep.eval(() => window.SilinxApp.openFile('src/pass1.vhd'));
    await ep.waitFor(() => window.Silinx.active?.path === 'src/pass1.vhd', [], { what: 'pass1 open at the editor\'s' });
    await page.eval(async () => { await (await import('/js/api.js')).api.renameFile('Live', 'src/pass1.vhd', 'src/pass2.vhd'); });
    await ep.waitConsole(/^src\/pass1\.vhd was deleted by Ana: closed\.$/m, { timeout: 15000 });
    await ep.waitFor(() => window.SilinxApp.S.fileTree.includes('src/pass2.vhd'), [], { what: 'the renamed file at the editor\'s' });
    // the owner's presence, in Portuguese: the editor as an editor, Copy Editor Link among its commands
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    await page.click('.collab-presence .collab-btn');
    await page.waitForSelector('body > .menu-popup');
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('body > .menu-popup .mi')].map((m) => [m.querySelector('.lbl').textContent, m.querySelector('.sc').textContent])),
      [['Ana', 'você'], ['Rui', 'editor'], ['Copiar Ligação', ''], ['Copiar Ligação de Editor', ''], ['Parar de Partilhar', '']]);
    await page.key('Escape');
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
    // (#3355) the owner's project, trusted, untrusted by the editor's first change written: said once, with its button
    const untrusted = 'WARNING: Project "Live" was changed by an editor of its shared link: it is edited, checked, simulated and implemented with the Silinx toolchain; Xilinx ISE and programming a board or a PROM run only once you trust it. Trust Project';   // (its button's label, in the console's text)
    assert.deepEqual(await page.eval(() => [window.Silinx.project.trusted, window.Silinx.project.madeBy]), [false, 'editor']);
    assert.equal(JSON.parse(await readWs(env, 'Live', 'silinx.json')).trusted, false);
    // a change the import gate refuses (a NUL byte in a text file): not written, undone at both, said at the owner's
    const before = await readWs(env, 'Live', 'src/top.vhd');
    await ep.eval(() => window.SilinxApp.openFile('src/top.vhd'));
    await ep.waitFor(() => window.Silinx.active?.path === 'src/top.vhd', [], { what: 'top open at the editor\'s' });
    await new Promise((r) => setTimeout(r, 700));
    await ep.eval((t) => window.Silinx.active.editor.setValue(t), 'entity\0top is end;\n');
    await page.waitConsole(/^WARNING: src\/top\.vhd: an editor's change not written: binary content \(a NUL byte\) in a text file\.$/m, { timeout: 15000 });
    await ep.waitFor((t) => window.Silinx.active.editor.getValue() === t, [before], { what: 'the refused change undone at the editor\'s', timeout: 15000 });
    assert.equal(await readWs(env, 'Live', 'src/top.vhd'), before);
    // no warnings but those, on either side
    assert.deepEqual(await warnings(ep), []);
    assert.deepEqual(await warnings(page), [untrusted, 'WARNING: src/top.vhd: an editor\'s change not written: binary content (a NUL byte) in a text file.']);
    assert.equal(await page.eval(() => [...document.querySelectorAll('#console-log button')].filter((b) => b.textContent === 'Trust Project').length), 1);
    assert.deepEqual(ep.errors, []);
  } finally { await ep.close(); await page.eval(async () => (await import('/js/collab-share.js')).stopSharing()); }
});
