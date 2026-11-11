// UI: a shared project's state diagram edited live (#3183, phase 3), the owner and an editor in one test, in both
// interfaces: the owner shares with the FSM open; the editor opens the editors' link, the diagram editable there (no
// read-only notice); both change it at once (the owner drags a state, the editor renames another in place): the same
// diagram on both sides with both changes; the owner's page writes it to the disk and its HDL generated again from it
// (as generateFsm makes it from the merged diagram); each one's Undo undoes their own change only; a transition the editor
// adds to a state the owner deleted meanwhile goes with it, said in both consoles; the owner's dialog in Portuguese. The
// exact console lines; no warnings but those asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { normalizeFsm, generateFsm } from '../../core/fsm.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const FSM = 'src/traffic.fsm.json', ED = '.doc:not([hidden]) .fsm-editor';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));
const model = (page) => page.eval(() => window.Silinx.active.fsmEditor.getModel());
const state = (m, id) => m.states.find((s) => s.id === id);
const statePos = (page, id) => page.eval((ed, sid) => {
  const b = document.querySelector(`${ed} [data-state="${sid}"] .fsm-circle`).getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
}, ED, id);
const until = async (fn, what, ms = 10000) => { for (const t = Date.now(); ;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error(`timed out: ${what}`); await sleep(100); } };

