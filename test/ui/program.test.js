// UI: Program (iMPACT, web/js/impact.js; the Tasks interface's Program task, web/js/tasks-prog.js and
// web/css/tasks.css): the programming panel uses the whole width available in every interface (#1023); Program FPGA
// with no programming file, or one older than the sources, asks whether to implement the design first and programs
// it once it is built, No programming nothing (#1024); every operation of the PROM shown at once, no More… (#1025).
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

// the programmer stood in for (no board nor its tools on the test's computer): the files Program FPGA sends, in
// window.__programmed, its job ended at once
async function standInProgrammer(page) {
  await page.eval(async () => {
    const { api } = await import('/js/api.js');
    const job = api.job;
    window.__programmed = [];
    api.program = async (b) => { window.__programmed.push(b.bitfile); return { job: 'program-stand-in' }; };
    api.job = (id, since) => (id === 'program-stand-in' ? Promise.resolve({ status: 'ok', lines: ['(the programmer)'] }) : job(id, since));
  });
}
const PROGRAM_FPGA = '#workspace > .doc:not([hidden]) .imp-fpga .btn.primary';
// the question's title, lines and buttons (null: none)
const question = (page) => page.eval(() => {
  const d = document.querySelector('.dlg-overlay');
  return d && [d.querySelector('.dlg-title span').textContent, ...[...d.querySelectorAll('.msg-text > div')].map((l) => l.textContent),
    ...[...d.querySelectorAll('.dlg-buttons .btn')].map((b) => b.textContent)];
});
const programmed = (page) => page.eval(() => window.__programmed);

