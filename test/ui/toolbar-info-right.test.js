// UI: a toolbar's informational text (what it says, not what it does) at its right end, as the read-only notice (#2725,
// docs/UI-GUIDELINES.md "The toolbar's layout"): the truth table's "Not in sync with …", every control on its left; the
// rest in the document's status line (#2763): I/O Pin Planning's assigned I/Os, top, device and board, the FPGA view's
// info on the site selected and the slices used, none of it in their toolbars; in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupUi, uiTest, makeProject, ROOT } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = `library ieee; use ieee.std_logic_1164.all;
entity top is port (clk : in std_logic; sw : in std_logic_vector(1 downto 0); led : out std_logic_vector(1 downto 0)); end top;
architecture rtl of top is begin led <= sw; end rtl;
`;

// where the text of `sel` ends from the toolbar's right edge (inside its padding, the ⋮ menu's room, and its own margin), and the toolbar's
// shown children that start at or after the text's start (other than it and the absolutely placed ⋮)
const place = (page, bar, sel) => page.eval((b, s) => {
  const tb = document.querySelector(b), el = tb.querySelector(s), cs = getComputedStyle(tb), r = document.createRange();
  r.selectNodeContents(el);
  const t = r.getBoundingClientRect(), right = tb.getBoundingClientRect().right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
  const shown = (c) => c.getClientRects().length > 0 && c.getBoundingClientRect().width > 0 && getComputedStyle(c).position !== 'absolute';
  return { text: el.textContent, gap: Math.round(right - parseFloat(getComputedStyle(el).marginRight) - t.right),
    after: [...tb.children].filter((c) => c !== el && shown(c) && c.getBoundingClientRect().left >= t.left - 1).map((c) => c.className) };
}, bar, sel);
// the right edge of the toolbar's last shown control (button, select, input) on the left of `sel`'s text
const controlsEnd = (page, bar, sel) => page.eval((b, s) => {
  const tb = document.querySelector(b), r = document.createRange();
  r.selectNodeContents(tb.querySelector(s));
  const ctl = [...tb.querySelectorAll('button, select, input')].filter((c) => c.getClientRects().length && getComputedStyle(c.closest('.tb-more') || c).position !== 'absolute');
  return { controls: Math.round(Math.max(...ctl.map((c) => c.getBoundingClientRect().right))), text: Math.round(r.getBoundingClientRect().left) };
}, bar, sel);

// the fields of the status line of the document in front, and whether its toolbar has none of `sels`
const line = (page, root, sels) => page.eval((r, s) => {
  const el = document.querySelector(r), st = el.querySelector(':scope > .doc-status');
  return { last: el.lastElementChild === st, fields: [...st.querySelectorAll('.ds-f')].map((f) => f.textContent), toolbar: el.querySelector(':scope > [class*=bar]').querySelectorAll(s).length };
}, root, sels);

uiTest('#2725 a toolbar\'s informational text at its right end, the truth table\'s "Not in sync"; I/O Pin Planning\'s and the FPGA view\'s in their status line (#2763)', E, async (page) => {
  await page.setViewport(1366, 768);
  // I/O Pin Planning: the status, then the top, device and board, at the right end; the tools on their left
  await makeProject(env, { name: 'InfoRight', board: 'basys2', files: { 'src/top.vhd': TOP }, top: 'top' });
  await page.openProject('InfoRight');
  await page.menu('Tools', 'I/O Pin Planning');
  await page.waitFor(() => window.Silinx.active?.id === 'pins' && document.querySelector('.doc:not([hidden]) .pin-planner .doc-status .pp-status')?.textContent, [], { what: 'the planner' });
  const PP = '.doc:not([hidden]) .pin-planner';
  assert.deepEqual(await line(page, PP, '.pp-info, .pp-status'), { last: true, fields: ['0/5 I/Os assigned', 'Top: top', 'Device xc3s250e-cp132', 'Board: Digilent Basys2'], toolbar: 0 });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.waitFor((r) => document.querySelector(`${r} .doc-status .pp-status`).textContent === '0/5 E/S atribuídas', [PP], { what: 'Portuguese' });
    assert.deepEqual((await line(page, PP, '.pp-info')).fields, ['0/5 E/S atribuídas', 'Topo: top', 'Dispositivo xc3s250e-cp132', 'Placa: Digilent Basys2']);
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }

  // the FPGA view: its info on the site selected, right-justified, after its ☰ Properties (shown on a narrow window)
  const build = path.join(env.server.workspace, 'InfoRight', 'build');
  await fs.mkdir(build, { recursive: true });
  await fs.writeFile(path.join(build, 'top.ncd'), 'NCD');
  const old = new Date(Date.now() - 60000);
  await fs.utimes(path.join(build, 'top.ncd'), old, old);
  for (const f of ['top.xdl', 'device.xdlrc']) await fs.copyFile(path.join(ROOT, 'packages', 'silinx-fpga', 'test', 'fixtures', 'fpga', f), path.join(build, f));
  await page.menu('Tools', 'Implemented Design (FPGA View)');
  await page.waitFor(() => window.Silinx.active?.id === 'fpgaview' && document.querySelector('.doc:not([hidden]) .fv-site'), [], { what: 'FPGA view open' });
  await page.click('.doc:not([hidden]) .fv .fv-site');
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .fv > .doc-status .fv-info')?.textContent, [], { what: 'the info on the site' });
  const FV = '.doc:not([hidden]) .fv', fv = await line(page, FV, '.fv-info');
  assert.deepEqual({ ...fv, fields: undefined }, { last: true, fields: undefined, toolbar: 0 });
  assert.match(fv.fields.join(' | '), /^\w+: \d+ connection\(s\) \| \d+ of \d+ slices · \d+ I\/Os$/);

  // the truth table: its "Not in sync with …" at the right end, after the HDL logic's select (a wide window: room between)
  await page.setViewport(1800, 900);
  await page.menu('Tools', 'Boolean Algebra / Karnaugh Map…');
  await page.waitDialog('New Source');
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'maj3');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  const TB = '.doc:not([hidden]) .tt-editor .tt-toolbar';
  await page.waitFor((b) => window.Silinx.active?.id === 'tt:src/maj3.bool.json' && document.querySelector(`${b} .tt-link`)?.dataset.hdl === 'maj3.vhd', [TB], { what: 'the table linked to maj3.vhd' });
  await page.eval(() => { window.Silinx.outOfSync['src/maj3.vhd'] = 'the table has errors'; window.Silinx.active.ttEditor.refreshLink(); });
  let p = await place(page, TB, '.tt-link');
  assert.deepEqual(p, { text: 'Not in sync with maj3.vhd — the table has errors', gap: 0, after: [] });
  const c = await controlsEnd(page, TB, '.tt-link');
  assert.ok(c.text - c.controls > 100, `the notice after the controls: ${JSON.stringify(c)}`);
  await page.eval(() => { delete window.Silinx.outOfSync['src/maj3.vhd']; window.Silinx.active.ttEditor.refreshLink(); });
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});