uiTest('#3183 a state diagram edited live by the owner and an editor: both changes on both sides, written with its HDL, each one\'s Undo their own, a transition to a deleted state removed and said; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'LiveFsm', template: 'traffic' });
  await page.openProject('LiveFsm');
  await page.eval((p) => window.SilinxApp.openFsm(p), FSM);
  await page.waitFor(() => window.Silinx.active?.fsmEditor?.fitted(), [], { what: 'the diagram open' });
  const disk0 = normalizeFsm(JSON.parse(await readWs(env, 'LiveFsm', FSM)));
  const edit = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.editorsLink(); });
  const ep = await env.newPage(env.server.url);
  try {
    await ep.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
    await ep.goto(`${new URL(edit).origin}/?f=1${new URL(edit).hash}`);
    await ep.waitDialog('Follow a Shared Project');
    await ep.fill('.dlg-overlay input[data-field=name]', 'Rui');
    await ep.dialogButton('Follow');
    await ep.waitFor(() => window.Silinx?.project?.name === 'LiveFsm' && window.Silinx.startupChecked, [], { what: 'the project open', timeout: 30000 });
    await ep.waitConsole(/^Editing Ana's project "LiveFsm" with them: its text files and drawings change as you all edit them \(Following Ana, in the toolbar\)\.$/m);
    await page.waitConsole(/^Rui edits your project "LiveFsm" with you\.$/m);
    // the owner's diagram followed, editable here: no read-only notice, its tools there
    await ep.waitFor((p) => window.Silinx.active?.path === p && window.Silinx.active.fsmEditor?.fitted(), [FSM], { what: 'the owner\'s diagram followed' });
    assert.deepEqual(await ep.eval((ed) => [!!document.querySelector(`${ed} [data-follow-notice]`), !!document.querySelector(`${ed}.asm-readonly`)], ED), [false, false]);
    assert.deepEqual(await model(ep), disk0);
    await sleep(700);   // (both bound: their track)
    // at once: Ana drags ALL_RED (s3) down, Rui renames NIGHT (s7) in place
    const a = await statePos(page, 's3'), n = await statePos(ep, 's7');
    await Promise.all([
      page.drag(a, { x: a.x, y: a.y + 90 }),
      (async () => { await ep.click(n); await ep.key('F2'); await ep.waitForSelector(`${ED} .fsm-inline`); await ep.fill(`${ED} .fsm-inline`, 'DARK'); await ep.key('Enter'); })(),
    ]);
    const both = (m) => state(m, 's7').name === 'DARK' && state(m, 's3').y > state(disk0, 's3').y;
    await until(async () => both(await model(page)), 'both changes at the owner\'s');
    await until(async () => both(await model(ep)), 'both changes at the editor\'s');
    const merged = await model(page);
    assert.deepEqual(await model(ep), merged);
    // the owner's page writes it to the disk, and its HDL made again from it
    await until(async () => JSON.stringify(normalizeFsm(JSON.parse(await readWs(env, 'LiveFsm', FSM)))) === JSON.stringify(merged), 'the merge on the disk');
    await until(async () => (await readWs(env, 'LiveFsm', 'src/traffic.vhd')).includes('S_DARK'), 'the HDL made again');
    assert.equal(await readWs(env, 'LiveFsm', 'src/traffic.vhd'), generateFsm(merged, 'vhdl', { source: 'traffic.fsm.json' }).code);
    // each one's Undo: their own change only, on both sides
    await ep.eval(() => window.Silinx.active.fsmEditor.undo());
    await until(async () => { const m = await model(page); return state(m, 's7').name === 'NIGHT' && state(m, 's3').y === state(merged, 's3').y; }, 'Rui\'s change undone at the owner\'s');
    await page.eval(() => window.Silinx.active.fsmEditor.undo());
    await until(async () => JSON.stringify(await model(ep)) === JSON.stringify(disk0), 'Ana\'s change undone at the editor\'s');
    assert.deepEqual(await model(page), disk0);
    await until(async () => JSON.stringify(normalizeFsm(JSON.parse(await readWs(env, 'LiveFsm', FSM)))) === JSON.stringify(disk0), 'both undone on the disk');
    // Ana deletes WALK (s4) while Rui, who has not seen it yet, connects CARS_YELLOW to it: the transition goes with it,
    // said on both sides
    const before = await model(ep);
    await page.click(await statePos(page, 's4'));
    await page.waitFor((ed) => document.querySelector(`${ed} .fsm-state.sel`)?.dataset.state === 's4', [ED], { what: 'WALK selected' });
    await page.key('Delete');
    await until(async () => !state(await model(ep), 's4'), 'WALK deleted at the editor\'s');
    await ep.eval(async (path, m) => {
      const { putDrawing } = await import('/core/collab-model.js');
      const { collab } = await import('/js/collab-state.js');
      putDrawing(collab.session.doc, path, { ...m, transitions: [...m.transitions, { id: 't9', from: 's2', to: 's4', cond: 'req', outputs: {} }] }, { base: m, client: collab.session.doc.clientID });
    }, FSM, before);
    const said = /^WARNING: src\/traffic\.fsm\.json: a transition \(t9~[0-9a-z]+\) removed with what it connected, deleted by another participant\.$/;
    await until(async () => (await warnings(ep)).some((l) => said.test(l)), 'said at the editor\'s');
    await until(async () => (await warnings(page)).some((l) => said.test(l)), 'said at the owner\'s');
    const m1 = await model(page);
    assert.deepEqual(await model(ep), m1);
    assert.ok(!state(m1, 's4') && !m1.transitions.some((t) => t.from === 's4' || t.to === 's4'));
    // the owner's dialog, in Portuguese
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    const dlg = page.eval(async () => { await (await import('/js/collab-share.js')).shareProjectDialog(); }).catch(() => {});
    await page.waitDialog('Partilhar Projeto');
    assert.ok((await page.eval(() => document.querySelector('.dlg-overlay').textContent)).includes('Quem tiver a ligação de editores edita os ficheiros de texto e os desenhos consigo, em direto.'));
    await page.dialogButton('Fechar');
    await dlg;
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
    // (the owner's project untrusted by the editor's first change written, #3355) no warnings but those, on either side
    const untrusted = 'WARNING: Project "LiveFsm" was changed by an editor of its shared link: it is edited, checked, simulated and implemented with the Silinx toolchain; Xilinx ISE and programming a board or a PROM run only once you trust it. Trust Project';
    const ew = await warnings(ep), ow = await warnings(page);
    assert.equal(ew.length, 1, ew.join('\n'));
    assert.match(ew[0], said);
    assert.deepEqual(ow.map((l) => (said.test(l) ? 'said' : l)), [untrusted, 'said']);
    assert.deepEqual(ep.errors, []);
  } finally { await ep.close(); await page.eval(async () => (await import('/js/collab-share.js')).stopSharing()); }
}, { timeout: 150000 });
