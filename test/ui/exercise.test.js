// UI: a graded exercise (#3192, web/js/exercise-view.js). Project ▸ Exercise… opens the project's exercise (the
// shipped counter4, its files beside it), as a document:
// - its statement, ports and tests;
// - Run Visible Tests, then the ⋮ menu's Run All Tests, on a wrong design and then on a right one: the verdicts, the
//   points and the console's report;
// - the teacher's edits in the Properties panel, saved (the points, a test added and deleted, the ports from the top);
// - the panel folded (remembered), over the page behind ☰ Properties on a narrow window;
// - in Portuguese;
// - a project with no exercise: New Exercise makes one from its top;
// - a teacher's exercise authored from the project (#3831): Reference from the Project, then Expected from the Reference
//   filling a vectors test's outputs, then graded; in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject, readWs, writeWs, ROOT } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const D = '.doc:not([hidden]) .ex';
const EX = path.join(ROOT, 'exercises/counter4');
const read = (f) => fs.readFileSync(path.join(EX, f), 'utf8');
const RIGHT = read('ref/counter4.vhd');
const NO_ENABLE = RIGHT.replace("elsif en = '1' then", 'else');

uiTest('#3192 an exercise: run its visible tests and all of them on a wrong design and a right one; edited by the teacher in its Properties; the panel folded and on a narrow window; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'cnt', board: 'basys2', top: 'counter4',
    files: { 'src/counter4.vhd': NO_ENABLE, 'counter4.exercise.json': read('counter4.exercise.json'), 'tests/count.vec': read('tests/count.vec'), 'ref/counter4.vhd': RIGHT, 'tb/tb_counter4.vhd': read('tb/tb_counter4.vhd') } });
  // (the teacher's reference and test bench beside the exercise: files of the folder, not sources of the project)
  const pj = await env.server.api('GET', '/api/projects/cnt');
  delete pj.fileTree;
  pj.files = pj.files.filter((f) => f.path === 'src/counter4.vhd');
  await env.server.api('PUT', '/api/projects/cnt', pj);
  await page.setViewport(1366, 768);
  await page.eval(async () => {
    const [{ prefKey }, { PROPS_KEY }] = await Promise.all([import('/js/prefs.js'), import('/js/exercise-view.js')]);
    localStorage.removeItem(prefKey('silinx.exercise.props.folded')); localStorage.removeItem(PROPS_KEY);
  });
  await page.openProject('cnt');
  const open = async () => {
    await page.menu('Project', 'Exercise…');
    await page.waitFor((d) => window.Silinx.active?.id === 'exercise:counter4.exercise.json' && document.querySelector(d)?.dataset.ready === '1', [D], { what: 'the exercise' });
  };
  const look = () => page.eval((d) => {
    const ex = document.querySelector(d), side = ex.querySelector('.ex-side'), shown = (e) => !!e && e.getClientRects().length > 0;
    return {
      tab: window.Silinx.active.tab.querySelector('.tlabel').textContent,
      buttons: [...ex.querySelectorAll('.ex-bar .asm-btn:not(.tb-more-btn)')].filter((b) => shown(b) && !b.closest('.tb-more-menu')).map((b) => `${b.textContent}${b.disabled ? ' (off)' : ''}`),
      title: ex.querySelector('.ex-title').textContent, statement: ex.querySelector('.ex-statement').textContent.slice(0, 30),
      ports: [...ex.querySelectorAll('.ex-ports tr')].map((r) => [...r.children].map((c) => c.textContent).join(' ')),
      tests: [...ex.querySelectorAll('.ex-tests tr')].map((r) => [...r.children].map((c) => c.textContent).join(' | ')),
      status: [...ex.querySelectorAll('.doc-status .ds-f')].map((f) => f.textContent).join(' · '),
      cap: side.querySelector('.asm-cap').textContent, shown: shown(side), over: getComputedStyle(side).position === 'absolute', folded: ex.classList.contains('props-folded'), width: side.offsetWidth,
    };
  }, D);
  const runTests = async (all) => {
    const before = await page.eval(() => window.__console().length);
    if (all) { await page.click(`${D} .ex-bar .tb-more-btn`); await page.click(`${D} .ex-bar .tb-more-menu .asm-btn`, { text: 'Run All Tests' }); }
    else await page.click(`${D} .ex-bar .asm-btn`, { text: 'Run Visible Tests' });
    await page.waitFor((n) => /Process "Run (Visible|All) Tests" (completed|failed)/.test(window.__console().slice(n)), [before], { what: 'the tests run', timeout: 60000 });
    return page.eval((n) => window.__console().slice(n), before);
  };

  await open();
  let L = await look();
  assert.deepEqual({ tab: L.tab, buttons: L.buttons, title: L.title, statement: L.statement, cap: L.cap, status: L.status },
    { tab: 'counter4.exercise.json', buttons: ['Add Test', 'Delete Test', 'Run Visible Tests'], title: '4-bit counter with enable', statement: 'Make counter4, a 4-bit binary ', cap: 'Properties', status: '4 test(s), 2 visible · 100 points' });
  assert.deepEqual(L.ports, ['Port Direction Width', 'clk in 1', 'rst in 1', 'en in 1', 'q out 4']);
  assert.deepEqual(L.tests, ['Test | Kind | Shown | Points | Verdict', 'Counting and the reset | vectors | visible | 30 | ', 'Random inputs against the reference | reference | hidden | 40 | ',
    'The wrap and the reset while counting | testbench | hidden | 20 | ', 'Synthesis: no latch, at most 4 flip-flops | synthesis | visible | 10 | ']);
  assert.deepEqual([L.shown, L.over, L.folded], [true, false, false]);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);

  // the wrong design (en not read): the visible tests, its first difference in the console; the synthesis test run too (#3216)
  let out = await runTests(false);
  assert.match(out, /Started : "Run Visible Tests" \(counter4\.exercise\.json\)\./);
  assert.match(out, /cnt: 10 \/ 40 points \(Wrong Answer\), the visible tests\n {2}WARNING: "src\/counter4\.vhd" Line 10: Input <en> is never used\.\n {2}- count \(Counting and the reset\): WA Wrong Answer, 0 \/ 30\n {6}cycle 4 \(vectors line 7\): q is 0100, expected 0011\n/);
  assert.match(out, / {2}\+ impl \(Synthesis: no latch, at most 4 flip-flops\): AC Accepted, 10 \/ 10\nProcess "Run Visible Tests" completed: 10 \/ 40 points\./);
  L = await look();
  assert.deepEqual([L.tests[1], L.tests[4], L.status], ['Counting and the reset | vectors | visible | 0 / 30 | WA', 'Synthesis: no latch, at most 4 flip-flops | synthesis | visible | 10 / 10 | AC', '4 test(s), 2 visible · 10 / 40 points']);
  // the right design: the visible test Accepted; then all of them, the hidden ones too
  await writeWs(env, 'cnt', 'src/counter4.vhd', RIGHT);
  out = await runTests(false);
  assert.match(out, /Process "Run Visible Tests" completed: 40 \/ 40 points\./);
  assert.doesNotMatch(out, /WARNING/);
  out = await runTests(true);
  assert.match(out, /cnt: 100 \/ 100 points \(Accepted\)\n {2}\+ count \(Counting and the reset\): AC Accepted, 30 \/ 30\n {2}\+ random \(Random inputs against the reference\): AC Accepted, 40 \/ 40 \[hidden\]\n {2}\+ bench \(The wrap and the reset while counting\): AC Accepted, 20 \/ 20 \[hidden\]\n {2}\+ impl \(Synthesis: no latch, at most 4 flip-flops\): AC Accepted, 10 \/ 10\n/);
  L = await look();
  assert.deepEqual(L.tests.slice(1).map((r) => r.split(' | ').slice(3).join(' | ')), ['30 / 30 | AC', '40 / 40 | AC', '20 / 20 | AC', '10 / 10 | AC']);
  assert.equal(L.status, '4 test(s), 2 visible · 100 / 100 points');
  // the synthesis test past its limit: Resource / Timing Limit, the numbers said (the teacher's edit, then back)
  await page.click(`${D} .ex-test`, { index: 3 });
  await page.fill(`${D} [data-prop="test-ffs"]`, '2');
  await page.waitFor(() => !window.Silinx.active.dirty, [], { what: 'saved' });
  out = await runTests(false);
  assert.match(out, / {2}- impl \(Synthesis: no latch, at most 4 flip-flops\): RL Resource \/ Timing Limit, 0 \/ 10\n {6}4 flip-flops, at most 2\nProcess "Run Visible Tests" completed: 30 \/ 40 points\./);
  await page.fill(`${D} [data-prop="test-ffs"]`, '4');
  await page.waitFor(() => !window.Silinx.active.dirty, [], { what: 'saved' });

  // the teacher's edits: the selected test's points (saved), a test added then deleted, the ports from the top
  await page.click(`${D} .ex-test`, { index: 0 });
  assert.equal(await page.eval((d) => document.querySelector(`${d} [data-prop="test-id"]`).value, D), 'count');
  await page.fill(`${D} [data-prop="test-points"]`, '35');
  await page.waitFor(() => !window.Silinx.active.dirty, [], { what: 'saved' });
  assert.equal(JSON.parse(await readWs(env, 'cnt', 'counter4.exercise.json')).tests[0].points, 35);
  assert.equal((await look()).status, '4 test(s), 2 visible · 105 points');
  await page.click(`${D} .ex-bar .asm-btn`, { text: 'Add Test' });
  L = await look();
  assert.deepEqual([L.tests.length, L.tests[5], L.status], [6, 'test5 | vectors | visible | 10 | ', '5 test(s), 3 visible · 115 points']);
  assert.equal(await page.eval((d) => document.querySelector(`${d} [data-prop="test-vectors"]`).value, D), 'rst en | q\n');
  await page.click(`${D} .ex-bar .asm-btn`, { text: 'Delete Test' });
  await page.waitFor(() => !window.Silinx.active.dirty, [], { what: 'saved' });
  assert.deepEqual(JSON.parse(await readWs(env, 'cnt', 'counter4.exercise.json')).tests.map((x) => x.id), ['count', 'random', 'bench', 'impl']);
  await page.click(`${D} .ex-bar .tb-more-btn`);
  await page.click(`${D} .ex-bar .tb-more-menu .asm-btn`, { text: 'Ports from the Top' });
  await page.waitConsole(/counter4\.exercise\.json: the top counter4, clk \(in, 1\), rst \(in, 1\), en \(in, 1\), q \(out, 4\)/);

  // the Properties panel folded to a strip, remembered; a click on the strip expands it
  const width = (await look()).width;
  await page.click(`${D} .ex-side .asm-fold`);
  L = await look();
  assert.deepEqual([L.folded, L.width], [true, 24]);
  await page.eval(() => window.SilinxApp.closeDoc(window.SilinxApp.findDoc('exercise:counter4.exercise.json'), { force: true }));
  await open();
  assert.deepEqual([(await look()).folded, (await look()).width], [true, 24], 'remembered');
  await page.click(`${D} .ex-side`);
  assert.deepEqual([(await look()).folded, (await look()).width], [false, width]);
  // a narrow window: the panel hidden, ☰ Properties shows it over the page
  await page.setViewport(900, 700);
  await page.eval(async () => (await import('/js/narrow.js')).setDrawer(false, { remember: false }));
  await page.waitFor((d) => !document.querySelector(`${d} .ex-side`).getClientRects().length, [D], { what: 'the panel hidden' });
  assert.equal((await look()).buttons.at(-1), '☰ Properties');
  await page.click(`${D} .ex-bar .asm-btn`, { text: '☰ Properties' });
  L = await look();
  assert.ok(L.shown && L.over, JSON.stringify(L));

  // in Portuguese: the interface's labels, the exercise's own texts in its Portuguese
  await page.eval(() => import('/js/i18n.js').then((m) => m.setLanguage('pt')));
  await page.waitFor(() => document.documentElement.lang === 'pt');
  L = await look();
  assert.deepEqual({ buttons: L.buttons, title: L.title, statement: L.statement, cap: L.cap, status: L.status, ports: L.ports[0], tests: L.tests[0], row: L.tests[2] },
    { buttons: ['Adicionar Teste', 'Apagar Teste', 'Executar os Testes Visíveis', '☰ Propriedades'], title: 'Contador de 4 bits com enable', statement: 'Faça o counter4, um contador b',
      cap: 'Propriedades', status: '4 teste(s), 2 visíveis · 105 pontos', ports: 'Porto Direção Largura', tests: 'Teste | Tipo | Mostrado | Pontos | Veredicto', row: 'Entradas aleatórias contra a referência | reference | escondido | 40 | ' });
  await page.eval(() => import('/js/i18n.js').then((m) => m.setLanguage('en')));
  await page.waitFor(() => document.documentElement.lang === 'en');
  await page.setViewport(1366, 768);
  assert.doesNotMatch(await page.consoleText(), /ERROR/);
}, { timeout: 240000 });

