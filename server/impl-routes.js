// REST routes for implementation (ISE), programming, JTAG, jobs, toolchain, devices and .xise.
// Registered by server.js on the /api router.

import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import express from 'express';
import { createZip, readZip } from '../core/zip.js';
import fss from 'node:fs';
import path from 'node:path';
import { getDeviceDb, resolveBoard } from './devices.js';
import { createJob, getJob, cancelJob, listJobs } from './jobs.js';
import { detectToolchain, saveConfig } from './toolchain.js';
import { runImplementation, collectReports, normalizeSteps } from './ise.js';
import { programJob, scanJob, promJob, readBitInfo, checkBitPart, expectedDevice } from './programmer.js';
import { exportXise, importXise, importIseSchematics, exportIseSchematics } from './xise.js';

// files that only Silinx understands: not part of an exported Xilinx ISE project
const SILINX_ONLY = /(^|\/)(silinx\.json|[^/]+\.(asm|sch)\.json)$/i;

export function registerImplRoutes(api, { wrap, projects: P }) {
  const bad = (msg, status = 400) => new P.HttpError(status, msg);
  const implJobs = new Map();   // project name -> id of its latest implementation job

  // ----- devices / toolchain ------------------------------------------------------------------
  api.get('/devices', wrap(async () => getDeviceDb()));

  api.get('/toolchain', wrap(() => detectToolchain()));

  api.put('/toolchain', wrap(async req => {
    try { await saveConfig(req.body || {}); }
    catch (e) { throw bad(e.message, e.status || 400); }
    return detectToolchain();
  }));

  // ----- implementation -----------------------------------------------------------------------
  api.post('/projects/:p/implement', wrap(async req => {
    const name = req.params.p;
    const project = await P.readProject(name);
    const projectDir = P.projectDir(name);
    const body = req.body || {};
    let steps;
    try { steps = normalizeSteps(body.steps); } catch (e) { throw bad(e.message); }
    if (!project.top) throw bad('set the top module of the project before implementing');
    // one ISE run per project: two runs would share (and wipe) the same build/ folder
    const key = name.toLowerCase();   // case-insensitive file systems: one folder
    const running = implJobs.get(key);
    if (running && getJob(running)?.status === 'running') throw bad(`an implementation of '${name}' is already running (job ${running}); wait for it or cancel it`, 409);
    const job = createJob('implement', j => runImplementation(j, { project, projectDir, steps, generateOnly: !!body.generateOnly }), { meta: { project: name, steps } });
    implJobs.set(key, job.id);
    return { job: job.id };
  }));

  api.get('/projects/:p/reports', wrap(async req => {
    const project = await P.readProject(req.params.p);
    const buildDir = path.join(P.projectDir(req.params.p), 'build');
    try { return JSON.parse(await fs.readFile(path.join(buildDir, 'reports.json'), 'utf8')); }
    catch { /* not saved yet */ }
    if (!fss.existsSync(buildDir) || !project.top) return { available: false };
    return collectReports(buildDir, project.top, project.device);
  }));

  api.get('/projects/:p/bitinfo', wrap(async req => {
    const project = await P.readProject(req.params.p);
    if (!project.top) return { available: false, reason: 'no top module' };
    const bit = path.join(P.projectDir(req.params.p), 'build', `${project.top}.bit`);
    if (!fss.existsSync(bit)) return { available: false, path: bit };
    try {
      const info = await readBitInfo(bit);
      return { available: true, ...info, warning: checkBitPart(info, project.device) };
    } catch (e) { return { available: false, path: bit, error: e.message }; }
  }));

  // ----- programming / JTAG -------------------------------------------------------------------
  api.post('/program', wrap(async req => {
    const b = req.body || {};
    let bitfile = null, project = null;
    if (b.project) {
      project = await P.readProject(b.project);
      const dir = P.projectDir(b.project);
      if (b.bitfile) bitfile = path.isAbsolute(b.bitfile) ? b.bitfile : P.safeJoin(dir, b.bitfile);
      else {
        if (!project.top) throw bad('project has no top module; cannot locate build/<top>.bit');
        bitfile = path.join(dir, 'build', `${project.top}.bit`);
      }
    } else if (b.bitfile) {
      if (!path.isAbsolute(b.bitfile)) throw bad('bitfile must be an absolute path when no project is given');
      bitfile = b.bitfile;
    } else throw bad('give a project or a bitfile');
    if (!/\.bit$/i.test(bitfile)) throw bad('only .bit files can be programmed');
    if (!fss.existsSync(bitfile)) throw bad(`bitstream not found: ${bitfile} (run the implementation first)`, 404);
    const board = b.board || project?.board || null;
    if (board && !resolveBoard(board)) throw bad(`unknown board '${board}'`);
    const expect = b.expectDevice || expectedDevice(project, board);
    const opts = { tool: b.tool, cable: b.cable, device: b.device, position: b.position, board, bitfile, expectDevice: expect };
    const job = createJob('program', j => programJob(j, opts), { meta: { project: b.project || null, bitfile, board } });
    return { job: job.id };
  }));

  // Platform Flash PROM (XCF0xS) of the board: program / verify / erase / read (backup) / reconfigure.
  api.post('/prom', wrap(async req => {
    const b = req.body || {};
    if (!b.project) throw bad('give a project');
    const project = await P.readProject(b.project);
    const dir = P.projectDir(b.project);
    const board = b.board || project.board || null;
    if (board && !resolveBoard(board)) throw bad(`unknown board '${board}'`);
    const opts = { op: b.op, device: b.device, verify: b.verify !== false, reconfigure: !!b.reconfigure, board, expectDevice: expectedDevice(project, board) };
    if (b.op === 'program' || b.op === 'verify') {
      if (!project.top && !b.bitfile) throw bad('project has no top module; cannot locate build/<top>_prom.bit');
      opts.bitfile = b.bitfile ? P.safeJoin(dir, b.bitfile) : path.join(dir, 'build', `${project.top}_prom.bit`);
      if (!/\.bit$/i.test(opts.bitfile)) throw bad('only .bit files can be written to the PROM');
    }
    if (b.op === 'read') opts.outfile = path.join(dir, 'build', 'prom-backup', `prom-${new Date().toISOString().replace(/[:.]/g, '-')}.bin`);
    const job = createJob('prom', j => promJob(j, opts), { meta: { project: b.project, op: b.op } });
    return { job: job.id };
  }));

  api.post('/jtag/scan', wrap(async req => {
    const b = req.body || {};
    if (b.board && !resolveBoard(b.board)) throw bad(`unknown board '${b.board}'`);
    const job = createJob('scan', j => scanJob(j, { tool: b.tool, cable: b.cable, device: b.device, board: b.board }), { meta: { board: b.board || null } });
    return { job: job.id };
  }));

  // ----- jobs ---------------------------------------------------------------------------------
  api.get('/jobs', wrap(async () => listJobs()));

  api.get('/jobs/:id', wrap(async req => {
    const j = getJob(req.params.id, req.query.since);
    if (!j) throw bad(`job '${req.params.id}' not found`, 404);
    return j;
  }));

  api.post('/jobs/:id/cancel', wrap(async req => {
    const j = cancelJob(req.params.id);
    if (!j) throw bad(`job '${req.params.id}' not found`, 404);
    return j;
  }));

  // ----- ISE .xise project files --------------------------------------------------------------
  const xiseName = project => `${project.name}.xise`;

  async function sourcesOf(name, project) {
    const out = {};
    for (const f of project.files || []) {
      try { out[f.path] = await P.readFile(name, f.path); } catch { /* missing */ }
    }
    return out;
  }

  api.get('/projects/:p/export.xise', wrap(async (req, res) => {
    const name = req.params.p;
    const project = await P.readProject(name);
    const xml = exportXise(project, { sources: await sourcesOf(name, project) });
    await fs.writeFile(path.join(P.projectDir(name), xiseName(project)), xml);
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
    const xml = exportXise(project, { sources, schematics: sch.schematics, extraFiles: sch.extraFiles });
    const entries = [];
    const added = new Set(sch.files.map(f => f.path));
    for (const rel of tree) {
      if (rel === xiseName(project) || added.has(rel) || SILINX_ONLY.test(rel)) continue;
      entries.push({ path: rel, data: await fs.readFile(P.safeJoin(P.projectDir(name), rel)) });
    }
    entries.unshift({ path: xiseName(project), data: xml }, ...sch.files.map(f => ({ path: f.path, data: f.text })));
    if (sch.warnings.length) res.set('X-Silinx-Warnings', encodeURIComponent(JSON.stringify(sch.warnings.slice(0, 50))));
    const zip = await createZip(entries, NODE_CODEC);
    res.type('application/zip').attachment(`${name}.zip`).send(Buffer.from(zip));
  }));

  api.post('/projects/import-zip', express.raw({ type: () => true, limit: '200mb' }), wrap(async req => {
    const name = String(req.query.name || '');
    if (!name) throw bad('missing project name (?name=)');
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw bad('empty upload');
    let entries;
    try { entries = await readZip(new Uint8Array(req.body), NODE_CODEC); } catch (e) { throw bad(`cannot read zip: ${e.message}`); }
    const xiseEntry = entries.filter(e => /\.xise$/i.test(e.path)).sort((x, y) => x.path.split('/').length - y.path.split('/').length)[0];
    const pjEntry = entries.find(e => /(^|\/)silinx\.json$/.test(e.path));
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
      if (r === null || written.has(r) || /\.xise$/i.test(r) || r === 'silinx.json' || (xiseEntry && ISE_OUTPUT.test(r))) continue;
      const norm = path.posix.normalize(r);
      if (norm.startsWith('..') || path.posix.isAbsolute(norm)) continue;
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
    const xfile = path.join(dir, xiseName(project));
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
    // Paths in the .xise are relative to the project dir; keep only those inside it.
    const files = [];
    const skipped = [];
    for (const f of parsed.files) {
      // a Windows drive path (C:/work/x.vhd) is outside the project too, even though POSIX path.resolve keeps it inside
      try { if (/^[A-Za-z]:/.test(f.path)) throw new Error('absolute'); P.safeJoin(dir, f.path); files.push(f); } catch { skipped.push(f.path); }
    }
    const saved = await P.updateProject(name, cur => ({
      ...cur,
      device: parsed.device.part ? parsed.device : cur.device,
      top: parsed.top || cur.top,
      simTop: parsed.simTop || cur.simTop,
      files,
      constraints: parsed.constraints && !parsed.constraints.includes('..') ? parsed.constraints : cur.constraints,
      impl: { ...cur.impl, ...parsed.impl },
    }));
    return { direction, file: xfile, project: saved, skipped, warnings: parsed.warnings };
  }));
}

