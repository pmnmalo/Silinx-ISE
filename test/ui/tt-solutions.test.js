// UI: the Boolean Algebra editor's minimal solutions (#2928): a minimal SOP or POS with several has its selector in the
// Karnaugh map's section, for the groups the map shows (#2950): previous / next (round), "N minimal solutions exist." its tip (#3077),
// "Solution 2 of N" (there only, not in the results, #3060); the solution chosen is the one used: its expression, cost, circuit, NAND / NOR form, the map's groups
// (flat, 3D, the cylinder, #2925; in either variable order, #2924), saved in the table and in its HDL module; a cell changed: the first again; "Many" at the cap, its first
// 64 browsed; printed as shown; Undo; in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { capturePrints, confirmPrint, printed } from './print-helpers.js';
import { newTable, normalizeTable, generateTableHdl } from '../../core/logic.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const T = '.doc:not([hidden]) .tt-editor';

const table = (name, inputs, f, more = {}) => normalizeTable({ ...newTable(name, inputs, ['f']), table: { f }, ...more });
/** What the editor shows: the minimal SOP's (or POS's) expression, cost, circuit, notes; the map's selector; its groups; the NAND form. */
const shownOf = (page, f = 'sop') => page.eval((t, f) => {
  const r = document.querySelector(`${t} .tt-res.tt-${f}`), q = (e, s) => e.querySelector(s)?.textContent ?? null;
  const k = document.querySelector(`${t} .tt-kmap-host`);
  return {
    expr: q(r, '.tt-expr'), cost: q(r, '.tt-cost'), circuit: q(r, '.tt-circuit'), notes: [...r.querySelectorAll('.tt-note')].map(n => n.textContent),
    count: k.querySelector('.tt-sol-n')?.title ?? null, shownCount: /exist/.test(k.textContent), sol: q(k, '.tt-sol-n'), inResults: !!r.querySelector('.tt-sol-btn'),
    groups: [...document.querySelectorAll(`${t} .tt-legend .tt-leg code`)].map(c => c.textContent),
    nand: document.querySelector(`${t} .tt-res.tt-nand .tt-expr`).textContent,
  };
}, T, f);
// (centred first: at the column's bottom edge its horizontal scroll bar may cover it)
const solClick = async (page, which) => {
  await page.eval((t, w) => document.querySelector(`${t} .tt-kmap-host .tt-sol-${w}`).scrollIntoView({ block: 'center' }), T, which);
  await page.click(`${T} .tt-kmap-host .tt-sol-${which}`);
};
const open = async (page, p) => {
  await page.eval((p) => window.SilinxApp.openTt(p), p);
  await page.waitFor((p) => window.Silinx.active?.id === `tt:${p}` && document.querySelector('.doc:not([hidden]) .tt-kmap'), [p], { what: p });
};
const groupRects = (page) => page.eval((t) => [...document.querySelectorAll(`${t} svg.tt-kmap .tt-group`)].map(g => `${g.getAttribute('data-term')}:${g.getAttribute('x')},${g.getAttribute('y')},${g.getAttribute('width')},${g.getAttribute('height')}`).join(' '), T);
const model = (page) => page.eval(() => window.Silinx.active.ttEditor.getModel());

