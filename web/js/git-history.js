// A project's history (#3195, server/git.js gitLog / gitShow): File ▸ History… lists its commits, newest first (the
// hash, the date, the author, the message, the files each changed); a file of a commit opens as it was then, read only,
// in a document of its own: the project's editor in its read-only mode, the notice at the right end of its toolbar
// (docs/UI-GUIDELINES.md, "A read-only view").
import { api } from './api.js';
import { h, dialog } from './ui.js';
import { S, findDoc, activateDoc, openDoc } from './app.js';
import { createEditor } from './editor.js';
import { logGitError } from './git.js';
import { shortCommit, stateWord } from '/core/git-messages.js';

const langOf = p => (/\.(v|vh|sv)$/i.test(p) ? 'verilog' : /\.vhdl?$/i.test(p) ? 'vhdl' : /\.(ucf|pcf|xdc)$/i.test(p) ? 'ucf' : /\.(c|cc|cpp|cxx|h|hpp)$/i.test(p) ? 'c' : 'text');
const day = iso => String(iso || '').slice(0, 10);

/** A file of the project as it was in a commit: read only, in a document of its own (one per commit and file). */
export async function openFileAt(commit, path, date = '') {
  const id = `git:${commit}:${path}`;
  const old = findDoc(id);
  if (old) { activateDoc(old); return old; }
  let r;
  try { r = await api.gitShow(S.project.name, commit, path); } catch (e) { logGitError(e); return null; }
  const name = `${path.split('/').pop()} @ ${shortCommit(commit)}`;
  const lang = langOf(path);
  return openDoc({
    id, title: name, tooltip: `${path}, as it was in the commit ${shortCommit(commit)}`, icon: ['vhdl', 'verilog', 'ucf'].includes(lang) ? lang : 'file',
    create(el, d) {
      const banner = h('span', { class: 'gen-banner read-only' }, `Read-only, as it was in the commit ${shortCommit(commit)}${date ? ` (${day(date)})` : ''}`);
      const host = h('div', { class: 'editor-host' });
      el.append(h('div', { class: 'editor-bar' }, h('span', { class: 'path', 'data-no-i18n': '' }, path), banner), host);
      d.editor = createEditor(host, { text: r.text, lang, path: name, readOnly: true });
      el.append(d.editor.status);   // (its status line, #2763)
      d.gitAt = { commit, path };
      return { destroy: () => d.editor.destroy() };
    },
  });
}

/** File ▸ History…: the project's commits; a file of one opens as it was. */
export async function historyDialog() {
  if (!S.project) return null;
  let log;
  try { log = await api.gitLog(S.project.name, 200); } catch (e) { logGitError(e); return null; }
  let picked = null, close = null;
  const fileItem = (c, f) => h('li', {},
    f.state === 'deleted'
      ? h('span', { 'data-no-i18n': '' }, f.path)
      : h('a', { href: '#', 'data-path': f.path, 'data-no-i18n': '', onclick: e => { e.preventDefault(); picked = { commit: c.commit, path: f.path, date: c.date }; close?.(); } }, f.path),
    ` (${stateWord(f.state)})`);
  const commitRow = c => h('li', { class: 'git-commit', 'data-commit': c.commit },
    h('div', { class: 'git-commit-head' }, h('code', { 'data-no-i18n': '' }, shortCommit(c.commit)), ` ${day(c.date)} `,
      h('span', { class: 'git-author', 'data-no-i18n': '' }, c.author), ': ', h('span', { class: 'git-subject', 'data-no-i18n': '' }, c.message)),
    h('ul', { class: 'git-files' }, ...c.files.map(f => fileItem(c, f))));
  await dialog({
    title: 'History', width: 640,
    body: h('div', {},
      h('div', { class: 'hint' }, log.length ? `${log.length} commit(s), the newest first: a file opens as it was then, read only.` : 'No commit yet.'),
      h('ul', { class: 'git-history', style: { maxHeight: '420px', overflow: 'auto', paddingLeft: '0', listStyle: 'none' } }, ...log.map(commitRow))),
    buttons: [{ label: 'Close', value: null, primary: true }],
    onOpen: ({ close: c }) => { close = () => c(null); },
  });
  return picked ? openFileAt(picked.commit, picked.path, picked.date) : null;
}
