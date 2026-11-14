// The Silinx toolchain in the browser edition (the single-file Silinx.html, on GitHub Pages):
// Implement Design / Generate Programming File without any server or Xilinx tool. The flow is
// packages/silinx-fpga/src/open-flow-core.js, run in a Web Worker (web/js/open-flow-worker.js); the device descriptions,
// the bit database and Yosys (WebAssembly) are fetched from the site's assets/ folder (published
// with the page: .github/workflows/pages.yml).
import { unconstrainedPorts } from '/core/auto-pins.js';
import { isGeneratedSource, viewHdl } from '/core/view-hdl.js';
import { blackboxesIn, blackboxModels } from '/core/c-blackbox.js';
import { compile } from '/core/compile.js';
import { synthEffort, synthGoal, s6OpenStatus } from '/packages/silinx-fpga/src/index.js';
import { modulesFromLibrary } from '/core/schdoc.js';
import { OPEN_STEPS, engineOf, s6MapOf, xc7SeedsOf, orderOpenSteps, orderSteps, deviceFamily, constraintsFormatOf } from '/packages/silinx-fpga/src/parts.js';
import { familyProfile } from '/core/family-profile.js';

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
// downloaded Silinx.html keeps the assets it was tested with). Unbuilt (tests): the folder itself.
const LAYOUT = globalThis.SILINX_ASSET_LAYOUT || { dir: '', yosys: 'vendor/yowasp-yosys/gen/bundle.js', nextpnr: 'vendor/nextpnr-spartan/gen/bundle.js', nextpnrS6: 'vendor/nextpnr-spartan6/gen/bundle.js', nextpnrXc7: 'vendor/nextpnr-xc7/gen/bundle.js', nextpnrIce40: 'vendor/nextpnr-ice40/gen/bundle.js', nextpnrEcp5: 'vendor/nextpnr-ecp5/gen/bundle.js', nextpnrGowin: 'vendor/nextpnr-himbaechel-gowin/gen/bundle.js', site: 'https://pmnmalo.github.io/Silinx/' };
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
/** The URL of the Spartan-6's nextpnr bundle (nextpnr-himbaechel-spartan6, its chip databases in ../chipdb, #2288). */
export const nextpnrS6BundleUrl = (base = assetsBase()) => new URL(LAYOUT.nextpnrS6 || 'vendor/nextpnr-spartan6/gen/bundle.js', base).href;
/** The URL of the 7-series' nextpnr bundle (nextpnr-himbaechel-xc7, its chip databases in ../chipdb, #3143). */
export const nextpnrXc7BundleUrl = (base = assetsBase()) => new URL(LAYOUT.nextpnrXc7 || 'vendor/nextpnr-xc7/gen/bundle.js', base).href;
// the nextpnr bundle of a family of Silinx's nextpnr packages (its profile's layout: the 7-series'; the Spartan-6's, the Spartan-3E's)
const nextpnrOf = family => { const f = familyProfile(family).openFlow; return f?.layout === 'nextpnrXc7' ? nextpnrXc7BundleUrl() : f?.bitDb === 's6' ? nextpnrS6BundleUrl() : nextpnrBundleUrl(); };
/** Where a family's YoWASP tools are (its profile's openFlow): the URL of their bundle (the local server's), or their
 *  package's { url, integrity } on npm's registry (the published editions', #2444); null when this edition has neither. */
export function ownBundle(flow, base = assetsBase()) {
  if (LAYOUT[`${flow.layout}Package`]) return LAYOUT[`${flow.layout}Package`];
  return LAYOUT[flow.layout] ? new URL(LAYOUT[flow.layout], base).href : null;
}
// what the worker loads of a family's YoWASP tools: { family, where, tools, mb } (null: a family with none)
function ownTools(family) {
  const f = familyProfile(family).openFlow;
  return f?.package ? { family, where: ownBundle(f), tools: toolsOf(f), mb: f.mb } : null;
}
// a family's YoWASP tools by name: its nextpnr and its packer (the Gowin's Silinx's port of gowin_pack, #2303)
const toolsOf = f => `${f.tools} and ${f.packer}`;
// does Implement of a family run nextpnr? The Spartan-3E's and the Spartan-6's (#2136, #2288, #2137: nextpnr, the one engine)
const usesNextpnr = family => !!familyProfile(family).openFlow?.nextpnr;

/** Can the browser edition implement a design for this device? { available, reason, part, family, graph, steps (the
 *  steps it has for the device, when not all of them: the Spartan-6's, as the server's openStatus) }. */
