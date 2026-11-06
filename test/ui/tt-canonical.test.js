// UI: the Boolean Algebra editor's canonical forms (#2927): the canonical SOP (the sum of the minterms) and POS (the
// product of the maxterms) as full expressions, in the chosen notation, first, each with the list of its terms under
// it (Σm / ΠM, #2952) and its HDL logic tick box (#2951); then the minimal forms. A constant output; a table of 8 inputs, whose 256-term expressions wrap in the
// panel; in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const T = '.doc:not([hidden]) .tt-editor';
const table = (name, inputs, outputs, cols) => JSON.stringify({ version: 1, name, inputs, outputs, table: cols, exprs: {}, notes: '', form: 'sop', lang: 'vhdl' }, null, 2);
const open = async (page, file) => {
  await page.eval((f) => window.SilinxApp.openTt(f), file);
  await page.waitFor((f) => window.Silinx.active?.id === `tt:${f}` && document.querySelector('.doc:not([hidden]) .tt-editor .tt-canon'), [file], { what: 'truth table editor' });
};
/** The canonical rows: [class, label, expression, list] each. */
const canon = (page) => page.eval((t) => [...document.querySelectorAll(`${t} .tt-canon > div`)].map((d) => [d.className, d.querySelector('b').textContent, ...[...d.querySelectorAll('code')].map((c) => c.textContent)]), T);
const order = (page) => page.eval((t) => [...document.querySelectorAll(`${t} .tt-results > .tt-res`)].map((d) => d.classList[1]), T);

uiTest('#2927 #2952 Truth Table: the canonical SOP and POS in full, in the notation chosen, each with its list (Σm, ΠM); a constant; 8 inputs wrapped; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'TtCanon', files: {
    'src/m.bool.json': table('m', ['a', 'b', 'c'], ['f', 'z'], { f: '01X10X10', z: '00000000' }),
    'src/w.bool.json': table('w', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], ['y'], { y: '1'.repeat(255) + '0' }),
  } });
  await page.openProject('TtCanon');
  await open(page, 'src/m.bool.json');
  // the canonical forms first, then the minimal ones and the rest, as before
  assert.deepEqual((await order(page)).slice(0, 3), ['tt-canon', 'tt-sop', 'tt-pos']);
  // the / notation by default
  assert.deepEqual(await canon(page), [
    ['tt-canon-sop', 'Canonical SOP', 'f = /a./b.c + /a.b.c + a.b./c', 'f = Σm(1, 3, 6) + d(2, 5)'],
    ['tt-canon-pos', 'Canonical POS', 'f = (a + b + c).(/a + b + c).(/a + /b + /c)', 'f = ΠM(0, 4, 7) · D(2, 5)'],
  ]);
  // no row of the lists of their own (#2952); each canonical form its tick box (#2951), not ticked (least gates)
  assert.equal(await page.eval((t) => document.querySelectorAll(`${t} .tt-canon-minterms, ${t} .tt-canon-maxterms, ${t} .tt-canon-lists`).length, T), 0);
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-canon .tt-hdl`)].map((c) => c.checked), T), [false, false]);
  // the list under the expression: on a line of its own
  assert.ok(await page.eval((t) => { const [e, l] = document.querySelectorAll(`${t} .tt-canon-sop code`); return l.getBoundingClientRect().top >= e.getBoundingClientRect().bottom - 1; }, T));
  // another notation: the canonical forms follow it, the lists stay
  await page.fill(`${T} .tt-notation`, 'textbook');
  await page.waitFor((t) => document.querySelector(`${t} .tt-canon-sop code`)?.textContent === "f = a'·b'·c + a'·b·c + a·b·c'", [T], { what: 'textbook notation' });
  assert.deepEqual((await canon(page)).map((r) => r.slice(2)), [["f = a'·b'·c + a'·b·c + a·b·c'", 'f = Σm(1, 3, 6) + d(2, 5)'], ["f = (a + b + c)·(a' + b + c)·(a' + b' + c')", 'f = ΠM(0, 4, 7) · D(2, 5)']]);
  // a constant output: no minterm, the SOP is 0
  await page.click(`${T} .tt-tab[data-out=z]`);
  await page.waitFor((t) => document.querySelector(`${t} .tt-canon-sop code`)?.textContent === 'z = 0', [T], { what: 'output z' });
  assert.deepEqual((await canon(page)).map((r) => r.slice(2)), [['z = 0', 'z = Σm()'], ["z = (a + b + c)·(a + b + c')·(a + b' + c)·(a + b' + c')·(a' + b + c)·(a' + b + c')·(a' + b' + c)·(a' + b' + c')", 'z = ΠM(0, 1, 2, 3, 4, 5, 6, 7)']]);
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((t) => document.querySelector(`${t} .tt-canon-sop b`)?.textContent === 'Forma canónica SOP', [T], { what: 'Portuguese' });
  assert.deepEqual(await page.eval((t) => ['sop', 'pos'].map((k) => [document.querySelector(`${t} .tt-canon-${k} b`).textContent, document.querySelector(`${t} .tt-canon-${k}`).title]), T), [
    ['Forma canónica SOP', 'A soma dos mintermos: todas as entradas em todos os termos, sem as indiferenças'],
    ['Forma canónica POS', 'O produto dos maxtermos: todas as entradas em todos os termos, sem as indiferenças'],
  ]);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // 8 inputs: 255 minterms of 8 literals, one maxterm; the expressions wrap, the panel does not scroll sideways
  await open(page, 'src/w.bool.json');
  const w = await page.eval((t) => {
    const r = document.querySelector(`${t} .tt-results`), sop = document.querySelector(`${t} .tt-canon-sop code`);
    return { terms: sop.textContent.split(' + ').length, pos: document.querySelector(`${t} .tt-canon-pos code`).textContent,
      lines: sop.getClientRects().length, wide: r.scrollWidth - r.clientWidth,
      inside: [...r.querySelectorAll('.tt-canon code')].every((c) => c.getBoundingClientRect().right <= r.getBoundingClientRect().right + 1) };
  }, T);
  assert.equal(w.terms, 255);
  assert.equal(w.pos, "y = /a + /b + /c + /d + /e + /f + /g + /h");
  assert.ok(w.lines > 5, `the canonical SOP wraps (${w.lines} lines)`);
  assert.equal(w.wide, 0);
  assert.equal(w.inside, true);
  // nothing in the console but the project's opening
  assert.deepEqual((await page.consoleText()).split('\n').filter((l) => /error|warning/i.test(l)), []);
});
