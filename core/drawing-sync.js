// A drawing's HDL file kept in sync with it on the server (#2674), as the interface's editors keep it (web/js/drawings.js
// syncHdlFromAsm / Fsm / Schematic, drawings-tt.js syncHdlFromTt): a drawing (schematic, ASM chart, state diagram,
// truth table, Petri net) is the base of its HDL file (its generatedFile, in the project), which is made from it
// again (core/view-hdl.js viewHdl, the editors' generators) when it changes; a drawing with errors leaves its file as
// it was, stale (#303), and Check Syntax stops on it. A drawing in another language than its file's gets its HDL file
// in that language and the other one removed (drawings.js drawnHdlLanguage); the project's Preferred Language and a
// drawing's own (Source Properties) put the drawings in it (drawings-lang.js, #1477, #2254). A drawing made from its
// HDL (base 'hdl') is a view of it, not its base: none of this.
import { compile } from './compile.js';
import { attachSymbols, isSymbolFile, modulesFromLibrary } from './schdoc.js';
import { VIEW_RE, definesModule, drawingInLanguage, drawnHdlPath, modelLanguage, viewHdl } from './view-hdl.js';

const kindOf = path => VIEW_RE.exec(path)?.[1].toLowerCase();
const indent = path => (kindOf(path) === 'sch' ? 1 : 2);
const isVerilog = file => /\.s?v$/i.test(file);

/** The project's modules from its HDL sources (the schematics' module symbols), as the editors read them, with their
 *  symbols of their own (<module>.sym.json, #3755). */
export async function projectModules(P, name) {
  const hdl = (await P.readSources(name)).filter(s => !s.missing && (s.lang === 'vhdl' || s.lang === 'verilog'));
  let mods;
  try { mods = modulesFromLibrary(compile(hdl), { sources: Object.fromEntries(hdl.map(s => [s.path, s.text])) }); } catch { return {}; }
  return attachSymbols(mods, await symbolFiles(P, name));
}

/** The project's symbol files: { path: text }. */
export async function symbolFiles(P, name) {
  const out = {};
  for (const f of (await P.fileTree(name)).filter(isSymbolFile)) { try { out[f] = await P.readFile(name, f); } catch { /* unreadable */ } }
  return out;
}

// the drawing's model and its HDL file in the project (null: none, or not the drawing's base)
async function linkOf(P, name, path) {
  if (!kindOf(path)) return null;
  let m;
  try { m = JSON.parse(await P.readFile(name, path)); } catch { return null; }
  if (!m || typeof m !== 'object' || m.base === 'hdl' || !m.generatedFile) return null;
  const pj = await P.readProject(name);
  const tree = await P.fileTree(name);
  const target = m.generatedFile;
  if (!tree.includes(target) || !(pj.files || []).some(f => f.path === target) || (pj.excluded || []).includes(path)) return null;
  return { m, target, tree };
}

/** A drawing's HDL file made again from it: { target, written, removed, stale: its errors' text or null, messages }
 *  (null: a drawing with no HDL file in the project, or not a drawing). */
export async function syncDrawing(P, name, path, modules = null) {
  const link = await linkOf(P, name, path);
  if (!link) return null;
  const { m, target, tree } = link;
  const mods = modules || (kindOf(path) === 'sch' ? await projectModules(P, name) : {});
  // in another language than its file's: its HDL file in that language, the other one removed
  if (m.lang && isVerilog(target) !== (m.lang === 'verilog')) {
    const r = drawingInLanguage(path, JSON.stringify(m), m.lang, { modules: mods });
    const L = m.lang === 'verilog' ? 'Verilog' : 'VHDL';
    if (!r.hdl || r.errors.length) return { target, written: null, removed: null, stale: r.errors.map(e => e.replace(`${path}: `, '')).join('; '), messages: [`WARNING: ${target} not made in ${L} yet: ${path} has errors: ${r.errors.map(e => e.replace(`${path}: `, '')).join('; ')}`] };
    if (tree.includes(r.target)) return { target, written: null, removed: null, stale: null, messages: [`WARNING: the HDL of ${path} is not made in ${L}: ${r.target} exists already`] };
    await P.deleteFile(name, target);
    await P.writeFile(name, r.target, r.hdl);
    await P.writeFile(name, path, r.text);
    return { target: r.target, written: r.target, removed: target, stale: null, messages: [`${path}: its HDL is now in ${L}, ${r.target} (${target} removed)`] };
  }
  const r = viewHdl(path, JSON.stringify(m), { modules: mods, linked: () => false });
  if (r.errors.length) {
    const why = r.errors.map(e => e.replace(`${path}: `, '')).join('; ');
    return { target, written: null, removed: null, stale: why, messages: [`WARNING: ${target} not updated: ${path} has errors: ${why}`] };
  }
  if (await P.readFile(name, target) === r.text) return { target, written: null, removed: null, stale: null, messages: [] };
  await P.writeFile(name, target, r.text);
  return { target, written: target, removed: null, stale: null, messages: [`${target} updated from ${path}`] };
}

