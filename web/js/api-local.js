// Standalone (server-less) backend: same interface as api.js. Used by the single-file build
// (dist/Silinx.html, on GitHub Pages). The projects are kept in the browser's localStorage, or,
// in Chrome / Edge, in a folder on the disk that the user picks (File ▸ Open Workspace Folder…: the
// File System Access API), each project a normal project folder in the full application's format
// (web/js/project-store.js: one storage layer for both).
// Implement Design / Generate Programming File run the Silinx toolchain in the browser
// (web/js/open-flow-browser.js: no server, no Xilinx tool); the build's files are kept in memory
// (they are too large for localStorage; in a workspace folder they are also written into the
// project's build/ folder, as the full application does, with build/reports.json and the FPGA
// view's model: read back from there after a reload) and the bitstream is downloaded. Configure
// Target Device programs the FPGA of a Digilent board over WebUSB (core/adept.js; Chrome / Edge),
// and its Platform Flash (core/xcf.js). XST (Xilinx ISE) needs the full application.
import { getDeviceDb, findPart } from '../../core/devices.js';
import { resourcesOf, openOnlyDevice, experimentalDevice, vivadoDevice, noFlowMessage, MODEL_VERSION } from '../../packages/silinx-fpga/src/parts.js';
import { exportCSources, exportXise, importXise, importIseSchematics, exportIseSchematics } from '../../core/xise.js';
import EXAMPLES from 'silinx-examples';
import { isCSource } from '../../core/view-hdl.js';
import { orderExamples } from '../../core/examples.js';
import TEST_DESIGNS from 'silinx-test-designs';
import { orderTestDesigns } from '../../core/test-designs.js';
import { createZip, browserCodec, textOf } from '../../core/zip.js';
import { GATE_LIMITS, gateEntries, gateMessages, gateZip } from '../../core/import-gate.js';
import { isTrusted, markUntrusted, untrustedMessage } from '../../core/trust.js';
import { runBrowserFlow, browserOpenStatus } from './open-flow-browser.js';
import { ADEPT_FILTERS, ADEPT_VENDOR, scanAdept, programAdept, bitHeader } from '../../core/adept.js';
import { adeptLink, runCapture, captureRecord } from '../../core/ila-link.js';
import { FTDI_FILTERS, FTDI_VENDOR, programIce40Flash } from '../../core/ftdi-ice40.js';
import { promAdept, PROM_OPS } from '../../core/xcf.js';
import { noWebUsb } from '../../core/webusb-support.js';
import { browserGit } from './git-browser.js';
import { browserStore, folderStore, projectOps, copyProjects, emptyProjectJson, projectFromZip, bundleEntries, safePath, saveBuildResults, readBuildResults, BUILD_VIEW, DEV_SITE } from './project-store.js';

const fail = msg => { throw new Error(msg); };

// ---- the project storage in use: the browser's storage, or a folder on the disk (Chrome / Edge)
const browser = browserStore();
let store = browser;
// (a new project from an example, or from a test design: #1746)
const ops = projectOps(() => store, { ...TEST_DESIGNS, ...EXAMPLES });
const projectJson = async name => (await store.load(name)).json;
// the logic analyzer's captures of this session (#3176), as build/capture.json by project
const sessionCaptures = new Map();

