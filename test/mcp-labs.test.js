// The MCP server's lab tool (server/mcp-labs.js, #3179): the labs of a project listed, a step shown, checked on a right
// and a wrong project (the reasons and the hint, the try recorded in labs/progress.json), resumed, restarted; a
// process's step on the project's last run (run_process); a link that opens a lab (project_link, open_link); a teacher's
// lab of the project, written with new_source and checked as it is edited (validate); its wrong arguments.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-labs-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const lab = args => ok('lab', { project: 'g', ...args });
const LAB = 'gates-first-steps';
// gates.vhd with the output even (= not d): the step "even"'s right action; wrong: even = d
const withEven = (vhd, expr = 'not d') => vhd.replace('led : out std_logic_vector(1 downto 0)', 'led : out std_logic_vector(1 downto 0);\n    even : out std_logic')
  .replace('begin\n  d <=', `begin\n  even <= ${expr};\n  d <=`);

test('lab: the gates example\'s first steps listed, shown, checked step by step (right and wrong), resumed, restarted', async () => {
  await ok('new_project_from_example', { name: 'g', example: 'gates' });
  const list = await lab({ action: 'list' });
  assert.equal(list.text, ['gates-first-steps: "First steps" (Silinx\'s, for the gates example), 0 of 5 step(s) done',
    'traffic-state-machine: "A state machine" (Silinx\'s, for the traffic example), 0 of 4 step(s) done',
    'blinky-clock-board: "The clock and the board" (Silinx\'s, for the blinky example), 0 of 6 step(s) done',
    'stopwatch-emulator: "The emulator" (Silinx\'s, for the stopwatch example), 0 of 5 step(s) done'].join('\n'));
  assert.deepEqual(list.data.labs[0], { id: LAB, title: 'First steps', source: 'silinx', example: 'gates', steps: 5, done: 0, step: 1 });
  assert.deepEqual(list.data.problems, []);
  assert.equal((await lab({ action: 'list', language: 'pt' })).data.labs[0].title, 'Primeiros passos');
  // the first step shown, in Portuguese too
  const show = await lab({ action: 'show', lab: LAB });
  assert.match(show.text, /^Lab "First steps", step 1 of 5: The project\nThe Design pane lists the module `gates`/);
  assert.deepEqual([show.data.step.number, show.data.step.id, show.data.step.done, show.data.step.tries], [1, 'project', false, 0]);
  assert.match((await lab({ action: 'show', lab: LAB, step: 1, language: 'pt' })).data.step.title, /^O projeto$/);
  // the steps the example passes as it is: each ticked, the lab at the next one
  for (const [k, sid] of ['project', 'syntax', 'simulate'].entries()) {
    const r = await lab({ action: 'check', lab: LAB, step: sid });
    assert.equal(r.data.ok, true, r.text);
    assert.equal(r.data.next, k + 2);
    assert.equal(r.text.split('\n').at(-1), `Next: step ${k + 2}, ${['Check Syntax', 'Simulate', 'Add an output'][k]}.`);
  }
  // "even" on the example as it is: not done, why, and its hint
  const no = await lab({ action: 'check', lab: LAB });
  assert.equal(no.data.ok, false);
  assert.equal(no.text, ['Lab "First steps", step 4 of 5: Add an output', 'WARNING: module gates has no port even', 'WARNING: there is no signal uut/even in tb_gates',
    'Not done yet (2 problem(s)).', 'Hint: A number is even when its last bit, d, is 0: even = NOT d. The output must be called even, one bit, an output.'].join('\n'));
  assert.equal(no.data.step.tries, 1);
  const vhd = (await ok('read_file', { project: 'g', path: 'src/gates.vhd' })).text;
  // a wrong one: even = d (the port right, its values not)
  fs.writeFileSync(`${tmp}/ws/g/src/gates.vhd`, withEven(vhd, 'd'));
  const wrong = await lab({ action: 'check', lab: LAB, step: 'even' });
  assert.deepEqual(wrong.data.results.map(r => [r.check, r.ok, r.reasons]), [['module', true, []],
    ['simulate', false, ['uut/even is 0 at 5 ns, not 1', 'uut/even is 1 at 15 ns, not 0', 'uut/even is 0 at 25 ns, not 1', 'uut/even is 1 at 115 ns, not 0']]]);
  assert.equal(wrong.data.step.tries, 2);
  // the right one
  fs.writeFileSync(`${tmp}/ws/g/src/gates.vhd`, withEven(vhd));
  const right = await lab({ action: 'check', lab: LAB, step: 'even' });
  assert.equal(right.data.ok, true, right.text);
  assert.equal(right.data.next, 5);
  // the pin: not yet; then its line in the constraints
  assert.equal((await lab({ action: 'check', lab: LAB })).data.results[0].reasons.length, 1);
  const ucf = `${tmp}/ws/g/constraints/gates.ucf`;
  fs.appendFileSync(ucf, 'NET "even" LOC = "P7" ;\n');
  const pin = await lab({ action: 'check', lab: LAB });
  assert.equal(pin.data.ok, true, pin.text);
  assert.equal(pin.data.labDone, true);
  assert.equal(pin.text.split('\n').at(-1), 'Every step of the lab is done.');
  // the progress, in the project: resumed by another client, listed as done
  const progress = JSON.parse(fs.readFileSync(`${tmp}/ws/g/labs/progress.json`, 'utf8'));
  assert.deepEqual(Object.keys(progress[LAB].done), ['project', 'syntax', 'simulate', 'even', 'pin']);
  assert.deepEqual(progress[LAB].tries, { even: 2, pin: 1 });
  assert.equal((await lab({ action: 'list' })).data.labs[0].done, 5);
  // a step done that breaks again is not done any more
  fs.writeFileSync(ucf, fs.readFileSync(ucf, 'utf8').replace('NET "even"', 'NET "odd"'));
  assert.equal((await lab({ action: 'check', lab: LAB, step: 5 })).data.step.done, false);
  // restarted
  assert.equal((await lab({ action: 'restart', lab: LAB })).text, 'Lab "First steps" restarted: no step done.');
  assert.deepEqual((await lab({ action: 'list' })).data.labs[0], { id: LAB, title: 'First steps', source: 'silinx', example: 'gates', steps: 5, done: 0, step: 1 });
});

