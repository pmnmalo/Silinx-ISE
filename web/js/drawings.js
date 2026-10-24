// The drawings and their HDL files (#405: out of app.js): ASM charts, truth tables, state diagrams, Petri nets
// and schematics opened in their editors, each kept in sync with the HDL module it is the base of; the views of an
// HDL file (schematic, ASM chart), the conversions between them, and a drawing whose HDL file name is taken.
import { api } from './api.js';
import { h, alertDlg, confirmDlg, popupMenu, toast, downloadText } from './ui.js';
import { elaborate } from '/core/compile.js';
import { viewHdl, drawnHdlPath, drawnHdlClash } from '/core/view-hdl.js';
import { modulesFromLibrary } from '/core/schdoc.js';
import { S, activateDoc, closeDocByPath, compileProject, findDoc, flushDoc, hdlInProject, moduleInfo, openDoc,
  openFile, setDirty, status } from './app.js';
import { log } from './console.js';
import { reloadProject } from './project.js';
import { markStale, saveAll } from './processes.js';
import { removeModule, renderHierarchy, saveProjectJson, setTop } from './design.js';
import { downloadUrl } from './menus.js';
import { renameDialog } from './rename.js';
import {
  openTt, openTtSchematic, syncHdlFromTt, ttContextMenu, ttFromHdl
} from './drawings-tt.js';
export {
  openTt, openTtSchematic, syncHdlFromTt, ttContextMenu
};

// ---- ASM
export async function openAsm(path) {
  const id = `asm:${path}`;
  if (findDoc(id)) return activateDoc(findDoc(id));
  let model;
  try { model = JSON.parse(await api.readFile(S.project.name, path)); }
  catch (e) { toast(`Cannot open ${path}: ${e.message}`, 'error'); return; }
  const { mountAsmEditor } = await import('./asm-editor.js');
  openDoc({
    id, path, title: path.split('/').pop(), icon: 'asm',
    create(el, d) {
      const host = h('div', { class: 'doc-body' });
      el.append(host);
      const ed = mountAsmEditor(host, {
        model,
        onChange: () => setDirty(d, true),
      });
      d.asmEditor = ed;
      return {
        save: async () => {
          const m = ed.getModel();
          await api.writeFile(S.project.name, path, JSON.stringify(m, null, 2)); setDirty(d, false);
          if (!S.syncing) syncHdlFromAsm(path, m).catch(e => log(`WARNING: HDL not synchronized: ${e.message}`, 'warn'));
        },
        destroy: () => ed.destroy?.(),
      };
    },
  });
}

// ---- ASM chart -> HDL synchronization (the chart is the base: its HDL file is read-only, #1176)
// The HDL files a drawing could not generate again (it has errors, #303): S.staleHdl[file] = { from, why }.
// Check Syntax (and so the simulation and the implementation) stops on them: they no longer say what the
// drawing does (a schematic net with two drivers, its HDL as it was before)
export function staleHdl(target, from, why) { (S.staleHdl ||= {})[target] = { from, why }; }
export function freshHdl(target) { if (S.staleHdl) delete S.staleHdl[target]; }

export async function syncHdlFromAsm(asmPath, model) {
  const target = model.generatedFile;
  if (!target || !S.fileTree.includes(target)) return;
  if (await drawnHdlLanguage(asmPath, model)) return;
  const { generate, validate } = await import('/core/asm.js');
  const errs = (validate(model) || []).filter(x => x.severity === 'error');
  if (errs.length) { staleHdl(target, asmPath, `the ASM chart has errors: ${errs.map(x => x.message).join('; ')}`); status(`${target.split('/').pop()} not updated: the chart has ${errs.length} error(s)`); return; }
  let g;
  try { g = generate(model, /\.v$/i.test(target) ? 'verilog' : 'vhdl'); } catch (e) { staleHdl(target, asmPath, e.message); status(`${target} not updated: ${e.message}`); return; }
  freshHdl(target);
  const cur = S.sources.find(x => x.path === target)?.text;
  if (cur === g.code) return;
  S.syncing = true;
  try {
    await api.writeFile(S.project.name, target, g.code);
    const src = S.sources.find(x => x.path === target); if (src) src.text = g.code;
    refreshOpenEditor(target, g.code);
    compileProject(); renderHierarchy(); markStale();
    status(`${target} updated from ${asmPath.split('/').pop()}`);
  } finally { S.syncing = false; }
}

async function asmFromHdlFile(hdlPath, opts = {}) {
  let mod;
  try { mod = await import('/core/asm-from-hdl.js'); } catch { throw new Error('HDL to state machine conversion is not available in this version'); }
  const text = S.sources.find(x => x.path === hdlPath)?.text ?? await api.readFile(S.project.name, hdlPath);
  return mod.asmFromHdl(text, { path: hdlPath, lang: /\.v$/i.test(hdlPath) ? 'verilog' : 'vhdl', ...opts });
}

// HDL module -> ASM chart, linked to the HDL file (the chart becomes the base).
export async function convertToAsm(mod) {
  const info = moduleInfo(mod);
  if (!info) return;
  await saveAll();
  let r;
  try { r = await asmFromHdlFile(info.file, { module: mod }); }
  catch (e) { alertDlg('Convert to State Machine', `'${mod}' cannot be shown as an ASM chart:\n\n${e.message}`, 'error'); return; }
  const dir = info.file.includes('/') ? info.file.replace(/\/[^/]*$/, '') : 'src';
  const target = `${dir}/${mod}.asm.json`;
  if (S.fileTree.includes(target) && !await confirmDlg('Convert to State Machine', `${target} already exists. Overwrite it?`)) return;
  const model = { ...r.model, generatedFile: info.file };
  await api.writeFile(S.project.name, target, JSON.stringify(model, null, 2));
  log(`'${mod}' converted to the ASM chart ${target}; it stays in sync with ${info.file}.`, 'ok');
  for (const w of r.warnings || []) log(`WARNING: ${target}: ${w}`, 'warn');
  await reloadProject(false);
  openAsm(target);
}

