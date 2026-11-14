// Renaming a module on the server (#2674), as the interface's Rename of a module does (web/js/rename.js renameDialog's
// checks, renameSource): the module in every HDL source (its declaration, its instances, core/rename.js), the
// schematics' symbols of it and the drawing it is generated from (its name; the drawing, named after it, renamed
// with it), its symbol file (<module>.sym.json, #3829: renamed with it, beside its file), the project's top and test
// bench, its stimuli; optionally its file (the drawings' links follow), and the
// drawings changed make their HDL again (server/drawing-sync.js). The files are moved all or nothing.
import { compile } from '../core/compile.js';
import { renameModuleInSource, renameModuleInSchematic } from '../core/rename.js';
import { reservedError } from '../core/reserved.js';
import { syncDrawing } from './drawing-sync.js';
import { isName } from '../core/ident.js';
import { isSymbolFile, renameSymbolFile } from '../core/symbol-layout.js';

const VIEW = /\.(sch|asm|tt|bool|fsm|pn)\.json$/i;
const extOf = p => (VIEW.exec(p) || /\.[^./]+$/.exec(p) || [''])[0];
const dirOf = p => (p.includes('/') ? p.replace(/\/[^/]*$/, '/') : '');
const baseOf = p => p.slice(dirOf(p).length, p.length - extOf(p).length);
const eq = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

/** The project's modules declared in its HDL files: [{ name, file, lang, kind }]. */
export async function projectModules(P, name) {
  const hdl = (await P.readSources(name)).filter(s => !s.missing && (s.lang === 'vhdl' || s.lang === 'verilog'));
  let lib;
  try { lib = compile(hdl); } catch { return []; }
  return [...lib.modules.values()].map(m => ({ name: m.name, file: m.file, lang: m.lang, kind: m.kind }));
}

/** The file a module is renamed with by default (Rename's "File name follows the module name"): its file with the new
 *  name when the file is named after the module, else none. */
export const followingFile = (file, oldName, newName) => (eq(baseOf(file), oldName) ? dirOf(file) + newName + extOf(file) : null);

/**
 * Rename the module `oldName` to `newName`, and its file to `to` (null: kept). Errors: Error with `rename: true`
 * (the dialog's messages). Returns { module: newName, file, changed: [paths written], moved: [[from, to]], message, hdl }.
 */
