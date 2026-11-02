// The published site's usage counts (scripts/site-analytics.mjs, web/js/analytics.js): GoatCounter's
// loader added once to the site's pages (the root and dev/), never to the downloaded file, counting
// only on the published host; the events counted once a page load, nothing without the counter.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addAnalytics, addAnalyticsToSite, COUNT_JS, COUNT_JS_INTEGRITY } from '../scripts/site-analytics.mjs';
import { countEvent, EVENTS } from '../web/js/analytics.js';

const PAGE = '<!doctype html><html><head></head><body><div id="app"></div><script>/* </body> in a string */</script></body></html>';

// #1439: the counter's script pinned: GoatCounter's versioned file (never changes) with its subresource integrity
// hash, so that a changed script does not run; crossorigin for the check
test('#1439 the loader creates the script with the versioned count.v<n>.js, its integrity hash and crossorigin anonymous', () => {
  assert.match(COUNT_JS, /^https:\/\/gc\.zgo\.at\/count\.v\d+\.js$/, 'versioned, never count.js');
  assert.match(COUNT_JS_INTEGRITY, /^sha384-[A-Za-z0-9+/]{64}$/, 'a sha384 as goatcounter.com publishes it');
  const out = addAnalytics(PAGE, 'silinx');
  const loader = /<script id="silinx-site-analytics">([\s\S]*?)<\/script>/.exec(out)[1];
  assert.ok(loader.includes(`s.src = '${COUNT_JS}';`), loader);
  assert.ok(loader.includes(`s.integrity = '${COUNT_JS_INTEGRITY}';`), loader);
  assert.ok(loader.includes("s.crossOrigin = 'anonymous';"), loader);
  assert.doesNotMatch(loader, /count\.js'/, 'the unversioned script is gone');
});

test('addAnalytics: GoatCounter\'s loader before the last </body>, once; only on *.github.io; a code is checked', () => {
  const out = addAnalytics(PAGE, 'silinx');
  assert.match(out, /<script id="silinx-site-analytics">[\s\S]*https:\/\/silinx\.goatcounter\.com\/count[\s\S]*<\/script>\n<\/body><\/html>$/);
  assert.match(out, /if \(\/\\\.github\\\.io\$\/\.test\(location\.hostname\)\)/);
  assert.equal(addAnalytics(out, 'silinx'), out, 'once');
  assert.ok(out.includes(`s.dataset.goatcounterSettings = '{"title":"Silinx ISE","referrer":""}'`), 'the title fixed, no referrer: a project\'s name is never counted (#2551)');
  for (const bad of ['', 'Silinx', 'a.b', 'x"><script>', '-x']) assert.throws(() => addAnalytics(PAGE, bad), /not a GoatCounter code/);
  assert.throws(() => addAnalytics('<html></html>', 'silinx'), /no <\/body>/);
});

// Regression (#257): the application's code, bundled into the page, names the loader's id (Help ▸ About's
// 'Usage counts' row, web/js/analytics.js): the page has no loader yet, so it gets one (it got none,
// and nothing was counted from 13 October)
test('addAnalytics: a page whose code names the loader\'s id (the application\'s own) still gets the loader (#257)', () => {
  const app = fs.readFileSync(new URL('../web/js/analytics.js', import.meta.url), 'utf8');
  assert.ok(app.includes('silinx-site-analytics'), 'web/js/analytics.js looks the loader up by its id');
  const page = PAGE.replace('<div id="app"></div>', `<div id="app"></div><script type="module">${app}</script>`);
  const out = addAnalytics(page, 'silinx');
  assert.equal(out.split('<script id="silinx-site-analytics">').length, 2, 'the loader, once');
  assert.match(out, /https:\/\/silinx\.goatcounter\.com\/count/);
  assert.equal(addAnalytics(out, 'silinx'), out, 'once');
});

test('addAnalyticsToSite: index.html of the root and of dev/, not the downloaded Silinx-ISE.html nor the assets', () => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-site-'));
  try {
    for (const f of ['index.html', 'Silinx-ISE.html', 'dev/index.html', 'dev/Silinx-ISE.html', 'assets/x/index.html']) {
      fs.mkdirSync(path.dirname(path.join(site, f)), { recursive: true });
      fs.writeFileSync(path.join(site, f), PAGE);
    }
    assert.deepEqual(addAnalyticsToSite(site, 'silinx').sort(), ['dev/index.html', 'index.html']);
    const has = f => fs.readFileSync(path.join(site, f), 'utf8').includes('goatcounter');
    assert.deepEqual(['index.html', 'dev/index.html', 'Silinx-ISE.html', 'dev/Silinx-ISE.html', 'assets/x/index.html'].map(has), [true, true, false, false, false]);
  } finally { fs.rmSync(site, { recursive: true, force: true }); }
});

test('countEvent: nothing without the counter; a known event once a page load, with its title; never an unknown one', () => {
  delete globalThis.goatcounter;
  assert.doesNotThrow(() => countEvent('simulate'));
  const sent = [];
  globalThis.goatcounter = { count: e => sent.push(e) };
  try {
    countEvent('simulate'); countEvent('simulate'); countEvent('bitstream'); countEvent('src/top.vhd');
    assert.deepEqual(sent, [
      { path: 'event/simulate', title: EVENTS.simulate, event: true },
      { path: 'event/bitstream', title: 'Bitstream generated', event: true },
    ]);
    globalThis.goatcounter = { count: () => { throw new Error('blocked'); } };
    assert.doesNotThrow(() => countEvent('program'));
  } finally { delete globalThis.goatcounter; }
});

test('About\'s usage counts in Portuguese (web/js/i18n.js)', async () => {
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (k === 'silinx.lang' ? 'pt' : null), setItem() {}, removeItem() {} }, configurable: true, writable: true });
  const { t } = await import('../web/js/i18n.js');
  for (const [en, pt] of [['Usage counts:', 'Contagem de utilização:'], ['None: this copy sends nothing.', 'Nenhuma: esta cópia não envia nada.'],
    ['Only the site (pmnmalo.github.io/Silinx-ISE) counts its visits, with', 'Só o site (pmnmalo.github.io/Silinx-ISE) conta as visitas, com o'],
    ['(no cookies, no personal data).', '(sem cookies nem dados pessoais).'], ['Using Silinx in a course?', 'Usa o Silinx numa disciplina?'],
    ['This page counts its visits and what is used (a new project, a simulation, a bitstream…) with', 'Esta página conta as visitas e o que é usado (um projeto novo, uma simulação, um bitstream…) com o'],
    [': no cookies, no personal data, never the content of a project.', ': sem cookies, sem dados pessoais, nunca o conteúdo de um projeto.']]) assert.equal(t(en), pt);
});

test('siteCounts: only where the site\'s counter is (never the application or the downloaded file)', async () => {
  const { siteCounts } = await import('../web/js/analytics.js');
  delete globalThis.goatcounter;
  assert.equal(siteCounts(), false);
  globalThis.goatcounter = { count() {} };
  assert.equal(siteCounts(), true);
  delete globalThis.goatcounter;
});
