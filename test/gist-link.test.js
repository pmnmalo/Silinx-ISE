// A short link through an encrypted secret GitHub gist (#3223, core/gist-link.js), against a stand-in for GitHub
// (test/fake-github.mjs): the encryption's round trip (a random key and IV each time, the design never readable in the
// gist); a link opened with a wrong or cut key, a tampered gist, a deleted gist, a gist that is not Silinx's, one too
// large, each refused with its message; the link's form (#gist=<id>.<key>, with view=, top=, ui=); a whole example
// saved and opened again, every file back (decodeDesign: the design link's gate and limits); the server's gist, with
// the environment's token (server/git-github.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { encryptDesign, decryptDesign, saveGist, loadGist, parseGistRef, GIST_FILE, GIST_FORMAT, GIST_MAX } from '../core/gist-link.js';
import { LINK_LIMITS, encodeDesign, decodeDesign, makeLink, parseLink } from '../core/design-link.js';
import { githubClient } from '../core/github-api.js';
import { fakeGitHub } from './fake-github.mjs';

const ROOT = path.join(import.meta.dirname, '..', 'examples');
const entriesOf = (name) => {
  const out = [];
  const walk = (d) => { for (const f of fs.readdirSync(path.join(ROOT, name, d), { withFileTypes: true })) { const rel = d ? `${d}/${f.name}` : f.name; if (f.isDirectory()) walk(rel); else out.push({ path: rel, data: new Uint8Array(fs.readFileSync(path.join(ROOT, name, rel))) }); } };
  walk('');
  return out;
};
const rejects = (p, message, status) => assert.rejects(p, (e) => { assert.equal(e.linkError, true); assert.equal(e.message, message); if (status) assert.equal(e.status, status); return true; });

test('encrypt and decrypt: the design back, a random key and IV each time, the design not readable in the gist', async () => {
  const design = 'A'.repeat(100) + 'açãoXYZ_-';
  const a = await encryptDesign(design), b = await encryptDesign(design);
  assert.match(a.key, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a.key, b.key);
  assert.notEqual(JSON.parse(a.content).iv, JSON.parse(b.content).iv);
  assert.equal(JSON.parse(a.content).format, GIST_FORMAT);
  assert.ok(!a.content.includes('AAAAAAAAAA') && !a.content.includes('ação'));
  assert.equal(await decryptDesign(a.content, a.key), design);
  // a large design (the largest a link takes): no stack overflow, back as it was
  const big = 'x'.repeat(LINK_LIMITS.maxEncoded);
  const c = await encryptDesign(big);
  assert.ok(c.content.length <= GIST_MAX, `${c.content.length} > ${GIST_MAX}`);
  assert.equal(await decryptDesign(c.content, c.key), big);
  await rejects(encryptDesign('x'.repeat(LINK_LIMITS.maxEncoded + 1)), `the project is too large for a link (${LINK_LIMITS.maxEncoded + 1} characters, at most ${LINK_LIMITS.maxEncoded})`);
  await rejects(encryptDesign(''), 'nothing to put in the link');
});

test('a wrong or cut key, a tampered gist, a gist that is not Silinx\'s or too large: refused, each with its message', async () => {
  const { content, key } = await encryptDesign('design');
  const other = (await encryptDesign('design')).key;
  await rejects(decryptDesign(content, other), 'the link\'s key does not open its gist (a wrong or cut link)', 422);
  await rejects(decryptDesign(content, key.slice(0, 20)), 'the link\'s key does not open its gist (a wrong or cut link)');
  const j = JSON.parse(content);
  const flip = j.data[5] === 'A' ? 'B' : 'A';
  await rejects(decryptDesign(JSON.stringify({ ...j, data: j.data.slice(0, 5) + flip + j.data.slice(6) }), key), 'the link\'s key does not open its gist (a wrong or cut link)');
  for (const c of ['not json', JSON.stringify({ format: 'other', version: 1, iv: j.iv, data: j.data }), JSON.stringify({ ...j, version: 2 }), '[]'])
    await rejects(decryptDesign(c, key), 'the link\'s gist is not a Silinx link', 422);
  await rejects(decryptDesign('x'.repeat(GIST_MAX + 1), key), 'the link\'s gist is too large for a Silinx link');
});

