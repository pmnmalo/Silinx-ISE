// The Development menu of a development build (#707): the changes since the last release in one window, by type
// (its issue's label: Features, Bug fixes, Other; no submenu by type, #3079); the build's commit; the Pen and Touch Test (devmenu-pointer.js, #1054); the handwritten input, a
// preview (#1098: on the open truth table or schematic; the expressions in the truth table editor, #2010). Its data is the build's (scripts/build-info.mjs
// devChanges, in core/version.js BUILD): a release, and the local server, have none and show no menu. The changes'
// text comes from changes/*.md: written as text (h), its **bold** and `code` as elements, never as HTML.
import { h, dialog } from './ui.js';
import { BUILD, REPOSITORY } from '/core/version.js';
import { pointerTestDialog } from './devmenu-pointer.js';
import { S } from './app.js';

const TYPES = ['feature', 'bugfix', 'other'];
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

/** Every change since the last release, by type. */
function changesDialog(build = BUILD) {
  const body = h('div', { class: 'dev-changes' });
  for (const t of TYPES) {
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
    { label: build.since ? `All Changes since ${build.since}…` : 'All Changes since the Last Release…', action: () => changesDialog(build) },
    { label: `This Build on GitHub (commit ${build.commit})`, action: () => open(`https://github.com/${REPOSITORY}/commit/${build.commit}`) },
    '-',
    { label: 'Pen and Touch Test…', action: () => pointerTestDialog() },
    // the handwritten input, a preview (#1055, #1098): on the open truth table or schematic (the expressions in the
    // truth table editor's toolbar, #2010)
    '-',
    { label: 'Handwritten Boolean Algebra…', disabled: !S.active?.ttEditor, action: () => S.active?.ttEditor?.handwrittenTable() },
    { label: 'Handwritten Schematic…', disabled: !S.active?.schEditor?.handwritten, action: () => S.active?.schEditor?.handwritten() },
  ] };
}
