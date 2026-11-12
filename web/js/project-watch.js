// The open project kept as it is on disk (#2843): what another process changes in its folder (the MCP server,
// `silinx mcp`, working in the same workspace) the local server tells (GET /api/projects/:p/events,
// server/project-watch.js), and the page reloads it: the Design pane's rows, the processes' marks, the Design
// Summary, and an open document with no changes of its own in the editor. A document changed in the editor and on
// disk asks which to keep. The page's own writes are not told back to it. The browser edition has no events.
import { api } from './api.js';
import { h, dialog } from './ui.js';
import { log } from './console.js';
import { S, activateDoc, closeDoc, openFile, refreshSummary, setDirty, flushDoc } from './app.js';
import { reloadProject } from './project.js';
import { restoreImplStatus, saveImplStatus } from './processes.js';
import { editsDrawingHere } from './collab-state.js';
import { editorOf } from './collab-drawing.js';

const REPORTS = 'build/reports.json', STATUS = 'build/silinx-status.json';
// (a drawing's document: its path in its id, as app.js's docPath)
const docPath = d => d.path || (/^(file|sch|asm|tt|fsm|pn):/.test(String(d.id || '')) ? String(d.id).replace(/^[a-z]+:/, '') : null);
const wait = ms => new Promise(r => setTimeout(r, ms));

let watching = null;   // { name, ctl }
let chain = Promise.resolve();

/** Listens to the project's changes made outside the page (the local server only), until another is opened. */
export function watchProject(name) {
  stopWatching();
  if (typeof api.events !== 'function') return;
  const ctl = new AbortController();
  watching = { name, ctl };
  listen(name, ctl.signal);
}
export function stopWatching() { watching?.ctl.abort(); watching = null; }

// (the stream broken, the server restarted: listened to again, a little later each time)
async function listen(name, signal) {
  let delay = 1000;
  while (!signal.aborted) {
    try { await api.events(name, ev => { chain = chain.then(() => applyChanges(ev)).catch(e => log(`ERROR: cannot reload what changed on disk: ${e.message}`, 'err')); }, signal); delay = 1000; } catch { /* again below */ }
    if (signal.aborted) return;
    await wait(delay);
    delay = Math.min(delay * 2, 30_000);
  }
}

/** The changes another process made in the open project, shown: { project, changes: [{ path, kind }] } (by: the
 *  owner of a project followed, #3181, whose changes they are). */
export async function applyChanges({ project, changes = [], by = null }) {
  if (!S.project || S.project.name !== project || !changes.length) return;
  if (!by) dispatchEvent(new CustomEvent('silinx:disk-changes', { detail: { project, changes } }));   // (a project shared: read again, #3181)
  let files = changes.filter(c => !c.path.startsWith('build/'));
  // (a project followed: a text file whose open editor shows it live already, #3182, not reloaded nor said again)
  if (by) files = (await Promise.all(files.map(async c => (c.kind === 'changed' && await shownLive(c.path) ? null : c)))).filter(Boolean);
  const run = changes.some(c => c.path === REPORTS);
  if (files.length) {
    log(`${by ? `Changed by ${by}` : 'Changed outside Silinx'}: ${files.map(c => `${c.path}${c.kind === 'changed' ? '' : ` (${c.kind})`}`).join(', ')}.`, 'info');
    for (const c of files) for (const d of S.docs.filter(o => docPath(o) === c.path)) await reloadDoc(d, c, by);
    await reloadProject();
  }
  if (by) return;   // (a project followed: its runs are its owner's, not shared)
  if (S.busy || S.currentJob) return;   // (a run of the page's own: its marks are its own)
  if (files.length || run || changes.some(c => c.path === STATUS)) {
    // a run made outside the page: its marks from its summary, kept for the next opening
    await restoreImplStatus({ fromReports: run });
    if (run) { log('A run made outside Silinx: the processes\' marks and the Design Summary updated.', 'info'); await saveImplStatus(); }
  }
  if (run) refreshSummary();
}

// whether an open text editor of `path` shows its file's text already (a drawing an editor's link edits: bound live to
// its structure, #3183)
async function shownLive(path) {
  if (editsDrawingHere(path) && S.docs.some(o => docPath(o) === path && editorOf(o))) return true;
  const d = S.docs.find(o => docPath(o) === path && o.editor);
  if (!d) return false;
  try { return d.editor.getValue() === await api.readFile(S.project.name, path); } catch { return false; }
}

// an open document whose file changed on disk: reloaded, or the user asked when it has changes of its own
async function reloadDoc(d, { path, kind }, by = null) {
  const gone = kind === 'deleted';
  let text = null;
  if (!gone) { try { text = await api.readFile(S.project.name, path); } catch { return; } }
  if (d.editor && !gone && d.editor.getValue() === text) { if (d.dirty) { d.editor.markClean(); setDirty(d, false); } return; }
  if (d.dirty || d._saving) {
    // (not saved over the disk's while the user chooses)
    clearTimeout(d._autosave);
    const save = d.save;
    d.save = null;
    let keep;
    try { keep = await askKeep(path, gone); } finally { d.save = save; }
    if (keep) { log(`${path}: the editor's version kept${gone ? ', written again' : ', written over the disk\'s'}.`, 'warn'); await flushDoc(d); return; }
    d.dirty = false;
  }
  if (gone) { log(by ? `${path} was deleted by ${by}: closed.` : `${path} was deleted outside Silinx: closed.`, 'warn'); await closeDoc(d); return; }
  if (d.editor) {
    d.editor.setValue(text);
    d.editor.markClean();
    setDirty(d, false);
    d.liveCheck?.();
  } else {
    // a drawing: opened again from its file, where it was among the documents
    const front = S.active === d ? null : S.active;
    await closeDoc(d);
    await openFile(path);
    if (front && S.docs.includes(front)) activateDoc(front);
  }
  log(by ? `${path} reloaded: changed by ${by}.` : `${path} reloaded: changed outside Silinx.`, 'info');
}

/** Changed in the editor and on disk (deleted there): true, keep the editor's (closed: kept too, the user's work). */
async function askKeep(path, gone) {
  const v = await dialog({
    title: 'File Changed on Disk',
    className: 'disk-change-dlg',
    body: h('div', {},
      h('p', {}, h('code', { 'data-no-i18n': '' }, path)),
      h('p', {}, gone ? 'This file was deleted outside Silinx, and it has changes in the editor not saved yet.'
        : 'This file was changed outside Silinx, and it has changes in the editor not saved yet.'),
      h('p', {}, 'Which version do you keep?')),
    buttons: [
      { label: 'Keep the Editor\'s', value: 'editor', primary: true },
      { label: gone ? 'Close It' : 'Load from Disk', value: 'disk' },
    ],
  });
  return v !== 'disk';
}
