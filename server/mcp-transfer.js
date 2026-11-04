// The MCP server's tools of a project's import and export (server/mcp.js, #2674), as the File menu's: Export Silinx ISE
// Project and Export Xilinx ISE Project (a .zip written on the disk), Import Silinx ISE Project and Import Xilinx ISE
// Project (from a .zip, a .xise with its folder, or a project folder), through the server's own functions
// (server/project-zip.js, as the export.zip and import-zip routes). A file written is a new one: an export never
// replaces a file; an import makes a new project. Where the interface has the user choose the file, the client
// names it: both tools take only the paths of one exchange folder (the user's Downloads, where the interface's
// exports land, or SILINX_MCP_FOLDER), symbolic links that leave it included, so that an assistant led astray by
// what it read reaches nothing else of the disk.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT } from './mcp-util.js';

const KINDS = { xilinx: 'a Xilinx ISE project', silinx: 'a Silinx ISE project' };
const MAX_FILES = 5000;

/** The exchange folder: SILINX_MCP_FOLDER, else the user's Downloads. */
export const exchangeDir = () => path.resolve(process.env.SILINX_MCP_FOLDER || path.join(os.homedir(), 'Downloads'));

// a path of the exchange folder (relative to it, or absolute inside it), also once its symbolic links are followed
export async function exchangePath(p, what) {
  const dir = exchangeDir();
  if (typeof p !== 'string' || !p) throw toolError(`${what}: a path in the exchange folder ${dir}`);
  let root;
  try { root = await fsp.realpath(dir); } catch { throw toolError(`no exchange folder ${dir} (SILINX_MCP_FOLDER sets another)`); }
  const full = path.resolve(dir, p);
  const outside = () => toolError(`${what}: '${p}' is outside the exchange folder ${dir} (SILINX_MCP_FOLDER sets another)`);
  const under = (f, d) => f === d || f.startsWith(d + path.sep);
  if (!under(full, dir) && !under(full, root)) throw outside();
  // (the deepest part of the path that exists, resolved)
  let probe = full;
  while (!fs.existsSync(probe) && probe !== path.dirname(probe)) probe = path.dirname(probe);
  if (!under(await fsp.realpath(probe), root)) throw outside();
  return full;
}

// a folder's files as a zip's entries ([{ path, data }], its paths relative to dir), the hidden ones left out (an
// import takes none); at most the zip's limits (core/zip.js ZIP_LIMITS) and MAX_FILES files
async function folderEntries(dir) {
  const { ZIP_LIMITS } = await import('../core/zip.js');
  const out = [];
  let total = 0;
  const walk = async (sub) => {
    for (const d of await fsp.readdir(path.join(dir, sub), { withFileTypes: true })) {
      if (d.name.startsWith('.')) continue;
      const rel = sub ? `${sub}/${d.name}` : d.name;
      if (d.isDirectory()) { await walk(rel); continue; }
      if (!d.isFile()) continue;
      if (out.length >= MAX_FILES) throw toolError(`the folder has more than ${MAX_FILES} files: not a project's`);
      const data = await fsp.readFile(path.join(dir, rel));
      total += data.length;
      if (data.length > ZIP_LIMITS.maxEntry || total > ZIP_LIMITS.maxTotal) throw toolError(`the folder is larger than ${ZIP_LIMITS.maxTotal >> 20} MB, the most an import takes`);
      out.push({ path: rel, data });
    }
  };
  await walk('');
  return out;
}

