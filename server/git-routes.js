// The routes of git (#3195, server/git.js) for the interface of the server editions: a project's status, commit, push,
// pull, history and a file as it was in a commit, a repository made or cloned. A failure answers its message and its
// hint ({ error, hint, files }), which the console shows.
import * as G from './git.js';

export function registerGitRoutes(api) {
  const route = fn => (req, res) => Promise.resolve().then(() => {
    if (!G.gitEnabled()) throw new G.GitError('git is turned off on this server (SILINX_GIT=off)', null, 403);
    return fn(req);
  }).then(
    out => { if (!res.headersSent) res.json(out); },
    err => res.status(err.status || 500).json({ error: err.status ? err.message : 'internal server error', ...(err.hint ? { hint: err.hint } : {}), ...(err.files ? { files: err.files } : {}), ...(err.projects ? { projects: err.projects } : {}) }),
  );
  const body = req => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});
  // (whether git is there: the interface shows its menu)
  api.get('/git', (req, res) => res.json({ enabled: G.gitEnabled() }));
  api.post('/git/clone', route(req => G.gitClone({ url: body(req).url, name: body(req).name || null })));
  api.get('/projects/:p/git/status', route(req => G.gitStatus(req.params.p)));
  api.post('/projects/:p/git/init', route(req => G.gitInit(req.params.p, { remote: body(req).remote || null })));
  api.post('/projects/:p/git/commit', route(req => G.gitCommit(req.params.p, body(req).message)));
  api.post('/projects/:p/git/push', route(req => G.gitPush(req.params.p)));
  api.post('/projects/:p/git/pull', route(req => G.gitPull(req.params.p)));
  api.get('/projects/:p/git/log', route(req => G.gitLog(req.params.p, { limit: req.query.limit })));
  api.get('/projects/:p/git/show', route(req => G.gitShow(req.params.p, req.query.commit, req.query.path)));
}
