// UI: a shared project hosted by the owner's page (#3227, the browser edition's way: no relay), two participants in one
// test, in both interfaces: the owner shares the open project from their page (its link …#follow=<room>.<key>.host);
// the follower opens the link (their name), leaves the meeting point for the codes (Exchange Codes Instead, #3227),
// gets their code (Connect to the Owner); the owner takes it (Add a
// Follower…, in the presence's menu) and gives the answer's code; the follower pastes it: connected over WebRTC (two
// pages of one browser, no STUN server: the same machine), the project read only, the owner's editor followed, an edit
// arriving, the presence on both sides; a code that is not one refused at the owner's, in the console; Stop Sharing
// tells the follower. The follower's page in Portuguese (the dialog's labels; the console is not translated). No
// warnings but those asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi({ webrtc: true }); });   // (the pages' own addresses, #3567)
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity top is\n  port (a : in std_logic; y : out std_logic);\nend top;\n\narchitecture rtl of top is\nbegin\n  y <= not a;\nend rtl;\n';
const BIG = `${'a line of the notes of a large project\n'.repeat(10500)}`;
const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));
// (no STUN server: the two pages on this machine reach each other by their own addresses; the meeting point between
// this browser's pages, never the public one: two pages of their own browser contexts, which never meet there)
const noStun = (page) => page.eval(async () => { const { STUN_KEY } = await import('/js/collab-rtc.js'); localStorage.setItem(STUN_KEY, '[]'); const { MEETING_KEY } = await import('/js/collab-meet.js'); localStorage.setItem(MEETING_KEY, 'local'); });
const dialogField = (page, field) => page.waitFor((f) => document.querySelector(`.dlg-overlay textarea[data-field=${f}]`)?.value || null, [field], { what: `the ${field}`, timeout: 15000 });

