// The schematic editor's Symbol Info (#405: out of mountSchEditor in sch-editor.js): the symbol it is about (the
// selected one, the one being placed, the palette's), its datasheet opened (web/js/symbol-info.js), and a device
// primitive's resource and how many symbols take it (#791).
import { SYMBOLS } from '/core/schdoc.js';
import { highlightHdl } from './highlight.js';
import { presetOf } from '/core/symdocs.js';
import { primitiveResource } from '/core/primitives.js';
import { symbolDrawingSvg } from './sch-svg.js';
import { clone } from './sch-editor.js';

/** { infoTarget, openInfo, symTarget } of mountSchEditor (destroyed(), device(), doc(), genLang(), infoDlg(), infoItem(), modules(), placing(), sel(), tool(): its current values). */
export function mountSchInfo(ctx) {
  const {
    container, destroyed, device, doc, genLang, infoDlg, infoItem, itemTarget, modules, placing, sel, selected, tool,
    setInfoDlg
  } = ctx;

  // a symbol of the schematic's Symbol Info (by its id; the right-click menu's, #2953)
  function symTarget(id) {
    const s = doc().symbols.find(x => x.id === id);
    return s ? { type: s.type, params: clone(s.params), hdl: s.hdl, preset: presetOf(s.type, s.params) } : null;
  }
  // the symbol the Symbol Info action is about: the selected symbol, else the one being placed / last picked in the palette
  function infoTarget() {
    const ids = selected('sym');
    if (ids.length === 1 && sel().size === 1) {
      const t = symTarget(ids[0]);
      if (t) return t;
    }
    if (tool() === 'place' && placing()) return { type: placing().type, params: clone(placing().params), preset: placing().preset };
    return infoItem() ? itemTarget(infoItem()) : null;
  }
  async function openInfo(target) {
    if (!target || destroyed()) return null;
    const { openSymbolInfo } = await import('./symbol-info.js');
    if (destroyed()) return null;
    infoDlg()?.close();
    setInfoDlg(openSymbolInfo({
      container, ...target, modules: modules(), lang: genLang(), highlight: highlightHdl, ...primUse(target),
      draw: (sym, def) => symbolDrawingSvg(sym, def),
      onClose: () => { setInfoDlg(null); if (container.isConnected) container.focus({ preventScroll: true }); },
    }));
    return infoDlg();
  }
  // a device primitive's Symbol Info (#791): the project's part, and how many of the schematic's symbols take the
  // same resource
  function primUse(target) {
    if (!SYMBOLS[target?.type]?.prim || !device()) return {};
    const id = primitiveResource(target.type, device().family, target.params);
    return { part: device(), used: id ? doc().symbols.filter(s => SYMBOLS[s.type]?.prim && primitiveResource(s.type, device().family, s.params) === id).length : null };
  }

  return { infoTarget, openInfo, symTarget };
}