export function browserOpenStatus(device = {}) {
  const dev = String(device.part || '').toLowerCase(), pkg = String(device.package || '').toLowerCase();
  const speed = String(device.speed || '-4').replace(/^(?!-)/, '-');
  const part = `${dev}${pkg}${speed}`;
  const family = deviceFamily(device) || 'spartan3e';
  const list = Object.keys(BROWSER_DEVICES).map(k => k.replace('/', ' ')).join(', ');
  const flow = familyProfile(family).openFlow;   // (the family's open flow, #2310)
  // (a family of YoWASP's tools, the iCE40's #2295, the ECP5's #2302: its nextpnr served by the local server, or the published
  // editions' download from npm's registry, #2444)
  if (flow?.package) {
    const name = `${dev}${String(device.speed || '').replace(/^(?=\d)/, '-')}${pkg}`;
    if (!flow.parts.test(dev)) return { available: false, part: name, reason: `${dev}: not ${flow.partOf} of ${flow.tools}` };
    return ownBundle(flow) ? { available: true, part: name, family, reason: `${name}: ${toolsOf(flow)} (in the browser)` }
      : { available: false, part: name, reason: `${flow.tools} is not in this edition: use the local server` };
  }
  // (the Spartan-6, #2103: the parts of the Nexys3 and the Atlys)
  if (flow?.bitDb === 's6' && flow.parts.test(dev)) {
    const s6 = s6OpenStatus(dev, pkg, part);
    if (!s6.available || !BROWSER_DEVICES[`${dev}/${pkg}`]) return { available: false, part, family, reason: s6.reason };
    return { available: true, part, family, graph: BROWSER_DEVICES[`${dev}/${pkg}`], steps: s6.steps, reason: `${s6.reason} (in the browser)` };
  }
  // (the 7-series, #3143: Project X-Ray's bit database of the part in bitdb/xc7, the parts the build found there, LAYOUT.xc7Parts;
  // unbuilt, the worker's fetch says whether the site has it)
  if (flow?.bitDb === 'xc7' && flow.parts.test(dev)) {
    const parts = LAYOUT.xc7Parts;
    if (parts && !parts.includes(part)) return { available: false, part, family, reason: `no 7-series bit database for the ${part} yet (only ${parts.join(', ') || 'none'}): use AMD Vivado, in the full application` };
    return { available: true, part, family, graph: null, bitDb: `xc7/${part}.json.gz`, reason: `${part}: nextpnr-himbaechel (xilinx) and Project X-Ray's bit database (in the browser; the 7-series, an experimental family)` };
  }
  if (!flow?.parts?.test(dev)) {
    return { available: false, part, family, reason: `the Silinx toolchain supports the Spartan-3E and the Nexys3's and Atlys's Spartan-6 (${list}), and the Artix-7, only; other devices need Xilinx ISE, in the full application` };
  }
  if (!BROWSER_DEVICES[`${dev}/${pkg}`]) return { available: false, part, family, reason: `no device description of the ${dev} in the ${pkg} package yet (only ${list})` };
  return { available: true, part, family, graph: BROWSER_DEVICES[`${dev}/${pkg}`], reason: `${part}: device description and bit database (in the browser)` };
}

const ALIASES = { implement: 'par', impl: 'par', synthesize: 'synth', xst: 'synth', ngdbuild: 'translate', place: 'par', route: 'par', timing: 'trce', bit: 'bitgen' };
/** The steps of a run: the chain from synthesis to the last step asked for (packages/silinx-fpga/src/open-steps.js, as the server's openSteps). */
export function browserSteps(steps, { synthUpToDate = false, family = null } = {}) {
  const own = familyProfile(family).openFlow?.steps;   // (a family with its own tools' steps: the iCE40's, the ECP5's)
  if (own) {
    const asked = (Array.isArray(steps) ? steps : [steps]).filter(Boolean).map(s => ALIASES[String(s).toLowerCase()] || String(s).toLowerCase());
    const list = orderSteps(own, asked);
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
    const models = blackboxModels(hls);   // (a blackbox's C model: the C simulation's, not a module, #2854)
    for (const p of viewPaths.filter(v => !models.has(v))) {
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
  const unplaced = constraintsFormatOf(project.device) === 'ucf' ? await unconstrainedPorts(sources, top, ucf || '') : [];   // (a UCF's: the iCE40, the 7-series warn in their own flows)
  if (unplaced.length && project.board) throw new Error(`${unplaced.length} top-level port bit(s) have no pin location (LOC) for the ${project.board} board: ${unplaced.slice(0, 12).map(u => u.net).join(', ')}${unplaced.length > 12 ? ', …' : ''}. Assign them in I/O Pin Planning (or remove the board in Design Properties).`);
  if (unplaced.length) onLine(`WARNING:Silinx - ${unplaced.length} port bit(s) have no LOC constraint (${unplaced.slice(0, 8).map(u => u.net).join(', ')}${unplaced.length > 8 ? ', …' : ''}): the Silinx toolchain chooses their pins - do NOT program real hardware with this bitstream`);
  const dev = String(project.device.part).toLowerCase(), pkg = String(project.device.package).toLowerCase();
  const runSteps = browserSteps(steps, { synthUpToDate: !!synthUpToDate, family: st.family });
  // (a device with some of the steps only, as the server refuses the others: the Spartan-6's, #722)
  const missing = st.steps ? runSteps.filter(s => !st.steps.includes(s)) : [];
  if (missing.length) throw new Error(`the Silinx toolchain has no ${missing.join(', ')} for ${st.part} yet (only ${st.steps.join(', ')})`);
  const spec = { top, part: st.part, device: dev, pkg, speed: String(project.device.speed || ''), family: st.family, graph: st.graph, steps: runSteps, seed: 1, effort: 1, startupClk: project.impl?.startupClk || 'JtagClk', engine: engineOf(project.impl), s6Map: s6MapOf(project.impl), xc7Seeds: xc7SeedsOf(project.impl), simTop: project.simTop || null, synthEffort: synthEffort(project.impl), synthGoal: synthGoal(project.impl), ...(resources && { resources }) };
  if (synthUpToDate && !spec.steps.includes('synth')) spec.synthUpToDate = synthUpToDate;
  // (the logic analyzer's capture, inserted by the front end: core/flow-ide.js, #3176)
  if (project.capture) spec.capture = project.capture;
  // the test benches, for the post-synthesis model's generics (#120)
  const simSources = (project.files || []).filter(f => f.role === 'sim' && (f.lang === 'verilog' || f.lang === 'vhdl') && typeof files[f.path] === 'string')
    .map(f => ({ path: f.path, lang: f.lang, text: files[f.path] }));
  onLine(`Silinx implementation with the Silinx toolchain, in the browser (no ISE): ${project.name} top=${top} device=${st.part}`);
  const earlier = {};
  for (const [k, v] of Object.entries(files)) if (k.startsWith('build/') && typeof v === 'string') earlier[k.slice(6)] = v;
  if (signal?.aborted) throw cancelled();
  return workerRun({ spec, sources, simSources, ucf, ucfName: project.constraints ? project.constraints.split('/').pop() : null, files: earlier, assets: assetsBase(), yosys: yosysBundleUrl(), nextpnr: nextpnrBundleUrl(), nextpnrS6: nextpnrS6BundleUrl(), nextpnrXc7: nextpnrXc7BundleUrl(), nextpnrOwn: ownTools(st.family), integrity: LAYOUT.integrity || null }, { onLine, onWrite, onReport, signal });
}

// one run in the worker: its lines, files and report to the handlers; resolves its done ({ ok, report, error, view })
function workerRun(message, { onLine, onWrite = () => {}, onReport = () => {}, signal = null }) {
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
    w.postMessage({ id, ...message });
  });
}

