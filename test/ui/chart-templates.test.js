// UI: the templates of the FSM, ASM and Petri net wizards (#2149), their Template page first: a template and its
// parameters fill in the next pages (still editable), a parameter refused with its message, another template chosen
// after going back replaces what the first one filled in; the chart created, its HDL compiling with no warnings;
// every template's page in Portuguese. (The templates' charts themselves: test/chart-templates.test.js.)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';
import { newSourceWizardOf } from './new-source-helpers.js';
import { compile, elaborate } from '../../core/compile.js';
import { FSM_TEMPLATES, ASM_TEMPLATES, PETRI_TEMPLATES } from '../../core/chart-templates.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const h3 = (page) => page.eval(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent);
const errText = (page) => page.eval(() => document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent);
const go = async (page, button, title) => {
  await page.dialogButton(button);
  if (title) await page.waitFor((t) => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === t, [title], { what: `page ${title}` });
};
const portRows = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay .mw-pname')].map((e, k) => `${e.value}:${document.querySelectorAll('.dlg-overlay .mw-pdir')[k].value}:${document.querySelectorAll('.dlg-overlay .mw-pwidth')[k].value}`));
const stateNames = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay .cw-sname')].map((i) => i.value));
const transRows = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay .cw-trans tr')].slice(1).map((r) => [...r.querySelectorAll('select, input')].map((e) => e.value).join(' ')));
// a generated HDL file of the project, compiled and elaborated: its errors and warnings
const diags = async (pj, path, top) => {
  const text = await readWs(env, pj, path);
  const lib = compile([{ path, lang: path.endsWith('.v') ? 'verilog' : 'vhdl', text }]);
  return [...lib.errors, ...elaborate(lib, top).diags].map((d) => `${d.severity}: ${d.message}`);
};
const logWarnings = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent).filter((t) => /^(WARNING|ERROR)/.test(t)));

uiTest('#2149 FSM Wizard templates: a counter of 5 (its pages filled in), N refused, then a Mealy sequence detector instead; the diagram created, its Verilog compiling', E, async (page) => {
  await makeProject(env, { name: 'FtPj', top: '' });
  await page.openProject('FtPj');
  await newSourceWizardOf(page, 'Finite State Machine (FSM)', 'cnt', 'FSM Wizard', { lang: 'verilog' });
  assert.equal(await h3(page), 'Template');
  assert.deepEqual(await page.eval(() => [...document.querySelector('.dlg-overlay .tp-template').options].map((o) => o.value)), FSM_TEMPLATES.map((t) => t.id));
  await page.fill('.dlg-overlay .tp-template', 'counter');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .tp-text').textContent), /^N states in a cycle/);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .tp-n').value), '8');
  await page.fill('.dlg-overlay .tp-n', '1');
  await page.dialogButton('Next >');
  await page.waitFor(() => /a whole number/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent), [], { what: 'N refused' });
  assert.equal(await errText(page), 'Number of states (N): a whole number from 2 to 64.');
  await page.fill('.dlg-overlay .tp-n', '5');
  await go(page, 'Next >', 'Inputs and Outputs');
  assert.deepEqual(await portRows(page), ['q:out:3']);
  await go(page, 'Next >', 'States and Transitions');
  assert.deepEqual(await stateNames(page), ['S0', 'S1', 'S2', 'S3', 'S4']);
  assert.deepEqual(await transRows(page), ['S0 S1 ', 'S1 S2 ', 'S2 S3 ', 'S3 S4 ', 'S4 S0 ']);
  // back to the template: a Mealy detector of 101 replaces the counter's ports, states and transitions
  await go(page, '< Back', 'Inputs and Outputs');
  await go(page, '< Back', 'Template');
  await page.fill('.dlg-overlay .tp-template', 'detector');
  await page.fill('.dlg-overlay .tp-pattern', '1012');
  await page.dialogButton('Next >');
  await page.waitFor(() => /^Pattern:/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent), [], { what: 'the pattern refused' });
  assert.equal(await errText(page), 'Pattern: 1 to 16 bits, 0 and 1 only.');
  await page.fill('.dlg-overlay .tp-pattern', '101');
  await page.fill('.dlg-overlay .tp-type', 'mealy');
  await go(page, 'Next >', 'Inputs and Outputs');
  assert.deepEqual(await portRows(page), ['x:in:1', 'z:out:1']);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .cw-type').value), 'mealy');
  await go(page, 'Next >', 'States and Transitions');
  assert.deepEqual(await stateNames(page), ['S0', 'S1', 'S2']);
  assert.deepEqual(await transRows(page), ['S0 S1 x', 'S0 S0 !x', 'S1 S1 x', 'S1 S2 !x', 'S2 S1 x', 'S2 S0 !x']);
  // a state renamed: its transitions and its outputs follow
  await page.fill('.dlg-overlay .cw-sname', 'GOT10', { index: 2 });
  assert.deepEqual((await transRows(page)).slice(3), ['S1 GOT10 !x', 'GOT10 S1 x', 'GOT10 S0 !x']);
  await go(page, 'Next >', 'Summary');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .mw-summary').textContent), /\nModule: cnt \(Verilog\), Mealy machine\nTemplate: Sequence detector\nInputs: x\nOutputs: z\n/);
  await go(page, 'Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/cnt.fsm.json', [], { what: 'the diagram opened' });
  const m = JSON.parse(await readWs(env, 'FtPj', 'src/cnt.fsm.json'));
  assert.deepEqual([m.type, m.states.map((s) => s.name), m.transitions.filter((t) => t.outputs?.z).map((t) => `${t.from}>${t.to}:${t.cond}`)], ['mealy', ['S0', 'S1', 'GOT10'], ['s3>s2:x']]);
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'src/cnt.v'), [], { what: 'its Verilog', timeout: 15000 });
  assert.deepEqual(await diags('FtPj', 'src/cnt.v', 'cnt'), []);
  assert.deepEqual(await logWarnings(page), []);
});

