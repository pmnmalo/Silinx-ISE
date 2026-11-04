// UI (#2803): the Check of the Petri net's and the state diagram's toolbars (the shared icon, as the ASM chart's
// Validate), its lines in the Console, its errors and warnings in their tabs; the end of every check brings its Errors
// tab to the front if it found errors, else its Warnings tab, also when it is run again with the same messages (the
// drawing's Check, Check Syntax, Check Constraints, the Schematic's Check), errors winning when both, and when they come in separate batches; hidden in a
// read-only diagram; in Portuguese. Both interfaces; the warnings asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { newPetri } from '../../core/petri.js';
import { newFsm } from '../../core/fsm.js';
import { newDoc, normalizeDoc, symbolPins } from '../../core/schdoc.js';
import { setupUi, uiTest, makeProject, tick } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const D = '.doc:not([hidden])';

const shown = (page) => page.eval(() => document.querySelector('#console-tabs .tab.active').dataset.page);
const waitShown = (page, p) => page.waitFor((x) => document.querySelector('#console-tabs .tab.active').dataset.page === x, [p], { what: `the ${p} tab in front` });
const rows = (page, which) => page.eval((w) => [...document.querySelectorAll(`#console-${w} .diag`)].map((d) => d.textContent.replace(/(▸|Fix: ).*/, '').trim()), which);
const toConsole = (page) => page.click('#console-tabs .tab[data-page=console]');
const noWarnings = (page) => assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);

// the drawings: a Petri net with an error (a guard that does not parse), one with a warning only (its sequence ends:
// a deadlock); a state diagram with an error (a state with no name), one with a warning only, one with both
const pnErr = () => { const m = newPetri('pe'); m.transitions[0].guard = 'go &'; return m; };
const pnWarn = () => { const m = newPetri('pw'); m.arcs = m.arcs.filter((a) => a.id !== 'a4'); return m; };
const fsmErr = () => { const m = newFsm('fe'); m.states[1].name = ''; return m; };
const fsmWarn = () => { const m = newFsm('fw'); m.outputs[0].default = '3'; return m; };
const fsmBoth = () => { const m = fsmWarn(); m.name = 'fb'; m.states[1].name = ''; return m; };
const FILES = { 'src/pe.pn.json': pnErr(), 'src/pw.pn.json': pnWarn(), 'src/fe.fsm.json': fsmErr(), 'src/fw.fsm.json': fsmWarn(), 'src/fb.fsm.json': fsmBoth() };
const PN_ERR = "ERROR: transition start: guard 'go &': unexpected end of expression";
const PN_WARN = 'WARNING: the net can reach a deadlock, no transition able to fire: after start, done';
const FSM_ERR = 'ERROR: State has no name';
const FSM_WARN = ["WARNING: Output 'z': the default value 3 does not fit in 1 bit(s)", "WARNING: Output 'z' is never set: it always keeps its default value 3"];

const closeAll = (page) => page.eval(async () => { for (const d of [...window.Silinx.docs]) await window.SilinxApp.closeDoc(d, { force: true }); });
async function open(page, file, sel) {
  await page.eval((f) => window.SilinxApp.openFile(f), file);
  await page.waitFor((s) => document.querySelector(s)?.getClientRects().length > 0, [`${D} ${sel}`], { what: file });
}
// the drawing's Check clicked: the Console's lines of that check, from its header to its result
async function clickCheck(page, btn, what) {
  const n = await page.eval((w) => window.__console().split(`Started : "${w}"`).length, what);
  await page.click(`${D} ${btn}`);
  await page.waitFor((w, k) => window.__console().split(`Started : "${w}"`).length > k && /Process "[^"]+" (completed|failed)[^\n]*$/.test(window.__console().trimEnd()), [what, n], { what: `${what} done` });
  const text = await page.eval(() => window.__console());
  return text.slice(text.lastIndexOf(`Started : "${what}"`)).split('\n').map((l) => l.trim()).filter(Boolean);
}

