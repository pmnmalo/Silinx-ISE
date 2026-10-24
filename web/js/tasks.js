// The Tasks interface (#782, #804): a third interface beside the modern and the classic ones, organised
// around the five tasks of a lab session: Edit, Simulate, Emulate, Implement, Program. It has the modern
// look (<html data-ui="modern">) and a layout of its own (data-layout="tasks", web/css/tasks.css):
// - a task switcher in the header (a tab bar at the bottom of a narrow screen, NARROW_QUERY), each task
//   with a state dot from its processes' status; its labels give way when the header is short of room
//   (fitHeader: the other tasks' first, then all; #839);
// - each task with its own arrangement, kept per viewer (localStorage TASKS_KEY): the side panel open or
//   folded into the activity bar (on a narrow screen: the drawer, closed), the messages open or folded to
//   their tabs, a document maximized or not, and its documents (the tabs of the other tasks are hidden),
//   the last one in front; a document brought to the front makes its task the current one;
// - the messages: the bottom panel's message centre (web/js/messages.js, #798; every interface's: #925), its filter
//   following the task;
// - Simulate (web/js/tasks-sim.js, #800): the waves get the screen, its side panel ISim's Instances and Objects;
//   it runs the test bench with the model chosen in the task's bar, as soon as either is chosen (no Simulate button, #1018);
// - Emulate (web/js/tasks-emu.js, #801): the board at its proper size or larger (#1021), its side panel the emulator's Watch;
// - Implement (web/js/tasks-impl.js, #802): its side panel the top's Processes, its page the Design Summary as cards;
// - Implement programs the board too (#1172: no Program task): iMPACT, arranged by web/js/tasks-prog.js (#803), opens
//   there, its Processes' Configure Target Device and the Design Summary's Program the board… open it;
// - a task whose document is single by nature (Simulate: ISim; Emulate: the board; Program: iMPACT, one each,
//   web/js/viewers.js) shows no tab bar: what the tab said (the module, the model) and its close are in the task's
//   bar (#854);
// - the task's bar (the toolbar's right end): the fold and maximize buttons and the task's main action
//   (the modern toolbar's design-flow buttons, [data-step]), also offered when the task has no document.
// A document is maximized by double-clicking its tab, Ctrl/Cmd+Shift+Enter or the bar's button.
// The task of a document, the arrangements and the kept state (taskOfDoc, arrangement, readState,
// taskDot) have no DOM and are unit tested (test/tasks.test.js).

import { h } from './ui.js';
import { icons } from './icons.js';
import { isNarrow, setDrawer, drawerOpen } from './narrow.js';
import { messagesTask, initMessages } from './messages.js';
import { benchSelect, editBench, modelSelect, newBench, placeSimToolbar, refreshBench, simChoices, simTarget, simulate } from './tasks-sim.js';
import { fitBoard, initEmulate } from './tasks-emu.js';
import { implementationEnded, showTopProcesses } from './tasks-impl.js';
import { arrangeProgram, initProgram } from './tasks-prog.js';
import { initCheckMessages } from './tasks-check.js';
import { buildTestPage, unbuildTestPage } from './tasks-test.js';

