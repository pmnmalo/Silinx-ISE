// Silinx toolchain - the synthesis at Optimization Goal Area (#2470): Yosys's usual mapping alone (FAST_SYNTH) and the
// synthesis as at Speed side by side, the smaller netlist kept: by its slices, then its LUTs. Neither is always the smaller:
// the mappings for speed give stopwatch 196 LUTs against the usual mapping's 224, the usual mapping clock 207 against 215.
import { synthesizeVerilog, sliceCount, FAST_SYNTH } from './synth-open.js';

const size = r => {
  const json = r.files?.[`${r.top}.json`];
  const slices = json ? sliceCount(json, r.top) : NaN;
  return { slices: Number.isFinite(slices) ? slices : null, luts: r.util.luts };
};
const smaller = (a, b) => (a.slices != null && b.slices != null && a.slices !== b.slices ? a.slices < b.slices : a.luts < b.luts);

/** synthesizeVerilog at Optimization Goal Area: the smaller of the usual mapping's netlist and Speed's (Speed's when smaller only),
 *  its messages said; r.area { usual, speed: { slices, luts }, kept: 'usual' | 'speed' }. */
export async function synthesizeArea(input, options = {}) {
  const { onLine = () => {} } = options;
  const lines = [[], []];
  const [usual, speed] = await Promise.all([
    synthesizeVerilog(input, { ...options, ...FAST_SYNTH, onLine: l => lines[0].push(l) }),
    synthesizeVerilog(input, { ...options, onLine: l => lines[1].push(l) })]);
  const s = [size(usual), size(speed)];
  const k = smaller(s[1], s[0]) ? 1 : 0;
  for (const l of lines[k]) onLine(l);
  return { ...(k ? speed : usual), area: { usual: s[0], speed: s[1], kept: k ? 'speed' : 'usual' } };
}