uiTest('#2803 the Petri net\'s and the state diagram\'s Check: their lines in the Console, the Errors tab, else the Warnings tab, in front', E, async (page) => {
  const files = Object.fromEntries(Object.entries(FILES).map(([f, m]) => [f, JSON.stringify(m, null, 2)]));
  await makeProject(env, { name: 'ChkDraw', top: '', files });
  await page.openProject('ChkDraw');
  await page.showMessages();
  // the Petri net with an error: the Errors tab, run again too (the same error, listed already)
  await open(page, 'src/pe.pn.json', '.pn-toolbar');
  assert.equal(await page.eval((d) => document.querySelector(`${d} .pn-toolbar .pn-check`).textContent, D), 'Check');
  assert.ok(await page.eval((d) => !!document.querySelector(`${d} .pn-toolbar .pn-check.asm-wide svg`), D), 'the shared icon');
  for (const k of [1, 2]) {
    await toConsole(page);
    assert.deepEqual(await clickCheck(page, '.pn-check', 'Check Petri Net'), ['Started : "Check Petri Net" of pe.pn.json.', PN_ERR, 'Process "Check Petri Net" failed'], `run ${k}`);
    await waitShown(page, 'errors');
  }
  assert.deepEqual(await rows(page, 'errors'), [`ERROR:PetriNet - "src/pe.pn.json": ${PN_ERR.slice(7)}`]);
  // the Petri net with a warning only (its token game's: no warning before the Check): the Warnings tab
  await closeAll(page);
  await open(page, 'src/pw.pn.json', '.pn-toolbar');
  await toConsole(page);
  assert.deepEqual(await clickCheck(page, '.pn-check', 'Check Petri Net'), ['Started : "Check Petri Net" of pw.pn.json.', PN_WARN, 'Process "Check Petri Net" completed successfully with 1 warning(s)']);
  await waitShown(page, 'warnings');
  assert.ok((await rows(page, 'warnings')).includes(`WARNING:PetriNet - "src/pw.pn.json": ${PN_WARN.slice(9)}`));
  // the state diagram with an error, one with a warning only, one with both: Errors, Warnings, Errors
  for (const [file, lines, page_] of [
    ['fe.fsm.json', [FSM_ERR, 'Process "Check State Diagram" failed'], 'errors'],
    ['fw.fsm.json', [...FSM_WARN, 'Process "Check State Diagram" completed successfully with 2 warning(s)'], 'warnings'],
    ['fb.fsm.json', [FSM_WARN[0], FSM_ERR, FSM_WARN[1], 'Process "Check State Diagram" failed'], 'errors'],
  ]) {
    // (the other drawings' problems closed with them: the tabs list this one's)
    await closeAll(page);
    await open(page, `src/${file}`, '.fsm-toolbar');
    assert.equal(await page.eval((d) => document.querySelector(`${d} .fsm-toolbar .fsm-check`).textContent, D), 'Check');
    await toConsole(page);
    assert.deepEqual(await clickCheck(page, '.fsm-check', 'Check State Diagram'), [`Started : "Check State Diagram" of ${file}.`, ...lines], file);
    await waitShown(page, page_);
  }
  // the error's line of the Check: a click selects its state (s2, the one with no name)
  assert.equal(await page.eval((d) => document.querySelector(`${d} [data-state="s2"]`).classList.contains('sel'), D), false);
  await page.eval(() => [...document.querySelectorAll('#console-log .ln.mc-link')].filter((l) => l.textContent === 'ERROR: State has no name').at(-1).click());
  await page.waitFor((d) => document.querySelector(`${d} [data-state="s2"]`).classList.contains('sel'), [D], { what: 'the state selected' });
  noWarnings(page);
}, { timeout: 180000 });