export function asmContextMenu(e, file) {
  popupMenu([
    { label: 'Open', action: () => openAsm(file) },
    S.view === 'sim' ? null : { label: 'Set as Top Module', action: () => setViewAsTop(file) },
    { label: 'Rename…', action: () => renameDialog(file) },
    { label: 'Convert to State Diagram (FSM)…', action: () => asmToFsmDiagram(file) },
    clashItem(file),
    { label: 'Remove from Project', action: () => removeModule(file) },
  ].filter(Boolean), e.clientX, e.clientY);
}

// ---- state diagrams (.fsm.json): bubble diagram -> HDL module, synchronized like ASM charts
// The generated module is linked by generatedFile: every change of the diagram rewrites it (its HDL
// file is read-only, #1176); a diagram with errors leaves it as it was, and the HDL editor and the
// diagram show the out-of-sync banner with the reason. Editor: fsm-editor.js; model, tables, HDL: core/fsm.js.
export async function openFsm(path) {
  const id = `fsm:${path}`;
  if (findDoc(id)) return activateDoc(findDoc(id));
  let model;
  try { model = JSON.parse(await api.readFile(S.project.name, path)); }
  catch (e) { toast(`Cannot open ${path}: ${e.message}`, 'error'); return; }
  const { mountFsmEditor } = await import('./fsm-editor.js');
  openDoc({
    id, path, title: path.split('/').pop(), icon: 'fsm',
    create(el, d) {
      const host = h('div', { class: 'doc-body' });
      el.append(host);
      const ed = mountFsmEditor(host, {
        model,
        onChange: () => setDirty(d, true),
        linkInfo: () => { const f = S.schOwners?.[path]; return f ? { file: f, why: S.outOfSync?.[f] } : null; },
        onOpenFile: f => openFile(f),
        onTruthTables: () => fsmTruthTables(path),
        onToAsm: () => fsmToAsmChart(path),
      });
      d.fsmEditor = ed;
      return {
        save: async () => {
          const m = ed.getModel();
          await api.writeFile(S.project.name, path, JSON.stringify(m, null, 2)); setDirty(d, false);
          if (!S.syncing) syncHdlFromFsm(path, m).catch(e => log(`WARNING: HDL not synchronized: ${e.message}`, 'warn'));
        },
        destroy: () => ed.destroy?.(),
      };
    },
  });
}
const fsmModel = async path => { const d = findDoc(`fsm:${path}`); if (d?.fsmEditor) { await flushDoc(d); return d.fsmEditor.getModel(); } return JSON.parse(await api.readFile(S.project.name, path)); };
const refreshFsmLink = fsmPath => findDoc(`fsm:${fsmPath}`)?.fsmEditor?.refreshLink();
const fsmDir = p => (p.includes('/') ? p.replace(/\/[^/]*$/, '') : 'src');
/** A file name `${dir}/${base}${ext}` (and module name) not used yet in the project. */
function freeName(dir, base, ext) {
  let name = base, k = 1;
  while (S.fileTree.includes(`${dir}/${name}${ext}`) || S.modules.some(x => x.name.toLowerCase() === name.toLowerCase())) name = `${base}${++k}`;
  return name;
}

export async function syncHdlFromFsm(fsmPath, model) {
  const target = model.generatedFile;
  if (!target || !S.fileTree.includes(target)) return;
  if (await drawnHdlLanguage(fsmPath, model)) return;
  const { generateFsm, fsmErrors, normalizeFsm } = await import('/core/fsm.js');
  const m = normalizeFsm(model);
  S.outOfSync ||= {};
  const errs = fsmErrors(m);
  if (errs.length) {
    const why = `the state diagram has errors: ${errs.map(x => x.message).join('; ')}`;
    if (S.outOfSync[target] !== why) log(`WARNING: ${target} not updated: ${why}`, 'warn');
    S.outOfSync[target] = why; staleHdl(target, fsmPath, why); refreshSyncBanner(target); refreshFsmLink(fsmPath);
    return;
  }
  const g = generateFsm(m, /\.v$/i.test(target) ? 'verilog' : 'vhdl', { source: fsmPath.split('/').pop() });
  freshHdl(target);
  // back in sync once the HDL is written (not before: the link would say so while the file is old)
  const inSync = () => { if (S.outOfSync[target]) { delete S.outOfSync[target]; refreshSyncBanner(target); refreshFsmLink(fsmPath); } };
  const cur = S.sources.find(x => x.path === target)?.text;
  if (cur === g.code) return inSync();
  S.syncing = true;
  try {
    await api.writeFile(S.project.name, target, g.code);
    inSync();
    const src = S.sources.find(x => x.path === target); if (src) src.text = g.code;
    refreshOpenEditor(target, g.code);
    compileProject(); renderHierarchy(); markStale();
    status(`${target} updated from ${fsmPath.split('/').pop()}`);
  } finally { S.syncing = false; }
}

// the state diagram `old` made again from its HDL module: { model, warnings }; throws why it cannot be
async function fsmFromHdlFile(hdlPath, old) {
  const mods = S.modules.filter(m => m.file === hdlPath && m.kind !== 'package');
  const mod = mods.find(m => m.name.toLowerCase() === String(old.name || '').toLowerCase()) || mods[0];
  if (!mod) throw new Error(`${hdlPath.split('/').pop()} has no module`);
  const { fsmFromHdl, normalizeFsm } = await import('/core/fsm.js');
  const text = S.sources.find(x => x.path === hdlPath)?.text ?? await api.readFile(S.project.name, hdlPath);
  let r;
  try { r = fsmFromHdl(text, { path: hdlPath, module: mod.name, lang: /\.v$/i.test(hdlPath) ? 'verilog' : 'vhdl', previous: old }); }
  catch (e) { throw new Error(`the diagram cannot show it: ${e.message}`); }
  return { model: normalizeFsm({ ...r.model, generatedFile: hdlPath }), warnings: r.warnings };
}