test('lab: a process\'s step on the last run: not run, run (run_process), the sources changed since, run again', async () => {
  await ok('new_project_from_example', { name: 'traffic', example: 'traffic' });
  const T = { project: 'traffic', lab: 'traffic-state-machine', step: 'synthesize' };
  const first = await ok('lab', { project: 'traffic', action: 'list' });
  assert.equal(first.data.labs[0].id, 'traffic-state-machine', 'the example\'s lab first');
  const none = await ok('lab', { ...T, action: 'check' });
  assert.deepEqual(none.data.results, [{ check: 'process', ok: false, reasons: ['Synthesize has not run: run it (the Processes pane)'] }]);
  await ok('run_process', { project: 'traffic', process: 'synthesize' });
  const yes = await ok('lab', { ...T, action: 'check' });
  assert.equal(yes.data.ok, true, yes.text);
  // a source changed after the run (its time later than the run's): out of date; a test bench's change is not one
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(`${tmp}/ws/traffic/sim/tb_traffic.vhd`, later, later);
  assert.equal((await ok('lab', { ...T, action: 'check' })).data.ok, true, 'the test bench: not an input of the synthesis');
  fs.utimesSync(`${tmp}/ws/traffic/src/timer.vhd`, later, later);
  const stale = await ok('lab', { ...T, action: 'check' });
  assert.deepEqual(stale.data.results[0].reasons, ['the sources changed since Synthesize ran: run it again']);
  assert.match(stale.text, /\nHint: Run Synthesize after the last change/);
  const t = new Date(Date.now() - 60000);
  fs.utimesSync(`${tmp}/ws/traffic/src/timer.vhd`, t, t);
  assert.equal((await ok('lab', { ...T, action: 'check' })).data.ok, true);
  assert.deepEqual((await ok('lab', { project: 'traffic', lab: 'traffic-state-machine', action: 'check', step: 'output' })).data.results.map(r => r.reasons[0] ?? null), ['src/traffic.fsm.json has nothing like \'"walking"\'', null, 'module traffic has no port walking', 'there is no signal uut/u_fsm/walking in tb_traffic']);
});

