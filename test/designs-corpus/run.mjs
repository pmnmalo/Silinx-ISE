#!/usr/bin/env node
// Design corpus: real open-source designs (test/designs-corpus/manifest.json, fetched at pinned
// commits by scripts/fetch-design-corpus.mjs, never committed) through the whole of Silinx's
// toolchain, stage by stage, with the time and the warnings of each stage:
//
//   frontend  Silinx parses and elaborates the design (errors: the constructs it cannot read yet),
//             and runs its design checks (lint), as Check Syntax does
//   tb        the design's own self-checking testbench in Silinx's simulator (pass / fail)
//   synth     the open synthesis: Silinx's synthesis front end + Yosys (YoWASP)
//   diff      the netlist simulated against the RTL, cycle by cycle (test/diff-synth.js)
//   flow      the open back end on the XC3S250E (Basys2-250), or the larger XC3S500E / XC3S1200E
//             (Nexys2) for a design too large for it: pack, then place and route as the app's flow
//             does (core/fpga/place-route.js: the delay table, routing on the PIPs of known bits,
//             static timing, register replication), bitgen ('complete' when the bitstream is complete). The
//             clock is put on the board's oscillator pin (B8, PERIOD 20 ns). A design with more port
//             bits than the package has pins goes through an I/O wrapper (lib.mjs ioWrapper); cells
//             the packer does not support yet (block / distributed RAM, shift registers,
//             multipliers) are recorded as a warning and the design is synthesized again without
//             them (-nobram -nolutram -nosrl -nodsp) to test the rest of the flow.
//
//   node test/designs-corpus/run.mjs [--filter name[,name]] [--jobs n] [--cycles n] [--update]
//        [--stages frontend,tb,…] [--projects dir] [--bits dir] [--sizes dir [--sizes-only]] [--json file]
//        [--size-tolerance 5] [--period-tolerance 15] [--seed n] [--machine name]
//   node test/designs-corpus/run.mjs --record-times results.json --machine ci
//   node test/designs-corpus/run.mjs --table      (the README's results table and run times, from
//                                                  expected.json and times.json)
//   (npm run test:designs)
//
// test/designs-corpus/expected.json holds the expected status and warnings of every stage of every
// design, and the size and speed of each circuit whose flow completes (slices, LUTs, FFs, the
// critical path by the STA). The run fails on a regression (a stage expected 'pass' / 'complete'
// that is not), on a warning that appeared or vanished, and on a circuit larger or slower beyond
// the tolerance (%); improvements are listed; --update records the results (and the README's
// results table, as --table writes it). The run times are
// compared with test/designs-corpus/times.json's for this machine class (warnings only; README).
// The results (times, sizes, timing) go to the checkout's own .cache/designs-results/results.json
// (--json file elsewhere); the fetched sources are shared by the checkouts (#105:
// scripts/fetch-design-corpus.mjs corpusPaths).
// --projects dir writes a Silinx project folder per design whose flow completed (for
// scripts/check-open-flow.mjs, the check against ISE); --bits dir keeps the bitstreams; --sizes dir
// writes a project per design once packed (on the XC3S1200E-FG320, the largest supported chip) with
// Silinx's size in size.json, for test/designs-corpus/xst-size.mjs (the size against XST's).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { STAGES, kindOf, validateManifest, compareExpectations, updatedExpectations, countWarnings, parseTime, ioWrapper, paramWrapper, boardClockUcf, FLOW_PARTS as PARTS, chipOf, deviceOf, flaggedSynth,
  qualityOf, compareQuality, QUALITY_TOLERANCE, machineClass, timesOf, compareTimes, slowestTable, resultsTable, withResultsTable, timesTable, withTimesTable, PADS_SHORT } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const EXPECTED = path.join(HERE, 'expected.json');
// the stage times of a full run per machine class ('ci', 'local', …): the run-time baselines
const TIMES = path.join(HERE, 'times.json');
const README = path.join(HERE, 'README.md');
// per design: the largest (AES on the XC3S1200E) take about 6 min on an Apple-silicon Mac, more on CI;
// generous, for a loaded machine (#55)
const TIMEOUT = 120 * 60000;

