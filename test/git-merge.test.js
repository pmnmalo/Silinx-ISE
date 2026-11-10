// A pull's drawings merged object by object through the system's git (#3197, server/git-merge.js, server/git.js gitPull)
// against a local bare repository (no network): the traffic example's state diagram changed on both sides. Different
// objects: merged at once (git's text merge of its JSON never used: the repository's info/attributes), its HDL made
// again from the merged drawing, a merge commit. The same object: nothing pulled, its conflict named (`drawings`), then
// resolved "theirs" by the choice, its HDL made again and simulated as its model, in VHDL (its file) and in Verilog. A
// resolution that is no valid drawing (a transition to a removed state) pulls nothing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scratchEnv, ROOT } from './server-helpers.js';
import { viewHdl } from '../core/view-hdl.js';
import { normalizeFsm, generateFsm } from '../core/fsm.js';
import { randomVectors, runHdl, runModel } from './fsm-sim.js';

let tmp, ws, bare;
const G = await import('../server/git.js');
const FSM = 'src/traffic.fsm.json';
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
// a drawing changed in a folder, its HDL made again from it (as its editor does)
function change(dir, fn) {
  const f = path.join(dir, FSM);
  const m = readJson(f);
  fn(m);
  fs.writeFileSync(f, `${JSON.stringify(m, null, 2)}\n`);
  const r = viewHdl(FSM, JSON.stringify(m), { linked: () => false });
  assert.deepEqual(r.errors, []);
  fs.writeFileSync(path.join(dir, m.generatedFile), r.text);
  return m;
}
let n = 0;
// another author: a fresh clone, a change, pushed
function theirs(fn) {
  const dir = path.join(tmp, 'theirs', String(++n));
  sh(tmp, 'clone', '--quiet', bare, dir);
  const m = change(dir, fn);
  sh(dir, 'commit', '--quiet', '-am', `Theirs ${n}`);
  sh(dir, 'push', '--quiet');
  return m;
}
const mine = async (fn) => { const m = change(path.join(ws, 'traffic'), fn); await G.gitCommit('traffic', `Mine ${++n}`); return m; };
const t = (m, id) => m.transitions.find((x) => x.id === id);