// HDL module -> state diagram, linked to the HDL file (the diagram becomes the base)
export async function convertToFsm(mod) {
  const info = moduleInfo(mod);
  if (!info) return;
  await saveAll();
  const { fsmFromHdl } = await import('/core/fsm.js');
  const text = S.sources.find(x => x.path === info.file)?.text ?? await api.readFile(S.project.name, info.file);
  let r;
  try { r = fsmFromHdl(text, { path: info.file, module: mod, lang: info.lang }); }
  catch (e) { alertDlg('Convert to State Diagram', `'${mod}' cannot be shown as a state diagram:\n\n${e.message}`, 'error'); return; }
  const target = `${fsmDir(info.file)}/${mod}.fsm.json`;
  if (S.fileTree.includes(target) && !await confirmDlg('Convert to State Diagram', `${target} already exists. Overwrite it?`)) return;
  const model = { ...r.model, generatedFile: info.file };
  await api.writeFile(S.project.name, target, JSON.stringify(model, null, 2));
  log(`'${mod}' converted to the state diagram ${target}; it stays in sync with ${info.file}.`, 'ok');
  for (const w of r.warnings || []) log(`WARNING: ${target}: ${w}`, 'warn');
  await reloadProject(false);
  openFsm(target);
}

// "Convert to ASM chart": a new (unlinked) ASM chart of the machine
async function fsmToAsmChart(fsmPath) {
  const { fsmToAsm, fsmErrors, normalizeFsm } = await import('/core/fsm.js');
  const m = normalizeFsm(await fsmModel(fsmPath));
  const errs = fsmErrors(m);
  if (errs.length) { alertDlg('Convert to ASM chart', errs.map(x => x.message).join('\n'), 'error'); return; }
  const dir = fsmDir(fsmPath);
  const name = freeName(dir, `${m.name}_asm`, '.asm.json');
  const asm = { ...fsmToAsm(m), name };
  delete asm.generatedFile; delete asm.base;
  const target = `${dir}/${name}.asm.json`;
  await api.writeFile(S.project.name, target, JSON.stringify(asm, null, 2));
  log(`State diagram '${fsmPath}' -> ASM chart ${target} (module '${name}'; not linked to the diagram).`, 'ok');
  await reloadProject(false);
  openAsm(target);
}

// ASM chart context menu: a new (unlinked) state diagram of the chart
async function asmToFsmDiagram(asmPath) {
  const { asmToFsm } = await import('/core/fsm.js');
  let asm;
  try { asm = JSON.parse(await api.readFile(S.project.name, asmPath)); } catch (e) { toast(e.message, 'error'); return; }
  let m;
  try { m = asmToFsm(asm); }
  catch (e) { alertDlg('Convert to State Diagram', `${asmPath.split('/').pop()} cannot be shown as a state diagram:\n\n${e.message}`, 'error'); return; }
  const dir = fsmDir(asmPath);
  const name = freeName(dir, `${asm.name || 'fsm'}_fsm`, '.fsm.json');
  m.name = name;
  delete m.generatedFile; delete m.base;
  const target = `${dir}/${name}.fsm.json`;
  await api.writeFile(S.project.name, target, JSON.stringify(m, null, 2));
  log(`ASM chart '${asmPath}' -> state diagram ${target} (module '${name}'; not linked to the chart).`, 'ok');
  await reloadProject(false);
  openFsm(target);
}

// "Create Truth Tables": next-state bits and outputs as functions of the state bits and the inputs
async function fsmTruthTables(fsmPath) {
  const { truthTablesOf, normalizeFsm } = await import('/core/fsm.js');
  const m = normalizeFsm(await fsmModel(fsmPath));
  const r = truthTablesOf(m);
  if (r.error) { alertDlg('Create Truth Tables', r.error, 'error'); return; }
  const dir = fsmDir(fsmPath);
  const made = [];
  for (const t of r.tables) {
    const name = freeName(dir, t.doc.name, '.tt.json');
    const target = `${dir}/${name}.tt.json`;
    await api.writeFile(S.project.name, target, JSON.stringify({ ...t.doc, name }, null, 2));
    made.push(target);
  }
  log(`State diagram '${fsmPath}' -> truth tables ${made.join(', ')} (next-state and output logic of the ${m.encoding} encoding; unused codes are don't cares).`, 'ok');
  await reloadProject(false);
  for (const f of made.reverse()) await openTt(f);
}

// ---- Petri nets (.pn.json): their HDL file made with them (#207), kept in sync with the net, one way
// (its HDL language: the net's, #220); a module by itself while it has errors (core/view-hdl.js)
export async function openPetri(path) {
  const id = `pn:${path}`;
  if (findDoc(id)) return activateDoc(findDoc(id));
  let model;
  try { model = JSON.parse(await api.readFile(S.project.name, path)); }
  catch (e) { toast(`Cannot open ${path}: ${e.message}`, 'error'); return; }
  const { mountPetriEditor } = await import('./petri-editor.js');
  openDoc({
    id, path, title: path.split('/').pop(), icon: 'petri',
    create(el, d) {
      const host = h('div', { class: 'doc-body' });
      el.append(host);
      const ed = mountPetriEditor(host, {
        model,
        onChange: () => setDirty(d, true),
        linkInfo: () => { const f = S.schOwners?.[path]; return f ? { file: f } : null; },
        onOpenFile: f => openFile(f),
      });
      d.petriEditor = ed;
      return {
        save: async () => {
          const m = ed.getModel();
          await api.writeFile(S.project.name, path, JSON.stringify(m, null, 2)); setDirty(d, false);
          if (m.generatedFile && S.fileTree.includes(m.generatedFile)) await syncHdlFromPetri(path, m).catch(e => log(`WARNING: HDL not synchronized: ${e.message}`, 'warn'));
        },
        destroy: () => ed.destroy?.(),
      };
    },
  });
}
async function syncHdlFromPetri(path, m) {
  if (await drawnHdlLanguage(path, m)) return;
  const { generatePetri } = await import('/core/petri.js');
  let g;
  try { g = generatePetri(m, m.lang, { source: path.split('/').pop() }); } catch (e) { staleHdl(m.generatedFile, path, `the Petri net has errors: ${e.message}`); return; }   // (errors: shown in the editor)
  freshHdl(m.generatedFile);
  if (S.sources.find(x => x.path === m.generatedFile)?.text === g.code) return;
  await api.writeFile(S.project.name, m.generatedFile, g.code);
  const src = S.sources.find(x => x.path === m.generatedFile); if (src) src.text = g.code;
  refreshOpenEditor(m.generatedFile, g.code);
  compileProject(); markStale();
}
export function petriContextMenu(e, file) {
  popupMenu([
    { label: 'Open', action: () => openPetri(file) },
    S.view === 'sim' ? null : { label: 'Set as Top Module', action: () => setViewAsTop(file) },
    { label: 'Rename…', action: () => renameDialog(file) },
    clashItem(file),
    { label: 'Remove from Project', action: () => removeModule(file) },
  ].filter(Boolean), e.clientX, e.clientY);
}

