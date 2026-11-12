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
import { contentSecurityPolicy, inlineScriptHashes, relaySources } from './csp.js';
import { configDir, relayConfig } from './toolchain.js';
import { createProjectWatcher } from './project-watch.js';
import { listJobs } from './jobs.js';
import { createOpenCodes, tokenProof } from './open-code.js';
import { launchTarget } from './open-page.js';
import { tightenConfigFolder, tightenedMessage } from './config-folder.js';
import { attachRelay } from './collab-relay.js';

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
  // (the other relays config.json lets its pages use, #3227: connected to by these only)
  const relays = relayConfig().relays;
  const hit = cspCache.get(file);
  if (hit && hit.mtime === st.mtimeMs && hit.relays === relays.join(' ')) return hit.csp;
  const csp = contentSecurityPolicy({ hashes: inlineScriptHashes(fs.readFileSync(file, 'utf8')), connect: relaySources(relays) });
  cspCache.set(file, { mtime: st.mtimeMs, relays: relays.join(' '), csp });
  return csp;
}

/** A loopback address (the server only reachable from this machine). */
export const isLoopback = host => ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(String(host).toLowerCase()) || /^127\./.test(String(host)) || /^::ffff:127\./.test(String(host));

export async function createApp({ host = '127.0.0.1', token = null, codes = createOpenCodes(), relay = relayConfig() } = {}) {
  const app = express();
  // The API changes files and runs the ISE flow: only the Silinx page itself may call it.
  // A request from another web origin (a malicious page in the same browser) is refused, and when
  // bound to localhost the Host header must be local too (DNS rebinding). With a token (`serve` makes one
  // at every start, on every address, #2564), the API answers only the requests that carry it
  // (X-Silinx-Token; printed in the URL at start-up): another user of this computer, another machine, or a
  // page rebinding its name to this one, has none. Never in a query string (#3045: an address stays in the
  // browser's history, in a shell's and in proxies' logs; the page downloads an export with the header).
  // Without a token (tests, an app embedding the server) only loopback is allowed.
  // Two requests need no token (#2955): the page a launcher opened exchanges its one-time code for the token
  // (POST /api/token, from the page itself: its Origin required), and a second launch asks for the proof that
  // this server holds the token of its file (GET /api/proof, an HMAC of the launcher's nonce).
  const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
  const exposed = !isLoopback(host);
  if (exposed && !token) throw new Error('a server on a non-loopback address needs a token');
  const digest = s => crypto.createHash('sha256').update(s).digest();
  const tokenOk = t => typeof t === 'string' && crypto.timingSafeEqual(digest(t), digest(token));
  app.locals.openCode = () => codes.issue();
  const tokenless = req => (req.method === 'POST' && req.path === '/token') || (req.method === 'GET' && req.path === '/proof');
  app.use('/api', (req, res, next) => {
    // never cached (#1434): a project's text would stay in the browser's disk cache after the project is deleted
    res.set('Cache-Control', 'no-store');
    const hostName = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
    if (!exposed && hostName && !LOCAL.has(hostName) && hostName !== String(host).toLowerCase()) return res.status(403).json({ error: 'forbidden host' });
    if (token && !tokenless(req) && !tokenOk(req.headers['x-silinx-token']))
      return res.status(403).json({ error: 'this Silinx server needs its token: open the URL it printed at start-up' });
    // a request another site's page made (an <img>, a link, a form: the browser says so in
    // Sec-Fetch-Site) is refused, a GET too: some GETs write a file or start a process
    if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'cross-site request refused' });
    if (tokenless(req) && req.method === 'POST' && !req.headers.origin) return res.status(403).json({ error: 'cross-origin request refused' });
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers.origin) {
      let oh = '';
      try { oh = new URL(req.headers.origin).host.toLowerCase(); } catch { /* invalid origin */ }
      if (oh !== String(req.headers.host || '').toLowerCase()) return res.status(403).json({ error: 'cross-origin request refused' });
    }
    next();
  });
  // the relay of shared projects (#3181, server/collab-relay.js): on the server that app.listen makes, behind the same
  // checks of the host and the origin; a room opened with the token only (a follower joins one with its link). With
  // config.json's relay (#3227): the pages of its origins let in on the relay's endpoints too (never the API's), and its
  // key opening a room as the token does
  const relayKeyOk = t => !!relay.key && typeof t === 'string' && crypto.timingSafeEqual(digest(t), digest(relay.key));
  const listen = app.listen.bind(app);
  app.listen = (...a) => {
    const srv = listen(...a);
    app.locals.relay = attachRelay(srv, {
      allowed: req => {
        const hostName = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
        if (!exposed && hostName && !LOCAL.has(hostName) && hostName !== String(host).toLowerCase()) return 'forbidden host';
        if (req.headers.origin) {
          let oh = '';
          try { oh = new URL(req.headers.origin).host.toLowerCase(); } catch { /* invalid origin */ }
          if (oh !== String(req.headers.host || '').toLowerCase() && !relay.origins.includes(req.headers.origin)) return 'cross-origin request refused';
        }
        return null;
      },
      tokenOk: t => !token || tokenOk(t) || relayKeyOk(t),
    });
    return srv;
  };
  // the open projects watched (#2843): what another process changes in them is told to the page; this server's
  // own changes are not (a request that may write holds its project while it runs, and a run of its own too)
  const watcher = createProjectWatcher({
    dirOf: P.projectDir,
    busy: name => listJobs().some(j => j.status === 'running' && String(j.meta?.project || '').toLowerCase() === name.toLowerCase()),
  });
  app.locals.watcher = watcher;
  const WRITING_GET = /^\/projects\/[^/]+\/(export\.xise|fpga-view)$/;
  // (a pull writes what GitHub had, not what the page sent: told to the page, its open documents read again, #3195)
  const TOLD = /^\/projects\/[^/]+\/git\/pull$/;
  app.use('/api', (req, res, next) => {
    const m = /^\/projects\/([^/]+)/.exec(req.path);
    if (m && !TOLD.test(req.path) && (!['GET', 'HEAD'].includes(req.method) || WRITING_GET.test(req.path))) {
      let name = '';
      try { name = decodeURIComponent(m[1]); } catch { /* a bad name: refused by its route */ }
      const release = watcher.hold(name);
      res.once('finish', release);
      res.once('close', release);
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
  // the HDL front end's package (silinx-hdl, #1710): its code, which core/'s re-exports import
  app.use('/packages/silinx-hdl/src', express.static(path.join(ROOT, 'packages/silinx-hdl/src')));
  app.use('/vendor/elk', express.static(path.join(ROOT, 'node_modules/elkjs/lib')));
  // the editor's ES modules (CodeMirror 6): the packages the import map of web/index.html names, only
  for (const pkg of importMapPackages()) {
    app.use(`/vendor/npm/${pkg}`, express.static(path.join(ROOT, 'node_modules', pkg)));
  }
  // Yosys compiled to WebAssembly (YoWASP): the open synthesis runs in the browser (web/js/yosys-worker.js)
  app.use('/vendor/yowasp-yosys', express.static(path.join(ROOT, 'node_modules/@yowasp/yosys')));
  // nextpnr in WebAssembly, its chip databases beside its bundle (the browser edition's nextpnr engine, #2136)
  app.use('/vendor/nextpnr-spartan', express.static(path.join(ROOT, 'node_modules/@silinx/nextpnr-himbaechel-spartan3e')));
  // (the Spartan-6's, #2288)
  app.use('/vendor/nextpnr-spartan6', express.static(path.join(ROOT, 'node_modules/@silinx/nextpnr-himbaechel-spartan6')));
  app.use('/vendor/nextpnr-xc7', express.static(path.join(ROOT, 'node_modules/@silinx/nextpnr-himbaechel-xc7')));   // (the 7-series', #3143)
  // (the iCE40's nextpnr and icepack, when installed: not in the release zip, #2295)
  app.use('/vendor/nextpnr-ice40', express.static(path.join(ROOT, 'node_modules/@yowasp/nextpnr-ice40')));
  app.use('/vendor/nextpnr-ecp5', express.static(path.join(ROOT, 'node_modules/@yowasp/nextpnr-ecp5')));   // (the ECP5's, #2302)
  app.use('/vendor/nextpnr-himbaechel-gowin', express.static(path.join(ROOT, 'node_modules/@yowasp/nextpnr-himbaechel-gowin')));   // (the Gowin's, #2303)

  const api = express.Router();
  // the token for a one-time code of a launcher's address (#2955); a code for the address a second launch opens
  const noToken = () => Object.assign(new Error('this Silinx server has no token'), { status: 404 });
  api.post('/token', wrap(req => {
    if (!token) throw noToken();
    if (!codes.redeem(req.body?.code)) throw Object.assign(new Error('this address has expired: open the URL Silinx printed at start-up'), { status: 403 });
    return { token };
  }));
  api.post('/open-code', wrap(() => { if (!token) throw noToken(); return { code: codes.issue() }; }));
  api.get('/proof', wrap(req => {
    if (!token) throw noToken();
    const nonce = String(req.query.nonce || '');
    if (!/^[\w-]{16,128}$/.test(nonce)) throw Object.assign(new Error('a nonce is required'), { status: 400 });
    return { proof: tokenProof(token, nonce) };
  }));
  api.get('/projects', wrap(() => P.listProjects()));
  // where the projects are kept: the Start page says it (#1297)
  api.get('/workspace', wrap(() => ({ folder: P.workspaceDir() })));
  // the other relays this server's pages may share and follow through (config.json's relay.relays, #3227)
  api.get('/collab/relays', wrap(() => ({ relays: relayConfig().relays })));
  api.post('/projects', wrap(req => P.createProject(req.body || {})));
  api.get('/projects/:p', wrap(async req => ({ ...await P.readProject(req.params.p), fileTree: await P.fileTree(req.params.p) })));
  api.put('/projects/:p', wrap(req => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw Object.assign(new Error('expected a JSON project object'), { status: 400 });
    return P.writeProject(req.params.p, req.body);
  }));
  // the user trusts a project from outside (#2830, core/trust.js): the interface's Trust Project, no MCP tool
  api.post('/projects/:p/trust', wrap(req => P.trustProject(req.params.p)));
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
  // (trash=1: the user's Delete File / Delete Folder, into the workspace's .trash, #3364)
  api.delete('/projects/:p/file', wrap(async req => {
    const { trashed } = await P.deleteFile(req.params.p, req.query.path, { trash: req.query.trash === '1' });
    return { ok: true, ...(trashed ? { trashed } : {}) };
  }));
  // what changes in the project's folder made by another process (#2843): server-sent events, one { project,
  // changes: [{ path, kind }] } each (a comment now and then keeps the stream open through proxies)
  api.get('/projects/:p/events', wrap(async (req, res) => {
    await P.readProject(req.params.p);   // (a project that does not exist: its error, as JSON)
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    res.write(': watching\n\n');
    const off = watcher.subscribe(req.params.p, ev => res.write(`data: ${JSON.stringify(ev)}\n\n`));
    const beat = setInterval(() => res.write(': \n\n'), 25_000);
    beat.unref?.();
    res.on('close', () => { clearInterval(beat); off(); });
  }));
  api.get('/projects/:p/sources', wrap(req => P.readSources(req.params.p)));
  // the examples, in the order the interface lists them (gates first: core/examples.js)
  api.get('/templates', wrap(() => orderExamples(fs.readdirSync(P.EXAMPLES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(P.EXAMPLES_DIR, d.name, 'silinx.json')))
    .map(d => d.name))));
  // an example's files (#2826: a link to it opens the project of that name as it is when it has the same files)
  api.get('/templates/:name/files', wrap(req => P.exampleFiles(req.params.name)));
  // the test designs (#1746), a category of their own (core/test-designs.js)
  api.get('/test-designs', wrap(() => orderTestDesigns(P.templateNames(P.TEST_DESIGNS_DIR))));

  // Implementation (ISE) + programming routes live in impl-routes.js.
  const { registerImplRoutes } = await import('./impl-routes.js');
  registerImplRoutes(api, { wrap, projects: P });
  // git (#3195): a project in a GitHub repository
  const { registerGitRoutes } = await import('./git-routes.js');
  registerGitRoutes(api);
  // automatic grading's synthesis tests (#3216)
  const { registerGradeRoutes } = await import('./grade-routes.js');
  registerGradeRoutes(api, { wrap, projects: P });

  app.use('/api', api);
  // an error no route answered (a bad body, a bad address): its message, never a stack trace with the server's paths
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status || err.statusCode || 500;
    res.status(status).json({ error: status < 500 ? err.message : 'internal server error' });
  });
  return app;
}

