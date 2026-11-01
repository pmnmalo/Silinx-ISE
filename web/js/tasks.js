// The Tasks interface (#782, #804), which became the Silinx one (#1149): the Silinx interface's layout, organised
// around the five tasks of a lab session: Edit, Simulate, Emulate, Implement, Program. It has the Silinx
// look (<html data-ui="silinx">) and a layout of its own (data-layout="tasks", web/css/tasks.css):
// - a task switcher in the header (a tab bar at the bottom of a narrow screen, NARROW_QUERY), each task
//   with a state dot from its processes' status; its labels give way when the header is short of room
//   (fitHeader: the other tasks' first, then all; #839);
// - each task with its own arrangement, kept per viewer (localStorage TASKS_KEY): the side panel open or
//   folded into the activity bar (on a narrow screen too: docked, not a drawer, #1463), the messages open or folded to
//   their tabs, a document maximized or not, and its documents (the tabs of the other tasks are hidden),
//   the last one in front; a document brought to the front makes its task the current one;
// - the messages: the bottom panel's message centre (web/js/messages.js, #798; every interface's: #925), its filter
//   following the task;
// - Simulate (web/js/tasks-sim.js, #800): the waves get the screen, its side panel SSim's Instances and Objects;
//   it runs the test bench with the model chosen in the task's bar, as soon as either is chosen (no Simulate button, #1018);
// - Emulate (web/js/tasks-emu.js, #801): the board at its proper size or larger (#1021), its side panel the emulator's Watch;
// - Implement (web/js/tasks-impl.js, #802): its side panel the top's Processes, its page the Design Summary as cards;
// - Implement programs the board too (#1172: no Program task): iMPACT, arranged by web/js/tasks-prog.js (#803), opens
//   there, its Processes' Configure Target Device and the Design Summary's Program the board… open it;
// - a task whose document is single by nature (Simulate: SSim; Emulate: the board; Program: iMPACT, one each,
//   web/js/viewers.js) shows no tab bar: what the tab said (the module, the model) and its close are in the task's
//   bar (#854);
// - the task's bar (the toolbar's right end): the fold and maximize buttons and the task's main action
//   (the Silinx toolbar's design-flow buttons, [data-step]), also offered when the task has no document.
// A document is maximized by double-clicking its tab, Ctrl/Cmd+Shift+Enter or the bar's button.
// The task of a document, the arrangements and the kept state (taskOfDoc, arrangement, readState,
// taskDot) have no DOM and are unit tested (test/tasks.test.js).

import { h } from './ui.js';
import { icons } from './icons.js';
import { layoutToggled } from './layout-fit.js';
import { messagesTask, initMessages } from './messages.js';
import { mountSimPanel } from './tasks-sim-panel.js';
import { fitSimTabs, placeSimSide, placeSimToolbar, refreshBench, simChoices, simTarget, simulate } from './tasks-sim.js';
import { fitBoard, initEmulate } from './tasks-emu.js';
import { implementationEnded, showTopProcesses } from './tasks-impl.js';
import { arrangeProgram, initProgram } from './tasks-prog.js';
import { initCheckMessages } from './tasks-check.js';
import { initTreeMenus } from './tasks-menus.js';
import { prefKey } from './prefs.js';
import { isNarrow } from './narrow.js';

