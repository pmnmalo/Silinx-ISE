// UI: a design opened from a link (#2826, web/js/link-open.js) and Copy Link… (web/js/link-copy.js), in both
// interfaces: an example's link into Try it (the schematic's live simulation running), a project's link made with
// Copy Link… (the Design tree's project and module menus, the File menu, the Start page) and opened again into the
// simulation (the same project, kept); the board emulator; a changed project replaced only when the user says so; a
// zip at an outside address asked first (Cancel: nothing fetched); a broken or hostile link said in the console (#2829),
// the workspace as it was; in Portuguese. No warnings but those asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupUi, uiTest, readWs, writeWs, makeProject } from './harness.js';
import { newPetri } from '../../core/petri.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const warnings = (page) => page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text);
const consoleWarnings = async (page) => (await page.consoleText()).split('\n').filter((l) => /^WARNING/.test(l.trim()));
const linkOpened = (page) => page.waitFor(() => window.Silinx.linkOpened, [], { what: 'the link opened', timeout: 60000 });
// the app at a link (a query first: a new page, not a jump in the same one)
async function openLink(page, hash, query = 'l=1') {
  await page.goto(`${env.server.url}/?${query}#${hash}`);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item'), [], { what: 'app boot' });
}
const projects = async () => (await fs.readdir(env.server.workspace)).filter((f) => !f.startsWith('.')).sort();
const exists = (p) => fs.access(path.join(env.server.workspace, p)).then(() => true, () => false);
async function contextMenu(page, row, item) {
  await page.rightClick('#hier .row', { index: row });
  await page.waitForSelector('body > .menu-popup');
  const items = await page.eval(() => [...document.querySelectorAll('body > .menu-popup .mi')].map((m) => m.querySelector('.lbl')?.textContent.trim() ?? m.textContent.trim()));
  if (item) await page.click('body > .menu-popup .mi', { text: item });
  return items;
}
const dialogLink = (page) => page.waitFor(() => document.querySelector('.dlg-overlay .link-out')?.value || null, [], { what: 'the link in the dialog' });

uiTest('#2826 an example\'s link opens it into Try it: the schematic\'s live simulation running; the address cleared', E, async (page) => {
  await openLink(page, 'open=example:gates&view=try');
  await linkOpened(page);
  await page.waitFor(() => window.SilinxApp.findDoc('sch:src/gates.sch.json')?.schEditor?.simulating, [], { what: 'Try it running', timeout: 60000 });
  assert.equal(await page.eval(() => window.Silinx.project.name), 'gates');
  await page.waitConsole(/Opened 'gates' from a link \(a new project\): Try it\./);
  assert.equal(await page.eval(() => location.hash), '', 'the link\'s options cleared from the address');
  assert.deepEqual(await consoleWarnings(page), []);
  assert.deepEqual(warnings(page), []);
});

uiTest('#2869 view=try on a state diagram: traffic\'s FSM opened in its Simulate panel', E, async (page) => {
  await openLink(page, 'open=example:traffic&top=traffic&view=try');
  await linkOpened(page);
  await page.waitFor(() => window.SilinxApp.findDoc('fsm:src/traffic.fsm.json')?.fsmEditor?.panel === 'sim', [], { what: 'the FSM\'s Simulate panel', timeout: 30000 });
  assert.equal(await page.eval(() => window.Silinx.active?.id), 'fsm:src/traffic.fsm.json');
  await page.waitConsole(/Opened 'traffic' from a link( \(a new project\))?: Try it\./);
  assert.deepEqual(await consoleWarnings(page), []);
});

uiTest('#2869 a Petri net: Copy Link to This Module… chooses Try it; the link opens the net in its Simulate panel', E, async (page) => {
  await makeProject(env, { name: 'PnLink', top: 'ctl', files: { 'src/ctl.pn.json': JSON.stringify(newPetri('ctl', 'vhdl'), null, 2) } });
  await page.openProject('PnLink');
  const row = await page.waitFor(() => { const i = [...document.querySelectorAll('#hier .row')].findIndex((r) => /\bctl\b/.test(r.textContent)); return i > 0 ? i : null; }, [], { what: 'the net\'s row' });
  await contextMenu(page, row, 'Copy Link to This Module…');
  await page.waitDialog('Copy Link');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay select[data-field=view]').value), 'try');
  const link = await page.waitFor(() => /&view=try$/.test(document.querySelector('.dlg-overlay .link-out').value) && document.querySelector('.dlg-overlay .link-out').value, [], { what: 'the link' });
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  await openLink(page, new URL(link).hash.slice(1), 'pn=1');
  await linkOpened(page);
  await page.waitFor(() => window.SilinxApp.findDoc('pn:src/ctl.pn.json')?.petriEditor?.panel === 'sim', [], { what: 'the net\'s Simulate panel', timeout: 30000 });
  await page.waitConsole(/Opened 'PnLink' from a link: Try it\./);
  assert.equal(await page.dialogCount(), 0, 'the same project: no question');
  assert.deepEqual(await consoleWarnings(page), []);
});

