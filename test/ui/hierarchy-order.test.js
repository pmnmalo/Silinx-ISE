// UI: the order of the Design pane's modules and of the Files page's files (#3819, core/natural-order.js): the numbers
// in the names by their value (access_next_state_2 before access_next_state_10), in the Implementation and the
// Simulation view, the top first; both interfaces; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ISE = process.env.SILINX_UI_INTERFACE === 'ise';   // (the Silinx interface: one tree, no Simulation view, #799)

const ent = n => `library ieee; use ieee.std_logic_1164.all;\nentity ${n} is port (a : in std_logic; y : out std_logic); end ${n};\narchitecture r of ${n} is begin y <= a; end r;\n`;
const NUMS = [10, 2, 11, 1, 3];
const ORDER = ['access_next_state_1', 'access_next_state_2', 'access_next_state_3', 'access_next_state_10', 'access_next_state_11'];
// the module rows of the tree, in their order
const modules = page => page.eval(() => [...document.querySelectorAll('#hier .row .lbl')].map(l => l.textContent).filter(t => /^(access_|top_)/.test(t)));

uiTest('#3819 Design pane: the modules in their names\' natural order (access_next_state_2 before access_next_state_10), the top first, in both views; the Files page too', E, async (page) => {
  const files = Object.fromEntries([...NUMS.map(n => [`src/access_next_state_${n}.vhd`, ent(`access_next_state_${n}`)]), ['src/top_9.vhd', ent('top_9')]]);
  await makeProject(env, { name: 'H_order', top: 'top_9', files });
  await page.openProject('H_order');
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].filter(l => /^access_/.test(l.textContent)).length === 5, [], { what: 'the modules in the hierarchy' });
  assert.deepEqual(await modules(page), ['top_9', ...ORDER]);
  // the Simulation view: no top, the natural order (the Silinx interface: one tree, the same)
  await page.setView('sim');
  await page.waitFor(() => window.Silinx.view === 'sim', [], { what: 'the Simulation view' });
  assert.deepEqual(await modules(page), ISE ? [...ORDER, 'top_9'] : ['top_9', ...ORDER]);
  await page.setView('impl');
  // the Files page: the sources in the same order
  await page.leftTab('files');
  await page.waitFor(() => document.querySelectorAll('#files-page tr[data-file^="src/access_"]').length === 5, [], { what: 'the sources on the Files page' });
  const listed = await page.eval(() => [...document.querySelectorAll('#files-page tr[data-file^="src/"]')].map(tr => tr.dataset.file));
  assert.deepEqual(listed, [...ORDER.map(m => `src/${m}.vhd`), 'src/top_9.vhd']);
  await page.leftTab('design');
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});
