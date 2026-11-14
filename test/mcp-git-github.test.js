// The MCP server's git tools through GitHub's API (#3196, SILINX_GIT=github: server/git-github.js, core/git-rest.js) against
// a stand-in for GitHub (test/fake-github.mjs), no network and no git: git_clone (an untrusted project, made by the
// MCP), git_status after write_file, git_commit pushed at once, git_push with nothing left, git_pull and its conflict,
// git_log and a file as it was, git_init on an empty repository; the token of GH_TOKEN only in the Authorization header,
// never in a result; what a project was at its last commit kept out of the workspace; the interface's routes the same;
// git_checks, the last pushed commit's (#3194).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, ROOT } from './server-helpers.js';
import { fakeGitHub } from './fake-github.mjs';

const GH = await import('../server/git-github.js');
const { handle } = await import('../server/mcp.js');
let tmp, ws, gh;
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); assert.ok(!r.text.includes(gh.token)); return r; };
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true); assert.equal(r.text, `${name}: ${message}`); };
const BLINKY = path.join(ROOT, 'examples', 'blinky');
const filesOf = (dir, base = '') => Object.fromEntries(fs.readdirSync(path.join(dir, base), { withFileTypes: true }).flatMap((e) => {
  const rel = base ? `${base}/${e.name}` : e.name;
  return e.isDirectory() ? Object.entries(filesOf(dir, rel)) : [[rel, fs.readFileSync(path.join(dir, rel), 'utf8')]];
}));