/** The file that holds the token of the server on `port` while it runs: a second `serve` (the launcher
 *  double-clicked twice) opens the running server with it; readable by its owner only. */
export const tokenFile = port => path.join(configDir(), `server-${port}.token`);

export async function startServer({ port = 8642, host = '127.0.0.1' } = {}) {
  // a token for the API, made anew at every start, on loopback too (#2564): another user of this
  // computer reaches 127.0.0.1 as well
  const token = crypto.randomBytes(18).toString('base64url');
  const app = await createApp({ host, token });
  return new Promise((resolve, reject) => {
    // Express 5 calls the listen callback with the error too (a port in use): not "running"
    const srv = app.listen(port, host, err => {
      if (err) return reject(err);
      const real = srv.address().port;
      const file = tokenFile(real);
      // (the configuration folder its owner's only, one made before #2564 too, #3410)
      const tightened = tightenedMessage(tightenConfigFolder());
      if (tightened) console.log(tightened);
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
        fs.rmSync(file, { force: true });   // written anew, so the mode below holds
        fs.writeFileSync(file, token, { mode: 0o600 });
        srv.on('close', () => fs.rmSync(file, { force: true }));
      } catch { /* no configuration folder: a second launch only says it is running */ }
      const shown = ['0.0.0.0', '::'].includes(host) ? '127.0.0.1' : host;
      srv.silinxUrl = `http://${shown}:${real}/#token=${token}`;
      // the address to open in the browser: a one-time code, not the token, on the opener's command line (#2955)
      srv.silinxOpenUrl = () => `http://${shown}:${real}/#code=${app.locals.openCode()}`;
      console.log(`Silinx running at http://${host}:${port}  (workspace: ${P.workspaceDir()})`);
      if (!isLoopback(host)) {
        console.log(`WARNING: listening on ${host}, not only on this machine. Other computers that can reach this port need the address below (with its token);`);
        console.log('         anyone who has it can change your projects and run the toolchain. Use the default (127.0.0.1) unless you need this.');
        console.log(`         http://${['0.0.0.0', '::'].includes(host) ? '<this computer>' : host}:${real}/#token=${token}`);
      } else console.log(`Open it at ${srv.silinxUrl}`);
      srv.silinxToken = token;
      resolve(srv);
    });
    srv.on('error', reject);
  });
}

/** The opener's command for `url`: [cmd, args]; an address with its one-time code (or a token) as the path of a page
 *  of the configuration folder that leads to it, readable by its owner only, never on the command line (#3409). */
export function openerCommand(url, { platform = process.platform, target = launchTarget } = {}) {
  let to = url;
  try { to = target(url); } catch { /* no configuration folder: the address as it is */ }
  return platform === 'win32' ? ['cmd', ['/c', 'start', '""', to]] : platform === 'darwin' ? ['open', [to]] : ['xdg-open', [to]];
}

/** Open a URL in the default browser (best effort). */
export async function openBrowser(url) {
  // SILINX_NO_BROWSER=1: only print the URL (tests run the launchers this way; also for a server)
  if (process.env.SILINX_NO_BROWSER) return;
  const { spawn } = await import('node:child_process');
  const [cmd, args] = openerCommand(url);
  try {
    // no opener installed (headless Linux without xdg-open): spawn reports ENOENT as an 'error' event,
    // which would crash the process without a listener
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => { /* no browser: the URL is printed */ });
    child.unref();
  } catch { /* no browser: the URL is printed */ }
}
