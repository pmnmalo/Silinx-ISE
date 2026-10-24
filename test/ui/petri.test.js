// UI: the Petri net editor (web/js/petri-editor.js, #186, #187): a new net from the Tools menu, a place
// added and undone, the simulation (a transition fired by a click, a clock step, the outputs), the HDL,
// the net as a module of the project (the top, its HDL file made with it, #207), the Portuguese interface.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupUi, uiTest, makeProject, readWs, waitDownload } from './harness.js';
import { newSourceWizardOf } from './new-source-helpers.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .petri-editor';

uiTest('Petri net editor: new net, a place added and undone, the token game and the clock step, the HDL, the net as the top module', E, async (page) => {
  await makeProject(env, { name: 'PnPj', top: '' });
  await page.openProject('PnPj');
  await page.menu('Tools', 'Petri Net Editor…');
  await page.waitDialog('New Source Wizard');
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'ctl');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor((ed) => window.Silinx.active?.id === 'pn:src/ctl.pn.json' && document.querySelector(ed), [ED], { what: 'the Petri net editor' });
  const count = () => page.eval((ed) => document.querySelector(`${ed} .asm-status`).textContent, ED);
  await page.waitFor((ed) => /2 places · 2 transitions · 4 arcs/.test(document.querySelector(`${ed} .asm-status`).textContent), [ED]);
  // the Place tool, a click on the drawing: a third place; Edit ▸ Undo takes it away
  await page.click(`${ED} .pn-tool`, { text: 'Place' });
  const box = await page.eval((ed) => { const r = document.querySelector(`${ed} .pn-canvas`).getBoundingClientRect(); return { x: r.left + r.width - 80, y: r.top + r.height - 60 }; }, ED);
  await page.click({ x: box.x, y: box.y });
  await page.waitFor((ed) => /^3 places/.test(document.querySelector(`${ed} .asm-status`).textContent), [ED], { what: 'a place added' });
  await page.menu('Edit', 'Undo');
  await page.waitFor((ed) => /^2 places/.test(document.querySelector(`${ed} .asm-status`).textContent), [ED], { what: 'undone' });
  assert.match(await count(), /2 places/);
  // the simulation: start is enabled but its guard (go) is false; go: it is ready, a click fires it
  await page.click(`${ED} .pn-tool`, { text: '➚ Select' });
  await page.click(`${ED} .pn-tab-btn`, { text: '▶ Simulate' });
  await page.waitFor((ed) => document.querySelector(`${ed} .pn-trans[data-id=t1]`)?.classList.contains('enabled'), [ED], { what: 'start enabled, guard false' });
  await page.click(`${ED} .pn-sim-ins input[type=checkbox]`);
  await page.waitFor((ed) => document.querySelector(`${ed} .pn-trans[data-id=t1]`).classList.contains('ready'), [ED], { what: 'start ready' });
  const at = await page.eval((ed) => { const r = document.querySelector(`${ed} .pn-trans[data-id=t1] rect`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, ED);
  await page.click({ x: at.x, y: at.y });
  await page.waitFor((ed) => document.querySelector(`${ed} .pn-marking`)?.textContent === 'idle=0  work=1', [ED], { what: 'start fired' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .pn-outs-now`).textContent, ED), 'busy=1');
  // go off, a clock step: done fires, back to idle
  await page.click(`${ED} .pn-sim-ins input[type=checkbox]`);
  await page.click(`${ED} .asm-codebar .asm-btn`, { text: '⏭ Clock step' });
  await page.waitFor((ed) => document.querySelector(`${ed} .pn-marking`)?.textContent === 'idle=1  work=0', [ED], { what: 'done fired at the clock step' });
  assert.match(await page.eval((ed) => document.querySelector(`${ed} .pn-log`).textContent, ED), /clock: done/);
  // the HDL
  await page.click(`${ED} .pn-tab-btn`, { text: '</> HDL' });
  await page.waitFor((ed) => /entity ctl is/.test(document.querySelector(`${ed} .pn-code`)?.textContent || ''), [ED], { what: 'the VHDL' });
  // the net is a module of the project with its HDL file, made with it (every source has its HDL, #207): Set as Top Module
  assert.match(await page.consoleText(), /src\/ctl\.vhd generated from src\/ctl\.pn\.json \(every source has its HDL\)/);
  await page.waitFor(() => [...document.querySelectorAll('#hier .lbl')].some((e) => e.textContent === 'ctl'), [], { what: 'ctl in the hierarchy' });
  await page.treeRow('#hier', 'ctl', { right: true, exact: true });
  await page.click('body > .menu-popup .mi', { text: 'Set as Top Module' });
  await page.waitFor(() => window.Silinx.project.top === 'ctl', [], { what: 'ctl is the top' });
  assert.equal(JSON.parse(await readWs(env, 'PnPj', 'src/ctl.pn.json')).generatedFile, 'src/ctl.vhd');
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => [...document.querySelectorAll(`${ed} .pn-tool`)].some((b) => b.textContent.trim() === 'Lugar'), [ED], { what: 'the toolbar in Portuguese' });
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
});

// a new net in a project, opened in the editor
async function newNet(page, pj) {
  await makeProject(env, { name: pj, top: '' });
  await page.openProject(pj);
  await page.menu('Tools', 'Petri Net Editor…');
  await page.waitDialog('New Source Wizard');
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'ctl');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor((ed) => /2 places · 2 transitions · 4 arcs/.test(document.querySelector(`${ed} .asm-status`)?.textContent || ''), [ED], { what: 'the Petri net editor' });
}
const node = (page, id) => page.eval((ed, i) => { const r = document.querySelector(`${ed} [data-id=${i}] ${i[0] === 'p' ? 'circle' : 'rect'}`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, ED, id);
const statusOf = (page) => page.eval((ed) => document.querySelector(`${ed} .asm-status`).textContent, ED);
const problems = (page) => page.eval((ed) => [...document.querySelectorAll(`${ed} .asm-prob`)].map((li) => `${li.classList.contains('warning') ? 'warning' : 'error'}: ${li.textContent}`), ED);
const saved = async (pj) => JSON.parse(await readWs(env, pj, 'src/ctl.pn.json'));
// a project file once it is what `ok` wants (it is written by the autosave, ~0.8 s after the edit, and
// later on a loaded machine): returns it; else fails naming `what` (and `ok` is asserted on the last read)
async function untilWs(pj, file, ok, what, timeout = 15000) {
  const t0 = Date.now();
  let text;
  for (;;) {
    try { text = await readWs(env, pj, file); if (ok(text)) return text; } catch { /* not yet */ }
    if (Date.now() - t0 > timeout) throw new Error(`timed out after ${timeout} ms waiting for ${file}: ${what}${text != null ? ` (last:\n${text.slice(0, 2000)})` : ''}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}
const untilSaved = async (pj, ok, what) => JSON.parse(await untilWs(pj, 'src/ctl.pn.json', (t) => { try { return ok(JSON.parse(t)); } catch { return false; } }, what));
async function setField(page, label, value) {
  const ok = await page.eval((ed, l, v) => {
    const f = [...document.querySelectorAll(`${ed} .asm-side .asm-field`)].find((x) => x.querySelector('.asm-label')?.textContent === l);
    const i = f?.querySelector('input, textarea'); if (!i) return false;
    i.value = v; i.dispatchEvent(new Event('change', { bubbles: true })); return true;
  }, ED, label, String(value));
  assert.ok(ok, `field ${label}`);
}

uiTest('Petri net editor: arcs and inhibitor arcs drawn, delete / undo / redo, the properties, priorities, the problems (exact)', E, async (page) => {
  await newNet(page, 'PnEd');
  // a third transition, arcs work → t3 → idle
  await page.click(`${ED} .pn-tool`, { text: 'Transition' });
  const box = await page.eval((ed) => { const r = document.querySelector(`${ed} .pn-canvas`).getBoundingClientRect(); return { x: r.left + r.width - 70, y: r.top + r.height - 70 }; }, ED);
  await page.click(box);
  await page.waitFor((ed) => /3 transitions/.test(document.querySelector(`${ed} .asm-status`).textContent), [ED], { what: 't3 added' });
  await page.click(`${ED} .pn-tool`, { text: '→ Arc' });
  await page.click(await node(page, 'p2')); await page.click(await node(page, 't3'));
  await page.click(await node(page, 't3')); await page.click(await node(page, 'p1'));
  await page.waitFor((ed) => /6 arcs/.test(document.querySelector(`${ed} .asm-status`).textContent), [ED], { what: 'two arcs drawn' });
  // a place to a place: refused
  await page.click(await node(page, 'p1')); await page.click(await node(page, 'p2'));
  await page.waitFor((ed) => document.querySelector(`${ed} .asm-status-msg`).textContent === 'An arc joins a place and a transition', [ED]);
  // an inhibitor arc work ⊸ start; from a transition: refused
  await page.click(`${ED} .pn-tool`, { text: '⊸ Inhibitor' });
  await page.click(await node(page, 't1')); await page.click(await node(page, 'p1'));
  await page.waitFor((ed) => document.querySelector(`${ed} .asm-status-msg`).textContent === 'An inhibitor arc goes from a place to a transition', [ED]);
  await page.click(await node(page, 'p2')); await page.click(await node(page, 't1'));
  await page.waitFor((ed) => /7 arcs/.test(document.querySelector(`${ed} .asm-status`).textContent) && document.querySelector(`${ed} .pn-arc.inhibitor`), [ED], { what: 'the inhibitor arc' });
  let m = await untilSaved('PnEd', (x) => x.arcs.length === 7, 'the 7 arcs saved');
  assert.deepEqual(m.arcs.slice(4).map((a) => [a.from, a.to, !!a.inhibitor]), [['p2', 't3', false], ['t3', 'p1', false], ['p2', 't1', true]]);
  // the inhibitor arc is selected: ✕ deletes it, ↶ brings it back, ↷ deletes it again
  await page.click(`${ED} .asm-danger`, { text: '✕' });
  await page.waitFor((ed) => /6 arcs/.test(document.querySelector(`${ed} .asm-status`).textContent), [ED], { what: 'deleted' });
  await page.click(`${ED} .tb-btn[title=Undo]`);
  await page.waitFor((ed) => /7 arcs/.test(document.querySelector(`${ed} .asm-status`).textContent), [ED], { what: 'undone' });
  await page.click(`${ED} .tb-btn[title=Redo]`);
  await page.waitFor((ed) => /6 arcs/.test(document.querySelector(`${ed} .asm-status`).textContent), [ED], { what: 'redone' });
  // the properties: idle 2 tokens (its capacity follows), t3 a guard, a pulse, the first in priority
  await page.click(`${ED} .pn-tool`, { text: '➚ Select' });
  await page.click(await node(page, 'p1'));
  await setField(page, 'Initial tokens', 2);
  await page.click(await node(page, 't3'));
  await setField(page, 'Guard', 'go');
  await setField(page, 'Pulses when it fires', 'busy=1');
  await page.click(`${ED} .asm-small`, { text: '▲ Higher' });
  await page.click(`${ED} .asm-small`, { text: '▲ Higher' });
  await page.waitFor((ed) => /Priority 1 of 3/.test(document.querySelector(`${ed} .pn-selection`).textContent), [ED], { what: 't3 first' });
  m = await untilSaved('PnEd', (x) => x.transitions[0]?.name === 't1', 't3 (t1) first, saved');
  assert.deepEqual(m.places.map((p) => [p.name, p.tokens, p.capacity]), [['idle', 2, 2], ['work', 0, 1]]);
  assert.deepEqual(m.transitions.map((t) => [t.name, t.guard, t.outputs]), [['t1', 'go', { busy: '1' }], ['start', 'go', {}], ['done', '!go', {}]]);
  assert.deepEqual(await problems(page), []);
  // the problems, exact: a place alone, a guard that does not parse, an output not of the net
  await page.click(`${ED} .pn-tool`, { text: 'Place' });
  await page.click({ x: box.x, y: box.y - 120 });
  await page.waitFor((ed) => /3 places/.test(document.querySelector(`${ed} .asm-status`).textContent), [ED]);
  await page.click(`${ED} .pn-tool`, { text: '➚ Select' });
  await page.click(await node(page, 't3'));
  await setField(page, 'Guard', 'go &');
  await page.click(await node(page, 'p2'));
  await setField(page, 'Outputs while marked', 'zz=1');
  await page.waitFor((ed) => document.querySelectorAll(`${ed} .asm-prob`).length === 3, [ED], { what: 'three problems' });
  assert.deepEqual(await problems(page), [
    "error: transition t1: guard 'go &': unexpected end of expression",
    "error: work: 'zz' is not an output of the net",
    'warning: place p1 is not connected',
  ]);
  // a click on a problem selects what it is about
  await page.click(`${ED} .asm-prob`, { text: 'place p1 is not connected' });
  await page.waitFor((ed) => /^Place p1/.test(document.querySelector(`${ed} .pn-selection .asm-section-title`)?.textContent || ''), [ED], { what: 'p1 selected' });
});

uiTest('Petri net editor: Random, Run / Stop, Reset; PNML export and import (undone); the HDL file generated and kept in sync', E, async (page) => {
  await newNet(page, 'PnSim');
  await page.click(`${ED} .pn-tab-btn`, { text: '▶ Simulate' });
  const marking = () => page.eval((ed) => document.querySelector(`${ed} .pn-marking`)?.textContent, ED);
  await page.waitFor((ed) => document.querySelector(`${ed} .pn-marking`)?.textContent === 'idle=1  work=0', [ED]);
  // Random: go off, nothing can fire; go on: start fires
  await page.click(`${ED} .asm-codebar .asm-btn`, { text: '🎲 Random' });
  await page.waitFor((ed) => document.querySelector(`${ed} .asm-status-msg`).textContent === 'No transition is enabled with these inputs', [ED], { what: 'nothing enabled' });
  await page.click(`${ED} .pn-sim-ins input[type=checkbox]`);
  await page.click(`${ED} .asm-codebar .asm-btn`, { text: '🎲 Random' });
  await page.waitFor((ed) => document.querySelector(`${ed} .pn-marking`)?.textContent === 'idle=0  work=1', [ED], { what: 'start fired at random' });
  // Reset: back to the initial marking, the log empty
  await page.click(`${ED} .asm-codebar .asm-btn`, { text: '⟲ Reset' });
  await page.waitFor((ed) => document.querySelector(`${ed} .pn-marking`)?.textContent === 'idle=1  work=0' && !document.querySelector(`${ed} .pn-log li`), [ED], { what: 'reset' });
  // Run (go still on): start fires at a clock step; Stop
  await page.click(`${ED} .asm-codebar .asm-btn`, { text: '▶▶ Run' });
  await page.waitFor((ed) => document.querySelector(`${ed} .pn-marking`)?.textContent === 'idle=0  work=1', [ED], { what: 'start fired while running', timeout: 5000 });
  // a click whose press and release fall on each side of a clock step of Run is not lost (#233): go
  // off (done fires at a step), then ■ Stop; the controls were drawn again at each step, and the
  // click went to an element no longer there
  const steps = () => page.eval((ed) => document.querySelectorAll(`${ed} .pn-log li`).length, ED);
  const slowClick = async (sel, text) => {
    const { x, y } = await page.point(sel, { text });
    await page.mouse('mouseMoved', x, y);
    await page.mouse('mousePressed', x, y);
    const n = await steps();
    await page.waitFor((ed, k) => document.querySelectorAll(`${ed} .pn-log li`).length > k, [ED, n], { what: 'a clock step while the button is pressed' });
    await page.mouse('mouseReleased', x, y);
  };
  await slowClick(`${ED} .pn-sim-ins input[type=checkbox]`);
  await page.waitFor((ed) => document.querySelector(`${ed} .pn-sim-ins input[type=checkbox]`).checked === false, [ED], { what: 'go off' });
  await page.waitFor((ed) => document.querySelector(`${ed} .pn-marking`)?.textContent === 'idle=1  work=0', [ED], { what: 'done fired while running' });
  await slowClick(`${ED} .asm-codebar .asm-btn`, '■ Stop');
  await page.waitFor((ed) => [...document.querySelectorAll(`${ed} .asm-codebar .asm-btn`)].some((b) => b.textContent === '▶▶ Run'), [ED], { what: 'stopped' });
  const m1 = await marking();
  await new Promise((r) => setTimeout(r, 1200));
  assert.equal(await marking(), m1, 'no clock step once stopped');
  assert.match(await page.eval((ed) => document.querySelector(`${ed} .pn-log`).textContent, ED), /clock: start/);
  // PNML export: the net as PNML, read back by core/petri.js
  await page.click(`${ED} button`, { text: 'PNML ⇩' });
  const f = await waitDownload(page, 'ctl.pnml');
  const { fromPnml, newPetri, normalizePetri } = await import('../../core/petri.js');
  assert.deepEqual(fromPnml(await fs.readFile(f, 'utf8')), normalizePetri(newPetri('ctl')));
  // PNML import: a net of another tool replaces this one; Undo brings it back
  const pnml = path.join(page.downloadDir, 'other.pnml');
  await fs.writeFile(pnml, `<?xml version="1.0"?><pnml><net id="n" type="P/T net"><place id="P0"><name><text>a</text></name><initialMarking><text>1</text></initialMarking></place>
    <place id="P1"><name><text>b</text></name></place><transition id="T0"><name><text>go_on</text></name></transition>
    <arc id="x" source="P0" target="T0"/><arc id="y" source="T0" target="P1"/></net></pnml>`);
  await page.setFiles(`${ED} input[type=file]`, [pnml]);
  await page.waitFor((ed) => document.querySelector(`${ed} .asm-status`).textContent.startsWith('2 places · 1 transitions · 2 arcs'), [ED], { what: 'imported' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .pn-marking`)?.textContent, ED), 'a=1  b=0');
  await page.menu('Edit', 'Undo');
  await page.waitFor((ed) => /2 places · 2 transitions · 4 arcs/.test(document.querySelector(`${ed} .asm-status`).textContent), [ED], { what: 'the import undone' });
  // the HDL file: made with the net (every source has its HDL, #207), generated from it
  await page.waitFor(() => window.Silinx.project.files.some((x) => x.path === 'src/ctl.vhd'), [], { what: 'src/ctl.vhd in the project' });
  await page.waitFor(() => /^HDL: ctl\.vhd — generated from the net$/.test(document.querySelector('.doc:not([hidden]) .petri-editor .gen-banner')?.textContent || ''), [], { what: 'the link banner' });
  // (the import undone is saved, and its HDL written, a moment after the editor shows it)
  await untilWs('PnSim', 'src/ctl.vhd', (t) => /entity ctl is[\s\S]*busy : out std_logic/.test(t), 'the HDL of the net (the import undone)');
  await setField(page, 'Outputs', 'busy, ready');
  await untilWs('PnSim', 'src/ctl.vhd', (t) => /ready : out std_logic/.test(t), 'the HDL file follows the net');
  assert.equal((await saved('PnSim')).generatedFile, 'src/ctl.vhd');
  // the HDL file is read-only (#1176): typed text changes nothing, the net and the file stay as they are, and no
  // warning (it was read as a schematic, #222)
  const net = await readWs(env, 'PnSim', 'src/ctl.pn.json'), hdl = await readWs(env, 'PnSim', 'src/ctl.vhd');
  await page.eval(() => window.SilinxApp.openFile('src/ctl.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/ctl.vhd' && window.Silinx.active.editor);
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) [data-sync-banner]').textContent), 'Read-only, generated from ctl.pn.json');
  await page.click('.doc:not([hidden]) .cm-content');
  await page.type('-- a note\n');
  await new Promise((r) => setTimeout(r, 1000));
  assert.equal(await page.eval(() => window.Silinx.active.editor.getValue()), hdl);
  assert.equal(await readWs(env, 'PnSim', 'src/ctl.vhd'), hdl);
  assert.equal(await readWs(env, 'PnSim', 'src/ctl.pn.json'), net);
  assert.doesNotMatch(await page.consoleText(), /WARNING|not synchronized/);
});

uiTest('Petri net editor: the analysis (#188): properties, places, transitions, invariants, a deadlock shown in the simulation; in Portuguese', E, async (page) => {
  await newNet(page, 'PnAn');
  const txt = (sel) => page.eval((ed, s) => [...document.querySelectorAll(`${ed} ${s}`)].map((e) => e.textContent), ED, sel);
  await page.click(`${ED} .pn-tab-btn`, { text: '∑ Analysis' });
  await page.waitFor((ed) => document.querySelector(`${ed} .pn-an-props`), [ED], { what: 'the analysis' });
  assert.deepEqual(await txt('.pn-an-props tr'), ['Boundedsafe (at most 1 token in each place)', 'Deadlocksnone', 'Liveyes: every transition can always fire again',
    'Reversibleyes: the initial marking can always be reached again', 'Conservativeyes: every place is in a P-invariant']);
  assert.deepEqual(await txt('.pn-an-places tr'), ['PlaceMost tokensCapacityBits needed', 'idle11 (reached)1 flip-flop', 'work11 (reached)1 flip-flop']);
  assert.deepEqual(await txt('.pn-an-trans tr td:last-child'), ['live', 'live']);
  assert.deepEqual(await txt('.pn-an-pinv li'), ['idle + work = 1']);
  assert.deepEqual(await txt('.pn-an-tinv li'), ['start + done']);
  assert.deepEqual(await txt('.pn-an-graph li'), ['idle=1  work=0  →  start: M1', 'idle=0  work=1  →  done: M0']);
  // done no longer puts the token back (its arc to idle deleted): a deadlock after start, done
  await page.click(`${ED} .pn-tool`, { text: '➚ Select' });
  const arc = await page.eval((ed) => { const l = document.querySelector(`${ed} .pn-arc[data-id=a4] .pn-arc-hit`).getBoundingClientRect(); return { x: l.left + l.width / 2, y: l.top + l.height / 2 }; }, ED);
  // each step waited for, so that a failure names it (#233): the arc selected by the click (what was
  // under the pointer said), the keys going to the editor, the arc gone
  const under = await page.eval((x, y) => { const e = document.elementFromPoint(x, y); return `${e?.tagName}.${e?.getAttribute('class')} of ${e?.closest('[data-kind]')?.dataset.id ?? 'nothing'}`; }, arc.x, arc.y);
  await page.click(arc);
  await page.waitFor((ed) => document.querySelector(`${ed} .pn-arc[data-id=a4]`)?.classList.contains('sel'), [ED], { what: `arc a4 selected by the click (under the pointer: ${under})` });
  await page.waitFor((ed) => document.activeElement === document.querySelector(ed), [ED], { what: 'the keyboard focus in the editor' });
  await page.key('Delete');
  await page.waitFor((ed) => !document.querySelector(`${ed} .pn-arc[data-id=a4]`), [ED], { what: 'arc a4 deleted' });
  await page.waitFor((ed) => document.querySelector(`${ed} .pn-an-dead`), [ED], { what: 'the deadlock' });
  assert.deepEqual(await txt('.pn-an-props tr td'), ['safe (at most 1 token in each place)', '1 reachable marking where no transition can fire', 'no', 'no', 'no']);
  assert.deepEqual(await txt('.pn-an-dead li'), ['idle=0  work=0 after start, done Show']);
  assert.deepEqual(await txt('.pn-an-trans tr td:last-child'), ['can fire, but not always again', 'can fire, but not always again']);
  assert.deepEqual(await txt('.pn-an-pinv li'), ['none']);
  assert.deepEqual(await txt('.pn-an-tinv li'), ['none']);
  // Show: the simulation from that marking
  await page.click(`${ED} .pn-an-dead .asm-small`, { text: 'Show' });
  await page.waitFor((ed) => document.querySelector(`${ed} .pn-marking`)?.textContent === 'idle=0  work=0' && document.querySelector(`${ed} .pn-dead`), [ED], { what: 'the deadlock simulated' });
  // in Portuguese
  await page.click(`${ED} .pn-tab-btn`, { text: '∑ Analysis' });
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => /O jogo das marcas, sejam quais forem as entradas/.test(document.querySelector(`${ed} .asm-bottom, ${ed}`).textContent), [ED], { what: 'the analysis in Portuguese' });
  assert.deepEqual(await txt('.pn-an-props tr td'), ['segura (no máximo 1 marca em cada lugar)', '1 marcação alcançável onde nenhuma transição pode disparar', 'não', 'não', 'não']);
  assert.deepEqual(await txt('.pn-an-dead li'), ['idle=0  work=0 depois de start, done Mostrar']);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
});

uiTest('Petri Net Wizard (#208): New Source ▸ Petri Net ▸ Wizard (#958), name and location, the inputs and outputs (no bidirectional), the clock and the reset, a clash refused; the net created with its ports and its HDL file, opened', E, async (page) => {
  await makeProject(env, { name: 'PnWiz', top: '' });
  await page.openProject('PnWiz');
  // New Source: one 'Petri Net' type; the Wizard button of its File Name and Location page opens the wizard
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source Wizard');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .src-types .st')].map((e) => e.textContent.trim()).filter((t) => /Petri/.test(t))), ['Petri Net']);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  await newSourceWizardOf(page, 'Petri Net', 'ctl', 'Petri Net Wizard');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .wiz-main h3').textContent), 'Name and Language');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .mw-name').value), 'ctl');
  await page.fill('.dlg-overlay .mw-name', 'ctl');
  await page.fill('.dlg-overlay .mw-loc', 'nets');
  await page.waitFor(() => document.querySelector('.dlg-overlay .mw-file').textContent === 'nets/ctl.pn.json', [], { what: 'the file' });
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Inputs and Outputs');
  // inputs and outputs only
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .mw-quick > div > span:first-child')].map((s) => s.textContent)), ['Quick add (inputs):', 'Quick add (outputs):']);
  // no clk / reset quick buttons: the clock and the reset have fields of their own
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .mw-qa')].map((b) => b.dataset.port).filter((n) => /^(clk|reset)$/.test(n))), []);
  for (let k = 0; k < 4; k++) await page.click('.dlg-overlay .mw-add');
  for (const [k, [n, d, w]] of [['go', 'in', 1], ['sel', 'in', 3], ['busy', 'out', 1], ['st', 'out', 2]].entries()) {
    await page.fill('.dlg-overlay .mw-pname', n, { index: k });
    await page.fill('.dlg-overlay .mw-pdir', d, { index: k });
    await page.fill('.dlg-overlay .mw-pwidth', String(w), { index: k });
  }
  assert.deepEqual(await page.eval(() => [...document.querySelector('.dlg-overlay .mw-pdir').options].map((o) => o.value)), ['in', 'out']);
  // an input named like the clock: refused, with its message
  await page.fill('.dlg-overlay .pw-clock', 'go');
  await page.dialogButton('Next >');
  await page.waitFor(() => /'go' is used twice \(the clock and input\)/.test(document.querySelector('.dlg-overlay').innerText), [], { what: 'the clash' });
  await page.fill('.dlg-overlay .pw-clock', 'clk');
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Summary');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .mw-summary').textContent), [
    'The wizard will create the Petri net nets/ctl.pn.json and open it in the Petri net editor.', '',
    'Module: ctl (VHDL)', 'Inputs: go, sel [2:0]', 'Outputs: busy, st [1:0]', 'Clock: clk; reset: rst (synchronous, active high)', '',
    'Then draw its places, transitions and arcs; the outputs are set by the places (while marked) and the transitions (when they fire).'].join('\n'));
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor((ed) => window.Silinx.active?.id === 'pn:nets/ctl.pn.json' && /^0 places · 0 transitions · 0 arcs$/.test(document.querySelector(`${ed} .asm-status`)?.textContent || ''), [ED], { what: 'the empty net opened' });
  const m = JSON.parse(await readWs(env, 'PnWiz', 'nets/ctl.pn.json'));
  assert.deepEqual([m.name, m.lang, m.clock, m.reset, m.inputs, m.outputs, m.places, m.transitions, m.arcs],
    ['ctl', 'vhdl', 'clk', { name: 'rst', active: 'high', sync: true }, [{ name: 'go', width: 1 }, { name: 'sel', width: 3 }], [{ name: 'busy', width: 1 }, { name: 'st', width: 2 }], [], [], []]);
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .asm-prob`)].map((li) => li.textContent), ED), []);
  // its HDL file, made with it (#207) and kept in sync
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'nets/ctl.vhd'), [], { what: 'nets/ctl.vhd', timeout: 15000 });
  assert.match(await readWs(env, 'PnWiz', 'nets/ctl.vhd'), /entity ctl is[\s\S]*sel : in std_logic_vector\(2 downto 0\);[\s\S]*st : out std_logic_vector\(1 downto 0\)/);
  assert.equal(JSON.parse(await readWs(env, 'PnWiz', 'nets/ctl.pn.json')).generatedFile, 'nets/ctl.vhd');
  assert.match(await page.eval(() => document.querySelector('#console, .console-page')?.textContent || ''), /Petri Net Wizard: created nets\/ctl\.pn\.json with 2 input\(s\) and 2 output\(s\)\./);
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.eval(() => { import('/js/petri-wizard.js').then((w) => w.petriWizard()); });
  await page.waitFor(() => /Assistente de Rede de Petri/.test(document.querySelector('.dlg-overlay')?.innerText || ''), [], { what: 'in Portuguese' });
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay').innerText), /O assistente cria uma rede de Petri[\s\S]*Nome da rede de Petri \(módulo\):/);
  await page.click('.dlg-overlay .dlg-buttons .btn', { text: 'Cancelar' });
  await page.waitNoDialog();
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
});
