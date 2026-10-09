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
  assert.match(await page.consoleText(), /WARNING:Xst:737 - "src\/top\.vhd" Line 10: Found 1-bit latch for signal <q>\./);
  await page.click('#console-tabs .tab[data-page=warnings]');
  await page.waitFor(() => !document.getElementById('console-warnings').hidden);
  assert.equal(await page.eval(() => document.getElementById('warn-count').textContent), '(1)');
  const row = await page.eval(() => document.querySelector('#console-warnings .diag').textContent);
  assert.match(row, /^WARNING:Xst:737 - "src\/top\.vhd" Line 10: Found 1-bit latch for signal <q>\. Latches may be generated from incomplete case or if statements\./);
  assert.match(row, /▸ Explanation and fix$/);
  // the help is collapsed; clicking "Explanation and fix" opens it (and does not jump to the file)
  assert.equal(await page.eval(() => document.querySelector('#console-warnings .diag-hint').hidden), true);
  await page.click('#console-warnings .diag .diag-more');
  await page.waitFor(() => !document.querySelector('#console-warnings .diag-hint').hidden);
  const help = await page.eval(() => document.querySelector('#console-warnings .diag-hint').textContent);
  assert.match(help, /^Explanation: A latch is inferred for 'q'/);
  assert.match(help, /How to fix: Give 'q' a value on every path: add an 'else' branch/);
  assert.equal(await page.eval(() => document.querySelector('#console-warnings .diag-hint').dataset.hint), 'latch');

  // ---- the editor marks line 10 with a warning; its tooltip has the message and the help
  const tooltip = async () => {
    await page.waitForSelector('.doc:not([hidden]) .CodeMirror-lint-marker-warning', { timeout: 8000 });
    await page.eval(() => document.querySelectorAll('.CodeMirror-lint-tooltip').forEach((t) => t.remove()));
    await page.hover('.doc:not([hidden]) .CodeMirror-lint-marker-warning');
    return page.waitFor(() => document.querySelector('.CodeMirror-lint-tooltip')?.textContent, [], { what: 'lint tooltip' });
  };
  await page.waitFor(() => !!window.Silinx.active.editor.cm.lineInfo(9).gutterMarkers?.['CodeMirror-lint-markers'], [], { what: 'marker on line 10' });
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
  await page.eval(() => window.Silinx.active.editor.cm.performLint());
  tip = await tooltip();
  assert.match(tip, /Found 1-bit latch for signal <q>/);
  assert.match(tip, /Explicação: É inferido um latch \(trinco\) para 'q'/);
  assert.match(tip, /Como corrigir: Dê um valor a 'q'/);
  await setLang('en');

  // ---- a suppression comment on the line of the warning
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.cm.setValue(ed.getValue().replace("if en = '1' then", "if en = '1' then  -- silinx: ignore latch")); });
  await checkSyntax(/Process "Check Syntax" completed successfully\s*$/m);
  assert.equal(await page.eval(() => document.getElementById('warn-count').textContent), '');

  // ---- Edit ▸ Design Checks (Lint Warnings) off: no warning; on again: the warning is back
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.cm.setValue(ed.getValue().replace('  -- silinx: ignore latch', '')); });
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
  await page.eval(() => { const ed = window.Silinx.active.editor; ed.cm.setValue(ed.getValue().replace('      q <= d;\n    end if;', '      q <= d;\n    else\n      q <= not q;\n    end if;')); });
  await checkSyntax(/Process "Check Syntax" failed \(1 error\(s\)/);
  await page.waitFor(() => document.querySelector('#console-tabs .tab[data-page=errors]').classList.contains('active'));
  assert.match(await page.eval(() => document.querySelector('#console-errors .diag').textContent), /^ERROR:HDLCompiler - "src\/top\.vhd" Line 13: Object <q> of mode OUT can not be read\./);
  await page.click('#console-errors .diag .diag-more');
  assert.match(await page.eval(() => document.querySelector('#console-errors .diag-hint').textContent), /Explanation: 'q' is an output port \(mode out\)\. In VHDL-93[\s\S]*How to fix: Use an internal signal: declare 'signal q_reg/);
});
