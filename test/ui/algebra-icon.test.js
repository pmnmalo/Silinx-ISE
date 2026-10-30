// UI: the Boolean Algebra source's icon (#2105): an expression with a bar (Ā·B), not the old truth table's grid,
// in the Tools menu, the New Source list, the Design pane's row and the document's tab; the old id 'truthtable'
// still draws it.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

uiTest('Boolean Algebra: its own icon in the Tools menu, New Source, the Design pane and the tab (#2105)', E, async (page) => {
  await makeProject(env, { name: 'AlgIco', files: {} });
  await page.openProject('AlgIco');
  const svg = await page.eval(async () => {
    const { icons } = await import('/js/icons.js');
    const norm = (x) => { const e = document.createElement('span'); e.innerHTML = x; return e.innerHTML; };   // as the DOM writes it
    return { algebra: norm(icons.algebra), old: norm(icons.truthtable) };
  });
  assert.ok(svg.algebra.includes('#d62728') && !svg.algebra.includes('<text'), 'Ā·B drawn (its letters no text of the rows)');
  assert.equal(svg.old, svg.algebra, 'the old id draws the new icon');
  const ico = (sel) => page.eval((s) => { const i = document.querySelector(s); return i ? [i.dataset.ico, i.innerHTML] : null; }, sel);
  const ALG = ['algebra', svg.algebra];

  await page.menu('Tools', 'Boolean Algebra / Karnaugh Map…');
  await page.waitDialog('New Source');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .src-types .st')].filter((r) => /^\s*Boolean Algebra\s*$/.test(r.textContent)).map((r) => r.querySelector('.ico')?.dataset.ico)), ['algebra']);
  assert.deepEqual(await ico('.dlg-overlay .src-types .st.sel .ico'), ALG);
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'maj3');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/maj3.bool.json', [], { what: 'the algebra editor' });

  // the tab
  assert.deepEqual(await page.eval(() => { const t = window.Silinx.active.tab.querySelector('.ico'); return [t.dataset.ico, t.innerHTML]; }), ALG);
  // the Design pane's row
  await page.waitFor(() => [...document.querySelectorAll('#hier .row')].some((r) => r.querySelector('.lbl')?.textContent === 'maj3'), [], { what: 'the row of maj3' });
  assert.deepEqual(await page.eval(() => { const r = [...document.querySelectorAll('#hier .row')].find((x) => x.querySelector('.lbl')?.textContent === 'maj3'); const i = r.querySelector('.ico'); return [i.dataset.ico, i.innerHTML]; }), ALG);
  // no table icon left anywhere
  assert.equal(await page.eval(() => document.querySelectorAll('.ico[data-ico=truthtable]').length), 0);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});
