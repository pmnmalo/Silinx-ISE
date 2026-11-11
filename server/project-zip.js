// A whole project as a zip, out and in (out of server/xise-routes.js's export.zip and import-zip routes, #2674, so
// that the MCP server exports and imports a project as the interface does):
//   kind 'xilinx': a Xilinx ISE project — <name>.xise, its sources, ISE schematics (.sch); no Silinx-only files
//     (silinx.json, ASM charts, Silinx schematics); C sources as their HDL (#2320)
//   kind 'silinx': the whole Silinx project as it is — silinx.json and every project file
// and the entries of a zip (or of a folder read as one) made into a new project: its .xise (an ISE project) or its
// silinx.json (a Silinx one), every other file kept with its path.
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { createZip } from '../core/zip.js';
import { gateMessages, normalizePath, requireGated } from '../core/import-gate.js';
import { markUntrusted } from '../core/trust.js';
import { hiddenName } from './paths.js';
import { exportCSources, exportIseSchematics, exportXise } from './xise.js';
import { isCSource } from '../core/view-hdl.js';
import { ISE_OUTPUT, NODE_CODEC, SILINX_ONLY, importXiseProject } from './impl-routes.js';

const xiseName = project => `${project.name}.xise`;

/** The texts of a project's listed files: { path: text } (a missing one left out). */
export async function sourcesOf(P, name, project) {
  const out = {};
  for (const f of project.files || []) {
    try { out[f.path] = await P.readFile(name, f.path); } catch { /* missing */ }
  }
  return out;
}

/** A project as a zip: { zip (bytes), file (its name), warnings } (the export's warnings: the schematics', the C's). */
export async function exportProjectZip(P, name, kind = 'xilinx') {
  const project = await P.readProject(name);
  const tree = await P.fileTree(name);
  if (kind === 'silinx') {
    const entries = [{ path: 'silinx.json', data: await fs.readFile(path.join(P.projectDir(name), 'silinx.json')) }];
    for (const rel of tree) if (!/\.xise$/i.test(rel)) entries.push({ path: rel, data: await fs.readFile(P.safeJoin(P.projectDir(name), rel)) });
    return { zip: await createZip(entries, NODE_CODEC), file: `${name}-silinx.zip`, warnings: [] };
  }
  const sources = await sourcesOf(P, name, project);
  // Silinx schematics go out as ISE schematics (.sch), listed in the .xise in place of their HDL
  const docs = {};
  for (const rel of tree.filter(f => /\.sch\.json$/i.test(f))) {
    try { docs[rel] = JSON.parse(await fs.readFile(P.safeJoin(P.projectDir(name), rel), 'utf8')); } catch { /* skip */ }
  }
  const sch = exportIseSchematics(project, docs, sources);
  // C sources go out as their HDL (#2320)
  const cSources = {};
  for (const rel of tree.filter(isCSource)) cSources[rel] = await fs.readFile(P.safeJoin(P.projectDir(name), rel), 'utf8');
  const c = exportCSources(project, cSources, sources);
  for (const f of c.files) sources[f.path] = f.text;
  const xml = exportXise(project, { sources, schematics: sch.schematics, extraFiles: [...sch.extraFiles, ...c.extraFiles] });
  const entries = [];
  const generated = [...sch.files, ...c.files], warnings = [...sch.warnings, ...c.warnings];
  const added = new Set(generated.map(f => f.path));
  for (const rel of tree) {
    if (rel === xiseName(project) || added.has(rel) || SILINX_ONLY.test(rel) || isCSource(rel)) continue;
    entries.push({ path: rel, data: await fs.readFile(P.safeJoin(P.projectDir(name), rel)) });
  }
  entries.unshift({ path: xiseName(project), data: xml }, ...generated.map(f => ({ path: f.path, data: f.text })));
  return { zip: await createZip(entries, NODE_CODEC), file: `${name}.zip`, warnings };
}

/** A new project `name` from the entries of a zip or a folder, as the import gate let them through (core/import-gate.js
 *  gateZip / gateEntries, #2830): { project, missing, warnings, extra }, the gate's refusals first in the warnings.
 *  bad(message): the error of an entry set that is not a project. */