const clean = s => String(s).replace(/\s+/g, ' ').replace(/(?:\/[^\s:'"]+)*\/\.cache\/designs-corpus\/[^/\s]+\/[0-9a-f]{40}\//g, '').slice(0, 200);

/** The sources of a design: { design: [{ path, lang, text, role }], tb: [...] }. */
function loadSources(manifest, d, sourceDir) {
  const dir = sourceDir(manifest.sources[d.source]);
  const read = (f, role) => {
    const local = f.startsWith('local:');
    const abs = local ? path.join(HERE, f.slice(6)) : path.join(dir, f);
    const lang = /\.(vhd|vhdl)$/i.test(f) ? 'vhdl' : /\.(v|sv|vh)$/i.test(f) ? 'verilog' : null;
    let text = fs.readFileSync(abs, 'utf8');
    if (lang === 'verilog' && d.defines) text = Object.entries(d.defines).map(([k, v]) => `\`define ${k} ${v}\n`).join('') + text;
    return { path: local ? f.slice(6) : f, lang, text, role };
  };
  return { design: d.files.map(f => read(f, 'design')), tb: (d.testbench?.files || []).map(f => read(f, 'sim')) };
}

const diagLine = x => `${String(x.file || '').split(/[\\/]/).pop()}:${x.line ?? ''}: ${x.message}`;
const silinxWarning = (x, what = '') => `WARNING:Silinx${what} - ${diagLine(x)}`;

/** All stages of one design: { name, <stage>: status, warnings: { stage: [..] }, times: { stage: ms }, details }. */
async function runDesign(manifest, d, opts) {
  const { compile, elaborate } = await import('../../core/compile.js');
  const { primitiveSources } = await import('../../core/unisim.js');
  const { designChecks } = await import('../../core/lint.js');
  const { Simulator } = await import('../../core/simulator.js');
  const { synthesizeOpen, yosysScript, cellCounts, utilization } = await import('../../core/synth-open.js');
  const { toVerilog, SynthError } = await import('../../core/synth-verilog.js');
  const { yosysNode } = await import('../../core/synth-open-node.js');
  const { compareNetlist } = await import('../diff-synth.js');
  const { sourceDir } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'fetch-design-corpus.mjs')).href);

  const res = { name: d.name, warnings: {}, times: {}, details: {} };
  const stages = new Set(opts.stages);
  const warn = (st, list) => { const w = countWarnings(list); if (w.length) res.warnings[st] = w; };
  const timed = async (st, fn) => { const t = Date.now(); try { return await fn(); } finally { res.times[st] = Date.now() - t; } };
  const srcs = loadSources(manifest, d, sourceDir);

  // ---- frontend: parse, elaborate, design checks (as Check Syntax)
  let lib, design;
  await timed('frontend', () => {
    const w = [];
    try {
      lib = compile([...primitiveSources(srcs.design), ...srcs.design]);
      const perr = lib.errors.filter(e => e.severity === 'error');
      w.push(...lib.errors.filter(e => e.severity === 'warning').map(e => silinxWarning(e)));
      if (perr.length) { res.frontend = `unsupported: parse: ${clean(diagLine(perr[0]))}`; res.details.frontendErrors = [...new Set(perr.map(e => clean(diagLine(e))))].slice(0, 20); return; }
      design = elaborate(lib, d.top, { generics: d.generics || {} });
      const eerr = design.diags.filter(e => e.severity === 'error');
      w.push(...design.diags.filter(e => e.severity === 'warning').map(e => silinxWarning(e)));
      if (eerr.length || !design.top) { res.frontend = `unsupported: elaborate: ${clean(eerr.length ? diagLine(eerr[0]) : 'no top')}`; res.details.frontendErrors = [...new Set(eerr.map(e => clean(diagLine(e))))].slice(0, 20); design = null; return; }
      w.push(...designChecks(lib, design).filter(x => x.severity === 'warning').map(x => `WARNING:${x.tool || 'Silinx'} (${x.check}) - ${diagLine(x)}`));
      res.frontend = 'pass';
      res.details.ports = design.top.ports.map(p => ({ name: p.name, dir: p.dir, w: p.sig.t.w }));
    } catch (e) { res.frontend = `error: ${clean(e.message)}`; design = null; }
    finally { warn('frontend', w); }
  });

  // ---- the design's own testbench
  if (d.testbench && stages.has('tb')) {
    await timed('tb', () => {
      const tb = d.testbench, w = [];
      try {
        const all = [...srcs.design, ...srcs.tb];
        const tlib = compile([...primitiveSources(all), ...all]);
        const errs = tlib.errors.filter(e => e.severity === 'error');
        if (errs.length) { res.tb = `unsupported: parse: ${clean(diagLine(errs[0]))}`; return; }
        const tdes = elaborate(tlib, tb.top, { generics: tb.generics || {} });
        const eerr = tdes.diags.filter(e => e.severity === 'error');
        if (eerr.length || !tdes.top) { res.tb = `unsupported: elaborate: ${clean(eerr.length ? diagLine(eerr[0]) : 'no top')}`; return; }
        w.push(...tdes.diags.filter(e => e.severity === 'warning').map(e => silinxWarning(e)));
        const sim = new Simulator(tdes, { files: new Map(all.map(s => [s.path, s.text])) });
        for (const s of tdes.signals) s.wave = null;   // no waveform: only the messages count
        // run until the testbench says it passed or failed (some never stop their clock), or `until`
        const pass = new RegExp(tb.pass), fail = tb.fail ? new RegExp(tb.fail) : null;
        const until = parseTime(tb.until || '1 ms'), chunk = Math.max(1, Math.round(until / 100));
        let st;
        for (let t = chunk; ; t += chunk) {
          st = sim.run(Math.min(t, until));
          if (st.finished || t >= until || sim.log.some(e => pass.test(e.text) || (fail && fail.test(e.text)))) break;
        }
        const log = sim.log;
        w.push(...log.filter(e => e.kind === 'warning').map(e => `WARNING:Silinx (simulator) - ${e.text}`));
        const text = log.map(e => e.text).join('\n');
        const passed = pass.test(text);
        const failLine = log.find(e => (fail && fail.test(e.text)) || (e.kind === 'error' && !pass.test(e.text)));
        res.details.tbTime = `${(st.now / 1e6).toFixed(3)} us`;
        res.tb = passed && !failLine ? 'pass' : `fail: ${clean(failLine ? failLine.text : `no '${tb.pass}' by ${tb.until || '1 ms'} (simulation ${st.finished ? `finished at ${st.now} ps` : 'still running'})`)}`;
      } catch (e) { res.tb = `error: ${clean(e.message)}`; }
      finally { warn('tb', w); }
    });
  } else if (stages.has('tb')) res.tb = 'skip: no self-checking testbench';

  if (!design) {
    for (const st of ['synth', 'diff', 'flow']) if (stages.has(st)) res[st] = 'skip: front end';
    return res;
  }

  // ---- open synthesis
  let syn = null;
  if (stages.has('synth') || stages.has('diff') || stages.has('flow')) {
    await timed('synth', async () => {
      const lines = [];
      try {
        syn = await synthesizeOpen(design, { run: yosysNode, onLine: l => lines.push(l) });
        res.synth = 'pass';
        res.details.cells = syn.util;
        warn('synth', syn.warnings);
      } catch (e) {
        const y = lines.find(l => /^ERROR/.test(l));
        res.synth = e instanceof SynthError ? `unsupported: ${clean(e.message)}` : `error: ${clean(y || e.message)}`;
        warn('synth', lines.filter(l => /^Warning:/.test(l)));
      }
    });
  }

  // ---- netlist vs RTL
  if (stages.has('diff')) {
    if (!syn) res.diff = 'skip: synthesis';
    else await timed('diff', () => {
      const sim = { cycles: opts.cycles, ...(d.sim || {}) };
      if (d.clock && !sim.clock) sim.clock = d.clock;
      let r;
      try { r = compareNetlist(design, syn, { name: d.name, seed: d.name, sim }); }
      catch (e) { r = { status: 'error', stage: 'harness', reason: e.message }; }
      res.diff = r.status === 'pass' ? 'pass' : r.status === 'mismatch' ? `mismatch: ${clean(r.reason)}` : `${r.status}: ${r.stage}: ${clean(r.reason)}`;
      if (r.report) res.details.diffReport = r.report.split('\n').map(clean);
      if (r.engine) res.details.diffEngine = r.engine;
    });
  }

  // ---- the open back end on the XC3S250E (or a larger device)
  if (stages.has('flow')) {
    if (!syn) res.flow = 'skip: synthesis';
    else await timed('flow', () => backEnd(d, design, syn, srcs, res, opts, { compile, elaborate, primitiveSources, synthesizeOpen, yosysScript, toVerilog, cellCounts, utilization, yosysNode }));
  }
  return res;
}

