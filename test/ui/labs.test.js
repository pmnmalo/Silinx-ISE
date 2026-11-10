// UI: the guided labs (#3179, web/js/lab-view.js): Project ▸ Guided Labs… lists the gates example's "First steps",
// which opens as a document; each shipped lab run step by step: Check Step ticks a step whose action is done (the
// Steps panel's tick, the next step shown, the console's lines), not one whose action is wrong (its hint shown then);
// the progress kept in the project (the lab reopened where it was left, its list saying so), restarted from its ⋮
// menu; its Steps panel folded to a strip (remembered), over the page behind ☰ Steps on a narrow window; in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs, writeWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const D = '.doc:not([hidden]) .lab';
const LAB = 'gates-first-steps';
// gates.vhd with an output even: the step "Add an output"'s action (right: even = not d; wrong: even = d)
const withEven = (vhd, expr) => vhd.replace('led : out std_logic_vector(1 downto 0)', 'led : out std_logic_vector(1 downto 0);\n    even : out std_logic')
  .replace('begin\n  d <=', `begin\n  even <= ${expr};\n  d <=`);

uiTest('#3179 a guided lab: the gates example\'s first steps run step by step (the right action ticks a step, a wrong one does not, its hint then), resumed, restarted; its Steps panel folded and on a narrow window; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'gates', template: 'gates' });
  await page.setViewport(1366, 768);
  await page.eval(async () => {
    const [{ prefKey }, { STEPS_KEY }] = await Promise.all([import('/js/prefs.js'), import('/js/lab-view.js')]);
    localStorage.removeItem(prefKey('silinx.lab.steps.folded')); localStorage.removeItem(STEPS_KEY);
  });
  await page.openProject('gates');
  const open = async () => {
    await page.menu('Project', 'Guided Labs…');
    await page.waitDialog('Guided Labs');
    const rows = await page.eval(() => [...document.querySelectorAll('.dlg-overlay .lab-pick')].map((b) => b.textContent));
    await page.click(`.dlg-overlay .lab-pick[data-lab="${LAB}"]`);
    await page.waitNoDialog();
    await page.waitFor((d, id) => window.Silinx.active?.id === `lab:${id}` && document.querySelector(d)?.dataset.ready === '1', [D, LAB], { what: 'the lab' });
    return rows;
  };
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
  const checkStep = async (k) => {
    const before = await page.eval(() => window.__console().length);
    await page.click(`${D} .lab-bar .asm-btn`, { text: 'Check Step' });
    await page.waitFor((n, k0) => window.__console().length > n && new RegExp(`step ${k0} of 5[^]*(Step done\\.|Not done yet)`).test(window.__console().slice(n)), [before, k], { what: `step ${k} checked` });
    return page.eval((n) => window.__console().slice(n), before);
  };

  // the list: the example's lab, none done; opened at its first step, its intro first
  assert.deepEqual(await open(), ['First stepsSilinx\'s, for the gates example0 of 5 steps done']);
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
  assert.deepEqual(await open(), ['First stepsSilinx\'s, for the gates example5 of 5 steps done']);
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
