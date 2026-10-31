// The Silinx toolchain's flow (synthesis, translate, map, place & route, timing, bitstream), the same in
// Node (server/open-flow-run.js: its own process, files on disk) and in the browser (the single-file
// edition: web/js/open-flow-worker.js, a Web Worker, files in memory). Everything outside the flow
// comes through `io`:
//   io.log(line)                       a line of the log (the console)
//   io.sources()                       [{ path, lang, text }] of the design
//   io.simSources()                    those of the simulation (the test benches), for the simulation models (optional)
//   io.ucf                             the constraints' text, or null
//   io.ucfName                         the constraints file's name (for the log)
//   io.device()                        the device description (fpga/device.js Device), loaded once
//   io.bitDb()                         the bit database (fpga/bitdb.js makeBitDb), loaded once
//   io.yosys                           run(args, files, onLine) for synth-open.js
//   io.write(name, data)               a file of the build (string or Uint8Array); returns its path as
//                                      the Design Summary shows it (build/open/…, build/top.bit)
//   io.read(name)                      a file written by an earlier run (or null)
//   io.save(report)                    the report so far (after every step: the Design Summary)
//   io.frontEnd(sources, top)          the HDL front end (core/synth-front.js flowFrontEnd): { errors, input() } of the
//                                      synthesis; without it the sources are the flat Verilog Yosys synthesizes (#1675)
//   io.simModels(ctx)                  the simulation models' steps (core/flow-models.js mountSimModels), optional
//   io.placeRoute(netlist, packed, device, knownPips, options)
//                                      the place and route (#1678), optional: fpga/place-route.js placeRouteBest by default;
//                                      another engine (nextpnr, #1953) returns its result's shape
//   io.nextpnr                         { <micro-architecture>: { run(args, files, onLine) -> files, chipdb(part) -> Uint8Array } }:
//                                      nextpnr-himbaechel for spec.engine 'nextpnr' (#2136, #2360): spartan3e (open-flow-nextpnr.js: its
//                                      Map and Place & Route), spartan6 (#2138, open-flow-nextpnr-s6.js: its Place & Route), optional
// core/flow-ide.js runOpenFlow is runFlow with the IDE's front end and simulation models (#1675).
// spec.resources: the part's resources (resources.js resourcesOf(part, pkg)), for the synthesis's used of
// available and its check (#795); without them the synthesis gives the used ones only.
// Prints "=== SILINX STEP <step> ===" before each step, "=== SILINX FAILED <step> (exit 1) ===" and the
// ERROR lines when one fails, "=== SILINX DONE ===" at the end (the protocol of ISE's run.sh).
// Returns { ok, report }.
import { synthesizeVerilog, cellCounts, DEEP_RULE } from './synth-open.js';
import { usedOfPrimitives, overResources, overMessage } from './resource-check.js';
import { parseUcf } from './ucf.js';
import { readYosysJson } from './fpga/netlist.js';
import { effortTries, effortExtra } from './fpga/place-route.js';
import { knownRouting } from './fpga/bitgen.js';
import { backendOf } from './open-flow-backends.js';

// without the HDL front end (io.frontEnd): the sources are the flat Verilog given to Yosys, its top module `top` (#1675)
function flatVerilog(srcs, top) {
  const vhdl = srcs.filter(s => s.lang === 'vhdl').map(s => s.path);
  return { errors: vhdl.length ? vhdl.map(p => `${p}: VHDL needs the HDL front end (io.frontEnd)`) : [], input: () => ({ text: srcs.map(s => s.text).join('\n'), top }) };
}
// without the simulation models (io.simModels): their steps fail
function noSimModels() {
  const none = async () => { throw new StepError('the simulation models need the IDE (io.simModels)', [], ''); };
  return { runPostMap: none, runPostPar: none, runPostSynth: none, runPostTranslate: none };
}


export const ISE_HINT = 'The Silinx toolchain does not support this yet: implement the design in an ISE mode (Toolchain Settings).';

export class StepError extends Error {
  constructor(message, list = [], hint = ISE_HINT) { super(message); this.list = list; this.hint = hint; }
}

