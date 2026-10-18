// The Silinx toolchain in the browser edition (the single-file Silinx-ISE.html, on GitHub Pages):
// Implement Design / Generate Programming File without any server or Xilinx tool. The flow is
// core/open-flow-core.js, run in a Web Worker (web/js/open-flow-worker.js); the device descriptions,
// the bit database and Yosys (WebAssembly) are fetched from the site's assets/ folder (published
// with the page: .github/workflows/pages.yml).
import { unconstrainedPorts } from '/core/auto-pins.js';
import { isView, viewHdl } from '/core/view-hdl.js';
import { compile } from '/core/compile.js';
import { synthEffort } from '/core/synth-open.js';
import { modulesFromLibrary } from '/core/schdoc.js';
import { OPEN_STEPS, orderOpenSteps } from '/core/open-steps.js';

// the devices whose device description and bit database are published (core/fpga/devices,
// research/s3e-bitstream/db): device/package -> the description's file
export const BROWSER_DEVICES = {
  'xc3s100e/cp132': 'xc3s100ecp132-4.json.gz',
  'xc3s250e/cp132': 'xc3s250ecp132-4.json.gz',
  'xc3s500e/fg320': 'xc3s500efg320-4.json.gz',
  'xc3s1200e/fg320': 'xc3s1200efg320-4.json.gz',
};
const SITE_ASSETS = 'https://pmnmalo.github.io/Silinx-ISE/assets/';

/** Where the assets are: next to the page when it is served (the site), else the site's (a page
 *  opened from a file). */
export function assetsBase(loc = globalThis.location) {
  if (globalThis.SILINX_ASSETS) return globalThis.SILINX_ASSETS;
  return loc && /^https?:$/.test(loc.protocol) ? new URL('assets/', loc.href).href : SITE_ASSETS;
}

/** Can the browser edition implement a design for this device? { available, reason, part }. */
export function browserOpenStatus(device = {}) {
  const dev = String(device.part || '').toLowerCase(), pkg = String(device.package || '').toLowerCase();
  const speed = String(device.speed || '-4').replace(/^(?!-)/, '-');
  const part = `${dev}${pkg}${speed}`;
  const list = Object.keys(BROWSER_DEVICES).map(k => k.replace('/', ' ')).join(', ');
  if (String(device.family || 'spartan3e').toLowerCase() !== 'spartan3e' || !/^xc3s\d+e$/.test(dev)) {
    return { available: false, part, reason: `the Silinx toolchain supports the Spartan-3E only (${list}); other devices need Xilinx ISE, in the full application` };
  }
  if (!BROWSER_DEVICES[`${dev}/${pkg}`]) return { available: false, part, reason: `no device description of the ${dev} in the ${pkg} package yet (only ${list})` };
  return { available: true, part, graph: BROWSER_DEVICES[`${dev}/${pkg}`], reason: `${part}: device description and bit database (in the browser)` };
}

const ALIASES = { implement: 'par', impl: 'par', synthesize: 'synth', xst: 'synth', ngdbuild: 'translate', place: 'par', route: 'par', timing: 'trce', bit: 'bitgen' };
/** The steps of a run: the chain from synthesis to the last step asked for (core/open-steps.js, as the server's openSteps). */
export function browserSteps(steps, { synthUpToDate = false } = {}) {
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
  // worker but starts a classic one (#512)
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
 * steps as the processes ask; synthUpToDate ({ report }), the synthesis up to date (#280). onLine(line); onWrite(path, data) for each file of the build.
 * signal (an AbortSignal): Stop; the worker is terminated and the run rejects with { cancelled: true }.
 * Resolves { ok, report, error, view }.
 */
export async function runBrowserFlow({ project, files, steps, synthUpToDate = null, onLine, onWrite = () => {}, onReport = () => {}, signal = null }) {
  const st = browserOpenStatus(project.device || {});
  if (!st.available) throw new Error(`the Silinx toolchain cannot implement this design: ${st.reason}`);
  const top = project.top;
  if (!top) throw new Error('the project has no top module');
  const sources = (project.files || []).filter(f => ['design', 'impl'].includes(f.role || 'design') && (f.lang === 'verilog' || f.lang === 'vhdl') && typeof files[f.path] === 'string')
    .map(f => ({ path: f.path, lang: f.lang, text: files[f.path] }));
  // the drawn sources without an HDL file (schematics, ASM charts, state diagrams, truth tables): their HDL made here (#177)
  const excluded = new Set(project.excluded || []);
  const viewPaths = Object.keys(files).filter(p => isView(p) && !excluded.has(p) && !p.startsWith('build/') && typeof files[p] === 'string');
  if (viewPaths.length) {
    let modules = {};
    try { modules = modulesFromLibrary(compile(sources), { sources: Object.fromEntries(sources.map(s => [s.path, s.text])) }); } catch { /* none */ }
    const hdlMods = new Set(Object.keys(modules).map(n => n.toLowerCase()));   // (a module an HDL file defines: that file)
    for (const p of viewPaths) {
      // (a drawing whose HDL file is gone, deleted or removed from the project, is one without it: #231)
      const r = viewHdl(p, files[p], { modules, linked: f => typeof files[f] === 'string' && (project.files || []).some(x => x.path === f) });
      if (!r || (r.text && hdlMods.has(String(r.module).toLowerCase()))) continue;
      for (const e of r.errors) onLine(`WARNING:Silinx - ${e}`);
      if (r.text) sources.push({ path: `${p}.${r.lang === 'vhdl' ? 'vhd' : 'v'}`, lang: r.lang, text: r.text });
    }
  }
  if (!sources.length) throw new Error('the project has no design HDL files');
  const ucf = project.constraints && typeof files[project.constraints] === 'string' ? files[project.constraints] : null;
  // the port bits without a pin: on a board they would go to arbitrary pins (refused, as the server does)
  const unplaced = await unconstrainedPorts(sources, top, ucf || '');
  if (unplaced.length && project.board) throw new Error(`${unplaced.length} top-level port bit(s) have no pin location (LOC) for the ${project.board} board: ${unplaced.slice(0, 12).map(u => u.net).join(', ')}${unplaced.length > 12 ? ', …' : ''}. Assign them in I/O Pin Planning (or remove the board in Design Properties).`);
  if (unplaced.length) onLine(`WARNING:Silinx - ${unplaced.length} port bit(s) have no LOC constraint (${unplaced.slice(0, 8).map(u => u.net).join(', ')}${unplaced.length > 8 ? ', …' : ''}): the Silinx toolchain chooses their pins - do NOT program real hardware with this bitstream`);
  const dev = String(project.device.part).toLowerCase(), pkg = String(project.device.package).toLowerCase();
  const spec = { top, part: st.part, device: dev, pkg, family: 'spartan3e', graph: st.graph, steps: browserSteps(steps, { synthUpToDate: !!synthUpToDate }), seed: 1, effort: 1, startupClk: project.impl?.startupClk || 'JtagClk', simTop: project.simTop || null, synthEffort: synthEffort(project.impl) };
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
    w.postMessage({ id, spec, sources, simSources, ucf, ucfName: project.constraints ? project.constraints.split('/').pop() : null, files: earlier, assets: assetsBase() });
  });
}

/** The error of a stopped run (as the server's JobCancelled). */
const cancelled = () => Object.assign(new Error('cancelled by user'), { cancelled: true });
