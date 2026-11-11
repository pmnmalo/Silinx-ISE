// The page a launcher opens (#3409): the address with its one-time code (…/#code=…, #2955) is not given to the opener
// (open, xdg-open, cmd /c start), whose arguments every user of the computer reads (ps), but written into a page of
// the configuration folder readable by its owner only (0600), which sends the browser on to it; the opener is given
// that page's path. The page is deleted once its code has expired (the code's minute), or by the next launch.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { configDir } from './toolchain.js';

export const PAGE_TTL = 60_000;   // (the one-time code's, server/open-code.js)
const PAGE = /^open-[A-Za-z0-9_-]+\.html$/;

/** The page's text: the browser sent on to `url` at once (an attribute and a script string, escaped). */
export function redirectPage(url) {
  const attr = String(url).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<!doctype html>\n<meta charset="utf-8">\n<meta name="referrer" content="no-referrer">\n<title>Silinx</title>\n`
    + `<meta http-equiv="refresh" content="0;url=${attr}">\n<script>location.replace(${JSON.stringify(String(url)).replace(/</g, '\\u003c')});</script>\n`
    + `<p><a href="${attr}">Open Silinx</a></p>\n`;
}

/** What the opener is given for `url`: the url itself when it carries no code nor token, else the path of a page of
 *  `dir` (0600) that redirects to it; the folder's earlier pages, past their minute, deleted first. */
export function launchTarget(url, { dir = configDir(), now = Date.now, ttl = PAGE_TTL } = {}) {
  if (!/#(code|token)=/.test(String(url))) return url;
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  sweepPages(dir, now() - ttl);
  const file = path.join(dir, `open-${crypto.randomBytes(12).toString('base64url')}.html`);
  fs.writeFileSync(file, redirectPage(url), { mode: 0o600, flag: 'wx' });
  // (gone once the code has expired, while this process lives; else by the next launch's sweep)
  setTimeout(() => fs.rmSync(file, { force: true }), ttl).unref();
  return file;
}

/** The launcher's pages of `dir` older than `before` (ms), deleted. */
export function sweepPages(dir, before) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return; }
  for (const n of names) {
    if (!PAGE.test(n)) continue;
    const f = path.join(dir, n);
    try { if (fs.lstatSync(f).mtimeMs < before) fs.rmSync(f, { force: true }); } catch { /* gone */ }
  }
}