/** Yosys with extra synth_xilinx options (the flow's retry without the cells the packer lacks). */
async function synthWith(design, flags, m) {
  const { text, top, warnings } = m.toVerilog(design);
  const { args, files } = flaggedSynth(top, text, flags);
  const lines = [];
  const out = await m.yosysNode(args, files, l => lines.push(l));
  if (!out[`${top}.json`]) throw new Error('Yosys wrote no netlist');
  const cells = m.cellCounts(out[`${top}.json`], top);
  return { top, files: { [`${top}.json`]: out[`${top}.json`], [`${top}_syn.v`]: text }, cells, util: m.utilization(cells), warnings: [...warnings, ...lines.filter(l => /^Warning:/.test(l))] };
}

async function backEnd(d, design, syn, srcs, res, opts, m, forceWrap = false, part = PARTS[0]) {
  const { readYosysJson } = await import('../../core/fpga/netlist.js');
  const { pack, PackError } = await import('../../core/fpga/pack.js');
  const { deviceSites } = await import('../../core/fpga/place.js');
  const { placeRouteBest } = await import('../../core/fpga/place-route.js');
  const { loadDeviceCache } = await import('../../core/fpga/device-node.js');
  const { checkRouting } = await import('../../core/fpga/route.js');
  const { bitgen, knownRouting } = await import('../../core/fpga/bitgen.js');
  const { analyzeTiming, checkPeriods } = await import('../../core/fpga/timing.js');
  const { parseUcf } = await import('../../core/ucf.js');
  const { parseXdl, writeXdl } = await import('../../core/xdl.js');
  const { loadDb } = await import('../../core/fpga/bitdb-node.js');
  const w = [], steps = {};
  let again = false;
  res.details.flowSteps = steps;
  const step = (k, t, v) => { steps[k] = { ms: Date.now() - t, ...v }; };
  let routedAt = 0;
  try {
    res.details.part = part;
    const device = loadDeviceCache(part);
    const sites = deviceSites(device);
    const pads = sites.pads.size, outPads = [...sites.pads.values()].filter(p => !p.inputOnly).length;
    // the design itself, or the I/O wrapper around it
    const ports = design.top.ports.map(p => ({ name: p.name, dir: p.dir, w: p.sig.t.w }));
    const bits = ports.reduce((s, p) => s + p.w, 0);
    const outBits = ports.filter(p => p.dir !== 'in').reduce((s, p) => s + p.w, 0);
    let flowDesign = design, flowSyn = syn, wrapper = null, flowSrcs = srcs.design;
    if (forceWrap || bits > pads || outBits > outPads || ports.some(p => p.dir === 'inout')) {
      if (ports.some(p => p.dir === 'inout')) { res.flow = 'unsupported: inout ports (no I/O wrapper for them yet)'; return; }
      const clocks = [d.clock, ...(d.clocks || [])].filter(Boolean).filter(c => ports.some(p => p.name.toLowerCase() === c.toLowerCase()));
      wrapper = ioWrapper(design.top.name, ports, { clocks, generics: d.generics || {} });
      flowSrcs = [...srcs.design, { path: 'corpus_io_wrap.v', lang: 'verilog', text: wrapper.text, role: 'design' }];
      const lib = m.compile([...m.primitiveSources(flowSrcs), ...flowSrcs]);
      flowDesign = m.elaborate(lib, wrapper.name);
      const errs = [...lib.errors, ...flowDesign.diags].filter(e => e.severity === 'error');
      if (errs.length) { res.flow = `error: I/O wrapper: ${clean(diagLine(errs[0]))}`; return; }
      const t = Date.now();
      flowSyn = await m.synthesizeOpen(flowDesign, { run: m.yosysNode });
      step('wrapperSynth', t, { ports: bits, pads });
      res.details.ioWrapper = `${bits} port bits, the package has ${pads} pins`;
    }
    // the clock on the board's oscillator pin (a global clock pad: B8, 50 MHz on the Basys2)
    const clkPort = wrapper ? 'clk' : ports.find(p => p.dir === 'in' && p.w === 1 && d.clock && p.name.toLowerCase() === d.clock.toLowerCase())?.name;
    const ucf = clkPort ? boardClockUcf(clkPort, d.periodNs) : null;
    // pack (the cells it does not support yet: synthesized again without them)
    let t = Date.now();
    let packed, netlist = readYosysJson(flowSyn.files[`${flowSyn.top}.json`]);
    try { packed = pack(netlist, { ucf, part, carryOut: 'xor' }); }
    catch (e) {
      if (!(e instanceof PackError) || !/not supported yet/.test(e.message)) throw e;
      w.push(`WARNING:Silinx (pack) - ${e.message.replace(/^pack: /, '')}: synthesized again with -nobram -nolutram -nosrl -nodsp`);
      flowSyn = await synthWith(flowDesign, '-nobram -nolutram -nosrl -nodsp', m);
      steps.retry = { cells: flowSyn.util };
      netlist = readYosysJson(flowSyn.files[`${flowSyn.top}.json`]);
      packed = pack(netlist, { ucf, part, carryOut: 'xor' });
    }
    w.push(...(packed.warnings || []).map(x => `WARNING:Silinx (pack) - ${x}`));
    step('pack', t, { slices: packed.stats.slices, luts: packed.stats.luts, ffs: packed.stats.ffs });
    if (opts.sizes) {
      const u = flowSyn.util;
      const size = { slices: packed.stats.slices, luts: packed.stats.luts, ffs: packed.stats.ffs, srl16: u.shiftRegisters, lutRam: u.distributedRam, bram: u.blockRam, mult: u.multipliers,
        retry: !!steps.retry, wrapper: !!wrapper };
      writeProject(path.join(opts.sizes, d.name), d, flowSrcs, wrapper, ports, ucf, null, { family: 'spartan3e', part: 'xc3s1200e', package: 'fg320', speed: '-4' }, size);
      // --sizes-only: the project is all that is wanted (compare-ise.mjs builds it), not the rest of the
      // flow; but a design without the I/O wrapper is placed first, as the placer may find too few pads
      // for its ports and the project be written again with the wrapper (below)
      if (opts.sizesOnly && wrapper) { res.flow = 'sizes only (--sizes-only)'; return; }
    }
    // too large: the next, larger device
    const larger = PARTS[PARTS.indexOf(part) + 1];
    const tryLarger = async () => { again = true; await backEnd(d, design, syn, srcs, res, opts, m, false, larger); };
    if (packed.stats.slices > sites.slices.size) {
      if (larger) { await tryLarger(); return; }
      res.flow = `too large: ${packed.stats.slices} slices, the ${chipOf(part)} has ${sites.slices.size}`; return;
    }
    // place and route as the app's flow does (core/fpga/place-route.js: the delay table, the clock
    // and global buffer sites of known bits, the timing-driven router), with its register
    // replication (#79, #88)
    t = Date.now();
    const db = loadDb(part, { graph: device });
    const known = knownRouting(db);
    let pr;
    try {
      pr = placeRouteBest(netlist, packed, device, known, {
        seed: opts.seed, pack: { ucf, part, carryOut: 'xor' },
        onPlaced: (r, info) => {
          if (info.replication) return;
          w.push(...(r.warnings || []).map(x => `WARNING:Silinx (place) - ${x}`));
          step('place', t, { estimate: +r.delay.toFixed(2) });
        },
        onRouted: (x, info) => {
          if (info.replication) return;
          step('route', t + x.placeMs, { nets: x.routed.routed, pips: x.routed.pips, passes: x.routed.iterations });
          routedAt = Date.now();
        },
        // the replication pass: its own time (plan, pack, place and route again), not the route's
        onReplication: x => {
          steps.replication = { ms: Date.now() - routedAt, ...(x.result && { placeMs: x.result.placeMs, routeMs: x.result.routeMs }),
            flipFlops: x.flipFlops, copies: x.copies, kept: x.kept, before: +x.before.toFixed(3),
            ...(x.result?.sta && { period: +x.result.period.toFixed(3) }), ...(x.error && { error: clean(x.error.message) }) };
        },
      });
    } catch (e) {
      // fewer pads than ports once the clock pad, the input-only pads and the banks' VCCO (#128: 'no pad
      // for N I/O(s) of …') are counted: the I/O wrapper
      if (PADS_SHORT.test(e.message) && !wrapper) { again = true; await backEnd(d, design, syn, srcs, res, opts, m, true); return; }
      if (/slices needed|block RAMs needed|multipliers needed|no room/.test(e.message) || PADS_SHORT.test(e.message)) {
        if (larger) { await tryLarger(); return; }
        res.flow = `too large: ${clean(e.message.replace(/^place: /, ''))}`; return;
      }
      throw e;
    }
    const routed = pr.routed;
    if (routed.errors.length) { res.flow = `fail: route: ${clean(routed.errors[0])}`; return; }
    if (routed.failed.length) { res.flow = `fail: route: ${routed.failed.length} nets cannot be routed on PIPs of known bits`; res.details.unreached = routed.unreached.slice(0, 10).map(u => `${u.net} -> ${u.inst}.${u.pin}`); return; }
    if (routed.overused) { res.flow = `fail: route: did not converge (${routed.overused} nodes shared after ${routed.iterations} passes, ${1 + pr.retried} placements)`; return; }
    if (pr.retried) res.details.retried = { seed: pr.seed, placements: pr.retried };   // (#249: placed again, the routing before did not converge)
    const routedText = writeXdl(routed.design);
    const chk = checkRouting(parseXdl(routedText), device);
    if (!chk.ok) { res.flow = `fail: routing check: ${clean(chk.problems[0])}`; return; }
    // static timing, against the PERIOD of the UCF
    t = Date.now();
    const routedDesign = parseXdl(routedText);
    const sta = analyzeTiming(routedDesign, device);
    for (const k of checkPeriods(sta, routedDesign, ucf ? parseUcf(ucf).clocks : [])) {
      if (k.missing) w.push(`WARNING:Silinx (timing) - PERIOD on ${k.port}: no clock of the design comes from this port`);
      else {
        res.details.period = { port: k.port, required: k.required, period: +k.period.toFixed(3), met: k.met };
        if (!k.met) w.push(`WARNING:Silinx (timing) - PERIOD ${k.required} ns on ${k.port} not met`);
      }
    }
    step('sta', t, { clocks: sta.clocks.map(c => ({ clock: String(c.clock).replace(/[^\w]/g, '_').slice(0, 40), period: +c.period.toFixed(3) })) });
    const quality = qualityOf(part, pr.packed.stats, sta.clocks);
    // bitgen
    t = Date.now();
    const { bytes, unknown } = bitgen(routedText, db, { name: `${d.name}.ncd`, crc: true, startupClk: 'JtagClk', part: part.replace(/^xc/, '').replace(/-\d$/, '') });
    step('bitgen', t, { bytes: bytes.length, unknown: unknown.length });
    if (unknown.length) { res.flow = `fail: bitgen: ${unknown.length} features not in the bit database (${clean([...new Set(unknown.map(u => u.feature))].slice(0, 4).join(', '))})`; res.details.unknownFeatures = unknown.slice(0, 20).map(u => `${u.tile} ${u.feature}`); return; }
    res.flow = 'complete';
    res.quality = quality;
    if (opts.bits) { fs.mkdirSync(opts.bits, { recursive: true }); fs.writeFileSync(path.join(opts.bits, `${d.name}.bit`), bytes); }
    if (opts.projects) writeProject(path.join(opts.projects, d.name), d, flowSrcs, wrapper, ports, ucf, steps.retry ? flowSyn.files[`${flowSyn.top}.json`] : null, deviceOf(part));
  } catch (e) {
    res.flow = `error: ${clean(e.message)}`;
  } finally {
    if (again) return;
    // built on a larger device than the first: say on which
    if (part !== PARTS[0] && !/^too large/.test(res.flow)) res.flow = res.flow === 'complete' ? `complete: on the ${chipOf(part)}` : `${res.flow} (on the ${chipOf(part)})`;
    const ww = countWarnings(w);
    if (ww.length) res.warnings.flow = ww;
  }
}

