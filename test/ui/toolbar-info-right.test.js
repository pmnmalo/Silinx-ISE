// UI: a toolbar's informational text (what it says, not what it does) at its right end, as the read-only notice (#2725,
// docs/UI-GUIDELINES.md "The toolbar's layout"): I/O Pin Planning's "Top: … · Device … · Board: …" and its status, the
// FPGA view's info on the site selected, the truth table's "Not in sync with …"; every control on their left.
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

uiTest('#2725 a toolbar\'s informational text at its right end: I/O Pin Planning\'s top, device and board and its status, the FPGA view\'s info, the truth table\'s "Not in sync"', E, async (page) => {
  await page.setViewport(1366, 768);
  // I/O Pin Planning: the status, then the top, device and board, at the right end; the tools on their left
  await makeProject(env, { name: 'InfoRight', board: 'basys2', files: { 'src/top.vhd': TOP }, top: 'top' });
  await page.openProject('InfoRight');
  const PB = '.doc:not([hidden]) .pin-planner .pp-bar';
  await page.menu('Tools', 'I/O Pin Planning');
  await page.waitFor((b) => window.Silinx.active?.id === 'pins' && document.querySelector(`${b} .pp-status`)?.textContent, [PB], { what: 'the planner' });
  let p = await place(page, PB, '.pp-info');
  assert.deepEqual(p, { text: 'Top: top · Device xc3s250e-cp132 · Board: Digilent Basys2', gap: 0, after: [] });
  p = await place(page, PB, '.pp-status');
  assert.deepEqual(p, { text: '0/5 I/Os assigned', gap: p.gap, after: ['asm-sep', 'pp-info'] });
  let c = await controlsEnd(page, PB, '.pp-status');
  assert.ok(c.text - c.controls > 100, `the status after the spacer: ${JSON.stringify(c)}`);

  // the FPGA view: its info on the site selected, right-justified, after its ☰ Properties (shown on a narrow window)
  const build = path.join(env.server.workspace, 'InfoRight', 'build');
  await fs.mkdir(build, { recursive: true });
  await fs.writeFile(path.join(build, 'top.ncd'), 'NCD');
  const old = new Date(Date.now() - 60000);
  await fs.utimes(path.join(build, 'top.ncd'), old, old);
  for (const f of ['top.xdl', 'device.xdlrc']) await fs.copyFile(path.join(ROOT, 'packages', 'silinx-fpga', 'test', 'fixtures', 'fpga', f), path.join(build, f));
  const FB = '.doc:not([hidden]) .fv .fv-bar';
  await page.menu('Tools', 'Implemented Design (FPGA View)');
  await page.waitFor(() => window.Silinx.active?.id === 'fpgaview' && document.querySelector('.doc:not([hidden]) .fv-site'), [], { what: 'FPGA view open' });
  await page.click('.doc:not([hidden]) .fv .fv-site');
  await page.waitFor((b) => document.querySelector(`${b} .fv-info`).textContent, [FB], { what: 'the info on the site' });
  p = await place(page, FB, '.fv-info');
  assert.deepEqual({ ...p, text: undefined }, { text: undefined, gap: 0, after: [] });
  assert.match(p.text, /^\w+: \d+ connection\(s\)$/);
  c = await controlsEnd(page, FB, '.fv-info');
  assert.ok(c.text - c.controls > 100, `the info after the controls: ${JSON.stringify(c)}`);
  await page.setViewport(900, 768);
  await page.waitFor((b) => [...document.querySelectorAll(`${b} .btn`)].some((x) => x.textContent === '☰ Properties' && x.getClientRects().length), [FB], { what: 'the narrow toolbar' });
  assert.deepEqual({ ...(await place(page, FB, '.fv-info')), text: undefined }, { text: undefined, gap: 0, after: [] }, 'after ☰ Properties');
  await page.setViewport(1366, 768);

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
  p = await place(page, TB, '.tt-link');
  assert.deepEqual(p, { text: 'Not in sync with maj3.vhd — the table has errors', gap: 0, after: [] });
  c = await controlsEnd(page, TB, '.tt-link');
  assert.ok(c.text - c.controls > 100, `the notice after the controls: ${JSON.stringify(c)}`);
  await page.eval(() => { delete window.Silinx.outOfSync['src/maj3.vhd']; window.Silinx.active.ttEditor.refreshLink(); });
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});
