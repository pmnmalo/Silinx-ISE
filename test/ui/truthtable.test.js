// UI: Truth Table / Karnaugh Map tool. A new table (Tools menu ▸ New Source wizard), cells clicked,
// the K-map groups and the minimal SOP shown, the student's own expression checked; its VHDL module
// (made with it, linked: a cell change rewrites the HDL, which simulates to the new table; a saved
// edit of the HDL updates the table; a sequential edit shows the out-of-sync banner); Generate
// Schematic (netlist without errors, simulates to the table); renaming the module keeps the link;
// Truth Table from Module; Apply of the input / output names; a Verilog project's table: its Verilog
// module; the / notation by default and the XOR form when simpler, in its HDL too, in Portuguese
// (#434, #435).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';
import { truthTableFromModule } from '../../core/logic.js';
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

uiTest('Truth Table: new table, cells, K-map and SOP, my expression, linked VHDL module kept in sync both ways, schematic, rename', E, async (page) => {
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
  // check my answer: ab + bc misses row 5
  await page.fill(`${T} .tt-mine-in`, 'ab + bc');
  await page.waitFor((t) => /Different from the table in 1 row/.test(document.querySelector(`${t} .tt-mine-out`)?.textContent || ''), [T]);
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-table tr.tt-diff td.tt-idx`)].map((c) => c.textContent), T), ['5']);
  await page.fill(`${T} .tt-mine-in`, "ab + c(a+b)");
  await page.waitFor((t) => /Equal to the table/.test(document.querySelector(`${t} .tt-mine-out`)?.textContent || ''), [T]);
  // the table is saved (autosave)
  await page.waitFor(() => !window.Silinx.active.dirty, [], { what: 'saved' });
  assert.equal((await ttFile('TtPj', 'src/maj3.tt.json')).table.f, '00010111');

  // ---- its VHDL module, made with the table (every source has its HDL, #207), linked to it, following
  // it (no Generate VHDL / Verilog module any more, #220)
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-toolbar button`)].map((b) => b.textContent || b.title), T), ['Undo', 'Redo', 'Apply', 'Generate Schematic', 'Truth Table from Module…']);
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
  // the hierarchy shows the module with its table, its views as badges: the HDL, the table the base (#207)
  await page.waitFor(() => [...document.querySelectorAll('#hier .row')].some((r) => /maj3/.test(r.textContent) && /maj3\.tt\.json/.test(r.textContent)), [], { what: 'maj3 (maj3.tt.json) in the hierarchy' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#hier .row')].filter((r) => r.querySelector('.lbl').textContent === 'maj3').map((r) => [...r.querySelectorAll('.badge')].map((b) => `${b.textContent}${b.classList.contains('base') ? '*' : ''}`))), [['Table*', 'VHDL']]);
  // the HDL editor (opened) shows the banner
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/maj3.vhd' && (() => { const b = document.querySelector('.doc:not([hidden]) [data-sync-banner]'); return !!b && b.hidden && b.textContent === ''; })(), [], { what: 'HDL editor banner' });

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

  // ---- HDL -> table: a saved edit of the module updates the table (don't cares kept)
  await page.eval(() => window.SilinxApp.openFile('src/maj3.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/maj3.vhd' && window.Silinx.active.editor);
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.setValue(ed.getValue().replace(/ {4}f <= .*;/, '    f <= a xor b xor c;')); });
  await page.waitFor(async () => (await (await fetch('/api/projects/TtPj/file?path=src%2Fmaj3.tt.json')).json()).table.f === '0X101001', [], { what: 'table updated from the HDL', timeout: 15000 });
  // the open table shows it
  await page.eval(() => window.SilinxApp.openTt('src/maj3.tt.json'));
  await page.waitFor((t) => [...document.querySelectorAll(`${t} .tt-cell[data-out=f]`)].map((c) => c.textContent).join('') === '0X101001', [T], { what: 'editor updated' });
  // a sequential module cannot be a truth table: out-of-sync banner with the reason
  await page.eval(() => window.SilinxApp.openFile('src/maj3.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/maj3.vhd');
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.setValue(ed.getValue().replace(/ {4}f <= .*;/, '    f <= a when rising_edge(b);')); });
  await page.waitFor(() => /Not in sync with maj3\.tt\.json — 'maj3' is sequential/.test(document.querySelector('.doc:not([hidden]) [data-sync-banner]')?.textContent || ''), [], { what: 'out-of-sync banner', timeout: 15000 });
  assert.equal((await ttFile('TtPj', 'src/maj3.tt.json')).table.f, '0X101001');
  // editing the table again rewrites the HDL: back in sync
  await page.eval(() => window.SilinxApp.openTt('src/maj3.tt.json'));
  await page.waitFor((t) => /Not in sync with maj3\.vhd/.test(document.querySelector(`${t} .tt-link`).textContent), [T]);
  await page.click(`${T} .tt-cell[data-out=f][data-row="7"]`);       // 1 -> X
  await page.waitFor((t) => /^HDL: maj3\.vhd — generated from the table$/.test(document.querySelector(`${t} .tt-link`).textContent), [T], { what: 'back in sync', timeout: 15000 });
  // (the link says so as the HDL is written: the file on the disk a moment later)
  for (let k = 0; /rising_edge/.test(vhd = await readWs(env, 'TtPj', 'src/maj3.vhd')) && k < 100; k++) await new Promise((r) => setTimeout(r, 100));
  const sim = simTable(vhd, 'maj3.vhd', 'maj3').f;
  assert.ok([...'0X10100X'].every((c, i) => c === 'X' || c === sim[i]), sim);

  // ---- Generate Schematic: a gate schematic that simulates to the table
  await page.fill(`${T} .tt-nand`, true);
  await page.click(`${T} .tt-btn`, { text: 'Generate Schematic' });
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/maj3_sch.sch.json', [], { what: 'schematic opened', timeout: 15000 });
  const sch = JSON.parse(await readWs(env, 'TtPj', 'src/maj3_sch.sch.json'));
  assert.deepEqual(netlist(sch).diagnostics, []);
  assert.deepEqual((await consoleAfterOpen(page)).slice(2), [
    "Truth table 'src/maj3.tt.json' -> schematic src/maj3_sch.sch.json (minimal POS, NAND gates only; not linked to the table: a module of its own, 'maj3_sch').",
    'src/maj3_sch.vhd generated from src/maj3_sch.sch.json (every source has its HDL)',
  ]);
  assert.deepEqual(await problemRows(page), []);
  assert.ok(sch.symbols.every((s) => s.type.startsWith('nand')), 'NAND gates only');
  const g = generateHdl(sch);
  const st = simTable(g.code, 'maj3_sch.vhd', 'maj3_sch').f;
  assert.ok([...'0X10100X'].every((c, i) => c === 'X' || c === st[i]), st);

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

