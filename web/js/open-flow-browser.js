// The Silinx toolchain in the browser edition (the single-file Silinx-ISE.html, on GitHub Pages):
// Implement Design / Generate Programming File without any server or Xilinx tool. The flow is
// packages/silinx-fpga/src/open-flow-core.js, run in a Web Worker (web/js/open-flow-worker.js); the device descriptions,
// the bit database and Yosys (WebAssembly) are fetched from the site's assets/ folder (published
// with the page: .github/workflows/pages.yml).
import { unconstrainedPorts } from '/core/auto-pins.js';
import { isGeneratedSource, viewHdl } from '/core/view-hdl.js';
import { blackboxesIn } from '/core/c-blackbox.js';
import { compile } from '/core/compile.js';
import { synthEffort, s6OpenStatus } from '/packages/silinx-fpga/src/index.js';
import { modulesFromLibrary } from '/core/schdoc.js';
import { OPEN_STEPS, engineOf, orderOpenSteps, orderSteps, deviceFamily } from '/packages/silinx-fpga/src/parts.js';
import { ICE40_PARTS, ICE40_STEPS } from '/packages/silinx-fpga/src/index.js';

// the devices whose device description and bit database are published (packages/silinx-fpga/devices,
// packages/silinx-fpga/bitdb): device/package -> the description's file
export const BROWSER_DEVICES = {
  'xc3s100e/cp132': 'xc3s100ecp132-4.json.gz',
  'xc3s250e/cp132': 'xc3s250ecp132-4.json.gz',
  'xc3s500e/fg320': 'xc3s500efg320-4.json.gz',
  'xc3s1200e/fg320': 'xc3s1200efg320-4.json.gz',
  // the Spartan-6's (the Nexys3's, the Atlys's: their bit databases in bitdb/s6, #2103)
  'xc6slx16/csg324': 'xc6slx16csg324-3.json.gz',
  'xc6slx45/csg324': 'xc6slx45csg324-3.json.gz',
};
// The assets' layout, written into the page by its build (scripts/build-standalone.mjs, #487): the
// folder of this version's device descriptions and bit database under the site's assets/ (a release:
// its version; a development build: dev-<commit>), Yosys's bundle relative to it (shared by the
// versions with the same Yosys: ../vendor/yowasp-yosys/<its version>/gen/bundle.js), and the site the
// page opened from a file fetches them from (the site keeps the older releases' folders, so that a
// downloaded Silinx-ISE.html keeps the assets it was tested with). Unbuilt (tests): the folder itself.
const LAYOUT = globalThis.SILINX_ASSET_LAYOUT || { dir: '', yosys: 'vendor/yowasp-yosys/gen/bundle.js', nextpnr: 'vendor/nextpnr-spartan/gen/bundle.js', nextpnrIce40: 'vendor/nextpnr-ice40/gen/bundle.js', site: 'https://pmnmalo.github.io/Silinx-ISE/' };
// (and each asset's SHA-256, checked by the cache, web/js/asset-cache.js #1237: here, in the flow worker's messages
// and in the Yosys workers' code)
if (LAYOUT.integrity) globalThis.SILINX_ASSET_INTEGRITY ||= LAYOUT.integrity;

/** Where the assets are: next to the page when it is served (the site), else the site's (a page
 *  opened from a file); globalThis.SILINX_ASSETS (a test) replaces both. */
export function assetsBase(loc = globalThis.location) {
  if (globalThis.SILINX_ASSETS) return globalThis.SILINX_ASSETS;
  const page = loc && /^https?:$/.test(loc.protocol) ? loc.href : LAYOUT.site;
  return new URL(`assets/${LAYOUT.dir}`, page).href;
}
/** The site's assets/ folder, which holds every version's (pruneAssetCache, #967): the folder of this version's
 *  parent; unbuilt (tests), this version's itself. */
export const assetsRoot = (base = assetsBase()) => (LAYOUT.dir ? new URL('../', base).href : base);
/** The URL of Yosys's bundle (gen/bundle.js) for the assets at `base`. */
export const yosysBundleUrl = (base = assetsBase()) => new URL(LAYOUT.yosys, base).href;
/** The URL of nextpnr's bundle (its chip databases in ../chipdb beside it, #2136) for the assets at `base`. */
export const nextpnrBundleUrl = (base = assetsBase()) => new URL(LAYOUT.nextpnr || 'vendor/nextpnr-spartan/gen/bundle.js', base).href;

