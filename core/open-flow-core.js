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
// spec.resources: the part's resources (core/resources.js resourcesOf(part, pkg)), for the synthesis's used of
// available and its check (#795); without them the synthesis gives the used ones only.
// Prints "=== SILINX STEP <step> ===" before each step, "=== SILINX FAILED <step> (exit 1) ===" and the
// ERROR lines when one fails, "=== SILINX DONE ===" at the end (the protocol of ISE's run.sh).
// Returns { ok, report }.
import { compile, elaborate } from './compile.js';
import { primitiveSources } from './unisim.js';
import { synthesizeOpen, cellCounts } from './synth-open.js';
import { usedOfPrimitives, overResources, overMessage } from './resource-check.js';
import { parseXdl, writeXdl } from './xdl.js';
import { parseUcf } from './ucf.js';
import { readYosysJson } from './fpga/netlist.js';
import { pack } from './fpga/pack.js';
import { placeRouteBest, effortTries, effortExtra } from './fpga/place-route.js';
import { deviceSites } from './fpga/place.js';
import { checkRouting } from './fpga/route.js';
import { bitgen, knownRouting } from './fpga/bitgen.js';
import { mountSimModels } from './open-flow-models.js';
import { mountFlowReports } from './open-flow-reports.js';

export const ISE_HINT = 'The Silinx toolchain does not support this yet: implement the design in an ISE mode (Toolchain Settings).';

export class StepError extends Error {
  constructor(message, list = [], hint = ISE_HINT) { super(message); this.list = list; this.hint = hint; }
}