uiTest('Truth Table with many outputs (#176): 4 -> 16 outputs, cells of output 6, its K-map and SOP, the table scrolls, linked VHDL and schematic', E, async (page) => {
  const four = { version: 1, name: 'many', inputs: ['a', 'b', 'c'], outputs: ['y0', 'y1', 'y2', 'y3'], table: { y0: '00000001', y1: '01111111', y2: '01101001', y3: '00010111' }, exprs: {}, notes: '', form: 'sop', lang: 'vhdl' };
  await makeProject(env, { name: 'TtMany', files: { 'src/many.tt.json': JSON.stringify(four, null, 2) } });
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

  // ---- its VHDL module (linked, following it): 16 outputs, simulates to the table; an HDL edit of output 6 comes back
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/many.vhd'] === 'src/many.tt.json', [], { what: 'linked HDL' });
  await page.waitFor(async () => /y15 = Σm\(2\)/.test(await (await fetch('/api/projects/TtMany/file?path=src%2Fmany.vhd')).text()), [], { what: 'the HDL follows the table', timeout: 15000 });
  const vhd = await readWs(env, 'TtMany', 'src/many.vhd');
  assert.deepEqual(await consoleAfterOpen(page), []);
  await page.eval(() => window.SilinxApp.openFile('src/many.vhd'));
  assert.deepEqual(await problemRows(page), []);
  assert.match(vhd, /y0, y1, y2, y3, y4, y5, y6, y7, y8, y9, y10, y11, y12, y13, y14, y15 : out std_logic/);
  const st = simTable(vhd, 'many.vhd', 'many');
  assert.deepEqual(Object.keys(st), outs);
  assert.deepEqual([st.y3, st.y5, st.y15, st.y9], ['00010111', '11000011', '00100000', '00000000']);
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/many.vhd' && window.Silinx.active.editor, [], { what: 'HDL editor' });
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.setValue(ed.getValue().replace(/ {4}y5 <= .*;/, '    y5 <= a xor c;')); });
  await page.waitFor(async () => (await (await fetch('/api/projects/TtMany/file?path=src%2Fmany.tt.json')).json()).table.y5 === '0X011010', [], { what: 'table updated from the HDL', timeout: 15000 });
  assert.deepEqual((await ttFile('TtMany', 'src/many.tt.json')).outputs, outs);

  // ---- Generate Schematic: 16 output markers, simulates to the table
  await page.eval(() => window.SilinxApp.openTt('src/many.tt.json'));
  await page.waitFor((t) => window.Silinx.active?.id === 'tt:src/many.tt.json' && [...document.querySelectorAll(`${t} .tt-cell[data-out=y5]`)].map((c) => c.textContent).join('') === '0X011010', [T], { what: 'editor updated' });
  await page.click(`${T} .tt-btn`, { text: 'Generate Schematic' });
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/many_sch.sch.json', [], { what: 'schematic opened', timeout: 15000 });
  const sch = JSON.parse(await readWs(env, 'TtMany', 'src/many_sch.sch.json'));
  assert.deepEqual(netlist(sch).diagnostics, []);
  assert.deepEqual(await consoleAfterOpen(page), [
    "Truth table 'src/many.tt.json' -> schematic src/many_sch.sch.json (minimal SOP; not linked to the table: a module of its own, 'many_sch').",
    'src/many_sch.vhd generated from src/many_sch.sch.json (every source has its HDL)',
  ]);
  assert.deepEqual(await problemRows(page), []);
  assert.deepEqual(sch.ports.filter((p) => p.dir === 'out').map((p) => p.name), outs);
  const ss = simTable(generateHdl(sch).code, 'many_sch.vhd', 'many_sch');
  assert.deepEqual([ss.y3, ss.y15, ss.y9], ['00010111', '00100000', '00000000']);
  assert.ok([...'0X011010'].every((c, i) => c === 'X' || c === ss.y5[i]), ss.y5);
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
  // my answer with the same notation, and as an XOR
  await page.fill(`${T} .tt-mine-in`, 'a ^ b');
  await page.waitFor((t) => /Equal to the table/.test(document.querySelector(`${t} .tt-mine-out`)?.textContent || ''), [T]);
  await page.fill(`${T} .tt-mine-in`, '/ab + a/b');      // '/' negates only the next letter
  await page.waitFor((t) => /Equal to the table/.test(document.querySelector(`${t} .tt-mine-out`)?.textContent || ''), [T]);
  await page.fill(`${T} .tt-mine-in`, '/a./b');
  await page.waitFor((t) => /Different from the table in 6 row/.test(document.querySelector(`${t} .tt-mine-out`)?.textContent || ''), [T]);
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
  assert.equal(await apply('a, b, c', 'end'), "'end' is not a valid name (a letter, then letters, digits and single _; not a VHDL/Verilog keyword)");
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
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/tv.v' && (() => { const b = document.querySelector('.doc:not([hidden]) [data-sync-banner]'); return !!b && b.hidden && b.textContent === ''; })(), [], { what: 'Verilog editor banner' });
  // a cell change rewrites the Verilog
  await page.eval(() => window.SilinxApp.openTt('src/tv.tt.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/tv.tt.json');
  await page.click(`${T} .tt-tab[data-out=g]`);
  await page.click(`${T} .tt-cell[data-out=g][data-row="0"]`);
  await page.waitFor(async () => /g = Σm\(0, 6, 7\)/.test(await (await fetch('/api/projects/TtVlog/file?path=src%2Ftv.v')).text()), [], { what: 'Verilog regenerated' });
  assert.deepEqual(simTable(await readWs(env, 'TtVlog', 'src/tv.v'), 'tv.v', 'tv'), { f: '01010101', g: '10000011' });
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});

