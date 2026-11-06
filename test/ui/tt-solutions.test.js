// UI: the Boolean Algebra editor's minimal solutions (#2928): a minimal SOP or POS with several shows "Solution 1 of N"
// beside its note, previous / next (round) change its expression, its cost, its circuit and its groups on the flat and
// 3D Karnaugh maps; the NAND form (the HDL's) keeps the first; "Many" at the cap, its first 64 browsed; printed as
// shown, without the buttons; in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { capturePrints, confirmPrint, printed } from './print-helpers.js';
import { newTable } from '../../core/logic.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const T = '.doc:not([hidden]) .tt-editor';

const table = (name, inputs, f) => JSON.stringify({ ...newTable(name, inputs, ['f']), table: { f }, lang: 'vhdl' });
/** What the editor shows of a form (sop, pos): its expression, cost, circuit, notes and selector; the map's groups. */
const shownOf = (page, f) => page.eval((t, f) => {
  const r = document.querySelector(`${t} .tt-res.tt-${f}`);
  const q = s => r.querySelector(s)?.textContent ?? null;
  return {
    expr: q('.tt-expr'), cost: q('.tt-cost'), circuit: q('.tt-circuit'), notes: [...r.querySelectorAll('.tt-note')].map(n => n.textContent),
    sol: q('.tt-sol-n'), groups: [...document.querySelectorAll(`${t} .tt-legend .tt-leg code`)].map(c => c.textContent),
    nand: document.querySelector(`${t} .tt-res.tt-nand .tt-expr`).textContent,
  };
}, T, f);
// (centred first: at the column's bottom edge its horizontal scroll bar may cover it)
const solClick = async (page, which) => {
  await page.eval((t, w) => document.querySelector(`${t} .tt-res.tt-sop .tt-sol-${w}`).scrollIntoView({ block: 'center' }), T, which);
  await page.click(`${T} .tt-res.tt-sop .tt-sol-${which}`);
};
const open = async (page, p) => {
  await page.eval((p) => window.SilinxApp.openTt(p), p);
  await page.waitFor((p) => window.Silinx.active?.id === `tt:${p}` && document.querySelector('.doc:not([hidden]) .tt-kmap'), [p], { what: p });
};

