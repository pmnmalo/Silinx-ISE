// UI: synthesis, implementation and emulation work on the project's top module (#223). With another
// module selected in the Design pane, running one of them (Generate Programming File, Synthesize,
// Implement Design, Emulate on Board; the Silinx header's Implement / Emulate) says so first: OK runs
// it on the top, Cancel nothing; with the top selected, no question. In Portuguese too.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const HINT = 'Another module becomes the top with Set as Top Module (its right-click menu).';
// the open dialog: its title and its message's lines
const question = (page) => page.eval(() => {
  const d = [...document.querySelectorAll('.dlg-overlay')].pop();
  return { title: d.querySelector('.dlg-title span').textContent, text: [...d.querySelectorAll('.msg-text > div')].map((x) => x.textContent), buttons: [...d.querySelectorAll('.dlg-buttons button')].map((b) => b.textContent) };
});
const processLabels = (page) => page.eval(() => [...document.querySelectorAll('#procs .lbl')].map((l) => l.textContent));

uiTest('the processes on the top module (#223): with another module selected, Generate Programming File, Synthesize, Implement Design and Emulate on Board say they work on the top (Cancel: nothing; OK: the top)', E, async (page) => {
  await makeProject(env, { name: 'TopSel', template: 'traffic' });
  await page.openProject('TopSel');
  await page.treeRow('#hier', 'u_timer - timer', { exact: true });
  await page.waitFor(() => window.Silinx.sel?.module === 'timer');
  const synth = (await processLabels(page)).find((l) => /^Synthesize - /.test(l));
  for (const [proc, verb] of [['Generate Programming File', 'implements'], [synth, 'synthesizes'], ['Implement Design', 'implements'], ['Emulate on Board', 'emulates']]) {
    await page.treeRow('#procs', proc, { dbl: true, exact: true });
    await page.waitDialog(proc);
    assert.deepEqual(await question(page), { title: proc, text: [`${proc} ${verb} the top module 'top', not the selected module 'timer'.`, HINT], buttons: ['OK', 'Cancel'] });
    await page.dialogButton('Cancel');
    await page.waitNoDialog();
  }
  // Cancel: nothing ran, the top is still 'top'
  assert.equal(await page.eval(() => !!window.Silinx.busy || window.Silinx.docs.some((d) => d.id === 'emulator')), false);
  assert.doesNotMatch(await page.consoleText(), /Process "|Started :/);
  assert.equal(await page.eval(() => window.Silinx.project.top), 'top');
  // OK: Emulate on Board emulates the top
  await page.treeRow('#procs', 'Emulate on Board', { dbl: true, exact: true });
  await page.waitDialog('Emulate on Board');
  await page.dialogButton('OK');
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.title === 'Board Emulator (top)', [], { what: 'the emulator of the top', timeout: 30000 });
  assert.equal(await page.eval(() => window.Silinx.project.top), 'top');

  // the top selected: no question
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd');
  await page.treeRow('#hier', 'top', { exact: true });
  await page.waitFor(() => window.Silinx.sel?.module === 'top');
  await page.treeRow('#procs', 'Emulate on Board', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.title === 'Board Emulator (top)', [], { what: 'the emulator of the top', timeout: 30000 });
  assert.deepEqual(page.dialogs, []);
  assert.equal(await page.eval(() => !!document.querySelector('.dlg-overlay')), false);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});

uiTest('the processes on the top module (#223): the Silinx header\'s Implement and Emulate say so too; in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'TopSelPt', template: 'traffic' });
  await page.openProject('TopSelPt');
  await page.treeRow('#hier', 'u_timer - timer', { exact: true });
  await page.waitFor(() => window.Silinx.sel?.module === 'timer');
  // the header's buttons (the Silinx interface's)
  if (await page.eval(() => document.querySelector('#toolbar .m-step')?.getClientRects().length > 0)) {
    for (const [title, verb] of [['Implement', 'implements'], ['Emulate', 'emulates']]) {
      await page.click('#toolbar .m-step', { text: title });
      await page.waitDialog(title);
      assert.deepEqual(await question(page), { title, text: [`${title} ${verb} the top module 'top', not the selected module 'timer'.`, HINT], buttons: ['OK', 'Cancel'] });
      await page.dialogButton('Cancel');
      await page.waitNoDialog();
    }
    assert.equal(await page.eval(() => !!window.Silinx.busy), false);
  }
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  try {
    await page.treeRow('#procs', 'Gerar Ficheiro de Programação', { dbl: true, exact: true });
    await page.waitDialog('Gerar Ficheiro de Programação');
    assert.deepEqual(await question(page), {
      title: 'Gerar Ficheiro de Programação',
      text: ["Gerar Ficheiro de Programação implementa o módulo de topo 'top', não o módulo selecionado 'timer'.",
        'Outro módulo passa a ser o de topo com Definir como Módulo de Topo (no seu menu do botão direito).'],
      buttons: ['OK', 'Cancelar'],
    });
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
    await page.treeRow('#procs', 'Emular na Placa', { dbl: true, exact: true });
    await page.waitDialog('Emular na Placa');
    assert.deepEqual((await question(page)).text[0], "Emular na Placa emula o módulo de topo 'top', não o módulo selecionado 'timer'.");
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
  } finally {
    await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  }
});