/**
 * Run the steps of spec ({ top, family, device, pkg, part, steps, seed, effort, replicate,
 * startupClk, synthUpToDate, synthEffort, deepRule, engine }) with io (above). engine: 'nextpnr' for nextpnr's Map and Place & Route, 'auto' for it when it can implement the design (else the Silinx engine's)
 * (#2136, io.nextpnr), else Silinx's own. synthEffort: 'normal' | 'high' (the default), the
 * synthesis's Optimization Effort (#282; 'high' given, Place & Route makes HIGH_TRIES placements too, the fastest kept, and HIGH_EXTRA more routed when the placer's estimate is promising, #651; Normal NORMAL_TRIES for a small design); deepRule: Normal's rule of the deep designs (synth-open.js DEEP_RULE, for tests). synthUpToDate ({ report }: the synthesis part of the
 * report of the run that made it, or null), when the steps start after the synthesis: the netlist of that
 * run is the design's (#280); it is used as it is, or, when it is not there, the synthesis runs.
 */
export async function runFlow(spec, io) {
  const { top } = spec;
  const log = io.log;
  const report = { files: {} };
  const save = () => io.save(report);
  let current = null;
  const step = name => { current = name; log(`=== SILINX STEP ${name} ===`); };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const ms = t => `${((now() - t) / 1000).toFixed(1)} s`;
  const pct = (u, t) => (t ? Math.round((100 * u) / t) : 0);
  const util = (name, used, total) => ({ name, used, total, percent: pct(used, total) });
  let known = null;
  const knownPips = () => (known ||= knownRouting(io.bitDb()));
  // the placements Place & Route makes for a design of `slices` slices: HIGH_TRIES at Optimization Effort High, NORMAL_TRIES at Normal (#651)
  const parTries = slices => effortTries(spec.synthEffort, slices);
  // and the placements more at High, each routed only when its estimate is promising (#651)
  const parExtra = () => effortExtra(spec.synthEffort);
  const ucfText = io.ucf || null;
  let synth = null, netlist = null, netlistText = null;
  const backend = backendOf(spec.family);

  async function runSynth() {
    const t = now();
    const srcs = io.sources();
    for (const s of srcs) log(`${s.lang === 'vhdl' ? 'Parsing VHDL' : 'Analyzing Verilog'} file "${s.path}"`);
    const fe = (io.frontEnd || flatVerilog)(srcs, top);
    if (fe.errors.length) throw new StepError('the design has errors', fe.errors, 'Fix them (Check Syntax shows them in the Errors tab).');
    log(`Writing <${top}> as one flat module for Yosys; Yosys (WebAssembly) maps it onto the ${spec.family} cells.`);
    // (the synthesis's Optimization Effort, #282)
    if (spec.synthEffort) log(spec.synthEffort === 'normal' ? 'Optimization Effort Normal: one mapping, and the mappings for speed for a small design or one limited by its logic depth (High tries them for every design, a slower synthesis).'
      : 'Optimization Effort High: the mappings for speed tried too, the fastest kept.');
    let r;
    try {
      r = await (backend.synth || synthesizeVerilog)(fe.input(), { family: spec.family, run: io.yosys, effort: spec.synthEffort || 'high', ...(spec.deepRule && { deepRule: spec.deepRule }), ...(spec.smallRule && { smallRule: spec.smallRule }), onLine: l => { if (/^(Warning|ERROR)/.test(l)) log(l.replace(/^Warning:/, 'WARNING:Yosys -').replace(/^ERROR:/, 'ERROR:Yosys -')); } });
    } catch (e) {
      for (const l of e.lines || []) if (/ERROR/.test(l)) log(l);
      throw new StepError(`synthesis failed: ${e.message}`);
    }
    // (Normal: a small design synthesized as at High, #652)
    if (r.depth?.small) log(`Optimization Effort Normal: a small design (${r.depth.small.luts} LUTs): the mappings for speed tried too, ${r.depth.small.kept ? 'the fastest kept.' : `not faster (${r.depth.small.ns[1].toFixed(1)} ns estimated against ${r.depth.small.ns[0].toFixed(1)}): the one mapping kept.`}`);
    // (Normal: a design limited by its depth got the mappings for speed too, #468)
    if (r.depth?.auto) log(`Optimization Effort Normal: ${r.depth.levels} levels of logic: the mappings for speed tried too, ${r.depth.normal?.kept ? `not ${Math.round(100 * (spec.deepRule || DEEP_RULE).gain)} % faster (${r.depth.high.ns.toFixed(1)} ns estimated against ${r.depth.normal.ns.toFixed(1)}): the one mapping kept.` : 'the fastest kept.'}`);
    for (const w of r.warnings.filter(w => !/^Warning:/.test(w))) log(`WARNING:Synthesis - ${w}`);
    const paths = {};
    for (const [name, text] of Object.entries(r.files)) paths[name] = io.write(`open/${name}`, text);
    const u = r.util;
    // every resource used of the device's (#795): the family's own from the netlist's cells (resources.js),
    // the LUTs, flip-flops and I/O from the utilization; the others (latches, carry…) with no total
    const used = { ...usedOfPrimitives(spec.family, cellCounts(r.files[`${r.top}.json`], r.top)), luts: u.luts || 0, ffs: u.flipFlops || 0, iob: u.ios || 0 };
    const res = (spec.resources || []).filter(x => !['slices', 'distRam'].includes(x.id));
    const own = res.filter(x => !['luts', 'ffs', 'iob'].includes(x.id));
    const of = id => res.find(x => x.id === id);
    const row = (id, name) => ({ id, name, used: used[id] || 0, total: of(id)?.count ?? null, percent: of(id)?.count ? pct(used[id] || 0, of(id).count) : null });
    // (the Spartan-3E's lines as XST names them; another family's, its MAP report's)
    const s3e = { luts: 'Number of 4 input LUTs', ffs: 'Number of Slice Flip Flops', ramb16: 'Number of RAMB16s', mult18x18: 'Number of MULT18X18SIOs', bufgmux: 'Number of GCLKs', dcm: 'Number of DCMs', iob: 'Number of IOs' };
    const name = id => (backend.xstNames ? s3e[id] : of(id)?.report) || s3e[id] || id;
    const other = (k, n) => ({ name: n, used: u[k], total: null, percent: null });
    const items = [row('luts', name('luts')), row('ffs', name('ffs')), other('latches', 'Number of latches'), other('muxes', 'Number of F5-F8 multiplexers'),
      other('carry', 'Number of carry cells'), other('shiftRegisters', 'Number of shift registers'), other('distributedRam', 'Number of distributed RAMs'),
      ...(own.length ? own.map(x => row(x.id, name(x.id))) : [['ramb16', 'blockRam'], ['mult18x18', 'multipliers'], ['bufgmux', 'clockBuffers'], ['dcm', 'dcms']].map(([id, k]) => ({ ...row(id, s3e[id]), used: u[k] || 0 }))),
      row('iob', name('iob'))].filter(i => i.used);
    log('Device utilization (open synthesis):');
    for (const i of items) log(`  ${i.name}: ${i.used}${i.total != null ? ` out of ${i.total} ${i.percent}%` : ''}`);
    report.synthesis = { tool: 'Yosys', utilization: items, cells: u.cells, warnings: r.warnings.length, errors: 0,
      summary: { luts: { used: u.luts || 0 }, ffs: { used: u.flipFlops || 0 }, iobs: { used: u.ios || 0 } } };
    // (the netlist's name is the elaborated top's: a VHDL top is lower case, #31)
    report.files.netlist = paths[`${r.top}.json`];
    report.files.synthesis = paths[`${r.top}_stat.txt`];
    synth = r;
    log(`Netlist: ${report.files.netlist} (${u.cells} cells) in ${ms(t)}`);
    // more of a resource than the device has: said here, not at Place (#795)
    const over = overResources(res, used);
    if (over.length) {
      report.synthesis.errors = over.length;
      throw new StepError(over.map(o => overMessage(o, spec.device)).join('; '), [], 'Choose a larger device (Design Properties).');
    }
  }

  // The design the simulation models are made of (#120, #121): synthesized with the generics the test bench (open-flow-models.js)
  const { runPostMap, runPostPar, runPostSynth, runPostTranslate } = (io.simModels || noSimModels)({
    io, spec, knownPips, log, netlist: () => netlist, packed: () => impl.packed?.() ?? null, parTries, parExtra, report,
    routedOrEarlier: (...a) => impl.routedOrEarlier(...a), routedText: () => impl.routedText(), step, synth: () => synth, top,
    ucfText
  });

  function runTranslate() {
    // the netlist of an earlier run: its name may differ from the project's top in case (VHDL, #31)
    const text = synth ? synth.files[`${synth.top}.json`] : io.read(`open/${top}.json`);
    if (text == null) throw new StepError('no netlist: run Synthesize first', [], '');
    netlist = readYosysJson(text);
    netlistText = text;
    let ucf = { assignments: {}, clocks: [] };
    try { if (ucfText) ucf = parseUcf(ucfText); } catch (e) { throw new StepError(`the constraints cannot be read: ${e.message}`, [], 'Fix the constraints (Check Constraints).'); }
    const locs = Object.values(ucf.assignments || {}).filter(a => a.loc).length;
    log(`Netlist of <${top}> read; constraints: ${ucfText ? `${io.ucfName || 'the UCF'}, ${locs} pin location(s), ${(ucf.clocks || []).length} PERIOD constraint(s)` : 'none'}.`);
  }

  // the family's Map, Place & Route, timing and bitstream (open-flow-backends.js, #2360); the routed design is the back
  // end's, in its format: the steps after Place & Route read it, or an earlier run's (#2384)
  const impl = backend.mount({ io, spec, log, report, util, now, ms, netlist: () => netlist, netlistText: () => netlistText, top, knownPips, parTries, parExtra, ucfText, StepError });
  const { bitfile, runPins, runPower, runTiming } = impl;

  let steps = spec.steps;
  try {
    // the synthesis up to date (#280): its netlist and what its report said, or it runs again
    if (spec.synthUpToDate && !steps.includes('synth')) {
      if (io.read(`open/${top}.json`) == null) {
        log('The netlist of the synthesis is not in the build folder: the synthesis runs again.');
        steps = ['synth', ...steps];
      } else {
        log(`Process "Synthesize - Yosys" is up to date: its netlist build/open/${top}.json is used.`);
        const r = spec.synthUpToDate.report;
        if (r?.synthesis) report.synthesis = r.synthesis;
        for (const k of ['netlist', 'synthesis']) if (r?.files?.[k]) report.files[k] = r.files[k];
      }
    }
    if (steps.includes('synth')) { step('synth'); await runSynth(); save(); }
    if (steps.includes('postsynth')) { step('postsynth'); await runPostSynth(); save(); }
    if (steps.includes('translate')) { step('translate'); runTranslate(); save(); }
    if (steps.includes('posttrans')) { step('posttrans'); await runPostTranslate(); save(); }
    if (steps.includes('map')) { step('map'); await impl.runMap(); save(); }
    if (steps.includes('postmap')) { step('postmap'); await runPostMap(); save(); }
    if (steps.includes('par')) { step('par'); await impl.runPar(); save(); }
    if (steps.includes('trce')) { step('trce'); runTiming(); save(); }
    if (steps.includes('postpar')) { step('postpar'); await runPostPar(); save(); }
    if (steps.includes('pin2ucf')) { step('pin2ucf'); runPins(); save(); }
    if (steps.includes('xpwr')) { step('xpwr'); runPower(); save(); }
    if (steps.includes('bitgen')) {
      step('bitgen');
      report.bit = bitfile(`${top}.bit`, spec.startupClk);
      save();
      log(`Bitstream: build/${top}.bit (${report.bit.size} bytes, every feature in the bit database)`);
    }
    if (steps.includes('prombit')) {
      step('prombit');
      report.prom = bitfile(`${top}_prom.bit`, 'Cclk');
      save();
      log(`PROM bitstream (StartUpClk Cclk): build/${top}_prom.bit`);
    }
    if (steps.includes('fpgaview')) { step('fpgaview'); impl.runFpgaView(); }
    log('=== SILINX DONE ===');
    return { ok: true, report };
  } catch (e) {
    save();
    const msg = e instanceof StepError ? e.message : `${e.message}${e.stack ? `\n${e.stack.split('\n').slice(1, 4).join('\n')}` : ''}`;
    log(`ERROR:Silinx - ${msg}`);
    for (const x of e.list || []) log(`  ${x}`);
    if (e.hint !== '') log(e.hint || ISE_HINT);
    log(`=== SILINX FAILED ${current || 'synth'} (exit 1) ===`);
    return { ok: false, report, error: msg };
  }
}
