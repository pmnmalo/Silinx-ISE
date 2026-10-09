// UI: HDL editor (edit, autosave, Ctrl+S, undo, live check), Check Syntax and the Errors tab,
// the Design hierarchy, the processes that do not need ISE, I/O Pin Planning.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs, tick } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = `library ieee;
use ieee.std_logic_1164.all;

entity top is
  port (clk : in std_logic;
        sw  : in std_logic_vector(3 downto 0);
        led : out std_logic_vector(3 downto 0));
end top;

architecture rtl of top is
  signal r : std_logic_vector(3 downto 0) := (others => '0');
begin
  u_sub : entity work.sub port map (a => sw(0), y => open);
  process (clk) begin
    if rising_edge(clk) then r <= sw; end if;
  end process;
  led <= r;
end rtl;
`;
const SUB = 'module sub(input a, output y);\n  assign y = ~a;\nendmodule\n';
const TB = `library ieee; use ieee.std_logic_1164.all;
entity tb_top is end tb_top;
architecture t of tb_top is
  signal clk : std_logic := '0'; signal sw, led : std_logic_vector(3 downto 0) := "0000";
begin
  uut : entity work.top port map (clk => clk, sw => sw, led => led);
  clk <= not clk after 10 ns;
  sw <= "1010" after 50 ns;