/** A minimal Silinx project (silinx.json + sources + UCF) of a design, for scripts/check-open-flow.mjs;
 *  netlist: the netlist synthesized again for the packer, as netlist.json (check-open-flow.mjs
 *  <project> --json <project>/netlist.json). */
function writeProject(dir, d, srcs, wrapper, ports, ucf, netlist = null, device = { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, size = null) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  let top = wrapper ? wrapper.name : d.top;
  const all = [...srcs];
  // generics of the top: a wrapper that sets them (a project has no generics of its own)
  if (!wrapper && d.generics && Object.keys(d.generics).length) {
    const pw = paramWrapper(d.top, ports, d.generics);
    all.push({ path: 'corpus_param_wrap.v', lang: 'verilog', text: pw.text });
    top = pw.name;
  }
  const files = [];
  for (const s of all) {
    if (!s.lang) continue;
    const rel = `src/${s.path.split(/[\\/]/).pop()}`;
    fs.writeFileSync(path.join(dir, rel), s.text);
    files.push({ path: rel, lang: s.lang, role: 'design' });
  }
  const proj = { name: d.name, version: 1, device, top, files, impl: { startupClk: 'JtagClk' } };
  if (ucf) { fs.writeFileSync(path.join(dir, 'top.ucf'), ucf); proj.constraints = 'top.ucf'; }
  if (netlist) fs.writeFileSync(path.join(dir, 'netlist.json'), netlist);
  if (size) fs.writeFileSync(path.join(dir, 'size.json'), `${JSON.stringify(size)}\n`);
  fs.writeFileSync(path.join(dir, 'silinx.json'), `${JSON.stringify(proj, null, 2)}\n`);
}