export function fsmContextMenu(e, file) {
  popupMenu([
    { label: 'Open', action: () => openFsm(file) },
    S.view === 'sim' ? null : { label: 'Set as Top Module', action: () => setViewAsTop(file) },
    { label: 'Rename…', action: () => renameDialog(file) },
    { label: 'Convert to ASM chart', action: () => fsmToAsmChart(file) },
    clashItem(file),
    { label: 'Remove from Project', action: () => removeModule(file) },
  ].filter(Boolean), e.clientX, e.clientY);
}

// ---- schematic editor (.sch.json): schematic <-> HDL
export async function schModules() {
  const { modulesFromLibrary } = await import('/core/schdoc.js');
  const sources = Object.fromEntries(S.sources.map(s => [s.path, s.text]));
  const mods = modulesFromLibrary(S.lib, { sources });
  // the test benches (Simulation-only sources, #332): not offered in the palette's Project modules
  const sim = new Set(S.sources.filter(s => s.role === 'sim').map(s => s.path));
  for (const m of Object.values(mods)) if (sim.has(m.file)) m.testbench = true;
  return mods;
}

/** The project's part: its record in the device database (a Device Primitives' family and count, #791). */
export const projectPart = () => S.devices?.parts?.find(p => p.part === S.project?.device?.part) || null;

export async function openSch(path) {
  const id = `sch:${path}`;
  if (findDoc(id)) return activateDoc(findDoc(id));
  let doc;
  try { doc = JSON.parse(await api.readFile(S.project.name, path)); }
  catch (e) { toast(`Cannot open ${path}: ${e.message}`, 'error'); return; }
  const { mountSchEditor } = await import('./sch-editor.js');
  const modules = await schModules();
  openDoc({
    id, path, title: path.split('/').pop(), icon: 'schematic',
    create(el, d) {
      const host = h('div', { class: 'doc-body' });
      el.append(host);
      const save = async m => { await api.writeFile(S.project.name, path, JSON.stringify(m, null, 1)); setDirty(d, false); };
      const ed = mountSchEditor(host, {
        doc, modules, device: projectPart(),
        simSources: () => S.sources,   // live simulation: bodies of the module symbols
        onChange: () => setDirty(d, true),
        onOpenModule: name => { const i = moduleInfo(name); if (i) openFile(i.file, i.line); },
      });
      d.schEditor = ed;
      return {
        save: async () => {
          const m = ed.getDoc();
          await save(m);
          if (!S.syncing) syncHdlFromSchematic(path, m).catch(e => log(`WARNING: HDL not synchronized: ${e.message}`, 'warn'));
        },
        destroy: () => ed.destroy?.() };
    },
  });
}

// ---- views of an HDL file: schematic or ASM chart
export const isAsm = p => /\.asm\.json$/i.test(p || '');
export const isTt = p => /\.tt\.json$/i.test(p || '');
export const isFsm = p => /\.fsm\.json$/i.test(p || '');
export const isPn = p => /\.pn\.json$/i.test(p || '');
export const viewNoun = p => (isAsm(p) ? 'state machine' : isTt(p) ? 'truth table' : isFsm(p) ? 'state diagram' : isPn(p) ? 'Petri net' : 'schematic');
export const viewTitle = p => (isAsm(p) ? 'State Machine' : isTt(p) ? 'Truth Table' : isFsm(p) ? 'State Diagram' : isPn(p) ? 'Petri Net' : 'Schematic');
export const viewIcon = p => (isAsm(p) ? 'asm' : isTt(p) ? 'truthtable' : isFsm(p) ? 'fsm' : isPn(p) ? 'petri' : 'schematic');
export const viewKind = p => (isAsm(p) ? 'asm' : isTt(p) ? 'tt' : isFsm(p) ? 'fsm' : isPn(p) ? 'pn' : 'sch');
export const viewContextMenu = (e, f) => (isAsm(f) ? asmContextMenu : isTt(f) ? ttContextMenu : isFsm(f) ? fsmContextMenu : isPn(f) ? petriContextMenu : schContextMenu)(e, f);
export function openView(p) { return isAsm(p) ? openAsm(p) : isTt(p) ? openTt(p) : isFsm(p) ? openFsm(p) : isPn(p) ? openPetri(p) : openSch(p); }
// a view's badge in the Design tree (#207)
export const viewBadge = p => (isAsm(p) ? 'ASM' : isTt(p) ? 'Table' : isFsm(p) ? 'FSM' : isPn(p) ? 'Petri' : 'Schematic');

// the commands of a module's drawing (its badge in the Design tree): the drawing is the base, its HDL
// file generated from it (#220)
export function syncedViewMenu(e, sch) {
  popupMenu([
    { label: 'Open', action: () => openView(sch) },
    isAsm(sch) ? { label: 'Convert to State Diagram (FSM)…', action: () => asmToFsmDiagram(sch) } : null,
    isFsm(sch) ? { label: 'Convert to ASM chart', action: () => fsmToAsmChart(sch) } : null,
    viewKind(sch) === 'sch' ? { label: 'Export as ISE Schematic (.sch)…', action: () => exportSchAsIse(sch) } : null,
    { label: 'Remove from Project', action: () => removeModule(sch) },
  ].filter(Boolean), e.clientX, e.clientY);
}

