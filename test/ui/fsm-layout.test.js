// UI: the FSM editor laid out as the other editors (#2729, docs/UI-GUIDELINES.md), on the traffic example: no hint line
// line; no selector in the toolbar (the Encoding and the Coding Style in the ⋮ menu, #3289), the zoom level beside the zoom tools;
// "7 state(s), 8 transition(s)", Moore or Mealy and the encoding in its status line (#2763), none in its toolbar, counted
// again on a change; the reset's name on the start-up arrow, following the Properties' Reset signal; a text typed in
// place that is not valid: a warning in the console; a Petri net's state machine (read-only) the same; in Portuguese.
// No other warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { newPetri } from '../../core/petri.js';
import { generateFsm } from '../../core/fsm-hdl.js';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const ED = '.doc:not([hidden]) .fsm-editor';
// the toolbar's shown parts, left to right: a label's text, a select's class, a button's text
const bar = (page) => page.eval((ed) => [...document.querySelectorAll(`${ed} .asm-toolbar .asm-group > *`)]
  .filter((e) => e.getClientRects().length && /^(SPAN|SELECT)$/.test(e.tagName)).map((e) => (e.tagName === 'SELECT' ? `<${e.classList[1]}>` : e.textContent)), ED);
const status = (page) => page.eval((ed) => [...document.querySelectorAll(`${ed} > .doc-status .ds-f`)].map((f) => f.textContent), ED);
const warnings = (page) => page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text);
// the ⋮ menu's choices (#3289): each title followed by its options, ✓ on the diagram's
const choices = (page) => page.eval((ed) => [...document.querySelector(`${ed} .tb-more-menu`).children]
  .filter((e) => e.matches('.tb-menu-title, .tb-menu-check'))
  .map((e) => (e.classList.contains('tb-menu-title') ? e.textContent : `${e.getAttribute('aria-checked') === 'true' ? '✓ ' : ''}${e.lastChild.textContent}`)), ED);
const pickChoice = async (page, value) => {
  await page.click(`${ED} .tb-more-btn`);
  await page.click(`${ED} .tb-more-menu [data-value="${value}"]`);
};

async function openTraffic(page, name) {
  await makeProject(env, { name, template: 'traffic' });
  await page.setViewport(1440, 900);
  await page.eval(async () => {
    const [{ prefKey }, { PROPS_KEY }] = await Promise.all([import('/js/prefs.js'), import('/js/narrow.js')]);
    for (const k of [prefKey('silinx.fsm.props.folded'), PROPS_KEY]) localStorage.removeItem(k);
  });
  await page.openProject(name);
  await page.eval(() => window.SilinxApp.openFsm('src/traffic.fsm.json'));
  await page.waitFor(() => window.Silinx.active?.fsmEditor?.fitted(), [], { what: 'the FSM editor' });
}

