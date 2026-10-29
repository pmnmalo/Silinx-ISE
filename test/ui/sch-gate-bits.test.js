// UI: a logic gate with a pin per bit (#2079): Width 3 and Pins per bit in its properties (the label in Portuguese too),
// saved, drawn as three gates with I0_0, I1_0, O0… Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const D = '.doc:not([hidden])';

uiTest('#2079 schematic: AND2 and NOR2, Width 3 and Pins per bit in their properties: three gates, a pin per bit; Portuguese', E, async (page) => {
  const doc = newDoc('gb', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'and2', x: 100, y: 100, rot: 0, mirror: false, name: 'U1', params: { width: 1 } },
    { id: 'S2', type: 'nor2', x: 300, y: 100, rot: 0, mirror: false, name: 'U2', params: { width: 1 } });
  await makeProject(env, { name: 'GateBits', files: { 'src/gb.sch.json': JSON.stringify(doc) } });
  await page.openProject('GateBits');
  await page.eval(() => window.SilinxApp.openSch('src/gb.sch.json'));
  await page.waitFor((d) => document.querySelectorAll(`${d} .se-svg g.sym`).length === 2, [D], { what: 'drawn' });
  for (const id of ['S1', 'S2']) {
    await page.click(`${D} g.sym[data-id="${id}"] .hitbox`);
    await page.waitFor((d) => document.querySelector(`${d} [data-param=bits]`), [D], { what: `${id}: Pins per bit` });
    assert.equal(await page.eval((d) => document.querySelector(`${d} [data-param=bits]`).closest('.se-field').querySelector('label').textContent, D), 'Pins per bit (I0_0.., O0..)');
    await page.fill(`${D} [data-param=width]`, '3');
    await page.waitFor((d) => document.querySelector(`${d} [data-param=bits]`), [D], { what: 'Pins per bit again' });
    await page.click(`${D} [data-param=bits]`);
    await page.waitFor(async (i) => JSON.parse(await (await fetch('/api/projects/GateBits/file?path=src%2Fgb.sch.json')).text()).symbols.find((s) => s.id === i).params.bits === true, [id], { what: `${id}: bits saved` });
    // three gate shapes (NOR: a bubble each), the type under them
    assert.equal(await page.eval((d, i) => document.querySelectorAll(`${d} .se-svg g.sym[data-id="${i}"] path.gate:not(.nofill)`).length, D, id), 3, id);
    assert.equal(await page.eval((d, i) => document.querySelectorAll(`${d} .se-svg g.sym[data-id="${i}"] circle.gate`).length, D, id), id === 'S2' ? 3 : 0, id);
  }
  // in Portuguese: the label
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.click(`${D} g.sym[data-id="S1"] .hitbox`);
  await page.waitFor((d) => document.querySelector(`${d} [data-param=bits]`), [D], { what: 'Portuguese' });
  assert.equal(await page.eval((d) => document.querySelector(`${d} [data-param=bits]`).closest('.se-field').querySelector('label').textContent, D), 'Um pino por bit (I0_0.., O0..)');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.dialogs, []);
});
