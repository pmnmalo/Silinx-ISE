// Git in the interface (#3195: the server editions, through the system's git, server/git.js; #3196: the browser edition,
// through GitHub's REST API, web/js/git-browser.js, where a commit is pushed at once and the sign-in is Silinx's): File ▸
// Open from Repository…, File ▸ Git ▸ (Commit…, Push to GitHub, Pull from GitHub, History… (web/js/git-history.js), GitHub
// Checks (#3194: what GitHub's workflows said of the last push),
// Initialize Repository…), the same in the Design pane's
// project menu (the Silinx interface has no File menu), and the Design pane's marks of the files changed or new since
// the last commit (S.git, refreshed when the project opens, after its files are written and after each command).
// Every message goes to the console: git's line as an ERROR, its hint after it (docs/UI-GUIDELINES.md).
import { api } from './api.js';
import { h, dialog, toast } from './ui.js';
import { log } from './console.js';
import { S } from './app.js';
import { openProject, reloadProject, renderStartPage } from './project.js';
import { renderTeachingPage } from './teaching-page.js';
import { saveAll } from './processes.js';
import { renderHierarchy } from './design.js';
import { field } from './wizards.js';
import { applyChanges } from './project-watch.js';
import { commitText, pushText, pullText, cloneText, initText } from '/core/git-messages.js';
import { checksLines } from '/core/github-checks.js';
import { checkUrl, nameFromRepo } from '/core/github-url.js';

// ------------------------------------------------------------------ git on this server
let enabled = null;
/** Whether this edition has git: the browser edition (GitHub's API), a server whose git is not turned off (SILINX_GIT=off). */
async function gitAvailable() {
  if (enabled === null) enabled = await api.gitEnabled().then(r => !!r.enabled, () => false);
  return enabled;
}
/** The last answer of gitAvailable (the menus are drawn synchronously; the first project's opening asks). */
export const hasGit = () => enabled === true;

// a failure, in the console: git's line, then its hint
export function logGitError(e) {
  log(`ERROR: ${e.message}`, 'err');
  if (e.hint) log(`Hint: ${e.hint}`, 'info');
}

// ------------------------------------------------------------------ the status and the Design pane's marks
let timer = null, seq = 0, newest = null;
/** The project's status read again soon (several writes in a row: once). */
function scheduleGitStatus(ms = 400) {
  if (enabled === false || !S.project) return;
  clearTimeout(timer);
  timer = setTimeout(() => refreshGitStatus(), ms);
}
/** The project's status read again: S.git ({ files, byPath, branch… } or null), the Design pane's marks drawn again. A
 *  read that a later one overtakes gives the later one's answer (Commit… asks while a save's read is in flight). */
function refreshGitStatus() {
  const n = ++seq;
  const run = readStatus(n).then(r => (n === seq ? r : newest));
  newest = run;
  return run;
}
async function readStatus(n) {
  if (!await gitAvailable() || !S.project) { S.git = null; return null; }
  const name = S.project.name;
  let s;
  try { s = await api.gitStatus(name); } catch { s = null; }
  if (n !== seq || S.project?.name !== name) return null;   // (a later read, or another project: not this answer)
  const before = JSON.stringify(S.git?.files || []), had = !!S.git;
  S.git = s?.repository ? { ...s, byPath: new Map(s.files.map(f => [f.path, f.state])) } : null;
  if (JSON.stringify(S.git?.files || []) !== before) renderHierarchy();
  if (!!S.git !== had) renderStartPage();   // (its Initialize Repository…, a project with no repository's, #3534)
  return S.git;
}

const MARKS = {
  conflict: { text: 'C', title: 'In conflict' },
  new: { text: 'N', title: 'New: not committed yet' },
  modified: { text: 'M', title: 'Changed since the last commit' },
};
/** The Design pane's mark of a row whose files are these: the strongest of their states (conflict, new, changed). */
export function gitMark(paths) {
  if (!S.git) return null;
  const states = paths.filter(Boolean).map(p => S.git.byPath.get(p));
  const st = ['conflict', 'new', 'modified'].find(k => states.includes(k));
  return st ? { ...MARKS[st], state: st } : null;
}