uiTest('#2826 Copy Link…: the project\'s and a module\'s menus, the File menu, the Start page; the link opened again into the simulation, the same project kept', E, async (page) => {
  await openLink(page, 'open=example:traffic');
  await linkOpened(page);
  await page.waitFor(() => document.querySelector('#hier .row'), [], { what: 'the Design tree' });
  // the project's menu
  assert.ok((await contextMenu(page, 0)).includes('Copy Link to Project…'));
  await page.closeMenus();
  await page.menu('File', 'Copy Link to Project…');
  assert.equal(await page.waitDialog('Copy Link'), 'Copy Link');
  const plain = await dialogLink(page);
  assert.match(plain, new RegExp(`^${env.server.url.replace(/[.]/g, '\\.')}/#design=[A-Za-z0-9_-]+$`));
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .link-info').textContent), /^\d+ characters: some slide tools cut a link longer than 2000 \(export the project as a \.zip, host it, and link to it with #open=\)\.$/);
  // a view the design does not have: said in the dialog, no link
  await page.eval(() => { const s = document.querySelector('.dlg-overlay select[data-field=view]'); s.value = 'try'; s.dispatchEvent(new Event('change')); });
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .link-error').textContent), 'Try it: \'top\' is not a schematic, a state diagram or a Petri net.');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .link-out').value), '');
  await page.eval(() => { const s = document.querySelector('.dlg-overlay select[data-field=view]'); s.value = 'simulate'; s.dispatchEvent(new Event('change')); });
  const link = await page.waitFor(() => /&view=simulate$/.test(document.querySelector('.dlg-overlay .link-out').value) && document.querySelector('.dlg-overlay .link-out').value, [], { what: 'the simulation\'s link' });
  await page.dialogButton('Copy Link');
  await page.waitNoDialog();
  await page.waitConsole(/Copy Link: the link of 'traffic' \(Simulation, top\) copied, \d+ characters\./);
  assert.deepEqual(await consoleWarnings(page), [`WARNING: Copy Link: the link is ${link.length} characters long: some slide tools cut a link longer than 2000.`]);
  // a module's menu: its module chosen (the Start page's command: the same dialog)
  const row = await page.eval(() => [...document.querySelectorAll('#hier .row')].findIndex((r) => /\btimer\b/.test(r.textContent)));
  assert.ok(row > 0);
  await contextMenu(page, row, 'Copy Link to This Module…');
  await page.waitDialog('Copy Link');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay select[data-field=module]').value), 'timer');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  await page.eval(() => window.SilinxApp.showLeftPage('start'));
  await page.waitFor(() => [...document.querySelectorAll('.start-box a')].some((a) => a.textContent === 'Copy Link to Project…'), [], { what: 'the Start page\'s command' });
  // the link opened: the same project (unchanged) kept, its test bench simulated
  await openLink(page, new URL(link).hash.slice(1), 'l=2');
  await linkOpened(page);
  await page.waitConsole(/Opened 'traffic' from a link: the simulation\./);
  await page.waitFor(() => window.Silinx.docs.some((d) => /^isim:/.test(d.id)), [], { what: 'the simulation open', timeout: 60000 });
  assert.deepEqual((await projects()).filter((p) => /^traffic/.test(p)), ['traffic']);
  assert.equal(await page.dialogCount(), 0, 'no question: the project is the link\'s');
});

