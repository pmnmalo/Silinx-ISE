// The schematic editor's right-click menu (#1546, #1556) on a symbol, an I/O marker or a net name: a symbol's Symbol
// Info… (sch-info.js, #2953), the only item in a read-only schematic; Rename… (sch-rename.js) of the object clicked; Duplicate, Rotate, Mirror and Delete (sch-select.js, the toolbar's and the keys' commands) of
// the selection when the object is part of it, else of the object alone (then selected).
import { popupMenu } from './ui.js';
import { KEYS } from './sch-editor.js';
import { TITLES } from './sch-rename.js';
import { updateSymbol } from './sch-modsym.js';
import { symbolDiff } from '/core/schdoc.js';

/** { contextMenu } of mountSchEditor (doc(), live(), sel(), tool(): its current values). */
export function mountSchContext(ctx) {
  const {
    readOnly, doc, live, segSel, sel, tool, setSel, render, renderProps, rename, duplicateSel, rotateSel, mirrorSel, deleteSel,
    openInfo, symTarget, opts = {}, modules = () => ({}), edit, flash
  } = ctx;

  function contextMenu(e, it) {
    if (live() || tool() !== 'select' || !it || !TITLES[it.kind] || !doc()[KEYS[it.kind]]?.some(o => o.id === it.id)) return;
    // (a symbol's datasheet: the symbol clicked's, also when it is part of a larger selection)
    const info = it.kind === 'sym' && { label: 'Symbol Info…', shortcut: 'F1', action: () => openInfo(symTarget(it.id)) };
    if (readOnly) { if (info) popupMenu([info], e.clientX, e.clientY); return; }
    const key = `${it.kind}:${it.id}`;
    if (!sel().has(key)) setSel(it.kind === 'wire' ? segSel.branch(it.id) : new Set([key]));
    render(); renderProps();
    // (what applies to the selection: Duplicate, Rotate and Mirror to its symbols and I/O markers)
    const parts = [...sel()].some(k => k.startsWith('sym:') || k.startsWith('port:'));
    // (a module's instance: its module's symbol in the Symbol Editor, #3755)
    const s = it.kind === 'sym' && doc().symbols.find(o => o.id === it.id);
    const symbol = s?.type === 'module' && s.params?.module && opts.onEditSymbol && { label: 'Edit Symbol', action: () => opts.onEditSymbol(s.params.module) };
    // (its Update Symbol, as its Properties' button, #3791: enabled when it is out of date)
    const stale = s?.type === 'module' && !!symbolDiff(s, modules());
    const update = s?.type === 'module' && edit && { label: 'Update Symbol', disabled: !stale, ...(stale ? {} : { title: 'The symbol is up to date' }), action: () => updateSymbol(s, { doc, modules, edit, flash }) };
    popupMenu([
      info, symbol, update, (info || symbol || update) && '-',
      { label: 'Rename…', action: () => rename(it) },
      '-',
      parts && { label: 'Duplicate', action: duplicateSel },
      parts && { label: 'Rotate', action: rotateSel, shortcut: 'Ctrl+R' },
      parts && { label: 'Mirror', action: mirrorSel, shortcut: 'Ctrl+M' },
      parts && '-',
      { label: 'Delete', action: deleteSel, shortcut: 'Del' },
    ], e.clientX, e.clientY);
  }

  return { contextMenu };
}
