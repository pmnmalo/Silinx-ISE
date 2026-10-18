// Silinx Project Navigator — main application shell (ISE-like).
import { api, followJob } from './api.js';
import { icons, icon } from './icons.js';
import { h, dialog, alertDlg, confirmDlg, promptDlg, popupMenu, menuBar, splitter, toast, downloadText } from './ui.js';
import { createEditor, instTemplate, SNIPPETS, typeText } from './editor.js';
import { renameSymbolAtCursor, applyEdits } from './refactor.js';
import { quickFixes } from '/core/quickfix.js';
import { compile, elaborate, topCandidates } from '/core/compile.js';
import { primitiveSources } from '/core/unisim.js';
import { Simulator } from '/core/simulator.js';
import { buildSchematic } from '/core/schematic.js';
import * as wiz from './wizards.js';
import { PRODUCT, VERSION_LABEL } from '/core/version.js';
import { EXAMPLE_ORDER } from '/core/examples.js';
import { startI18n, setLanguage, getLanguage, LOCALES, t } from './i18n.js';
import { onLanguageChange } from './i18n.js';
import { designDiags, hintRow, sevWord, lintEnabled, setLintEnabled } from './diaghelp.js';
import { applyPrefs, getInterface, setInterface, getTheme, setTheme, toggleTheme, menuCommands } from './modern.js';
import { openPalette } from './palette.js';
import { initDrawer, drawerGiveWay, leftTabClicked } from './narrow.js';
import { createHistory } from './history.js';
import { viewHdl, drawnModule, drawnHdlPath, drawnHdlClash } from '/core/view-hdl.js';
import { modulesFromLibrary } from '/core/schdoc.js';
import { countEvent } from './analytics.js';
import { setActionRunner, runAction, longPressMenu } from './ui.js';

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

// ------------------------------------------------------------------ console
export function log(text, cls = '', { diag = true } = {}) {
  const el = $('console-log');
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
  for (const line of String(text).split('\n')) {
    el.append(h('div', { class: `ln ${cls}` }, line));
    if (diag) consoleMessage(line, cls);
  }
  while (el.childElementCount > 5000) el.firstChild.remove();
  if (atBottom) el.scrollTop = el.scrollHeight;
}

// Every warning/error shown in the console also goes to the Warnings / Errors tabs.
// Recognised forms: "ERROR:Tool:123 - msg", "WARNING:Tool - msg", "ERROR: msg", "WARNING: msg";
// indented lines right after one are its continuation (ISE wraps long messages) — unless the
// message is already complete (ends a sentence) or the line is report output (XST's indented
// "Found finite state machine…", tables, rules), which would otherwise be glued to the warning.
let lastConsoleDiag = null;
const continuesDiag = (d, line) => /^\s{2,}\S/.test(line) && !/[.!?:]\s*$/.test(d.message)
  && !/^\s*([|=+-]{2,}|\||Found\b|Summary:|Unit\b|Synthesizing\b|inferred\b)/.test(line);
function consoleMessage(line, cls) {
  if (lastConsoleDiag && !cls && continuesDiag(lastConsoleDiag, line)) {
    lastConsoleDiag.message += ' ' + line.trim();
    renderDiagnosticsSoon();
    return;
  }
  lastConsoleDiag = null;
  if (cls !== 'err' && cls !== 'warn') return;
  const m = /^\s*(ERROR|WARNING|FATAL|CRITICAL WARNING)\s*:\s*(?:([A-Za-z][\w-]*(?::\d+)?)\s+-\s+)?(.*)$/i.exec(line);
  let severity = cls === 'err' ? 'error' : 'warning', tool = 'Silinx', message = line.trim();
  if (m) { severity = /error|fatal/i.test(m[1]) ? 'error' : 'warning'; tool = m[2] || 'Silinx'; message = m[3]; }
  else if (/=== SILINX FAILED/.test(line)) { tool = 'Silinx'; message = line.replace(/=+/g, '').trim(); }
  if (!message) return;
  const d = { severity, tool, message, file: null, line: 0, source: 'console' };
  S.diags.push(d);
  lastConsoleDiag = d;
  renderDiagnosticsSoon();
}

let diagTimer = null;
function renderDiagnosticsSoon() {
  if (diagTimer) return;
  diagTimer = setTimeout(() => { diagTimer = null; renderDiagnostics(); }, 50);
}
function logLine(line, opts) {
  let cls = '';
  if (/^(ERROR|FATAL)|\bERROR:/i.test(line) || /=== SILINX FAILED/.test(line)) cls = 'err';
  else if (/^WARNING|\bWARNING:/i.test(line)) cls = 'warn';
  else if (/=== SILINX (STEP|DONE)/.test(line) || /completed successfully/i.test(line)) cls = 'ok';
  log(line, cls, opts);
}
function showConsolePage(page) {
  document.querySelectorAll('#console-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.page === page));
  document.querySelectorAll('.console-page').forEach(p => { p.hidden = p.dataset.page !== page; });
}

// Diagnostics (Errors / Warnings tabs)
export function setDiagnostics(diags, { keepConsole = true } = {}) {
  // a check replaces its own entries; warnings/errors collected from the console (e.g. a running
  // implementation) are kept unless keepConsole is false
  S.diags = [...diags, ...(keepConsole ? S.diags.filter(d => d.source === 'console') : [])];
  lastConsoleDiag = null;
  renderDiagnostics();
  // push file-local diagnostics to open editors
  for (const doc of S.docs) if (doc.editor) doc.editor.setDiagnostics(diags.filter(d => d.file === doc.path && d.source !== 'parse'));
}

function renderDiagnostics() {
  const diags = S.diags;
  const errs = diags.filter(d => d.severity === 'error'), warns = diags.filter(d => d.severity !== 'error');
  const fill = (el, list, ico) => {
    el.innerHTML = '';
    if (!list.length) { el.append(h('div', { class: 'ln info' }, 'No messages.')); return; }
    for (const d of list) {
      const hint = hintRow(d);   // plain-language explanation + fix, expandable under the message
      const row = h('div', { class: 'diag' }, icon(ico),
        h('span', {}, `${sevWord(d)}:${d.tool || 'HDLCompiler'} - `),
        d.file ? h('span', { class: 'loc' }, `"${d.file}" Line ${d.line}`) : null,
        h('span', { 'data-no-i18n': true }, d.file ? `: ${d.message}` : d.message), hint?.toggle,
        ...diagFixes(d).map(f => h('span', { class: 'diag-fix', role: 'button', 'data-no-i18n': true, onclick: e => { e.stopPropagation(); applyDiagFix(d, f); } }, `${t('Fix:')} ${t(f.title)}`)));
      row.addEventListener('click', () => d.file && openFile(d.file, d.line, d.col));
      el.append(row);
      if (hint) el.append(hint.box);
    }
  };
  fill($('console-errors'), errs, 'err');
  fill($('console-warnings'), warns, 'warn');
  $('err-count').textContent = errs.length ? `(${errs.length})` : '';
  $('warn-count').textContent = warns.length ? `(${warns.length})` : '';
}
onLanguageChange(() => renderDiagnostics());

// Quick fixes of a message (core/quickfix.js): "Fix: …" in its row of the Errors / Warnings tabs.
// Applied in the file's editor (one Undo there); the file's messages are then checked again.
const fixModules = () => S.modules.map(m => ({ name: m.name, ports: (m.portList || []).map(p => p.name), params: m.paramList || [] }));
function diagFixes(d) {
  const src = d.file && S.sources.find(s => s.path === d.file);
  if (!src || src.view || (src.lang !== 'vhdl' && src.lang !== 'verilog')) return [];   // (not a drawing's generated HDL)
  const text = S.docs.find(o => o.path === d.file && o.editor)?.editor.getValue() ?? src.text;
  try { return quickFixes(text, src.lang, d, { modules: fixModules() }).slice(0, 3); } catch { return []; }
}
async function applyDiagFix(d, f) {
  const doc = await openFile(d.file, d.line, d.col);
  const ed = doc?.editor;
  if (!ed) return;
  // the same fix on the editor's text now (it may have changed since the row was drawn)
  const fix = ed.quickFixes(d).find(x => x.title === f.title);
  if (fix) ed.applyFix(fix); else toast('No quick fix here.', 'info');
}
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
const withPrimitives = srcs => [...primitiveSources(srcs), ...srcs];
// whether a drawing's HDL file (generatedFile) is there, in the project (#231: else it has none)
const hdlInProject = f => (S.fileTree || []).includes(f);
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
  if (S.docs.some(d => d.schEditor)) schModules().then(mods => { for (const d of S.docs) d.schEditor?.setModules(mods); }).catch(() => {});
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

function moduleInfo(name) { return S.modules.find(m => m.name === name) || S.modules.find(m => m.name.toLowerCase() === String(name).toLowerCase()); }

// The modules at the root of a view's hierarchy: those of its role no module of it instantiates (in the
// Implementation view, a module instantiated only from a test bench is a root too)
function viewRoots(sim) {
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
async function fixMissingTops() {
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
function instancesOf(mod) {
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

// ------------------------------------------------------------------ hierarchy panel
function renderHierarchy() {
  const host = $('hier');
  const focused = host.contains(document.activeElement) ? (document.activeElement.closest('.badge') ? 'badge' : 'tree') : null;
  host.innerHTML = '';
  if (!S.project) { host.append(h('div', { class: 'tree empty' }, 'No project open. Use File > New Project or File > Open Project.')); return; }
  const pj = S.project;
  const tree = h('ul', { class: 'tree', tabindex: '0', 'aria-label': 'Design hierarchy', onkeydown: treeKeys });
  const dev = `${pj.device.part}${pj.device.speed}-${pj.device.package}`;
  const root = treeItem({ label: pj.name, ico: 'project', open: true, onSelect: () => select({ type: 'project' }), key: 'project' });
  tree.append(root.li);
  const devItem = treeItem({ label: S.view === 'impl' ? dev : 'Behavioral', ico: S.view === 'impl' ? 'chip' : 'sim', open: true, key: 'device', onSelect: () => select({ type: 'device' }), onContext: e => projectContextMenu(e) });
  root.ul.append(devItem.li);

  const lib = S.lib;
  const roots = viewRoots(S.view === 'sim');
  const topName = S.view === 'impl' ? pj.top : null;   // the Simulation view has no top: Simulate runs the selected module
  roots.sort((a, b) => (a === topName ? -1 : b === topName ? 1 : a.localeCompare(b)));
  const addModule = (parentUl, modName, instName, depth, path) => {
    const info = moduleInfo(modName);
    const isTop = !instName && modName === topName;
    const file = info?.file || '?';
    // "label - module" like ISE; just the name when the instance is labelled with the module name
    const label = instName && instName.toLowerCase() !== String(modName).toLowerCase() ? `${instName} - ${modName}` : modName;
    // a drawn source without an HDL file (#177): the module is the drawing itself
    const drawn = info && /\.(sch|asm|tt|fsm|pn)\.json$/.test(file) ? file : null;
    const sch = drawn || (info && viewOfModule(info.name, file));
    // one row per module: its base's icon (the drawing's when it has one: its HDL is generated from it),
    // then a badge for each of its views: the drawing's first (the base's, marked), its HDL's last, named
    // by the file's language (#207, #220)
    const badges = !info ? [] : [
      sch ? { text: viewBadge(sch), base: true, title: drawn ? 'Open' : 'Base: its HDL is generated from it', open: () => openView(sch), context: e => (drawn ? viewContextMenu(e, drawn) : syncedViewMenu(e, sch)) } : null,
      drawn ? null : { text: info.lang === 'vhdl' ? 'VHDL' : 'Verilog', base: !sch, title: sch ? `Generated from the ${viewNoun(sch)}` : 'Open', open: () => openFile(file, info.line), context: e => moduleContextMenu(e, modName, file) },
      drawn ? clashBadge(drawn) : null,
    ].filter(Boolean);
    const it = treeItem({
      label, meta: info ? `(${(sch || file).split('/').pop()})` : '(missing)', ico: isTop ? 'moduleTop' : sch ? viewIcon(sch) : info ? (info.lang === 'vhdl' ? 'vhdl' : 'verilog') : 'err',
      cls: isTop ? 'top-mod' : '', key: `m:${path}`, open: depth < 2, badges,
      onSelect: () => select(drawn ? { type: viewKind(drawn), file: drawn, module: modName, path, instName } : { type: 'module', module: modName, file, path, instName, sch }),
      onOpen: () => info && (sch ? openView(sch) : openFile(file, info.line)),
      onContext: e => (drawn ? viewContextMenu(e, drawn) : moduleContextMenu(e, modName, file)),
    });
    parentUl.append(it.li);
    if (info && depth < 30) {
      const kids = instancesOf(info.mod);
      if (!kids.length) it.setLeaf();
      for (const k of kids) addModule(it.ul, k.module, k.name, depth + 1, `${path}/${k.name}`);
    } else it.setLeaf();
  };
  for (const r of roots) addModule(devItem.ul, r, null, 0, r);

  // packages, constraints, ASM charts and other files
  for (const p of lib.packages.values()) {
    const fi = S.project.files.find(f => f.path === p.file);
    if (!inView(fi?.role, S.view === 'sim')) continue;
    const it = treeItem({ label: p.name, meta: `(${p.file.split('/').pop()})`, ico: 'vhdl', key: `pkg:${p.name}`, onSelect: () => select({ type: 'file', file: p.file }), onOpen: () => openFile(p.file, p.loc?.line), onContext: e => fileContextMenu(e, p.file) });
    it.setLeaf(); devItem.ul.append(it.li);
  }
  if (S.view === 'impl' && pj.constraints && S.fileTree?.includes(pj.constraints)) {
    const it = treeItem({ label: pj.constraints.split('/').pop(), ico: 'ucf', key: 'ucf', onSelect: () => select({ type: 'ucf', file: pj.constraints }), onOpen: () => openFile(pj.constraints), onContext: e => fileContextMenu(e, pj.constraints) });
    it.setLeaf(); devItem.ul.append(it.li);
  }
  for (const f of (S.fileTree || []).filter(f => /\.sch\.json$/.test(f) && !S.schOwners?.[f] && !S.modules.some(m => m.file === f))) {
    const owned = null;
    const it = treeItem({ label: f.split('/').pop(), meta: owned ? `(→ ${owned.split('/').pop()})` : '', ico: 'schematic', key: `sch:${f}`, badges: [clashBadge(f)].filter(Boolean), onSelect: () => select({ type: 'sch', file: f }), onOpen: () => openSch(f), onContext: e => schContextMenu(e, f) });
    it.setLeaf(); devItem.ul.append(it.li);
  }
  for (const f of (S.fileTree || []).filter(f => /\.asm\.json$/.test(f) && !S.schOwners?.[f] && !S.modules.some(m => m.file === f))) {
    const it = treeItem({ label: f.split('/').pop(), ico: 'asm', key: `asm:${f}`, badges: [clashBadge(f)].filter(Boolean), onSelect: () => select({ type: 'asm', file: f }), onOpen: () => openAsm(f), onContext: e => asmContextMenu(e, f) });
    it.setLeaf(); devItem.ul.append(it.li);
  }
  for (const f of (S.fileTree || []).filter(f => /\.tt\.json$/.test(f) && !S.schOwners?.[f] && !S.modules.some(m => m.file === f))) {
    const it = treeItem({ label: f.split('/').pop(), ico: 'truthtable', key: `tt:${f}`, badges: [clashBadge(f)].filter(Boolean), onSelect: () => select({ type: 'tt', file: f }), onOpen: () => openTt(f), onContext: e => ttContextMenu(e, f) });
    it.setLeaf(); devItem.ul.append(it.li);
  }
  for (const f of (S.fileTree || []).filter(f => /\.fsm\.json$/.test(f) && !S.schOwners?.[f] && !S.modules.some(m => m.file === f))) {
    const it = treeItem({ label: f.split('/').pop(), ico: 'fsm', key: `fsm:${f}`, badges: [clashBadge(f)].filter(Boolean), onSelect: () => select({ type: 'fsm', file: f }), onOpen: () => openFsm(f), onContext: e => fsmContextMenu(e, f) });
    it.setLeaf(); devItem.ul.append(it.li);
  }
  for (const f of (S.fileTree || []).filter(f => /\.pn\.json$/.test(f) && !S.schOwners?.[f] && !S.modules.some(m => m.file === f))) {
    const it = treeItem({ label: f.split('/').pop(), ico: 'petri', key: `pn:${f}`, badges: [clashBadge(f)].filter(Boolean), onSelect: () => select({ type: 'pn', file: f }), onOpen: () => openPetri(f), onContext: e => petriContextMenu(e, f) });
    it.setLeaf(); devItem.ul.append(it.li);
  }
  // files that failed to parse into any unit
  const withUnits = new Set(lib.parsed.filter(p => p.units.length).map(p => p.file));
  for (const f of S.project.files.filter(f => !withUnits.has(f.path) && inView(f.role, S.view === 'sim'))) {
    const it = treeItem({ label: f.path.split('/').pop(), meta: '(no units)', ico: f.lang === 'vhdl' ? 'vhdl' : 'verilog', key: `f:${f.path}`, onSelect: () => select({ type: 'file', file: f.path }), onOpen: () => openFile(f.path), onContext: e => fileContextMenu(e, f.path) });
    it.setLeaf(); devItem.ul.append(it.li);
  }
  host.append(tree);
  // restore selection
  const key = S.selKey;
  const row = key && host.querySelector(`[data-key="${CSS.escape(key)}"]`);
  if (row) markSelRow(row);
  else {
    const first = host.querySelector(`[data-key^="m:"]`);
    if (first) first.dispatchEvent(new MouseEvent('click'));
  }
  // (redrawn while the user was in it from the keyboard: the focus stays there)
  if (focused) (focused === 'badge' && host.querySelector('.row.sel .badge') || tree).focus({ preventScroll: true });
}

// a drawing without its HDL file because a file is in the way (#230): a warning badge, its tip says
// why; a click resolves it (Generate HDL File…)
function clashBadge(f) {
  const c = S.hdlClash?.[f];
  return c ? { text: 'No HDL', warn: true, title: clashTip(c), open: () => resolveHdlClash(f), context: e => viewContextMenu(e, f) } : null;
}

// the view a module of an HDL file is synchronized with: only the module that drawing makes, not the
// other modules of its file (a schematic's blocks, #175, are plain HDL modules, #207)
function viewOfModule(name, file) {
  const v = S.hdlToSch?.[file];
  if (!v) return null;
  const mods = S.modules.filter(m => m.file === file && m.kind !== 'package').map(m => ({ name: m.name, instances: instancesOf(m.mod).map(i => i.module) }));
  return String(drawnModule(mods, S.viewModule?.[v])).toLowerCase() === String(name).toLowerCase() ? v : null;
}

// badges: the views of a module ({ text, base, title, open, context }), after its name: a click opens
// that view, a right-click shows its commands; the base's is marked. Tab reaches the selected row's badges.
function treeItem({ label, meta, ico, open = false, onSelect, onOpen, onContext, cls = '', key, badges = [] }) {
  const li = h('li');
  // what the user collapsed / expanded is remembered across redraws
  if (key && S.treeOpen.has(key)) open = S.treeOpen.get(key);
  const tw = h('span', { class: 'twisty' }, open ? '▾' : '▸');
  const views = badges.map(b => {
    const el = h('button', { type: 'button', class: `badge${b.base ? ' base' : ''}${b.warn ? ' warn' : ''}`, tabindex: '-1', title: b.title }, b.text);
    el.addEventListener('click', e => { e.stopPropagation(); selectRow(row, key, onSelect); b.open(); });
    el.addEventListener('dblclick', e => e.stopPropagation());
    el.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); selectRow(row, key, onSelect); b.context(e); });
    return el;
  });
  // (the badges next to the name, the file in brackets last: in a narrow pane it gives way first)
  const row = h('div', { class: `row ${cls}`, 'data-key': key }, tw, icon(ico), h('span', { class: 'lbl' }, label),
    views.length ? h('span', { class: 'badges' }, views) : null, meta ? h('span', { class: 'meta' }, meta) : null);
  const ul = h('ul');
  if (!open) ul.hidden = true;
  li.append(row, ul);
  tw.addEventListener('click', e => {
    e.stopPropagation();
    ul.hidden = !ul.hidden;
    tw.textContent = ul.hidden ? '▸' : '▾';
    if (key) S.treeOpen.set(key, !ul.hidden);
  });
  tw.addEventListener('dblclick', e => e.stopPropagation());
  row.addEventListener('click', () => selectRow(row, key, onSelect));
  row.addEventListener('dblclick', () => { if (onOpen) onOpen(); else if (ul.childElementCount) tw.click(); });
  row.addEventListener('contextmenu', e => { e.preventDefault(); row.click(); onContext?.(e); });
  longPressMenu(row);   // (its badges' menus too: a touch's long press, #263)
  return { li, ul, row, setLeaf() { tw.textContent = ''; } };
}
function selectRow(row, key, onSelect) {
  markSelRow(row);
  if (row.closest('#hier')) S.selKey = key;
  onSelect?.();
}
function markSelRow(row) {
  const tree = row.closest('.tree');
  tree?.querySelectorAll('.row.sel').forEach(r => r.classList.remove('sel'));
  tree?.querySelectorAll('.badge[tabindex="0"]').forEach(b => b.setAttribute('tabindex', '-1'));
  row.classList.add('sel');
  row.querySelectorAll('.badge').forEach(b => b.setAttribute('tabindex', '0'));
}

// The Design tree from the keyboard (it takes the focus): ↑ / ↓ select, → / ← expand / collapse (←
// on a collapsed or leaf row: its parent), Enter opens (as a double-click), the context-menu key or
// Shift+F10 shows the row's menu, Tab reaches the selected row's badges (Enter opens that view).
function treeKeys(e) {
  if (e.target.closest?.('.badge') || e.altKey || e.ctrlKey || e.metaKey) return;
  const tree = e.currentTarget;
  const rows = [...tree.querySelectorAll('.row')].filter(r => r.getClientRects().length);
  const cur = tree.querySelector('.row.sel');
  const i = rows.indexOf(cur);
  const go = r => { if (!r) return; r.click(); r.scrollIntoView({ block: 'nearest' }); };
  const tw = cur?.querySelector('.twisty');
  const sub = cur?.nextElementSibling;
  if (e.key === 'ArrowDown') go(rows[Math.min(i + 1, rows.length - 1)] || rows[0]);
  else if (e.key === 'ArrowUp') go(rows[Math.max(i - 1, 0)]);
  else if (e.key === 'ArrowRight' && cur) { if (sub?.childElementCount && sub.hidden) tw.click(); else if (sub?.childElementCount) go(sub.querySelector('.row')); }
  else if (e.key === 'ArrowLeft' && cur) { if (sub?.childElementCount && !sub.hidden) tw.click(); else go(cur.parentElement.parentElement.closest('li')?.querySelector(':scope > .row')); }
  else if (e.key === 'Enter' && cur) cur.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  else if ((e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) && cur) {
    const b = cur.getBoundingClientRect();
    cur.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.left + 24, clientY: b.bottom }));
  } else return;
  e.preventDefault();
}