export const TASKS = ['edit', 'sim', 'emu', 'impl'];
// (the first task is Design, its id 'edit' kept: the kept state, the documents; 'Design' in Portuguese too, #1046)
export const TASK_LABEL = { edit: 'Design', sim: 'Simulate', emu: 'Emulate', impl: 'Implement' };
export const TASKS_KEY = 'silinx.tasks';
// the design-flow button of the modern toolbar (web/js/menus.js, data-step) each task runs
const STEP = { edit: 'check', sim: 'simulate', emu: 'emulate', impl: 'implement' };
const ACTION = { edit: 'Check', sim: 'Simulate', emu: 'Emulate', impl: 'Implement' };
const NO_BENCH = 'The project has no test bench yet: create one with the wizard, or simulate the top with stimuli drawn in ISim.';
const HINT = {
  edit: 'Open a source from the Design panel, or check the design.',
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

// the side panel and the messages of a task the first time (the task in front gets the space)
const DEFAULTS = {
  edit: { side: true, console: true },
  sim: { side: false, console: false },
  emu: { side: true, console: false },   // (the emulator's Watch shown: #1020)
  impl: { side: true, console: true },
};

/** The task a document belongs to, by its id (web/js/app.js openDoc and its callers). */
export function taskOfDoc(id) {
  const s = String(id || '');
  if (s === 'isim') return 'sim';
  if (s === 'emulator') return 'emu';
  // (a build file: a report, #802; the RTL Schematic, Synthesize's view, as the Technology one, #1063; iMPACT, #1172)
  if (/^(summary|pins|fpgaview|impact)$/.test(s) || /^(text|tech|rtl):/.test(s) || s.startsWith('file:build/')) return 'impl';
  return 'edit';
}

/** The kept state (TASKS_KEY's JSON) checked: { task, tasks: { <task>: { side?, console?, max?, doc? } } }. */
export function readState(raw) {
  let v = null;
  try { v = JSON.parse(raw); } catch { /* none kept, or not ours */ }
  // (the Program task of before, #1172: Implement)
  const task = v?.task === 'prog' ? 'impl' : v?.task;
  const out = { task: TASKS.includes(task) ? task : 'edit', tasks: {} };
  for (const t of TASKS) {
    const k = v?.tasks?.[t] || {}, a = {};
    for (const f of ['side', 'console', 'max']) if (typeof k[f] === 'boolean') a[f] = k[f];
    if (typeof k.doc === 'string') a.doc = k.doc;
    out.tasks[t] = a;
  }
  return out;
}

/** A task's arrangement: what the viewer left, else its defaults; on a narrow screen the side panel
 *  is the drawer, closed when the task comes to the front (the document first). */
// the tasks whose side panel is their document's own: ISim's Instances and Objects (#800), the emulator's Watch (#801)
export const OWN_SIDE = ['sim', 'emu'];
export function arrangement(task, kept = {}, narrow = false) {
  const a = { ...DEFAULTS[task], max: false, ...kept };
  if (narrow && !OWN_SIDE.includes(task)) a.side = false;   // (the drawer: closed when the task comes to the front)
  return a;
}

// the tasks whose document is single by nature: a new simulation or emulation replaces the old one
export const SINGLE = ['sim', 'emu'];
/** What a document's title says of it: "ISim (top, Post-Synthesis)" → { module: 'top', model: 'Post-Synthesis' }
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
let app = null, state = readState(null), lastActive = null, shownTask = null, fitSoon = () => {};

function keep() { try { localStorage.setItem(TASKS_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ } }
function load() { try { state = readState(localStorage.getItem(TASKS_KEY)); } catch { state = readState(null); } }
const current = () => state.task;
const arr = (t = current()) => arrangement(t, state.tasks[t], isNarrow());
/** Changes the current task's arrangement (`patch`: side, console, max), kept. */
function arrange(patch) { Object.assign(state.tasks[current()], patch); keep(); apply(); }

/** The task in front (`t`), its arrangement and its document; `fromDoc`: its document is already in front. */
export function setTask(t, { fromDoc = false } = {}) {
  if (!TASKS.includes(t)) return;
  state.task = t;
  keep();
  if (!fromDoc && isNarrow() && drawerOpen()) setDrawer(false, { remember: false });   // (a task chosen: its document first)
  if (!fromDoc && app) {
    const S = app.S, docs = S.docs.filter(d => taskOfDoc(d.id) === t);
    const want = docs.find(d => d.id === state.tasks[t].doc) || docs.at(-1);
    if (want && want !== S.active) app.openDoc({ id: want.id });
    // the task's own page, cheap to open: the Design Summary, iMPACT
    else if (!want && S.project && t === 'impl') app.openSummary();
  }
  apply();
}

/** Puts the current task and its arrangement on the page. */
function apply() {
  const r = root();
  if (!on()) { if (document.getElementById('task-bar')) { unbuild(); placeSimToolbar(false); fitBoard(false); arrangeProgram(false); dispatchEvent(new Event('resize')); } return; }
  build();
  const t = current(), a = arr(t);
  if (t !== shownTask) { shownTask = t; messagesTask(t); if (t === 'impl' && app) showTopProcesses(app); }
  if (t === 'sim') refreshBench(app);
  r.dataset.task = t;
  r.dataset.side = a.side ? 'open' : 'folded';
  r.dataset.console = a.console ? 'open' : 'folded';
  r.dataset.max = a.max ? 'on' : 'off';
  for (const b of document.querySelectorAll('.task-btn')) b.setAttribute('aria-current', String(b.dataset.task === t));
  fitHeader();
  const bar = document.getElementById('task-bar');
  if (bar) {
    bar.querySelector('[data-act=side]').setAttribute('aria-pressed', String(isNarrow() && !OWN_SIDE.includes(t) ? drawerOpen() : a.side));
    bar.querySelector('[data-act=console]').setAttribute('aria-pressed', String(a.console));
    bar.querySelector('[data-act=max]').setAttribute('aria-pressed', String(a.max));
    const main = bar.querySelector('[data-act=main]');
    main.querySelector('.lbl').textContent = ACTION[t];
    main.title = ACTION[t];
    main.querySelector('.ico-inline').innerHTML = ICON[t];
  }
  tagDocs();
  // (the editors, the waves and the board measure their space again)
  dispatchEvent(new Event('resize'));
  fitSoon();
  arrangeProgram(true);
}

// each document and its tab say their task (the CSS shows the current task's only)
function tagDocs() {
  const S = app?.S;
  if (!S) return;
  placeSimToolbar(on());   // (ISim's toolbar in its wave window's line: #1026)
  let mine = 0, only = null;
  for (const d of S.docs) {
    const t = taskOfDoc(d.id);
    if (d.el.dataset.task !== t) d.el.dataset.task = t;
    if (d.tab.dataset.task !== t) d.tab.dataset.task = t;
    if (t === current()) { mine++; only = d; }
  }
  // a task whose document is single by nature: no tab bar (none open: its page); the document's module and model,
  // and its close, in the task's bar (#854)
  const single = on() && SINGLE.includes(current()) && mine <= 1;
  const r = root();
  if (single) r.dataset.single = 'on'; else delete r.dataset.single;
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
    // (Simulate with no test bench yet: one to create, or the top simulated with stimuli drawn in ISim: #917)
    const noBench = current() === 'sim' && !!app.S.project && !simChoices(app.S.project, app.S.modules).benches.length;
    empty.querySelector('p').textContent = noBench ? NO_BENCH : HINT[current()];
    empty.querySelector('.task-empty-bench').hidden = !noBench;
    empty.querySelector('.ico').innerHTML = ICON[current()];
    const go = empty.querySelector('button');
    go.textContent = ACTION[current()];
    go.disabled = !mainEnabled();
  }
}

