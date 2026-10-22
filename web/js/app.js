// Silinx Project Navigator — main application shell (ISE-like).
import { api, followJob } from './api.js';
import { icons, icon } from './icons.js';
import { h, dialog, alertDlg, confirmDlg, promptDlg, popupMenu, splitter, toast } from './ui.js';
import { createEditor, instTemplate, SNIPPETS, typeText } from './editor.js';
import { compile, topCandidates } from '/core/compile.js';
import { primitiveSources } from '/core/unisim.js';
import * as wiz from './wizards.js';
import { PRODUCT, VERSION_LABEL } from '/core/version.js';
import { startI18n, t } from './i18n.js';
import { applyPrefs, toggleTheme } from './modern.js';
import { initDrawer, drawerGiveWay, leftTabClicked } from './narrow.js';
import { initTasks } from './tasks.js';
import { createHistory } from './history.js';
import { viewHdl } from '/core/view-hdl.js';
import { modulesFromLibrary } from '/core/schdoc.js';
import { primitiveTemplates } from '/core/prim-templates.js';
import { deviceFamily } from '/core/family.js';
import { setActionRunner, longPressMenu } from './ui.js';
import { log, logLine, showConsolePage, setDiagnostics, renderDiagnostics, clearConsole } from './console.js';
import { isOwnFailure } from './own-error.js';
import { openProject, closeProject, reloadProject, updateTitle, renderStartPage, updateStorageStatus } from './project.js';
import { FLOW_UP_TO, checkUcfFile, regenerateUcf, runImpl, stepTracker, ucfDiagnostics } from './implement.js';
import { adoptDrawnHdl, drawnHdlClashes, freshHdl, isAsm, isFsm, isPn, isTt, openAsm, openFsm, openPetri, openSch,
  openTt, openTtSchematic, openView, projectPart, schModules, staleHdl, syncAsmFromHdl, syncBanner, syncFsmFromHdl, syncSchematicFromHdl,
  syncTtFromHdl, viewNoun, viewTitle } from './drawings.js';
import { checkFileSyntax, hdlDiagnostics, markStale, openMode, renderProcesses, saveAll } from './processes.js';
import { fileContextMenu, inView, renderHierarchy, saveProjectJson, select, serialOp, setTop, treeItem } from './design.js';
import { printActive, refreshSteps, setupMenus, setupToolbar, showPalette } from './menus.js';
import { openEmulator, openSchematic, runSimulation } from './viewers.js';
import { renameSymbolIn } from './rename.js';
import { writeClip, readClip, noteCopy, canPasteText } from './clipboard.js';

// ------------------------------------------------------------------ state
export const S = {
  project: null, devices: null, toolchain: null,
  view: 'impl', sources: [], lib: null, modules: [],
  sel: null, docs: [], active: null, status: {}, diags: [], busy: false,
  diagsCleared: 0,            // how many times the Errors / Warnings tabs were cleared (a project opened or closed)
  procCollapsed: new Set(),   // ids of the collapsed groups of the Processes panel
  treeOpen: new Map(),        // Design hierarchy / Files trees: key -> expanded? (as the user left it)
};
window.Silinx = S; // handy for debugging from the console

const $ = id => document.getElementById(id);

export { log, setDiagnostics };   // (web/js/console.js)

// the messages of one file checked again (after a quick fix), when the tabs list some of them
function recheckFile(path) {
  if (!S.project || !S.diags.some(x => x.file === path)) return;
  const doc = S.docs.find(o => o.path === path && o.editor);
  let fresh;
  try { fresh = hdlDiagnostics(path, doc ? doc.editor.getValue() : null).filter(x => x.file === path); } catch { return; }
  S.diags = [...S.diags.filter(x => x.file !== path), ...fresh];
  renderDiagnostics();
  doc?.editor.setDiagnostics(fresh);
}

export function status(text) { $('status-text').textContent = text; }

// ------------------------------------------------------------------ compile
// Sources plus Silinx's UNISIM models when they instantiate Xilinx primitives (VHDL `library
// UNISIM`, a Verilog BUFG / FDCE … instance, #17), for elaborating a design. The project's module
// list (compileProject) is compiled without them: the primitives are not project modules.
export const withPrimitives = srcs => [...primitiveSources(srcs), ...srcs];
// whether a drawing's HDL file (generatedFile) is there, in the project (#231: else it has none)
export const hdlInProject = f => (S.fileTree || []).includes(f);
export function compileProject() {
  if (!S.project) return;
  const srcs = S.sources.filter(s => !s.view && (s.lang === 'vhdl' || s.lang === 'verilog'));
  // the drawn sources without an HDL file (#177): their HDL, made here, compiled with the rest (a module
  // of the project, which can be the top, be simulated and implemented, with no file)
  S.viewSources = [];
  S.viewElsewhere = {};
  const views = Object.entries(S.viewTexts || {}).filter(([f]) => !S.schOwners?.[f]);
  // the modules of the HDL files, compiled once for the drawings below (#402)
  let hdlModules = null;
  if (views.length) {
    let mods = {}, lib0 = null;
    try { lib0 = compile(srcs); mods = modulesFromLibrary(lib0, { sources: Object.fromEntries(srcs.map(s => [s.path, s.text])) }); } catch { /* none */ }
    hdlModules = mods;
    // (a drawn source whose module an HDL file of the project already defines: that file, not a second
    // one; the drawing then has no HDL file, said, #230)
    const hdlMods = new Set(Object.keys(mods).map(n => n.toLowerCase()));
    // (a drawing whose HDL file is gone, deleted or removed from the project, is one without it: #231)
    for (const [f, t] of views) {
      const r = viewHdl(f, t, { modules: mods, linked: hdlInProject });
      if (!r?.text) continue;
      if (!hdlMods.has(String(r.module).toLowerCase())) { S.viewSources.push({ path: f, lang: r.lang, text: r.text, role: 'design', view: true, module: r.module, errors: r.errors.length, lost: r.lost || null }); continue; }
      const m = !r.errors.length && [...(lib0?.modules.values() || [])].find(x => x.name.toLowerCase() === String(r.module).toLowerCase());
      if (m) S.viewElsewhere[f] = { module: r.module, lang: r.lang, file: m.archFile || m.file, lost: r.lost || null };
    }
  }
  // the linked drawings that cannot generate their HDL file (errors: a project opened with one, #303), each
  // text once (an edit in its editor says it as it syncs)
  let lazyMods = hdlModules;
  for (const [f, t] of Object.entries(S.viewTexts || {})) {
    if (S.staleSeen?.get(f) === t) continue;
    let m;
    try { m = JSON.parse(t); } catch { continue; }
    if (!m.generatedFile || !hdlInProject(m.generatedFile)) continue;
    (S.staleSeen ||= new Map()).set(f, t);
    if (!lazyMods) { try { lazyMods = modulesFromLibrary(compile(srcs), { sources: Object.fromEntries(srcs.map(s => [s.path, s.text])) }); } catch { lazyMods = {}; } }
    let r = null;
    try { r = viewHdl(f, t, { modules: lazyMods, linked: () => false }); } catch { /* not a drawing */ }
    if (r?.errors?.length) staleHdl(m.generatedFile, f, `it has errors: ${r.errors.map(e => e.replace(`${f}: `, '')).join('; ')}`);
    else if (r) freshHdl(m.generatedFile);
  }
  // (in S.sources too, so that every compile of the project (simulation, checks, RTL views) has them)
  S.sources = [...S.sources.filter(s => !s.view), ...S.viewSources];
  S.lib = compile([...srcs, ...S.viewSources]);
  // open schematics: their palette (Project modules) and module symbols follow the sources
  // (and their Device Primitives the project's part's, #791)
  if (S.docs.some(d => d.schEditor)) schModules().then(mods => { for (const d of S.docs) { d.schEditor?.setModules(mods); d.schEditor?.setDevice?.(projectPart()); } }).catch(() => {});
  // module info for editor completion / templates
  const fileOf = new Map();
  for (const p of S.lib.parsed) for (const u of p.units) if (u.kind === 'module' || u.kind === 'package') fileOf.set(u.name, p);
  S.modules = [...S.lib.modules.values()].map(m => ({
    name: m.name, lang: m.lang, file: m.archFile || m.file, line: m.loc?.line || 1, kind: m.lang === 'vhdl' ? 'entity' : 'module',
    role: S.project.files.find(f => f.path === m.file)?.role || 'design',
    portList: m.ports.map(p => ({ name: p.name, dir: p.dir, type: typeText(p.type, m.lang) })),
    paramList: m.params.filter(p => !p.local).map(p => p.name),
    ports: m.ports.map(p => `${p.dir.padEnd(5)} ${p.name} : ${typeText(p.type, m.lang)}`).join('\n'),
    mod: m,
  }));
  return S.lib;
}