/** Can the browser edition implement a design for this device? { available, reason, part, family, graph, steps (the
 *  steps it has for the device, when not all of them: the Spartan-6's, as the server's openStatus) }. */
export function browserOpenStatus(device = {}) {
  const dev = String(device.part || '').toLowerCase(), pkg = String(device.package || '').toLowerCase();
  const speed = String(device.speed || '-4').replace(/^(?!-)/, '-');
  const part = `${dev}${pkg}${speed}`;
  const family = deviceFamily(device) || 'spartan3e';
  const list = Object.keys(BROWSER_DEVICES).map(k => k.replace('/', ' ')).join(', ');
  // (the iCE40, #2295: where nextpnr-ice40 is served, not in the published editions yet)
  if (family === 'ice40') {
    const name = `${dev}${pkg}`;
    if (!ICE40_PARTS.includes(dev.replace(/^ice40/, ''))) return { available: false, part: name, family, reason: `${dev}: not an iCE40 part of nextpnr-ice40` };
    return LAYOUT.nextpnrIce40 ? { available: true, part: name, family, reason: `${name}: nextpnr-ice40 and icepack (in the browser)` }
      : { available: false, part: name, family, reason: 'nextpnr-ice40 is not in this edition: use the local server' };
  }
  // (the Spartan-6, #2103: the parts of the Nexys3 and the Atlys)
  if (family === 'spartan6' && /^xc6slx\d+$/.test(dev)) {
    const s6 = s6OpenStatus(dev, pkg, part);
    if (!s6.available || !BROWSER_DEVICES[`${dev}/${pkg}`]) return { available: false, part, family, reason: s6.reason };
    return { available: true, part, family, graph: BROWSER_DEVICES[`${dev}/${pkg}`], steps: s6.steps, reason: `${s6.reason} (in the browser)` };
  }
  if (family !== 'spartan3e' || !/^xc3s\d+e$/.test(dev)) {
    return { available: false, part, family, reason: `the Silinx toolchain supports the Spartan-3E and the Nexys3's and Atlys's Spartan-6 only (${list}); other devices need Xilinx ISE, in the full application` };
  }
  if (!BROWSER_DEVICES[`${dev}/${pkg}`]) return { available: false, part, family, reason: `no device description of the ${dev} in the ${pkg} package yet (only ${list})` };
  return { available: true, part, family, graph: BROWSER_DEVICES[`${dev}/${pkg}`], reason: `${part}: device description and bit database (in the browser)` };
}

const ALIASES = { implement: 'par', impl: 'par', synthesize: 'synth', xst: 'synth', ngdbuild: 'translate', place: 'par', route: 'par', timing: 'trce', bit: 'bitgen' };
/** The steps of a run: the chain from synthesis to the last step asked for (packages/silinx-fpga/src/open-steps.js, as the server's openSteps). */
export function browserSteps(steps, { synthUpToDate = false, family = null } = {}) {
  if (family === 'ice40') {
    const asked = (Array.isArray(steps) ? steps : [steps]).filter(Boolean).map(s => ALIASES[String(s).toLowerCase()] || String(s).toLowerCase());
    const list = orderSteps(ICE40_STEPS, asked);
    return synthUpToDate && !asked.includes('synth') ? list.filter(s => s !== 'synth') : list;
  }
  const set = new Set((Array.isArray(steps) ? steps : [steps]).filter(Boolean).map(s => ALIASES[String(s).toLowerCase()] || String(s).toLowerCase()));
  const bad = [...set].filter(s => !OPEN_STEPS.includes(s));
  if (bad.length) throw new Error(`not available in the Silinx toolchain (they need Xilinx ISE, in the full application): ${bad.join(', ')}`);
  return orderOpenSteps(set, { synthUpToDate });
}

// One worker runs the flows (Yosys and the device descriptions stay loaded in it between runs). Its
// messages carry the run's id, so each run hears only its own; a run that is stopped, or a worker
// that fails, ends with the worker terminated (a new one starts with the next run).
let worker = null, runSeq = 0;
const runs = new Map();   // id -> { onData, fail }
function getWorker() {
  if (worker) return worker;
  // the single-file edition: the worker's code, embedded, started from a Blob as a classic worker (its
  // bundle has no imports): a file:// page is an opaque origin, from which Chrome refuses a module Blob
  // worker but starts a ISE style one (#512)
  const src = globalThis.SILINX_FLOW_WORKER_SRC;
  const w = src ? new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))) : new Worker('/js/open-flow-worker.js', { type: 'module' });
  w.onmessage = ({ data }) => runs.get(data.id)?.onData(data);
  w.onerror = e => stopWorker(new Error(`the Silinx toolchain could not start in this browser: ${e.message || 'the worker failed'}`));
  worker = w;
  return w;
}
/** Terminate the worker: its runs end with `error`. */
function stopWorker(error) {
  const w = worker;
  worker = null;
  w?.terminate();
  const failing = [...runs.values()];
  runs.clear();
  for (const r of failing) r.fail(error);
}