if (!isMainThread) {
  const { manifest, opts } = workerData;
  parentPort.on('message', async name => {
    const d = manifest.designs.find(x => x.name === name);
    let res;
    try { res = await runDesign(manifest, d, opts); }
    catch (e) { res = { name, frontend: `error: harness: ${clean(e.message)}`, warnings: {}, times: {}, details: {} }; }
    parentPort.postMessage(res);
  });
} else {
  const args = process.argv.slice(2);
  const opt = (k, def) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : def; };
  const update = args.includes('--update');
  const filter = opt('--filter', '');
  const jobs = Math.max(1, +opt('--jobs', Math.max(1, Math.min(6, (os.availableParallelism?.() ?? os.cpus().length) - 1))));
  const opts = {
    cycles: +opt('--cycles', 200),
    stages: opt('--stages', STAGES.join(',')).split(','),
    projects: opt('--projects', null) && path.resolve(opt('--projects')),
    sizes: opt('--sizes', null) && path.resolve(opt('--sizes')),
    sizesOnly: args.includes('--sizes-only'),
    bits: opt('--bits', null) && path.resolve(opt('--bits')),
    // the placer's seed: fixed (1), so that the circuit's size and speed are reproducible; another
    // seed only to measure the placement noise (the expectations are seed 1's)
    seed: +opt('--seed', 1),
  };
  const machine = machineClass(opt('--machine', null));
  const readJson = (f, def) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : def);
  // the README's generated parts: the results table (expected.json, #89) and the run times (times.json, #105)
  const writeReadme = (manifest, expected, times) => {
    fs.writeFileSync(README, withTimesTable(withResultsTable(fs.readFileSync(README, 'utf8'), resultsTable(manifest, expected)), timesTable(times)));
  };
  const writeTimes = (all, results) => {
    all[machine] = { ...(all[machine] || {}), ...timesOf(results) };
    all[machine] = Object.fromEntries(Object.keys(all[machine]).sort().map(k => [k, all[machine][k]]));
    fs.writeFileSync(TIMES, `${JSON.stringify(all, null, 1)}\n`);
    writeReadme(readJson(path.join(HERE, 'manifest.json'), {}), readJson(EXPECTED, {}), all);
    console.log(`wrote the '${machine}' run times of ${Object.keys(timesOf(results)).length} designs to ${path.relative(process.cwd(), TIMES)} and the README's`);
  };
  // --record-times results.json: the times of a run (CI's designs-results artifact) as the baseline of
  // this machine class (--machine ci), without running anything
  if (opt('--record-times', null)) { writeTimes(readJson(TIMES, {}), readJson(path.resolve(opt('--record-times')), {})); process.exit(0); }
  // --table: the README's results table and run times from the expectations (expected.json) and
  // the baselines (times.json), without running anything (test/designs-corpus.test.js checks that
  // the README's are these, #89, #105)
  if (args.includes('--table')) {
    writeReadme(readJson(path.join(HERE, 'manifest.json'), {}), readJson(EXPECTED, {}), readJson(TIMES, {}));
    console.log(`wrote the results table and the run times of ${path.relative(process.cwd(), README)}`);
    process.exit(0);
  }
  if (update && opts.seed !== 1) { console.error('--update records seed 1 (the expectations\' seed): not with --seed'); process.exit(2); }
  const pctOpt = (k, def) => { const v = opt(k, null); return v === null ? def : +v / 100; };
  const tolerance = { slices: pctOpt('--size-tolerance', QUALITY_TOLERANCE.slices), luts: pctOpt('--size-tolerance', QUALITY_TOLERANCE.luts),
    ffs: pctOpt('--size-tolerance', QUALITY_TOLERANCE.ffs), period: pctOpt('--period-tolerance', QUALITY_TOLERANCE.period) };
  const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));
  const problems = validateManifest(manifest);
  if (problems.length) { console.error(`manifest.json:\n  ${problems.join('\n  ')}`); process.exit(2); }
  const picked = d => !filter || filter.split(',').some(f => d.name === f || d.name.includes(f));
  const { fetchDesignCorpus, corpusPaths } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'fetch-design-corpus.mjs')).href);
  await fetchDesignCorpus({ manifest: { ...manifest, designs: manifest.designs.filter(picked) } });
  const todo = manifest.designs.filter(picked).map(d => d.name);
  const results = {};
  const t0 = Date.now();
  let next = 0, done = 0;
  await new Promise(resolve => {
    let live = 0;
    const spawn = () => {
      if (next >= todo.length) { if (!live) resolve(); return; }
      live++;
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { manifest, opts }, resourceLimits: { maxOldGenerationSizeMb: 6144 } });
      let cur = null, timer = null;
      const give = () => {
        if (next >= todo.length) { w.terminate(); return; }
        cur = todo[next++];
        timer = setTimeout(() => { results[cur] = { name: cur, frontend: `error: timeout (no result after ${TIMEOUT / 60000} min)`, warnings: {}, times: {}, details: {} }; done++; cur = null; w.terminate(); }, TIMEOUT);
        w.postMessage(cur);
      };
      w.on('message', r => {
        clearTimeout(timer);
        results[r.name] = r;
        done++;
        console.error(`${String(done).padStart(3)}/${todo.length} ${r.name.padEnd(24)} ${STAGES.map(s => `${s} ${kindOf(r[s])}`).join(', ')}`);
        cur = null;
        give();
      });
      w.on('error', e => { clearTimeout(timer); if (cur) { results[cur] = { name: cur, frontend: `error: harness: ${clean(e.message)}`, warnings: {}, times: {}, details: {} }; done++; cur = null; } });
      w.on('exit', () => { clearTimeout(timer); live--; if (cur) { results[cur] = results[cur] || { name: cur, frontend: 'error: worker exited', warnings: {}, times: {}, details: {} }; done++; } spawn(); });
      give();
    };
    for (let i = 0; i < Math.min(jobs, todo.length); i++) spawn();
    if (!todo.length) resolve();
  });

  // the table
  const names = todo.filter(n => results[n]);
  console.log(`\n${'design'.padEnd(24)} ${STAGES.map(s => s.padEnd(12)).join(' ')} warnings`);
  for (const n of names) {
    const r = results[n];
    const nw = Object.values(r.warnings || {}).reduce((s, l) => s + l.length, 0);
    console.log(`${n.padEnd(24)} ${STAGES.map(s => String(kindOf(r[s])).padEnd(12)).join(' ')} ${nw}`);
  }
  console.log(`(${((Date.now() - t0) / 1000).toFixed(0)} s, ${jobs} jobs)`);
  for (const n of names) {
    const r = results[n];
    const bad = STAGES.filter(s => r[s] && !/^(pass|complete|skip)/.test(r[s]));
    if (bad.length) console.log(`\n${n}:\n${bad.map(s => `  ${s}: ${r[s]}`).join('\n')}`);
  }
  // this checkout's own (a worktree's run never overwrites the main checkout's, #105)
  const jsonOut = path.resolve(opt('--json', path.join(corpusPaths(ROOT).results, 'results.json')));
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(results, null, 1)}\n`);
  console.log(`\nresults (times, sizes, timing): ${path.relative(process.cwd(), jsonOut)}`);

  // against the expectations (only the stages that ran)
  const expected = fs.existsSync(EXPECTED) ? JSON.parse(fs.readFileSync(EXPECTED, 'utf8')) : {};
  const only = (e) => {
    const o = {};
    for (const s of opts.stages) if (e[s] !== undefined) o[s] = e[s];
    const w = {};
    for (const s of opts.stages) if (e.warnings?.[s]) w[s] = e.warnings[s];
    o.warnings = w;
    return o;
  };
  const cmp = compareExpectations(Object.fromEntries(Object.entries(expected).map(([k, e]) => [k, only(e)])),
    Object.fromEntries(names.map(n => [n, results[n]])), { ran: todo });
  const show = (title, list, f) => { if (list.length) console.log(`\n${title} (${list.length}):\n${list.map(f).join('\n')}`); };
  show('newly passing', cmp.improvements, x => `  ${x.design} ${x.stage}: ${x.got} (was: ${x.expected})`);
  show('changed', cmp.changed, x => `  ${x.design} ${x.stage}: ${x.got} (was: ${x.expected})`);
  show('not in expected.json', cmp.fresh, x => `  ${x}`);
  show('NEW WARNINGS', cmp.newWarnings, x => `  ${x.design} ${x.stage}: ${x.warning}`);
  show('VANISHED WARNINGS', cmp.vanishedWarnings, x => `  ${x.design} ${x.stage}: ${x.warning}`);
  show('REGRESSIONS', cmp.regressions, x => `  ${x.design} ${x.stage}: ${x.got} (expected: ${x.expected})`);
  show('MISSING', cmp.missing, x => `  ${x}`);
  // the size and speed of the circuits (designs whose flow completed) against the recorded ones
  const ran = Object.fromEntries(names.map(n => [n, results[n]]));
  const qc = opts.stages.includes('flow') ? compareQuality(expected, ran, tolerance) : { worse: [], better: [], moved: [], fresh: [], failed: false };
  const tolText = `tolerance: size ${(100 * tolerance.slices).toFixed(0)}%, critical path ${(100 * tolerance.period).toFixed(0)}%`;
  show(`smaller or faster (${tolText})`, qc.better, x => `  ${x.message}`);
  show('quality not compared', [...qc.moved, ...qc.fresh], x => `  ${x.message}`);
  show(`LARGER OR SLOWER (${tolText})`, qc.worse, x => `  ${x.message}`);
  // run times against this machine class's baseline: warnings only
  const allTimes = readJson(TIMES, {});
  const fullRun = opts.stages.length === STAGES.length;
  const tc = fullRun ? compareTimes(allTimes[machine], ran) : { warnings: [], unknown: [] };
  console.log(`\nslowest designs (s; baseline: the '${machine}' times in ${path.relative(process.cwd(), TIMES)}):\n${slowestTable(ran, allTimes[machine]).map(l => `  ${l}`).join('\n')}`);
  show(`slower than the '${machine}' baseline (warning only)`, tc.warnings, x => `  ${x.message}`);
  if (tc.unknown.length) console.log(`\nno '${machine}' time baseline for ${tc.unknown.length} design(s) (--update records it)`);
  if (update) {
    const updated = updatedExpectations(expected, ran);
    fs.writeFileSync(EXPECTED, `${JSON.stringify(updated, null, 1)}\n`);
    // the README's results table follows the expectations (#89), its run times the baselines (#105)
    writeReadme(manifest, updated, allTimes);
    console.log(`\nwrote ${path.relative(process.cwd(), EXPECTED)} and the results table of ${path.relative(process.cwd(), README)}`);
    if (fullRun) writeTimes(allTimes, ran);
  } else if (cmp.failed || qc.failed) process.exitCode = 1;
}
