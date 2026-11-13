// REST routes for implementation (ISE), programming, JTAG, jobs, toolchain, devices and .xise.
// Registered by server.js on the /api router.

import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import fss from 'node:fs';
import path from 'node:path';
import { getDeviceDb, resolveBoard } from './devices.js';
import { createJob, getJob, cancelJob, listJobs } from './jobs.js';
import { detectToolchain, saveConfig, loadConfig } from './toolchain.js';
import { runImplementation, collectReports, normalizeSteps } from './ise.js';
import { runVivado, isVivadoDevice, vivadoSteps, collectVivadoReports } from './vivado.js';
import { deviceFamily, experimentalDevice, noFlowMessage, openOnlyDevice, bitstreamExtOf } from '../packages/silinx-fpga/src/parts.js';
import { runOpenImplementation, openStatus, openSteps, buildDeviceJob, reportPart } from './open-flow.js';
import { programJob, scanJob, promJob, readBitInfo, checkBitPart, expectedDevice, parseBitHeader } from './programmer.js';
import { importXise, importIseSchematics } from './xise.js';
import { within, nativeRealOf } from './paths.js';
import * as Projects from './projects.js';
import { mountXiseRoutes } from './xise-routes.js';
import { IDENT } from './ident.js';
import { isTrusted, untrustedMessage } from '../core/trust.js';
import { normalizePath } from '../core/import-gate.js';
import { foldName } from '../core/fold-name.js';

// files that only Silinx understands: not part of an exported Xilinx ISE project
export const SILINX_ONLY = /(^|\/)(silinx\.json|[^/]+\.(asm|sch|tt|bool|fsm)\.json)$/i;

const implJobs = new Map();   // project name -> id of its latest implementation job

// A project's top as the build's file names take it (build/<top>.bit, <top>.ncd, <top>.xdl): an identifier,
// else 400 (#1431: silinx.json written by hand, or by an older server, could name a path outside the project).
function topOf(project) {
  if (project.top && !IDENT.test(project.top)) throw new Projects.HttpError(400, `invalid top module name '${project.top}'`);
  return project.top;
}

// An absolute .bit of the workspace is programmed as its project's (#3039): the project it is in, by its name and once
// its links are followed, must be trusted, as the project's own route asks (#2830); a file outside the workspace
// (iMPACT's file box: a .bit from the disk) is not any project's. A case-insensitive file system (macOS, Windows)
// takes the workspace's name in any case (#3358): the paths are compared as the system names them (realpath's
// native form keeps the disk's case, JS's the one it is given), and by name with their case folded there.
const FOLDS = process.platform === 'darwin' || process.platform === 'win32';
async function checkWorkspaceBit(full) {
  const P = Projects, ws = path.resolve(P.workspaceDir()), names = new Set();
  const fold = s => (FOLDS ? foldName(s) : s);
  for (const [dir, f] of [[ws, path.resolve(full)], [nativeRealOf(ws), nativeRealOf(path.resolve(full))]]) {
    if (!fold(f).startsWith(fold(dir + path.sep))) continue;
    const first = f.split(path.sep)[dir.split(path.sep).length];   // the folder of the workspace it is in
    names.add(path.basename(nativeRealOf(path.join(ws, first))));  // the project's name, in its folder's case
  }
  for (const name of names) {
    let project = null;
    try { project = await P.readProject(name); } catch { /* not a project's folder */ }
    if (!project) throw new P.HttpError(403, `${full} is in the workspace but in no project: a workspace's bitstream is programmed from its project`);
    if (!isTrusted(project)) throw new P.HttpError(403, untrustedMessage(name, 'programming the board', project));
  }
}

/**
 * Program the board: POST /program, and the MCP server's program_board (server/mcp-board.js). b: { project, bitfile (the
 * project's file, else its build/<top><ext>; an absolute .bit without a project), board, tool, cable, device, position,
 * force }; the project trusted (#2830). Returns the job (server/programmer.js programJob).
 */
