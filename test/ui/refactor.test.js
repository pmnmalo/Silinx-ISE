// UI: refactoring in the HDL editor. Rename Symbol (#178): F2 on a name (or the editor's right-click
// menu) asks the new name, renames every place that means the same object in the file (not the
// comment, not another object of the same name), one Undo reverts it all; an invalid name or a
// clash is refused in the dialog; a port follows in the instances of the other files; the name of
// the entity opens the project's Rename; the dialog in Portuguese. Quick fixes of the errors (#179):
// from the lint tooltip, from the Errors tab ("Fix: …") and with Ctrl+. (Cmd+.); one undoable edit,
// the error gone after it; in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupUi, uiTest, makeProject, readWs, tick } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const COUNTER = `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

-- cnt counts the clock ticks
entity counter is
  port (clk : in std_logic;
        q   : out std_logic_vector(3 downto 0));
end counter;

architecture rtl of counter is
  signal cnt : unsigned(3 downto 0) := (others => '0');
begin
  process (clk)
  begin
    if rising_edge(clk) then
      cnt <= cnt + 1;
    end if;
  end process;
  q <= std_logic_vector(CNT);
end rtl;
`;
const TOP = `library ieee;
use ieee.std_logic_1164.all;

entity top is
  port (clk : in std_logic;
        led : out std_logic_vector(3 downto 0));
end top;

architecture rtl of top is
begin
  u_cnt : entity work.counter port map (clk => clk, q => led);
end rtl;
`;
const BLINK = `// cnt divides the clock
module blink(input clk, output led);
  reg [3:0] cnt = 4'd0;
  always @(posedge clk) cnt <= cnt + 1'b1;
  assign led = cnt[3];