uiTest('#2803 Check Syntax run again: its Errors or Warnings tab in front again; errors and warnings in separate batches end with Errors', E, async (page) => {
  const UNUSED = 'module top(input a, input b, output y);\n  assign y = a;\nendmodule\n';
  const BOTH = 'module top(input a, input b, output y);\n  assign y = a & c;\nendmodule\n';
  await makeProject(env, { name: 'ChkSyn', top: 'top', files: { 'src/top.v': UNUSED } });
  await page.openProject('ChkSyn');
  await page.showMessages();
  await page.eval(() => window.SilinxApp.openFile('src/top.v'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.v' && window.Silinx.active.editor);
  const check = async (text) => {
    await page.eval((t) => window.Silinx.active.editor.setValue(t), text);
    const n = await page.eval(() => window.__console().split('Started : "Check Syntax"').length);
    await page.click(`${D} .editor-bar .btn`, { text: 'Check Syntax' });
    await page.waitFor((k) => window.__console().split('Started : "Check Syntax"').length > k && /Process "Check Syntax" (completed|failed)[^\n]*$/.test(window.__console().trimEnd()), [n], { what: 'Check Syntax done' });
  };
  // a warning only, twice: the Warnings tab both times
  for (const k of [1, 2]) {
    await toConsole(page);
    await check(UNUSED);
    await waitShown(page, 'warnings');
    assert.deepEqual(await rows(page, 'warnings'), ['WARNING:Silinx:647 - "src/top.v" Line 1: Input <b> is never used.'], `run ${k}`);
  }
  // an error (the design checks then stop: its warning is the emulator's line below), twice: the Errors tab both times
  await page.eval(() => window.SilinxApp.log('WARNING: Board Emulator: w0', 'warn'));
  for (const k of [1, 2]) {
    await toConsole(page);
    await check(BOTH);
    await waitShown(page, 'errors');
    assert.equal((await rows(page, 'errors')).length, 1, `run ${k}`);
    assert.match((await rows(page, 'errors'))[0], /^ERROR:\S+ - "src\/top\.v" Line 2: 'c' is not declared/);
    assert.deepEqual(await rows(page, 'warnings'), ['WARNING:Silinx - Board Emulator: w0'], 'both listed: the Errors tab');
  }
  // a run's lines in separate batches, its warnings first, then its errors, then a warning again: Errors in front
  await page.click('#console-clear');
  await waitShown(page, 'console');
  await page.eval(() => window.SilinxApp.log('WARNING: Board Emulator: w1', 'warn'));
  await waitShown(page, 'warnings');
  await tick(120);
  await page.eval(() => window.SilinxApp.log('ERROR: Board Emulator: e1', 'err'));
  await waitShown(page, 'errors');
  await tick(120);
  await page.eval(() => window.SilinxApp.log('WARNING: Board Emulator: w1', 'warn'));   // (written again: new, but errors are listed)
  await tick(200);
  assert.equal(await shown(page), 'errors');
  // the same error written again (a process run again): the Errors tab again
  await toConsole(page);
  await page.eval(() => window.SilinxApp.log('ERROR: Board Emulator: e1', 'err'));
  await waitShown(page, 'errors');
  noWarnings(page);
}, { timeout: 120000 });

uiTest('#2803 the Check in Portuguese; hidden in a read-only diagram (a Petri net\'s state machine)', E, async (page) => {
  await makeProject(env, { name: 'ChkPt', top: '', files: { 'src/pw.pn.json': JSON.stringify(pnWarn(), null, 2), 'src/fw.fsm.json': JSON.stringify(fsmWarn(), null, 2) } });
  await page.openProject('ChkPt');
  await page.eval(() => import('/js/drawings.js').then((m) => m.openPetriFsm('src/pw.pn.json')));
  await page.waitFor(() => window.Silinx.active?.id === 'pnfsm:src/pw.pn.json' && document.querySelector('.doc:not([hidden]) .asm-toolbar > .gen-banner.read-only'), [], { what: 'the state machine' });
  assert.equal(await page.eval((d) => document.querySelector(`${d} .fsm-check`)?.getClientRects().length, D), 0, 'read-only: no Check');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  for (const [file, sel, title] of [
    ['src/pw.pn.json', '.pn-check', 'Verificar erros e avisos na rede (também o seu jogo de marcas: transições que nunca disparam, bloqueios)'],
    ['src/fw.fsm.json', '.fsm-check', 'Verificar erros e avisos no diagrama'],
  ]) {
    await open(page, file, sel);
    await page.waitFor((s, t) => { const b = document.querySelector(s); return b?.textContent === 'Verificar' && b.title === t; }, [`${D} ${sel}`, title], { what: `${file}: its Check in Portuguese` });
  }
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  noWarnings(page);
});

uiTest('#2803 the Schematic\'s Check (the Silinx interface) and Check Constraints run again: their tab in front again', E, async (page) => {
  // (two inverters' outputs on one net: an error; a UCF that leaves an input with no LOC: a warning)
  const doc = newDoc('bad', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'inv', x: 200, y: 100, rot: 0, mirror: false, name: 'U1', params: {} }, { id: 'S2', type: 'inv', x: 200, y: 200, rot: 0, mirror: false, name: 'U2', params: {} });
  const pins = doc.symbols.map((s) => symbolPins(normalizeDoc({ ...doc, symbols: [s] }).symbols[0]));
  const o1 = pins[0].find((p) => p.name === 'O'), o2 = pins[1].find((p) => p.name === 'O');
  doc.wires.push({ id: 'W1', points: [{ x: o1.x, y: o1.y }, { x: o1.x + 30, y: o1.y }, { x: o1.x + 30, y: o2.y }, { x: o2.x, y: o2.y }] });
  await makeProject(env, { name: 'ChkSchUcf', top: 'top', board: 'basys2', constraints: 'constraints/top.ucf', files: {
    'src/bad.sch.json': JSON.stringify(doc), 'src/top.v': 'module top(input sw, output led);\n  assign led = sw;\nendmodule\n', 'constraints/top.ucf': 'NET "led" LOC = "M5" ;\n' } });
  await page.openProject('ChkSchUcf');
  await page.showMessages();
  const WARN = 'WARNING:ConstraintSystem - "constraints/top.ucf" Line 1: 1 port bit(s) of \'top\' have no LOC: sw';
  // Check Constraints (the UCF's Check Syntax), twice: the Warnings tab both times
  await page.eval(() => window.SilinxApp.openFile('constraints/top.ucf'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:constraints/top.ucf' && window.Silinx.active.editor);
  for (const k of [1, 2]) {
    await toConsole(page);
    const n = await page.eval(() => window.__console().split('Started : "Check Constraints"').length);
    await page.click(`${D} .editor-bar .btn`, { text: 'Check Syntax' });
    await page.waitFor((c) => window.__console().split('Started : "Check Constraints"').length > c && /Process "Check Constraints" completed successfully with 1 warning\(s\)$/.test(window.__console().trimEnd()), [n], { what: `Check Constraints ${k}` });
    await waitShown(page, 'warnings');
    assert.deepEqual(await rows(page, 'warnings'), [WARN], `run ${k}`);
  }
  // the Schematic's Check: in the Silinx interface the console's (the ISE style: the editor's panel)
  if (await page.eval(() => document.documentElement.dataset.layout !== 'tasks')) { noWarnings(page); return; }
  await page.eval(() => window.SilinxApp.openSch('src/bad.sch.json'));
  await page.waitFor((d) => document.querySelector(`${d} .se-btn[data-act=check]`), [D], { what: 'the schematic' });
  for (const k of [1, 2]) {
    await toConsole(page);
    const n = await page.eval(() => window.__console().split('Process "Check Schematic" failed').length);
    await page.click(`${D} .se-btn[data-act=check]`);
    await page.waitFor((c) => window.__console().split('Process "Check Schematic" failed').length > c, [n], { what: `Check Schematic ${k}` });
    await waitShown(page, 'errors');
    assert.ok((await rows(page, 'errors')).some((r) => /U1|U2|driv/i.test(r)), `run ${k}: ${await rows(page, 'errors')}`);
  }
  noWarnings(page);
}, { timeout: 120000 });
