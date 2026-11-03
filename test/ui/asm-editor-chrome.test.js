// UI (#2730): the ASM chart editor as the other editors (docs/UI-GUIDELINES.md): no hint on the canvas, no status line,
// its states at the toolbar's right end, "Encoding:" before its selector, the Machine panel on the left (folded,
// remembered, over the canvas on a narrow window by ☰ Machine), its problems in the console's Errors and Warnings (a
// click selecting the box) and Validate's lines in the Console, none in the editor; Portuguese. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newModel } from '../../core/asm.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const D = '.doc:not([hidden]) .asm-editor';
// the new chart's states, and LOST: no exit (an error), unreachable (a warning)
const chart = () => {
  const m = newModel('ctl', 'vhdl');
  m.nodes.push({ id: 'sx', type: 'state', name: 'LOST', x: 700, y: 400, actions: [] });
  return JSON.stringify(m, null, 2);
};
const ERR = "State 'LOST' has no exit (next state path)", WARN = "State 'LOST' is unreachable from the initial state";
const tab = (page, id) => page.eval((i) => [...document.querySelectorAll(`#${i} .diag`)].map((r) => r.textContent), id);
const lines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent));
const width = (page, s) => page.eval((d, x) => document.querySelector(`${d} ${x}`).offsetWidth, D, s);

