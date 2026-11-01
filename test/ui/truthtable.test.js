// UI: Boolean Algebra / Karnaugh Map tool. A new table (Tools menu ▸ New Source wizard), cells clicked,
// the K-map groups and the minimal SOP shown; its VHDL module (made with it, linked: a cell change
// rewrites the HDL, which simulates to the new table; the HDL read-only, its editor's banner linking to
// the table, #1176); its schematic, always generated, a badge of its row
// in the Design pane, in the HDL logic form, NAND gates only too (#694: netlist without errors,
// simulates to the table; no Generate Schematic, no Check my answer); renaming the module keeps the
// link; Algebra from Module; the input / output names applied on leaving the field or on Enter (#2107); a Verilog project's table: its
// Verilog module; the / notation by default and the XOR form when simpler, in its HDL and its
// schematic too, the NAND and NOR forms, in Portuguese (#434, #435, #694).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';
import { truthTableFromModule, schematicFromTable } from '../../core/logic.js';
import { netlist, generateHdl } from '../../core/schdoc.js';
const IMPORT = process.env.SILINX_UI_INTERFACE === 'ise' ? 'Add Copy of Source' : 'Import Source';   // (#1501)

// a module's Create Test Bench (Wizard): the classic interface's only (the Tasks interface's test benches on its Test page, #1330)
const TB = process.env.SILINX_UI_INTERFACE === 'ise' ? ['Create Test Bench (Wizard)…'] : [];

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
  await page.menu('Tools', 'Boolean Algebra / Karnaugh Map…');
  await page.waitDialog('New Source');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .src-types .st.sel').textContent), /^\s*Boolean Algebra\s*$/);
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'maj3');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/maj3.bool.json' && document.querySelector('.doc:not([hidden]) .tt-editor'), [], { what: 'truth table editor' });
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
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-sop .tt-expr`).textContent, T), 'f = b.c + a.c + a.b');
  assert.match(await page.eval((t) => document.querySelector(`${t} .tt-sop .tt-cost`).textContent, T), /3 term\(s\), 6 literal\(s\); gates: 3 AND, 1 OR, 0 NOT/);
  assert.match(await page.eval((t) => document.querySelector(`${t} .tt-pos .tt-expr`).textContent, T), /^f = \(.+\)\.\(.+\)\.\(.+\)$/);
  assert.match(await page.eval((t) => document.querySelector(`${t} .tt-canon`).textContent, T), /f = Σm\(3, 5, 6, 7\)[\s\S]*f = ΠM\(0, 1, 2, 4\)/);
  // POS groups: the 0s
  await page.click(`${T} .tt-groups input[value=pos]`);
  // (a + c), the 0s of rows 0 and 2, wraps around the left and right edges: drawn as two parts
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} svg.tt-kmap .tt-group`)].map((g) => g.dataset.term), T), ["0", "1", "1", "2"]);
  // no Check my answer, no My expression (#694); the NAND and NOR forms below the minimal ones
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-caption`)].map((c) => c.textContent), T), ['Truth table', 'Notes', 'Expression', 'Karnaugh map', 'Results']);
  assert.equal(await page.eval((t) => document.querySelectorAll(`${t} .tt-mine-in, ${t} .tt-mine-out`).length, T), 0);
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-res > div:first-child b`)].map((b) => b.textContent), T), ['Minimal SOP', 'Minimal POS', 'XOR form', 'NAND form', 'NOR form', 'Least number of gates', 'Least delay']);   // (the last two: #1427)
  // no list of the essential prime implicants below them (#705): the K-map's legend marks them
  assert.deepEqual(await page.eval((t) => [document.querySelectorAll(`${t} .tt-ess-list`).length, /Essential prime implicants/.test(document.querySelector(t).textContent)], T), [0, false]);
  assert.deepEqual(await page.eval((t) => [`${t} .tt-nand`, `${t} .tt-nor`].map((q) => [document.querySelector(`${q} .tt-expr`).textContent, document.querySelector(`${q} .tt-cost`).textContent]), T), [
    ['f = /(/(b.c)./(a.c)./(a.b))', '4 gate(s), 0 of them inverter(s)'], ['f = /(/(a + b) + /(a + c) + /(b + c))', '4 gate(s), 0 of them inverter(s)']]);
  // the table is saved (autosave)
  await page.waitFor(() => !window.Silinx.active.dirty, [], { what: 'saved' });
  assert.equal((await ttFile('TtPj', 'src/maj3.bool.json')).table.f, '00010111');

  // ---- its VHDL module, made with the table (every source has its HDL, #207), linked to it, following
  // it (no Generate VHDL / Verilog module any more, #220)
  // (no Generate Schematic, no NAND gates only check box: the schematic is always generated, #694; expressions
  // written by hand: Handwritten Algebra…, #2010, #2047)
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-toolbar button`)].map((b) => b.textContent || b.title), T), ['Undo', 'Redo', 'Fill the table', 'Algebra from Module…', 'Handwritten Algebra…']);
  // (#2257) no Language; the two commands in the menu at the right of the first line: shown by its button, hidden by Esc, by a click elsewhere and by a command
  const menu = () => page.eval((t) => { const b = document.querySelector(`${t} .tb-more-btn`); const r = b.getBoundingClientRect(), f = [...document.querySelector(`${t} .tt-toolbar`).children].find((e) => e.tagName === 'SELECT' || e.tagName === 'INPUT').getBoundingClientRect(), bar = document.querySelector(`${t} .tt-toolbar`).getBoundingClientRect(), m = document.querySelector(`${t} .tb-more-menu`); return { open: !m.hidden, expanded: b.getAttribute('aria-expanded'), buttons: [...m.querySelectorAll('button')].map((x) => x.textContent), right: bar.right - r.right < 20, firstLine: r.top < f.bottom }; }, T);
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-lang`), T), null);
  assert.deepEqual(await menu(), { open: false, expanded: 'false', buttons: ['Algebra from Module…', 'Handwritten Algebra…'], right: true, firstLine: true });
  await page.click(`${T} .tb-more-btn`);
  assert.equal((await menu()).open, true);
  assert.equal((await menu()).expanded, 'true');
  await page.key('Escape');
  assert.equal((await menu()).open, false);
  await page.click(`${T} .tb-more-btn`);
  await page.click(`${T} .tt-notes`);
  assert.equal((await menu()).open, false);
  assert.equal(await page.eval((t) => document.querySelectorAll(`${t} .tt-toolbar input[type=checkbox]`).length, T), 0);
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/maj3.vhd'] === 'src/maj3.bool.json', [], { what: 'linked HDL' });
  assert.equal((await ttFile('TtPj', 'src/maj3.bool.json')).generatedFile, 'src/maj3.vhd');
  await page.waitFor(async () => /f = Σm\(3, 5, 6, 7\)/.test(await (await fetch('/api/projects/TtPj/file?path=src%2Fmaj3.vhd')).text()), [], { what: 'the HDL follows the table', timeout: 15000 });
  let vhd = await readWs(env, 'TtPj', 'src/maj3.vhd');
  assert.deepEqual(await consoleAfterOpen(page), [
    'src/maj3.vhd generated from src/maj3.bool.json (every source has its HDL)',
    "Created Boolean Algebra 'src/maj3.bool.json'.",
  ]);
  await page.eval(() => window.SilinxApp.openFile('src/maj3.vhd'));
  assert.deepEqual(await problemRows(page), []);
  assert.equal(simTable(vhd, 'maj3.vhd', 'maj3').f, '00010111');
  // the hierarchy shows the module with its table, its views as badges: the table the base, its
  // schematic (#694), the HDL (#207)
  await page.waitFor(() => [...document.querySelectorAll('#hier .row')].some((r) => /maj3/.test(r.textContent) && /maj3\.bool\.json/.test(r.textContent)), [], { what: 'maj3 (maj3.bool.json) in the hierarchy' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#hier .row')].filter((r) => r.querySelector('.lbl').textContent === 'maj3').map((r) => [...r.querySelectorAll('.badge')].map((b) => `${b.textContent}${b.classList.contains('base') ? '*' : ''}`))), [['Algebra*', 'Schematic', 'VHDL']]);
  // the HDL editor (opened) is read-only, its banner says so and links to the table (#1176)
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/maj3.vhd' && /^Read-only, generated from maj3\.bool\.json$/.test(document.querySelector('.doc:not([hidden]) [data-sync-banner]')?.textContent || ''), [], { what: 'HDL editor banner' });
  assert.equal(await page.eval(() => window.Silinx.active.editor.readOnly()), true);

  // ---- table -> HDL: a cell change rewrites the module
  await page.eval(() => window.SilinxApp.openTt('src/maj3.bool.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/maj3.bool.json');
  // (in sync: its HDL file not shown in the toolbar, #2047)
  await page.waitFor((t) => { const l = document.querySelector(`${t} .tt-link`); return l.dataset.hdl === 'maj3.vhd' && l.textContent === ''; }, [T]);
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
  await page.waitFor(() => window.Silinx.active?.id === 'ttsch:src/maj3.bool.json' && window.Silinx.active.viewer, [], { what: 'schematic opened' });
  assert.match(await page.eval(() => document.querySelector('.doc:not([hidden]) .se-banner').textContent), /^Read-only, generated from maj3\.bool\.json$/);   // (at the end of its toolbar, #1193)
  let sch = await ttSchematic(page, 'src/maj3.bool.json');
  assert.deepEqual(netlist(sch).diagnostics, []);
  // (the table's, as core/logic.js draws it: AND, OR and NOT gates)
  assert.deepEqual(sch.symbols.map((x) => x.type), schematicFromTable(await ttFile('TtPj', 'src/maj3.bool.json')).symbols.map((x) => x.type));
  assert.ok(symTypes(sch).every((x) => /^(and\d|or\d|inv)$/.test(x)), symTypes(sch));
  const careSim = (st) => assert.ok([...'0X10100X'].every((c, i) => c === 'X' || c === st[i]), st);
  careSim(simTable(generateHdl(sch).code, 'maj3.vhd', 'maj3').f);
  assert.ok(!(await page.eval(() => window.Silinx.fileTree)).some((f) => /\.sch\.json$/.test(f)), 'no schematic file');
  // HDL logic: NAND gates only: the HDL and the open schematic follow, NAND gates only
  await page.eval(() => window.SilinxApp.openTt('src/maj3.bool.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/maj3.bool.json');
  await page.fill(`${T} .tt-form`, 'nand');
  await page.waitFor(async () => /\(NAND gates only, from the minimal SOP/.test(await (await fetch('/api/projects/TtPj/file?path=src%2Fmaj3.vhd')).text()), [], { what: 'the NAND-only HDL', timeout: 15000 });
  vhd = await readWs(env, 'TtPj', 'src/maj3.vhd');
  assert.doesNotMatch(vhd.slice(vhd.indexOf('begin')), /\b(or|nor|xor|xnor)\b/);
  careSim(simTable(vhd, 'maj3.vhd', 'maj3').f);
  await page.waitFor((p) => window.Silinx.docs.find((d) => d.id === `ttsch:${p}`)?.viewer?.getDoc().symbols.every((x) => /^nand/.test(x.type)), ['src/maj3.bool.json'], { what: 'the schematic in NAND gates' });
  sch = await ttSchematic(page, 'src/maj3.bool.json');
  assert.deepEqual(netlist(sch).diagnostics, []);
  assert.ok(symTypes(sch).every((x) => /^nand[234]$/.test(x)), symTypes(sch));
  careSim(simTable(generateHdl(sch).code, 'maj3.vhd', 'maj3').f);
  // a cell change: the schematic follows (row 0: 0 -> 1)
  await page.click(`${T} .tt-cell[data-out=f][data-row="0"]`);
  await page.waitFor((p, before) => { const d = window.Silinx.docs.find((x) => x.id === `ttsch:${p}`)?.viewer?.getDoc(); return d && JSON.stringify(d.symbols) !== before; }, ['src/maj3.bool.json', JSON.stringify(sch.symbols)], { what: 'the schematic redrawn' });
  const st = simTable(generateHdl(await ttSchematic(page, 'src/maj3.bool.json')).code, 'maj3.vhd', 'maj3').f;
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
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/maj4.vhd'] === 'src/maj4.bool.json', [], { what: 'link after the rename', timeout: 15000 });
  const t4 = await ttFile('TtPj', 'src/maj4.bool.json');
  assert.deepEqual([t4.name, t4.generatedFile], ['maj4', 'src/maj4.vhd']);
  assert.match(await readWs(env, 'TtPj', 'src/maj4.vhd'), /entity maj4 is/);
});

uiTest('Truth Table with many outputs (#176): 4 -> 16 outputs, cells of output 6, its K-map and SOP, the table scrolls, linked VHDL (read-only, #1176) and schematic; an old project\'s generated schematic kept (#694)', E, async (page) => {
  const four = { version: 1, name: 'many', inputs: ['a', 'b', 'c'], outputs: ['y0', 'y1', 'y2', 'y3'], table: { y0: '00000001', y1: '01111111', y2: '01101001', y3: '00010111' }, exprs: {}, notes: '', form: 'sop', lang: 'vhdl' };
  // a schematic made by the former Generate Schematic (#694): a module of its own, not linked to the table
  const old = schematicFromTable(four, { form: 'nand', name: 'many_sch' });
  delete old.fallbacks;
  await makeProject(env, { name: 'TtMany', files: { 'src/many.bool.json': JSON.stringify(four, null, 2), 'src/many_sch.sch.json': JSON.stringify(old, null, 1) } });
  await page.openProject('TtMany');
  await page.eval(() => window.SilinxApp.openTt('src/many.bool.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/many.bool.json' && document.querySelector('.doc:not([hidden]) .tt-editor'), [], { what: 'truth table editor' });
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
  // (SOP groups: the 1s and the don't cares written, the 0s blank; POS groups: the 0s and X, the 1s blank, #1494)
  const kcells = () => page.eval((t) => [...document.querySelectorAll(`${t} svg.tt-kmap .tt-kcell`)].map((g) => `${g.dataset.row}:${g.querySelector('.tt-k-v').textContent}`), T);
  assert.deepEqual(await kcells(), ['0:1', '1:X', '3:', '2:', '4:', '5:', '7:', '6:1']);
  await page.click(`${T} input[name^=tt-grp][value=pos]`);
  assert.deepEqual(await kcells(), ['0:', '1:X', '3:0', '2:0', '4:0', '5:0', '7:0', '6:']);
  await page.click(`${T} input[name^=tt-grp][value=sop]`);
  assert.match(await page.eval((t) => document.querySelector(`${t} .tt-canon`).textContent, T), /y5 = Σm\(0, 6\) \+ d\(1\)/);
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-sop .tt-expr`).textContent, T), "y5 = /a./b + a.b./c");
  assert.equal(await page.eval((t) => document.querySelectorAll(`${t} svg.tt-kmap .tt-group`).length, T), 2);
  // a K-map cell of output 6: row 7 -> 1
  await page.click(`${T} svg.tt-kmap .tt-kcell[data-row="7"] rect`);
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-sop .tt-expr`).textContent, T), "y5 = /a./b + a.b");
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
  await page.waitFor(async () => (await (await fetch('/api/projects/TtMany/file?path=src%2Fmany.bool.json')).json()).table?.y15 === '00100000', [], { what: 'saved' });
  const saved = await ttFile('TtMany', 'src/many.bool.json');
  assert.deepEqual(saved.outputs, outs);
  assert.deepEqual([saved.table.y3, saved.table.y5, saved.table.y15, saved.table.y9], ['00010111', '1X000011', '00100000', '00000000']);

  // ---- its VHDL module (linked, following it, read-only: #1176): 16 outputs, simulates to the table
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/many.vhd'] === 'src/many.bool.json', [], { what: 'linked HDL' });
  await page.waitFor(async () => /y15 = Σm\(2\)/.test(await (await fetch('/api/projects/TtMany/file?path=src%2Fmany.vhd')).text()), [], { what: 'the HDL follows the table', timeout: 15000 });
  const vhd = await readWs(env, 'TtMany', 'src/many.vhd');
  assert.deepEqual(await consoleAfterOpen(page), []);
  // the old schematic: a module of its own, beside the table's (Table, Schematic, VHDL)
  const rows = await page.eval(() => Object.fromEntries([...document.querySelectorAll('#hier .row')].filter((r) => /^many/.test(r.querySelector('.lbl').textContent)).map((r) => [r.querySelector('.lbl').textContent, [...r.querySelectorAll('.badge')].map((b) => `${b.textContent}${b.classList.contains('base') ? '*' : ''}`)])));
  assert.deepEqual(rows, { many: ['Algebra*', 'Schematic', 'VHDL'], many_sch: ['Schematic*', 'VHDL'] });
  await page.eval(() => window.SilinxApp.openFile('src/many.vhd'));
  assert.deepEqual(await problemRows(page), []);
  assert.match(vhd, /y0, y1, y2, y3, y4, y5, y6, y7, y8, y9, y10, y11, y12, y13, y14, y15 : out std_logic/);
  const st = simTable(vhd, 'many.vhd', 'many');
  assert.deepEqual(Object.keys(st), outs);
  assert.deepEqual([st.y3, st.y5, st.y15, st.y9], ['00010111', '11000011', '00100000', '00000000']);
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/many.vhd' && window.Silinx.active.editor?.readOnly(), [], { what: 'HDL editor, read-only' });

  // ---- its schematic (#694), from its row's badge: 16 output markers, simulates to the table
  await page.eval(() => window.SilinxApp.openTt('src/many.bool.json'));
  await page.waitFor((t) => window.Silinx.active?.id === 'tt:src/many.bool.json' && [...document.querySelectorAll(`${t} .tt-cell[data-out=y5]`)].map((c) => c.textContent).join('') === '1X000011', [T], { what: 'the table' });
  await page.eval(() => { const r = [...document.querySelectorAll('#hier .row')].find((e) => e.querySelector('.lbl').textContent === 'many'); [...r.querySelectorAll('.badge')].find((b) => b.textContent === 'Schematic').click(); });
  await page.waitFor(() => window.Silinx.active?.id === 'ttsch:src/many.bool.json' && window.Silinx.active.viewer, [], { what: 'schematic opened' });
  const sch = await ttSchematic(page, 'src/many.bool.json');
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
  await makeProject(env, { name: 'TtOps', files: { 'src/ops.bool.json': JSON.stringify({ version: 1, name: 'ops', inputs: ['a', 'b', 'c'], outputs: ['f'], table: { f: '00000000' }, exprs: {}, notes: '', form: 'sop', lang: 'vhdl' }, null, 2) } });
  await page.openProject('TtOps');
  await page.eval(() => window.SilinxApp.openTt('src/ops.bool.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/ops.bool.json' && document.querySelector('.doc:not([hidden]) .tt-editor'), [], { what: 'truth table editor' });
  const T = '.doc:not([hidden]) .tt-editor';
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-ops`).textContent, T), "Operators: / ' ~ (NOT), . · * (AND), ⊕ ^ or xor (XOR), xnor, + (OR)");
  await page.fill(`${T} .tt-expr-in`, '/a.b + a./b');
  await page.click(`${T} .tt-btn`, { text: 'Fill Table' });
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-expr-err`).textContent, T), '');
  assert.equal(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-cell[data-out=f]`)].map((c) => c.textContent).join(''), T), '00111100');
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-sop .tt-expr`).textContent, T), "f = /a.b + a./b");
  // its NAND and NOR forms (#694)
  assert.deepEqual(await page.eval((t) => [`${t} .tt-nand`, `${t} .tt-nor`].map((q) => document.querySelector(`${q} .tt-expr`).textContent), T), ['f = /(/(/a.b)./(a./b))', 'f = /(/(a + b) + /(/a + /b))']);
  // an invalid expression: where it stops
  await page.fill(`${T} .tt-expr-in`, 'a..b');
  await page.click(`${T} .tt-btn`, { text: 'Fill Table' });
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-expr-err`).textContent, T), "expected a variable, 0, 1 or ( but found '.' (at position 3)");
  await page.waitFor(async () => (await (await fetch('/api/projects/TtOps/file?path=src%2Fops.bool.json')).json()).exprs?.f === '/a.b + a./b', [], { what: 'saved' });
});

uiTest('Algebra from Module: a vector adder read into a table (exhaustive simulation); the table has its HDL; no truth table from a module\'s context menu (#220)', E, async (page) => {
  await makeProject(env, { name: 'TtMod', files: { 'src/add1.vhd': ADDER } });
  await page.openProject('TtMod');
  // a module is made from a truth table, not a truth table from a module: the module's menu has none (#220)
  await page.treeRow('#hier', 'add1', { right: true });
  assert.deepEqual(await page.waitFor(() => { const m = [...document.querySelectorAll('body > .menu-popup .mi')].map((i) => i.textContent.trim()); return m.length ? m : null; }), [
    'Set as Top Module', 'Open', 'Rename…', 'Check Syntax', 'View RTL Schematic', ...TB,
    'Convert to Schematic (editable)…', 'Convert to State Machine (ASM)…', 'Convert to State Diagram (FSM)…',
    'New Source…', `${IMPORT}…`, 'Remove from Project', 'Source Properties…',
  ]);
  await page.closeMenus();
  // the editor's "Algebra from Module…" on a new table (with its HDL file, #207)
  const T = '.doc:not([hidden]) .tt-editor';
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source');
  await page.eval(() => { const r = [...document.querySelectorAll('.dlg-overlay .src-types .st')].find((e) => /Boolean Algebra/.test(e.textContent)); r.scrollIntoView(); r.click(); });
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'blank');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/blank.bool.json');
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/blank.vhd'] === 'src/blank.bool.json', [], { what: 'the table linked to its HDL' });
  await page.click(`${T} .tb-more-btn`);
  await page.click(`${T} .tt-btn`, { text: 'Algebra from Module…' });
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tb-more-menu`).hidden, T), true);
  await page.waitDialog('Algebra from Module');
  await page.dialogButton('OK');
  await page.waitDialog('Algebra from Module');
  await page.dialogButton('Yes');
  await page.waitNoDialog();
  await page.waitFor((x) => document.querySelector(`${x} .tt-outputs`).value === 's_2, s_1, s_0', [T]);
  assert.deepEqual(await page.eval((t) => [document.querySelector(`${t} .tt-inputs`).value, document.querySelector(`${t} .tt-outputs`).value], T), ['a_1, a_0, b_1, b_0', 's_2, s_1, s_0']);
  await page.waitFor(async () => (await (await fetch('/api/projects/TtMod/file?path=src%2Fblank.bool.json')).json()).outputs?.length === 3, [], { what: 'saved' });
  const t = await ttFile('TtMod', 'src/blank.bool.json');
  for (let r = 0; r < 16; r++) assert.equal(t.table.s_2[r] + t.table.s_1[r] + t.table.s_0[r], ((r >> 2) + (r & 3)).toString(2).padStart(3, '0'));
  assert.equal(t.generatedFile, 'src/blank.vhd');
  // its HDL follows it: the adder's table
  await page.waitFor(async () => /s_2/.test(await (await fetch('/api/projects/TtMod/file?path=src%2Fblank.vhd')).text()), [], { what: 'the HDL of the table', timeout: 15000 });
  assert.deepEqual(simTable(await readWs(env, 'TtMod', 'src/blank.vhd'), 'blank.vhd', 'blank'), t.table);
  // 4 inputs: a 4x4 map; s_0 = a_0 xor b_0 (two groups)
  await page.click(`${T} .tt-tab[data-out=s_0]`);
  assert.equal(await page.eval((x) => document.querySelectorAll(`${x} svg.tt-kmap .tt-kcell`).length, T), 16);
  assert.equal(await page.eval((x) => document.querySelector(`${x} .tt-sop .tt-expr`).textContent, T), "s_0 = /a_0.b_0 + a_0./b_0");
});

