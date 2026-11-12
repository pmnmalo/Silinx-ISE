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
import { encryptDesign, decryptDesign, saveGist, loadGist, parseGistRef, expiryDate, deleteExpiredGists, EXPIRY_DAYS, GIST_FILE, GIST_FORMAT, GIST_MAX, GIST_ANSWER_MAX } from '../core/gist-link.js';
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
  for (const c of ['not json', JSON.stringify({ format: 'other', version: 1, iv: j.iv, data: j.data }), JSON.stringify({ ...j, version: 3 }), JSON.stringify({ ...j, expires: 'soon' }), '[]'])
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

// #3362: GitHub's answer is read with a running total and refused past its cap before it is parsed: a gist of many large
// files (its Silinx file whole and valid) is not read in full
test('#3362 a gist larger than a link\'s is refused before its JSON is parsed, its reading stopped', async () => {
  const { content, key } = await encryptDesign('design');
  const id = 'c'.repeat(32);
  const answer = Buffer.from(JSON.stringify({ id, files: { [GIST_FILE]: { filename: GIST_FILE, content, truncated: false }, 'big.txt': { filename: 'big.txt', content: 'x'.repeat(3 * GIST_ANSWER_MAX), truncated: false } } }));
  const chunk = 64 << 10, chunks = Math.ceil(answer.length / chunk);
  let pulled = 0, parsed = 0;
  const stream = () => new ReadableStream({ pull(c) { if (pulled * chunk >= answer.length) { c.close(); return; } c.enqueue(new Uint8Array(answer.subarray(pulled * chunk, ++pulled * chunk))); } }, { highWaterMark: 0 });
  const parse = JSON.parse;
  JSON.parse = (t, ...a) => { if (String(t).length > GIST_MAX) parsed++; return parse(t, ...a); };   // (the answer's parse, not another's)
  try {
    await rejects(loadGist({ id, key }, { fetch: async () => new Response(stream(), { status: 200 }) }), 'the link\'s gist is too large for a Silinx link', 413);
    assert.equal(parsed, 0, 'not parsed');
    assert.ok(pulled <= Math.ceil(GIST_ANSWER_MAX / chunk) + 2 && pulled < chunks, `${pulled} of ${chunks} chunks read`);
    // a Content-Length past the cap: refused before any read
    pulled = 0;
    await rejects(loadGist({ id, key }, { fetch: async () => new Response(stream(), { status: 200, headers: { 'content-length': String(answer.length) } }) }), 'the link\'s gist is too large for a Silinx link', 413);
    assert.equal(parsed, 0);
  } finally { JSON.parse = parse; }
  // within the cap: read and opened as before
  const small = Buffer.from(JSON.stringify({ id, files: { [GIST_FILE]: { filename: GIST_FILE, content, truncated: false } } }));
  assert.equal(await loadGist({ id, key }, { fetch: async () => new Response(small, { status: 200 }) }), 'design');
});

// #3629: a short link's expiry, kept beside the encrypted design and authenticated with it (AES-GCM's additional data),
// and in the gist's description; an expired link refused; #3223's links (version 1, no expiry) opened as before; making
// a short link deletes the user's expired Silinx gists, and no other
const DAY = 86400000, NOW = Date.parse('2026-11-12T10:00:00.000Z');
test('#3629 expiryDate: never, or so many days from now; a bad number refused', () => {
  assert.deepEqual(EXPIRY_DAYS, [0, 7, 30, 182, 365]);
  for (const d of [0, null, undefined]) assert.equal(expiryDate(d, NOW), null);
  assert.equal(expiryDate(7, NOW), '2026-11-19T10:00:00.000Z');
  assert.equal(expiryDate(3650, NOW), new Date(NOW + 3650 * DAY).toISOString());
  for (const d of [-1, 1.5, 3651, '7', NaN]) assert.throws(() => expiryDate(d, NOW), { message: 'expires_days: a whole number of days, 1 to 3650 (or 0: never)' }, String(d));
});

test('#3629 an expiring link: opened until its date, refused after it; its date tampered with, its key no longer opens it; #3223\'s links as before', async () => {
  const expires = expiryDate(7, NOW);
  const { content, key } = await encryptDesign('design', { expires });
  assert.equal(JSON.parse(content).version, 2);
  assert.equal(JSON.parse(content).expires, expires);
  assert.equal(await decryptDesign(content, key, { now: NOW }), 'design');
  assert.equal(await decryptDesign(content, key, { now: Date.parse(expires) - 1 }), 'design');
  await rejects(decryptDesign(content, key, { now: Date.parse(expires) }), 'the link expired on 2026-11-19 (its gist kept until its owner deletes it)', 410);
  // (its date moved on, or taken out: the key does not open it)
  const j = JSON.parse(content);
  for (const e of [expiryDate(365, NOW), null]) await rejects(decryptDesign(JSON.stringify({ ...j, expires: e }), key, { now: NOW }), 'the link\'s key does not open its gist (a wrong or cut link)', 422);
  // never: version 2, no date, opened any time
  const n = await encryptDesign('design');
  assert.equal(JSON.parse(n.content).expires, null);
  assert.equal(await decryptDesign(n.content, n.key, { now: NOW + 100 * 365 * DAY }), 'design');
  await rejects(encryptDesign('design', { expires: 'tomorrow' }), 'expires: a date');
  // #3223's version 1 (no additional data), made as it was then: opened
  const raw = crypto.getRandomValues(new Uint8Array(32)), iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt']);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode('old design')));
  const b64u = (b) => Buffer.from(b).toString('base64url');
  assert.equal(await decryptDesign(JSON.stringify({ format: GIST_FORMAT, version: 1, iv: b64u(iv), data: b64u(data) }), b64u(raw), { now: NOW }), 'old design');
});