endmodule
`;

// the editor's Undo: Ctrl+Z (Cmd+Z on a Mac, where the browser runs the editor's Mac key map)
const UNDO = { modifiers: process.platform === 'darwin' ? 4 : 2 };
const ed = (page) => page.eval(() => window.Silinx.active.editor.getValue());
// put the cursor on the k-th (0-based) whole-word `word` of the active editor
const cursorOn = (page, word, k = 0) => page.eval((w, n) => {
  const ed = window.Silinx.active.editor, text = ed.getValue();
  const re = new RegExp(`(?<![\\w$])${w}(?![\\w$])`, 'g');
  let m;
  for (let i = 0; (m = re.exec(text)); i++) if (i === n) break;
  ed.view.dispatch({ selection: { anchor: m.index + 1 } });
  ed.focus();
  const c = ed.view.coordsAtPos(m.index + 1);
  return { x: c.left + 1, y: (c.top + c.bottom) / 2 };
}, word, k);
const dlgText = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('.dlg-body').innerText);
const checkSyntax = async (page, re) => {
  await page.eval(() => { document.getElementById('console-log').innerHTML = ''; });
  await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Check Syntax' });
  await page.waitConsole(re);
};

uiTest('Rename Symbol (F2): every place of the signal in the file, not the comment; one Undo reverts it; clashes refused; a port follows in the other file', E, async (page) => {
  await makeProject(env, { name: 'RenamePj', top: 'top', files: { 'src/counter.vhd': COUNTER, 'src/top.vhd': TOP } });
  await page.openProject('RenamePj');
  await page.eval(() => window.SilinxApp.openFile('src/counter.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/counter.vhd' && window.Silinx.active.editor);

  // ---- F2 on the signal: the dialog with its name and where it is used
  await cursorOn(page, 'cnt', 1);
  await page.key('F2');
  assert.equal(await page.waitDialog('Rename Symbol'), 'Rename Symbol');
  assert.equal(await page.eval(() => document.querySelector('.rename-dlg input[type=text]').value), 'cnt');
  assert.match(await dlgText(page), /Renames the signal 'cnt' everywhere it is used in this file: 4 places\./);
  // a name already declared there, then a reserved word: refused, the dialog stays
  await page.fill('.rename-dlg input[type=text]', 'Q');
  await page.dialogButton('Rename');
  await page.waitFor(() => /already used for another object/.test(document.querySelector('.rename-dlg .rename-error').textContent));
  assert.equal(await page.eval(() => document.querySelector('.rename-dlg .rename-error').textContent), "'Q' is already used for another object where 'cnt' is visible: choose another name.");
  await page.fill('.rename-dlg input[type=text]', 'process');
  assert.equal(await page.eval(() => document.querySelector('.rename-dlg .rename-error').textContent), "'process' is a reserved word of VHDL.");
  await page.fill('.rename-dlg input[type=text]', 'count');
  await page.dialogButton('Rename');
  await page.waitNoDialog();
  const renamed = COUNTER.replace('signal cnt :', 'signal count :').replace('cnt <= cnt + 1;', 'count <= count + 1;').replace('std_logic_vector(CNT)', 'std_logic_vector(count)');
  assert.equal(await ed(page), renamed);
  // ---- one Undo (Ctrl+Z in the editor) reverts the whole rename; Redo makes it again
  await page.eval(() => window.Silinx.active.editor.focus());
  await page.key('z', UNDO);
  assert.equal(await ed(page), COUNTER);
  await page.eval(() => window.Silinx.active.editor.exec('redo'));
  assert.equal(await ed(page), renamed);
  await checkSyntax(page, /Process "Check Syntax" completed successfully\s*$/m);
  assert.equal(await page.eval(() => document.getElementById('err-count').textContent + document.getElementById('warn-count').textContent), '');

  // ---- a port: also in the port map of the other file (not open: written)
  await cursorOn(page, 'q', 0);
  await page.key('F2');
  await page.waitDialog('Rename Symbol');
  assert.match(await dlgText(page), /Renames the port 'q' everywhere it is used in this file: 2 places\.\s+Also in the instances of 'counter' in the other files \(src\/top\.vhd\)/);
  assert.equal(await page.eval(() => document.querySelector('.rename-dlg input[type=checkbox]').checked), true);
  await page.fill('.rename-dlg input[type=text]', 'value');
  await page.dialogButton('Rename');
  await page.waitNoDialog();
  assert.equal(await ed(page), renamed.replace('q   : out', 'value   : out').replace('  q <= std_logic_vector', '  value <= std_logic_vector'));
  const top = TOP.replace('q => led', 'value => led');
  for (let k = 0; k < 50 && (await readWs(env, 'RenamePj', 'src/top.vhd')) !== top; k++) await tick(100);
  assert.equal(await readWs(env, 'RenamePj', 'src/top.vhd'), top);
  await checkSyntax(page, /Process "Check Syntax" completed successfully\s*$/m);
  assert.equal(await page.eval(() => document.getElementById('err-count').textContent + document.getElementById('warn-count').textContent), '');

  // ---- not a name of this file: a message, no dialog
  await cursorOn(page, 'std_logic', 0);
  await page.key('F2');
  await page.waitFor(() => [...document.querySelectorAll('.toast')].some((t) => t.textContent === "'std_logic' is not declared in this file: rename it where it is declared."), [], { what: 'the message' });
  assert.equal(await page.dialogCount(), 0);

  // ---- the entity: the project's Rename (module and file)
  await cursorOn(page, 'counter', 0);
  await page.key('F2');
  assert.equal(await page.waitDialog('Rename'), 'Rename');
  assert.equal(await page.eval(() => [...document.querySelectorAll('.dlg-overlay input[type=text]')].map((i) => i.value).join(' | ')), 'counter | src/counter.vhd');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();

  // ---- in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await cursorOn(page, 'count', 1);
  await page.key('F2');
  assert.equal(await page.waitDialog('Mudar o Nome do Símbolo'), 'Mudar o Nome do Símbolo');
  assert.match(await dlgText(page), /^Novo nome:\s+Muda o nome de 'count' \(sinal\) em todos os sítios onde é usado neste ficheiro: 4 sítios\.\s*$/);
  await page.fill('.rename-dlg input[type=text]', 'clk');
  await page.dialogButton('Mudar o Nome');
  await page.waitFor(() => !!document.querySelector('.rename-dlg .rename-error').textContent);
  assert.equal(await page.eval(() => document.querySelector('.rename-dlg .rename-error').textContent), "'clk' já é usado para outro objeto onde 'count' é visível: escolha outro nome.");
  await page.dialogButton('Cancelar');
  await page.waitNoDialog();
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
});

uiTest('Rename Symbol from the right-click menu in Verilog: case-sensitive, not the comment; Undo', E, async (page) => {
  await makeProject(env, { name: 'RenameV', top: 'blink', files: { 'src/blink.v': BLINK } });
  await page.openProject('RenameV');
  await page.eval(() => window.SilinxApp.openFile('src/blink.v'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/blink.v' && window.Silinx.active.editor);
  const p = await cursorOn(page, 'cnt', 2);
  await page.rightClick(p);
  await page.waitFor(() => [...document.querySelectorAll('body > .menu-popup > .mi .lbl')].some((l) => l.textContent === 'Rename Symbol…'), [], { what: 'the menu' });
  const idx = await page.eval(() => [...document.querySelectorAll('body > .menu-popup > .mi')].findIndex((m) => m.querySelector('.lbl')?.textContent === 'Rename Symbol…'));
  assert.equal(await page.eval((i) => document.querySelectorAll('body > .menu-popup > .mi')[i].querySelector('.sc').textContent, idx), 'F2');
  await page.click('body > .menu-popup > .mi', { index: idx });
  await page.waitDialog('Rename Symbol');
  assert.match(await dlgText(page), /Renames the signal 'cnt' everywhere it is used in this file: 4 places\./);
  await page.fill('.rename-dlg input[type=text]', 'div');
  await page.dialogButton('Rename');
  await page.waitNoDialog();
  const renamed = BLINK.replace('reg [3:0] cnt =', 'reg [3:0] div =').replace('cnt <= cnt + 1', 'div <= div + 1').replace('cnt[3]', 'div[3]');
  assert.equal(await ed(page), renamed);
  await checkSyntax(page, /Process "Check Syntax" completed successfully\s*$/m);
  await page.eval(() => window.Silinx.active.editor.focus());
  await page.key('z', UNDO);
  assert.equal(await ed(page), BLINK);
});

// ---------------------------------------------------------------- quick fixes (#179)
const GATE = `library ieee;
use ieee.std_logic_1164.all;

