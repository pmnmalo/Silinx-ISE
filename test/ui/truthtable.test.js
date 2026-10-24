// UI: Truth Table / Karnaugh Map tool. A new table (Tools menu ▸ New Source wizard), cells clicked,
// the K-map groups and the minimal SOP shown; its VHDL module (made with it, linked: a cell change
// rewrites the HDL, which simulates to the new table; the HDL read-only, its editor's banner linking to
// the table, #1176); its schematic, always generated, a badge of its row
// in the Design pane, in the HDL logic form, NAND gates only too (#694: netlist without errors,
// simulates to the table; no Generate Schematic, no Check my answer); renaming the module keeps the
// link; Truth Table from Module; Apply of the input / output names; a Verilog project's table: its
// Verilog module; the / notation by default and the XOR form when simpler, in its HDL and its
// schematic too, the NAND and NOR forms, in Portuguese (#434, #435, #694).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';
import { truthTableFromModule, schematicFromTable } from '../../core/logic.js';
import { netlist, generateHdl } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
/** The console lines after the project was opened, and the rows of the Errors and Warnings tabs. */
const consoleAfterOpen = async (page) => {
  const lines = (await page.consoleText()).split('\n');
  return lines.slice(lines.findIndex((l) => /^Project ".*" opened/.test(l)) + 1);
};
const problemRows = (page) => page.eval(() => [...document.querySelectorAll('#console-errors .diag, #console-warnings .diag')].map((d) => d.textContent));