export const TASKS = ['edit', 'sim', 'emu', 'impl'];
// (the first task is Design, its id 'edit' kept: the kept state, the documents; 'Design' in Portuguese too, #1046)
export const TASK_LABEL = { edit: 'Design', sim: 'Simulate', emu: 'Emulate', impl: 'Implement' };
export const TASKS_KEY = prefKey('silinx.tasks');
// the design-flow button of the Silinx toolbar (web/js/menus.js, data-step) each task runs
const STEP = { edit: 'check', sim: 'simulate', emu: 'emulate', impl: 'implement' };
const ACTION = { edit: 'Check', sim: 'Simulate', emu: 'Emulate', impl: 'Implement' };
const NO_BENCH = 'The project has no test bench yet: create one with the wizard, or choose a module to simulate with stimuli drawn in SSim.';
const HINT = {
  edit: 'Open a source from the Design panel.',   // (no Check here: Check Design is under the tree, #1349)
  sim: 'Simulate the design: its waves open here.',
  emu: 'Emulate the design on the board: the board opens here.',
  impl: 'Implement the design: synthesis, place & route and the programming file.',
};
const L = body => `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON = {
  edit: L('<path d="M4 20l1.2-4.8L15.5 4.9a2.1 2.1 0 0 1 3 3L8.2 18.2z"/><path d="M14 6.5l3.5 3.5"/>'),
  sim: icons.mWave, emu: icons.mBoard, impl: icons.mBolt,
  max: L('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
  side: icons.mPanel,
  msgs: L('<path d="M4 4h16v12H9l-5 4z"/>'),
  close: L('<path d="M6 6l12 12M18 6L6 18"/>'),
};
/** The Design task's icon, a pen (its page's, the split view's empty side, #1720): an SVG's markup. */
export const DESIGN_ICON = ICON.edit;

// the side panel and the messages of a task the first time (the task in front gets the space)
const DEFAULTS = {
  edit: { side: true, console: true },
  sim: { side: true, console: true },   // (its side panel shown, the Simulation tree with a simulation open too: #1408; the messages, #1429)
  emu: { side: true, console: true },   // (its side panel, its Processes, #1399; the messages, as every task's, #1429)
  impl: { side: true, console: true },
};

/** The task of a document: the one it was opened in (doc.task: an HDL file from the Simulation tree, #1332), else its
 *  id's. */
const taskOf = d => d.task || taskOfDoc(d.id);

/** The task a document belongs to, by its id (web/js/app.js openDoc and its callers). */
export function taskOfDoc(id) {
  const s = String(id || '');
  if (/^isim(:|$)/.test(s)) return 'sim';   // (one per module and model, #1161)
  if (s === 'emulator') return 'emu';
  // (a build file: a report, #802; the RTL Schematic, Synthesize's view, as the Technology one, #1063; iMPACT, #1172)
  if (/^(summary|pins|fpgaview|impact)$/.test(s) || /^(text|tech|rtl):/.test(s) || s.startsWith('file:build/')) return 'impl';
  // (the constraints file: Edit Constraints (Text), as I/O Pin Planning, #1265)
  if (/^file:.+\.ucf$/i.test(s)) return 'impl';
  return 'edit';
}

/** The kept state (TASKS_KEY's JSON) checked: { task, tasks: { <task>: { side?, console?, max?, doc? } } }. */
export const STATE_V = 2;   // (the kept state's version, #1415)
export function readState(raw) {
  let v = null;
  try { v = JSON.parse(raw); } catch { /* none kept, or not ours */ }
  // (the Program task of before, #1172: Implement)
  const task = v?.task === 'prog' ? 'impl' : v?.task;
  const out = { task: TASKS.includes(task) ? task : 'edit', tasks: {} };
  // (kept before the side panels of Simulate and Emulate changed (#1376, #1399, #1408): their side's state dropped, once,
  // the panels open, #1415; kept since, the version STATE_V)
  const before = !(v?.v >= STATE_V);
  for (const t of TASKS) {
    const k = v?.tasks?.[t] || {}, a = {};
    for (const f of ['side', 'narrowSide', 'console', 'max']) if (typeof k[f] === 'boolean' && !(before && f === 'side' && (t === 'sim' || t === 'emu'))) a[f] = k[f];
    if (typeof k.doc === 'string') a.doc = k.doc;
    out.tasks[t] = a;
  }
  return out;
}

// the tasks whose side panel is their document's own: SSim's Instances and Objects (#800); Emulate's, its Processes, as
// Implement's (#1399)
export const OWN_SIDE = ['sim'];
// the tasks whose side panel is folded on a narrow screen at first, their document needing the room (Emulate's board), the
// viewer's choice there kept apart (narrowSide)
export const FOLDED_NARROW = ['emu'];
/** A task's arrangement: what the viewer left, else its defaults; on a narrow screen too the side panel docked beside
 *  the document, not a drawer (#1463), FOLDED_NARROW's folded at first. */
export function arrangement(task, kept = {}, narrow = false) {
  const a = { ...DEFAULTS[task], max: false, ...kept };
  if (narrow && FOLDED_NARROW.includes(task)) a.side = kept.narrowSide ?? false;
  return a;
}
/** The kept state once a project is opened (#1557): every task's side panel and messages open, no document maximized,
 *  whatever the viewer left; Emulate's side panel on a narrow screen back to its default (folded, the board its room,
 *  #1463); the task in front and each task's document kept. */
export function openedState(st) {
  const tasks = {};
  for (const t of TASKS) {
    const { narrowSide, ...k } = st.tasks[t] || {};
    tasks[t] = { ...k, side: true, console: true, max: false };
  }
  return { ...st, tasks };
}
/** The kept state once the project is closed (#2169): Design's side panel shown (the Start page in it), no document
 *  maximized, whatever the viewer left; the other tasks as they were. */
export function closedState(st) {
  return { ...st, tasks: { ...st.tasks, edit: { ...(st.tasks.edit || {}), side: true, max: false } } };
}

// the tasks whose document is single by nature: a new emulation replaces the old one
export const SINGLE = [];   // (none: Simulate its tabs, several simulations open, #1161; Emulate its tab, its title not in the header, #1426)
/** What a document's title says of it: "SSim (top, Post-Synthesis)" → { module: 'top', model: 'Post-Synthesis' }
 *  (a behavioural model: null); a title with no module (iMPACT): { module: null, model: null }. */
export function docDetail(title) {
  const m = /\(([^,()]+)(?:, ([^()]+))?\)$/.exec(String(title || ''));
  return { module: m ? m[1].trim() : null, model: m?.[2]?.trim() || null };
}

const RANK = { err: 4, running: 3, stale: 2, warn: 1, ok: 0 };
/** A task's state dot from the processes' status (S.status): 'err' | 'running' | 'stale' | 'warn' | 'ok' | null. */
export function taskDot(task, status = {}) {
  const ids = { edit: ['check'], sim: ['sim-check'], impl: ['synth', 'synth-open', 'translate', 'map', 'par', 'bitgen'] }[task] || [];
  let worst = null;
  for (const id of ids) { const s = status[id]; if (s in RANK && (worst === null || RANK[s] > RANK[worst])) worst = s; }
  return worst;
}
// a dot's meaning: the task button's tooltip (#991)
export const DOT_TEXT = { ok: 'done, no warnings', warn: 'done with warnings', err: 'errors', stale: 'out of date (a source changed)', running: 'running…' };
/** The tooltip of task `t`'s button with its dot `dot` (taskDot; null: no dot, its name only). */
export const taskTitle = (t, dot) => dot ? `${TASK_LABEL[t]} — ${DOT_TEXT[dot]}` : TASK_LABEL[t];

// ------------------------------------------------------------------ the page
const root = () => document.documentElement;
const on = () => root().dataset.layout === 'tasks';
let app = null, state = readState(null), lastActive = null, shownTask = null, fitSoon = () => {}, simPanel = null;
let docsShown = { t: null, n: 0 };   // (the current task's documents when tagDocs last ran)

function keep() { try { localStorage.setItem(TASKS_KEY, JSON.stringify({ ...state, v: STATE_V })); } catch { /* storage unavailable */ } }
function load() { try { state = readState(localStorage.getItem(TASKS_KEY)); } catch { state = readState(null); } }
const current = () => state.task;
const arr = (t = current()) => arrangement(t, state.tasks[t], isNarrow());
// the field the side button sets: the narrow screen's own for a task folded there at first
const sideKey = () => (isNarrow() && FOLDED_NARROW.includes(current()) ? 'narrowSide' : 'side');
/** Changes the current task's arrangement (`patch`: side, console, max), kept. */
function arrange(patch) { Object.assign(state.tasks[current()], patch); keep(); apply(); }
// by the user: the side panel, the messages or the document maximized toggled (a drawing in front: Full View, #1203)
function toggle(patch) { arrange(patch); layoutToggled(); }

/** The task in front (`t`), its arrangement and its document; `fromDoc`: its document is already in front. */
export function setTask(t, { fromDoc = false } = {}) {
  if (!TASKS.includes(t) || (t !== 'edit' && app && !app.S.project)) return;   // (no project: Design only, #1260)
  state.task = t;
  keep();
  if (!fromDoc && app) {
    const S = app.S, docs = S.docs.filter(d => taskOf(d) === t);
    const want = docs.find(d => d.id === state.tasks[t].doc) || docs.at(-1);
    if (want && want !== S.active) app.openDoc({ id: want.id });
    // the task's own page, cheap to open: the Design Summary, iMPACT
    else if (!want && S.project?.top && t === 'impl') app.openSummary();   // (none with no top module: #1287)
  }
  apply();
}

/** Puts the current task and its arrangement on the page. */
function apply() {
  const r = root();
  if (!on()) { if (document.getElementById('task-bar')) { unbuild(); placeSimToolbar(false); fitBoard(false); arrangeProgram(false); dispatchEvent(new Event('resize')); } return; }
  build();
  // (the side panel's width, as the viewer left it, for Simulate's own panel too, #1409)
  const lw = document.getElementById('left')?.style.width;
  if (lw) r.style.setProperty('--left-w', lw);
  const t = current(), a = arr(t);
  const changed = t !== shownTask;
  if (changed) { shownTask = t; messagesTask(t); }
  if (t === 'sim') refreshBench(app);
  r.dataset.task = t;
  // (Implement's Processes the top's; another task's the selection's again: drawn once the task is set, #1208)
  if (changed && app) { if (t === 'impl') showTopProcesses(app); else app.renderProcesses(); }
  r.dataset.side = a.side ? 'open' : 'folded';
  r.dataset.console = a.console ? 'open' : 'folded';
  r.dataset.max = a.max ? 'on' : 'off';
  for (const b of document.querySelectorAll('.task-btn')) b.setAttribute('aria-current', String(b.dataset.task === t));
  fitHeader();
  const bar = document.getElementById('task-bar'), view = document.getElementById('task-view');
  if (bar) {
    // (maximized: the side panel and the messages hidden, their buttons not pressed, #1484)
    view.querySelector('[data-act=side]').setAttribute('aria-pressed', String(a.side && !a.max));
    view.querySelector('[data-act=console]').setAttribute('aria-pressed', String(a.console && !a.max));
    view.querySelector('[data-act=max]').setAttribute('aria-pressed', String(a.max));
  }
  tagDocs();
  // (the editors, the waves and the board measure their space again)
  dispatchEvent(new Event('resize'));
  fitSoon();
  fitSimTabs();
  arrangeProgram(true);
}

// each document and its tab say their task (the CSS shows the current task's only)
function tagDocs() {
  const S = app?.S;
  if (!S) return;
  placeSimToolbar(on(), S);   // (SSim's toolbar in its wave window's line: #1026; its model, #1353)
  let mine = 0, only = null;
  for (const d of S.docs) {
    const t = taskOf(d);
    if (d.el.dataset.task !== t) d.el.dataset.task = t;
    if (d.tab.dataset.task !== t) d.tab.dataset.task = t;
    if (t === current()) { mine++; only = d; }
  }
  // (the task's last document closed while maximized: maximize left, the side panel and the messages shown again, kept,
  // #1564)
  const was = docsShown;
  docsShown = { t: current(), n: mine };
  if (on() && !mine && was.t === current() && was.n > 0 && state.tasks[current()].max) { arrange({ max: false }); return; }
  placeSimSide(S, on() && current() === 'sim');   // (a source in front: the simulation's side panel beside it, #1343)
  // a task whose document is single by nature: no tab bar (none open: its page); the document's module and model,
  // and its close, in the task's bar (#854)
  const single = on() && SINGLE.includes(current()) && mine <= 1;
  const r = root();
  if (single) r.dataset.single = 'on'; else delete r.dataset.single;
  // (no document of the task open: no tab bar either, its page alone, #1289)
  if (on() && !mine) r.dataset.nodocs = 'on'; else delete r.dataset.nodocs;
  const info = document.getElementById('task-doc');
  if (info) {
    const doc = single && mine === 1 ? only : null;
    info.hidden = !doc;
    const { module, model } = docDetail(doc?.title);
    info.querySelector('.task-doc-mod').textContent = doc ? module || doc.title : '';
    info.querySelector('.task-doc-model').textContent = !doc || !module ? '' : model || (current() === 'sim' ? 'Behavioral' : 'Behavioral (RTL)');
    info._doc = doc;
  }
  const empty = document.getElementById('task-empty');
  if (empty) {
    empty.hidden = !on() || mine > 0;
    empty.querySelector('h2').textContent = TASK_LABEL[current()];
    empty.querySelector('h2').dataset.i18nKeep = 'Design';   // (not "Projeto": the Project menu's, #1046)
    // (Simulate with no test bench yet: one to create, or a module simulated with stimuli drawn in SSim: #917, #1291)
    const noBench = current() === 'sim' && !!app.S.project && !simChoices(app.S.project, app.S.modules).benches.length;
    empty.querySelector('p').textContent = noBench ? NO_BENCH : HINT[current()];
    // (Simulate's side panel: the wizard's row whenever there is a design module to test, a bench or not, #1312, #1376)
    // (whenever no simulation is open: a test bench's HDL left open in Simulate beside it, #1396)
    simPanel?.refresh(on() && current() === 'sim' && !!app.S.project && !app.S.docs.some(d => /^isim:/.test(d.id)));
    empty.querySelector('.ico').innerHTML = ICON[current()];
    const go = empty.querySelector('button');
    go.textContent = ACTION[current()];
    go.disabled = !mainEnabled();
    go.hidden = true;   // (no task's page has a button: their side panels' processes, #1349, #1376, #1367, #1420)
  }
  fitSimTabs();   // (the tabs shown or not: #1259)
}

const stepButton = (t = current()) => document.querySelector(`#toolbar .m-step[data-step="${STEP[t]}"]`);
// (Simulate runs the test bench, whatever is selected: #800)
const mainEnabled = () => (current() === 'sim' ? !!app?.S.project && !!simTarget(app.S.project, app.S.modules) : !!stepButton()?._enabled?.());
/** The current task's main action: the design-flow button of the Silinx toolbar; Edit's Check checks the selected
 *  module, a test bench with the simulation's sources (one tree, no views: #799). */