/**
 * Run the steps of spec ({ top, family, device, pkg, part, steps, seed, effort, replicate,
 * startupClk, synthUpToDate, synthEffort, deepRule }) with io (above). synthEffort: 'normal' | 'high' (the default), the
 * synthesis's Optimization Effort (#282; 'high' given, Place & Route makes HIGH_TRIES placements too, the fastest kept, and HIGH_EXTRA more routed when the placer's estimate is promising, #651; Normal NORMAL_TRIES for a small design); deepRule: Normal's rule of the deep designs (core/synth-open.js DEEP_RULE, for tests). synthUpToDate ({ report }: the synthesis part of the
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
  // the placements Place & Route makes for a design of `slices` slices: HIGH_TRIES at Optimization Effort High, NORMAL_TRIES at Normal (#651)
  const parTries = slices => effortTries(spec.synthEffort, slices);
  // and the placements more at High, each routed only when its estimate is promising (#651)
  const parExtra = () => effortExtra(spec.synthEffort);
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
    if (spec.synthEffort) log(spec.synthEffort === 'normal' ? 'Optimization Effort Normal: one mapping, and the mappings for speed for a small design or one limited by its logic depth (High tries them for every design, a slower synthesis).'
      : 'Optimization Effort High: the mappings for speed tried too, the fastest kept.');
    let r;
    try {
      r = await synthesizeOpen(design, { family: spec.family, run: io.yosys, effort: spec.synthEffort || 'high', ...(spec.deepRule && { deepRule: spec.deepRule }), ...(spec.smallRule && { smallRule: spec.smallRule }), onLine: l => { if (/^(Warning|ERROR)/.test(l)) log(l.replace(/^Warning:/, 'WARNING:Yosys -').replace(/^ERROR:/, 'ERROR:Yosys -')); } });
    } catch (e) {
      for (const l of e.lines || []) if (/ERROR/.test(l)) log(l);
      throw new StepError(`synthesis failed: ${e.message}`);
    }
    // (Normal: a small design synthesized as at High, #652)
    if (r.depth?.small) log(`Optimization Effort Normal: a small design (${r.depth.small.luts} LUTs): the mappings for speed tried too, ${r.depth.small.kept ? 'the fastest kept.' : `not faster (${r.depth.small.ns[1].toFixed(1)} ns estimated against ${r.depth.small.ns[0].toFixed(1)}): the one mapping kept.`}`);
    // (Normal: a design limited by its depth got the mappings for speed too, #468)
    if (r.depth?.auto) log(`Optimization Effort Normal: ${r.depth.levels} levels of logic: the mappings for speed tried too, ${r.depth.normal?.kept ? `not a quarter faster (${r.depth.high.ns.toFixed(1)} ns estimated against ${r.depth.normal.ns.toFixed(1)}): the one mapping kept.` : 'the fastest kept.'}`);
    for (const w of r.warnings.filter(w => !/^Warning:/.test(w))) log(`WARNING:Synthesis - ${w}`);
    const paths = {};
    for (const [name, text] of Object.entries(r.files)) paths[name] = io.write(`open/${name}`, text);
    const u = r.util;
    // every resource used of the device's (#795): the family's own from the netlist's cells (core/resources.js),
    // the LUTs, flip-flops and I/O from the utilization; the others (latches, carry…) with no total
    const used = { ...usedOfPrimitives(spec.family, cellCounts(r.files[`${r.top}.json`], r.top)), luts: u.luts || 0, ffs: u.flipFlops || 0, iob: u.ios || 0 };
    const res = (spec.resources || []).filter(x => !['slices', 'distRam'].includes(x.id));
    const own = res.filter(x => !['luts', 'ffs', 'iob'].includes(x.id));
    const of = id => res.find(x => x.id === id);
    const row = (id, name) => ({ id, name, used: used[id] || 0, total: of(id)?.count ?? null, percent: of(id)?.count ? pct(used[id] || 0, of(id).count) : null });
    // (the Spartan-3E's lines as XST names them; another family's, its MAP report's)
    const s3e = { luts: 'Number of 4 input LUTs', ffs: 'Number of Slice Flip Flops', ramb16: 'Number of RAMB16s', mult18x18: 'Number of MULT18X18SIOs', bufgmux: 'Number of GCLKs', dcm: 'Number of DCMs', iob: 'Number of IOs' };
    const name = id => (spec.family === 'spartan3e' ? s3e[id] : of(id)?.report) || s3e[id] || id;
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
  const { runPostMap, runPostPar, runPostSynth, runPostTranslate } = mountSimModels({
    io, spec, knownPips, log, netlist: () => netlist, packed: () => packed, parTries, parExtra, report,
    routedOrEarlier: (...a) => routedOrEarlier(...a), routedText: () => routedText, step, synth: () => synth, top,
    ucfText
  });

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
      packed = pack(netlist, { ucf: ucfText, part: spec.part });
    } catch (e) { throw new StepError(`packing failed: ${e.message}`); }
    for (const w of packed.warnings || []) log(`WARNING:Pack - ${w}`);
    const items = mapReport();
    log('Design summary (pack):');
    for (const i of items) log(`  ${i.name}: ${i.used} out of ${i.total} ${i.percent}%`);
    log(`Packed in ${ms(t)}.`);
  }

  // the Design Summary's map section, from the packed design (again after a register replication): every
  // resource used of the device's sites, in the MAP report's order (core/resources.js); more than the device
  // has, the step fails with the resources named, the report kept (the summary shows them over 100 %, #795)
  function mapReport() {
    const s = packed.stats;
    const sites = deviceSites(io.device());
    const nSlices = sites.slices.size;
    const rows = [['ffs', 'Number of Slice Flip Flops', s.ffs, 2 * nSlices], ['luts', 'Number of 4 input LUTs', s.luts, 2 * nSlices], ['slices', 'Number of occupied Slices', s.slices, nSlices],
      ['iob', 'Number of bonded IOBs', s.iobs, sites.pads.size], ['ramb16', 'Number of RAMB16s', s.brams || 0, sites.brams.length], ['mult18x18', 'Number of MULT18X18SIOs', s.mults || 0, sites.mults.length],
      ['bufgmux', 'Number of BUFGMUXs', s.bufgs, sites.bufgmux.length], ['dcm', 'Number of DCMs', s.dcms || 0, sites.dcms.length]];
    const items = rows.map(([id, name, used, total]) => ({ id, ...util(name, used, total) }));
    const byId = Object.fromEntries(items.map(i => [i.id, i]));
    report.map = { utilization: items, summary: { slices: byId.slices, ffs: byId.ffs, luts: byId.luts, iobs: byId.iob, bufg: byId.bufgmux }, carry: s.carry, muxes: s.muxes, warnings: (packed.warnings || []).length, errors: 0 };
    const over = overResources(items.map(i => ({ id: i.id, report: i.name, count: i.total })), Object.fromEntries(items.map(i => [i.id, i.used])));
    if (over.length) {
      report.map.errors = over.length;
      log('Design summary (pack):');
      for (const i of items) log(`  ${i.name}: ${i.used} out of ${i.total} ${i.percent}%`);
      throw new StepError(over.map(o => overMessage(o, spec.device)).join('; '), [], 'Choose a larger device (Design Properties).');
    }
    return items;
  }

  function runPar() {
    const d = io.device();
    const k = knownPips();
    // place, route and their timing (core/fpga/place-route.js, the flows' one place and route): each
    // clock's flip-flops on the slices its global line reaches through switches of known bits; then
    // register replication (#4): the flip-flops and LUTs of many loads on the critical path copied
    // (#522), the design placed again from the first placement (#87) and routed; the faster kept. At Optimization Effort
    // High (and Normal, a small design), two placements first (seeds seed, seed + 1 …), the fastest kept; at High a third,
    // routed only when the placer's estimate is shorter than one of the first two's (#651)
    let pr;
    const tried = [], placeWarned = new Set();
    try {
      pr = placeRouteBest(netlist, packed, d, k, {
        seed: spec.seed || 1, tries: parTries(packed.stats.slices), extra: parExtra(), effort: spec.effort || 1, replicate: spec.replicate !== false, routeIterations: spec.routeIterations || null, pack: { ucf: ucfText, part: spec.part },
        onRouted: (p, info) => {
          if (info.replication) return;
          if (!info.retry) tried.push(p);
          // (each warning once, whichever placements give it)
          for (const w of p.placement.warnings || []) if (!placeWarned.has(w)) { placeWarned.add(w); log(`WARNING:Place - ${w}`); }
        },
        onReplication: x => log(`Register replication: ${x.flipFlops} flip-flop(s)${x.luts ? ` and ${x.luts} LUT(s)` : ''} on the critical path copied (${x.copies} copies): ${x.kept ? `kept, ${x.result.sta.period.toFixed(3)} ns instead of ${x.before.toFixed(3)} ns` : 'not kept, no faster'}.`),
      });
    } catch (e) { throw new StepError(`placement failed: ${e.message}`, [], e.hint); }   // (e.hint: the placer's, #128)
    if (tried.length + pr.unrouted.length > 1) {
      const ns = p => (p.sta ? `${p.period.toFixed(3)} ns` : 'not routed');
      const kept = tried.reduce((a, p) => (p.period < a.period ? p : a));
      // (an extra placement whose estimate was no shorter than the first ones': not routed, #651)
      const all = [...tried.map(p => [p.seed, ns(p)]), ...pr.unrouted.map(s => [s, 'not routed (estimated slower)'])].sort((a, b) => a[0] - b[0]);
      log(`Optimization Effort ${spec.synthEffort === 'high' ? 'High' : 'Normal'}: ${all.length} placements (seeds ${all.map(a => a[0]).join(', ')}): ${all.map(a => a[1]).join(', ')}; seed ${kept.seed} kept.`);
    }
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

  const { bitfile, runPins, runPower, runTiming } = mountFlowReports({
    io, spec, log, report, routedOrEarlier: (...a) => routedOrEarlier(...a), routedText: () => routedText, top, ucfText
  });

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
    if (steps.includes('postpar')) { step('postpar'); await runPostPar(); save(); }
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