const ADDER = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity add1 is port (a, b : in std_logic_vector(1 downto 0); s : out std_logic_vector(2 downto 0)); end add1;
architecture rtl of add1 is begin s <= std_logic_vector(resize(unsigned(a), 3) + resize(unsigned(b), 3)); end rtl;
`;
const simTable = (text, path, mod) => truthTableFromModule([{ path, text }], mod).table;
const ttFile = async (pj, p) => JSON.parse(await readWs(env, pj, p));

/** The schematic of a truth table opened from its row's badge (#694): its document (read-only, not a file). */
const ttSchematic = (page, tt) => page.eval((p) => window.Silinx.docs.find((d) => d.id === `ttsch:${p}`)?.viewer?.getDoc() || null, tt);
const symTypes = (sch) => [...new Set(sch.symbols.map((x) => x.type))].sort();

uiTest('Truth Table: new table, cells, K-map and SOP, linked VHDL module following it (read-only, #1176), its schematic in the hierarchy (NAND gates only), rename', E, async (page) => {
  await makeProject(env, { name: 'TtPj', files: { 'src/add1.vhd': ADDER } });
  await page.openProject('TtPj');
  await page.menu('Tools', 'Truth Table / Karnaugh Map…');
  await page.waitDialog('New Source Wizard');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .src-types .st.sel').textContent), /^\s*Truth Table\s*$/);
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'maj3');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/maj3.tt.json' && document.querySelector('.doc:not([hidden]) .tt-editor'), [], { what: 'truth table editor' });
  const T = '.doc:not([hidden]) .tt-editor';
  assert.deepEqual(await page.eval((t) => [document.querySelector(`${t} .tt-inputs`).value, document.querySelector(`${t} .tt-outputs`).value], T), ['a, b, c', 'f']);
  // majority: rows 3, 5, 6, 7
  for (const r of [3, 5, 6, 7]) await page.click(`${T} .tt-cell[data-out=f][data-row="${r}"]`);
  // a cell cycles 0 -> 1 -> X -> 0
  await page.click(`${T} .tt-cell[data-out=f][data-row="0"]`);
  await page.click(`${T} .tt-cell[data-out=f][data-row="0"]`);
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-cell[data-out=f][data-row="0"]`).textContent, T), 'X');
  await page.click(`${T} .tt-cell[data-out=f][data-row="0"]`);
  assert.equal(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-cell[data-out=f]`)].map((c) => c.textContent).join(''), T), '00010111');
  // K-map: three groups of two; minimal SOP and POS, canonical forms
  assert.equal(await page.eval((t) => document.querySelectorAll(`${t} svg.tt-kmap .tt-group`).length, T), 3);
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-sop .tt-expr`).textContent, T), 'f = b·c + a·c + a·b');
  assert.match(await page.eval((t) => document.querySelector(`${t} .tt-sop .tt-cost`).textContent, T), /3 term\(s\), 6 literal\(s\); gates: 3 AND, 1 OR, 0 NOT/);
  assert.match(await page.eval((t) => document.querySelector(`${t} .tt-pos .tt-expr`).textContent, T), /^f = \(.+\)·\(.+\)·\(.+\)$/);
  assert.match(await page.eval((t) => document.querySelector(`${t} .tt-canon`).textContent, T), /f = Σm\(3, 5, 6, 7\)[\s\S]*f = ΠM\(0, 1, 2, 4\)/);
  // POS groups: the 0s
  await page.click(`${T} .tt-groups input[value=pos]`);
  // (a + c), the 0s of rows 0 and 2, wraps around the left and right edges: drawn as two parts
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} svg.tt-kmap .tt-group`)].map((g) => g.dataset.term), T), ["0", "1", "1", "2"]);
  // no Check my answer, no My expression (#694); the NAND and NOR forms below the minimal ones
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-caption`)].map((c) => c.textContent), T), ['Truth table', 'Notes', 'Expression', 'Karnaugh map', 'Results']);
  assert.equal(await page.eval((t) => document.querySelectorAll(`${t} .tt-mine-in, ${t} .tt-mine-out`).length, T), 0);
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-res > div:first-child b`)].map((b) => b.textContent), T), ['Minimal SOP', 'Minimal POS', 'XOR form', 'NAND form', 'NOR form']);
  // no list of the essential prime implicants below them (#705): the K-map's legend marks them
  assert.deepEqual(await page.eval((t) => [document.querySelectorAll(`${t} .tt-ess-list`).length, /Essential prime implicants/.test(document.querySelector(t).textContent)], T), [0, false]);
  assert.deepEqual(await page.eval((t) => [`${t} .tt-nand`, `${t} .tt-nor`].map((q) => [document.querySelector(`${q} .tt-expr`).textContent, document.querySelector(`${q} .tt-cost`).textContent]), T), [
    ['f = /(/(b·c)·/(a·c)·/(a·b))', '4 gate(s), 0 of them inverter(s)'], ['f = /(/(a + b) + /(a + c) + /(b + c))', '4 gate(s), 0 of them inverter(s)']]);
  // the table is saved (autosave)
  await page.waitFor(() => !window.Silinx.active.dirty, [], { what: 'saved' });
  assert.equal((await ttFile('TtPj', 'src/maj3.tt.json')).table.f, '00010111');

  // ---- its VHDL module, made with the table (every source has its HDL, #207), linked to it, following
  // it (no Generate VHDL / Verilog module any more, #220)
  // (no Generate Schematic, no NAND gates only check box: the schematic is always generated, #694)
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-toolbar button`)].map((b) => b.textContent || b.title), T), ['Undo', 'Redo', 'Apply', 'Truth Table from Module…']);
  assert.equal(await page.eval((t) => document.querySelectorAll(`${t} .tt-toolbar input[type=checkbox]`).length, T), 0);
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/maj3.vhd'] === 'src/maj3.tt.json', [], { what: 'linked HDL' });
  assert.equal((await ttFile('TtPj', 'src/maj3.tt.json')).generatedFile, 'src/maj3.vhd');
  await page.waitFor(async () => /f = Σm\(3, 5, 6, 7\)/.test(await (await fetch('/api/projects/TtPj/file?path=src%2Fmaj3.vhd')).text()), [], { what: 'the HDL follows the table', timeout: 15000 });
  let vhd = await readWs(env, 'TtPj', 'src/maj3.vhd');
  assert.deepEqual(await consoleAfterOpen(page), [
    'src/maj3.vhd generated from src/maj3.tt.json (every source has its HDL)',
    "Created Truth Table 'src/maj3.tt.json'.",
  ]);
  await page.eval(() => window.SilinxApp.openFile('src/maj3.vhd'));
  assert.deepEqual(await problemRows(page), []);
  assert.equal(simTable(vhd, 'maj3.vhd', 'maj3').f, '00010111');
  // the hierarchy shows the module with its table, its views as badges: the table the base, its
  // schematic (#694), the HDL (#207)
  await page.waitFor(() => [...document.querySelectorAll('#hier .row')].some((r) => /maj3/.test(r.textContent) && /maj3\.tt\.json/.test(r.textContent)), [], { what: 'maj3 (maj3.tt.json) in the hierarchy' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#hier .row')].filter((r) => r.querySelector('.lbl').textContent === 'maj3').map((r) => [...r.querySelectorAll('.badge')].map((b) => `${b.textContent}${b.classList.contains('base') ? '*' : ''}`))), [['Table*', 'Schematic', 'VHDL']]);
  // the HDL editor (opened) is read-only, its banner says so and links to the table (#1176)
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/maj3.vhd' && /^Read-only, generated from maj3\.tt\.json$/.test(document.querySelector('.doc:not([hidden]) [data-sync-banner]')?.textContent || ''), [], { what: 'HDL editor banner' });
  assert.equal(await page.eval(() => window.Silinx.active.editor.readOnly()), true);

  // ---- table -> HDL: a cell change rewrites the module
  await page.eval(() => window.SilinxApp.openTt('src/maj3.tt.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/maj3.tt.json');
  await page.waitFor((t) => /^HDL: maj3\.vhd — generated from the table$/.test(document.querySelector(`${t} .tt-link`).textContent), [T]);
  await page.click(`${T} .tt-cell[data-out=f][data-row="0"]`);       // f(0,0,0) = 1
  await page.waitFor(async () => /f = Σm\(0, 3, 5, 6, 7\)/.test(await (await fetch('/api/projects/TtPj/file?path=src%2Fmaj3.vhd')).text()), [], { what: 'HDL regenerated' });
  vhd = await readWs(env, 'TtPj', 'src/maj3.vhd');
  assert.equal(simTable(vhd, 'maj3.vhd', 'maj3').f, '10010111');
  // a don't care goes into the HDL comment
  await page.click(`${T} .tt-cell[data-out=f][data-row="1"]`);
  await page.click(`${T} .tt-cell[data-out=f][data-row="1"]`);       // row 1 = X
  await page.waitFor(async () => /don't care: f = d\(1\)/.test(await (await fetch('/api/projects/TtPj/file?path=src%2Fmaj3.vhd')).text()), [], { what: 'don\'t care in the HDL' });

  // ---- the table edited further, the HDL follows (it is not edited: read-only, #1176): f = 0X10100X
  // (a cell goes 0 -> 1 -> X -> 0)
  for (const [row, n] of [[0, 2], [2, 1], [3, 2], [4, 1], [5, 2], [6, 2], [7, 1]]) for (let k = 0; k < n; k++) await page.click(`${T} .tt-cell[data-out=f][data-row="${row}"]`);
  assert.equal(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-cell[data-out=f]`)].map((c) => c.textContent).join(''), T), '0X10100X');
  await page.waitFor(async () => /don't care: f = d\(1, 7\)/.test(await (await fetch('/api/projects/TtPj/file?path=src%2Fmaj3.vhd')).text()), [], { what: 'HDL regenerated', timeout: 15000 });
  vhd = await readWs(env, 'TtPj', 'src/maj3.vhd');
  const sim = simTable(vhd, 'maj3.vhd', 'maj3').f;
  assert.ok([...'0X10100X'].every((c, i) => c === 'X' || c === sim[i]), sim);

  // ---- its schematic (#694): the Schematic badge of its row opens it, generated from the table (a view, no file),
  // the minimal SOP's gates (the HDL logic form)
  const badge = (mod, text) => page.eval((m, x) => { const r = [...document.querySelectorAll('#hier .row')].find((e) => e.querySelector('.lbl').textContent === m); [...r.querySelectorAll('.badge')].find((b) => b.textContent === x).click(); }, mod, text);
  await badge('maj3', 'Schematic');
  await page.waitFor(() => window.Silinx.active?.id === 'ttsch:src/maj3.tt.json' && window.Silinx.active.viewer, [], { what: 'schematic opened' });
  assert.match(await page.eval(() => document.querySelector('.doc:not([hidden]) .tt-sch-bar').textContent), /^Schematic \(read-only\): generated from maj3\.tt\.json$/);
  let sch = await ttSchematic(page, 'src/maj3.tt.json');
  assert.deepEqual(netlist(sch).diagnostics, []);
  // (the table's, as core/logic.js draws it: AND, OR and NOT gates)
  assert.deepEqual(sch.symbols.map((x) => x.type), schematicFromTable(await ttFile('TtPj', 'src/maj3.tt.json')).symbols.map((x) => x.type));
  assert.ok(symTypes(sch).every((x) => /^(and\d|or\d|inv)$/.test(x)), symTypes(sch));
  const careSim = (st) => assert.ok([...'0X10100X'].every((c, i) => c === 'X' || c === st[i]), st);
  careSim(simTable(generateHdl(sch).code, 'maj3.vhd', 'maj3').f);
  assert.ok(!(await page.eval(() => window.Silinx.fileTree)).some((f) => /\.sch\.json$/.test(f)), 'no schematic file');
  // HDL logic: NAND gates only: the HDL and the open schematic follow, NAND gates only
  await page.eval(() => window.SilinxApp.openTt('src/maj3.tt.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/maj3.tt.json');
  await page.fill(`${T} .tt-form`, 'nand');
  await page.waitFor(async () => /\(NAND gates only, from the minimal SOP/.test(await (await fetch('/api/projects/TtPj/file?path=src%2Fmaj3.vhd')).text()), [], { what: 'the NAND-only HDL', timeout: 15000 });
  vhd = await readWs(env, 'TtPj', 'src/maj3.vhd');
  assert.doesNotMatch(vhd.slice(vhd.indexOf('begin')), /\b(or|nor|xor|xnor)\b/);
  careSim(simTable(vhd, 'maj3.vhd', 'maj3').f);
  await page.waitFor((p) => window.Silinx.docs.find((d) => d.id === `ttsch:${p}`)?.viewer?.getDoc().symbols.every((x) => /^nand/.test(x.type)), ['src/maj3.tt.json'], { what: 'the schematic in NAND gates' });
  sch = await ttSchematic(page, 'src/maj3.tt.json');
  assert.deepEqual(netlist(sch).diagnostics, []);
  assert.ok(symTypes(sch).every((x) => /^nand[234]$/.test(x)), symTypes(sch));
  careSim(simTable(generateHdl(sch).code, 'maj3.vhd', 'maj3').f);
  // a cell change: the schematic follows (row 0: 0 -> 1)
  await page.click(`${T} .tt-cell[data-out=f][data-row="0"]`);
  await page.waitFor((p, before) => { const d = window.Silinx.docs.find((x) => x.id === `ttsch:${p}`)?.viewer?.getDoc(); return d && JSON.stringify(d.symbols) !== before; }, ['src/maj3.tt.json', JSON.stringify(sch.symbols)], { what: 'the schematic redrawn' });
  const st = simTable(generateHdl(await ttSchematic(page, 'src/maj3.tt.json')).code, 'maj3.vhd', 'maj3').f;
  assert.ok([...'1X10100X'].every((c, i) => c === 'X' || c === st[i]), st);
  assert.deepEqual(await problemRows(page), []);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);

  // ---- rename the module: the table follows (file, name, link)
  await page.treeRow('#hier', 'maj3', { right: true, exact: true });
  await page.waitForSelector('body > .menu-popup');
  await page.click('body > .menu-popup .mi', { text: 'Rename…' });
  await page.waitDialog('Rename');
  await page.fill('.dlg-overlay input[type=text]', 'maj4', { index: 0 });
  await page.dialogButton('Rename');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/maj4.vhd'] === 'src/maj4.tt.json', [], { what: 'link after the rename', timeout: 15000 });
  const t4 = await ttFile('TtPj', 'src/maj4.tt.json');
  assert.deepEqual([t4.name, t4.generatedFile], ['maj4', 'src/maj4.vhd']);
  assert.match(await readWs(env, 'TtPj', 'src/maj4.vhd'), /entity maj4 is/);
});

uiTest('Truth Table with many outputs (#176): 4 -> 16 outputs, cells of output 6, its K-map and SOP, the table scrolls, linked VHDL (read-only, #1176) and schematic; an old project\'s generated schematic kept (#694)', E, async (page) => {
  const four = { version: 1, name: 'many', inputs: ['a', 'b', 'c'], outputs: ['y0', 'y1', 'y2', 'y3'], table: { y0: '00000001', y1: '01111111', y2: '01101001', y3: '00010111' }, exprs: {}, notes: '', form: 'sop', lang: 'vhdl' };
  // a schematic made by the former Generate Schematic (#694): a module of its own, not linked to the table
  const old = schematicFromTable(four, { form: 'nand', name: 'many_sch' });
  delete old.fallbacks;
  await makeProject(env, { name: 'TtMany', files: { 'src/many.tt.json': JSON.stringify(four, null, 2), 'src/many_sch.sch.json': JSON.stringify(old, null, 1) } });
  await page.openProject('TtMany');
  await page.eval(() => window.SilinxApp.openTt('src/many.tt.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/many.tt.json' && document.querySelector('.doc:not([hidden]) .tt-editor'), [], { what: 'truth table editor' });
  const T = '.doc:not([hidden]) .tt-editor';
  // no outputs: refused
  await page.fill(`${T} .tt-outputs`, ' ');
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-toolbar .tt-err`).textContent, T), 'At least 1 output');
  // 16 outputs: the 4 columns kept, 12 new ones at 0
  const outs = Array.from({ length: 16 }, (_, i) => `y${i}`);
  await page.fill(`${T} .tt-outputs`, outs.join(', '));
  await page.waitFor((t) => document.querySelectorAll(`${t} .tt-table th.tt-out`).length === 16, [T], { what: '16 output columns' });
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-toolbar .tt-err`).textContent, T), '');
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-tab`)].map((b) => b.dataset.out), T), outs);
  assert.equal(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-cell[data-out=y3]`)].map((c) => c.textContent).join(''), T), '00010111');
  // output 6 (y5): rows 0 and 6 at 1, row 1 a don't care
  for (const r of [0, 6, 1, 1]) await page.click(`${T} .tt-cell[data-out=y5][data-row="${r}"]`);
  assert.equal(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-cell[data-out=y5]`)].map((c) => c.textContent).join(''), T), '1X000010');
  // its K-map, canonical forms and minimal SOP
  await page.click(`${T} .tt-tab[data-out=y5]`);
  assert.ok(await page.eval((t) => document.querySelector(`${t} .tt-tab.active`).dataset.out === 'y5' && document.querySelector(`${t} .tt-table th.tt-out.sel`).textContent === 'y5', T));
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} svg.tt-kmap .tt-kcell`)].map((g) => `${g.dataset.row}:${g.querySelector('.tt-k-v').textContent}`), T),
    ['0:1', '1:X', '3:0', '2:0', '4:0', '5:0', '7:0', '6:1']);
  assert.match(await page.eval((t) => document.querySelector(`${t} .tt-canon`).textContent, T), /y5 = Σm\(0, 6\) \+ d\(1\)/);
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-sop .tt-expr`).textContent, T), "y5 = /a·/b + a·b·/c");
  assert.equal(await page.eval((t) => document.querySelectorAll(`${t} svg.tt-kmap .tt-group`).length, T), 2);
  // a K-map cell of output 6: row 7 -> 1
  await page.click(`${T} svg.tt-kmap .tt-kcell[data-row="7"] rect`);
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-sop .tt-expr`).textContent, T), "y5 = /a·/b + a·b");
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-cell[data-out=y5][data-row="7"]`).textContent, T), '1');
  // the layout: the table scrolls sideways in its panel, the K-map panel keeps its room, the tabs wrap
  const lay = await page.eval((t) => {
    const left = document.querySelector(`${t} .tt-left`), right = document.querySelector(`${t} .tt-right`), tabs = document.querySelector(`${t} .tt-tabs`), tab = tabs.querySelector('.tt-tab');
    return { scrolls: left.scrollWidth > left.clientWidth, left: left.getBoundingClientRect().width, editor: document.querySelector(t).getBoundingClientRect().width, right: right.getBoundingClientRect().width, kmapIn: right.querySelector('svg.tt-kmap').getBoundingClientRect().right <= right.getBoundingClientRect().right + 1, tabsFit: tabs.scrollWidth <= tabs.clientWidth + 1, tabRows: Math.round(tabs.getBoundingClientRect().height / tab.getBoundingClientRect().height) };
  }, T);
  assert.ok(lay.scrolls, `the table scrolls: ${JSON.stringify(lay)}`);
  assert.ok(lay.left <= lay.editor * 0.48 + 1 && lay.right >= lay.editor * 0.5 - 30, `the panels: ${JSON.stringify(lay)}`);
  assert.ok(lay.kmapIn && lay.tabsFit, `the K-map and the tabs fit: ${JSON.stringify(lay)}`);
  // the last column reached by scrolling, clickable
  await page.eval((t) => { const l = document.querySelector(`${t} .tt-left`); l.scrollLeft = l.scrollWidth; }, T);
  await page.click(`${T} .tt-cell[data-out=y15][data-row="2"]`);
  assert.equal(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-cell[data-out=y15]`)].map((c) => c.textContent).join(''), T), '00100000');
  // saved: 16 outputs
  await page.waitFor(async () => (await (await fetch('/api/projects/TtMany/file?path=src%2Fmany.tt.json')).json()).table?.y15 === '00100000', [], { what: 'saved' });
  const saved = await ttFile('TtMany', 'src/many.tt.json');
  assert.deepEqual(saved.outputs, outs);
  assert.deepEqual([saved.table.y3, saved.table.y5, saved.table.y15, saved.table.y9], ['00010111', '1X000011', '00100000', '00000000']);

  // ---- its VHDL module (linked, following it, read-only: #1176): 16 outputs, simulates to the table
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/many.vhd'] === 'src/many.tt.json', [], { what: 'linked HDL' });
  await page.waitFor(async () => /y15 = Σm\(2\)/.test(await (await fetch('/api/projects/TtMany/file?path=src%2Fmany.vhd')).text()), [], { what: 'the HDL follows the table', timeout: 15000 });
  const vhd = await readWs(env, 'TtMany', 'src/many.vhd');
  assert.deepEqual(await consoleAfterOpen(page), []);
  // the old schematic: a module of its own, beside the table's (Table, Schematic, VHDL)
  const rows = await page.eval(() => Object.fromEntries([...document.querySelectorAll('#hier .row')].filter((r) => /^many/.test(r.querySelector('.lbl').textContent)).map((r) => [r.querySelector('.lbl').textContent, [...r.querySelectorAll('.badge')].map((b) => `${b.textContent}${b.classList.contains('base') ? '*' : ''}`)])));
  assert.deepEqual(rows, { many: ['Table*', 'Schematic', 'VHDL'], many_sch: ['Schematic*', 'VHDL'] });
  await page.eval(() => window.SilinxApp.openFile('src/many.vhd'));
  assert.deepEqual(await problemRows(page), []);
  assert.match(vhd, /y0, y1, y2, y3, y4, y5, y6, y7, y8, y9, y10, y11, y12, y13, y14, y15 : out std_logic/);
  const st = simTable(vhd, 'many.vhd', 'many');
  assert.deepEqual(Object.keys(st), outs);
  assert.deepEqual([st.y3, st.y5, st.y15, st.y9], ['00010111', '11000011', '00100000', '00000000']);
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/many.vhd' && window.Silinx.active.editor?.readOnly(), [], { what: 'HDL editor, read-only' });

  // ---- its schematic (#694), from its row's badge: 16 output markers, simulates to the table
  await page.eval(() => window.SilinxApp.openTt('src/many.tt.json'));
  await page.waitFor((t) => window.Silinx.active?.id === 'tt:src/many.tt.json' && [...document.querySelectorAll(`${t} .tt-cell[data-out=y5]`)].map((c) => c.textContent).join('') === '1X000011', [T], { what: 'the table' });
  await page.eval(() => { const r = [...document.querySelectorAll('#hier .row')].find((e) => e.querySelector('.lbl').textContent === 'many'); [...r.querySelectorAll('.badge')].find((b) => b.textContent === 'Schematic').click(); });
  await page.waitFor(() => window.Silinx.active?.id === 'ttsch:src/many.tt.json' && window.Silinx.active.viewer, [], { what: 'schematic opened' });
  const sch = await ttSchematic(page, 'src/many.tt.json');
  assert.deepEqual(netlist(sch).diagnostics, []);
  assert.deepEqual(await problemRows(page), []);
  assert.deepEqual(sch.ports.filter((p) => p.dir === 'out').map((p) => p.name), outs);
  const ss = simTable(generateHdl(sch).code, 'many.vhd', 'many');
  assert.deepEqual([ss.y3, ss.y15, ss.y9], ['00010111', '00100000', '00000000']);
  assert.ok([...'1X000011'].every((c, i) => c === 'X' || c === ss.y5[i]), ss.y5);
  // the old schematic unchanged
  assert.deepEqual(JSON.parse(await readWs(env, 'TtMany', 'src/many_sch.sch.json')).symbols.map((x) => x.type), old.symbols.map((x) => x.type));
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});

uiTest("Truth Table expressions (#180): '/' NOT and '.' AND typed in the Expression field fill the XOR's column; the operators shown", E, async (page) => {
  await makeProject(env, { name: 'TtOps', files: { 'src/ops.tt.json': JSON.stringify({ version: 1, name: 'ops', inputs: ['a', 'b', 'c'], outputs: ['f'], table: { f: '00000000' }, exprs: {}, notes: '', form: 'sop', lang: 'vhdl' }, null, 2) } });
  await page.openProject('TtOps');
  await page.eval(() => window.SilinxApp.openTt('src/ops.tt.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/ops.tt.json' && document.querySelector('.doc:not([hidden]) .tt-editor'), [], { what: 'truth table editor' });
  const T = '.doc:not([hidden]) .tt-editor';
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-ops`).textContent, T), "Operators: / ' ~ (NOT), · . * (AND), ⊕ ^ or xor (XOR), xnor, + (OR)");
  await page.fill(`${T} .tt-expr-in`, '/a.b + a./b');
  await page.click(`${T} .tt-btn`, { text: 'Fill Table' });
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-expr-err`).textContent, T), '');
  assert.equal(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-cell[data-out=f]`)].map((c) => c.textContent).join(''), T), '00111100');
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-sop .tt-expr`).textContent, T), "f = /a·b + a·/b");
  // its NAND and NOR forms (#694)
  assert.deepEqual(await page.eval((t) => [`${t} .tt-nand`, `${t} .tt-nor`].map((q) => document.querySelector(`${q} .tt-expr`).textContent), T), ['f = /(/(/a·b)·/(a·/b))', 'f = /(/(a + b) + /(/a + /b))']);
  // an invalid expression: where it stops
  await page.fill(`${T} .tt-expr-in`, 'a..b');
  await page.click(`${T} .tt-btn`, { text: 'Fill Table' });
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-expr-err`).textContent, T), "expected a variable, 0, 1 or ( but found '.' (at position 3)");
  await page.waitFor(async () => (await (await fetch('/api/projects/TtOps/file?path=src%2Fops.tt.json')).json()).exprs?.f === '/a.b + a./b', [], { what: 'saved' });
});

