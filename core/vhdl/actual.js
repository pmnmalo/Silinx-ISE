// Silinx elaboration - the actual of a VHDL port (#2565): VHDL-93 wants a static signal name there, a conversion of one, or a
// constant expression (the LRM's association lists). XST rejects an operator on a signal ("Actual, result of operator, …
// is not a Signal", HDLParsers:864) and a name indexed by a signal ("Value i is not static",
// HDLParsers:852), but takes `not s`, a conversion (`std_logic_vector(u)`) and a constant expression
// (`"00" & "11"`, `C + 1`, `-1`).

/**
 * The first part of a port's actual that XST rejects, or null.
 * @param {object} e the actual's expression (the parser's node)
 * @param {(e: object) => boolean} reads whether an expression reads a signal
 * @returns {{ kind: 'operator' | 'index', node: object } | null}
 */
export function actualProblem(e, reads) {
  if (!e || typeof e !== 'object') return null;
  const index = (node, parts) => parts.some(p => p && reads(p)) ? { kind: 'index', node } : null;
  switch (e.op) {
    case 'binary': case 'concat':
      return reads(e) ? { kind: 'operator', node: e } : null;
    case 'unary': return actualProblem(e.a, reads);
    case 'qualified': return actualProblem(e.expr, reads);
    case 'field': return actualProblem(e.base, reads);
    case 'index': return index(e, [e.index]) || actualProblem(e.base, reads);
    case 'slice': return index(e, [e.left, e.right]) || actualProblem(e.base, reads);
    case 'apply': {
      const args = (e.args || []).map(a => a && a.named ? a.value : a);
      // a signal's element (s(i)) or a call (a conversion: its argument is the actual)
      if (reads({ op: 'ref', name: e.name })) return index(e, args);
      for (const a of args) { const p = actualProblem(a, reads); if (p) return p; }
      return null;
    }
    default: return null;
  }
}
