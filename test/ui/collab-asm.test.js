// UI: a shared project's ASM chart edited live (#3183, phase 3, its third editor), the owner and an editor in one test,
// in both interfaces: the owner shares with the chart open; the editor opens the editors' link, the chart editable
// there (no read-only notice); at once the owner drags a box and the editor renames a state in the side panel: the same
// chart on both sides with both changes; the owner's page writes it to the disk and its HDL generated again from it (as
// generate makes it from the merged chart); each one's Undo undoes their own change only; the owner's dialog in
// Portuguese. The exact console lines; no warnings but those asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { normalizeModel, generate } from '../../core/asm.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const F = 'src/speed_ctrl.asm.json', ED = '.doc:not([hidden]) .asm-editor';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));
const model = (page) => page.eval(() => normalizeAsm(window.Silinx.active.asmEditor.getModel()));
const node = (m, id) => m.nodes.find((n) => n.id === id);
const boxAt = (page, id) => page.eval((ed, nid) => { const b = document.querySelector(`${ed} [data-node="${nid}"]`).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, ED, id);
const disk = async () => normalizeModel(JSON.parse(await readWs(env, 'LiveAsm', F)));
const until = async (fn, what, ms = 10000) => { for (const t = Date.now(); ;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error(`timed out: ${what}`); await sleep(100); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

uiTest('#3183 an ASM chart edited live by the owner and an editor: a box moved and a state renamed at once on both sides, written with its HDL, each one\'s Undo their own; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'LiveAsm', template: 'blinky' });
  await page.openProject('LiveAsm');
  await page.eval((p) => window.SilinxApp.openFile(p), F);
  await page.waitFor(() => !!window.Silinx.active?.asmEditor, [], { what: 'the chart open' });
  await page.eval(async () => { window.normalizeAsm = (await import('/core/asm.js')).normalizeModel; });
  const a0 = await disk();
  const edit = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.editorsLink(); });
  const ep = await env.newPage(env.server.url);
  try {
    await ep.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
    await ep.goto(`${new URL(edit).origin}/?f=1${new URL(edit).hash}`);
    await ep.waitDialog('Follow a Shared Project');
    await ep.fill('.dlg-overlay input[data-field=name]', 'Rui');
    await ep.dialogButton('Follow');
    await ep.waitFor(() => window.Silinx?.project?.name === 'LiveAsm' && window.Silinx.startupChecked, [], { what: 'the project open', timeout: 30000 });
    await ep.waitConsole(/^Editing Ana's project "LiveAsm" with them: its text files and drawings change as you all edit them \(Following Ana, in the toolbar\)\.$/m);
    await page.waitConsole(/^Rui edits your project "LiveAsm" with you\.$/m);
    await ep.waitFor((p) => window.Silinx.active?.path === p && !!window.Silinx.active.asmEditor, [F], { what: 'the owner\'s chart followed' });
    await ep.eval(async () => { window.normalizeAsm = (await import('/core/asm.js')).normalizeModel; });
    assert.deepEqual(await ep.eval((ed) => [!!document.querySelector(`${ed} [data-follow-notice]`), !!document.querySelector(`${ed}.asm-readonly`)], ED), [false, false]);
    assert.deepEqual(await model(ep), a0);
    await sleep(700);   // (both bound: their track)
    // at once: Ana drags IDLE (s1) to the right; Rui selects WAIT_RELEASE (s2) and renames it in the side panel
    const p1 = await boxAt(page, 's1'), p2 = await boxAt(ep, 's2');
    await Promise.all([
      page.drag(p1, { x: p1.x + 120, y: p1.y }),
      (async () => { await ep.click(p2); await ep.waitForSelector(`${ED} .asm-selection input[data-focus]`); await ep.fill(`${ED} .asm-selection input[data-focus]`, 'RELEASE'); })(),
    ]);
    const both = (m) => node(m, 's2').name === 'RELEASE' && node(m, 's1').x > node(a0, 's1').x;
    await until(async () => both(await model(page)), 'both changes at the owner\'s');
    await ep.click(`${ED} .asm-toolbar`);   // (the side panel's field left: the merge shown)
    await until(async () => both(await model(ep)), 'both changes at the editor\'s');
    const merged = await model(page);
    assert.deepEqual(await model(ep), merged);
    // the owner's page writes it to the disk, and its HDL made again from it
    await until(async () => same(await disk(), merged), 'the merge on the disk');
    await until(async () => (await readWs(env, 'LiveAsm', 'src/speed_ctrl.vhd')) === generate(merged, 'vhdl', { source: 'speed_ctrl.asm.json' }).code, 'the HDL made again');
    // each one's Undo: their own change only, on both sides
    await ep.eval(() => window.Silinx.active.asmEditor.undo());
    await until(async () => { const m = await model(page); return node(m, 's2').name === 'WAIT_RELEASE' && node(m, 's1').x === node(merged, 's1').x; }, 'Rui\'s change undone at the owner\'s');
    await page.eval(() => window.Silinx.active.asmEditor.undo());
    await until(async () => same(await model(ep), a0), 'Ana\'s change undone at the editor\'s');
    assert.deepEqual(await model(page), a0);
    await until(async () => same(await disk(), a0), 'both undone on the disk');
    // the owner's dialog, in Portuguese
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    const dlg = page.eval(async () => { await (await import('/js/collab-share.js')).shareProjectDialog(); }).catch(() => {});
    await page.waitDialog('Partilhar Projeto');
    assert.ok((await page.eval(() => document.querySelector('.dlg-overlay').textContent)).includes('Quem tiver a ligação de editores edita os ficheiros de texto e os desenhos consigo, em direto.'));
    await page.dialogButton('Fechar');
    await dlg;
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
    const untrusted = 'WARNING: Project "LiveAsm" was changed by an editor of its shared link: it is edited, checked, simulated and implemented with the Silinx toolchain; Xilinx ISE and programming a board or a PROM run only once you trust it. Trust Project';
    assert.deepEqual(await warnings(ep), []);
    assert.deepEqual(await warnings(page), [untrusted]);
    assert.deepEqual(ep.errors, []);
  } finally { await ep.close(); await page.eval(async () => (await import('/js/collab-share.js')).stopSharing()); }
}, { timeout: 150000 });
