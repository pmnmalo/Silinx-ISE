// A short link through a GitHub gist (#3223): Copy Link's other form, `#gist=<id>.<key>`, about 60 characters where the
// whole project inside the link (#2826, core/design-link.js) is thousands. The design (encodeDesign's text, its limits)
// is encrypted here, in the browser or the MCP server (AES-GCM, a random 256-bit key, a random 96-bit IV), and saved as a
// secret gist of the user's own account (GitHub's API, the user's sign-in: #3196); the key is in the link's fragment,
// which a browser never sends, so GitHub keeps only what it cannot read. Opening the link needs no sign-in: the gist is
// read through GitHub's API (api.github.com, CORS-enabled), checked to be Silinx's, decrypted, and the design opened as
// a design link's (decodeDesign: the same import gate and limits). The user's links are their gists, which they list
// and delete on GitHub. Isomorphic (Web Crypto).
import { LINK_LIMITS, parseGistRef } from './design-link.js';

export { parseGistRef };

export const GIST_FILE = 'silinx-link.json';
export const GIST_FORMAT = 'silinx-link';
const DESCRIPTION = 'A Silinx project link (encrypted: only its link opens it)';
const ID_RE = /^[0-9a-f]{20,40}$/;
// the most a gist's content may be (the encrypted design: its base64 of LINK_LIMITS.maxEncoded and the AES tag)
export const GIST_MAX = Math.ceil((LINK_LIMITS.maxEncoded + 16) * 4 / 3) + 256;
// the most GitHub's answer for a link's gist may be (bytes): its file, escaped in JSON, and the gist's description, owner
// and history (#3362: read with a running total, before it is parsed)
export const GIST_ANSWER_MAX = 2 * GIST_MAX + (64 << 10);

const fail = (msg, status = 400) => Object.assign(new Error(msg), { linkError: true, status });
const b64u = bytes => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64u = s => { const t = atob(String(s).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(t, c => c.charCodeAt(0)); };
const subtle = () => globalThis.crypto.subtle;
const aesKey = (raw, use) => subtle().importKey('raw', raw, { name: 'AES-GCM' }, false, [use]);

/** A design encrypted: { content (the gist's file: JSON), key (base64url, 32 bytes) }. */
export async function encryptDesign(design) {
  const text = String(design ?? '');
  if (!text) throw fail('nothing to put in the link');
  if (text.length > LINK_LIMITS.maxEncoded) throw fail(`the project is too large for a link (${text.length} characters, at most ${LINK_LIMITS.maxEncoded})`);
  const raw = globalThis.crypto.getRandomValues(new Uint8Array(32)), iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, await aesKey(raw, 'encrypt'), new TextEncoder().encode(text)));
  return { content: `${JSON.stringify({ format: GIST_FORMAT, version: 1, iv: b64u(iv), data: b64u(data) })}\n`, key: b64u(raw) };
}

/** A gist's content decrypted with the link's key -> the design (encodeDesign's text); or an Error saying why. */
export async function decryptDesign(content, key) {
  if (typeof content !== 'string' || content.length > GIST_MAX) throw fail('the link\'s gist is too large for a Silinx link');
  let j;
  try { j = JSON.parse(content); } catch { j = null; }
  if (!j || j.format !== GIST_FORMAT || j.version !== 1 || typeof j.iv !== 'string' || typeof j.data !== 'string') throw fail('the link\'s gist is not a Silinx link', 422);
  let text;
  try {
    const iv = unb64u(j.iv), raw = unb64u(key);
    if (iv.length !== 12 || raw.length !== 32) throw new Error('size');
    text = new TextDecoder('utf-8', { fatal: true }).decode(await subtle().decrypt({ name: 'AES-GCM', iv }, await aesKey(raw, 'decrypt'), unb64u(j.data)));
  } catch { throw fail('the link\'s key does not open its gist (a wrong or cut link)', 422); }
  if (text.length > LINK_LIMITS.maxEncoded) throw fail('the link\'s design is too large', 413);
  return text;
}

/** The design saved as a secret gist of the signed-in user (client: core/github-api.js githubClient) -> { id, key, url }. */
export async function saveGist(client, design) {
  const { content, key } = await encryptDesign(design);
  const g = await client.request('POST', '/gists', { description: DESCRIPTION, public: false, files: { [GIST_FILE]: { content } } });
  if (!ID_RE.test(String(g?.id || ''))) throw fail('GitHub did not make the gist', 502);
  return { id: g.id, key, url: g.html_url || null };
}

// a response's text, read with a running total: no more than `max` bytes, whatever the site says it sends (a gist of
// many large files refused before it is parsed, #3362)
async function readCapped(r, max) {
  const big = () => fail('the link\'s gist is too large for a Silinx link', 413);
  if (Number(r.headers?.get?.('content-length')) > max) { r.body?.cancel?.().catch(() => {}); throw big(); }
  if (!r.body?.getReader) { const t = await r.text(); if (t.length > max) throw big(); return t; }
  const reader = r.body.getReader(), parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if ((n += value.length) > max) { reader.cancel().catch(() => {}); throw big(); }
    parts.push(value);
  }
  const bytes = new Uint8Array(n);
  let at = 0;
  for (const p of parts) { bytes.set(p, at); at += p.length; }
  return new TextDecoder().decode(bytes);
}

/** The design of a short link's gist, read through GitHub's API with no sign-in (fetch: the page's, credentials omitted). */
export async function loadGist({ id, key }, { fetch: f = globalThis.fetch, api = 'https://api.github.com' } = {}) {
  let r;
  try { r = await f(`${api}/gists/${id}`, { headers: { Accept: 'application/vnd.github+json' }, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' }); }
  catch { throw fail('GitHub could not be reached to open the link\'s gist', 503); }
  if (r.status === 404) throw fail('the link\'s gist is not on GitHub (deleted, or the link is cut)', 404);
  if (!r.ok) throw fail(`GitHub refused the link's gist (${r.status})`, 502);
  let g;
  try { g = JSON.parse(await readCapped(r, GIST_ANSWER_MAX)); } catch (e) { throw e.linkError ? e : fail('the link\'s gist is not a Silinx link', 422); }
  const file = g?.files?.[GIST_FILE];
  if (!file || typeof file.content !== 'string') throw fail('the link\'s gist is not a Silinx link', 422);
  if (file.truncated) throw fail('the link\'s gist is too large for a Silinx link', 413);
  return decryptDesign(file.content, key);
}
