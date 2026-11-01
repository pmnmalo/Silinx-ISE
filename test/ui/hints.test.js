// UI: beginner help of the diagnostics. A latch inferred in a combinational process: Check Syntax
// reports it in the Warnings tab (ISE-style message first) with an expandable explanation and fix,
// and the editor marks the line with the same help in its tooltip, in English and in Portuguese;
// a suppression comment and Edit ▸ Design Checks turn it off; a language error (output read)
// is reported in the Errors tab with its help.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = `library ieee;
use ieee.std_logic_1164.all;
entity top is
  port (en, d : in std_logic; q : out std_logic);
end top;
architecture rtl of top is
begin
  process (en, d)
  begin
    if en = '1' then
      q <= d;
    end if;
  end process;
end rtl;
`;

// (the File and Edit menus: the classic interface's, the modern one has none, #1307)
uiTest('latch warning with its explanation in the Warnings tab and the editor tooltip (English, Portuguese); suppression; Edit ▸ Design Checks; output read', E, async (page) => {
  await makeProject(env, { name: 'HintPj', files: { 'src/top.vhd': TOP }, top: 'top' });
  await page.openProject('HintPj');
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd' && window.Silinx.active.editor);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  const checkSyntax = async (re) => {
    await page.eval(() => { document.getElementById('console-log').innerHTML = ''; });
    await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Check Syntax' });
    await page.waitConsole(re);
  };
  await setLang('en');

  // ---- Check Syntax: one warning, the ISE-style message first
  await checkSyntax(/Process "Check Syntax" completed successfully with 1 warning\(s\)/);
  assert.match(await page.consoleText(), /WARNING:Silinx:737 - "src\/top\.vhd" Line 10: Found 1-bit latch for signal <q>\./);
  await page.click('#console-tabs .tab[data-page=warnings]');
  await page.waitFor(() => !document.getElementById('console-warnings').hidden);
  assert.equal(await page.eval(() => document.getElementById('warn-count').textContent), '(1)');
  const row = await page.eval(() => document.querySelector('#console-warnings .diag').textContent);
  assert.match(row, /^WARNING:Silinx:737 - "src\/top\.vhd" Line 10: Found 1-bit latch for signal <q>\. Latches may be generated from incomplete case or if statements\./);
  assert.match(row, /▸ Explanation and fix$/);
  // the help is collapsed; clicking "Explanation and fix" opens it (and does not jump to the file)
  assert.equal(await page.eval(() => document.querySelector('#console-warnings .diag-hint').hidden), true);
  await page.click('#console-warnings .diag .diag-more');
  await page.waitFor(() => !document.querySelector('#console-warnings .diag-hint').hidden);
  const help = await page.eval(() => document.querySelector('#console-warnings .diag-hint').textContent);
  assert.match(help, /^Explanation: A latch is inferred for 'q'/);
  assert.match(help, /\(Xilinx ISE's XST reports this as Xst:737\.\)/);
  assert.match(help, /How to fix: Give 'q' a value on every path: add an 'else' branch/);
  assert.equal(await page.eval(() => document.querySelector('#console-warnings .diag-hint').dataset.hint), 'latch');

  // ---- the editor marks line 10 with a warning; its tooltip has the message and the help
  const tooltip = async () => {
    await page.waitForSelector('.doc:not([hidden]) .cm-lint-marker-warning', { timeout: 8000 });
    await page.eval(() => document.querySelectorAll('.xl-lint-tip').forEach((t) => t.remove()));
    // (off the marker first: a marker redrawn under a mouse that does not move gets no mouseover)
    await page.hover('#menubar');
    await page.hover('.doc:not([hidden]) .cm-lint-marker-warning');
    return page.waitFor(() => document.querySelector('.xl-lint-tip')?.textContent, [], { what: 'lint tooltip' });
  };
  await page.waitFor(() => window.Silinx.active.editor.diagnostics().some((d) => d.line === 10), [], { what: 'marker on line 10' });
  let tip = await tooltip();
  assert.match(tip, /Found 1-bit latch for signal <q>/);
  assert.match(tip, /Explanation: A latch is inferred for 'q'/);
  assert.match(tip, /How to fix: Give 'q' a value on every path/);

  // ---- Portuguese: the Warnings tab and the tooltip follow the language
  await setLang('pt');
  await page.waitFor(() => /^Explicação: É inferido um latch \(trinco\) para 'q'/.test(document.querySelector('#console-warnings .diag-hint')?.textContent || ''), [], { what: 'Portuguese help' });
  assert.match(await page.eval(() => document.querySelector('#console-warnings .diag-hint').textContent), /Como corrigir: Dê um valor a 'q' em todos os caminhos/);
  // (still expanded after the redraw)
  assert.equal(await page.eval(() => document.querySelector('#console-warnings .diag-hint').hidden), false);
  assert.match(await page.eval(() => document.querySelector('#console-warnings .diag .diag-more').textContent), /^▾ Explicação e correção$/);
  // the ISE-style message itself is not translated
  assert.match(await page.eval(() => document.querySelector('#console-warnings .diag').textContent), /Found 1-bit latch for signal <q>/);
  // the lint again: the tooltip of its marker
  await page.eval(() => window.Silinx.active.editor.lintNow());
  tip = await tooltip();
  assert.match(tip, /Found 1-bit latch for signal <q>/);
  assert.match(tip, /Explicação: É inferido um latch \(trinco\) para 'q'/);
  assert.match(tip, /Como corrigir: Dê um valor a 'q'/);
  await setLang('en');

  // ---- a suppression comment on the line of the warning
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.setValue(ed.getValue().replace("if en = '1' then", "if en = '1' then  -- silinx: ignore latch")); });
  await checkSyntax(/Process "Check Syntax" completed successfully\s*$/m);
  assert.equal(await page.eval(() => document.getElementById('warn-count').textContent), '');

  // ---- Edit ▸ Design Checks (Lint Warnings) off: no warning; on again: the warning is back
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.setValue(ed.getValue().replace('  -- silinx: ignore latch', '')); });
  await page.menu('Edit', 'Design Checks (Lint Warnings)');
  assert.equal(await page.eval(() => localStorage.getItem('silinx.lint')), 'off');
  await checkSyntax(/Process "Check Syntax" completed successfully\s*$/m);
  assert.equal(await page.eval(() => document.getElementById('warn-count').textContent), '');
  const checkMark = async () => {
    await page.openMenu('Edit');
    const c = await page.eval(() => [...document.querySelectorAll('body > .menu-popup > .mi')].find((r) => r.querySelector('.lbl').textContent === 'Design Checks (Lint Warnings)').querySelector('.chk').textContent);
    await page.closeMenus();
    return c;
  };
  assert.equal(await checkMark(), '');
  await page.menu('Edit', 'Design Checks (Lint Warnings)');
  assert.equal(await checkMark(), '✓');
  await checkSyntax(/completed successfully with 1 warning\(s\)/);

  // ---- a language error the elaborator accepts but ISE rejects: an output read (VHDL-93)
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.setValue(ed.getValue().replace('      q <= d;\n    end if;', '      q <= d;\n    else\n      q <= not q;\n    end if;')); });
  await checkSyntax(/Process "Check Syntax" failed \(1 error\(s\)/);
  await page.waitFor(() => document.querySelector('#console-tabs .tab[data-page=errors]').classList.contains('active'));
  assert.match(await page.eval(() => document.querySelector('#console-errors .diag').textContent), /^ERROR:HDLCompiler - "src\/top\.vhd" Line 13: Object <q> of mode OUT can not be read\./);
  await page.click('#console-errors .diag .diag-more');
  assert.match(await page.eval(() => document.querySelector('#console-errors .diag-hint').textContent), /Explanation: 'q' is an output port \(mode out\)\. In VHDL-93[\s\S]*How to fix: Use an internal signal: declare 'signal q_reg/);
}, { ui: 'ise' });

// #16, #38: a Verilog design with the unused bits of an input bus, two names that differ only in
// case, a case without default (a check without an XST number) and $clog2 in a register's range:
// every warning in the console and the Warnings tab, labelled Silinx, at its line.
const VTOP = `module top #(parameter N = 10) (input clk, input [3:0] btn, input a, b, output reg y, output [3:0] q);
  reg scoreR = 1'b0;
  wire scorer = btn[0] ^ btn[3];
  reg [$clog2(N)-1:0] c = 0;
  always @(posedge clk) begin scoreR <= scorer; c <= c + 1; end
  always @* begin
    y = scoreR;
    case ({a, b}) 2'b00: y = 1'b1; 2'b01: y = 1'b0; endcase
  end
  assign q = c;
