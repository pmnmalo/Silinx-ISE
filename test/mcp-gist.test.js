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

// #3629: project_link short's expires_days; open_link of an expired link refused, in core/gist-link.js's words; making
// a short link deletes the account's expired Silinx gists
test('#3629 project_link short expires_days: its date said; an expired link refused by open_link; the expired gists deleted', async () => {
  const { saveGist } = await import('../core/gist-link.js');
  const { githubClient } = await import('../core/github-api.js');
  const { encodeDesign, makeLink } = await import('../core/design-link.js');
  await ok('new_project_from_example', { name: 'clock1', example: 'blinky' });
  // a link that expired yesterday, made ten days ago
  const client = githubClient({ fetch: gh.fetch, token: () => gh.token });
  const old = await saveGist(client, (await encodeDesign([{ path: 'silinx.json', data: new TextEncoder().encode('{}') }])).design, { days: 9, now: Date.now() - 10 * 86400000 });
  const expired = await call('open_link', { link: makeLink('https://pmnmalo.github.io/Silinx/', { gist: `${old.id}.${old.key}` }), name: 'clock2' });
  assert.equal(expired.isError, true);
  assert.equal(expired.text, `open_link: the link expired on ${old.expires.slice(0, 10)} (its gist kept until its owner deletes it)`);
  const r = await ok('project_link', { project: 'clock1', short: true, expires_days: 7 });
  const date = new Date(Date.parse(r.data.expires)).toISOString().slice(0, 10);
  assert.ok(Math.abs(Date.parse(r.data.expires) - (Date.now() + 7 * 86400000)) < 60000, r.data.expires);
  assert.deepEqual(r.data.deleted, [old.id]);
  assert.ok(!gh.gists.has(old.id));
  assert.ok(r.text.startsWith(`The short link of 'clock1' (${r.data.length} characters; the project encrypted in a secret gist, https://gist.github.com/student/${r.data.gist}; it expires on ${date}):\n${r.data.link}\n1 expired short link deleted from the account's gists.`), r.text);
  assert.equal((await ok('open_link', { link: r.data.link, name: 'clock3' })).data.project, 'clock3');
  // refused: an expiry without short; days out of range
  assert.equal((await call('project_link', { project: 'clock1', expires_days: 7 })).text, 'project_link: expires_days: only a short link expires (give short: true)');
  assert.equal((await call('project_link', { project: 'clock1', short: true, expires_days: 4000 })).text, 'project_link: expires_days: at most 3650');   // (the schema's maximum, #3641)
});

// #3635: short_links lists the account's short links, delete_short_link deletes some or the expired ones; another gist
// refused, nothing deleted; the arguments checked
test('#3635 short_links and delete_short_link: the account\'s short links listed, deleted; another gist refused', async () => {
  const { saveGist } = await import('../core/gist-link.js');
  const { githubClient } = await import('../core/github-api.js');
  for (const id of [...gh.gists.keys()]) gh.gists.delete(id);
  assert.equal((await ok('short_links')).text, 'No short link in the account.');
  const client = githubClient({ fetch: gh.fetch, token: () => gh.token });
  // (the live one first: making a short link deletes the expired ones)
  const live = await saveGist(client, 'live', { days: 30 });
  const old = await saveGist(client, 'old', { days: 1, now: Date.now() - 10 * 86400000 });
  gh.gists.set('e'.repeat(32), { public: false, owner: 'student', description: 'notes', files: { 'n.md': { filename: 'n.md', content: 'x' } } });
  const r = await ok('short_links');
  const day = (iso) => iso.slice(0, 10), today = new Date().toISOString().slice(0, 10);
  assert.equal(r.text, ['2 short links, the newest first:',
    `${old.id}: made ${today}, expired ${day(old.expires)} (https://gist.github.com/student/${old.id})`,
    `${live.id}: made ${today}, expires ${day(live.expires)} (https://gist.github.com/student/${live.id})`].join('\n'));
  assert.deepEqual(r.data.links.map((g) => [g.id, g.expired]), [[old.id, true], [live.id, false]]);
  // refused: nothing given, both given, another gist (nothing deleted)
  assert.equal((await call('delete_short_link', {})).text, 'delete_short_link: give gists (their ids: short_links) or expired: true');
  assert.equal((await call('delete_short_link', { gists: [live.id], expired: true })).text, 'delete_short_link: give gists or expired: true, not both');
  assert.equal((await call('delete_short_link', { gists: [live.id, 'e'.repeat(32)] })).text, `delete_short_link: '${'e'.repeat(32)}' is not a short link of your GitHub account`);
  assert.ok(gh.gists.has(live.id));
  assert.equal((await ok('delete_short_link', { expired: true })).text, `1 short link deleted (the expired ones): ${old.id}.`);
  assert.deepEqual((await ok('delete_short_link', { gists: [live.id] })).data.deleted, [live.id]);
  assert.deepEqual([...gh.gists.keys()], ['e'.repeat(32)]);
  // no token: said with its hint
  delete process.env.GH_TOKEN;
  try {
    assert.equal((await call('short_links')).text, 'short_links: the short links need a GitHub token on this server\nHint: Set GH_TOKEN before starting Silinx (with GitHub\'s command line: GH_TOKEN=$(gh auth token)); Silinx never stores it.');
  } finally { process.env.GH_TOKEN = gh.token; }
});
