// UI: the guided labs (#3179, web/js/lab-view.js): Project ▸ Guided Labs… lists the gates example's "First steps",
// which opens as a document; each shipped lab run step by step: Check Step ticks a step whose action is done (the
// Steps panel's tick, the next step shown, the console's lines), not one whose action is wrong (its hint shown then);
// the progress kept in the project (the lab reopened where it was left, its list saying so), restarted from its ⋮
// menu; its Steps panel folded to a strip (remembered), over the page behind ☰ Steps on a narrow window; in Portuguese.
// The traffic and blinky labs: a step on the state diagram, the processes' steps checked on their last run (Synthesize,
// Implement Design, Generate Programming File run in the page; out of date after a change of the sources).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs, writeWs } from './harness.js';
import { generateFsm } from '../../core/fsm-hdl.js';
import { pickSourceType, waitNewSourcePage } from './new-source-helpers.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const D = '.doc:not([hidden]) .lab';
const LAB = 'gates-first-steps';
// gates.vhd with an output even: the step "Add an output"'s action (right: even = not d; wrong: even = d)
const withEven = (vhd, expr) => vhd.replace('led : out std_logic_vector(1 downto 0)', 'led : out std_logic_vector(1 downto 0);\n    even : out std_logic')
  .replace('begin\n  d <=', `begin\n  even <= ${expr};\n  d <=`);
const SHIPPED = ['First stepsSilinx\'s, for the gates example', 'A state machineSilinx\'s, for the traffic example', 'The clock and the boardSilinx\'s, for the blinky example',
  'The emulatorSilinx\'s, for the stopwatch example'];

// Project ▸ Guided Labs…: the lab `id` opened (its rows' texts returned)
async function openLab(page, id) {
  await page.menu('Project', 'Guided Labs…');
  await page.waitDialog('Guided Labs');
  const rows = await page.eval(() => [...document.querySelectorAll('.dlg-overlay .lab-pick')].map((b) => b.textContent));
  await page.click(`.dlg-overlay .lab-pick[data-lab="${id}"]`);
  await page.waitNoDialog();
  await page.waitFor((d, i) => window.Silinx.active?.id === `lab:${i}` && document.querySelector(d)?.dataset.ready === '1', [D, id], { what: 'the lab' });
  return rows;
}
// Check Step on step k of n: the console's lines it wrote
async function checkStepOf(page, k, n) {
  const before = await page.eval(() => window.__console().length);
  await page.click(`${D} .lab-bar .asm-btn`, { text: 'Check Step' });
  await page.waitFor((c, k0, n0) => window.__console().length > c && new RegExp(`step ${k0} of ${n0}[^]*(Step done\\.|Not done yet)`).test(window.__console().slice(c)), [before, k, n], { what: `step ${k} checked` });
  await page.waitFor((d) => !document.querySelector(`${d} .lab-bar [data-cmd="check-step"]`).disabled, [D], { what: 'the lab shown again' });
  return page.eval((c) => window.__console().slice(c), before);
}
const ticks = (page) => page.eval((d) => [...document.querySelectorAll(`${d} .lab-step`)].map((s) => (s.classList.contains('done') ? '✓' : '·') + (s.classList.contains('current') ? '<' : '')).join(' '), D);
// a process run from the Processes pane (its row's name starting with `name`), to its end (not the processes it runs first)
async function runProcess(page, name) {
  const before = await page.eval(() => window.__console().length);
  await page.treeRow('#procs', name, { dbl: true });
  await page.waitFor((c, n) => new RegExp(`Process "${n}[^"]*" (completed successfully|failed)`).test(window.__console().slice(c)), [before, name], { what: `${name} run`, timeout: 120000 });
  return page.eval((c) => window.__console().slice(c), before);
}