uiTest('#3192 New Exercise: a project with no exercise gets one of its top, its ports and a first visible test', E, async (page) => {
  await makeProject(env, { name: 'fresh', board: 'basys2', top: 'counter4', files: { 'src/counter4.vhd': RIGHT } });
  await page.openProject('fresh');
  await page.menu('Project', 'Exercise…');
  await page.waitDialog('Exercise');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .ex-list').textContent), /This project has no exercise\. A new one is made from its top module\./);
  await page.dialogButton('New Exercise');
  await page.waitFor((d) => window.Silinx.active?.id === 'exercise:counter4.exercise.json' && document.querySelector(d)?.dataset.ready === '1', [D], { what: 'the new exercise' });
  const ex = JSON.parse(await readWs(env, 'fresh', 'counter4.exercise.json'));
  assert.deepEqual({ id: ex.id, top: ex.top, ports: ex.ports.map((p) => `${p.name} ${p.dir} ${p.width}`), tests: ex.tests },
    { id: 'counter4', top: 'counter4', ports: ['clk in 1', 'rst in 1', 'en in 1', 'q out 4'],
      tests: [{ id: 'vectors', title: { en: 'Vectors', pt: 'Vetores' }, visible: true, points: 10, kind: 'vectors', clock: 'clk', vectors: 'rst en | q\n' }] });
  await page.waitConsole(/counter4\.exercise\.json: a new exercise of counter4, its ports from the top and a first visible test\./);
  // (a test with no row yet: its problem said when the tests run, as an error of the console)
  await page.click(`${D} .ex-bar .asm-btn`, { text: 'Run Visible Tests' });
  await page.waitConsole(/ERROR: counter4\.exercise\.json: test 1: the vectors have no row[^]*Process "Run Tests" failed: the exercise has problems\./);
}, { timeout: 120000 });