// the workspace folder's handle, remembered in IndexedDB between visits (a test replaces this with
// window.SILINX_WORKSPACE_HANDLES = { load, save }: a fake folder cannot be stored in IndexedDB)
const PREF = DEV_SITE ? 'silinx.dev.standalone.storage' : 'silinx.standalone.storage';   // 'folder': the folder is the storage in use
const IDB = { db: DEV_SITE ? 'silinx-dev-standalone' : 'silinx-standalone', store: 'handles', key: 'workspace' };
function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(IDB.db, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(IDB.store);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction(IDB.store, mode);
      const r = fn(tx.objectStore(IDB.store));
      tx.oncomplete = () => { open.result.close(); resolve(r?.result); };
      tx.onerror = () => { open.result.close(); reject(tx.error); };
    };
  });
}
const handles = () => globalThis.SILINX_WORKSPACE_HANDLES || {
  load: () => idb('readonly', s => s.get(IDB.key)),
  save: h => idb('readwrite', s => s.put(h, IDB.key)),
};
function pref(v) {
  try {
    if (v === undefined) return localStorage.getItem(PREF);
    if (v) localStorage.setItem(PREF, v); else localStorage.removeItem(PREF);
  } catch { /* ignore */ }
  return null;
}
const FOLDER_UNSUPPORTED = 'This browser cannot give a page a folder on the disk (File System Access API: Chrome or Edge); the projects are kept in the browser\'s storage';
let remembered = null;   // the folder's handle remembered from a previous visit / the one in use
let needsPermission = false;   // the browser asks for the permission again (a click: Reopen <folder>)
const folderSupported = () => typeof globalThis.showDirectoryPicker === 'function';
function use(next) {
  store = next;
  builds.clear();   // the builds belong to the projects of the storage left
}
const storageInfo = () => ({
  kind: store.kind, folder: store.kind === 'folder' ? store.label : null,
  remembered: remembered?.name || null, needsPermission, supported: folderSupported(), unsupportedReason: FOLDER_UNSUPPORTED,
});
async function useFolder(handle) {
  use(folderStore(handle));
  remembered = handle; needsPermission = false;
  pref('folder');
  try { await handles().save(handle); } catch { /* not remembered: picked again on the next visit */ }
  return storageInfo();
}
const READWRITE = { mode: 'readwrite' };

// ---- jobs: the Silinx toolchain's runs in the browser, and the operations that need the server
const jobs = new Map();
let jobSeq = 0;
/** The jobs kept: the running ones and the last finished ones (a finished job's download, a blob
 *  URL, is released with it). */
