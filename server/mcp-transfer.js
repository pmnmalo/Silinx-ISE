// The MCP server's tools of a project's import and export (server/mcp.js, #2674), as the File menu's: Export Project
// (.zip)… (a .zip written on the disk, to Silinx or to Xilinx ISE: its window's software, #3703, the tool's kind) and
// Import Project (.zip)… (from a .zip, a .xise with its folder, or a project folder; its software read from the files), through the server's own functions
// (server/project-zip.js, as the export.zip and import-zip routes). A file written is a new one: an export never
// replaces a file; an import makes a new project. Where the interface has the user choose the file, the client
// names it: both tools take only the paths of one exchange folder (the user's Downloads, where the interface's
// exports land, or SILINX_MCP_FOLDER), symbolic links that leave it included, so that an assistant led astray by
// what it read reaches nothing else of the disk. Import Source / Add Copy of Source / Import Test Bench (#3546) copies
// files of the same folder into a project (core/import-source.js, as the interface's dialog).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as P from './projects.js';
import { toolError, readProject, diagLine, STR, PROJECT } from './mcp-util.js';

const KINDS = { xilinx: 'a Xilinx ISE project', silinx: 'a Silinx project' };
const MAX_FILES = 5000;

/** The exchange folder: SILINX_MCP_FOLDER, else the user's Downloads. */
export const exchangeDir = () => path.resolve(process.env.SILINX_MCP_FOLDER || path.join(os.homedir(), 'Downloads'));