uiTest('#3217 an equivalence test: the design proved equivalent to the reference in the page\'s Yosys, a wrong one\'s first difference; its depth in the Properties', E, async (page) => {
  const ex = JSON.parse(read('counter4.exercise.json'));
  ex.tests = [{ id: 'same', title: 'Equivalent to the reference', visible: true, points: 20, kind: 'equivalence', depth: 12 }];
  await makeProject(env, { name: 'eqv', board: 'basys2', top: 'counter4', files: { 'src/counter4.vhd': NO_ENABLE, 'counter4.exercise.json': JSON.stringify(ex, null, 2), 'ref/counter4.vhd': RIGHT } });
  const pj = await env.server.api('GET', '/api/projects/eqv');
  delete pj.fileTree;
  pj.files = pj.files.filter((f) => f.path === 'src/counter4.vhd');
  await env.server.api('PUT', '/api/projects/eqv', pj);
  await page.openProject('eqv');
  await page.menu('Project', 'Exercise…');
  await page.waitFor((d) => window.Silinx.active?.id === 'exercise:counter4.exercise.json' && document.querySelector(d)?.dataset.ready === '1', [D], { what: 'the exercise' });
  await page.click(`${D} .ex-test`, { index: 0 });
  assert.equal(await page.eval((d) => document.querySelector(`${d} [data-prop="test-depth"]`).value, D), '12');
  const runVisible = async () => {
    const before = await page.eval(() => window.__console().length);
    await page.click(`${D} .ex-bar .asm-btn`, { text: 'Run Visible Tests' });
    await page.waitFor((n) => /Process "Run Visible Tests" (completed|failed)/.test(window.__console().slice(n)), [before], { what: 'the tests run', timeout: 60000 });
    return page.eval((n) => window.__console().slice(n), before);
  };
  let out = await runVisible();
  assert.match(out, /eqv: 0 \/ 20 points \(Wrong Answer\), the visible tests\n {2}WARNING: "src\/counter4\.vhd" Line 10: Input <en> is never used\.\n {2}- same \(Equivalent to the reference\): WA Wrong Answer, 0 \/ 20\n {6}cycle 2: q is 0001, expected 0000\n {6}the inputs, cycle by cycle: 1: rst=0 en=0; 2: rst=1 en=0\nProcess "Run Visible Tests" completed: 0 \/ 20 points\./, out);
  await writeWs(env, 'eqv', 'src/counter4.vhd', RIGHT);
  out = await runVisible();
  assert.match(out, /eqv: 20 \/ 20 points \(Accepted\), the visible tests\n {2}\+ same \(Equivalent to the reference\): AC Accepted, 20 \/ 20\n {6}equivalent to the reference for every input sequence \(proved by induction over 1 clock cycle\(s\)\)\nProcess "Run Visible Tests" completed: 20 \/ 20 points\./, out);
  assert.doesNotMatch(out, /WARNING|ERROR/);
}, { timeout: 120000 });

