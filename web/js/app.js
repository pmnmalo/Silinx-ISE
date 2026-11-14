// Silinx Project Navigator — main application shell (ISE-like).
import { api, followJob } from './api.js';
import { icons, icon } from './icons.js';
import { h, dialog, alertDlg, confirmDlg, promptDlg, popupMenu, splitter, setMessageSink } from './ui.js';
import { createEditor, instTemplate, snippetsFor, typeText } from './editor.js';
import { cRunButtons, hlsClock, hlsFamily, hlsMults, isC, noteFailedC } from './c-source.js';
import { compile, implRoots, topCandidates } from '/core/compile.js';
import { genChain } from '/core/util.js';
import { primitiveSources } from '/core/unisim.js';
import * as wiz from './wizards.js';
import { PRODUCT, VERSION_LABEL } from '/core/version.js';
import { startI18n, t } from './i18n.js';
import { applyPrefs } from './silinx.js';
import { initDrawer, drawerGiveWay, leftTabClicked } from './narrow.js';
import { initTasks, restoreStartTask } from './tasks.js';
import { registerServiceWorker } from './pwa.js';
import { createHistory } from './history.js';
import { viewHdl } from '/core/view-hdl.js';
import { modulesFromLibrary } from '/core/schdoc.js';
import { isLabFile } from '/core/labs.js';
import { primitiveTemplates } from '/core/prim-templates.js';
import { deviceFamily, openOnlyDevice } from '/packages/silinx-fpga/src/parts.js';
import { setActionRunner, longPressMenu } from './ui.js';
import { log, logError, logInfo, logLine, logWarning, showConsolePage, setDiagnostics, renderDiagnostics, clearConsole } from './console.js';
import { isOwnFailure } from './own-error.js';
import { renderTeachingPage } from './teaching-page.js';
import { openProject, closeProject, projectRequested, reloadProject, updateTitle, renderStartPage, updateStorageStatus, refreshBlackboxes } from './project.js';
import { FLOW_UP_TO, boardUcf, checkUcfFile, regenerateUcf, runImpl, stepTracker, ucfDiagnostics } from './implement.js';
import { adoptDrawnHdl, drawnHdlClashes, freshHdl, openAsm, openFsm, openPetri, openSch,
  openTt, openTtSchematic, openView, projectPart, refreshSyncBanner, schModules, staleHdl, syncBanner, viewTitle } from './drawings.js';
import { checkFileSyntax, hdlDiagnostics, markStale, openMode, renderProcesses, saveAll, projectTool } from './processes.js';
import { designOnly, hiddenHdl, refusedHere, shownFiles } from './design-only.js';
import { hdlSideFile } from '/core/project-kind.js';
import { fileContextMenu, inView, renderHierarchy, saveProjectJson, select, serialOp, setTop, treeItem } from './design.js';
import { printActive, printable, refreshSteps, settingsItems, setupMenus, setupToolbar, showPalette } from './menus.js';
import { runSimulation } from './viewers.js';
import { renameSymbolIn } from './rename.js';
import { writeClip, readClip, noteCopy, canPasteText } from './clipboard.js';
import { prefKey } from './prefs.js';
import { keepCursor, keptCursor } from './doc-cursor.js';
import { mountSplit, placeSplit, splitClosed, splitItems, tabInSight, tabTip } from './split-view.js';
import { closeAllDocs, restoreViewState, saveViewState, viewKept } from './view-state.js';
import { following, followNotice, editsHere } from './collab-state.js';
import { naturalCompare } from '/core/natural-order.js';

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
  const failedC = [];   // (a C source whose HDL cannot be made: its row and its errors, #2995)
  if (views.length) {
    let mods = {}, lib0 = null;
    try { lib0 = compile(srcs); mods = modulesFromLibrary(lib0, { sources: Object.fromEntries(srcs.map(s => [s.path, s.text])) }); } catch { /* none */ }
    hdlModules = mods;
    // (a drawn source whose module an HDL file of the project already defines: that file, not a second
    // one; the drawing then has no HDL file, said, #230)
    const hdlMods = new Set(Object.keys(mods).map(n => n.toLowerCase()));
    // (a drawing whose HDL file is gone, deleted or removed from the project, is one without it: #231)
    for (const [f, t] of views) {
      const r = viewHdl(f, t, { modules: mods, linked: hdlInProject, lang: S.project.preferredLanguage, clock: hlsClock(), family: hlsFamily(), hls: S.hls, mults: hlsMults() });
      if (!r?.text) { if (isC(f)) failedC.push([f, r]); continue; }
      if (!hdlMods.has(String(r.module).toLowerCase())) { S.viewSources.push({ path: f, lang: r.lang, text: r.text, role: 'design', view: true, module: r.module, errors: r.errors.length, lost: r.lost || null, ...(r.sequential ? { sequential: true } : {}) }); continue; }
      const m = !r.errors.length && [...(lib0?.modules.values() || [])].find(x => x.name.toLowerCase() === String(r.module).toLowerCase());
      if (m) S.viewElsewhere[f] = { module: r.module, lang: r.lang, file: m.archFile || m.file, lost: r.lost || null };
    }
  }
  noteFailedC(failedC, Object.fromEntries(views.filter(([f]) => isC(f))));
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

