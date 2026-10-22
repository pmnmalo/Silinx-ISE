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

uiTest('editor: an edit made while the file is being saved is saved too, and saves of one file never overlap', E, async (page) => {
  await project('SlowSave');
  await page.openProject('SlowSave');
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd' && window.Silinx.active.editor);
  // the server answers each write after 1.5 s; record the writes and how many run at once
  await page.eval(() => {
    const orig = window.fetch;
    window.__writes = []; window.__inFlight = 0; window.__maxInFlight = 0;
    window.fetch = async (u, o) => {
      if (o?.method !== 'PUT' || !String(u).includes('/file?path=src%2Ftop.vhd')) return orig(u, o);
      window.__maxInFlight = Math.max(window.__maxInFlight, ++window.__inFlight);
      window.__writes.push(o.body.split('\n')[0]);
      await new Promise((r) => setTimeout(r, 1500));
      try { return await orig(u, o); } finally { window.__inFlight--; }
    };
  });
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.focus(); ed.setCursor({ line: 0, ch: ed.getValue().split('\n')[0].length }); });
  await page.type(' -- one');
  await page.key('s', { modifiers: 2 });
  await page.waitFor(() => window.__inFlight === 1, [], { what: 'the first save under way' });
  // typed during the save, then Ctrl+S again while the first save is still running
  await page.type(' two');
  await page.key('s', { modifiers: 2 });
  await page.waitFor(async () => (await (await fetch('/api/projects/SlowSave/file?path=src/top.vhd')).text()).startsWith('library ieee; -- one two\n'), [], { what: 'the edit made during the save, saved', timeout: 15000 });
  await page.waitFor(() => !window.Silinx.active.tab.classList.contains('dirty') && window.__inFlight === 0, [], { what: 'clean', timeout: 10000 });
  assert.equal(await page.eval(() => window.__maxInFlight), 1, 'one save at a time');
  assert.equal(await page.eval(() => window.__writes.at(-1)), 'library ieee; -- one two');
  assert.match(await readWs(env, 'SlowSave', 'src/top.vhd'), /^library ieee; -- one two\n/);
});

uiTest('editor: open from the hierarchy, edit, autosave, Ctrl+S, undo and live error markers', E, async (page) => {
  await project('EdPj');
  await page.openProject('EdPj');
  await page.treeRow('#hier', 'top', { dbl: true });
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd' && window.Silinx.active.editor);
  assert.equal(await editorText(page, 'src/top.vhd'), TOP);
  assert.match(await page.eval(() => document.getElementById('title-text').textContent), /EdPj - \[top\.vhd\]/);
  // type at the end of line 1 (a comment): the tab is marked modified, then saved automatically
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.focus(); ed.setCursor({ line: 0, ch: ed.getValue().split('\n')[0].length }); });
  await page.type(' -- autosaved');
  assert.equal(await page.eval(() => window.Silinx.active.tab.classList.contains('dirty')), true);
  await page.waitFor(() => !window.Silinx.active.tab.classList.contains('dirty'), [], { what: 'autosave' });
  assert.match(await readWs(env, 'EdPj', 'src/top.vhd'), /^library ieee; -- autosaved\n/);
  await page.waitFor(() => document.getElementById('status-text').textContent === 'Saved src/top.vhd', [], { what: 'status Saved' });
  // Ctrl+S saves at once (before the autosave delay)
  // the cursor stays where the user typed (the delayed jump to the entity line must not move it)
  assert.equal(await page.eval(() => { const c = window.Silinx.active.editor.getCursor(); return `${c.line}:${c.ch}`; }), '0:26');
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
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.focus(); ed.setCursor({ line: 16, ch: 0 }); });
  await page.type('  led <= ;\n');
  await page.waitForSelector('.doc:not([hidden]) .cm-lint-marker-error', { timeout: 5000 });
  // the Find button opens the editor's search panel
  await page.click('.doc:not([hidden]) .editor-bar .tb-btn[title="Find (Ctrl+F)"]');
  await page.waitForSelector('.cm-panel.cm-search input');
  await page.key('Escape');
  await page.waitFor(() => !document.querySelector('.cm-panel.cm-search'));
  // language templates menu of the editor bar inserts at the cursor
  await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Templates ▾' });
  await page.waitForSelector('body > .menu-popup');
  await page.click('body > .menu-popup .mi', { text: 'signal' });
  await page.waitFor(() => /signal\s+: std_logic_vector\(7 downto 0\)/.test(window.Silinx.active.editor.getValue()));
  // (#703) the templates are the HDL editor's (its bar and its context menu), no longer the Edit menu's
  await page.closeMenus();
  const edit = await page.openMenu('Edit');
  assert.ok(!edit.some((x) => x.label === 'Language Templates'), edit.map((x) => x.label).join(', '));
  assert.ok(edit.some((x) => x.label === 'Go to Line…'));
  await page.closeMenus();
});

