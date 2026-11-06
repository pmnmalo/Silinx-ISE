// UI (#2450): every action the Silinx interface lets the user reach the ISE style one does too, and the other way round:
// with a project open and each kind of editor open, the menus, the toolbars (and their "more" menus), the context menus
// of the panes and of the editors, the Processes and the command search's commands, compared by their
// label (test/ui/interface-actions.js); the differences are the allow-list's, each with its reason. Every command of the
// command search runs in both. Run in either interface, the other opened beside it. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { newPetri } from '../../core/petri.js';
import { newTable } from '../../core/logic.js';
import { newModel } from '../../core/asm.js';
import { newDoc } from '../../core/schdoc.js';
import { setupUi, uiTest, makeProject, ROOT } from './harness.js';
import { actionKey, collectActions, paletteCommands, runCommands } from './interface-actions.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const FILES = {
  'src/net.pn.json': JSON.stringify(newPetri('net')),
  'src/maj.tt.json': JSON.stringify(newTable('maj', ['a', 'b', 'c'], ['f'])),
  'src/ctrl.asm.json': JSON.stringify(newModel('ctrl')),
  'src/glue.sch.json': JSON.stringify(newDoc('glue')),
  'src/isqrt.c': fs.readFileSync(`${ROOT}/examples/isqrt/src/isqrt.c`, 'utf8'),
};
// a document of each kind of editor: FSM, Boolean algebra, Petri net, truth table, ASM, schematic, C, VHDL, Verilog,
// UCF, test bench; the Design Summary, iMPACT and the pin planner
const OPEN = ['src/traffic.fsm.json', 'src/lamps.bool.json', 'src/net.pn.json', 'src/maj.tt.json', 'src/ctrl.asm.json',
  'src/glue.sch.json', 'src/isqrt.c', 'src/traffic.vhd', 'src/sevenseg.v', 'constraints/traffic.ucf', 'sim/tb_traffic.vhd',
  { open: 'openSummary' }, { open: 'openImpact' }, { open: 'openPinPlanner' }];

// the same action under another label in the other interface: [its key there, the key it is reached by here]
const SAME = [
  ['about', 'about silinx ise'],   // the ISE style's toolbar; the Silinx interface's Settings, both interfaces' Help
  ['toolchain settings', 'toolchain settings (ise / programmers)'],   // (the same)
  ['configure target device (impact)', 'impact (configure target device)'],   // the toolbar's; Tools ▸ iMPACT
  ['stop the running process', 'stop'],   // the toolbar's; Process ▸ Stop
  ['new asm state diagram', 'asm state machine editor'],   // the toolbar's; Tools ▸ ASM State Machine Editor… (both the
  // New Source wizard on an ASM chart)
  ['import source', 'add copy of source'],   // Project ▸ Add Copy of Source… is Import Source… in the Silinx interface (#1501)
  ['search commands and files', 'command palette'],   // the Silinx header's search; View ▸ Command Palette…
  ['check design', 'check syntax'],
  ['emulate on board', 'process:emulate'],   // Emulate's button: Processes ▸ Emulate on Board   // Design's Check Design: the top module's Check Syntax (#1309)
  ['new test bench', 'create test bench (wizard)'],   // Simulate's New Test Bench…: the Test Bench wizard
  ['import test bench', 'add copy of source'],   // Simulate's Import Test Bench…: a source imported
  ['add copy to project', 'add copy of source'],   // the Silinx interface's Files page: Add Copy to Project… (#1214)
];

// the differences that are the interfaces' own: [the interface that alone has it, its key, why]
const ALLOW = [
  // the Silinx interface's layout by tasks (#1149): its tasks, folds and maximized document; the ISE style's views and
  // panes, sized by their splitters as ISE's
  ['silinx', 'simulate', 'the Silinx interface\'s Simulate task (the ISE style\'s Simulation view)'],
  ['silinx', 'implement', 'the Silinx interface\'s Implement task (the ISE style\'s Implementation view and its Processes)'],
  ['silinx', 'emulate', 'the Silinx interface\'s Emulate task (the ISE style\'s Processes ▸ Emulate on Board)'],
  ['silinx', 'show or hide the side panel', 'the Silinx interface\'s layout: the ISE style\'s panes are sized by their splitters'],
  ['silinx', 'show or hide the messages', 'the same'],
  ['silinx', 'maximize the document (double-click its tab)', 'the same'],
  ['silinx', 'settings', 'the Silinx header\'s Settings menu: its items are the ISE style\'s View and Help menus\' ones'],
  ['silinx', 'board, programming tool and cable', 'the Silinx interface folds iMPACT\'s settings once a board is chosen; the ISE style shows them always'],
  ['silinx', 'simulate tb_traffic', 'Simulate\'s button: the test bench\'s Simulate Behavioral Model, the ISE style\'s Processes ▸ Simulate Behavioral Model'],
  // the ISE style's Simulation view's Processes: the Silinx interface's Simulate chooses the model in its bar and
  // generates the one it needs (#1265, #490)
  ['ise', 'ssim simulator', 'the Simulation view\'s SSim Simulator group: the Silinx interface\'s Simulate task'],
  ['ise', 'behavioral check syntax', 'the Silinx interface\'s Simulate checks the test bench before it runs it'],
  ...['Post-Synthesis', 'Post-Translate', 'Post-Map', 'Post-Place & Route'].flatMap((m) => [
    ['ise', actionKey(`Simulate ${m} Model`), 'a netlist simulated: the Silinx interface\'s Simulate, its model chosen in its bar'],
    ['ise', actionKey(`Generate ${m} Simulation Model`), 'the Silinx interface\'s Simulate generates the model it needs'],
  ]),
  // the ISE style's View menu for the document in front; the Silinx interface's is its tab's menu (#2834)
  ['ise', 'show vhdl beside', 'the ISE style\'s View menu: the Silinx interface\'s tab menu (Show … Beside)'],
  ['ise', 'show verilog beside', 'the same'],
];

