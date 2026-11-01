// web/js/tasks.js: the Tasks interface (#804): the task of a document, the arrangements, the kept state, the
// task's state dot; web/css/tasks.css: its rules apply in that interface only, with the Silinx look's colours.
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
const CHECK = await import('../web/js/tasks-check.js');

// (#1172: no Program task, programming Implement's)
test('the four tasks, in the order of a lab session, with the names of the Silinx toolbar\'s steps', () => {
  assert.deepEqual(T.TASKS, ['edit', 'sim', 'emu', 'impl']);
  assert.deepEqual(T.TASKS.map((t) => T.TASK_LABEL[t]), ['Design', 'Simulate', 'Emulate', 'Implement']);
});

test('taskOfDoc: each kind of document belongs to one task (the editors and the viewers of the design to Edit)', () => {
  const cases = {
    isim: 'sim', emulator: 'emu', impact: 'impl',
    summary: 'impl', pins: 'impl', fpgaview: 'impl', 'text:pong.pwr': 'impl', 'tech:pong': 'impl', 'rtl:pong': 'impl',
    'file:src/pong.v': 'edit', 'file:constraints/top.ucf': 'impl', 'file:pins.UCF': 'impl', 'file:src/ucf.v': 'edit',   // (the constraints Implement's, #1265)
    'asm:src/speed_ctrl.asm.json': 'edit', 'sch:src/gates.sch.json': 'edit', 'fsm:src/traffic.fsm.json': 'edit',
    'tt:src/lamps.bool.json': 'edit', 'ttsch:src/lamps.bool.json': 'edit', 'pn:src/net.pn.json': 'edit',
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
  const empty = { edit: {}, sim: {}, emu: {}, impl: {} };
  assert.deepEqual(T.readState(null), { task: 'edit', tasks: empty });
  assert.deepEqual(T.readState('not json'), { task: 'edit', tasks: empty });
  assert.deepEqual(T.readState('[1,2]'), { task: 'edit', tasks: empty });
  assert.deepEqual(T.readState(JSON.stringify({ task: 'run', tasks: { sim: { side: 'yes', max: 1 } } })), { task: 'edit', tasks: empty });
  const kept = { v: T.STATE_V, task: 'sim', tasks: { sim: { side: true, console: false, max: true, doc: 'isim', extra: 3 }, emu: { doc: 7 }, bogus: { side: true } } };
  assert.deepEqual(T.readState(JSON.stringify(kept)), {
    task: 'sim',
    tasks: { edit: {}, sim: { side: true, console: false, max: true, doc: 'isim' }, emu: {}, impl: {} },
  });
  // kept before Simulate's and Emulate's side panels changed (no version): their side's state dropped, the panels open (#1415)
  const old = { task: 'emu', tasks: { sim: { side: false, doc: 'isim' }, emu: { side: false, console: true }, impl: { side: false } } };
  assert.deepEqual(T.readState(JSON.stringify(old)).tasks, { edit: {}, sim: { doc: 'isim' }, emu: { console: true }, impl: { side: false } });
  assert.deepEqual(T.readState(JSON.stringify({ ...old, v: T.STATE_V })).tasks.emu, { side: false, console: true }, 'kept since: kept');
  // the Program task of before (#1172): Implement
  assert.equal(T.readState(JSON.stringify({ task: 'prog' })).task, 'impl');
});

test('arrangement: the task in front gets the space; what the viewer left wins', () => {
  assert.deepEqual(T.arrangement('edit'), { side: true, console: true, max: false });
  assert.deepEqual(T.arrangement('sim'), { side: true, console: true, max: false });   // (#1408, #1429)
  assert.deepEqual(T.arrangement('emu'), { side: true, console: true, max: false });   // (#1399, #1429)
  assert.deepEqual(T.arrangement('impl'), { side: true, console: true, max: false });
  assert.deepEqual(T.arrangement('sim', { side: true, max: true, doc: 'isim' }), { side: true, console: true, max: true, doc: 'isim' });
  assert.deepEqual(T.arrangement('emu', { side: false }), { side: false, console: true, max: false });   // (folded by the viewer: kept)
  // (on a narrow screen too: the side panel docked, not a drawer closed when the task comes to the front, #1463)
  assert.deepEqual(T.arrangement('edit', {}, true), { side: true, console: true, max: false });
  assert.deepEqual(T.arrangement('impl', { side: true }, true), { side: true, console: true, max: false });
  // (but Emulate's folded there at first, the board its room, its own choice there kept apart: narrowSide)
  assert.deepEqual(T.arrangement('emu', { side: true }, true), { side: false, console: true, max: false });
  assert.deepEqual(T.arrangement('emu', { side: false, narrowSide: true }, true), { side: true, narrowSide: true, console: true, max: false });
  assert.deepEqual(T.arrangement('emu', { side: true, narrowSide: true }), { side: true, narrowSide: true, console: true, max: false });
  assert.deepEqual(T.readState(JSON.stringify({ v: T.STATE_V, tasks: { emu: { narrowSide: true, side: false } } })).tasks.emu, { side: false, narrowSide: true });
  assert.deepEqual(T.FOLDED_NARROW, ['emu']);
  assert.deepEqual(T.OWN_SIDE, ['sim']);   // (Emulate's as Implement's: #1399)
});

test('openedState: a project opened shows every task\'s side panel and messages, no document maximized (#1557)', () => {
  const kept = T.readState(JSON.stringify({ v: T.STATE_V, task: 'sim', tasks: {
    edit: { side: false, console: false, max: true, doc: 'file:src/top.vhd' }, sim: { console: false, doc: 'isim' },
    emu: { side: false, narrowSide: true }, impl: { max: true } } }));
  const opened = T.openedState(kept);
  assert.deepEqual(opened, { task: 'sim', tasks: {
    edit: { side: true, console: true, max: false, doc: 'file:src/top.vhd' }, sim: { side: true, console: true, max: false, doc: 'isim' },
    emu: { side: true, console: true, max: false }, impl: { side: true, console: true, max: false } } });
  for (const t of T.TASKS) assert.deepEqual(T.arrangement(t, opened.tasks[t]), { ...opened.tasks[t], side: true, console: true, max: false }, t);
  // (on a narrow screen Emulate's side panel back to its default, folded: the board its room, #1463; the others open)
  assert.equal(T.arrangement('emu', opened.tasks.emu, true).side, false);
  for (const t of ['edit', 'sim', 'impl']) assert.equal(T.arrangement(t, opened.tasks[t], true).side, true, t);
  // (nothing kept before: the same; the kept state not changed in place)
  assert.deepEqual(T.openedState(T.readState(null)).tasks.edit, { side: true, console: true, max: false });
  assert.deepEqual(kept.tasks.edit, { side: false, console: false, max: true, doc: 'file:src/top.vhd' });
  // (read back as kept)
  assert.deepEqual(T.readState(JSON.stringify({ ...opened, v: T.STATE_V })), opened);
});

test('closedState: the project closed shows Design\'s side panel, no document maximized; the other tasks as kept (#2169)', () => {
  const kept = T.readState(JSON.stringify({ v: T.STATE_V, task: 'impl', tasks: {
    edit: { side: false, console: false, max: true, doc: 'file:src/top.vhd' }, sim: { side: false }, emu: { side: false, narrowSide: true }, impl: { max: true } } }));
  const closed = T.closedState(kept);
  assert.deepEqual(closed, { task: 'impl', tasks: {
    edit: { side: true, console: false, max: false, doc: 'file:src/top.vhd' }, sim: { side: false }, emu: { side: false, narrowSide: true }, impl: { max: true } } });
  assert.equal(T.arrangement('edit', closed.tasks.edit).side, true);
  assert.equal(T.arrangement('edit', closed.tasks.edit, true).side, true);   // (on a narrow screen too)
  // (nothing kept before: the same; the kept state not changed in place)
  assert.deepEqual(T.closedState(T.readState(null)).tasks.edit, { side: true, max: false });
  assert.deepEqual(kept.tasks.edit, { side: false, console: false, max: true, doc: 'file:src/top.vhd' });
  // (read back as kept)
  assert.deepEqual(T.readState(JSON.stringify({ ...closed, v: T.STATE_V })), closed);
});

test('#854 docDetail: the module and the model a single document\'s title says; the tasks whose document is single', () => {
  assert.deepEqual(T.SINGLE, []);   // (Simulate: its tabs, several simulations, #1161; Emulate its tab, #1426)
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
});

test('#801 #1021 #1999 boardZoom: as large as fits the room, at most 1.5, at least 0.7 (a tablet: smaller); nothing to measure: 1', () => {
  const board = { w: 700, h: 520 };
  assert.equal(EMU.boardZoom({ w: 1400, h: 1040 }, board), 1.5);                       // (a lab desktop: larger, not huge)
  assert.equal(EMU.boardZoom({ w: 1000, h: 520 }, board), 1);
  assert.equal(EMU.boardZoom({ w: 1000, h: 650 }, board), 1.25);                       // (the height decides)
  assert.equal(EMU.boardZoom({ w: 900, h: 1000 }, board), 1.28);                       // (the width: to the hundredth below, 1.2857…)
  // (a room too small: smaller, down to 0.7, then the task's area scrolls; #801 made it 0.75, 0.5, 0.3, #1021 never below 1)
  assert.equal(EMU.boardZoom({ w: 1300, h: 390 }, board), 0.75);
  assert.equal(EMU.boardZoom({ w: 630, h: 1000 }, board), 0.9);
  assert.equal(EMU.boardZoom({ w: 350, h: 1000 }, board), 0.7);
  assert.equal(EMU.boardZoom({ w: 70, h: 52 }, board), 0.7);
  assert.equal(EMU.MIN_ZOOM, 0.7);
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
});

test('checkLines: a schematic\'s Check in the console below, as a process\'s messages (#993)', () => {
  const E = { severity: 'error', message: 'Net n1 has 2 drivers' }, W = { severity: 'warning', message: 'Input A is not connected' };
  assert.deepEqual(CHECK.checkLines('Check Schematic', 'gates', [E, W]), [
    { text: '\nStarted : "Check Schematic" of gates.\n', cls: 'hdr' },
    { text: 'ERROR: Net n1 has 2 drivers', cls: 'err', diag: E },
    { text: 'WARNING: Input A is not connected', cls: 'warn', diag: W },
    { text: '\nProcess "Check Schematic" failed', cls: 'err' },
  ]);
  assert.deepEqual(CHECK.checkLines('Check Schematic', 'gates', [W]).at(-1), { text: '\nProcess "Check Schematic" completed successfully with 1 warning(s)', cls: 'ok' });
  assert.deepEqual(CHECK.checkLines('Check Schematic', 'gates', []).map((l) => l.text.trim()), ['Started : "Check Schematic" of gates.', 'Process "Check Schematic" completed successfully']);
  assert.deepEqual(CHECK.checkLines('Check Schematic', 'x', [{ severity: 'info', message: 'm' }])[1], { text: 'INFO: m', cls: '', diag: { severity: 'info', message: 'm' } });
});

test('taskTitle: the task button\'s tooltip says what its dot means (#991)', () => {
  assert.equal(T.taskTitle('edit', null), 'Design');
  assert.equal(T.taskTitle('edit', 'ok'), 'Design — done, no warnings');
  assert.equal(T.taskTitle('sim', 'warn'), 'Simulate — done with warnings');
  assert.equal(T.taskTitle('impl', 'err'), 'Implement — errors');
  assert.equal(T.taskTitle('impl', 'stale'), 'Implement — out of date (a source changed)');
  assert.equal(T.taskTitle('impl', 'running'), 'Implement — running…');
  // every state a dot can have (taskDot) has its text
  for (const s of ['ok', 'warn', 'err', 'stale', 'running']) assert.ok(T.DOT_TEXT[s], s);
});

test('tasks.css: its rules apply in the Tasks interface only (or to its own elements), with the Silinx look\'s colours', () => {
  const css = fs.readFileSync(path.join(ROOT, 'web/css/tasks.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const parts = (sel) => { const out = []; let depth = 0, cur = ''; for (const c of sel) { if (c === ',' && !depth) { out.push(cur.trim()); cur = ''; continue; } depth += c === '(' ? 1 : c === ')' ? -1 : 0; cur += c; } out.push(cur.trim()); return out; };
  const selectors = [...css.matchAll(/(^|[{}])\s*([^{}@][^{}]*)\{/g)].map((m) => m[2].trim()).filter((x) => x && !x.startsWith('@'));
  assert.ok(selectors.length > 20);
  const own = /^(html\[data-layout="tasks"\]|#task-|\.task-|#mc-)/;   // (#mc-: the message centre's own elements, #798)
  assert.deepEqual(selectors.filter((sel) => !parts(sel).every((p) => own.test(p))), []);
  // its own elements are hidden in the other interfaces
  assert.match(css, /#task-switch, #task-tabs, #task-bar, #task-view, #task-empty \{ display: none; \}/);
  assert.match(css, /^#mc-last \{ display: none; \}/m);   // (the message centre's other rules: every interface's, messages.css, #925)
  // colours: the Silinx look's tokens only (light and dark), no colour written here
  assert.deepEqual(css.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g), null);
});

test('index.html: the Silinx interface (the Tasks one, #1149) before the first paint (data-ui silinx, data-layout tasks), its stylesheet', () => {
  const html = fs.readFileSync(path.join(ROOT, 'web/index.html'), 'utf8');
  assert.match(html, /<link rel="stylesheet" href="\/css\/modern.css">\n<link rel="stylesheet" href="\/css\/tasks.css">/);
  const script = html.slice(html.indexOf('<script>'), html.indexOf('</script>'));
  // run the early script with each kept interface: the attributes it puts on <html>
  const run = (ui, { pathname = '/', store = { 'silinx.ui': ui, 'silinx.theme': 'dark' } } = {}) => {
    const attrs = {};
    const d = { setAttribute: (k, v) => { attrs[k] = v; }, hasAttribute: () => false };
    new Function('document', 'localStorage', 'window', 'matchMedia', 'location', script.replace('<script>', ''))(
      { documentElement: d }, { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } }, {}, () => ({ matches: false }), { pathname });
    return attrs;
  };
  // (the Silinx interface, the default, is the Tasks one, #1149: a stored tasks, or anything but ise)
  const silinx = { 'data-ui': 'silinx', 'data-layout': 'tasks', 'data-theme': 'dark', 'data-drawer': 'open' };
  for (const ui of ['silinx', 'tasks', 'retro', null]) assert.deepEqual(run(ui), silinx, String(ui));
  assert.deepEqual(run('ise'), { 'data-ui': 'ise', 'data-theme': 'light', 'data-drawer': 'open' });
  // the site's development edition (dev/) reads its own keys (#1243): not the stable edition's
  const both = { 'silinx.ui': 'ise', 'silinx.theme': 'light', 'silinx.drawer': 'closed', 'silinx.dev.ui': 'silinx', 'silinx.dev.theme': 'dark' };
  assert.deepEqual(run(null, { pathname: '/Silinx-ISE/dev/', store: both }), silinx);
  assert.deepEqual(run(null, { pathname: '/Silinx-ISE/', store: both }), { 'data-ui': 'ise', 'data-theme': 'light', 'data-drawer': 'closed' });
  // #2451 a preference saved with an old id: shown with its new one and stored so, once (web/js/modern.js LEGACY_INTERFACES)
  const old = { 'silinx.ui': 'classic', 'silinx.dev.ui': 'modern', 'silinx.theme': 'dark', 'silinx.dev.theme': 'dark' };
  assert.deepEqual(run(null, { store: old }), { 'data-ui': 'ise', 'data-theme': 'light', 'data-drawer': 'open' });
  assert.deepEqual(run(null, { pathname: '/Silinx-ISE/dev/', store: old }), silinx);
  assert.deepEqual([old['silinx.ui'], old['silinx.dev.ui']], ['ise', 'silinx']);
  const kept = { 'silinx.ui': 'tasks', 'silinx.theme': 'dark' };
  assert.deepEqual(run(null, { store: kept }), silinx);
  assert.equal(kept['silinx.ui'], 'tasks', 'only the old ids rewritten');
});
