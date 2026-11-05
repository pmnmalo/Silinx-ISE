// Silinx server - the ISE project routes (#405: out of registerImplRoutes in server/impl-routes.js): an ISE .xise
// project file written from a project and read back into it, and a whole project as a zip (Xilinx ISE or Silinx).
import fs from 'node:fs/promises';
import express from 'express';
import { ZIP_LIMITS } from '../core/zip.js';
import { GateError, gateEntries, gateMessages, gateZip } from '../core/import-gate.js';
import fss from 'node:fs';
import path from 'node:path';
import { exportXise, importXise } from './xise.js';
import { NODE_CODEC, importXiseProject } from './impl-routes.js';
import { exportProjectZip, importProjectEntries, sourcesOf as projectSources } from './project-zip.js';

/** The ISE project and zip routes of registerImplRoutes, registered on api (nothing returned). */
export function mountXiseRoutes(ctx) {
  const {
    P, api, wrap, bad
  } = ctx;

  // ----- ISE .xise project files --------------------------------------------------------------
  const xiseName = project => `${project.name}.xise`;

  const sourcesOf = (name, project) => projectSources(P, name, project);

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
    // the .xise and its files through the import gate (#2830): a file refused is left out, said in the warnings
    const files = b.files && typeof b.files === 'object' ? b.files : {};
    let g;
    try { g = gateEntries([{ path: 'project.xise', data: b.xise }, ...Object.entries(files).filter(([, t]) => typeof t === 'string').map(([p, t]) => ({ path: p, data: t }))]); }
    catch (e) { throw bad(e.message); }
    const xise = g.files.find(f => f.path === 'project.xise');
    if (!xise) throw bad(`the .xise: ${g.refusals.find(r => r.path === 'project.xise')?.reason}`);
    const r = await importXiseProject(P, b.name, xise.text, Object.fromEntries(g.files.filter(f => f !== xise && f.text != null).map(f => [f.path, f.text])));
    return { ...r, warnings: [...gateMessages(g), ...r.warnings] };
  }));

  // ----- whole project as a zip (server/project-zip.js): ?kind=xilinx (default), a Xilinx ISE project;
  // ?kind=silinx, the whole Silinx project as it is
  api.get('/projects/:p/export.zip', wrap(async (req, res) => {
    const { zip, file, warnings } = await exportProjectZip(P, req.params.p, req.query.kind === 'silinx' ? 'silinx' : 'xilinx');
    if (warnings.length) res.set('X-Silinx-Warnings', encodeURIComponent(JSON.stringify(warnings.slice(0, 50))));
    res.type('application/zip').attachment(file).send(Buffer.from(zip));
  }));

  // the upload is held in memory: at most the size of one entry readZip inflates (64 MB, #1434), said in the error
  const uploadMb = ZIP_LIMITS.maxEntry >> 20;
  const tooLarge = (err, req, res, next) => (err?.type === 'entity.too.large'
    ? res.status(413).json({ error: `the zip is larger than ${uploadMb} MB, the most an import takes` }) : next(err));
  api.post('/projects/import-zip', express.raw({ type: () => true, limit: ZIP_LIMITS.maxEntry }), tooLarge, wrap(async req => {
    const name = String(req.query.name || '');
    if (!name) throw bad('missing project name (?name=)');
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw bad('empty upload');
    // the zip through the import gate (#2830): its caps checked while it is read, each entry's name and content
    let gated;
    try { gated = await gateZip(new Uint8Array(req.body), NODE_CODEC); } catch (e) { throw e instanceof GateError ? bad(e.message) : e; }
    return importProjectEntries(P, name, gated, bad);
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