/** A drawing with no HDL file gets it (#207, #3184), as the interface's adoptDrawnHdl gives it when the project is
 *  loaded: the HDL made from it written next to it (drawnHdlPath, which registers the module in the project) and the
 *  drawing linked to it (generatedFile). Not when it has errors (a module by itself until it has none), when that file
 *  is there already or another HDL file of the project defines its module (#230: resolved from its menu), nor for a
 *  drawing made from its HDL. { target, written, removed: null, stale: null, messages }, or null when it gets none. */
export async function adoptDrawing(P, name, path) {
  if (!kindOf(path)) return null;
  let m;
  try { m = JSON.parse(await P.readFile(name, path)); } catch { return null; }
  if (!m || typeof m !== 'object' || m.base === 'hdl' || m.generatedFile) return null;
  const r = viewHdl(path, JSON.stringify(m), { modules: kindOf(path) === 'sch' ? await projectModules(P, name) : {}, linked: () => false });
  if (!r || r.errors.length || !r.module || !r.text) return null;
  const target = drawnHdlPath(path, r.module, r.lang);
  if ((await P.fileTree(name)).includes(target)) return null;
  const hdl = (await P.readSources(name)).filter(s => !s.missing && (s.lang === 'vhdl' || s.lang === 'verilog'));
  if (hdl.some(s => definesModule(s.text, r.module, s.path))) return null;
  await P.writeFile(name, target, r.text);
  await P.writeFile(name, path, JSON.stringify({ ...m, generatedFile: target }, null, indent(path)));
  return { target, written: target, removed: null, stale: null, messages: [`${target} generated from ${path}`] };
}

/** The HDL files of the project their drawing cannot make again (errors): [{ target, from, why }] (app.js's
 *  staleHdl, read by Check Syntax). */
export async function staleDrawings(P, name) {
  const out = [];
  let mods = null;
  for (const f of (await P.fileTree(name)).filter(p => kindOf(p))) {
    const link = await linkOf(P, name, f);
    if (!link) continue;
    if (kindOf(f) === 'sch') mods ||= await projectModules(P, name);
    let r = null;
    try { r = viewHdl(f, JSON.stringify(link.m), { modules: kindOf(f) === 'sch' ? mods : {}, linked: () => false }); } catch { /* not a drawing */ }
    if (r?.errors?.length) out.push({ target: link.target, from: f, why: `it has errors: ${r.errors.map(e => e.replace(`${f}: `, '')).join('; ')}` });
  }
  return out;
}

// a drawing in that language (drawings-lang.js drawingToLanguage): the drawing written in it, its link as it is, then
// its HDL file made in it; the messages, or null when it is in that language already
async function drawingToLanguage(P, name, path, lang) {
  let r;
  try { r = drawingInLanguage(path, await P.readFile(name, path), lang); } catch { return null; }
  if (!r || r.model.base === 'hdl') return null;
  await P.writeFile(name, path, JSON.stringify({ ...r.model, generatedFile: r.from || undefined }, null, indent(path)));
  const s = r.from ? await syncDrawing(P, name, path) : null;
  return s?.messages || [];
}

/** The project's drawings in its Preferred Language `lang`, but those with a language of their own (Source Properties):
 *  { changed: [drawing], messages }. */
export async function drawingsInLanguage(P, name, lang) {
  const own = (await P.readProject(name)).sourceLanguage || {};
  const changed = [], messages = [];
  for (const f of (await P.fileTree(name)).filter(p => kindOf(p))) {
    if (own[f]) continue;
    const r = await drawingToLanguage(P, name, f, lang);
    if (r) { changed.push(f); messages.push(...r); }
  }
  return { changed, messages };
}

/** Source Properties' language of a drawing: 'vhdl' or 'verilog' (its own), or '' (the project's, following it):
 *  { changed, language, messages }. */
export async function setSourceLanguage(P, name, drawing, choice) {
  await P.updateProject(name, pj => {
    const own = { ...pj.sourceLanguage };
    if (choice) own[drawing] = choice; else delete own[drawing];
    if (Object.keys(own).length) pj.sourceLanguage = own; else delete pj.sourceLanguage;
    return pj;
  });
  const pj = await P.readProject(name);
  const lang = choice || (pj.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl');
  const messages = await drawingToLanguage(P, name, drawing, lang);
  return { changed: !!messages, language: lang, messages: messages || [] };
}

/** A drawing's language now ('vhdl' or 'verilog'), and whether it can have one (a drawing made from its HDL cannot). */
export async function drawingLanguage(P, name, path) {
  let m;
  try { m = JSON.parse(await P.readFile(name, path)); } catch { return null; }
  if (!kindOf(path) || m.base === 'hdl') return null;
  return modelLanguage(m);
}
