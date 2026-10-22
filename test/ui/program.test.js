// UI: Program (iMPACT, web/js/impact.js; the Tasks interface's Program task, web/js/tasks-prog.js and
// web/css/tasks.css): the programming panel uses the whole width available in every interface (#1023).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
// the Tasks interface is a development build's only, for now (#838)
const DEV = { commit: 'abc1234', date: '2026-10-21 12:00' };

// the page in an interface (kept, as View ▸ Interface keeps it), booted again
async function useInterface(page, ui) {
  await page.eval((u) => localStorage.setItem('silinx.ui', u), ui);
  await page.reload();
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
}
// no warnings: the page's console, the Warnings tab
async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, ...[...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)]), ['']);
}

// #1023: the programming panel as wide as its document, the chain and Program FPGA too, at a desktop's and a
// laptop's width; in the Tasks interface (it was 920 px at most) as in the modern and classic ones
uiTest('#1023 Program: the panel uses the whole width available, in the Tasks, modern and classic interfaces', E, async (page) => {
  await makeProject(env, { name: 'ProgWide', template: 'gates' });
  const W = () => page.eval(() => {
    const doc = document.querySelector('#workspace > .doc:not([hidden])'), p = doc.querySelector(':scope > .page');
    const w = (e) => Math.round(e.getBoundingClientRect().width), cs = getComputedStyle(p);
    // (its content's width: without its vertical scroll bar, where it has one)
    const inner = p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), full = (s) => Math.abs(w(p.querySelector(s)) - inner) <= 1;
    return { doc: w(doc), page: w(p), chain: full('.impact-chain'), fpga: full('.imp-fpga') };
  });
  for (const ui of ['tasks', 'modern', 'classic']) {
    await useInterface(page, ui);
    await page.openProject('ProgWide');
    if (ui === 'tasks') {
      await page.click('#task-switch .task-btn[data-task="prog"]');
      await page.waitFor(() => !!document.querySelector('.doc:not([hidden]) .task-prog-settings'), [], { what: 'Program arranged' });
    } else {
      await page.eval(() => window.SilinxApp.openImpact());
      await page.waitFor(() => document.querySelector('#workspace > .doc:not([hidden]) .impact-chain'), [], { what: 'iMPACT' });
    }
    for (const [w, h] of [[1920, 1080], [1366, 768]]) {
      await page.setViewport(w, h);
      await page.waitFor((vw) => innerWidth === vw, [w], { what: `${w} px` });
      const r = await W();
      assert.ok(r.doc > w * 0.6, `${ui} at ${w}: the document ${r.doc} px wide`);
      assert.deepEqual(r, { doc: r.doc, page: r.doc, chain: true, fpga: true }, `${ui} at ${w}`);
    }
  }
  await noWarnings(page);
}, { build: DEV, timeout: 120000 });
