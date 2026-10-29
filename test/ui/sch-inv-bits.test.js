// UI: INV and BUF with a pin per bit (#2067): Width 4 and Pins per bit in their properties (the label in Portuguese
// too), saved, drawn as four triangles with I0..I3 / O0..O3. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const D = '.doc:not([hidden])';

uiTest('#2067 schematic: INV and BUF, Width 4 and Pins per bit in their properties: four triangles, a pin per bit; Portuguese', E, async (page) => {
  const doc = newDoc('pb', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'inv', x: 100, y: 100, rot: 0, mirror: false, name: 'U1', params: { width: 1 } },
    { id: 'S2', type: 'buf', x: 300, y: 100, rot: 0, mirror: false, name: 'U2', params: { width: 1 } });
  await makeProject(env, { name: 'InvBits', files: { 'src/pb.sch.json': JSON.stringify(doc) } });
  await page.openProject('InvBits');
  await page.eval(() => window.SilinxApp.openSch('src/pb.sch.json'));
  await page.waitFor((d) => document.querySelectorAll(`${d} .se-svg g.sym`).length === 2, [D], { what: 'drawn' });
  const saved = async () => JSON.parse(await page.eval(async () => (await fetch('/api/projects/InvBits/file?path=src%2Fpb.sch.json')).text()));
  for (const id of ['S1', 'S2']) {
    await page.click(`${D} g.sym[data-id="${id}"] .hitbox`);
    await page.waitFor((d) => document.querySelector(`${d} [data-param=bits]`), [D], { what: `${id}: Pins per bit` });
    assert.equal(await page.eval((d) => document.querySelector(`${d} [data-param=bits]`).closest('.se-field').querySelector('label').textContent, D), 'Pins per bit (I0.., O0..)');
    await page.fill(`${D} [data-param=width]`, '4');
    await page.waitFor((d) => document.querySelector(`${d} [data-param=bits]`), [D], { what: 'Pins per bit again' });
    await page.click(`${D} [data-param=bits]`);
    await page.waitFor(async (i) => JSON.parse(await (await fetch('/api/projects/InvBits/file?path=src%2Fpb.sch.json')).text()).symbols.find((s) => s.id === i).params.bits === true, [id], { what: `${id}: bits saved` });
    // four triangles (INV: a bubble each), its pins one bit each
    assert.equal(await page.eval((d, i) => document.querySelectorAll(`${d} .se-svg g.sym[data-id="${i}"] path.gate:not(.nofill)`).length, D, id), 4, id);
    assert.equal(await page.eval((d, i) => document.querySelectorAll(`${d} .se-svg g.sym[data-id="${i}"] circle.gate`).length, D, id), id === 'S1' ? 4 : 0, id);
  }
  assert.deepEqual((await saved()).symbols.map((s) => [s.type, s.params.width, s.params.bits]), [['inv', 4, true], ['buf', 4, true]]);
  // in Portuguese: the checkbox's label
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.click(`${D} g.sym[data-id="S1"] .hitbox`);
  await page.waitFor((d) => document.querySelector(`${d} [data-param=bits]`), [D], { what: 'Pins per bit, Portuguese' });
  assert.equal(await page.eval((d) => document.querySelector(`${d} [data-param=bits]`).closest('.se-field').querySelector('label').textContent, D), 'Um pino por bit (I0.., O0..)');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.dialogs, []);
});
