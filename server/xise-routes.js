// Silinx server - the ISE project routes (#405: out of registerImplRoutes in server/impl-routes.js): an ISE .xise
// project file written from a project and read back into it, and a whole project as a zip (Xilinx ISE or Silinx).
import fs from 'node:fs/promises';
import express from 'express';
import { createZip, readZip, ZIP_LIMITS } from '../core/zip.js';
import fss from 'node:fs';
import path from 'node:path';
import { exportCSources, exportIseSchematics, exportXise, importXise } from './xise.js';
import { isCSource } from '../core/view-hdl.js';
import { ISE_OUTPUT, NODE_CODEC, SILINX_ONLY, importXiseProject } from './impl-routes.js';

/** The ISE project and zip routes of registerImplRoutes, registered on api (nothing returned). */
export function mountXiseRoutes(ctx) {
  const {
    P, api, wrap, bad
  } = ctx;

  // ----- ISE .xise project files --------------------------------------------------------------
  const xiseName = project => `${project.name}.xise`;

  async function sourcesOf(name, project) {
    const out = {};
    for (const f of project.files || []) {
      try { out[f.path] = await P.readFile(name, f.path); } catch { /* missing */ }
    }
    return out;
  }

  // the .xise sent, nothing written (#1432: a GET changes no file; sync-xise writes it on request)
  api.get('/projects/:p/export.xise', wrap(async (req, res) => {
    const name = req.params.p;
    const project = await P.readProject(name);
    const xml = exportXise(project, { sources: await sourcesOf(name, project) });
    // attachment() sets the type from the extension (.xise: octet-stream): set the XML type after it
    res.attachment(xiseName(project)).type('application/xml').send(xml);
  }));

  api.post('/projects/import-xise', wrap(async req => {
    const b = req.body || {};
    if (!b.name) throw bad('missing project name');
    if (typeof b.xise !== 'string' || !b.xise.trim()) throw bad('missing xise text');
    return importXiseProject(P, b.name, b.xise, b.files && typeof b.files === 'object' ? b.files : {});
  }));

  // ----- whole project as a zip: <name>.xise + silinx.json + all project files (not build/) -----
  // ?kind=xilinx (default): Xilinx ISE project — <name>.xise, its sources, ISE schematics (.sch);
  //   no Silinx-only files (silinx.json, ASM charts, Silinx schematics).
  // ?kind=silinx: the whole Silinx project as it is — silinx.json and every project file.
  api.get('/projects/:p/export.zip', wrap(async (req, res) => {
    const name = req.params.p;
    const project = await P.readProject(name);
    const tree = await P.fileTree(name);
    if (req.query.kind === 'silinx') {
      const entries = [{ path: 'silinx.json', data: await fs.readFile(path.join(P.projectDir(name), 'silinx.json')) }];
      for (const rel of tree) if (!/\.xise$/i.test(rel)) entries.push({ path: rel, data: await fs.readFile(P.safeJoin(P.projectDir(name), rel)) });
      const zip = await createZip(entries, NODE_CODEC);
      return res.type('application/zip').attachment(`${name}-silinx.zip`).send(Buffer.from(zip));
    }
    const sources = await sourcesOf(name, project);
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
    if (warnings.length) res.set('X-Silinx-Warnings', encodeURIComponent(JSON.stringify(warnings.slice(0, 50))));
    const zip = await createZip(entries, NODE_CODEC);
    res.type('application/zip').attachment(`${name}.zip`).send(Buffer.from(zip));
  }));

  // the upload is held in memory: at most the size of one entry readZip inflates (64 MB, #1434), said in the error
  const uploadMb = ZIP_LIMITS.maxEntry >> 20;
  const tooLarge = (err, req, res, next) => (err?.type === 'entity.too.large'
    ? res.status(413).json({ error: `the zip is larger than ${uploadMb} MB, the most an import takes` }) : next(err));
  api.post('/projects/import-zip', express.raw({ type: () => true, limit: ZIP_LIMITS.maxEntry }), tooLarge, wrap(async req => {
    const name = String(req.query.name || '');
    if (!name) throw bad('missing project name (?name=)');
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw bad('empty upload');
    let entries;
    try { entries = await readZip(new Uint8Array(req.body), NODE_CODEC); } catch (e) { throw bad(`cannot read zip: ${e.message}`); }
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
      await P.createProject({ name, template: 'empty' });
      result = { project: await P.readProject(name), missing: [], warnings: [] };
    } else throw bad('the zip contains no .xise (ISE project) and no silinx.json');
    // copy every other file of the project folder (ASM charts, memory files, docs...) keeping its path.
    // ISE import: the sources were written by importXiseProject and ISE's own outputs are skipped.
    // Silinx export: nothing is written yet (the empty project's default constraints path is not a
    // file) and the zip is the whole project, so every file is restored whatever its extension.
    const written = new Set(xiseEntry ? (result.project.files || []).map(f => f.path).concat(result.project.constraints || []) : []);
    const extra = [];
    for (const e of entries) {
      const r = rel(e.path);
      if (r === null || written.has(r) || /\.xise$/i.test(r) || r.toLowerCase() === 'silinx.json' || (xiseEntry && ISE_OUTPUT.test(r))) continue;
      const norm = path.posix.normalize(r);
      // (no hidden file or folder: an export has none, and a .git/ or an editor's settings would run commands)
      if (norm.startsWith('..') || path.posix.isAbsolute(norm) || norm.split('/').some(s => s.startsWith('.'))) continue;
      await fs.mkdir(path.dirname(P.safeJoin(P.projectDir(name), norm)), { recursive: true });
      await fs.writeFile(P.safeJoin(P.projectDir(name), norm), Buffer.from(e.data));
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
        project = await P.updateProject(name, cur => ({ ...cur, ...(xiseEntry ? { board: saved.board ?? cur.board, stimuli: saved.stimuli || {}, preferredLanguage: saved.preferredLanguage, impl: { ...cur.impl, ...saved.impl } } : { ...saved, name }) }));
        if (!xiseEntry) {
          for (const f of Array.isArray(saved.files) ? saved.files : []) if (f?.path && !exists(f.path)) result.missing.push(f.path);
          if (typeof saved.constraints === 'string' && saved.constraints && !exists(saved.constraints) && !result.missing.includes(saved.constraints)) result.missing.push(saved.constraints);
        }
      }
    }
    return { project, missing: result.missing, warnings: result.warnings, extra };
  }));

  api.post('/projects/:p/sync-xise', wrap(async req => {
    const name = req.params.p;
    const project = await P.readProject(name);
    const dir = P.projectDir(name);
    const xfile = P.safeJoin(dir, xiseName(project));
    let direction = (req.body || {}).direction || 'auto';
    if (!['auto', 'import', 'export'].includes(direction)) throw bad('direction must be auto, import or export');
    if (direction === 'auto') {
      if (!fss.existsSync(xfile)) direction = 'export';
      else {
        const xs = fss.statSync(xfile).mtimeMs, js = fss.statSync(path.join(dir, 'silinx.json')).mtimeMs;
        direction = xs > js ? 'import' : 'export';
      }
    }
    if (direction === 'export') {
      const xml = exportXise(project, { sources: await sourcesOf(name, project) });
      await fs.writeFile(xfile, xml);
      return { direction, file: xfile, project };
    }
    if (!fss.existsSync(xfile)) throw bad(`${xiseName(project)} not found`, 404);
    let parsed;
    try { parsed = importXise(await fs.readFile(xfile, 'utf8')); } catch (e) { throw bad(e.message); }
    // Paths in the .xise are relative to the project dir; keep only those inside it (the constraints too, #1236).
    // A Windows drive path (C:/work/x.vhd) is outside the project too, even though POSIX path.resolve keeps it inside.
    const inProject = p => { try { if (/^[A-Za-z]:/.test(p)) throw new Error('absolute'); P.safeJoin(dir, p); return true; } catch { return false; } };
    const files = [];
    const skipped = [];
    for (const f of parsed.files) {
      if (inProject(f.path)) files.push(f); else skipped.push(f.path);
    }
    const saved = await P.updateProject(name, cur => ({
      ...cur,
      device: parsed.device.part ? parsed.device : cur.device,
      top: parsed.top || cur.top,
      simTop: parsed.simTop || cur.simTop,
      topSourceType: parsed.topSourceType || cur.topSourceType || 'hdl',
      files,
      constraints: parsed.constraints && inProject(parsed.constraints) ? parsed.constraints : cur.constraints,
      impl: { ...cur.impl, ...parsed.impl },
    }));
    return { direction, file: xfile, project: saved, skipped, warnings: parsed.warnings };
  }));
}
