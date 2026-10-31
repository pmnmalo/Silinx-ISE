// The project's Preferred Language changed (Design Properties, #1477): every drawing of the project (schematic, ASM
// chart, state diagram, truth table, Petri net) in that language, as when its editor's HDL language changes (#220):
// its HDL file, generated from it, made again in it and the file in the other language removed (drawnHdlLanguage);
// a drawing with errors gets the language, its HDL made in it once it has none. The HDL files written by hand stay
// as they are. A drawing given its own language in Source Properties (#2254, the project's sourceLanguage: { drawing:
// 'vhdl' | 'verilog' }) keeps it.
import { api } from './api.js';
import { drawingInLanguage, modelLanguage } from '/core/view-hdl.js';
import { S, findDoc, flushDoc } from './app.js';
import { saveProjectJson } from './design.js';
import { drawnHdlLanguage, viewKind } from './drawings.js';

// Returns the drawings it changed.
export async function drawingsInLanguage(lang) {
  const changed = [];
  for (const f of Object.keys(S.viewTexts || {})) {
    if (S.project.sourceLanguage?.[f]) continue;
    if (await drawingToLanguage(f, lang)) changed.push(f);
  }
  return changed;
}

// The drawing in that language; true when that changed it.
async function drawingToLanguage(f, lang) {
  const d = findDoc(`${viewKind(f)}:${f}`);
  const ed = d?.schEditor || d?.asmEditor || d?.ttEditor || d?.fsmEditor || d?.petriEditor;
  if (d) await flushDoc(d);   // (its last edits saved first)
  let r;
  try { r = drawingInLanguage(f, await api.readFile(S.project.name, f), lang); } catch { return false; }
  if (!r || r.model.base === 'hdl') return false;
  // the drawing in that language, its link as it is: drawnHdlLanguage makes its HDL and links it
  const m = { ...r.model, generatedFile: r.from || undefined };
  const text = JSON.stringify(m, null, viewKind(f) === 'sch' ? 1 : 2);
  await api.writeFile(S.project.name, f, text);
  S.viewTexts[f] = text;
  if (ed?.setDoc) ed.setDoc(m); else ed?.setModel?.(m);
  if (r.from && S.schOwners?.[f] === r.from) await drawnHdlLanguage(f, m);
  return true;
}

const preferred = () => (S.project.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl');

// What Source Properties offers for `path` (a drawing or its HDL file): { drawing, choice: '' (the project's) | 'vhdl' |
// 'verilog' }; null for a source with no choice (HDL written by hand, a drawing made from its HDL).
export async function sourceLanguageChoice(path) {
  const drawing = S.hdlToSch?.[path] || (S.viewTexts?.[path] !== undefined ? path : null);
  if (!drawing) return null;
  const d = findDoc(`${viewKind(drawing)}:${drawing}`);
  if (d) await flushDoc(d);
  let m;
  try { m = JSON.parse(await api.readFile(S.project.name, drawing)); } catch { return null; }
  if (m.base === 'hdl') return null;
  const now = modelLanguage(m);
  // (what the drawing is in now, should its own editor have changed it)
  return { drawing, choice: S.project.sourceLanguage?.[drawing] === now || now !== preferred() ? now : '' };
}

// Source Properties' choice: the drawing in that language, or, '', in the project's and following it.
export async function setSourceLanguage(drawing, choice) {
  const pj = S.project, own = { ...pj.sourceLanguage };
  if (choice) own[drawing] = choice; else delete own[drawing];
  if (Object.keys(own).length) pj.sourceLanguage = own; else delete pj.sourceLanguage;
  await saveProjectJson();
  await drawingToLanguage(drawing, choice || preferred());
}
