// UI: FSM state diagram editor. A new diagram from New Source (listed just before Algorithmic State Machine (ASM)),
// a state added by double-click and named in place, a transition drawn from the rim of a state,
// conditions edited in place and in the properties panel; the tables (transition, state, encoded)
// and the truth tables of the next-state logic; its HDL (generated from it: an edit of a transition
// rewrites the HDL, which simulates like the diagram; the HDL is read-only, #1176; a diagram with
// errors leaves it as it was and gives the out-of-sync banner with the reason); step-by-step
// simulation; HDL module -> diagram and diagram -> ASM chart; Portuguese texts; the priority of the
// transitions (▼ Later), Straighten, Export CSV, the simulator's ⟲ Reset and Clock ↑, Delete state /
// transition, + Input / + Output, Zoom / Fit, ↶ ↷ and Edit ▸ Undo / Redo (#195).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs, waitDownload } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';
import { normalizeFsm, simulateFsm, encodedTable, generateFsm } from '../../core/fsm.js';
import { simulate } from '../../core/compile.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .fsm-editor';
const fsmFile = async (pj, p) => JSON.parse(await readWs(env, pj, p));
/** The problems of the machine of the #195 test, with B or C first in A. */
const WARN_FSM = (first) => [
  first === 'B' ? "warning: State A: the transitions to B ('x') and to C ('y') are both true when x=1, y=1; the one listed first (to B) is taken"
    : "warning: State A: the transitions to C ('y') and to B ('x') are both true when x=1, y=1; the one listed first (to C) is taken",
  'info: State A: no transition is true when x=0, y=0; the machine stays in A',
];
const WARN_FSM_NO_T3 = ['warning: State B has no exit: once there, the machine stays in it until a reset', ...WARN_FSM('C')];
/** Its three tables as CSV, y (to C) tried before x (to B) in A. */
const CSV_FSM = {
  transitions: ['Present state,Code,Input condition,Next state,Next code,Outputs', 'A,00,y,C,10,', 'A,00,x,B,01,', 'A,00,otherwise,A,00,', 'B,01,1,A,00,', 'C,10,1,A,00,z=1', ''].join('\n'),
  states: ['Present state,Code,next (x y=00),next (x y=01),next (x y=10),next (x y=11),outputs (x y=00),outputs (x y=01),outputs (x y=10),outputs (x y=11)',
    'A,00,A,C,B,C,0,0,0,0', 'B,01,A,A,A,A,0,0,0,0', 'C,10,A,A,A,A,1,1,1,1', ''].join('\n'),
  encoded: ['q1,q0,x,y,d1,d0,z',
    '0,0,0,0,0,0,0', '0,0,0,1,1,0,0', '0,0,1,0,0,1,0', '0,0,1,1,1,0,0', '0,1,0,0,0,0,0', '0,1,0,1,0,0,0', '0,1,1,0,0,0,0', '0,1,1,1,0,0,0',
    '1,0,0,0,0,0,1', '1,0,0,1,0,0,1', '1,0,1,0,0,0,1', '1,0,1,1,0,0,1', '1,1,0,0,X,X,X', '1,1,0,1,X,X,X', '1,1,1,0,X,X,X', '1,1,1,1,X,X,X', ''].join('\n'),
};

/** Outputs of the HDL per cycle and of the diagram (reference model) for the same inputs. */
function hdlVsModel(code, model) {
  const m = normalizeFsm(model);
  const vec = [];
  let s = 7;
  for (let i = 0; i < 60; i++) { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; vec.push(Object.fromEntries(m.inputs.map((x) => [x.name, (s >> 8) % (1 << x.width)]))); }
  const tb = ['module tb;', '  reg clk = 0; reg rst = 1;', ...m.inputs.map((i) => `  reg [${i.width - 1}:0] i_${i.name} = 0;`), ...m.outputs.map((o) => `  wire [${o.width - 1}:0] o_${o.name};`),
    `  ${m.name.toLowerCase()} dut(.clk(clk), .rst(rst)${m.inputs.map((i) => `, .${i.name}(i_${i.name})`).join('')}${m.outputs.map((o) => `, .${o.name}(o_${o.name})`).join('')});`,
    '  always #5 clk = ~clk;', '  initial begin', '    #12 rst = 0;',
    ...vec.map((v) => `    ${m.inputs.map((i) => `i_${i.name} = ${v[i.name]};`).join(' ')} #2 $display("${m.outputs.map(() => '%b').join('_')}", ${m.outputs.map((o) => `o_${o.name}`).join(', ')}); @(posedge clk); #1;`),
    '    $finish;', '  end', 'endmodule'].join('\n');
  const r = simulate([{ path: 'dut.vhd', text: code }, { path: 'tb.v', text: tb }], 'tb', { until: 1e8 });
  assert.deepEqual(r.errors, []);
  const got = r.sim.log.map((e) => String(e.text).trim()).filter((x) => /^[01xz_]+$/.test(x));
  const want = simulateFsm(m, vec).map((row) => m.outputs.map((o) => row.outputs[o.name].toString(2).padStart(o.width, '0')).join('_'));
  return { got, want };
}

/** Select a transition by clicking its label (again if the view was still moving: the fit when it opened). */
async function selectTrans(page, id) {
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try { await page.click(`${ED} [data-trans=${id}] .fsm-label`); } catch { continue; }
    if (await page.eval((ed, t) => !!document.querySelector(`${ed} .fsm-cond`) && window.Silinx.active.fsmEditor && document.querySelector(`${ed} [data-trans=${t}]`)?.classList.contains('sel'), ED, id)) return;
  }
  throw new Error(`transition ${id} not selected`);
}