entity gate is
  port (clk, enable : in std_logic;
        q : out std_logic);
end gate;

architecture rtl of gate is
  signal r : std_logic := '0';
begin
  process (clk)
  begin
    if rising_edge(clk) then
      if enabel = '1' then
        r <= not r;
      end if;
    end if;
  end process;
  q <= r;
end rtl;
`;
const LED = `module blink(input clk, output led);
  reg [3:0] cnt = 4'd0;
  always @(posedge clk) begin
    cnt <= cnt + 1'b1;
    led <= cnt[3];
  end
endmodule
`;
const errorMarker = (page, line) => page.waitFor((l) => window.Silinx.active.editor.diagnostics().some((d) => d.line === l && d.severity === 'error') && !!document.querySelector('.doc:not([hidden]) .cm-lint-marker-error'), [line], { what: `the error marker of line ${line}` });
const noMarkers = (page) => page.waitFor(() => !document.querySelector('.doc:not([hidden]) .cm-lint-marker'), [], { what: 'no lint marker' });
const lintTooltip = async (page) => {
  await page.eval(() => document.querySelectorAll('.xl-lint-tip').forEach((t) => t.remove()));
  await page.hover('#statusbar');   // (off the marker: the tooltip closes)
  await page.hover('.doc:not([hidden]) .cm-lint-marker-error');
  return page.waitFor(() => document.querySelector('.xl-lint-tip')?.textContent, [], { what: 'lint tooltip' });
};

uiTest('quick fix of a misspelt name: from the lint tooltip (the error gone, one Undo), from the Errors tab, in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'FixPj', top: 'gate', files: { 'src/gate.vhd': GATE } });
  await page.openProject('FixPj');
  await page.eval(() => window.SilinxApp.openFile('src/gate.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/gate.vhd' && window.Silinx.active.editor);
  const fixed = GATE.replace('if enabel =', 'if enable =');

  // ---- the tooltip of the error: the message, its help and the fix
  await errorMarker(page, 15);
  const tip = await lintTooltip(page);
  assert.match(tip, /^'enabel' is not declared\n\nExplanation: The name 'enabel' is used but it is not declared/);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.xl-lint-tip .xl-fix')].map((b) => b.textContent)), ["Fix: Change 'enabel' to 'enable'"]);
  await page.click('.xl-lint-tip .xl-fix');
  assert.equal(await ed(page), fixed);
  await noMarkers(page);
  // one Undo reverts it, and the error is back
  await page.eval(() => window.Silinx.active.editor.focus());
  await page.key('z', UNDO);
  assert.equal(await ed(page), GATE);
  await errorMarker(page, 15);

  // ---- the Errors tab: "Fix: …" in the row of the error
  await checkSyntax(page, /Process "Check Syntax" failed \(1 error\(s\), 0 warning\(s\)\)/);
  await page.waitFor(() => document.querySelector('#console-tabs .tab[data-page=errors]').classList.contains('active'));
  assert.match(await page.eval(() => document.querySelector('#console-errors .diag').textContent), /^ERROR:HDLCompiler - "src\/gate\.vhd" Line 15: 'enabel' is not declared▸ Explanation and fixFix: Change 'enabel' to 'enable'$/);
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('#console-errors .diag .diag-fix')?.textContent === "Corrigir: Mudar 'enabel' para 'enable'", [], { what: 'the fix in Portuguese' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await page.click('#console-errors .diag .diag-fix');
  await page.waitFor(() => document.getElementById('err-count').textContent === '', [], { what: 'no error' });
  assert.equal(await ed(page), fixed);
  assert.equal(await page.eval(() => document.getElementById('console-errors').textContent), 'No messages.');
  await noMarkers(page);
  await checkSyntax(page, /Process "Check Syntax" completed successfully\s*$/m);
  assert.equal(await page.eval(() => document.getElementById('err-count').textContent + document.getElementById('warn-count').textContent), '');
});

uiTest('quick fix with Ctrl+. (and the right-click menu): a procedural assignment to a wire output becomes a reg; in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'FixV', top: 'blink', files: { 'src/blink.v': LED } });
  await page.openProject('FixV');
  await page.eval(() => window.SilinxApp.openFile('src/blink.v'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/blink.v' && window.Silinx.active.editor);
  await errorMarker(page, 5);
  const tip = await lintTooltip(page);
  assert.match(tip, /^Procedural assignment to a non-register <led> is not permitted/);
  await page.hover('#statusbar');   // (off the marker: the tooltip closes)
  // ---- Ctrl+. on the line of the error: the menu of its fixes (in Portuguese)
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.closeMenus();
  await cursorOn(page, 'led', 1);
  await page.key('.', { modifiers: process.platform === 'darwin' ? 4 : 2 });
  await page.waitFor(() => document.querySelector('body > .menu-popup .mi .lbl')?.textContent, [], { what: 'the quick fix menu' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('body > .menu-popup .mi .lbl')].map((l) => l.textContent)), ["Corrigir: Declarar 'led' como reg"]);
  await page.closeMenus();
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // ---- the right-click menu: Quick Fix… (Ctrl+.)
  const p = await cursorOn(page, 'led', 1);
  await page.rightClick(p);
  await page.waitFor(() => [...document.querySelectorAll('body > .menu-popup > .mi .lbl')].some((l) => l.textContent === 'Quick Fix…'), [], { what: 'the menu' });
  const idx = await page.eval(() => [...document.querySelectorAll('body > .menu-popup > .mi')].findIndex((m) => m.querySelector('.lbl')?.textContent === 'Quick Fix…'));
  await page.click('body > .menu-popup > .mi', { index: idx });
  await page.waitFor(() => [...document.querySelectorAll('body > .menu-popup .mi .lbl')].map((l) => l.textContent).join() === "Fix: Declare 'led' as reg", [], { what: 'the quick fix menu' });
  await page.click('body > .menu-popup .mi');
  assert.equal(await ed(page), LED.replace('output led', 'output reg led'));
  await noMarkers(page);
  await checkSyntax(page, /Process "Check Syntax" completed successfully\s*$/m);
  assert.equal(await page.eval(() => document.getElementById('err-count').textContent + document.getElementById('warn-count').textContent), '');
  await page.eval(() => window.Silinx.active.editor.focus());
  await page.key('z', UNDO);
  assert.equal(await ed(page), LED);
});

uiTest('quick fix of the ";" missing after the attribute specification of a state diagram\'s VHDL: the error on that line, the fix adds it (#183)', E, async (page) => {
  const FSM = GATE.replace("  signal r : std_logic := '0';\n", "  signal r : std_logic := '0';\n  attribute fsm_encoding : string;\n  attribute fsm_encoding of r : signal is \"user\";\n");
  await makeProject(env, { name: 'FixAttr', top: 'gate', files: { 'src/gate.vhd': FSM.replace('if enabel =', 'if enable =').replace('is "user";', 'is "user"') } });
  await page.openProject('FixAttr');
  await page.eval(() => window.SilinxApp.openFile('src/gate.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/gate.vhd' && window.Silinx.active.editor);
  await errorMarker(page, 12);
  const tip = await lintTooltip(page);
  assert.match(tip, /^expected ';' after "user"\n\nExplanation: A statement or declaration is not finished/);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.xl-lint-tip .xl-fix')].map((b) => b.textContent)), ["Fix: Add ';' at the end of the line"]);
  await page.click('.xl-lint-tip .xl-fix');
  assert.equal(await ed(page), FSM.replace('if enabel =', 'if enable ='));
  await noMarkers(page);
  await checkSyntax(page, /Process "Check Syntax" completed successfully\s*$/m);
});

uiTest('a function that reads a signal is not pure: the warning in the editor with its explanation, "Fix: Declare the function … impure", the Warnings tab, Check Syntax clean after it (#185)', E, async (page) => {
  const PARITY = `library ieee;
