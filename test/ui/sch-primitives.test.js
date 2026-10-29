// UI: the schematic library's Device Primitives (#791) — the palette's category of the project's family (a Basys2's
// Spartan-3E, a Nexys3's Spartan-6 after the device changes), a block RAM placed: its properties (its width, its
// attributes with their ranges), its Symbol Info with its count on the device and the schematic's use, its HDL; in
// Portuguese too.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';
import { newDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const ED = '.doc:not([hidden]) .sch-editor';
const DLG = `${ED} .se-symdoc`;
const palette = (page) => page.eval((sel) => [...document.querySelectorAll(`${sel} .se-symrow .nm`)].map((x) => x.textContent), ED);

uiTest('Device Primitives: the palette of the project\'s family, a RAMB16 placed (properties, Symbol Info with its count), the device changed, Portuguese', E, async (page) => {
  const doc = newDoc('mem', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'ramb16_s', x: 300, y: 200, rot: 0, mirror: false, name: 'U1', params: { portWidth: '9' } });
  doc.symbols.push({ id: 'S2', type: 'ramb16_s_s', x: 700, y: 200, rot: 0, mirror: false, name: 'U2', params: { widthA: '9', widthB: '18' } });
  await makeProject(env, { name: 'PrimPj', board: 'basys2', device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, files: { 'src/mem.sch.json': JSON.stringify(doc) } });
  await page.openProject('PrimPj');
  await page.eval(() => window.SilinxApp.openSch('src/mem.sch.json'));
  await page.waitFor((sel) => window.Silinx.active?.id === 'sch:src/mem.sch.json' && document.querySelector(`${sel} .se-symrow`), [ED]);

  // ---- the palette: the Spartan-3E's primitives, in their category
  assert.ok((await page.eval((sel) => [...document.querySelectorAll(`${sel} .se-cat option`)].map((o) => o.value), ED)).includes('Device Primitives'));
  await page.fill(`${ED} .se-cat`, 'Device Primitives');
  await page.waitFor((sel) => document.querySelector(`${sel} .se-cathead`)?.textContent === 'Device Primitives (7)', [ED], { what: 'the category' });
  assert.deepEqual(await palette(page), ['RAMB16_S', 'RAMB16_S_S', 'MULT18X18SIO', 'DCM_SP', 'BUFG', 'BUFGMUX', 'IBUFG']);
  await page.click(`${ED} .se-symrow`, { text: 'DCM_SP' });
  await page.key('Escape');
  await page.waitFor((sel) => /^DCM_SP: Digital Clock Manager: from its input clock CLKIN/.test(document.querySelector(`${sel} .se-syminfo`).textContent), [ED], { what: 'the info box' });

  // ---- the placed RAMB16_S9: its properties, its attributes with their ranges
  await page.click(`${ED} g.sym[data-id="S1"] .hitbox`);
  await page.waitFor((sel) => document.querySelector(`${sel} .se-props [data-param=WRITE_MODE]`), [ED], { what: 'the RAMB16_S9\'s properties' });
  assert.equal(await page.eval((sel) => document.querySelector(`${sel} .se-props .se-ptitle`).textContent, ED), 'RAMB16_S9 (RAMB16_S)');
  assert.deepEqual(await page.eval((sel) => [...document.querySelectorAll(`${sel} .se-props [data-param=WRITE_MODE] option`)].map((o) => o.value), ED), ['WRITE_FIRST', 'READ_FIRST', 'NO_CHANGE']);
  assert.equal(await page.eval((sel) => document.querySelector(`${sel} .se-props [data-param=INIT]`).closest('.se-field').querySelector('.se-note').textContent, ED), '9 bits, hexadecimal');
  // its width: RAMB16_S18, its INIT 18 bits
  await page.fill(`${ED} .se-props [data-param=portWidth]`, '18');
  await page.waitFor((sel) => document.querySelector(`${sel} .se-props .se-ptitle`)?.textContent === 'RAMB16_S18 (RAMB16_S)', [ED], { what: 'RAMB16_S18' });
  assert.equal(await page.eval((sel) => document.querySelector(`${sel} .se-props [data-param=INIT]`).closest('.se-field').querySelector('.se-note').textContent, ED), '18 bits, hexadecimal');
  assert.equal(await page.eval(() => window.Silinx.active.schEditor.getDoc().symbols[0].params.portWidth), '18');

  // ---- its Symbol Info (the Properties panel's button): its count on the device, the schematic's two block RAMs; no
  // truth table
  await page.click(`${ED} .se-props .se-infobtn`);
  await page.waitFor((d) => document.querySelector(d)?.dataset.type === 'ramb16_s', [DLG], { what: 'the RAMB16_S18 datasheet' });
  const paras = () => page.eval((d) => [...document.querySelectorAll(`${d} .sd-main p`)].map((p) => p.textContent), DLG);
  assert.match(await page.eval((d) => document.querySelector(`${d} .se-dhead`).textContent, DLG), /^Symbol Info: RAMB16_S18Category: Device Primitives/);
  assert.equal((await paras()).at(-1), 'Block RAM (18 Kb): 12 on this device (XC3S250E), 2 used in this schematic.');
  assert.deepEqual(await page.eval((d) => [...document.querySelectorAll(`${d} .sd-main h3`)].map((x) => x.textContent), DLG), ['Description', 'Pins', 'Parameters and attributes', 'Equivalent HDL']);
  assert.match(await page.eval((d) => document.querySelector(`${d} .sd-code`).textContent, DLG), /library UNISIM;[\s\S]*U1 : RAMB16_S18\n\s+generic map \(/);
  // ---- in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.waitFor((d) => /^Informação do Símbolo: RAMB16_S18/.test(document.querySelector(`${d} .se-dhead b`)?.textContent || ''), [DLG], { what: 'the PT datasheet' });
    assert.equal((await paras()).at(-1), 'RAM de bloco (18 Kb): 12 neste dispositivo (XC3S250E), 2 usado(s) neste esquemático.');
    assert.match((await paras())[0], /^RAM de bloco de 16 Kbit de dados e 2 Kbit de paridade/);
    assert.match(await page.eval((d) => document.querySelector(`${d} .se-dhead`).textContent, DLG), /Categoria: Primitivas do Dispositivo/);
    await page.key('Escape');
    await page.waitFor((d) => !document.querySelector(d), [DLG]);
    await page.waitFor((sel) => document.querySelector(`${sel} .se-cathead`)?.textContent === 'Primitivas do Dispositivo (7)', [ED], { what: 'the PT category' });
    await page.eval(TEXTS);
    const texts = () => page.eval((sel) => ['.se-left', '.se-props'].flatMap((p) => window.__uiTexts(document.querySelector(`${sel} ${p}`))), ED);
    const pt = await texts();
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
    await page.waitFor((sel) => document.querySelector(`${sel} .se-cathead`)?.textContent === 'Device Primitives (7)', [ED], { what: 'back in English' });
    const en = await texts();
    assert.ok(en.includes('Port width') && pt.includes('Largura do porto'));
    // (the attributes: their UNISIM names and values; the primitives' names)
    assert.deepEqual(untranslated(en, pt, [/^Flip-Flops$/, /^[A-Z][A-Z0-9_]*$/, /^\d/, /^RAMB16_S18 \(RAMB16_S\)$/, /^RAMB16_S/]), []);
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }

  // ---- the device changed to a Nexys3's Spartan-6: its primitives in the palette, a Spartan-3E one's Symbol Info says so
  await page.eval(async () => {
    const S = window.SilinxApp.S;
    S.project.board = 'nexys3';
    S.project.device = { family: 'spartan6', part: 'xc6slx16', package: 'csg324', speed: '-3' };
    await window.SilinxApp.saveProjectJson();
    await window.SilinxApp.reloadProject();
  });
  await page.eval(() => window.SilinxApp.openSch('src/mem.sch.json'));
  await page.fill(`${ED} .se-cat`, 'Device Primitives');
  await page.waitFor((sel) => document.querySelector(`${sel} .se-cathead`)?.textContent === 'Device Primitives (7)'
    && document.querySelector(`${sel} .se-symrow .nm`)?.textContent === 'RAMB8BWER', [ED], { what: 'the Spartan-6 primitives' });
  assert.deepEqual(await palette(page), ['RAMB8BWER', 'RAMB16BWER', 'DSP48A1', 'PLL_BASE', 'DCM_SP', 'BUFG', 'BUFIO2']);
  await page.click(`${ED} g.sym[data-id="S2"] .hitbox`);
  await page.key('F1');
  await page.waitFor((d) => document.querySelector(d)?.dataset.type === 'ramb16_s_s', [DLG], { what: 'the RAMB16_S9_S18 datasheet' });
  assert.equal((await paras()).at(-1), 'Not a primitive of this device\'s family (XC6SLX16): the design will not build for it.');
  await page.key('Escape');
  // a Spartan-6 primitive: its count on the XC6SLX16
  await page.rightClick(`${ED} .se-symrow`, { text: 'PLL_BASE' });
  await page.click('.menu-popup .mi', { text: 'Symbol Info…' });
  await page.waitFor((d) => document.querySelector(d)?.dataset.type === 'pll_base', [DLG], { what: 'the PLL_BASE datasheet' });
  assert.equal((await paras()).at(-1), 'PLLs: 2 on this device (XC6SLX16), 0 used in this schematic.');
  await page.key('Escape');
});

