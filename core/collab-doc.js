// A shared project as a Yjs document (#3180, #3181): one document per project, no subdocuments.
//   meta     Y.Map   version (this layout's), owner (their name)
//   project  Y.Map   json: silinx.json as the API gives it (its fileTree left out)
//   files    Y.Map   path -> Y.Text: every file of the project's tree, text only (the HDL, the constraints, the test
//                    benches, the C, the drawings' JSON), FILE_MAX at most each; build/ and hidden files never
// The owner's Silinx writes it (publishProject, putFile, ...), a follower's reads it (docProject, docFile). A text is
// changed by its common prefix and suffix kept, so an update carries the edit only (and phase 2's editors, bound to
// the same Y.Text, need no other layout).
import * as Y from 'yjs';

export const LAYOUT_VERSION = 1;
export const FILE_MAX = 1 << 20;
const PATH_MAX = 512;

/** A path a shared project may hold: relative, inside it, not of its build nor hidden (a follower trusts no other). */
export function sharedPath(p) {
  if (typeof p !== 'string' || !p || p.length > PATH_MAX || /[\\\0]/.test(p) || p.startsWith('/') || /^[A-Za-z]:/.test(p)) return false;
  const parts = p.split('/');
  if (parts.some(s => !s || s === '.' || s === '..' || s.startsWith('.'))) return false;
  return parts[0].toLowerCase() !== 'build' && p.toLowerCase() !== 'silinx.json';
}

/** A new document (for the owner, or the copy a follower receives). */
export const projectDoc = () => new Y.Doc();

/** A Y.Text set to `text`, only its changed middle replaced. */
export function setText(yt, text) {
  const old = yt.toString();
  if (old === text) return false;
  let a = 0;
  const n = Math.min(old.length, text.length);
  while (a < n && old.charCodeAt(a) === text.charCodeAt(a)) a++;
  let b = 0;
  while (b < n - a && old.charCodeAt(old.length - 1 - b) === text.charCodeAt(text.length - 1 - b)) b++;
  yt.doc.transact(() => {
    if (old.length - a - b > 0) yt.delete(a, old.length - a - b);
    if (text.length - a - b > 0) yt.insert(a, text.slice(a, text.length - b));
  });
  return true;
}

const shareable = (path, text) => sharedPath(path) && typeof text === 'string' && text.length <= FILE_MAX;

/** The text files an editor may change (#3182, phase 2): HDL, constraints, C / C++ (Silinx HLS), notes; never a
 *  drawing (phase 3, #3183) nor the project's settings. */
export const EDITABLE_RE = /\.(vhd|vhdl|v|vh|sv|ucf|xdc|c|cc|cpp|h|hpp|txt|md)$/i;
export const editablePath = p => sharedPath(p) && EDITABLE_RE.test(String(p));

/** An editor's change of an existing file's text (an error for a file an editor may not change, or too large): what
 *  is deleted in one update, what is inserted in parts of `part` characters at most, each an update of its own, so
 *  that each frame stays as small as a follower's must (core/collab-room.js; a pair of surrogates never split). */
export function editFile(doc, path, text, { part = 8192 } = {}) {
  const yt = doc.getMap('files').get(path);
  if (!editablePath(path) || !(yt instanceof Y.Text)) throw new Error(`${path}: not a text file of the project that an editor can change`);
  if (typeof text !== 'string' || text.length > FILE_MAX) throw new Error(`${path}: too large to share (${FILE_MAX >> 20} MB at most)`);
  const old = yt.toString();
  if (old === text) return false;
  let a = 0;
  const n = Math.min(old.length, text.length);
  while (a < n && old.charCodeAt(a) === text.charCodeAt(a)) a++;
  let b = 0;
  while (b < n - a && old.charCodeAt(old.length - 1 - b) === text.charCodeAt(text.length - 1 - b)) b++;
  // (the common ends not cut in a pair of surrogates)
  if (a > 0 && /[\uD800-\uDBFF]/.test(old[a - 1])) a--;
  if (b > 0 && /[\uDC00-\uDFFF]/.test(old[old.length - b])) b--;
  if (old.length - a - b > 0) doc.transact(() => yt.delete(a, old.length - a - b));
  const mid = text.slice(a, text.length - b);
  for (let i = 0; i < mid.length;) {
    let j = Math.min(mid.length, i + part);
    if (j < mid.length && /[\uD800-\uDBFF]/.test(mid[j - 1])) j--;
    const piece = mid.slice(i, j), at = a + i;
    doc.transact(() => yt.insert(at, piece));
    i = j;
  }
  return true;
}