/**
 * The flow on a spec made elsewhere (core/grade-synth.js synthesisSpec: a synthesis test's, #3216) and design sources,
 * in the worker as Implement's runs: onLine(line); signal stops it (rejects with { cancelled: true }). Resolves
 * { ok, report, error }.
 */
export function runBrowserSpec({ spec, sources, onLine, signal = null }) {
  if (signal?.aborted) return Promise.reject(cancelled());
  return workerRun({ spec, sources, simSources: [], ucf: null, ucfName: null, files: {}, assets: assetsBase(), yosys: yosysBundleUrl(), nextpnr: nextpnrBundleUrl(), nextpnrS6: nextpnrS6BundleUrl(), nextpnrXc7: nextpnrXc7BundleUrl(), nextpnrOwn: null, integrity: LAYOUT.integrity || null }, { onLine, signal });
}

/**
 * What Implement of the project's device fetches (Yosys, the device description, its bit database; nextpnr and the device's
 * chip database, #2136, #2288), fetched into the
 * browser's Cache Storage by the flow's worker, in the background, when a project opens (#967): its first run does not
 * wait for 17 MB to download. Nothing in a page opened from a file (the single file: WebKit and Firefox give it a
 * Cache Storage, and a navigation that cancelled the download was a console error in WebKit, #1450), where there is
 * no Cache Storage, for a device the Silinx toolchain does not support, or once the device's are prepared.
 * Resolves { fetched, bytes, pruned } or null.
 */
const prepared = new Set();
export function prepareBrowserFlow(device = {}) {
  const st = browserOpenStatus(device);
  const key = st.graph || st.bitDb;   // (the 7-series' has no device description: its bit database, #3143)
  if (!st.available || !key || prepared.has(key) || globalThis.location?.protocol === 'file:' || !globalThis.isSecureContext || !globalThis.caches) return Promise.resolve(null);
  prepared.add(key);
  const w = getWorker(), id = ++runSeq;
  return new Promise(resolve => {
    runs.set(id, { onData: data => { if (data.done) { runs.delete(id); resolve(data.done); } }, fail: () => { runs.delete(id); prepared.delete(key); resolve(null); } });
    w.postMessage({ id, prepare: { graph: st.graph, part: st.part, family: st.family, device: String(device.part).toLowerCase(), pkg: String(device.package).toLowerCase(), nextpnr: usesNextpnr(st.family) }, assets: assetsBase(), yosys: yosysBundleUrl(), nextpnr: nextpnrOf(st.family), keep: [nextpnrBundleUrl(), nextpnrS6BundleUrl(), nextpnrXc7BundleUrl()], root: assetsRoot(), integrity: LAYOUT.integrity || null });
  });
}

/** The error of a stopped run (as the server's JobCancelled). */
const cancelled = () => Object.assign(new Error('cancelled by user'), { cancelled: true });