uiTest('#2950 several minimal solutions: the selector on the Karnaugh map; the one chosen used (results, NAND form, groups, the table and its HDL); a cell changed: the first; printed; Undo; Portuguese', E, async (page) => {
  // the cyclic chart Σm(0,1,2,5,6,7): two minimal SOPs, one POS; in minimal SOP, its module linked
  const doc = table('cyc', ['a', 'b', 'c'], '11100111', { form: 'sop', generatedFile: 'src/cyc.vhd' });
  await makeProject(env, { name: 'TtSol', files: { 'src/cyc.bool.json': JSON.stringify(doc, null, 2), 'src/cyc.vhd': generateTableHdl(doc, 'vhdl', { source: 'cyc.bool.json' }).code } });
  await page.openProject('TtSol');
  await capturePrints(page);
  await open(page, 'src/cyc.bool.json');
  const s1 = await shownOf(page);
  assert.deepEqual([s1.expr, s1.count, s1.sol, s1.notes, s1.inResults, s1.shownCount], ['f = /a./b + b./c + a.c', '2 minimal solutions exist.', 'Solution 1 of 2', [], false, false]);
  assert.deepEqual(s1.groups, ['/a./b', 'b./c', 'a.c'], 'the map\'s groups: the first solution');
  assert.equal(s1.cost, '3 term(s), 6 literal(s); gates: 3 AND, 1 OR, 3 NOT (9 gate inputs)');
  const flat1 = await groupRects(page);
  // next: the second solution, used: its groups, its NAND form, the table, its module
  await solClick(page, 'next');
  const s2 = await shownOf(page);
  assert.deepEqual([s2.expr, s2.sol, s2.notes, s2.count], ['f = /a./c + /b.c + a.b', 'Solution 2 of 2', [], '2 minimal solutions exist.']);
  assert.deepEqual(s2.groups, ['/a./c', '/b.c', 'a.b']);
  assert.deepEqual([s2.cost, s2.circuit], [s1.cost, s1.circuit]);
  assert.notEqual(await groupRects(page), flat1, 'the flat map\'s groups changed');
  assert.notEqual(s2.nand, s1.nand, 'the NAND form of the solution used');
  assert.deepEqual((await model(page)).solutions, { f: { sop: 1 } });
  await page.waitFor(async (p) => /f <= \(not a and not c\) or \(not b and c\) or \(a and b\);/.test(await (await fetch(`/api/projects/TtSol/file?path=${encodeURIComponent(p)}`)).text()), ['src/cyc.vhd'], { what: 'the module in solution 2', timeout: 15000 });
  assert.deepEqual(JSON.parse(await readWs(env, 'TtSol', 'src/cyc.bool.json')).solutions, { f: { sop: 1 } });
  assert.match(await readWs(env, 'TtSol', 'src/cyc.vhd'), /\(minimal SOP \(solution 2 of 2\), 6 literal\(s\)/);
  // printed as shown: the second solution and its number, not the map's selector
  await page.click('#toolbar .tb-btn[data-cmd=print]');
  await confirmPrint(page);
  const html = await printed(page, 1), body = html.slice(html.indexOf('<main'));
  assert.ok(body.includes('f = /a./c + /b.c + a.b'), 'the solution used');
  assert.match(body, /<span class="tt-sol-n"[^>]*>Solution 2 of 2<\/span>/, 'its number, the map\'s');
  assert.ok(!/minimal solutions exist\.</.test(body), 'not the count (#3077)');
  assert.ok(!body.includes('tt-sol-of'), 'not in the results (#3060)');
  assert.ok(!body.includes('tt-sol-btn'), 'not the selector\'s buttons');
  // with the map's variable order (#2924): the selector and the solution used kept, the groups drawn in that order
  await page.fill(`${T} .tt-kmap-order`, 'rows');
  assert.deepEqual([(await shownOf(page)).sol, (await shownOf(page)).groups], ['Solution 2 of 2', ['/a./c', '/b.c', 'a.b']]);
  await page.fill(`${T} .tt-kmap-order`, 'cols');
  // on the cylinder (3D, #2925): its groups those of the solution used, and they follow the selector
  await page.eval(() => document.querySelector('.doc:not([hidden]) .tt-groups .tt-k3d-on').click());
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .tt-ks-group'), [], { what: 'the cylinder' });
  const surf = () => page.eval((t) => [...new Set([...document.querySelectorAll(`${t} .tt-ks-group`)].map(g => `${g.dataset.term}:${g.dataset.cells}`))].sort().join(' '), T);
  const c2 = await surf();
  assert.equal((await shownOf(page)).sol, 'Solution 2 of 2', 'the selector beside the 3D box');
  await solClick(page, 'next');
  assert.ok(await page.eval(() => !!document.querySelector('.doc:not([hidden]) .tt-ks-group')), 'still on the cylinder');
  const c1 = await surf();
  assert.notEqual(c1, c2, 'the cylinder\'s groups changed');
  assert.deepEqual(c1.split(' ').map(x => x.split(':')[1]).sort(), ['0,1', '2,6', '5,7'], 'the first solution\'s groups: a\'b\', bc\', ac');
  await solClick(page, 'next');
  assert.equal(await surf(), c2);
  await page.eval(() => document.querySelector('.doc:not([hidden]) .tt-groups .tt-k3d-on').click());
  // the POS groups on the map: one solution, no selector; back to the SOP's
  await page.click(`${T} .tt-groups input[value=pos]`);
  assert.equal((await shownOf(page)).sol, null);
  await page.click(`${T} .tt-groups input[value=sop]`);
  // round: next again is the first; previous the last; Undo / Redo
  await solClick(page, 'next');
  assert.deepEqual([(await shownOf(page)).sol, await groupRects(page), (await model(page)).solutions], ['Solution 1 of 2', flat1, undefined]);
  await solClick(page, 'prev');
  assert.equal((await shownOf(page)).sol, 'Solution 2 of 2');
  await page.eval(() => window.Silinx.active.ttEditor.undo());
  assert.equal((await shownOf(page)).sol, 'Solution 1 of 2');
  await page.eval(() => window.Silinx.active.ttEditor.redo());
  assert.equal((await shownOf(page)).sol, 'Solution 2 of 2');
  // a cell changed: its first solution again (three clicks: the same column)
  for (let i = 0; i < 3; i++) await page.click(`${T} .tt-cell[data-out=f][data-row="3"]`);
  assert.deepEqual([(await shownOf(page)).sol, (await model(page)).solutions], ['Solution 1 of 2', undefined]);
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  const pt = await page.eval((t) => { const k = document.querySelector(`${t} .tt-kmap-host`); return [k.querySelector('.tt-sol-n').title, k.querySelector('.tt-sol-n').textContent, k.querySelector('.tt-sol-prev').title, k.querySelector('.tt-sol-next').title]; }, T);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(pt, ['Existem 2 soluções mínimas.', 'Solução 1 de 2', 'Solução anterior', 'Solução seguinte']);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});

uiTest('#2928 #2950 the cap: "Many" minimal solutions, the first 64 browsed; the 3D map\'s groups follow the solution', E, async (page) => {
  await makeProject(env, { name: 'TtMany', files: { 'src/many.bool.json': JSON.stringify(table('many', ['a', 'b', 'c', 'd', 'e'], '0X1X1X1X1101XXX0X11XX0X0X1X0011X'), null, 2) } });
  await page.openProject('TtMany');
  await open(page, 'src/many.bool.json');
  const s1 = await shownOf(page);
  assert.deepEqual([s1.count, s1.sol, s1.shownCount], ['Many minimal solutions exist; the first 64 can be browsed.', 'Solution 1 of 64', false]);
  await solClick(page, 'prev');
  const s64 = await shownOf(page);
  assert.equal(s64.sol, 'Solution 64 of 64');
  assert.notDeepEqual(s64.groups, s1.groups);
  assert.equal(s64.cost.replace(/;.*/, ''), s1.cost.replace(/;.*/, ''), 'as many terms and literals');
  // the 3D map: its groups those of the solution used
  await page.eval(() => document.querySelector('.doc:not([hidden]) .tt-k3d-on').click());
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .tt-k3d-group'), [], { what: 'the 3D map' });
  const solids = () => page.eval((t) => [...new Set([...document.querySelectorAll(`${t} .tt-k3d-group`)].map(g => `${g.dataset.term}:${g.dataset.cells}`))].sort().join(' '), T);
  const g64 = await solids();
  await solClick(page, 'next');
  assert.equal((await shownOf(page)).sol, 'Solution 1 of 64');
  assert.ok(await page.eval(() => !!document.querySelector('.doc:not([hidden]) .tt-k3d-group')), 'still in 3D');
  assert.notEqual(await solids(), g64, 'the 3D groups changed');
  await page.eval(() => document.querySelector('.doc:not([hidden]) .tt-k3d-on').click());
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});
