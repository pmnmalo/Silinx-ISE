// UI (#3304): the tab of the document in use in sight. More tabs than fit in the strip, the split's two sides each with
// more than fit in its row: a click in a document (the one in front, after its row was scrolled away; the other side's)
// makes its tab the active one, inside its row's visible part; so does a change of view (the Tasks interface's
// Simulate / Design / Implement, the ISE style's Implementation / Simulation) and a resize of the window. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });

const N = 20;
const files = Object.fromEntries(Array.from({ length: N }, (_, i) => [`src/m${i}.vhd`, `entity m${i} is end;\narchitecture a of m${i} is begin end;\n`]));
const settle = (page) => page.eval(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 150)))));
// the active document, whether its tab is marked active, inside its row's visible part, and its row overflows
const state = (page) => page.eval(() => {
  const a = window.Silinx.active, t = a?.tab, bar = document.getElementById('doc-tabs');
  const g = t?.parentElement.classList.contains('tab-group') && getComputedStyle(t.parentElement).display !== 'contents' ? t.parentElement : bar;
  const r = t?.getBoundingClientRect(), q = g.getBoundingClientRect();
  return { id: a?.id, active: !!t?.classList.contains('active'), only: document.querySelectorAll('#doc-tabs .tab.active').length === 1,
    inSight: !!r && r.width > 0 && r.left >= q.left - 1 && r.right <= q.right + 1, full: g.scrollWidth > g.clientWidth + 10 };
});
// every row scrolled to its start (the user's wheel): the active tab, at the end, out of sight
const scrollAway = (page) => page.eval(() => { for (const r of [document.getElementById('doc-tabs'), ...document.querySelectorAll('#doc-tabs > .tab-group')]) r.scrollLeft = 0; });
const inDoc = (page, id) => page.eval((x) => { const r = window.Silinx.docs.find((d) => d.id === x).el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
const expectInSight = async (page, id, what) => {
  await settle(page);
  const s = await state(page);
  assert.deepEqual({ id: s.id, active: s.active, only: s.only, inSight: s.inSight }, { id, active: true, only: true, inSight: true }, `${what}: ${JSON.stringify(s)}`);
};

uiTest('#3304 the document in use: its tab active and in sight after a click (both sides of a split), a view change, a resize', () => env, async (page) => {
  await makeProject(env, { name: 'Tabs', template: 'blinky', files });
  await page.openProject('Tabs');
  for (let i = 0; i < 12; i++) await page.eval((p) => window.SilinxApp.openFile(p), `src/m${i}.vhd`);
  await expectInSight(page, 'file:src/m11.vhd', 'opened');
  assert.equal((await state(page)).full, true, 'more tabs than fit');

  // a click in the document in front, its tab scrolled away
  await scrollAway(page);
  await page.click(await inDoc(page, 'file:src/m11.vhd'));
  await expectInSight(page, 'file:src/m11.vhd', 'a click in the document in front');

  // split: the right side's documents, more than fit in its row
  await page.click('#split-btn');
  for (let i = 12; i < N; i++) await page.eval((p) => window.SilinxApp.openFile(p), `src/m${i}.vhd`);
  await expectInSight(page, `file:src/m${N - 1}.vhd`, 'opened on the right side');
  assert.equal(await page.eval(() => document.querySelectorAll('#doc-tabs > .tab-group').length), 2);
  // a click in the left side, then the right one, then the right one again (in front), the rows scrolled away each time
  for (const [id, what] of [['file:src/m11.vhd', 'the left side'], [`file:src/m${N - 1}.vhd`, 'the right side'], [`file:src/m${N - 1}.vhd`, 'the right side again']]) {
    await scrollAway(page);
    await page.click(await inDoc(page, id));
    await expectInSight(page, id, `a click in ${what}`);
    assert.equal((await state(page)).full, true, `${what}: its row full`);
  }

  // the views: away and back, the rows scrolled away
  const tasks = await page.eval(() => document.documentElement.dataset.layout === 'tasks');
  const views = tasks ? ['sim', 'edit'] : ['sim', 'impl'];
  for (const v of views) {
    await scrollAway(page);
    if (tasks) await page.click(`.task-btn[data-task="${v}"]`);
    else await page.click(`input[name=view][value="${v}"]`);
    await settle(page);
    // (a view with none of its documents open shows no tabs)
    const s = await state(page);
    if (s.id && (await page.eval(() => window.Silinx.active.tab.getBoundingClientRect().width > 0))) await expectInSight(page, s.id, `the view ${v}`);
  }
  await expectInSight(page, `file:src/m${N - 1}.vhd`, 'back in the view');
  await scrollAway(page);
  await page.click(await inDoc(page, 'file:src/m11.vhd'));
  await expectInSight(page, 'file:src/m11.vhd', 'a click after the views');

  // a resize of the window
  await scrollAway(page);
  await page.setViewport(1100, 900);
  await expectInSight(page, 'file:src/m11.vhd', 'the window resized');
  await page.setViewport(1400, 900);

  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});
