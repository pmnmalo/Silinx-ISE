// The Development menu of a development build (#707): the changes since the last release, by type (its issue's
// label: Features, Bug fixes, Other), each a window with its text and its issue on GitHub; all of them in one
// window; the build's commit; the Pen and Touch Test (devmenu-pointer.js, #1054); the handwritten input, a
// preview (#1098: on the open truth table or schematic; the expressions in the truth table editor, #2010). Its data is the build's (scripts/build-info.mjs
// devChanges, in core/version.js BUILD): a release, and the local server, have none and show no menu. The changes'
// text comes from changes/*.md: written as text (h), its **bold** and `code` as elements, never as HTML.
import { h, dialog } from './ui.js';
import { BUILD, REPOSITORY } from '/core/version.js';
import { pointerTestDialog } from './devmenu-pointer.js';
import { S } from './app.js';

const TYPES = [['feature', 'Features'], ['bugfix', 'Bug fixes'], ['other', 'Other']];
const HEADINGS = { feature: 'Features', bugfix: 'Bug fixes', other: 'Other changes' };
const issueUrl = n => `https://github.com/${REPOSITORY}/issues/${n}`;
const open = url => window.open(url, '_blank', 'noopener');

/** A fragment's text as nodes: **bold** and `code` as elements, the rest as text. */
function richText(text) {
  const out = [];
  for (const part of String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/)) {
    if (!part) continue;
    if (/^\*\*[^*]+\*\*$/.test(part)) out.push(h('b', {}, part.slice(2, -2)));
    else if (/^`[^`]+`$/.test(part)) out.push(h('code', {}, part.slice(1, -1)));
    else out.push(document.createTextNode(part));
  }
  return out;
}

function changeBody(c) {
  return h('div', { class: 'dev-change', 'data-no-i18n': '' },
    ...c.short.map(t => h('p', { class: 'dev-short' }, ...richText(t))),
    ...c.detail.map(t => h('p', { class: 'dev-detail' }, ...richText(t))));
}

/** One change: its text, and its issue on GitHub. */
async function changeDialog(c) {
  const r = await dialog({ title: `#${c.issue} ${c.title}`, body: changeBody(c), width: 620,
    buttons: [{ label: `Open Issue #${c.issue} on GitHub`, value: 'issue' }, { label: 'Close', value: null, primary: true }] });
  if (r === 'issue') open(issueUrl(c.issue));
}

/** Every change since the last release, by type. */
function changesDialog(build = BUILD) {
  const body = h('div', { class: 'dev-changes' });
  for (const [t] of TYPES) {
    const list = build.changes.filter(c => c.type === t);
    if (!list.length) continue;
    body.append(h('h4', {}, HEADINGS[t]),
      h('ul', { 'data-no-i18n': '' }, ...list.map(c => h('li', {}, h('a', { href: issueUrl(c.issue), target: '_blank', rel: 'noopener' }, `#${c.issue}`), ' ', ...richText(c.short[0] || c.detail[0])))));
  }
  return dialog({ title: build.since ? `Changes since ${build.since}` : 'Changes since the last release', body, width: 720, buttons: [{ label: 'Close', value: null, primary: true }] });
}

/** The menu's items, or null when the build has no changes list (a release, the local server). */
export function developmentMenu(build = BUILD) {
  if (!build?.changes) return null;
  return { label: 'Development', items: () => [
    ...TYPES.map(([t, label]) => {
      const list = build.changes.filter(c => c.type === t);
      return { label: `${label} (${list.length})`, disabled: !list.length,
        submenu: list.map(c => ({ label: `#${c.issue} ${c.title}`, title: `#${c.issue} ${c.title}`, raw: true, action: () => changeDialog(c) })) };
    }),
    '-',
    { label: build.since ? `All Changes since ${build.since}…` : 'All Changes since the Last Release…', action: () => changesDialog(build) },
    { label: `This Build on GitHub (commit ${build.commit})`, action: () => open(`https://github.com/${REPOSITORY}/commit/${build.commit}`) },
    '-',
    { label: 'Pen and Touch Test…', action: () => pointerTestDialog() },
    // the handwritten input, a preview (#1055, #1098): on the open truth table or schematic (the expressions in the
    // truth table editor's toolbar, #2010)
    '-',
    { label: 'Handwritten Truth Table…', disabled: !S.active?.ttEditor, action: () => S.active?.ttEditor?.handwrittenTable() },
    { label: 'Handwritten Schematic…', disabled: !S.active?.schEditor?.handwritten, action: () => S.active?.schEditor?.handwritten() },
  ] };
}
