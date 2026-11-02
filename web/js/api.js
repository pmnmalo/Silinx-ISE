// Thin REST client for the Silinx server.

// The server answers only with its token, made at every start (#2564) and given in the address it
// prints and opens (…/#token=…): kept for this browser (another tab opened at the plain address has it
// too, until the server restarts), sent with every request.
const TOKEN = (() => {
  try {
    const m = /(?:^#|&)token=([\w-]+)/.exec(location.hash);
    if (m) { localStorage.setItem('silinx-token', m[1]); history.replaceState(null, '', location.pathname + location.search); }
    return localStorage.getItem('silinx-token');
  } catch { return null; }
})();
const auth = (headers = {}) => (TOKEN ? { ...headers, 'X-Silinx-Token': TOKEN } : headers);

async function req(method, url, body, { text = false } = {}) {
  const opts = { method, headers: auth() };
  if (body !== undefined) {
    if (typeof body === 'string') { opts.body = body; opts.headers['Content-Type'] = 'text/plain'; }
    else { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  }
  let r;
  try { r = await fetch(url, opts); }
  catch { throw Object.assign(new Error('the Silinx server is not running (start it with: node bin/silinx-ise.js serve)'), { offline: true }); }
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`;
    try { const j = await r.json(); if (j.error) msg = j.error; } catch { /* not json */ }
    throw Object.assign(new Error(msg), { status: r.status });
  }
  if (text) return r.text();
  const ct = r.headers.get('content-type') || '';
  return ct.includes('json') ? r.json() : r.text();
}

const enc = encodeURIComponent;

export const api = {
  projects: () => req('GET', '/api/projects'),
  workspace: () => req('GET', '/api/workspace'),
  templates: () => req('GET', '/api/templates'),
  testDesigns: () => req('GET', '/api/test-designs'),
  createProject: p => req('POST', '/api/projects', p),
  project: name => req('GET', `/api/projects/${enc(name)}`),
  saveProject: (name, pj) => req('PUT', `/api/projects/${enc(name)}`, pj),
  deleteProject: name => req('DELETE', `/api/projects/${enc(name)}`),
  readFile: (name, path) => req('GET', `/api/projects/${enc(name)}/file?path=${enc(path)}`, undefined, { text: true }),
  writeFile: (name, path, text) => req('PUT', `/api/projects/${enc(name)}/file?path=${enc(path)}`, text),
  renameFile: (name, from, to) => req('POST', `/api/projects/${enc(name)}/rename`, { from, to }),
  deleteFile: (name, path) => req('DELETE', `/api/projects/${enc(name)}/file?path=${enc(path)}`),
  sources: name => req('GET', `/api/projects/${enc(name)}/sources`),
  devices: () => req('GET', '/api/devices'),
  toolchain: (project = null) => req('GET', `/api/toolchain${project ? `?project=${enc(project)}` : ''}`),
  saveToolchain: (cfg, project = null) => req('PUT', `/api/toolchain${project ? `?project=${enc(project)}` : ''}`, cfg),
  openStatus: name => req('GET', `/api/projects/${enc(name)}/open-status`),
  implement: (name, body) => req('POST', `/api/projects/${enc(name)}/implement`, body),
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
    const r = await fetch(`/api/projects/${enc(name)}/export.zip?kind=${enc(kind)}`, { headers: auth() });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
    let warnings = [];
    try { warnings = JSON.parse(decodeURIComponent(r.headers.get('X-Silinx-Warnings') || '[]')); } catch { /* none */ }
    return { blob: await r.blob(), filename: kind === 'silinx' ? `${name}-silinx.zip` : `${name}.zip`, warnings };
  },
  importZip: async (name, file) => {
    const r = await fetch(`/api/projects/import-zip?name=${enc(name)}`, { method: 'POST', headers: auth({ 'Content-Type': 'application/zip' }), body: file });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  },
  syncXise: (name, direction) => req('POST', `/api/projects/${enc(name)}/sync-xise`, { direction }),
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
