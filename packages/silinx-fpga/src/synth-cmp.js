// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only (NOTICE)
// Comparisons with a constant as logic (#3097). synth_xilinx's coarse step maps a comparison of a signal with a
// constant onto one LUT when the signal is 4 bits or fewer (cmp2lut), else onto a carry chain (cmp2lcu): a MUXCY a
// stage, its S and DI each a LUT of the signal's bits. A design that compares one signal with many constants (itc99's
// b05, `TM > 99`, `TM > 89`, …, 40 of them on a 9-bit TM) has as many short chains, whose S LUTs are the same few
// functions of TM's bits: every chain needs its own (a LUT drives the S of one slice's MUXCY), so nextpnr's packer
// copies them (127 LUTs on b05), and a chain of 3 stages leaves half a slice empty. As logic, ABC shares the
// comparisons' terms and maps them on the LUTs alone (as XST does). A comparison alone keeps its chain, faster than
// the logic on a wide signal (the T80's two, as logic: 12 % slower, 15 % more slices, by the choices of the mappings
// after). CMP_MAP (the file CMP_FILE given to Yosys) maps such a comparison, the signal wider than 4 bits, onto gates
// before the coarse step: from the lowest bit up, the signal greater (or not less) than the constant on the bits so
// far, signed operands with their sign bits inverted. The comparisons mapped (the file CMP_SET_FILE) are those of a
// signal compared with two constants or more, and those that are an OR of the signal's high bits (sharedComparisons),
// found by a run up to the coarse step (probeComparisons); the design is synthesized with them so and as before, and
// the one keepCmp prefers kept (cmpChoice).
import { asText } from './synth-open-yosys.js';

export const CMP_FILE = 'silinx_cmp_map.v';
export const CMP_MAP = `// Silinx: a comparison of a signal with a constant as gates (#3097)
(* techmap_celltype = "$lt $le $gt $ge" *)
module _silinx_cmp_const (A, B, Y);
  parameter A_SIGNED = 0;
  parameter B_SIGNED = 0;
  parameter A_WIDTH = 1;
  parameter B_WIDTH = 1;
  parameter Y_WIDTH = 1;
  parameter _TECHMAP_CELLTYPE_ = "";
  parameter _TECHMAP_CONSTMSK_A_ = 0;
  parameter _TECHMAP_CONSTVAL_A_ = 0;
  parameter _TECHMAP_CONSTMSK_B_ = 0;
  parameter _TECHMAP_CONSTVAL_B_ = 0;
  input [A_WIDTH-1:0] A;
  input [B_WIDTH-1:0] B;
  output [Y_WIDTH-1:0] Y;
  localparam CA = &_TECHMAP_CONSTMSK_A_;
  localparam CB = &_TECHMAP_CONSTMSK_B_;
  // the signal X compared with the constant C: X > C (GT) or X >= C, the result inverted (NOT) for X < C, X <= C
  localparam SWAP = CA && !CB;
  localparam XW = SWAP ? B_WIDTH : A_WIDTH;
  localparam CW = SWAP ? A_WIDTH : B_WIDTH;
  localparam W = XW > CW ? XW : CW;
  localparam SIGNED = A_SIGNED && B_SIGNED;
  localparam [CW-1:0] CV = SWAP ? _TECHMAP_CONSTVAL_A_ : _TECHMAP_CONSTVAL_B_;
  localparam LT = _TECHMAP_CELLTYPE_ == "$lt", LE = _TECHMAP_CELLTYPE_ == "$le", GT = _TECHMAP_CELLTYPE_ == "$gt";
  // X op C: A op B, or B op' A with the operands swapped
  localparam XGT = SWAP ? (LT || LE) : (GT || !(LT || LE));
  localparam STRICT = LT || GT;
  // X > C: GT strict; X >= C: not strict; X < C = !(X >= C); X <= C = !(X > C)
  localparam CHAIN_GT = XGT ? STRICT : !STRICT;
  localparam NOT = !XGT;
  wire _TECHMAP_FAIL_ = !(CA ^ CB) || XW <= 4;
  wire [XW-1:0] xs = SWAP ? B : A;
  wire [W-1:0] x;
  generate if (XW < W) begin : ext
    assign x = {{(W-XW){SIGNED ? xs[XW-1] : 1'b0}}, xs};
  end else begin : same
    assign x = xs;
  end endgenerate
  function cbit(input integer i);
    cbit = i < CW ? CV[i] : (SIGNED ? CV[CW-1] : 1'b0);
  endfunction
  wire [W:0] g;
  assign g[0] = !CHAIN_GT;
  genvar i;
  generate for (i = 0; i < W; i = i + 1) begin : bit
    wire xi = (SIGNED && i == W-1) ? !x[i] : x[i];
    if ((SIGNED && i == W-1) ? !cbit(i) : cbit(i)) begin : one
      assign g[i+1] = xi & g[i];
    end else begin : zero
      assign g[i+1] = xi | g[i];
    end
  end endgenerate
  assign Y = {{(Y_WIDTH-1){1'b0}}, NOT ? !g[W] : g[W]};
endmodule
`;
export const CMP_SET_FILE = 'silinx_cmp.txt';
export const CMP_PROBE_FILE = 'silinx_cmp.json';
// synth_xilinx's steps, in order
const LABELS = ['begin', 'prepare', 'map_dsp', 'coarse', 'map_memory', 'map_ffram', 'fine', 'map_cells', 'map_ffs', 'map_luts', 'finalize', 'check', 'edif', 'blif', 'json'];
const COARSE = LABELS.indexOf('coarse');
const CMP_TYPES = ['$lt', '$le', '$gt', '$ge'];
/** The commands of the run that finds the comparisons (`read`: the reads of the usual script, `synth`: synth_xilinx's
 *  command): up to the coarse step, the comparison cells written (CMP_PROBE_FILE, Yosys's JSON). */
