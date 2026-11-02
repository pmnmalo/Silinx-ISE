// UI (#2595): a task the project's tool does not have is not there (#2311: its button hidden, web/js/tasks.js): the
// switcher's button with `hidden` is not shown (display none, no box), the others are. Its rule in web/css/tasks.css
// was nested inside .task-btn's, where it did not apply. The switcher is the Silinx interface's: from the ISE style
// one (none shown there), the page is switched to it first.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const booted = (page) => page.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });

uiTest('#2595 a hidden task button is not shown; the others are', E, async (page) => {
  await booted(page);
  if (await page.eval(() => document.documentElement.dataset.layout !== 'tasks')) {
    // the ISE style interface: no task switcher shown; then the Silinx one, as View ▸ Interface keeps it
    assert.equal(await page.eval(() => [...document.querySelectorAll('.task-btn')].filter((b) => b.getClientRects().length).length), 0);
    await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
    await page.reload();
    await booted(page);
  }
  await page.waitFor(() => document.querySelectorAll('#task-switch .task-btn').length > 1, [], { what: 'the task switcher' });
  // (hidden and read in one go: the tasks' refresh puts back the buttons of the tool's tasks)
  const r = await page.eval(() => {
    const bs = [...document.querySelectorAll('#task-switch .task-btn')];
    const shown = (b) => b.getClientRects().length > 0;
    const before = bs.map(shown);
    bs[1].hidden = true;
    const out = { before, display: getComputedStyle(bs[1]).display, hiddenShown: shown(bs[1]),
      others: bs.filter((b, i) => i !== 1).map(shown), otherDisplay: getComputedStyle(bs[0]).display };
    bs[1].hidden = false;
    return out;
  });
  assert.deepEqual(r.before, r.before.map(() => true));
  assert.equal(r.display, 'none');
  assert.equal(r.hiddenShown, false);
  assert.notEqual(r.otherDisplay, 'none');
  assert.deepEqual(r.others, r.others.map(() => true));
});
