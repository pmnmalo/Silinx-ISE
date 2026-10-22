// web/js/tasks.js: the Tasks interface (#804): the task of a document, the arrangements, the kept state, the
// task's state dot; web/css/tasks.css: its rules apply in that interface only, with the modern look's colours.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.addEventListener ??= () => {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
const T = await import('../web/js/tasks.js');
const SIM = await import('../web/js/tasks-sim.js');
const EMU = await import('../web/js/tasks-emu.js');
const IMPL = await import('../web/js/tasks-impl.js');
const PROG = await import('../web/js/tasks-prog.js');

test('the five tasks, in the order of a lab session, with the names of the modern toolbar\'s steps', () => {
  assert.deepEqual(T.TASKS, ['edit', 'sim', 'emu', 'impl', 'prog']);
  assert.deepEqual(T.TASKS.map((t) => T.TASK_LABEL[t]), ['Edit', 'Simulate', 'Emulate', 'Implement', 'Program']);
});

test('taskOfDoc: each kind of document belongs to one task (the editors and the viewers of the design to Edit)', () => {
  const cases = {
    isim: 'sim', emulator: 'emu', impact: 'prog',
    summary: 'impl', pins: 'impl', fpgaview: 'impl', 'text:pong.pwr': 'impl', 'tech:pong': 'impl',
    'file:src/pong.v': 'edit', 'file:constraints/top.ucf': 'edit', 'rtl:pong': 'edit', 'tpl:debounce': 'edit',
    'asm:src/speed_ctrl.asm.json': 'edit', 'sch:src/gates.sch.json': 'edit', 'fsm:src/traffic.fsm.json': 'edit',
    'tt:src/lamps.tt.json': 'edit', 'ttsch:src/lamps.tt.json': 'edit', 'pn:src/net.pn.json': 'edit',
  };
  for (const [id, task] of Object.entries(cases)) assert.equal(T.taskOfDoc(id), task, id);
  // (an unknown id, or none: Edit, where the documents of the design are)
  assert.equal(T.taskOfDoc('something-new'), 'edit');
  assert.equal(T.taskOfDoc(undefined), 'edit');
  // (not a prefix match: a file whose path starts like an id is still a file)
  assert.equal(T.taskOfDoc('file:summary'), 'edit');
  // (a build file, a report the Design Summary opens: Implement's, #802)
  assert.equal(T.taskOfDoc('file:build/open/top_stat.txt'), 'impl');
  assert.equal(T.taskOfDoc('file:build/top.syr'), 'impl');
});

test('readState: the kept state checked; anything else falls back to Edit and the defaults', () => {
  const empty = { edit: {}, sim: {}, emu: {}, impl: {}, prog: {} };
  assert.deepEqual(T.readState(null), { task: 'edit', tasks: empty });
  assert.deepEqual(T.readState('not json'), { task: 'edit', tasks: empty });
  assert.deepEqual(T.readState('[1,2]'), { task: 'edit', tasks: empty });
  assert.deepEqual(T.readState(JSON.stringify({ task: 'run', tasks: { sim: { side: 'yes', max: 1 } } })), { task: 'edit', tasks: empty });
  const kept = { task: 'sim', tasks: { sim: { side: true, console: false, max: true, doc: 'isim', extra: 3 }, emu: { doc: 7 }, bogus: { side: true } } };
  assert.deepEqual(T.readState(JSON.stringify(kept)), {
    task: 'sim',
    tasks: { edit: {}, sim: { side: true, console: false, max: true, doc: 'isim' }, emu: {}, impl: {}, prog: {} },
  });
});

