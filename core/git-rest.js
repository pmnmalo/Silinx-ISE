// Git through GitHub's REST API (#3196, phase 2 of #3194): the back end of the browser edition, which has no git, with
// the functions and the results of the server's (server/git.js): clone, init, status, commit, push, pull, log, show; the
// interface (web/js/git.js) and the messages (core/git-messages.js) are the same.
//
// A project has no .git here: what it was at its last commit or pull is kept beside it (meta: the repository, the
// branch, the commit and its tree, and for each of its files the blob's hash on GitHub and the hash of its text as the
// project holds it), and its changes are its files' hashes against those. A commit is pushed at once, several files in
// one commit through the Git Data API (a tree on the last one's, a commit, the branch moved: never forced, so a branch
// GitHub moved meanwhile rejects it: Pull first). A pull is a merge of the files: one changed on GitHub only is taken,
// one changed here only is kept, one changed on both sides is a conflict, and a conflict pulls nothing. Only the
// project's text files are its own (what passes the import gate, core/import-gate.js); the repository's other files (its
// hidden ones: .gitignore, .github; its binary ones) stay on GitHub as they are, never deleted by a commit. A drawing
// changed on both sides is merged by its objects (#3197, core/git-resolve.js): at once when no object is in conflict,
// else by the user's choices; its HDL file made from it again (projects.regenerate).
// Isomorphic: the project's files and the meta are the caller's (adapters), GitHub's client core/github-api.js.
import { GitHubError, HINT, blobSha, fromBase64, textOf } from './github-api.js';
import { checkUrl, nameFromRepo } from './github-url.js';
import { isOutput, GITIGNORE } from './git-ignore.js';
import { gateEntries, gateMessages, GateError, GATE_LIMITS } from './import-gate.js';
import { DRAWING_RE } from './drawing-merge.js';
import { drawingConflicts, resolveConflict } from './git-resolve.js';

import { commitChecks } from './github-checks.js';

export const GitError = GitHubError;
export const PROJECT_FILE = 'silinx.json';

// a path of the project's own (not hidden, not a tool's output)
const own = p => !p.split('/').some(s => s.startsWith('.')) && !isOutput(p);

const notRepo = name => new GitError(`the project '${name}' is not in a git repository`, 'Initialize Repository… with its GitHub repository, or Open from Repository… opens a project from GitHub.', 409);
const rejected = () => new GitError('git push: rejected by GitHub (fetch first)', HINT.rejected, 409);

// a few requests at a time
async function each(items, fn, n = 8) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

/** The back end: client (core/github-api.js githubClient); projects: { exists(name), files(name) -> { path: text } (with
 *  silinx.json, as committed), create(name, files) (a clone: untrusted, the caller's), write(name, path, text),
 *  remove(name, path), regenerate(name, drawing) (its HDL file made from it again) }; meta: { get(name), set(name, m) }. */
