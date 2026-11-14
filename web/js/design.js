// The Design pane (#405: out of app.js): the hierarchy of the sources in the Implementation or Simulation view, its
// selection and keys, the context menus of the project, its modules and its files, Set as Top Module, removing a
// source, and saving the project's settings (silinx.json) one save at a time.
import { api } from './api.js';
import { icon } from './icons.js';
import { h, alertDlg, confirmDlg, dialog, popupMenu, toast, longPressMenu } from './ui.js';
import * as wiz from './wizards.js';
import { drawnModule } from '/core/view-hdl.js';
import { S, addToProject, closeDoc, fixMissingTops, instancesOf, moduleInfo, openFile, projectUndo, syncFpgaView,
  viewRoots } from './app.js';
import { log } from './console.js';
import { closeProject, reloadProject } from './project.js';
import { checkUcfFile } from './implement.js';
import { asmContextMenu, clashTip, convertToAsm, convertToFsm, convertToSchematic, fsmContextMenu, openAsm, openFsm,
  isPn, isTt, openPetri, openPetriFsm, openSch, openTt, openTtSchematic, openView, petriContextMenu, resolveHdlClash, schContextMenu, drawingCommands,
  ttContextMenu, viewBadge, viewContextMenu, viewIcon, viewKind, viewNoun } from './drawings.js';
import { checkFileSyntax, checkSyntax, markStale, renderProcesses, saveAll } from './processes.js';
import { openSchematic, runSimulation } from './viewers.js';
import { renameDialog } from './rename.js';
import { openWizardModule, wizardLabelOf } from './wizard-modules.js';
import { cBadge, cBadges, cSequential, isC } from './c-source.js';
import { translationBadge } from './translation.js';
import { gitMark, gitMenuItems, gitStartItems, hasGit } from './git.js';
import { checkLabel, designOnly, shownFiles, withoutHdlBadges } from './design-only.js';
import { firstThenNatural, naturalCompare } from '/core/natural-order.js';

const $ = id => document.getElementById(id);
// the Tasks interface (#799): one tree, no views: the design (as the Implementation view shows it); the test
// benches Simulate's (its Simulation, #1161); no constraints in any interface (the Files page and the top
// module's User Constraints processes have them, #1250)
const oneTree = () => document.documentElement.dataset.layout === 'tasks';

