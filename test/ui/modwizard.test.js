// UI: the beginner wizards of New Source. Module (Wizard): a sequential VHDL module with an
// asynchronous reset, an enable and a bus, built with the quick-add buttons (a reserved word is
// refused), opened in the editor and compiling; Schematic (Wizard): a Verilog schematic with board
// I/O and a clock, opened in the schematic editor with its markers placed; both wizards in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';
import { compile, elaborate } from '../../core/compile.js';
import { generateHdl } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// New Source ▸ <type>: the file name, Finish on page 1 opens the wizard `title`
async function openWizard(page, type, name, title) {
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source Wizard');
  // the list: the new order, no VHDL Package
  const types = await page.eval(() => [...document.querySelectorAll('.dlg-overlay .src-types .st')].map((e) => e.lastChild.textContent.trim()));
  assert.deepEqual(types, ['Truth Table', 'Module (HDL)', 'Module (Wizard)', 'Schematic (Diagram)', 'Schematic (Wizard)', 'State Machine (ASM)', 'State Machine (FSM)',
    'Test Bench (HDL)', 'Test Bench (Wizard)', 'Implementation Constraints File', 'Memory Initialization File (.mem)']);
  await page.eval((t) => { const r = [...document.querySelectorAll('.dlg-overlay .src-types .st')].find((e) => e.lastChild.textContent.trim() === t); r.scrollIntoView(); r.click(); }, type);
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  await page.dialogButton('Finish');
  await page.waitDialog(title);
}
const next = async (page, title) => {
  await page.dialogButton(title === null ? 'Finish' : 'Next >');
  if (title) await page.waitFor((t) => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === t, [title], { what: `wizard page ${title}` });
};
const quick = (page, port) => page.click(`.dlg-overlay .mw-qa[data-port=${port}]`);
const errText = (page) => page.eval(() => document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent);

uiTest('Module (Wizard): sequential VHDL module, asynchronous reset, enable and a bus; reserved word refused; opened and compiling', E, async (page) => {
  await makeProject(env, { name: 'MwPj' });
  await page.openProject('MwPj');
  await openWizard(page, 'Module (Wizard)', 'counter8', 'Module Wizard');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .mw-name').value), 'counter8');
  await page.fill('.dlg-overlay .wiz-main select', 'vhdl');
  await page.fill('.dlg-overlay .mw-desc', 'An 8-bit counter.\nCounts when enable is 1.');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .mw-file').textContent), 'src/counter8.vhd');
  await next(page, 'Inputs and Outputs');
  for (const p of ['clk', 'reset', 'enable', 'q']) await quick(page, p);
  assert.ok(await page.eval(() => document.querySelector('.dlg-overlay .mw-qa[data-port=clk]').disabled), 'a quick-add port already in the table is disabled');
  await page.click('.dlg-overlay .mw-add');
  await page.fill('.dlg-overlay .mw-pname', 'signal', { index: 4 });
  await page.fill('.dlg-overlay .mw-pdir', 'out', { index: 4 });
  await page.dialogButton('Next >');
  await page.waitFor(() => /reserved word of VHDL/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent));
  assert.match(await errText(page), /Port 5: 'signal' is a reserved word of VHDL\./);
  await page.fill('.dlg-overlay .mw-pname', 'wrap', { index: 4 });
  await page.fill('.dlg-overlay .mw-pdesc', 'the counter wrapped around', { index: 4 });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .mw-pwidth')].map((e) => e.value)), ['1', '1', '1', '8', '1']);
  assert.equal(await page.eval(() => document.querySelectorAll('.dlg-overlay .mw-pbits')[3].textContent), '(7 downto 0)');
  await next(page, 'Kind of Logic');
  // clk found: sequential, reset with an asynchronous reset, the enable
  assert.ok(await page.eval(() => document.querySelector('.dlg-overlay input[name=mw-kind][value=seq]').checked));
  assert.deepEqual(await page.eval(() => ['.mw-clk', '.mw-rmode', '.mw-rst', '.mw-active', '.mw-en'].map((s) => document.querySelector(`.dlg-overlay ${s}`).value)), ['clk', 'async', 'reset', '1', 'enable']);
  await next(page, 'Summary');
  const preview = await page.eval(() => document.querySelector('.dlg-overlay .mw-preview').textContent);
  assert.match(preview, /process \(clk, reset\)/);
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .mw-summary').textContent), /Logic: sequential, clock clk; asynchronous reset reset active high; enable enable/);
  await next(page, null);
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'src/counter8.vhd' && f.role === 'design'), [], { what: 'src/counter8.vhd registered' });
  await page.waitFor(() => window.Silinx.active?.id === 'src/counter8.vhd' || /counter8\.vhd$/.test(window.Silinx.active?.id || ''), [], { what: 'counter8.vhd open' });
  const text = await readWs(env, 'MwPj', 'src/counter8.vhd');
  assert.match(text, /-- Description:    An 8-bit counter\.\n--\s+Counts when enable is 1\./);
  assert.match(text, /q\s+: out std_logic_vector\(7 downto 0\);/);
  assert.match(text, /wrap\s+: out std_logic\s+-- the counter wrapped around/);
  assert.match(text, /if reset = '1' then[\s\S]*q_reg <= \(others => '0'\);[\s\S]*elsif rising_edge\(clk\) then\s+if enable = '1' then/);
  const lib = compile([{ path: 'src/counter8.vhd', lang: 'vhdl', text }]);
  const d = elaborate(lib, 'counter8');
  assert.deepEqual([...lib.errors, ...d.diags].filter((x) => x.severity === 'error').map((x) => x.message), []);
  // the module is in the hierarchy
  await page.waitFor(() => window.Silinx.modules.some((m) => m.name === 'counter8'));
});

