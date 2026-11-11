// The MCP server's drawings' diffs and conflicts (#3197, server/mcp-git.js) through the system's git, against a local
// bare repository: git_diff of a state diagram by its objects (the last commit to now, a commit to a commit) and of an
// HDL file by its lines; git_pull's conflict of a drawing named with each object's id, then resolved with `resolve`;
// a choice that is neither mine nor theirs refused.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scratchEnv, ROOT } from './server-helpers.js';

let tmp, ws, bare;
const G = await import('../server/git.js');
const { handle } = await import('../server/mcp.js');
const FSM = 'src/traffic.fsm.json';
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const edit = (dir, fn) => { const f = path.join(dir, FSM); const m = JSON.parse(fs.readFileSync(f, 'utf8')); fn(m); fs.writeFileSync(f, `${JSON.stringify(m, null, 2)}\n`); };
const t1 = (m) => m.transitions.find((x) => x.id === 't1');

before(async () => {
  tmp = fs.realpathSync(await scratchEnv('silinx-mcp-git-merge-'));
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
  await ok('git_clone', { url: bare, name: 'traffic' });
});
after(() => { G.GIT_TESTING.localRemotes = false; fs.rmSync(tmp, { recursive: true, force: true }); });

test('git_diff: a state diagram by its objects (the last commit to now, a commit to a commit), an HDL file by its lines', async () => {
  const dir = path.join(ws, 'traffic');
  assert.equal((await ok('git_diff', { project: 'traffic', path: FSM })).text, `${FSM}, the last commit to now: no change.`);
  edit(dir, (m) => { m.states[0].x += 20; m.transitions.find((x) => x.id === 't2').cond = 'night and req'; m.transitions = m.transitions.filter((x) => x.id !== 't8'); });
  const d = await ok('git_diff', { project: 'traffic', path: FSM });
  const lines = d.text.split('\n');
  assert.deepEqual(lines, [`${FSM}, the last commit to now: 3 change(s).`, '  removed transitions/t8', '  moved states/s1 (CARS)', '  changed transitions/t2: cond']);
  assert.deepEqual(d.data.diff.moved, [{ coll: 'states', key: 's1', fields: ['x'] }]);
  await ok('git_commit', { project: 'traffic', message: 'Night' });
  const log = (await ok('git_log', { project: 'traffic' })).data.commits;
  const [now, first] = [log[0].commit, log.at(-1).commit];
  assert.equal((await ok('git_diff', { project: 'traffic', path: FSM, from: first, to: now })).text.split('\n').slice(1).join('\n'), lines.slice(1).join('\n'));
  // an HDL file: a unified diff
  fs.appendFileSync(path.join(dir, 'src', 'lamps.vhd'), '-- a note\n');
  const u = await ok('git_diff', { project: 'traffic', path: 'src/lamps.vhd' });
  assert.match(u.text, /^--- src\/lamps\.vhd \(the last commit\)\n\+\+\+ src\/lamps\.vhd \(now\)\n@@ -\d+,\d+ \+\d+,\d+ @@\n/);
  assert.ok(u.text.endsWith('+-- a note\n'));
  fs.writeFileSync(path.join(dir, 'src', 'lamps.vhd'), sh(dir, 'show', 'HEAD:src/lamps.vhd'));
  const none = await call('git_diff', { project: 'traffic', path: 'src/none.vhd' });
  assert.equal(none.text, 'git_diff: no file \'src/none.vhd\' in the last commit nor now');
  await ok('git_push', { project: 'traffic' });
});

test('git_pull: a drawing\'s conflict named with each object\'s id; resolved with resolve; a choice neither mine nor theirs refused', async () => {
  const dir = path.join(ws, 'traffic');
  const other = path.join(tmp, 'other');
  sh(tmp, 'clone', '--quiet', bare, other);
  edit(other, (m) => { t1(m).cond = 'night or req'; });
  sh(other, 'commit', '--quiet', '-am', 'Theirs');
  sh(other, 'push', '--quiet');
  edit(dir, (m) => { t1(m).cond = 'not night'; });
  await ok('git_commit', { project: 'traffic', message: 'Mine' });
  const r = await call('git_pull', { project: 'traffic' });
  assert.equal(r.isError, true);
  assert.equal(r.text, [`git_pull: git pull: a conflict in ${FSM}: nothing was pulled, the project's files are as they were`,
    `  ${FSM}: transitions/t1 (transitions t1): mine changed (cond), theirs changed (cond)`,
    'Hint: The same objects of a drawing changed here and on GitHub: choose mine or theirs for each, then Pull again.'].join('\n'));
  const bad = await call('git_pull', { project: 'traffic', resolve: { [FSM]: { 'transitions/t1': 'both' } } });
  assert.equal(bad.isError, true);
  const p = await ok('git_pull', { project: 'traffic', resolve: { [FSM]: { 'transitions/t1': 'theirs' } } });
  assert.match(p.text, new RegExp(`\\n${FSM.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: merged by its objects, its HDL made again\\.$`));
  assert.equal(t1(JSON.parse(fs.readFileSync(path.join(dir, FSM), 'utf8'))).cond, 'night or req');
  assert.equal((await ok('git_status', { project: 'traffic' })).text, 'traffic: main, 2 commit(s) ahead of and 0 behind origin/main; no change since the last commit.');
});