export async function renameModule(P, name, oldName, newName, { to = null } = {}) {
  const fail = message => Object.assign(new Error(message), { rename: true });
  const mods = await projectModules(P, name);
  const mod = mods.find(m => eq(m.name, oldName) && m.kind !== 'package');
  if (!mod) throw fail(`no module '${oldName}' in the project's HDL files`);
  oldName = mod.name;
  const from = mod.file;
  const tree = await P.fileTree(name);
  // the dialog's checks
  if (!isName(newName)) throw fail('The module name must start with a letter and contain only letters, digits and _.');
  if (!eq(newName, oldName)) {
    const r = reservedError(newName);
    if (r) throw fail(`${r}: choose another name.`);
    if (mods.some(m => eq(m.name, newName))) throw fail(`A module named '${newName}' already exists.`);
  }
  if (to) {
    if (to.startsWith('/') || to.split('/').includes('..')) throw fail('Enter a file path inside the project.');
    if (to !== from && tree.some(f => eq(f, to)) && !eq(to, from)) throw fail(`${to} already exists.`);
  }
  const pj = await P.readProject(name);
  const changed = new Map();                      // path -> new text
  const moved = new Map();                        // old path -> new path
  const views = {};
  for (const f of tree.filter(f => VIEW.test(f))) {
    try { views[f] = JSON.parse(await P.readFile(name, f)); } catch { /* skip */ }
  }
  const settings = { top: pj.top, simTop: pj.simTop, stimuli: pj.stimuli };
  if (newName !== oldName) {
    for (const src of (await P.readSources(name)).filter(s => !s.missing && (s.lang === 'vhdl' || s.lang === 'verilog'))) {
      const t = renameModuleInSource(src.text, src.lang, oldName, newName);
      if (t !== src.text) changed.set(src.path, t);
    }
    for (const [f, d] of Object.entries(views)) {
      const linked = d.generatedFile === from;
      let ch = false;
      if (/\.sch\.json$/i.test(f)) ch = renameModuleInSchematic(d, oldName, newName, { linked });
      else if (linked && eq(d.name, oldName)) { d.name = newName; ch = true; }
      if (ch) changed.set(f, JSON.stringify(d, null, /\.(asm|tt|bool|fsm)\.json$/i.test(f) ? 2 : 1));
      // a synchronized view named after the module follows it
      if (linked && eq(baseOf(f), oldName)) moved.set(f, dirOf(f) + newName + extOf(f));
    }
    if (eq(settings.top, oldName)) settings.top = newName;
    if (eq(settings.simTop, oldName)) settings.simTop = newName;
    if (settings.stimuli?.[oldName]) { settings.stimuli = { ...settings.stimuli, [newName]: settings.stimuli[oldName] }; delete settings.stimuli[oldName]; }
  }
  if (to && to !== from) {
    moved.set(from, to);
    for (const [f, d] of Object.entries(views)) {
      if (d.generatedFile === from) { d.generatedFile = to; changed.set(f, JSON.stringify(d, null, /\.(asm|tt|bool|fsm)\.json$/i.test(f) ? 2 : 1)); }
    }
  }
  // its symbol (#3829): the module's name in it, the file named after the module following it and its file
  const syms = {};
  for (const f of tree.filter(isSymbolFile)) { try { syms[f] = await P.readFile(name, f); } catch { /* skip */ } }
  const sym = newName !== oldName || moved.has(from) ? renameSymbolFile(syms, moved.get(from) || from, oldName, newName) : null;
  if (sym) {
    if (sym.text !== syms[sym.from]) changed.set(sym.from, sym.text);
    if (sym.to !== sym.from) moved.set(sym.from, sym.to);
  }
  for (const [a, b] of moved) if (a !== b && tree.some(f => eq(f, b)) && !eq(a, b)) throw fail(`${b} already exists.`);
  // 1. the files moved, all or nothing (a failure undoes the moves already done)
  const done = [];
  try {
    for (const [a, b] of moved) { await P.renameFile(name, a, b); done.push([a, b]); }
  } catch (e) {
    for (const [a, b] of done.reverse()) await P.renameFile(name, b, a, { checkName: false }).catch(() => {});   // (back to its name, #2973)
    throw fail(`could not rename ${[...moved].map(([a, b]) => `${a} → ${b}`).join(', ')}: ${e.message}. Nothing was changed.`);
  }
  // 2. the updated contents, at their new paths
  for (const [p, text] of changed) await P.writeFile(name, moved.get(p) || p, text);
  // 3. the project's settings on the file list the moves made
  await P.updateProject(name, cur => ({ ...cur, top: settings.top, simTop: settings.simTop, ...(settings.stimuli ? { stimuli: settings.stimuli } : {}) }));
  // the drawings renamed: their HDL made again, its header's names with them
  const hdl = [];
  if (newName !== oldName) {
    for (const f of Object.keys(views).filter(f => changed.has(f) && views[f].generatedFile)) {
      const r = await syncDrawing(P, name, moved.get(f) || f);
      if (r?.messages.length) hdl.push(...r.messages);
    }
  }
  const parts = [];
  if (newName !== oldName) parts.push(`module '${oldName}' renamed to '${newName}' (${changed.size} file(s) updated)`);
  for (const [a, b] of moved) parts.push(`${a} → ${b}`);
  return { module: newName, file: moved.get(from) || from, changed: [...changed.keys()].map(p => moved.get(p) || p), moved: [...moved], message: parts.length ? `Rename: ${parts.join('; ')}.` : 'Rename: nothing to rename.', hdl };
}