async function runMain() {
  if (!mainEnabled()) return;
  if (current() === 'sim') { simulate(app); return; }
  const b = stepButton(), S = app.S, mod = S.sel?.module;
  if (current() === 'edit' && mod && S.modules.find(m => m.name === mod)?.role === 'sim') {
    const { checkSyntax } = await import('./processes.js');   // (not at load: processes.js loads the app)
    checkSyntax(mod, true);
    return;
  }
  b.click();
}

// a document brought to the front: its task comes to the front; the task remembers it
function followActive() {
  const d = app?.S.active;
  if (!on()) return;
  if (!d || d === lastActive) { tagDocs(); return; }
  // (the document in front was closed and another came forward in its place: the task stays, its page shown, #854)
  const closed = lastActive && !app.S.docs.includes(lastActive);
  lastActive = d;
  if (closed && taskOf(d) !== current()) { tagDocs(); return; }
  // (a document opened behind, with the project (its Design Summary): the task stays the viewer's, until it is brought to the front)
  if (d.background && !d._taskSeen) { d._taskSeen = true; tagDocs(); return; }
  d._taskSeen = true;
  const t = taskOf(d);
  state.tasks[t].doc = d.id;
  keep();
  if (t !== current()) setTask(t, { fromDoc: true }); else tagDocs();
}

