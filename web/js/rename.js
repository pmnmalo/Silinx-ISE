// Renaming (#405: out of app.js): Rename Symbol (F2) in an HDL editor, and renaming a source (its file and / or the
// module it defines) with everything that refers to it updated: instances, the drawings' links, the constraints.
import { api } from './api.js';
import { h, dialog, alertDlg } from './ui.js';
import { renameSymbolAtCursor, applyEdits } from './refactor.js';
import { S, closeDoc, compileProject, openFile } from './app.js';
import { log } from './console.js';
import { reloadProject } from './project.js';
import { isFsm, isTt, syncHdlFromAsm, syncHdlFromFsm, syncHdlFromSchematic, syncHdlFromTt } from './drawings.js';
import { markStale, saveAll } from './processes.js';
import { reservedError } from '/core/reserved.js';

// ---- Rename Symbol (F2) in an HDL editor: the name under the cursor, everywhere it means the same
// object in the file; a port / generic also in the instances of its module in the other files
export function renameSymbolIn(d, lang, path) {
  if (!d.editor) return;
  const findModule = name => S.modules.find(m => m.name.toLowerCase() === String(name).toLowerCase());
  return renameSymbolAtCursor({
    editor: d.editor, lang, path,
    // (not the HDL generated from a drawing, with a file of its own or not: it follows the drawing, read-only, #1176)
    sources: () => S.sources.filter(s => (s.lang === 'vhdl' || s.lang === 'verilog') && !s.view && !S.hdlToSch?.[s.path]).map(s => ({ ...s, text: S.docs.find(o => o.path === s.path && o.editor)?.editor.getValue() ?? s.text })),
    drawings: () => S.sources.filter(s => s.view || S.hdlToSch?.[s.path]).map(s => (s.view ? s : { ...s, path: S.hdlToSch[s.path] })),
    isModule: name => !!findModule(name),
    renameModule: name => renameDialog(findModule(name)?.file || path, findModule(name)?.name || name),
    // an open file is edited in its editor (its own Undo); the others are written
    writeSource: async (p, text, edits, name) => {
      const od = S.docs.find(o => o.path === p && o.editor);
      if (od) { applyEdits(od.editor, edits, name); return; }
      await api.writeFile(S.project.name, p, text);
      const src = S.sources.find(x => x.path === p);
      if (src) src.text = text;
      compileProject();
    },
  });
}

// ---- rename a source (file and/or the module it defines), updating everything that refers to it
const extOf = p => (/\.(sch|asm|tt|fsm|pn)\.json$/i.exec(p) || /\.[^./]+$/.exec(p) || [''])[0];
const dirOf = p => (p.includes('/') ? p.replace(/\/[^/]*$/, '/') : '');

export async function renameDialog(file, mod = null) {
  if (!S.project) return;
  await saveAll();
  const mods = S.modules.filter(m => m.file === file && m.kind !== 'package').map(m => m.name);
  const modName = mod || (mods.length === 1 ? mods[0] : null);
  const base = file.slice(dirOf(file).length, file.length - extOf(file).length);
  const fIn = h('input', { type: 'text', value: file, style: { width: '100%' } });
  const mIn = modName ? h('input', { type: 'text', value: modName, style: { width: '100%' } }) : null;
  const follow = h('input', { type: 'checkbox', checked: !!modName && base.toLowerCase() === modName.toLowerCase() });
  if (mIn) mIn.addEventListener('input', () => { if (follow.checked) fIn.value = dirOf(file) + mIn.value.trim() + extOf(file); });
  const err = h('div', { class: 'hint', style: { color: 'var(--error-fg)', minHeight: '16px' } });
  const r = await dialog({
    title: 'Rename', width: 520,
    body: h('div', {},
      h('div', { class: 'form-grid' },
        ...(mIn ? [h('label', {}, modName && S.modules.find(m => m.name === modName)?.lang === 'vhdl' ? 'Entity:' : 'Module:'), mIn] : []),
        h('label', {}, 'File:'), fIn,
        ...(mIn ? [h('span'), h('label', {}, follow, ' File name follows the module name')] : [])),
      h('div', { class: 'hint', style: { marginTop: '8px' } }, mIn
        ? 'Renaming the module also updates its instances in the other sources, schematics, linked charts and the project top.'
        : 'References to this file in the project (synchronized schematics/charts, constraints) are updated.'),
      err),
    buttons: [{ label: 'Rename', primary: true, value: true, validate: () => { const m = check(); err.textContent = m || ''; return !m; } }, { label: 'Cancel', value: null }],
  });
  function check() {
      const to = fIn.value.trim(), nm = mIn?.value.trim();
      if (!to || to.startsWith('/') || to.split('/').includes('..')) return 'Enter a file path inside the project.';
      if (to !== file && S.fileTree.some(f => f.toLowerCase() === to.toLowerCase()) && to.toLowerCase() !== file.toLowerCase()) return `${to} already exists.`;
      if (mIn) {
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(nm)) return 'The module name must start with a letter and contain only letters, digits and _.';
        // not a reserved word of VHDL or Verilog, in any letter case (#679)
        const r = nm.toLowerCase() !== modName.toLowerCase() && reservedError(nm);
        if (r) return `${r}: choose another name.`;
        if (nm.toLowerCase() !== modName.toLowerCase() && S.modules.some(m => m.name.toLowerCase() === nm.toLowerCase())) return `A module named '${nm}' already exists.`;
      }
      return null;
  }
  if (!r) return;
  await renameSource(file, fIn.value.trim(), modName, mIn ? mIn.value.trim() : null);
}