// #1024: no programming file: asked, in every interface, No programming nothing; in Portuguese; Yes implements the
// design, then programs it; a file up to date programs at once; one older than the sources is asked about again
uiTest('#1024 Program FPGA with no programming file, or an old one: implement first (Yes), or nothing (No); in Portuguese', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await makeProject(env, { name: 'ProgImpl', template: 'gates' });
  const ask = ['Program FPGA', "There is no programming file of 'gates' yet.", 'Implement the design first? When it ends without errors, the FPGA is programmed.', 'Yes', 'No'];
  for (const ui of ['tasks', 'modern', 'classic']) {
    await useInterface(page, ui);
    await page.openProject('ProgImpl');
    if (ui === 'tasks') await page.click('#task-switch .task-btn[data-task="prog"]');
    else await page.eval(() => window.SilinxApp.openImpact());
    await page.waitFor((s) => !!document.querySelector(s), [PROGRAM_FPGA], { what: 'Program FPGA' });
    await standInProgrammer(page);
    // the file's state is not a line of the page (it was the Tasks interface's)
    assert.doesNotMatch(await page.eval(() => document.querySelector('#workspace > .doc:not([hidden])').innerText), /No programming file yet|Up to date with the sources/, ui);
    await page.click(PROGRAM_FPGA);
    await page.waitDialog('Program FPGA');
    assert.deepEqual(await question(page), ask, ui);
    await page.dialogButton('No');
    await page.waitNoDialog();
    assert.deepEqual(await programmed(page), [], ui);
    assert.doesNotMatch(await page.consoleText(), /Programming FPGA|Started : "Generate Programming File"/, ui);
  }
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.click(PROGRAM_FPGA);
  await page.waitDialog('Programar FPGA');
  assert.deepEqual(await question(page), ['Programar FPGA', "Ainda não há ficheiro de programação de 'gates'.",
    'Implementar o projeto primeiro? Quando terminar sem erros, a FPGA é programada.', 'Sim', 'Não']);
  await page.dialogButton('Não');
  await page.waitNoDialog();
  assert.deepEqual(await programmed(page), []);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // Yes: Generate Programming File, then the FPGA programmed with its file
  await page.click(PROGRAM_FPGA);
  await page.waitDialog('Program FPGA');
  await page.dialogButton('Yes');
  await page.waitConsole(/'1': Programmed successfully\./, { timeout: 120000 });
  assert.deepEqual(await programmed(page), ['build/gates.bit']);
  const log = await page.consoleText();
  const built = log.indexOf('Process "Generate Programming File" completed successfully\n');
  assert.ok(built > 0 && built < log.indexOf('Programming FPGA (SRAM)...'), log.slice(-2000));
  // up to date: programmed at once
  await page.click(PROGRAM_FPGA);
  await page.waitFor(() => window.__programmed.length === 2, [], { what: 'programmed again' });
  assert.equal(await question(page), null);
  // the sources changed (the constraints): older than the sources, asked; No
  await page.eval(() => window.SilinxApp.openFile('constraints/gates.ucf'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:constraints/gates.ucf' && !!window.Silinx.active.editor, [], { what: 'the constraints' });
  await page.eval(async () => { const ed = window.Silinx.active.editor; ed.setCursor({ line: 0, ch: 0 }); ed.replaceSelection('# changed\n'); await window.SilinxApp.saveAll(); });
  await page.waitFor(() => window.Silinx.status.bitgen === 'stale', [], { what: 'out of date' });
  await page.eval(() => window.SilinxApp.openImpact());
  await page.click(PROGRAM_FPGA);
  await page.waitDialog('Program FPGA');
  assert.deepEqual(await question(page), ['Program FPGA', "The programming file of 'gates' is older than the sources.", ...ask.slice(2)]);
  await page.dialogButton('No');
  await page.waitNoDialog();
  assert.equal((await programmed(page)).length, 2);
  await noWarnings(page);
  await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
}, { build: DEV, timeout: 240000 });

// #1025: the PROM selected in the chain: Program PROM and every other operation shown at once, no More…, in the Tasks,
// modern and classic interfaces; in Portuguese
uiTest('#1025 Program PROM: every operation shown, no More…; in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'ProgProm', template: 'gates' });
  const prom = () => page.eval(() => {
    const p = document.querySelector('#workspace > .doc:not([hidden]) > .page'), vis = (e) => e.getClientRects().length > 0;
    return { buttons: [...p.querySelectorAll('.prom-box .btn')].filter(vis).map((b) => b.textContent),
      more: [...p.querySelectorAll('.btn')].filter((b) => vis(b) && /^(More…|Mais…)$/.test(b.textContent)).length };
  });
  for (const ui of ['tasks', 'modern', 'classic']) {
    await useInterface(page, ui);
    await page.openProject('ProgProm');
    if (ui === 'tasks') await page.click('#task-switch .task-btn[data-task="prog"]');
    else await page.eval(() => window.SilinxApp.openImpact());
    await page.waitFor(() => !!document.querySelector('#workspace > .doc:not([hidden]) .impact-chain .impact-dev'), [], { what: 'iMPACT' });
    // the FPGA selected: no PROM operation
    assert.deepEqual(await prom(), { buttons: [], more: 0 }, ui);
    // the PROM (the Basys2's XCF02S)
    await page.click('#workspace > .doc:not([hidden]) .impact-chain .impact-dev', { text: 'XCF02S' });
    await page.waitFor(() => !document.querySelector('#workspace > .doc:not([hidden]) .prom-box').hidden, [], { what: 'the PROM selected' });
    assert.deepEqual(await prom(), { buttons: ['Program PROM', 'Verify', 'Erase', 'Back up PROM', 'Reload FPGA from PROM'], more: 0 }, ui);
  }
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('#workspace > .doc:not([hidden]) .prom-box .btn')?.textContent === 'Programar PROM', [], { what: 'Portuguese' });
  assert.deepEqual(await prom(), { buttons: ['Programar PROM', 'Verificar', 'Apagar', 'Copiar PROM', 'Recarregar FPGA a partir da PROM'], more: 0 });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await noWarnings(page);
}, { build: DEV, timeout: 120000 });