const OTHER = { silinx: 'ise', ise: 'silinx' };
const ui = () => process.env.SILINX_UI_INTERFACE || 'silinx';
const keys = (list) => {
  const m = new Map();
  for (const a of list) { const k = actionKey(a.label); if (k) m.set(k, [...(m.get(k) || []), a.where]); }
  return m;
};
/** Another page of the other interface, booted, its project open. */
async function otherPage(page, name) {
  const p = await env.newPage(undefined, { ui: OTHER[ui()] });
  await p.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
  await p.setViewport(1440, 900);
  await p.openProject(name);
  return p;
}
const warnings = (page) => page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text);

uiTest('#2450 every action of one interface reachable in the other, but the allow-list\'s', E, async (page) => {
  await makeProject(env, { name: 'Parity', template: 'traffic', files: FILES });
  await page.setViewport(1440, 900);
  await page.openProject('Parity');
  const other = await otherPage(page, 'Parity');
  try {
    const sets = {};
    for (const [u, p] of [[ui(), page], [OTHER[ui()], other]]) sets[u] = keys([...await collectActions(p, OPEN), ...await paletteCommands(p)]);
    assert.equal(await page.eval(() => document.documentElement.dataset.ui), ui());
    assert.equal(await other.eval(() => document.documentElement.dataset.ui), OTHER[ui()]);
    // (an action and its other label: one key)
    for (const m of Object.values(sets)) for (const [a, b] of SAME) if (m.has(a) && !m.has(b)) m.set(b, m.get(a));
    for (const m of Object.values(sets)) for (const [a] of SAME) m.delete(a);
    const only = (a) => [...sets[a].keys()].filter((k) => !sets[OTHER[a]].has(k)).sort();
    for (const u of ['silinx', 'ise']) {
      const allowed = ALLOW.filter(([x]) => x === u).map(([, k]) => k).sort();
      const missing = only(u).filter((k) => !allowed.includes(k)).map((k) => `${k} (${sets[u].get(k).slice(0, 2).join(' | ')})`);
      assert.deepEqual(missing, [], `in the ${u} interface only, missing in the ${OTHER[u]} one`);
      assert.deepEqual(allowed.filter((k) => !only(u).includes(k)), [], `allowed in the ${u} interface only but no longer a difference`);
    }
    // (enough found: the menus, the toolbars, the editors' and the panes' menus, the processes)
    for (const u of ['silinx', 'ise']) assert.ok(sets[u].size > 200, `${u}: ${sets[u].size} actions`);
    assert.deepEqual(warnings(page), []);
    assert.deepEqual(warnings(other), []);
  } finally { await other.close(); }
}, { timeout: 300000 });

uiTest('#2450 every command of the command search runs, in both interfaces', E, async (page) => {
  await makeProject(env, { name: 'ParityRun', template: 'traffic' });
  await page.setViewport(1440, 900);
  await page.openProject('ParityRun');
  const other = await otherPage(page, 'ParityRun');
  try {
    const ran = [];
    for (const p of [page, other]) {
      const r = await runCommands(p);
      ran.push(r.ran.filter((c) => !/^Window › (?!Close All Documents$)/.test(c)));   // (the Window menu's documents: the ones open)
      assert.ok(r.ran.length > 25, `${r.ran.length} commands run`);
      assert.deepEqual(r.failed, [], 'the commands that failed');
      assert.deepEqual(p.errors, []);
      assert.deepEqual(warnings(p), []);
    }
    // (the same commands in both, but Add Copy of Source…, Import Source… in the Silinx interface: #1501)
    const same = (l) => l.map((c) => c.replace('Project › Import Source…', 'Project › Add Copy of Source…')).sort();
    assert.deepEqual(same(ran[0]), same(ran[1]));
  } finally { await other.close(); }
}, { timeout: 300000 });