async function renameSource(from, to, oldMod, newMod) {
  const pj = structuredClone(S.project);           // project settings to save (only if everything worked)
  const { renameModuleInSource, renameModuleInSchematic } = await import('/core/rename.js');
  const changed = new Map();                      // path -> new text
  const moved = new Map();                        // old path -> new path
  const views = {};                               // .sch.json / .asm.json -> parsed
  for (const f of S.fileTree.filter(f => /\.(sch|asm|tt|fsm|pn)\.json$/i.test(f))) {
    try { views[f] = JSON.parse(await api.readFile(pj.name, f)); } catch { /* skip */ }
  }
  S.syncing = true;
  try {
    if (newMod && oldMod && newMod !== oldMod) {
      for (const src of S.sources.filter(x => x.lang === 'vhdl' || x.lang === 'verilog')) {
        const t = renameModuleInSource(src.text, src.lang, oldMod, newMod);
        if (t !== src.text) changed.set(src.path, t);
      }
      for (const [f, d] of Object.entries(views)) {
        const linked = d.generatedFile === from;
        let ch = false;
        if (/\.sch\.json$/i.test(f)) ch = renameModuleInSchematic(d, oldMod, newMod, { linked });
        else if (linked && String(d.name).toLowerCase() === oldMod.toLowerCase()) { d.name = newMod; ch = true; }
        if (ch) changed.set(f, JSON.stringify(d, null, /\.(asm|tt|fsm)\.json$/i.test(f) ? 2 : 1));
        // a synchronized view named after the module follows it
        const vb = f.slice(dirOf(f).length, f.length - extOf(f).length);
        if (linked && vb.toLowerCase() === oldMod.toLowerCase()) moved.set(f, dirOf(f) + newMod + extOf(f));
      }
      const eq = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
      if (eq(pj.top, oldMod)) pj.top = newMod;
      if (eq(pj.simTop, oldMod)) pj.simTop = newMod;
      if (pj.stimuli && pj.stimuli[oldMod]) { pj.stimuli[newMod] = pj.stimuli[oldMod]; delete pj.stimuli[oldMod]; }
    }
    if (to && to !== from) {
      moved.set(from, to);
      for (const [f, d] of Object.entries(views)) {
        if (d.generatedFile === from) { d.generatedFile = to; changed.set(f, JSON.stringify(d, null, /\.(asm|tt|fsm)\.json$/i.test(f) ? 2 : 1)); }
      }
    }
    // close the editors of files that move or change (reopened below)
    const reopen = [];
    for (const d of [...S.docs]) {
      if (d.path && (changed.has(d.path) || moved.has(d.path))) {
        if (S.active === d) reopen.unshift(moved.get(d.path) || d.path); else reopen.push(moved.get(d.path) || d.path);
        d.dirty = false; clearTimeout(d._autosave); await closeDoc(d);
      }
    }
    // 1. move the files (all or nothing: a failure undoes the moves already done)
    const done = [];
    try {
      for (const [a, b] of moved) { await api.renameFile(pj.name, a, b); done.push([a, b]); }
    } catch (e) {
      for (const [a, b] of done.reverse()) await api.renameFile(pj.name, b, a).catch(() => {});
      throw new Error(`could not rename ${[...moved].map(([a, b]) => `${a} → ${b}`).join(', ')}: ${e.message}. Nothing was changed.`);
    }
    // 2. the updated contents, at their new paths
    for (const [p, text] of changed) await api.writeFile(pj.name, moved.get(p) || p, text);
    // 3. project settings (top, sim top, stimuli) on top of the file list the moves produced
    const fresh = await api.project(pj.name);
    delete fresh.fileTree;
    Object.assign(fresh, { top: pj.top, simTop: pj.simTop, stimuli: pj.stimuli });
    S.project = await api.saveProject(pj.name, fresh);
    await reloadProject(false);
    // synchronized HDL of a renamed chart/schematic: regenerate it so its header names match
    if (newMod && newMod !== oldMod) {
      S.syncing = false;
      for (const [f, d] of Object.entries(views)) {
        if (!changed.has(f) || !d.generatedFile) continue;
        const vp = moved.get(f) || f;
        if (/\.asm\.json$/i.test(vp)) await syncHdlFromAsm(vp, d).catch(() => {});
        else if (isTt(vp)) await syncHdlFromTt(vp, d).catch(() => {});
        else if (isFsm(vp)) await syncHdlFromFsm(vp, d).catch(() => {});
        else await syncHdlFromSchematic(vp, d).catch(() => {});
      }
    }
    markStale();
    const parts = [];
    if (newMod && newMod !== oldMod) parts.push(`module '${oldMod}' renamed to '${newMod}' (${[...changed.keys()].length} file(s) updated)`);
    for (const [a, b] of moved) parts.push(`${a} → ${b}`);
    log(`Rename: ${parts.join('; ')}.`, 'ok');
    for (const p of reopen.reverse()) await openFile(p);
  } catch (e) {
    alertDlg('Rename', e.message, 'error');
    await reloadProject(false);
  } finally { S.syncing = false; }
}
