// The browser edition's git through GitHub's REST API (#3196: core/github-api.js, core/git-rest.js) against a stand-in
// for GitHub (test/fake-github.mjs), no network: the device flow's sign-in; Open from Repository (the import gate, a
// repository of several projects, a private one); the changes; a commit of several files pushed at once (a new file, a
// changed one, a deleted one, the .gitignore of a repository with none); a commit GitHub rejects (its branch moved);
// pull (a merge of the files, a conflict pulling nothing); the history; a file as it was; an empty repository's first
// commit; GitHub's refusals as the console says them; and the token never in a URL nor in a message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeGitHub } from './fake-github.mjs';
import { githubClient, startDeviceFlow, pollDeviceFlow, blobSha, GitHubError, HINT } from '../core/github-api.js';
import { restGit } from '../core/git-rest.js';
import { GITIGNORE } from '../core/git-ignore.js';
import { cloneText, commitText, pushText, pullText } from '../core/git-messages.js';
import crypto from 'node:crypto';

const PJ = JSON.stringify({ name: 'gates', device: { family: 'spartan3e', part: 'xc3s100e' }, top: 'gates', files: [{ path: 'src/gates.vhd', lang: 'vhdl', role: 'design' }] }, null, 2) + '\n';
const GATES = { 'silinx.json': PJ, 'src/gates.vhd': 'entity gates is end;\n', 'constraints/top.ucf': 'NET "a" LOC = "P11";\n', 'README.md': '# gates\n' };

// the project storage of the browser (web/js/project-store.js), as the back end sees it: files by path
function memory() {
  const P = new Map(), M = new Map();
  return {
    P, M,
    projects: {
      exists: async n => P.has(n),
      files: async n => ({ ...P.get(n) }),
      create: async (n, files) => { P.set(n, { ...files }); },
      write: async (n, p, t) => { P.get(n)[p] = t; },
      remove: async (n, p) => { delete P.get(n)[p]; },
    },
    meta: { get: async n => M.get(n) ?? null, set: async (n, m) => { M.set(n, structuredClone(m)); } },
  };
}
function setup({ signedIn = true, seed = true } = {}) {
  const gh = fakeGitHub();
  if (seed) gh.seed('pmalo/gates', GATES);
  const mem = memory();
  let token = signedIn ? gh.token : null;
  const client = githubClient({ fetch: gh.fetch, token: () => token });
  return { gh, mem, git: restGit({ client, ...mem }), signOut: () => { token = null; }, setToken: t => { token = t; } };
}
const rejects = (p, message, more = {}) => assert.rejects(p, e => { assert.equal(e.message, message); for (const [k, v] of Object.entries(more)) assert.deepEqual(e[k], v, k); return true; });
const noToken = gh => { for (const r of gh.requests) assert.ok(!r.url.includes(gh.token) && !/token=/.test(r.url), r.url); };