uiTest('#2871 regression, Copy Link to This Module… with Open the project only: the link opens the project on that module, selected, its source open; the top too; with a view', E, async (page) => {
  await openLink(page, 'open=example:traffic');
  await linkOpened(page);
  // the module's link, made in the dialog (no view)
  const linkOf = async (module) => {
    const row = await page.waitFor((m) => { const i = [...document.querySelectorAll('#hier .row')].findIndex((r) => r.dataset.module === m); return i >= 0 ? i : null; }, [module], { what: `${module}'s row` });
    await contextMenu(page, row, 'Copy Link to This Module…');
    await page.waitDialog('Copy Link');
    assert.equal(await page.eval(() => document.querySelector('.dlg-overlay select[data-field=view]').value), '');
    const link = await page.waitFor(() => document.querySelector('.dlg-overlay .link-out').value || null, [], { what: 'the link' });
    await page.dialogButton('Cancel');
    await page.waitNoDialog();
    return link;
  };
  const selected = () => page.eval(() => document.querySelector('#hier .row.sel')?.dataset.module ?? null);
  for (const [module, doc, q] of [['timer', 'src/timer.vhd', 'm=1'], ['top', 'src/top.vhd', 'm=2']]) {
    const link = await linkOf(module);
    assert.match(link, new RegExp(`#design=[A-Za-z0-9_-]+&top=${module}$`));
    await openLink(page, new URL(link).hash.slice(1), q);
    await linkOpened(page);
    await page.waitFor((m) => document.querySelector('#hier .row.sel')?.dataset.module === m, [module], { what: `${module} selected` });
    await page.waitFor((d) => window.Silinx.active?.path === d, [doc], { what: `${doc} open`, timeout: 30000 });
    assert.equal(await page.eval(() => window.Silinx.sel?.module), module);
    await page.waitConsole(/Opened 'traffic' from a link\./);
    assert.deepEqual(await consoleWarnings(page), []);
  }
  // with a view: the module selected, its view open
  await openLink(page, 'open=example:traffic&top=traffic&view=try', 'm=3');
  await linkOpened(page);
  await page.waitFor(() => window.SilinxApp.findDoc('fsm:src/traffic.fsm.json')?.fsmEditor?.panel === 'sim', [], { what: 'the FSM\'s Simulate panel', timeout: 30000 });
  assert.equal(await selected(), 'traffic');
});

