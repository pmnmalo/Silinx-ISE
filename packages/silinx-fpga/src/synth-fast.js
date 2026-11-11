// Silinx toolchain - the synthesis at Optimization Fast (#2470, #3096): Yosys's usual mapping alone (FAST_SYNTH), but for a design
// limited by its depth (DEEP_RULE: more than 16 levels of logic, 1500 LUTs at most), which is synthesized as at Speed too, that
// netlist kept when DEEP_RULE.gain (10 %) faster by the estimate. The usual mapping alone left such designs 3 times as deep as
// XST's at its default (2026-11-08, #3070: epfl-max 57 levels against XST's 17, 68.2 against 25.7 ns; epfl-priority 45 against 18,
// 43.1 against 20.8 ns), the old Normal's rule (#468) left out of Fast.
// The usual mapping's netlist then has its critical LUTs made one level shallower, their fan-out kept (#652, synth-open-resynth.js:
// no mapping, the netlist's LUTs rebuilt from their cones), kept by DEPTH_RULE as at Speed: the usual mapping follows a short control
// path as it is written, a LUT level more than XST's (spi-fpga-slave's enable, 3 levels against 2).
import { synthesizeVerilog, FAST_SYNTH, criticalDelay, deepDesign, logicLevels, sliceCount, utilization, DEEP_RULE, LUT4_FAMILIES, YOSYS_FAMILY } from './synth-open.js';
import { resynthStage } from './synth-open-resynth.js';

// the usual mapping's result with its critical LUTs made shallower when DEPTH_RULE keeps it (r.depth.resynth, r.depth.domains), on
// the 4-input-LUT families as at Speed; its warning when that fails said (onLine) and in r.warnings, the netlist kept as it was
async function shallower(r, { run, family = 'spartan3e', onLine = () => {} }) {
  const top = r.top, json = r.files?.[`${top}.json`];
  if (!json || !run || !LUT4_FAMILIES.has(YOSYS_FAMILY[family])) return r;
  const info = { ...r.depth }, said = [];
  const { chosen, cells } = await resynthStage({ run, speed: true, top, withResynth: true },
    { chosen: r.files, cells: r.cells, info, slices: j => sliceCount(j, top), sayNew: l => { said.push(l); onLine(l); } });
  const warnings = [...r.warnings, ...said], log = [...r.log, ...said];
  if (chosen === r.files) return { ...r, warnings, log, depth: info };
  const files = { ...r.files, [`${top}.json`]: chosen[`${top}.json`], [`${top}_yosys.v`]: chosen[`${top}_yosys.v`] || '', [`${top}_stat.txt`]: chosen[`${top}_stat.txt`] || '' };
  return { ...r, files, cells, util: utilization(cells), warnings, log, depth: info };
}

/** synthesizeVerilog at Optimization Fast: the usual mapping's netlist, or Speed's for a deep design when DEEP_RULE.gain faster
 *  (deepRule: DEEP_RULE, for tests); its messages said; r.fast { levels, usual: { ns, luts }, speed: { ns, luts }, kept: 'usual' |
 *  'speed' } for a deep design (none for the others); the usual mapping's netlist with its critical LUTs made shallower when DEPTH_RULE
 *  keeps it (r.depth.resynth, #652). */
export async function synthesizeFast(input, options = {}) {
  const { onLine = () => {}, deepRule = DEEP_RULE } = options;
  const lines = [];
  const usual = await synthesizeVerilog(input, { ...options, ...FAST_SYNTH, onLine: l => lines.push(l) });
  const top = usual.top, json = usual.files?.[`${top}.json`];
  if (!json || !deepDesign(json, top, deepRule)) {
    for (const l of lines) onLine(l);
    return shallower(usual, options);
  }
  const linesS = [];
  const { deepRule: _, ...rest } = options;
  const speed = await synthesizeVerilog(input, { ...rest, effort: 'high', onLine: l => linesS.push(l) });
  const ns = [criticalDelay(json, top), criticalDelay(speed.files[`${top}.json`], top)];
  const k = ns[1] <= ns[0] * (1 - deepRule.gain) ? 1 : 0;
  for (const l of k ? linesS : lines) onLine(l);
  const fast = { levels: logicLevels(json, top), usual: { ns: ns[0], luts: usual.util.luts }, speed: { ns: ns[1], luts: speed.util.luts }, kept: k ? 'speed' : 'usual' };
  return k ? { ...speed, fast } : { ...(await shallower(usual, options)), fast };
}