before(async () => {
  tmp = fs.realpathSync(await scratchEnv('silinx-mcp-gh-'));
  ws = process.env.SILINX_WORKSPACE;
  gh = fakeGitHub();
  gh.seed('pmalo/lab1', filesOf(BLINKY));
  gh.seed('pmalo/empty');
  GH.GITHUB_TESTING.fetch = gh.fetch;
  Object.assign(process.env, { SILINX_GIT: 'github', GH_TOKEN: gh.token });
});
after(() => {
  GH.GITHUB_TESTING.fetch = null;
  delete process.env.SILINX_GIT; delete process.env.GH_TOKEN;
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('git_clone, git_status, git_commit (pushed at once), git_push, git_pull and its conflict, git_log, through GitHub\'s API', async () => {
  const c = await ok('git_clone', { url: 'https://github.com/pmalo/lab1' });
  assert.equal(c.text, 'Project \'lab1\' opened from the GitHub repository pmalo/lab1. It is untrusted, as every project from outside: Xilinx ISE and programming a board or a PROM wait until the user trusts it in the interface (Trust Project); the Silinx toolchain runs.');
  const pj = JSON.parse(fs.readFileSync(path.join(ws, 'lab1', 'silinx.json'), 'utf8'));
  assert.deepEqual([pj.trusted, pj.madeBy], [false, 'mcp']);
  assert.ok(!fs.existsSync(path.join(ws, 'lab1', '.git')));
  // (nothing of git's in the workspace: what the project was is in Silinx's configuration folder)
  assert.deepEqual(fs.readdirSync(ws), ['lab1']);
  assert.equal((await ok('git_status', { project: 'lab1' })).text, 'lab1: main, 0 commit(s) ahead of and 0 behind origin/main; no change since the last commit.');
  const counter = fs.readFileSync(path.join(BLINKY, 'src', 'counter.v'), 'utf8');
  await ok('write_file', { project: 'lab1', path: 'src/counter.v', text: `${counter}// changed\n` });
  assert.equal((await ok('git_status', { project: 'lab1' })).text, 'lab1: main, 0 commit(s) ahead of and 0 behind origin/main; 1 change(s):\n  src/counter.v (changed)');
  const before = gh.head('pmalo/lab1');
  const m = await ok('git_commit', { project: 'lab1', message: 'Counter changed' });
  assert.match(m.text, /^Committed [0-9a-f]{7} on main: 1 file\(s\)\.\n {2}src\/counter\.v \(changed\)$/);
  assert.deepEqual(gh.commitOf('pmalo/lab1', gh.head('pmalo/lab1')).parents, [before]);
  assert.equal(gh.filesAt('pmalo/lab1', 'main')['src/counter.v'], `${counter}// changed\n`);
  // (the trust mark is this computer's: never committed)
  assert.equal(gh.filesAt('pmalo/lab1', 'main')['silinx.json'], fs.readFileSync(path.join(BLINKY, 'silinx.json'), 'utf8'));
  assert.equal((await ok('git_push', { project: 'lab1' })).text, 'Nothing to push: pmalo/lab1 has every commit of main.');
  gh.commitFiles('pmalo/lab1', { 'src/sevenseg.v': '// theirs\n' }, { message: 'Theirs', author: 'teammate' });
  assert.equal((await ok('git_pull', { project: 'lab1' })).text, 'Pulled into main: 1 file(s) changed.\n  src/sevenseg.v');
  assert.equal(fs.readFileSync(path.join(ws, 'lab1', 'src', 'sevenseg.v'), 'utf8'), '// theirs\n');
  gh.commitFiles('pmalo/lab1', { 'src/sevenseg.v': '// theirs again\n' }, { message: 'Theirs again', author: 'teammate' });
  await ok('write_file', { project: 'lab1', path: 'src/sevenseg.v', text: '// mine\n' });
  await fails('git_commit', { project: 'lab1', message: 'Mine' }, 'git push: rejected by GitHub (fetch first)\nHint: GitHub has commits that this project does not: Pull first, then Push again.');
  await fails('git_pull', { project: 'lab1' }, 'git pull: a conflict in src/sevenseg.v: nothing was pulled, the project\'s files are as they were\nHint: The same file changed here and on GitHub. Commit your version under another name, or ask the other author, then Pull again.');
  const log = await ok('git_log', { project: 'lab1' });
  assert.deepEqual(log.data.commits.map((x) => x.message), ['Theirs again', 'Theirs', 'Counter changed', 'Initial commit']);
  const first = log.data.commits.at(-1).commit;
  assert.equal((await ok('git_log', { project: 'lab1', commit: first, path: 'src/counter.v' })).text, counter);
  // the token: only in the Authorization header
  for (const r of gh.requests) assert.ok(!r.url.includes(gh.token), r.url);
  assert.ok(gh.requests.every((r) => !r.headers.authorization || r.headers.authorization === `Bearer ${gh.token}`));
});

test('git_init on an empty GitHub repository, its first commit; no token said with its hint; the routes the same back end', async () => {
  await ok('new_project_from_example', { name: 'fresh', example: 'gates' });
  assert.equal((await ok('git_status', { project: 'fresh' })).text, '\'fresh\' is not in a git repository (git_init makes one).');
  // (the repositories the MCP may set, #3363)
  fs.writeFileSync(path.join(process.env.SILINX_CONFIG_DIR, 'config.json'), JSON.stringify({ mcp: { remotes: ['pmalo/*'] } }));
  await fails('git_init', { project: 'fresh', remote: 'https://github.com/pmalo/lab1' }, 'the GitHub repository already has commits\nHint: Open it with Open from Repository… instead, or give an empty repository.');
  assert.equal((await ok('git_init', { project: 'fresh', remote: 'https://github.com/pmalo/empty' })).text, 'Repository made for \'fresh\', its remote https://github.com/pmalo/empty.');
  const c = await ok('git_commit', { project: 'fresh', message: 'First' });
  assert.match(c.text, /^Committed [0-9a-f]{7} on main: \d+ file\(s\)\./);
  assert.ok(Object.keys(gh.filesAt('pmalo/empty', 'main')).includes('.gitignore'));
  // no token: the server's hint (no sign-in of its own)
  delete process.env.GH_TOKEN;
  await ok('write_file', { project: 'fresh', path: 'src/x.vhd', text: 'entity x is end;\n' });
  await fails('git_commit', { project: 'fresh', message: 'x' }, `GitHub refused the sign-in (Requires authentication)\nHint: ${GH.HINTS.signIn}`);
  assert.equal(GH.HINTS.signIn, 'GitHub\'s API needs a token: set GH_TOKEN before starting Silinx (with GitHub\'s command line: GH_TOKEN=$(gh auth token)); Silinx never stores it.');
  process.env.GH_TOKEN = gh.token;
  // the interface's routes: the same back end
  const { registerGitRoutes } = await import('../server/git-routes.js');
  const routes = {};
  registerGitRoutes({ get: (p, f) => { routes[`GET ${p}`] = f; }, post: (p, f) => { routes[`POST ${p}`] = f; } });
  const answer = await new Promise((resolve) => routes['GET /projects/:p/git/status']({ params: { p: 'fresh' }, query: {} }, { headersSent: false, json: resolve, status: () => ({ json: resolve }) }));
  // (write_file registers a new HDL file in silinx.json: changed too)
  assert.deepEqual([answer.repository, answer.branch, answer.files], [true, 'main', [{ path: 'silinx.json', state: 'modified' }, { path: 'src/x.vhd', state: 'new' }]]);
});

test('#3194 git_checks through GitHub\'s API: the last pushed commit\'s checks, running then done; the token in the header only', async () => {
  gh.seed('pmalo/lab3', filesOf(BLINKY), { private: true });
  await ok('git_clone', { url: 'https://github.com/pmalo/lab3' });
  const head = gh.head('pmalo/lab3');
  gh.setChecks('pmalo/lab3', head, [{ name: 'grade', status: 'in_progress' }]);
  const running = await ok('git_checks', { project: 'lab3' });
  assert.deepEqual([running.text, running.data.state], [`grade: running (commit ${head.slice(0, 7)}); Checks again shows its result.`, 'pending']);
  // (a commit pushed: its checks, not the clone's)
  await ok('write_file', { project: 'lab3', path: 'src/extra.v', text: 'module extra; endmodule\n' });
  const c = await ok('git_commit', { project: 'lab3', message: 'Done' });
  assert.equal(gh.head('pmalo/lab3'), c.data.commit);
  gh.setChecks('pmalo/lab3', c.data.commit, [{ name: 'grade', status: 'completed', conclusion: 'success', annotations: [{ level: 'notice', title: 'Silinx: counter4', message: '40 / 40 points, Accepted' }] }]);
  const done = await ok('git_checks', { project: 'lab3' });
  assert.equal(done.text, `grade: success (commit ${c.data.commit.slice(0, 7)}): https://github.com/pmalo/lab3/runs/${1002}\n  Silinx: counter4: 40 / 40 points, Accepted`);
  assert.deepEqual([done.data.remote, done.data.commit, done.data.conclusion], ['pmalo/lab3', c.data.commit, 'success']);
  const asked = gh.requests.filter(q => q.url.includes('check-runs'));
  assert.ok(asked.length >= 3 && asked.every(q => q.headers.authorization === `Bearer ${gh.token}` && !q.url.includes(gh.token)));
  // (a project not in a repository)
  await ok('new_project_from_example', { name: 'loose', example: 'gates' });
  await fails('git_checks', { project: 'loose' }, 'the project \'loose\' is not in a git repository\nHint: Initialize Repository… with its GitHub repository, or Open from Repository… opens a project from GitHub.');
});
