// UI: Truth Table / Karnaugh Map tool. A new table (Tools menu ▸ New Source wizard), cells clicked,
// the K-map groups and the minimal SOP shown, the student's own expression checked; Generate VHDL
// module (linked: a cell change rewrites the HDL, which simulates to the new table; a saved edit of
// the HDL updates the table; a sequential edit shows the out-of-sync banner); Generate Schematic
// (netlist without errors, simulates to the table); renaming the module keeps the link; Truth Table
// from Module.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { truthTableFromModule } from '../../core/logic.js';
import { netlist, generateHdl } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

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

  // ---- Generate VHDL module: linked to the table
  await page.click(`${T} .tt-btn`, { text: 'Generate VHDL module' });
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/maj3.vhd'] === 'src/maj3.tt.json', [], { what: 'linked HDL' });
  assert.equal((await ttFile('TtPj', 'src/maj3.tt.json')).generatedFile, 'src/maj3.vhd');
  let vhd = await readWs(env, 'TtPj', 'src/maj3.vhd');
  assert.equal(simTable(vhd, 'maj3.vhd', 'maj3').f, '00010111');
  // the hierarchy shows the module with its table, the HDL nested under it
  await page.waitFor(() => [...document.querySelectorAll('#hier .row')].some((r) => /maj3/.test(r.textContent) && /maj3\.tt\.json/.test(r.textContent)), [], { what: 'maj3 (maj3.tt.json) in the hierarchy' });
  assert.ok(await page.eval(() => [...document.querySelectorAll('#hier .row')].some((r) => /maj3\.vhd/.test(r.textContent) && /synchronized HDL/.test(r.textContent))));
  // the HDL editor (opened) shows the banner
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/maj3.vhd' && /Synchronized with maj3\.tt\.json/.test(document.querySelector('.doc:not([hidden]) [data-sync-banner]')?.textContent || ''), [], { what: 'HDL editor banner' });

  // ---- table -> HDL: a cell change rewrites the module
  await page.eval(() => window.SilinxApp.openTt('src/maj3.tt.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/maj3.tt.json');
  await page.waitFor((t) => /Synchronized with maj3\.vhd/.test(document.querySelector(`${t} .tt-link`).textContent), [T]);
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
  await page.waitFor((t) => /Synchronized with maj3\.vhd/.test(document.querySelector(`${t} .tt-link`).textContent), [T], { what: 'back in sync', timeout: 15000 });
  vhd = await readWs(env, 'TtPj', 'src/maj3.vhd');
  const sim = simTable(vhd, 'maj3.vhd', 'maj3').f;
  assert.ok([...'0X10100X'].every((c, i) => c === 'X' || c === sim[i]), sim);

  // ---- Generate Schematic: a gate schematic that simulates to the table
  await page.fill(`${T} .tt-nand`, true);
  await page.click(`${T} .tt-btn`, { text: 'Generate Schematic' });
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/maj3_sch.sch.json', [], { what: 'schematic opened', timeout: 15000 });
  const sch = JSON.parse(await readWs(env, 'TtPj', 'src/maj3_sch.sch.json'));
  assert.deepEqual(netlist(sch).diagnostics.filter((d) => d.severity === 'error'), []);
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

uiTest('Truth Table from Module: a vector adder read into a table (exhaustive simulation); module context menu makes a new table', E, async (page) => {
  await makeProject(env, { name: 'TtMod', files: { 'src/add1.vhd': ADDER } });
  await page.openProject('TtMod');
  // module context menu: a new (unlinked) table
  await page.treeRow('#hier', 'add1', { right: true });
  await page.waitForSelector('body > .menu-popup');
  await page.click('body > .menu-popup .mi', { text: 'Truth Table / Karnaugh Map of this Module…' });
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/add1_tt.tt.json', [], { what: 'table of add1', timeout: 15000 });
  const T = '.doc:not([hidden]) .tt-editor';
  assert.deepEqual(await page.eval((t) => [document.querySelector(`${t} .tt-inputs`).value, document.querySelector(`${t} .tt-outputs`).value], T), ['a_1, a_0, b_1, b_0', 's_2, s_1, s_0']);
  const t = await ttFile('TtMod', 'src/add1_tt.tt.json');
  for (let r = 0; r < 16; r++) assert.equal(t.table.s_2[r] + t.table.s_1[r] + t.table.s_0[r], ((r >> 2) + (r & 3)).toString(2).padStart(3, '0'));
  assert.equal(t.generatedFile, undefined);
  // 4 inputs: a 4x4 map; s_0 = a_0 xor b_0 (two groups)
  await page.click(`${T} .tt-tab[data-out=s_0]`);
  assert.equal(await page.eval((x) => document.querySelectorAll(`${x} svg.tt-kmap .tt-kcell`).length, T), 16);
  assert.equal(await page.eval((x) => document.querySelector(`${x} .tt-sop .tt-expr`).textContent, T), "s_0 = a_0'·b_0 + a_0·b_0'");
  // the editor's "Truth Table from Module…" on a new table
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source Wizard');
  await page.eval(() => { const r = [...document.querySelectorAll('.dlg-overlay .src-types .st')].find((e) => /Truth Table/.test(e.textContent)); r.scrollIntoView(); r.click(); });
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'blank');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/blank.tt.json');
  await page.click(`${T} .tt-btn`, { text: 'Truth Table from Module…' });
  await page.waitDialog('Truth Table from Module');
  await page.dialogButton('OK');
  await page.waitDialog('Truth Table from Module');
  await page.dialogButton('Yes');
  await page.waitNoDialog();
  await page.waitFor((x) => document.querySelector(`${x} .tt-outputs`).value === 's_2, s_1, s_0', [T]);
  await page.waitFor(async () => (await (await fetch('/api/projects/TtMod/file?path=src%2Fblank.tt.json')).json()).outputs?.length === 3, [], { what: 'saved' });
});