function select(sel) {
  S.sel = sel;
  renderProcesses();
  syncFpgaView(sel);
}

// Test Bench Wizard (loaded on first use)
async function testBench(mod) {
  const { testBenchWizard } = await import('./tbwizard.js');
  return testBenchWizard({ module: mod });
}

// is a source of association `role` part of the view? design = both views ("All"),
// sim = simulation only, impl = implementation only (synthesis, not simulated)
export function inView(role, sim) {
  if (role === 'sim') return sim;
  if (role === 'impl') return !sim;
  return true;
}

function moduleContextMenu(e, mod, file) {
  const isSimView = S.view === 'sim';
  popupMenu([
    isSimView ? null : { label: 'Set as Top Module', action: () => setTop(mod, false) },
    { label: 'Open', action: () => { const i = moduleInfo(mod); if (i) openFile(i.file, i.line); } },
    { label: 'Rename…', action: () => renameDialog(file, mod) },
    { label: 'Check Syntax', action: () => checkSyntax(mod, isSimView) },
    { label: 'View RTL Schematic', action: () => openSchematic(mod) },
    { label: 'Create Test Bench (Wizard)…', action: () => testBench(mod) },
    // a plain HDL module can be drawn (the drawing then its base); a drawing's module, or a block of a
    // drawing's HDL (#175: its file is the drawing's), has the drawing's commands on the drawing's badge
    ...(S.hdlToSch?.[file] ? [] : [
      { label: 'Convert to Schematic (editable)…', action: () => convertToSchematic(mod) },
      { label: 'Convert to State Machine (ASM)…', action: () => convertToAsm(mod) },
      { label: 'Convert to State Diagram (FSM)…', action: () => convertToFsm(mod) },
    ]),
    isSimView ? { label: 'Simulate Behavioral Model', action: () => runSimulation(mod) } : null,
    '-',
    { label: 'New Source…', action: () => wiz.newSourceWizard() },
    { label: 'Add Copy of Source…', action: () => wiz.addSourceDialog() },
    { label: 'Remove from Project', action: () => removeModule(file) },
    '-',
    { label: 'Source Properties…', action: () => wiz.sourceProperties(file) },
  ].filter(Boolean), e.clientX, e.clientY);
}
function fileContextMenu(e, file) {
  if (!S.fileTree.includes(file)) {   // a file of the folder that is not in the project
    popupMenu([
      { label: 'Add to Project', action: () => addToProject(file).then(() => log(`${file} added to the project.`, 'ok')) },
      { label: 'Open', action: () => openFile(file) },
    ], e.clientX, e.clientY);
    return;
  }
  popupMenu([
    { label: 'Open', action: () => openFile(file) },
    { label: 'Rename…', action: () => renameDialog(file) },
    /\.(vhdl?|v|sv)$/i.test(file) ? { label: 'Check Syntax', action: () => checkFileSyntax(file) } : null,
    /\.ucf$/i.test(file) ? { label: 'Check Syntax', action: () => checkUcfFile(file) } : null,
    { label: 'Remove from Project', action: () => removeFile(file) },
    { label: 'Source Properties…', action: () => wiz.sourceProperties(file), disabled: !S.project.files.some(f => f.path === file) },
  ].filter(Boolean), e.clientX, e.clientY);
}
function projectContextMenu(e) {
  popupMenu([
    { label: 'New Source…', action: () => wiz.newSourceWizard() },
    { label: 'Add Copy of Source…', action: () => wiz.addSourceDialog() },
    '-',
    { label: 'Design Properties…', action: () => wiz.projectProperties() },
  ], e.clientX, e.clientY);
}

export async function setTop(mod, sim = S.view === 'sim') {
  if (sim) S.project.simTop = mod; else S.project.top = mod;
  await saveProjectJson();
  markStale();
  renderHierarchy();
  log(`Top-level ${sim ? 'simulation ' : ''}module set to '${mod}'.`, 'info');
}

export async function saveProjectJson() {
  S.project = await api.saveProject(S.project.name, S.project);
}

// Remove from Project: the file stays in the project folder (as in ISE); Undo / Add to Project
// bring it back. HDL files leave the file list; other files (diagrams, tables, UCF) are listed in
// project.excluded so that the project ignores them.
// project-list changes (remove / undo / add) run one at a time: an Undo clicked while the removal
// is still being saved waits for it
function serialOp(fn) {
  const run = () => fn();
  S.opChain = (S.opChain || Promise.resolve()).then(run, run);
  return S.opChain;
}

async function removeFile(file) {
  if (!await confirmDlg('Remove Source', `Remove '${file}' from the project?\n(The file stays in the project folder: Undo or Add to Project in the Files view brings it back.)`)) return;
  await saveAll();
  for (const d of [...S.docs]) if (d.path === file || String(d.id || '').endsWith(`:${file}`)) await closeDoc(d);
  return serialOp(() => removeNow(file));
}
// Remove from Project of a module in the Design pane (its row, its badges): a drawing and its HDL file,
// generated from it (#207, #220), leave the project together, one command (one Undo brings both back,
// linked as before, #234). The Files view removes the one file: a drawing's HDL file alone leaves the
// drawing a module by itself ([No HDL], #231); a drawing alone leaves its HDL file a plain HDL module.
async function removeModule(file) {
  const drawing = S.hdlToSch?.[file] || (S.schOwners?.[file] ? file : null);
  const hdl = drawing ? S.schOwners?.[drawing] : null;
  if (!hdl) return removeFile(file);
  if (!await confirmDlg('Remove Source', `Remove '${drawing}' and its HDL file '${hdl}' from the project?\n(The files stay in the project folder: Undo or Add to Project in the Files view brings them back.)`)) return;
  await saveAll();
  for (const d of [...S.docs]) if ([drawing, hdl].some(f => d.path === f || String(d.id || '').endsWith(`:${f}`))) await closeDoc(d);
  return serialOp(() => removeNow(drawing, hdl));
}
// (hdl: the drawing's HDL file, removed with it)
async function removeNow(file, hdl = null) {
  const pj = S.project;
  for (const f of [file, hdl].filter(Boolean)) {
    const entry = pj.files.find(x => x.path === f) || null;
    if (entry) pj.files = pj.files.filter(x => x.path !== f);
    if (pj.constraints === f) pj.constraints = '';
    if (!entry) pj.excluded = [...new Set([...(pj.excluded || []), f])];
  }
  await saveProjectJson();
  await reloadProject();
  await fixMissingTops();   // (the top module removed, #253)
  if (hdl) {
    log(`Removed ${file} and its HDL file ${hdl} from the project (the files are kept in the project folder).`, 'info');
    toast(`Removed ${file.split('/').pop()} and ${hdl.split('/').pop()} from the project`, 'info', 10000, { label: 'Undo', run: () => projectUndo() });
    return;
  }
  log(`Removed ${file} from the project (the file is kept in the project folder).`, 'info');
  toast(`Removed ${file.split('/').pop()} from the project`, 'info', 10000, { label: 'Undo', run: () => projectUndo() });
}

// ---- Undo / Redo of the project's commands (web/js/history.js): every menu, context menu and
// command palette command is recorded (what it changes in the project folder and settings); the
// processes (runs, simulations) are not commands that change the project
const NOT_RECORDED = /^(Implement|Generate Programming File|Synthesize|Simulate|Run|Rerun|Re-run|Emulate|Configure Target|Program|Initialize Chain|Check Syntax|View RTL|Analyze|Undo|Redo|Open|Find|Replace|Go to|Print|Download|Export|Help|About|Check for Updates|Language|Theme|Interface|Zoom|Close|New Project|Open Project|Recent)/;
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
const docEditor = d => d && (d.editor ? { undo: () => d.editor.exec('undo'), redo: () => d.editor.exec('redo') } : d.schEditor || d.asmEditor || d.fsmEditor || d.ttEditor || d.petriEditor || d.pinPlanner || null);
const undoesProject = () => history.canUndo() && !(S.active?._editedAt > history.lastAt() && docEditor(S.active));
const redoesProject = () => history.canRedo() && !(S.active?._editedAt > history.redoAt() && docEditor(S.active));
async function projectUndo() {
  const e = await history.undo();
  if (e) log(`Undo: ${e.label}.`, 'ok');
}
async function projectRedo() {
  const e = await history.redo();
  if (e) log(`Redo: ${e.label}.`, 'ok');
}
const undoAny = () => (undoesProject() ? projectUndo() : docEditor(S.active)?.undo());
const redoAny = () => (redoesProject() ? projectRedo() : docEditor(S.active)?.redo());

