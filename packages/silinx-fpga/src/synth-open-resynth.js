// The open synthesis's last depth candidates (#405: out of withDepth in core/synth-open-depth.js), each kept by
// DEPTH_RULE: the netlist chosen of all the others with its critical LUTs made one level shallower, their fan-out kept
// (core/lut-resynth.js), then with its critical path's wide decodes collapsed and mapped again (#1360,
// core/synth-open-bdd.js).
import { asText } from './synth-open-yosys.js';
import { criticalDelay, pathEnds } from './synth-open-path.js';
import { resynthCritical } from './lut-resynth.js';
import { bddRemap } from './synth-open-bdd.js';
import {
  DEPTH_RULE, RESYNTH_FILE, SPEED_RULE, SRL_CELLS, SRL_CELLS_FILE, cellCounts, keepDepth, resynthCommands, utilization
} from './synth-open.js';

/** The critical-LUT resynthesis of withDepth's chosen netlist (its ctx: run, speed, top, withResynth; its state: chosen,
 *  cells, info (info.resynth set), slices(json), sayNew(line)): { chosen, cells }, the new ones when it is kept. */
export async function resynthStage({ run, speed, top, withResynth }, { chosen, cells, info, slices, sayNew }) {
  // the chosen netlist's critical LUTs made one level shallower, their fan-out kept (#652, core/lut-resynth.js): the
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
  }
  return { chosen, cells };
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