/** Screen position of a state circle (centre) and its radius. */
const statePos = (page, id) => page.eval((ed, sid) => {
  const c = document.querySelector(`${ed} [data-state="${sid}"] .fsm-circle`);
  const b = c.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2, r: b.width / 2 };
}, ED, id);

uiTest('State diagram (FSM): New Source, states and transitions drawn and edited, tables, truth tables, linked HDL following it (read-only, #1176)', E, async (page) => {
  await makeProject(env, { name: 'FsmPj', files: {} });
  await page.openProject('FsmPj');
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source Wizard');
  const types = await page.eval(() => [...document.querySelectorAll('.dlg-overlay .src-types .st')].map((e) => e.textContent.trim()));
  assert.equal(types.indexOf('Finite State Machine (FSM)') + 1, types.indexOf('Algorithmic State Machine (ASM)'), types.join(' | '));   // FSM listed just before ASM
  await page.eval(() => { const r = [...document.querySelectorAll('.dlg-overlay .src-types .st')].find((e) => e.textContent.trim() === 'Finite State Machine (FSM)'); r.scrollIntoView(); r.click(); });
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'det');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor((ed) => window.Silinx.active?.id === 'fsm:src/det.fsm.json' && document.querySelector(ed), [ED], { what: 'state diagram editor' });
  // the example machine: S0 -> S1 -> S2 (z = 1), the initial state with a double circle
  assert.equal(await page.eval((ed) => document.querySelectorAll(`${ed} .fsm-state`).length, ED), 3);
  assert.ok(await page.eval((ed) => !!document.querySelector(`${ed} [data-state=s1].initial .fsm-circle-in`), ED));
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} [data-state=s3] .fsm-outs`).textContent, ED), 'z=1');
  assert.match(await page.eval((ed) => document.querySelector(`${ed} .fsm-problems`).textContent, ED), /No problems/);
  // the hierarchy lists the diagram
  await page.waitFor(() => [...document.querySelectorAll('#hier .row')].some((r) => /det\.fsm\.json/.test(r.textContent)), [], { what: 'det.fsm.json in the hierarchy' });

  // ---- a new state: double-click the drawing, name and Moore output typed in place
  await page.waitFor((ed) => document.querySelector(`${ed} [data-state=s3] .fsm-circle`)?.getBoundingClientRect().width > 10, [ED]);
  const s3 = await statePos(page, 's3');
  await page.dblclick({ x: s3.x, y: s3.y + 130 });
  await page.waitForSelector(`${ED} .fsm-inline`);
  await page.fill(`${ED} .fsm-inline`, 'S3 / z=1');
  await page.key('Enter');
  await page.waitFor((ed) => [...document.querySelectorAll(`${ed} .fsm-name`)].some((t) => t.textContent === 'S3'), [ED], { what: 'state S3' });
  const sid = await page.eval((ed) => [...document.querySelectorAll(`${ed} .fsm-state`)].find((g) => g.querySelector('.fsm-name').textContent === 'S3').dataset.state, ED);
  // a warning: S3 cannot be reached and has no exit
  await page.waitFor((ed) => /State S3 cannot be reached/.test(document.querySelector(`${ed} .fsm-problems`).textContent), [ED]);
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .fsm-problems .asm-prob`)].map((li) => [li.className, li.textContent]), ED), [
    ['asm-prob warning link', '▲State S3 cannot be reached from the initial state S0'],
    ['asm-prob warning link', '▲State S3 has no exit: once there, the machine stays in it until a reset'],
  ]);

  // ---- a transition S3 -> S0: dragged from the rim of S3, condition typed in place (empty = always)
  const a = await statePos(page, sid), b = await statePos(page, 's1');
  await page.drag({ x: a.x - a.r + 3, y: a.y }, { x: b.x, y: b.y });
  await page.waitForSelector(`${ED} .fsm-inline`);
  await page.key('Enter');
  // ---- S2 --!x--> S3 instead of S0: the transition chosen by its label, its target changed in the panel
  await selectTrans(page, 't6');
  await page.fill(`${ED} .fsm-to`, sid);
  await page.waitFor((ed) => /No problems/.test(document.querySelector(`${ed} .fsm-problems`).textContent), [ED], { what: 'no problems' });
  await page.waitFor(() => !window.Silinx.active.dirty, [], { what: 'saved' });
  // the save reaches the disk a moment after the tab is marked clean: wait for the new state in the file
  let m;
  for (let i = 0; i < 100; i++) {
    m = await fsmFile('FsmPj', 'src/det.fsm.json');
    if (m.states.some((s) => s.id === sid) && m.transitions.find((t) => t.id === 't6')?.to === sid) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.deepEqual(m.states.find((s) => s.id === sid), { id: sid, name: 'S3', x: m.states.find((s) => s.id === sid).x, y: m.states.find((s) => s.id === sid).y, outputs: { z: '1' } });
  assert.deepEqual(m.transitions.filter((t) => t.from === sid).map((t) => [t.to, t.cond]), [['s1', '']]);
  assert.equal(m.transitions.find((t) => t.id === 't6').to, sid);

  // ---- tables
  await page.click(`${ED} .fsm-tab-btn`, { text: 'Tables' });
  await page.waitForSelector(`${ED} .fsm-ttable`);
  const rows = await page.eval((ed) => [...document.querySelectorAll(`${ed} .fsm-ttable tr`)].slice(1).map((r) => [...r.children].map((c) => c.textContent).join('|')), ED);
  assert.deepEqual(rows, ['S0|00|x|S1|01|', 'S0|00|!x|S0|00|', 'S1|01|x|S2|10|', 'S1|01|!x|S0|00|', 'S2|10|x|S2|10|z=1', 'S2|10|!x|S3|11|z=1', 'S3|11|1|S0|00|z=1']);
  // state table: columns x = 0 / 1
  const st = await page.eval((ed) => [...document.querySelectorAll(`${ed} .fsm-stable tr`)].slice(2).map((r) => [...r.children].map((c) => c.textContent).join('|')), ED);
  assert.deepEqual(st, ['S0|00|S0|S1|0', 'S1|01|S0|S2|0', 'S2|10|S3|S2|1', 'S3|11|S0|S0|1']);
  // encoded table: 4 codes x 2 values of x
  assert.equal(await page.eval((ed) => document.querySelectorAll(`${ed} .fsm-etable tr`).length - 2, ED), 8);
  // truth tables of the next-state bits and of the output
  await page.click(`${ED} .fsm-mktt`);
  await page.waitFor(() => window.Silinx.fileTree?.includes('src/det_next.tt.json') && window.Silinx.fileTree.includes('src/det_out.tt.json'), [], { what: 'truth tables', timeout: 15000 });
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/det_next.tt.json' && window.Silinx.docs.some((d) => d.id === 'tt:src/det_out.tt.json'), [], { what: 'truth tables opened', timeout: 15000 });
  const ttn = await fsmFile('FsmPj', 'src/det_next.tt.json');
  const et = encodedTable(m);
  assert.deepEqual(ttn.inputs, ['q1', 'q0', 'x']);
  assert.equal(ttn.table.d1, et.rows.map((r) => r.d[0]).join(''));
  assert.equal(ttn.table.d0, et.rows.map((r) => r.d[1]).join(''));
  assert.equal((await fsmFile('FsmPj', 'src/det_out.tt.json')).table.z, '00001111'.replace(/./g, (c, i) => et.rows[i].out));

  // ---- its HDL, generated from it (no Generate HDL any more, #220): linked to the diagram, simulates like it
  await page.eval(() => window.SilinxApp.openFsm('src/det.fsm.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/det.fsm.json');
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .fsm-gen`), ED), null);
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/det.vhd'] === 'src/det.fsm.json', [], { what: 'linked HDL', timeout: 15000 });
  await page.eval(() => window.SilinxApp.openFile('src/det.vhd'));
  assert.equal((await fsmFile('FsmPj', 'src/det.fsm.json')).generatedFile, 'src/det.vhd');
  let vhd = await readWs(env, 'FsmPj', 'src/det.vhd');
  let r = hdlVsModel(vhd, await fsmFile('FsmPj', 'src/det.fsm.json'));
  assert.deepEqual(r.got, r.want);
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/det.vhd' && /^Read-only, generated from det\.fsm\.json$/.test(document.querySelector('.doc:not([hidden]) [data-sync-banner]')?.textContent || ''), [], { what: 'HDL editor banner' });
  assert.equal(await page.eval(() => window.Silinx.active.editor.readOnly()), true);
  // the hierarchy shows the module with its diagram the base, its views as badges (#207)
  await page.waitFor(() => [...document.querySelectorAll('#hier .row')].some((x) => x.querySelector('.lbl').textContent === 'det' && x.querySelector('.meta')?.textContent === '(det.fsm.json)' && [...x.querySelectorAll('.badge')].map((b) => b.textContent).join(' ') === 'FSM VHDL'), [], { what: 'det [FSM] [VHDL] (det.fsm.json)' });

  // ---- diagram -> HDL: an edited condition rewrites the module
  await page.eval(() => window.SilinxApp.openFsm('src/det.fsm.json'));
  await page.waitFor((ed) => window.Silinx.active?.id === 'fsm:src/det.fsm.json' && /^HDL: det\.vhd — generated from the diagram$/.test(document.querySelector(`${ed} .fsm-link`).textContent), [ED]);
  await selectTrans(page, 't1');
  await page.fill(`${ED} .fsm-cond`, 'x and x');
  await page.waitFor(async () => /S0 +: x and x -> S1/.test(await (await fetch('/api/projects/FsmPj/file?path=src%2Fdet.vhd')).text()), [], { what: 'HDL regenerated', timeout: 15000 });
  vhd = await readWs(env, 'FsmPj', 'src/det.vhd');
  r = hdlVsModel(vhd, await fsmFile('FsmPj', 'src/det.fsm.json'));
  assert.deepEqual(r.got, r.want);

  // ---- a condition with an error: the HDL stays as it was, out of sync; the HDL editor's banner says why
  await selectTrans(page, 't1');
  await page.fill(`${ED} .fsm-cond`, 'x and');
  await page.waitFor((ed) => /Not in sync with det\.vhd/.test(document.querySelector(`${ed} .fsm-link`).textContent), [ED], { what: 'out of sync', timeout: 15000 });
  assert.match(await readWs(env, 'FsmPj', 'src/det.vhd'), /S0 +: x and x -> S1/);
  await page.eval(() => window.SilinxApp.openFile('src/det.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/det.vhd' && /^Read-only, not in sync with det\.fsm\.json — the state diagram has errors: ./.test(document.querySelector('.doc:not([hidden]) [data-sync-banner]')?.textContent || ''), [], { what: 'out-of-sync banner' });
  await page.eval(() => window.SilinxApp.openFsm('src/det.fsm.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/det.fsm.json');
  // editing the diagram again rewrites the HDL: back in sync, and said so only once the file is
  // written (the save is slowed down here: a slow disk / server, as on CI)
  await page.eval(() => {
    const f = window.fetch;
    window.fetch = (url, init) => (init?.method === 'PUT' && /path=src%2Fdet\.vhd/.test(String(url)) ? new Promise((r) => setTimeout(r, 1500)).then(() => f(url, init)) : f(url, init));
    window.__restoreFetch = () => { window.fetch = f; };
  });
  await selectTrans(page, 't1');
  await page.fill(`${ED} .fsm-cond`, 'x');
  await page.waitFor((ed) => /^HDL: det\.vhd — generated from the diagram$/.test(document.querySelector(`${ed} .fsm-link`).textContent), [ED], { what: 'back in sync', timeout: 15000 });
  vhd = await readWs(env, 'FsmPj', 'src/det.vhd');
  await page.eval(() => window.__restoreFetch());
  assert.match(vhd, /S0 +: x -> S1/);
  r = hdlVsModel(vhd, await fsmFile('FsmPj', 'src/det.fsm.json'));
  assert.deepEqual(r.got, r.want);

  // ---- rename the module: the diagram follows (file, name, link) and the HDL is regenerated
  await page.treeRow('#hier', 'det', { right: true, exact: true });
  await page.waitForSelector('body > .menu-popup');
  await page.click('body > .menu-popup .mi', { text: 'Rename…' });
  await page.waitDialog('Rename');
  await page.fill('.dlg-overlay input[type=text]', 'det2', { index: 0 });
  await page.dialogButton('Rename');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/det2.vhd'] === 'src/det2.fsm.json', [], { what: 'link after the rename', timeout: 15000 });
  const d2 = await fsmFile('FsmPj', 'src/det2.fsm.json');
  assert.deepEqual([d2.name, d2.generatedFile], ['det2', 'src/det2.vhd']);
  assert.match(await readWs(env, 'FsmPj', 'src/det2.vhd'), /entity det2 is/);
});

uiTest('State diagram (FSM): step-by-step simulation, Mealy labels, module -> diagram, diagram -> ASM chart, undo', E, async (page) => {
  const mealy = normalizeFsm({
    name: 'seq', type: 'mealy', inputs: [{ name: 'x', width: 1 }], outputs: [{ name: 'z', width: 1 }],
    states: [{ id: 'a', name: 'A', x: 100, y: 100 }, { id: 'b', name: 'B', x: 300, y: 100 }],
    transitions: [{ id: 't1', from: 'a', to: 'b', cond: 'x' }, { id: 't2', from: 'b', to: 'a', cond: '!x', outputs: { z: '1' } }], initial: 'a',
  });
  await makeProject(env, { name: 'FsmSim', files: { 'src/seq.vhd': generateFsm(mealy, 'vhdl').code, 'src/m.fsm.json': JSON.stringify(mealy, null, 2) } });
  await page.openProject('FsmSim');
  await page.eval(() => window.SilinxApp.openFsm('src/m.fsm.json'));
  await page.waitFor((ed) => window.Silinx.active?.id === 'fsm:src/m.fsm.json' && document.querySelector(ed), [ED]);
  // Mealy label "condition / outputs"
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} [data-trans=t2] .fsm-label`).textContent, ED), '!x / z=1');
  // ---- simulation: x = 1, clock -> B; x = 0: z = 1 (Mealy) and the transition back to A is shown
  await page.click(`${ED} .fsm-tab-btn`, { text: '▶ Simulate' });
  await page.waitForSelector(`${ED} .fsm-sim`);
  assert.ok(await page.eval((ed) => document.querySelector(`${ed} [data-state=a]`).classList.contains('current'), ED));
  await page.click(`${ED} .fsm-bit[data-input=x]`);
  assert.ok(await page.eval((ed) => document.querySelector(`${ed} [data-trans=t1]`).classList.contains('hot'), ED));
  await page.click(`${ED} .fsm-sim-step`);
  await page.waitFor((ed) => document.querySelector(`${ed} [data-state=b]`).classList.contains('current'), [ED]);
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .fsm-led[data-output=z]`).textContent, ED), 'z = 0');
  await page.click(`${ED} .fsm-bit[data-input=x]`);
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-led[data-output=z]`)?.textContent === 'z = 1', [ED]);
  await page.click(`${ED} .fsm-sim-step`);
  await page.waitFor((ed) => document.querySelector(`${ed} [data-state=a]`).classList.contains('current'), [ED]);
  assert.equal(await page.eval((ed) => document.querySelectorAll(`${ed} .fsm-trace tr`).length, ED), 3);
  await page.click(`${ED} .fsm-sim-reset`);
  // ---- ▶ Run: a click whose press and release fall on each side of a clock edge is not lost (#240);
  // the controls were made anew at each edge, and the click went to an element no longer there
  const cycles = () => page.eval((ed) => document.querySelectorAll(`${ed} .fsm-trace tr`).length, ED);
  const slowClick = async (sel, text) => {
    const { x, y } = await page.point(sel, text ? { text } : {});
    await page.mouse('mouseMoved', x, y);
    await page.mouse('mousePressed', x, y);
    const n = await cycles();
    await page.waitFor((ed, k) => document.querySelectorAll(`${ed} .fsm-trace tr`).length > k, [ED, n], { what: 'a clock edge while the button is pressed', timeout: 5000 });
    await page.mouse('mouseReleased', x, y);
  };
  await page.click(`${ED} .asm-codebar .asm-btn`, { text: '▶ Run' });
  await page.waitFor((ed) => document.querySelectorAll(`${ed} .fsm-trace tr`).length >= 2, [ED], { what: 'a clock edge while running', timeout: 5000 });
  await slowClick(`${ED} .fsm-bit[data-input=x]`);
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-bit[data-input=x]`)?.textContent === 'x = 1', [ED], { what: 'x on' });
  await page.waitFor((ed) => document.querySelector(`${ed} [data-state=b]`).classList.contains('current'), [ED], { what: 'B reached while running', timeout: 5000 });
  await slowClick(`${ED} .asm-codebar .asm-btn`, '■ Stop');
  await page.waitFor((ed) => [...document.querySelectorAll(`${ed} .asm-codebar .asm-btn`)].some((b) => b.textContent === '▶ Run'), [ED], { what: 'stopped' });
  const n1 = await cycles();
  await new Promise((r) => setTimeout(r, 1300));
  assert.equal(await cycles(), n1, 'no clock edge once stopped');
  await page.click(`${ED} .fsm-sim-reset`);
  // ---- undo / redo of a deleted transition (Del key)
  await selectTrans(page, 't1');
  await page.eval((ed) => document.querySelector(ed).focus(), ED);
  await page.key('Delete');
  await page.waitFor((ed) => !document.querySelector(`${ed} [data-trans=t1]`), [ED]);
  await page.key('z', { modifiers: 2 });
  await page.waitFor((ed) => !!document.querySelector(`${ed} [data-trans=t1]`), [ED], { what: 'undo' });
  // ---- diagram -> ASM chart
  await page.click(`${ED} .asm-btn`, { text: 'Convert to ASM chart' });
  await page.waitFor(() => window.Silinx.active?.id === 'asm:src/seq_asm.asm.json', [], { what: 'ASM chart opened', timeout: 15000 });
  const asm = JSON.parse(await readWs(env, 'FsmSim', 'src/seq_asm.asm.json'));
  assert.deepEqual(asm.nodes.filter((n) => n.type === 'state').map((n) => n.name), ['A', 'B']);
  // ---- HDL module -> state diagram (module context menu), linked to the module
  await page.treeRow('#hier', 'seq', { right: true, exact: true });
  await page.waitForSelector('body > .menu-popup');
  await page.click('body > .menu-popup .mi', { text: 'Convert to State Diagram (FSM)…' });
  await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/seq.fsm.json', [], { what: 'diagram of seq', timeout: 15000 });
  const d = JSON.parse(await readWs(env, 'FsmSim', 'src/seq.fsm.json'));
  assert.equal(d.generatedFile, 'src/seq.vhd');
  assert.equal(d.type, 'mealy');
  assert.deepEqual(d.transitions.map((t) => [t.cond, t.outputs]), [['x', {}], ['!x', { z: '1' }]]);
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/seq.vhd'] === 'src/seq.fsm.json', [], { what: 'linked' });
});

uiTest('State diagram (FSM) in Portuguese: every label of the editor, the panels and the problems is translated', E, async (page) => {
  const m = normalizeFsm({
    name: 'pt', type: 'mealy', inputs: [{ name: 'x', width: 1 }, { name: 'y', width: 2 }], outputs: [{ name: 'z', width: 1 }],
    states: [{ id: 'a', name: 'A', x: 100, y: 100 }, { id: 'b', name: 'B', x: 300, y: 100 }, { id: 'c', name: 'C', x: 300, y: 300 }],
    transitions: [{ id: 't1', from: 'a', to: 'b', cond: 'x' }, { id: 't2', from: 'a', to: 'c', cond: 'y == 1' }, { id: 't3', from: 'b', to: 'a', cond: '', outputs: { z: '1' } }], initial: 'a',
  });
  await makeProject(env, { name: 'FsmPt', files: { 'src/pt.fsm.json': JSON.stringify(m, null, 2) } });
  await page.openProject('FsmPt');
  await page.eval(() => window.SilinxApp.openFsm('src/pt.fsm.json'));
  await page.waitFor((ed) => window.Silinx.active?.id === 'fsm:src/pt.fsm.json' && document.querySelector(ed), [ED]);
  await page.eval(TEXTS);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  const missing = [];
  const SAME = [/^(Moore|Mealy|Gray|One-hot|<\/> HDL|VHDL|Verilog|[A-C]|x|y|z|[xyz] = \d+|\d+)$/, /^@?e\.g\./];
  const check = async (where) => {
    await setLang('en'); const en = await page.eval((ed) => window.__uiTexts(document.querySelector(ed)), ED);
    await setLang('pt'); const pt = await page.eval((ed) => window.__uiTexts(document.querySelector(ed)), ED);
    for (const s of untranslated(en, pt, SAME)) missing.push(`${where}: ${s}`);
  };
  await check('editor');
  // problems (an overlap warning, an info), a state, a transition
  assert.match(await page.eval((ed) => document.querySelector(`${ed} .fsm-problems`).textContent, ED), /Estado A: as transições para B \('x'\) e para C \('y == 1'\) são ambas verdadeiras quando x=1, y=01/);
  assert.match(await page.eval((ed) => document.querySelector(`${ed} .fsm-problems`).textContent, ED), /nenhuma transição é verdadeira quando/);
  await page.click(`${ED} [data-state=a] .fsm-circle`);
  await check('state');
  await page.click(`${ED} [data-trans=t3] .fsm-label`);
  await check('transition');
  for (const tab of ['Tables', '</> HDL', '▶ Simulate']) {
    await setLang('en');
    await page.click(`${ED} .fsm-tab-btn`, { text: tab });
    await check(tab);
  }
  assert.deepEqual(missing, [], `untranslated:\n${missing.join('\n')}`);
  await setLang('pt');
  // (Undo / Redo: the main toolbar's, #220)
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .asm-toolbar .tb-btn`)].map((b) => b.title), ED), ['Anular', 'Refazer']);
  await setLang('en');
});

