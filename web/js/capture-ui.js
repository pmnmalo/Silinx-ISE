// Silinx - the logic analyzer in the interface (#3176, as ChipScope / Vivado's ILA): the processes under Configure
// Target Device (the Silinx toolchain's, which inserts the capture at Implement: core/flow-ide.js):
//   - Logic Analyzer Settings: the capture's dialog, the signals of the design to watch (their paths below the top), the
//     clock, the depth, the samples before the trigger and the trigger, checked as the MCP tool capture_settings checks
//     them (core/ila-insert.js planInsertion, captureCost: each probe's width, the block RAMs against the device's), each
//     problem beside its field; saved in silinx.json `capture`;
//   - Analyze Design Using the Logic Analyzer: the capture on the board (api.capture: the server's adepttool,
//     server/ila-board.js, or the browser's WebUSB, core/ila-link.js adeptLink), its lines in the console, then its
//     window opened;
//   - View the Last Capture: build/capture.json in the waveform viewer, each probe a signal (core/ila-capture.js
//     replayBench, simulated), the cursor on the trigger's sample.
import { api, followJob } from './api.js';
import { h, dialog } from './ui.js';
import { compile, elaborate } from '/core/compile.js';
import { Simulator } from '/core/simulator.js';
import { S, closeDoc, findDoc, openDoc, projectBoard, withPrimitives } from './app.js';
import { log } from './console.js';
import { inView, saveProjectJson } from './design.js';
import { field, select } from './wizards.js';
import { boardClockOf, boardClockText, captureClockText } from '/core/ila-insert.js';
import { clocksOf } from '/core/schematic.js';

const DEPTHS = [16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384];
const OPS = [['=', '='], ['!=', '≠'], ['rise', 'rises'], ['fall', 'falls'], ['change', 'changes']];
const PERIOD = 20000;   // (ps: a sample a period in the capture's view)

// the design as Implement elaborates it (the implementation view's HDL), or null
function implDesign() {
  const pj = S.project;
  if (!pj?.top) return null;
  try {
    const srcs = S.sources.filter(s => inView(s.role, false) && (s.lang === 'vhdl' || s.lang === 'verilog'));
    const d = elaborate(compile(withPrimitives(srcs)), pj.top);
    return d.top ? d : null;
  } catch { return null; }
}

// the signals a probe can be (vectors, integers, states, bits) and the clocks (one bit), by their path below the top
function signalsOf(design) {
  const top = design.top.path, rel = s => s.path.slice(top.length + 1);
  const ok = s => ['logic', 'bool', 'enum', 'int', 'bit'].includes(s.t.kind);
  const all = design.signals.filter(s => s.path.startsWith(`${top}.`) && ok(s)).map(s => ({ path: rel(s), width: s.t.w || 1, bit: s.t.w === 1 && s.t.kind !== 'int' }));
  return { probes: all, clocks: all.filter(s => s.bit).map(s => s.path) };
}

// the design's clocks: the signals its processes are clocked on, by their path below the top
function clockPaths(design) {
  const top = design.top.path, out = new Set();
  for (const p of design.procs || []) { try { for (const sg of clocksOf(p).clocks) if (sg.path?.startsWith(`${top}.`)) out.add(sg.path.slice(top.length + 1)); } catch { /* not clocked */ } }
  return out;
}

