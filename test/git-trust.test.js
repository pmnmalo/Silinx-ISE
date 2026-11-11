// Git keeps a project's untrusted state (#2830, server/git.js, server/projects.js keepTrustInRepo): an untrusted project
// put in a repository keeps its mark in the repository's .git, never in what git tracks, so that no pull trusts it,
// whatever the pulled silinx.json says; Xilinx ISE stays refused (the MCP's run_process and the interface's route) until
// the user trusts it. The workspace's repository: its untrusted projects stay so, and a project a pull brings is
// untrusted. Against local bare repositories (no network; GIT_TESTING.localRemotes).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scratchEnv, startApp, ROOT } from './server-helpers.js';

let tmp, ws;
const G = await import('../server/git.js');
const P = await import('../server/projects.js');
const { handle } = await import('../server/mcp.js');
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true); assert.equal(r.text, `${name}: ${message}`); };
const bareRepo = name => { const b = path.join(tmp, 'remotes', `${name}.git`); fs.mkdirSync(b, { recursive: true }); sh(b, 'init', '--quiet', '--bare'); return b; };
const tracked = (dir, rel = 'silinx.json') => JSON.parse(sh(dir, 'show', `HEAD:${rel}`));
const ISE_BY_MCP = name => `project '${name}' was made through the MCP server (by an assistant): Xilinx ISE runs only once you trust it (Trust Project, in the console when the project opens)`;
const ISE_OUTSIDE = name => `project '${name}' came from outside (imported): Xilinx ISE runs only once you trust it (Trust Project, in the console when the project opens)`;

before(async () => {
  tmp = fs.realpathSync(await scratchEnv('silinx-git-trust-'));
  ws = process.env.SILINX_WORKSPACE;
  fs.writeFileSync(path.join(tmp, 'gitconfig'), '[user]\n\tname = Ana Aluna\n\temail = ana@example.com\n[init]\n\tdefaultBranch = main\n');
  Object.assign(process.env, { GIT_CONFIG_GLOBAL: path.join(tmp, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1', HOME: tmp });
  G.GIT_TESTING.localRemotes = true;
  // (the remotes the MCP may set, #3363: the tests' local repositories)
  fs.writeFileSync(path.join(process.env.SILINX_CONFIG_DIR, 'config.json'), JSON.stringify({ mcp: { remotes: ['local/*'] } }));
});
after(() => { G.GIT_TESTING.localRemotes = false; fs.rmSync(tmp, { recursive: true, force: true }); });

test('a pulled silinx.json without the mark: the MCP\'s project stays untrusted, Xilinx ISE refused (run_process and the route)', async () => {
  const bare = bareRepo('mine');
  await ok('new_project_from_example', { name: 'mine', example: 'gates' });
  assert.equal((await ok('git_init', { project: 'mine', remote: bare })).text, `Repository made for 'mine', its remote ${bare}; .gitignore written.`);
  // the mark in .git, not in what git tracks
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(ws, 'mine', P.CLONE_TRUST), 'utf8')), { trusted: false, madeBy: 'mcp' });
  await ok('git_commit', { project: 'mine', message: 'Gates' });
  await ok('git_push', { project: 'mine' });
  // a clone of it, its description changed (written without the mark, the clone's being in its .git), pushed
  await ok('git_clone', { url: bare, name: 'copy' });
  await P.updateProject('copy', pj => ({ ...pj, description: 'changed' }));
  assert.deepEqual(['trusted' in JSON.parse(fs.readFileSync(path.join(ws, 'copy', 'silinx.json'), 'utf8')), (await P.readProject('copy')).trusted], [false, false]);
  await ok('git_commit', { project: 'copy', message: 'Description' });
  await ok('git_push', { project: 'copy' });
  // pulled into the first: its tracked silinx.json has no mark, and the project is untrusted still
  assert.equal((await ok('git_pull', { project: 'mine' })).text.split('\n')[0], 'Pulled into main: 1 file(s) changed.');
  const head = tracked(path.join(ws, 'mine'));
  assert.deepEqual([head.description, 'trusted' in head], ['changed', false]);
  const pj = await P.readProject('mine');
  assert.deepEqual([pj.trusted, pj.madeBy, pj.description], [false, 'mcp', 'changed']);
  await fails('run_process', { project: 'mine', process: 'synthesize', toolchain: 'ise' }, ISE_BY_MCP('mine'));
  // the interface's Pull and Implement: the same
  await P.updateProject('copy', p => ({ ...p, description: 'again' }));
  await ok('git_commit', { project: 'copy', message: 'Again' });
  await ok('git_push', { project: 'copy' });
  const app = await startApp();
  try {
    const r = await app.call('POST', '/projects/mine/git/pull');
    assert.deepEqual([r.status, r.body.files], [200, ['silinx.json']]);
    assert.equal((await P.readProject('mine')).description, 'again');
    const i = await app.call('POST', '/projects/mine/implement', { toolchain: 'ise' });
    assert.deepEqual([i.status, i.body], [403, { error: ISE_BY_MCP('mine') }]);
    // only the user's Trust Project trusts it, and clears the mark
    assert.equal((await app.call('POST', '/projects/mine/trust')).status, 200);
    assert.deepEqual([(await P.readProject('mine')).trusted, fs.existsSync(path.join(ws, 'mine', P.CLONE_TRUST))], [undefined, false]);
  } finally { await app.close(); }
});