const stepButton = (t = current()) => document.querySelector(`#toolbar .m-step[data-step="${STEP[t]}"]`);
// (Simulate runs the test bench, whatever is selected: #800)
const mainEnabled = () => (current() === 'sim' ? !!app?.S.project && !!simTarget(app.S.project, app.S.modules) : !!stepButton()?._enabled?.());
/** The current task's main action: the design-flow button of the modern toolbar; Edit's Check checks the selected
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
  if (closed && taskOfDoc(d.id) !== current()) { tagDocs(); return; }
  // (a document opened behind, with the project (its Design Summary): the task stays the viewer's, until it is brought to the front)
  if (d.background && !d._taskSeen) { d._taskSeen = true; tagDocs(); return; }
  d._taskSeen = true;
  const t = taskOfDoc(d.id);
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
  for (const b of document.querySelectorAll('.task-btn')) {
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
const PARTS = ['task-switch', 'task-tabs', 'task-bar', 'task-empty', 'task-procs-tab'];   // (their ids)
const PAGE_NAME = { start: 'Start', design: 'Design', test: 'Test', files: 'Files', libraries: 'Libraries', procs: 'Processes' };
function build() {
  const $ = id => document.getElementById(id);
  if ($('task-bar')) return;
  $('menubar').after(h('nav', { id: 'task-switch', class: 'task-switch', 'aria-label': 'Tasks' }, ...TASKS.map(taskButton)));
  $('statusbar').before(h('nav', { id: 'task-tabs', class: 'task-switch', 'aria-label': 'Tasks' }, ...TASKS.map(taskButton)));
  const tb = (act, title, ico) => h('button', { class: 'tb-btn', type: 'button', 'data-act': act, title, 'aria-label': title, html: ICON[ico] });
  $('toolbar').append(h('div', { id: 'task-bar', role: 'group', 'aria-label': 'Task' },
    tb('side', 'Show or hide the side panel', 'side'),
    tb('console', 'Show or hide the messages', 'msgs'),
    tb('max', 'Maximize the document (double-click its tab)', 'max'),
    h('span', { id: 'task-doc', hidden: true },
      h('span', { class: 'task-doc-mod', 'data-no-i18n': true }), h('span', { class: 'task-doc-model' }),
      h('button', { class: 'tb-btn', type: 'button', 'data-act': 'close', title: 'Close', 'aria-label': 'Close', html: ICON.close })),
    benchSelect(app),
    h('button', { class: 'btn task-bench-edit', type: 'button', title: 'Open the test bench\'s source', onclick: () => editBench(app) }, 'Edit'),
    modelSelect(app),
    Object.assign(h('button', { class: 'm-step task-main', type: 'button', 'data-act': 'main', onclick: runMain }, h('span', { class: 'ico-inline' }), h('span', { class: 'lbl' })),
      { _enabled: mainEnabled })));   // (disabled as its design-flow button: menus.js refreshSteps)
  $('task-bar').addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'side') { if (isNarrow() && !OWN_SIDE.includes(current())) { setDrawer(!drawerOpen()); apply(); } else arrange({ side: !arr().side }); }
    else if (act === 'console') arrange({ console: !arr().console });
    else if (act === 'max') arrange({ max: !arr().max });
    else if (act === 'close') { const d = document.getElementById('task-doc')._doc; if (d) app.closeDoc(d); }
  });
  $('workspace').append(h('div', { id: 'task-empty', hidden: true },
    h('span', { class: 'ico' }), h('h2'), h('p'), h('button', { class: 'm-step', type: 'button', onclick: runMain }),
    h('button', { class: 'btn task-empty-bench', type: 'button', onclick: () => newBench(app) }, 'Create a test bench (Wizard)…')));
  // Edit's pages: tabs above the hierarchy, the closed pages' name their tooltip (web/css/tasks.css, #984); the test
  // benches a page of their own, after Design (#1016)
  buildTestPage(app, newBench);
  // Implement's side panel, its Processes, under a tab as Edit's pages (#1160: shown in Implement only, web/css/tasks.css)
  $('left-tabs').append(h('div', { id: 'task-procs-tab', class: 'tab', 'data-page': 'procs', role: 'tab', 'aria-selected': 'true' },
    h('span', { class: 'ico-inline tab-ico', html: icons.mBolt }), h('span', { class: 'tab-lbl' }, 'Processes')));
  for (const t of $('left-tabs').querySelectorAll('.tab')) t.title = PAGE_NAME[t.dataset.page];
  app.renderHierarchy();   // (one tree, no views: #799)
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
  delete document.getElementById('topbar').dataset.fit;
  for (const t of document.querySelectorAll('#left-tabs .tab')) t.removeAttribute('title');
  unbuildTestPage(app);
  messagesTask(null);   // (the other interfaces: every source, #925)
  shownTask = null;
  app.renderHierarchy();
  const r = root();
  for (const k of ['task', 'side', 'console', 'max', 'single']) delete r.dataset[k];
}

/** The Tasks interface's behaviour; its parts are built while it is the interface. `a` is the app (web/js/app.js). */
export function initTasks(a) {
  app = a;
  load();
  initMessages(app);   // (the message centre: every interface's, #925)
  fitSoon = initEmulate(() => on() && current() === 'emu');
  initProgram(() => arrangeProgram(on()));
  initCheckMessages(on, () => { if (!arr().console) arrange({ console: true }); }, (...a) => app.log(...a));
  const $ = id => document.getElementById(id);
  // a folded side panel or messages open again when one of their tabs is clicked
  $('left-tabs').addEventListener('click', () => { if (on() && !isNarrow() && !arr().side) arrange({ side: true }); });
  $('console-tabs').addEventListener('click', () => { if (on() && !arr().console) arrange({ console: true }); });
  // new errors open the messages (Check Syntax shows the Errors tab)
  let errs = 0;
  new MutationObserver(() => {
    const n = parseInt($('err-count').textContent, 10) || 0;
    if (on() && n > errs && !arr().console) arrange({ console: true });
    errs = n;
  }).observe($('err-count'), { childList: true, characterData: true, subtree: true });
  // maximize: a document's tab double-clicked, or Ctrl/Cmd+Shift+Enter
  $('doc-tabs').addEventListener('dblclick', e => { if (on() && e.target.closest('.tab') && !e.target.closest('.tclose')) arrange({ max: !arr().max }); });
  addEventListener('keydown', e => {
    if (on() && (e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'Enter' && !document.querySelector('.dlg-overlay')) { e.preventDefault(); arrange({ max: !arr().max }); }
  });
  // a document brought to the front that was already in front, behind another task (Design, after the project opened):
  // its task forward (the tabs' observer sees no change then, #1191)
  addEventListener('silinx:doc-activated', e => {
    const { doc, background } = e.detail;
    if (!on() || background || doc !== lastActive || taskOfDoc(doc.id) === current()) return;
    state.tasks[taskOfDoc(doc.id)].doc = doc.id;
    keep();
    setTask(taskOfDoc(doc.id), { fromDoc: true });
  });
  // a project opened: in Design, its Design page, whatever its documents brought to the front (#1171)
  // (a narrow screen's drawer as it was: the Design pane in it, #266)
  addEventListener('silinx:project-opened', () => {
    if (!on()) return;
    const open = isNarrow() && drawerOpen();
    setTask('edit');
    app.showLeftPage('design');
    if (open && !drawerOpen()) { setDrawer(true, { remember: false }); apply(); }
  });
  // the documents: opened, closed, brought to the front
  new MutationObserver(followActive).observe($('doc-tabs'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  new MutationObserver(refreshDots).observe($('procs'), { childList: true, subtree: true });
  // the interface switched (View ▸ Interface), or a narrow screen turned wide
  new MutationObserver(apply).observe(root(), { attributes: true, attributeFilter: ['data-layout'] });
  globalThis.matchMedia?.('(max-width: 1024px)').addEventListener?.('change', apply);
  // the header's room: its width, and what is in it (the menus' labels in another language, the Development
  // menu, the project's name)
  new ResizeObserver(() => fitHeader()).observe($('topbar'));
  new MutationObserver(() => fitHeader()).observe($('topbar'), { childList: true, subtree: true, characterData: true });
  setInterval(() => { if (on()) { refreshDots(); if (current() === 'sim') { refreshBench(app); tagDocs(); } const g = document.querySelector('#task-empty button'); if (g) g.disabled = !mainEnabled(); } }, 1000);
  apply();
}