uiTest('#2149 ASM Wizard template: the start/done controller, its states renamed (not added or removed); the chart created, its VHDL compiling', E, async (page) => {
  await makeProject(env, { name: 'AtPj', top: '' });
  await page.openProject('AtPj');
  await newSourceWizardOf(page, 'Algorithmic State Machine (ASM)', 'ctl', 'ASM Wizard', { lang: 'vhdl' });
  assert.deepEqual(await page.eval(() => [...document.querySelector('.dlg-overlay .tp-template').options].map((o) => o.value)), ASM_TEMPLATES.map((t) => t.id));
  await page.fill('.dlg-overlay .tp-template', 'startdone');
  assert.equal(await page.eval(() => document.querySelectorAll('.dlg-overlay .tp-n').length), 0, 'no parameters');
  await go(page, 'Next >', 'Inputs and Outputs');
  assert.deepEqual(await portRows(page), ['start:in:1', 'done:in:1', 'busy:out:1', 'ready:out:1']);
  await go(page, 'Next >', 'States');
  assert.deepEqual(await stateNames(page), ['IDLE', 'RUN', 'FINISH']);
  assert.deepEqual(await page.eval(() => [document.querySelectorAll('.dlg-overlay .cw-sdel').length, getComputedStyle(document.querySelector('.dlg-overlay .cw-sadd')).display]), [0, 'none']);
  await page.fill('.dlg-overlay .cw-sname', 'WORK', { index: 1 });
  await go(page, 'Next >', 'Summary');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .mw-summary').textContent), /\nTemplate: Start\/done controller\n[\s\S]*\nStates: IDLE, WORK, FINISH \(initial: IDLE\)\n/);
  await go(page, 'Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'asm:src/ctl.asm.json', [], { what: 'the chart opened' });
  const m = JSON.parse(await readWs(env, 'AtPj', 'src/ctl.asm.json'));
  assert.deepEqual(m.nodes.map((n) => (n.type === 'state' ? `${n.name}:${n.actions.join(',')}` : `?${n.cond}`)), ['IDLE:ready = 1', '?start', 'WORK:busy = 1', '?done', 'FINISH:ready = 1']);
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'src/ctl.vhd'), [], { what: 'its VHDL', timeout: 15000 });
  assert.deepEqual(await diags('AtPj', 'src/ctl.vhd', 'ctl'), []);
  assert.deepEqual(await logWarnings(page), []);
});

