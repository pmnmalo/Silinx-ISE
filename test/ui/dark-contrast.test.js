// UI: the dark theme as a whole (#159): every screen of the application in the dark theme (the
// modern interface) has its text readable — no text with a contrast ratio below 3 against what is
// behind it (a light background left in the code, a dark grey on the dark background), fields
// included. The Start page, the menus, the command palette, the toasts, the dialogs of Help and
// Tools, the New Project wizard; a project (gates): the Design / Files / Libraries panes, the HDL
// editor and its lint tooltip (also with a quick fix), Check Syntax with the help of a warning, the
// Errors / Warnings tabs (a quick fix), the schematic editor (its fields, Symbol Info, View HDL, the
// live simulation and its bus editor), the Design Summary, the pin planner, iMPACT, Design
// Properties, the Language Templates, Find, Rename; New Source with every type and every page of
// the Module and Test Bench wizards (a bidirectional port: the drive / expected columns); the ASM,
// FSM and Truth Table editors; blinky's RTL Schematic, ISim and the board emulator; blinky built
// with the Silinx toolchain: the summary, the reports, the Technology Schematic, the FPGA view,
// iMPACT. The light theme of the same screens has nothing below the minimum either.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, tick } from './harness.js';
import { CONTRAST } from './contrast.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const MIN = 3;

// texts left out on purpose (a selector each, with the reason), in every theme or in one
const EXCEPTIONS = [
  // the board emulator's board is a picture (drawn behind the labels, which the scan cannot see):
  // its silkscreen and port labels are coloured for the board, not for the page
  { skip: '.emu-pcb' },
  // a pin already used in the pin planner: dimmed (and struck through) on purpose in the light theme
  { theme: 'light', skip: '.pin-planner .pp-res .res.used' },
];

const BIREG = `library ieee; use ieee.std_logic_1164.all;
entity bireg is
  port (clk, we, oe : in std_logic; data : inout std_logic_vector(3 downto 0); q : out std_logic_vector(3 downto 0));
end bireg;
architecture rtl of bireg is
  signal r : std_logic_vector(3 downto 0) := (others => '0');
begin
  process (clk) begin if rising_edge(clk) then if we = '1' then r <= data; end if; end if; end process;
  data <= r when oe = '1' else (others => 'Z');
  q <= r;
end rtl;
`;
// a latch: a warning of Check Syntax with its help
const LATCH = `library ieee;
use ieee.std_logic_1164.all;
entity latch is
  port (en, d : in std_logic; q : out std_logic);
end latch;
architecture rtl of latch is
begin
  process (en, d)
  begin
    if en = '1' then
      q <= d;
    end if;
  end process;
end rtl;
`;

/** The page in the modern interface and the given theme (whatever SILINX_UI_INTERFACE says: the
 *  classic interface is light only), with the scan installed; returns the checker: check(where)
 *  adds what the scan finds on the whole page, `bad` the list. */
async function themed(page, theme) {
  await page.eval((t) => { localStorage.setItem('silinx.ui', 'modern'); localStorage.setItem('silinx.theme', t); }, theme);
  await page.reload();
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item'), [], { what: 'app boot' });
  assert.deepEqual(await page.eval(() => ({ ...document.documentElement.dataset })), { ui: 'modern', theme, drawer: 'open' });   // (the drawer of a narrow screen, #266)
  await page.eval(CONTRAST);
  const bad = [];
  const skip = EXCEPTIONS.filter((x) => !x.theme || x.theme === theme).map((x) => x.skip).join(', ');
  const check = async (where) => {
    await tick(100);   // the transitions of the theme's colours
    for (const x of await page.eval((m, s) => window.__lowContrast(document.body, m, s), MIN, skip)) bad.push(`${where}: ${x.ratio} '${x.text}' (${x.tag}.${x.cls}: ${x.fg} on ${x.bg})`);
  };
  return { check, bad };
}
const closeDialogs = (page) => page.eval(() => document.querySelectorAll('.dlg-overlay').forEach((d) => d.remove()));
const tab = (page, name) => page.click(`#console-tabs .tab[data-page=${name}]`);
// the next page of the wizard on top: false on its last page
async function nextPage(page) {
  const title = () => page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop()?.querySelector('.wiz-main h3')?.textContent ?? null);
  const before = await title();
  const clicked = await page.eval(() => {
    const b = [...[...document.querySelectorAll('.dlg-overlay')].pop().querySelectorAll('.dlg-buttons .btn')].find((x) => x.textContent.trim() === 'Next >' && !x.disabled);
    b?.click();
    return !!b;
  });
  if (!clicked) return false;
  await page.waitFor((t) => [...document.querySelectorAll('.dlg-overlay')].pop()?.querySelector('.wiz-main h3')?.textContent !== t, [before], { what: `the page after '${before}'` });
  return true;
}

