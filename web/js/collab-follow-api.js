// A follower's backend (#3181): the interface of api.js, read from the shared project's Yjs document as it arrives
// (core/collab-doc.js), so that the whole Project Navigator shows the owner's project as it shows one of its own.
// It reaches nothing of the server: a follower has no token, and needs none. Every change (a file written, renamed,
// deleted, a process run) is refused, read only; the processes run in the owner's Silinx. An editor (#3182) writes a
// text file's text: merged into the shared document as its edit (core/collab-doc.js editFile), which the owner writes.
// Every file the room shows passes the import gate first (#3361: core/collab-doc.js gatedDocFile), as any file from
// outside: one it refuses is not shown, and `warn` says so once.
import { docProject, watchDoc, editFile, gatedDocFile } from '/core/collab-doc.js';
import { collab, readOnlyError, editsHere } from './collab-state.js';

const notFound = what => Object.assign(new Error(what), { status: 404 });

/** The backend of a followed room's document (`api`: the one it stands for; its other functions refuse). warn(text):
 *  a file the gate refuses, once for each reason. */
export function followApi(api, doc, { warn = () => {} } = {}) {
  const out = {};
  const said = new Set();
  let version = 0;
  const verdicts = new Map();   // path -> { version, shown } (#3361: a bound editor's file checked at each change only)
  doc.on('update', () => { version++; });
  const gated = path => {
    const g = gatedDocFile(doc, path);
    if (g.reason && !said.has(`${path}\0${g.reason}`)) { said.add(`${path}\0${g.reason}`); warn(`${path}: not shown: ${g.reason}`); }
    return g;
  };
  const storage = api.storage?.bind(api);   // (the one it stands for: Object.assign replaces api's own, collab-follow.js)
  for (const [k, v] of Object.entries(api)) if (typeof v === 'function') out[k] = async () => { throw readOnlyError(); };
  const current = () => {
    const { project, fileTree } = docProject(doc);
    if (!project) throw notFound('the shared project has not arrived yet');
    return { project, fileTree };
  };
  const check = name => {
    const { project, fileTree } = current();
    if (name !== project.name) throw notFound(`no project '${name}' is followed here`);
    return { project, fileTree };
  };
  return Object.assign(out, {
    following: true,
    /** Whether a file's text passes the gate now (its live editor stays bound only while it does; said by the reads,
     *  not here). A file this participant edits stays bound: its own typing is checked by the owner's gate (#3355). */
    shown: path => {
      if (editsHere(path)) return true;
      const v = verdicts.get(path);
      if (v?.version === version) return v.shown;
      const shown = typeof gatedDocFile(doc, path).text === 'string';
      verdicts.set(path, { version, shown });
      return shown;
    },
    projects: async () => {
      const { project } = current();
      return [{ name: project.name, device: project.device, top: project.top, board: project.board, modified: null }];
    },
    workspace: async () => ({ folder: null }),
    // (the browser edition's storage, as it is: only read, at start-up and by the Start page; none reopened, #3320)
    ...(storage ? { storage, initStorage: async () => storage() } : {}),
    templates: async () => [],
    testDesigns: async () => [],
    devices: async () => null,
    toolchain: async () => ({ ise: { mode: 'silinx', available: false, reason: `following ${collab.owner}'s project: its processes run in their Silinx` }, programmers: {} }),
    project: async name => { const { project, fileTree } = check(name); return { ...structuredClone(project), fileTree }; },
    readFile: async (name, path) => {
      check(name);
      const g = gated(path);
      if (g.reason) throw notFound(`file '${path}' not shown: ${g.reason}`);
      if (g.text === null) throw notFound(`file '${path}' not found`);
      return g.text;
    },
    sources: async name => {
      const { project } = check(name);
      return (project.files || []).map(f => {
        const g = gated(f.path);
        return g.text == null ? { ...f, text: '', missing: true } : { ...f, text: g.text };
      });
    },
    reports: async () => ({ available: false }),
    writeFile: async (name, path, text) => {
      check(name);
      if (!editsHere(path)) throw readOnlyError();
      editFile(doc, path, String(text));
      return { ok: true };
    },
    // what the owner changes, as the local server's events of a change on disk (web/js/project-watch.js)
    events: (name, onEvent, signal) => new Promise(resolve => {
      const off = watchDoc(doc, ({ changes, project }) => {
        const pj = docProject(doc).project;
        if (!pj || pj.name !== name) return;
        const list = project && !changes.some(c => c.path === 'silinx.json') ? [...changes, { path: 'silinx.json', kind: 'changed' }] : changes;
        if (list.length) onEvent({ project: name, changes: list, by: collab.owner });
      });
      const stop = () => { off(); resolve(); };
      if (signal?.aborted) stop(); else signal?.addEventListener('abort', stop, { once: true });
    }),
  });
}
