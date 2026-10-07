// XAIlinx HTTP server: static web UI, shared core modules and the REST API.
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as P from './projects.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const wrap = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).then(
  out => { if (out !== undefined && !res.headersSent) res.json(out); },
  err => res.status(err.status || 500).json({ error: err.message }),
);

export async function createApp() {
  const app = express();
  app.use(express.json({ limit: '20mb' }));
  app.use(express.text({ type: 'text/*', limit: '20mb' }));

  app.use('/', express.static(path.join(ROOT, 'web')));
  app.use('/core', express.static(path.join(ROOT, 'core')));
  app.use('/vendor/elk', express.static(path.join(ROOT, 'node_modules/elkjs/lib')));
  app.use('/vendor/codemirror', express.static(path.join(ROOT, 'node_modules/codemirror')));

  const api = express.Router();
  api.get('/projects', wrap(() => P.listProjects()));
  api.post('/projects', wrap(req => P.createProject(req.body || {})));
  api.get('/projects/:p', wrap(async req => ({ ...await P.readProject(req.params.p), fileTree: await P.fileTree(req.params.p) })));
  api.put('/projects/:p', wrap(req => P.writeProject(req.params.p, req.body)));
  api.delete('/projects/:p', wrap(async req => { await P.deleteProject(req.params.p); return { ok: true }; }));
  api.get('/projects/:p/file', wrap(async (req, res) => { res.type('text/plain').send(await P.readFile(req.params.p, req.query.path)); }));
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
  api.get('/templates', wrap(() => fs.readdirSync(P.EXAMPLES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(P.EXAMPLES_DIR, d.name, 'xailinx.json')))
    .map(d => d.name)));

  // Implementation (ISE) + programming routes live in impl-routes.js.
  const { registerImplRoutes } = await import('./impl-routes.js');
  registerImplRoutes(api, { wrap, projects: P });

  app.use('/api', api);
  return app;
}

export async function startServer({ port = 8642, host = '127.0.0.1' } = {}) {
  const app = await createApp();
  return new Promise(resolve => {
    const srv = app.listen(port, host, () => {
      console.log(`XAIlinx running at http://${host}:${port}  (workspace: ${P.workspaceDir()})`);
      resolve(srv);
    });
  });
}