uiTest('#2729 FSM editor: no hint line; labelled selectors and the zoom in the toolbar, the counts in the status line (#2763); the reset on the start-up arrow; an invalid text to the console', E, async (page) => {
  await openTraffic(page, 'FsmLay');
  // no hint line; one status line, the editor's last line
  assert.deepEqual(await page.eval((ed) => ['.asm-hint', '.asm-status', '.asm-status-msg', '.doc-status'].map((s) => document.querySelectorAll(`${ed} ${s}`).length), ED), [0, 0, 0, 1]);
  assert.equal(await page.eval((ed) => document.querySelector(ed).lastElementChild.className, ED), 'doc-status');
  // the toolbar: the labels before their selectors, the zoom level beside the zoom tools, no counts
  const tb = await bar(page);
  assert.match(tb[0], /^\d+%$/);   // (the zoom level, the view fitted)
  assert.deepEqual(tb.slice(1), []);
  assert.deepEqual(await status(page), ['7 state(s), 8 transition(s)', 'Moore', 'Encoding: Binary']);
  // counted again: a state added and undone
  await page.click(`${ED} .asm-btn`, { text: 'State' });
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-info`).textContent === '8 state(s), 8 transition(s)', [ED], { what: 'a state counted' });
  await page.eval(() => window.Silinx.active.fsmEditor.undo());
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-info`).textContent === '7 state(s), 8 transition(s)', [ED], { what: 'undone' });
  // the encoding changed: in the status line too
  await pickChoice(page, 'onehot');
  assert.deepEqual(await status(page), ['7 state(s), 8 transition(s)', 'Moore', 'Encoding: One-hot']);
  await page.eval(() => window.Silinx.active.fsmEditor.undo());
  // the Properties: nothing selected, no section of the selection; the Machine section a title, not a fold; a state
  // selected: its section alone (#3764), the machine's again once nothing is
  const props = () => page.eval((ed) => [...document.querySelectorAll(`${ed} .asm-side > .asm-section`)].filter((s) => s.getClientRects().length)
    .map((s) => `${s.tagName.toLowerCase()} ${s.querySelector('h3, summary')?.textContent.split(' ')[0]}`), ED);
  assert.deepEqual(await props(), ['section Machine']);   // (no Problems: the console's, #2737)
  assert.equal(await page.eval((ed) => document.querySelectorAll(`${ed} .asm-side summary`).length, ED), 0);
  await page.click(`${ED} [data-state=s2] .fsm-circle`);
  assert.deepEqual(await props(), ['section State']);
  await page.key('Escape');
  await page.waitFor((ed) => !document.querySelector(`${ed} .fsm-sname`), [ED], { what: 'nothing selected' });
  assert.deepEqual(await props(), ['section Machine']);
  // the reset's name on the start-up arrow into CARS, over the arrow; renamed in the Properties' Machine section
  const reset = () => page.eval((ed) => {
    const g = document.querySelector(`${ed} .fsm-state.initial`), t = g.querySelector('.fsm-reset'), a = g.querySelector('.fsm-entry').getBoundingClientRect(), r = t.getBoundingClientRect();
    return { state: g.querySelector('.fsm-name').textContent, text: t.textContent, over: r.bottom <= a.top + 1 && r.left < a.right && r.right > a.left, n: document.querySelectorAll(`${ed} .fsm-reset`).length };
  }, ED);
  assert.deepEqual(await reset(), { state: 'CARS', text: 'rst', over: true, n: 1 });
  const rst = await page.eval((ed) => [...document.querySelectorAll(`${ed} .asm-side .asm-field`)].findIndex((f) => f.querySelector('.asm-label').textContent === 'Reset signal'), ED);
  assert.ok(rst >= 0);
  await page.eval((ed, i) => { const x = document.querySelectorAll(`${ed} .asm-side .asm-field`)[i].querySelector('input'); x.value = 'reset_n'; x.dispatchEvent(new Event('input')); }, ED, rst);
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-reset`).textContent === 'reset_n', [ED], { what: 'the reset renamed' });
  await page.eval(() => window.Silinx.active.fsmEditor.undo());
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-reset`).textContent === 'rst', [ED], { what: 'undone' });
  // a text typed in place that is not valid: not applied, a warning in the console
  const { parseOutputs } = await import('../../core/fsm.js');
  // (a double-click on CARS, as test/ui/fsm-parts.test.js: a press re-draws the state under the pointer)
  await page.eval((ed) => { const c = document.querySelector(`${ed} [data-state=s1] .fsm-circle`), b = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 })); }, ED);
  await page.waitForSelector(`${ED} .fsm-inline`);
  await page.fill(`${ED} .fsm-inline`, 'CARS / phase=');
  await page.key('Enter');
  const want = `WARNING: src/traffic.fsm.json: ${parseOutputs('phase=').error} (not applied)`;
  await page.waitFor((w) => [...document.querySelectorAll('#console-log .ln')].some((l) => l.textContent === w), [want], { what: 'the warning' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#console-log .ln.warn, #console-log .ln.err')].map((l) => l.textContent).filter((t) => /^(WARNING|ERROR)/.test(t))), [want]);   // (not the start-up's notes on the tools found)
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} [data-state=s1] .fsm-outs`).textContent, ED), 'phase=0', 'not applied');
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  assert.deepEqual((await bar(page)).slice(1), []);
  assert.deepEqual(await status(page), ['7 estado(s), 8 transição(ões)', 'Moore', 'Codificação: Binária']);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(warnings(page), []);
});


uiTest('#3289 FSM editor: the Encoding and the Coding Style choices of the ⋮ menu, not in the toolbar; the HDL made in them; undone; in Portuguese', E, async (page) => {
  await openTraffic(page, 'FsmStyle');
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .asm-toolbar .asm-group select`), ED), null);
  const ENC = ['Encoding', '✓ Binary', 'Gray', 'One-hot', 'Enumerated'];
  const menu = async () => (await choices(page)).slice(-8);
  assert.deepEqual(await menu(), [...ENC, 'Coding Style', '✓ 3 processes', '2 processes']);
  // a line above each title, Encoding's after the commands as Coding Style's after the encodings (#3306)
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .tb-more-menu .tb-menu-title`)].map((t) => getComputedStyle(t).borderTopStyle), ED), ['solid', 'solid']);
  const model = await page.eval(() => window.Silinx.active.fsmEditor.getModel());
  const hdl = (m) => generateFsm({ ...model, ...m }, 'vhdl', { source: 'traffic.fsm.json' }).code;
  const vhdl = async (want, what) => {
    let vhd = '';
    for (let i = 0; i < 50 && vhd !== want; i++) { vhd = await readWs(env, 'FsmStyle', 'src/traffic.vhd'); if (vhd !== want) await new Promise((r) => setTimeout(r, 200)); }
    assert.equal(vhd, want, what);
  };
  const got = () => page.eval(() => { const m = window.Silinx.active.fsmEditor.getModel(); return [m.encoding, m.style]; });
  // 2 processes: the diagram's style, its VHDL made again in it
  assert.notEqual(hdl({ style: '2process' }), hdl({ style: '3process' }));
  await pickChoice(page, '2process');
  assert.deepEqual(await got(), ['binary', '2process']);
  assert.deepEqual(await menu(), [...ENC, 'Coding Style', '3 processes', '✓ 2 processes']);
  await vhdl(hdl({ style: '2process' }), 'the VHDL in 2 processes');
  // Gray: the encoding, in the status line too (#2763), the VHDL in both
  await pickChoice(page, 'gray');
  assert.deepEqual(await got(), ['gray', '2process']);
  assert.deepEqual(await menu(), ['Encoding', 'Binary', '✓ Gray', 'One-hot', 'Enumerated', 'Coding Style', '3 processes', '✓ 2 processes']);
  assert.deepEqual(await status(page), ['7 state(s), 8 transition(s)', 'Moore', 'Encoding: Gray']);
  await vhdl(hdl({ encoding: 'gray', style: '2process' }), 'the VHDL in Gray, 2 processes');
  // undone twice: the ✓ back on Binary and 3 processes, and each chosen again
  await page.eval(() => window.Silinx.active.fsmEditor.undo());
  await page.eval(() => window.Silinx.active.fsmEditor.undo());
  assert.deepEqual(await got(), ['binary', '3process']);
  assert.deepEqual(await menu(), [...ENC, 'Coding Style', '✓ 3 processes', '2 processes']);
  await pickChoice(page, '2process');
  await pickChoice(page, 'gray');
  assert.deepEqual(await got(), ['gray', '2process'], 'chosen again after the undo');
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  assert.deepEqual(await menu(), ['Codificação', 'Binário', '✓ Gray', 'One-hot', 'Enumerada', 'Estilo de Código', '3 processos', '✓ 2 processos']);
  assert.deepEqual(await status(page), ['7 estado(s), 8 transição(ões)', 'Moore', 'Codificação: Gray']);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(warnings(page), []);
});

uiTest('#2729 a Petri net\'s state machine (read-only): no hint or status line, the counts at the toolbar\'s right end, the reset on the start-up arrow, the machine\'s fields disabled', E, async (page) => {
  // the same layout as the editor's, its Properties' fields disabled
  await makeProject(env, { name: 'FsmLayPn', files: { 'src/net.pn.json': JSON.stringify(newPetri('net')) } });
  await page.openProject('FsmLayPn');
  await page.eval(async () => (await import('/js/petri-fsm-doc.js')).openPetriFsm('src/net.pn.json'));
  await page.waitFor((ed) => document.querySelector(`${ed}.asm-readonly .asm-side`)?.getClientRects().length, [ED], { what: 'the state machine' });
  const ro = await page.eval((ed) => {
    const e = document.querySelector(ed), f = [...e.querySelectorAll('.asm-side input, .asm-side select, .asm-side textarea')];
    return { disabled: f.length > 0 && f.every((x) => x.disabled), hint: e.querySelectorAll('.asm-hint, .asm-status').length, info: e.querySelector(':scope > .doc-status .fsm-info').textContent,
      labels: [...e.querySelectorAll('.fsm-tb-label')].filter((x) => x.getClientRects().length).length, reset: e.querySelector('.fsm-reset')?.textContent };
  }, ED);
  assert.deepEqual(ro, { disabled: true, hint: 0, info: ro.info, labels: 0, reset: 'rst' });
  assert.match(ro.info, /^\d+ state\(s\), \d+ transition\(s\)$/);
  assert.deepEqual(warnings(page), []);
});
