// The Tasks interface's Simulate task (#800, #782): the waves get the screen.
// - SSim's own Instances and Objects are the task's side panel, shown at first (#1408; the Design pane is not shown in
//   Simulate), from the top of the work area as Design's and Implement's, the simulations' tabs to its right (fitSimTabs,
//   #1259); SSim's title bar is the task's bar's (the module and the model, #854); its run controls stay its
//   toolbar, in the wave window's line (placeSimToolbar, #1026); no status line (#1017; web/css/tasks.css).
// - Simulate runs the project's test bench whatever module is selected (simTarget), with the model chosen in the
//   task's bar: Behavioral, or a netlist (Post-Synthesis … Post-Place & Route; web/js/viewers.js runSimulation). Choosing
//   the model or the test bench simulates at once, the bar has no Simulate button (#1018); with no test bench, once both are chosen (#1378).
// - The task's bar chooses the test bench (or a design module, simulated with stimuli drawn in SSim), makes a new one
//   with the Test Bench Wizard (#917; its source from the Design panel, #1363).
// simTarget and simChoices have no DOM and are unit tested (test/tasks.test.js).

import { h } from './ui.js';
import { simModelsOf } from './tool-descriptors.js';

/** SSim's toolbar in its wave window's line, where its name ("Default.wcfg") and the cursor's text were (`tasks`: the
 *  Tasks interface, #1026; web/css/tasks.css hides them), its stimuli bar under it (#1270), else both back under its title
 *  bar, as SSim made them; its model's choices the project's tool's (`tool`, #3707). */
export function placeSimToolbar(tasks, S = null, tool = null) {
  if (!tasks) for (const f of document.querySelectorAll('#workspace .isim-toolbar .isim-model-field')) f.remove();   // (the Tasks interface's only)
  else if (S) for (const d of S.docs) if (/^isim:/.test(d.id)) placeModel(d, tasks, tool);
  for (const root of document.querySelectorAll('#workspace .isim')) {
    watchSide(root.querySelector('.isim-left'));
    const tb = root.querySelector('.isim-toolbar'), cap = root.querySelector('.isim-wavewin > .caption');
    if (!tb || !cap) continue;
    if (tasks && tb.parentElement !== cap) cap.prepend(tb);
    else if (!tasks && tb.parentElement === cap) root.querySelector('.isim-title').after(tb);
    // its stimuli bar (#336) under that line, in the wave window: the simulations' tabs are over the document's top (#1270)
    const bar = root.querySelector('.isim-stimbar');
    if (bar && tasks && bar.previousElementSibling !== cap) cap.after(bar);
    else if (bar && !tasks && bar.previousElementSibling !== tb) tb.after(bar);
  }
}

/** The simulation's model in its toolbar's right end, after Edit Stimuli (the Tasks interface, #1353): another one chosen
 *  simulates the same module with it (a netlist not generated yet offered to be generated first, #490). */
function placeModel(d, tasks, tool) {
  const tb = d.el.querySelector('.isim-toolbar');
  let sel = tb?.querySelector('.isim-model');
  if (!tb || !tasks) { sel?.closest('.isim-model-field')?.remove(); return; }
  const [mod, model = ''] = d.id.slice('isim:'.length).split('@');
  if (sel) { modelOptions(sel, tool, model); return; }
  sel = h('select', { class: 'isim-model', title: 'The model to simulate', 'aria-label': 'The model to simulate' });
  modelOptions(sel, tool, model);
  sel.addEventListener('change', async () => {
    const v = sel.value;
    sel.value = model;   // (this simulation's; the other one in its own tab)
    const { runSimulation } = await import('./viewers.js');   // (not at load: viewers.js loads the app)
    runSimulation(mod, v || undefined);
  });
  // (its label, #1391; before the toolbar's ⋮ menu, which stays at its right end, #2839)
  tb.insertBefore(h('label', { class: 'isim-model-field' }, h('span', {}, 'Model:'), sel), tb.querySelector(':scope > .tb-more'));
}

/** The simulations' tabs to the right of the side panel, which starts at the top of the work area as Design's and
 *  Implement's (#1259; web/css/tasks.css): #center's --sim-side, the side panel's width with its splitter (0: folded or
 *  not shown), and --sim-tabs, the tabs' height (0: a single simulation, no tabs), above the waves. */