// A drawing's language changed (its editor's HDL language, a schematic's Language): its HDL file,
// generated from it, is made again in that language, the file in the other language removed (#220:
// no Generate HDL any more). Not while it has errors (its file stays until it has none). Returns
// whether its language had changed (the HDL then written here).
export async function drawnHdlLanguage(path, m) {
  const owned = m.generatedFile;
  const L = m.lang === 'verilog' ? 'Verilog' : 'VHDL';
  if (!owned || !S.fileTree.includes(owned) || /\.v$/i.test(owned) === (L === 'Verilog')) return false;
  const r = viewHdl(path, JSON.stringify({ ...m, generatedFile: undefined }), { modules: viewKind(path) === 'sch' ? await schModules() : {} });
  if (!r?.text || r.errors.length) { status(`${owned.split('/').pop()} not made in ${L} yet: ${path.split('/').pop()} has errors`); return true; }
  const target = owned.replace(/\.[^./]+$/, L === 'Verilog' ? '.v' : '.vhd');
  if ((S.diskTree || S.fileTree).includes(target)) { log(`WARNING: the HDL of ${path} is not made in ${L}: ${target} exists already`, 'warn'); return true; }
  S.syncing = true;
  try {
    closeDocByPath(owned);
    await api.deleteFile(S.project.name, owned);
    await api.writeFile(S.project.name, target, r.text);
    const next = { ...m, generatedFile: target };
    await api.writeFile(S.project.name, path, JSON.stringify(next, null, viewKind(path) === 'sch' ? 1 : 2));
    linkOpenEditor(path, target);
    log(`${path}: its HDL is now in ${L}, ${target} (${owned} removed)`, 'info');
  } finally { S.syncing = false; }
  await reloadProject(false);
  markStale();
  const d = findDoc(`${viewKind(path)}:${path}`);
  (d?.ttEditor || d?.fsmEditor || d?.petriEditor)?.refreshLink?.();
  return true;
}

// Every source has its HDL file (#207): a drawn source without one (a module by itself, #177) gets
// it, the HDL made for it (core/view-hdl.js) written next to it and linked (generatedFile), the
// drawing staying the base. Not when it has errors (it stays a module by itself until it has none)
// or a file of that name is there already (said, and resolved from its menu: drawnHdlClashes, #230).
// Returns how many were linked.
export async function adoptDrawnHdl() {
  let n = 0;
  for (const v of S.viewSources || []) {
    if (v.errors || !v.module || !S.project) continue;
    const target = drawnHdlPath(v.path, v.module, v.lang);
    if ((S.diskTree || S.fileTree || []).includes(target)) continue;
    if (!await writeDrawnHdl(v.path, target, v.text)) continue;
    // (#231: its HDL file was deleted, or removed from the project and another name is free)
    log(`${target} generated from ${v.path} (${!v.lost ? 'every source has its HDL' : `its HDL file ${v.lost} ${(S.diskTree || []).includes(v.lost) ? 'was removed from the project' : 'is no longer in the project folder'}`})`, 'info');
    n++;
  }
  return n;
}

// writes `hdl` (the HDL made from the drawing `path`) to `target` and links the drawing to it
// (generatedFile); false when the drawing cannot be read
async function writeDrawnHdl(path, target, hdl) {
  let m;
  try { m = JSON.parse(S.viewTexts[path]); } catch { return false; }
  m.generatedFile = target;
  const text = JSON.stringify(m, null, isAsm(path) || isTt(path) || isFsm(path) || isPn(path) ? 2 : 1);
  await api.writeFile(S.project.name, target, hdl);   // (registers the module in the project)
  await api.writeFile(S.project.name, path, text);
  S.viewTexts[path] = text;
  linkOpenEditor(path, target);
  return true;
}

// an open editor of the drawing keeps the link (its next save writes it): the link alone, its undo
// history, selection and view kept (#245: not the whole model again, which reset them)
function linkOpenEditor(path, target) {
  const d = findDoc(`${viewKind(path)}:${path}`);
  (d?.schEditor || d?.asmEditor || d?.ttEditor || d?.fsmEditor || d?.petriEditor)?.setLink(target);
}

// ---- a drawing whose HDL file name is taken (#230)
// A drawn source (no errors) left without its HDL file because a file is in the way: the file of its
// name (src/<module>.vhd) holds something else, or a file (that one or another HDL file of the project)
// defines its module already. Found after every load (S.hdlClash: drawing -> drawnHdlClash), said once
// in the console per opening of the project (never a dialog then), shown on its Design-pane row (a
// [No HDL] badge, its tip says why) and resolved from its menu, Generate HDL File… (resolveHdlClash).
export const clashTip = c => (c.kind === 'same'
  ? `No HDL file: ${c.file} defines its module ${c.module} already. Generate HDL File… (right-click) replaces it with the HDL generated from the drawing.`
  : c.kind === 'removed'
    ? `No HDL file: its HDL file ${c.file} was removed from the project. Generate HDL File… (right-click) makes it again from the drawing.`
  : c.kind === 'drawn'
    ? `No HDL file: its module ${c.module} is the module of ${c.other}. Rename one of them.`
    : `No HDL file: ${c.target} holds something else. Generate HDL File… (right-click) writes its HDL to ${c.free}.`);