test('a project put in a repository before (its mark in silinx.json only): the pull keeps it untrusted', async () => {
  const bare = bareRepo('old');
  await P.createProject({ name: 'old', template: 'gates', fromOutside: true });
  const dir = path.join(ws, 'old');
  // made by git outside Silinx: the mark in the tracked silinx.json, none in .git
  sh(dir, 'init', '--quiet'); sh(dir, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  sh(dir, 'add', '-A'); sh(dir, 'commit', '--quiet', '-m', 'Old'); sh(dir, 'push', '--quiet', bare, 'main');
  sh(dir, 'remote', 'add', 'origin', bare);
  assert.equal(tracked(dir).trusted, false);
  const theirs = path.join(tmp, 'theirs-old');
  sh(tmp, 'clone', '--quiet', bare, theirs);
  const { trusted, ...json } = tracked(theirs);   // eslint-disable-line no-unused-vars
  fs.writeFileSync(path.join(theirs, 'silinx.json'), JSON.stringify(json, null, 2) + '\n');
  sh(theirs, 'commit', '--quiet', '-am', 'No mark'); sh(theirs, 'push', '--quiet');
  assert.deepEqual(await G.gitPull('old'), { project: 'old', branch: 'main', upToDate: false, files: ['silinx.json'] });
  assert.equal('trusted' in JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8')), false);
  assert.equal((await P.readProject('old')).trusted, false);
  const { startImplementation } = await import('../server/impl-routes.js');
  await assert.rejects(startImplementation('old', { toolchain: 'ise' }), { message: ISE_OUTSIDE('old'), status: 403 });
  // a trusted project's repository holds no mark
  await P.createProject({ name: 'own', template: 'gates' });
  await G.gitInit('own');
  assert.deepEqual([fs.existsSync(path.join(ws, 'own', P.CLONE_TRUST)), (await P.readProject('own')).trusted], [false, undefined]);
  // a mark that cannot be read: untrusted
  fs.writeFileSync(path.join(ws, 'own', P.CLONE_TRUST), 'not json');
  assert.equal((await P.readProject('own')).trusted, false);
  await P.trustProject('own');
  assert.equal((await P.readProject('own')).trusted, undefined);
});

test('the workspace\'s repository: its untrusted project stays so, and a project a pull brings is untrusted', async () => {
  const bare = bareRepo('workspace');
  const seed = path.join(tmp, 'seed-ws');
  for (const n of ['a', 'b']) fs.cpSync(path.join(ROOT, 'examples', 'gates'), path.join(seed, n), { recursive: true });
  sh(seed, 'init', '--quiet'); sh(seed, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  sh(seed, 'add', '-A'); sh(seed, 'commit', '--quiet', '-m', 'Two'); sh(seed, 'push', '--quiet', bare, 'main');
  const prev = process.env.SILINX_WORKSPACE;
  const wsDir = path.join(tmp, 'ws2');
  sh(tmp, 'clone', '--quiet', bare, wsDir);
  process.env.SILINX_WORKSPACE = wsDir;
  try {
    // b untrusted, its mark in its silinx.json, committed and pushed
    await P.updateProject('b', pj => ({ ...pj, trusted: false }));
    sh(wsDir, 'commit', '--quiet', '-am', 'b untrusted'); sh(wsDir, 'push', '--quiet');
    // another author: b's silinx.json without the mark, a new project c
    const theirs = path.join(tmp, 'theirs-ws');
    sh(tmp, 'clone', '--quiet', bare, theirs);
    const { trusted, ...b } = tracked(theirs, 'b/silinx.json');   // eslint-disable-line no-unused-vars
    fs.writeFileSync(path.join(theirs, 'b', 'silinx.json'), JSON.stringify({ ...b, description: 'b' }, null, 2) + '\n');
    fs.cpSync(path.join(ROOT, 'examples', 'gates'), path.join(theirs, 'c'), { recursive: true });
    sh(theirs, 'add', '-A'); sh(theirs, 'commit', '--quiet', '-m', 'Theirs'); sh(theirs, 'push', '--quiet');
    const r = await G.gitPull('a');
    assert.deepEqual([r.upToDate, r.files], [false, []]);   // (a's own files: none changed)
    assert.deepEqual(['a', 'b', 'c'].map(n => fs.existsSync(path.join(wsDir, n, 'silinx.json'))), [true, true, true]);
    assert.equal((await P.readProject('a')).trusted, undefined);
    assert.deepEqual([(await P.readProject('b')).trusted, (await P.readProject('b')).description], [false, 'b']);
    assert.equal((await P.readProject('c')).trusted, false);
    const { startImplementation } = await import('../server/impl-routes.js');
    for (const n of ['b', 'c']) await assert.rejects(startImplementation(n, { toolchain: 'ise' }), { message: ISE_OUTSIDE(n), status: 403 });
    assert.deepEqual(fs.readdirSync(path.join(wsDir, '.git', 'silinx-trust')).sort(), ['b.json', 'c.json']);
    await P.trustProject('c');
    assert.equal((await P.readProject('c')).trusted, undefined);
    assert.deepEqual(fs.readdirSync(path.join(wsDir, '.git', 'silinx-trust')), ['b.json']);
  } finally { process.env.SILINX_WORKSPACE = prev; }
});