export function fitSimTabs() {
  const center = document.getElementById('center'), tabs = document.getElementById('doc-tabs');
  if (!center) return;
  // (the side panel's right edge: its splitter's, or its own beside a source, #1343)
  const shown = sel => [...document.querySelectorAll(`#workspace > .doc ${sel}`)].find(e => e.getClientRects().length);
  const panel = document.getElementById('task-sim-panel');   // (Simulate's own, nothing simulated: #1376, #1396)
  const edge = shown('.isim-split-main') || shown('.isim-left') || (panel?.getClientRects().length ? panel : null);
  const side = edge ? Math.max(0, Math.round(edge.getBoundingClientRect().right - center.getBoundingClientRect().left)) : 0;
  center.style.setProperty('--sim-side', `${side}px`);
  center.style.setProperty('--sim-tabs', `${tabs?.offsetHeight || 0}px`);
}
/** A source in front in Simulate (a module's HDL opened from the Simulation tree, #1332): the last simulation's side
 *  panel (the Simulation tree, the Objects) stays shown at its left (`data-sim-side`, web/css/tasks.css, #1343). */
let simSide = null;
export function placeSimSide(S, sim) {
  const isim = d => /^isim(:|$)/.test(d?.id || ''), a = S.active;
  if (isim(a)) simSide = a;
  if (simSide && !S.docs.includes(simSide)) simSide = null;
  const side = sim && a && !isim(a) && a.el.dataset.task === 'sim' ? simSide || S.docs.filter(isim).at(-1) || null : null;
  for (const d of S.docs) if (d === side) { if (!('simSide' in d.el.dataset)) d.el.dataset.simSide = ''; } else if ('simSide' in d.el.dataset) delete d.el.dataset.simSide;
}
// (measured again when a side panel is shown, folded or resized by its splitter)
const watched = new WeakSet();
let sides = null;
function watchSide(el) {
  if (!el || watched.has(el) || typeof ResizeObserver !== 'function') return;
  sides ||= new ResizeObserver(() => fitSimTabs());
  sides.observe(el);
  watched.add(el);
}

export const SIM_MODELS = [['', 'Behavioral'], ['postsynth', 'Post-Synthesis'], ['posttrans', 'Post-Translate'], ['postmap', 'Post-Map'], ['postpar', 'Post-Place & Route']];
/** The models a project's tool simulates (#3707): Behavioral, and the netlists its flow generates (none but in the Spartan
 *  flows); every one with no tool. */
export const modelChoices = tool => SIM_MODELS.filter(([v]) => !v || !tool || simModelsOf(tool).includes(v));
// a model select's options, the tool's (`head`: its prompt's), made again when they changed; its value kept
function modelOptions(sel, tool, value, head = []) {
  const list = modelChoices(tool), key = list.map(([v]) => v).join();
  if (sel.dataset.key === key) return;
  sel.dataset.key = key;
  sel.replaceChildren(...head, ...list.map(([v, label]) => h('option', { value: v }, label)));
  sel.value = list.some(([v]) => v === value) ? value : head.length ? '?' : '';
}
const modelPrompt = () => h('option', { value: '?', disabled: true }, 'Select simulation model...');

/** The module Simulate runs: the project's simulation top, else its first test bench, else its top (null: none). */
export function simTarget(project, modules = []) {
  const has = n => !!n && modules.some(m => m.name === n);
  if (has(project?.simTop)) return project.simTop;
  const bench = modules.find(m => m.role === 'sim');
  if (bench) return bench.name;
  return has(project?.top) ? project.top : null;
}

/** The task's bar's choice of the model to simulate (shown in Simulate only): a choice simulates it at once (#1018;
 *  a netlist not generated yet offered to be generated first, #490). */
export function modelSelect(app) {
  const sel = h('select', { id: 'task-model', title: 'The model to simulate', 'aria-label': 'The model to simulate' });
  modelOptions(sel, app?.projectTool?.(), '?', [modelPrompt()]);
  sel.addEventListener('change', () => { if (ready()) simulate(app); });
  return sel;
}