use ieee.std_logic_1164.all;

entity parity is
  port (clk : in std_logic;
        d   : in std_logic;
        q   : out std_logic);
end parity;

architecture rtl of parity is
  signal acc : std_logic := '0';
  -- acc with one more bit
  function next_acc(x : std_logic) return std_logic is
  begin
    return acc xor x;
  end function;
begin
  process (clk)
  begin
    if rising_edge(clk) then
      acc <= next_acc(d);
    end if;
  end process;
  q <= acc;
end rtl;
`;
  await makeProject(env, { name: 'FixPure', top: 'parity', files: { 'src/parity.vhd': PARITY } });
  await page.openProject('FixPure');
  await page.eval(() => window.SilinxApp.openFile('src/parity.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/parity.vhd' && window.Silinx.active.editor);
  // ---- a warning at the function's end, as XST's: the tooltip with its help and the fix
  await page.waitFor(() => window.Silinx.active.editor.diagnostics().some((d) => d.line === 16 && d.severity === 'warning') && !!document.querySelector('.doc:not([hidden]) .cm-lint-marker-warning'), [], { what: 'the warning marker of line 16' });
  const warnTooltip = async () => {
    await page.eval(() => document.querySelectorAll('.xl-lint-tip').forEach((t) => t.remove()));
    await page.hover('#statusbar');
    await page.hover('.doc:not([hidden]) .cm-lint-marker-warning');
    return page.waitFor(() => document.querySelector('.xl-lint-tip')?.textContent, [], { what: 'lint tooltip' });
  };
  const tip = await warnTooltip();
  assert.match(tip, /^Function next_acc is not pure: it uses signal 'acc' at line 15\. VHDL 87 allowed this; VHDL 93 requires the keyword IMPURE\.\n\nExplanation: 'next_acc' is a pure function \(a VHDL function is pure unless it is declared impure\)/);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.xl-lint-tip .xl-fix')].map((b) => b.textContent)), ["Fix: Declare the function 'next_acc' impure"]);
  // ---- Check Syntax: completed with the warning, in the Warnings tab with its fix
  await checkSyntax(page, /Process "Check Syntax" completed successfully with 1 warning\(s\)\s*$/m);
  assert.equal(await page.eval(() => document.getElementById('err-count').textContent), '');
  await page.click('#console-tabs .tab[data-page=warnings]');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)),
    ["WARNING:HDLParsers:3310 - \"src/parity.vhd\" Line 16: Function next_acc is not pure: it uses signal 'acc' at line 15. VHDL 87 allowed this; VHDL 93 requires the keyword IMPURE.▸ Explanation and fixFix: Declare the function 'next_acc' impure"]);
  // ---- applied from the tooltip: impure, no warning, Check Syntax clean
  await warnTooltip();
  await page.click('.xl-lint-tip .xl-fix');
  assert.equal(await ed(page), PARITY.replace('  function next_acc', '  impure function next_acc'));
  await noMarkers(page);
  await checkSyntax(page, /Process "Check Syntax" completed successfully\s*$/m);
  assert.equal(await page.eval(() => document.getElementById('err-count').textContent + document.getElementById('warn-count').textContent), '');
});

uiTest('a process labelled with the name of a signal: the error at its end, as XST\'s, with its explanation, "Fix: Rename the label …" (also after end process), the Errors tab, in Portuguese, Check Syntax clean after it (#192)', E, async (page) => {
  const BLINK = `library ieee;