uiTest('#3179 a guided lab: the gates example\'s first steps run step by step (the right action ticks a step, a wrong one does not, its hint then), resumed, restarted; its Steps panel folded and on a narrow window; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'gates', template: 'gates' });
  await page.setViewport(1366, 768);
  await page.eval(async () => {
    const [{ prefKey }, { STEPS_KEY }] = await Promise.all([import('/js/prefs.js'), import('/js/lab-view.js')]);
    localStorage.removeItem(prefKey('silinx.lab.steps.folded')); localStorage.removeItem(STEPS_KEY);
  });
  await page.openProject('gates');
  const open = () => openLab(page, LAB);
  const look = () => page.eval((d) => {
    const lab = document.querySelector(d), side = lab.querySelector('.lab-side'), shown = (e) => !!e && e.getClientRects().length > 0;
    return {
      tab: window.Silinx.active.tab.querySelector('.tlabel').textContent,
      buttons: [...lab.querySelectorAll('.lab-bar .asm-btn:not(.tb-more-btn)')].filter(shown).map((b) => `${b.textContent}${b.disabled ? ' (off)' : ''}`),
      num: lab.querySelector('.lab-num').textContent, title: lab.querySelector('.lab-title').textContent,
      hint: lab.querySelector('.lab-hint')?.textContent ?? null,
      steps: [...lab.querySelectorAll('.lab-step')].map((s) => `${s.querySelector('.lab-tick').textContent} ${s.textContent.slice(s.querySelector('.lab-tick').textContent.length)}${s.classList.contains('current') ? ' <' : ''}`),
      status: [...lab.querySelectorAll('.doc-status .ds-f')].map((f) => f.textContent).join(' · '), cap: side.querySelector('.asm-cap').textContent,
      shown: shown(side), width: side.offsetWidth, over: getComputedStyle(side).position === 'absolute', folded: lab.classList.contains('props-folded'), page: lab.querySelector('.lab-page').offsetWidth,
    };
  }, D);
  const checkStep = (k) => checkStepOf(page, k, 5);

  // the list: the example's lab, none done; opened at its first step, its intro first
  assert.deepEqual(await open(), [`${SHIPPED[0]}0 of 5 steps done`, `${SHIPPED[1]}0 of 4 steps done`, `${SHIPPED[2]}0 of 6 steps done`, `${SHIPPED[3]}0 of 5 steps done`]);
  let L = await look();
  assert.deepEqual({ tab: L.tab, buttons: L.buttons, num: L.num, title: L.title, hint: L.hint, status: L.status, cap: L.cap },
    { tab: 'Lab: First steps', buttons: ['Check Step', '◀ Previous (off)', 'Next ▶'], num: 'Step 1 of 5', title: 'The project', hint: null, status: 'Step 1 of 5 · 0 done', cap: 'Steps' });
  assert.deepEqual(L.steps, ['1 The project <', '2 Check Syntax', '3 Simulate', '4 Add an output', '5 A pin of the board']);
  assert.match(await page.eval((d) => document.querySelector(`${d} .lab-intro`).textContent, D), /^The gates example is a prime-number detector/);
  assert.deepEqual([L.shown, L.over, L.folded], [true, false, false]);
  // the first three steps: the example as it is does them; each ticked, the next shown
  for (const [k, title] of [[1, 'The project'], [2, 'Check Syntax'], [3, 'Simulate']]) {
    const out = await checkStep(k);
    assert.ok(out.includes(`Lab "First steps", step ${k} of 5: ${title}`) && /Step done\./.test(out) && !/WARNING/.test(out), out);
  }
  L = await look();
  assert.deepEqual(L.steps, ['✓ The project', '✓ Check Syntax', '✓ Simulate', '4 Add an output <', '5 A pin of the board']);
  assert.deepEqual([L.num, L.title, L.status], ['Step 4 of 5', 'Add an output', 'Step 4 of 5 · 3 done']);
  // "Add an output", not done: why (as warnings, in the console's Warnings tab too), and its hint in the page
  let out = await checkStep(4);
  assert.match(out, /WARNING: module gates has no port even\nWARNING: there is no signal uut\/even in tb_gates\nHint: A number is even[^\n]*\nNot done yet \(2 problem\(s\)\)\./);
  L = await look();
  assert.equal(L.hint, 'Hint: A number is even when its last bit, d, is 0: even = NOT d. The output must be called even, one bit, an output.');
  assert.equal(L.steps[3], '4 Add an output <');
  // a wrong action: even = d; not ticked
  const vhd = await readWs(env, 'gates', 'src/gates.vhd');
  await writeWs(env, 'gates', 'src/gates.vhd', withEven(vhd, 'd'));
  out = await checkStep(4);
  assert.match(out, /WARNING: uut\/even is 0 at 5 ns, not 1\n/);
  assert.doesNotMatch(out, /no port even/);
  assert.equal((await look()).steps[3], '4 Add an output <');
  // the right one: ticked, the last step shown
  await writeWs(env, 'gates', 'src/gates.vhd', withEven(vhd, 'not d'));
  out = await checkStep(4);
  assert.ok(/Step done\./.test(out) && !/WARNING/.test(out), out);
  L = await look();
  assert.deepEqual([L.steps[3], L.num, L.hint], ['✓ Add an output', 'Step 5 of 5', null]);
  // the pin: LD1's (wrong), then LD2's (right): every step done
  const ucf = await readWs(env, 'gates', 'constraints/gates.ucf');
  await writeWs(env, 'gates', 'constraints/gates.ucf', `${ucf}NET "even" LOC = "M11" ;\n`);
  assert.match(await checkStep(5), /WARNING: constraints\/gates\.ucf has nothing like/);
  assert.equal((await look()).steps[4], '5 A pin of the board <');
  await writeWs(env, 'gates', 'constraints/gates.ucf', `${ucf}NET "even" LOC = "P7" ;\n`);
  assert.match(await checkStep(5), /Step done\.\nEvery step of the lab "First steps" is done\./);
  L = await look();
  assert.deepEqual([L.steps.every((s) => s.startsWith('✓')), L.status, L.buttons], [true, 'Step 5 of 5 · 5 done', ['Check Step', '◀ Previous', 'Next ▶ (off)']]);
  // the progress: the project's; the lab closed and opened again where it was left, its list saying so
  const progress = JSON.parse(await readWs(env, 'gates', 'labs/progress.json'));
  assert.deepEqual([Object.keys(progress[LAB].done), progress[LAB].tries, progress[LAB].step], [['project', 'syntax', 'simulate', 'even', 'pin'], { even: 2, pin: 1 }, 5]);
  await page.click(`${D} .lab-step`, { index: 1 });
  assert.equal((await look()).num, 'Step 2 of 5', 'a step of the panel shown');
  await page.eval((id) => window.SilinxApp.closeDoc(window.SilinxApp.findDoc(`lab:${id}`), { force: true }), LAB);
  assert.deepEqual((await open())[0], `${SHIPPED[0]}5 of 5 steps done`);
  L = await look();
  assert.deepEqual([L.num, L.steps.filter((s) => s.startsWith('✓')).length], ['Step 2 of 5', 5]);

  // the Steps panel folded to a strip: the page wider; remembered; a click on the strip expands it
  const wide = L.page, width = L.width;
  await page.click(`${D} .lab-side .asm-fold`);
  L = await look();
  assert.ok(L.folded && L.width === 24 && L.page >= wide, JSON.stringify(L));
  assert.equal(await page.eval((d) => document.querySelector(`${d} .lab-side .asm-fold`).title, D), 'Expand the Steps panel');
  await page.eval((id) => window.SilinxApp.closeDoc(window.SilinxApp.findDoc(`lab:${id}`), { force: true }), LAB);
  await open();
  assert.deepEqual([(await look()).folded, (await look()).width], [true, 24], 'remembered');
  await page.click(`${D} .lab-side`);
  L = await look();
  assert.ok(!L.folded && L.width === width, JSON.stringify(L));
  // a narrow window: the panel hidden, ☰ Steps shows it over the page
  await page.setViewport(900, 700);
  await page.eval(async () => (await import('/js/narrow.js')).setDrawer(false, { remember: false }));
  await page.waitFor((d) => !document.querySelector(`${d} .lab-side`).getClientRects().length, [D], { what: 'the panel hidden' });
  assert.equal((await look()).buttons.at(-1), '☰ Steps');
  await page.click(`${D} .lab-bar .asm-btn`, { text: '☰ Steps' });
  L = await look();
  assert.ok(L.shown && L.over, JSON.stringify(L));

  // in Portuguese: the interface's labels, the lab's own texts in its Portuguese
  await page.eval(() => import('/js/i18n.js').then((m) => m.setLanguage('pt')));
  await page.waitFor(() => document.documentElement.lang === 'pt');
  L = await look();
  assert.deepEqual({ tab: L.tab, buttons: L.buttons, num: L.num, title: L.title, cap: L.cap, status: L.status, step: L.steps[0] },
    { tab: 'Laboratório: Primeiros passos', buttons: ['Verificar Passo', '◀ Anterior', 'Seguinte ▶', '☰ Passos'], num: 'Passo 2 de 5', title: 'Verificar a sintaxe ✓ Feito', cap: 'Passos', status: 'Passo 2 de 5 · 5 feitos', step: '✓ O projeto' });
  await page.eval(() => import('/js/i18n.js').then((m) => m.setLanguage('en')));
  await page.waitFor(() => document.documentElement.lang === 'en');
  await page.click(`${D} .lab-bar .asm-btn`, { text: '☰ Steps' });
  assert.equal((await look()).shown, false, 'hidden again');
  await page.setViewport(1366, 768);

  // restarted from its ⋮ menu: no step done, at the first one
  await page.click(`${D} .lab-bar .tb-more-btn`);
  await page.click(`${D} .lab-bar .tb-more-menu .asm-btn`, { text: 'Restart the Lab' });
  await page.waitFor((d) => document.querySelector(`${d} .lab-num`).textContent === 'Step 1 of 5', [D], { what: 'restarted' });
  L = await look();
  assert.deepEqual([L.steps.filter((s) => s.startsWith('✓')).length, L.status], [0, 'Step 1 of 5 · 0 done']);
  assert.deepEqual(JSON.parse(await readWs(env, 'gates', 'labs/progress.json')), { [LAB]: { step: 1, done: {}, tries: {} } });
  await page.waitConsole(/Lab "First steps" restarted: no step done\./);
  assert.doesNotMatch(await page.consoleText(), /ERROR/);
}, { timeout: 180000 });