test('the link\'s form: #gist=<id>.<key> with the view, the module, the board; a broken one refused', () => {
  const id = 'aa'.repeat(16), key = 'k'.repeat(43);
  const link = makeLink('https://pmnmalo.github.io/Silinx/', { gist: `${id}.${key}`, view: 'simulate', top: 'tb_top' });
  assert.equal(link, `https://pmnmalo.github.io/Silinx/#gist=${id}.${key}&top=tb_top&view=simulate`);
  assert.equal(`#gist=${id}.${key}`.length, 82);   // (a gist's id, 32 hex digits; the key, 32 bytes in base64url)
  assert.deepEqual(parseLink(link.slice(link.indexOf('#'))), { source: { kind: 'gist', id, key }, view: 'simulate', top: 'tb_top', board: null });
  assert.deepEqual(parseGistRef(`${id}.${key}`), { id, key });
  for (const bad of ['', id, `${id}.short`, `XYZ.${key}`, `${id}.${key}.x`, `${id}.${key.slice(0, 42)}+`])
    assert.throws(() => parseLink(`#gist=${encodeURIComponent(bad)}`), { message: 'the link\'s gist= is not a short link\'s (<gist>.<key>)' }, bad);
  assert.throws(() => parseLink(`#gist=${id}.${key}&design=abc`), { message: 'the link has more than one of design=, open= and gist=' });
  assert.throws(() => makeLink('https://x/', { gist: 'nope' }), { message: 'the link\'s gist= is not a short link\'s (<gist>.<key>)' });
});

test('saved as a secret gist of the signed-in user, opened with no sign-in: the example back, every file; a deleted gist, another\'s file', async () => {
  const gh = fakeGitHub();
  const client = githubClient({ fetch: gh.fetch, token: () => gh.token });
  const e = await encodeDesign(entriesOf('blinky'));
  const g = await saveGist(client, e.design);
  assert.match(g.id, /^[0-9a-f]{32}$/);
  const saved = gh.gists.get(g.id);
  assert.equal(saved.public, false);
  assert.deepEqual(Object.keys(saved.files), [GIST_FILE]);
  assert.ok(!saved.files[GIST_FILE].content.includes(e.design.slice(0, 40)));
  assert.ok(!gh.requests.some((r) => r.url.includes(g.key)), 'the key never sent to GitHub');
  // opened: no token sent, the design back, the files as they were
  const before = gh.requests.length;
  const design = await loadGist(g, { fetch: gh.fetch });
  assert.equal(design, e.design);
  assert.ok(gh.requests.slice(before).every((r) => !r.headers.authorization));
  const d = await decodeDesign(design);
  assert.equal(d.name, 'blinky');
  const counter = d.entries.find((x) => x.path === 'src/counter.v');
  assert.equal(Buffer.from(counter.data).toString('utf8'), fs.readFileSync(path.join(ROOT, 'blinky', 'src', 'counter.v'), 'utf8'));
  // refused: not signed in to save; a wrong key; a deleted gist; a gist with no Silinx file; truncated; GitHub not reached
  await assert.rejects(saveGist(githubClient({ fetch: gh.fetch, token: () => null }), e.design), { message: 'GitHub refused the sign-in (Requires authentication)' });
  await rejects(loadGist({ id: g.id, key: (await encryptDesign('x')).key }, { fetch: gh.fetch }), 'the link\'s key does not open its gist (a wrong or cut link)');
  gh.gists.delete(g.id);
  await rejects(loadGist(g, { fetch: gh.fetch }), 'the link\'s gist is not on GitHub (deleted, or the link is cut)', 404);
  const id2 = 'b'.repeat(32);
  gh.gists.set(id2, { public: false, files: { 'notes.md': { filename: 'notes.md', content: 'hello', truncated: false } } });
  await rejects(loadGist({ id: id2, key: g.key }, { fetch: gh.fetch }), 'the link\'s gist is not a Silinx link', 422);
  gh.gists.set(id2, { public: false, files: { [GIST_FILE]: { filename: GIST_FILE, content: '{', truncated: true } } });
  await rejects(loadGist({ id: id2, key: g.key }, { fetch: gh.fetch }), 'the link\'s gist is too large for a Silinx link', 413);
  await rejects(loadGist(g, { fetch: async () => { throw new TypeError('Failed to fetch'); } }), 'GitHub could not be reached to open the link\'s gist', 503);
});

test('the server\'s gist (server/git-github.js): made with GH_TOKEN, read with none; no token said with its hint', async () => {
  const GH = await import('../server/git-github.js');
  const gh = fakeGitHub();
  GH.GITHUB_TESTING.fetch = gh.fetch;
  const keep = process.env.GH_TOKEN, keep2 = process.env.GITHUB_TOKEN;
  try {
    delete process.env.GITHUB_TOKEN;
    process.env.GH_TOKEN = gh.token;
    assert.equal(GH.gistAvailable(), true);
    const g = await GH.makeGist('the design');
    assert.equal(await GH.readGist(g), 'the design');
    delete process.env.GH_TOKEN;
    assert.equal(GH.gistAvailable(), false);
    await assert.rejects(GH.makeGist('x'), { message: 'a short link needs a GitHub token on this server', status: 409 });
  } finally {
    GH.GITHUB_TESTING.fetch = null;
    if (keep !== undefined) process.env.GH_TOKEN = keep;
    if (keep2 !== undefined) process.env.GITHUB_TOKEN = keep2;
  }
});
