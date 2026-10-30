// UI: the FSM, ASM and UCF wizards of New Source (#2082), through its Wizard > button: they open at their own pages
// (no page of the name; the name, the location and the language typed on New Source). FSM: its inputs and outputs,
// clock and reset, Mealy, its states and transitions (a state renamed and removed: the transitions follow) -> the
// diagram opened, its HDL generated, compiled and elaborated with no warnings. ASM: the states chained -> the chart
// opened, its HDL the same. UCF: the top's bits on the board's pins (assigned from the board, one changed, one
// given twice refused) -> the project's constraints file; no board: the pins typed. In Portuguese. The plain path
// (Next >) of a drawing in the language chosen on New Source's page.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';
import { newSourceWizardOf, pickSourceType, waitNewSourcePage } from './new-source-helpers.js';
import { compile, elaborate } from '../../core/compile.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const ADDER = 'library ieee;\nuse ieee.std_logic_1164.all;\nentity adder is\n  port (a, b : in std_logic; s : out std_logic_vector(1 downto 0));\nend adder;\narchitecture rtl of adder is\nbegin\n  s <= (a and b) & (a xor b);\nend rtl;\n';
const h3 = (page) => page.eval(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent);
const steps = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay .wiz-side .step')].map((e) => e.textContent));
const errText = (page) => page.eval(() => document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent);
const next = async (page, title) => {
  await page.dialogButton(title === null ? 'Finish' : 'Next >');
  if (title) await page.waitFor((t) => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === t, [title], { what: `wizard page ${title}` });
};
// the ports on the Inputs and Outputs page: [name, dir, width]
const ports = async (page, list) => {
  for (const [k, [n, d, w]] of list.entries()) {
    await page.click('.dlg-overlay .mw-add');
    await page.fill('.dlg-overlay .mw-pname', n, { index: k });
    await page.fill('.dlg-overlay .mw-pdir', d, { index: k });
    await page.fill('.dlg-overlay .mw-pwidth', String(w), { index: k });
  }
};
// an HDL file of the project, compiled and elaborated: its errors and warnings
const diags = (path, text, top) => {
  const lib = compile([{ path, lang: path.endsWith('.v') ? 'verilog' : 'vhdl', text }]);
  return [...lib.errors, ...elaborate(lib, top).diags].map((d) => `${d.severity}: ${d.message}`);
};
const logWarnings = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent).filter((t) => /^(WARNING|ERROR)/.test(t)));