uiTest('Schematic (Wizard): Verilog schematic with board I/O and a clock, markers placed, opened in the schematic editor', E, async (page) => {
  await makeProject(env, { name: 'SwPj' });
  await page.openProject('SwPj');
  await openWizard(page, 'Schematic (Wizard)', 'board_io', 'Schematic Wizard');
  await page.fill('.dlg-overlay .wiz-main select', 'verilog');
  await page.fill('.dlg-overlay .mw-desc', 'Switches to LEDs.');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .mw-file').textContent), 'src/board_io.sch.json');
  await next(page, 'Inputs and Outputs');
  await page.dialogButton('Next >');
  await page.waitFor(() => /Add at least one input or output/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent));
  for (const p of ['sw', 'btn', 'led', 'seg', 'an']) await quick(page, p);
  await page.fill('.dlg-overlay .mw-clkchk', true);
  await next(page, 'Summary');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .mw-summary').textContent), /Input markers \(left edge\): sw \[3:0\], btn \[3:0\], clk/);
  await next(page, null);
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/board_io.sch.json' && window.Silinx.active.schEditor, [], { what: 'schematic editor' });
  const doc = await page.eval(() => window.Silinx.active.schEditor.getDoc());
  assert.equal(doc.lang, 'verilog');
  assert.deepEqual(doc.ports.map((p) => `${p.name}:${p.dir}:${p.width}`), ['sw:in:4', 'btn:in:4', 'clk:in:1', 'led:out:8', 'seg:out:7', 'an:out:4']);
  const ins = doc.ports.filter((p) => p.dir === 'in'), outs = doc.ports.filter((p) => p.dir === 'out');
  assert.ok(ins.every((p) => p.x === ins[0].x) && outs.every((p) => p.x === outs[0].x) && ins[0].x < outs[0].x - 800);
  // the description is drawn on the sheet
  assert.match(await page.eval(() => document.querySelector('.doc:not([hidden]) .se-desc')?.textContent || ''), /Switches to LEDs\./);
  const saved = JSON.parse(await readWs(env, 'SwPj', 'src/board_io.sch.json'));
  assert.equal(saved.ports.length, 6);
  const g = generateHdl(saved);
  assert.ok(g.diagnostics.every((x) => x.severity === 'warning'), JSON.stringify(g.diagnostics));
  const lib = compile([{ path: 'src/board_io.v', lang: 'verilog', text: g.code }]);
  const d = elaborate(lib, 'board_io');
  assert.deepEqual([...lib.errors, ...d.diags].filter((x) => x.severity === 'error').map((x) => x.message), []);
});

