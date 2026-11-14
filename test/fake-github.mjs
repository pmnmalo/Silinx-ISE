// A stand-in for GitHub (#3196): the REST API's endpoints the browser edition's git uses (core/git-rest.js) and OAuth's
// device flow, in memory, no network: repositories with real blob hashes, trees, commits and branches that move only
// forward (a PATCH that is not a fast-forward refused, as GitHub's), private ones seen only with a token, every request
// recorded (the tests check that no token is ever in a URL). fetch: for the unit tests; handle: for an HTTP server's
// (the UI tests', test/ui/serve.js), with GitHub's CORS headers.
import crypto from 'node:crypto';

const sha1 = s => crypto.createHash('sha1').update(s).digest('hex');
const blobHash = buf => sha1(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf]));

export function fakeGitHub({ clientId = 'Iv1.fake-client-id', tokens = ['gho_faketokenofthetests0123456789'], user = 'student', interval = 5 } = {}) {
  const repos = new Map();   // 'owner/repo' -> { private, branch, blobs, trees, commits, refs, writers }
  const valid = new Set(tokens);
  const requests = [];
  const gists = new Map();   // id -> { public, description, owner, files }
  const devices = new Map();   // device_code -> { userCode, state: 'pending' | 'authorized' | 'denied', polls }
  const scopes = [];           // the scope each device code asked for (#3356)
  let clock = 0, checkId = 1000;

  const json = (status, body, headers = {}) => ({ status, body, headers });
  const nope = () => json(404, { message: 'Not Found' });

  function putBlob(r, buf) { const sha = blobHash(buf); r.blobs.set(sha, buf); return sha; }
  function putTree(r, entries) {   // entries: { path: { sha, mode } }
    const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    const sha = sha1(`tree ${JSON.stringify(sorted)}`);
    r.trees.set(sha, sorted);
    return sha;
  }
  function putCommit(r, { tree, parents, message, author = user }) {
    const date = new Date(Date.UTC(2026, 0, 1) + (++clock) * 60_000).toISOString();
    const sha = sha1(`commit ${JSON.stringify({ tree, parents, message, date, clock })}`);
    r.commits.set(sha, { tree, parents, message, author, date });
    return sha;
  }
  // a commit of these files ({ path: text | Buffer | null (deleted) }) on a branch, as someone pushing to GitHub would
  function commitFiles(full, files, { message = 'a change', branch, author = user } = {}) {
    const r = repos.get(full);
    branch ||= r.branch;
    const parent = r.refs.get(branch) || null;
    const entries = parent ? { ...r.trees.get(r.commits.get(parent).tree) } : {};
    for (const [p, v] of Object.entries(files)) {
      if (v === null) delete entries[p];
      else entries[p] = { sha: putBlob(r, Buffer.isBuffer(v) ? v : Buffer.from(v)), mode: '100644' };
    }
    const sha = putCommit(r, { tree: putTree(r, entries), parents: parent ? [parent] : [], message, author });
    r.refs.set(branch, sha);
    return sha;
  }
  /** A repository: files ({ path: text }) in its first commit (none: an empty repository). */
  function seed(full, files = null, { private: priv = false, branch = 'main', writers = [user] } = {}) {
    repos.set(full, { private: priv, branch, blobs: new Map(), trees: new Map(), commits: new Map(), refs: new Map(), writers: new Set(writers) });
    if (files) commitFiles(full, files, { message: 'Initial commit' });
  }
  const filesAt = (full, ref) => {
    const r = repos.get(full);
    const c = r.commits.get(r.refs.get(ref) || ref);
    return Object.fromEntries(Object.entries(r.trees.get(c.tree)).map(([p, e]) => [p, r.blobs.get(e.sha).toString('utf8')]));
  };
  const ancestors = (r, sha) => {
    const seen = new Set(), todo = [sha];
    while (todo.length) { const s = todo.pop(); if (seen.has(s)) continue; seen.add(s); todo.push(...(r.commits.get(s)?.parents || [])); }
    return seen;
  };

  function api(method, url, headers, body) {
    const auth = /^Bearer (.+)$/.exec(headers.authorization || '');
    if (auth && !valid.has(auth[1])) return json(401, { message: 'Bad credentials' });
    const signed = !!auth;
    if (url.pathname === '/user' && method === 'GET') return signed ? json(200, { login: user }) : json(401, { message: 'Requires authentication' });
    // gists (#3223): a secret one made by the signed-in user, read by anyone with its id; the user's own listed (100 a
    // page, their contents left out, as GitHub's) and deleted by them only (#3629)
    if (url.pathname === '/gists' && method === 'GET') {
      if (!signed) return json(401, { message: 'Requires authentication' });
      const per = Number(url.searchParams.get('per_page') || 30), page = Number(url.searchParams.get('page') || 1);
      const mine = [...gists].filter(([, g]) => g.owner === user).reverse().slice((page - 1) * per, page * per);
      return json(200, mine.map(([id, g]) => ({ id, html_url: `https://gist.github.com/${g.owner}/${id}`, created_at: g.created_at || null, public: g.public, description: g.description, files: Object.fromEntries(Object.keys(g.files).map((n) => [n, { filename: n }])) })));
    }
    if (url.pathname === '/gists' && method === 'POST') {
      if (!signed) return json(401, { message: 'Requires authentication' });
      const id = crypto.randomBytes(16).toString('hex');
      gists.set(id, { public: !!body.public, description: body.description, owner: user, created_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), files: Object.fromEntries(Object.entries(body.files || {}).map(([n, f]) => [n, { filename: n, content: f.content, truncated: false }])) });
      return json(201, { id, html_url: `https://gist.github.com/${user}/${id}`, public: !!body.public });
    }
    const gm = /^\/gists\/([0-9a-f]+)$/.exec(url.pathname);
    if (gm && method === 'GET') { const g = gists.get(gm[1]); return g ? json(200, { id: gm[1], ...g }) : nope(); }
    if (gm && method === 'DELETE') { if (!signed) return json(401, { message: 'Requires authentication' }); return gists.get(gm[1])?.owner === user && gists.delete(gm[1]) ? json(204, null) : nope(); }
    const m = /^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/.exec(url.pathname);
    if (!m) return nope();
    const full = `${decodeURIComponent(m[1])}/${decodeURIComponent(m[2])}`, rest = m[3] || '';
    const r = repos.get(full);
    if (!r || (r.private && !signed)) return nope();
    const write = method !== 'GET';
    if (write && !signed) return json(401, { message: 'Requires authentication' });
    if (write && !r.writers.has(user)) return json(403, { message: 'Resource not accessible by integration' });
    const empty = !r.refs.size;
    let x;
    if (!rest && method === 'GET') return json(200, { name: m[2], full_name: full, owner: { login: m[1] }, default_branch: r.branch, private: r.private });
    if ((x = /^\/git\/ref\/heads\/(.+)$/.exec(rest)) && method === 'GET') {
      if (empty) return json(409, { message: 'Git Repository is empty.' });
      const sha = r.refs.get(decodeURIComponent(x[1]));
      return sha ? json(200, { ref: `refs/heads/${x[1]}`, object: { sha, type: 'commit' } }) : nope();
    }
    if ((x = /^\/git\/refs\/heads\/(.+)$/.exec(rest)) && method === 'PATCH') {
      const b = decodeURIComponent(x[1]), cur = r.refs.get(b);
      if (!cur || !r.commits.has(body.sha)) return json(422, { message: 'Reference does not exist' });
      if (!body.force && !ancestors(r, body.sha).has(cur)) return json(422, { message: 'Update is not a fast forward' });
      r.refs.set(b, body.sha);
      return json(200, { ref: `refs/heads/${b}`, object: { sha: body.sha, type: 'commit' } });
    }
    if (empty && rest.startsWith('/git/')) return json(409, { message: 'Git Repository is empty.' });
    if ((x = /^\/git\/commits\/([0-9a-f]{40})$/.exec(rest)) && method === 'GET') {
      const c = r.commits.get(x[1]);
      return c ? json(200, { sha: x[1], tree: { sha: c.tree }, parents: c.parents.map(sha => ({ sha })), message: c.message, author: { name: c.author, date: c.date } }) : nope();
    }
    if (rest === '/git/commits' && method === 'POST') {
      if (!r.trees.has(body.tree) || !(body.parents || []).every(p => r.commits.has(p))) return json(422, { message: 'Tree or parent not found' });
      const sha = putCommit(r, { tree: body.tree, parents: body.parents || [], message: body.message });
      return json(201, { sha, tree: { sha: body.tree } });
    }
    if ((x = /^\/git\/trees\/([0-9a-f]{40})$/.exec(rest)) && method === 'GET') {
      const t = r.trees.get(x[1]);
      if (!t) return nope();
      return json(200, { sha: x[1], truncated: false, tree: Object.entries(t).map(([path, e]) => ({ path, mode: e.mode, type: 'blob', sha: e.sha, size: r.blobs.get(e.sha).length })) });
    }
    if (rest === '/git/trees' && method === 'POST') {
      const entries = body.base_tree ? { ...(r.trees.get(body.base_tree) || {}) } : {};
      for (const e of body.tree || []) {
        if (e.sha === null) delete entries[e.path];
        else if (typeof e.content === 'string') entries[e.path] = { sha: putBlob(r, Buffer.from(e.content, 'utf8')), mode: e.mode };
        else if (r.blobs.has(e.sha)) entries[e.path] = { sha: e.sha, mode: e.mode };
        else return json(422, { message: 'Blob not found' });
      }
      return json(201, { sha: putTree(r, entries) });
    }
    if ((x = /^\/git\/blobs\/([0-9a-f]{40})$/.exec(rest)) && method === 'GET') {
      const b = r.blobs.get(x[1]);
      return b ? json(200, { sha: x[1], size: b.length, encoding: 'base64', content: b.toString('base64').replace(/(.{60})/g, '$1\n') }) : nope();
    }
    if (rest === '/git/blobs' && method === 'POST') return json(201, { sha: putBlob(r, Buffer.from(body.content, body.encoding === 'base64' ? 'base64' : 'utf8')) });
    if (rest === '/commits' && method === 'GET') {
      if (empty) return json(409, { message: 'Git Repository is empty.' });
      const start = r.refs.get(url.searchParams.get('sha') || r.branch);
      const per = Number(url.searchParams.get('per_page') || 30), page = Number(url.searchParams.get('page') || 1);
      const line = [];
      for (let s = start; s; s = r.commits.get(s).parents[0]) line.push(s);
      return json(200, line.slice((page - 1) * per, page * per).map(sha => { const c = r.commits.get(sha); return { sha, commit: { message: c.message, author: { name: c.author, date: c.date } }, author: { login: c.author } }; }));
    }
    if ((x = /^\/commits\/([^/]+)\/check-runs$/.exec(rest)) && method === 'GET') {   // (#3194: a commit's checks)
      const ref = decodeURIComponent(x[1]), sha = r.refs.get(ref) || ref;
      const runs = (r.checks?.get(sha) || []).map(c => ({ id: c.id, name: c.name, status: c.status, conclusion: c.conclusion ?? null, html_url: `https://github.com/${full}/runs/${c.id}`, head_sha: sha, output: { title: c.title ?? null, summary: null, annotations_count: (c.annotations || []).length } }));
      return json(200, { total_count: runs.length, check_runs: runs });
    }
    if ((x = /^\/check-runs\/(\d+)\/annotations$/.exec(rest)) && method === 'GET') {
      const c = [...(r.checks?.values() || [])].flat().find(k => String(k.id) === x[1]);
      return c ? json(200, (c.annotations || []).map(a => ({ path: '.github', start_line: 1, end_line: 1, annotation_level: a.level, title: a.title, message: a.message }))) : nope();
    }
    if ((x = /^\/commits\/([0-9a-f]{40})$/.exec(rest)) && method === 'GET') {
      const c = r.commits.get(x[1]);
      if (!c) return nope();
      const now = r.trees.get(c.tree), before = c.parents[0] ? r.trees.get(r.commits.get(c.parents[0]).tree) : {};
      const files = [];
      for (const p of new Set([...Object.keys(now), ...Object.keys(before)])) {
        if (!before[p]) files.push({ filename: p, status: 'added' });
        else if (!now[p]) files.push({ filename: p, status: 'removed' });
        else if (before[p].sha !== now[p].sha) files.push({ filename: p, status: 'modified' });
      }
      return json(200, { sha: x[1], files: files.sort((a, b) => (a.filename < b.filename ? -1 : 1)) });
    }
    if ((x = /^\/contents\/(.+)$/.exec(rest))) {
      const p = x[1].split('/').map(decodeURIComponent).join('/');
      if (method === 'GET') {
        const ref = url.searchParams.get('ref') || r.branch;
        const c = r.commits.get(r.refs.get(ref) || ref);
        const e = c && r.trees.get(c.tree)[p];
        return e ? json(200, { type: 'file', path: p, sha: e.sha, encoding: 'base64', content: r.blobs.get(e.sha).toString('base64') }) : nope();
      }
      if (method === 'PUT') {
        const b = body.branch || r.branch;
        if (r.refs.get(b) && r.trees.get(r.commits.get(r.refs.get(b)).tree)[p] && !body.sha) return json(422, { message: '"sha" wasn\'t supplied.' });
        const sha = commitFiles(full, { [p]: Buffer.from(body.content, 'base64') }, { message: body.message, branch: b });
        return json(201, { content: { path: p }, commit: { sha, tree: { sha: r.commits.get(sha).tree } } });
      }
    }
    return nope();
  }

  function login(url, form) {
    if (url.pathname === '/login/device/code') {
      if (form.get('client_id') !== clientId) return json(404, { error: 'Not Found' });
      const deviceCode = crypto.randomBytes(10).toString('hex'), userCode = `WDJB-${String(devices.size + 1).padStart(4, '0')}`;
      devices.set(deviceCode, { userCode, state: 'pending', polls: 0, scope: form.get('scope') });
      scopes.push(form.get('scope'));
      return json(200, { device_code: deviceCode, user_code: userCode, verification_uri: 'https://github.com/login/device', expires_in: 900, interval });
    }
    if (url.pathname === '/login/oauth/access_token') {
      const d = devices.get(form.get('device_code'));
      if (form.get('client_id') !== clientId) return json(200, { error: 'incorrect_client_credentials' });
      if (!d) return json(200, { error: 'bad_verification_code' });
      d.polls++;
      if (d.state === 'denied') return json(200, { error: 'access_denied' });
      if (d.state !== 'authorized') return json(200, { error: 'authorization_pending' });
      devices.delete(form.get('device_code'));
      return json(200, { access_token: tokens[0], token_type: 'bearer', scope: d.scope });
    }
    return nope();
  }

  /** One request (method, a URL's path and query, its headers lower-cased, its body text) -> { status, body, headers }. */
  function handle(method, pathAndQuery, headers = {}, text = '') {
    const url = new URL(pathAndQuery, 'https://fake.github');
    requests.push({ method, url: url.pathname + url.search, headers: { ...headers } });
    const res = url.pathname.startsWith('/login/')
      ? login(url, new URLSearchParams(text))
      : api(method, url, headers, text ? JSON.parse(text) : undefined);
    return { ...res, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...res.headers } };
  }

  /** A fetch on this stand-in: its base (any: https://api.github.com, https://github.com) is ignored. */
  async function fetch(url, opts = {}) {
    const u = new URL(url);
    const headers = Object.fromEntries(Object.entries(opts.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const r = handle(opts.method || 'GET', u.pathname + u.search, headers, opts.body || '');
    return new Response(r.status === 204 ? null : JSON.stringify(r.body), { status: r.status, headers: r.headers });
  }

  /** An HTTP server's route for this stand-in under a prefix of the page's own origin (the site's CSP: 'self'). */
  const route = prefix => async (req, res, body) => {
    if (!req.url.startsWith(prefix)) return false;
    const r = handle(req.method, req.url.slice(prefix.length) || '/', Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)])), body);
    res.writeHead(r.status, r.headers).end(r.status === 204 ? '' : JSON.stringify(r.body));
    return true;
  };

  const deviceOf = userCode => [...devices.values()].find(d => d.userCode === userCode);
  return {
    clientId, token: tokens[0], repos, requests, gists, seed, commitFiles, filesAt, handle, fetch, route,
    codes: () => [...devices.values()].map(d => d.userCode),
    scopes: () => [...scopes],
    head: (full, branch) => repos.get(full).refs.get(branch || repos.get(full).branch),
    commitOf: (full, sha) => repos.get(full).commits.get(sha),
    authorize: userCode => { deviceOf(userCode).state = 'authorized'; },
    deny: userCode => { deviceOf(userCode).state = 'denied'; },
    revoke: t => valid.delete(t),
    // a commit's check runs, as GitHub Actions makes them (#3194): [{ name, status, conclusion, annotations: [{ level, title, message }] }]
    setChecks: (full, sha, runs) => { const r = repos.get(full); r.checks ||= new Map(); r.checks.set(sha, runs.map(c => ({ id: ++checkId, ...c }))); },
  };
}
