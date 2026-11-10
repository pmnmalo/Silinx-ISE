// Git in the interface of the server editions (#3195, server/git.js; the browser edition's is phase 2, #3196): File ▸
// Open from Repository…, File ▸ Git ▸ (Commit…, Push to GitHub, Pull from GitHub, Initialize Repository…), the same in the Design pane's
// project menu (the Silinx interface has no File menu), and the Design pane's marks of the files changed or new since
// the last commit (S.git, refreshed when the project opens, after its files are written and after each command).
// Every message goes to the console: git's line as an ERROR, its hint after it (docs/UI-GUIDELINES.md).
import { api } from './api.js';
import { h, dialog, toast } from './ui.js';
import { log } from './console.js';
import { S } from './app.js';
import { openProject, reloadProject, renderStartPage } from './project.js';
import { saveAll } from './processes.js';
import { renderHierarchy } from './design.js';
import { field } from './wizards.js';
import { commitText, pushText, pullText, cloneText, initText } from '/core/git-messages.js';
import { checkUrl, nameFromRepo } from '/core/github-url.js';

// ------------------------------------------------------------------ git on this server
let enabled = null;
/** Whether this edition has git: a server whose git is not turned off (SILINX_GIT=off). */
export async function gitAvailable() {
  if (api.standalone) return false;
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
export function scheduleGitStatus(ms = 400) {
  if (api.standalone || enabled === false || !S.project) return;
  clearTimeout(timer);
  timer = setTimeout(() => refreshGitStatus(), ms);
}
/** The project's status read again: S.git ({ files, byPath, branch… } or null), the Design pane's marks drawn again. A
 *  read that a later one overtakes gives the later one's answer (Commit… asks while a save's read is in flight). */
export function refreshGitStatus() {
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
  const before = JSON.stringify(S.git?.files || []);
  S.git = s?.repository ? { ...s, byPath: new Map(s.files.map(f => [f.path, f.state])) } : null;
  if (JSON.stringify(S.git?.files || []) !== before) renderHierarchy();
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
  if (hooked || api.standalone) return;
  hooked = true;
  for (const k of ['writeFile', 'saveProject', 'renameFile', 'deleteFile', 'project']) {
    const f = api[k];
    api[k] = async (...a) => { const r = await f(...a); scheduleGitStatus(); return r; };
  }
  addEventListener('silinx:project-opened', () => refreshGitStatus());
  addEventListener('silinx:project-closed', () => { S.git = null; });
  // (git's presence asked once: the Start page then has Open from Repository…; a project reopened at start-up, which
  // says no project-opened, gets its status)
  gitAvailable().then(on => { if (!on) return; renderStartPage(); if (S.project) refreshGitStatus(); });
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
      h('div', { class: 'hint', style: { marginTop: '10px' } }, 'git signs in to GitHub with its own credentials (GitHub\'s command line, Git Credential Manager or an SSH key): Silinx never asks for a password or a token.')),
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
export async function commitDialog() {
  if (!S.project) return null;
  await saveAll();
  const s = await refreshGitStatus();
  if (!s) { log(`ERROR: the project '${S.project.name}' is not in a git repository`, 'err'); log('Hint: Initialize Repository… makes one, or Open from Repository… opens a project from GitHub.', 'info'); return null; }
  const STATE = { modified: 'changed', new: 'new', deleted: 'deleted', conflict: 'in conflict' };
  const msg = h('textarea', { class: 'git-message', rows: 4, style: { width: '100%' } });
  const list = h('ul', { class: 'git-changes' }, ...s.files.map(f => h('li', { 'data-state': f.state }, h('span', { 'data-no-i18n': '' }, f.path), ` (${STATE[f.state]})`)));
  const err = fieldError('git-message-error');
  msg.addEventListener('input', () => { err.textContent = ''; });
  const r = await dialog({
    title: 'Commit', width: 520,
    body: h('div', {},
      h('div', { class: 'form-grid' }, ...field('Message:', msg), err),
      s.files.length ? h('div', {}, h('label', {}, `${s.files.length} change(s) on ${s.branch || 'no branch'}:`), list) : h('div', { class: 'hint' }, 'No change since the last commit.')),
    buttons: [{ label: 'Commit', primary: true, disabled: !s.files.length, value: () => msg.value,
      validate: () => { if (msg.value.trim()) return true; err.textContent = 'Say in a few words what changed.'; return false; } },
    { label: 'Cancel', value: null }],
  });
  if (r === null || r === undefined) return null;
  try {
    const c = await api.gitCommit(S.project.name, r);
    log(commitText(c), 'ok');
    toast('Committed', 'ok');
    return c;
  } catch (e) { logGitError(e); return null; } finally { await refreshGitStatus(); }
}

/** File ▸ Git ▸ Push. */
export async function gitPush() {
  if (!S.project) return null;
  try { const p = await api.gitPush(S.project.name); log(pushText(p), 'ok'); return p; } catch (e) { logGitError(e); return null; } finally { await refreshGitStatus(); }
}

/** File ▸ Git ▸ Pull: GitHub's commits merged in; the project read again (its open documents, by the watcher). */
export async function gitPull() {
  if (!S.project) return null;
  await saveAll();
  const name = S.project.name;
  try {
    const p = await api.gitPull(name);
    log(pullText(p), 'ok');
    if (!p.upToDate && S.project?.name === name) await reloadProject();
    return p;
  } catch (e) {
    logGitError(e);
    return null;
  } finally { await refreshGitStatus(); }
}

/** File ▸ Git ▸ Initialize Repository…: git init, Silinx's .gitignore, optionally the GitHub repository (origin). */
export async function initDialog() {
  if (!S.project) return null;
  const url = h('input', { type: 'text', class: 'git-url', placeholder: 'https://github.com/owner/repository', style: { width: '100%' } });
  const err = fieldError('git-url-error');
  url.addEventListener('input', () => { err.textContent = ''; });
  const r = await dialog({
    title: 'Initialize Repository', width: 520,
    body: h('div', {}, h('div', { class: 'form-grid' }, ...field('GitHub repository (optional: where Push sends the commits):', url), err),
      h('div', { class: 'hint', style: { marginTop: '10px' } }, 'A .gitignore leaves build/ and the tools\' outputs out of the commits.')),
    buttons: [{ label: 'Initialize', primary: true, value: () => url.value.trim(),
      validate: () => { if (!url.value.trim()) return true; try { checkUrl(url.value); return true; } catch (e) { err.textContent = e.message; return false; } } },
    { label: 'Cancel', value: null }],
  });
  if (r === null) return null;
  try { const i = await api.gitInit(S.project.name, r || null); log(initText(S.project.name, i), 'ok'); return i; }
  catch (e) { logGitError(e); return null; } finally { await refreshGitStatus(); }
}

/** The Git submenu (File ▸ Git ▸, the Design pane's project menu): its commands, for an open project. */
export const gitMenuItems = () => [
  { label: 'Commit…', action: () => commitDialog(), disabled: !S.git },
  { label: 'Push to GitHub', action: () => gitPush(), disabled: !S.git },
  { label: 'Pull from GitHub', action: () => gitPull(), disabled: !S.git },
  '-',
  { label: 'Initialize Repository…', action: () => initDialog() },
];