test('blobSha is git\'s blob hash (git hash-object), for a text as UTF-8 and for bytes', async () => {
  assert.equal(await blobSha(''), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  assert.equal(await blobSha('hello\n'), 'ce013625030ba8dba906f756967f9e9ca394464a');
  const t = 'ação ✓\n';
  assert.equal(await blobSha(t), crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${Buffer.byteLength(t)}\0`), Buffer.from(t)])).digest('hex'));
  assert.equal(await blobSha(new Uint8Array([0, 1, 2])), await blobSha(Buffer.from([0, 1, 2])));
});

test('the device flow: a code shown, GitHub asked until the user authorizes it, the token; slow_down, a refusal, an expiry, Cancel', async () => {
  const gh = fakeGitHub();
  const waits = [];
  const sleep = async ms => { waits.push(ms); };
  const d = await startDeviceFlow({ clientId: gh.clientId, fetch: gh.fetch });
  assert.deepEqual(Object.keys(d).sort(), ['deviceCode', 'expiresIn', 'interval', 'userCode', 'verificationUri']);
  assert.equal(d.verificationUri, 'https://github.com/login/device');
  assert.match(d.userCode, /^WDJB-\d{4}$/);
  // (authorized on GitHub after the second poll)
  let polls = 0;
  const f = async (u, o) => { if (/access_token/.test(u) && ++polls === 2) gh.authorize(d.userCode); return gh.fetch(u, o); };
  assert.equal(await pollDeviceFlow({ clientId: gh.clientId, ...d }, { fetch: f, sleep }), gh.token);
  assert.deepEqual(waits, [5000, 5000]);
  const req = gh.requests.find(r => r.url === '/login/device/code');
  assert.ok(req && !req.headers.authorization);

  // slow_down: the interval GitHub gives
  waits.length = 0;
  let n = 0;
  const slow = async (u, o) => (/access_token/.test(u) && ++n === 1 ? new Response(JSON.stringify({ error: 'slow_down', interval: 10 }), { status: 200 }) : (gh.authorize(d2.userCode), gh.fetch(u, o)));
  const d2 = await startDeviceFlow({ clientId: gh.clientId, fetch: gh.fetch });
  assert.equal(await pollDeviceFlow({ clientId: gh.clientId, ...d2 }, { fetch: slow, sleep }), gh.token);
  assert.deepEqual(waits, [5000, 10000]);

  const d3 = await startDeviceFlow({ clientId: gh.clientId, fetch: gh.fetch });
  gh.deny(d3.userCode);
  await rejects(pollDeviceFlow({ clientId: gh.clientId, ...d3 }, { fetch: gh.fetch, sleep }), 'the sign-in was refused on GitHub');
  let t = 0;
  const d4 = await startDeviceFlow({ clientId: gh.clientId, fetch: gh.fetch });
  await rejects(pollDeviceFlow({ clientId: gh.clientId, ...d4, expiresIn: 60 }, { fetch: gh.fetch, sleep: async ms => { t += ms; }, now: () => t }), 'the sign-in code expired before it was authorized', { hint: 'Sign in with GitHub again: a new code is given.', status: 408 });
  const ctl = new AbortController();
  ctl.abort();
  await rejects(pollDeviceFlow({ clientId: gh.clientId, ...d4 }, { fetch: gh.fetch, signal: ctl.signal, sleep }), 'the sign-in was cancelled');
  await rejects(startDeviceFlow({ clientId: '', fetch: gh.fetch }), 'no GitHub OAuth App is set up for this edition of Silinx', { hint: 'Its client ID is a setting of the edition (the maintainer registers the OAuth App).' });
  await rejects(startDeviceFlow({ clientId: 'Iv1.other', fetch: gh.fetch }), 'GitHub\'s sign-in refused the request (Not Found)');
  await rejects(startDeviceFlow({ clientId: gh.clientId, fetch: async () => { throw new TypeError('Failed to fetch'); } }), 'GitHub\'s sign-in could not be reached', { hint: HINT.network });
  noToken(gh);
});

test('Open from Repository: the project\'s files, the repository\'s hidden and binary ones left on GitHub; status: no change', async () => {
  const { gh, mem, git } = setup();
  gh.commitFiles('pmalo/gates', { '.github/workflows/ci.yml': 'on: push\n', 'doc/board.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1]), 'build/top.bit': 'x' });
  const r = await git.clone({ url: 'https://github.com/pmalo/gates' });
  assert.deepEqual(r, { project: 'gates', url: 'https://github.com/pmalo/gates', repository: 'pmalo/gates', warnings: [] });
  assert.equal(cloneText(r), 'Project \'gates\' opened from the GitHub repository pmalo/gates.');
  assert.deepEqual(Object.keys(mem.P.get('gates')).sort(), ['README.md', 'constraints/top.ucf', 'silinx.json', 'src/gates.vhd']);
  const m = mem.M.get('gates');
  assert.deepEqual([m.owner, m.repo, m.branch, m.commit], ['pmalo', 'gates', 'main', gh.head('pmalo/gates')]);
  assert.equal(m.gitignore, false);
  assert.deepEqual(await git.status('gates'), { project: 'gates', repository: true, root: 'project', branch: 'main', upstream: 'origin/main', ahead: 0, behind: 0, files: [] });
  // (another name; the name taken)
  assert.equal((await git.clone({ url: 'git@github.com:pmalo/gates.git', name: 'gates2' })).project, 'gates2');
  await rejects(git.clone({ url: 'https://github.com/pmalo/gates' }), 'project \'gates\' already exists', { hint: 'Choose another name for the project.', status: 409 });
  noToken(gh);
});

test('Open from Repository refuses: not GitHub, a Classroom invitation, no silinx.json, several projects, an empty one, the gate, a private one signed out', async () => {
  const { gh, git, signOut } = setup();
  await rejects(git.clone({ url: 'https://gitlab.com/a/b' }), 'not a GitHub repository\'s address: https://gitlab.com/a/b');
  await rejects(git.clone({ url: 'https://classroom.github.com/a/xyz' }), 'a GitHub Classroom invitation, not a repository');
  gh.seed('pmalo/notes', { 'README.md': 'x\n' });
  await rejects(git.clone({ url: 'https://github.com/pmalo/notes' }), 'the repository is not a Silinx project: it has no silinx.json', { status: 422 });
  gh.seed('pmalo/course', { 'lab1/silinx.json': PJ, 'lab2/silinx.json': PJ, 'README.md': '#\n' });
  await rejects(git.clone({ url: 'https://github.com/pmalo/course' }), 'the repository holds several Silinx projects (lab1, lab2), not one', { projects: ['lab1', 'lab2'] });
  gh.seed('pmalo/empty');
  await rejects(git.clone({ url: 'https://github.com/pmalo/empty' }), 'the repository is not a Silinx project: it is empty');
  gh.seed('pmalo/nul', { ...GATES, 'src/bad.vhd': 'entity\0x' });
  await rejects(git.clone({ url: 'https://github.com/pmalo/nul' }), 'not opened: src/bad.vhd: not imported: binary content (a NUL byte) in a text file');
  gh.seed('pmalo/json', { ...GATES, 'silinx.json': '{' });
  await rejects(git.clone({ url: 'https://github.com/pmalo/json' }), 'not opened: its silinx.json is not valid JSON');
  await rejects(git.clone({ url: 'https://github.com/pmalo/nothere' }), 'GitHub has no such repository, or your account cannot see it', { hint: HINT.notFound, status: 404 });
  gh.seed('pmalo/private', GATES, { private: true });
  signOut();
  await rejects(git.clone({ url: 'https://github.com/pmalo/private' }), 'GitHub has no such repository, or your account cannot see it', { hint: `${HINT.notFound} ${HINT.signIn}` });
});

test('a commit of several files, pushed at once: new, changed, deleted, and the .gitignore of a repository with none', async () => {
  const { gh, mem, git } = setup();
  await git.clone({ url: 'https://github.com/pmalo/gates' });
  const P = mem.P.get('gates');
  P['src/gates.vhd'] = 'entity gates is port (a : in bit); end;\n';
  P['src/inv.vhd'] = 'entity inv is end;\n';
  delete P['README.md'];
  P['build/open/top.bit'] = 'never committed';
  const files = [{ path: 'README.md', state: 'deleted' }, { path: 'src/gates.vhd', state: 'modified' }, { path: 'src/inv.vhd', state: 'new' }];
  assert.deepEqual((await git.status('gates')).files, files);
  const before = gh.head('pmalo/gates');
  const c = await git.commit('gates', '  Port a, an inverter  ');
  assert.deepEqual(c, { project: 'gates', commit: gh.head('pmalo/gates'), branch: 'main', files, gitignore: true, pushed: true, remote: 'pmalo/gates' });
  assert.notEqual(c.commit, before);
  assert.deepEqual(gh.commitOf('pmalo/gates', c.commit).parents, [before]);
  assert.equal(gh.commitOf('pmalo/gates', c.commit).message, 'Port a, an inverter');
  assert.equal(commitText(c), `Committed ${c.commit.slice(0, 7)} on main: 3 file(s).\n  README.md (deleted)\n  src/gates.vhd (changed)\n  src/inv.vhd (new)`);
  assert.deepEqual(gh.filesAt('pmalo/gates', 'main'), { '.gitignore': GITIGNORE, 'silinx.json': PJ, 'constraints/top.ucf': GATES['constraints/top.ucf'], 'src/gates.vhd': P['src/gates.vhd'], 'src/inv.vhd': P['src/inv.vhd'] });
  assert.deepEqual((await git.status('gates')).files, []);
  // (one request of each: a tree, a commit, the branch moved, not forced)
  const writes = gh.requests.filter(r => r.method !== 'GET').map(r => `${r.method} ${r.url}`);
  assert.deepEqual(writes, ['POST /repos/pmalo/gates/git/trees', 'POST /repos/pmalo/gates/git/commits', 'PATCH /repos/pmalo/gates/git/refs/heads/main']);
  // the next commit: no .gitignore again; Push: nothing left
  P['src/inv.vhd'] = 'entity inv is port (a : in bit); end;\n';
  assert.equal((await git.commit('gates', 'inv port')).gitignore, false);
  const p = await git.push('gates');
  assert.deepEqual(p, { project: 'gates', branch: 'main', remote: 'pmalo/gates', pushed: false });
  assert.equal(pushText(p), 'Nothing to push: pmalo/gates has every commit of main.');
  await rejects(git.commit('gates', 'again'), 'nothing to commit: the project has no change since the last commit', { status: 409 });
  await rejects(git.commit('gates', '   '), 'a commit needs a message', { hint: 'Say in a few words what changed.' });
  await rejects(git.commit('gates', 'x'.repeat(10_001)), 'the commit message is too long (at most 10000 characters)');
  noToken(gh);
});

test('a commit GitHub rejects (its branch moved meanwhile): nothing changes here; Pull, then the commit goes', async () => {
  const { gh, mem, git } = setup();
  await git.clone({ url: 'https://github.com/pmalo/gates' });
  gh.commitFiles('pmalo/gates', { 'README.md': '# gates, by a teammate\n' }, { author: 'teammate' });
  const theirs = gh.head('pmalo/gates');
  mem.P.get('gates')['src/gates.vhd'] = 'entity gates is end; -- mine\n';
  await rejects(git.commit('gates', 'mine'), 'git push: rejected by GitHub (fetch first)', { hint: HINT.rejected, status: 409 });
  assert.equal(gh.head('pmalo/gates'), theirs);
  assert.deepEqual((await git.status('gates')).files, [{ path: 'src/gates.vhd', state: 'modified' }]);
  const p = await git.pull('gates');
  assert.deepEqual(p, { project: 'gates', branch: 'main', upToDate: false, files: ['README.md'] });
  assert.equal(pullText(p), 'Pulled into main: 1 file(s) changed.\n  README.md');
  assert.equal(mem.P.get('gates')['README.md'], '# gates, by a teammate\n');
  // (my change is still a change, the teammate's is not)
  assert.deepEqual((await git.status('gates')).files, [{ path: 'src/gates.vhd', state: 'modified' }]);
  const c = await git.commit('gates', 'mine');
  assert.deepEqual(gh.commitOf('pmalo/gates', c.commit).parents, [theirs]);
  assert.equal(gh.filesAt('pmalo/gates', 'main')['README.md'], '# gates, by a teammate\n');
});

test('pull: up to date; GitHub\'s new, changed and deleted files taken; the same change on both sides; a conflict pulls nothing', async () => {
  const { gh, mem, git } = setup();
  await git.clone({ url: 'https://github.com/pmalo/gates' });
  assert.deepEqual(await git.pull('gates'), { project: 'gates', branch: 'main', upToDate: true, files: [] });
  assert.equal(pullText({ branch: 'main', upToDate: true }), 'Already up to date: main has every commit of GitHub\'s.');
  gh.commitFiles('pmalo/gates', { 'src/and2.vhd': 'entity and2 is end;\n', 'README.md': null, 'constraints/top.ucf': 'NET "a" LOC = "P12";\n', '.github/x.yml': 'x\n' });
  const P = mem.P.get('gates');
  P['src/gates.vhd'] = 'entity gates is end; -- mine\n';
  assert.deepEqual((await git.pull('gates')).files, ['README.md', 'constraints/top.ucf', 'src/and2.vhd']);
  assert.deepEqual(Object.keys(P).sort(), ['constraints/top.ucf', 'silinx.json', 'src/and2.vhd', 'src/gates.vhd']);
  assert.equal(P['constraints/top.ucf'], 'NET "a" LOC = "P12";\n');
  assert.deepEqual((await git.status('gates')).files, [{ path: 'src/gates.vhd', state: 'modified' }]);
  // the same change made on GitHub: no conflict, no change left
  gh.commitFiles('pmalo/gates', { 'src/gates.vhd': 'entity gates is end; -- mine\n' });
  assert.deepEqual((await git.pull('gates')).files, []);
  assert.deepEqual((await git.status('gates')).files, []);
  // a conflict: the same file changed differently on both sides
  gh.commitFiles('pmalo/gates', { 'src/gates.vhd': 'entity gates is end; -- theirs\n', 'src/and2.vhd': 'entity and2 is end; -- theirs\n' });
  P['src/gates.vhd'] = 'entity gates is end; -- mine, again\n';
  const before = structuredClone(P), meta = structuredClone(mem.M.get('gates'));
  await rejects(git.pull('gates'), 'git pull: a conflict in src/gates.vhd: nothing was pulled, the project\'s files are as they were',
    { hint: 'The same file changed here and on GitHub. Commit your version under another name, or ask the other author, then Pull again.', status: 409, files: ['src/gates.vhd'] });
  assert.deepEqual(P, before);
  assert.deepEqual(mem.M.get('gates'), meta);
});

test('the history, the newest first, with each commit\'s files; a file as it was in a commit', async () => {
  const { gh, mem, git } = setup();
  await git.clone({ url: 'https://github.com/pmalo/gates' });
  const first = gh.head('pmalo/gates');
  mem.P.get('gates')['src/gates.vhd'] = 'entity gates is end; -- 2\n';
  mem.P.get('gates')['src/inv.vhd'] = 'entity inv is end;\n';
  const c = await git.commit('gates', 'Second\n\nwith a body');
  const log = await git.log('gates');
  assert.deepEqual(log.map(x => [x.commit, x.author, x.message]), [[c.commit, 'student', 'Second'], [first, 'student', 'Initial commit']]);
  assert.deepEqual(log[0].files, [{ path: 'src/gates.vhd', state: 'modified' }, { path: 'src/inv.vhd', state: 'new' }]);
  assert.match(log[0].date, /^2026-01-01T/);
  assert.deepEqual(log[1].files.map(f => f.path), ['README.md', 'constraints/top.ucf', 'silinx.json', 'src/gates.vhd']);
  assert.equal((await git.log('gates', { limit: 1 })).length, 1);
  assert.deepEqual(await git.show('gates', first, 'src/gates.vhd'), { project: 'gates', commit: first, path: 'src/gates.vhd', text: 'entity gates is end;\n' });
  assert.equal((await git.show('gates', c.commit.slice(0, 40), 'src/gates.vhd')).text, 'entity gates is end; -- 2\n');
  await rejects(git.show('gates', first, 'src/inv.vhd'), `no file 'src/inv.vhd' in the commit ${first.slice(0, 7)}`, { status: 404 });
  await rejects(git.show('gates', 'HEAD~1', 'src/gates.vhd'), 'not a commit: HEAD~1', { hint: 'Give a commit\'s hash, as the history lists it.' });
  await rejects(git.show('gates', first, '.github/x.yml'), '\'.github/x.yml\': not a file of the project');
  await rejects(git.show('gates', first, '../x'), '\'../x\': not a file of the project');
  noToken(gh);
});

test('Initialize Repository: an empty GitHub repository; its first commit is the project\'s, with Silinx\'s .gitignore', async () => {
  const { gh, mem, git } = setup({ seed: false });
  gh.seed('pmalo/fresh');
  gh.seed('pmalo/full', GATES);
  mem.P.set('blinky', { 'silinx.json': PJ, 'src/blinky.vhd': 'entity blinky is end;\n' });
  const st = await git.status('blinky');
  assert.deepEqual(st, { project: 'blinky', repository: false, files: [] });
  await rejects(git.commit('blinky', 'x'), 'the project \'blinky\' is not in a git repository', { status: 409 });
  await rejects(git.init('blinky'), 'the browser edition keeps a project\'s repository on GitHub: give its address');
  await rejects(git.init('blinky', { remote: 'https://github.com/pmalo/full' }), 'the GitHub repository already has commits', { hint: 'Open it with Open from Repository… instead, or give an empty repository.' });
  assert.deepEqual(await git.init('blinky', { remote: 'https://github.com/pmalo/fresh' }), { project: 'blinky', created: true, remote: 'https://github.com/pmalo/fresh', gitignore: false });
  assert.deepEqual((await git.status('blinky')).files, [{ path: 'silinx.json', state: 'new' }, { path: 'src/blinky.vhd', state: 'new' }]);
  assert.deepEqual(await git.log('blinky'), []);
  await rejects(git.push('blinky'), 'nothing to push: the repository has no commit yet', { hint: 'Commit first.' });
  const c = await git.commit('blinky', 'First');
  assert.equal(c.gitignore, true);
  assert.deepEqual(gh.filesAt('pmalo/fresh', 'main'), { '.gitignore': GITIGNORE, 'silinx.json': PJ, 'src/blinky.vhd': 'entity blinky is end;\n' });
  assert.deepEqual((await git.log('blinky')).map(x => x.message), ['First', 'First']);
  assert.deepEqual((await git.status('blinky')).files, []);
});

test('GitHub\'s refusals: a sign-in no longer valid, no permission to push, GitHub not reached; the token never in a message', async () => {
  const { gh, mem, git, setToken } = setup();
  await git.clone({ url: 'https://github.com/pmalo/gates' });
  mem.P.get('gates')['src/gates.vhd'] = 'x\n';
  gh.revoke(gh.token);
  const seen = [];
  const keep = p => p.catch(e => { seen.push(`${e.message} ${e.hint}`); throw e; });
  await rejects(keep(git.commit('gates', 'x')), 'GitHub refused the sign-in (Bad credentials)', { hint: HINT.again, status: 401 });
  setToken(null);
  await rejects(keep(git.commit('gates', 'x')), 'GitHub refused the sign-in (Requires authentication)', { hint: HINT.signIn });
  const gh2 = fakeGitHub();
  gh2.seed('pmalo/gates', GATES, { writers: [] });
  const mem2 = memory();
  const git2 = restGit({ client: githubClient({ fetch: gh2.fetch, token: () => gh2.token }), ...mem2 });
  await git2.clone({ url: 'https://github.com/pmalo/gates' });
  mem2.P.get('gates')['src/gates.vhd'] = 'x\n';
  await rejects(keep(git2.commit('gates', 'x')), 'GitHub refused the request (Resource not accessible by integration)', { hint: 'Your GitHub account has no permission to do this in the repository.', status: 403 });
  const off = restGit({ client: githubClient({ fetch: async () => { throw new TypeError('Failed to fetch'); }, token: () => gh.token }), ...mem });
  await rejects(keep(off.pull('gates')), 'GitHub could not be reached', { hint: HINT.network, status: 503 });
  assert.ok(seen.length === 4 && seen.every(s => !s.includes(gh.token)));
  assert.ok(new GitHubError('x') instanceof Error);
  // (the token only ever in the Authorization header)
  const authed = gh.requests.filter(r => r.headers.authorization);
  assert.ok(authed.length > 0 && authed.every(r => r.headers.authorization === `Bearer ${gh.token}`));
  noToken(gh);
});

test('pull merges a drawing changed on both sides by its objects (#3197): at once for different objects, by the choices for the same one; its HDL made again', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const dir = path.join(import.meta.dirname, '..', 'examples', 'traffic');
  const files = {};
  const walk = (base) => { for (const e of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) { const rel = base ? `${base}/${e.name}` : e.name; if (e.isDirectory()) walk(rel); else files[rel] = fs.readFileSync(path.join(dir, rel), 'utf8'); } };
  walk('');
  const FSM = 'src/traffic.fsm.json';
  const gh = fakeGitHub();
  gh.seed('pmalo/traffic', files);
  const mem = memory();
  const made = [];
  mem.projects.regenerate = async (n, p) => { made.push(p); };
  const git = restGit({ client: githubClient({ fetch: gh.fetch, token: () => gh.token }), ...mem });
  await git.clone({ url: 'https://github.com/pmalo/traffic' });
  const text = (m) => `${JSON.stringify(m, null, 2)}\n`;
  const t = (m, id) => m.transitions.find((x) => x.id === id);
  const edit = (src, fn) => { const m = JSON.parse(src); fn(m); return text(m); };
  // different objects: merged at once
  gh.commitFiles('pmalo/traffic', { [FSM]: edit(files[FSM], (m) => { t(m, 't2').cond = 'not req'; }) });
  mem.P.get('traffic')[FSM] = edit(files[FSM], (m) => { t(m, 't3').cond = 'req and not night'; });
  const r = await git.pull('traffic');
  assert.deepEqual(r.resolved, [FSM]);
  assert.deepEqual(made, [FSM]);
  const merged = JSON.parse(mem.P.get('traffic')[FSM]);
  assert.deepEqual([t(merged, 't2').cond, t(merged, 't3').cond], ['not req', 'req and not night']);
  // (the merged drawing: a change against GitHub's, which the next commit pushes)
  assert.deepEqual((await git.status('traffic')).files, [{ path: FSM, state: 'modified' }]);
  await git.commit('traffic', 'Merged');
  assert.equal(t(JSON.parse(gh.filesAt('pmalo/traffic', 'main')[FSM]), 't3').cond, 'req and not night');
  // the same object changed differently: nothing pulled, its conflict named; then resolved theirs
  const base = gh.filesAt('pmalo/traffic', 'main')[FSM];
  gh.commitFiles('pmalo/traffic', { [FSM]: edit(base, (m) => { t(m, 't1').cond = 'night or req'; }) });
  mem.P.get('traffic')[FSM] = edit(base, (m) => { t(m, 't1').cond = 'not night'; });
  await rejects(git.pull('traffic'), `git pull: a conflict in ${FSM}: nothing was pulled, the project's files are as they were`, {
    hint: 'The same objects of a drawing changed here and on GitHub: choose mine or theirs for each, then Pull again.',
    drawings: [{ path: FSM, kind: 'fsm', conflicts: [{ id: 'transitions/t1', label: 'transitions t1', mine: 'changed (cond)', theirs: 'changed (cond)' }] }],
  });
  assert.equal(t(JSON.parse(mem.P.get('traffic')[FSM]), 't1').cond, 'not night');
  const p = await git.pull('traffic', { resolve: { [FSM]: { 'transitions/t1': 'theirs' } } });
  assert.deepEqual(p.resolved, [FSM]);
  assert.equal(t(JSON.parse(mem.P.get('traffic')[FSM]), 't1').cond, 'night or req');
  assert.deepEqual((await git.status('traffic')).files, []);
});