uiTest('#3227 the owner\'s page hosts the shared project: the codes exchanged, the follower connected over WebRTC, read only; an edit arrives; a wrong code refused; Stop Sharing; the follower in Portuguese', E, async (page) => {
  // (a file of 400 KB: the owner's first message to a follower, the whole project, past a data channel's 256 KB)
  await makeProject(env, { name: 'Hosted', top: 'top', files: { 'src/top.vhd': TOP, 'doc/notes.txt': BIG } });
  await page.openProject('Hosted');
  await noStun(page);
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  const link = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana', { via: 'host' }); return m.sharedLink(); });
  assert.match(link, /^http:\/\/[^/]+\/#follow=[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\.host\.[A-Za-z0-9_-]{86}$/);
  await page.waitConsole(/^This page hosts the shared project: its followers find it at the meeting point when they open the link, or send you a code \(Add a Follower…, in the toolbar, takes it\); it lasts while this page is open\.$/m);
  // the follower opens the link: their name, then their code
  const fp = await env.newPage(env.server.url);
  try {
    await fp.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
    await noStun(fp);
    await fp.eval(() => localStorage.setItem('silinx.lang', 'pt'));
    await fp.goto(`${new URL(link).origin}/?f=1${new URL(link).hash}`);
    await fp.waitDialog('Seguir um Projeto Partilhado');
    await fp.fill('.dlg-overlay input[data-field=name]', 'Rui');
    await fp.dialogButton('Seguir');
    // (the meeting point first: the codes at the follower's choice, #3227)
    await fp.waitDialog('Ligar ao Dono');
    assert.deepEqual(await fp.eval(() => [...document.querySelectorAll('.dlg-overlay .dlg-body p, .dlg-overlay .dlg-buttons .btn')].map((e) => e.textContent)),
      ['A procurar o dono no ponto de encontro…', 'Se não for encontrado aí, troca códigos com ele em vez disso.', 'Trocar Códigos em Vez Disso', 'Cancelar']);
    await fp.dialogButton('Trocar Códigos em Vez Disso');
    await fp.waitConsole(/^Follow a shared project: codes exchanged with the owner instead of the meeting point\.$/m);
    const code = await dialogField(fp, 'code');
    assert.match(code, /^S1\.[A-Za-z0-9_-]+$/);
    assert.deepEqual(await fp.eval(() => [...document.querySelectorAll('.dlg-overlay label, .dlg-overlay .collab-copy, .dlg-overlay .dlg-buttons .btn')].map((e) => e.textContent)),
      ['O seu código:', 'Copiar Código', 'O código do dono:', 'Ligar', 'Cancelar']);
    // a code that is not one, at the owner's: refused, in the console
    await page.click('.collab-presence .collab-btn');
    await page.waitForSelector('body > .menu-popup');
    await page.click('body > .menu-popup .mi', { text: 'Add a Follower…' });
    await page.waitDialog('Add a Follower');
    await page.fill('.dlg-overlay textarea[data-field=code]', 'S1.not-a-code');
    await page.dialogButton('Connect');
    await page.waitConsole(/^ERROR: Add a Follower: a follower's code is not of this sharing \(or not whole\): its link may be of an earlier one \(each sharing has a new link\); give them this sharing's link again \(Copy Link\) and paste the code their page then shows, whole\.$/m);
    // the follower's code, at the owner's: the answer's code
    await page.click('.collab-presence .collab-btn');
    await page.waitForSelector('body > .menu-popup');
    await page.click('body > .menu-popup .mi', { text: 'Add a Follower…' });
    await page.waitDialog('Add a Follower');
    await page.fill('.dlg-overlay textarea[data-field=code]', code);
    await page.dialogButton('Connect');
    const answer = await dialogField(page, 'answer');
    assert.match(answer, /^S1\.[A-Za-z0-9_-]+$/);
    await page.waitConsole(/^Add a Follower: send your code back to the follower; they are in once they paste it\.$/m);
    await page.dialogButton('Close');
    await page.waitNoDialog();
    // the answer at the follower's: connected, the project read only, the owner's editor followed
    await fp.fill('.dlg-overlay textarea[data-field=answer]', answer);
    await fp.dialogButton('Ligar');
    await fp.waitFor(() => window.Silinx?.project?.name === 'Hosted' && window.Silinx.startupChecked, [], { what: 'the hosted project open', timeout: 60000 });
    await fp.waitFor(() => window.Silinx.active?.path === 'src/top.vhd', [], { what: 'the owner\'s editor followed' });
    assert.equal(await fp.eval(() => window.Silinx.active.editor.getValue()), TOP);
    assert.equal(await fp.eval(async () => (await (await import('/js/api.js')).api.readFile('Hosted', 'doc/notes.txt')).length), BIG.length);
    assert.equal(await fp.eval(() => window.Silinx.active.editor.readOnly()), true);
    assert.equal(await fp.eval(() => window.Silinx.active.el.querySelector('[data-follow-notice]')?.textContent), 'Só de leitura, a seguir o projeto de Ana');
    await page.waitConsole(/^Rui follows your project "Hosted"\.$/m);
    await page.waitFor(() => document.querySelector('.collab-presence .collab-btn')?.textContent === 'Sharing (1)', [], { what: 'Sharing (1)' });
    // an edit of the owner arrives
    await page.eval(() => { const ed = window.Silinx.active.editor; ed.setCursor({ line: 0, ch: 0 }); ed.replaceSelection('-- by Ana\n'); });
    await fp.waitFor((t) => window.Silinx.active.editor.getValue() === t, [`-- by Ana\n${TOP}`], { what: 'the edit arrived' });
    // Stop Sharing: the follower told
    await page.eval(async () => (await import('/js/collab-share.js')).stopSharing());
    await page.waitConsole(/^Stopped sharing "Hosted": its followers no longer see it\.$/m);
    await fp.waitConsole(/^WARNING: Ana's project "Hosted" is no longer followed \(the owner stopped sharing\): what you see is as it was then\.$/m);
    // the warnings and errors: the follower's end of sharing; the owner's refused code
    assert.deepEqual(await warnings(fp), ['WARNING: Ana\'s project "Hosted" is no longer followed (the owner stopped sharing): what you see is as it was then.']);
    assert.deepEqual(await warnings(page), [`ERROR: Add a Follower: ${"a follower's code is not of this sharing (or not whole): its link may be of an earlier one (each sharing has a new link); give them this sharing's link again (Copy Link) and paste the code their page then shows, whole"}.`]);
    assert.deepEqual(fp.errors, []);
  } finally { await fp.close(); }
});
