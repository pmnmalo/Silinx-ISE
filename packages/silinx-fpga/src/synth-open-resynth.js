// The open synthesis's last depth candidates (#405: out of withDepth in synth-open-depth.js), each kept by
// DEPTH_RULE: the netlist chosen of all the others with its critical LUTs made one level shallower, their fan-out kept
// (lut-resynth.js), then with its critical path's wide decodes collapsed and mapped again (#1360,
// synth-open-bdd.js).
import { asText } from './synth-open-yosys.js';
import { criticalDelay, domainDelays, pathEnds } from './synth-open-path.js';
import { resynthCritical } from './lut-resynth.js';
import { bddRemap } from './synth-open-bdd.js';
import {
  DEPTH_RULE, RESYNTH_FILE, SPEED_RULE, SRL_CELLS, SRL_CELLS_FILE, cellCounts, keepDepth, resynthCommands, utilization
} from './synth-open.js';

/** The critical-LUT resynthesis of withDepth's chosen netlist (its ctx: run, speed, top, withResynth; its state: chosen,
 *  cells, info (info.resynth set), slices(json), sayNew(line)): { chosen, cells }, the new ones when it is kept. */
export async function resynthStage({ run, speed, top, withResynth }, { chosen, cells, info, slices, sayNew }) {
  // the chosen netlist's critical LUTs made one level shallower, their fan-out kept (#652, lut-resynth.js): the
  // last candidate, of the netlist chosen of all the others, kept by DEPTH_RULE
  if (speed && withResynth && !info.muxf?.failed && !info.failed && !info.sopb?.failed && !info.speedFailed && !info.wide?.failed && utilization(cells).luts <= SPEED_RULE.maxLuts) {
    try {
      const j0 = chosen[`${top}.json`];
      const r = resynthCritical(asText(j0) || j0, top, nl => { const { worst, ends } = pathEnds(nl, top); return ends.filter(e => e.ns >= worst - 1e-9); });
      if (r) {
        const outR = await run(['-q', '-p', resynthCommands(top)], { [RESYNTH_FILE]: JSON.stringify(r.json), [SRL_CELLS_FILE]: SRL_CELLS }, () => {});
        const jR = outR[`${top}.json`];
        if (jR) {
          const cellsR = cellCounts(jR, top);
          const ns = [criticalDelay(j0, top), criticalDelay(jR, top)], luts = [utilization(cells).luts, utilization(cellsR).luts], sl = [slices(j0), slices(jR)];
          info.resynth = { rounds: r.rounds, changed: r.luts, ns: ns[1], luts: luts[1], slices: sl[1], kept: keepDepth(ns, luts, DEPTH_RULE, sl) };
          if (info.resynth.kept) {
            chosen = { ...chosen, ...outR };
            cells = cellsR;
          }
        }
      }
    } catch (e) {
      info.resynth = { kept: false, failed: e.message };
      sayNew(`Warning: the critical path's LUTs could not be made shallower (${e.message}): the netlist chosen before is kept`);
    }
    if (!info.resynth?.failed) ({ chosen, cells } = await domainStage({ run, top }, { chosen, cells, info, slices }));
  }
  return { chosen, cells };
}

// A design of several clocks (#652, synth-open-path.js domainDelays): the critical LUTs of each clock's own critical path
// made shallower too, the slowest clock's left as the resynthesis above made them (the latches' not: their gates are
// often logic), each clock after the other; kept when no clock's path is longer and the geometric mean of the clocks'
// paths is shorter by DEPTH_RULE (its LUTs and slices bounded as for any candidate)
const geomean = xs => Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / xs.length);
async function domainStage({ run, top }, { chosen, cells, info, slices }) {
  const j0 = chosen[`${top}.json`];
  const doms = domainDelays(asText(j0) || j0, top);
  if (doms.length < 2) return { chosen, cells };
  let nl = JSON.parse(asText(j0) || j0), rounds = 0, changed = 0;
  for (const { clock } of doms.slice(1).filter(d => d.clock !== 'latch')) {
    const r = resynthCritical(nl, top, x => { const d = domainDelays(x, top).find(z => z.clock === clock); return d ? d.ends.filter(e => e.ns >= d.ns - 1e-9) : []; });
    if (r) { nl = r.json; rounds += r.rounds; changed += r.luts; }
  }
  if (!changed) return { chosen, cells };
  const outD = await run(['-q', '-p', resynthCommands(top)], { [RESYNTH_FILE]: JSON.stringify(nl), [SRL_CELLS_FILE]: SRL_CELLS }, () => {});
  const jD = outD[`${top}.json`];
  if (!jD) return { chosen, cells };
  const cellsD = cellCounts(jD, top);
  const after = new Map(domainDelays(jD, top).map(d => [d.clock, d.ns]));
  const ns = [geomean(doms.map(d => d.ns)), geomean(doms.map(d => after.get(d.clock) ?? d.ns))];
  const luts = [utilization(cells).luts, utilization(cellsD).luts], sl = [slices(j0), slices(jD)];
  const kept = doms.every(d => (after.get(d.clock) ?? d.ns) <= d.ns + 1e-9) && keepDepth(ns, luts, DEPTH_RULE, sl);
  info.domains = { clocks: doms.length, ns: doms.map(d => after.get(d.clock) ?? d.ns), rounds, changed, luts: luts[1], slices: sl[1], kept };
  return kept ? { chosen: { ...chosen, ...outD }, cells: cellsD } : { chosen, cells };
}

/** The critical path's wide decodes of withDepth's chosen netlist collapsed and mapped again (its ctx: run, speed, top,
 *  withBdd; its state as resynthStage's, info.bdd set): { chosen, cells }, the new ones when it is kept. Its own limit
 *  of LUTs (BDD_RULE.growth), none of SPEED_RULE.maxLuts: the T80 (1800 LUTs) is the design it is for. */
export async function bddStage({ run, speed, top, withBdd }, { chosen, cells, info, slices, sayNew }) {
  if (!speed || !withBdd || info.muxf?.failed || info.failed || info.sopb?.failed || info.speedFailed || info.wide?.failed || info.resynth?.failed) return { chosen, cells };
  try {
    const j0 = chosen[`${top}.json`];
    const b = await bddRemap(asText(j0) || j0, top, run);
    const outB = b && await run(['-q', '-p', resynthCommands(top)], { [RESYNTH_FILE]: JSON.stringify(b.json), [SRL_CELLS_FILE]: SRL_CELLS }, () => {});
    const jB = outB?.[`${top}.json`];
    if (jB) {
      const cellsB = cellCounts(jB, top);
      const ns = [criticalDelay(j0, top), criticalDelay(jB, top)], luts = [utilization(cells).luts, utilization(cellsB).luts], sl = [slices(j0), slices(jB)];
      info.bdd = { rounds: b.rounds, cones: b.cones, ns: ns[1], luts: luts[1], slices: sl[1], kept: keepDepth(ns, luts, DEPTH_RULE, sl) };
      if (info.bdd.kept) return { chosen: { ...chosen, ...outB }, cells: cellsB };
    }
  } catch (e) {
    info.bdd = { kept: false, failed: e.message };
    sayNew(`Warning: the critical path's decodes could not be mapped again (${e.message}): the netlist chosen before is kept`);
  }
  return { chosen, cells };
}