// The modules at the root of a view's hierarchy: those of its role no module of it instantiates; in the
// Implementation view the top first, a root even when instantiated (#2877; core/elaborate.js implRoots)
export function viewRoots(sim) {
  const lib = S.lib;
  if (!lib) return [];
  const visible = name => inView(moduleInfo(name)?.role || 'design', sim);
  return sim ? topCandidates(lib).filter(visible) : implRoots(lib, { top: S.project?.top, visible });
}

// A top-level module the project no longer has (its source removed from the project, #253): the
// top becomes the one root of its view left, else none (several: the user chooses, a warning); true
// when it changed. (Not while a source of the project still declares it: one being edited.)
export async function fixMissingTops() {
  const pj = S.project;
  const declared = name => (S.sources || []).some(f => new RegExp(`\\b(entity|module)\\s+${String(name).replace(/[^\w$]/g, '')}\\b`, 'i').test(f.text || ''));
  // (the module of a C source whose HDL cannot be made for now, #2995: still its top)
  const cMade = name => Object.values(S.cFailed || {}).some(c => String(c.module || '').toLowerCase() === String(name).toLowerCase());
  let changed = false;
  for (const sim of [false, true]) {
    const key = sim ? 'simTop' : 'top';
    const old = pj[key];
    if (!old || moduleInfo(old) || declared(old) || cMade(old)) continue;
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
      if (it.kind === 'generate_if') {
        // (an else if chain in a loop, #3500)
        for (const g of genChain(it)) {
          visit(g.then, prefix + (g.label ? g.label + '.' : ''));
          if (!g.elseChain) visit(g.else, prefix);
        }
      }
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
// the messages of ui.js's menus and of the editors (#3591): lines of the console
setMessageSink((text, level) => (level === 'error' ? logError : level === 'warning' ? logWarning : logInfo)(text));
// (the toolbar's buttons refreshed when a command ends: Undo / Redo follow the project's history at once, #1199)
setActionRunner((label, fn) => {
  const r = NOT_RECORDED.test(String(label || '')) ? fn() : history.run(label, fn);
  Promise.resolve(r).finally(() => refreshSteps()).catch(() => {});
  return r;
});

// Undo / Redo (Edit menu, toolbar, Ctrl+Z / Ctrl+Y outside an editor): the project's last command
// when it is newer than the last edit of the active document, else the document's own undo
// the Language Templates' Device Primitives (#792): an instantiation template of each primitive of the project's family,
// its count on the part in its comment; none for a family without them
function primTemplatesMenu(d, lang) {
  const part = projectPart(), list = primitiveTemplates(part?.family || deviceFamily(S.project?.device), lang, part);
  return { label: 'Device Primitives', disabled: !list.length, submenu: list.map(t => ({ label: t.name, action: () => d.editor.insertText(t.text) })) };
}
// (a read-only document, the HDL generated from a drawing (#1176): none, its Undo / Redo greyed out, #1192)
export const docEditor = d => d && (d.editor ? (d.editor.readOnly?.() ? null : { undo: () => d.editor.exec('undo'), redo: () => d.editor.exec('redo') }) : d.schEditor || d.asmEditor || d.fsmEditor || d.ttEditor || d.petriEditor || d.symEditor || d.pinPlanner || null);
export const undoesProject = () => history.canUndo() && !(S.active?._editedAt > history.lastAt() && docEditor(S.active));
export const redoesProject = () => history.canRedo() && !(S.active?._editedAt > history.redoAt() && docEditor(S.active));
export async function projectUndo() {
  const e = await history.undo();
  if (e) log(`Undo: ${e.label}.`, 'ok');
  refreshSteps();
}
export async function projectRedo() {
  const e = await history.redo();
  if (e) log(`Redo: ${e.label}.`, 'ok');
  refreshSteps();
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
const clipEditor = d => {
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
export function addToProject(file) { return refusedHere(file) ? Promise.resolve(false) : serialOp(() => addNow(file)); }   // (no HDL in a design project, #3780)
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
  const tab = h('div', { class: 'tab', title: tabTip(doc), tabindex: '0' }, icon(doc.icon || 'file'), h('span', { class: 'tlabel' }, doc.title),
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
      ...splitItems(doc),   // (two documents side by side, #1619)
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
  refreshSteps();   // (its editor made: the toolbar's Undo / Redo follow it at once, not at the next click or second, #2589)
  saveViewState();
  return doc;
}

// background: opened with the project, not by the user (a narrow screen's drawer stays open)
export function activateDoc(doc, { background = false } = {}) {
  S.active = doc;
  for (const d of S.docs) { d.el.hidden = d !== doc; d.tab.classList.toggle('active', d === doc); }
  placeSplit(doc);   // (on its side, the other side's document shown beside it, #1619, #1652)
  // (its tab in sight in a full strip, once the Tasks layout and the split have placed it: web/js/tab-sight.js, #3304)
  tabInSight();
  doc.onActivate?.();
  if (!viewKept() && !background) drawerGiveWay();   // a narrow screen: the drawer gives way to the document (#266)
  updateTitle();
  saveViewState();
  refreshSteps();   // (the toolbar's buttons follow the document in front, #2589)
  // (said, for the Tasks layout to bring its task forward, also when it was in front already behind another task: #1191)
  dispatchEvent(new CustomEvent('silinx:doc-activated', { detail: { doc, background } }));
}

// Editing always saves: a document with changes is written ~0.8 s after the last edit.
// user (the text editor says it, #534): true, the change is the user's own in the editor; false, written
// by the application; undefined (the other editors), judged by the timing below.
export function setDirty(doc, dirty, { user } = {}) {
  if (following()) dirty = false;   // (a project followed, #3181: read only, nothing of it saved)
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
    if (isLabFile(vp) && S.project) import('./lab-view.js').then(m => m.labFileSaved(vp)).catch(() => {});   // (a guided lab checked as it is edited, #3179)
    if (vp && /\.(sch|asm|tt|bool|fsm|pn)\.json$/.test(vp) && !S.schOwners?.[vp] && S.project) {
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
  const other = splitClosed(doc);   // (its side's next document in front, #1619, #1652)
  if (S.active === doc) { const last = other || S.docs[S.docs.length - 1]; if (last) activateDoc(last); else S.active = null; }
  saveViewState();
  return true;
}

// ---- where the user was (#160, #163): web/js/view-state.js (#2886: moved as it was)
export { closeAllDocs, restoreViewState, saveViewState } from './view-state.js';
export function closeDocByPath(path) { for (const d of [...S.docs]) if (d.path === path) { d.dirty = false; closeDoc(d); } }

// ---- HDL / text editor
// (task: the Tasks interface's task the document is shown in, `sim` from the Simulation tree's HDL badge, #1332; else
// its id's, web/js/tasks.js taskOfDoc)
export async function openFile(path, line, col, { task } = {}) {
  if (!S.project) return;
  if (designOnly() && hdlSideFile(path)) return hiddenHdl(path);   // (a design and simulation project's HDL: its drawing instead, #3780)
  if (path.endsWith('.asm.json')) return openAsm(path);
  if (path.endsWith('.sch.json')) return openSch(path);
  if (/\.(tt|bool)\.json$/.test(path)) return openTt(path);
  if (path.endsWith('.fsm.json')) return openFsm(path);
  if (path.endsWith('.pn.json')) return openPetri(path);
  if (/\.sym\.json$/i.test(path)) return (await import('./symbol-doc.js')).openSymbol(path);   // (a module's symbol, #3755)
  if (path.endsWith('.exercise.json')) return (await import('./exercise-view.js')).openExercise(path);   // (#3192)
  const id = `file:${path}`;
  let doc = findDoc(id);
  const fresh = !doc;
  if (!doc) {
    const pj = S.project.name;
    let text;
    try { text = await api.readFile(pj, path); }
    catch (e) { logError(`cannot open ${path}: ${e.message}`); return; }
    if (S.project?.name !== pj) return;   // another project opened during the read: not its file (#1231)
    const lang = /\.(vhd|vhdl)$/i.test(path) ? 'vhdl' : /\.(v|vh|sv)$/i.test(path) ? 'verilog' : /\.ucf$/i.test(path) ? 'ucf' : isC(path) ? 'c' : 'text';   // (c: Silinx HLS, #1524; C++ too, #1590)
    doc = openDoc({
      id, path, task, title: path.split('/').pop(), tooltip: path, icon: lang === 'vhdl' ? 'vhdl' : lang === 'verilog' ? 'verilog' : lang === 'ucf' ? 'ucf' : 'file',
      create(el, d) {
        // the HDL generated from a drawing is read-only: the drawing is the base, edited instead (#1176)
        const generated = () => !!S.hdlToSch?.[path] || (following() && !editsHere(path));   // (a project followed, #3181: read only too, but an editor's text files, #3182)
        const tplBtn = h('button', { class: 'btn', style: { minWidth: '0' }, title: 'Language Templates' }, 'Templates ▾');
        // (no Undo / Redo, the main toolbar's; no path, the tab's tip: #2514)
        const editing = [];
        const bar = h('div', { class: 'editor-bar' },
          h('button', { class: 'tb-btn', title: 'Find (Ctrl+F)', html: icons.find, onclick: () => d.editor.exec('findToggle') }),   // (again: closed, #1328)
          snippetsFor(lang, path) && lang !== 'ucf' ? tplBtn : null,   // (C / C++ too, #1855)
          ...(lang === 'c' ? cRunButtons(path) : []),   // (C Simulation, C/RTL Co-simulation: #1528)
          (lang === 'vhdl' || lang === 'verilog' || lang === 'ucf' || lang === 'c' || isLabFile(path)) ? h('button', { class: 'btn', style: { minWidth: '0' }, title: 'Check Syntax of this file',   // (a guided lab's: #3179)
            onclick: () => (lang === 'ucf' ? checkUcfFile(path) : isLabFile(path) ? import('./lab-view.js').then(m => m.checkLabFile(path)) : checkFileSyntax(path)) }, h('span', { class: 'ico-inline', html: icons.ok }), ' Check Syntax') : null,
          syncBanner(path), followNotice(path));
        if (lang === 'vhdl' || lang === 'verilog' || lang === 'c') editing.push(tplBtn);
        tplBtn.addEventListener('click', e => {
          const r = tplBtn.getBoundingClientRect();
          popupMenu([
            ...snippetsFor(lang, path).map(s => ({ label: s.name, action: () => d.editor.insertText(s.text) })),
            lang === 'c' ? null : '-',
            lang === 'c' ? null : primTemplatesMenu(d, lang),
            lang === 'c' ? null : { label: 'Instantiate module', submenu: S.modules.filter(m => m.file !== path).map(m => ({ label: m.name, action: () => d.editor.insertText(instTemplate(m, lang) + '$0') })) },
          ], r.left, r.bottom);
        });
        const host = h('div', { class: 'editor-host' });
        el.append(bar, host);
        d.editor = createEditor(host, {
          text, lang, path, readOnly: generated(),
          project: () => ({ modules: S.modules }),
          onChange: (info) => { setDirty(d, !d.editor.isClean(), info); if (lang === 'ucf') liveUcf(); else if (lang === 'vhdl' || lang === 'verilog') liveHdl(); },
          onSave: () => flushDoc(d),
          onGotoDefinition: ({ file, line: ln }) => openFile(file, ln),
          onCursor: (l, c) => { clearTimeout(d.cursorTimer); d.cursorTimer = setTimeout(() => keepCursor(S.project?.name, path, { line: l - 1, ch: c - 1 }), 300); },
          onRename: () => renameSymbolIn(d, lang, path),
          onFix: () => recheckFile(path),
        });
        el.append(d.editor.status);   // (its status line: the line and column, the language, #2763)
        if (path === 'build/open/timing.txt' || path === `build/${S.project?.top}.twr` || path === `build/${S.project?.top}_timing.rpt`) d.paths = import('./timing-paths.js').then(m => m.mountTimingPaths(d, el, host));   // (its Paths panel, #3178: ISE's and Vivado's too)
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
        // (a file linked to a drawing, or no longer, while open: read-only or editable again, after a reload)
        d.applyReadOnly = () => {
          const ro = generated();
          d.editor.setReadOnly(ro);
          for (const b of editing) b.hidden = ro;
          refreshSyncBanner(path);
        };
        d.applyReadOnly();
        const ed = d.editor;
        ed.view.dom.addEventListener('contextmenu', e => {
          e.preventDefault();
          const hdl = lang === 'vhdl' || lang === 'verilog';
          const hasSel = ed.somethingSelected();
          const sch = S.hdlToSch?.[path];
          const at = ed.posAt(e.clientX, e.clientY);
          const edit = hdl && !sch;   // (the HDL generated from a drawing: read-only, #1176)
          popupMenu([
            sch ? null : { label: 'Undo', action: () => ed.exec('undo'), disabled: !ed.historySize().undo },
            sch ? null : { label: 'Redo', action: () => ed.exec('redo'), disabled: !ed.historySize().redo },
            sch ? null : '-',
            sch ? null : { label: 'Cut', action: () => { navigator.clipboard?.writeText(ed.getSelection()); ed.replaceSelection(''); }, disabled: !hasSel },
            { label: 'Copy', action: () => navigator.clipboard?.writeText(ed.getSelection()), disabled: !hasSel },
            sch ? null : { label: 'Paste', action: async () => { try { ed.replaceSelection(await navigator.clipboard.readText()); ed.focus(); } catch { logInfo('Use Ctrl+V to paste'); } } },
            { label: 'Select All', action: () => ed.exec('selectAll') },
            '-',
            edit ? { label: 'Toggle Comment', action: () => ed.exec('toggleComment') } : null,
            { label: 'Find…', action: () => ed.exec('findPersistent') },
            edit ? { label: 'Rename Symbol…', shortcut: 'F2', action: () => { if (!hasSel) ed.setCursor(at); renameSymbolIn(d, lang, path); } } : null,
            edit ? { label: 'Quick Fix…', shortcut: 'Ctrl+.', action: () => { ed.setCursor(at); d.editor.showFixMenu(at.line); }, disabled: !d.editor.fixesOnLine(at.line).length } : null,
            edit ? '-' : null,
            edit || lang === 'c' ? { label: 'Language Templates', submenu: snippetsFor(lang, path).map(sn => ({ label: sn.name, action: () => d.editor.insertText(sn.text) })) } : null,
            edit ? primTemplatesMenu(d, lang) : null,
            edit ? { label: 'Instantiate module', submenu: S.modules.filter(m => m.file !== path).map(m => ({ label: m.name, action: () => d.editor.insertText(instTemplate(m, lang) + '$0') })) } : null,
            hdl ? '-' : null,
            hdl ? { label: 'Check Syntax', action: () => checkFileSyntax(path) } : null,
            lang === 'c' ? { label: 'Check Syntax', action: () => checkFileSyntax(path) } : null,   // (Silinx HLS, #1524)
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
          save: async () => {
            // (the HDL generated from a drawing is written by the drawing only, #1176)
            if (generated()) { setDirty(d, false); return; }
            const text = d.editor.getValue();
            await api.writeFile(S.project.name, path, text);
            // (only the text written is clean: an edit made meanwhile is saved next, see flushDoc)
            if (d.editor.getValue() === text) d.editor.markClean();
            setDirty(d, false);
            const src = S.sources.find(s => s.path === path && !s.view);
            if (isC(path)) S.viewTexts[path] = text; else if (src) src.text = text;   // (a C source: its HDL made again, #1531)
            else await reloadProject(false);
            await refreshBlackboxes(path);   // (an RTL blackbox's module or C model: the C sources' HDL made with it, #2342)
            compileProject(); renderHierarchy(); markStale();
            status(`Saved ${path}`);
            // the other open editors depend on this file (ports, instances): check them again
            for (const od of S.docs) if (od !== d) od.liveCheck?.();
          },
          destroy: () => d.editor.destroy(),
        };
      },
    });
  } else { doc.task = task; activateDoc(doc); }   // (the task it is opened from now: Simulation's or Design's)
  // (opened again, no line asked for: where its cursor was, #1299)
  const kept = fresh && !line && doc?.editor && keptCursor(S.project.name, path);
  if (kept) setTimeout(() => { try { doc.editor?.setCursor(kept); } catch { /* the file is shorter now */ } }, 30);
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

// ------------------------------------------------------------------ viewers: schematics, SSim, Board Emulator (web/js/viewers.js)

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
  openDoc({ id: 'fpgaview', title: `FPGA (${top})`, icon: 'chip', printFit: 'page', tooltip: `${title}: ${m.device.part}`,
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
  // (an open family's: its page, titled by its flow's programming (the iCE40's Program Flash, the ECP5's Program FPGA), no
  // iMPACT, #2298)
  openDoc({ id: 'impact', title: openOnlyDevice(S.project?.device) ? projectTool().program?.title || 'iMPACT' : 'iMPACT', icon: 'impact', create: (el, d) => mountImpact(el, d) });
}

// ------------------------------------------------------------------ left pages
export function showLeftPage(page) {
  S.leftPage = page;
  saveViewState();
  document.querySelectorAll('#left-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.page === page));
  document.querySelectorAll('.left-page').forEach(p => { p.hidden = p.dataset.page !== page; });
  if (page === 'start') renderStartPage();
  if (page === 'teaching') renderTeachingPage();
}

export function renderFilesPage() {
  const host = $('files-page');
  host.innerHTML = '';
  if (!S.project) return;
  const tbl = h('table', { class: 'grid' }, h('tr', {}, h('th', {}, 'File Name'), h('th', {}, 'Association'), h('th', {}, 'Language')));
  // files sorted by path, each folder as a row of its own (right-click: rename / delete the folder)
  const reg = new Map(S.project.files.map(f => [f.path, f]));
  const inProject = new Set(S.fileTree);
  const paths = shownFiles([...new Set([...S.project.files.map(f => f.path), ...(S.diskTree || S.fileTree)])]).sort(naturalCompare);   // (no HDL in a design project, #3780)
  const shown = new Set();
  for (const path of paths) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (shown.has(dir)) continue;
      shown.add(dir);
      tbl.append(h('tr', { class: 'folder-row', 'data-folder': dir, oncontextmenu: e => { e.preventDefault(); folderContextMenu(e, dir); } },
        h('td', { style: { fontWeight: 'bold', paddingLeft: `${4 + (i - 1) * 14}px` } }, icon('folder'), `${parts[i - 1]}/`), h('td', {}), h('td', {})));
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
  const views = S.fileTree.filter(f => /\.(sch|asm|tt|bool|fsm|pn)\.json$/i.test(f));
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
        await api.writeFile(S.project.name, at, JSON.stringify(d, null, /\.(asm|tt|bool|fsm)\.json$/i.test(at) ? 2 : 1));
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
  const trash = !api.standalone || api.keepsTrash;   // (into the workspace's .trash, #3364; a browser's storage has none)
  if (!await confirmDlg('Delete Folder', `Delete the folder '${dir}' and the ${files.length} file(s) in it from the project?${trash ? '\n(They are moved to the workspace\'s .trash folder, from where you can move them back.)' : ''}\n\n${files.slice(0, 12).join('\n')}${files.length > 12 ? '\n…' : ''}`)) return;
  for (const d of [...S.docs]) if (d.path && d.path.startsWith(`${dir}/`)) { d.dirty = false; clearTimeout(d._autosave); await closeDoc(d); }
  try {
    const r = await api.deleteFile(S.project.name, dir, { trash });
    log(`Folder ${dir} deleted (${files.length} file(s)${r?.trashed ? `; moved to the workspace's .trash folder: ${r.trashed}` : ''}).`, 'ok');
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
  // (the Silinx interface, the Tasks layout: the test bench Simulate's, the one it runs, #1161)
  if (document.documentElement.dataset.layout === 'tasks') {
    const m = S.modules.find(x => x.name === mod);
    if (m) select({ type: 'module', module: mod, file: m.file });   // (its processes: the Simulation view's)
    return setTop(mod, true);
  }
  const key = CSS.escape(`m:${mod}`), row = document.querySelector(`#hier [data-key="${key}"]`);
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
  // the site's page: installable as an app, kept for offline use (#1051)
  if (globalThis.SILINX_STANDALONE) registerServiceWorker();
  document.querySelectorAll('.ico-inline[data-icon]').forEach(e => { e.innerHTML = icons[e.dataset.icon] || ''; });
  setupMenus();
  setupToolbar();
  mountSplit();   // (the Split button, #1652)
  splitter($('v-split'), $('left'), { dir: 'h', min: 180, max: 700, storageKey: 'xl.leftW' });
  splitter($('left-split'), $('proc-panel'), { dir: 'v', min: 80, max: 900, invert: true, storageKey: 'xl.procH' });
  splitter($('h-split'), $('console-wrap'), { dir: 'v', min: 60, max: 700, invert: true, storageKey: 'xl.consoleH' });
  initDrawer();
  document.querySelectorAll('#left-tabs .tab').forEach(t => t.addEventListener('click', () => { leftTabClicked(t.dataset.page, document.querySelector('#left-tabs .tab.active')?.dataset.page); showLeftPage(t.dataset.page); }));
  // (the Teaching page's commands of a project enabled or disabled with it, #3533)
  for (const ev of ['silinx:project-opened', 'silinx:project-closed']) addEventListener(ev, () => renderTeachingPage());
  document.querySelectorAll('#console-tabs .tab').forEach(t => t.addEventListener('click', () => showConsolePage(t.dataset.page)));
  document.querySelectorAll('input[name=view]').forEach(r => r.addEventListener('change', () => setView(r.value)));
  // Clear: the console and the Warnings and Errors tabs, their counts too (#302; the editors' marks stay,
  // checked again at the next edit)
  $('console-clear').addEventListener('click', clearConsole);
  // Silinx interface: header search / settings / project, keyboard access to the activity bar
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  for (const k of [$('palette-kbd'), ...document.querySelectorAll('.pal-key')]) k.textContent = mac ? '⌘ K' : 'Ctrl K';
  $('palette-btn').addEventListener('click', () => showPalette());
  $('settings-btn').addEventListener('click', e => { const r = e.currentTarget.getBoundingClientRect(); popupMenu(settingsItems(), r.right, r.bottom + 4); });   // (#1314)
  document.querySelectorAll('#left-tabs .tab').forEach(t => t.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t.click(); } }));
  initTasks(app);   // the Tasks interface's switchers and bar (built in every interface, shown in that one: #804)
  for (const ev of ['click', 'keyup']) addEventListener(ev, () => setTimeout(refreshSteps), true);
  setInterval(refreshSteps, 1000);
  addEventListener('keydown', e => {
    // Ctrl/Cmd+K, Ctrl/Cmd+Shift+P: the command palette (not while a dialog is open)
    if ((e.metaKey || e.ctrlKey) && !e.altKey && ((e.key === 'k' || e.key === 'K') && !e.shiftKey || (e.shiftKey && (e.key === 'p' || e.key === 'P')))
      && !document.querySelector('.dlg-overlay')) { e.preventDefault(); showPalette(); return; }
    // Ctrl/Cmd+Shift+F: Find in Project (#1430)
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && (e.key === 'f' || e.key === 'F') && S.project && !document.querySelector('.dlg-overlay')) { e.preventDefault(); import('./find-project.js').then(f => f.openFindInProject()); return; }
    if (!e.defaultPrevented && (e.metaKey || e.ctrlKey) && (e.key === 'p' || e.key === 'P') && printable()) { e.preventDefault(); printActive(); return; }
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
  // a shared project's link (#3181): followed, read only, instead of the workspace's projects
  const followed = /^#(follow|edit)=/.test(location.hash) && await (await import('./collab-follow.js')).startFollowing();
  // (one pasted into this tab's address bar later: only the fragment changes, the page is not loaded again, #3318)
  log(`${PRODUCT} ${VERSION_LABEL} Project Navigator — HDL design, schematics, behavioural simulation and Xilinx FPGA implementation/programming.`, 'info');
  if (api.standalone) {
    const st = await api.initStorage().catch(() => api.storage());
    const where = st.kind === 'folder' ? `in the folder '${st.folder}' on the disk (File > Use Browser Storage to keep them in this browser)`
      : `in this browser (File > Export Project (.zip)… to keep a copy${st.supported ? '; File > Open Workspace Folder… keeps them in a folder on the disk' : ''})`;
    log(`Browser edition: projects are stored ${where}. Implement Design and Generate Programming File run the Silinx toolchain here (the Spartan-3E, the Spartan-6 of the Nexys3 and the Atlys, and the Artix-7 of the Basys 3 and the Nexys A7); Configure Target Device programs the FPGA of the board and its Platform Flash over USB (Chrome / Edge).`, 'info');
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
    if (api.standalone || api.following) return;
    const progs = Object.entries(tc.programmers).filter(([, v]) => v.found).map(([k]) => k);
    log(`Programmers found: ${progs.length ? progs.join(', ') : 'none (install openFPGALoader, xc3sprog, Digilent Adept or ISE iMPACT)'}`, progs.length ? 'ok' : 'warn', opts);
  }).catch(() => {}).finally(() => { S.startupChecked = true; });   // (the start-up lines all written: the UI tests wait for it)
  renderHierarchy();
  renderProcesses();
  let last = null;
  try { last = localStorage.getItem(prefKey('silinx.lastProject')); } catch { /* ignore */ }
  const projects = await api.projects().catch(() => []);
  // (a project opened meanwhile, e.g. from the Start page: kept, not replaced by the last one, #2492)
  const asked = projectRequested();
  const link = location.hash.length > 1 && (await import('./link-open.js')).linkOptions();   // a design's link: its project, not the last (#2826)
  // (a workspace folder waiting for its permission: its last project is not the browser's one of that name)
  if (followed) { await openProject(followed); await (await import('./collab-follow.js')).openFollowedTop(); }   // (a module's link: on it, #3631)
  else if (!asked && !link && last && projects.some(p => p.name === last) && !(api.standalone && api.storage().needsPermission)) {
    try {
      await openProject(last, { startup: true });   // (where the user was: its tasks too, #1191)
      await new Promise(r => setTimeout(r, 0));   // (the reopened documents' tasks followed first)
      restoreStartTask();   // (and the task that was in front, #1337)
    } finally { delete document.documentElement.dataset.restoring; delete document.documentElement.dataset.starting; }   // (the work area shown, where the user was: #1339; the whole app, #1403)
  }
  else if (!asked) showLeftPage('start');
  delete document.documentElement.dataset.starting;   // (no project reopened: the app shown at once, #1403)
  if (link) await (await import('./link-open.js')).openFromLink(link).finally(() => { S.linkOpened = true; });   // (the UI tests wait for it)
  (await import('./link-hash.js')).watchLinks();   // a link given to the running app: opened as at start-up (#3316)
  S.linksWatched = true;   // (the UI tests wait for it before they change the hash, #3331)
  // check for updates at start-up (a newer release opens the update dialog) unless the setting is off; not awaited
  if (!window.SILINX_NO_UPDATE_CHECK) wiz.checkUpdatesOnStart().catch(() => {});
}

export const app = { projectTool, showInSim, saveAll, openTt, openTtSchematic, openFsm, openPetri, openSch, stepTracker, projectBoard, regenerateUcf, boardUcf, openFile, openAsm, openProject, reloadProject, closeProject, renderStartPage, openDoc, activateDoc, log, setDiagnostics, compileProject, renderHierarchy, renderProcesses, saveProjectJson, setTop, openSummary, showLeftPage, setDirty, findDoc, closeDoc, runSimulation, openPinPlanner, openImpact, followJob, logLine, openMode, setView, select, S };
window.SilinxApp = app;
// a promise nobody waits for that fails (a menu's action, the start-up's project): said in the
// Console and the Errors tab, not lost (#408); the browser's console keeps its stack. Only Silinx's own:
// another script's (an extension's, a host application's) is left to the browser's console (#997)
window.addEventListener('unhandledrejection', e => {
  if (isOwnFailure(e.reason)) log(`ERROR: ${e.reason?.message || e.reason}`, 'err');
});
boot();