uiTest('State diagram (FSM): Create Truth Tables with more than 4 output bits makes one table of the outputs (#176)', E, async (page) => {
  // a Moore machine with 6 output bits (busy, sel[1:0], led[2:0]): one _out table, not _out1 / _out2
  const m = normalizeFsm({
    name: 'wide', type: 'moore', lang: 'vhdl', reset: { name: 'rst', active: 'high', sync: true },
    inputs: [{ name: 'go', width: 1 }],
    outputs: [{ name: 'busy', width: 1, default: '0' }, { name: 'sel', width: 2, default: '00' }, { name: 'led', width: 3, default: '000' }],
    states: [
      { id: 'i', name: 'IDLE', x: 80, y: 80 },
      { id: 'r', name: 'RUN', x: 260, y: 80, outputs: { busy: '1', sel: '01', led: '101' } },
      { id: 'd', name: 'DONE', x: 170, y: 220, outputs: { sel: '10', led: '111' } },
    ],
    transitions: [{ id: 't1', from: 'i', to: 'r', cond: 'go' }, { id: 't2', from: 'r', to: 'd', cond: '' }, { id: 't3', from: 'd', to: 'i', cond: '!go' }],
    initial: 'i',
  });
  await makeProject(env, { name: 'FsmWide', files: { 'src/wide.fsm.json': JSON.stringify(m, null, 2) } });
  await page.openProject('FsmWide');
  await page.eval(() => window.SilinxApp.openFsm('src/wide.fsm.json'));
  const ED = '.doc:not([hidden]) .fsm-editor';
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-tab-btn`), [ED], { what: 'FSM editor' });
  await page.click(`${ED} .fsm-tab-btn`, { text: 'Tables' });
  await page.waitForSelector(`${ED} .fsm-mktt`);
  await page.click(`${ED} .fsm-mktt`);
  await page.waitFor(() => window.Silinx.fileTree?.includes('src/wide_next.tt.json') && window.Silinx.fileTree.includes('src/wide_out.tt.json'), [], { what: 'truth tables', timeout: 15000 });
  assert.deepEqual(await page.eval(() => window.Silinx.fileTree.filter((f) => /^src\/wide.*\.tt\.json$/.test(f)).sort()), ['src/wide_next.tt.json', 'src/wide_out.tt.json']);
  // each table has its HDL at once, generated from it (every source has its HDL, #207, #220)
  for (const t of ['wide_next', 'wide_out']) {
    await page.waitFor((f, h) => window.Silinx.hdlToSch?.[h] === f, [`src/${t}.tt.json`, `src/${t}.vhd`], { what: `${t}.tt.json linked to its HDL`, timeout: 15000 });
    assert.equal((await fsmFile('FsmWide', `src/${t}.tt.json`)).generatedFile, `src/${t}.vhd`);
    await page.waitConsole(new RegExp(`src/${t}\\.vhd generated from src/${t}\\.tt\\.json \\(every source has its HDL\\)`));
  }
  const out = await fsmFile('FsmWide', 'src/wide_out.tt.json');
  assert.deepEqual(out.inputs, ['q1', 'q0', 'go']);
  assert.deepEqual(out.outputs, ['busy', 'sel_1', 'sel_0', 'led_2', 'led_1', 'led_0']);
  // the table is the machine's: each state's outputs (unused code 11: don't cares)
  const et = encodedTable(m);
  for (const [k, o] of out.outputs.entries()) assert.equal(out.table[o], et.rows.map((r) => r.unused ? 'X' : r.out[k]).join(''), o);
  // opened: its 6 outputs in the editor
  await page.waitFor(() => window.Silinx.docs.some((d) => d.id === 'tt:src/wide_out.tt.json'), [], { what: 'the output table opened' });
  await page.eval(() => window.SilinxApp.openTt('src/wide_out.tt.json'));
  // (its own document, whichever is in front: another one, e.g. a generated HDL file, may open after it)
  await page.waitFor(() => window.Silinx.docs.find((d) => d.id === 'tt:src/wide_out.tt.json')?.el.querySelectorAll('.tt-editor .tt-cell[data-out=led_0]').length === 8, [], { what: 'led_0 column', timeout: 30000 });
});

uiTest('State diagram (FSM): priority (▼ Later), Straighten, Export CSV, simulator ⟲ Reset / Clock ↑, Delete state / transition, + Input / + Output, Zoom / Fit, ↶ ↷ and Edit ▸ Undo / Redo (#195)', E, async (page) => {
  const m0 = normalizeFsm({
    name: 'pri', type: 'mealy', inputs: [{ name: 'x', width: 1 }, { name: 'y', width: 1 }], outputs: [{ name: 'z', width: 1 }],
    states: [{ id: 'a', name: 'A', x: 100, y: 100 }, { id: 'b', name: 'B', x: 300, y: 100 }, { id: 'c', name: 'C', x: 300, y: 300 }],
    transitions: [{ id: 't1', from: 'a', to: 'b', cond: 'x', bend: 40 }, { id: 't2', from: 'a', to: 'c', cond: 'y' },
      { id: 't3', from: 'b', to: 'a', cond: '' }, { id: 't4', from: 'c', to: 'a', cond: '', outputs: { z: '1' } }], initial: 'a',
  });
  await makeProject(env, { name: 'FsmEd', files: { 'src/pri.fsm.json': JSON.stringify(m0, null, 2) } });
  await page.openProject('FsmEd');
  await page.eval(() => window.SilinxApp.openFsm('src/pri.fsm.json'));
  await page.waitFor((ed) => window.Silinx.active?.id === 'fsm:src/pri.fsm.json' && document.querySelector(`${ed} [data-trans=t1] .fsm-label`), [ED], { what: 'FSM editor' });
  const model = () => page.eval(() => window.Silinx.active.fsmEditor.getModel());
  const warnings = () => page.eval(() => window.Silinx.active.fsmEditor.validate().map((d) => `${d.severity}: ${d.message}`));
  // (Undo / Redo: the main toolbar's buttons, #220)
  const tool = (label) => (/^[↶↷]$/.test(label) ? page.click(`${ED} .asm-toolbar .tb-btn[title=${label === '↶' ? 'Undo' : 'Redo'}]`) : page.click(`${ED} .asm-toolbar .asm-btn`, { text: label }));
  const side = (label) => page.click(`${ED} .fsm-selection .asm-btn`, { text: label });
  const zoom = () => page.eval((ed) => document.querySelector(`${ed} .asm-zoom`).textContent, ED);
  const order = async () => (await model()).transitions.map((t) => t.id).join(',');
  const savedOrder = () => page.eval(async () => (await (await fetch('/api/projects/FsmEd/file?path=src%2Fpri.fsm.json')).json()).transitions.map((t) => t.id).join(','));
  // x and y both true in A: a warning
  assert.deepEqual(await warnings(), WARN_FSM('B'));

  // ---- Zoom / Fit: the zoom label follows; Fit gives the fitted zoom back
  await new Promise((r) => setTimeout(r, 300));   // (the fit when it opened)
  await tool('Fit');
  const fitted = await zoom();
  const k = parseFloat(await page.eval((ed) => /scale\(([\d.]+)\)/.exec(document.querySelector(`${ed} .fsm-vp`).getAttribute('transform'))[1], ED));
  assert.equal(fitted, `${Math.round(k * 100)}%`);
  await tool('+');
  assert.equal(await zoom(), `${Math.round(k * 120)}%`);
  await tool('−'); await tool('−');
  assert.equal(await zoom(), `${Math.round(k * 100 / 1.2)}%`);
  await tool('Fit');
  assert.equal(await zoom(), fitted);

  // ---- ▼ Later: t1 (x) after t2 (y) in A; the simulator takes the first true condition
  await selectTrans(page, 't1');
  assert.match(await page.eval((ed) => document.querySelector(`${ed} .fsm-selection`).textContent, ED), /Priority 1 of 2 in A/);
  await side('▼ Later');
  assert.equal(await order(), 't2,t1,t3,t4');
  await page.waitFor((ed) => /Priority 2 of 2 in A/.test(document.querySelector(`${ed} .fsm-selection`).textContent), [ED]);
  // ---- Straighten: the bend of t1 is removed
  assert.equal((await model()).transitions.find((t) => t.id === 't1').bend, 40);
  await side('Straighten');
  assert.ok(!('bend' in (await model()).transitions.find((t) => t.id === 't1')));
  // ↶ / ↷ (toolbar): the bend back, removed again; Edit ▸ Undo twice: the first order back
  await tool('↶');
  assert.equal((await model()).transitions.find((t) => t.id === 't1').bend, 40);
  await tool('↷');
  assert.ok(!('bend' in (await model()).transitions.find((t) => t.id === 't1')));
  await page.menu('Edit', 'Undo');
  await page.menu('Edit', 'Undo');
  assert.equal(await order(), 't1,t2,t3,t4');
  await page.menu('Edit', 'Redo');
  assert.equal(await order(), 't2,t1,t3,t4');
  assert.equal((await model()).transitions.find((t) => t.id === 't1').bend, 40);
  // saved with the new priority
  await page.waitFor(async () => (await (await fetch('/api/projects/FsmEd/file?path=src%2Fpri.fsm.json')).json()).transitions.map((t) => t.id).join(',') === 't2,t1,t3,t4', [], { what: 'priority saved', timeout: 15000 });

  // ---- simulator: x = y = 1 in A: C (y, now first); Clock ↑ three times, ⟲ Reset back to A with no trace
  await page.click(`${ED} .fsm-tab-btn`, { text: '▶ Simulate' });
  await page.waitForSelector(`${ED} .fsm-sim`);
  await page.click(`${ED} .fsm-bit[data-input=x]`);
  await page.click(`${ED} .fsm-bit[data-input=y]`);
  assert.ok(await page.eval((ed) => document.querySelector(`${ed} [data-trans=t2]`).classList.contains('hot') && !document.querySelector(`${ed} [data-trans=t1]`).classList.contains('hot'), ED));
  const simState = (s) => page.waitFor((ed, x) => document.querySelector(`${ed} .fsm-sim-state`)?.textContent === x, [ED, s], { what: `simulated state ${s}` });
  await page.click(`${ED} .fsm-sim-step`);
  await simState('C');
  assert.ok(await page.eval((ed) => document.querySelector(`${ed} [data-state=c]`).classList.contains('current'), ED));
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .fsm-led[data-output=z]`).textContent, ED), 'z = 1');
  await page.click(`${ED} .fsm-sim-step`);
  await simState('A');
  await page.click(`${ED} .fsm-sim-step`);
  await simState('C');
  const trace = () => page.eval((ed) => [...document.querySelectorAll(`${ed} .fsm-trace tr`)].slice(1).map((r) => [...r.children].map((c) => c.textContent).join('|')), ED);
  assert.deepEqual(await trace(), ['2|A|x=1 y=1|z=0|C', '1|C|x=1 y=1|z=1|A', '0|A|x=1 y=1|z=0|C']);
  await page.click(`${ED} .fsm-sim-reset`);
  await simState('A');
  assert.ok(await page.eval((ed) => document.querySelector(`${ed} [data-state=a]`).classList.contains('current') && !document.querySelector(`${ed} .fsm-trace`), ED));
  // the inputs are kept: the next Clock ↑ goes to C again, as cycle 0
  await page.click(`${ED} .fsm-sim-step`);
  await simState('C');
  assert.deepEqual(await trace(), ['0|A|x=1 y=1|z=0|C']);

  // ---- Export CSV of the three tables
  await page.click(`${ED} .fsm-tab-btn`, { text: 'Tables' });
  await page.waitForSelector(`${ED} .fsm-ttable`);
  const fs = await import('node:fs/promises');
  const csv = {};
  for (const [i, name] of ['transitions', 'states', 'encoded'].entries()) {
    await page.click(`${ED} .fsm-tcap .asm-btn`, { text: 'Export CSV', index: i });
    csv[name] = await fs.readFile(await waitDownload(page, `pri_${name}.csv`), 'utf8');
  }
  assert.deepEqual(csv, CSV_FSM);

  // ---- + Input / + Output
  await page.click(`${ED} .fsm-add-in`);
  await page.click(`${ED} .fsm-add-out`);
  let m = await model();
  assert.deepEqual(m.inputs, [{ name: 'x', width: 1 }, { name: 'y', width: 1 }, { name: 'x2', width: 1 }]);
  assert.deepEqual(m.outputs, [{ name: 'z', width: 1, default: '0' }, { name: 'z1', width: 1, default: '0' }]);
  await tool('↶'); await tool('↶');
  m = await model();
  assert.deepEqual([m.inputs.map((p) => p.name), m.outputs.map((p) => p.name)], [['x', 'y'], ['z']]);

  // ---- Delete transition, Delete state (and its transitions); ↶ ↷ and Edit ▸ Undo / Redo
  // (t3 has no label: always, no outputs) clicked on its arrow
  for (let i = 0; i < 20 && !await page.eval((ed) => document.querySelector(`${ed} [data-trans=t3]`).classList.contains('sel'), ED); i++) {
    await page.click(await page.eval((ed) => {
      const p = document.querySelector(`${ed} [data-trans=t3] .fsm-hit`);
      const q = p.getPointAtLength(p.getTotalLength() / 2), c = p.getScreenCTM();
      return { x: c.a * q.x + c.c * q.y + c.e, y: c.b * q.x + c.d * q.y + c.f };
    }, ED));
    await new Promise((r) => setTimeout(r, 100));
  }
  await page.waitFor((ed) => /Delete transition/.test(document.querySelector(`${ed} .fsm-selection`).textContent), [ED], { what: 't3 selected' });
  await side('Delete transition');
  assert.equal(await order(), 't2,t1,t4');
  assert.deepEqual(await warnings(), WARN_FSM_NO_T3);
  await page.click(`${ED} [data-state=c] .fsm-circle`);
  await page.waitFor((ed) => /Delete state/.test(document.querySelector(`${ed} .fsm-selection`).textContent), [ED]);
  await side('Delete state');
  m = await model();
  assert.deepEqual([m.states.map((s) => s.id), m.transitions.map((t) => t.id)], [['a', 'b'], ['t1']]);
  await tool('↶');
  m = await model();
  assert.deepEqual([m.states.map((s) => s.id), m.transitions.map((t) => t.id)], [['a', 'b', 'c'], ['t2', 't1', 't4']]);
  await page.menu('Edit', 'Redo');
  assert.deepEqual((await model()).states.map((s) => s.id), ['a', 'b']);
  await page.menu('Edit', 'Undo');
  await page.menu('Edit', 'Undo');
  assert.equal(await order(), 't2,t1,t3,t4');
  assert.deepEqual(await warnings(), WARN_FSM('C'));
  // the redo history is kept: ↷ deletes t3 again, and that is saved
  await tool('↷');
  assert.equal(await order(), 't2,t1,t4');
  await page.waitFor(async () => (await (await fetch('/api/projects/FsmEd/file?path=src%2Fpri.fsm.json')).json()).transitions.map((t) => t.id).join(',') === 't2,t1,t4', [], { what: 'saved', timeout: 15000 });
  assert.equal(await savedOrder(), 't2,t1,t4');
  assert.deepEqual(await fsmFile('FsmEd', 'src/pri.fsm.json'), await model());
});
