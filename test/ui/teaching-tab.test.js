// UI: the Teaching tab of the Design pane's row (#3533, web/js/teaching-page.js), in both interfaces
// (SILINX_UI_INTERFACE): its page's two boxes, Labs and Exercises (Guided Labs…, Exercise…) and Links and Sharing (Copy
// Link to Project…, Open from Repository… where there is git, Share Project Live… in the editions that share); a project's
// commands disabled with none, each opening its dialog with one; the Start page's Teaching box gone (#3333); the tab on
// a narrow screen (the drawer's); in Portuguese; no warnings.
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
// what this edition offers: git (Open from Repository…), the live sharing (Share Project Live…)
const edition = (page) => page.eval(async () => ({ git: (await import('/js/git.js')).hasGit(), share: (({ api }) => !!(api.collab || api.standalone) && !api.following)(await import('/js/api.js')) }));
const commands = ({ git, share }, off) => ['Guided Labs…', 'Exercise…', 'Share Project Copy…', ...(git ? ['Open from Repository…'] : []), ...(share ? ['Share Project Live…'] : [])]
  .map((c) => (off && c !== 'Open from Repository…' ? `${c} (disabled)` : c));

uiTest('#3533 the Teaching tab: the labs, the exercises, the link and the sharing, disabled with no project, each opening its dialog; Portuguese', E, async (page) => {
  await page.setViewport(1366, 768);
  await page.eval(() => window.SilinxApp.closeProject?.());
  // the tab after Libraries, its label and icon
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#left-tabs .tab[data-page]')].map((t) => t.dataset.page).filter((p) => !['procs', 'emu'].includes(p))),
    ['start', 'design', 'files', 'libraries', 'teaching']);
  assert.deepEqual(await page.eval(() => { const t = document.querySelector('#left-tabs .tab[data-page=teaching]'); return [t.querySelector('.tab-lbl').textContent, !!t.querySelector('.tab-ico svg')]; }), ['Teaching', true]);
  await page.leftTab('teaching');
  await page.waitFor(() => document.querySelectorAll('#teach-page .start-box').length === 2, [], { what: 'the Teaching page' });
  const ed = await edition(page);
  assert.deepEqual(await teach(page), { shown: true, headings: ['Labs and Exercises', 'Links and Sharing'], commands: commands(ed, true) });
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
  assert.deepEqual((await teach(page)).commands, commands(ed, false));
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
  await page.click('#teach-page .entry a', { text: 'Share Project Copy…' });
  await page.waitDialog('Share Project Copy');
  await page.key('Escape');
  await page.waitNoDialog();
  if (ed.git) {
    await page.click('#teach-page .entry a', { text: 'Open from Repository…' });
    await page.waitDialog('Open from Repository');
    await page.key('Escape');
    await page.waitNoDialog();
  }
  // the project closed: disabled again
  await page.eval(() => window.SilinxApp.closeProject?.());
  await page.leftTab('teaching');
  await page.waitFor(() => !document.getElementById('teach-page').hasAttribute('data-project'), [], { what: 'the commands disabled' });
  assert.deepEqual((await teach(page)).commands, commands(ed, true));
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.waitFor(() => document.querySelector('#teach-page .start-box h3')?.textContent === 'Laboratórios e Exercícios', [], { what: 'Portuguese' });
    assert.deepEqual(await teach(page), { shown: true, headings: ['Laboratórios e Exercícios', 'Ligações e Partilha'],
      commands: commands(ed, true).map((c) => c.replace('Guided Labs…', 'Laboratórios Guiados…').replace('Exercise…', 'Exercício…').replace('Share Project Copy…', 'Partilhar Cópia do Projeto…')
        .replace('Open from Repository…', 'Abrir do Repositório…').replace('Share Project Live…', 'Partilhar Projeto em Direto…')) });
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
    assert.deepEqual((await teach(page)).headings, ['Labs and Exercises', 'Links and Sharing']);
    assert.ok((await teach(page)).commands.includes('Guided Labs…'), 'enabled with the project');
    // no sideways scroll, the page inside the window
    assert.ok(await page.eval(() => document.getElementById('teach-page').getBoundingClientRect().right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth));
  } finally {
    await page.setViewport(1366, 768);
  }
  await noWarnings(page);
});
