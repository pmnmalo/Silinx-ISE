// UI: read-only documents. The HDL generated from a drawing (#1176) has Undo and Redo greyed out, in the toolbar and
// the Edit menu, while Find and Check Syntax stay (#1192). A truth table's schematic, a read-only view, says where it
// comes from at the end of its toolbar, as the generated HDL does, and has Curved wires (#1193).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newTable, generateTableHdl } from '../../core/logic.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

function ttFiles() {
  const t = { ...newTable('maj', ['a', 'b', 'c'], ['f']), lang: 'vhdl', generatedFile: 'src/maj.vhd' };
  t.table = { ...(t.table || {}), f: '00010111' };
  return { 'src/maj.tt.json': JSON.stringify(t, null, 2), 'src/maj.vhd': generateTableHdl(t, 'vhdl').code };
}
const menuItem = async (page, menu, label) => {
  const items = await page.openMenu(menu);
  await page.closeMenus();
  return items.find((i) => i.label === label);
};
const tbDisabled = (page, cmd) => page.eval((c) => document.querySelector(`#toolbar .tb-btn[data-cmd=${c}]`).disabled, cmd);

uiTest('#1192 a read-only document (the HDL generated from a drawing): Undo and Redo greyed out; Find and Check Syntax enabled', E, async (page) => {
  await makeProject(env, { name: 'RoHdl', template: 'gates' });
  await page.openProject('RoHdl');
  // an HDL file of its own: Undo and Redo as before
  await page.eval(() => window.SilinxApp.openFile('src/gates.sch.json'));
  await page.eval(() => window.SilinxApp.openFile('src/gates.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/gates.vhd' && window.Silinx.active.editor, [], { what: 'the generated HDL' });
  assert.equal(await page.eval(() => window.Silinx.active.editor.readOnly()), true, '(generated from the schematic: read-only)');
  await page.waitFor(() => document.querySelector('#toolbar .tb-btn[data-cmd=undo]').disabled, [], { what: 'Undo greyed out' });
  assert.deepEqual([await tbDisabled(page, 'undo'), await tbDisabled(page, 'redo')], [true, true]);
  for (const [label, disabled] of [['Undo', true], ['Redo', true], ['Find…', false]]) assert.equal(!!(await menuItem(page, 'Edit', label))?.disabled, disabled, label);
  assert.equal(!!(await menuItem(page, 'Process', 'Check Syntax'))?.disabled, false, 'Check Syntax');
  // an editable document in front again (the schematic): Undo and Redo as its own
  await page.eval(() => window.SilinxApp.openFile('src/gates.sch.json'));
  await page.waitFor(() => window.Silinx.active?.schEditor && !document.querySelector('#toolbar .tb-btn[data-cmd=undo]').disabled, [], { what: 'Undo enabled' });
});

uiTest('#1193 a truth table\'s schematic: "Read-only, generated from …" at the end of its toolbar; Curved wires, the view only', E, async (page) => {
  await makeProject(env, { name: 'RoTt', files: ttFiles() });
  await page.openProject('RoTt');
  await page.eval(() => window.SilinxApp.openTtSchematic('src/maj.tt.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'ttsch:src/maj.tt.json' && window.Silinx.active.viewer && document.querySelector('.doc:not([hidden]) .se-banner'), [], { what: 'the schematic' });
  const bar = await page.eval(() => {
    const tb = document.querySelector('.doc:not([hidden]) .se-toolbar'), b = tb.querySelector('.se-banner');
    return { text: b.textContent, last: [...tb.children].filter((e) => e.getClientRects().length).at(-1) === b, above: !!document.querySelector('.doc:not([hidden]) .tt-sch-bar'),
      curved: !!tb.querySelector('.se-curved') };
  });
  assert.deepEqual(bar, { text: 'Read-only, generated from maj.tt.json', last: true, above: false, curved: true });
  // the editing tools hidden (Undo / Redo among them, after Add I/O Marker since #1696): no separator first, doubled or last
  const shown = await page.eval(() => [...document.querySelector('.doc:not([hidden]) .se-toolbar').children].filter((e) => e.getClientRects().length)
    .map((e) => (e.classList.contains('se-sep') ? '|' : e.dataset.act || e.className.split(' ')[0])));
  assert.ok(!['undo', 'redo', 'rotate'].some((a) => shown.includes(a)), shown.join(' '));
  assert.ok(shown[0] !== '|' && !shown.some((e, i) => e === '|' && shown[i + 1] === '|'), shown.join(' '));
  // Curved wires: the wires drawn as curves, the schematic (generated) not changed
  // (the curves: paths with Bézier segments; the hop-overs' paths are arcs)
  const curves = () => page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) svg .wire .wline')].filter((l) => /[CQ]/.test(l.getAttribute('d') || '')).length);
  assert.equal(await curves(page), 0);
  await page.click('.doc:not([hidden]) .se-btn[data-act=more]');
  await page.click('.doc:not([hidden]) .se-curved input');
  await page.waitFor(() => [...document.querySelectorAll('.doc:not([hidden]) svg .wire .wline')].some((l) => /[CQ]/.test(l.getAttribute('d') || '')), [], { what: 'curves' });
  assert.equal(await page.eval(() => window.Silinx.active.viewer.getDoc().wireStyle), undefined);
  // the link opens the table; in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .se-banner').textContent), 'Só de leitura, gerado a partir de maj.tt.json');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await page.click('.doc:not([hidden]) .se-banner a');
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/maj.tt.json' || /maj\.tt\.json/.test(window.Silinx.active?.id || ''), [], { what: 'the table' });
});