// the status after every write of the project's files (the editors' saves, a wizard's, a rename), and after a reload
// (what another process changed)
let hooked = false;
export function hookGitStatus() {
  if (hooked) return;
  hooked = true;
  for (const k of ['writeFile', 'saveProject', 'renameFile', 'deleteFile', 'project']) {
    const f = api[k];
    api[k] = async (...a) => { const r = await f(...a); scheduleGitStatus(); return r; };
  }
  addEventListener('silinx:project-opened', () => refreshGitStatus());
  addEventListener('silinx:project-closed', () => { S.git = null; });
  // (git's presence asked once: the Start page and the Teaching page then have Open from Repository…; a project reopened at start-up, which
  // says no project-opened, gets its status)
  gitAvailable().then(on => { if (!on) return; renderStartPage(); renderTeachingPage(); if (S.project) refreshGitStatus(); });
}

// ------------------------------------------------------------------ the commands
// a field's error, beside it (the dialog stays open)
const fieldError = cls => h('div', { class: `hint git-error ${cls}`, style: { gridColumn: '1 / -1', minHeight: '16px' } });

/** File ▸ Open from Repository…: a GitHub repository (a Classroom assignment's) cloned into the workspace, opened. */
export async function openFromRepositoryDialog() {
  const url = h('input', { type: 'text', class: 'git-url', placeholder: 'https://github.com/owner/repository', style: { width: '100%' } });
  const name = h('input', { type: 'text', class: 'git-name', style: { width: '100%' } });
  const err = fieldError('git-url-error');
  // (the project's name follows the repository's until the user types one)
  let named = false;
  name.addEventListener('input', () => { named = true; });
  url.addEventListener('input', () => {
    err.textContent = '';
    if (!named) { try { name.value = nameFromRepo(checkUrl(url.value).repo); } catch { name.value = ''; } }
  });
  const r = await dialog({
    title: 'Open from Repository', width: 520,
    body: h('div', {},
      h('div', { class: 'form-grid' }, ...field('GitHub repository (a Classroom assignment\'s too):', url), err, ...field('Project name:', name)),
      h('div', { class: 'hint', style: { marginTop: '10px' } }, api.standalone
        ? 'A public repository opens as it is; a private one (a Classroom assignment\'s) after Sign in with GitHub… with your private repositories included.'
        : 'git signs in to GitHub with its own credentials (GitHub\'s command line, Git Credential Manager or an SSH key): Silinx never asks for a password or a token.')),
    buttons: [{ label: 'Open', primary: true, value: () => ({ url: url.value.trim(), name: name.value.trim() }),
      validate: () => { try { checkUrl(url.value); return true; } catch (e) { err.textContent = e.message; return false; } } },
    { label: 'Cancel', value: null }],
  });
  if (!r) return null;
  log(`Cloning ${r.url}…`, 'info');
  let c;
  try { c = await api.gitClone(r.url, r.name || null); } catch (e) { logGitError(e); return null; }
  log(cloneText(c), 'ok');
  for (const w of c.warnings || []) log(`WARNING: ${w}`, 'warn');
  await openProject(c.project);
  return c.project;
}

