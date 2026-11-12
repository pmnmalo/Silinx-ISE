// File ▸ Short Links… (#3635): the user's short links (#3223, core/gist-link.js), their Silinx gists read from GitHub with
// the user's sign-in (the browser edition's) or the server's GH_TOKEN, newest first: when each was made, when it
// expires (#3629) or never, its gist on GitHub. This browser remembers the links it made (the project, the link: the key
// is only in the link, GitHub never has it), so that those rows show the project and can be copied again; a gist made
// elsewhere is said to be. Delete Selected and Delete Expired delete them on GitHub (only Silinx's gists of the account),
// each said in the console. The links are kept where the sign-in is (localStorage; at file:, this tab only: #3530).
import { api } from './api.js';
import { h, dialog } from './ui.js';
import { app } from './app.js';
import { writeClip } from './clipboard.js';
import { prefKey } from './prefs.js';

const KEY = prefKey('silinx.short-links');
const MAX = 200;
const area = () => { try { return globalThis.location?.protocol === 'file:' ? globalThis.sessionStorage : globalThis.localStorage; } catch { return null; } };
const day = iso => String(iso || '').slice(0, 10);

/** The links this browser made, newest first: [{ id, link, project, expires, made }]. */
function rememberedLinks() {
  try { const v = JSON.parse(area()?.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter(r => r && typeof r.id === 'string' && typeof r.link === 'string') : []; } catch { return []; }
}
const keep = list => { try { area()?.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* not kept */ } };
/** A short link made here, remembered (Share Project…'s, web/js/link-copy.js). */
export function rememberLink({ id, link, project, expires = null }) {
  keep([{ id, link, project, expires, made: new Date().toISOString() }, ...rememberedLinks().filter(r => r.id !== id)]);
}
/** Forget the links whose gists are gone: given the ids deleted, or the ids that are still there (`still`). */
function forgetLinks({ ids = null, still = null }) {
  keep(rememberedLinks().filter(r => (ids ? !ids.includes(r.id) : still.includes(r.id))));
}

const plural = n => `${n} short link${n === 1 ? '' : 's'}`;
const fail = e => app.log(`ERROR: Short Links: ${e.message}${e.hint ? `\nHint: ${e.hint}` : ''}`, 'err');

/** File ▸ Short Links…: the user's short links, listed, copied again and deleted. */
export async function shortLinksDialog() {
  if (!await api.gistAvailable()) {
    app.log(api.standalone ? 'ERROR: Short Links: your short links need your GitHub sign-in: Sign in with GitHub… first.' : 'ERROR: Short Links: your short links need a GitHub token on the Silinx server (GH_TOKEN): start the server with one.', 'err');
    if (api.standalone) { const { signInDialog } = await import('./git-signin.js'); if (!await signInDialog()) return null; } else return null;
  }
  let list;
  try { list = await api.gistList(); } catch (e) { fail(e); return null; }
  forgetLinks({ still: list.map(g => g.id) });
  const rows = h('tbody');
  const note = h('div', { class: 'hint short-links-count' });
  const picked = new Set();
  const draw = () => {
    const mine = new Map(rememberedLinks().map(r => [r.id, r]));
    note.textContent = list.length ? `${plural(list.length)} of your GitHub account, the newest first; ${list.filter(g => g.expired).length} expired.` : 'No short link in your GitHub account.';
    rows.replaceChildren(...list.map(g => {
      const r = mine.get(g.id);
      const box = h('input', { type: 'checkbox', checked: picked.has(g.id), onchange: e => { if (e.target.checked) picked.add(g.id); else picked.delete(g.id); } });
      return h('tr', { 'data-gist': g.id, class: g.expired ? 'expired' : '' },
        h('td', {}, box),
        r ? h('td', { class: 'short-project', 'data-no-i18n': '' }, r.project) : h('td', { class: 'short-project hint' }, 'Made in another browser'),
        h('td', { 'data-no-i18n': '' }, day(g.created || r?.made)),
        g.expires ? h('td', { class: 'short-expires' }, g.expired ? `Expired ${day(g.expires)}` : `Until ${day(g.expires)}`) : h('td', { class: 'short-expires' }, 'Never'),
        h('td', {},
          r ? h('a', { href: '#', class: 'short-copy', onclick: e => { e.preventDefault(); writeClip('text', r.link); app.log(`Short Links: the short link of '${r.project}' copied, ${r.link.length} characters.`, 'ok'); } }, 'Copy') : '',
          r ? ' ' : '',
          h('a', { href: g.url, class: 'short-gist', target: '_blank', rel: 'noopener noreferrer' }, 'Gist')));
    }));
  };
  draw();
  const remove = async which => {
    let deleted;
    try { deleted = await api.gistDelete(which); } catch (e) { fail(e); return false; }
    forgetLinks({ ids: deleted });
    for (const id of deleted) picked.delete(id);
    list = list.filter(g => !deleted.includes(g.id));
    app.log(`Short Links: ${plural(deleted.length)} deleted from your gists${which.expired ? ' (the expired ones)' : ''}.`, 'ok');
    draw();
    return false;   // (the dialog kept open, its list as it is now)
  };
  await dialog({
    title: 'Short Links', width: 620,
    body: h('div', {},
      h('div', { class: 'hint' }, 'Your short links: secret gists of your GitHub account, each the project encrypted. A link this browser made can be copied again; deleting one deletes its gist, and the link no longer opens.'),
      note,
      h('div', { style: { maxHeight: '360px', overflow: 'auto', marginTop: '8px' } },
        h('table', { class: 'grid short-links' },
          h('thead', {}, h('tr', {}, h('th'), h('th', {}, 'Project'), h('th', {}, 'Made'), h('th', {}, 'Expires'), h('th'))),
          rows))),
    buttons: [
      { label: 'Delete Selected', validate: () => (picked.size ? remove({ ids: [...picked] }) : false) },
      { label: 'Delete Expired', validate: () => (list.some(g => g.expired) ? remove({ expired: true }) : false) },
      { label: 'Close', primary: true, value: true },
    ],
  });
  return list;
}
