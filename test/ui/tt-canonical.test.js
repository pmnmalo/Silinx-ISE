// UI: the Boolean Algebra editor's canonical forms (#2927): the canonical SOP (the sum of the minterms) and POS (the
// product of the maxterms) as full expressions, in the chosen notation, after the least gates / delay and the minimal
// forms (#3065), each the list of its terms (Σm / ΠM, #2952) first, its full expression under it (#3069), its terms,
// literals, gates and circuit (#3072), with its HDL logic tick box (#2951), the two spaced as the other results (#3071). A constant
// output; a table of 8 inputs, whose 256-term expressions wrap in the panel; in Portuguese (SdP and PdS, #3066).
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
// (each form: its class, its name, its full expression, its list)
const canon = (page) => page.eval((t) => [...document.querySelectorAll(`${t} .tt-canon > div`)].map((d) => [d.className, d.querySelector('b').textContent, d.querySelector('.tt-expr').textContent, d.querySelector('.tt-canon-list').textContent]), T);
/** The list beside the form's name, its full expression under it (#3069): the codes in that order, each on its own line. */
const listFirst = (page) => page.eval((t) => [...document.querySelectorAll(`${t} .tt-canon > div`)].map((d) => {
  const [a, b] = [...d.querySelectorAll('code')], name = d.querySelector('b').getBoundingClientRect();
  return [a.className, b.className, Math.abs(a.getBoundingClientRect().top - name.top) < 4, b.getBoundingClientRect().top >= a.getBoundingClientRect().bottom - 1];
}), T);
const order = (page) => page.eval((t) => [...document.querySelectorAll(`${t} .tt-results > .tt-res`)].map((d) => d.classList[1]), T);