export async function startProgramming(b = {}) {
  const P = Projects, bad = (msg, status = 400) => new P.HttpError(status, msg);
  let bitfile = null, project = null;
  if (b.project) {
    project = await P.readProject(b.project);
    if (!isTrusted(project)) throw bad(untrustedMessage(b.project, 'programming the board', project), 403);   // (#2830)
    const dir = P.projectDir(b.project);
    if (b.bitfile) bitfile = path.isAbsolute(b.bitfile) ? b.bitfile : P.safeJoin(dir, b.bitfile);
    else {
      if (!topOf(project)) throw bad('project has no top module; cannot locate build/<top>.bit');
      bitfile = path.join(dir, 'build', `${project.top}${bitstreamExtOf(project.device)}`);   // (the iCE40's .bin, the Gowin's .fs, #2298)
    }
  } else if (b.bitfile) {
    if (!path.isAbsolute(b.bitfile)) throw bad('bitfile must be an absolute path when no project is given');
    bitfile = b.bitfile;
  } else throw bad('give a project or a bitfile');
  if (!/\.bit$/i.test(bitfile) && !(/\.(bin|fs)$/i.test(bitfile) && !path.isAbsolute(b.bitfile || ''))) throw bad('only .bit files, or a project\'s .bin (the iCE40) or .fs (the Gowin), can be programmed');
  if (path.isAbsolute(b.bitfile || '')) await checkWorkspaceBit(bitfile);
  if (!fss.existsSync(bitfile)) throw bad(`bitstream not found: ${bitfile} (run the implementation first)`, 404);
  // a file outside the project (iMPACT's file box takes any path): only a real Xilinx bitstream,
  // and the same answer for any other file as for a missing one (no file-existence check by the API)
  if (path.isAbsolute(b.bitfile || '')) {
    let ok = false;
    try { const fd = await fs.open(bitfile); try { const { buffer, bytesRead } = await fd.read(Buffer.alloc(4096), 0, 4096, 0); parseBitHeader(buffer.subarray(0, bytesRead)); ok = true; } finally { await fd.close(); } } catch { /* not a bitstream */ }
    if (!ok) throw bad(`bitstream not found: ${bitfile} (run the implementation first)`, 404);
  }
  const board = b.board || project?.board || null;
  if (board && !resolveBoard(board)) throw bad(`unknown board '${board}'`);
  // the device the bitstream must be built for: the project's, else the board's, never the request's (#3040); a
  // mismatch refused unless the request says force
  const opts = { tool: b.tool, cable: b.cable, device: b.device, position: b.position, board, bitfile, expectDevice: expectedDevice(project, board), force: b.force === true };
  return createJob('program', j => programJob(j, opts), { meta: { project: b.project || null, bitfile, board } });
}

/**
 * Start an implementation of a project: POST /projects/:p/implement, and the MCP server's run_process
 * (server/mcp.js). body: { steps, toolchain ('silinx' | 'ise' | 'vivado'), synthUpToDate, generateOnly }. A 7-series device's
 * flow is AMD Vivado's (#1649, server/vivado.js). Returns the job.
 */