// The project's board with the variant (pin overrides) that matches the selected part.
export function projectBoard(pj = S.project) {
  const b = S.devices?.boards.find(x => x.id === pj?.board);
  if (!b) return null;
  const v = b.variants?.find(x => x.device.part === pj.device.part) || b.variants?.find(x => x.default) || null;
  const ov = v?.resourceOverrides || {};
  return { ...b, device: { ...(v?.device || b.device) }, resources: b.resources.map(r => (ov[r.name] ? { ...r, ...ov[r.name] } : r)) };
}

export function moduleInfo(name) { return S.modules.find(m => m.name === name) || S.modules.find(m => m.name.toLowerCase() === String(name).toLowerCase()); }

// The modules at the root of a view's hierarchy: those of its role no module of it instantiates (in the
// Implementation view, a module instantiated only from a test bench is a root too)
export function viewRoots(sim) {
  const lib = S.lib;
  if (!lib) return [];
  const visible = name => inView(moduleInfo(name)?.role || 'design', sim);
  if (sim) return topCandidates(lib).filter(visible);
  const used = new Set();
  for (const m of lib.modules.values()) if (visible(m.name)) for (const i of instancesOf(m)) used.add(i.module.toLowerCase());
  return [...lib.modules.values()].filter(m => visible(m.name) && !used.has(m.name.toLowerCase())).map(m => m.name);
}

// A top-level module the project no longer has (its source removed from the project, #253): the
// top becomes the one root of its view left, else none (several: the user chooses, a warning); true
// when it changed. (Not while a source of the project still declares it: one being edited.)
export async function fixMissingTops() {
  const pj = S.project;
  const declared = name => (S.sources || []).some(f => new RegExp(`\\b(entity|module)\\s+${String(name).replace(/[^\w$]/g, '')}\\b`, 'i').test(f.text || ''));
  let changed = false;
  for (const sim of [false, true]) {
    const key = sim ? 'simTop' : 'top';
    const old = pj[key];
    if (!old || moduleInfo(old) || declared(old)) continue;
    const roots = viewRoots(sim);
    pj[key] = roots.length === 1 ? roots[0] : '';
    changed = true;
    const what = `The top-level ${sim ? 'simulation ' : ''}module '${old}' is no longer in the project`;
    if (pj[key]) log(`${what}: the top is now '${pj[key]}' (another one: Set as Top Module).`, 'info');
    else if (roots.length) log(`${what}: set the top module (a module's right-click menu: Set as Top Module).`, 'warn');
    else log(`${what}, nor any other module.`, 'info');
  }
  if (changed) { await saveProjectJson(); markStale(); renderHierarchy(); }
  return changed;
}

// Static hierarchy (from instances in the source, like ISE's Design view).
export function instancesOf(mod) {
  const out = [];
  const visit = (items, prefix) => {
    for (const it of items || []) {
      if (it.kind === 'instance') out.push({ name: prefix + it.name, module: it.module, loc: it.loc });
      if (it.kind === 'generate_for') visit(it.items, `${prefix}${it.label}.`);
      if (it.kind === 'generate_if') { visit(it.then, prefix + (it.label ? it.label + '.' : '')); visit(it.else, prefix); }
    }
  };
  visit(mod.items, '');
  return out;
}

// ------------------------------------------------------------------ the Design pane: hierarchy panel (web/js/design.js)

// ---- Undo / Redo of the project's commands (web/js/history.js): every menu, context menu and
// command palette command is recorded (what it changes in the project folder and settings); the
// processes (runs, simulations) are not commands that change the project
const NOT_RECORDED = /^(Implement|Generate Programming File|Synthesize|Simulate|Run|Rerun|Re-run|Emulate|Configure Target|Program|Initialize Chain|Check Syntax|View RTL|Analyze|Undo|Redo|Open|Find|Replace|Go to|Print|Download|Export|Help|About|Check for Updates|Language|Theme|Interface|Zoom|Close|New Project|Open Project|Recent|(?:Cut|Copy|Paste|Delete)$)/;
const docPath = d => d.path || (/^(file|sch|asm|tt|fsm):/.test(String(d.id || '')) ? String(d.id).replace(/^[a-z]+:/, '') : null);
export const history = createHistory(api, {
  project: () => S.project?.name,
  files: () => S.diskTree || S.fileTree || [],
  settings: () => { if (!S.project) return null; const pj = { ...S.project }; delete pj.fileTree; return JSON.stringify(pj); },
  flush: () => saveAll(),
  before: (changed) => confirmDlg('Undo / Redo', `Changed since:\n${changed.slice(0, 12).join('\n')}${changed.length > 12 ? '\n…' : ''}\n\nUndo / Redo anyway (those changes are lost)?`),
  restored: async (e, paths) => {
    // the documents of the files it changed: closed (without saving), opened again from the files
    const reopen = [];
    for (const d of [...S.docs]) {
      const p = docPath(d);
      if (p && paths.includes(p)) { if (S.active === d) reopen.unshift(p); else reopen.push(p); d.dirty = false; clearTimeout(d._autosave); await closeDoc(d); }
    }
    await reloadProject();
    for (const p of reopen.reverse()) if ((S.diskTree || []).includes(p)) await openFile(p).catch(() => {});
  },
});
setActionRunner((label, fn) => (NOT_RECORDED.test(String(label || '')) ? fn() : history.run(label, fn)));

// Undo / Redo (Edit menu, toolbar, Ctrl+Z / Ctrl+Y outside an editor): the project's last command
// when it is newer than the last edit of the active document, else the document's own undo
// the Language Templates' Device Primitives (#792): an instantiation template of each primitive of the project's family,
// its count on the part in its comment; none for a family without them
function primTemplatesMenu(d, lang) {
  const part = projectPart(), list = primitiveTemplates(part?.family || deviceFamily(S.project?.device), lang, part);
  return { label: 'Device Primitives', disabled: !list.length, submenu: list.map(t => ({ label: t.name, action: () => d.editor.insertText(t.text) })) };
}
export const docEditor = d => d && (d.editor ? { undo: () => d.editor.exec('undo'), redo: () => d.editor.exec('redo') } : d.schEditor || d.asmEditor || d.fsmEditor || d.ttEditor || d.petriEditor || d.pinPlanner || null);
export const undoesProject = () => history.canUndo() && !(S.active?._editedAt > history.lastAt() && docEditor(S.active));
export const redoesProject = () => history.canRedo() && !(S.active?._editedAt > history.redoAt() && docEditor(S.active));
export async function projectUndo() {
  const e = await history.undo();
  if (e) log(`Undo: ${e.label}.`, 'ok');
}
export async function projectRedo() {
  const e = await history.redo();
  if (e) log(`Redo: ${e.label}.`, 'ok');
}
export const undoAny = () => (undoesProject() ? projectUndo() : docEditor(S.active)?.undo());
export const redoAny = () => (redoesProject() ? projectRedo() : docEditor(S.active)?.redo());

