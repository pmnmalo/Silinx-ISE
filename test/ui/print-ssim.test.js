// UI: SSim's waveform prints (#1511): the names and their values, every row, the waves over the time range shown with
// the time ruler, the cursor and the markers, drawn again on a white background (the wave window stays as it is), with
// the cursor's and the range's times, the project and the simulated module.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { capturePrints, confirmPrint, printOn, printed } from './print-helpers.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// the colour [r, g, b] of a pixel of an image (a data: URL), at (x, y) in CSS pixels of its print (2 image pixels each)
const pixelOf = (page, src, x, y) => page.eval(async (s, px, py) => {
  const img = new Image();
  await new Promise((r) => { img.onload = r; img.src = s; });
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  return [...g.getImageData(px * 2, py * 2, 1, 1).data.slice(0, 3)];
}, src, x, y);

uiTest('#1511 SSim\'s waveform prints its names, values and waves over the time shown, the ruler, cursor and markers, light', E, async (page) => {
  await makeProject(env, { name: 'PrSim', template: 'gates' });
  await page.openProject('PrSim');
  await capturePrints(page);
  await page.eval(() => window.SilinxApp.runSimulation('tb_gates'));
  await page.waitFor(() => window.Silinx.active?.id === 'isim:tb_gates' && window.Silinx.active.view && !window.Silinx.active.view.state.running
    && /Sim Time: 1,000,000 ps/.test(document.querySelector('.doc:not([hidden]) .isim-st-time')?.textContent || ''), [], { what: 'SSim ran', timeout: 30000 });
  // a marker; the window scrolled and a row selected: the print shows every row, none selected, the window keeps its own
  await page.eval(() => { const st = window.Silinx.active.view.state; st.markers.push({ id: 99, t: 250000 }); st.sel = new Set([st.rows[0].key]); });
  const before = await page.eval(() => { const st = window.Silinx.active.view.state; return { scrollY: st.scrollY, sel: [...st.sel] }; });
  assert.ok(await printOn(page));
  await page.click('#toolbar .tb-btn[data-cmd=print]');
  await confirmPrint(page);
  const html = await printed(page, 1);
  assert.match(html, /<header class="pv-head"><b>SSim \(tb_gates\)<\/b><span>Project: PrSim<\/span><\/header>/);
  assert.match(html, /^<html data-ui="\w+" data-theme="light"/);
  const imgs = [...html.matchAll(/<img class="(pv-names|pv-waves)" src="(data:image\/png;base64,[^"]+)" alt="" style="width: ?(\d+)px; ?height: ?(\d+)px;?">/g)];
  assert.deepEqual(imgs.map((m) => m[1]), ['pv-names', 'pv-waves']);
  const rows = await page.eval(() => window.Silinx.active.view.state.rows.length);
  assert.equal(+imgs[0][4], 30 + rows * 20 + 6, 'every row: the ruler, then 20 px a row');
  assert.match(html, /<p class="pv-wave-info">Cursor: 1 us {2}· {2}Time shown: 0 ns – [\d.]+ us {2}· {2}Simulation time: 1 us {2}· {2}Marker 1: 250 ns<\/p>/);
  // paper: the waves' background white (the screen's is black in the classic interface), the names' first row not selected
  assert.deepEqual(await pixelOf(page, imgs[1][2], 3, +imgs[1][4] - 3), [255, 255, 255], "under the last row");
  assert.deepEqual(await pixelOf(page, imgs[0][2], +imgs[0][3] - 4, 45), [255, 255, 255]);
  // the window as it was
  assert.deepEqual(await page.eval(() => { const st = window.Silinx.active.view.state; return { scrollY: st.scrollY, sel: [...st.sel] }; }), before);
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.key('p', { modifiers: 2 });
  await confirmPrint(page, { title: 'Imprimir — ', print: 'Imprimir…' });
  const pt = await printed(page, 2);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.match(pt, /<span>Projeto: PrSim<\/span>/);
  assert.match(pt, /Cursor: 1 us {2}· {2}Tempo mostrado: 0 ns – [\d.]+ us {2}· {2}Tempo de simulação: 1 us {2}· {2}Marcador 1: 250 ns/);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});
