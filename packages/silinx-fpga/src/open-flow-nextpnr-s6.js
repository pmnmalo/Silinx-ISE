// Silinx toolchain - the Spartan-6's Place & Route by nextpnr (#2138; the plan: #2131), chosen by spec.engine ===
// 'nextpnr'. Silinx's Map stays (open-flow-s6.js: the netlist packed into sites); nextpnr-himbaechel with the spartan6
// micro-architecture (the fork pmnmalo/nextpnr-spartan, its WebAssembly package through io.nextpnr.spartan6) places those sites,
// and, the placed design written with its constants' sources (fpga/s6/xdl.js), routes it.
import { parseUcf } from './ucf.js';
import { parseXdl, writeXdl } from './xdl.js';
import { s6Sites } from './fpga/s6/sites.js';
import { placeS6 } from './fpga/s6/place.js';
import { placedXdlS6 } from './fpga/s6/xdl.js';
import { checkRoutingS6 } from './fpga/s6/route-check.js';
import { analyzeTimingS6 } from './fpga/s6/timing.js';
import { placementOf, routedDesignS6, siteNetlist } from './fpga/s6/nextpnr.js';

const PLACE_SEEDS = 3;
// a routed design's minimum period by Silinx's timing model (ns; 0: no clocked paths)
const periodOf = (routed, device) => analyzeTimingS6(parseXdl(writeXdl(routed)), device).clocks.reduce((a, c) => Math.max(a, c.period), 0);

/** runPar of the Spartan-6 by nextpnr. ctx: mountS6Steps's, and its state() ({ packed, phys, sites }) after Map. */
export function mountNextpnrS6(ctx) {
  const { io, spec, log, report, now, ms, netlist, ucfText, StepError, setRouted, state } = ctx;
  const part = `${spec.device}${spec.pkg}`;

  async function run(what, args, input, db) {
    const lines = [];
    let files;
    try {
      files = await io.nextpnr.spartan6.run(['--device', part, '--chipdb', 'chipdb.bin', '--json', 'design.json', '--write', 'out.json', ...args],
        { 'design.json': JSON.stringify(input), 'chipdb.bin': db }, l => {
          lines.push(l);
          if (/^ERROR:/.test(l)) log(`ERROR:nextpnr - ${l.replace(/^ERROR:\s*/, '')}`);
          // (a clock's frequency: the timing step's, of the seed kept)
          else if (/^Warning:/.test(l) && !/Max frequency/.test(l)) log(`WARNING:nextpnr - ${l.replace(/^Warning:\s*/, '')}`);
        });
    } catch (e) {
      throw new StepError(`nextpnr's ${what} failed: ${e.message}`, lines.filter(l => /^ERROR:/.test(l)).slice(0, 20));
    }
    const out = files?.['out.json'];
    if (!out) throw new StepError(`nextpnr's ${what} wrote no design`, lines.filter(l => /^ERROR:/.test(l)).slice(0, 20));
    return { json: JSON.parse(typeof out === 'string' ? out : new TextDecoder().decode(out)) };
  }

  async function runPar() {
    const device = io.device(), { packed, phys } = state(), sites = state().sites || s6Sites(device), nl = netlist();
    if (!io.nextpnr?.spartan6) throw new StepError('the nextpnr engine is not available here (io.nextpnr)', [], 'Choose the Silinx engine (Toolchain Settings).');
    const t = now();
    const db = await io.nextpnr.spartan6.chipdb(part, log);
    // the pads and the global buffers, by Silinx's rules (the banks' VCCO, a clock pad's dedicated path); the block RAMs
    // and DSP48A1s from its timing-driven placement (nextpnr's analytical placer left them columns apart: the stopwatch
    // on the Atlys missed its 10 ns on every seed), a DSP48A1 cascade with them
    const hard = phys.insts.some(i => i.kind === 'bram' || i.kind === 'dsp');
    let legal;
    try { legal = placeS6(phys, sites, { seed: spec.seed || 1, effort: hard ? 1 : 0, timing: hard ? 0.1 : 0, nl }); } catch (e) { throw new StepError(`placement failed: ${e.message}`, [], e.hint); }
    for (const w of legal.warnings || []) log(`WARNING:Place - ${w}`);
    const fixed = new Map(), generalOk = new Set();
    phys.insts.forEach((inst, i) => {
      if (!['iob', 'bufg', 'bram', 'dsp'].includes(inst.kind)) return;
      fixed.set(inst.name, legal.site[i]);
      if (inst.kind === 'iob' && !sites.pads.get(legal.site[i])?.bufg.length) generalOk.add(inst.name);
    });
    const chains = phys.chains.filter(c => c.length > 1).map(c => c.map(i => phys.insts[i].name));
    let mhz = null;
    try { const c = ucfText ? parseUcf(ucfText).clocks || [] : []; if (c.length) mhz = 1000 / Math.min(...c.map(x => x.period)); } catch { /* translate's */ }
    const freq = [...(mhz ? ['--freq', mhz.toFixed(3)] : []), '--timing-allow-fail'];
    const unplaced = placedXdlS6(nl, packed, phys, { site: [], tile: [], pos: [] }, { part: spec.part, name: spec.top });
    // 1. the placements and their routings, of the placed design with its constants' sources. The seeds differ by up
    // to 20 %, and nextpnr's estimates do not rank them: PLACE_SEEDS of them, the one Silinx's timing model finds fastest.
    const netlistIn = siteNetlist(unplaced, { top: spec.top, fixed, chains, generalOk, device });
    let best = null;
    for (let k = 0; k < PLACE_SEEDS; k++) {
      const seed = String((spec.seed || 1) + k);
      const placedRun = await run('placement', ['--no-route', '--seed', seed, ...freq], netlistIn, db);
      let placement, placed;
      try {
        placement = placementOf(placedRun.json, phys, device);
        placed = placedXdlS6(nl, packed, phys, placement, { part: spec.part, name: spec.top, device });
      } catch (e) { throw new StepError(`nextpnr's placement cannot be read: ${e.message}`); }
      const routedRun = await run('routing', ['--no-place', '--seed', seed, ...freq], siteNetlist(placed, { top: spec.top, generalOk, chains: [], device }), db);
      let routed;
      try { routed = routedDesignS6(routedRun.json, placed, device); } catch (e) { throw new StepError(`nextpnr's routed design cannot be read: ${e.message}`); }
      const period = periodOf(routed, device);
      log(`nextpnr, seed ${seed}: ${period ? `minimum period ${period.toFixed(3)} ns` : 'no clocked paths'}.`);
      if (!best || period < best.period) best = { period, placed, placement, routed };
    }
    const { placed, placement, routed } = best;
    report.files.placed = io.write('open/placed.xdl', writeXdl(placed));
    log(`Placed ${placement.site.length} sites by nextpnr in ${ms(t)}: ${report.files.placed}`);
    const text = writeXdl(routed);
    report.files.routed = io.write('open/routed.xdl', text);
    const check = checkRoutingS6(parseXdl(text), device);
    if (!check.ok) throw new StepError('the routing check failed', check.problems.slice(0, 50));
    setRouted(text);
    const pips = routed.nets.reduce((n, x) => n + x.pips.length, 0);
    report.par = { routed: true, unroutedSignals: 0, nets: routed.nets.length, pips, iterations: null, done: true, engine: 'nextpnr' };
    log(`Routed ${routed.nets.length} nets (${pips} PIPs) by nextpnr: ${report.files.routed}`);
    log('All signals are completely routed.');
  }

  return { runPar };
}