uiTest('#2826 #2875 a changed project: replaced only when the user says so; or the link\'s design opened as <name>_2, _3, the student\'s kept (Keep Mine, Open as, Replace)', E, async (page) => {
  await openLink(page, 'open=example:blinky');
  await linkOpened(page);
  const name = (await fs.readdir(path.join(env.server.workspace, 'blinky', 'sim')))[0];
  await writeWs(env, 'blinky', `sim/${name}`, '-- the student\'s work\n');
  await openLink(page, 'open=example:blinky&view=emulate', 'l=2');
  assert.equal(await page.waitDialog('Open from a Link'), 'Open from a Link');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .msg-text').textContent), /^A project named 'blinky' already exists, with changes of its own\.\s+Replace it with the link's design\? The existing project is moved to the workspace \.trash folder\. Or open the link's design as a new project, 'blinky_2', yours kept as it is\.$/);
  // (the one that loses nothing first, the primary: Enter's)
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .dlg-buttons .btn')].map((b) => `${b.textContent}${b.classList.contains('primary') ? ' (primary)' : ''}`)), ['Open as blinky_2 (primary)', 'Replace', 'Keep Mine']);
  await page.dialogButton('Keep Mine');
  await linkOpened(page);
  await page.waitConsole(/Open from a link: the project 'blinky' was kept as it is; the link's design was not opened\./);
  assert.equal(await readWs(env, 'blinky', `sim/${name}`), '-- the student\'s work\n');
  // Open as blinky_2, then blinky_3: the link's design beside the student's project, which stays as it is
  for (const [n, q] of [['blinky_2', 'l=4'], ['blinky_3', 'l=5']]) {
    await openLink(page, 'open=example:blinky&top=speed_ctrl', q);
    await page.waitDialog('Open from a Link');
    await page.dialogButton(`Open as ${n}`);
    await linkOpened(page);
    await page.waitConsole(new RegExp(`Opened '${n}' from a link \\(a new project; 'blinky' kept as it is\\)\\.`));
    assert.equal(await page.eval(() => window.Silinx.project.name), n);
    await page.waitFor(() => document.querySelector('#hier .row.sel')?.dataset.module === 'speed_ctrl', [], { what: 'the link\'s module selected' });
    assert.notEqual(await readWs(env, n, `sim/${name}`), '-- the student\'s work\n');
  }
  assert.equal(await readWs(env, 'blinky', `sim/${name}`), '-- the student\'s work\n');
  assert.deepEqual(await consoleWarnings(page), []);
  // Replace: the example's again, in the board emulator
  await openLink(page, 'open=example:blinky&view=emulate', 'l=3');
  await page.waitDialog('Open from a Link');
  await page.dialogButton('Replace');
  await linkOpened(page);
  await page.waitConsole(/Opened 'blinky' from a link: the board emulator\./);
  await page.waitFor(() => window.Silinx.docs.some((d) => d.id === 'emulator'), [], { what: 'the emulator open', timeout: 60000 });
  assert.notEqual(await readWs(env, 'blinky', `sim/${name}`), '-- the student\'s work\n');
});

uiTest('#2829 a zip at another site is asked first (Cancel: nothing fetched); broken and hostile links said in the console, nothing made', E, async (page) => {
  const before = await projects();
  await openLink(page, 'open=https://example.org/lecture3.zip&view=simulate');
  await page.waitDialog('Open from a Link');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .msg-text').textContent), /^This link opens a project from another site:\s+https:\/\/example\.org\/lecture3\.zip\s+Open it\? Its files are copied into a new project of your workspace; nothing runs until you run it\.$/);
  await page.dialogButton('Cancel');
  await linkOpened(page);
  await page.waitConsole(/Open from a link: cancelled\./);
  for (const [hash, msg] of [
    ['open=javascript:alert(1)', 'the link\'s open= is not an https address (\'javascript:alert(1)\')'],
    ['open=https://192.168.1.1/a.zip', 'the link\'s open= is an address of this computer or of a local network (\'192.168.1.1\')'],
    ['open=example:gates&top=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E', 'the link\'s top \'<img src=x onerror=alert(1)>\' is not a module name'],
    ['design=abc%24', 'the design in the link is not base64url'],
    ['open=example:nothere', 'no example \'nothere\''],
    ['open=example:gates&view=simulate&top=nothere', 'the design has no module \'nothere\''],
  ]) {
    await openLink(page, hash, `l=${encodeURIComponent(hash)}`);
    await page.waitFor(() => window.Silinx.startupChecked, [], { what: 'boot' });
    await page.waitFor((m) => window.__console().includes(`ERROR: Open from a link: ${m}.`), [msg], { what: msg, timeout: 30000 }).catch(async (e) => { throw new Error(`${e.message}\n${await page.consoleText()}`); });
    assert.equal(await page.eval(() => document.querySelectorAll('#console img, .dlg-overlay img').length), 0, 'no markup from the link');
  }
  assert.deepEqual(await projects(), before);
  assert.equal(await exists('nothere'), false);
});

uiTest('#2829 a link never sets the local server\'s token: only its own address (the token alone) does; the link still opened', E, async (page) => {
  await openLink(page, 'token=evilEvil1&open=example:gates', 't=1');
  await linkOpened(page);
  await page.waitConsole(/Opened 'gates' from a link/);
  assert.equal(await page.eval(() => localStorage.getItem('silinx-token')), null);
  await openLink(page, 'token=good-Token_2', 't=2');
  await page.waitFor(() => window.Silinx.startupChecked, [], { what: 'boot' });
  assert.equal(await page.eval(() => localStorage.getItem('silinx-token')), 'good-Token_2');
  assert.equal(await page.eval(() => location.hash), '');
  // a link afterwards keeps it
  await openLink(page, 'token=evilEvil3&open=example:gates', 't=3');
  await linkOpened(page);
  assert.equal(await page.eval(() => localStorage.getItem('silinx-token')), 'good-Token_2');
});

uiTest('#2826 in Portuguese: Copy Link… and the replace question', E, async (page) => {
  await openLink(page, 'open=example:gates');
  await linkOpened(page);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.menu('Ficheiro', 'Copiar Ligação para o Projeto…');
  assert.equal(await page.waitDialog('Copiar Ligação'), 'Copiar Ligação');
  const t = await page.eval(() => document.querySelector('.dlg-overlay .dlg-body').innerText);
  for (const s of ['Abrir em:', 'Abrir só o projeto', 'Experimentar (a simulação de um desenho)', 'Módulo:', 'Placa:', 'Uma ligação que abre \'gates\' no Silinx', 'caracteres']) assert.ok(t.includes(s), `${s} in:\n${t}`);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .dlg-buttons .btn')].map((b) => b.textContent)), ['Copiar Ligação', 'Cancelar']);
  await page.dialogButton('Cancelar');
  await writeWs(env, 'gates', 'sim/tb_gates.vhd', '-- mine\n');
  await openLink(page, 'open=example:gates', 'l=pt');
  await page.waitDialog('Abrir a partir de uma Ligação');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .msg-text').textContent), /^Já existe um projeto chamado 'gates', com alterações próprias\./);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .dlg-buttons .btn')].map((b) => b.textContent)), ['Abrir como gates_2', 'Substituir', 'Manter o Meu']);
  await page.dialogButton('Manter o Meu');
  await linkOpened(page);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
});
