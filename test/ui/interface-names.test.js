// UI (#2451): the interfaces' names as the menus show them, Silinx and ISE style (in Portuguese Silinx and Estilo
// ISE), in each interface's own menu: the Silinx interface's header Settings ▸ Interface, the ISE style interface's
// View ▸ Interface; the one shown checked, and chosen by its name in either language. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const NAMES = { en: ['Silinx', 'ISE style'], pt: ['Silinx', 'Estilo ISE'] };
const IDS = ['silinx', 'ise'];

/** The Interface submenu of the interface shown: its entries ({ label, checked }), the one named `pick` chosen. */
async function interfaceMenu(page, pick) {
  await page.closeMenus();
  const silinx = await page.eval(() => document.documentElement.dataset.ui === 'silinx');
  // the Silinx interface: the header's Settings (no menu bar, #1321); the ISE style one: its menu bar's View
  if (silinx) await page.click('#settings-btn');
  else await page.click('#menubar .item', { index: await page.eval(() => [...document.querySelectorAll('#menubar .item')].findIndex((e) => e.dataset.menu === 'View')) });
  await page.waitForSelector('body > .menu-popup .mi');
  const labels = await page.eval(() => [...document.querySelectorAll('body > .menu-popup:not(.sub) > .mi .lbl')].map((l) => l.textContent));
  const at = labels.indexOf('Interface');   // (the same word in Portuguese)
  assert.ok(at >= 0, `Interface in ${labels.join(' | ')}`);
  await page.hover(await page.point('body > .menu-popup:not(.sub) > .mi', { index: at }));
  await page.waitForSelector('.menu-popup.sub .mi');
  const subs = await page.eval(() => [...document.querySelectorAll('.menu-popup.sub .mi')].map((r) => ({ label: r.querySelector('.lbl').textContent, checked: r.querySelector('.chk').textContent === '✓' })));
  if (pick) await page.click('.menu-popup.sub .mi', { index: subs.findIndex((s) => s.label === pick) });
  else await page.closeMenus();
  return subs;
}

uiTest('#2451 the menus name the interfaces Silinx and ISE style (Silinx, Estilo ISE), in both interfaces; chosen by name', E, async (page) => {
  await page.waitFor(() => window.Silinx?.startupChecked && document.querySelector('#start-page .start-box'), [], { what: 'app boot' });
  const setLanguage = (l) => page.eval(async (x) => (await import('/js/i18n.js')).setLanguage(x), l);
  // the interface the suite runs in first, then the other (and back)
  const first = await page.eval(() => document.documentElement.dataset.ui);
  const order = first === 'ise' ? ['ise', 'silinx'] : ['silinx', 'ise'];
  for (const ui of [...order, order[0]]) {
    await page.eval(async (x) => (await import('/js/silinx.js')).setInterface(x), ui);
    await page.waitFor((x) => document.documentElement.dataset.ui === x, [ui], { what: ui });
    for (const lang of ['en', 'pt']) {
      await setLanguage(lang);
      const expect = NAMES[lang].map((label, i) => ({ label, checked: IDS[i] === ui }));
      assert.deepEqual(await interfaceMenu(page), expect, `${ui}, ${lang}`);
    }
    await setLanguage('en');
  }
  // chosen by its name: in Portuguese the other one, in English back
  const other = order[1];
  await setLanguage('pt');
  await interfaceMenu(page, NAMES.pt[IDS.indexOf(other)]);
  await page.waitFor((x) => document.documentElement.dataset.ui === x, [other], { what: `${other} chosen in Portuguese` });
  assert.equal(await page.eval(() => localStorage.getItem('silinx.ui')), other);
  await setLanguage('en');
  await interfaceMenu(page, NAMES.en[IDS.indexOf(order[0])]);
  await page.waitFor((x) => document.documentElement.dataset.ui === x, [order[0]], { what: `${order[0]} chosen in English` });
  assert.equal(await page.eval(() => localStorage.getItem('silinx.ui')), order[0]);
  // (a project opened: the start-up checks' warnings, which depend on the computer, are cleared)
  await makeProject(env, { name: 'Names', template: 'gates' });
  await page.openProject('Names');
  // no warnings: the page's console, the Warnings tab
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, ...[...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)]), ['']);
});