// a path of the exchange folder (relative to it, or absolute inside it), also once its symbolic links are followed
export async function exchangePath(p, what) {
  const dir = exchangeDir();
  // (a path as the results name it, <exchange folder>/a.zip, #3418: the folder's own)
  if (typeof p === 'string' && /^<exchange folder>(?:[\\/]|$)/.test(p)) p = p.replace(/^<exchange folder>[\\/]?/, '') || '.';
  if (typeof p !== 'string' || !p) throw toolError(`${what}: a path in the exchange folder`);
  let root;
  try { root = await fsp.realpath(dir); } catch { throw toolError('no exchange folder (the user\'s Downloads, or the folder SILINX_MCP_FOLDER names)'); }
  const full = path.resolve(dir, p);
  const outside = () => toolError(`${what}: '${p}' is outside the exchange folder (SILINX_MCP_FOLDER sets another)`);
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
    description: 'Write a project as a .zip into the exchange folder (the user\'s Downloads, or the folder SILINX_MCP_FOLDER names), as the File menu\'s Export Project (.zip)… does, kind being the software chosen in its window: xilinx (Xilinx ISE: its .xise, its sources, the schematics as ISE schematics, a C source as its HDL; no Silinx-only file) or silinx (Silinx: the whole project, silinx.json and every file, for Import Project (.zip)…). No AMD Vivado nor Intel Quartus project yet. The file must not exist: an export never replaces one.',
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
    description: 'Make a new project in the workspace from a project in the exchange folder (the user\'s Downloads, or the folder SILINX_MCP_FOLDER names), as the File menu\'s Import Project (.zip)… does, the software read from the files: a .zip (a Xilinx ISE project with its .xise, or a Silinx project exported with its silinx.json), an ISE project\'s .xise (its folder\'s files with it: a folder of its own, not the exchange folder\'s root) or a project folder. Its sources, constraints and other files are copied (not ISE\'s own outputs, nor hidden files); returns the files the project lists but were not found, and the import\'s warnings.',
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
      // (never the exchange folder as a whole, the user's Downloads: a .xise at its root would take every file there
      // with it, #3412)
      const xise = !st.isDirectory() && /\.xise$/i.test(src);
      if ((st.isDirectory() || xise) && await fsp.realpath(st.isDirectory() ? src : path.dirname(src)) === await fsp.realpath(exchangeDir())) {
        throw toolError(st.isDirectory() ? `from: '${from}' is the exchange folder itself: give a project's own folder in it`
          : `from: '${from}' is at the exchange folder's root, with whatever else is there: put the ISE project in a folder of its own and import that folder's .xise`);
      }
      let entries;
      if (st.isDirectory()) entries = await folderEntries(src);
      else if (xise) {
        // the .xise chosen first: the import takes the first of the shallowest
        const all = await folderEntries(path.dirname(src));
        const me = path.basename(src);
        entries = [...all.filter(e => e.path === me), ...all.filter(e => e.path !== me)];
      } else if (/\.zip$/i.test(src)) {
        const { ZIP_LIMITS } = await import('../core/zip.js');
        if (st.size > ZIP_LIMITS.maxEntry) throw toolError(`the zip is larger than ${ZIP_LIMITS.maxEntry >> 20} MB, the most an import takes`);
        entries = new Uint8Array(await fsp.readFile(src));
      } else throw toolError(`from: '${src}' is not a .zip, a .xise or a folder`);
      // through the import gate (#2830), as the interface's import: a zip's caps checked while it is read, each file's
      // name and content; its refusals are the result's warnings
      const { GateError, gateEntries, gateZip } = await import('../core/import-gate.js');
      let gated;
      try {
        if (entries instanceof Uint8Array) { const { NODE_CODEC } = await import('./impl-routes.js'); gated = await gateZip(entries, NODE_CODEC); }
        else gated = gateEntries(entries);
      } catch (e) { throw e instanceof GateError ? toolError(e.message) : e; }
      const { importProjectEntries } = await import('./project-zip.js');
      let r;
      try { r = await importProjectEntries(P, name, gated, toolError); } catch (e) {
        if (e.toolError) throw e;
        throw toolError(e.message);
      }
      const pj = r.project;
      const kind = gated.files.some(e => /\.xise$/i.test(e.path)) ? 'Xilinx ISE' : 'Silinx';
      const lines = [...r.warnings.map(w => `WARNING: ${w}`), ...r.missing.map(m => `WARNING: ${m}: listed by the project, not found`),
        `Imported the ${kind} project as '${name}': top ${pj.top || '(none)'}, test bench ${pj.simTop || '(none)'}, ${pj.board || 'no board'} (${pj.device ? `${pj.device.part}${pj.device.package}${pj.device.speed}` : 'no device'}), ${(pj.files || []).length} source(s)${r.extra.length ? `, ${r.extra.length} other file(s)` : ''}.`];
      return { text: lines.join('\n'), data: { project: name, kind: kind === 'Xilinx ISE' ? 'xilinx' : 'silinx', top: pj.top || null, simTop: pj.simTop || null, board: pj.board || null, device: pj.device || null, files: (pj.files || []).map(f => f.path), extra: r.extra, missing: r.missing, warnings: r.warnings }, untrusted: r.warnings.length ? 'the import\'s warnings, which name its files' : undefined };
    },
  },
  {
    name: 'import_source', title: 'Import Source (Add Copy of Source)',
    description: 'Copy files of the exchange folder (the user\'s Downloads, or the folder SILINX_MCP_FOLDER names) into a project, as Import Source / Add Copy of Source does (Import Test Bench: association sim): a VHDL or Verilog file to src/ (sim/ with association sim), a constraints file (.ucf, .pcf, .lpf, .cst) to constraints/ (the project\'s constraints when its own is not in it), a memory file (.mem, .hex) or a drawing (.json, its HDL made) to src/ (sim/). Each file through the import gate (a file it refuses is not copied: a warning); a drawing named with a reserved word of VHDL or Verilog is refused; a file the project has already is replaced only with replace.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT,
      files: { type: 'array', items: { type: 'string' }, description: 'The files to copy (one or more), in the exchange folder: each its name, a path in it, or an absolute path inside it.' },
      association: { type: 'string', enum: ['design', 'impl', 'sim'], description: 'design (All: Implementation + Simulation, default), impl (Implementation only) or sim (Simulation only: Import Test Bench).' },
      replace: { type: 'boolean', description: 'Replace a file the project has already (default: it is left as it is, a warning).' },
    }, required: ['project', 'files'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true },
    async run({ project: name, files, association: role = 'design', replace = false }) {
      await readProject(name);
      if (!files.length) throw toolError('files: the files to copy, in the exchange folder');
      const { importSourceTakes, importSourceFile, assignImported, IMPORT_SOURCE_ACCEPT } = await import('../core/import-source.js');
      // the files first, all of them: one that is not there, or not a source, copies none
      const srcs = [];
      for (const f of files) {
        const full = await exchangePath(f, 'files');
        if (!(await fsp.stat(full).catch(() => null))?.isFile()) throw toolError(`files: no file '${full}'`);
        if (!importSourceTakes(path.basename(full))) throw toolError(`files: '${full}' is not a file Import Source takes (${IMPORT_SOURCE_ACCEPT.split(',').join(', ')})`);
        srcs.push(full);
      }
      const tree = await P.fileTree(name);
      const lines = [], written = [], refused = [];
      for (const full of srcs) {
        const base = path.basename(full);
        // (through the import gate, #2830; a drawing named with a reserved word refused, #679: core/import-source.js)
        const c = importSourceFile(base, new Uint8Array(await fsp.readFile(full)), role);
        if (c.refused) { lines.push(`${c.refused === 'gate' ? 'WARNING' : 'ERROR'}: ${c.message}`); refused.push({ path: c.path, message: c.message }); continue; }
        if (c.warning) lines.push(`WARNING: ${c.warning}`);
        if (tree.includes(c.path) && !replace) {
          const message = `${c.path} already exists in the project: not replaced with the copy of ${base} (replace: true replaces it).`;
          lines.push(`WARNING: ${message}`);
          refused.push({ path: c.path, message });
          continue;
        }
        try { await P.writeFile(name, c.path, c.text); } catch (e) { throw toolError(e.message); }
        if (!written.includes(c.path)) written.push(c.path);
      }
      if (!written.length) return { text: [...lines, 'No source file added.'].join('\n'), data: { project: name, added: [], refused, constraints: null }, isError: true, untrusted: 'the names of the files copied' };
      // the association (role) of exactly the files written, and the constraints file
      await P.updateProject(name, pj => assignImported(pj, written, role, tree));
      // a drawing: its HDL file made (#3184), as the interface does when it reads the project again
      const { adoptDrawing, syncDrawing } = await import('./drawing-sync.js');
      for (const f of written.filter(f => /\.(sch|asm|tt|bool|fsm|pn)\.json$/i.test(f))) {
        const sync = await syncDrawing(P, name, f) || await adoptDrawing(P, name, f);
        lines.push(...(sync?.messages || []));
      }
      lines.push(`Added ${written.length} source file(s).`);
      // an HDL file's module named with a reserved word (#679): a warning, as the interface's
      const { compile } = await import('../core/compile.js');
      const { reservedModuleDiags } = await import('../core/reserved.js');
      const pj = await P.readProject(name);
      const hdl = await Promise.all(pj.files.filter(f => written.includes(f.path) && (f.lang === 'vhdl' || f.lang === 'verilog'))
        .map(async f => ({ path: f.path, lang: f.lang, text: await P.readFile(name, f.path) })));
      let units = [];
      try { units = compile(hdl).parsed.flatMap(p => (p.units || []).filter(u => u.kind === 'module').map(u => ({ name: u.name, file: p.file, line: u.loc?.line }))); } catch { /* none */ }
      lines.push(...reservedModuleDiags(units).map(diagLine));
      const added = written.map(p => ({ path: p, role: pj.files.find(f => f.path === p)?.role || null }));
      return { text: lines.join('\n'), data: { project: name, added, refused, constraints: pj.constraints || null }, untrusted: 'the names of the files copied' };
    },
  },
];