let implDot = null;
function refreshDots() {
  const st = app?.S.status || {};
  // an implementation ended while Implement is in front: its Design Summary comes forward (#802)
  const now = taskDot('impl', st);
  if (implementationEnded(implDot, now) && on() && current() === 'impl' && app.S.project) app.openSummary();
  implDot = now;
  if (on()) arrangeProgram(true);   // (Program's iMPACT, also once its document has its task: #803)
  // no top module: no Design Summary, whether opened behind with the project or restored with its documents (#1295)
  const summary = on() && app?.S.project && !app.S.project.top && app.findDoc('summary');
  if (summary) app.closeDoc(summary);
  // no project: Design (its Start page) only, the other tasks off; a project closed brings Design back (#1260)
  const none = !!app && !app.S.project;
  if (none && on() && current() !== 'edit') { setTask('edit'); app.showLeftPage('start'); }   // (its Start page, #1272)
  for (const b of document.querySelectorAll('.task-btn')) {
    const off = none && b.dataset.task !== 'edit';
    if (b.disabled !== off) b.disabled = off;
    const dot = taskDot(b.dataset.task, st);
    const el = b.querySelector('.task-dot');
    if (el.dataset.state !== (dot || '')) el.dataset.state = dot || '';
    const title = taskTitle(b.dataset.task, dot);
    if (b.dataset.title !== title) { b.dataset.title = title; b.title = title; }   // (once per change: translated in Portuguese)
  }
}

