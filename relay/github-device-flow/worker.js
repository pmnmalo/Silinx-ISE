// Silinx's GitHub sign-in relay (#3196): a Cloudflare Worker that lets the browser edition (GitHub Pages) run OAuth's
// device flow, whose two endpoints on github.com send no CORS headers, so a page cannot call them. It forwards only
// those two POSTs, with only their own fields, and answers only Silinx's origins. It keeps nothing and logs nothing: no
// storage, no console, no analytics. The token GitHub gives passes through it once, to the page that asked. The
// maintainer deploys it (README.md); its URL is the setting GITHUB_DEVICE_RELAY of web/js/github-app.js.
//
// Copyright 2026 Pedro Maló. AGPL-3.0-only (the repository's LICENSE).

/** The origins that may use the relay (the Pages site; ALLOWED_ORIGINS, comma-separated, replaces them). */
export const ORIGINS = ['https://pmnmalo.github.io'];
const ROUTES = {
  '/login/device/code': { to: 'https://github.com/login/device/code', fields: ['client_id', 'scope'] },
  '/login/oauth/access_token': { to: 'https://github.com/login/oauth/access_token', fields: ['client_id', 'device_code', 'grant_type'] },
};
const MAX_BODY = 4096;

const origins = env => (env?.ALLOWED_ORIGINS ? String(env.ALLOWED_ORIGINS).split(',').map(s => s.trim()).filter(Boolean) : ORIGINS);
const cors = origin => ({ 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Cache-Control': 'no-store' });
const answer = (status, body, headers = {}) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });

export default {
  async fetch(request, env, _ctx, fetcher = fetch) {
    const url = new URL(request.url);
    const route = ROUTES[url.pathname];
    const origin = request.headers.get('Origin') || '';
    if (!route) return answer(404, { error: 'not_found' });
    if (!origins(env).includes(origin)) return answer(403, { error: 'origin_not_allowed' });
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors(origin), 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type, Accept', 'Access-Control-Max-Age': '600' } });
    }
    if (request.method !== 'POST') return answer(405, { error: 'method_not_allowed' }, { ...cors(origin), Allow: 'POST, OPTIONS' });
    const text = await request.text();
    if (text.length > MAX_BODY) return answer(413, { error: 'too_large' }, cors(origin));
    // (only the endpoint's own fields; the client ID Silinx's when CLIENT_ID is set)
    const given = new URLSearchParams(text), body = new URLSearchParams();
    for (const f of route.fields) if (given.has(f)) body.set(f, given.get(f));
    if (env?.CLIENT_ID && body.get('client_id') !== env.CLIENT_ID) return answer(403, { error: 'client_not_allowed' }, cors(origin));
    let r;
    try {
      r = await fetcher(route.to, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'silinx-device-flow-relay' }, body: body.toString() });
    } catch { return answer(502, { error: 'github_unreachable' }, cors(origin)); }
    let j;
    try { j = await r.json(); } catch { return answer(502, { error: 'github_bad_answer' }, cors(origin)); }
    return answer(r.status, j, cors(origin));
  },
};