use ieee.std_logic_1164.all;

entity blink is
  port (clk : in std_logic;
        led : out std_logic);
end blink;

architecture rtl of blink is
  signal toggle : std_logic := '0';
begin
  toggle : process (clk)
  begin
    if rising_edge(clk) then
      toggle <= not toggle;
    end if;
  end process toggle;
  led <= toggle;
end rtl;
`;
  const fixed = BLINK.replace('  toggle : process', '  toggle_proc : process').replace('end process toggle;', 'end process toggle_proc;');
  await makeProject(env, { name: 'FixLabel', top: 'blink', files: { 'src/blink.vhd': BLINK } });
  await page.openProject('FixLabel');
  await page.eval(() => window.SilinxApp.openFile('src/blink.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/blink.vhd' && window.Silinx.active.editor);
  // ---- the error at `end process`: the tooltip with its help and the fix
  await errorMarker(page, 17);
  const tip = await lintTooltip(page);
  assert.match(tip, /^Redeclaration of symbol toggle: the label of the process \(line 12\) is also the name of signal 'toggle' \(line 10\)\.\n\nExplanation: The label 'toggle' of the process at line 12 has the name of the signal 'toggle' \(line 10\)\./);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.xl-lint-tip .xl-fix')].map((b) => b.textContent)), ["Fix: Rename the label 'toggle' to 'toggle_proc'"]);
  // ---- Check Syntax: failed, in the Errors tab with its fix (in Portuguese too)
  await checkSyntax(page, /Process "Check Syntax" failed \(1 error\(s\), 0 warning\(s\)\)/);
  await page.waitFor(() => document.querySelector('#console-tabs .tab[data-page=errors]').classList.contains('active'));
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#console-errors .diag')].map((d) => d.textContent)),
    ["ERROR:HDLParsers:1202 - \"src/blink.vhd\" Line 17: Redeclaration of symbol toggle: the label of the process (line 12) is also the name of signal 'toggle' (line 10).▸ Explanation and fixFix: Rename the label 'toggle' to 'toggle_proc'"]);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('#console-errors .diag .diag-fix')?.textContent === "Corrigir: Mudar o nome da etiqueta 'toggle' para 'toggle_proc'", [], { what: 'the fix in Portuguese' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // ---- applied from the tooltip: the label renamed at the process and after its end; no error, Check Syntax clean
  await lintTooltip(page);
  await page.click('.xl-lint-tip .xl-fix');
  assert.equal(await ed(page), fixed);
  await noMarkers(page);
  await checkSyntax(page, /Process "Check Syntax" completed successfully\s*$/m);
  assert.equal(await page.eval(() => document.getElementById('err-count').textContent + document.getElementById('warn-count').textContent), '');
});

// ---------------------------------------------------------------- drawings without an HDL file (#177)
uiTest('Rename Symbol and quick fixes never write a drawing without an HDL file: the dialog says its instance is not changed; no fix for its errors', E, async (page) => {
  const { COUNTER, schematicOf } = await import('../drawn-lib.mjs');
  const { newTable } = await import('../../core/logic.js');
  const drawn = JSON.stringify(schematicOf('drawn', 'counter'), null, 1);
  const bad = JSON.stringify(schematicOf('bad', 'countr'), null, 1);   // instances a module that does not exist
  const maj3 = JSON.stringify({ ...newTable('maj3', ['a', 'b', 'c'], ['f']), lang: 'vhdl', table: { f: '00010111' } }, null, 2);
  const TOPV = `library ieee;