export async function importProjectEntries(P, name, gated, bad) {
  const entries = requireGated(gated, 'importProjectEntries');
  const xiseEntry = entries.filter(e => /\.xise$/i.test(e.path)).sort((x, y) => x.path.split('/').length - y.path.split('/').length)[0];
  const pjEntry = entries.find(e => /(^|\/)silinx\.json$/i.test(e.path));
  const root = (xiseEntry || pjEntry) ? path.posix.dirname((xiseEntry || pjEntry).path) : '';
  const rel = p => (root === '.' || !root ? p : p.startsWith(root + '/') ? p.slice(root.length + 1) : null);
  const text = e => Buffer.from(e.data).toString('utf8');
  let result;
  if (xiseEntry) {
    const provided = {};
    for (const e of entries) { const r = rel(e.path); if (r !== null) provided[r] = text(e); provided[path.posix.basename(e.path)] ??= text(e); }
    result = await importXiseProject(P, name, text(xiseEntry), provided);
  } else if (pjEntry) {
    await P.createProject({ name, template: 'empty', fromOutside: true });
    result = { project: await P.readProject(name), missing: [], warnings: [] };
  } else {
    // (a project file the import gate refused: why)
    const refused = gated.refusals.find(x => /(\.xise|(^|\/)silinx\.json)$/i.test(x.path));
    throw bad(refused ? `${refused.path}: not imported: ${refused.reason}` : 'the zip contains no .xise (ISE project) and no silinx.json');
  }
  // (an ISE project's own outputs are left out anyway: their refusals not said; a path that leaves the project always is)
  const quiet = { test: p => ISE_OUTPUT.test(p) && !p.split('/').includes('..') };
  result.warnings.unshift(...gateMessages(gated, { quiet: xiseEntry ? quiet : null }));
  // copy every other file of the project folder (ASM charts, memory files, docs...) keeping its path.
  // ISE import: the sources were written by importXiseProject and ISE's own outputs are skipped.
  // Silinx export: nothing is written yet (the empty project's default constraints path is not a
  // file) and the zip is the whole project, so every file is restored whatever its extension.
  const written = new Set(xiseEntry ? (result.project.files || []).map(f => f.path).concat(result.project.constraints || []) : []);
  const extra = [];
  for (const e of entries) {
    const r = rel(e.path);
    if (r === null || written.has(r) || /\.xise$/i.test(r) || P.isProjectFile(r) || (xiseEntry && ISE_OUTPUT.test(r))) continue;
    // the path in the project, once the root folder is taken off, by the import gate's rules again (#3405): the gate
    // checked the zip's path, p/build/top.bit, where build/ (Silinx's own: the bitstream, the reports) is not first
    const gatedRel = normalizePath(r);
    if (gatedRel.reason) { result.warnings.push(`${e.path}: not imported: ${gatedRel.reason}`); continue; }
    const norm = gatedRel.path;
    // (no hidden file or folder: an export has none, and a .git/ or an editor's settings would run commands)
    if (norm.startsWith('..') || path.posix.isAbsolute(norm) || norm.split('/').some(hiddenName)) continue;
    const to = P.safeJoin(P.projectDir(name), norm);
    if (await P.isProjectFileAt(P.projectDir(name), to)) continue;   // (silinx.json by another spelling: ſilinx.json, #2956)
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.writeFile(to, Buffer.from(e.data));
    extra.push(norm);
  }
  // Silinx export: restore the settings ISE does not know about (board, stimuli, language...)
  let project = await P.readProject(name);
  if (pjEntry) {
    let saved = null;
    try { saved = JSON.parse(text(pjEntry)); } catch { /* ignore a broken silinx.json */ }
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      // its file paths stay inside the project (a path that leaves it is dropped, with a warning)
      const safe = p => { try { P.safeJoin(P.projectDir(name), p); return true; } catch { return false; } };
      if (Array.isArray(saved.files)) saved.files = saved.files.filter(f => { const ok = typeof f?.path === 'string' && safe(f.path); if (!ok) result.warnings.push(`silinx.json: file path outside the project dropped (${f?.path})`); return ok; });
      if (typeof saved.constraints === 'string' && saved.constraints && !safe(saved.constraints)) { result.warnings.push(`silinx.json: constraints path outside the project dropped (${saved.constraints})`); delete saved.constraints; }
      const exists = p => { try { return fss.existsSync(P.safeJoin(P.projectDir(name), p)); } catch { return false; } };
      project = await P.updateProject(name, cur => ({ ...cur, ...(xiseEntry ? { board: saved.board ?? cur.board, stimuli: saved.stimuli || {}, preferredLanguage: saved.preferredLanguage, impl: { ...cur.impl, ...saved.impl } } : { ...saved, name, trusted: false }) }));
      if (!xiseEntry) {
        for (const f of Array.isArray(saved.files) ? saved.files : []) if (f?.path && !exists(f.path)) result.missing.push(f.path);
        if (typeof saved.constraints === 'string' && saved.constraints && !exists(saved.constraints) && !result.missing.includes(saved.constraints)) result.missing.push(saved.constraints);
      }
    }
  }
  // a project from outside: trusted only once the user says so (#2830, core/trust.js)
  project = await P.updateProject(name, markUntrusted);
  return { project, missing: result.missing, warnings: result.warnings, extra };
}