// the processes run by the Silinx toolchain (no ISE)
async function silinxToolchain(page) {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await page.eval(async () => { window.SilinxApp.S.toolchain = await (await import('/js/api.js')).api.toolchain(); window.SilinxApp.renderProcesses(); });
}

// traffic's state diagram with the output walking (1 in the states `on`), and the VHDL the FSM editor saves beside it
function walking(fsmText, on) {
  const fsm = JSON.parse(fsmText);
  fsm.outputs.push({ name: 'walking', width: 1, default: '0' });
  for (const st of fsm.states) if (on.includes(st.name)) st.outputs.walking = '1';
  return { fsm: `${JSON.stringify(fsm, null, 2)}\n`, vhd: generateFsm(fsm, 'vhdl', { source: 'traffic.fsm.json' }).code };
}

uiTest('#3179 the traffic lab: the state diagram, its simulation, a new output (a wrong one not ticked), Synthesize checked on its last run (not run, run, out of date, run again)', E, async (page) => {
  await makeProject(env, { name: 'traffic', template: 'traffic' });
  await page.setViewport(1366, 768);
  await page.openProject('traffic');
  await silinxToolchain(page);
  assert.deepEqual(await openLab(page, 'traffic-state-machine'), [`${SHIPPED[1]}0 of 4 steps done`, `${SHIPPED[0]}0 of 5 steps done`, `${SHIPPED[2]}0 of 6 steps done`, `${SHIPPED[3]}0 of 5 steps done`], 'the example\'s lab first');
  assert.equal(await page.eval(() => window.Silinx.active.tab.querySelector('.tlabel').textContent), 'Lab: A state machine');
  for (const [k, title] of [[1, 'The state diagram'], [2, 'Simulate']]) {
    const out = await checkStepOf(page, k, 4);
    assert.ok(out.includes(`Lab "A state machine", step ${k} of 4: ${title}`) && /Step done\./.test(out) && !/WARNING/.test(out), out);
  }
  assert.equal(await ticks(page), '✓ ✓ ·< ·');
  // the output: not there; in WALK only (wrong: 0 in WALK_END); in both
  assert.match(await checkStepOf(page, 3, 4), /WARNING: module traffic has no port walking\nWARNING: there is no signal uut\/u_fsm\/walking in tb_traffic\nHint: A Moore output takes its default/);
  const fsm = await readWs(env, 'traffic', 'src/traffic.fsm.json');
  let w = walking(fsm, ['WALK']);
  await writeWs(env, 'traffic', 'src/traffic.fsm.json', w.fsm);
  await writeWs(env, 'traffic', 'src/traffic.vhd', w.vhd);
  let out = await checkStepOf(page, 3, 4);
  assert.match(out, /\nWARNING: uut\/u_fsm\/walking is 0 at 5000 ns, not 1\n/);
  assert.match(out, /Not done yet \(1 problem\(s\)\)\./);
  w = walking(fsm, ['WALK', 'WALK_END']);
  await writeWs(env, 'traffic', 'src/traffic.fsm.json', w.fsm);
  await writeWs(env, 'traffic', 'src/traffic.vhd', w.vhd);
  out = await checkStepOf(page, 3, 4);
  assert.ok(/Step done\./.test(out) && !/WARNING/.test(out), out);
  assert.equal(await ticks(page), '✓ ✓ ✓ ·<');
  // Synthesize: not run; run (no warnings): done
  assert.match(await checkStepOf(page, 4, 4), /WARNING: Synthesize has not run: run it \(the Processes pane\)\nHint: Run Synthesize after the last change/);
  out = await runProcess(page, 'Synthesize');
  assert.match(out, /Process "Synthesize[^"]*" completed successfully/);
  out = await checkStepOf(page, 4, 4);
  assert.match(out, /Step done\.\nEvery step of the lab "A state machine" is done\./);
  // a source changed after it: out of date, the step not done any more; run again: done
  await writeWs(env, 'traffic', 'src/timer.vhd', `${await readWs(env, 'traffic', 'src/timer.vhd')}\n`);
  await page.waitFor(() => window.SilinxApp.S.status.synth === 'stale', [], { what: 'Synthesize out of date', timeout: 30000 });
  assert.match(await checkStepOf(page, 4, 4), /WARNING: the sources changed since Synthesize ran: run it again\n/);
  assert.equal(await ticks(page), '✓ ✓ ✓ ·<');
  await runProcess(page, 'Synthesize');
  assert.match(await checkStepOf(page, 4, 4), /Step done\./);
  const progress = JSON.parse(await readWs(env, 'traffic', 'labs/progress.json'))['traffic-state-machine'];
  assert.deepEqual([Object.keys(progress.done), progress.tries], [['diagram', 'simulate', 'output', 'synthesize'], { output: 2, synthesize: 2 }]);
  assert.doesNotMatch(await page.consoleText(), /ERROR/);
}, { timeout: 240000 });

