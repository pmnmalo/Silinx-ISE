// UI: a truth table prints (#1510): its table, the Karnaugh map of the output in front (flat or 3D, as shown) and the
// results, without its commands, the expression's field and the hints; in light colours, with the project and file.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { capturePrints, confirmPrint, fileMenuPrint, printOn, printed } from './print-helpers.js';
import { newTable } from '../../core/logic.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

uiTest('#1510 a truth table prints its table, the Karnaugh map of the output in front (flat, then 3D) and the results', E, async (page) => {
  const t = { ...newTable('maj5', ['a', 'b', 'c', 'd', 'e'], ['f', 'g']), lang: 'vhdl' };
  t.table = { f: '00010111000101110001011111111111', g: '01'.repeat(16) };
  await makeProject(env, { name: 'PrTt', files: { 'src/maj5.tt.json': JSON.stringify(t) } });
  await page.openProject('PrTt');
  await capturePrints(page);
  await page.eval(() => window.SilinxApp.openTt('src/maj5.tt.json'));
  await page.waitFor(() => window.Silinx.active?.ttEditor && document.querySelector('.doc:not([hidden]) .tt-kmap'), [], { what: 'the truth table' });
  assert.ok(await printOn(page));
  assert.equal(!!(await fileMenuPrint(page)).disabled, false, 'File ▸ Print… enabled');
  await page.click('#toolbar .tb-btn[data-cmd=print]');
  await confirmPrint(page);
  let html = await printed(page, 1);
  assert.match(html, /<header class="pv-head"><b>Truth table maj5<\/b><span>Project: PrTt {2}· {2}File: src\/maj5\.tt\.json<\/span><\/header>/);
  assert.match(html, /^<html data-ui="\w+" data-theme="light"/);
  // the table: its 32 rows; the map of f (its tab, not g's): two 4×4 maps (a = 0, a = 1); the results
  const body = html.slice(html.indexOf('<main'));
  assert.equal((body.match(/<td class="tt-idx">/g) || []).length, 32);
  assert.match(body, /<button type="button" class="tt-tab active" data-out="f">f<\/button>/);
  assert.doesNotMatch(body, /class="tt-tab[^"]*" data-out="g"/, 'the other output\'s tab left out');
  assert.equal((body.match(/<svg class="tt-kmap"/g) || []).length, 1);
  assert.match(body, /a = 0[\s\S]*a = 1/);
  assert.match(body, /Minimal SOP/);
  assert.match(body, /f = d\.e \+ c\.e \+ c\.d \+ a\.b/);
  // not its commands, its expression's field, its hints, its options, its empty notes
  assert.doesNotMatch(body, /class="tt-toolbar"|class="tt-expr-in"|class="hint|class="tt-groups"|class="tt-notes"|class="tt-notation"/);
  // the 3D map, as shown
  await page.eval(() => document.querySelector('.doc:not([hidden]) .tt-k3d-on').click());
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .tt-k3d-layer'), [], { what: 'the 3D map' });
  await page.key('p', { modifiers: 2 });
  await confirmPrint(page);
  html = await printed(page, 2);
  assert.ok((html.match(/class="tt-k3d-layer/g) || []).length >= 2, 'its layers');
  assert.doesNotMatch(html, /class="btn tt-k3d-reset"/);
  await page.eval(() => document.querySelector('.doc:not([hidden]) .tt-k3d-on').click());
  // notes written: printed; in Portuguese
  await page.eval(() => { const n = document.querySelector('.doc:not([hidden]) .tt-notes'); n.value = 'majority of five'; n.dispatchEvent(new Event('input')); });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.click('#toolbar .tb-btn[data-cmd=print]');
  await confirmPrint(page, { title: 'Imprimir — ', print: 'Imprimir…' });
  html = await printed(page, 3);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.match(html, /<b>Tabela de verdade maj5<\/b><span>Projeto: PrTt {2}· {2}Ficheiro: src\/maj5\.tt\.json<\/span>/);
  assert.match(html, /<textarea class="tt-notes"[^>]*>majority of five<\/textarea>/);
  assert.match(html, /Notas/);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});
