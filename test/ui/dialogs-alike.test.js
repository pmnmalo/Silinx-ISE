// UI (#1409): the dialogs alike in the modern interface (the Tasks layout), light and dark: the app's (Open Project,
// Toolchain Settings, whose title bar no longer shrinks under a tall body), SSim's (Force Selected Signal) and the
// schematic editor's Symbol Info, one title bar, the same corners, padding, fields and buttons (the primary one filled);
// a list in a dialog with rows as a tree's; the Design Summary's cards with their tops in line; the classic interface's
// dialogs and summary as before. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

async function boot(page, { ui = 'tasks', theme = 'light' } = {}) {
  await page.eval((u, t) => { localStorage.setItem('silinx.ui', u); localStorage.setItem('silinx.theme', t); }, ui, theme);
  await page.reload();
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
}
async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}
const go = async (page, t) => {
  await page.click(`#task-switch .task-btn[data-task="${t}"]`);
  await page.waitFor((x) => document.documentElement.dataset.task === x, [t], { what: `task ${t}` });
};
// a dialog's look: its box's corners, its title bar's height and text, its body's padding, its buttons and fields
const look = (page, box, title, body, buttons, field) => page.eval((b, t, bd, bt, f) => {
  const vis = (e) => e && e.getClientRects().length > 0;
  const q = (s) => [...document.querySelectorAll(s)].filter(vis).pop();
  const cs = (s) => getComputedStyle(q(s));
  const btn = [...q(b).querySelectorAll(bt)].filter(vis), primary = btn.find((x) => x.classList.contains('primary'));
  return { radius: cs(b).borderRadius, title: Math.round(q(t).getBoundingClientRect().height), titleText: `${cs(t).fontSize} ${cs(t).fontWeight}`,
    body: bd ? cs(bd).padding : null, buttons: [...new Set(btn.map((x) => Math.round(x.getBoundingClientRect().height)))],
    // (the primary button filled: not the dialog's own background)
    primary: primary ? getComputedStyle(primary).backgroundColor !== getComputedStyle(q(b)).backgroundColor : null,
    fields: f ? [...new Set([...q(b).querySelectorAll(f)].filter(vis).map((x) => Math.round(x.getBoundingClientRect().height)))] : null };
}, box, title, body, buttons, field);
const FIELDS = 'input[type=text], input:not([type]), select';

