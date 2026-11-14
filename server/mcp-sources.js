// The MCP server's tools of a project's sources (server/mcp.js, #2674), as the Design pane's menus do them:
// Unset as Top Module (web/js/design.js unsetTop), Remove from Project and Add to Project (the file kept in the
// project folder: design.js removeNow, app.js addNow), Rename of a file or a folder (the drawings' links to it
// updated: web/js/rename.js renameSource) and of a module (its references with it: server/rename-module.js), Delete File / Delete Folder and the deletion of a project (moved to
// the workspace's .trash). A top module the project no longer has becomes the one root left of its view, else
// none (web/js/app.js fixMissingTops).
import * as P from './projects.js';
import { toolError, projectPath, readProject, viewSourcesOf, STR, PROJECT } from './mcp-util.js';

const VIEW_RE = /\.(sch|asm|tt|bool|fsm|pn)\.json$/i;

// the tops of a project no longer declared by its sources: the view's one root, else none; the messages of the
// interface's console
async function fixMissingTops(name) {
  const { compile } = await import('../core/compile.js');
  const { topCandidates } = await import('../core/elaborate.js');
  const pj = await P.readProject(name);
  const lines = [], set = {};
  for (const sim of [false, true]) {
    const key = sim ? 'simTop' : 'top';
    const old = pj[key];
    if (!old) continue;
    const srcs = await viewSourcesOf(name, pj, sim);
    const word = String(old).replace(/[^\w$]/g, '');
    if (srcs.some(s => new RegExp(`\\b(entity|module)\\s+${word}\\b`, 'i').test(s.text || ''))) continue;
    let roots = [];
    try { roots = topCandidates(compile(srcs)); } catch { /* none */ }
    set[key] = roots.length === 1 ? roots[0] : '';
    const what = `The top-level ${sim ? 'simulation ' : ''}module '${old}' is no longer in the project`;
    lines.push(set[key] ? `INFO: ${what}: the top is now '${set[key]}' (another one: set_top).`
      : roots.length ? `WARNING: ${what}: set the top module (set_top).` : `INFO: ${what}, nor any other module.`);
  }
  if (Object.keys(set).length) await P.updateProject(name, p => ({ ...p, ...set }));
  return lines;
}

// a path of the project as the project lists it, inside it, not hidden; not silinx.json nor build/ (verb: what the
// tool does with it)
async function sourcePath(name, rel, verb, opts) {
  if (typeof rel !== 'string' || !rel) throw toolError('path: a file\'s path in the project (project_info)');
  const full = await projectPath(name, rel, verb, opts);
  const key = P.relKey(P.projectDir(name), full);
  if (!key) throw toolError('path: a file\'s path in the project, not the project\'s folder');
  if (await P.isProjectFileAt(P.projectDir(name), full)) throw toolError(`${P.PROJECT_FILE} is the project's description`);
  return key;
}

const tops = async name => { const pj = await P.readProject(name); return { top: pj.top || null, simTop: pj.simTop || null }; };

