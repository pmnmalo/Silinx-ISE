// Silinx HTTP server: static web UI, shared core modules and the REST API.
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as P from './projects.js';
import { orderExamples } from '../core/examples.js';
import { orderTestDesigns } from '../core/test-designs.js';
import { importMapPackages } from './import-map.js';
import { contentSecurityPolicy, inlineScriptHashes } from './csp.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).then(
  out => { if (out !== undefined && !res.headersSent) res.json(out); },
  err => res.status(err.status || 500).json({ error: err.message }),
);

const cspCache = new Map();
/** The Content-Security-Policy of a page of web/ (null if it is not one): its inline scripts by hash. */
export function pageCsp(file) {
  if (!file.startsWith(path.join(ROOT, 'web') + path.sep)) return null;
  let st;
  try { st = fs.statSync(file); } catch { return null; }
  const hit = cspCache.get(file);
  if (hit && hit.mtime === st.mtimeMs) return hit.csp;
  const csp = contentSecurityPolicy({ hashes: inlineScriptHashes(fs.readFileSync(file, 'utf8')) });
  cspCache.set(file, { mtime: st.mtimeMs, csp });
  return csp;
}

/** A loopback address (the server only reachable from this machine). */
export const isLoopback = host => ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(String(host).toLowerCase()) || /^127\./.test(String(host)) || /^::ffff:127\./.test(String(host));

export async function createApp({ host = '127.0.0.1', token = null } = {}) {
  const app = express();
  // The API changes files and runs the ISE flow: only the Silinx page itself may call it.
  // A request from another web origin (a malicious page in the same browser) is refused, and when
  // bound to localhost the Host header must be local too (DNS rebinding). Bound to another address
  // (--host 0.0.0.0, a LAN address), the API answers only this machine's own requests (a loopback
  // client and a local Host) or those carrying the server's token (X-Silinx-Token; printed in the URL at
  // start-up): another machine, or a page rebinding its name to this one, has neither. ?token= is taken on
  // the download links only (export.xise, export.zip: a GET a link opens, #1434): an address stays in the
  // browser's history and in proxies' logs.
  const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
  const DOWNLOAD = /^\/projects\/[^/]+\/export\.(xise|zip)$/;
  const exposed = !isLoopback(host);
  if (exposed && !token) throw new Error('a server on a non-loopback address needs a token');
  const digest = s => crypto.createHash('sha256').update(s).digest();
  const tokenOk = t => typeof t === 'string' && crypto.timingSafeEqual(digest(t), digest(token));
  app.use('/api', (req, res, next) => {
    // never cached (#1434): a project's text would stay in the browser's disk cache after the project is deleted
    res.set('Cache-Control', 'no-store');
    const hostName = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
    if (exposed) {
      if (!(isLoopback(req.socket.remoteAddress || '') && LOCAL.has(hostName)) && !tokenOk(req.headers['x-silinx-token']) && !(req.method === 'GET' && DOWNLOAD.test(req.path) && tokenOk(req.query.token)))
        return res.status(403).json({ error: 'this Silinx server needs its token: open the URL it printed at start-up' });
    } else if (hostName && !LOCAL.has(hostName) && hostName !== String(host).toLowerCase()) return res.status(403).json({ error: 'forbidden host' });
    // a request another site's page made (an <img>, a link, a form: the browser says so in
    // Sec-Fetch-Site) is refused, a GET too: some GETs write a file or start a process
    if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'cross-site request refused' });
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers.origin) {
      let oh = '';
      try { oh = new URL(req.headers.origin).host.toLowerCase(); } catch { /* invalid origin */ }
      if (oh !== String(req.headers.host || '').toLowerCase()) return res.status(403).json({ error: 'cross-origin request refused' });
    }
    next();
  });
  app.use('/api', express.json({ limit: '20mb' }));
  app.use('/api', express.text({ type: 'text/*', limit: '20mb' }));

  // Content-Security-Policy of the pages: scripts only from the server itself (and the pages' own
  // inline scripts, by their hashes), no plug-ins, no framing; so a script injected into a page
  // cannot run and reach the API above
  // every response (#1236): served as the type it says (a project's text is never taken for a script), no
  // address sent to another site, and no word of the server's software
  app.disable('x-powered-by');
  app.use((req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); next(); });
  // (on the file served, so however the URL spells it)
  const setHeaders = (res, file) => { if (/\.html$/i.test(file)) { const csp = pageCsp(file); if (csp) res.set('Content-Security-Policy', csp); } };
  app.use('/', express.static(path.join(ROOT, 'web'), { setHeaders }));
  app.use('/core', express.static(path.join(ROOT, 'core')));
  // the toolchain's package (silinx-fpga, #1677): its code, which core/'s re-exports import
  app.use('/packages/silinx-fpga/src', express.static(path.join(ROOT, 'packages/silinx-fpga/src')));
  app.use('/vendor/elk', express.static(path.join(ROOT, 'node_modules/elkjs/lib')));
  // the editor's ES modules (CodeMirror 6): the packages the import map of web/index.html names, only
  for (const pkg of importMapPackages()) {
    app.use(`/vendor/npm/${pkg}`, express.static(path.join(ROOT, 'node_modules', pkg)));
  }
  // Yosys compiled to WebAssembly (YoWASP): the open synthesis runs in the browser (web/js/yosys-worker.js)
  app.use('/vendor/yowasp-yosys', express.static(path.join(ROOT, 'node_modules/@yowasp/yosys')));
  // nextpnr in WebAssembly, its chip databases beside its bundle (the browser edition's nextpnr engine, #2136)
  app.use('/vendor/nextpnr-spartan', express.static(path.join(ROOT, 'node_modules/@silinx/nextpnr-himbaechel-spartan3e')));
  // (the iCE40's nextpnr and icepack, when installed: not in the release zip, #2295)
  app.use('/vendor/nextpnr-ice40', express.static(path.join(ROOT, 'node_modules/@yowasp/nextpnr-ice40')));

  const api = express.Router();
  api.get('/projects', wrap(() => P.listProjects()));
  // where the projects are kept: the Start page says it (#1297)
  api.get('/workspace', wrap(() => ({ folder: P.workspaceDir() })));
  api.post('/projects', wrap(req => P.createProject(req.body || {})));
  api.get('/projects/:p', wrap(async req => ({ ...await P.readProject(req.params.p), fileTree: await P.fileTree(req.params.p) })));
  api.put('/projects/:p', wrap(req => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw Object.assign(new Error('expected a JSON project object'), { status: 400 });
    return P.writeProject(req.params.p, req.body);
  }));
  api.delete('/projects/:p', wrap(async req => { await P.deleteProject(req.params.p); return { ok: true }; }));
  api.get('/projects/:p/file', wrap(async (req, res) => {
    const text = await P.readFile(req.params.p, req.query.path);   // read first: an error must go out as JSON, not text/plain
    res.type('text/plain').send(text);
  }));
  api.put('/projects/:p/file', wrap(async req => {
    const body = typeof req.body === 'string' ? req.body : (req.body?.text ?? '');
    await P.writeFile(req.params.p, req.query.path, body);
    return { ok: true };
  }));
  api.post('/projects/:p/rename', wrap(async req => {
    const { from, to } = req.body || {};
    if (!from || !to) throw Object.assign(new Error('from and to are required'), { status: 400 });
    return P.renameFile(req.params.p, String(from), String(to));
  }));
  api.delete('/projects/:p/file', wrap(async req => { await P.deleteFile(req.params.p, req.query.path); return { ok: true }; }));
  api.get('/projects/:p/sources', wrap(req => P.readSources(req.params.p)));
  // the examples, in the order the interface lists them (gates first: core/examples.js)
  api.get('/templates', wrap(() => orderExamples(fs.readdirSync(P.EXAMPLES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(P.EXAMPLES_DIR, d.name, 'silinx.json')))
    .map(d => d.name))));
  // the test designs (#1746), a category of their own (core/test-designs.js)
  api.get('/test-designs', wrap(() => orderTestDesigns(P.templateNames(P.TEST_DESIGNS_DIR))));

  // Implementation (ISE) + programming routes live in impl-routes.js.
  const { registerImplRoutes } = await import('./impl-routes.js');
  registerImplRoutes(api, { wrap, projects: P });

  app.use('/api', api);
  // an error no route answered (a bad body, a bad address): its message, never a stack trace with the server's paths
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status || err.statusCode || 500;
    res.status(status).json({ error: status < 500 ? err.message : 'internal server error' });
  });
  return app;
}

