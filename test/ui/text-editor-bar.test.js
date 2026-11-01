// UI (#2514): the text editors' bar (HDL, C/C++, memory initialization file) has no Undo / Redo of its own, the main
// toolbar's, nor the file's path, the tab's tip; the main toolbar's Undo undoes what was typed. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const B = '.doc:not([hidden]) .editor-bar';
const VHD = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity top is\n  port (a : in std_logic; y : out std_logic);\nend top;\n\narchitecture rtl of top is\nbegin\n  y <= a;\nend rtl;\n';

uiTest('#2514 the text editors\' bar: no Undo / Redo, no path; the main toolbar\'s Undo undoes', E, async (page) => {
  await makeProject(env, { name: 'BarText', top: 'top', files: { 'src/top.vhd': VHD, 'src/add.cpp': 'int add(int a, int b) { return a + b; }\n', 'src/rom.mem': '00\n01\n' } });
  await page.openProject('BarText');
  for (const f of ['src/top.vhd', 'src/add.cpp', 'src/rom.mem']) {
    await page.eval((p) => window.SilinxApp.openFile(p), f);
    await page.waitFor((p) => window.Silinx.active?.id === `file:${p}` && document.querySelector('.doc:not([hidden]) .editor-bar'), [f], { what: f });
    assert.deepEqual(await page.eval((b) => {
      const bar = document.querySelector(b);
      return { history: [...bar.querySelectorAll('button')].filter((x) => /^(Undo|Redo)$/.test(x.title)).length, path: !!bar.querySelector('.path'), text: bar.textContent.includes('src/') };
    }, B), { history: 0, path: false, text: false }, f);
    assert.equal(await page.eval(() => window.Silinx.active.tab.title || window.Silinx.active.tab.querySelector('[title]')?.title), f, `${f}: the path in the tab's tip`);
  }
  // typed in the memory file, undone by the main toolbar's Undo
  await page.eval(() => window.Silinx.active.editor.view.focus());
  await page.type('ff\n');
  await page.waitFor(() => window.Silinx.active.editor.getValue() !== '00\n01\n', [], { what: 'typed' });
  await page.waitFor(() => !document.querySelector('#toolbar [data-cmd=undo]').disabled, [], { what: 'Undo enabled' });
  await page.click('#toolbar [data-cmd=undo]');
  await page.waitFor(() => window.Silinx.active.editor.getValue() === '00\n01\n', [], { what: 'undone by the main toolbar' });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});
