// Silinx HLS: the names of the top's ports as Vitis HLS gives them (#1622, #1902). A C name that is a reserved word of
// VHDL or Verilog, or one Vitis HLS reserves for its own, is renamed <name>_r (a warning), as Vitis HLS renames it:
// pos and neg, SystemC's edges of a clock port (sc_in<bool>::pos(), neg()), Vitis HLS's RTL having been SystemC too.
// Isomorphic ES module: no DOM and no Node APIs.
import { isReservedWord } from './reserved.js';

const VITIS_NAMES = new Set(['pos', 'neg']);

/** Whether the port of a C name is renamed <name>_r. */
export const renamed = (n) => isReservedWord(n) || VITIS_NAMES.has(String(n).toLowerCase());

/** The port's name of a C name. */
export const portOf = (n) => (renamed(n) ? `${n}_r` : n);

/** Why a C name is renamed (its warning's message), or null. */
export function renamedWhy(n) {
  if (isReservedWord(n)) return `'${n}' is a reserved word of VHDL or Verilog: it is named ${n}_r in the module`;
  return renamed(n) ? `'${n}' is a name Vitis HLS reserves: it is named ${n}_r in the module` : null;
}

/** Whether a function's body has #pragma HLS INTERFACE ap_ctrl_none port=return (or mode=ap_ctrl_none). */
export function ctrlNone(fn) {
  return (fn.body?.items || []).some((st) => {
    if (st.kind !== 'pragma' || st.pragma.name !== 'INTERFACE' || st.pragma.args.port !== 'return') return false;
    const a = st.pragma.args;
    return String(a.mode || Object.keys(a).find((k) => /^ap_/.test(k)) || '').toLowerCase() === 'ap_ctrl_none';
  });
}
