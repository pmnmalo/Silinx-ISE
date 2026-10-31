// The project's Preferred Language changed (Design Properties, #1477): every drawing of the project (schematic, ASM
// chart, state diagram, truth table, Petri net) in that language, as when its editor's HDL language changes (#220):
// its HDL file, generated from it, made again in it and the file in the other language removed (drawnHdlLanguage);
// a drawing with errors gets the language, its HDL made in it once it has none. The HDL files written by hand stay
// as they are.
import { api } from './api.js';
import { drawingInLanguage } from '/core/view-hdl.js';
import { S, findDoc, flushDoc } from './app.js';
import { drawnHdlLanguage, viewKind } from './drawings.js';

// Returns the drawings it changed.
export async function drawingsInLanguage(lang) {
  const changed = [];
  for (const f of Object.keys(S.viewTexts || {})) {
    const d = findDoc(`${viewKind(f)}:${f}`);
    const ed = d?.schEditor || d?.asmEditor || d?.ttEditor || d?.fsmEditor || d?.petriEditor;
    if (d) await flushDoc(d);   // (its last edits saved first)
    let r;
    try { r = drawingInLanguage(f, await api.readFile(S.project.name, f), lang); } catch { continue; }
    if (!r || r.model.base === 'hdl') continue;
    // the drawing in that language, its link as it is: drawnHdlLanguage makes its HDL and links it
    const m = { ...r.model, generatedFile: r.from || undefined };
    const text = JSON.stringify(m, null, viewKind(f) === 'sch' ? 1 : 2);
    await api.writeFile(S.project.name, f, text);
    S.viewTexts[f] = text;
    if (ed?.setDoc) ed.setDoc(m); else ed?.setModel?.(m);
    // (a table's schematic, when open, follows: #2257, this is now the only way to change the table's language)
    if (viewKind(f) === 'tt') (await import('./drawings-tt.js')).refreshTtSchematic(f, m);
    if (r.from && S.schOwners?.[f] === r.from) await drawnHdlLanguage(f, m);
    changed.push(f);
  }
  return changed;
}
