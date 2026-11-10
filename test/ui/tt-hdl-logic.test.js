// UI: the HDL logic of each output (#2951): no HDL logic menu in the toolbar; a tick box on each result (Canonical SOP and
// POS, Minimal SOP and POS, XOR, NAND and NOR forms, Least number of gates, Least delay), the one ticked the output's form
// in its HDL module; a new table in least gates; each output its own; a tick box ticked stays so; Undo; a table saved
// before in one form opens with it ticked on every output, its module unchanged; in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { newTable, normalizeTable, generateTableHdl } from '../../core/logic.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const T = '.doc:not([hidden]) .tt-editor';

/** The results' tick boxes: [row (form), ticked] in their order. */
const ticks = (page) => page.eval((t) => [...document.querySelectorAll(`${t} .tt-hdl`)].map((c) => [c.closest('[class^="tt-canon-"], .tt-res').className.replace(/^tt-res /, '').replace(/^tt-canon-/, 'canon-'), c.checked]), T);
const ticked = async (page) => (await ticks(page)).filter(([, c]) => c).map(([r]) => r);
const tick = async (page, row) => {
  await page.eval((t, r) => document.querySelector(`${t} ${r} .tt-hdl`).scrollIntoView({ block: 'center' }), T, row);
  await page.click(`${T} ${row} .tt-hdl`);
};
const open = async (page, p) => {
  await page.eval((p) => window.SilinxApp.openTt(p), p);
  await page.waitFor((p) => window.Silinx.active?.id === `tt:${p}` && document.querySelector('.doc:not([hidden]) .tt-results .tt-hdl'), [p], { what: p });
};
const moduleHas = (page, pj, file, re) => page.waitFor(async (pj, f, src) => new RegExp(src).test(await (await fetch(`/api/projects/${pj}/file?path=${encodeURIComponent(f)}`)).text()), [pj, file, re.source], { what: `${file}: ${re}`, timeout: 15000 });

uiTest('#2951 the HDL logic of each output: a tick box on each result, least gates for a new table, the module follows; a table saved before keeps its form; Undo; Portuguese', E, async (page) => {
  // a new table (least gates), its module linked: f = majority, g = the cyclic chart (its XOR form simpler: h)
  const doc = normalizeTable({ ...newTable('tl', ['a', 'b', 'c'], ['f', 'g', 'h']), table: { f: '00010111', g: '11100111', h: '01101001' }, generatedFile: 'src/tl.vhd' });
  const old = normalizeTable({ ...newTable('old', ['a', 'b'], ['y', 'z']), table: { y: '0110', z: '0111' }, form: 'pos', generatedFile: 'src/old.vhd' });
  const oldVhd = generateTableHdl(old, 'vhdl', { source: 'old.bool.json' }).code;
  await makeProject(env, { name: 'TtHdl', files: {
    'src/tl.bool.json': JSON.stringify(doc, null, 2), 'src/tl.vhd': generateTableHdl(doc, 'vhdl', { source: 'tl.bool.json' }).code,
    'src/old.bool.json': JSON.stringify(old, null, 2), 'src/old.vhd': oldVhd,
  } });
  await page.openProject('TtHdl');
  await open(page, 'src/tl.bool.json');
  // no HDL logic in the toolbar
  assert.equal(await page.eval((t) => [document.querySelector(`${t} .tt-form`), [...document.querySelectorAll(`${t} .tt-toolbar label`)].find((l) => /HDL/.test(l.textContent))].filter(Boolean).length, T), 0);
  // a tick box on every result; least gates ticked
  assert.deepEqual((await ticks(page)).map(([r]) => r), ['tt-gates', 'tt-delay', 'tt-sop', 'tt-pos', 'canon-sop', 'canon-pos', 'tt-xor', 'tt-nand', 'tt-nor']);   // (the majority's XOR form simpler; the order: #3065)
  assert.deepEqual(await ticked(page), ['tt-gates']);
  // the canonical SOP of f: the table and its module follow; the others keep least gates
  await tick(page, '.tt-canon-sop');
  assert.deepEqual(await ticked(page), ['canon-sop']);
  assert.deepEqual(await page.eval(() => window.Silinx.active.ttEditor.getModel().forms), { f: 'csop' });
  await moduleHas(page, 'TtHdl', 'src/tl.vhd', /f <= \(not a and b and c\) or \(a and not b and c\) or \(a and b and not c\) or \(a and b and c\);/);
  assert.match(await readWs(env, 'TtHdl', 'src/tl.vhd'), /-- f = a'·b·c \+ a·b'·c \+ a·b·c' \+ a·b·c {3}\(canonical SOP, /);
  // a tick box ticked stays so (one form per output)
  await tick(page, '.tt-canon-sop');
  assert.deepEqual(await ticked(page), ['canon-sop']);
  // each output its own: h in its XOR form (a row of its own), g in NOR gates
  await page.click(`${T} .tt-tab[data-out=h]`);
  assert.deepEqual(await ticked(page), ['tt-gates']);
  assert.ok((await ticks(page)).some(([r]) => r === 'tt-xor'), 'the XOR form\'s tick box');
  await tick(page, '.tt-xor');
  await page.click(`${T} .tt-tab[data-out=g]`);
  await tick(page, '.tt-nor');
  assert.deepEqual(await page.eval(() => window.Silinx.active.ttEditor.getModel().forms), { f: 'csop', g: 'nor', h: 'xor' });
  await moduleHas(page, 'TtHdl', 'src/tl.vhd', /h <= a xor b xor c;/);
  await moduleHas(page, 'TtHdl', 'src/tl.vhd', /g <= .* nor /);
  const vhd = await readWs(env, 'TtHdl', 'src/tl.vhd');
  assert.equal(vhd, generateTableHdl(JSON.parse(await readWs(env, 'TtHdl', 'src/tl.bool.json')), 'vhdl', { source: 'tl.bool.json' }).code);
  // Undo: g in least gates again
  await page.eval(() => window.Silinx.active.ttEditor.undo());
  assert.deepEqual([await ticked(page), await page.eval(() => window.Silinx.active.ttEditor.getModel().forms)], [['tt-gates'], { f: 'csop', h: 'xor' }]);
  // in Portuguese: the tick box's tip
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  const tip = await page.eval((t) => document.querySelector(`${t} .tt-hdl`).title, T);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.equal(tip, 'A lógica do HDL desta saída: o seu módulo e o seu esquemático nesta forma');
  // a table saved before, in minimal POS: ticked on each output; its module unchanged
  await open(page, 'src/old.bool.json');
  assert.deepEqual(await ticked(page), ['tt-pos']);
  await page.click(`${T} .tt-tab[data-out=z]`);
  assert.deepEqual(await ticked(page), ['tt-pos']);
  assert.equal(await readWs(env, 'TtHdl', 'src/old.vhd'), oldVhd);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});