export async function drawnHdlClashes() {
  S.hdlClash = {};
  if (!S.project) return;
  const disk = new Set(S.diskTree || S.fileTree || []);
  const texts = {};
  const cands = [
    ...(S.viewSources || []).filter(v => !v.errors && v.module).map(v => ({ path: v.path, module: v.module, lang: v.lang, definedIn: null, lost: v.lost })),
    ...Object.entries(S.viewElsewhere || {}).map(([path, v]) => ({ path, module: v.module, lang: v.lang, definedIn: v.file, lost: v.lost })),
  ];
  for (const v of cands) {
    const target = drawnHdlPath(v.path, v.module, v.lang);
    if (!v.definedIn && disk.has(target) && texts[target] === undefined) {
      texts[target] = S.sources.find(s => s.path === target && !s.view)?.text ?? await api.readFile(S.project.name, target).catch(() => null);
    }
    let c = drawnHdlClash({ ...v, exists: p => disk.has(p), read: p => texts[p] ?? null });
    if (!c) continue;
    // (its module is another drawing's, that file the other drawing's HDL: not replaced, one is renamed)
    if (c.kind === 'same' && S.hdlToSch?.[c.file] && S.hdlToSch[c.file] !== v.path) c = { ...c, kind: 'drawn', other: S.hdlToSch[c.file] };
    // (#231: that file is its own HDL file, removed from the project: made again from it, once the user says so)
    else if (c.kind === 'same' && c.file === v.lost && !hdlInProject(c.file)) c = { ...c, kind: 'removed' };
    S.hdlClash[v.path] = c;
    const key = `${S.project.name}|${v.path}|${c.kind}|${c.file}`;
    if (S.hdlClashWarned?.has(key)) continue;
    (S.hdlClashWarned ||= new Set()).add(key);
    log(c.kind === 'same'
      ? `WARNING: ${v.path} has no HDL file: ${c.file} exists already and defines its module ${c.module}. Generate HDL File… (its right-click menu in the Design pane) replaces ${c.file} with the HDL generated from it.`
      : c.kind === 'removed'
        ? `WARNING: ${v.path} has no HDL file: its HDL file ${c.file} was removed from the project (it is still in the project folder). Generate HDL File… (its right-click menu in the Design pane) makes it again from ${v.path}; Add to Project (Files) brings it back as it is.`
      : c.kind === 'drawn'
        ? `WARNING: ${v.path} has no HDL file: its module ${c.module} is the module of ${c.other} (${c.file}). Rename one of them.`
        : `WARNING: ${v.path} has no HDL file: ${c.target} exists already and holds something else. Generate HDL File… (its right-click menu in the Design pane) writes its HDL to ${c.free}.`, 'warn');
  }
}
// the menu item of a drawing without its HDL file
export const clashItem = file => (S.hdlClash?.[file] && S.hdlClash[file].kind !== 'drawn' ? { label: 'Generate HDL File…', action: () => resolveHdlClash(file) } : null);
// Generate HDL File…: the file that defines its module replaced (once the user says so) or the free
// name written; the drawing linked to it
export async function resolveHdlClash(path) {
  const c = S.hdlClash?.[path];
  if (!c || !S.project) return false;
  if (c.kind === 'drawn') { alertDlg('Generate HDL File', clashTip(c), 'warn'); return false; }
  const name = path.split('/').pop();
  if (c.kind === 'same' && !await confirmDlg('Generate HDL File', `${c.file} defines the module ${c.module} already.\n\nReplace it with the HDL generated from ${name}? Its current contents will be lost.`)) return false;
  if (c.kind === 'removed' && !await confirmDlg('Generate HDL File', `${c.file}, the HDL file of ${name}, was removed from the project.\n\nMake it again from ${name} and put it back in the project? Its current contents will be lost.`)) return false;
  const r = viewHdl(path, S.viewTexts?.[path] ?? '', { modules: viewKind(path) === 'sch' ? await schModules() : {}, linked: hdlInProject });
  if (!r?.text || r.errors.length) { alertDlg('Generate HDL File', `${name} has errors: correct them first.`, 'error'); return false; }
  const target = c.kind === 'same' || c.kind === 'removed' ? c.file : c.free;
  closeDocByPath(target);
  if (!await writeDrawnHdl(path, target, r.text)) return false;
  log(c.kind === 'same' ? `${target} replaced by the HDL generated from ${path}, linked to it`
    : c.kind === 'removed' ? `${target} generated again from ${path}, back in the project`
      : `${target} generated from ${path} (${c.target} holds something else)`, 'info');
  await reloadProject(false);
  markStale();
  return true;
}

// banner of an HDL editor: a file generated from a drawing (the drawing is the base, #220) is read-only,
// edited in the drawing (#1176): it says so, links to the drawing, and says when it is out of sync and
// why. Any other file: the element stays, empty and hidden, for a file linked to a drawing later
export function syncBanner(path) {
  const sch = S.hdlToSch?.[path];
  if (!sch) return h('span', { class: 'gen-banner', hidden: true, 'data-sync-banner': path });
  const why = S.outOfSync?.[path];
  const link = h('a', { onclick: () => openView(sch) }, sch.split('/').pop());
  if (!why) return h('span', { class: 'gen-banner read-only', 'data-sync-banner': path }, 'Read-only, generated from ', link);
  return h('span', { class: 'gen-banner read-only out-of-sync', 'data-sync-banner': path }, 'Read-only, not in sync with ', link,
    isTt(sch) || isFsm(sch) ? ` — ${why}` : ` — the ${viewNoun(sch)} has errors: ${why}`);
}
export function refreshSyncBanner(path) {
  for (const el of document.querySelectorAll('[data-sync-banner]')) if (el.dataset.syncBanner === path) el.replaceWith(syncBanner(path));
}

// a top port as the UCF sees it: vectors (also 1-bit ones, x<0>) have msb / lsb
// the top's ports as parseUcf takes them (undefined when the design does not elaborate: parseUcf then
// treats any name[i] as a bus bit, as before)
export function topUcfPorts() {
  try { const d = S.lib && S.project?.top ? elaborate(S.lib, S.project.top) : null; return d?.top ? d.top.ports.map(ucfPort) : undefined; } catch { return undefined; }
}

export function ucfPort(p) {
  const t = p.sig.t, bus = t.w > 1 || (t.kind === 'logic' && !t.scalar);
  return { name: p.name, dir: p.dir, width: t.w, msb: bus ? t.left : null, lsb: bus ? t.right : null };
}

export function refreshOpenEditor(path, text) {
  const od = findDoc(`file:${path}`);
  if (od && !od.dirty) { od.editor.setValue(text); od.editor.markClean(); setDirty(od, false); }
}