/** Logic Analyzer Settings: the capture's dialog; saves silinx.json's capture (or clears it). */
export async function captureSettings() {
  const pj = S.project;
  const design = implDesign();
  if (!design) { log('ERROR: Logic Analyzer Settings: the design has no top module that elaborates: correct it first (Check Syntax).'); return; }
  const { planInsertion, captureCost } = await import('/core/ila-insert.js');
  const { resourcesOf } = await import('/packages/silinx-fpga/src/parts.js');
  const part = S.devices?.parts.find(p => p.part === pj.device?.part);
  const { familyProfile } = await import('/core/family-profile.js');
  const family = part?.family || 'spartan3e';
  const ram = familyProfile(family).blockRam;   // (the family's block RAM: RAMB16s, or the Spartan-6's halves, #2310)
  const total = part ? (resourcesOf(part, pj.device.package).find(r => r.id === ram?.resource)?.count ?? null) : null;
  const old = pj.capture || {};
  const { probes, clocks } = signalsOf(design);
  const list = h('select', { class: 'capture-probes', multiple: true, size: 12 },
    ...probes.map(p => h('option', { value: p.path, selected: (old.probes || []).includes(p.path) }, `${p.path}${p.width > 1 ? ` [${p.width}]` : ''}`)));
  // (the board's oscillator too, #3481: a design with no clock, a combinational one, samples on it; its default then)
  const bc = boardClockOf(projectBoard(pj));
  const BOARD = '@board';
  const edges = clockPaths(design);
  const clocked = clocks.filter(c => edges.has(c) || /clk|clock/i.test(c));
  const clock = select([...(bc ? [[BOARD, boardClockText(bc)]] : []), ...clocks.map(c => [c, c])],
    old.boardClock && bc ? BOARD : old.clock || clocked[0] || (bc ? BOARD : clocks[0]));
  const depth = select(DEPTHS.map(d => [String(d), String(d)]), String(old.depth || 1024));
  clock.classList.add('capture-clock'); depth.classList.add('capture-depth');
  const pre = h('input', { type: 'number', min: 0, value: String(old.pre ?? 0), class: 'capture-pre' });
  const combine = select([['and', 'All (and)'], ['or', 'Any (or)']], old.trigger?.combine || 'and');
  const rows = h('div', { class: 'capture-conds' });
  const chosen = () => [...list.selectedOptions].map(o => o.value);
  const addRow = (c = {}) => {
    const probe = select(chosen().map(p => [p, p]), c.probe), op = select(OPS, c.op || '='), value = h('input', { type: 'text', value: c.value ?? '', class: 'capture-value', placeholder: '0' });
    const row = h('div', { class: 'capture-cond' }, probe, op, value, h('button', { class: 'btn', type: 'button', title: 'Remove the condition', onclick: () => { row.remove(); check(); } }, '✕'));
    for (const x of [probe, op, value]) x.addEventListener('input', check);
    rows.append(row);
  };
  (old.trigger?.conditions || []).forEach(addRow);
  const problems = h('div', { class: 'capture-problems status-bad' }), cost = h('div', { class: 'capture-cost' });
  const settings = () => ({ probes: chosen(), ...(clock.value === BOARD ? { boardClock: bc } : { clock: clock.value }), depth: +depth.value, pre: +pre.value || 0,
    trigger: { combine: combine.value, conditions: [...rows.children].map(r => { const [p, o, v] = r.querySelectorAll('select, input'); return { probe: p.value, op: o.value, ...(['=', '!='].includes(o.value) ? { value: v.value.trim() } : {}) }; }) } });
  let ok = false;
  function check() {
    const s = settings();
    const ins = planInsertion(design, s, { family });
    const c = ins.errors.length ? null : captureCost(ins.plan, total);
    const errs = [...ins.errors, ...(c?.errors || [])];
    problems.replaceChildren(...errs.map(e => h('div', {}, e)));
    cost.textContent = errs.length ? '' : `${ins.plan.width} bits × ${s.depth} samples: ${c.blocks} block RAM(s)${total != null ? ` of the device's ${ram?.halves ? total / 2 : total}` : ''}`;
    ok = !errs.length;
    if (save.el) save.el.disabled = !ok;
  }
  list.addEventListener('change', () => { for (const r of rows.children) { const sel = r.querySelector('select'), v = sel.value; sel.replaceChildren(...chosen().map(p => h('option', { value: p, selected: p === v }, p))); } check(); });
  for (const x of [clock, depth, pre, combine]) x.addEventListener('input', check);
  const save = { label: 'Save', primary: true, value: 'save' };
  const r = await dialog({
    title: 'Logic Analyzer Settings', width: 620, className: 'capture-dialog', buttons: [save, { label: 'Clear', value: 'clear' }, { label: 'Cancel', value: null }],
    onOpen: check,
    body: h('div', { class: 'form-grid' },
      ...field('Signals to watch:', list), ...field('Clock:', clock), ...field('Samples:', depth), ...field('Before the trigger:', pre),
      ...field('Trigger:', h('div', {}, combine, rows, h('button', { class: 'btn', type: 'button', onclick: () => { addRow(); check(); } }, 'Add a condition'))),
      h('div', { style: { gridColumn: '1 / 3' } }, cost, problems),
      h('div', { style: { gridColumn: '1 / 3', color: 'var(--grey-3)' } }, 'Implement inserts the capture core (the Silinx toolchain: the Spartan-3E, the Spartan-6, the 7-series); program the board, then Analyze Design Using the Logic Analyzer.')),
  });
  if (r === 'clear') { delete pj.capture; await saveProjectJson(); log('Logic analyzer: no capture (Implement adds none).'); return; }
  if (r !== 'save' || !ok) return;
  pj.capture = settings();
  await saveProjectJson();
  log(`Logic analyzer: ${pj.capture.probes.join(', ')}; ${pj.capture.depth} samples on ${captureClockText(pj.capture)}. Implement the design and program the board to capture them.`);
}

