// The routes of git (#3195, server/git.js) for the interface of the server editions: a project's status, commit, push,
// pull, history and a file as it was in a commit, a repository made or cloned. A failure answers its message and its
// hint ({ error, hint, files }), which the console shows.
import * as Git from './git.js';
import * as GH from './git-github.js';

// the back end: the system's git, or GitHub's API (SILINX_GIT=github, #3196)
const B = () => (GH.githubBackend() ? GH : Git);

export function registerGitRoutes(api) {
  const route = fn => (req, res) => Promise.resolve().then(() => {
    if (!Git.gitEnabled()) throw new Git.GitError('git is turned off on this server (SILINX_GIT=off)', null, 403);
    return fn(req);
  }).then(
    out => { if (!res.headersSent) res.json(out); },
    err => res.status(err.status || 500).json({ error: err.status ? err.message : 'internal server error', ...(err.hint ? { hint: err.hint } : {}), ...(err.files ? { files: err.files } : {}), ...(err.projects ? { projects: err.projects } : {}), ...(err.drawings ? { drawings: err.drawings } : {}) }),
  );
  const body = req => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});
  // a short link's gist (#3223): made with the server's GitHub token (GH_TOKEN), never the page's
  api.get('/gist', (req, res) => res.json({ available: GH.gistAvailable() }));
  api.post('/gist', (req, res) => Promise.resolve().then(() => {
    const { design: d, expires_days: days = 0 } = body(req);
    if (typeof d !== 'string' || !d) throw Object.assign(new Error('design: the encoded design (Share Project\'s)'), { status: 400 });
    return GH.makeGist(d, { days });   // (an expiry, #3629: checked by core/gist-link.js expiryDate)
  }).then(({ id, key, expires, deleted }) => res.json({ id, key, expires, deleted: deleted.length }), err => res.status(err.status || 500).json({ error: err.status ? err.message : 'internal server error', ...(err.hint ? { hint: err.hint } : {}) })));
  // the token's short links (#3635): listed; deleted, given ids or the expired ones
  api.get('/gists', route(() => GH.listShortLinks()));
  api.post('/gists/delete', route(req => GH.deleteShortLinks({ ids: Array.isArray(body(req).ids) ? body(req).ids.map(String) : [], expired: body(req).expired === true }).then(deleted => ({ deleted }))));
  // (whether git is there: the interface shows its menu)
  api.get('/git', (req, res) => res.json({ enabled: Git.gitEnabled() }));
  api.post('/git/clone', route(req => B().gitClone({ url: body(req).url, name: body(req).name || null })));
  api.get('/projects/:p/git/status', route(req => B().gitStatus(req.params.p)));
  api.post('/projects/:p/git/init', route(req => B().gitInit(req.params.p, { remote: body(req).remote || null })));
  api.post('/projects/:p/git/commit', route(req => B().gitCommit(req.params.p, body(req).message)));
  api.post('/projects/:p/git/push', route(req => B().gitPush(req.params.p)));
  api.post('/projects/:p/git/pull', route(async req => B().gitPull(req.params.p, { resolve: (await import('../core/git-resolve.js')).checkChoices(body(req).resolve) })));
  api.get('/projects/:p/git/log', route(req => B().gitLog(req.params.p, { limit: req.query.limit })));
  api.get('/projects/:p/git/show', route(req => B().gitShow(req.params.p, req.query.commit, req.query.path)));
}