for (const theme of ['light', 'dark']) {
  uiTest(`#1409 the dialogs alike (${theme}): the app's, SSim's, Symbol Info; a list's rows; the summary's cards`, E, async (page) => {
    await makeProject(env, { name: `Dlg-${theme}`, template: 'blinky' });
    await makeProject(env, { name: `DlgSch-${theme}`, template: 'gates' });
    await page.setViewport(1440, 900);
    await boot(page, { theme });
    await page.openProject(`Dlg-${theme}`);
    // the app's: Design Properties (fields), Open Project (a list), Toolchain Settings (a tall body)
    await page.eval(() => import('/js/wizards.js').then((w) => { w.projectProperties(); }));
    await page.waitDialog('Design Properties');
    const app = await look(page, '.dlg', '.dlg-title', '.dlg-body', '.dlg-buttons .btn', FIELDS);
    await page.key('Escape'); await page.waitNoDialog();
    await page.eval(() => import('/js/wizards.js').then((w) => { w.openProjectDialog(); }));
    await page.waitDialog('Open Project');
    const list = await page.eval(() => [...new Set([...document.querySelectorAll('.dlg table.grid tr')].map((r) => Math.round(r.getBoundingClientRect().height)))]);
    await page.key('Escape'); await page.waitNoDialog();
    await page.eval(() => import('/js/wizards.js').then((w) => { w.toolchainDialog(); }));
    await page.waitDialog('Toolchain Settings');
    const tall = await look(page, '.dlg', '.dlg-title', '.dlg-body', '.dlg-buttons .btn', null);
    await page.key('Escape'); await page.waitNoDialog();
    // SSim's Force Selected Signal
    await go(page, 'sim');
    await page.click('#task-sim-panel .task-sim-bench .row');
    await page.waitFor(() => document.querySelector('.doc:not([hidden]) .isim-objs tbody tr')?.getClientRects().length > 0, [], { what: 'the simulation', timeout: 60000 });
    await page.rightClick('.doc:not([hidden]) .isim-objs tbody tr');
    await page.click('.isim-menu-item', { text: 'Force Constant...' });
    await page.waitFor(() => document.querySelector('.isim-dlg')?.getClientRects().length > 0, [], { what: 'Force Selected Signal' });
    const ssim = await look(page, '.isim-dlg', '.isim-dlg-title', '.isim-dlg-body', '.isim-dlg-btns .btn', '.isim-dlg-grid :is(input, select)');
    await page.click('.isim-dlg [data-a=cancel]');
    // the schematic editor's Symbol Info
    await page.openProject(`DlgSch-${theme}`);
    await go(page, 'edit');
    await page.eval(() => window.SilinxApp.openFile('src/gates.sch.json'));
    await page.waitFor(() => document.querySelector('.doc:not([hidden]) .sch-editor g.sym .hitbox'), [], { what: 'the schematic' });
    await page.click('.doc:not([hidden]) .sch-editor g.sym .hitbox');
    await page.waitFor(() => document.querySelector('.doc:not([hidden]) .se-props .se-infobtn')?.getClientRects().length > 0, [], { what: 'its properties' });
    await page.click('.doc:not([hidden]) .se-props .se-infobtn');
    await page.waitFor(() => document.querySelector('.se-symdoc .se-dhead'), [], { what: 'Symbol Info' });
    const info = await look(page, '.se-symdoc', '.se-dhead', null, '.se-dhead .btn', null);
    await page.key('Escape');
    const want = { radius: '14px', title: 48, titleText: '14px 650', body: '16px 18px', buttons: [32] };
    assert.deepEqual({ ...app, fields: undefined, primary: undefined }, { ...want, fields: undefined, primary: undefined }, 'the app\'s dialog');
    assert.equal(app.primary, true);
    assert.deepEqual({ ...tall, fields: undefined, primary: undefined }, { ...want, fields: undefined, primary: undefined }, 'a tall dialog\'s title bar not shrunk');
    assert.deepEqual({ ...ssim, fields: ssim.fields }, { ...want, primary: true, fields: app.fields }, 'SSim\'s as the app\'s');
    assert.deepEqual({ radius: info.radius, title: info.title, buttons: info.buttons }, { radius: '14px', title: 48, buttons: [32] }, 'Symbol Info as the app\'s');
    assert.deepEqual(list, [26], 'a list\'s rows as a tree\'s');
    // the Design Summary's cards: the first with its caption, the tops in line
    await page.openProject(`Dlg-${theme}`);
    await go(page, 'impl');
    await page.waitFor(() => document.querySelectorAll('.doc:not([hidden]) .summary-table').length > 1, [], { what: 'the Design Summary' });
    assert.deepEqual(await page.eval(() => {
      const t = [...document.querySelectorAll('.doc:not([hidden]) .summary-table')];
      return { caption: t[0].querySelector('caption').textContent, tops: Math.round(t[1].getBoundingClientRect().top - t[0].getBoundingClientRect().top) };
    }), { caption: 'Project Status', tops: 0 });
    await noWarnings(page);
  }, { timeout: 180000 });
}

// the classic interface: a dialog's title bar ISE's, not shrunk under a tall body either; SSim's as before; the summary
// without the cards' caption
uiTest('#1409 classic: the dialogs\' title bars as before (not shrunk), the summary without the cards\' caption', E, async (page) => {
  await makeProject(env, { name: 'DlgClassic', template: 'blinky' });
  await boot(page, { ui: 'ise' });
  await page.openProject('DlgClassic');
  await page.eval(() => import('/js/wizards.js').then((w) => { w.toolchainDialog(); }));
  await page.waitDialog('Toolchain Settings');
  assert.equal(await page.eval(() => Math.round(document.querySelector('.dlg-title').getBoundingClientRect().height)), 28);
  await page.key('Escape'); await page.waitNoDialog();
  await page.eval(() => window.SilinxApp.openSummary());
  await page.waitFor(() => document.querySelectorAll('.doc:not([hidden]) .summary-table').length > 1, [], { what: 'the Design Summary' });
  assert.equal(await page.eval(() => getComputedStyle(document.querySelector('.doc:not([hidden]) .summary-table caption.summary-status')).display), 'none');
  await noWarnings(page);
});