export const SOURCE_TOOLS = [
  {
    name: 'unset_top', title: 'Unset as Top Module',
    description: 'Unset a project\'s top module (or, with simulation, its test bench), as Unset as Top Module does: the project has none then, until set_top.',
    inputSchema: { type: 'object', properties: { project: PROJECT, simulation: { type: 'boolean', description: 'Unset the test bench (the simulation top) instead.' } }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run({ project: name, simulation = false }) {
      const pj = await readProject(name);
      const key = simulation ? 'simTop' : 'top';
      const old = pj[key];
      if (!old) return { text: `The project '${name}' has no ${simulation ? 'test bench' : 'top module'}: nothing to unset.`, data: { project: name, unset: null, ...await tops(name) } };
      await P.updateProject(name, p => ({ ...p, [key]: '' }));
      return { text: `Top-level ${simulation ? 'simulation ' : ''}module '${old}' unset: the project has no ${simulation ? 'test bench' : 'top module'} (set_top makes one).`, data: { project: name, unset: old, ...await tops(name) } };
    },
  },
  {
    name: 'remove_from_project', title: 'Remove from Project',
    description: 'Remove a source from the project, as Remove from Project does: the file stays in the project folder (add_to_project brings it back). With its HDL file, a drawing\'s HDL file (generated from it) leaves the project with it, as the Design pane\'s module does. A top module the project then no longer has becomes the one root of its view, else none.',
    inputSchema: { type: 'object', properties: { project: PROJECT, path: STR('The file\'s path in the project (project_info).'), with_hdl: { type: 'boolean', description: 'A drawing: its HDL file removed too (default true).' } }, required: ['project', 'path'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run({ project: name, path: rel, with_hdl: withHdl = true }) {
      await readProject(name);
      const file = await sourcePath(name, rel, 'removed');
      const tree = await P.fileTree(name);
      if (!tree.includes(file)) throw toolError(`no file '${file}' in the project '${name}'`);
      const pj0 = await P.readProject(name);
      if (!pj0.files.some(f => f.path === file) && (pj0.excluded || []).includes(file)) throw toolError(`'${file}' is not in the project (add_to_project brings it back)`);
      // a drawing's own HDL file (its generatedFile, in the project)
      let hdl = null;
      if (withHdl && VIEW_RE.test(file)) {
        try { const g = JSON.parse(await P.readFile(name, file)).generatedFile; if (g && tree.includes(g) && pj0.files.some(f => f.path === g)) hdl = g; } catch { /* not a drawing's JSON */ }
      }
      await P.updateProject(name, pj => {
        for (const f of [file, hdl].filter(Boolean)) {
          const entry = pj.files.find(x => x.path === f) || null;
          if (entry) pj.files = pj.files.filter(x => x.path !== f);
          if (pj.constraints === f) pj.constraints = '';
          if (!entry) pj.excluded = [...new Set([...(pj.excluded || []), f])];
        }
        return pj;
      });
      const lines = await fixMissingTops(name);
      const text = [...lines, hdl ? `Removed ${file} and its HDL file ${hdl} from the project (the files are kept in the project folder).` : `Removed ${file} from the project (the file is kept in the project folder).`];
      return { text: text.join('\n'), data: { project: name, removed: [file, hdl].filter(Boolean), ...await tops(name), messages: lines } };
    },
  },
  {
    name: 'add_to_project', title: 'Add to Project',
    description: 'Add a file of the project folder that is not in the project (removed from it, or put there) back into it, as Add to Project does: a VHDL or Verilog file as a source (a test bench in sim/ or named tb_… as a simulation source), a UCF as the constraints when the project has none.',
    inputSchema: { type: 'object', properties: { project: PROJECT, path: STR('The file\'s path in the project folder.') }, required: ['project', 'path'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run({ project: name, path: rel }) {
      await readProject(name);
      const file = await sourcePath(name, rel, 'added');
      if (/^build(\/|$)/i.test(file)) throw toolError(`'${file}' is written by Silinx itself`);
      if (!(await P.fileTree(name)).includes(file)) throw toolError(`no file '${file}' in the project folder of '${name}'`);
      const lang = /\.vhdl?$/i.test(file) ? 'vhdl' : /\.(v|sv)$/i.test(file) ? 'verilog' : null;
      const before = await P.readProject(name);
      if (!(before.excluded || []).includes(file) && (!lang || before.files.some(f => f.path === file))) return { text: `${file} is in the project already.`, data: { project: name, added: false } };
      await P.updateProject(name, pj => {
        pj.excluded = (pj.excluded || []).filter(f => f !== file);
        if (lang && !pj.files.some(f => f.path === file)) pj.files.push({ path: file, lang, role: /^(sim|tb|test)\//.test(file) || /(^|\/)tb_|_tb\./.test(file) ? 'sim' : 'design' });
        if (/\.ucf$/i.test(file) && !pj.constraints) pj.constraints = file;
        return pj;
      });
      const entry = (await P.readProject(name)).files.find(f => f.path === file);
      return { text: `${file} added to the project${entry ? ` (${entry.lang}, ${entry.role})` : ''}.`, data: { project: name, added: true, path: file, role: entry?.role || null } };
    },
  },
  {
    name: 'rename_file', title: 'Rename a file or a folder',
    description: 'Rename or move a file or a folder of a project, as Rename does: the project\'s list of files, its constraints file and the drawings\' links to an HDL file (generated from them) follow. To rename the module a file defines, edit its text (write_file).',
    inputSchema: { type: 'object', properties: { project: PROJECT, from: STR('The file\'s or folder\'s path in the project.'), to: STR('Its new path in the project.') }, required: ['project', 'from', 'to'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run({ project: name, from, to }) {
      await readProject(name);
      const a = await sourcePath(name, from, 'renamed'), b = await sourcePath(name, to, null, { last: false });
      if (/^build(\/|$)/i.test(a) || /^build(\/|$)/i.test(b)) throw toolError('build/ is written by Silinx itself');
      // (the new name by the import gate's rules: P.renameFile, as the interface's Rename, #2973)
      if (a === b) return { text: `${a}: the same path, nothing renamed.`, data: { project: name, from: a, to: b, links: [] } };
      try { await P.renameFile(name, a, b); } catch (e) { throw toolError(e.message); }
      // the drawings linked to a renamed HDL file (or to one in a renamed folder) follow it
      const tree = await P.fileTree(name);
      const remap = p => (p === a ? b : p?.startsWith(`${a}/`) ? b + p.slice(a.length) : null);
      const links = [];
      for (const f of tree.filter(f => VIEW_RE.test(f))) {
        let d;
        try { d = JSON.parse(await P.readFile(name, f)); } catch { continue; }
        const np = remap(d.generatedFile);
        if (!np) continue;
        d.generatedFile = np;
        await P.writeFile(name, f, JSON.stringify(d, null, /\.(asm|tt|bool|fsm)\.json$/i.test(f) ? 2 : 1));
        links.push(f);
      }
      return { text: `Rename: ${a} → ${b}${links.length ? ` (the link of ${links.join(', ')} updated)` : ''}.`, data: { project: name, from: a, to: b, links } };
    },
  },
  {
    name: 'rename_module', title: 'Rename a module',
    description: 'Rename a module (an entity or a module of the project\'s HDL files), as Rename does: its declaration and its instances in every source, the schematics\' symbols of it (their layout kept), its symbol file (<module>.sym.json: the module\'s name in it, a file named after the module following it, beside its file), the drawing it is generated from (named after it, it follows), the project\'s top and test bench. Its file follows the new name when it is named after the module (file: another path, or keep to leave it); the drawings changed make their HDL again.',
    inputSchema: { type: 'object', properties: { project: PROJECT, module: STR('The module\'s name now.'), to: STR('Its new name (a letter, then letters, digits and _).'), file: STR('Its file\'s new path, or keep (default: the file with the new name when it is named after the module).') }, required: ['project', 'module', 'to'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run({ project: name, module: oldName, to: newName, file }) {
      await readProject(name);
      if (typeof newName !== 'string' || !newName) throw toolError('to: the module\'s new name');
      const R = await import('./rename-module.js');
      const mod = (await R.projectModules(P, name)).find(m => m.name.toLowerCase() === String(oldName).toLowerCase() && m.kind !== 'package');
      if (!mod) throw toolError(`no module '${oldName}' in the project's HDL files (a drawing with no HDL file: write_file its name)`);
      let to = null;
      if (file === undefined) to = R.followingFile(mod.file, mod.name, newName);
      else if (file !== 'keep') to = await sourcePath(name, file, 'renamed');
      let r;
      try { r = await R.renameModule(P, name, mod.name, newName, { to }); } catch (e) { throw toolError(e.message); }
      return { text: [r.message, ...r.hdl].join('\n'), data: { project: name, module: r.module, file: r.file, changed: r.changed, moved: r.moved.map(([a, b]) => ({ from: a, to: b })), ...await tops(name) } };
    },
  },
  {
    name: 'delete_file', title: 'Delete a file or a folder',
    description: 'Delete a file or a folder (with everything in it) of a project, as Delete File / Delete Folder does: it is moved to the workspace\'s .trash folder (.trash/<project>-<time>/<its path>, named in the result), from where it can be moved back by hand, as delete_project does (remove_from_project keeps the file in the project folder). A top module the project then no longer has becomes the one root of its view, else none.',
    inputSchema: { type: 'object', properties: { project: PROJECT, path: STR('The file\'s or folder\'s path in the project.') }, required: ['project', 'path'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true },
    async run({ project: name, path: rel }) {
      await readProject(name);
      const file = await sourcePath(name, rel, 'deleted');
      const tree = await P.fileTree(name);
      const folder = !tree.includes(file);
      if (folder && !tree.some(f => f.startsWith(`${file}/`))) throw toolError(`no file or folder '${file}' in the project '${name}'`);
      const count = folder ? tree.filter(f => f.startsWith(`${file}/`)).length : 1;
      let r;
      try { r = await P.deleteFile(name, file, { trash: true, mustExist: true }); } catch (e) { throw toolError(e.message); }
      const lines = await fixMissingTops(name);
      return { text: [...lines, `${file} deleted (${folder ? `a folder: ${count} file(s); ` : ''}moved to the workspace's .trash folder: ${r.trashed}).`].join('\n'), data: { project: name, deleted: file, folder, files: count, trashed: r.trashed, ...await tops(name), messages: lines } };
    },
  },
  {
    name: 'delete_project', title: 'Delete a project',
    description: 'Delete a project of the workspace: its folder is moved to the workspace\'s .trash folder (from where it can be taken back by hand), as replacing a project of the same name in New Project does.',
    inputSchema: { type: 'object', properties: { project: PROJECT }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true },
    async run({ project: name }) {
      await readProject(name);
      try { await P.deleteProject(name); } catch (e) { throw toolError(e.message); }
      return { text: `Project '${name}' deleted (moved to the workspace's .trash folder).`, data: { project: name, deleted: true } };
    },
  },
];
