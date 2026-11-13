// A module's symbol as a document (#3755): Edit Symbol of a module (the Design pane's right-click menu, a module
// instance's in a schematic) opens its <module>.sym.json in the Symbol Editor (symbol-editor.js), made first with the
// default symbol when it has none; saved, the schematics' module symbols are drawn from it (Update Symbol on their
// instances: core/schdoc-modsym.js). Its messages in the console.
import { api } from './api.js';
import { h } from './dom.js';
import { S, activateDoc, findDoc, openDoc, setDirty } from './app.js';
import { log, logError } from './console.js';
import { schModules } from './drawings.js';
import { reloadProject } from './project.js';
import { following, followNotice } from './collab-state.js';
import { findMod, newSymbol, readSymbol, symbolFileOf, symbolText } from '/core/schdoc.js';

/** Edit Symbol of the module `name`: its symbol file opened, made first when it has none. */
export async function editSymbol(name) {
  if (!S.project) return;
  const m = findMod(await schModules(), name);
  if (!m) { logError(`Edit Symbol: no module '${name}' in the project's sources`); return; }
  const path = m.symbolFile || symbolFileOf(m.file, m.name);
  if (!S.fileTree.includes(path)) {
    if (following()) { logError(`Edit Symbol: module '${m.name}' has no symbol of its own (a followed project is read only)`); return; }
    const text = symbolText(newSymbol(m));
    await api.writeFile(S.project.name, path, text);
    log(`${path}: the symbol of module '${m.name}' made (its default one): its pins' order and sides edited in the Symbol Editor`, 'info');
    await reloadProject();
  }
  return openSymbol(path);
}

/** The schematics' module symbols drawn again from the project's symbols. */
async function refreshSchematics() {
  const mods = await schModules();
  for (const d of S.docs) d.schEditor?.setModules(mods);
}

export async function openSymbol(path) {
  const id = `sym:${path}`;
  if (findDoc(id)) return activateDoc(findDoc(id));
  const pj = S.project.name;
  let text;
  try { text = await api.readFile(pj, path); } catch (e) { logError(`cannot open ${path}: ${e.message}`); return; }
  const { symbol, errors } = readSymbol(text);
  if (!symbol) { logError(`cannot open ${path}: ${errors.join('; ')}`); return; }
  for (const e of errors) log(`WARNING: ${path}: ${e}`, 'warn');
  const [{ mountSymbolEditor }, mods] = await Promise.all([import('./symbol-editor.js'), schModules()]);
  if (S.project?.name !== pj) return;   // another project opened meanwhile (#1231)
  const module = findMod(mods, symbol.module);
  if (!module) log(`WARNING: ${path}: no module '${symbol.module}' in the project's sources: its pins as the symbol has them`, 'warn');
  const file = path.split('/').pop();
  openDoc({
    id, path, title: file, tooltip: path, icon: 'schematic',
    create(el, d) {
      const host = h('div', { class: 'doc-body' });
      el.append(host);
      const ed = mountSymbolEditor(host, {
        symbol, module, ...(following() ? { readOnly: true, banner: followNotice() } : {}),
        onChange: () => setDirty(d, true),
        onMessage: (msg, warn) => log(warn ? `WARNING: ${msg}` : msg, warn ? 'warn' : 'info'),
      });
      d.symEditor = ed;
      return {
        save: async () => {
          const t = symbolText(ed.getSymbol());
          await api.writeFile(S.project.name, path, t);
          S.symbolFiles = { ...(S.symbolFiles || {}), [path]: t };
          setDirty(d, false);
          await refreshSchematics();
        },
        destroy: () => ed.destroy(),
      };
    },
  });
}