// with no test bench, Simulate's side panel's choices start on their prompts, and the simulation runs once both are made
// (#1378); else a choice simulates at once (#1018)
let prompt = { on: false, module: false };
/** The choices on their prompts (`on`: the side panel shown, no test bench), from the moment it is shown. */
export function promptChoices(on) {
  if (on && !prompt.on) {
    prompt = { on: true, module: false };
    const m = document.getElementById('task-model');
    if (m) m.value = '?';
  }
  prompt.on = on;
}
const ready = () => !prompt.on || (prompt.module && document.getElementById('task-model')?.value !== '?');

/** Simulate: the test bench, with the model chosen; a choice made while another is being prepared replaces it (#1018). */
let simSeq = 0;
export async function simulate(app) {
  const mod = simTarget(app.S.project, app.S.modules);
  if (!mod) return;
  const v = document.getElementById('task-model')?.value;
  const model = v && v !== '?' ? v : undefined;   // (its prompt: Behavioral)
  const seq = ++simSeq;
  const { runSimulation } = await import('./viewers.js');   // (not at load: viewers.js loads the app)
  return runSimulation(mod, model, { stale: () => seq !== simSeq });
}

/** The modules Simulate can run: the test benches, then the design's modules (its top first). */
export function simChoices(project, modules = []) {
  const benches = modules.filter(m => m.role === 'sim').map(m => m.name).sort((a, b) => a.localeCompare(b));
  const design = modules.filter(m => m.role !== 'sim').map(m => m.name)
    .sort((a, b) => (a === project?.top ? -1 : b === project?.top ? 1 : a.localeCompare(b)));
  return { benches, design };
}

/** The task's bar's choice of the test bench (shown in Simulate only; its options follow the project: refreshBench): a
 *  test bench or a module chosen is simulated at once (#1018). */
export function benchSelect(app) {
  const sel = h('select', { id: 'task-bench', title: 'The test bench to simulate', 'aria-label': 'The test bench to simulate' });
  sel.addEventListener('change', () => {
    const v = sel.value;
    sel.value = simTarget(app.S.project, app.S.modules) || '';   // (until the choice is made)
    if (v) { prompt.module = true; app.setTop(v, true).then(() => { refreshBench(app); return ready() && simulate(app); }); }
  });
  return sel;
}
/** The test bench choice's options, and the one Simulate runs, as the project is now. */
export function refreshBench(app) {
  const sel = document.getElementById('task-bench');
  if (!sel || !app?.S.project) return;
  const { benches, design } = simChoices(app.S.project, app.S.modules);
  const key = JSON.stringify([benches, design]);
  if (sel.dataset.key !== key) {
    sel.dataset.key = key;
    sel.replaceChildren(
      ...(benches.length ? [] : [h('option', { value: '', disabled: true }, 'Select design module to simulate...')]),
      ...(benches.length ? [h('option', { disabled: true }, 'Test Benches'), ...benches.map(n => h('option', { value: n }, n))] : []),
      ...(benches.length ? [h('option', { disabled: true }, 'Design modules')] : []), ...design.map(n => h('option', { value: n }, n)));   // (no heading under the prompt, #1378)   // (a new test bench: the page's button, #1312)
    for (const o of sel.options) if (o.value && !o.disabled) o.dataset.noI18n = '';   // (the modules' names, not the prompt)
  }
  sel.value = prompt.on && !prompt.module ? '' : simTarget(app.S.project, app.S.modules) || '';
  // (the models the project's tool has, #3707)
  const m = document.getElementById('task-model');
  if (m) modelOptions(m, app.projectTool?.(), m.value, [modelPrompt()]);
}
/** The Test Bench Wizard for the top module; the test bench it makes becomes the one Simulate runs. */
export async function newBench(app) {
  const before = new Set(simChoices(app.S.project, app.S.modules).benches);
  const { testBenchWizard } = await import('./tbwizard.js');   // (not at load: it loads the app)
  await testBenchWizard({ module: app.S.project.top, task: 'sim' });   // (its file opened in Simulate, #1392)
  const made = simChoices(app.S.project, app.S.modules).benches.find(n => !before.has(n));
  if (made) await app.setTop(made, true);
  refreshBench(app);
}
