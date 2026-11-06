// UI: the order of a Karnaugh map's variables (#2924): MSB → LSB by columns, then rows by default (a b on the columns,
// c d on the rows of a 4-input map), MSB → LSB by rows, then columns chosen beside the map; saved with the table and
// read back; the 3D maps of 5 inputs follow it; no selector for 1 input; in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { newTable } from '../../core/logic.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const T = '.doc:not([hidden]) .tt-editor';

uiTest('#2924 Karnaugh map: the variables\' order, by columns then rows by default, by rows then columns chosen; saved; 3D; Portuguese', E, async (page) => {
  const k4 = { ...newTable('k4', ['a', 'b', 'c', 'd'], ['f']), table: { f: '0000000000001111' } };   // f = a·b
  const k5 = { ...newTable('k5', ['a', 'b', 'c', 'd', 'e'], ['f']), table: { f: '0'.repeat(32) } };
  const k1 = newTable('k1', ['a'], ['f']);
  await makeProject(env, { name: 'TtOrder', files: { 'src/k4.bool.json': JSON.stringify(k4), 'src/k5.bool.json': JSON.stringify(k5), 'src/k1.bool.json': JSON.stringify(k1) } });
  await page.openProject('TtOrder');
  const open = async (f) => {
    await page.eval((p) => window.SilinxApp.openTt(p), f);
    await page.waitFor((p) => window.Silinx.active?.id === `tt:${p}` && document.querySelector('.doc:not([hidden]) .tt-editor .tt-kmap-host'), [f], { what: f });
  };
  // the map: its variables (the columns', then the rows'), the columns' and rows' labels, its cells row by row, its groups
  const map = () => page.eval((t) => {
    const svg = document.querySelector(`${t} svg.tt-kmap`);
    return {
      order: document.querySelector(`${t} .tt-kmap-order`).value,
      vars: [...svg.querySelectorAll('.tt-k-var')].map((x) => x.textContent),
      cells: [...svg.querySelectorAll('.tt-kcell')].map((g) => +g.dataset.row),
      groups: [...svg.querySelectorAll('.tt-group')].map((g) => [g.getAttribute('width'), g.getAttribute('height')].map(Number)),
    };
  }, T);
  await open('src/k4.bool.json');
  // by default: a b on the columns (00 01 11 10), c d on the rows; the group a·b one column (ab = 11) of four rows
  let m = await map();
  assert.deepEqual([m.order, m.vars], ['cols', ['ab', 'cd']]);
  assert.deepEqual(m.cells, [0, 4, 12, 8, 1, 5, 13, 9, 3, 7, 15, 11, 2, 6, 14, 10]);
  assert.equal(m.groups.length, 1);
  assert.ok(m.groups[0][1] > 3 * m.groups[0][0], `a column: ${m.groups[0]}`);
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-kmap-order option`)].map((o) => o.textContent), T), ['MSB → LSB by columns, then rows', 'MSB → LSB by rows, then columns']);
  // by rows, then columns: a b on the rows, c d on the columns; the group a row
  await page.eval((t) => { const s = document.querySelector(`${t} .tt-kmap-order`); s.value = 'rows'; s.dispatchEvent(new Event('change')); }, T);
  m = await map();
  assert.deepEqual([m.order, m.vars], ['rows', ['cd', 'ab']]);
  assert.deepEqual(m.cells, [0, 1, 3, 2, 4, 5, 7, 6, 12, 13, 15, 14, 8, 9, 11, 10]);
  assert.ok(m.groups[0][0] > 3 * m.groups[0][1], `a row: ${m.groups[0]}`);
  // saved with the table, its HDL unchanged; no message
  await page.waitFor(() => !window.Silinx.active.dirty, [], { what: 'saved' });
  const saved = JSON.parse(await readWs(env, 'TtOrder', 'src/k4.bool.json'));
  assert.deepEqual([saved.kmapOrder, saved.table.f], ['rows', '0000000000001111']);
  // read back: closed and opened again, by rows
  await page.eval(() => window.SilinxApp.closeDoc(window.Silinx.active));
  await open('src/k4.bool.json');
  assert.deepEqual((await map()).vars, ['cd', 'ab']);
  // undone: by columns again, the default not written
  await page.eval((t) => { const s = document.querySelector(`${t} .tt-kmap-order`); s.value = 'cols'; s.dispatchEvent(new Event('change')); }, T);
  assert.deepEqual((await map()).vars, ['ab', 'cd']);
  await page.waitFor(() => !window.Silinx.active.dirty, [], { what: 'saved' });
  assert.equal('kmapOrder' in JSON.parse(await readWs(env, 'TtOrder', 'src/k4.bool.json')), false);
  // 5 inputs, in 3D: a picks the layer, b c the columns and d e the rows; by rows, b c the rows
  await open('src/k5.bool.json');
  if (!await page.eval((t) => document.querySelector(`${t} .tt-k3d-on`).checked, T)) await page.click(`${T} .tt-k3d-on`);
  await page.waitFor((t) => !!document.querySelector(`${t} .tt-k3d`), [T], { what: '3D' });
  const layer0 = () => page.eval((t) => [...document.querySelector(`${t} .tt-k3d-layer`).querySelectorAll('.tt-k3d-cell')].slice(0, 4).map((c) => +c.dataset.row), T);
  assert.deepEqual(await layer0(), [0, 4, 12, 8]);
  await page.eval((t) => { const s = document.querySelector(`${t} .tt-kmap-order`); s.value = 'rows'; s.dispatchEvent(new Event('change')); }, T);
  await page.waitFor((t) => !!document.querySelector(`${t} .tt-k3d`), [T], { what: '3D, by rows' });
  assert.deepEqual(await layer0(), [0, 1, 3, 2]);
  await page.click(`${T} .tt-k3d-on`);
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((t) => document.querySelector(`${t} .tt-kmap-order option`)?.textContent === 'MSB → LSB pelas colunas, depois linhas', [T], { what: 'Portuguese' });
  assert.deepEqual(await page.eval((t) => [document.querySelector(`${t} .tt-kmap-order`).closest('label').firstChild.textContent, document.querySelector(`${t} .tt-kmap-order`).title, ...[...document.querySelectorAll(`${t} .tt-kmap-order option`)].map((o) => o.textContent)], T),
    ['Ordem:', 'Ordem das variáveis no mapa, da mais significativa para a menos', 'MSB → LSB pelas colunas, depois linhas', 'MSB → LSB pelas linhas, depois colunas']);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // 1 input: one order only, no selector
  await open('src/k1.bool.json');
  assert.equal(await page.eval((t) => document.querySelectorAll(`${t} .tt-kmap-order`).length, T), 0);
  // no warnings or errors
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#console-errors .diag, #console-warnings .diag')].map((d) => d.textContent)), []);
});