uiTest('Truth Table (#434, #435): the / notation by default (results, essential primes, K-map groups), the others selectable; the XOR form when simpler, its HDL; in Portuguese', E, async (page) => {
  // a full adder (s, co) and an output XOR does not help (x = a·b + c)
  const fa = { version: 1, name: 'fa', inputs: ['a', 'b', 'c'], outputs: ['s', 'co', 'x'], table: { s: '01101001', co: '00010111', x: '01010111' }, exprs: {}, notes: '', form: 'sop', lang: 'vhdl' };
  await makeProject(env, { name: 'TtXor', files: { 'src/fa.tt.json': JSON.stringify(fa, null, 2) } });
  await page.openProject('TtXor');
  await page.eval(() => window.SilinxApp.openTt('src/fa.tt.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/fa.tt.json' && document.querySelector('.doc:not([hidden]) .tt-editor'), [], { what: 'truth table editor' });
  const T = '.doc:not([hidden]) .tt-editor';
  const texts = () => page.eval((t) => ({
    sop: document.querySelector(`${t} .tt-sop .tt-expr`).textContent,
    pos: document.querySelector(`${t} .tt-pos .tt-expr`).textContent,
    xor: document.querySelector(`${t} .tt-xor .tt-expr`)?.textContent ?? null,
    xorCost: document.querySelector(`${t} .tt-xor .tt-cost`)?.textContent ?? null,
    ess: document.querySelector(`${t} .tt-ess-list code`).textContent,
    groups: [...document.querySelectorAll(`${t} .tt-leg code`)].map((c) => c.textContent),
  }), T);
  // the notations: / first, the default
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-notation option`)].map((o) => `${o.value}:${o.textContent}`), T),
    ['slash:/a·b + c', 'slash-compact:/ab + c', "textbook:a·b' + c", "compact:ab' + c", 'vhdl:VHDL', 'verilog:Verilog']);
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-notation`).value, T), 'slash');
  assert.deepEqual(await page.eval((t) => [document.querySelector(`${t} .tt-expr-in`).placeholder, document.querySelector(`${t} .tt-mine-in`).placeholder], T), ['e.g. /a·b + c', 'type your answer, e.g. /a·c + b']);
  // s: the sum, a ⊕ b ⊕ c beside its SOP and POS
  assert.deepEqual(await texts(), {
    sop: 's = /a·/b·c + /a·b·/c + a·/b·/c + a·b·c', pos: 's = (a + b + c)·(a + /b + /c)·(/a + b + /c)·(/a + /b + c)',
    xor: 's = a ⊕ b ⊕ c', xorCost: '3 literal(s), 2 two-input operator(s): 2 XOR / XNOR, 0 AND, 0 OR',
    ess: '/a·/b·c, /a·b·/c, a·/b·/c, a·b·c', groups: ['/a·/b·c', '/a·b·/c', 'a·/b·/c', 'a·b·c'],
  });
  // the K-map's POS groups: clauses in the / notation
  await page.click(`${T} .tt-groups input[value=pos]`);
  assert.deepEqual((await texts()).groups, ['a + b + c', 'a + /b + /c', '/a + b + /c', '/a + /b + c']);
  await page.click(`${T} .tt-groups input[value=sop]`);
  // what is shown reads back: my answer copied from the results
  for (const ans of ['/a·/b·c + /a·b·/c + a·/b·/c + a·b·c', 'a ⊕ b ⊕ c', '(a + b + c)·(a + /b + /c)·(/a + b + /c)·(/a + /b + c)']) {
    await page.fill(`${T} .tt-mine-in`, ans);
    await page.waitFor((t) => /Equal to the table/.test(document.querySelector(`${t} .tt-mine-out`)?.textContent || ''), [T], { what: ans });
  }
  // co: the carry a·b + c·(a ⊕ b), 5 literals against 6
  await page.click(`${T} .tt-tab[data-out=co]`);
  let x = await texts();
  assert.deepEqual([x.sop, x.xor, x.xorCost, x.ess], ['co = b·c + a·c + a·b', 'co = a·b + c·(a ⊕ b)', '5 literal(s), 4 two-input operator(s): 1 XOR / XNOR, 2 AND, 1 OR', 'b·c, a·c, a·b']);
  // x = a·b + c: XOR does not help, no XOR form
  await page.click(`${T} .tt-tab[data-out=x]`);
  x = await texts();
  assert.deepEqual([x.sop, x.xor], ['x = c + a·b', null]);
  assert.equal(await page.eval((t) => document.querySelectorAll(`${t} .tt-xor`).length, T), 0);
  // the other notations, selectable: on the results, the essential primes and the K-map groups
  await page.click(`${T} .tt-tab[data-out=s]`);
  const want = {
    'slash-compact': ['s = /a/bc + /ab/c + a/b/c + abc', 's = a ⊕ b ⊕ c', '/a/bc, /ab/c, a/b/c, abc', ['/a/bc', '/ab/c', 'a/b/c', 'abc']],
    textbook: ["s = a'·b'·c + a'·b·c' + a·b'·c' + a·b·c", 's = a ⊕ b ⊕ c', "a'·b'·c, a'·b·c', a·b'·c', a·b·c", ["a'·b'·c", "a'·b·c'", "a·b'·c'", 'a·b·c']],
    compact: ["s = a'b'c + a'bc' + ab'c' + abc", 's = a ⊕ b ⊕ c', "a'b'c, a'bc', ab'c', abc", ["a'b'c", "a'bc'", "ab'c'", 'abc']],
    vhdl: ['s = (not a and not b and c) or (not a and b and not c) or (a and not b and not c) or (a and b and c)', 's = a xor b xor c', 'not a and not b and c, not a and b and not c, a and not b and not c, a and b and c', ['not a and not b and c', 'not a and b and not c', 'a and not b and not c', 'a and b and c']],
    verilog: ['s = (~a & ~b & c) | (~a & b & ~c) | (a & ~b & ~c) | (a & b & c)', 's = a ^ b ^ c', '~a & ~b & c, ~a & b & ~c, a & ~b & ~c, a & b & c', ['~a & ~b & c', '~a & b & ~c', 'a & ~b & ~c', 'a & b & c']],
  };
  for (const [N, [sop, xr, ess, groups]] of Object.entries(want)) {
    await page.fill(`${T} .tt-notation`, N);
    x = await texts();
    assert.deepEqual([x.sop, x.xor, x.ess, x.groups], [sop, xr, ess, groups], N);
  }
  await page.click(`${T} .tt-tab[data-out=co]`);
  assert.equal((await texts()).xor, 'co = (a & b) | (c & (a ^ b))');
  await page.fill(`${T} .tt-notation`, 'slash');
  assert.equal((await texts()).xor, 'co = a·b + c·(a ⊕ b)');

  // ---- the HDL: the minimal SOP by default; "XOR form (when simpler)" puts it in the module
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/fa.vhd'] === 'src/fa.tt.json', [], { what: 'linked HDL' });
  await page.waitFor(async () => /co = Σm\(3, 5, 6, 7\)/.test(await (await fetch('/api/projects/TtXor/file?path=src%2Ffa.vhd')).text()), [], { what: 'the HDL of the table', timeout: 15000 });
  assert.doesNotMatch(await readWs(env, 'TtXor', 'src/fa.vhd'), /xor/);
  assert.deepEqual(await page.eval((t) => [...document.querySelectorAll(`${t} .tt-form option`)].map((o) => `${o.value}:${o.textContent}`), T), ['sop:Minimal SOP', 'pos:Minimal POS', 'xor:XOR form (when simpler)']);
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
  assert.equal(await page.eval((t) => document.querySelector(`${t} .tt-ops`).textContent, T), "Operadores: / ' ~ (NOT), · . * (AND), ⊕ ^ ou xor (XOR), xnor, + (OR)");
  await setLang('en');
});