uiTest('Truth Table (#196, #2107): input / output names applied on leaving the field or on Enter, no Apply button (columns follow their names, the errors shown); in a Verilog project its Verilog module (compiles to the table, follows it)', E, async (page) => {
  await makeProject(env, { name: 'TtVlog', preferredLanguage: 'verilog' });
  await page.openProject('TtVlog');
  await page.menu('Tools', 'Boolean Algebra / Karnaugh Map…');
  await page.waitDialog('New Source');
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'tv');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/tv.bool.json' && document.querySelector('.doc:not([hidden]) .tt-editor'), [], { what: 'truth table editor' });
  const T = '.doc:not([hidden]) .tt-editor';
  const cells = (o) => page.eval((t, x) => [...document.querySelectorAll(`${t} .tt-cell[data-out=${x}]`)].map((c) => c.textContent).join(''), T, o);
  // the inputs set, the outputs typed, then Enter or leaving the field (the notes focused: the browser's change
  // event); no Apply button (#2107)
  let leave = false;
  const apply = async (ins, outs) => {
    await page.eval((t, a) => { document.querySelector(`${t} .tt-inputs`).value = a; const o = document.querySelector(`${t} .tt-outputs`); o.value = ''; o.focus(); }, T, ins);
    if (outs) await page.type(outs);
    if (leave && outs) await page.eval((t) => document.querySelector(`${t} .tt-notes`).focus(), T); else await page.key('Enter');
    leave = !leave;
    return page.eval((t) => document.querySelector(`${t} .tt-err`).textContent, T);
  };
  assert.equal(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-toolbar button`)].filter((b) => b.textContent === 'Apply').length, T), 0);
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
  await page.waitFor(async () => (await (await fetch('/api/projects/TtVlog/file?path=src%2Ftv.bool.json')).json()).table.g === '00000011', [], { what: 'saved' });
  const t0 = await ttFile('TtVlog', 'src/tv.bool.json');
  assert.deepEqual([t0.inputs, t0.outputs, t0.table], [['c', 'b', 'a'], ['f', 'g'], { f: '01010101', g: '00000011' }]);
  // its Verilog module src/tv.v (the project's preferred language), made with it, linked, simulates to
  // the table (every source has its HDL, #207; no Generate VHDL / Verilog module any more, #220)
  assert.equal((await ttFile('TtVlog', 'src/tv.bool.json')).generatedFile, 'src/tv.v');
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/tv.v'] === 'src/tv.bool.json' && !window.Silinx.fileTree.includes('src/tv.vhd'), [], { what: 'linked Verilog', timeout: 15000 });
  await page.waitFor(async () => /g = Σm\(6, 7\)/.test(await (await fetch('/api/projects/TtVlog/file?path=src%2Ftv.v')).text()), [], { what: 'the Verilog follows the table', timeout: 15000 });
  assert.deepEqual(page.dialogs, []);
  const v = await readWs(env, 'TtVlog', 'src/tv.v');
  assert.match(v, /module tv\s*\(/);
  assert.deepEqual(simTable(v, 'tv.v', 'tv'), { f: '01010101', g: '00000011' });
  const t1 = await ttFile('TtVlog', 'src/tv.bool.json');
  assert.deepEqual([t1.generatedFile, t1.lang], ['src/tv.v', 'verilog']);
  await page.eval(() => window.SilinxApp.openFile('src/tv.v'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/tv.v' && /^Read-only, generated from tv\.bool\.json$/.test(document.querySelector('.doc:not([hidden]) [data-sync-banner]')?.textContent || ''), [], { what: 'Verilog editor banner' });
  // a cell change rewrites the Verilog
  await page.eval(() => window.SilinxApp.openTt('src/tv.bool.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/tv.bool.json');
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
  await makeProject(env, { name: 'TtXor', top: 'top', files: { 'src/fa.bool.json': JSON.stringify(fa, null, 2), 'src/top.vhd': top } });
  await page.openProject('TtXor');
  await page.eval(() => window.SilinxApp.openTt('src/fa.bool.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/fa.bool.json' && document.querySelector('.doc:not([hidden]) .tt-editor'), [], { what: 'truth table editor' });
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
    ['slash:/a.b + c', 'slash-compact:/ab + c', "textbook:a·b' + c", "compact:ab' + c", 'vhdl:VHDL', 'verilog:Verilog']);
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-notation`).value, T), 'slash');
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-expr-in`).placeholder, T), 'e.g. /a.b + c');
  // s: the sum, a ⊕ b ⊕ c beside its SOP and POS
  assert.deepEqual(await texts(), {
    sop: 's = /a./b.c + /a.b./c + a./b./c + a.b.c', pos: 's = (a + b + c).(a + /b + /c).(/a + b + /c).(/a + /b + c)',
    xor: 's = a ⊕ b ⊕ c', xorCost: '3 literal(s), 2 two-input operator(s): 2 XOR / XNOR, 0 AND, 0 OR',
    groups: ['/a./b.c', '/a.b./c', 'a./b./c', 'a.b.c'],
  });
  // the K-map's POS groups: clauses in the / notation
  await page.click(`${T} .tt-groups input[value=pos]`);
  assert.deepEqual((await texts()).groups, ['a + b + c', 'a + /b + /c', '/a + b + /c', '/a + /b + c']);
  await page.click(`${T} .tt-groups input[value=sop]`);
  // below the XOR form, the NAND and NOR forms (#694), then those of the fewest gates and of the least delay (#1427)
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-res > div:first-child b`)].map((b) => b.textContent), T), ['Minimal SOP', 'Minimal POS', 'XOR form', 'NAND form', 'NOR form', 'Least number of gates', 'Least delay']);
  // co: the carry a·b + c·(a ⊕ b), 5 literals against 6
  await page.click(`${T} .tt-tab[data-out=co]`);
  let x = await texts();
  assert.deepEqual([x.sop, x.xor, x.xorCost], ['co = b.c + a.c + a.b', 'co = a.b + c.(a ⊕ b)', '5 literal(s), 4 two-input operator(s): 1 XOR / XNOR, 2 AND, 1 OR']);
  // x = a·b + c: XOR does not help, no XOR form
  await page.click(`${T} .tt-tab[data-out=x]`);
  x = await texts();
  assert.deepEqual([x.sop, x.xor], ['x = c + a.b', null]);
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
  assert.equal((await texts()).xor, 'co = a.b + c.(a ⊕ b)');

  // ---- the HDL: the minimal SOP by default; "XOR form (when simpler)" puts it in the module
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/fa.vhd'] === 'src/fa.bool.json', [], { what: 'linked HDL' });
  await page.waitFor(async () => /co = Σm\(3, 5, 6, 7\)/.test(await (await fetch('/api/projects/TtXor/file?path=src%2Ffa.vhd')).text()), [], { what: 'the HDL of the table', timeout: 15000 });
  assert.doesNotMatch(await readWs(env, 'TtXor', 'src/fa.vhd'), /xor/);
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-form option`)].map((o) => `${o.value}:${o.textContent}`), T), ['sop:Minimal SOP', 'pos:Minimal POS', 'xor:XOR form (when simpler)', 'nand:NAND gates only', 'nor:NOR gates only', 'gates:Least number of gates', 'delay:Least delay']);
  await page.fill(`${T} .tt-form`, 'xor');
  await page.waitFor(async () => /s <= a xor b xor c;/.test(await (await fetch('/api/projects/TtXor/file?path=src%2Ffa.vhd')).text()), [], { what: 'the HDL with the XOR form', timeout: 15000 });
  const vhd = await readWs(env, 'TtXor', 'src/fa.vhd');
  assert.match(vhd, /^ {4}co <= \(a and b\) or \(c and \(a xor b\)\);$/m);
  assert.match(vhd, /^ {4}x <= c or \(a and b\);$/m);
  assert.match(vhd, /^-- co = a·b \+ c·\(a ⊕ b\) {3}\(XOR form, 5 literal\(s\), 4 gate\(s\), delay 3\)$/m);
  assert.deepEqual(simTable(vhd, 'fa.vhd', 'fa'), fa.table);
  await page.waitFor(async () => (await (await fetch('/api/projects/TtXor/file?path=src%2Ffa.bool.json')).json()).form === 'xor', [], { what: 'saved' });
  await page.eval(() => window.SilinxApp.openFile('src/fa.vhd'));
  assert.deepEqual(await problemRows(page), []);
  // its schematic in the XOR form too (#694): s an XOR3; then NOR gates only, the HDL and the schematic
  await page.eval(() => window.SilinxApp.openTtSchematic('src/fa.bool.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'ttsch:src/fa.bool.json' && window.Silinx.active.viewer, [], { what: 'schematic opened' });
  let sch = await ttSchematic(page, 'src/fa.bool.json');
  assert.deepEqual(netlist(sch).diagnostics, []);
  assert.deepEqual(symTypes(sch), ['and2', 'or2', 'xor2', 'xor3']);
  assert.deepEqual(simTable(generateHdl(sch).code, 'fa.vhd', 'fa'), fa.table);
  await page.eval(() => window.SilinxApp.openTt('src/fa.bool.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/fa.bool.json');
  await page.fill(`${T} .tt-form`, 'nor');
  await page.waitFor(async () => /\(NOR gates only, from the minimal POS/.test(await (await fetch('/api/projects/TtXor/file?path=src%2Ffa.vhd')).text()), [], { what: 'the NOR-only HDL', timeout: 15000 });
  const nor = await readWs(env, 'TtXor', 'src/fa.vhd');
  assert.doesNotMatch(nor.slice(nor.indexOf('begin')), /\b(and|nand|xor|xnor)\b/);
  assert.deepEqual(simTable(nor, 'fa.vhd', 'fa'), fa.table);
  await page.waitFor((p) => window.Silinx.docs.find((d) => d.id === `ttsch:${p}`)?.viewer?.getDoc().symbols.every((x) => /^nor/.test(x.type)), ['src/fa.bool.json'], { what: 'the schematic in NOR gates' });
  sch = await ttSchematic(page, 'src/fa.bool.json');
  assert.deepEqual(netlist(sch).diagnostics, []);
  assert.deepEqual(simTable(generateHdl(sch).code, 'fa.vhd', 'fa'), fa.table);

  // ---- its HDL language (#696; the project's Preferred Language, no choice in its toolbar, #2257): Verilog, then VHDL again; the file made again in it, the other removed, the
  // badge follows, the instance in top and the schematic keep working
  const row = (n) => page.eval((m) => { const r = [...document.querySelectorAll('#hier .row')].find((e) => e.querySelector('.lbl').textContent === m); return r && [...r.querySelectorAll('.badge')].map((b) => b.textContent); }, n);
  for (const [lang, L, ext, other] of [['verilog', 'Verilog', 'v', 'vhd'], ['vhdl', 'VHDL', 'vhd', 'v']]) {
    await page.eval(() => window.SilinxApp.openTt('src/fa.bool.json'));
    await page.waitFor(() => window.Silinx.active?.id === 'tt:src/fa.bool.json');
    await page.eval(async (l) => { await (await import('/js/drawings-lang.js')).drawingsInLanguage(l); }, lang);
    await page.waitFor((h, o) => window.Silinx.hdlToSch?.[h] === 'src/fa.bool.json' && !window.Silinx.fileTree.includes(o), [`src/fa.${ext}`, `src/fa.${other}`], { what: `fa in ${L}`, timeout: 15000 });
    await page.waitConsole(new RegExp(`src/fa\\.bool\\.json: its HDL is now in ${L}, src/fa\\.${ext} \\(src/fa\\.${other} removed\\)`));
    const d = await ttFile('TtXor', 'src/fa.bool.json');
    assert.deepEqual([d.lang, d.generatedFile, d.form], [lang, `src/fa.${ext}`, 'nor']);
    const code = await readWs(env, 'TtXor', `src/fa.${ext}`);
    assert.match(code, lang === 'verilog' ? /^module fa \(/m : /^entity fa is/m);
    assert.match(code, /\(NOR gates only, from the minimal POS/);
    assert.deepEqual(simTable(code, `fa.${ext}`, 'fa'), fa.table);
    // the Design pane: top instances it, its row [Algebra*] [Schematic] [L]
    await page.waitFor((l) => [...document.querySelectorAll('#hier .row')].some((r) => /fa$/.test(r.querySelector('.lbl').textContent) && [...r.querySelectorAll('.badge')].some((b) => b.textContent === l)), [L], { what: `the row of fa with [${L}]` });
    assert.deepEqual(await row('u_fa - fa'), ['Algebra', 'Schematic', L]);
    await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
    await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd');
    assert.deepEqual(await problemRows(page), []);
    // the schematic: in the language of the table, the same gates, simulates to the table
    await page.eval(() => window.SilinxApp.openTtSchematic('src/fa.bool.json'));
    await page.waitFor((l) => window.Silinx.active?.id === 'ttsch:src/fa.bool.json' && window.Silinx.active.viewer?.getDoc().lang === l, [lang], { what: `the schematic in ${L}` });
    sch = await ttSchematic(page, 'src/fa.bool.json');
    assert.deepEqual(netlist(sch).diagnostics, []);
    assert.deepEqual(simTable(generateHdl(sch, { lang }).code, `fa.${ext}`, 'fa'), fa.table);
  }
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
  await page.eval(() => window.SilinxApp.openTt('src/fa.bool.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/fa.bool.json');

  // ---- in Portuguese: every label of the editor (the XOR form shown) translated
  await page.click(`${T} .tt-tab[data-out=s]`);
  await page.eval(TEXTS);
  const setLang = (l) => page.eval(async (y) => { (await import('/js/i18n.js')).setLanguage(y); }, l);
  await setLang('en'); const en = await page.eval((t) => window.__uiTexts(document.querySelector(t)), T);
  await setLang('pt'); const pt = await page.eval((t) => window.__uiTexts(document.querySelector(t)), T);
  assert.deepEqual(untranslated(en, pt, [/^@?(\/a.b \+ c|\/ab \+ c|a.b' \+ c|ab' \+ c|[a-z]+ =|s|co|x|a, b, c|s, co, x|fa\.vhd)$/]), []);
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-xor b`).textContent, T), 'Forma XOR');
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-xor .tt-cost`).textContent, T), '3 literal(is), 2 operador(es) de duas entradas: 2 XOR / XNOR, 0 AND, 0 OR');
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-form option[value=xor]`).textContent, T), 'Forma XOR (quando mais simples)');
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-form option`)].slice(3).map((o) => o.textContent), T), ['Só portas NAND', 'Só portas NOR', 'Menor número de portas', 'Menor atraso']);
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-toolbar label`)].map((l) => l.textContent), T), ['Entradas:', 'Saídas:', 'Lógica do HDL:']);
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-toolbar button`)].map((b) => b.textContent || b.title), T), ['Anular', 'Refazer', 'Preencher a tabela', 'Álgebra de um Módulo…', 'Álgebra Manuscrita…']);
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-nand b, ${t} .tt-nor b, ${t} .tt-nand .tt-cost`)].map((b) => b.textContent), T), ['Forma NAND', '8 porta(s), 3 delas inversora(s)', 'Forma NOR']);
  // the Design pane's badges and the schematic's bar
  assert.deepEqual(await page.eval(() => [...[...document.querySelectorAll('#hier .row')].find((r) => r.querySelector('.lbl').textContent === 'u_fa - fa').querySelectorAll('.badge')].map((b) => b.textContent)), ['Álgebra', 'Esquemático', 'VHDL']);
  assert.equal(await page.eval(() => window.Silinx.docs.find((d) => d.id === 'ttsch:src/fa.bool.json').el.querySelector('.se-banner').textContent), 'Só de leitura, gerado a partir de fa.bool.json');
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-ops`).textContent, T), "Operadores: / ' ~ (NOT), . · * (AND), ⊕ ^ ou xor (XOR), xnor, + (OR)");
  await setLang('en');
});

uiTest('#1120 Truth Table: solid lines between the row number, the inputs and the outputs, in the header and every row', E, async (page) => {
  const { newTable } = await import('../../core/logic.js');
  const t = newTable('maj', ['a', 'b', 'c'], ['y', 'z'], 'vhdl');
  await makeProject(env, { name: 'TtLines', files: { 'src/maj.bool.json': JSON.stringify(t) } });
  await page.openProject('TtLines');
  await page.eval(() => window.SilinxApp.openTt('src/maj.bool.json'));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .tt-table tr:nth-child(2)'), [], { what: 'the table' });
  // each row's cells' left borders: width and style (# a b c | y z)
  const rows = await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .tt-table tr')].map((tr) => [...tr.children].map((c) => {
    const s = getComputedStyle(c);
    return `${s.borderLeftWidth} ${s.borderLeftStyle}`;
  })));
  assert.equal(rows.length, 9, 'the header and 8 rows');
  for (const r of rows) assert.deepEqual(r.slice(1), ['2px solid', '1px solid', '1px solid', '2px solid', '1px solid'], JSON.stringify(r));
});

// #1427: the HDL logic of the fewest gates or of the least delay; every form's gates and delay as a circuit, and those
// two forms with theirs; the module in the form chosen; in Portuguese
uiTest('#1427 Truth Table: Least number of gates and Least delay, every form\'s gates and delay; the HDL in the one chosen; Portuguese', E, async (page) => {
  const fa = { version: 1, name: 'fa', inputs: ['a', 'b', 'c'], outputs: ['s', 'co'], table: { s: '01101001', co: '00010111' }, exprs: {}, notes: '', form: 'sop', lang: 'vhdl' };
  await makeProject(env, { name: 'TtCost', files: { 'src/fa.bool.json': JSON.stringify(fa, null, 2) } });
  await page.openProject('TtCost');
  await page.eval(() => window.SilinxApp.openTt('src/fa.bool.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/fa.bool.json' && document.querySelector('.doc:not([hidden]) .tt-editor .tt-gates'), [], { what: 'truth table editor' });
  const T = '.doc:not([hidden]) .tt-editor';
  const circuits = () => page.eval((t) => Object.fromEntries(['sop', 'pos', 'xor', 'nand', 'nor', 'gates', 'delay']
    .map((c) => [c, document.querySelector(`${t} .tt-${c} .tt-circuit`)?.textContent ?? null])), T);
  // output s (a parity): the XOR form, one gate, one level
  assert.deepEqual(await circuits(), { sop: 'As a circuit: 8 gate(s), delay 3', pos: 'As a circuit: 8 gate(s), delay 3', xor: 'As a circuit: 1 gate(s), delay 1',
    nand: 'As a circuit: 8 gate(s), delay 3', nor: 'As a circuit: 8 gate(s), delay 3', gates: 'As a circuit: 1 gate(s), delay 1', delay: 'As a circuit: 1 gate(s), delay 1' });
  assert.deepEqual(await page.eval((t) => ['gates', 'delay'].map((g) => [document.querySelector(`${t} .tt-${g} b`).textContent, document.querySelector(`${t} .tt-${g} .tt-best-form`).textContent, document.querySelector(`${t} .tt-${g} .tt-expr`).textContent]), T),
    [['Least number of gates', 'XOR form', 's = a ⊕ b ⊕ c'], ['Least delay', 'XOR form', 's = a ⊕ b ⊕ c']]);
  // the module in the form of the fewest gates: s its XOR, co its minimal SOP; it simulates to the table
  await page.fill(`${T} .tt-form`, 'gates');
  await page.waitFor(async () => /least gates/.test(await (await fetch('/api/projects/TtCost/file?path=src%2Ffa.vhd')).text()), [], { what: 'the HDL of least gates', timeout: 15000 });
  const vhd = await readWs(env, 'TtCost', 'src/fa.vhd');
  assert.match(vhd, /^-- s = a ⊕ b ⊕ c {3}\(least gates: XOR form, 3 literal\(s\), 1 gate\(s\), delay 1\)$/m);
  assert.match(vhd, /^-- co = .* {3}\(least gates: minimal SOP, 6 literal\(s\), 4 gate\(s\), delay 2\)$/m);
  assert.deepEqual(simTable(vhd, 'fa.vhd', 'fa'), fa.table);
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((t) => document.querySelector(`${t} .tt-gates b`)?.textContent === 'Menor número de portas', [T], { what: 'Portuguese' });
  assert.deepEqual(await page.eval((t) => [document.querySelector(`${t} .tt-delay b`).textContent, document.querySelector(`${t} .tt-xor .tt-circuit`).textContent, [...document.querySelectorAll(`${t} .tt-form option`)].slice(-2).map((o) => o.textContent)], T),
    ['Menor atraso', 'Como circuito: 1 porta(s), atraso 1', ['Menor número de portas', 'Menor atraso']]);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
});

// #1492: the Notes box under a long table (5 or 6 inputs: 32, 64 rows) kept its rows, not squeezed by the scrolling column
uiTest('#1492 Truth Table: the Notes box keeps its height under a table of 5 or 6 inputs, the column scrolling to it', E, async (page) => {
  const tt = (name, n) => JSON.stringify({ version: 1, name, inputs: ['a', 'b', 'c', 'd', 'e', 'g'].slice(0, n), outputs: ['f'], table: { f: '0'.repeat(2 ** n) }, exprs: {}, notes: '', form: 'sop', lang: 'vhdl' });
  await makeProject(env, { name: 'TtNotes', files: { 'src/n3.bool.json': tt('n3', 3), 'src/n5.bool.json': tt('n5', 5), 'src/n6.bool.json': tt('n6', 6) } });
  await page.setViewport(1366, 768);
  await page.openProject('TtNotes');
  const heights = {};
  for (const n of [3, 5, 6]) {
    await page.eval((p) => window.SilinxApp.openTt(p), `src/n${n}.bool.json`);
    await page.waitFor((p) => window.Silinx.active?.id === `tt:${p}` && document.querySelector('.doc:not([hidden]) .tt-notes'), [`src/n${n}.bool.json`], { what: `n${n}` });
    heights[n] = await page.eval(() => {
      const t = document.querySelector('.doc:not([hidden]) .tt-notes'), lh = parseFloat(getComputedStyle(t).lineHeight) || 16;
      return Math.round(t.getBoundingClientRect().height) >= 3 * lh - 1 && t.getBoundingClientRect().width >= 220;
    });
  }
  assert.deepEqual(heights, { 3: true, 5: true, 6: true });
  // (scrolled to, typed in)
  await page.eval(() => document.querySelector('.doc:not([hidden]) .tt-notes').scrollIntoView());
  await page.click('.doc:not([hidden]) .tt-notes');
  await page.type('a note');
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .tt-notes').value), 'a note');
});

// #1407: the K-map of 5 or 6 inputs in 3D: its maps stacked (2 or 4 layers, Gray order), a group on each layer it
// covers and a box between neighbouring layers; turned by dragging and the arrow keys, Reset view; a cell clicked
// cycles its value; no 3D box under 5 inputs; Portuguese
uiTest('#1407 Truth Table: the Karnaugh map of 5 or 6 inputs in 3D, its groups as boxes through the layers; turned; Portuguese', E, async (page) => {
  // f = c·e over 5 inputs (a b c d e): one group across both maps (a = 0, 1)
  const col5 = Array.from({ length: 32 }, (_, m) => ((m & 0b00101) === 0b00101 ? '1' : '0')).join('');
  const k5 = { version: 1, name: 'k5', inputs: ['a', 'b', 'c', 'd', 'e'], outputs: ['f'], table: { f: col5 }, exprs: {}, notes: '', form: 'sop', lang: 'vhdl' };
  const k3 = { version: 1, name: 'k3', inputs: ['a', 'b', 'c'], outputs: ['f'], table: { f: '00010111' }, exprs: {}, notes: '', form: 'sop', lang: 'vhdl' };
  const col6 = Array.from({ length: 64 }, (_, m) => ((m & 0b000101) === 0b000101 ? '1' : '0')).join('');
  const k6 = { version: 1, name: 'k6', inputs: ['a', 'b', 'c', 'd', 'e', 'g'], outputs: ['f'], table: { f: col6 }, exprs: {}, notes: '', form: 'sop', lang: 'vhdl' };
  await makeProject(env, { name: 'Tt3d', files: { 'src/k5.bool.json': JSON.stringify(k5), 'src/k3.bool.json': JSON.stringify(k3), 'src/k6.bool.json': JSON.stringify(k6) } });
  await page.openProject('Tt3d');
  const T = '.doc:not([hidden]) .tt-editor';
  const open = async (f) => {
    await page.eval((p) => window.SilinxApp.openTt(p), f);
    await page.waitFor((p) => window.Silinx.active?.id === `tt:${p}` && document.querySelector('.doc:not([hidden]) .tt-editor .tt-kmap-host'), [f], { what: f });
  };
  // under 5 inputs: no 3D box
  await open('src/k3.bool.json');
  assert.equal(await page.eval((t) => document.querySelectorAll(`${t} .tt-k3d-on`).length, T), 0);
  // 5 inputs: flat at first; ticked, 2 layers, the group on both and a box (its 4 sides) between them
  await open('src/k5.bool.json');
  assert.ok(await page.eval((t) => !!document.querySelector(`${t} svg.tt-kmap`) && !document.querySelector(`${t} .tt-k3d`), T), 'flat at first');
  await page.click(`${T} .tt-k3d-on`);
  await page.waitFor((t) => !!document.querySelector(`${t} .tt-k3d`), [T], { what: '3D' });
  const shape = () => page.eval((t) => ({
    layers: [...document.querySelectorAll(`${t} .tt-k3d-layer`)].map((l) => l.querySelector('.tt-k3d-title').textContent),
    groups: [...document.querySelectorAll(`${t} .tt-k3d-group`)].map((g) => g.dataset.map), sides: document.querySelectorAll(`${t} .tt-k3d-side`).length,
    ones: [...document.querySelectorAll(`${t} .tt-k3d-cell.v1`)].map((c) => +c.dataset.row).sort((a, b) => a - b),
  }), T);
  const ones5 = [...col5].flatMap((v, m) => (v === '1' ? [m] : []));
  assert.deepEqual(await shape(), { layers: ['a = 0', 'a = 1'], groups: ['0', '1'], sides: 4, ones: ones5 });
  // (SOP groups: the 1s written, the 0s blank; POS groups: the 0s, the 1s blank, #1494)
  const texts = () => page.eval((t) => [...new Set([...document.querySelectorAll(`${t} .tt-k3d-cell`)].map((c) => `${c.classList.contains('v1') ? 1 : 0}:${c.querySelector('.tt-k3d-v').textContent}`))].sort(), T);
  assert.deepEqual(await texts(), ['0:', '1:1']);
  await page.click(`${T} input[name^=tt-grp][value=pos]`);
  await page.waitFor((t) => !!document.querySelector(`${t} .tt-k3d`), [T], { what: '3D, POS' });
  assert.deepEqual(await texts(), ['0:0', '1:']);
  await page.click(`${T} input[name^=tt-grp][value=sop]`);
  await page.waitFor((t) => !!document.querySelector(`${t} .tt-k3d`), [T], { what: '3D, SOP' });
  // Reset view right after the 3D box, on the options' line; no hint about the layers (#1567)
  assert.deepEqual(await page.eval((t) => {
    const g = document.querySelector(`${t} .tt-groups`), box = g.querySelector('.tt-k3d-on').closest('label'), r = g.querySelector('.tt-k3d-reset');
    const a = box?.getBoundingClientRect(), b = r?.getBoundingClientRect();
    return { after: !!r && box.nextElementSibling === r, line: !!r && Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 4, hint: document.querySelectorAll(`${t} .tt-kmap-host .hint`).length };
  }, T), { after: true, line: true, hint: 0 });
  // turned by dragging and by the arrow keys; Reset view
  const tf = () => page.eval((t) => document.querySelector(`${t} .tt-k3d-stack`).style.transform, T);
  const t0 = await tf();
  const box = await page.eval((t) => { const r = document.querySelector(`${t} .tt-k3d`).getBoundingClientRect(); return { x: Math.round(r.left + 12), y: Math.round(r.top + 12) }; }, T);
  await page.drag(box, { x: box.x + 60, y: box.y + 30 });
  assert.notEqual(await tf(), t0, 'turned by dragging');
  await page.click(`${T} .tt-k3d-reset`);
  assert.equal(await tf(), t0, 'Reset view');
  await page.eval((t) => { const s = document.querySelector(`${t} .tt-k3d`); s.focus(); s.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); }, T);
  assert.notEqual(await tf(), t0, 'turned by the arrow keys');
  // a cell clicked: its value cycles (0 -> 1), the map drawn again in 3D
  await page.click(`${T} .tt-k3d-cell[data-row="0"]`);
  await page.waitFor((t) => document.querySelector(`${t} .tt-k3d-cell[data-row="0"]`)?.classList.contains('v1'), [T], { what: 'cell 0 to 1' });
  await page.click(`${T} .tt-k3d-cell[data-row="0"]`);
  await page.click(`${T} .tt-k3d-cell[data-row="0"]`);
  await page.waitFor((t) => document.querySelector(`${t} .tt-k3d-cell[data-row="0"]`)?.classList.contains('v0'), [T], { what: 'cell 0 back to 0' });
  // 6 inputs: 4 layers in Gray order, the group on all four, a box between each neighbouring pair
  await open('src/k6.bool.json');
  await page.waitFor((t) => !!document.querySelector(`${t} .tt-k3d`), [T], { what: '3D kept' });
  const s6 = await shape();
  assert.deepEqual([s6.layers, s6.groups, s6.sides], [['ab = 00', 'ab = 01', 'ab = 11', 'ab = 10'], ['0', '1', '2', '3'], 12]);
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((t) => document.querySelector(`${t} .tt-k3d-reset`)?.textContent === 'Repor a vista', [T], { what: 'Portuguese' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // flat again
  await page.click(`${T} .tt-k3d-on`);
  await page.waitFor((t) => !document.querySelector(`${t} .tt-k3d`) && !!document.querySelector(`${t} svg.tt-kmap`), [T], { what: 'flat again' });
});

// #2206: the 3D map stays in its scene at any rotation, inside the page, and the list of groups is never under it
uiTest('#2206 Truth Table: the 3D Karnaugh map stays inside the page and off the list of groups at any rotation', E, async (page) => {
  const col6 = Array.from({ length: 64 }, (_, m) => (m % 3 ? '1' : '0')).join('');
  const k6 = { version: 1, name: 'k6', inputs: ['a', 'b', 'c', 'd', 'e', 'g'], outputs: ['f'], table: { f: col6 }, exprs: {}, notes: '', form: 'sop', lang: 'vhdl' };
  await makeProject(env, { name: 'Tt3dFit', files: { 'src/k6.bool.json': JSON.stringify(k6) } });
  await page.openProject('Tt3dFit');
  const T = '.doc:not([hidden]) .tt-editor';
  await page.eval((p) => window.SilinxApp.openTt(p), 'src/k6.bool.json');
  await page.waitFor((t) => document.querySelector(`${t} .tt-kmap-host`), [T], { what: 'K-map' });
  if (!await page.eval((t) => document.querySelector(`${t} .tt-k3d-on`).checked, T)) await page.click(`${T} .tt-k3d-on`);
  await page.waitFor((t) => !!document.querySelector(`${t} .tt-k3d`), [T], { what: '3D' });
  const fit = () => page.eval((t) => {
    const scene = document.querySelector(`${t} .tt-k3d`), leg = document.querySelector(`${t} .tt-legend`).getBoundingClientRect(), host = document.querySelector(`${t} .tt-kmap-host`).getBoundingClientRect();
    const s = scene.getBoundingClientRect(), parts = [...scene.querySelectorAll('.tt-k3d-cell, .tt-k3d-title, .tt-k3d-side')].map((e) => e.getBoundingClientRect());
    const out = parts.filter((r) => r.left < s.left - 1 || r.right > s.right + 1 || r.top < s.top - 1 || r.bottom > s.bottom + 1).length;
    return { out, inHost: s.left >= host.left - 1, clear: leg.left >= s.right - 1 || leg.top >= s.bottom - 1, size: [Math.round(s.width), Math.round(s.height)], legend: [Math.round(leg.left), Math.round(leg.top)] };
  }, T);
  const f0 = await fit();
  assert.deepEqual([f0.out, f0.inHost, f0.clear], [0, true, true], 'as first shown');
  await page.eval((t) => document.querySelector(`${t} .tt-k3d`).focus(), T);
  for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
    for (let i = 0; i < 8; i++) await page.eval((t, k) => document.querySelector(`${t} .tt-k3d`).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })), T, key);
    assert.deepEqual(await fit(), f0, `turned with ${key}: nothing moved, nothing out of the scene`);
  }
  await page.click(`${T} .tt-k3d-reset`);
  // the box left as it was found: the 3D box is shared by every table
  await page.click(`${T} .tt-k3d-on`);
});

// #1491: in 3D, a group is the extrusion of its exact shape on the layers: the flat map's pieces on each layer it
// covers (a group across the edges split as there, open on the edge), the walls of their closed sides between the
// neighbouring layers it covers only (none through the layers between the first and last of four)
uiTest('#1491 Truth Table: the 3D Karnaugh map draws each group as its exact shape through the layers it covers', E, async (page) => {
  const table = (name, inputs, on) => ({ version: 1, name, inputs, outputs: ['f'], table: { f: Array.from({ length: 1 << inputs.length }, (_, m) => (on(m) ? '1' : '0')).join('') }, exprs: {}, notes: '', form: 'sop', lang: 'vhdl' });
  const I5 = ['a', 'b', 'c', 'd', 'e'], I6 = ['a', 'b', 'c', 'd', 'e', 'g'];
  const tables = {
    corners: table('corners', I5, (m) => !(m & 0b00100) && !(m & 0b00001)),   // c'·e': the four corners of both layers
    ends: table('ends', I6, (m) => !(m & 0b010000) && !!(m & 0b000100)),      // b'·d: the first and last of four layers
    sides: table('sides', I6, (m) => !(m & 0b100000) && !(m & 0b000001)),     // a'·g': the left and right edges of layers 0 and 1
  };
  await makeProject(env, { name: 'Tt3dShape', files: Object.fromEntries(Object.entries(tables).map(([k, d]) => [`src/${k}.bool.json`, JSON.stringify(d)])) });
  await page.openProject('Tt3dShape');
  const T = '.doc:not([hidden]) .tt-editor';
  const open = async (f) => {
    await page.eval((p) => window.SilinxApp.openTt(p), f);
    await page.waitFor((p) => window.Silinx.active?.id === `tt:${p}` && document.querySelector('.doc:not([hidden]) .tt-editor .tt-kmap-host'), [f], { what: f });
    if (!(await page.eval((t) => !!document.querySelector(`${t} .tt-k3d`), T))) await page.click(`${T} .tt-k3d-on`);
    await page.waitFor((t) => !!document.querySelector(`${t} .tt-k3d`), [T], { what: `${f} in 3D` });
  };
  // the drawn solid: each layer's pieces (their cells; their open sides, no border there), and each join's walls
  const solid = () => page.eval((t) => ({
    pieces: [...document.querySelectorAll(`${t} .tt-k3d-group`)].map((g) => `${g.dataset.term}@${g.dataset.map}:${g.dataset.cells}:${['Top', 'Bottom', 'Left', 'Right'].filter((s) => g.style[`border${s}Style`] === 'none').join('')}`).sort(),
    walls: [...document.querySelectorAll(`${t} .tt-k3d-side`)].map((w) => `${w.dataset.term}@${w.dataset.from}-${w.dataset.to}:${w.dataset.piece}:${w.dataset.side}`).sort(),
  }), T);
  // the flat map's cells on a layer: the 1s whose map variables (the bits above the rows and columns') are the layer's
  const cellsOf = (d, map) => [...d.table.f].flatMap((v, m) => (v === '1' && m >> 4 === [0, 1, 3, 2][map] ? [m] : []));
  // 5 inputs, c'·e': on each layer the four corners apart (each open on its two edges), joined by their 8 walls
  await open('src/corners.bool.json');
  const c = await solid();
  assert.deepEqual(c.pieces, ['0@0:0:TopLeft', '0@0:10:BottomRight', '0@0:2:TopRight', '0@0:8:BottomLeft', '0@1:16:TopLeft', '0@1:18:TopRight', '0@1:24:BottomLeft', '0@1:26:BottomRight']);
  assert.deepEqual([0, 1].map((m) => c.pieces.filter((p) => p.startsWith(`0@${m}:`)).map((p) => +p.split(':')[1]).sort((a, b) => a - b)), [cellsOf(tables.corners, 0), cellsOf(tables.corners, 1)]);
  assert.deepEqual(c.walls, ['0@0-1:0-0,0-0:bottom', '0@0-1:0-0,0-0:right', '0@0-1:0-0,3-3:bottom', '0@0-1:0-0,3-3:left', '0@0-1:3-3,0-0:right', '0@0-1:3-3,0-0:top', '0@0-1:3-3,3-3:left', '0@0-1:3-3,3-3:top']);
  // 6 inputs, b'·d: on the first and last layers (neighbours in Gray order), no walls through the two between
  await open('src/ends.bool.json');
  const e = await solid();
  assert.deepEqual(e.pieces.map((p) => p.split(':').slice(0, 1).concat(p.split(':')[2]).join(':')), ['0@0:', '0@3:']);
  assert.deepEqual(e.pieces.map((p) => p.split(':')[1]), [0, 3].map((m) => cellsOf(tables.ends, m).join(',')));
  assert.deepEqual(e.walls, []);
  // 6 inputs, a'·g': on layers 0 and 1 the left and right columns apart, each open on its edge, joined by 3 walls each
  await open('src/sides.bool.json');
  const s = await solid();
  assert.deepEqual(s.pieces.map((p) => p.replace(/:[\d,]+:/, ':')), ['0@0:Left', '0@0:Right', '0@1:Left', '0@1:Right']);
  assert.deepEqual([0, 1].map((m) => s.pieces.filter((p) => p.startsWith(`0@${m}:`)).flatMap((p) => p.split(':')[1].split(',').map(Number)).sort((a, b) => a - b)), [cellsOf(tables.sides, 0), cellsOf(tables.sides, 1)]);
  assert.deepEqual(s.walls, ['0@0-1:0-3,0-0:bottom', '0@0-1:0-3,0-0:right', '0@0-1:0-3,0-0:top', '0@0-1:0-3,3-3:bottom', '0@0-1:0-3,3-3:left', '0@0-1:0-3,3-3:top']);
});
