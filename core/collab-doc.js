// A shared project as a Yjs document (#3180, #3181): one document per project, no subdocuments.
//   meta     Y.Map   version (this layout's), owner (their name)
//   project  Y.Map   json: silinx.json as the API gives it (its fileTree left out)
//   files    Y.Map   path -> Y.Text: every file of the project's tree, text only (the HDL, the constraints, the test
//                    benches, the C, the drawings' JSON), FILE_MAX at most each; build/ and hidden files never
//   drawings Y.Map   path -> Y.Map: the drawings edited live, each as a structure of its own (#3183,
//                    core/collab-model.js); their files' texts the owner's, written from it
// No other root (DOC_ROOTS, #3527): a follower leaves a room whose owner sends one, or whose bytes pass its limit.
// The owner's Silinx writes it (publishProject, putFile, ...), a follower's reads it (docProject, docFile). A text is
// changed by its common prefix and suffix kept, so an update carries the edit only (and phase 2's editors, bound to
// the same Y.Text, need no other layout).
import * as Y from 'yjs';
import { gateFile, GateError } from './import-gate.js';
import { syncDrawings, drawingObjects, DRAWING_OBJECTS_MAX } from './collab-model.js';
import { updateRoots } from './collab-roots.js';

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

/** An editor's text of a file, at the owner's, before it is written (#3355): through the import gate, as any file from
 *  outside (core/import-gate.js gateFile: its sizes, its content), the text to write; or a GateError, its `reason` the
 *  console's. */
export function gateEdit(path, text) {
  const f = gateFile(path, text);
  if (f.path !== path) throw new GateError(`${path}: not a file of the project`, { path, reason: 'not a file of the project' });
  return f.text;
}

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

/** The whole project into the document: { project, files: { path: text } }; the files no longer in it removed; the
 *  drawings edited live (#3183) from their files, each one's change since `bases` (path -> text, kept up to date: the
 *  owner's, core/collab-model.js syncDrawings). */
export function publishProject(doc, { project, files, owner = '', bases = new Map() }) {
  doc.transact(() => {
    const meta = doc.getMap('meta');
    if (meta.get('version') !== LAYOUT_VERSION) meta.set('version', LAYOUT_VERSION);
    if (meta.get('owner') !== owner) meta.set('owner', owner);
    putProject(doc, project);
    for (const [p, t] of Object.entries(files)) putFile(doc, p, t);
    for (const p of [...doc.getMap('files').keys()]) if (!Object.hasOwn(files, p) || !shareable(p, files[p])) dropFile(doc, p);
    syncDrawings(doc, Object.fromEntries(Object.entries(files).filter(([p, t]) => shareable(p, t))), bases);
  });
}

/** What a follower takes of a room (#3361: the owner may be hostile): its files, their total size (characters; the
 *  document's encoded size too, its bytes, #3527). */
export const FOLLOW_LIMITS = Object.freeze({ files: 5000, total: 64 << 20, objects: DRAWING_OBJECTS_MAX });

const size = n => (n >= 1 << 20 ? `${Math.ceil(n / (1 << 20))} MB` : `${Math.ceil(n / 1024)} KB`);

/** Why a followed document is past what a follower takes (null: it is not); its bytes: docMeter. */
export function docTooLarge(doc, limits = FOLLOW_LIMITS) {
  const files = doc.getMap('files');
  if (files.size > limits.files) return `the shared project has more files than a follower takes (${files.size}, at most ${limits.files})`;
  let total = 0;
  for (const yt of files.values()) total += yt instanceof Y.Text ? yt.length : 0;
  if (total > limits.total) return `the shared project is larger than a follower takes (${size(total)}, at most ${size(limits.total)})`;
  const objects = drawingObjects(doc);
  if (objects > (limits.objects ?? DRAWING_OBJECTS_MAX)) return `the shared project's drawings hold more objects than a follower takes (${objects}, at most ${limits.objects ?? DRAWING_OBJECTS_MAX})`;
  return null;
}

/** The parts of a shared project's document (#3527): a root of any other name is no part of one. An editor's edit
 *  changes the files and the drawings only. */
export const DOC_ROOTS = Object.freeze(['meta', 'project', 'files', 'drawings']);
export const EDIT_ROOTS = Object.freeze(['files', 'drawings']);
const rootName = n => JSON.stringify(String(n).slice(0, 64));

/** The bytes a document holds (#3527), whatever they are (every root, values that are no text, the updates waiting for
 *  others): its encoded size, measured again only when what came since (the updates received, counted with add(), and
 *  its own changes) may take it past a maximum. */
export function docMeter(doc) {
  let measured = Y.encodeStateAsUpdate(doc).length, since = 0;
  const own = (u, origin) => { if (origin !== 'remote') since += u.length; };
  doc.on('update', own);
  const measure = () => { measured = Y.encodeStateAsUpdate(doc).length; since = 0; return measured; };
  return {
    /** `n` bytes received (applied, or waiting for the updates they follow). */
    add: n => { since += n; },
    /** Why the document, with `n` bytes more, is past `max` (null: it is not). */
    over: (max, n = 0) => (measured + since + n <= max || measure() + n <= max ? null
      : `the shared project is larger than a follower takes (${size(measured + n)}, at most ${size(max)})`),
    stop: () => doc.off('update', own),
  };
}

// the first root outside `roots` that an update changes (undefined: none; null: it does not decode); `strict`: what it
// refers to that the document does not have yet counted as outside
function rootOutside(doc, bytes, roots, strict) {
  const r = updateRoots(doc, bytes);
  if (!r) return null;
  const out = [...r.roots].find(n => !roots.includes(n));
  return out ?? (strict && r.unknown ? '' : undefined);
}

/** Why an update the owner sent is past what a follower takes (#3527): it changes a root of no shared project's (null:
 *  it does not). */
export function updateOutside(doc, bytes) {
  const r = rootOutside(doc, bytes, DOC_ROOTS, false);
  return r === null ? 'an update of the shared project that does not decode' : r === undefined ? null : `the shared project holds a part that no shared project has (${rootName(r)})`;
}

/** Why an editor's edit (a Yjs update) is refused before it is applied (#3527): it changes a part of the document that
 *  an editor does not, or builds on changes the owner does not have (null: it does not). */
export function editOutside(doc, bytes) {
  const r = rootOutside(doc, bytes, EDIT_ROOTS, true);
  if (r === null) return 'it is not an update of the document';
  if (r === '') return 'it builds on changes the owner does not have';
  return r === undefined ? null : `it changes a part of the document that an editor does not (${rootName(r)})`;
}

/** A followed file's text through the import gate (#3361), as any file from outside: { text } (null: not in the
 *  project), or { reason } it is not shown (its size, a NUL byte, an HTML page, an XML DTD, ...). */
export function gatedDocFile(doc, path) {
  const text = docFile(doc, path);
  if (text === null) return { text: null };
  if (text.length > FILE_MAX) return { reason: `file larger than ${FILE_MAX >> 20} MB` };
  try {
    const f = gateFile(path, text);
    return f.path === path ? { text: f.text } : { reason: 'not a file of the project' };
  } catch (e) {
    if (e instanceof GateError) return { reason: e.reason || e.message };
    throw e;
  }
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