function taskButton(t) {
  return h('button', { class: 'task-btn', type: 'button', 'data-task': t, title: TASK_LABEL[t], 'data-i18n-keep': 'Design', onclick: () => setTask(t) },
    h('span', { class: 'ico-inline', html: ICON[t] }), h('span', { class: 'lbl' }, TASK_LABEL[t]), h('span', { class: 'task-dot' }));
}

// the task switchers, the task's bar and the page of a task with no document: there in the Tasks interface
// only (the other interfaces' pages, their tests and their translations do not have them)
const PARTS = ['task-switch', 'task-tabs', 'task-bar', 'task-empty', 'task-sim-panel', 'task-impl-bar', 'task-procs-tab', 'task-emu-tab', 'task-emu-panel', 'task-view', 'task-src-bar', 'task-files-bar', 'task-close-bar'];   // (their ids)
const PAGE_NAME = { start: 'Start', design: 'Design', test: 'Test', files: 'Files', libraries: 'Libraries', procs: 'Implementation', emu: 'Emulate' };
function build() {
  const $ = id => document.getElementById(id);
  if ($('task-bar')) return;
  $('menubar').after(h('nav', { id: 'task-switch', class: 'task-switch', 'aria-label': 'Tasks' }, ...TASKS.map(taskButton)));
  // the toolbar in the header, where the menu bar was (none in this interface: web/css/tasks.css, #1321)
  $('menubar').after($('toolbar'));
  $('statusbar').before(h('nav', { id: 'task-tabs', class: 'task-switch', 'aria-label': 'Tasks' }, ...TASKS.map(taskButton)));
  const tb = (act, title, ico) => h('button', { class: 'tb-btn', type: 'button', 'data-act': act, title, 'aria-label': title, html: ICON[ico] });
  // the side panel, the messages and the document maximized: at the header's right end, after Settings (#1218, #1314)
  $('settings-btn').after(h('div', { id: 'task-view', role: 'group', 'aria-label': 'Layout' },
    tb('side', 'Show or hide the side panel', 'side'),
    tb('console', 'Show or hide the messages', 'msgs'),
    tb('max', 'Maximize the document (double-click its tab)', 'max')));
  $('toolbar').append(h('div', { id: 'task-bar', role: 'group', 'aria-label': 'Task' },
    h('span', { id: 'task-doc', hidden: true },
      h('span', { class: 'task-doc-mod', 'data-no-i18n': true }), h('span', { class: 'task-doc-model' }),
      h('button', { class: 'tb-btn', type: 'button', 'data-act': 'close', title: 'Close', 'aria-label': 'Close', html: ICON.close }))));
  // (no action button in it: each task's page has it, #1292)
  const onAct = e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    // (maximized, the side panel's or the messages' button shows them: the document restored, #1484)
    if (act === 'side') toggle(arr().max ? { max: false, [sideKey()]: true } : { [sideKey()]: !arr().side });
    else if (act === 'console') toggle(arr().max ? { max: false, console: true } : { console: !arr().console });
    else if (act === 'max') toggle({ max: !arr().max });
    else if (act === 'close') { const d = document.getElementById('task-doc')._doc; if (d) app.closeDoc(d); }
  };
  $('task-bar').addEventListener('click', onAct);
  $('task-view').addEventListener('click', onAct);
  // (Simulate's page: its title and text, what to simulate in its side panel beside it, #1376)
  $('workspace').append(h('div', { id: 'task-empty', hidden: true },
    h('span', { class: 'ico' }), h('h2'), h('p'), h('button', { class: 'm-step', type: 'button', onclick: runMain })));
  simPanel = mountSimPanel(app, { simulate: () => simulate(app) });
  // Edit's pages: tabs above the hierarchy, the closed pages' name their tooltip (web/css/tasks.css, #984); the test
  // benches a page of their own, after Design (#1016)
  // Implement's side panel, its Processes, under a tab as Edit's pages (#1160: shown in Implement only, web/css/tasks.css)
  $('left-tabs').append(h('div', { id: 'task-procs-tab', class: 'tab', 'data-page': 'procs', role: 'tab', 'aria-selected': 'true' },
    h('span', { class: 'ico-inline tab-ico', html: icons.mBolt }), h('span', { class: 'tab-lbl' }, 'Implementation')));   // (#1207, #1257)
  // Emulate's: its Processes as Implement's, under its tab (#1399; web/js/processes.js draws every .task-emu-tree)
  $('left-tabs').append(h('div', { id: 'task-emu-tab', class: 'tab', 'data-page': 'emu', role: 'tab', 'aria-selected': 'true' },
    h('span', { class: 'ico-inline tab-ico', html: icons.mBoard }), h('span', { class: 'tab-lbl' }, 'Emulate')));
  // (I/O Pin Planning and Emulate on Board above them, as Implement's bar, #1424)
  $('proc-panel').after(h('div', { class: 'ise-panel', id: 'task-emu-panel' },
    h('div', { id: 'task-emu-bar' },
      h('button', { class: 'btn', type: 'button', 'data-act': 'pins', onclick: () => app.S.project?.top && app.openPinPlanner() }, 'I/O Pin Planning'),
      h('button', { class: 'btn', type: 'button', 'data-act': 'emulate', onclick: () => app.S.project?.top && import('./viewers.js').then(v => v.openEmulator(app.S.project.top)) }, 'Emulate on Board')),
    h('div', { class: 'body task-emu-tree' })));
  for (const t of $('left-tabs').querySelectorAll('.tab')) t.title = PAGE_NAME[t.dataset.page];
  // the Design page: New Source and Import Source above the tree (#1210, #1501; Design's only, web/css/tasks.css)
  const wizard = f => () => import('./wizards.js').then(w => w[f]());
  $('hier').before(h('div', { id: 'task-src-bar' },
    h('button', { class: 'btn', type: 'button', onclick: wizard('newSourceWizard') }, 'New Source…'),
    h('button', { class: 'btn', type: 'button', onclick: wizard('addSourceDialog') }, 'Import Source…')));
  // and Check Design and Close Project at its end, under the tree (#1309; Check Design: the top module's Check Syntax,
  // its whole hierarchy, whatever the tree selects)
  $('hier').after(h('div', { id: 'task-close-bar' },
    h('button', { class: 'btn', type: 'button', 'data-act': 'check-design', onclick: () => app.S.project?.top && import('./processes.js').then(p => p.checkSyntax(app.S.project.top)) }, 'Check Design'),
    h('button', { class: 'btn', type: 'button', onclick: () => app.S.project && app.closeProject() }, 'Close Project')));
  // Implement's Processes: I/O Pin Planning and Program FPGA above them (#1398; Program FPGA iMPACT's, opened beside)
  $('procs').before(h('div', { id: 'task-impl-bar' },
    h('button', { class: 'btn', type: 'button', 'data-act': 'pins', onclick: () => app.S.project?.top && app.openPinPlanner() }, 'I/O Pin Planning'),
    h('button', { class: 'btn', type: 'button', 'data-act': 'program', onclick: async () => {
      if (!app.S.project) return;
      // (an iMPACT opened before, without its Program FPGA to run from here: opened again, #1421)
      const old = app.findDoc('impact');
      if (old && !old.program) await app.closeDoc(old);
      await app.openImpact();
      app.findDoc('impact')?.program?.();
    } }, 'Program FPGA')));
  // the Files page: Add to Project (the folder's files not in the project) and Add Copy to Project (#1214)
  $('files-page').before(h('div', { id: 'task-files-bar' },
    h('button', { class: 'btn', type: 'button', onclick: () => import('./design.js').then(d => d.addFromFolderDialog()) }, 'Add to Project…'),
    h('button', { class: 'btn', type: 'button', onclick: wizard('addSourceDialog') }, 'Add Copy to Project…')));
  app.renderHierarchy();   // (one tree, no views: #799)
  app.renderProcesses();   // (and Emulate's Processes, #1399)
  refreshDots();
}
// The header's room (#839): every label of the switcher if they fit, else the current task's only, else none,
// else a shorter project name too (#topbar data-fit; the window's width, the language and a development
// build's Development menu decide it, not a fixed width).
export const FIT_STEPS = ['', 'current', 'icons', 'tight'];
function fitHeader() {
  const sw = document.getElementById('task-switch'), top = document.getElementById('topbar');
  if (!sw || !on()) return;
  for (const fit of FIT_STEPS) {
    if (top.dataset.fit !== fit) top.dataset.fit = fit;
    if (!sw.getClientRects().length || top.scrollWidth <= top.clientWidth) return;   // (hidden on a narrow screen: the tab bar)
  }
}