uiTest('#2927 #2952 Truth Table: the canonical SOP and POS in full, in the notation chosen, each with its list (Σm, ΠM); a constant; 8 inputs wrapped; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'TtCanon', files: {
    'src/m.bool.json': table('m', ['a', 'b', 'c'], ['f', 'z'], { f: '01X10X10', z: '00000000' }),
    'src/w.bool.json': table('w', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], ['y'], { y: '1'.repeat(255) + '0' }),
  } });
  await page.openProject('TtCanon');
  await open(page, 'src/m.bool.json');
  // the least gates and delay first, the minimal forms, then the canonical ones, then the rest (#3065)
  assert.deepEqual((await order(page)).slice(0, 5), ['tt-gates', 'tt-delay', 'tt-sop', 'tt-pos', 'tt-canon']);
  // the / notation by default
  assert.deepEqual(await canon(page), [
    ['tt-canon-sop', 'Canonical SOP', 'f = /a./b.c + /a.b.c + a.b./c', 'f = Σm(1, 3, 6) + d(2, 5)'],
    ['tt-canon-pos', 'Canonical POS', 'f = (a + b + c).(/a + b + c).(/a + /b + /c)', 'f = ΠM(0, 4, 7) · D(2, 5)'],
  ]);
  assert.deepEqual(await listFirst(page), [['tt-canon-list', 'tt-expr', true, true], ['tt-canon-list', 'tt-expr', true, true]], 'the list first, the expression under it (#3069)');
  // their terms, literals, gates and circuit, as the minimal forms' (#3072)
  assert.deepEqual(await page.eval((t) => ['sop', 'pos'].map((k) => [document.querySelector(`${t} .tt-canon-${k} .tt-cost`)?.textContent, document.querySelector(`${t} .tt-canon-${k} .tt-circuit`)?.textContent]), T), [
    ['3 term(s), 9 literal(s); gates: 3 AND, 1 OR, 3 NOT (12 gate inputs)', 'As a circuit: 7 gate(s), delay 3'],
    ['3 term(s), 9 literal(s); gates: 1 AND, 3 OR, 3 NOT (12 gate inputs)', 'As a circuit: 7 gate(s), delay 3'],
  ]);
  // Canonical SOP and POS spaced as the other results (#3071): as Minimal SOP and Minimal POS
  const gaps = await page.eval((t) => {
    const r = (s) => document.querySelector(`${t} ${s}`).getBoundingClientRect();
    return [Math.round(r('.tt-canon-pos').top - r('.tt-canon-sop').bottom), Math.round(r('.tt-res.tt-pos').top - r('.tt-res.tt-sop').bottom)];
  }, T);
  assert.ok(Math.abs(gaps[0] - gaps[1]) <= 1, `the canonical forms ${gaps[0]} px apart, the minimal ones ${gaps[1]}`);
  // no row of the lists of their own (#2952); each canonical form its tick box (#2951), not ticked (least gates)
  assert.equal(await page.eval((t) => document.querySelectorAll(`${t} .tt-canon-minterms, ${t} .tt-canon-maxterms, ${t} .tt-canon-lists`).length, T), 0);
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-canon .tt-hdl`)].map((c) => c.checked), T), [false, false]);
  // the expression under the list: on a line of its own (#3069)
  assert.ok(await page.eval((t) => { const [l, e] = document.querySelectorAll(`${t} .tt-canon-sop code`); return e.getBoundingClientRect().top >= l.getBoundingClientRect().bottom - 1; }, T));
  // another notation: the canonical forms follow it, the lists stay
  await page.fill(`${T} .tt-notation`, 'textbook');
  await page.waitFor((t) => document.querySelector(`${t} .tt-canon-sop .tt-expr`)?.textContent === "f = a'·b'·c + a'·b·c + a·b·c'", [T], { what: 'textbook notation' });
  assert.deepEqual((await canon(page)).map((r) => r.slice(2)), [["f = a'·b'·c + a'·b·c + a·b·c'", 'f = Σm(1, 3, 6) + d(2, 5)'], ["f = (a + b + c)·(a' + b + c)·(a' + b' + c')", 'f = ΠM(0, 4, 7) · D(2, 5)']]);
  // a constant output: no minterm, the SOP is 0
  await page.click(`${T} .tt-tab[data-out=z]`);
  await page.waitFor((t) => document.querySelector(`${t} .tt-canon-sop .tt-expr`)?.textContent === 'z = 0', [T], { what: 'output z' });
  assert.deepEqual((await canon(page)).map((r) => r.slice(2)), [['z = 0', 'z = Σm()'], ["z = (a + b + c)·(a + b + c')·(a + b' + c)·(a + b' + c')·(a' + b + c)·(a' + b + c')·(a' + b' + c)·(a' + b' + c')", 'z = ΠM(0, 1, 2, 3, 4, 5, 6, 7)']]);
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((t) => document.querySelector(`${t} .tt-canon-sop b`)?.textContent === 'Forma canónica SdP', [T], { what: 'Portuguese' });
  assert.deepEqual(await page.eval((t) => ['sop', 'pos'].map((k) => [document.querySelector(`${t} .tt-canon-${k} b`).textContent, document.querySelector(`${t} .tt-canon-${k}`).title]), T), [
    ['Forma canónica SdP', 'A soma dos mintermos: todas as entradas em todos os termos, sem as indiferenças'],
    ['Forma canónica PdS', 'O produto dos maxtermos: todas as entradas em todos os termos, sem as indiferenças'],
  ]);
  // SdP (soma de produtos) and PdS (produto de somas), not SOP and POS (#3066): the minimal forms, the map's groups, the tips
  assert.deepEqual(await page.eval((t) => [
    ...['sop', 'pos'].map((k) => document.querySelector(`${t} .tt-res.tt-${k} b`).textContent),
    ...[...document.querySelectorAll(`${t} .tt-groups input[type=radio]`)].map((r) => r.closest('label').textContent.trim()),
    document.querySelector(`${t} .tt-res.tt-nand`).title, document.querySelector(`${t} .tt-res.tt-nor`).title,
  ], T), ['SdP mínima', 'PdS mínimo', 'Grupos SdP (1s)', 'Grupos PdS (0s)',
    'A SdP mínima só com portas NAND (dupla negação); um inversor é uma NAND com as entradas ligadas, /(a·a)', 'O PdS mínimo só com portas NOR (dupla negação); um inversor é uma NOR com as entradas ligadas, /(a + a)']);
  assert.doesNotMatch(await page.eval((t) => document.querySelector(t).innerText, T), /\b(SOP|POS)\b/, 'no SOP nor POS left');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // 8 inputs: 255 minterms of 8 literals, one maxterm; the expressions wrap, the panel does not scroll sideways
  await open(page, 'src/w.bool.json');
  const w = await page.eval((t) => {
    const r = document.querySelector(`${t} .tt-results`), sop = document.querySelector(`${t} .tt-canon-sop .tt-expr`);
    return { terms: sop.textContent.split(' + ').length, pos: document.querySelector(`${t} .tt-canon-pos .tt-expr`).textContent,
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
