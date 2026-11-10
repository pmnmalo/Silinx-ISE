// The server's token kept off command lines (#2955): the browser a launcher opens is given a one-time code
// (…/#code=…), which the page exchanges for the token (POST /api/token); a second launch checks that the
// server on its port holds the token of its file without sending it (GET /api/proof?nonce=…).
import crypto from 'node:crypto';

/** One-time codes: each redeemed once, within `ttl` ms of being issued. */
export function createOpenCodes({ ttl = 60_000, now = Date.now, max = 32 } = {}) {
  const codes = new Map();   // code -> expiry
  const sweep = () => { for (const [c, exp] of codes) if (exp <= now()) codes.delete(c); };
  return {
    issue() {
      sweep();
      // a few at most (a launcher opens one tab): the oldest goes first
      while (codes.size >= max) codes.delete(codes.keys().next().value);
      const code = crypto.randomBytes(18).toString('base64url');
      codes.set(code, now() + ttl);
      return code;
    },
    /** true once for a code issued and not expired; the code is gone afterwards. */
    redeem(code) {
      if (typeof code !== 'string' || !codes.has(code)) return false;
      const exp = codes.get(code);
      codes.delete(code);
      return exp > now();
    },
  };
}

/** The proof that a server holds `token`, for a launcher's `nonce`: an HMAC, from which the token cannot be read. */
export const tokenProof = (token, nonce) => crypto.createHmac('sha256', token).update(`silinx-proof:${nonce}`).digest('base64url');

/** Whether the server at `url` holds `token`: it answers the proof of a random nonce (the token never sent). */
export async function holdsToken(url, token, { fetch: f = fetch } = {}) {
  if (!token) return false;
  const nonce = crypto.randomBytes(18).toString('base64url');
  try {
    const r = await f(`${url}/api/proof?nonce=${nonce}`);
    if (!r.ok) return false;
    const { proof } = await r.json();
    const want = tokenProof(token, nonce);
    return typeof proof === 'string' && proof.length === want.length && crypto.timingSafeEqual(Buffer.from(proof), Buffer.from(want));
  } catch { return false; }
}

/** The URL a second launch opens: the server's, with the code it gave when that code is one `issue()` makes
 *  (base64url, as long as its 18 bytes), else the server's alone: an answer of any other form never reaches the
 *  command line that opens the browser (`cmd /c start` reads `&` and `|`, #3014). */
export const openCodeUrl = (url, code) => (typeof code === 'string' && /^[A-Za-z0-9_-]{24}$/.test(code) ? `${url}/#code=${code}` : url);
