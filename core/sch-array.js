// Silinx - an arrayed instance (#3755), as ISE's schematic makes one: a module's instance named with a range, reg(3:0)
// (or reg[3:0]), is that many copies of its module, reg_3 … reg_0. Each pin of width w connected to a net of N × w bits
// (N copies) takes its slice of the net for each copy, the copy of index i the bits of its place from the net's low end
// (reg(3:0)'s D on D(3:0): reg_i's D is D(i)); a pin connected to a net of w bits is shared by every copy (a clock, an
// enable). The generated VHDL and Verilog write the copies one by one (core/schdoc-hdl-more.js). An output shared by
// the copies drives its net N times: an error. Isomorphic (no DOM).

const RANGE = /^([A-Za-z][A-Za-z0-9_]*)\s*[([]\s*(\d+)\s*:\s*(\d+)\s*[)\]]$/;
const MAX_COPIES = 1024;

/** An instance name with a range: { base, msb, lsb, n, indices (msb first) }, else null. */
export function arrayName(name) {
  const m = RANGE.exec(String(name ?? '').trim());
  if (!m) return null;
  const msb = +m[2], lsb = +m[3], n = Math.abs(msb - lsb) + 1;
  if (n > MAX_COPIES) return null;
  const step = msb >= lsb ? -1 : 1;
  return { base: m[1], msb, lsb, n, indices: Array.from({ length: n }, (_, k) => msb + k * step) };
}

/** The array of an instance (a module's, named with a range of 2 copies or more), else null. */
export function arrayOf(sym) {
  if (sym?.type !== 'module') return null;
  const a = arrayName(sym.name);
  return a && a.n > 1 ? a : null;
}

/** The name of copy `i` of an array: reg_3. */
export const copyName = (a, i) => `${a.base}_${i}`;

/**
 * The widths of a net's arrayed pins (netlist(), each endpoint { kind, dir, width, arr }): a pin is sliced when the
 * net's other widths (its I/O markers', labels', other pins') have its N × w bits, or, with none, when an arrayed
 * output is on it; its width then N × w (set on the endpoint, with sliced: true). Returns the endpoints of shared
 * arrayed outputs (each copy driving the net: an error).
 */
export function sliceArrayed(eps, otherWidths) {
  const arr = eps.filter(e => e.kind === 'pin' && e.arr > 1);
  if (!arr.length) return [];
  const others = [...otherWidths, ...eps.filter(e => !arr.includes(e) && e.kind === 'pin').map(e => e.width)].filter(w => typeof w === 'number');
  const anyOut = arr.some(e => e.dir === 'out');
  for (const e of arr) {
    const wide = (e.width || 1) * e.arr;
    if (others.length ? others.includes(wide) : anyOut) { e.width = wide; e.sliced = true; }
  }
  return arr.filter(e => e.dir === 'out' && !e.sliced);
}

/** The HDL slice of copy number k (0: the low end) of a pin `w` bits wide on a net whose signal is `name`, its bits
 *  from `off` (its low index). */
export function sliceOf(name, off, k, w, vhdl) {
  const lo = off + k * w, hi = lo + w - 1;
  return vhdl ? (w === 1 ? `${name}(${lo})` : `${name}(${hi} downto ${lo})`) : (w === 1 ? `${name}[${lo}]` : `${name}[${hi}:${lo}]`);
}