/** File ▸ Git ▸ Commit…: the project's changes with a message. */
async function commitDialog() {
  if (!S.project) return null;
  await saveAll();
  const s = await refreshGitStatus();
  if (!s) { log(`ERROR: the project '${S.project.name}' is not in a git repository`, 'err'); log('Hint: Initialize Repository… makes one, or Open from Repository… opens a project from GitHub.', 'info'); return null; }
  const STATE = { modified: 'changed', new: 'new', deleted: 'deleted', conflict: 'in conflict' };
  const msg = h('textarea', { class: 'git-message', rows: 4, style: { width: '100%' } });
  // (Compare: the file against the last commit, #3197; the dialog closed for it)
  let compare = null, closeIt = null;
  const list = h('ul', { class: 'git-changes' }, ...s.files.map(f => h('li', { 'data-state': f.state }, h('span', { 'data-no-i18n': '' }, f.path), ` (${STATE[f.state]}) `,
    h('a', { href: '#', class: 'git-compare', 'data-path': f.path, onclick: e => { e.preventDefault(); compare = f.path; closeIt?.(); } }, 'Compare'))));
  const err = fieldError('git-message-error');
  msg.addEventListener('input', () => { err.textContent = ''; });
  const r = await dialog({
    title: api.standalone ? 'Commit and Push' : 'Commit', width: 520,
    body: h('div', {},
      h('div', { class: 'form-grid' }, ...field('Message:', msg), err),
      s.files.length ? h('div', {}, h('label', {}, `${s.files.length} change(s) on ${s.branch || 'no branch'}:`), list) : h('div', { class: 'hint' }, 'No change since the last commit.')),
    buttons: [{ label: api.standalone ? 'Commit and Push' : 'Commit', primary: true, disabled: !s.files.length, value: () => msg.value,
      validate: () => { if (msg.value.trim()) return true; err.textContent = 'Say in a few words what changed.'; return false; } },
    { label: 'Cancel', value: null }],
    onOpen: ({ close }) => { closeIt = () => close(null); },
  });
  if (compare) return import('./git-history.js').then(m => m.compareNow(compare));
  if (r === null || r === undefined) return null;
  try {
    const c = await api.gitCommit(S.project.name, r);
    log(commitText(c), 'ok');
    if (c.pushed) { log(pushText(c), 'ok'); log(CHECKS_HINT, 'info'); }   // (the browser edition's: pushed at once)
    toast('Committed', 'ok');
    return c;
  } catch (e) { logGitError(e); return null; } finally { await refreshGitStatus(); }
}

// (#3194) a push starts the repository's workflows on GitHub: a Classroom assignment's runs its visible tests
const CHECKS_HINT = 'GitHub runs the repository\'s checks on the push (a Classroom assignment\'s visible tests): Git ▸ GitHub Checks says their result.';

/** File ▸ Git ▸ GitHub Checks (#3194): what GitHub's workflows said of the last pushed commit, in the console (a
 *  Classroom assignment's: each visible test's verdict). */
async function gitChecks() {
  if (!S.project) return null;
  log(`GitHub's checks of '${S.project.name}'…`, 'info');
  try {
    const c = await api.gitChecks(S.project.name);
    for (const l of checksLines(c)) log(l.level === 'error' ? `ERROR: ${l.text}` : l.level === 'warning' ? `WARNING: ${l.text}` : l.text, l.level === 'error' ? 'err' : l.level === 'warning' ? 'warn' : c.conclusion === 'success' ? 'ok' : 'info');
    return c;
  } catch (e) { logGitError(e); return null; }
}

/** File ▸ Git ▸ Push. */
async function gitPush() {
  if (!S.project) return null;
  try { const p = await api.gitPush(S.project.name); log(pushText(p), 'ok'); if (p.pushed) log(CHECKS_HINT, 'info'); return p; } catch (e) { logGitError(e); return null; } finally { await refreshGitStatus(); }
}

/** File ▸ Git ▸ Pull: GitHub's commits merged in; the project read again (its open documents, by the watcher). A
 *  drawing's objects changed on both sides (#3197): Mine or Theirs asked for each (web/js/git-resolve-dialog.js), then
 *  pulled again with the choices. */
async function gitPull({ resolve = null } = {}) {
  if (!S.project) return null;
  await saveAll();
  const name = S.project.name;
  try {
    const p = await api.gitPull(name, resolve ? { resolve } : {});
    log(pullText(p), 'ok');
    for (const f of p.resolved || []) log(`${f}: merged by its objects, its HDL made again.`, 'info');
    for (const w of p.warnings || []) log(`WARNING: ${w}`, 'warn');
    // (the server's watcher tells the page what changed; the browser edition has none: its open documents told here)
    if (!p.upToDate && S.project?.name === name) {
      if (api.standalone) await applyChanges({ project: name, changes: p.files.map(f => ({ path: f, kind: S.diskTree?.includes(f) ? 'changed' : 'added' })) });
      else await reloadProject();
    }
    return p;
  } catch (e) {
    logGitError(e);
    // (only drawings' objects in conflict: the choices asked, then the pull again)
    if (e.drawings?.length && /choose mine or theirs/.test(e.hint || '') && S.project?.name === name) {
      const choices = await (await import('./git-resolve-dialog.js')).resolveDialog(e.drawings);
      if (choices) return gitPull({ resolve: { ...(resolve || {}), ...choices } });
    }
    return null;
  } finally { await refreshGitStatus(); }
}

