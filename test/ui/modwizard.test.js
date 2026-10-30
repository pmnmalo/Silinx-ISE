// UI: the beginner wizards of New Source (the Wizard > button, #958): they open at their own pages, the name, the
// location and the language typed on New Source (no page of them, #2082). Module (HDL) ▸ Wizard >: a sequential VHDL
// module with an asynchronous reset, an enable and a bus, its ports added with Add Port (no quick-add buttons, #2145; a reserved word is
// refused), opened in the editor and compiling; Schematic ▸ Wizard >: an empty port table (no suggested
// ports), the user's own ports added, edited and removed, the schematic opened with its markers placed
// and its VHDL and Verilog with exactly those ports, or no ports at all; both wizards in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';
import { newSourceWizardOf, pickSourceType, waitNewSourcePage, addPort } from './new-source-helpers.js';
import { compile, elaborate } from '../../core/compile.js';
import { generateHdl } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// New Source ▸ <type>, the file name and the language, Wizard > (#958): the wizard `title` opens at its first own page
// (#2082; the list: new-source.test.js)
const openWizard = (page, type, name, title, lang) => newSourceWizardOf(page, type, name, title, { lang });
const steps = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay .wiz-side .step')].map((e) => e.textContent));
const next = async (page, title) => {
  await page.dialogButton(title === null ? 'Finish' : 'Next >');
  if (title) await page.waitFor((t) => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === t, [title], { what: `wizard page ${title}` });
};
// the generated HDL's warnings of a fresh schematic: its markers are not wired yet (the same in both languages)
const UNWIRED = ['sw', 'led', 'data'].map((n) => `I/O marker '${n}' is not connected`);
const errText = (page) => page.eval(() => document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent);