export const TRANSFER_TOOLS = [
  {
    name: 'export_project', title: 'Export a project (.zip)',
    description: 'Write a project as a .zip into the exchange folder (the user\'s Downloads, or the folder SILINX_MCP_FOLDER names), as the File menu\'s Export does: kind xilinx (Export Xilinx ISE Project: its .xise, its sources, the schematics as ISE schematics, a C source as its HDL; no Silinx-only file) or silinx (Export Silinx ISE Project: the whole project, silinx.json and every file, for Import Silinx ISE Project). The file must not exist: an export never replaces one.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, kind: { type: 'string', enum: Object.keys(KINDS), description: 'xilinx (default) or silinx.' },
      path: STR('The .zip to write, in the exchange folder: its name (e.g. traffic.zip), a path in it, or an absolute path inside it; a file that does not exist yet.'),
    }, required: ['project', 'path'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run({ project: name, kind = 'xilinx', path: to }) {
      await readProject(name);
      if (!KINDS[kind]) throw toolError(`kind: one of ${Object.keys(KINDS).join(', ')}`);
      const file = await exchangePath(to, 'path');
      if (!/\.zip$/i.test(file)) throw toolError(`path: '${to}' is not a .zip`);
      if (!fs.existsSync(path.dirname(file)) || !fs.statSync(path.dirname(file)).isDirectory()) throw toolError(`no folder '${path.dirname(file)}'`);
      if (fs.existsSync(file)) throw toolError(`'${file}' exists: an export does not replace a file (give another path)`);
      const { exportProjectZip } = await import('./project-zip.js');
      const { zip, warnings } = await exportProjectZip(P, name, kind);
      // (a file that appeared meanwhile is not replaced either)
      try { await fsp.writeFile(file, zip, { flag: 'wx' }); } catch (e) { throw toolError(e.code === 'EEXIST' ? `'${file}' exists: an export does not replace a file (give another path)` : e.message); }
      const lines = [...warnings.map(w => `WARNING: ${w}`), `Exported '${name}' as ${KINDS[kind]}: ${file} (${zip.length} bytes).`];
      return { text: lines.join('\n'), data: { project: name, kind, path: file, folder: exchangeDir(), bytes: zip.length, warnings } };
    },
  },
  {
    name: 'import_project', title: 'Import a project',
    description: 'Make a new project in the workspace from a project in the exchange folder (the user\'s Downloads, or the folder SILINX_MCP_FOLDER names), as the File menu\'s Import does: a .zip (a Xilinx ISE project with its .xise, or a Silinx ISE project exported with its silinx.json), an ISE project\'s .xise (its folder\'s files with it) or a project folder. Its sources, constraints and other files are copied (not ISE\'s own outputs, nor hidden files); returns the files the project lists but were not found, and the import\'s warnings.',
    inputSchema: { type: 'object', properties: {
      name: STR('The new project\'s name (letters, digits, - and _).'),
      from: STR('The .zip, the .xise or the project folder, in the exchange folder: its name, a path in it, or an absolute path inside it.'),
    }, required: ['name', 'from'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run({ name, from }) {
      const src = await exchangePath(from, 'from');
      let st;
      try { st = await fsp.stat(src); } catch { throw toolError(`no file or folder '${src}'`); }
      if (fs.existsSync(P.projectDir(name))) throw toolError(`project '${name}' already exists (delete_project, or another name)`);
      let entries;
      if (st.isDirectory()) entries = await folderEntries(src);
      else if (/\.xise$/i.test(src)) {
        // the .xise chosen first: the import takes the first of the shallowest
        const all = await folderEntries(path.dirname(src));
        const me = path.basename(src);
        entries = [...all.filter(e => e.path === me), ...all.filter(e => e.path !== me)];
      } else if (/\.zip$/i.test(src)) {
        const { readZip, ZIP_LIMITS } = await import('../core/zip.js');
        const { NODE_CODEC } = await import('./impl-routes.js');
        if (st.size > ZIP_LIMITS.maxEntry) throw toolError(`the zip is larger than ${ZIP_LIMITS.maxEntry >> 20} MB, the most an import takes`);
        try { entries = await readZip(new Uint8Array(await fsp.readFile(src)), NODE_CODEC); } catch (e) { throw toolError(`cannot read zip: ${e.message}`); }
      } else throw toolError(`from: '${src}' is not a .zip, a .xise or a folder`);
      const { importProjectEntries } = await import('./project-zip.js');
      let r;
      try { r = await importProjectEntries(P, name, entries, toolError); } catch (e) {
        if (e.toolError) throw e;
        throw toolError(e.message);
      }
      const pj = r.project;
      const kind = entries.some(e => /\.xise$/i.test(e.path)) ? 'Xilinx ISE' : 'Silinx ISE';
      const lines = [...r.warnings.map(w => `WARNING: ${w}`), ...r.missing.map(m => `WARNING: ${m}: listed by the project, not found`),
        `Imported the ${kind} project as '${name}': top ${pj.top || '(none)'}, test bench ${pj.simTop || '(none)'}, ${pj.board || 'no board'} (${pj.device ? `${pj.device.part}${pj.device.package}${pj.device.speed}` : 'no device'}), ${(pj.files || []).length} source(s)${r.extra.length ? `, ${r.extra.length} other file(s)` : ''}.`];
      return { text: lines.join('\n'), data: { project: name, kind: kind === 'Xilinx ISE' ? 'xilinx' : 'silinx', top: pj.top || null, simTop: pj.simTop || null, board: pj.board || null, device: pj.device || null, files: (pj.files || []).map(f => f.path), extra: r.extra, missing: r.missing, warnings: r.warnings } };
    },
  },
];
