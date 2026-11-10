// UI: a schematic has no Export as ISE Schematic (.sch)… any more (#3313), neither among the drawing commands of its
// module's menu (on its row and on its badges) nor in the menu of a schematic without its HDL file (a [No HDL] row, the
// schematic's own menu); in English and in Portuguese, with no warnings. A project goes to ISE whole (File ▸ Export as a
// Xilinx ISE project, its schematics as ISE schematics: test/xise*.test.js).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const menuLabels = (page) => page.waitFor(() => { const m = [...document.querySelectorAll('body > .menu-popup .mi')].map((i) => i.textContent.trim()); return m.length ? m : null; }, [], { what: 'the context menu' });
const rowMenu = async (page, label) => { await page.treeRow('#hier', label, { right: true, exact: true }); const m = await menuLabels(page); await page.closeMenus(); return m; };
const badgeMenu = async (page, label, text) => {
  const at = await page.waitFor((l, t) => {
    const r = [...document.querySelectorAll('#hier .row')].find((x) => x.querySelector('.lbl').textContent === l && x.getClientRects().length);
    const b = r && [...r.querySelectorAll('.badge')].find((x) => x.textContent === t);
    if (!b) return null;
    b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const k = b.getBoundingClientRect();
    return { x: k.left + k.width / 2, y: k.top + k.height / 2 };
  }, [label, text], { what: `badge ${text} of ${label}` });
  await page.click(at, { button: 'right' });
  const m = await menuLabels(page); await page.closeMenus(); return m;
};
const warnings = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR)\b/.test(l));
const language = (page, l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
const NO_EXPORT = (m) => !m.some((x) => /ISE Schematic|Esquemático ISE/.test(x));

// a file named as the schematic's HDL, holding another module: the schematic has no HDL file ([No HDL])
const OTHER = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity parity is\n  port (a, b : in std_logic; p : out std_logic);\nend parity;\n\narchitecture rtl of parity is\nbegin\n  p <= a xor b;\nend rtl;\n';
const W_GATE = 'WARNING: src/gate.sch.json has no HDL file: src/gate.vhd exists already and holds something else. Generate HDL File… (its right-click menu in the Design pane) writes its HDL to src/gate_sch.vhd.';

uiTest('#3313 the gates example\'s schematic: no Export as ISE Schematic (.sch)… in its module\'s menu (row, [Schematic], [VHDL]), in English and in Portuguese; no warnings', E, async (page) => {
  await makeProject(env, { name: 'X_gates', template: 'gates' });
  await page.openProject('X_gates');
  for (const lang of ['en', 'pt']) {
    await language(page, lang);
    try {
      for (const m of [await rowMenu(page, 'gates'), await badgeMenu(page, 'gates', lang === 'pt' ? 'Esquemático' : 'Schematic'), await badgeMenu(page, 'gates', 'VHDL')]) {
        assert.ok(NO_EXPORT(m), m.join(' | '));
        assert.ok(m.includes(lang === 'pt' ? 'Remover do Projeto' : 'Remove from Project'), m.join(' | '));
      }
    } finally { await language(page, 'en'); }
  }
  assert.deepEqual(await warnings(page), []);
});

uiTest('#3313 a schematic without its HDL file ([No HDL]): its own menu has no Export as ISE Schematic (.sch)…, in English and in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'X_nohdl', top: 'parity', files: { 'src/gate.sch.json': JSON.stringify(newDoc('gate', 'vhdl'), null, 1), 'src/gate.vhd': OTHER } });
  await page.openProject('X_nohdl');
  await page.waitFor(() => !!document.querySelector('#hier .badge.warn'), [], { what: 'the [No HDL] badge' });
  assert.deepEqual(await warnings(page), [W_GATE]);
  assert.deepEqual(await rowMenu(page, 'gate'), ['Open', 'Set as Top Module', 'Rename…', 'Generate HDL File…', 'Remove from Project']);
  await language(page, 'pt');
  try {
    const m = await rowMenu(page, 'gate');
    assert.equal(m.length, 5, m.join(' | '));
    assert.ok(NO_EXPORT(m), m.join(' | '));
  } finally { await language(page, 'en'); }
  assert.deepEqual(await warnings(page), [W_GATE]);
});
