// Child process used by the UI tests: the Silinx server on a free port. The workspace and the
// configuration directory come from SILINX_WORKSPACE / SILINX_CONFIG_DIR (temp dirs set by the
// harness); the chosen port is printed as "SILINX_PORT <n>".
import path from 'node:path';
import { createApp } from '../../server/server.js';

// git's remotes (#3195): https://github.com/<owner>/<repo> cloned from SILINX_UI_GIT_REMOTES/<repo>.git, a local bare
// repository (no network)
if (process.env.SILINX_UI_GIT_REMOTES) {
  const { GIT_TESTING } = await import('../../server/git.js');
  Object.assign(GIT_TESTING, { localRemotes: true, remoteOf: r => path.join(process.env.SILINX_UI_GIT_REMOTES, `${r.repo}.git`) });
}

const app = await createApp({ host: '127.0.0.1' });
// a stand-in for GitHub's API (#3223, test/fake-github.mjs), on the server's own origin (its page's CSP: 'self') at
// /fake-github: the server's gists made there (GH_TOKEN, the stand-in's), the page's read there (SILINX_GITHUB.api)
let handler = app;
if (process.env.SILINX_UI_GITHUB) {
  const { fakeGitHub } = await import('../fake-github.mjs');
  const gh = fakeGitHub();
  (await import('../../server/git-github.js')).GITHUB_TESTING.fetch = gh.fetch;
  const route = gh.route('/fake-github');
  handler = async (req, res) => {
    if (!req.url.startsWith('/fake-github/')) return app(req, res);
    const chunks = [];
    for await (const c of req) chunks.push(c);
    await route(req, res, Buffer.concat(chunks).toString('utf8'));
  };
}
const listen = handler === app ? (...a) => app.listen(...a) : async (...a) => (await import('node:http')).createServer(handler).listen(...a);
const srv = await listen(0, '127.0.0.1', err => {
  if (err) throw err;
  process.stdout.write(`SILINX_PORT ${srv.address().port}\n`);
});
const stop = () => { srv.closeAllConnections?.(); srv.close(() => process.exit(0)); setTimeout(() => process.exit(0), 500).unref(); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
// exit with the parent (the test process) even when it is killed
process.stdin.on('end', stop);
process.stdin.resume();