// put a file of the project folder (back) into the project
function addToProject(file) { return serialOp(() => addNow(file)); }
async function addNow(file) {
  const pj = S.project;
  pj.excluded = (pj.excluded || []).filter(f => f !== file);
  const lang = /\.vhdl?$/i.test(file) ? 'vhdl' : /\.(v|sv)$/i.test(file) ? 'verilog' : null;
  if (lang && !pj.files.some(f => f.path === file)) pj.files.push({ path: file, lang, role: /^(sim|tb|test)\//.test(file) || /(^|\/)tb_|_tb\./.test(file) ? 'sim' : 'design' });
  if (/\.ucf$/i.test(file) && !pj.constraints) pj.constraints = file;
  await saveProjectJson();
  await reloadProject();
}

// ------------------------------------------------------------------ processes panel
const STATUS_ICON = { ok: 'ok', warn: 'warn', err: 'err', running: 'running', stale: 'stale' };

// The Design Summary can always be (re)opened from the Processes panel: whatever is selected, in both views
const SUMMARY_PROC = { id: 'summary', label: 'Design Summary/Reports', ico: 'summary', run: () => openSummary() };
// The Silinx toolchain (Toolchain Settings: "Silinx toolchain (experimental, no ISE)"): Synthesize,
// Implement Design and Generate Programming File run Silinx's own flow on the server; the processes
// that need Xilinx ISE are disabled (their tooltip says why).
// the project's synthesis tool (Design Properties: Silinx or XST), else Toolchain Settings' mode; never
// in the single-file edition (no server: the Silinx toolchain runs on it)
// (the browser edition: the Silinx toolchain, unless the project chose XST)
export const openMode = () => (S.project?.synthTool ? S.project.synthTool === 'silinx' : api.standalone || S.toolchain?.config?.mode === 'silinx');
const OPEN_SYNTH = 'Synthesize - Yosys';
// (Back-annotate Pin Locations, View Technology Schematic and the Post-Synthesis Simulation Model are
// the Silinx toolchain's own: the pads its placer chose, the netlist of its synthesis, #120)
const ISE_ONLY = new Set(['posttrans', 'postmap', 'postpar']);
const ISE_ONLY_TIP = 'Needs Xilinx ISE: not available with the Silinx toolchain (choose an ISE mode in Toolchain Settings)';
function forOpenMode(defs) {
  const conv = p => {
    if (p.id === 'synth-open') return null;   // Synthesize is the open synthesis already
    const q = { ...p };
    if (ISE_ONLY.has(p.id)) Object.assign(q, { disabled: true, title: ISE_ONLY_TIP });
    if (p.id === 'synth') q.label = OPEN_SYNTH;
    if (['synth', 'impl', 'bitgen'].includes(p.id)) q.title = 'Silinx toolchain (experimental, no ISE)';
    if (p.children) q.children = p.children.map(conv).filter(Boolean);
    return q;
  };
  return defs.map(conv).filter(Boolean);
}
function processDefs() {
  const defs = processDefsAll();
  return openMode() ? forOpenMode(defs) : defs;
}
function processDefsAll() {
  if (!S.project) return [];
  const defs = selectionProcesses();
  return defs.some(p => p.id === 'summary') ? defs : [SUMMARY_PROC, ...defs.filter(p => p.id !== 'none')];
}
function selectionProcesses() {
  const sel = S.sel || {};
  // a drawing without its HDL file (it has errors, #207): it gets it as soon as it has none (#220)
  if (sel.type === 'asm') return [{ id: 'asm-open', label: 'View/Edit State Diagram (ASM)', ico: 'asm', run: () => openAsm(sel.file) }];
  if (sel.type === 'pn') return [{ id: 'pn-open', label: 'View/Edit Petri Net', ico: 'petri', run: () => openPetri(sel.file) }];
  if (sel.type === 'fsm') return [{ id: 'fsm-open', label: 'View/Edit State Diagram (FSM)', ico: 'fsm', run: () => openFsm(sel.file) }];
  if (sel.type === 'tt') return [{ id: 'tt-open', label: 'View/Edit Truth Table', ico: 'truthtable', run: () => openTt(sel.file) }];
  if (sel.type === 'sch') return [{ id: 'sch-open', label: 'View/Edit Schematic', ico: 'schematic', run: () => openSch(sel.file) }];
  if (sel.type === 'ucf') return [
    { id: 'ucf-edit', label: 'Edit Constraints (Text)', ico: 'ucf', run: () => openFile(sel.file) },
    { id: 'ucf-check', label: 'Check Constraints', ico: 'process', run: () => checkUcfFile(sel.file) },
    { id: 'pins', label: 'I/O Pin Planning', ico: 'pins', run: () => openPinPlanner() },
  ];
  if (sel.type !== 'module') return [{ id: 'none', label: 'No processes for the selected item', ico: 'process', disabled: true }];
  const mod = sel.module;
  if (S.view === 'sim') return [
    { id: 'isim', label: 'ISim Simulator', ico: 'sim', children: [
      { id: 'sim-check', label: 'Behavioral Check Syntax', ico: 'process', run: () => checkSyntax(mod, true) },
      { id: 'sim-run', label: 'Simulate Behavioral Model', ico: 'wave', run: () => runSimulation(mod) },
      ...Object.entries(SIM_MODEL_NAMES).map(([step, name]) => ({ id: `sim-${step}`, label: `Simulate ${name} Model`, ico: 'wave', run: () => runSimulation(mod, step) })),
    ] },
    { id: 'rtl-sim', label: 'View RTL Schematic', ico: 'schematic', run: () => openSchematic(mod) },
    { id: 'tb-wiz', label: 'Create Test Bench (Wizard)…', ico: 'template', run: () => testBench(mod) },
  ];
  // synthesis, implementation and emulation work on the project's top module (onTop: what they do to
  // it, said before running when another module is selected, #223)
  const top = S.project.top || mod;
  return [
    ...(sel.sch ? [
      isAsm(sel.sch) ? { id: 'sch-open', label: 'View/Edit State Diagram (ASM)', ico: 'asm', run: () => openAsm(sel.sch) }
        : isTt(sel.sch) ? { id: 'sch-open', label: 'View/Edit Truth Table', ico: 'truthtable', run: () => openTt(sel.sch) }
        : isFsm(sel.sch) ? { id: 'sch-open', label: 'View/Edit State Diagram (FSM)', ico: 'fsm', run: () => openFsm(sel.sch) }
        : isPn(sel.sch) ? { id: 'sch-open', label: 'View/Edit Petri Net', ico: 'petri', run: () => openPetri(sel.sch) }
                     : { id: 'sch-open', label: 'View/Edit Schematic', ico: 'schematic', run: () => openSch(sel.sch) },
    ] : []),
    SUMMARY_PROC,
    { id: 'utils', label: 'Design Utilities', ico: 'procGroup', children: [
      { id: 'template', label: 'View HDL Instantiation Template', ico: 'template', run: () => openInstTemplate(mod) },
    ] },
    { id: 'constraints', label: 'User Constraints', ico: 'procGroup', children: [
      { id: 'pins', label: 'I/O Pin Planning', ico: 'pins', run: () => openPinPlanner(mod) },
      { id: 'ucf-edit', label: 'Edit Constraints (Text)', ico: 'ucf', run: () => openUcf() },
      { id: 'ucf-check', label: 'Check Constraints', ico: 'process', run: () => checkUcfFile() },
    ] },
    { id: 'synth', label: 'Synthesize - XST', ico: 'process', onTop: 'synthesizes', run: () => runImpl(top, ['synth']), children: [
      { id: 'rtl', label: 'View RTL Schematic', ico: 'schematic', run: () => openSchematic(mod) },
      { id: 'tech', label: 'View Technology Schematic', ico: 'schematic', onTop: 'synthesizes', run: () => openTechSchematic(top) },
      { id: 'check', label: 'Check Syntax', ico: 'process', run: () => checkSyntax(mod) },
      { id: 'postsynth', label: EXTRA_STEPS.postsynth, ico: 'process', onTop: 'synthesizes', run: () => generateSimModel(top, 'postsynth') },
    ] },
    { id: 'synth-open', label: SYNTH_OPEN, ico: 'process', onTop: 'synthesizes', run: () => synthOpen(top) },
    { id: 'impl', label: 'Implement Design', ico: 'process', onTop: 'implements', run: () => runImpl(top, ['synth', 'translate', 'map', 'par']), children: [
      { id: 'translate', label: 'Translate', ico: 'process', onTop: 'implements', run: () => runImpl(top, ['synth', 'translate']), children: [
        { id: 'posttrans', label: EXTRA_STEPS.posttrans, ico: 'process', onTop: 'implements', run: () => generateSimModel(top, 'posttrans') },
      ] },
      { id: 'map', label: 'Map', ico: 'process', onTop: 'implements', run: () => runImpl(top, ['synth', 'translate', 'map']), children: [
        { id: 'postmap', label: EXTRA_STEPS.postmap, ico: 'process', onTop: 'implements', run: () => generateSimModel(top, 'postmap') },
      ] },
      { id: 'par', label: 'Place & Route', ico: 'process', onTop: 'implements', run: () => runImpl(top, ['synth', 'translate', 'map', 'par']), children: [
        { id: 'trce', label: EXTRA_STEPS.trce, ico: 'process', onTop: 'implements', run: () => postParTiming(top) },
        { id: 'xpwr', label: EXTRA_STEPS.xpwr, ico: 'process', onTop: 'implements', run: () => textPowerReport(top) },
        { id: 'postpar', label: EXTRA_STEPS.postpar, ico: 'process', onTop: 'implements', run: () => generateSimModel(top, 'postpar') },
        { id: 'pin2ucf', label: EXTRA_STEPS.pin2ucf, ico: 'process', onTop: 'implements', run: () => backAnnotatePins(top) },
        { id: 'fpgaview', label: EXTRA_STEPS.fpgaview, ico: 'chip', onTop: 'implements', run: () => openFpgaView(top) },
      ] },
    ] },
    { id: 'bitgen', label: 'Generate Programming File', ico: 'process', onTop: 'implements', run: () => runImpl(top, ['synth', 'translate', 'map', 'par', 'bitgen']) },
    { id: 'emulate', label: 'Emulate on Board', ico: 'board', onTop: 'emulates', run: () => openEmulator(top), children: [
      { id: 'emulate-rtl', label: 'Emulate Behavioral Model (RTL)', ico: 'board', onTop: 'emulates', run: () => openEmulator(top) },
      ...Object.entries(SIM_MODEL_NAMES).map(([step, name]) => ({ id: `emulate-${step}`, label: `Emulate ${name} Model`, ico: 'board', onTop: 'emulates', run: () => openEmulator(top, { model: step }) })),
    ] },
    { id: 'config', label: 'Configure Target Device', ico: 'impact', run: () => openImpact(), children: [
      { id: 'impact', label: 'Manage Configuration Project (iMPACT)', ico: 'impact', run: () => openImpact() },
    ] },
  ];
}

export function renderProcesses() {
  const host = $('procs');
  host.innerHTML = '';
  const sel = S.sel || {};
  $('proc-caption').textContent = `Processes: ${sel.module || (sel.file ? sel.file.split('/').pop() : '')}`;
  const tree = h('ul', { class: 'tree' });
  const add = (ul, p) => {
    const li = h('li');
    const st = S.status[p.id];
    // collapsed groups are remembered: the panel is redrawn on every status change
    const key = p.id || p.label;
    const collapsed = S.procCollapsed.has(key);
    const group = !!p.children?.length;
    const tw = h('span', { class: 'twisty' }, group ? (collapsed ? '▸' : '▾') : '');
    const isSel = S.selProc?.id === p.id && S.selProc?.label === p.label;
    const row = h('div', { class: `row${p.disabled ? ' disabled' : ''}${isSel ? ' sel' : ''}`, ...(p.title ? { title: p.title } : {}) }, tw, h('span', { class: 'status', html: st ? icons[STATUS_ICON[st]] : '' }), icon(p.ico || 'process'), h('span', { class: 'lbl' }, p.label));
    const sub = h('ul');
    if (collapsed) sub.style.display = 'none';
    li.append(row, sub);
    const toggle = () => {
      if (!p.children?.length) return;
      if (S.procCollapsed.has(key)) S.procCollapsed.delete(key); else S.procCollapsed.add(key);
      const c = S.procCollapsed.has(key);
      sub.style.display = c ? 'none' : '';
      tw.textContent = c ? '▸' : '▾';
    };
    tw.addEventListener('click', e => { e.stopPropagation(); toggle(); });
    tw.addEventListener('dblclick', e => e.stopPropagation());
    // the icon of a group also expands / collapses it (single click; double-click on the name runs it)
    const ico = row.children[2];
    if (group && ico) { ico.style.cursor = 'pointer'; ico.addEventListener('click', e => { e.stopPropagation(); toggle(); }); ico.addEventListener('dblclick', e => e.stopPropagation()); }
    row.addEventListener('click', () => { host.querySelectorAll('.row.sel').forEach(r => r.classList.remove('sel')); row.classList.add('sel'); S.selProc = p; });
    row.addEventListener('dblclick', () => { if (p.disabled && p.title) toast(p.title); else if (p.run && !p.disabled) runProcess(p); });
    row.addEventListener('contextmenu', e => {
      e.preventDefault(); row.click();
      popupMenu([
        { label: 'Run', action: () => runProcess(p), disabled: !p.run || p.disabled || (S.busy && ISE_PROCS.includes(p.id)) },
        { label: 'Rerun', action: () => runProcess(p), disabled: !p.run || p.disabled || (S.busy && ISE_PROCS.includes(p.id)) },
        { label: 'Stop', icon: icon('stop'), action: () => stopProcesses(), disabled: !S.currentJob },
        '-',
        { label: 'Process Properties…', action: () => wiz.implProperties(), disabled: !['synth', 'impl', 'bitgen', 'map', 'par', 'translate'].includes(p.id) },
      ], e.clientX, e.clientY);
    });
    longPressMenu(row);
    ul.append(li);
    for (const c of p.children || []) add(sub, c);
  };
  for (const p of processDefs()) add(tree, p);
  host.append(tree);
}

// Only the ISE implementation runs are exclusive (one build directory); simulation, check syntax,
// schematics, editors and programming run in the browser or independently and stay available.
const ISE_PROCS = ['synth', 'impl', 'translate', 'map', 'par', 'bitgen'];
async function runProcess(p) {
  if (S.busy && ISE_PROCS.includes(p.id)) { toast('An implementation is already running (use Stop to cancel it)', 'error'); return; }
  if (p.onTop && !await topConfirmed(p.label, p.onTop)) return;
  try { await p.run(); }
  catch (e) { log(`ERROR: ${e.message}`, 'err'); console.error(e); }
}

// Synthesis, implementation and emulation work on the project's top module (#223): when the module
// selected in the Design pane is another one, the user is told first (OK runs it on the top, Cancel
// does nothing). title: the process; verb: what it does to the top ('implements', 'synthesizes', 'emulates').
async function topConfirmed(title, verb) {
  const top = S.project?.top, sel = S.sel?.module;
  if (!top || !sel || sel.toLowerCase() === top.toLowerCase()) return true;
  return !!await dialog({
    title, width: 460,
    body: h('div', { class: 'msg msg-warn' }, h('div', { class: 'msg-icon' }, '!'), h('div', { class: 'msg-text' },
      h('div', {}, `${title} ${verb} the top module '${top}', not the selected module '${sel}'.`),
      h('div', { class: 'hint' }, 'Another module becomes the top with Set as Top Module (its right-click menu).'))),
    buttons: [{ label: 'OK', value: true, primary: true }, { label: 'Cancel', value: null }],
  });
}

function setStatus(id, st) { S.status[id] = st; renderProcesses(); }
function markStale() {
  for (const k of Object.keys(S.status)) if (S.status[k] && S.status[k] !== 'running') S.status[k] = 'stale';
  renderProcesses();
}

// ------------------------------------------------------------------ check syntax / elaboration
function diagsFor(lib, design, extra = []) {
  const all = [...lib.errors, ...(design ? design.diags : []), ...extra];
  const seen = new Set();
  return all.filter(d => { const k = `${d.file}:${d.line}:${d.message}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .map(d => ({ ...d, tool: d.tool || 'HDLCompiler' }));
}

export async function saveAll() {
  for (const d of S.docs) await flushDoc(d);
}

async function checkSyntax(mod, sim = false) {
  const id = sim ? 'sim-check' : 'check';
  try { return await checkSyntaxInner(mod, sim, id); }
  catch (e) { setStatus(id, 'err'); log(`ERROR: ${e.message}`, 'err'); return false; }
}
async function checkSyntaxInner(mod, sim, id) {
  await saveAll();
  setStatus(id, 'running');
  log(`\nStarted : "${sim ? 'Behavioral Check Syntax' : 'Check Syntax'}".\n`, 'hdr');
  const srcs = S.sources.filter(s => (s.lang === 'vhdl' || s.lang === 'verilog') && inView(s.role, sim));
  for (const s of srcs) log(`${s.lang === 'vhdl' ? 'Parsing VHDL' : 'Analyzing Verilog'} file "${s.path}" into library work`);
  const lib = compile(withPrimitives(srcs));
  const design = elaborate(lib, mod);
  // (an HDL file its drawing could not generate again, #303: an error of the file, the drawing's errors in it)
  const stale = srcs.filter(s => S.staleHdl?.[s.path]).map(s => {
    const { from, why } = S.staleHdl[s.path];
    return { severity: 'error', file: s.path, line: 1, col: 1, tool: 'Silinx', message: `${s.path} is not up to date: ${from} cannot generate it, ${why}. Fix ${from} (its HDL is then generated again).` };
  });
  const diags = diagsFor(lib, design, [...designDiags(lib, design), ...stale]);   // + design checks (core/lint.js)
  setDiagnostics(diags);
  const ne = diags.filter(d => d.severity === 'error').length, nw = diags.length - ne;
  for (const d of diags) log(`${sevWord(d)}:${d.tool || 'HDLCompiler'} - "${d.file}" Line ${d.line}: ${d.message}`, d.severity === 'error' ? 'err' : 'warn', { diag: false });
  if (ne) { log(`\nProcess "Check Syntax" failed (${ne} error(s), ${nw} warning(s))`, 'err', { diag: false }); setStatus(id, 'err'); showConsolePage('errors'); return false; }
  log(`Elaborating top module <${mod}>: ${design.signals.length} signals, ${design.procs.length} processes.`);
  log(`\nProcess "Check Syntax" completed successfully${nw ? ` with ${nw} warning(s)` : ''}`, 'ok');
  setStatus(id, nw ? 'warn' : 'ok');
  return true;
}

// Check Syntax of one HDL file (editor toolbar / right-click): parses the project, elaborates every
// module the file defines and reports the diagnostics.
// Diagnostics of one HDL file in the context of the project (text: the editor's current text).
function hdlDiagnostics(path, text, info = []) {
  const fi = S.project.files.find(f => f.path === path);
  const sim = fi?.role === 'sim';
  const srcs = S.sources.filter(s => (s.lang === 'vhdl' || s.lang === 'verilog') && (inView(s.role, sim) || s.path === path))
    .map(s => (s.path === path && text != null ? { ...s, text } : s));
  const lib = compile(withPrimitives(srcs));
  const units = (lib.parsed.find(p => p.file === path)?.units || []).filter(u => u.kind === 'module');
  let diags = [...lib.errors];
  for (const u of units) {
    let design;
    try { design = elaborate(lib, u.name); } catch (e) { diags.push({ file: path, line: u.loc?.line || 1, col: 1, severity: 'error', message: e.message }); continue; }
    diags.push(...design.diags, ...designDiags(lib, design));
    if (design.top) info.push(`Elaborating module <${u.name}>: ${design.signals.length} signals, ${design.procs.length} processes.`);
  }
  return diagsFor({ errors: diags }, null);
}

async function checkFileSyntax(path) {
  await saveAll();
  log(`\nStarted : "Check Syntax" of ${path}.\n`, 'hdr');
  log(`${/\.vhdl?$/i.test(path) ? 'Parsing VHDL' : 'Analyzing Verilog'} file "${path}" into library work`);
  const info = [];
  const diags = hdlDiagnostics(path, null, info);
  for (const l of info) log(l);
  setDiagnostics(diags);
  const ne = diags.filter(d => d.severity === 'error').length, nw = diags.length - ne;
  for (const d of diags) log(`${sevWord(d)}:${d.tool || 'HDLCompiler'} - "${d.file}" Line ${d.line}: ${d.message}`, d.severity === 'error' ? 'err' : 'warn', { diag: false });
  if (ne) { log(`\nProcess "Check Syntax" failed (${ne} error(s), ${nw} warning(s))`, 'err', { diag: false }); showConsolePage('errors'); status(`Check Syntax: ${ne} error(s)`); return false; }
  log(`\nProcess "Check Syntax" completed successfully${nw ? ` with ${nw} warning(s)` : ''}`, 'ok');
  status(`Check Syntax: ${path.split('/').pop()} OK${nw ? ` (${nw} warning(s))` : ''}`);
  return true;
}

// ------------------------------------------------------------------ process status persistence
// The implementation process marks (synth / translate / map / par / impl / bitgen) are saved in
// build/silinx-status.json with a fingerprint of the sources + constraints, and restored when the
// project is opened (marked out of date if the sources changed since). Older builds without that
// file get their marks from ISE's reports and output files.
const IMPL_IDS = ['synth', 'translate', 'map', 'par', 'impl', 'bitgen', 'postsynth', 'posttrans', 'postmap', 'postpar', 'pin2ucf', 'xpwr', 'trce', 'fpgaview'];
// optional steps of the ISE flow: process label (ISE names) and what they produce
const EXTRA_STEPS = {
  postsynth: 'Generate Post-Synthesis Simulation Model', posttrans: 'Generate Post-Translate Simulation Model',
  postmap: 'Generate Post-Map Simulation Model', postpar: 'Generate Post-Place & Route Simulation Model',
  pin2ucf: 'Back-annotate Pin Locations', xpwr: 'Generate Text Power Report', trce: 'Generate Post-Place & Route Static Timing',
  fpgaview: 'View Implemented Design (FPGA)',
};
const SIM_MODEL_NAMES = { postsynth: 'Post-Synthesis', posttrans: 'Post-Translate', postmap: 'Post-Map', postpar: 'Post-Place & Route' };
const STATUS_FILE = 'build/silinx-status.json';

function sourcesFingerprint() {
  const parts = S.sources.filter(f => f.role !== 'sim').map(f => `${f.path}\n${f.text}`).sort();
  parts.push(`ucf\n${S.project.constraints}\n${S.ucfText ?? ''}`, `top\n${S.project.top}`, `dev\n${JSON.stringify(S.project.device)}`);
  let h = 2166136261;                                    // FNV-1a, enough to detect changes
  for (const c of parts.join('\0')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16);
}

// the synthesis's own inputs (#280): the design sources (not the test benches, not the constraints), the
// top, the device, the synthesis tool and its effort (#282); the run that synthesized them ok is kept
// (S.synthDone: { fingerprint, status }), so that Implement Design with the Silinx toolchain starts at
// Translate while they are the same
function synthFingerprint(sources) {
  const ucf = S.project.constraints;
  const parts = sources.filter(f => f.role !== 'sim' && f.path !== ucf && !/\.ucf$/i.test(f.path)).map(f => `${f.path}\n${f.text}`).sort();
  parts.push(`top\n${S.project.top}`, `dev\n${JSON.stringify(S.project.device)}`, `tool\n${S.project.synthTool || ''}\n${openMode()}`, `effort\n${S.project.impl?.optLevel ?? ''}`);
  let h = 2166136261;
  for (const c of parts.join('\0')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16);
}

async function loadUcfText() {
  let text = null;
  if (S.project?.constraints && S.fileTree?.includes(S.project.constraints)) {
    try { text = await api.readFile(S.project.name, S.project.constraints); } catch { /* none */ }
  }
  S.ucfText = text;
  return text;
}

async function saveImplStatus() {
  try {
    await loadUcfText();
    const status = Object.fromEntries(IMPL_IDS.filter(id => S.status[id] && S.status[id] !== 'running').map(id => [id, S.status[id]]));
    await api.writeFile(S.project.name, STATUS_FILE, JSON.stringify({ top: S.project.top, fingerprint: sourcesFingerprint(), time: new Date().toISOString(), status, ...(S.synthDone && { synth: S.synthDone }) }, null, 2));
  } catch { /* best effort */ }
}

async function restoreImplStatus() {
  S.synthDone = null;
  await loadUcfText();
  if (!S.project?.top) return;
  let saved = null;
  try { saved = JSON.parse(await api.readFile(S.project.name, STATUS_FILE)); } catch { /* none */ }
  await loadUcfText();
  let status = {};
  S.synthDone = saved?.top === S.project.top && saved.synth?.fingerprint ? saved.synth : null;
  if (saved && saved.top === S.project.top) status = saved.status || {};
  else {
    // derive from ISE's reports (builds made before status saving, or by run.sh elsewhere)
    let rep = null;
    try { rep = await api.reports(S.project.name); } catch { /* none */ }
    const sum = rep?.summary;
    if (!sum || rep.top !== S.project.top) return;
    const w = (n) => (n ? 'warn' : 'ok');
    const mapWarn = (rep.map?.utilization || []).find(u => /warnings/i.test(u.name))?.used;
    if (sum.synthesized) status.synth = w(rep.synthesis?.warnings);
    if (sum.mapped) { status.translate = 'ok'; status.map = w(mapWarn); }
    if (sum.routed) { status.par = sum.timingMet === false ? 'warn' : 'ok'; status.impl = worst(status.translate, status.map, status.par); }
    if (sum.bitstream) status.bitgen = 'ok';
  }
  const fresh = !saved || saved.fingerprint === sourcesFingerprint();
  for (const id of IMPL_IDS) if (status[id]) S.status[id] = fresh || status[id] === 'err' ? status[id] : 'stale';
  if (!fresh) log('Sources changed since the last implementation run: processes marked out of date.', 'info');
  renderProcesses();
}

// ------------------------------------------------------------------ implementation (ISE)
// Live per-step status from run.sh's "=== SILINX STEP <step> ===" markers and ISE WARNING/ERROR lines.
const STEP_PROC = { synth: 'synth', translate: 'translate', map: 'map', par: 'par', trce: 'par', bitgen: 'bitgen', prombit: 'bitgen',
  postsynth: 'postsynth', posttrans: 'posttrans', postmap: 'postmap', postpar: 'postpar', pin2ucf: 'pin2ucf', xpwr: 'xpwr', fpgaview: 'fpgaview', fpgadevice: 'fpgaview' };
const STEP_TOOL = { synth: 'Xst', translate: 'NgdBuild', map: 'Map', par: 'Par', trce: 'Timing', bitgen: 'Bitgen', prombit: 'Bitgen',
  postsynth: 'NetListWriters', posttrans: 'NetListWriters', postmap: 'NetListWriters', postpar: 'NetListWriters', pin2ucf: 'Pin2UCF', xpwr: 'Power', fpgaview: 'Xdl', fpgadevice: 'Xdl' };
const RANK = { ok: 0, warn: 1, err: 2 };
const worst = (...xs) => xs.filter(Boolean).reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'ok');

// ISE writes many warnings only to its report files (XST's .syr, MAP's .mrp): use their counts too.
async function applyReportWarnings(track) {
  let rep = null;
  try { rep = await api.reports(S.project.name); } catch { return; }
  if (!rep || rep.available === false) return;
  const mapWarn = (rep.map?.utilization || []).find(u => /warnings/i.test(u.name))?.used;
  const bump = (id, n) => { if (n > 0 && (S.status[id] === 'ok')) { S.status[id] = 'warn'; track.result[id] = 'warn'; } };
  bump('synth', rep.synthesis?.warnings);
  bump('map', mapWarn);
  if (S.status.impl && S.status.impl !== 'running') S.status.impl = worst(S.status.translate, S.status.map, S.status.par);
  renderProcesses();
}

// (steps: the run's; a warning of the constraints counts in Translate's icon when the run has it,
// else in the first step's: #129)
function stepTracker(steps) {
  const result = {};              // process id -> ok | warn | err (this run)
  let cur = null, warns = 0;
  const early = {};               // warnings printed before the step they concern has started
  const t = { warnings: 0, failed: false, diags: [], result, get current() { return cur; } };
  const setProc = (id, st) => { result[id] = st === 'running' ? result[id] : worst(result[id], st); S.status[id] = st === 'running' ? 'running' : result[id]; };
  const refreshGroups = () => {
    if (['translate', 'map', 'par'].some(k => result[k] || S.status[k] === 'running')) {
      const done = result.par && S.status.par !== 'running';
      S.status.impl = done || t.failed ? worst(result.translate, result.map, result.par) : 'running';
    }
  };
  const finish = (ok = true) => {
    if (!cur) return;
    const id = STEP_PROC[cur];
    setProc(id, ok ? (warns ? 'warn' : 'ok') : 'err');
    cur = null;
  };
  // (opts: log()'s, e.g. { diag: false } for a line already in the Warnings tab)
  t.line = (line, opts) => {
    logLine(line, opts);
    let m;
    if ((m = /^=== SILINX STEP (\w+) ===/.exec(line))) {
      finish();
      cur = m[1]; warns = early[cur] || 0;
      if (cur === 'synth' && early['*']) warns += early['*'];
      if (STEP_PROC[cur]) setProc(STEP_PROC[cur], 'running');
    } else if ((m = /^=== SILINX FAILED (\w+)/.exec(line))) {
      cur = cur || m[1];
      t.failed = true;
      finish(false);
    } else if (/^=== SILINX DONE ===/.test(line)) {
      finish();
    } else if (/^\s*(CRITICAL )?WARNING\b/i.test(line)) {
      // any warning line counts (ISE "WARNING:Tool:N - ..." and Silinx "WARNING: ..."); the line
      // itself reaches the Warnings tab through log()
      t.warnings++;
      if (cur) warns++;
      else { const step = /constraints file|\.ucf\b|LOC/i.test(line) && (!steps || steps.includes('translate')) ? 'translate' : '*'; early[step] = (early[step] || 0) + 1; }
    }
    refreshGroups();
    renderProcesses();
  };
  t.end = ok => {
    if (cur) finish(ok);
    refreshGroups();
    renderProcesses();
  };
  return t;
}

// Catch board/device/UCF mismatches before spending minutes in ISE.
// ---- UCF check (nets that do not exist, bus bits, duplicate pins, I/O standards, syntax…)
async function ucfDiagnostics(text, file) {
  const { checkUcf } = await import('/core/ucf.js');
  const pj = S.project;
  let ports = [], lang = 'vhdl';
  if (pj.top && S.lib) {
    try {
      const design = elaborate(S.lib, pj.top);
      if (design.top) ports = design.top.ports.map(ucfPort);
      lang = moduleInfo(pj.top)?.lang || 'vhdl';
    } catch { /* no port data */ }
  }
  const db = S.devices;
  const famId = db?.parts?.find(x => x.part === pj.device?.part)?.family || pj.device?.family;
  const iostandards = db?.families?.find(f => f.id === famId)?.ioStandards || null;
  return checkUcf(text, { top: pj.top, ports, lang, iostandards, board: projectBoard(pj), package: pj.device?.package })
    .map(d => ({ ...d, file, tool: 'ConstraintSystem' }));
}

// (warnings: in quiet mode, an array that gets the warning lines instead of the console when there is
// no error: the process that checks the constraints before it runs prints them as its own, counted
// in its "completed successfully with N warning(s)" (#129); their entries are added to the Warnings
// tab's, Check Syntax's kept)
async function checkUcfFile(path = S.project?.constraints, { quiet = false, warnings = null } = {}) {
  if (!path) return true;
  await saveAll();
  let text;
  try { text = await api.readFile(S.project.name, path); } catch { return true; }
  const diags = await ucfDiagnostics(text, path);
  const ne = diags.filter(d => d.severity === 'error').length, nw = diags.length - ne;
  if (quiet && !diags.length) return true;
  const line = d => `${d.severity === 'error' ? 'ERROR' : 'WARNING'}:ConstraintSystem - "${d.file}" Line ${d.line}: ${d.message}`;
  if (quiet && warnings && !ne) {
    setDiagnostics([...S.diags.filter(d => d.source !== 'console' && d.tool !== 'ConstraintSystem'), ...diags]);
    warnings.push(...diags.map(line));
    return true;
  }
  setDiagnostics(diags);
  if (!quiet) log(`\nStarted : "Check Constraints" of ${path}.\n`, 'hdr');
  for (const d of diags) log(line(d), d.severity === 'error' ? 'err' : 'warn', { diag: false });
  if (ne) { log(`\nProcess "Check Constraints" failed (${ne} error(s), ${nw} warning(s))`, 'err', { diag: false }); showConsolePage('errors'); status(`${path.split('/').pop()}: ${ne} error(s)`); return false; }
  if (!quiet) log(`\nProcess "Check Constraints" completed successfully${nw ? ` with ${nw} warning(s)` : ''}`, 'ok');
  status(`Check Constraints: ${path.split('/').pop()} OK${nw ? ` (${nw} warning(s))` : ''}`);
  return true;
}

// (warnings: gets the constraints' warning lines, for the process to print: checkUcfFile)
async function checkConstraints(warnings = null) {
  const pj = S.project;
  const board = projectBoard(pj);
  if (pj.constraints && S.fileTree.includes(pj.constraints) && !await checkUcfFile(pj.constraints, { quiet: true, warnings })) {
    log(`ERROR: fix the errors in ${pj.constraints} before implementing (see the Errors tab).`, 'err');
    return false;
  }
  if (!board) return true;
  const devStr = d => `${d.part}${d.speed}-${d.package}`;
  if (board.device.part !== pj.device.part || board.device.package !== pj.device.package) {
    log(`ERROR: the project device ${devStr(pj.device)} does not match the board ${board.name} (${devStr(board.device)}). Fix it in Project > Design Properties.`, 'err');
    showConsolePage('console');
    return false;
  }
  if (!pj.constraints || !S.fileTree.includes(pj.constraints)) return true;
  const { parseUcf, locsNotOnBoard } = await import('/core/ucf.js');
  let bad = [];
  try { bad = locsNotOnBoard(parseUcf(await api.readFile(pj.name, pj.constraints), { ports: topUcfPorts() }).assignments, board); } catch { return true; }
  if (!bad.length) return true;
  const list = bad.slice(0, 8).map(b => `${b.net}=${b.loc}`).join(', ') + (bad.length > 8 ? ', …' : '');
  log(`ERROR: ${pj.constraints} uses ${bad.length} pin(s) that are not on the ${board.name}: ${list}`, 'err');
  const fix = await confirmDlg('Constraints do not match the board',
    `${pj.constraints} assigns ${bad.length} pin(s) that do not exist on the ${board.name} (${list}).\n\nRegenerate the constraints from the ${board.name} pin table now? (ports are matched by name: clk, led, sw, btn, seg, an…)`);
  if (!fix) return false;
  return regenerateUcf(board);
}

export async function regenerateUcf(board = projectBoard()) {
  const pj = S.project;
  if (!board || !pj.top) return false;
  const { boardAutoAssign, generateUcf } = await import('/core/ucf.js');
  const design = elaborate(S.lib, pj.top);
  if (!design.top) return false;
  const ports = design.top.ports.map(ucfPort);
  const { assignments, clocks, matched, unmatched } = boardAutoAssign(ports, board, { byDirection: true });
  const text = generateUcf({ ports, assignments, clocks, header: `UCF for top '${pj.top}' on ${board.name} (${board.device.part}${board.device.speed}-${board.device.package}), generated by Silinx` });
  pj.constraints ||= 'constraints/top.ucf';
  await api.writeFile(pj.name, pj.constraints, text);
  await saveProjectJson();
  await reloadProject(false);
  const d = findDoc(`file:${pj.constraints}`);
  if (d) { d.editor.setValue(text); d.editor.markClean(); setDirty(d, false); }
  log(`${pj.constraints} regenerated for ${board.name}: ${matched.join(', ') || 'no ports matched'}${unmatched.length ? `; NOT assigned (use I/O Pin Planning): ${unmatched.join(', ')}` : ''}`, unmatched.length ? 'warn' : 'ok');
  return unmatched.length === 0;
}
async function runImpl(mod, steps, opts = {}) {
  // one ISE run at a time (one build directory): checked and taken before any await
  if (S.busy) { toast('An implementation is already running (use Stop to cancel it)', 'error'); return false; }
  S.busy = true;
  const pjName = S.project.name;
  try { return await runImplInner(mod, steps, opts, pjName); }
  finally { S.busy = false; }
}
async function runImplInner(mod, steps, opts, pjName) {
  let ok = false;
  if (S.project.top !== mod) {
    if (!await confirmDlg('Set Top Module', `'${mod}' is not the top-level module of the implementation.\nSet it as top and continue?`)) return;
    await setTop(mod, false);
  }
  S.diags = S.diags.filter(d => d.source !== 'console');   // new run: drop the previous run's messages
  const extra = [...steps].reverse().find(st => EXTRA_STEPS[st] && st !== 'trce') || (opts.timing ? 'trce' : null);
  const procId = extra || (steps.includes('bitgen') ? 'bitgen' : steps.includes('translate') ? 'impl' : 'synth');
  const procName = EXTRA_STEPS[procId] || { synth: openMode() ? OPEN_SYNTH : 'Synthesize - XST', impl: 'Implement Design', bitgen: 'Generate Programming File' }[procId];
  // Synthesize - XST always starts with Check Syntax (same messages as the Check Syntax process)
  if (!await checkSyntax(mod)) {
    setStatus('synth', 'err');
    log(`Process "${procName}" stopped: Check Syntax found errors (see the Errors tab).`, 'err');
    return;
  }
  // the constraints' warnings: printed as the process's own once it has started, and counted (#129)
  const ucfWarnings = [];
  if (!await checkConstraints(ucfWarnings)) {
    for (const l of ucfWarnings) log(l, 'warn', { diag: false });
    setStatus(steps.includes('translate') ? 'translate' : 'synth', 'err');
    log(`Process "${procName}" stopped: the constraints have errors.`, 'err');
    return;
  }
  // the Silinx toolchain: is the project's device supported (a device description and a bit database)?
  if (openMode()) {
    const st = await api.openStatus(S.project.name).catch(e => ({ available: false, reason: e.message }));
    if (!st.available) {
      setStatus(procId, 'err');
      log(`\nStarted : "${procName}" (Silinx toolchain).\n`, 'hdr');
      for (const l of ucfWarnings) log(l, 'warn', { diag: false });
      log(`ERROR: the Silinx toolchain cannot implement this design: ${st.reason}.`, 'err');
      log(`\nProcess "${procName}" failed`, 'err');
      return;
    }
  }
  // the Silinx toolchain: the synthesis up to date (its inputs those it synthesized ok) is not run again
  // (#280); Synthesize itself, and a run with the Post-Synthesis Simulation Model, still run it
  let synthFp = null, synthUpToDate = false;
  if (openMode() && steps.includes('synth')) {
    try { synthFp = synthFingerprint(await api.sources(S.project.name)); } catch { /* run it */ }
    if (synthFp && steps.includes('translate') && !steps.includes('postsynth') && S.synthDone?.fingerprint === synthFp) {
      steps = steps.filter(st => st !== 'synth');
      synthUpToDate = true;
    }
  }
  // Clear the icons of the processes this run will redo (they get running/ok/warn/err as it goes).
  const runs = new Set([...(steps.includes('synth') ? ['synth'] : []), ...(steps.includes('translate') ? ['translate', 'impl'] : []), ...(steps.includes('map') ? ['map'] : []), ...(steps.includes('par') ? ['par'] : []), ...(steps.includes('bitgen') ? ['bitgen'] : [])]);
  for (const id of runs) S.status[id] = null;
  setStatus(procId, 'running');
  status(`Running ${procId}…`);
  log(`\nStarted : "${procName}".\n`, 'hdr');
  const track = stepTracker(steps);
  for (const l of ucfWarnings) track.line(l, { diag: false });
  try {
    const tc = S.toolchain || await api.toolchain();
    if (!tc.ise.available) {
      log(`Xilinx ISE toolchain not available (${tc.ise.mode} mode): ${tc.ise.reason}`, 'warn');
      log('The build directory and run.sh are still generated so they can be run on a machine with ISE 14.7. Configure it in Tools > Toolchain Settings.', 'info');
    }
    if (synthUpToDate) { S.status.synth = S.synthDone.status; renderProcesses(); }
    const { job } = await api.implement(S.project.name, { steps, generateOnly: !tc.ise.available, ...(synthUpToDate && { synthUpToDate }) });
    S.currentJob = job;
    S.stopRequested = false;
    renderProcesses();
    const res = await followJob(job, track.line);
    const stopped = S.stopRequested;
    track.end(res.status === 'ok');
    if (stopped) {
      // stopped by the user: the interrupted step and the ones not reached are left unmarked
      for (const id of IMPL_IDS) if (S.status[id] === 'running') S.status[id] = null;
      if (track.current) S.status[STEP_PROC[track.current]] = null;
      for (const [id, st] of Object.entries(track.result)) if (st === 'err') S.status[id] = null;
      renderProcesses();
      log('\nProcess stopped by the user.', 'warn');
      return;
    }
    if (S.project?.name !== pjName) { log(`Implementation of '${pjName}' finished (another project is open now).`, 'info'); return res.status === 'ok'; }
    // the synthesis this run made: kept as up to date when it ended ok (#280)
    if (synthFp && ['ok', 'warn'].includes(track.result.synth)) S.synthDone = { fingerprint: synthFp, status: track.result.synth };
    else if (track.result.synth === 'err') S.synthDone = null;
    if (tc.ise.available) { await applyReportWarnings(track); await saveImplStatus(); }
    if (res.status === 'ok' && tc.ise.available) {
      log(`\nProcess "${procName}" completed successfully${track.warnings ? ` with ${track.warnings} warning(s)` : ''}`, 'ok');
      if (extra) setStatus(procId, track.warnings ? 'warn' : 'ok');
      ok = true;
      // the browser edition: the bitstream is downloaded (there is no build folder to find it in)
      if (res.download && steps.includes('bitgen')) {
        const a = h('a', { href: res.download.url, download: res.download.filename });
        document.body.append(a); a.click(); a.remove();
        log(`Bitstream downloaded: ${res.download.filename} (Configure Target Device programs the board with it).`, 'info');
      }
      countEvent(steps.includes('bitgen') ? 'bitstream' : 'implement');
    } else if (res.status === 'ok') {
      setStatus(procId, 'warn');
      log(`\nScripts generated in ${S.project.name}/build (ISE not run).`, 'warn');
    } else {
      if (!track.failed) setStatus(procId, 'err');
      log(`\nProcess failed: ${res.error || 'see log'}`, 'err');
    }
    if (track.failed) showConsolePage('errors');
    refreshSummary();
  } catch (e) {
    setStatus(procId, 'err');
    log(`ERROR: ${e.message}`, 'err');
  } finally {
    // processes that never got to run in this execution must not keep the "running" spinner
    for (const id of IMPL_IDS) if (S.status[id] === 'running') S.status[id] = null;
    S.busy = false;
    S.currentJob = null;
    status('Ready');
    renderProcesses();
  }
  return ok;
}

// ---- optional ISE processes: simulation models, timing, power, pins
// Synthesize - Yosys (open): the open synthesis in the browser, without Xilinx ISE (core/synth-open.js):
// Silinx's front end writes the design as one flat module, Yosys compiled to WebAssembly maps it
// onto the cells of the device family in a Web Worker; the netlist goes to build/open/
const SYNTH_OPEN = 'Synthesize - Yosys (open)';
let synthOpenRunning = false;
async function synthOpen(mod) {
  if (!S.project || !mod) return;
  if (api.standalone) { alertDlg(SYNTH_OPEN, 'In the browser edition, choose Silinx as the synthesis tool (Project > Design Properties): Synthesize then runs Yosys in the browser, and so does Implement Design.'); return; }
  if (synthOpenRunning) return;
  synthOpenRunning = true;
  try {
    if (!await checkSyntax(mod)) {
      setStatus('synth-open', 'err');
      log(`Process "${SYNTH_OPEN}" stopped: Check Syntax found errors (see the Errors tab).`, 'err');
      return;
    }
    S.diags = S.diags.filter(d => d.source !== 'console');
    setStatus('synth-open', 'running');
    log(`\nStarted : "${SYNTH_OPEN}".\n`, 'hdr');
    const family = S.project.device?.family || 'spartan3e';
    const srcs = S.sources.filter(s => (s.lang === 'vhdl' || s.lang === 'verilog') && inView(s.role, false));
    const design = elaborate(compile([...primitiveSources(srcs), ...srcs]), mod);
    const { synthesizeOpen, synthEffort } = await import('/core/synth-open.js');
    const { yosysBrowser } = await import('./yosys-client.js');
    log(`Writing <${mod}> as one flat module for Yosys; Yosys (WebAssembly) maps it onto the ${family} cells.`);
    const t0 = performance.now();
    let shown = -1;
    const run = Object.assign((args, files, onLine) => yosysBrowser(args, files, onLine, p => { if (p - shown >= 0.1 || p === 1) { shown = p; status(`Loading Yosys… ${Math.round(p * 100)}%`); } }),
      { parallel: yosysBrowser.parallel });
    const res = await synthesizeOpen(design, { family, run, onLine: logLine, effort: synthEffort(S.project.impl) });
    status(`Saving the netlist of ${mod}…`);
    for (const [name, text] of Object.entries(res.files)) await api.writeFile(S.project.name, `build/open/${name}`, text);
    const u = res.util;
    log(`\nDevice utilization (open synthesis, ${family}):`);
    for (const [k, label] of [['luts', 'LUTs'], ['flipFlops', 'Flip-flops'], ['latches', 'Latches'], ['muxes', 'F5-F8 multiplexers'], ['carry', 'Carry logic'],
      ['shiftRegisters', 'Shift registers'], ['distributedRam', 'Distributed RAM'], ['blockRam', 'Block RAMs'], ['multipliers', 'Multipliers'],
      ['clockBuffers', 'Global clock buffers'], ['dcms', 'DCMs'], ['ios', 'I/O buffers']]) if (u[k]) log(`  ${label}: ${u[k]}`);
    log(`  Cells: ${u.cells}`);
    log(`Netlist: build/open/${res.top}.json (and ${res.top}_yosys.v, ${res.top}_stat.txt) in ${((performance.now() - t0) / 1000).toFixed(1)} s.`);
    const nw = res.warnings.length;
    log(`\nProcess "${SYNTH_OPEN}" completed successfully${nw ? ` with ${nw} warning(s)` : ''}`, 'ok');
    setStatus('synth-open', nw ? 'warn' : 'ok');
  } catch (e) {
    for (const l of e.lines || []) logLine(l);
    log(`ERROR: ${e.message}`, 'err');
    log(`\nProcess "${SYNTH_OPEN}" failed`, 'err');
    setStatus('synth-open', 'err');
  } finally {
    synthOpenRunning = false;
    status('Ready');
  }
}

const FLOW_UP_TO = { synth: ['synth'], translate: ['synth', 'translate'], map: ['synth', 'translate', 'map'], par: ['synth', 'translate', 'map', 'par'] };
async function generateSimModel(mod, step) {
  const stage = { postsynth: 'synth', posttrans: 'translate', postmap: 'map', postpar: 'par' }[step];
  if (!await runImpl(mod, [...FLOW_UP_TO[stage], step])) return false;
  const rel = (await api.reports(S.project.name).catch(() => null))?.simModels?.[step]?.path;
  if (rel) log(`${SIM_MODEL_NAMES[step]} simulation model: ${rel} (simulate it in the Simulation view, or emulate it on the board).`, 'ok');
  return true;
}
async function postParTiming(mod) {
  if (await runImpl(mod, FLOW_UP_TO.par, { timing: true })) openSummary();
}
async function textPowerReport(mod) {
  if (!await runImpl(mod, [...FLOW_UP_TO.par, 'xpwr'])) return;
  const rel = `build/${S.project.top}.pwr`;
  try { showTextDoc(`${S.project.top}.pwr`, await api.readFile(S.project.name, rel)); } catch (e) { log(`WARNING: cannot read ${rel}: ${e.message}`, 'warn'); }
}
// Back-annotate Pin Locations: the pins chosen by the tools (ISE's pin2ucf; in the Silinx toolchain,
// the pads its placer chose, written as pin2ucf writes them) are added to the project's UCF for the
// ports that have no LOC yet (existing LOCs are never changed).
async function backAnnotatePins(mod) {
  if (!await runImpl(mod, [...FLOW_UP_TO.par, 'pin2ucf'])) return;
  await loadUcfText();
  const { backAnnotateUcf } = await import('/core/ucf.js');
  let r;
  try { r = backAnnotateUcf(S.ucfText, await readBuildFile(`build/${S.project.top}_pins.ucf`), { ports: topUcfPorts(), tool: openMode() ? 'Silinx toolchain' : 'pin2ucf' }); } catch (e) { log(`WARNING: no pin file: ${e.message}`, 'warn'); return; }
  const { added: add, lines, text } = r;
  if (!add.length) { log('Back-annotate Pin Locations: every port already has a LOC in the UCF (nothing to add).', 'ok'); return; }
  if (!await confirmDlg('Back-annotate Pin Locations', `Add the ${add.length} pin location(s) chosen by the tools to ${S.project.constraints || 'the UCF'}?\n\n${lines.slice(0, 12).join('\n')}${add.length > 12 ? '\n…' : ''}`)) return;
  const file = S.project.constraints || `${S.project.top}.ucf`;
  await api.writeFile(S.project.name, file, text);
  S.ucfText = text;
  refreshOpenEditor(file, text);
  if (!S.project.constraints) { S.project.constraints = file; await saveProjectJson(); }
  await reloadProject(false);
  log(`Back-annotated ${add.length} pin location(s) into ${file}.`, 'ok');
}
// A file of the build: in the project's build/ folder (the server), or in the browser edition's memory
// (its builds are not kept with the project)
async function readBuildFile(rel) {
  const t = api.buildFile ? await api.buildFile(S.project.name, rel) : await api.readFile(S.project.name, rel);
  if (t == null) throw new Error(`file '${rel}' not found`);
  return typeof t === 'string' ? t : new TextDecoder().decode(t);
}
function showTextDoc(title, text) {
  const id = `text:${title}`;
  const old = findDoc(id);
  if (old) closeDoc(old);
  openDoc({ id, title, icon: 'report', create(el) { el.append(h('pre', { class: 'report-text', style: { margin: 0, padding: '8px', overflow: 'auto', height: '100%', boxSizing: 'border-box', font: '12px var(--mono)' } }, text)); } });
}

// Stop the running implementation (kills the ISE tool / container run.sh via the job manager).
export async function stopProcesses() {
  if (!S.currentJob) { toast('No process is running'); return; }
  S.stopRequested = true;
  log('Stopping…', 'warn');
  try { await api.cancelJob(S.currentJob); } catch (e) { log(`ERROR: cannot stop the process: ${e.message}`, 'err'); }
}

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
export function setDirty(doc, dirty) {
  doc.dirty = dirty;
  // (an edit of the user: a change right after their action in the document, while no command,
  // Undo or Redo writes; a document opened or updated by a command is not edited by the user)
  if (dirty) { if (!history.busy() && Date.now() - (doc._userAt || 0) < 2000) doc._editedAt = Date.now(); doc._edits = (doc._edits || 0) + 1; }   // (Edit ▸ Undo: the last action was an edit or a removal?)
  doc.tab.classList.toggle('dirty', dirty);
  clearTimeout(doc._autosave);
  if (dirty && doc.save) doc._autosave = setTimeout(() => flushDoc(doc, { auto: true }), 800);
}
async function flushDoc(doc, opts) {
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
  [/^asm:(.+)$/, p => inProject(p) && openAsm(p)], [/^tt:(.+)$/, p => inProject(p) && openTt(p)],
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
async function restoreViewState(name) {
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
function closeDocByPath(path) { for (const d of [...S.docs]) if (d.path === path) { d.dirty = false; closeDoc(d); } }

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
            { label: 'Instantiate module', submenu: S.modules.filter(m => m.file !== path).map(m => ({ label: m.name, action: () => d.editor.insertText(instTemplate(m, lang) + '$0') })) },
          ], r.left, r.bottom);
        });
        const host = h('div', { class: 'editor-host' });
        el.append(bar, host);
        d.editor = createEditor(host, {
          text, lang, path,
          project: () => ({ modules: S.modules }),
          onChange: () => { setDirty(d, !d.editor.isClean()); if (lang === 'ucf') liveUcf(); else if (lang === 'vhdl' || lang === 'verilog') liveHdl(); },
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

async function openUcf() {
  const pj = S.project;
  if (!pj.constraints) { pj.constraints = 'constraints/top.ucf'; await saveProjectJson(); }
  if (!S.fileTree.includes(pj.constraints)) {
    const { ucfTemplate } = await import('./templates.js');
    await api.writeFile(pj.name, pj.constraints, ucfTemplate(pj));
    await reloadProject(false);
  }
  openFile(pj.constraints);
}

function openInstTemplate(mod) {
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

// ---- schematic
// Netlist written by netgen for `step` (postsynth / posttrans / postmap / postpar) with the
// Silinx primitive models, ready to compile. When it is not generated yet, the user is offered to
// generate it (the process of the Processes pane, with the steps before it) and the caller goes on
// with it (#490); null when it is not generated (cancelled, failed, or it cannot run here).
// `action`: what the caller does with it ('Simulate', 'Emulate', 'Show'), `title` its dialog's title.
async function netlistSources(step, { hier = false, action = 'Simulate', title = `${action} ${SIM_MODEL_NAMES[step]} Model` } = {}) {
  const name = SIM_MODEL_NAMES[step];
  const modelOf = async () => {
    const rep = await api.reports(S.project.name).catch(() => null);
    return rep?.simModels?.[step] && rep.top === S.project.top ? rep.simModels[step] : null;
  };
  let m = await modelOf();
  if (!m) {
    if (!await offerSimModel(step, action, title)) return null;
    m = await modelOf();
    if (!m) return null;
  }
  const stage = { postsynth: 'synth', posttrans: 'translate', postmap: 'map', postpar: 'par' }[step];
  if (S.status[stage] === 'stale' || S.status[step] === 'stale') log(`WARNING: the ${name.toLowerCase()} model is older than the sources (run "${EXTRA_STEPS[step]}" again to update it).`, 'warn');
  const raw = await api.readFile(S.project.name, m.path);
  const { scalarizeNetlist, regroupNetlist } = await import('/core/netlist-hier.js');
  // single-bit nets simulate several times faster than netgen's vector signals (same behaviour);
  // the technology schematic regroups the flat netlist by the design's own instances
  let text = scalarizeNetlist(raw);
  if (hier) {
    try {
      const design = elaborate(compile(S.sources.filter(x => inView(x.role, false) && (x.lang === 'vhdl' || x.lang === 'verilog'))), S.project.top);
      text = regroupNetlist(raw, (design.top?.children || []).map(c => c.name)).text;
    } catch (e) { log(`WARNING: technology schematic shown flat (${e.message})`, 'warn'); }
  }
  const net = { path: m.path, lang: 'vhdl', text, role: 'design', netlist: step };
  return [...primitiveSources([net]), net];
}
// The dialog of a model not generated yet (#490): "Generate and <action>" runs its process when the
// toolchain can (the Post-Synthesis model: the Silinx toolchain and ISE; the later ones: ISE), else it
// says why. true when the process ran and ended without errors.
const SIM_MODEL_THEN = { Simulate: 'the simulation starts', Emulate: 'the emulator opens', Show: 'the technology schematic opens' };
async function offerSimModel(step, action, title) {
  const proc = EXTRA_STEPS[step];
  let why = null;
  if (openMode()) {
    if (ISE_ONLY.has(step)) why = `"${proc}" needs the Xilinx ISE toolchain: it is not available with the Silinx toolchain (choose an ISE mode in Toolchain Settings).`;
  } else {
    const tc = S.toolchain || await api.toolchain().catch(() => null);
    if (!tc?.ise?.available) why = `"${proc}" needs the Xilinx ISE toolchain, which is not available (configure it in Tools ▸ Toolchain Settings).`;
  }
  const p = (text, first) => h('div', { style: first ? {} : { marginTop: '8px' } }, text);
  const text = h('div', { class: 'msg-text' }, p(`There is no ${SIM_MODEL_NAMES[step].toLowerCase()} simulation model of '${S.project.top}' yet.`, true),
    p(why || `Generate it now with "${proc}"? When it ends without errors, ${SIM_MODEL_THEN[action]}.`));
  const go = await dialog({
    title, width: 440, className: 'sim-model-dlg',
    body: h('div', { class: `msg msg-${why ? 'info' : 'question'}` }, h('div', { class: 'msg-icon' }, why ? 'i' : '?'), text),
    buttons: why ? [{ label: 'OK', value: null, primary: true }] : [{ label: `Generate and ${action}`, value: true, primary: true }, { label: 'Cancel', value: null }],
  });
  if (!go) return false;
  return !!await generateSimModel(S.project.top, step);
}
const isPrimitive = inst => /^<silinx>\//.test(inst?.mod?.file || inst?.file || '');

// View Technology Schematic: the post-synthesis netlist (LUTs, flip-flops, carry chain…)
async function openTechSchematic(mod) {
  if (openMode()) return openSilinxTechSchematic(mod);
  const srcs = await netlistSources('postsynth', { hier: true, action: 'Show', title: 'View Technology Schematic' });
  if (srcs) return openSchematic(mod, { netlist: srcs });
}

// …in the Silinx toolchain: the netlist of its synthesis (Yosys's JSON, build/open/<top>.json; Synthesize
// runs first when there is none or the sources changed since), drawn by core/fpga/techview.js
async function openSilinxTechSchematic(mod) {
  let top = S.project.top;
  const netlistOf = async () => {
    const rep = await api.reports(S.project.name).catch(() => null);
    return rep && rep.top === top && rep.files?.netlist ? rep.files.netlist : null;
  };
  let file = ['ok', 'warn'].includes(S.status.synth) && mod === top ? await netlistOf() : null;
  if (!file) {
    if (!await runImpl(mod, ['synth'])) return;
    top = S.project.top;
    file = await netlistOf();
  }
  let json;
  try { json = await readBuildFile(file || `build/open/${top}.json`); } catch (e) { log(`ERROR: Technology Schematic: no netlist of '${top}' (${e.message}): run Synthesize.`, 'err'); return; }
  setStatus('tech', 'running');
  status(`Reading the netlist of ${top}…`);
  let groups;
  try {
    const design = elaborate(compile(S.sources.filter(x => inView(x.role, false) && (x.lang === 'vhdl' || x.lang === 'verilog'))), top);
    groups = (design.top?.children || []).map(c => c.name);
  } catch { /* the instances from the netlist's names */ }
  const { technologyNetlist } = await import('/core/fpga/techview.js');
  let r;
  try { r = technologyNetlist(json, { groups }); } catch (e) { setStatus('tech', 'err'); log(`ERROR: Technology Schematic: ${e.message}`, 'err'); status('Ready'); return; }
  const blocks = Object.entries(r.groups);
  log(`Technology Schematic of '${top}': the netlist of the Silinx toolchain's synthesis (${file || `build/open/${top}.json`}), ${r.cells} cells${blocks.length ? ` in ${blocks.length} block(s): ${blocks.map(([g, n]) => `${g} (${n})`).join(', ')}` : ''}.`, 'info');
  const net = { path: (file || `build/open/${top}.json`).replace(/\.json$/, '_tech.vhd'), lang: 'vhdl', text: r.text, role: 'design', netlist: 'open' };
  return openSchematic(r.name, { netlist: [...primitiveSources([net]), net] });
}

async function openSchematic(mod, { netlist = null } = {}) {
  await saveAll();
  const sim = S.view === 'sim';
  const srcs = netlist || S.sources.filter(s => (s.lang === 'vhdl' || s.lang === 'verilog') && inView(s.role, sim));
  const all = withPrimitives(srcs);
  const lib = compile(all);
  const design = elaborate(lib, mod);
  const diags = diagsFor(lib, design);
  setDiagnostics(diags);
  if (!design.top) { log(`ERROR: cannot elaborate '${mod}'`, 'err'); showConsolePage('errors'); return; }
  if (diags.some(d => d.severity === 'error')) log(`Schematic of '${mod}' generated with errors (see Errors tab).`, 'warn');
  setStatus(netlist ? 'tech' : sim ? 'rtl-sim' : 'rtl', diags.some(d => d.severity === 'error') ? 'warn' : 'ok');
  const kindName = netlist ? 'Technology' : 'RTL';
  const { mountSchEditor } = await import('./sch-editor.js');
  const { schematicFromHdl, modulesFromLibrary } = await import('/core/schdoc.js');
  const sources = Object.fromEntries(srcs.map(x => [x.path, x.text]));
  // the names as written in the sources (VHDL is lower-cased by the elaborator, #131), the primitives' too (LUT4, FDRE)
  const modules = modulesFromLibrary(lib, { sources: Object.fromEntries(all.map(x => [x.path, x.text])), asWritten: true });
  const modName = name => Object.values(modules).find(m => m.name.toLowerCase() === String(name).toLowerCase())?.name || name;
  const elk = window.ELK ? new window.ELK() : null;
  const id = `${netlist ? 'tech' : 'rtl'}:${mod}`;
  const existing = findDoc(id);
  if (existing) await closeDoc(existing);
  openDoc({
    id, title: `${mod} (${kindName})`, icon: 'schematic',
    create(el, docRef) {
      const bar = h('div', { class: 'doc-toolbar rtl-crumbs' });
      const host = h('div', { class: 'doc-body' });
      el.append(bar, host);
      let ed = null, cur = null;
      const crumbs = inst => { const out = []; for (let i = inst; i; i = i.parent) out.unshift(i); return out; };
      // an instance or a module by its name in the schematic (as written: VHDL names match in any case)
      const sameName = (a, b, vhdl) => a === b || (vhdl && String(a).toLowerCase() === String(b).toLowerCase());
      const shown = new Map();    // instance -> its name as the schematic writes it
      const label = i => `${shown.get(i) || (i.parent ? i.name : modName(i.name))} : ${modName(i.module)}`;
      // ISE-style hierarchy navigation: up to the parent, push into the selected instance
      const upBtn = h('button', { class: 'btn rtl-nav', title: 'Up to the parent module (Backspace)', onclick: () => cur?.parent && show(cur.parent) }, '⬆ Up');
      const intoBtn = h('button', { class: 'btn rtl-nav', title: 'Push into the selected instance (Enter, or double-click it)', onclick: () => ed?.openSelected() }, '⬇ Push into');
      const canEnter = s => !!(s && cur?.children.some(c => (sameName(c.name, s.name, cur.mod?.lang === 'vhdl') || sameName(c.module, s.params.module, c.mod?.lang === 'vhdl')) && !c.blackbox && !isPrimitive(c)));
      // the bar (Up, the crumbs) says the instance drawn: it changes with the drawing, once that is laid
      // out, not before (a click meanwhile went to the drawing left, its properties then replaced, #346)
      const drawBar = (inst, info) => {
        bar.innerHTML = '';
        upBtn.disabled = !inst.parent; intoBtn.disabled = true;
        bar.append(upBtn, intoBtn, h('span', { class: 'rtl-ro' }, netlist ? 'Technology Schematic (read-only): the post-synthesis netlist' : 'RTL Schematic (read-only)'));
        crumbs(inst).forEach((i, k, all) => {
          bar.append(h('span', { class: 'sep' }, k ? ' › ' : ' — '));
          bar.append(k === all.length - 1 ? h('b', {}, label(i)) : h('a', { onclick: () => show(i) }, label(i)));
        });
        if (info) bar.append(h('span', { class: 'spacer' }), h('a', { onclick: () => openFile(info.file, info.line) }, `Open ${info.file.split('/').pop()}`));
      };
      let want = null;   // the instance asked for last (its drawing being laid out)
      const show = async inst => {
        want = inst;
        const info = moduleInfo(inst.module);
        status(`Drawing ${kindName} schematic of ${inst.module}…`);
        try {
          const doc = await schematicFromHdl(inst, { sources, modules, layout: elk ? g => elk.layout(g) : undefined, lang: info?.lang || 'vhdl' });
          if (want !== inst || docRef.closed) return;
          cur = inst;
          if (!ed) {
            ed = mountSchEditor(host, {
              doc, modules, readOnly: true,
              onSelect: s => { intoBtn.disabled = !canEnter(s); },
              onUp: () => cur?.parent && show(cur.parent),
              onOpenModule: (name, { instance } = {}) => {
                const child = cur.children.find(c => sameName(c.name, instance, cur.mod?.lang === 'vhdl')) || cur.children.find(c => sameName(c.module, name, c.mod?.lang === 'vhdl'));
                if (child && !child.blackbox && !isPrimitive(child)) { if (instance) shown.set(child, instance); show(child); }
              },
            });
            docRef.viewer = ed;   // (the read-only editor of the view: tests)
          } else ed.setDoc(doc);
          drawBar(inst, info);
          setTimeout(() => ed.fit?.(), 50);
        } catch (e) { log(`ERROR: ${kindName} schematic of ${inst.module}: ${e.message}`, 'err'); }
        finally { status('Ready'); }
      };
      show(design.top);
      return { destroy: () => ed?.destroy?.() };
    },
  });
}

// ---- simulation (ISim)
async function readDataFiles() {
  const map = new Map(S.sources.map(s => [s.path, s.text]));
  for (const f of S.fileTree.filter(f => /\.(mem|hex|txt|dat|coe|bin)$/i.test(f))) {
    try { map.set(f, await api.readFile(S.project.name, f)); } catch { /* ignore */ }
  }
  return map;
}

// model: undefined = behavioural (the HDL sources); postsynth / posttrans / postmap / postpar =
// the testbench against that netgen netlist (compiled after the sources: its entity replaces the RTL one)
async function runSimulation(mod, model) {
  countEvent('simulate');
  try { return await runSimulationInner(mod, model); }
  catch (e) { setStatus(model ? `sim-${model}` : 'sim-run', 'err'); log(`ERROR: simulation: ${e.message}`, 'err'); }
}
async function runSimulationInner(mod, model) {
  await saveAll();
  if (!await checkSyntax(mod, true)) return;
  const net = model ? await netlistSources(model) : null;
  if (model && !net) return;
  const procId = model ? `sim-${model}` : 'sim-run';
  const title = model ? `Simulate ${SIM_MODEL_NAMES[model]} Model` : 'Simulate Behavioral Model';
  setStatus(procId, 'running');
  log(`\nStarted : "${title}".\n\nBuilding simulation model for top '${mod}'${model ? ` with the ${SIM_MODEL_NAMES[model].toLowerCase()} netlist of '${S.project.top}'` : ''}...`, 'hdr');
  const srcs = [...S.sources.filter(s => (s.lang === 'vhdl' || s.lang === 'verilog') && inView(s.role, true)), ...(net || [])];   // no implementation-only files
  const lib = compile(withPrimitives(srcs));
  if (model) lib.errors = lib.errors.filter(e => !/redefined/.test(e.message));
  const design = elaborate(lib, mod);
  const files = await readDataFiles();
  const sim = new Simulator(design, { files });
  if (!design.top) { setStatus(procId, 'err'); log(`ERROR: cannot elaborate '${mod}': ${design.diags.map(d => d.message).join('; ')}`, 'err'); return; }
  if (!await confirmElabErrors(title, lib, design)) { setStatus(procId, 'err'); return; }
  log(`Simulation model ready: ${design.signals.length} signals, ${design.procs.length} processes. Launching ISim view.`, 'ok');
  setStatus(procId, 'ok');
  const { mountISim } = await import('./isim.js');
  const id = 'isim';
  const old = findDoc(id);
  if (old) await closeDoc(old);
  openDoc({
    id, title: `ISim (${mod}${model ? `, ${SIM_MODEL_NAMES[model]}` : ''})`, icon: 'wave', reopen: `isim:${mod}${model ? `@${model}` : ''}`,
    create(el) {
      // ISim runs 1000 ns at start-up, or the module's drawn stimuli (#336), saved in the project: of the module's
      // inputs, or (a test bench, no ports) of its unit under test's, forced over what the bench drives them with
      const inst = (design.top.ports || []).some(p => p.dir === 'in') ? design.top
        : (design.top.children || []).find(c => (c.ports || []).some(p => p.dir === 'in')) || design.top;
      const stimuli = {
        model: S.project.stimuli?.[mod] || null, inst,
        ports: (inst.ports || []).map(p => ({ name: p.name, dir: p.dir, width: p.sig.t.w || 1 })),
        onChange: m => { S.project.stimuli = { ...(S.project.stimuli || {}), [mod]: m }; saveProjectJson().catch(e => toast(`Cannot save the stimuli: ${e.message}`, 'error')); },
        onSaveTestbench: m => saveStimTestbench(inst === design.top ? mod : inst.module, inst, m),
      };
      const view = mountISim(el, { design, sim, title: mod, initialRun: 1_000_000, stimuli, onOpenSource: ref => ref?.file && openFile(ref.file, ref.line) });
      return { destroy: () => view.destroy?.(), view, onActivate: () => setTimeout(() => view.refresh?.(), 0) };
    },
  });
}

// The stimuli drawn in ISim saved as a self-checking test bench (#336, core/stimuli.js -> core/testbench.js): next
// to the module's file, in the project's language, a simulation source
async function saveStimTestbench(mod, inst, m) {
  const { tbPorts, generateTestbench } = await import('/core/testbench.js');
  const { testbenchOptions } = await import('/core/stimuli.js');
  const title = 'Save as Test Bench';
  const info = moduleInfo(mod);
  // (tb_<module>, or tb_<module>_2… when the project has that test bench already)
  let dft = `tb_${mod}`;
  for (let k = 2; moduleInfo(dft); k++) dft = `tb_${mod}_${k}`;
  const name = String(await promptDlg(title, 'Test bench name:', dft) ?? '').trim();
  if (!name) return;
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) return alertDlg(title, `'${name}' is not a valid name (a letter, then letters, digits or _).`, 'error');
  const lang = (S.project.preferredLanguage || info?.lang) === 'verilog' ? 'verilog' : 'vhdl';
  const dir = String(info?.file || 'src/x').replace(/\/[^/]*$/, '');
  const path = `${dir}/${name}.${lang === 'verilog' ? 'v' : 'vhd'}`;
  const other = wiz.moduleElsewhere(name, path);
  if (other) return alertDlg(title, `The project already has a module '${other.name}' (${other.file}).`, 'error');
  if (S.fileTree?.includes(path) && !await confirmDlg(title, `${path} exists. Replace it?`)) return;
  let text;
  try {
    const types = Object.fromEntries((info?.portList || []).map(p => [p.name, p.type]));
    text = generateTestbench(testbenchOptions(m, { name, lang, uut: { name: mod }, ports: tbPorts({ top: inst }, types) }));
  } catch (e) { return alertDlg(title, e.message, 'error'); }
  await wiz.closeBeforeReplace(path);
  await api.writeFile(S.project.name, path, text);
  await reloadProject();
  // (a simulation source, whatever its name)
  const f = S.project.files?.find(x => x.path === path);
  if (f && f.role !== 'sim') { f.role = 'sim'; await saveProjectJson(); await reloadProject(); }
  log(`Save as Test Bench: created ${path} from the stimuli of '${mod}' (${m.cycles} cycle(s)); run Simulate Behavioral Model on ${name} to check the design.`, 'ok');
  toast(`Test bench ${path} created`, 'ok');
}

// Elaboration errors of a design about to be simulated (e.g. a netlist cell without a model, which
// would run as an empty black box): listed in the console and the Errors tab; true = run anyway.
async function confirmElabErrors(title, lib, design) {
  const errs = diagsFor(lib, design).filter(d => (d.severity || 'error') === 'error');
  if (!errs.length) return true;
  setDiagnostics(diagsFor(lib, design));
  for (const d of errs.slice(0, 20)) log(`ERROR: ${d.file ? `${d.file}${d.line ? `:${d.line}` : ''}: ` : ''}${d.message}`, 'err');
  if (errs.length > 20) log(`… ${errs.length - 20} more error(s) in the Errors tab.`, 'err');
  const missing = errs.filter(d => /not found/.test(d.message)).length;
  return !!await confirmDlg(title, `The design has ${errs.length} elaboration error(s)${missing ? `, ${missing} of them instances of cells or entities that have no model (they would do nothing)` : ''}:\n\n`
    + `${errs.slice(0, 5).map(d => `• ${d.message}`).join('\n')}${errs.length > 5 ? '\n• …' : ''}\n\nThe results will not match the hardware. Run anyway?`);
}

// ---- Board emulator: the design (behavioural RTL) on a virtual board, wired by the UCF
async function openEmulator(mod, { scale, model = null, engine = null } = {}) {
  if (!mod) { toast('Select the top module first'); return; }
  await saveAll();
  const board = projectBoard();
  if (!board) { alertDlg('Board Emulator', 'The project has no board. Choose one in Project ▸ Design Properties (e.g. Digilent Basys2).'); return; }
  if (!await checkSyntax(mod)) return;
  await loadUcfText();   // the pins as they are now (pin planner / editor changes)
  // the design to run: the HDL (RTL) or a netlist generated by netgen (post-synthesis …)
  // (the model first: it may be generated now, #490)
  const net = model ? await netlistSources(model, { action: 'Emulate' }) : null;
  if (model && !net) return;
  let rep = null;
  try { rep = await api.reports(S.project.name); } catch { /* standalone / no build */ }
  const models = Object.keys(SIM_MODEL_NAMES).filter(k => rep?.simModels?.[k] && rep.top === mod);
  const srcs = net || S.sources.filter(s => (s.lang === 'vhdl' || s.lang === 'verilog') && inView(s.role, false));   // the implemented design
  const { timingGenerics, autoTimeScale, scaledGenerics } = await import('/core/emulate.js');
  let design, lib, gens = [];
  try {
    lib = compile(withPrimitives(srcs));
    design = elaborate(lib, mod);
    if (!design.top) throw new Error(design.diags.map(d => d.message).join('; ') || `cannot elaborate '${mod}'`);
    gens = model ? [] : timingGenerics(design.top?.params);   // a netlist has its constants built in
  } catch (e) { alertDlg('Board Emulator', `Cannot build the design: ${e.message}`, 'error'); return; }
  if (!await confirmElabErrors('Board Emulator', lib, design)) return;
  const { parseUcf } = await import('/core/ucf.js');
  const assignments = S.ucfText ? parseUcf(S.ucfText, { ports: design.top.ports.map(ucfPort) }).assignments : {};
  if (!S.ucfText) log('WARNING: the project has no UCF: the ports are not connected to the board (use I/O Pin Planning).', 'warn');
  const files = await readDataFiles();
  const { mountEmulator, emulatorYosys } = await import('./emulator.js');
  // the engine (#418): the design compiled (its netlist by Yosys, at the timing generics' real values unless
  // divided), else (it cannot be, or the event-driven engine is chosen) the event-driven simulator, with the
  // large timing generics (dividers, debouncers) divided so that the design visibly runs. The document opens
  // at once, the board once the design is compiled (Yosys may take seconds to load the first time).
  async function start() {
    let netlist = null, reason = null, d = design, k = scale;
    if (engine !== 'event') {
      const s1 = k ?? 1;
      const d1 = s1 > 1 && gens.length ? elaborate(lib, mod, { generics: scaledGenerics(gens, s1) }) : design;
      try {
        const { netlistOf } = await import('/core/compiled-sim.js');
        netlist = await netlistOf(d1, { run: await emulatorYosys(api.standalone) });
        d = d1;
        k = s1;
      } catch (e) { reason = e.message; }
    }
    k ??= autoTimeScale(gens);
    if (!netlist && k > 1 && gens.length) d = elaborate(lib, mod, { generics: scaledGenerics(gens, k) });
    return { netlist, reason, design: d, scale: k };
  }
  const id = 'emulator';
  const old = findDoc(id);
  if (old) await closeDoc(old);
  openDoc({
    id, title: `Board Emulator (${mod}${model ? `, ${SIM_MODEL_NAMES[model]}` : ''})`, icon: 'board', reopen: `emulator:${mod}${model ? `@${model}` : ''}`,
    create(el, doc) {
      let closed = false;
      const wait = document.createElement('div');
      wait.className = 'emu-hint';
      wait.style.padding = '12px';
      wait.textContent = engine === 'event' ? 'Starting the Board Emulator…' : 'Compiling the design for the Board Emulator (Yosys)…';
      el.append(wait);
      start().then((r) => {
        if (closed) return;
        wait.remove();
        const view = mountEmulator(el, { design: r.design, board, assignments, title: `${mod}${model ? ` — ${SIM_MODEL_NAMES[model]} netlist` : ''}`, files,
          timing: { gens, scale: r.scale, onChange: (k) => setTimeout(() => openEmulator(mod, { scale: k, model, engine }), 0) },
          model: { current: model, available: models, names: SIM_MODEL_NAMES,
            onChange: (m) => setTimeout(() => openEmulator(mod, { model: m || null, engine }), 0) },
          engine: { netlist: r.netlist, reason: r.reason, onChange: (e) => setTimeout(() => openEmulator(mod, { model, engine: e }), 0) } });
        doc.view = view;
        log(`Board Emulator: '${mod}' (${model ? `${SIM_MODEL_NAMES[model]} netlist` : 'RTL'}, ${view.engine === 'compiled' ? 'compiled' : 'event-driven'}) on ${board.name} — ${view.wiring.bits.length} port bit(s) on board resources${view.wiring.unmapped.length ? `, ${view.wiring.unmapped.length} not connected` : ''}.`, 'ok');
      }).catch((e) => { if (!closed) { wait.textContent = `Cannot build the design: ${e.message}`; log(`ERROR: Board Emulator: ${e.message}`, 'err'); } });
      return { destroy: () => { closed = true; doc.view?.destroy(); } };
    },
  });
}

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

// ---- ASM chart <-> HDL synchronization
// The HDL files a drawing could not generate again (it has errors, #303): S.staleHdl[file] = { from, why }.
// Check Syntax (and so the simulation and the implementation) stops on them: they no longer say what the
// drawing does (a schematic net with two drivers, its HDL as it was before)
function staleHdl(target, from, why) { (S.staleHdl ||= {})[target] = { from, why }; }
function freshHdl(target) { if (S.staleHdl) delete S.staleHdl[target]; }

async function syncHdlFromAsm(asmPath, model) {
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

async function syncAsmFromHdl(hdlPath, { quiet = false } = {}) {
  const asmPath = S.hdlToSch[hdlPath];
  const errs = [...(S.lib?.errors || [])].filter(d => d.severity === 'error' && d.file === hdlPath);
  if (errs.length) { status(`${asmPath.split('/').pop()} not updated yet: ${hdlPath.split('/').pop()} has errors`); return; }
  let old;
  try { old = JSON.parse(await api.readFile(S.project.name, asmPath)); } catch { return; }
  let r;
  try { r = await asmFromHdlFile(hdlPath, { module: old.name, previous: old }); }
  catch (e) {
    const msg = `${asmPath} not updated: ${hdlPath} is no longer a plain state machine (${e.message})`;
    if (quiet) status(msg); else log(`WARNING: ${msg}`, 'warn');
    return;
  }
  const next = { ...r.model, generatedFile: hdlPath };
  if (JSON.stringify(next) === JSON.stringify(old)) return;
  S.syncing = true;
  try {
    await api.writeFile(S.project.name, asmPath, JSON.stringify(next, null, 2));
    const d = findDoc(`asm:${asmPath}`);
    if (d?.asmEditor && !d.dirty) d.asmEditor.setModel(next);
    status(`${asmPath.split('/').pop()} updated from ${hdlPath.split('/').pop()}`);
    for (const w of r.warnings || []) if (!quiet) log(`WARNING: ${asmPath}: ${w}`, 'warn');
  } finally { S.syncing = false; }
}

// HDL module -> ASM chart, linked to the HDL file (the chart becomes the base).
async function convertToAsm(mod) {
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

function asmContextMenu(e, file) {
  popupMenu([
    { label: 'Open', action: () => openAsm(file) },
    S.view === 'sim' ? null : { label: 'Set as Top Module', action: () => setViewAsTop(file) },
    { label: 'Rename…', action: () => renameDialog(file) },
    { label: 'Convert to State Diagram (FSM)…', action: () => asmToFsmDiagram(file) },
    clashItem(file),
    { label: 'Remove from Project', action: () => removeModule(file) },
  ].filter(Boolean), e.clientX, e.clientY);
}

// ---- truth tables (.tt.json): table <-> HDL module, synchronized like ASM charts
// The generated HDL module is linked by generatedFile: every change of the table rewrites it, and a
// saved edit of the HDL updates the table (exhaustive simulation of the module, don't cares kept
// in its "don't care:" comments). Truth Table / Karnaugh Map editor: truthtable.js; logic: core/logic.js.
const ttDesignSources = () => S.sources.filter(s => s.role === 'design' && (s.lang === 'vhdl' || s.lang === 'verilog'));

export async function openTt(path) {
  const id = `tt:${path}`;
  if (findDoc(id)) return activateDoc(findDoc(id));
  let model;
  try { model = JSON.parse(await api.readFile(S.project.name, path)); }
  catch (e) { toast(`Cannot open ${path}: ${e.message}`, 'error'); return; }
  const { mountTtEditor } = await import('./truthtable.js');
  openDoc({
    id, path, title: path.split('/').pop(), icon: 'truthtable',
    create(el, d) {
      const host = h('div', { class: 'doc-body' });
      el.append(host);
      const ed = mountTtEditor(host, {
        model,
        onChange: () => setDirty(d, true),
        linkInfo: () => { const f = S.schOwners?.[path]; return f ? { file: f, why: S.outOfSync?.[f] } : null; },
        onOpenFile: f => openFile(f),
        onSchematic: o => schematicFromTt(path, o),
        onFromModule: () => loadTtFromModule(path),
      });
      d.ttEditor = ed;
      return {
        save: async () => {
          const m = ed.getModel();
          await api.writeFile(S.project.name, path, JSON.stringify(m, null, 2)); setDirty(d, false);
          if (!S.syncing) syncHdlFromTt(path, m).catch(e => log(`WARNING: HDL not synchronized: ${e.message}`, 'warn'));
        },
        destroy: () => ed.destroy?.(),
      };
    },
  });
}
const ttModel = async path => { const d = findDoc(`tt:${path}`); if (d?.ttEditor) { await flushDoc(d); return d.ttEditor.getModel(); } return JSON.parse(await api.readFile(S.project.name, path)); };
const refreshTtLink = ttPath => findDoc(`tt:${ttPath}`)?.ttEditor?.refreshLink();

async function syncHdlFromTt(ttPath, model) {
  const target = model.generatedFile;
  if (!target || !S.fileTree.includes(target)) return;
  if (await drawnHdlLanguage(ttPath, model)) return;
  const { generateTableHdl, validateTable, normalizeTable } = await import('/core/logic.js');
  const m = normalizeTable(model);
  S.outOfSync ||= {};
  const errs = validateTable(m);
  if (errs.length) {
    const why = `the truth table has errors: ${errs.map(x => x.message).join('; ')}`;
    if (S.outOfSync[target] !== why) log(`WARNING: ${target} not updated: ${why}`, 'warn');
    S.outOfSync[target] = why; staleHdl(target, ttPath, why); refreshSyncBanner(target); refreshTtLink(ttPath);
    return;
  }
  const g = generateTableHdl(m, /\.v$/i.test(target) ? 'verilog' : 'vhdl', { source: ttPath.split('/').pop() });
  freshHdl(target);
  if (S.outOfSync[target]) { delete S.outOfSync[target]; refreshSyncBanner(target); refreshTtLink(ttPath); }
  const cur = S.sources.find(x => x.path === target)?.text;
  if (cur === g.code) return;
  S.syncing = true;
  try {
    await api.writeFile(S.project.name, target, g.code);
    const src = S.sources.find(x => x.path === target); if (src) src.text = g.code;
    refreshOpenEditor(target, g.code);
    compileProject(); renderHierarchy(); markStale();
    status(`${target} updated from ${ttPath.split('/').pop()}`);
  } finally { S.syncing = false; }
}

// a saved edit of the linked HDL: the table follows (exhaustive simulation of the module)
async function syncTtFromHdl(hdlPath, { quiet = false } = {}) {
  const ttPath = S.hdlToSch[hdlPath];
  S.outOfSync ||= {};
  const fail = why => {
    if (S.outOfSync[hdlPath] !== why && !quiet) log(`WARNING: ${ttPath} not updated: ${why}`, 'warn');
    S.outOfSync[hdlPath] = why; refreshSyncBanner(hdlPath); refreshTtLink(ttPath);
    status(`${ttPath.split('/').pop()} not updated: ${why}`);
  };
  const errs = [...(S.lib?.errors || [])].filter(d => d.severity === 'error' && d.file === hdlPath);
  if (errs.length) return fail(`${hdlPath.split('/').pop()} has errors`);
  let old;
  try { old = JSON.parse(await api.readFile(S.project.name, ttPath)); } catch { return; }
  let next;
  try { next = await ttFromHdl(hdlPath, old); } catch (e) { return fail(e.message); }
  const { normalizeTable } = await import('/core/logic.js');
  if (S.outOfSync[hdlPath]) { delete S.outOfSync[hdlPath]; refreshSyncBanner(hdlPath); }
  if (JSON.stringify(next) !== JSON.stringify(normalizeTable(old))) {
    S.syncing = true;
    try {
      await api.writeFile(S.project.name, ttPath, JSON.stringify(next, null, 2));
      const d = findDoc(`tt:${ttPath}`);
      if (d?.ttEditor && !d.dirty) d.ttEditor.setModel(next);
      status(`${ttPath.split('/').pop()} updated from ${hdlPath.split('/').pop()}`);
    } finally { S.syncing = false; }
  }
  refreshTtLink(ttPath);
}
// the table `old` made again from its HDL module (by exhaustive simulation of it, the don't cares
// written in its comments kept); throws why it cannot be
async function ttFromHdl(hdlPath, old) {
  const mods = S.modules.filter(m => m.file === hdlPath && m.kind !== 'package');
  const mod = mods.find(m => m.name.toLowerCase() === String(old.name || '').toLowerCase()) || mods[0];
  if (!mod) throw new Error(`${hdlPath.split('/').pop()} has no module`);
  const { truthTableFromModule, dontCaresInHdl, normalizeTable, MAX_EDIT_INPUTS } = await import('/core/logic.js');
  const t = truthTableFromModule(ttDesignSources(), mod.name, { maxInputs: MAX_EDIT_INPUTS });
  // don't cares written in the HDL comments ("don't care: f = d(3, 5)")
  const dcs = dontCaresInHdl(S.sources.find(x => x.path === hdlPath)?.text);
  for (const o of t.outputs) for (const r of dcs[o.toLowerCase()] || []) if (r >= 0 && r < t.table[o].length) t.table[o] = t.table[o].slice(0, r) + 'X' + t.table[o].slice(r + 1);
  const exprs = {};
  for (const o of t.outputs) if (old.exprs?.[o] && old.table?.[o] === t.table[o] && JSON.stringify(old.inputs) === JSON.stringify(t.inputs)) exprs[o] = old.exprs[o];
  return normalizeTable({ ...old, base: undefined, name: t.name, inputs: t.inputs, outputs: t.outputs, table: t.table, exprs, lang: /\.v$/i.test(hdlPath) ? 'verilog' : 'vhdl', generatedFile: hdlPath });
}

// pick a combinational module of the project
async function pickModule(title, exclude) {
  const mods = S.modules.filter(m => m.role === 'design' && m.kind !== 'package' && m.file !== exclude);
  if (!mods.length) { alertDlg(title, 'The project has no design modules.', 'error'); return null; }
  const sel = h('select', { style: { width: '100%' } }, ...mods.map(m => h('option', { value: m.name, selected: m.name === S.sel?.module }, `${m.name} (${m.file})`)));
  const ok = await dialog({ title, width: 480, body: h('div', {}, h('div', { class: 'hint' }, 'Combinational module (at most 8 input bits): its truth table is computed by simulating every input combination.'), h('div', { style: { marginTop: '8px' } }, sel)),
    buttons: [{ label: 'OK', primary: true, value: true }, { label: 'Cancel', value: null }] });
  return ok ? sel.value : null;
}
async function moduleTable(title, mod) {
  await saveAll();
  const { truthTableFromModule } = await import('/core/logic.js');
  try { return truthTableFromModule(ttDesignSources(), mod); }
  catch (e) { alertDlg(title, e.message, 'error'); return null; }
}

// "Truth Table from Module…" in the editor: replace the table's contents
async function loadTtFromModule(ttPath) {
  const T = 'Truth Table from Module';
  const d = findDoc(`tt:${ttPath}`);
  const m = d?.ttEditor?.getModel();
  const mod = await pickModule(T, m?.generatedFile);
  if (!mod) return;
  const t = await moduleTable(T, mod);
  if (!t || !d?.ttEditor) return;
  if (!await confirmDlg(T, `Replace the contents of ${ttPath.split('/').pop()} by the truth table of '${mod}' (${t.inputs.length} input(s), ${t.outputs.length} output(s))?`)) return;
  d.ttEditor.setModel({ ...d.ttEditor.getModel(), inputs: t.inputs, outputs: t.outputs, table: t.table, exprs: {} });
  setDirty(d, true);
  for (const w of t.warnings) log(`WARNING: ${w}`, 'warn');
  log(`${ttPath}: truth table of '${mod}' (${1 << t.inputs.length} rows, exhaustive simulation).`, 'ok');
}

// "Generate Schematic": a one-off gate schematic of the table (not linked)
async function schematicFromTt(ttPath, { form = 'sop', nand = false } = {}) {
  const { schematicFromTable, validateTable, normalizeTable } = await import('/core/logic.js');
  const { netlist } = await import('/core/schdoc.js');
  const m = normalizeTable(await ttModel(ttPath));
  const errs = validateTable(m);
  if (errs.length) { alertDlg('Generate Schematic', errs.map(x => x.message).join('\n'), 'error'); return; }
  const dir = ttPath.includes('/') ? ttPath.replace(/\/[^/]*$/, '') : 'src';
  let name = `${m.name}_sch`, k = 1;
  while (S.fileTree.includes(`${dir}/${name}.sch.json`) || S.modules.some(x => x.name.toLowerCase() === name.toLowerCase())) name = `${m.name}_sch${++k}`;
  const doc = schematicFromTable(m, { form, nand, lang: m.lang, name });
  const bad = netlist(doc).diagnostics.filter(x => x.severity === 'error');
  if (bad.length) { alertDlg('Generate Schematic', bad.map(x => x.message).join('\n'), 'error'); return; }
  const target = `${dir}/${name}.sch.json`;
  await api.writeFile(S.project.name, target, JSON.stringify(doc, null, 1));
  log(`Truth table '${ttPath}' -> schematic ${target} (minimal ${form.toUpperCase()}${nand ? ', NAND gates only' : ''}; not linked to the table: a module of its own, '${name}').`, 'ok');
  await reloadProject(false);
  openSch(target);
}

function ttContextMenu(e, file) {
  popupMenu([
    { label: 'Open', action: () => openTt(file) },
    S.view === 'sim' ? null : { label: 'Set as Top Module', action: () => setViewAsTop(file) },
    { label: 'Rename…', action: () => renameDialog(file) },
    clashItem(file),
    { label: 'Remove from Project', action: () => removeModule(file) },
  ].filter(Boolean), e.clientX, e.clientY);
}

// ---- state diagrams (.fsm.json): bubble diagram <-> HDL module, synchronized like ASM charts
// The generated module is linked by generatedFile: every change of the diagram rewrites it, and a
// saved edit of the HDL updates the diagram whenever it can be read back as a state machine
// (core/fsm.js fsmFromHdl, through the ASM reader); otherwise the HDL editor and the diagram show
// the out-of-sync banner with the reason. Editor: fsm-editor.js; model, tables, HDL: core/fsm.js.
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

async function syncHdlFromFsm(fsmPath, model) {
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

// a saved edit of the linked HDL: the diagram follows when the module is still a plain state machine
async function syncFsmFromHdl(hdlPath, { quiet = false } = {}) {
  const fsmPath = S.hdlToSch[hdlPath];
  S.outOfSync ||= {};
  const fail = why => {
    if (S.outOfSync[hdlPath] !== why && !quiet) log(`WARNING: ${fsmPath} not updated: ${why}`, 'warn');
    S.outOfSync[hdlPath] = why; refreshSyncBanner(hdlPath); refreshFsmLink(fsmPath);
    status(`${fsmPath.split('/').pop()} not updated: ${why}`);
  };
  const errs = [...(S.lib?.errors || [])].filter(d => d.severity === 'error' && d.file === hdlPath);
  if (errs.length) return fail(`${hdlPath.split('/').pop()} has errors`);
  let old;
  try { old = JSON.parse(await api.readFile(S.project.name, fsmPath)); } catch { return; }
  let r;
  try { r = await fsmFromHdlFile(hdlPath, old); } catch (e) { return fail(e.message); }
  const { normalizeFsm } = await import('/core/fsm.js');
  const next = r.model;
  if (S.outOfSync[hdlPath]) { delete S.outOfSync[hdlPath]; refreshSyncBanner(hdlPath); }
  if (JSON.stringify(next) !== JSON.stringify(normalizeFsm(old))) {
    S.syncing = true;
    try {
      await api.writeFile(S.project.name, fsmPath, JSON.stringify(next, null, 2));
      const d = findDoc(`fsm:${fsmPath}`);
      if (d?.fsmEditor && !d.dirty) d.fsmEditor.setModel(next);
      status(`${fsmPath.split('/').pop()} updated from ${hdlPath.split('/').pop()}`);
      for (const w of r.warnings || []) if (!quiet) log(`WARNING: ${fsmPath}: ${w}`, 'warn');
    } finally { S.syncing = false; }
  }
  refreshFsmLink(fsmPath);
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
async function convertToFsm(mod) {
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
function petriContextMenu(e, file) {
  popupMenu([
    { label: 'Open', action: () => openPetri(file) },
    S.view === 'sim' ? null : { label: 'Set as Top Module', action: () => setViewAsTop(file) },
    { label: 'Rename…', action: () => renameDialog(file) },
    clashItem(file),
    { label: 'Remove from Project', action: () => removeModule(file) },
  ].filter(Boolean), e.clientX, e.clientY);
}

function fsmContextMenu(e, file) {
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
async function schModules() {
  const { modulesFromLibrary } = await import('/core/schdoc.js');
  const sources = Object.fromEntries(S.sources.map(s => [s.path, s.text]));
  const mods = modulesFromLibrary(S.lib, { sources });
  // the test benches (Simulation-only sources, #332): not offered in the palette's Project modules
  const sim = new Set(S.sources.filter(s => s.role === 'sim').map(s => s.path));
  for (const m of Object.values(mods)) if (sim.has(m.file)) m.testbench = true;
  return mods;
}

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
        doc, modules,
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
const isAsm = p => /\.asm\.json$/i.test(p || '');
const isTt = p => /\.tt\.json$/i.test(p || '');
const isFsm = p => /\.fsm\.json$/i.test(p || '');
const isPn = p => /\.pn\.json$/i.test(p || '');
const viewNoun = p => (isAsm(p) ? 'state machine' : isTt(p) ? 'truth table' : isFsm(p) ? 'state diagram' : isPn(p) ? 'Petri net' : 'schematic');
const viewTitle = p => (isAsm(p) ? 'State Machine' : isTt(p) ? 'Truth Table' : isFsm(p) ? 'State Diagram' : isPn(p) ? 'Petri Net' : 'Schematic');
const viewIcon = p => (isAsm(p) ? 'asm' : isTt(p) ? 'truthtable' : isFsm(p) ? 'fsm' : isPn(p) ? 'petri' : 'schematic');
const viewKind = p => (isAsm(p) ? 'asm' : isTt(p) ? 'tt' : isFsm(p) ? 'fsm' : isPn(p) ? 'pn' : 'sch');
const viewContextMenu = (e, f) => (isAsm(f) ? asmContextMenu : isTt(f) ? ttContextMenu : isFsm(f) ? fsmContextMenu : isPn(f) ? petriContextMenu : schContextMenu)(e, f);
function openView(p) { return isAsm(p) ? openAsm(p) : isTt(p) ? openTt(p) : isFsm(p) ? openFsm(p) : isPn(p) ? openPetri(p) : openSch(p); }
// a view's badge in the Design tree (#207)
const viewBadge = p => (isAsm(p) ? 'ASM' : isTt(p) ? 'Table' : isFsm(p) ? 'FSM' : isPn(p) ? 'Petri' : 'Schematic');

// the commands of a module's drawing (its badge in the Design tree): the drawing is the base, its HDL
// file generated from it (#220)
function syncedViewMenu(e, sch) {
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
async function drawnHdlLanguage(path, m) {
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
async function adoptDrawnHdl() {
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
const clashTip = c => (c.kind === 'same'
  ? `No HDL file: ${c.file} defines its module ${c.module} already. Generate HDL File… (right-click) replaces it with the HDL generated from the drawing.`
  : c.kind === 'removed'
    ? `No HDL file: its HDL file ${c.file} was removed from the project. Generate HDL File… (right-click) makes it again from the drawing.`
  : c.kind === 'drawn'
    ? `No HDL file: its module ${c.module} is the module of ${c.other}. Rename one of them.`
    : `No HDL file: ${c.target} holds something else. Generate HDL File… (right-click) writes its HDL to ${c.free}.`);
async function drawnHdlClashes() {
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
const clashItem = file => (S.hdlClash?.[file] && S.hdlClash[file].kind !== 'drawn' ? { label: 'Generate HDL File…', action: () => resolveHdlClash(file) } : null);
// Generate HDL File…: the file that defines its module replaced (once the user says so) or the free
// name written; the drawing linked to it
async function resolveHdlClash(path) {
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

// ---- schematic <-> HDL synchronization
// Structure of a schematic: symbols (name, type, params), ports and net connectivity. When an HDL
// edit keeps the structure, only the HDL kept in the schematic (HDL blocks, declarations) changes
// and the drawing stays as it is; otherwise the schematic is regenerated and laid out again.
async function schStructure(doc, modules) {
  const { netlist } = await import('/core/schdoc.js');
  const nl = netlist(doc, { modules });
  const symName = id => doc.symbols.find(x => x.id === id)?.name;
  const portName = id => doc.ports.find(x => x.id === id)?.name;
  const key = JSON.stringify({
    syms: doc.symbols.map(x => `${x.name}:${x.type}:${JSON.stringify(x.params || {})}`).sort(),
    ports: doc.ports.map(x => `${x.name}:${x.dir}:${x.width}`).sort(),
    nets: nl.nets.map(n => n.endpoints.map(e => (e.kind === 'pin' ? `${symName(e.sym)}.${e.pin}` : `port:${portName(e.port)}`)).sort().join(',')).sort(),
  });
  // VHDL names in any case (a schematic made before the names were kept as written, #131)
  return doc.lang === 'vhdl' ? key.toLowerCase() : key;
}

// banner of an HDL editor of a file generated from a drawing (the drawing is the base, #220; an edit
// here updates the drawing, but a Petri net's); shows when it is out of sync and why
function syncBanner(path, sch) {
  const why = S.outOfSync?.[path];
  // in sync: nothing to say (the Design pane's badges say where the file comes from, #224); the
  // element stays, empty and hidden, so that it shows when the file gets out of sync
  if (!why) return h('span', { class: 'gen-banner', hidden: true, 'data-sync-banner': path });
  const el = h('span', { class: `gen-banner${why ? ' out-of-sync' : ''}`, 'data-sync-banner': path },
    'Not in sync with ', h('a', { onclick: () => openView(sch) }, sch.split('/').pop()),
    isTt(sch) || isFsm(sch) ? ` — ${why}` : ` — the ${viewNoun(sch)} has errors: ${why}`);
  return el;
}
function refreshSyncBanner(path) {
  const sch = S.hdlToSch?.[path];
  for (const el of document.querySelectorAll('[data-sync-banner]')) if (el.dataset.syncBanner === path && sch) el.replaceWith(syncBanner(path, sch));
}

// a top port as the UCF sees it: vectors (also 1-bit ones, x<0>) have msb / lsb
// the top's ports as parseUcf takes them (undefined when the design does not elaborate: parseUcf then
// treats any name[i] as a bus bit, as before)
function topUcfPorts() {
  try { const d = S.lib && S.project?.top ? elaborate(S.lib, S.project.top) : null; return d?.top ? d.top.ports.map(ucfPort) : undefined; } catch { return undefined; }
}

function ucfPort(p) {
  const t = p.sig.t, bus = t.w > 1 || (t.kind === 'logic' && !t.scalar);
  return { name: p.name, dir: p.dir, width: t.w, msb: bus ? t.left : null, lsb: bus ? t.right : null };
}

function refreshOpenEditor(path, text) {
  const od = findDoc(`file:${path}`);
  if (od && !od.dirty) { od.editor.setValue(text); od.editor.markClean(); setDirty(od, false); }
}

async function syncHdlFromSchematic(schPath, doc) {
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

async function syncSchematicFromHdl(hdlPath, { quiet = false } = {}) {
  const schPath = S.hdlToSch[hdlPath];
  const errs = [...(S.lib?.errors || [])].filter(d => d.severity === 'error' && d.file === hdlPath);
  if (errs.length && quiet) { status(`${schPath.split('/').pop()} not updated yet: ${hdlPath.split('/').pop()} has errors`); return; }
  if (errs.length) { log(`WARNING: ${schPath} not updated: ${hdlPath} has errors (it is updated once the HDL compiles)`, 'warn'); return; }
  let old;
  try { old = JSON.parse(await api.readFile(S.project.name, schPath)); } catch { return; }
  const mods = S.modules.filter(m => m.file === hdlPath);
  const mod = mods.find(m => m.name.toLowerCase() === String(old.name || '').toLowerCase()) || mods[0];
  if (!mod) return;
  const design = elaborate(S.lib, mod.name);
  if (!design.top) return;
  const { schematicFromHdl } = await import('/core/schdoc.js');
  const sources = Object.fromEntries(S.sources.map(x => [x.path, x.text]));
  const modules = await schModules();
  const elk = window.ELK ? new window.ELK() : null;
  let fresh;
  try { fresh = await schematicFromHdl(design.top, { sources, modules, layout: elk ? g => elk.layout(g) : undefined, lang: mod.lang }); }
  catch (e) { log(`WARNING: ${schPath} not updated from ${hdlPath}: ${e.message}`, 'warn'); return; }
  let next, relaid = false;
  if (await schStructure(fresh, modules) === await schStructure(old, modules)) {
    // same structure: keep the drawing, take the HDL kept in the blocks and declarations
    next = structuredClone(old);
    const same = (a, b) => a === b || (fresh.lang === 'vhdl' && a.toLowerCase() === b.toLowerCase());
    for (const x of fresh.symbols) { const o = next.symbols.find(y => same(y.name, x.name) && y.type === x.type); if (o) { o.hdl = x.hdl; o.params = x.params; } }
    next.hdl = fresh.hdl;
    for (const p of fresh.ports) { const o = next.ports.find(y => same(y.name, p.name)); if (o) o.type = p.type; }
  } else {
    next = { ...fresh, generatedFile: hdlPath };
    relaid = true;
  }
  next.generatedFile = hdlPath;
  if (JSON.stringify(next) === JSON.stringify(old)) return;
  S.syncing = true;
  try {
    await api.writeFile(S.project.name, schPath, JSON.stringify(next, null, 1));
    const d = findDoc(`sch:${schPath}`);
    if (d?.schEditor && !d.dirty) d.schEditor.setDoc(next);
    log(relaid ? `${schPath} regenerated from ${hdlPath} (the design structure changed, so the schematic was laid out again).`
               : `${schPath} updated from ${hdlPath} (same structure: layout kept).`, 'info');
  } finally { S.syncing = false; }
}

// HDL -> editable schematic, for any HDL module (#225). The schematic becomes the module's base and
// its HDL file is generated from it at once (core/hdl-to-sch.js): what can be drawn is drawn, the rest
// (processes, always blocks, generates…) kept as HDL blocks of the schematic, so that the design does
// not change (checked: the conversion is refused when the generated HDL would not compile as the
// module did). A file that holds other design units too keeps them; the module's HDL then goes to a
// file of its own.
async function convertToSchematic(mod) {
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
async function drawingsAsBase() {
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
async function setViewAsTop(path) {
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
const viewSel = () => (['sch', 'asm', 'tt', 'fsm', 'pn'].includes(S.sel?.type) ? S.sel.file : null);
const topOfView = path => { const gen = S.schOwners?.[path] || path; return S.modules.find(m => m.file === gen && m.kind !== 'package')?.name || null; };

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

function schContextMenu(e, file) {
  popupMenu([
    { label: 'Open', action: () => openSch(file) },
    S.view === 'sim' ? null : { label: 'Set as Top Module', action: () => setViewAsTop(file) },
    { label: 'Rename…', action: () => renameDialog(file) },
    { label: 'Export as ISE Schematic (.sch)…', action: () => exportSchAsIse(file) },
    clashItem(file),
    { label: 'Remove from Project', action: () => removeModule(file) },
  ].filter(Boolean), e.clientX, e.clientY);
}

// ---- Rename Symbol (F2) in an HDL editor: the name under the cursor, everywhere it means the same
// object in the file; a port / generic also in the instances of its module in the other files
function renameSymbolIn(d, lang, path) {
  if (!d.editor) return;
  const findModule = name => S.modules.find(m => m.name.toLowerCase() === String(name).toLowerCase());
  return renameSymbolAtCursor({
    editor: d.editor, lang, path,
    // (not the HDL generated from a drawing without a file of its own: it follows the drawing)
    sources: () => S.sources.filter(s => (s.lang === 'vhdl' || s.lang === 'verilog') && !s.view).map(s => ({ ...s, text: S.docs.find(o => o.path === s.path && o.editor)?.editor.getValue() ?? s.text })),
    drawings: () => S.sources.filter(s => s.view),
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

async function renameDialog(file, mod = null) {
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
async function openFpgaView(mod = S.project?.top) {
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
function syncFpgaView(sel) {
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
function refreshSummary() { const d = findDoc('summary'); d?.refresh?.(); }

async function openPinPlanner(mod) {
  const { mountPinPlanner } = await import('./pinplanner.js');
  const top = mod || S.project.top;
  if (!top) { alertDlg('I/O Pin Planning', 'Select a top-level module first.', 'warn'); return; }
  const old = findDoc('pins');
  if (old) await closeDoc(old);
  openDoc({ id: 'pins', title: 'I/O Pin Planning', icon: 'pins', create: (el, d) => mountPinPlanner(el, d, top) });
}

async function openImpact() {
  const { mountImpact } = await import('./impact.js');
  openDoc({ id: 'impact', title: 'iMPACT', icon: 'impact', create: (el, d) => mountImpact(el, d) });
}

// ------------------------------------------------------------------ project lifecycle
// per-project UI state (cleared when another project is opened or the project is closed)
function resetProjectState() {
  S.diagsCleared++;   // (the start-up checks' lines coming later: not in the tabs, #339)
  S.status = {}; S.sel = null; S.selKey = null; S.selProc = null; S.diags = []; S.outOfSync = {}; S.staleHdl = {}; S.staleSeen = new Map(); S.ucfText = null; S.hdlClash = {}; S.hdlClashWarned = new Set();
  renderDiagnostics();
}
function blockedByRun(what) {
  if (!S.busy && !S.currentJob) return false;
  alertDlg(what, 'An implementation is running: stop it (or wait for it to finish) first.');
  return true;
}

// Opening and closing projects run one after the other, in call order (#375): a project closed while it was
// still opening (its status and documents being restored) was closed, then the rest of the opening showed its
// Design page over the Start page and reopened its documents with no project open.
let lifecycle = Promise.resolve();
function inOrder(fn) {
  const run = lifecycle.then(fn, fn);
  lifecycle = run.catch(() => {});
  return run;
}
export function openProject(name) { return inOrder(() => openProjectNow(name)); }
export function closeProject() { return inOrder(closeProjectNow); }

async function openProjectNow(name) {
  if (blockedByRun('Open Project')) return;
  keepView = true;   // (the documents of the project left are kept as they were)
  try { for (const d of [...S.docs]) if (!await closeDoc(d)) return; } finally { keepView = false; }
  resetProjectState();
  try {
    S.project = await api.project(name);
  } catch (e) { alertDlg('Open Project', e.message, 'error'); return; }
  try { localStorage.setItem('silinx.lastProject', name); } catch { /* ignore */ }
  rememberRecent(name);
  await reloadProject();
  await fixMissingTops();   // (a project saved with a top it no longer has, #253)
  log(`Project "${name}" opened (${S.project.device.part}${S.project.device.speed}-${S.project.device.package}).`, 'info');
  // the processes' status of the last run, its synthesis up to date or not (#280), restored before the project is
  // used: not awaited, it drew the Processes panel again under a double-click on a process and Implement Design
  // then did not start, or synthesized again (#346)
  await restoreImplStatus();
  // where the user was in this project; the Design Summary the first time
  if (!await restoreViewState(name)) openSummary({ background: true });
}

// Reloads run one after the other, in call order: two reloads close together (e.g. Remove from
// Project then Undo) could otherwise finish out of order and leave the older state on screen.
export function reloadProject(render = true) {
  const run = () => reloadProjectNow(render);
  S.reloadChain = (S.reloadChain || Promise.resolve()).then(run, run);
  return S.reloadChain;
}

async function reloadProjectNow(render = true, depth = 0) {
  if (!S.project) return null;
  const pj = await api.project(S.project.name);
  // the files on disk; the project ignores the ones removed from it (project.excluded, unregistered HDL)
  S.diskTree = pj.fileTree || [];
  const out = new Set(pj.excluded || []);
  const hdlIn = new Set((pj.files || []).map(f => f.path));
  S.fileTree = S.diskTree.filter(f => !out.has(f) && (!/\.(vhdl?|v|sv)$/i.test(f) || hdlIn.has(f)));
  delete pj.fileTree;
  S.project = pj;
  S.sources = await api.sources(pj.name);
  S.schOwners = {};
  S.hdlToSch = {};
  S.viewModule = {};
  // schematics (.sch.json) and ASM charts (.asm.json) linked to an HDL file ("views" kept in sync)
  S.viewTexts = {};
  for (const f of S.fileTree.filter(f => /\.(sch|asm|tt|fsm|pn)\.json$/.test(f))) {
    try {
      const t = await api.readFile(pj.name, f);
      S.viewTexts[f] = t;
      const d = JSON.parse(t);
      if (d.generatedFile && S.fileTree.includes(d.generatedFile) && !S.hdlToSch[d.generatedFile]) { S.schOwners[f] = d.generatedFile; S.hdlToSch[d.generatedFile] = f; S.viewModule[f] = d.name; }
    } catch { /* unreadable */ }
  }
  compileProject();
  // a drawing whose base was its HDL (before #220) is made the base; a drawn source without its HDL
  // file gets it (#207): read the project again with them
  if (depth < 2 && (await drawingsAsBase() || await adoptDrawnHdl())) return reloadProjectNow(render, depth + 1);
  await drawnHdlClashes();
  // the open drawings show their links as they are now (one linked meanwhile, #245)
  for (const d of S.docs) (d.ttEditor || d.fsmEditor || d.petriEditor)?.refreshLink?.();
  updateTitle();
  renderHierarchy();
  renderFilesPage();
  renderLibsPage();
  if (!render) return;
}

async function closeProjectNow() {
  if (blockedByRun('Close Project')) return;
  keepView = true;
  try { for (const d of [...S.docs]) if (!await closeDoc(d)) return; } finally { keepView = false; }
  S.project = null; S.lib = null; S.sources = []; S.modules = [];
  resetProjectState();
  try { localStorage.removeItem('silinx.lastProject'); } catch { /* ignore */ }
  updateTitle(); renderHierarchy(); renderProcesses(); renderFilesPage(); renderLibsPage();
  showLeftPage('start');
}

function updateTitle() {
  const pj = S.project;
  $('title-text').textContent = pj ? `${PRODUCT} ${VERSION_LABEL} - ${pj.name} - [${S.active?.title || 'Design Summary'}]` : `${PRODUCT} ${VERSION_LABEL} - Project Navigator`;
  // the modern header: product and version (as the classic title bar)
  const brand = $('title-brand');
  if (!brand.querySelector('.m-ver')) { brand.textContent = `${PRODUCT} `; brand.append(h('span', { class: 'm-ver' }, VERSION_LABEL)); }
  $('title-project').textContent = pj ? pj.name : 'No project open';
  $('title-project').classList.toggle('none', !pj);
  document.title = pj ? `${pj.name} — ${PRODUCT} ${VERSION_LABEL}` : `${PRODUCT} ${VERSION_LABEL} Project Navigator`;
  $('status-device').textContent = pj ? `${pj.device.part}${pj.device.speed}-${pj.device.package}${pj.board ? ` · ${pj.board}` : ''}` : '';
}

function rememberRecent(name) {
  try {
    const r = JSON.parse(localStorage.getItem('silinx.recent') || '[]').filter(x => x !== name);
    r.unshift(name);
    localStorage.setItem('silinx.recent', JSON.stringify(r.slice(0, 8)));
  } catch { /* ignore */ }
}
function recent() { try { return JSON.parse(localStorage.getItem('silinx.recent') || '[]'); } catch { return []; } }
// File ▸ Recent Projects ▸ Clear Recent Projects, and the Start page link: forget the list (the projects stay)
function clearRecent() {
  try { localStorage.removeItem('silinx.recent'); } catch { /* ignore */ }
  if (!document.querySelector('.left-page[data-page=start]').hidden) renderStartPage();
  toast('Recent projects cleared (the projects themselves are kept)', 'ok');
}

// ------------------------------------------------------------------ left pages
function showLeftPage(page) {
  S.leftPage = page;
  saveViewState();
  document.querySelectorAll('#left-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.page === page));
  document.querySelectorAll('.left-page').forEach(p => { p.hidden = p.dataset.page !== page; });
  if (page === 'start') renderStartPage();
}

async function renderStartPage() {
  const host = $('start-page');
  const projects = await api.projects().catch(() => []);
  const recentHere = recent().filter(r => projects.some(p => p.name === r));
  const page = h('div', { class: 'page' },
    h('div', { class: 'start-box' }, h('h3', {}, 'Project Commands'),
      ...[['New Project…', 'newProject', () => wiz.newProjectWizard()], ['Open Project…', 'open', () => wiz.openProjectDialog()], ['Import Silinx ISE Project (.zip)…', 'open', () => wiz.importSilinxDialog()], ['Import Xilinx ISE Project (.zip)…', 'open', () => wiz.importXiseDialog()], ...EXAMPLE_ORDER.map(t => [`Open Example (${t})`, 'project', () => wiz.newProjectWizard({ template: t })])]
        .map(([l, ic, f]) => h('div', { class: 'entry' }, icon(ic), h('a', { onclick: f }, l)))),
    h('div', { class: 'start-box' }, h('h3', {}, 'Recent Projects'),
      ...(recentHere.map(r => h('div', { class: 'entry' }, icon('project'), h('a', { onclick: () => openProject(r).then(() => showLeftPage('design')) }, r)))),
      projects.length ? null : h('div', { class: 'entry', style: { color: 'var(--grey-6)' } }, 'No projects yet.'),
      recentHere.length ? h('div', { class: 'entry start-clear' }, h('a', { onclick: () => clearRecent() }, 'Clear Recent Projects')) : null),
    api.standalone ? await storageBox() : null,
  );
  // replaced, not appended: two renders at once (the page shown again while a project closes) list it once
  host.replaceChildren(page);
}
// the browser edition's Start page: where the projects are kept, and the folder commands
async function storageBox() {
  const st = api.storage();
  const entry = (label, ic, fn, attrs = {}) => h('div', { class: 'entry', ...attrs }, icon(ic), fn ? h('a', { onclick: fn }, label) : h('span', { class: 'disabled' }, label));
  const inBrowser = st.kind === 'folder' ? (await api.browserProjects().catch(() => [])).length : 0;
  return h('div', { class: 'start-box start-storage' }, h('h3', {}, 'Where Projects Are Kept'),
    h('div', { class: 'entry' }, st.kind === 'folder' ? `In the folder ${st.folder} on the disk.` : 'In this browser\'s storage.'),
    st.kind !== 'folder' && st.remembered && st.supported ? entry(`Reopen ${st.remembered}`, 'open', () => reopenWorkspaceFolder()) : null,
    st.supported ? entry('Open Workspace Folder…', 'open', () => openWorkspaceFolder())
      : entry('Open Workspace Folder…', 'open', null, { title: st.unsupportedReason }),
    st.supported ? null : h('div', { class: 'entry hint' }, 'A folder on the disk needs Chrome or Edge.'),
    st.kind === 'folder' && inBrowser ? entry('Copy Browser Projects to the Folder', 'project', () => copyBrowserProjects()) : null,
    st.kind === 'folder' ? entry('Use Browser Storage', 'project', () => useBrowserStorage()) : null);
}

function renderFilesPage() {
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

function renderLibsPage() {
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

// ------------------------------------------------------------------ menus & toolbar
function setupMenus() {
  const hasPj = () => !S.project;
  menuBar($('menubar'), S.menus = [
    { label: 'File', items: () => [
      { label: 'New Project…', icon: icon('newProject'), action: () => wiz.newProjectWizard() },
      { label: 'Open Project…', icon: icon('open'), action: () => wiz.openProjectDialog() },
      '-',
      { label: 'Import Silinx ISE Project (.zip)…', action: () => wiz.importSilinxDialog() },
      { label: 'Export Silinx ISE Project (.zip)…', action: () => exportProjectZip('silinx'), disabled: hasPj },
      '-',
      { label: 'Import Xilinx ISE Project (.zip)…', action: () => wiz.importXiseDialog() },
      { label: 'Export Xilinx ISE Project (.zip)…', action: () => exportProjectZip('xilinx'), disabled: hasPj },
      '-',
      api.standalone ? { label: 'Download Project Bundle…', action: async () => downloadText(`${S.project.name}.silinx.json`, await api.exportBundle(S.project.name), 'application/json'), disabled: hasPj } : null,
      api.standalone ? { label: 'Open Project Bundle…', action: () => openBundle() } : null,
      api.standalone ? '-' : null,
      ...(api.standalone ? storageMenuItems() : []),
      { label: 'Close Project', action: () => closeProject(), disabled: hasPj },
      '-',
      { label: 'Print…', action: () => printActive(), shortcut: 'Ctrl+P', disabled: () => !(S.active?.asmEditor || S.active?.schEditor || S.active?.fsmEditor) },
      '-',
      { label: 'Recent Projects', submenu: [
        ...recent().map(r => ({ label: r, action: () => openProject(r) })),
        recent().length ? '-' : null,
        { label: 'Clear Recent Projects', action: () => clearRecent(), disabled: !recent().length },
      ].filter(Boolean) },
    ].filter(Boolean) },
    { label: 'Edit', items: () => [
      // one Undo: the last removal from the project when that was the last action, else the editor's undo
      undoesProject()
        ? { label: `Undo ${history.undoLabel()}`, icon: icon('undo'), action: () => projectUndo(), shortcut: 'Ctrl+Z' }
        : { label: 'Undo', icon: icon('undo'), action: () => undoAny(), shortcut: 'Ctrl+Z', disabled: () => !docEditor(S.active) },
      redoesProject()
        ? { label: `Redo ${history.redoLabel()}`, icon: icon('redo'), action: () => projectRedo(), shortcut: 'Ctrl+Y' }
        : { label: 'Redo', icon: icon('redo'), action: () => redoAny(), shortcut: 'Ctrl+Y', disabled: () => !docEditor(S.active) },
      '-',
      { label: 'Find…', icon: icon('find'), action: () => S.active?.editor?.exec('findPersistent'), shortcut: 'Ctrl+F', disabled: () => !S.active?.editor },
      { label: 'Replace…', action: () => S.active?.editor?.exec('replace'), disabled: () => !S.active?.editor },
      { label: 'Go to Line…', action: () => S.active?.editor?.exec('jumpToLine'), shortcut: 'Ctrl+G', disabled: () => !S.active?.editor },
      '-',
      { label: 'Language Templates', submenu: [...(SNIPPETS[S.active?.lang] || SNIPPETS.vhdl)].map(s => ({ label: s.name, action: () => S.active?.editor?.insertText(s.text), disabled: () => !S.active?.editor })) },
      '-',
      { label: 'Design Checks (Lint Warnings)', checked: lintEnabled(), action: () => { setLintEnabled(!lintEnabled()); toast(lintEnabled() ? 'Design checks on: Check Syntax and the editor show the lint warnings' : 'Design checks off: only errors are shown'); for (const d of S.docs) d.liveCheck?.(); } },
    ] },
    { label: 'View', items: () => [
      { label: 'Implementation', checked: S.view === 'impl', action: () => setView('impl') },
      { label: 'Simulation', checked: S.view === 'sim', action: () => setView('sim') },
      '-',
      { label: 'Design Summary', icon: icon('summary'), action: () => openSummary(), disabled: hasPj },
      '-',
      { label: 'Language', submenu: Object.entries(LOCALES).map(([id, l]) => ({ label: l.name, checked: getLanguage() === id, action: () => setLanguage(id) })) },
      { label: 'Interface', submenu: [
        { label: 'Modern', checked: getInterface() === 'modern', action: () => setInterface('modern') },
        { label: 'Xilinx ISE (Classic)', checked: getInterface() === 'classic', action: () => setInterface('classic') },
      ] },
      // the classic ISE look is light only
      getInterface() === 'modern' ? { label: 'Theme', submenu: [
        { label: 'System', checked: getTheme() === 'system', action: () => setTheme('system') },
        { label: 'Light', checked: getTheme() === 'light', action: () => setTheme('light') },
        { label: 'Dark', checked: getTheme() === 'dark', action: () => setTheme('dark') },
      ] } : null,
      '-',
      { label: 'Command Palette…', action: () => showPalette(), shortcut: 'Ctrl+K' },
    ].filter(Boolean) },
    { label: 'Project', items: () => [
      { label: 'New Source…', action: () => wiz.newSourceWizard(), disabled: hasPj },
      { label: 'Add Copy of Source…', action: () => wiz.addSourceDialog(), disabled: hasPj },
      '-',
      // the implementation top (the Simulation view has none: Simulate runs the selected module)
      S.view === 'sim' ? null : { label: 'Set as Top Module', action: () => (S.sel?.module ? setTop(S.sel.module, false) : viewSel() && setViewAsTop(viewSel())),
        disabled: () => (S.sel?.module ? S.sel.module === S.project?.top : !viewSel() || (topOfView(viewSel()) && topOfView(viewSel()) === S.project?.top)) },
      { label: 'Design Properties…', action: () => wiz.projectProperties(), disabled: hasPj },
      api.standalone ? null : { label: 'Sync with .xise', action: () => api.syncXise(S.project.name, 'export').then(() => toast('Exported .xise', 'ok')).catch(e => alertDlg('Sync with .xise', e.message, 'error')), disabled: hasPj },
    ] },
    { label: 'Process', items: () => [
      { label: 'Implement Top Module', icon: icon('run'), action: () => S.project?.top && runImpl(S.project.top, ['synth', 'translate', 'map', 'par', 'bitgen']), disabled: () => !S.project?.top || S.busy },
      { label: 'Stop', icon: icon('stop'), action: () => stopProcesses(), disabled: () => !S.currentJob },
      { label: 'Run', action: () => S.selProc && runProcess(S.selProc), disabled: () => !S.selProc?.run },
      { label: 'Check Syntax', action: () => S.sel?.module && checkSyntax(S.sel.module, S.view === 'sim'), disabled: () => !S.sel?.module },
      { label: 'Simulate Behavioral Model', icon: icon('wave'), action: () => S.sel?.module && runSimulation(S.sel.module), disabled: () => !S.sel?.module },
    ] },
    { label: 'Tools', items: () => [
      { label: 'ASM State Machine Editor…', icon: icon('asm'), action: () => wiz.newSourceWizard({ type: 'asm' }), disabled: hasPj },
      { label: 'Truth Table / Karnaugh Map…', icon: icon('truthtable'), action: () => wiz.newSourceWizard({ type: 'tt' }), disabled: hasPj },
      { label: 'FSM State Diagram Editor…', icon: icon('fsm'), action: () => wiz.newSourceWizard({ type: 'fsm' }), disabled: hasPj },
      { label: 'Petri Net Editor…', icon: icon('petri'), action: () => wiz.newSourceWizard({ type: 'petri' }), disabled: hasPj },
      { label: 'I/O Pin Planning', icon: icon('pins'), action: () => openPinPlanner(S.sel?.module), disabled: hasPj },
      { label: 'iMPACT (Configure Target Device)', icon: icon('impact'), action: () => openImpact() },
      { label: 'Board Emulator', icon: icon('board'), action: () => openEmulator(S.project.top), disabled: hasPj },
      { label: 'RTL Schematic', icon: icon('schematic'), action: () => S.sel?.module && openSchematic(S.sel.module), disabled: () => !S.sel?.module },
      { label: 'Implemented Design (FPGA View)', icon: icon('chip'), action: () => openFpgaView(), disabled: () => !S.project?.top },
      '-',
      { label: 'Toolchain Settings (ISE / Programmers)…', icon: icon('gear'), action: () => wiz.toolchainDialog() },
    ] },
    { label: 'Window', items: () => [
      ...S.docs.map(d => ({ label: d.title, checked: d === S.active, action: () => activateDoc(d) })),
      S.docs.length ? '-' : null,
      { label: 'Close All Documents', action: () => [...S.docs].forEach(closeDoc), disabled: () => !S.docs.length },
    ].filter(Boolean) },
    { label: 'Help', items: () => [
      { label: 'About Silinx ISE', icon: icon('help'), action: () => wiz.aboutDialog() },
      { label: 'Keyboard Shortcuts', action: () => wiz.shortcutsDialog() },
      '-',
      { label: 'Check for Updates…', action: () => wiz.checkUpdatesDialog() },
      '-',
      { label: 'Tell Us Who You Are…', action: () => wiz.whoAreYou() },
    ] },
  ]);
}

function setupToolbar() {
  const tb = $('toolbar');
  const btn = (ico, title, fn, enabled = () => true) => {
    const b = h('button', { class: 'tb-btn', title, 'data-cmd': ico, html: icons[ico], onclick: () => enabled() && runAction(title, fn) });
    b.dataset.enabled = '1';
    b._enabled = enabled;
    return b;
  };
  tb.append(
    btn('newProject', 'New Project', () => wiz.newProjectWizard()),
    btn('open', 'Open Project', () => wiz.openProjectDialog()),
    h('div', { class: 'tb-sep' }),
    btn('undo', 'Undo', () => undoAny()),   // as Edit ▸ Undo
    btn('redo', 'Redo', () => redoAny()),   // as Edit ▸ Redo
    h('div', { class: 'tb-sep' }),
    btn('cut', 'Cut', () => document.execCommand('cut')),
    btn('copy', 'Copy', () => document.execCommand('copy')),
    btn('paste', 'Paste', () => navigator.clipboard?.readText().then(t => S.active?.editor?.replaceSelection(t))),
    btn('find', 'Find', () => S.active?.editor?.exec('findPersistent')),
    h('div', { class: 'tb-sep' }),
    btn('summary', 'Design Summary', () => S.project && openSummary()),
    btn('schematic', 'View RTL Schematic', () => S.sel?.module && openSchematic(S.sel.module)),
    btn('pins', 'I/O Pin Planning', () => S.project && openPinPlanner(S.sel?.module)),
    btn('asm', 'New ASM State Diagram', () => S.project && wiz.newSourceWizard({ type: 'asm' })),
    h('div', { class: 'tb-sep' }),
    btn('run', 'Implement Top Module', () => S.project?.top && !S.busy && runImpl(S.project.top, ['synth', 'translate', 'map', 'par', 'bitgen'])),
    btn('stop', 'Stop the running process', () => stopProcesses()),
    btn('wave', 'Simulate Behavioral Model', () => S.sel?.module && runSimulation(S.sel.module)),
    btn('impact', 'Configure Target Device (iMPACT)', () => openImpact()),
    h('div', { class: 'tb-sep' }),
    btn('gear', 'Toolchain Settings', () => wiz.toolchainDialog()),
    btn('help', 'About', () => wiz.aboutDialog()),
  );
  // the modern interface: the main steps of the design flow as labelled buttons
  const step = (ico, label, title, fn, enabled) => {
    const b = h('button', { class: 'm-step', title, onclick: () => enabled() && fn() }, h('span', { class: 'ico-inline', html: icons[ico] }), h('span', {}, label));
    b._enabled = enabled;
    return b;
  };
  const mod = () => S.sel?.module || (S.view === 'sim' ? null : S.project?.top);
  // only Implement waits for a running implementation (one ISE build at a time); checking,
  // simulating, emulating and programming run in the browser or independently of it
  tb.append(h('div', { class: 'm-steps', role: 'group', 'aria-label': 'Design flow' },
    step('mCheck', 'Check', 'Check Syntax of the selected module', () => checkSyntax(mod(), S.view === 'sim'), () => !!S.project && !!mod()),
    step('mWave', 'Simulate', 'Simulate Behavioral Model of the selected module', () => runSimulation(mod()), () => !!S.project && !!mod()),
    step('mBolt', 'Implement', 'Implement Top Module', async () => await topConfirmed('Implement', 'implements') && runImpl(S.project.top, ['synth', 'translate', 'map', 'par', 'bitgen']), () => !!S.project?.top && !S.busy),
    step('mBoard', 'Emulate', 'Board Emulator', async () => await topConfirmed('Emulate', 'emulates') && openEmulator(S.project.top), () => !!S.project?.top),
    step('mUpload', 'Program', 'Configure Target Device (iMPACT)', () => openImpact(), () => true),
  ));
  refreshSteps();
}

// enable / disable the labelled buttons of the modern toolbar (cheap: run on clicks and changes)
function refreshSteps() {
  for (const b of document.querySelectorAll('#toolbar .m-step')) b.disabled = !b._enabled();
}

// Command palette: every enabled menu command and every project file
function showPalette() {
  const files = S.project ? [...new Set(S.project.files.map(f => f.path))].sort().map(path => ({ path, open: () => openFile(path) })) : [];
  return openPalette({ commands: menuCommands(S.menus), files });
}

// Print the diagram of the active document (ASM chart or schematic)
function printActive() {
  const d = S.active;
  if (d?.asmEditor) d.asmEditor.print();
  else if (d?.fsmEditor) d.fsmEditor.print();
  else if (d?.schEditor) d.schEditor.print(`Schematic ${d.path || ''}`.trim());
}

function downloadUrl(url, filename) {
  const a = h('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
}

// kind 'xilinx': a Xilinx ISE 14.7 project (.xise + sources, opens in ISE);
// kind 'silinx': the whole Silinx project (silinx.json + every file, ASM charts and schematics included)
async function exportProjectZip(kind = 'xilinx') {
  await saveAll();
  const title = kind === 'silinx' ? 'Export Silinx ISE Project' : 'Export Xilinx ISE Project';
  try {
    const { blob, filename, warnings = [] } = await api.exportZip(S.project.name, kind);
    const url = URL.createObjectURL(blob);
    downloadUrl(url, filename);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    log(kind === 'silinx'
      ? `Exported ${filename}: the whole Silinx project (silinx.json + all project files, ${Math.round(blob.size / 1024)} KB).`
      : `Exported ${filename}: Xilinx ISE project ${S.project.name}.xise + its sources (${Math.round(blob.size / 1024)} KB).`, 'ok');
    for (const w of warnings) log(`WARNING: ${w}`, 'warn');
  } catch (e) { alertDlg(title, e.message, 'error'); }
}

function openBundle() {
  const inp = h('input', { type: 'file', accept: '.json' });
  inp.addEventListener('change', async () => {
    const f = inp.files[0];
    if (!f) return;
    try { const name = await api.importBundle(await f.text()); await openProject(name); showLeftPage('design'); }
    catch (e) { alertDlg('Open Project Bundle', e.message, 'error'); }
  });
  inp.click();
}

// ------------------------------------------------------------------ browser edition: where projects are kept
// the browser's storage, or a workspace folder on the disk (Chrome / Edge: File System Access API)
function storageMenuItems() {
  const st = api.storage();
  return [
    { label: 'Open Workspace Folder…', icon: icon('open'), action: () => openWorkspaceFolder(), disabled: !st.supported, title: st.supported ? null : st.unsupportedReason },
    st.kind !== 'folder' && st.remembered && st.supported ? { label: `Reopen ${st.remembered}`, action: () => reopenWorkspaceFolder() } : null,
    st.kind === 'folder' ? { label: 'Copy Browser Projects to the Folder', action: () => copyBrowserProjects() } : null,
    st.kind === 'folder' ? { label: 'Use Browser Storage', action: () => useBrowserStorage() } : null,
    '-',
  ].filter(Boolean);
}
const storageLine = st => (st.kind === 'folder'
  ? `Projects are now kept in the folder '${st.folder}' on the disk: each project is a folder in the format of the full Silinx application.`
  : 'Projects are now kept in this browser\'s storage.');
function updateStorageStatus() {
  const el = $('status-storage');
  if (!el || !api.standalone) return;
  const st = api.storage();
  el.textContent = st.kind === 'folder' ? `Storage: folder ${st.folder}` : 'Storage: this browser';
  el.title = st.kind === 'folder' ? 'Projects are kept in a folder on the disk (File > Use Browser Storage to go back)' : 'Projects are kept in the browser\'s storage (File > Open Workspace Folder… keeps them in a folder on the disk)';
}
// the open project belongs to the storage left: closed first
async function switchStorage(what, fn) {
  if (blockedByRun(what)) return;
  if (S.project) { await closeProject(); if (S.project) return; }
  let st;
  try { st = await fn(); } catch (e) { alertDlg(what, e.message, 'error'); return; }
  if (!st) return;   // the folder picker was cancelled
  log(storageLine(st), 'ok');
  updateStorageStatus();
  showLeftPage('start');
}
const openWorkspaceFolder = () => switchStorage('Open Workspace Folder', () => api.openWorkspaceFolder());
const reopenWorkspaceFolder = () => switchStorage('Open Workspace Folder', () => api.reopenWorkspaceFolder());
const useBrowserStorage = () => switchStorage('Use Browser Storage', () => api.useBrowserStorage());
async function copyBrowserProjects() {
  const what = 'Copy Browser Projects to the Folder';
  let r;
  try { r = await api.copyBrowserProjectsToFolder(); } catch (e) { alertDlg(what, e.message, 'error'); return; }
  const folder = api.storage().folder;
  log(r.copied.length ? `Copied ${r.copied.length} project(s) from the browser's storage into the folder '${folder}': ${r.copied.join(', ')}.`
    : `No project copied into the folder '${folder}'.`, r.copied.length ? 'ok' : 'info');
  for (const n of r.skipped) log(`WARNING: project '${n}' was not copied: the folder '${folder}' already has a project of that name.`, 'warn');
  if (!document.querySelector('.left-page[data-page=start]').hidden) renderStartPage();
}

// the Simulation view with module `mod` selected (e.g. a test bench just created): Simulate runs it
export function showInSim(mod) {
  setView('sim');
  const row = document.querySelector(`#hier [data-key="${CSS.escape(`m:${mod}`)}"]`);
  if (row) row.dispatchEvent(new MouseEvent('click'));
}

function setView(v) {
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
  $('console-clear').addEventListener('click', () => { $('console-log').innerHTML = ''; S.diags = []; lastConsoleDiag = null; renderDiagnostics(); });
  // modern interface: header search / theme / project, keyboard access to the activity bar
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  for (const k of [$('palette-kbd'), ...document.querySelectorAll('.pal-key')]) k.textContent = mac ? '⌘ K' : 'Ctrl K';
  $('palette-btn').addEventListener('click', () => showPalette());
  $('theme-btn').addEventListener('click', () => toggleTheme());
  $('title-project').addEventListener('click', () => wiz.openProjectDialog());
  document.querySelectorAll('#left-tabs .tab').forEach(t => t.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t.click(); } }));
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
  // always check for updates at start-up (a newer release opens the update dialog); not awaited
  if (!window.SILINX_NO_UPDATE_CHECK) wiz.checkUpdatesOnStart().catch(() => {});
}

export const app = { showInSim, saveAll, openTt, openFsm, openPetri, openSch, stepTracker, projectBoard, regenerateUcf, openFile, openAsm, openProject, reloadProject, closeProject, openDoc, log, setDiagnostics, compileProject, renderHierarchy, renderProcesses, saveProjectJson, setTop, openSummary, showLeftPage, setDirty, findDoc, closeDoc, runSimulation, openPinPlanner, openImpact, followJob, logLine, openMode, S };
window.SilinxApp = app;
// a promise nobody waits for that fails (a menu's action, the start-up's project): said in the
// Console and the Errors tab, not lost (#408); the browser's console keeps its stack
window.addEventListener('unhandledrejection', e => log(`ERROR: ${e.reason?.message || e.reason}`, 'err'));
boot();