uiTest('#2082 FSM Wizard: inputs and outputs, Mealy, states and transitions (renamed, removed); the diagram opened, its Verilog compiling with no warnings', E, async (page) => {
  await makeProject(env, { name: 'FwPj', top: '' });
  await page.openProject('FwPj');
  await newSourceWizardOf(page, 'Finite State Machine (FSM)', 'det', 'FSM Wizard', { location: 'fsm', lang: 'verilog' });
  assert.deepEqual(await steps(page), ['Template', 'Inputs and Outputs', 'States and Transitions', 'Summary']);
  // the empty template (#2149: the others, chart-templates.test.js); the description at the end of the first page
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .tp-template').value), 'empty');
  await page.fill('.dlg-overlay .mw-desc', 'Detects 11.');
  await next(page, 'Inputs and Outputs');
  // no quick-add buttons, inputs and outputs only
  assert.equal(await page.eval(() => document.querySelectorAll('.dlg-overlay .mw-qa').length), 0);
  await ports(page, [['x', 'in', 1], ['z', 'out', 1]]);
  assert.deepEqual(await page.eval(() => [...document.querySelector('.dlg-overlay .mw-pdir').options].map((o) => o.value)), ['in', 'out']);
  await page.fill('.dlg-overlay .cw-type', 'mealy');
  // the clock named as an input: refused
  await page.fill('.dlg-overlay .cw-clock', 'x');
  await page.dialogButton('Next >');
  await page.waitFor(() => /twice/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent), [], { what: 'the clash' });
  assert.equal(await errText(page), "'x' is used twice (the clock and input)");
  await page.fill('.dlg-overlay .cw-clock', 'clk');
  await next(page, 'States and Transitions');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .cw-sname')].map((i) => i.value)), ['S0', 'S1']);
  await page.click('.dlg-overlay .cw-sadd');
  for (let k = 0; k < 4; k++) await page.click('.dlg-overlay .cw-tadd');
  // (each new transition from where the last one ended, to the next state)
  const trans = () => page.eval(() => [...document.querySelectorAll('.dlg-overlay .cw-trans tr')].slice(1).map((r) => [...r.querySelectorAll('select, input')].map((e) => e.value).join(' ')));
  assert.deepEqual(await trans(), ['S0 S1 ', 'S1 S2 ', 'S2 S0 ', 'S0 S1 ']);
  for (const [k, c] of ['x', 'x', '', '!x'].entries()) await page.fill('.dlg-overlay .cw-tcond', c, { index: k });
  await page.fill('.dlg-overlay .cw-tto', 'S0', { index: 3 });
  // a state renamed: its transitions follow; a state removed: its transitions go
  await page.fill('.dlg-overlay .cw-sname', 'IDLE', { index: 0 });
  assert.deepEqual(await trans(), ['IDLE S1 x', 'S1 S2 x', 'S2 IDLE ', 'IDLE IDLE !x']);
  await page.click('.dlg-overlay .cw-sadd');
  await page.click('.dlg-overlay .cw-sdel', { index: 3 });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .cw-sname')].map((i) => i.value)), ['IDLE', 'S1', 'S2']);
  // two states of one name, a bad condition: refused with their messages
  await page.fill('.dlg-overlay .cw-sname', 'idle', { index: 1 });
  await page.dialogButton('Next >');
  await page.waitFor(() => /Two states are named/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent), [], { what: 'two states of a name' });
  assert.equal(await errText(page), "Two states are named 'idle'.");
  await page.fill('.dlg-overlay .cw-sname', 'S1', { index: 1 });
  await page.fill('.dlg-overlay .cw-tcond', 'x &&', { index: 0 });
  await page.dialogButton('Next >');
  await page.waitFor(() => /not valid/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent), [], { what: 'a bad condition' });
  await page.fill('.dlg-overlay .cw-tcond', 'x', { index: 0 });
  await next(page, 'Summary');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .mw-summary').textContent), [
    'The wizard will create the state diagram fsm/det.fsm.json and open it in the FSM editor.', '',
    'Module: det (Verilog), Mealy machine', 'Inputs: x', 'Outputs: z', 'Clock: clk; reset: rst (asynchronous, active high)',
    'States: IDLE, S1, S2 (initial: IDLE)', 'Transitions: IDLE → S1 (x), S1 → S2 (x), S2 → IDLE, IDLE → IDLE (!x)', '',
    'Then set the outputs of the states (and of the transitions, Mealy) in the editor.'].join('\n'));
  await next(page, null);
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'fsm:fsm/det.fsm.json', [], { what: 'the diagram opened' });
  const m = JSON.parse(await readWs(env, 'FwPj', 'fsm/det.fsm.json'));
  assert.deepEqual([m.name, m.lang, m.type, m.description, m.initial, m.states.map((s) => s.name), m.transitions.map((t) => `${t.from}>${t.to}:${t.cond}`)],
    ['det', 'verilog', 'mealy', 'Detects 11.', 's1', ['IDLE', 'S1', 'S2'], ['s1>s2:x', 's2>s3:x', 's3>s1:', 's1>s1:!x']]);
  // its HDL file, made with it, compiling with no warnings
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'fsm/det.v'), [], { what: 'fsm/det.v', timeout: 15000 });
  assert.deepEqual(diags('fsm/det.v', await readWs(env, 'FwPj', 'fsm/det.v'), 'det'), []);
  assert.match(await page.eval(() => document.querySelector('#console, .console-page')?.textContent || ''), /FSM Wizard: created fsm\/det\.fsm\.json with 1 input\(s\), 1 output\(s\) and 3 state\(s\)\./);
  assert.deepEqual(await logWarnings(page), []);
});