test('#3629 saveGist with an expiry: its description says it; opened then refused; the user\'s expired Silinx gists deleted, no other', async () => {
  const gh = fakeGitHub();
  const client = githubClient({ fetch: gh.fetch, token: () => gh.token });
  const old = await saveGist(client, 'old', { days: 7, now: NOW - 30 * DAY });
  assert.equal(old.expires, '2026-10-20T10:00:00.000Z');
  assert.deepEqual(old.deleted, []);
  assert.equal(gh.gists.get(old.id).description, 'A Silinx project link (encrypted: only its link opens it; expires 2026-10-20T10:00:00.000Z)');
  await rejects(loadGist(old, { fetch: gh.fetch, now: NOW }), 'the link expired on 2026-10-20 (its gist kept until its owner deletes it)', 410);
  // (made before the first one expired: nothing deleted)
  const live = await saveGist(client, 'live', { days: 60, now: NOW - 30 * DAY });
  const never = await saveGist(client, 'never', { now: NOW - 30 * DAY });
  assert.deepEqual([live.deleted, never.deleted], [[], []]);
  assert.equal(gh.gists.get(never.id).description, 'A Silinx project link (encrypted: only its link opens it)');
  assert.equal(await loadGist(live, { fetch: gh.fetch, now: NOW }), 'live');
  // gists that are not Silinx's, or not only its file, or another's: kept, whatever their description says
  const desc = gh.gists.get(old.id).description, file = gh.gists.get(old.id).files[GIST_FILE];
  const put = (id, g) => gh.gists.set(id, { public: false, owner: 'student', description: desc, files: { [GIST_FILE]: file }, ...g });
  put('d'.repeat(32), { files: { [GIST_FILE]: file, 'notes.md': { filename: 'notes.md', content: 'mine' } } });
  put('e'.repeat(32), { files: { 'notes.md': { filename: 'notes.md', content: 'mine' } } });
  put('f'.repeat(32), { description: 'My notes; expires 2026-10-20T10:00:00.000Z)' });
  put('a'.repeat(32), { owner: 'someone' });
  put('c'.repeat(32), { public: true });
  const before = new Set(gh.gists.keys());
  const made = await saveGist(client, 'new', { days: 7, now: NOW });
  assert.deepEqual(made.deleted, [old.id]);
  assert.deepEqual([...before].filter((id) => !gh.gists.has(id)), [old.id]);
  assert.ok(gh.gists.has(made.id) && gh.gists.has(live.id) && gh.gists.has(never.id));
  // the cleaning failing (GitHub refusing the list): the new link made all the same
  const refusing = githubClient({ fetch: async (u, o) => (o.method === 'GET' && /\/gists\?/.test(u) ? new Response('{"message":"nope"}', { status: 500 }) : gh.fetch(u, o)), token: () => gh.token });
  const g2 = await saveGist(refusing, 'still', { days: 7, now: NOW });
  assert.deepEqual(g2.deleted, []);
  assert.equal(await loadGist(g2, { fetch: gh.fetch, now: NOW }), 'still');
  await rejects(saveGist(client, 'x', { days: 4000, now: NOW }), 'expires_days: a whole number of days, 1 to 3650 (or 0: never)');
});

test('#3629 deleteExpiredGists: every page read before any deletion (250 expired gists, all deleted), the newest kept', async () => {
  const gh = fakeGitHub();
  const client = githubClient({ fetch: gh.fetch, token: () => gh.token });
  const first = await saveGist(client, 'x', { days: 1, now: NOW - 10 * DAY });
  const g = gh.gists.get(first.id);
  for (let i = 0; i < 249; i++) gh.gists.set(i.toString(16).padStart(32, '0'), { ...g });
  const kept = await saveGist(client, 'y', { days: 1, now: NOW - 10 * DAY });
  assert.equal(gh.gists.size, 251);
  assert.equal((await deleteExpiredGists(client, { now: NOW, keep: kept.id })).length, 250);
  assert.deepEqual([...gh.gists.keys()], [kept.id]);
});