use ieee.std_logic_1164.all;

entity top is
  port (a, b, c : in std_logic; y : out std_logic);
end top;

architecture rtl of top is
begin
  u_maj : entity work.maj3 port map (a => a, b => b, c => c, f => y);
end rtl;
`;
  const files = { 'src/counter.vhd': COUNTER, 'src/drawn.sch.json': drawn, 'src/bad.sch.json': bad, 'src/maj3.tt.json': maj3, 'src/top.vhd': TOPV };
  await makeProject(env, { name: 'DrawnPj', top: 'drawn', files });
  // every source gets its HDL file (#207), but not over a file of the folder that is not in the project
  // (e.g. its HDL file removed from the project): such a drawing stays a module by itself (#177)
  for (const m of ['drawn', 'bad', 'maj3']) await fs.writeFile(path.join(env.server.workspace, 'DrawnPj', `src/${m}.vhd`), `-- ${m}: not in the project\n`);
  await page.openProject('DrawnPj');
  // the drawings are modules of the project (their HDL made in memory)
  await page.waitFor(() => ['drawn', 'bad', 'maj3'].every((m) => window.Silinx.sources.some((s) => s.view && s.text.includes(`entity ${m} is`))), [], { what: 'the drawings as modules' });
  const unchanged = async () => { for (const f of ['src/drawn.sch.json', 'src/bad.sch.json', 'src/maj3.tt.json']) assert.equal(await readWs(env, 'DrawnPj', f), files[f], `${f} unchanged`); };

  // ---- a port of counter, which the schematic instances: renamed in counter.vhd; the drawing is named, not changed
  await page.eval(() => window.SilinxApp.openFile('src/counter.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/counter.vhd' && window.Silinx.active.editor);
  await cursorOn(page, 'q', 0);
  await page.key('F2');
  await page.waitDialog('Rename Symbol');
  assert.equal(await dlgText(page), "New name:\nRenames the port 'q' everywhere it is used in this file: 2 places.\nNot changed: the instances of 'counter' in src/drawn.sch.json (made from the drawing: change them there).");
  assert.equal(await page.eval(() => document.querySelectorAll('.rename-dlg input[type=checkbox]').length), 0);
  await page.fill('.rename-dlg input[type=text]', 'count');
  await page.dialogButton('Rename');
  await page.waitNoDialog();
  const renamed = COUNTER.replace('        q   : out', '        count   : out').replace('  q <= std_logic_vector', '  count <= std_logic_vector');
  assert.equal(await ed(page), renamed);
  await page.key('s', { modifiers: process.platform === 'darwin' ? 4 : 2 });
  for (let k = 0; k < 50 && (await readWs(env, 'DrawnPj', 'src/counter.vhd')) !== renamed; k++) await tick(100);
  assert.equal(await readWs(env, 'DrawnPj', 'src/counter.vhd'), renamed);
  await unchanged();

  // ---- a port of maj3 (a truth table) from the file that instances it: declared in the drawing, not renamed
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd' && window.Silinx.active.editor);
  await cursorOn(page, 'a', 1);   // (the formal of the port map)
  await page.key('F2');
  await page.waitFor(() => [...document.querySelectorAll('.toast')].some((t) => t.textContent === "'a' is a port of 'maj3', declared in another file: rename it there."), [], { what: 'the message' });
  assert.equal(await page.dialogCount(), 0);
  assert.equal(await ed(page), TOPV);

  // ---- an error in the HDL made from the schematic bad: in the Errors tab, without "Fix: …"
  await page.treeRow('#hier', 'bad');
  await page.menu('Process', 'Check Syntax');
  await page.waitConsole(/Process "Check Syntax" failed \(1 error\(s\), 0 warning\(s\)\)/);
  await page.click('#console-tabs .tab[data-page=errors]');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#console-errors .diag')].map((r) => r.textContent)),
    ["ERROR:HDLCompiler - \"src/bad.sch.json\" Line 15: module/entity 'countr' not found (instance 'u1')▸ Explanation and fix"]);
  assert.equal(await page.eval(() => document.querySelectorAll('#console-errors .diag-fix').length), 0);
  await unchanged();
});

// ---------------------------------------------------------------- the HDL file generated from a drawing (#1176)
uiTest('#1176 Rename Symbol never writes the HDL file generated from a drawing (read-only): the dialog names the drawing, its instance not changed', E, async (page) => {
  const { COUNTER, schematicOf } = await import('../drawn-lib.mjs');
  const drawn = JSON.stringify(schematicOf('drawn', 'counter'), null, 1);
  await makeProject(env, { name: 'GenPj', top: 'drawn', files: { 'src/counter.vhd': COUNTER, 'src/drawn.sch.json': drawn } });
  await page.openProject('GenPj');
  // the schematic gets its HDL file (#207), generated from it
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/drawn.vhd'] === 'src/drawn.sch.json', [], { what: 'the HDL file of the schematic', timeout: 15000 });
  const hdl = await readWs(env, 'GenPj', 'src/drawn.vhd'), sch = await readWs(env, 'GenPj', 'src/drawn.sch.json');
  assert.match(hdl, /counter/);
  await page.eval(() => window.SilinxApp.openFile('src/counter.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/counter.vhd' && window.Silinx.active.editor);
  await cursorOn(page, 'q', 0);
  await page.key('F2');
  await page.waitDialog('Rename Symbol');
  assert.equal(await dlgText(page), "New name:\nRenames the port 'q' everywhere it is used in this file: 2 places.\nNot changed: the instances of 'counter' in src/drawn.sch.json (made from the drawing: change them there).");
  assert.equal(await page.eval(() => document.querySelectorAll('.rename-dlg input[type=checkbox]').length), 0);
  await page.fill('.rename-dlg input[type=text]', 'count');
  await page.dialogButton('Rename');
  await page.waitNoDialog();
  await page.key('s', { modifiers: process.platform === 'darwin' ? 4 : 2 });
  for (let k = 0; k < 50 && !/count {3}: out/.test(await readWs(env, 'GenPj', 'src/counter.vhd')); k++) await tick(100);
  assert.match(await readWs(env, 'GenPj', 'src/counter.vhd'), /count {3}: out/);
  assert.equal(await readWs(env, 'GenPj', 'src/drawn.vhd'), hdl);
  assert.equal(await readWs(env, 'GenPj', 'src/drawn.sch.json'), sch);
});