uiTest('Truth Table from Module: a vector adder read into a table (exhaustive simulation); the table has its HDL; no truth table from a module\'s context menu (#220)', E, async (page) => {
  await makeProject(env, { name: 'TtMod', files: { 'src/add1.vhd': ADDER } });
  await page.openProject('TtMod');
  // a module is made from a truth table, not a truth table from a module: the module's menu has none (#220)
  await page.treeRow('#hier', 'add1', { right: true });
  assert.deepEqual(await page.waitFor(() => { const m = [...document.querySelectorAll('body > .menu-popup .mi')].map((i) => i.textContent.trim()); return m.length ? m : null; }), [
    'Set as Top Module', 'Open', 'Rename…', 'Check Syntax', 'View RTL Schematic', 'Create Test Bench (Wizard)…',
    'Convert to Schematic (editable)…', 'Convert to State Machine (ASM)…', 'Convert to State Diagram (FSM)…',
    'New Source…', 'Add Copy of Source…', 'Remove from Project', 'Source Properties…',
  ]);
  await page.closeMenus();
  // the editor's "Truth Table from Module…" on a new table (with its HDL file, #207)
  const T = '.doc:not([hidden]) .tt-editor';
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source Wizard');
  await page.eval(() => { const r = [...document.querySelectorAll('.dlg-overlay .src-types .st')].find((e) => /Truth Table/.test(e.textContent)); r.scrollIntoView(); r.click(); });
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'blank');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/blank.tt.json');
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/blank.vhd'] === 'src/blank.tt.json', [], { what: 'the table linked to its HDL' });
  await page.click(`${T} .tt-btn`, { text: 'Truth Table from Module…' });
  await page.waitDialog('Truth Table from Module');
  await page.dialogButton('OK');
  await page.waitDialog('Truth Table from Module');
  await page.dialogButton('Yes');
  await page.waitNoDialog();
  await page.waitFor((x) => document.querySelector(`${x} .tt-outputs`).value === 's_2, s_1, s_0', [T]);
  assert.deepEqual(await page.eval((t) => [document.querySelector(`${t} .tt-inputs`).value, document.querySelector(`${t} .tt-outputs`).value], T), ['a_1, a_0, b_1, b_0', 's_2, s_1, s_0']);
  await page.waitFor(async () => (await (await fetch('/api/projects/TtMod/file?path=src%2Fblank.tt.json')).json()).outputs?.length === 3, [], { what: 'saved' });
  const t = await ttFile('TtMod', 'src/blank.tt.json');
  for (let r = 0; r < 16; r++) assert.equal(t.table.s_2[r] + t.table.s_1[r] + t.table.s_0[r], ((r >> 2) + (r & 3)).toString(2).padStart(3, '0'));
  assert.equal(t.generatedFile, 'src/blank.vhd');
  // its HDL follows it: the adder's table
  await page.waitFor(async () => /s_2/.test(await (await fetch('/api/projects/TtMod/file?path=src%2Fblank.vhd')).text()), [], { what: 'the HDL of the table', timeout: 15000 });
  assert.deepEqual(simTable(await readWs(env, 'TtMod', 'src/blank.vhd'), 'blank.vhd', 'blank'), t.table);
  // 4 inputs: a 4x4 map; s_0 = a_0 xor b_0 (two groups)
  await page.click(`${T} .tt-tab[data-out=s_0]`);
  assert.equal(await page.eval((x) => document.querySelectorAll(`${x} svg.tt-kmap .tt-kcell`).length, T), 16);
  assert.equal(await page.eval((x) => document.querySelector(`${x} .tt-sop .tt-expr`).textContent, T), "s_0 = /a_0·b_0 + a_0·/b_0");
});