uiTest('#2730 the ASM editor: no hint nor status line, its states at the toolbar\'s right, Encoding:, the Machine panel on the left, its problems in the console; Portuguese', E, async (page) => {
  await page.setViewport(1600, 800);   // (the toolbar on one line)
  await makeProject(env, { name: 'AsmChrome', files: { 'src/ctl.asm.json': chart() } });
  await page.openProject('AsmChrome');
  await page.eval(() => window.SilinxApp.openFile('src/ctl.asm.json'));
  await page.waitFor((d) => document.querySelector(`${d} .asm-info`)?.textContent, [D], { what: 'the editor' });
  const look = await page.eval((d) => {
    const el = document.querySelector(d), tb = el.querySelector('.asm-toolbar'), info = tb.querySelector('.asm-info');
    const shown = (c) => c.getClientRects().length > 0 && getComputedStyle(c).position !== 'absolute';
    return {
      gone: ['.asm-hint', '.asm-status', '.asm-problems', '.asm-prob', 'details'].filter((s) => el.querySelector(s)),
      info: info.textContent,
      after: [...tb.children].filter((c) => shown(c) && c.getBoundingClientRect().left > info.getBoundingClientRect().left).map((c) => c.className),
      encoding: [...el.querySelector('.asm-encoding').children].map((c) => c.textContent.slice(0, 9)),
      left: [el.querySelector('.asm-body').firstElementChild.className, el.querySelector('.asm-left .asm-cap').textContent, !!el.querySelector('.asm-left .asm-field')],
      right: [...el.querySelectorAll('.asm-side .asm-cap')].map((c) => c.textContent),
      zoom: el.querySelector('.asm-toolbar .asm-zoom')?.textContent,
    };
  }, D);
  assert.deepEqual(look, { gone: [], info: '4 states', after: [], encoding: ['Encoding:', 'BinaryGra'], left: ['asm-left', 'Machine', true], right: ['Properties'], zoom: look.zoom });
  assert.match(look.zoom, /^\d+%$/);
  // a narrower window: the toolbar wrapped, its states at the right end still
  await page.setViewport(1100, 800);
  assert.ok(await page.eval((d) => { const tb = document.querySelector(`${d} .asm-toolbar`), r = tb.querySelector('.asm-info').getBoundingClientRect();
    return tb.getBoundingClientRect().right - parseFloat(getComputedStyle(tb).paddingRight) - r.right < 8; }, D), 'at the right end');
  await page.setViewport(1600, 800);
  // its problems in the console's tabs, not in its lines (until Validate)
  await page.waitFor(() => document.querySelectorAll('#console-warnings .diag').length, [], { what: 'the warnings' });
  assert.deepEqual(await tab(page, 'console-errors'), [`ERROR:ASM - "src/ctl.asm.json": ${ERR}`]);
  assert.deepEqual(await tab(page, 'console-warnings'), [`WARNING:ASM - "src/ctl.asm.json": ${WARN}`]);
  assert.deepEqual((await lines(page)).filter((t) => /LOST/.test(t)), []);
  // Validate: its lines in the Console, under Design
  await page.click(`${D} .asm-btn`, { text: 'Validate' });
  const said = (await lines(page)).filter((t) => t.trim()).slice(-4);
  assert.deepEqual(said, ['Started : "Validate" of ctl.asm.json.', `ERROR: ${ERR}`, `WARNING: ${WARN}`, 'Process "Validate" failed']);
  assert.equal(await page.eval(() => [...document.querySelectorAll('#console-log .ln')].find((l) => /^Started : "Validate"/.test(l.textContent.trim())).dataset.src), 'check');
  // a click on a line, and on a row of the Warnings tab: LOST selected
  const selected = () => page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .asm-node.sel')].map((g) => g.dataset.node));
  await page.click('#console-log .ln.mc-link', { text: `WARNING: ${WARN}` });
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .asm-node.sel'), [], { what: 'the box selected' });
  assert.deepEqual(await selected(), ['sx']);
  await page.eval(() => { const ed = window.Silinx.active.asmEditor; ed.setModel(ed.getModel()); });   // (nothing selected)
  assert.deepEqual(await selected(), []);
  await page.eval(async () => (await import('/js/console.js')).showConsolePage('warnings'));
  await page.click('#console-warnings .diag');
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .asm-node.sel'), [], { what: 'the box selected again' });
  assert.deepEqual(await selected(), ['sx']);
  // fixed: its problems gone from the tabs; closed: none left
  await page.eval(() => window.Silinx.active.asmEditor.deleteSelection());
  await page.waitFor(() => !document.querySelectorAll('#console-errors .diag').length && !document.querySelectorAll('#console-warnings .diag').length, [], { what: 'no problems' });
  assert.equal(await page.eval((d) => document.querySelector(`${d} .asm-info`).textContent, D), '3 states');
  await page.eval(() => window.Silinx.active.asmEditor.undo());
  await page.waitFor(() => document.querySelectorAll('#console-warnings .diag').length === 1, [], { what: 'LOST back' });
  await page.eval(() => window.SilinxApp.closeDoc(window.SilinxApp.findDoc('asm:src/ctl.asm.json'), { force: true }));
  await page.waitFor(() => !document.querySelectorAll('#console-warnings .diag').length, [], { what: 'closed: no problems' });

  // the Machine panel folded to a strip on the left, kept when the chart opens again; a click on the strip expands it
  await page.eval(() => window.SilinxApp.openFile('src/ctl.asm.json'));
  await page.waitFor((d) => document.querySelector(`${d} .asm-left`)?.offsetWidth, [D], { what: 'the editor again' });
  assert.equal(await width(page, '.asm-left'), 250);
  await page.click(`${D} .asm-left .asm-fold`);
  assert.deepEqual([await width(page, '.asm-left'), await width(page, '.asm-side')], [24, 250]);
  assert.equal(await page.eval((d) => document.querySelector(`${d} .asm-left .asm-fold`).title, D), 'Expand the Machine panel');
  await page.eval(() => window.SilinxApp.closeDoc(window.SilinxApp.findDoc('asm:src/ctl.asm.json'), { force: true }));
  await page.eval(() => window.SilinxApp.openFile('src/ctl.asm.json'));
  await page.waitFor((d) => document.querySelector(`${d} .asm-left`)?.offsetWidth === 24, [D], { what: 'remembered' });
  await page.click(`${D} .asm-left`);
  assert.equal(await width(page, '.asm-left'), 250);

  // a narrow window: the Machine panel hidden, ☰ Machine shows it over the canvas on its left, and hides it
  await page.setViewport(900, 700);
  await page.eval(async () => (await import('/js/narrow.js')).setDrawer(false, { remember: false }));
  const toggles = () => page.eval((d) => [...document.querySelectorAll(`${d} .asm-toolbar .asm-btn`)].filter((b) => b.getClientRects().length && /☰/.test(b.textContent)).map((b) => b.textContent), D);
  assert.deepEqual(await toggles(), ['☰ Machine', '☰ Properties']);
  assert.equal(await page.eval((d) => document.querySelector(`${d} .asm-left`).getClientRects().length, D), 0);
  await page.click(`${D} .asm-toolbar .asm-btn`, { text: '☰ Machine' });
  assert.deepEqual(await page.eval((d) => { const s = document.querySelector(`${d} .asm-left`); return [getComputedStyle(s).position, s.getBoundingClientRect().left === s.parentElement.getBoundingClientRect().left]; }, D), ['absolute', true]);
  await page.click(`${D} .asm-toolbar .asm-btn`, { text: '☰ Machine' });
  assert.equal(await page.eval((d) => document.querySelector(`${d} .asm-left`).getClientRects().length, D), 0);
  await page.setViewport(1600, 800);

  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((d) => document.querySelector(`${d} .asm-info`).textContent === '4 estados', [D], { what: 'Portuguese' });
  assert.deepEqual(await page.eval((d) => [document.querySelector(`${d} .asm-tb-label`).textContent, document.querySelector(`${d} .asm-left .asm-cap`).textContent.trim(),
    document.querySelector(`${d} .asm-left .asm-fold`).title], D), ['Codificação:', 'Máquina', 'Recolher o painel da máquina']);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });
