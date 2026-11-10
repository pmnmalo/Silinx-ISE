// A pull's conflicts in drawings, resolved in the interface (#3197, core/git-resolve.js): Pull from GitHub stopped by a
// drawing whose same objects changed here and on GitHub (the error's `drawings`) asks, for each such object, "Mine" or
// "Theirs" (what each side did to it said beside), then pulls again with the choices; the result is checked as Check
// Drawing checks it (on the server, or in the browser's back end) and, when it is no valid drawing, said in the console
// with nothing pulled.
import { h, dialog } from './ui.js';

/** The choices for the drawings' conflicts ({ path: { id: 'mine' | 'theirs' } }), or null (Cancel). */
export async function resolveDialog(drawings) {
  const picks = {};
  const err = h('div', { class: 'hint git-error git-resolve-error', style: { minHeight: '16px' } });
  const row = (path, c) => {
    const name = `git-${path}-${c.id}`.replace(/[^\w-]/g, '_');
    const opt = (side, did) => h('label', { class: `git-side git-${side}` },
      h('input', { type: 'radio', name, value: side, onchange: () => { (picks[path] ||= {})[c.id] = side; err.textContent = ''; } }),
      ` ${side === 'mine' ? 'Mine' : 'Theirs'} `, h('span', { class: 'hint', 'data-no-i18n': '' }, `(${did})`));
    return h('li', { class: 'git-conflict', 'data-id': c.id }, h('span', { class: 'git-object', 'data-no-i18n': '' }, c.label), ' ', opt('mine', c.mine), ' ', opt('theirs', c.theirs));
  };
  const total = drawings.reduce((a, d) => a + d.conflicts.length, 0);
  const r = await dialog({
    title: 'Resolve Conflicts', width: 620,
    body: h('div', {},
      h('div', { class: 'hint' }, `${total} object(s) changed both here and on GitHub: choose whose version each one keeps. The rest of each drawing is merged by itself.`),
      ...drawings.map(d => h('div', { class: 'git-drawing', 'data-path': d.path },
        h('div', { style: { fontWeight: '600', margin: '8px 0 4px' }, 'data-no-i18n': '' }, d.path),
        h('ul', { class: 'git-conflicts', style: { paddingLeft: '16px', margin: 0 } }, ...d.conflicts.map(c => row(d.path, c))))),
      err),
    buttons: [{ label: 'Pull from GitHub', primary: true, value: () => picks,
      validate: () => { const left = drawings.reduce((a, d) => a + d.conflicts.filter(c => !picks[d.path]?.[c.id]).length, 0); if (!left) return true; err.textContent = `Choose Mine or Theirs for ${left} object(s) more.`; return false; } },
    { label: 'Cancel', value: null }],
  });
  return r || null;
}