uiTest('#2149 Petri Net Wizard template: mutual exclusion; the net created with its places and arcs, its VHDL compiling', E, async (page) => {
  await makeProject(env, { name: 'PtPj', top: '' });
  await page.openProject('PtPj');
  await newSourceWizardOf(page, 'Petri Net', 'arb', 'Petri Net Wizard', { lang: 'vhdl' });
  assert.deepEqual(await page.eval(() => [...document.querySelector('.dlg-overlay .tp-template').options].map((o) => o.value)), PETRI_TEMPLATES.map((t) => t.id));
  await page.fill('.dlg-overlay .tp-template', 'mutex');
  await go(page, 'Next >', 'Inputs and Outputs');
  assert.deepEqual(await portRows(page), ['req1:in:1', 'req2:in:1', 'grant1:out:1', 'grant2:out:1']);
  await go(page, 'Next >', 'Summary');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .mw-summary').textContent), /\nTemplate: Mutual exclusion \(5 places, 4 transitions\)\n[\s\S]*\nThen change it in the editor as you wish;/);
  await go(page, 'Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'pn:src/arb.pn.json', [], { what: 'the net opened' });
  const m = JSON.parse(await readWs(env, 'PtPj', 'src/arb.pn.json'));
  assert.deepEqual([m.places.map((p) => `${p.name}:${p.tokens}`), m.transitions.map((t) => `${t.name}:${t.guard}`), m.arcs.length],
    [['idle1:1', 'cs1:0', 'free:1', 'idle2:1', 'cs2:0'], ['enter1:req1', 'leave1:!req1', 'enter2:req2', 'leave2:!req2'], 12]);
  await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'src/arb.vhd'), [], { what: 'its VHDL', timeout: 15000 });
  assert.deepEqual(await diags('PtPj', 'src/arb.vhd', 'arb'), []);
  assert.deepEqual(await logWarnings(page), []);
});

uiTest('#2149 Portuguese: the Template page of every template of the FSM, ASM and Petri net wizards, and a parameter\'s message', E, async (page) => {
  await makeProject(env, { name: 'TpPt', top: '' });
  await page.openProject('TpPt');
  await page.eval(TEXTS);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  const missing = [];
  const compare = async (where) => {
    await setLang('en'); const en = await page.eval(() => window.__uiTexts(document.querySelector('.dlg-overlay')));
    await setLang('pt'); const pt = await page.eval(() => window.__uiTexts(document.querySelector('.dlg-overlay')));
    for (const s of untranslated(en, pt, [/^Fork\/join$/])) missing.push(`${where}: ${s}`);
    await setLang('en');
  };
  for (const [type, title, list] of [['Finite State Machine (FSM)', 'FSM Wizard', FSM_TEMPLATES], ['Algorithmic State Machine (ASM)', 'ASM Wizard', ASM_TEMPLATES], ['Petri Net', 'Petri Net Wizard', PETRI_TEMPLATES]]) {
    await newSourceWizardOf(page, type, 'pt_t', title);
    for (const t of list) {
      await page.fill('.dlg-overlay .tp-template', t.id);
      await compare(`${title} ${t.id}`);
    }
    if (title === 'FSM Wizard') {
      await page.fill('.dlg-overlay .tp-template', 'johnson');
      await page.fill('.dlg-overlay .tp-n', '5');
      await page.dialogButton('Next >');
      await setLang('pt');
      await page.waitFor(() => /Um contador Johnson tem um número par de estados\./.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent), [], { what: 'Johnson in Portuguese' });
      await page.fill('.dlg-overlay .tp-n', '70');
      await page.dialogButton('Seguinte >');
      await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent === 'Número de estados (N, par): um número inteiro de 2 a 64.', [], { what: 'N in Portuguese' });
      await setLang('en');
    }
    await page.dialogButton('Cancel');
    await page.waitNoDialog();
  }
  assert.deepEqual(missing, [], `untranslated:\n${missing.join('\n')}`);
});