/**
 * Run the flow for a project. project: { name, top, device, board, files: [{ path, lang, role }],
 * constraints, impl }; files: { path: text } (the project's files, and build/ of an earlier run);
 * steps as the processes ask; resources: the part's (packages/silinx-fpga/src/resources.js resourcesOf), for the synthesis's used of available (#795); synthUpToDate ({ report }), the synthesis up to date (#280). onLine(line); onWrite(path, data) for each file of the build.
 * signal (an AbortSignal): Stop; the worker is terminated and the run rejects with { cancelled: true }.
 * Resolves { ok, report, error, view }.
 */
export async function runBrowserFlow({ project, files, steps, resources = null, synthUpToDate = null, onLine, onWrite = () => {}, onReport = () => {}, signal = null }) {
  const st = browserOpenStatus(project.device || {});
  if (!st.available) throw new Error(`the Silinx toolchain cannot implement this design: ${st.reason}`);
  const top = project.top;
  if (!top) throw new Error('the project has no top module');
  const sources = (project.files || []).filter(f => ['design', 'impl'].includes(f.role || 'design') && (f.lang === 'verilog' || f.lang === 'vhdl') && typeof files[f.path] === 'string')
    .map(f => ({ path: f.path, lang: f.lang, text: files[f.path] }));
  // the drawn sources without an HDL file (schematics, ASM charts, state diagrams, truth tables): their HDL made here (#177)
  const excluded = new Set(project.excluded || []);
  const viewPaths = Object.keys(files).filter(p => isGeneratedSource(p) && !excluded.has(p) && !p.startsWith('build/') && typeof files[p] === 'string');
  if (viewPaths.length) {
    let modules = {};
    try { modules = modulesFromLibrary(compile(sources), { sources: Object.fromEntries(sources.map(s => [s.path, s.text])) }); } catch { /* none */ }
    const hdlMods = new Set(Object.keys(modules).map(n => n.toLowerCase()));   // (a module an HDL file defines: that file)
    const hls = await blackboxesIn(Object.keys(files).filter(p => typeof files[p] === 'string'), p => files[p]);   // (#1903)
    for (const p of viewPaths) {
      // (a drawing whose HDL file is gone, deleted or removed from the project, is one without it: #231)
      const r = viewHdl(p, files[p], { lang: project.preferredLanguage, modules, linked: f => typeof files[f] === 'string' && (project.files || []).some(x => x.path === f), hls });
      if (!r || (r.text && hdlMods.has(String(r.module).toLowerCase()))) continue;
      for (const e of r.errors) onLine(`WARNING:Silinx - ${e}`);
      if (r.text) sources.push({ path: `${p}.${r.lang === 'vhdl' ? 'vhd' : 'v'}`, lang: r.lang, text: r.text });
    }
  }
  if (!sources.length) throw new Error('the project has no design HDL files');
  const ucf = project.constraints && typeof files[project.constraints] === 'string' ? files[project.constraints] : null;
  // the port bits without a pin: on a board they would go to arbitrary pins (refused, as the server does)
  // (the iCE40's constraints are PCF: its back end says the ports without a pin, #2295)
  const unplaced = st.family === 'ice40' ? [] : await unconstrainedPorts(sources, top, ucf || '');
  if (unplaced.length && project.board) throw new Error(`${unplaced.length} top-level port bit(s) have no pin location (LOC) for the ${project.board} board: ${unplaced.slice(0, 12).map(u => u.net).join(', ')}${unplaced.length > 12 ? ', …' : ''}. Assign them in I/O Pin Planning (or remove the board in Design Properties).`);
  if (unplaced.length) onLine(`WARNING:Silinx - ${unplaced.length} port bit(s) have no LOC constraint (${unplaced.slice(0, 8).map(u => u.net).join(', ')}${unplaced.length > 8 ? ', …' : ''}): the Silinx toolchain chooses their pins - do NOT program real hardware with this bitstream`);
  const dev = String(project.device.part).toLowerCase(), pkg = String(project.device.package).toLowerCase();
  const runSteps = browserSteps(steps, { synthUpToDate: !!synthUpToDate, family: st.family });
  // (a device with some of the steps only, as the server refuses the others: the Spartan-6's, #722)
  const missing = st.steps ? runSteps.filter(s => !st.steps.includes(s)) : [];
  if (missing.length) throw new Error(`the Silinx toolchain has no ${missing.join(', ')} for ${st.part} yet (only ${st.steps.join(', ')})`);
  const spec = { top, part: st.part, device: dev, pkg, family: st.family, graph: st.graph, steps: runSteps, seed: 1, effort: 1, startupClk: project.impl?.startupClk || 'JtagClk', engine: engineOf(project.impl), simTop: project.simTop || null, synthEffort: synthEffort(project.impl), ...(resources && { resources }) };
  if (synthUpToDate && !spec.steps.includes('synth')) spec.synthUpToDate = synthUpToDate;
  // the test benches, for the post-synthesis model's generics (#120)
  const simSources = (project.files || []).filter(f => f.role === 'sim' && (f.lang === 'verilog' || f.lang === 'vhdl') && typeof files[f.path] === 'string')
    .map(f => ({ path: f.path, lang: f.lang, text: files[f.path] }));
  onLine(`Silinx implementation with the Silinx toolchain, in the browser (no ISE): ${project.name} top=${top} device=${st.part}`);
  const earlier = {};
  for (const [k, v] of Object.entries(files)) if (k.startsWith('build/') && typeof v === 'string') earlier[k.slice(6)] = v;
  if (signal?.aborted) throw cancelled();
  const w = getWorker(), id = ++runSeq;
  return new Promise((resolve, reject) => {
    const end = () => { runs.delete(id); signal?.removeEventListener('abort', abort); };
    const abort = () => stopWorker(cancelled());
    runs.set(id, {
      onData: data => {
        if (data.line !== undefined) onLine(data.line);
        else if (data.write !== undefined) onWrite(data.write, data.data);
        else if (data.report !== undefined) onReport(data.report);
        else if (data.done) { end(); resolve(data.done); }
      },
      fail: e => { end(); reject(e); },
    });
    signal?.addEventListener('abort', abort, { once: true });
    w.postMessage({ id, spec, sources, simSources, ucf, ucfName: project.constraints ? project.constraints.split('/').pop() : null, files: earlier, assets: assetsBase(), yosys: yosysBundleUrl(), nextpnr: nextpnrBundleUrl(), nextpnrIce40: st.family === 'ice40' ? new URL(LAYOUT.nextpnrIce40, assetsBase()).href : null, integrity: LAYOUT.integrity || null });
  });
}