// Cut / Copy / Paste / Delete (Edit menu, toolbar, #677): the active editor's. A text editor's selection through
// the app's clipboard (web/js/clipboard.js); a drawing editor's by its own copy / paste (its selection, pasted
// with fresh names)
const textClip = ed => {
  const ro = () => !!ed.view?.state.readOnly;
  const done = () => ed.focus();
  return {
    canCopy: () => ed.somethingSelected(), canDelete: () => !ro() && ed.somethingSelected(), canPaste: () => !ro() && canPasteText(),
    copy() { if (ed.somethingSelected()) writeClip('text', ed.getSelection()); done(); },
    cut() { if (!ed.somethingSelected() || ro()) return; writeClip('text', ed.getSelection()); ed.replaceSelection(''); done(); },
    async paste() { const t = await readClip('text'); if (t != null && !ro()) ed.replaceSelection(t); done(); },
    deleteSelection() { if (!ro()) ed.replaceSelection(''); done(); },
  };
};
// a text field in focus (a drawing's name, an expression, a property): its own selection
const fieldClip = el => {
  const ro = () => el.readOnly || el.disabled;
  const any = () => el.selectionEnd > el.selectionStart;
  const put = t => { el.setRangeText(t, el.selectionStart, el.selectionEnd, 'end'); el.dispatchEvent(new Event('input', { bubbles: true })); el.focus(); };
  return {
    canCopy: any, canDelete: () => !ro() && any(), canPaste: () => !ro() && canPasteText(),
    copy() { if (any()) writeClip('text', el.value.slice(el.selectionStart, el.selectionEnd)); el.focus(); },
    cut() { if (!any() || ro()) return; writeClip('text', el.value.slice(el.selectionStart, el.selectionEnd)); put(''); },
    async paste() { const t = await readClip('text'); if (t != null && !ro()) put(el.tagName === 'INPUT' ? t.replace(/\r?\n/g, ' ') : t); },
    deleteSelection() { if (!ro()) put(''); },
  };
};
const focusedField = () => {
  const el = document.activeElement;
  return el && !el.closest('.cm-editor, .dlg-overlay') && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|url|)$/i.test(el.getAttribute('type') || ''))) ? el : null;
};
export const clipEditor = d => {
  const f = focusedField();
  if (f) return fieldClip(f);
  if (!d) return null;
  if (d.editor) return textClip(d.editor);
  const x = d.schEditor || d.asmEditor || d.fsmEditor || d.ttEditor || d.petriEditor;
  return x?.copy ? x : null;
};
export const canCopyAny = () => !!clipEditor(S.active)?.canCopy();
export const canPasteAny = () => !!clipEditor(S.active)?.canPaste();
export const canDeleteAny = () => { const c = clipEditor(S.active); return !!c && !!(c.canDelete ? c.canDelete() : c.canCopy()); };
export const cutAny = () => clipEditor(S.active)?.cut();
export const copyAny = () => clipEditor(S.active)?.copy();
export const pasteAny = () => clipEditor(S.active)?.paste();
export const deleteAny = () => clipEditor(S.active)?.deleteSelection();

