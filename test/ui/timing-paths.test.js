// UI (#3178): the Static Timing Report's Paths panel (web/js/timing-paths.js): the slowest paths of the Silinx toolchain's
// timing analysis beside the report (build/open/paths.json, made here by hand on the FPGA view's routed fixture), the
// selected path's stages as bars against the PERIOD; Show Path marks its source lines in their editors (the previous
// path's unmarked), Show in FPGA View lights its sites and draws its nets; a path with no source line says so in the
// console; From and To choose the worst paths between two registers; a path through a state diagram's module marks
// the diagram's elements; the panel folds (remembered) and, on
// a narrow window, goes over the report behind ☰ Paths; in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupUi, uiTest, makeProject, ROOT } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = `library ieee; use ieee.std_logic_1164.all;
entity top is port (clk, a : in std_logic; y : out std_logic); end top;
architecture rtl of top is
  signal q : std_logic;
begin
  u1: entity work.sub port map (clk => clk, a => a, q => q);
  y <= a or q;
end rtl;
`;
const SUB = `library ieee; use ieee.std_logic_1164.all;
entity sub is port (clk, a : in std_logic; q : out std_logic); end sub;
architecture rtl of sub is
  signal r : std_logic := '1';
begin
  process (clk) begin if rising_edge(clk) then r <= a and not r; end if; end process;
  q <= r;