uiTest('#3179 the blinky lab: the board, the clock, the simulation, the speed (a wrong one not ticked), Implement Design with its timing met, the bitstream', E, async (page) => {
  await makeProject(env, { name: 'blinky', template: 'blinky' });
  await page.setViewport(1366, 768);
  await page.openProject('blinky');
  await silinxToolchain(page);
  assert.deepEqual((await openLab(page, 'blinky-clock-board'))[0], `${SHIPPED[2]}0 of 6 steps done`);
  for (const [k, title] of [[1, 'The board'], [2, 'The clock'], [3, 'Simulate']]) {
    const out = await checkStepOf(page, k, 6);
    assert.ok(out.includes(`Lab "The clock and the board", step ${k} of 6: ${title}`) && /Step done\./.test(out) && !/WARNING/.test(out), out);
  }
  // the speed: three times as fast (wrong), then twice
  const top = await readWs(env, 'blinky', 'src/top.vhd');
  await writeWs(env, 'blinky', 'src/top.vhd', top.replace('DIV      : integer := 0;', 'DIV      : integer := 208_333;'));
  assert.match(await checkStepOf(page, 4, 6), /WARNING: src\/top\.vhd has nothing like '[^']*312_\?500[^']*'\nHint: Twice as fast is half/);
  await writeWs(env, 'blinky', 'src/top.vhd', top.replace('DIV      : integer := 0;', 'DIV      : integer := 312_500;'));
  assert.match(await checkStepOf(page, 4, 6), /Step done\./);
  assert.equal(await ticks(page), '✓ ✓ ✓ ✓ ·< ·');
  // Implement Design: not run, then run: no warnings, its timing met; the bitstream after it
  assert.match(await checkStepOf(page, 5, 6), /WARNING: Implement Design has not run: run it \(the Processes pane\)\n/);
  assert.match(await runProcess(page, 'Implement Design'), /Process "Implement Design" completed successfully/);
  assert.match(await checkStepOf(page, 5, 6), /Step done\./);
  assert.match(await checkStepOf(page, 6, 6), /WARNING: Generate Programming File has not run: run it \(the Processes pane\)\n/);
  assert.match(await runProcess(page, 'Generate Programming File'), /Process "Generate Programming File" completed successfully/);
  assert.match(await checkStepOf(page, 6, 6), /Step done\.\nEvery step of the lab "The clock and the board" is done\./);
  assert.equal(await ticks(page), '✓ ✓ ✓ ✓ ✓ ✓<');
  assert.equal(await page.eval((d) => [...document.querySelectorAll(`${d} .doc-status .ds-f`)].map((f) => f.textContent).join(' · '), D), 'Step 6 of 6 · 6 done');
  assert.doesNotMatch(await page.consoleText(), /ERROR/);
}, { timeout: 240000 });