export const cmpProbeCommands = (read, synth) => `${read}${synth} -run :coarse; select ${CMP_TYPES.map(t => `t:${t}`).join(' ')}; write_json -selected ${CMP_PROBE_FILE}; select -clear`;
// an unsigned comparison that is the OR of the signal's bits from k up (or its negation): X > 2^k - 1, X >= 2^k, X < 2^k,
// X <= 2^k - 1 (X > 0: any bit set), the constant C's bits (Yosys's JSON: the lowest first) and the operator as X op C
const powerOfTwo = n => n > 0n && (n & (n - 1n)) === 0n;
function isReduction(op, bits) {
  const c = bits.reduceRight((v, b) => (v << 1n) | (b === '1' ? 1n : 0n), 0n);
  return op === '$gt' || op === '$le' ? powerOfTwo(c + 1n) : powerOfTwo(c);
}
const SWAPPED = { $lt: '$gt', $le: '$ge', $gt: '$lt', $ge: '$le' };
const signed = c => /1$/.test(String(c.parameters?.A_SIGNED ?? '0')) && /1$/.test(String(c.parameters?.B_SIGNED ?? '0'));
/** The comparisons of the probe's netlist (Yosys's JSON) to map as logic, of a constant and a signal wider than 4 bits:
 *  that signal (its bits) compared with another constant too, or the comparison an OR of the signal's high bits
 *  (unsigned: X > 0, X >= 2^k, …; verilog-uart's `prescale_reg > 0`, 19 bits, a chain of 10 MUXCY); their names, sorted. */
export function sharedComparisons(json, top) {
  const nl = typeof json === 'string' ? JSON.parse(json) : json;
  const mod = nl?.modules?.[top];
  const bySignal = new Map(), reductions = [];
  for (const [name, c] of Object.entries(mod?.cells || {})) {
    if (!CMP_TYPES.includes(c.type)) continue;
    const [a, b] = [c.connections.A, c.connections.B];
    const ca = a.every(x => typeof x === 'string'), cb = b.every(x => typeof x === 'string');
    const x = ca && !cb ? b : cb && !ca ? a : null;
    if (!x || x.length <= 4) continue;
    if (!signed(c) && isReduction(ca ? SWAPPED[c.type] : c.type, ca ? a : b)) reductions.push(name);
    const key = x.join(',');
    bySignal.set(key, [...(bySignal.get(key) || []), name]);
  }
  return [...new Set([...[...bySignal.values()].filter(g => g.length > 1).flat(), ...reductions])].sort();
}
/** The comparisons with a constant to map as logic (`fam`: the Yosys family, null for none): a run up to the coarse step,
 *  read and the files of the reads given (`read`, `files`), sharedComparisons of its netlist; none without a < or > in the
 *  text but those of a `<=` (no run: a design without comparisons keeps its runs), none when the run fails (the
 *  synthesis's own runs say why). */
