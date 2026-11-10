// Compare (#3197): a file between two versions, in a document of its own. A drawing (core/drawing-merge.js diffDrawings)
// side by side in its editor's read-only mode, the older on the left, the newer on the right: what was removed marked
// on the left, what was added on the right, what was moved or changed on both; its counts at the right of the toolbar
// (docs/UI-GUIDELINES.md). An HDL file (or any text) side by side by lines (core/text-diff.js sideBySide). It opens
// from History… (a file of a commit against the commit before) and from Commit… (a changed file against the last
// commit).
import { h } from './ui.js';
import { S, findDoc, activateDoc, openDoc } from './app.js';
import { diffDrawings, drawingKind } from '/core/drawing-merge.js';
import { sideBySide } from '/core/text-diff.js';

// the drawings whose editors have a read-only mode, and the attribute their objects carry in the drawing
const VIEWS = {
  sch: { mount: async (host, model, banner) => { const { mountSchEditor } = await import('./sch-editor.js'); const { schModules } = await import('./drawings.js'); const ed = mountSchEditor(host, { doc: model, modules: await schModules(), readOnly: true }); ed.setBanner?.(banner); return ed; }, attr: () => 'data-id' },
  fsm: { mount: async (host, model, banner) => (await import('./fsm-editor.js')).mountFsmEditor(host, { model, readOnly: true, banner }), attr: coll => (coll === 'transitions' ? 'data-trans' : 'data-state') },
  asm: { mount: async (host, model, banner) => (await import('./asm-editor.js')).mountAsmEditor(host, { model, readOnly: true, banner }), attr: coll => (coll === 'edges' ? 'data-edge' : 'data-node') },
};
const css = s => String(s).replace(/["\\]/g, '\\$&');

/** The marks of a drawing's diff, as a style sheet for the two panes (scoped by their classes): it holds through the
 *  editors' redrawing. */
export function diffStyle(kind, d) {
  const attr = VIEWS[kind]?.attr;
  if (!attr) return '';
  const sel = (side, list) => list.map(x => `.diff-${side} [${attr(x.coll)}="${css(x.key)}"]`).join(',\n');
  const rules = [];
  if (d.removed.length) rules.push(`${sel('before', d.removed)} { filter: drop-shadow(0 0 3px var(--diff-removed)) drop-shadow(0 0 1px var(--diff-removed)); }`);
  if (d.added.length) rules.push(`${sel('after', d.added)} { filter: drop-shadow(0 0 3px var(--diff-added)) drop-shadow(0 0 1px var(--diff-added)); }`);
  const both = [...d.changed, ...d.moved];
  if (both.length) rules.push(`${sel('before', both)},\n${sel('after', both)} { filter: drop-shadow(0 0 3px var(--diff-changed)) drop-shadow(0 0 1px var(--diff-changed)); }`);
  return rules.join('\n');
}

/** Compare a file between two versions: before / after { text, label } (text null: the file was not there). */
export async function openCompare(path, before, after) {
  const id = `diff:${path}:${before.label}:${after.label}`;
  const old = findDoc(id);
  if (old) { activateDoc(old); return old; }
  const kind = drawingKind(path);
  const name = path.split('/').pop();
  let a = null, b = null;
  if (kind && VIEWS[kind]) {
    try { a = before.text == null ? null : JSON.parse(before.text); b = after.text == null ? null : JSON.parse(after.text); } catch { a = b = null; }
  }
  const drawing = kind && VIEWS[kind] && (a || b) && !(before.text != null && !a) && !(after.text != null && !b);
  return openDoc({
    id, title: `${name} (compare)`, tooltip: `${path}: ${before.label} and ${after.label}`, icon: drawing ? ({ sch: 'schematic', fsm: 'fsm', asm: 'asm' })[kind] : 'file',
    create(el, d) {
      d.compare = { path, before: before.label, after: after.label };
      return drawing ? drawingPanes(el, d, kind, a, b, before, after) : textPanes(el, d, path, before, after);
    },
  });
}

function drawingPanes(el, d, kind, a, b, before, after) {
  const diff = diffDrawings(a || {}, b || {});
  d.diff = diff;
  // (no bar above the editors' toolbars: each one's notice at its right end, the newer's with the counts in their
  // colours, which are the marks')
  const counts = h('span', { class: 'diff-counts' },
    h('span', { class: 'diff-key-added' }, `${diff.added.length} added`), ', ', h('span', { class: 'diff-key-removed' }, `${diff.removed.length} removed`), ', ',
    h('span', { class: 'diff-key-changed' }, `${diff.moved.length + diff.changed.length + diff.props.length} moved or changed`));
  const pane = (side, model, v, extra = null) => {
    const host = h('div', { class: `doc-body diff-pane diff-${side}` });
    if (!model) host.append(h('div', { class: 'hint diff-none' }, side === 'before' ? 'Not there yet.' : 'Deleted.'));
    return { host, model, banner: h('span', { class: 'gen-banner read-only' }, `Read-only, ${v.label}`, ...(extra ? [': ', extra] : [])) };
  };
  const L = pane('before', a, before), R = pane('after', b, after, counts);
  el.append(h('style', {}, diffStyle(kind, diff)), h('div', { class: 'diff-split' }, L.host, R.host));
  const eds = [];
  for (const p of [L, R]) if (p.model) VIEWS[kind].mount(p.host, p.model, p.banner).then(ed => eds.push(ed));
  return { destroy: () => eds.forEach(ed => ed.destroy?.()) };
}

function textPanes(el, d, path, before, after) {
  const rows = sideBySide(before.text ?? '', after.text ?? '');
  const changed = rows.filter(r => r.op !== '=').length;
  const cell = (c, cls) => [h('td', { class: 'diff-ln' }, c ? String(c.line) : ''), h('td', { class: `diff-code ${cls}`, 'data-no-i18n': '' }, c ? c.text : '')];
  const table = h('table', { class: 'diff-text' }, h('tbody', {}, ...rows.map(r => h('tr', { class: `diff-row diff-${{ '=': 'same', '-': 'removed', '+': 'added', '~': 'changed' }[r.op]}` },
    ...cell(r.left, r.op === '=' ? '' : 'diff-old'), ...cell(r.right, r.op === '=' ? '' : 'diff-new')))));
  el.append(h('div', { class: 'editor-bar diff-bar' }, h('span', { class: 'path', 'data-no-i18n': '' }, path),
    h('span', { class: 'diff-labels', 'data-no-i18n': '' }, `${before.label} | ${after.label}`), h('span', { class: 'diff-counts' }, `${changed} line(s) changed`),
    h('span', { class: 'gen-banner read-only' }, 'Read-only')), h('div', { class: 'doc-body diff-scroll' }, table));
  d.textDiff = { changed };
  return {};
}

// (the project's: a compare of another project's is closed with it)
export const compareDocs = () => S.docs.filter(x => x.compare);