const KEEP_JOBS = 20;
function addJob(job) {
  jobs.set(job.id, job);
  const done = [...jobs.values()].filter(j => j.status !== 'running');
  for (const j of done.slice(0, Math.max(0, done.length - KEEP_JOBS))) {
    if (j.download?.url) URL.revokeObjectURL(j.download.url);
    jobs.delete(j.id);
  }
  return job;
}
function fakeJob(kind, lines, status = 'error', error) {
  const id = `local-${++jobSeq}`;
  addJob({ id, kind, status, lines, next: lines.length, error });
  return { job: id };
}
const FULL_APP = 'the full Silinx application (run `npm start` in the Silinx folder and open http://127.0.0.1:8642; File > Export Project (.zip)… moves a project there)';
// the board's Digilent USB, or an iCE40 board's FTDI (#2298): the user chooses it once; the browser remembers the permission
async function adeptDevice(vendor = ADEPT_VENDOR, filters = ADEPT_FILTERS) {
  const usb = globalThis.navigator?.usb;
  if (!usb) fail(noWebUsb());
  const known = (await usb.getDevices()).filter(d => d.vendorId === vendor);
  if (known.length) return known[0];
  try { return await usb.requestDevice({ filters }); } catch (e) {
    fail(e.name === 'NotFoundError' ? 'no board chosen: connect the board\'s USB cable, switch it on and choose it in the browser\'s list' : e.message);
  }
}
// a job that talks to the board: its log lines, then ok or the error (run(log, job))
function usbJob(kind, run) {
  const id = `local-${++jobSeq}`;
  const job = addJob({ id, kind, status: 'running', lines: [], next: 0, error: null, result: null });
  const push = l => { job.lines.push(l); job.next = job.lines.length; };
  run(push, job).then(result => { job.result = result; job.status = 'ok'; })
    .catch(e => { const m = e.message.replace(/^(Adept|FTDI) USB: /, ''); push(`ERROR: ${m}`); job.status = 'error'; job.error = m; });
  return { job: id };
}
// the bitstream: this session's build, else (a workspace folder) the one in the project's build/
async function bitOf(project, bitfile) {
  const b = builds.get(project)?.files[bitfile];
  if (b instanceof Uint8Array) return b;
  if (!project || !bitfile) return null;
  try { return await store.readBinary(project, bitfile); } catch { return null; }
}
const NEED_ISE = [
  'This project synthesizes with XST, which needs Xilinx ISE 14.7: not available in the browser edition.',
  'Choose Silinx as the synthesis tool (Project > Design Properties) to implement it here, with no Xilinx tool,',
  `or open it in ${FULL_APP} with ISE.`,
];
// the build of each project (this session only): { files: { 'build/…': text | bytes }, report, view }
const builds = new Map();
// none in this session: in a workspace folder, the one of an earlier visit, read back from the
// project's build/ folder (build/reports.json, build/open/fpga-view.json; as the full application)
async function savedBuild(name) {
  if (builds.get(name)?.report || store.kind !== 'folder') return builds.get(name) || null;
  const r = await readBuildResults(store, name, { modelVersion: MODEL_VERSION });
  if (!r.report) return null;
  const b = buildOf(name);
  if (!b.report) { b.report = r.report; b.view ||= r.view; }
  return b;
}
// a file of the build (text or bytes; undefined: none): this session's, else (a workspace folder)
// the one in the project's build/ folder (a reload: the pins file, the netlist, the reports)
async function buildFileOf(name, path) {
  const t = builds.get(name)?.files[path];
  if (t !== undefined || store.kind !== 'folder' || !/^build\//.test(path || '')) return t;
  return (await store.readBinary(name, path).catch(() => null)) ?? undefined;
}
const buildOf = name => { if (!builds.has(name)) builds.set(name, { files: {}, report: null, view: null }); return builds.get(name); };
// the simulation models of the earlier runs that this one did not make, while their files are in the build (#625:
// a run's report has only its own; the full application finds them by their files): the models kept
function keepModels(rep, earlier, b) {
  if (!earlier?.simModels || earlier.top !== rep.top) return rep;
  for (const [step, m] of Object.entries(earlier.simModels)) {
    if (!rep.simModels[step] && (store.kind === 'folder' || b.files[m.path] !== undefined)) rep.simModels[step] = m;
  }
  return rep;
}
// build/reports.json's shape (server/open-flow.js openReports) from the flow's report
function reportsOf(pj, r) {
  const out = { generatedAt: new Date().toISOString(), top: pj.top, device: pj.device || null, source: 'open', synthesis: r.synthesis, map: r.map, par: r.par, timing: r.timing, capture: r.capture,
    bit: r.bit ? { ...r.bit, header: { design: `${pj.top}.ncd`, part: `${String(pj.device.part).replace(/^xc/i, '')}${pj.device.package}` } } : undefined,
    prom: r.prom, pinsUcf: r.pinsUcf, simModels: r.simModels || {}, files: r.files || {} };
  out.summary = { synthesized: !!out.synthesis, mapped: !!out.map, routed: out.par ? out.par.routed : null, timingMet: out.timing ? out.timing.met : null,
    maxFreqMHz: out.timing?.maxFreqMHz ?? null, utilization: out.map?.summary || null, bitstream: !!out.bit };
  return out;
}

// an ISE project (.xise + its files) as a Silinx project: { json, files, warnings } (not stored)
function xiseProject(name, xise, files = {}) {
  const parsed = importXise(xise);
  const lookup = path => files[path] ?? files[path.split('/').pop()];
  const json = emptyProjectJson(name);
  const pfiles = {};
  // a path of the .xise that would leave the project (absolute, '..', a drive): its name alone, in dir
  const safe = (f, dir) => safePath(f) ?? `${dir}/${f.split(/[\\/]/).pop()}`;
  const out = [];
  const sources = {};
  for (const f of parsed.files) {
    const target = safe(f.path, f.role === 'sim' ? 'sim' : 'src');
    const text = lookup(f.path);
    if (typeof text === 'string') { pfiles[target] = text; sources[target] = text; }
    out.push({ path: target, lang: f.lang, role: f.role });
  }
  const warnings = [...parsed.warnings];
  if (parsed.schematics.length) {
    const schFiles = {}, roles = {};
    for (const x of parsed.schematics) {
      const target = safe(x.path, x.role === 'sim' ? 'sim' : 'src');
      const text = lookup(x.path);
      if (typeof text === 'string') { schFiles[target] = text; roles[target] = x.role; }
    }
    const symbols = {};
    for (const [k, v] of Object.entries(files)) if (/\.sym$/i.test(k)) symbols[k.split('/').pop()] = v;
    for (const r of importIseSchematics(schFiles, { sources, symbols, lang: parsed.lang, existing: k => files[k] })) {
      warnings.push(...r.warnings);
      if (!r.json) continue;
      pfiles[r.json] = r.jsonText; pfiles[r.hdl] = r.code;
      if (!out.some(f => f.path === r.hdl)) out.push({ path: r.hdl, lang: r.lang, role: roles[r.sch] || 'design' });
    }
  }
  let constraints = 'constraints/top.ucf';
  if (parsed.constraints) {
    constraints = safe(parsed.constraints, 'constraints');
    const text = lookup(parsed.constraints);
    if (typeof text === 'string') pfiles[constraints] = text;
  }
  Object.assign(json, { device: parsed.device.part ? parsed.device : json.device, top: parsed.top || '', simTop: parsed.simTop || '', topSourceType: parsed.topSourceType || 'hdl', files: out, constraints, impl: { ...json.impl, ...parsed.impl } });
  return { json, files: pfiles, warnings };
}

// the relays a shared project may go through (#3227): the site's, set when it is built (scripts/build-standalone.mjs,
// SILINX_SITE_RELAYS; none by default), its Content-Security-Policy's too
/* global __SILINX_SITE_RELAYS__ */
const SITE_RELAYS = typeof __SILINX_SITE_RELAYS__ !== 'undefined' ? __SILINX_SITE_RELAYS__ : [];

// git through GitHub's REST API (#3196)
const git = browserGit({ store: () => store, ops, prefix: DEV_SITE ? 'silinx.dev.' : 'silinx.' });

export const api = {
  standalone: true,
  collabRelays: async () => [...SITE_RELAYS],
  ...git,
  devSite: DEV_SITE,
  // ---- where the projects are kept
  storage: () => storageInfo(),
  // a deleted / replaced project goes to the workspace .trash folder (in the browser's storage: deleted)
  get keepsTrash() { return store.kind === 'folder'; },
  // at start-up: the folder of the previous visit, if it was the storage in use and the browser
  // still gives the permission; otherwise its name for Reopen <folder> (asking needs a click)
  initStorage: async () => {
    let h = null;
    try { h = await handles().load(); } catch { /* none */ }
    if (!h || !folderSupported()) return storageInfo();
    remembered = h;
    if (pref() !== 'folder') return storageInfo();
    let state = 'prompt';
    try { state = await h.queryPermission(READWRITE); } catch { /* ask */ }
    if (state === 'granted') use(folderStore(h));
    else needsPermission = true;
    return storageInfo();
  },
  // File ▸ Open Workspace Folder…: null when the user cancels the picker
  openWorkspaceFolder: async () => {
    if (!folderSupported()) fail(FOLDER_UNSUPPORTED);
    let h;
    try { h = await globalThis.showDirectoryPicker({ id: 'silinx-workspace', mode: 'readwrite' }); } catch (e) {
      if (e.name === 'AbortError') return null;
      throw e;
    }
    if (await h.queryPermission(READWRITE) !== 'granted' && await h.requestPermission(READWRITE) !== 'granted') fail(`no permission to write in the folder '${h.name}'`);
    return useFolder(h);
  },
  // Reopen <folder> (the Start page): the browser asks for the permission again
  reopenWorkspaceFolder: async () => {
    if (!remembered) fail('no workspace folder to reopen: use File > Open Workspace Folder…');
    let state = 'prompt';
    try { state = await remembered.queryPermission(READWRITE); } catch { /* ask */ }
    if (state !== 'granted') state = await remembered.requestPermission(READWRITE);
    if (state !== 'granted') fail(`no permission to write in the folder '${remembered.name}'`);
    return useFolder(remembered);
  },
  useBrowserStorage: async () => { use(browser); needsPermission = false; pref(null); return storageInfo(); },
  // the projects of the browser's storage into the folder in use ({ copied, skipped: already there })
  copyBrowserProjectsToFolder: async () => {
    if (store.kind !== 'folder') fail('no workspace folder open');
    return copyProjects(browser, store);
  },
  browserProjects: async () => (await browser.list()).map(j => j.name),

  // ---- projects
  projects: () => ops.list(),
  templates: async () => orderExamples(Object.keys(EXAMPLES)),
  testDesigns: async () => orderTestDesigns(Object.keys(TEST_DESIGNS)),
  // an example's description and files ({ project, files: { path: text } }, #2826)
  exampleFiles: async name => (Object.hasOwn(EXAMPLES, name) ? { project: structuredClone(EXAMPLES[name].json), files: { ...EXAMPLES[name].files } } : fail(`unknown example '${name}'`)),
  createProject: p => ops.create(p),
  project: name => ops.project(name),
  saveProject: (name, pj) => ops.saveProject(name, pj),
  trustProject: name => ops.trustProject(name),
  renameFile: (name, from, to) => ops.renameFile(name, from, to),
  deleteProject: async name => { const r = await ops.deleteProject(name); await git.gitForget(name); return r; },
  // a file of the build (build/…: not among the project's files): this session's, else (a
  // workspace folder) the one in the project's build/ folder
  readFile: async (name, path) => {
    if (path === 'build/capture.json' && sessionCaptures.has(name)) return sessionCaptures.get(name);
    try { return await ops.readFile(name, path); } catch (e) {
      if (!/^build\//.test(path || '')) throw e;
      const t = await buildFileOf(name, path);
      if (t == null) throw e;
      return typeof t === 'string' ? t : new TextDecoder().decode(t);
    }
  },
  writeFile: (name, path, text) => ops.writeFile(name, path, text),
  deleteFile: (name, path, opts) => ops.deleteFile(name, path, opts),
  sources: name => ops.sources(name),
  devices: async () => getDeviceDb(),
  toolchain: async () => ({
    platform: 'browser', configPath: '(browser edition)',
    config: { mode: 'silinx', local: { settings: '' }, docker: { image: '', settings: '' }, ssh: { host: '', user: '', port: 22, remoteDir: '', settings: '' }, programmer: { tool: '', cable: '' }, open: { iseMode: 'docker' } },
    // the Silinx toolchain runs in the browser (Spartan-3E); XST (Xilinx ISE) does not
    ise: { mode: 'silinx', available: true, reason: 'the Silinx toolchain, in the browser (no Xilinx tool)', help: NEED_ISE.join(' ') },
    programmers: {}, helpers: {},
  }),
  saveToolchain: async () => api.toolchain(),
  openStatus: async name => browserOpenStatus((await projectJson(name)).device || {}),
  implement: async (name, { steps, synthUpToDate = false } = {}) => {
    const p = await store.load(name);
    // (the Artix-7's: the Silinx toolchain's 7-series back end, #3143)
    if (experimentalDevice(p.json.device) && !vivadoDevice(p.json.device)) return fakeJob('implement', [`ERROR: ${noFlowMessage(p.json.device)}`], 'error', noFlowMessage(p.json.device));
    if (p.json.synthTool === 'xst' && !openOnlyDevice(p.json.device)) return fakeJob('implement', NEED_ISE, 'error', 'XST needs Xilinx ISE 14.7 (choose Silinx as the synthesis tool in Design Properties)');
    const id = `local-${++jobSeq}`;
    const job = addJob({ id, kind: 'implement', status: 'running', lines: [], next: 0, error: null });
    // Stop (cancelJob): the flow's worker is terminated, nothing of the run is written after it
    const ctl = new AbortController();
    job.cancel = () => ctl.abort();
    // (the synthesis up to date, #280: what the last run's report said about it)
    const earlier = (await savedBuild(name))?.report || null;
    const before = synthUpToDate ? earlier : null;
    const b = buildOf(name);
    const push = l => { job.lines.push(l); job.next = job.lines.length; };
    // the outputs of a previous run no longer match the design (a failure must not leave a bitstream)
    for (const k of Object.keys(b.files)) if (/^build\/[^/]+(\.bit|\.bin|_pins\.ucf)$|^build\/open\/(placed|routed)\.xdl$|^build\/open\/timing\.txt$/.test(k)) delete b.files[k];
    b.view = null;
    // a workspace folder: the build's files also go into the project's build/ folder
    const folder = store.kind === 'folder' ? store : null;
    const writes = [];
    if (folder && p.json.top) for (const f of [`build/${p.json.top}.bit`, `build/${p.json.top}_pins.ucf`]) await folder.removePath(name, f).catch(() => {});
    if (folder) await folder.removePath(name, BUILD_VIEW).catch(() => {});
    let reported = false;
    const json = p.json, files = { ...p.files };
    runBrowserFlow({
      project: json, files: { ...files, ...b.files }, steps,
      // (the part's resources: the synthesis's used of available and its check, #795)
      resources: findPart(json.device?.part) ? resourcesOf(findPart(json.device.part), json.device.package) : null,
      synthUpToDate: synthUpToDate ? { report: before ? { synthesis: before.synthesis, files: { netlist: before.files?.netlist, synthesis: before.files?.synthesis } } : null } : null,
      onLine: push, signal: ctl.signal,
      onWrite: (path, data) => {
        if (job.cancelled) return;
        b.files[path] = data;
        if (folder) writes.push(folder.writeBuild(name, path, data).catch(e => push(`WARNING: ${path} was not written into the workspace folder: ${e.message}`)));
      },
      onReport: r => { if (!job.cancelled) { b.report = keepModels(reportsOf(json, r), earlier, b); reported = true; } },
    }).then(async res => {
      await Promise.all(writes);
      if (job.cancelled) throw Object.assign(new Error('cancelled by user'), { cancelled: true });
      if (res.report) { b.report = keepModels(reportsOf(json, res.report), earlier, b); reported = true; }
      if (res.view) b.view = res.view;
      // the Design Summary's reports and the FPGA view's model, for the next visit (as the full application)
      if (folder) {
        await saveBuildResults(folder, name, { report: reported ? b.report : null, view: b.view, modelVersion: MODEL_VERSION })
          .catch(e => push(`WARNING: build/reports.json was not written into the workspace folder: ${e.message}`));
      }
      const bit = b.files[`build/${json.top}.bit`];
      if (res.ok && bit) job.download = { filename: `${json.top}.bit`, url: URL.createObjectURL(new Blob([bit], { type: 'application/octet-stream' })) };
      job.status = res.ok ? 'ok' : 'error';
      job.error = res.ok ? null : `Silinx toolchain failed${res.error ? `: ${res.error}` : ''}`;
    }).catch(e => { if (!e.cancelled) push(`ERROR:Silinx - ${e.message}`); job.status = 'error'; job.error = e.message; });
    return { job: id };
  },
  reports: async name => ((await savedBuild(name))?.report || { available: false }),
  fpgaView: async name => ((await savedBuild(name))?.view || { available: false, reason: 'no-ncd' }),
  buildFile: (name, path) => buildFileOf(name, path),
  bitinfo: async name => {
    let top = null;
    try { top = (await projectJson(name)).top; } catch { /* no project */ }
    // (an iCE40's .bin: its size, #2298)
    const bin = top && await bitOf(name, `build/${top}.bin`);
    if (bin) return { available: true, size: bin.length, ice40: true };
    const bit = top && await bitOf(name, `build/${top}.bit`), hd = bit && bitHeader(bit);
    return hd ? { available: true, designName: hd.design, part: `${hd.part}${hd.package}`, date: hd.date, time: hd.time } : { available: false, reason: 'no bitstream in this browser' };
  },
  // { project, bitfile, bitData? (a .bit chosen from the disk) }
  program: async ({ project, bitfile, bitData } = {}) => usbJob('program', async log => {
    const pjb = project && await projectJson(project);
    if (project && !isTrusted(pjb)) fail(untrustedMessage(project, 'programming the board', pjb));   // (#2830)
    // an iCE40's .bin: into its board's SPI flash, through its FT2232H (#2298)
    if (/\.bin$/i.test(bitfile || '')) {
      const bin = await bitOf(project, bitfile);
      if (!bin) fail(`no ${bitfile} in this browser: run Generate Programming File first`);
      return programIce40Flash(await adeptDevice(FTDI_VENDOR, FTDI_FILTERS), bin, { log });
    }
    const bit = bitData || await bitOf(project, bitfile);
    if (!bit) fail(`no bitstream ${bitfile || ''} in this browser: run Generate Programming File first, or choose a .bit file`);
    let part = null;
    try { part = project ? (await projectJson(project)).device?.part : null; } catch { /* a .bit from the disk */ }
    return programAdept(await adeptDevice(), bit, { part, log });
  }),
  scan: async () => usbJob('scan', async log => scanAdept(await adeptDevice(), { log })),
  // the logic analyzer's capture (#3176): the core's spec and probes the page made (web/js/capture-ui.js, as Implement
  // inserts it), over the board's Adept USB; the capture kept as this session's build/capture.json
  capture: async (name, { spec, probes, top, clock, arm = true, timeoutS = 10 } = {}) => usbJob('capture', async log => {
    if (!spec) fail('the capture\'s settings do not fit the design: Logic Analyzer Settings');
    const link = await adeptLink(await adeptDevice(), spec, { log });
    let cap;
    try { cap = await runCapture(link, spec, { arm, timeoutMs: timeoutS * 1000, log }); } finally { await link.close(); }
    const capture = captureRecord({ top, clock, spec, probes, cap });
    sessionCaptures.set(name, JSON.stringify(capture, null, 1));
    return { capture, file: 'build/capture.json' };
  }),
  // the Platform Flash (core/xcf.js): { project, op, bitfile, bitData? (a .bit chosen from the disk),
  // verify, reconfigure }; the lines of the full application's (server/programmer.js promJob); a
  // backup (read) is downloaded
  prom: async ({ project, op, bitfile, bitData, verify = true, reconfigure = false } = {}) => usbJob('prom', async (log, job) => {
    const pjp = project && await projectJson(project);
    if (project && !isTrusted(pjp)) fail(untrustedMessage(project, 'programming the PROM', pjp));   // (#2830)
    if (!PROM_OPS.includes(op)) fail(`unknown PROM operation '${op}' (valid: ${PROM_OPS.join(', ')})`);
    let bit = null;
    if (op === 'program' || op === 'verify') {
      bit = bitData || await bitOf(project, bitfile);
      if (!bit) fail(`no bitstream ${bitfile || ''} in this browser: run Generate Programming File first (it writes build/<top>_prom.bit for the PROM), or choose a .bit file`);
      const hd = bitHeader(bit);
      if (!hd) fail(`${bitfile || 'the file'} is not a .bit file`);
      log(`PROM image ${bitfile}: design ${hd.design}, part ${hd.part.replace(/^xc/, '')}${hd.package}, built ${hd.date} ${hd.time}`);
      if (!/_prom\.bit$/i.test(bitfile || '')) log('WARNING: this does not look like a PROM bitstream (built with StartUpClk:Cclk); a JTAG-clock bitstream will not boot from flash.');
    }
    log(`Platform Flash: ${op}${reconfigure && op === 'program' ? ' + reload FPGA from PROM' : ''}`);
    const r = await promAdept(await adeptDevice(), { op, bit, verify, reconfigure: op === 'program' && reconfigure, log });
    if (r.data) {
      const filename = `prom-${new Date().toISOString().replace(/[:.]/g, '-')}.bin`;
      job.download = { filename, url: URL.createObjectURL(new Blob([r.data], { type: 'application/octet-stream' })) };
      log(`PROM backup: ${filename} (${r.data.length} bytes)`);
    }
    log(`Platform Flash ${op} finished.`);
    return { op, prom: r.prom };
  }),
  job: async (id, since = 0) => {
    const j = jobs.get(id) || fail(`job '${id}' not found`);
    return { ...j, lines: j.lines.slice(+since), next: j.lines.length };
  },
  // as the server's: a running job that can stop (an implementation) is told to, and ends with
  // status 'error' ('cancelled by user'); the USB jobs run to their end (a board half programmed)
  cancelJob: async id => {
    const j = jobs.get(id) || fail(`job '${id}' not found`);
    if (j.status === 'running' && j.cancel && !j.cancelled) {
      j.cancelled = true;
      j.lines.push('*** cancel requested ***'); j.next = j.lines.length;
      j.cancel();
    }
    return { ...j, lines: [], next: j.lines.length };
  },
  // the .xise and its files through the import gate (#2830), as the server's import-xise route
  importXise: async ({ name, xise, files = {} }) => {
    const g = gateEntries([{ path: 'project.xise', data: xise }, ...Object.entries(files).map(([path, data]) => ({ path, data }))]);
    const x = g.files.find(f => f.path === 'project.xise') ?? fail(`the .xise: ${g.refusals.find(r => r.path === 'project.xise')?.reason}`);
    const r = xiseProject(name, x.text, Object.fromEntries(g.files.filter(f => f !== x && f.text != null).map(f => [f.path, f.text])));
    return { project: await ops.put(name, markUntrusted(r.json), r.files), warnings: [...gateMessages(g), ...r.warnings] };
  },
  syncXise: async () => fail('not available in the standalone edition (use File > Export Project (.zip)…, Xilinx ISE)'),
  exportZip: async (name, kind = 'xilinx') => {
    const p = await store.load(name);
    if (kind === 'silinx') {   // the whole Silinx project as it is
      const entries = [{ path: 'silinx.json', data: JSON.stringify(p.json, null, 2) + '\n' },
        ...Object.entries(p.files).filter(([k]) => !/\.xise$/i.test(k)).map(([path, data]) => ({ path, data }))];
      return { blob: new Blob([await createZip(entries, browserCodec())], { type: 'application/zip' }), filename: `${name}-silinx.zip`, warnings: [] };
    }
    const docs = {};
    for (const [k, v] of Object.entries(p.files)) if (/\.sch\.json$/i.test(k)) { try { docs[k] = JSON.parse(v); } catch { /* skip */ } }
    const sch = exportIseSchematics(p.json, docs, p.files);
    // C sources go out as their HDL (#2320)
    const c = exportCSources(p.json, Object.fromEntries(Object.entries(p.files).filter(([k]) => isCSource(k))), p.files);
    const sources = { ...p.files, ...Object.fromEntries(c.files.map(f => [f.path, f.text])) };
    const xml = exportXise(p.json, { sources, schematics: sch.schematics, extraFiles: [...sch.extraFiles, ...c.extraFiles] });
    const generated = [...sch.files, ...c.files];
    const added = new Set(generated.map(f => f.path));
    // Xilinx ISE project: no Silinx-only files (silinx.json, ASM charts, Silinx schematics)
    const entries = [{ path: `${name}.xise`, data: xml },
      ...generated.map(f => ({ path: f.path, data: f.text })),
      ...Object.entries(p.files).filter(([k]) => k !== `${name}.xise` && !added.has(k) && !isCSource(k) && !/(^|\/)[^/]+\.(asm|sch|tt|bool|fsm)\.json$/i.test(k)).map(([path, data]) => ({ path, data }))];
    return { blob: new Blob([await createZip(entries, browserCodec())], { type: 'application/zip' }), filename: `${name}.zip`, warnings: [...sch.warnings, ...c.warnings] };
  },
  // the zip's entries as a project (project-store.js projectFromZip: every path inside the project,
  // silinx.json normalised, what was dropped in the warnings), then stored
  // (through the import gate, #2830: its caps checked while the zip is read, each entry's name and content)
  // an old project bundle (.silinx.json, #3548) is read as such a zip: its silinx.json and its files
  importZip: async (name, file) => {
    if (file.size > GATE_LIMITS.maxArchive) fail(`the zip is larger than ${GATE_LIMITS.maxArchive >> 20} MB, the most an import takes`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const bundle = bytes[0] === 0x50 ? null : bundleEntries(new TextDecoder().decode(bytes));   // (a zip starts with 'PK')
    let gated;
    try { gated = bundle ? gateEntries(bundle) : await gateZip(bytes, browserCodec()); } catch (e) { fail(e.message); }
    const p = projectFromZip(name, gated, { xiseProject, textOf });
    if (await store.exists(name)) fail(`project '${name}' already exists`);
    return { project: await ops.put(name, p.json, p.files), missing: p.missing, warnings: p.warnings };
  },
};

// as api.js's: the lines as they come, until the job ends (the browser flow runs in a Web Worker)
export async function followJob(id, onLine) {
  let since = 0;
  for (;;) {
    const j = await api.job(id, since);
    for (const l of j.lines) onLine(l);
    since = j.next;
    if (j.status !== 'running') return j;
    await new Promise(r => setTimeout(r, 150));
  }
}