function unbuild() {
  for (const id of PARTS) document.getElementById(id)?.remove();
  simPanel = null;
  document.getElementById('topbar').after(document.getElementById('toolbar'));   // (under the header again, #1321)
  delete document.getElementById('topbar').dataset.fit;
  for (const t of document.querySelectorAll('#left-tabs .tab')) t.removeAttribute('title');
  messagesTask(null);   // (the other interfaces: every source, #925)
  shownTask = null;
  app.renderHierarchy();
  const r = root();
  for (const k of ['task', 'side', 'console', 'max', 'single', 'nodocs']) delete r.dataset[k];
}

// a reload: the task in front when the page was left, brought back once the last project is reopened at start-up, whatever
// task its reopened documents brought forward (a simulation, Simulate's) — Implement with no top has none of its own (#1337)
let startTask = null;
export function restoreStartTask() {
  const t = startTask;
  startTask = null;
  if (on() && t && t !== current()) setTask(t);
}

/** The Tasks interface's behaviour; its parts are built while it is the interface. `a` is the app (web/js/app.js). */
export function initTasks(a) {
  app = a;
  load();
  startTask = state.task;   // (the task in front when the page was left: back to it once the project reopens, #1337)
  initMessages(app);   // (the message centre: every interface's, #925)
  fitSoon = initEmulate(() => on() && current() === 'emu');
  initProgram(() => arrangeProgram(on()));
  initCheckMessages(on, () => { if (!arr().console) arrange({ console: true }); }, (...a) => app.log(...a));
  initTreeMenus(app, { on, task: () => current() });
  const $ = id => document.getElementById(id);
  // a folded side panel or messages open again when one of their tabs is clicked
  $('left-tabs').addEventListener('click', () => { if (on() && !arr().side) toggle({ [sideKey()]: true }); });
  $('console-tabs').addEventListener('click', () => { if (on() && !arr().console) toggle({ console: true }); });
  // new errors open the messages (Check Syntax shows the Errors tab)
  let errs = 0;
  new MutationObserver(() => {
    const n = parseInt($('err-count').textContent, 10) || 0;
    if (on() && n > errs && !arr().console) arrange({ console: true });
    errs = n;
  }).observe($('err-count'), { childList: true, characterData: true, subtree: true });
  // maximize: a document's tab double-clicked, or Ctrl/Cmd+Shift+Enter
  $('doc-tabs').addEventListener('dblclick', e => { if (on() && e.target.closest('.tab') && !e.target.closest('.tclose')) toggle({ max: !arr().max }); });
  addEventListener('keydown', e => {
    if (on() && (e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'Enter' && !document.querySelector('.dlg-overlay')) { e.preventDefault(); toggle({ max: !arr().max }); }
  });
  // a document brought to the front that was already in front, behind another task (Design, after the project opened):
  // its task forward (the tabs' observer sees no change then, #1191)
  addEventListener('silinx:doc-activated', e => {
    const { doc, background } = e.detail;
    if (!on() || background || doc !== lastActive || taskOf(doc) === current()) return;
    state.tasks[taskOf(doc)].doc = doc.id;
    keep();
    setTask(taskOf(doc), { fromDoc: true });
  });
  // a project opened: in Design, its Design page, whatever its documents brought to the front (#1171); every task's side
  // panel and messages shown, whatever was left folded or maximized (#1557)
  addEventListener('silinx:project-opened', () => {
    if (!on()) return;
    state = openedState(state);
    setTask('edit');
    app.showLeftPage('design');
  });
  // a project closed: in Design, its side panel shown with the Start page, whatever was left folded or maximized (#2169)
  addEventListener('silinx:project-closed', () => {
    if (!on()) return;
    state = closedState(state);
    setTask('edit');
  });
  // the documents: opened, closed, brought to the front
  new MutationObserver(followActive).observe($('doc-tabs'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  new MutationObserver(refreshDots).observe($('procs'), { childList: true, subtree: true });
  // the interface switched (View ▸ Interface), or a narrow screen turned wide
  new MutationObserver(apply).observe(root(), { attributes: true, attributeFilter: ['data-layout'] });
  globalThis.matchMedia?.('(max-width: 1023px)').addEventListener?.('change', apply);
  // the header's room: its width, and what is in it (the menus' labels in another language, the Development
  // menu, the project's name)
  new ResizeObserver(() => fitHeader()).observe($('topbar'));
  new MutationObserver(() => fitHeader()).observe($('topbar'), { childList: true, subtree: true, characterData: true });
  // the bars' buttons as the project is: at once when it opens, is drawn again or its design changes (its top set or
  // unset), and once a second (#1423)
  const barsNow = () => { for (const b of document.querySelectorAll('#task-src-bar button, #task-files-bar button, #task-close-bar button, #task-impl-bar button, #task-emu-bar button')) b.disabled = !app.S.project || (['check-design', 'pins', 'emulate'].includes(b.dataset.act) && !app.S.project.top); };
  for (const ev of ['silinx:project-opened', 'silinx:design-changed']) addEventListener(ev, () => { if (on()) barsNow(); });
  new MutationObserver(() => { if (on()) barsNow(); }).observe($('procs'), { childList: true });
  setInterval(() => { if (on()) { refreshDots(); if (current() === 'sim') { if (simPanel) simPanel.refresh(); else refreshBench(app); tagDocs(); } const g = document.querySelector('#task-empty button'); if (g) g.disabled = !mainEnabled();
    barsNow(); } }, 1000);
  apply();
}