end rtl;
`;
const st = (kind, inst, pin, site, delay, arrival, extra = {}) => ({ kind, inst, pin, site, delay, arrival, sources: [], ...extra });
const PATHS = { top: 'top', paths: [
  { clock: 'clk_BUFGP', port: 'clk', required: 2, delay: 2.5, period: 2.5, half: false, slack: -0.5, lines: [{ file: 'src/top.vhd', line: 7 }],
    stages: [st('clock-to-out', 'u1/q', 'XQ', 'SLICE_X1Y5', 0.6, 0.6, { sources: [{ file: 'src/top.vhd', line: 7, block: 'assign_7' }] }),
      st('net', 'y_and', 'F1', 'SLICE_X3Y4', 1.5, 2.1, { net: 'u1/q' }), st('setup', 'y_and', 'F1', 'SLICE_X3Y4', 0.4, 2.5)] },
  { clock: 'clk_BUFGP', port: 'clk', required: 2, delay: 1.9, period: 1.9, half: false, slack: 0.1, lines: [{ file: 'src/sub.vhd', line: 6 }],
    stages: [st('clock-to-out', 'u1/r', 'YQ', 'SLICE_X0Y4', 0.6, 0.6, { sources: [{ file: 'src/sub.vhd', line: 6, block: 'process_6' }] }),
      st('net', 'u1/q', 'F2', 'SLICE_X1Y5', 0.9, 1.5, { net: 'a_IBUF' }),
      st('setup', 'u1/q', 'F2', 'SLICE_X1Y5', 0.4, 1.9, { sources: [{ file: 'src/sub.vhd', line: 6, block: 'process_6' }] })] },
  { clock: 'clk_BUFGP', port: null, required: null, delay: 1.2, period: 1.2, half: false, slack: null, lines: [],
    stages: [st('clock-to-out', 'u1/r', 'XQ', 'SLICE_X0Y4', 0.6, 0.6), st('net', 'u1/r', 'BY', 'SLICE_X0Y4', 0.2, 0.8, { net: 'unused_net' }), st('setup', 'u1/r', 'BY', 'SLICE_X0Y4', 0.4, 1.2)] }] };

// the registers and the worst path of each pair (#3178's paths between two points): u1/r into u1/q, u1/q into y
PATHS.points = ['u1.q', 'u1.r', 'y_reg'];
PATHS.pairs = [{ ...PATHS.paths[0], from: 'u1.q', to: 'y_reg' }, { ...PATHS.paths[1], from: 'u1.r', to: 'u1.q' }];

async function timedProject(name) {
  await makeProject(env, { name, files: { 'src/top.vhd': TOP, 'src/sub.vhd': SUB }, top: 'top' });
  const build = path.join(env.server.workspace, name, 'build');
  await fs.mkdir(path.join(build, 'open'), { recursive: true });
  await fs.writeFile(path.join(build, 'top.ncd'), 'NCD');
  const old = new Date(Date.now() - 60000);
  await fs.utimes(path.join(build, 'top.ncd'), old, old);
  for (const f of ['top.xdl', 'device.xdlrc']) await fs.copyFile(path.join(ROOT, 'packages', 'silinx-fpga', 'test', 'fixtures', 'fpga', f), path.join(build, f));
  await fs.writeFile(path.join(build, 'open', 'timing.txt'), 'Static timing analysis of top (Silinx toolchain)\n\nclock clk_BUFGP: minimum period 2.500 ns (400.0 MHz)\n');
  await fs.writeFile(path.join(build, 'open', 'paths.json'), JSON.stringify(PATHS));
}
const R = '.doc:not([hidden]) .tp';
const openReport = async (page) => {
  await page.eval(() => window.SilinxApp.openFile('build/open/timing.txt'));
  await page.waitFor((r) => document.querySelector(`${r} .tp-row`), [R], { what: 'the Paths panel' });
};
const look = (page) => page.eval((r) => {
  const tp = document.querySelector(r), side = tp.querySelector('.tp-side'), shown = (e) => !!e && e.getClientRects().length > 0;
  const toggle = [...tp.closest('.doc').querySelectorAll('.editor-bar .btn')].find((b) => /☰/.test(b.textContent));
  return { cap: side.querySelector('.asm-cap').textContent, width: side.offsetWidth, shown: shown(side), over: getComputedStyle(side).position === 'absolute',
    folded: tp.classList.contains('props-folded'), toggle: shown(toggle) ? toggle.textContent : null,
    rows: [...side.querySelectorAll('.tp-row')].map((x) => [...x.cells].map((c) => c.textContent).join(' ') + (x.classList.contains('sel') ? ' *' : '') + (x.classList.contains('tp-fail') ? ' !' : '')),
    title: side.querySelector('.tp-detail h4')?.textContent, sums: [...side.querySelectorAll('.tp-sum')].map((x) => x.textContent),
    stages: [...side.querySelectorAll('.tp-stages tr')].map((x) => [...x.cells].map((c) => c.textContent).join(' | ')),
    segs: [...side.querySelectorAll('.tp-seg')].map((x) => `${x.classList[1]} ${Math.round(parseFloat(x.style.width))}`) };
}, R);
const marked = (page, file) => page.eval((f) => { const d = window.SilinxApp.findDoc(`file:${f}`); return d ? import('/js/editor.js').then((m) => m.markedLines(d.editor)) : null; }, file);

uiTest('#3178 the timing report\'s Paths panel: the paths, a path\'s stages against the PERIOD, Show Path in the HDL and the FPGA view; the console', E, async (page) => {
  await timedProject('PathsPj');
  await page.setViewport(1600, 800);
  await page.eval(async () => localStorage.removeItem((await import('/js/prefs.js')).prefKey('silinx.timing.paths.folded')));
  await page.openProject('PathsPj');
  await openReport(page);
  let L = await look(page);
  assert.deepEqual([L.cap, L.width, L.shown, L.over, L.folded, L.toggle], ['Paths', 330, true, false, false, null]);
  assert.deepEqual(await page.eval((r) => [...document.querySelector(`${r} .tp-list tr`).cells].map((c) => c.textContent), R), ['#', 'Slack', 'Delay', 'To']);
  assert.deepEqual(L.rows, ['1 -0.500 2.500 y_and * !', '2 0.100 1.900 u1/q', '3 — 1.200 u1/r']);
  assert.equal(L.title, 'Path 1');
  assert.deepEqual(L.sums, ['u1/q.XQ → y_and.F1', 'Delay 2.500 ns of 2.000 ns, slack -0.500 ns']);
  assert.deepEqual(L.stages, ['clock-to-out | 0.600 | u1/q.XQ top.vhd:7', 'net | 1.500 | u1/q', 'setup | 0.400 | y_and.F1']);
  // (past the PERIOD: the stages' shares of the delay, no slack)
  assert.deepEqual(L.segs, ['tp-clock-to-out 24', 'tp-net 60', 'tp-setup 16']);
  // path 2: met, its slack after the stages
  await page.click(`${R} .tp-row`, { text: '2' });
  L = await look(page);
  assert.equal(L.title, 'Path 2');
  assert.deepEqual(L.sums, ['u1/r.YQ → u1/q.F2', 'Delay 1.900 ns of 2.000 ns, slack 0.100 ns']);
  assert.deepEqual(L.segs, ['tp-clock-to-out 30', 'tp-net 45', 'tp-setup 20', 'tp-slack 5']);
  // Show Path: sub.vhd's process marked; then path 1's: top.vhd's assignment, sub.vhd's unmarked
  await page.click(`${R} .tp-actions .btn`, { text: 'Show Path' });
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/sub.vhd', [], { what: 'sub.vhd in front' });
  assert.deepEqual(await marked(page, 'src/sub.vhd'), [6]);
  await page.eval(() => window.SilinxApp.openFile('build/open/timing.txt'));
  await page.click(`${R} .tp-row`, { text: '1' });
  await page.click(`${R} .tp-actions .btn`, { text: 'Show Path' });
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd', [], { what: 'top.vhd in front' });
  assert.deepEqual(await marked(page, 'src/top.vhd'), [7]);
  assert.deepEqual(await marked(page, 'src/sub.vhd'), []);
  assert.equal(await page.eval(() => document.querySelectorAll('.doc:not([hidden]) .xl-path-line').length), 1);
  // Show in FPGA View: its two sites lit, its net drawn
  await page.eval(() => window.SilinxApp.openFile('build/open/timing.txt'));
  await page.click(`${R} .tp-actions .btn`, { text: 'Show in FPGA View' });
  await page.waitFor(() => window.Silinx.active?.id === 'fpgaview' && document.querySelectorAll('.doc:not([hidden]) .fv-on-path').length === 2, [], { what: 'the path on the chip' });
  assert.ok(await page.eval(() => document.querySelectorAll('.doc:not([hidden]) .fv-path line').length) >= 1);
  assert.match(await page.eval(() => document.querySelector('.doc:not([hidden]) .fv-info').textContent), /^Path: 2 site\(s\), 1 net\(s\)/);
  // a path whose logic has no source line: said in the console, nothing marked
  await page.eval(() => window.SilinxApp.openFile('build/open/timing.txt'));
  await page.click(`${R} .tp-row`, { text: '3' });
  L = await look(page);
  assert.deepEqual(L.sums, ['u1/r.XQ → u1/r.BY', 'Delay 1.200 ns, no PERIOD constraint']);
  await page.click(`${R} .tp-actions .btn`, { text: 'Show Path' });
  await page.waitFor(() => /The logic of the path to u1\/r\.BY could not be traced back to its source lines\./.test(window.__console()), [], { what: 'the console\'s line' });
  assert.deepEqual(await marked(page, 'src/top.vhd'), []);
});

uiTest('#3178 the Paths panel: folded to a strip and remembered, over the report from ☰ Paths on a narrow window; Portuguese', E, async (page) => {
  await timedProject('PathsFold');
  await page.setViewport(1366, 768);
  await page.eval(async () => {
    const [{ prefKey }] = await Promise.all([import('/js/prefs.js')]);
    localStorage.removeItem(prefKey('silinx.timing.paths.folded')); localStorage.removeItem(prefKey('silinx.narrow.paths'));
  });
  await page.openProject('PathsFold');
  await openReport(page);
  const wide = await page.eval((r) => document.querySelector(`${r} .editor-host`).offsetWidth, R);
  await page.click(`${R} .tp-side .asm-fold`);
  let L = await look(page);
  assert.deepEqual([L.folded, L.width], [true, 24]);
  assert.ok(await page.eval((r) => document.querySelector(`${r} .editor-host`).offsetWidth, R) > wide, 'the report wider');
  // remembered: opened again (and after a reload) still folded; a click on the strip expands it
  await page.eval(() => window.SilinxApp.closeDoc(window.SilinxApp.findDoc('file:build/open/timing.txt')));
  await openReport(page);
  assert.equal((await look(page)).folded, true);
  await page.reload();
  await page.openProject('PathsFold');
  await openReport(page);
  assert.equal((await look(page)).folded, true, 'kept over a reload');
  await page.click(`${R} .tp-side`);
  assert.deepEqual([(await look(page)).folded, (await look(page)).width], [false, 330]);
  // a narrow window: hidden, ☰ Paths shows it over the report
  await page.setViewport(900, 700);
  await page.eval(async () => (await import('/js/narrow.js')).setDrawer(false, { remember: false }));
  await page.waitFor((r) => !document.querySelector(`${r} .tp-side`).getClientRects().length, [R], { what: 'the panel hidden' });
  L = await look(page);
  assert.deepEqual([L.shown, L.toggle], [false, '☰ Paths']);
  await page.click('.doc:not([hidden]) .editor-bar .btn', { text: '☰ Paths' });
  L = await look(page);
  assert.ok(L.shown && L.over, JSON.stringify(L));
  // in Portuguese: nothing untranslated in the panel
  await page.setViewport(1366, 768);
  const en = await page.eval(`${TEXTS}; window.__uiTexts(document.querySelector('${R} .tp-side'))`);
  await page.eval(() => import('/js/i18n.js').then((m) => m.setLanguage('pt')));
  await page.waitFor(() => document.documentElement.lang === 'pt');
  L = await look(page);
  assert.equal(L.cap, 'Caminhos');
  assert.equal(L.title, 'Caminho 1');
  assert.deepEqual(L.sums.slice(1), ['Atraso 2.500 ns de 2.000 ns, folga -0.500 ns']);
  assert.deepEqual(L.stages.map((s) => s.split(' | ')[0]), ['relógio-saída', 'rede', 'setup']);
  const pt = await page.eval(`window.__uiTexts(document.querySelector('${R} .tp-side'))`);
  assert.deepEqual(untranslated(en, pt, [/^@?(#|setup)$/, /^@?setup [\d.]+ ns$/]), []);
  assert.ok(await page.eval((r) => [...document.querySelectorAll(`${r} .tp-actions .btn`)].map((b) => b.textContent).join(',') === 'Mostrar Caminho,Mostrar na Vista da FPGA', R));
});

// a path through a module generated from a state diagram (the traffic example's): the diagram opened in front of its
// HDL, its states (the path starts in the state register) and the transitions that read `night` marked, as
// core/path-drawing.js finds them, kept over a redraw; the next path's Show Path takes them off
const TRAFFIC = path.join(ROOT, 'examples', 'traffic', 'src');
const FSM_PATHS = { top: 'traffic', paths: [
  { clock: 'clk_BUFGP', port: 'clk', required: 20, delay: 3.1, period: 3.1, half: false, slack: 16.9, lines: [{ file: 'src/traffic.vhd', line: 77 }, { file: 'src/traffic.vhd', line: 89 }],
    stages: [st('clock-to-out', 'u_s', 'XQ', 'SLICE_X1Y5', 0.6, 0.6, { sources: [{ file: 'src/traffic.vhd', line: 77, block: 'state_register' }], signals: ['state_reg'] }),
      st('net', 'u_n', 'F1', 'SLICE_X2Y5', 0.8, 1.4, { net: 'night' }),
      st('logic', 'u_n', 'X', 'SLICE_X2Y5', 0.7, 2.1, { sources: [{ file: 'src/traffic.vhd', line: 89, block: 'next_state_logic' }], signals: ['state_next'] }),
      st('net', 'u_s', 'BX', 'SLICE_X1Y5', 0.6, 2.7, { net: 'state_next[0]' }),
      st('setup', 'u_s', 'BX', 'SLICE_X1Y5', 0.4, 3.1, { sources: [{ file: 'src/traffic.vhd', line: 77, block: 'state_register' }], signals: ['state_reg'] })] },
  { clock: 'clk_BUFGP', port: 'clk', required: 20, delay: 1.2, period: 1.2, half: false, slack: 18.8, lines: [],
    stages: [st('clock-to-out', 'u_r', 'XQ', 'SLICE_X0Y4', 0.6, 0.6), st('net', 'u_r', 'BY', 'SLICE_X0Y4', 0.2, 0.8, { net: 'n9' }), st('setup', 'u_r', 'BY', 'SLICE_X0Y4', 0.4, 1.2)] }] };

uiTest('#3178 Show Path in a state diagram: its states and the transitions on the path marked, kept over a redraw, cleared by the next path', E, async (page) => {
  const fsm = await fs.readFile(path.join(TRAFFIC, 'traffic.fsm.json'), 'utf8');
  await makeProject(env, { name: 'PathsFsm', files: { 'src/traffic.fsm.json': fsm, 'src/traffic.vhd': await fs.readFile(path.join(TRAFFIC, 'traffic.vhd'), 'utf8') }, top: 'traffic' });
  const build = path.join(env.server.workspace, 'PathsFsm', 'build');
  await fs.mkdir(path.join(build, 'open'), { recursive: true });
  await fs.writeFile(path.join(build, 'open', 'timing.txt'), 'Static timing analysis of traffic (Silinx toolchain)\n\nclock clk_BUFGP: minimum period 3.100 ns (322.6 MHz)\n');
  await fs.writeFile(path.join(build, 'open', 'paths.json'), JSON.stringify(FSM_PATHS));
  const { drawingPath, pathNames } = await import('../../core/path-drawing.js');
  const want = drawingPath('fsm', JSON.parse(fsm), pathNames(FSM_PATHS.paths[0], 'src/traffic.vhd'));
  assert.deepEqual(want.filter((x) => x.type === 'trans').map((x) => x.label), ['CARS -> NIGHT (night)', 'CARS -> CARS_YELLOW (!night && req && done)', 'NIGHT -> CARS (!night)']);
  assert.equal(want.filter((x) => x.type === 'state').length, 7);
  await page.setViewport(1600, 800);
  await page.openProject('PathsFsm');
  await openReport(page);
  await page.click(`${R} .tp-actions .btn`, { text: 'Show Path' });
  await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/traffic.fsm.json' && document.querySelectorAll('.doc:not([hidden]) .on-path').length, [], { what: 'the state diagram in front, marked' });
  const onPath = () => page.eval(() => {
    const el = document.querySelector('.doc:not([hidden])');
    return { states: [...el.querySelectorAll('.fsm-state.on-path')].map((x) => x.dataset.state), trans: [...el.querySelectorAll('.fsm-edge.on-path')].map((x) => x.dataset.trans) };
  });
  const ids = (t) => want.filter((x) => x.type === t).map((x) => x.id).sort();
  let on = await onPath();
  assert.deepEqual([on.states.sort(), on.trans.sort()], [ids('state'), ids('trans')]);
  // its HDL's two processes marked too, behind it
  assert.deepEqual(await marked(page, 'src/traffic.vhd'), [77, 89]);
  // drawn again (a selection): still marked
  await page.eval(() => { const ed = window.SilinxApp.findDoc('fsm:src/traffic.fsm.json').fsmEditor; ed.setModel(ed.getModel()); });
  on = await onPath();
  assert.deepEqual([on.states.sort(), on.trans.sort()], [ids('state'), ids('trans')]);
  // the next path (no source line): the diagram's marks taken off
  await page.eval(() => window.SilinxApp.openFile('build/open/timing.txt'));
  await page.click(`${R} .tp-row`, { text: '2' });
  await page.click(`${R} .tp-actions .btn`, { text: 'Show Path' });
  await page.waitFor(() => /The logic of the path to u_r\.BY could not be traced back to its source lines\./.test(window.__console()), [], { what: 'the console\'s line' });
  assert.equal(await page.eval(() => window.SilinxApp.findDoc('fsm:src/traffic.fsm.json').el.querySelectorAll('.on-path').length), 0);
  assert.deepEqual(await marked(page, 'src/traffic.vhd'), []);
});

uiTest('#3178 the Paths panel between two registers: From and To choose the pairs\' paths, Show Path on one; none between two', E, async (page) => {
  await timedProject('PathsBetween');
  await page.setViewport(1600, 800);
  await page.openProject('PathsBetween');
  await openReport(page);
  const picks = () => page.eval((r) => [...document.querySelectorAll(`${r} .tp-pick`)].map((x) => [x.title, [...x.options].map((o) => o.textContent).join(',')]), R);
  assert.deepEqual(await picks(), [['The register the paths start from', 'Any register,u1.q,u1.r,y_reg'], ['The register the paths end in', 'Any register,u1.q,u1.r,y_reg']]);
  const choose = (i, v) => page.eval((r, i, v) => { const s = document.querySelectorAll(`${r} .tp-pick`)[i]; s.value = v; s.dispatchEvent(new Event('change')); }, R, i, v);
  // from u1.r: its one pair, into u1.q (the slowest list's path 2)
  await choose(0, 'u1.r');
  let L = await look(page);
  assert.deepEqual(L.rows, ['1 0.100 1.900 u1/q *']);
  assert.deepEqual(L.sums, ['u1/r.YQ → u1/q.F2', 'Delay 1.900 ns of 2.000 ns, slack 0.100 ns']);
  await page.click(`${R} .tp-actions .btn`, { text: 'Show Path' });
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/sub.vhd', [], { what: 'sub.vhd in front' });
  assert.deepEqual(await marked(page, 'src/sub.vhd'), [6]);
  // to u1.r: none reaches it
  await page.eval(() => window.SilinxApp.openFile('build/open/timing.txt'));
  await choose(0, ''); await choose(1, 'u1.r');
  assert.equal(await page.eval((r) => document.querySelector(`${r} .tp-list`).hidden, R), true);
  assert.equal(await page.eval((r) => document.querySelector(`${r} .tp-none`).textContent, R), 'No path between these registers.');
  // any to any: the slowest paths again
  await choose(1, '');
  assert.equal((await look(page)).rows.length, 3);
});

// ISE's report (#3178): its Paths panel beside build/<top>.twr, trce's paths (blinky's, ISE 14.7's: test/fixtures/trce)
// back to the project's HDL by XST's names; Show Path marks the prescaler's always block
uiTest('#3178 the Paths panel beside ISE\'s timing report: trce\'s paths, Show Path in the HDL back through XST\'s names', E, async (page) => {
  const dir = path.join(ROOT, 'examples', 'blinky'), pj = JSON.parse(await fs.readFile(path.join(dir, 'silinx.json'), 'utf8'));
  const files = {};
  for (const f of pj.files.filter((x) => /\.(vhd|v)$/.test(x.path))) files[f.path] = await fs.readFile(path.join(dir, f.path), 'utf8');
  await makeProject(env, { name: 'PathsIse', files, top: pj.top });
  const build = path.join(env.server.workspace, 'PathsIse', 'build');
  await fs.mkdir(build, { recursive: true });
  const twr = await fs.readFile(path.join(ROOT, 'test', 'fixtures', 'trce', 'blinky-ise-paths.twr.txt'), 'utf8');
  await fs.writeFile(path.join(build, `${pj.top}.twr`), twr);
  await page.setViewport(1600, 800);
  await page.openProject('PathsIse');
  await page.eval((f) => window.SilinxApp.openFile(f), `build/${pj.top}.twr`);
  await page.waitFor((r) => document.querySelector(`${r} .tp-row`), [R], { what: 'ISE\'s Paths panel' });
  const L = await look(page);
  assert.equal(L.rows.length, 20);
  assert.equal(L.rows[0].split(' ')[2], /Minimum period is +([\d.]+)ns/.exec(twr)[1]);
  assert.equal(await page.eval((r) => document.querySelectorAll(`${r} .tp-pick`).length, R), 0, 'no registers to choose: the Silinx toolchain\'s');
  // Show Path on the slowest: its lines marked, as core/twr-paths.js gives them here (each file its lines)
  const { iseTimingPaths } = await import('../../core/twr-paths.js');
  const want = {};
  for (const l of iseTimingPaths(twr, Object.entries(files).map(([p, text]) => ({ path: p, lang: /\.v$/.test(p) ? 'verilog' : 'vhdl', text })), pj.top).paths[0].lines) (want[l.file] ||= []).push(l.line);
  assert.ok(Object.keys(want).length);
  await page.click(`${R} .tp-actions .btn`, { text: 'Show Path' });
  await page.waitFor((f) => window.Silinx.active?.id === `file:${f}`, [Object.keys(want)[0]], { what: 'the first file in front' });
  for (const [f, l] of Object.entries(want)) assert.deepEqual(await marked(page, f), l.sort((a, b) => a - b), f);
});

// Vivado's report (#3178): its Paths panel beside build/<top>_timing.rpt, report_timing_summary's paths (blinky's,
// Vivado 2025.2's: test/fixtures/vivado) back to the project's HDL by Vivado's names; Show Path marks their lines
uiTest('#3178 the Paths panel beside Vivado\'s timing summary: its paths, Show Path in the HDL back through Vivado\'s names', E, async (page) => {
  const dir = path.join(ROOT, 'examples', 'blinky'), pj = JSON.parse(await fs.readFile(path.join(dir, 'silinx.json'), 'utf8'));
  const files = {};
  for (const f of pj.files.filter((x) => /\.(vhd|v)$/.test(x.path))) files[f.path] = await fs.readFile(path.join(dir, f.path), 'utf8');
  await makeProject(env, { name: 'PathsVivado', files, top: pj.top });
  const build = path.join(env.server.workspace, 'PathsVivado', 'build');
  await fs.mkdir(build, { recursive: true });
  const rpt = await fs.readFile(path.join(ROOT, 'test', 'fixtures', 'vivado', 'blinky-timing.rpt.txt'), 'utf8');
  await fs.writeFile(path.join(build, `${pj.top}_timing.rpt`), rpt);
  await page.setViewport(1600, 800);
  await page.openProject('PathsVivado');
  await page.eval((f) => window.SilinxApp.openFile(f), `build/${pj.top}_timing.rpt`);
  await page.waitFor((r) => document.querySelector(`${r} .tp-row`), [R], { what: 'Vivado\'s Paths panel' });
  const { vivadoTimingPaths } = await import('../../core/vivado-paths.js');
  const r = vivadoTimingPaths(rpt, Object.entries(files).map(([p, text]) => ({ path: p, lang: /\.v$/.test(p) ? 'verilog' : 'vhdl', text })), pj.top);
  const L = await look(page);
  assert.equal(L.rows.length, r.paths.length);
  assert.deepEqual(L.sums.slice(1), [`Delay ${r.paths[0].delay.toFixed(3)} ns of 10.000 ns, slack 5.071 ns`]);
  const want = {};
  for (const l of r.paths[0].lines) (want[l.file] ||= []).push(l.line);
  assert.deepEqual(await page.eval((r) => [...document.querySelectorAll(`${r} .tp-actions .btn`)].map((b) => b.textContent), R), ['Show Path'], 'no FPGA view of a 7-series device');
  await page.click(`${R} .tp-actions .btn`, { text: 'Show Path' });
  await page.waitFor((f) => window.Silinx.docs.some((d) => d.path === f), [Object.keys(want)[0]], { what: 'the path\'s files open' });
  for (const [f, l] of Object.entries(want)) assert.deepEqual(await marked(page, f), l.sort((a, b) => a - b), f);
});