/** File ▸ Git ▸ Initialize Repository…: git init, Silinx's .gitignore, optionally the GitHub repository (origin). */
async function initDialog() {
  if (!S.project) return null;
  const url = h('input', { type: 'text', class: 'git-url', placeholder: 'https://github.com/owner/repository', style: { width: '100%' } });
  const err = fieldError('git-url-error');
  url.addEventListener('input', () => { err.textContent = ''; });
  const r = await dialog({
    title: 'Initialize Repository', width: 520,
    body: h('div', {}, h('div', { class: 'form-grid' }, ...field(api.standalone ? 'GitHub repository (an empty one: where the commits go):' : 'GitHub repository (optional: where Push sends the commits):', url), err),
      h('div', { class: 'hint', style: { marginTop: '10px' } }, 'A .gitignore leaves build/ and the tools\' outputs out of the commits.')),
    buttons: [{ label: 'Initialize', primary: true, value: () => url.value.trim(),
      validate: () => { if (!url.value.trim() && !api.standalone) return true; try { checkUrl(url.value); return true; } catch (e) { err.textContent = e.message; return false; } } },
    { label: 'Cancel', value: null }],
  });
  if (r === null) return null;
  try { const i = await api.gitInit(S.project.name, r || null); log(initText(S.project.name, i), 'ok'); return i; }
  catch (e) { logGitError(e); return null; } finally { await refreshGitStatus(); }
}

/** The Git submenu (File ▸ Git ▸, the Design pane's project menu): its commands, for an open project. The browser
 *  edition's commit is pushed at once (no Push), and it signs in to GitHub itself. */
export const gitMenuItems = () => [
  { label: api.standalone ? 'Commit and Push…' : 'Commit…', action: () => commitDialog(), disabled: !S.git },
  ...(api.standalone ? [] : [{ label: 'Push to GitHub', action: () => gitPush(), disabled: !S.git }]),
  { label: 'Pull from GitHub', action: () => gitPull(), disabled: !S.git },
  { label: 'History…', action: () => import('./git-history.js').then(m => m.historyDialog()), disabled: !S.git },
  { label: 'GitHub Checks', action: () => gitChecks(), disabled: !S.git },
  '-',
  { label: 'Initialize Repository…', action: () => initDialog() },
  ...(api.standalone ? ['-', api.githubSignedIn()
    ? { label: 'Sign out of GitHub', action: () => import('./git-signin.js').then(m => m.signOut()) }
    : { label: 'Sign in with GitHub…', action: () => signIn() }] : []),
];
// Sign in with GitHub…, the Start page drawn again after it (its entry gone once signed in, #3534)
const signIn = () => import('./git-signin.js').then(m => m.signInDialog()).then(ok => { if (ok) renderStartPage(); return ok; });

/** The git commands that start one (the Start page, the Design pane's project and device menus, #3534), where they
 *  apply: Initialize Repository… when the project has no repository (the open one's: on the Start page, disabled with
 *  none), Sign in with GitHub… in the browser edition when not signed in (Sign out of GitHub: the Git submenu's). The
 *  same functions as the Git submenu's; `project`: the command needs an open project. */
export const gitStartItems = () => (!hasGit() ? [] : [
  !S.git ? { label: 'Initialize Repository…', action: () => initDialog(), project: true } : null,
  api.standalone && !api.githubSignedIn() ? { label: 'Sign in with GitHub…', action: () => signIn() } : null,
].filter(Boolean));
