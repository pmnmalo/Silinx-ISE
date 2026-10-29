// UI: Pins per bit in a symbol's properties enabled only for a Width of 2 or more (#2076): at Width 1 unticked, greyed,
// with its note (in Portuguese too); a Width of 2 enables it. Every symbol that has it: the gates (#2079), INV, BUF,
// BUFE, ADD, SUB, COMP, CNT. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc, SYMBOLS, defaultParams } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const D = '.doc:not([hidden])';
// (the palette's: a gate's variants, AND3B1…, as its 2-input one, #2079)
const TYPES = Object.keys(SYMBOLS).filter((t) => SYMBOLS[t].params?.some((p) => p.name === 'bits') && !SYMBOLS[t].hidden);

uiTest('#2076 schematic Properties: Pins per bit greyed at Width 1 (its note), enabled at Width 2, for every symbol that has it; Portuguese', E, async (page) => {
  assert.deepEqual(TYPES, ['and2', 'or2', 'nand2', 'nor2', 'xor2', 'xnor2', 'inv', 'buf', 'tbuf', 'add', 'sub', 'compare', 'counter']);
  const doc = newDoc('pb', 'vhdl');
  // (each saved with Pins per bit ticked at Width 1: shown unticked, it does nothing there)
  TYPES.forEach((type, i) => doc.symbols.push({ id: `S${i + 1}`, type, x: 100 + 200 * (i % 4), y: 100 + 250 * Math.floor(i / 4), rot: 0, mirror: false, name: `U${i + 1}`, params: { ...defaultParams(type), width: 1, bits: true } }));
  await makeProject(env, { name: 'BitsOn', files: { 'src/pb.sch.json': JSON.stringify(doc) } });
  await page.openProject('BitsOn');
  await page.eval(() => window.SilinxApp.openSch('src/pb.sch.json'));
  await page.waitFor((d, n) => document.querySelectorAll(`${d} .se-svg g.sym`).length === n, [D, TYPES.length], { what: 'drawn' });
  const box = () => page.eval((d) => { const b = document.querySelector(`${d} [data-param=bits]`); return [b.checked, b.disabled, b.closest('.se-field').querySelector('.se-note')?.textContent ?? null]; }, D);
  for (const [i, type] of TYPES.entries()) {
    await page.click(`${D} g.sym[data-id="S${i + 1}"] .hitbox`);
    await page.waitFor((d) => document.querySelector(`${d} [data-param=bits]`), [D], { what: `${type}: Pins per bit` });
    assert.deepEqual(await box(), [false, true, 'for a Width of 2 or more'], `${type} at Width 1`);
    await page.fill(`${D} [data-param=width]`, '2');
    await page.waitFor((d) => document.querySelector(`${d} [data-param=bits]`) && !document.querySelector(`${d} [data-param=bits]`).disabled, [D], { what: `${type}: enabled at Width 2` });
    assert.deepEqual(await box(), [true, false, null], `${type} at Width 2: its saved tick shown`);
  }
  // in Portuguese: the note
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.click(`${D} g.sym[data-id="S1"] .hitbox`);
  await page.fill(`${D} [data-param=width]`, '1');
  await page.waitFor((d) => document.querySelector(`${d} [data-param=bits]`)?.disabled, [D], { what: 'greyed again' });
  assert.deepEqual(await box(), [false, true, 'para uma Largura de 2 ou mais']);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.dialogs, []);
});
