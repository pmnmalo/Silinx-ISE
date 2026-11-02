#!/usr/bin/env node
// The published site's usage counts: GoatCounter (goatcounter.com: no cookies, no personal data) added
// to the pages of the site built by scripts/build-standalone.mjs --site (the stable root, dev/), by
// .github/workflows/pages.yml when the repository variable GOATCOUNTER_CODE is set:
//   node scripts/site-analytics.mjs <site folder> <GoatCounter code>
// Only index.html (the page opened on the site): Silinx-ISE.html, the file people download and open
// from their disk, never counts. The counter runs only on the published host (*.github.io).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addSources, metaCsp, scriptHash, withMetaCsp } from '../server/csp.js';

const MARK = 'silinx-site-analytics';
// GoatCounter's versioned script, which never changes, with its published subresource integrity hash (#1439): the
// browser runs it only when its bytes are those hashed; the unversioned count.js updates itself, and could not be
// pinned. To move to a newer version: the URL and the sha384 are listed at goatcounter.com/help/countjs-versions;
// check the hash against the script itself first: curl -sL <url> | openssl dgst -sha384 -binary | base64
export const COUNT_JS = 'https://gc.zgo.at/count.v5.js';
export const COUNT_JS_INTEGRITY = 'sha384-atnOLvQb9t+jTSipvd75X2yginT4PjVbqDdlJAmxMm+wYElFmeR6EmLP5bYeoRVQ';

/** The page with the counter's loader (once: a page that has it is returned unchanged). */
export function addAnalytics(html, code) {
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(code || '')) throw new Error(`not a GoatCounter code: '${code}'`);
  // (the loader's tag itself: the application's code, bundled into the page, names its id too, #257)
  if (html.includes(`<script id="${MARK}">`)) return html;
  // (crossorigin anonymous: an integrity check needs a CORS response, which gc.zgo.at gives)
  const loader = `<script id="${MARK}">
/* usage counts of the published site: GoatCounter, no cookies, no personal data (web/js/analytics.js); its title fixed and
   no referrer: the page's title names the project, the referrer may name a course */
if (/\\.github\\.io$/.test(location.hostname)) { var s = document.createElement('script'); s.async = true; s.src = '${COUNT_JS}'; s.integrity = '${COUNT_JS_INTEGRITY}'; s.crossOrigin = 'anonymous'; s.dataset.goatcounter = 'https://${code}.goatcounter.com/count'; s.dataset.goatcounterSettings = '{"title":"Silinx ISE","referrer":""}'; document.head.appendChild(s); }
</script>
`;
  const i = html.lastIndexOf('</body>');
  if (i < 0) throw new Error('no </body> in the page');
  let out = html.slice(0, i) + loader + html.slice(i);
  // the page's Content-Security-Policy (#487) allows the loader (its hash), the counter's script (that one URL, not
  // its host) and its
  // counts (sent to <code>.goatcounter.com as an image or a beacon)
  const csp = metaCsp(out);
  if (csp) {
    const text = loader.slice(loader.indexOf('>') + 1, loader.lastIndexOf('</script>'));
    const counts = `https://${code}.goatcounter.com`;
    out = withMetaCsp(out, addSources(addSources(addSources(csp, 'script-src', [scriptHash(text), COUNT_JS]), 'connect-src', [counts]), 'img-src', [counts]));
  }
  return out;
}

/** Every index.html of the site (the root and dev/): the paths changed. */
export function addAnalyticsToSite(site, code) {
  const out = [];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory() && e.name !== 'assets') walk(f);
      else if (e.name === 'index.html') { fs.writeFileSync(f, addAnalytics(fs.readFileSync(f, 'utf8'), code)); out.push(path.relative(site, f).split(path.sep).join('/')); }
    }
  };
  walk(site);
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [site, code] = process.argv.slice(2);
  if (!site || !code) { console.error('usage: node scripts/site-analytics.mjs <site folder> <GoatCounter code>'); process.exit(2); }
  for (const f of addAnalyticsToSite(path.resolve(site), code)) console.log(`usage counts (GoatCounter ${code}): ${f}`);
}
