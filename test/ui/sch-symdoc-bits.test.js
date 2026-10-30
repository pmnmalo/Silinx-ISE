// UI: Symbol Info of an M4_1 with a pin per bit (#2141): the dialog opens (it stayed empty), its drawing the three
// multiplexers, its pins each described with their bit; in Portuguese too. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const D = '.doc:not([hidden])';

uiTest('#2141 schematic: Symbol Info of M4_1 with pins per bit opens, its pins described with their bit; Portuguese', E, async (page) => {
  const doc = newDoc('sb', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'mux4', x: 100, y: 100, rot: 0, mirror: false, name: 'U1', params: { width: 3, bits: true, en: true } });
  await makeProject(env, { name: 'SymdocBits', files: { 'src/sb.sch.json': JSON.stringify(doc) } });
  await page.openProject('SymdocBits');
  await page.eval(() => window.SilinxApp.openSch('src/sb.sch.json'));
  await page.waitFor((d) => document.querySelectorAll(`${d} .se-svg g.sym`).length === 1, [D], { what: 'drawn' });
  const pins = () => page.eval((d) => Object.fromEntries([...document.querySelectorAll(`${d} .se-symdoc tr[data-pin]`)].map((r) => [r.dataset.pin, r.lastChild.textContent])), D);
  const open = async () => {
    await page.click(`${D} g.sym[data-id="S1"] .hitbox`);
    await page.waitFor((d) => document.querySelector(`${d} .se-props .se-infobtn`), [D], { what: 'its properties' });
    await page.click(`${D} .se-props .se-infobtn`);
    await page.waitFor((d) => document.querySelector(`${d} .se-symdoc`)?.dataset.type === 'mux4' && document.querySelectorAll(`${d} .se-symdoc tr[data-pin]`).length > 0, [D], { what: 'M4_1 datasheet' });
  };
  await open();
  // its drawing: M4_1 in each of the three multiplexers (#2122)
  assert.deepEqual(await page.eval((d) => [...document.querySelectorAll(`${d} .se-symdoc .stype`)].map((t) => t.textContent), D), ['M4_1E', 'M4_1E', 'M4_1E']);
  let p = await pins();
  assert.equal(Object.keys(p).length, 4 * 3 + 3 + 2 + 1, 'every pin: D0_0..D3_2, O0..O2, S1, S0, E');
  assert.equal(p.D2_1, 'Data input selected when S1 S0 = 10 (2) and E = 1 (bit 1)');
  assert.equal(p.O2, 'Output: the selected data input when E = 1, 0 when E = 0 (bit 2)');
  assert.equal(p.S1, 'Select, most significant bit (weight 2)');
  assert.ok(Object.values(p).every((f) => !/null|undefined/.test(f)), JSON.stringify(p));
  await page.key('Escape');
  await page.waitFor((d) => !document.querySelector(`${d} .se-symdoc`), [D], { what: 'datasheet closed' });
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await open();
  p = await pins();
  assert.equal(p.D2_1, 'Entrada de dados selecionada quando S1 S0 = 10 (2) e E = 1 (bit 1)');
  await page.key('Escape');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.dialogs, []);
});