export async function syncHdlFromSchematic(schPath, doc) {
  const target = doc.generatedFile || S.schOwners?.[schPath];
  if (!target) return;                    // (a schematic with errors: linked once it has none, #207)
  if (!hdlInProject(target)) return;      // (its HDL file gone: not written back silently, #231)
  if (await drawnHdlLanguage(schPath, { ...doc, generatedFile: target })) return;
  const { generateHdl } = await import('/core/schdoc.js');
  let g;
  try { g = generateHdl(doc, { lang: doc.lang, modules: await schModules() }); }
  catch (e) { log(`WARNING: ${target} not updated from ${schPath}: ${e.message}`, 'warn'); return; }
  const errs = (g.diagnostics || []).filter(x => x.severity === 'error');
  S.outOfSync ||= {};
  if (errs.length) {
    // show it where the user works: the schematic's Check panel, the HDL editor's banner, the console
    const why = errs.map(x => x.message).join('; ');
    if (S.outOfSync[target] !== why) log(`WARNING: ${target} not updated: the schematic ${schPath} has ${errs.length} error(s): ${why}`, 'warn');
    S.outOfSync[target] = why; staleHdl(target, schPath, `the schematic has errors: ${why}`);
    findDoc(`sch:${schPath}`)?.schEditor?.check();
    refreshSyncBanner(target);
    status(`${target.split('/').pop()} not updated: ${why}`);
    return;
  }
  freshHdl(target);
  if (S.outOfSync[target]) { delete S.outOfSync[target]; refreshSyncBanner(target); }
  const cur = S.sources.find(x => x.path === target)?.text;
  if (cur === g.code) return;
  S.syncing = true;
  try {
    await api.writeFile(S.project.name, target, g.code);
    const src = S.sources.find(x => x.path === target); if (src) src.text = g.code;
    refreshOpenEditor(target, g.code);
    compileProject(); renderHierarchy(); markStale();
    status(`${target} updated from ${schPath.split('/').pop()}`);
  } finally { S.syncing = false; }
}

// HDL -> editable schematic, for any HDL module (#225). The schematic becomes the module's base and
// its HDL file is generated from it at once (core/hdl-to-sch.js): what can be drawn is drawn, the rest
// (processes, always blocks, generates…) kept as HDL blocks of the schematic, so that the design does
// not change (checked: the conversion is refused when the generated HDL would not compile as the
// module did). A file that holds other design units too keeps them; the module's HDL then goes to a
// file of its own.
export async function convertToSchematic(mod) {
  const info = moduleInfo(mod);
  if (!info) return;
  await saveAll();
  const { convertModuleToSchematic } = await import('/core/hdl-to-sch.js');
  status(`Converting ${mod} to a schematic…`);
  try {
    const elk = window.ELK ? new window.ELK() : null;
    // (the drawn sources without an HDL file of their own too: modules of the project, #177)
    const sources = S.sources.filter(s => s.lang === 'vhdl' || s.lang === 'verilog')
      .map(s => ({ ...s, role: S.project.files.find(f => f.path === s.path)?.role || s.role || 'design' }));
    const r = await convertModuleToSchematic({ sources, module: info.name, layout: elk ? g => elk.layout(g) : undefined, exists: p => (S.diskTree || S.fileTree || []).includes(p) });
    const target = r.schPath;
    if (S.fileTree.includes(target) && !await confirmDlg('Convert to Schematic', `${target} already exists. Overwrite it?`)) return;
    const doc = { ...r.doc };
    delete doc.importDiagnostics;
    S.syncing = true;
    try {
      for (const [p, text] of Object.entries(r.writes)) {
        if (text == null) { closeDocByPath(p); await api.deleteFile(S.project.name, p); continue; }
        await api.writeFile(S.project.name, p, text);
        refreshOpenEditor(p, text);
      }
      await api.writeFile(S.project.name, target, JSON.stringify(doc, null, 1));
    } finally { S.syncing = false; }
    // a new file (a file of several design units split) keeps the role of the file it comes from
    const pj = await api.project(S.project.name);
    let roles = false;
    for (const [p, role] of Object.entries(r.newFiles)) { const nf = pj.files?.find(f => f.path === p); if (nf && nf.role !== role) { nf.role = role; roles = true; } }
    if (roles) { delete pj.fileTree; S.project = pj; await saveProjectJson(); }
    const { blocks, drawn } = r.counts;
    log(`'${mod}' converted to the schematic ${target} (${drawn} symbol${drawn === 1 ? '' : 's'} drawn, ${blocks} HDL block${blocks === 1 ? '' : 's'} keeping the HDL that is not drawn): it is now the module's base, ${r.hdlPath} generated from it.`, 'ok');
    for (const p of Object.keys(r.newFiles)) {
      log(p === r.hdlPath ? `'${mod}' taken out of ${r.kept.join(', ')} into ${p}: the other design units of ${r.kept.length === 1 ? 'that file' : 'those files'} stay there.`
        : `The other design units of ${r.hdlPath} moved to ${p}.`, 'info');
    }
    for (const p of Object.keys(r.writes).filter(p => r.writes[p] == null)) log(`${p} removed: what it held is in ${r.hdlPath}.`, 'info');
    for (const w of r.warnings) log(`WARNING: ${w}`, 'warn');
    await reloadProject(false);
    markStale();
    openSch(target);
  } catch (e) {
    alertDlg('Convert to Schematic', e.message, 'error');
  } finally { status('Ready'); }
}