test('#3179 a link that opens a lab: project_link\'s lab, open_link\'s; a lab the project has not', async () => {
  await ok('new_project_from_example', { name: 'stopwatch', example: 'stopwatch' });
  const l = await ok('project_link', { project: 'stopwatch', view: 'emulate', lab: 'stopwatch-emulator' });
  assert.match(l.data.link, /&view=emulate&lab=stopwatch-emulator$/);
  assert.equal(l.data.lab, 'stopwatch-emulator');
  assert.match(l.text, /\nThe link of 'stopwatch', opening the board emulator, with the lab 'stopwatch-emulator' \(\d+ characters\):\n/);
  const bad = await call('project_link', { project: 'stopwatch', lab: 'nope' });
  assert.equal(bad.isError, true);
  assert.match(bad.text, /lab: no lab 'nope' in the project 'stopwatch' \(stopwatch-emulator, gates-first-steps, traffic-state-machine, blinky-clock-board\)$/);
  // opened: the same project already, the link's lab said
  const o = await ok('open_link', { link: l.data.link });
  assert.deepEqual([o.data.project, o.data.created, o.data.lab, o.data.warnings], ['stopwatch', false, 'stopwatch-emulator', []]);
  assert.match(o.text, /; the link opens the lab 'stopwatch-emulator' \(lab action show\)\.$/);
  const none = await ok('open_link', { link: '#open=example:gates&lab=nope', name: 'g2' });
  assert.deepEqual([none.data.lab, none.data.warnings], ['nope', ['WARNING: the project has no lab \'nope\' (lab action list)']]);
  assert.equal((await ok('open_link', { link: '#open=example:gates', name: 'g3' })).data.lab, undefined, 'none in a link without one');
});

