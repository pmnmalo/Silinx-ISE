// UI (#3798): the Try it panel of the state diagram (FSM), the ASM chart and the Petri net editors green, as the
// schematic's Try it (its strip's green, its badge's bold green title), in both interfaces and in the dark theme; the
// FSM's Tables and the Petri net's Analysis, the same panel, not green. No message in the console.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newFsm } from '../../core/fsm.js';
import { newModel } from '../../core/asm.js';
import { newPetri } from '../../core/petri.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const DOC = '.doc:not([hidden])';
const EDITORS = [
  { kind: 'fsm', file: 'src/m.fsm.json', model: newFsm('m'), panel: '.fsm-panel', api: 'fsmEditor', other: 'tables' },
  { kind: 'asm', file: 'src/c.asm.json', model: newModel('c'), panel: '.asm-simpanel' },
  { kind: 'petri', file: 'src/n.pn.json', model: newPetri('n'), panel: '.pn-panel', api: 'petriEditor', other: 'analysis' },
];
/** The panel's title bar's background and its title's colour and weight. */
const look = (page, p) => page.eval((doc, sel) => {
  const panel = document.querySelector(`${doc} ${sel}`), bar = getComputedStyle(panel.querySelector('.asm-codebar')), t = getComputedStyle(panel.querySelector('.asm-code-title'));
  return { bg: `${bar.backgroundImage} ${bar.backgroundColor}`, color: t.color, bold: Number(t.fontWeight) >= 600, dot: getComputedStyle(panel.querySelector('.asm-code-title'), '::before').content !== 'none' };
}, DOC, p);
const messages = (page) => page.eval(() => ['#console-errors', '#console-warnings'].map((s) => [...document.querySelectorAll(`${s} .diag`)].map((r) => r.textContent)));

uiTest('#3798 the Try it panel of the FSM, ASM and Petri net editors green, as the schematic\'s; Tables and Analysis not', E, async (page) => {
  await page.setViewport(1600, 900);
  await makeProject(env, { name: 'TryGreen', top: '', files: Object.fromEntries(EDITORS.map((e) => [e.file, JSON.stringify(e.model, null, 2)])) });
  await page.openProject('TryGreen');
  const before0 = await messages(page);
  for (const ed of EDITORS) {
    await page.eval((f) => window.SilinxApp.openFile(f), ed.file);
    await page.waitFor((doc) => document.querySelector(`${doc} .asm-toolbar`), [DOC], { what: `the ${ed.kind} editor` });
    await page.click(`${DOC} .asm-toolbar .asm-btn`, { text: 'Try it' });
    await page.waitFor((doc, p) => !document.querySelector(`${doc} ${p}`).hidden, [DOC, ed.panel], { what: `the ${ed.kind} Try it` });
    let l = await look(page, ed.panel);
    assert.deepEqual(l, { bg: 'linear-gradient(rgb(242, 251, 242), rgb(220, 239, 220)) rgba(0, 0, 0, 0)', color: 'rgb(27, 94, 27)', bold: true, dot: true }, ed.kind);
    // dark: the schematic's dark green
    await page.eval(() => { document.documentElement.dataset.theme = 'dark'; });
    l = await look(page, ed.panel);
    assert.ok(/rgba\(76, 192, 107, 0\.12\)/.test(l.bg) && l.color === 'rgb(76, 192, 107)', `${ed.kind} dark: ${JSON.stringify(l)}`);
    await page.eval(() => { document.documentElement.dataset.theme = 'light'; });
    // the same panel showing the Tables (FSM) or the Analysis (Petri net): not green
    if (ed.other) {
      await page.eval((api, w) => window.Silinx.active[api].showPanel(w), ed.api, ed.other);
      l = await look(page, ed.panel);
      assert.ok(!/gradient/.test(l.bg) && l.color !== 'rgb(27, 94, 27)' && !l.dot, `${ed.kind} ${ed.other}: ${JSON.stringify(l)}`);
      await page.eval((api) => window.Silinx.active[api].showPanel('sim'), ed.api);
      assert.equal((await look(page, ed.panel)).color, 'rgb(27, 94, 27)', `${ed.kind} Try it again`);
    }
  }
  assert.deepEqual(await messages(page), before0);
});
