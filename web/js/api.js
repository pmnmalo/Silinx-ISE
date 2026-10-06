// Thin REST client for the XAIlinx server.
async function req(method, url, body, { text = false } = {}) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    if (typeof body === 'string') { opts.body = body; opts.headers['Content-Type'] = 'text/plain'; }
    else { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  }
  let r;
  try { r = await fetch(url, opts); }
  catch { throw Object.assign(new Error('the XAIlinx server is not running (start it with: node bin/xailinx.js serve)'), { offline: true }); }
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`;
    try { const j = await r.json(); if (j.error) msg = j.error; } catch { /* not json */ }
    throw new Error(msg);
  }
  if (text) return r.text();
  const ct = r.headers.get('content-type') || '';
  return ct.includes('json') ? r.json() : r.text();
}

const enc = encodeURIComponent;

export const api = {
  projects: () => req('GET', '/api/projects'),
  templates: () => req('GET', '/api/templates'),
  createProject: p => req('POST', '/api/projects', p),
  project: name => req('GET', `/api/projects/${enc(name)}`),
  saveProject: (name, pj) => req('PUT', `/api/projects/${enc(name)}`, pj),
  deleteProject: name => req('DELETE', `/api/projects/${enc(name)}`),
  readFile: (name, path) => req('GET', `/api/projects/${enc(name)}/file?path=${enc(path)}`, undefined, { text: true }),
  writeFile: (name, path, text) => req('PUT', `/api/projects/${enc(name)}/file?path=${enc(path)}`, text),
  deleteFile: (name, path) => req('DELETE', `/api/projects/${enc(name)}/file?path=${enc(path)}`),
  sources: name => req('GET', `/api/projects/${enc(name)}/sources`),
  devices: () => req('GET', '/api/devices'),
  toolchain: () => req('GET', '/api/toolchain'),
  saveToolchain: cfg => req('PUT', '/api/toolchain', cfg),
  implement: (name, body) => req('POST', `/api/projects/${enc(name)}/implement`, body),
  reports: name => req('GET', `/api/projects/${enc(name)}/reports`),
  bitinfo: name => req('GET', `/api/projects/${enc(name)}/bitinfo`),
  program: body => req('POST', '/api/program', body),
  scan: body => req('POST', '/api/jtag/scan', body),
  prom: body => req('POST', '/api/prom', body),
  job: (id, since = 0) => req('GET', `/api/jobs/${enc(id)}?since=${since}`),
  cancelJob: id => req('POST', `/api/jobs/${enc(id)}/cancel`),
  exportXiseUrl: name => `/api/projects/${enc(name)}/export.xise`,
  importXise: body => req('POST', '/api/projects/import-xise', body),
  // whole project as a zip (.xise + xailinx.json + all files)
  exportZip: async name => {
    const r = await fetch(`/api/projects/${enc(name)}/export.zip`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
    let warnings = [];
    try { warnings = JSON.parse(decodeURIComponent(r.headers.get('X-XAIlinx-Warnings') || '[]')); } catch { /* none */ }
    return { blob: await r.blob(), filename: `${name}.zip`, warnings };
  },
  importZip: async (name, file) => {
    const r = await fetch(`/api/projects/import-zip?name=${enc(name)}`, { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: file });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  },
  syncXise: (name, direction) => req('POST', `/api/projects/${enc(name)}/sync-xise`, { direction }),
};

// Poll a server job until it finishes, streaming log lines.
export async function followJob(id, onLine, { signal } = {}) {
  let since = 0;
  for (;;) {
    const j = await api.job(id, since);
    for (const l of j.lines || []) onLine(l);
    since = j.next ?? since + (j.lines?.length || 0);
    if (j.status !== 'running') return j;
    if (signal?.aborted) { await api.cancelJob(id).catch(() => {}); }
    await new Promise(r => setTimeout(r, 350));
  }
}
