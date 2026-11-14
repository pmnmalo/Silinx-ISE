// Thin REST client for the Silinx server.

import { prefKey } from './prefs.js';

// The server answers only with its token, made at every start (#2564) and given in the address it
// prints (…/#token=…); the address a launcher opens has a one-time code instead (…/#code=…, #2955: not the token,
// on the opener's command line), which the page exchanges for the token. The token is kept for this browser
// (another tab opened at the plain address has it too, until the server restarts), sent with every request.
// Only an address whose hash is the token alone, or the code alone, sets it: a link with other options (#2826) does
// not (#2829); and an address's token replaces the one kept only if the server accepts it (#2955).
const TOKEN_KEY = prefKey('silinx-token');
const store = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: t => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* not kept: this page only */ } },
};
let TOKEN = store.get();
const READY = (async () => {
  let m;
  try { m = /^#(token|code)=([\w-]+)$/.exec(location.hash); } catch { return; }
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  const token = await tokenOf(m[1], m[2], fetch);
  if (token) { TOKEN = token; store.set(token); }
})();
const auth = (headers = {}) => (TOKEN ? { ...headers, 'X-Silinx-Token': TOKEN } : headers);
const authed = async (headers = {}) => { await READY; return auth(headers); };

/** The token an address gives (null when refused or the server is not reached): a one-time code exchanged for it
 *  (POST /api/token), or a token the server accepts (GET /api/workspace with it). */
export async function tokenOf(kind, value, f = fetch) {
  try {
    if (kind === 'code') {
      const r = await f('/api/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: value }) });
      const j = r.ok ? await r.json() : null;
      return typeof j?.token === 'string' ? j.token : null;
    }
    const r = await f('/api/workspace', { headers: { 'X-Silinx-Token': value } });
    return r.ok ? value : null;
  } catch { return null; }
}

async function req(method, url, body, { text = false } = {}) {
  const opts = { method, headers: await authed() };
  if (body !== undefined) {
    if (typeof body === 'string') { opts.body = body; opts.headers['Content-Type'] = 'text/plain'; }
    else { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  }
  let r;
  try { r = await fetch(url, opts); }
  catch { throw Object.assign(new Error('the Silinx server is not running (start it with: node bin/silinx.js serve)'), { offline: true }); }
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`, more = {};
    // (git's failures carry a hint for the console, and a conflict its files: #3195)
    try { const j = await r.json(); if (j.error) msg = j.error; if (j.hint) more.hint = j.hint; if (j.files) more.files = j.files; if (j.drawings) more.drawings = j.drawings; } catch { /* not json */ }
    throw Object.assign(new Error(msg), { status: r.status }, more);
  }
  if (text) return r.text();
  const ct = r.headers.get('content-type') || '';
  return ct.includes('json') ? r.json() : r.text();
}

const enc = encodeURIComponent;

export const api = {
  // shared projects (#3181): this server's relay (server/collab-relay.js) opens a room with the token
  collab: true,
  collabToken: async () => { await READY; return TOKEN; },
  // (the other relays its pages may use: config.json's relay.relays, #3227)
  collabRelays: async () => (await req('GET', '/api/collab/relays')).relays,
  projects: () => req('GET', '/api/projects'),
  workspace: () => req('GET', '/api/workspace'),
  templates: () => req('GET', '/api/templates'),
  testDesigns: () => req('GET', '/api/test-designs'),
  exampleFiles: name => req('GET', `/api/templates/${enc(name)}/files`),
  createProject: p => req('POST', '/api/projects', p),
  project: name => req('GET', `/api/projects/${enc(name)}`),
  saveProject: (name, pj) => req('PUT', `/api/projects/${enc(name)}`, pj),
  trustProject: name => req('POST', `/api/projects/${enc(name)}/trust`),
  deleteProject: name => req('DELETE', `/api/projects/${enc(name)}`),
  readFile: (name, path) => req('GET', `/api/projects/${enc(name)}/file?path=${enc(path)}`, undefined, { text: true }),
  writeFile: (name, path, text) => req('PUT', `/api/projects/${enc(name)}/file?path=${enc(path)}`, text),
  renameFile: (name, from, to) => req('POST', `/api/projects/${enc(name)}/rename`, { from, to }),
  // (trash: the user's Delete File / Delete Folder, into the workspace's .trash -> { trashed }, #3364)
  deleteFile: (name, path, { trash = false } = {}) => req('DELETE', `/api/projects/${enc(name)}/file?path=${enc(path)}${trash ? '&trash=1' : ''}`),
  sources: name => req('GET', `/api/projects/${enc(name)}/sources`),
  // a synthesis test of the project's exercise, graded on the server (#3216, server/grade-routes.js): { result }
  gradeSynthesis: (name, exercise, test) => req('POST', `/api/projects/${enc(name)}/grade/synthesis`, { exercise, test }),
  // a short link's gist (#3223): made by the server with its GitHub token
  gistAvailable: () => req('GET', '/api/gist').then(r => !!r.available, () => false),
  gistList: () => req('GET', '/api/gists'),   // (#3635: the short links of the server's token)
  gistDelete: ({ ids = [], expired = false } = {}) => req('POST', '/api/gists/delete', { ids, expired }).then(r => r.deleted),
  gistSave: (design, days = 0) => req('POST', '/api/gist', { design, ...(days ? { expires_days: days } : {}) }),
  // git (#3195, the server editions: server/git-routes.js)
  gitEnabled: () => req('GET', '/api/git'),
  gitClone: (url, name = null) => req('POST', '/api/git/clone', { url, ...(name ? { name } : {}) }),
  gitStatus: name => req('GET', `/api/projects/${enc(name)}/git/status`),
  gitInit: (name, remote = null) => req('POST', `/api/projects/${enc(name)}/git/init`, remote ? { remote } : {}),
  gitCommit: (name, message) => req('POST', `/api/projects/${enc(name)}/git/commit`, { message }),
  gitPush: name => req('POST', `/api/projects/${enc(name)}/git/push`, {}),
  gitPull: (name, { resolve = null } = {}) => req('POST', `/api/projects/${enc(name)}/git/pull`, resolve ? { resolve } : {}),
  gitLog: (name, limit = 100) => req('GET', `/api/projects/${enc(name)}/git/log?limit=${limit}`),
  gitChecks: name => req('GET', `/api/projects/${enc(name)}/git/checks`),   // (#3194)
  gitShow: (name, commit, path) => req('GET', `/api/projects/${enc(name)}/git/show?commit=${enc(commit)}&path=${enc(path)}`),
  devices: () => req('GET', '/api/devices'),
  toolchain: (project = null) => req('GET', `/api/toolchain${project ? `?project=${enc(project)}` : ''}`),
  saveToolchain: (cfg, project = null) => req('PUT', `/api/toolchain${project ? `?project=${enc(project)}` : ''}`, cfg),
  openStatus: name => req('GET', `/api/projects/${enc(name)}/open-status`),
  implement: (name, body) => req('POST', `/api/projects/${enc(name)}/implement`, body),
  // the logic analyzer's capture on the board (#3176): { job }, its result { capture, file }
  capture: (name, body) => req('POST', `/api/projects/${enc(name)}/capture`, body),
  reports: name => req('GET', `/api/projects/${enc(name)}/reports`),
  fpgaView: name => req('GET', `/api/projects/${enc(name)}/fpga-view`),
  bitinfo: name => req('GET', `/api/projects/${enc(name)}/bitinfo`),
  program: body => req('POST', '/api/program', body),
  scan: body => req('POST', '/api/jtag/scan', body),
  prom: body => req('POST', '/api/prom', body),
  job: (id, since = 0) => req('GET', `/api/jobs/${enc(id)}?since=${since}`),
  cancelJob: id => req('POST', `/api/jobs/${enc(id)}/cancel`),
  importXise: body => req('POST', '/api/projects/import-xise', body),
  // whole project as a zip (.xise + silinx.json + all files)
  exportZip: async (name, kind = 'xilinx') => {
    const r = await fetch(`/api/projects/${enc(name)}/export.zip?kind=${enc(kind)}`, { headers: await authed() });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
    let warnings = [];
    try { warnings = JSON.parse(decodeURIComponent(r.headers.get('X-Silinx-Warnings') || '[]')); } catch { /* none */ }
    return { blob: await r.blob(), filename: kind === 'silinx' ? `${name}-silinx.zip` : `${name}.zip`, warnings };
  },
  importZip: async (name, file) => {
    const r = await fetch(`/api/projects/import-zip?name=${enc(name)}`, { method: 'POST', headers: await authed({ 'Content-Type': 'application/zip' }), body: file });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  },
  syncXise: (name, direction) => req('POST', `/api/projects/${enc(name)}/sync-xise`, { direction }),
  // what another process changes in the project (#2843): onEvent({ project, changes: [{ path, kind }] }) for each,
  // until the stream ends or `signal` aborts (server-sent events read through fetch: the token in a header, not in the URL)
  events: async (name, onEvent, signal) => {
    const r = await fetch(`/api/projects/${enc(name)}/events`, { headers: await authed(), signal });
    if (!r.ok || !r.body) throw Object.assign(new Error(`${r.status} ${r.statusText}`), { status: r.status });
    const reader = r.body.getReader(), dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buf += dec.decode(value, { stream: true });
      let k;
      while ((k = buf.indexOf('\n\n')) >= 0) {
        const data = buf.slice(0, k).split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('\n');
        buf = buf.slice(k + 2);
        if (data) { try { onEvent(JSON.parse(data)); } catch { /* not an event */ } }
      }
    }
  },
};

// Poll a server job until it finishes, streaming log lines.
export async function followJob(id, onLine, { signal } = {}) {
  let since = 0, cancelled = false;
  for (;;) {
    const j = await api.job(id, since);
    for (const l of j.lines || []) onLine(l);
    since = j.next ?? since + (j.lines?.length || 0);
    if (j.status !== 'running') return j;
    // (once: the job is told to stop, then followed to its end)
    if (signal?.aborted && !cancelled) { cancelled = true; await api.cancelJob(id).catch(() => {}); }
    await new Promise(r => setTimeout(r, 350));
  }
}
