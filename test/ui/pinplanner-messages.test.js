// UI: I/O Pin Planning's messages in the console, never in its status line (#2784, docs/UI-GUIDELINES.md): a pin
// assigned twice, warned once when it is saved (not again on the next saves, again when the pins in question change);
// the save itself said by the tab's mark only; the status line's fields the same all along; in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = `library ieee; use ieee.std_logic_1164.all;
entity top is port (sw : in std_logic_vector(1 downto 0); led : out std_logic_vector(1 downto 0)); end top;
architecture rtl of top is begin led <= sw; end rtl;
`;
const P = '.doc:not([hidden]) .pin-planner';

uiTest('#2784 I/O Pin Planning: a pin assigned twice warned in the console once, nothing said on saving, the status line\'s fields kept; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'PinMsgs', board: 'basys2', files: { 'src/top.vhd': TOP }, top: 'top' });
  await page.openProject('PinMsgs');
  await page.menu('Tools', 'I/O Pin Planning');
  await page.waitFor((p) => window.Silinx.active?.id === 'pins' && document.querySelectorAll(`${p} .pp-table tr`).length === 5, [P], { what: 'the planner' });
  const fields = () => page.eval((p) => [...document.querySelectorAll(`${p} .doc-status .ds-f`)].map((e) => e.textContent), P);
  let seen = 0;
  const said = async () => {
    const lines = (await page.consoleText()).split('\n').filter((l) => /Pin Planning/.test(l));
    const r = lines.slice(seen);
    seen = lines.length;
    return r;
  };
  const saved = () => page.waitFor(() => !window.Silinx.active.tab.classList.contains('dirty'), [], { what: 'saved' });
  const pin = async (net, loc) => {
    await page.eval((p, n, l) => {
      const inp = [...document.querySelectorAll(`${p} .pp-table tr`)].find((r) => r.cells[0]?.textContent === n).cells[3].querySelector('input');
      inp.value = l; inp.dispatchEvent(new Event('change'));
    }, P, net, loc);
    await saved();
  };
  assert.deepEqual(await fields(), ['0/4 I/Os assigned', 'Top: top', 'Device xc3s250e-cp132', 'Board: Digilent Basys2']);
  // one pin: saved, nothing said
  await pin('led<0>', 'M5');
  assert.deepEqual(await said(), []);
  assert.deepEqual(await fields(), ['1/4 I/Os assigned', 'Top: top', 'Device xc3s250e-cp132', 'Board: Digilent Basys2']);
  // the same pin on a second net: warned in the console, once; the status line the same fields
  await pin('led<1>', 'M5');
  assert.deepEqual(await said(), ['I/O Pin Planning: pins assigned more than once: M5.']);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#console-log .ln.warn')].map((e) => e.textContent).filter((t) => /Pin Planning/.test(t))),
    ['I/O Pin Planning: pins assigned more than once: M5.']);
  assert.deepEqual(await fields(), ['2/4 I/Os assigned', 'Top: top', 'Device xc3s250e-cp132', 'Board: Digilent Basys2']);
  await pin('sw<0>', 'P11');
  assert.deepEqual(await said(), [], 'not warned again');
  // another pin twice: warned again; one set right, the other still twice: warned; both right: nothing
  await pin('sw<1>', 'P11');
  assert.deepEqual(await said(), ['I/O Pin Planning: pins assigned more than once: M5, P11.']);
  await pin('led<1>', 'M11');
  assert.deepEqual(await said(), ['I/O Pin Planning: pins assigned more than once: P11.']);
  await pin('sw<1>', 'L3');
  assert.deepEqual(await said(), []);
  assert.deepEqual(await fields(), ['4/4 I/Os assigned', 'Top: top', 'Device xc3s250e-cp132', 'Board: Digilent Basys2']);
  // no other warning nor error
  assert.deepEqual((await page.consoleText()).split('\n').filter((l) => /WARNING|ERROR/.test(l)), []);
  // in Portuguese: the status line's fields
  await page.eval(() => import('/js/i18n.js').then((m) => m.setLanguage('pt')));
  await page.waitFor((p) => document.querySelector(`${p} .doc-status .pp-status`).textContent === '4/4 E/S atribuídas', [P], { what: 'Portuguese' });
  await page.eval(() => import('/js/i18n.js').then((m) => m.setLanguage('en')));
});
