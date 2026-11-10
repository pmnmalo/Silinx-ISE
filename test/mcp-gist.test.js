// The MCP server's short links (#3223, server/mcp-link.js): project_link short, the project encrypted in a secret gist
// of the account of GH_TOKEN (a stand-in for GitHub, test/fake-github.mjs); open_link of that link, the same files,
// with no token; a deleted gist and no token said with their messages.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { scratchEnv } from './server-helpers.js';
import { fakeGitHub } from './fake-github.mjs';

const GH = await import('../server/git-github.js');
const { handle } = await import('../server/mcp.js');
let gh, id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };

before(async () => {
  await scratchEnv('silinx-mcp-gist-');
  gh = fakeGitHub();
  GH.GITHUB_TESTING.fetch = gh.fetch;
  delete process.env.GITHUB_TOKEN;
  process.env.GH_TOKEN = gh.token;
});
after(() => { GH.GITHUB_TESTING.fetch = null; delete process.env.GH_TOKEN; });

test('project_link short: a secret gist, the link #gist=…; open_link opens it with no token, the same project', async () => {
  await ok('new_project_from_example', { name: 'lamp', example: 'blinky' });
  const r = await ok('project_link', { project: 'lamp', short: true, view: 'simulate' });
  const link = r.data.link;
  assert.match(link, /^https:\/\/pmnmalo\.github\.io\/Silinx\/#gist=[0-9a-f]{32}\.[A-Za-z0-9_-]{43}&view=simulate$/);
  assert.equal(r.data.length, link.length);
  assert.ok(r.text.startsWith('The short link of \'lamp\', opening the simulation ('), r.text);
  assert.equal(gh.gists.get(r.data.gist).public, false);
  delete process.env.GH_TOKEN;
  const o = await ok('open_link', { link, name: 'lamp2' });
  assert.equal(o.data.project, 'lamp2');
  assert.equal(o.data.view, 'simulate');
  const a = (await ok('read_file', { project: 'lamp', path: 'src/counter.v' })).text, b = (await ok('read_file', { project: 'lamp2', path: 'src/counter.v' })).text;
  assert.equal(b, a);
  // no token: said, with its hint; a deleted gist
  const no = await call('project_link', { project: 'lamp', short: true });
  assert.equal(no.isError, true);
  assert.equal(no.text, 'project_link: a short link needs a GitHub token on this server\nHint: Set GH_TOKEN before starting Silinx (with GitHub\'s command line: GH_TOKEN=$(gh auth token)), or copy the full link; Silinx never stores it.');
  gh.gists.delete(r.data.gist);
  const gone = await call('open_link', { link, name: 'lamp3' });
  assert.equal(gone.isError, true);
  assert.equal(gone.text, 'open_link: the link\'s gist is not on GitHub (deleted, or the link is cut)');
  process.env.GH_TOKEN = gh.token;
});