for (const theme of ['dark', 'light']) {
  uiTest(`${theme} theme: the Start page, the menus, the command palette, the toasts, the Help and Tools dialogs, the New Project wizard`, E, async (page) => {
    const { check, bad } = await themed(page, theme);
    await check('Start page');
    for (const m of await page.eval(() => [...document.querySelectorAll('#menubar .item')].map((e) => e.textContent.trim()))) {
      await page.openMenu(m);
      await check(`menu ${m}`);
    }
    await page.closeMenus();
    for (const [menu, item] of [['Help', 'About Silinx ISE'], ['Help', 'Keyboard Shortcuts'], ['Help', 'Check for Updates…'], ['Help', 'Tell Us Who You Are…'], ['Tools', 'Toolchain Settings (ISE / Programmers)…'], ['File', 'Open Project…']]) {
      await page.menu(menu, item);
      await page.waitDialog();
      // Check for Updates: its answer (here: no network, the failure)
      if (item === 'Check for Updates…') await page.waitFor(() => !/Checking/.test(document.querySelector('.dlg-overlay').textContent), [], { what: 'update check answered' });
      await check(item);
      await closeDialogs(page);
    }
    await page.menu('File', 'New Project…');
    await page.waitDialog('New Project Wizard');
    await page.dialogButton('Next >');
    await page.fill('.dlg-overlay .wiz-main input[type=text]', 'DarkNew');
    for (let k = 1; ; k++) {
      await check(`New Project page ${k}`);
      if (!await nextPage(page)) break;
    }
    await closeDialogs(page);
    await page.click('#palette-btn');
    await page.waitForSelector('.pal');
    await page.type('pro');
    await check('command palette');
    await page.key('Escape');
    for (const kind of ['info', 'error', 'ok']) await page.eval(async (k) => (await import('/js/ui.js')).toast(`A ${k} toast`, k, 10000), kind);
    await check('toasts');
    assert.deepEqual(bad, []);
  });

  uiTest(`${theme} theme: a project (gates): panes, HDL editor, Check Syntax and its help, schematic editor, Symbol Info, live simulation, summary, pin planner, iMPACT, dialogs`, E, async (page) => {
    page.dialogAnswer = false;
    await makeProject(env, { name: `Gates_${theme}`, template: 'gates', files: { 'src/latch.vhd': LATCH } });
    const { check, bad } = await themed(page, theme);
    await page.openProject(`Gates_${theme}`);
    await check('Design pane');
    // the views' badges of the modules (#207, #220): [Schematic] [VHDL], also on the selected row
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#hier .badge')].map((b) => b.textContent)), ['Schematic', 'VHDL', 'VHDL']);
    await page.treeRow('#hier', 'gates', { exact: true });
    await check('Design pane, the badges of the selected row');
    for (const p of ['files', 'libs']) { await page.eval((x) => window.SilinxApp.showLeftPage(x), p); await check(`${p} pane`); }
    await page.eval(() => window.SilinxApp.showLeftPage('design'));
    // the HDL editor: Check Syntax of the latch, its warning with the help, the lint tooltip
    await page.eval(() => window.SilinxApp.openFile('src/latch.vhd'));
    await page.waitFor(() => window.Silinx.active?.id === 'file:src/latch.vhd' && window.Silinx.active.editor);
    await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Check Syntax' });
    await page.waitConsole(/Process "Check Syntax" completed/);
    await check('HDL editor, Console');
    await tab(page, 'warnings');
    await page.click('#console-warnings .diag .diag-more');
    await check('Warnings with the help');
    await tab(page, 'errors');
    await check('Errors');
    await tab(page, 'console');
    await page.waitForSelector('.doc:not([hidden]) .CodeMirror-lint-marker-warning', { timeout: 8000 });
    await page.hover('#menubar');
    await page.hover('.doc:not([hidden]) .CodeMirror-lint-marker-warning');
    await page.waitFor(() => document.querySelector('.CodeMirror-lint-tooltip')?.textContent, [], { what: 'lint tooltip' });
    await check('lint tooltip');
    await page.hover('#menubar');
    // an error with a quick fix (#179): its button in the tooltip, "Fix: …" in the Errors tab
    await page.eval(() => { const cm = window.Silinx.active.editor.cm; cm.setValue(cm.getValue().replace('q <= d;', 'q <= d')); });
    await page.waitForSelector('.doc:not([hidden]) .CodeMirror-lint-marker-error', { timeout: 8000 });
    await page.hover('.doc:not([hidden]) .CodeMirror-lint-marker-error');
    await page.waitFor(() => !!document.querySelector('.CodeMirror-lint-tooltip .xl-fix'), [], { what: 'the quick fix in the tooltip' });
    await check('lint tooltip with a quick fix');
    await page.hover('#menubar');
    await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Check Syntax' });
    await page.waitConsole(/Process "Check Syntax" failed/);
    await tab(page, 'errors');
    await page.waitForSelector('#console-errors .diag .diag-fix');
    await check('Errors with a quick fix');
    await page.click('#console-errors .diag .diag-fix');
    await page.waitFor(() => document.getElementById('err-count').textContent === '', [], { what: 'the error fixed' });
    await page.eval(() => window.SilinxApp.saveAll());
    await tab(page, 'console');
    // the editor's bar: Language Templates, and Edit ▸ Find…
    await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Templates ▾' });
    await page.waitForSelector('.menu-popup');
    await check('Language Templates');
    await page.closeMenus();
    await page.menu('Edit', 'Find…');
    await page.waitForSelector('.CodeMirror-dialog');
    await check('Find');
    await page.key('Escape');
    // the schematic editor: its fields, Symbol Info, View HDL, the live simulation and its bus editor
    const ED = '.doc:not([hidden]) .sch-editor';
    await page.eval(() => window.SilinxApp.openSch('src/gates.sch.json'));
    await page.waitFor((s) => document.querySelector(`${s} .se-symrow`), [ED], { what: 'schematic editor' });
    await check('schematic editor');
    await page.rightClick(`${ED} .se-symrow`, { text: 'M4_1' });
    await page.click('.menu-popup .mi', { text: 'Symbol Info…' });
    await page.waitFor((s) => document.querySelector(`${s} .se-symdoc .sd-truth`), [ED], { what: 'Symbol Info' });
    await page.click(`${ED} .se-symdoc .sd-switch [data-view=full]`);
    await check('Symbol Info');
    // (the panel may still be laid out again after the switch to its full view: a click that missed is repeated)
    for (let k = 0; ; k++) {
      await page.click(`${ED} .se-symdoc [data-act=close]`);
      try { await page.waitFor((s) => !document.querySelector(`${s} .se-symdoc`), [ED], { what: 'Symbol Info closed', timeout: 3000 }); break; } catch (e) { if (k >= 4) throw e; }
    }
    await page.click(`${ED} .se-btn[data-act=view]`);
    await page.waitForSelector(`${ED} .se-code`);
    await check('View HDL');
    await page.click(`${ED} .se-dialog .btn`, { text: 'Close' });
    await page.click(`${ED} .se-btn[data-act=sim]`);
    await page.waitFor((s) => document.querySelector(`${s} .se-simlayer .lv-ctl`), [ED], { what: 'live simulation' });
    // the bus input sw: its editor
    await page.click(`${ED} .lv-ctl`);
    await page.waitForSelector(`${ED} .lv-editor`);
    await check('live simulation');
    await page.key('Escape');
    // the summary, the pin planner, iMPACT, Design Properties, Rename (a name refused)
    await page.eval(() => window.SilinxApp.openSummary());
    await page.waitForSelector('.doc:not([hidden]) .summary-table');
    await check('Design Summary');
    await page.eval(() => window.SilinxApp.openPinPlanner());
    await page.waitForSelector('.doc:not([hidden]) .pin-planner');
    await check('pin planner');
    await page.eval(() => window.SilinxApp.openImpact());
    await page.waitForSelector('.doc:not([hidden]) .impact-chain .impact-dev');
    await check('iMPACT');
    await page.menu('Project', 'Design Properties…');
    await page.waitDialog('Design Properties');
    await check('Design Properties');
    await closeDialogs(page);
    await page.treeRow('#hier', 'latch', { right: true });
    await page.click('.menu-popup .mi', { text: 'Rename…' });
    await page.waitDialog('Rename');
    await page.fill('.dlg-overlay input[type=text]', 'src/gates.vhd');
    await page.dialogButton('Rename');
    await page.waitFor(() => document.querySelector('.dlg-overlay .hint')?.textContent);
    await check('Rename, a name refused');
    await closeDialogs(page);
    assert.deepEqual(bad, []);
  }, { timeout: 150000 });

  uiTest(`${theme} theme: New Source with every type, every page of the Module and Test Bench wizards (a bidirectional port)`, E, async (page) => {
    await makeProject(env, { name: `Src_${theme}`, top: 'bireg', files: { 'src/bireg.vhd': BIREG } });
    const { check, bad } = await themed(page, theme);
    await page.openProject(`Src_${theme}`);
    await page.menu('Project', 'New Source…');
    await page.waitDialog('New Source Wizard');
    const types = await page.eval(() => [...document.querySelectorAll('.dlg-overlay .src-types .st')].map((e) => e.textContent.trim()));
    assert.ok(types.length >= 10, types.join(' | '));
    await closeDialogs(page);
    for (const [k, type] of types.entries()) {
      await page.menu('Project', 'New Source…');
      await page.waitDialog('New Source Wizard');
      await page.eval((t) => { const r = [...document.querySelectorAll('.dlg-overlay .src-types .st')].find((e) => e.textContent.trim() === t); r.scrollIntoView(); r.click(); }, type);
      await check(`New Source ${type}`);
      // the name on the next page (the File Name and Location page, or the wizard's own)
      let named = false;
      const name = async () => { if (!named && await page.eval(() => !!document.querySelector('.dlg-overlay .wiz-main input[type=text]'))) { await page.fill('.dlg-overlay .wiz-main input[type=text]', `s${k}`); named = true; } };
      while (await nextPage(page)) { await name(); await check(`New Source ${type}, next page`); }
      // the wizards: Finish opens them; every page, the Test Bench wizard's vectors filled in
      if (/\(Wizard\)/.test(type)) {
        await page.dialogButton('Finish');
        await page.waitFor(() => document.querySelector('.dlg-overlay .dlg-title span')?.textContent.endsWith('Wizard') && !/New Source/.test(document.querySelector('.dlg-overlay .dlg-title span').textContent));
        await name();
        for (let p = 1; ; p++) {
          const title = await page.eval(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent || '');
          // the Module / Schematic wizards: a port from the quick buttons
          if (title === 'Inputs and Outputs') await page.click('.dlg-overlay .mw-qa');
          if (/Expected Outputs/.test(title)) {
            assert.ok(await page.eval(() => !!document.querySelector('.dlg-overlay th.th-drive')), 'the drive column of the bidirectional port');
            await page.click('.dlg-overlay .btn', { text: 'Fill Expected from Current Design' });
            await page.waitFor(() => /filled in from the current design/.test(document.querySelector('.dlg-overlay').textContent), [], { timeout: 20000 });
          }
          await check(`${type} page ${p}`);
          if (!await nextPage(page)) break;
        }
      }
      await closeDialogs(page);
    }
    assert.deepEqual(bad, []);
  }, { timeout: 150000 });

  uiTest(`${theme} theme: the ASM, FSM and Truth Table editors`, E, async (page) => {
    // (and a truth table of 16 outputs: the output tabs that wrap, the table scrolled to its last column, #176)
    const outs = Array.from({ length: 16 }, (_, k) => `y${k}`);
    const wide = { version: 1, name: 'wide', inputs: ['a', 'b', 'c'], outputs: outs, table: Object.fromEntries(outs.map((o, k) => [o, (k * 37 % 256).toString(2).padStart(8, '0')])) };
    await makeProject(env, { name: `Tools_${theme}`, files: { 'src/wide.tt.json': JSON.stringify(wide) } });
    const { check, bad } = await themed(page, theme);
    await page.openProject(`Tools_${theme}`);
    for (const [item, sel] of [['ASM State Machine Editor…', '.asm-editor'], ['FSM State Diagram Editor…', '.fsm-editor'], ['Truth Table / Karnaugh Map…', '.tt-editor']]) {
      await page.menu('Tools', item);
      await page.waitDialog('New Source Wizard');
      await page.dialogButton('Next >');
      await page.fill('.dlg-overlay .wiz-main input[type=text]', sel.slice(1, 4));
      await page.dialogButton('Next >');
      await page.dialogButton('Finish');
      await page.waitNoDialog();
      await page.waitFor((s) => document.querySelector(`.doc:not([hidden]) ${s}`), [sel], { what: item });
      await check(item);
    }
    await page.eval(() => window.SilinxApp.openTt('src/wide.tt.json'));
    await page.waitFor(() => document.querySelectorAll('.doc:not([hidden]) .tt-editor .tt-cell[data-out=y15]').length === 8, [], { what: 'the 16-output table' });
    await check('Truth Table, 16 outputs');
    await page.eval(() => { const c = document.querySelector('.doc:not([hidden]) .tt-editor .tt-cell[data-out=y15]'); c.scrollIntoView({ inline: 'end', block: 'nearest' }); });
    await check('Truth Table, 16 outputs, scrolled to y15');
    assert.deepEqual(bad, []);
  });

  uiTest(`${theme} theme: blinky's RTL Schematic, ISim and the board emulator`, E, async (page) => {
    await makeProject(env, { name: `Blinky_${theme}`, template: 'blinky' });
    const { check, bad } = await themed(page, theme);
    await page.openProject(`Blinky_${theme}`);
    await page.treeRow('#procs', 'View RTL Schematic', { dbl: true, exact: true });
    await page.waitFor(() => document.querySelector('.doc:not([hidden]) .sch-editor .se-svg [data-kind]'), [], { what: 'RTL Schematic', timeout: 30000 });
    await check('RTL Schematic');
    await page.click('input[name=view][value=sim]');
    await page.treeRow('#hier', 'tb_top');
    await page.treeRow('#procs', 'Simulate Behavioral Model', { dbl: true, exact: true });
    await page.waitFor(() => window.Silinx.active?.id === 'isim' && window.Silinx.active.view && !window.Silinx.active.view.state.running, [], { what: 'ISim', timeout: 30000 });
    await check('ISim');
    await page.click('input[name=view][value=impl]');
    await page.menu('Tools', 'Board Emulator');
    await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs, [], { what: 'board emulator', timeout: 30000 });
    await check('board emulator');
    assert.deepEqual(bad, []);
  }, { timeout: 120000 });

  uiTest(`${theme} theme: blinky built with the Silinx toolchain: summary, reports, Technology Schematic, FPGA view, iMPACT`, E, async (page) => {
    await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
    try {
      await makeProject(env, { name: `Built_${theme}`, template: 'blinky' });
      const { check, bad } = await themed(page, theme);
      await page.openProject(`Built_${theme}`);
      await page.treeRow('#procs', 'Generate Programming File', { dbl: true, exact: true });
      await page.waitConsole(/Process "Generate Programming File" completed successfully/, { timeout: 200000 });
      await check('built');
      await page.eval(() => window.SilinxApp.openSummary());
      await page.waitFor(() => /Programming File Generated/.test(document.querySelector('.doc:not([hidden])')?.innerText));
      await check('Design Summary');
      // the reports the summary links to
      const reports = await page.eval(() => document.querySelectorAll('.doc:not([hidden]) .page a').length);
      assert.ok(reports >= 3, `${reports} report links`);
      for (let k = 0; k < reports; k++) {
        await page.eval(() => window.SilinxApp.openSummary());
        await page.eval((i) => document.querySelectorAll('.doc:not([hidden]) .page a')[i].click(), k);
        await page.waitFor(() => !document.querySelector('.doc:not([hidden]) .page'), [], { what: `report ${k}` });
        await check(`report ${await page.eval(() => window.Silinx.active.title)}`);
      }
      await page.treeRow('#procs', 'View Technology Schematic', { dbl: true, exact: true });
      await page.waitFor(() => /Technology/.test(window.Silinx.active?.title) && document.querySelector('.doc:not([hidden]) .se-svg [data-kind]'), [], { what: 'Technology Schematic', timeout: 60000 });
      await check('Technology Schematic');
      await page.treeRow('#procs', 'View Implemented Design (FPGA)', { dbl: true, exact: true });
      await page.waitFor(() => window.SilinxApp.findDoc('fpgaview') && document.querySelector('.doc:not([hidden]) .fv-swatch'), [], { what: 'FPGA view', timeout: 60000 });
      await check('FPGA view');
      await page.eval(() => window.SilinxApp.openImpact());
      await page.waitFor(() => /Bitstream: design/.test(document.querySelector('.doc:not([hidden])')?.innerText));
      await check('iMPACT with a bitstream');
      assert.deepEqual(bad, []);
    } finally {
      await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
    }
  }, { timeout: 300000 });
}
