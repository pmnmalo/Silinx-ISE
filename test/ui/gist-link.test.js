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
  // (its expiry, #3629)
  assert.deepEqual(await page.eval(() => { const s = document.querySelector('.dlg-overlay select[data-field="expires"]'); return [s.previousElementSibling.textContent, ...[...s.options].map((o) => o.textContent)]; }),
    ['Expira:', 'Nunca', 'Daqui a uma semana', 'Daqui a um mês', 'Daqui a seis meses', 'Daqui a um ano']);
  await page.dialogButton('Cancelar');
  assert.equal(await copied(page), null);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(warnings(page), []);
});

// #3629: the short link's expiry: Never by default, chosen only for a short link; the date in the console; an expired
// link refused when it is opened; making a short link deletes the expired ones of the account (the server's GH_TOKEN)
uiTest('#3629 Copy Link: a short link that expires; an expired one refused; the expired gists deleted', E, async (page) => {
  await fakeApi(page);
  await page.eval(async () => { const { api } = await import('/js/api.js'); await api.createProject({ name: 'dial', template: 'blinky' }); });
  await page.openProject('dial');
  // a short link of the account that expired yesterday, made ten days ago: opening it refused
  const old = await page.eval(async (t) => {
    const { saveGist } = await import('/core/gist-link.js');
    const { githubClient } = await import('/core/github-api.js');
    const client = githubClient({ fetch: (...a) => fetch(...a), token: () => t, api: `${location.origin}/fake-github` });
    return saveGist(client, 'an old design', { days: 9, now: Date.now() - 10 * 86400000 });
  }, TOKEN);
  await open(page, `#gist=${old.id}.${old.key}`);
  await page.waitConsole(new RegExp(`ERROR: Open from a link: the link expired on ${old.expires.slice(0, 10)} \\(its gist kept until its owner deletes it\\)\\.`));
  await startCopy(page);
  await page.waitDialog('Copy Link');
  const expires = () => page.eval(() => { const s = document.querySelector('.dlg-overlay select[data-field="expires"]'); return [s.disabled, s.value, [...s.options].map((o) => o.textContent)]; });
  assert.deepEqual(await expires(), [true, '0', ['Never', 'In a week', 'In a month', 'In six months', 'In a year']]);
  await page.click('.dlg-overlay input[data-field="short"]');
  assert.deepEqual((await expires()).slice(0, 2), [false, '0']);
  await page.eval(() => { const s = document.querySelector('.dlg-overlay select[data-field="expires"]'); s.value = '7'; s.dispatchEvent(new Event('change')); });
  await page.dialogButton('Copy Link');
  await page.waitNoDialog();
  const link = await copied(page);
  const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  await page.waitConsole(new RegExp(`Copy Link: the short link of 'dial' copied, ${link.length} characters \\(the project in a secret gist of your GitHub account, until ${date}\\)\\.`));
  await page.waitConsole(/Copy Link: 1 expired short link deleted from your gists\./);
  assert.equal((await page.eval(async (i) => (await fetch(`/fake-github/gists/${i}`)).status, old.id)), 404);
  // the new one opens
  await page.eval(async () => { const { api } = await import('/js/api.js'); await api.deleteProject('dial'); });
  await open(page, link.slice(link.indexOf('#')));
  await page.waitFor(() => window.Silinx.project?.name === 'dial' && document.querySelector('#hier .row'), [], { what: 'dial opened from the short link' });
  assert.deepEqual(warnings(page), []);
}, { timeout: 120000 });
