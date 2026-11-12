// UI: git in the server editions (#3195, web/js/git.js) against local bare repositories (no network: the server maps
// https://github.com/test/<repo> to one, SILINX_UI_GIT_REMOTES of test/ui/serve.js). File ▸ Open from Repository…,
// a URL that is not GitHub's said beside its field; the project opened, untrusted; the Design pane's marks (changed,
// new) and gone once committed; Commit… (an empty message said beside its field), Push to GitHub, Pull from GitHub,
// a rejected push and a conflict as ERROR lines with their hint in the console; the same commands in the Design pane's
// project menu; the labels in Portuguese. Both interfaces; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { setupUi, uiTest, readWs, ROOT } from './harness.js';

let env, tmp, remotes;
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
function bare(name) {
  const dir = path.join(remotes, `${name}.git`);
  fs.mkdirSync(dir, { recursive: true });
  sh(dir, 'init', '--quiet', '--bare');
  sh(dir, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  const seed = path.join(tmp, 'seed', name);
  fs.cpSync(path.join(ROOT, 'examples', 'blinky'), seed, { recursive: true });
  sh(seed, 'init', '--quiet');
  sh(seed, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  sh(seed, 'add', '-A');
  sh(seed, 'commit', '--quiet', '-m', 'Starter');
  sh(seed, 'push', '--quiet', dir, 'main');
  return dir;
}
// another author's commit on GitHub
function theirs(name, file, text) {
  const dir = path.join(tmp, 'theirs', name);
  if (!fs.existsSync(dir)) sh(tmp, 'clone', '--quiet', path.join(remotes, `${name}.git`), dir);
  sh(dir, 'pull', '--quiet', '--no-rebase');
  fs.writeFileSync(path.join(dir, file), text);
  sh(dir, 'commit', '--quiet', '-am', `Theirs: ${file}`);
  sh(dir, 'push', '--quiet');
}

before(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-ui-git-')));
  remotes = path.join(tmp, 'remotes');
  fs.writeFileSync(path.join(tmp, 'gitconfig'), '[user]\n\tname = Ana Aluna\n\temail = ana@example.com\n[init]\n\tdefaultBranch = main\n');
  // (the server's git, and this test's, with this configuration only)
  Object.assign(process.env, { GIT_CONFIG_GLOBAL: path.join(tmp, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1', SILINX_UI_GIT_REMOTES: remotes });
  env = await setupUi();
});
after(async () => {
  await env?.teardown?.();
  delete process.env.SILINX_UI_GIT_REMOTES;
  fs.rmSync(tmp, { recursive: true, force: true });
});
const E = () => env;
const warnings = (page) => page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text);
const marks = (page) => page.eval(() => [...document.querySelectorAll('#hier .row')].filter((r) => r.querySelector('.git-mark'))
  .map((r) => `${r.querySelector('.lbl').textContent} ${r.querySelector('.git-mark').textContent} ${r.querySelector('.git-mark').title}`));
const writeFile = (page, rel, text) => page.eval(async (p, t) => { const { api } = await import('/js/api.js'); await api.writeFile(window.Silinx.project.name, p, t); }, rel, text);
const errorText = (page, cls) => page.eval((c) => document.querySelector(`.dlg-overlay .${c}`)?.textContent || '', cls);

uiTest('#3195 Open from Repository…, the marks, Commit…, Push and Pull; a rejected push and a conflict in the console', E, async (page) => {
  const remote = bare('lab1');
  // (the File menu: Open from Repository… after Share Project Copy…, #3323; from the menus' definitions, the Silinx
  // interface showing no File menu)
  const file = await page.eval(() => window.SilinxApp.S.menus.find((m) => m.label === 'File').items().filter(Boolean).map((x) => (x === '-' ? '—' : x.label)));
  assert.deepEqual(file.slice(0, file.indexOf('Short Links…') + 2), ['New Project…', 'Open Project…', '—', 'Import Project (.zip)…', 'Export Project (.zip)…', 'Share Project Copy…', 'Open from Repository…', 'Share Project Live…', 'Short Links…', '—']);
  await page.menu('File', 'Open from Repository…');
  await page.waitDialog('Open from Repository');
  // a URL that is not GitHub's: said beside the field, the dialog open
  await page.fill('.dlg-overlay .git-url', 'https://gitlab.com/a/lab1');
  await page.dialogButton('Open');
  await page.waitFor(() => /not a GitHub repository's address/.test(document.querySelector('.dlg-overlay .git-url-error')?.textContent || ''), [], { what: 'the URL\'s error' });
  assert.equal(await errorText(page, 'git-url-error'), 'not a GitHub repository\'s address: https://gitlab.com/a/lab1');
  // a GitHub address: the project's name from the repository's
  await page.fill('.dlg-overlay .git-url', 'https://github.com/test/lab1');
  assert.equal(await errorText(page, 'git-url-error'), '');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .git-name').value), 'lab1');
  await page.dialogButton('Open');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'lab1' && document.querySelector('#hier .row'), [], { what: 'lab1 open' });
  await page.waitConsole(/Project 'lab1' opened from the GitHub repository test\/lab1\./);
  await page.waitConsole(/Project "lab1" .*Xilinx ISE and programming a board or a PROM run only once you trust it/);
  assert.deepEqual(await marks(page), []);
  // a change and a new file: their rows marked; the project's row too
  await writeFile(page, 'src/counter.v', `${await readWs(env, 'lab1', 'src/counter.v')}// changed\n`);
  await page.waitFor(() => !!document.querySelector('#hier .git-mark'), [], { what: 'a mark' });
  assert.deepEqual(await marks(page), ['lab1 M Changed since the last commit', 'u_pre - prescaler M Changed since the last commit']);
  // Commit…: an empty message said beside its field; then committed, the marks gone
  await page.menu('File', 'Commit…');
  await page.waitDialog('Commit');
  assert.equal(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .git-changes li')].map((l) => l.textContent).join(', ')), 'src/counter.v (changed) Compare');
  await page.dialogButton('Commit');
  assert.equal(await errorText(page, 'git-message-error'), 'Say in a few words what changed.');
  await page.fill('.dlg-overlay .git-message', 'Counter changed');
  await page.dialogButton('Commit');
  await page.waitNoDialog();
  await page.waitConsole(/Committed [0-9a-f]{7} on main: 2 file\(s\)\.\n {2}\.gitignore \(new\)\n {2}src\/counter\.v \(changed\)/);
  await page.waitFor(() => !document.querySelector('#hier .git-mark'), [], { what: 'the marks gone' });
  // Push to GitHub
  await page.menu('File', 'Push to GitHub');
  await page.waitConsole(/Pushed main to local\/lab1\./);
  assert.equal(sh(remote, 'log', '-1', '--format=%s', 'main'), 'Counter changed\n');
  // another author's commit: Pull from GitHub brings it, the file read again
  theirs('lab1', 'src/sevenseg.v', '// theirs\n');
  await page.menu('File', 'Pull from GitHub');
  await page.waitConsole(/Pulled into main: 1 file\(s\) changed\.\n {2}src\/sevenseg\.v/);
  assert.equal(await readWs(env, 'lab1', 'src/sevenseg.v'), '// theirs\n');
  // a tool's output pulled (#3359): left out of the project's folder, a WARNING in the console
  const them = path.join(tmp, 'theirs', 'lab1');
  fs.mkdirSync(path.join(them, 'build'), { recursive: true });
  fs.writeFileSync(path.join(them, 'build', 'top.bit'), 'bits');
  sh(them, 'add', '-f', 'build/top.bit'); sh(them, 'commit', '--quiet', '-m', 'Theirs: build'); sh(them, 'push', '--quiet');
  await page.menu('File', 'Pull from GitHub');
  await page.waitConsole(/Pulled into main: 0 file\(s\) changed\.\nWARNING: build\/top\.bit: not pulled into the project: a tool's output, made again from the sources/);
  assert.equal(fs.existsSync(path.join(env.server.workspace, 'lab1', 'build', 'top.bit')), false);
  // a rejected push, then a conflict: their ERROR lines and hints; the file as it was
  theirs('lab1', 'src/sevenseg.v', '// theirs again\n');
  await writeFile(page, 'src/sevenseg.v', '// mine\n');
  await page.waitFor(() => !!document.querySelector('#hier .git-mark'), [], { what: 'a mark' });
  await page.menu('File', 'Commit…');
  await page.waitDialog('Commit');
  await page.fill('.dlg-overlay .git-message', 'Mine');
  await page.dialogButton('Commit');
  await page.waitConsole(/Committed [0-9a-f]{7} on main: 1 file\(s\)\./);
  await page.menu('File', 'Push to GitHub');
  await page.waitConsole(/ERROR: git push: rejected by GitHub \(fetch first\)\nHint: GitHub has commits that this project does not: Pull first, then Push again\./);
  await page.menu('File', 'Pull from GitHub');
  await page.waitConsole(/ERROR: git pull: a conflict in src\/sevenseg\.v: nothing was pulled, the project's files are as they were\nHint: The same lines changed here and on GitHub\./);
  assert.equal(await readWs(env, 'lab1', 'src/sevenseg.v'), '// mine\n');
  // History…: the commits, the newest first; a file of the first opens as it was, read only, the notice at the right end
  // of its toolbar
  await page.menu('File', 'History…');
  await page.waitDialog('History');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .git-commit .git-subject')].map((e) => e.textContent)), ['Mine', 'Theirs: build', 'Theirs: src/sevenseg.v', 'Counter changed', 'Starter']);
  const first = await page.eval(() => document.querySelector('.dlg-overlay .git-commit:last-child').dataset.commit);
  await page.click('.dlg-overlay .git-commit:last-child a[data-path="src/counter.v"]');
  await page.waitNoDialog();
  const id = `git:${first}:src/counter.v`;
  await page.waitFor((i) => !!window.SilinxApp.S.docs.find((d) => d.id === i)?.editor, [id], { what: 'the file as it was' });
  assert.equal(await page.eval((i) => window.SilinxApp.S.docs.find((d) => d.id === i).editor.getValue(), id), fs.readFileSync(path.join(ROOT, 'examples', 'blinky', 'src', 'counter.v'), 'utf8'));
  assert.deepEqual(await page.eval(() => {
    const b = [...document.querySelectorAll('.gen-banner.read-only')].find((e) => /as it was/.test(e.textContent));
    return [b.textContent.replace(/[0-9a-f]{7} \(\d{4}-\d\d-\d\d\)/, 'X'), b === b.parentElement.lastElementChild, b.parentElement.classList.contains('editor-bar')];
  }), ['Read-only, as it was in the commit X', true, true]);
  assert.equal(await page.eval((i) => window.SilinxApp.S.docs.find((d) => d.id === i).editor.readOnly(), id), true);
  assert.deepEqual(warnings(page), []);
}, { timeout: 120000 });

uiTest('#3195 the Design pane\'s project menu: the Git commands (the Silinx interface has no File menu); Initialize Repository…; in Portuguese', E, async (page) => {
  await page.eval(async () => { const { api } = await import('/js/api.js'); await api.createProject({ name: 'fresh', template: 'gates' }); });
  await page.openProject('fresh');
  const gitItems = async () => {
    await page.treeRow('#hier', 'fresh', { right: true });
    await page.waitFor(() => !!document.querySelector('body > .menu-popup'), [], { what: 'the project menu' });
    const items = await page.eval(() => [...document.querySelectorAll('body > .menu-popup > .mi .lbl')].map((l) => l.textContent));
    await page.closeMenus();
    return items;
  };
  assert.ok((await gitItems()).includes('Git'));
  // not a repository yet: Commit…, Push and Pull disabled
  await assert.rejects(page.menu('File', 'Commit…'), { message: 'menu item \'File ▸ Commit…\' is disabled' });
  await page.menu('File', 'Initialize Repository…');
  await page.waitDialog('Initialize Repository');
  await page.fill('.dlg-overlay .git-url', 'http://github.com/a/b');
  await page.dialogButton('Initialize');
  assert.equal(await errorText(page, 'git-url-error'), 'not a GitHub repository\'s address: http://github.com/a/b');
  await page.fill('.dlg-overlay .git-url', '');
  await page.dialogButton('Initialize');
  await page.waitNoDialog();
  await page.waitConsole(/Repository made for 'fresh'; \.gitignore written\./);
  // every file new: marked N
  await page.waitFor(() => !!document.querySelector('#hier .git-mark'), [], { what: 'the marks' });
  assert.ok((await marks(page)).every((m) => / N New: not committed yet$/.test(m)), (await marks(page)).join(' | '));
  await page.menu('File', 'Push to GitHub');
  await page.waitConsole(/ERROR: the repository has no remote \(origin\)\nHint: Initialize Repository… with the GitHub repository's address sets it\./);
  // in Portuguese: the menu's labels, the dialog's
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  const pt = await gitItems();
  assert.ok(pt.includes('Git (controlo de versões)'), pt.join(', '));
  await page.menu('Ficheiro', 'Registar (Commit)…');
  await page.waitDialog('Registar (Commit)');
  assert.equal(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .form-grid label')].map((l) => l.textContent).join('|')), 'Mensagem:');
  await page.dialogButton('Cancelar');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(warnings(page), []);
});

// (#3534) Initialize Repository… on the Start page (after Open from Repository…) and in the Design tree's project and
// device menus (after Share Project Live…, before the Git submenu): shown for a project with no repository, the Start
// page's disabled with no project open, the File menu's dialog run from either; gone from both once the project is a
// repository; never Sign in with GitHub… (the browser edition's); in Portuguese. Both interfaces; no warnings.
const treeItems = async (page, row, item) => {
  await page.rightClick('#hier .row .lbl', { index: row });
  await page.waitForSelector('body > .menu-popup');
  const items = await page.eval(() => [...document.querySelectorAll('body > .menu-popup > .mi')].map((m) => `${m.querySelector('.lbl')?.textContent.trim() ?? m.textContent.trim()}${m.classList.contains('disabled') ? ' (disabled)' : ''}`));
  if (item) await page.click('body > .menu-popup > .mi', { text: item }); else await page.closeMenus();
  return items;
};
const startCommands = (page) => page.eval(() => [...document.querySelector('#start-page .start-box').querySelectorAll('.entry')]
  .filter((e) => e.getClientRects().length).map((e) => `${e.textContent}${getComputedStyle(e.querySelector('a')).pointerEvents === 'none' ? ' (disabled)' : ''}`));
uiTest('#3534 Initialize Repository… on the Start page and in the Design tree\'s project and device menus, for a project with no repository; Portuguese', E, async (page) => {
  await page.eval(() => window.SilinxApp.closeProject?.());
  await page.leftTab('start');
  await page.waitFor(() => [...document.querySelectorAll('#start-page .entry a')].some((a) => a.textContent === 'Open from Repository…'), [], { what: 'the Start page' });
  // no project open: disabled, as the exports
  let cmds = await startCommands(page);
  assert.deepEqual(cmds.slice(cmds.indexOf('Open from Repository…'), cmds.indexOf('Open from Repository…') + 2), ['Open from Repository…', 'Initialize Repository… (disabled)'], cmds.join(' | '));
  assert.ok(!cmds.some((c) => c.startsWith('Sign in with GitHub')), cmds.join(' | '));
  await page.eval(async () => { const { api } = await import('/js/api.js'); await api.createProject({ name: 'startgit', template: 'gates' }); });
  await page.openProject('startgit');
  await page.leftTab('start');
  await page.waitFor(() => document.getElementById('start-page').hasAttribute('data-project'), [], { what: 'the commands enabled' });
  cmds = await startCommands(page);
  assert.ok(cmds.includes('Initialize Repository…'), cmds.join(' | '));
  // the Start page's: the File menu's dialog
  await page.click('#start-page .entry a', { text: 'Initialize Repository…' });
  await page.waitDialog('Initialize Repository');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // the project's and the device's rows: after Share Project Live… (Share Project Copy… where none), before Git
  await page.leftTab('design');
  await page.waitFor(() => document.querySelectorAll('#hier .row .lbl').length >= 2, [], { what: 'the Design tree' });
  for (const row of [0, 1]) {
    const items = await treeItems(page, row);
    const at = items.indexOf('Initialize Repository…');
    assert.ok(at > 0 && /^(Share Project Live…|Share Project Copy…)/.test(items[at - 1]) && items[at + 1] === 'Git', `row ${row}: ${items.join(' | ')}`);
    assert.ok(!items.some((c) => c.startsWith('Sign in with GitHub')), items.join(' | '));
  }
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  for (const row of [0, 1]) assert.ok((await treeItems(page, row)).includes('Inicializar Repositório…'), `row ${row}`);
  await page.leftTab('start');
  await page.waitFor(() => [...document.querySelectorAll('#start-page .entry a')].some((a) => a.textContent === 'Inicializar Repositório…'), [], { what: 'the Start page in Portuguese' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // from the device's row: initialized; gone from the menus and the Start page
  await page.leftTab('design');
  await treeItems(page, 1, 'Initialize Repository…');
  await page.waitDialog('Initialize Repository');
  await page.dialogButton('Initialize');
  await page.waitNoDialog();
  await page.waitConsole(/Repository made for 'startgit'; \.gitignore written\./);
  await page.waitFor(() => !!window.SilinxApp.S.git, [], { what: 'the repository' });
  for (const row of [0, 1]) {
    const items = await treeItems(page, row);
    assert.ok(!items.includes('Initialize Repository…') && items.includes('Git'), `row ${row}: ${items.join(' | ')}`);
  }
  await page.leftTab('start');
  await page.waitFor(() => ![...document.querySelectorAll('#start-page .entry a')].some((a) => a.textContent === 'Initialize Repository…'), [], { what: 'the Start page\'s entry gone' });
  assert.ok((await startCommands(page)).includes('Open from Repository…'));
  assert.deepEqual(warnings(page), []);
});