export async function startImplementation(name, body = {}) {
  const P = Projects;
  const bad = (msg, status = 400) => new P.HttpError(status, msg);
  const project = await P.readProject(name);
  const projectDir = P.projectDir(name);
  let steps;
  try { steps = normalizeSteps(body.steps); } catch (e) { throw bad(e.message); }
  if (!topOf(project)) throw bad('set the top module of the project before implementing');
  // (an experimental family with no back end: its flows to come; the 7-series' is Vivado's, #1649, the Silinx toolchain's #3146)
  if (experimentalDevice(project.device) && !isVivadoDevice(project.device)) throw bad(noFlowMessage(project.device));
  // one ISE run per project: two runs would share (and wipe) the same build/ folder
  const key = name.toLowerCase();   // case-insensitive file systems: one folder
  const running = implJobs.get(key);
  if (running && getJob(running)?.status === 'running') throw bad(`an implementation of '${name}' is already running (job ${running}); wait for it or cancel it`, 409);
  // the Silinx toolchain (mode 'silinx'): no ISE, Silinx's own flow (server/open-flow.js). The
  // request's toolchain, else the project's synthesis tool (synthTool: 'silinx' | 'xst'), else the
  // execution mode of Toolchain Settings
  const choice = body.toolchain || ({ silinx: 'silinx', xst: 'ise', vivado: 'vivado' })[project.synthTool];
  // (a 7-series device: Vivado's, #1649, unless the Silinx toolchain is asked for or is the project's synthesis tool: its
  // 7-series back end, on trial, #3146; a toolchain asked for Vivado: its)
  const vivado = body.toolchain === 'vivado' || (isVivadoDevice(project.device) && !['silinx', 'open', 'ise'].includes(choice));
  if (body.toolchain === 'vivado' && !isVivadoDevice(project.device)) throw bad(`AMD Vivado implements the Artix-7 devices, not the ${String(project.device?.part || '').toUpperCase()}`);
  if (vivado) {
    try { steps = vivadoSteps(steps); } catch (e) { throw bad(e.message); }
    if (!isTrusted(project)) throw bad(untrustedMessage(name, 'AMD Vivado', project), 403);
    const board = project.board ? resolveBoard(project.board, { variant: project.boardVariant, part: project.device?.part })?.board || null : null;
    const job = createJob('implement', j => { captureLeftOut(j, project, 'AMD Vivado'); return runVivado(j, { project, projectDir, steps, board, generateOnly: !!body.generateOnly }); }, { meta: { project: name, steps, toolchain: 'vivado' } });
    implJobs.set(key, job.id);
    return job;
  }
  const open = openOnlyDevice(project.device) || (choice ? ['silinx', 'open'].includes(choice) : (await loadConfig()).mode === 'silinx');
  // (the synthesis up to date, #280: the run starts at Translate from its netlist)
  const synthUpToDate = !!body.synthUpToDate;
  if (open) { try { steps = openSteps(body.steps, { synthUpToDate, family: deviceFamily(project.device) }); } catch (e) { throw bad(e.message); } }
  // Xilinx ISE (Docker, ssh, the Mac's or the PC's own) runs outside the browser's sandbox: not for a project from
  // outside until the user trusts it (#2830); the Silinx toolchain does
  if (!open && !isTrusted(project)) throw bad(untrustedMessage(name, 'Xilinx ISE', project), 403);
  const job = open
    ? createJob('implement', j => runOpenImplementation(j, { project, projectDir, steps, synthUpToDate }), { meta: { project: name, steps, toolchain: 'silinx' } })
    : createJob('implement', j => { captureLeftOut(j, project, 'Xilinx ISE'); return runImplementation(j, { project, projectDir, steps, generateOnly: !!body.generateOnly }); }, { meta: { project: name, steps } });
  implJobs.set(key, job.id);
  return job;
}

// the logic analyzer's capture (#3176) is inserted by the Silinx toolchain only: its wrapper reads the probes through
// hierarchical names, which XST and Vivado's synthesis do not take
export const CAPTURE_LEFT_OUT = tool => `WARNING:Silinx - the logic analyzer's capture is inserted by the Silinx toolchain only: ${tool} implements the design without it.`;
function captureLeftOut(job, project, tool) {
  if (project.capture) job.log(CAPTURE_LEFT_OUT(tool));
}

/** A project's reports (GET /projects/:p/reports; the MCP server's get_report): { available: false } before any run. */
export async function projectReports(name) {
  const P = Projects;
  const project = await P.readProject(name);
  const buildDir = path.join(P.projectDir(name), 'build');
  try { return JSON.parse(await fs.readFile(path.join(buildDir, 'reports.json'), 'utf8')); }
  catch { /* not saved yet */ }
  if (!fss.existsSync(buildDir) || !topOf(project)) return { available: false };
  if (isVivadoDevice(project.device) && fss.existsSync(path.join(buildDir, 'run.tcl'))) return collectVivadoReports(buildDir, project.top, project.device);
  return collectReports(buildDir, project.top, project.device);
}

