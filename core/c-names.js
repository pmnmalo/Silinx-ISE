// Silinx HLS: the names of the top's ports as Vitis HLS gives them (#1622, #1902, #1926). A C name that is a reserved
// word of VHDL or Verilog, or one Vitis HLS reserves for its own, is renamed <name>_r (a warning), as Vitis HLS 2025.2
// renames it (test/hls-corpus/vitis-names.json, scripts/hls-vitis-names.mjs), in any letter case. Vitis keeps a few
// words of the languages' lists: those Silinx's HDL compiles with are kept too, the others (units, uwire…) renamed.
// Isomorphic ES module: no DOM and no Node APIs.
import { isReservedWord, breaksHdl } from './reserved.js';

// (beyond the languages' words: SystemC's pos, its ports' read / write / value, the block protocol's ports)
const VITIS_NAMES = new Set(`pos read write value length rst ap_clk ap_rst ap_rst_n ap_start ap_done ap_idle ap_ready
  ap_return ap_continue`.split(/\s+/));
// (the words of core/reserved.js's lists Vitis keeps: VHDL-2008's PSL, SystemVerilog-2009 and later, Verilog's config)
const VITIS_KEPT = new Set(`assume_guarantee fairness restrict_guarantee vmode vprop vunit units implements interconnect
  nettype soft untyped incdir include uwire rtranif1`.split(/\s+/));

const lower = (n) => String(n).toLowerCase();
const breaks = (n) => breaksHdl(n, 'vhdl') || breaksHdl(lower(n), 'verilog');

/** Whether Vitis HLS names the port of a C name <name>_r. */
export const vitisRenames = (n) => VITIS_NAMES.has(lower(n)) || (isReservedWord(n) && !VITIS_KEPT.has(lower(n)));

/** Whether the port of a C name is renamed <name>_r: as Vitis HLS, and a word Vitis keeps that Silinx's HDL does not
 *  compile with. */
export const renamed = (n) => vitisRenames(n) || breaks(n);

/** The port's name of a C name. */
export const portOf = (n) => (renamed(n) ? `${n}_r` : n);

/** Why a C name is renamed (its warning's message), or null. */
export function renamedWhy(n) {
  if (!renamed(n)) return null;
  if (!vitisRenames(n)) return `'${n}' is a reserved word of VHDL or Verilog: it is named ${n}_r in the module (Vitis HLS names it ${n})`;
  if (isReservedWord(n)) return `'${n}' is a reserved word of VHDL or Verilog: it is named ${n}_r in the module`;
  return `'${n}' is a name Vitis HLS reserves: it is named ${n}_r in the module`;
}

/** Whether a function's body has #pragma HLS INTERFACE <mode> port=return (or mode=<mode>). */
function ctrlIs(fn, mode) {
  return (fn.body?.items || []).some((st) => {
    if (st.kind !== 'pragma' || st.pragma.name !== 'INTERFACE' || st.pragma.args.port !== 'return') return false;
    const a = st.pragma.args;
    return String(a.mode || Object.keys(a).find((k) => /^ap_/.test(k)) || '').toLowerCase() === mode;
  });
}
export const ctrlNone = (fn) => ctrlIs(fn, 'ap_ctrl_none');
export const ctrlChain = (fn) => ctrlIs(fn, 'ap_ctrl_chain');
