// UI: the Teaching tab of the Design pane's row (#3533, web/js/teaching-page.js), in both interfaces
// (SILINX_UI_INTERFACE): its page's box, Labs and Exercises (Guided Labs…, Exercise…; its Links and Sharing box gone, the
// Start page's sharing and git entries, #3699); a project's commands disabled with none, each opening its dialog with one;
// the Start page's Teaching box gone (#3333); the tab on a narrow screen (the drawer's); in Portuguese; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, ...[...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)]), ['']);
}
// the Teaching page as shown: its headings, its commands ("(disabled)" when they cannot be clicked)
const teach = (page) => page.eval(() => {
  const host = document.getElementById('teach-page');
  return { shown: host.getClientRects().length > 0, headings: [...host.querySelectorAll('.start-box h3')].map((e) => e.textContent),
    commands: [...host.querySelectorAll('.entry a')].map((a) => `${a.textContent}${getComputedStyle(a).pointerEvents === 'none' ? ' (disabled)' : ''}`) };
});
const commands = (off) => ['Guided Labs…', 'Exercise…'].map((c) => (off ? `${c} (disabled)` : c));

uiTest('#3533 #3699 the Teaching tab: the labs and the exercises (no Links and Sharing box), disabled with no project, each opening its dialog; Portuguese', E, async (page) => {
  await page.setViewport(1366, 768);
  await page.eval(() => window.SilinxApp.closeProject?.());
  // the tab after Libraries, its label and icon
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#left-tabs .tab[data-page]')].map((t) => t.dataset.page).filter((p) => !['procs', 'emu'].includes(p))),
    ['start', 'design', 'files', 'libraries', 'teaching']);
  assert.deepEqual(await page.eval(() => { const t = document.querySelector('#left-tabs .tab[data-page=teaching]'); return [t.querySelector('.tab-lbl').textContent, !!t.querySelector('.tab-ico svg')]; }), ['Teaching', true]);
  await page.leftTab('teaching');
  await page.waitFor(() => document.querySelectorAll('#teach-page .start-box').length === 1, [], { what: 'the Teaching page' });
  assert.deepEqual(await teach(page), { shown: true, headings: ['Labs and Exercises'], commands: commands(true) });
  assert.equal(await page.eval(() => document.querySelector('#left-tabs .tab.active').dataset.page), 'teaching');
  // the Start page: no Teaching box any more (#3333's, the tab's now)
  await page.leftTab('start');
  await page.waitFor(() => document.querySelector('#start-page .start-box h3'), [], { what: 'the Start page' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#start-page .start-box h3')].map((e) => e.textContent).filter((t) => t === 'Teaching')), []);
  // a project open: enabled, each command its dialog
  await makeProject(env, { name: 'TeachTab', template: 'gates' });
  await page.openProject('TeachTab');
  await page.leftTab('teaching');
  await page.waitFor(() => document.getElementById('teach-page').hasAttribute('data-project'), [], { what: 'the commands enabled' });
  assert.deepEqual((await teach(page)).commands, commands(false));
  await page.click('#teach-page .entry a', { text: 'Guided Labs…' });
  await page.waitDialog('Guided Labs');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .lab-pick')?.dataset.lab), 'gates-first-steps');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  await page.click('#teach-page .entry a', { text: 'Exercise…' });
  await page.waitDialog('Exercise');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .dlg-buttons .btn')].map((b) => b.textContent.trim())), ['New Exercise', 'Cancel']);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // the project closed: disabled again
  await page.eval(() => window.SilinxApp.closeProject?.());
  await page.leftTab('teaching');
  await page.waitFor(() => !document.getElementById('teach-page').hasAttribute('data-project'), [], { what: 'the commands disabled' });
  assert.deepEqual((await teach(page)).commands, commands(true));
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.waitFor(() => document.querySelector('#teach-page .start-box h3')?.textContent === 'Laboratórios e Exercícios', [], { what: 'Portuguese' });
    assert.deepEqual(await teach(page), { shown: true, headings: ['Laboratórios e Exercícios'],
      commands: ['Laboratórios Guiados… (disabled)', 'Exercício… (disabled)'] });
    assert.equal(await page.eval(() => document.querySelector('#left-tabs .tab[data-page=teaching] .tab-lbl').textContent), 'Ensino');
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
  await noWarnings(page);
});

// a narrow screen: the tab and its page in the drawer (the Silinx interface's Tasks layout docks the side panel)
uiTest('#3533 the Teaching tab on a narrow screen', E, async (page) => {
  await makeProject(env, { name: 'TeachNarrow', template: 'gates' });
  await page.openProject('TeachNarrow');
  await page.setViewport(820, 1180);
  try {
    await page.leftTab('teaching');
    await page.waitFor(() => document.getElementById('teach-page').getClientRects().length > 0, [], { what: 'the Teaching page' });
    assert.deepEqual((await teach(page)).headings, ['Labs and Exercises']);
    assert.ok((await teach(page)).commands.includes('Guided Labs…'), 'enabled with the project');
    // no sideways scroll, the page inside the window
    assert.ok(await page.eval(() => document.getElementById('teach-page').getBoundingClientRect().right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth));
  } finally {
    await page.setViewport(1366, 768);
  }
  await noWarnings(page);
});