export function renderHierarchy() {
  const host = $('hier');
  const focused = host.contains(document.activeElement) ? (document.activeElement.closest('.badge') ? 'badge' : 'tree') : null;
  host.innerHTML = '';
  // (no project: its two commands here, the Silinx interface has no File menu, #1585)
  if (!S.project) {
    host.append(h('div', { class: 'tree empty' }, h('div', {}, 'No project open'),
      h('div', { class: 'empty-actions' }, h('a', { href: '#', 'data-act': 'new-project', onclick: e => { e.preventDefault(); wiz.newProjectWizard(); } }, 'New Project…'),
        ' · ', h('a', { href: '#', 'data-act': 'open-project', onclick: e => { e.preventDefault(); wiz.openProjectDialog(); } }, 'Open Project…'))));
    return;
  }
  const pj = S.project;
  const one = oneTree(), sim = S.view === 'sim' && !one;
  const tree = h('ul', { class: 'tree', tabindex: '0', 'aria-label': 'Design hierarchy', onkeydown: treeKeys });
  const dev = `${pj.device.part}${pj.device.speed}-${pj.device.package}`;
  const root = treeItem({ label: pj.name, ico: 'project', open: true, mark: gitMark(S.git ? S.git.files.map(f => f.path) : []), onSelect: () => select({ type: 'project' }), key: 'project', onContext: e => projectContextMenu(e) });
  tree.append(root.li);
  // (a design and simulation project, #3780: no device; its drawings and test benches under Design)
  const devItem = treeItem({ label: designOnly() ? 'Design' : !sim ? dev : 'Behavioral', ico: !sim ? 'chip' : 'sim', open: true, key: 'device', onSelect: () => select({ type: 'device' }), onContext: e => projectContextMenu(e) });
  root.ul.append(devItem.li);

  const lib = S.lib;
  const roots = viewRoots(sim);
  const topName = !sim ? pj.top : null;   // the Simulation view has no top: Simulate runs the selected module
  const isTopName = n => !!topName && String(n).toLowerCase() === String(topName).toLowerCase();
  roots.sort(firstThenNatural(topName));   // (the numbers in the names by their value, #3819)
  const addModule = (parentUl, modName, instName, depth, path) => {
    const info = moduleInfo(modName);
    const isTop = !instName && isTopName(modName);   // (the root's row only: the top's instances are plain rows, #2877)
    const file = info?.file || '?';
    // "label - module" like ISE; just the name when the instance is labelled with the module name
    const label = instName && instName.toLowerCase() !== String(modName).toLowerCase() ? `${instName} - ${modName}` : modName;
    // a drawn source without an HDL file (#177): the module is the drawing itself
    const drawn = info && /\.(sch|asm|tt|bool|fsm|pn)\.json$/.test(file) ? file : null;
    const sch = drawn || (info && viewOfModule(info.name, file));
    // an HDL module a wizard wrote from its settings (#793): the wizard is its base, the HDL generated from it
    const wz = !sch && info ? wizardLabelOf(file) : null;
    // one row per module: its base's icon (the drawing's when it has one: its HDL is generated from it),
    // then a badge for each of its views: the drawing's first (the base's, marked), its HDL's last, named
    // by the file's language (#207, #220); a truth table's schematic, generated from it, in between (#694)
    // a C source (#1531): the C the base, its HDL generated from it; an HDL file in the other language: the preferred
    // language's badge after its own, the file translated, read-only (#2693)
    const cSrc = info && isC(file) ? file : null;
    // the row's menu, the same on its name and on every badge (#2872): the module's, or a drawing's own (one with no
    // HDL file)
    const rowMenu = e => (drawn ? viewContextMenu(e, drawn) : moduleContextMenu(e, modName, file));
    const badges = !info ? [] : cSrc ? cBadges(cSrc, info.lang, rowMenu) : [
      sch ? { text: viewBadge(sch), base: true, title: drawn ? 'Open' : 'Base: its HDL is generated from it', open: () => openView(sch), context: rowMenu } : null,
      isTt(sch) ? { text: 'Schematic', title: 'Generated from the Boolean algebra, in its HDL logic form', open: () => openTtSchematic(sch), context: rowMenu } : null,
      isPn(sch) ? { text: 'FSM', title: 'The state machine of the Petri net: its state space (read-only)', open: () => openPetriFsm(sch), context: rowMenu } : null,   // (#2696)
      wz ? { text: wz, base: true, title: 'Base: its HDL is generated by the wizard', open: () => openWizardModule(file), context: rowMenu } : null,
      drawn ? null : { text: info.lang === 'vhdl' ? 'VHDL' : 'Verilog', base: !sch && !wz, title: sch ? `Generated from the ${viewNoun(sch)}` : wz ? `Generated by the ${wz}` : 'Open', open: () => openFile(file, info.line), context: rowMenu },
      drawn || sch || wz ? null : translationBadge(file, rowMenu),
      drawn ? clashBadge(drawn) : null,
    ].filter(Boolean);
    badges.splice(0, badges.length, ...withoutHdlBadges(badges));   // (no HDL in a design project, #3780)
    const it = treeItem({
      label, meta: info ? `(${(sch || file).split('/').pop()})` : '(missing)', ico: isTop ? 'moduleTop' : sch ? viewIcon(sch) : cSrc ? 'file' : info ? (info.lang === 'vhdl' ? 'vhdl' : 'verilog') : 'err',
      cls: isTop ? 'top-mod' : '', key: `m:${path}`, open: depth < 2, badges, module: modName, mark: info ? gitMark([sch, file]) : null,
      onSelect: () => select(drawn ? { type: viewKind(drawn), file: drawn, module: modName, path, instName } : { type: 'module', module: modName, file, path, instName, sch, wizard: wz }),
      // (a design project's test bench, its HDL hidden: simulated, #3780)
      onOpen: () => info && (sch ? openView(sch) : wz ? openWizardModule(file) : designOnly() ? runSimulation(modName) : openFile(file, info.line)),
      onContext: rowMenu,
    });
    parentUl.append(it.li);
    if (info && depth < 30) {
      const kids = instancesOf(info.mod);
      if (!kids.length) it.setLeaf();
      for (const k of kids) addModule(it.ul, k.module, k.name, depth + 1, `${path}/${k.name}`);
    } else it.setLeaf();
  };
  for (const r of roots) addModule(devItem.ul, r, null, 0, r);

  // packages, ASM charts and other files
  for (const p of lib.packages.values()) {
    const fi = S.project.files.find(f => f.path === p.file);
    if (!inView(fi?.role, sim)) continue;
    const it = treeItem({ label: p.name, meta: `(${p.file.split('/').pop()})`, ico: 'vhdl', key: `pkg:${p.name}`, onSelect: () => select({ type: 'file', file: p.file }), onOpen: () => openFile(p.file, p.loc?.line), onContext: e => fileContextMenu(e, p.file) });
    it.setLeaf(); devItem.ul.append(it.li);
  }
  for (const f of (S.fileTree || []).filter(f => /\.sch\.json$/.test(f) && !S.schOwners?.[f] && !S.modules.some(m => m.file === f))) {
    const owned = null;
    const it = treeItem({ label: f.split('/').pop(), meta: owned ? `(→ ${owned.split('/').pop()})` : '', ico: 'schematic', key: `sch:${f}`, badges: [clashBadge(f)].filter(Boolean), mark: gitMark([f]), onSelect: () => select({ type: 'sch', file: f }), onOpen: () => openSch(f), onContext: e => schContextMenu(e, f) });
    it.setLeaf(); devItem.ul.append(it.li);
  }
  for (const f of (S.fileTree || []).filter(f => /\.asm\.json$/.test(f) && !S.schOwners?.[f] && !S.modules.some(m => m.file === f))) {
    const it = treeItem({ label: f.split('/').pop(), ico: 'asm', key: `asm:${f}`, badges: [clashBadge(f)].filter(Boolean), mark: gitMark([f]), onSelect: () => select({ type: 'asm', file: f }), onOpen: () => openAsm(f), onContext: e => asmContextMenu(e, f) });
    it.setLeaf(); devItem.ul.append(it.li);
  }
  for (const f of (S.fileTree || []).filter(f => /\.(tt|bool)\.json$/.test(f) && !S.schOwners?.[f] && !S.modules.some(m => m.file === f))) {
    const it = treeItem({ label: f.split('/').pop(), ico: 'algebra', key: `tt:${f}`, badges: [clashBadge(f)].filter(Boolean), mark: gitMark([f]), onSelect: () => select({ type: 'tt', file: f }), onOpen: () => openTt(f), onContext: e => ttContextMenu(e, f) });
    it.setLeaf(); devItem.ul.append(it.li);
  }
  for (const f of (S.fileTree || []).filter(f => /\.fsm\.json$/.test(f) && !S.schOwners?.[f] && !S.modules.some(m => m.file === f))) {
    const it = treeItem({ label: f.split('/').pop(), ico: 'fsm', key: `fsm:${f}`, badges: [clashBadge(f)].filter(Boolean), mark: gitMark([f]), onSelect: () => select({ type: 'fsm', file: f }), onOpen: () => openFsm(f), onContext: e => fsmContextMenu(e, f) });
    it.setLeaf(); devItem.ul.append(it.li);
  }
  for (const f of (S.fileTree || []).filter(f => /\.pn\.json$/.test(f) && !S.schOwners?.[f] && !S.modules.some(m => m.file === f))) {
    const it = treeItem({ label: f.split('/').pop(), ico: 'petri', key: `pn:${f}`, badges: [clashBadge(f)].filter(Boolean), mark: gitMark([f]), onSelect: () => select({ type: 'pn', file: f }), onOpen: () => openPetri(f), onContext: e => petriContextMenu(e, f) });
    it.setLeaf(); devItem.ul.append(it.li);
  }
  // a C source whose HDL cannot be made (#2995: a C error, a blackbox refused): its row, marked, its errors in the Console;
  // [No HDL] opens the first one's file
  for (const [f, c] of Object.entries(S.cFailed || {})) {
    if (S.modules.some(m => m.file === f)) continue;
    const at = c.diagnostics[0], menu = e => fileContextMenu(e, f);
    const it = treeItem({ label: c.module || f.split('/').pop(), meta: `(${f.split('/').pop()})`, ico: 'err', cls: c.module && isTopName(c.module) ? 'top-mod' : '', key: `c:${f}`, mark: gitMark([f]),
      badges: [{ text: cBadge(f), base: true, title: 'Open', open: () => openFile(f), context: menu },
        { text: 'No HDL', warn: true, title: 'Its HDL cannot be made: its errors are in the Console', open: () => openFile(at?.file || f, at?.line), context: menu }],
      onSelect: () => select({ type: 'file', file: f }), onOpen: () => openFile(f), onContext: menu });
    it.setLeaf(); devItem.ul.append(it.li);
  }
  // files that failed to parse into any unit
  const withUnits = new Set(lib.parsed.filter(p => p.units.length).map(p => p.file));
  for (const f of S.project.files.filter(f => !withUnits.has(f.path) && (one || inView(f.role, sim)))) {
    const it = treeItem({ label: f.path.split('/').pop(), meta: '(no units)', ico: f.lang === 'vhdl' ? 'vhdl' : 'verilog', key: `f:${f.path}`, mark: gitMark([f.path]), onSelect: () => select({ type: 'file', file: f.path }), onOpen: () => openFile(f.path), onContext: e => fileContextMenu(e, f.path) });
    it.setLeaf(); devItem.ul.append(it.li);
  }
  // a module defined again in another file (#1303): the library uses the last one ("module … redefined", a warning); the
  // other file's row kept, marked, so that the clash is seen and its source opened
  for (const p of lib.parsed) for (const u of p.units) {
    const used = u.kind === 'module' && !u.entityOnly ? lib.modules.get(u.name) : null;
    if (!used || used === u || used.file === p.file) continue;
    const f = S.project.files.find(x => x.path === p.file);
    if (!f || !(one || inView(f.role, sim))) continue;
    const drawn = S.hdlToSch?.[p.file];
    const it = treeItem({ label: u.name, meta: `(${(drawn || p.file).split('/').pop()}, redefined in ${used.file.split('/').pop()})`, ico: 'warn', key: `dup:${p.file}:${u.name}`,
      onSelect: () => select({ type: 'file', file: p.file }), onOpen: () => (drawn ? openView(drawn) : openFile(p.file, u.loc?.line)), onContext: e => fileContextMenu(e, p.file) });
    it.setLeaf(); devItem.ul.append(it.li);
  }
  host.append(tree);
  // restore selection (a test bench's: the Test page's tree, #1016)
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
/** A module's badges as its Design row has them ({ text, base }: the drawing's first, a truth table's schematic, a wizard's,
 *  its HDL's last; the base marked): Simulate's tree shows them too (#1316). */
export function moduleBadges(name) {
  const info = moduleInfo(name);
  if (!info) return [];
  const drawn = /\.(sch|asm|tt|bool|fsm|pn)\.json$/.test(info.file) ? info.file : null;
  const sch = drawn || viewOfModule(info.name, info.file);
  const wz = !sch ? wizardLabelOf(info.file) : null;
  if (isC(info.file)) return [{ text: cBadge(info.file), base: true }, ...(cSequential(info.file) ? [{ text: 'ASM' }] : []), { text: info.lang === 'vhdl' ? 'VHDL' : 'Verilog' }];   // (#1531, #1575)
  return withoutHdlBadges([sch ? { text: viewBadge(sch), base: true } : null, isTt(sch) ? { text: 'Schematic' } : null, isPn(sch) ? { text: 'FSM' } : null, wz ? { text: wz, base: true } : null,
    drawn ? null : { text: info.lang === 'vhdl' ? 'VHDL' : 'Verilog', base: !sch && !wz }].filter(Boolean));
}
/** A module's source opened as its Design row's double-click opens it: its drawing, its wizard, else its HDL (SSim's Go
 *  To Source in the Tasks interface, #1385). */
export function openModuleSource(name) {
  const info = moduleInfo(name);
  if (!info) return;
  const drawn = /\.(sch|asm|tt|bool|fsm|pn)\.json$/.test(info.file) ? info.file : null;
  const sch = drawn || viewOfModule(info.name, info.file);
  const wz = !sch ? wizardLabelOf(info.file) : null;
  return sch ? openView(sch) : wz ? openWizardModule(info.file) : openFile(info.file, info.line);
}
function viewOfModule(name, file) {
  const v = S.hdlToSch?.[file];
  if (!v) return null;
  const mods = S.modules.filter(m => m.file === file && m.kind !== 'package').map(m => ({ name: m.name, instances: instancesOf(m.mod).map(i => i.module) }));
  return String(drawnModule(mods, S.viewModule?.[v])).toLowerCase() === String(name).toLowerCase() ? v : null;
}

// badges: the views of a module ({ text, base, title, open, context }), after its name: a click opens
// that view, a right-click shows its commands; the base's is marked. Tab reaches the selected row's badges.
// mark: git's (#3195, web/js/git.js gitMark): M changed, N new, C in conflict since the last commit, at the row's end
export function treeItem({ label, meta, ico, open = false, onSelect, onOpen, onContext, cls = '', key, badges = [], module = null, mark = null }) {
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
  // (a module's row: its module's name, which a link's top= selects, #2871)
  const row = h('div', { class: `row ${cls}`, 'data-key': key, ...(module ? { 'data-module': module } : {}) }, tw, icon(ico), h('span', { class: 'lbl' }, label),
    views.length ? h('span', { class: 'badges' }, views) : null, meta ? h('span', { class: 'meta' }, meta) : null,
    mark ? h('span', { class: `git-mark git-${mark.state}`, title: mark.title }, mark.text) : null);
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

export function select(sel) {
  S.sel = sel;
  renderProcesses();
  syncFpgaView(sel);
}

// Test Bench Wizard (loaded on first use)
export async function testBench(mod) {
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

// Set as Top Module, or on the top module Unset as Top Module (#1220): the project has no top then
export const topMenuItem = (mod, set) => (mod && S.project?.top && mod.toLowerCase() === S.project.top.toLowerCase()
  ? { label: 'Unset as Top Module', action: () => unsetTop() } : { label: 'Set as Top Module', action: set });
export async function unsetTop() {
  const old = S.project?.top;
  if (!old) return;
  S.project.top = '';
  await saveProjectJson();
  markStale();
  renderHierarchy();
  renderProcesses();
  log(`Top-level module '${old}' unset: the project has no top module (Set as Top Module makes one).`, 'info');
}

// the commands of a module's own drawing (its view, not a block of a drawing's HDL), or none
function ownDrawingCommands(mod, file) {
  const v = viewOfModule(mod, file);
  return v ? drawingCommands(v) : [];
}
function moduleContextMenu(e, mod, file) {
  const isSimView = S.view === 'sim';
  popupMenu([
    isSimView ? null : topMenuItem(mod, () => setTop(mod, false)),
    // (what a double-click opens: its drawing, else its HDL, #2872)
    { label: 'Open', action: () => openModuleSource(mod) },
    { label: 'Rename…', action: () => renameDialog(file, mod) },
    { label: checkLabel(), action: () => checkSyntax(mod, isSimView) },
    { label: 'View RTL Schematic', action: () => openSchematic(mod) },
    // (its symbol in the schematics, the Symbol Editor's: its pins' order and sides, #3755)
    { label: 'Edit Symbol', action: () => import('./symbol-doc.js').then(m => m.editSymbol(mod)) },
    // (its equivalence with a reference module, #3177: the Silinx interface's way to it, the ISE style's Processes too)
    { label: 'Verify Equivalence…', action: () => import('./verify.js').then(m => m.verifyProcess(mod)) },
    { label: 'Verify Assertions…', action: () => import('./verify.js').then(m => m.assertProcess(mod)) },
    // (the Tasks interface: its test benches on the Test page, New; not here)
    document.documentElement.dataset.layout === 'tasks' ? null : { label: 'Create Test Bench (Wizard)…', action: () => testBench(mod) },
    // a plain HDL module can be drawn (the drawing then its base); a drawing's module has the drawing's commands
    // (#2872: here, on its name and on every badge alike); a block of a drawing's HDL (#175: its file is the
    // drawing's) neither
    ...(S.hdlToSch?.[file] ? ownDrawingCommands(mod, file) : designOnly() ? [] : [
      { label: 'Convert to Schematic (editable)…', action: () => convertToSchematic(mod) },
      { label: 'Convert to State Machine (ASM)…', action: () => convertToAsm(mod) },
      { label: 'Convert to State Diagram (FSM)…', action: () => convertToFsm(mod) },
    ]),
    isSimView ? { label: 'Simulate Behavioral Model', action: () => runSimulation(mod) } : null,
    // (a schematic's, a state diagram's, a Petri net's or an ASM chart's module: its Try it or simulation, #2826, #2869, #2881)
    // (a copy, or live opening on this module, #3631: chosen in its window, #3698)
    { label: 'Share Module…', action: () => import('./share-how.js').then(m => m.shareDialog({ module: mod, view: /\.(sch|fsm|pn|asm)\.json$/i.test(S.hdlToSch?.[file] || file) ? 'try' : null })) },
    '-',
    { label: 'New Source…', action: () => wiz.newSourceWizard() },
    { label: `${wiz.addSourceTitle()}…`, action: () => wiz.addSourceDialog() },
    { label: 'Remove from Project', action: () => removeModule(file) },
    '-',
    { label: 'Source Properties…', action: () => wiz.sourceProperties(file) },
  ].filter(Boolean), e.clientX, e.clientY);
}
export function fileContextMenu(e, file) {
  if (!S.fileTree.includes(file)) {   // a file of the folder that is not in the project
    popupMenu([
      { label: 'Add to Project', action: () => addToProject(file).then(added => added !== false && log(`${file} added to the project.`, 'ok')) },
      { label: 'Open', action: () => openFile(file) },
      '-',
      { label: 'Delete File…', action: () => deleteFile(file) },
    ], e.clientX, e.clientY);
    return;
  }
  popupMenu([
    { label: 'Open', action: () => openFile(file) },
    { label: 'Rename…', action: () => renameDialog(file) },
    /\.(vhdl?|v|sv|c)$/i.test(file) && !designOnly() ? { label: 'Check Syntax', action: () => checkFileSyntax(file) } : null,   // (.c: Silinx HLS, #1524)
    /\.(ucf|pcf|lpf|cst|xdc)$/i.test(file) ? { label: 'Check Syntax', action: () => checkUcfFile(file) } : null,
    { label: 'Remove from Project', action: () => removeFile(file) },
    { label: 'Delete File…', action: () => deleteFile(file) },
    { label: 'Source Properties…', action: () => wiz.sourceProperties(file), disabled: !S.project.files.some(f => f.path === file) && S.viewTexts?.[file] === undefined },
  ].filter(Boolean), e.clientX, e.clientY);
}
// Delete File…: out of the project if it was in it, and off the project folder (#1215; Remove from Project keeps the
// file in the project folder): into the workspace's .trash, from where it can be moved back (#3364), or, in a browser's
// storage, which has no .trash, deleted for good
async function deleteFile(file) {
  const trash = !api.standalone || api.keepsTrash;
  if (!await confirmDlg('Delete File', trash ? `Delete '${file}'?\n(It is moved to the workspace's .trash folder, from where you can move it back. Remove from Project keeps the file in the project folder.)`
    : `Delete '${file}' from the disk?\n(It cannot be undone: Remove from Project keeps the file in the project folder.)`)) return;
  await saveAll();
  for (const d of [...S.docs]) if (d.path === file || String(d.id || '').endsWith(`:${file}`)) { d.dirty = false; clearTimeout(d._autosave); await closeDoc(d); }
  return serialOp(async () => {
    const pj = S.project;
    pj.files = pj.files.filter(x => x.path !== file);
    if (pj.constraints === file) pj.constraints = '';
    pj.excluded = (pj.excluded || []).filter(f => f !== file);
    await saveProjectJson();
    try {
      const r = await api.deleteFile(pj.name, file, { trash });
      log(r?.trashed ? `${file} deleted (moved to the workspace's .trash folder: ${r.trashed}).` : `${file} deleted.`, 'ok');
    } catch (e) { log(`ERROR: cannot delete ${file}: ${e.message}`, 'err'); }
    await reloadProject();
    await fixMissingTops();
  });
}
/** Add to Project…: the files of the project folder that are not in the project, chosen and added (#1214). */
export async function addFromFolderDialog() {
  if (!S.project) return;
  const listed = new Set(S.fileTree);
  const free = shownFiles((S.diskTree || []).filter(f => !listed.has(f))).sort(naturalCompare);   // (no HDL in a design project, #3780)
  if (!free.length) return alertDlg('Add to Project', 'Every file of the project folder is in the project.');
  const boxes = free.map(f => h('input', { type: 'checkbox', value: f }));
  const r = await dialog({
    title: 'Add to Project', width: 480,
    body: h('div', {}, h('div', { class: 'hint' }, 'The files of the project folder that are not in the project:'),
      h('div', { class: 'add-free-list' }, ...free.map((f, i) => h('label', { style: { display: 'block' } }, boxes[i], ` ${f}`)))),
    buttons: [{ label: 'OK', primary: true, value: true }, { label: 'Cancel', value: null }],
  });
  if (!r) return;
  for (const b of boxes.filter(x => x.checked)) {
    await addToProject(b.value);
    log(`${b.value} added to the project.`, 'ok');
  }
}
function projectContextMenu(e) {
  popupMenu([
    { label: 'New Source…', action: () => wiz.newSourceWizard() },
    { label: `${wiz.addSourceTitle()}…`, action: () => wiz.addSourceDialog() },
    '-',
    { label: 'Design Properties…', action: () => wiz.projectProperties() },
    { label: 'Share Project…', action: () => import('./share-how.js').then(m => m.shareDialog()) },   // (a copy, #2826, or live, #3479: chosen in its window, #3698)
    // (Initialize Repository…, Sign in with GitHub…: where they apply, before the Git submenu that has them too, #3534)
    ...gitStartItems().map(({ label, action }) => ({ label, action })),
    // (git, the server editions: here in both interfaces, the Silinx one having no File menu, #3195)
    hasGit() ? { label: 'Git', submenu: gitMenuItems() } : null,
    '-',
    { label: 'Close Project', action: () => closeProject() },   // (#1300)
  ].filter(Boolean), e.clientX, e.clientY);
}

export async function setTop(mod, sim = S.view === 'sim') {
  if (sim) S.project.simTop = mod; else S.project.top = mod;
  await saveProjectJson();
  markStale();
  renderHierarchy();
  log(`Top-level ${sim ? 'simulation ' : ''}module set to '${mod}'.`, 'info');
}

// project.json saved one save at a time, in the order asked (#593): two saves in flight together (the stimuli
// save at each click) could reach the server in the other order, an older project written last. A save's answer
// replaces S.project only when no later save waits and S.project is still the one sent: the later save sends
// S.project as it is then, and the answer of an earlier one would lose the changes made meanwhile.
let projectSaves = Promise.resolve(), projectSavesWaiting = 0;
export function saveProjectJson() {
  projectSavesWaiting++;
  const run = async () => {
    projectSavesWaiting--;
    const pj = S.project;
    const saved = await api.saveProject(pj.name, pj);
    if (!projectSavesWaiting && S.project === pj) S.project = saved;
  };
  return (projectSaves = projectSaves.then(run, run));
}
/** The saves asked so far done (a reload reads the project after them, #2281). */
export const projectSaved = () => projectSaves;

// Remove from Project: the file stays in the project folder (as in ISE); Undo / Add to Project
// bring it back. HDL files leave the file list; other files (diagrams, tables, UCF) are listed in
// project.excluded so that the project ignores them.
// project-list changes (remove / undo / add) run one at a time: an Undo clicked while the removal
// is still being saved waits for it
export function serialOp(fn) {
  const run = () => fn();
  S.opChain = (S.opChain || Promise.resolve()).then(run, run);
  return S.opChain;
}

export async function removeFile(file) {
  if (!await confirmDlg('Remove Source', `Remove '${file}' from the project?\n(The file stays in the project folder: Undo or Add to Project in the Files view brings it back.)`)) return;
  await saveAll();
  for (const d of [...S.docs]) if (d.path === file || String(d.id || '').endsWith(`:${file}`)) await closeDoc(d);
  return serialOp(() => removeNow(file));
}
// Remove from Project of a module in the Design pane (its row, its badges): a drawing and its HDL file,
// generated from it (#207, #220), leave the project together, one command (one Undo brings both back,
// linked as before, #234). The Files view removes the one file: a drawing's HDL file alone leaves the
// drawing a module by itself ([No HDL], #231); a drawing alone leaves its HDL file a plain HDL module.
export async function removeModule(file) {
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