/** Analyze Design Using the Logic Analyzer: the capture on the board, then its window. */
export async function runCaptureOnBoard({ arm = true, timeoutS = 10 } = {}) {
  const pj = S.project;
  if (!pj?.capture) { log('ERROR: Analyze Design Using the Logic Analyzer: the project has no capture: Logic Analyzer Settings first.'); return null; }
  // (the core's spec as Implement inserts it: the browser edition's capture reads the board with it; the server makes
  // its own from the project, server/ila-board.js)
  const design = implDesign();
  if (!design) { log('ERROR: Analyze Design Using the Logic Analyzer: the design has no top module that elaborates: correct it first (Check Syntax).'); return null; }
  const { planInsertion } = await import('/core/ila-insert.js');
  const family = S.devices?.parts.find(p => p.part === pj.device?.part)?.family || 'spartan3e';
  const ins = planInsertion(design, pj.capture, { family });
  if (ins.errors.length) { log(`ERROR: Analyze Design Using the Logic Analyzer: the capture no longer fits the design: ${ins.errors.join(' ')}`); return null; }
  log('Logic analyzer: arming the capture on the board…');
  try {
    const { job } = await api.capture(pj.name, { arm, timeoutS, spec: ins.spec, probes: ins.probes.map(({ path, name, width }) => ({ path, name, width })), top: pj.top, clock: captureClockText(pj.capture) });
    // (the job's lines in the console, its error among them)
    const j = await followJob(job, line => log(line));
    if (j.status !== 'ok' || !j.result?.capture) return null;
    await openCaptureView(j.result.capture);
    return j.result.capture;
  } catch (e) { log(`ERROR: ${e.message}`); return null; }
}

/** View the Last Capture (or the capture given): its probes' waves, one sample a period, the cursor on the trigger. */
export async function openCaptureView(capture = null) {
  const pj = S.project;
  if (!capture) {
    try { capture = JSON.parse(await api.readFile(pj.name, 'build/capture.json')); } catch { log('ERROR: View the Last Capture: no capture yet: Analyze Design Using the Logic Analyzer first.'); return; }
  }
  const { replayBench } = await import('/core/ila-capture.js');
  const name = p => p.path.replace(/[.[\]]+/g, '_').replace(/_+$/, '');
  const spec = { name: 'capture', lang: 'verilog', depth: capture.depth, pre: capture.pre, probes: capture.probes.map(p => ({ name: name(p), width: p.width })) };
  const cap = { samples: Array.from({ length: capture.depth }, () => 0n), trigger: capture.trigger, probes: Object.fromEntries(capture.probes.map(p => [name(p), p.samples.map(v => BigInt(v))])) };
  const lib = compile([{ path: 'build/capture_replay.v', lang: 'verilog', text: replayBench(spec, cap, { lang: 'verilog', period: PERIOD }) }]);
  // (a replay that does not compile: said, not an empty window, #3340)
  if (lib.errors.length) { log(`ERROR: View the Last Capture: the capture's replay does not compile: ${lib.errors[0].message}`); return; }
  const design = elaborate(lib, 'capture_replay');
  const sim = new Simulator(design);
  const id = 'capture';
  const prev = findDoc(id);
  if (prev) await closeDoc(prev);
  const { mountISim } = await import('./isim.js');
  openDoc({
    id, title: `Capture (${capture.top})`, icon: 'wave',
    create(el) {
      const view = mountISim(el, { design, sim, title: capture.top, runAllCap: capture.depth * PERIOD });
      // (the whole capture run, then the cursor and a marker on the trigger's sample)
      const t = capture.trigger * PERIOD + PERIOD / 2;
      view.exec(`run ${capture.depth * PERIOD / 1000} ns`).then(() => view.setState({ cursor: t, markers: [t] }));
      return { view, destroy: () => view.destroy?.(), onActivate: () => setTimeout(() => view.refresh?.(), 0) };
    },
  });
  log(`Logic analyzer: ${capture.depth} samples of ${capture.probes.map(p => p.path).join(', ')}, the trigger at sample ${capture.trigger} (${capture.takenAt}).`);
}
