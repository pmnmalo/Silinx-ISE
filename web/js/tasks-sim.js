// The Tasks interface's Simulate task (#800, #782): the waves get the screen.
// - ISim's own Instances and Objects are the task's side panel, folded at first (the Design pane is not shown in
//   Simulate); ISim's title bar is the task's bar's (the module and the model, #854); its run controls stay its
//   toolbar, in the wave window's line (placeSimToolbar, #1026); no status line (#1017; web/css/tasks.css).
// - Simulate runs the project's test bench whatever module is selected (simTarget), with the model chosen in the
//   task's bar: Behavioral, or a netlist (Post-Synthesis … Post-Place & Route; web/js/viewers.js runSimulation). Choosing
//   the model or the test bench simulates at once, the bar has no Simulate button (#1018; the task's page still has one).
// - The task's bar chooses the test bench (or a design module, simulated with stimuli drawn in ISim), makes a new one
//   with the Test Bench Wizard, and opens the chosen one's source (#917): the design tree is Edit's.
// simTarget and simChoices have no DOM and are unit tested (test/tasks.test.js).

import { h } from './ui.js';

/** ISim's toolbar in its wave window's line, where its name ("Default.wcfg") and the cursor's text were (`tasks`: the
 *  Tasks interface, #1026; web/css/tasks.css hides them), else back under its title bar, as ISim made it. */
export function placeSimToolbar(tasks) {
  for (const root of document.querySelectorAll('#workspace .isim')) {
    const tb = root.querySelector('.isim-toolbar'), cap = root.querySelector('.isim-wavewin > .caption');
    if (!tb || !cap) continue;
    if (tasks && tb.parentElement !== cap) cap.prepend(tb);
    else if (!tasks && tb.parentElement === cap) root.querySelector('.isim-title').after(tb);
  }
}

export const SIM_MODELS = [['', 'Behavioral'], ['postsynth', 'Post-Synthesis'], ['posttrans', 'Post-Translate'], ['postmap', 'Post-Map'], ['postpar', 'Post-Place & Route']];

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
  const sel = h('select', { id: 'task-model', title: 'The model to simulate', 'aria-label': 'The model to simulate' },
    ...SIM_MODELS.map(([v, label]) => h('option', { value: v }, label)));
  sel.addEventListener('change', () => simulate(app));
  return sel;
}

/** Simulate: the test bench, with the model chosen; a choice made while another is being prepared replaces it (#1018). */
let simSeq = 0;
export async function simulate(app) {
  const mod = simTarget(app.S.project, app.S.modules);
  if (!mod) return;
  const model = document.getElementById('task-model')?.value || undefined;
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

export const NEW_BENCH = '+new';
/** The task's bar's choice of the test bench (shown in Simulate only; its options follow the project: refreshBench): a
 *  test bench or a module chosen is simulated at once (#1018). */
export function benchSelect(app) {
  const sel = h('select', { id: 'task-bench', title: 'The test bench to simulate', 'aria-label': 'The test bench to simulate' });
  sel.addEventListener('change', () => {
    const v = sel.value;
    sel.value = simTarget(app.S.project, app.S.modules) || '';   // (until the choice is made: a wizard may be cancelled)
    if (v === NEW_BENCH) newBench(app);
    else if (v) app.setTop(v, true).then(() => { refreshBench(app); return simulate(app); });
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
      ...(benches.length ? [h('option', { disabled: true }, 'Test Benches'), ...benches.map(n => h('option', { value: n }, n))] : []),
      h('option', { disabled: true }, 'Design modules'), ...design.map(n => h('option', { value: n }, n)),
      h('option', { value: NEW_BENCH }, 'New Test Bench (Wizard)…'));
    for (const o of sel.options) if (o.hasAttribute('value') && o.value !== NEW_BENCH) o.dataset.noI18n = '';   // (the modules' names)
  }
  sel.value = simTarget(app.S.project, app.S.modules) || '';
}
/** The Test Bench Wizard for the top module; the test bench it makes becomes the one Simulate runs. */
export async function newBench(app) {
  const before = new Set(simChoices(app.S.project, app.S.modules).benches);
  const { testBenchWizard } = await import('./tbwizard.js');   // (not at load: it loads the app)
  await testBenchWizard({ module: app.S.project.top });
  const made = simChoices(app.S.project, app.S.modules).benches.find(n => !before.has(n));
  if (made) await app.setTop(made, true);
  refreshBench(app);
}
/** The source of the module Simulate runs, in Edit. */
export function editBench(app) {
  const m = app.S.modules.find(x => x.name === simTarget(app.S.project, app.S.modules));
  if (m) app.openFile(m.file, m.line);
}
