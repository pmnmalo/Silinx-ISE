// UI: the static editions in another page's frame (#3041). Their <meta> policy cannot carry frame-ancestors (the local
// server's header refuses a frame, test/server-hardening.test.js), so web/index.html's first script stops the app in a
// frame: no app (its buttons cannot be put under another page's content), a notice with a link that opens it in a tab
// of its own, in the language of the interface's preference (English, Portuguese). The site (test/ui/site-lib.js) as
// GitHub Pages serves it, framed by a page of its own; not framed, it starts as always.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupUi, uiTest } from './harness.js';
import { buildSite } from './site-lib.js';

let env, site;
before(async () => {
  env = await setupUi({ server: false });
  if (env.skip) return;
  site = await buildSite(env.tmp);
  if (site.skip) return;
  await fs.writeFile(path.join(site.site, 'framer.html'), '<!doctype html><title>Framer</title><iframe src="index.html#open=example:gates&view=try" style="width: 800px; height: 400px"></iframe>\n');
});
after(async () => { site?.close?.(); await env?.teardown?.(); });
const E = () => (site?.skip ? { skip: site.skip } : env);

// the frame's notice, once its first script ran: { text, href, target, rel, lang, app (anything of the app's) }
const notice = (page) => page.waitFor(() => {
  const f = document.querySelector('iframe'), doc = f?.contentDocument, b = doc?.querySelector('body.framed-notice');
  if (!b) return null;
  const a = b.querySelector('a');
  return { text: b.querySelector('p').textContent, link: a.textContent, href: a.href, target: a.target, rel: a.rel, lang: doc.documentElement.lang,
    app: [!!doc.getElementById('app'), !!doc.querySelector('script[type=module]'), !!f.contentWindow.SilinxApp, f.contentWindow.location.hash] };
}, [], { what: 'the framed notice', timeout: 30000 });

uiTest('#3041 the site in another page\'s frame: the app does not start, a notice with a link to open it in a tab of its own (English, Portuguese); not framed, it starts', E, async (page) => {
  await page.goto(`${site.url}framer.html`);
  const href = `${site.url}index.html#open=example:gates&view=try`;
  const app = [false, false, false, '#open=example:gates&view=try'];
  assert.deepEqual(await notice(page), { text: 'Silinx ISE does not open inside another site\'s page.', link: 'Open Silinx ISE in a tab of its own', href, target: '_blank', rel: 'noopener noreferrer', lang: 'en', app });
  // the language of the interface's preference (web/js/i18n.js's, not loaded yet)
  await page.eval(() => localStorage.setItem('silinx.lang', 'pt'));
  await page.goto(`${site.url}framer.html`);
  assert.deepEqual(await notice(page), { text: 'O Silinx ISE não abre dentro da página de outro site.', link: 'Abrir o Silinx ISE num separador próprio', href, target: '_blank', rel: 'noopener noreferrer', lang: 'pt', app });
  // nothing of the link opened (no project made)
  assert.deepEqual(await page.eval(() => Object.keys(localStorage).filter((k) => /gates/.test(k + localStorage.getItem(k)))), []);
  await page.eval(() => localStorage.removeItem('silinx.lang'));
  // not framed: the app starts
  await page.goto(`${site.url}index.html`);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot', timeout: 60000 });
  assert.equal(await page.eval(() => document.querySelector('.framed-notice')), null);
}, { url: () => 'about:blank', timeout: 180000 });
