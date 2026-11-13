// UI: git in the browser edition (#3196, web/js/git-browser.js), through GitHub's REST API: the site (test/ui/site-lib.js)
// with a stand-in for GitHub on its own origin (test/fake-github.mjs; the page pointed at it by SILINX_GITHUB, as
// web/js/github-app.js reads it), no network. File ▸ Open from Repository… (a public repository with no sign-in; a
// private one refused, its hint the sign-in); Sign in with GitHub… (the device flow: the code shown, authorized on
// "GitHub"); the Design pane's marks; Commit and Push… (several files in one commit, pushed at once: no Push in the menu);
// Pull from GitHub (an open document read again); a rejected commit and a conflict as ERROR lines with their hint;
// History… and a file as it was; Sign out of GitHub; the token never in a URL nor in the console, kept in the browser's
// storage (Remember me, the default), or in this tab's when unticked (#3356; the device flow's scope: the private
// repositories when asked). In Portuguese; with no relay nor OAuth App set up, the sign-in with a pasted token (its steps, a refusal). Both interfaces; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, ROOT } from './harness.js';
import { buildSite } from './site-lib.js';
import { fakeGitHub } from '../fake-github.mjs';

const BLINKY = path.join(ROOT, 'examples', 'blinky');
const filesOf = (dir, base = '') => Object.fromEntries(fs.readdirSync(path.join(dir, base), { withFileTypes: true }).flatMap((e) => {
  const rel = base ? `${base}/${e.name}` : e.name;
  return e.isDirectory() ? Object.entries(filesOf(dir, rel)) : [[rel, fs.readFileSync(path.join(dir, rel), 'utf8')]];
}));

let env, site, gh;
before(async () => {
  env = await setupUi({ server: false });
  if (env.skip) return;
  gh = fakeGitHub({ interval: 1 });
  site = await buildSite(env.tmp, { route: (req, res, body) => gh.route('/fake-github')(req, res, body) });
});
after(async () => { site?.close?.(); await env?.teardown?.(); });
const E = () => (site?.skip ? { skip: site.skip } : env);

const boot = async (page, { clientId = gh.clientId } = {}) => {
  await page.goto(`${site.url}index.html`);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'site boot', timeout: 60000 });
  await page.eval((u, id) => { window.SILINX_GITHUB = { api: u, login: u, clientId: id }; }, `${site.url}fake-github`, clientId);
};
const warnings = (page) => page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text);
const marks = (page) => page.eval(() => [...document.querySelectorAll('#hier .row')].filter((r) => r.querySelector('.git-mark'))
  .map((r) => `${r.querySelector('.lbl').textContent} ${r.querySelector('.git-mark').textContent}`));
// a file changed in its editor and saved, as the user does
const edit = async (page, rel, text) => {
  await page.eval((f) => window.SilinxApp.openFile(f), rel);
  await page.waitFor((f) => !!window.SilinxApp.S.docs.find((d) => d.path === f)?.editor, [rel], { what: `${rel} open` });
  await page.eval(async (f, t) => { window.SilinxApp.S.docs.find((d) => d.path === f).editor.setValue(t); await window.SilinxApp.saveAll(); }, rel, text);
};
// a menu's item in Portuguese: by its label where the menu is shown (the ISE style interface), by its English one where
// the harness runs it from the menus' definitions (the Silinx interface hides File; the single file has no i18n module)
const ptMenu = (page, pt, en) => page.menu('Ficheiro', pt).catch((e) => { if (/^no item/.test(e.message)) return page.menu('Ficheiro', en); throw e; });
const openRepo = async (page, url) => {
  await page.menu('File', 'Open from Repository…');
  await page.waitDialog('Open from Repository');
  await page.fill('.dlg-overlay .git-url', url);
  await page.dialogButton('Open');
  await page.waitNoDialog();
};
const commit = async (page, message) => {
  await page.menu('File', 'Commit and Push…');
  await page.waitDialog('Commit and Push');
  await page.fill('.dlg-overlay .git-message', message);
  await page.dialogButton('Commit and Push');
  await page.waitNoDialog();
};

