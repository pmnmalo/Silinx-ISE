// UI: Copy Link's short link (#3223, web/js/link-copy.js, core/gist-link.js) in the server editions, against a stand-in
// for GitHub on the server's own origin (test/ui/serve.js SILINX_UI_GITHUB; the server's gist made with its GH_TOKEN,
// the stand-in's): the full link or the short one chosen; the short one made on Copy Link (#gist=<id>.<key>, a secret
// gist, the design not readable in it); opened again (the project back, its files the same); a wrong key and a deleted
// gist, each an ERROR in the console, the workspace as it was; the dialog in Portuguese. Both interfaces; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, readWs } from './harness.js';

let env;
const TOKEN = 'gho_faketokenofthetests0123456789';   // (test/fake-github.mjs's)
before(async () => {
  Object.assign(process.env, { SILINX_UI_GITHUB: '1', GH_TOKEN: TOKEN });
  env = await setupUi();
});
after(async () => { await env?.teardown?.(); delete process.env.SILINX_UI_GITHUB; delete process.env.GH_TOKEN; });
const E = () => env;
const warnings = (page) => page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text);
const fakeApi = (page) => page.eval(() => { window.SILINX_GITHUB = { api: `${location.origin}/fake-github` }; });
// Copy Link run as its menu runs it: its result (the link copied) kept for the test
const startCopy = (page) => page.eval(() => { window.__copied = import('/js/link-copy.js').then((m) => m.copyLinkDialog()); });
const copied = (page) => page.eval(() => window.__copied);
const open = (page, hash) => page.eval(async (h) => { const m = await import('/js/link-open.js'); return m.openFromLink(m.linkOptions(h)); }, hash);

uiTest('#3223 Copy Link: the full link or a short one (a secret gist); the short link opened again; a wrong key, a deleted gist', E, async (page) => {
  await fakeApi(page);
  await page.eval(async () => { const { api } = await import('/js/api.js'); await api.createProject({ name: 'lamp', template: 'blinky' }); });
  await page.openProject('lamp');
  await startCopy(page);
  await page.waitDialog('Copy Link');
  // the full link, as before; then the short one: made when it is copied
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .link-out').value), /#design=[A-Za-z0-9_-]+/);
  await page.click('.dlg-overlay input[data-field="short"]');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .link-out').value), '');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .link-info').textContent), /^A short link, about 140 characters: the project encrypted/);
  await page.dialogButton('Copy Link');
  await page.waitNoDialog();
  const link = await copied(page);
  assert.match(link, /#gist=[0-9a-f]{32}\.[A-Za-z0-9_-]{43}(&ui=[A-Za-z0-9_-]+)?$/);
  await page.waitConsole(/Copy Link: the short link of 'lamp' copied, \d+ characters \(the project in a secret gist of your GitHub account\)\./);
  const [id, key] = /#gist=([0-9a-f]+)\.([A-Za-z0-9_-]+)/.exec(link).slice(1);
  const gist = await page.eval(async (i) => (await fetch(`/fake-github/gists/${i}`)).json(), id);
  assert.equal(gist.public, false);
  assert.ok(!JSON.stringify(gist).includes('counter'), 'the design not readable in the gist');
  // opened again, the project deleted first: the project back, its files the same
  const counter = await readWs(env, 'lamp', 'src/counter.v');
  await page.eval(async () => { const { api } = await import('/js/api.js'); await api.deleteProject('lamp'); });
  await open(page, link.slice(link.indexOf('#')));
  await page.waitFor(() => window.Silinx.project?.name === 'lamp' && document.querySelector('#hier .row'), [], { what: 'lamp opened from the short link' });
  assert.equal(await readWs(env, 'lamp', 'src/counter.v'), counter);
  // a wrong key; a deleted gist: each an ERROR, nothing made
  const wrong = `#gist=${id}.${key.slice(1)}A`;
  await open(page, wrong);
  await page.waitConsole(/ERROR: Open from a link: the link's key does not open its gist \(a wrong or cut link\)\./);
  await page.eval(async (i, t) => { await fetch(`/fake-github/gists/${i}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } }); }, id, TOKEN);
  await open(page, link.slice(link.indexOf('#')));
  await page.waitConsole(/ERROR: Open from a link: the link's gist is not on GitHub \(deleted, or the link is cut\)\./);
  assert.deepEqual(warnings(page), []);
}, { timeout: 120000 });

uiTest('#3223 Copy Link\'s short link in Portuguese', E, async (page) => {
  await page.eval(async () => { const { api } = await import('/js/api.js'); await api.createProject({ name: 'luz', template: 'gates' }); });
  await page.openProject('luz');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await startCopy(page);
  await page.waitDialog('Copiar Ligação');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .link-forms label')].map((l) => l.textContent)),
    ['A ligação completa: o projeto dentro dela (não precisa de nada, mas é longa)', 'Uma ligação curta: o projeto cifrado num gist secreto da sua conta do GitHub']);
  await page.click('.dlg-overlay input[data-field="short"]');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .link-info').textContent), /^Uma ligação curta, com cerca de 140 carateres/);
  await page.dialogButton('Cancelar');
  assert.equal(await copied(page), null);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(warnings(page), []);
});
