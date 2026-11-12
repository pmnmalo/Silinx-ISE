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
  await page.waitDialog('Share Project');
  // the full link, as before; then the short one: made when it is copied
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .link-out').value), /#design=[A-Za-z0-9_-]+/);
  await page.click('.dlg-overlay input[data-field="short"]');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .link-out').value), '');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .link-info').textContent), /^A short link, about 140 characters: the project encrypted/);
  await page.dialogButton('Copy Link');
  await page.waitNoDialog();
  const link = await copied(page);
  assert.match(link, /#gist=[0-9a-f]{32}\.[A-Za-z0-9_-]{43}(&ui=[A-Za-z0-9_-]+)?$/);
  await page.waitConsole(/Share Project: the short link of 'lamp' copied, \d+ characters \(the project in a secret gist of your GitHub account\)\./);
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
  await page.waitDialog('Partilhar Projeto');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .link-forms label')].map((l) => l.textContent)),
    ['A ligação completa: o projeto dentro dela (não precisa de nada, mas é longa)', 'Uma ligação curta: o projeto cifrado num gist secreto da sua conta do GitHub']);
  await page.click('.dlg-overlay input[data-field="short"]');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .link-info').textContent), /^Uma ligação curta, com cerca de 140 carateres/);
  // (its expiry, #3629)
  assert.deepEqual(await page.eval(() => { const s = document.querySelector('.dlg-overlay select[data-field="expires"]'); return [s.previousElementSibling.textContent, ...[...s.options].map((o) => o.textContent)]; }),
    ['Expira:', 'Nunca', 'Daqui a uma semana', 'Daqui a um mês', 'Daqui a seis meses', 'Daqui a um ano']);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .link-manage a').textContent), 'Gerir as ligações curtas…');
  await page.dialogButton('Cancelar');
  assert.equal(await copied(page), null);
  // Short Links… (#3635): its title, its columns, its buttons
  await page.eval(() => { window.__links = import('/js/short-links.js').then((m) => m.shortLinksDialog()); });
  await page.waitDialog('Ligações Curtas');
  assert.deepEqual(await page.eval(() => [[...document.querySelectorAll('.dlg-overlay table.short-links thead th')].map((t) => t.textContent), [...document.querySelectorAll('.dlg-overlay .dlg-buttons .btn')].map((b) => b.textContent)]),
    [['', 'Projeto', 'Feita', 'Expira', ''], ['Apagar as Selecionadas', 'Apagar as Expiradas', 'Fechar']]);
  await page.dialogButton('Fechar');
  await page.waitNoDialog();
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
  await page.waitDialog('Share Project');
  const expires = () => page.eval(() => { const s = document.querySelector('.dlg-overlay select[data-field="expires"]'); return [s.disabled, s.value, [...s.options].map((o) => o.textContent)]; });
  assert.deepEqual(await expires(), [true, '0', ['Never', 'In a week', 'In a month', 'In six months', 'In a year']]);
  await page.click('.dlg-overlay input[data-field="short"]');
  assert.deepEqual((await expires()).slice(0, 2), [false, '0']);
  await page.eval(() => { const s = document.querySelector('.dlg-overlay select[data-field="expires"]'); s.value = '7'; s.dispatchEvent(new Event('change')); });
  await page.dialogButton('Copy Link');
  await page.waitNoDialog();
  const link = await copied(page);
  const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  await page.waitConsole(new RegExp(`Share Project: the short link of 'dial' copied, ${link.length} characters \\(the project in a secret gist of your GitHub account, until ${date}\\)\\.`));
  await page.waitConsole(/Share Project: 1 expired short link deleted from your gists\./);
  assert.equal((await page.eval(async (i) => (await fetch(`/fake-github/gists/${i}`)).status, old.id)), 404);
  // the new one opens
  await page.eval(async () => { const { api } = await import('/js/api.js'); await api.deleteProject('dial'); });
  await open(page, link.slice(link.indexOf('#')));
  await page.waitFor(() => window.Silinx.project?.name === 'dial' && document.querySelector('#hier .row'), [], { what: 'dial opened from the short link' });
  assert.deepEqual(warnings(page), []);
}, { timeout: 120000 });