// put a file of the project folder (back) into the project
export function addToProject(file) { return serialOp(() => addNow(file)); }
async function addNow(file) {
  const pj = S.project;
  pj.excluded = (pj.excluded || []).filter(f => f !== file);
  const lang = /\.vhdl?$/i.test(file) ? 'vhdl' : /\.(v|sv)$/i.test(file) ? 'verilog' : null;
  if (lang && !pj.files.some(f => f.path === file)) pj.files.push({ path: file, lang, role: /^(sim|tb|test)\//.test(file) || /(^|\/)tb_|_tb\./.test(file) ? 'sim' : 'design' });
  if (/\.ucf$/i.test(file) && !pj.constraints) pj.constraints = file;
  await saveProjectJson();
  await reloadProject();
}

// ------------------------------------------------------------------ processes panel, Check Syntax, process status (web/js/processes.js)

// ------------------------------------------------------------------ implementation (web/js/implement.js)

// ------------------------------------------------------------------ documents
function docTab(doc) {
  const tab = h('div', { class: 'tab', title: doc.tooltip || doc.title }, icon(doc.icon || 'file'), h('span', { class: 'tlabel' }, doc.title),
    h('span', { class: 'tclose', title: 'Close' }, '✕'));
  tab.addEventListener('mousedown', e => { if (e.button === 0 && !e.target.closest('.tclose')) activateDoc(doc); });
  tab.querySelector('.tclose').addEventListener('click', e => { e.stopPropagation(); closeDoc(doc); });
  tab.addEventListener('auxclick', e => { if (e.button === 1) closeDoc(doc); });
  tab.addEventListener('contextmenu', e => {
    e.preventDefault();
    popupMenu([
      { label: 'Close', action: () => closeDoc(doc) },
      { label: 'Close Others', action: () => S.docs.filter(d => d !== doc).forEach(closeDoc) },
      { label: 'Close All', action: () => [...S.docs].forEach(closeDoc) },
    ], e.clientX, e.clientY);
  });
  longPressMenu(tab);
  return tab;
}

export function findDoc(id) { return S.docs.find(d => d.id === id); }

// doc: { id, title, icon, create(el) -> controller }, controller: { onActivate, save, destroy, editor }
// (a diagram editor fits its view once, when its canvas first has a size, never on activation: the
// view is the user's, and a late fit moved the drawing under the pointer, #233, #244)
export function openDoc(spec) {
  let doc = findDoc(spec.id);
  if (doc) { activateDoc(doc, spec); return doc; }
  doc = { ...spec, el: h('div', { class: 'doc' }), project: S.project?.name };
  // the user's own actions in the document (Edit ▸ Undo: was the last change an edit of theirs?)
  for (const ev of ['keydown', 'pointerdown', 'input', 'paste', 'drop']) doc.el.addEventListener(ev, () => { doc._userAt = Date.now(); }, true);
  $('workspace').append(doc.el);
  doc.tab = docTab(doc);
  $('doc-tabs').append(doc.tab);
  S.docs.push(doc);
  activateDoc(doc, spec);
  Object.assign(doc, spec.create(doc.el, doc) || {});
  doc.onActivate?.();
  saveViewState();
  return doc;
}

// background: opened with the project, not by the user (a narrow screen's drawer stays open)
export function activateDoc(doc, { background = false } = {}) {
  S.active = doc;
  for (const d of S.docs) { d.el.hidden = d !== doc; d.tab.classList.toggle('active', d === doc); }
  doc.onActivate?.();
  $('status-pos').textContent = '';
  if (!keepView && !background) drawerGiveWay();   // a narrow screen: the drawer gives way to the document (#266)
  updateTitle();
  saveViewState();
}

// Editing always saves: a document with changes is written ~0.8 s after the last edit.
// user (the text editor says it, #534): true, the change is the user's own in the editor; false, written
// by the application; undefined (the other editors), judged by the timing below.
export function setDirty(doc, dirty, { user } = {}) {
  doc.dirty = dirty;
  // (an edit of the user: a change right after their action in the document, while no command,
  // Undo or Redo writes; a document opened or updated by a command is not edited by the user. The text
  // editor knows: typing while a command's tail still runs after its Rename is the user's edit, #534)
  if (dirty) { if (user === true || (user === undefined && !history.busy() && Date.now() - (doc._userAt || 0) < 2000)) doc._editedAt = Date.now(); doc._edits = (doc._edits || 0) + 1; }   // (Edit ▸ Undo: the last action was an edit or a removal?)
  doc.tab.classList.toggle('dirty', dirty);
  clearTimeout(doc._autosave);
  if (dirty && doc.save) doc._autosave = setTimeout(() => flushDoc(doc, { auto: true }), 800);
}
export async function flushDoc(doc, opts) {
  clearTimeout(doc._autosave);
  // one save at a time per document: two at once could reach the server in the wrong order
  while (doc._saving) await doc._saving.catch(() => {});
  if (!doc.dirty || !doc.save) return true;
  // never write a document into another project (e.g. a retry after the project was switched)
  if (doc.project && S.project?.name !== doc.project) return false;
  const edits = doc._edits;
  try {
    doc._saving = history.unrecorded(() => doc.save(opts));
    await doc._saving;
    if (doc._saveFailed) { doc._saveFailed = false; log(`${doc.path || doc.title} saved.`, 'ok'); }
    // edited while it was being saved (the save marked it clean): those edits are saved next
    if (doc._edits !== edits) setDirty(doc, true);
    // a drawn source without an HDL file: its module follows (#177), and it gets its HDL file as soon
    // as it has no errors (#207)
    const vp = docPath(doc);
    if (vp && /\.(sch|asm|tt|fsm|pn)\.json$/.test(vp) && !S.schOwners?.[vp] && S.project) {
      try {
        S.viewTexts = { ...(S.viewTexts || {}), [vp]: await api.readFile(S.project.name, vp) }; compileProject();
        if (await adoptDrawnHdl()) { await reloadProject(false); markStale(); } else { await drawnHdlClashes(); renderHierarchy(); }
      } catch { /* read later */ }
    }
  } catch (e) {
    // keep the changes and retry; report once until it works again
    if (!doc._saveFailed) log(`ERROR: cannot save ${doc.path || doc.title}: ${e.message}. Your changes are kept and saved as soon as it is possible again.`, 'err');
    doc._saveFailed = true;
    doc.dirty = true; doc.tab.classList.add('dirty');
    clearTimeout(doc._autosave);
    doc._autosave = setTimeout(() => flushDoc(doc, opts), 3000);
    return false;
  } finally { doc._saving = null; }
  return true;
}

export async function closeDoc(doc) {
  if (!await flushDoc(doc) && doc.dirty && !await confirmDlg('Close', `${doc.path || doc.title} could not be saved. Close it and lose the unsaved changes?`)) return false;
  clearTimeout(doc._autosave);
  doc.closed = true;
  doc.destroy?.();
  doc.el.remove(); doc.tab.remove();
  S.docs = S.docs.filter(d => d !== doc);
  if (S.active === doc) { const last = S.docs[S.docs.length - 1]; if (last) activateDoc(last); else S.active = null; }
  saveViewState();
  return true;
}

// ---- where the user was (#160, #163): the open documents of a project, the one in front, the left pane
// and the Design view, kept in this browser (per project) so that a reload of the page, or opening
// the project again, comes back to them instead of the Design Summary. The documents that open as
// they were: the sources and their editors, the RTL schematic, the summary, the pin planner, iMPACT,
// and the simulation (ISim) and the board emulator, run again for the same module and model (a
// netlist model only while it exists); not a report or a technology schematic (a run's output).
const VIEW_KEY = name => `silinx.view.${name}`;
const inProject = p => S.fileTree?.includes(p);
const REOPEN = [
  [/^file:(.+)$/, p => inProject(p) && openFile(p)], [/^sch:(.+)$/, p => inProject(p) && openSch(p)],
  [/^asm:(.+)$/, p => inProject(p) && openAsm(p)], [/^tt:(.+)$/, p => inProject(p) && openTt(p)], [/^ttsch:(.+)$/, p => inProject(p) && openTtSchematic(p)],
  [/^fsm:(.+)$/, p => inProject(p) && openFsm(p)], [/^pn:(.+)$/, p => inProject(p) && openPetri(p)], [/^rtl:(.+)$/, m => moduleInfo(m) && openSchematic(m)],
  [/^isim:([^@]+)(?:@(\w+))?$/, async (mod, model) => await reopenable(mod, model) && runSimulation(mod, model || undefined)],
  [/^emulator:([^@]+)(?:@(\w+))?$/, async (mod, model) => await reopenable(mod, model) && openEmulator(mod, { model: model || null })],
  [/^summary$/, () => openSummary()], [/^pins$/, () => S.project.top && openPinPlanner()], [/^impact$/, () => openImpact()],
];
// a module of the project, and its netlist model when one is asked for (no message when it is gone)
async function reopenable(mod, model) {
  if (!moduleInfo(mod)) return false;
  if (!model) return true;
  const rep = await api.reports(S.project.name).catch(() => null);
  return !!(rep?.simModels?.[model] && rep.top === S.project.top);
}
const reopenKey = d => d.reopen || d.id;
let keepView = false;   // while documents are closed or reopened together (a project closed, restored)
// every document closed, the view state kept as it was (a project closed or another opened): false when one stays open
export async function closeAllDocs() {
  keepView = true;
  try { for (const d of [...S.docs]) if (!await closeDoc(d)) return false; } finally { keepView = false; }
  return true;
}
function saveViewState() {
  if (keepView || !S.project) return;
  const open = S.docs.filter(d => d.project === S.project.name && REOPEN.some(([re]) => re.test(reopenKey(d)))).map(reopenKey);
  const active = S.active && reopenKey(S.active);
  const state = { open, active: open.includes(active) ? active : null, page: S.leftPage || null, view: S.view };
  try { localStorage.setItem(VIEW_KEY(S.project.name), JSON.stringify(state)); } catch { /* storage unavailable */ }
}
function savedViewState(name) {
  try { const v = JSON.parse(localStorage.getItem(VIEW_KEY(name)) || 'null'); return v && Array.isArray(v.open) ? v : null; } catch { return null; }
}
/** Reopens the project's documents as they were; false when nothing was kept (a first opening). */
export async function restoreViewState(name) {
  const v = savedViewState(name);
  if (!v) return false;
  keepView = true;
  try {
    if (v.view === 'sim' || v.view === 'impl') { if (v.view !== S.view) setView(v.view); }
    if (['design', 'files', 'libs'].includes(v.page)) showLeftPage(v.page);
    for (const id of v.open) {
      const [re, open] = REOPEN.find(([r]) => r.test(id)) || [];
      if (!re) continue;
      try { await open(...re.exec(id).slice(1)); } catch { /* a document that cannot open any more */ }
    }
    const active = v.active && S.docs.find(d => reopenKey(d) === v.active);
    if (active) activateDoc(active);
  } finally { keepView = false; }
  saveViewState();
  return true;
}
export function closeDocByPath(path) { for (const d of [...S.docs]) if (d.path === path) { d.dirty = false; closeDoc(d); } }

// ---- HDL / text editor
export async function openFile(path, line, col) {
  if (!S.project) return;
  if (path.endsWith('.asm.json')) return openAsm(path);
  if (path.endsWith('.sch.json')) return openSch(path);
  if (path.endsWith('.tt.json')) return openTt(path);
  if (path.endsWith('.fsm.json')) return openFsm(path);
  if (path.endsWith('.pn.json')) return openPetri(path);
  const id = `file:${path}`;
  let doc = findDoc(id);
  if (!doc) {
    let text;
    try { text = await api.readFile(S.project.name, path); }
    catch (e) { toast(`Cannot open ${path}: ${e.message}`, 'error'); return; }
    const lang = /\.(vhd|vhdl)$/i.test(path) ? 'vhdl' : /\.(v|vh|sv)$/i.test(path) ? 'verilog' : /\.ucf$/i.test(path) ? 'ucf' : 'text';
    doc = openDoc({
      id, path, title: path.split('/').pop(), tooltip: path, icon: lang === 'vhdl' ? 'vhdl' : lang === 'verilog' ? 'verilog' : lang === 'ucf' ? 'ucf' : 'file',
      create(el, d) {
        const tplBtn = h('button', { class: 'btn', style: { minWidth: '0' }, title: 'Language Templates' }, 'Templates ▾');
        const bar = h('div', { class: 'editor-bar' },
          h('button', { class: 'tb-btn', title: 'Undo', html: icons.undo, onclick: () => d.editor.exec('undo') }),
          h('button', { class: 'tb-btn', title: 'Redo', html: icons.redo, onclick: () => d.editor.exec('redo') }),
          h('div', { class: 'tb-sep' }),
          h('button', { class: 'tb-btn', title: 'Find (Ctrl+F)', html: icons.find, onclick: () => d.editor.exec('findPersistent') }),
          (lang === 'vhdl' || lang === 'verilog') ? tplBtn : null,
          (lang === 'vhdl' || lang === 'verilog' || lang === 'ucf') ? h('button', { class: 'btn', style: { minWidth: '0' }, title: 'Check Syntax of this file', onclick: () => (lang === 'ucf' ? checkUcfFile(path) : checkFileSyntax(path)) }, h('span', { class: 'ico-inline', html: icons.ok }), ' Check Syntax') : null,
          h('span', { class: 'path' }, path),
          ...Object.entries(S.schOwners || {}).filter(([, gen]) => gen === path).map(([sch]) => syncBanner(path, sch)));
        tplBtn.addEventListener('click', e => {
          const r = tplBtn.getBoundingClientRect();
          popupMenu([
            ...SNIPPETS[lang].map(s => ({ label: s.name, action: () => d.editor.insertText(s.text) })),
            '-',
            primTemplatesMenu(d, lang),
            { label: 'Instantiate module', submenu: S.modules.filter(m => m.file !== path).map(m => ({ label: m.name, action: () => d.editor.insertText(instTemplate(m, lang) + '$0') })) },
          ], r.left, r.bottom);
        });
        const host = h('div', { class: 'editor-host' });
        el.append(bar, host);
        d.editor = createEditor(host, {
          text, lang, path,
          project: () => ({ modules: S.modules }),
          onChange: (info) => { setDirty(d, !d.editor.isClean(), info); if (lang === 'ucf') liveUcf(); else if (lang === 'vhdl' || lang === 'verilog') liveHdl(); },
          onSave: () => flushDoc(d),
          onGotoDefinition: ({ file, line: ln }) => openFile(file, ln),
          onCursor: (l, c) => { if (S.active === d) $('status-pos').textContent = `Ln ${l}  Col ${c}`; },
          onRename: () => renameSymbolIn(d, lang, path),
          onFix: () => recheckFile(path),
        });
        d.editor.setDiagnostics(S.diags.filter(x => x.file === path));
        let ucfTimer = null;
        const liveUcf = () => { clearTimeout(ucfTimer); ucfTimer = setTimeout(async () => { if (d.editor) d.editor.setDiagnostics(await ucfDiagnostics(d.editor.getValue(), path)); }, 400); };
        if (lang === 'ucf') liveUcf();
        // HDL: full check (parse + elaboration against the rest of the project) as you type
        let hdlTimer = null;
        const liveHdl = () => {
          clearTimeout(hdlTimer);
          hdlTimer = setTimeout(() => {
            if (!d.editor || !S.project) return;
            try { d.editor.setDiagnostics(hdlDiagnostics(path, d.editor.getValue()).filter(x => x.file === path)); } catch { /* keep the parser markers */ }
          }, 600);
        };
        if (lang === 'vhdl' || lang === 'verilog') liveHdl();
        d.liveCheck = lang === 'ucf' ? liveUcf : (lang === 'vhdl' || lang === 'verilog') ? liveHdl : null;
        const ed = d.editor;
        ed.view.dom.addEventListener('contextmenu', e => {
          e.preventDefault();
          const hdl = lang === 'vhdl' || lang === 'verilog';
          const hasSel = ed.somethingSelected();
          const sch = S.hdlToSch?.[path];
          const at = ed.posAt(e.clientX, e.clientY);
          popupMenu([
            { label: 'Undo', action: () => ed.exec('undo'), disabled: !ed.historySize().undo },
            { label: 'Redo', action: () => ed.exec('redo'), disabled: !ed.historySize().redo },
            '-',
            { label: 'Cut', action: () => { navigator.clipboard?.writeText(ed.getSelection()); ed.replaceSelection(''); }, disabled: !hasSel },
            { label: 'Copy', action: () => navigator.clipboard?.writeText(ed.getSelection()), disabled: !hasSel },
            { label: 'Paste', action: async () => { try { ed.replaceSelection(await navigator.clipboard.readText()); ed.focus(); } catch { toast('Use Ctrl+V to paste', 'info'); } } },
            { label: 'Select All', action: () => ed.exec('selectAll') },
            '-',
            hdl ? { label: 'Toggle Comment', action: () => ed.exec('toggleComment') } : null,
            { label: 'Find…', action: () => ed.exec('findPersistent') },
            hdl ? { label: 'Rename Symbol…', shortcut: 'F2', action: () => { if (!hasSel) ed.setCursor(at); renameSymbolIn(d, lang, path); } } : null,
            hdl ? { label: 'Quick Fix…', shortcut: 'Ctrl+.', action: () => { ed.setCursor(at); d.editor.showFixMenu(at.line); }, disabled: !d.editor.fixesOnLine(at.line).length } : null,
            hdl ? '-' : null,
            hdl ? { label: 'Language Templates', submenu: SNIPPETS[lang].map(sn => ({ label: sn.name, action: () => d.editor.insertText(sn.text) })) } : null,
            hdl ? primTemplatesMenu(d, lang) : null,
            hdl ? { label: 'Instantiate module', submenu: S.modules.filter(m => m.file !== path).map(m => ({ label: m.name, action: () => d.editor.insertText(instTemplate(m, lang) + '$0') })) } : null,
            hdl ? '-' : null,
            hdl ? { label: 'Check Syntax', action: () => checkFileSyntax(path) } : null,
            lang === 'ucf' ? '-' : null,
            lang === 'ucf' ? { label: 'Check Syntax', action: () => checkUcfFile(path) } : null,
            lang === 'ucf' ? { label: 'I/O Pin Planning', action: () => openPinPlanner() } : null,
            sch ? { label: `Open ${viewTitle(sch)}`, action: () => openView(sch) } : null,
          ].filter(Boolean), e.clientX, e.clientY);
        });
        longPressMenu(ed.view.dom, { select: true });
        return {
          lang,
          onActivate: () => setTimeout(() => d.editor?.refresh(), 0),
          save: async ({ auto = false } = {}) => {
            const text = d.editor.getValue();
            await api.writeFile(S.project.name, path, text);
            // (only the text written is clean: an edit made meanwhile is saved next, see flushDoc)
            if (d.editor.getValue() === text) d.editor.markClean();
            setDirty(d, false);
            const src = S.sources.find(s => s.path === path);
            if (src) src.text = text;
            else await reloadProject(false);
            compileProject(); renderHierarchy(); markStale();
            status(`Saved ${path}`);
            // the other open editors depend on this file (ports, instances): check them again
            for (const od of S.docs) if (od !== d) od.liveCheck?.();
            // the drawing it is generated from follows the edit (not a Petri net: its HDL follows it only, #222)
            if (S.hdlToSch?.[path] && !isPn(S.hdlToSch[path]) && !S.syncing) (isAsm(S.hdlToSch[path]) ? syncAsmFromHdl : isTt(S.hdlToSch[path]) ? syncTtFromHdl : isFsm(S.hdlToSch[path]) ? syncFsmFromHdl : syncSchematicFromHdl)(path, { quiet: auto }).catch(e => log(`WARNING: ${viewNoun(S.hdlToSch[path])} not synchronized: ${e.message}`, 'warn'));
          },
          destroy: () => d.editor.destroy(),
        };
      },
    });
  } else activateDoc(doc);
  if (line) {
    // jump once the editor is laid out, unless the user has already moved the cursor (a delayed
    // timer, e.g. in a background tab, must not pull the cursor away from where they type)
    const ed = doc.editor, at = ed && JSON.stringify(ed.getCursor());
    setTimeout(() => { if (!ed || JSON.stringify(ed.getCursor()) === at) doc.editor?.gotoLine(line, col); }, 30);
  }
  return doc;
}

export async function openUcf() {
  const pj = S.project;
  if (!pj.constraints) { pj.constraints = 'constraints/top.ucf'; await saveProjectJson(); }
  if (!S.fileTree.includes(pj.constraints)) {
    const { ucfTemplate } = await import('./templates.js');
    await api.writeFile(pj.name, pj.constraints, ucfTemplate(pj));
    await reloadProject(false);
  }
  openFile(pj.constraints);
}

export function openInstTemplate(mod) {
  const m = moduleInfo(mod);
  if (!m) return;
  const lang = m.lang;
  const txt = (lang === 'vhdl'
    ? `-- Instantiation template for ${m.name} (copy into the architecture body)\n\n`
    : `// Instantiation template for ${m.name}\n\n`) + instTemplate(m, lang) + '\n';
  openDoc({
    id: `tpl:${mod}`, title: `${mod}.${lang === 'vhdl' ? 'vhi' : 'tfi'}`, icon: 'template',
    create(el, d) {
      const host = h('div', { class: 'editor-host' });
      el.append(host);
      d.editor = createEditor(host, { text: txt, lang, readOnly: true, path: '' });
      return { onActivate: () => setTimeout(() => d.editor.refresh(), 0) };
    },
  });
}

// ------------------------------------------------------------------ viewers: schematics, ISim, Board Emulator (web/js/viewers.js)

// ------------------------------------------------------------------ drawings and their HDL (web/js/drawings.js)

// ------------------------------------------------------------------ renaming: Rename Symbol, rename a source (web/js/rename.js)

// ---- summary, pin planner, impact
// ---- View Implemented Design (FPGA): web/js/fpgaview.js over the XDL of the routed design
// The hierarchy paths of the design as XST names them ('Inst_data/u1', from the top's instance
// labels) -> entity / module name, for the legend of the view.
function hierarchyEntities(top) {
  const out = new Map();
  const walk = (modName, prefix, depth) => {
    const info = moduleInfo(modName);
    if (!info || depth > 30) return;
    for (const k of instancesOf(info.mod)) {
      const p = prefix ? `${prefix}/${k.name}` : k.name;
      out.set(p.toLowerCase(), k.module);
      walk(k.module, p, depth + 1);
    }
  };
  if (top) walk(top, '', 0);
  return out;
}
export async function openFpgaView(mod = S.project?.top) {
  if (!S.project || !mod) return;
  const title = 'View Implemented Design (FPGA)';
  let m = await api.fpgaView(S.project.name).catch(e => ({ available: false, reason: 'error', error: e.message }));
  if (!m.available) {
    if (m.reason === 'error') { alertDlg(title, m.error, 'error'); return; }
    if (m.reason === 'no-top') { alertDlg(title, 'Set the top module of the project first.'); return; }
    // placed and routed and up to date: only the XDL export; otherwise the flow up to Place & Route first
    const routed = m.reason !== 'no-ncd' && ['ok', 'warn'].includes(S.status.par);
    if (!routed && !await confirmDlg(title, 'The FPGA view shows the design after Place & Route. Run Implement Design (Synthesize, Translate, Map, Place & Route) now?')) return;
    if (!await runImpl(mod, routed ? ['fpgaview'] : [...FLOW_UP_TO.par, 'fpgaview'])) return;
    m = await api.fpgaView(S.project.name).catch(e => ({ available: false, error: e.message }));
    if (!m.available) { alertDlg(title, `The implemented design could not be read${m.error ? `: ${m.error}` : ''}.`, 'error'); return; }
  }
  const { mountFpgaView } = await import('./fpgaview.js');
  const old = findDoc('fpgaview');
  if (old) await closeDoc(old);
  const top = S.project.top;
  openDoc({ id: 'fpgaview', title: `FPGA (${top})`, icon: 'chip', tooltip: `${title}: ${m.device.part}`,
    create: el => {
      const view = mountFpgaView(el, { model: m, top, entities: hierarchyEntities(top), stale: S.status.par === 'stale',
        onSelectModule: path => selectHierarchyPath(path) });
      return { view, destroy: () => view.destroy() };
    } });
  syncFpgaView(S.sel);
}
// stage 4: the Design hierarchy and the FPGA view select each other's modules
export function syncFpgaView(sel) {
  const v = findDoc('fpgaview')?.view;
  if (!v || S.fpgaSyncing) return;
  const top = S.project?.top;
  if (sel?.type !== 'module' || !sel.path) return;
  const [root, ...rest] = sel.path.split('/');
  if (root !== top) return;
  v.highlightModule(rest.length ? rest.join('/') : null);
}
function selectHierarchyPath(path) {
  const top = S.project?.top;
  if (!top) return;
  const want = `m:${top}${path ? `/${path}` : ''}`.toLowerCase();
  const row = [...document.querySelectorAll('#hier .row[data-key^="m:"]')].find(r => r.dataset.key.toLowerCase() === want);
  if (!row) return;
  // show it: expand its ancestors
  for (let ul = row.parentElement.parentElement; ul && ul.id !== 'hier'; ul = ul.parentElement) if (ul.tagName === 'UL' && ul.hidden) { ul.hidden = false; const tw = ul.previousElementSibling?.querySelector('.twisty'); if (tw) tw.textContent = '▾'; }
  S.fpgaSyncing = true;
  try { row.click(); } finally { S.fpgaSyncing = false; }
  row.scrollIntoView({ block: 'nearest' });
}

export async function openSummary({ background = false } = {}) {
  const was = S.active;
  const { mountSummary } = await import('./summary.js');
  // opened with the project (background): if the user opened another document meanwhile, keep it in front
  const keep = background && S.active && S.active !== was && S.active.id !== 'summary' ? S.active : null;
  const d = openDoc({ id: 'summary', title: 'Design Summary', icon: 'summary', background, create: el => mountSummary(el) });
  d.refresh?.();
  if (keep && S.docs.includes(keep)) activateDoc(keep);
}
export function refreshSummary() { const d = findDoc('summary'); d?.refresh?.(); }

export async function openPinPlanner(mod) {
  const { mountPinPlanner } = await import('./pinplanner.js');
  const top = mod || S.project.top;
  if (!top) { alertDlg('I/O Pin Planning', 'Select a top-level module first.', 'warn'); return; }
  const old = findDoc('pins');
  if (old) await closeDoc(old);
  openDoc({ id: 'pins', title: 'I/O Pin Planning', icon: 'pins', create: (el, d) => mountPinPlanner(el, d, top) });
}

export async function openImpact() {
  const { mountImpact } = await import('./impact.js');
  openDoc({ id: 'impact', title: 'iMPACT', icon: 'impact', create: (el, d) => mountImpact(el, d) });
}

// ------------------------------------------------------------------ project lifecycle (web/js/project.js)
export { openProject, closeProject, reloadProject };

// ------------------------------------------------------------------ left pages
export function showLeftPage(page) {
  S.leftPage = page;
  saveViewState();
  document.querySelectorAll('#left-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.page === page));
  document.querySelectorAll('.left-page').forEach(p => { p.hidden = p.dataset.page !== page; });
  if (page === 'start') renderStartPage();
}

export function renderFilesPage() {
  const host = $('files-page');
  host.innerHTML = '';
  if (!S.project) return;
  const tbl = h('table', { class: 'grid' }, h('tr', {}, h('th', {}, 'File Name'), h('th', {}, 'Association'), h('th', {}, 'Language')));
  // files sorted by path, each folder as a row of its own (right-click: rename / delete the folder)
  const reg = new Map(S.project.files.map(f => [f.path, f]));
  const inProject = new Set(S.fileTree);
  const paths = [...new Set([...S.project.files.map(f => f.path), ...(S.diskTree || S.fileTree)])].sort((a, b) => a.localeCompare(b));
  const shown = new Set();
  for (const path of paths) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (shown.has(dir)) continue;
      shown.add(dir);
      tbl.append(h('tr', { class: 'folder-row', 'data-folder': dir, oncontextmenu: e => { e.preventDefault(); folderContextMenu(e, dir); } },
        h('td', { style: { fontWeight: 'bold', paddingLeft: `${4 + (i - 1) * 14}px` } }, `📁 ${parts[i - 1]}/`), h('td', {}), h('td', {})));
    }
    const f = reg.get(path);
    const pad = { paddingLeft: `${4 + (parts.length - 1) * 14}px` };
    tbl.append(h('tr', { 'data-file': path, ondblclick: () => openFile(path), oncontextmenu: e => { e.preventDefault(); fileContextMenu(e, path); } },
      h('td', { style: pad }, path),
      h('td', {}, !inProject.has(path) ? 'Not in project' : f ? (f.role === 'sim' ? 'Simulation' : f.role === 'impl' ? 'Implementation' : 'All') : path === S.project.constraints ? 'Implementation' : '—'),
      h('td', {}, f ? f.lang : path.split('.').pop())));
  }
  longPressMenu(tbl);   // (each row's menu, on touch)
  host.append(tbl);
}

function folderContextMenu(e, dir) {
  popupMenu([
    { label: 'Rename Folder…', action: () => renameFolder(dir) },
    { label: 'Delete Folder…', action: () => deleteFolder(dir) },
  ], e.clientX, e.clientY);
}

// files of the project under folder `dir`
const filesUnder = dir => [...new Set([...S.fileTree, ...S.project.files.map(f => f.path)])].filter(f => f.startsWith(`${dir}/`));

async function renameFolder(dir) {
  if (!S.project) return;
  const to = (await promptDlg('Rename Folder', `New path of the folder '${dir}':`, dir))?.trim().replace(/\/+$/, '');
  if (!to || to === dir) return;
  if (to.startsWith('/') || to.split('/').some(x => !x || x === '..' || x === '.')) return alertDlg('Rename Folder', 'Enter a folder path inside the project.');
  if (to.startsWith(`${dir}/`)) return alertDlg('Rename Folder', 'A folder cannot be moved into itself.');
  if (S.fileTree.some(f => f === to || f.startsWith(`${to}/`))) return alertDlg('Rename Folder', `'${to}' already exists.`);
  await saveAll();
  const remap = p => (p && p.startsWith(`${dir}/`) ? to + p.slice(dir.length) : p);
  const views = S.fileTree.filter(f => /\.(sch|asm|tt|fsm|pn)\.json$/i.test(f));
  // the editors of moved files are closed and reopened at their new paths
  const reopen = [];
  for (const d of [...S.docs]) if (d.path && d.path.startsWith(`${dir}/`)) { reopen.push(remap(d.path)); d.dirty = false; clearTimeout(d._autosave); await closeDoc(d); }
  try {
    await api.renameFile(S.project.name, dir, to);
    // synchronized charts / schematics refer to their HDL file by path: follow the move
    for (const v of views) {
      const at = remap(v);
      let d;
      try { d = JSON.parse(await api.readFile(S.project.name, at)); } catch { continue; }
      if (d.generatedFile && d.generatedFile.startsWith(`${dir}/`)) {
        d.generatedFile = remap(d.generatedFile);
        await api.writeFile(S.project.name, at, JSON.stringify(d, null, /\.(asm|tt|fsm)\.json$/i.test(at) ? 2 : 1));
      }
    }
    log(`Folder ${dir} renamed to ${to}.`, 'ok');
  } catch (e) { log(`ERROR: cannot rename folder ${dir}: ${e.message}`, 'err'); }
  await reloadProject();
  for (const p of reopen) if (S.fileTree.includes(p)) await openFile(p);
}

async function deleteFolder(dir) {
  if (!S.project) return;
  const files = filesUnder(dir);
  if (!await confirmDlg('Delete Folder', `Delete the folder '${dir}' and the ${files.length} file(s) in it from the project?\n\n${files.slice(0, 12).join('\n')}${files.length > 12 ? '\n…' : ''}`)) return;
  for (const d of [...S.docs]) if (d.path && d.path.startsWith(`${dir}/`)) { d.dirty = false; clearTimeout(d._autosave); await closeDoc(d); }
  try {
    await api.deleteFile(S.project.name, dir);
    log(`Folder ${dir} deleted (${files.length} file(s)).`, 'ok');
  } catch (e) { log(`ERROR: cannot delete folder ${dir}: ${e.message}`, 'err'); }
  await reloadProject();
}

export function renderLibsPage() {
  const host = $('libs-page');
  host.innerHTML = '';
  if (!S.lib) return;
  const tree = h('ul', { class: 'tree' });
  const work = treeItem({ label: 'work', ico: 'folder', open: true, key: 'lib:work' });
  tree.append(work.li);
  for (const m of S.modules) {
    const it = treeItem({ label: m.name, meta: `(${m.file})`, ico: m.lang === 'vhdl' ? 'vhdl' : 'verilog', key: `lib:${m.name}`, onOpen: () => openFile(m.file, m.line) });
    it.setLeaf(); work.ul.append(it.li);
  }
  for (const p of S.lib.packages.values()) {
    const it = treeItem({ label: p.name, meta: '(package)', ico: 'vhdl', key: `lib:p:${p.name}`, onOpen: () => openFile(p.file, p.loc?.line) });
    it.setLeaf(); work.ul.append(it.li);
  }
  host.append(tree);
}

// ------------------------------------------------------------------ menus & toolbar (web/js/menus.js)

// ------------------------------------------------------------------ browser edition: where projects are kept
// the Simulation view with module `mod` selected (e.g. a test bench just created): Simulate runs it
export function showInSim(mod) {
  setView('sim');
  const row = document.querySelector(`#hier [data-key="${CSS.escape(`m:${mod}`)}"]`);
  if (row) row.dispatchEvent(new MouseEvent('click'));
}

export function setView(v) {
  S.view = v;
  document.querySelectorAll('input[name=view]').forEach(r => { r.checked = r.value === v; });
  S.selKey = null;
  renderHierarchy();
  renderProcesses();
  saveViewState();
}

// ------------------------------------------------------------------ boot
async function boot() {
  applyPrefs();
  startI18n();
  document.querySelectorAll('.ico-inline[data-icon]').forEach(e => { e.innerHTML = icons[e.dataset.icon] || ''; });
  setupMenus();
  setupToolbar();
  splitter($('v-split'), $('left'), { dir: 'h', min: 180, max: 700, storageKey: 'xl.leftW' });
  splitter($('left-split'), $('proc-panel'), { dir: 'v', min: 80, max: 900, invert: true, storageKey: 'xl.procH' });
  splitter($('h-split'), $('console-wrap'), { dir: 'v', min: 60, max: 700, invert: true, storageKey: 'xl.consoleH' });
  initDrawer();
  document.querySelectorAll('#left-tabs .tab').forEach(t => t.addEventListener('click', () => { leftTabClicked(t.dataset.page, document.querySelector('#left-tabs .tab.active')?.dataset.page); showLeftPage(t.dataset.page); }));
  document.querySelectorAll('#console-tabs .tab').forEach(t => t.addEventListener('click', () => showConsolePage(t.dataset.page)));
  document.querySelectorAll('input[name=view]').forEach(r => r.addEventListener('change', () => setView(r.value)));
  // Clear: the console and the Warnings and Errors tabs, their counts too (#302; the editors' marks stay,
  // checked again at the next edit)
  $('console-clear').addEventListener('click', clearConsole);
  // modern interface: header search / theme / project, keyboard access to the activity bar
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  for (const k of [$('palette-kbd'), ...document.querySelectorAll('.pal-key')]) k.textContent = mac ? '⌘ K' : 'Ctrl K';
  $('palette-btn').addEventListener('click', () => showPalette());
  $('theme-btn').addEventListener('click', () => toggleTheme());
  document.querySelectorAll('#left-tabs .tab').forEach(t => t.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t.click(); } }));
  initTasks(app);   // the Tasks interface's switchers and bar (built in every interface, shown in that one: #804)
  for (const ev of ['click', 'keyup']) addEventListener(ev, () => setTimeout(refreshSteps), true);
  setInterval(refreshSteps, 1000);
  addEventListener('keydown', e => {
    // Ctrl/Cmd+K, Ctrl/Cmd+Shift+P: the command palette (not while a dialog is open)
    if ((e.metaKey || e.ctrlKey) && !e.altKey && ((e.key === 'k' || e.key === 'K') && !e.shiftKey || (e.shiftKey && (e.key === 'p' || e.key === 'P')))
      && !document.querySelector('.dlg-overlay')) { e.preventDefault(); showPalette(); return; }
    if (!e.defaultPrevented && (e.metaKey || e.ctrlKey) && (e.key === 'p' || e.key === 'P') && (S.active?.asmEditor || S.active?.schEditor || S.active?.fsmEditor)) { e.preventDefault(); printActive(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); if (S.active) flushDoc(S.active); }  // nothing to do: edits are saved automatically
    // Ctrl/Cmd+Z outside an editor or text field (the diagram editors handle their own keys): undo the
    // project's last command when it is newer than the active document's last edit
    const outside = !e.defaultPrevented && !e.target.closest?.('.cm-editor, input, textarea, select, [contenteditable], .sch-editor, .asm-editor, .fsm-editor, .tt-editor, .petri-editor, .pin-planner') && !document.querySelector('.dlg-overlay');
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z') && outside && undoesProject()) { e.preventDefault(); projectUndo(); }
    // Ctrl+Y / Ctrl+Shift+Z / Cmd+Shift+Z outside an editor: redo it
    if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || e.key === 'Y' || (e.shiftKey && (e.key === 'z' || e.key === 'Z'))) && outside && redoesProject()) { e.preventDefault(); projectRedo(); }
  });
  // a copy made by the browser in a text editor (Ctrl+C, its context menu): the app's clipboard follows it, for
  // Edit ▸ Paste where the system clipboard cannot be read (#677)
  for (const ev of ['copy', 'cut']) addEventListener(ev, e => { const ed = S.active?.editor; if (ed && e.target.closest?.('.cm-editor') && ed.somethingSelected()) noteCopy(ed.getSelection()); }, true);
  addEventListener('beforeunload', e => { if (S.docs.some(d => d.dirty)) { e.preventDefault(); e.returnValue = ''; } });

  updateTitle();
  log(`${PRODUCT} ${VERSION_LABEL} Project Navigator — HDL design, schematics, behavioural simulation and Xilinx FPGA implementation/programming.`, 'info');
  if (api.standalone) {
    const st = await api.initStorage().catch(() => api.storage());
    const where = st.kind === 'folder' ? `in the folder '${st.folder}' on the disk (File > Use Browser Storage to keep them in this browser)`
      : `in this browser (File > Download Project Bundle to keep a copy${st.supported ? '; File > Open Workspace Folder… keeps them in a folder on the disk' : ''})`;
    log(`Browser edition: projects are stored ${where}. Implement Design and Generate Programming File run the Silinx toolchain here (Spartan-3E); Configure Target Device programs the FPGA of the board and its Platform Flash over USB (Chrome / Edge).`, 'info');
    if (st.needsPermission) log(`The workspace folder '${st.remembered}' needs the browser's permission again: Start page > Reopen ${st.remembered}.`, 'warn');
    if (api.devSite) log(`Development edition (built from main, not a release): its projects are kept apart from the stable edition's, ${new URL('../', location).href} (a workspace folder on the disk can be opened by both).`, 'warn');
    updateStorageStatus();
  }
  try { S.devices = await api.devices(); } catch (e) { log(`ERROR: cannot reach the Silinx server: ${e.message}`, 'err'); }
  // the start-up checks' warnings are in the Warnings tab until a project opens, as the lines written before
  // them: when their answer comes after a project was opened (the last one, reopened while the checks run),
  // they are in the console only; they were in the tabs or not by which came first (#339)
  const cleared = S.diagsCleared;
  api.toolchain().then(tc => {
    S.toolchain = tc;
    const opts = { diag: S.diagsCleared === cleared };
    if (tc.ise.mode === 'silinx') log(`Toolchain: ${tc.ise.reason}.`, 'ok', opts);
    else log(`Toolchain: ISE ${tc.ise.available ? 'available' : 'not available'} (${tc.ise.mode}: ${tc.ise.reason}).`, tc.ise.available ? 'ok' : 'warn', opts);
    renderProcesses();
    // (the browser edition reaches no programmer: it says so in its own startup line)
    if (api.standalone) return;
    const progs = Object.entries(tc.programmers).filter(([, v]) => v.found).map(([k]) => k);
    log(`Programmers found: ${progs.length ? progs.join(', ') : 'none (install openFPGALoader, xc3sprog, Digilent Adept or ISE iMPACT)'}`, progs.length ? 'ok' : 'warn', opts);
  }).catch(() => {}).finally(() => { S.startupChecked = true; });   // (the start-up lines all written: the UI tests wait for it)
  renderHierarchy();
  renderProcesses();
  let last = null;
  try { last = localStorage.getItem('silinx.lastProject'); } catch { /* ignore */ }
  const projects = await api.projects().catch(() => []);
  // (a workspace folder waiting for its permission: its last project is not the browser's one of that name)
  if (last && projects.some(p => p.name === last) && !(api.standalone && api.storage().needsPermission)) await openProject(last);
  else showLeftPage('start');
  // check for updates at start-up (a newer release opens the update dialog) unless the setting is off; not awaited
  if (!window.SILINX_NO_UPDATE_CHECK) wiz.checkUpdatesOnStart().catch(() => {});
}

export const app = { showInSim, saveAll, openTt, openTtSchematic, openFsm, openPetri, openSch, stepTracker, projectBoard, regenerateUcf, openFile, openAsm, openProject, reloadProject, closeProject, renderStartPage, openDoc, log, setDiagnostics, compileProject, renderHierarchy, renderProcesses, saveProjectJson, setTop, openSummary, showLeftPage, setDirty, findDoc, closeDoc, runSimulation, openPinPlanner, openImpact, followJob, logLine, openMode, S };
window.SilinxApp = app;
// a promise nobody waits for that fails (a menu's action, the start-up's project): said in the
// Console and the Errors tab, not lost (#408); the browser's console keeps its stack. Only Silinx's own:
// another script's (an extension's, a host application's) is left to the browser's console (#997)
window.addEventListener('unhandledrejection', e => {
  if (isOwnFailure(e.reason)) log(`ERROR: ${e.reason?.message || e.reason}`, 'err');
});
boot();