test('arrangement: the task in front gets the space; what the viewer left wins; a narrow screen closes the drawer', () => {
  assert.deepEqual(T.arrangement('edit'), { side: true, console: true, max: false });
  assert.deepEqual(T.arrangement('sim'), { side: false, console: false, max: false });
  assert.deepEqual(T.arrangement('emu'), { side: true, console: false, max: false });   // (the Watch shown: #1020)
  assert.deepEqual(T.arrangement('impl'), { side: true, console: true, max: false });
  assert.deepEqual(T.arrangement('prog'), { side: false, console: true, max: false });
  assert.deepEqual(T.arrangement('sim', { side: true, max: true, doc: 'isim' }), { side: true, console: false, max: true, doc: 'isim' });
  assert.deepEqual(T.arrangement('edit', {}, true), { side: false, console: true, max: false });
  assert.deepEqual(T.arrangement('edit', { side: true }, true), { side: false, console: true, max: false });
  // (Simulate's side panel is ISim's Instances and Objects, not the drawer: what the viewer left, on a narrow screen too: #800)
  assert.deepEqual(T.arrangement('sim', { side: true }, true), { side: true, console: false, max: false });
  assert.deepEqual(T.arrangement('emu', { side: true }, true), { side: true, console: false, max: false });   // (the emulator's Watch: #801)
  assert.deepEqual(T.arrangement('emu', {}, true), { side: true, console: false, max: false });   // (shown at first, below the board: #1020)
  assert.deepEqual(T.arrangement('emu', { side: false }), { side: false, console: false, max: false });   // (folded by the viewer: kept)
  assert.deepEqual(T.OWN_SIDE, ['sim', 'emu']);
});

test('#854 docDetail: the module and the model a single document\'s title says; the tasks whose document is single', () => {
  assert.deepEqual(T.SINGLE, ['sim', 'emu', 'prog']);
  assert.deepEqual(T.docDetail('SSim (top)'), { module: 'top', model: null });
  assert.deepEqual(T.docDetail('SSim (tb_pong, Post-Synthesis)'), { module: 'tb_pong', model: 'Post-Synthesis' });
  assert.deepEqual(T.docDetail('Board Emulator (pong, Post-Place & Route)'), { module: 'pong', model: 'Post-Place & Route' });
  assert.deepEqual(T.docDetail('iMPACT'), { module: null, model: null });
  assert.deepEqual(T.docDetail(undefined), { module: null, model: null });
});

test('#800 simTarget: Simulate runs the simulation top, else the first test bench, else the top; the models', () => {
  const mods = [{ name: 'top', role: 'design' }, { name: 'knight', role: 'design' }, { name: 'tb_top', role: 'sim' }];
  assert.equal(SIM.simTarget({ top: 'top', simTop: 'tb_top' }, mods), 'tb_top');
  assert.equal(SIM.simTarget({ top: 'top', simTop: '' }, mods), 'tb_top');
  assert.equal(SIM.simTarget({ top: 'top', simTop: 'gone' }, mods), 'tb_top');
  assert.equal(SIM.simTarget({ top: 'top' }, mods.filter((m) => m.role !== 'sim')), 'top');
  assert.equal(SIM.simTarget({ top: 'gone' }, mods.filter((m) => m.role !== 'sim')), null);
  assert.equal(SIM.simTarget(null, []), null);
  assert.deepEqual(SIM.SIM_MODELS.map(([v]) => v), ['', 'postsynth', 'posttrans', 'postmap', 'postpar']);
});

test('#917 simChoices: the test benches, then the design\'s modules with the top first', () => {
  const mods = [{ name: 'top', role: 'design' }, { name: 'knight', role: 'design' }, { name: 'tb_top', role: 'sim' }, { name: 'counter', role: 'design' }, { name: 'tb_a', role: 'sim' }];
  assert.deepEqual(SIM.simChoices({ top: 'top' }, mods), { benches: ['tb_a', 'tb_top'], design: ['top', 'counter', 'knight'] });
  assert.deepEqual(SIM.simChoices({ top: 'knight' }, mods).design, ['knight', 'counter', 'top']);
  assert.deepEqual(SIM.simChoices(null, []), { benches: [], design: [] });
  assert.equal(SIM.NEW_BENCH, '+new');
});

