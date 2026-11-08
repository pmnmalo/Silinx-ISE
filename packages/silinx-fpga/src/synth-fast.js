// Silinx toolchain - the synthesis at Optimization Fast (#2470, #3096): Yosys's usual mapping alone (FAST_SYNTH), but for a design
// limited by its depth (DEEP_RULE: more than 16 levels of logic, 1500 LUTs at most), which is synthesized as at Speed too, that
// netlist kept when DEEP_RULE.gain (10 %) faster by the estimate. The usual mapping alone left such designs 3 times as deep as
// XST's at its default (2026-11-08, #3070: epfl-max 57 levels against XST's 17, 68.2 against 25.7 ns; epfl-priority 45 against 18,
// 43.1 against 20.8 ns), the old Normal's rule (#468) left out of Fast.
import { synthesizeVerilog, FAST_SYNTH, criticalDelay, deepDesign, logicLevels, DEEP_RULE } from './synth-open.js';

/** synthesizeVerilog at Optimization Fast: the usual mapping's netlist, or Speed's for a deep design when DEEP_RULE.gain faster
 *  (deepRule: DEEP_RULE, for tests); its messages said; r.fast { levels, usual: { ns, luts }, speed: { ns, luts }, kept: 'usual' |
 *  'speed' } for a deep design (none for the others). */
export async function synthesizeFast(input, options = {}) {
  const { onLine = () => {}, deepRule = DEEP_RULE } = options;
  const lines = [];
  const usual = await synthesizeVerilog(input, { ...options, ...FAST_SYNTH, onLine: l => lines.push(l) });
  const top = usual.top, json = usual.files?.[`${top}.json`];
  if (!json || !deepDesign(json, top, deepRule)) {
    for (const l of lines) onLine(l);
    return usual;
  }
  const linesS = [];
  const { deepRule: _, ...rest } = options;
  const speed = await synthesizeVerilog(input, { ...rest, effort: 'high', onLine: l => linesS.push(l) });
  const ns = [criticalDelay(json, top), criticalDelay(speed.files[`${top}.json`], top)];
  const k = ns[1] <= ns[0] * (1 - deepRule.gain) ? 1 : 0;
  for (const l of k ? linesS : lines) onLine(l);
  const fast = { levels: logicLevels(json, top), usual: { ns: ns[0], luts: usual.util.luts }, speed: { ns: ns[1], luts: speed.util.luts }, kept: k ? 'speed' : 'usual' };
  return { ...(k ? speed : usual), fast };
}