uiTest('#3179 the stopwatch lab: the emulator (a step to try), the test bench, the reset moved to SW7 (a wrong pin not ticked); Copy Link… with the lab, and a link that opens it', E, async (page) => {
  await makeProject(env, { name: 'stopwatch', template: 'stopwatch' });
  await page.setViewport(1366, 768);
  await page.openProject('stopwatch');
  assert.deepEqual((await openLab(page, 'stopwatch-emulator'))[0], `${SHIPPED[3]}0 of 5 steps done`);
  for (const [k, title] of [[1, 'The project'], [2, 'The Board Emulator'], [3, 'The test bench']]) {
    const out = await checkStepOf(page, k, 5);
    assert.ok(out.includes(`Lab "The emulator", step ${k} of 5: ${title}`) && /Step done\./.test(out) && !/WARNING/.test(out), out);
  }
  // the reset on SW6 (wrong), then on SW7
  const ucf = await readWs(env, 'stopwatch', 'constraints/top.ucf');
  await writeWs(env, 'stopwatch', 'constraints/top.ucf', ucf.replace('NET "sw<0>"  LOC = "P11"', 'NET "sw<0>"  LOC = "E2"'));
  assert.match(await checkStepOf(page, 4, 5), /WARNING: sw<0> is on the pin E2, not N3\nHint: On the Basys2, SW7 is the pin N3/);
  await writeWs(env, 'stopwatch', 'constraints/top.ucf', ucf.replace('NET "sw<0>"  LOC = "P11"', 'NET "sw<0>"  LOC = "N3"'));
  assert.match(await checkStepOf(page, 4, 5), /Step done\./);
  assert.match(await checkStepOf(page, 5, 5), /Step done\.\nEvery step of the lab "The emulator" is done\./);
  assert.equal(await ticks(page), '✓ ✓ ✓ ✓ ✓<');

  // Copy Link…: the lab in front chosen; none, or another
  await page.menu('File', 'Share Project…');
  await page.waitDialog('Share Project');
  const linkOut = () => page.waitFor(() => document.querySelector('.dlg-overlay .link-out')?.value || null, [], { what: 'the link' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay select[data-field=lab] option')].map((o) => `${o.value}:${o.textContent}${o.selected ? ' <' : ''}`)),
    [':No lab', 'stopwatch-emulator:The emulator <', 'gates-first-steps:First steps', 'traffic-state-machine:A state machine', 'blinky-clock-board:The clock and the board']);
  assert.match(await linkOut(), /#design=[A-Za-z0-9_-]+(&ui=[A-Za-z0-9_-]+)?&lab=stopwatch-emulator$/);
  await page.eval(() => { const s = document.querySelector('.dlg-overlay select[data-field=lab]'); s.value = ''; s.dispatchEvent(new Event('change')); });
  assert.doesNotMatch(await linkOut(), /lab=/);
  await page.eval(() => { const s = document.querySelector('.dlg-overlay select[data-field=lab]'); s.value = 'stopwatch-emulator'; s.dispatchEvent(new Event('change')); });
  // in Portuguese: the dialog's labels, the labs' titles in theirs
  await page.eval(() => import('/js/i18n.js').then((m) => m.setLanguage('pt')));
  await page.waitFor(() => document.documentElement.lang === 'pt');
  const labRow = () => page.eval(() => { const s = document.querySelector('.dlg-overlay select[data-field=lab]'); return [s.previousElementSibling.textContent, ...[...s.options].slice(0, 2).map((o) => o.textContent)]; });
  await page.waitFor(() => document.querySelector('.dlg-overlay select[data-field=lab]').options[0].textContent === 'Nenhum laboratório', [], { what: 'the dialog in Portuguese' });
  assert.deepEqual(await labRow(), ['Laboratório:', 'Nenhum laboratório', 'The emulator']);
  await page.eval(() => import('/js/i18n.js').then((m) => m.setLanguage('en')));
  await page.waitFor(() => document.documentElement.lang === 'en');
  await page.dialogButton('Copy Link');
  await page.waitNoDialog();
  await page.waitConsole(/Share Project: the link of 'stopwatch', opening the lab 'stopwatch-emulator' copied, \d+ characters\./);

  // a link that opens the example with its lab (the student's project kept: the link's in a project of its own), the lab at its first step
  await page.goto(`${env.server.url}/?l=lab#open=example:stopwatch&lab=stopwatch-emulator`);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item'), [], { what: 'app boot' });
  await page.waitDialog();
  const as = await page.eval(() => [...document.querySelectorAll('.dlg-overlay .dlg-buttons .btn')].map((b) => b.textContent.trim()).find((t) => t.startsWith('Open as ')));
  await page.dialogButton(as);
  await page.waitFor((d) => window.Silinx.active?.id === 'lab:stopwatch-emulator' && document.querySelector(d)?.dataset.ready === '1', [D], { what: 'the link\'s lab', timeout: 60000 });
  assert.equal(await page.eval(() => window.Silinx.project.name), as.slice('Open as '.length));
  assert.equal(await ticks(page), '·< · · · ·');
  // a lab the project has not: said
  await page.goto(`${env.server.url}/?l=nolab#open=example:isqrt&lab=nope`);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item'), [], { what: 'app boot' });
  await page.waitConsole(/WARNING: Open from a link: the project has no lab 'nope' \(Project ▸ Guided Labs… lists its labs\)\./, { timeout: 60000 });
}, { timeout: 240000 });

uiTest('#3179 a teacher\'s lab: New Source ▸ Guided Lab (its template, in labs/ only), listed and run; checked as it is edited (each save, Check Syntax); in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'teach', template: 'gates' });
  await page.setViewport(1366, 768);
  await page.openProject('teach');
  const newLab = async (name, location = null) => {
    await page.menu('Project', 'New Source…');
    await page.waitDialog('New Source');
    await pickSourceType(page, 'Guided Lab');
    await page.dialogButton('Next >');
    await waitNewSourcePage(page, 'File Name and Location');
    assert.equal(await page.eval(() => document.querySelectorAll('.dlg-overlay .wiz-main input[type=text]')[1].value), 'labs', 'its folder');
    await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
    if (location !== null) await page.fill('.dlg-overlay .wiz-main input[type=text]', location, { index: 1 });
    await page.dialogButton('Next >');
  };
  // another folder: refused
  await newLab('w0', 'src');
  await page.waitFor(() => /A guided lab is in the labs folder: Location labs\./.test(document.querySelector('.dlg-overlay').innerText), [], { what: 'the folder refused' });
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // labs/week1.lab.json: the template, opened in the editor, with its Check Syntax
  await newLab('week1');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent !== 'File Name and Location', [], { what: 'the summary' });
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'file:labs/week1.lab.json' && window.Silinx.active.editor, [], { what: 'the lab file opened' });
  await page.waitConsole(/Created Guided Lab 'labs\/week1\.lab\.json'\./);
  const lab = JSON.parse(await readWs(env, 'teach', 'labs/week1.lab.json'));
  assert.deepEqual([lab.id, lab.steps.map((s) => s.id)], ['week1', ['read', 'syntax', 'simulate']]);
  const check = async () => {
    const before = await page.eval(() => window.__console().length);
    await page.click('.doc:not([hidden]) .editor-bar .btn', { text: 'Check Syntax' });
    await page.waitFor((n) => /Process "Check Syntax" (completed successfully|failed)/.test(window.__console().slice(n)), [before], { what: 'the lab file checked' });
    return page.eval((n) => window.__console().slice(n), before);
  };
  assert.match(await check(), /Started : "Check Syntax" of labs\/week1\.lab\.json\.\n[^]*The lab labs\/week1\.lab\.json can be run \(Project ▸ Guided Labs…\)\.\n[^]*Process "Check Syntax" completed successfully/);
  // edited: a wrong check saved: said at once; Guided Labs leaves it out
  const edit = async (text) => {
    const before = await page.eval(() => window.__console().length);
    await page.eval((t) => window.Silinx.active.editor.setValue(t), text);
    await page.eval(() => window.SilinxApp.saveAll());
    return before;
  };
  const wrong = { ...lab, steps: [...lab.steps.slice(0, 2), { ...lab.steps[2], checks: [{ check: 'pins' }] }] };
  let n = await edit(JSON.stringify(wrong, null, 2));
  await page.waitFor((c) => /has 1 problem\(s\)/.test(window.__console().slice(c)), [n], { what: 'the problem said' });
  assert.match(await page.eval((c) => window.__console().slice(c), n), /ERROR: labs\/week1\.lab\.json: step 3, check 1 \(pins\): "pins": a list of \{ "port", "loc" \}\nThe lab labs\/week1\.lab\.json has 1 problem\(s\): Project ▸ Guided Labs… leaves it out until they are fixed\./);
  assert.match(await check(), /Process "Check Syntax" failed \(1 error\(s\), 0 warning\(s\)\)/);
  await page.menu('Project', 'Guided Labs…');
  await page.waitDialog('Guided Labs');
  assert.ok(!(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .lab-pick')].map((b) => b.dataset.lab))).includes('week1'));
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  await page.eval(() => window.SilinxApp.openFile('labs/week1.lab.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:labs/week1.lab.json' && window.Silinx.active.editor, [], { what: 'the lab file again' });
  // fixed and titled: said once, listed first, run
  n = await edit(JSON.stringify({ ...lab, title: { en: 'Week 1', pt: 'Semana 1' } }, null, 2));
  await page.waitConsole(/The lab labs\/week1\.lab\.json can be run \(Project ▸ Guided Labs…\)\.\n?$/);
  await edit(JSON.stringify({ ...lab, title: { en: 'Week 1', pt: 'Semana 1' }, intro: { en: 'Go.', pt: 'Vamos.' } }, null, 2));
  await page.eval(() => new Promise((r) => setTimeout(r, 300)));
  assert.equal((await page.eval((c) => window.__console().slice(c), n)).split('can be run').length - 1, 1, 'said when it changed only');
  assert.equal((await openLab(page, 'week1'))[0], 'Week 1labs/week1.lab.json0 of 3 steps done');
  for (const k of [1, 2, 3]) assert.match(await checkStepOf(page, k, 3), /Step done\./);
  // in Portuguese: New Source's type
  await page.eval(() => import('/js/i18n.js').then((m) => m.setLanguage('pt')));
  try {
    await page.menu('Projeto', 'Nova Fonte…');
    await page.waitFor(() => /Nova Fonte/.test(document.querySelector('.dlg-overlay')?.innerText || ''), [], { what: 'New Source in Portuguese' });
    assert.ok((await page.eval(() => [...document.querySelectorAll('.dlg-overlay .src-types .st')].map((e) => e.lastChild.textContent.trim()))).includes('Laboratório Guiado'));
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
  } finally {
    await page.eval(() => import('/js/i18n.js').then((m) => m.setLanguage('en')));
  }
}, { timeout: 180000 });

uiTest('#3330 an open Lab document reads its lab file again when it is saved: the new text and check, the steps done kept; a file with problems leaves it as it was', E, async (page) => {
  const step2 = (text, contains) => ({ id: 'look', title: { en: 'Look', pt: 'Olhar' }, text: { en: text, pt: text }, checks: [{ check: 'file', path: 'src/gates.vhd', contains: [contains] }] });
  const lab = { silinxLab: 1, id: 'relab', title: { en: 'Relab', pt: 'Relab' }, steps: [{ id: 'read', title: { en: 'Read', pt: 'Ler' }, text: { en: 'Read it.', pt: 'Leia.' } }, step2('Find the old thing.', '/no such text here/')] };
  await makeProject(env, { name: 'relab', template: 'gates', files: { 'labs/relab.lab.json': JSON.stringify(lab, null, 2) } });
  await page.openProject('relab');
  await openLab(page, 'relab');
  assert.match(await checkStepOf(page, 1, 2), /Step done\./);
  assert.match(await checkStepOf(page, 2, 2), /Not done yet/);
  const shown = () => page.eval((d) => [document.querySelector(`${d} .lab-text`).textContent, [...document.querySelectorAll(`${d} .lab-step`)].map((s) => (s.classList.contains('done') ? '✓' : '·') + (s.classList.contains('current') ? '<' : '')).join(' ')], D);
  assert.deepEqual(await shown(), ['Find the old thing.', '✓ ·<']);
  // the file edited and saved: the document reads it again (said in the console)
  const save = async (text) => {
    await page.eval(() => window.SilinxApp.openFile('labs/relab.lab.json'));
    await page.waitFor(() => window.Silinx.active?.id === 'file:labs/relab.lab.json' && window.Silinx.active.editor, [], { what: 'the lab file opened' });
    const before = await page.eval(() => window.__console().length);
    await page.eval((t) => window.Silinx.active.editor.setValue(t), text);
    await page.eval(() => window.SilinxApp.saveAll());
    return before;
  };
  let n = await save(JSON.stringify({ ...lab, steps: [lab.steps[0], step2('Find the entity.', '/entity gates/')] }, null, 2));
  await page.waitConsole(/Lab "Relab" read again from labs\/relab\.lab\.json: its steps as saved, the steps done kept\./);
  assert.equal(await page.eval((c) => window.__console().slice(c).trim(), n), 'Lab "Relab" read again from labs/relab.lab.json: its steps as saved, the steps done kept.');
  await openLab(page, 'relab');
  assert.deepEqual(await shown(), ['Find the entity.', '✓ ·<']);
  assert.match(await checkStepOf(page, 2, 2), /Step done\./);
  assert.deepEqual((await shown())[1], '✓ ✓<');
  // a file with problems: said, the document as it was
  n = await save(JSON.stringify({ ...lab, steps: [lab.steps[0], { ...step2('Broken.', '/x/'), checks: [{ check: 'pins' }] }] }, null, 2));
  await page.waitFor((c) => /has 1 problem\(s\)/.test(window.__console().slice(c)), [n], { what: 'the problem said' });
  assert.doesNotMatch(await page.eval((c) => window.__console().slice(c), n), /read again/);
  // (Guided Labs leaves it out now: its tab)
  await page.eval(() => window.Silinx.docs.find((d) => d.id === 'lab:relab').tab.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })));
  await page.waitFor(() => window.Silinx.active?.id === 'lab:relab', [], { what: 'the lab document' });
  assert.deepEqual(await shown(), ['Find the entity.', '✓ ✓<']);
}, { timeout: 120000 });