uiTest('Check Syntax: errors in the Errors tab with file and line, click jumps to the line, fixed afterwards', E, async (page) => {
  await project('SyntaxPj');
  await page.openProject('SyntaxPj');
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd' && window.Silinx.active.editor);
  // remove the ';' of "end process" (line 16)
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.setValue(ed.getValue().replace('end process;', 'end process')); });
  await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Check Syntax' });
  await page.waitConsole(/Process "Check Syntax" failed \(1 error\(s\)/);
  await page.waitFor(() => document.querySelector('#console-tabs .tab[data-page=errors]').classList.contains('active'));
  assert.equal(await page.eval(() => document.getElementById('err-count').textContent), '(1)');
  const diag = await page.eval(() => document.querySelector('#console-errors .diag').textContent);
  assert.match(diag, /ERROR:HDLCompiler - "src\/top\.vhd" Line 1[67]: /);
  // the editor marks it too, and clicking the message moves the cursor to the line
  await page.waitForSelector('.doc:not([hidden]) .cm-lint-marker-error');
  await page.eval(() => window.Silinx.active.editor.setCursor({ line: 0, ch: 0 }));
  await page.click('#console-errors .diag');
  await page.waitFor(() => /^Ln 1[67]/.test(document.getElementById('status-pos').textContent));
  // the Warnings tab and the Console tab
  await page.click('#console-tabs .tab[data-page=warnings]');
  await page.waitFor(() => !document.getElementById('console-warnings').hidden);
  // fix it; the Check Syntax process (Processes panel, double-click) succeeds and clears the errors
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.setValue(ed.getValue().replace('end process\n', 'end process;\n')); });
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

