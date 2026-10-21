// UI: the Language Templates' Device Primitives (#792) — the HDL editor's Templates ▾ and its context menu offer the
// primitives of the project's family (a Basys2's Spartan-3E, a Nexys3's Spartan-6), a template inserted at the cursor
// with its count on the device and its instance's name selected; in Portuguese too.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const BAR = '.doc:not([hidden]) .editor-bar .btn';
// the Templates ▾ menu's Device Primitives submenu: its items (opened by hovering it)
async function primMenu(page, label = 'Device Primitives', button = 'Templates ▾') {
  await page.click(BAR, { text: button });
  await page.waitForSelector('body > .menu-popup');
  const items = await page.eval(() => [...document.querySelectorAll('body > .menu-popup > .mi')].map((r) => r.querySelector('.lbl').textContent));
  const idx = items.indexOf(label);
  assert.ok(idx >= 0, items.join(', '));
  await page.hover(await page.point('body > .menu-popup > .mi', { index: idx }));
  await page.waitForSelector('.menu-popup.sub .mi');
  return page.eval(() => [...document.querySelectorAll('.menu-popup.sub .mi')].map((r) => r.querySelector('.lbl').textContent));
}
const selected = (page) => page.eval(() => window.Silinx.active.editor.getSelection());

uiTest('Language Templates ▸ Device Primitives: the project\'s family\'s, inserted with the device\'s count, its name selected; the context menu; Portuguese', E, async (page) => {
  const vhd = 'library ieee;\nuse ieee.std_logic_1164.all;\nlibrary UNISIM;\nuse UNISIM.VCOMPONENTS.ALL;\n\nentity top is\n  port (clk : in std_logic);\nend top;\n\narchitecture a of top is\nbegin\n\nend a;\n';
  await makeProject(env, { name: 'TplS3e', board: 'basys2', device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, files: { 'src/top.vhd': vhd, 'src/m.v': 'module m (input clk);\n\nendmodule\n' } });
  await page.openProject('TplS3e');
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitFor(() => window.Silinx.active?.editor);
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.focus(); ed.setCursor({ line: 11, ch: 0 }); });
  assert.deepEqual(await primMenu(page), ['RAMB16_S9', 'RAMB16_S9_S9', 'MULT18X18SIO', 'DCM_SP', 'BUFG', 'BUFGMUX', 'IBUFG']);
  await page.click('.menu-popup.sub .mi', { text: 'DCM_SP' });
  await page.waitFor(() => /u_dcm_sp : DCM_SP/.test(window.Silinx.active.editor.getValue()), [], { what: 'the DCM_SP template' });
  const text = await page.eval(() => window.Silinx.active.editor.getValue());
  assert.match(text, /\n-- DCM_SP: Digital clock manager: [^\n]*\n-- DCMs: 4 on this device \(XC3S250E\)\n/);
  assert.match(text, /\n {4}CLKFX_MULTIPLY {8}=> 4, -- 2 … 32\n/);
  assert.equal(await selected(page), 'u_dcm_sp', 'the instance\'s name selected');
  // the editor's context menu: Device Primitives next to the Language Templates
  await page.closeMenus();
  await page.rightClick('.doc:not([hidden]) .cm-content');
  await page.waitForSelector('body > .menu-popup');
  const ctx = await page.eval(() => [...document.querySelectorAll('body > .menu-popup > .mi')].map((r) => r.querySelector('.lbl').textContent));
  assert.equal(ctx[ctx.indexOf('Language Templates') + 1], 'Device Primitives', ctx.join(', '));
  await page.closeMenus();

  // a Verilog module: the Verilog template
  await page.eval(() => window.SilinxApp.openFile('src/m.v'));
  await page.waitFor(() => window.Silinx.active?.path === 'src/m.v' && window.Silinx.active.editor);
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.focus(); ed.setCursor({ line: 1, ch: 0 }); });
  await primMenu(page);
  await page.click('.menu-popup.sub .mi', { text: 'BUFG' });
  await page.waitFor(() => /BUFG u_bufg \(\n {2}\.I\(i\), \/\/ The clock to distribute\n {2}\.O\(o\) {2}\/\/ The clock on the global network\n\);/.test(window.Silinx.active.editor.getValue()), [], { what: 'the BUFG template' });
  assert.match(await page.eval(() => window.Silinx.active.editor.getValue()), /\/\/ Global clock buffers: 24 on this device \(XC3S250E\)/);

  // ---- Portuguese: the menu's label
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    assert.deepEqual(await primMenu(page, 'Primitivas do Dispositivo', 'Modelos ▾'), ['RAMB16_S9', 'RAMB16_S9_S9', 'MULT18X18SIO', 'DCM_SP', 'BUFG', 'BUFGMUX', 'IBUFG']);
    await page.closeMenus();
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }

  // ---- a Nexys3 (Spartan-6) project: its primitives
  await makeProject(env, { name: 'TplS6', board: 'nexys3', files: { 'src/top.vhd': vhd } });
  await page.openProject('TplS6');
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitFor(() => window.Silinx.active?.editor);
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.focus(); ed.setCursor({ line: 11, ch: 0 }); });
  assert.deepEqual(await primMenu(page), ['RAMB8BWER', 'RAMB16BWER', 'DSP48A1', 'PLL_BASE', 'DCM_SP', 'BUFG', 'BUFIO2']);
  await page.click('.menu-popup.sub .mi', { text: 'PLL_BASE' });
  await page.waitFor(() => /u_pll_base : PLL_BASE/.test(window.Silinx.active.editor.getValue()), [], { what: 'the PLL_BASE template' });
  assert.match(await page.eval(() => window.Silinx.active.editor.getValue()), /-- PLLs: 2 on this device \(XC6SLX16\)/);
});