endmodule
`;

uiTest('Verilog: unused bits of an input bus, names that differ only in case, Silinx labels, $clog2 at its line (#16, #38)', E, async (page) => {
  await makeProject(env, { name: 'BitsPj', files: { 'src/top.v': VTOP }, top: 'top' });
  await page.openProject('BitsPj');
  await page.eval(() => window.SilinxApp.openFile('src/top.v'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.v' && window.Silinx.active.editor);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  await page.eval(() => { document.getElementById('console-log').innerHTML = ''; });
  await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Check Syntax' });
  await page.waitConsole(/Process "Check Syntax" completed successfully with 4 warning\(s\)/);
  const lines = (await page.consoleText()).split('\n').filter((l) => l.startsWith('WARNING:'));
  assert.deepEqual(lines.sort(), [
    'WARNING:Silinx - "src/top.v" Line 4: $clog2 is not supported by XST (ISE 14.7); use a constant function instead',
    'WARNING:Silinx - "src/top.v" Line 8: Case statement without \'default\' in a combinational always block',
    'WARNING:Silinx:647 - "src/top.v" Line 1: Input <btn<2:1>> is never used.',
    'WARNING:Silinx:863 - "src/top.v" Line 3: Name conflict (<scorer> and <scoreR>, renaming scorer as scorer_rnm0)',
  ]);
  await page.click('#console-tabs .tab[data-page=warnings]');
  await page.waitFor(() => !document.getElementById('console-warnings').hidden);
  assert.equal(await page.eval(() => document.getElementById('warn-count').textContent), '(4)');
  const rows = await page.eval(() => [...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent));
  assert.ok(rows.every((r) => /^WARNING:Silinx(:\d+)? - /.test(r)), rows.join('\n'));
  // the help of the bus's unused bits and of the name conflict
  const help = async (re, id) => {
    const i = rows.findIndex((r) => re.test(r));
    assert.ok(i >= 0, String(re));
    await page.eval((k) => document.querySelectorAll('#console-warnings .diag')[k].querySelector('.diag-more').click(), i);
    return page.waitFor((x) => { const b = document.querySelector(`#console-warnings .diag-hint[data-hint="${x}"]`); return b && !b.hidden && b.textContent; }, [id], { what: `help ${id}` });
  };
  assert.match(await help(/Input <btn<2:1>>/, 'unused-input-bits'), /^Explanation: Only some bits of the input bus 'btn' are read: bits 2:1 are never used[\s\S]*Xst:647/);
  assert.match(await help(/Name conflict/, 'name-case'), /^Explanation: 'scorer' and 'scoreR' differ only in upper \/ lower case\.[\s\S]*Xst:863/);
});