uiTest('#2928 several minimal solutions: browsed with previous / next, the expression, cost, circuit and K-map groups follow, the NAND form keeps the first; printed as shown; Portuguese', E, async (page) => {
  // the cyclic chart Σm(0,1,2,5,6,7): two minimal SOPs; its POS one
  await makeProject(env, { name: 'TtSol', files: { 'src/cyc.bool.json': table('cyc', ['a', 'b', 'c'], '11100111') } });
  await page.openProject('TtSol');
  await capturePrints(page);
  await open(page, 'src/cyc.bool.json');
  const s1 = await shownOf(page, 'sop');
  assert.deepEqual([s1.expr, s1.notes, s1.sol], ['f = /a./b + b./c + a.c', ['2 minimal solutions exist.'], 'Solution 1 of 2']);
  assert.deepEqual(s1.groups, ['/a./b', 'b./c', 'a.c'], 'the map\'s groups: the first solution');
  assert.equal(s1.cost, '3 term(s), 6 literal(s); gates: 3 AND, 1 OR, 3 NOT (9 gate inputs)');
  const pos = await shownOf(page, 'pos');
  assert.deepEqual([pos.notes, pos.sol], [[], null], 'one minimal POS: no selector');
  const groupCells = () => page.eval((t) => [...document.querySelectorAll(`${t} svg.tt-kmap .tt-group`)].map(g => `${g.getAttribute('data-term')}:${g.getAttribute('x')},${g.getAttribute('y')},${g.getAttribute('width')},${g.getAttribute('height')}`).join(' '), T);
  const flat1 = await groupCells();
  // next: the second solution, its groups
  await solClick(page, 'next');
  const s2 = await shownOf(page, 'sop');
  assert.deepEqual([s2.expr, s2.sol, s2.notes], ['f = /a./c + /b.c + a.b', 'Solution 2 of 2', ['2 minimal solutions exist.']]);
  assert.deepEqual(s2.groups, ['/a./c', '/b.c', 'a.b']);
  assert.equal(s2.cost, s1.cost);
  assert.equal(s2.circuit, s1.circuit);
  assert.notEqual(await groupCells(), flat1, 'the flat map\'s groups changed');
  assert.equal(s2.nand, s1.nand, 'the NAND form (the HDL\'s) keeps the first solution');
  // the notation kept the choice; POS groups on the map: the POS's
  await page.eval((t) => { const s = document.querySelector(`${t} .tt-notation`); s.value = 'compact'; s.dispatchEvent(new Event('change')); }, T);
  assert.equal((await shownOf(page, 'sop')).expr, "f = a'c' + b'c + ab");
  await page.eval((t) => { const s = document.querySelector(`${t} .tt-notation`); s.value = 'slash'; s.dispatchEvent(new Event('change')); }, T);
  // printed as shown: the second solution, "Solution 2 of 2", not its buttons
  await page.click('#toolbar .tb-btn[data-cmd=print]');
  await confirmPrint(page);
  const html = await printed(page, 1), body = html.slice(html.indexOf('<main'));
  assert.ok(body.includes('f = /a./c + /b.c + a.b'), 'the solution shown');
  assert.ok(body.includes('<span class="tt-sol-n">Solution 2 of 2</span>'), 'its number');
  assert.ok(!body.includes('tt-sol-btn'), 'not its buttons');
  // round: next again is the first; previous is the last
  await solClick(page, 'next');
  assert.deepEqual([(await shownOf(page, 'sop')).sol, await groupCells()], ['Solution 1 of 2', flat1]);
  await solClick(page, 'prev');
  assert.equal((await shownOf(page, 'sop')).sol, 'Solution 2 of 2');
  // a cell changed: the table analysed again, the first solution shown
  await page.click(`${T} .tt-cell[data-out=f][data-row="3"]`);
  await page.click(`${T} .tt-cell[data-out=f][data-row="3"]`);
  await page.click(`${T} .tt-cell[data-out=f][data-row="3"]`);
  assert.equal((await shownOf(page, 'sop')).sol, 'Solution 1 of 2');
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  const pt = await page.eval((t) => { const r = document.querySelector(`${t} .tt-res.tt-sop`); return [r.querySelector('.tt-note').textContent, r.querySelector('.tt-sol-n').textContent, r.querySelector('.tt-sol-prev').title, r.querySelector('.tt-sol-next').title]; }, T);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(pt, ['Existem 2 soluções mínimas.', 'Solução 1 de 2', 'Solução anterior', 'Solução seguinte']);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});

uiTest('#2928 the cap: "Many" minimal solutions, the first 64 browsed; the 3D map\'s groups follow the solution', E, async (page) => {
  await makeProject(env, { name: 'TtMany', files: { 'src/many.bool.json': table('many', ['a', 'b', 'c', 'd', 'e'], '0X1X1X1X1101XXX0X11XX0X0X1X0011X') } });
  await page.openProject('TtMany');
  await open(page, 'src/many.bool.json');
  const s1 = await shownOf(page, 'sop');
  assert.deepEqual([s1.notes, s1.sol], [['Many minimal solutions exist; the first 64 can be browsed.'], 'Solution 1 of 64']);
  await solClick(page, 'prev');
  const s64 = await shownOf(page, 'sop');
  assert.equal(s64.sol, 'Solution 64 of 64');
  assert.notDeepEqual(s64.groups, s1.groups);
  assert.equal(s64.cost.replace(/;.*/, ''), s1.cost.replace(/;.*/, ''), 'as many terms and literals');
  // the 3D map: its groups those of the solution shown
  await page.eval(() => document.querySelector('.doc:not([hidden]) .tt-k3d-on').click());
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .tt-k3d-group'), [], { what: 'the 3D map' });
  const solids = () => page.eval((t) => [...new Set([...document.querySelectorAll(`${t} .tt-k3d-group`)].map(g => `${g.dataset.term}:${g.dataset.cells}`))].sort().join(' '), T);
  const g64 = await solids();
  await solClick(page, 'next');
  assert.equal((await shownOf(page, 'sop')).sol, 'Solution 1 of 64');
  assert.ok(await page.eval(() => !!document.querySelector('.doc:not([hidden]) .tt-k3d-group')), 'still in 3D');
  assert.notEqual(await solids(), g64, 'the 3D groups changed');
  await page.eval(() => document.querySelector('.doc:not([hidden]) .tt-k3d-on').click());
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});