uiTest('#3196 the browser edition: Open from Repository…, Sign in with GitHub…, the marks, Commit and Push…, Pull, a rejection and a conflict, History…', E, async (page) => {
  gh.seed('pmalo/lab1', filesOf(BLINKY));
  gh.seed('pmalo/secret', filesOf(BLINKY), { private: true });
  await boot(page);
  // a public repository: no sign-in needed
  await openRepo(page, 'https://github.com/pmalo/lab1');
  await page.waitFor(() => window.Silinx.project?.name === 'lab1' && document.querySelector('#hier .row'), [], { what: 'lab1 open' });
  await page.waitConsole(/Project 'lab1' opened from the GitHub repository pmalo\/lab1\./);
  await page.waitConsole(/Project "lab1" .*Xilinx ISE and programming a board or a PROM run only once you trust it/);
  assert.deepEqual(await marks(page), []);
  // the menu: Commit and Push… (no Push), Sign in with GitHub…
  await assert.rejects(page.menu('File', 'Push to GitHub'), /no item 'Push to GitHub' in menu 'File'/);
  await page.closeMenus();
  // a private one, signed out: refused, its hint the sign-in
  await openRepo(page, 'https://github.com/pmalo/secret');
  await page.waitConsole(/ERROR: GitHub has no such repository, or your account cannot see it\nHint: Check the repository's address, and that your GitHub account can see it \(a private repository needs the sign-in\)\. Sign in with GitHub first/);
  // Sign in with GitHub…: the code shown, authorized on GitHub, the dialog closed
  await page.menu('File', 'Sign in with GitHub…');
  await page.waitDialog('Sign in with GitHub');
  // (#3356: first what it asks for: the private repositories ticked, Remember me (ticked by default) unticked)
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay input[type=checkbox]')].map((c) => [c.className, c.checked])), [['git-private', false], ['git-remember', true]]);
  await page.click('.dlg-overlay .git-private');
  await page.click('.dlg-overlay .git-remember');
  await page.dialogButton('Get a Code');
  await page.waitFor(() => /^WDJB-\d{4}$/.test(document.querySelector('.dlg-overlay .git-user-code')?.textContent || ''), [], { what: 'the code' });
  const code = await page.eval(() => document.querySelector('.dlg-overlay .git-user-code').textContent);
  assert.deepEqual(await page.eval(() => { const a = document.querySelector('.dlg-overlay .git-verify'); return [a.href, a.target, a.rel]; }), ['https://github.com/login/device', '_blank', 'noopener noreferrer']);
  gh.authorize(code);
  await page.waitNoDialog({ timeout: 15000 });
  await page.waitConsole(/Signed in to GitHub: the sign-in is kept in this tab until it is closed \(Sign out of GitHub forgets it\)\./);
  assert.deepEqual(gh.scopes(), ['repo gist']);
  // the private repository now opens
  await openRepo(page, 'https://github.com/pmalo/secret');
  await page.waitConsole(/Project 'secret' opened from the GitHub repository pmalo\/secret\./);
  await page.eval(() => window.SilinxApp.openProject('lab1'));
  await page.waitFor(() => window.Silinx.project?.name === 'lab1' && document.querySelector('#hier .row'), [], { what: 'lab1 again' });
  // a change: its row marked; Commit and Push…: one commit on GitHub, the marks gone
  const counter = gh.filesAt('pmalo/lab1', 'main')['src/counter.v'];
  await edit(page, 'src/counter.v', `${counter}// changed\n`);
  await page.waitFor(() => !!document.querySelector('#hier .git-mark'), [], { what: 'a mark' });
  assert.deepEqual(await marks(page), ['lab1 M', 'u_pre - prescaler M']);
  const before = gh.head('pmalo/lab1');
  await commit(page, 'Counter changed');
  await page.waitConsole(/Committed [0-9a-f]{7} on main: 1 file\(s\)\.\n {2}src\/counter\.v \(changed\)\nPushed main to pmalo\/lab1\./);
  await page.waitFor(() => !document.querySelector('#hier .git-mark'), [], { what: 'the marks gone' });
  assert.deepEqual(gh.commitOf('pmalo/lab1', gh.head('pmalo/lab1')).parents, [before]);
  assert.equal(gh.filesAt('pmalo/lab1', 'main')['src/counter.v'], `${counter}// changed\n`);
  assert.ok(gh.filesAt('pmalo/lab1', 'main')['.gitignore'].startsWith('# Silinx'));
  // another author's commit: Pull from GitHub brings it; the open document read again
  await page.eval(() => window.SilinxApp.openFile('src/sevenseg.v'));
  gh.commitFiles('pmalo/lab1', { 'src/sevenseg.v': '// theirs\n' }, { message: 'Theirs: sevenseg', author: 'teammate' });
  await page.menu('File', 'Pull from GitHub');
  await page.waitConsole(/Pulled into main: 1 file\(s\) changed\.\n {2}src\/sevenseg\.v/);
  await page.waitFor(() => window.SilinxApp.S.docs.find((d) => d.path === 'src/sevenseg.v')?.editor.getValue() === '// theirs\n', [], { what: 'sevenseg read again' });
  // a commit GitHub rejects (its branch moved), then a conflict: their ERROR lines and hints; the file as it was
  gh.commitFiles('pmalo/lab1', { 'src/sevenseg.v': '// theirs again\n' }, { message: 'Theirs again', author: 'teammate' });
  await edit(page, 'src/sevenseg.v', '// mine\n');
  await page.waitFor(() => !!document.querySelector('#hier .git-mark'), [], { what: 'a mark' });
  await commit(page, 'Mine');
  await page.waitConsole(/ERROR: git push: rejected by GitHub \(fetch first\)\nHint: GitHub has commits that this project does not: Pull first, then Push again\./);
  await page.menu('File', 'Pull from GitHub');
  await page.waitConsole(/ERROR: git pull: a conflict in src\/sevenseg\.v: nothing was pulled, the project's files are as they were\nHint: The same file changed here and on GitHub\./);
  assert.equal(await page.eval(() => window.SilinxApp.S.docs.find((d) => d.path === 'src/sevenseg.v').editor.getValue()), '// mine\n');
  // History…: the commits, the newest first; a file of the first opens as it was, read only
  await page.menu('File', 'History…');
  await page.waitDialog('History');
  await page.waitFor(() => document.querySelectorAll('.dlg-overlay .git-commit').length === 4, [], { what: 'the commits' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .git-commit .git-subject')].map((e) => e.textContent)), ['Theirs again', 'Theirs: sevenseg', 'Counter changed', 'Initial commit']);
  const first = await page.eval(() => document.querySelector('.dlg-overlay .git-commit:last-child').dataset.commit);
  await page.click('.dlg-overlay .git-commit:last-child a[data-path="src/counter.v"]');
  await page.waitNoDialog();
  const id = `git:${first}:src/counter.v`;
  await page.waitFor((i) => !!window.SilinxApp.S.docs.find((d) => d.id === i)?.editor, [id], { what: 'the file as it was' });
  assert.equal(await page.eval((i) => window.SilinxApp.S.docs.find((d) => d.id === i).editor.getValue(), id), counter);
  assert.equal(await page.eval((i) => window.SilinxApp.S.docs.find((d) => d.id === i).editor.readOnly(), id), true);
  // the token: in this tab's storage only (not remembered), never in a URL, never in the console
  assert.deepEqual(await page.eval(() => [sessionStorage.getItem('silinx.github-token'), localStorage.getItem('silinx.github-token')]), [gh.token, null]);
  for (const r of gh.requests) assert.ok(!r.url.includes(gh.token), r.url);
  assert.ok(gh.requests.some((r) => r.headers.authorization === `Bearer ${gh.token}`));
  assert.ok(!(await page.eval(() => window.__console())).includes(gh.token));
  // Sign out of GitHub: forgotten; the menu offers the sign-in again
  await page.menu('File', 'Sign out of GitHub');
  await page.waitConsole(/Signed out of GitHub: this browser no longer keeps the sign-in\./);
  assert.deepEqual(await page.eval(() => [sessionStorage.getItem('silinx.github-token'), localStorage.getItem('silinx.github-token')]), [null, null]);
  await page.menu('File', 'Sign in with GitHub…');
  await page.waitDialog('Sign in with GitHub');
  await page.dialogButton('Cancel');
  await page.waitConsole(/The GitHub sign-in was cancelled\./);
  assert.deepEqual(warnings(page), []);
}, { url: () => 'about:blank', timeout: 240000 });

uiTest('#3196 the browser edition in Portuguese: the Git commands; Initialize Repository… on an empty repository, its first commit; the sign-in with a pasted token', E, async (page) => {
  gh.seed('pmalo/fresh');
  await boot(page);
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'Fresh');
  await page.fill('.dlg-overlay .wiz-main select', 'gates', { index: 0 });
  await page.dialogButton('Next >');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'Fresh' && document.querySelector('#hier .row'), [], { what: 'Fresh open' });
  // in Portuguese (the project reopened)
  await page.eval(() => localStorage.setItem('silinx.lang', 'pt'));
  await boot(page, { clientId: 'REPLACE-ME-with-the-client-ID-of-Silinx-GitHub-OAuth-App' });
  await page.waitFor(() => document.documentElement.lang === 'pt' && window.Silinx.project?.name === 'Fresh', [], { what: 'Portuguese, Fresh' });
  // (signed in already: this browser keeps the sign-in)
  await page.eval((t) => localStorage.setItem('silinx.github-token', t), gh.token);
  // not a repository yet: Registar e Enviar disabled
  await assert.rejects(ptMenu(page, 'Registar e Enviar (Commit e Push)…', 'Commit and Push…'), /menu item 'Ficheiro ▸ (Registar e Enviar \(Commit e Push\)|Commit and Push)…' is disabled$/);
  await ptMenu(page, 'Inicializar Repositório…', 'Initialize Repository…');
  await page.waitDialog('Inicializar Repositório');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .form-grid label').textContent), 'Repositório do GitHub (um vazio: para onde vão os commits):');
  // (the browser edition's repository is GitHub's: its address required)
  await page.dialogButton('Inicializar');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .git-url-error').textContent), 'não é o endereço de um repositório do GitHub: (none)');
  await page.fill('.dlg-overlay .git-url', 'https://github.com/pmalo/fresh');
  await page.dialogButton('Inicializar');
  await page.waitNoDialog();
  await page.waitConsole(/Repository made for 'Fresh', its remote https:\/\/github\.com\/pmalo\/fresh\./);
  await page.waitFor(() => !!document.querySelector('#hier .git-mark'), [], { what: 'the marks' });
  assert.ok((await marks(page)).every((m) => / N$/.test(m)), (await marks(page)).join(' | '));
  // the first commit: the project's files and Silinx's .gitignore, on the empty repository
  await ptMenu(page, 'Registar e Enviar (Commit e Push)…', 'Commit and Push…');
  await page.waitDialog('Registar e Enviar (Commit e Push)');
  await page.fill('.dlg-overlay .git-message', 'Primeiro');
  await page.dialogButton('Registar e Enviar (Commit e Push)');
  await page.waitNoDialog();
  await page.waitConsole(/Committed [0-9a-f]{7} on main: \d+ file\(s\)\.[\s\S]*\nPushed main to pmalo\/fresh\./);
  await page.waitFor(() => !document.querySelector('#hier .git-mark'), [], { what: 'the marks gone' });
  assert.deepEqual(Object.keys(gh.filesAt('pmalo/fresh', 'main')).sort(), ['.gitignore', 'constraints/gates.ucf', 'silinx.json', 'sim/tb_gates.vhd', 'src/gates.sch.json', 'src/gates.vhd']);
  await ptMenu(page, 'Terminar sessão no GitHub', 'Sign out of GitHub');
  await page.waitConsole(/Signed out of GitHub/);
  // no OAuth App nor relay set up (the placeholders): the sign-in is a pasted token, its steps and permissions said
  await ptMenu(page, 'Iniciar sessão no GitHub…', 'Sign in with GitHub…');
  await page.waitDialog('Iniciar sessão no GitHub');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .git-token-steps li')].map((l) => l.textContent)), [
    'Abra a página do GitHub para um novo token: https://github.com/settings/personal-access-tokens/new',
    'Acesso aos repositórios: Only select repositories (os que vai abrir no Silinx).',
    'Permissões dos repositórios: Contents, Read and write (Metadata, Read-only, vem com ela).',
    'Permissões da conta: Gists, Read and write (para as ligações curtas de Partilhar Projeto).',
    'Gere o token, copie-o e cole-o aqui.']);
  assert.deepEqual(await page.eval(() => { const a = document.querySelector('.dlg-overlay .git-new-token'); return [a.target, a.rel, document.querySelector('.dlg-overlay .git-token').type]; }), ['_blank', 'noopener noreferrer', 'password']);
  // (not a token; one GitHub refuses: said beside the field, nothing kept)
  await page.fill('.dlg-overlay .git-token', 'not a token');
  await page.dialogButton('Iniciar Sessão');
  await page.waitFor(() => /^that is not a GitHub token/.test(document.querySelector('.dlg-overlay .git-token-error').textContent), [], { what: 'the token\'s error' });
  await page.fill('.dlg-overlay .git-token', 'github_pat_11AAAAAAA0_refusedrefusedrefused');
  await page.dialogButton('Iniciar Sessão');
  await page.waitFor(() => /^GitHub refused the sign-in \(Bad credentials\): GitHub refused this token/.test(document.querySelector('.dlg-overlay .git-token-error').textContent), [], { what: 'the refusal' });
  assert.deepEqual(await page.eval(() => [sessionStorage.getItem('silinx.github-token'), localStorage.getItem('silinx.github-token')]), [null, null]);
  // (#3356: Remember me, in Portuguese, ticked by default: kept in this browser)
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .git-remember').parentElement.textContent.trim()), 'Lembrar-me neste navegador (guardada depois de fechar este separador, onde todas as páginas do endereço deste sítio a podem ler)');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .git-remember').checked), true);
  await page.fill('.dlg-overlay .git-token', gh.token);
  await page.dialogButton('Iniciar Sessão');
  await page.waitNoDialog();
  await page.waitConsole(/Signed in to GitHub as student: the sign-in is kept in this browser \(Sign out of GitHub forgets it\)\./);
  assert.deepEqual(await page.eval(() => [sessionStorage.getItem('silinx.github-token'), localStorage.getItem('silinx.github-token')]), [null, gh.token]);
  assert.ok(!(await page.eval(() => window.__console())).includes(gh.token));
  assert.ok(!(await page.eval(() => window.__console())).includes('refusedrefused'));
  await page.eval(() => localStorage.removeItem('silinx.lang'));
  assert.deepEqual(warnings(page), []);
}, { url: () => 'about:blank', timeout: 180000 });

