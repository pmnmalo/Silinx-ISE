// UI: a shared project's schematic edited live (#3183, phase 3, its last editor), the owner and an editor in one test,
// in both interfaces: the owner shares with the schematic open; the editor opens the editors' link, the schematic
// editable there (no read-only notice); at once the owner drags a symbol and the editor renames another in the
// properties: the same schematic on both sides with both changes; the owner's page writes it to the disk and its HDL
// generated again from it (as generateHdl makes it from the merged schematic); each one's Undo undoes their own change
// only; the owner's dialog in Portuguese. The exact console lines; no warnings but those asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { normalizeDoc, generateHdl } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const F = 'src/gates.sch.json', ED = '.doc:not([hidden]) .sch-editor';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));
const C = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
const model = async (page) => JSON.parse(C(await page.eval(() => window.Silinx.active.schEditor.getDoc())));
const sym = (m, id) => m.symbols.find((s) => s.id === id);
const at = (page, id) => page.eval((ed, x) => { const b = document.querySelector(`${ed} [data-kind=sym][data-id="${x}"]`).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, ED, id);
const disk = async () => JSON.parse(C(normalizeDoc(JSON.parse(await readWs(env, 'LiveSch', F)))));
const until = async (fn, what, ms = 10000) => { for (const t = Date.now(); ;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error(`timed out: ${what}`); await sleep(100); } };
const same = (a, b) => C(a) === C(b);

uiTest('#3183 a schematic edited live by the owner and an editor: a symbol moved and another renamed at once on both sides, written with its HDL, each one\'s Undo their own; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'LiveSch', template: 'gates' });
  await page.openProject('LiveSch');
  await page.eval((p) => window.SilinxApp.openSch(p), F);
  await page.waitFor(() => !!window.Silinx.active?.schEditor, [], { what: 'the schematic open' });
  const s0 = await disk();
  const edit = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.editorsLink(); });
  const ep = await env.newPage(env.server.url);
  try {
    await ep.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
    await ep.goto(`${new URL(edit).origin}/?f=1${new URL(edit).hash}`);
    await ep.waitDialog('Follow a Shared Project');
    await ep.fill('.dlg-overlay input[data-field=name]', 'Rui');
    await ep.dialogButton('Follow');
    await ep.waitFor(() => window.Silinx?.project?.name === 'LiveSch' && window.Silinx.startupChecked, [], { what: 'the project open', timeout: 30000 });
    await ep.waitConsole(/^Editing Ana's project "LiveSch" with them: its text files and drawings change as you all edit them \(Following Ana, in the toolbar\)\.$/m);
    await page.waitConsole(/^Rui edits your project "LiveSch" with you\.$/m);
    await ep.waitFor((p) => window.Silinx.active?.path === p && !!window.Silinx.active.schEditor, [F], { what: 'the owner\'s schematic followed' });
    assert.equal(await ep.eval((ed) => !!document.querySelector(`${ed} [data-follow-notice]`), ED), false);
    assert.deepEqual(await model(ep), s0);
    await sleep(700);   // (both bound: their track)
    // at once: Ana drags the inverter inv_c (S5) down; Rui selects inv_a (S7) and renames it in the properties
    const p5 = await at(page, 'S5'), p7 = await at(ep, 'S7');
    await Promise.all([
      page.drag(p5, { x: p5.x, y: p5.y + 60 }),
      (async () => {
        await ep.click(p7);
        await ep.waitFor((ed) => [...document.querySelectorAll(`${ed} .se-props .se-field`)].some((f) => f.querySelector('label')?.textContent === 'Instance name'), [ED], { what: 'inv_a\'s properties' });
        await ep.eval((ed) => { const i = [...document.querySelectorAll(`${ed} .se-props .se-field`)].find((f) => f.querySelector('label').textContent === 'Instance name').querySelector('input'); i.focus(); i.value = 'inv_aa'; i.dispatchEvent(new Event('change')); }, ED);
      })(),
    ]);
    await ep.click(`${ED} .se-toolbar, ${ED} [class*=toolbar]`);   // (the properties' field left: the merge shown)
    const both = (m) => sym(m, 'S7').name === 'inv_aa' && sym(m, 'S5').y > sym(s0, 'S5').y;
    await until(async () => both(await model(page)), 'both changes at the owner\'s');
    await until(async () => both(await model(ep)), 'both changes at the editor\'s');
    const merged = await model(page);
    assert.deepEqual(await model(ep), merged);
    // the owner's page writes it to the disk, and its HDL made again from it
    await until(async () => same(await disk(), merged), 'the merge on the disk');
    await until(async () => (await readWs(env, 'LiveSch', 'src/gates.vhd')) === generateHdl(normalizeDoc(merged), { lang: 'vhdl' }).code, 'the HDL made again');
    // each one's Undo: their own change only, on both sides
    await ep.eval(() => window.Silinx.active.schEditor.undo());
    await until(async () => { const m = await model(page); return sym(m, 'S7').name === 'inv_a' && sym(m, 'S5').y === sym(merged, 'S5').y; }, 'Rui\'s change undone at the owner\'s');
    await page.eval(() => window.Silinx.active.schEditor.undo());
    await until(async () => same(await model(ep), s0), 'Ana\'s change undone at the editor\'s');
    assert.deepEqual(await model(page), s0);
    await until(async () => same(await disk(), s0), 'both undone on the disk');
    // the owner's dialog, in Portuguese
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    const dlg = page.eval(async () => { await (await import('/js/collab-share.js')).shareProjectDialog(); }).catch(() => {});
    await page.waitDialog('Partilhar Projeto');
    assert.ok((await page.eval(() => document.querySelector('.dlg-overlay').textContent)).includes('Quem tiver a ligação de editores edita os ficheiros de texto e os desenhos consigo, em direto.'));
    await page.dialogButton('Fechar');
    await dlg;
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
    const untrusted = 'WARNING: Project "LiveSch" was changed by an editor of its shared link: it is edited, checked, simulated and implemented with the Silinx toolchain; Xilinx ISE and programming a board or a PROM run only once you trust it. Trust Project';
    assert.deepEqual(await warnings(ep), []);
    assert.deepEqual(await warnings(page), [untrusted]);
    assert.deepEqual(ep.errors, []);
  } finally { await ep.close(); await page.eval(async () => (await import('/js/collab-share.js')).stopSharing()); }
}, { timeout: 150000 });