export async function startServer({ port = 8642, host = '127.0.0.1' } = {}) {
  // another address than loopback: a token for the API, made anew at every start
  const token = isLoopback(host) ? null : crypto.randomBytes(18).toString('base64url');
  const app = await createApp({ host, token });
  return new Promise((resolve, reject) => {
    // Express 5 calls the listen callback with the error too (a port in use): not "running"
    const srv = app.listen(port, host, err => {
      if (err) return reject(err);
      console.log(`Silinx running at http://${host}:${port}  (workspace: ${P.workspaceDir()})`);
      if (token) {
        console.log(`WARNING: listening on ${host}, not only on this machine. Other computers that can reach this port need the address below (with its token);`);
        console.log('         anyone who has it can change your projects and run the toolchain. Use the default (127.0.0.1) unless you need this.');
        console.log(`         http://${['0.0.0.0', '::'].includes(host) ? '<this computer>' : host}:${port}/#token=${token}`);
      }
      srv.silinxToken = token;
      resolve(srv);
    });
    srv.on('error', reject);
  });
}

/** Open a URL in the default browser (best effort). */
export async function openBrowser(url) {
  // SILINX_NO_BROWSER=1: only print the URL (tests run the launchers this way; also for a server)
  if (process.env.SILINX_NO_BROWSER) return;
  const { spawn } = await import('node:child_process');
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    // no opener installed (headless Linux without xdg-open): spawn reports ENOENT as an 'error' event,
    // which would crash the process without a listener
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => { /* no browser: the URL is printed */ });
    child.unref();
  } catch { /* no browser: the URL is printed */ }
}
