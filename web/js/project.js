// Project lifecycle (open, close, reload a project, in call order), the recent projects, the Start page and
// where the browser edition keeps the projects (#405: out of app.js).
import { api } from './api.js';
import { icon } from './icons.js';
import { h, alertDlg, toast } from './ui.js';
import * as wiz from './wizards.js';
import { PRODUCT, VERSION_LABEL } from '/core/version.js';
import { S, closeAllDocs, compileProject, renderFilesPage, renderLibsPage, showLeftPage, fixMissingTops,
  restoreViewState, openSummary } from './app.js';
import { log, renderDiagnostics } from './console.js';
import { drawingsAsBase, adoptDrawnHdl, drawnHdlClashes } from './drawings.js';
import { renderProcesses, restoreImplStatus, reservedNameDiags } from './processes.js';
import { projectSaved, renderHierarchy } from './design.js';
import { prefKey } from './prefs.js';

const $ = id => document.getElementById(id);
// how long after a project opens the browser edition fetches what Implement needs (#967): after the opening's own work
const prepareDelay = () => globalThis.SILINX_PREPARE_DELAY ?? 2000;

// per-project UI state (cleared when another project is opened or the project is closed)
function resetProjectState() {
  S.diagsCleared++;   // (the start-up checks' lines coming later: not in the tabs, #339)
  S.status = {}; S.sel = null; S.selKey = null; S.selProc = null; S.diags = []; S.outOfSync = {}; S.staleHdl = {}; S.staleSeen = new Map(); S.ucfText = null; S.hdlClash = {}; S.hdlClashWarned = new Set();
  renderDiagnostics();
  renderProcesses();   // (not the last project's processes and states, until a state of this one is restored: #1162)
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
/** Opens a project (startup: the last one reopened at start-up, where the user was, #1191). */
export function openProject(name, { startup = false } = {}) { return inOrder(() => openProjectNow(name, { startup })); }
export function closeProject() { return inOrder(closeProjectNow); }

async function openProjectNow(name, { startup = false } = {}) {
  if (blockedByRun('Open Project')) return;
  if (!await closeAllDocs()) return;   // (the documents of the project left are kept as they were)
  resetProjectState();
  try {
    S.project = await api.project(name);
  } catch (e) { alertDlg('Open Project', e.message, 'error'); return; }
  try { localStorage.setItem(prefKey('silinx.lastProject'), name); } catch { /* ignore */ }
  rememberRecent(name);
  await reloadProject();
  await fixMissingTops();   // (a project saved with a top it no longer has, #253)
  log(`Project "${name}" opened (${S.project.device.part}${S.project.device.speed}-${S.project.device.package}).`, 'info');
  warnReservedNames();
  // the processes' status of the last run, its synthesis up to date or not (#280), restored before the project is
  // used: not awaited, it drew the Processes panel again under a double-click on a process and Implement Design
  // then did not start, or synthesized again (#346)
  await restoreImplStatus();
  // the browser edition: what Implement needs, downloaded now in the background, kept by the browser (#967)
  if (api.standalone) setTimeout(() => S.project?.name === name && import('./open-flow-browser.js').then(m => m.prepareBrowserFlow(S.project.device)).catch(() => {}), prepareDelay());
  // where the user was in this project; the Design Summary the first time (its documents reopened out of sight: the
  // work area shown once they are in place, at start-up once its task is back too, web/js/app.js, #1339)
  document.documentElement.dataset.restoring = '';
  try { if (!await restoreViewState(name)) openSummary({ background: true }); } finally { if (!startup) delete document.documentElement.dataset.restoring; }
  // (said once its documents are in place, the tasks they brought to the front followed (a tick later): the Tasks
  // layout opens it in Design, #1171; before the opening ends, not over what is opened right after it; not when it is
  // reopened at start-up, where the user was, #1191)
  if (startup) return;
  await new Promise(r => setTimeout(r, 0));
  if (S.project?.name === name) dispatchEvent(new CustomEvent('silinx:project-opened', { detail: name }));
}

// The modules named with a reserved word of VHDL or Verilog (#679), said when the project is opened
function warnReservedNames() {
  for (const d of reservedNameDiags()) log(`WARNING:${d.tool} - "${d.file}" Line ${d.line}: ${d.message}`, 'warn');
}

// Reloads run one after the other, in call order: two reloads close together (e.g. Remove from
// Project then Undo) could otherwise finish out of order and leave the older state on screen.
export function reloadProject(render = true) {
  const run = () => reloadProjectNow(render);
  S.reloadChain = (S.reloadChain || Promise.resolve()).then(run, run);
  return S.reloadChain;
}

// The project once the reloads asked so far are done: a dialog applies its choices to it, not to the project it read
// on opening, which a reload may have replaced meanwhile (#2281).
export async function currentProject() {
  let c;
  do { c = S.reloadChain; await c; } while (c !== S.reloadChain);
  return S.project;
}

async function reloadProjectNow(render = true, depth = 0) {
  if (!S.project) return null;
  // (the saves asked before it on the server first: read before, an older project would replace S.project, #2281)
  await projectSaved();
  const pj = await api.project(S.project.name);
  // the files on disk; the project ignores the ones removed from it (project.excluded, unregistered HDL)
  S.diskTree = pj.fileTree || [];
  const out = new Set(pj.excluded || []);
  const hdlIn = new Set((pj.files || []).map(f => f.path));
  S.fileTree = S.diskTree.filter(f => !out.has(f) && (!/\.(vhdl?|v|sv)$/i.test(f) || hdlIn.has(f)));
  delete pj.fileTree;
  S.project = pj;
  S.sources = await api.sources(pj.name);
  // schematics (.sch.json) and ASM charts (.asm.json) linked to an HDL file ("views" kept in sync); the maps made first
  // and set together, never empty while the drawings are read (#1543)
  const schOwners = {}, hdlToSch = {}, viewModule = {}, viewTexts = {};
  for (const f of S.fileTree.filter(f => /\.(sch|asm|tt|bool|fsm|pn)\.json$|\.(c|cpp|cc|cxx)$/.test(f))) {   // (.c: Silinx HLS, its HDL made in memory, #1531; C++ too, #1590)
    try {
      const t = await api.readFile(pj.name, f);
      viewTexts[f] = t;
      const d = JSON.parse(t);
      if (d.generatedFile && S.fileTree.includes(d.generatedFile) && !hdlToSch[d.generatedFile]) { schOwners[f] = d.generatedFile; hdlToSch[d.generatedFile] = f; viewModule[f] = d.name; }
    } catch { /* unreadable */ }
  }
  // (the RTL blackboxes of its C functions, as it opens, #1903)
  const { blackboxesIn } = await import('/core/c-blackbox.js');
  const hls = await blackboxesIn(S.diskTree, f => api.readFile(pj.name, f)).catch(() => null);
  Object.assign(S, { schOwners, hdlToSch, viewModule, viewTexts, hls });
  compileProject();
  // a drawing whose base was its HDL (before #220) is made the base; a drawn source without its HDL
  // file gets it (#207): read the project again with them
  if (depth < 2 && (await drawingsAsBase() || await adoptDrawnHdl())) return reloadProjectNow(render, depth + 1);
  await drawnHdlClashes();
  // the open drawings show their links as they are now (one linked meanwhile, #245)
  for (const d of S.docs) (d.ttEditor || d.fsmEditor || d.petriEditor)?.refreshLink?.();
  // the open HDL editors: read-only when their file is generated from a drawing (#1176)
  for (const d of S.docs) d.applyReadOnly?.();
  // the open simulations: their trees list the project's test benches as they are now (#1364)
  for (const d of S.docs) d.onProject?.();
  updateTitle();
  renderHierarchy();
  renderFilesPage();
  renderLibsPage();
  if (!render) return;
}

async function closeProjectNow() {
  if (blockedByRun('Close Project')) return;
  if (!await closeAllDocs()) return;
  S.project = null; S.lib = null; S.sources = []; S.modules = [];
  resetProjectState();
  try { localStorage.removeItem(prefKey('silinx.lastProject')); } catch { /* ignore */ }
  updateTitle(); renderHierarchy(); renderProcesses(); renderFilesPage(); renderLibsPage();
  showLeftPage('start');
  dispatchEvent(new Event('silinx:project-closed'));   // (the side panel shown again, the Start page in it, #2169)
}

export function updateTitle() {
  const pj = S.project;
  // the header: the project and its document, not the product and version (#987): those are the logo's tooltip, the
  // window's title, Help ▸ About
  $('title-text').textContent = pj ? `${pj.name} - [${S.active?.title || 'Design Summary'}]` : 'Project Navigator';
  document.querySelector('#titlebar .app-logo').title = `${PRODUCT} ${VERSION_LABEL}`;
  document.title = pj ? `${pj.name} — ${PRODUCT} ${VERSION_LABEL}` : `${PRODUCT} ${VERSION_LABEL} Project Navigator`;
  $('status-device').textContent = pj ? `${pj.device.part}${pj.device.speed}-${pj.device.package}${pj.board ? ` · ${pj.board}` : ''}` : '';
}

function rememberRecent(name) {
  try {
    const r = JSON.parse(localStorage.getItem(prefKey('silinx.recent')) || '[]').filter(x => x !== name);
    r.unshift(name);
    localStorage.setItem(prefKey('silinx.recent'), JSON.stringify(r.slice(0, 8)));
    // (when each project was last opened, for Open Project's order, #1156)
    const o = opened();
    o[name] = Date.now();
    localStorage.setItem(prefKey('silinx.opened'), JSON.stringify(o));
  } catch { /* ignore */ }
}
/** When each project was last opened in this browser: { name: ms } (#1156). */
export function opened() { try { const o = JSON.parse(localStorage.getItem(prefKey('silinx.opened')) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return {}; } }
export function recent() { try { return JSON.parse(localStorage.getItem(prefKey('silinx.recent')) || '[]'); } catch { return []; } }
// File ▸ Recent Projects ▸ Clear Recent Projects, and the Start page link: forget the list (the projects stay)
export function clearRecent() {
  try { localStorage.removeItem(prefKey('silinx.recent')); } catch { /* ignore */ }
  if (!document.querySelector('.left-page[data-page=start]').hidden) renderStartPage();
  toast('Recent projects cleared (the projects themselves are kept)', 'ok');
}

// ------------------------------------------------------------------ the Start page
let startRenders = 0;
export async function renderStartPage() {
  const host = $('start-page');
  const n = ++startRenders;
  const projects = await api.projects().catch(() => []);
  const recentHere = recent().filter(r => projects.some(p => p.name === r));
  // (an export: the open project's, disabled with none; menus.js loaded when used)
  // (the page is the same whether a project is open or not, so that a late drawing keeps it, #494, #1222: an export
  // disabled with none by the host's data-project, web/css/app.css)
  const exportZip = kind => () => S.project && import('./menus.js').then(m => m.exportProjectZip(kind));
  const command = ([l, ic, f, exp]) => h('div', { class: `entry${exp ? ' start-export' : ''}` }, icon(ic), h('a', { onclick: f }, l));
  const page = h('div', { class: 'page' },
    // New Project and Open Project: buttons at the top (#1216)
    h('div', { class: 'start-btns' },
      h('button', { class: 'btn', type: 'button', onclick: () => wiz.newProjectWizard() }, 'New Project…'),
      h('button', { class: 'btn', type: 'button', onclick: () => wiz.openProjectDialog() }, 'Open Project…')),   // (Close Project: under the Design tree, #1309)
    // the Silinx and the Xilinx imports and exports, as the File menu has them, a line between (#1216)
    h('div', { class: 'start-box' }, h('h3', {}, 'Project Commands'),
      ...[['Import Silinx ISE Project (.zip)…', 'open', () => wiz.importSilinxDialog()], ['Export Silinx ISE Project (.zip)…', 'save', exportZip('silinx'), true]].map(command),
      h('hr', { class: 'start-sep' }),
      ...[['Import Xilinx ISE Project (.zip)…', 'open', () => wiz.importXiseDialog()], ['Export Xilinx ISE Project (.zip)…', 'save', exportZip('xilinx'), true]].map(command)),
    // (where the projects are kept above the recent ones, #2029)
    api.standalone ? await storageBox() : await workspaceBox(),
    h('div', { class: 'start-box' }, h('h3', {}, 'Recent Projects'),
      ...(recentHere.map(r => h('div', { class: 'entry' }, icon('project'), h('a', { onclick: () => openProject(r).then(() => showLeftPage('design')) }, r)))),
      projects.length ? null : h('div', { class: 'entry', style: { color: 'var(--grey-6)' } }, 'No projects yet.'),
      recentHere.length ? h('div', { class: 'entry start-clear' }, icon('remove'), h('a', { onclick: () => clearRecent() }, 'Clear Recent Projects')) : null),
  );
  // the last render wins: an earlier one finishing later showed the list as it was (e.g. before a Clear)
  if (n !== startRenders) return;
  if (S.project) host.dataset.project = ''; else delete host.dataset.project;
  // kept when it is the same: a page rebuilt between a press and its release (another close's render
  // finishing late) lost the click on a recent project (#494)
  if (host.firstElementChild?.outerHTML === page.outerHTML) return;
  // replaced, not appended: two renders at once (the page shown again while a project closes) list it once
  host.replaceChildren(page);
}
// the application's Start page: where the projects are kept, the server's workspace folder (information only, #1297)
async function workspaceBox() {
  const folder = (await api.workspace?.().catch(() => null))?.folder;
  return folder ? h('div', { class: 'start-box start-storage' }, h('h3', {}, 'Where Projects Are Kept'),
    h('div', { class: 'entry' }, 'In the workspace folder on the disk:'), h('div', { class: 'entry start-folder', 'data-no-i18n': '' }, folder)) : null;
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

// ------------------------------------------------------------------ where the browser edition keeps the projects
// the browser's storage, or a workspace folder on the disk (Chrome / Edge: File System Access API)
export function storageMenuItems() {
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
export function updateStorageStatus() {
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