/** A file's text in the document (a new path added; one that may not be shared, or too large, left out: false). */
export function putFile(doc, path, text) {
  if (!shareable(path, text)) { dropFile(doc, path); return false; }
  const files = doc.getMap('files');
  doc.transact(() => {
    let yt = files.get(path);
    if (!(yt instanceof Y.Text)) { yt = new Y.Text(); files.set(path, yt); }
    setText(yt, text);
  });
  return true;
}
export function dropFile(doc, path) { const files = doc.getMap('files'); if (files.has(path)) files.delete(path); }
export function moveFile(doc, from, to) {
  const t = docFile(doc, from);
  doc.transact(() => { dropFile(doc, from); if (t !== null) putFile(doc, to, t); });
}
/** The project's silinx.json (as the API gives it, without its fileTree). */
export function putProject(doc, json) {
  const { fileTree, ...pj } = json || {};
  const s = JSON.stringify(pj);
  const m = doc.getMap('project');
  if (m.get('json') !== s) m.set('json', s);
}

/** The whole project into the document: { project, files: { path: text } }; the files no longer in it removed. */
export function publishProject(doc, { project, files, owner = '' }) {
  doc.transact(() => {
    const meta = doc.getMap('meta');
    if (meta.get('version') !== LAYOUT_VERSION) meta.set('version', LAYOUT_VERSION);
    if (meta.get('owner') !== owner) meta.set('owner', owner);
    putProject(doc, project);
    for (const [p, t] of Object.entries(files)) putFile(doc, p, t);
    for (const p of [...doc.getMap('files').keys()]) if (!Object.hasOwn(files, p) || !shareable(p, files[p])) dropFile(doc, p);
  });
}

/** A file's text (null: not in the project). */
export function docFile(doc, path) {
  if (!sharedPath(path)) return null;
  const yt = doc.getMap('files').get(path);
  return yt instanceof Y.Text ? yt.toString() : null;
}

/** The project the document holds: { version, owner, project (null: none yet), fileTree (sorted) }. */
export function docProject(doc) {
  const meta = doc.getMap('meta');
  let project = null;
  try { project = JSON.parse(doc.getMap('project').get('json') ?? 'null'); } catch { /* not received yet */ }
  if (project !== null && (typeof project !== 'object' || Array.isArray(project))) project = null;
  const fileTree = [...doc.getMap('files').keys()].filter(sharedPath).sort();
  return { version: meta.get('version') ?? null, owner: String(meta.get('owner') ?? ''), project, fileTree };
}

/** What each update received changes (the follower's page reloads it, as #2843's changes on disk): onChange({ changes:
 *  [{ path, kind: 'created' | 'changed' | 'deleted' }], project (its silinx.json changed) }). Returns the unwatch. */
export function watchDoc(doc, onChange) {
  const files = doc.getMap('files'), project = doc.getMap('project');
  const known = new Set(files.keys());
  const fn = tr => {
    if (tr.local) return;
    const changes = new Map();
    for (const [type, keys] of tr.changed) {
      if (type === files) for (const p of keys) if (p !== null) changes.set(p, files.has(p) ? (known.has(p) ? 'changed' : 'created') : 'deleted');
      if (type instanceof Y.Text && type.parent === files) { const p = type._item?.parentSub; if (p && !changes.has(p)) changes.set(p, 'changed'); }
    }
    for (const [p, k] of changes) { if (k === 'deleted') known.delete(p); else known.add(p); }
    const list = [...changes].filter(([p]) => sharedPath(p)).map(([path, kind]) => ({ path, kind })).sort((x, y) => x.path.localeCompare(y.path));
    const pj = tr.changed.has(project);
    if (list.length || pj) onChange({ changes: list, project: pj });
  };
  doc.on('afterTransaction', fn);
  return () => doc.off('afterTransaction', fn);
}