test('#801 #1021 boardZoom: as large as fits the room, at most 1.5, never below its proper size (1); nothing to measure: 1', () => {
  const board = { w: 700, h: 520 };
  assert.equal(EMU.boardZoom({ w: 1400, h: 1040 }, board), 1.5);                       // (a lab desktop: larger, not huge)
  assert.equal(EMU.boardZoom({ w: 1000, h: 520 }, board), 1);
  assert.equal(EMU.boardZoom({ w: 1000, h: 650 }, board), 1.25);                       // (the height decides)
  assert.equal(EMU.boardZoom({ w: 900, h: 1000 }, board), 1.28);                       // (the width: to the hundredth below, 1.2857…)
  // (a room too small: its proper size, the panels below it and the task's area scrolling; #801 made it 0.75, 0.5, 0.3)
  assert.equal(EMU.boardZoom({ w: 1300, h: 390 }, board), 1);
  assert.equal(EMU.boardZoom({ w: 350, h: 1000 }, board), 1);
  assert.equal(EMU.boardZoom({ w: 70, h: 52 }, board), 1);
  assert.equal(EMU.MIN_ZOOM, 1);
  assert.equal(EMU.boardZoom({ w: 0, h: 500 }, board), 1);
  assert.equal(EMU.boardZoom({ w: 800, h: 600 }, { w: 0, h: 0 }), 1);
  assert.equal(EMU.boardZoom(null, board), 1);
});

test('#802 implementationEnded: Implement\'s dot from running to done, with or without warnings', () => {
  assert.equal(IMPL.implementationEnded('running', 'ok'), true);
  assert.equal(IMPL.implementationEnded('running', 'warn'), true);
  assert.equal(IMPL.implementationEnded('running', 'err'), false);
  assert.equal(IMPL.implementationEnded('ok', 'ok'), false);
  assert.equal(IMPL.implementationEnded(null, 'ok'), false);
  assert.equal(IMPL.implementationEnded('running', 'running'), false);
});

test('#803 fileState: the programming file\'s state from Implement\'s dot', () => {
  assert.deepEqual(PROG.fileState('ok'), ['ok', 'Up to date with the sources']);
  assert.deepEqual(PROG.fileState('warn'), ['ok', 'Up to date with the sources']);
  assert.deepEqual(PROG.fileState('stale'), ['stale', 'Out of date: the sources changed since the last implementation']);
  assert.deepEqual(PROG.fileState('err'), ['err', 'The last implementation failed']);
  assert.deepEqual(PROG.fileState('running'), ['running', 'Being implemented…']);
  assert.deepEqual(PROG.fileState(null), ['none', 'No programming file yet']);
});

test('taskDot: the worst status of the task\'s processes (errors, then running, out of date, warnings, done)', () => {
  assert.equal(T.taskDot('edit', {}), null);
  assert.equal(T.taskDot('edit', { check: 'ok' }), 'ok');
  assert.equal(T.taskDot('edit', { 'sim-check': 'err' }), null);        // the Simulation view's check is Simulate's
  assert.equal(T.taskDot('sim', { 'sim-check': 'warn' }), 'warn');
  assert.equal(T.taskDot('impl', { synth: 'ok', map: 'ok', par: 'stale', bitgen: 'warn' }), 'stale');
  assert.equal(T.taskDot('impl', { synth: 'ok', par: 'running' }), 'running');
  assert.equal(T.taskDot('impl', { 'synth-open': 'ok', translate: 'err', par: 'running' }), 'err');
  assert.equal(T.taskDot('impl', { synth: null, bitgen: 'ok' }), 'ok');
  assert.equal(T.taskDot('emu', { check: 'ok', synth: 'ok' }), null);
  assert.equal(T.taskDot('prog', { bitgen: 'ok' }), null);
});

test('taskTitle: the task button\'s tooltip says what its dot means (#991)', () => {
  assert.equal(T.taskTitle('edit', null), 'Edit');
  assert.equal(T.taskTitle('edit', 'ok'), 'Edit — done, no warnings');
  assert.equal(T.taskTitle('sim', 'warn'), 'Simulate — done with warnings');
  assert.equal(T.taskTitle('impl', 'err'), 'Implement — errors');
  assert.equal(T.taskTitle('impl', 'stale'), 'Implement — out of date (a source changed)');
  assert.equal(T.taskTitle('impl', 'running'), 'Implement — running…');
  assert.equal(T.taskTitle('prog', null), 'Program');
  // every state a dot can have (taskDot) has its text
  for (const s of ['ok', 'warn', 'err', 'stale', 'running']) assert.ok(T.DOT_TEXT[s], s);
});

test('tasks.css: its rules apply in the Tasks interface only (or to its own elements), with the modern look\'s colours', () => {
  const css = fs.readFileSync(path.join(ROOT, 'web/css/tasks.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const parts = (sel) => { const out = []; let depth = 0, cur = ''; for (const c of sel) { if (c === ',' && !depth) { out.push(cur.trim()); cur = ''; continue; } depth += c === '(' ? 1 : c === ')' ? -1 : 0; cur += c; } out.push(cur.trim()); return out; };
  const selectors = [...css.matchAll(/(^|[{}])\s*([^{}@][^{}]*)\{/g)].map((m) => m[2].trim()).filter((x) => x && !x.startsWith('@'));
  assert.ok(selectors.length > 20);
  const own = /^(html\[data-layout="tasks"\]|#task-|\.task-|#mc-)/;   // (#mc-: the message centre's own elements, #798)
  assert.deepEqual(selectors.filter((sel) => !parts(sel).every((p) => own.test(p))), []);
  // its own elements are hidden in the other interfaces
  assert.match(css, /#task-switch, #task-tabs, #task-bar, #task-empty \{ display: none; \}/);
  assert.match(css, /^#mc-last \{ display: none; \}/m);   // (the message centre's other rules: every interface's, messages.css, #925)
  // colours: the modern look's tokens only (light and dark), no colour written here
  assert.deepEqual(css.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g), null);
});

test('index.html: the Tasks interface before the first paint (data-ui modern, data-layout tasks), its stylesheet', () => {
  const html = fs.readFileSync(path.join(ROOT, 'web/index.html'), 'utf8');
  assert.match(html, /<link rel="stylesheet" href="\/css\/modern.css">\n<link rel="stylesheet" href="\/css\/tasks.css">/);
  const script = html.slice(html.indexOf('<script>'), html.indexOf('</script>'));
  // run the early script with each kept interface: the attributes it puts on <html>
  // (dev: a development build's <html data-dev>, #838)
  const run = (ui, dev = true) => {
    const attrs = {};
    const d = { setAttribute: (k, v) => { attrs[k] = v; }, hasAttribute: (k) => dev && k === 'data-dev' };
    const store = { 'silinx.ui': ui, 'silinx.theme': 'dark' };
    new Function('document', 'localStorage', 'window', 'matchMedia', script.replace('<script>', ''))(
      { documentElement: d }, { getItem: (k) => store[k] ?? null }, {}, () => ({ matches: false }));
    return attrs;
  };
  assert.deepEqual(run('tasks'), { 'data-ui': 'modern', 'data-layout': 'tasks', 'data-theme': 'dark', 'data-drawer': 'open' });
  assert.deepEqual(run('modern'), { 'data-ui': 'modern', 'data-theme': 'dark', 'data-drawer': 'open' });
  assert.deepEqual(run('classic'), { 'data-ui': 'classic', 'data-theme': 'light', 'data-drawer': 'open' });
  assert.deepEqual(run('retro'), { 'data-ui': 'modern', 'data-theme': 'dark', 'data-drawer': 'open' });
  // a release (no data-dev): a stored tasks is the modern interface, no flash of the Tasks layout (#838)
  assert.deepEqual(run('tasks', false), { 'data-ui': 'modern', 'data-theme': 'dark', 'data-drawer': 'open' });
  assert.deepEqual(run('classic', false), { 'data-ui': 'classic', 'data-theme': 'light', 'data-drawer': 'open' });
});