// #3635: File ▸ Short Links…: the account's short links, the newest first; those this browser made with their project,
// copied again; one made elsewhere said to be; Delete Expired and Delete Selected, each said in the console; opened from
// Copy Link's Manage short links… too
uiTest('#3635 Short Links…: listed, the one made here copied again, the expired and a selected one deleted', E, async (page) => {
  await fakeApi(page);
  const rows = () => page.eval(() => [...document.querySelectorAll('.dlg-overlay table.short-links tbody tr')].map((r) => [r.querySelector('.short-project').textContent, r.querySelector('.short-expires').textContent, !!r.querySelector('.short-copy')]));
  // (the account's gists and this browser's links of the tests before cleared)
  await page.eval(async () => {
    const { api } = await import('/js/api.js');
    const ids = (await api.gistList()).map((g) => g.id);
    if (ids.length) await api.gistDelete({ ids });
    localStorage.removeItem('silinx.short-links');
    await api.createProject({ name: 'beam', template: 'blinky' });
  });
  await page.openProject('beam');
  await startCopy(page);
  await page.waitDialog('Share Project');
  await page.click('.dlg-overlay input[data-field="short"]');
  await page.dialogButton('Copy Link');
  await page.waitNoDialog();
  const link = await copied(page);
  // two made elsewhere: one that never expires, one expired three days ago
  const made = await page.eval(async (t) => {
    const { saveGist } = await import('/core/gist-link.js');
    const { githubClient } = await import('/core/github-api.js');
    const client = githubClient({ fetch: (...a) => fetch(...a), token: () => t, api: `${location.origin}/fake-github` });
    const never = await saveGist(client, 'elsewhere');
    const old = await saveGist(client, 'old', { days: 7, now: Date.now() - 10 * 86400000 });
    return { never: never.id, old: old.id, expired: old.expires.slice(0, 10) };
  }, TOKEN);
  await page.menu('File', 'Short Links…');
  await page.waitDialog('Short Links');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .short-links-count').textContent), '3 short links of your GitHub account, the newest first; 1 expired.');
  assert.deepEqual(await rows(page), [['Made in another browser', `Expired ${made.expired}`, false], ['Made in another browser', 'Never', false], ['beam', 'Never', true]]);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay table.short-links thead th')].map((t) => t.textContent)), ['', 'Project', 'Made', 'Expires', '']);
  // copied again
  await page.click('.dlg-overlay tr:last-child .short-copy');
  await page.waitConsole(new RegExp(`Short Links: the short link of 'beam' copied, ${link.length} characters\\.`));
  // the expired one, then the selected one
  await page.dialogButton('Delete Expired');
  await page.waitConsole(/Short Links: 1 short link deleted from your gists \(the expired ones\)\./);
  await page.waitFor(() => document.querySelectorAll('.dlg-overlay table.short-links tbody tr').length === 2, [], { what: 'the expired one gone' });
  await page.click(`.dlg-overlay tr[data-gist="${made.never}"] input[type=checkbox]`);
  await page.dialogButton('Delete Selected');
  await page.waitConsole(/Short Links: 1 short link deleted from your gists\./);
  await page.waitFor(() => document.querySelectorAll('.dlg-overlay table.short-links tbody tr').length === 1, [], { what: 'the selected one gone' });
  assert.deepEqual(await rows(page), [['beam', 'Never', true]]);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .short-links-count').textContent), '1 short link of your GitHub account, the newest first; 0 expired.');
  await page.dialogButton('Close');
  await page.waitNoDialog();
  assert.deepEqual(await page.eval(async (a, b) => [(await fetch(`/fake-github/gists/${a}`)).status, (await fetch(`/fake-github/gists/${b}`)).status], made.never, made.old), [404, 404]);
  // from Copy Link's Manage short links…
  await startCopy(page);
  await page.waitDialog('Share Project');
  await page.click('.dlg-overlay .link-manage a');
  await page.waitDialog('Short Links');
  assert.equal(await copied(page), null);
  await page.dialogButton('Close');
  await page.waitNoDialog();
  assert.deepEqual(warnings(page), []);
}, { timeout: 120000 });