test('lab: a teacher\'s lab in the project (a step with no checks marked done), a file that is not a lab, wrong arguments', async () => {
  await ok('new_project_from_example', { name: 't', example: 'gates' });
  const mine = { silinxLab: 1, id: 'mine', title: 'Mine', steps: [{ id: 'read', title: 'Read', text: 'Read it.' }, { id: 'top', title: 'Top', text: 'Set the top.', checks: [{ check: 'project', top: 'other' }] }] };
  fs.mkdirSync(`${tmp}/ws/t/labs`);
  fs.writeFileSync(`${tmp}/ws/t/labs/mine.lab.json`, JSON.stringify(mine));
  fs.writeFileSync(`${tmp}/ws/t/labs/bad.lab.json`, '{ "silinxLab": 1 }');
  const list = await ok('lab', { project: 't', action: 'list' });
  assert.deepEqual(list.data.labs.map(l => [l.id, l.source]), [['mine', 'labs/mine.lab.json'], [LAB, 'silinx'], ['traffic-state-machine', 'silinx'], ['blinky-clock-board', 'silinx'], ['stopwatch-emulator', 'silinx']]);
  assert.deepEqual(list.data.problems, ['labs/bad.lab.json: "id": letters, digits, - and _ (at most 64)', 'labs/bad.lab.json: "title": a text, or { "en": …, "pt": … }', 'labs/bad.lab.json: "steps": a list of steps']);
  assert.match(list.text, /\nWARNING: labs\/bad\.lab\.json: "id"/);
  assert.equal((await ok('lab', { project: 't', action: 'check', lab: 'mine' })).data.ok, true, 'a reading step: done when checked');
  const top = await ok('lab', { project: 't', action: 'check', lab: 'mine' });
  assert.deepEqual(top.data.results, [{ check: 'project', ok: false, reasons: ['the project\'s top module is \'gates\', not \'other\''] }]);
  for (const [args, msg] of [[{ action: 'show' }, /^lab: lab: the lab's id \(mine, gates-first-steps, traffic-state-machine, blinky-clock-board, stopwatch-emulator: action list\)$/], [{ action: 'show', lab: 'x' }, /^lab: no lab 'x' in the project 't' \(mine, gates-first-steps, traffic-state-machine, blinky-clock-board, stopwatch-emulator\)$/],
    [{ action: 'show', lab: 'mine', step: 9 }, /^lab: step: the lab 'mine' has steps 1 to 2 \(read, top\)$/], [{ action: 'x' }, /^lab: action: one of list, show, check, restart, validate$/]]) {
    const r = await call('lab', { project: 't', ...args });
    assert.equal(r.isError, true);
    assert.match(r.text, msg);
  }
  assert.match((await call('lab', { project: 'none', action: 'list' })).text, /no project 'none' in the workspace/);
});

test('#3179 a teacher\'s lab: new_source type lab writes its template, validate checks the file as it is edited, the lab runs', async () => {
  await ok('new_project_from_example', { name: 'w', example: 'gates' });
  const made = await ok('new_source', { project: 'w', type: 'lab', name: 'week1' });
  assert.equal(made.text, 'Created Guided Lab \'labs/week1.lab.json\'.');
  assert.equal(made.data.path, 'labs/week1.lab.json');
  const v = await ok('lab', { project: 'w', action: 'validate', file: 'labs/week1.lab.json' });
  assert.deepEqual([v.text, v.data.ok, v.data.lab, v.data.problems], ['The lab labs/week1.lab.json can be run (Project ▸ Guided Labs…).', true, 'week1', []]);
  assert.equal((await ok('lab', { project: 'w', action: 'list' })).data.labs[0].id, 'week1', 'the project\'s own lab first');
  // edited: a check of an unknown kind, a step with no title
  const lab = JSON.parse(fs.readFileSync(`${tmp}/ws/w/labs/week1.lab.json`, 'utf8'));
  lab.steps[1].checks = [{ check: 'board' }];
  delete lab.steps[0].title;
  fs.writeFileSync(`${tmp}/ws/w/labs/week1.lab.json`, JSON.stringify(lab));
  const bad = await ok('lab', { project: 'w', action: 'validate', file: 'labs/week1.lab.json' });
  assert.equal(bad.data.ok, false);
  assert.equal(bad.text, ['ERROR: labs/week1.lab.json: step 1: "title": a text', 'ERROR: labs/week1.lab.json: step 2, check 1: "check": one of project, file, module, syntax, simulate, drawing, pins, process',
    'The lab labs/week1.lab.json has 2 problem(s): Project ▸ Guided Labs… leaves it out until they are fixed.'].join('\n'));
  fs.writeFileSync(`${tmp}/ws/w/labs/week1.lab.json`, '{');
  assert.match((await ok('lab', { project: 'w', action: 'validate', file: 'labs/week1.lab.json' })).text, /^ERROR: labs\/week1\.lab\.json: not JSON \(/);
  // the wrong ones: not a lab file, none there, another folder, a lab of that name already
  for (const [args, msg] of [[{ action: 'validate', file: 'src/gates.vhd' }, /^lab: file: a lab file of the project, labs\/<name>\.lab\.json$/], [{ action: 'validate', file: 'labs/none.lab.json' }, /^lab: no file labs\/none\.lab\.json in the project 'w'$/]]) {
    const r = await call('lab', { project: 'w', ...args });
    assert.equal(r.isError, true);
    assert.match(r.text, msg);
  }
  assert.match((await call('new_source', { project: 'w', type: 'lab', name: 'x', location: 'src' })).text, /A guided lab is in the labs folder: Location labs\.$/);
  assert.match((await call('new_source', { project: 'w', type: 'lab', name: 'week1' })).text, /labs\/week1\.lab\.json already exists: choose another name\.$/);
});
