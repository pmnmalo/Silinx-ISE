// UI: the drawings' diffs and conflicts (#3197, web/js/drawing-diff-view.js, web/js/git-resolve-dialog.js) in the server
// editions, against local bare repositories (test/ui/serve.js maps https://github.com/test/<repo> to one), the traffic
// example's state diagram. Commit…'s Compare: the drawing against the last commit, side by side in its editor's
// read-only mode, its moved and changed objects marked on both sides, the counts in the newer one's notice. A pull whose
// same object of the drawing changed on both sides: the ERROR in the console, then Resolve Conflicts (a choice missing
// said beside), Theirs chosen, pulled, the drawing merged, its HDL made again. History…'s Compare: the HDL file by its
// lines. In Portuguese. Both interfaces; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { setupUi, uiTest, readWs, ROOT } from './harness.js';

let env, tmp, remotes;
const FSM = 'src/traffic.fsm.json';
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
function bare(name) {
  const dir = path.join(remotes, `${name}.git`);
  fs.mkdirSync(dir, { recursive: true });
  sh(dir, 'init', '--quiet', '--bare');
  sh(dir, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  const seed = path.join(tmp, 'seed', name);
  fs.cpSync(path.join(ROOT, 'examples', 'traffic'), seed, { recursive: true });
  sh(seed, 'init', '--quiet');
  sh(seed, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  sh(seed, 'add', '-A');
  sh(seed, 'commit', '--quiet', '-m', 'Starter');
  sh(seed, 'push', '--quiet', dir, 'main');
  return dir;
}
// another author's change of the drawing, pushed
function theirs(name, fn) {
  const dir = path.join(tmp, 'theirs', name);
  if (!fs.existsSync(dir)) sh(tmp, 'clone', '--quiet', path.join(remotes, `${name}.git`), dir);
  sh(dir, 'pull', '--quiet', '--no-rebase');
  const f = path.join(dir, FSM);
  const m = JSON.parse(fs.readFileSync(f, 'utf8'));
  fn(m);
  fs.writeFileSync(f, `${JSON.stringify(m, null, 2)}\n`);
  sh(dir, 'commit', '--quiet', '-am', 'Theirs: t1');
  sh(dir, 'push', '--quiet');
}

before(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-ui-git-compare-')));
  remotes = path.join(tmp, 'remotes');
  fs.writeFileSync(path.join(tmp, 'gitconfig'), '[user]\n\tname = Ana Aluna\n\temail = ana@example.com\n[init]\n\tdefaultBranch = main\n');
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
const edit = async (page, fn) => {
  const m = JSON.parse(await readWs(env, page.project, FSM));
  fn(m);
  await page.eval(async (p, t) => { const { api } = await import('/js/api.js'); await api.writeFile(window.Silinx.project.name, p, t); }, FSM, `${JSON.stringify(m, null, 2)}\n`);
};
const t = (m, id) => m.transitions.find((x) => x.id === id);
const open = async (page, name) => {
  bare(name);
  page.project = name;
  await page.menu('File', 'Open from Repository…');
  await page.waitDialog('Open from Repository');
  await page.fill('.dlg-overlay .git-url', `https://github.com/test/${name}`);
  await page.dialogButton('Open');
  await page.waitNoDialog();
  await page.waitFor((n) => window.Silinx.project?.name === n && document.querySelector('#hier .row'), [name], { what: `${name} open` });
};
// the compare document open: its panes' notices, what its marks select
const compareDoc = (page) => page.waitFor(() => {
  const d = window.SilinxApp.S.docs.find((x) => x.compare);
  const el = d && document.querySelector('.diff-split');
  if (!el || el.querySelectorAll('.diff-pane .gen-banner').length < 2) return null;
  return { id: d.id, banners: [...el.querySelectorAll('.diff-pane .gen-banner')].map((b) => b.textContent),
    marked: ['before', 'after'].map((side) => [...el.querySelectorAll(`.diff-${side} [data-state], .diff-${side} [data-trans]`)].filter((e) => getComputedStyle(e).filter !== 'none').map((e) => e.dataset.state || e.dataset.trans).sort()),
    atEnd: [...el.querySelectorAll('.diff-pane .gen-banner')].every((b) => b === b.parentElement.lastElementChild || b.nextElementSibling?.classList.contains('tb-more')) };
}, [], { what: 'the compare document', timeout: 15000 });

uiTest('#3197 Compare (a drawing by its objects, an HDL file by its lines) and a pull\'s conflict in a drawing resolved object by object', E, async (page) => {
  await open(page, 'lights');
  // Commit…'s Compare: the drawing against the last commit
  await edit(page, (m) => { m.states[0].x += 40; t(m, 't2').cond = 'night and req'; });
  const lamps = await readWs(env, 'lights', 'src/lamps.vhd');
  await page.eval(async (x) => { const { api } = await import('/js/api.js'); await api.writeFile(window.Silinx.project.name, 'src/lamps.vhd', x); }, `${lamps}-- night\n`);
  await page.waitFor(() => !!document.querySelector('#hier .git-mark'), [], { what: 'a mark' });
  await page.menu('File', 'Commit…');
  await page.waitDialog('Commit');
  await page.click(`.dlg-overlay .git-compare[data-path="${FSM}"]`);
  await page.waitNoDialog();
  const c = await compareDoc(page);
  assert.equal(c.banners[0].replace(/[0-9a-f]{7}/, 'X'), 'Read-only, as it was in the commit X');
  assert.equal(c.banners[1], 'Read-only, as it is now: 0 added, 0 removed, 2 moved or changed');
  assert.deepEqual(c.marked, [['s1', 't2'], ['s1', 't2']]);
  assert.ok(c.atEnd, 'the notices at the right end of the toolbars');
  // committed; another author changed the same transition: the pull stops, then the conflict is resolved
  await page.menu('File', 'Commit…');
  await page.waitDialog('Commit');
  await page.fill('.dlg-overlay .git-message', 'Night');
  await page.dialogButton('Commit');
  await page.waitNoDialog();
  await page.waitConsole(/Committed [0-9a-f]{7} on main: 3 file\(s\)\.\n {2}\.gitignore \(new\)\n {2}src\/lamps\.vhd \(changed\)\n {2}src\/traffic\.fsm\.json \(changed\)/);
  await page.menu('File', 'Push to GitHub');
  await page.waitConsole(/Pushed main to local\/lights\./);
  theirs('lights', (m) => { t(m, 't1').cond = 'night or req'; });
  await edit(page, (m) => { t(m, 't1').cond = 'not night'; });
  await page.waitFor(() => !!document.querySelector('#hier .git-mark'), [], { what: 'a mark' });
  await page.menu('File', 'Commit…');
  await page.waitDialog('Commit');
  await page.fill('.dlg-overlay .git-message', 'Mine: t1');
  await page.dialogButton('Commit');
  await page.waitNoDialog();
  await page.waitConsole(/Committed [0-9a-f]{7} on main: 1 file\(s\)\.\n {2}src\/traffic\.fsm\.json \(changed\)/);
  await page.menu('File', 'Pull from GitHub');
  await page.waitConsole(/ERROR: git pull: a conflict in src\/traffic\.fsm\.json: nothing was pulled, the project's files are as they were\nHint: The same objects of a drawing changed here and on GitHub: choose mine or theirs for each, then Pull again\./);
  await page.waitDialog('Resolve Conflicts');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .git-conflict')].map((l) => l.textContent.replace(/\s+/g, ' ').trim())),
    ['transitions t1 Mine (changed (cond)) Theirs (changed (cond))']);
  await page.dialogButton('Pull from GitHub');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .git-resolve-error').textContent), 'Choose Mine or Theirs for 1 object(s) more.');
  await page.click('.dlg-overlay .git-conflict[data-id="transitions/t1"] .git-theirs input');
  await page.dialogButton('Pull from GitHub');
  await page.waitNoDialog();
  await page.waitConsole(/Pulled into main: \d+ file\(s\) changed\.[\s\S]*\nsrc\/traffic\.fsm\.json: merged by its objects, its HDL made again\./);
  const m = JSON.parse(await readWs(env, 'lights', FSM));
  assert.equal(t(m, 't1').cond, 'night or req');
  assert.equal(t(m, 't2').cond, 'night and req');
  // History…'s Compare: the HDL file of the first commit after the starter, by its lines
  await page.menu('File', 'History…');
  await page.waitDialog('History');
  const night = await page.waitFor(() => [...document.querySelectorAll('.dlg-overlay .git-commit')].find((x) => x.querySelector('.git-subject').textContent === 'Night')?.dataset.commit, [], { what: 'the commit Night' });
  await page.click(`.dlg-overlay .git-commit[data-commit="${night}"] .git-compare[data-path="src/lamps.vhd"]`);
  await page.waitNoDialog();
  const text = await page.waitFor(() => { const tb = document.querySelector('.diff-text'); return tb && { rows: tb.querySelectorAll('tr').length, changed: tb.querySelectorAll('tr:not(.diff-same)').length, bar: document.querySelector('.diff-bar .diff-counts')?.textContent }; }, [], { what: 'the HDL compare' });
  assert.ok(text.rows > 20, JSON.stringify(text));
  assert.equal(text.changed, 1);
  assert.equal(text.bar, '1 line(s) changed');
  assert.deepEqual(warnings(page), []);
}, { timeout: 150000 });

uiTest('#3197 Compare and Resolve Conflicts in Portuguese', E, async (page) => {
  await open(page, 'luzes');
  await edit(page, (m) => { m.states[1].x += 30; });
  await page.waitFor(() => !!document.querySelector('#hier .git-mark'), [], { what: 'a mark' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.menu('Ficheiro', 'Registar (Commit)…');
  await page.waitDialog('Registar (Commit)');
  assert.equal(await page.eval((f) => document.querySelector(`.dlg-overlay .git-compare[data-path="${f}"]`).textContent, FSM), 'Comparar');
  await page.click(`.dlg-overlay .git-compare[data-path="${FSM}"]`);
  await page.waitNoDialog();
  const c = await compareDoc(page);
  assert.equal(c.banners[1], 'Só de leitura, como está agora: 0 acrescentado(s), 0 removido(s), 1 movido(s) ou alterado(s)');
  // the dialog of the conflicts, in Portuguese
  const shown = page.eval(async () => (await import('/js/git-resolve-dialog.js')).resolveDialog([{ path: 'src/traffic.fsm.json', kind: 'fsm', conflicts: [{ id: 'transitions/t1', label: 'transitions t1', mine: 'changed (cond)', theirs: 'changed (cond)' }] }]));
  await page.waitDialog('Resolver Conflitos');
  assert.deepEqual(await page.eval(() => [document.querySelector('.dlg-overlay .hint').textContent, [...document.querySelectorAll('.dlg-overlay .git-side')].map((l) => l.textContent.replace(/\s+/g, ' ').trim())]),
    ['1 objeto(s) alterado(s) aqui e no GitHub: escolha a versão que cada um mantém. O resto de cada desenho junta-se por si.', ['O meu (changed (cond))', 'O deles (changed (cond))']]);
  await page.dialogButton('Receber do GitHub (Pull)');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .git-resolve-error').textContent), 'Escolha O meu ou O deles para mais 1 objeto(s).');
  await page.dialogButton('Cancelar');
  assert.equal(await shown, null);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(warnings(page), []);
});