// A drawing is always the base, its HDL file generated from it (#220). A project made before may
// have a drawing whose base was its HDL (`base: 'hdl'` in the drawing's file: the HDL edited, the
// drawing following it): the drawing becomes the base without losing the user's work. As it is when
// its HDL file is what it makes; else an ASM chart, state diagram or truth table is made again from
// its HDL file, that file kept as it is (what the drawing does not make of it is said: an edit of
// the drawing rewrites it); else (a schematic or a Petri net, not made again from HDL that is not
// theirs; HDL the drawing cannot show) the HDL file stays as it is, a plain HDL module, and the
// drawing leaves the project (its file kept in the project folder, as Remove from Project). Each one
// is logged. Returns how many it changed.
export async function drawingsAsBase() {
  let n = 0;
  for (const [f, hdlPath] of Object.entries(S.schOwners || {})) {
    let old;
    try { old = JSON.parse(S.viewTexts[f]); } catch { continue; }
    if (old?.base !== 'hdl') continue;
    const kind = viewKind(f), noun = viewNoun(f);
    const hdl = S.sources.find(s => s.path === hdlPath)?.text;
    const lang = /\.v$/i.test(hdlPath) ? 'verilog' : 'vhdl';
    // the HDL a model of the drawing makes (a schematic in its own language, as its HDL is written)
    const makes = async m => viewHdl(f, JSON.stringify({ ...m, generatedFile: undefined, base: undefined, ...(kind === 'sch' ? {} : { lang }) }), { modules: kind === 'sch' ? await schModules() : {} })?.text;
    let next = null, warnings = [], why = `${hdlPath.split('/').pop()} is not what the ${noun} makes`;
    // (blank lines aside: the generators' layout may change, e.g. #224)
    const same = (a, b) => String(a).replace(/\n[ \t]*(?=\n)/g, '') === String(b).replace(/\n[ \t]*(?=\n)/g, '');
    if (same(await makes(old), hdl)) next = old;
    else if (kind === 'asm' || kind === 'fsm' || kind === 'tt') {
      try {
        if ((S.lib?.errors || []).some(x => x.severity === 'error' && x.file === hdlPath)) throw new Error(`${hdlPath.split('/').pop()} has errors`);
        const r = kind === 'asm' ? await asmFromHdlFile(hdlPath, { module: old.name, previous: old }) : kind === 'fsm' ? await fsmFromHdlFile(hdlPath, old) : { model: await ttFromHdl(hdlPath, old) };
        next = { ...r.model, generatedFile: hdlPath };
        warnings = r.warnings?.length ? r.warnings : same(await makes(next), hdl) ? [] : [`${hdlPath} is not what the ${noun} makes (edited by hand): it is kept as it is until the ${noun} is edited, which rewrites it`];
      } catch (e) { why = e.message; }
    }
    const d = findDoc(`${kind}:${f}`);
    const ed = d?.schEditor || d?.asmEditor || d?.ttEditor || d?.fsmEditor || d?.petriEditor;
    const m = { ...(next || old) };
    delete m.base;
    if (!next) delete m.generatedFile;
    const text = JSON.stringify(m, null, kind === 'sch' ? 1 : 2);
    await api.writeFile(S.project.name, f, text);
    S.viewTexts[f] = text;
    if (ed?.setDoc) ed.setDoc(m); else ed?.setModel?.(m);
    if (next) {
      log(next === old ? `${f} is now the base of ${hdlPath} (its base until now): that file is what the ${noun} makes, generated from it from now on.`
                       : `${f} made again from ${hdlPath} (its base until now) and now its base: that file is generated from the ${noun} from now on.`, 'info');
      for (const w of warnings) log(`WARNING: ${f}: ${w}`, 'warn');
    } else {
      S.project.excluded = [...new Set([...(S.project.excluded || []), f])];
      await saveProjectJson();
      log(`WARNING: ${f} had its HDL ${hdlPath} as the base and cannot be made again from it (${why}): ${hdlPath} is kept as it is, a plain HDL module, and ${f} is removed from the project (the file stays in the project folder).`, 'warn');
    }
    n++;
  }
  return n;
}

// A schematic, ASM chart, state diagram or truth table on its own as the top: its HDL is generated
// (kept in sync, the drawing staying the base: as ISE makes a top-level schematic's HDL itself),
// and the module it defines becomes the top
export async function setViewAsTop(path) {
  // a drawn source without an HDL file is a module of the project by itself (its HDL made when it is
  // compiled or implemented, #177): it becomes the top as it is, no file written
  const mod = S.modules.find(m => m.file === path && m.kind !== 'package')?.name || topOfView(path);
  if (mod) {
    await setTop(mod, false);
    log(`Top module: ${mod} (${path.split('/').pop()}${S.schOwners?.[path] ? `, its HDL ${S.schOwners[path].split('/').pop()} generated from it` : ', no HDL file needed'}).`, 'ok');
    return;
  }
  // it does not make a module (errors in it): say why
  const r = viewHdl(path, S.viewTexts?.[path] ?? await api.readFile(S.project.name, path), { linked: hdlInProject });
  alertDlg('Set as Top Module', r?.errors?.length ? `${path.split('/').pop()} cannot be the top yet:\n${r.errors.slice(0, 8).join('\n')}` : `${path.split('/').pop()} defines no module that can be the top.`, 'error');
}
export const viewSel = () => (['sch', 'asm', 'tt', 'fsm', 'pn'].includes(S.sel?.type) ? S.sel.file : null);
export const topOfView = path => { const gen = S.schOwners?.[path] || path; return S.modules.find(m => m.file === gen && m.kind !== 'package')?.name || null; };

// Download a schematic as an ISE 14.7 schematic (.sch); custom symbols come along in a zip.
async function exportSchAsIse(schPath) {
  let doc;
  const od = findDoc(`sch:${schPath}`);
  try { doc = od?.schEditor ? od.schEditor.getDoc() : JSON.parse(await api.readFile(S.project.name, schPath)); }
  catch (e) { toast(e.message, 'error'); return; }
  const { exportIseSch } = await import('/core/isesch.js');
  const lang = doc.generatedFile && /\.v$/i.test(doc.generatedFile) ? 'verilog' : doc.lang;
  let r;
  try { r = exportIseSch(doc, { modules: await schModules(), family: S.project.device?.family || 'spartan3e', lang }); }
  catch (e) { alertDlg('Export as ISE Schematic', e.message, 'error'); return; }
  const base = schPath.split('/').pop().replace(/\.sch\.json$/i, '');
  if (!r.files.length) downloadText(`${base}.sch`, r.xml, 'application/xml');
  else {
    const { createZip, browserCodec } = await import('/core/zip.js');
    const zip = await createZip([{ path: `${base}.sch`, data: r.xml }, ...r.files.map(f => ({ path: f.path, data: f.text }))], browserCodec());
    const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
    downloadUrl(url, `${base}_ise_sch.zip`);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  log(`Exported ${schPath} as the ISE schematic ${base}.sch${r.files.length ? ` (+ ${r.files.length} symbol/HDL file(s) for custom symbols, in a zip)` : ''}.`, 'ok');
  for (const w of r.warnings) log(`WARNING: ${w}`, 'warn');
}

export function schContextMenu(e, file) {
  popupMenu([
    { label: 'Open', action: () => openSch(file) },
    S.view === 'sim' ? null : { label: 'Set as Top Module', action: () => setViewAsTop(file) },
    { label: 'Rename…', action: () => renameDialog(file) },
    { label: 'Export as ISE Schematic (.sch)…', action: () => exportSchAsIse(file) },
    clashItem(file),
    { label: 'Remove from Project', action: () => removeModule(file) },
  ].filter(Boolean), e.clientX, e.clientY);
}
