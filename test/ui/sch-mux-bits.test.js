// UI: MUX and DEMUX with a pin per bit (#2081): Width 2 and Pins per bit in their properties (the label in Portuguese
// too), saved, drawn as two of them, the select shared (one pin, its line through both); MUX's Select bits kept with it.
// Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const D = '.doc:not([hidden])';

uiTest('#2081 schematic: MUX and DEMUX, Width 2 and Pins per bit in their properties: two of each, their select shared; Portuguese', E, async (page) => {
  const doc = newDoc('mb', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'mux2', x: 100, y: 100, rot: 0, mirror: false, name: 'U1', params: { width: 1 } },
    { id: 'S2', type: 'demux', x: 400, y: 100, rot: 0, mirror: false, name: 'U2', params: { width: 1, sel: 1 } });
  await makeProject(env, { name: 'MuxBits', files: { 'src/mb.sch.json': JSON.stringify(doc) } });
  await page.openProject('MuxBits');
  await page.eval(() => window.SilinxApp.openSch('src/mb.sch.json'));
  await page.waitFor((d) => document.querySelectorAll(`${d} .se-svg g.sym`).length === 2, [D], { what: 'drawn' });
  const saved = async () => JSON.parse(await page.eval(async () => (await fetch('/api/projects/MuxBits/file?path=src%2Fmb.sch.json')).text()));
  const label = () => page.eval((d) => document.querySelector(`${d} [data-param=bits]`).closest('.se-field').querySelector('label').textContent, D);
  for (const [id, text] of [['S1', 'Pins per bit (D0_0.., O0..)'], ['S2', 'Pins per bit (D0.., O0_0..)']]) {
    await page.click(`${D} g.sym[data-id="${id}"] .hitbox`);
    await page.waitFor((d) => document.querySelector(`${d} [data-param=bits]`), [D], { what: `${id}: Pins per bit` });
    assert.equal(await label(), text);
    await page.fill(`${D} [data-param=width]`, '2');
    await page.waitFor((d) => document.querySelector(`${d} [data-param=bits]`) && !document.querySelector(`${d} [data-param=bits]`).disabled, [D], { what: 'enabled' });
    await page.click(`${D} [data-param=bits]`);
    await page.waitFor(async (i) => JSON.parse(await (await fetch('/api/projects/MuxBits/file?path=src%2Fmb.sch.json')).text()).symbols.find((s) => s.id === i).params.bits === true, [id], { what: `${id}: bits saved` });
    // two bodies, one select pin S0 and its line through both
    assert.equal(await page.eval((d, i) => document.querySelectorAll(`${d} .se-svg g.sym[data-id="${i}"] path.gate:not(.nofill)`).length, D, id), 2, id);
    assert.equal(await page.eval((d, i) => document.querySelectorAll(`${d} .se-svg g.sym[data-id="${i}"] path.gate.nofill`).length, D, id), 1, `${id}: the select's line`);
  }
  // the MUX's Select bits 2 (M4_1): still a pin per bit, two of them
  await page.click(`${D} g.sym[data-id="S1"] .hitbox`);
  await page.waitFor((d) => document.querySelector(`${d} [data-param=muxSel]`), [D], { what: 'Select bits' });
  await page.fill(`${D} [data-param=muxSel]`, '2');
  await page.waitFor(async () => JSON.parse(await (await fetch('/api/projects/MuxBits/file?path=src%2Fmb.sch.json')).text()).symbols[0].type === 'mux4', [], { what: 'M4_1 saved' });
  assert.deepEqual((await saved()).symbols.map((s) => [s.type, s.params.width, s.params.bits]), [['mux4', 2, true], ['demux', 2, true]]);
  assert.equal(await page.eval((d) => document.querySelectorAll(`${d} .se-svg g.sym[data-id="S1"] path.gate:not(.nofill)`).length, D), 2);
  // in Portuguese: the label
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.click(`${D} g.sym[data-id="S2"] .hitbox`);
  await page.waitFor((d) => document.querySelector(`${d} [data-param=bits]`), [D], { what: 'Portuguese' });
  assert.equal(await label(), 'Um pino por bit (D0.., O0_0..)');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.dialogs, []);
});
