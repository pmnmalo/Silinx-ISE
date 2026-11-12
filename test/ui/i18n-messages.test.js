// UI: texts the label scan did not reach before #3539, in Portuguese: the console's empty Errors tab (a console page,
// which the DOM pass leaves alone: translated where it is written) and the error the Rename dialog's check returns.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const BLINK = 'module blink(input clk, output reg led);\n  always @(posedge clk) led <= ~led;\nendmodule\n';
const setLang = (page, l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
const empty = (page) => page.eval(() => document.querySelector('#console-errors').textContent);
const dlgError = (page) => page.eval(() => document.querySelector('.dlg-overlay .hint[style*="error-fg"]').textContent);

uiTest('the empty Errors tab and the Rename dialog\'s error in Portuguese, and in English (#3539)', E, async (page) => {
  await makeProject(env, { name: 'I18nMsg', top: 'blink', files: { 'src/blink.v': BLINK } });
  await page.openProject('I18nMsg');
  await page.waitFor(() => document.querySelector('#console-errors')?.textContent === 'No messages.', [], { what: 'the empty Errors tab' });
  await setLang(page, 'pt');
  await page.waitFor(() => document.querySelector('#console-errors').textContent === 'Sem mensagens.', [], { what: 'the empty Errors tab in Portuguese' });
  // Rename with a path out of the project: the check's error beside the field
  const open = () => page.eval(() => { import('/js/rename.js').then((m) => m.renameDialog('src/blink.v')); });
  const outside = async (title, button) => {
    await open();
    assert.equal(await page.waitDialog(title), title);
    await page.eval(() => { const i = [...document.querySelectorAll('.dlg-overlay input[type=text]')].pop(); i.value = '../x.v'; });
    await page.dialogButton(button);
    await page.waitFor(() => document.querySelector('.dlg-overlay .hint[style*="error-fg"]')?.textContent, [], { what: 'the error' });
  };
  await outside('Mudar o Nome', 'Mudar o Nome');
  await page.waitFor(() => document.querySelector('.dlg-overlay .hint[style*="error-fg"]').textContent.startsWith('Escreva'), [], { what: 'the error in Portuguese' });
  assert.equal(await dlgError(page), 'Escreva um caminho de ficheiro dentro do projeto.');
  await page.dialogButton('Cancelar');
  await page.waitNoDialog();
  await setLang(page, 'en');
  assert.equal(await empty(page), 'No messages.');
  await outside('Rename', 'Rename');
  assert.equal(await dlgError(page), 'Enter a file path inside the project.');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // no message of the app's own: nothing in Errors nor Warnings
  assert.deepEqual(await page.eval(() => [document.querySelector('#console-errors').textContent, document.querySelector('#console-warnings').textContent]), ['No messages.', 'No messages.']);
});