end t;
`;
const project = (name, extra = {}) => makeProject(env, {
  name, top: 'top', simTop: 'tb_top', board: 'basys2',
  files: { 'src/top.vhd': TOP, 'src/sub.v': SUB, 'sim/tb_top.vhd': TB, ...extra }, roles: { 'sim/tb_top.vhd': 'sim' },
});
const editorText = (page, path) => page.eval((p) => window.SilinxApp.findDoc(`file:${p}`).editor.getValue(), path);

uiTest('editor: open from the hierarchy, edit, autosave, Ctrl+S, undo and live error markers', E, async (page) => {
  await project('EdPj');
  await page.openProject('EdPj');
  await page.treeRow('#hier', 'top', { dbl: true });
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd' && window.Silinx.active.editor);
  assert.equal(await editorText(page, 'src/top.vhd'), TOP);
  assert.match(await page.eval(() => document.getElementById('title-text').textContent), /EdPj - \[top\.vhd\]/);
  // type at the end of line 1 (a comment): the tab is marked modified, then saved automatically
  await page.eval(() => { const cm = window.Silinx.active.editor.cm; cm.focus(); cm.setCursor({ line: 0, ch: cm.getLine(0).length }); });
  await page.type(' -- autosaved');
  assert.equal(await page.eval(() => window.Silinx.active.tab.classList.contains('dirty')), true);
  await page.waitFor(() => !window.Silinx.active.tab.classList.contains('dirty'), [], { what: 'autosave' });
  assert.match(await readWs(env, 'EdPj', 'src/top.vhd'), /^library ieee; -- autosaved\n/);
  assert.equal(await page.eval(() => document.getElementById('status-text').textContent), 'Saved src/top.vhd');
  // Ctrl+S saves at once (before the autosave delay)
  // the cursor stays where the user typed (the delayed jump to the entity line must not move it)
  assert.equal(await page.eval(() => { const c = window.Silinx.active.editor.cm.getCursor(); return `${c.line}:${c.ch}`; }), '0:26');
  await page.type(' now');
  await page.key('s', { modifiers: 2 });
  await page.waitFor(() => !window.Silinx.active.tab.classList.contains('dirty'), [], { timeout: 500, what: 'saved by Ctrl+S' });
  assert.match(await readWs(env, 'EdPj', 'src/top.vhd'), /^library ieee; -- autosaved now\n/);
  // the Undo button of the editor bar, twice: back to the original text, saved again
  await page.click('.doc:not([hidden]) .editor-bar .tb-btn[title=Undo]');
  await page.click('.doc:not([hidden]) .editor-bar .tb-btn[title=Undo]');
  await page.waitFor((t) => window.Silinx.active.editor.getValue() === t, [TOP]);
  await page.waitFor(async (t) => (await (await fetch('/api/projects/EdPj/file?path=src/top.vhd')).text()) === t, [TOP], { what: 'undo saved' });
  // live check while typing: an unknown signal is marked in the gutter
  await page.eval(() => { const cm = window.Silinx.active.editor.cm; cm.focus(); cm.setCursor({ line: 16, ch: 0 }); });
  await page.type('  led <= ;\n');
  await page.waitForSelector('.doc:not([hidden]) .CodeMirror-lint-marker-error', { timeout: 5000 });
  // the Find button opens the CodeMirror search field
  await page.click('.doc:not([hidden]) .editor-bar .tb-btn[title="Find (Ctrl+F)"]');
  await page.waitForSelector('.CodeMirror-dialog input');
  await page.key('Escape');
  await page.waitFor(() => !document.querySelector('.CodeMirror-dialog'));
  // language templates menu of the editor bar inserts at the cursor
  await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Templates ▾' });
  await page.waitForSelector('body > .menu-popup');
  await page.click('body > .menu-popup .mi', { text: 'signal' });
  await page.waitFor(() => /signal\s+: std_logic_vector\(7 downto 0\)/.test(window.Silinx.active.editor.getValue()));
});

uiTest('Check Syntax: errors in the Errors tab with file and line, click jumps to the line, fixed afterwards', E, async (page) => {
  await project('SyntaxPj');
  await page.openProject('SyntaxPj');
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd' && window.Silinx.active.editor);
  // remove the ';' of "end process" (line 16)
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.cm.setValue(ed.getValue().replace('end process;', 'end process')); });
  await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Check Syntax' });
  await page.waitConsole(/Process "Check Syntax" failed \(1 error\(s\)/);
  await page.waitFor(() => document.querySelector('#console-tabs .tab[data-page=errors]').classList.contains('active'));
  assert.equal(await page.eval(() => document.getElementById('err-count').textContent), '(1)');
  const diag = await page.eval(() => document.querySelector('#console-errors .diag').textContent);
  assert.match(diag, /ERROR:HDLCompiler - "src\/top\.vhd" Line 1[67]: /);
  // the editor marks it too, and clicking the message moves the cursor to the line
  await page.waitForSelector('.doc:not([hidden]) .CodeMirror-lint-marker-error');
  await page.eval(() => window.Silinx.active.editor.cm.setCursor({ line: 0, ch: 0 }));
  await page.click('#console-errors .diag');
  await page.waitFor(() => /^Ln 1[67]/.test(document.getElementById('status-pos').textContent));
  // the Warnings tab and the Console tab
  await page.click('#console-tabs .tab[data-page=warnings]');
  await page.waitFor(() => !document.getElementById('console-warnings').hidden);
  // fix it; the Check Syntax process (Processes panel, double-click) succeeds and clears the errors
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.cm.setValue(ed.getValue().replace('end process\n', 'end process;\n')); });
  await page.treeRow('#hier', 'top');
  await page.treeRow('#procs', 'Check Syntax', { dbl: true, exact: true });
  await page.waitConsole(/Process "Check Syntax" completed successfully/);
  await page.waitFor(() => document.getElementById('err-count').textContent === '');
  assert.match(await page.eval(() => document.getElementById('console-errors').innerText), /No messages\./);
  // the process shows its status icon
  assert.ok(await page.eval(() => [...document.querySelectorAll('#procs .row')].find((r) => r.querySelector('.lbl').textContent === 'Check Syntax').querySelector('.status svg')));
  // the console Clear button
  await page.click('#console-clear');
  assert.equal(await page.consoleText(), '');
});

uiTest('Design hierarchy: modules, instances, files, views; set top by right-click; collapsed nodes stay collapsed', E, async (page) => {
  await project('HierPj', { 'constraints/top.ucf': 'NET "clk" LOC = "B8" ;\n' });
  await page.openProject('HierPj');
  const rows = () => page.eval(() => [...document.querySelectorAll('#hier .row')].filter((r) => r.getClientRects().length).map((r) => `${r.querySelector('.lbl').textContent}${r.querySelector('.meta') ? ` ${r.querySelector('.meta').textContent}` : ''}`));
  await page.waitFor(() => [...document.querySelectorAll('#hier .lbl')].some((e) => e.textContent === 'u_sub - sub'));
  assert.deepEqual(await rows(), ['HierPj', 'xc3s250e-4-cp132', 'top (top.vhd)', 'u_sub - sub (sub.v)', 'top.ucf']);
  assert.ok(await page.eval(() => document.querySelector('#hier .row.top-mod .lbl').textContent === 'top'));
  // Simulation view: the test bench is the root, the design under it
  await page.click('input[name=view][value=sim]');
  await page.waitFor(() => [...document.querySelectorAll('#hier .lbl')].some((e) => e.textContent === 'tb_top'));
  assert.deepEqual(await rows(), ['HierPj', 'Behavioral', 'tb_top (tb_top.vhd)', 'uut - top (top.vhd)', 'u_sub - sub (sub.v)']);
  assert.match(await page.eval(() => document.getElementById('proc-caption').textContent), /Processes: tb_top/);
  await page.click('input[name=view][value=impl]');
  // collapse 'top' (twisty): stays collapsed when the tree is redrawn (e.g. after a save)
  await page.click('#hier .row[data-key="m:top"] .twisty');
  await page.waitFor(() => !document.querySelector('#hier .row[data-key="m:top/u_sub"]')?.getClientRects().length);
  await page.eval(() => window.SilinxApp.renderHierarchy());
  assert.equal(await page.eval(() => document.querySelector('#hier .row[data-key="m:top/u_sub"]').getClientRects().length), 0);
  await page.click('#hier .row[data-key="m:top"] .twisty');
  // right-click ▸ Set as Top Module on the Verilog module
  await page.rightClick('#hier .row[data-key="m:top/u_sub"]');
  await page.waitForSelector('body > .menu-popup');
  const menu = await page.eval(() => [...document.querySelectorAll('body > .menu-popup .mi .lbl')].map((e) => e.textContent));
  for (const it of ['Set as Top Module', 'Open', 'Rename…', 'Check Syntax', 'View RTL Schematic', 'Convert to Schematic (editable)…', 'New Source…', 'Remove from Project', 'Source Properties…']) assert.ok(menu.includes(it), `context menu has ${it}: ${menu}`);
  await page.click('body > .menu-popup .mi', { text: 'Set as Top Module' });
  await page.waitConsole(/Top-level module set to 'sub'/);
  assert.equal((await env.server.api('GET', '/api/projects/HierPj')).top, 'sub');
  // the Libraries view lists the compiled units
  await page.click('#left-tabs .tab[data-page=libraries]');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#libs-page .lbl')].map((e) => e.textContent)), ['work', 'top', 'sub', 'tb_top']);
});

uiTest('processes that need no ISE: templates, RTL schematic, constraints, pin planning, summary, emulator, iMPACT, properties', E, async (page) => {
  await project('ProcPj', { 'constraints/top.ucf': 'NET "clk" LOC = "B8" | IOSTANDARD = LVCMOS33 ;\nNET "sw<0>" LOC = "P11" ;\n' });
  await page.openProject('ProcPj');
  await page.treeRow('#hier', 'top');
  await page.waitFor(() => /Processes: top/.test(document.getElementById('proc-caption').textContent));
  const run = async (label, check, what) => {
    await page.treeRow('#procs', label, { dbl: true, exact: true });
    await page.waitFor(check, [], { what: what || label, timeout: 15000 });
  };
  await run('View HDL Instantiation Template', () => window.Silinx.active?.id === 'tpl:top' && /u_top : entity work\.top/.test(window.Silinx.active.editor.getValue()));
  await run('View RTL Schematic', () => window.Silinx.active?.id === 'rtl:top' && document.querySelectorAll('.doc:not([hidden]) .se-svg [data-kind=sym]').length >= 2);
  // the RTL schematic pushes into an instance and comes back up
  assert.match(await page.eval(() => document.querySelector('.doc:not([hidden]) .rtl-crumbs').innerText), /top : top/);
  await run('Edit Constraints (Text)', () => window.Silinx.active?.id === 'file:constraints/top.ucf');
  await run('Check Constraints', () => /Process "Check Constraints" completed successfully/.test(document.getElementById('console-log').innerText));
  await run('I/O Pin Planning', () => window.Silinx.active?.id === 'pins' && document.querySelectorAll('.pin-planner tr').length > 5);
  await run('Design Summary/Reports', () => window.Silinx.active?.id === 'summary' && /ProcPj Project Status/.test(document.querySelector('.doc:not([hidden])').innerText));
  await run('Manage Configuration Project (iMPACT)', () => window.Silinx.active?.id === 'impact');
  await run('Emulate Behavioral Model (RTL)', () => window.Silinx.active?.id === 'emulator' && document.querySelector('.doc:not([hidden]) .emu-pcb'));
  // groups collapse with their twisty and stay collapsed when the panel is redrawn
  const kids = () => page.eval(() => [...document.querySelectorAll('#procs .row')].find((r) => r.querySelector('.lbl').textContent === 'Check Constraints').getClientRects().length);
  assert.ok(await kids());
  await page.eval(() => [...document.querySelectorAll('#procs .row')].find((r) => r.querySelector('.lbl').textContent === 'User Constraints').querySelector('.twisty').click());
  assert.equal(await kids(), 0);
  await page.eval(() => window.SilinxApp.renderProcesses());
  assert.equal(await kids(), 0);
  // right-click on a process: Run / Rerun / Stop / Process Properties (for the ISE steps)
  await page.treeRow('#procs', 'Synthesize - XST', { right: true });
  await page.waitForSelector('body > .menu-popup');
  const items = await page.eval(() => [...document.querySelectorAll('body > .menu-popup .mi')].map((r) => `${r.querySelector('.lbl').textContent}${r.classList.contains('disabled') ? ' (disabled)' : ''}`));
  assert.deepEqual(items, ['Run', 'Rerun', 'Stop (disabled)', 'Process Properties…']);
  await page.click('body > .menu-popup .mi', { text: 'Process Properties…' });
  await page.waitDialog('Process Properties');
  await page.fill('.dlg-overlay select', 'Area');
  await page.dialogButton('OK');
  await page.waitNoDialog();
  await page.waitFor(async () => (await (await fetch('/api/projects/ProcPj')).json()).impl.optMode === 'Area');
  // Simulation view processes
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', 'tb_top');
  await run('Behavioral Check Syntax', () => /Process "Check Syntax" completed successfully/.test(document.getElementById('console-log').innerText.split('Behavioral Check Syntax').pop()), 'behavioral check');
  await run('View RTL Schematic', () => window.Silinx.active?.id === 'rtl:tb_top');
});

uiTest('I/O Pin Planning: assign from the board resources, auto-assign, saved UCF keeps the INST / OFFSET / TIMEGRP lines', E, async (page) => {
  const UCF = [
    '# hand-written constraints',
    'NET "clk" LOC = "B8" | IOSTANDARD = LVCMOS33 ;',
    'NET "clk" TNM_NET = "clk" ;',
    'TIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50% ;',
    'INST "r_0" IOB = TRUE ;',
    'NET "sw<0>" OFFSET = IN 5 ns BEFORE "clk" ;',
    'TIMEGRP "outs" OFFSET = OUT 10 ns AFTER "clk" ;',
    'NET "led<*>" SLEW = SLOW ;',
    '',
  ].join('\n');
  await project('PinPj', { 'constraints/top.ucf': UCF });
  await page.openProject('PinPj');
  await page.menu('Tools', 'I/O Pin Planning');
  await page.waitFor(() => window.Silinx.active?.id === 'pins' && document.querySelectorAll('.pin-planner .pp-table tr').length === 10);
  const status = () => page.eval(() => document.querySelector('.pp-bar > span:last-child').textContent);
  assert.equal(await status(), '1/9 I/Os assigned');
  const rowOf = (net) => page.eval((n) => [...document.querySelectorAll('.pp-table tr')].findIndex((r) => r.cells[0]?.textContent === n), net);
  // led<0> to the board's LED LD0 through the resource list
  const r = await rowOf('led<0>');
  await page.eval((i) => { const s = document.querySelectorAll('.pp-table tr')[i].cells[2].querySelector('select'); s.value = 'M5'; s.dispatchEvent(new Event('change')); }, r);
  await page.waitFor(() => document.querySelector('.pp-bar > span:last-child').textContent === '2/9 I/Os assigned');
  assert.equal(await page.eval((i) => document.querySelectorAll('.pp-table tr')[i].cells[3].querySelector('input').value, r), 'M5');
  // the board panel shows the pin as used
  assert.ok(await page.eval(() => [...document.querySelectorAll('.pp-res .res.used')].some((e) => e.textContent.includes('M5'))));
  // a pin typed by hand that another net uses is flagged
  const r1 = await rowOf('led<1>');
  await page.eval((i) => { const inp = document.querySelectorAll('.pp-table tr')[i].cells[3].querySelector('input'); inp.value = 'm5'; inp.dispatchEvent(new Event('change')); }, r1);
  await page.waitFor(() => document.querySelectorAll('.pp-table td.conflict').length === 2);
  // Auto-assign from Board: every port matched by name
  await page.click('.pp-bar .btn', { text: 'Auto-assign from Board' });
  await page.waitFor(() => document.querySelector('.pp-bar > span:last-child').textContent === '9/9 I/Os assigned');
  assert.equal(await page.eval(() => document.querySelectorAll('.pp-table td.conflict').length), 0);
  // saved automatically: the UCF has the LOCs and still the lines the planner does not edit
  await page.waitFor(() => !window.Silinx.active.tab.classList.contains('dirty'), [], { what: 'pin planning saved' });
  await page.waitFor(async () => /NET "led<3>"\s+LOC = "P6"/.test(await (await fetch('/api/projects/PinPj/file?path=constraints/top.ucf')).text()));
  const ucf = await readWs(env, 'PinPj', 'constraints/top.ucf');
  for (const line of ['INST "r_0" IOB = TRUE ;', 'NET "sw<0>" OFFSET = IN 5 ns BEFORE "clk" ;', 'TIMEGRP "outs" OFFSET = OUT 10 ns AFTER "clk" ;', 'TIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50% ;']) {
    assert.ok(ucf.includes(line), `kept: ${line}\n${ucf}`);
  }
  assert.match(ucf, /NET "led<\*>"\s+SLEW = SLOW ;/);
  assert.match(ucf, /NET "clk"\s+LOC = "B8"/);
  assert.match(ucf, /NET "sw<3>"\s+LOC = "B4"/);
  // the constraints still check clean
  await page.eval(() => window.SilinxApp.openFile('constraints/top.ucf'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:constraints/top.ucf');
  await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Check Syntax' });
  await page.waitConsole(/Process "Check Constraints" completed successfully/);
  // Clear All empties the assignments
  await page.eval(() => window.SilinxApp.openPinPlanner('top'));
  await page.waitFor(() => window.Silinx.active?.id === 'pins' && document.querySelector('.pp-bar > span:last-child')?.textContent === '9/9 I/Os assigned');
  await page.click('.pp-bar .btn', { text: 'Clear All' });
  await page.waitFor(() => document.querySelector('.pp-bar > span:last-child').textContent === '0/9 I/Os assigned');
  await tick(100);
});