// (#3534) Sign in with GitHub… on the Start page (no project needed) and in the Design tree's project and device menus,
// with Initialize Repository… for a project with no repository: shown when not signed in, the File menu's dialog run
// from either (a cancel keeps them); gone from both once signed in (Sign out of GitHub: the Git submenu's), back once
// signed out; in Portuguese. Both interfaces; no warnings.
const startLinks = (page) => page.eval(() => [...document.querySelectorAll('#start-page .entry a')].filter((a) => a.getClientRects().length).map((a) => a.textContent));
const treeItems = async (page, row, item) => {
  await page.rightClick('#hier .row .lbl', { index: row });
  await page.waitForSelector('body > .menu-popup');
  const items = await page.eval(() => [...document.querySelectorAll('body > .menu-popup > .mi')].map((m) => m.querySelector('.lbl')?.textContent.trim() ?? m.textContent.trim()));
  if (item) await page.click('body > .menu-popup > .mi', { text: item }); else await page.closeMenus();
  return items;
};
uiTest('#3534 the browser edition: Sign in with GitHub… on the Start page and in the Design tree\'s project and device menus, until signed in; Portuguese', E, async (page) => {
  await boot(page, { clientId: 'REPLACE-ME-with-the-client-ID-of-Silinx-GitHub-OAuth-App' });
  await page.eval(() => { localStorage.removeItem('silinx.github-token'); sessionStorage.removeItem('silinx.github-token'); });
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'SignTree');
  await page.fill('.dlg-overlay .wiz-main select', 'gates', { index: 0 });
  await page.dialogButton('Next >');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'SignTree' && document.querySelectorAll('#hier .row .lbl').length >= 2, [], { what: 'SignTree open' });
  // the Start page's git group: Sign in with GitHub… first, Initialize Repository…, Open from Repository… last (#3716)
  await page.leftTab('start');
  await page.waitFor(() => [...document.querySelectorAll('#start-page .entry a')].some((a) => a.textContent === 'Sign in with GitHub…'), [], { what: 'the Start page\'s sign-in' });
  let links = await startLinks(page);
  assert.deepEqual(links.slice(links.indexOf('Sign in with GitHub…'), links.indexOf('Sign in with GitHub…') + 3), ['Sign in with GitHub…', 'Initialize Repository…', 'Open from Repository…'], links.join(' | '));
  // its dialog, the File menu's; cancelled: still there
  await page.click('#start-page .entry a', { text: 'Sign in with GitHub…' });
  await page.waitDialog('Sign in with GitHub');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  await page.waitConsole(/The GitHub sign-in was cancelled\./);
  assert.ok((await startLinks(page)).includes('Sign in with GitHub…'));
  // the project's and the device's rows: Initialize Repository…, Sign in with GitHub…, then Git
  await page.leftTab('design');
  for (const row of [0, 1]) {
    const items = await treeItems(page, row);
    const at = items.indexOf('Initialize Repository…');
    assert.deepEqual(items.slice(at, at + 3), ['Initialize Repository…', 'Sign in with GitHub…', 'Git'], `row ${row}: ${items.join(' | ')}`);
  }
  // signed in from the device's row: gone from the menus and the Start page
  await treeItems(page, 1, 'Sign in with GitHub…');
  await page.waitDialog('Sign in with GitHub');
  await page.fill('.dlg-overlay .git-token', gh.token);
  await page.dialogButton('Sign In');
  await page.waitNoDialog();
  await page.waitConsole(/Signed in to GitHub as student: the sign-in is kept in this browser/);
  for (const row of [0, 1]) {
    const items = await treeItems(page, row);
    assert.ok(!items.includes('Sign in with GitHub…') && items.includes('Initialize Repository…'), `row ${row}: ${items.join(' | ')}`);
  }
  await page.leftTab('start');
  await page.waitFor(() => ![...document.querySelectorAll('#start-page .entry a')].some((a) => a.textContent === 'Sign in with GitHub…'), [], { what: 'the Start page\'s sign-in gone' });
  assert.ok((await startLinks(page)).includes('Initialize Repository…'));
  // signed out (the Git submenu's): back, in Portuguese (the page loaded again)
  await page.menu('File', 'Sign out of GitHub');
  await page.waitConsole(/Signed out of GitHub/);
  await page.eval(() => localStorage.setItem('silinx.lang', 'pt'));
  await boot(page, { clientId: 'REPLACE-ME-with-the-client-ID-of-Silinx-GitHub-OAuth-App' });
  await page.waitFor(() => document.documentElement.lang === 'pt' && window.Silinx.project?.name === 'SignTree' && document.querySelectorAll('#hier .row .lbl').length >= 2, [], { what: 'Portuguese, SignTree' });
  for (const row of [0, 1]) {
    const items = await treeItems(page, row);
    assert.ok(items.includes('Inicializar Repositório…') && items.includes('Iniciar sessão no GitHub…'), `row ${row}: ${items.join(' | ')}`);
  }
  await page.leftTab('start');
  await page.waitFor(() => [...document.querySelectorAll('#start-page .entry a')].some((a) => a.textContent === 'Iniciar sessão no GitHub…'), [], { what: 'the Start page in Portuguese' });
  await page.eval(() => localStorage.removeItem('silinx.lang'));
  assert.deepEqual(warnings(page), []);
}, { url: () => 'about:blank', timeout: 180000 });
