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
    assert.equal(await page.eval(() => (window.Silinx.active.tab.title || window.Silinx.active.tab.querySelector('[title]')?.title).split('\n')[0]), f, `${f}: the path in the tab's tip (its first line; how to move the tab under it, #2887)`);
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

// (#2763) a text editor's status line, its last line: the cursor's line and column and the language; Portuguese; none
// of it in the application's status bar
uiTest('#2763 the text editors\' status line: Ln, Col and the language; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'StatText', top: 'top', files: { 'src/top.vhd': VHD, 'src/add.cpp': 'int add(int a, int b) { return a + b; }\n', 'src/rom.mem': '00\n01\n', 'src/inv.v': 'module inv(input a, output y);\n  assign y = ~a;\nendmodule\n' } });
  await page.openProject('StatText');
  const status = () => page.eval(() => { const d = document.querySelector('.doc:not([hidden])'), st = d.querySelectorAll('.doc-status');
    return { n: st.length, last: d.lastElementChild === st[0], fields: [...st[0].querySelectorAll('.ds-f')].map((f) => f.textContent) }; });
  for (const [f, lang] of [['src/top.vhd', 'VHDL'], ['src/inv.v', 'Verilog'], ['src/add.cpp', 'C++'], ['src/rom.mem', 'Text']]) {
    await page.eval((p) => window.SilinxApp.openFile(p), f);
    await page.waitFor((p) => window.Silinx.active?.id === `file:${p}` && document.querySelector('.doc:not([hidden]) .doc-status .ds-f'), [f], { what: f });
    assert.deepEqual(await status(page), { n: 1, last: true, fields: ['Ln 1, Col 1', lang] }, f);
  }
  await page.eval((p) => window.SilinxApp.openFile(p), 'src/top.vhd');
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd');
  await page.eval(() => window.Silinx.active.editor.setCursor({ line: 4, ch: 2 }));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .doc-status .pos').textContent === 'Ln 5, Col 3', [], { what: 'the cursor moved' });
  assert.equal(await page.eval(() => /Ln \d/.test(document.getElementById('statusbar').textContent)), false, 'not in the application\'s status bar');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.waitFor(() => document.querySelector('.doc:not([hidden]) .doc-status .pos').textContent === 'Lin 5, Col 3', [], { what: 'Portuguese' });
    assert.deepEqual((await status(page)).fields, ['Lin 5, Col 3', 'VHDL']);
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});
