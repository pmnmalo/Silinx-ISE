// UI (#2925): the Karnaugh map of 3 inputs on a cylinder and of 4 on a torus, beside the 3D map of 5 and 6 (#1407): the
// 3D box with its tip, flat at first; ticked, a group across the flat map's edges is one patch (c' over a b c; the four
// corners b'·d' over a b c d), its outline in its colour; turned by dragging and the arrow keys, Reset view; a cell
// clicked cycles its value, a drag does not; the cells' titles; Portuguese; dark theme; printed as shown; flat again.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { capturePrints, confirmPrint, printed } from './print-helpers.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const T = '.doc:not([hidden]) .tt-editor';
const table = (name, inputs, f) => ({ version: 1, name, inputs, outputs: ['f'], table: { f }, exprs: {}, notes: '', form: 'sop', lang: 'vhdl' });

uiTest('#2925 Truth Table: the Karnaugh map of 3 inputs on a cylinder, of 4 on a torus, a group across the edges one patch; turned; clicked; Portuguese; printed', E, async (page) => {
  // c' (0 2 4 6) over a b c; b'·d' (0 2 8 10) over a b c d
  const k3 = table('k3', ['a', 'b', 'c'], '10101010');
  const k4 = table('k4', ['a', 'b', 'c', 'd'], '1010000010100000');
  await makeProject(env, { name: 'TtSurf', files: { 'src/k3.bool.json': JSON.stringify(k3), 'src/k4.bool.json': JSON.stringify(k4) } });
  await page.openProject('TtSurf');
  await capturePrints(page);
  const open = async (f) => {
    await page.eval((p) => window.SilinxApp.openTt(p), f);
    await page.waitFor((p) => window.Silinx.active?.id === `tt:${p}` && document.querySelector('.doc:not([hidden]) .tt-editor .tt-kmap-host'), [f], { what: f });
  };
  const shape = () => page.eval((t) => {
    const s = document.querySelector(`${t} .tt-ks`);
    return {
      kind: [...s.classList].find((c) => /^tt-ks-(cylinder|torus)$/.test(c)),
      terms: [...new Set([...s.querySelectorAll('.tt-ks-group')].map((g) => g.dataset.term))],
      cells: [...new Set([...s.querySelectorAll('.tt-ks-group')].map((g) => g.dataset.cells))],
      edges: s.querySelectorAll('.tt-ks-edge').length,
      rows: [...new Set([...s.querySelectorAll('.tt-ks-face')].map((f) => +f.dataset.row))].sort((a, b) => a - b),
      titles: [...new Set([...s.querySelectorAll('.tt-ks-face title')].map((x) => x.textContent))].length,
      flat: !!document.querySelector(`${t} svg.tt-kmap`),
    };
  }, T);
  // 3 inputs: flat at first, the 3D box's tip the cylinder's
  await open('src/k3.bool.json');
  assert.ok(await page.eval((t) => !!document.querySelector(`${t} svg.tt-kmap`) && !document.querySelector(`${t} .tt-k3d`), T), 'flat at first');
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-k3d-on`).closest('label').title, T), 'The map rolled into a cylinder: the cells across its edges joined');
  await page.click(`${T} .tt-k3d-on`);
  await page.waitFor((t) => !!document.querySelector(`${t} .tt-ks`), [T], { what: 'the cylinder' });
  const s3 = await shape();
  assert.deepEqual({ ...s3, edges: s3.edges >= 4 }, { kind: 'tt-ks-cylinder', terms: ['0'], cells: ['0,2,4,6'], edges: true, rows: [0, 1, 2, 3, 4, 5, 6, 7], titles: 8, flat: false });
  // the map's order (#2924) followed: by columns (the default) c is on the rows, so c' is a whole ring, outlined above
  // and below only; by rows c is on the columns, so c' is two columns across the seam, outlined on its sides too
  const order = (o) => page.eval((t, v) => { const s = document.querySelector(`${t} .tt-kmap-order`); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, T, o);
  await order('rows');
  await page.waitFor((t) => document.querySelector(`${t} .tt-kmap-order`)?.value === 'rows' && !!document.querySelector(`${t} .tt-ks`), [T], { what: 'by rows' });
  const s3r = await shape();
  assert.deepEqual([s3r.kind, s3r.terms, s3r.cells, s3r.rows.length], ['tt-ks-cylinder', ['0'], ['0,2,4,6'], 8]);
  assert.ok(s3r.edges >= 4 && s3r.edges !== s3.edges, `by rows ${s3r.edges} outline segments, by columns ${s3.edges}`);
  await order('cols');
  await page.waitFor((t) => document.querySelector(`${t} .tt-kmap-order`)?.value === 'cols' && !!document.querySelector(`${t} .tt-ks`), [T], { what: 'by columns' });
  assert.equal((await shape()).edges, s3.edges);
  // Reset view right after the 3D box, on the options' line
  assert.ok(await page.eval((t) => { const g = document.querySelector(`${t} .tt-groups`); return g.querySelector('.tt-k3d-on').closest('label').nextElementSibling === g.querySelector('.tt-k3d-reset'); }, T));
  // turned by dragging and by the arrow keys; Reset view
  const pts = () => page.eval((t) => document.querySelector(`${t} .tt-ks-face[data-row="0"]`).getAttribute('points'), T);
  const p0 = await pts();
  const box = await page.eval((t) => { const r = document.querySelector(`${t} .tt-ks`).getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; }, T);
  await page.drag(box, { x: box.x + 60, y: box.y + 30 });
  assert.notEqual(await pts(), p0, 'turned by dragging');
  assert.deepEqual((await shape()).rows.length, 8, 'a drag clicks no cell: the map not drawn again');
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-ks-face[data-row="0"]`).classList.contains('v1'), T), true, 'm0 kept');
  await page.click(`${T} .tt-k3d-reset`);
  assert.equal(await pts(), p0, 'Reset view');
  await page.eval((t) => { const s = document.querySelector(`${t} .tt-ks`); s.focus(); s.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); }, T);
  assert.notEqual(await pts(), p0, 'turned by the arrow keys');
  await page.click(`${T} .tt-k3d-reset`);
  // a cell of a 0 clicked where it is seen (beside the seam in front): 0 -> 1, the map drawn again on the cylinder
  const seen = (m) => page.eval((t, mt) => {
    for (const f of document.querySelectorAll(`${t} .tt-ks-face[data-row="${mt}"]:not(.back)`)) {
      const b = f.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2;
      const at = document.elementFromPoint(x, y);
      if (at === f || (at?.classList.contains('tt-ks-group') && document.elementsFromPoint(x, y).find((e) => e.classList.contains('tt-ks-face')) === f)) return { x: Math.round(x), y: Math.round(y) };
    }
    return null;
  }, T, m);
  let m = null;
  for (const k of [1, 3, 5, 7]) if (!m && await seen(k)) m = k;
  assert.ok(m, 'a cell of a 0 seen');
  await page.click(await seen(m));
  await page.waitFor((t, k) => document.querySelector(`${t} .tt-ks-face[data-row="${k}"]`)?.classList.contains('v1'), [T, m], { what: `m${m} to 1` });
  await page.click(await seen(m));
  await page.click(await seen(m));
  await page.waitFor((t, k) => document.querySelector(`${t} .tt-ks-face[data-row="${k}"]`)?.classList.contains('v0'), [T, m], { what: `m${m} back to 0` });
  // 4 inputs: flat at first (each table its own 3D box, #3074), then the torus, the four corners one patch, its four sides outlined
  await open('src/k4.bool.json');
  assert.ok(await page.eval((t) => !!document.querySelector(`${t} svg.tt-kmap`) && !document.querySelector(`${t} .tt-k3d-on`).checked, T), 'k4 flat at first');
  await page.click(`${T} .tt-k3d-on`);
  await page.waitFor((t) => !!document.querySelector(`${t} .tt-ks`), [T], { what: 'the torus' });
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-k3d-on`).closest('label').title, T), 'The map on a torus: both pairs of its edges joined');
  const s4 = await shape();
  assert.deepEqual([s4.kind, s4.terms, s4.cells, s4.rows.length, s4.titles], ['tt-ks-torus', ['0'], ['0,2,8,10'], 16, 16]);
  assert.ok(s4.edges >= 4, `${s4.edges} outline segments`);
  // the scene inside the page at any rotation
  for (const k of ['ArrowUp', 'ArrowUp', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft']) await page.eval((t, key) => { const s = document.querySelector(`${t} .tt-ks`); s.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); }, T, k);
  assert.ok(await page.eval((t) => {
    const s = document.querySelector(`${t} .tt-ks`).getBoundingClientRect();
    return [...document.querySelectorAll(`${t} .tt-ks-face`)].every((f) => { const b = f.getBoundingClientRect(); return b.left >= s.left - 1 && b.right <= s.right + 1 && b.top >= s.top - 1 && b.bottom <= s.bottom + 1; });
  }, T), 'inside its scene');
  // dark theme: the faces dark
  await page.eval(() => document.documentElement.setAttribute('data-theme', 'dark'));
  const fill = await page.eval((t) => getComputedStyle(document.querySelector(`${t} .tt-ks-face:not(.v1):not(.back)`)).fill, T);
  assert.notEqual(fill, 'rgb(255, 255, 255)', 'dark faces');
  await page.eval(() => document.documentElement.removeAttribute('data-theme'));
  // printed as shown: the torus, without Reset view
  await page.click('#toolbar .tb-btn[data-cmd=print]');
  await confirmPrint(page);
  const html = await printed(page, 1);
  assert.match(html, /class="tt-k3d tt-ks tt-ks-torus/);
  assert.doesNotMatch(html, /class="btn tt-k3d-reset"/);
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((t) => document.querySelector(`${t} .tt-k3d-reset`)?.textContent === 'Repor a vista', [T], { what: 'Portuguese' });
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-k3d-on`).closest('label').title, T), 'O mapa num toro: os dois pares de margens juntos');
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-ks`).title, T), 'Arraste (ou use as setas) para rodar o mapa');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // flat again
  await page.click(`${T} .tt-k3d-on`);
  await page.waitFor((t) => !document.querySelector(`${t} .tt-ks`) && !!document.querySelector(`${t} svg.tt-kmap`), [T], { what: 'flat again' });
  // no warnings
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});