uiTest('#2082 ASM Wizard: inputs and outputs, the states chained; the chart opened, its VHDL compiling with no warnings', E, async (page) => {
  await makeProject(env, { name: 'AwPj', top: '' });
  await page.openProject('AwPj');
  await newSourceWizardOf(page, 'Algorithmic State Machine (ASM)', 'ctl', 'ASM Wizard', { lang: 'vhdl' });
  assert.deepEqual(await steps(page), ['Template', 'Inputs and Outputs', 'States', 'Summary']);
  await next(page, 'Inputs and Outputs');
  await ports(page, [['start', 'in', 1], ['n', 'in', 4], ['busy', 'out', 1]]);
  await next(page, 'States');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .cw-sname')].map((i) => i.value)), ['IDLE', 'RUN']);
  assert.equal(await page.eval(() => document.querySelectorAll('.dlg-overlay .cw-trans').length), 0);
  await page.click('.dlg-overlay .cw-sadd');
  await page.fill('.dlg-overlay .cw-sname', 'DONE', { index: 2 });
  // no states: refused
  for (let k = 0; k < 3; k++) await page.click('.dlg-overlay .cw-sdel');
  await page.dialogButton('Next >');
  await page.waitFor(() => /at least one state/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent), [], { what: 'no states' });
  for (const s of ['IDLE', 'RUN', 'DONE']) { await page.click('.dlg-overlay .cw-sadd'); await page.fill('.dlg-overlay .cw-sname', s, { index: await page.eval(() => document.querySelectorAll('.dlg-overlay .cw-sname').length - 1) }); }
  await next(page, 'Summary');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .mw-summary').textContent), [
    'The wizard will create the ASM chart src/ctl.asm.json and open it in the ASM editor.', '',
    'Module: ctl (VHDL)', 'Inputs: start, n [3:0]', 'Outputs: busy', 'Clock: clk; reset: rst (asynchronous, active high)',
    'States: IDLE → RUN → DONE → IDLE', '', 'Then add the decision boxes and the outputs in the editor.'].join('\n'));
  await next(page, null);
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'asm:src/ctl.asm.json', [], { what: 'the chart opened' });
  const m = JSON.parse(await readWs(env, 'AwPj', 'src/ctl.asm.json'));
  assert.deepEqual([m.lang, m.nodes.map((n) => `${n.type}:${n.name}`), m.edges.map((e) => `${e.from}>${e.to}`)],
    ['vhdl', ['state:IDLE', 'state:RUN', 'state:DONE'], ['s1>s2', 's2>s3', 's3>s1']]);
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'src/ctl.vhd'), [], { what: 'src/ctl.vhd', timeout: 15000 });
  assert.deepEqual(diags('src/ctl.vhd', await readWs(env, 'AwPj', 'src/ctl.vhd'), 'ctl'), []);
  assert.deepEqual(await logWarnings(page), []);
});

uiTest('#2082 UCF Wizard on the Basys2: the top\'s bits on the board\'s pins, one changed, one given twice refused; the project\'s constraints file', E, async (page) => {
  await makeProject(env, { name: 'UwPj', top: 'adder', board: 'basys2', files: { 'src/adder.vhd': ADDER } });
  await page.openProject('UwPj');
  await newSourceWizardOf(page, 'Implementation Constraints File', 'pins', 'UCF Wizard');
  assert.deepEqual(await steps(page), ['Ports and Pins', 'Summary']);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .uw-module').value), 'adder');
  const rows = () => page.eval(() => [...document.querySelectorAll('.dlg-overlay .uw-pins tr')].slice(1).map((r) => `${r.cells[0].textContent} ${r.cells[1].textContent} ${r.querySelector('.uw-pin')?.value}`));
  // assigned from the board as I/O Pin Planning's Auto-assign: the inputs on the switches, the outputs on the LEDs
  const [sw, led] = await page.eval(() => ['Switches', 'LEDs'].map((g) => window.SilinxApp.projectBoard().resources.filter((r) => r.group === g).flatMap((r) => r.pins)));
  const before = await rows(page);
  assert.deepEqual(before, [`a in ${sw[0]}`, `b in ${sw[1]}`, `s<1> out ${led[1]}`, `s<0> out ${led[0]}`]);
  // s<0> on a's pin: refused; then on the third LED
  const aPin = before[0].split(' ').pop();
  await page.fill('.dlg-overlay .uw-pin[data-net="s<0>"]', aPin);
  await page.dialogButton('Next >');
  await page.waitFor(() => /is given to/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent), [], { what: 'a pin given twice' });
  assert.match(await errText(page), new RegExp(`^The pin ${aPin} is given to (a and s<0>|s<0> and a)\\.$`));
  await page.fill('.dlg-overlay .uw-pin[data-net="s<0>"]', led[2]);
  await next(page, 'Summary');
  const preview = await page.eval(() => document.querySelector('.dlg-overlay .uw-preview').textContent);
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .wiz-main').innerText), /^Summary\nThe wizard will create constraints\/pins\.ucf, the project's constraints file:/);
  assert.match(preview, new RegExp(`NET "s<0>"\\s+LOC = "${led[2]}"`));
  await next(page, null);
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project.constraints === 'constraints/pins.ucf', [], { what: 'the constraints file' });
  assert.equal(await readWs(env, 'UwPj', 'constraints/pins.ucf'), preview);
  assert.deepEqual(await logWarnings(page), []);
});

