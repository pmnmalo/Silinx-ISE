// UI: VCC and GND turned 90°, 180° or 270°, mirrored or not: their label drawn beside their bars, never over them
// (#2042), the boxes measured in the browser. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';

uiTest('#2042 schematic: VCC and GND in every orientation, their label clear of their bars', E, async (page) => {
  const doc = newDoc('pwr', 'vhdl');
  let k = 0;
  for (const type of ['vcc', 'gnd']) for (const rot of [0, 90, 180, 270]) for (const mirror of [false, true]) {
    k++;
    doc.symbols.push({ id: `S${k}`, type, x: 100 + 80 * ((k - 1) % 8), y: type === 'vcc' ? 100 : 300, rot, mirror, name: `X${k}`, params: { width: 1 } });
  }
  await makeProject(env, { name: 'PwrPj', files: { 'src/pwr.sch.json': JSON.stringify(doc) } });
  await page.openProject('PwrPj');
  await page.eval(() => window.SilinxApp.openSch('src/pwr.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 16, [ED], { what: 'drawn' });
  const clash = await page.eval((ed) => [...document.querySelectorAll(`${ed} svg .sym`)].map((g) => {
    // (on the screen: the bars are drawn in the symbol's turned frame, the label upright; their box grown by 2 px)
    const t = g.querySelector('.stype').getBoundingClientRect(), b0 = g.querySelector('path.gate').getBoundingClientRect();
    const b = { x: b0.x - 2, y: b0.y - 2, width: b0.width + 4, height: b0.height + 4 };
    const over = t.x < b.x + b.width && b.x < t.x + t.width && t.y < b.y + b.height && b.y < t.y + t.height;
    return over ? `${g.dataset.id}: ${g.querySelector('.stype').textContent} over its bars` : null;
  }).filter(Boolean), ED);
  assert.deepEqual(clash, []);
});