uiTest('Truth Table (#196): Apply input / output names (columns follow their names, the errors shown); in a Verilog project its Verilog module (compiles to the table, follows it)', E, async (page) => {
  await makeProject(env, { name: 'TtVlog', preferredLanguage: 'verilog' });
  await page.openProject('TtVlog');
  await page.menu('Tools', 'Truth Table / Karnaugh Map…');
  await page.waitDialog('New Source Wizard');
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'tv');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/tv.tt.json' && document.querySelector('.doc:not([hidden]) .tt-editor'), [], { what: 'truth table editor' });
  const T = '.doc:not([hidden]) .tt-editor';
  const cells = (o) => page.eval((t, x) => [...document.querySelectorAll(`${t} .tt-cell[data-out=${x}]`)].map((c) => c.textContent).join(''), T, o);
  // the names typed, then the Apply button (no change event)
  const apply = async (ins, outs) => {
    await page.eval((t, a, b) => { document.querySelector(`${t} .tt-inputs`).value = a; document.querySelector(`${t} .tt-outputs`).value = b; }, T, ins, outs);
    await page.click(`${T} .tt-btn`, { text: 'Apply' });
    return page.eval((t) => document.querySelector(`${t} .tt-err`).textContent, T);
  };
  // f = a (rows 4..7)
  for (const r of [4, 5, 6, 7]) await page.click(`${T} .tt-cell[data-out=f][data-row="${r}"]`);
  assert.equal(await cells('f'), '00001111');
  // errors: nothing changes
  assert.equal(await apply('a b c d e f g', 'f'), '1 to 6 inputs');
  assert.equal(await apply('a, b, c', ''), 'At least 1 output');
  assert.equal(await apply('a, b, a', 'f'), "the name 'a' is used twice");
  // a reserved word of VHDL or Verilog, in any letter case (#679)
  assert.equal(await apply('a, b, c', 'end'), "'end' is a reserved word of VHDL and Verilog: choose another name.");
  assert.equal(await apply('a, b, c', 'Wire'), "'Wire' is a reserved word of Verilog: choose another name.");
  assert.equal(await apply('a, b, c', 'a'), "the name 'a' is used twice");
  assert.equal(await cells('f'), '00001111');
  // inputs reordered: f follows a, now the least significant bit; a new output g of 0s; separators , ; and spaces
  assert.equal(await apply('c b;a', 'f, g'), '');
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-tab`)].map((e) => e.dataset.out), T), ['f', 'g']);
  assert.equal(await cells('f'), '01010101');
  assert.equal(await cells('g'), '00000000');
  // g = c·b (rows 6, 7)
  await page.click(`${T} .tt-tab[data-out=g]`);
  for (const r of [6, 7]) await page.click(`${T} .tt-cell[data-out=g][data-row="${r}"]`);
  await page.waitFor(async () => (await (await fetch('/api/projects/TtVlog/file?path=src%2Ftv.tt.json')).json()).table.g === '00000011', [], { what: 'saved' });
  const t0 = await ttFile('TtVlog', 'src/tv.tt.json');
  assert.deepEqual([t0.inputs, t0.outputs, t0.table], [['c', 'b', 'a'], ['f', 'g'], { f: '01010101', g: '00000011' }]);
  // its Verilog module src/tv.v (the project's preferred language), made with it, linked, simulates to
  // the table (every source has its HDL, #207; no Generate VHDL / Verilog module any more, #220)
  assert.equal((await ttFile('TtVlog', 'src/tv.tt.json')).generatedFile, 'src/tv.v');
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/tv.v'] === 'src/tv.tt.json' && !window.Silinx.fileTree.includes('src/tv.vhd'), [], { what: 'linked Verilog', timeout: 15000 });
  await page.waitFor(async () => /g = Σm\(6, 7\)/.test(await (await fetch('/api/projects/TtVlog/file?path=src%2Ftv.v')).text()), [], { what: 'the Verilog follows the table', timeout: 15000 });
  assert.deepEqual(page.dialogs, []);
  const v = await readWs(env, 'TtVlog', 'src/tv.v');
  assert.match(v, /module tv\s*\(/);
  assert.deepEqual(simTable(v, 'tv.v', 'tv'), { f: '01010101', g: '00000011' });
  const t1 = await ttFile('TtVlog', 'src/tv.tt.json');
  assert.deepEqual([t1.generatedFile, t1.lang], ['src/tv.v', 'verilog']);
  await page.eval(() => window.SilinxApp.openFile('src/tv.v'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/tv.v' && /^Read-only, generated from tv\.tt\.json$/.test(document.querySelector('.doc:not([hidden]) [data-sync-banner]')?.textContent || ''), [], { what: 'Verilog editor banner' });
  // a cell change rewrites the Verilog
  await page.eval(() => window.SilinxApp.openTt('src/tv.tt.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/tv.tt.json');
  await page.click(`${T} .tt-tab[data-out=g]`);
  await page.click(`${T} .tt-cell[data-out=g][data-row="0"]`);
  await page.waitFor(async () => /g = Σm\(0, 6, 7\)/.test(await (await fetch('/api/projects/TtVlog/file?path=src%2Ftv.v')).text()), [], { what: 'Verilog regenerated' });
  assert.deepEqual(simTable(await readWs(env, 'TtVlog', 'src/tv.v'), 'tv.v', 'tv'), { f: '01010101', g: '10000011' });
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});

uiTest('Truth Table (#434, #435): the / notation by default (results, K-map groups), the others selectable; the XOR form when simpler, its HDL; in Portuguese', E, async (page) => {
  // a full adder (s, co) and an output XOR does not help (x = a·b + c)
  const fa = { version: 1, name: 'fa', inputs: ['a', 'b', 'c'], outputs: ['s', 'co', 'x'], table: { s: '01101001', co: '00010111', x: '01010111' }, exprs: {}, notes: '', form: 'sop', lang: 'vhdl' };
  // (a module that instances the table's: it keeps working when the table's language changes, #696)
  const top = `library ieee; use ieee.std_logic_1164.all;
entity top is port (x, y, z : in std_logic; s, co, w : out std_logic); end top;
architecture rtl of top is
  component fa port (a, b, c : in std_logic; s, co, x : out std_logic); end component;
begin
  u_fa : fa port map (a => x, b => y, c => z, s => s, co => co, x => w);
end rtl;
`;
  await makeProject(env, { name: 'TtXor', top: 'top', files: { 'src/fa.tt.json': JSON.stringify(fa, null, 2), 'src/top.vhd': top } });
  await page.openProject('TtXor');
  await page.eval(() => window.SilinxApp.openTt('src/fa.tt.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/fa.tt.json' && document.querySelector('.doc:not([hidden]) .tt-editor'), [], { what: 'truth table editor' });
  const T = '.doc:not([hidden]) .tt-editor';
  const texts = () => page.eval((t) => ({
    sop: document.querySelector(`${t} .tt-sop .tt-expr`).textContent,
    pos: document.querySelector(`${t} .tt-pos .tt-expr`).textContent,
    xor: document.querySelector(`${t} .tt-xor .tt-expr`)?.textContent ?? null,
    xorCost: document.querySelector(`${t} .tt-xor .tt-cost`)?.textContent ?? null,
    groups: [...document.querySelectorAll(`${t} .tt-leg code`)].map((c) => c.textContent),
  }), T);
  // the notations: / first, the default
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-notation option`)].map((o) => `${o.value}:${o.textContent}`), T),
    ['slash:/a·b + c', 'slash-compact:/ab + c', "textbook:a·b' + c", "compact:ab' + c", 'vhdl:VHDL', 'verilog:Verilog']);
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-notation`).value, T), 'slash');
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-expr-in`).placeholder, T), 'e.g. /a·b + c');
  // s: the sum, a ⊕ b ⊕ c beside its SOP and POS
  assert.deepEqual(await texts(), {
    sop: 's = /a·/b·c + /a·b·/c + a·/b·/c + a·b·c', pos: 's = (a + b + c)·(a + /b + /c)·(/a + b + /c)·(/a + /b + c)',
    xor: 's = a ⊕ b ⊕ c', xorCost: '3 literal(s), 2 two-input operator(s): 2 XOR / XNOR, 0 AND, 0 OR',
    groups: ['/a·/b·c', '/a·b·/c', 'a·/b·/c', 'a·b·c'],
  });
  // the K-map's POS groups: clauses in the / notation
  await page.click(`${T} .tt-groups input[value=pos]`);
  assert.deepEqual((await texts()).groups, ['a + b + c', 'a + /b + /c', '/a + b + /c', '/a + /b + c']);
  await page.click(`${T} .tt-groups input[value=sop]`);
  // below the XOR form, the NAND and NOR forms (#694)
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-res > div:first-child b`)].map((b) => b.textContent), T), ['Minimal SOP', 'Minimal POS', 'XOR form', 'NAND form', 'NOR form']);
  // co: the carry a·b + c·(a ⊕ b), 5 literals against 6
  await page.click(`${T} .tt-tab[data-out=co]`);
  let x = await texts();
  assert.deepEqual([x.sop, x.xor, x.xorCost], ['co = b·c + a·c + a·b', 'co = a·b + c·(a ⊕ b)', '5 literal(s), 4 two-input operator(s): 1 XOR / XNOR, 2 AND, 1 OR']);
  // x = a·b + c: XOR does not help, no XOR form
  await page.click(`${T} .tt-tab[data-out=x]`);
  x = await texts();
  assert.deepEqual([x.sop, x.xor], ['x = c + a·b', null]);
  assert.equal(await page.eval((t) => document.querySelectorAll(`${t} .tt-xor`).length, T), 0);
  // the other notations, selectable: on the results and the K-map groups
  await page.click(`${T} .tt-tab[data-out=s]`);
  const want = {
    'slash-compact': ['s = /a/bc + /ab/c + a/b/c + abc', 's = a ⊕ b ⊕ c', ['/a/bc', '/ab/c', 'a/b/c', 'abc']],
    textbook: ["s = a'·b'·c + a'·b·c' + a·b'·c' + a·b·c", 's = a ⊕ b ⊕ c', ["a'·b'·c", "a'·b·c'", "a·b'·c'", 'a·b·c']],
    compact: ["s = a'b'c + a'bc' + ab'c' + abc", 's = a ⊕ b ⊕ c', ["a'b'c", "a'bc'", "ab'c'", 'abc']],
    vhdl: ['s = (not a and not b and c) or (not a and b and not c) or (a and not b and not c) or (a and b and c)', 's = a xor b xor c', ['not a and not b and c', 'not a and b and not c', 'a and not b and not c', 'a and b and c']],
    verilog: ['s = (~a & ~b & c) | (~a & b & ~c) | (a & ~b & ~c) | (a & b & c)', 's = a ^ b ^ c', ['~a & ~b & c', '~a & b & ~c', 'a & ~b & ~c', 'a & b & c']],
  };
  for (const [N, [sop, xr, groups]] of Object.entries(want)) {
    await page.fill(`${T} .tt-notation`, N);
    x = await texts();
    assert.deepEqual([x.sop, x.xor, x.groups], [sop, xr, groups], N);
  }
  await page.click(`${T} .tt-tab[data-out=co]`);
  assert.equal((await texts()).xor, 'co = (a & b) | (c & (a ^ b))');
  await page.fill(`${T} .tt-notation`, 'slash');
  assert.equal((await texts()).xor, 'co = a·b + c·(a ⊕ b)');

  // ---- the HDL: the minimal SOP by default; "XOR form (when simpler)" puts it in the module
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/fa.vhd'] === 'src/fa.tt.json', [], { what: 'linked HDL' });
  await page.waitFor(async () => /co = Σm\(3, 5, 6, 7\)/.test(await (await fetch('/api/projects/TtXor/file?path=src%2Ffa.vhd')).text()), [], { what: 'the HDL of the table', timeout: 15000 });
  assert.doesNotMatch(await readWs(env, 'TtXor', 'src/fa.vhd'), /xor/);
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-form option`)].map((o) => `${o.value}:${o.textContent}`), T), ['sop:Minimal SOP', 'pos:Minimal POS', 'xor:XOR form (when simpler)', 'nand:NAND gates only', 'nor:NOR gates only']);
  await page.fill(`${T} .tt-form`, 'xor');
  await page.waitFor(async () => /s <= a xor b xor c;/.test(await (await fetch('/api/projects/TtXor/file?path=src%2Ffa.vhd')).text()), [], { what: 'the HDL with the XOR form', timeout: 15000 });
  const vhd = await readWs(env, 'TtXor', 'src/fa.vhd');
  assert.match(vhd, /^ {4}co <= \(a and b\) or \(c and \(a xor b\)\);$/m);
  assert.match(vhd, /^ {4}x <= c or \(a and b\);$/m);
  assert.match(vhd, /^-- co = a·b \+ c·\(a ⊕ b\) {3}\(XOR form, 5 literal\(s\)\)$/m);
  assert.deepEqual(simTable(vhd, 'fa.vhd', 'fa'), fa.table);
  await page.waitFor(async () => (await (await fetch('/api/projects/TtXor/file?path=src%2Ffa.tt.json')).json()).form === 'xor', [], { what: 'saved' });
  await page.eval(() => window.SilinxApp.openFile('src/fa.vhd'));
  assert.deepEqual(await problemRows(page), []);
  // its schematic in the XOR form too (#694): s an XOR3; then NOR gates only, the HDL and the schematic
  await page.eval(() => window.SilinxApp.openTtSchematic('src/fa.tt.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'ttsch:src/fa.tt.json' && window.Silinx.active.viewer, [], { what: 'schematic opened' });
  let sch = await ttSchematic(page, 'src/fa.tt.json');
  assert.deepEqual(netlist(sch).diagnostics, []);
  assert.deepEqual(symTypes(sch), ['and2', 'or2', 'xor2', 'xor3']);
  assert.deepEqual(simTable(generateHdl(sch).code, 'fa.vhd', 'fa'), fa.table);
  await page.eval(() => window.SilinxApp.openTt('src/fa.tt.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/fa.tt.json');
  await page.fill(`${T} .tt-form`, 'nor');
  await page.waitFor(async () => /\(NOR gates only, from the minimal POS/.test(await (await fetch('/api/projects/TtXor/file?path=src%2Ffa.vhd')).text()), [], { what: 'the NOR-only HDL', timeout: 15000 });
  const nor = await readWs(env, 'TtXor', 'src/fa.vhd');
  assert.doesNotMatch(nor.slice(nor.indexOf('begin')), /\b(and|nand|xor|xnor)\b/);
  assert.deepEqual(simTable(nor, 'fa.vhd', 'fa'), fa.table);
  await page.waitFor((p) => window.Silinx.docs.find((d) => d.id === `ttsch:${p}`)?.viewer?.getDoc().symbols.every((x) => /^nor/.test(x.type)), ['src/fa.tt.json'], { what: 'the schematic in NOR gates' });
  sch = await ttSchematic(page, 'src/fa.tt.json');
  assert.deepEqual(netlist(sch).diagnostics, []);
  assert.deepEqual(simTable(generateHdl(sch).code, 'fa.vhd', 'fa'), fa.table);

  // ---- its HDL language (#696): Verilog, then VHDL again; the file made again in it, the other removed, the
  // badge follows, the instance in top and the schematic keep working
  const row = (n) => page.eval((m) => { const r = [...document.querySelectorAll('#hier .row')].find((e) => e.querySelector('.lbl').textContent === m); return r && [...r.querySelectorAll('.badge')].map((b) => b.textContent); }, n);
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-lang`).value, T), 'vhdl');
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-lang option`)].map((o) => `${o.value}:${o.textContent}`), T), ['vhdl:VHDL', 'verilog:Verilog']);
  for (const [lang, L, ext, other] of [['verilog', 'Verilog', 'v', 'vhd'], ['vhdl', 'VHDL', 'vhd', 'v']]) {
    await page.eval(() => window.SilinxApp.openTt('src/fa.tt.json'));
    await page.waitFor(() => window.Silinx.active?.id === 'tt:src/fa.tt.json');
    await page.fill(`${T} .tt-lang`, lang);
    await page.waitFor((h, o) => window.Silinx.hdlToSch?.[h] === 'src/fa.tt.json' && !window.Silinx.fileTree.includes(o), [`src/fa.${ext}`, `src/fa.${other}`], { what: `fa in ${L}`, timeout: 15000 });
    await page.waitConsole(new RegExp(`src/fa\\.tt\\.json: its HDL is now in ${L}, src/fa\\.${ext} \\(src/fa\\.${other} removed\\)`));
    const d = await ttFile('TtXor', 'src/fa.tt.json');
    assert.deepEqual([d.lang, d.generatedFile, d.form], [lang, `src/fa.${ext}`, 'nor']);
    const code = await readWs(env, 'TtXor', `src/fa.${ext}`);
    assert.match(code, lang === 'verilog' ? /^module fa \(/m : /^entity fa is/m);
    assert.match(code, /\(NOR gates only, from the minimal POS/);
    assert.deepEqual(simTable(code, `fa.${ext}`, 'fa'), fa.table);
    // the Design pane: top instances it, its row [Table*] [Schematic] [L]
    await page.waitFor((l) => [...document.querySelectorAll('#hier .row')].some((r) => /fa$/.test(r.querySelector('.lbl').textContent) && [...r.querySelectorAll('.badge')].some((b) => b.textContent === l)), [L], { what: `the row of fa with [${L}]` });
    assert.deepEqual(await row('u_fa - fa'), ['Table', 'Schematic', L]);
    await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
    await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd');
    assert.deepEqual(await problemRows(page), []);
    // the schematic: in the language of the table, the same gates, simulates to the table
    await page.eval(() => window.SilinxApp.openTtSchematic('src/fa.tt.json'));
    await page.waitFor((l) => window.Silinx.active?.id === 'ttsch:src/fa.tt.json' && window.Silinx.active.viewer?.getDoc().lang === l, [lang], { what: `the schematic in ${L}` });
    sch = await ttSchematic(page, 'src/fa.tt.json');
    assert.deepEqual(netlist(sch).diagnostics, []);
    assert.deepEqual(simTable(generateHdl(sch, { lang }).code, `fa.${ext}`, 'fa'), fa.table);
  }
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
  await page.eval(() => window.SilinxApp.openTt('src/fa.tt.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/fa.tt.json');

  // ---- in Portuguese: every label of the editor (the XOR form shown) translated
  await page.click(`${T} .tt-tab[data-out=s]`);
  await page.eval(TEXTS);
  const setLang = (l) => page.eval(async (y) => { (await import('/js/i18n.js')).setLanguage(y); }, l);
  await setLang('en'); const en = await page.eval((t) => window.__uiTexts(document.querySelector(t)), T);
  await setLang('pt'); const pt = await page.eval((t) => window.__uiTexts(document.querySelector(t)), T);
  assert.deepEqual(untranslated(en, pt, [/^@?(\/a·b \+ c|\/ab \+ c|a·b' \+ c|ab' \+ c|[a-z]+ =|s|co|x|a, b, c|s, co, x|fa\.vhd)$/]), []);
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-xor b`).textContent, T), 'Forma XOR');
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-xor .tt-cost`).textContent, T), '3 literal(is), 2 operador(es) de duas entradas: 2 XOR / XNOR, 0 AND, 0 OR');
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-form option[value=xor]`).textContent, T), 'Forma XOR (quando mais simples)');
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-form option`)].slice(3).map((o) => o.textContent), T), ['Só portas NAND', 'Só portas NOR']);
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-toolbar label`)].map((l) => l.textContent), T), ['Entradas:', 'Saídas:', 'Lógica do HDL:', 'Linguagem:']);
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-nand b, ${t} .tt-nor b, ${t} .tt-nand .tt-cost`)].map((b) => b.textContent), T), ['Forma NAND', '8 porta(s), 3 delas inversora(s)', 'Forma NOR']);
  // the Design pane's badges and the schematic's bar
  assert.deepEqual(await page.eval(() => [...[...document.querySelectorAll('#hier .row')].find((r) => r.querySelector('.lbl').textContent === 'u_fa - fa').querySelectorAll('.badge')].map((b) => b.textContent)), ['Tabela', 'Esquemático', 'VHDL']);
  assert.equal(await page.eval(() => window.Silinx.docs.find((d) => d.id === 'ttsch:src/fa.tt.json').el.querySelector('.tt-sch-bar').textContent), 'Esquemático (só de leitura): gerado a partir de fa.tt.json');
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-ops`).textContent, T), "Operadores: / ' ~ (NOT), · . * (AND), ⊕ ^ ou xor (XOR), xnor, + (OR)");
  await setLang('en');
});

uiTest('#1120 Truth Table: solid lines between the row number, the inputs and the outputs, in the header and every row', E, async (page) => {
  const { newTable } = await import('../../core/logic.js');
  const t = newTable('maj', ['a', 'b', 'c'], ['y', 'z'], 'vhdl');
  await makeProject(env, { name: 'TtLines', files: { 'src/maj.tt.json': JSON.stringify(t) } });
  await page.openProject('TtLines');
  await page.eval(() => window.SilinxApp.openTt('src/maj.tt.json'));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .tt-table tr:nth-child(2)'), [], { what: 'the table' });
  // each row's cells' left borders: width and style (# a b c | y z)
  const rows = await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .tt-table tr')].map((tr) => [...tr.children].map((c) => {
    const s = getComputedStyle(c);
    return `${s.borderLeftWidth} ${s.borderLeftStyle}`;
  })));
  assert.equal(rows.length, 9, 'the header and 8 rows');
  for (const r of rows) assert.deepEqual(r.slice(1), ['2px solid', '1px solid', '1px solid', '2px solid', '1px solid'], JSON.stringify(r));
});