uiTest('#2082 UCF Wizard with no board: the pins typed; the module chosen', E, async (page) => {
  await makeProject(env, { name: 'UwNo', top: 'adder', files: { 'src/adder.vhd': ADDER, 'constraints/top.ucf': '# mine\n' } });
  await page.openProject('UwNo');
  await newSourceWizardOf(page, 'Implementation Constraints File', 'more', 'UCF Wizard');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .wiz-main').innerText), /No board selected/);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .uw-assign').disabled), true);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay input.uw-pin')].map((i) => `${i.dataset.net}=${i.value}`)), ['a=', 'b=', 's<1>=', 's<0>=']);
  await page.fill('.dlg-overlay .uw-pin[data-net=a]', 'p11');
  await next(page, 'Summary');
  const preview = await page.eval(() => document.querySelector('.dlg-overlay .uw-preview').textContent);
  assert.match(preview, /NET "a"\s+LOC = "P11" ;/);
  assert.match(preview, /# NET "b"\s+LOC = "" ;  # unassigned/);
  // the project has a constraints file: this one is added, not made the project's
  assert.doesNotMatch(await page.eval(() => document.querySelector('.dlg-overlay .wiz-main').innerText), /the project's constraints file/);
  await next(page, null);
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'file:constraints/more.ucf', [], { what: 'constraints/more.ucf opened' });
  assert.match(await readWs(env, 'UwNo', 'constraints/more.ucf'), /^# UCF generated by the Silinx UCF Wizard for 'adder' \(xc3s250e-4-cp132\)\n\nNET "a"\s+LOC = "P11" ;\n/);
  assert.equal(await page.eval(() => window.Silinx.project.constraints), 'constraints/top.ucf');
});

uiTest('#2082 New Source ▸ Next > of a drawing: its HDL in the language chosen on the page (FSM in Verilog)', E, async (page) => {
  await makeProject(env, { name: 'NlPj', top: '' });
  await page.openProject('NlPj');
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source');
  await pickSourceType(page, 'Finite State Machine (FSM)');
  await page.dialogButton('Next >');
  await waitNewSourcePage(page, 'File Name and Location');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'plain_fsm');
  await page.fill('.dlg-overlay .wiz-main select', 'verilog');
  await next(page, 'Summary');
  await next(page, null);
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/plain_fsm.fsm.json', [], { what: 'the diagram opened' });
  assert.equal(JSON.parse(await readWs(env, 'NlPj', 'src/plain_fsm.fsm.json')).lang, 'verilog');
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'src/plain_fsm.v'), [], { what: 'its Verilog', timeout: 15000 });
});

uiTest('#2082 Portuguese: every page of the FSM, ASM and UCF wizards translated', E, async (page) => {
  await makeProject(env, { name: 'CwPt', top: 'adder', board: 'basys2', files: { 'src/adder.vhd': ADDER } });
  await page.openProject('CwPt');
  await page.eval(TEXTS);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  const missing = [];
  const compare = async (where) => {
    await setLang('en'); const en = await page.eval(() => window.__uiTexts(document.querySelector('.dlg-overlay')));
    await setLang('pt'); const pt = await page.eval(() => window.__uiTexts(document.querySelector('.dlg-overlay')));
    for (const s of untranslated(en, pt, [/^(x|z|S\d|IDLE|RUN|DONE|clk|rst|in|out)$/, /^\(none\)$/, /·/])) missing.push(`${where}: ${s}`);
    await setLang('en');
  };
  for (const [type, title] of [['Finite State Machine (FSM)', 'FSM Wizard'], ['Algorithmic State Machine (ASM)', 'ASM Wizard'], ['Implementation Constraints File', 'UCF Wizard']]) {
    await newSourceWizardOf(page, type, 'pt_w', title);
    if (title !== 'UCF Wizard') {
      await compare(`${title} Template`);
      await next(page, 'Inputs and Outputs');
      await ports(page, [['x', 'in', 1], ['z', 'out', 1]]);
    }
    for (;;) {
      const t = await h3(page);
      if (t === 'States and Transitions') { await page.click('.dlg-overlay .cw-tadd'); await compare(`${title} ${t} (a transition)`); await page.click('.dlg-overlay .cw-tdel'); }
      await compare(`${title} ${t}`);
      if (t === 'Summary') break;
      await page.dialogButton('Next >');
      await page.waitFor((x) => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent !== x, [t], { what: `after ${t}` });
    }
    await page.dialogButton('Cancel');
    await page.waitNoDialog();
  }
  // a message: translated
  await newSourceWizardOf(page, 'Algorithmic State Machine (ASM)', 'pt_w', 'ASM Wizard');
  await next(page, 'Inputs and Outputs');
  await next(page, 'States');
  await page.click('.dlg-overlay .cw-sdel');
  await page.click('.dlg-overlay .cw-sdel');
  await page.dialogButton('Next >');
  await setLang('pt');
  await page.waitFor(() => /Acrescente pelo menos um estado\./.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent), [], { what: 'the message in Portuguese' });
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay').innerText), /Assistente de ASM[\s\S]*Estados/);
  await setLang('en');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.deepEqual(missing, [], `untranslated:\n${missing.join('\n')}`);
});