/**
 * What Implement of the project's device fetches (Yosys, the device description, its bit database; nextpnr and the device's
 * chip database unless the project's engine (impl, engineOf) is Silinx's, #2136), fetched into the
 * browser's Cache Storage by the flow's worker, in the background, when a project opens (#967): its first run does not
 * wait for 17 MB to download. Nothing in a page opened from a file (the single file: WebKit and Firefox give it a
 * Cache Storage, and a navigation that cancelled the download was a console error in WebKit, #1450), where there is
 * no Cache Storage, for a device the Silinx toolchain does not support, or once the device's are prepared.
 * Resolves { fetched, bytes, pruned } or null.
 */
const prepared = new Set();
export function prepareBrowserFlow(device = {}, impl = undefined) {
  const st = browserOpenStatus(device);
  if (!st.available || !st.graph || prepared.has(st.graph) || globalThis.location?.protocol === 'file:' || !globalThis.isSecureContext || !globalThis.caches) return Promise.resolve(null);
  prepared.add(st.graph);
  const w = getWorker(), id = ++runSeq;
  return new Promise(resolve => {
    runs.set(id, { onData: data => { if (data.done) { runs.delete(id); resolve(data.done); } }, fail: () => { runs.delete(id); prepared.delete(st.graph); resolve(null); } });
    w.postMessage({ id, prepare: { graph: st.graph, part: st.part, family: st.family, device: String(device.part).toLowerCase(), pkg: String(device.package).toLowerCase(), nextpnr: st.family === 'spartan3e' && engineOf(impl) !== 'silinx' }, assets: assetsBase(), yosys: yosysBundleUrl(), nextpnr: nextpnrBundleUrl(), root: assetsRoot(), integrity: LAYOUT.integrity || null });
  });
}

/** The error of a stopped run (as the server's JobCancelled). */
const cancelled = () => Object.assign(new Error('cancelled by user'), { cancelled: true });