/** Map an .xise file path into the project: keep safe relative paths, else <dir>/<basename>. */
async function importXiseProject(P, name, xiseText, provided) {
  let parsed;
  try { parsed = importXise(xiseText); } catch (e) { throw Object.assign(new Error(e.message), { status: 400 }); }
  const lookup = p => provided[p] ?? provided[path.posix.basename(p)];
  await P.createProject({ name, template: 'empty' });
  const files = [];
  const missing = [];
  const sources = {};
  for (const f of parsed.files) {
    const target = safeRel(f.path, f.role === 'sim' ? 'sim' : 'src');
    const text = lookup(f.path);
    if (typeof text === 'string') { await P.writeFile(name, target, text); sources[target] = text; } else missing.push(f.path);
    files.push({ path: target, lang: f.lang, role: f.role });
  }
  // ISE schematics -> Silinx schematics + their synchronized HDL
  const warnings = [...parsed.warnings];
  if (parsed.schematics.length) {
    const schFiles = {}, roles = {};
    for (const x of parsed.schematics) {
      const target = safeRel(x.path, x.role === 'sim' ? 'sim' : 'src');
      const text = lookup(x.path);
      if (typeof text !== 'string') { missing.push(x.path); continue; }
      schFiles[target] = text; roles[target] = x.role;
    }
    const symbols = {};
    for (const [k, v] of Object.entries(provided)) if (/\.sym$/i.test(k)) symbols[path.posix.basename(k)] = v;
    const existing = p => provided[p];
    for (const r of importIseSchematics(schFiles, { sources, symbols, lang: parsed.lang, existing })) {
      warnings.push(...r.warnings);
      if (!r.json) continue;
      await P.writeFile(name, r.json, r.jsonText);
      await P.writeFile(name, r.hdl, r.code);
      if (!files.some(f => f.path === r.hdl)) files.push({ path: r.hdl, lang: r.lang, role: roles[r.sch] || 'design' });
    }
  }
  let constraints = 'constraints/top.ucf';
  if (parsed.constraints) {
    constraints = safeRel(parsed.constraints, 'constraints');
    const text = lookup(parsed.constraints);
    if (typeof text === 'string') await P.writeFile(name, constraints, text); else missing.push(parsed.constraints);
  }
  const saved = await P.updateProject(name, pj => Object.assign(pj, {
    device: parsed.device.part ? parsed.device : pj.device,
    top: parsed.top || '', simTop: parsed.simTop || '', files, constraints,
    impl: { ...pj.impl, ...parsed.impl },
  }));
  return { project: saved, missing, warnings };
}

// Files ISE/ISim generate in a project folder: never imported (they are rebuilt by the flow).
const ISE_OUTPUT = /(^|\/)(build|_ngo|xst|iseconfig|_xmsgs|isim|xlnx_auto_0_xdb|planAhead_run_\d+|\.Xil)\/|\.(ngc|ngd|ncd|ngr|ngm|pcf|bld|map|mrp|par|pad|twr|twx|xpi|unroutes|bgn|drc|bit|bin|mcs|prm|syr|lso|xrpt|xwbt|ptwx|cmd_log|stx|gise|wdb|exe|log|xmsgs|prj|cmd|ini|xreport|html|xml|vhf)$|(^|\/)\./i;

const NODE_CODEC = { deflate: d => zlib.deflateRawSync(d), inflate: d => zlib.inflateRawSync(d) };

function safeRel(p, dir) {
  const norm = String(p).replace(/\\/g, '/');
  if (!norm || path.posix.isAbsolute(norm) || /^[A-Za-z]:/.test(norm) || norm.split('/').includes('..')) {
    return `${dir}/${path.posix.basename(norm)}`;
  }
  return path.posix.normalize(norm);
}