uiTest('Module (HDL) ▸ Wizard >: sequential VHDL module, asynchronous reset, enable and a bus; reserved word refused; opened and compiling', E, async (page) => {
  await makeProject(env, { name: 'MwPj' });
  await page.openProject('MwPj');
  await openWizard(page, 'Module (HDL)', 'counter8', 'Module Wizard', 'vhdl');
  assert.deepEqual(await steps(page), ['Inputs and Outputs', 'Kind of Logic', 'Summary']);
  // the description (and the architecture's name) at the end of the first page (#2082)
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .mw-arch').value), 'rtl');
  await page.fill('.dlg-overlay .mw-desc', 'An 8-bit counter.\nCounts when enable is 1.');
  // no quick-add buttons (#2145): the ports added one by one
  assert.deepEqual(await page.eval(() => [document.querySelectorAll('.dlg-overlay .mw-quick, .dlg-overlay .mw-qa').length, /Quick add/.test(document.querySelector('.dlg-overlay').innerText)]), [0, false]);
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .mw-ports').textContent), /No ports yet: use Add Port\./);
  for (const [n, d, w] of [['clk', 'in', 1], ['reset', 'in', 1], ['enable', 'in', 1], ['q', 'out', 8]]) await addPort(page, n, d, w);
  await page.click('.dlg-overlay .mw-add');
  await page.fill('.dlg-overlay .mw-pname', 'signal', { index: 4 });
  await page.fill('.dlg-overlay .mw-pdir', 'out', { index: 4 });
  await page.dialogButton('Next >');
  await page.waitFor(() => /reserved word of VHDL/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent));
  assert.match(await errText(page), /Port 5: 'signal' is a reserved word of VHDL\./);
  await page.fill('.dlg-overlay .mw-pname', 'wrap', { index: 4 });
  await page.fill('.dlg-overlay .mw-pdesc', 'the counter wrapped around', { index: 4 });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .mw-pwidth')].map((e) => e.value)), ['1', '1', '1', '8', '1']);
  assert.equal(await page.eval(() => document.querySelectorAll('.dlg-overlay .mw-pbits')[3].textContent), '(7:0)');
  await next(page, 'Kind of Logic');
  // clk found: sequential, reset with an asynchronous reset, the enable
  assert.ok(await page.eval(() => document.querySelector('.dlg-overlay input[name=mw-kind][value=seq]').checked));
  assert.deepEqual(await page.eval(() => ['.mw-clk', '.mw-rmode', '.mw-rst', '.mw-active', '.mw-en'].map((s) => document.querySelector(`.dlg-overlay ${s}`).value)), ['clk', 'async', 'reset', '1', 'enable']);
  await next(page, 'Summary');
  const preview = await page.eval(() => document.querySelector('.dlg-overlay .mw-preview').textContent);
  assert.match(preview, /process \(clk, reset\)/);
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .mw-summary').textContent), /^The wizard will create src\/counter8\.vhd \(VHDL\) and open it\.\n\nModule: counter8 \(architecture rtl\)/);
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

// the HDL a schematic generates, compiled and elaborated in one language: its ports and its warnings
const hdlOf = (doc, lang) => {
  const g = generateHdl({ ...doc, lang });
  const lib = compile([{ path: `src/${doc.name}.${lang === 'vhdl' ? 'vhd' : 'v'}`, lang, text: g.code }]);
  const d = elaborate(lib, doc.name);
  const all = [...g.diagnostics, ...lib.errors, ...d.diags];
  return { code: g.code, errors: all.filter((x) => x.severity === 'error').map((x) => x.message), warnings: all.filter((x) => x.severity === 'warning').map((x) => x.message) };
};
const ED = '.dlg-overlay';
const portRows = (page) => page.eval((s) => [...document.querySelectorAll(`${s} .mw-pname`)].map((e, k) => `${e.value}:${document.querySelectorAll(`${s} .mw-pdir`)[k].value}:${document.querySelectorAll(`${s} .mw-pwidth`)[k].value}`), ED);

uiTest('Schematic ▸ Wizard >: the port table starts empty (no suggested ports); the ports the user adds, edits and removes are the schematic\'s and its VHDL and Verilog ports (#950)', E, async (page) => {
  await makeProject(env, { name: 'SwPj' });
  await page.openProject('SwPj');
  await openWizard(page, 'Schematic', 'board_io', 'Schematic Wizard', 'verilog');
  assert.deepEqual(await steps(page), ['Inputs and Outputs', 'Summary']);
  await page.fill('.dlg-overlay .mw-desc', 'Switches to LEDs.');
  // only the table: no rows, no quick-add buttons, no clock checkbox
  assert.deepEqual(await portRows(page), []);
  assert.deepEqual(await page.eval(() => ['.mw-qa', '.mw-quick', '.mw-clkchk', '.mw-clkname'].filter((s) => document.querySelector(`.dlg-overlay ${s}`))), []);
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .mw-ports').textContent), /No ports yet: use Add Port\./);
  // Add Port, edited: names, directions, widths
  for (let k = 0; k < 4; k++) await page.click('.dlg-overlay .mw-add');
  assert.deepEqual(await portRows(page), ['p1:in:1', 'p2:in:1', 'p3:in:1', 'p4:in:1']);
  for (const [k, name, dir, width] of [[0, 'sw', 'in', 4], [1, 'go', 'in', 1], [2, 'led', 'out', 8], [3, 'data', 'inout', 2]]) {
    await page.fill('.dlg-overlay .mw-pname', name, { index: k });
    await page.fill('.dlg-overlay .mw-pdir', dir, { index: k });
    await page.fill('.dlg-overlay .mw-pwidth', String(width), { index: k });
  }
  // removed: the second row
  await page.click('.dlg-overlay .mw-pdel', { index: 1 });
  assert.deepEqual(await portRows(page), ['sw:in:4', 'led:out:8', 'data:inout:2']);
  await next(page, 'Summary');
  const sum = await page.eval(() => document.querySelector('.dlg-overlay .mw-summary').textContent);
  assert.match(sum, /^The wizard will create the schematic src\/board_io\.sch\.json and open it in the schematic editor\.\n\nModule: board_io \(its HDL: Verilog\)\n/);
  assert.match(sum, /Input markers \(left edge\): sw \[3:0\]\n/);
  assert.match(sum, /Output markers \(right edge\): led \[7:0\]\n/);
  assert.match(sum, /Bidirectional markers \(right edge, below the outputs\): data \[1:0\]\n/);
  assert.doesNotMatch(sum, /Clock/);
  await next(page, null);
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/board_io.sch.json' && window.Silinx.active.schEditor, [], { what: 'schematic editor' });
  const doc = await page.eval(() => window.Silinx.active.schEditor.getDoc());
  assert.equal(doc.lang, 'verilog');
  assert.deepEqual(doc.ports.map((p) => `${p.name}:${p.dir}:${p.width}`), ['sw:in:4', 'led:out:8', 'data:inout:2']);
  const ins = doc.ports.filter((p) => p.dir === 'in'), outs = doc.ports.filter((p) => p.dir === 'out');
  assert.ok(ins.every((p) => p.x === ins[0].x) && outs.every((p) => p.x === outs[0].x) && ins[0].x < outs[0].x - 800);
  // the description is drawn on the sheet
  assert.match(await page.eval(() => document.querySelector('.doc:not([hidden]) .se-desc')?.textContent || ''), /Switches to LEDs\./);
  const saved = JSON.parse(await readWs(env, 'SwPj', 'src/board_io.sch.json'));
  assert.deepEqual(saved.ports.map((p) => p.name), ['sw', 'led', 'data']);
  // the generated HDL: exactly these ports, in VHDL and in Verilog; the expected warnings (nothing drives
  // the outputs yet), no errors
  for (const lang of ['vhdl', 'verilog']) {
    const r = hdlOf(saved, lang);
    assert.deepEqual(r.errors, [], `${lang}: ${r.code}`);
    const ports = lang === 'vhdl'
      ? [...r.code.matchAll(/^\s*(\w+)\s*:\s*(in|out|inout)\s+(std_logic(?:_vector\((\d+) downto 0\))?)/gm)].map((m) => `${m[1]}:${m[2]}:${m[4] ? +m[4] + 1 : 1}`)
      : [...r.code.matchAll(/^\s*(input|output|inout)\s+(?:wire\s+)?(?:\[(\d+):0\]\s*)?(\w+)/gm)].map((m) => `${m[3]}:${{ input: 'in', output: 'out', inout: 'inout' }[m[1]]}:${m[2] ? +m[2] + 1 : 1}`);
    assert.deepEqual(ports, ['sw:in:4', 'led:out:8', 'data:inout:2'], `${lang}: ${r.code}`);
    assert.deepEqual(r.warnings, UNWIRED, `${lang} warnings`);
  }
});

uiTest('Schematic ▸ Wizard >: finishing with no ports makes a schematic with no I/O markers and an HDL module with no ports (#950)', E, async (page) => {
  await makeProject(env, { name: 'SwNone' });
  await page.openProject('SwNone');
  await openWizard(page, 'Schematic', 'empty_sch', 'Schematic Wizard', 'vhdl');
  // a port added and removed again: back to the empty table
  await page.click('.dlg-overlay .mw-add');
  await page.click('.dlg-overlay .mw-pdel');
  assert.deepEqual(await portRows(page), []);
  await next(page, 'Summary');
  const sum = await page.eval(() => document.querySelector('.dlg-overlay .mw-summary').textContent);
  assert.match(sum, /Input markers \(left edge\): none\nOutput markers \(right edge\): none\n/);
  await next(page, null);
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/empty_sch.sch.json' && window.Silinx.active.schEditor, [], { what: 'schematic editor' });
  const saved = JSON.parse(await readWs(env, 'SwNone', 'src/empty_sch.sch.json'));
  assert.deepEqual(saved.ports, []);
  for (const lang of ['vhdl', 'verilog']) {
    const r = hdlOf(saved, lang);
    assert.deepEqual(r.errors, [], `${lang}: ${r.code}`);
    assert.deepEqual(r.warnings, [], `${lang} warnings`);
    assert.doesNotMatch(r.code, lang === 'vhdl' ? /\bport\s*\(/ : /\b(input|output|inout)\b/);
  }
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
  for (const [type, title, pages] of [['Module (HDL)', 'Module Wizard', 3], ['Schematic', 'Schematic Wizard', 2]]) {
    await page.menu('Project', 'New Source…');
    await page.waitDialog('New Source');
    await setLang('pt');
    const list = await page.eval(() => [...document.querySelectorAll('.dlg-overlay .src-types .st')].map((e) => e.lastChild.textContent.trim()));
    for (const s of ['Módulo (HDL)', 'Esquemático']) assert.ok(list.includes(s), `${s} in ${list}`);
    assert.ok(!list.some((s) => /Assistente/.test(s)), `no wizard type in ${list}`);
    await setLang('en');
    await compare('New Source');
    await pickSourceType(page, type);
    await page.dialogButton('Next >');
    await waitNewSourcePage(page, 'File Name and Location');
    // the module's name refused on this page (#2082: the wizard has no page of it), its message translated too
    await page.fill('.dlg-overlay .wiz-main input[type=text]', 'entity');
    await page.dialogButton('Wizard >');
    await setLang('pt');
    await page.waitFor(() => /palavra reservada/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent), [], { what: 'Portuguese error' });
    await setLang('en');
    await page.fill('.dlg-overlay .wiz-main input[type=text]', 'pt_mod');
    await compare('New Source page 2');   // (the Wizard > button too)
    await page.dialogButton('Wizard >');
    await page.waitDialog(title);
    for (let k = 0; k < pages; k++) {
      if (k === 0) {
        await compare(`${title} page 1 (empty)`);
        if (title === 'Schematic Wizard') { await page.click('.dlg-overlay .mw-add'); await page.fill('.dlg-overlay .mw-pdir', 'out'); } else for (const [n, d, w] of [['clk', 'in', 1], ['reset', 'in', 1], ['enable', 'in', 1], ['q', 'out', 8], ['y', 'out', 1]]) await addPort(page, n, d, w);
      }
      if (k === 1 && title === 'Module Wizard') {
        await page.click('.dlg-overlay details.mw-gen summary');
        await page.click('.dlg-overlay .btn', { text: 'Add Generic' });
        await compare(`${title} page 2 (sequential)`);
        await page.click('.dlg-overlay input[name=mw-kind][value=comb]');
      }
      await compare(`${title} page ${k + 1}`);
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

uiTest('New Source: page 1 is only the type; the file name and the location on the next page (Wizard >: the wizard\'s own pages, with them, #958, #2082)', E, async (page) => {
  await makeProject(env, { name: 'NsPages', top: '' });
  await page.openProject('NsPages');
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source');
  const pick = (t) => page.eval((x) => { [...document.querySelectorAll('.dlg-overlay .src-types .st')].find((e) => e.lastChild.textContent.trim() === x).click(); }, t);
  const h3 = () => page.eval(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent);
  const labels = () => page.eval(() => [...document.querySelectorAll('.dlg-overlay .wiz-main .form-grid > label')].map((l) => l.textContent));
  await pick('Memory Initialization File (.mem)');
  assert.equal(await h3(), 'Select Source Type');
  assert.equal(await page.eval(() => document.querySelectorAll('.dlg-overlay .wiz-main input[type=text]').length), 0, 'no file name, no location on page 1');
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'File Name and Location');
  // (the same page for every type, #2140: the language too)
  assert.deepEqual(await labels(), ['Source type:', 'File name:', 'Location:', 'Language:']);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .wiz-main input[type=text]')].map((i) => i.value)), ['', 'src']);
  // an invalid name: refused here, with its message
  await page.dialogButton('Next >');
  await page.waitFor(() => /Enter a valid file name/.test(document.querySelector('.dlg-overlay').innerText));
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'rom');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'data', { index: 1 });
  await page.dialogButton('Next >');
  await page.waitFor(() => /Source Directory: data[\s\S]*Source Name: rom\.mem/.test(document.querySelector('.dlg-overlay .code-box')?.textContent || ''), [], { what: 'the summary' });
  // back to page 1, another type: Wizard > on page 2 opens its wizard with the name, the location and the language
  // typed (#958), at its own first page (#2082); an invalid location refused on page 2
  await page.dialogButton('< Back');
  await page.dialogButton('< Back');
  await pick('Module (HDL)');
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'File Name and Location');
  assert.deepEqual(await labels(), ['Source type:', 'File name:', 'Location:', 'Language:']);
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'a b', { index: 1 });
  await page.dialogButton('Wizard >');
  await page.waitFor(() => /Invalid location/.test(document.querySelector('.dlg-overlay').innerText), [], { what: 'location refused' });
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'lib', { index: 1 });
  await page.fill('.dlg-overlay .wiz-main select', 'verilog');
  await page.dialogButton('Wizard >');
  await page.waitDialog('Module Wizard');
  assert.equal(await h3(), 'Inputs and Outputs');
  await addPort(page, 'clk');
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Kind of Logic');
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Summary');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .mw-summary').textContent), /^The wizard will create lib\/rom\.v \(Verilog\) and open it\.\n\nModule: rom\n/);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.menu('Projeto', 'Nova Fonte…');
  await page.waitFor(() => /Nova Fonte/.test(document.querySelector('.dlg-overlay')?.innerText || ''), [], { what: 'the wizard in Portuguese' });
  await page.eval(() => [...document.querySelectorAll('.dlg-overlay .src-types .st')][0].click());
  await page.click('.dlg-overlay .dlg-buttons .btn.primary');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Nome do Ficheiro e Localização', [], { what: 'page 2 in Portuguese' });
  // (the first type, a truth table: no expression here, #2140: its wizard's)
  assert.deepEqual(await labels(), ['Tipo de fonte:', 'Nome do ficheiro:', 'Localização:', 'Linguagem:']);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
});
