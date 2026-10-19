// The Silinx toolchain's flow (synthesis, translate, map, place & route, timing, bitstream), the same in
// Node (server/open-flow-run.js: its own process, files on disk) and in the browser (the single-file
// edition: web/js/open-flow-worker.js, a Web Worker, files in memory). Everything outside the flow
// comes through `io`:
//   io.log(line)                       a line of the log (the console)
//   io.sources()                       [{ path, lang, text }] of the design
//   io.simSources()                    those of the simulation (the test benches), for the simulation models (optional)
//   io.ucf                             the constraints' text, or null
//   io.ucfName                         the constraints file's name (for the log)
//   io.device()                        the device description (core/fpga/device.js Device), loaded once
//   io.bitDb()                         the bit database (core/fpga/bitdb.js makeBitDb), loaded once
//   io.yosys                           run(args, files, onLine) for core/synth-open.js
//   io.write(name, data)               a file of the build (string or Uint8Array); returns its path as
//                                      the Design Summary shows it (build/open/…, build/top.bit)
//   io.read(name)                      a file written by an earlier run (or null)
//   io.save(report)                    the report so far (after every step: the Design Summary)
// Prints "=== SILINX STEP <step> ===" before each step, "=== SILINX FAILED <step> (exit 1) ===" and the
// ERROR lines when one fails, "=== SILINX DONE ===" at the end (the protocol of ISE's run.sh).
// Returns { ok, report }.
import { compile, elaborate } from './compile.js';
import { primitiveSources } from './unisim.js';
import { dutGenerics, postSynthesisModels, postTranslateModels, postMapModels } from './sim-model.js';
import { synthesizeOpen } from './synth-open.js';
import { parseXdl, writeXdl, placedPins } from './xdl.js';
import { parseUcf, pinsUcf } from './ucf.js';
import { readYosysJson } from './fpga/netlist.js';
import { pack } from './fpga/pack.js';
import { placeRouteBest } from './fpga/place-route.js';
import { deviceSites } from './fpga/place.js';
import { checkRouting } from './fpga/route.js';
import { bitgen, knownRouting } from './fpga/bitgen.js';
import { analyzeTiming, timingReport, checkPeriods, clockPort } from './fpga/timing.js';
import { estimatePower, powerReport, ESTIMATE_ERROR_PERCENT } from './power.js';

export const ISE_HINT = 'The Silinx toolchain does not support this yet: implement the design in an ISE mode (Toolchain Settings).';

export class StepError extends Error {
  constructor(message, list = [], hint = ISE_HINT) { super(message); this.list = list; this.hint = hint; }
}

/**
 * Run the steps of spec ({ top, family, device, pkg, part, steps, seed, effort, replicate,
 * startupClk, synthUpToDate, synthEffort }) with io (above). synthEffort: 'normal' | 'high' (the default), the
 * synthesis's Optimization Effort (#282). synthUpToDate ({ report }: the synthesis part of the
 * report of the run that made it, or null), when the steps start after the synthesis: the netlist of that
 * run is the design's (#280); it is used as it is, or, when it is not there, the synthesis runs.
 */