before(async () => {
  tmp = fs.realpathSync(await scratchEnv('silinx-git-merge-'));
  ws = process.env.SILINX_WORKSPACE;
  fs.writeFileSync(path.join(tmp, 'gitconfig'), '[user]\n\tname = Ana Aluna\n\temail = ana@example.com\n[init]\n\tdefaultBranch = main\n');
  Object.assign(process.env, { GIT_CONFIG_GLOBAL: path.join(tmp, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1', HOME: tmp });
  G.GIT_TESTING.localRemotes = true;
  bare = path.join(tmp, 'traffic.git');
  fs.mkdirSync(bare);
  sh(bare, 'init', '--quiet', '--bare');
  sh(bare, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  const seed = path.join(tmp, 'seed');
  fs.cpSync(path.join(ROOT, 'examples', 'traffic'), seed, { recursive: true });
  sh(seed, 'init', '--quiet');
  sh(seed, 'add', '-A');
  sh(seed, 'commit', '--quiet', '-m', 'Starter');
  sh(seed, 'push', '--quiet', bare, 'HEAD:main');
  await G.gitClone({ url: bare, name: 'traffic' });
});
after(() => { G.GIT_TESTING.localRemotes = false; fs.rmSync(tmp, { recursive: true, force: true }); });

test('different objects changed on both sides: merged at once, the HDL made again from the merged drawing, a merge commit', async () => {
  const dir = path.join(ws, 'traffic');
  theirs((m) => { t(m, 't2').cond = 'not req'; m.states[3].x += 30; });
  await mine((m) => { t(m, 't3').cond = 'req and not night'; m.states[0].x += 20; });
  const r = await G.gitPull('traffic');
  assert.deepEqual(r.resolved, [FSM]);
  assert.ok(r.files.includes(FSM));
  const m = readJson(path.join(dir, FSM));
  assert.deepEqual([t(m, 't2').cond, t(m, 't3').cond], ['not req', 'req and not night']);
  assert.equal(m.states[0].x, readJson(path.join(ROOT, 'examples', 'traffic', FSM)).states[0].x + 20);
  assert.equal(fs.readFileSync(path.join(dir, m.generatedFile), 'utf8'), viewHdl(FSM, JSON.stringify(m), { linked: () => false }).text);
  // (git never merged the JSON as text: Silinx's attributes; the merge committed, nothing left to commit)
  assert.match(fs.readFileSync(path.join(dir, '.git', 'info', 'attributes'), 'utf8'), /^# Silinx \(#3197\)[^\n]*\n\*\.sch\.json merge=binary\n/);
  assert.equal(sh(dir, 'log', '-1', '--format=%P').trim().split(' ').length, 2);
  assert.deepEqual((await G.gitStatus('traffic')).files, []);
  await G.gitPush('traffic');
});

test('the same object changed differently: nothing pulled and its conflict named; resolved theirs, its HDL simulating as its model in VHDL and Verilog', async () => {
  const dir = path.join(ws, 'traffic');
  const want = theirs((m) => { t(m, 't1').cond = 'night or req'; });
  await mine((m) => { t(m, 't1').cond = 'night and not req'; });
  const head = sh(dir, 'rev-parse', 'HEAD');
  await assert.rejects(G.gitPull('traffic'), (e) => {
    assert.equal(e.message, `git pull: a conflict in ${FSM}, src/traffic.vhd: nothing was pulled, the project's files are as they were`);
    assert.equal(e.hint, 'The same objects of a drawing changed here and on GitHub: choose mine or theirs for each, then Pull again.');
    assert.deepEqual(e.drawings, [{ path: FSM, kind: 'fsm', conflicts: [{ id: 'transitions/t1', label: 'transitions t1', mine: 'changed (cond)', theirs: 'changed (cond)' }] }]);
    return true;
  });
  assert.equal(sh(dir, 'rev-parse', 'HEAD'), head);
  assert.ok(!fs.existsSync(path.join(dir, '.git', 'MERGE_HEAD')));
  assert.equal(t(readJson(path.join(dir, FSM)), 't1').cond, 'night and not req');
  // a choice for an object that is not the conflict's: still asked
  await assert.rejects(G.gitPull('traffic', { resolve: { [FSM]: { 'states/s1': 'theirs' } } }), { status: 409 });
  const r = await G.gitPull('traffic', { resolve: { [FSM]: { 'transitions/t1': 'theirs' } } });
  assert.deepEqual(r.resolved, [FSM]);
  const m = readJson(path.join(dir, FSM));
  assert.deepEqual(t(m, 't1'), t(want, 't1'));
  const hdl = fs.readFileSync(path.join(dir, m.generatedFile), 'utf8');
  const fm = normalizeFsm(m);
  const vectors = randomVectors(fm, 100, 5);
  assert.deepEqual(runHdl(hdl, 'vhdl', fm, vectors), runModel(fm, vectors));
  assert.deepEqual(runHdl(generateFsm(fm, 'verilog').code, 'verilog', fm, vectors), runModel(fm, vectors));
  assert.deepEqual((await G.gitStatus('traffic')).files, []);
  await G.gitPush('traffic');
});

test('a resolution that is no valid drawing pulls nothing: a transition to a state the resolution removed', async () => {
  const dir = path.join(ws, 'traffic');
  theirs((m) => { m.states.find((s) => s.id === 's2').comment = 'theirs'; m.transitions.push({ id: 't99', from: 's1', to: 's2', cond: 'req and night', outputs: {} }); });
  await mine((m) => { m.states = m.states.filter((s) => s.id !== 's2'); m.transitions = m.transitions.filter((x) => x.from !== 's2' && x.to !== 's2'); });
  const head = sh(dir, 'rev-parse', 'HEAD');
  await assert.rejects(G.gitPull('traffic', { resolve: { [FSM]: { 'states/s2': 'mine' } } }), (e) => {
    assert.match(e.message, /^git pull: src\/traffic\.fsm\.json: the resolution is not a valid drawing: transitions t99: points at s2, which the resolution left out.*: nothing was pulled$/);
    assert.equal(e.hint, 'Choose the other side for an object, then Pull again.');
    assert.equal(e.status, 422);
    return true;
  });
  assert.equal(sh(dir, 'rev-parse', 'HEAD'), head);
  assert.ok(!fs.existsSync(path.join(dir, '.git', 'MERGE_HEAD')));
  assert.equal(readJson(path.join(dir, FSM)).states.some((s) => s.id === 's2'), false);
  const r = await G.gitPull('traffic', { resolve: { [FSM]: { 'states/s2': 'theirs' } } });
  assert.deepEqual(r.resolved, [FSM]);
  assert.ok(readJson(path.join(dir, FSM)).transitions.some((x) => x.id === 't99'));
});