// #302: Clear empties the Warnings and Errors tabs and their counts too, not only the Console
uiTest('#302 the console Clear button empties the Console, the Warnings and the Errors tabs and their counts', E, async (page) => {
  await project('ClearPj', { 'src/top.vhd': TOP.replace('end process;\n', 'end process\n') });
  await page.openProject('ClearPj');
  await page.treeRow('#hier', 'top');
  await page.treeRow('#procs', 'Check Syntax', { dbl: true, exact: true });
  await page.waitConsole(/Process "Check Syntax" failed/);
  // a warning too (from the console)
  await page.eval(() => window.SilinxApp.log('WARNING:Xst:737 - Found 1-bit latch for signal <q>.', 'warn'));
  await page.waitFor(() => document.getElementById('err-count').textContent !== '' && document.getElementById('warn-count').textContent !== '', [], { what: 'errors and warnings counted' });
  await page.click('#console-clear');
  assert.equal(await page.consoleText(), '');
  assert.deepEqual(await page.eval(() => [document.getElementById('err-count').textContent, document.getElementById('warn-count').textContent]), ['', '']);
  for (const tab of ['errors', 'warnings']) {
    await page.click(`#console-tabs .tab[data-page=${tab}]`);
    assert.equal(await page.eval((t) => document.getElementById(`console-${t}`).innerText.trim(), tab), 'No messages.');
  }
  // the next Check Syntax finds the error again
  await page.treeRow('#procs', 'Check Syntax', { dbl: true, exact: true });
  await page.waitFor(() => document.getElementById('err-count').textContent !== '', [], { what: 'the error again' });
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

uiTest('processes that need no ISE: RTL schematic, constraints, pin planning, summary, emulator, iMPACT, properties', E, async (page) => {
  await project('ProcPj', { 'constraints/top.ucf': 'NET "clk" LOC = "B8" | IOSTANDARD = LVCMOS33 ;\nNET "sw<0>" LOC = "P11" ;\n' });
  await page.openProject('ProcPj');
  await page.treeRow('#hier', 'top');
  await page.waitFor(() => /Processes: top/.test(document.getElementById('proc-caption').textContent));
  const run = async (label, check, what) => {
    await page.treeRow('#procs', label, { dbl: true, exact: true });
    await page.waitFor(check, [], { what: what || label, timeout: 15000 });
  };
  // no Design Utilities, no View HDL Instantiation Template (#1072)
  assert.ok(!(await page.eval(() => [...document.querySelectorAll('#procs .lbl')].some((l) => /Design Utilities|Instantiation Template/.test(l.textContent)))));
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

// VHDL names in mixed case, used in other cases than declared (#131)
const MIXED = `library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity Blink_Ctrl is
  generic ( Max_Count : integer := 3 );
  port ( Clk : in STD_LOGIC; Rst_N : in STD_LOGIC; LED_Out : out STD_LOGIC );
end Blink_Ctrl;
architecture RTL of Blink_Ctrl is
  signal Toggle_Q : STD_LOGIC := '0';
begin
  Flip : process (clk)
  begin
    if rising_edge(clk) then
      if rst_n = '0' then toggle_q <= '0'; else toggle_q <= not Toggle_Q; end if;
    end if;
  end process;
  led_out <= TOGGLE_Q;
end RTL;

library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity Top_Level is
  port ( CLK_50 : in std_logic; nReset : in std_logic; LEDs : out std_logic_vector(1 downto 0) );
end Top_Level;
architecture Structural of Top_Level is
  signal Blink_A : std_logic;
begin
  U_Blink : entity work.blink_ctrl generic map ( max_count => 5 ) port map ( clk => clk_50, rst_n => nreset, led_out => blink_a );
  leds <= blink_a & not blink_a;
end Structural;
`;

uiTest('View RTL Schematic of VHDL: the names as written in the design (instances, nets, ports, modules, generics), not lower case (#131)', E, async (page) => {
  await makeProject(env, { name: 'CasePj', top: 'top_level', board: 'basys2', files: { 'src/top.vhd': MIXED } });
  await page.openProject('CasePj');
  await page.eval(() => window.SilinxApp.renderHierarchy());
  await page.click('#hier .row[data-key="m:top_level"]');
  await page.treeRow('#procs', 'View RTL Schematic', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'rtl:top_level' && window.Silinx.active.viewer?.getDoc().symbols.length >= 3, [], { what: 'RTL schematic' });
  const view = () => page.eval(() => {
    const d = window.Silinx.active.viewer.getDoc();
    return { crumbs: document.querySelector('.doc:not([hidden]) .rtl-crumbs').innerText.replace(/\s+/g, ' ').trim(), name: d.name, ports: d.ports.map((p) => p.name), nets: [...new Set(d.labels.map((l) => l.net))],
      syms: d.symbols.map((s) => [s.name, s.type, s.params.module || s.params.title || null]) };
  });
  assert.deepEqual(await view(), {
    crumbs: '⬆ Up ⬇ Push into RTL Schematic (read-only) — Top_Level : Top_Level Open top.vhd', name: 'Top_Level', ports: ['CLK_50', 'nReset', 'LEDs'],
    nets: ['Blink_A'], syms: [['U_Blink', 'module', 'Blink_Ctrl'], ['inst_1', 'busjoin', null], ['inst_2', 'inv', null]],
  });
  // the instance's properties: its module, pins and generics as the entity writes them
  const inst = await page.eval(() => window.Silinx.active.viewer.getDoc().symbols.find((s) => s.type === 'module').id);
  await page.click(`.doc:not([hidden]) .se-svg [data-kind=sym][data-id="${inst}"]`);
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .se-ptitle')?.textContent === 'Module Blink_Ctrl', [], { what: 'instance properties' });
  assert.deepEqual(await page.eval(() => ({
    gens: [...document.querySelectorAll('.doc:not([hidden]) .se-gens .se-row')].map((r) => `${r.querySelector('.gn').textContent}=${r.querySelector('input').value}`),
    pins: document.querySelector('.doc:not([hidden]) .se-pins').textContent,
  })), { gens: ['Max_Count=5'], pins: 'Clk → CLK_50\nRst_N → nReset\nLED_Out → Blink_A' });
  // push into it (the instance is found by its name as written) and back up
  await page.click('.doc:not([hidden]) .rtl-nav', { text: '⬇ Push into' });
  await page.waitFor(() => window.Silinx.active.viewer.getDoc().name === 'Blink_Ctrl', [], { what: 'inside U_Blink' });
  assert.deepEqual(await view(), {
    crumbs: '⬆ Up ⬇ Push into RTL Schematic (read-only) — Top_Level : Top_Level › U_Blink : Blink_Ctrl Open top.vhd', name: 'Blink_Ctrl', ports: ['Clk', 'Rst_N', 'LED_Out'],
    nets: ['Toggle_Q'], syms: [['Flip', 'hdlblock', 'Flip'], ['LOGIC_1', 'hdlblock', 'assign']],
  });
  await page.click('.doc:not([hidden]) .rtl-nav', { text: '⬆ Up' });
  await page.waitFor(() => window.Silinx.active.viewer.getDoc().name === 'Top_Level', [], { what: 'back to the top' });
  assert.deepEqual((await page.consoleText()).split('\n').filter((l) => /warning|error/i.test(l)), []);
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

// #34: escaped Verilog port names (the EPFL benchmarks' \opcode[0] ) are XST's in the UCF: _opcode[0]_
uiTest('I/O Pin Planning and Check Constraints: escaped port names (\\opcode[0] ) are written and checked as XST names them (_opcode[0]_)', E, async (page) => {
  const ESC = 'module top(\\opcode[0] , \\opcode[1] , \\res[0] );\n  input \\opcode[0] , \\opcode[1] ;\n  output \\res[0] ;\n  assign \\res[0] = \\opcode[0] ^ \\opcode[1] ;\nendmodule\n';
  await makeProject(env, { name: 'EscPj', top: 'top', board: 'basys2', constraints: 'constraints/top.ucf',
    files: { 'src/top.v': ESC, 'constraints/top.ucf': '# pins\n', 'constraints/bad.ucf': 'NET "opcode[1]" LOC = "L3" ;\n' } });
  await page.openProject('EscPj');
  // the HDL name written by hand is an error, as in ngdbuild (ConstraintSystem:59)
  await page.eval(() => window.SilinxApp.openFile('constraints/bad.ucf'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:constraints/bad.ucf');
  await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Check Syntax' });
  await page.waitConsole(/Process "Check Constraints" failed \(1 error\(s\), 1 warning\(s\)\)/);
  const log = await page.eval(() => document.getElementById('console-log').innerText);
  assert.ok(log.includes('ERROR:ConstraintSystem - "constraints/bad.ucf" Line 1: NET "opcode[1]" is not found by ISE: XST names the port \'opcode[1]\' _opcode[1]_ in its netlist (use NET "_opcode[1]_")'), log);
  assert.ok(log.includes('WARNING:ConstraintSystem - "constraints/bad.ucf" Line 1: 3 port bit(s) of \'top\' have no LOC: _opcode[0]_, _opcode[1]_, _res[0]_'), log);
  // I/O Pin Planning lists the ports by XST's names and writes them so
  await page.eval(() => window.SilinxApp.openPinPlanner('top'));
  await page.waitFor(() => window.Silinx.active?.id === 'pins' && document.querySelectorAll('.pin-planner .pp-table tr').length === 4);
  const nets = await page.eval(() => [...document.querySelectorAll('.pp-table tr')].slice(1).map((r) => r.cells[0]?.textContent));
  assert.deepEqual([...nets].sort(), ['_opcode[0]_', '_opcode[1]_', '_res[0]_']);
  for (const [net, pin] of [['_opcode[0]_', 'P11'], ['_opcode[1]_', 'L3'], ['_res[0]_', 'M5']]) {
    await page.eval((n, p) => { const r = [...document.querySelectorAll('.pp-table tr')].find((x) => x.cells[0]?.textContent === n); const inp = r.cells[3].querySelector('input'); inp.value = p; inp.dispatchEvent(new Event('change')); }, net, pin);
  }
  await page.waitFor(() => document.querySelector('.pp-bar > span:last-child').textContent === '3/3 I/Os assigned');
  await page.waitFor(async () => /NET "_res\[0\]_"\s+LOC = "M5"/.test(await (await fetch('/api/projects/EscPj/file?path=constraints/top.ucf')).text()), [], { what: 'pin planning saved' });
  const ucf = await readWs(env, 'EscPj', 'constraints/top.ucf');
  assert.match(ucf, /^NET "_opcode\[0\]_"\s+LOC = "P11" ;$/m);
  assert.match(ucf, /^NET "_opcode\[1\]_"\s+LOC = "L3" ;$/m);
  assert.doesNotMatch(ucf, /NET "opcode\[1\]"/);
  // ... which Check Constraints accepts
  await page.eval(() => window.SilinxApp.openFile('constraints/top.ucf'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:constraints/top.ucf');
  await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Check Syntax' });
  await page.waitFor(() => /Process "Check Constraints" (completed|failed)/.test(document.getElementById('console-log').innerText.split('Process "Check Constraints" failed (1 error(s), 1 warning(s))').pop()));
  const after = await page.eval(() => document.getElementById('console-log').innerText.split('Process "Check Constraints" failed (1 error(s), 1 warning(s))').pop());
  assert.match(after, /Process "Check Constraints" completed successfully\s*$/, after);
});

// #63: a hand-written NET "opcode[1]" (the HDL name of the escaped port \opcode[1] , not a bus bit)
// stays as written; the bits of a bus written x[1] / x(1) are the planner's x<1>
uiTest('I/O Pin Planning keeps a hand-written bracket name that is not a bus bit (opcode[1]) as written; x[1] of a bus is x<1>', E, async (page) => {
  const V = 'module top(input [1:0] x, input \\opcode[1] , output y);\n  assign y = ^x ^ \\opcode[1] ;\nendmodule\n';
  await makeProject(env, { name: 'BrPj', top: 'top', board: 'basys2', constraints: 'constraints/top.ucf',
    files: { 'src/top.v': V, 'constraints/top.ucf': 'NET "opcode[1]" LOC = "L3" ;\nNET "x[1]" LOC = "P11" ;\nNET "x(0)" LOC = "K3" ;\n' } });
  await page.openProject('BrPj');
  await page.eval(() => window.SilinxApp.openPinPlanner('top'));
  await page.waitFor(() => window.Silinx.active?.id === 'pins' && document.querySelectorAll('.pin-planner .pp-table tr').length === 5);
  const rows = await page.eval(() => [...document.querySelectorAll('.pp-table tr')].slice(1).map((r) => `${r.cells[0].textContent}=${r.cells[3].querySelector('input').value}`));
  assert.deepEqual([...rows].sort(), ['_opcode[1]_=', 'x<0>=K3', 'x<1>=P11', 'y=']);
  assert.equal(await page.eval(() => document.querySelector('.pp-bar > span:last-child').textContent), '2/4 I/Os assigned');
  // an edit saves the UCF: opcode[1] as written (not opcode<1>), the bus bits as x<i>
  await page.eval(() => { const r = [...document.querySelectorAll('.pp-table tr')].find((x) => x.cells[0]?.textContent === 'y'); const inp = r.cells[3].querySelector('input'); inp.value = 'M5'; inp.dispatchEvent(new Event('change')); });
  await page.waitFor(() => document.querySelector('.pp-bar > span:last-child').textContent === '3/4 I/Os assigned');
  await page.waitFor(async () => /NET "y"\s+LOC = "M5"/.test(await (await fetch('/api/projects/BrPj/file?path=constraints/top.ucf')).text()), [], { what: 'pin planning saved' });
  const ucf = await readWs(env, 'BrPj', 'constraints/top.ucf');
  assert.match(ucf, /^NET "opcode\[1\]"\s+LOC = "L3" ; {2}# not a port of the top module$/m);
  assert.match(ucf, /^NET "x<1>"\s+LOC = "P11" ;$/m);
  assert.match(ucf, /^NET "x<0>"\s+LOC = "K3" ;$/m);
  assert.doesNotMatch(ucf, /opcode<1>/);
  // Check Constraints names the port as ngdbuild finds it
  await page.eval(() => window.SilinxApp.openFile('constraints/top.ucf'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:constraints/top.ucf');
  await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Check Syntax' });
  await page.waitConsole(/Process "Check Constraints" failed \(1 error\(s\), 1 warning\(s\)\)/);
  const log = await page.eval(() => document.getElementById('console-log').innerText);
  assert.ok(log.includes('ERROR:ConstraintSystem - "constraints/top.ucf" Line 7: NET "opcode[1]" is not found by ISE: XST names the port \'opcode[1]\' _opcode[1]_ in its netlist (use NET "_opcode[1]_")'), log);
  assert.ok(log.includes('WARNING:ConstraintSystem - "constraints/top.ucf" Line 7: 1 port bit(s) of \'top\' have no LOC: _opcode[1]_'), log);
});

// #65: VHDL extended identifiers are XST's _Mixed_ in the UCF, their case kept
uiTest('I/O Pin Planning and Check Constraints: VHDL extended identifiers (\\Mixed\\) are written and checked as XST names them (_Mixed_)', E, async (page) => {
  const VHD = 'library ieee; use ieee.std_logic_1164.all;\nentity top is port (\\Mixed\\ : in std_logic; \\Bus\\ : in std_logic_vector(1 downto 0); y : out std_logic); end top;\n'
    + 'architecture rtl of top is begin\n  y <= \\Mixed\\ xor \\Bus\\(0) xor \\Bus\\(1);\nend rtl;\n';
  await makeProject(env, { name: 'ExtPj', top: 'top', board: 'basys2', constraints: 'constraints/top.ucf',
    files: { 'src/top.vhd': VHD, 'constraints/top.ucf': '# pins\n', 'constraints/bad.ucf': 'NET "Mixed" LOC = "P11" ;\nNET "_Bus_<0>" LOC = "L3" ;\nNET "_Bus_<1>" LOC = "K3" ;\nNET "y" LOC = "M5" ;\n' } });
  await page.openProject('ExtPj');
  await page.eval(() => window.SilinxApp.openPinPlanner('top'));
  await page.waitFor(() => window.Silinx.active?.id === 'pins' && document.querySelectorAll('.pin-planner .pp-table tr').length === 5);
  const nets = await page.eval(() => [...document.querySelectorAll('.pp-table tr')].slice(1).map((r) => r.cells[0]?.textContent));
  assert.deepEqual([...nets].sort(), ['_Bus_<0>', '_Bus_<1>', '_Mixed_', 'y']);
  for (const [net, pin] of [['_Mixed_', 'P11'], ['_Bus_<0>', 'L3'], ['_Bus_<1>', 'K3'], ['y', 'M5']]) {
    await page.eval((n, p) => { const r = [...document.querySelectorAll('.pp-table tr')].find((x) => x.cells[0]?.textContent === n); const inp = r.cells[3].querySelector('input'); inp.value = p; inp.dispatchEvent(new Event('change')); }, net, pin);
  }
  await page.waitFor(() => document.querySelector('.pp-bar > span:last-child').textContent === '4/4 I/Os assigned');
  await page.waitFor(async () => /NET "y"\s+LOC = "M5"/.test(await (await fetch('/api/projects/ExtPj/file?path=constraints/top.ucf')).text()), [], { what: 'pin planning saved' });
  const ucf = await readWs(env, 'ExtPj', 'constraints/top.ucf');
  assert.match(ucf, /^NET "_Mixed_"\s+LOC = "P11" ;$/m);
  assert.match(ucf, /^NET "_Bus_<1>"\s+LOC = "K3" ;$/m);
  assert.doesNotMatch(ucf, /NET "(mixed|Mixed|_mixed_)"/);
  // Check Constraints: the saved file is clean; the HDL name written by hand is ngdbuild's error
  await page.eval(() => window.SilinxApp.openFile('constraints/top.ucf'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:constraints/top.ucf');
  await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Check Syntax' });
  await page.waitConsole(/Process "Check Constraints" completed successfully/);
  await page.eval(() => window.SilinxApp.openFile('constraints/bad.ucf'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:constraints/bad.ucf');
  await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Check Syntax' });
  await page.waitConsole(/Process "Check Constraints" failed \(1 error\(s\), 1 warning\(s\)\)/);
  const log = await page.eval(() => document.getElementById('console-log').innerText);
  assert.ok(log.includes('ERROR:ConstraintSystem - "constraints/bad.ucf" Line 1: NET "Mixed" is not found by ISE: XST names the port \'\\Mixed\\\' _Mixed_ in its netlist (use NET "_Mixed_")'), log);
  assert.ok(log.includes('WARNING:ConstraintSystem - "constraints/bad.ucf" Line 4: 1 port bit(s) of \'top\' have no LOC: _Mixed_'), log);
});

uiTest('I/O Pin Planning: Auto-assign from Board on ports no name matches (a, b, y): inputs on switches, outputs on LEDs', E, async (page) => {
  const GATE = `library ieee; use ieee.std_logic_1164.all;
entity gate is port (a, b : in std_logic; y : out std_logic); end gate;
architecture rtl of gate is begin y <= a and b; end rtl;
`;
  await makeProject(env, { name: 'PpGate', files: { 'src/gate.vhd': GATE }, top: 'gate', board: 'basys2' });
  await page.openProject('PpGate');
  await page.eval(() => window.SilinxApp.openPinPlanner('gate'));
  await page.waitFor(() => document.querySelector('.pp-bar > span:last-child')?.textContent === '0/3 I/Os assigned', [], { what: 'nothing assigned yet' });
  await page.click('.pp-bar .btn', { text: 'Auto-assign from Board' });
  await page.waitFor(() => document.querySelector('.pp-bar > span:last-child').textContent === '3/3 I/Os assigned', [], { what: 'all assigned' });
  await page.waitConsole(/I\/O Pin Planning: 3 I\/Os assigned from Digilent Basys2; 3 by direction \(a → sw<0>; b → sw<1>; y → led<0>\)\./);
  // saved into the UCF
  await page.waitFor(async () => /NET "y"\s+LOC = "M5"/.test(await (await fetch('/api/projects/PpGate/file?path=constraints/top.ucf')).text()), [], { what: 'UCF written' });
});

// #309: a signal with two drivers in hand-written HDL is an error, as XST's Multi-source: Check Syntax fails,
// the simulation does not run
uiTest('#309 a signal with two drivers: ERROR:Xst:528 Multi-source in Check Syntax, the simulation stopped', E, async (page) => {
  const TWO = `library ieee;\nuse ieee.std_logic_1164.all;\nentity top is\n  port (a, b : in std_logic; y : out std_logic);\nend top;\narchitecture rtl of top is\nbegin\n  y <= a;\n  y <= b;\nend rtl;\n`;
  const TB2 = `library ieee;\nuse ieee.std_logic_1164.all;\nentity tb_top is\nend tb_top;\narchitecture sim of tb_top is\n  signal a, b, y : std_logic := '0';\nbegin\n  uut : entity work.top port map (a => a, b => b, y => y);\n  process begin a <= '1'; wait for 10 ns; wait; end process;\nend sim;\n`;
  await project('TwoDrv', { 'src/top.vhd': TWO, 'sim/tb_top.vhd': TB2 });
  await page.openProject('TwoDrv');
  await page.treeRow('#hier', 'top');
  await page.treeRow('#procs', 'Check Syntax', { dbl: true, exact: true });
  await page.waitConsole(/Process "Check Syntax" failed/);
  const log = await page.consoleText();
  assert.ok(log.includes('ERROR:Xst:528 - "src/top.vhd" Line 9: Multi-source in Unit <top> on signal <y>; this signal is connected to multiple drivers (lines 8 and 9).'), log.slice(-1500));
  assert.equal(await page.eval(() => document.getElementById('err-count').textContent), '(1)');
  // Simulate Behavioral Model: its Check Syntax fails, no ISim
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', 'tb_top');
  const before = (await page.consoleText()).length;
  await page.treeRow('#procs', 'Simulate Behavioral Model', { dbl: true, exact: true });
  await page.waitFor((b) => /Process "Check Syntax" failed|Launching SSim/.test(document.getElementById('console-log').innerText.slice(b)), [before], { what: 'the simulation' });
  assert.doesNotMatch((await page.consoleText()).slice(before), /Launching SSim/);
});

// the editor's Find / Go to Line: Ctrl+F, Ctrl+G (Cmd+F on a Mac, where the browser runs the editor's Mac key map)
const MOD = { modifiers: process.platform === 'darwin' ? 4 : 2 };
uiTest('the HDL editor (CodeMirror 6, #349): completion and templates, search and go to line in Portuguese, folding, diagnostics shown without an edit', E, async (page) => {
  await project('CmPj');
  await page.openProject('CmPj');
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd' && window.Silinx.active.editor);
  const ed = (fn, ...a) => page.eval(fn, ...a);
  const options = () => ed(() => [...document.querySelectorAll('.cm-tooltip-autocomplete li')].map((li) => [li.querySelector('.xl-hint-kind')?.textContent, li.querySelector('.cm-completionLabel')?.textContent, li.querySelector('.cm-completionDetail')?.textContent || '']));

  // ---- completion while typing, from the second letter: the port first (P), its type as the detail
  await ed(() => { const e = window.Silinx.active.editor; e.focus(); e.setCursor({ line: 12, ch: 0 }); e.replaceSelection('\n'); e.setCursor({ line: 12, ch: 0 }); });
  await page.type('  l');
  assert.equal(await ed(() => !!document.querySelector('.cm-tooltip-autocomplete')), false, 'no list after one letter');
  await page.type('e');
  await page.waitFor(() => !!document.querySelector('.cm-tooltip-autocomplete li'), [], { what: 'the completion list' });
  assert.deepEqual((await options())[0], ['P', 'led', 'out std_logic_vector(3 downto 0)']);
  // (CodeMirror takes no Enter in the first 75 ms of a list: as typed by a person)
  await new Promise((r) => setTimeout(r, 150));
  await page.key('Enter');
  assert.equal(await ed(() => window.Silinx.active.editor.getValue().split('\n')[12]), '  led');
  // ---- a language template: its text indented as the line, the cursor where its $0 was
  await ed(() => { const e = window.Silinx.active.editor; e.setCursor({ line: 12, ch: 5 }); e.replaceSelection('\n'); });
  await page.type('  proce');
  await page.waitFor(() => document.querySelectorAll('.cm-tooltip-autocomplete li').length >= 3, [], { what: 'the templates' });
  const list = await options();
  assert.deepEqual(list.map((o) => o[1]), ['procedure', 'process', 'process (clocked, async reset)', 'process (clocked, sync reset)', 'process (combinational)']);
  assert.deepEqual(list.map((o) => o[0]), ['k', 'k', '❏', '❏', '❏']);
  await new Promise((r) => setTimeout(r, 150));
  for (let i = 0; i < 4; i++) await page.key('ArrowDown');
  await page.key('Enter');
  assert.deepEqual(await ed(() => window.Silinx.active.editor.getValue().split('\n').slice(13, 17)), ['  process (all)', '  begin', '    ', '  end process;']);
  assert.deepEqual(await ed(() => window.Silinx.active.editor.getCursor()), { line: 15, ch: 4 });
  // one Undo removes the template
  await page.key('z', MOD);
  assert.equal(await ed(() => window.Silinx.active.editor.getValue().split('\n')[13]), '  proce');
  await ed((t) => window.Silinx.active.editor.setValue(t), TOP);

  // ---- Find and Go to Line in Portuguese (the editor's own texts follow the language)
  await ed(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await ed(() => window.Silinx.active.editor.focus());
  await page.key('f', MOD);
  await page.waitForSelector('.doc:not([hidden]) .cm-panel.cm-search');
  assert.deepEqual(await ed(() => { const p = document.querySelector('.doc:not([hidden]) .cm-search'); return [p.querySelector('input[name=search]').placeholder, ...[...p.querySelectorAll('button')].map((b) => b.textContent)]; }),
    ['Procurar', 'seguinte', 'anterior', 'todos', 'substituir', 'substituir todos', '×']);
  await page.type('rising_edge');
  await page.key('End');   // (the panel takes its query on a key's release, as typed)
  await page.key('Enter');
  assert.deepEqual(await ed(() => window.Silinx.active.editor.getCursor()), { line: 14, ch: 18 });
  await page.key('Escape');
  await page.waitFor(() => !document.querySelector('.doc:not([hidden]) .cm-search'), [], { what: 'the search closed' });
  await ed(() => window.Silinx.active.editor.exec('jumpToLine'));
  await page.waitForSelector('.doc:not([hidden]) .cm-goto-line input[name=line]');
  assert.match(await ed(() => document.querySelector('.doc:not([hidden]) .cm-goto-line').textContent), /Ir para a linha/);
  await ed(() => document.querySelector('.doc:not([hidden]) .cm-goto-line input[name=line]').select());
  await page.type('17');
  await page.key('End');
  await page.key('Enter');
  assert.equal(await ed(() => window.Silinx.active.editor.getCursor().line), 16);
  await ed(async () => { (await import('/js/i18n.js')).setLanguage('en'); });

  // ---- folding by indentation: the process folds to its 'end process;', unfolds again
  await page.waitForSelector('.doc:not([hidden]) .cm-foldGutter span[title="Fold line"]');
  await ed(() => { const e = window.Silinx.active.editor; e.focus(); e.setCursor({ line: 13, ch: 2 }); });
  await page.key('q', { modifiers: 2 });
  await page.waitForSelector('.doc:not([hidden]) .cm-foldPlaceholder');
  assert.equal(await ed(() => [...document.querySelectorAll('.doc:not([hidden]) .cm-line')].some((l) => l.textContent.startsWith('    if rising_edge'))), false, 'the process body folded');
  await page.click('.doc:not([hidden]) .cm-foldPlaceholder');
  await page.waitFor(() => [...document.querySelectorAll('.doc:not([hidden]) .cm-line')].some((l) => l.textContent.startsWith('    if rising_edge')), [], { what: 'unfolded' });
  assert.equal(await ed(() => window.Silinx.active.editor.getValue()), TOP);

  // ---- diagnostics given by the app without an edit of the text: shown at once, and cleared
  await page.waitFor(() => window.Silinx.active.editor.diagnostics().length === 0, [], { what: 'no diagnostic' });
  await ed(() => window.Silinx.active.editor.setDiagnostics([{ line: 3, col: 8, message: 'a test warning', severity: 'warning' }]));
  assert.deepEqual(await ed(() => window.Silinx.active.editor.diagnostics()), [{ line: 3, severity: 'warning', message: 'a test warning' }]);
  await page.waitForSelector('.doc:not([hidden]) .cm-lint-marker-warning');
  await ed(() => window.Silinx.active.editor.setDiagnostics([]));
  assert.deepEqual(await ed(() => window.Silinx.active.editor.diagnostics()), []);
  await page.waitFor(() => !document.querySelector('.doc:not([hidden]) .cm-lint-marker'), [], { what: 'the marker gone' });
});
