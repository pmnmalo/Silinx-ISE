// A follower's backend (#3181): the interface of api.js, read from the shared project's Yjs document as it arrives
// (core/collab-doc.js), so that the whole Project Navigator shows the owner's project as it shows one of its own.
// It reaches nothing of the server: a follower has no token, and needs none. Every change (a file written, renamed,
// deleted, a process run) is refused, read only; the processes run in the owner's Silinx.
import { docFile, docProject, watchDoc } from '/core/collab-doc.js';
import { collab, readOnlyError } from './collab-state.js';

const notFound = what => Object.assign(new Error(what), { status: 404 });

/** The backend of a followed room's document (`api`: the one it stands for; its other functions refuse). */
export function followApi(api, doc) {
  const out = {};
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
    projects: async () => {
      const { project } = current();
      return [{ name: project.name, device: project.device, top: project.top, board: project.board, modified: null }];
    },
    workspace: async () => ({ folder: null }),
    templates: async () => [],
    testDesigns: async () => [],
    devices: async () => null,
    toolchain: async () => ({ ise: { mode: 'silinx', available: false, reason: `following ${collab.owner}'s project: its processes run in their Silinx` }, programmers: {} }),
    project: async name => { const { project, fileTree } = check(name); return { ...structuredClone(project), fileTree }; },
    readFile: async (name, path) => {
      check(name);
      const t = docFile(doc, path);
      if (t === null) throw notFound(`file '${path}' not found`);
      return t;
    },
    sources: async name => {
      const { project } = check(name);
      return (project.files || []).map(f => {
        const t = docFile(doc, f.path);
        return t === null ? { ...f, text: '', missing: true } : { ...f, text: t };
      });
    },
    reports: async () => ({ available: false }),
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