uiTest('#1122 schematic: a VCC and a GND of 8 bits drawn with a bus stem (as every symbol\'s bus pin), of 1 bit a thin one', E, async (page) => {
  const doc = newDoc('pw', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'vcc', x: 100, y: 100, params: { width: 8 } }, { id: 'S2', type: 'gnd', x: 200, y: 100, params: { width: 8 } },
    { id: 'S3', type: 'vcc', x: 300, y: 100, params: { width: 1 } }, { id: 'S4', type: 'gnd', x: 400, y: 100, params: { width: 1 } },
    { id: 'S5', type: 'and2', x: 500, y: 100, params: { width: 8 } });
  await makeProject(env, { name: 'PwPj', files: { 'src/pw.sch.json': JSON.stringify(doc) } });
  await page.openProject('PwPj');
  await page.eval(() => window.SilinxApp.openSch('src/pw.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 5, [ED], { what: 'drawn' });
  // the stem's (each VCC / GND's one lead) stroke width, and the 8-bit AND2's pins' (the bus width every symbol has)
  const widths = await page.eval((ed) => Object.fromEntries([...document.querySelectorAll(`${ed} svg .sym`)].map((g) => [g.dataset.id,
    [...g.querySelectorAll('line.pin')].map((l) => getComputedStyle(l).strokeWidth)])), ED);
  const busW = widths.S5[0];
  assert.ok(parseFloat(busW) > 2, `the AND2's bus pins: ${busW}`);
  assert.deepEqual([widths.S1, widths.S2], [[busW], [busW]], JSON.stringify(widths));
  assert.ok(parseFloat(widths.S3[0]) < 2 && parseFloat(widths.S4[0]) < 2, JSON.stringify(widths));
});