export async function probeComparisons(top, text, fam, run, read = '', files = {}) {
  if (!fam || !/[<>]/.test(String(text).replaceAll('<=', ''))) return [];
  try {
    const out = await run(['-q', '-p', cmpProbeCommands(`${read}read_verilog -sv ${top}_syn.v; `, `synth_xilinx -family ${fam} -ise -flatten -top ${top}`)],
      { [`${top}_syn.v`]: text, ...files }, () => {});
    return out?.[CMP_PROBE_FILE] ? sharedComparisons(asText(out[CMP_PROBE_FILE]), top) : [];
  } catch { return []; }
}
// The synthesis with the comparisons as logic is kept when it has fewer slices (by Silinx's packer, as the netlists are
// weighed by DEPTH_RULE) and its gain in slices is at least what it loses in speed by the estimate (the mirror of the
// carry-select rule, #1361): the comparisons' carry chains gone change which of the mappings after them is kept, and
// those choices, made on the estimate, may give more slices (itc99-b15: 1303 -> 1317 by the packer, 1233 -> 1394 once
// placed) or a slower path for fewer slices (secworks-sha1: -4.6 % slices, +13.7 % by the estimate, +15 % by the STA);
// itc99-b05 -24 % slices for +8 %, verilog-uart, itc99-b11 smaller and faster.
export const keepCmp = ([n0, n1], [s0, s1]) => [n0, n1, s0, s1].every(Number.isFinite) && s1 < s0 && 1 - s1 / s0 >= n1 / n0 - 1;
/** Of the synthesis as before (`base`) and the one with the comparisons as logic (`cand`, null when it failed), the one
 *  keepCmp keeps, `measure(r)`: [its estimate, its slices]; r.depth.cmp { comparisons, ns, luts, slices, kept }. */
export function cmpChoice(base, cand, comparisons, measure) {
  const info = { comparisons, kept: false };
  if (cand) {
    const [n0, s0] = measure(base), [n1, s1] = measure(cand);
    Object.assign(info, { ns: n1, luts: cand.util.luts, slices: s1, kept: keepCmp([n0, n1], [s0, s1]) });
  }
  return info.kept ? { ...cand, depth: { ...cand.depth, cmp: info } } : { ...base, depth: { ...base.depth, cmp: info } };
}
/** The file of the comparisons to map (CMP_SET_FILE: module/cell, a line each). */
export const cmpSet = (top, names) => names.map(n => `${top}/${n}\n`).join('');
/** The commands with the comparisons listed in CMP_SET_FILE mapped as logic just before synth_xilinx's coarse step (`cmp`:
 *  some listed; none, the commands as they are): each `synth_xilinx … -run <from>:<to>` that runs it (from before it, to
 *  after it) as `… -run <from>:coarse; <the map>; … -run coarse:<to>`. */
export const cmpStep = (cmds, cmp) => (!cmp?.length ? cmds : cmds.replace(/(synth_xilinx [^;]*?) -run (\w*):(\w*)/g, (m, synth, from, to) => {
  const f = from ? LABELS.indexOf(from) : 0, t = to ? LABELS.indexOf(to) : LABELS.length;
  return f < COARSE && t > COARSE
    ? `${synth} -run ${from}:coarse; select -set silinx_cmp -read ${CMP_SET_FILE}; techmap -map ${CMP_FILE} @silinx_cmp; select -clear; ${synth} -run coarse:${to}`
    : m;
}));
