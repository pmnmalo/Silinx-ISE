// UI: Symbol Info datasheets of the schematic editor — opened from the palette (right-click menu and
// the More… link of the info box), from a placed symbol (F1, toolbar button, Properties panel),
// parameters changed in the dialog (tables and HDL follow), and in Portuguese.
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
const waitTable = (page, kind) => page.waitFor((d, k) => { const b = document.querySelector(d); return b && (!k || b.dataset.table === k) && b.querySelector('.sd-truth'); }, [DLG, kind || null], { what: `truth table ${kind || ''}` });
const rows = (page, sel = `${DLG} .sd-truth tbody tr`) => page.eval((s) => [...document.querySelectorAll(s)].map((r) => [...r.cells].map((c) => c.textContent).join(' ')), sel);

uiTest('Symbol Info: palette menu and More… link, placed symbol (F1, toolbar, Properties), parameters, Portuguese', E, async (page) => {
  const doc = newDoc('info', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'fdce', x: 300, y: 200, rot: 0, mirror: false, name: 'U1', params: { init: '0' } });
  await makeProject(env, { name: 'InfoPj', files: { 'src/info.sch.json': JSON.stringify(doc) } });
  await page.openProject('InfoPj');
  await page.eval(() => window.SilinxApp.openSch('src/info.sch.json'));
  await page.waitFor((sel) => window.Silinx.active?.id === 'sch:src/info.sch.json' && document.querySelector(`${sel} .se-symrow`), [ED]);
  // nothing chosen yet: the toolbar button is disabled
  assert.equal(await page.eval((sel) => document.querySelector(`${sel} .se-btn[data-act=info]`).disabled, ED), true);

  // ---- palette: right-click M4_1 ▸ Symbol Info…
  await page.rightClick(`${ED} .se-symrow`, { text: 'M4_1' });
  await page.waitFor(() => document.querySelector('.menu-popup'), [], { what: 'palette context menu' });
  await page.click('.menu-popup .mi', { text: 'Symbol Info…' });
  await page.waitFor((d) => document.querySelector(d)?.dataset.type === 'mux4', [DLG], { what: 'M4_1 datasheet' });
  await waitTable(page, 'exhaustive');
  assert.match(await page.eval((d) => document.querySelector(`${d} .se-dhead b`).textContent, DLG), /^Symbol Info: M4_1$/);
  assert.match(await page.eval((d) => document.querySelector(`${d} .sd-main p`).textContent, DLG), /^The 4:1 multiplexer \(M4_1\) copies to its output the data input/);
  assert.deepEqual(await rows(page, `${DLG} .sd-pins tbody tr`), [
    'D0 input 1 Data input selected when S = 00 (0)', 'D1 input 1 Data input selected when S = 01 (1)', 'D2 input 1 Data input selected when S = 10 (2)',
    'D3 input 1 Data input selected when S = 11 (3)', 'S input 2 2-bit select: index of the data input that reaches O (S(1) = MSB)', 'O output 1 Output: the selected data input']);
  // compact truth table as in the Libraries Guide, the full one on request
  assert.equal((await rows(page)).length, 8);
  assert.equal((await rows(page))[1], '0 0 1 X X X 1');
  await page.click(`${DLG} .sd-switch [data-view=full]`);
  await page.waitFor((d) => document.querySelectorAll(`${d} .sd-truth tbody tr`).length === 64, [DLG], { what: 'full table' });
  // the symbol drawing and the equivalent HDL (project language first)
  assert.ok(await page.eval((d) => document.querySelectorAll(`${d} .sd-draw svg .gate`).length > 0, DLG));
  assert.match(await page.eval((d) => document.querySelector(`${d} .sd-code`).textContent, DLG), /entity M4_1 is[\s\S]*with S select O <=/);
  await page.click(`${DLG} .sd-tabs [data-lang=verilog]`);
  assert.match(await page.eval((d) => document.querySelector(`${d} .sd-code`).textContent, DLG), /module M4_1/);
  // change the width: pins become buses, the table is shown per bit, the HDL follows
  await page.fill(`${DLG} [data-param=width]`, '4');
  await page.waitFor((d) => document.querySelector(`${d} .sd-pins tbody tr td:nth-child(3)`)?.textContent === '4', [DLG], { what: 'width 4 in the pin table' });
  await waitTable(page, 'exhaustive');
  assert.match(await page.eval((d) => document.querySelector(`${d} .sd-ttbox`).textContent, DLG), /bitwise/);
  assert.match(await page.eval((d) => document.querySelector(`${d} .sd-code`).textContent, DLG), /input wire \[3:0\] D0/);
  await page.key('Escape');
  await page.waitFor((d) => !document.querySelector(d), [DLG], { what: 'dialog closed' });

  // ---- palette info box: first sentence + More…
  await page.click(`${ED} .se-symrow`, { text: 'D2_4E' });
  await page.waitFor((sel) => /^D2_4E: The 2:4 binary decoder \(Xilinx D2_4E\) activates exactly one of its 4 outputs/.test(document.querySelector(`${sel} .se-syminfo`).textContent), [ED], { what: 'info box' });
  assert.match(await page.eval((sel) => document.querySelector(`${sel} .se-syminfo`).textContent, ED), /More…$/);
  await page.key('Escape');      // stop placing
  await page.click(`${ED} .se-syminfo .se-more`);
  await page.waitFor((d) => document.querySelector(d)?.dataset.type === 'decoder', [DLG], { what: 'D2_4E datasheet' });
  await waitTable(page, 'exhaustive');
  assert.deepEqual(await page.eval((d) => [...document.querySelectorAll(`${d} .sd-truth thead tr:last-child th`)].map((c) => c.textContent), DLG), ['A1', 'A0', 'E', 'D3', 'D2', 'D1', 'D0']);
  assert.deepEqual(await rows(page), ['X X 0 0 0 0 0', '0 0 1 0 0 0 1', '0 1 1 0 0 1 0', '1 0 1 0 1 0 0', '1 1 1 1 0 0 0']);
  assert.match(await page.eval((d) => document.querySelector(`${d} .sd-xnames`).textContent, DLG), /D2_4E/);
  // 3 address bits: D3_8E, 9 rows
  await page.fill(`${DLG} [data-param=n]`, '3');
  await page.waitFor((d) => /D3_8E/.test(document.querySelector(`${d} .se-dhead b`).textContent), [DLG], { what: 'D3_8E' });
  await page.waitFor((d) => document.querySelectorAll(`${d} .sd-truth tbody tr`).length === 9, [DLG], { what: '9 rows' });
  await page.click(`${DLG} [data-act=close]`);
  await page.waitFor((d) => !document.querySelector(d), [DLG]);

  // ---- placed symbol: select it, F1
  await page.click(`${ED} g.sym[data-id="S1"] .hitbox`);
  await page.waitFor((sel) => document.querySelector(`${sel} .se-props .se-infobtn`), [ED], { what: 'properties of the FDCE' });
  assert.match(await page.eval((sel) => document.querySelector(`${sel} .se-props .se-sum`).textContent, ED), /^FDCE is a D flip-flop with clock enable and asynchronous clear/);
  assert.equal(await page.eval((sel) => document.querySelector(`${sel} .se-btn[data-act=info]`).disabled, ED), false);
  await page.key('F1');
  await page.waitFor((d) => document.querySelector(d)?.dataset.type === 'fdce', [DLG], { what: 'FDCE datasheet from F1' });
  assert.deepEqual(await rows(page, `${DLG} .sd-mode tbody tr`), ['1 X X X 0', '0 0 X X No change', '0 1 0 ↑ 0', '0 1 1 ↑ 1']);
  assert.match(await page.eval((d) => document.querySelector(`${d} .sd-code`).textContent, DLG), /if CLR = '1' then/);
  // INIT changed in the dialog: the placed symbol keeps its value
  await page.fill(`${DLG} [data-param=init]`, '1');
  await page.waitFor((d) => /Q : out std_logic := '1'/.test(document.querySelector(`${d} .sd-code`).textContent), [DLG], { what: 'INIT 1 in the HDL' });
  assert.equal(await page.eval(() => window.Silinx.active.schEditor.getDoc().symbols[0].params.init), '0');

  // ---- Portuguese: the open datasheet follows the language
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((d) => /^Informação do Símbolo: FDCE$/.test(document.querySelector(`${d} .se-dhead b`)?.textContent || ''), [DLG], { what: 'PT datasheet' });
  assert.deepEqual(await page.eval((d) => [...document.querySelectorAll(`${d} .sd-main h3`)].map((x) => x.textContent), DLG), ['Descrição', 'Pinos', 'Parâmetros e atributos', 'Tabela de modos', 'HDL equivalente']);
  assert.match(await page.eval((d) => document.querySelector(`${d} .sd-main p`).textContent, DLG), /^FDCE é uma báscula \(flip-flop\) D com habilitação do relógio e clear assíncrono/);
  assert.deepEqual(await rows(page, `${DLG} .sd-mode tbody tr`), ['1 X X X 0', '0 0 X X Sem alteração', '0 1 0 ↑ 0', '0 1 1 ↑ 1']);
  assert.equal(await page.eval((d) => document.querySelector(`${d} [data-param=init]`).value, DLG), '1', 'the parameters are kept');
  await page.key('Escape');
  await page.waitFor((d) => !document.querySelector(d), [DLG]);
  // toolbar button, in Portuguese, with a palette symbol from the info box
  assert.equal(await page.eval((sel) => document.querySelector(`${sel} .se-btn[data-act=info]`).title, ED), 'Informação do Símbolo (F1)');
  await page.click(`${ED} .se-props .se-infobtn`);
  await page.waitFor((d) => document.querySelector(d)?.dataset.lang === 'pt' && document.querySelector(d)?.dataset.type === 'fdce', [DLG], { what: 'datasheet from the Properties panel' });
  await page.key('Escape');
  await page.click(`${ED} .se-canvas`);
  await page.key('Escape');      // clear the selection
  await page.fill(`${ED} .se-search`, 'adder');      // (a row scrolled under a sticky category header cannot be clicked)
  await page.click(`${ED} .se-symrow`, { text: 'ADD' });
  await page.key('Escape');
  await page.waitFor((sel) => /^ADD: ADD é um somador binário de 8 bits/.test(document.querySelector(`${sel} .se-syminfo`).textContent), [ED], { what: 'PT info box' });
  assert.match(await page.eval((sel) => document.querySelector(`${sel} .se-syminfo`).textContent, ED), /Mais…$/);
  await page.click(`${ED} .se-btn[data-act=info]`);
  await page.waitFor((d) => document.querySelector(d)?.dataset.type === 'add', [DLG], { what: 'ADD datasheet' });
  await waitTable(page, 'samples');
  assert.match(await page.eval((d) => document.querySelector(`${d} .sd-ttbox`).textContent, DLG), /Linhas representativas|linhas representativas/);
  assert.match(await page.eval((d) => document.querySelector(`${d} .sd-main h3:nth-of-type(4)`).textContent, DLG), /Tabela de verdade/);
  // no untranslated label in the editor panels around it
  await page.eval(TEXTS);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  const texts = () => page.eval((sel) => ['.se-toolbar', '.se-syminfo', '.se-props'].flatMap((p) => window.__uiTexts(document.querySelector(`${sel} ${p}`))), ED);
  const pt = await texts();
  await setLang('en');
  const en = await texts();
  assert.ok(en.includes('More…') && pt.includes('Mais…'));
  assert.deepEqual(untranslated(en, pt, [/symbols?, \d+ nets/, /^@schematic$/]), []);
  await page.waitFor((d) => /^Symbol Info: ADD$/.test(document.querySelector(`${d} .se-dhead b`)?.textContent || ''), [DLG], { what: 'back in English' });
});