export function registerImplRoutes(api, { wrap, projects: P }) {
  const bad = (msg, status = 400) => new P.HttpError(status, msg);

  // ----- devices / toolchain ------------------------------------------------------------------
  api.get('/devices', wrap(async () => getDeviceDb()));

  // ?project=<name>: also whether the Silinx toolchain can implement that project's device (open)
  const withOpen = async (tc, name) => {
    if (!name) return tc;
    try { const pj = await P.readProject(String(name)); return { ...tc, open: openStatus(pj.device || {}) }; } catch { return tc; }
  };
  api.get('/toolchain', wrap(async req => withOpen(await detectToolchain(), req.query.project)));

  api.put('/toolchain', wrap(async req => {
    try { await saveConfig(req.body || {}, { fromApi: true }); }
    catch (e) { throw bad(e.message, e.status || 400); }
    return withOpen(await detectToolchain(), req.query.project);
  }));

  // the Silinx toolchain for a project's device: { available, reason, part, graph, bitDb, canBuild }
  api.get('/projects/:p/open-status', wrap(async req => openStatus((await P.readProject(req.params.p)).device || {})));

  // build the description of a device (its routing graph) from the user's own ISE: { part } or
  // { project } (that project's device)
  const deviceJobs = new Map();   // part -> job id
  api.post('/toolchain/build-device', wrap(async req => {
    const b = req.body || {};
    let part = b.part;
    if (!part && b.project) { try { part = reportPart((await P.readProject(b.project)).device || {}); } catch (e) { throw bad(e.message); } }
    part = String(part || '').toLowerCase();
    if (!/^xc[a-z0-9]+-\d+$/.test(part)) throw bad(`invalid part '${part}' (e.g. xc3s250ecp132-4)`);
    const running = deviceJobs.get(part);
    if (running && getJob(running)?.status === 'running') throw bad(`the description of ${part} is already being built (job ${running})`, 409);
    const job = createJob('build-device', j => buildDeviceJob(j, { part }), { meta: { part } });
    deviceJobs.set(part, job.id);
    return { job: job.id, part };
  }));

  // ----- implementation -----------------------------------------------------------------------
  api.post('/projects/:p/implement', wrap(async req => ({ job: (await startImplementation(req.params.p, req.body || {})).id })));

  api.get('/projects/:p/reports', wrap(req => projectReports(req.params.p)));

  // the logic analyzer's capture on the board (#3176, server/ila-board.js: adepttool, the MCP tool capture's): a job, its
  // lines the run's, its result { capture, file }
  api.post('/projects/:p/capture', wrap(async req => {
    const name = req.params.p, { arm = true, timeoutS = 10, device = 0 } = req.body || {};
    await Projects.readProject(name);
    const { captureProject } = await import('./ila-board.js');
    const job = createJob('capture', async j => { const r = await captureProject(name, { arm: arm !== false, timeoutMs: Math.max(0.1, +timeoutS || 10) * 1000, device: +device || 0, log: l => j.log(l) }); return { capture: r.capture, file: r.file }; },
      { meta: { project: name } });
    return { job: job.id };
  }));

  // the implemented design inside the FPGA (web/js/fpgaview.js): build/<top>.xdl + build/device.xdlrc,
  // written by the 'fpgaview' step; the model is cached in build/fpga-view.json. The Silinx toolchain's
  // routed design (build/open/routed.xdl) with the device description when it is newer than ISE's.
  api.get('/projects/:p/fpga-view', wrap(async req => {
    const project = await P.readProject(req.params.p);
    if (!topOf(project)) return { available: false, reason: 'no-top' };
    const dir = path.join(P.projectDir(req.params.p), 'build');
    if (!within(P.projectDir(req.params.p), dir)) return { available: false, reason: 'no-ncd' };   // (a link out of the project: its cache is written there)
    const f = name => path.join(dir, name);
    const mtime = p => { try { return fss.statSync(p).mtimeMs; } catch { return 0; } };
    const { MODEL_VERSION } = await import('../packages/silinx-fpga/src/parts.js');
    const ncd = mtime(f(`${project.top}.ncd`)), xdl = mtime(f(`${project.top}.xdl`)), dev = mtime(f('device.xdlrc'));
    const openXdl = mtime(f('open/routed.xdl'));
    if (openXdl && openXdl >= ncd) {
      const st = openStatus(project.device || {});
      if (!st.graph) return { available: false, reason: 'error', error: st.reason };
      const key = `open:${MODEL_VERSION}:${openXdl}:${st.graph}:${mtime(st.graph)}`;
      try { const c = JSON.parse(await fs.readFile(f('open/fpga-view.json'), 'utf8')); if (c.key === key) return c.model; } catch { /* not cached */ }
      const { parseXdl, fpgaModel, deviceGrid, loadDeviceCache } = await import('../packages/silinx-fpga/src/node.js');
      const model = { available: true, source: 'open', ...fpgaModel(parseXdl(await fs.readFile(f('open/routed.xdl'), 'utf8')), deviceGrid(loadDeviceCache(st.graph))) };
      await fs.writeFile(f('open/fpga-view.json'), JSON.stringify({ key, model }));
      return model;
    }
    if (!ncd) return { available: false, reason: 'no-ncd' };
    if (!xdl || !dev || xdl < ncd) return { available: false, reason: xdl ? 'stale' : 'no-xdl' };
    const key = `${MODEL_VERSION}:${ncd}:${xdl}:${dev}`;   // a new model format rebuilds the cache
    try { const c = JSON.parse(await fs.readFile(f('fpga-view.json'), 'utf8')); if (c.key === key) return c.model; } catch { /* not cached */ }
    const { parseXdl, parseXdlrc, fpgaModel } = await import('../packages/silinx-fpga/src/parts.js');
    const model = { available: true, ...fpgaModel(parseXdl(await fs.readFile(f(`${project.top}.xdl`), 'utf8')), parseXdlrc(await fs.readFile(f('device.xdlrc'), 'utf8'))) };
    await fs.writeFile(f('fpga-view.json'), JSON.stringify({ key, model }));
    return model;
  }));

  api.get('/projects/:p/bitinfo', wrap(async req => {
    const project = await P.readProject(req.params.p);
    if (!topOf(project)) return { available: false, reason: 'no top module' };
    // (an open family's bitstream, the iCE40's .bin, the ECP5's .bit: no Xilinx header, its size, #2298, #2302; its family's flag)
    if (openOnlyDevice(project.device)) {
      const bin = path.join(P.projectDir(req.params.p), 'build', `${project.top}${bitstreamExtOf(project.device)}`), own = { [deviceFamily(project.device)]: true };
      const st = await fs.stat(bin).catch(() => null);
      return st ? { available: true, path: bin, size: st.size, ...own } : { available: false, path: bin, ...own };
    }
    const bit = path.join(P.projectDir(req.params.p), 'build', `${project.top}.bit`);
    if (!fss.existsSync(bit)) return { available: false, path: bit };
    try {
      const info = await readBitInfo(bit);
      return { available: true, ...info, warning: checkBitPart(info, project.device) };
    } catch (e) { return { available: false, path: bit, error: e.message }; }
  }));

  // ----- programming / JTAG -------------------------------------------------------------------
  api.post('/program', wrap(async req => ({ job: (await startProgramming(req.body || {})).id })));

  // Platform Flash PROM (XCF0xS) of the board: program / verify / erase / read (backup) / reconfigure.
  api.post('/prom', wrap(async req => {
    const b = req.body || {};
    if (!b.project) throw bad('give a project');
    const project = await P.readProject(b.project);
    if (!isTrusted(project)) throw bad(untrustedMessage(b.project, 'programming the PROM', project), 403);   // (#2830)
    const dir = P.projectDir(b.project);
    const board = b.board || project.board || null;
    if (board && !resolveBoard(board)) throw bad(`unknown board '${board}'`);
    const opts = { op: b.op, device: b.device, verify: b.verify !== false, reconfigure: !!b.reconfigure, board, expectDevice: expectedDevice(project, board), force: b.force === true };
    if (b.op === 'program' || b.op === 'verify') {
      if (!topOf(project) && !b.bitfile) throw bad('project has no top module; cannot locate build/<top>_prom.bit');
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

  // ----- ISE .xise project files -------------------------------------------------------------- (xise-routes.js)
  mountXiseRoutes({
    P, api, wrap, bad
  });

}

/** Map an .xise file path into the project: keep safe relative paths, else <dir>/<basename>. */
export async function importXiseProject(P, name, xiseText, provided) {
  let parsed;
  try { parsed = importXise(xiseText); } catch (e) { throw Object.assign(new Error(e.message), { status: 400 }); }
  const lookup = p => provided[p] ?? provided[path.posix.basename(p)];
  await P.createProject({ name, template: 'empty', fromOutside: true });
  const files = [];
  const missing = [];
  const refused = [];   // (a path the import gate refuses, #2956)
  const sources = {};
  for (const f of parsed.files) {
    const target = safeRel(f.path, f.role === 'sim' ? 'sim' : 'src');
    if (target.reason) { refused.push(`${f.path}: not imported: ${target.reason}`); continue; }
    const text = lookup(f.path);
    if (typeof text === 'string') { await P.writeFile(name, target, text); sources[target] = text; } else missing.push(f.path);
    files.push({ path: target, lang: f.lang, role: f.role });
  }
  // ISE schematics -> Silinx schematics + their synchronized HDL
  const warnings = [...refused, ...parsed.warnings];
  if (parsed.schematics.length) {
    const schFiles = {}, roles = {};
    for (const x of parsed.schematics) {
      const target = safeRel(x.path, x.role === 'sim' ? 'sim' : 'src');
      if (target.reason) { warnings.push(`${x.path}: not imported: ${target.reason}`); continue; }
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
    const c = safeRel(parsed.constraints, 'constraints');
    if (c.reason) warnings.push(`${parsed.constraints}: not imported: ${c.reason}`);
    else {
      constraints = c;
      const text = lookup(parsed.constraints);
      if (typeof text === 'string') await P.writeFile(name, constraints, text); else missing.push(parsed.constraints);
    }
  }
  const saved = await P.updateProject(name, pj => Object.assign(pj, {
    device: parsed.device.part ? parsed.device : pj.device,
    top: parsed.top || '', simTop: parsed.simTop || '', topSourceType: parsed.topSourceType || 'hdl', files, constraints,
    impl: { ...pj.impl, ...parsed.impl },
    trusted: false,   // (a project from outside: trusted only once the user says so, #2830)
  }));
  return { project: saved, missing, warnings };
}

// Files ISE/ISim generate in a project folder: never imported (they are rebuilt by the flow).
export const ISE_OUTPUT = /(^|\/)(build|_ngo|xst|iseconfig|_xmsgs|isim|xlnx_auto_0_xdb|planAhead_run_\d+|\.Xil)\/|\.(ngc|ngd|ncd|ngr|ngm|pcf|bld|map|mrp|par|pad|twr|twx|xpi|unroutes|bgn|drc|bit|bin|mcs|prm|syr|lso|xrpt|xwbt|ptwx|cmd_log|stx|gise|wdb|exe|log|xmsgs|prj|cmd|ini|xreport|html|xml|vhf)$|(^|\/)\./i;

// inflate stops at the entry's declared size (core/zip.js: a zip bomb is refused, not inflated)
export const NODE_CODEC = { deflate: d => zlib.deflateRawSync(d), inflate: (d, limit) => zlib.inflateRawSync(d, limit === undefined ? {} : { maxOutputLength: Math.max(1, limit) }) };

// (the path as the import gate takes it, #2830: no hidden folder such as .git/, no build/, #2956; one that leaves the
// project, or is absolute, is the file's name in <dir>/; a String, else { reason } it is refused)
function safeRel(p, dir) {
  const norm = String(p).replace(/\\/g, '/');
  const n = normalizePath(norm);
  if (n.path) return n.path;
  const b = normalizePath(`${dir}/${path.posix.basename(norm)}`);
  return b.path || { reason: n.reason };
}