export async function runOpenFlow(spec, io) {
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
  const ucfText = io.ucf || null;
  let synth = null, netlist = null, packed = null, routedText = null;

  async function runSynth() {
    const t = now();
    const srcs = io.sources();
    for (const s of srcs) log(`${s.lang === 'vhdl' ? 'Parsing VHDL' : 'Analyzing Verilog'} file "${s.path}"`);
    const lib = compile([...primitiveSources(srcs), ...srcs]);
    const design = elaborate(lib, top);
    const errs = [...lib.errors, ...design.diags].filter(d => d.severity === 'error');
    if (errs.length) throw new StepError('the design has errors', errs.map(e => `${e.file}:${e.line} ${e.message}`), 'Fix them (Check Syntax shows them in the Errors tab).');
    log(`Writing <${top}> as one flat module for Yosys; Yosys (WebAssembly) maps it onto the ${spec.family} cells.`);
    // (the synthesis's Optimization Effort, #282)
    if (spec.synthEffort) log(spec.synthEffort === 'normal' ? 'Optimization Effort Normal: one mapping, and the mappings for speed for a design limited by its logic depth (High tries them for every design, a slower synthesis).'
      : 'Optimization Effort High: the mappings for speed tried too, the fastest kept.');
    let r;
    try {
      r = await synthesizeOpen(design, { family: spec.family, run: io.yosys, effort: spec.synthEffort || 'high', onLine: l => { if (/^(Warning|ERROR)/.test(l)) log(l.replace(/^Warning:/, 'WARNING:Yosys -').replace(/^ERROR:/, 'ERROR:Yosys -')); } });
    } catch (e) {
      for (const l of e.lines || []) if (/ERROR/.test(l)) log(l);
      throw new StepError(`synthesis failed: ${e.message}`);
    }
    // (Normal: a design limited by its depth got the mappings for speed too, #468)
    if (r.depth?.auto) log(`Optimization Effort Normal: ${r.depth.levels} levels of logic: the mappings for speed tried too, the fastest kept.`);
    for (const w of r.warnings.filter(w => !/^Warning:/.test(w))) log(`WARNING:Synthesis - ${w}`);
    const paths = {};
    for (const [name, text] of Object.entries(r.files)) paths[name] = io.write(`open/${name}`, text);
    const u = r.util;
    const items = [['luts', 'Number of 4 input LUTs'], ['flipFlops', 'Number of Slice Flip Flops'], ['latches', 'Number of latches'], ['muxes', 'Number of F5-F8 multiplexers'],
      ['carry', 'Number of carry cells'], ['shiftRegisters', 'Number of shift registers'], ['distributedRam', 'Number of distributed RAMs'], ['blockRam', 'Number of RAMB16s'],
      ['multipliers', 'Number of MULT18X18SIOs'], ['clockBuffers', 'Number of GCLKs'], ['dcms', 'Number of DCMs'], ['ios', 'Number of IOs']]
      .filter(([k]) => u[k]).map(([k, name]) => ({ name, used: u[k], total: null, percent: null }));
    log('Device utilization (open synthesis):');
    for (const i of items) log(`  ${i.name}: ${i.used}`);
    report.synthesis = { tool: 'Yosys', utilization: items, cells: u.cells, warnings: r.warnings.length, errors: 0,
      summary: { luts: { used: u.luts || 0 }, ffs: { used: u.flipFlops || 0 }, iobs: { used: u.ios || 0 } } };
    // (the netlist's name is the elaborated top's: a VHDL top is lower case, #31)
    report.files.netlist = paths[`${r.top}.json`];
    report.files.synthesis = paths[`${r.top}_stat.txt`];
    synth = r;
    log(`Netlist: ${report.files.netlist} (${u.cells} cells) in ${ms(t)}`);
  }

  // The design the simulation models are made of (#120, #121): synthesized with the generics the test bench
  // (spec.simTop) gives its instance of the top; without any, this run's synthesis, or (netlistOk: the
  // post-translate and post-map models) the netlist Translate read. Once per run.
  let modelGen = null, modelSynth = null;
  async function modelDesign(netlistOk) {
    if (!modelGen) {
      const srcs = io.sources(), sims = io.simSources ? io.simSources() : [];
      modelGen = { generics: {}, testbench: null };
      if (spec.simTop && sims.length) {
        const all = [...srcs, ...sims];
        const tb = elaborate(compile([...primitiveSources(all), ...all]), spec.simTop);
        const g = tb.top ? dutGenerics(tb, top) : null;
        if (g) {
          modelGen = { generics: g.generics, testbench: spec.simTop };
          if (g.skipped.length) log(`WARNING:Silinx - the test bench '${spec.simTop}' gives ${g.skipped.join(', ')} values that are not integers: the model is synthesized with their defaults`);
        } else log(`INFO:Silinx - the test bench '${spec.simTop}' has no instance of '${top}': the model is synthesized with its own generics`);
      }
    }
    const { generics, testbench } = modelGen;
    const given = Object.keys(generics).length > 0;
    if (!given && (synth || (netlistOk && netlist))) return { synth, own: false, generics, testbench };
    if (!modelSynth) {
      if (given) log(`Synthesizing '${top}' with the generics the test bench '${testbench}' gives: ${Object.entries(generics).map(([k, v]) => `${k} = ${v}`).join(', ')}`);
      const srcs = io.sources();
      const lib = compile([...primitiveSources(srcs), ...srcs]);
      const design = elaborate(lib, top, { generics });
      const errs = [...lib.errors, ...design.diags].filter(d => d.severity === 'error');
      if (errs.length) throw new StepError('the design has errors', errs.map(e => `${e.file}:${e.line} ${e.message}`), 'Fix them (Check Syntax shows them in the Errors tab).');
      try { modelSynth = await synthesizeOpen(design, { family: spec.family, run: io.yosys, effort: spec.synthEffort || 'high' }); } catch (e) {
        for (const l of e.lines || []) if (/ERROR/.test(l)) log(l);
        throw new StepError(`synthesis failed: ${e.message}`);
      }
    }
    return { synth: modelSynth, own: true, generics, testbench };
  }
  // a model's files, in the report and the log
  function writeModel(step, dir, suffix, title, m, prims, count) {
    if (m.unknown.length) log(`WARNING:Silinx - ${step === 'postmap' ? 'sites' : 'cells'} with no simulation model in Silinx (the model cannot be simulated as it is): ${m.unknown.join(', ')}`);
    const vhd = io.write(`netgen/${dir}/${top}_${suffix}.vhd`, m.vhdl);
    const v = io.write(`netgen/${dir}/${top}_${suffix}.v`, m.verilog);
    const { generics, testbench } = modelGen;
    report.simModels = { ...(report.simModels || {}), [step]: { path: vhd, verilog: v, ...(testbench ? { testbench, generics } : {}) } };
    log(`${title} Simulation Model: ${vhd} (VHDL, ${prims} primitives) and ${v} (Verilog), ${count}`);
  }

  // Generate Post-Synthesis Simulation Model (#120): build/netgen/synthesis/<top>_synthesis.vhd (and .v)
  async function runPostSynth() {
    const { synth: r, generics, testbench } = await modelDesign(false);
    const m = postSynthesisModels(r, { top, part: spec.part, generics, testbench });
    writeModel('postsynth', 'synthesis', 'synthesis', 'Post-Synthesis', m, 'UNISIM', `${m.cells} cells`);
  }
  // Generate Post-Translate / Post-Map Simulation Model (#121): build/netgen/translate/<top>_translate.vhd,
  // build/netgen/map/<top>_map.vhd (and .v): the netlist, the packed design, of SIMPRIM primitives
  let modelNl = null, modelPacked = null;
  async function modelNetlist() {
    const d = await modelDesign(true);
    if (!d.own) return { ...d, nl: netlist, packed };
    modelNl ||= readYosysJson(d.synth.files[`${d.synth.top}.json`]);
    return { ...d, nl: modelNl };
  }
  async function runPostTranslate() {
    const { nl, generics, testbench } = await modelNetlist();
    const m = postTranslateModels(nl, { top, part: spec.part, generics, testbench });
    writeModel('posttrans', 'translate', 'translate', 'Post-Translate', m, 'SIMPRIM', `${m.instances} primitives`);
  }
  async function runPostMap() {
    const d = await modelNetlist();
    let p = d.packed;
    if (!p) {
      try { p = modelPacked ||= pack(d.nl, { ucf: ucfText, part: spec.part, carryOut: 'xor' }); } catch (e) { throw new StepError(`packing failed: ${e.message}`); }
    }
    const m = postMapModels(d.nl, p, { top, part: spec.part, generics: d.generics, testbench: d.testbench });
    writeModel('postmap', 'map', 'map', 'Post-Map', m, 'SIMPRIM', `${m.instances} primitives`);
  }

  function runTranslate() {
    // the netlist of an earlier run: its name may differ from the project's top in case (VHDL, #31)
    const text = synth ? synth.files[`${synth.top}.json`] : io.read(`open/${top}.json`);
    if (text == null) throw new StepError('no netlist: run Synthesize first', [], '');
    netlist = readYosysJson(text);
    let ucf = { assignments: {}, clocks: [] };
    try { if (ucfText) ucf = parseUcf(ucfText); } catch (e) { throw new StepError(`the constraints cannot be read: ${e.message}`, [], 'Fix the constraints (Check Constraints).'); }
    const locs = Object.values(ucf.assignments || {}).filter(a => a.loc).length;
    log(`Netlist of <${top}> read; constraints: ${ucfText ? `${io.ucfName || 'the UCF'}, ${locs} pin location(s), ${(ucf.clocks || []).length} PERIOD constraint(s)` : 'none'}.`);
  }

  function runMap() {
    const t = now();
    try {
      // a carry out read by logic leaves through an XOR stage, not XB / YB (not in the bit database)
      packed = pack(netlist, { ucf: ucfText, part: spec.part, carryOut: 'xor' });
    } catch (e) { throw new StepError(`packing failed: ${e.message}`); }
    for (const w of packed.warnings || []) log(`WARNING:Pack - ${w}`);
    const items = mapReport();
    log('Design summary (pack):');
    for (const i of items) log(`  ${i.name}: ${i.used} out of ${i.total} ${i.percent}%`);
    log(`Packed in ${ms(t)}.`);
  }

  // the Design Summary's map section, from the packed design (again after a register replication)
  function mapReport() {
    const s = packed.stats;
    const sites = deviceSites(io.device());
    const nSlices = sites.slices.size, nPads = sites.pads.size, nBufg = sites.bufgmux.length;
    const items = [util('Number of Slice Flip Flops', s.ffs, 2 * nSlices), util('Number of 4 input LUTs', s.luts, 2 * nSlices),
      util('Number of occupied Slices', s.slices, nSlices), util('Number of bonded IOBs', s.iobs, nPads), util('Number of BUFGMUXs', s.bufgs, nBufg)];
    if (s.slices > nSlices) throw new StepError(`the design needs ${s.slices} slices, the device has ${nSlices}`, [], 'Choose a larger device.');
    report.map = { utilization: items, summary: { slices: items[2], ffs: items[0], luts: items[1], iobs: items[3], bufg: items[4] }, carry: s.carry, muxes: s.muxes, warnings: (packed.warnings || []).length, errors: 0 };
    return items;
  }

  function runPar() {
    const d = io.device();
    const k = knownPips();
    // place, route and their timing (core/fpga/place-route.js, the flows' one place and route): each
    // clock's flip-flops on the slices its global line reaches through switches of known bits; then
    // register replication (#4): the flip-flops and LUTs of many loads on the critical path copied
    // (#522), the design placed again from the first placement (#87) and routed; the faster kept
    let pr;
    try {
      pr = placeRouteBest(netlist, packed, d, k, {
        seed: spec.seed || 1, effort: spec.effort || 1, replicate: spec.replicate !== false, routeIterations: spec.routeIterations || null, pack: { ucf: ucfText, part: spec.part, carryOut: 'xor' },
        onRouted: (p, info) => { if (!info.replication) for (const w of p.placement.warnings || []) log(`WARNING:Place - ${w}`); },
        onReplication: x => log(`Register replication: ${x.flipFlops} flip-flop(s)${x.luts ? ` and ${x.luts} LUT(s)` : ''} on the critical path copied (${x.copies} copies): ${x.kept ? `kept, ${x.result.sta.period.toFixed(3)} ns instead of ${x.before.toFixed(3)} ns` : 'not kept, no faster'}.`),
      });
    } catch (e) { throw new StepError(`placement failed: ${e.message}`, [], e.hint); }   // (e.hint: the placer's, #128)
    if (pr.replication?.kept) {
      packed = pr.packed;
      const items = mapReport();
      log(`Design summary (pack, after the replication): ${items[0].name} ${items[0].used}, ${items[2].name} ${items[2].used}.`);
    }
    const { placement: r, placedText, routed } = pr;
    report.files.placed = io.write('open/placed.xdl', placedText);
    log(`Placed ${r.sites.length} sites in ${(pr.placeMs / 1000).toFixed(1)} s (estimated critical path ${r.delay.toFixed(1)} ns): ${report.files.placed}`);
    report.par = { routed: false, unroutedSignals: routed.failed.length, nets: routed.routed, pips: routed.pips, iterations: routed.iterations };
    if (routed.errors.length) throw new StepError('routing errors', routed.errors.slice(0, 50));
    if (routed.failed.length) {
      throw new StepError(`${routed.failed.length} net(s) cannot be routed on the routing switches whose bits are known (the bit database does not know every switch of the device yet)`,
        routed.unreached.slice(0, 50).map(u => `${u.net} -> ${u.inst}.${u.pin}`));
    }
    // (the router stopped with nodes still shared, on every placement tried, #249)
    if (routed.overused) {
      throw new StepError(`the routing did not converge: ${routed.overused} routing node(s) still used by more than one net after ${routed.iterations} passes, on ${1 + pr.retried} placement(s) (seeds ${spec.seed || 1} to ${(spec.seed || 1) + pr.retried})`,
        [], 'The design is too dense for the router on this device: a larger device, or an ISE mode (Toolchain Settings), may implement it.');
    }
    if (pr.retried) log(`Placed and routed again with the seed ${pr.seed}: the routing of ${pr.retried} placement(s) before did not converge.`);
    routedText = writeXdl(routed.design);
    report.files.routed = io.write('open/routed.xdl', routedText);
    const check = checkRouting(parseXdl(routedText), d);
    if (!check.ok) throw new StepError('the routing check failed', check.problems.slice(0, 50));
    report.par = { ...report.par, routed: true, unroutedSignals: 0, done: true };
    log(`Routed ${routed.routed} nets (${routed.pips} PIPs, ${routed.iterations} passes) in ${(pr.routeMs / 1000).toFixed(1)} s: ${report.files.routed}`);
    log('All signals are completely routed.');
  }

  function runTiming() {
    const design = parseXdl(routedText);
    const sta = analyzeTiming(design, io.device());
    const constraints = ucfText ? parseUcf(ucfText).clocks || [] : [];
    const checks = checkPeriods(sta, design, constraints);
    const lines = timingReport(sta, checks);
    report.files.timing = io.write('open/timing.txt', `Static timing analysis of ${top} (Silinx toolchain, delay model of core/fpga/timing.js)\n\n${lines.join('\n')}\n`);
    const failed = checks.filter(c => !c.missing && !c.met);
    for (const l of lines) if (/^(clock|constraint)/.test(l)) log(l);
    for (const c of failed) log(`WARNING:Timing - constraint PERIOD ${c.required} ns on ${c.port} not met: the clock needs ${c.period.toFixed(3)} ns`);
    for (const c of checks.filter(c => c.missing)) log(`WARNING:Timing - constraint PERIOD ${c.required} ns on ${c.port}: no clock of the design comes from this port`);
    const worst = sta.clocks.reduce((a, c) => Math.max(a, c.period), 0);
    report.timing = {
      met: failed.length === 0, timingErrors: failed.length, score: null,
      minPeriodNs: worst ? +worst.toFixed(3) : null, maxFreqMHz: worst ? +(1000 / worst).toFixed(3) : null,
      clocks: sta.clocks.map(c => ({ clock: c.clock, port: clockPort(design, c.clock), minPeriodNs: +c.period.toFixed(3), maxFreqMHz: +(1000 / c.period).toFixed(3) })),
      constraints: checks.filter(c => !c.missing).map(c => ({ name: `PERIOD ${c.port}`, constraint: `PERIOD ${c.required} ns on ${c.port}`, required: c.required,
        minPeriodNs: +c.period.toFixed(3), maxFreqMHz: +(1000 / c.period).toFixed(3), timingErrors: c.met ? 0 : 1, slackNs: +c.slack.toFixed(3) })),
    };
    report.par.constraintsMet = report.timing.met;
    log(failed.length ? `${failed.length} constraint(s) not met.` : constraints.length ? 'All constraints were met.' : 'No timing constraints (PERIOD) in the UCF.');
  }

  function bitfile(name, startupClk) {
    const sc = /^cclk$/i.test(startupClk) ? 'Cclk' : /^userclk$/i.test(startupClk) ? 'UserClk' : 'JtagClk';
    const { bytes, unknown } = bitgen(routedText, io.bitDb(), { name: `${top}.ncd`, crc: true, startupClk: sc, part: `${spec.device.replace(/^xc/, '')}${spec.pkg}` });
    if (unknown.length) {
      throw new StepError(`${unknown.length} feature(s) of the design are not in the bit database: no bitstream`, unknown.slice(0, 50).map(u => `${u.tile} ${u.feature}`));
    }
    return { path: io.write(name, bytes), size: bytes.length };
  }
  // Back-annotate Pin Locations: the pads of the ports in the placed design, as Xilinx pin2ucf
  // writes them (build/<top>_pins.ucf); the application adds them to the project's UCF
  function runPins() {
    const text = routedText ?? io.read('open/routed.xdl') ?? io.read('open/placed.xdl');
    if (text == null) throw new StepError('no placed design: run Place & Route first', [], '');
    const pins = placedPins(parseXdl(text));
    let locs = {};
    try { if (ucfText) locs = parseUcf(ucfText).assignments; } catch { /* checked by translate */ }
    const given = new Set(Object.keys(locs).filter(k => locs[k].loc).map(k => k.toLowerCase()));
    const chosen = pins.filter(p => !given.has(p.net.toLowerCase())).length;
    io.write(`${top}_pins.ucf`, pinsUcf(pins, { header: `Pin locations of '${top}' on ${spec.part}: the pads of the placed design (Silinx toolchain), as Xilinx pin2ucf writes them` }));
    report.pinsUcf = { path: `build/${top}_pins.ucf` };
    log(`Pin locations of ${pins.length} port bit(s), ${chosen} of them chosen by the placer (no LOC in the constraints): build/${top}_pins.ucf`);
  }
  // Generate Text Power Report (#123): an estimate (core/power.js), laid out as XPower's text report
  // (build/<top>.pwr); its summary in the Design Summary as XPower's
  function runPower() {
    routedOrEarlier();
    let periods = [];
    try { if (ucfText) periods = parseUcf(ucfText).clocks || []; } catch { /* checked by translate */ }
    const est = estimatePower(parseXdl(routedText), { device: spec.device, periods });
    io.write(`${top}.pwr`, powerReport(est, { top, part: spec.part, errorPercent: ESTIMATE_ERROR_PERCENT }));
    report.power = { totalMw: est.totalMw, dynamicMw: est.dynamicMw, staticMw: est.staticMw, junctionC: est.junctionC, estimate: true };
    for (const w of est.warnings) log(`WARNING:Power - ${w}`);
    log(`Estimated power: ${est.totalMw.toFixed(2)} mW (dynamic ${est.dynamicMw.toFixed(2)} mW, static ${est.staticMw.toFixed(2)} mW), junction ${est.junctionC.toFixed(1)} C: build/${top}.pwr (an estimate, not Xilinx XPower)`);
  }
  // (Place & Route of an earlier run: the routed design it wrote)
  const routedOrEarlier = () => { if (routedText == null) routedText = io.read('open/routed.xdl'); if (routedText == null) throw new StepError('no routed design: run Place & Route first', [], ''); };

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
    if (steps.includes('map')) { step('map'); runMap(); save(); }
    if (steps.includes('postmap')) { step('postmap'); await runPostMap(); save(); }
    if (steps.includes('par')) { step('par'); runPar(); save(); }
    if (steps.includes('trce')) { step('trce'); routedOrEarlier(); runTiming(); save(); }
    if (steps.includes('pin2ucf')) { step('pin2ucf'); runPins(); save(); }
    if (steps.includes('xpwr')) { step('xpwr'); runPower(); save(); }
    if (steps.includes('bitgen')) {
      step('bitgen');
      routedOrEarlier();
      report.bit = bitfile(`${top}.bit`, spec.startupClk);
      save();
      log(`Bitstream: build/${top}.bit (${report.bit.size} bytes, every feature in the bit database)`);
    }
    if (steps.includes('prombit')) {
      step('prombit');
      routedOrEarlier();
      report.prom = bitfile(`${top}_prom.bit`, 'Cclk');
      save();
      log(`PROM bitstream (StartUpClk Cclk): build/${top}_prom.bit`);
    }
    if (steps.includes('fpgaview')) {
      step('fpgaview');
      if (io.read('open/routed.xdl') == null) throw new StepError('no routed design: run Place & Route first', [], '');
      log(`The FPGA view reads ${report.files.routed || 'build/open/routed.xdl'}.`);
    }
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
