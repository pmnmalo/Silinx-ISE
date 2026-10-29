// UI (#1444): Help ▸ Check for Updates… with GitHub's answer stubbed: the release's page and its assets are linked
// only when their URLs are GitHub's (https://github.com, api.github.com, objects.githubusercontent.com); a
// javascript: or an http: URL in the release object (or in the answer kept in localStorage) shows its name as text.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, chromeOnly } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const RELEASE = {
  tag_name: 'v99.0.0', name: 'v99.0.0', html_url: 'javascript:alert(1)', published_at: '2026-10-26T00:00:00Z',
  assets: [
    { name: 'silinx-ise-99.0.0.zip', browser_download_url: 'https://github.com/pmnmalo/Silinx-ISE/releases/download/v99.0.0/silinx-ise-99.0.0.zip', size: 4096 },
    { name: 'Silinx-ISE.html', browser_download_url: 'http://evil.test/Silinx-ISE.html', size: 2048 },
    { name: 'notes.txt', browser_download_url: 'data:text/html,<b>x</b>', size: 10 },
  ],
};

uiTest('#1444 Check for Updates: anchors only to GitHub\'s URLs; a javascript: page or an http: download shown as text', E, async (page) => {
  const stub = `(() => { const orig = window.fetch; window.fetch = (u, o) => String(u).includes('raw.githubusercontent.com') ? Promise.resolve(new Response('', { status: 404 }))
    : String(u).includes('api.github.com') ? Promise.resolve(new Response(${JSON.stringify(JSON.stringify(RELEASE))}, { status: 200, headers: { 'content-type': 'application/json' } }))
    : orig(u, o); })();`;
  const s1 = await page.send('Page.addScriptToEvaluateOnNewDocument', { source: stub });
  try {
    await page.eval(() => localStorage.removeItem('silinx.updateCheck'));
    await page.reload();
    await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item'), [], { what: 'app boot' });
    await page.menu('Help', 'Check for Updates…');
    await page.waitDialog('Check for Updates');
    await page.waitFor(() => /A new version is available: Silinx ISE 99\.0\.0/.test([...document.querySelectorAll('.dlg-overlay')].pop()?.innerText || ''), [], { what: 'update dialog text' });
    const out = await page.eval(() => {
      const dlg = [...document.querySelectorAll('.dlg-overlay')].pop();
      return {
        anchors: [...dlg.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]),
        items: [...dlg.querySelectorAll('li')].map((li) => li.textContent),
        text: dlg.innerText,
      };
    });
    // the one GitHub download is a link; the page (javascript:), the http: and the data: downloads are text
    assert.deepEqual(out.anchors, [['silinx-ise-99.0.0.zip', 'https://github.com/pmnmalo/Silinx-ISE/releases/download/v99.0.0/silinx-ise-99.0.0.zip']]);
    assert.deepEqual(out.items, ['silinx-ise-99.0.0.zip (4 KB)', 'Silinx-ISE.html (2 KB)', 'notes.txt (1 KB)']);
    assert.match(out.text, /Release notes and downloads: v99\.0\.0/);
    assert.doesNotMatch(out.text, /javascript:|evil\.test/);
    await page.dialogButton('OK');
    await page.waitNoDialog();
  } finally {
    await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: s1.identifier });
  }
}, { skip: chromeOnly });   // (Page.addScriptToEvaluateOnNewDocument)

uiTest('#2013 Check for Updates: Refresh checks again (GitHub asked anew), the dialog shown with its answer; Portuguese', E, async (page) => {
  const stub = `(() => { window.__asked = 0; const orig = window.fetch; window.fetch = (u, o) => String(u).includes('raw.githubusercontent.com') ? Promise.resolve(new Response('', { status: 404 }))
    : String(u).includes('api.github.com') ? (window.__asked++, Promise.resolve(new Response(${JSON.stringify(JSON.stringify({ ...RELEASE, html_url: 'https://github.com/pmnmalo/Silinx-ISE/releases/tag/v99.0.0' }))}, { status: 200, headers: { 'content-type': 'application/json' } })))
    : orig(u, o); })();`;
  const s1 = await page.send('Page.addScriptToEvaluateOnNewDocument', { source: stub });
  try {
    await page.eval(() => localStorage.removeItem('silinx.updateCheck'));
    await page.reload();
    await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item'), [], { what: 'app boot' });
    await page.menu('Help', 'Check for Updates…');
    await page.waitDialog('Check for Updates');
    await page.waitFor(() => /99\.0\.0/.test([...document.querySelectorAll('.dlg-overlay')].pop()?.innerText || ''), [], { what: 'the answer' });
    const n0 = await page.eval(() => window.__asked);
    assert.deepEqual(await page.eval(() => [...[...document.querySelectorAll('.dlg-overlay')].pop().querySelectorAll('.dlg-buttons button')].map((b) => b.textContent)), ['Refresh', 'OK']);
    await page.dialogButton('Refresh');
    await page.waitFor((n) => window.__asked > n, [n0], { what: 'GitHub asked again' });
    await page.waitDialog('Check for Updates');
    await page.waitFor(() => /99\.0\.0/.test([...document.querySelectorAll('.dlg-overlay')].pop()?.innerText || ''), [], { what: 'the new answer' });
    assert.equal(await page.eval(() => document.querySelectorAll('.dlg-overlay').length), 1, 'one dialog');
    // in Portuguese: Atualizar
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    await page.waitFor(() => [...[...document.querySelectorAll('.dlg-overlay')].pop().querySelectorAll('.dlg-buttons button')].some((b) => b.textContent === 'Atualizar'), [], { what: 'Atualizar' });
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
    await page.dialogButton('OK');
    await page.waitNoDialog();
  } finally {
    await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: s1.identifier });
  }
}, { skip: chromeOnly });