export function restGit({ client, projects, meta }) {
  const { request, repo: R, pathOf } = client;

  const need = async name => {
    if (!await projects.exists(name)) throw new GitError(`project '${name}' not found`, null, 404);
    const m = await meta.get(name);
    if (!m) throw notRepo(name);
    return m;
  };
  const local = async name => Object.fromEntries(Object.entries(await projects.files(name)).filter(([p]) => own(p)));
  const hashes = async files => Object.fromEntries(await each(Object.entries(files), async ([p, t]) => [p, await blobSha(t)]));

  // the branch's head and its tree's blobs ({ path: { sha, mode, size } }); null: an empty repository
  async function headOf(m) {
    const ref = await request('GET', `${R(m.owner, m.repo)}/git/ref/heads/${pathOf(m.branch)}`, undefined, { allow: [404, 409] });
    if (ref.status) return null;
    const commit = ref.object.sha;
    const c = await request('GET', `${R(m.owner, m.repo)}/git/commits/${commit}`);
    const t = await request('GET', `${R(m.owner, m.repo)}/git/trees/${c.tree.sha}?recursive=1`);
    if (t.truncated) throw new GitError('the repository is too large for GitHub\'s API to list at once', 'Open it with git, in the server editions of Silinx.', 413);
    const blobs = {};
    for (const e of t.tree) if (e.type === 'blob') blobs[e.path] = { sha: e.sha, mode: e.mode, size: e.size ?? 0 };
    return { commit, tree: c.tree.sha, blobs };
  }
  // the blobs of the project's own files that pass the gate: { files: { path: text }, warnings } (or a GitError)
  async function fetchOwn(m, blobs, paths) {
    const list = paths.filter(p => own(p) && blobs[p].mode !== '120000');
    if (list.length > GATE_LIMITS.maxFiles) throw new GitError(`not opened: the repository has too many files (${list.length}, at most ${GATE_LIMITS.maxFiles})`, null, 413);
    const total = list.reduce((a, p) => a + blobs[p].size, 0);
    if (total > GATE_LIMITS.maxTotal) throw new GitError('not opened: the repository\'s files are too large to open in the browser', null, 413);
    const entries = await each(list, async p => {
      const b = await request('GET', `${R(m.owner, m.repo)}/git/blobs/${blobs[p].sha}`);
      return { path: p, data: b.encoding === 'base64' ? fromBase64(b.content) : new TextEncoder().encode(b.content || '') };
    });
    let gated;
    try { gated = gateEntries(entries); } catch (e) { throw e instanceof GateError ? new GitError(`not opened: ${e.message}`, null, 422) : e; }
    if (gated.refusals.length) throw new GitError(`not opened: ${gateMessages({ refusals: gated.refusals, warnings: [] }).join('; ')}`, null, 422);
    // (a text file only: a binary one is the repository's, left on GitHub)
    const files = {};
    for (const f of gated.files) if (typeof f.text === 'string') files[f.path] = f.text;
    return { files, warnings: gated.warnings };
  }
  // the meta after a commit or a pull: the head, and each own file's hashes (GitHub's, the project's)
  async function remember(name, m, head, mine) {
    const paths = {};
    for (const [p, l] of Object.entries(mine)) if (head.blobs[p]) paths[p] = { remote: head.blobs[p].sha, local: l };
    const next = { ...m, commit: head.commit, tree: head.tree, paths, gitignore: !!head.blobs['.gitignore'] };
    await meta.set(name, next);
    return next;
  }

  /** The project's changes since its last commit or pull: as server/git.js gitStatus (ahead: never, a commit is pushed). */
  async function status(name) {
    if (!await projects.exists(name)) throw new GitError(`project '${name}' not found`, null, 404);
    const m = await meta.get(name);
    if (!m) return { project: name, repository: false, files: [] };
    const files = [];
    const now = await hashes(await local(name));
    for (const [p, sha] of Object.entries(now)) {
      const base = m.paths[p];
      if (!base) files.push({ path: p, state: 'new' });
      else if (base.local !== sha) files.push({ path: p, state: 'modified' });
    }
    for (const p of Object.keys(m.paths)) if (!(p in now)) files.push({ path: p, state: 'deleted' });
    files.sort((a, b) => a.path.localeCompare(b.path));
    return { project: name, repository: true, root: 'project', branch: m.branch, upstream: `origin/${m.branch}`, ahead: 0, behind: 0, files };
  }

  /** Open from Repository: the repository's project into a new one, untrusted (projects.create) -> { project, url,
   *  repository, warnings }. */
  async function clone({ url, name = null }) {
    const remote = checkUrl(url);
    const project = name || nameFromRepo(remote.repo);
    if (await projects.exists(project)) throw new GitError(`project '${project}' already exists`, 'Choose another name for the project.', 409);
    const info = await request('GET', R(remote.owner, remote.repo));
    const m = { owner: info.owner?.login || remote.owner, repo: info.name || remote.repo, branch: info.default_branch || 'main', url: remote.url };
    const head = await headOf(m);
    if (!head) throw new GitError('the repository is not a Silinx project: it is empty', null, 422);
    if (!head.blobs[PROJECT_FILE]) {
      const inside = [...new Set(Object.keys(head.blobs).filter(p => /^[^./][^/]*\/silinx\.json$/.test(p)).map(p => p.split('/')[0]))].sort();
      throw inside.length
        ? new GitError(`the repository holds several Silinx projects (${inside.join(', ')}), not one`, 'Open it with git as the workspace, in the server editions of Silinx.', 422, { projects: inside })
        : new GitError('the repository is not a Silinx project: it has no silinx.json', null, 422);
    }
    const { files, warnings } = await fetchOwn(m, head.blobs, Object.keys(head.blobs));
    try { JSON.parse(files[PROJECT_FILE]); } catch { throw new GitError('not opened: its silinx.json is not valid JSON', null, 422); }
    if (await projects.exists(project)) throw new GitError(`project '${project}' already exists`, 'Choose another name for the project.', 409);
    await projects.create(project, files);
    await remember(project, m, head, await hashes(await local(project)));
    return { project, url: remote.url, repository: `${m.owner}/${m.repo}`, warnings };
  }

  /** Initialize Repository: the project's GitHub repository (remote: required here, there is no repository without
   *  GitHub's), which must be empty: its first commit is the project's. */
  async function init(name, { remote = null } = {}) {
    if (!await projects.exists(name)) throw new GitError(`project '${name}' not found`, null, 404);
    if (!remote) throw new GitError('the browser edition keeps a project\'s repository on GitHub: give its address', 'Make an empty repository on GitHub (github.com/new), then give its address here.', 400);
    const r = checkUrl(remote);
    const info = await request('GET', R(r.owner, r.repo));
    const m = { owner: info.owner?.login || r.owner, repo: info.name || r.repo, branch: info.default_branch || 'main', url: r.url, commit: null, tree: null, paths: {}, gitignore: false };
    if (await headOf(m)) throw new GitError('the GitHub repository already has commits', 'Open it with Open from Repository… instead, or give an empty repository.', 409);
    await meta.set(name, m);
    return { project: name, created: true, remote: r.url, gitignore: false };
  }

  /** Commit the project's changes and push them, in one step: { commit, branch, files, gitignore, pushed, remote }. */
  async function commit(name, message) {
    const msg = String(message ?? '').trim();
    if (!msg) throw new GitError('a commit needs a message', 'Say in a few words what changed.');
    if (msg.length > 10_000) throw new GitError('the commit message is too long (at most 10000 characters)');
    let m = await need(name);
    const { files } = await status(name);
    if (!files.length) throw new GitError('nothing to commit: the project has no change since the last commit', null, 409);
    const mine = await local(name);
    const gitignore = !m.gitignore;
    let parent = m.commit, base = m.tree;
    if (!parent) {
      // an empty repository: the Git Data API needs a first commit, made by the Contents API (the .gitignore)
      const put = await request('PUT', `${R(m.owner, m.repo)}/contents/.gitignore`, { message: msg, content: btoa(GITIGNORE), branch: m.branch }, { allow: [409, 422] });
      if (put.status) throw rejected();
      parent = put.commit.sha; base = put.commit.tree.sha;
    }
    const tree = files.map(f => (f.state === 'deleted' ? { path: f.path, mode: '100644', type: 'blob', sha: null } : { path: f.path, mode: '100644', type: 'blob', content: mine[f.path] }));
    if (gitignore && m.commit) tree.push({ path: '.gitignore', mode: '100644', type: 'blob', content: GITIGNORE });
    const t = await request('POST', `${R(m.owner, m.repo)}/git/trees`, { base_tree: base, tree });
    const c = await request('POST', `${R(m.owner, m.repo)}/git/commits`, { message: msg, tree: t.sha, parents: [parent] });
    const moved = await request('PATCH', `${R(m.owner, m.repo)}/git/refs/heads/${pathOf(m.branch)}`, { sha: c.sha, force: false }, { allow: [409, 422] });
    if (moved.status) throw rejected();
    // (what was committed is the base now; a file changed while committing stays a change)
    const now = await hashes(mine);
    const paths = { ...m.paths };
    for (const f of files) {
      if (f.state === 'deleted') delete paths[f.path];
      else paths[f.path] = { remote: await blobSha(mine[f.path]), local: now[f.path] };
    }
    m = { ...m, commit: c.sha, tree: t.sha, paths, gitignore: true };
    await meta.set(name, m);
    return { project: name, commit: c.sha, branch: m.branch, files, gitignore, pushed: true, remote: `${m.owner}/${m.repo}` };
  }

  /** Push: a commit is pushed when it is made, so nothing is left to push. */
  async function push(name) {
    const m = await need(name);
    if (!m.commit) throw new GitError('nothing to push: the repository has no commit yet', 'Commit first.', 409);
    return { project: name, branch: m.branch, remote: `${m.owner}/${m.repo}`, pushed: false };
  }

  // a blob's text (a drawing's version in a merge)
  const blobText = async (m, sha) => {
    if (!sha) return null;
    const b = await request('GET', `${R(m.owner, m.repo)}/git/blobs/${sha}`);
    return textOf(b.encoding === 'base64' ? fromBase64(b.content) : new TextEncoder().encode(b.content || ''));
  };
  // the drawings among a pull's conflicts merged by their objects: { merged: [{ path, text }], generated, pending, left }
  async function mergeConflicts(m, head, mine, conflicts, resolve) {
    const drawings = [], pending = [];
    for (const p of conflicts.filter(x => DRAWING_RE.test(x))) {
      const v = { base: await blobText(m, m.paths[p]?.remote), mine: mine[p] ?? null, theirs: await blobText(m, head.blobs[p]?.sha) };
      const c = v.mine !== null && v.theirs !== null ? drawingConflicts(p, v.base, v.mine, v.theirs) : null;
      if (!c) continue;
      drawings.push({ ...c, v });
      if (c.conflicts.length && !c.conflicts.every(x => resolve?.[p]?.[x.id] === 'mine' || resolve?.[p]?.[x.id] === 'theirs')) pending.push(c);
    }
    const generated = new Set();
    for (const d of drawings) for (const t of [d.v.mine, d.v.theirs]) { try { const g = JSON.parse(t).generatedFile; if (g) generated.add(g); } catch { /* none */ } }
    const left = conflicts.filter(p => !drawings.some(d => d.path === p) && !generated.has(p));
    return { drawings, pending, left, generated: [...generated].filter(g => conflicts.includes(g)) };
  }

  /** Pull GitHub's commits into the project (a merge of its files): { branch, upToDate, files, resolved }; a conflict
   *  (not a drawing's that its objects merge) pulls nothing and is a GitError with its files, and the drawings'
   *  conflicts still to choose (`drawings`). resolve: { path: { id: 'mine' | 'theirs' } }. */
  async function pull(name, { resolve = null } = {}) {
    const m = await need(name);
    const head = await headOf(m);
    if (!head) throw new GitError('git pull: the GitHub repository has nothing on this branch yet', 'The GitHub repository has nothing on this branch yet: Push first.', 409);
    if (head.commit === m.commit) return { project: name, branch: m.branch, upToDate: true, files: [] };
    const mine = await local(name);
    const now = await hashes(mine);
    const theirs = Object.keys(head.blobs).filter(p => own(p) && head.blobs[p].mode !== '120000');
    const take = [], drop = [], conflicts = [];
    for (const p of new Set([...theirs, ...Object.keys(m.paths)])) {
      const base = m.paths[p], remote = head.blobs[p]?.sha ?? null;
      if (remote === (base?.remote ?? null)) continue;   // (unchanged on GitHub)
      const here = now[p] ?? null;
      const changedHere = here !== (base?.local ?? null);
      if (here === remote) continue;   // (the same change on both sides: the base moves only)
      if (changedHere) conflicts.push(p);
      else if (remote) take.push(p); else drop.push(p);
    }
    conflicts.sort();
    let merge = { drawings: [], generated: [] };
    if (conflicts.length) {
      merge = await mergeConflicts(m, head, mine, conflicts, resolve);
      if (merge.pending.length || merge.left.length) {
        throw new GitError(`git pull: a conflict in ${conflicts.join(', ')}: nothing was pulled, the project's files are as they were`,
          merge.left.length ? 'The same file changed here and on GitHub. Commit your version under another name, or ask the other author, then Pull again.'
            : 'The same objects of a drawing changed here and on GitHub: choose mine or theirs for each, then Pull again.', 409, { files: conflicts, drawings: merge.pending });
      }
      for (const d of merge.drawings) {
        try { d.out = await resolveConflict(d.path, d.v.base, d.v.mine, d.v.theirs, resolve?.[d.path] || {}); }
        catch (e) { throw new GitError(`git pull: ${e.message}: nothing was pulled`, 'Choose the other side for an object, then Pull again.', e.status || 422, { files: conflicts }); }
      }
    }
    const { files } = await fetchOwn(m, head.blobs, take);
    for (const p of take) if (files[p] !== undefined) await projects.write(name, p, files[p]);
    for (const p of drop) await projects.remove(name, p);
    for (const d of merge.drawings) await projects.write(name, d.path, d.out.text);
    for (const d of merge.drawings) await projects.regenerate?.(name, d.path);
    // (what GitHub has of the merged files, as the project would hold it: the base of their change, which a commit pushes)
    const theirsLocal = {};
    for (const p of [...merge.drawings.map(d => d.path), ...merge.generated]) {
      const t = merge.drawings.find(d => d.path === p)?.v.theirs ?? await blobText(m, head.blobs[p]?.sha);
      if (t !== null) theirsLocal[p] = await blobSha(t);
    }
    // the new base: a file taken from GitHub (or the same on both sides) at GitHub's; one changed here only keeps its
    // base, so that it stays a change (a file GitHub's version of which is no text of the project's: left out, as at
    // the clone)
    const after = await hashes(await local(name));
    const paths = {};
    for (const [p, base] of Object.entries(m.paths)) if (head.blobs[p]?.sha === base.remote) paths[p] = base;
    for (const p of theirs) if (!paths[p] && after[p] !== undefined && (take.includes(p) || now[p] === head.blobs[p].sha)) paths[p] = { remote: head.blobs[p].sha, local: after[p] };
    for (const [p, l] of Object.entries(theirsLocal)) paths[p] = { remote: head.blobs[p].sha, local: l };
    await meta.set(name, { ...m, commit: head.commit, tree: head.tree, paths, gitignore: !!head.blobs['.gitignore'] });
    const resolved = merge.drawings.map(d => d.path);
    return { project: name, branch: m.branch, upToDate: false, files: [...new Set([...take.filter(p => files[p] !== undefined), ...drop, ...resolved, ...merge.generated])].sort(), ...(resolved.length ? { resolved } : {}) };
  }

  /** The project's commits, the newest first: [{ commit, author, date, message, files }] (the subject: the first line). */
  async function log(name, { limit = 100 } = {}) {
    const m = await need(name);
    if (!m.commit) return [];
    const n = Math.max(1, Math.min(1000, Math.floor(Number(limit) || 100)));
    const list = [];
    for (let page = 1; list.length < n; page++) {
      const got = await request('GET', `${R(m.owner, m.repo)}/commits?sha=${encodeURIComponent(m.branch)}&per_page=${Math.min(100, n)}&page=${page}`, undefined, { allow: [409] });
      if (!Array.isArray(got) || !got.length) break;
      list.push(...got);
      if (got.length < Math.min(100, n)) break;
    }
    const STATE = { added: 'new', removed: 'deleted', renamed: 'new', copied: 'new' };
    return each(list.slice(0, n), async c => {
      const d = await request('GET', `${R(m.owner, m.repo)}/commits/${c.sha}`);
      return {
        commit: c.sha, author: c.commit?.author?.name || c.author?.login || '', date: c.commit?.author?.date || '', message: String(c.commit?.message || '').split('\n')[0],
        files: (d.files || []).filter(f => own(f.filename)).map(f => ({ path: f.filename, state: STATE[f.status] || 'modified' })),
      };
    });
  }

  /** A file of the project as it was in a commit (read only): its text. */
  async function show(name, commitSha, rel) {
    if (!/^[0-9a-f]{7,64}$/i.test(String(commitSha ?? ''))) throw new GitError(`not a commit: ${String(commitSha ?? '')}`, 'Give a commit\'s hash, as the history lists it.');
    const key = String(rel ?? '').replace(/^\.\/+/, '');
    if (!key || key.split('/').some(s => !s || s.startsWith('.'))) throw new GitError(`'${rel}': not a file of the project`);
    const m = await need(name);
    const c = await request('GET', `${R(m.owner, m.repo)}/contents/${pathOf(key)}?ref=${encodeURIComponent(commitSha)}`, undefined, { allow: [404, 422] });
    const text = !c.status && c.type === 'file' ? textOf(fromBase64(c.content)) : null;
    if (text === null) throw new GitError(`no file '${key}' in the commit ${String(commitSha).slice(0, 7)}`, null, 404);
    return { project: name, commit: commitSha, path: key, text };
  }

  /** The checks GitHub ran on the project's last pushed commit (#3194: a Classroom assignment's visible tests):
   *  { project, remote, ...commitChecks }. */
  async function checks(name) {
    const m = await need(name);
    if (!m.commit) throw new GitError('nothing pushed to GitHub yet: the project has no commit there', 'Commit and Push first: GitHub then runs the repository\'s workflows on the commit.', 409);
    return { project: name, remote: `${m.owner}/${m.repo}`, ...await commitChecks(client, { owner: m.owner, repo: m.repo, ref: m.commit }) };
  }

  return { status, clone, init, commit, push, pull, log, show, checks };
}
