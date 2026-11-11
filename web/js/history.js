// Project history: Undo / Redo of the commands that change the project (Remove from Project,
// Rename, Convert to Schematic / ASM / FSM, New Source, Delete, moving files, Design Properties…),
// as editors undo their own edits.
//
// A command runs in run(label, fn): while it runs, the project's writes through the api
// (writeFile, deleteFile, renameFile, saveProject) are recorded: the content of each file touched
// before the command (null: it did not exist) and the project settings. When the command ends,
// the content after it is read; Undo writes the contents of before back, Redo those of after.
// The documents' own saves (autosave) are not part of a command; the build folder is not either.
//
// The history belongs to one project and is lost when another project is opened.

const MAX = 100;

/**
 * api: the backend (patched here: its writes are recorded while a command runs).
 * hooks: { project() → the open project's name, files() → the project's file paths,
 *   settings() → the open project's settings as JSON (else read from the backend),
 *   flush() → saves the open documents, before(changed) → may refuse an undo/redo (paths changed since),
 *   restored(entry, paths) → reload the project and its open documents, changed() → menus to update }
 */
export function createHistory(api, hooks) {
  const raw = { writeFile: api.writeFile, deleteFile: api.deleteFile, renameFile: api.renameFile, saveProject: api.saveProject, readFile: api.readFile, project: api.project };
  let cur = null;          // the command being recorded
  let pending = null;      // its end (an Undo clicked meanwhile waits for it)
  let finishing = null;    // the command ended, its step being made (still shown as the one to undo)
  let quiet = 0;           // writes that are not recorded (the documents' saves, Undo / Redo themselves)
  let applying = 0;        // an Undo / Redo writing the files and reopening their documents
  let project = null;
  const undoStack = [], redoStack = [];
  let chain = Promise.resolve();   // one command / undo / redo at a time

  const ignored = p => /^build\//.test(p);
  const read = async (name, p) => { try { const t = await raw.readFile(name, p); return typeof t === 'string' ? t : null; } catch { return null; } };
  const under = (p) => hooks.files().filter(f => f === p || f.startsWith(`${p}/`));

  async function note(name, paths) {
    if (!cur || quiet || name !== cur.project) return;
    for (const p of paths) if (!ignored(p) && !cur.files.has(p)) cur.files.set(p, await read(name, p));
  }
  const settingsOf = async name => { const pj = await raw.project(name); delete pj.fileTree; return JSON.stringify(pj); };
  api.writeFile = async (name, p, text) => { await note(name, [p]); return raw.writeFile(name, p, text); };
  api.deleteFile = async (name, p, opts) => { await note(name, [p, ...under(p)]); return raw.deleteFile(name, p, opts); };
  api.renameFile = async (name, from, to) => {
    const inside = under(from);
    await note(name, [from, to, ...inside, ...inside.map(f => to + f.slice(from.length))]);
    return raw.renameFile(name, from, to);
  };
  api.saveProject = async (name, pj) => raw.saveProject(name, pj);

  const serial = fn => { const r = chain.then(fn, fn); chain = r.catch(() => {}); return r; };
  const reset = () => { undoStack.length = 0; redoStack.length = 0; hooks.changed?.(); };

  /** Run a command; what it changes in the project becomes one Undo step. Nested commands join it. */
  async function run(label, fn) {
    if (cur) return fn();
    const name = hooks.project();
    if (!name) return fn();
    if (name !== project) { project = name; reset(); }
    // (the project settings as the command starts: renaming or deleting a file changes them too)
    const entry = cur = { label: String(label || 'Change').replace(/…$/, ''), project: name, files: new Map(), pj: null, at: Date.now() };
    let done;
    pending = new Promise(r => { done = r; });
    try {
      // (taken at once, so that the command starts as it is chosen: a toggle acts immediately)
      entry.pj = hooks.settings ? hooks.settings() : await settingsOf(name);
      return await fn();
    } finally {
      cur = null;
      finishing = entry;
      try { await finish(entry); } finally { finishing = null; pending = null; done(); }
    }
  }
  async function finish(e) {
    // what the command left: the files it touched, the settings
    const files = [];
    for (const [p, before] of e.files) {
      const after = await read(e.project, p);
      if (after !== before) files.push({ path: p, before, after });
    }
    let pjAfter = null;
    if (e.pj) { try { pjAfter = await settingsOf(e.project); } catch { /* the project was deleted */ } }
    const settings = e.pj && pjAfter && pjAfter !== e.pj ? { before: e.pj, after: pjAfter } : null;
    if (!files.length && !settings) return;
    undoStack.push({ label: e.label, project: e.project, files, settings, at: e.at });
    if (undoStack.length > MAX) undoStack.shift();
    redoStack.length = 0;
    hooks.changed?.();
  }

  // write one side (before / after) of a step
  async function apply(e, side) {
    const other = side === 'before' ? 'after' : 'before';
    // changed since (by an editor, another command): ask before overwriting
    const changed = [];
    for (const f of e.files) if (await read(e.project, f.path) !== f[other]) changed.push(f.path);
    if (changed.length && !await hooks.before?.(changed)) return false;
    quiet++;
    try {
      // files first (deleting the ones that did not exist on that side), then the settings
      for (const f of e.files) if (f[side] === null && f[other] !== null) { try { await raw.deleteFile(e.project, f.path); } catch { /* gone */ } }
      for (const f of e.files) if (f[side] !== null) await raw.writeFile(e.project, f.path, f[side]);
      if (e.settings) await raw.saveProject(e.project, JSON.parse(e.settings[side]));
    } finally { quiet--; }
    await hooks.restored?.(e, e.files.map(f => f.path));
    return true;
  }

  // one Undo (from: the undo stack, to: the redo stack, side 'before') or Redo: the step moves from
  // one stack to the other before its files are written (a command run while they are written then
  // finds the stacks as they will be), and back if the user keeps the files changed since
  async function step(from, to, side) {
    // an Undo of a command still running waits for it; if it changed nothing, nothing is undone
    const waited = side === 'before' ? running() : null;
    if (pending) await pending;
    if (waited && from.at(-1)?.at !== waited.at) return null;
    if (!live() || !from.length) return null;
    await hooks.flush?.();
    const e = from.pop();
    const moved = { ...e, at: Date.now() };
    to.push(moved);
    hooks.changed?.();
    let ok = false;
    applying++;
    try { ok = await apply(e, side); } finally {
      applying--;
      if (!ok) { const i = to.indexOf(moved); if (i >= 0) to.splice(i, 1); from.push(e); hooks.changed?.(); }
    }
    return ok ? e : null;
  }
  const live = () => hooks.project() === project;
  const running = () => { const c = cur || finishing; return c && c.project === hooks.project() ? c : null; };
  return {
    run,
    /** the documents' saves: not part of a command */
    unrecorded: async fn => { quiet++; try { return await fn(); } finally { quiet--; } },
    recording: () => !!cur,
    /** a command, an Undo or a Redo is writing (its changes to the open documents are not the user's edits) */
    busy: () => !!cur || applying > 0,
    // (a command still finishing counts: its Undo waits for it)
    canUndo: () => !!running() || (live() && undoStack.length > 0),
    canRedo: () => !running() && live() && redoStack.length > 0,
    undoLabel: () => running()?.label || (live() ? undoStack.at(-1)?.label ?? null : null),
    redoLabel: () => (live() ? redoStack.at(-1)?.label ?? null : null),
    lastAt: () => running()?.at || (live() ? undoStack.at(-1)?.at ?? 0 : 0),
    redoAt: () => (live() ? redoStack.at(-1)?.at ?? 0 : 0),
    undo: () => serial(() => step(undoStack, redoStack, 'before')),
    redo: () => serial(() => step(redoStack, undoStack, 'after')),
    reset,
  };
}
