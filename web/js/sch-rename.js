// Rename… of the schematic editor's right-click menu (#1546, sch-context.js) on a symbol, an I/O marker or a net name:
// a small dialog with its name; a name core/schname.js refuses is said in the dialog, which stays open.
// The new name is given as the Properties panel gives it (a net name: with the whole net connected by name, #734,
// asked first when another net has it, #689; an I/O marker: joining a net of its name, asked, takes its width,
// #2170), in one edit: one undo step, the HDL generated again.
import { dialog } from './ui.js';
import { h } from './dom.js';
import { renameError } from '/core/schname.js';
import { setMarkerWidth } from '/core/schmarker.js';
import { KEYS } from './sch-editor.js';

export const TITLES = { sym: 'Rename Instance', port: 'Rename I/O Marker', label: 'Rename Net Name' };

/** { rename } of mountSchEditor (doc(), nl(): its current values). */
export function mountSchRename(ctx) {
  const { doc, nl, edit, joinByName, joinMarker, renameLabel } = ctx;

  const nameOf = (kind, o) => (kind === 'label' ? o.net : o.name);
  const find = it => doc()[KEYS[it.kind]]?.find(o => o.id === it.id);
  async function rename(it) {
    const o = find(it);
    if (!o) return;
    const old = nameOf(it.kind, o);
    const input = h('input', { type: 'text', value: old, spellcheck: 'false', style: { width: '100%' }, 'data-no-i18n': '' });
    const err = h('div', { class: 'hint se-rename-err', style: { color: 'var(--error-fg)', minHeight: '16px' } });
    const check = () => { const v = input.value.trim(); return v === old ? null : renameError(doc(), it.kind, it.id, v); };
    input.addEventListener('input', () => { err.textContent = check() || ''; });
    const ok = await dialog({
      title: TITLES[it.kind], width: 380, className: 'se-rename-dlg',
      body: h('div', {}, h('div', { class: 'form-grid' }, h('label', { text: 'New name:' }), input), err),
      buttons: [{ label: 'Rename', primary: true, value: true, validate: () => { const m = check(); err.textContent = m || ''; return !m; } }, { label: 'Cancel', value: null }],
      onOpen: () => setTimeout(() => input.select(), 0),
    });
    const name = input.value.trim();
    if (!ok || name === old) return;
    if (it.kind === 'label') {
      const l = find(it);
      if (!l || !await joinByName(name, nl()?.labelNet.get(l.id))) return;
      edit(() => renameLabel(find(it), name));
      return;
    }
    if (it.kind === 'port') {
      // the name of another net (#2170): joined, the marker taking its width, or not renamed
      const j = await joinMarker(name, nl()?.nets.find(n => n.ports.includes(it.id)));
      if (j === false) return;
      edit(() => { const p = find(it); p.name = name; if (j) setMarkerWidth(p, j.width); });
      return;
    }
    edit(() => { find(it).name = name; });
  }

  return { rename };
}