uiTest('#3831 an exercise authored from the project: Reference from the Project, Expected from the Reference filling the rows written, then graded; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'author', board: 'basys2', top: 'counter4', files: { 'src/counter4.vhd': RIGHT } });
  await page.openProject('author');
  await page.menu('Project', 'Exercise…');
  await page.waitDialog('Exercise');
  await page.dialogButton('New Exercise');
  await page.waitFor((d) => window.Silinx.active?.id === 'exercise:counter4.exercise.json' && document.querySelector(d)?.dataset.ready === '1', [D], { what: 'the new exercise' });
  const menu = async (text) => { await page.click(`${D} .ex-bar .tb-more-btn`); await page.click(`${D} .ex-bar .tb-more-menu .asm-btn`, { text }); };
  const vectors = () => page.eval((d) => document.querySelector(`${d} [data-prop="test-vectors"]`).value, D);
  // the teacher writes the rows' inputs only
  await page.click(`${D} .ex-test`, { index: 0 });
  await page.fill(`${D} [data-prop="test-vectors"]`, 'rst en | q\n1 0\n0 1\n0 1\n0 0\n0 1\n');
  await page.waitFor(() => !window.Silinx.active.dirty, [], { what: 'saved' });
  // (no reference yet: said in the console)
  await menu('Expected from the Reference');
  await page.waitConsole(/ERROR: test vectors: the exercise has no reference design \(Reference from the Project makes it of the project's\)/);
  await menu('Reference from the Project');
  await page.waitConsole(/counter4\.exercise\.json: the reference, the project's design: src\/counter4\.vhd/);
  await page.waitFor(() => !window.Silinx.active.dirty, [], { what: 'saved' });
  assert.deepEqual(JSON.parse(await readWs(env, 'author', 'counter4.exercise.json')).reference, { files: [{ path: 'src/counter4.vhd', file: 'src/counter4.vhd' }] });
  await menu('Expected from the Reference');
  await page.waitConsole(/counter4\.exercise\.json: test vectors, the expected outputs of its 5 row\(s\) from the reference\./);
  assert.equal(await vectors(), 'rst en | q\n1 0 | 0\n0 1 | 1\n0 1 | 2\n0 0 | 2\n0 1 | 3\n');
  await page.waitFor(() => !window.Silinx.active.dirty, [], { what: 'saved' });
  assert.equal(JSON.parse(await readWs(env, 'author', 'counter4.exercise.json')).tests[0].vectors, 'rst en | q\n1 0 | 0\n0 1 | 1\n0 1 | 2\n0 0 | 2\n0 1 | 3\n');
  // the exercise graded on the project: Accepted, no warning
  const before = await page.eval(() => window.__console().length);
  await page.click(`${D} .ex-bar .asm-btn`, { text: 'Run Visible Tests' });
  await page.waitFor((n) => /Process "Run Visible Tests" (completed|failed)/.test(window.__console().slice(n)), [before], { what: 'the tests run', timeout: 60000 });
  const out = await page.eval((n) => window.__console().slice(n), before);
  assert.match(out, /author: 10 \/ 10 points \(Accepted\), the visible tests\n {2}\+ vectors \(Vectors\): AC Accepted, 10 \/ 10\nProcess "Run Visible Tests" completed: 10 \/ 10 points\./, out);
  assert.doesNotMatch(out, /WARNING|ERROR/);
  // in Portuguese: the ⋮ menu's labels
  await page.eval(() => import('/js/i18n.js').then((m) => m.setLanguage('pt')));
  await page.waitFor(() => document.documentElement.lang === 'pt');
  await page.click(`${D} .ex-bar .tb-more-btn`);
  const items = await page.eval((d) => [...document.querySelectorAll(`${d} .ex-bar .tb-more-menu .asm-btn`)].map((b) => `${b.textContent}: ${b.title}`), D);
  assert.deepEqual(items, ['Executar Todos os Testes: Executar todos os testes do exercício, também os escondidos', 'Portos do Topo: O topo e os portos do exercício: os do módulo de topo do projeto',
    'Referência do Projeto: O desenho de referência do exercício: o desenho do projeto', 'Esperado da Referência: As saídas do teste de vetores selecionado: as do desenho de referência, nas entradas das suas linhas']);
  await page.eval(() => import('/js/i18n.js').then((m) => m.setLanguage('en')));
  await page.waitFor(() => document.documentElement.lang === 'en');
}, { timeout: 120000 });
