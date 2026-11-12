// UI: a shared project's Petri net edited live (#3183, phase 3, its fourth editor), the owner and an editor in one test,
// in both interfaces: the owner shares with the net open; the editor opens the editors' link, the net editable there
// (no read-only notice); at once the owner drags a place and the editor renames a transition in the side panel: the
// same net on both sides with both changes; the owner's page writes it to the disk and its HDL generated again from it
// (as generatePetri makes it from the merged net); each one's Undo undoes their own change only; the owner's dialog in
// Portuguese. The exact console lines; no warnings but those asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { newPetri, normalizePetri, generatePetri } from '../../core/petri.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const F = 'src/ctl.pn.json', ED = '.doc:not([hidden]) .petri-editor';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));
const model = (page) => page.eval(() => window.Silinx.active.petriEditor.getModel());
const at = (page, id) => page.eval((ed, x) => { const b = document.querySelector(`${ed} [data-id="${x}"] :is(circle, rect)`).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, ED, id);
const disk = async () => normalizePetri(JSON.parse(await readWs(env, 'LivePn', F)));
const until = async (fn, what, ms = 10000) => { for (const t = Date.now(); ;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error(`timed out: ${what}`); await sleep(100); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const byId = (l, id) => l.find((x) => x.id === id);

uiTest('#3183 a Petri net edited live by the owner and an editor: a place moved and a transition renamed at once on both sides, written with its HDL, each one\'s Undo their own; Portuguese', E, async (page) => {
  const net = { ...newPetri('ctl', 'vhdl'), generatedFile: 'src/ctl.vhd' };
  await makeProject(env, { name: 'LivePn', top: '', files: { [F]: JSON.stringify(net, null, 2), 'src/ctl.vhd': generatePetri(net, 'vhdl', { source: 'ctl.pn.json' }).code } });
  await page.openProject('LivePn');
  await page.eval((p) => window.SilinxApp.openPetri(p), F);
  await page.waitFor(() => !!window.Silinx.active?.petriEditor, [], { what: 'the net open' });
  const n0 = await disk();
  const edit = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.editorsLink(); });
  const ep = await env.newPage(env.server.url);
  try {
    await ep.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
    await ep.goto(`${new URL(edit).origin}/?f=1${new URL(edit).hash}`);
    await ep.waitDialog('Follow a Shared Project');
    await ep.fill('.dlg-overlay input[data-field=name]', 'Rui');
    await ep.dialogButton('Follow');
    await ep.waitFor(() => window.Silinx?.project?.name === 'LivePn' && window.Silinx.startupChecked, [], { what: 'the project open', timeout: 30000 });
    await ep.waitConsole(/^Editing Ana's project "LivePn" with them: its text files and drawings change as you all edit them \(Following Ana, in the toolbar\)\.$/m);
    await page.waitConsole(/^Rui edits your project "LivePn" with you\.$/m);
    await ep.waitFor((p) => window.Silinx.active?.path === p && !!window.Silinx.active.petriEditor, [F], { what: 'the owner\'s net followed' });
    assert.deepEqual(await ep.eval((ed) => [!!document.querySelector(`${ed} [data-follow-notice]`), !!document.querySelector(`${ed}.asm-readonly`)], ED), [false, false]);
    assert.deepEqual(await model(ep), n0);
    await sleep(700);   // (both bound: their track)
    // at once: Ana drags the place idle (p1) down; Rui selects the transition start (t1) and renames it in the side panel
    const p1 = await at(page, 'p1'), t1 = await at(ep, 't1');
    await Promise.all([
      page.drag(p1, { x: p1.x, y: p1.y + 100 }),
      (async () => { await ep.click(t1); await ep.waitForSelector(`${ED} .pn-selection input.mono`); await ep.fill(`${ED} .pn-selection input.mono`, 'begin'); })(),
    ]);
    await ep.click(`${ED} .asm-toolbar`);   // (the side panel's field left: the merge shown)
    const both = (m) => byId(m.transitions, 't1').name === 'begin' && byId(m.places, 'p1').y > byId(n0.places, 'p1').y;
    await until(async () => both(await model(page)), 'both changes at the owner\'s');
    await until(async () => both(await model(ep)), 'both changes at the editor\'s');
    const merged = await model(page);
    assert.deepEqual(await model(ep), merged);
    // the owner's page writes it to the disk, and its HDL made again from it
    await until(async () => same(await disk(), merged), 'the merge on the disk');
    await until(async () => (await readWs(env, 'LivePn', 'src/ctl.vhd')) === generatePetri(merged, 'vhdl', { source: 'ctl.pn.json' }).code, 'the HDL made again');
    // each one's Undo: their own change only, on both sides
    await ep.eval(() => window.Silinx.active.petriEditor.undo());
    await until(async () => { const m = await model(page); return byId(m.transitions, 't1').name === 'start' && byId(m.places, 'p1').y === byId(merged.places, 'p1').y; }, 'Rui\'s change undone at the owner\'s');
    await page.eval(() => window.Silinx.active.petriEditor.undo());
    await until(async () => same(await model(ep), n0), 'Ana\'s change undone at the editor\'s');
    assert.deepEqual(await model(page), n0);
    await until(async () => same(await disk(), n0), 'both undone on the disk');
    // the owner's dialog, in Portuguese
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    const dlg = page.eval(async () => { await (await import('/js/collab-share.js')).shareProjectDialog(); }).catch(() => {});
    await page.waitDialog('Partilhar Projeto');
    assert.ok((await page.eval(() => document.querySelector('.dlg-overlay').textContent)).includes('Quem tiver a ligação de editores edita os ficheiros de texto e os desenhos consigo, em direto.'));
    await page.dialogButton('Fechar');
    await dlg;
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
    const untrusted = 'WARNING: Project "LivePn" was changed by an editor of its shared link: it is edited, checked, simulated and implemented with the Silinx toolchain; Xilinx ISE and programming a board or a PROM run only once you trust it. Trust Project';
    assert.deepEqual(await warnings(ep), []);
    assert.deepEqual(await warnings(page), [untrusted]);
    assert.deepEqual(ep.errors, []);
  } finally { await ep.close(); await page.eval(async () => (await import('/js/collab-share.js')).stopSharing()); }
}, { timeout: 150000 });