uiTest('Portuguese: the New Source list and every page of the Module and Schematic wizards are translated', E, async (page) => {
  await makeProject(env, { name: 'MwPt' });
  await page.openProject('MwPt');
  await page.eval(TEXTS);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  const missing = [];
  const compare = async (where) => {
    await setLang('en'); const en = await page.eval(() => window.__uiTexts(document.querySelector('.dlg-overlay')));
    await setLang('pt'); const pt = await page.eval(() => window.__uiTexts(document.querySelector('.dlg-overlay')));
    for (const s of untranslated(en, pt, [/^(clk|reset|enable|q|y|sw|led|p\d+|N)$/, /^\(none\)$/])) missing.push(`${where}: ${s}`);
    await setLang('en');
  };
  for (const [type, title, pages] of [['Module (Wizard)', 'Module Wizard', 4], ['Schematic (Wizard)', 'Schematic Wizard', 3]]) {
    await page.menu('Project', 'New Source…');
    await page.waitDialog('New Source Wizard');
    await setLang('pt');
    const list = await page.eval(() => [...document.querySelectorAll('.dlg-overlay .src-types .st')].map((e) => e.lastChild.textContent.trim()));
    for (const s of ['Módulo (HDL)', 'Módulo (Assistente)', 'Esquemático (Diagrama)', 'Esquemático (Assistente)']) assert.ok(list.includes(s), `${s} in ${list}`);
    await setLang('en');
    await compare('New Source');
    await page.eval((t) => { [...document.querySelectorAll('.dlg-overlay .src-types .st')].find((e) => e.lastChild.textContent.trim() === t).click(); }, type);
    await page.fill('.dlg-overlay .wiz-main input[type=text]', 'pt_mod');
    await page.dialogButton('Finish');
    await page.waitDialog(title);
    for (let k = 0; k < pages; k++) {
      if (k === 1) {
        await compare(`${title} page 2 (empty)`);
        for (const p of ['clk', 'reset', 'enable', 'q', 'y']) await quick(page, p);
        if (title === 'Schematic Wizard') await page.fill('.dlg-overlay .mw-clkname', 'ck');
      }
      if (k === 2 && title === 'Module Wizard') {
        await page.click('.dlg-overlay details.mw-gen summary');
        await page.click('.dlg-overlay .btn', { text: 'Add Generic' });
        await compare(`${title} page 3 (sequential)`);
        await page.click('.dlg-overlay input[name=mw-kind][value=comb]');
      }
      await compare(`${title} page ${k + 1}`);
      // an error message is translated too
      if (k === 0) {
        await page.fill('.dlg-overlay .mw-name', 'entity');
        await page.dialogButton('Next >');
        await setLang('pt');
        await page.waitFor(() => /palavra reservada/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent), [], { what: 'Portuguese error' });
        await setLang('en');
        await page.fill('.dlg-overlay .mw-name', 'pt_mod');
      }
      if (k < pages - 1) {
        const h3 = await page.eval(() => document.querySelector('.dlg-overlay .wiz-main h3').textContent);
        await page.dialogButton('Next >');
        await page.waitFor((t) => document.querySelector('.dlg-overlay .wiz-main h3').textContent !== t, [h3]);
      }
    }
    await page.dialogButton('Cancel');
    await page.waitNoDialog();
  }
  assert.deepEqual(missing, [], `untranslated:\n${missing.join('\n')}`);
});