// an inout port neither read nor driven (a bidirectional I/O marker left unconnected): XST's warning
// and its help, in VHDL and Verilog, in English and in Portuguese (#684)
const IO_SRC = {
  vhd: `library ieee;
use ieee.std_logic_1164.all;
entity top is
  port (a : in std_logic; y : out std_logic; io : inout std_logic);
end top;
architecture rtl of top is
begin
  y <= not a;
end rtl;
`,
  v: `module top(input a, output y,
  inout io);
  assign y = ~a;
endmodule
`,
};
uiTest('inout port neither read nor driven: Inout <io> is never assigned., with its help in English and Portuguese, VHDL and Verilog (#684)', E, async (page) => {
  for (const [ext, line] of [['vhd', 4], ['v', 2]]) {
    const pj = `InoutPj${ext}`;
    await makeProject(env, { name: pj, files: { [`src/top.${ext}`]: IO_SRC[ext] }, top: 'top' });
    await page.openProject(pj);
    await page.eval((f) => window.SilinxApp.openFile(f), `src/top.${ext}`);
    await page.waitFor((f) => window.Silinx.active?.id === `file:${f}` && window.Silinx.active.editor, [`src/top.${ext}`]);
    await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
    await page.click('#console-tabs .tab[data-page=console]');
    await page.eval(() => { document.getElementById('console-log').innerHTML = ''; });
    await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Check Syntax' });
    await page.waitConsole(/Process "Check Syntax" completed successfully with 1 warning\(s\)/);
    assert.deepEqual((await page.consoleText()).split('\n').filter((l) => l.startsWith('WARNING:')),
      [`WARNING:Silinx:2565 - "src/top.${ext}" Line ${line}: Inout <io> is never assigned.`]);
    await page.click('#console-tabs .tab[data-page=warnings]');
    await page.waitFor(() => !document.getElementById('console-warnings').hidden);
    assert.equal(await page.eval(() => document.getElementById('warn-count').textContent), '(1)');
    await page.eval(() => document.querySelector('#console-warnings .diag .diag-more').click());
    const help = await page.waitFor(() => { const b = document.querySelector('#console-warnings .diag-hint[data-hint="unused-inout"]'); return b && !b.hidden && b.textContent; }, [], { what: 'help unused-inout' });
    assert.match(help, /^Explanation: The bidirectional \(inout\) port 'io' is neither read nor driven inside the module[\s\S]*Xst:2565[\s\S]*How to fix: Connect it where it is needed/);
    await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
    await page.waitFor(() => /^Explicação: O porto bidirecional \(inout\) 'io' não é lido nem comandado/.test(document.querySelector('#console-warnings .diag-hint')?.textContent || ''), [], { what: 'Portuguese help' });
    assert.match(await page.eval(() => document.querySelector('#console-warnings .diag-hint').textContent), /Como corrigir: Ligue-o onde é preciso/);
    // the XST-style message itself is not translated
    assert.match(await page.eval(() => document.querySelector('#console-warnings .diag').textContent), /Inout <io> is never assigned\./);
    await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  }
});
