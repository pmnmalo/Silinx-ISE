// UI: a shared project's truth table edited live (#3183, phase 3, its second editor), the owner and an editor in one
// test, in both interfaces: the owner shares with the table open; the editor opens the editors' link, the table editable
// there (no read-only notice); both click a cell of the same output at once: the same table on both sides with both
// changes; the owner's page writes it to the disk and its HDL generated again from it (as generateTableHdl makes it from
// the merged table); each one's Undo undoes their own change only; notes typed by the editor reach the owner once
// typed; the owner's dialog in Portuguese. The exact console lines; no warnings but those asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { normalizeTable, generateTableHdl } from '../../core/logic.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TT = 'src/lamps.bool.json', ED = '.doc:not([hidden]) .tt-editor';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));
const model = (page) => page.eval(() => window.Silinx.active.ttEditor.getModel());
const cellAt = (o, r) => `${ED} td.tt-cell[data-out="${o}"][data-row="${r}"]`;
const disk = async () => normalizeTable(JSON.parse(await readWs(env, 'LiveTt', TT)));
const until = async (fn, what, ms = 10000) => { for (const t = Date.now(); ;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error(`timed out: ${what}`); await sleep(100); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

uiTest('#3183 a truth table edited live by the owner and an editor: two cells of one output at once on both sides, written with its HDL, each one\'s Undo their own, notes; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'LiveTt', template: 'traffic' });
  await page.openProject('LiveTt');
  await page.eval((p) => window.SilinxApp.openFile(p), TT);
  await page.waitFor(() => !!window.Silinx.active?.ttEditor, [], { what: 'the table open' });
  const t0 = await disk();
  const edit = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.editorsLink(); });
  const ep = await env.newPage(env.server.url);
  try {
    await ep.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
    await ep.goto(`${new URL(edit).origin}/?f=1${new URL(edit).hash}`);
    await ep.waitDialog('Follow a Shared Project');
    await ep.fill('.dlg-overlay input[data-field=name]', 'Rui');
    await ep.dialogButton('Follow');
    await ep.waitFor(() => window.Silinx?.project?.name === 'LiveTt' && window.Silinx.startupChecked, [], { what: 'the project open', timeout: 30000 });
    await ep.waitConsole(/^Editing Ana's project "LiveTt" with them: its text files and drawings change as you all edit them \(Following Ana, in the toolbar\)\.$/m);
    await page.waitConsole(/^Rui edits your project "LiveTt" with you\.$/m);
    // the owner's table followed, editable here: no read-only notice
    await ep.waitFor((p) => window.Silinx.active?.path === p && !!window.Silinx.active.ttEditor, [TT], { what: 'the owner\'s table followed' });
    assert.equal(await ep.eval((ed) => !!document.querySelector(`${ed} [data-follow-notice]`), ED), false);
    assert.deepEqual(await model(ep), t0);
    await sleep(700);   // (both bound: their track)
    // at once: Ana clicks car_r's row 14, Rui its row 15 (both don't cares: X -> 0)
    await Promise.all([page.click(cellAt('car_r', 14)), ep.click(cellAt('car_r', 15))]);
    const want = `${t0.table.car_r.slice(0, 14)}00`;
    await until(async () => (await model(page)).table.car_r === want, 'both cells at the owner\'s');
    await until(async () => (await model(ep)).table.car_r === want, 'both cells at the editor\'s');
    const merged = await model(page);
    assert.deepEqual(await model(ep), merged);
    assert.equal(await ep.eval((s) => document.querySelector(s).textContent, cellAt('car_r', 14)), '0');
    // the owner's page writes it to the disk, and its HDL made again from it
    await until(async () => same(await disk(), merged), 'the merge on the disk');
    await until(async () => (await readWs(env, 'LiveTt', 'src/lamps.vhd')) === generateTableHdl(merged, 'vhdl', { source: 'lamps.bool.json' }).code, 'the HDL made again');
    // each one's Undo: their own change only, on both sides
    await ep.eval(() => window.Silinx.active.ttEditor.undo());
    await until(async () => (await model(page)).table.car_r === `${t0.table.car_r.slice(0, 14)}0X`, 'Rui\'s cell undone at the owner\'s');
    await page.eval(() => window.Silinx.active.ttEditor.undo());
    await until(async () => same(await model(ep), t0), 'Ana\'s cell undone at the editor\'s');
    assert.deepEqual(await model(page), t0);
    await until(async () => same(await disk(), t0), 'both undone on the disk');
    // notes typed by Rui: at the owner's once typed
    await ep.click(`${ED} .tt-notes`);
    await ep.eval(() => { const n = document.querySelector('.doc:not([hidden]) .tt-editor .tt-notes'); n.value = `${n.value} (seen by Rui)`; n.dispatchEvent(new Event('input')); });
    await until(async () => (await model(page)).notes === `${t0.notes} (seen by Rui)`, 'the notes at the owner\'s');
    await until(async () => (await disk()).notes === `${t0.notes} (seen by Rui)`, 'the notes on the disk');
    // the owner's dialog, in Portuguese
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    const dlg = page.eval(async () => { await (await import('/js/collab-share.js')).shareProjectDialog(); }).catch(() => {});
    await page.waitDialog('Partilhar Projeto');
    assert.ok((await page.eval(() => document.querySelector('.dlg-overlay').textContent)).includes('Quem tiver a ligação de editores edita os ficheiros de texto e os desenhos consigo, em direto.'));
    await page.dialogButton('Fechar');
    await dlg;
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
    // (the owner's project untrusted by the editor's first change written, #3355) no other warning, on either side
    const untrusted = 'WARNING: Project "LiveTt" was changed by an editor of its shared link: it is edited, checked, simulated and implemented with the Silinx toolchain; Xilinx ISE and programming a board or a PROM run only once you trust it. Trust Project';
    assert.deepEqual(await warnings(ep), []);
    assert.deepEqual(await warnings(page), [untrusted]);
    assert.deepEqual(ep.errors, []);
  } finally { await ep.close(); await page.eval(async () => (await import('/js/collab-share.js')).stopSharing()); }
}, { timeout: 150000 });
